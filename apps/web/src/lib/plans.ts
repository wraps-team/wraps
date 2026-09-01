/**
 * Centralized plan configuration for Wraps Platform
 *
 * This file defines all pricing tiers and their features.
 * Used across the app for consistent plan information.
 *
 * PLATFORM FEE PHILOSOPHY:
 * Wraps is a platform fee for email infrastructure you own.
 * - You deploy to YOUR AWS account
 * - You pay AWS directly ($0.10/1K emails à la carte, or $0.16/1K on AWS's
 *   default Essentials plan)
 * - We provide the tools: dashboard, workflows, AI, analytics
 *
 * What we charge for (Platform value):
 * - Tracked events & history retention
 * - Visual workflow builder
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

/** Publicly purchasable plans. */
export type PublicPlanId = "free" | "pro" | "business";

/**
 * Plans that exist only for grandfathered subscriptions and already-issued
 * self-hosted licences. Never shown on the pricing page, never purchasable.
 * These names appear in live Stripe subscriptions and in signed licence
 * payloads — they can never be removed.
 */
export type LegacyPlanId = "starter" | "growth" | "scale";

export type PlanId = PublicPlanId | LegacyPlanId;

export type PlanFeature =
  | "batch" // Pro+: Send to all contacts
  | "topics" // Pro+: Subscription management
  | "segments" // Pro+: Property-based targeting
  | "campaigns" // Pro+: Scheduled, targeted sends
  | "workflows" // All tiers: Visual automation builder (2/unlimited by tier)
  | "events" // Pro+: Behavioral tracking
  | "advancedSegments" // Business+: Behavioral segments
  | "customRetention" // Enterprise+: Custom data retention
  | "prioritySLA" // Business+: Priority support SLA
  | "sso" // Business+: SSO + SCIM provisioning
  | "auditLog"; // Pro+: Audit log viewer

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
  legacy?: boolean;

  // Resource Limits
  maxContacts: number; // -1 = unlimited
  maxTeamMembers: number; // -1 = unlimited (unlimited on every tier — plans/208)
  maxAwsAccounts: number; // -1 = unlimited
  aiMessages: number;
  bulkBatchSize: number;

  // Event-Based Pricing Limits (Platform Fee model)
  maxCustomEvents: number; // Monthly custom-event allowance (-1 = unlimited)
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
    maxTeamMembers: -1, // Unlimited seats on every tier
    maxAwsAccounts: 1,
    aiMessages: 10,
    bulkBatchSize: 50,

    // Event-Based Pricing Limits
    maxCustomEvents: 5000, // 5K custom events/mo — the one metered lever
    maxWorkflows: 2, // 2 workflows
    historyRetentionDays: 30, // 30-day retention

    // Overage: must upgrade (no overage on Free)
    overagePriceCentsPerK: null,

    // Feature Access
    features: {
      batch: false, // Batch sending requires Pro+
      topics: false,
      segments: false,
      campaigns: false,
      workflows: true, // 2 workflow limit
      events: true, // Metered at 5K/mo on Free — see maxCustomEvents
      advancedSegments: false,
      customRetention: false,
      prioritySLA: false,
      sso: false,
      auditLog: false,
    },

    // Rate Limits
    rateLimits: {
      dailyRequests: -1,
      minuteRequests: 50,
    },

    // Display
    featureList: [
      "Unlimited sends, domains & contacts",
      "Unlimited team members",
      "5,000 custom events/mo",
      "1 AWS account",
      "2 workflows",
      "30-day history",
    ],
    cta: "Start Free",
  },

  pro: {
    name: "Pro",
    price: 29,
    annualPrice: 25, // ~$299/yr
    annualTotal: 299, // Total billed annually
    period: "/month",
    description: "For indie hackers and side projects",
    dashboardAccess: true,

    // Resource Limits
    maxContacts: -1, // Unlimited contacts
    maxTeamMembers: -1, // Unlimited
    maxAwsAccounts: 1,
    aiMessages: 250,
    bulkBatchSize: 2000,

    // Event-Based Pricing Limits
    maxCustomEvents: -1, // Unlimited custom events
    maxWorkflows: -1, // Unlimited workflows
    historyRetentionDays: 90, // 90-day retention

    // Overage: must upgrade (no overage on Pro)
    overagePriceCentsPerK: null,

    // Feature Access
    features: {
      batch: true, // Send to all contacts
      topics: true, // Subscription management
      segments: true, // Property-based targeting
      campaigns: true, // Scheduled broadcasts
      workflows: true, // Unlimited workflows
      events: true, // Custom event tracking
      advancedSegments: false, // Business only
      customRetention: false,
      prioritySLA: false,
      sso: false,
      auditLog: true,
    },

    // Rate Limits
    rateLimits: {
      dailyRequests: -1,
      minuteRequests: 2000,
    },

    // Display
    featureList: [
      // See the note in apps/website/src/config/pricing.ts — "1 AWS account"
      // is intentionally not listed here; Pro matches Free on that.
      "Everything in Free",
      "Unlimited workflows",
      "Unlimited custom events",
      "Topics, segments, batch & campaigns",
      "250 AI generations",
      "90-day history",
    ],
    cta: "Subscribe",
  },

  business: {
    name: "Business",
    price: 199,
    annualPrice: 167, // ~$1,999/yr
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
    maxCustomEvents: -1, // Unlimited custom events
    maxWorkflows: -1, // Unlimited workflows
    historyRetentionDays: 365, // 1-year retention

    // Overage: must upgrade (no overage on Business)
    overagePriceCentsPerK: null,

    // Feature Access
    features: {
      batch: true,
      topics: true,
      segments: true,
      campaigns: true,
      workflows: true,
      events: true, // Behavioral tracking
      advancedSegments: true, // Behavioral segments
      customRetention: false, // Enterprise only
      prioritySLA: true, // Priority support SLA
      sso: true, // SSO + SCIM provisioning
      auditLog: true,
    },

    // Rate Limits
    rateLimits: {
      dailyRequests: -1,
      minuteRequests: 5000,
    },

    // Display
    featureList: [
      "Everything in Pro",
      "Unlimited AWS accounts",
      "1,000 AI generations",
      "1-year history",
      "SSO + SCIM, audit export",
      "Priority support SLA",
    ],
    cta: "Subscribe",
  },

  // ─────────────────────────────────────────────────────────────────────
  // LEGACY PLANS — grandfathered, never purchasable. See plans/208.
  // Prices are frozen forever (PRICING_COPY.foundingMemberPerks promises
  // "Locked-in pricing for life"); limits and features match the new-tier
  // equivalent named in LEGACY_PLAN_SUCCESSOR.
  // ─────────────────────────────────────────────────────────────────────

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
    legacy: true,

    // Resource Limits — same as Pro, except maxAwsAccounts. Pro dropped to 1
    // when a second AWS account became a Business need; grandfathered Starter
    // subscribers keep the 3 they bought.
    maxContacts: -1, // Unlimited contacts
    maxTeamMembers: -1, // Unlimited
    maxAwsAccounts: 3, // Grandfathered — do not lower
    aiMessages: 250,
    bulkBatchSize: 2000,

    // Event-Based Pricing Limits
    maxCustomEvents: -1, // Unlimited custom events
    maxWorkflows: -1, // Unlimited workflows
    historyRetentionDays: 90, // 90-day retention

    // Overage: must upgrade (no overage on Starter)
    overagePriceCentsPerK: null,

    // Feature Access — same as Pro
    features: {
      batch: true, // Send to all contacts
      topics: true, // Subscription management
      segments: true, // Property-based targeting
      campaigns: true, // Scheduled broadcasts
      workflows: true, // Unlimited workflows
      events: true, // Custom event tracking
      advancedSegments: false, // Business only
      customRetention: false,
      prioritySLA: false,
      sso: false,
      auditLog: true,
    },

    // Rate Limits
    rateLimits: {
      dailyRequests: -1,
      minuteRequests: 2000,
    },

    // Display
    featureList: [
      "Unlimited sends, domains & contacts",
      "Unlimited workflows",
      "Topics, segments, batch & campaigns",
      "3 AWS accounts",
      "250 AI generations",
      "90-day history",
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
    legacy: true,

    // Resource Limits — same as Business
    maxContacts: -1, // Unlimited contacts
    maxTeamMembers: -1, // Unlimited
    maxAwsAccounts: -1, // Unlimited
    aiMessages: 1000,
    bulkBatchSize: 10_000,

    // Event-Based Pricing Limits
    maxCustomEvents: -1, // Unlimited custom events
    maxWorkflows: -1, // Unlimited workflows
    historyRetentionDays: 365, // 1-year retention

    // Overage: must upgrade (no overage on Growth)
    overagePriceCentsPerK: null,

    // Feature Access — same as Business
    features: {
      batch: true,
      topics: true, // Subscription management
      segments: true, // Property-based targeting
      campaigns: true, // Scheduled, targeted sends
      workflows: true, // Unlimited workflows
      events: true, // Custom event tracking
      advancedSegments: true, // Behavioral segments
      customRetention: false, // Enterprise only
      prioritySLA: true, // Priority support SLA
      sso: true, // SSO + SCIM provisioning
      auditLog: true,
    },

    // Rate Limits
    rateLimits: {
      dailyRequests: -1,
      minuteRequests: 5000,
    },

    // Display
    featureList: [
      "Everything in Pro",
      "Unlimited AWS accounts",
      "1,000 AI generations",
      "1-year history",
      "SSO + SCIM, audit export",
      "Priority support SLA",
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
    legacy: true,

    // Resource Limits — same as Business
    maxContacts: -1, // Unlimited contacts
    maxTeamMembers: -1, // Unlimited
    maxAwsAccounts: -1, // Unlimited
    aiMessages: 1000,
    bulkBatchSize: 10_000,

    // Event-Based Pricing Limits
    maxCustomEvents: -1, // Unlimited custom events
    maxWorkflows: -1, // Unlimited workflows
    historyRetentionDays: 365, // 1-year retention

    // Overage: must upgrade (no overage on Scale)
    overagePriceCentsPerK: null,

    // Feature Access — same as Business
    features: {
      batch: true,
      topics: true,
      segments: true,
      campaigns: true,
      workflows: true,
      events: true, // Behavioral tracking
      advancedSegments: true, // Behavioral segments
      customRetention: false, // Enterprise only
      prioritySLA: true, // Priority support SLA
      sso: true, // SSO + SCIM provisioning
      auditLog: true,
    },

    // Rate Limits
    rateLimits: {
      dailyRequests: -1,
      minuteRequests: 5000,
    },

    // Display
    featureList: [
      "Everything in Pro",
      "Unlimited AWS accounts",
      "1,000 AI generations",
      "1-year history",
      "SSO + SCIM, audit export",
      "Priority support SLA",
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

/** Purchasable plans, in ladder order. Legacy IDs are deliberately absent. */
export const PUBLIC_PLAN_IDS = ["free", "pro", "business"] as const;

/**
 * Which current plan each legacy plan is the equivalent of. Used to point a
 * grandfathered customer's UI at the right upgrade target without changing
 * what they are billed.
 */
export const LEGACY_PLAN_SUCCESSOR: Record<LegacyPlanId, PublicPlanId> = {
  starter: "pro",
  growth: "business",
  scale: "business",
};

export function isPlanId(id: string): id is PlanId {
  return Object.hasOwn(PLANS, id);
}

export function isPublicPlanId(id: string): id is PublicPlanId {
  return (PUBLIC_PLAN_IDS as readonly string[]).includes(id);
}

/** The purchasable plan a given plan maps to (identity for public plans). */
export function toPublicPlanId(id: PlanId): PublicPlanId {
  return isPublicPlanId(id) ? id : LEGACY_PLAN_SUCCESSOR[id];
}

/** Next plan up the purchasable ladder, or null if already at the top. */
export function getNextPlan(id: PlanId): PublicPlanId | null {
  const current = toPublicPlanId(id);
  const idx = PUBLIC_PLAN_IDS.indexOf(current);
  return PUBLIC_PLAN_IDS[idx + 1] ?? null;
}

export function isTopPlan(id: PlanId): boolean {
  return getNextPlan(id) === null;
}

/**
 * Get available plans for self-serve display
 */
export function getDisplayPlans(): { id: PublicPlanId; plan: PlanConfig }[] {
  return PUBLIC_PLAN_IDS.map((id) => ({ id, plan: PLANS[id] }));
}

/**
 * Get paid plans only (excludes free tier)
 */
export function getPaidPlans(): { id: PublicPlanId; plan: PlanConfig }[] {
  return PUBLIC_PLAN_IDS.filter((id) => PLANS[id].price > 0).map((id) => ({
    id,
    plan: PLANS[id],
  }));
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
    return `Your ${plan.name} plan includes 1 AWS account. Upgrade to ${PLANS.business.name} for unlimited accounts.`;
  }

  return `Your ${plan.name} plan includes up to ${limit} AWS accounts. Upgrade to ${PLANS.business.name} for unlimited accounts.`;
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
  const planOrder: readonly PlanId[] = PUBLIC_PLAN_IDS;

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
      dailyRequests: -1,
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
// CUSTOM EVENT LIMITS
// ═══════════════════════════════════════════════════════════════════════════
//
// These meter custom events emitted via POST /v1/events — Wraps' own storage
// and compute. They must never be wired to email sends: sending runs through
// the customer's own SES account and Wraps takes no cut of it, so metering it
// would contradict the pass-through promise. That is why nothing here is named
// "message" any more — the previous names (getMessageLimit, canSendMessage,
// getMessageUsageThreshold) read like a send meter and invited exactly that
// mistake. Email delivery counts live in message_usage_monthly and are
// analytics only; see lib/usage/message-usage.ts.

/**
 * Get the monthly custom-event allowance for a plan.
 * Returns -1 for unlimited.
 */
export function getEventLimit(planId: PlanId | string): number {
  const plan = PLANS[planId as PlanId];
  return plan?.maxCustomEvents ?? PLANS.free.maxCustomEvents;
}

/**
 * Get overage pricing for a plan (cents per 1K custom events).
 * Returns null if the plan has no overage billing — which is every plan
 * today. Kept because the billing surface still branches on it.
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
 * Calculate overage cost for a given number of events over the limit
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
 * The grace multiplier applied above a plan's custom-event allowance before
 * ingestion is hard-blocked. 5,000 included events keep flowing to 6,250, so a
 * Free org that trips the cap mid-month gets a warning and a header countdown
 * rather than a wall of 429s on its first overage.
 */
export const EVENT_GRACE_MULTIPLIER = 1.1;

/**
 * Check if an organization can ingest more custom events on its plan.
 * Plans with overage billing can always ingest (they'll be charged).
 */
export function canIngestEvent(
  planId: PlanId | string,
  currentCount: number
): boolean {
  const limit = getEventLimit(planId);
  if (limit === -1) {
    return true; // Unlimited
  }
  if (hasOverageBilling(planId)) {
    return true;
  }
  return currentCount < limit * EVENT_GRACE_MULTIPLIER;
}

/**
 * Get custom-event usage threshold status based on current usage
 */
export function getEventUsageThreshold(
  planId: PlanId | string,
  currentCount: number
): "normal" | "warning" | "critical" | "exceeded" {
  const limit = getEventLimit(planId);
  if (limit === -1) {
    return "normal"; // Unlimited
  }

  const percentUsed = (currentCount / limit) * 100;

  if (percentUsed >= EVENT_GRACE_MULTIPLIER * 100) {
    return "exceeded"; // 110%+ - hard block
  }
  if (percentUsed >= 100) {
    return "critical"; // 100-110% - banner + email
  }
  if (percentUsed >= 80) {
    return "warning"; // 80-100% - dashboard warning
  }
  return "normal";
}

/**
 * Get custom-event limit message for display
 */
export function getEventLimitMessage(
  planId: PlanId | string,
  currentCount: number
): string {
  const plan = PLANS[planId as PlanId];
  if (!plan) {
    return "You've reached your custom event limit.";
  }

  const limit = plan.maxCustomEvents;
  if (limit === -1) {
    return ""; // No limit message needed
  }

  const threshold = getEventUsageThreshold(planId, currentCount);
  const remaining = Math.max(0, limit - currentCount);
  const percentUsed = Math.round((currentCount / limit) * 100);
  const nextPlan = getNextPlan(planId as PlanId);
  const upgrade = nextPlan
    ? ` Upgrade to ${PLANS[nextPlan].name} for unlimited events.`
    : "";

  switch (threshold) {
    case "exceeded":
      return `Custom event limit exceeded (${percentUsed}% used).${upgrade}`;
    case "critical":
      return `You've reached your monthly custom event limit of ${limit.toLocaleString()}. Resets on the 1st.${upgrade}`;
    case "warning":
      return `${remaining.toLocaleString()} custom events remaining (${100 - percentUsed}% left). Resets on the 1st.`;
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
    return `Your ${plan.name} plan includes ${limit} workflow. Upgrade to ${PLANS.pro.name} for unlimited workflows.`;
  }

  return `Your ${plan.name} plan includes up to ${limit} workflows. Upgrade to ${PLANS.pro.name} for unlimited workflows.`;
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
