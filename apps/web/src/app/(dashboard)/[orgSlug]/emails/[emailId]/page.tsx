import { auth } from "@wraps/auth";
import { db } from "@wraps/db";
import { awsAccount } from "@wraps/db/schema/app";
import { eq } from "drizzle-orm";
import {
  ArrowLeft,
  Check,
  Clock,
  Mail,
  MousePointerClick,
  X,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EmailArchiveViewer } from "@/components/email-archive-viewer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { queryEmailEvents } from "@/lib/aws/dynamodb";
import { getOrganizationWithMembership } from "@/lib/organization";
import type { Email, EmailStatus } from "../types";
import { CopyButton } from "./components/copy-button";
import { EventItem } from "./components/event-item";
import { EventTimeline } from "./components/event-timeline";

type EmailDetailPageProps = {
  params: Promise<{
    orgSlug: string;
    emailId: string;
  }>;
};

const EVENT_ICONS = {
  sent: Mail,
  delivered: Check,
  bounced: X,
  complained: X,
  opened: Mail,
  clicked: MousePointerClick,
  failed: X,
  rejected: X,
  rendering_failure: X,
  delivery_delay: Clock,
} as const;

const EVENT_COLORS = {
  sent: "text-blue-500",
  delivered: "text-green-500",
  bounced: "text-red-500",
  complained: "text-red-500",
  opened: "text-purple-500",
  clicked: "text-indigo-500",
  failed: "text-red-500",
  rejected: "text-red-500",
  rendering_failure: "text-red-500",
  delivery_delay: "text-yellow-500",
} as const;

const STATUS_VARIANTS: Record<
  EmailStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  delivered: "default",
  sent: "secondary",
  bounced: "destructive",
  complained: "destructive",
  failed: "destructive",
  opened: "default",
  clicked: "default",
  rejected: "destructive",
  rendering_failure: "destructive",
  delivery_delay: "secondary",
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

async function fetchEmail(
  organizationId: string,
  emailId: string
): Promise<Email | null> {
  try {
    // Search for the email across all accounts (last 90 days)
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 90 * 24 * 60 * 60 * 1000);

    console.log("[fetchEmail] Searching for email:", emailId);

    // Get all AWS accounts for this organization
    const accounts = await db.query.awsAccount.findMany({
      where: eq(awsAccount.organizationId, organizationId),
    });

    console.log("[fetchEmail] Searching across accounts:", accounts.length);

    if (accounts.length === 0) {
      return null;
    }

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
            `[fetchEmail] Failed to fetch emails for account ${account.id}:`,
            error
          );
          return [];
        }
      })
    );

    // Find all events for this messageId
    const emailEvents = allEvents.flat().filter((e) => e.messageId === emailId);

    console.log("[fetchEmail] Found events for email:", emailEvents.length);

    if (emailEvents.length === 0) {
      return null;
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
    return {
      id: emailId,
      messageId: emailId,
      from: firstEvent.from,
      to: firstEvent.to,
      replyTo: undefined,
      subject: firstEvent.subject,
      htmlBody: firstEvent.additionalData
        ? (() => {
            try {
              const data = JSON.parse(firstEvent.additionalData);
              return data.htmlBody || data.textBody || undefined;
            } catch {
              return;
            }
          })()
        : undefined,
      textBody: undefined,
      status: finalStatus,
      sentAt: firstEvent.sentAt,
      events: emailEvents.map((event) => ({
        type: event.eventType.toLowerCase().replace(" ", "_") as EmailStatus,
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
  } catch (error) {
    console.error("[fetchEmail] Error fetching email:", error);
    return null;
  }
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatFullTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

export default async function EmailDetailPage({
  params,
}: EmailDetailPageProps) {
  const { orgSlug, emailId } = await params;
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

  // Fetch actual email directly (not via API to avoid auth issues)
  const email = await fetchEmail(orgWithMembership.id, emailId);

  // If email not found, redirect back to emails list
  if (!email) {
    redirect(`/${orgSlug}/emails`);
  }

  return (
    <>
      {/* Back Button */}
      <div className="px-4 lg:px-6">
        <Button asChild size="sm" variant="ghost">
          <Link href={`/${orgSlug}/emails`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to emails
          </Link>
        </Button>
      </div>

      {/* Page Content */}
      <div className="space-y-6 px-4 lg:px-6">
        {/* Email Envelope Hero - Compact */}
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {/* Subject Line & Status */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h1 className="mb-2 font-bold text-2xl">{email.subject}</h1>
                  <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-sm">
                    <span>{formatFullTimestamp(email.sentAt)}</span>
                    <span>•</span>
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                      {email.messageId}
                    </code>
                    <CopyButton text={email.messageId} />
                  </div>
                </div>
                <Badge
                  className="font-medium"
                  variant={STATUS_VARIANTS[email.status]}
                >
                  {email.status.charAt(0).toUpperCase() + email.status.slice(1)}
                </Badge>
              </div>

              {/* From/To - Compact Grid */}
              <div className="grid gap-3 md:grid-cols-2">
                <div className="flex items-start gap-3 rounded-lg border bg-muted/20 p-3">
                  <div className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                    From
                  </div>
                  <div className="flex-1 break-all font-mono text-sm">
                    {email.from}
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-lg border bg-muted/20 p-3">
                  <div className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                    To
                  </div>
                  <div className="flex-1 break-all font-mono text-sm">
                    {email.to.length > 0 ? (
                      <>
                        {email.to[0]}
                        {email.to.length > 1 && (
                          <Badge className="ml-2 text-xs" variant="secondary">
                            +{email.to.length - 1}
                          </Badge>
                        )}
                      </>
                    ) : (
                      <span className="text-muted-foreground">
                        (no recipients)
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Event Timeline - Collapsible */}
        <EventTimeline eventCount={email.events.length}>
          {email.events.length === 0 ? (
            <div className="text-muted-foreground text-sm">
              No events recorded yet
            </div>
          ) : (
            email.events.map((event, index) => (
              <EventItem
                color={EVENT_COLORS[event.type]}
                event={event}
                formatFullTimestamp={formatFullTimestamp}
                formatTimestamp={formatTimestamp}
                icon={EVENT_ICONS[event.type] || Clock}
                isLast={index === email.events.length - 1}
                key={`${event.type}-${event.timestamp}`}
              />
            ))
          )}
        </EventTimeline>

        {/* Email Archive Viewer */}
        <EmailArchiveViewer
          archivingEnabled={true}
          messageId={email.messageId}
          orgSlug={orgSlug}
        />
      </div>
    </>
  );
}
