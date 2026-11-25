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
import {
  formatCents,
  savingsMultiple,
  wrapsAllIn,
} from "@/app/compare/components/wraps-cost";
import { ClosingPanel } from "@/app/landing/components/closing-panel";
import { FlowBox } from "@/app/landing/components/flow-primitives";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { SectionKicker } from "@/app/landing/components/section-kicker";
import { JsonLd } from "@/components/json-ld";
import {
  CONTACT_PRICE_ROWS,
  CONTACT_PRICES_CHECKED,
} from "@/config/competitor-contact-pricing";
import { pageMetadata } from "@/lib/page-metadata";
import { AWS_INFRA_PRICING } from "@/lib/ses-cost";

export const metadata: Metadata = pageMetadata({
  title: "Klaviyo vs Wraps: Contact Pricing vs Your Own AWS",
  description:
    "Compare Klaviyo and Wraps: a marketing platform you rent and pay for per contact, against email sent through Amazon SES in your own AWS account. All-in pricing at real volumes, what each one is built for, and who should pick which.",
  path: "/compare/klaviyo-vs-wraps",
  social: {
    title: "Klaviyo vs Wraps",
    description:
      "Klaviyo is an e-commerce marketing platform you rent. Wraps runs email on Amazon SES in your own AWS account, with a flat plan fee and unlimited contacts.",
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
      name: "Klaviyo vs Wraps",
      item: "https://wraps.dev/compare/klaviyo-vs-wraps",
    },
  ],
};

// Klaviyo bills by profile. The 5K to 100K bills are the shared constants (one
// source for every chart and table); the ~1,000 profile bill is Klaviyo's
// entry price on klaviyo.com/pricing.
const KLAVIYO_ENTRY_BILL = 30;

function klaviyoBill(contacts: number): number {
  if (contacts === 1000) {
    return KLAVIYO_ENTRY_BILL;
  }
  const row = CONTACT_PRICE_ROWS.find((r) => r.contacts === contacts);
  if (!row) {
    throw new Error(`No Klaviyo figure for ${contacts} contacts`);
  }
  return row.klaviyo;
}

function dollars(value: number): string {
  return `$${value.toLocaleString("en-US")}`;
}

const pricingRows = (
  [
    { emails: 10_000, contacts: 1000, tier: "free" },
    { emails: 50_000, contacts: 5000, tier: "pro" },
    { emails: 100_000, contacts: 10_000, tier: "pro" },
    { emails: 500_000, contacts: 50_000, tier: "pro" },
    { emails: 1_000_000, contacts: 100_000, tier: "pro" },
  ] as const
).map(({ emails, contacts, tier }) => {
  const wraps = wrapsAllIn({ emails, tier });
  const klaviyo = klaviyoBill(contacts);
  return {
    volume: emails.toLocaleString("en-US"),
    contacts: `~${contacts.toLocaleString("en-US")}`,
    competitor: `${dollars(klaviyo)}/mo`,
    wraps: `${wraps.totalLabel}/mo`,
    wrapsBreakdown: wraps.breakdown,
    savings: savingsMultiple(klaviyo, wraps.total),
    savingsNote: "as much as Wraps",
  };
});

const MILLION_ESSENTIALS = wrapsAllIn({
  emails: 1_000_000,
  tier: "pro",
  sesPlan: "essentials",
});
const MILLION_ALACARTE = wrapsAllIn({ emails: 1_000_000, tier: "pro" });
const KLAVIYO_100K = klaviyoBill(100_000);
const KLAVIYO_5K = klaviyoBill(5000);

const glanceRows = [
  {
    label: "Built for",
    competitor: "Online stores, Shopify first",
    wraps: "Teams that want email on their own AWS",
  },
  {
    label: "Setup",
    competitor: "Connect a store or a list",
    wraps:
      "Connect your AWS account in the browser, or with one command. You need an AWS account",
  },
  {
    label: "Who sends the email",
    competitor: "Klaviyo, on its servers",
    wraps: "Amazon, from your account, watched by the Wraps control plane",
  },
  {
    label: "How you pay",
    competitor: "Per contact stored",
    wraps: "Flat plan fee; Amazon bills each send",
  },
  {
    label: "Contacts",
    competitor: "About $0.014 to $0.030 each per month",
    wraps: "Unlimited on every plan",
  },
  {
    label: "Templates",
    competitor: "Drag-and-drop editor",
    wraps: "Written by AI, refined by asking or in code",
  },
  {
    label: "If you leave",
    competitor: "Sending stops with the subscription",
    wraps:
      "No Wraps lock-in: the sending setup stays in your account and keeps running. Contacts and templates stay with Wraps and can be exported",
  },
];

const featureGroups = [
  {
    title: "Newsletters and automations",
    rows: [
      {
        name: "Visual automation builder",
        competitor: {
          status: "yes",
          text: "Mature, omnichannel, deep integration catalogue",
        },
        wraps: { status: "yes", text: "Visual canvas plus a TypeScript DSL" },
      },
      {
        name: "Topics and preference page",
        competitor: { status: "yes", text: "Hosted preference page" },
        wraps: {
          status: "yes",
          text: "Topics plus a hosted preference centre",
        },
      },
      {
        name: "Drag-and-drop editor",
        competitor: { status: "yes", text: "Yes, no code needed" },
        wraps: {
          status: "no",
          text: "No. Templates are written by AI, refined by asking or in React Email code",
        },
      },
      {
        name: "A/B testing",
        competitor: { status: "yes", text: "Built-in split testing" },
        wraps: { status: "no" },
      },
      {
        name: "Predictive analytics (CLV, churn)",
        competitor: { status: "yes", text: "Built-in CDP" },
        wraps: { status: "no" },
      },
      {
        name: "Revenue attribution",
        competitor: { status: "yes", text: "Native e-commerce" },
        wraps: { status: "no" },
      },
      {
        name: "Shopify integration",
        competitor: { status: "yes", text: "Native and first-party deep" },
        wraps: { status: "no" },
      },
      {
        name: "Pre-built marketing integrations",
        competitor: {
          status: "yes",
          text: "Large catalogue, e-commerce first",
        },
        wraps: { status: "no" },
      },
      {
        name: "SMS",
        competitor: {
          status: "yes",
          text: "Bundled with the plan, credit-based",
        },
        wraps: { status: "yes", text: "Through AWS End User Messaging" },
      },
    ],
  },
  {
    title: "Sending and inbox health",
    rows: [
      {
        name: "App emails (receipts, resets)",
        competitor: {
          status: "partial",
          text: "Built around flows and campaigns",
        },
        wraps: { status: "yes", text: "First-class API" },
      },
      {
        name: "Marketing and broadcast email",
        competitor: { status: "yes", text: "Visual campaign builder" },
        wraps: { status: "yes", text: "Platform broadcasts" },
      },
      {
        name: "Send via API",
        competitor: {
          status: "partial",
          text: "Triggered by events, not a direct send endpoint",
        },
        wraps: {
          status: "yes",
          text: "TypeScript and Python SDKs, REST API, MCP server",
        },
      },
      {
        name: "Bounce and complaint alerts",
        competitor: {
          status: "yes",
          text: "Deliverability dashboards; their team owns the sending",
        },
        wraps: {
          status: "yes",
          text: "Hourly sweep against AWS's review and pause lines",
        },
      },
      {
        name: "Alerts when rates move",
        competitor: { status: "yes", text: "Platform notifications" },
        wraps: {
          status: "yes",
          text: "Owners and admins notified, once per account per day",
        },
      },
      {
        name: "Suppression list you can browse and clear",
        competitor: { status: "yes", text: "Suppression management in the UI" },
        wraps: {
          status: "yes",
          text: "SES account suppression, wired on at deploy",
        },
      },
      {
        name: "Domain and blacklist checks",
        competitor: { status: "partial", text: "Guided domain setup" },
        wraps: { status: "yes", text: "wraps email check, on demand" },
      },
      {
        name: "Per-message event log",
        competitor: { status: "yes", text: "Profile activity timeline" },
        wraps: {
          status: "yes",
          text: "Every send, open and delivery, queryable",
        },
      },
      {
        name: "Dedicated sending IPs",
        competitor: {
          status: "partial",
          text: "Available on qualifying plans",
        },
        wraps: {
          status: "yes",
          text: `In your AWS account, ${formatCents(AWS_INFRA_PRICING.DEDICATED_IP_PER_MONTH)} a month from Amazon when you need full control`,
        },
      },
    ],
  },
  {
    title: "Setup, data and what stays if you leave",
    rows: [
      {
        name: "Setting it up",
        competitor: {
          status: "yes",
          text: "Nothing to deploy, the platform is theirs",
        },
        wraps: {
          status: "yes",
          text: "Browser or one command, non-destructive, namespaced wraps-email-*. Needs an AWS account",
        },
      },
      {
        name: "Unlimited contacts",
        competitor: { status: "no", text: "Priced per profile" },
        wraps: { status: "yes", text: "All plans" },
      },
      {
        name: "Where sending and delivery history live",
        competitor: { status: "no", text: "Klaviyo's platform" },
        wraps: {
          status: "yes",
          text: "Amazon SES and your DynamoDB, retention set in your deploy config",
        },
      },
      {
        name: "Sending infrastructure in your own cloud account",
        competitor: { status: "no" },
        wraps: { status: "yes", text: "Core architecture (BYOC)" },
      },
      {
        name: "Onsite tracking script",
        competitor: {
          status: "yes",
          text: "Yes, powers forms and browse abandonment",
        },
        wraps: { status: "no", text: "None, server-side only" },
      },
      {
        name: "Sending keeps working if you cancel",
        competitor: {
          status: "no",
          text: "No, the platform is the subscription",
        },
        wraps: {
          status: "yes",
          text: "Yes, SES and the event pipeline are already in your account",
        },
      },
    ],
  },
  {
    title: "What Wraps sets up and watches",
    children: (
      <div className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          Most teams pick a hosted platform because they do not want to deal
          with SES. That is the part Wraps does for you. The sending stays in
          your account; the work of standing it up and keeping it healthy does
          not stay on your desk.
        </p>
        <div className="grid gap-x-6 gap-y-8 pt-3 md:grid-cols-2">
          <FlowBox className="min-w-0 pb-5" dashed label="We set everything up">
            <ul className="list-disc space-y-2 pl-4 text-muted-foreground marker:text-brand">
              <li>
                One command, or the browser, puts the whole SES surface in your
                own AWS account
              </li>
              <li>
                Domain identity, DKIM, event capture, delivery history,
                suppression
              </li>
              <li>
                Non-destructive. Everything is namespaced wraps-email-*, so it
                sits beside SES you already run
              </li>
              <li>
                CloudWatch alarms in your account, set below AWS&rsquo;s own
                lines so you get lead time: bounce warns at 2%, complaints at
                0.05%, with email or a webhook to Slack, Discord or PagerDuty.
                On by default in the Production and Enterprise deploy presets,
                off in the Starter preset
              </li>
              <li>
                Sandbox status detected at the end of setup, explained, and the
                console request linked
              </li>
            </ul>
          </FlowBox>
          <FlowBox
            className="min-w-0 pb-5"
            label="The control plane runs it day to day"
          >
            <ul className="list-disc space-y-2 pl-4 text-muted-foreground marker:text-brand">
              <li>
                Bounce and complaint rates swept hourly and drawn against
                AWS&rsquo;s own review and pause lines
              </li>
              <li>
                Owners and admins notified when an account moves toward those
                lines
              </li>
              <li>
                Suppression you can browse and clear, on by default for bounces
                and complaints
              </li>
              <li>
                DKIM, SPF, DMARC, MX and public blacklist audits from wraps
                email check
              </li>
              <li>
                A log of every message, plus doctor and status with named fixes
              </li>
            </ul>
          </FlowBox>
        </div>
        <p className="text-muted-foreground">
          AWS can place an account under review above a 5% bounce rate and can
          pause sending at 10%; for complaints the lines are 0.1% and 0.5%. The
          dashboard draws your rates against those numbers so you are reading
          the same gauge AWS is.
        </p>
      </div>
    ),
  },
  {
    title: "How each one is run",
    children: (
      <div className="grid gap-x-6 gap-y-8 pt-3 text-sm md:grid-cols-2">
        <FlowBox
          className="min-w-0 pb-5"
          label="Klaviyo: a hosted marketing platform"
        >
          <ul className="list-disc space-y-2 pl-4 text-muted-foreground">
            <li>
              Your email sends through Klaviyo&rsquo;s infrastructure, not an
              account you hold
            </li>
            <li>Shared IPs by default, dedicated on qualifying plans</li>
            <li>Profiles, events and templates live on their platform</li>
            <li>
              In exchange, Klaviyo owns deliverability. Nothing to deploy and
              nobody to page
            </li>
            <li>
              Leaving means a migration, because the sending was never in an
              account you hold
            </li>
          </ul>
        </FlowBox>
        <FlowBox
          className="min-w-0 pb-5"
          dashed
          label="Wraps: sending in your AWS account"
        >
          <ul className="list-disc space-y-2 pl-4 text-muted-foreground marker:text-brand">
            <li>
              Amazon SES deployed to your AWS account, so the sending
              infrastructure is in an account you hold
            </li>
            <li>
              Dedicated IPs available in your account when you want full control
              of the sending reputation
            </li>
            <li>
              Per-message delivery history in your DynamoDB, retention set in
              your own deploy config
            </li>
            <li>
              Contacts, templates, broadcasts and workflow state live in the
              Wraps control plane, and export on demand
            </li>
            <li>
              No Wraps lock-in: stop paying Wraps and the sending keeps running
            </li>
            <li>
              No AWS keys stored anywhere. Wraps assumes a role in your account
              with an external ID, an hour at a time
            </li>
          </ul>
        </FlowBox>
      </div>
    ),
  },
  {
    title: "For developers",
    rows: [
      {
        name: "TypeScript SDK",
        competitor: {
          status: "partial",
          text: "Generated from their OpenAPI spec",
        },
        wraps: { status: "yes", text: "Hand-written, type-safe" },
      },
      {
        name: "CLI",
        competitor: { status: "no", text: "No infrastructure CLI" },
        wraps: {
          status: "yes",
          text: "Deploys and manages the SES surface",
        },
      },
      {
        name: "React Email support",
        competitor: { status: "no" },
        wraps: { status: "yes" },
      },
      {
        name: "Templates and workflows in Git",
        competitor: { status: "no", text: "No, GUI only" },
        wraps: {
          status: "yes",
          text: "Code-first and Git-native; workflows as a TypeScript DSL pushed from the CLI",
        },
      },
      {
        name: "Infrastructure as code",
        competitor: { status: "no" },
        wraps: { status: "yes", text: "Pulumi and AWS CDK, or the CLI" },
      },
    ],
  },
] satisfies Parameters<typeof CompareFeatures>[0]["groups"];

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "Klaviyo vs Wraps",
  description:
    "Compare Klaviyo and Wraps: a profile-based marketing platform you rent against Amazon SES set up and operated in your own AWS account. Pricing at real volumes, what each one is built for, and who should pick which.",
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
    "@id": "https://wraps.dev/compare/klaviyo-vs-wraps",
  },
};

const timelineSteps = [
  { duration: "1 to 2 days", label: "Audit your existing Klaviyo setup" },
  { duration: "Same day", label: "Deploy Wraps into your AWS account" },
  {
    duration: "24 to 48 hours",
    label: "DNS records and domain verification",
  },
  { duration: "2 to 4 weeks", label: "Warm up the sending domain and IPs" },
  {
    duration: "1 to 2 weeks",
    label: "Rebuild automations, where you have them",
  },
  { duration: "1 to 2 weeks", label: "Send in parallel and validate" },
  { duration: "1 day", label: "Full cutover" },
];

export default function KlaviyoVsWrapsPage() {
  return (
    <div className="min-h-screen bg-background">
      <LandingNavbar />
      <Script id="breadcrumb-jsonld" type="application/ld+json">
        {JSON.stringify(breadcrumbJsonLd)}
      </Script>
      <JsonLd data={articleSchema} />

      <main className="container mx-auto px-4 pt-24 pb-4">
        <div className="mx-auto max-w-4xl">
          <CompareBreadcrumb competitor="Klaviyo vs Wraps" />

          <CompareSection>
            <SectionKicker className="mb-3">Comparison</SectionKicker>
            <h1 className="mb-4 font-heading font-semibold text-4xl tracking-tight sm:text-5xl">
              Klaviyo vs Wraps
            </h1>
            <p className="mb-10 max-w-3xl text-lg text-muted-foreground">
              Klaviyo is a marketing platform you rent, built for online stores.
              Wraps runs your email on Amazon in your own AWS account, with
              newsletters and automations on top. Different products for
              different teams. Here&rsquo;s how to pick.
            </p>
            <CompareVerdict
              competitor="Klaviyo"
              competitorPoints={[
                <>
                  <strong>You run a Shopify store</strong> and want abandoned
                  cart flows, product recommendations and revenue attributed per
                  campaign. This is what Klaviyo was built for.
                </>,
                <>
                  <strong>A marketer runs the whole program.</strong> A visual
                  flow builder, drag-and-drop templates and AI content tools
                  mean no terminal. Wraps needs an AWS account: setup can run
                  from the browser, but someone still owns that account.
                </>,
                <>
                  <strong>You need predictive analytics and a CDP:</strong>{" "}
                  churn risk, customer lifetime value, expected next order date,
                  RFM segmentation.
                </>,
                <>
                  <strong>You want the integration catalogue</strong> connected
                  out of the box, with nothing to wire up.
                </>,
                <>
                  <strong>You need email, SMS, push and WhatsApp</strong> in one
                  visual canvas, with split testing. Wraps has no A/B testing.
                </>,
                <>
                  <strong>Nobody on your team wants an AWS account.</strong> Do
                  not get one for this. A hosted platform is the right call.
                </>,
              ]}
              wrapsPoints={[
                <>
                  <strong>Your list is big and your bill grows with it.</strong>{" "}
                  Contacts are unlimited on every Wraps plan and Amazon bills
                  each send. On Klaviyo, 100,000 profiles is{" "}
                  {dollars(KLAVIYO_100K)}/mo whether you email them or not.
                </>,
                <>
                  <strong>
                    You want sending to run in your own AWS account.
                  </strong>{" "}
                  One command or the browser puts Amazon SES there, beside any
                  SES you already run. You need an AWS account to do it.
                </>,
                <>
                  <strong>You want somebody watching it.</strong> Bounce and
                  complaint rates read hourly against AWS&rsquo;s own lines,
                  owners and admins notified when they move, suppression you can
                  browse and clear, deliverability audits and a log of every
                  message.
                </>,
                <>
                  <strong>You send app emails like receipts and resets</strong>{" "}
                  through a real API, alongside newsletters and lifecycle
                  workflows rather than bolted onto a flow builder.
                </>,
                <>
                  <strong>You want workflows you can version-control:</strong> a
                  visual flow builder plus a TypeScript DSL you push from the
                  CLI and keep in Git.
                </>,
                <>
                  <strong>You want no client-side script.</strong> Wraps is
                  server-side only: nothing to add to your pages.
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
            <CompareGlance competitor="Klaviyo" rows={glanceRows} />
          </CompareSection>

          <CompareSection labelledBy="pricing-title">
            <CompareSectionHead
              id="pricing-title"
              kicker="Pricing at real volumes"
              title="What the same list costs on each."
            >
              Klaviyo charges for every active profile you store, emailed or
              not, and that bill buys its whole marketing program. Wraps charges
              a flat plan fee with unlimited contacts, and Amazon bills you
              directly for sends: $0.10 per 1,000 emails on its à la carte plan,
              or $0.16 on the Essentials plan AWS puts new accounts on by
              default.
            </CompareSectionHead>
            <ComparePricing
              competitor="Klaviyo"
              rows={pricingRows}
              savingsHeading="Klaviyo costs"
            />
            <div className="mt-4 space-y-2 text-muted-foreground text-sm">
              <p>
                Wraps, all in, is the plan fee plus the Amazon bill: sending on
                the $0.10 à la carte plan plus the event pipeline (EventBridge,
                SQS, Lambda, DynamoDB), paid directly to AWS. On the default
                $0.16 Essentials plan the 1M row is{" "}
                {MILLION_ESSENTIALS.totalLabel} instead of{" "}
                {MILLION_ALACARTE.totalLabel}, or about{" "}
                {savingsMultiple(
                  klaviyoBill(100_000),
                  MILLION_ESSENTIALS.total
                )}{" "}
                rather than {pricingRows[4].savings}. Klaviyo figures from
                klaviyo.com, checked {CONTACT_PRICES_CHECKED}.{" "}
                <a
                  className="text-brand-text underline"
                  href="/tools/ses-calculator"
                >
                  Calculate your exact cost
                </a>
              </p>
              <p>
                The two bills move on different axes. Growing a list from 5,000
                to 100,000 profiles costs nothing extra on Wraps, because
                contacts are unlimited and you pay Amazon per send. On Klaviyo
                the same growth moves the plan from {dollars(KLAVIYO_5K)}/mo to{" "}
                {dollars(KLAVIYO_100K)}/mo at the same send volume.
              </p>
            </div>

            <div className="mt-10">
              <FlowBox
                className="min-w-0 pb-5"
                label="What moves the Klaviyo bill"
              >
                <ul className="list-disc space-y-3 pl-4 text-muted-foreground text-sm">
                  <li>
                    Since February 2025 Klaviyo bills all active profiles, not
                    only the ones you email. Signups you never send to still
                    count.
                  </li>
                  <li>
                    Passing a profile limit auto-upgrades the plan. It does not
                    auto-downgrade when the list shrinks again.
                  </li>
                  <li>
                    Send volume is capped at ten times your profile count, and
                    sends halt past it.
                  </li>
                </ul>
                <p className="mt-4 text-muted-foreground text-sm">
                  None of this is hidden. It is how a platform priced on the
                  audience it stores has to work. It is worth modelling before
                  you sign, because a list that grows faster than the sending
                  does moves the bill on its own.
                </p>
              </FlowBox>
            </div>
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
            <CompareFeatures competitor="Klaviyo" groups={featureGroups} />
          </CompareSection>

          <CompareSection labelledBy="switching-title">
            <CompareSectionHead
              id="switching-title"
              kicker="Switching from Klaviyo"
              title="Plan four to eight weeks."
            >
              The deploy itself is quick; the calendar is warmup, DNS and
              rebuilding what does not export. Run both in parallel while the
              new domain warms.
            </CompareSectionHead>
            <CompareTimeline steps={timelineSteps} />
            <div className="mt-10">
              <CompareExports
                exports={[
                  "Contact profiles (CSV)",
                  "Email templates (HTML)",
                  "Campaign performance (API)",
                  "Historical events (API with pagination)",
                ]}
                rebuild={[
                  "Flows (automations): no portable format",
                  "Segments: criteria must be recreated by hand",
                  "Signup forms: not exportable",
                  "Predictive properties (CLV, churn): Klaviyo-proprietary",
                ]}
              />
            </div>
            <p className="mt-6 max-w-3xl text-muted-foreground text-sm">
              <strong className="text-foreground">
                What is different on the other side:
              </strong>{" "}
              the sending runs in your AWS account, under your domain. If you
              ever stop paying Wraps, the SES identities, DynamoDB tables and
              Lambda functions keep running: no Wraps lock-in. Contacts,
              templates and workflows stay with Wraps and can be exported.
            </p>
          </CompareSection>

          <AlsoCompare current="/compare/klaviyo-vs-wraps" />

          <CompareSourceNote
            competitor="Klaviyo"
            sources={[
              { label: "klaviyo.com", href: "https://www.klaviyo.com/pricing" },
              {
                label: "developers.klaviyo.com",
                href: "https://developers.klaviyo.com",
              },
            ]}
            updated="September 2026"
          />
        </div>
      </main>

      <ClosingPanel
        body="Start free, connect your AWS account, and run both side by side while your domain warms up."
        kicker="Switch from Klaviyo"
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
