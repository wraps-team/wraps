/**
 * Plan Limits Enforcement Library
 *
 * Provides utilities for checking plan-based limits:
 * - Contact limits (5K, 25K, 100K, 500K)
 * - Feature access (batch, topics, segments, etc.)
 * - Rate limits (daily/minute requests)
 * - AWS account limits
 */

import {
  awsAccount,
  contact,
  db,
  eq,
  organizationExtension,
  subscription,
} from "@wraps/db";
import {
  getRequiredPlan,
  hasFeature,
  PLANS,
  type PlanFeature,
  type PlanId,
} from "../plans";

export interface LimitCheckResult {
  allowed: boolean;
  current: number;
  limit: number;
  message?: string;
  requiredPlan?: PlanId;
}

export interface FeatureCheckResult {
  allowed: boolean;
  requiredPlan: PlanId | null;
  message?: string;
}

/**
 * Get the current plan for an organization
 */
export async function getOrganizationPlan(
  organizationId: string
): Promise<PlanId> {
  // Try organizationExtension first
  const [ext] = await db
    .select({ plan: organizationExtension.plan })
    .from(organizationExtension)
    .where(eq(organizationExtension.organizationId, organizationId))
    .limit(1);

  if (ext?.plan && isValidPlan(ext.plan)) {
    return ext.plan as PlanId;
  }

  // Fall back to subscription table
  const [sub] = await db
    .select({ plan: subscription.plan, status: subscription.status })
    .from(subscription)
    .where(eq(subscription.referenceId, organizationId))
    .limit(1);

  if (
    sub &&
    (sub.status === "active" || sub.status === "trialing") &&
    isValidPlan(sub.plan)
  ) {
    return sub.plan as PlanId;
  }

  return "starter";
}

function isValidPlan(plan: string): plan is PlanId {
  return ["starter", "pro", "growth", "scale"].includes(plan);
}

/**
 * Check if an organization can add more contacts based on their plan
 */
export async function checkContactLimit(
  organizationId: string
): Promise<LimitCheckResult> {
  const planId = await getOrganizationPlan(organizationId);
  const plan = PLANS[planId];

  const contactCount = await db
    .select()
    .from(contact)
    .where(eq(contact.organizationId, organizationId));

  const current = contactCount.length;
  const limit = plan.maxContacts;
  const allowed = limit === -1 || current < limit;

  return {
    allowed,
    current,
    limit,
    message: allowed
      ? undefined
      : `You've reached your ${plan.name} plan limit of ${limit.toLocaleString()} contacts. Upgrade to add more.`,
    requiredPlan: allowed ? undefined : getNextPlan(planId),
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

  const accounts = await db
    .select()
    .from(awsAccount)
    .where(eq(awsAccount.organizationId, organizationId));

  const current = accounts.length;
  const limit = plan.maxAwsAccounts;
  const allowed = limit === -1 || current < limit;

  return {
    allowed,
    current,
    limit,
    message: allowed
      ? undefined
      : `Your ${plan.name} plan includes ${limit} AWS account${limit !== 1 ? "s" : ""}. Upgrade for more.`,
    requiredPlan: allowed ? undefined : getNextPlan(planId),
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
  const allowed = hasFeature(planId, feature);
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
 * Get the next plan tier for upgrade suggestions
 */
function getNextPlan(currentPlan: PlanId): PlanId | undefined {
  const planOrder: PlanId[] = ["starter", "pro", "growth", "scale"];
  const currentIndex = planOrder.indexOf(currentPlan);

  if (currentIndex === -1 || currentIndex >= planOrder.length - 1) {
    return;
  }

  return planOrder[currentIndex + 1];
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
