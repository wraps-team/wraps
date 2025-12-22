/**
 * Plan Feature Gating Middleware
 *
 * Checks if the organization's plan has access to the requested feature.
 */

import { Elysia } from "elysia";
import type { AuthContext } from "./auth";

// Feature to minimum plan mapping
const FEATURE_PLANS = {
  batch: "starter", // Starter+
  topics: "pro", // Pro+
  segments: "pro", // Pro+
  campaigns: "pro", // Pro+
  workflows: "growth", // Growth+
  events: "growth", // Growth+
  advancedSegments: "growth", // Growth+
  customRetention: "scale", // Scale+
  prioritySLA: "scale", // Scale+
} as const;

type Feature = keyof typeof FEATURE_PLANS;

// Plan hierarchy for comparison
const PLAN_HIERARCHY = {
  starter: 0,
  pro: 1,
  growth: 2,
  scale: 3,
} as const;

type PlanId = keyof typeof PLAN_HIERARCHY;

export function planGateMiddleware(feature: Feature) {
  return new Elysia({ name: `plan-gate:${feature}` }).derive(
    async (ctx) => {
      const authContext = (ctx as unknown as { auth: AuthContext }).auth;
      const { set } = ctx;

      if (!authContext) {
        set.status = 401;
        throw new Error("Not authenticated");
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
