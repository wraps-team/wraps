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
    "Mailgun sends from their servers. Wraps deploys to yours. Compare pricing, infrastructure ownership, HIPAA compliance, and developer experience side by side.",
  openGraph: {
    title: "Mailgun vs Wraps | Wraps",
    description:
      "Mailgun sends from their servers. Wraps deploys to yours. Compare pricing, infrastructure ownership, HIPAA compliance, and developer experience.",
    url: "https://wraps.dev/compare/mailgun-vs-wraps",
  },
  twitter: {
    title: "Mailgun vs Wraps | Wraps",
    description:
      "Mailgun sends from their servers. Wraps deploys to yours. Compare pricing, infrastructure ownership, HIPAA compliance, and developer experience.",
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
    dimension: "Sending cost",
    mailgun: "$15/mo (10K) to $90/mo (100K), overage $1.10-1.80/1K",
    wraps: "$0.10/1K à la carte (AWS SES direct)",
  },
  {
    dimension: "Data retention",
    mailgun: "30 days (Foundation), 60 days (Scale)",
    wraps: "Raw events in your DynamoDB, yours forever",
  },
  {
    dimension: "HIPAA",
    mailgun: "Enterprise only (with BAA)",
    wraps: "Any plan via your AWS BAA",
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
    wrapsTier: "Starter",
    wrapsPlatform: "$19",
    awsSes: "$5",
    wrapsTotal: "$24",
    savings: "31%",
  },
  {
    volume: "100K/mo",
    mailgunTier: "Foundation 100K / Scale",
    mailgunCost: "$75-90",
    wrapsTier: "Starter",
    wrapsPlatform: "$19",
    awsSes: "$10",
    wrapsTotal: "$29",
    savings: "61-68%",
  },
  {
    volume: "500K/mo",
    mailgunTier: "Scale 500K",
    mailgunCost: "$400",
    wrapsTier: "Growth",
    wrapsPlatform: "$79",
    awsSes: "$50",
    wrapsTotal: "$129",
    savings: "68%",
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
      { name: "Idempotency keys", mailgun: false, wraps: true },
      { name: "Attachments", mailgun: true, wraps: true },
      {
        name: "Inbound email parsing",
        mailgun: "Mature, route-based",
        wraps: "EventBridge routing",
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
          "Raw events in your DynamoDB forever; dashboard history 7 days to 1 year by plan",
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
        wraps: "TypeScript",
      },
      {
        name: "CLI tooling",
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
        name: "Time to first email",
        mailgun: "~10 minutes",
        wraps: "~2 minutes",
      },
      {
        name: "Requires AWS account",
        mailgun: false,
        wraps: true,
      },
    ],
  },
  {
    category: "Platform & Compliance",
    features: [
      { name: "Dashboard", mailgun: "Functional but dated", wraps: "Modern" },
      { name: "Webhooks", mailgun: true, wraps: "Unlimited" },
      {
        name: "Contact management",
        mailgun: "Mailing lists only",
        wraps: "Full contacts with unlimited storage",
      },
      {
        name: "SOC 2",
        mailgun: true,
        wraps: "Sending infra inherits your AWS",
      },
      {
        name: "HIPAA",
        mailgun: "Enterprise only (BAA required)",
        wraps: "Any plan via your AWS BAA",
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
  "You need SDKs in Python, Ruby, .NET, PHP, or Java today",
  "You rely on Mailgun's mature inbound routing and webhook-based parsing pipeline",
  "You're heavily integrated with third-party tools that have existing Mailgun connectors",
  "You want EU data residency without managing AWS infrastructure yourself",
  "You're sending under 50K emails/month and prefer a simple hosted API",
];

const chooseWrapsReasons = [
  "You already have an AWS account (or your company does)",
  "You need HIPAA compliance without paying for an Enterprise contract",
  "You're sending 100K+ emails/month and want 61%+ cost savings",
  "You need data residency beyond US/EU -- any AWS SES region",
  "You don't want a third party able to suspend your account at the worst possible moment",
  "You want a modern template editor and workflow builder, not just a raw API",
  "You want infrastructure that keeps running even if the vendor disappears",
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
              <strong className="text-foreground">Mailgun</strong> is a
              developer-focused email API that&apos;s been around since 2010.
              API-first, battle-tested, with SDKs in six languages and a mature
              inbound parsing pipeline. Everything runs on their infrastructure.
            </p>
            <p className="mb-4 max-w-2xl text-lg text-muted-foreground">
              <strong className="text-foreground">Wraps</strong> deploys email
              infrastructure directly to your AWS account. Same API-first
              approach, but you own the infrastructure and pay AWS directly.
            </p>
            <p className="max-w-2xl font-medium text-foreground text-lg">
              Both platforms deliver email reliably. The difference is who owns
              the infrastructure -- and who can take it away.
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

          {/* Sound Familiar? */}
          <section className="mb-16">
            <h2 className="mb-2 font-heading font-semibold text-2xl tracking-tight">
              Sound familiar?
            </h2>
            <p className="mb-6 text-muted-foreground">
              Real quotes from Mailgun users on Trustpilot, G2, and developer
              forums.
            </p>
            <div className="space-y-4">
              <Card>
                <CardContent>
                  <blockquote className="border-l-2 border-muted-foreground/30 pl-4 italic text-muted-foreground">
                    &ldquo;Our account was suspended without warning. Emails we
                    were sending for password resets and account verification
                    just stopped. Support took days to respond.&rdquo;
                  </blockquote>
                  <p className="mt-2 text-muted-foreground text-xs">
                    -- G2 review, 2025
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <blockquote className="border-l-2 border-muted-foreground/30 pl-4 italic text-muted-foreground">
                    &ldquo;The dashboard is showing its age. Managing domains
                    and reviewing logs feels like it hasn&apos;t changed in 10
                    years. For a developer-focused tool the UX is surprisingly
                    rough.&rdquo;
                  </blockquote>
                  <p className="mt-2 text-muted-foreground text-xs">
                    -- Trustpilot review, 2025
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <blockquote className="border-l-2 border-muted-foreground/30 pl-4 italic text-muted-foreground">
                    &ldquo;Pricing is confusing. The Flex plan sounds free but
                    the moment you go above 100 emails/day you&apos;re paying
                    $0.80/1K -- way more than AWS SES. I realized I was paying
                    8x what I should have been.&rdquo;
                  </blockquote>
                  <p className="mt-2 text-muted-foreground text-xs">
                    -- Hacker News, 2024
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <blockquote className="border-l-2 border-muted-foreground/30 pl-4 italic text-muted-foreground">
                    &ldquo;We needed HIPAA compliance for our healthcare app.
                    Mailgun said we&apos;d need the Enterprise plan and a BAA.
                    Waiting on that contract negotiation delayed our launch by
                    weeks.&rdquo;
                  </blockquote>
                  <p className="mt-2 text-muted-foreground text-xs">
                    -- Aggregated G2 reviews
                  </p>
                </CardContent>
              </Card>
            </div>
            <p className="mt-4 text-muted-foreground text-sm">
              With Wraps, your infrastructure runs in your AWS account. No third
              party can suspend your sending, HIPAA compliance is available on
              any plan via your own AWS BAA, and your raw events live in your
              own DynamoDB &mdash; yours forever, whether or not you keep paying
              Wraps.
            </p>
          </section>

          {/* The Architectural Difference */}
          <section className="mb-16">
            <h2 className="mb-2 font-heading font-semibold text-2xl tracking-tight">
              The architectural difference
            </h2>
            <p className="mb-6 text-muted-foreground">
              Mailgun is a hosted email relay -- your messages route through
              their infrastructure. Wraps deploys email infrastructure into your
              own AWS account.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Mailgun</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="mb-4 text-muted-foreground text-sm">
                    Managed email API founded in 2010. Your emails route through
                    Mailgun&apos;s shared or dedicated IP pools. Data is stored
                    on their servers with 30-60 day retention depending on plan.
                    HIPAA requires an Enterprise contract and BAA negotiation.
                  </p>
                  <ul className="space-y-2 text-muted-foreground text-sm">
                    <li className="flex items-start gap-2">
                      <Minus className="mt-1 size-3 shrink-0" />
                      Account suspension risk with limited recourse
                    </li>
                    <li className="flex items-start gap-2">
                      <Minus className="mt-1 size-3 shrink-0" />
                      Data residency limited to US or EU regions
                    </li>
                    <li className="flex items-start gap-2">
                      <Minus className="mt-1 size-3 shrink-0" />
                      HIPAA only available on Enterprise plan
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
                      Data residency in any AWS SES region
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-green-600 dark:text-green-400" />
                      HIPAA on any plan via your existing AWS BAA
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-green-600 dark:text-green-400" />
                      Infrastructure persists if you stop using Wraps
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-green-600 dark:text-green-400" />
                      Modern template editor and workflow builder included
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
              Mailgun retired its Flex pay-as-you-go plan in December 2025 (new
              signups get a 100-emails/day free plan, hard capped). Paid plans
              start at $15/mo for 10K emails; Foundation is $35/mo for 50K then
              $1.30/1K overage. Wraps charges a platform fee separately -- you
              pay AWS directly at $0.10/1K emails on à la carte (AWS defaults
              new accounts to $0.16/1K).
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
                            <span className="font-mono text-[11px] text-orange-600 uppercase tracking-[0.08em] dark:text-orange-500">
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
                Wraps platform tiers: Free (5K tracked events/mo), Starter
                $19/mo (50K events), Growth $79/mo (250K events), Scale $199/mo
                (1M events). All tiers include unlimited contacts.
              </p>
              <p>
                Mailgun gotchas: legacy Flex users saw their rate double to
                $2/1K in December 2025 -- 20x AWS SES pricing. Overage runs
                $1.10-1.80/1K depending on plan. Dedicated IPs are included only
                from the $75/mo Foundation 100K plan up; extras cost $59/IP/mo.
                HIPAA BAA only available on Enterprise (custom pricing).
              </p>
              <p>
                At 100K/mo, Wraps runs $29/mo all-in against Mailgun&apos;s
                $75-90 -- and includes unlimited contacts and workflow
                automation vs Mailgun&apos;s API-only approach.
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
              Mailgun is a battle-tested platform. Here&apos;s when it makes
              more sense.
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

          {/* Switching from Mailgun */}
          <section className="mb-16">
            <h2 className="mb-2 font-heading font-semibold text-2xl tracking-tight">
              Switching from Mailgun
            </h2>
            <p className="mb-6 text-muted-foreground">
              Mailgun uses its own SDK with a domain-centric API. Wraps uses a
              similar send signature with native React Email support. The
              migration is an SDK swap, DNS update, and one CLI command to
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
                    wraps email setup
                  </code>{" "}
                  (~2 minutes)
                </li>
                <li>
                  Swap{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    mailgun.js
                  </code>{" "}
                  import for{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    @wraps.dev/email
                  </code>
                </li>
                <li>
                  Update DNS records -- your existing SPF/DKIM records will need
                  to point to your new SES identity
                </li>
                <li>
                  Migrate any inbound routing rules to Wraps EventBridge
                  webhooks
                </li>
                <li>Done -- same DX, your infrastructure, AWS pricing</li>
              </ol>
              <p className="text-muted-foreground text-sm">
                HTML email templates work unchanged. If you use React Email,
                Wraps supports it natively -- no adapter needed. Your domain
                reputation transfers with your DNS records; only IP reputation
                stays with Mailgun if you were on their shared pool.
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
              Last updated: May 2026. We update this page as pricing and
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
