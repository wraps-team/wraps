import { auth } from "@wraps/auth";
import { db } from "@wraps/db";
import { awsAccount } from "@wraps/db/schema/app";
import { messageSend } from "@wraps/db/schema/batch";
import { Badge } from "@wraps/ui/components/ui/badge";
import { Card, CardContent } from "@wraps/ui/components/ui/card";
import { and, eq, or } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EmailArchiveViewer } from "@/components/email-archive-viewer";
import { Button } from "@/components/ui/button";
import { queryEmailEvents, queryEventsByMessageIds } from "@/lib/aws/dynamodb";
import { isOpenEventBot } from "@/lib/email-bot-detection";
import { logger } from "@/lib/logger";
import { getOrganizationWithMembership } from "@/lib/organization";
import { cn } from "@/lib/utils";
import { getEmailStatusConfig } from "../lib/status-config";
import { formatFullTimestamp } from "../lib/timestamps";
import type { Email, EmailStatus } from "../types";
import { CopyButton } from "./components/copy-button";
import { EmailFields } from "./components/email-fields";
import { EmailUnavailable } from "./components/email-unavailable";
import { EventItem } from "./components/event-item";
import { EventTimeline } from "./components/event-timeline";
import { TimelineState } from "./components/timeline-state";
import {
  classifyLookupError,
  classifyTimelineFailure,
  type EmailLookupFailure,
  type EmailTimelineState,
} from "./lookup";

type EmailDetailPageProps = {
  params: Promise<{
    orgSlug: string;
    emailId: string;
  }>;
  /**
   * The filters the list was showing when this message was opened, carried on
   * the row's link. "Back to emails" used to be a bare list URL, so triaging
   * bounces over 30 days and opening one message dropped you back into the
   * default 7-day, all-status view (audit F8).
   */
  searchParams: Promise<{
    days?: string;
    q?: string;
    sort?: string;
    status?: string;
  }>;
};

type EmailLookupResult =
  | {
      ok: true;
      email: Email & { archivingEnabled: boolean };
      timeline: EmailTimelineState;
    }
  | ({ ok: false } & EmailLookupFailure);

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
    Suppressed: "suppressed",
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

function buildEmailFromEvents(
  emailId: string,
  emailEvents: any[],
  archivingEnabled: boolean
): Email & { archivingEnabled: boolean } {
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
    if (event.eventType === "Open" && isOpenEventBot(event.additionalData)) {
      continue;
    }
    const eventStatus = mapEventTypeToStatus(event.eventType);
    const eventPriority = statusPriority.indexOf(eventStatus);
    if (eventPriority < currentPriority) {
      finalStatus = eventStatus;
      currentPriority = eventPriority;
    }
  }

  const firstEvent = emailEvents[0];
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
    sentAt: firstEvent.mailSentAt ?? firstEvent.sentAt,
    archivingEnabled,
    events: emailEvents.map((event) => ({
      type: event.eventType.toLowerCase().replace(/ /g, "_") as EmailStatus,
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
}

async function fetchEmail(
  organizationId: string,
  emailId: string
): Promise<EmailLookupResult> {
  // Per-account DynamoDB failures are non-fatal (another account may hold the
  // message), but they must not be mistaken for "the message doesn't exist" —
  // we keep the first one and report it if the lookup ends empty. The account it
  // happened in is kept alongside it so the timeline can name it (audit F11).
  let lookupError: unknown;
  let failedAccountId: string | null = null;

  const rememberFailure = (error: unknown, accountId: string) => {
    if (lookupError) {
      return;
    }
    lookupError = error;
    failedAccountId = accountId;
  };

  try {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 90 * 24 * 60 * 60 * 1000);

    const accounts = await db.query.awsAccount.findMany({
      where: eq(awsAccount.organizationId, organizationId),
    });

    if (accounts.length === 0) {
      return { ok: false, reason: "no-aws-account" };
    }

    // Step 1: time-windowed DynamoDB query (fast path for recent emails)
    const allEventsWithAccount = await Promise.all(
      accounts.map(async (account) => {
        try {
          const events = await queryEmailEvents({
            awsAccountId: account.id,
            startTime,
            endTime,
            limit: 1000,
          });
          return { account, events };
        } catch (error) {
          rememberFailure(error, account.accountId);
          logger.warn(
            { err: error, awsAccountId: account.id, organizationId },
            "email detail: windowed DynamoDB query failed"
          );
          return { account, events: [] };
        }
      })
    );

    let emailAccount: (typeof accounts)[0] | null = null;
    let emailEvents: any[] = [];

    for (const { account, events } of allEventsWithAccount) {
      const matchingEvents = events.filter((e) => e.messageId === emailId);
      if (matchingEvents.length > 0) {
        emailAccount = account;
        emailEvents = matchingEvents;
        break;
      }
    }

    if (emailEvents.length > 0 && emailAccount) {
      emailEvents.sort((a, b) => a.sentAt - b.sentAt);
      return {
        ok: true,
        email: buildEmailFromEvents(
          emailId,
          emailEvents,
          emailAccount.features?.email?.archivingEnabled ?? false
        ),
        timeline: { status: "ok", accountId: emailAccount.accountId },
      };
    }

    // Step 2: look up the PG record to get the canonical messageId and account.
    // Handles two cases:
    //  a) emailId is the PG UUID (old emails whose messageId wasn't set)
    //  b) emailId is the SES messageId but the email is older than 90 days
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
          eq(messageSend.organizationId, organizationId),
          eq(messageSend.channel, "email"),
          or(eq(messageSend.id, emailId), eq(messageSend.messageId, emailId))
        )
      )
      .limit(1)
      .then((rows) => rows[0] ?? null);

    if (!pgRecord) {
      // Nothing in Postgres either. If DynamoDB blew up on the way here we
      // cannot claim the message doesn't exist — say the lookup failed.
      if (lookupError) {
        return {
          ok: false,
          reason: "lookup-failed",
          kind: classifyLookupError(lookupError),
        };
      }
      return { ok: false, reason: "not-found" };
    }

    // Step 3: try a direct DynamoDB PK lookup (no time window) using the real messageId
    const realMessageId = pgRecord.messageId ?? emailId;
    const pgAccount = accounts.find((a) => a.id === pgRecord.awsAccountId);

    if (pgAccount) {
      try {
        const dynEvents = await queryEventsByMessageIds({
          awsAccountId: pgAccount.id,
          messageIds: [realMessageId],
        });
        if (dynEvents.length > 0) {
          dynEvents.sort((a, b) => a.sentAt - b.sentAt);
          return {
            ok: true,
            email: buildEmailFromEvents(
              realMessageId,
              dynEvents,
              pgAccount.features?.email?.archivingEnabled ?? false
            ),
            timeline: { status: "ok", accountId: pgAccount.accountId },
          };
        }
      } catch (error) {
        // Non-fatal: fall through to the PG-only view, but remember why the
        // event history is missing.
        rememberFailure(error, pgAccount.accountId);
        logger.warn(
          { err: error, awsAccountId: pgAccount.id, organizationId },
          "email detail: direct DynamoDB lookup failed"
        );
      }
    }

    // Step 4: PG-only fallback — show whatever metadata we have
    if (!pgRecord.sentAt) {
      return {
        ok: false,
        reason: "not-sent",
        subject: pgRecord.subject ?? "(no subject)",
        recipient: pgRecord.recipient,
        status: pgStatusToEmailStatus(pgRecord.status),
      };
    }
    /**
     * No events to show. Whether that is because the read threw or because the
     * history genuinely holds nothing for this message is the whole of F11 - the
     * two used to render the same sentence.
     */
    const timeline: EmailTimelineState = lookupError
      ? {
          status: classifyTimelineFailure(lookupError),
          accountId: failedAccountId ?? pgAccount?.accountId ?? null,
        }
      : { status: "empty", accountId: pgAccount?.accountId ?? null };

    return {
      ok: true,
      email: {
        id: emailId,
        messageId: realMessageId,
        from: pgRecord.from ?? "",
        to: [pgRecord.recipient],
        replyTo: undefined,
        subject: pgRecord.subject ?? "(no subject)",
        htmlBody: undefined,
        textBody: undefined,
        status: pgStatusToEmailStatus(pgRecord.status),
        sentAt: pgRecord.sentAt.getTime(),
        archivingEnabled: false,
        events: [],
      },
      timeline,
    };
  } catch (error) {
    logger.error({ err: error, emailId, organizationId }, "fetchEmail failed");
    return {
      ok: false,
      reason: "lookup-failed",
      kind: classifyLookupError(error),
    };
  }
}

export default async function EmailDetailPage({
  params,
  searchParams,
}: EmailDetailPageProps) {
  const { orgSlug, emailId } = await params;
  const listFilters = await searchParams;
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
    redirect("/");
  }

  /** Back to the view this message was opened from, filters intact (F8). */
  const backParams = new URLSearchParams();
  if (listFilters.days) {
    backParams.set("days", listFilters.days);
  }
  if (listFilters.status) {
    backParams.set("status", listFilters.status);
  }
  if (listFilters.q) {
    backParams.set("q", listFilters.q);
  }
  if (listFilters.sort) {
    backParams.set("sort", listFilters.sort);
  }
  const listHref = backParams.size
    ? `/${orgSlug}/emails?${backParams}`
    : `/${orgSlug}/emails`;

  // Fetch actual email directly (not via API to avoid auth issues)
  const result = await fetchEmail(orgWithMembership.id, emailId);

  // A genuine miss is a 404, not a silent bounce back to the list. Everything
  // else (no AWS account, unsent message, failed lookup) renders a state that
  // says what happened.
  if (!result.ok) {
    if (result.reason === "not-found") {
      notFound();
    }

    return (
      <>
        <div className="px-4 lg:px-6">
          <Button asChild size="sm" variant="ghost">
            <Link href={listHref}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to emails
            </Link>
          </Button>
        </div>
        <EmailUnavailable
          emailId={emailId}
          failure={result}
          orgSlug={orgSlug}
        />
      </>
    );
  }

  const email = result.email;
  // One palette for both pages, and a status we do not recognise renders
  // neutral instead of blanking (audit F12).
  const statusConfig = getEmailStatusConfig(email.status);
  const StatusIcon = statusConfig.icon;

  return (
    <>
      {/* Back Button */}
      <div className="px-4 lg:px-6">
        <Button asChild size="sm" variant="ghost">
          <Link href={listHref}>
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
                <div className="min-w-0 flex-1">
                  <h1 className="mb-2 font-bold text-2xl">{email.subject}</h1>
                  <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-sm">
                    <span>{formatFullTimestamp(email.sentAt)}</span>
                    <span>•</span>
                    <div className="flex min-w-0 max-w-full flex-row items-center gap-1">
                      <code className="min-w-0 max-w-full overflow-hidden text-ellipsis whitespace-nowrap rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                        {email.messageId}
                      </code>
                      <CopyButton text={email.messageId} />
                    </div>
                  </div>
                </div>
                <Badge
                  className={cn(
                    "font-medium",
                    statusConfig.tone.surface,
                    statusConfig.tone.text
                  )}
                  variant="outline"
                >
                  <StatusIcon className="mr-1 h-3 w-3" />
                  {statusConfig.label}
                </Badge>
              </div>

              {/* To/From - Compact Grid */}
              <EmailFields
                from={email.from}
                organizationId={orgWithMembership.id}
                to={email.to}
              />
            </div>
          </CardContent>
        </Card>

        {/* Event Timeline - Collapsible */}
        <EventTimeline eventCount={email.events.length}>
          {email.events.length === 0 ? (
            <TimelineState state={result.timeline} />
          ) : (
            email.events.map((event, index) => (
              <EventItem
                color={getEmailStatusConfig(event.type).tone.text}
                event={event}
                iconType={event.type}
                isLast={index === email.events.length - 1}
                key={`${event.type}-${event.timestamp}`}
              />
            ))
          )}
        </EventTimeline>

        {/* Email Archive Viewer - only show if archiving is enabled */}
        {email.archivingEnabled && (
          <EmailArchiveViewer
            archivingEnabled={email.archivingEnabled}
            messageId={email.messageId}
            orgSlug={orgSlug}
          />
        )}
      </div>
    </>
  );
}
