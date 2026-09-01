/**
 * Plan Feature Gating Middleware
 *
 * Checks if the organization's plan has access to the requested feature.
 */

import { Elysia } from "elysia";
import { isSelfHosted } from "../(ee)/lib/license";
import { isPlanId, type PlanId } from "../lib/plan-ids";
import { getAuthOptional } from "./auth";

// Feature to minimum plan mapping (aligned with apps/web/src/lib/plans.ts)
export const FEATURE_PLANS = {
  batch: "pro",
  topics: "pro",
  segments: "pro",
  campaigns: "pro",
  workflows: "free", // All tiers (quantity limited by tier)
  events: "free", // All tiers — Free is metered at 5K/mo, not gated
  advancedSegments: "business",
  customRetention: "business",
  prioritySLA: "business",
  sso: "business",
} as const;

type Feature = keyof typeof FEATURE_PLANS;

// Legacy names keep their old rank so a grandfathered subscription clears the
// same gates it always did — see plans/208.
const PLAN_HIERARCHY = {
  free: 0,
  pro: 1,
  business: 2,
  starter: 1, // legacy → pro
  growth: 2, // legacy → business
  scale: 2, // legacy → business
} as const satisfies Record<PlanId, number>;

export function planGateMiddleware(feature: Feature) {
  return new Elysia({ name: `plan-gate:${feature}` }).derive(
    { as: "scoped" },
    async (ctx) => {
      const authContext = getAuthOptional(ctx);
      const { set } = ctx;

      if (!authContext) {
        set.status = 401;
        throw new Error("Not authenticated");
      }

      // Self-hosted deployments are licensed — all features unlocked.
      if (isSelfHosted()) {
        return {};
      }

      const { planId } = authContext;
      const requiredPlan = FEATURE_PLANS[feature];

      // Explicit narrow, not `PLAN_HIERARCHY[planId as PlanId] ?? 0`. That
      // form walks the prototype chain: PLAN_HIERARCHY["constructor"] returns
      // a Function rather than undefined, so `?? 0` never fires and
      // `Function < requiredLevel` evaluates false — the gate grants access
      // instead of denying it. Same class of bug as 317855ad, which fixed the
      // apps/web side; this is the enforcement side.
      const currentLevel = isPlanId(planId) ? PLAN_HIERARCHY[planId] : 0;
      const requiredLevel = PLAN_HIERARCHY[requiredPlan];

      if (currentLevel < requiredLevel) {
        set.status = 403;
        throw new Error(
          `Feature '${feature}' requires ${requiredPlan} plan or higher. ` +
            `Current plan: ${planId}. Upgrade at https://wraps.dev/upgrade`
        );
      }

      return {};
    }
  );
}
