"use client";

import type { MetricDataResult } from "@aws-sdk/client-cloudwatch";
import { MetricsDisplay } from "@/components/metrics-display";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type EmailMetricsProps = {
  metrics: Record<string, MetricDataResult[]> | null;
  error: string | null;
};

export function EmailMetrics({ metrics, error }: EmailMetricsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Email Metrics</CardTitle>
        <CardDescription>
          Email sending performance and statistics for the last 7 days.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-red-600 text-sm">
              Error loading metrics: {error}
            </p>
          </div>
        ) : metrics ? (
          <MetricsDisplay metrics={metrics} />
        ) : (
          <div className="text-muted-foreground">Loading metrics...</div>
        )}
      </CardContent>
    </Card>
  );
}
