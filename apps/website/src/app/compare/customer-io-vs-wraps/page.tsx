import type { Metadata } from "next";
import Script from "next/script";
import { AlsoCompare } from "@/app/compare/components/also-compare";
import { CompareBreadcrumb } from "@/app/compare/components/breadcrumb";
import { CompareFeatures } from "@/app/compare/components/compare-features";
import { CompareGlance } from "@/app/compare/components/compare-glance";
import { ComparePricing } from "@/app/compare/components/compare-pricing";
import {
  CompareSection,
  CompareSectionHead,
} from "@/app/compare/components/compare-section";
import { CompareSourceNote } from "@/app/compare/components/compare-source-note";
import {
  CompareExports,
  CompareTimeline,
} from "@/app/compare/components/compare-timeline";
import { CompareVerdict } from "@/app/compare/components/compare-verdict";

import { pricingRows } from "@/app/compare/customer-io-vs-wraps/pricing-rows";
import { ClosingPanel } from "@/app/landing/components/closing-panel";
import { FlowBox } from "@/app/landing/components/flow-primitives";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { SectionKicker } from "@/app/landing/components/section-kicker";
import { JsonLd } from "@/components/json-ld";
import { LICENSE_STATEMENT } from "@/config/license";
import { getTier } from "@/config/pricing";
import { pageMetadata } from "@/lib/page-metadata";

const PAGE_DESCRIPTION =
  "Compare Customer.io and Wraps. Customer.io charges per contact and hosts everything. Wraps sets up the whole SES surface in your AWS account, then runs it day to day from one control plane, with unlimited contacts on every plan. All-in pricing at real volumes.";

export const metadata: Metadata = pageMetadata({
  title: "Customer.io vs Wraps: Contact Pricing vs Unlimited Contacts",
  description: PAGE_DESCRIPTION,
  path: "/compare/customer-io-vs-wraps",
  social: {
    title: "Customer.io vs Wraps",
    description:
      "Contact-based pricing vs unlimited contacts. A platform you rent vs Amazon SES in your own AWS account, set up in one command and operated from one control plane.",
  },
});

const breadcrumbJsonLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    {
      "@type": "ListItem",
      position: 1,
      name: "Home",
      item: "https://wraps.dev",
    },
    {
      "@type": "ListItem",
      position: 2,
      name: "Compare",
      item: "https://wraps.dev/compare",
    },
    {
      "@type": "ListItem",
      position: 3,
      name: "Customer.io vs Wraps",
      item: "https://wraps.dev/compare/customer-io-vs-wraps",
    },
  ],
};

const freeTier = getTier("free");
const proTier = getTier("pro");
const businessTier = getTier("business");

const glanceRows = [
  {
    label: "Setup",
    competitor: "Sign up, connect a domain, build in their UI.",
    wraps:
      "One command or the browser deploys the whole SES surface into your AWS account, non-destructively. You need an AWS account.",
  },
  {
    label: "Running it day to day",
    competitor:
      "They operate the sending platform. You operate campaigns inside it.",
    wraps:
      "One control plane: bounce and complaint rates swept hourly, suppression, deliverability audits, a per-message event log.",
  },
  {
    label: "Pricing model",
    competitor: "Per contact (profile). High-watermark billing.",
    wraps: "Flat monthly fee by plan. Unlimited contacts on every plan.",
  },
  {
    label: "Starting price",
    competitor: "$100/mo for 5,000 profiles",
    wraps: `${freeTier.name} ($${freeTier.price}/mo), plus Amazon at $0.10 per 1,000 emails on its à la carte plan ($0.16 on Essentials, the default for new accounts)`,
  },
  {
    label: "Infrastructure",
    competitor: "Managed SaaS (GCP). They host everything.",
    wraps: "SES, DynamoDB, Lambda, and EventBridge in your AWS account.",
  },
  {
    label: "Where the data sits",
    competitor: "Customer.io hosts your data. Bulk export requires Premium.",
    wraps:
      "Delivery events in your DynamoDB, retention you set. Contacts, templates, and workflow state in Wraps, exportable anytime.",
  },
  {
    label: "If you leave",
    competitor: "Workflows, templates, and data are proprietary.",
    wraps:
      "No Wraps lock-in: standard AWS SES underneath, and the sending infrastructure stays in your account.",
  },
  {
    label: "Dedicated IPs",
    competitor: "Premium only ($1,000/mo min).",
    wraps: "Your SES account (shared default, dedicated available).",
  },
];

const userQuotes = [
  {
    quote:
      "Every five years Customer.io almost doubles their prices with no grandfathering, regardless of whether it works for the business.",
    source: "Trustpilot reviewer, 10-year customer",
  },
  {
    quote:
      "There's nothing Customer.io does that competitors don't do cheaper... I was able to reduce costs by over 3x by moving out.",
    source: "Trustpilot reviewer",
  },
  {
    quote:
      "The pricing model doesn't make sense for growing companies... you pay for all the contacts in your account, regardless of if they're active or not.",
    source: "Encharge pricing analysis",
  },
];

const featureGroups = [
  {
    title: "Automation and campaigns",
    rows: [
      {
        name: "Visual workflow builder",
        competitor: { status: "yes" },
        wraps: { status: "yes" },
      },
      {
        name: "Workflow node types",
        competitor: {
          status: "yes",
          text: "Email, SMS, push, in-app, webhook, delay, condition",
        },
        wraps: {
          status: "yes",
          text: "Email, SMS, delay, condition, wait-for-event, update contact, topic mgmt",
        },
      },
      {
        name: "Event-driven workflows",
        competitor: { status: "yes" },
        wraps: { status: "yes" },
      },
      {
        name: "Broadcasts and scheduled campaigns",
        competitor: { status: "yes" },
        wraps: { status: "yes" },
      },
      {
        name: "Topics and hosted preference centre",
        competitor: { status: "yes" },
        wraps: { status: "yes" },
      },
      {
        name: "Segmentation",
        competitor: {
          status: "yes",
          text: "Behavioral segmentation with a built-in CDP",
        },
        wraps: {
          status: "yes",
          text: "Nested AND/OR filters on attributes, topics, and events (triggered, not triggered, within N days)",
        },
      },
      {
        name: "A/B testing",
        competitor: { status: "yes" },
        wraps: { status: "no" },
      },
      {
        name: "AI workflow generation",
        competitor: { status: "no" },
        wraps: { status: "yes" },
      },
      {
        name: "Template editing",
        competitor: { status: "yes", text: "Drag-and-drop editor" },
        wraps: { status: "yes", text: "AI designer plus a code editor" },
      },
    ],
  },
  {
    title: "Channels and sending",
    rows: [
      {
        name: "Transactional email",
        competitor: { status: "yes" },
        wraps: { status: "yes" },
      },
      {
        name: "Broadcast and marketing email",
        competitor: { status: "yes" },
        wraps: { status: "yes" },
      },
      {
        name: "SMS",
        competitor: {
          status: "partial",
          text: "Premium and above only, pricing not public",
        },
        wraps: { status: "yes" },
      },
      {
        name: "Push notifications",
        competitor: { status: "yes" },
        wraps: { status: "no" },
      },
      {
        name: "In-app messaging",
        competitor: { status: "yes" },
        wraps: { status: "no" },
      },
      {
        name: "Inbound email",
        competitor: { status: "na", text: "Not documented" },
        wraps: { status: "yes" },
      },
      {
        name: "Dedicated IPs",
        competitor: {
          status: "partial",
          text: "Premium and above only ($1K/mo minimum)",
        },
        wraps: { status: "yes", text: "Available through SES on every plan" },
      },
      {
        name: "Send rate ceiling",
        competitor: {
          status: "yes",
          text: "Their platform's published API rate limits",
        },
        wraps: {
          status: "yes",
          text: "Your own SES quota, raised by asking AWS",
        },
      },
    ],
  },
  {
    title: "Inbox health and operations",
    rows: [
      {
        name: "Who runs the sending",
        competitor: {
          status: "yes",
          text: "Customer.io, on their IP pools",
        },
        wraps: {
          status: "yes",
          text: "Amazon SES in your own account; dedicated IPs for full control of the reputation",
        },
      },
      {
        name: "Bounce and complaint rates against AWS's review and pause lines",
        competitor: { status: "na" },
        wraps: {
          status: "yes",
          text: "Swept hourly, owners and admins notified",
        },
      },
      {
        name: "CloudWatch alarms in your own AWS account",
        competitor: { status: "na" },
        wraps: {
          status: "yes",
          text: "Production and Enterprise presets, off for Starter. Bounce warns at 2%, complaint at 0.05%, well under AWS's lines. Email or webhook.",
        },
      },
      {
        name: "Suppression list you can browse and clear",
        competitor: { status: "yes", text: "Theirs, inside their platform" },
        wraps: {
          status: "yes",
          text: "Your SES account-level list, wired on at deploy",
        },
      },
      {
        name: "DKIM, SPF, DMARC, and blacklist audits",
        competitor: {
          status: "yes",
          text: "They manage deliverability for you",
        },
        wraps: { status: "yes", text: "On demand through the CLI" },
      },
      {
        name: "Per-message event log",
        competitor: { status: "yes" },
        wraps: { status: "yes" },
      },
    ],
  },
  {
    title: "Where it runs and your data",
    rows: [
      {
        name: "Unlimited contacts",
        competitor: { status: "no" },
        wraps: { status: "yes" },
      },
      {
        name: "Sending infrastructure in your cloud account",
        competitor: { status: "no" },
        wraps: { status: "yes" },
      },
      {
        name: "BYOC (bring your own cloud)",
        competitor: { status: "no" },
        wraps: { status: "yes" },
      },
      {
        name: "Sending keeps running if you cancel",
        competitor: {
          status: "no",
          text: "No, workflows, templates and data are proprietary",
        },
        wraps: {
          status: "yes",
          text: "Sending keeps running without Wraps; contacts and templates export",
        },
      },
      {
        name: "Data warehouse sync",
        competitor: { status: "partial", text: "Premium and above only" },
        wraps: {
          status: "yes",
          text: "Events in your DynamoDB, contacts exportable",
        },
      },
    ],
  },
  {
    title: "Integrations and ecosystem",
    rows: [
      {
        name: "Native integrations (100+)",
        competitor: { status: "yes" },
        wraps: { status: "no" },
      },
      {
        name: "Webhook support",
        competitor: { status: "yes" },
        wraps: { status: "yes" },
      },
    ],
  },
  {
    title: "What Wraps sets up and runs",
    children: (
      <div className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          Most teams rent a platform like Customer.io because they do not want
          to deal with SES. That is the part we made easy.
        </p>
        <div className="grid gap-x-6 gap-y-8 pt-3 md:grid-cols-2">
          <FlowBox className="min-w-0 pb-5" dashed label="We set everything up">
            <p className="mb-4 text-muted-foreground">
              One command deploys the whole SES surface into your AWS account:
              domain identities and DKIM, EventBridge, SQS with a dead letter
              queue, Lambda, DynamoDB, and the IAM roles that tie them together.
              Every resource is namespaced{" "}
              <code className="bg-muted px-1 py-0.5 font-mono text-xs">
                wraps-email-
              </code>
              , so it coexists with SES you already run and changes nothing you
              already have.
            </p>
            <p className="text-muted-foreground">
              Wraps reaches your account by assuming a role with an external ID,
              in one-hour sessions. No AWS access keys are stored anywhere.
            </p>
          </FlowBox>
          <FlowBox className="min-w-0 pb-5" label="The control plane runs it">
            <p className="mb-4 text-muted-foreground">
              Amazon can place an account under review once its bounce rate
              passes 5% and pause sending at 10%, and 0.1% and 0.5% for
              complaints. The AWS console will not draw your rates against those
              lines. Wraps does, swept hourly, with owners and admins notified
              when one is crossed.
            </p>
            <p className="text-muted-foreground">
              Same surface for the rest of the daily job: suppression you can
              browse and clear, DKIM, SPF, DMARC, and blacklist audits from the
              CLI, and a per-message event log. Bounces and complaints are
              suppressed on the way in, wired on at deploy.
            </p>
          </FlowBox>
        </div>
      </div>
    ),
  },
  {
    title: "How each one is run",
    children: (
      <div className="grid gap-x-6 gap-y-8 pt-3 text-sm md:grid-cols-2">
        <FlowBox className="min-w-0 pb-5" label="Customer.io">
          <p className="mb-4 text-muted-foreground">
            Your contacts, events, templates, and message history live on
            Customer.io&apos;s infrastructure (GCP). Emails send from their
            shared or dedicated IP pools. You access everything through their
            web UI and API.
          </p>
          <ul className="list-disc space-y-2 pl-4 text-muted-foreground">
            <li>Bulk data export requires Premium tier ($1,000/mo)</li>
            <li>No option to run it in your own cloud account (no BYOC)</li>
            <li>Workflows and templates cannot be exported</li>
          </ul>
        </FlowBox>
        <FlowBox className="min-w-0 pb-5" dashed label="Wraps">
          <p className="mb-4 text-muted-foreground">
            Wraps deploys SES, DynamoDB, Lambda, and EventBridge directly to
            your AWS account, so the sending infrastructure is in an account you
            hold. Wraps is the control plane; your AWS is the data plane.
          </p>
          <ul className="list-disc space-y-2 pl-4 text-muted-foreground marker:text-brand">
            <li>
              Sending and per-event delivery history stay in your AWS account,
              at a retention you set in your own deploy config
            </li>
            <li>
              Contacts, templates, broadcasts, workflow state, and a row per
              message live in Wraps&apos; Postgres, exportable anytime
            </li>
            <li>
              No Wraps lock-in: if you stop using Wraps, the infrastructure
              keeps running
            </li>
            <li>
              {LICENSE_STATEMENT}
            </li>
          </ul>
        </FlowBox>
      </div>
    ),
  },
  {
    title: "What Customer.io users say about pricing",
    children: (
      <div className="space-y-4 pt-3 text-sm">
        <p className="text-muted-foreground">
          The objection that comes up most is the pricing model, not the
          product. Feedback from Customer.io users on Trustpilot and independent
          reviews.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          {userQuotes.map((item) => (
            <figure className="min-w-0 border p-4" key={item.quote}>
              <blockquote className="mb-3 border-brand/30 border-l-2 pl-4 italic">
                &ldquo;{item.quote}&rdquo;
              </blockquote>
              <figcaption className="text-muted-foreground text-xs">
                &mdash; {item.source}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    ),
  },
  {
    title: "For developers",
    rows: [
      {
        name: "Code-first templates (React Email)",
        competitor: { status: "no" },
        wraps: { status: "yes" },
      },
      {
        name: "TypeScript SDK",
        competitor: { status: "partial", text: "JS with types bolted on" },
        wraps: { status: "yes", text: "TypeScript-first" },
      },
      {
        name: "Python SDK",
        competitor: { status: "yes" },
        wraps: { status: "yes" },
      },
      {
        name: "CLI tooling",
        competitor: { status: "no" },
        wraps: { status: "yes" },
      },
      {
        name: "Local development workflow",
        competitor: { status: "no" },
        wraps: { status: "yes" },
      },
      {
        name: "Workflows as code (CLI)",
        competitor: { status: "no" },
        wraps: { status: "yes", text: "TypeScript DSL, Git-versioned" },
      },
      {
        name: "MCP server for coding agents",
        competitor: { status: "na", text: "Not documented" },
        wraps: { status: "yes" },
      },
    ],
  },
] satisfies Parameters<typeof CompareFeatures>[0]["groups"];

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "Customer.io vs Wraps",
  description: PAGE_DESCRIPTION,
  datePublished: "2026-03-01T00:00:00.000Z",
  dateModified: "2026-09-15T00:00:00.000Z",
  author: {
    "@type": "Organization",
    name: "Wraps",
    url: "https://wraps.dev",
    sameAs: ["https://github.com/wraps-team", "https://twitter.com/wrapsdev"],
  },
  publisher: {
    "@type": "Organization",
    name: "Wraps",
    logo: {
      "@type": "ImageObject",
      url: "https://wraps.dev/logo.png",
    },
  },
  mainEntityOfPage: {
    "@type": "WebPage",
    "@id": "https://wraps.dev/compare/customer-io-vs-wraps",
  },
};

const timelineSteps = [
  {
    duration: "Step 1",
    label: "Export your contacts",
    detail:
      "Export profiles from Customer.io via CSV or API, then import them into Wraps. Contacts are unlimited on every plan, so list size does not change the bill.",
  },
  {
    duration: "Step 2",
    label: "Set up Wraps",
    detail: (
      <>
        Run{" "}
        <code className="font-mono text-xs">npx @wraps.dev/cli email init</code>
        , or connect from the browser. It deploys SES, DynamoDB, and the event
        pipeline to your AWS account, namespaced so nothing existing is touched.
        DNS verification uses CNAME records, so there is no conflict with
        Customer.io&apos;s subdomain records. If the account is still in the SES
        sandbox, init says so and links the production access request.
      </>
    ),
  },
  {
    duration: "Step 3",
    label: "Rebuild templates",
    detail:
      "Migrate from Liquid templates to React Email via the @wraps.dev/email SDK. For developer teams, this is typically an upgrade in DX.",
  },
  {
    duration: "Step 4: 1 to 4 weeks",
    label: "Switch sending",
    detail:
      "Replace Customer.io API calls with the Wraps SDK. Warm up your new SES sending identity over 1 to 4 weeks by gradually increasing volume.",
  },
];

export default function CustomerIoVsWrapsPage() {
  return (
    <div className="min-h-screen bg-background">
      <LandingNavbar />
      <Script id="breadcrumb-jsonld" type="application/ld+json">
        {JSON.stringify(breadcrumbJsonLd)}
      </Script>
      <JsonLd data={articleSchema} />

      <main className="container mx-auto px-4 pt-24 pb-4">
        <div className="mx-auto max-w-4xl">
          <CompareBreadcrumb competitor="Customer.io vs Wraps" />

          <CompareSection>
            <SectionKicker className="mb-3">Comparison</SectionKicker>
            <h1 className="mb-4 font-heading font-semibold text-4xl tracking-tight sm:text-5xl">
              Customer.io vs Wraps
            </h1>
            <p className="mb-3 max-w-3xl text-lg text-muted-foreground">
              Customer.io is a marketing automation platform. You rent it, you
              pay per contact, and they host everything. Wraps puts the same
              surface on Amazon SES in your own AWS account: one command sets it
              all up, then one control plane runs it day to day.
            </p>
            <p className="mb-10 max-w-3xl text-muted-foreground">
              Both send lifecycle email from workflows, broadcasts, segments,
              and templates. The difference is who operates the sending
              infrastructure, and what it costs when your list grows.
            </p>
            <CompareVerdict
              competitor="Customer.io"
              competitorPoints={[
                <>
                  <strong>A non-engineer owns email day to day.</strong>{" "}
                  Customer.io is easier to operate without a developer, and that
                  is worth paying for.
                </>,
                <>
                  <strong>
                    You have no AWS account and no appetite for one.
                  </strong>{" "}
                  Wraps deploys into your AWS; if that is not on the table, this
                  is a different approach.
                </>,
                <>
                  <strong>You need multi-channel orchestration</strong> across
                  email, SMS, push, and in-app on a single workflow canvas.
                </>,
                <>
                  <strong>
                    A built-in CDP and its behavioral segmentation
                  </strong>{" "}
                  are core requirements.
                </>,
                <>
                  <strong>You want 100+ native integrations</strong> with tools
                  like Salesforce, HubSpot, Segment, and ad networks.
                </>,
                <>
                  <strong>A/B testing is critical</strong> to your marketing
                  strategy. Wraps has none, and if split-testing subject lines
                  and workflow branches is how your team works, that gap is
                  real.
                </>,
                <>
                  <strong>You need a dedicated CSM</strong>, a structured
                  onboarding program, and enterprise support SLAs.
                </>,
              ]}
              wrapsPoints={[
                <>
                  <strong>You want SES but not the setup.</strong> One command
                  deploys the identities, event pipeline, and IAM roles into
                  your AWS account without touching anything already there. You
                  need an AWS account to do it.
                </>,
                <>
                  <strong>You want someone watching the account.</strong> Bounce
                  and complaint rates are drawn against the lines AWS reviews
                  and pauses at and swept hourly, with suppression,
                  deliverability audits, and a per-message event log on the same
                  surface.
                </>,
                <>
                  <strong>
                    Contact-based pricing is punishing your growth.
                  </strong>{" "}
                  Large lists with many inactive contacts cost the same as small
                  ones here.
                </>,
                <>
                  <strong>Your team is developer-led</strong> and prefers
                  code-first templates in React Email over drag-and-drop
                  editors.
                </>,
                <>
                  <strong>You want workflows you can version-control.</strong>{" "}
                  There is a visual flow builder, and a TypeScript CLI that
                  defines, validates, and pushes the same workflows from code.
                </>,
                <>
                  <strong>
                    You need dedicated sending IPs without moving to a premium
                    tier
                  </strong>{" "}
                  to get them.
                </>,
                <>
                  <strong>
                    You want the sending infrastructure to keep running if you
                    leave the platform.
                  </strong>{" "}
                  No Wraps lock-in.
                </>,
              ]}
            />
          </CompareSection>

          <CompareSection labelledBy="glance-title">
            <CompareSectionHead
              id="glance-title"
              kicker="At a glance"
              title="The short version."
            />
            <CompareGlance competitor="Customer.io" rows={glanceRows} />
          </CompareSection>

          <CompareSection labelledBy="pricing-title">
            <CompareSectionHead
              id="pricing-title"
              kicker="Pricing at real volumes"
              title="What the same list costs on each."
            >
              Customer.io prices by contacts (profiles), not email volume. The
              table assumes about 10 emails per contact per month. Customer.io
              uses high-watermark billing: you pay for the peak contact count
              during the month, even if you delete contacts later.
            </CompareSectionHead>
            <ComparePricing
              competitor="Customer.io"
              rows={pricingRows}
              savingsHeading="You keep"
            />
            <p className="mt-4 text-muted-foreground text-sm">
              Wraps pricing: {freeTier.name} (${freeTier.price}/mo),{" "}
              {proTier.name} (${proTier.price}/mo), {businessTier.name} ($
              {businessTier.price}/mo), a flat monthly fee by plan, not by
              contact or event volume. Amazon SES costs $0.10 per 1,000 emails
              on the à la carte plan ($0.16 on Essentials, the plan AWS puts new
              accounts on by default), paid directly to AWS. The Amazon figures
              include the event pipeline (EventBridge, SQS, Lambda, DynamoDB),
              not only SES.{" "}
              <a
                className="text-brand-text underline"
                href="/tools/ses-calculator"
              >
                Calculate your exact costs
              </a>
            </p>
          </CompareSection>

          <CompareSection labelledBy="features-title">
            <CompareSectionHead
              id="features-title"
              kicker="Feature by feature"
              title="The full comparison."
            >
              Open a group to see every row. Marketing features come first and
              developer features last.
            </CompareSectionHead>
            <CompareFeatures competitor="Customer.io" groups={featureGroups} />
          </CompareSection>

          <CompareSection labelledBy="switching-title">
            <CompareSectionHead
              id="switching-title"
              kicker="Switching from Customer.io"
              title="Four steps, no conflicts."
            >
              Migration from Customer.io to Wraps is straightforward on the
              infrastructure side because Wraps deploys fresh SES infrastructure
              to your AWS account. No conflicts with your existing setup.
            </CompareSectionHead>
            <CompareTimeline steps={timelineSteps} />
            <div className="mt-10">
              <CompareExports
                exports={[
                  "Contacts: export profiles via CSV or API, then import them into Wraps",
                  "Event history you export",
                  "Domain reputation, which travels with your domain rather than the provider",
                ]}
                rebuild={[
                  "Templates: Liquid templates move to React Email",
                  "Workflows: Customer.io cannot export them. Workflows, broadcasts, segments, templates, and topics all have a home in Wraps",
                  "What you lose: Customer.io's built-in CDP, push and in-app channels, A/B testing, and their 100+ native integrations",
                ]}
              />
            </div>
          </CompareSection>

          <AlsoCompare
            alternativesSlug="customer-io"
            current="/compare/customer-io-vs-wraps"
          />

          <CompareSourceNote
            competitor="Customer.io"
            sources={[
              {
                label: "customer.io/pricing",
                href: "https://customer.io/pricing",
              },
              { label: "docs.customer.io", href: "https://docs.customer.io" },
            ]}
            updated="September 2026"
          />
        </div>
      </main>

      <ClosingPanel
        body="Start free, connect your AWS account, and send in parallel while your new domain warms up. Unlimited contacts on every plan, Amazon pricing underneath."
        kicker="Switch from Customer.io"
        primary={{
          label: "Start free",
          href: "https://app.wraps.dev/auth?mode=signup&plan=free",
        }}
        secondary={{
          label: "Calculate your costs",
          href: "/tools/ses-calculator",
        }}
        title="Keep the list. Lose the per-contact bill."
      />

      <LandingFooter />
    </div>
  );
}
