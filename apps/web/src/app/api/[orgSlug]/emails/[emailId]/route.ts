import { auth } from "@wraps/auth";
import { db } from "@wraps/db";
import { awsAccount } from "@wraps/db/schema/app";
import { messageSend } from "@wraps/db/schema/batch";
import { and, eq, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import type { EmailStatus } from "@/app/(dashboard)/[orgSlug]/emails/types";
import { queryEmailEvents, queryEventsByMessageIds } from "@/lib/aws/dynamodb";
import { createRequestLogger } from "@/lib/logger";
import { getOrganizationWithMembership } from "@/lib/organization";

type RouteContext = {
  params: Promise<{
    orgSlug: string;
    emailId: string;
  }>;
};

// Map SES event types to our EmailStatus
function mapEventTypeToStatus(eventType: string): EmailStatus {
  const mapping: Record<string, EmailStatus> = {
    Send: "sent",
    Delivery: "delivered",
    Open: "opened",
    Click: "clicked",
    Bounce: "bounced",
    Suppressed: "suppressed",
    Complaint: "complained",
    Reject: "rejected",
    "Rendering Failure": "rendering_failure",
    RenderingFailure: "rendering_failure",
    DeliveryDelay: "delivery_delay",
  };
  return (mapping[eventType] as EmailStatus) || "sent";
}

function pgStatusToEmailStatus(status: string | null | undefined): EmailStatus {
  switch (status) {
    case "pending":
    case "queued":
      return "sent";
    case "opted_out":
      return "suppressed";
    default:
      return (status as EmailStatus) ?? "sent";
  }
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { orgSlug, emailId } = await context.params;

    // Authenticate user
    const session = await auth.api.getSession({
      headers: await import("next/headers").then((mod) => mod.headers()),
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify organization membership
    const orgWithMembership = await getOrganizationWithMembership(
      orgSlug,
      session.user.id
    );

    if (!orgWithMembership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const log = createRequestLogger({
      path: "/api/[orgSlug]/emails/[emailId]",
      method: "GET",
      orgSlug,
    });

    const accounts = await db.query.awsAccount.findMany({
      where: eq(awsAccount.organizationId, orgWithMembership.id),
    });

    if (accounts.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Step 1: time-windowed DynamoDB query (fast path for recent emails)
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 90 * 24 * 60 * 60 * 1000);

    const allEvents = await Promise.all(
      accounts.map(async (account) => {
        try {
          return await queryEmailEvents({
            awsAccountId: account.id,
            organizationId: orgWithMembership.id,
            startTime,
            endTime,
            limit: 1000,
          });
        } catch (error) {
          log.error(
            { err: error, accountId: account.id },
            "Failed to fetch emails for account"
          );
          return [];
        }
      })
    );

    let emailEvents = allEvents.flat().filter((e) => e.messageId === emailId);
    let resolvedMessageId = emailId;

    if (emailEvents.length === 0) {
      // Step 2: PG lookup to get the canonical messageId and account
      const pgRecord = await db
        .select({
          id: messageSend.id,
          messageId: messageSend.messageId,
          awsAccountId: messageSend.awsAccountId,
          from: messageSend.from,
          recipient: messageSend.recipient,
          subject: messageSend.subject,
          status: messageSend.status,
          sentAt: messageSend.sentAt,
        })
        .from(messageSend)
        .where(
          and(
            eq(messageSend.organizationId, orgWithMembership.id),
            eq(messageSend.channel, "email"),
            or(eq(messageSend.id, emailId), eq(messageSend.messageId, emailId))
          )
        )
        .limit(1)
        .then((rows) => rows[0] ?? null);

      if (!pgRecord) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      const realMessageId = pgRecord.messageId ?? emailId;
      resolvedMessageId = realMessageId;
      const pgAccount = accounts.find((a) => a.id === pgRecord.awsAccountId);

      if (pgAccount) {
        // Step 3: direct DynamoDB PK lookup (no time window)
        try {
          const dynEvents = await queryEventsByMessageIds({
            awsAccountId: pgAccount.id,
            organizationId: orgWithMembership.id,
            messageIds: [realMessageId],
          });
          emailEvents = dynEvents;
        } catch {
          // fall through to PG-only
        }
      }

      if (emailEvents.length === 0) {
        // Step 4: PG-only fallback
        if (!pgRecord.sentAt) {
          return NextResponse.json({ error: "Not found" }, { status: 404 });
        }
        return NextResponse.json({
          id: emailId,
          messageId: realMessageId,
          from: pgRecord.from ?? "",
          to: [pgRecord.recipient],
          subject: pgRecord.subject ?? "(no subject)",
          status: pgStatusToEmailStatus(pgRecord.status),
          sentAt: pgRecord.sentAt.getTime(),
          events: [],
        });
      }
    }

    emailEvents.sort((a, b) => a.sentAt - b.sentAt);
    const firstEvent = emailEvents[0];

    const statusPriority: EmailStatus[] = [
      "complained",
      "rendering_failure",
      "rejected",
      "failed",
      "bounced",
      "suppressed",
      "clicked",
      "opened",
      "delivery_delay",
      "delivered",
      "sent",
    ];

    let finalStatus: EmailStatus = "sent";
    let currentPriority = statusPriority.indexOf(finalStatus);

    for (const event of emailEvents) {
      const eventStatus = mapEventTypeToStatus(event.eventType);
      const eventPriority = statusPriority.indexOf(eventStatus);
      if (eventPriority < currentPriority) {
        finalStatus = eventStatus;
        currentPriority = eventPriority;
      }
    }

    const email = {
      id: emailId,
      messageId: resolvedMessageId,
      from: firstEvent.from,
      to: firstEvent.to,
      subject: firstEvent.subject,
      status: finalStatus,
      sentAt: firstEvent.mailSentAt ?? firstEvent.sentAt,
      body: firstEvent.additionalData
        ? (() => {
            try {
              const data = JSON.parse(firstEvent.additionalData);
              return data.htmlBody || data.textBody || undefined;
            } catch {
              return;
            }
          })()
        : undefined,
      events: emailEvents.map((event) => ({
        type: event.eventType,
        timestamp: event.createdAt,
        metadata: event.additionalData
          ? (() => {
              try {
                return JSON.parse(event.additionalData);
              } catch {
                return {};
              }
            })()
          : {},
      })),
    };

    return NextResponse.json(email);
  } catch (error) {
    const { orgSlug } = await context.params;
    createRequestLogger({
      path: "/api/[orgSlug]/emails/[emailId]",
      method: "GET",
      orgSlug,
    }).error({ err: error }, "Error fetching email detail");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
