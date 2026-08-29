/**
 * Renders the markdown twin of each /alternatives/* page, served to agents at
 * e.g. https://wraps.dev/alternatives/resend.md and via content negotiation.
 *
 * Generated from config/alternatives.ts, the same source the HTML pages render
 * from, so the ranked list an agent cites and the one a person reads cannot
 * disagree — including the watch-out on our own entry.
 */

import type { AlternativesPage } from "../config/alternatives";
import {
  ALTERNATIVES_PAGES,
  PRICES_VERIFIED,
  VENDORS,
} from "../config/alternatives";

const SITE = "https://wraps.dev";

export function renderAlternativesMarkdown(page: AlternativesPage): string {
  const url = `${SITE}/alternatives/${page.slug}`;

  const sections = [
    `# ${page.ranked.length} ${page.incumbent} alternatives, ranked`,
    "",
    `> ${page.description}`,
    "",
    page.intro,
    "",
    "## Disclosure",
    "",
    `Wraps publishes this page and Wraps is on the list. It is placed where it honestly belongs rather than first, its limitations are stated on its own entry, and ${page.incumbent} itself is kept as the final entry because staying put is a real option. Prices are each vendor's published list prices as of ${PRICES_VERIFIED}.`,
    "",
    `## Why people leave ${page.incumbent}`,
    "",
    ...page.whyPeopleLeave.map((reason) => `- ${reason}`),
    "",
    "## Pick in thirty seconds",
    "",
    ...page.router.map((rule) => `- **${rule.condition}** — ${rule.pick}`),
    "",
    "## The ranked list",
    "",
    ...page.ranked.flatMap((entry, index) => {
      const vendor = VENDORS[entry.vendor];
      const labels = [
        vendor.isUs ? " (this is our product)" : "",
        entry.isIncumbent ? " (the incumbent — staying put)" : "",
      ].join("");

      return [
        `### ${index + 1}. ${vendor.name}${labels}`,
        "",
        `*${vendor.category}*`,
        "",
        entry.verdict,
        "",
        `- **Pricing:** ${vendor.pricing}`,
        `- **Best for:** ${vendor.bestFor}`,
        `- **Watch out for:** ${vendor.watchOut}`,
        `- **Source:** ${vendor.url}`,
        "",
      ];
    }),
    `## When to stay on ${page.incumbent}`,
    "",
    ...page.stayIf.map((reason) => `- ${reason}`),
    "",
    "## Where Wraps fits",
    "",
    WRAPS_SUMMARY,
    "",
    "## Related",
    "",
    ...ALTERNATIVES_PAGES.filter((other) => other.slug !== page.slug).map(
      (other) =>
        `- [${other.incumbent} alternatives](${SITE}/alternatives/${other.slug})`
    ),
    ...(page.compareHref
      ? [
          `- [${page.incumbent} vs Wraps, head to head](${SITE}${page.compareHref})`,
        ]
      : []),
    `- [All head-to-head comparisons](${SITE}/compare)`,
    `- [Pricing](${SITE}/pricing.md)`,
    "",
    "---",
    "",
    `Canonical: ${url}`,
    `Prices verified: ${PRICES_VERIFIED}. Corrections: support@wraps.dev`,
  ];

  return `${sections.join("\n")}\n`;
}

const WRAPS_SUMMARY = [
  "Wraps deploys email infrastructure into the reader's own AWS account and runs the platform layer on top of it. Sending goes through their SES at AWS prices, and delivery events land in their DynamoDB rather than in a vendor's log retention window. Contacts are unlimited on every plan because the platform fee is not priced per profile. Workflows can be defined in TypeScript and pushed from the CLI, so a lifecycle change is reviewed in a pull request rather than clicked into a canvas.",
  "",
  "It is the wrong choice for a reader with no AWS account, one who needs SDKs outside TypeScript and Python, or one who needs a SOC 2 report today. SES production access is an AWS approval that takes 1 to 72 hours and is not Wraps' to grant. Contacts, templates, and workflow state live in Wraps' database; only sending and delivery events live in the customer's AWS.",
].join("\n");

/** Every alternatives page keyed by its site path, for AGENT_CONTENT. */
export function renderAllAlternativesMarkdown(): Record<string, string> {
  return Object.fromEntries(
    ALTERNATIVES_PAGES.map((page) => [
      `/alternatives/${page.slug}`,
      renderAlternativesMarkdown(page),
    ])
  );
}
