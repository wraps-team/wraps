"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@wraps/ui/components/ui/badge";
import { ButtonGroup } from "@wraps/ui/components/ui/button-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@wraps/ui/components/ui/select";
import * as React from "react";
import { EventUsageBanner } from "@/components/event-usage-banner";
import { EventUsageCard } from "@/components/event-usage-card";
import { Button } from "@/components/ui/button";
import { RefreshButton } from "@/components/ui/refresh-button";
import { getHistoryRetentionDays, getPlan } from "@/lib/plans";
import { useProductsStore } from "@/stores/products-store";
import type { RecentItem, SetupStatus } from "../page";
import { ActivityFeed } from "./activity-feed";
import { HealthStatus } from "./health-status";
import { InfrastructureStatusCard } from "./infrastructure-status-card";
import { InsightsSection } from "./insights-section";
import { SendVolumeSpark } from "./send-volume-spark";

const TIME_OPTIONS = [
  { value: "7d", label: "7 days", days: 7 },
  { value: "14d", label: "14 days", days: 14 },
  { value: "30d", label: "30 days", days: 30 },
  { value: "90d", label: "90 days", days: 90 },
] as const;

type TimeRange = (typeof TIME_OPTIONS)[number]["value"];

function parseDays(timeRange: TimeRange): number {
  const opt = TIME_OPTIONS.find((o) => o.value === timeRange);
  return opt?.days ?? 30;
}

type OverviewDashboardProps = {
  orgSlug: string;
  organizationId: string;
  organizationName: string;
  setupStatus: SetupStatus;
  recentItems: RecentItem[];
};

export function OverviewDashboard({
  orgSlug,
  setupStatus,
  recentItems,
}: OverviewDashboardProps) {
  const productsStatus = useProductsStore((s) => s.status);
  const planId = productsStatus?.planId ?? "free";
  const plan = getPlan(planId);
  const maxDays = getHistoryRetentionDays(planId);

  const availableOptions = TIME_OPTIONS.filter((opt) => opt.days <= maxDays);

  const [timeRange, setTimeRange] = React.useState<TimeRange>(() => {
    if (maxDays >= 30) {
      return "30d";
    }
    if (maxDays >= 14) {
      return "14d";
    }
    return "7d";
  });

  const days = parseDays(timeRange);
  const queryClient = useQueryClient();

  function handleRefresh() {
    return queryClient.invalidateQueries({ queryKey: ["analytics"] });
  }

  return (
    <>
      <EventUsageBanner orgSlug={orgSlug} />
      <div className="space-y-6 px-4 lg:px-6 py-6">
        <div className="flex items-center justify-end gap-3">
          <ButtonGroup className="hidden sm:flex">
            {availableOptions.map((opt) => (
              <Button
                aria-pressed={timeRange === opt.value}
                className="aria-pressed:bg-accent aria-pressed:text-accent-foreground"
                key={opt.value}
                onClick={() => setTimeRange(opt.value)}
                size="touch"
                variant="outline"
              >
                {opt.label}
              </Button>
            ))}
            <RefreshButton onRefresh={handleRefresh} />
          </ButtonGroup>
          <Select
            onValueChange={(v) => setTimeRange(v as TimeRange)}
            value={timeRange}
          >
            <SelectTrigger
              aria-label="Select time range"
              className="flex sm:hidden w-28"
              size="touch"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              {availableOptions.map((opt) => (
                <SelectItem
                  className="rounded-lg"
                  key={opt.value}
                  value={opt.value}
                >
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <RefreshButton className="sm:hidden" onRefresh={handleRefresh} />
        </div>
        <HealthStatus days={days} orgSlug={orgSlug} />
        <InsightsSection
          days={days}
          orgSlug={orgSlug}
          setupStatus={setupStatus}
        />
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <SendVolumeSpark days={days} orgSlug={orgSlug} />
            <ActivityFeed orgSlug={orgSlug} recentItems={recentItems} />
          </div>
          <div className="space-y-6">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground">
                  Plan
                </span>
                <Badge variant="secondary">{plan?.name ?? "Free"}</Badge>
              </div>
              <EventUsageCard orgSlug={orgSlug} />
            </div>
            <InfrastructureStatusCard
              orgSlug={orgSlug}
              setupStatus={setupStatus}
            />
          </div>
        </div>
      </div>
    </>
  );
}
