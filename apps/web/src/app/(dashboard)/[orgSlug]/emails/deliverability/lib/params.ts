import { parseAsStringLiteral } from "nuqs";
import { useHubDays } from "@/hooks/use-hub-days";
import {
  DRILLDOWN_BY,
  type DrilldownBy,
} from "@/lib/analytics-drilldown-window";

/** The metrics the deliverability views show, in toggle order. */
export const DELIVERABILITY_METRICS = [
  "bounce",
  "complaint",
  "suppression",
] as const;

export type DeliverabilityMetric = (typeof DELIVERABILITY_METRICS)[number];

/** The label each metric carries in toggles and titles. */
export const DELIVERABILITY_METRIC_LABEL: Record<DeliverabilityMetric, string> =
  {
    bounce: "Bounces",
    complaint: "Complaints",
    suppression: "Suppressed",
  };

/**
 * The `metric` URL state. The card and the causes panel read it with this one
 * definition, so the two never disagree about its default.
 */
/**
 * The window the deliverability card and the causes panel both draw. Chart
 * buckets are daily, so a 24h range reads as 7 days. Both surfaces take their
 * days from here, so they cannot drift apart.
 */
export function deliverabilityWindowDays(hubDays: number): number {
  return Math.max(hubDays, 7);
}

/** The deliverability window for the current `?days=` range. */
export function useDeliverabilityDays(): number {
  return deliverabilityWindowDays(useHubDays());
}

export const metricParam = parseAsStringLiteral(
  DELIVERABILITY_METRICS
).withDefault("bounce");

/** The group-by the `sends.by` URL param asks for. Unknown or missing means broadcast. */
export function readSendsBy(value: string | null): DrilldownBy {
  return (DRILLDOWN_BY as readonly string[]).includes(value ?? "")
    ? (value as DrilldownBy)
    : "broadcast";
}
