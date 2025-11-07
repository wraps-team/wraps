"use client";

import { useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
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

const salesData = [
  { month: "Jan", sales: 12_500, target: 15_000 },
  { month: "Feb", sales: 18_200, target: 15_000 },
  { month: "Mar", sales: 16_800, target: 15_000 },
  { month: "Apr", sales: 22_400, target: 20_000 },
  { month: "May", sales: 24_600, target: 20_000 },
  { month: "Jun", sales: 28_200, target: 25_000 },
  { month: "Jul", sales: 31_500, target: 25_000 },
  { month: "Aug", sales: 29_800, target: 25_000 },
  { month: "Sep", sales: 33_200, target: 30_000 },
  { month: "Oct", sales: 35_100, target: 30_000 },
  { month: "Nov", sales: 38_900, target: 35_000 },
  { month: "Dec", sales: 42_300, target: 35_000 },
];

const chartConfig = {
  sales: {
    label: "Sales",
    color: "var(--primary)",
  },
  target: {
    label: "Target",
    color: "var(--primary)",
  },
};

export function SalesChart() {
  const [timeRange, setTimeRange] = useState("12m");

  return (
    <Card className="cursor-pointer">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle>Sales Performance</CardTitle>
          <CardDescription>Monthly sales vs targets</CardDescription>
        </div>
        <div className="flex items-center space-x-2">
          <Select onValueChange={setTimeRange} value={timeRange}>
            <SelectTrigger className="w-32 cursor-pointer">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem className="cursor-pointer" value="3m">
                Last 3 months
              </SelectItem>
              <SelectItem className="cursor-pointer" value="6m">
                Last 6 months
              </SelectItem>
              <SelectItem className="cursor-pointer" value="12m">
                Last 12 months
              </SelectItem>
            </SelectContent>
          </Select>
          <Button className="cursor-pointer" variant="outline">
            Export
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0 pt-6">
        <div className="px-6 pb-6">
          <ChartContainer className="h-[350px] w-full" config={chartConfig}>
            <AreaChart
              data={salesData}
              margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
            >
              <defs>
                <linearGradient id="colorSales" x1="0" x2="0" y1="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="var(--color-sales)"
                    stopOpacity={0.4}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--color-sales)"
                    stopOpacity={0.05}
                  />
                </linearGradient>
                <linearGradient id="colorTarget" x1="0" x2="0" y1="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="var(--color-target)"
                    stopOpacity={0.2}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--color-target)"
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid
                className="stroke-muted/30"
                strokeDasharray="3 3"
              />
              <XAxis
                axisLine={false}
                className="text-xs"
                dataKey="month"
                tick={{ fontSize: 12 }}
                tickLine={false}
              />
              <YAxis
                axisLine={false}
                className="text-xs"
                tick={{ fontSize: 12 }}
                tickFormatter={(value) => `$${value.toLocaleString()}`}
                tickLine={false}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area
                dataKey="target"
                fill="url(#colorTarget)"
                stackId="1"
                stroke="var(--color-target)"
                strokeDasharray="5 5"
                strokeWidth={1}
                type="monotone"
              />
              <Area
                dataKey="sales"
                fill="url(#colorSales)"
                stackId="2"
                stroke="var(--color-sales)"
                strokeWidth={1}
                type="monotone"
              />
            </AreaChart>
          </ChartContainer>
        </div>
      </CardContent>
    </Card>
  );
}
