"use client";

import { Skeleton } from "@wraps/ui/components/ui/skeleton";
import { parseAsString, useQueryState } from "nuqs";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { eventsFor } from "@/lib/analytics-drilldown-rank";
import {
  DRILLDOWN_METRIC_LABEL,
  type DrilldownBy,
  type DrilldownMetric,
  type DrilldownWindow,
  describeDrilldownWindow,
  formatDrilldownDay,
} from "@/lib/analytics-drilldown-window";
import { RateBarTable } from "../components/rate-bar-table";
import {
  DrilldownRequestError,
  type DrilldownSendsResponse,
  useDrilldownSends,
} from "../hooks/use-drilldown-sends";
import { readSendsBy } from "../lib/params";
import type { DrilldownTab, DrilldownTabProps } from "./tab-contract";

const EVENTS_PHRASE: Record<DrilldownMetric, { noun: string; verb: string }> = {
  bounce: { noun: "bounces", verb: "bounced" },
  complaint: { noun: "complaints", verb: "received a complaint" },
  suppression: { noun: "suppressions", verb: "was suppressed" },
};

function errorMessage(status: number, label: string): string {
  if (status === 422) {
    return "This window has too many sending groups to break down. Try 30 days or fewer.";
  }
  if (status === 400) {
    return "This link is not valid. Go back to analytics and open it again.";
  }
  return `Could not load the causes for ${label}.`;
}

function emptyCopy(window: DrilldownWindow, label: string) {
  if (window.day) {
    return {
      title: `No sends on ${formatDrilldownDay(window.day)}`,
      body: `Nothing was sent on that day within the last ${window.days} days.`,
    };
  }
  return {
    title: "No sends in this window",
    body: `Nothing was sent in ${label}, so there is no rate to explain.`,
  };
}

function EmptyNotice({ title, body }: { title: string; body: string }) {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{body}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function LoadingRows({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-4">
      <span className="sr-only">Loading causes for {label}</span>
      <Skeleton className="h-5 w-2/3" />
      {[0, 1, 2].map((row) => (
        <Skeleton className="h-10 w-full" key={row} />
      ))}
    </div>
  );
}

function FailedNotice({
  message,
  canRetry,
  onRetry,
}: {
  message: string;
  canRetry: boolean;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">{message}</p>
      {canRetry ? (
        <div>
          <Button onClick={onRetry} size="sm" variant="outline">
            Try again
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function SendsResults({
  orgSlug,
  metric,
  label,
  window,
  by,
  data,
}: {
  orgSlug: string;
  metric: DrilldownMetric;
  label: string;
  window: DrilldownWindow;
  by: DrilldownBy;
  data: DrilldownSendsResponse;
}) {
  const events = eventsFor(data.totals, metric);
  const phrase = EVENTS_PHRASE[metric];

  if (data.totals.sent === 0) {
    const copy = emptyCopy(window, label);
    return <EmptyNotice body={copy.body} title={copy.title} />;
  }
  if (events === 0) {
    return (
      <EmptyNotice
        body={`Nothing ${phrase.verb} in ${label}, so there is nothing to attribute.`}
        title={`No ${phrase.noun} in this window`}
      />
    );
  }

  const nothingRanked = data.ranked.length === 0 && data.belowFloor.length > 0;
  const caption = `${DRILLDOWN_METRIC_LABEL[metric]} is ${data.totals.rate?.toFixed(2)}% for ${label}: ${events.toLocaleString("en-US")} of ${data.totals.sent.toLocaleString("en-US")} sends.`;
  return (
    <div className="flex flex-col gap-6">
      {nothingRanked ? (
        <EmptyNotice
          body={`Each group has fewer than ${data.floor} sends. They are listed below with their counts.`}
          title="No group has enough sends to rank yet"
        />
      ) : null}
      <RateBarTable
        belowFloor={data.belowFloor}
        belowFloorOpen={nothingRanked}
        by={by}
        caption={caption}
        floor={data.floor}
        metric={metric}
        omitted={data.omitted}
        orgSlug={orgSlug}
        ranked={data.ranked}
        workflowLinks={data.workflowLinks}
      />
    </div>
  );
}

function SendsTab({ orgSlug, metric, window }: DrilldownTabProps) {
  const [byParam] = useQueryState("sends.by", parseAsString);
  const by = readSendsBy(byParam);
  const label = describeDrilldownWindow(window);
  const query = useDrilldownSends(orgSlug, metric, by, window);

  if (query.isLoading) {
    return <LoadingRows label={label} />;
  }
  if (query.error || !query.data) {
    const status =
      query.error instanceof DrilldownRequestError ? query.error.status : 0;
    return (
      <FailedNotice
        canRetry={status !== 422 && status !== 400}
        message={errorMessage(status, label)}
        onRetry={() => query.refetch()}
      />
    );
  }
  return (
    <SendsResults
      by={by}
      data={query.data}
      label={label}
      metric={metric}
      orgSlug={orgSlug}
      window={window}
    />
  );
}

const sendsTab = {
  id: "sends",
  label: "Sends",
  enabled: true,
  Component: SendsTab,
} satisfies DrilldownTab;

export default sendsTab;
