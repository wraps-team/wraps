/**
 * Centralized plan configuration for Wraps Dashboard
 *
 * This file defines all pricing tiers and their features.
 * Used across the app for consistent plan information.
 *
 * Plan Philosophy:
 * - Features unlock at the tier where they become valuable
 * - No artificial gates - upgrade triggers are natural business needs
 * - Contact limits scale with pricing tiers
 * - What we limit: contacts, AI messages, AWS accounts, API rate
 * - What we DON'T limit: team members, templates (they're just database rows)
 *
 * Note: The CLI/SDK is free forever and doesn't require a subscription.
 * These plans are only for the hosted dashboard at wraps.dev
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type PlanId = "starter" | "pro" | "growth" | "scale";

export type PlanFeature =
  | "batch" // Starter+: Send to all contacts
  | "topics" // Pro+: Subscription management
  | "segments" // Pro+: Property-based targeting
  | "campaigns" // Pro+: Scheduled, targeted sends
  | "workflows" // Growth+: Visual automation builder
  | "events" // Growth+: Behavioral tracking
  | "advancedSegments" // Growth+: Event-based segments
  | "customRetention" // Scale+: Custom data retention
  | "prioritySLA"; // Scale+: Priority support SLA

export interface RateLimits {
  dailyRequests: number; // -1 = unlimited
  minuteRequests: number;
}

export interface PlanConfig {
  name: string;
  price: number;
  period: string;
  description: string;
  dashboardAccess: boolean;

  // Resource Limits
  maxContacts: number; // -1 = unlimited
  maxMembers: number; // -1 = unlimited
  maxAwsAccounts: number; // -1 = unlimited
  aiMessages: number;
  bulkBatchSize: number;

  // Feature Access
  features: Record<PlanFeature, boolean>;

  // Rate Limits (API requests)
  rateLimits: RateLimits;

  // Display
  featureList: string[];
  cta: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// PLAN DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export const PLANS: Record<PlanId, PlanConfig> = {
  starter: {
    name: "Starter",
    price: 19,
    period: "/month",
    description: "Transactional email + simple broadcasts",
    dashboardAccess: true,

    // Resource Limits
    maxContacts: 5000,
    maxMembers: -1, // Unlimited
    maxAwsAccounts: 1,
    aiMessages: 50,
    bulkBatchSize: 100,

    // Feature Access
    features: {
      batch: true, // Send to all contacts
      topics: false,
      segments: false,
      campaigns: false,
      workflows: false,
      events: false,
      advancedSegments: false,
      customRetention: false,
      prioritySLA: false,
    },

    // Rate Limits
    rateLimits: {
      dailyRequests: 50_000,
      minuteRequests: 500,
    },

    // Display
    featureList: [
      "5,000 contacts",
      "Transactional + batch sending",
      "50 AI messages per month",
      "1 AWS account",
      "50K API requests/day",
      "Email support (48hr)",
    ],
    cta: "Subscribe",
  },

  pro: {
    name: "Pro",
    price: 49,
    period: "/month",
    description: "Add audience management",
    dashboardAccess: true,

    // Resource Limits
    maxContacts: 25_000,
    maxMembers: -1, // Unlimited
    maxAwsAccounts: 3,
    aiMessages: 250,
    bulkBatchSize: 1000,

    // Feature Access
    features: {
      batch: true,
      topics: true, // Subscription management
      segments: true, // Property-based targeting
      campaigns: true, // Scheduled, targeted sends
      workflows: false,
      events: false,
      advancedSegments: false,
      customRetention: false,
      prioritySLA: false,
    },

    // Rate Limits
    rateLimits: {
      dailyRequests: 200_000,
      minuteRequests: 2000,
    },

    // Display
    featureList: [
      "25,000 contacts",
      "Everything in Starter",
      "Topics (subscription management)",
      "Segments (property-based targeting)",
      "Campaigns (scheduled, targeted)",
      "250 AI messages per month",
      "3 AWS accounts",
      "200K API requests/day",
      "Priority support (24hr)",
    ],
    cta: "Subscribe",
  },

  growth: {
    name: "Growth",
    price: 149,
    period: "/month",
    description: "Add automation & behavioral targeting",
    dashboardAccess: true,

    // Resource Limits
    maxContacts: 100_000,
    maxMembers: -1, // Unlimited
    maxAwsAccounts: -1, // Unlimited
    aiMessages: 1000,
    bulkBatchSize: 10_000,

    // Feature Access
    features: {
      batch: true,
      topics: true,
      segments: true,
      campaigns: true,
      workflows: true, // Visual automation builder
      events: true, // Behavioral tracking
      advancedSegments: true, // Event-based segments
      customRetention: false,
      prioritySLA: false,
    },

    // Rate Limits
    rateLimits: {
      dailyRequests: 500_000,
      minuteRequests: 5000,
    },

    // Display
    featureList: [
      "100,000 contacts",
      "Everything in Pro",
      "Workflows (visual automation)",
      "Event tracking (behavioral triggers)",
      "Advanced segments (event-based)",
      "Multi-tenant orchestration",
      "1,000 AI messages per month",
      "Unlimited AWS accounts",
      "500K API requests/day",
      "1 year event retention",
      "Dedicated support",
    ],
    cta: "Subscribe",
  },

  scale: {
    name: "Scale",
    price: 299,
    period: "/month",
    description: "High volume with custom retention",
    dashboardAccess: true,

    // Resource Limits
    maxContacts: 500_000,
    maxMembers: -1, // Unlimited
    maxAwsAccounts: -1, // Unlimited
    aiMessages: 1000,
    bulkBatchSize: 50_000,

    // Feature Access
    features: {
      batch: true,
      topics: true,
      segments: true,
      campaigns: true,
      workflows: true,
      events: true,
      advancedSegments: true,
      customRetention: true, // Custom data retention policies
      prioritySLA: true, // Priority support SLA
    },

    // Rate Limits
    rateLimits: {
      dailyRequests: 1_000_000,
      minuteRequests: 10_000,
    },

    // Display
    featureList: [
      "500,000 contacts",
      "Everything in Growth",
      "Custom retention policies",
      "2 year event retention",
      "1M API requests/day",
      "Priority support + SLA",
    ],
    cta: "Subscribe",
  },
} as const;

export type Plan = PlanConfig;

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if a plan has dashboard access
 */
export function hasDashboardAccess(planId: PlanId | string): boolean {
  const planConfig = PLANS[planId as PlanId];
  return planConfig?.dashboardAccess ?? false;
}

/**
 * Get plan by ID with type safety
 */
export function getPlan(planId: PlanId | string): PlanConfig | undefined {
  return PLANS[planId as PlanId];
}

/**
 * Get available plans for self-serve display
 */
export function getDisplayPlans(): { id: PlanId; plan: PlanConfig }[] {
  return [
    { id: "starter", plan: PLANS.starter },
    { id: "pro", plan: PLANS.pro },
    { id: "growth", plan: PLANS.growth },
    { id: "scale", plan: PLANS.scale },
  ];
}

/**
 * Format price for display
 */
export function formatPrice(plan: PlanConfig): string {
  return `$${plan.price}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTACT LIMITS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get the contact limit for a plan
 * Returns -1 for unlimited
 */
export function getContactLimit(planId: PlanId | string): number {
  const plan = PLANS[planId as PlanId];
  return plan?.maxContacts ?? 5000; // Default to Starter limit
}

/**
 * Check if an organization can add more contacts based on their plan
 */
export function canAddContact(
  planId: PlanId | string,
  currentCount: number
): boolean {
  const limit = getContactLimit(planId);
  if (limit === -1) return true; // Unlimited
  return currentCount < limit;
}

/**
 * Get contact limit message for display
 */
export function getContactLimitMessage(
  planId: PlanId | string,
  currentCount: number
): string {
  const plan = PLANS[planId as PlanId];
  if (!plan) return "You've reached your contact limit.";

  const limit = plan.maxContacts;
  if (limit === -1) return ""; // No limit message needed

  const remaining = limit - currentCount;
  if (remaining <= 0) {
    return `You've reached your ${plan.name} plan limit of ${limit.toLocaleString()} contacts. Upgrade to add more.`;
  }

  if (remaining <= limit * 0.1) {
    // Less than 10% remaining
    return `You have ${remaining.toLocaleString()} contacts remaining on your ${plan.name} plan.`;
  }

  return "";
}

// ═══════════════════════════════════════════════════════════════════════════
// AWS ACCOUNT LIMITS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get the AWS account limit for a plan
 * Returns -1 for unlimited
 */
export function getAwsAccountLimit(planId: PlanId | string): number {
  const plan = PLANS[planId as PlanId];
  return plan?.maxAwsAccounts ?? 1; // Default to 1 if plan not found
}

/**
 * Check if an organization can add more AWS accounts based on their plan
 */
export function canAddAwsAccount(
  planId: PlanId | string,
  currentCount: number
): boolean {
  const limit = getAwsAccountLimit(planId);
  if (limit === -1) return true; // Unlimited
  return currentCount < limit;
}

/**
 * Get AWS account limit message for display
 */
export function getAwsAccountLimitMessage(planId: PlanId | string): string {
  const plan = PLANS[planId as PlanId];
  if (!plan) return "You've reached your AWS account limit.";

  const limit = plan.maxAwsAccounts;
  if (limit === -1) return ""; // No limit message needed

  if (limit === 1) {
    return `Your ${plan.name} plan includes 1 AWS account. Upgrade to Pro for up to 3 accounts.`;
  }

  return `Your ${plan.name} plan includes up to ${limit} AWS accounts. Upgrade for more.`;
}

// ═══════════════════════════════════════════════════════════════════════════
// FEATURE ACCESS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if a feature is available for a plan
 */
export function hasFeature(
  planId: PlanId | string,
  feature: PlanFeature
): boolean {
  const plan = PLANS[planId as PlanId];
  return plan?.features[feature] ?? false;
}

/**
 * Get the minimum plan required for a feature
 */
export function getRequiredPlan(feature: PlanFeature): PlanId | null {
  const planOrder: PlanId[] = ["starter", "pro", "growth", "scale"];

  for (const planId of planOrder) {
    if (PLANS[planId].features[feature]) {
      return planId;
    }
  }

  return null;
}

/**
 * Get feature gate message for display
 */
export function getFeatureGateMessage(
  planId: PlanId | string,
  feature: PlanFeature,
  featureDisplayName: string
): string {
  const currentPlan = PLANS[planId as PlanId];
  const requiredPlan = getRequiredPlan(feature);

  if (!(currentPlan && requiredPlan)) {
    return `${featureDisplayName} is not available on your current plan.`;
  }

  const requiredPlanConfig = PLANS[requiredPlan];
  return `${featureDisplayName} requires a ${requiredPlanConfig.name} plan ($${requiredPlanConfig.price}/mo).`;
}

// ═══════════════════════════════════════════════════════════════════════════
// RATE LIMITS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get rate limits for a plan
 */
export function getRateLimits(planId: PlanId | string): RateLimits {
  const plan = PLANS[planId as PlanId];
  return (
    plan?.rateLimits ?? {
      dailyRequests: 50_000,
      minuteRequests: 500,
    }
  );
}

/**
 * Get batch size limit for a plan
 */
export function getBatchSizeLimit(planId: PlanId | string): number {
  const plan = PLANS[planId as PlanId];
  return plan?.bulkBatchSize ?? 100;
}

/**
 * Get AI message limit for a plan
 */
export function getAiMessageLimit(planId: PlanId | string): number {
  const plan = PLANS[planId as PlanId];
  return plan?.aiMessages ?? 50;
}
