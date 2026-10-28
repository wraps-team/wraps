"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  type DrilldownMetric,
  formatDrilldownDay,
} from "@/lib/analytics-drilldown-window";
import {
  type ChangeMarker,
  type ChartMarkerLine,
  COPY,
  groupMarkersByDate,
  TIMELINE_TAB_HREF,
} from "@/lib/change-markers";
import { useChangeMarkers } from "../hooks/use-analytics";

/** How many changes the list shows before the "+N more" link. */
const LIST_LIMIT = 5;

/** The Changes switch in a chart's header. Local state, owned by the chart. */
export function ChangeMarkersToggle({
  enabled,
  pressed,
  onPressedChange,
}: {
  enabled: boolean;
  pressed: boolean;
  onPressedChange: (next: boolean) => void;
}) {
  if (!enabled) {
    return null;
  }
  return (
    <Button
      aria-pressed={pressed}
      onClick={() => onPressedChange(!pressed)}
      size="sm"
      variant="outline"
    >
      {COPY.chartToggle}
    </Button>
  );
}

type LabelProps = {
  /** Set by recharts when this element is used as a ReferenceLine label. */
  viewBox?: { x?: number; y?: number };
  count: number;
  major: boolean;
};

const LABEL_WIDTH = 22;
const LABEL_HEIGHT = 16;

/**
 * The count badge at the top of a marker line. Shape, fill, and the number
 * carry the meaning, so colour is not the only signal. Major is solid, minor
 * is outlined.
 */
export function ChangeMarkerLabel({ viewBox, count, major }: LabelProps) {
  const x = viewBox?.x ?? 0;
  const y = viewBox?.y ?? 0;
  const top = y + 2;
  return (
    <g>
      <rect
        height={LABEL_HEIGHT}
        rx={4}
        strokeWidth={1}
        style={{
          fill: major ? "var(--foreground)" : "var(--background)",
          stroke: "var(--foreground)",
        }}
        width={LABEL_WIDTH}
        x={x - LABEL_WIDTH / 2}
        y={top}
      />
      <text
        dominantBaseline="central"
        fontSize={11}
        style={{ fill: major ? "var(--background)" : "var(--foreground)" }}
        textAnchor="middle"
        x={x}
        y={top + LABEL_HEIGHT / 2}
      >
        {count}
      </text>
    </g>
  );
}

/**
 * Props for one ReferenceLine. Charts spread these onto a ReferenceLine that
 * sits directly inside the chart, because recharts ignores lines wrapped in a
 * custom component.
 */
export function markerLineProps(line: ChartMarkerLine) {
  return {
    x: line.date,
    stroke: "var(--muted-foreground)",
    strokeWidth: 1,
    strokeDasharray: line.major ? undefined : "2 3",
    label: <ChangeMarkerLabel count={line.count} major={line.major} />,
  };
}

export type ChangeListState = "loading" | "error" | "ready";

/** The list's state for one marker query. */
export function changeListState(query: {
  error: unknown;
  isLoading: boolean;
}): ChangeListState {
  if (query.error) {
    return "error";
  }
  return query.isLoading ? "loading" : "ready";
}

/**
 * The overlay state a rate chart needs: the marker query (no deltas, enabled
 * only when the chart opts in), the lines for the chart's dates, and the
 * list. With the overlay off or the prop absent, no request is made.
 */
export function useChartChangeMarkers({
  orgSlug,
  days,
  enabled,
  showMarkers,
  dates,
}: {
  orgSlug: string;
  days: number;
  enabled: boolean;
  showMarkers: boolean;
  dates: string[];
}) {
  const query = useChangeMarkers(orgSlug, days, {
    withDeltas: false,
    enabled,
  });
  const overlayOn = enabled && showMarkers;
  const markers = query.data?.markers ?? [];
  return {
    overlayOn,
    markers,
    markerLines: overlayOn ? groupMarkersByDate(markers, dates) : [],
    listState: changeListState(query),
  };
}

/**
 * The keyboard and screen-reader path to the chart's markers. Recharts
 * reference lines are not focusable. On mobile the list starts collapsed.
 */
export function ChangeMarkerList({
  active,
  orgSlug,
  markers,
  metric,
  days,
  tz,
  state,
}: {
  active: boolean;
  orgSlug: string;
  markers: ChangeMarker[];
  metric: DrilldownMetric;
  days: number;
  tz: string;
  state: ChangeListState;
}) {
  const isMobile = useIsMobile();
  const [expanded, setExpanded] = useState(false);
  const listId = useId();

  if (!active || state === "loading") {
    return null;
  }
  if (state === "error") {
    return (
      <p className="text-muted-foreground text-sm">{COPY.chartListError}</p>
    );
  }
  if (markers.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">{COPY.noChangesInPeriod}</p>
    );
  }

  const shown = markers.slice(0, LIST_LIMIT);
  const extra = markers.length - shown.length;
  const body = (
    <div className="flex flex-col gap-1" id={listId}>
      <ul aria-label={COPY.chartListHeading} className="flex flex-col">
        {shown.map((marker) => (
          <li key={marker.id}>
            <Link
              className="flex min-h-11 items-center justify-between gap-3 py-2 text-sm hover:underline"
              href={marker.href}
            >
              <span className="shrink-0 text-muted-foreground">
                {formatDrilldownDay(marker.date)}
              </span>
              <span className="min-w-0 text-right">{marker.label}</span>
            </Link>
          </li>
        ))}
      </ul>
      {extra > 0 ? (
        <Link
          className="min-h-11 py-2 text-sm underline underline-offset-4 hover:text-foreground"
          href={TIMELINE_TAB_HREF(orgSlug, { metric, days, tz })}
        >
          {COPY.moreChanges(extra)}
        </Link>
      ) : null}
      <p className="text-muted-foreground text-xs">{COPY.listFootnote}</p>
    </div>
  );

  if (!isMobile) {
    return body;
  }
  return (
    <div className="flex flex-col gap-1">
      <Button
        aria-controls={listId}
        aria-expanded={expanded}
        className="min-h-11 justify-start px-0"
        onClick={() => setExpanded((value) => !value)}
        size="sm"
        variant="ghost"
      >
        {expanded ? "Hide changes" : COPY.showChanges(markers.length)}
      </Button>
      {expanded ? body : null}
    </div>
  );
}
