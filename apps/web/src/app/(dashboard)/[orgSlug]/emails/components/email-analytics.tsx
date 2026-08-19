"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ButtonGroup } from "@wraps/ui/components/ui/button-group";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@wraps/ui/components/ui/select";
import { Skeleton } from "@wraps/ui/components/ui/skeleton";
import { formatDistance } from "date-fns";
import { CircleAlert, Info, Loader2, RotateCw } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { refreshEmailChart } from "@/actions/analytics";
import { Button } from "@/components/ui/button";
import { RefreshButton } from "@/components/ui/refresh-button";
import {
  type ReputationLabel,
  reputationPartialLabel,
  reputationScopeLabel,
} from "@/lib/analytics-scope";
import { countYAxisProps } from "@/lib/chart-axis";
import { SERIES_COLOR } from "@/lib/chart-series";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/utils";
import { useEmailChartData } from "../analytics/hooks/use-analytics";
import { captureEmailsErrorRetried } from "../lib/analytics";

/**
 * The four series, each owning its colour AND a stroke treatment.
 *
 * Colour alone cannot carry four lines: `sent` and `delivered` are identical
 * for a healthy account, and a 100%-delivery day drew `delivered` exactly on
 * top of `sent` while the legend advertised a "Sent" colour that appeared
 * nowhere on the canvas.
 *
 * Colours come from the shared `--series-*` palette rather than local `oklch()`
 * literals - see `lib/chart-series.ts` for why that palette exists.
 */
const SERIES = {
  sent: {
    label: "Sent",
    color: SERIES_COLOR.volume,
    dash: undefined,
    width: 3,
  },
  delivered: {
    label: "Delivered",
    color: SERIES_COLOR.success,
    dash: "6 3",
    width: 2.5,
  },
  opened: {
    label: "Opened",
    color: SERIES_COLOR.attention,
    dash: "4 2",
    width: 1.5,
  },
  // "2 2" at 2px, not "1 3" at 1.5px: the thinnest, sparsest dash landed on
  // the series that is already the hardest to find on the canvas, and at
  // legend size it degraded into three dots.
  clicked: {
    label: "Clicked",
    color: SERIES_COLOR.engagement,
    dash: "2 2",
    width: 2,
  },
} as const;

type SeriesKey = keyof typeof SERIES;

const SERIES_ORDER = ["sent", "delivered", "opened", "clicked"] as const;

/** A swatch that mirrors the line it stands for, not just its hue. */
function SeriesLine({ series }: { series: (typeof SERIES)[SeriesKey] }) {
  return (
    <svg
      aria-hidden="true"
      className="h-2 w-4 shrink-0"
      fill="none"
      viewBox="0 0 16 4"
    >
      <line
        stroke={series.color}
        strokeDasharray={series.dash}
        strokeLinecap="round"
        strokeWidth={series.width}
        x1="1"
        x2="15"
        y1="2"
        y2="2"
      />
    </svg>
  );
}

/** `ChartConfig.icon` takes a component, so bind each series to one. */
function seriesIcon(key: SeriesKey) {
  return function SeriesIcon() {
    return <SeriesLine series={SERIES[key]} />;
  };
}

const chartConfig: ChartConfig = {
  sent: {
    label: SERIES.sent.label,
    color: SERIES.sent.color,
    icon: seriesIcon("sent"),
  },
  delivered: {
    label: SERIES.delivered.label,
    color: SERIES.delivered.color,
    icon: seriesIcon("delivered"),
  },
  opened: {
    label: SERIES.opened.label,
    color: SERIES.opened.color,
    icon: seriesIcon("opened"),
  },
  clicked: {
    label: SERIES.clicked.label,
    color: SERIES.clicked.color,
    icon: seriesIcon("clicked"),
  },
};

/**
 * The same windows the emails table offers, so the two controls cannot select
 * ranges that do not exist on the other. The chart reads `?days` rather than
 * holding private state — it previously defaulted to 30 over a 7-day table,
 * which guaranteed the card and the table disagreed.
 */
const TIME_RANGES = [
  { days: 1, short: "24h", long: "Last 24 hours" },
  { days: 7, short: "7d", long: "Last 7 days" },
  { days: 30, short: "30d", long: "Last 30 days" },
  { days: 90, short: "90d", long: "Last 90 days" },
] as const;

const DEFAULT_DAYS = 7;

/**
 * One height for the plot, the error state and the skeleton.
 *
 * The plot used to be pinned at 280px beside a text column that rendered
 * anywhere from 340px to 480px depending on which conditional lines the
 * reputation tile owed the reader - so the chart sat in a cell up to 180px
 * taller than itself and no single number could have fixed it. The summary is
 * a horizontal rail now, so the chart owns the full width and this height is
 * the only one in play.
 */
const PLOT_HEIGHT = "h-[260px] @[540px]/card:h-[320px]";

/**
 * "Updated N minutes ago", in a leaf of its own.
 *
 * The clock used to live in `EmailAnalytics`, so every tick re-rendered the
 * whole card - four `<Area>`s, two gradient defs, both axes and the tooltip -
 * to repaint one line of 12px text. Isolating it means the chart re-renders
 * only when the chart data changes.
 *
 * Starting at null keeps the server and first client render identical; the
 * interval matches `formatDistance`'s minute granularity, so no tick is spent
 * producing the string that is already on screen.
 */
function UpdatedAgo({ generatedAt }: { generatedAt: number }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  if (now === null) {
    return null;
  }

  return (
    <>
      Updated{" "}
      {formatDistance(new Date(generatedAt), new Date(now), {
        addSuffix: true,
      })}
    </>
  );
}

/**
 * The scope prose for the reputation figure, behind a disclosure.
 *
 * These two sentences are the reason the card had a layout problem: three or
 * four lines of 12px text explaining which population the rates describe, set
 * in a 176px column, generating more height than the chart beside them. They
 * still matter - a reader who assumes the bounce rate is window-scoped will
 * misread it - but they are reference material, not something to re-read on
 * every visit.
 *
 * A popover rather than a tooltip: a tooltip cannot be opened by touch.
 */
function ReputationScope({ reputation }: { reputation: ReputationLabel }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          aria-label={`What "${reputation.title}" measures`}
          className="-my-2 text-muted-foreground"
          size="icon-sm"
          variant="ghost"
        >
          <Info className="size-3.5" />
        </Button>
      </PopoverTrigger>
      {/*
        Opens upward, into the header's whitespace. Anchored below or beside,
        the panel covered the two rates it exists to explain - the trigger sits
        in the middle of the rail, with the numbers under and after it.
      */}
      <PopoverContent align="start" className="w-72 text-sm" side="top">
        <p>{reputation.detail}</p>
        {reputation.note ? (
          <p className="mt-2 text-muted-foreground">{reputation.note}</p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function Figure({
  label,
  value,
  aside,
}: {
  label: string;
  value: string;
  aside?: string;
}) {
  return (
    <div>
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className="font-semibold text-2xl leading-none tabular-nums">
          {value}
        </span>
        {aside ? (
          <span className="text-muted-foreground text-sm">{aside}</span>
        ) : null}
      </div>
    </div>
  );
}

type SummaryProps = {
  overview:
    | {
        totalSent: number;
        totalDelivered: number;
        deliveryRate: number;
        bounceRate: number;
        complaintRate: number;
      }
    | undefined;
  generatedAt: number | undefined;
  reputation: ReputationLabel | null;
  reputationPartial: string | null;
  refreshFailed: boolean;
};

/**
 * The card's numbers, as one horizontal rail above the plot.
 *
 * They were a 200px column beside the chart, in three bordered tiles nested
 * inside the card - and the counts and the reputation rates were distinguished
 * only by a border alpha, which is too weak a signal to read as deliberate for
 * a distinction that actually matters: the counts are scoped to the selected
 * window, the rates are an all-time figure for the whole AWS account. Here the
 * split is carried by a rule and by type size, and nothing is boxed.
 */
function ActivitySummary({
  overview,
  generatedAt,
  reputation,
  reputationPartial,
  refreshFailed,
}: SummaryProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4 border-b pb-5">
      <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
        <Figure
          label="Sent"
          value={(overview?.totalSent ?? 0).toLocaleString()}
        />
        <Figure
          aside={`${(overview?.deliveryRate ?? 0).toFixed(1)}%`}
          label="Delivered"
          value={(overview?.totalDelivered ?? 0).toLocaleString()}
        />

        {/* A different population starts here. */}
        <div
          aria-hidden="true"
          className="@[540px]/card:block hidden h-10 w-px bg-border"
        />

        <div>
          <div className="flex items-center gap-1 text-muted-foreground text-xs">
            {reputation?.title ?? "Account reputation"}
            {reputation ? <ReputationScope reputation={reputation} /> : null}
          </div>
          <div className="mt-1.5 flex items-baseline gap-4 text-sm leading-none">
            <span className="font-medium tabular-nums">
              {(overview?.bounceRate ?? 0).toFixed(2)}%{" "}
              <span className="font-normal text-muted-foreground">bounces</span>
            </span>
            <span className="font-medium tabular-nums">
              {(overview?.complaintRate ?? 0).toFixed(3)}%{" "}
              <span className="font-normal text-muted-foreground">
                complaints
              </span>
            </span>
          </div>
          {/*
            Stays on the surface rather than going into the popover: a rate
            computed from an incomplete set of AWS accounts is a caveat about
            the number itself, not background reading.
          */}
          {reputationPartial ? (
            <p className="mt-1.5 text-destructive text-xs">
              {reputationPartial}
            </p>
          ) : null}
        </div>
      </div>

      {generatedAt === undefined ? null : (
        <p className="text-muted-foreground text-xs">
          <UpdatedAgo generatedAt={generatedAt} />
          {refreshFailed ? (
            <span className="text-destructive"> · refresh failed</span>
          ) : null}
        </p>
      )}
    </div>
  );
}

/**
 * A failed chart fetch used to render as "No emails sent in this period" -
 * the same defect as the table below it (audit finding F1), and a factual
 * claim about the customer's data that we had no basis to make.
 */
function ChartErrorState({
  isRetrying,
  onRetry,
}: {
  isRetrying: boolean;
  onRetry: () => void;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 text-center",
        PLOT_HEIGHT
      )}
    >
      <CircleAlert className="size-6 text-muted-foreground" />
      <div className="space-y-1">
        <p className="font-medium text-sm">Couldn't load email activity</p>
        <p className="max-w-sm text-muted-foreground text-sm">
          The request for your chart data failed. This is a problem reaching
          Wraps, not a change in your sending.
        </p>
      </div>
      <Button disabled={isRetrying} onClick={onRetry} size="touch">
        {isRetrying ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <RotateCw className="mr-2 h-4 w-4" />
        )}
        {isRetrying ? "Retrying..." : "Retry"}
      </Button>
    </div>
  );
}

/**
 * The legend, outside the plot.
 *
 * recharts' `<Legend>` takes its space out of the chart's height and centres
 * itself, which left a centred row of labels floating above a large gap. Out
 * here it is left-aligned under the axis it describes and the plot keeps every
 * pixel of `PLOT_HEIGHT`.
 */
function ChartLegend() {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
      {SERIES_ORDER.map((key) => (
        <span
          className="flex items-center gap-2 text-muted-foreground text-xs"
          key={key}
        >
          <SeriesLine series={SERIES[key]} />
          {SERIES[key].label}
        </span>
      ))}
    </div>
  );
}

type EmailAnalyticsProps = {
  orgSlug: string;
};

export function EmailAnalytics({ orgSlug }: EmailAnalyticsProps) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const reducedMotion = useReducedMotion();

  const daysParam = searchParams.get("days");
  const days =
    TIME_RANGES.find((r) => String(r.days) === daysParam)?.days ?? DEFAULT_DAYS;

  const { data, isError, isFetching, isLoading, refetch } = useEmailChartData(
    orgSlug,
    days
  );
  const meta = data?.meta;

  const [refreshFailed, setRefreshFailed] = useState(false);
  /**
   * Spoken once per refresh, and never on a timer.
   *
   * The visible "Updated N minutes ago" cannot be a live region - it rewrites
   * itself every minute and would interrupt the reader each time. This says
   * what happened, when something happened.
   */
  const [refreshStatus, setRefreshStatus] = useState("");

  function selectDays(next: string) {
    // Preserve every other filter on the URL — the window is not the only one.
    const params = new URLSearchParams(searchParams.toString());
    params.set("days", next);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  async function handleRefresh() {
    // Expire the server cache FIRST. Invalidating only the React Query cache
    // refetches a route wrapped in `unstable_cache`, which hands back the exact
    // same bytes — the spinner spins and nothing changes.
    const result = await refreshEmailChart(orgSlug);
    const failed = !result.ok && result.reason === "error";
    setRefreshFailed(failed);

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["emails", orgSlug] }),
      queryClient.invalidateQueries({
        queryKey: ["analytics", "email-chart", orgSlug],
      }),
    ]);

    setRefreshStatus(
      failed ? "Could not refresh email activity." : "Email activity refreshed."
    );
  }

  const overview = data?.overview;

  const chartData = useMemo(() => {
    if (!data?.volume) {
      return [];
    }

    return data.volume.map((v) => ({
      ...v,
      opened: v.opens,
      clicked: v.clicks,
    }));
  }, [data]);

  // Memoised beside the data it reads: it decides whether the Y axis is linear
  // or sqrt, so recomputing it on an unrelated render is a chance to hand
  // recharts a new axis for no reason.
  const maxValue = useMemo(
    () =>
      Math.max(
        0,
        ...chartData.map((d) => Math.max(d.sent || 0, d.delivered || 0))
      ),
    [chartData]
  );

  // Opens and clicks land on mail sent before the window, so a period can hold
  // real engagement with zero sends. Gating the empty state on `sent` alone
  // told the customer nothing happened while the data said otherwise.
  const hasActivity = chartData.some(
    (d) => d.sent > 0 || d.delivered > 0 || d.opened > 0 || d.clicked > 0
  );

  const range = TIME_RANGES.find((r) => r.days === days) ?? TIME_RANGES[1];
  const reputation = meta ? reputationScopeLabel(meta) : null;
  const reputationPartial = meta ? reputationPartialLabel(meta) : null;

  // The SVG conveys none of this to a screen reader, and recharts' keyboard
  // layer announces individual days, not the shape of the period.
  const chartSummary = `Email activity, ${range.long.toLowerCase()}: ${
    overview?.totalSent ?? 0
  } sent, ${overview?.totalDelivered ?? 0} delivered.`;

  return (
    <Card className="@container/card">
      <CardHeader>
        {/*
          A real <h2>. The card is a section of the page, not a container, and
          `role="heading" aria-level={2}` on a <div> bought the same outline
          entry with none of the semantics.

          No CardDescription: it carried EMAIL_COVERAGE_EXPLAINER, the same 200
          characters the Messages table prints a few hundred pixels below - and
          it opens "This list shows every message...", on a card that holds no
          list.
        */}
        <CardTitle asChild>
          <h2>Email Activity</h2>
        </CardTitle>
        <CardAction className="self-center">
          <ButtonGroup
            aria-label="Time range"
            className="@[767px]/card:flex hidden"
          >
            {TIME_RANGES.map((r) => (
              <Button
                aria-pressed={days === r.days}
                className="aria-pressed:bg-accent aria-pressed:text-accent-foreground"
                key={r.days}
                onClick={() => selectDays(String(r.days))}
                size="touch"
                variant="outline"
              >
                {r.short}
              </Button>
            ))}
            <RefreshButton
              label="Refresh email activity"
              onRefresh={handleRefresh}
            />
          </ButtonGroup>
          <ButtonGroup className="@[767px]/card:hidden flex">
            <Select onValueChange={selectDays} value={String(days)}>
              <SelectTrigger
                aria-label="Select time range"
                className="w-32 **:data-[slot=select-value]:block **:data-[slot=select-value]:truncate"
                size="touch"
              >
                <SelectValue placeholder="Last 7 days" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                {TIME_RANGES.map((r) => (
                  <SelectItem
                    className="rounded-lg"
                    key={r.days}
                    value={String(r.days)}
                  >
                    {r.long}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <RefreshButton
              label="Refresh email activity"
              onRefresh={handleRefresh}
            />
          </ButtonGroup>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p aria-live="polite" className="sr-only">
          {refreshStatus}
        </p>

        {isLoading && (
          // Mirrors the loaded card block for block. The old skeleton modelled
          // a 216px sidebar against a 452px real one, so the card grew by more
          // than 200px the moment data landed and shoved the Messages table
          // down the page.
          <div>
            <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4 border-b pb-5">
              <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
                <Skeleton className="h-11 w-20" />
                <Skeleton className="h-11 w-28" />
                <Skeleton className="h-11 w-56" />
              </div>
              <Skeleton className="h-4 w-32" />
            </div>
            <Skeleton className={cn("mt-6 w-full", PLOT_HEIGHT)} />
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-16" />
            </div>
          </div>
        )}

        {!isLoading && isError && (
          <ChartErrorState
            isRetrying={isFetching}
            onRetry={() => {
              captureEmailsErrorRetried({ surface: "chart" });
              refetch();
            }}
          />
        )}

        {!(isLoading || isError) && (
          <div>
            <ActivitySummary
              generatedAt={meta?.generatedAt}
              overview={overview}
              refreshFailed={refreshFailed}
              reputation={reputation}
              reputationPartial={reputationPartial}
            />

            <div className="mt-6 min-w-0">
              {hasActivity ? (
                <>
                  {/*
                    role="figure", not "img": accessibilityLayer puts a
                    focusable role="application" surface inside, and role="img"
                    makes its subtree presentational - which would hide the
                    keyboard path we just added.
                  */}
                  <ChartContainer
                    aria-label={chartSummary}
                    className={cn("aspect-auto w-full", PLOT_HEIGHT)}
                    config={chartConfig}
                    role="figure"
                  >
                    {/* accessibilityLayer makes the plot tabbable and
                        arrow-navigable; without it every number here was
                        mouse-hover only. */}
                    <AreaChart accessibilityLayer data={chartData}>
                      <defs>
                        <linearGradient
                          id="fillSent"
                          x1="0"
                          x2="0"
                          y1="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="var(--color-sent)"
                            stopOpacity={0.3}
                          />
                          <stop
                            offset="95%"
                            stopColor="var(--color-sent)"
                            stopOpacity={0.05}
                          />
                        </linearGradient>
                        <linearGradient
                          id="fillDelivered"
                          x1="0"
                          x2="0"
                          y1="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="var(--color-delivered)"
                            stopOpacity={0.3}
                          />
                          <stop
                            offset="95%"
                            stopColor="var(--color-delivered)"
                            stopOpacity={0.05}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        axisLine={false}
                        dataKey="date"
                        minTickGap={32}
                        tickFormatter={(value) => {
                          const date = new Date(value);
                          return date.toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          });
                        }}
                        tickLine={false}
                        tickMargin={8}
                      />
                      <YAxis {...countYAxisProps(maxValue)} />
                      <ChartTooltip
                        content={
                          <ChartTooltipContent
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
                      {/* type="linear": these are counted events, and monotone
                          splines invented peaks and fractional values between
                          days that never existed.

                          isAnimationActive is JS-driven, so the reduced-motion
                          rules in globals.css cannot reach it. */}
                      <Area
                        dataKey="sent"
                        fill="url(#fillSent)"
                        isAnimationActive={!reducedMotion}
                        stroke="var(--color-sent)"
                        strokeWidth={SERIES.sent.width}
                        type="linear"
                      />
                      <Area
                        dataKey="delivered"
                        fill="url(#fillDelivered)"
                        isAnimationActive={!reducedMotion}
                        stroke="var(--color-delivered)"
                        strokeDasharray={SERIES.delivered.dash}
                        strokeWidth={SERIES.delivered.width}
                        type="linear"
                      />
                      <Area
                        dataKey="opened"
                        fill="transparent"
                        isAnimationActive={!reducedMotion}
                        stroke="var(--color-opened)"
                        strokeDasharray={SERIES.opened.dash}
                        strokeWidth={SERIES.opened.width}
                        type="linear"
                      />
                      <Area
                        dataKey="clicked"
                        fill="transparent"
                        isAnimationActive={!reducedMotion}
                        stroke="var(--color-clicked)"
                        strokeDasharray={SERIES.clicked.dash}
                        strokeWidth={SERIES.clicked.width}
                        type="linear"
                      />
                    </AreaChart>
                  </ChartContainer>
                  <ChartLegend />
                </>
              ) : (
                <div
                  className={cn(
                    "flex items-center justify-center text-muted-foreground text-sm",
                    PLOT_HEIGHT
                  )}
                >
                  No email activity in this period
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
