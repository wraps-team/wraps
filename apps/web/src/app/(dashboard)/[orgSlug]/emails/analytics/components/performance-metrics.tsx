"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import { Progress } from "@wraps/ui/components/ui/progress";
import { Skeleton } from "@wraps/ui/components/ui/skeleton";
import {
  reputationPartialLabel,
  reputationScopeLabel,
} from "@/lib/analytics-scope";
import { useAnalyticsOverview } from "../hooks/use-analytics";

type MetricRowProps = {
  label: string;
  value: number;
  total: number;
  percentage: number;
  color?: string;
};

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

  // `message_send` counts sends as status != 'failed' and rendering failures as
  // status = 'failed' - disjoint sets, so the total already excludes failures.
  // Subtracting them again (needed when CloudWatch's `Send` was the source)
  // would shrink the denominator and overstate every rate below.
  const effectiveSent = data.totalSent;

  const windowRate = (value: number) =>
    effectiveSent > 0 ? (value / effectiveSent) * 100 : 0;

  // Every bar here is window-scoped, so each percentage is computed from the
  // counts printed beside it. `data.bounceRate` and `data.complaintRate` are
  // NOT used: when SES has published reputation they are account-lifetime rates
  // and pairing one with a window count reads as arithmetic that does not add
  // up. They get their own row below, labelled.
  const metrics = [
    {
      label: "Delivered",
      value: data.totalDelivered,
      total: effectiveSent,
      percentage: data.deliveryRate,
      color: "bg-green-500",
    },
    {
      label: "Bounced",
      value: data.totalBounced,
      total: effectiveSent,
      percentage: windowRate(data.totalBounced),
      color: "bg-yellow-500",
    },
    {
      label: "Complaints",
      value: data.totalComplaints,
      total: effectiveSent,
      percentage: windowRate(data.totalComplaints),
      color: "bg-red-500",
    },
  ];

  const meta = data.meta;
  const reputation =
    meta && meta.reputationScope === "ses-account"
      ? reputationScopeLabel(meta.reputationScope, meta.awsAccountCount)
      : null;
  const reputationPartial = meta ? reputationPartialLabel(meta) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Performance Breakdown</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {metrics.map((metric) => (
          <MetricRow key={metric.label} {...metric} />
        ))}
        {reputation ? (
          <div className="space-y-1 border-t pt-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{reputation.title}</span>
              <span className="font-medium">
                {data.bounceRate.toFixed(2)}% bounce,{" "}
                {data.complaintRate.toFixed(2)}% complaint
              </span>
            </div>
            <p className="text-muted-foreground text-xs">{reputation.detail}</p>
            {reputationPartial ? (
              <p className="text-muted-foreground text-xs">
                {reputationPartial}
              </p>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
