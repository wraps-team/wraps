/**
 * Wraps Pricing Configuration
 * Single source of truth for all pricing data across the website.
 *
 * Last updated: January 2026
 * Pricing model: Event-based Platform Fee — we charge for tooling, users pay AWS for sending
 */

// =============================================================================
// TYPES
// =============================================================================

export type TierId = "free" | "starter" | "growth" | "scale";
export type BillingInterval = "monthly" | "annual";

export type PricingTier = {
  id: TierId;
  name: string;
  price: number;
  annualPrice: number | null;
  period: string;
  description: string;
  highlight: boolean;
  cta: string;
  ctaLink: string;
  features: string[];
  limits: TierLimits;
};

export type TierLimits = {
  messages: number | "unlimited";
  messagesDisplay: string;
  contacts: "unlimited";
  workflows: number | "unlimited";
  workflowsDisplay: string;
  aiGenerations: number;
  awsAccounts: number | "unlimited";
  awsAccountsDisplay: string;
  teamMembers: number | "unlimited";
  teamMembersDisplay: string;
  support: string;
};

export type OverageRate = {
  tierId: TierId;
  perThousand: number;
  display: string;
};

export type Competitor = {
  name: string;
  freeMessages: string;
  entryPrice: string;
  overageRate: string;
  infrastructure: string;
};

// =============================================================================
// PRICING CONSTANTS
// =============================================================================

export const ANNUAL_DISCOUNT = 0.16; // 16% off (save ~2 months)

export const AWS_PRICING = {
  sesPerThousand: 0.1,
  sesPerEmail: 0.0001,
  dedicatedIpMonthly: 24.95,
} as const;

// =============================================================================
// OVERAGE RATES
// =============================================================================

export const OVERAGE_RATES: Record<TierId, OverageRate> = {
  free: {
    tierId: "free",
    perThousand: 0,
    display: "Upgrade required",
  },
  starter: {
    tierId: "starter",
    perThousand: 0,
    display: "Upgrade required",
  },
  growth: {
    tierId: "growth",
    perThousand: 0.5,
    display: "$0.50/1K tracked events",
  },
  scale: {
    tierId: "scale",
    perThousand: 0.15,
    display: "$0.15/1K tracked events",
  },
};

// =============================================================================
// TIER LIMITS
// =============================================================================

export const TIER_LIMITS: Record<TierId, TierLimits> = {
  free: {
    messages: 5000,
    messagesDisplay: "5,000/mo",
    contacts: "unlimited",
    workflows: 1,
    workflowsDisplay: "1",
    aiGenerations: 10,
    awsAccounts: 1,
    awsAccountsDisplay: "1",
    teamMembers: 1,
    teamMembersDisplay: "1",
    support: "Community",
  },
  starter: {
    messages: 50_000,
    messagesDisplay: "50,000/mo",
    contacts: "unlimited",
    workflows: "unlimited",
    workflowsDisplay: "Unlimited",
    aiGenerations: 50,
    awsAccounts: 1,
    awsAccountsDisplay: "1",
    teamMembers: "unlimited",
    teamMembersDisplay: "Unlimited",
    support: "Email",
  },
  growth: {
    messages: 250_000,
    messagesDisplay: "250,000/mo",
    contacts: "unlimited",
    workflows: "unlimited",
    workflowsDisplay: "Unlimited",
    aiGenerations: 250,
    awsAccounts: 3,
    awsAccountsDisplay: "3",
    teamMembers: "unlimited",
    teamMembersDisplay: "Unlimited",
    support: "Priority (24hr)",
  },
  scale: {
    messages: 1_000_000,
    messagesDisplay: "1,000,000/mo",
    contacts: "unlimited",
    workflows: "unlimited",
    workflowsDisplay: "Unlimited",
    aiGenerations: 1000,
    awsAccounts: "unlimited",
    awsAccountsDisplay: "Unlimited",
    teamMembers: "unlimited",
    teamMembersDisplay: "Unlimited",
    support: "Priority + SLA",
  },
};

// =============================================================================
// PRICING TIERS
// =============================================================================

export const PRICING_TIERS: PricingTier[] = [
  {
    id: "free",
    name: "Free",
    price: 0,
    annualPrice: null,
    period: "/mo",
    description: "Get started — no credit card required",
    highlight: false,
    cta: "Get Started",
    ctaLink: "https://app.wraps.dev/auth?mode=signup&plan=free",
    limits: TIER_LIMITS.free,
    features: [
      "Dashboard + AI template editor",
      "5K tracked events/mo",
      "1 workflow",
      "Unlimited contacts",
      "CLI + TypeScript SDK",
      "10 AI template generations/mo",
    ],
  },
  {
    id: "starter",
    name: "Starter",
    price: 19,
    annualPrice: 199,
    period: "/mo",
    description: "For developers shipping their first integration",
    highlight: false,
    cta: "Subscribe",
    ctaLink: "https://app.wraps.dev/auth?mode=signup&plan=starter",
    limits: TIER_LIMITS.starter,
    features: [
      "50K tracked events/mo",
      "Unlimited workflows",
      "React templates + AI editor",
      "Topics, segments & broadcasts",
      "Unlimited team members",
      "Email support",
    ],
  },
  {
    id: "growth",
    name: "Growth",
    price: 79,
    annualPrice: 799,
    period: "/mo",
    description: "For teams where developers and marketers ship together",
    highlight: true,
    cta: "Subscribe",
    ctaLink: "https://app.wraps.dev/auth?mode=signup&plan=growth",
    limits: TIER_LIMITS.growth,
    features: [
      "250K tracked events/mo",
      "Then $0.50/1K tracked events",
      "Everything in Starter, plus:",
      "AI workflow generation",
      "3 AWS accounts",
      "Priority support (24hr)",
    ],
  },
  {
    id: "scale",
    name: "Scale",
    price: 199,
    annualPrice: 1999,
    period: "/mo",
    description: "For high-volume teams with multiple AWS accounts",
    highlight: false,
    cta: "Subscribe",
    ctaLink: "https://app.wraps.dev/auth?mode=signup&plan=scale",
    limits: TIER_LIMITS.scale,
    features: [
      "1M tracked events/mo",
      "Then $0.15/1K tracked events",
      "Everything in Growth, plus:",
      "Behavioral segments",
      "1K AI generations/mo",
      "Unlimited AWS accounts",
      "Priority support + SLA",
    ],
  },
];

// =============================================================================
// COMPETITIVE COMPARISON
// =============================================================================

export const COMPETITORS: Competitor[] = [
  {
    name: "Knock",
    freeMessages: "10K",
    entryPrice: "$250/mo",
    overageRate: "$5/1K",
    infrastructure: "Knock",
  },
  {
    name: "SuprSend",
    freeMessages: "10K",
    entryPrice: "$110/mo",
    overageRate: "$2-5/1K",
    infrastructure: "SuprSend",
  },
  {
    name: "PostHog",
    freeMessages: "10K",
    entryPrice: "Usage-based",
    overageRate: "~$5/1K",
    infrastructure: "PostHog",
  },
  {
    name: "Customer.io",
    freeMessages: "—",
    entryPrice: "$100/mo",
    overageRate: "Contact-based",
    infrastructure: "Customer.io",
  },
];

export const WRAPS_COMPETITIVE = {
  freeMessages: "5K",
  entryPrice: "$19/mo",
  overageRate: "$0.15-0.50/1K",
  infrastructure: "Your AWS",
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get tier by ID
 */
export function getTier(id: TierId): PricingTier {
  const tier = PRICING_TIERS.find((t) => t.id === id);
  if (!tier) {
    throw new Error(`Unknown tier: ${id}`);
  }
  return tier;
}

/**
 * Get display price based on billing interval
 */
export function getDisplayPrice(
  tier: PricingTier,
  interval: BillingInterval
): number {
  if (tier.annualPrice && interval === "annual") {
    return Math.round(tier.annualPrice / 12);
  }
  return tier.price;
}

/**
 * Get CTA link with billing interval
 */
export function getCtaLink(
  tier: PricingTier,
  interval: BillingInterval
): string {
  if (!tier.ctaLink.startsWith("https://app.wraps.dev")) {
    return tier.ctaLink;
  }
  const annual = interval === "annual" ? "&annual=true" : "";
  return `${tier.ctaLink}${annual}`;
}

/**
 * Calculate total cost for a given message volume
 */
export function calculateTotalCost(
  tierId: TierId,
  messagesPerMonth: number,
  interval: BillingInterval = "monthly"
): {
  platformCost: number;
  overageCost: number;
  awsCost: number;
  totalCost: number;
} {
  const tier = getTier(tierId);
  const limits = tier.limits;
  const overage = OVERAGE_RATES[tierId];

  // Platform cost
  let platformCost = tier.price;
  if (interval === "annual" && tier.annualPrice) {
    platformCost = tier.annualPrice / 12;
  }

  // Overage cost
  const includedMessages =
    typeof limits.messages === "number"
      ? limits.messages
      : Number.POSITIVE_INFINITY;
  const overageMessages = Math.max(0, messagesPerMonth - includedMessages);
  const overageCost = (overageMessages / 1000) * overage.perThousand;

  // AWS cost (SES only)
  const awsCost = messagesPerMonth * AWS_PRICING.sesPerEmail;

  return {
    platformCost: Math.round(platformCost * 100) / 100,
    overageCost: Math.round(overageCost * 100) / 100,
    awsCost: Math.round(awsCost * 100) / 100,
    totalCost: Math.round((platformCost + overageCost + awsCost) * 100) / 100,
  };
}

/**
 * Format currency
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format number with commas
 */
export function formatNumber(num: number): string {
  return new Intl.NumberFormat("en-US").format(num);
}

// =============================================================================
// FEATURE COMPARISON (for upgrade section)
// =============================================================================

export type FeatureComparison = {
  name: string;
  free: string | boolean;
  starter: string | boolean;
  growth: string | boolean;
  scale: string | boolean;
};

export const FEATURE_COMPARISON: FeatureComparison[] = [
  {
    name: "Tracked events/month",
    free: "5K",
    starter: "50K",
    growth: "250K",
    scale: "1M",
  },
  {
    name: "Overage rate",
    free: "Upgrade",
    starter: "Upgrade",
    growth: "$0.50/1K",
    scale: "$0.15/1K",
  },
  {
    name: "Contacts",
    free: "Unlimited",
    starter: "Unlimited",
    growth: "Unlimited",
    scale: "Unlimited",
  },
  {
    name: "Workflows",
    free: "1",
    starter: "Unlimited",
    growth: "Unlimited",
    scale: "Unlimited",
  },
  {
    name: "AI generations",
    free: "10/mo",
    starter: "50/mo",
    growth: "250/mo",
    scale: "1,000/mo",
  },
  {
    name: "AWS accounts",
    free: "1",
    starter: "1",
    growth: "3",
    scale: "Unlimited",
  },
  {
    name: "Team members",
    free: "1",
    starter: "Unlimited",
    growth: "Unlimited",
    scale: "Unlimited",
  },
  {
    name: "Batch sending",
    free: false,
    starter: true,
    growth: true,
    scale: true,
  },
  {
    name: "Topics & preferences",
    free: false,
    starter: true,
    growth: true,
    scale: true,
  },
  {
    name: "Segments & targeting",
    free: false,
    starter: true,
    growth: true,
    scale: true,
  },
  {
    name: "Campaigns",
    free: false,
    starter: true,
    growth: true,
    scale: true,
  },
  {
    name: "Cross-channel cascades",
    free: false,
    starter: true,
    growth: true,
    scale: true,
  },
  {
    name: "Event tracking",
    free: false,
    starter: true,
    growth: true,
    scale: true,
  },
  {
    name: "Behavioral segments",
    free: false,
    starter: false,
    growth: false,
    scale: true,
  },
  {
    name: "Support",
    free: "Community",
    starter: "Email",
    growth: "Priority (24hr)",
    scale: "Priority + SLA",
  },
];

// =============================================================================
// COPY/MARKETING STRINGS
// =============================================================================

export const PRICING_COPY = {
  headline: "Platform pricing. AWS sending costs. No surprises.",
  subheadline:
    "Start free. Scale when you're ready. You pay us for the platform. You pay AWS directly for sending — $0.10/1K emails.",
  awsNote:
    "AWS costs are separate. You pay AWS directly for sending at $0.10 per 1,000 emails. Your sending infrastructure stays in your account — leave anytime, keep everything.",
  enterpriseNote:
    "Need custom limits or on-prem deployment? Contact us for Enterprise.",
  foundingMemberTitle: "Founding Member Program — First 50 Customers",
  foundingMemberPerks: [
    "Direct Slack access to the founder",
    "Input on roadmap priorities",
    "Your logo on our website",
    "Locked-in pricing for life",
  ],
  freeHeroHeadline: "Start Free. Deploy in 60 Seconds.",
  freeHeroSubline:
    "No credit card. No time limit. Your AWS account, your data.",
  trackedEventsHeadline: "Powered by Tracked Events",
  trackedEventsSubline:
    "One event triggers the workflows you wrote. Builds the segments your marketers target. Drives the automations that run on your AWS.",
  paidTiersHeadline: "Outgrowing the free tier?",
  paidTiersSubline:
    "Event tracking, segments, broadcasts, unlimited workflows, and team access — starting at $19/mo.",
} as const;
