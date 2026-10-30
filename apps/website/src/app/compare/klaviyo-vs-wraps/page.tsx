import { Button } from "@wraps/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Check,
  Clock,
  Code,
  DollarSign,
  ExternalLink,
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
import { SectionKicker } from "@/app/landing/components/section-kicker";
import { JsonLd } from "@/components/json-ld";

export const metadata: Metadata = {
  title:
    "Klaviyo vs Wraps - E-commerce Marketing Platform vs SES You Own and Operate",
  description:
    "Compare Klaviyo and Wraps: a profile-based marketing platform you rent against Amazon SES set up and operated in your own AWS account. Pricing at real volumes, what each one is built for, and who should pick which.",
  openGraph: {
    title: "Klaviyo vs Wraps | Wraps",
    description:
      "Klaviyo is an e-commerce marketing platform. Wraps is everything Amazon SES needs, including operations, in your own AWS account.",
    url: "https://wraps.dev/compare/klaviyo-vs-wraps",
  },
  twitter: {
    title: "Klaviyo vs Wraps | Wraps",
    description:
      "Klaviyo is an e-commerce marketing platform. Wraps is everything Amazon SES needs, including operations, in your own AWS account.",
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
    wraps: "Teams sending from their own Amazon SES",
  },
  {
    dimension: "Setup",
    klaviyo: "Connect a store or a list, nothing to deploy",
    wraps: "One command deploys the SES surface to your AWS",
  },
  {
    dimension: "Who runs the sending",
    klaviyo: "Klaviyo, on their own infrastructure",
    wraps: "You, with the Wraps control plane watching it",
  },
  {
    dimension: "Pricing model",
    klaviyo: "Per active profile (contacts)",
    wraps: "Flat platform fee, AWS bills the sends",
  },
  {
    dimension: "Contact cost",
    klaviyo: "~$0.014-$0.030 per profile/month",
    wraps: "$0 (unlimited on every plan)",
  },
  {
    dimension: "Sending infrastructure",
    klaviyo: "Klaviyo's multi-tenant platform",
    wraps: "SES in your AWS account",
  },
  {
    dimension: "Template approach",
    klaviyo: "GUI drag-and-drop first",
    wraps: "React Email TSX and AI generation",
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
    wrapsPlatform: "$29",
    awsSes: "$5",
    wrapsTotal: "$34",
    savings: "2.9x",
  },
  {
    volume: "100K",
    klaviyoProfiles: "~10,000",
    klaviyoCost: "$150",
    wrapsPlatform: "$29",
    awsSes: "$10",
    wrapsTotal: "$39",
    savings: "3.8x",
  },
  {
    volume: "500K",
    klaviyoProfiles: "~50,000",
    klaviyoCost: "$720",
    wrapsPlatform: "$29",
    awsSes: "$50",
    wrapsTotal: "$79",
    savings: "9.1x",
  },
  {
    volume: "1M",
    klaviyoProfiles: "~100,000",
    klaviyoCost: "$1,380",
    wrapsPlatform: "$29",
    awsSes: "$100",
    wrapsTotal: "$129",
    savings: "10.7x",
  },
];

const featureComparison = [
  {
    category: "Sending",
    features: [
      {
        name: "Setting it up",
        klaviyo: "Nothing to deploy, the platform is theirs",
        wraps: "One command, non-destructive, namespaced wraps-email-*",
        klaviyoStatus: "yes",
        wrapsStatus: "yes",
      },
      {
        name: "Transactional email",
        klaviyo: "Built around flows and campaigns",
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
        klaviyo: "Triggered by events, not a direct send endpoint",
        wraps: "TypeScript and Python SDKs, REST API, MCP server",
        klaviyoStatus: "partial",
        wrapsStatus: "yes",
      },
      {
        name: "Dedicated sending IPs",
        klaviyo: "Available on qualifying plans",
        wraps: "Your own SES, your reputation",
        klaviyoStatus: "partial",
        wrapsStatus: "yes",
      },
      {
        name: "SMS",
        klaviyo: "Bundled with the plan, credit-based",
        wraps: "AWS End User Messaging",
        klaviyoStatus: "yes",
        wrapsStatus: "yes",
      },
    ],
  },
  {
    category: "Operations",
    features: [
      {
        name: "Bounce and complaint monitoring",
        klaviyo: "Deliverability dashboards, their team owns the sending",
        wraps: "Hourly sweep against AWS's review and pause lines",
        klaviyoStatus: "yes",
        wrapsStatus: "yes",
      },
      {
        name: "Alerts when rates move",
        klaviyo: "Platform notifications",
        wraps: "Owners and admins notified, once per account per day",
        klaviyoStatus: "yes",
        wrapsStatus: "yes",
      },
      {
        name: "Suppression list you can browse and clear",
        klaviyo: "Suppression management in the UI",
        wraps: "SES account suppression, wired on at deploy",
        klaviyoStatus: "yes",
        wrapsStatus: "yes",
      },
      {
        name: "DKIM, SPF, DMARC and blacklist audits",
        klaviyo: "Guided domain setup",
        wraps: "wraps email check, on demand",
        klaviyoStatus: "partial",
        wrapsStatus: "yes",
      },
      {
        name: "Per-message event log",
        klaviyo: "Profile activity timeline",
        wraps: "Every send, open and delivery, queryable",
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
        klaviyo: "Generated from their OpenAPI spec",
        wraps: "Hand-written, type-safe",
        klaviyoStatus: "partial",
        wrapsStatus: "yes",
      },
      {
        name: "CLI",
        klaviyo: "No infrastructure CLI",
        wraps: "Deploys and manages the SES surface",
        klaviyoStatus: "no",
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
        wraps: "Pulumi and AWS CDK, or the CLI",
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
        name: "Where sending and delivery history live",
        klaviyo: "Klaviyo's platform",
        wraps: "SES and your DynamoDB, retention set in your deploy config",
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
        name: "Onsite tracking script",
        klaviyo: "Yes, powers forms and browse abandonment",
        wraps: "None, server-side only",
        klaviyoStatus: "yes",
        wrapsStatus: "no",
      },
      {
        name: "Sending keeps working if you cancel",
        klaviyo: "No, the platform is the subscription",
        wraps: "Yes, SES and the pipeline are already yours",
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
        klaviyo: "Mature, omnichannel, deep integration catalogue",
        wraps: "Visual canvas plus a TypeScript DSL",
        klaviyoStatus: "yes",
        wrapsStatus: "yes",
      },
      {
        name: "A/B testing in flows",
        klaviyo: "Built-in split testing",
        wraps: "No",
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
        name: "Subscription topics and preference centre",
        klaviyo: "Hosted preference page",
        wraps: "Topics plus a hosted preference centre",
        klaviyoStatus: "yes",
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
        klaviyo: "Native and first-party deep",
        wraps: "No",
        klaviyoStatus: "yes",
        wrapsStatus: "no",
      },
      {
        name: "Template editing",
        klaviyo: "Drag-and-drop editor, no code needed",
        wraps: "React Email TSX, with AI generation",
        klaviyoStatus: "yes",
        wrapsStatus: "yes",
      },
      {
        name: "Pre-built marketing integrations",
        klaviyo: "Large catalogue, e-commerce first",
        wraps: "No",
        klaviyoStatus: "yes",
        wrapsStatus: "no",
      },
    ],
  },
];

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "Klaviyo vs Wraps",
  description:
    "Compare Klaviyo and Wraps: a profile-based marketing platform you rent against Amazon SES set up and operated in your own AWS account. Pricing at real volumes, what each one is built for, and who should pick which.",
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
    "@id": "https://wraps.dev/compare/klaviyo-vs-wraps",
  },
};

const migrationTimeline = [
  { phase: "Audit existing Klaviyo setup", duration: "1-2 days" },
  { phase: "Deploy Wraps into your AWS account", duration: "One command" },
  { phase: "DNS records and domain verification", duration: "24-48 hours" },
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
      <JsonLd data={articleSchema} />

      <main className="container mx-auto px-4 pt-24 pb-16">
        <div className="mx-auto max-w-4xl">
          <CompareBreadcrumb competitor="Klaviyo vs Wraps" />

          {/* Hero */}
          <section className="mb-16">
            <SectionKicker>Comparison</SectionKicker>
            <h1 className="mb-4 font-heading font-semibold text-4xl tracking-tight sm:text-5xl">
              Klaviyo vs Wraps
            </h1>
            <p className="mb-3 text-lg text-muted-foreground">
              <strong className="text-foreground">Klaviyo</strong> is an
              e-commerce marketing automation platform. Deep Shopify
              integration, predictive analytics, a visual flow builder, and a
              marketer can run the whole program without an engineer. It is very
              good at that.
            </p>
            <p className="mb-3 text-lg text-muted-foreground">
              <strong className="text-foreground">Wraps</strong> is everything
              Amazon SES needs, including operations. One command sets up the
              whole SES surface in your own AWS account, without touching
              anything already there. The Wraps control plane then runs it day
              to day: bounce and complaint rates swept hourly against
              AWS&rsquo;s own lines, suppression you can browse and clear,
              deliverability and blacklist audits, and a log of every message.
            </p>
            <p className="text-lg text-muted-foreground">
              These are different products for different buyers. Klaviyo sells a
              marketing program you rent. Wraps sells the setup and the
              operations for sending that stays in your account, with templates,
              broadcasts, segments, topics and workflows on top of it.
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

          {/* What Wraps does */}
          <section className="mb-16">
            <div className="mb-6 flex items-center gap-3">
              <Activity className="size-6 text-primary" />
              <h2 className="font-heading font-semibold text-2xl tracking-tight">
                Everything Amazon SES needs, including operations
              </h2>
            </div>
            <p className="mb-6 text-muted-foreground text-sm">
              Most teams pick a hosted platform because they do not want to deal
              with SES. That is the part Wraps does for you. The sending stays
              in your account; the work of standing it up and keeping it healthy
              does not stay on your desk.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Card className="border-primary/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    We set everything up
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-muted-foreground text-sm">
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" />
                      One command deploys the whole SES surface into your own
                      AWS account
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" />
                      Domain identity, DKIM, event capture, delivery history,
                      suppression
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" />
                      Non-destructive. Everything namespaced wraps-email-*, so
                      it sits beside SES you already run
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" />
                      CloudWatch alarms in your account, set below AWS&rsquo;s
                      own lines so you get lead time: bounce warns at 2%,
                      complaints at 0.05%, with email or a webhook to Slack,
                      Discord or PagerDuty. On by default in the Production and
                      Enterprise deploy presets, off in the Starter preset
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" />
                      Sandbox status detected at the end of setup, explained,
                      and the console request linked
                    </li>
                  </ul>
                </CardContent>
              </Card>
              <Card className="border-primary/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    The control plane runs it day to day
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-muted-foreground text-sm">
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" />
                      Bounce and complaint rates swept hourly and drawn against
                      AWS&rsquo;s own review and pause lines
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" />
                      Owners and admins notified when an account moves toward
                      those lines
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" />
                      Suppression you can browse and clear, on by default for
                      bounces and complaints
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" />
                      DKIM, SPF, DMARC, MX and public blacklist audits from
                      wraps email check
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" />A
                      log of every message, plus doctor and status with named
                      fixes
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </div>
            <p className="mt-4 text-muted-foreground text-sm">
              AWS can place an account under review above a 5% bounce rate and
              can pause sending at 10%; for complaints the lines are 0.1% and
              0.5%. The dashboard draws your rates against those numbers so you
              are reading the same gauge AWS is.
            </p>
          </section>

          {/* The Architectural Difference */}
          <section className="mb-16">
            <div className="mb-6 flex items-center gap-3">
              <Server className="size-6 text-primary" />
              <h2 className="font-heading font-semibold text-2xl tracking-tight">
                The Architectural Difference
              </h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    Klaviyo: a hosted marketing platform
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-muted-foreground text-sm">
                    <li className="flex items-start gap-2">
                      <Minus className="mt-0.5 size-4 shrink-0" />
                      Your email sends through Klaviyo&rsquo;s infrastructure,
                      not an account you hold
                    </li>
                    <li className="flex items-start gap-2">
                      <Minus className="mt-0.5 size-4 shrink-0" />
                      Shared IPs by default, dedicated on qualifying plans
                    </li>
                    <li className="flex items-start gap-2">
                      <Minus className="mt-0.5 size-4 shrink-0" />
                      Profiles, events and templates live on their platform
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" />
                      In exchange, Klaviyo owns deliverability. Nothing to
                      deploy and nobody to page
                    </li>
                    <li className="flex items-start gap-2">
                      <Minus className="mt-0.5 size-4 shrink-0" />
                      Leaving means a migration, because the sending was never
                      yours
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
                      <Check className="mt-0.5 size-4 shrink-0 text-success" />
                      SES deployed to your AWS account -- you own the sending
                      infrastructure
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" />
                      Dedicated IPs in your account, reputation you control
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" />
                      Per-message delivery history in your DynamoDB, retention
                      set in your own deploy config
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" />
                      Contacts, templates, broadcasts and workflow state live in
                      the Wraps control plane, and export on demand
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" />
                      Stop paying Wraps and the sending keeps running
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" />
                      No AWS keys stored anywhere. Wraps assumes a role in your
                      account with an external ID, an hour at a time
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
              <h2 className="font-heading font-semibold text-2xl tracking-tight">
                Pricing at Real Volumes
              </h2>
            </div>
            <p className="mb-4 text-muted-foreground text-sm">
              Klaviyo prices by <strong>active profiles</strong>: contacts you
              store, whether you email them or not, and that bill buys their
              whole marketing program. Wraps charges a flat platform fee with
              unlimited contacts on every plan, and AWS bills you directly for
              the sends at $0.10 per 1,000 emails à la carte, or $0.16 on the
              Essentials plan AWS defaults new accounts to. The gap below is
              what pricing by stored contacts costs you as the list grows.
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
                        <td className="p-4 text-primary">
                          <div className="font-medium">{row.wrapsTotal}/mo</div>
                          <div className="text-muted-foreground text-xs">
                            {row.wrapsPlatform} plan + {row.awsSes} SES
                          </div>
                        </td>
                        <td className="p-4">
                          <span className="font-mono text-2xs text-brand-text tracking-widest">
                            {row.savings}
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
                Wraps total = platform fee + AWS SES ($0.10/1K emails à la
                carte, or $0.16/1K on AWS&apos;s default plan), paid directly to
                AWS. The savings column uses the à la carte rate, so on the
                default Essentials plan at $0.16 the 1M row is about 7x rather
                than 10.7x — still the largest gap on this page.{" "}
                <a
                  className="text-primary underline"
                  href="/tools/ses-calculator"
                >
                  Calculate your exact cost
                </a>
              </p>
              <p>
                The two bills move on different axes. Growing a list from 5,000
                to 100,000 profiles costs nothing extra on Wraps, because
                contacts are unlimited and you pay AWS per send. On Klaviyo the
                same growth moves the plan from $100/mo to $1,380/mo at the same
                send volume.
              </p>
            </div>
          </section>

          {/* What moves the Klaviyo bill */}
          <section className="mb-16">
            <h3 className="mb-4 font-semibold text-lg">
              What moves the Klaviyo bill
            </h3>
            <Card>
              <CardContent>
                <ul className="space-y-3 text-muted-foreground text-sm">
                  <li className="flex items-start gap-3">
                    <Minus className="mt-0.5 size-4 shrink-0" />
                    <span>
                      Since February 2025 Klaviyo bills all active profiles, not
                      only the ones you email. Signups you never send to still
                      count.
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Minus className="mt-0.5 size-4 shrink-0" />
                    <span>
                      Passing a profile limit auto-upgrades the plan. It does
                      not auto-downgrade when the list shrinks again.
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Minus className="mt-0.5 size-4 shrink-0" />
                    <span>
                      Send volume is capped at ten times your profile count, and
                      sends halt past it.
                    </span>
                  </li>
                </ul>
                <p className="mt-4 text-muted-foreground text-sm">
                  None of this is hidden. It is how a platform priced on the
                  audience it stores has to work. It is worth modelling before
                  you sign, because a list that grows faster than the sending
                  does moves the bill on its own.
                </p>
              </CardContent>
            </Card>
          </section>

          {/* Detailed Feature Comparison */}
          <section className="mb-16">
            <div className="mb-6 flex items-center gap-3">
              <Code className="size-6 text-primary" />
              <h2 className="font-heading font-semibold text-2xl tracking-tight">
                Feature Comparison
              </h2>
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
              <h2 className="font-heading font-semibold text-2xl tracking-tight">
                When Klaviyo Is the Better Choice
              </h2>
            </div>
            <Card>
              <CardContent>
                <p className="mb-4 text-muted-foreground text-sm">
                  Klaviyo does several things Wraps does not do at all. If these
                  describe you, Klaviyo is the right tool and this page should
                  end here.
                </p>
                <ul className="space-y-3 text-sm">
                  <li className="flex items-start gap-3">
                    <Check className="mt-0.5 size-4 shrink-0 text-success" />
                    <span>
                      <strong>You run a Shopify store</strong> and need native
                      e-commerce depth -- abandoned cart flows, product
                      recommendations, revenue attributed per campaign. This is
                      what Klaviyo was built for and it is excellent at it.
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="mt-0.5 size-4 shrink-0 text-success" />
                    <span>
                      <strong>A non-engineer needs to run the program.</strong>{" "}
                      Klaviyo&rsquo;s visual flow builder, drag-and-drop
                      templates and AI content tools mean a marketer can build,
                      send and measure without opening a terminal. Wraps assumes
                      someone on the team is comfortable with AWS.
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="mt-0.5 size-4 shrink-0 text-success" />
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
                    <Check className="mt-0.5 size-4 shrink-0 text-success" />
                    <span>
                      <strong>You want the integration catalogue</strong> --
                      e-commerce platforms, payment processors and marketing
                      tools connected out of the box, with nothing to wire up.
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="mt-0.5 size-4 shrink-0 text-success" />
                    <span>
                      <strong>You need omnichannel marketing automation</strong>{" "}
                      -- email, SMS, push and WhatsApp in one visual canvas,
                      with split testing. Wraps has no A/B testing.
                    </span>
                  </li>
                </ul>
                <p className="mt-4 text-muted-foreground text-sm">
                  And the plain one: if nobody on your team wants an AWS
                  account, do not get one for this. A hosted platform is a
                  different approach and it is the right one for you.
                </p>
              </CardContent>
            </Card>
          </section>

          {/* When to Choose Wraps */}
          <section className="mb-16">
            <div className="mb-6 flex items-center gap-3">
              <Terminal className="size-6 text-primary" />
              <h2 className="font-heading font-semibold text-2xl tracking-tight">
                When Wraps Is the Better Choice
              </h2>
            </div>
            <Card className="border-primary/30">
              <CardContent>
                <ul className="space-y-3 text-sm">
                  <li className="flex items-start gap-3">
                    <Check className="mt-0.5 size-4 shrink-0 text-success" />
                    <span>
                      <strong>
                        You want to send from SES and not do the setup.
                      </strong>{" "}
                      One command puts the whole surface in your account: domain
                      identity, DKIM, event capture, delivery history,
                      suppression. It sits beside whatever SES you already run.
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="mt-0.5 size-4 shrink-0 text-success" />
                    <span>
                      <strong>You want somebody watching it.</strong> Bounce and
                      complaint rates read hourly against AWS&rsquo;s own lines,
                      owners and admins notified when they move, suppression you
                      can browse and clear, deliverability and blacklist audits,
                      and a log of every message.
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="mt-0.5 size-4 shrink-0 text-success" />
                    <span>
                      <strong>
                        You need transactional email with a real API.
                      </strong>{" "}
                      Password resets, invoices and notifications, sitting
                      alongside the broadcasts and lifecycle workflows rather
                      than bolted onto a flow builder.
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="mt-0.5 size-4 shrink-0 text-success" />
                    <span>
                      <strong>
                        You want to own your sending infrastructure.
                      </strong>{" "}
                      SES in your AWS account, domain reputation you build,
                      dedicated IPs when you need them, and AWS pricing on every
                      send.
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="mt-0.5 size-4 shrink-0 text-success" />
                    <span>
                      <strong>
                        Your contact list is large but send volume is moderate.
                      </strong>{" "}
                      Contacts are unlimited on every Wraps plan and you pay AWS
                      per send. On Klaviyo, 100,000 profiles is $1,380/mo
                      whether you email them or not.
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="mt-0.5 size-4 shrink-0 text-success" />
                    <span>
                      <strong>
                        You want workflows you can version-control.
                      </strong>{" "}
                      A visual flow builder plus a TypeScript DSL you push from
                      the CLI, keep in Git, and deploy alongside your app code.
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="mt-0.5 size-4 shrink-0 text-success" />
                    <span>
                      <strong>You want no client-side script.</strong> Wraps is
                      server-side only. Nothing to add to your pages, and
                      nothing of yours to keep loading.
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
              <h2 className="font-heading font-semibold text-2xl tracking-tight">
                Switching from Klaviyo
              </h2>
            </div>
            <p className="mb-4 text-muted-foreground text-sm">
              Plan 4-8 weeks. The deploy itself is one command; the calendar is
              warmup, DNS and rebuilding what does not export. Run both in
              parallel while the new domain warms.
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
                      <Check className="mt-0.5 size-4 shrink-0 text-success" />
                      Contact profiles (CSV)
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" />
                      Email templates (HTML)
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" />
                      Campaign performance (API)
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" />
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
                      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                      Flows (automations) -- no portable format
                    </li>
                    <li className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                      Segments -- criteria must be manually recreated
                    </li>
                    <li className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                      Signup forms -- not exportable
                    </li>
                    <li className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                      Predictive properties (CLV, churn) -- Klaviyo-proprietary
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </div>

            <div className="mt-6 rounded-lg border bg-muted/30 p-6">
              <p className="text-muted-foreground text-sm">
                <strong className="text-foreground">
                  What is different on the other side:
                </strong>{" "}
                the sending is in your account, under your domain, and the
                reputation you build is yours. If you ever stop paying Wraps,
                the SES identities, DynamoDB tables and Lambda functions keep
                running.
              </p>
            </div>
          </section>

          <AlsoCompare current="/compare/klaviyo-vs-wraps" />

          {/* CTA */}
          <section className="rounded-lg border bg-muted/30 p-8 text-center">
            <h2 className="mb-2 font-heading font-semibold text-xl tracking-tight">
              Everything Amazon SES needs, including operations
            </h2>
            <p className="mb-6 text-muted-foreground">
              One command into your own AWS account. No credit card required.
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
              Last updated: September 2026. Klaviyo pricing and features sourced
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
              , and public documentation.
            </p>
            <p>
              See something inaccurate?{" "}
              <a
                className="text-primary underline"
                href="mailto:support@wraps.dev"
              >
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
