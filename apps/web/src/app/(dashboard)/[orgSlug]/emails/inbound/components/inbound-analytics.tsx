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
import { useRouter } from "next/navigation";
import * as React from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Label,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import { revalidateInboundEmails } from "@/actions/inbound";
import { Button } from "@/components/ui/button";
import { RefreshButton } from "@/components/ui/refresh-button";
import { useIsMobile } from "@/hooks/use-mobile";
import { countYAxisProps } from "@/lib/chart-axis";
import { SERIES_CATEGORICAL, SERIES_COLOR } from "@/lib/chart-series";
import type { InboundEmailListItem } from "../types";

const areaChartConfig = {
  count: {
    label: "Received",
    color: SERIES_COLOR.secondary,
  },
} satisfies ChartConfig;

const pieColors = SERIES_CATEGORICAL;

// Format a Date as YYYY-MM-DD in local time (avoids UTC offset issues)
function toLocalDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Extract just the email address from "Name <email>" format
function extractEmail(toField: string): string {
  const match = toField.match(/<([^>]+)>/);
  return match ? match[1] : toField;
}

type InboundAnalyticsProps = {
  emails: InboundEmailListItem[];
  organizationId: string;
};

export function InboundAnalytics({
  emails,
  organizationId,
}: InboundAnalyticsProps) {
  const isMobile = useIsMobile();
  const router = useRouter();
  const [timeRange, setTimeRange] = React.useState("30d");

  React.useEffect(() => {
    if (isMobile) {
      setTimeRange("7d");
    }
  }, [isMobile]);

  const days = timeRange === "30d" ? 30 : 7;

  // Compute analytics from the emails data
  const analytics = React.useMemo(() => {
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    // Filter emails within the time range
    const filteredEmails = emails.filter(
      (e) => new Date(e.receivedAt) >= startDate
    );

    // Count totals
    const totalReceived = filteredEmails.length;
    const withAttachments = filteredEmails.filter(
      (e) => e.hasAttachments
    ).length;
    const spamCount = filteredEmails.filter(
      (e) => e.spamVerdict === "FAIL"
    ).length;
    const cleanCount = filteredEmails.filter(
      (e) => e.spamVerdict === "PASS" && e.virusVerdict === "PASS"
    ).length;

    // Group by local date for chart
    const dateMap = new Map<string, number>();
    for (const email of filteredEmails) {
      const dateStr = toLocalDateStr(new Date(email.receivedAt));
      dateMap.set(dateStr, (dateMap.get(dateStr) || 0) + 1);
    }

    // Fill in missing dates using local time
    const dailyData: Array<{ date: string; count: number }> = [];
    for (let i = 0; i <= days; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      const dateStr = toLocalDateStr(date);
      dailyData.push({
        date: dateStr,
        count: dateMap.get(dateStr) ?? 0,
      });
    }

    // Count by recipient address
    const recipientMap = new Map<string, number>();
    for (const email of filteredEmails) {
      for (const to of email.to) {
        const addr = extractEmail(to);
        recipientMap.set(addr, (recipientMap.get(addr) || 0) + 1);
      }
    }

    // Get top 5 recipients
    const topRecipients = Array.from(recipientMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([address, count]) => ({ address, count }));

    return {
      totalReceived,
      withAttachments,
      spamCount,
      cleanCount,
      dailyData,
      topRecipients,
    };
  }, [emails, days]);

  const pieChartConfig = React.useMemo((): ChartConfig => {
    const config: ChartConfig = {};
    for (const [i, r] of analytics.topRecipients.entries()) {
      config[r.address] = {
        label: r.address,
        color: pieColors[i % pieColors.length],
      };
    }
    return config;
  }, [analytics.topRecipients]);

  const recipientsTotal = analytics.topRecipients.reduce(
    (sum, r) => sum + r.count,
    0
  );

  async function handleRefresh() {
    await revalidateInboundEmails(organizationId);
    router.refresh();
  }

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Inbound Activity</CardTitle>
        <CardDescription>
          <span className="@[540px]/card:block hidden">
            Emails received through your inbound infrastructure
          </span>
          <span className="@[540px]/card:hidden">Received emails</span>
        </CardDescription>
        <CardAction className="self-center">
          <ButtonGroup className="@[767px]/card:flex hidden">
            <Button
              aria-pressed={timeRange === "30d"}
              className="aria-pressed:bg-accent aria-pressed:text-accent-foreground"
              onClick={() => setTimeRange("30d")}
              size="touch"
              variant="outline"
            >
              30 days
            </Button>
            <Button
              aria-pressed={timeRange === "7d"}
              className="aria-pressed:bg-accent aria-pressed:text-accent-foreground"
              onClick={() => setTimeRange("7d")}
              size="touch"
              variant="outline"
            >
              7 days
            </Button>
            <RefreshButton onRefresh={handleRefresh} />
          </ButtonGroup>
          <Select onValueChange={setTimeRange} value={timeRange}>
            <SelectTrigger
              aria-label="Select time range"
              className="flex @[767px]/card:hidden w-32 **:data-[slot=select-value]:block **:data-[slot=select-value]:truncate"
              size="touch"
            >
              <SelectValue placeholder="30 days" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem className="rounded-lg" value="30d">
                30 days
              </SelectItem>
              <SelectItem className="rounded-lg" value="7d">
                7 days
              </SelectItem>
            </SelectContent>
          </Select>
          <RefreshButton
            className="@[767px]/card:hidden"
            onRefresh={handleRefresh}
          />
        </CardAction>
      </CardHeader>
      <CardContent className="px-2 pt-2 sm:px-6 sm:pt-3">
        <div className="grid grid-cols-1 gap-6 @[540px]/card:grid-cols-[1fr_auto] @[800px]/card:grid-cols-[1fr_auto_120px]">
          {/* Received Over Time */}
          <div className="min-w-0">
            <div className="mb-2 font-medium text-muted-foreground text-sm">
              Received Over Time
            </div>
            {analytics.dailyData.every((d) => d.count === 0) ? (
              <div className="flex h-[200px] items-center justify-center text-muted-foreground text-sm">
                No emails received in this period
              </div>
            ) : (
              <ChartContainer
                className="aspect-auto h-[200px] w-full"
                config={areaChartConfig}
              >
                <AreaChart accessibilityLayer data={analytics.dailyData}>
                  <defs>
                    <linearGradient
                      id="fillInbound"
                      x1="0"
                      x2="0"
                      y1="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor="var(--color-count)"
                        stopOpacity={0.4}
                      />
                      <stop
                        offset="95%"
                        stopColor="var(--color-count)"
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
                      const date = new Date(`${value}T00:00:00`);
                      return date.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      });
                    }}
                    tickLine={false}
                    tickMargin={8}
                  />
                  <YAxis
                    {...countYAxisProps(
                      Math.max(...analytics.dailyData.map((d) => d.count || 0))
                    )}
                    width={40}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        indicator="line"
                        labelFormatter={(value) => {
                          const date = new Date(`${value}T00:00:00`);
                          return date.toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          });
                        }}
                      />
                    }
                  />
                  <Area
                    dataKey="count"
                    fill="url(#fillInbound)"
                    stroke="var(--color-count)"
                    strokeWidth={2}
                    type="monotone"
                  />
                </AreaChart>
              </ChartContainer>
            )}
          </div>

          {/* Top Recipients Donut */}
          {analytics.topRecipients.length > 0 ? (
            <div className="min-w-0">
              <div className="mb-2 font-medium text-muted-foreground text-sm">
                Top Recipients
              </div>
              <div className="flex items-center gap-3">
                <ChartContainer
                  className="aspect-square h-[160px] shrink-0"
                  config={pieChartConfig}
                >
                  <PieChart>
                    <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                    <Pie
                      data={analytics.topRecipients}
                      dataKey="count"
                      innerRadius={40}
                      nameKey="address"
                      outerRadius={65}
                      paddingAngle={2}
                      strokeWidth={0}
                    >
                      {analytics.topRecipients.map((_entry, index) => (
                        <Cell
                          fill={pieColors[index % pieColors.length]}
                          key={`cell-${index}`}
                        />
                      ))}
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
                                  className="fill-foreground font-semibold text-base"
                                  x={viewBox.cx}
                                  y={viewBox.cy}
                                >
                                  {recipientsTotal.toLocaleString()}
                                </tspan>
                              </text>
                            );
                          }
                        }}
                      />
                    </Pie>
                  </PieChart>
                </ChartContainer>
                <div className="flex flex-col gap-1">
                  {analytics.topRecipients.map((recipient, index) => (
                    <div
                      className="flex items-center gap-2 text-xs"
                      key={recipient.address}
                    >
                      <div
                        className="size-2 shrink-0 rounded-full"
                        style={{
                          backgroundColor: pieColors[index % pieColors.length],
                        }}
                      />
                      <span className="truncate text-muted-foreground">
                        {recipient.address}
                      </span>
                      <span className="ml-auto shrink-0 font-medium tabular-nums">
                        {recipient.count.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div />
          )}

          {/* Stats */}
          <div className="flex flex-col gap-2">
            <div className="rounded-lg border bg-card p-2.5 text-center">
              <div className="font-semibold text-xl tabular-nums">
                {analytics.totalReceived.toLocaleString()}
              </div>
              <div className="text-muted-foreground text-xs">Received</div>
            </div>
            <div className="rounded-lg border bg-card p-2.5 text-center">
              <div className="font-semibold text-xl tabular-nums">
                {analytics.cleanCount.toLocaleString()}
              </div>
              <div className="text-muted-foreground text-xs">Clean</div>
            </div>
            <div className="rounded-lg border bg-card p-2.5 text-center">
              <div className="font-semibold text-xl tabular-nums">
                {analytics.spamCount}
              </div>
              <div className="text-muted-foreground text-xs">Spam</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
