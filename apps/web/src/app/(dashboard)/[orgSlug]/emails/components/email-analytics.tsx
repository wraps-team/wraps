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

const chartConfig = {
  sent: {
    label: "Sent",
    theme: {
      light: "oklch(0.55 0.12 250)",
      dark: "oklch(0.70 0.12 250)",
    },
  },
  delivered: {
    label: "Delivered",
    theme: {
      light: "oklch(0.50 0.15 160)",
      dark: "oklch(0.65 0.15 160)",
    },
  },
  opened: {
    label: "Opened",
    theme: {
      light: "oklch(0.55 0.15 80)",
      dark: "oklch(0.70 0.15 80)",
    },
  },
  clicked: {
    label: "Clicked",
    theme: {
      light: "oklch(0.50 0.18 30)",
      dark: "oklch(0.65 0.18 30)",
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
      <div className="rounded-lg border bg-card p-3">
        <div className="text-muted-foreground text-xs">Sent</div>
        <div className="font-semibold text-2xl tabular-nums">
          {overview?.totalSent.toLocaleString() ?? 0}
        </div>
      </div>
      <div className="rounded-lg border bg-card p-3">
        <div className="text-muted-foreground text-xs">Delivered</div>
        <div className="flex items-baseline gap-2">
          <span className="font-semibold text-2xl tabular-nums">
            {overview?.totalDelivered.toLocaleString() ?? 0}
          </span>
          <span className="text-muted-foreground text-sm">
            ({overview?.deliveryRate.toFixed(1) ?? 0}%)
          </span>
        </div>
      </div>

      <div className="mt-1 border-t pt-3">
        <div className="rounded-lg border border-dashed bg-muted/40 p-3">
          <div className="text-muted-foreground text-xs">
            {reputation?.title ?? "Account reputation"}
          </div>
          <div className="flex items-baseline gap-3 text-sm">
            <span>
              <span className="font-medium">
                {overview?.bounceRate.toFixed(2) ?? 0}%
              </span>{" "}
              <span className="text-muted-foreground">bounces</span>
            </span>
            <span>
              <span className="font-medium">
                {overview?.complaintRate.toFixed(3) ?? 0}%
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
    ...chartData.map((d) => Math.max(d.sent || 0, d.delivered || 0))
  );

  const range = TIME_RANGES.find((r) => r.days === days) ?? TIME_RANGES[1];
  const reputation = meta ? reputationScopeLabel(meta) : null;
  const reputationPartial = meta ? reputationPartialLabel(meta) : null;

  const updatedLabel =
    meta && now !== null
      ? `Updated ${formatDistance(new Date(meta.generatedAt), new Date(now), {
          addSuffix: true,
        })}`
      : null;

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Email Activity</CardTitle>
        <CardDescription>
          <span className="@[540px]/card:block hidden">
            {EMAIL_COVERAGE_EXPLAINER}
          </span>
          <span className="@[540px]/card:hidden">Email volume</span>
        </CardDescription>
        <CardAction className="self-center">
          <ButtonGroup className="@[767px]/card:flex hidden">
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
            <RefreshButton onRefresh={handleRefresh} />
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
              {chartData.length === 0 ||
              chartData.every((d) => d.sent === 0) ? (
                <div className="flex h-[280px] items-center justify-center text-muted-foreground text-sm">
                  No emails sent in this period
                </div>
              ) : (
                <ChartContainer
                  className="aspect-auto h-[280px] w-full"
                  config={chartConfig}
                >
                  <AreaChart data={chartData}>
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
                    <Area
                      dataKey="sent"
                      fill="url(#fillSent)"
                      stroke="var(--color-sent)"
                      strokeWidth={2}
                      type="monotone"
                    />
                    <Area
                      dataKey="delivered"
                      fill="url(#fillDelivered)"
                      stroke="var(--color-delivered)"
                      strokeWidth={2}
                      type="monotone"
                    />
                    <Area
                      dataKey="opened"
                      fill="transparent"
                      stroke="var(--color-opened)"
                      strokeDasharray="4 2"
                      strokeWidth={1.5}
                      type="monotone"
                    />
                    <Area
                      dataKey="clicked"
                      fill="transparent"
                      stroke="var(--color-clicked)"
                      strokeDasharray="4 2"
                      strokeWidth={1.5}
                      type="monotone"
                    />
                  </AreaChart>
                </ChartContainer>
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
