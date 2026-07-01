"use client";

import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@wraps/ui/components/ui/chart";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import type { WarmupPoint } from "../lib/sample-data";

const chartConfig = {
  cap: { label: "Daily cap", color: "var(--color-muted-foreground)" },
  sent: { label: "Sent", color: "var(--color-brand)" },
} satisfies ChartConfig;

function formatCompact(value: number) {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}k`;
  }
  return `${value}`;
}

export function WarmupCurve({
  data,
  currentDay,
}: {
  data: WarmupPoint[];
  currentDay: number;
}) {
  return (
    <ChartContainer className="aspect-auto h-[160px] w-full" config={chartConfig}>
      <AreaChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
        <defs>
          <linearGradient id="fillWarmupSent" x1="0" x2="0" y1="0" y2="1">
            <stop offset="5%" stopColor="var(--color-brand)" stopOpacity={0.3} />
            <stop offset="95%" stopColor="var(--color-brand)" stopOpacity={0.03} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis
          axisLine={false}
          dataKey="day"
          tickFormatter={(v) => `Day ${v}`}
          tickLine={false}
          tickMargin={8}
        />
        <YAxis
          axisLine={false}
          tickFormatter={formatCompact}
          tickLine={false}
          tickMargin={8}
          width={36}
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
                    {Number(value).toLocaleString()}
                  </span>
                </span>
              )}
              labelFormatter={(v) => `Day ${v}`}
            />
          }
        />
        <Line
          dataKey="cap"
          dot={false}
          stroke="var(--color-muted-foreground)"
          strokeDasharray="4 4"
          strokeWidth={1.5}
          type="stepAfter"
        />
        <Area
          dataKey="sent"
          fill="url(#fillWarmupSent)"
          stroke="var(--color-brand)"
          strokeWidth={2}
          type="monotone"
        />
        <ReferenceLine
          label={{
            value: "Today",
            fill: "var(--color-brand)",
            fontSize: 11,
            position: "top",
          }}
          stroke="var(--color-brand)"
          strokeDasharray="2 2"
          x={currentDay}
        />
      </AreaChart>
    </ChartContainer>
  );
}
