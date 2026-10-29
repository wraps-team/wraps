"use client";

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
import { Skeleton } from "@wraps/ui/components/ui/skeleton";
import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import { useHubDays } from "@/hooks/use-hub-days";
import { browserTimeZone } from "@/lib/analytics-drilldown-window";
import { countYAxisProps } from "@/lib/chart-axis";
import { SERIES_COLOR } from "@/lib/chart-series";
import { useVolumeData } from "../hooks/use-analytics";
import {
  ChangeMarkerList,
  ChangeMarkersToggle,
  markerLineProps,
  useChartChangeMarkers,
} from "./change-marker-overlay";

const chartConfig = {
  delivered: {
    label: "Delivered",
    color: SERIES_COLOR.success,
  },
  bounced: {
    label: "Bounced",
    color: SERIES_COLOR.attention,
  },
  rejected: {
    label: "Rejected",
    color: SERIES_COLOR.failure,
  },
} satisfies ChartConfig;

export function DeliverabilityChart({
  orgSlug,
  showChangeMarkers = false,
}: {
  orgSlug: string;
  showChangeMarkers?: boolean;
}) {
  // The page-level range; these charts bucket by day, so 24h shows as 7 days.
  const days = Math.max(useHubDays(), 7);
  // Set after mount: the server render must not carry the server's timezone.
  const [tz, setTz] = React.useState("UTC");
  React.useEffect(() => {
    setTz(browserTimeZone());
  }, []);
  const { data: volumeData, isLoading, error } = useVolumeData(orgSlug, days);

  const chartData = volumeData || [];
  const [showMarkers, setShowMarkers] = React.useState(true);
  const { overlayOn, markerLines, markers, listState } = useChartChangeMarkers({
    orgSlug,
    days,
    enabled: showChangeMarkers,
    showMarkers,
    dates: chartData.map((d) => d.date),
  });
  const maxValue = Math.max(
    ...chartData.map((d) => (d.delivered || 0) + (d.bounced || 0))
  );

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Deliverability</CardTitle>
        <CardDescription>
          <span className="@[540px]/card:block hidden">
            Email delivery status breakdown
          </span>
          <span className="@[540px]/card:hidden">Delivery status</span>
        </CardDescription>
        <CardAction className="self-center">
          <ChangeMarkersToggle
            enabled={showChangeMarkers}
            onPressedChange={setShowMarkers}
            pressed={showMarkers}
          />
        </CardAction>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        {isLoading ? (
          <Skeleton className="h-[300px] w-full" />
        ) : error ? (
          <div className="flex h-[300px] items-center justify-center text-muted-foreground text-sm">
            Failed to load deliverability data
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
            <BarChart accessibilityLayer data={chartData}>
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
              <Legend />
              <Bar
                dataKey="delivered"
                fill="var(--color-delivered)"
                radius={[4, 4, 0, 0]}
                stackId="a"
              />
              <Bar
                dataKey="bounced"
                fill="var(--color-bounced)"
                radius={[4, 4, 0, 0]}
                stackId="a"
              />
              {markerLines.map((line) => (
                <ReferenceLine key={line.date} {...markerLineProps(line)} />
              ))}
            </BarChart>
          </ChartContainer>
        )}
        <ChangeMarkerList
          active={overlayOn}
          days={days}
          markers={markers}
          metric="bounce"
          orgSlug={orgSlug}
          state={listState}
          tz={tz}
        />
      </CardContent>
    </Card>
  );
}
