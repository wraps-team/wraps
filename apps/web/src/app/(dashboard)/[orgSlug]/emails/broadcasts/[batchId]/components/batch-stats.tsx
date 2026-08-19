"use client";

import { Card, CardContent } from "@wraps/ui/components/ui/card";
import { Info } from "lucide-react";
import { hasDeliveryEvents } from "@/lib/batch";
import { CompactProgress } from "./compact-progress";
import { SankeyChart } from "./sankey-chart";

type BatchStatsProps = {
  batch: {
    id: string;
    status: string;
    channel: string;
    totalRecipients: number;
    processedRecipients: number;
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    bounced: number;
    complained: number;
    failed: number;
    hardBounced: number;
    softBounced: number;
    pausedReason?: string | null;
    lastChunkAt?: Date | null;
    startedAt: Date | null;
    completedAt: Date | null;
  };
  clicksByUrl?: Array<{ url: string; count: number }>;
  unsubscribeCount?: number;
  /** Distinct clicked URLs beyond the display cap, so the chart can say what
   *  it left out rather than silently truncating. */
  omittedUrlCount?: number;
  organizationId: string;
};

export function BatchStats({
  batch,
  clicksByUrl,
  omittedUrlCount,
  unsubscribeCount,
}: BatchStatsProps) {
  const hasData = batch.sent > 0;
  // No fate recorded for any message: rates here are unknown, not zero.
  const eventsMissing = batch.sent > 0 && !hasDeliveryEvents(batch);
  const isDraft = batch.status === "draft";
  const isTerminal =
    batch.status === "completed" ||
    batch.status === "failed" ||
    batch.status === "cancelled";
  const notSent = Math.max(
    0,
    batch.totalRecipients - batch.processedRecipients
  );

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 py-4">
        <CompactProgress
          completedAt={batch.completedAt}
          lastChunkAt={batch.lastChunkAt}
          pausedReason={batch.pausedReason}
          processedRecipients={batch.processedRecipients}
          sent={batch.sent}
          startedAt={batch.startedAt}
          status={batch.status}
          totalRecipients={batch.totalRecipients}
        />
        {!isDraft && (
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
            <div>
              <span className="font-semibold text-lg">
                {batch.sent.toLocaleString("en-US")}
              </span>{" "}
              <span className="text-muted-foreground text-sm">Sent</span>
            </div>
            <div>
              <span className="font-semibold text-lg">
                {batch.failed.toLocaleString("en-US")}
              </span>{" "}
              <span className="text-muted-foreground text-sm">Failed</span>
            </div>
            <div>
              <span className="font-semibold text-lg">
                {notSent.toLocaleString("en-US")}
              </span>{" "}
              <span className="text-muted-foreground text-sm">Not sent</span>
            </div>
          </div>
        )}
        {isTerminal && batch.sent < batch.totalRecipients && (
          <p className="text-muted-foreground text-sm">
            {(batch.totalRecipients - batch.sent).toLocaleString("en-US")} of{" "}
            {batch.totalRecipients.toLocaleString("en-US")} recipients were
            never sent.
          </p>
        )}
        {unsubscribeCount != null && unsubscribeCount > 0 && (
          <div className="flex items-center gap-1.5 text-muted-foreground text-sm">
            <span className="inline-block h-2 w-2 rounded-full bg-warning" />
            <span>
              {unsubscribeCount.toLocaleString("en-US")} unsubscribed
              {/* Denominator is `delivered`, matching opens and clicks — an
                  unsubscribe requires a delivered email. This used to divide by
                  `sent`, so the rate was not comparable to the others and no
                  label said which population it was over. */}
              {batch.delivered > 0 && (
                <span className="ml-1 text-xs">
                  ({((unsubscribeCount / batch.delivered) * 100).toFixed(1)}% of{" "}
                  {batch.delivered.toLocaleString("en-US")} delivered)
                </span>
              )}
            </span>
          </div>
        )}
        {eventsMissing && (
          <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 p-3 text-sm">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">
                No delivery events have arrived for this broadcast.
              </span>{" "}
              Open and click rates are unknown, not zero. If this persists,
              check that SES event publishing is connected for this AWS account.
            </p>
          </div>
        )}
        {omittedUrlCount != null && omittedUrlCount > 0 && (
          <p className="text-muted-foreground text-xs">
            Showing the top {clicksByUrl?.length ?? 0} clicked links.{" "}
            {omittedUrlCount.toLocaleString("en-US")} more distinct links are
            not shown.
          </p>
        )}
        {hasData && (
          <SankeyChart
            bounced={batch.bounced}
            channel={batch.channel as "email" | "sms"}
            clicked={batch.clicked}
            clicksByUrl={clicksByUrl}
            complained={batch.complained}
            delivered={batch.delivered}
            failed={batch.failed}
            hardBounced={batch.hardBounced}
            opened={batch.opened}
            sent={batch.sent}
            softBounced={batch.softBounced}
          />
        )}
      </CardContent>
    </Card>
  );
}
