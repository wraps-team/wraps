import { Button } from "@wraps/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CircleDollarSign,
  GitFork,
  Server,
  Terminal,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import { Fragment } from "react";
import { AlsoCompare } from "@/app/compare/components/also-compare";
import { CompareBreadcrumb } from "@/app/compare/components/breadcrumb";
import { CodeComparison } from "@/app/compare/components/code-comparison";
import { FeatureCell } from "@/app/compare/components/feature-cell";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { SectionKicker } from "@/app/landing/components/section-kicker";
import { JsonLd } from "@/components/json-ld";

export const metadata: Metadata = {
  title:
    "SendGrid vs Wraps - Everything Amazon SES Needs, Including Operations",
  description:
    "Compare SendGrid and Wraps side by side. SendGrid rents you a sending API. Wraps sets up the whole Amazon SES surface in your own AWS account in one command, then runs it day to day. Pricing, features, and migration path.",
  openGraph: {
    title: "SendGrid vs Wraps | Wraps",
    description:
      "SendGrid rents you a sending API. Wraps sets up Amazon SES in your own AWS account in one command, then runs it day to day.",
    url: "https://wraps.dev/compare/sendgrid-vs-wraps",
  },
  twitter: {
    title: "SendGrid vs Wraps | Wraps",
    description:
      "SendGrid rents you a sending API. Wraps sets up Amazon SES in your own AWS account in one command, then runs it day to day.",
  },
  alternates: {
    canonical: "https://wraps.dev/compare/sendgrid-vs-wraps",
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
      name: "SendGrid vs Wraps",
      item: "https://wraps.dev/compare/sendgrid-vs-wraps",
    },
  ],
};

const tldrComparison = [
  {
    dimension: "Setup",
    sendgrid: "API key, then domain authentication",
    wraps: "One command, non-destructive, in your AWS account",
  },
  {
    dimension: "Day-to-day operations",
    sendgrid: "SendGrid's console and support desk",
    wraps: "Control plane: hourly account-health sweep, suppression, audits",
  },
  {
    dimension: "Where email sends from",
    sendgrid: "SendGrid's infrastructure",
    wraps: "SES in your AWS account",
  },
  {
    dimension: "Pricing (100K emails/mo)",
    sendgrid: "$89.95/mo",
    wraps: "$29 + $10 AWS = $39/mo",
  },
  {
    dimension: "Pricing (500K emails/mo)",
    sendgrid: "~$499/mo",
    wraps: "$29 + $50 AWS = $79/mo",
  },
  {
    dimension: "If you leave",
    sendgrid: "IP reputation stays with SendGrid",
    wraps: "The SES stack keeps running in your account",
  },
];

const pricingComparison = [
  {
    volume: "10K/mo",
    sendgridTier: "Essentials 50K",
    sendgridCost: "$19.95/mo",
    wrapsTier: "Free",
    wrapsPlatform: "$0",
    wrapsAws: "$1.00",
    wrapsTotal: "$1.00/mo",
    savings: "95%",
  },
  {
    volume: "50K/mo",
    sendgridTier: "Essentials 50K",
    sendgridCost: "$19.95/mo",
    wrapsTier: "Pro",
    wrapsPlatform: "$29",
    wrapsAws: "$5.00",
    wrapsTotal: "$34.00/mo",
    savings: null,
  },
  {
    volume: "100K/mo",
    sendgridTier: "Pro 100K",
    sendgridCost: "$89.95/mo",
    wrapsTier: "Pro",
    wrapsPlatform: "$29",
    wrapsAws: "$10.00",
    wrapsTotal: "$39.00/mo",
    savings: "57%",
  },
  {
    volume: "500K/mo",
    sendgridTier: "Pro 700K",
    sendgridCost: "~$499/mo",
    wrapsTier: "Pro",
    wrapsPlatform: "$29",
    wrapsAws: "$50.00",
    wrapsTotal: "$79.00/mo",
    savings: "84%",
  },
];

const featureComparison = [
  {
    category: "Sending",
    features: [
      {
        name: "Transactional email API",
        sendgrid: true,
        wraps: true,
      },
      {
        name: "SMTP relay",
        sendgrid: true,
        wraps: true,
      },
      {
        name: "Dedicated IP included",
        sendgrid: "Pro plan ($89.95+)",
        wraps: "Customer manages in SES",
      },
      {
        name: "Shared IP pool",
        sendgrid: "Yes (Essentials plan)",
        wraps: "Yes (SES default, dedicated IPs available)",
      },
    ],
  },
  {
    category: "Templates",
    features: [
      {
        name: "Dynamic templates",
        sendgrid: "Handlebars syntax",
        wraps: "React Email (JSX)",
      },
      {
        name: "Template editing",
        sendgrid: "Drag-and-drop editor",
        wraps: "AI designer + code editor",
      },
      {
        name: "Template versioning",
        sendgrid: true,
        wraps: true,
      },
    ],
  },
  {
    category: "Analytics & Events",
    features: [
      {
        name: "Delivery, open, click, bounce tracking",
        sendgrid: true,
        wraps: true,
      },
      {
        name: "Delivery history",
        sendgrid: "Held on SendGrid's servers, retention by plan",
        wraps:
          "Per-event history in your DynamoDB, retention set in your own deploy config, up to permanent",
      },
      {
        name: "Dashboard history",
        sendgrid: "Retention by plan",
        wraps: "30 days Free, 90 days Pro, 365 days Business",
      },
      {
        name: "Webhook event delivery",
        sendgrid: "Event webhook to your endpoint",
        wraps: "EventBridge (unlimited targets)",
      },
    ],
  },
  {
    category: "Developer Experience",
    features: [
      {
        name: "TypeScript SDK",
        sendgrid: "Official, ships types",
        wraps: "Strict TypeScript, full type safety",
      },
      {
        name: "Multi-language SDKs",
        sendgrid: "Seven official languages",
        wraps: "TypeScript and Python",
      },
      {
        name: "First-party CLI",
        sendgrid: false,
        wraps: "wraps, with interactive setup",
      },
      {
        name: "MCP server for agents",
        sendgrid: false,
        wraps: true,
      },
      {
        name: "Setup",
        sendgrid: "API key, then domain authentication and DNS propagation",
        wraps: "wraps email init, then DNS propagation",
      },
    ],
  },
  {
    category: "Operations",
    features: [
      {
        name: "Bounce and complaint rates watched",
        sendgrid: "SendGrid manages its own sending reputation",
        wraps: "Swept hourly against AWS's review and pause lines",
      },
      {
        name: "Alerts to your team",
        sendgrid: "Account notices from SendGrid",
        wraps: "Owners and admins notified, once per account per day",
      },
      {
        name: "Alarms in your own AWS account",
        sendgrid: false,
        wraps:
          "CloudWatch, below AWS's thresholds (Production and Enterprise presets; off on the Starter preset)",
      },
      {
        name: "Suppression list",
        sendgrid: true,
        wraps: "SES account-level, browse and clear in the dashboard",
      },
      {
        name: "Deliverability and blacklist audit",
        sendgrid: "Deliverability tooling on higher plans",
        wraps: "wraps email check, on demand",
      },
      {
        name: "Per-message log",
        sendgrid: "Activity feed, retention by plan",
        wraps: "Recipient, subject, variables, delivery and open timestamps",
      },
    ],
  },
  {
    category: "Platform & Ownership",
    features: [
      {
        name: "Sending infrastructure ownership",
        sendgrid: false,
        wraps: true,
      },
      {
        name: "Data portability",
        sendgrid: "CSV export only",
        wraps: "SES stack in your AWS; contacts and templates exportable",
      },
      {
        name: "Unlimited contacts",
        sendgrid: "Priced as a separate Marketing Campaigns plan",
        wraps: "Every plan",
      },
      {
        name: "Open source",
        sendgrid: false,
        wraps: "AGPL-3.0, self-hostable",
      },
      {
        name: "What happens when you leave",
        sendgrid: "IP reputation stays with SendGrid",
        wraps: "Infrastructure keeps running",
      },
    ],
  },
  {
    category: "Marketing Features",
    features: [
      {
        name: "Marketing campaigns",
        sendgrid: true,
        wraps: true,
      },
      {
        name: "A/B testing",
        sendgrid: "Single Sends only",
        wraps: false,
      },
      {
        name: "Automation workflows",
        sendgrid: "Marketing Campaigns plan",
        wraps: "Visual builder + TypeScript (every plan)",
      },
      {
        name: "Audience segmentation",
        sendgrid: true,
        wraps: true,
      },
    ],
  },
];

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "SendGrid vs Wraps",
  description:
    "Compare SendGrid and Wraps side by side. SendGrid rents you a sending API. Wraps sets up the whole Amazon SES surface in your own AWS account in one command, then runs it day to day.",
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
    "@id": "https://wraps.dev/compare/sendgrid-vs-wraps",
  },
};

const sendgridCode = `import sgMail from "@sendgrid/mail";

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

await sgMail.send({
  to: "user@example.com",
  from: "you@company.com",
  subject: "Hello",
  html: "<p>World</p>",
});`;

const wrapsCode = `import { WrapsEmail } from "@wraps.dev/email";

const email = new WrapsEmail();

await email.send({
  to: "user@example.com",
  from: "you@company.com",
  subject: "Hello",
  html: "<p>World</p>",
});`;

export default function SendGridVsWrapsPage() {
  return (
    <div className="min-h-screen bg-background">
      <LandingNavbar />
      <Script id="breadcrumb-jsonld" type="application/ld+json">
        {JSON.stringify(breadcrumbJsonLd)}
      </Script>
      <JsonLd data={articleSchema} />

      <main className="container mx-auto px-4 pt-24 pb-16">
        <div className="mx-auto max-w-4xl">
          <CompareBreadcrumb competitor="SendGrid vs Wraps" />

          {/* 1. Hero */}
          <section className="mb-16">
            <SectionKicker>Comparison</SectionKicker>
            <h1 className="mb-4 font-heading font-semibold text-4xl tracking-tight sm:text-5xl">
              SendGrid vs Wraps
            </h1>
            <p className="mb-4 max-w-2xl text-lg text-muted-foreground">
              SendGrid rents you a sending API. Wraps sets up Amazon SES in your
              own AWS account and then runs it for you.
            </p>
            <p className="mb-4 max-w-2xl text-muted-foreground">
              Most teams choose SendGrid because they do not want to deal with
              SES. That is a fair reason, and it is the one Wraps removes. One
              command deploys the whole SES surface into your account, without
              touching anything already there.
            </p>
            <p className="max-w-2xl font-medium text-foreground text-lg">
              Then the control plane runs it: bounce and complaint rates swept
              hourly against AWS's own review and pause lines, suppression you
              can browse and clear, deliverability and blacklist audits on
              demand, and a row in the log for every message you send.
            </p>
          </section>

          {/* 2. TL;DR Comparison Table */}
          <section className="mb-16">
            <h2 className="mb-6 font-heading font-semibold text-2xl tracking-tight">
              At a Glance
            </h2>
            <Card className="overflow-hidden py-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-4 text-left font-medium" />
                      <th className="p-4 text-left font-medium">SendGrid</th>
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
                          {row.sendgrid}
                        </td>
                        <td className="p-4 text-primary">{row.wraps}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </section>

          {/* 3. Everything SES needs, including operations */}
          <section className="mb-16">
            <div className="mb-6 flex items-center gap-3">
              <Terminal className="size-6 text-primary" />
              <h2 className="font-heading font-semibold text-2xl tracking-tight">
                Everything SES Needs, Including Operations
              </h2>
            </div>
            <p className="mb-6 text-muted-foreground">
              You already know SES is cheaper. The reason you are paying
              SendGrid is that SES arrives as a set of AWS primitives with
              nothing to run them. Wraps is the setup and the running.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Card className="border-primary/30">
                <CardHeader>
                  <CardTitle>One command sets it up</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-muted-foreground text-sm">
                    <li>
                      <code className="rounded bg-muted px-1">
                        wraps email init
                      </code>{" "}
                      deploys the SES surface into your AWS account: domain
                      identity, DKIM records, and the EventBridge, SQS, Lambda,
                      and DynamoDB pipeline that captures every delivery event.
                    </li>
                    <li>
                      SES account-level suppression is switched on at deploy,
                      defaulting to bounces and complaints.
                    </li>
                    <li>
                      init offers deployment presets. On Production and
                      Enterprise it also creates CloudWatch alarms in your
                      account, set below AWS's own lines so you get lead time
                      rather than a surprise: bounce warns at 2% and goes
                      critical at 4%, complaint warns at 0.05% and goes critical
                      at 0.08%, and any failed message in the dead-letter queue
                      raises one. They reach you by notification email, a
                      webhook, or both (Slack, Discord, PagerDuty). The Starter
                      preset deploys without alarms.
                    </li>
                    <li>
                      Nothing existing is modified. Every resource is namespaced{" "}
                      <code className="rounded bg-muted px-1">
                        wraps-email-
                      </code>{" "}
                      and it runs alongside SES you already have.
                    </li>
                    <li>
                      If the account is still in the SES sandbox, init says so
                      at the end, explains what it means, and links the console
                      request. Wraps cannot approve production access. Nobody
                      selling software can.
                    </li>
                  </ul>
                </CardContent>
              </Card>
              <Card className="border-primary/30">
                <CardHeader>
                  <CardTitle>The control plane runs it</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-muted-foreground text-sm">
                    <li>
                      Every hour Wraps reads your bounce and complaint rates and
                      draws them against AWS's own lines. AWS can place an
                      account under review above a 5% bounce rate and can pause
                      sending at 10%; for complaints those lines are 0.1% and
                      0.5%. Owners and admins get told, deduped to once per
                      account per day.
                    </li>
                    <li>
                      The dashboard shows the same two rates, your 24-hour quota
                      with an 80% warning line, and whether the account is in
                      the sandbox or under review.
                    </li>
                    <li>
                      Suppression is browsable and clearable, so you can see why
                      an address stopped receiving and let it back in.
                    </li>
                    <li>
                      <code className="rounded bg-muted px-1">
                        wraps email check
                      </code>{" "}
                      audits DKIM, SPF, DMARC, MX, MX-TLS, BIMI, RDAP, and
                      public blacklists on demand.{" "}
                      <code className="rounded bg-muted px-1">
                        wraps email doctor
                      </code>{" "}
                      reports what is wrong with a named fix.
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* 4. The Architectural Difference */}
          <section className="mb-16">
            <div className="mb-6 flex items-center gap-3">
              <Server className="size-6 text-primary" />
              <h2 className="font-heading font-semibold text-2xl tracking-tight">
                The Architectural Difference
              </h2>
            </div>
            <p className="mb-6 text-muted-foreground">
              This is not a feature gap. Both send email well. It is a different
              answer to who runs the infrastructure and where the data sits.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>SendGrid: Managed Multi-Tenant</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-muted-foreground text-sm">
                    <li>
                      Email sends from SendGrid's own infrastructure, at a scale
                      very few senders operate
                    </li>
                    <li>
                      All data (templates, contacts, analytics) stored on their
                      servers
                    </li>
                    <li>
                      Shared IP pools on the Essentials plan, which means your
                      deliverability moves with other customers on the pool
                    </li>
                    <li>
                      Dedicated IPs start at the Pro plan ($89.95/mo) and need
                      warming before you send volume through them
                    </li>
                    <li>
                      A deliverability team and a support desk stand behind all
                      of it, which is a real part of what you are buying
                    </li>
                    <li>
                      When you cancel, the IP reputation you built stays with
                      SendGrid
                    </li>
                  </ul>
                </CardContent>
              </Card>
              <Card className="border-primary/30">
                <CardHeader>
                  <CardTitle>Wraps: Your AWS Account</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-muted-foreground text-sm">
                    <li>
                      Email sends from SES in your AWS account. The domain
                      identity and the sender reputation are yours.
                    </li>
                    <li>
                      Per-event delivery history lands in your DynamoDB, with
                      the retention you set in your own deploy config, up to
                      permanent.
                    </li>
                    <li>
                      Contacts, templates, broadcasts, and a row per message
                      live in Wraps' Postgres. That row carries the recipient
                      address, subject, sender, template variables, and delivery
                      and open timestamps.
                    </li>
                    <li>
                      Wraps reaches your account by assuming a role with an
                      external ID, in one-hour sessions. No AWS access keys are
                      stored anywhere.
                    </li>
                    <li>
                      SES reputation is domain-based, so there is no IP warmup,
                      and dedicated IPs are available when you want them.
                    </li>
                    <li>
                      When you stop paying Wraps, the SES stack keeps running in
                      your AWS.
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* 5. Pricing at Real Volumes */}
          <section className="mb-16">
            <div className="mb-6 flex items-center gap-3">
              <CircleDollarSign className="size-6 text-primary" />
              <h2 className="font-heading font-semibold text-2xl tracking-tight">
                Pricing at Real Volumes
              </h2>
            </div>
            <p className="mb-6 text-muted-foreground">
              Wraps charges a flat platform fee for tooling (dashboard,
              analytics, templates). You pay AWS directly for sending at
              $0.10/1,000 emails on à la carte (AWS defaults new accounts to
              $0.16/1,000). SendGrid charges per plan tier with separate billing
              for marketing and transactional email.
            </p>
            <Card className="overflow-hidden py-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-4 text-left font-medium">Volume</th>
                      <th className="p-4 text-left font-medium">SendGrid</th>
                      <th className="p-4 text-left font-medium text-primary">
                        Wraps (Platform + AWS)
                      </th>
                      <th className="p-4 text-left font-medium">Savings</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {pricingComparison.map((row) => (
                      <tr key={row.volume}>
                        <td className="p-4 font-medium">{row.volume}</td>
                        <td className="p-4 text-muted-foreground">
                          <span>{row.sendgridCost}</span>
                          <span className="block text-muted-foreground text-xs">
                            {row.sendgridTier}
                          </span>
                        </td>
                        <td className="p-4">
                          <span className="font-medium text-primary">
                            {row.wrapsTotal}
                          </span>
                          <span className="block text-muted-foreground text-xs">
                            {row.wrapsPlatform} platform + {row.wrapsAws} AWS
                          </span>
                        </td>
                        <td className="p-4">
                          {row.savings ? (
                            <span className="font-mono text-2xs text-brand-text uppercase tracking-widest">
                              {row.savings}
                            </span>
                          ) : (
                            <span className="font-mono text-2xs text-muted-foreground uppercase tracking-widest">
                              Comparable
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <Card>
                <CardContent>
                  <h3 className="mb-1 font-medium text-sm">
                    Two plans, not one
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    SendGrid sells Marketing Campaigns as its own plan rather
                    than an add-on to the Email API. If you send both
                    transactional and marketing, you buy both.
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent>
                  <h3 className="mb-1 font-medium text-sm">
                    Priced by contacts
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    Marketing Campaigns is priced on how many contacts you
                    store, on top of the Email API plan. Wraps is flat:
                    unlimited contacts, domains, templates, and team members on
                    every plan.
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent>
                  <h3 className="mb-1 font-medium text-sm">No send meter</h3>
                  <p className="text-muted-foreground text-sm">
                    The Wraps fee does not move with volume. You pay AWS for
                    sending and Wraps a flat monthly fee. What changes by plan
                    is history retention, AWS account count, SSO, and support.
                  </p>
                </CardContent>
              </Card>
            </div>

            <p className="mt-4 text-muted-foreground text-sm">
              SendGrid pricing from{" "}
              <a
                className="text-primary underline"
                href="https://sendgrid.com/en-us/pricing"
                rel="noopener noreferrer"
                target="_blank"
              >
                sendgrid.com/pricing
              </a>
              . Wraps AWS cost = $0.10 per 1,000 emails via SES à la carte (AWS
              defaults new accounts to $0.16/1,000). All prices as of July 2026.{" "}
              <a
                className="text-primary underline"
                href="/tools/ses-calculator"
              >
                Calculate your costs
              </a>
            </p>
          </section>

          {/* 6. Detailed Feature Comparison */}
          <section className="mb-16">
            <h2 className="mb-6 font-heading font-semibold text-2xl tracking-tight">
              Detailed Feature Comparison
            </h2>
            <Card className="overflow-hidden py-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-4 text-left font-medium">Feature</th>
                      <th className="p-4 text-left font-medium">SendGrid</th>
                      <th className="p-4 text-left font-medium text-primary">
                        Wraps
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {featureComparison.map((group) => (
                      <Fragment key={group.category}>
                        <tr className="bg-muted/30">
                          <td
                            className="p-4 font-semibold text-xs uppercase tracking-wider"
                            colSpan={3}
                          >
                            {group.category}
                          </td>
                        </tr>
                        {group.features.map((feature) => (
                          <tr
                            className="border-b last:border-b-0"
                            key={feature.name}
                          >
                            <td className="p-4">{feature.name}</td>
                            <td className="p-4">
                              <FeatureCell value={feature.sendgrid} />
                            </td>
                            <td className="p-4">
                              <FeatureCell value={feature.wraps} />
                            </td>
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </section>

          {/* 7. When to Choose SendGrid */}
          <section className="mb-16">
            <div className="mb-6 flex items-center gap-3">
              <AlertTriangle className="size-6 text-muted-foreground" />
              <h2 className="font-heading font-semibold text-2xl tracking-tight">
                When to Choose SendGrid
              </h2>
            </div>
            <Card>
              <CardContent>
                <p className="mb-4 text-muted-foreground">
                  SendGrid has been sending email at very large scale for over a
                  decade. There are good reasons to pick it.
                </p>
                <ul className="space-y-3">
                  {[
                    "You have no AWS account and no appetite for one. Wraps deploys into your AWS; a hosted API does not ask you for that. Use one.",
                    "You want deliverability to be somebody else's job. SendGrid has a deliverability team, a support desk, and a sending reputation built over more than a decade.",
                    "You need a visual drag-and-drop editor or built-in A/B testing. Wraps has neither: templates are React Email TSX with an AI chat panel.",
                    "You need SDKs in Ruby, Go, Java, C#, or PHP. Wraps ships TypeScript and Python.",
                    "You are buying inside a Twilio enterprise contract with bundled pricing.",
                    "Non-developers on your team need to build and send email without touching code.",
                  ].map((point) => (
                    <li className="flex items-start gap-3" key={point}>
                      <Check className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                      <span className="text-sm">{point}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </section>

          {/* 8. When to Choose Wraps */}
          <section className="mb-16">
            <h2 className="mb-6 font-heading font-semibold text-2xl tracking-tight">
              When to Choose Wraps
            </h2>
            <Card className="border-primary/30">
              <CardContent>
                <ul className="space-y-3">
                  {[
                    "You want SES but not the setup. One command deploys the whole surface into your AWS account, without touching SES resources you already run.",
                    "You want someone watching the account. Bounce and complaint rates are checked hourly against AWS's own review and pause lines, and your owners and admins hear about it before it matters. On the Production and Enterprise presets, CloudWatch alarms sit in your own account too, at thresholds below AWS's.",
                    "You want the deliverability checks on hand. wraps email check runs DKIM, SPF, DMARC, MX, MX-TLS, BIMI, RDAP, and public blacklists on demand.",
                    "You are already on AWS and do not want another vendor in the sending path.",
                    "You care about cost at scale. At 500K emails a month Wraps runs $79 all in — the $29 plan plus about $50 of SES sending — against SendGrid's ~$499. That is $420 a month you keep, and the gap widens as you send more.",
                    "You want to keep the sending. SES, DynamoDB, Lambda, and EventBridge stay in your account if you stop paying us.",
                  ].map((point) => (
                    <li className="flex items-start gap-3" key={point}>
                      <Check className="mt-0.5 size-5 shrink-0 text-success" />
                      <span className="text-sm">{point}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </section>

          {/* 9. Switching from SendGrid */}
          <section className="mb-16">
            <div className="mb-6 flex items-center gap-3">
              <GitFork className="size-6 text-primary" />
              <h2 className="font-heading font-semibold text-2xl tracking-tight">
                Switching from SendGrid
              </h2>
            </div>
            <p className="mb-6 text-muted-foreground">
              Replace{" "}
              <code className="rounded bg-muted px-1">@sendgrid/mail</code> with{" "}
              <code className="rounded bg-muted px-1">@wraps.dev/email</code>.
              The call shape is close enough that most send sites change on one
              line.
            </p>

            <CodeComparison
              after={{
                label: "After (Wraps)",
                filename: "send.ts",
                language: "typescript",
                code: wrapsCode,
                highlight: true,
              }}
              before={{
                label: "Before (SendGrid)",
                filename: "send.ts",
                language: "typescript",
                code: sendgridCode,
              }}
            />

            <div className="mt-6 space-y-3">
              <h3 className="font-medium">Migration advantages with Wraps</h3>
              <ul className="space-y-2 text-muted-foreground text-sm">
                <li className="flex items-start gap-3">
                  <Check className="mt-0.5 size-5 shrink-0 text-success" />
                  <span>
                    No IP warmup. SES reputation is domain-based, so if you
                    already have SES sending history you keep it.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="mt-0.5 size-5 shrink-0 text-success" />
                  <span>
                    Domain verification happens in SES, in your own account.
                    There are no third-party DNS records to maintain.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="mt-0.5 size-5 shrink-0 text-success" />
                  <span>
                    Suppression is handled from day one. SES account-level
                    suppression is switched on at deploy, defaulting to bounces
                    and complaints, and you can browse and clear the list in the
                    dashboard. Moving your existing SendGrid suppression list
                    across is still on you.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="mt-0.5 size-5 shrink-0 text-success" />
                  <span>
                    One command deploys the stack. Run{" "}
                    <code className="rounded bg-muted px-1">
                      wraps email init
                    </code>
                    , then{" "}
                    <code className="rounded bg-muted px-1">
                      wraps email check
                    </code>{" "}
                    to confirm DKIM, SPF, and DMARC before you cut traffic over.
                  </span>
                </li>
              </ul>
            </div>
          </section>

          <AlsoCompare
            alternativesSlug="sendgrid"
            current="/compare/sendgrid-vs-wraps"
          />

          {/* CTA */}
          <section className="rounded-lg border bg-muted/30 p-8 text-center">
            <h2 className="mb-2 font-heading font-semibold text-xl tracking-tight">
              Set up SES in one command
            </h2>
            <p className="mb-6 text-muted-foreground">
              <code className="rounded bg-muted px-1">wraps email init</code>{" "}
              deploys the whole SES surface to your AWS account, and the control
              plane takes it from there. The Free plan has no send meter and 30
              days of dashboard history.
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

          {/* Footer note */}
          <div className="mt-12 space-y-2 text-center text-muted-foreground text-xs">
            <p>Last updated: September 2026</p>
            <p>
              We update this page regularly. If anything here is inaccurate,{" "}
              <a
                className="text-primary underline"
                href="mailto:support@wraps.dev"
              >
                let us know
              </a>
              . All SendGrid pricing and features sourced from{" "}
              <a
                className="text-primary underline"
                href="https://sendgrid.com/en-us/pricing"
                rel="noopener noreferrer"
                target="_blank"
              >
                sendgrid.com
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
