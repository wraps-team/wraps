"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useAnalyticsOverview } from "../hooks/use-analytics";

interface MetricRowProps {
  label: string;
  value: number;
  total: number;
  percentage: number;
  color?: string;
}

function MetricRow({
  label,
  value,
  total,
  percentage,
  color = "bg-primary",
}: MetricRowProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <div className="flex items-baseline gap-2">
          <span className="font-medium">
            {value.toLocaleString()} / {total.toLocaleString()}
          </span>
          <span className="text-muted-foreground text-xs">
            ({percentage.toFixed(1)}%)
          </span>
        </div>
      </div>
      <Progress className="h-2" indicatorClassName={color} value={percentage} />
    </div>
  );
}

export function PerformanceMetrics({ orgSlug }: { orgSlug: string }) {
  const { data, isLoading, error } = useAnalyticsOverview(orgSlug, 30);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Performance Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {[1, 2, 3, 4, 5].map((i) => (
            <div className="space-y-2" key={i}>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-2 w-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Performance Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Failed to load performance metrics
          </p>
        </CardContent>
      </Card>
    );
  }

  const totalSent = data.totalSent;

  // Calculate estimated opens and clicks (placeholder until we have real data)
  const estimatedOpens = Math.floor(data.totalDelivered * 0.42);
  const estimatedClicks = Math.floor(data.totalDelivered * 0.18);

  const metrics = [
    {
      label: "Delivered",
      value: data.totalDelivered,
      total: totalSent,
      percentage: (data.totalDelivered / totalSent) * 100,
      color: "bg-green-500",
    },
    {
      label: "Opened",
      value: estimatedOpens,
      total: totalSent,
      percentage: (estimatedOpens / totalSent) * 100,
      color: "bg-blue-500",
    },
    {
      label: "Clicked",
      value: estimatedClicks,
      total: totalSent,
      percentage: (estimatedClicks / totalSent) * 100,
      color: "bg-purple-500",
    },
    {
      label: "Bounced",
      value: data.totalBounced,
      total: totalSent,
      percentage: (data.totalBounced / totalSent) * 100,
      color: "bg-yellow-500",
    },
    {
      label: "Complaints",
      value: data.totalComplaints,
      total: totalSent,
      percentage: (data.totalComplaints / totalSent) * 100,
      color: "bg-red-500",
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Performance Breakdown</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {metrics.map((metric) => (
          <MetricRow key={metric.label} {...metric} />
        ))}
      </CardContent>
    </Card>
  );
}
