"use client";

import { Mail, MousePointerClick, TrendingUp, Users } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { useAnalyticsOverview } from "../hooks/use-analytics";

export function AnalyticsOverview({ orgSlug }: { orgSlug: string }) {
  const { data, isLoading, error } = useAnalyticsOverview(orgSlug, 30);

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
        value={data ? `${data.openRate.toFixed(1)}%` : "0%"}
      />
      <StatCard
        icon={<MousePointerClick className="h-6 w-6" />}
        isLoading={isLoading}
        title="Click Rate"
        value={data ? `${data.clickRate.toFixed(1)}%` : "0%"}
      />
    </div>
  );
}
