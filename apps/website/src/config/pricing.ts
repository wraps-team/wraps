/**
 * Wraps Pricing Configuration
 * Single source of truth for all pricing data across the website.
 *
 * Last updated: January 2026
 * Pricing model: flat monthly platform fee per tier (governance, history,
 * AWS accounts) — we charge for tooling, users pay AWS for sending
 */

// =============================================================================
// TYPES
// =============================================================================

/**
 * The purchasable tiers, in ladder order. The single runtime source — the
 * calculator, the public estimate endpoint, the MCP server and the WebMCP tool
 * schema each used to keep their own copy, and the WebMCP one was still
 * advertising the pre-2026-08 ladder to agents long after those tiers stopped
 * being sold.
 */
export const PUBLIC_TIER_IDS = ["free", "pro", "business"] as const;

export type TierId = (typeof PUBLIC_TIER_IDS)[number];

/**
 * Tier names from the pre-2026-08 ladder. They are never displayed and never
 * purchasable — they exist so that agents holding a cached copy of
 * `pricing.md` (which advertised them until this change) keep getting a
 * 200 from /api/pricing/estimate instead of a 400.
 */
export const LEGACY_TIER_ALIASES = {
  starter: "pro",
  growth: "business",
  scale: "business",
} as const satisfies Record<string, TierId>;

export type LegacyTierId = keyof typeof LEGACY_TIER_ALIASES;

export function resolveTierId(id: string): TierId | null {
  if (Object.hasOwn(LEGACY_TIER_ALIASES, id)) {
    return LEGACY_TIER_ALIASES[id as LegacyTierId];
  }
  return PUBLIC_TIER_IDS.find((t) => t === id) ?? null;
}

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
  contacts: "unlimited";
  domains: "unlimited";
  templates: "unlimited";
  workflows: number | "unlimited";
  workflowsDisplay: string;
  aiGenerations: number;
  customEvents: number | "unlimited";
  customEventsDisplay: string;
  awsAccounts: number | "unlimited";
  awsAccountsDisplay: string;
  historyDays: number;
  historyDisplay: string;
  teamMembers: number | "unlimited";
  teamMembersDisplay: string;
  support: string;
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

/** Bump when any number in this file changes — surfaced in generated pricing.md */
export const PRICING_LAST_UPDATED = "July 2026";

export const ANNUAL_DISCOUNT = 0.16; // 16% off (save ~2 months)

export const AWS_PRICING = {
  sesPerThousand: 0.1,
  sesPerEmail: 0.0001,
  dedicatedIpMonthly: 24.95,
} as const;

// =============================================================================
// TIER LIMITS
// =============================================================================

export const TIER_LIMITS: Record<TierId, TierLimits> = {
  free: {
    contacts: "unlimited",
    domains: "unlimited",
    templates: "unlimited",
    workflows: 2,
    workflowsDisplay: "2",
    aiGenerations: 10,
    customEvents: 5000,
    customEventsDisplay: "5,000/mo",
    awsAccounts: 1,
    awsAccountsDisplay: "1",
    historyDays: 30,
    historyDisplay: "30 days",
    teamMembers: "unlimited",
    teamMembersDisplay: "Unlimited",
    support: "Community",
  },
  pro: {
    contacts: "unlimited",
    domains: "unlimited",
    templates: "unlimited",
    workflows: "unlimited",
    workflowsDisplay: "Unlimited",
    aiGenerations: 250,
    customEvents: "unlimited",
    customEventsDisplay: "Unlimited",
    awsAccounts: 1,
    awsAccountsDisplay: "1",
    historyDays: 90,
    historyDisplay: "90 days",
    teamMembers: "unlimited",
    teamMembersDisplay: "Unlimited",
    support: "Email",
  },
  business: {
    contacts: "unlimited",
    domains: "unlimited",
    templates: "unlimited",
    workflows: "unlimited",
    workflowsDisplay: "Unlimited",
    aiGenerations: 1000,
    customEvents: "unlimited",
    customEventsDisplay: "Unlimited",
    awsAccounts: "unlimited",
    awsAccountsDisplay: "Unlimited",
    historyDays: 365,
    historyDisplay: "1 year",
    teamMembers: "unlimited",
    teamMembersDisplay: "Unlimited",
    support: "Priority",
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
    description: "Try the platform with your AWS account",
    highlight: false,
    cta: "Get Started",
    ctaLink: "https://app.wraps.dev/auth?mode=signup&plan=free",
    limits: TIER_LIMITS.free,
    features: [
      "Unlimited sends, domains & contacts",
      "Unlimited team members",
      "5,000 custom events/mo",
      "1 AWS account",
      "2 workflows",
      "30-day history",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: 29,
    annualPrice: 299,
    period: "/mo",
    description: "For indie hackers and side projects",
    highlight: true,
    cta: "Subscribe",
    ctaLink: "https://app.wraps.dev/auth?mode=signup&plan=pro",
    limits: TIER_LIMITS.pro,
    features: [
      // "1 AWS account" is deliberately absent: Pro gets the same single
      // account Free does, so listing it read as a Pro benefit when it is not
      // one. A second account is what Business sells.
      "Everything in Free",
      "Unlimited workflows",
      "Unlimited custom events",
      "Topics, segments, batch & campaigns",
      "250 AI generations/mo",
      "90-day history",
    ],
  },
  {
    id: "business",
    name: "Business",
    price: 199,
    annualPrice: 1999,
    period: "/mo",
    description: "For scaling companies",
    highlight: false,
    cta: "Subscribe",
    ctaLink: "https://app.wraps.dev/auth?mode=signup&plan=business",
    limits: TIER_LIMITS.business,
    features: [
      "Everything in Pro",
      "Unlimited AWS accounts",
      "1,000 AI generations/mo",
      "1-year history",
      "SSO + SCIM, audit log + CSV export",
      "Priority support",
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
    overageRate: "$3/1K (email)",
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
// HOMEPAGE COMPARE TABLE
// =============================================================================
// Email-sending providers vs. Wraps + SES. Prices are the cheapest realistic
// plan at 100,000 emails/month, verified July 2026 against live pricing pages:
//   Wraps + SES : 100K × $0.0001 = $10 (AWS SES cost, no platform markup)
//   Resend      : Pro tops out at $35/mo for 100K
//   SendGrid    : Pro is $89.95/mo for 100K (Essentials caps at 50K for $19.95)
//   Postmark    : Platform is ~$18 + $108 overage = ~$126/mo at 100K
// Keep these truthful — re-verify if >6 months old.

export type CompareCellValue = string | boolean;

export type CompareRow = {
  label: string;
  wraps: CompareCellValue;
  wrapsNote?: string;
  resend: CompareCellValue;
  sendgrid: CompareCellValue;
  postmark: CompareCellValue;
};

export const HOMEPAGE_COMPARE_COLUMNS = [
  "Wraps + SES",
  "Resend",
  "SendGrid",
  "Postmark",
] as const;

export const HOMEPAGE_COMPARE: CompareRow[] = [
  {
    label: "100k emails / month",
    wraps: "$10",
    wrapsNote: "SES",
    resend: "$35",
    sendgrid: "$89.95",
    postmark: "$126",
  },
  {
    label: "Your data, your AWS",
    wraps: true,
    resend: false,
    sendgrid: false,
    postmark: false,
  },
  {
    label: "Open source",
    wraps: "AGPL-3.0",
    resend: false,
    sendgrid: false,
    postmark: false,
  },
  {
    label: "Typed SDK + templates",
    wraps: true,
    resend: true,
    sendgrid: false,
    postmark: false,
  },
  {
    label: "Templates-as-code in PRs",
    wraps: true,
    resend: true,
    sendgrid: false,
    postmark: false,
  },
  {
    label: "Workflows-as-code",
    wraps: true,
    wrapsNote: "TypeScript, Git-versioned",
    resend: "Visual builder",
    sendgrid: "Visual builder",
    postmark: false,
  },
];

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

  // Platform cost
  let platformCost = tier.price;
  if (interval === "annual" && tier.annualPrice) {
    platformCost = tier.annualPrice / 12;
  }

  // Overage: gone — the Wraps fee is flat per tier.
  const overageCost = 0;

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
  pro: string | boolean;
  business: string | boolean;
};

export const FEATURE_COMPARISON: FeatureComparison[] = [
  {
    name: "Dashboard history",
    free: "30 days",
    pro: "90 days",
    business: "1 year",
  },
  {
    name: "Contacts",
    free: "Unlimited",
    pro: "Unlimited",
    business: "Unlimited",
  },
  {
    name: "Domains",
    free: "Unlimited",
    pro: "Unlimited",
    business: "Unlimited",
  },
  {
    name: "Templates",
    free: "Unlimited",
    pro: "Unlimited",
    business: "Unlimited",
  },
  {
    name: "Workflows",
    free: "2",
    pro: "Unlimited",
    business: "Unlimited",
  },
  {
    name: "AI generations",
    free: "10/mo",
    pro: "250/mo",
    business: "1,000/mo",
  },
  {
    name: "AWS accounts",
    free: "1",
    pro: "1",
    business: "Unlimited",
  },
  {
    name: "Team members",
    free: "Unlimited",
    pro: "Unlimited",
    business: "Unlimited",
  },
  {
    name: "Batch sending",
    free: false,
    pro: true,
    business: true,
  },
  {
    name: "Topics & preferences",
    free: false,
    pro: true,
    business: true,
  },
  {
    name: "Segments & targeting",
    free: false,
    pro: true,
    business: true,
  },
  {
    name: "Campaigns",
    free: false,
    pro: true,
    business: true,
  },
  {
    name: "Cross-channel cascades",
    free: false,
    pro: true,
    business: true,
  },
  {
    name: "Custom events",
    free: "5,000/mo",
    pro: "Unlimited",
    business: "Unlimited",
  },
  {
    name: "Behavioral segments",
    free: false,
    pro: false,
    business: true,
  },
  {
    name: "SSO + SCIM",
    free: false,
    pro: false,
    business: true,
  },
  {
    // Absent from this table entirely while the feature was Pro+, which is how
    // it stayed unadvertised on the tier that had it. Now that it is a Business
    // differentiator it needs a row, or the pricing page still never mentions
    // the audit log outside one bullet on the Business card.
    name: "Audit log",
    free: false,
    pro: false,
    business: true,
  },
  {
    // Separate row rather than folding "+ export" into the one above: viewer
    // and export are two PlanFeature flags (auditLog, auditLogExport), and the
    // comparison-row guardrail binds one row to one flag.
    name: "Audit log export",
    free: false,
    pro: false,
    business: true,
  },
  {
    name: "Support",
    free: "Community",
    pro: "Email",
    business: "Priority",
  },
];

// =============================================================================
// COPY/MARKETING STRINGS
// =============================================================================

export const PRICING_COPY = {
  headline: "You pay for the platform. AWS handles the sending.",
  subheadline:
    "Free to start, no credit card. Sending costs go straight to AWS — $0.10/1K on à la carte, or $0.16/1K on the new default Essentials plan.",
  awsNote:
    "AWS costs are separate. À la carte is $0.10 per 1,000 emails; AWS now defaults new accounts to Essentials at $0.16. Wraps detects which plan you're on and tells you how to move back. The infrastructure lives in your account, so you can leave anytime and keep everything.",
  enterpriseNote:
    "Need custom limits or on-prem deployment? Contact us for Enterprise.",
  foundingMemberTitle: "Founding Member Program — First 50 Customers",
  foundingMemberPerks: [
    "Direct Slack access to the founder",
    "Input on roadmap priorities",
    "Your logo on our website",
    "Locked-in pricing for life",
  ],
  freeHeroHeadline: "Start Free. Deploy in 2 Minutes.",
  freeHeroSubline:
    "No credit card. No time limit. Your AWS account, your data.",
  paidTiersHeadline: "Outgrowing the free tier?",
  paidTiersSubline:
    "Event tracking, segments, broadcasts, unlimited workflows, and team access — starting at $29/mo.",
} as const;
