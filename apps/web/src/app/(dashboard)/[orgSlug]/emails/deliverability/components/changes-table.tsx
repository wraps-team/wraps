"use client";

import { Badge } from "@wraps/ui/components/ui/badge";
import { Skeleton } from "@wraps/ui/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@wraps/ui/components/ui/table";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type {
  DrilldownMetric,
  DrilldownWindow,
} from "@/lib/analytics-drilldown-window";
import {
  type ChangeMarker,
  type ChangeMarkersResponse,
  COPY,
  describeMarkerDelta,
  type MarkerMetric,
  type MarkerType,
  type MetricDirection,
} from "@/lib/change-markers";
import { useChangeMarkers } from "../../analytics/hooks/use-analytics";

/** The kind of change, as the table's first column names it. */
const KIND: Record<MarkerType, string> = {
  broadcast_started: "Broadcast started",
  automation_enabled: "Automation enabled",
  automation_disabled: "Automation disabled",
  template_saved: "Template saved",
  contacts_imported: "Contacts imported",
  suppression_removed: "Suppressed address removed",
  sender_defaults_changed: "Sender defaults changed",
};

/** Decimal places for a rate, as the marker copy shows them. */
const PRECISION: Record<DrilldownMetric, number> = {
  bounce: 2,
  suppression: 2,
  complaint: 4,
};

const RATE_HEADING: Record<DrilldownMetric, string> = {
  bounce: "Bounce rate",
  complaint: "Complaint rate",
  suppression: "Suppression rate",
};

/** Drops a leading "Kind: " from a label, so the kind is not said twice. */
export function withoutKind(label: string, kind: string): string {
  const prefix = `${kind}: `;
  return label.startsWith(prefix) ? label.slice(prefix.length) : label;
}

function formatViewerTime(epochMs: number): string {
  return new Date(epochMs).toLocaleString("en-US", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function chipVariant(
  direction: MetricDirection | null
): React.ComponentProps<typeof Badge>["variant"] {
  if (direction === "down") {
    return "success";
  }
  if (direction === "up") {
    return "warning";
  }
  return "secondary";
}

/**
 * The comparison cell: the selected metric only, before and after, with its
 * delta badge. When the comparison is not ready, the one sentence for it.
 */
function ComparisonCell({
  marker,
  metric,
  timezone,
}: {
  marker: ChangeMarker;
  metric: MarkerMetric;
  timezone: string;
}) {
  if (marker.count !== 1) {
    return (
      <span className="text-muted-foreground text-xs">
        {COPY.grouped(marker.count)}
      </span>
    );
  }
  if (!marker.delta) {
    return <span className="text-muted-foreground">—</span>;
  }
  const line = describeMarkerDelta(marker.delta, {
    timezone,
    first: metric,
  }).find((candidate) => candidate.metric === metric);
  const figures = marker.delta.metrics.find((m) => m.metric === metric);
  if (
    !(line && figures) ||
    line.status !== "ready" ||
    figures.before === null ||
    figures.after === null
  ) {
    return (
      <span className="text-muted-foreground text-xs">{line?.text ?? ""}</span>
    );
  }
  const digits = PRECISION[metric];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="tabular-nums">
        {`${figures.before.toFixed(digits)}% → ${figures.after.toFixed(digits)}%`}
      </span>
      {line.chip ? (
        <Badge variant={chipVariant(figures.direction)}>{line.chip}</Badge>
      ) : null}
    </div>
  );
}

function ChangeRow({
  marker,
  metric,
  timezone,
}: {
  marker: ChangeMarker;
  metric: MarkerMetric;
  timezone: string;
}) {
  const kind = KIND[marker.type];
  return (
    <TableRow>
      <TableCell className="align-top">
        <Badge variant="secondary">
          {marker.count === 1 ? kind : "Grouped"}
        </Badge>
      </TableCell>
      <TableCell className="whitespace-normal align-top">
        <Link className="hover:underline" href={marker.href}>
          {marker.count === 1 ? withoutKind(marker.label, kind) : marker.label}
        </Link>
      </TableCell>
      <TableCell className="whitespace-nowrap text-muted-foreground align-top">
        {formatViewerTime(marker.at)}
      </TableCell>
      <TableCell className="whitespace-normal align-top">
        <ComparisonCell marker={marker} metric={metric} timezone={timezone} />
      </TableCell>
    </TableRow>
  );
}

function ChangesBody({
  data,
  metric,
  window,
}: {
  data: ChangeMarkersResponse;
  metric: DrilldownMetric;
  window: DrilldownWindow;
}) {
  return (
    <div className="flex flex-col gap-4">
      {data.truncated ? (
        <p className="rounded-md border border-border p-3 text-sm">
          {COPY.truncated(data.totalMarkers)}
        </p>
      ) : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Change</TableHead>
            <TableHead>What</TableHead>
            <TableHead>When</TableHead>
            <TableHead>{`${RATE_HEADING[metric]} before → after`}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.markers.map((marker) => (
            <ChangeRow
              key={marker.id}
              marker={marker}
              metric={metric}
              timezone={window.tz}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * Changes made in the window, newest first, with the selected metric's rate
 * before and after each one. Timing only: it never says a change caused a
 * movement. The day in the URL does not filter this list.
 */
export function ChangesTable({
  orgSlug,
  metric,
  window,
}: {
  orgSlug: string;
  metric: DrilldownMetric;
  window: DrilldownWindow;
}) {
  const query = useChangeMarkers(orgSlug, window.days, {
    withDeltas: true,
    enabled: true,
    tz: window.tz,
  });

  let body: React.ReactNode;
  if (query.isLoading) {
    body = (
      <div aria-hidden="true" className="flex flex-col gap-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  } else if (query.error) {
    body = (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm">{COPY.loadError}</p>
        <Button onClick={() => query.refetch()} size="sm" variant="outline">
          {COPY.tryAgain}
        </Button>
      </div>
    );
  } else if (!query.data || query.data.markers.length === 0) {
    body = (
      <p className="text-muted-foreground text-sm">
        {COPY.emptyBody(window.days)}
      </p>
    );
  } else {
    body = <ChangesBody data={query.data} metric={metric} window={window} />;
  }

  return (
    <div className="flex flex-col gap-4">
      {body}
      <p className="text-muted-foreground text-xs">
        {COPY.timelineFooter(window.days)}
      </p>
    </div>
  );
}
