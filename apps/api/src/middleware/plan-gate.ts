/**
 * Plan Feature Gating Middleware
 *
 * Checks if the organization's plan has access to the requested feature.
 */

import { Elysia } from "elysia";
import { isSelfHosted } from "../(ee)/lib/license";
import { getAuthOptional } from "./auth";

// Feature to minimum plan mapping (aligned with apps/web/src/lib/plans.ts)
export const FEATURE_PLANS = {
  batch: "starter", // Starter+
  topics: "starter", // Starter+
  segments: "starter", // Starter+
  campaigns: "starter", // Starter+
  workflows: "free", // All tiers (quantity limited: 1/unlimited by tier)
  events: "starter", // Starter+
  advancedSegments: "scale", // Scale+
  customRetention: "scale", // Scale+
  prioritySLA: "scale", // Scale+
  sso: "scale", // Scale+
} as const;

type Feature = keyof typeof FEATURE_PLANS;

// Plan hierarchy for comparison
const PLAN_HIERARCHY = {
  free: 0,
  starter: 1,
  growth: 2,
  scale: 3,
} as const;

type PlanId = keyof typeof PLAN_HIERARCHY;

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

      const currentLevel = PLAN_HIERARCHY[planId as PlanId] ?? 0;
      const requiredLevel = PLAN_HIERARCHY[requiredPlan as PlanId] ?? 0;

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
