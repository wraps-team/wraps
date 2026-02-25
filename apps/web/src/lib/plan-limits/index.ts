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

import {
  awsAccount,
  contact,
  db,
  eq,
  member,
  subscription,
  workflow,
} from "@wraps/db";
import {
  getRequiredPlan,
  hasFeature,
  PLANS,
  type PlanFeature,
  type PlanId,
} from "../plans";

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

function isValidPaidPlan(plan: string): boolean {
  return ["starter", "growth", "scale"].includes(plan);
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
 * Check if an organization can add more workflows based on their plan
 */
export async function checkWorkflowLimit(
  organizationId: string
): Promise<LimitCheckResult> {
  const planId = await getOrganizationPlan(organizationId);
  const plan = PLANS[planId];

  const workflows = await db
    .select()
    .from(workflow)
    .where(eq(workflow.organizationId, organizationId));

  const current = workflows.length;
  const limit = plan.maxWorkflows;
  const allowed = limit === -1 || current < limit;

  return {
    allowed,
    current,
    limit,
    message: allowed
      ? undefined
      : `Your ${plan.name} plan includes ${limit} workflow${limit !== 1 ? "s" : ""}. Upgrade for more.`,
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
    automations: "Automations",
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
 * Check if an organization can add more team members based on their plan
 */
export async function checkTeamMemberLimit(
  organizationId: string
): Promise<LimitCheckResult> {
  const planId = await getOrganizationPlan(organizationId);
  const plan = PLANS[planId];

  const members = await db
    .select()
    .from(member)
    .where(eq(member.organizationId, organizationId));

  const current = members.length;
  const limit = plan.maxTeamMembers;
  const allowed = limit === -1 || current < limit;

  return {
    allowed,
    current,
    limit,
    message: allowed
      ? undefined
      : `Your ${plan.name} plan includes ${limit} team member${limit !== 1 ? "s" : ""}. Upgrade to Starter for unlimited team members.`,
    requiredPlan: allowed ? undefined : getNextPlan(planId),
  };
}

/**
 * Get the next plan tier for upgrade suggestions
 */
function getNextPlan(currentPlan: PlanId): PlanId | undefined {
  const planOrder: PlanId[] = ["free", "starter", "growth", "scale"];
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
      automations: plan.features.automations,
      events: plan.features.events,
    },
  };
}
