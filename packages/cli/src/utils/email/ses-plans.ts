/**
 * SES pricing plans — re-exported from `@wraps/core/ses-plans`, the single
 * source of truth shared with the dashboard. The marketing site keeps its own
 * copy in `apps/website/src/lib/ses-cost.ts` by decision (plan 131).
 *
 * The SES-prefixed aliases keep existing CLI call sites and tests unchanged.
 */
export {
  cheapestPlan,
  isSesPricingPlan as isSESPricingPlan,
  monthlyCostForPlan,
  planComparison,
  SES_PLAN_RATES,
  SES_PRICING_PLANS,
  type SesPlanComparison as SESPlanComparison,
  type SesPlanComparisonRow as SESPlanComparisonRow,
  type SesPlanRate as SESPlanRate,
  type SesPlanTier as SESPlanTier,
  type SesPricingPlan as SESPricingPlan,
} from "@wraps/core/ses-plans";

/** Format a USD amount for CLI output. */
export function formatUSD(amount: number): string {
  return `$${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
