import {
  AlertTriangle,
  ArrowRight,
  Check,
  Clock,
  Code,
  DollarSign,
  ExternalLink,
  MessageSquareQuote,
  Minus,
  Server,
  ShoppingCart,
  Terminal,
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
  title:
    "Klaviyo vs Wraps - E-commerce Marketing Platform vs Developer-First Email Infrastructure",
  description:
    "Compare Klaviyo and Wraps: profile-based marketing platform vs BYOC email infrastructure. See pricing at real volumes, architecture differences, and which is right for your team.",
  openGraph: {
    title: "Klaviyo vs Wraps | Wraps",
    description:
      "Compare Klaviyo and Wraps: profile-based marketing platform vs BYOC email infrastructure at AWS pricing.",
    url: "https://wraps.dev/compare/klaviyo-vs-wraps",
  },
  twitter: {
    title: "Klaviyo vs Wraps | Wraps",
    description:
      "Compare Klaviyo and Wraps: profile-based marketing platform vs BYOC email infrastructure at AWS pricing.",
  },
  alternates: {
    canonical: "https://wraps.dev/compare/klaviyo-vs-wraps",
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
      name: "Klaviyo vs Wraps",
      item: "https://wraps.dev/compare/klaviyo-vs-wraps",
    },
  ],
};

const tldrComparison = [
  {
    dimension: "Built for",
    klaviyo: "E-commerce marketers (Shopify-first)",
    wraps: "SaaS developers (API-first)",
  },
  {
    dimension: "Pricing model",
    klaviyo: "Per active profile (contacts)",
    wraps: "Platform tier + AWS SES sends",
  },
  {
    dimension: "Contact cost",
    klaviyo: "$0.006-$0.014 per profile/month",
    wraps: "$0 (unlimited on all tiers)",
  },
  {
    dimension: "Infrastructure",
    klaviyo: "Klaviyo's multi-tenant (SendGrid)",
    wraps: "Your AWS account (SES)",
  },
  {
    dimension: "Data on cancellation",
    klaviyo: "All data permanently deleted",
    wraps: "Everything stays in your AWS",
  },
  {
    dimension: "Template approach",
    klaviyo: "GUI drag-and-drop first",
    wraps: "AI designer + code (React Email, TypeScript)",
  },
];

const pricingComparison = [
  {
    volume: "10K",
    klaviyoProfiles: "~1,000",
    klaviyoCost: "$30",
    wrapsPlatform: "$0",
    awsSes: "$1",
    wrapsTotal: "$1",
    savings: "30x",
  },
  {
    volume: "50K",
    klaviyoProfiles: "~5,000",
    klaviyoCost: "$100",
    wrapsPlatform: "$19",
    awsSes: "$5",
    wrapsTotal: "$24",
    savings: "4.2x",
  },
  {
    volume: "100K",
    klaviyoProfiles: "~10,000",
    klaviyoCost: "$150",
    wrapsPlatform: "$19",
    awsSes: "$10",
    wrapsTotal: "$29",
    savings: "5.2x",
  },
  {
    volume: "500K",
    klaviyoProfiles: "~50,000",
    klaviyoCost: "$720",
    wrapsPlatform: "$79",
    awsSes: "$50",
    wrapsTotal: "$129",
    savings: "5.6x",
  },
  {
    volume: "1M",
    klaviyoProfiles: "~100,000",
    klaviyoCost: "$1,380",
    wrapsPlatform: "$199",
    awsSes: "$100",
    wrapsTotal: "$299",
    savings: "4.6x",
  },
];

const featureComparison = [
  {
    category: "Sending",
    features: [
      {
        name: "Transactional email",
        klaviyo: "Via flows only (requires approval)",
        wraps: "First-class API",
        klaviyoStatus: "partial",
        wrapsStatus: "yes",
      },
      {
        name: "Marketing / broadcast email",
        klaviyo: "Visual campaign builder",
        wraps: "Platform broadcasts",
        klaviyoStatus: "yes",
        wrapsStatus: "yes",
      },
      {
        name: "Send via API",
        klaviyo: "Not supported (event-triggered only)",
        wraps: "SDK and REST API",
        klaviyoStatus: "no",
        wrapsStatus: "yes",
      },
      {
        name: "Dedicated sending IPs",
        klaviyo: "By qualification only (CSM required)",
        wraps: "Your own SES, your reputation",
        klaviyoStatus: "partial",
        wrapsStatus: "yes",
      },
      {
        name: "SMS",
        klaviyo: "Bundled, credit-based (don't roll over)",
        wraps: "AWS End User Messaging",
        klaviyoStatus: "yes",
        wrapsStatus: "yes",
      },
    ],
  },
  {
    category: "Developer Experience",
    features: [
      {
        name: "TypeScript SDK",
        klaviyo: "Auto-generated OpenAPI wrapper",
        wraps: "Hand-crafted, type-safe",
        klaviyoStatus: "partial",
        wrapsStatus: "yes",
      },
      {
        name: "CLI",
        klaviyo: "Content management only",
        wraps: "Infrastructure deployment + management",
        klaviyoStatus: "partial",
        wrapsStatus: "yes",
      },
      {
        name: "React Email support",
        klaviyo: "No",
        wraps: "Yes",
        klaviyoStatus: "no",
        wrapsStatus: "yes",
      },
      {
        name: "Version-controlled templates",
        klaviyo: "No (GUI only)",
        wraps: "Code-first, Git-native",
        klaviyoStatus: "no",
        wrapsStatus: "yes",
      },
      {
        name: "Infrastructure as code",
        klaviyo: "No",
        wraps: "Pulumi stacks via CLI",
        klaviyoStatus: "no",
        wrapsStatus: "yes",
      },
    ],
  },
  {
    category: "Data & Infrastructure",
    features: [
      {
        name: "Unlimited contacts",
        klaviyo: "Priced per profile",
        wraps: "All tiers",
        klaviyoStatus: "no",
        wrapsStatus: "yes",
      },
      {
        name: "Data ownership",
        klaviyo: "Klaviyo's servers",
        wraps: "Your AWS account",
        klaviyoStatus: "no",
        wrapsStatus: "yes",
      },
      {
        name: "BYOC (Bring Your Own Cloud)",
        klaviyo: "No",
        wraps: "Core architecture",
        klaviyoStatus: "no",
        wrapsStatus: "yes",
      },
      {
        name: "Client-side JS required",
        klaviyo: "Yes (known PageSpeed impact)",
        wraps: "No (server-side only)",
        klaviyoStatus: "no",
        wrapsStatus: "yes",
      },
      {
        name: "Data survives cancellation",
        klaviyo: "No (permanently deleted)",
        wraps: "Yes (it's in your AWS)",
        klaviyoStatus: "no",
        wrapsStatus: "yes",
      },
    ],
  },
  {
    category: "Marketing & Automation",
    features: [
      {
        name: "Visual flow builder",
        klaviyo: "Mature, omnichannel, 350+ integrations",
        wraps: "React Flow canvas, 10 node types, workflows-as-code",
        klaviyoStatus: "yes",
        wrapsStatus: "yes",
      },
      {
        name: "A/B testing in flows",
        klaviyo: "Built-in split testing",
        wraps: "Not yet",
        klaviyoStatus: "yes",
        wrapsStatus: "no",
      },
      {
        name: "Workflows-as-code (CLI)",
        klaviyo: "No (GUI only)",
        wraps: "TypeScript DSL, Git-versioned, CLI push",
        klaviyoStatus: "no",
        wrapsStatus: "yes",
      },
      {
        name: "AI workflow generation",
        klaviyo: "No",
        wraps: "Describe in natural language, get a flow",
        klaviyoStatus: "no",
        wrapsStatus: "yes",
      },
      {
        name: "Predictive analytics (CLV, churn)",
        klaviyo: "Built-in CDP",
        wraps: "No",
        klaviyoStatus: "yes",
        wrapsStatus: "no",
      },
      {
        name: "Revenue attribution",
        klaviyo: "Native e-commerce",
        wraps: "No",
        klaviyoStatus: "yes",
        wrapsStatus: "no",
      },
      {
        name: "Shopify integration",
        klaviyo: "Best-in-class (Shopify investor)",
        wraps: "No",
        klaviyoStatus: "yes",
        wrapsStatus: "no",
      },
      {
        name: "Template editing",
        klaviyo: "Drag-and-drop editor",
        wraps: "AI designer + code editor",
        klaviyoStatus: "yes",
        wrapsStatus: "yes",
      },
      {
        name: "350+ pre-built integrations",
        klaviyo: "Yes",
        wraps: "No",
        klaviyoStatus: "yes",
        wrapsStatus: "no",
      },
    ],
  },
];

const migrationTimeline = [
  { phase: "Audit existing Klaviyo setup", duration: "1-2 days" },
  { phase: "Set up Wraps infrastructure", duration: "1-3 days" },
  { phase: "DNS propagation", duration: "24-48 hours" },
  { phase: "IP/domain warmup", duration: "2-4 weeks" },
  { phase: "Rebuild automations (if applicable)", duration: "1-2 weeks" },
  { phase: "Parallel sending validation", duration: "1-2 weeks" },
  { phase: "Full cutover", duration: "1 day" },
];

export default function KlaviyoVsWrapsPage() {
  return (
    <div className="min-h-screen bg-background">
      <LandingNavbar />
      <Script id="breadcrumb-jsonld" type="application/ld+json">
        {JSON.stringify(breadcrumbJsonLd)}
      </Script>

      <main className="container mx-auto px-4 pt-24 pb-16">
        <div className="mx-auto max-w-4xl">
          <CompareBreadcrumb competitor="Klaviyo vs Wraps" />

          {/* Hero */}
          <section className="mb-16">
            <Badge className="mb-4" variant="secondary">
              Comparison
            </Badge>
            <h1 className="mb-4 font-bold text-4xl tracking-tight sm:text-5xl">
              Klaviyo vs Wraps
            </h1>
            <p className="mb-3 text-lg text-muted-foreground">
              <strong className="text-foreground">Klaviyo</strong> is an
              e-commerce marketing automation platform with deep Shopify
              integration, predictive analytics, and a visual flow builder.{" "}
              <strong className="text-foreground">Wraps</strong> deploys email
              infrastructure to your AWS account with a TypeScript SDK, CLI, and
              AWS-direct pricing.
            </p>
            <p className="text-lg text-muted-foreground">
              These are different products with overlapping capabilities.
              Klaviyo is a marketing platform built for e-commerce. Wraps is
              developer-first email infrastructure with a visual workflow
              builder, broadcasts, segments, and contacts -- deployed to your
              AWS account at transparent pricing.
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
                      <th className="p-4 text-left font-medium">Klaviyo</th>
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
                          {row.klaviyo}
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
                    &ldquo;Anyone else getting screwed by Klaviyo&rsquo;s
                    pricing? I&rsquo;m being charged for 50K+ profiles when only
                    15K actively engage. Bill keeps climbing while email revenue
                    stays flat.&rdquo;
                  </blockquote>
                  <p className="mt-3 text-muted-foreground/70 text-xs">
                    Shopify Community thread
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent>
                  <blockquote className="border-l-2 border-muted-foreground/30 pl-4 text-muted-foreground italic">
                    &ldquo;The price curve is steep -- going from 500 to 25,000
                    contacts takes you from $20/month to roughly $400/month, a
                    20x increase.&rdquo;
                  </blockquote>
                  <p className="mt-3 text-muted-foreground/70 text-xs">
                    Spoks Klaviyo Review
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent>
                  <blockquote className="border-l-2 border-muted-foreground/30 pl-4 text-muted-foreground italic">
                    &ldquo;The worst customer support that doesn&rsquo;t match
                    the very high price they charge.&rdquo;
                  </blockquote>
                  <p className="mt-3 text-muted-foreground/70 text-xs">
                    Trustpilot review (Klaviyo: 2.1/5 TrustScore, 52% 1-star)
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent>
                  <blockquote className="border-l-2 border-muted-foreground/30 pl-4 text-muted-foreground italic">
                    &ldquo;PageSpeed score dropped from 88 to 48 after
                    installing Klaviyo. GTMetrix score dropped from B (88%) to D
                    (56%).&rdquo;
                  </blockquote>
                  <p className="mt-3 text-muted-foreground/70 text-xs">
                    Klaviyo Community thread
                  </p>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* The Architectural Difference */}
          <section className="mb-16">
            <div className="mb-6 flex items-center gap-3">
              <Server className="size-6 text-primary" />
              <h2 className="font-semibold text-2xl">
                The Architectural Difference
              </h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    Klaviyo: Multi-Tenant SaaS
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-muted-foreground text-sm">
                    <li className="flex items-start gap-2">
                      <Minus className="mt-0.5 size-4 shrink-0" />
                      Your emails send through Klaviyo&rsquo;s shared SendGrid
                      infrastructure
                    </li>
                    <li className="flex items-start gap-2">
                      <Minus className="mt-0.5 size-4 shrink-0" />
                      Shared IPs by default -- your reputation depends on other
                      senders
                    </li>
                    <li className="flex items-start gap-2">
                      <Minus className="mt-0.5 size-4 shrink-0" />
                      All data stored on Klaviyo&rsquo;s AWS, not yours
                    </li>
                    <li className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-yellow-600 dark:text-yellow-400" />
                      Close your account = all data permanently deleted
                    </li>
                    <li className="flex items-start gap-2">
                      <Minus className="mt-0.5 size-4 shrink-0" />
                      August 2022 data breach exposed 38 accounts via
                      centralized infrastructure
                    </li>
                  </ul>
                </CardContent>
              </Card>
              <Card className="border-primary/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    Wraps: Your AWS, Your Infrastructure
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-muted-foreground text-sm">
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-green-600 dark:text-green-400" />
                      SES deployed to your AWS account -- you own the sending
                      infrastructure
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-green-600 dark:text-green-400" />
                      Dedicated IPs in your account, reputation you control
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-green-600 dark:text-green-400" />
                      Email events live in your DynamoDB. Contacts exportable
                      anytime.
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-green-600 dark:text-green-400" />
                      Stop using Wraps = everything keeps running
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-green-600 dark:text-green-400" />
                      Zero stored credentials -- OIDC temporary access only
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* Pricing at Real Volumes */}
          <section className="mb-16">
            <div className="mb-6 flex items-center gap-3">
              <DollarSign className="size-6 text-primary" />
              <h2 className="font-semibold text-2xl">
                Pricing at Real Volumes
              </h2>
            </div>
            <p className="mb-4 text-muted-foreground text-sm">
              Klaviyo prices by <strong>active profiles</strong> (contacts you
              store, whether you email them or not). Wraps charges a flat
              platform fee + AWS SES at $0.10/1,000 emails. Wraps has{" "}
              <strong>unlimited contacts</strong> on all tiers.
            </p>
            <Card className="overflow-hidden py-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-4 text-left font-medium">Emails/mo</th>
                      <th className="p-4 text-left font-medium">
                        Klaviyo Profiles
                      </th>
                      <th className="p-4 text-left font-medium">
                        Klaviyo Cost
                      </th>
                      <th className="p-4 text-left font-medium text-primary">
                        Wraps Total
                      </th>
                      <th className="p-4 text-left font-medium">Savings</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {pricingComparison.map((row) => (
                      <tr key={row.volume}>
                        <td className="p-4 font-medium">{row.volume}</td>
                        <td className="p-4 text-muted-foreground">
                          {row.klaviyoProfiles}
                        </td>
                        <td className="p-4 text-muted-foreground">
                          {row.klaviyoCost}/mo
                        </td>
                        <td className="p-4 font-medium text-primary">
                          {row.wrapsTotal}/mo
                        </td>
                        <td className="p-4">
                          <Badge variant="secondary">{row.savings}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
            <div className="mt-4 space-y-2 text-muted-foreground text-sm">
              <p>
                Wraps total = platform fee + AWS SES ($0.10/1K emails), paid
                directly to AWS.{" "}
                <a
                  className="text-primary underline"
                  href="/tools/ses-calculator"
                >
                  Calculate your exact cost
                </a>
              </p>
              <p>
                <strong>The gap widens with contact growth:</strong> Growing
                your list from 5K to 100K profiles costs $0 extra with Wraps.
                With Klaviyo, that growth alone takes you from $100/mo to
                $1,380/mo -- even if you send the exact same volume.
              </p>
            </div>
          </section>

          {/* Klaviyo Hidden Costs */}
          <section className="mb-16">
            <h3 className="mb-4 font-semibold text-lg">
              Klaviyo&rsquo;s Hidden Costs
            </h3>
            <Card>
              <CardContent>
                <ul className="space-y-3 text-sm">
                  <li className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-yellow-600 dark:text-yellow-400" />
                    <span>
                      <strong>Profile-based billing:</strong> You pay for
                      contacts you never email. Feb 2025 billing change shifted
                      from &ldquo;emailed contacts&rdquo; to &ldquo;all active
                      profiles&rdquo; -- the third price increase in 4 years.
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-yellow-600 dark:text-yellow-400" />
                    <span>
                      <strong>Auto-upgrade:</strong> Exceeding profile limits
                      triggers automatic tier bumps at the next billing cycle.
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-yellow-600 dark:text-yellow-400" />
                    <span>
                      <strong>Klaviyo One surcharge:</strong> Mandatory 20% fee
                      once you spend over $10K/month.
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-yellow-600 dark:text-yellow-400" />
                    <span>
                      <strong>90-day suppression lock:</strong> Suppress a
                      profile and you can&rsquo;t unsuppress for 3 months.
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-yellow-600 dark:text-yellow-400" />
                    <span>
                      <strong>SMS credits don&rsquo;t roll over:</strong>{" "}
                      Use-it-or-lose-it each month.
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-yellow-600 dark:text-yellow-400" />
                    <span>
                      <strong>CDP add-on:</strong> Advanced data platform starts
                      at $500+/month.
                    </span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </section>

          {/* Detailed Feature Comparison */}
          <section className="mb-16">
            <div className="mb-6 flex items-center gap-3">
              <Code className="size-6 text-primary" />
              <h2 className="font-semibold text-2xl">Feature Comparison</h2>
            </div>
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
                            <th className="p-4 text-left font-medium">
                              Klaviyo
                            </th>
                            <th className="p-4 text-left font-medium text-primary">
                              Wraps
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {category.features.map((feature) => (
                            <tr key={feature.name}>
                              <td className="p-4 font-medium">
                                {feature.name}
                              </td>
                              <td className="p-4">
                                <div className="flex items-center gap-2">
                                  <FeatureCell value={feature.klaviyoStatus} />
                                  <span className="text-muted-foreground">
                                    {feature.klaviyo}
                                  </span>
                                </div>
                              </td>
                              <td className="p-4">
                                <div className="flex items-center gap-2">
                                  <FeatureCell value={feature.wrapsStatus} />
                                  <span className="text-muted-foreground">
                                    {feature.wraps}
                                  </span>
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
          </section>

          {/* When to Choose Klaviyo */}
          <section className="mb-16">
            <div className="mb-6 flex items-center gap-3">
              <ShoppingCart className="size-6 text-primary" />
              <h2 className="font-semibold text-2xl">
                When Klaviyo Is the Better Choice
              </h2>
            </div>
            <Card>
              <CardContent>
                <p className="mb-4 text-muted-foreground text-sm">
                  Klaviyo has genuine strengths that Wraps does not match. If
                  these describe your situation, Klaviyo is likely the right
                  tool.
                </p>
                <ul className="space-y-3 text-sm">
                  <li className="flex items-start gap-3">
                    <Check className="mt-0.5 size-4 shrink-0 text-green-600 dark:text-green-400" />
                    <span>
                      <strong>You run a Shopify store</strong> and need deep,
                      native e-commerce integration -- abandoned cart flows,
                      product recommendations, revenue attribution. Shopify
                      invested $100M in Klaviyo for a reason.
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="mt-0.5 size-4 shrink-0 text-green-600 dark:text-green-400" />
                    <span>
                      <strong>Your team is marketing-led,</strong> not
                      engineering-led. Klaviyo&rsquo;s visual flow builder,
                      drag-and-drop templates, and AI features are built for
                      marketers who don&rsquo;t write code.
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="mt-0.5 size-4 shrink-0 text-green-600 dark:text-green-400" />
                    <span>
                      <strong>
                        You need predictive analytics and CDP features
                      </strong>{" "}
                      -- churn risk scores, customer lifetime value, expected
                      next order date, RFM segmentation. Klaviyo&rsquo;s
                      built-in CDP is genuinely best-in-class for e-commerce.
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="mt-0.5 size-4 shrink-0 text-green-600 dark:text-green-400" />
                    <span>
                      <strong>You want 350+ pre-built integrations</strong> with
                      e-commerce platforms, payment processors, and marketing
                      tools out of the box.
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="mt-0.5 size-4 shrink-0 text-green-600 dark:text-green-400" />
                    <span>
                      <strong>You need omnichannel marketing automation</strong>{" "}
                      -- email, SMS, push, and WhatsApp in a single visual
                      canvas with conditional logic and A/B testing.
                    </span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </section>

          {/* When to Choose Wraps */}
          <section className="mb-16">
            <div className="mb-6 flex items-center gap-3">
              <Terminal className="size-6 text-primary" />
              <h2 className="font-semibold text-2xl">
                When Wraps Is the Better Choice
              </h2>
            </div>
            <Card className="border-primary/30">
              <CardContent>
                <ul className="space-y-3 text-sm">
                  <li className="flex items-start gap-3">
                    <Check className="mt-0.5 size-4 shrink-0 text-green-600 dark:text-green-400" />
                    <span>
                      <strong>You&rsquo;re a SaaS company</strong> that needs
                      transactional email (password resets, invoices,
                      notifications) with a real API -- not a marketing platform
                      that bolts transactional onto flows.
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="mt-0.5 size-4 shrink-0 text-green-600 dark:text-green-400" />
                    <span>
                      <strong>
                        You&rsquo;re paying $700+/month at Klaviyo
                      </strong>{" "}
                      and your engineering team wants AWS-level economics. The
                      same 500K emails/month costs $129/mo with Wraps (5.6x
                      cheaper).
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="mt-0.5 size-4 shrink-0 text-green-600 dark:text-green-400" />
                    <span>
                      <strong>
                        You want to own your sending infrastructure
                      </strong>{" "}
                      -- SES in your AWS account with domain-based reputation
                      you control. Dedicated IPs available when you need them.
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="mt-0.5 size-4 shrink-0 text-green-600 dark:text-green-400" />
                    <span>
                      <strong>
                        Your contact list is large but send volume is moderate.
                      </strong>{" "}
                      With Klaviyo, 100K profiles costs $1,380/mo whether you
                      email them or not. With Wraps, contacts are unlimited and
                      free -- you pay only for sends.
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="mt-0.5 size-4 shrink-0 text-green-600 dark:text-green-400" />
                    <span>
                      <strong>
                        You want workflows you can version-control.
                      </strong>{" "}
                      Wraps has a visual flow builder with 10 node types plus a
                      TypeScript DSL you can push from CLI, store in Git, and
                      deploy alongside your app code.
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="mt-0.5 size-4 shrink-0 text-green-600 dark:text-green-400" />
                    <span>
                      <strong>You care about site performance.</strong>{" "}
                      Klaviyo&rsquo;s JS has been documented to drop PageSpeed
                      scores by 40+ points. Wraps is server-side only -- no
                      client-side script required.
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="mt-0.5 size-4 shrink-0 text-green-600 dark:text-green-400" />
                    <span>
                      <strong>Data sovereignty matters to you.</strong> Your
                      sending infrastructure and email events stay in your AWS
                      account. Contacts are exportable anytime. Cancel Wraps and
                      your SES keeps running. Cancel Klaviyo and everything is
                      permanently deleted.
                    </span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </section>

          {/* Switching from Klaviyo */}
          <section className="mb-16">
            <div className="mb-6 flex items-center gap-3">
              <Clock className="size-6 text-primary" />
              <h2 className="font-semibold text-2xl">Switching from Klaviyo</h2>
            </div>
            <p className="mb-4 text-muted-foreground text-sm">
              Migrating from Klaviyo is a 4-8 week process. The good news: once
              you move to Wraps, this is the last migration. You own the
              infrastructure permanently.
            </p>
            <Card className="mb-6 overflow-hidden py-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-4 text-left font-medium">Phase</th>
                      <th className="p-4 text-left font-medium">Duration</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {migrationTimeline.map((step) => (
                      <tr key={step.phase}>
                        <td className="p-4">{step.phase}</td>
                        <td className="p-4 text-muted-foreground">
                          {step.duration}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-muted/30">
                      <td className="p-4 font-medium">Total</td>
                      <td className="p-4 font-medium">4-8 weeks</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Card>

            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    What exports cleanly
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-muted-foreground text-sm">
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-green-600 dark:text-green-400" />
                      Contact profiles (CSV)
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-green-600 dark:text-green-400" />
                      Email templates (HTML)
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-green-600 dark:text-green-400" />
                      Campaign performance (API)
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-green-600 dark:text-green-400" />
                      Historical events (API with pagination)
                    </li>
                  </ul>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    What must be rebuilt
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-muted-foreground text-sm">
                    <li className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-yellow-600 dark:text-yellow-400" />
                      Flows (automations) -- no portable format
                    </li>
                    <li className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-yellow-600 dark:text-yellow-400" />
                      Segments -- criteria must be manually recreated
                    </li>
                    <li className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-yellow-600 dark:text-yellow-400" />
                      Signup forms -- not exportable
                    </li>
                    <li className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-yellow-600 dark:text-yellow-400" />
                      Predictive properties (CLV, churn) -- Klaviyo-proprietary
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </div>

            <div className="mt-6 rounded-lg border bg-muted/30 p-6">
              <p className="text-muted-foreground text-sm">
                <strong className="text-foreground">
                  The key difference after migration:
                </strong>{" "}
                Wraps deploys SES to your own AWS account with your own sending
                domain. You build reputation on infrastructure you own
                permanently. If you ever stop paying Wraps, your SES, DynamoDB
                tables, and Lambda functions keep running. No more migration
                risk.
              </p>
            </div>
          </section>

          <AlsoCompare current="/compare/klaviyo-vs-wraps" />

          {/* CTA */}
          <section className="rounded-lg border bg-muted/30 p-8 text-center">
            <h2 className="mb-2 font-semibold text-xl">
              Ready to own your email infrastructure?
            </h2>
            <p className="mb-6 text-muted-foreground">
              Deploy to your AWS in 2 minutes. No credit card required.
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
          <div className="mt-12 border-t pt-8 text-center text-muted-foreground text-xs">
            <p className="mb-2">
              Last updated: March 2026. Klaviyo pricing and features sourced
              from{" "}
              <a
                className="text-primary underline"
                href="https://www.klaviyo.com/pricing"
                rel="noopener noreferrer"
                target="_blank"
              >
                klaviyo.com
                <ExternalLink className="ml-0.5 inline size-3" />
              </a>
              ,{" "}
              <a
                className="text-primary underline"
                href="https://developers.klaviyo.com"
                rel="noopener noreferrer"
                target="_blank"
              >
                developers.klaviyo.com
                <ExternalLink className="ml-0.5 inline size-3" />
              </a>
              , and public reviews.
            </p>
            <p>
              See something inaccurate?{" "}
              <a className="text-primary underline" href="mailto:hey@wraps.dev">
                Let us know
              </a>{" "}
              and we&rsquo;ll fix it.
            </p>
          </div>
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}
