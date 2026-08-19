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
import * as React from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { SERIES_COLOR } from "@/lib/chart-series";
import { useEngagementData } from "../hooks/use-analytics";

const chartConfig = {
  // `hsl(var(--primary))` was not a colour at all: --primary is an oklch()
  // value, so the declaration was invalid and this series rendered unpainted.
  openRate: {
    label: "Open Rate",
    color: SERIES_COLOR.attention,
  },
  clickRate: {
    label: "Click Rate",
    color: SERIES_COLOR.engagement,
  },
  ctr: {
    label: "Click-to-Open Rate",
    color: SERIES_COLOR.success,
  },
} satisfies ChartConfig;

export function EngagementChart({ orgSlug }: { orgSlug: string }) {
  const isMobile = useIsMobile();
  const [timeRange, setTimeRange] = React.useState("90d");

  React.useEffect(() => {
    if (isMobile) {
      setTimeRange("7d");
    }
  }, [isMobile]);

  const days = timeRange === "90d" ? 90 : timeRange === "30d" ? 30 : 7;
  const {
    data: engagementData,
    isLoading,
    error,
  } = useEngagementData(orgSlug, days);

  const chartData = engagementData || [];

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Engagement Metrics</CardTitle>
        <CardDescription>
          <span className="@[540px]/card:block hidden">
            Open rates, click rates, and click-to-open ratios over time
          </span>
          <span className="@[540px]/card:hidden">Engagement trends</span>
        </CardDescription>
        <CardAction className="self-center">
          <ButtonGroup className="@[767px]/card:flex hidden">
            <Button
              aria-pressed={timeRange === "90d"}
              className="aria-pressed:bg-accent aria-pressed:text-accent-foreground"
              onClick={() => setTimeRange("90d")}
              size="sm"
              variant="outline"
            >
              90 days
            </Button>
            <Button
              aria-pressed={timeRange === "30d"}
              className="aria-pressed:bg-accent aria-pressed:text-accent-foreground"
              onClick={() => setTimeRange("30d")}
              size="sm"
              variant="outline"
            >
              30 days
            </Button>
            <Button
              aria-pressed={timeRange === "7d"}
              className="aria-pressed:bg-accent aria-pressed:text-accent-foreground"
              onClick={() => setTimeRange("7d")}
              size="sm"
              variant="outline"
            >
              7 days
            </Button>
          </ButtonGroup>
          <Select onValueChange={setTimeRange} value={timeRange}>
            <SelectTrigger
              aria-label="Select time range"
              className="flex @[767px]/card:hidden w-32 **:data-[slot=select-value]:block **:data-[slot=select-value]:truncate"
              size="sm"
            >
              <SelectValue placeholder="90 days" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem className="rounded-lg" value="90d">
                90 days
              </SelectItem>
              <SelectItem className="rounded-lg" value="30d">
                30 days
              </SelectItem>
              <SelectItem className="rounded-lg" value="7d">
                7 days
              </SelectItem>
            </SelectContent>
          </Select>
        </CardAction>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        {isLoading ? (
          <Skeleton className="h-[300px] w-full" />
        ) : error ? (
          <div className="flex h-[300px] items-center justify-center text-muted-foreground text-sm">
            Failed to load engagement data
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex h-[300px] items-center justify-center text-muted-foreground text-sm">
            No data available for this time period
          </div>
        ) : (
          <ChartContainer
            className="aspect-auto h-[300px] w-full"
            config={chartConfig}
          >
            <LineChart accessibilityLayer data={chartData}>
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
              <YAxis
                axisLine={false}
                tickFormatter={(value) => `${value}%`}
                tickLine={false}
                tickMargin={8}
              />
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
              <Line
                dataKey="openRate"
                dot={false}
                stroke="var(--color-openRate)"
                strokeWidth={2}
                type="monotone"
              />
              <Line
                dataKey="clickRate"
                dot={false}
                stroke="var(--color-clickRate)"
                strokeWidth={2}
                type="monotone"
              />
              <Line
                dataKey="ctr"
                dot={false}
                stroke="var(--color-ctr)"
                strokeWidth={2}
                type="monotone"
              />
            </LineChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
