"use client";

import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@wraps/ui/components/ui/chart";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import { reputation } from "../lib/sample-data";

const chartConfig = {
  bounce: { label: "Bounce rate", color: "var(--color-chart-1)" },
  complaint: { label: "Complaint rate", color: "var(--color-info)" },
} satisfies ChartConfig;

export function ReputationTrend() {
  return (
    <ChartContainer className="aspect-auto h-[260px] w-full" config={chartConfig}>
      <LineChart data={reputation.history} margin={{ left: 4, right: 12, top: 12 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis
          axisLine={false}
          dataKey="date"
          minTickGap={24}
          tickFormatter={(value) =>
            new Date(value).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })
          }
          tickLine={false}
          tickMargin={8}
        />
        <YAxis
          axisLine={false}
          tickFormatter={(v) => `${v}%`}
          tickLine={false}
          tickMargin={8}
          width={40}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, name) => (
                <span className="flex w-full items-center justify-between gap-3">
                  <span className="text-muted-foreground">
                    {chartConfig[name as keyof typeof chartConfig]?.label}
                  </span>
                  <span className="font-medium font-mono tabular-nums">
                    {value}%
                  </span>
                </span>
              )}
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
        {/* Bounce review line */}
        <ReferenceLine
          label={{
            value: "Bounce review 5%",
            fill: "var(--color-warning)",
            fontSize: 10,
            position: "insideTopRight",
          }}
          stroke="var(--color-warning)"
          strokeDasharray="4 4"
          y={5}
        />
        <Line
          dataKey="bounce"
          dot={false}
          stroke="var(--color-chart-1)"
          strokeWidth={2.5}
          type="monotone"
        />
        <Line
          dataKey="complaint"
          dot={false}
          stroke="var(--color-info)"
          strokeWidth={2.5}
          type="monotone"
        />
      </LineChart>
    </ChartContainer>
  );
}
