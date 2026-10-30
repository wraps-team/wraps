import { Button } from "@wraps/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import {
  Activity,
  ArrowRight,
  Check,
  Cloud,
  DollarSign,
  Server,
  Terminal,
} from "lucide-react";
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
import { JsonLd } from "@/components/json-ld";

export const metadata: Metadata = {
  title: "Postmark vs Wraps - Comparison for Transactional Email",
  description:
    "Detailed comparison of Postmark and Wraps for transactional and application email. Pricing at real volumes, feature differences, architecture tradeoffs, and migration guide.",
  openGraph: {
    title: "Postmark vs Wraps | Wraps",
    description:
      "Detailed comparison of Postmark and Wraps for transactional and application email. Pricing, features, architecture, and migration.",
    url: "https://wraps.dev/compare/postmark-vs-wraps",
  },
  twitter: {
    title: "Postmark vs Wraps | Wraps",
    description:
      "Detailed comparison of Postmark and Wraps for transactional and application email. Pricing, features, architecture, and migration.",
  },
  alternates: {
    canonical: "https://wraps.dev/compare/postmark-vs-wraps",
  },
};

const breadcrumbSchema = {
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
      name: "Postmark vs Wraps",
      item: "https://wraps.dev/compare/postmark-vs-wraps",
    },
  ],
};

const tldrRows = [
  {
    dimension: "Setup",
    postmark: "Sign up, verify a domain, send",
    wraps: "One command into your own AWS account",
  },
  {
    dimension: "Day-to-day operations",
    postmark: "Postmark runs the sending platform",
    wraps: "Control plane watches the account, suppression, domain health",
  },
  {
    dimension: "Infrastructure",
    postmark: "Postmark-owned cloud",
    wraps: "Your AWS account",
  },
  {
    dimension: "Pricing model",
    postmark: "$1.20-$1.80 per 1K emails",
    wraps: "$0.10 per 1K à la carte AWS SES ($0.16 Essentials) + flat fee",
  },
  {
    dimension: "Contact management",
    postmark: "None",
    wraps: "Unlimited contacts, all tiers",
  },
  {
    dimension: "Automations & broadcasts",
    postmark: "Limited broadcasts, no automations",
    wraps: "Visual workflow builder, broadcasts, segments",
  },
  {
    dimension: "Delivery history",
    postmark: "45 days (365 max, paid add-on)",
    wraps: "Events in your DynamoDB, retention you set",
  },
  {
    dimension: "Vendor lock-in",
    postmark: "Proprietary API, templates, IPs",
    wraps: "Cancel Wraps, keep your SES infra",
  },
];

const pricingRows = [
  {
    volume: "10K/mo",
    postmark: "$16.50",
    postmarkDetail: "Pro tier, 10K included",
    wraps: "$1",
    wrapsDetail: "Free tier + $1 SES",
    savings: "94%",
  },
  {
    volume: "50K/mo",
    postmark: "$68.50",
    postmarkDetail: "Pro + 40K overage @ $1.30/1K",
    wraps: "$34",
    wrapsDetail: "$29 Pro + $5 SES",
    savings: "50%",
  },
  {
    volume: "100K/mo",
    postmark: "$126-$134",
    postmarkDetail: "Pro/Platform + overage",
    wraps: "$39",
    wrapsDetail: "$29 Pro + $10 SES",
    savings: "69-71%",
  },
  {
    volume: "500K/mo",
    postmark: "$606-$654",
    postmarkDetail: "Pro/Platform + overage",
    wraps: "$249",
    wrapsDetail: "$199 Business + $50 SES",
    savings: "59-62%",
  },
  {
    volume: "1M/mo",
    postmark: "~$1,200-$1,300",
    postmarkDetail: "Pro/Platform + overage (custom deals at 1.5M+)",
    wraps: "$299",
    wrapsDetail: "$199 Business + $100 SES",
    savings: "75%+",
  },
];

const featureRows: {
  category: string;
  features: {
    name: string;
    postmark: "yes" | "no" | "partial" | string;
    wraps: "yes" | "no" | "partial" | string;
  }[];
}[] = [
  {
    category: "Sending",
    features: [
      { name: "Transactional email API", postmark: "yes", wraps: "yes" },
      { name: "SMTP support", postmark: "yes", wraps: "yes" },
      {
        name: "Broadcast / marketing email",
        postmark: "Limited (requires approval)",
        wraps: "yes",
      },
      { name: "SMS", postmark: "no", wraps: "yes" },
      {
        name: "Inbound email processing",
        postmark: "Pro+ only",
        wraps: "yes",
      },
    ],
  },
  {
    category: "Contacts & Audiences",
    features: [
      { name: "Contact management", postmark: "no", wraps: "yes" },
      { name: "Audience segmentation", postmark: "no", wraps: "yes" },
      { name: "Suppression lists", postmark: "yes", wraps: "yes" },
      {
        name: "Unlimited contacts",
        postmark: "N/A (no contacts)",
        wraps: "All tiers",
      },
    ],
  },
  {
    category: "Automation",
    features: [
      {
        name: "Visual workflow builder",
        postmark: "no",
        wraps: "React Flow canvas, 10 node types",
      },
      {
        name: "Triggered workflows",
        postmark: "no",
        wraps: "9 trigger types (event, contact, segment, schedule, API)",
      },
      {
        name: "Workflows-as-code (CLI)",
        postmark: "no",
        wraps: "TypeScript DSL, Git-versioned",
      },
      { name: "AI workflow generation", postmark: "no", wraps: "yes" },
      { name: "A/B testing", postmark: "no", wraps: "no" },
    ],
  },
  {
    category: "Templates",
    features: [
      {
        name: "Server-side templates",
        postmark: "Mustachio (Handlebars)",
        wraps: "React Email (client-side)",
      },
      {
        name: "Template editing",
        postmark: "No visual editor",
        wraps: "AI designer + code editor",
      },
      {
        name: "Template layouts (shared header/footer)",
        postmark: "yes",
        wraps: "yes",
      },
    ],
  },
  {
    category: "Analytics",
    features: [
      { name: "Delivery tracking", postmark: "yes", wraps: "yes" },
      { name: "Open/click tracking", postmark: "yes", wraps: "yes" },
      { name: "Bounce handling", postmark: "yes", wraps: "yes" },
      {
        name: "Delivery event retention",
        postmark: "45 days (365 max, paid)",
        wraps: "Your DynamoDB, retention you set; dashboard 30d-365d by plan",
      },
      {
        name: "Bounce & complaint rate monitoring",
        postmark: "Postmark's responsibility",
        wraps: "Hourly sweep against AWS's lines, owners and admins notified",
      },
      {
        name: "Deliverability & blacklist audit",
        postmark: "Postmark's responsibility",
        wraps: "wraps email check, on demand",
      },
    ],
  },
  {
    category: "Infrastructure",
    features: [
      {
        name: "Where email sends from",
        postmark: "Postmark shared IPs",
        wraps: "Your AWS SES",
      },
      {
        name: "Data ownership",
        postmark: "Postmark-owned",
        wraps: "Your AWS account",
      },
      {
        name: "Dedicated IPs",
        postmark: "$50/mo (Pro+, 300K min)",
        wraps: "Request via SES (free)",
      },
      {
        name: "Alarms in your own account",
        postmark: "N/A (Postmark monitors its own platform)",
        wraps: "CloudWatch, Production/Enterprise presets (not Starter)",
      },
      {
        name: "What happens if you cancel",
        postmark: "Lose everything",
        wraps: "SES infra keeps running",
      },
    ],
  },
  {
    category: "Developer Experience",
    features: [
      { name: "TypeScript SDK", postmark: "yes", wraps: "yes" },
      {
        name: "Official SDKs",
        postmark: "Node, Ruby, PHP, .NET, Java",
        wraps: "TypeScript, Python",
      },
      {
        name: "CLI tooling",
        postmark: "Templates only",
        wraps: "Full infrastructure + sending",
      },
      {
        name: "Webhook events",
        postmark: "yes",
        wraps: "EventBridge + Lambda",
      },
    ],
  },
];

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "Postmark vs Wraps",
  description:
    "Detailed comparison of Postmark and Wraps for transactional and application email. Pricing at real volumes, feature differences, architecture tradeoffs, and migration guide.",
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
    "@id": "https://wraps.dev/compare/postmark-vs-wraps",
  },
};

const postmarkCode = `import { ServerClient } from "postmark";

const client = new ServerClient(
  process.env.POSTMARK_TOKEN
);

await client.sendEmail({
  From: "you@example.com",
  To: "user@example.com",
  Subject: "Hello",
  HtmlBody: "<p>Hi</p>",
});`;

const wrapsCode = `import { WrapsEmail } from "@wraps.dev/email";

const email = new WrapsEmail();

await email.send({
  from: "you@example.com",
  to: "user@example.com",
  subject: "Hello",
  html: "<p>Hi</p>",
});`;

export default function PostmarkVsWrapsPage() {
  return (
    <div className="min-h-screen bg-background">
      <LandingNavbar />

      <Script id="breadcrumb-schema" type="application/ld+json">
        {JSON.stringify(breadcrumbSchema)}
      </Script>
      <JsonLd data={articleSchema} />

      <main className="container mx-auto px-4 pt-24 pb-16">
        <div className="mx-auto max-w-4xl">
          <CompareBreadcrumb competitor="Postmark vs Wraps" />

          {/* Hero */}
          <section className="mb-16">
            <div className="mb-4 flex items-center gap-2">
              <SectionKicker className="mb-0">Comparison</SectionKicker>
              <span className="font-mono text-2xs text-muted-foreground uppercase tracking-widest">
                Last updated: September 2026
              </span>
            </div>
            <h1 className="mb-4 font-heading font-semibold text-4xl tracking-tight sm:text-5xl">
              Postmark vs Wraps
            </h1>
            <p className="mb-4 max-w-2xl text-lg text-muted-foreground">
              Postmark has spent more than a decade on one job: getting
              transactional email into the inbox. That reputation is real, and
              it is what the premium buys. If inbox placement is the thing
              keeping you up, they have earned the money.
            </p>
            <p className="max-w-2xl text-lg">
              Wraps takes the other route. One command sets up the whole Amazon
              SES surface in your own AWS account, and the Wraps control plane
              runs it day to day &mdash; bounce and complaint rates watched
              against AWS&apos;s own lines, suppression you can browse,
              deliverability audits, a log of every message. Everything Amazon
              SES needs, including operations.
            </p>
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
                      <th className="p-4 text-left font-medium">Postmark</th>
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
                          {row.postmark}
                        </td>
                        <td className="p-4 text-primary">{row.wraps}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </section>

          {/* What Wraps does for you */}
          <section className="mb-16">
            <h2 className="mb-6 font-heading font-semibold text-2xl tracking-tight">
              Everything Amazon SES needs, including operations
            </h2>
            <p className="mb-6 text-muted-foreground">
              Most people pick a hosted API because they do not want to deal
              with SES. That is a fair reason. Wraps exists to make dealing with
              it easy: we set the whole thing up, and then we run it with you.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <Terminal className="size-5 text-primary" />
                    <CardTitle>One command sets it up</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm">
                    <li>
                      <code className="font-mono text-xs">
                        wraps email init
                      </code>{" "}
                      deploys SES, EventBridge, SQS, Lambda, and DynamoDB into
                      your AWS account.
                    </li>
                    <li>
                      Non-destructive. Every resource is namespaced{" "}
                      <code className="font-mono text-xs">wraps-email-*</code>{" "}
                      and coexists with SES you already run.
                    </li>
                    <li>
                      Account-level suppression is wired on at deploy,
                      defaulting to bounces and complaints.
                    </li>
                    <li>
                      Sandbox status is detected at the end of init, explained,
                      and the console request is linked.
                    </li>
                    <li>
                      On the Production and Enterprise deploy presets,
                      CloudWatch alarms go in too: bounce warns at 2% and turns
                      critical at 4%, complaint at 0.05% and 0.08%, and the
                      dead-letter queue alarms on any failed message. They
                      notify by email or webhook &mdash; Slack, Discord,
                      PagerDuty. The Starter preset deploys without them.
                    </li>
                    <li>
                      Access is an assumed role with an external ID and one-hour
                      sessions. No AWS keys are stored anywhere.
                    </li>
                  </ul>
                </CardContent>
              </Card>
              <Card className="border-primary/30">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <Activity className="size-5 text-primary" />
                    <CardTitle>The control plane runs it</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm">
                    <li>
                      Bounce and complaint rates are swept hourly and drawn
                      against the lines AWS can act on. Owners and admins get
                      notified.
                    </li>
                    <li>
                      An account card shows both rates, the 24-hour quota with
                      an 80% warning line, and sandbox or enforcement status.
                    </li>
                    <li>
                      The SES suppression list is browsable, and you can clear
                      an address from it.
                    </li>
                    <li>
                      <code className="font-mono text-xs">
                        wraps email check
                      </code>{" "}
                      audits DKIM, SPF, DMARC, MX, MX-TLS, BIMI, RDAP, and
                      public blacklists on demand.
                    </li>
                    <li>
                      A row per message: recipient, subject, template variables,
                      delivery and open timestamps.
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </div>
            <p className="mt-4 text-muted-foreground text-sm">
              AWS can place an account under review above a 5% bounce rate and
              can pause sending at 10%; for complaints the lines are 0.1% and
              0.5%. Both the hourly sweep and the deployed alarms sit below
              those numbers on purpose. Postmark&apos;s answer is that you never
              look at any of this, and for a lot of teams that is the right
              answer. Ours is that you can see the same numbers on your own
              infrastructure, and hear about a problem while it is still small.
            </p>
          </section>

          {/* The Architectural Difference */}
          <section className="mb-16">
            <h2 className="mb-6 font-heading font-semibold text-2xl tracking-tight">
              The Architectural Difference
            </h2>
            <p className="mb-6 text-muted-foreground">
              Postmark is a fully managed SaaS. Your emails send from
              Postmark&apos;s shared IP pools, your data lives on their servers,
              and the reputation those IPs carry is pooled across every customer
              on them. That pooled reputation is the product, and it is well
              kept. Wraps inverts the arrangement: the sending infrastructure
              sits in your AWS account and the reputation is yours alone.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <Cloud className="size-5 text-muted-foreground" />
                    <CardTitle>Postmark</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-muted-foreground text-sm">
                    <li>Emails send from Postmark&apos;s shared IPs</li>
                    <li>Data stored on Postmark&apos;s infrastructure</li>
                    <li>45-day default retention, longer as a paid add-on</li>
                    <li>Reputation is pooled across the shared IPs</li>
                    <li>Postmark carries the deliverability work for you</li>
                    <li>Leaving means warming a sender somewhere else</li>
                  </ul>
                </CardContent>
              </Card>
              <Card className="border-primary/30">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <Server className="size-5 text-primary" />
                    <CardTitle>Wraps</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm">
                    <li>
                      Emails send from <span className="font-medium">your</span>{" "}
                      AWS SES
                    </li>
                    <li>
                      Delivery events land in{" "}
                      <span className="font-medium">your</span> DynamoDB
                    </li>
                    <li>
                      Retention is set in your own deploy config, up to
                      permanent
                    </li>
                    <li>Export anytime &mdash; it&apos;s your AWS account</li>
                    <li>
                      Cancel Wraps and the SES infrastructure keeps running
                    </li>
                    <li>
                      Your sending reputation is yours, and Wraps watches it
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </div>

            <p className="mt-6 text-muted-foreground text-sm">
              Wraps is the control plane. AWS SES is the data plane. Be precise
              about where the split falls: SES sending and the per-message
              delivery history sit in your account. Contacts, templates,
              broadcasts and workflow state sit in Wraps&apos; Postgres, along
              with a row per message carrying the recipient address, subject,
              sender, template variables, and delivery and open timestamps. If
              your security review needs recipient addresses never to leave your
              own account, that is the limit to weigh.
            </p>
          </section>

          {/* Pricing at Real Volumes */}
          <section className="mb-16">
            <div className="mb-6 flex items-center gap-3">
              <DollarSign className="size-6 text-primary" />
              <h2 className="font-heading font-semibold text-2xl tracking-tight">
                Pricing at Real Volumes
              </h2>
            </div>
            <p className="mb-6 text-muted-foreground">
              Postmark&apos;s inbox placement is what the premium buys, and for
              some products that is the right trade. Here is what the trade
              costs, because the gap gets wide at volume. Postmark&apos;s 2026
              plans (Basic $15, Pro $16.50, Platform $18) each include 10K
              emails; everything above that is overage at $1.20&ndash;$1.80 per
              1,000 depending on plan. AWS SES charges $0.10 per 1,000 à la
              carte, $0.16 on the Essentials plan new accounts default to.
            </p>

            <Card className="overflow-hidden py-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-4 text-left font-medium">Volume</th>
                      <th className="p-4 text-left font-medium">
                        Postmark (Pro/Platform)
                      </th>
                      <th className="p-4 text-left font-medium text-primary">
                        Wraps + SES
                      </th>
                      <th className="p-4 text-left font-medium">Savings</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {pricingRows.map((row) => (
                      <tr key={row.volume}>
                        <td className="p-4 font-medium">{row.volume}</td>
                        <td className="p-4">
                          <div>{row.postmark}/mo</div>
                          <div className="text-muted-foreground text-xs">
                            {row.postmarkDetail}
                          </div>
                        </td>
                        <td className="p-4 text-primary">
                          <div className="font-medium">{row.wraps}/mo</div>
                          <div className="text-xs opacity-80">
                            {row.wrapsDetail}
                          </div>
                        </td>
                        <td className="p-4">
                          <span className="font-mono text-2xs text-brand-text uppercase tracking-widest">
                            {row.savings} less
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <p className="mt-4 text-muted-foreground text-sm">
              Postmark pricing shows their Pro and Platform plans, computed from
              published base + overage rates. Wraps pricing includes the
              platform fee plus AWS SES at $0.10/1K emails on à la carte (AWS
              defaults new accounts to $0.16). You pay AWS directly &mdash;
              Wraps never touches your email spend.{" "}
              <a
                className="text-primary underline"
                href="/tools/ses-calculator"
              >
                Calculate your exact AWS cost
              </a>
            </p>

            <div className="mt-6 rounded-lg border bg-muted/30 p-4">
              <p className="font-medium text-sm">
                Priced separately at Postmark
              </p>
              <ul className="mt-2 space-y-1 text-muted-foreground text-sm">
                <li>
                  Dedicated IP: $50/mo per IP (requires Pro+ and 300K+ volume)
                </li>
                <li>DMARC monitoring: $14/mo per domain</li>
                <li>
                  Extended data retention: from $5/mo (Pro+ only, up to 365
                  days)
                </li>
                <li>Inbound email: locked behind Pro/Platform tiers</li>
              </ul>
            </div>
          </section>

          {/* Detailed Feature Comparison */}
          <section className="mb-16">
            <h2 className="mb-6 font-heading font-semibold text-2xl tracking-tight">
              Detailed Feature Comparison
            </h2>
            <div className="space-y-6">
              {featureRows.map((group) => (
                <div key={group.category}>
                  <h3 className="mb-2 font-semibold text-sm">
                    {group.category}
                  </h3>
                  <Card className="overflow-hidden py-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="p-3 text-left font-medium" />
                            <th className="p-3 text-left font-medium text-muted-foreground">
                              Postmark
                            </th>
                            <th className="p-3 text-left font-medium text-primary">
                              Wraps
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {group.features.map((feature) => (
                            <tr key={feature.name}>
                              <td className="p-3">{feature.name}</td>
                              <td className="p-3">
                                <FeatureCell value={feature.postmark} />
                              </td>
                              <td className="p-3">
                                <FeatureCell value={feature.wraps} />
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
          </section>

          {/* When to Choose Postmark */}
          <section className="mb-16">
            <h2 className="mb-6 font-heading font-semibold text-2xl tracking-tight">
              When to Choose Postmark
            </h2>
            <Card>
              <CardContent>
                <p className="mb-4 text-muted-foreground">
                  Postmark is genuinely excellent at transactional email
                  delivery, and inbox placement is the hardest part of this
                  business to buy. Choose Postmark if:
                </p>
                <ul className="space-y-3">
                  {[
                    "You have no AWS account and no appetite for one. A hosted API is a different approach, and it is the right one for you.",
                    "You only send transactional email (password resets, receipts, notifications) and don't need marketing, automations, or contact management",
                    "You want someone else's warmed shared IPs and the years of reputation behind them, rather than a sender of your own",
                    "You want server-side Handlebars templates managed by your email provider",
                    "You need an official SDK in Ruby, PHP, .NET or Java. Wraps ships TypeScript and Python.",
                  ].map((point) => (
                    <li className="flex items-start gap-3" key={point}>
                      <Check className="mt-0.5 size-4 shrink-0 text-success" />
                      <span className="text-sm">{point}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </section>

          {/* When to Choose Wraps */}
          <section className="mb-16">
            <h2 className="mb-6 font-heading font-semibold text-2xl tracking-tight">
              When to Choose Wraps
            </h2>
            <Card className="border-primary/30">
              <CardContent>
                <p className="mb-4 text-muted-foreground">
                  Wraps is the better fit when SES is the right answer on paper
                  and the operations are what stopped you. Choose Wraps if:
                </p>
                <ul className="space-y-3">
                  {[
                    "You have an AWS account and want SES set up properly without spending a week on it. One command, non-destructive, alongside whatever SES you already run.",
                    "You want the account watched. Bounce and complaint rates swept hourly against AWS's own lines, owners and admins notified, suppression you can browse and clear.",
                    "You want the alarms to be yours. On the Production and Enterprise deploy presets, CloudWatch alarms land in your account below AWS's own thresholds and page you by email or webhook. The Starter preset deploys without them.",
                    "You want domain health on demand. One command audits DKIM, SPF, DMARC, MX-TLS, BIMI and the public blacklists.",
                    "You need a full communication platform: automations, broadcasts, segments, and contact management alongside transactional sends",
                    "You want the sending infrastructure and the delivery history to live in your account, with retention you set rather than a retention add-on you buy",
                    "You're cost-sensitive at volume. AWS SES is $0.10 per 1,000 \u00e0 la carte, $0.16 on Essentials, against Postmark's $1.20-$1.80 overage rate.",
                    "You want SMS alongside email via AWS End User Messaging, from the same platform",
                    "You care about vendor lock-in: cancel Wraps and your SES infrastructure keeps running with no DNS changes or sender warmup required",
                    "You're a TypeScript team that wants React Email templates with type-safe SDK integration",
                  ].map((point) => (
                    <li className="flex items-start gap-3" key={point}>
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                      <span className="text-sm">{point}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </section>

          {/* Switching from Postmark */}
          <section className="mb-16">
            <h2 className="mb-6 font-heading font-semibold text-2xl tracking-tight">
              Switching from Postmark
            </h2>
            <p className="mb-6 text-muted-foreground">
              Postmark has no contractual lock-in &mdash; you can leave anytime.
              The real migration work is operational: DNS records, API calls,
              templates, and suppression lists.
            </p>

            <div className="mb-6 space-y-4">
              <div className="rounded-lg border bg-muted/30 p-4">
                <h3 className="mb-2 font-semibold text-sm">
                  1. Deploy infrastructure (~10 min)
                </h3>
                <code className="block rounded-md bg-background p-3 font-mono text-sm">
                  npx @wraps.dev/cli email init
                </code>
                <p className="mt-2 text-muted-foreground text-xs">
                  Deploys SES, EventBridge, SQS, Lambda, and DynamoDB to your
                  AWS account, namespaced and non-destructive. Account-level
                  suppression comes on with it. If the account is still in the
                  SES sandbox, init says so and links the production-access
                  request.
                </p>
              </div>

              <div className="rounded-lg border bg-muted/30 p-4">
                <h3 className="mb-2 font-semibold text-sm">
                  2. Replace the SDK
                </h3>
                <CodeComparison
                  after={{
                    label: "Wraps",
                    filename: "send.ts",
                    language: "typescript",
                    code: wrapsCode,
                    highlight: true,
                  }}
                  before={{
                    label: "Postmark",
                    filename: "send.ts",
                    language: "typescript",
                    code: postmarkCode,
                  }}
                />
              </div>

              <div className="rounded-lg border bg-muted/30 p-4">
                <h3 className="mb-2 font-semibold text-sm">
                  3. Verify your domain &amp; import suppressions
                </h3>
                <p className="text-muted-foreground text-sm">
                  Add DKIM/SPF records for your domain (as with any provider
                  switch). Export your Postmark suppression list via their API
                  and import to SES so you do not re-send to bad addresses. Then
                  run{" "}
                  <code className="font-mono text-xs">wraps email check</code>{" "}
                  to confirm DKIM, SPF, DMARC, MX-TLS and the blacklists all
                  read clean before you cut traffic over.
                </p>
              </div>
            </div>

            <p className="text-muted-foreground text-sm">
              The key difference: with Wraps, this is the{" "}
              <span className="font-medium text-foreground">
                last migration you&apos;ll ever do
              </span>
              . Your email infrastructure lives in your AWS account. If you stop
              using Wraps, everything keeps running. No DNS changes, no IP
              warmup, no data migration.
            </p>
          </section>

          <AlsoCompare
            alternativesSlug="postmark"
            current="/compare/postmark-vs-wraps"
          />

          {/* CTA */}
          <section className="rounded-lg border bg-muted/30 p-8 text-center">
            <h2 className="mb-2 font-heading font-semibold text-xl tracking-tight">
              Everything Amazon SES needs, including operations
            </h2>
            <p className="mb-6 text-muted-foreground">
              One command sets it up in your own AWS account. The free plan has
              no send meter and keeps 30 days of dashboard history.
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

          {/* Accuracy Note */}
          <div className="mt-8 text-center text-muted-foreground text-xs">
            <p>
              Last updated: September 2026. Postmark pricing and features
              sourced from postmarkapp.com.
            </p>
            <p className="mt-1">
              See something inaccurate?{" "}
              <a
                className="text-primary underline"
                href="mailto:support@wraps.dev"
              >
                Let us know
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
