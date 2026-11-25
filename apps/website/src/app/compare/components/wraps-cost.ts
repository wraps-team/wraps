import type { TierId } from "@/config/pricing";
import { estimateCost, type SesPlanId } from "@/lib/ses-cost";

/**
 * One row of the "Wraps, all in" column. Every figure comes from `estimateCost`
 * (the same engine behind /api/pricing/estimate and pricing.md), so a compare
 * page cannot drift from the published worked examples.
 *
 * "All in" is the platform fee plus the AWS bill: sending plus the event
 * pipeline (EventBridge, SQS, Lambda, DynamoDB).
 */
export type WrapsAllIn = {
  /** Platform fee plus the AWS bill, in dollars. */
  total: number;
  platform: number;
  aws: number;
  /** Display strings. The total always carries cents: "$41.50". */
  totalLabel: string;
  breakdown: string;
};

export function formatCents(value: number): string {
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatPlatform(value: number): string {
  return `$${value.toLocaleString("en-US")}`;
}

export function wrapsAllIn({
  emails,
  tier,
  sesPlan = "alacarte",
}: {
  emails: number;
  tier: TierId;
  sesPlan?: SesPlanId;
}): WrapsAllIn {
  const estimate = estimateCost({ emailsPerMonth: emails, tier, sesPlan });
  const platform = estimate.wraps.platformCost;
  const aws = estimate.aws.total;
  const total = Math.round((platform + aws) * 100) / 100;
  const platformLabel =
    platform === 0
      ? `${estimate.wraps.tierName} plan`
      : `${formatPlatform(platform)} ${estimate.wraps.tierName}`;
  return {
    total,
    platform,
    aws,
    totalLabel: formatCents(total),
    breakdown: `${platformLabel} + ${formatCents(aws)} Amazon`,
  };
}

/** "25x", "3.6x": competitor bill over the Wraps total, from the shown numbers. */
export function savingsMultiple(competitor: number, wraps: number): string {
  const ratio = competitor / wraps;
  return ratio >= 10 ? `${Math.round(ratio)}x` : `${ratio.toFixed(1)}x`;
}

/** Dollars a month kept, from the shown numbers. */
export function savingsDollars(competitor: number, wraps: number): string {
  return formatCents(Math.round((competitor - wraps) * 100) / 100);
}

export function savingsPercent(competitor: number, wraps: number): string {
  return `${Math.round(((competitor - wraps) / competitor) * 100)}%`;
}
