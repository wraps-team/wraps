"use client";

import * as React from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useIsMobile } from "@/hooks/use-mobile";
import { useVolumeData } from "../hooks/use-analytics";

const chartConfig = {
  sent: {
    label: "Sent",
    theme: {
      light: "oklch(0.45 0.15 250)", // Deep blue (like blue-700)
      dark: "oklch(0.65 0.15 250)", // Light blue (like blue-400)
    },
  },
} satisfies ChartConfig;

function createYAxisFormatter(data: any[]) {
  // Find the maximum value across all data points
  const maxValue = Math.max(
    ...data.flatMap((d) => [d.sent || 0, d.delivered || 0, d.bounced || 0])
  );

  // Determine the appropriate scale based on max value
  if (maxValue >= 100_000) {
    // Use 100k, 200k, etc.
    return (value: number) => `${Math.round(value / 1000)}k`;
  }
  if (maxValue >= 10_000) {
    // Use 10.0k, 20.0k, etc.
    return (value: number) => `${(value / 1000).toFixed(1)}k`;
  }
  if (maxValue >= 1000) {
    // Use 1.0k, 2.0k, etc.
    return (value: number) => `${(value / 1000).toFixed(1)}k`;
  }
  if (maxValue >= 100) {
    // Use 100, 200, etc.
    return (value: number) => `${Math.round(value / 100) * 100}`;
  }
  if (maxValue >= 10) {
    // Use 10, 20, etc.
    return (value: number) => `${Math.round(value / 10) * 10}`;
  }
  // Use 1, 2, 3, etc.
  return (value: number) => `${Math.round(value)}`;
}

export function EmailVolumeChart({ orgSlug }: { orgSlug: string }) {
  const isMobile = useIsMobile();
  const [timeRange, setTimeRange] = React.useState("90d");

  React.useEffect(() => {
    if (isMobile) {
      setTimeRange("7d");
    }
  }, [isMobile]);

  const days = timeRange === "90d" ? 90 : timeRange === "30d" ? 30 : 7;
  const { data: volumeData, isLoading, error } = useVolumeData(orgSlug, days);

  const chartData = volumeData || [];

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Email Volume</CardTitle>
        <CardDescription>
          <span className="@[540px]/card:block hidden">
            Daily email sending volume over time
          </span>
          <span className="@[540px]/card:hidden">Daily volume</span>
        </CardDescription>
        <CardAction>
          <ToggleGroup
            className="*:data-[slot=toggle-group-item]:!px-4 @[767px]/card:flex hidden"
            onValueChange={setTimeRange}
            type="single"
            value={timeRange}
            variant="outline"
          >
            <ToggleGroupItem value="90d">90 days</ToggleGroupItem>
            <ToggleGroupItem value="30d">30 days</ToggleGroupItem>
            <ToggleGroupItem value="7d">7 days</ToggleGroupItem>
          </ToggleGroup>
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
            Failed to load volume data
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
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="fillSent" x1="0" x2="0" y1="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="var(--color-sent)"
                    stopOpacity={0.4}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--color-sent)"
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
              <YAxis
                axisLine={false}
                tickFormatter={createYAxisFormatter(chartData)}
                tickLine={false}
                tickMargin={8}
              />
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
                dataKey="sent"
                fill="url(#fillSent)"
                stroke="var(--color-sent)"
                strokeWidth={2}
                type="monotone"
              />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
