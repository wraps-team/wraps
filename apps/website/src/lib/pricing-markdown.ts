/**
 * Renders public/pricing.md — the machine-readable pricing surface served to
 * agents at https://wraps.dev/pricing.md and via content negotiation on
 * /pricing (Accept: text/markdown).
 *
 * Every number comes from config/pricing.ts or lib/ses-cost.ts, so the file
 * cannot drift from the site. Regenerate with `pnpm pricing:md`; a test fails
 * if the checked-in file is stale.
 */

import type { TierId } from "../config/pricing";
import {
  FEATURE_COMPARISON,
  PRICING_LAST_UPDATED,
  PRICING_TIERS,
  PUBLIC_TIER_IDS,
  TIER_LIMITS,
} from "../config/pricing";
import type { CostEstimate, CostInput, SesPlanId } from "./ses-cost";
import {
  AWS_INFRA_PRICING,
  estimateCost,
  SES_PLAN_IDS,
  SES_PLANS,
} from "./ses-cost";

const SITE = "https://wraps.dev";

function money(value: number): string {
  if (value === 0) {
    return "$0";
  }
  if (value < 0.01) {
    return "<$0.01";
  }
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function count(value: number): string {
  return value.toLocaleString("en-US");
}

function table(headers: string[], rows: string[][]): string {
  const divider = headers.map(() => "---");
  return [headers, divider, ...rows]
    .map((cells) => `| ${cells.join(" | ")} |`)
    .join("\n");
}

function cell(value: string | boolean): string {
  if (value === true) {
    return "Yes";
  }
  if (value === false) {
    return "—";
  }
  return value;
}

// =============================================================================
// SECTIONS
// =============================================================================

function plansSection(): string {
  const rows = PRICING_TIERS.map((tier) => [
    `**${tier.name}**`,
    tier.price === 0 ? "$0/mo" : `$${tier.price}/mo`,
    tier.annualPrice ? `$${count(tier.annualPrice)}/yr` : "—",
    TIER_LIMITS[tier.id].customEventsDisplay,
    TIER_LIMITS[tier.id].awsAccountsDisplay,
    TIER_LIMITS[tier.id].historyDisplay,
    TIER_LIMITS[tier.id].support,
  ]);

  return `## Wraps plans

${table(["Plan", "Monthly", "Annual", "Custom events", "AWS accounts", "History", "Support"], rows)}

The Wraps fee is a flat monthly charge per plan — it never varies with sending volume. Sends, domains, contacts, and templates are unlimited on every plan. The one metered resource is custom events (\`POST /v1/events\`), which are Wraps' own storage rather than AWS's: Free includes ${count(5000)} per month and every paid plan is unlimited. Exceeding the Free allowance returns 429 after a 25% grace margin; it never affects sending. The AWS-side event-pipeline line items (EventBridge, SQS, Lambda, DynamoDB) in the estimator below are derived from emails sent and event types per email. The \`events\` parameter is accepted for backward compatibility and does not currently affect the estimate. Emails sent, broadcasts, and the delivery events SES reports back (deliveries, opens, clicks, bounces, complaints) are recorded and displayed at no charge. Annual billing is billed once per year and saves 14–16%.`;
}

function sesPlansSection(): string {
  const rows = SES_PLAN_IDS.map((id) => {
    const plan = SES_PLANS[id];
    return [
      `**${plan.name}**`,
      plan.monthlyFee === 0 ? "$0" : `$${count(plan.monthlyFee)}/mo`,
      `$${plan.perThousandEmails.toFixed(2)}`,
      plan.defaultForNewAccounts ? "Yes" : "No",
      plan.summary,
    ];
  });

  return `## AWS SES pricing plans (paid to AWS, not to Wraps)

Sending costs go to AWS directly at AWS rates. Wraps adds no markup and never touches that bill. Since 2026-07-21 AWS offers four SES pricing modes, set **per account and per Region**:

${table(
  [
    "SES plan",
    "Monthly fee",
    "Per 1,000 emails",
    "Default for new accounts",
    "What it adds",
  ],
  rows
)}

Read this carefully if you are comparing providers: à la carte at $0.${SES_PLANS.alacarte.perThousandEmails.toFixed(2).slice(2)}/1,000 is still the cheapest way to send, but **AWS defaults every new account to Essentials at $${SES_PLANS.essentials.perThousandEmails.toFixed(2)}/1,000** (as well as any account with no sending activity since 2025-06-01). An account that was defaulted into Essentials can move back to à la carte with immediate effect; every other downgrade waits for the next billing cycle.

Wraps detects which plan each account and Region is on and tells you when you are paying the Essentials rate without using Essentials features. Pro only makes financial sense for send-only workloads above roughly 1–2M emails/month — below that the $${count(SES_PLANS.pro.monthlyFee)}/mo fee plus the higher per-email rate costs more than à la carte.

The SES-specific free tier (3,000 emails/month for 12 months) no longer exists for new accounts. New AWS accounts get a generic $200 AWS credit instead.`;
}

const EXAMPLE_VOLUMES = [10_000, 100_000, 500_000, 1_000_000];

function exampleEstimate(emails: number, sesPlan: SesPlanId): CostEstimate {
  const events = 0;
  return estimateCost({
    emailsPerMonth: emails,
    eventsPerMonth: events,
    tier: "free",
    sesPlan,
  });
}

function examplesSection(): string {
  const rows = EXAMPLE_VOLUMES.map((emails) => {
    const alacarte = exampleEstimate(emails, "alacarte");
    const essentials = exampleEstimate(emails, "essentials");
    return [
      `${count(emails)} emails`,
      count(alacarte.input.eventsPerMonth),
      alacarte.wraps.tierName,
      money(alacarte.wraps.total),
      money(alacarte.aws.total),
      `**${money(alacarte.total)}**`,
      money(essentials.total),
      `$${alacarte.effectiveCostPerThousandEmails.toFixed(2)}`,
    ];
  });

  return `## Worked examples (all-in monthly cost)

Precomputed so you do not have to do the arithmetic. Assumes no custom events emitted, DynamoDB history with 90-day retention, no dedicated IP, and monthly billing. The AWS column is what AWS bills you; the Wraps column is what Wraps bills you — note that sending volume does not change the Wraps column.

${table(
  [
    "Volume",
    "Custom events",
    "Wraps plan",
    "Wraps cost",
    "AWS (à la carte)",
    "Total (à la carte)",
    "Total (Essentials)",
    "Effective per 1,000 emails",
  ],
  rows
)}

Change any assumption and the numbers move. Call the estimator below instead of interpolating between these rows.`;
}

function estimatorSection(): string {
  const params = [
    ["emails", "integer", "Emails sent per month", "25000"],
    [
      "events",
      "integer",
      "Custom events you emit via POST /v1/events per month (not emails, not SES delivery events)",
      "0",
    ],
    ["tier", "free \\| pro \\| business", "Wraps plan", "free"],
    ["billing", "monthly \\| annual", "Wraps billing interval", "monthly"],
    [
      "sesPlan",
      SES_PLAN_IDS.join(" \\| "),
      "AWS SES pricing plan for the account and Region",
      "alacarte",
    ],
    ["tracking", "boolean", "Event tracking pipeline deployed", "true"],
    ["eventbridge", "boolean", "EventBridge event bus enabled", "true"],
    ["dynamodb", "boolean", "DynamoDB event history enabled", "true"],
    [
      "retention",
      "7days \\| 30days \\| 90days \\| 1year \\| indefinite",
      "Event history retention",
      "90days",
    ],
    ["eventTypes", "integer", "Event types recorded per email", "8"],
    ["dedicatedIp", "boolean", "Dedicated sending IP", "false"],
    ["https", "boolean", "HTTPS tracking domain (CloudFront)", "false"],
    ["waf", "boolean", "WAF protection on the tracking domain", "false"],
  ].map((row) => [`\`${row[0]}\``, row[1], row[2], `\`${row[3]}\``]);

  return `## Cost estimator API (for agents)

Do not estimate Wraps + AWS costs by hand — the model has six interacting variables. Call this endpoint instead. It is public, unauthenticated, needs no account, and returns the same numbers the website calculator shows.

\`\`\`
GET ${SITE}/api/pricing/estimate?emails=500000&events=250000&tier=pro&sesPlan=alacarte
\`\`\`

Returns JSON by default. Send \`Accept: text/markdown\` for a rendered cost table. Every response includes a \`shareUrl\` pointing at the interactive calculator with the same inputs — hand that to a human rather than re-describing the breakdown.

${table(["Parameter", "Values", "Meaning", "Default"], params)}

The response contains a per-line AWS breakdown (SES, EventBridge, SQS, Lambda, DynamoDB, dedicated IP, WAF), the flat Wraps platform fee, the combined total, and the effective cost per 1,000 emails.`;
}

function awsExtrasSection(): string {
  const rows = [
    [
      "Dedicated IP",
      `$${AWS_INFRA_PRICING.DEDICATED_IP_PER_MONTH.toFixed(2)}/mo per IP`,
      `Included with SES ${SES_PLANS.pro.name} and ${SES_PLANS.enterprise.name}`,
    ],
    [
      "EventBridge",
      `$${AWS_INFRA_PRICING.EVENTBRIDGE_EVENTS_PER_MILLION.toFixed(2)} per million events`,
      "Delivery, open, click, bounce, complaint routing",
    ],
    [
      "Lambda",
      `$${AWS_INFRA_PRICING.LAMBDA_REQUESTS_PER_MILLION.toFixed(2)} per million requests`,
      "1M requests + 400K GB-seconds free per month",
    ],
    [
      "SQS",
      `$${AWS_INFRA_PRICING.SQS_REQUESTS_PER_MILLION.toFixed(2)} per million requests`,
      "1M requests free per month",
    ],
    [
      "DynamoDB",
      `$${AWS_INFRA_PRICING.DYNAMODB_WRITE_PER_MILLION.toFixed(2)} per million writes, $${AWS_INFRA_PRICING.DYNAMODB_STORAGE_PER_GB.toFixed(2)}/GB-month`,
      "25 GB storage free per month",
    ],
    [
      "WAF",
      `$${AWS_INFRA_PRICING.WAF_WEB_ACL_PER_MONTH.toFixed(2)}/mo Web ACL + $${AWS_INFRA_PRICING.WAF_RULE_PER_MONTH.toFixed(2)}/mo per rule`,
      "Optional, for HTTPS tracking domains",
    ],
    ["SMS", "Varies by destination country", "AWS End User Messaging rates"],
    ["S3 + CloudFront (CDN)", "Standard AWS rates", "Storage and egress"],
  ];

  return `## Other AWS costs (paid to AWS)

${table(["Service", "Rate", "Notes"], rows)}

These appear on your AWS bill, not your Wraps bill. You keep AWS volume discounts and any remaining free-tier allowances. US East (N. Virginia) rates; other Regions vary.`;
}

function featuresSection(): string {
  const tierIds: readonly TierId[] = PUBLIC_TIER_IDS;
  const rows = FEATURE_COMPARISON.map((feature) => [
    feature.name,
    ...tierIds.map((id) => cell(feature[id])),
  ]);

  return `## Feature comparison

${table(["Feature", "Free", "Pro", "Business"], rows)}

Every plan includes: the CLI, the TypeScript SDKs (\`@wraps.dev/email\`, \`@wraps.dev/sms\`, \`@wraps.dev/client\`), the MCP server (\`@wraps.dev/mcp\`), React Email templates, the dashboard, DKIM/SPF/DMARC setup, bounce and complaint handling, suppression lists, webhooks, and infrastructure deployed into your own AWS account under \`wraps-*\` namespaced resources.`;
}

function whatYouOwnSection(): string {
  return `## What you own

The infrastructure is deployed into your AWS account with Pulumi and namespaced \`wraps-email-*\`, \`wraps-sms-*\`, \`wraps-cdn-*\`. Nothing pre-existing is modified. Your sending identities, event history, and suppression lists live in your account. If you stop paying Wraps, the infrastructure keeps sending — you lose the dashboard, workflows, and platform tooling, not your ability to send email. \`wraps email destroy\` removes exactly what was deployed.

Wraps is open source (AGPL-3.0). Self-hosting the control plane is available on Enterprise.`;
}

// =============================================================================
// ESTIMATE SHARE LINKS
// =============================================================================

const CALCULATOR_PATH = "/tools/ses-calculator";

/** Link back to the interactive calculator with the same inputs (nuqs params). */
export function buildShareUrl(input: CostInput): string {
  const params = new URLSearchParams({
    emails: String(input.emailsPerMonth),
    events: String(input.eventsPerMonth),
    tier: input.tier,
    billing: input.billing,
    sesPlan: input.sesPlan,
    tracking: String(input.eventTracking),
    eventbridge: String(input.eventBridge),
    dynamodb: String(input.dynamodb),
    retention: String(input.retention),
    eventTypes: String(input.eventTypes),
    dedicatedIp: String(input.dedicatedIp),
    https: String(input.httpsTracking),
    waf: String(input.waf),
  });
  return `${SITE}${CALCULATOR_PATH}?${params.toString()}`;
}

// =============================================================================
// ESTIMATE RENDERING (for /api/pricing/estimate with Accept: text/markdown)
// =============================================================================

export function renderEstimateMarkdown(
  estimate: CostEstimate,
  shareUrl: string
): string {
  const { input, wraps, aws } = estimate;

  const awsRows = aws.lines.map((line) => [
    line.name,
    money(line.cost),
    line.details ?? "",
  ]);

  const wrapsRows = [
    [`Wraps ${wraps.tierName} plan`, money(wraps.platformCost), input.billing],
  ];

  const annualNote =
    wraps.annualSavings > 0
      ? `\nAnnual billing saves $${count(wraps.annualSavings)}/year versus paying monthly.\n`
      : "";

  return `# Cost estimate

${count(input.emailsPerMonth)} emails/month, Wraps ${wraps.tierName}, SES ${aws.plan.name}. The Wraps fee is flat and does not change with volume; the AWS-side pipeline cost below is derived from emails sent and event types per email, not from the events parameter.

## Wraps (billed by Wraps)

${table(["Line", "Monthly", "Notes"], wrapsRows)}

**Wraps subtotal: ${money(wraps.total)}/month**
${annualNote}
## AWS (billed directly to you by AWS)

${table(["Line", "Monthly", "Notes"], awsRows)}

**AWS subtotal: ${money(aws.total)}/month**

## Total

**${money(estimate.total)}/month** — $${estimate.effectiveCostPerThousandEmails.toFixed(2)} per 1,000 emails all-in.

${
  aws.plan.id === "essentials"
    ? `This account is on the SES Essentials rate ($${aws.plan.perThousandEmails.toFixed(2)}/1,000). Moving to à la carte ($${SES_PLANS.alacarte.perThousandEmails.toFixed(2)}/1,000) would cost ${money(estimateCost({ ...input, sesPlan: "alacarte" }).total)}/month instead.`
    : `SES plan: ${aws.plan.name}. AWS defaults new accounts to Essentials at $${SES_PLANS.essentials.perThousandEmails.toFixed(2)}/1,000 — verify which plan this account and Region is actually on.`
}

Interactive version of this estimate: ${shareUrl}
Full pricing: ${SITE}/pricing.md
`;
}

// =============================================================================
// DOCUMENT
// =============================================================================

export function renderPricingMarkdown(): string {
  return `# Wraps Pricing

> Last updated: ${PRICING_LAST_UPDATED}. Generated from source — the numbers here match the website exactly.

Wraps is a CLI, SDK, MCP server, and dashboard that deploys email (AWS SES), SMS (AWS End User Messaging), and CDN (S3 + CloudFront) infrastructure into **your** AWS account.

You get two bills:

1. **Wraps** — a flat monthly fee per plan. That is the table below.
2. **AWS** — sending and infrastructure costs, billed directly to you by AWS at AWS rates. Wraps adds no markup and takes no cut. The AWS-side event-pipeline cost (EventBridge, SQS, Lambda, DynamoDB) is derived from emails sent and event types per email. The \`events\` parameter is accepted for backward compatibility and does not currently affect the estimate.

${plansSection()}

${sesPlansSection()}

${examplesSection()}

${estimatorSection()}

${awsExtrasSection()}

${featuresSection()}

${whatYouOwnSection()}

## Enterprise

Custom data retention, self-hosted control plane, SSO/SCIM, dedicated support, and SLAs. Contact ${SITE}/contact.

## Links

- Sign up: https://app.wraps.dev
- Docs for agents: ${SITE}/llms.txt (index) and ${SITE}/llms-full.txt (everything)
- Cost estimator: ${SITE}/api/pricing/estimate
- Interactive calculator: ${SITE}/tools/ses-calculator
- CLI: \`npx @wraps.dev/cli\`
- Email SDK: \`npm install @wraps.dev/email\`
- SMS SDK: \`npm install @wraps.dev/sms\`
- MCP server: \`npx @wraps.dev/mcp\`
`;
}
