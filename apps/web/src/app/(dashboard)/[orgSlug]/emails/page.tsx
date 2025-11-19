import { auth } from "@wraps/auth";
import { db } from "@wraps/db";
import { awsAccount } from "@wraps/db/schema/app";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import type { EmailStatus } from "@/app/(dashboard)/[orgSlug]/emails/types";
import { queryEmailEvents } from "@/lib/aws/dynamodb";
import { getOrganizationWithMembership } from "@/lib/organization";
import { EmailsTable } from "./components/emails-table";
import type { EmailListItem } from "./types";

type EmailsPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
  searchParams: Promise<{
    days?: string;
    limit?: string;
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

async function fetchEmails(
  organizationId: string,
  days = 7,
  limit = 100
): Promise<EmailListItem[]> {
  try {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - days * 24 * 60 * 60 * 1000);

    console.log("[fetchEmails] Fetching emails for org:", organizationId);

    // Get all AWS accounts for this organization
    const accounts = await db.query.awsAccount.findMany({
      where: eq(awsAccount.organizationId, organizationId),
    });

    console.log("[fetchEmails] Found accounts:", accounts.length);

    if (accounts.length === 0) {
      return [];
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
            `[fetchEmails] Failed to fetch emails for account ${account.id}:`,
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

          // Always use the earliest sentAt (should be consistent, but this ensures it)
          if (event.sentAt < existing.sentAt) {
            existing.sentAt = event.sentAt;
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

    console.log("[fetchEmails] Returning emails:", emails.length);
    return emails;
  } catch (error) {
    console.error("[fetchEmails] Error fetching emails:", error);
    return [];
  }
}

export default async function EmailsPage({
  params,
  searchParams,
}: EmailsPageProps) {
  const { orgSlug } = await params;
  const { days = "7", limit = "100" } = await searchParams;

  const session = await auth.api.getSession({
    headers: await import("next/headers").then((mod) => mod.headers()),
  });

  if (!session?.user) {
    redirect("/auth");
  }

  const orgWithMembership = await getOrganizationWithMembership(
    orgSlug,
    session.user.id
  );

  if (!orgWithMembership) {
    redirect("/dashboard");
  }

  // Fetch actual emails directly
  const emails = await fetchEmails(
    orgWithMembership.id,
    Number.parseInt(days, 10),
    Number.parseInt(limit, 10)
  );

  return (
    <>
      {/* Page Title and Description */}
      <div className="px-4 lg:px-6">
        <div className="flex flex-col gap-2">
          <h1 className="font-bold text-2xl tracking-tight">Emails</h1>
          <p className="text-muted-foreground">
            View and manage your email sending history
          </p>
        </div>
      </div>

      {/* Emails Table */}
      <div className="@container/main px-4 lg:px-6">
        <EmailsTable data={emails} orgSlug={orgSlug} />
      </div>
    </>
  );
}
