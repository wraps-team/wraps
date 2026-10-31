"use client";

import { Badge } from "@wraps/ui/components/ui/badge";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@wraps/ui/components/ui/chart";
import { Panel, PanelTitle } from "@wraps/ui/components/ui/panel";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@wraps/ui/components/ui/popover";
import { Skeleton } from "@wraps/ui/components/ui/skeleton";
import { Info } from "lucide-react";
import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import * as React from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import {
  reputationPartialLabel,
  reputationScopeLabel,
} from "@/lib/analytics-scope";
import { SERIES_COLOR } from "@/lib/chart-series";
import {
  deliverabilityVerdict,
  MIN_SENDS_FOR_VERDICT,
  type Verdict,
  type VerdictLevel,
} from "@/lib/deliverability-verdict";
import { formatThreshold, SES_THRESHOLDS } from "@/lib/ses-thresholds";
import {
  ChangeMarkerList,
  ChangeMarkersToggle,
  markerLineProps,
  useChartChangeMarkers,
} from "../../analytics/components/change-marker-overlay";
import {
  useAnalyticsOverview,
  useBounceData,
  useComplaintData,
  useEmailChartData,
  useSuppressionData,
} from "../../analytics/hooks/use-analytics";
import {
  Figure,
  RailDivider,
  ReputationScope,
  UpdatedLine,
} from "../../components/summary-rail";
import {
  DELIVERABILITY_METRIC_LABEL,
  type DELIVERABILITY_METRICS,
  metricParam,
  useDeliverabilityDays,
} from "../lib/params";
import { CausesPanel } from "./causes-panel";
import { MetricReasonsCard } from "./metric-reasons-card";

type Metric = (typeof DELIVERABILITY_METRICS)[number];

const METRIC_LABEL = DELIVERABILITY_METRIC_LABEL;

const METRIC_NOUN: Record<Metric, string> = {
  bounce: "Bounce rate",
  complaint: "Complaint rate",
  suppression: "Suppression rate",
};

const METRIC_COLOR: Record<Metric, string> = {
  bounce: SERIES_COLOR.attention,
  complaint: SERIES_COLOR.failure,
  suppression: SERIES_COLOR.attention,
};

type SesLines = {
  /** The review and pause lines in percent, the chart's unit. */
  review: number;
  pause: number;
  reviewText: string;
  pauseText: string;
};

/** AWS's review and pause lines for a metric, or null when it has none. */
function sesLines(metric: Metric): SesLines | null {
  if (metric === "suppression") {
    return null;
  }
  const { review, pause } = SES_THRESHOLDS[metric];
  const percent = (value: number) => Number((value * 100).toFixed(3));
  return {
    review: percent(review),
    pause: percent(pause),
    reviewText: formatThreshold(review),
    pauseText: formatThreshold(pause),
  };
}

/**
 * How faint the review and pause zones are. Enough to read as a region behind
 * the line, the way the account panel's meter reads as a track behind its
 * fill, without competing with the series.
 */
const ZONE_OPACITY = 0.08;

const CHART_HEIGHT = "h-[180px]";

/**
 * Keeps the last defined value of a query. A refetch, or a range change that
 * starts a new query key, must not swap a loaded chart for a skeleton.
 */
function useHeld<T>(value: T | undefined): T | undefined {
  const [held, setHeld] = React.useState<T | undefined>(value);
  React.useEffect(() => {
    if (value !== undefined) {
      setHeld(value);
    }
  }, [value]);
  return value ?? held;
}

/** "—" while loading and in the no-sends state, where a rate would be invented. */
function rateText(
  value: number | undefined,
  digits: number,
  level: VerdictLevel
): string {
  if (value === undefined || level === "none") {
    return "—";
  }
  return `${value.toFixed(digits)}%`;
}

const VERDICT_BADGE: Record<
  VerdictLevel,
  React.ComponentProps<typeof Badge>["variant"]
> = {
  healthy: "success",
  watch: "warning",
  risk: "destructive",
  unknown: "secondary",
  insufficient: "secondary",
  none: "secondary",
};

/** A small disclosure beside a label, the same pattern as the reputation scope. */
function InfoPopover({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          aria-label={label}
          className="-my-2"
          size="icon-sm"
          variant="ghost"
        >
          <Info className="size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72" side="top">
        <p className="text-sm">{children}</p>
      </PopoverContent>
    </Popover>
  );
}

/**
 * The zones and lines AWS's thresholds draw on a trend chart.
 *
 * A function rather than a component: recharts 2 finds reference elements by
 * type among the chart's direct children, so a wrapper component would hide
 * them. Labels stay muted because amber text on a white card is too faint.
 */
function sesLineElements(lines: SesLines, showPause: boolean, top: number) {
  const lineLabel = (
    value: string,
    position: "insideTopRight" | "insideBottomRight"
  ) => ({
    value,
    position,
    fill: "var(--muted-foreground)",
    fontSize: 11,
  });

  const elements = [
    <ReferenceArea
      fill="var(--warning)"
      fillOpacity={ZONE_OPACITY}
      ifOverflow="hidden"
      key="review-zone"
      y1={lines.review}
      y2={showPause ? lines.pause : top}
    />,
    <ReferenceLine
      ifOverflow="extendDomain"
      key="review-line"
      label={lineLabel(
        `SES review line · ${lines.reviewText}`,
        "insideTopRight"
      )}
      stroke="var(--warning)"
      strokeDasharray="6 4"
      strokeWidth={1.5}
      y={lines.review}
    />,
  ];

  if (showPause) {
    elements.push(
      <ReferenceArea
        fill="var(--destructive)"
        fillOpacity={ZONE_OPACITY}
        ifOverflow="hidden"
        key="pause-zone"
        y1={lines.pause}
        y2={top}
      />,
      <ReferenceLine
        ifOverflow="extendDomain"
        key="pause-line"
        // Above its line, in the red zone: below it, the label collides with
        // the latest-value label of a rate climbing toward the line.
        label={lineLabel(
          `SES pause line · ${lines.pauseText}`,
          "insideBottomRight"
        )}
        stroke="var(--destructive)"
        strokeDasharray="6 4"
        strokeWidth={1.5}
        y={lines.pause}
      />
    );
  }

  return elements;
}

function ChartBox({
  children,
  dashed = false,
}: {
  children: React.ReactNode;
  /** The no-activity box, bordered so it reads as a deliberate empty state. */
  dashed?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-center text-center text-muted-foreground text-sm ${CHART_HEIGHT} ${dashed ? "border border-dashed" : ""}`}
    >
      {children}
    </div>
  );
}

/**
 * The trend for one metric. Its axes, tooltip and change-marker lines, with
 * AWS's lines as the only dashed elements, in the colours the account panel's
 * meter uses for its ticks: amber for review, red for pause.
 *
 * The pause line joins only once the rate reaches the review line. Drawn
 * always, it would stretch the axis to 12% for bounces and flatten a healthy
 * 0.05% line onto the floor; until review is crossed, the faint amber zone
 * above the review line is the warning the reader needs.
 */
function TrendChart({
  metric,
  days,
  points,
  markerLines,
  lowVolumeSends,
  clickable,
}: {
  metric: Metric;
  days: number;
  points: { date: string; value: number }[];
  markerLines: ReturnType<typeof useChartChangeMarkers>["markerLines"];
  /** Set only in the insufficient state, to caption the chart with its sample. */
  lowVolumeSends: number | null;
  /** False in the low-volume states: a day click then does nothing. */
  clickable: boolean;
}) {
  const [, setDay] = useQueryState("day", parseAsString);
  const lines = sesLines(metric);
  const color = METRIC_COLOR[metric];
  const decimals = metric === "complaint" ? 2 : 1;
  const fmt = (value: number) => `${value.toFixed(decimals)}%`;

  const config = {
    value: { label: METRIC_NOUN[metric], color },
  } satisfies ChartConfig;

  const maxValue = Math.max(0, ...points.map((p) => p.value));
  const showPause = lines !== null && maxValue >= lines.review;
  let lineTop = 0;
  if (lines) {
    lineTop = showPause ? lines.pause * 1.2 : lines.review * 1.2;
  }
  const top = Math.max(lineTop, maxValue * 1.1, 0.01);
  const last = points.at(-1);
  const ariaLabel =
    last === undefined
      ? `${METRIC_NOUN[metric]} over the last ${days} days`
      : `${METRIC_NOUN[metric]} over the last ${days} days, ending at ${fmt(last.value)}${
          lines === null
            ? ""
            : `, against the ${lines.reviewText} SES review line`
        }`;
  const gradientId = `fillDeliverability-${metric}`;

  return (
    <div>
      <ChartContainer
        aria-label={ariaLabel}
        className={`aspect-auto ${CHART_HEIGHT} w-full ${clickable ? "cursor-pointer" : ""}`}
        config={config}
        role="figure"
      >
        <AreaChart
          accessibilityLayer
          data={points}
          margin={{ top: 16, right: 16, bottom: 0, left: 0 }}
          onClick={(state) => {
            const day = state?.activeLabel;
            if (!clickable || typeof day !== "string") {
              return;
            }
            setDay(day);
            // The panel sits under the card. Scroll only when it is off screen.
            const panel = document.getElementById("deliverability-causes");
            if (
              panel &&
              panel.getBoundingClientRect().top > window.innerHeight
            ) {
              panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
            }
          }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop
                offset="5%"
                stopColor="var(--color-value)"
                stopOpacity={0.35}
              />
              <stop
                offset="95%"
                stopColor="var(--color-value)"
                stopOpacity={0.05}
              />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} />
          <XAxis
            axisLine={false}
            dataKey="date"
            minTickGap={32}
            tickFormatter={(value) =>
              new Date(value).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })
            }
            tickLine={false}
            tickMargin={8}
          />
          <YAxis
            axisLine={false}
            domain={[0, top]}
            tickFormatter={(value: number) => fmt(value)}
            tickLine={false}
            tickMargin={8}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value) => `${value}%`}
                indicator="line"
                labelFormatter={(value) =>
                  new Date(value).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                }
              />
            }
          />
          {lines === null ? null : sesLineElements(lines, showPause, top)}
          <Area
            dataKey="value"
            fill={`url(#${gradientId})`}
            stroke="var(--color-value)"
            strokeWidth={2}
            type="monotone"
          />
          {last === undefined ? null : (
            <ReferenceDot
              fill="var(--color-value)"
              label={{
                value: fmt(last.value),
                position: "top",
                fill: "var(--foreground)",
                fontSize: 11,
              }}
              r={5}
              stroke="var(--card)"
              strokeWidth={2}
              x={last.date}
              y={last.value}
            />
          )}
          {markerLines.map((line) => (
            <ReferenceLine key={line.date} {...markerLineProps(line)} />
          ))}
        </AreaChart>
      </ChartContainer>
      {lowVolumeSends === null ? null : (
        <p className="mt-2 text-muted-foreground text-xs">
          Based on {lowVolumeSends} sends. Rates this small swing on a single
          bounce.
        </p>
      )}
    </div>
  );
}

/**
 * The Deliverability tab's card: a verdict, a rail of the figures behind it,
 * and one trend chart with a metric toggle.
 */
export function DeliverabilityCard({ orgSlug }: { orgSlug: string }) {
  const days = useDeliverabilityDays();
  const [metric, setMetric] = useQueryState("metric", metricParam);
  // Changes are closed until the user opens them. `changes=1` in the URL is open.
  const [changesParam, setChangesParam] = useQueryState(
    "changes",
    parseAsStringLiteral(["1"] as const)
  );
  const showChanges = changesParam === "1";

  const emailQuery = useEmailChartData(orgSlug, days);
  const overviewQuery = useAnalyticsOverview(orgSlug, days);
  const bounceQuery = useBounceData(orgSlug, days);
  const complaintQuery = useComplaintData(orgSlug, days);
  const suppressionQuery = useSuppressionData(orgSlug, days);

  const email = useHeld(emailQuery.data);
  const overview = useHeld(overviewQuery.data);
  const bounceRows = useHeld(bounceQuery.data);
  const complaintRows = useHeld(complaintQuery.data);
  const suppressionRows = useHeld(suppressionQuery.data);

  const meta = email?.meta;
  const reputation = meta ? reputationScopeLabel(meta) : null;
  const reputationPartial = meta ? reputationPartialLabel(meta) : null;
  const sesRated = meta?.reputationScope === "ses-account";
  const sends = overview?.totalSent ?? null;
  const rangeLabel = days === 1 ? "24 hours" : `${days} days`;

  const verdict: Verdict = deliverabilityVerdict({
    bounceRate: sesRated && email ? email.overview.bounceRate : null,
    complaintRate: sesRated && email ? email.overview.complaintRate : null,
    sends,
    rangeLabel,
  });

  const points = (() => {
    if (metric === "bounce") {
      return bounceRows?.map((r) => ({ date: r.date, value: r.bounceRate }));
    }
    if (metric === "complaint") {
      return complaintRows?.map((r) => ({
        date: r.date,
        value: r.complaintRate,
      }));
    }
    return suppressionRows?.map((r) => ({
      date: r.date,
      value: r.suppressionRate,
    }));
  })();
  const activeQuery =
    metric === "bounce"
      ? bounceQuery
      : metric === "complaint"
        ? complaintQuery
        : suppressionQuery;

  const { overlayOn, markerLines, markers, listState } = useChartChangeMarkers({
    orgSlug,
    days,
    enabled: true,
    showMarkers: showChanges,
    dates: points?.map((p) => p.date) ?? [],
  });

  const suppressedTotal =
    suppressionRows === undefined
      ? null
      : suppressionRows.reduce((n, r) => n + r.suppressed, 0);

  const complaintsAside =
    verdict.level === "insufficient" && sends !== null
      ? `of ${sends} sends`
      : "in the window";

  const railLoading = email === undefined;
  const railError = railLoading && emailQuery.isError;

  const chartBody = (() => {
    if (verdict.level === "none") {
      return <ChartBox dashed>No data for this period</ChartBox>;
    }
    if (points === undefined) {
      return activeQuery.isError ? (
        <ChartBox>
          Failed to load {METRIC_LABEL[metric].toLowerCase()} data
        </ChartBox>
      ) : (
        <Skeleton className={`w-full ${CHART_HEIGHT}`} />
      );
    }
    if (points.length === 0) {
      return <ChartBox>No data for this period</ChartBox>;
    }
    return (
      <TrendChart
        clickable={verdict.level !== "insufficient"}
        days={days}
        lowVolumeSends={verdict.level === "insufficient" ? sends : null}
        markerLines={overlayOn ? markerLines : []}
        metric={metric}
        points={points}
      />
    );
  })();

  return (
    <Panel
      className="@container/card"
      label={<PanelTitle level={3}>Rates · {rangeLabel}</PanelTitle>}
      variant="own"
    >
      <div className="space-y-5">
        {railError ? (
          <p className="text-muted-foreground text-sm">
            Failed to load deliverability data
          </p>
        ) : railLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : (
          <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4 border-b pb-5">
            <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
              <div>
                <div className="flex items-center gap-1 text-muted-foreground text-xs">
                  Sending health
                  <InfoPopover label="How sending health is rated">
                    Healthy under half of the SES review lines (
                    {formatThreshold(SES_THRESHOLDS.bounce.review / 2)} bounce,{" "}
                    {formatThreshold(SES_THRESHOLDS.complaint.review / 2)}{" "}
                    complaint). Watch up to the lines. At risk at or over them:{" "}
                    {formatThreshold(SES_THRESHOLDS.bounce.review)} bounce,{" "}
                    {formatThreshold(SES_THRESHOLDS.complaint.review)}{" "}
                    complaint.
                  </InfoPopover>
                </div>
                <div className="mt-1.5">
                  <Badge variant={VERDICT_BADGE[verdict.level]}>
                    {verdict.label}
                  </Badge>
                </div>
              </div>

              <RailDivider />

              <div>
                <div className="flex items-center gap-1 text-muted-foreground text-xs">
                  {reputation?.title ?? "Account reputation"}
                  {reputation ? (
                    <ReputationScope reputation={reputation} />
                  ) : null}
                </div>
                <div className="mt-1.5 flex items-baseline gap-4 text-sm leading-none">
                  <span className="font-medium tabular-nums">
                    {rateText(email?.overview.bounceRate, 2, verdict.level)}{" "}
                    <span className="font-normal text-muted-foreground">
                      of {formatThreshold(SES_THRESHOLDS.bounce.review)} bounces
                    </span>
                  </span>
                  <span className="font-medium tabular-nums">
                    {rateText(email?.overview.complaintRate, 3, verdict.level)}{" "}
                    <span className="font-normal text-muted-foreground">
                      of {formatThreshold(SES_THRESHOLDS.complaint.review)}{" "}
                      complaints
                    </span>
                  </span>
                </div>
                {reputationPartial ? (
                  <p className="mt-1.5 text-destructive text-xs">
                    {reputationPartial}
                  </p>
                ) : null}
              </div>

              <RailDivider />

              <Figure
                aside={
                  verdict.level === "none" ? "no sends yet" : complaintsAside
                }
                label="Complaints"
                value={
                  overview ? overview.totalComplaints.toLocaleString() : "—"
                }
              />
              <div>
                <div className="flex items-center gap-1 text-muted-foreground text-xs">
                  Suppressed
                  <InfoPopover label="What suppressed means">
                    SES skips these addresses automatically and never tries to
                    deliver.
                  </InfoPopover>
                </div>
                <div className="mt-1.5 flex items-baseline gap-1.5">
                  <span className="font-semibold text-2xl leading-none tabular-nums">
                    {suppressedTotal === null
                      ? "—"
                      : suppressedTotal.toLocaleString()}
                  </span>
                  <span className="text-muted-foreground text-sm">
                    sends blocked
                  </span>
                </div>
              </div>
            </div>

            {meta ? <UpdatedLine generatedAt={meta.generatedAt} /> : null}
          </div>
        )}

        {railError || railLoading ? null : (
          <p className="text-muted-foreground text-sm">{verdict.sentence}</p>
        )}

        <div className="flex items-center justify-end gap-2">
          <ChangeMarkersToggle
            enabled
            onPressedChange={(next) => setChangesParam(next ? "1" : null)}
            pressed={showChanges}
          />
        </div>

        {chartBody}

        <p className="text-muted-foreground text-xs">
          Rate of mail sent through Wraps over the selected range. The review
          line is SES's limit on your whole AWS account, which can differ — see
          Account reputation above.
        </p>

        <ChangeMarkerList
          active={overlayOn}
          days={days}
          markers={markers}
          metric={metric}
          orgSlug={orgSlug}
          state={listState}
        />
      </div>
    </Panel>
  );
}

/**
 * Copy for the Breakdown panel while the window is too small to compare. It
 * stands where the causes panel sits, and the panel replaces it at 100 sends
 * or more.
 */
function breakdownCopy(sends: number | null): string | null {
  if (sends === null) {
    return null;
  }
  if (sends === 0) {
    return "Breakdowns by broadcast, workflow and template appear after your first sends. The Suppressed list below still shows every address SES blocks.";
  }
  if (sends < MIN_SENDS_FOR_VERDICT) {
    return `Breakdowns need enough sends to compare. You have ${sends} so far; they appear at ${MIN_SENDS_FOR_VERDICT}.`;
  }
  return null;
}

/**
 * The Deliverability tab body: the card, then either the Breakdown note (while
 * the window has too few sends to compare) or the causes panel under the card.
 */
export function DeliverabilityBody({ orgSlug }: { orgSlug: string }) {
  const days = useDeliverabilityDays();
  const [metric] = useQueryState("metric", metricParam);
  const sends = useAnalyticsOverview(orgSlug, days).data?.totalSent ?? null;
  const note = breakdownCopy(sends);
  return (
    <>
      <DeliverabilityCard orgSlug={orgSlug} />
      {note === null ? (
        <div
          className={
            metric === "suppression" ? "space-y-6" : "grid gap-6 lg:grid-cols-3"
          }
        >
          <div className="lg:col-span-2">
            <CausesPanel orgSlug={orgSlug} />
          </div>
          {metric === "suppression" ? null : (
            <div className="lg:col-span-1">
              <MetricReasonsCard metric={metric} orgSlug={orgSlug} />
            </div>
          )}
        </div>
      ) : (
        <Panel
          className="@container/card"
          label={<PanelTitle level={3}>Breakdown</PanelTitle>}
        >
          <p className="text-muted-foreground text-sm">{note}</p>
        </Panel>
      )}
    </>
  );
}
