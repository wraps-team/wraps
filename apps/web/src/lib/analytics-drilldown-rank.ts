/**
 * Ranking for the bounce drill-down's "which sends caused it" view.
 *
 * Pure TypeScript, so the rules are tested without a database. The repository
 * returns one aggregate row per group. This module ranks them by excess
 * events over the window rate, applies the minimum-volume floor, and bounds
 * the response. Every group is kept somewhere: ranked, belowFloor, or counted
 * in `omitted`.
 */

import type { DrilldownMetric } from "./analytics-drilldown-window";

/** Minimum sends for a group to be ranked, per metric. */
export const ATTRIBUTION_FLOOR: Record<DrilldownMetric, number> = {
  bounce: 100,
  suppression: 100,
  complaint: 1000,
};

export const RANKED_LIMIT = 100;
export const BELOW_FLOOR_LIMIT = 200;

export type AttributionCounts = {
  sent: number;
  bounced: number;
  permanent: number;
  transient: number;
  undetermined: number;
  complained: number;
  suppressed: number;
};

/** One group as the ranking sees it: its key, label and counts. */
export type AttributionInputGroup = AttributionCounts & {
  key: string | null;
  label: string | null;
  sourceTypes: string[];
};

export type AttributionGroup = AttributionInputGroup & {
  events: number;
  rate: number | null;
  share: number | null;
  excess: number;
  eligible: boolean;
};

export type AttributionRanking = {
  floor: number;
  ranked: AttributionGroup[];
  belowFloor: AttributionGroup[];
  omitted: AttributionCounts & { groups: number };
};

/**
 * The aggregate row shape the repository returns (`queryMessageAttributionRows`).
 * Its count names come from the shared AGGREGATE_FIELDS in message-metrics.ts.
 * The mapping to response names lives only in attributionRowToInput.
 */
export type AttributionAggregateRow = {
  key: string | null;
  label: string | null;
  sourceTypes: (string | null)[];
  sent: number;
  bounced: number;
  bouncedPermanent: number;
  bouncedTransient: number;
  bouncedUndetermined: number;
  complained: number;
  suppressed: number;
};

export function attributionRowToInput(
  row: AttributionAggregateRow
): AttributionInputGroup {
  return {
    key: row.key,
    label: row.label,
    sourceTypes: row.sourceTypes.filter((s): s is string => s !== null),
    sent: row.sent,
    bounced: row.bounced,
    permanent: row.bouncedPermanent,
    transient: row.bouncedTransient,
    undetermined: row.bouncedUndetermined,
    complained: row.complained,
    suppressed: row.suppressed,
  };
}

export function sumCounts(groups: AttributionCounts[]): AttributionCounts {
  const total: AttributionCounts = {
    sent: 0,
    bounced: 0,
    permanent: 0,
    transient: 0,
    undetermined: 0,
    complained: 0,
    suppressed: 0,
  };
  for (const g of groups) {
    total.sent += g.sent;
    total.bounced += g.bounced;
    total.permanent += g.permanent;
    total.transient += g.transient;
    total.undetermined += g.undetermined;
    total.complained += g.complained;
    total.suppressed += g.suppressed;
  }
  return total;
}

/** The count the chosen metric measures: bounced, complained or suppressed. */
export function eventsFor(
  counts: AttributionCounts,
  metric: DrilldownMetric
): number {
  if (metric === "complaint") {
    return counts.complained;
  }
  if (metric === "suppression") {
    return counts.suppressed;
  }
  return counts.bounced;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** `part` as a percentage of `whole`, 2 dp. Null when `whole` is zero. */
export function percentOf(part: number, whole: number): number | null {
  return whole > 0 ? round2((part / whole) * 100) : null;
}

// Excess is a float (sent * rate). Compare at 1e-6 so two groups that are
// mathematically tied are tied here too, and their order is decided by volume
// and key, not by float noise.
function excessKey(excess: number): number {
  return Math.round(excess * 1_000_000);
}

// Null keys sort last; otherwise plain string order.
function compareKeyAsc(a: string | null, b: string | null): number {
  if (a === b) {
    return 0;
  }
  if (a === null) {
    return 1;
  }
  if (b === null) {
    return -1;
  }
  return a < b ? -1 : 1;
}

/**
 * Ranks groups for one metric against the window totals.
 *
 * `windowRate` = total events / total sent. A group's excess is its events
 * minus sent * windowRate: how far it pushed the rate above what its volume
 * predicts. Excess sums to zero over all groups. Ranking uses the unrounded
 * excess. Output values are rounded to 2 dp.
 */
export function rankAttribution(
  groups: AttributionInputGroup[],
  totals: AttributionCounts,
  metric: DrilldownMetric
): AttributionRanking {
  const floor = ATTRIBUTION_FLOOR[metric];
  const totalEvents = eventsFor(totals, metric);
  const windowRate = totals.sent > 0 ? totalEvents / totals.sent : 0;

  const scored = groups.map((g) => {
    const events = eventsFor(g, metric);
    const excess = events - g.sent * windowRate;
    return { group: g, events, excess };
  });

  const toOutput = ({
    group,
    events,
    excess,
  }: (typeof scored)[number]): AttributionGroup => ({
    ...group,
    events,
    rate: percentOf(events, group.sent),
    share: percentOf(events, totalEvents),
    excess: round2(excess),
    eligible: group.sent >= floor,
  });

  const eligible = scored
    .filter((s) => s.group.sent >= floor)
    .sort(
      (a, b) =>
        excessKey(b.excess) - excessKey(a.excess) ||
        b.group.sent - a.group.sent ||
        compareKeyAsc(a.group.key, b.group.key)
    );

  const below = scored
    .filter((s) => s.group.sent < floor)
    .sort(
      (a, b) =>
        b.group.sent - a.group.sent || compareKeyAsc(a.group.key, b.group.key)
    );

  const rankedSource = eligible.slice(0, RANKED_LIMIT);
  const belowSource = below.slice(0, BELOW_FLOOR_LIMIT);
  const overflow = [
    ...eligible.slice(RANKED_LIMIT),
    ...below.slice(BELOW_FLOOR_LIMIT),
  ].map((s) => s.group);

  const omittedCounts = sumCounts(overflow);

  return {
    floor,
    ranked: rankedSource.map(toOutput),
    belowFloor: belowSource.map(toOutput),
    omitted: { ...omittedCounts, groups: overflow.length },
  };
}
