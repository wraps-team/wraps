import { Button } from "@wraps/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import { ArrowRight, Check, Minus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import { AlsoCompare } from "@/app/compare/components/also-compare";
import { CompareBreadcrumb } from "@/app/compare/components/breadcrumb";
import { CodeComparison } from "@/app/compare/components/code-comparison";
import { FeatureCell } from "@/app/compare/components/feature-cell";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { SectionKicker } from "@/app/landing/components/section-kicker";

export const metadata: Metadata = {
  title: "Mailgun vs Wraps - Compare Email Infrastructure Approaches",
  description:
    "Mailgun sends from their servers. Wraps sets up Amazon SES in your AWS account and runs it day to day. Compare setup, operations, pricing, and developer experience side by side.",
  openGraph: {
    title: "Mailgun vs Wraps | Wraps",
    description:
      "Mailgun sends from their servers. Wraps sets up Amazon SES in your AWS account and runs it day to day. Compare setup, operations, pricing, and developer experience.",
    url: "https://wraps.dev/compare/mailgun-vs-wraps",
  },
  twitter: {
    title: "Mailgun vs Wraps | Wraps",
    description:
      "Mailgun sends from their servers. Wraps sets up Amazon SES in your AWS account and runs it day to day. Compare setup, operations, pricing, and developer experience.",
  },
  alternates: {
    canonical: "https://wraps.dev/compare/mailgun-vs-wraps",
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
      name: "Mailgun vs Wraps",
      item: "https://wraps.dev/compare/mailgun-vs-wraps",
    },
  ],
};

const tldrComparison = [
  {
    dimension: "Infrastructure",
    mailgun: "Mailgun's servers",
    wraps: "Your AWS account",
  },
  {
    dimension: "Setup",
    mailgun: "Sign up, verify a domain, take an API key",
    wraps: "One command deploys the whole SES surface",
  },
  {
    dimension: "Day to day",
    mailgun: "Mailgun runs its own platform",
    wraps: "Hourly account health sweep, suppression, deliverability audits",
  },
  {
    dimension: "Sending cost",
    mailgun: "$15/mo (10K) to $90/mo (100K)",
    wraps: "Paid to AWS: $0.10/1K à la carte, $0.16/1K on Essentials",
  },
  {
    dimension: "Delivery history",
    mailgun: "30 days (Foundation), 60 days (Scale)",
    wraps: "Per-event history in your DynamoDB, retention you set",
  },
  {
    dimension: "If you cancel",
    mailgun: "Data deleted, sending stops",
    wraps: "Infrastructure keeps running",
  },
  {
    dimension: "Data residency",
    mailgun: "US or EU region",
    wraps: "Any AWS SES region",
  },
];

const pricingComparison = [
  {
    volume: "10K/mo",
    mailgunTier: "Basic",
    mailgunCost: "$15",
    wrapsTier: "Free",
    wrapsPlatform: "$0",
    awsSes: "$1",
    wrapsTotal: "$1",
    savings: "93%",
  },
  {
    volume: "50K/mo",
    mailgunTier: "Foundation",
    mailgunCost: "$35",
    wrapsTier: "Pro",
    wrapsPlatform: "$29",
    awsSes: "$5",
    wrapsTotal: "$34",
    savings: "",
  },
  {
    volume: "100K/mo",
    mailgunTier: "Foundation 100K / Scale",
    mailgunCost: "$75-90",
    wrapsTier: "Pro",
    wrapsPlatform: "$29",
    awsSes: "$10",
    wrapsTotal: "$39",
    savings: "48-57%",
  },
  {
    volume: "500K/mo",
    mailgunTier: "Scale 500K",
    mailgunCost: "$400",
    wrapsTier: "Pro",
    wrapsPlatform: "$29",
    awsSes: "$50",
    wrapsTotal: "$79",
    savings: "80%",
  },
];

const featureComparison = [
  {
    category: "Sending",
    features: [
      { name: "REST API", mailgun: true, wraps: true },
      { name: "SMTP relay", mailgun: true, wraps: true },
      { name: "Batch sending", mailgun: true, wraps: true },
      { name: "Scheduled sending", mailgun: true, wraps: true },
      { name: "Attachments", mailgun: true, wraps: true },
      {
        name: "Inbound email parsing",
        mailgun: "Mature, route-based",
        wraps: "EventBridge routing",
      },
    ],
  },
  {
    category: "Operations",
    features: [
      {
        name: "Setup",
        mailgun: "Verify a domain in the console",
        wraps: "One command into your AWS account",
      },
      {
        name: "Account health monitoring",
        mailgun: "Mailgun watches its own platform",
        wraps: "Hourly sweep of bounce and complaint rates, owners notified",
      },
      {
        name: "Suppression list",
        mailgun: true,
        wraps: "On at deploy, browse and clear",
      },
      {
        name: "Early-warning alarms",
        mailgun: "Webhook events from their platform",
        wraps:
          "CloudWatch alarms in your account at 2% bounces / 0.05% complaints (Production and Enterprise presets)",
      },
      {
        name: "Deliverability tooling",
        mailgun: "Email validation and deliverability suite",
        wraps: "DKIM, SPF, DMARC, MX, BIMI, blacklists, on demand",
      },
      {
        name: "Per-message event log",
        mailgun: "Log search, retention by plan",
        wraps: "Event log per message, history in your DynamoDB",
      },
      {
        name: "Production access",
        mailgun: "Granted by Mailgun at signup",
        wraps: "AWS decides; the CLI detects the sandbox and links the request",
      },
    ],
  },
  {
    category: "Tracking & Analytics",
    features: [
      { name: "Open tracking", mailgun: true, wraps: true },
      { name: "Click tracking", mailgun: true, wraps: true },
      { name: "Bounce handling", mailgun: true, wraps: true },
      { name: "Delivery events", mailgun: true, wraps: true },
      {
        name: "Data retention",
        mailgun: "30-60 days (plan-dependent)",
        wraps:
          "Per-event history in your DynamoDB, retention set in your deploy config; dashboard history 30 days to 1 year by plan",
      },
      {
        name: "Data export",
        mailgun: "Limited API access",
        wraps: "Events in your DynamoDB, contacts exportable",
      },
    ],
  },
  {
    category: "Infrastructure",
    features: [
      {
        name: "Infrastructure ownership",
        mailgun: "Mailgun",
        wraps: "You",
      },
      { name: "DKIM/SPF/DMARC", mailgun: true, wraps: true },
      {
        name: "Dedicated IPs",
        mailgun: "Included from $75/mo plans; extras $59/IP/mo",
        wraps: "Request via AWS",
      },
      {
        name: "Sending regions",
        mailgun: "US and EU",
        wraps: "All AWS SES regions",
      },
      {
        name: "Data residency compliance",
        mailgun: "US or EU only",
        wraps: true,
      },
      {
        name: "Self-hosted / BYOC",
        mailgun: false,
        wraps: true,
      },
    ],
  },
  {
    category: "Developer Experience",
    features: [
      { name: "TypeScript SDK", mailgun: true, wraps: true },
      {
        name: "Multi-language SDKs",
        mailgun: "6 languages",
        wraps: "TypeScript and Python",
      },
      {
        name: "CLI tooling",
        mailgun: false,
        wraps: true,
      },
      {
        name: "MCP server for coding agents",
        mailgun: false,
        wraps: true,
      },
      {
        name: "React Email support",
        mailgun: false,
        wraps: true,
      },
      {
        name: "Template editor",
        mailgun: "No visual editor",
        wraps: "AI designer + code editor",
      },
      {
        name: "Workflow / automation builder",
        mailgun: false,
        wraps: true,
      },
      {
        name: "Requires AWS account",
        mailgun: false,
        wraps: true,
      },
    ],
  },
  {
    category: "Platform",
    features: [
      {
        name: "Dashboard",
        mailgun: "Console with log search",
        wraps: "Dashboard with account health",
      },
      { name: "Webhooks", mailgun: true, wraps: "Unlimited" },
      {
        name: "Contact management",
        mailgun: "Mailing lists only",
        wraps: "Full contacts with unlimited storage",
      },
      {
        name: "Open source",
        mailgun: false,
        wraps: "AGPL-3.0, self-hostable",
      },
      {
        name: "Cancel impact",
        mailgun: "Data deleted",
        wraps: "Infrastructure persists",
      },
    ],
  },
];

const chooseMailgunReasons = [
  "You have no AWS account and no appetite for one. A hosted API is a different approach, and Mailgun is a good one",
  "You need SDKs in Ruby, .NET, PHP, or Java today",
  "Your app leans on Mailgun's route matching and inbound parsing pipeline",
  "You use email validation and log search and want them on one bill",
  "You want EU data residency without touching AWS yourself",
  "You're tied into third-party tools that ship a Mailgun connector",
];

const chooseWrapsReasons = [
  "You want SES and not the setup. One command deploys the whole surface into your own AWS account, non-destructively",
  "You want someone watching the account. Bounce and complaint rates are swept hourly against AWS's own lines, and owners and admins hear about it first",
  "You already have an AWS account, or your company does",
  "You want delivery history you keep, in your own DynamoDB, for as long as your deploy config says",
  "You're sending 100K+ emails a month and the difference shows up on the bill",
  "You want templates, broadcasts, segments, and workflows, not only a send endpoint",
  "You want the infrastructure to keep running whether or not you keep paying us",
];

const mailgunCode = `import FormData from "form-data";
import Mailgun from "mailgun.js";

const mailgun = new Mailgun(FormData);
const mg = mailgun.client({
  username: "api",
  key: process.env.MAILGUN_API_KEY,
});

await mg.messages.create("mg.example.com", {
  from: "hello@example.com",
  to: ["user@example.com"],
  subject: "Welcome",
  html: "<h1>Welcome to the app</h1>",
});`;

const wrapsCode = `import { WrapsEmail } from "@wraps.dev/email";

const email = new WrapsEmail();

await email.send({
  from: "hello@example.com",
  to: "user@example.com",
  subject: "Welcome",
  react: <WelcomeEmail />,
});`;

export default function MailgunVsWrapsPage() {
  return (
    <div className="min-h-screen bg-background">
      <LandingNavbar />

      <Script id="breadcrumb-jsonld" type="application/ld+json">
        {JSON.stringify(breadcrumbJsonLd)}
      </Script>

      <main className="container mx-auto px-4 pt-24 pb-16">
        <div className="mx-auto max-w-4xl">
          <CompareBreadcrumb competitor="Mailgun vs Wraps" />

          {/* Hero */}
          <section className="mb-16">
            <SectionKicker>Comparison</SectionKicker>
            <h1 className="mb-4 font-heading font-semibold text-4xl tracking-tight sm:text-5xl">
              Mailgun vs Wraps
            </h1>
            <p className="mb-4 max-w-2xl text-lg text-muted-foreground">
              <strong className="text-foreground">Mailgun</strong> has been
              sending email since 2010. API-first, SDKs in six languages, route
              matching and inbound parsing that is still among the best in the
              category, email validation, deliverability tooling, and a US or EU
              region you pick at signup. You hand it a message and its servers
              do the rest.
            </p>
            <p className="mb-4 max-w-2xl text-lg text-muted-foreground">
              <strong className="text-foreground">Wraps</strong> sets up Amazon
              SES in your own AWS account. One command deploys the whole surface
              — domain identity, DKIM, event capture, suppression, delivery
              history — alongside whatever SES you already run. Then the control
              plane runs it: your bounce and complaint rates swept hourly
              against AWS&apos;s own lines, a suppression list you can browse
              and clear, deliverability and blacklist audits, an event log per
              message.
            </p>
            <p className="max-w-2xl font-medium text-foreground text-lg">
              Most teams reach for a sending API because they don&apos;t want to
              deal with SES. That is the part Wraps does for you.
            </p>
          </section>

          {/* TL;DR Comparison Table */}
          <section className="mb-16">
            <h2 className="mb-6 font-heading font-semibold text-2xl tracking-tight">
              TL;DR
            </h2>
            <Card className="overflow-hidden py-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-4 text-left font-medium" />
                      <th className="p-4 text-left font-medium">Mailgun</th>
                      <th className="p-4 text-left font-medium text-primary">
                        Wraps
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {tldrComparison.map((row) => (
                      <tr key={row.dimension}>
                        <td className="p-4 font-medium">{row.dimension}</td>
                        <td className="p-4 text-muted-foreground">
                          {row.mailgun}
                        </td>
                        <td className="p-4 text-primary">{row.wraps}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </section>

          {/* Everything SES needs, including operations */}
          <section className="mb-16">
            <h2 className="mb-2 font-heading font-semibold text-2xl tracking-tight">
              Everything Amazon SES needs, including operations
            </h2>
            <p className="mb-6 text-muted-foreground">
              A sending API is a product you rent. SES is a primitive you own,
              and owning it is normally two jobs: standing it up, and running it
              afterwards. Wraps does both.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>We set it up</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="mb-4 text-muted-foreground text-sm">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      wraps email init
                    </code>{" "}
                    deploys the SES surface into your AWS account: domain
                    identity and DKIM records, EventBridge event capture, an SQS
                    queue with a dead letter queue, a Lambda processor, and a
                    DynamoDB table for delivery history.
                  </p>
                  <ul className="space-y-2 text-muted-foreground text-sm">
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" />
                      Non-destructive. Everything is namespaced{" "}
                      <code className="rounded bg-muted px-1 py-0.5">
                        wraps-email-*
                      </code>{" "}
                      and coexists with SES you already run
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" />
                      Account-level suppression switched on at deploy,
                      defaulting to bounces and complaints
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" />
                      CloudWatch alarms deployed into your account on the
                      Production and Enterprise presets, set below AWS&apos;s
                      own lines and paged to an email address or a webhook.
                      Starter preset deploys get none.
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" />
                      Sandbox detected at the end of the run, explained, with
                      the production access request linked
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" />
                      Access is an assumed role with an external ID and one-hour
                      sessions. No AWS keys stored anywhere
                    </li>
                  </ul>
                </CardContent>
              </Card>

              <Card className="border-primary/30">
                <CardHeader>
                  <CardTitle>The control plane runs it</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="mb-4 text-muted-foreground text-sm">
                    An hourly sweep reads your bounce and complaint rates
                    against the lines AWS publishes, classifies the account, and
                    notifies owners and admins. AWS can place an account under
                    review above 5% bounces or 0.1% complaints, and can pause
                    sending at 10% and 0.5%. You hear it from us first.
                  </p>
                  <ul className="space-y-2 text-muted-foreground text-sm">
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" />
                      Dashboard card draws both rates against those lines, next
                      to your 24-hour quota
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" />
                      Suppression is a list you browse and clear, not an opaque
                      vendor policy
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" />
                      <code className="rounded bg-muted px-1 py-0.5">
                        wraps email check
                      </code>{" "}
                      audits DKIM, SPF, DMARC, MX, MX-TLS, BIMI, RDAP, and
                      public blacklists
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" />
                      <code className="rounded bg-muted px-1 py-0.5">
                        wraps email doctor
                      </code>{" "}
                      names the remediation instead of describing the symptom
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </div>

            <p className="mt-6 text-muted-foreground text-sm">
              One limit, flat: Wraps cannot get you SES production access. The
              CLI finds the sandbox and links the request. AWS decides, on
              AWS&apos;s timeline. Mailgun hands you a sending account at
              signup, and for some teams that alone settles it.
            </p>
          </section>

          {/* The Architectural Difference */}
          <section className="mb-16">
            <h2 className="mb-2 font-heading font-semibold text-2xl tracking-tight">
              What runs where
            </h2>
            <p className="mb-6 text-muted-foreground">
              Mailgun is a hosted relay: your messages route through their
              infrastructure. Wraps splits into a data plane in your AWS account
              and a control plane hosted by us.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Mailgun</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="mb-4 text-muted-foreground text-sm">
                    Managed email API founded in 2010. Your messages go out
                    through Mailgun&apos;s shared or dedicated IP pools, with
                    routing, validation, and log search in the same console. One
                    vendor, one bill, nothing to deploy.
                  </p>
                  <ul className="space-y-2 text-muted-foreground text-sm">
                    <li className="flex items-start gap-2">
                      <Minus className="mt-1 size-3 shrink-0" />
                      Sending reputation lives in Mailgun&apos;s pools, not
                      yours
                    </li>
                    <li className="flex items-start gap-2">
                      <Minus className="mt-1 size-3 shrink-0" />
                      Data residency is US or EU
                    </li>
                    <li className="flex items-start gap-2">
                      <Minus className="mt-1 size-3 shrink-0" />
                      Delivery history ends when the plan&apos;s retention
                      window does
                    </li>
                    <li className="flex items-start gap-2">
                      <Minus className="mt-1 size-3 shrink-0" />
                      No visual template editor or workflow builder
                    </li>
                  </ul>
                </CardContent>
              </Card>

              <Card className="border-primary/30">
                <CardHeader>
                  <CardTitle>Wraps</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="mb-4 text-muted-foreground text-sm">
                    SES, EventBridge, SQS, Lambda, and DynamoDB run in your AWS
                    account, in the region you pick. That is the data plane:
                    sending, and a per-event delivery history you keep. The
                    control plane is hosted by us and holds the dashboard,
                    templates, contacts, broadcasts, and workflow state, plus a
                    row per message carrying recipient, subject, sender,
                    template variables, and delivery timestamps.
                  </p>
                  <ul className="space-y-2 text-muted-foreground text-sm">
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" />
                      One command deploys the whole surface, non-destructively
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" />
                      Account health swept hourly, owners and admins notified
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" />
                      Data residency in any AWS SES region
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" />
                      Infrastructure keeps running if you stop using Wraps
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* Pricing at Real Volumes */}
          <section className="mb-16">
            <h2 className="mb-2 font-heading font-semibold text-2xl tracking-tight">
              Pricing at real volumes
            </h2>
            <p className="mb-6 text-muted-foreground">
              Mailgun&apos;s paid plans run Basic at $15 for 10K, Foundation at
              $35 for 50K and $75 for 100K, and Scale from $90 at 100K to $400
              at 500K. Wraps charges a flat platform fee and you pay AWS for
              sending: $0.10 per 1,000 à la carte, or $0.16 per 1,000 on the
              Essentials plan new AWS accounts default to.
            </p>
            <Card className="overflow-hidden py-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-4 text-left font-medium">Volume</th>
                      <th className="p-4 text-left font-medium">Mailgun</th>
                      <th className="p-4 text-left font-medium text-primary">
                        Wraps (platform + AWS)
                      </th>
                      <th className="hidden p-4 text-left font-medium sm:table-cell" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {pricingComparison.map((row) => (
                      <tr key={row.volume}>
                        <td className="p-4 font-medium">{row.volume}</td>
                        <td className="p-4 text-muted-foreground">
                          <div>{row.mailgunCost}/mo</div>
                          <div className="text-xs">{row.mailgunTier}</div>
                        </td>
                        <td className="p-4 text-primary">
                          <div className="font-medium">{row.wrapsTotal}/mo</div>
                          <div className="text-xs text-muted-foreground">
                            {row.wrapsTier} ({row.wrapsPlatform}) + {row.awsSes}{" "}
                            SES
                          </div>
                        </td>
                        <td className="hidden p-4 sm:table-cell">
                          {row.savings ? (
                            <span className="font-mono text-2xs text-brand-text uppercase tracking-widest">
                              {row.savings} less
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
            <div className="mt-4 space-y-2 text-muted-foreground text-sm">
              <p>
                Wraps platform tiers: Free ($0/mo), Pro ($29/mo), Business
                ($199/mo). They are priced on AWS accounts, dashboard history,
                and governance features, not send volume. Every tier includes
                unlimited sends, contacts, domains, templates, and team members.
              </p>
              <p>
                Two things to check on the Mailgun side: Flex closed to new
                signups in December 2025 and the legacy rate doubled to $2 per
                1,000, and a dedicated IP is included only from the $75/mo plans
                up, with extras at $59/IP/mo.
              </p>
              <p>
                At 50K the two are level, which is worth saying plainly. The gap
                opens above that: at 100K, $39/mo against $75 to $90.
              </p>
            </div>
          </section>

          {/* Detailed Feature Comparison */}
          <section className="mb-16">
            <h2 className="mb-6 font-heading font-semibold text-2xl tracking-tight">
              Feature comparison
            </h2>
            {featureComparison.map((category) => (
              <Card
                className="mb-4 overflow-hidden py-0"
                key={category.category}
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="p-4 text-left font-semibold">
                          {category.category}
                        </th>
                        <th className="p-4 text-left font-medium">Mailgun</th>
                        <th className="p-4 text-left font-medium text-primary">
                          Wraps
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {category.features.map((feature) => (
                        <tr key={feature.name}>
                          <td className="p-4 text-muted-foreground">
                            {feature.name}
                          </td>
                          <td className="p-4">
                            <FeatureCell value={feature.mailgun} />
                          </td>
                          <td className="p-4">
                            <FeatureCell value={feature.wraps} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            ))}
          </section>

          {/* When to Choose Mailgun */}
          <section className="mb-16">
            <h2 className="mb-2 font-heading font-semibold text-2xl tracking-tight">
              When to choose Mailgun
            </h2>
            <p className="mb-6 text-muted-foreground">
              Fifteen years of sending is a real asset. Here&apos;s when it wins
              outright.
            </p>
            <Card>
              <CardContent>
                <ul className="space-y-3">
                  {chooseMailgunReasons.map((reason) => (
                    <li className="flex items-start gap-3" key={reason}>
                      <Check className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                      <span className="text-muted-foreground">{reason}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </section>

          {/* When to Choose Wraps */}
          <section className="mb-16">
            <h2 className="mb-2 font-heading font-semibold text-2xl tracking-tight">
              When to choose Wraps
            </h2>
            <p className="mb-6 text-muted-foreground">
              Wraps is built for teams who want SES underneath them and
              don&apos;t want to run it alone.
            </p>
            <Card className="border-primary/30">
              <CardContent>
                <ul className="space-y-3">
                  {chooseWrapsReasons.map((reason) => (
                    <li className="flex items-start gap-3" key={reason}>
                      <Check className="mt-0.5 size-5 shrink-0 text-success" />
                      <span>{reason}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </section>

          {/* Switching from Mailgun */}
          <section className="mb-16">
            <h2 className="mb-2 font-heading font-semibold text-2xl tracking-tight">
              Switching from Mailgun
            </h2>
            <p className="mb-6 text-muted-foreground">
              Mailgun uses its own SDK with a domain-centric API. Wraps uses a
              similar send signature with native React Email support. The
              migration is an SDK swap, a DNS update, and one CLI command to
              deploy infrastructure.
            </p>

            <CodeComparison
              after={{
                label: "After (Wraps)",
                filename: "send.tsx",
                language: "tsx",
                code: wrapsCode,
                highlight: true,
              }}
              before={{
                label: "Before (Mailgun)",
                filename: "send.ts",
                language: "typescript",
                code: mailgunCode,
              }}
            />

            <div className="mt-6 space-y-3">
              <h3 className="font-medium">Migration steps</h3>
              <ol className="list-inside list-decimal space-y-2 text-muted-foreground text-sm">
                <li>
                  Install the CLI:{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    npm install -g @wraps.dev/cli
                  </code>
                </li>
                <li>
                  Deploy infrastructure:{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    wraps email init
                  </code>
                </li>
                <li>
                  Swap{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    mailgun.js
                  </code>{" "}
                  for{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    @wraps.dev/email
                  </code>
                </li>
                <li>
                  Update DNS so your SPF and DKIM records point at your new SES
                  identity
                </li>
                <li>
                  Move inbound routing over with{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    wraps email inbound init
                  </code>
                </li>
                <li>
                  Run{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    wraps email check
                  </code>{" "}
                  against the domain before you cut traffic over
                </li>
              </ol>
              <p className="text-muted-foreground text-sm">
                HTML email templates work unchanged. If you use React Email,
                Wraps supports it natively, with no adapter. Your domain
                reputation travels with your DNS records; IP reputation stays
                with Mailgun if you were on their shared pool.
              </p>
            </div>
          </section>

          <AlsoCompare
            alternativesSlug="mailgun"
            current="/compare/mailgun-vs-wraps"
          />

          {/* CTA */}
          <section className="rounded-lg border bg-muted/30 p-8 text-center">
            <h2 className="mb-2 font-heading font-semibold text-xl tracking-tight">
              Set up SES in one command
            </h2>
            <p className="mb-6 text-muted-foreground">
              Free to start. No credit card required. Your AWS account, your
              infrastructure, AWS pricing.
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

          {/* Last Updated + Accuracy Note */}
          <div className="mt-12 border-t pt-6 text-center text-muted-foreground text-xs">
            <p>
              Last updated: September 2026. We update this page as pricing and
              features change.
            </p>
            <p className="mt-1">
              Seen something inaccurate?{" "}
              <a
                className="text-primary underline"
                href="mailto:support@wraps.dev"
              >
                Let us know at support@wraps.dev
              </a>
            </p>
          </div>
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}
