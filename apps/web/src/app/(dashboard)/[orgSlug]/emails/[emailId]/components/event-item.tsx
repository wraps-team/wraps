"use client";

import {
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Eye,
  MousePointerClick,
  Send,
  X,
} from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type EventItemProps = {
  event: {
    type: string;
    timestamp: number;
    metadata?: Record<string, unknown>;
  };
  iconType: string;
  color: string;
  isLast: boolean;
};

const ICON_MAP = {
  // SES event types (lowercase)
  send: Send,
  delivery: Check,
  open: Eye,
  click: MousePointerClick,
  bounce: X,
  complaint: X,
  reject: X,
  rendering_failure: X,
  renderingfailure: X,
  deliverydelay: Clock,
  // Status types (past tense)
  sent: Send,
  delivered: Check,
  bounced: X,
  complained: X,
  opened: Eye,
  clicked: MousePointerClick,
  failed: X,
  rejected: X,
  delivery_delay: Clock,
} as const;

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

export function EventItem({ event, iconType, color, isLast }: EventItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasMetadata = event.metadata && Object.keys(event.metadata).length > 0;
  const Icon = ICON_MAP[iconType as keyof typeof ICON_MAP] || Clock;

  return (
    <div>
      <div className="flex gap-4">
        {/* Timeline Indicator */}
        <div className="flex flex-col items-center">
          <div
            className={`rounded-full border-2 border-background bg-linear-to-br from-background to-muted p-2.5 shadow-sm ${color}`}
          >
            <Icon className="h-4 w-4" />
          </div>
          {!isLast && (
            <div className="my-1 w-0.5 flex-1 bg-linear-to-b from-border to-transparent" />
          )}
        </div>

        {/* Event Content */}
        <div className="flex-1">
          <div
            className={`flex items-start justify-between ${
              hasMetadata
                ? "-ml-2 cursor-pointer rounded-lg p-2 transition-colors hover:bg-muted/50"
                : ""
            }`}
            onClick={() => hasMetadata && setIsExpanded(!isExpanded)}
          >
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <div className="font-semibold capitalize">
                  {event.type.replace("_", " ")}
                </div>
                {hasMetadata && event.metadata && (
                  <Badge className="text-xs" variant="outline">
                    {Object.keys(event.metadata).length} detail
                    {Object.keys(event.metadata).length > 1 ? "s" : ""}
                  </Badge>
                )}
              </div>
              <div className="text-muted-foreground text-sm">
                {formatFullTimestamp(event.timestamp)}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-muted-foreground text-sm">
                {formatTimestamp(event.timestamp)}
              </div>
              {hasMetadata && (
                <div className="flex h-8 w-8 items-center justify-center">
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Expandable Metadata */}
          {hasMetadata && isExpanded && (
            <div className="slide-in-from-top-2 mt-3 animate-in duration-200">
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <div className="font-medium text-sm">Event Details</div>
                  <Button
                    className="h-7 text-xs"
                    onClick={() => {
                      navigator.clipboard.writeText(
                        JSON.stringify(event.metadata, null, 2)
                      );
                    }}
                    size="sm"
                    variant="ghost"
                  >
                    Copy JSON
                  </Button>
                </div>
                <div className="rounded-md bg-background/50 p-3 font-mono text-xs">
                  <pre className="overflow-x-auto">
                    {JSON.stringify(event.metadata, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
