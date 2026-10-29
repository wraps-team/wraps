"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import { Progress } from "@wraps/ui/components/ui/progress";
import { Skeleton } from "@wraps/ui/components/ui/skeleton";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useHubDays } from "@/hooks/use-hub-days";
import {
  browserTimeZone,
  buildDrilldownHref,
} from "@/lib/analytics-drilldown-window";
import {
  reputationPartialLabel,
  reputationScopeLabel,
} from "@/lib/analytics-scope";
import { useAnalyticsOverview } from "../hooks/use-analytics";

type MetricTone = "default" | "success" | "warning" | "destructive";

type MetricRowProps = {
  label: string;
  value: number;
  total: number;
  percentage: number;
  tone?: MetricTone;
  // Set for rows that explain a rate. Opens the drill-down for this window.
  href?: string;
};

function MetricRow({
  label,
  value,
  total,
  percentage,
  tone = "default",
  href,
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
          {href ? (
            <Link
              className="text-muted-foreground text-xs underline underline-offset-4 hover:text-foreground"
              href={href}
            >
              View causes
            </Link>
          ) : null}
        </div>
      </div>
      <Progress className="h-2" value={percentage} variant={tone} />
    </div>
  );
}

export function PerformanceMetrics({ orgSlug }: { orgSlug: string }) {
  const days = useHubDays();
  const { data, isLoading, error } = useAnalyticsOverview(orgSlug, days);
  // Set after mount: the server render must not carry the server's timezone.
  const [tz, setTz] = useState("UTC");
  useEffect(() => {
    setTz(browserTimeZone());
  }, []);

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
  const metrics: MetricRowProps[] = [
    {
      label: "Delivered",
      value: data.totalDelivered,
      total: effectiveSent,
      percentage: data.deliveryRate,
      tone: "success",
    },
    {
      label: "Bounced",
      value: data.totalBounced,
      total: effectiveSent,
      percentage: windowRate(data.totalBounced),
      tone: "warning",
      href: buildDrilldownHref(orgSlug, { metric: "bounce", days, tz }),
    },
    {
      label: "Complaints",
      value: data.totalComplaints,
      total: effectiveSent,
      percentage: windowRate(data.totalComplaints),
      tone: "destructive",
      href: buildDrilldownHref(orgSlug, { metric: "complaint", days, tz }),
    },
  ];

  const meta = data.meta;
  const reputation =
    meta && meta.reputationScope === "ses-account"
      ? reputationScopeLabel(meta)
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
            {reputation.note ? (
              <p className="text-muted-foreground text-xs">{reputation.note}</p>
            ) : null}
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
