"use client";

import { Badge } from "@wraps/ui/components/ui/badge";
import { Card, CardContent } from "@wraps/ui/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@wraps/ui/components/ui/chart";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@wraps/ui/components/ui/popover";
import { Skeleton } from "@wraps/ui/components/ui/skeleton";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@wraps/ui/components/ui/toggle-group";
import { Info } from "lucide-react";
import { parseAsString, useQueryState } from "nuqs";
import * as React from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { browserTimeZone } from "@/lib/analytics-drilldown-window";
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
  DELIVERABILITY_METRICS,
  metricParam,
  useDeliverabilityDays,
} from "../lib/params";
import { CausesPanel } from "./causes-panel";

type Metric = (typeof DELIVERABILITY_METRICS)[number];

const METRIC_LABEL: Record<Metric, string> = {
  bounce: "Bounces",
  complaint: "Complaints",
  suppression: "Suppressed",
};

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

/** The SES review line for a metric, in percent, or null when it has none. */
function reviewPercent(metric: Metric): number | null {
  if (metric === "bounce") {
    return Number((SES_THRESHOLDS.bounce.review * 100).toFixed(3));
  }
  if (metric === "complaint") {
    return Number((SES_THRESHOLDS.complaint.review * 100).toFixed(3));
  }
  return null;
}

function reviewLabel(metric: Metric): string | null {
  if (metric === "bounce") {
    return formatThreshold(SES_THRESHOLDS.bounce.review);
  }
  if (metric === "complaint") {
    return formatThreshold(SES_THRESHOLDS.complaint.review);
  }
  return null;
}

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

function useTimeZone() {
  // Set after mount: the server render must not carry the server's timezone.
  const [tz, setTz] = React.useState("UTC");
  React.useEffect(() => {
    setTz(browserTimeZone());
  }, []);
  return tz;
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

function isMetric(value: string): value is Metric {
  return (DELIVERABILITY_METRICS as readonly string[]).includes(value);
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
      className={`flex items-center justify-center rounded-md text-center text-muted-foreground text-sm ${CHART_HEIGHT} ${dashed ? "border border-dashed" : ""}`}
    >
      {children}
    </div>
  );
}

/**
 * The trend for one metric. Mirrors ComplaintChart's axes, tooltip and
 * change-marker lines, with the SES review line as the only dashed element.
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
  const review = reviewPercent(metric);
  const reviewText = reviewLabel(metric);
  const color = METRIC_COLOR[metric];
  const decimals = metric === "complaint" ? 2 : 1;
  const fmt = (value: number) => `${value.toFixed(decimals)}%`;

  const config = {
    value: { label: METRIC_NOUN[metric], color },
  } satisfies ChartConfig;

  const maxValue = Math.max(0, ...points.map((p) => p.value));
  const top = Math.max(
    review === null ? 0 : review * 1.2,
    maxValue * 1.1,
    0.01
  );
  const last = points.at(-1);
  const ariaLabel =
    last === undefined
      ? `${METRIC_NOUN[metric]} over the last ${days} days`
      : `${METRIC_NOUN[metric]} over the last ${days} days, ending at ${fmt(last.value)}${
          review === null || reviewText === null
            ? ""
            : `, against the ${reviewText} SES review line`
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
          {review === null || reviewText === null ? null : (
            <ReferenceLine
              ifOverflow="extendDomain"
              label={{
                value: `SES review line · ${reviewText}`,
                position: "insideTopRight",
                fill: "var(--muted-foreground)",
                fontSize: 11,
              }}
              stroke="var(--muted-foreground)"
              strokeDasharray="6 4"
              strokeWidth={1.5}
              y={review}
            />
          )}
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
  const tz = useTimeZone();
  const [metric, setMetric] = useQueryState("metric", metricParam);
  const [showMarkers, setShowMarkers] = React.useState(true);

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
    showMarkers,
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
    <Card className="@container/card">
      <CardContent className="space-y-5">
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

        <div className="flex flex-wrap items-center justify-between gap-3">
          <ToggleGroup
            aria-label="Metric"
            onValueChange={(value) => {
              // A single-type group emits "" when the active item is clicked.
              if (value && isMetric(value)) {
                setMetric(value);
              }
            }}
            size="sm"
            type="single"
            value={metric}
            variant="outline"
          >
            {DELIVERABILITY_METRICS.map((option) => (
              <ToggleGroupItem key={option} value={option}>
                {METRIC_LABEL[option]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <div className="flex items-center gap-2">
            <ChangeMarkersToggle
              enabled
              onPressedChange={setShowMarkers}
              pressed={showMarkers}
            />
          </div>
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
          tz={tz}
        />
      </CardContent>
    </Card>
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
  const sends = useAnalyticsOverview(orgSlug, days).data?.totalSent ?? null;
  const note = breakdownCopy(sends);
  return (
    <>
      <DeliverabilityCard orgSlug={orgSlug} />
      {note === null ? (
        <CausesPanel orgSlug={orgSlug} />
      ) : (
        <Card className="@container/card">
          <CardContent className="space-y-2">
            <h3 className="font-semibold text-sm">Breakdown</h3>
            <p className="text-muted-foreground text-sm">{note}</p>
          </CardContent>
        </Card>
      )}
    </>
  );
}
