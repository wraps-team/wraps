"use client";

import { Skeleton } from "@wraps/ui/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@wraps/ui/components/ui/tooltip";
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  ChevronRight,
  Clock,
  Mail,
  Megaphone,
  MessageSquare,
  Play,
  UserPlus,
  Workflow,
  XCircle,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import {
  getContactTimeline,
  type MessageStatusTimestamps,
  type TimelineEvent,
  type TimelineEventType,
  type TimelineHistory,
} from "@/actions/contacts-analytics";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { captureContactTimelineLoadMore } from "./lib/analytics";

type ContactTimelineProps = {
  contactId: string;
  organizationId: string;
  orgSlug: string;
};

// Config for non-message event types
const EVENT_CONFIG: Record<
  Exclude<TimelineEventType, "message">,
  {
    icon: React.ElementType;
    label: string;
    color: string;
    bgColor: string;
  }
> = {
  workflow_started: {
    icon: Play,
    label: "Automation started",
    color: "text-warning",
    bgColor: "bg-warning/15",
  },
  workflow_completed: {
    icon: CheckCircle2,
    label: "Automation completed",
    color: "text-success",
    bgColor: "bg-success/15",
  },
  workflow_failed: {
    icon: XCircle,
    label: "Automation failed",
    color: "text-destructive",
    bgColor: "bg-destructive/15",
  },
  contact_created: {
    icon: UserPlus,
    label: "Contact created",
    color: "text-muted-foreground",
    bgColor: "bg-muted",
  },
  custom_event: {
    icon: Zap,
    label: "Event",
    color: "text-info",
    bgColor: "bg-info/15",
  },
};

// Status dot configuration for message events.
//
// Colour is a second channel here, never the only one: the dots are labelled in
// text beside them (see StatusDots) because a delivery state that exists only
// as a hue in a hover tooltip is unreadable to touch, keyboard and colour-blind
// users. `failure: true` marks the states that outrank progress when picking
// which one to name.
const STATUS_DOT_CONFIG = {
  sent: {
    color: "bg-info",
    label: "Sent",
    failure: false,
  },
  delivered: {
    color: "bg-success",
    label: "Delivered",
    failure: false,
  },
  opened: {
    color: "bg-warning",
    label: "Opened",
    failure: false,
  },
  clicked: {
    color: "bg-foreground",
    label: "Clicked",
    failure: false,
  },
  bounced: {
    color: "bg-destructive",
    label: "Bounced",
    failure: true,
  },
  complained: {
    color: "bg-destructive",
    label: "Spam complaint",
    failure: true,
  },
  optedOut: {
    color: "bg-muted-foreground",
    label: "Opted out",
    failure: true,
  },
} as const;

// Get display config for message events based on source type
function getMessageDisplay(event: TimelineEvent): {
  icon: React.ElementType;
  label: string;
  color: string;
  bgColor: string;
} {
  const isEmail = event.channel === "email";
  const channelLabel = isEmail ? "Email" : "SMS";

  if (event.sourceType === "batch") {
    return {
      icon: Megaphone,
      label: "Broadcast",
      color: "text-foreground",
      bgColor: "bg-muted",
    };
  }
  if (event.sourceType === "workflow") {
    return {
      icon: Workflow,
      label: `Automation ${channelLabel.toLowerCase()}`,
      color: "text-warning",
      bgColor: "bg-warning/15",
    };
  }
  // Transactional
  return {
    icon: isEmail ? Mail : MessageSquare,
    label: channelLabel,
    color: isEmail ? "text-info" : "text-success",
    bgColor: isEmail ? "bg-info/15" : "bg-success/15",
  };
}

function formatTimestampShort(date: Date): string {
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Status dots component for message delivery status
function StatusDots({
  status,
  channel,
}: {
  status: MessageStatusTimestamps;
  channel: "email" | "sms";
}) {
  // Determine which statuses to show based on channel
  const emailStatuses = [
    { key: "sent", timestamp: status.sentAt },
    { key: "delivered", timestamp: status.deliveredAt },
    { key: "opened", timestamp: status.openedAt },
    { key: "clicked", timestamp: status.clickedAt },
    { key: "bounced", timestamp: status.bouncedAt },
    { key: "complained", timestamp: status.complainedAt },
  ] as const;

  const smsStatuses = [
    { key: "sent", timestamp: status.sentAt },
    { key: "delivered", timestamp: status.deliveredAt },
    { key: "clicked", timestamp: status.clickedAt },
    { key: "optedOut", timestamp: status.optedOutAt },
  ] as const;

  const statuses = channel === "email" ? emailStatuses : smsStatuses;
  const activeStatuses = statuses.filter((s) => s.timestamp);

  if (activeStatuses.length === 0) {
    return null;
  }

  // The state worth naming in text: a failure if one happened, otherwise the
  // furthest the message got. It is rendered as a visible word so the delivery
  // state survives colour-blindness, a touch screen and a keyboard — none of
  // which can reach a hover tooltip. The full trail goes to assistive tech as
  // one sentence rather than as several focus stops of coloured dot.
  const headline =
    activeStatuses.filter((s) => STATUS_DOT_CONFIG[s.key].failure).at(-1) ??
    activeStatuses.at(-1);

  const spokenTrail = activeStatuses
    .map(({ key, timestamp }) => {
      const config = STATUS_DOT_CONFIG[key];
      return timestamp
        ? `${config.label} ${formatTimestampShort(new Date(timestamp))}`
        : config.label;
    })
    .join(", ");

  return (
    <div className="flex items-center gap-1.5">
      <span className="sr-only">{spokenTrail}</span>
      <div aria-hidden="true" className="flex items-center gap-1">
        {activeStatuses.map(({ key, timestamp }) => {
          const config = STATUS_DOT_CONFIG[key];
          return (
            <Tooltip key={key}>
              <TooltipTrigger asChild>
                <span
                  className={cn(
                    "inline-block h-2 w-2 rounded-full",
                    config.color
                  )}
                />
              </TooltipTrigger>
              <TooltipContent className="text-xs" side="top">
                <span className="font-medium">{config.label}</span>
                {timestamp && (
                  <span className="ml-1 text-muted-foreground">
                    {formatTimestampShort(new Date(timestamp))}
                  </span>
                )}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
      {headline && (
        <span
          aria-hidden="true"
          className={cn(
            "text-xs",
            STATUS_DOT_CONFIG[headline.key].failure
              ? "font-medium text-destructive"
              : "text-muted-foreground"
          )}
        >
          {STATUS_DOT_CONFIG[headline.key].label}
        </span>
      )}
    </div>
  );
}

function formatTimestamp(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return date.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  if (days === 1) {
    return "Yesterday";
  }
  if (days < 7) {
    return date.toLocaleDateString(undefined, { weekday: "short" });
  }
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function TimelineEventRow({
  event,
  orgSlug,
}: {
  event: TimelineEvent;
  orgSlug: string;
}) {
  // Handle message events differently
  if (event.type === "message" && event.channel && event.status) {
    const config = getMessageDisplay(event);
    const Icon = config.icon;

    // Build detail text and link
    let detailText: string | null = null;
    let detailLink: string | null = null;

    if (event.sourceType === "batch" && event.batchName) {
      detailText = event.batchName;
    } else if (event.sourceType === "workflow" && event.workflowName) {
      detailText = event.workflowName;
    } else if (event.subject) {
      detailText = event.subject;
    }

    // Link to individual email if we have a messageId
    if (event.messageId && event.channel === "email") {
      detailLink = `/${orgSlug}/emails/${event.messageId}`;
    }

    return (
      <div className="group flex items-start gap-3 py-2">
        {/* Icon */}
        <div
          className={cn(
            "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
            config.bgColor
          )}
        >
          <Icon className={cn("h-3.5 w-3.5", config.color)} />
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{config.label}</span>
            <StatusDots channel={event.channel} status={event.status} />
            <span className="text-muted-foreground text-xs">
              {formatTimestamp(new Date(event.timestamp))}
            </span>
          </div>

          {detailText && (
            <div className="mt-0.5 flex items-center gap-1">
              {detailLink ? (
                <Link
                  className="flex items-center gap-1 truncate text-muted-foreground text-xs hover:text-foreground hover:underline"
                  href={detailLink}
                >
                  <span className="truncate">{detailText}</span>
                  <ChevronRight className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                </Link>
              ) : (
                <span className="truncate text-muted-foreground text-xs">
                  {detailText}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Handle workflow and contact_created events
  const config =
    EVENT_CONFIG[event.type as Exclude<TimelineEventType, "message">];
  if (!config) {
    return null;
  }

  const Icon = config.icon;

  // Build detail text and link for workflow events and custom events
  let detailText: string | null = null;
  let detailLink: string | null = null;

  if (event.type.startsWith("workflow_")) {
    detailText = event.workflowName || "Workflow";
    if (event.workflowId) {
      detailLink = `/${orgSlug}/automations/${event.workflowId}`;
    }
    // Show event trigger if available
    if (event.eventName && event.type === "workflow_started") {
      detailText = `${event.workflowName} (${event.eventName})`;
    }
  }

  // For custom events, show the event name as detail text and link to events page
  if (event.type === "custom_event" && event.eventName) {
    detailText = event.eventName;
    detailLink = `/${orgSlug}/events?eventName=${encodeURIComponent(event.eventName)}`;
  }

  return (
    <div className="group flex items-start gap-3 py-2">
      {/* Icon */}
      <div
        className={cn(
          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
          config.bgColor
        )}
      >
        <Icon className={cn("h-3.5 w-3.5", config.color)} />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{config.label}</span>
          <span className="text-muted-foreground text-xs">
            {formatTimestamp(new Date(event.timestamp))}
          </span>
        </div>

        {detailText && (
          <div className="mt-0.5 flex items-center gap-1">
            {detailLink ? (
              <Link
                className="flex items-center gap-1 truncate text-muted-foreground text-xs hover:text-foreground hover:underline"
                href={detailLink}
              >
                <span className="truncate">{detailText}</span>
                <ChevronRight className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
            ) : (
              <span className="truncate text-muted-foreground text-xs">
                {detailText}
              </span>
            )}
          </div>
        )}

        {/* Show event data preview for workflow triggers and custom events */}
        {event.eventData &&
          Object.keys(event.eventData).length > 0 &&
          (event.type === "workflow_started" ||
            event.type === "custom_event") && (
            <div className="mt-1 flex items-center gap-1">
              <Zap
                className={cn(
                  "h-3 w-3",
                  event.type === "custom_event" ? "text-info" : "text-warning"
                )}
              />
              <span className="truncate text-muted-foreground text-xs">
                {Object.entries(event.eventData)
                  .slice(0, 2)
                  .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
                  .join(", ")}
                {Object.keys(event.eventData).length > 2 && "..."}
              </span>
            </div>
          )}
      </div>
    </div>
  );
}

/**
 * "No activity yet" used to cover two very different situations. For a contact
 * whose events had aged out it was a confident false statement, so the two now
 * read differently and the second one says what it knows.
 */
function EmptyActivity({ history }: { history: TimelineHistory | null }) {
  if (history?.hasUnshowableHistory) {
    const sent = history.recordedEmailsSent + history.recordedSmsSent;
    return (
      <div className="space-y-1 rounded-md border border-dashed p-3">
        <div className="flex items-center gap-2 font-medium text-sm">
          <Archive className="h-4 w-4 text-muted-foreground" />
          <span>Older activity, no longer stored</span>
        </div>
        <p className="text-muted-foreground text-sm">
          {sent > 0
            ? `This contact's counters record ${sent.toLocaleString()} message${
                sent === 1 ? "" : "s"
              }, but none of them are still in stored history.`
            : "This contact has recorded activity, but none of it is still in stored history."}
          {history.agedOutEvents > 0 &&
            ` ${history.agedOutEvents.toLocaleString()} event${
              history.agedOutEvents === 1 ? " has" : "s have"
            } passed their retention date.`}
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-muted-foreground text-sm">
      <Clock className="h-4 w-4" />
      <span>Nothing sent to this contact yet</span>
    </div>
  );
}

/** Shown under a timeline that has rows but is still missing older ones. */
function AgedOutNote({ history }: { history: TimelineHistory }) {
  return (
    <p className="flex items-start gap-2 text-muted-foreground text-xs">
      <Archive className="mt-0.5 h-3 w-3 shrink-0" />
      <span>
        {history.agedOutEvents > 0
          ? `${history.agedOutEvents.toLocaleString()} older event${
              history.agedOutEvents === 1 ? " has" : "s have"
            } passed their retention date and aren't shown.`
          : `This contact's counters record ${(
              history.recordedEmailsSent + history.recordedSmsSent
            ).toLocaleString()} messages — more than the history below still holds.`}
      </span>
    </p>
  );
}

export function ContactTimeline({
  contactId,
  organizationId,
  orgSlug,
}: ContactTimelineProps) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [history, setHistory] = useState<TimelineHistory | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);

  // Load timeline on mount or when contactId changes
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);

      try {
        const result = await getContactTimeline(contactId, organizationId);

        if (cancelled) {
          return;
        }

        if (result.success) {
          setEvents(result.events);
          setHasMore(result.hasMore);
          setHistory(result.history);
        } else {
          setError(result.error);
        }
      } catch {
        if (!cancelled) {
          setError("Failed to load activity");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [contactId, organizationId]);

  // Load more handler
  const handleLoadMore = () => {
    setLoadMoreError(null);
    captureContactTimelineLoadMore({ events_loaded: events.length });
    startTransition(async () => {
      try {
        const result = await getContactTimeline(contactId, organizationId, {
          offset: events.length,
        });

        if (result.success) {
          setEvents((prev) => [...prev, ...result.events]);
          setHasMore(result.hasMore);
          setHistory(result.history);
        } else {
          // Swallowing this left the button looking like it had done nothing.
          setLoadMoreError(result.error);
        }
      } catch {
        setLoadMoreError("Couldn't load more activity. Try again.");
      }
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <h3 className="font-medium text-sm">Activity</h3>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div className="flex items-start gap-3" key={i}>
              <Skeleton className="h-7 w-7 rounded-full" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-32" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3">
        <h3 className="font-medium text-sm">Activity</h3>
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <AlertTriangle className="h-4 w-4" />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  // Only the synthesised "Contact created" row survives, so there is nothing
  // real to show. Which of the two reasons that is decides what we say.
  const isEmpty = events.every((e) => e.type === "contact_created");

  if (isEmpty) {
    return (
      <div className="space-y-3">
        <h3 className="font-medium text-sm">Activity</h3>
        <EmptyActivity history={history} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="font-medium text-sm">Activity</h3>

      <div className="relative">
        {/* Timeline line */}
        <div className="absolute top-0 bottom-0 left-[13px] w-px bg-border" />

        {/* Events */}
        <div className="relative space-y-1">
          {events.map((event) => (
            <TimelineEventRow event={event} key={event.id} orgSlug={orgSlug} />
          ))}
        </div>
      </div>

      {history?.hasUnshowableHistory && <AgedOutNote history={history} />}

      {loadMoreError && (
        <div
          className="flex items-center gap-2 text-destructive text-sm"
          role="alert"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{loadMoreError}</span>
        </div>
      )}

      {/* Load more */}
      {hasMore && (
        <Button
          className="w-full"
          disabled={isPending}
          onClick={handleLoadMore}
          size="sm"
          variant="ghost"
        >
          {isPending ? "Loading..." : "Load more"}
        </Button>
      )}
    </div>
  );
}
