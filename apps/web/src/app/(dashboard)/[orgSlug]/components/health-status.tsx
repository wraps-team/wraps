"use client";

import {
  AlertTriangleIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  CircleDashedIcon,
  KeyRoundIcon,
  MailIcon,
  MessageSquareIcon,
  ShieldIcon,
  XCircleIcon,
  ZapIcon,
} from "lucide-react";
import Link from "next/link";
import { useEventUsage } from "@/hooks/use-event-usage";
import { useProductsStatus } from "@/hooks/use-products-status";
import { useSesHealth } from "@/hooks/use-ses-health-queries";
import { humanizeSesHealthReason } from "@/lib/ses-health-reasons";
import { cn } from "@/lib/utils";
import { useProductsStore } from "@/stores/products-store";
import { useAnalyticsOverview } from "../emails/analytics/hooks/use-analytics";
import { useSMSAnalyticsOverview } from "../sms/analytics/hooks/use-sms-analytics";
import {
  getBannerLevel,
  type HealthLevel,
  SES_STATUS_LEVEL,
} from "./health-level";

type ChannelHealth = {
  channel: string;
  icon: React.ReactNode;
  level: HealthLevel;
  metrics: string[];
  href: string;
};

function getHealthIcon(level: HealthLevel) {
  switch (level) {
    case "healthy":
      return (
        <CheckCircleIcon className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
      );
    case "warning":
      return (
        <AlertTriangleIcon className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
      );
    case "critical":
      return (
        <XCircleIcon className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
      );
    case "unknown":
      return <CircleDashedIcon className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

const OVERALL_ICON = {
  healthy: CheckCircleIcon,
  warning: AlertTriangleIcon,
  critical: XCircleIcon,
  unknown: CircleDashedIcon,
} as const;

const overallConfig = {
  healthy: {
    label: "All systems healthy",
    color: "text-green-600 dark:text-green-400",
    bg: "bg-green-500/10",
    border: "border-green-500/20",
  },
  warning: {
    label: "Needs attention",
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
  },
  critical: {
    label: "Action required",
    color: "text-red-600 dark:text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/20",
  },
  unknown: {
    label: "Health not yet checked",
    color: "text-muted-foreground",
    bg: "bg-muted/50",
    border: "border-border",
  },
};

export function HealthStatus({
  orgSlug,
  days = 30,
}: {
  orgSlug: string;
  days?: number;
}) {
  const productsStatus = useProductsStore((s) => s.status);
  const isEmailEnabled = productsStatus?.emailEnabled ?? false;

  const { data: emailData } = useAnalyticsOverview(orgSlug, days);
  const { data: smsData } = useSMSAnalyticsOverview(orgSlug, days);
  const { data: eventUsage } = useEventUsage(orgSlug);
  const { data: productsApiStatus } = useProductsStatus(orgSlug);
  const { data: sesHealth, isLoading: isSesHealthLoading } =
    useSesHealth(orgSlug);

  const channels: ChannelHealth[] = [];

  // SES account survival, first because it is the only row here that can mean
  // "AWS is about to stop your mail". The verdict comes from the hourly
  // account-health sweep via `classifySesHealth`, which reads the signals no
  // window of send analytics can see — SendingEnabled, EnforcementStatus and
  // quota usage — and compares rates against AWS's own review and pause lines.
  // This banner must never compute a second opinion on reputation: two
  // thresholds for one question is how a page ends up saying "all systems
  // healthy" while SES has sending switched off.
  if (sesHealth && sesHealth.accounts.length > 0) {
    const sesLevel: HealthLevel =
      SES_STATUS_LEVEL[sesHealth.status] ?? "unknown";
    const reasons = sesHealth.accounts
      .filter((account) => account.status !== "healthy")
      .flatMap((account) => account.reasons)
      .map(humanizeSesHealthReason);

    channels.push({
      channel: "SES",
      icon: <ShieldIcon className="h-3.5 w-3.5" />,
      level: sesLevel,
      metrics: reasons.length > 0 ? [...new Set(reasons)] : ["Not checked yet"],
      href: `/${orgSlug}/emails/analytics`,
    });
  }

  // Delivery rate is window arithmetic over this org's own sends, so it is a
  // genuinely separate signal from the account-level reputation above rather
  // than a second reading of it.
  if (emailData && (isEmailEnabled || emailData.totalSent > 0)) {
    let level: HealthLevel = "healthy";
    const issues: string[] = [];

    if (emailData.totalSent > 0 && emailData.deliveryRate < 90) {
      level = "critical";
      issues.push(`Delivery rate ${emailData.deliveryRate.toFixed(1)}%`);
    } else if (emailData.totalSent > 0 && emailData.deliveryRate < 95) {
      level = "warning";
      issues.push(`Delivery rate ${emailData.deliveryRate.toFixed(1)}%`);
    }

    channels.push({
      channel: "Email",
      icon: <MailIcon className="h-3.5 w-3.5" />,
      level,
      metrics: issues,
      href: `/${orgSlug}/emails/analytics`,
    });
  }

  // SMS channel — real send volume is the source of truth, not the flag.
  if (smsData && smsData.totalSent > 0) {
    let level: HealthLevel = "healthy";
    const issues: string[] = [];

    if (smsData.failureRate > 10) {
      level = "critical";
      issues.push(`Failure rate ${smsData.failureRate.toFixed(1)}%`);
    } else if (smsData.failureRate > 5) {
      level = "warning";
      issues.push(`Failure rate ${smsData.failureRate.toFixed(1)}%`);
    }

    channels.push({
      channel: "SMS",
      icon: <MessageSquareIcon className="h-3.5 w-3.5" />,
      level,
      metrics: issues,
      href: `/${orgSlug}/sms/analytics`,
    });
  }

  // Event usage as a "channel"
  if (eventUsage && eventUsage.threshold !== "normal") {
    const level: HealthLevel =
      eventUsage.threshold === "critical" || eventUsage.threshold === "exceeded"
        ? "critical"
        : "warning";
    channels.push({
      channel: "Events",
      icon: <ZapIcon className="h-3.5 w-3.5" />,
      level,
      metrics: [
        `${eventUsage.percentUsed}% used`,
        `${eventUsage.remaining.toLocaleString()} remaining`,
      ],
      href: `/${orgSlug}/settings/billing`,
    });
  }

  // IAM role permissions check
  if (productsApiStatus) {
    const roleUpdateProducts = productsApiStatus.products.filter(
      (p) => p.needsRoleUpdate
    );
    if (roleUpdateProducts.length > 0) {
      const affected = roleUpdateProducts.map((p) => p.name).join(" · ");
      const setupHref =
        roleUpdateProducts[0].id === "email"
          ? `/${orgSlug}/emails/setup`
          : `/${orgSlug}/sms/setup`;
      channels.push({
        channel: "IAM Role",
        icon: <KeyRoundIcon className="h-3.5 w-3.5" />,
        level: "critical",
        metrics: [`${affected} permissions missing`],
        href: setupHref,
      });
    }
  }

  const overallLevel = getBannerLevel(
    channels.map((c) => c.level),
    isSesHealthLoading
  );
  const config = overallConfig[overallLevel];
  const OverallIcon = OVERALL_ICON[overallLevel];

  return (
    <div className={cn("rounded-lg border", config.bg, config.border)}>
      {/* Overall status header */}
      <div className="flex items-center gap-3 p-4">
        <OverallIcon className={cn("h-5 w-5 shrink-0", config.color)} />
        <p className={cn("text-sm font-medium", config.color)}>
          {config.label}
        </p>
      </div>

      {/* Per-channel rows — only show unhealthy channels */}
      {channels.some((ch) => ch.level !== "healthy") && (
        <div className="border-t border-inherit">
          {channels
            .filter((ch) => ch.level !== "healthy")
            .map((ch) => (
              <div
                className="flex items-center gap-3 px-4 py-2.5 border-b border-inherit last:border-b-0"
                key={ch.channel}
              >
                <div className="flex items-center gap-2 shrink-0 w-20">
                  {ch.icon}
                  <span className="text-xs font-medium">{ch.channel}</span>
                </div>
                {getHealthIcon(ch.level)}
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground truncate">
                    {ch.metrics.join(" · ")}
                  </p>
                </div>
                <Link
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
                  href={ch.href}
                >
                  Details
                  <ArrowRightIcon className="h-3 w-3" />
                </Link>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
