"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
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
import { useBounceData } from "../hooks/use-analytics";

const chartConfig = {
  bounceRate: {
    label: "Bounce Rate",
    theme: {
      light: "oklch(0.5 0.15 50)", // Deep orange (like orange-700)
      dark: "oklch(0.7 0.15 35)", // Light orange (like orange-400)
    },
  },
} satisfies ChartConfig;

function formatPercentage(value: number) {
  return `${value.toFixed(1)}%`;
}

export function BounceTypeChart({ orgSlug }: { orgSlug: string }) {
  const isMobile = useIsMobile();
  const [timeRange, setTimeRange] = React.useState("30d");

  React.useEffect(() => {
    if (isMobile) {
      setTimeRange("7d");
    }
  }, [isMobile]);

  const days = timeRange === "90d" ? 90 : timeRange === "30d" ? 30 : 7;
  const { data: bounceData, isLoading, error } = useBounceData(orgSlug, days);

  const chartData = bounceData || [];

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Bounce Rate</CardTitle>
        <CardDescription>
          <span className="@[540px]/card:block hidden">
            Bounce rate over time (4% threshold for account safety)
          </span>
          <span className="@[540px]/card:hidden">Bounce rate (%)</span>
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
              <SelectValue placeholder="30 days" />
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
            Failed to load bounce data
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex h-[300px] items-center justify-center text-muted-foreground text-sm">
            No bounce data available for this time period
          </div>
        ) : (
          <ChartContainer
            className="aspect-auto h-[300px] w-full"
            config={chartConfig}
          >
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="fillBounceRate" x1="0" x2="0" y1="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="var(--color-bounceRate)"
                    stopOpacity={0.4}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--color-bounceRate)"
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
                tickFormatter={formatPercentage}
                tickLine={false}
                tickMargin={8}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value) => `${value}%`}
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
              <ReferenceLine
                label="Risk Threshold (4%)"
                stroke="hsl(var(--destructive))"
                strokeDasharray="3 3"
                strokeWidth={2}
                y={4}
              />
              <Area
                dataKey="bounceRate"
                fill="url(#fillBounceRate)"
                stroke="var(--color-bounceRate)"
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
