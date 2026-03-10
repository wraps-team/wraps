import {
  ArrowRight,
  Check,
  MessageSquareQuote,
  Minus,
  Terminal,
  X,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import { AlsoCompare } from "@/app/compare/components/also-compare";
import { CompareBreadcrumb } from "@/app/compare/components/breadcrumb";
import { FeatureCell } from "@/app/compare/components/feature-cell";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Amazon SES vs Wraps - Same Infrastructure, Better DX",
  description:
    "Wraps deploys TO Amazon SES, not instead of it. Same AWS pricing, same infrastructure ownership — plus a dashboard, TypeScript SDK, and one-command setup. Compare the two approaches.",
  openGraph: {
    title: "Amazon SES vs Wraps | Wraps",
    description:
      "Wraps deploys TO Amazon SES, not instead of it. Same AWS pricing, same infrastructure ownership — plus a dashboard, TypeScript SDK, and one-command setup.",
    url: "https://wraps.dev/compare/amazon-ses-vs-wraps",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Amazon SES vs Wraps | Wraps",
    description:
      "Wraps deploys TO Amazon SES, not instead of it. Same AWS pricing, same infrastructure ownership — plus a dashboard, TypeScript SDK, and one-command setup.",
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
    dimension: "Underlying infrastructure",
    ses: "Amazon SES",
    wraps: "Amazon SES",
  },
  {
    dimension: "Setup time",
    ses: "40-80 hours (7-12 AWS services)",
    wraps: "~5 minutes (one CLI command)",
  },
  {
    dimension: "Dashboard & analytics",
    ses: "CloudWatch raw metrics (build your own)",
    wraps: "Web dashboard with per-email tracking",
  },
  {
    dimension: "Bounce/complaint handling",
    ses: "Build SNS+SQS+Lambda+DynamoDB pipeline",
    wraps: "Deployed automatically",
  },
  {
    dimension: "Data ownership",
    ses: "Your AWS account",
    wraps: "Your AWS account",
  },
  {
    dimension: "Vendor lock-in",
    ses: "None (but custom code is lock-in)",
    wraps: "None (standard AWS resources, can eject)",
  },
];

const painQuotes = [
  {
    quote: "SES Production access: A nightmare",
    source: "AWS re:Post thread title",
    sourceUrl:
      "https://repost.aws/questions/QUKZJYhDshTYWMMSp5O1pYeQ/ses-production-access-%F0%9F%99%8C-a-nightmare",
  },
  {
    quote: "Probably the worst customer experience I've ever had",
    source: "Hacker News",
    sourceUrl: "https://news.ycombinator.com/item?id=34867603",
  },
  {
    quote:
      "Setting up SES is like assembling IKEA furniture with instructions written in CloudFormation. By the time you have DKIM, SPF, bounce handling, and click tracking working, you've mass-customized an email platform.",
    source: "r/aws",
  },
  {
    quote:
      "Using Amazon for email is like going to a car dealership and buying a car for 200 bucks... they give you all the individual parts, and you've got to put the car together yourself.",
    source: "Postmark blog",
    sourceUrl: "https://postmarkapp.com/blog/amazon-ses-alternatives",
  },
];

const pricingComparison = [
  {
    volume: "10K/mo",
    sesRaw: "$1.00",
    diyTotal: "~$760/mo (yr 1)",
    diyYear2: "~$260/mo",
    wrapsTier: "Free",
    wrapsCost: "$1.00",
    wrapsBreakdown: "Free + $1 SES",
  },
  {
    volume: "50K/mo",
    sesRaw: "$5.00",
    diyTotal: "~$770/mo (yr 1)",
    diyYear2: "~$270/mo",
    wrapsTier: "Starter ($19)",
    wrapsCost: "$24.00",
    wrapsBreakdown: "$19 + $5 SES",
  },
  {
    volume: "100K/mo",
    sesRaw: "$10.00",
    diyTotal: "~$785/mo (yr 1)",
    diyYear2: "~$285/mo",
    wrapsTier: "Growth ($79)",
    wrapsCost: "$89.00",
    wrapsBreakdown: "$79 + $10 SES",
  },
  {
    volume: "500K/mo",
    sesRaw: "$50.00",
    diyTotal: "~$830/mo (yr 1)",
    diyYear2: "~$330/mo",
    wrapsTier: "Scale ($199)",
    wrapsCost: "$249.00",
    wrapsBreakdown: "$199 + $50 SES",
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
    category: "Setup & Configuration",
    features: [
      {
        name: "Domain verification (DKIM, SPF, DMARC)",
        ses: "partial",
        sesNote: "Manual DNS records, up to 72hr propagation",
        wraps: "yes",
        wrapsNote: "CLI-guided, auto Route 53 detection",
      },
      {
        name: "Bounce/complaint handling",
        ses: "partial",
        sesNote: "Build SNS+SQS+Lambda+DynamoDB pipeline",
        wraps: "yes",
        wrapsNote: "Deployed automatically",
      },
      {
        name: "Infrastructure as Code",
        ses: "partial",
        sesNote: "Write your own (20+ resource types)",
        wraps: "yes",
        wrapsNote: "Pulumi inline programs, full state mgmt",
      },
      {
        name: "One-command destroy/cleanup",
        ses: "no",
        sesNote: "Manual resource deletion",
        wraps: "yes",
        wrapsNote: "wraps email destroy",
      },
    ],
  },
  {
    category: "Developer Experience",
    features: [
      {
        name: "TypeScript SDK",
        ses: "partial",
        sesNote: "AWS SDK v3 (verbose, service-specific)",
        wraps: "yes",
        wrapsNote: "@wraps.dev/email (clean API)",
      },
      {
        name: "SMTP support",
        ses: "partial",
        sesNote: "Manual IAM user + credential generation",
        wraps: "yes",
        wrapsNote: "wraps email init --smtp",
      },
      {
        name: "Open/click tracking",
        ses: "partial",
        sesNote: "Config set + custom domain + CloudFront",
        wraps: "yes",
        wrapsNote: "Automatic with HTTPS custom domain",
      },
      {
        name: "Template editing",
        ses: "no",
        sesNote: "Raw HTML templates only",
        wraps: "yes",
        wrapsNote: "AI designer + code editor",
      },
      {
        name: "Inbound email processing",
        ses: "partial",
        sesNote: "Build receipt rules + S3 + Lambda yourself",
        wraps: "yes",
        wrapsNote: "wraps email inbound (S3 + MIME parser + webhooks)",
      },
    ],
  },
  {
    category: "Monitoring & Analytics",
    features: [
      {
        name: "Web dashboard",
        ses: "no",
        sesNote: "CloudWatch or build your own",
        wraps: "yes",
        wrapsNote: "app.wraps.dev",
      },
      {
        name: "Per-email delivery tracking",
        ses: "no",
        sesNote: "Aggregate CloudWatch metrics only",
        wraps: "yes",
        wrapsNote: "Event history with filtering",
      },
      {
        name: "Alerting (bounce rate, complaint rate)",
        ses: "partial",
        sesNote: "Build CloudWatch alarms yourself",
        wraps: "yes",
        wrapsNote: "Deployed automatically",
      },
      {
        name: "Webhook delivery",
        ses: "partial",
        sesNote: "Build EventBridge+Lambda+HTTP yourself",
        wraps: "yes",
        wrapsNote: "Built-in, configurable via CLI",
      },
    ],
  },
  {
    category: "Operations & Team",
    features: [
      {
        name: "Team collaboration",
        ses: "partial",
        sesNote: "IAM users/roles only",
        wraps: "yes",
        wrapsNote: "Organization-based with roles",
      },
      {
        name: "Suppression list management",
        ses: "partial",
        sesNote: "Manual API calls, case-sensitive",
        wraps: "yes",
        wrapsNote: "Automatic + dashboard visibility",
      },
      {
        name: "Data ownership",
        ses: "yes",
        wraps: "yes",
      },
      {
        name: "No vendor lock-in",
        ses: "yes",
        sesNote: "But custom code is its own lock-in",
        wraps: "yes",
        wrapsNote: "Standard AWS resources, can eject anytime",
      },
    ],
  },
];

const chooseSesReasons = [
  "You have a dedicated platform/infrastructure team with deep AWS expertise",
  "You already built and maintain a production SES pipeline you're happy with",
  "You need configuration options Wraps doesn't expose yet (e.g., custom IP pools, Mail Manager rules)",
  "Compliance requirements mandate direct AWS service usage with no third-party tooling",
  "You send 50M+ emails/month and need custom volume tier pricing from AWS",
];

const chooseWrapsReasons = [
  "You want SES pricing and infrastructure ownership without the 40-80 hour setup",
  "You need a dashboard, analytics, and team features without building them yourself",
  "You're evaluating SES but intimidated by the sandbox process and multi-service architecture",
  "You already use SES and want to add monitoring, bounce handling, and DX on top",
  "Your team's time is better spent on product features than email infrastructure plumbing",
  "You want the ability to tear down and redeploy cleanly with infrastructure as code",
];

export default function AmazonSesVsWrapsPage() {
  return (
    <div className="min-h-screen bg-background">
      <LandingNavbar />
      <Script id="breadcrumb-jsonld" type="application/ld+json">
        {JSON.stringify(breadcrumbJsonLd)}
      </Script>

      <main className="container mx-auto px-4 pt-24 pb-16">
        <div className="mx-auto max-w-4xl">
          <CompareBreadcrumb competitor="Amazon SES vs Wraps" />

          {/* =========================================== */}
          {/* 1. HERO */}
          {/* =========================================== */}
          <section className="mb-16">
            <Badge className="mb-4" variant="secondary">
              Comparison
            </Badge>
            <h1 className="mb-4 font-bold text-4xl tracking-tight sm:text-5xl">
              Amazon SES vs Wraps
            </h1>
            <p className="mb-3 max-w-2xl text-lg text-muted-foreground">
              <strong className="text-foreground">Amazon SES</strong> is AWS's
              email sending service — cheap, scalable, and production-grade.{" "}
              <strong className="text-foreground">Wraps</strong> deploys
              production-ready infrastructure <em>to</em> SES in your AWS
              account with one command.
            </p>
            <p className="max-w-2xl text-lg text-muted-foreground">
              This isn't "SES vs Wraps" — it's{" "}
              <strong className="text-foreground">
                raw SES vs SES + Wraps
              </strong>
              . Same service underneath. Same AWS bill. The difference is
              whether you spend 40-80 hours of engineering time building the
              supporting infrastructure, or let Wraps deploy it in 5 minutes.
            </p>
          </section>

          {/* =========================================== */}
          {/* 2. TL;DR COMPARISON TABLE */}
          {/* =========================================== */}
          <section className="mb-16">
            <h2 className="mb-6 font-semibold text-2xl">
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
          {/* 3. SOUND FAMILIAR? */}
          {/* =========================================== */}
          <section className="mb-16">
            <div className="mb-6 flex items-center gap-3">
              <MessageSquareQuote className="size-6 text-primary" />
              <h2 className="font-semibold text-2xl">Sound Familiar?</h2>
            </div>
            <p className="mb-6 text-muted-foreground">
              If you've spent time setting up SES, you've probably felt some of
              this. These are real quotes from developers who've been through
              it.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {painQuotes.map((item) => (
                <Card key={item.quote}>
                  <CardContent>
                    <blockquote className="mb-3 border-l-2 border-primary/30 pl-4 text-foreground italic">
                      "{item.quote}"
                    </blockquote>
                    {"sourceUrl" in item ? (
                      <a
                        className="text-muted-foreground text-xs transition-colors hover:text-foreground"
                        href={item.sourceUrl}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        — {item.source}
                      </a>
                    ) : (
                      <p className="text-muted-foreground text-xs">
                        — {item.source}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          {/* =========================================== */}
          {/* 4. THE ARCHITECTURAL DIFFERENCE */}
          {/* =========================================== */}
          <section className="mb-16">
            <h2 className="mb-4 font-semibold text-2xl">
              The Architectural Difference
            </h2>
            <p className="mb-6 text-muted-foreground">
              Most "SES alternatives" replace SES with their own infrastructure.
              You lose your sending reputation, rewrite your DNS, accept vendor
              lock-in, and pay 5-20x more per email.
            </p>
            <p className="mb-6 text-muted-foreground">
              Wraps is different. It deploys <em>to</em> SES, not instead of it.
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
                      <X className="mt-0.5 size-4 shrink-0 text-red-500" />
                      Abandon your SES infrastructure
                    </li>
                    <li className="flex items-start gap-2">
                      <X className="mt-0.5 size-4 shrink-0 text-red-500" />
                      Lose sending reputation and warm-up history
                    </li>
                    <li className="flex items-start gap-2">
                      <X className="mt-0.5 size-4 shrink-0 text-red-500" />
                      Change DNS records (new DKIM, new SPF)
                    </li>
                    <li className="flex items-start gap-2">
                      <X className="mt-0.5 size-4 shrink-0 text-red-500" />
                      Rewrite sending code to a new API
                    </li>
                    <li className="flex items-start gap-2">
                      <X className="mt-0.5 size-4 shrink-0 text-red-500" />
                      Accept vendor lock-in, pay 5-20x more per email
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
                      <Check className="mt-0.5 size-4 shrink-0 text-green-600 dark:text-green-400" />
                      SES stays — same service, account, region
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-green-600 dark:text-green-400" />
                      Same DKIM keys, SPF records, DMARC policy
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-green-600 dark:text-green-400" />
                      Same sending reputation — zero warm-up risk
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-green-600 dark:text-green-400" />
                      Existing sending code continues unchanged
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-green-600 dark:text-green-400" />
                      Same AWS bill, same compliance posture
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </div>

            <Card className="mt-6 bg-muted/30">
              <CardContent>
                <p className="text-sm">
                  <strong>What Wraps deploys to your account</strong>: SES
                  configuration set, EventBridge rules, SQS queues + DLQ, Lambda
                  event processor, DynamoDB event history, CloudWatch alarms,
                  ACM certificate + CloudFront for HTTPS tracking, IAM roles
                  with least-privilege policies — all namespaced{" "}
                  <code className="rounded bg-muted px-1 text-xs">
                    wraps-email-*
                  </code>{" "}
                  and managed via Pulumi state for clean upgrades and teardown.
                </p>
              </CardContent>
            </Card>
          </section>

          {/* =========================================== */}
          {/* 5. PRICING AT REAL VOLUMES */}
          {/* =========================================== */}
          <section className="mb-16">
            <h2 className="mb-4 font-semibold text-2xl">
              Pricing at Real Volumes
            </h2>
            <p className="mb-6 text-muted-foreground">
              SES is cheap. Production SES infrastructure is not. The per-email
              cost is identical whether you use raw SES or Wraps — because Wraps
              deploys SES to your account at $0.10 per 1,000 emails. The
              question is whether you pay with{" "}
              <strong className="text-foreground">engineering time</strong>{" "}
              (DIY) or a{" "}
              <strong className="text-foreground">platform fee</strong> (Wraps).
            </p>

            <Card className="overflow-hidden py-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-4 text-left font-medium">Volume</th>
                      <th className="p-4 text-left font-medium">SES Only</th>
                      <th className="p-4 text-left font-medium">
                        DIY Total
                        <span className="block font-normal text-muted-foreground text-xs">
                          Year 1 / Year 2+
                        </span>
                      </th>
                      <th className="p-4 text-left font-medium text-primary">
                        Wraps
                        <span className="block font-normal text-muted-foreground text-xs">
                          Platform + SES
                        </span>
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
                          <span className="block">{row.diyTotal}</span>
                          <span className="text-xs">{row.diyYear2}</span>
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
                <strong className="text-foreground">DIY Total</strong> includes
                SES sending, supporting AWS services (Lambda, DynamoDB,
                CloudWatch, SQS, EventBridge, SNS), and amortized engineering
                time (estimated 60 hours initial build at $150/hr = $750/mo year
                1, reducing to ~$250/mo ongoing maintenance year 2+).
              </p>
              <p>
                <strong className="text-foreground">Wraps tiers</strong>: Free
                (5K tracked events/mo), Starter $19/mo (50K events), Growth
                $79/mo (250K events), Scale $199/mo (1M events). SES charges are
                billed by AWS directly at $0.10/1K emails.{" "}
                <a className="text-primary underline" href="/platform#pricing">
                  See what each tier includes
                </a>
              </p>
            </div>
          </section>

          {/* =========================================== */}
          {/* 6. DETAILED FEATURE COMPARISON */}
          {/* =========================================== */}
          <section className="mb-16">
            <h2 className="mb-6 font-semibold text-2xl">
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
              <Check className="mb-0.5 inline size-3 text-green-600 dark:text-green-400" />{" "}
              = built-in or included,{" "}
              <Minus className="mb-0.5 inline size-3 text-yellow-600 dark:text-yellow-400" />{" "}
              = possible but requires manual setup,{" "}
              <X className="mb-0.5 inline size-3 text-red-500 dark:text-red-400" />{" "}
              = not available
            </p>
          </section>

          {/* =========================================== */}
          {/* 7. WHEN TO CHOOSE RAW SES */}
          {/* =========================================== */}
          <section className="mb-16">
            <h2 className="mb-4 font-semibold text-2xl">
              When to Choose Raw SES
            </h2>
            <p className="mb-4 text-muted-foreground">
              Raw SES is the right choice when you have the team and expertise
              to build and maintain production email infrastructure — and you
              need that level of control.
            </p>
            <Card>
              <CardContent>
                <ul className="space-y-3">
                  {chooseSesReasons.map((reason) => (
                    <li className="flex items-start gap-3" key={reason}>
                      <Check className="mt-0.5 size-5 shrink-0 text-green-600 dark:text-green-400" />
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
            <h2 className="mb-4 font-semibold text-2xl">
              When to Choose Wraps
            </h2>
            <p className="mb-4 text-muted-foreground">
              Wraps is the right choice when you want everything SES offers —
              pricing, ownership, scale — without the multi-week setup and
              ongoing maintenance.
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
              <h2 className="font-semibold text-2xl">
                Getting Started with Wraps
              </h2>
            </div>
            <p className="mb-6 text-muted-foreground">
              One command deploys production-ready email infrastructure to your
              AWS account — SES configuration, bounce handling, event tracking,
              alerting, and HTTPS open/click tracking. No credit card required
              for the free tier.
            </p>
            <Card className="bg-muted/30">
              <CardContent>
                <div className="rounded-lg bg-background p-4 font-mono text-sm">
                  <span className="text-muted-foreground">$</span>{" "}
                  <span>npx @wraps.dev/cli email init</span>
                </div>
                <p className="mt-4 text-muted-foreground text-sm">
                  The CLI walks you through AWS account connection, domain
                  verification, DNS record creation, and infrastructure
                  deployment. If you already have SES configured, Wraps detects
                  your existing domain verification and adds supporting
                  infrastructure on top — no DNS changes, no reputation risk.
                </p>
              </CardContent>
            </Card>
          </section>

          {/* =========================================== */}
          <AlsoCompare current="/compare/amazon-ses-vs-wraps" />

          {/* CTA */}
          {/* =========================================== */}
          <section className="mb-16 rounded-lg border bg-muted/30 p-8 text-center">
            <h2 className="mb-2 font-semibold text-xl">
              SES power, without the setup pain
            </h2>
            <p className="mb-6 text-muted-foreground">
              Deploy production email infrastructure to your AWS account in
              minutes. Same SES pricing, your infrastructure, your email events.
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
              <strong className="text-foreground">Last updated:</strong> March
              2026. Pricing verified against{" "}
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
                href="mailto:hey@wraps.dev"
              >
                hey@wraps.dev
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
