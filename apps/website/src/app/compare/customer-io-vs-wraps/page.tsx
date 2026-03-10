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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Customer.io vs Wraps - Contact-Based Pricing vs Unlimited Contacts",
  description:
    "Compare Customer.io and Wraps for email infrastructure. Customer.io charges per contact with high-watermark billing. Wraps deploys to your AWS with unlimited contacts on every tier.",
  openGraph: {
    title: "Customer.io vs Wraps | Wraps",
    description:
      "Contact-based pricing vs unlimited contacts. Managed SaaS vs your AWS account. Compare the real cost at every scale.",
    url: "https://wraps.dev/compare/customer-io-vs-wraps",
  },
  twitter: {
    title: "Customer.io vs Wraps | Wraps",
    description:
      "Contact-based pricing vs unlimited contacts. Managed SaaS vs your AWS account. Compare the real cost at every scale.",
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
    dimension: "Pricing model",
    customerio: "Per contact (profile). High-watermark billing.",
    wraps: "Per tracked event. Unlimited contacts on every tier.",
  },
  {
    dimension: "Starting price",
    customerio: "$100/mo for 5,000 profiles",
    wraps: "Free (5K events/mo) + AWS SES at $0.10/1K",
  },
  {
    dimension: "Infrastructure",
    customerio: "Managed SaaS (GCP). They host everything.",
    wraps: "Your AWS account. You own everything.",
  },
  {
    dimension: "Data ownership",
    customerio: "Customer.io hosts your data. Bulk export requires Premium.",
    wraps: "Email events in your DynamoDB. Contacts exportable anytime.",
  },
  {
    dimension: "Vendor lock-in",
    customerio: "High. Workflows, templates, and data are proprietary.",
    wraps: "Zero. Standard AWS SES underneath. Keep your infra if you leave.",
  },
  {
    dimension: "Dedicated IPs",
    customerio: "Premium only ($1,000/mo min). Requires 50K emails/week.",
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
    wraps: "$24",
    wrapsNote: "$19 Starter + $5 SES",
  },
  {
    contacts: "10,000",
    emails: "100,000",
    customerio: "$145",
    customerioNote: "$100 + 5K overage at $0.009/profile",
    wraps: "$29",
    wrapsNote: "$19 Starter + $10 SES",
  },
  {
    contacts: "50,000",
    emails: "500,000",
    customerio: "$505",
    customerioNote: "$100 + 45K overage at $0.009/profile",
    wraps: "$129",
    wrapsNote: "$79 Growth + $50 SES",
  },
  {
    contacts: "100,000",
    emails: "1,000,000",
    customerio: "$1,000+",
    customerioNote: "Premium tier minimum (annual contract)",
    wraps: "$299",
    wrapsNote: "$199 Scale + $100 SES",
  },
  {
    contacts: "500,000",
    emails: "5,000,000",
    customerio: "$4,000-5,000+",
    customerioNote: "Enterprise (custom, estimated)",
    wraps: "$699",
    wrapsNote: "$199 Scale + $500 SES",
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
        name: "Behavioral segmentation",
        customerio: "yes",
        wraps: "Basic (tags/attributes)",
      },
      {
        name: "Event-driven workflows",
        customerio: "yes",
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
        name: "HIPAA compliance",
        customerio: "Premium+ only ($1K/mo min)",
        wraps: "Sending infra via your AWS BAA",
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
        name: "API rate limits",
        customerio: "100 req/s (Track), 10 req/s (App)",
        wraps: "AWS SES limits (200/sec default, can increase)",
      },
    ],
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
  {
    quote:
      "The interface feels like it was designed by engineers for engineers, with no consideration for marketers. Simple tasks like segmenting users or editing workflows are buried under layers of clicks.",
    source: "G2 reviewer",
  },
];

export default function CustomerIoVsWrapsPage() {
  return (
    <div className="min-h-screen bg-background">
      <LandingNavbar />
      <Script id="breadcrumb-jsonld" type="application/ld+json">
        {JSON.stringify(breadcrumbJsonLd)}
      </Script>

      <main className="container mx-auto px-4 pt-24 pb-16">
        <div className="mx-auto max-w-4xl">
          <CompareBreadcrumb competitor="Customer.io vs Wraps" />

          {/* Hero */}
          <section className="mb-16">
            <Badge className="mb-4" variant="secondary">
              Comparison
            </Badge>
            <h1 className="mb-4 font-bold text-4xl tracking-tight sm:text-5xl">
              Customer.io vs Wraps
            </h1>
            <p className="mb-3 max-w-2xl text-lg text-muted-foreground">
              Customer.io is a marketing automation platform that charges per
              contact and hosts everything on their infrastructure. Wraps
              deploys email infrastructure directly to your AWS account with
              unlimited contacts on every tier.
            </p>
            <p className="max-w-2xl text-muted-foreground">
              Both platforms send email. The difference is where the
              infrastructure lives, who owns the data, and how you pay for it.
            </p>
          </section>

          {/* TL;DR Comparison Table */}
          <section className="mb-16">
            <h2 className="mb-6 font-semibold text-2xl">At a Glance</h2>
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
            <h2 className="mb-2 font-semibold text-2xl">Sound Familiar?</h2>
            <p className="mb-6 text-muted-foreground">
              Real feedback from Customer.io users on G2, Trustpilot, and
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
            <h2 className="mb-6 font-semibold text-2xl">
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
                      <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-500" />
                      <span>
                        Bulk data export requires Premium tier ($1,000/mo)
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-500" />
                      <span>No self-hosted or BYOC option available</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-500" />
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
                    directly to your AWS account. You own the infrastructure,
                    the data, and the sending reputation. Wraps is the control
                    plane; your AWS is the data plane.
                  </p>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-green-500" />
                      <span>
                        Email events and sending infra stay in your AWS account.
                        Contacts exportable anytime.
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-green-500" />
                      <span>
                        If you stop using Wraps, everything keeps running
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-green-500" />
                      <span>
                        Inherits your AWS compliance posture (SOC 2, HIPAA,
                        FedRAMP)
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
              <h2 className="font-semibold text-2xl">
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
                      <th className="p-4 text-left font-medium">Savings</th>
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
                            <Badge variant="secondary">
                              {savingsPercent}% less
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
            <p className="mt-4 text-muted-foreground text-sm">
              Wraps pricing: Free (5K events/mo), $19/mo (50K events), $79/mo
              (250K events), $199/mo (1M events). AWS SES costs $0.10 per 1,000
              emails, paid directly to AWS.{" "}
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
            <h2 className="mb-6 font-semibold text-2xl">Feature Comparison</h2>
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
            <h2 className="mb-4 font-semibold text-2xl">
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
                    "Your team is marketing-led and needs a visual campaign builder without developer involvement",
                    "You need multi-channel orchestration (email, SMS, push, in-app) in a single workflow canvas",
                    "Advanced behavioral segmentation and a built-in CDP are core requirements",
                    "You want 100+ native integrations with tools like Salesforce, HubSpot, Segment, and ad networks",
                    "A/B testing on campaigns and workflows is critical to your marketing strategy",
                    "You need a dedicated CSM, 90-day onboarding program, and enterprise support SLAs",
                  ].map((point) => (
                    <li className="flex items-start gap-3" key={point}>
                      <Check className="mt-0.5 size-5 shrink-0 text-green-500" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </section>

          {/* When to Choose Wraps */}
          <section className="mb-16">
            <h2 className="mb-4 font-semibold text-2xl">
              When to Choose Wraps
            </h2>
            <p className="mb-4 text-muted-foreground">
              Wraps is email infrastructure with a built-in workflow builder,
              contacts, segments, and broadcasts. It is the better choice when:
            </p>
            <Card>
              <CardContent>
                <ul className="space-y-3">
                  {[
                    "You want to own your sending infrastructure and data in your own AWS account",
                    "Contact-based pricing is punishing your growth -- you have large lists with many inactive contacts",
                    "You need HIPAA compliance without paying $1,000/mo for a Premium plan -- your AWS BAA covers it",
                    "Your team is developer-led and prefers code-first templates (React Email) over drag-and-drop editors",
                    "You need dedicated sending IPs on day one, not gated behind a premium tier",
                    "You want workflows you can version-control -- Wraps has a visual flow builder with 10 node types plus a TypeScript CLI that lets you define, validate, and push workflows from code",
                    "Vendor lock-in is a concern -- you want infrastructure that keeps running if you leave the platform",
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
            <h2 className="mb-4 font-semibold text-2xl">
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
                    "Export profiles from Customer.io via CSV or API. Import into your own data store (DynamoDB, Postgres, etc.).",
                },
                {
                  step: "2",
                  title: "Set up Wraps",
                  description:
                    "Run `npx @wraps.dev/cli email init` to deploy SES, DynamoDB, and event tracking to your AWS account. DNS verification uses CNAME records -- no conflict with Customer.io's subdomain records.",
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
              <strong>What you keep:</strong> Domain reputation (travels with
              your domain, not the provider), contact data, and event history
              you export. <strong>What you lose:</strong> Customer.io&apos;s
              behavioral segmentation engine, multi-channel orchestration (push,
              in-app, SMS via their platform), and built-in CDP. Wraps has its
              own visual workflow builder and segments.
            </p>
          </section>

          <AlsoCompare current="/compare/customer-io-vs-wraps" />

          {/* CTA */}
          <section className="rounded-lg border bg-muted/30 p-8 text-center">
            <h2 className="mb-2 font-semibold text-xl">
              Own your email infrastructure
            </h2>
            <p className="mb-6 text-muted-foreground">
              Deploy to your AWS in 2 minutes. Unlimited contacts, AWS pricing,
              zero lock-in.
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
              Last updated: March 2026. Customer.io pricing and features sourced
              from{" "}
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
              <a className="text-primary underline" href="mailto:hey@wraps.dev">
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
