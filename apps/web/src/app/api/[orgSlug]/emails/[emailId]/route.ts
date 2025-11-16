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
    Complaint: "complained",
    Reject: "rejected",
    "Rendering Failure": "rendering_failure",
    RenderingFailure: "rendering_failure",
    DeliveryDelay: "delivery_delay",
  };
  return (mapping[eventType] as EmailStatus) || "sent";
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

    // Get all AWS accounts for this organization
    const accounts = await db.query.awsAccount.findMany({
      where: eq(awsAccount.organizationId, orgWithMembership.id),
    });

    if (accounts.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Search for the email across all accounts (last 90 days)
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 90 * 24 * 60 * 60 * 1000);

    // Fetch events from all accounts and find the matching email
    const allEvents = await Promise.all(
      accounts.map(async (account) => {
        try {
          return await queryEmailEvents({
            awsAccountId: account.id,
            startTime,
            endTime,
            limit: 1000,
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

    // Find all events for this messageId
    const emailEvents = allEvents.flat().filter((e) => e.messageId === emailId);

    if (emailEvents.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Sort events by timestamp
    emailEvents.sort((a, b) => a.sentAt - b.sentAt);

    // Get the first event for basic details
    const firstEvent = emailEvents[0];

    // Determine the final status based on most significant event
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

    // Build the email detail response
    const email = {
      id: emailId,
      messageId: emailId,
      from: firstEvent.from,
      to: firstEvent.to,
      subject: firstEvent.subject,
      status: finalStatus,
      sentAt: firstEvent.sentAt,
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
    console.error("Error fetching email detail:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
