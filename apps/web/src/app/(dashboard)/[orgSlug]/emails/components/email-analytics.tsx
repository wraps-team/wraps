"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ButtonGroup } from "@wraps/ui/components/ui/button-group";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@wraps/ui/components/ui/chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@wraps/ui/components/ui/select";
import { Skeleton } from "@wraps/ui/components/ui/skeleton";
import { formatDistance } from "date-fns";
import { CircleAlert, Loader2, RotateCw } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { Area, AreaChart, CartesianGrid, Legend, XAxis, YAxis } from "recharts";
import { refreshEmailChart } from "@/actions/analytics";
import { Button } from "@/components/ui/button";
import { RefreshButton } from "@/components/ui/refresh-button";
import {
  EMAIL_COVERAGE_EXPLAINER,
  type ReputationLabel,
  reputationPartialLabel,
  reputationScopeLabel,
} from "@/lib/analytics-scope";
import { countYAxisProps } from "@/lib/chart-axis";
import { useEmailChartData } from "../analytics/hooks/use-analytics";
import { captureEmailsErrorRetried } from "../lib/analytics";

/**
 * Colour alone cannot carry four series, so every series also owns a stroke
 * treatment. `sent` and `delivered` are near-identical for a healthy account -
 * a 100%-delivery day drew `delivered` exactly on top of `sent` and the legend
 * advertised a "Sent" colour that appeared nowhere on the canvas.
 */
const SERIES_STROKE = {
  sent: { dash: undefined, width: 3 },
  delivered: { dash: "6 3", width: 2.5 },
  opened: { dash: "4 2", width: 1.5 },
  clicked: { dash: "1 3", width: 1.5 },
} as const;

/** A legend swatch that mirrors the line it stands for, not just its hue. */
function seriesSwatch(series: keyof typeof SERIES_STROKE) {
  const { dash, width } = SERIES_STROKE[series];

  return function SeriesSwatch() {
    return (
      <svg aria-hidden="true" fill="none" viewBox="0 0 12 12">
        <line
          stroke={`var(--color-${series})`}
          strokeDasharray={dash}
          strokeLinecap="round"
          strokeWidth={width}
          x1="1"
          x2="11"
          y1="6"
          y2="6"
        />
      </svg>
    );
  };
}

const chartConfig = {
  sent: {
    label: "Sent",
    icon: seriesSwatch("sent"),
    theme: {
      light: "oklch(0.55 0.12 250)",
      dark: "oklch(0.70 0.12 250)",
    },
  },
  delivered: {
    label: "Delivered",
    icon: seriesSwatch("delivered"),
    theme: {
      light: "oklch(0.50 0.15 160)",
      dark: "oklch(0.65 0.15 160)",
    },
  },
  opened: {
    label: "Opened",
    icon: seriesSwatch("opened"),
    theme: {
      light: "oklch(0.55 0.15 80)",
      dark: "oklch(0.70 0.15 80)",
    },
  },
  // Deliberately not red: --destructive is oklch(0.704 0.191 22.216) in dark
  // mode, so a red "Clicked" line read as a failure on a card that also
  // reports bounces and complaints.
  clicked: {
    label: "Clicked",
    icon: seriesSwatch("clicked"),
    theme: {
      light: "oklch(0.48 0.20 320)",
      dark: "oklch(0.72 0.16 320)",
    },
  },
} satisfies ChartConfig;

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

type MetricsSidebarProps = {
  overview:
    | {
        totalSent: number;
        totalDelivered: number;
        deliveryRate: number;
        bounceRate: number;
        complaintRate: number;
      }
    | undefined;
  rangeLabel: string;
  reputation: ReputationLabel | null;
  reputationPartial: string | null;
  updatedLabel: string | null;
  refreshFailed: boolean;
};

/**
 * The counts and the reputation rates side by side, but deliberately not as one
 * set: the counts are scoped to the selected window, the reputation rates are
 * an all-time figure for the whole AWS account. They used to render identically,
 * which invited reading them as the same population.
 */
function MetricsSidebar({
  overview,
  rangeLabel,
  reputation,
  reputationPartial,
  updatedLabel,
  refreshFailed,
}: MetricsSidebarProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="text-muted-foreground text-xs uppercase tracking-wide">
        {rangeLabel}
      </div>
      <div className="rounded-lg border bg-muted/40 p-3">
        <div className="text-muted-foreground text-xs">Sent</div>
        <div className="font-semibold text-2xl tabular-nums">
          {overview?.totalSent.toLocaleString() ?? 0}
        </div>
      </div>
      <div className="rounded-lg border bg-muted/40 p-3">
        <div className="text-muted-foreground text-xs">Delivered</div>
        <div className="flex items-baseline gap-2">
          <span className="font-semibold text-2xl tabular-nums">
            {overview?.totalDelivered.toLocaleString() ?? 0}
          </span>
          <span className="text-muted-foreground text-sm">
            ({(overview?.deliveryRate ?? 0).toFixed(1)}%)
          </span>
        </div>
      </div>

      <div className="mt-1 border-t pt-3">
        <div className="rounded-lg border border-border/50 p-3">
          <div className="text-muted-foreground text-xs">
            {reputation?.title ?? "Account reputation"}
          </div>
          <div className="flex items-baseline gap-3 text-sm">
            <span>
              <span className="font-medium">
                {(overview?.bounceRate ?? 0).toFixed(2)}%
              </span>{" "}
              <span className="text-muted-foreground">bounces</span>
            </span>
            <span>
              <span className="font-medium">
                {(overview?.complaintRate ?? 0).toFixed(3)}%
              </span>{" "}
              <span className="text-muted-foreground">complaints</span>
            </span>
          </div>
          {reputation ? (
            <div className="mt-1 text-muted-foreground text-xs">
              {reputation.detail}
            </div>
          ) : null}
          {reputation?.note ? (
            <div className="mt-1 text-muted-foreground text-xs">
              {reputation.note}
            </div>
          ) : null}
          {reputationPartial ? (
            <div className="mt-1 text-destructive text-xs">
              {reputationPartial}
            </div>
          ) : null}
        </div>
      </div>

      {updatedLabel ? (
        <div className="text-muted-foreground text-xs">
          {updatedLabel}
          {refreshFailed ? " (refresh failed)" : ""}
        </div>
      ) : null}
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
    <div className="flex h-[280px] flex-col items-center justify-center gap-3 text-center">
      <CircleAlert className="size-6 text-muted-foreground" />
      <div className="space-y-1">
        <p className="font-medium text-sm">Couldn't load email activity</p>
        <p className="max-w-sm text-muted-foreground text-sm">
          The request for your chart data failed. This is a problem reaching
          Wraps, not a change in your sending.
        </p>
      </div>
      <Button disabled={isRetrying} onClick={onRetry} size="sm">
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

type EmailAnalyticsProps = {
  orgSlug: string;
};

export function EmailAnalytics({ orgSlug }: EmailAnalyticsProps) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const daysParam = searchParams.get("days");
  const days =
    TIME_RANGES.find((r) => String(r.days) === daysParam)?.days ?? DEFAULT_DAYS;

  const { data, isError, isFetching, isLoading, refetch } = useEmailChartData(
    orgSlug,
    days
  );
  const meta = data?.meta;

  const [refreshFailed, setRefreshFailed] = React.useState(false);

  // Read the clock on the client only, then keep it ticking, so "Updated N
  // minutes ago" ages in place instead of freezing at first render. Starting at
  // null keeps the server and first client render identical.
  const [now, setNow] = React.useState<number | null>(null);
  React.useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

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
    setRefreshFailed(!result.ok && result.reason === "error");

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["emails", orgSlug] }),
      queryClient.invalidateQueries({
        queryKey: ["analytics", "email-chart", orgSlug],
      }),
    ]);
  }

  const overview = data?.overview;

  const chartData = React.useMemo(() => {
    if (!data?.volume) {
      return [];
    }

    return data.volume.map((v) => ({
      ...v,
      opened: v.opens,
      clicked: v.clicks,
    }));
  }, [data]);

  const maxValue = Math.max(
    0,
    ...chartData.map((d) => Math.max(d.sent || 0, d.delivered || 0))
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

  const updatedLabel =
    meta && now !== null
      ? `Updated ${formatDistance(new Date(meta.generatedAt), new Date(now), {
          addSuffix: true,
        })}`
      : null;

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle aria-level={2} role="heading">
          Email Activity
        </CardTitle>
        <CardDescription>
          <span className="@[540px]/card:block hidden">
            {EMAIL_COVERAGE_EXPLAINER}
          </span>
          <span className="@[540px]/card:hidden">Email volume</span>
        </CardDescription>
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
                size="sm"
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
          <Select onValueChange={selectDays} value={String(days)}>
            <SelectTrigger
              aria-label="Select time range"
              className="flex @[767px]/card:hidden w-32 **:data-[slot=select-value]:block **:data-[slot=select-value]:truncate"
              size="sm"
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
            className="@[767px]/card:hidden"
            label="Refresh email activity"
            onRefresh={handleRefresh}
          />
        </CardAction>
      </CardHeader>
      <CardContent className="px-2 pt-2 sm:px-6 sm:pt-3">
        {isLoading && (
          <div className="grid grid-cols-1 gap-6 @[540px]/card:grid-cols-[1fr_200px]">
            <Skeleton className="h-[280px] w-full" />
            <div className="flex flex-col gap-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
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
          <div className="grid grid-cols-1 gap-6 @[540px]/card:grid-cols-[1fr_200px]">
            {/* Chart */}
            <div className="min-w-0">
              {hasActivity ? (
                // role="figure", not "img": accessibilityLayer puts a
                // focusable role="application" surface inside, and role="img"
                // makes its subtree presentational - which would hide the
                // keyboard path we just added.
                <ChartContainer
                  aria-label={chartSummary}
                  className="aspect-auto h-[280px] w-full"
                  config={chartConfig}
                  role="figure"
                >
                  {/* accessibilityLayer makes the plot tabbable and
                      arrow-navigable; without it every number here was
                      mouse-hover only. */}
                  <AreaChart accessibilityLayer data={chartData}>
                    <defs>
                      <linearGradient id="fillSent" x1="0" x2="0" y1="0" y2="1">
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
                    <Legend content={<ChartLegendContent />} />
                    {/* type="linear": these are counted events, and monotone
                        splines invented peaks and fractional values between
                        days that never existed. */}
                    <Area
                      dataKey="sent"
                      fill="url(#fillSent)"
                      stroke="var(--color-sent)"
                      strokeWidth={SERIES_STROKE.sent.width}
                      type="linear"
                    />
                    <Area
                      dataKey="delivered"
                      fill="url(#fillDelivered)"
                      stroke="var(--color-delivered)"
                      strokeDasharray={SERIES_STROKE.delivered.dash}
                      strokeWidth={SERIES_STROKE.delivered.width}
                      type="linear"
                    />
                    <Area
                      dataKey="opened"
                      fill="transparent"
                      stroke="var(--color-opened)"
                      strokeDasharray={SERIES_STROKE.opened.dash}
                      strokeWidth={SERIES_STROKE.opened.width}
                      type="linear"
                    />
                    <Area
                      dataKey="clicked"
                      fill="transparent"
                      stroke="var(--color-clicked)"
                      strokeDasharray={SERIES_STROKE.clicked.dash}
                      strokeWidth={SERIES_STROKE.clicked.width}
                      type="linear"
                    />
                  </AreaChart>
                </ChartContainer>
              ) : (
                <div className="flex h-[280px] items-center justify-center text-muted-foreground text-sm">
                  No email activity in this period
                </div>
              )}
            </div>

            <MetricsSidebar
              overview={overview}
              rangeLabel={range.long}
              refreshFailed={refreshFailed}
              reputation={reputation}
              reputationPartial={reputationPartial}
              updatedLabel={updatedLabel}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
