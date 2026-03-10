import {
  ArrowRight,
  Check,
  Cloud,
  DollarSign,
  MessageSquareQuote,
  Server,
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
    dimension: "Infrastructure",
    postmark: "Postmark-owned cloud",
    wraps: "Your AWS account",
  },
  {
    dimension: "Pricing model",
    postmark: "$1.20-$1.80 per 1K emails",
    wraps: "$0.10 per 1K (AWS SES) + platform fee",
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
    dimension: "Data retention",
    postmark: "45 days (365 max, paid add-on)",
    wraps: "You decide (your DynamoDB)",
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
    wraps: "$24",
    wrapsDetail: "$19 Starter + $5 SES",
    savings: "65%",
  },
  {
    volume: "100K/mo",
    postmark: "$100-$134",
    postmarkDetail: "Pro tier, volume-dependent",
    wraps: "$89",
    wrapsDetail: "$79 Growth + $10 SES",
    savings: "11-33%",
  },
  {
    volume: "500K/mo",
    postmark: "$320-$400",
    postmarkDetail: "Pro tier, volume-dependent",
    wraps: "$249",
    wrapsDetail: "$199 Scale + $50 SES",
    savings: "22-38%",
  },
  {
    volume: "1M/mo",
    postmark: "~$700",
    postmarkDetail: "Pro @ 1.5M volume tier",
    wraps: "$299",
    wrapsDetail: "$199 Scale + $100 SES",
    savings: "57%",
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
        name: "Data retention",
        postmark: "45 days (365 max, paid)",
        wraps: "You decide (your DynamoDB)",
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
        wraps: "TypeScript",
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

const wrapsCode = `import { Wraps } from "@wraps.dev/email";

const wraps = new Wraps();

await wraps.emails.send({
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

      <main className="container mx-auto px-4 pt-24 pb-16">
        <div className="mx-auto max-w-4xl">
          <CompareBreadcrumb competitor="Postmark vs Wraps" />

          {/* Hero */}
          <section className="mb-16">
            <div className="mb-4 flex items-center gap-2">
              <Badge variant="secondary">Comparison</Badge>
              <span className="text-muted-foreground text-sm">
                Last updated: March 2026
              </span>
            </div>
            <h1 className="mb-4 font-bold text-4xl tracking-tight sm:text-5xl">
              Postmark vs Wraps
            </h1>
            <p className="mb-4 max-w-2xl text-lg text-muted-foreground">
              Postmark is a focused transactional email service with excellent
              deliverability. Wraps deploys email infrastructure to your AWS
              account with a full communication platform on top.
            </p>
            <p className="max-w-2xl text-lg">
              Both platforms send email reliably. The difference is where the
              infrastructure lives, what you pay for it, and what you can do
              beyond transactional sends.
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

          {/* Sound Familiar? */}
          <section className="mb-16">
            <div className="mb-6 flex items-center gap-3">
              <MessageSquareQuote className="size-6 text-primary" />
              <h2 className="font-semibold text-2xl">Sound Familiar?</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <CardContent>
                  <blockquote className="border-l-2 border-muted-foreground/30 pl-4 text-muted-foreground italic">
                    &ldquo;What used to be $10/month is now closer to
                    $120/month, even for existing customers, with no
                    grandfathering or warnings &mdash; just an instant jump in
                    cost.&rdquo;
                  </blockquote>
                  <p className="mt-3 text-muted-foreground/70 text-xs">
                    WPAstra, reporting on user complaints
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent>
                  <blockquote className="border-l-2 border-muted-foreground/30 pl-4 text-muted-foreground italic">
                    &ldquo;Postmark shut down our entire account after a single
                    B2B broadcast. Transactional emails were blocked as well,
                    instantly breaking our SaaS for paying customers. No
                    warning.&rdquo;
                  </blockquote>
                  <p className="mt-3 text-muted-foreground/70 text-xs">
                    Trustpilot review
                  </p>
                </CardContent>
              </Card>
              <Card className="sm:col-span-2">
                <CardContent>
                  <blockquote className="border-l-2 border-muted-foreground/30 pl-4 text-muted-foreground italic">
                    &ldquo;Sneaky business practices, poor customer service,
                    price gouging, lack of helpfulness when resolving issues,
                    and deceitfulness.&rdquo;
                  </blockquote>
                  <p className="mt-3 text-muted-foreground/70 text-xs">
                    Trustpilot review, July 2025
                  </p>
                </CardContent>
              </Card>
            </div>
            <p className="mt-4 text-muted-foreground text-sm">
              These are real user reviews from Trustpilot, Capterra, and
              industry coverage. When your email provider owns the
              infrastructure, they control the price and the kill switch.
            </p>
          </section>

          {/* The Architectural Difference */}
          <section className="mb-16">
            <h2 className="mb-6 font-semibold text-2xl">
              The Architectural Difference
            </h2>
            <p className="mb-6 text-muted-foreground">
              Postmark is a fully managed SaaS. Your emails send from
              Postmark&apos;s shared IP pools, your data lives on
              Postmark&apos;s servers, and your sending reputation is tied to
              their infrastructure. This is convenient &mdash; until it
              isn&apos;t.
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
                    <li>Data stored on Postmark&apos;s AWS infrastructure</li>
                    <li>45-day default retention, then deleted</li>
                    <li>No data portability between accounts</li>
                    <li>Cancel = lose everything, re-warm IPs elsewhere</li>
                    <li>Account suspensions affect all streams</li>
                  </ul>
                </CardContent>
              </Card>
              <Card className="border-primary/30">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <Server className="size-5 text-primary" />
                    <CardTitle className="text-primary">Wraps</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm">
                    <li>
                      Emails send from <span className="font-medium">your</span>{" "}
                      AWS SES
                    </li>
                    <li>
                      Email events stored in{" "}
                      <span className="font-medium">your</span> DynamoDB
                    </li>
                    <li>Unlimited retention &mdash; it&apos;s your database</li>
                    <li>Export anytime &mdash; it&apos;s your AWS account</li>
                    <li>Cancel Wraps = SES infrastructure keeps running</li>
                    <li>You control your own sending reputation</li>
                  </ul>
                </CardContent>
              </Card>
            </div>

            <p className="mt-6 text-muted-foreground text-sm">
              Wraps is the control plane. AWS SES is the data plane. You own the
              infrastructure, the data, and the sending reputation. Wraps
              provides the developer tools, dashboard, workflows, and analytics
              on top.
            </p>
          </section>

          {/* Pricing at Real Volumes */}
          <section className="mb-16">
            <div className="mb-6 flex items-center gap-3">
              <DollarSign className="size-6 text-primary" />
              <h2 className="font-semibold text-2xl">
                Pricing at Real Volumes
              </h2>
            </div>
            <p className="mb-6 text-muted-foreground">
              Postmark charges $1.20&ndash;$1.80 per 1,000 emails depending on
              plan and volume. AWS SES charges $0.10 per 1,000. Here&apos;s what
              that means at real send volumes.
            </p>

            <Card className="overflow-hidden py-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-4 text-left font-medium">Volume</th>
                      <th className="p-4 text-left font-medium">
                        Postmark (Pro)
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
                          <Badge variant="secondary">{row.savings} less</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <p className="mt-4 text-muted-foreground text-sm">
              Postmark pricing uses their Pro tier (most popular). Wraps pricing
              includes the platform fee plus AWS SES at $0.10/1K emails. You pay
              AWS directly &mdash; Wraps never touches your email spend.{" "}
              <a
                className="text-primary underline"
                href="/tools/ses-calculator"
              >
                Calculate your exact AWS cost
              </a>
            </p>

            <div className="mt-6 rounded-lg border bg-muted/30 p-4">
              <p className="font-medium text-sm">
                Hidden costs to watch for with Postmark
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
            <h2 className="mb-6 font-semibold text-2xl">
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
            <h2 className="mb-6 font-semibold text-2xl">
              When to Choose Postmark
            </h2>
            <Card>
              <CardContent>
                <p className="mb-4 text-muted-foreground">
                  Postmark is genuinely excellent at transactional email
                  delivery. Choose Postmark if:
                </p>
                <ul className="space-y-3">
                  {[
                    "You need zero-config setup with no AWS account or cloud knowledge required",
                    "You only send transactional email (password resets, receipts, notifications) and don't need marketing, automations, or contact management",
                    "You value pre-warmed shared IPs with 14+ years of established deliverability reputation",
                    "You want server-side Handlebars templates managed by your email provider",
                    "You need official SDKs in Ruby, PHP, .NET, Java, or Go (Wraps currently offers TypeScript only)",
                  ].map((point) => (
                    <li className="flex items-start gap-3" key={point}>
                      <Check className="mt-0.5 size-4 shrink-0 text-green-600 dark:text-green-400" />
                      <span className="text-sm">{point}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </section>

          {/* When to Choose Wraps */}
          <section className="mb-16">
            <h2 className="mb-6 font-semibold text-2xl">
              When to Choose Wraps
            </h2>
            <Card className="border-primary/30">
              <CardContent>
                <p className="mb-4 text-muted-foreground">
                  Wraps is the better fit when you want more than a sending API.
                  Choose Wraps if:
                </p>
                <ul className="space-y-3">
                  {[
                    "You want to own your email infrastructure in your AWS account, not rent it from a vendor",
                    "You need a full communication platform: automations, broadcasts, segments, and contact management alongside transactional sends",
                    "You're cost-sensitive at scale \u2014 AWS SES pricing ($0.10/1K) is 12-18x cheaper than Postmark's per-email rate",
                    "You control your own data retention (your DynamoDB, your rules) -- no paid add-ons to keep your event history",
                    "You want SMS alongside email via AWS End User Messaging, from the same platform",
                    "You care about vendor lock-in: cancel Wraps and your SES infrastructure keeps running with no DNS changes or IP warmup required",
                    "You're in a regulated industry where data residency matters \u2014 your sending infrastructure and email events stay in your AWS account, which can be HIPAA-eligible",
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
            <h2 className="mb-6 font-semibold text-2xl">
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
                  npx @wraps.dev/cli email setup
                </code>
                <p className="mt-2 text-muted-foreground text-xs">
                  Deploys SES, EventBridge, SQS, Lambda, and DynamoDB to your
                  AWS account.
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
                  Add DKIM/SPF records for your domain (same as any provider
                  switch). Export your Postmark suppression list via their API
                  and import to SES to avoid re-sending to bad addresses.
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

          <AlsoCompare current="/compare/postmark-vs-wraps" />

          {/* CTA */}
          <section className="rounded-lg border bg-muted/30 p-8 text-center">
            <h2 className="mb-2 font-semibold text-xl">
              Own your email infrastructure
            </h2>
            <p className="mb-6 text-muted-foreground">
              Deploy to your AWS in 2 minutes. Free tier includes 5,000 tracked
              events per month.
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
              Last updated: March 2026. Postmark pricing and features sourced
              from postmarkapp.com, Capterra, G2, and Trustpilot.
            </p>
            <p className="mt-1">
              See something inaccurate?{" "}
              <a className="text-primary underline" href="mailto:hey@wraps.dev">
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
