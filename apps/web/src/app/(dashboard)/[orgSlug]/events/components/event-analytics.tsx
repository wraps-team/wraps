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
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Label,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  type EventAnalytics as EventAnalyticsData,
  getEventAnalytics,
} from "@/actions/events";
import { Button } from "@/components/ui/button";
import { RefreshButton } from "@/components/ui/refresh-button";
import { useIsMobile } from "@/hooks/use-mobile";
import { countYAxisProps } from "@/lib/chart-axis";
import { SERIES_CATEGORICAL, SERIES_COLOR } from "@/lib/chart-series";

const areaChartConfig = {
  count: {
    label: "Events",
    color: SERIES_COLOR.volume,
  },
} satisfies ChartConfig;

const pieColors = SERIES_CATEGORICAL;

type EventAnalyticsProps = {
  organizationId: string;
};

export function EventAnalytics({ organizationId }: EventAnalyticsProps) {
  const isMobile = useIsMobile();
  const router = useRouter();
  const [timeRange, setTimeRange] = React.useState("30d");
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [analytics, setAnalytics] = React.useState<EventAnalyticsData | null>(
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
      const result = await getEventAnalytics(organizationId, days, tz);
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

  const dailyData = analytics?.dailyEvents || [];
  const maxDailyCount = Math.max(...dailyData.map((d) => d.count || 0));
  const topEventsData = analytics?.topEventNames || [];

  const pieChartConfig = React.useMemo(() => {
    const config: ChartConfig = {};
    for (const [i, event] of topEventsData.entries()) {
      config[event.name] = {
        label: event.name,
        color: pieColors[i % pieColors.length],
      };
    }
    return config;
  }, [topEventsData]);

  const topEventsTotal = topEventsData.reduce((sum, e) => sum + e.count, 0);

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Event Activity</CardTitle>
        <CardDescription>
          <span className="@[540px]/card:block hidden">
            Custom events tracked from your application
          </span>
          <span className="@[540px]/card:hidden">Event tracking</span>
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
          <div className="grid grid-cols-1 gap-6 @[540px]/card:grid-cols-[1fr_auto] @[800px]/card:grid-cols-[1fr_auto_120px]">
            <Skeleton className="h-[200px] w-full" />
            <Skeleton className="h-[160px] w-[260px]" />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          </div>
        ) : error ? (
          <div className="flex h-[200px] items-center justify-center text-muted-foreground text-sm">
            Failed to load analytics
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 @[540px]/card:grid-cols-[1fr_auto] @[800px]/card:grid-cols-[1fr_auto_120px]">
            {/* Events Over Time Chart */}
            <div className="min-w-0">
              <div className="mb-2 font-medium text-muted-foreground text-sm">
                Events Over Time
              </div>
              {dailyData.length === 0 ||
              dailyData.every((d) => d.count === 0) ? (
                <div className="flex h-[200px] items-center justify-center text-muted-foreground text-sm">
                  No events in this period
                </div>
              ) : (
                <ChartContainer
                  className="aspect-auto h-[200px] w-full"
                  config={areaChartConfig}
                >
                  <AreaChart accessibilityLayer data={dailyData}>
                    <defs>
                      <linearGradient
                        id="fillEvents"
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
                    <YAxis {...countYAxisProps(maxDailyCount)} width={40} />
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
                      fill="url(#fillEvents)"
                      stroke="var(--color-count)"
                      strokeWidth={2}
                      type="monotone"
                    />
                  </AreaChart>
                </ChartContainer>
              )}
            </div>

            {/* Top Events Donut */}
            <div className="min-w-0">
              <div className="mb-2 font-medium text-muted-foreground text-sm">
                Top Events
              </div>
              {topEventsData.length === 0 ? (
                <div className="flex h-[200px] items-center justify-center text-muted-foreground text-sm">
                  No events in this period
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <ChartContainer
                    className="aspect-square h-[160px] shrink-0"
                    config={pieChartConfig}
                  >
                    <PieChart>
                      <ChartTooltip
                        content={<ChartTooltipContent hideLabel />}
                      />
                      <Pie
                        data={topEventsData}
                        dataKey="count"
                        innerRadius={40}
                        nameKey="name"
                        outerRadius={65}
                        paddingAngle={2}
                        strokeWidth={0}
                      >
                        {topEventsData.map((_entry, index) => (
                          <Cell
                            fill={pieColors[index % pieColors.length]}
                            key={`cell-${index}`}
                          />
                        ))}
                        <Label
                          content={({ viewBox }) => {
                            if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                              return (
                                <text
                                  dominantBaseline="middle"
                                  textAnchor="middle"
                                  x={viewBox.cx}
                                  y={viewBox.cy}
                                >
                                  <tspan
                                    className="fill-foreground font-semibold text-base"
                                    x={viewBox.cx}
                                    y={viewBox.cy}
                                  >
                                    {topEventsTotal.toLocaleString()}
                                  </tspan>
                                </text>
                              );
                            }
                          }}
                        />
                      </Pie>
                    </PieChart>
                  </ChartContainer>
                  <div className="flex flex-col gap-1">
                    {topEventsData.map((event, index) => (
                      <div
                        className="flex items-center gap-2 text-xs"
                        key={event.name}
                      >
                        <div
                          className="size-2 shrink-0 rounded-full"
                          style={{
                            backgroundColor:
                              pieColors[index % pieColors.length],
                          }}
                        />
                        <span className="truncate text-muted-foreground">
                          {event.name}
                        </span>
                        <span className="ml-auto shrink-0 font-medium tabular-nums">
                          {event.count.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Stats */}
            <div className="flex flex-col gap-2">
              <div className="rounded-lg border bg-card p-2.5 text-center">
                <div className="font-semibold text-xl tabular-nums">
                  {analytics?.eventsThisPeriod.toLocaleString()}
                </div>
                <div className="text-muted-foreground text-xs">Events</div>
              </div>
              <div className="rounded-lg border bg-card p-2.5 text-center">
                <div className="font-semibold text-xl tabular-nums">
                  {analytics?.activeContacts.toLocaleString()}
                </div>
                <div className="text-muted-foreground text-xs">Active</div>
              </div>
              <div className="rounded-lg border bg-card p-2.5 text-center">
                <div className="font-semibold text-xl tabular-nums">
                  {analytics?.avgEventsPerContact}
                </div>
                <div className="text-muted-foreground text-xs">Avg/Contact</div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
