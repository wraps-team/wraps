"use client";

import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@wraps/ui/components/ui/chart";
import { Panel, PanelTitle } from "@wraps/ui/components/ui/panel";
import { Skeleton } from "@wraps/ui/components/ui/skeleton";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { useHubDays } from "@/hooks/use-hub-days";
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
  // The page-level range; these charts bucket by day, so 24h shows as 7 days.
  const days = Math.max(useHubDays(), 7);
  const {
    data: engagementData,
    isLoading,
    error,
  } = useEngagementData(orgSlug, days);

  const chartData = engagementData || [];

  return (
    <Panel
      className="@container/card"
      description={
        <>
          <span className="@[540px]/card:block hidden">
            Open rates, click rates, and click-to-open ratios over time
          </span>
          <span className="@[540px]/card:hidden">Engagement trends</span>
        </>
      }
      label={<PanelTitle>Engagement Metrics</PanelTitle>}
    >
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
    </Panel>
  );
}
