import { auth } from "@wraps/auth";
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

async function fetchEmail(
  orgSlug: string,
  emailId: string
): Promise<Email | null> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const url = new URL(`/api/${orgSlug}/emails/${emailId}`, baseUrl);

    const response = await fetch(url.toString(), {
      cache: "no-store",
    });

    if (!response.ok) {
      console.error("Failed to fetch email:", response.statusText);
      return null;
    }

    const data = await response.json();

    // Transform API response to Email type
    return {
      id: data.id,
      messageId: data.messageId,
      from: data.from,
      to: data.to,
      replyTo: data.replyTo,
      subject: data.subject,
      htmlBody: data.body,
      textBody: data.body,
      status: data.status,
      sentAt: data.sentAt,
      events: data.events.map(
        (event: {
          type: string;
          timestamp: number;
          metadata?: Record<string, unknown>;
        }) => ({
          type: event.type.toLowerCase().replace(" ", "_"),
          timestamp: event.timestamp,
          metadata: event.metadata,
        })
      ),
    };
  } catch (error) {
    console.error("Error fetching email:", error);
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

  // Fetch actual email from API
  const email = await fetchEmail(orgSlug, emailId);

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
                  {email.to.length > 0
                    ? email.to.join(", ")
                    : "(no recipients)"}
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
