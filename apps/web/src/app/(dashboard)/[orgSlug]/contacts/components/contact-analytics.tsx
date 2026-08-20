"use client";

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
import { useRouter } from "next/navigation";
import * as React from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  type ContactAnalytics as ContactAnalyticsData,
  type ContactListHealth,
  getContactAnalytics,
} from "@/actions/contacts-analytics";
import { Button } from "@/components/ui/button";
import { RefreshButton } from "@/components/ui/refresh-button";
import { useIsMobile } from "@/hooks/use-mobile";
import { countYAxisProps } from "@/lib/chart-axis";
import { SERIES_COLOR } from "@/lib/chart-series";

const chartConfig = {
  count: {
    label: "New Contacts",
    color: SERIES_COLOR.success,
  },
} satisfies ChartConfig;

type ContactAnalyticsProps = {
  organizationId: string;
};

/**
 * Contacts by email status.
 *
 * For someone who owns the SES account this is the most useful number on the
 * page — bounces and complaints are what cost them their sending reputation —
 * and the card carried no version of it at all.
 */
function ListHealth({ health }: { health: ContactListHealth }) {
  const rows: Array<{ label: string; value: number; tone: string }> = [
    { label: "Active", value: health.active, tone: "text-success" },
    {
      label: "Unsubscribed",
      value: health.unsubscribed,
      tone: "text-muted-foreground",
    },
    { label: "Bounced", value: health.bounced, tone: "text-destructive" },
    { label: "Complained", value: health.complained, tone: "text-destructive" },
  ];

  if (health.suppressed > 0) {
    rows.push({
      label: "Suppressed",
      value: health.suppressed,
      tone: "text-warning",
    });
  }

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-muted-foreground text-xs">List health</div>
      <dl className="mt-1 space-y-0.5">
        {rows.map((row) => (
          <div className="flex items-baseline justify-between" key={row.label}>
            <dt className="text-muted-foreground text-xs">{row.label}</dt>
            <dd className={`font-medium text-sm tabular-nums ${row.tone}`}>
              {row.value.toLocaleString()}
            </dd>
          </div>
        ))}
      </dl>
      {health.noEmailStatus > 0 && (
        <p className="mt-1 text-muted-foreground text-xs">
          {health.noEmailStatus.toLocaleString()} without an email status
        </p>
      )}
    </div>
  );
}

export function ContactAnalytics({ organizationId }: ContactAnalyticsProps) {
  const isMobile = useIsMobile();
  const router = useRouter();
  const [timeRange, setTimeRange] = React.useState("30d");
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [analytics, setAnalytics] = React.useState<ContactAnalyticsData | null>(
    null
  );
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (isMobile) {
      setTimeRange("7d");
    }
  }, [isMobile]);

  React.useEffect(() => {
    async function fetchAnalytics() {
      setIsLoading(true);
      setError(null);
      const days = timeRange === "30d" ? 30 : 7;
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const result = await getContactAnalytics(organizationId, days, tz);
      if (result.success) {
        setAnalytics(result.analytics);
      } else {
        setError(result.error);
      }
      setIsLoading(false);
    }
    fetchAnalytics();
  }, [organizationId, timeRange, refreshKey]);

  function handleRefresh() {
    setRefreshKey((k) => k + 1);
    router.refresh();
  }

  const chartData = analytics?.dailyGrowth || [];
  const maxValue = Math.max(...chartData.map((d) => d.count || 0));

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Contact Growth</CardTitle>
        <CardDescription>
          <span className="@[540px]/card:block hidden">
            New contacts added over time
          </span>
          <span className="@[540px]/card:hidden">New contacts</span>
        </CardDescription>
        <CardAction className="self-center">
          <ButtonGroup className="@[767px]/card:flex hidden">
            <Button
              aria-pressed={timeRange === "30d"}
              className="aria-pressed:bg-accent aria-pressed:text-accent-foreground"
              onClick={() => setTimeRange("30d")}
              size="touch"
              variant="outline"
            >
              30 days
            </Button>
            <Button
              aria-pressed={timeRange === "7d"}
              className="aria-pressed:bg-accent aria-pressed:text-accent-foreground"
              onClick={() => setTimeRange("7d")}
              size="touch"
              variant="outline"
            >
              7 days
            </Button>
            <RefreshButton onRefresh={handleRefresh} />
          </ButtonGroup>
          <Select onValueChange={setTimeRange} value={timeRange}>
            <SelectTrigger
              aria-label="Select time range"
              className="flex @[767px]/card:hidden w-32 **:data-[slot=select-value]:block **:data-[slot=select-value]:truncate"
              size="touch"
            >
              <SelectValue placeholder="30 days" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem className="rounded-lg" value="30d">
                30 days
              </SelectItem>
              <SelectItem className="rounded-lg" value="7d">
                7 days
              </SelectItem>
            </SelectContent>
          </Select>
          <RefreshButton
            className="@[767px]/card:hidden"
            onRefresh={handleRefresh}
          />
        </CardAction>
      </CardHeader>
      <CardContent className="px-2 pt-2 sm:px-6 sm:pt-3">
        {isLoading ? (
          <div className="grid grid-cols-1 gap-6 @[540px]/card:grid-cols-[1fr_200px]">
            <Skeleton className="h-[250px] w-full" />
            <div className="flex flex-col gap-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          </div>
        ) : error ? (
          <div className="flex h-[250px] items-center justify-center text-muted-foreground text-sm">
            Failed to load analytics
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 @[540px]/card:grid-cols-[1fr_200px]">
            {/* Chart */}
            <div className="min-w-0">
              {chartData.length === 0 ||
              chartData.every((d) => d.count === 0) ? (
                <div className="flex h-[250px] items-center justify-center text-muted-foreground text-sm">
                  No new contacts in this period
                </div>
              ) : (
                <ChartContainer
                  className="aspect-auto h-[250px] w-full"
                  config={chartConfig}
                >
                  <AreaChart accessibilityLayer data={chartData}>
                    <defs>
                      <linearGradient
                        id="fillCount"
                        x1="0"
                        x2="0"
                        y1="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="var(--color-count)"
                          stopOpacity={0.4}
                        />
                        <stop
                          offset="95%"
                          stopColor="var(--color-count)"
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
                    <Area
                      dataKey="count"
                      fill="url(#fillCount)"
                      stroke="var(--color-count)"
                      strokeWidth={2}
                      type="monotone"
                    />
                  </AreaChart>
                </ChartContainer>
              )}
            </div>

            {/* Metrics */}
            <div className="flex flex-col gap-3">
              <div className="rounded-lg border bg-card p-3">
                <div className="text-muted-foreground text-xs">
                  All contacts
                </div>
                <div className="font-semibold text-2xl tabular-nums">
                  {analytics?.totalContacts.toLocaleString()}
                </div>
                {/* This card is organization-wide and the table below is
                    filtered, so the number said "Total Contacts 1,993" over a
                    table reading "Showing 50 of 173". Say which one it is. */}
                <div className="text-muted-foreground text-xs">
                  Whole organization, not the filtered list below
                </div>
              </div>
              {analytics && <ListHealth health={analytics.listHealth} />}
              <div className="rounded-lg border bg-card p-3">
                <div className="text-muted-foreground text-xs">
                  New This Period
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold text-2xl tabular-nums">
                    +{analytics?.newContactsThisPeriod.toLocaleString()}
                  </span>
                  {analytics && analytics.growthPercent !== 0 && (
                    <span
                      className={`text-sm ${
                        analytics.growthPercent > 0
                          ? "text-success"
                          : "text-destructive"
                      }`}
                    >
                      {analytics.growthPercent > 0 ? "+" : ""}
                      {analytics.growthPercent}%
                    </span>
                  )}
                </div>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <div className="text-muted-foreground text-xs">Engagement</div>
                <div className="flex items-baseline gap-3 text-sm">
                  <span>
                    <span className="font-medium">
                      {analytics?.avgOpenRate}%
                    </span>{" "}
                    <span className="text-muted-foreground">opens</span>
                  </span>
                  <span>
                    <span className="font-medium">
                      {analytics?.avgClickRate}%
                    </span>{" "}
                    <span className="text-muted-foreground">clicks</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
