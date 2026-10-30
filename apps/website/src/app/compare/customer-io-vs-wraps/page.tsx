import { Button } from "@wraps/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import {
  ArrowRight,
  Check,
  CircleAlert,
  Cloud,
  DollarSign,
  Server,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import { Fragment } from "react";
import { AlsoCompare } from "@/app/compare/components/also-compare";
import { CompareBreadcrumb } from "@/app/compare/components/breadcrumb";
import { FeatureCell } from "@/app/compare/components/feature-cell";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { SectionKicker } from "@/app/landing/components/section-kicker";
import { JsonLd } from "@/components/json-ld";

export const metadata: Metadata = {
  title: "Customer.io vs Wraps - Contact-Based Pricing vs Unlimited Contacts",
  description:
    "Compare Customer.io and Wraps. Customer.io charges per contact and hosts everything. Wraps sets up the whole SES surface in your AWS account in one command, then runs it day to day from one control plane, with unlimited contacts on every tier.",
  openGraph: {
    title: "Customer.io vs Wraps | Wraps",
    description:
      "Contact-based pricing vs unlimited contacts. Rented infrastructure vs SES in your own AWS account, set up in one command and operated from one control plane.",
    url: "https://wraps.dev/compare/customer-io-vs-wraps",
  },
  twitter: {
    title: "Customer.io vs Wraps | Wraps",
    description:
      "Contact-based pricing vs unlimited contacts. Rented infrastructure vs SES in your own AWS account, set up in one command and operated from one control plane.",
  },
  alternates: {
    canonical: "https://wraps.dev/compare/customer-io-vs-wraps",
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
      name: "Customer.io vs Wraps",
      item: "https://wraps.dev/compare/customer-io-vs-wraps",
    },
  ],
};

const tldrRows = [
  {
    dimension: "Setup",
    customerio: "Sign up, connect a domain, build in their UI.",
    wraps:
      "One command deploys the whole SES surface into your AWS account, non-destructively.",
  },
  {
    dimension: "Running it day to day",
    customerio:
      "They operate the sending platform. You operate campaigns inside it.",
    wraps:
      "One control plane: bounce and complaint rates swept hourly, suppression, deliverability audits, a per-message event log.",
  },
  {
    dimension: "Pricing model",
    customerio: "Per contact (profile). High-watermark billing.",
    wraps: "Flat monthly fee by tier. Unlimited contacts on every tier.",
  },
  {
    dimension: "Starting price",
    customerio: "$100/mo for 5,000 profiles",
    wraps: "Free ($0/mo) + AWS SES at $0.10/1K à la carte",
  },
  {
    dimension: "Infrastructure",
    customerio: "Managed SaaS (GCP). They host everything.",
    wraps: "SES, DynamoDB, Lambda, and EventBridge in your AWS account.",
  },
  {
    dimension: "Where the data sits",
    customerio: "Customer.io hosts your data. Bulk export requires Premium.",
    wraps:
      "Delivery events in your DynamoDB, retention you set. Contacts, templates, and workflow state in Wraps, exportable anytime.",
  },
  {
    dimension: "If you leave",
    customerio: "Workflows, templates, and data are proprietary.",
    wraps: "Standard AWS SES underneath. The sending infrastructure stays.",
  },
  {
    dimension: "Dedicated IPs",
    customerio: "Premium only ($1,000/mo min).",
    wraps: "Your SES account (shared default, dedicated available)",
  },
];

const pricingRows = [
  {
    contacts: "1,000",
    emails: "10,000",
    customerio: "$100",
    customerioNote: "Essentials (5K profiles incl.)",
    wraps: "$1",
    wrapsNote: "Free tier + $1 SES",
  },
  {
    contacts: "5,000",
    emails: "50,000",
    customerio: "$100",
    customerioNote: "Essentials (at profile limit)",
    wraps: "$34",
    wrapsNote: "$29 Pro + $5 SES",
  },
  {
    contacts: "10,000",
    emails: "100,000",
    customerio: "$145",
    customerioNote: "$100 + 5K overage at $0.009/profile",
    wraps: "$39",
    wrapsNote: "$29 Pro + $10 SES",
  },
  {
    contacts: "50,000",
    emails: "500,000",
    customerio: "$505",
    customerioNote: "$100 + 45K overage at $0.009/profile",
    wraps: "$249",
    wrapsNote: "$199 Business + $50 SES",
  },
  {
    contacts: "100,000",
    emails: "1,000,000",
    customerio: "$955",
    customerioNote: "$100 + 95K overage at $0.009/profile",
    wraps: "$299",
    wrapsNote: "$199 Business + $100 SES",
  },
];

const featureRows: {
  category: string;
  features: {
    name: string;
    customerio: "yes" | "no" | "partial" | string;
    wraps: "yes" | "no" | "partial" | string;
  }[];
}[] = [
  {
    category: "Sending",
    features: [
      {
        name: "Transactional email",
        customerio: "yes",
        wraps: "yes",
      },
      {
        name: "Broadcast / marketing email",
        customerio: "yes",
        wraps: "yes",
      },
      {
        name: "SMS",
        customerio: "Premium+ only, pricing not public",
        wraps: "yes",
      },
      {
        name: "Push notifications",
        customerio: "yes",
        wraps: "no",
      },
      {
        name: "In-app messaging",
        customerio: "yes",
        wraps: "no",
      },
    ],
  },
  {
    category: "Templates & DX",
    features: [
      {
        name: "Code-first templates (React Email)",
        customerio: "no",
        wraps: "yes",
      },
      {
        name: "Template editing",
        customerio: "Drag-and-drop editor",
        wraps: "AI designer + code editor",
      },
      {
        name: "TypeScript SDK",
        customerio: "JS with types bolted on",
        wraps: "TypeScript-first",
      },
      {
        name: "CLI tooling",
        customerio: "no",
        wraps: "yes",
      },
      {
        name: "Local development workflow",
        customerio: "no",
        wraps: "yes",
      },
    ],
  },
  {
    category: "Automation",
    features: [
      {
        name: "Visual workflow builder",
        customerio: "yes",
        wraps: "yes",
      },
      {
        name: "Workflow node types",
        customerio: "Email, SMS, push, in-app, webhook, delay, condition",
        wraps:
          "Email, SMS, delay, condition, wait-for-event, update contact, topic mgmt",
      },
      {
        name: "Workflows-as-code (CLI)",
        customerio: "no",
        wraps: "TypeScript DSL, Git-versioned",
      },
      {
        name: "AI workflow generation",
        customerio: "no",
        wraps: "yes",
      },
      {
        name: "A/B testing",
        customerio: "yes",
        wraps: "no",
      },
      {
        name: "Segmentation",
        customerio: "Behavioral segmentation with a built-in CDP",
        wraps:
          "Nested AND/OR filters on attributes, topics, and events (triggered, not triggered, within N days)",
      },
      {
        name: "Event-driven workflows",
        customerio: "yes",
        wraps: "yes",
      },
      {
        name: "Broadcasts and scheduled campaigns",
        customerio: "yes",
        wraps: "yes",
      },
      {
        name: "Topics and hosted preference centre",
        customerio: "yes",
        wraps: "yes",
      },
    ],
  },
  {
    category: "Operations",
    features: [
      {
        name: "Who owns the sending reputation",
        customerio: "Customer.io, on their IP pools",
        wraps: "You, on your own SES account",
      },
      {
        name: "Bounce and complaint rates against AWS's review and pause lines",
        customerio: "Not applicable",
        wraps: "Swept hourly, owners and admins notified",
      },
      {
        name: "CloudWatch alarms in your own AWS account",
        customerio: "Not applicable",
        wraps:
          "Production and Enterprise presets, off for Starter. Bounce warns at 2%, complaint at 0.05%, well under AWS's lines. Email or webhook.",
      },
      {
        name: "Suppression list you can browse and clear",
        customerio: "Theirs, inside their platform",
        wraps: "Your SES account-level list, wired on at deploy",
      },
      {
        name: "DKIM, SPF, DMARC, and blacklist audits",
        customerio: "They manage deliverability for you",
        wraps: "On demand via the CLI",
      },
      {
        name: "Per-message event log",
        customerio: "yes",
        wraps: "yes",
      },
      {
        name: "Inbound email",
        customerio: "Not documented",
        wraps: "yes",
      },
    ],
  },
  {
    category: "Infrastructure & Data",
    features: [
      {
        name: "Unlimited contacts",
        customerio: "no",
        wraps: "yes",
      },
      {
        name: "Dedicated IPs",
        customerio: "Premium+ only ($1K/mo min)",
        wraps: "Available via SES (all tiers)",
      },
      {
        name: "Sending infra in your cloud account",
        customerio: "no",
        wraps: "yes",
      },
      {
        name: "Self-hosted / BYOC",
        customerio: "no",
        wraps: "yes",
      },
      {
        name: "No vendor lock-in",
        customerio: "no",
        wraps: "yes",
      },
    ],
  },
  {
    category: "Integrations & Ecosystem",
    features: [
      {
        name: "Native integrations (100+)",
        customerio: "yes",
        wraps: "no",
      },
      {
        name: "Data warehouse sync",
        customerio: "Premium+ only",
        wraps: "Events in your DynamoDB, contacts exportable",
      },
      {
        name: "Webhook support",
        customerio: "yes",
        wraps: "yes",
      },
      {
        name: "Send rate ceiling",
        customerio: "Their platform's published API rate limits",
        wraps: "Your own SES quota, raised by asking AWS",
      },
      {
        name: "Python SDK",
        customerio: "yes",
        wraps: "yes",
      },
      {
        name: "MCP server for coding agents",
        customerio: "Not documented",
        wraps: "yes",
      },
    ],
  },
];

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "Customer.io vs Wraps",
  description:
    "Compare Customer.io and Wraps. Customer.io charges per contact and hosts everything. Wraps sets up the whole SES surface in your AWS account in one command, then runs it day to day from one control plane, with unlimited contacts on every tier.",
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

export default function CustomerIoVsWrapsPage() {
  return (
    <div className="min-h-screen bg-background">
      <LandingNavbar />
      <Script id="breadcrumb-jsonld" type="application/ld+json">
        {JSON.stringify(breadcrumbJsonLd)}
      </Script>
      <JsonLd data={articleSchema} />

      <main className="container mx-auto px-4 pt-24 pb-16">
        <div className="mx-auto max-w-4xl">
          <CompareBreadcrumb competitor="Customer.io vs Wraps" />

          {/* Hero */}
          <section className="mb-16">
            <SectionKicker>Comparison</SectionKicker>
            <h1 className="mb-4 font-heading font-semibold text-4xl tracking-tight sm:text-5xl">
              Customer.io vs Wraps
            </h1>
            <p className="mb-3 max-w-2xl text-lg text-muted-foreground">
              Customer.io is a marketing automation platform. You rent it, you
              pay per contact, and they host everything. Wraps puts the same
              surface on Amazon SES in your own AWS account: one command sets it
              all up, then one control plane runs it day to day.
            </p>
            <p className="max-w-2xl text-muted-foreground">
              Both send lifecycle email from workflows, broadcasts, segments,
              and templates. The difference is who operates the sending
              infrastructure, and what it costs when your list grows.
            </p>
          </section>

          {/* The two beats */}
          <section className="mb-16">
            <h2 className="mb-2 font-heading font-semibold text-2xl tracking-tight">
              Everything Amazon SES needs, including operations
            </h2>
            <p className="mb-6 max-w-2xl text-muted-foreground">
              Most teams rent a platform like Customer.io because they do not
              want to deal with SES. That is the part we made easy.
            </p>
            <div className="grid gap-6 sm:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>We set everything up</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="mb-4 text-muted-foreground text-sm">
                    One command deploys the whole SES surface into your AWS
                    account: domain identities and DKIM, EventBridge, SQS with a
                    dead letter queue, Lambda, DynamoDB, and the IAM roles that
                    tie them together. Every resource is namespaced{" "}
                    <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                      wraps-email-
                    </code>
                    , so it coexists with SES you already run and changes
                    nothing you already have.
                  </p>
                  <p className="text-muted-foreground text-sm">
                    Wraps reaches your account by assuming a role with an
                    external ID, in one-hour sessions. No AWS access keys are
                    stored anywhere.
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>The control plane runs it</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="mb-4 text-muted-foreground text-sm">
                    Amazon can place an account under review once its bounce
                    rate passes 5% and pause sending at 10%, and 0.1% and 0.5%
                    for complaints. The AWS console will not draw your rates
                    against those lines. Wraps does, swept hourly, with owners
                    and admins notified when one is crossed.
                  </p>
                  <p className="text-muted-foreground text-sm">
                    Same surface for the rest of the daily job: suppression you
                    can browse and clear, DKIM, SPF, DMARC, and blacklist audits
                    from the CLI, and a per-message event log. Bounces and
                    complaints are suppressed on the way in, wired on at deploy.
                  </p>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* TL;DR Comparison Table */}
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
                      <th className="p-4 text-left font-medium">Customer.io</th>
                      <th className="p-4 text-left font-medium text-primary">
                        Wraps
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {tldrRows.map((row) => (
                      <tr key={row.dimension}>
                        <td className="p-4 font-medium">{row.dimension}</td>
                        <td className="p-4 text-muted-foreground">
                          {row.customerio}
                        </td>
                        <td className="p-4">{row.wraps}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </section>

          {/* Sound Familiar? */}
          <section className="mb-16">
            <h2 className="mb-2 font-heading font-semibold text-2xl tracking-tight">
              Sound Familiar?
            </h2>
            <p className="mb-6 text-muted-foreground">
              The objection that comes up most is the pricing model, not the
              product. Feedback from Customer.io users on Trustpilot and
              independent reviews.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {userQuotes.map((item) => (
                <Card key={item.quote}>
                  <CardContent>
                    <blockquote className="mb-3 border-l-2 border-primary/30 pl-4 text-sm italic">
                      &ldquo;{item.quote}&rdquo;
                    </blockquote>
                    <p className="text-muted-foreground text-xs">
                      &mdash; {item.source}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          {/* The Architectural Difference */}
          <section className="mb-16">
            <h2 className="mb-6 font-heading font-semibold text-2xl tracking-tight">
              The Architectural Difference
            </h2>
            <div className="grid gap-6 sm:grid-cols-2">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <Cloud className="size-6 text-muted-foreground" />
                    <CardTitle>Customer.io</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="mb-4 text-muted-foreground text-sm">
                    Your contacts, events, templates, and message history live
                    on Customer.io&apos;s infrastructure (GCP). Emails send from
                    their shared or dedicated IP pools. You access everything
                    through their web UI and API.
                  </p>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-start gap-2">
                      <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
                      <span>
                        Bulk data export requires Premium tier ($1,000/mo)
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
                      <span>No self-hosted or BYOC option available</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
                      <span>Workflows and templates cannot be exported</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <Server className="size-6 text-primary" />
                    <CardTitle>Wraps</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="mb-4 text-muted-foreground text-sm">
                    Wraps deploys SES, DynamoDB, Lambda, and EventBridge
                    directly to your AWS account. You own the sending
                    infrastructure and the sending reputation. Wraps is the
                    control plane; your AWS is the data plane.
                  </p>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" />
                      <span>
                        Sending and per-event delivery history stay in your AWS
                        account, at a retention you set in your own deploy
                        config
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" />
                      <span>
                        Contacts, templates, broadcasts, workflow state, and a
                        row per message live in Wraps&apos; Postgres, exportable
                        anytime
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" />
                      <span>
                        If you stop using Wraps, the infrastructure keeps
                        running
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" />
                      <span>
                        Open source, AGPL-3.0, and self-hostable if you want the
                        control plane too
                      </span>
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* Pricing at Real Volumes */}
          <section className="mb-16">
            <div className="mb-2 flex items-center gap-3">
              <DollarSign className="size-6 text-primary" />
              <h2 className="font-heading font-semibold text-2xl tracking-tight">
                Pricing at Real Volumes
              </h2>
            </div>
            <p className="mb-6 text-muted-foreground">
              Customer.io prices by contacts (profiles), not email volume. The
              table below assumes ~10 emails per contact per month. Customer.io
              uses high-watermark billing: you pay for the peak contact count
              during the month, even if you delete contacts later.
            </p>
            <Card className="overflow-hidden py-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-4 text-left font-medium">Contacts</th>
                      <th className="p-4 text-left font-medium">Emails/mo</th>
                      <th className="p-4 text-left font-medium">Customer.io</th>
                      <th className="p-4 text-left font-medium text-primary">
                        Wraps
                      </th>
                      <th className="p-4 text-left font-medium">You keep</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {pricingRows.map((row) => {
                      const cioLow = Number.parseInt(
                        row.customerio.replace(/[$,+]/g, "").split("-")[0],
                        10
                      );
                      const wrapsNum = Number.parseInt(
                        row.wraps.replace(/[$,]/g, ""),
                        10
                      );
                      const savingsPercent = Math.round(
                        ((cioLow - wrapsNum) / cioLow) * 100
                      );
                      return (
                        <tr key={row.contacts}>
                          <td className="p-4 font-medium">{row.contacts}</td>
                          <td className="p-4 text-muted-foreground">
                            {row.emails}
                          </td>
                          <td className="p-4">
                            <div>{row.customerio}/mo</div>
                            <div className="text-muted-foreground text-xs">
                              {row.customerioNote}
                            </div>
                          </td>
                          <td className="p-4 text-primary">
                            <div className="font-medium">{row.wraps}/mo</div>
                            <div className="text-muted-foreground text-xs">
                              {row.wrapsNote}
                            </div>
                          </td>
                          <td className="p-4">
                            <div className="font-medium text-brand-text">
                              ${(cioLow - wrapsNum).toLocaleString("en-US")}/mo
                            </div>
                            <div className="font-mono text-2xs text-muted-foreground uppercase tracking-widest">
                              {savingsPercent}% less
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
            <p className="mt-4 text-muted-foreground text-sm">
              Wraps pricing: Free ($0/mo), Pro ($29/mo), Business ($199/mo) — a
              flat monthly fee by tier, not by contact or event volume. AWS SES
              costs $0.10 per 1,000 emails on à la carte (AWS defaults new
              accounts to $0.16), paid directly to AWS.{" "}
              <a
                className="text-primary underline"
                href="/tools/ses-calculator"
              >
                Calculate your exact costs
              </a>
            </p>
          </section>

          {/* Detailed Feature Comparison */}
          <section className="mb-16">
            <h2 className="mb-6 font-heading font-semibold text-2xl tracking-tight">
              Feature Comparison
            </h2>
            <Card className="overflow-hidden py-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-4 text-left font-medium">Feature</th>
                      <th className="p-4 text-left font-medium">Customer.io</th>
                      <th className="p-4 text-left font-medium text-primary">
                        Wraps
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {featureRows.map((group) => (
                      <Fragment key={group.category}>
                        <tr className="border-b bg-muted/30">
                          <td
                            className="p-4 font-semibold text-xs uppercase tracking-wider"
                            colSpan={3}
                          >
                            {group.category}
                          </td>
                        </tr>
                        {group.features.map((feature) => (
                          <tr className="border-b" key={feature.name}>
                            <td className="p-4">{feature.name}</td>
                            <td className="p-4">
                              <FeatureCell value={feature.customerio} />
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

          {/* When to Choose Customer.io */}
          <section className="mb-16">
            <h2 className="mb-4 font-heading font-semibold text-2xl tracking-tight">
              When to Choose Customer.io
            </h2>
            <p className="mb-4 text-muted-foreground">
              Customer.io is a marketing automation platform, not just an email
              sending service. It is the better choice when:
            </p>
            <Card>
              <CardContent>
                <ul className="space-y-3">
                  {[
                    "A non-engineer owns email day to day. Customer.io is easier to operate without a developer, and that is worth paying for.",
                    "You have no AWS account and no appetite for one. Wraps deploys into your AWS; if that is not on the table, this is a different approach.",
                    "You need multi-channel orchestration across email, SMS, push, and in-app on a single workflow canvas",
                    "A built-in CDP and its behavioral segmentation are core requirements",
                    "You want 100+ native integrations with tools like Salesforce, HubSpot, Segment, and ad networks",
                    "A/B testing on campaigns and workflows is critical to your marketing strategy",
                    "You need a dedicated CSM, a structured onboarding program, and enterprise support SLAs",
                  ].map((point) => (
                    <li className="flex items-start gap-3" key={point}>
                      <Check className="mt-0.5 size-5 shrink-0 text-success" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
            <p className="mt-4 text-muted-foreground text-sm">
              Wraps has no A/B testing. If split-testing subject lines and
              workflow branches is how your team works, that gap is real.
            </p>
          </section>

          {/* When to Choose Wraps */}
          <section className="mb-16">
            <h2 className="mb-4 font-heading font-semibold text-2xl tracking-tight">
              When to Choose Wraps
            </h2>
            <p className="mb-4 text-muted-foreground">
              Wraps runs the full lifecycle surface on SES in your own AWS
              account: workflows, broadcasts, segments, templates, topics, and a
              hosted preference centre. It is the better choice when:
            </p>
            <Card>
              <CardContent>
                <ul className="space-y-3">
                  {[
                    "You want SES but not the setup. One command deploys the identities, event pipeline, and IAM roles into your AWS account without touching anything already there.",
                    "You want someone watching the account. Bounce and complaint rates are drawn against the lines AWS reviews and pauses at and swept hourly, with suppression, deliverability audits, and a per-message event log on the same surface.",
                    "Contact-based pricing is punishing your growth. Large lists with many inactive contacts cost the same as small ones here.",
                    "Your team is developer-led and prefers code-first templates in React Email over drag-and-drop editors",
                    "You want workflows you can version-control. There is a visual flow builder, and a TypeScript CLI that defines, validates, and pushes the same workflows from code.",
                    "You need dedicated sending IPs without moving to a premium tier to get them",
                    "You want the sending infrastructure to keep running if you leave the platform",
                  ].map((point) => (
                    <li className="flex items-start gap-3" key={point}>
                      <Check className="mt-0.5 size-5 shrink-0 text-primary" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </section>

          {/* Switching from Customer.io */}
          <section className="mb-16">
            <h2 className="mb-4 font-heading font-semibold text-2xl tracking-tight">
              Switching from Customer.io
            </h2>
            <p className="mb-6 text-muted-foreground">
              Migration from Customer.io to Wraps is straightforward on the
              infrastructure side because Wraps deploys fresh SES infrastructure
              to your AWS account. No conflicts with your existing setup.
            </p>
            <div className="space-y-4">
              {[
                {
                  step: "1",
                  title: "Export your contacts",
                  description:
                    "Export profiles from Customer.io via CSV or API, then import them into Wraps. Contacts are unlimited on every tier, so list size does not change the bill.",
                },
                {
                  step: "2",
                  title: "Set up Wraps",
                  description:
                    "Run `npx @wraps.dev/cli email init`. It deploys SES, DynamoDB, and the event pipeline to your AWS account, namespaced so nothing existing is touched. DNS verification uses CNAME records, so there is no conflict with Customer.io's subdomain records. If the account is still in the SES sandbox, init says so and links the production access request.",
                },
                {
                  step: "3",
                  title: "Rebuild templates",
                  description:
                    "Migrate from Liquid templates to React Email via the @wraps.dev/email SDK. For developer teams, this is typically an upgrade in DX.",
                },
                {
                  step: "4",
                  title: "Switch sending",
                  description:
                    "Replace Customer.io API calls with the Wraps SDK. Warm up your new SES sending identity over 1-4 weeks by gradually increasing volume.",
                },
              ].map((item) => (
                <Card key={item.step}>
                  <CardHeader>
                    <div className="flex items-center gap-4">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary text-sm">
                        {item.step}
                      </div>
                      <CardTitle>{item.title}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground text-sm">
                      {item.description}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
            <p className="mt-6 text-muted-foreground text-sm">
              What you keep: domain reputation, which travels with your domain
              rather than the provider, plus the contact data and event history
              you export. What you lose: Customer.io&apos;s built-in CDP, push
              and in-app channels, A/B testing, and their 100+ native
              integrations. Workflows, broadcasts, segments, templates, and
              topics all have a home in Wraps.
            </p>
          </section>

          <AlsoCompare
            alternativesSlug="customer-io"
            current="/compare/customer-io-vs-wraps"
          />

          {/* CTA */}
          <section className="rounded-lg border bg-muted/30 p-8 text-center">
            <h2 className="mb-2 font-heading font-semibold text-xl tracking-tight">
              Everything Amazon SES needs, including operations
            </h2>
            <p className="mb-6 text-muted-foreground">
              One command sets up your AWS account. One control plane runs it.
              Unlimited contacts on every tier, AWS pricing underneath.
            </p>
            <div className="flex flex-col justify-center gap-4 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/docs/quickstart">
                  Get Started Free
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
            <p>
              Last updated: September 2026. Customer.io pricing and features
              sourced from{" "}
              <a
                className="underline"
                href="https://customer.io/pricing"
                rel="noopener noreferrer"
                target="_blank"
              >
                customer.io/pricing
              </a>{" "}
              and{" "}
              <a
                className="underline"
                href="https://docs.customer.io"
                rel="noopener noreferrer"
                target="_blank"
              >
                docs.customer.io
              </a>
              .
            </p>
            <p>
              See something inaccurate?{" "}
              <a
                className="text-primary underline"
                href="mailto:support@wraps.dev"
              >
                Let us know
              </a>{" "}
              and we will fix it.
            </p>
          </div>
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}
