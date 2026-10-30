"use client";

import { Panel, PanelTitle } from "@wraps/ui/components/ui/panel";
import { Progress } from "@wraps/ui/components/ui/progress";
import { Skeleton } from "@wraps/ui/components/ui/skeleton";
import { AlertCircle, DollarSign } from "lucide-react";
import { useSMSStatus } from "../hooks/use-sms-analytics";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function getSpendLimitLabel(name: string): string {
  switch (name) {
    case "TEXT_MESSAGE_MONTHLY_SPEND_LIMIT":
      return "Monthly SMS Spend Limit";
    case "VOICE_MESSAGE_MONTHLY_SPEND_LIMIT":
      return "Monthly Voice Spend Limit";
    case "TEXT_MESSAGE_MONTHLY_SPEND":
      return "Current Monthly SMS Spend";
    case "VOICE_MESSAGE_MONTHLY_SPEND":
      return "Current Monthly Voice Spend";
    default:
      return name
        .replace(/_/g, " ")
        .toLowerCase()
        .replace(/^\w/, (c) => c.toUpperCase());
  }
}

export function SMSSpendLimits({ orgSlug }: { orgSlug: string }) {
  const { data, isLoading, error } = useSMSStatus(orgSlug);

  if (isLoading) {
    return (
      <Panel
        description="Monthly spend limits and usage"
        label={
          <PanelTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Spend Limits
          </PanelTitle>
        }
        variant="own"
      >
        <div>
          <div className="space-y-4">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        </div>
      </Panel>
    );
  }

  if (error) {
    return (
      <Panel
        label={
          <PanelTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Spend Limits
          </PanelTitle>
        }
        variant="own"
      >
        <div>
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4" />
            <p className="text-sm">Failed to load spend limits</p>
          </div>
        </div>
      </Panel>
    );
  }

  if (!data?.spendLimits || data.spendLimits.length === 0) {
    return (
      <Panel
        description="Monthly spend limits and usage"
        label={
          <PanelTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Spend Limits
          </PanelTitle>
        }
        variant="own"
      >
        <div>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <DollarSign className="mb-4 h-12 w-12 text-muted-foreground/50" />
            <h3 className="font-medium text-lg">No Spend Limits Set</h3>
            <p className="mt-1 text-muted-foreground text-sm">
              Configure spend limits in AWS SMS Voice console
            </p>
          </div>
        </div>
      </Panel>
    );
  }

  // Filter to show relevant limits
  const relevantLimits = data.spendLimits.filter(
    (limit) =>
      limit.name.includes("MONTHLY_SPEND_LIMIT") && limit.enforcedLimit > 0
  );

  if (relevantLimits.length === 0) {
    return (
      <Panel
        description="Monthly spend limits and usage"
        label={
          <PanelTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Spend Limits
          </PanelTitle>
        }
        variant="own"
      >
        <div>
          <div className="py-4 text-center">
            <p className="text-muted-foreground text-sm">
              Default AWS spend limits apply
            </p>
          </div>
        </div>
      </Panel>
    );
  }

  return (
    <Panel
      description="Monthly spend limits and usage"
      label={
        <PanelTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5" />
          Spend Limits
        </PanelTitle>
      }
      variant="own"
    >
      <div>
        <div className="space-y-6">
          {relevantLimits.map((limit) => {
            // Find the corresponding current spend
            const spendName = limit.name.replace("_LIMIT", "");
            const currentSpend = data.spendLimits.find(
              (l) => l.name === spendName
            );
            const spent = currentSpend?.enforcedLimit || 0;
            const percentage =
              limit.enforcedLimit > 0
                ? Math.min((spent / limit.enforcedLimit) * 100, 100)
                : 0;

            return (
              <div className="space-y-2" key={limit.name}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">
                    {getSpendLimitLabel(limit.name)}
                  </span>
                  <span className="text-muted-foreground">
                    {formatCurrency(spent)} /{" "}
                    {formatCurrency(limit.enforcedLimit)}
                  </span>
                </div>
                <Progress className="h-2" value={percentage} />
                <div className="flex items-center justify-between text-muted-foreground text-xs">
                  <span>{percentage.toFixed(1)}% used</span>
                  {limit.overridden && (
                    <span className="text-warning">Custom limit set</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}
