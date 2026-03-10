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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Resend vs Wraps - Compare Email Infrastructure Approaches",
  description:
    "Resend sends from their AWS. Wraps deploys to yours. Compare pricing, data retention, infrastructure ownership, and developer experience side by side.",
  openGraph: {
    title: "Resend vs Wraps | Wraps",
    description:
      "Resend sends from their AWS. Wraps deploys to yours. Compare pricing, data retention, infrastructure ownership, and developer experience.",
    url: "https://wraps.dev/compare/resend-vs-wraps",
  },
  twitter: {
    title: "Resend vs Wraps | Wraps",
    description:
      "Resend sends from their AWS. Wraps deploys to yours. Compare pricing, data retention, infrastructure ownership, and developer experience.",
  },
  alternates: {
    canonical: "https://wraps.dev/compare/resend-vs-wraps",
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
      name: "Resend vs Wraps",
      item: "https://wraps.dev/compare/resend-vs-wraps",
    },
  ],
};

const tldrComparison = [
  {
    dimension: "Infrastructure",
    resend: "Resend's AWS account",
    wraps: "Your AWS account",
  },
  {
    dimension: "Sending cost",
    resend: "$0.40-0.90/1K emails",
    wraps: "$0.10/1K (AWS SES direct)",
  },
  {
    dimension: "Data retention",
    resend: "1-7 days (plan-dependent)",
    wraps: "You decide (your DynamoDB)",
  },
  {
    dimension: "If you cancel",
    resend: "Everything deleted",
    wraps: "Infrastructure keeps running",
  },
  {
    dimension: "Rate limits",
    resend: "2 req/sec (all plans)",
    wraps: "AWS SES limits (scales with reputation)",
  },
  {
    dimension: "Data residency",
    resend: "US only (metadata)",
    wraps: "Your chosen AWS region",
  },
];

const pricingComparison = [
  {
    volume: "10K/mo",
    resendTier: "Pro",
    resendCost: "$20",
    wrapsTier: "Free",
    wrapsPlatform: "$0",
    awsSes: "$1",
    wrapsTotal: "$1",
    savings: "95%",
  },
  {
    volume: "50K/mo",
    resendTier: "Pro (at limit)",
    resendCost: "$20",
    wrapsTier: "Starter",
    wrapsPlatform: "$19",
    awsSes: "$5",
    wrapsTotal: "$24",
    savings: null,
  },
  {
    volume: "100K/mo",
    resendTier: "Scale",
    resendCost: "$90",
    wrapsTier: "Growth",
    wrapsPlatform: "$79",
    awsSes: "$10",
    wrapsTotal: "$89",
    savings: null,
  },
  {
    volume: "500K/mo",
    resendTier: "Scale + overage",
    resendCost: "$450",
    wrapsTier: "Scale",
    wrapsPlatform: "$199",
    awsSes: "$50",
    wrapsTotal: "$249",
    savings: "45%",
  },
];

const featureComparison = [
  {
    category: "Sending",
    features: [
      { name: "REST API", resend: true, wraps: true },
      { name: "SMTP relay", resend: true, wraps: true },
      { name: "Batch sending", resend: "100/request", wraps: true },
      { name: "Scheduled sending", resend: true, wraps: true },
      { name: "Idempotency keys", resend: true, wraps: true },
      { name: "Attachments", resend: true, wraps: true },
    ],
  },
  {
    category: "Tracking & Analytics",
    features: [
      { name: "Open tracking", resend: true, wraps: true },
      { name: "Click tracking", resend: true, wraps: true },
      { name: "Bounce handling", resend: true, wraps: true },
      { name: "Delivery events", resend: true, wraps: true },
      {
        name: "Data retention",
        resend: "1-7 days",
        wraps: "You decide (your DynamoDB)",
      },
      {
        name: "Data export",
        resend: "Limited",
        wraps: "Events in your DynamoDB, contacts exportable",
      },
    ],
  },
  {
    category: "Infrastructure",
    features: [
      {
        name: "Infrastructure ownership",
        resend: "Resend",
        wraps: "You",
      },
      { name: "DKIM/SPF/DMARC", resend: true, wraps: true },
      {
        name: "Dedicated IPs",
        resend: "$30/mo (Scale only)",
        wraps: "Request via AWS",
      },
      {
        name: "Sending regions",
        resend: "4 regions",
        wraps: "All AWS SES regions",
      },
      {
        name: "Data residency compliance",
        resend: false,
        wraps: true,
      },
      {
        name: "Self-hosted / BYOC",
        resend: false,
        wraps: true,
      },
    ],
  },
  {
    category: "Developer Experience",
    features: [
      { name: "TypeScript SDK", resend: true, wraps: true },
      {
        name: "Multi-language SDKs",
        resend: "9 languages",
        wraps: "TypeScript",
      },
      {
        name: "CLI tooling",
        resend: false,
        wraps: true,
      },
      {
        name: "React Email support",
        resend: true,
        wraps: true,
      },
      {
        name: "Template editing",
        resend: "No visual editor",
        wraps: "AI designer + code editor",
      },
      {
        name: "Time to first email",
        resend: "~5 minutes",
        wraps: "~15 minutes",
      },
      {
        name: "Requires AWS account",
        resend: false,
        wraps: true,
      },
    ],
  },
  {
    category: "Platform & Compliance",
    features: [
      { name: "Dashboard", resend: true, wraps: true },
      { name: "Webhooks", resend: "1-10 endpoints", wraps: "Unlimited" },
      {
        name: "Contacts",
        resend: "1K free, 5K for $40/mo",
        wraps: "Unlimited",
      },
      {
        name: "SOC 2",
        resend: true,
        wraps: "Sending infra inherits your AWS",
      },
      { name: "HIPAA", resend: false, wraps: "Sending infra via your AWS BAA" },
      {
        name: "Cancel impact",
        resend: "Data deleted",
        wraps: "Infrastructure persists",
      },
    ],
  },
];

const chooseResendReasons = [
  "You want the fastest possible time-to-first-email and don't have an AWS account",
  "You need SDKs in Python, Ruby, Go, PHP, Java, Rust, or .NET today",
  "You want managed dedicated IP warming and monitoring without thinking about it",
  "You want a built-in visual broadcast editor with audience management",
  "You're sending under 50K emails/month and value zero-config simplicity over infrastructure ownership",
];

const chooseWrapsReasons = [
  "You already have an AWS account (or your company does)",
  "You need data retention beyond 7 days -- for debugging, compliance, or analytics",
  "You're sending 100K+ emails/month and want 45%+ cost savings",
  "You need data residency in a specific region for compliance (GDPR, HIPAA)",
  "You don't want a third party able to suspend your transactional email at the worst possible moment",
  "You want infrastructure that keeps running even if the vendor disappears",
];

const resendCode = `import { Resend } from "resend";

const resend = new Resend("re_123456");

await resend.emails.send({
  from: "hello@example.com",
  to: "user@example.com",
  subject: "Welcome",
  react: <WelcomeEmail />,
});`;

const wrapsCode = `import { Wraps } from "@wraps.dev/email";

const wraps = new Wraps();

await wraps.emails.send({
  from: "hello@example.com",
  to: "user@example.com",
  subject: "Welcome",
  react: <WelcomeEmail />,
});`;

export default function ResendVsWrapsPage() {
  return (
    <div className="min-h-screen bg-background">
      <LandingNavbar />

      <Script id="breadcrumb-jsonld" type="application/ld+json">
        {JSON.stringify(breadcrumbJsonLd)}
      </Script>

      <main className="container mx-auto px-4 pt-24 pb-16">
        <div className="mx-auto max-w-4xl">
          <CompareBreadcrumb competitor="Resend vs Wraps" />

          {/* Hero */}
          <section className="mb-16">
            <Badge className="mb-4" variant="secondary">
              Comparison
            </Badge>
            <h1 className="mb-4 font-bold text-4xl tracking-tight sm:text-5xl">
              Resend vs Wraps
            </h1>
            <p className="mb-4 max-w-2xl text-lg text-muted-foreground">
              <strong className="text-foreground">Resend</strong> is a managed
              email API built on top of AWS SES. Beautiful DX, fast onboarding,
              everything runs on their infrastructure.
            </p>
            <p className="mb-4 max-w-2xl text-lg text-muted-foreground">
              <strong className="text-foreground">Wraps</strong> deploys email
              infrastructure directly to your AWS account. Same modern DX, but
              you own the infrastructure and pay AWS directly.
            </p>
            <p className="max-w-2xl font-medium text-foreground text-lg">
              Both platforms use AWS SES to send email. The difference is whose
              account it runs in -- and who pays the bill.
            </p>
          </section>

          {/* TL;DR Comparison Table */}
          <section className="mb-16">
            <h2 className="mb-6 font-semibold text-2xl">TL;DR</h2>
            <Card className="overflow-hidden py-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-4 text-left font-medium" />
                      <th className="p-4 text-left font-medium">Resend</th>
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
                          {row.resend}
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
            <h2 className="mb-2 font-semibold text-2xl">Sound familiar?</h2>
            <p className="mb-6 text-muted-foreground">
              Real quotes from Resend users on Trustpilot, G2, Hacker News, and
              developer blogs.
            </p>
            <div className="space-y-4">
              <Card>
                <CardContent>
                  <blockquote className="border-l-2 border-muted-foreground/30 pl-4 italic text-muted-foreground">
                    &ldquo;They suspended account when we were getting a lot of
                    new customers/traffic. We lost tons of them because of the
                    Resend.&rdquo;
                  </blockquote>
                  <p className="mt-2 text-muted-foreground text-xs">
                    -- Trustpilot review, Feb 2026
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <blockquote className="border-l-2 border-muted-foreground/30 pl-4 italic text-muted-foreground">
                    &ldquo;Account suspended with no response from support in
                    over 24 hours&rdquo; causing critical service failures for
                    signup and password reset flows.
                  </blockquote>
                  <p className="mt-2 text-muted-foreground text-xs">
                    -- Trustpilot review, Mar 2025
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <blockquote className="border-l-2 border-muted-foreground/30 pl-4 italic text-muted-foreground">
                    &ldquo;The biggest drawback is data retention on lower-tier
                    plans, with just 1 day on Free and 3 days on Pro. Historical
                    data disappears quickly, which can make diagnosing
                    deliverability issues more challenging.&rdquo;
                  </blockquote>
                  <p className="mt-2 text-muted-foreground text-xs">
                    -- Aggregated G2 reviews
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <blockquote className="border-l-2 border-muted-foreground/30 pl-4 italic text-muted-foreground">
                    &ldquo;They could just be wrapping a 5-line API call to
                    Amazon SES and charge 4x for it. The disappointing thing
                    about all of this is that they&apos;re not being transparent
                    at all about what they&apos;re doing.&rdquo;
                  </blockquote>
                  <p className="mt-2 text-muted-foreground text-xs">
                    -- Matteo Contrini, developer blog
                  </p>
                </CardContent>
              </Card>
            </div>
            <p className="mt-4 text-muted-foreground text-sm">
              With Wraps, your infrastructure runs in your AWS account. No third
              party can suspend your sending, and your logs live in your
              DynamoDB with configurable retention.
            </p>
          </section>

          {/* The Architectural Difference */}
          <section className="mb-16">
            <h2 className="mb-2 font-semibold text-2xl">
              The architectural difference
            </h2>
            <p className="mb-6 text-muted-foreground">
              Resend and Wraps both use AWS SES to deliver email. The difference
              is where the infrastructure lives and who controls it.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Resend</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="mb-4 text-muted-foreground text-sm">
                    Managed SaaS. Your emails route through Resend&apos;s
                    infrastructure. Data stored in their PostgreSQL (via
                    Supabase), analytics in their Tinybird, logs in their
                    Snowflake. All 21 subprocessors are US-based.
                  </p>
                  <ul className="space-y-2 text-muted-foreground text-sm">
                    <li className="flex items-start gap-2">
                      <Minus className="mt-1 size-3 shrink-0" />
                      Email metadata stored in the US regardless of sending
                      region
                    </li>
                    <li className="flex items-start gap-2">
                      <Minus className="mt-1 size-3 shrink-0" />
                      All traffic proxied through Cloudflare (single point of
                      failure in Nov 2025 outage)
                    </li>
                    <li className="flex items-start gap-2">
                      <Minus className="mt-1 size-3 shrink-0" />
                      Customer data deleted upon leaving
                    </li>
                    <li className="flex items-start gap-2">
                      <Minus className="mt-1 size-3 shrink-0" />
                      No HIPAA compliance (&ldquo;has not started
                      pursuing&rdquo;)
                    </li>
                  </ul>
                </CardContent>
              </Card>

              <Card className="border-primary/30">
                <CardHeader>
                  <CardTitle className="text-primary">Wraps</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="mb-4 text-muted-foreground text-sm">
                    Deploy to your AWS account. SES, EventBridge, SQS, Lambda,
                    and DynamoDB run in your account, in your chosen region.
                    Email content and delivery logs stay in your account.
                    Contacts are stored on the Wraps platform and exportable
                    anytime.
                  </p>
                  <ul className="space-y-2 text-muted-foreground text-sm">
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-green-600 dark:text-green-400" />
                      Data residency in your chosen AWS region
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-green-600 dark:text-green-400" />
                      Your uptime is AWS SES uptime (99.9%+ SLA)
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-green-600 dark:text-green-400" />
                      Infrastructure persists if you stop using Wraps
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-green-600 dark:text-green-400" />
                      Inherits your AWS compliance posture (SOC 2, HIPAA, etc.)
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </div>

            <p className="mt-4 text-muted-foreground text-sm">
              In January 2024, Resend suffered a security incident where a
              database API key was exposed in client-side code, exposing
              customer email metadata, domain info, and contacts. With Wraps,
              your sending infrastructure and email events are isolated in your
              own AWS account.
            </p>
          </section>

          {/* Pricing at Real Volumes */}
          <section className="mb-16">
            <h2 className="mb-2 font-semibold text-2xl">
              Pricing at real volumes
            </h2>
            <p className="mb-6 text-muted-foreground">
              Resend bundles sending cost into their platform fee with $0.90/1K
              overage. Wraps charges a platform fee separately -- you pay AWS
              directly at $0.10/1K emails.
            </p>
            <Card className="overflow-hidden py-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-4 text-left font-medium">Volume</th>
                      <th className="p-4 text-left font-medium">Resend</th>
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
                          <div>{row.resendCost}/mo</div>
                          <div className="text-xs">{row.resendTier}</div>
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
                            <Badge variant="secondary">
                              {row.savings} less
                            </Badge>
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
                Wraps platform tiers: Free (5K tracked events/mo), Starter
                $19/mo (50K events), Growth $79/mo (250K events), Scale $199/mo
                (1M events). All tiers include unlimited contacts.
              </p>
              <p>
                Resend gotchas: Pro plan hard caps at 250K emails (5x quota).
                Scale plan hard caps at 500K. CC/BCC count as separate emails.
                Marketing contacts billed separately ($40/mo for 5K contacts).
              </p>
              <p>
                At 50K/mo, pricing is comparable -- but Wraps includes 30-day
                data history vs Resend&apos;s 3-day retention on Pro.
              </p>
            </div>
          </section>

          {/* Detailed Feature Comparison */}
          <section className="mb-16">
            <h2 className="mb-6 font-semibold text-2xl">Feature comparison</h2>
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
                        <th className="p-4 text-left font-medium">Resend</th>
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
                            <FeatureCell value={feature.resend} />
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

          {/* When to Choose Resend */}
          <section className="mb-16">
            <h2 className="mb-2 font-semibold text-2xl">
              When to choose Resend
            </h2>
            <p className="mb-6 text-muted-foreground">
              Resend is a good product. Here&apos;s when it makes more sense.
            </p>
            <Card>
              <CardContent>
                <ul className="space-y-3">
                  {chooseResendReasons.map((reason) => (
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
            <h2 className="mb-2 font-semibold text-2xl">
              When to choose Wraps
            </h2>
            <p className="mb-6 text-muted-foreground">
              Wraps is built for teams that want modern DX with infrastructure
              ownership.
            </p>
            <Card className="border-primary/30">
              <CardContent>
                <ul className="space-y-3">
                  {chooseWrapsReasons.map((reason) => (
                    <li className="flex items-start gap-3" key={reason}>
                      <Check className="mt-0.5 size-5 shrink-0 text-green-600 dark:text-green-400" />
                      <span>{reason}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </section>

          {/* Switching from Resend */}
          <section className="mb-16">
            <h2 className="mb-2 font-semibold text-2xl">
              Switching from Resend
            </h2>
            <p className="mb-6 text-muted-foreground">
              Both Resend and Wraps use SES underneath. React Email templates
              work unchanged. The migration is an SDK swap and DNS update.
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
                label: "Before (Resend)",
                filename: "send.tsx",
                language: "tsx",
                code: resendCode,
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
                    wraps email setup
                  </code>{" "}
                  (~5 minutes)
                </li>
                <li>
                  Swap{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5">resend</code>{" "}
                  import for{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    @wraps.dev/email
                  </code>
                </li>
                <li>
                  Update DNS records (SPF may already be identical since both
                  use SES)
                </li>
                <li>Done -- same DX, your infrastructure, AWS pricing</li>
              </ol>
              <p className="text-muted-foreground text-sm">
                React Email templates are open source and work with any
                provider. Your domain reputation travels with you. The only
                thing that doesn&apos;t transfer is IP reputation if you were on
                Resend&apos;s shared pool.
              </p>
            </div>
          </section>

          <AlsoCompare current="/compare/resend-vs-wraps" />

          {/* CTA */}
          <section className="rounded-lg border bg-muted/30 p-8 text-center">
            <h2 className="mb-2 font-semibold text-xl">
              Deploy to your AWS in 2 minutes
            </h2>
            <p className="mb-6 text-muted-foreground">
              Free to start. No credit card required. Your infrastructure, your
              data, AWS pricing.
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
              Last updated: March 2026. We update this page as pricing and
              features change.
            </p>
            <p className="mt-1">
              Seen something inaccurate?{" "}
              <a className="text-primary underline" href="mailto:hey@wraps.dev">
                Let us know at hey@wraps.dev
              </a>
            </p>
          </div>
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}
