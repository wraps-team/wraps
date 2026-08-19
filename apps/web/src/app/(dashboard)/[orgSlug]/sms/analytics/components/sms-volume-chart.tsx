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
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { countYAxisProps } from "@/lib/chart-axis";
import { useSMSVolumeData } from "../hooks/use-sms-analytics";

const chartConfig = {
  sent: {
    label: "Sent",
    theme: {
      light: "oklch(0.45 0.15 160)", // Green
      dark: "oklch(0.65 0.15 160)",
    },
  },
} satisfies ChartConfig;

export function SMSVolumeChart({ orgSlug }: { orgSlug: string }) {
  const isMobile = useIsMobile();
  const [timeRange, setTimeRange] = React.useState("90d");

  React.useEffect(() => {
    if (isMobile) {
      setTimeRange("7d");
    }
  }, [isMobile]);

  const days = timeRange === "90d" ? 90 : timeRange === "30d" ? 30 : 7;
  const {
    data: volumeData,
    isLoading,
    error,
  } = useSMSVolumeData(orgSlug, days);

  const chartData = volumeData || [];
  const maxValue = Math.max(...chartData.map((d) => d.sent || 0));

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>SMS Volume</CardTitle>
        <CardDescription>
          <span className="@[540px]/card:block hidden">
            Daily SMS sending volume over time
          </span>
          <span className="@[540px]/card:hidden">Daily volume</span>
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
            <AreaChart accessibilityLayer data={chartData}>
              <defs>
                <linearGradient id="fillSMSSent" x1="0" x2="0" y1="0" y2="1">
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
                dataKey="sent"
                fill="url(#fillSMSSent)"
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
