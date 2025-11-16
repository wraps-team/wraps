import { auth } from "@wraps/auth";
import { db } from "@wraps/db";
import { awsAccount } from "@wraps/db/schema/app";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import type { EmailStatus } from "@/app/(dashboard)/[orgSlug]/emails/types";
import { queryEmailEvents } from "@/lib/aws/dynamodb";
import { getOrganizationWithMembership } from "@/lib/organization";

type RouteContext = {
  params: Promise<{
    orgSlug: string;
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
    Complaint: "complained",
    Reject: "rejected",
    "Rendering Failure": "rendering_failure",
    RenderingFailure: "rendering_failure",
    DeliveryDelay: "delivery_delay",
  };
  return (mapping[eventType] as EmailStatus) || "sent";
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { orgSlug } = await context.params;

    console.log("[API /emails] Request received for org:", orgSlug);

    // Authenticate user
    const session = await auth.api.getSession({
      headers: await import("next/headers").then((mod) => mod.headers()),
    });

    if (!session?.user) {
      console.log("[API /emails] Unauthorized - no session");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify organization membership
    const orgWithMembership = await getOrganizationWithMembership(
      orgSlug,
      session.user.id
    );

    if (!orgWithMembership) {
      console.log("[API /emails] Forbidden - not a member");
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const days = Number.parseInt(searchParams.get("days") || "7", 10);
    const limit = Number.parseInt(searchParams.get("limit") || "100", 10);

    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - days * 24 * 60 * 60 * 1000);

    console.log("[API /emails] Query params:", {
      days,
      limit,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
    });

    // Get all AWS accounts for this organization
    const accounts = await db.query.awsAccount.findMany({
      where: eq(awsAccount.organizationId, orgWithMembership.id),
    });

    console.log("[API /emails] Found accounts:", accounts.length);

    if (accounts.length === 0) {
      console.log("[API /emails] No accounts found, returning empty array");
      return NextResponse.json([]);
    }

    // Fetch email events from all accounts
    const allEvents = await Promise.all(
      accounts.map(async (account) => {
        try {
          return await queryEmailEvents({
            awsAccountId: account.id,
            startTime,
            endTime,
            limit: 500, // Get more to aggregate by message
          });
        } catch (error) {
          console.error(
            `Failed to fetch emails for account ${account.id}:`,
            error
          );
          return [];
        }
      })
    );

    // Group events by messageId
    const emailsMap = new Map<
      string,
      {
        id: string;
        messageId: string;
        from: string;
        to: string[];
        subject: string;
        status: EmailStatus;
        sentAt: number;
        eventTypes: Set<string>;
        hasOpened: boolean;
        hasClicked: boolean;
      }
    >();

    for (const events of allEvents) {
      for (const event of events) {
        const existing = emailsMap.get(event.messageId);

        if (existing) {
          existing.eventTypes.add(event.eventType);
          if (event.eventType === "Open") {
            existing.hasOpened = true;
          }
          if (event.eventType === "Click") {
            existing.hasClicked = true;
          }

          // Update status to most significant event
          const newStatus = mapEventTypeToStatus(event.eventType);
          const statusPriority: EmailStatus[] = [
            "clicked",
            "complained",
            "bounced",
            "opened",
            "delivered",
            "sent",
            "failed",
            "rejected",
            "rendering_failure",
            "delivery_delay",
          ];

          const currentPriority = statusPriority.indexOf(existing.status);
          const newPriority = statusPriority.indexOf(newStatus);

          if (newPriority < currentPriority) {
            existing.status = newStatus;
          }
        } else {
          emailsMap.set(event.messageId, {
            id: event.messageId,
            messageId: event.messageId,
            from: event.from,
            to: event.to,
            subject: event.subject,
            status: mapEventTypeToStatus(event.eventType),
            sentAt: event.sentAt,
            eventTypes: new Set([event.eventType]),
            hasOpened: event.eventType === "Open",
            hasClicked: event.eventType === "Click",
          });
        }
      }
    }

    // Convert to array and sort by sentAt (newest first)
    const emails = Array.from(emailsMap.values())
      .map((email) => ({
        id: email.id,
        messageId: email.messageId,
        from: email.from,
        to: email.to,
        subject: email.subject,
        status: email.status,
        sentAt: email.sentAt,
        eventCount: email.eventTypes.size,
        hasOpened: email.hasOpened,
        hasClicked: email.hasClicked,
      }))
      .sort((a, b) => b.sentAt - a.sentAt)
      .slice(0, limit);

    return NextResponse.json(emails);
  } catch (error) {
    console.error("Error fetching emails:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
