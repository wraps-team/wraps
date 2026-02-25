/**
 * Centralized plan configuration for Wraps Platform
 *
 * This file defines all pricing tiers and their features.
 * Used across the app for consistent plan information.
 *
 * PLATFORM FEE PHILOSOPHY:
 * Wraps is a platform fee for email infrastructure you own.
 * - You deploy to YOUR AWS account
 * - You pay AWS directly ($0.10/1K emails)
 * - We provide the tools: dashboard, workflows, AI, analytics
 *
 * What we charge for (Platform value):
 * - Tracked events & history retention
 * - Visual automation builder
 * - AI-powered generation
 * - Team collaboration
 * - Dashboard & analytics
 *
 * What we DON'T charge for:
 * - Email delivery (that's AWS SES)
 * - Per-email fees (you pay AWS directly)
 * - Contacts storage (unlimited on all plans)
 * - Templates (they're just database rows)
 *
 * Note: The CLI/SDK is free forever and doesn't require a subscription.
 * These plans are only for the Platform at app.wraps.dev
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type PlanId = "free" | "starter" | "growth" | "scale";

export type PlanFeature =
  | "batch" // Starter+: Send to all contacts
  | "topics" // Growth+: Subscription management
  | "segments" // Growth+: Property-based targeting
  | "campaigns" // Growth+: Scheduled, targeted sends
  | "automations" // All tiers: Visual automation builder (1/unlimited by tier)
  | "events" // Scale+: Behavioral tracking
  | "advancedSegments" // Scale+: Behavioral segments
  | "customRetention" // Enterprise+: Custom data retention
  | "prioritySLA"; // Enterprise+: Priority support SLA

export type RateLimits = {
  dailyRequests: number; // -1 = unlimited
  minuteRequests: number;
};

export type BillingInterval = "monthly" | "annual";

export type PlanConfig = {
  name: string;
  price: number;
  earlyAdopterPrice?: number; // Discounted price for first 50 customers
  annualPrice?: number; // Regular annual price (per month equivalent)
  annualEarlyAdopterPrice?: number; // Early adopter annual price (per month equivalent)
  annualTotal?: number; // Total billed annually (early adopter)
  period: string;
  description: string;
  dashboardAccess: boolean;

  // Resource Limits
  maxContacts: number; // -1 = unlimited
  maxTeamMembers: number; // -1 = unlimited (free tier = 1)
  maxAwsAccounts: number; // -1 = unlimited
  aiMessages: number;
  bulkBatchSize: number;

  // Event-Based Pricing Limits (Platform Fee model)
  maxMessages: number; // Monthly event limit (-1 = unlimited)
  maxWorkflows: number; // Active workflow limit (-1 = unlimited)
  historyRetentionDays: number; // UI/API filter window (7, 30, 90, 365)

  // Overage Pricing (cents per 1K events, null = must upgrade)
  overagePriceCentsPerK: number | null;

  // Feature Access
  features: Record<PlanFeature, boolean>;

  // Rate Limits (API requests)
  rateLimits: RateLimits;

  // Display
  featureList: string[];
  cta: string;
};

// Early adopter pricing was a launch promotion - now disabled
export const EARLY_ADOPTER_ACTIVE = false;

// ═══════════════════════════════════════════════════════════════════════════
// PLAN DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export const PLANS: Record<PlanId, PlanConfig> = {
  free: {
    name: "Free",
    price: 0,
    period: "/month",
    description: "Try the platform with your AWS account",
    dashboardAccess: true,

    // Resource Limits
    maxContacts: -1, // Unlimited contacts
    maxTeamMembers: 1, // Solo only
    maxAwsAccounts: 1,
    aiMessages: 10,
    bulkBatchSize: 50,

    // Event-Based Pricing Limits
    maxMessages: 5000, // 5K tracked events/month
    maxWorkflows: 1, // 1 workflow
    historyRetentionDays: 7, // 7-day retention

    // Overage: must upgrade (no overage on Free)
    overagePriceCentsPerK: null,

    // Feature Access
    features: {
      batch: false, // Batch sending requires Starter+
      topics: false,
      segments: false,
      campaigns: false,
      automations: true, // 1 automation limit
      events: false,
      advancedSegments: false,
      customRetention: false,
      prioritySLA: false,
    },

    // Rate Limits
    rateLimits: {
      dailyRequests: 1000,
      minuteRequests: 50,
    },

    // Display
    featureList: [
      "5,000 tracked events/month",
      "1 workflow",
      "10 AI generations",
      "1 AWS account",
      "7-day history",
    ],
    cta: "Start Free",
  },

  starter: {
    name: "Starter",
    price: 19,
    earlyAdopterPrice: 19,
    annualPrice: 17, // ~$199/yr
    annualEarlyAdopterPrice: 17,
    annualTotal: 199, // Total billed annually
    period: "/month",
    description: "For indie hackers and side projects",
    dashboardAccess: true,

    // Resource Limits
    maxContacts: -1, // Unlimited contacts
    maxTeamMembers: -1, // Unlimited
    maxAwsAccounts: 1,
    aiMessages: 50,
    bulkBatchSize: 500,

    // Event-Based Pricing Limits
    maxMessages: 50_000, // 50K tracked events/month
    maxWorkflows: -1, // Unlimited workflows
    historyRetentionDays: 30, // 30-day retention

    // Overage: must upgrade (no overage on Starter)
    overagePriceCentsPerK: null,

    // Feature Access
    features: {
      batch: true, // Send to all contacts
      topics: true, // Subscription management
      segments: true, // Property-based targeting
      campaigns: true, // Scheduled broadcasts
      automations: true, // Unlimited automations
      events: true, // Custom event tracking
      advancedSegments: false, // Behavioral segments (Scale+)
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
      "50,000 tracked events/month",
      "Unlimited workflows",
      "Topics & segments",
      "Broadcasts & campaigns",
      "50 AI generations",
      "30-day history",
    ],
    cta: "Subscribe",
  },

  growth: {
    name: "Growth",
    price: 79,
    earlyAdopterPrice: 79,
    annualPrice: 67, // ~$799/yr
    annualEarlyAdopterPrice: 67,
    annualTotal: 799, // Total billed annually
    period: "/month",
    description: "For growing startups",
    dashboardAccess: true,

    // Resource Limits
    maxContacts: -1, // Unlimited contacts
    maxTeamMembers: -1, // Unlimited
    maxAwsAccounts: 3,
    aiMessages: 250,
    bulkBatchSize: 2000,

    // Event-Based Pricing Limits
    maxMessages: 250_000, // 250K tracked events/month
    maxWorkflows: -1, // Unlimited workflows
    historyRetentionDays: 90, // 90-day retention

    // Overage: $0.50/1K tracked events
    overagePriceCentsPerK: 50,

    // Feature Access
    features: {
      batch: true,
      topics: true, // Subscription management
      segments: true, // Property-based targeting
      campaigns: true, // Scheduled, targeted sends
      automations: true, // Unlimited automations
      events: true, // Custom event tracking
      advancedSegments: false, // Behavioral segments (Scale+)
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
      "250,000 tracked events/month",
      "Everything in Starter",
      "250 AI generations",
      "3 AWS accounts",
      "90-day history",
      "$0.50/1K tracked events overage",
    ],
    cta: "Subscribe",
  },

  scale: {
    name: "Scale",
    price: 199,
    earlyAdopterPrice: 199,
    annualPrice: 167, // ~$1,999/yr
    annualEarlyAdopterPrice: 167,
    annualTotal: 1999, // Total billed annually
    period: "/month",
    description: "For scaling companies",
    dashboardAccess: true,

    // Resource Limits
    maxContacts: -1, // Unlimited contacts
    maxTeamMembers: -1, // Unlimited
    maxAwsAccounts: -1, // Unlimited
    aiMessages: 1000,
    bulkBatchSize: 10_000,

    // Event-Based Pricing Limits
    maxMessages: 1_000_000, // 1M tracked events/month
    maxWorkflows: -1, // Unlimited workflows
    historyRetentionDays: 365, // 1-year retention

    // Overage: $0.15/1K tracked events
    overagePriceCentsPerK: 15,

    // Feature Access
    features: {
      batch: true,
      topics: true,
      segments: true,
      campaigns: true,
      automations: true,
      events: true, // Behavioral tracking
      advancedSegments: true, // Behavioral segments
      customRetention: false,
      prioritySLA: true, // Priority support SLA
    },

    // Rate Limits
    rateLimits: {
      dailyRequests: 500_000,
      minuteRequests: 5000,
    },

    // Display
    featureList: [
      "1,000,000 tracked events/month",
      "Everything in Growth",
      "Behavioral segments",
      "1,000 AI generations",
      "Unlimited AWS accounts",
      "1-year history",
      "$0.15/1K tracked events overage",
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
    { id: "free", plan: PLANS.free },
    { id: "starter", plan: PLANS.starter },
    { id: "growth", plan: PLANS.growth },
    { id: "scale", plan: PLANS.scale },
  ];
}

/**
 * Get paid plans only (excludes free tier)
 */
export function getPaidPlans(): { id: PlanId; plan: PlanConfig }[] {
  return [
    { id: "starter", plan: PLANS.starter },
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

/**
 * Get the current display price (early adopter or regular)
 */
export function getDisplayPrice(plan: PlanConfig): number {
  if (EARLY_ADOPTER_ACTIVE && plan.earlyAdopterPrice) {
    return plan.earlyAdopterPrice;
  }
  return plan.price;
}

/**
 * Check if a plan has early adopter pricing active
 */
export function hasEarlyAdopterPricing(plan: PlanConfig): boolean {
  return EARLY_ADOPTER_ACTIVE && plan.earlyAdopterPrice !== undefined;
}

/**
 * Get the annual price for display (early adopter or regular)
 */
export function getAnnualDisplayPrice(plan: PlanConfig): number | null {
  if (EARLY_ADOPTER_ACTIVE && plan.annualEarlyAdopterPrice) {
    return plan.annualEarlyAdopterPrice;
  }
  return plan.annualPrice ?? null;
}

/**
 * Get the annual total (amount billed annually)
 */
export function getAnnualTotal(plan: PlanConfig): number | null {
  return plan.annualTotal ?? null;
}

/**
 * Get the price based on billing interval
 */
export function getPriceByInterval(
  plan: PlanConfig,
  interval: BillingInterval
): number {
  if (interval === "annual") {
    const annualPrice = getAnnualDisplayPrice(plan);
    if (annualPrice) {
      return annualPrice;
    }
  }
  return getDisplayPrice(plan);
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
  return plan?.maxContacts ?? -1; // Default to unlimited (all plans have unlimited contacts)
}

/**
 * Check if an organization can add more contacts based on their plan
 */
export function canAddContact(
  planId: PlanId | string,
  currentCount: number
): boolean {
  const limit = getContactLimit(planId);
  if (limit === -1) {
    return true; // Unlimited
  }
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
  if (!plan) {
    return "You've reached your contact limit.";
  }

  const limit = plan.maxContacts;
  if (limit === -1) {
    return ""; // No limit message needed
  }

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
  if (limit === -1) {
    return true; // Unlimited
  }
  return currentCount < limit;
}

/**
 * Get AWS account limit message for display
 */
export function getAwsAccountLimitMessage(planId: PlanId | string): string {
  const plan = PLANS[planId as PlanId];
  if (!plan) {
    return "You've reached your AWS account limit.";
  }

  const limit = plan.maxAwsAccounts;
  if (limit === -1) {
    return ""; // No limit message needed
  }

  if (limit === 1) {
    return `Your ${plan.name} plan includes 1 AWS account. Upgrade to Growth for up to 3 accounts.`;
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
  const planOrder: PlanId[] = ["free", "starter", "growth", "scale"];

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

// ═══════════════════════════════════════════════════════════════════════════
// TRACKED EVENT LIMITS (Platform Fee Model)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get the monthly tracked event limit for a plan
 * Returns -1 for unlimited
 */
export function getMessageLimit(planId: PlanId | string): number {
  const plan = PLANS[planId as PlanId];
  return plan?.maxMessages ?? 5000; // Default to Free limit
}

/**
 * Alias for getMessageLimit - events and messages are the same thing
 */
export const getEventLimit = getMessageLimit;

/**
 * Get overage pricing for a plan (cents per 1K tracked events)
 * Returns null if plan doesn't support overage (must upgrade)
 */
export function getOveragePriceCentsPerK(
  planId: PlanId | string
): number | null {
  const plan = PLANS[planId as PlanId];
  return plan?.overagePriceCentsPerK ?? null;
}

/**
 * Check if a plan supports overage billing
 */
export function hasOverageBilling(planId: PlanId | string): boolean {
  return getOveragePriceCentsPerK(planId) !== null;
}

/**
 * Calculate overage cost for a given number of tracked events over the limit
 */
export function calculateOverageCost(
  planId: PlanId | string,
  eventsOverLimit: number
): number {
  const centsPerK = getOveragePriceCentsPerK(planId);
  if (centsPerK === null || eventsOverLimit <= 0) {
    return 0;
  }
  // Round up to nearest 1K
  const thousandsOver = Math.ceil(eventsOverLimit / 1000);
  return (thousandsOver * centsPerK) / 100; // Convert cents to dollars
}

/**
 * Get the workflow limit for a plan
 * Returns -1 for unlimited
 */
export function getWorkflowLimit(planId: PlanId | string): number {
  const plan = PLANS[planId as PlanId];
  return plan?.maxWorkflows ?? 1; // Default to Free limit
}

/**
 * Get the history retention period in days for a plan
 */
export function getHistoryRetentionDays(planId: PlanId | string): number {
  const plan = PLANS[planId as PlanId];
  return plan?.historyRetentionDays ?? 7; // Default to Free retention
}

/**
 * Get the team member limit for a plan
 * Returns -1 for unlimited
 */
export function getTeamMemberLimit(planId: PlanId | string): number {
  const plan = PLANS[planId as PlanId];
  return plan?.maxTeamMembers ?? 1; // Default to Free limit
}

/**
 * Check if an organization can send more messages based on their plan
 * Plans with overage billing can always send (they'll be charged)
 * Plans without overage have a 25% grace period before hard block
 */
export function canSendMessage(
  planId: PlanId | string,
  currentCount: number
): boolean {
  const limit = getMessageLimit(planId);
  if (limit === -1) {
    return true; // Unlimited
  }
  // Plans with overage billing can always send
  if (hasOverageBilling(planId)) {
    return true;
  }
  // Plans without overage: allow up to 125% of limit (25% grace period) before hard block
  return currentCount < limit * 1.25;
}

/**
 * Get message usage threshold status based on current usage
 */
export function getMessageUsageThreshold(
  planId: PlanId | string,
  currentCount: number
): "normal" | "warning" | "critical" | "exceeded" {
  const limit = getMessageLimit(planId);
  if (limit === -1) {
    return "normal"; // Unlimited
  }

  const percentUsed = (currentCount / limit) * 100;

  if (percentUsed >= 125) {
    return "exceeded"; // 125%+ - hard block
  }
  if (percentUsed >= 100) {
    return "critical"; // 100-125% - banner + email
  }
  if (percentUsed >= 80) {
    return "warning"; // 80-100% - dashboard warning
  }
  return "normal";
}

/**
 * Get tracked event limit message for display
 */
export function getMessageLimitMessage(
  planId: PlanId | string,
  currentCount: number
): string {
  const plan = PLANS[planId as PlanId];
  if (!plan) {
    return "You've reached your tracked event limit.";
  }

  const limit = plan.maxMessages;
  if (limit === -1) {
    return ""; // No limit message needed
  }

  const threshold = getMessageUsageThreshold(planId, currentCount);
  const remaining = Math.max(0, limit - currentCount);
  const percentUsed = Math.round((currentCount / limit) * 100);
  const hasOverage = hasOverageBilling(planId);
  const overagePrice = getOveragePriceCentsPerK(planId);

  switch (threshold) {
    case "exceeded":
      if (hasOverage) {
        const overEvents = currentCount - limit;
        const overageCost = calculateOverageCost(planId, overEvents);
        return `Using overage: ${overEvents.toLocaleString()} tracked events over limit (~$${overageCost.toFixed(2)} this period).`;
      }
      return `Tracked event limit exceeded (${percentUsed}% used). Upgrade to continue.`;
    case "critical":
      if (hasOverage) {
        return `Included tracked events used. Additional events billed at $${((overagePrice ?? 0) / 100).toFixed(2)}/1K.`;
      }
      return `You've reached your monthly tracked event limit of ${limit.toLocaleString()}. Resets on the 1st.`;
    case "warning":
      return `${remaining.toLocaleString()} tracked events remaining (${100 - percentUsed}% left). Resets on the 1st.`;
    default:
      return "";
  }
}

/**
 * Check if an organization can add more workflows based on their plan
 */
export function canAddWorkflow(
  planId: PlanId | string,
  currentCount: number
): boolean {
  const limit = getWorkflowLimit(planId);
  if (limit === -1) {
    return true; // Unlimited
  }
  return currentCount < limit;
}

/**
 * Get workflow limit message for display
 */
export function getWorkflowLimitMessage(planId: PlanId | string): string {
  const plan = PLANS[planId as PlanId];
  if (!plan) {
    return "You've reached your workflow limit.";
  }

  const limit = plan.maxWorkflows;
  if (limit === -1) {
    return ""; // No limit message needed
  }

  if (limit === 1) {
    return `Your ${plan.name} plan includes ${limit} workflow. Upgrade to Starter for unlimited workflows.`;
  }

  return `Your ${plan.name} plan includes up to ${limit} workflows. Upgrade for unlimited.`;
}

/**
 * Check if an organization can add more team members based on their plan
 */
export function canAddTeamMember(
  planId: PlanId | string,
  currentCount: number
): boolean {
  const limit = getTeamMemberLimit(planId);
  if (limit === -1) {
    return true; // Unlimited
  }
  return currentCount < limit;
}

/**
 * Get team member limit message for display
 */
export function getTeamMemberLimitMessage(planId: PlanId | string): string {
  const plan = PLANS[planId as PlanId];
  if (!plan) {
    return "You've reached your team member limit.";
  }

  const limit = plan.maxTeamMembers;
  if (limit === -1) {
    return ""; // No limit message needed
  }

  return `Your ${plan.name} plan includes ${limit} team member${limit === 1 ? "" : "s"}. Upgrade to Starter for unlimited team members.`;
}

// ═══════════════════════════════════════════════════════════════════════════
// LEGACY FUNCTIONS (kept for backward compatibility)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @deprecated Use historyRetentionDays instead.
 */
export function getEventRetentionDays(planId: PlanId | string): number {
  return getHistoryRetentionDays(planId);
}

/**
 * Check if an organization can ingest more events based on their plan
 * Plans with overage billing can always ingest
 */
export function canIngestEvent(
  planId: PlanId | string,
  currentCount: number
): boolean {
  return canSendMessage(planId, currentCount);
}

/**
 * Get event usage threshold (alias for message threshold)
 */
export function getEventUsageThreshold(
  planId: PlanId | string,
  currentCount: number
): "normal" | "warning" | "critical" | "exceeded" {
  return getMessageUsageThreshold(planId, currentCount);
}
