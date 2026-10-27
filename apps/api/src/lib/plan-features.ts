/**
 * Plan feature rules.
 *
 * Which plan unlocks which feature, and what a broadcast needs from the plan.
 * Kept apart from middleware/plan-gate.ts so route tests that stub the
 * middleware still exercise the real rules. Aligned with
 * apps/web/src/lib/plans.ts: change both together.
 */

import { isSelfHosted } from "../(ee)/lib/license";
import { isPlanId, type PlanId } from "./plan-ids";

// Feature to minimum plan mapping (aligned with apps/web/src/lib/plans.ts)
export const FEATURE_PLANS = {
  batch: "free", // Broadcasts to all contacts; audience and scheduling are gated below
  topics: "pro", // Sending to a topic
  segments: "pro", // Segmentation, including segment broadcasts and triggers
  campaigns: "pro", // Scheduling a broadcast
  workflows: "free", // All tiers (quantity limited by tier)
  events: "free", // All tiers — Free is metered at 5K/mo, not gated
  advancedSegments: "business",
  customRetention: "business",
  prioritySLA: "business",
  sso: "business",
} as const;

export type Feature = keyof typeof FEATURE_PLANS;

// Legacy names keep their old rank so a grandfathered subscription clears the
// same gates it always did — see plans/208.
export const PLAN_HIERARCHY = {
  free: 0,
  pro: 1,
  business: 2,
  starter: 1, // legacy → pro
  growth: 2, // legacy → business
  scale: 2, // legacy → business
} as const satisfies Record<PlanId, number>;

/** Whether a plan clears one feature's gate. Self-hosted deployments are licensed, so everything is open. */
export function planAllows(
  planId: string | null | undefined,
  feature: Feature
): boolean {
  if (isSelfHosted()) {
    return true;
  }
  // Explicit narrow for the same prototype-chain reason as planGateMiddleware.
  const currentLevel = isPlanId(planId) ? PLAN_HIERARCHY[planId] : 0;
  return currentLevel >= PLAN_HIERARCHY[FEATURE_PLANS[feature]];
}

export type BroadcastEntitlementInput = {
  audienceType?: "all" | "topic" | "segment";
  scheduled: boolean;
};

export type BroadcastEntitlementResult =
  | { ok: true }
  | { ok: false; feature: Feature; requiredPlan: string; message: string };

const BROADCAST_DENIAL: Partial<Record<Feature, string>> = {
  topics: "Sending a broadcast to a topic",
  segments: "Sending a broadcast to a segment",
  campaigns: "Scheduling a broadcast",
};

/**
 * What a broadcast needs from the plan: sending to all contacts is open to
 * every plan; a topic audience, a segment audience and a scheduled send each
 * need Pro. The first unmet requirement is reported.
 * Keep in step with checkBroadcastEntitlements in apps/web/src/lib/plans.ts.
 */
export function checkBroadcastEntitlements(
  planId: string | null | undefined,
  input: BroadcastEntitlementInput
): BroadcastEntitlementResult {
  const required: Feature[] = ["batch"];
  if (input.audienceType === "topic") {
    required.push("topics");
  }
  if (input.audienceType === "segment") {
    required.push("segments");
  }
  if (input.scheduled) {
    required.push("campaigns");
  }

  for (const feature of required) {
    if (!planAllows(planId, feature)) {
      const requiredPlan = FEATURE_PLANS[feature];
      const what = BROADCAST_DENIAL[feature] ?? "Broadcasts";
      return {
        ok: false,
        feature,
        requiredPlan,
        message: `${what} requires the ${requiredPlan} plan or higher. Upgrade at https://wraps.dev/upgrade`,
      };
    }
  }
  return { ok: true };
}

/** Workflow triggers that fire off segment membership, so they need segmentation. */
export const SEGMENT_TRIGGER_TYPES: readonly string[] = [
  "segment_entry",
  "segment_exit",
];

export type WorkflowTriggerEntitlementResult =
  | { ok: true }
  | { ok: false; requiredPlan: string; message: string };

/**
 * Whether a plan may use these workflow triggers. Segment entry and exit
 * triggers need the segments feature (Pro and up); every other trigger is
 * open. Keep in step with workflowTriggerFeature in apps/web/src/lib/plans.ts.
 */
export function checkWorkflowTriggerEntitlements(
  planId: string | null | undefined,
  triggerTypes: readonly string[]
): WorkflowTriggerEntitlementResult {
  const needsSegments = triggerTypes.some((t) =>
    SEGMENT_TRIGGER_TYPES.includes(t)
  );
  if (!needsSegments || planAllows(planId, "segments")) {
    return { ok: true };
  }
  const requiredPlan = FEATURE_PLANS.segments;
  return {
    ok: false,
    requiredPlan,
    message: `Segment entry and exit triggers require the ${requiredPlan} plan or higher. Upgrade at https://wraps.dev/upgrade`,
  };
}
