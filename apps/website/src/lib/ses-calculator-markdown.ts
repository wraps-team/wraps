/**
 * Markdown twin of /tools/ses-calculator, served to agents at
 * https://wraps.dev/tools/ses-calculator.md and via content negotiation.
 *
 * The page answers "what does Amazon SES cost", so this answers that, not
 * "what does Wraps cost" (that is pricing.md). Every rate comes from
 * lib/ses-cost.ts, the module the page renders its plan table and worked costs
 * from, so the two cannot disagree.
 */

import {
  AWS_INFRA_PRICING,
  SES_EXAMPLE_VOLUMES,
  SES_PLAN_IDS,
  SES_PLAN_INCLUDES,
  SES_PLANS,
  SES_PRICING_COPY,
  SES_VOLUME_BANDS,
  type SesPlan,
  sesSendingCost,
} from "./ses-cost";

const SITE = "https://wraps.dev";

function rate(perThousand: number): string {
  return `$${perThousand.toFixed(2)}`;
}

function usd(amount: number): string {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function table(headers: string[], rows: string[][]): string {
  return [headers, headers.map(() => "---"), ...rows]
    .map((cells) => `| ${cells.join(" | ")} |`)
    .join("\n");
}

/** The plan's rate in a band; flat plans (à la carte) charge one rate in every band. */
function bandRate(plan: SesPlan, band: number): number {
  const { tiers } = plan;
  return (tiers[band] ?? tiers.at(-1) ?? tiers[0]).perThousandEmails;
}

function plansSection(): string {
  const rows = SES_PLAN_IDS.map((id) => {
    const plan = SES_PLANS[id];
    return [
      `**${plan.name}**`,
      plan.monthlyFee === 0
        ? "$0"
        : `$${plan.monthlyFee.toLocaleString("en-US")}/mo`,
      ...SES_VOLUME_BANDS.map((_, band) => rate(bandRate(plan, band))),
      plan.defaultForNewAccounts ? "Yes" : "No",
      SES_PLAN_INCLUDES[id],
    ];
  });

  return `## The four SES pricing plans

AWS sets the plan **per account and per Region**. Rates are per 1,000 emails sent, priced in marginal bands (an account on Essentials sending 20M pays the first band's rate on the first 10M and the next band's rate on the rest).

${table(
  [
    "SES plan",
    "Monthly fee",
    ...SES_VOLUME_BANDS.map((band) => `Per 1,000: ${band}`),
    "Default for new accounts",
    "What it adds",
  ],
  rows
)}`;
}

function costsSection(): string {
  const rows = SES_EXAMPLE_VOLUMES.map((emails) => [
    `${emails.toLocaleString("en-US")} emails`,
    ...SES_PLAN_IDS.map((id) => {
      const plan = SES_PLANS[id];
      return usd(plan.monthlyFee + sesSendingCost(plan, emails));
    }),
  ]);

  return `## What sending costs per month

SES plan fee plus sending fees only, computed from the rates above. It leaves out attachments, dedicated IPs, receiving mail, and the AWS services behind an event pipeline; the estimator below prices those.

${table(["Volume", ...SES_PLAN_IDS.map((id) => SES_PLANS[id].name)], rows)}

On sending fees alone à la carte is the cheapest plan at every volume in the table. Pro and Enterprise charge more per email plus a monthly fee, and buy features: inbox placement testing, managed dedicated IPs, email validations, and for Enterprise multi-Region and tenants.`;
}

function freeTierSection(): string {
  return `## Free tier

There is no free sending allowance on the current Amazon SES pricing page. New AWS customers get up to $200 in AWS Free Tier credits instead ($100 at sign-up and up to $100 more for trying services), and those credits can pay SES charges. The 3,000 free messages a month for 12 months that many guides quote is not on the pricing page. The Lambda, SQS and DynamoDB services behind an event pipeline have their own free tiers, which the estimator applies.`;
}

function otherChargesSection(): string {
  return `## Other charges to know about

- Standard dedicated IP: $${AWS_INFRA_PRICING.DEDICATED_IP_PER_MONTH.toFixed(2)} per IP per month on any plan. Managed dedicated IPs are included in ${SES_PLANS.pro.name} and ${SES_PLANS.enterprise.name}.
- Attachments, receiving mail, email validation and Global Endpoints are separate lines; the full list is on the page: ${SITE}/tools/ses-calculator`;
}

function estimateSection(): string {
  return `## How to estimate your cost

Do not interpolate between the rows above. The estimator is public, unauthenticated, and returns the same numbers the interactive calculator shows, including the AWS event-pipeline lines:

\`\`\`
GET ${SITE}/api/pricing/estimate?emails=500000&sesPlan=alacarte
\`\`\`

Send \`Accept: text/markdown\` for a rendered cost table. Parameters, defaults, and worked examples for the full Wraps + AWS total are in ${SITE}/pricing.md.`;
}

export function renderSesCalculatorMarkdown(): string {
  return `# Amazon SES Pricing Calculator

> ${SES_PRICING_COPY.rateShort}

This page answers what Amazon SES itself costs: the four plans, what sending a given volume costs, whether there is a free tier, and how to estimate it for your own volume. The interactive calculator is at ${SITE}/tools/ses-calculator.

${plansSection()}

${costsSection()}

${freeTierSection()}

${otherChargesSection()}

${estimateSection()}

## Wraps' own plans

Wraps charges a flat monthly platform fee on top of what you pay AWS directly for sending. Wraps plans, limits and worked all-in examples: ${SITE}/pricing.md
`;
}
