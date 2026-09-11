"use client";

import { Activity } from "lucide-react";
import { UsageCard } from "@/components/usage-card";
import { useEventUsage } from "@/hooks/use-event-usage";

type EventUsageCardProps = {
  orgSlug: string;
  className?: string;
  action?: React.ReactNode;
};

export function EventUsageCard({
  orgSlug,
  className,
  action,
}: EventUsageCardProps) {
  const { data: usage, isLoading } = useEventUsage(orgSlug);

  return (
    <UsageCard
      action={action}
      className={className}
      description="Tracked events this month"
      icon={Activity}
      isLoading={isLoading}
      title="Event Usage"
      upgradeHref={`/${orgSlug}/settings/billing`}
      usage={usage}
    />
  );
}
