"use client";

import { Panel, PanelTitle } from "@wraps/ui/components/ui/panel";
import { CheckCircle, MessageSquare, TrendingUp, XCircle } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { useSMSAnalyticsOverview } from "../hooks/use-sms-analytics";

/**
 * Four figures in one panel with a ruled 2x2 / 1x4 grid. The rules are per
 * cell because the grid changes shape at `lg`: the borders name the cell's
 * place at each breakpoint.
 */
export function SMSOverview({ orgSlug }: { orgSlug: string }) {
  const { data, isLoading, error } = useSMSAnalyticsOverview(orgSlug, 30);

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
        <p className="text-destructive text-sm">
          Failed to load SMS analytics overview. Please try again.
        </p>
      </div>
    );
  }

  return (
    <Panel label={<PanelTitle>SMS overview · 30 days</PanelTitle>}>
      <div className="grid grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<MessageSquare className="h-6 w-6" />}
          isLoading={isLoading}
          title="Total Sent"
          trend="up"
          value={data ? data.totalSent.toLocaleString() : "0"}
        />
        <StatCard
          className="border-l pl-4"
          icon={<CheckCircle className="h-6 w-6" />}
          isLoading={isLoading}
          title="Delivered"
          trend="up"
          value={data ? data.totalDelivered.toLocaleString() : "0"}
        />
        <StatCard
          className="border-t pl-0 lg:border-t-0 lg:border-l lg:pl-4"
          icon={<TrendingUp className="h-6 w-6" />}
          isLoading={isLoading}
          title="Delivery Rate"
          trend="up"
          value={data ? `${data.deliveryRate.toFixed(1)}%` : "0%"}
        />
        <StatCard
          className="border-t border-l pl-4 lg:border-t-0"
          icon={<XCircle className="h-6 w-6" />}
          isLoading={isLoading}
          title="Failure Rate"
          trend="down"
          value={data ? `${data.failureRate.toFixed(1)}%` : "0%"}
        />
      </div>
    </Panel>
  );
}
