"use client";

import {
  ArrowUpIcon,
  MapPin,
  Target,
  TrendingUp,
  UserIcon,
  Users,
} from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const customerGrowthData = [
  { month: "Jan", new: 245, returning: 890, churn: 45 },
  { month: "Feb", new: 312, returning: 934, churn: 52 },
  { month: "Mar", new: 289, returning: 1023, churn: 38 },
  { month: "Apr", new: 456, returning: 1156, churn: 61 },
  { month: "May", new: 523, returning: 1298, churn: 47 },
  { month: "Jun", new: 634, returning: 1445, churn: 55 },
];

const chartConfig = {
  new: {
    label: "New Customers",
    color: "var(--chart-1)",
  },
  returning: {
    label: "Returning",
    color: "var(--chart-2)",
  },
  churn: {
    label: "Churned",
    color: "var(--chart-3)",
  },
};

const demographicsData = [
  {
    ageGroup: "18-24",
    customers: 2847,
    percentage: "18.0%",
    growth: "+15.2%",
    growthColor: "text-green-600",
  },
  {
    ageGroup: "25-34",
    customers: 4521,
    percentage: "28.5%",
    growth: "+8.7%",
    growthColor: "text-green-600",
  },
  {
    ageGroup: "35-44",
    customers: 3982,
    percentage: "25.1%",
    growth: "+3.4%",
    growthColor: "text-blue-600",
  },
  {
    ageGroup: "45-54",
    customers: 2734,
    percentage: "17.2%",
    growth: "+1.2%",
    growthColor: "text-orange-600",
  },
  {
    ageGroup: "55+",
    customers: 1763,
    percentage: "11.2%",
    growth: "-2.1%",
    growthColor: "text-red-600",
  },
];

const regionsData = [
  {
    region: "North America",
    customers: 6847,
    revenue: "$847,523",
    growth: "+12.3%",
    growthColor: "text-green-600",
  },
  {
    region: "Europe",
    customers: 4521,
    revenue: "$563,891",
    growth: "+9.7%",
    growthColor: "text-green-600",
  },
  {
    region: "Asia Pacific",
    customers: 2892,
    revenue: "$321,456",
    growth: "+18.4%",
    growthColor: "text-blue-600",
  },
  {
    region: "Latin America",
    customers: 1123,
    revenue: "$187,234",
    growth: "+15.8%",
    growthColor: "text-green-600",
  },
  {
    region: "Others",
    customers: 464,
    revenue: "$67,891",
    growth: "+5.2%",
    growthColor: "text-orange-600",
  },
];

export function CustomerInsights() {
  const [activeTab, setActiveTab] = useState("growth");

  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle>Customer Insights</CardTitle>
        <CardDescription>Growth trends and demographics</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs className="w-full" onValueChange={setActiveTab} value={activeTab}>
          <TabsList className="grid h-12 w-full grid-cols-3 rounded-lg bg-muted/50 p-1">
            <TabsTrigger
              className="flex cursor-pointer items-center gap-2 rounded-md px-4 py-2 font-medium text-sm transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
              value="growth"
            >
              <TrendingUp className="h-4 w-4" />
              <span className="hidden sm:inline">Growth</span>
            </TabsTrigger>
            <TabsTrigger
              className="flex cursor-pointer items-center gap-2 rounded-md px-4 py-2 font-medium text-sm transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
              value="demographics"
            >
              <UserIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Demographics</span>
            </TabsTrigger>
            <TabsTrigger
              className="flex cursor-pointer items-center gap-2 rounded-md px-4 py-2 font-medium text-sm transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
              value="regions"
            >
              <MapPin className="h-4 w-4" />
              <span className="hidden sm:inline">Regions</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent className="mt-8 space-y-6" value="growth">
            <div className="grid gap-6">
              {/* Chart and Key Metrics Side by Side */}
              <div className="grid grid-cols-10 gap-6">
                {/* Chart Area - 70% */}
                <div className="col-span-10 xl:col-span-7">
                  <h3 className="mb-6 font-medium text-muted-foreground text-sm">
                    Customer Growth Trends
                  </h3>
                  <ChartContainer
                    className="h-[375px] w-full"
                    config={chartConfig}
                  >
                    <BarChart
                      data={customerGrowthData}
                      margin={{ top: 20, right: 20, bottom: 20, left: 0 }}
                    >
                      <CartesianGrid
                        className="stroke-muted"
                        strokeDasharray="3 3"
                      />
                      <XAxis
                        axisLine={{ stroke: "var(--border)" }}
                        className="text-xs"
                        dataKey="month"
                        tick={{ fontSize: 12 }}
                        tickLine={{ stroke: "var(--border)" }}
                      />
                      <YAxis
                        axisLine={{ stroke: "var(--border)" }}
                        className="text-xs"
                        domain={[0, "dataMax"]}
                        tick={{ fontSize: 12 }}
                        tickLine={{ stroke: "var(--border)" }}
                      />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar
                        dataKey="new"
                        fill="var(--color-new)"
                        radius={[2, 2, 0, 0]}
                      />
                      <Bar
                        dataKey="returning"
                        fill="var(--color-returning)"
                        radius={[2, 2, 0, 0]}
                      />
                      <Bar
                        dataKey="churn"
                        fill="var(--color-churn)"
                        radius={[2, 2, 0, 0]}
                      />
                    </BarChart>
                  </ChartContainer>
                </div>

                {/* Key Metrics - 30% */}
                <div className="col-span-10 space-y-5 xl:col-span-3">
                  <h3 className="mb-6 font-medium text-muted-foreground text-sm">
                    Key Metrics
                  </h3>
                  <div className="grid grid-cols-3 gap-5">
                    <div className="rounded-lg border p-4 max-lg:col-span-3 xl:col-span-3">
                      <div className="mb-2 flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-primary" />
                        <span className="font-medium text-sm">
                          Total Customers
                        </span>
                      </div>
                      <div className="font-bold text-2xl">15,847</div>
                      <div className="mt-1 flex items-center gap-1 text-green-600 text-xs">
                        <ArrowUpIcon className="h-3 w-3" />
                        +12.5% from last month
                      </div>
                    </div>

                    <div className="rounded-lg border p-4 max-lg:col-span-3 xl:col-span-3">
                      <div className="mb-2 flex items-center gap-2">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium text-sm">
                          Retention Rate
                        </span>
                      </div>
                      <div className="font-bold text-2xl">92.4%</div>
                      <div className="mt-1 flex items-center gap-1 text-green-600 text-xs">
                        <ArrowUpIcon className="h-3 w-3" />
                        +2.1% improvement
                      </div>
                    </div>

                    <div className="rounded-lg border p-4 max-lg:col-span-3 xl:col-span-3">
                      <div className="mb-2 flex items-center gap-2">
                        <Target className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium text-sm">Avg. LTV</span>
                      </div>
                      <div className="font-bold text-2xl">$2,847</div>
                      <div className="mt-1 flex items-center gap-1 text-green-600 text-xs">
                        <ArrowUpIcon className="h-3 w-3" />
                        +8.3% growth
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent className="mt-8" value="demographics">
            <div className="rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow className="border-b">
                    <TableHead className="px-6 py-5 font-semibold">
                      Age Group
                    </TableHead>
                    <TableHead className="px-6 py-5 text-right font-semibold">
                      Customers
                    </TableHead>
                    <TableHead className="px-6 py-5 text-right font-semibold">
                      Percentage
                    </TableHead>
                    <TableHead className="px-6 py-5 text-right font-semibold">
                      Growth
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {demographicsData.map((row, index) => (
                    <TableRow
                      className="transition-colors hover:bg-muted/30"
                      key={index}
                    >
                      <TableCell className="px-6 py-5 font-medium">
                        {row.ageGroup}
                      </TableCell>
                      <TableCell className="px-6 py-5 text-right">
                        {row.customers.toLocaleString()}
                      </TableCell>
                      <TableCell className="px-6 py-5 text-right">
                        {row.percentage}
                      </TableCell>
                      <TableCell className="px-6 py-5 text-right">
                        <span className={`font-medium ${row.growthColor}`}>
                          {row.growth}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex items-center justify-end space-x-2 py-6">
              <div className="hidden text-muted-foreground text-sm sm:block">
                0 of {demographicsData.length} row(s) selected.
              </div>
              <div className="space-x-2 space-y-2">
                <Button disabled size="sm" variant="outline">
                  Previous
                </Button>
                <Button disabled size="sm" variant="outline">
                  Next
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent className="mt-8" value="regions">
            <div className="rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow className="border-b">
                    <TableHead className="px-6 py-5 font-semibold">
                      Region
                    </TableHead>
                    <TableHead className="px-6 py-5 text-right font-semibold">
                      Customers
                    </TableHead>
                    <TableHead className="px-6 py-5 text-right font-semibold">
                      Revenue
                    </TableHead>
                    <TableHead className="px-6 py-5 text-right font-semibold">
                      Growth
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {regionsData.map((row, index) => (
                    <TableRow
                      className="transition-colors hover:bg-muted/30"
                      key={index}
                    >
                      <TableCell className="px-6 py-5 font-medium">
                        {row.region}
                      </TableCell>
                      <TableCell className="px-6 py-5 text-right">
                        {row.customers.toLocaleString()}
                      </TableCell>
                      <TableCell className="px-6 py-5 text-right">
                        {row.revenue}
                      </TableCell>
                      <TableCell className="px-6 py-5 text-right">
                        <span className={`font-medium ${row.growthColor}`}>
                          {row.growth}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex items-center justify-end space-x-2 py-6">
              <div className="hidden text-muted-foreground text-sm sm:block">
                0 of {regionsData.length} row(s) selected.
              </div>
              <div className="space-x-2 space-y-2">
                <Button disabled size="sm" variant="outline">
                  Previous
                </Button>
                <Button disabled size="sm" variant="outline">
                  Next
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
