/**
 * Plan Limits Enforcement Library
 *
 * Provides utilities for checking plan-based limits:
 * - Message limits (1K, 10K, 50K, 250K per plan)
 * - Feature access (batch, topics, segments, etc.)
 * - Rate limits (daily/minute requests)
 * - AWS account limits
 * - Team member limits (free tier: 1, paid: unlimited)
 * - Workflow limits (free tier: 1, paid: unlimited)
 */

import { createPublicKey, verify } from "node:crypto";
import {
  awsAccount,
  contact,
  db,
  eq,
  member,
  subscription,
  workflow,
} from "@wraps/db";
import { count } from "drizzle-orm";
import {
  getNextPlan,
  getRequiredPlan,
  hasFeature,
  PLANS,
  type PlanFeature,
  type PlanId,
} from "../plans";

// Duplicate of apps/api/src/(ee)/lib/license.ts — intentional to avoid
// cross-package coupling. Keep in sync manually.
//
// This note used to point at apps/api/src/lib/license.ts, a path that no longer
// exists, and the two copies duly diverged: the API's tier list was never
// updated for the three-tier restructure, so a valid pro/business licence was
// rejected there while being accepted here. `packages/cli/src/utils/license.ts`
// and `packages/cli/src/commands/license/generate.ts` are two further copies.
// Four in total — consolidate them.
const PROD_PUBLIC_KEY_PEM =
  "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEATgLTGM1FH6spW9Ayl9Srb1dDHk7KlVX9NBTQQw+4vjQ=\n-----END PUBLIC KEY-----\n";
// "starter" | "growth" | "scale" are legacy names that appear in licences
// already issued to self-hosted customers. They must remain valid forever.
const LICENSE_VALID_TIERS = [
  "pro",
  "business",
  "starter",
  "growth",
  "scale",
] as const;
type LicenseTier = (typeof LICENSE_VALID_TIERS)[number];

function getPublicKey() {
  return createPublicKey(
    process.env.WRAPS_LICENSE_PUBLIC_KEY_PEM ?? PROD_PUBLIC_KEY_PEM
  );
}

function validateWebLicenseKey(key: string | undefined): LicenseTier | null {
  if (!key) {
    return null;
  }
  const parts = key.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") {
    return null;
  }
  const [, tier, expires, sigHex] = parts;
  if (!(LICENSE_VALID_TIERS as readonly string[]).includes(tier)) {
    return null;
  }
  const expiryDate = new Date(expires);
  if (Number.isNaN(expiryDate.getTime())) {
    return null;
  }
  const today = new Date().toISOString().slice(0, 10);
  if (expires < today) {
    return null;
  }
  if (sigHex.length !== 128) {
    return null;
  }
  try {
    const payload = Buffer.from(`v1.${tier}.${expires}`);
    const sig = Buffer.from(sigHex, "hex");
    if (!verify(null, payload, getPublicKey(), sig)) {
      return null;
    }
  } catch {
    return null;
  }
  return tier as LicenseTier;
}

/**
 * The plan tier granted by a valid self-hosted license key, or null when no
 * valid license is present (i.e. cloud). This is the source of truth for a
 * self-hosted org's plan — it overrides any Stripe subscription.
 */
export function getLicensedPlan(): PlanId | null {
  return validateWebLicenseKey(process.env.WRAPS_LICENSE_KEY);
}

/**
 * True when running as a self-hosted deployment with a valid license key.
 * Self-hosted orgs get their plan from the license (not Stripe), so plan
 * selection and billing steps should be skipped during onboarding.
 */
export function isSelfHosted(): boolean {
  return getLicensedPlan() !== null;
}

export type LimitCheckResult = {
  allowed: boolean;
  current: number;
  limit: number;
  message?: string;
  requiredPlan?: PlanId;
};

export type FeatureCheckResult = {
  allowed: boolean;
  requiredPlan: PlanId | null;
  message?: string;
};

/**
 * Get the current plan for an organization
 * Source of truth: subscription table (managed by Better-Auth Stripe plugin)
 *
 * Returns "free" if no valid paid subscription exists.
 * The free tier allows basic dashboard access with limited features.
 */
export async function getOrganizationPlan(
  organizationId: string
): Promise<PlanId> {
  const licensedTier = getLicensedPlan();
  if (licensedTier) {
    return licensedTier;
  }

  const [sub] = await db
    .select({ plan: subscription.plan, status: subscription.status })
    .from(subscription)
    .where(eq(subscription.referenceId, organizationId))
    .limit(1);

  if (
    sub &&
    (sub.status === "active" || sub.status === "trialing") &&
    isValidPaidPlan(sub.plan)
  ) {
    return sub.plan as PlanId;
  }

  // No valid paid subscription - default to free tier
  return "free";
}

/**
 * True for any plan id in `PLANS` that costs money — the three publicly
 * purchasable paid tiers and the legacy ids still attached to grandfathered
 * subscriptions.
 *
 * Derived from `PLANS` rather than hardcoded. A hardcoded list is what broke
 * this: it still read `["starter", "growth", "scale"]` after the three-tier
 * restructure renamed the ladder, so `getOrganizationPlan` rejected every
 * `pro` and `business` subscription and fell through to "free" — silently
 * serving Free limits to paying customers. Adding a tier to `PLANS` must never
 * again require remembering to edit a second list here.
 *
 * `Object.hasOwn` rather than `in`: `in` walks the prototype chain, so
 * "constructor" and "__proto__" would resolve to `Object.prototype` and pass.
 */
function isValidPaidPlan(plan: string): boolean {
  return Object.hasOwn(PLANS, plan) && PLANS[plan as PlanId].price > 0;
}

/**
 * Check if an organization can add more contacts based on their plan
 */
export async function checkContactLimit(
  organizationId: string
): Promise<LimitCheckResult> {
  const planId = await getOrganizationPlan(organizationId);
  const plan = PLANS[planId];

  const [row] = await db
    .select({ count: count() })
    .from(contact)
    .where(eq(contact.organizationId, organizationId));

  const current = row?.count ?? 0;
  const limit = isSelfHosted() ? -1 : plan.maxContacts;
  const allowed = limit === -1 || current < limit;

  return {
    allowed,
    current,
    limit,
    message: allowed
      ? undefined
      : `You've reached your ${plan.name} plan limit of ${limit.toLocaleString()} contacts. Upgrade to add more.`,
    requiredPlan: allowed ? undefined : (getNextPlan(planId) ?? undefined),
  };
}

/**
 * Check if an organization can add more AWS accounts based on their plan
 */
export async function checkAwsAccountLimit(
  organizationId: string
): Promise<LimitCheckResult> {
  const planId = await getOrganizationPlan(organizationId);
  const plan = PLANS[planId];

  const [row] = await db
    .select({ count: count() })
    .from(awsAccount)
    .where(eq(awsAccount.organizationId, organizationId));

  const current = row?.count ?? 0;
  const limit = isSelfHosted() ? -1 : plan.maxAwsAccounts;
  const allowed = limit === -1 || current < limit;

  return {
    allowed,
    current,
    limit,
    message: allowed
      ? undefined
      : `Your ${plan.name} plan includes ${limit} AWS account${limit !== 1 ? "s" : ""}. Upgrade for more.`,
    requiredPlan: allowed ? undefined : (getNextPlan(planId) ?? undefined),
  };
}

/**
 * Check if an organization can add more workflows based on their plan
 */
export async function checkWorkflowLimit(
  organizationId: string
): Promise<LimitCheckResult> {
  const planId = await getOrganizationPlan(organizationId);
  const plan = PLANS[planId];

  const [row] = await db
    .select({ count: count() })
    .from(workflow)
    .where(eq(workflow.organizationId, organizationId));

  const current = row?.count ?? 0;
  const limit = isSelfHosted() ? -1 : plan.maxWorkflows;
  const allowed = limit === -1 || current < limit;

  return {
    allowed,
    current,
    limit,
    message: allowed
      ? undefined
      : `Your ${plan.name} plan includes ${limit} workflow${limit !== 1 ? "s" : ""}. Upgrade for more.`,
    requiredPlan: allowed ? undefined : (getNextPlan(planId) ?? undefined),
  };
}

/**
 * Check if a feature is available for an organization's plan
 */
export async function checkFeatureAccess(
  organizationId: string,
  feature: PlanFeature
): Promise<FeatureCheckResult> {
  const planId = await getOrganizationPlan(organizationId);

  const allowed = isSelfHosted() || hasFeature(planId, feature);
  const requiredPlan = getRequiredPlan(feature);

  const featureNames: Record<PlanFeature, string> = {
    batch: "Batch sending",
    topics: "Topics (subscription management)",
    segments: "Segments",
    campaigns: "Campaigns",
    workflows: "Workflows",
    events: "Event tracking",
    advancedSegments: "Advanced segments",
    customRetention: "Custom retention",
    prioritySLA: "Priority SLA",
    sso: "SSO & SCIM provisioning",
    auditLog: "Audit logs",
  };

  return {
    allowed,
    requiredPlan,
    message: allowed
      ? undefined
      : `${featureNames[feature]} requires a ${requiredPlan ? PLANS[requiredPlan].name : "higher"} plan.`,
  };
}

/**
 * Check if an organization can add more team members based on their plan
 */
export async function checkTeamMemberLimit(
  organizationId: string
): Promise<LimitCheckResult> {
  const planId = await getOrganizationPlan(organizationId);
  const plan = PLANS[planId];

  const [row] = await db
    .select({ count: count() })
    .from(member)
    .where(eq(member.organizationId, organizationId));

  const current = row?.count ?? 0;
  const limit = isSelfHosted() ? -1 : plan.maxTeamMembers;
  const allowed = limit === -1 || current < limit;

  return {
    allowed,
    current,
    limit,
    message: allowed
      ? undefined
      : `Your ${plan.name} plan includes ${limit} team member${limit !== 1 ? "s" : ""}. Upgrade to Starter for unlimited team members.`,
    requiredPlan: allowed ? undefined : (getNextPlan(planId) ?? undefined),
  };
}

/**
 * Get usage summary for an organization
 */
export async function getUsageSummary(organizationId: string) {
  const planId = await getOrganizationPlan(organizationId);
  const plan = PLANS[planId];

  const [contactResult, awsAccountResult] = await Promise.all([
    checkContactLimit(organizationId),
    checkAwsAccountLimit(organizationId),
  ]);

  return {
    planId,
    planName: plan.name,
    contacts: {
      current: contactResult.current,
      limit: contactResult.limit,
      percentUsed:
        contactResult.limit === -1
          ? 0
          : Math.round((contactResult.current / contactResult.limit) * 100),
    },
    awsAccounts: {
      current: awsAccountResult.current,
      limit: awsAccountResult.limit,
      percentUsed:
        awsAccountResult.limit === -1
          ? 0
          : Math.round(
              (awsAccountResult.current / awsAccountResult.limit) * 100
            ),
    },
    aiMessages: {
      limit: plan.aiMessages,
      // TODO: Track actual usage in apiUsageDaily
    },
    features: {
      batch: plan.features.batch,
      topics: plan.features.topics,
      segments: plan.features.segments,
      campaigns: plan.features.campaigns,
      workflows: plan.features.workflows,
      events: plan.features.events,
    },
  };
}
