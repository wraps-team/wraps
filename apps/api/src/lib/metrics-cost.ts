import {
  isSesPricingPlan,
  type SesPricingPlan,
  sendingCostForPlan,
} from "@wraps/core/ses-plans";
import {
  type AccountMonthVolume,
  type BillableCell,
  type MetricsDimension,
  type MetricsRow,
  metricsDimensionKey,
} from "@wraps/db";

/** awsAccount.id -> plan; null means the plan is unknown. */
export type AccountPlans = Map<string, SesPricingPlan | null>;

export function parseSesPlan(
  raw: string | null | undefined
): SesPricingPlan | null {
  return raw && isSesPricingPlan(raw) ? raw : null;
}

const round6 = (x: number) => Math.round(x * 1e6) / 1e6;

function sumOrNull(values: Array<number | null>): number | null {
  let sum = 0;
  for (const v of values) {
    if (v === null) {
      return null;
    }
    sum += v;
  }
  return sum;
}

/**
 * Average-per-account-month attribution: each cell is charged the account's
 * blended unit cost for the whole UTC month it was sent in. Unknown plans give
 * null, never a partial sum.
 */
export function attributeCost(input: {
  data: MetricsRow[];
  dimensions: MetricsDimension[];
  cells: BillableCell[];
  volumes: AccountMonthVolume[];
  plans: AccountPlans;
}): {
  data: Array<MetricsRow & { costUsd: number | null }>;
  totalCostUsd: number | null;
  unattributed: number;
} {
  const monthVolumes = new Map(
    input.volumes.map((v) => [
      `${v.awsAccountId}|${v.billingMonth}`,
      v.billable,
    ])
  );

  const cellCosts = input.cells.map((cell): number | null => {
    if (cell.billable === 0) {
      return 0;
    }
    if (cell.awsAccountId === null) {
      return null;
    }
    const plan = input.plans.get(cell.awsAccountId);
    if (!plan) {
      return null;
    }
    const monthVolume = monthVolumes.get(
      `${cell.awsAccountId}|${cell.billingMonth}`
    );
    if (monthVolume === undefined || monthVolume < cell.billable) {
      throw new Error(
        `Month volume ${monthVolume ?? "missing"} is below cell volume ${cell.billable} for ${cell.awsAccountId} ${cell.billingMonth}`
      );
    }
    return (
      (cell.billable * sendingCostForPlan(plan, monthVolume)) / monthVolume
    );
  });

  const costsByKey = new Map<string, Array<number | null>>();
  input.cells.forEach((cell, i) => {
    const group = costsByKey.get(cell.dimensionKey) ?? [];
    group.push(cellCosts[i] ?? null);
    costsByKey.set(cell.dimensionKey, group);
  });

  const data = input.data.map((row) => {
    const group = costsByKey.get(metricsDimensionKey(row, input.dimensions));
    const sum = group ? sumOrNull(group) : 0;
    return { ...row, costUsd: sum === null ? null : round6(sum) };
  });

  const total = sumOrNull(cellCosts);

  return {
    data,
    totalCostUsd: total === null ? null : round6(total),
    unattributed: data.filter((row) => row.costUsd === null).length,
  };
}
