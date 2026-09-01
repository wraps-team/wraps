/**
 * Wraps + AWS cost engine.
 *
 * Pure, dependency-free math shared by every cost surface:
 *   - /tools/ses-calculator (client UI)
 *   - /api/pricing/estimate (agents, MCP, WebMCP)
 *   - public/pricing.md (generated)
 *
 * No React, no Next.js, no I/O — so it runs anywhere.
 */

import type { BillingInterval, TierId } from "../config/pricing";
import { getDisplayPrice, getTier } from "../config/pricing";

// =============================================================================
// SES PRICING PLANS (announced 2026-07-21, per-account and per-Region)
// =============================================================================

export type SesPlanId = "alacarte" | "essentials" | "pro" | "enterprise";

const TIER_1_LIMIT = 10_000_000;
const TIER_2_LIMIT = 100_000_000;

/** One marginal volume band. `upTo` is the cumulative monthly ceiling. */
export type SesPlanTier = {
  upTo: number;
  perThousandEmails: number;
};

export type SesPlan = {
  id: SesPlanId;
  name: string;
  monthlyFee: number;
  /**
   * Headline rate, shown in copy and plan tables. Always equal to the first
   * tier's rate — `sesSendingCost` is what prices real volume.
   */
  perThousandEmails: number;
  /**
   * Marginal volume bands, cheapest-plan math included. An account sending 20M
   * on Essentials pays $0.16/1K on the first 10M and $0.14/1K on the next 10M,
   * for $3,000 — applying the headline rate to the whole volume would overstate
   * it as $3,200.
   */
  tiers: SesPlanTier[];
  /** True for the plan AWS assigns to accounts that never opt in. */
  defaultForNewAccounts: boolean;
  summary: string;
  includesDedicatedIp: boolean;
};

/**
 * Monthly sending cost for `emailsPerMonth`, walking the plan's marginal tiers.
 * Excludes the plan's base fee.
 */
export function sesSendingCost(plan: SesPlan, emailsPerMonth: number): number {
  let remaining = Math.max(0, emailsPerMonth);
  let previousLimit = 0;
  let cost = 0;

  for (const tier of plan.tiers) {
    if (remaining <= 0) {
      break;
    }
    const capacity = tier.upTo - previousLimit;
    const inThisTier = Math.min(remaining, capacity);
    cost += (inThisTier / 1000) * tier.perThousandEmails;
    remaining -= inThisTier;
    previousLimit = tier.upTo;
  }

  return cost;
}

export const SES_PLANS: Record<SesPlanId, SesPlan> = {
  alacarte: {
    id: "alacarte",
    name: "À la carte",
    monthlyFee: 0,
    perThousandEmails: 0.1,
    tiers: [{ upTo: Number.POSITIVE_INFINITY, perThousandEmails: 0.1 }],
    defaultForNewAccounts: false,
    summary:
      "Pay-per-email with no subscription. The cheapest option for send-only workloads.",
    includesDedicatedIp: false,
  },
  essentials: {
    id: "essentials",
    name: "Essentials",
    monthlyFee: 0,
    perThousandEmails: 0.16,
    tiers: [
      { upTo: TIER_1_LIMIT, perThousandEmails: 0.16 },
      { upTo: TIER_2_LIMIT, perThousandEmails: 0.14 },
      { upTo: Number.POSITIVE_INFINITY, perThousandEmails: 0.11 },
    ],
    defaultForNewAccounts: true,
    summary:
      "Bundles Virtual Deliverability Manager. AWS assigns this to every new account by default.",
    includesDedicatedIp: false,
  },
  pro: {
    id: "pro",
    name: "Pro",
    monthlyFee: 105,
    perThousandEmails: 0.22,
    tiers: [
      { upTo: TIER_1_LIMIT, perThousandEmails: 0.22 },
      { upTo: TIER_2_LIMIT, perThousandEmails: 0.17 },
      { upTo: Number.POSITIVE_INFINITY, perThousandEmails: 0.12 },
    ],
    defaultForNewAccounts: false,
    summary:
      "Adds global inbox placement testing, one managed dedicated IP, and 2,500 email validations.",
    includesDedicatedIp: true,
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    monthlyFee: 500,
    perThousandEmails: 0.23,
    tiers: [
      { upTo: TIER_1_LIMIT, perThousandEmails: 0.23 },
      { upTo: TIER_2_LIMIT, perThousandEmails: 0.18 },
      { upTo: Number.POSITIVE_INFINITY, perThousandEmails: 0.13 },
    ],
    defaultForNewAccounts: false,
    summary:
      "Multi-Region, up to 1,000 tenants, 5 domains and 12 dedicated IPs.",
    includesDedicatedIp: true,
  },
};

export const SES_PLAN_IDS = [
  "alacarte",
  "essentials",
  "pro",
  "enterprise",
] as const;

export const DEFAULT_SES_PLAN: SesPlanId = "alacarte";

// =============================================================================
// MARKETING COPY (derived from SES_PLANS — keep numbers in sync with the table above)
// =============================================================================

const ALACARTE_RATE = SES_PLANS.alacarte.perThousandEmails.toFixed(2);
const ESSENTIALS_RATE = SES_PLANS.essentials.perThousandEmails.toFixed(2);

export const SES_PRICING_COPY = {
  /** For stat tiles and table cells — a number plus the qualifier, nothing more. */
  rateStat: `$${ALACARTE_RATE}/1K on à la carte`,
  /** One sentence. For body copy and card descriptions. */
  rateShort: `AWS SES à la carte is $${ALACARTE_RATE} per 1,000 emails; AWS now defaults new accounts to Essentials at $${ESSENTIALS_RATE}.`,
  /** Two sentences. For FAQ answers, JSON-LD, and onboarding. */
  rateLong: `AWS SES à la carte is $${ALACARTE_RATE} per 1,000 emails. New AWS accounts are defaulted to the Essentials plan at $${ESSENTIALS_RATE} per 1,000 — Wraps detects which plan each account and Region is on and tells you how to move back.`,
} as const;

// =============================================================================
// AWS UNIT PRICING (US East, N. Virginia)
// =============================================================================

export const AWS_INFRA_PRICING = {
  DYNAMODB_WRITE_PER_MILLION: 1.25,
  DYNAMODB_STORAGE_PER_GB: 0.25,
  LAMBDA_REQUESTS_PER_MILLION: 0.2,
  LAMBDA_COMPUTE_PER_GB_SECOND: 0.000_016_666_7,
  SQS_REQUESTS_PER_MILLION: 0.5,
  EVENTBRIDGE_EVENTS_PER_MILLION: 1.0,
  DEDICATED_IP_PER_MONTH: 24.95,
  WAF_WEB_ACL_PER_MONTH: 5.0,
  WAF_RULE_PER_MONTH: 1.0,
  WAF_REQUESTS_PER_MILLION: 0.6,
} as const;

export const AWS_FREE_TIER = {
  LAMBDA_REQUESTS: 1_000_000,
  LAMBDA_COMPUTE_GB_SECONDS: 400_000,
  DYNAMODB_STORAGE_GB: 25,
  SQS_REQUESTS: 1_000_000,
} as const;

const LAMBDA_MEMORY_GB = 0.5;
const LAMBDA_AVG_DURATION_SECONDS = 0.1;
const SQS_REQUESTS_PER_EVENT = 3;
const TRACKING_REQUESTS_PER_EMAIL = 2;
const AVG_EVENT_RECORD_KB = 2;

// =============================================================================
// STORAGE
// =============================================================================

export type RetentionPeriod =
  | "7days"
  | "30days"
  | "90days"
  | "1year"
  | "indefinite";

export const RETENTION_PERIODS = [
  "7days",
  "30days",
  "90days",
  "1year",
  "indefinite",
] as const;

const RETENTION_MONTHS: Record<RetentionPeriod, number> = {
  "7days": 0.25,
  "30days": 1,
  "90days": 3,
  "1year": 12,
  indefinite: 24,
};

/** Steady-state storage in GB, i.e. after the retention window has filled. */
export function estimateStorageSize(
  emailsPerMonth: number,
  retention: RetentionPeriod,
  numEventTypes = 8
): number {
  const totalKB =
    emailsPerMonth *
    numEventTypes *
    RETENTION_MONTHS[retention] *
    AVG_EVENT_RECORD_KB;
  return totalKB / 1024 / 1024;
}

/** Month-by-month storage curve until the retention window fills. */
export function calculateStorageGrowth(
  emailsPerMonth: number,
  retention: RetentionPeriod,
  numEventTypes = 8
): Array<{ month: number; storageGB: number }> {
  const retentionMonths = RETENTION_MONTHS[retention];
  const monthlyDataKB = emailsPerMonth * numEventTypes * AVG_EVENT_RECORD_KB;
  const maxMonths = Math.ceil(retentionMonths) + 1;

  return Array.from({ length: maxMonths }, (_, i) => {
    const month = i + 1;
    const accumulatedMonths = Math.min(month, retentionMonths);
    return {
      month,
      storageGB: (monthlyDataKB * accumulatedMonths) / 1024 / 1024,
    };
  });
}

// =============================================================================
// ESTIMATE
// =============================================================================

export type CostInput = {
  emailsPerMonth: number;
  /**
   * Custom events (POST /v1/events). Accepted for backward compatibility;
   * does not currently affect the estimate — see estimateWrapsCost below.
   */
  eventsPerMonth: number;
  tier: TierId;
  billing: BillingInterval;
  sesPlan: SesPlanId;
  eventTracking: boolean;
  eventBridge: boolean;
  dynamodb: boolean;
  retention: RetentionPeriod;
  eventTypes: number;
  dedicatedIp: boolean;
  httpsTracking: boolean;
  waf: boolean;
};

export type CostLine = {
  name: string;
  cost: number;
  details?: string;
};

export type CostEstimate = {
  input: CostInput;
  wraps: {
    tier: TierId;
    tierName: string;
    platformCost: number;
    annualSavings: number;
    total: number;
  };
  aws: {
    plan: SesPlan;
    lines: CostLine[];
    total: number;
  };
  total: number;
  effectiveCostPerThousandEmails: number;
};

export const DEFAULT_COST_INPUT: CostInput = {
  emailsPerMonth: 25_000,
  eventsPerMonth: 5000,
  tier: "free",
  billing: "monthly",
  sesPlan: DEFAULT_SES_PLAN,
  eventTracking: true,
  eventBridge: true,
  dynamodb: true,
  retention: "90days",
  eventTypes: 8,
  dedicatedIp: false,
  httpsTracking: false,
  waf: false,
};

function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

function estimateWrapsCost(input: CostInput): CostEstimate["wraps"] {
  const tier = getTier(input.tier);
  const platformCost = getDisplayPrice(tier, input.billing);
  const annualSavings =
    input.billing === "annual" && tier.annualPrice
      ? tier.price * 12 - tier.annualPrice
      : 0;

  return {
    tier: input.tier,
    tierName: tier.name,
    platformCost,
    annualSavings,
    total: roundCents(platformCost),
  };
}

function sesLines(input: CostInput, plan: SesPlan): CostLine[] {
  const lines: CostLine[] = [];

  if (plan.monthlyFee > 0) {
    lines.push({
      name: `SES ${plan.name} plan fee`,
      cost: plan.monthlyFee,
      details: `$${plan.monthlyFee}/mo per account, per Region`,
    });
  }

  const tiered = input.emailsPerMonth > TIER_1_LIMIT && plan.tiers.length > 1;
  lines.push({
    name: "SES email sending",
    cost: sesSendingCost(plan, input.emailsPerMonth),
    details: tiered
      ? `${input.emailsPerMonth.toLocaleString()} emails on ${plan.name}, priced across AWS's marginal volume tiers (from $${plan.perThousandEmails.toFixed(2)}/1,000)`
      : `${input.emailsPerMonth.toLocaleString()} emails × $${plan.perThousandEmails.toFixed(2)}/1,000 (${plan.name})`,
  });

  return lines;
}

function eventPipelineLines(input: CostInput): CostLine[] {
  const lines: CostLine[] = [];
  const totalEvents = input.emailsPerMonth * input.eventTypes;

  if (input.eventBridge) {
    lines.push({
      name: "EventBridge events",
      cost:
        (totalEvents / 1_000_000) *
        AWS_INFRA_PRICING.EVENTBRIDGE_EVENTS_PER_MILLION,
      details: `${totalEvents.toLocaleString()} events × $${(AWS_INFRA_PRICING.EVENTBRIDGE_EVENTS_PER_MILLION / 1_000_000).toFixed(6)}`,
    });
  }

  const sqsRequests = totalEvents * SQS_REQUESTS_PER_EVENT;
  const sqsCost =
    (Math.max(0, sqsRequests - AWS_FREE_TIER.SQS_REQUESTS) / 1_000_000) *
    AWS_INFRA_PRICING.SQS_REQUESTS_PER_MILLION;
  lines.push({
    name: "SQS queue",
    cost: sqsCost,
    details:
      sqsCost === 0
        ? "Within free tier (1M requests/month)"
        : `${sqsRequests.toLocaleString()} requests (after 1M free tier)`,
  });

  const lambdaRequestCost =
    (Math.max(0, totalEvents - AWS_FREE_TIER.LAMBDA_REQUESTS) / 1_000_000) *
    AWS_INFRA_PRICING.LAMBDA_REQUESTS_PER_MILLION;
  const computeGBSeconds =
    totalEvents * LAMBDA_MEMORY_GB * LAMBDA_AVG_DURATION_SECONDS;
  const lambdaComputeCost =
    Math.max(0, computeGBSeconds - AWS_FREE_TIER.LAMBDA_COMPUTE_GB_SECONDS) *
    AWS_INFRA_PRICING.LAMBDA_COMPUTE_PER_GB_SECOND;
  const lambdaTotalCost = lambdaRequestCost + lambdaComputeCost;
  lines.push({
    name: "Lambda processing",
    cost: lambdaTotalCost,
    details:
      lambdaTotalCost === 0
        ? "Within free tier (1M requests + 400K GB-seconds/month)"
        : `${totalEvents.toLocaleString()} invocations (512MB, 100ms avg)`,
  });

  if (input.dynamodb) {
    const writeCost =
      (totalEvents / 1_000_000) * AWS_INFRA_PRICING.DYNAMODB_WRITE_PER_MILLION;
    const storageGB = estimateStorageSize(
      input.emailsPerMonth,
      input.retention,
      input.eventTypes
    );
    const storageCost =
      Math.max(0, storageGB - AWS_FREE_TIER.DYNAMODB_STORAGE_GB) *
      AWS_INFRA_PRICING.DYNAMODB_STORAGE_PER_GB;
    lines.push({
      name: "DynamoDB storage",
      cost: writeCost + storageCost,
      details: `${storageGB.toFixed(3)} GB at steady-state (${input.retention}), ${totalEvents.toLocaleString()} writes/month`,
    });
  }

  return lines;
}

/**
 * Full monthly cost: what Wraps bills you, plus what AWS bills you.
 * AWS costs land on the customer's own bill — Wraps never marks them up.
 */
export function estimateCost(partial: Partial<CostInput> = {}): CostEstimate {
  const input: CostInput = { ...DEFAULT_COST_INPUT, ...partial };
  const plan = SES_PLANS[input.sesPlan];

  const lines: CostLine[] = sesLines(input, plan);

  if (input.eventTracking) {
    lines.push(...eventPipelineLines(input));
  }

  if (input.dedicatedIp) {
    lines.push(
      plan.includesDedicatedIp
        ? {
            name: "Dedicated IP",
            cost: 0,
            details: `Included with SES ${plan.name}`,
          }
        : {
            name: "Dedicated IP",
            cost: AWS_INFRA_PRICING.DEDICATED_IP_PER_MONTH,
            details: "Recommended above 100K emails/day",
          }
    );
  }

  if (input.httpsTracking && input.waf) {
    const wafRequests = input.emailsPerMonth * TRACKING_REQUESTS_PER_EMAIL;
    lines.push({
      name: "WAF rate limiting",
      cost:
        AWS_INFRA_PRICING.WAF_WEB_ACL_PER_MONTH +
        AWS_INFRA_PRICING.WAF_RULE_PER_MONTH +
        (wafRequests / 1_000_000) * AWS_INFRA_PRICING.WAF_REQUESTS_PER_MILLION,
      details: `$${AWS_INFRA_PRICING.WAF_WEB_ACL_PER_MONTH}/mo Web ACL + $${AWS_INFRA_PRICING.WAF_RULE_PER_MONTH}/mo rule + requests`,
    });
  }

  const awsTotal = lines.reduce((sum, line) => sum + line.cost, 0);
  const wraps = estimateWrapsCost(input);
  const total = wraps.total + awsTotal;

  return {
    input,
    wraps,
    aws: { plan, lines, total: roundCents(awsTotal) },
    total: roundCents(total),
    effectiveCostPerThousandEmails:
      input.emailsPerMonth > 0
        ? Math.round((total / input.emailsPerMonth) * 1000 * 10_000) / 10_000
        : 0,
  };
}

export type SesPlanRecommendation = {
  cheapest: SesPlanId;
  cheapestMonthlyCost: number;
  selectedMonthlyCost: number;
  monthlySavings: number;
  annualSavings: number;
};

/** SES-only monthly cost (base fee + sending + dedicated IP if not bundled). */
function sesPlanMonthlyCost(
  planId: SesPlanId,
  emailsPerMonth: number,
  dedicatedIp: boolean
): number {
  const plan = SES_PLANS[planId];
  const sendingCost = sesSendingCost(plan, emailsPerMonth);
  const ipCost =
    dedicatedIp && !plan.includesDedicatedIp
      ? AWS_INFRA_PRICING.DEDICATED_IP_PER_MONTH
      : 0;
  return roundCents(plan.monthlyFee + sendingCost + ipCost);
}

/**
 * Cheapest SES pricing plan for a given volume, priced on the SES portion
 * only (base fee, sending, dedicated IP) — deliberately excludes the event
 * pipeline, which costs the same regardless of SES plan.
 */
export function recommendSesPlan(
  emailsPerMonth: number,
  selected: SesPlanId,
  dedicatedIp = false
): SesPlanRecommendation {
  const costs = SES_PLAN_IDS.map((id) => ({
    id,
    cost: sesPlanMonthlyCost(id, emailsPerMonth, dedicatedIp),
  }));
  const cheapest = costs.reduce((min, candidate) =>
    candidate.cost < min.cost ? candidate : min
  );
  const selectedMonthlyCost = sesPlanMonthlyCost(
    selected,
    emailsPerMonth,
    dedicatedIp
  );
  const monthlySavings = roundCents(selectedMonthlyCost - cheapest.cost);

  return {
    cheapest: cheapest.id,
    cheapestMonthlyCost: cheapest.cost,
    selectedMonthlyCost,
    monthlySavings,
    annualSavings: roundCents(monthlySavings * 12),
  };
}
