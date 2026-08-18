"use client";

import {
  AlertTriangleIcon,
  ArrowRightIcon,
  BarChart3Icon,
  MailIcon,
  SendIcon,
  ShieldAlertIcon,
  TrendingDownIcon,
  TrendingUpIcon,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useEventUsage } from "@/hooks/use-event-usage";
import { cn } from "@/lib/utils";
import { useProductsStore } from "@/stores/products-store";
import {
  useAnalyticsOverview,
  useVolumeData,
} from "../emails/analytics/hooks/use-analytics";
import type { SetupStatus } from "../page";
import { useSMSVolumeData } from "../sms/analytics/hooks/use-sms-analytics";

type Insight = {
  id: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  href: string;
  label: string;
  severity: "warning" | "critical" | "info";
};

// Minimum sends in a period to trigger anomaly detection
const MIN_VOLUME_FOR_ANOMALY = 50;

// Delivery rate is a percentage-point comparison, so a handful of bounces or
// rendering failures swings it double digits at low volume. Require a much
// larger sample before a pp-delta alert is meaningful — and ignore tiny
// dogfood/test traffic entirely.
const MIN_VOLUME_FOR_DELIVERY_ANOMALY = 200;

type AnomalyResult = {
  metric: string;
  current: number;
  previous: number;
  multiplier: number;
  severity: "warning" | "critical" | null;
};

function computeAnomaly(
  metric: string,
  current: number,
  previous: number,
  warningThreshold: number,
  criticalThreshold: number,
  direction: "increase" | "decrease"
): AnomalyResult {
  if (previous === 0) {
    return { metric, current, previous, multiplier: 0, severity: null };
  }

  const multiplier =
    direction === "increase" ? current / previous : previous / current;

  let severity: "warning" | "critical" | null = null;
  if (multiplier >= criticalThreshold) {
    severity = "critical";
  } else if (multiplier >= warningThreshold) {
    severity = "warning";
  }

  return { metric, current, previous, multiplier, severity };
}

export function detectVolumeAnomalies(
  emailData?: {
    date: string;
    sent: number;
    delivered?: number;
    bounced?: number;
    renderingFailures?: number;
  }[],
  smsData?: {
    date: string;
    sent: number;
    delivered?: number;
    failed?: number;
  }[]
): AnomalyResult[] {
  const anomalies: AnomalyResult[] = [];

  if (emailData && emailData.length >= 4) {
    const mid = Math.floor(emailData.length / 2);
    const prev = emailData.slice(0, mid);
    const curr = emailData.slice(mid);

    const prevSent = prev.reduce((s, d) => s + d.sent, 0);
    const currSent = curr.reduce((s, d) => s + d.sent, 0);
    const prevBounced = prev.reduce((s, d) => s + (d.bounced ?? 0), 0);
    const currBounced = curr.reduce((s, d) => s + (d.bounced ?? 0), 0);

    // Bounce rate anomaly
    if (
      prevSent >= MIN_VOLUME_FOR_ANOMALY &&
      currSent >= MIN_VOLUME_FOR_ANOMALY
    ) {
      const prevBounceRate = (prevBounced / prevSent) * 100;
      const currBounceRate = (currBounced / currSent) * 100;

      if (prevBounceRate > 0) {
        anomalies.push(
          computeAnomaly(
            "Email bounce rate",
            currBounceRate,
            prevBounceRate,
            2,
            3,
            "increase"
          )
        );
      }
    }

    // Delivery rate anomaly. This consumes /analytics/volume, which is served
    // by `getEmailMetricsFromPostgres`: `sent` counts rows whose status is NOT
    // 'failed' and `renderingFailures` counts rows whose status IS 'failed' -
    // disjoint sets (analytics-fallback.ts). `sent` is therefore ALREADY the
    // effective denominator. Subtracting rendering failures again (needed only
    // when CloudWatch's `Send`, which included them, was the source) shrinks
    // the denominator and invents delivery-rate drops. Gate on volume - a
    // pp-delta on a few dozen sends is noise, not a deliverability signal.
    const prevEffectiveSent = prevSent;
    const currEffectiveSent = currSent;

    if (
      prevEffectiveSent >= MIN_VOLUME_FOR_DELIVERY_ANOMALY &&
      currEffectiveSent >= MIN_VOLUME_FOR_DELIVERY_ANOMALY
    ) {
      const prevDelivered = prev.reduce((s, d) => s + (d.delivered ?? 0), 0);
      const currDelivered = curr.reduce((s, d) => s + (d.delivered ?? 0), 0);
      const prevDeliveryRate = (prevDelivered / prevEffectiveSent) * 100;
      const currDeliveryRate = (currDelivered / currEffectiveSent) * 100;
      const deliveryDrop = prevDeliveryRate - currDeliveryRate;

      if (deliveryDrop > 10) {
        anomalies.push({
          metric: "Email delivery rate",
          current: currDeliveryRate,
          previous: prevDeliveryRate,
          multiplier: deliveryDrop,
          severity: "critical",
        });
      } else if (deliveryDrop > 5) {
        anomalies.push({
          metric: "Email delivery rate",
          current: currDeliveryRate,
          previous: prevDeliveryRate,
          multiplier: deliveryDrop,
          severity: "warning",
        });
      }
    }

    // Volume drop anomaly (unexpected decrease)
    if (prevSent >= MIN_VOLUME_FOR_ANOMALY && prevSent > 0) {
      const volumeRatio = currSent / prevSent;
      if (volumeRatio < 0.2) {
        anomalies.push({
          metric: "Email send volume",
          current: currSent,
          previous: prevSent,
          multiplier: Math.round((1 - volumeRatio) * 100),
          severity: "critical",
        });
      } else if (volumeRatio < 0.5) {
        anomalies.push({
          metric: "Email send volume",
          current: currSent,
          previous: prevSent,
          multiplier: Math.round((1 - volumeRatio) * 100),
          severity: "warning",
        });
      }
    }
  }

  // SMS anomalies
  if (smsData && smsData.length >= 4) {
    const mid = Math.floor(smsData.length / 2);
    const prev = smsData.slice(0, mid);
    const curr = smsData.slice(mid);

    const prevSent = prev.reduce((s, d) => s + d.sent, 0);
    const currSent = curr.reduce((s, d) => s + d.sent, 0);
    const prevFailed = prev.reduce((s, d) => s + (d.failed ?? 0), 0);
    const currFailed = curr.reduce((s, d) => s + (d.failed ?? 0), 0);

    if (
      prevSent >= MIN_VOLUME_FOR_ANOMALY &&
      currSent >= MIN_VOLUME_FOR_ANOMALY
    ) {
      const prevFailRate = (prevFailed / prevSent) * 100;
      const currFailRate = (currFailed / currSent) * 100;

      if (prevFailRate > 0) {
        anomalies.push(
          computeAnomaly(
            "SMS failure rate",
            currFailRate,
            prevFailRate,
            2,
            3,
            "increase"
          )
        );
      }
    }
  }

  return anomalies.filter((a) => a.severity !== null);
}

export function InsightsSection({
  orgSlug,
  setupStatus,
  days = 30,
}: {
  orgSlug: string;
  setupStatus: SetupStatus;
  days?: number;
}) {
  const productsStatus = useProductsStore((s) => s.status);
  const isEmailEnabled = productsStatus?.emailEnabled ?? false;
  const isSMSEnabled = productsStatus?.smsEnabled ?? false;

  const { data: eventUsage } = useEventUsage(orgSlug);
  const { data: emailAnalytics } = useAnalyticsOverview(orgSlug, days);

  // Fetch 2x the period for anomaly comparison
  const { data: emailVolume } = useVolumeData(orgSlug, days * 2);
  const { data: smsVolume } = useSMSVolumeData(orgSlug, days * 2);

  // Surface a channel's insights when it's flagged enabled OR has real send
  // data. The stored enabled flag can lag actual usage, and a real bounce or
  // volume-drop alert must never be hidden behind a stale flag.
  const hasEmailData =
    (emailAnalytics?.totalSent ?? 0) > 0 ||
    (emailVolume?.some((d) => d.sent > 0) ?? false);
  const hasSMSData = smsVolume?.some((d) => d.sent > 0) ?? false;
  const showEmail = isEmailEnabled || hasEmailData;
  const showSMS = isSMSEnabled || hasSMSData;

  const insights: Insight[] = [];

  // --- Anomaly delta callouts ---
  const anomalies = detectVolumeAnomalies(
    showEmail ? emailVolume : undefined,
    showSMS ? smsVolume : undefined
  );

  for (const anomaly of anomalies) {
    if (!anomaly.severity) {
      continue;
    }

    const isRateMetric = anomaly.metric.includes("rate");
    const isVolumeDrop = anomaly.metric.includes("volume");
    const isDeliveryDrop = anomaly.metric === "Email delivery rate";

    let title: string;
    let description: string;
    let icon: React.ReactNode;

    if (isVolumeDrop) {
      title = `Send volume dropped ${anomaly.multiplier}%`;
      description = `From ${anomaly.previous.toLocaleString()} to ${anomaly.current.toLocaleString()} compared to the previous period.`;
      icon = (
        <TrendingDownIcon
          className={cn(
            "h-4 w-4",
            anomaly.severity === "critical" ? "text-red-500" : "text-amber-500"
          )}
        />
      );
    } else if (isDeliveryDrop) {
      title = `Delivery rate dropped ${anomaly.multiplier.toFixed(1)}pp`;
      description = `From ${anomaly.previous.toFixed(1)}% to ${anomaly.current.toFixed(1)}% compared to the previous period.`;
      icon = (
        <TrendingDownIcon
          className={cn(
            "h-4 w-4",
            anomaly.severity === "critical" ? "text-red-500" : "text-amber-500"
          )}
        />
      );
    } else {
      title = `${anomaly.metric} increased ${anomaly.multiplier.toFixed(1)}x`;
      description = `From ${anomaly.previous.toFixed(isRateMetric ? 2 : 0)}${isRateMetric ? "%" : ""} to ${anomaly.current.toFixed(isRateMetric ? 2 : 0)}${isRateMetric ? "%" : ""} compared to the previous period.`;
      icon = (
        <TrendingUpIcon
          className={cn(
            "h-4 w-4",
            anomaly.severity === "critical" ? "text-red-500" : "text-amber-500"
          )}
        />
      );
    }

    const isSMS = anomaly.metric.startsWith("SMS");
    insights.push({
      id: `anomaly-${anomaly.metric}`,
      icon,
      title,
      description,
      href: isSMS
        ? `/${orgSlug}/sms/analytics`
        : `/${orgSlug}/emails/analytics`,
      label: "Investigate",
      severity: anomaly.severity,
    });
  }

  // --- Static threshold alerts ---

  // Event usage approaching limit
  if (eventUsage && eventUsage.threshold !== "normal") {
    const severity =
      eventUsage.threshold === "warning" ? "warning" : "critical";
    insights.push({
      id: "event-limit",
      icon: (
        <AlertTriangleIcon
          className={cn(
            "h-4 w-4",
            severity === "critical" ? "text-red-500" : "text-amber-500"
          )}
        />
      ),
      title:
        severity === "critical"
          ? "Event limit reached"
          : "Approaching event limit",
      description: `${eventUsage.percentUsed}% of your monthly limit used. ${eventUsage.remaining.toLocaleString()} events remaining.`,
      href: `/${orgSlug}/settings/billing`,
      label: "Upgrade Plan",
      severity,
    });
  }

  // High bounce rate (static threshold, distinct from anomaly)
  if (showEmail && emailAnalytics && emailAnalytics.bounceRate > 2) {
    // Skip if we already flagged this as an anomaly
    const hasAnomalyForBounce = anomalies.some(
      (a) => a.metric === "Email bounce rate" && a.severity
    );
    if (!hasAnomalyForBounce) {
      const severity = emailAnalytics.bounceRate > 5 ? "critical" : "warning";
      insights.push({
        id: "bounce-rate",
        icon: (
          <BarChart3Icon
            className={cn(
              "h-4 w-4",
              severity === "critical" ? "text-red-500" : "text-amber-500"
            )}
          />
        ),
        title: `Bounce rate at ${emailAnalytics.bounceRate.toFixed(1)}%`,
        description:
          emailAnalytics.bounceRate > 5
            ? "This is above the 5% threshold. Clean your contact list and verify your DNS records."
            : "Getting elevated. Review bounced emails and consider cleaning your list.",
        href: `/${orgSlug}/emails/analytics`,
        label: "View Bounces",
        severity,
      });
    }
  }

  // High complaint rate
  if (showEmail && emailAnalytics && emailAnalytics.complaintRate > 0.1) {
    const severity =
      emailAnalytics.complaintRate > 0.3 ? "critical" : "warning";
    insights.push({
      id: "complaint-rate",
      icon: <ShieldAlertIcon className="h-4 w-4 text-red-500" />,
      title: `Complaint rate at ${emailAnalytics.complaintRate.toFixed(2)}%`,
      description:
        "AWS SES may suspend sending if this stays above 0.1%. Review your sending practices.",
      href: `/${orgSlug}/emails/analytics`,
      label: "View Details",
      severity,
    });
  }

  // No templates yet
  if (!setupStatus.hasTemplate) {
    insights.push({
      id: "no-template",
      icon: <MailIcon className="h-4 w-4 text-primary" />,
      title: "Create your first template",
      description:
        "Templates let you build reusable emails with your brand kit.",
      href: `/${orgSlug}/emails/templates`,
      label: "Create Template",
      severity: "info",
    });
  }

  // No broadcasts yet
  if (!setupStatus.hasBroadcast && setupStatus.hasTemplate) {
    insights.push({
      id: "no-broadcast",
      icon: <SendIcon className="h-4 w-4 text-primary" />,
      title: "Send your first broadcast",
      description: "Reach your entire contact list with a single send.",
      href: `/${orgSlug}/emails/broadcasts`,
      label: "Send Broadcast",
      severity: "info",
    });
  }

  if (insights.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {insights.map((insight) => (
        <div
          className={cn(
            "flex items-start gap-3 rounded-lg border p-3",
            insight.severity === "critical" && "border-red-500/20 bg-red-500/5",
            insight.severity === "warning" &&
              "border-amber-500/20 bg-amber-500/5",
            insight.severity === "info" && "border-border"
          )}
          key={insight.id}
        >
          <div className="mt-0.5 shrink-0">{insight.icon}</div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{insight.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {insight.description}
            </p>
          </div>
          <Button asChild className="shrink-0" size="sm" variant="ghost">
            <Link href={insight.href}>
              {insight.label}
              <ArrowRightIcon className="ml-1 h-3 w-3" />
            </Link>
          </Button>
        </div>
      ))}
    </div>
  );
}
