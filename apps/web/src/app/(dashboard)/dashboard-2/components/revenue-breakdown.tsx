"use client";

import * as React from "react";
import { Label, Pie, PieChart, Sector } from "recharts";
import type { PieSectorDataItem } from "recharts/types/polar/Pie";
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
  ChartStyle,
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

const revenueData = [
  {
    category: "subscriptions",
    value: 45,
    amount: 24_500,
    fill: "var(--color-subscriptions)",
  },
  { category: "sales", value: 30, amount: 16_300, fill: "var(--color-sales)" },
  {
    category: "services",
    value: 15,
    amount: 8150,
    fill: "var(--color-services)",
  },
  {
    category: "partnerships",
    value: 10,
    amount: 5430,
    fill: "var(--color-partnerships)",
  },
];

const chartConfig = {
  revenue: {
    label: "Revenue",
  },
  amount: {
    label: "Amount",
  },
  subscriptions: {
    label: "Subscriptions",
    color: "var(--chart-1)",
  },
  sales: {
    label: "One-time Sales",
    color: "var(--chart-2)",
  },
  services: {
    label: "Services",
    color: "var(--chart-3)",
  },
  partnerships: {
    label: "Partnerships",
    color: "var(--chart-4)",
  },
};

export function RevenueBreakdown() {
  const id = "revenue-breakdown";
  const [activeCategory, setActiveCategory] = React.useState("sales");

  const activeIndex = React.useMemo(
    () => revenueData.findIndex((item) => item.category === activeCategory),
    [activeCategory]
  );

  const categories = React.useMemo(
    () => revenueData.map((item) => item.category),
    []
  );

  return (
    <Card className="flex cursor-pointer flex-col" data-chart={id}>
      <ChartStyle config={chartConfig} id={id} />
      <CardHeader className="flex flex-col space-y-2 pb-2 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
        <div>
          <CardTitle>Revenue Breakdown</CardTitle>
          <CardDescription>Revenue distribution by source</CardDescription>
        </div>
        <div className="flex items-center space-x-2">
          <Select onValueChange={setActiveCategory} value={activeCategory}>
            <SelectTrigger
              aria-label="Select a category"
              className="w-[175px] cursor-pointer rounded-lg"
            >
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent align="end" className="rounded-lg">
              {categories.map((key) => {
                const config = chartConfig[key as keyof typeof chartConfig];

                if (!config) {
                  return null;
                }

                return (
                  <SelectItem
                    className="cursor-pointer rounded-md [&_span]:flex"
                    key={key}
                    value={key}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="flex h-3 w-3 shrink-0"
                        style={{
                          backgroundColor: `var(--color-${key})`,
                        }}
                      />
                      {config?.label}
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <Button className="cursor-pointer" variant="outline">
            Export
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 justify-center">
        <div className="grid w-full grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="flex justify-center">
            <ChartContainer
              className="mx-auto aspect-square w-full max-w-[300px]"
              config={chartConfig}
              id={id}
            >
              <PieChart>
                <ChartTooltip
                  content={<ChartTooltipContent hideLabel />}
                  cursor={false}
                />
                <Pie
                  activeIndex={activeIndex}
                  activeShape={({
                    outerRadius = 0,
                    ...props
                  }: PieSectorDataItem) => (
                    <g>
                      <Sector {...props} outerRadius={outerRadius + 10} />
                      <Sector
                        {...props}
                        innerRadius={outerRadius + 12}
                        outerRadius={outerRadius + 25}
                      />
                    </g>
                  )}
                  data={revenueData}
                  dataKey="amount"
                  innerRadius={60}
                  nameKey="category"
                  strokeWidth={5}
                >
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
                              className="fill-foreground font-bold text-3xl"
                              x={viewBox.cx}
                              y={viewBox.cy}
                            >
                              $
                              {(revenueData[activeIndex].amount / 1000).toFixed(
                                0
                              )}
                              K
                            </tspan>
                            <tspan
                              className="fill-muted-foreground"
                              x={viewBox.cx}
                              y={(viewBox.cy || 0) + 24}
                            >
                              Revenue
                            </tspan>
                          </text>
                        );
                      }
                    }}
                  />
                </Pie>
              </PieChart>
            </ChartContainer>
          </div>

          <div className="flex flex-col justify-center space-y-4">
            {revenueData.map((item, index) => {
              const config =
                chartConfig[item.category as keyof typeof chartConfig];
              const isActive = index === activeIndex;

              return (
                <div
                  className={`flex cursor-pointer items-center justify-between rounded-lg p-3 transition-colors ${
                    isActive ? "bg-muted" : "hover:bg-muted/50"
                  }`}
                  key={item.category}
                  onClick={() => setActiveCategory(item.category)}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="flex h-3 w-3 shrink-0 rounded-full"
                      style={{
                        backgroundColor: `var(--color-${item.category})`,
                      }}
                    />
                    <span className="font-medium">{config?.label}</span>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">
                      ${(item.amount / 1000).toFixed(1)}K
                    </div>
                    <div className="text-muted-foreground text-sm">
                      {item.value}%
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
