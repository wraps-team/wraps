/**
 * SES pricing plans — rates, cost math, and per-feature entitlements.
 *
 * Single source of truth for the CLI (`wraps email plan`) and the dashboard
 * (apps/web). The marketing site keeps its own flat copy in
 * `apps/website/src/lib/ses-cost.ts` by decision (plan 131): apps/website
 * takes no dependency on @wraps/core.
 *
 * Imported by apps/web CLIENT components through the `@wraps/core/ses-plans`
 * subpath, so this file must stay import-free: no Node built-ins, no AWS SDK,
 * no other module. `ses-plans.test.ts` enforces that.
 *
 * Plans are set per AWS account, per Region. Rates verified 2026-07-24 and
 * entitlements sourced 2026-09-27 from https://aws.amazon.com/ses/pricing/ and
 * the SES developer guide (pricing-plans, vdm-global-deliverability,
 * managed-dedicated-sending, email-validation-api, email-validation-auto,
 * global-endpoints, tenants, eb-archiving). The tiers are marginal.
 */

/**
 * The four plan values SES reports in `GetAccount`'s
 * `PricingAttributes.CurrentPlan`. Declared locally rather than imported from
 * `@aws-sdk/client-sesv2` so this module stays I/O- and SDK-free; the union is
 * identical to the SDK's `PricingPlan`.
 */
export type SesPricingPlan = "ENTERPRISE" | "ESSENTIALS" | "NONE" | "PRO";

/** Every plan value, in the order they should be rendered (cheapest first). */
export const SES_PRICING_PLANS: readonly SesPricingPlan[] = [
  "NONE",
  "ESSENTIALS",
  "PRO",
  "ENTERPRISE",
] as const;

/** A marginal pricing tier: `per1K` applies to volume up to `upTo`. */
export type SesPlanTier = {
  /** Upper bound of this tier, in emails per month. */
  upTo: number;
  /** USD per 1,000 emails inside this tier. */
  per1K: number;
};

export type SesPlanRate = {
  /** Human-readable plan name for output. */
  label: string;
  /** Fixed USD charged every month regardless of volume. */
  monthlyBase: number;
  /** Marginal sending tiers, ascending. */
  tiers: readonly SesPlanTier[];
  /** What the base fee bundles, for the "cheapest isn't always best" caveat. */
  includes?: string;
};

const TIER_1_LIMIT = 10_000_000;
const TIER_2_LIMIT = 100_000_000;
const UNBOUNDED = Number.POSITIVE_INFINITY;

/**
 * Rate table. Keyed by the `PricingPlan` value the SES API reports, so a
 * response value can be used as a lookup key without translation.
 */
export const SES_PLAN_RATES: Record<SesPricingPlan, SesPlanRate> = {
  NONE: {
    label: "À la carte",
    monthlyBase: 0,
    tiers: [{ upTo: UNBOUNDED, per1K: 0.1 }],
  },
  ESSENTIALS: {
    label: "Essentials",
    monthlyBase: 0,
    tiers: [
      { upTo: TIER_1_LIMIT, per1K: 0.16 },
      { upTo: TIER_2_LIMIT, per1K: 0.14 },
      { upTo: UNBOUNDED, per1K: 0.11 },
    ],
  },
  PRO: {
    label: "Pro",
    monthlyBase: 105,
    tiers: [
      { upTo: TIER_1_LIMIT, per1K: 0.22 },
      { upTo: TIER_2_LIMIT, per1K: 0.17 },
      { upTo: UNBOUNDED, per1K: 0.12 },
    ],
    includes:
      "1 domain, 1 managed dedicated IP, 5 seed-list tests, 2,500 API validations/mo",
  },
  ENTERPRISE: {
    label: "Enterprise",
    monthlyBase: 500,
    tiers: [
      { upTo: TIER_1_LIMIT, per1K: 0.23 },
      { upTo: TIER_2_LIMIT, per1K: 0.18 },
      { upTo: UNBOUNDED, per1K: 0.13 },
    ],
    includes:
      "5 domains, 12 managed dedicated IPs, 25 seed-list tests, 5,000 API validations/mo, multi-Region and tenant support",
  },
};

/** Round to whole cents so money comparisons don't trip on float noise. */
function roundCents(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/** Is this a value SES would actually report? */
export function isSesPricingPlan(value: string): value is SesPricingPlan {
  return (SES_PRICING_PLANS as readonly string[]).includes(value);
}

/**
 * USD sending cost of `emailsPerMonth` on `plan`: graduated per-1K tiers only,
 * no base fee, NOT rounded. For attributing cost to slices of a month — the
 * rounded, base-inclusive figure is `monthlyCostForPlan`.
 */
export function sendingCostForPlan(
  plan: SesPricingPlan,
  emailsPerMonth: number
): number {
  const rate = SES_PLAN_RATES[plan];
  const volume = Math.max(0, emailsPerMonth);

  let remaining = volume;
  let previousLimit = 0;
  let sendingCost = 0;

  for (const tier of rate.tiers) {
    if (remaining <= 0) {
      break;
    }
    const tierCapacity = tier.upTo - previousLimit;
    const inThisTier = Math.min(remaining, tierCapacity);
    sendingCost += (inThisTier / 1000) * tier.per1K;
    remaining -= inThisTier;
    previousLimit = tier.upTo;
  }

  return sendingCost;
}

/**
 * Monthly USD cost of `emailsPerMonth` on `plan`: the base fee plus the
 * graduated per-1K sending cost.
 *
 * The tiers are marginal, not flat — an account sending 20M on Essentials pays
 * $0.16/1K on the first 10M and $0.14/1K on the next 10M, for $3,000. Applying
 * a single rate to the whole volume would understate it as $2,800.
 */
export function monthlyCostForPlan(
  plan: SesPricingPlan,
  emailsPerMonth: number
): number {
  return roundCents(
    SES_PLAN_RATES[plan].monthlyBase + sendingCostForPlan(plan, emailsPerMonth)
  );
}

/**
 * The plan with the lowest monthly cost at this volume.
 *
 * CAVEAT: this compares *sending cost only*. Pro and Enterprise bundle managed
 * dedicated IPs, seed-list tests, and API validations that have real standalone
 * value (a managed dedicated IP alone is ~$15/mo à la carte), and this function
 * gives them no credit. That is precisely why `wraps email plan` recommends
 * rather than auto-applies — a customer already buying those add-ons has a
 * different break-even.
 *
 * Ties resolve toward the earlier entry in `SES_PRICING_PLANS`, i.e. toward the
 * plan with the smaller commitment.
 */
export function cheapestPlan(emailsPerMonth: number): SesPricingPlan {
  let best: SesPricingPlan = "NONE";
  let bestCost = monthlyCostForPlan("NONE", emailsPerMonth);

  for (const plan of SES_PRICING_PLANS) {
    const cost = monthlyCostForPlan(plan, emailsPerMonth);
    if (cost < bestCost) {
      best = plan;
      bestCost = cost;
    }
  }

  return best;
}

export type SesPlanComparisonRow = {
  plan: SesPricingPlan;
  label: string;
  monthlyBase: number;
  /** Total monthly USD at the compared volume. */
  monthlyCost: number;
  /**
   * `monthlyCost` minus the current plan's cost. Negative means this plan is
   * cheaper than what the account is on today. `undefined` when the current
   * plan is unknown.
   */
  deltaVsCurrent?: number;
  isCurrent: boolean;
  isCheapest: boolean;
  includes?: string;
};

export type SesPlanComparison = {
  emailsPerMonth: number;
  currentPlan?: SesPricingPlan;
  cheapestPlan: SesPricingPlan;
  rows: SesPlanComparisonRow[];
  /**
   * Annualized USD saved by moving from `currentPlan` to `cheapestPlan`.
   * `0` when already on the cheapest plan, `undefined` when the current plan
   * is unknown.
   */
  annualSavings?: number;
};

/**
 * All four plans priced at `emailsPerMonth`, with each one's delta against the
 * account's current plan. This is the shape both the human table and the
 * `--json` contract render from.
 */
export function planComparison(
  emailsPerMonth: number,
  currentPlan?: SesPricingPlan
): SesPlanComparison {
  const cheapest = cheapestPlan(emailsPerMonth);
  const currentCost = currentPlan
    ? monthlyCostForPlan(currentPlan, emailsPerMonth)
    : undefined;

  const rows: SesPlanComparisonRow[] = SES_PRICING_PLANS.map((plan) => {
    const rate = SES_PLAN_RATES[plan];
    const monthlyCost = monthlyCostForPlan(plan, emailsPerMonth);
    return {
      plan,
      label: rate.label,
      monthlyBase: rate.monthlyBase,
      monthlyCost,
      deltaVsCurrent:
        currentCost === undefined
          ? undefined
          : roundCents(monthlyCost - currentCost),
      isCurrent: plan === currentPlan,
      isCheapest: plan === cheapest,
      includes: rate.includes,
    };
  });

  const annualSavings =
    currentCost === undefined
      ? undefined
      : roundCents(
          Math.max(
            0,
            (currentCost - monthlyCostForPlan(cheapest, emailsPerMonth)) * 12
          )
        );

  return {
    emailsPerMonth,
    currentPlan,
    cheapestPlan: cheapest,
    rows,
    annualSavings,
  };
}

/** A capability AWS bundles into, or sells on top of, an SES pricing plan. */
export type SesPlanFeature =
  | "vdm"
  | "globalDeliverability"
  | "managedDedicatedIps"
  | "autoValidation"
  | "validationApi"
  | "globalEndpoints"
  | "tenants"
  | "openIngress"
  | "archiving";

/** Every feature, in display order. */
export const SES_PLAN_FEATURES: readonly SesPlanFeature[] = [
  "vdm",
  "globalDeliverability",
  "managedDedicatedIps",
  "autoValidation",
  "validationApi",
  "globalEndpoints",
  "tenants",
  "openIngress",
  "archiving",
] as const;

export const SES_PLAN_FEATURE_LABELS: Record<SesPlanFeature, string> = {
  vdm: "Virtual Deliverability Manager",
  globalDeliverability:
    "Global deliverability (inbox placement, seed-list tests, IP blocklist monitoring)",
  managedDedicatedIps: "Managed dedicated IPs",
  autoValidation: "Email validation: Auto Validation",
  validationApi: "Email validation: API",
  globalEndpoints: "Global endpoints (multi-Region)",
  tenants: "Tenants",
  openIngress: "Mail Manager open ingress endpoint",
  archiving: "Archiving",
};

/**
 * What a plan gives you for one feature. AWS turns NOTHING on when a plan is
 * chosen: "included" means no extra charge once you enable it, not enabled.
 * Using a feature outside the plan never errors — it bills as an add-on.
 * Prices are display strings, not inputs to math.
 */
export type SesFeatureEntitlement =
  | { status: "included"; allowance?: string; overage?: string }
  | { status: "addon"; price: string }
  | { status: "unavailable"; reason: string };

const ALA_CARTE_VDM: SesFeatureEntitlement = {
  status: "addon",
  price: "Charged at the à la carte VDM rate",
};
const OPEN_INGRESS_ADDON: SesFeatureEntitlement = {
  status: "addon",
  price: "$50 per endpoint per month",
};
const ARCHIVING_ADDON: SesFeatureEntitlement = {
  status: "addon",
  price: "$2 per GB ingested plus $0.19 per GB-month",
};

const SES_FEATURE_ENTITLEMENTS: Record<
  SesPlanFeature,
  Record<SesPricingPlan, SesFeatureEntitlement>
> = {
  vdm: {
    NONE: ALA_CARTE_VDM,
    ESSENTIALS: { status: "included" },
    PRO: { status: "included" },
    ENTERPRISE: { status: "included" },
  },
  globalDeliverability: {
    NONE: { status: "addon", price: "Optional extra — see AWS SES pricing" },
    ESSENTIALS: {
      status: "addon",
      price: "$1,250 per month per account per Region",
    },
    PRO: {
      status: "included",
      allowance: "1 domain, 1 IP, 5 seed-list tests per month",
      overage: "$25 per domain, $12.50 per IP, $10 per seed-list test",
    },
    ENTERPRISE: {
      status: "included",
      allowance: "5 domains, 12 IPs, 25 seed-list tests per month",
      overage: "$25 per domain, $12.50 per IP, $10 per seed-list test",
    },
  },
  managedDedicatedIps: {
    NONE: { status: "addon", price: "$15 per month plus a per-email fee" },
    ESSENTIALS: {
      status: "addon",
      price: "Optional extra (à la carte: $15 per month plus a per-email fee)",
    },
    PRO: { status: "included" },
    ENTERPRISE: { status: "included" },
  },
  autoValidation: {
    NONE: { status: "addon", price: "$0.01 per 1,000 emails" },
    ESSENTIALS: { status: "addon", price: "$0.01 per 1,000 emails" },
    PRO: { status: "included" },
    ENTERPRISE: { status: "included" },
  },
  validationApi: {
    NONE: { status: "addon", price: "$0.01 per validation" },
    ESSENTIALS: { status: "addon", price: "$0.01 per validation" },
    PRO: {
      status: "included",
      allowance: "2,500 validations per month per account per Region",
      overage: "$0.01 per validation",
    },
    ENTERPRISE: {
      status: "included",
      allowance: "5,000 validations per month per account per Region",
      overage: "$0.01 per validation",
    },
  },
  globalEndpoints: {
    NONE: { status: "addon", price: "$0.03 per 1,000 emails" },
    ESSENTIALS: { status: "addon", price: "$0.03 per 1,000 emails" },
    PRO: { status: "addon", price: "$0.03 per 1,000 emails" },
    ENTERPRISE: { status: "included" },
  },
  tenants: {
    NONE: { status: "addon", price: "$0.005 per 1,000 emails" },
    ESSENTIALS: { status: "addon", price: "$0.005 per 1,000 emails" },
    PRO: { status: "addon", price: "$0.005 per 1,000 emails" },
    ENTERPRISE: {
      status: "included",
      allowance: "1,000 tenants per account per Region",
      overage: "$0.005 per tenant per month",
    },
  },
  openIngress: {
    NONE: OPEN_INGRESS_ADDON,
    ESSENTIALS: OPEN_INGRESS_ADDON,
    PRO: OPEN_INGRESS_ADDON,
    ENTERPRISE: {
      status: "included",
      allowance: "1 endpoint per account per Region",
      overage: "$50 per endpoint per month",
    },
  },
  archiving: {
    NONE: ARCHIVING_ADDON,
    ESSENTIALS: ARCHIVING_ADDON,
    PRO: ARCHIVING_ADDON,
    ENTERPRISE: ARCHIVING_ADDON,
  },
};

/** What `plan` gives you for `feature`. */
export function getSesFeatureEntitlement(
  plan: SesPricingPlan,
  feature: SesPlanFeature
): SesFeatureEntitlement {
  return SES_FEATURE_ENTITLEMENTS[feature][plan];
}
