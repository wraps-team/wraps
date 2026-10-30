import { Button } from "@wraps/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import { ArrowRight, Check, Gauge, Minus, Terminal, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import { AlsoCompare } from "@/app/compare/components/also-compare";
import { CompareBreadcrumb } from "@/app/compare/components/breadcrumb";
import { FeatureCell } from "@/app/compare/components/feature-cell";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { SectionKicker } from "@/app/landing/components/section-kicker";
import { JsonLd } from "@/components/json-ld";

const PAGE_DESCRIPTION =
  "Wraps runs on your own Amazon SES, not instead of it. Same AWS account, same pricing, same sending reputation. One command sets the whole surface up, and the control plane runs it day to day.";

export const metadata: Metadata = {
  title: "Amazon SES vs Wraps - Everything SES Needs, Including Operations",
  description: PAGE_DESCRIPTION,
  openGraph: {
    title: "Amazon SES vs Wraps | Wraps",
    description: PAGE_DESCRIPTION,
    url: "https://wraps.dev/compare/amazon-ses-vs-wraps",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Amazon SES vs Wraps | Wraps",
    description: PAGE_DESCRIPTION,
  },
  alternates: {
    canonical: "https://wraps.dev/compare/amazon-ses-vs-wraps",
  },
};

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
      name: "Amazon SES vs Wraps",
      item: "https://wraps.dev/compare/amazon-ses-vs-wraps",
    },
  ],
};

const tldrComparison = [
  {
    dimension: "Sending service",
    ses: "Amazon SES",
    wraps: "Amazon SES",
  },
  {
    dimension: "Whose AWS account",
    ses: "Yours",
    wraps: "Yours",
  },
  {
    dimension: "Setup",
    ses: "Wire up SES plus the 6-8 AWS services around it",
    wraps: "One command, non-destructive, namespaced wraps-email-*",
  },
  {
    dimension: "Bounce and complaint rates",
    ses: "CloudWatch metrics you build alarms on",
    wraps: "Drawn against AWS's own lines, swept hourly, owners notified",
  },
  {
    dimension: "Suppression",
    ses: "API calls against the SES suppression list",
    wraps: "Wired on at deploy, browsable and clearable in the dashboard",
  },
  {
    dimension: "Deliverability checks",
    ses: "Bring your own",
    wraps: "DKIM, SPF, DMARC, MX, TLS, BIMI and blacklists, on demand",
  },
  {
    dimension: "Per-message history",
    ses: "Aggregate CloudWatch metrics",
    wraps: "A row per message, searchable",
  },
  {
    dimension: "Source",
    ses: "AWS service",
    wraps: "AGPL-3.0, self-hostable",
  },
];

const setupItems = [
  "SES configuration set, EventBridge rules, SQS queues with a dead letter queue, a Lambda event processor and DynamoDB event history",
  "Domain identity with DKIM, SPF and DMARC records, with Route 53 detected automatically when you use it",
  "Account-level suppression turned on for bounces and complaints from the first send",
  "CloudWatch alarms on bounce rate, complaint rate and the dead letter queue, set below AWS's own lines — on for the Production and Enterprise presets, off for Starter",
  "HTTPS open and click tracking on your own domain, via ACM and CloudFront",
  "IAM roles with least-privilege policies, everything namespaced wraps-email-*",
  "Pulumi state, so upgrades and wraps email destroy are one command each",
];

const operationsItems = [
  "Bounce and complaint rates drawn against AWS's own review and pause lines, swept hourly, with org owners and admins notified",
  "Your 24-hour send quota with a warning line well before you reach it",
  "The suppression list, browsable and clearable, instead of API calls",
  "wraps email check: DKIM, SPF, DMARC, MX, MX-TLS, BIMI, RDAP and public blacklists, on demand",
  "wraps email doctor and wraps email status, with named remediations rather than a red X",
  "A row per message with recipient, subject, template, and delivery and open timestamps",
];

const pricingComparison = [
  {
    volume: "10K/mo",
    sesRaw: "$1.00",
    wrapsTier: "Free",
    wrapsCost: "$1.00",
    wrapsBreakdown: "$0 plan + $1 SES",
  },
  {
    volume: "50K/mo",
    sesRaw: "$5.00",
    wrapsTier: "Pro",
    wrapsCost: "$34.00",
    wrapsBreakdown: "$29 plan + $5 SES",
  },
  {
    volume: "100K/mo",
    sesRaw: "$10.00",
    wrapsTier: "Pro",
    wrapsCost: "$39.00",
    wrapsBreakdown: "$29 plan + $10 SES",
  },
  {
    volume: "500K/mo",
    sesRaw: "$50.00",
    wrapsTier: "Pro",
    wrapsCost: "$79.00",
    wrapsBreakdown: "$29 plan + $50 SES",
  },
];

type FeatureSupport = "yes" | "no" | "partial" | string;

const featureComparison: {
  category: string;
  features: {
    name: string;
    ses: FeatureSupport;
    sesNote?: string;
    wraps: FeatureSupport;
    wrapsNote?: string;
  }[];
}[] = [
  {
    category: "Setup",
    features: [
      {
        name: "Domain verification (DKIM, SPF, DMARC)",
        ses: "partial",
        sesNote: "DNS records by hand",
        wraps: "yes",
        wrapsNote: "CLI-guided, Route 53 detected",
      },
      {
        name: "Event pipeline (deliveries, bounces, complaints)",
        ses: "partial",
        sesNote: "Build EventBridge + SQS + Lambda + DynamoDB",
        wraps: "yes",
        wrapsNote: "Deployed by one command",
      },
      {
        name: "Infrastructure as code",
        ses: "partial",
        sesNote: "Write your own, 20+ resource types",
        wraps: "yes",
        wrapsNote: "Pulumi component or the @wraps.dev/cdk construct",
      },
      {
        name: "Runs alongside SES you already have",
        ses: "yes",
        wraps: "yes",
        wrapsNote: "Non-destructive, nothing existing is modified",
      },
      {
        name: "One-command teardown",
        ses: "no",
        sesNote: "Delete resources by hand",
        wraps: "yes",
        wrapsNote: "wraps email destroy",
      },
    ],
  },
  {
    category: "Day-to-day operations",
    features: [
      {
        name: "Bounce and complaint rate monitoring",
        ses: "partial",
        sesNote: "CloudWatch metrics; build the alarms yourself",
        wraps: "yes",
        wrapsNote:
          "Hourly sweep against AWS's lines, owners and admins notified",
      },
      {
        name: "CloudWatch alarms in your AWS account",
        ses: "partial",
        sesNote: "Define the metrics, alarms and SNS topics yourself",
        wraps: "yes",
        wrapsNote:
          "Deployed below AWS's thresholds; on for Production and Enterprise presets, off for Starter",
      },
      {
        name: "Alert delivery",
        ses: "partial",
        sesNote: "Wire SNS to wherever your team reads alerts",
        wraps: "yes",
        wrapsNote: "Notification email and webhooks: Slack, Discord, PagerDuty",
      },
      {
        name: "Suppression list management",
        ses: "partial",
        sesNote: "API calls, case-sensitive",
        wraps: "yes",
        wrapsNote: "On at deploy for bounces and complaints, browsable UI",
      },
      {
        name: "Deliverability and blacklist audit",
        ses: "no",
        sesNote: "Not part of SES",
        wraps: "yes",
        wrapsNote: "wraps email check, on demand",
      },
      {
        name: "Per-message delivery tracking",
        ses: "no",
        sesNote: "Aggregate CloudWatch metrics only",
        wraps: "yes",
        wrapsNote: "Event log with filtering",
      },
      {
        name: "Sandbox and production access",
        ses: "partial",
        sesNote: "Console request; AWS decides",
        wraps: "partial",
        wrapsNote: "Detected, explained, request linked. AWS still decides",
      },
      {
        name: "Webhook delivery",
        ses: "partial",
        sesNote: "Build EventBridge + Lambda + HTTP yourself",
        wraps: "yes",
        wrapsNote: "Built in, configurable from the CLI",
      },
    ],
  },
  {
    category: "Developer experience",
    features: [
      {
        name: "TypeScript and Python SDKs",
        ses: "partial",
        sesNote: "AWS SDK, service-specific and verbose",
        wraps: "yes",
        wrapsNote: "@wraps.dev/email and the Python client",
      },
      {
        name: "SMTP credentials",
        ses: "partial",
        sesNote: "IAM user and credential generation by hand",
        wraps: "yes",
        wrapsNote: "wraps email init --smtp",
      },
      {
        name: "Open and click tracking",
        ses: "partial",
        sesNote: "Config set + custom domain + CloudFront",
        wraps: "yes",
        wrapsNote: "HTTPS tracking domain set up for you",
      },
      {
        name: "Template editing",
        ses: "no",
        sesNote: "Raw HTML templates",
        wraps: "yes",
        wrapsNote: "React Email TSX with an AI editor",
      },
      {
        name: "Inbound email",
        ses: "partial",
        sesNote: "Build receipt rules + S3 + Lambda yourself",
        wraps: "yes",
        wrapsNote: "wraps email inbound (S3 + MIME parser + webhooks)",
      },
      {
        name: "MCP server for coding agents",
        ses: "no",
        wraps: "yes",
        wrapsNote: "Send, check status, read the event log",
      },
    ],
  },
  {
    category: "Ownership and team",
    features: [
      {
        name: "Sending and event history live in your AWS account",
        ses: "yes",
        wraps: "yes",
        wrapsNote: "Retention set in your own deploy config",
      },
      {
        name: "Source you can read and fork",
        ses: "no",
        sesNote: "AWS service",
        wraps: "yes",
        wrapsNote: "AGPL-3.0; SDKs MIT; self-hostable",
      },
      {
        name: "Team access",
        ses: "partial",
        sesNote: "IAM users and roles",
        wraps: "yes",
        wrapsNote: "Organizations with roles; SSO and SCIM on Business",
      },
      {
        name: "No vendor lock-in",
        ses: "yes",
        wraps: "yes",
        wrapsNote: "Standard AWS resources; they keep running if you leave",
      },
    ],
  },
];

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "Amazon SES vs Wraps",
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
    "@id": "https://wraps.dev/compare/amazon-ses-vs-wraps",
  },
};

const chooseSesReasons = [
  "Your sending is one SendEmail call and a template you already own.",
  "You have a platform team that built the pipeline around SES and is happy running it.",
  "You need SES options Wraps does not expose yet, like dedicated IP pools or Mail Manager rules.",
  "You have no AWS account and no appetite for one. Then neither raw SES nor Wraps is your answer — rent a sending API.",
];

const chooseWrapsReasons = [
  "You want SES prices and SES ownership without hand-building the event pipeline that goes around it.",
  "You want bounce and complaint rates checked against AWS's lines every hour, with a name on the notification.",
  "You already run SES and want a dashboard, suppression UI, message search and deliverability checks on top of it, without touching DNS.",
  "You want the tooling to be open source, with the option to self-host all of it.",
  "Your team's time is better spent on the product than on plumbing every SES user builds the same way.",
];

export default function AmazonSesVsWrapsPage() {
  return (
    <div className="min-h-screen bg-background">
      <LandingNavbar />
      <Script id="breadcrumb-jsonld" type="application/ld+json">
        {JSON.stringify(breadcrumbJsonLd)}
      </Script>
      <JsonLd data={articleSchema} />

      <main className="container mx-auto px-4 pt-24 pb-16">
        <div className="mx-auto max-w-4xl">
          <CompareBreadcrumb competitor="Amazon SES vs Wraps" />

          {/* =========================================== */}
          {/* 1. HERO */}
          {/* =========================================== */}
          <section className="mb-16">
            <SectionKicker>Comparison</SectionKicker>
            <h1 className="mb-4 font-heading font-semibold text-4xl tracking-tight sm:text-5xl">
              Amazon SES vs Wraps
            </h1>
            <p className="mb-3 max-w-2xl text-lg text-muted-foreground">
              <strong className="text-foreground">Amazon SES</strong> is the
              cheapest way to send email, and the only one where the account,
              the domain reputation and the data stay yours. If you are willing
              to hold an AWS account, it is the right call.
            </p>
            <p className="max-w-2xl text-lg text-muted-foreground">
              So this is not SES versus Wraps. It is raw SES versus{" "}
              <strong className="text-foreground">SES with Wraps on top</strong>
              . Same service, same AWS bill, same DKIM keys.{" "}
              <strong className="text-foreground">Wraps</strong> sets the whole
              surface up in one command, in your account, and then runs it day
              to day.
            </p>
          </section>

          {/* =========================================== */}
          {/* 2. TL;DR COMPARISON TABLE */}
          {/* =========================================== */}
          <section className="mb-16">
            <h2 className="mb-6 font-heading font-semibold text-2xl tracking-tight">
              TL;DR — The Key Differences
            </h2>
            <Card className="overflow-hidden py-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-4 text-left font-medium" />
                      <th className="p-4 text-left font-medium">Raw SES</th>
                      <th className="p-4 text-left font-medium text-primary">
                        SES + Wraps
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {tldrComparison.map((row) => (
                      <tr key={row.dimension}>
                        <td className="p-4 font-medium">{row.dimension}</td>
                        <td className="p-4 text-muted-foreground">{row.ses}</td>
                        <td className="p-4">{row.wraps}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </section>

          {/* =========================================== */}
          {/* 3. THE TWO BEATS: SETUP, THEN OPERATIONS */}
          {/* =========================================== */}
          <section className="mb-16">
            <h2 className="mb-4 font-heading font-semibold text-2xl tracking-tight">
              Everything SES Needs, Including Operations
            </h2>
            <p className="mb-6 text-muted-foreground">
              Most teams pick a hosted API because they do not want to deal with
              SES. Wraps makes dealing with it easy, in two parts. One command
              sets the infrastructure up in your AWS account. The control plane
              — the Wraps-hosted side — runs it from there.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <div className="mb-1 flex items-center gap-2">
                    <Terminal className="size-5 text-primary" />
                    <CardTitle className="text-base">
                      One command sets it up
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-muted-foreground text-sm">
                    {setupItems.map((item) => (
                      <li className="flex items-start gap-2" key={item}>
                        <Check className="mt-0.5 size-4 shrink-0 text-success" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              <Card className="border-primary/30">
                <CardHeader className="pb-2">
                  <div className="mb-1 flex items-center gap-2">
                    <Gauge className="size-5 text-primary" />
                    <CardTitle className="text-base">
                      The control plane runs it
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-muted-foreground text-sm">
                    {operationsItems.map((item) => (
                      <li className="flex items-start gap-2" key={item}>
                        <Check className="mt-0.5 size-4 shrink-0 text-success" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>

            <p className="mt-4 text-muted-foreground text-sm">
              The lines those rates are drawn against are AWS's own: it can
              place an account under review above a 5% bounce rate and can pause
              sending at 10%, and for complaints the equivalent lines are 0.1%
              and 0.5%. The alarms Wraps deploys sit deliberately below them —
              bounce warns at 2% and goes critical at 4%, complaints warn at
              0.05% and go critical at 0.08% — so a drift reaches you by email
              or webhook, in Slack, Discord or PagerDuty, while there is still
              room to fix it. Raw SES publishes the numbers. Wraps draws the gap
              against them, every hour, without anyone opening CloudWatch.
            </p>
          </section>

          {/* =========================================== */}
          {/* 4. THE ARCHITECTURAL DIFFERENCE */}
          {/* =========================================== */}
          <section className="mb-16">
            <h2 className="mb-4 font-heading font-semibold text-2xl tracking-tight">
              The Architectural Difference
            </h2>
            <p className="mb-6 text-muted-foreground">
              Most SES alternatives replace SES with their own infrastructure.
              You move your DNS, warm a new reputation, rewrite your sending
              code, pay a per-email markup, and keep nothing if you leave.
            </p>
            <p className="mb-6 text-muted-foreground">
              Wraps deploys <em>to</em> SES instead of replacing it.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    Migrating SES to Resend, Postmark, SendGrid...
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-muted-foreground text-sm">
                    <li className="flex items-start gap-2">
                      <X className="mt-0.5 size-4 shrink-0 text-destructive" />
                      Leave your SES infrastructure behind
                    </li>
                    <li className="flex items-start gap-2">
                      <X className="mt-0.5 size-4 shrink-0 text-destructive" />
                      Start a new sending reputation from zero
                    </li>
                    <li className="flex items-start gap-2">
                      <X className="mt-0.5 size-4 shrink-0 text-destructive" />
                      Change DNS records: new DKIM, new SPF
                    </li>
                    <li className="flex items-start gap-2">
                      <X className="mt-0.5 size-4 shrink-0 text-destructive" />
                      Rewrite sending code against a new API
                    </li>
                    <li className="flex items-start gap-2">
                      <X className="mt-0.5 size-4 shrink-0 text-destructive" />
                      Pay a per-email markup, on their terms
                    </li>
                  </ul>
                </CardContent>
              </Card>

              <Card className="border-primary/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    Adding Wraps on top of SES
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-muted-foreground text-sm">
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" />
                      SES stays: same service, account, region
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" />
                      Same DKIM keys, SPF records, DMARC policy
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" />
                      Same sending reputation, no warm-up
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" />
                      Existing sending code keeps working
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" />
                      Same AWS bill, paid to AWS
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </div>

            <Card className="mt-6 bg-muted/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  Wraps is a wrapper over your own SES
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p>
                  That is the product, and the name. The repository is AGPL-3.0
                  with an enterprise kernel under a separate licence, and the
                  SDKs are MIT. You can read it, fork it, or self-host the whole
                  stack. Wraps reaches your account through an IAM role you
                  create and can revoke, assumed for an hour at a time. No AWS
                  access keys are stored anywhere.
                </p>
                <p className="text-muted-foreground">
                  The limit, stated plainly: sending and the per-event delivery
                  history live in your AWS account, with retention you set in
                  your own deploy config. Contacts, templates, broadcasts,
                  workflow state and a row per message — recipient, subject,
                  sender, template variables, delivery and open timestamps —
                  live in the Wraps database. If that split does not work for
                  you, self-host it.
                </p>
              </CardContent>
            </Card>
          </section>

          {/* =========================================== */}
          {/* 5. PRICING AT REAL VOLUMES */}
          {/* =========================================== */}
          <section className="mb-16">
            <h2 className="mb-4 font-heading font-semibold text-2xl tracking-tight">
              Pricing at Real Volumes
            </h2>
            <p className="mb-6 text-muted-foreground">
              The per-email cost is identical either way. AWS bills you directly
              for sending at the same rate whether or not Wraps is in front of
              it, and the Wraps plan is flat — no send meter, no contact
              pricing. What the plan buys is the setup and the operations on
              top.
            </p>

            <Card className="overflow-hidden py-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-4 text-left font-medium">Volume</th>
                      <th className="p-4 text-left font-medium">
                        SES sending
                        <span className="block font-normal text-muted-foreground text-xs">
                          Billed by AWS, à la carte
                        </span>
                      </th>
                      <th className="p-4 text-left font-medium">Wraps plan</th>
                      <th className="p-4 text-left font-medium text-primary">
                        Your total
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {pricingComparison.map((row) => (
                      <tr key={row.volume}>
                        <td className="p-4 font-medium">{row.volume}</td>
                        <td className="p-4 text-muted-foreground">
                          {row.sesRaw}
                        </td>
                        <td className="p-4 text-muted-foreground">
                          {row.wrapsTier}
                        </td>
                        <td className="p-4">
                          <span className="block font-medium text-primary">
                            {row.wrapsCost}
                          </span>
                          <span className="text-muted-foreground text-xs">
                            {row.wrapsBreakdown}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <div className="mt-4 space-y-2 text-muted-foreground text-sm">
              <p>
                <strong className="text-foreground">SES sending</strong> is
                charged by AWS at $0.10 per 1,000 emails on à la carte pricing.
                AWS defaults new accounts to the Essentials plan at $0.16 per
                1,000, so add roughly 60% to that column if you are on it. The
                supporting AWS services Wraps deploys — Lambda, DynamoDB, SQS,
                EventBridge, CloudWatch — bill at normal AWS rates and stay
                small at these volumes.
              </p>
              <p>
                <strong className="text-foreground">Wraps plans</strong> are
                flat: Free ($0/mo), Pro ($29/mo), Business ($199/mo). They are
                priced on AWS accounts, dashboard history and governance
                features, never on send volume.{" "}
                <a className="text-primary underline" href="/platform#pricing">
                  See what each plan includes
                </a>
              </p>
            </div>
          </section>

          {/* =========================================== */}
          {/* 6. DETAILED FEATURE COMPARISON */}
          {/* =========================================== */}
          <section className="mb-16">
            <h2 className="mb-6 font-heading font-semibold text-2xl tracking-tight">
              Detailed Feature Comparison
            </h2>

            <div className="space-y-6">
              {featureComparison.map((category) => (
                <div key={category.category}>
                  <h3 className="mb-2 font-semibold text-sm">
                    {category.category}
                  </h3>
                  <Card className="overflow-hidden py-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="p-4 text-left font-medium">
                              Feature
                            </th>
                            <th className="w-[140px] p-4 text-center font-medium sm:w-[200px]">
                              Raw SES
                            </th>
                            <th className="w-[140px] p-4 text-center font-medium text-primary sm:w-[200px]">
                              SES + Wraps
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {category.features.map((feature) => (
                            <tr key={feature.name}>
                              <td className="p-4">{feature.name}</td>
                              <td className="p-4 text-center">
                                <div className="flex flex-col items-center gap-1">
                                  <FeatureCell value={feature.ses} />
                                  {feature.sesNote && (
                                    <span className="text-muted-foreground text-xs">
                                      {feature.sesNote}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="p-4 text-center">
                                <div className="flex flex-col items-center gap-1">
                                  <FeatureCell value={feature.wraps} />
                                  {feature.wrapsNote && (
                                    <span className="text-muted-foreground text-xs">
                                      {feature.wrapsNote}
                                    </span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                </div>
              ))}
            </div>

            <p className="mt-4 text-muted-foreground text-xs">
              <Check className="mb-0.5 inline size-3 text-success" /> = built-in
              or included,{" "}
              <Minus className="mb-0.5 inline size-3 text-brand-text" /> =
              possible but requires manual setup,{" "}
              <X className="mb-0.5 inline size-3 text-destructive" /> = not
              available
            </p>
          </section>

          {/* =========================================== */}
          {/* 7. WHEN RAW SES IS ENOUGH */}
          {/* =========================================== */}
          <section className="mb-16">
            <h2 className="mb-4 font-heading font-semibold text-2xl tracking-tight">
              When Raw SES Is Enough
            </h2>
            <p className="mb-4 text-muted-foreground">
              Plenty of SES accounts never need anything around them.
            </p>
            <Card>
              <CardContent>
                <ul className="space-y-3">
                  {chooseSesReasons.map((reason) => (
                    <li className="flex items-start gap-3" key={reason}>
                      <Check className="mt-0.5 size-5 shrink-0 text-success" />
                      <span className="text-muted-foreground">{reason}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </section>

          {/* =========================================== */}
          {/* 8. WHEN TO CHOOSE WRAPS */}
          {/* =========================================== */}
          <section className="mb-16">
            <h2 className="mb-4 font-heading font-semibold text-2xl tracking-tight">
              When to Add Wraps
            </h2>
            <p className="mb-4 text-muted-foreground">
              You already decided SES is right. Wraps is for the part after that
              decision.
            </p>
            <Card className="border-primary/30">
              <CardContent>
                <ul className="space-y-3">
                  {chooseWrapsReasons.map((reason) => (
                    <li className="flex items-start gap-3" key={reason}>
                      <Check className="mt-0.5 size-5 shrink-0 text-primary" />
                      <span>{reason}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </section>

          {/* =========================================== */}
          {/* 9. GETTING STARTED */}
          {/* =========================================== */}
          <section className="mb-16">
            <div className="mb-4 flex items-center gap-3">
              <Terminal className="size-6 text-primary" />
              <h2 className="font-heading font-semibold text-2xl tracking-tight">
                Getting Started with Wraps
              </h2>
            </div>
            <p className="mb-6 text-muted-foreground">
              One command deploys the whole SES surface to your AWS account: SES
              configuration, domain identity, suppression, the event pipeline,
              rate monitoring and HTTPS open and click tracking. The free plan
              needs no card.
            </p>
            <Card className="bg-muted/30">
              <CardContent>
                <div className="rounded-lg bg-background p-4 font-mono text-sm">
                  <span className="text-muted-foreground">$</span>{" "}
                  <span>npx @wraps.dev/cli email init</span>
                </div>
                <p className="mt-4 text-muted-foreground text-sm">
                  The CLI walks through connecting your AWS account, verifying
                  the domain, creating DNS records and deploying. If you already
                  have SES set up, it detects your existing domain verification
                  and adds the supporting infrastructure on top: no DNS changes,
                  no reputation risk.
                </p>
                <p className="mt-3 text-muted-foreground text-sm">
                  If the account is still in the SES sandbox, init says so at
                  the end, explains what it means, and links the production
                  access request in your console. AWS decides that one. Nobody
                  selling software can decide it for you.
                </p>
              </CardContent>
            </Card>
          </section>

          {/* =========================================== */}
          <AlsoCompare current="/compare/amazon-ses-vs-wraps" />

          {/* CTA */}
          {/* =========================================== */}
          <section className="mb-16 rounded-lg border bg-muted/30 p-8 text-center">
            <h2 className="mb-2 font-heading font-semibold text-xl tracking-tight">
              Everything Amazon SES needs, including operations
            </h2>
            <p className="mb-6 text-muted-foreground">
              One command sets it up in your AWS account. The control plane runs
              it from there. Same SES, same bill, same reputation.
            </p>
            <div className="flex flex-col justify-center gap-4 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/docs/quickstart">
                  Get Started
                  <ArrowRight className="ml-2 size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/tools/ses-calculator">Calculate Your Costs</Link>
              </Button>
            </div>
          </section>

          {/* =========================================== */}
          {/* FOOTER NOTES */}
          {/* =========================================== */}
          <div className="space-y-3 text-muted-foreground text-xs">
            <p>
              <strong className="text-foreground">Last updated:</strong>{" "}
              September 2026. Pricing verified against{" "}
              <a
                className="underline transition-colors hover:text-foreground"
                href="https://aws.amazon.com/ses/pricing/"
                rel="noopener noreferrer"
                target="_blank"
              >
                aws.amazon.com/ses/pricing
              </a>
              .
            </p>
            <p>
              We update this page regularly. If anything here is inaccurate, let
              us know at{" "}
              <a
                className="underline transition-colors hover:text-foreground"
                href="mailto:support@wraps.dev"
              >
                support@wraps.dev
              </a>
              .
            </p>
          </div>
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}
