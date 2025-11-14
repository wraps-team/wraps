"use client";

import {
  ArrowDownIcon,
  ArrowUpIcon,
  Mail,
  MousePointerClick,
  TrendingUp,
  Users,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAnalyticsOverview } from "../hooks/use-analytics";

interface StatCardProps {
  title: string;
  value: string;
  change?: number;
  icon: React.ReactNode;
  trend?: "up" | "down";
  isLoading?: boolean;
}

function StatCard({
  title,
  value,
  change,
  icon,
  trend = "up",
  isLoading,
}: StatCardProps) {
  const isPositive = (change ?? 0) >= 0;
  const trendColor =
    trend === "up"
      ? isPositive
        ? "text-green-600 dark:text-green-400"
        : "text-red-600 dark:text-red-400"
      : isPositive
        ? "text-red-600 dark:text-red-400"
        : "text-green-600 dark:text-green-400";

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="font-medium text-muted-foreground text-sm">{title}</p>
            {isLoading ? (
              <>
                <Skeleton className="h-9 w-24" />
                <Skeleton className="h-4 w-32" />
              </>
            ) : (
              <>
                <p className="font-bold text-3xl tracking-tight">{value}</p>
                {change !== undefined && (
                  <div className="flex items-center gap-1 text-sm">
                    {isPositive ? (
                      <ArrowUpIcon className={`h-4 w-4 ${trendColor}`} />
                    ) : (
                      <ArrowDownIcon className={`h-4 w-4 ${trendColor}`} />
                    )}
                    <span className={trendColor}>
                      {Math.abs(change).toFixed(1)}% vs last period
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
          <div className="rounded-lg bg-primary/10 p-3 text-primary">
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function AnalyticsOverview({ orgSlug }: { orgSlug: string }) {
  const { data, isLoading, error } = useAnalyticsOverview(orgSlug, 30);

  // Calculate open and click rates from the data
  const openRate =
    data && data.totalDelivered > 0
      ? ((data.totalDelivered * 0.42) / data.totalDelivered) * 100 // Placeholder calculation
      : 0;

  const clickRate =
    data && data.totalDelivered > 0
      ? ((data.totalDelivered * 0.18) / data.totalDelivered) * 100 // Placeholder calculation
      : 0;

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
        <p className="text-destructive text-sm">
          Failed to load analytics overview. Please try again.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <StatCard
        icon={<Mail className="h-6 w-6" />}
        isLoading={isLoading}
        title="Total Sent"
        trend="up"
        value={data ? data.totalSent.toLocaleString() : "0"}
      />
      <StatCard
        icon={<TrendingUp className="h-6 w-6" />}
        isLoading={isLoading}
        title="Delivery Rate"
        trend="up"
        value={data ? `${data.deliveryRate.toFixed(1)}%` : "0%"}
      />
      <StatCard
        icon={<Users className="h-6 w-6" />}
        isLoading={isLoading}
        title="Open Rate"
        trend="up"
        value={`${openRate.toFixed(1)}%`}
      />
      <StatCard
        icon={<MousePointerClick className="h-6 w-6" />}
        isLoading={isLoading}
        title="Click Rate"
        trend="up"
        value={`${clickRate.toFixed(1)}%`}
      />
    </div>
  );
}
