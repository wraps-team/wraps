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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { queryEmailEvents } from "@/lib/aws/dynamodb";
import { getOrganizationWithMembership } from "@/lib/organization";
import type { Email, EmailStatus } from "../types";
import { CopyButton } from "./components/copy-button";

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
        {/* Email Metadata */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex-1 space-y-1.5">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-2xl">{email.subject}</CardTitle>
                  <Badge variant={STATUS_VARIANTS[email.status]}>
                    {email.status.charAt(0).toUpperCase() +
                      email.status.slice(1)}
                  </Badge>
                </div>
                <CardDescription className="font-mono text-xs">
                  {email.messageId}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <div className="text-muted-foreground text-sm">FROM</div>
                <div className="font-mono text-sm">{email.from}</div>
              </div>
              <div className="space-y-1">
                <div className="text-muted-foreground text-sm">TO</div>
                <div className="font-mono text-sm">
                  {email.to.length > 0 ? (
                    <>
                      {email.to[0]}
                      {email.to.length > 1 && (
                        <span className="text-muted-foreground">
                          {" "}
                          +{email.to.length - 1} other
                          {email.to.length > 2 ? "s" : ""}
                        </span>
                      )}
                    </>
                  ) : (
                    "(no recipients)"
                  )}
                </div>
              </div>
              {email.replyTo && (
                <div className="space-y-1">
                  <div className="text-muted-foreground text-sm">REPLY-TO</div>
                  <div className="font-mono text-sm">{email.replyTo}</div>
                </div>
              )}
              <div className="space-y-1">
                <div className="text-muted-foreground text-sm">ID</div>
                <div className="flex items-center gap-2">
                  <code className="rounded bg-muted px-2 py-1 font-mono text-xs">
                    {email.id}
                  </code>
                  <CopyButton text={email.id} />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Event Timeline */}
        <Card>
          <CardHeader>
            <CardTitle>Email Events</CardTitle>
            <CardDescription>
              Lifecycle of this email from send to delivery
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {email.events.length === 0 ? (
                <div className="text-muted-foreground text-sm">
                  No events recorded yet
                </div>
              ) : (
                email.events.map((event, index) => {
                  const Icon = EVENT_ICONS[event.type] || Clock;
                  const isLast = index === email.events.length - 1;

                  return (
                    <div key={`${event.type}-${event.timestamp}`}>
                      <div className="flex gap-4">
                        <div className="flex flex-col items-center">
                          <div
                            className={`rounded-full border-2 border-background bg-muted p-2 ${EVENT_COLORS[event.type]}`}
                          >
                            <Icon className="h-4 w-4" />
                          </div>
                          {!isLast && (
                            <div className="my-1 w-px flex-1 bg-border" />
                          )}
                        </div>
                        <div className="flex-1 pb-6">
                          <div className="flex items-center justify-between">
                            <div className="font-medium capitalize">
                              {event.type.replace("_", " ")}
                            </div>
                            <div className="text-muted-foreground text-sm">
                              {formatTimestamp(event.timestamp)}
                            </div>
                          </div>
                          <div className="text-muted-foreground text-sm">
                            {formatFullTimestamp(event.timestamp)}
                          </div>
                          {event.metadata &&
                            Object.keys(event.metadata).length > 0 && (
                              <div className="mt-2 rounded-md border bg-muted/50 p-2 font-mono text-xs">
                                <pre className="overflow-x-auto">
                                  {JSON.stringify(event.metadata, null, 2)}
                                </pre>
                              </div>
                            )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
