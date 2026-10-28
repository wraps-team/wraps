"use client";

import { Badge } from "@wraps/ui/components/ui/badge";
import { Skeleton } from "@wraps/ui/components/ui/skeleton";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { DrilldownWindow } from "@/lib/analytics-drilldown-window";
import {
  type ChangeMarker,
  type ChangeMarkersResponse,
  COPY,
  describeMarkerDelta,
  type MarkerMetric,
} from "@/lib/change-markers";
import { useChangeMarkers } from "../../hooks/use-analytics";
import type { DrilldownTab, DrilldownTabProps } from "./tab-contract";

/** The viewer's local time, short form. The rows are read on the viewer's clock. */
function formatViewerTime(epochMs: number): string {
  return new Date(epochMs).toLocaleString("en-US", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function MarkerDeltas({
  marker,
  metric,
  window,
}: {
  marker: ChangeMarker;
  metric: MarkerMetric;
  window: DrilldownWindow;
}) {
  if (marker.count !== 1) {
    return (
      <p className="text-muted-foreground text-sm">
        {COPY.grouped(marker.count)}
      </p>
    );
  }
  if (!marker.delta) {
    return null;
  }
  const lines = describeMarkerDelta(marker.delta, {
    timezone: window.tz,
    first: metric,
  });
  return (
    <div className="flex flex-col gap-2">
      {lines.map((line) => (
        <div className="flex flex-col gap-1 text-sm" key={line.metric}>
          {line.heading ? <p className="font-medium">{line.heading}</p> : null}
          {line.chip ? (
            <div>
              <Badge variant="outline">{line.chip}</Badge>
            </div>
          ) : null}
          <p className="text-muted-foreground">{line.text}</p>
        </div>
      ))}
    </div>
  );
}

function TimelineRows({
  data,
  metric,
  window,
}: {
  data: ChangeMarkersResponse;
  metric: MarkerMetric;
  window: DrilldownWindow;
}) {
  return (
    <div className="flex flex-col gap-4">
      {data.truncated ? (
        <p className="rounded-md border border-border p-3 text-sm">
          {COPY.truncated(data.totalMarkers)}
        </p>
      ) : null}
      <ol className="flex flex-col divide-y divide-border">
        {data.markers.map((marker) => (
          <li className="flex flex-col gap-3 py-4" key={marker.id}>
            <Link
              className="flex flex-col gap-1 hover:underline"
              href={marker.href}
            >
              <span className="text-muted-foreground text-xs">
                {formatViewerTime(marker.at)}
              </span>
              <span className="font-medium">{marker.label}</span>
            </Link>
            <MarkerDeltas marker={marker} metric={metric} window={window} />
          </li>
        ))}
      </ol>
    </div>
  );
}

function TimelineBody({ orgSlug, metric, window }: DrilldownTabProps) {
  const query = useChangeMarkers(orgSlug, window.days, {
    withDeltas: true,
    enabled: true,
    tz: window.tz,
  });

  if (query.isLoading) {
    return (
      <div aria-hidden="true" className="flex flex-col gap-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }
  if (query.error) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm">{COPY.loadError}</p>
        <Button onClick={() => query.refetch()} size="sm" variant="outline">
          {COPY.tryAgain}
        </Button>
      </div>
    );
  }
  const data = query.data;
  if (!data || data.markers.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        {COPY.emptyBody(window.days)}
      </p>
    );
  }
  return <TimelineRows data={data} metric={metric} window={window} />;
}

/**
 * Changes made in the window, newest first, with the bounce, complaint and
 * suppression movement around each. Timing only: it never says a change
 * caused a movement. The day in the URL does not filter this list.
 */
function TimelineTab(props: DrilldownTabProps) {
  return (
    <section aria-labelledby="timeline-heading" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-semibold text-lg" id="timeline-heading">
          {COPY.tabHeading}
        </h2>
        <p className="text-muted-foreground text-sm">{COPY.tabDescription}</p>
      </div>
      <TimelineBody {...props} />
      <p className="text-muted-foreground text-xs">
        {COPY.timelineFooter(props.window.days)}
      </p>
    </section>
  );
}

const timelineTab = {
  id: "timeline",
  label: "Timeline",
  enabled: true,
  Component: TimelineTab,
} satisfies DrilldownTab;

export default timelineTab;
