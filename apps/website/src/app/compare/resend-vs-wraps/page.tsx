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
import { JsonLd } from "@/components/json-ld";
import { ResendForgeNotice } from "@/components/resend-forge-notice";

export const metadata: Metadata = {
  title: "Resend vs Wraps - Compare Email Infrastructure Approaches",
  description:
    "Resend runs the sending infrastructure for you: Amazon SES historically, its own Forge MTA since October 2026. Wraps sets SES up in your own AWS account and runs it day to day. Compare setup, operations, pricing, data retention, and infrastructure ownership side by side.",
  openGraph: {
    title: "Resend vs Wraps | Wraps",
    description:
      "Resend runs the sending infrastructure for you: Amazon SES historically, its own Forge MTA since October 2026. Wraps sets SES up in your own AWS account. Compare setup, operations, pricing, data retention, and ownership.",
    url: "https://wraps.dev/compare/resend-vs-wraps",
  },
  twitter: {
    title: "Resend vs Wraps | Wraps",
    description:
      "Resend runs the sending infrastructure for you: Amazon SES historically, its own Forge MTA since October 2026. Wraps sets SES up in your own AWS account. Compare setup, operations, pricing, data retention, and ownership.",
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
    dimension: "Setup",
    resend: "An API key",
    wraps: "One command into your AWS account",
  },
  {
    dimension: "Day-to-day operations",
    resend: "Resend runs it on their side (SES, or Forge)",
    wraps: "Wraps control plane runs SES on yours",
  },
  {
    dimension: "Infrastructure",
    resend: "Resend's AWS account or Forge MTA",
    wraps: "Your AWS account",
  },
  {
    dimension: "Sending cost",
    resend: "$0.35-0.90/1K emails",
    wraps: "$0.10/1K à la carte (AWS SES direct)",
  },
  {
    dimension: "Data retention",
    resend: "30 days (non-Enterprise)",
    wraps: "Events in your DynamoDB, retention you set",
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
    wrapsTier: "Pro",
    wrapsPlatform: "$29",
    awsSes: "$5",
    wrapsTotal: "$34",
    savings: null,
  },
  {
    volume: "100K/mo",
    resendTier: "Pro 100K / Scale",
    resendCost: "$35-90",
    wrapsTier: "Pro",
    wrapsPlatform: "$29",
    awsSes: "$10",
    wrapsTotal: "$39",
    savings: null,
  },
  {
    volume: "500K/mo",
    resendTier: "Scale 500K tier",
    resendCost: "$350",
    wrapsTier: "Pro",
    wrapsPlatform: "$29",
    awsSes: "$50",
    wrapsTotal: "$79",
    savings: "77%",
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
    category: "Operations",
    features: [
      {
        name: "Initial setup",
        resend: "API key",
        wraps: "One command into your AWS account",
      },
      {
        name: "Whose sending account and reputation",
        resend: "Resend's",
        wraps: "Yours",
      },
      {
        name: "Bounce and complaint rates vs AWS limits",
        resend: "Resend's to manage",
        wraps: "Swept hourly, owners and admins notified",
      },
      {
        name: "Alarms in your own AWS account",
        resend: "Their account, not yours",
        wraps: "CloudWatch alarms on Production and Enterprise presets",
      },
      {
        name: "Suppression list",
        resend: "Managed by Resend",
        wraps: "Browse and clear in the dashboard",
      },
      {
        name: "DKIM, SPF, DMARC and blacklist audit",
        resend: "Resend's to manage",
        wraps: "wraps email check, on demand",
      },
      {
        name: "Per-message event log",
        resend: true,
        wraps: true,
      },
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
        resend: "30 days (non-Enterprise)",
        wraps:
          "Events in your DynamoDB at the retention you set; dashboard history 30 days to 1 year by plan",
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
        wraps: "TypeScript, Python",
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
        wraps: "~2 minutes",
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
        wraps: "Not certified",
      },
      { name: "HIPAA", resend: false, wraps: "Not offered" },
      {
        name: "Cancel impact",
        resend: "Data deleted",
        wraps: "Infrastructure persists",
      },
    ],
  },
];

const chooseResendReasons = [
  "You don't have an AWS account and don't want one",
  "You need SDKs in Ruby, Go, PHP, Java, Rust, or .NET today",
  "You want managed dedicated IP warming and monitoring without thinking about it",
  "You want a built-in visual broadcast editor with audience management",
  "You would rather another team own the sending account and the reputation on it",
];

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "Resend vs Wraps",
  description:
    "Resend runs the sending infrastructure for you: Amazon SES historically, its own Forge MTA since October 2026. Wraps sets SES up in your own AWS account and runs it day to day. Compare setup, operations, pricing, data retention, and infrastructure ownership side by side.",
  datePublished: "2026-03-01T00:00:00.000Z",
  dateModified: "2026-10-26T00:00:00.000Z",
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
    "@id": "https://wraps.dev/compare/resend-vs-wraps",
  },
};

const chooseWrapsReasons = [
  "You already have an AWS account (or your company does) and would rather send from it",
  "You want SES set up in one command: DKIM, event pipeline, suppression, bounce and complaint handling, non-destructively",
  "You want bounce and complaint rates watched against AWS's own review and pause lines, with owners and admins notified",
  "You want suppression you can browse and clear, deliverability and blacklist audits on demand, and an event log per message",
  "You want the per-event delivery history in your own DynamoDB, at the retention you set, instead of a 30-day cap",
  "You need sending and delivery data to stay in a particular AWS region",
  "You want the sending infrastructure to keep running whether or not you keep paying us",
];

const resendCode = `import { Resend } from "resend";

const resend = new Resend("re_123456");

await resend.emails.send({
  from: "hello@example.com",
  to: "user@example.com",
  subject: "Welcome",
  react: <WelcomeEmail />,
});`;

const wrapsCode = `import { WrapsEmail } from "@wraps.dev/email";

const email = new WrapsEmail();

await email.send({
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
      <JsonLd data={articleSchema} />

      <main className="container mx-auto px-4 pt-24 pb-16">
        <div className="mx-auto max-w-4xl">
          <CompareBreadcrumb competitor="Resend vs Wraps" />

          {/* Hero */}
          <section className="mb-16">
            <SectionKicker>Comparison</SectionKicker>
            <h1 className="mb-4 font-heading font-semibold text-4xl tracking-tight sm:text-5xl">
              Resend vs Wraps
            </h1>
            <p className="mb-4 max-w-2xl text-lg text-muted-foreground">
              <strong className="text-foreground">Resend</strong> is a managed
              email API. It was built on top of Amazon SES, and since October
              2026 domains can move to Resend Forge, Resend&apos;s own mail
              engine. The developer experience is genuinely excellent and you
              are sending within minutes. Either way it runs on Resend&apos;s
              infrastructure and Resend&apos;s sending reputation.
            </p>
            <p className="mb-4 max-w-2xl text-lg text-muted-foreground">
              <strong className="text-foreground">Wraps</strong> sets the same
              SES up inside your AWS account in one command, without touching
              anything already there, and then runs it day to day from the Wraps
              control plane.
            </p>
            <p className="max-w-2xl font-medium text-foreground text-lg">
              Everything Amazon SES needs, including operations. Most teams
              reach for a hosted API because they do not want to deal with SES.
              Dealing with SES is the part Wraps does.
            </p>
            <ResendForgeNotice className="mt-8 max-w-2xl" />
          </section>

          {/*
            Dunford's insight step, and it goes above the pricing table on
            purpose: the buyer this page is written for has already decided SES
            is cheaper and picked Resend anyway. Leading with price argues with
            a reader who agrees with us. See ops/sops/positioning.md.
          */}
          <section className="mb-16">
            <SectionKicker>The real objection</SectionKicker>
            <h2 className="mb-4 font-heading font-semibold text-2xl tracking-tight">
              Price is not why people pick Resend over SES.
            </h2>
            <p className="mb-6 max-w-2xl text-muted-foreground">
              In September 2026 a team moving about 3,000 lifecycle emails a
              month off shared SMTP wrote their options up in public. They
              costed Amazon SES at roughly $0.30 a month against Resend at $20,
              called SES &ldquo;cheapest by far&rdquo; — and recommended Resend
              anyway. Their SES row, in full:
            </p>
            <blockquote className="mb-6 max-w-2xl border-foreground border-l-2 pl-5 text-foreground text-lg italic">
              &ldquo;cheapest by far; AWS profiles already configured on the dev
              machine. Requires production-access request (sandboxed by default)
              and you must handle bounces/complaints yourself.&rdquo;
            </blockquote>
            <p className="mb-6 max-w-2xl text-muted-foreground">
              A 66&times; price difference, AWS credentials already sitting on
              the dev machine, and the two clauses after that semicolon were
              still enough to make a hosted API the recommendation. That is the
              trade this page is about. Here is what Wraps does about each of
              those clauses — and what it does not.
            </p>
            <dl className="max-w-2xl space-y-5">
              <div className="border-border border-t pt-4">
                <dt className="mb-1.5 font-semibold text-foreground">
                  &ldquo;Sandboxed by default&rdquo;
                </dt>
                <dd className="text-base text-muted-foreground leading-relaxed">
                  Wraps cannot grant production access and neither can anyone
                  else selling you software — it is an AWS decision made from
                  your own account, and some requests are refused. What the CLI
                  does is detect sandbox at the end of a deploy, explain what it
                  means, and point you at the request, so it is not something
                  you discover from a failed send. That constraint applies to
                  every approach that sends from an account you own.
                </dd>
              </div>
              <div className="border-border border-t pt-4">
                <dt className="mb-1.5 font-semibold text-foreground">
                  &ldquo;You must handle bounces/complaints yourself&rdquo;
                </dt>
                <dd className="text-base text-muted-foreground leading-relaxed">
                  This one Wraps removes. Bounce and complaint processing,
                  suppression, and the event pipeline are deployed with
                  everything else on the first run. The dashboard then draws
                  both rates against the lines Amazon enforces — review at 5%
                  bounce and 0.1% complaint, sending paused at 10% and 0.5% —
                  and sweeps the account hourly so a drift shows up before the
                  suspension email does.
                </dd>
              </div>
            </dl>
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

          {/* Setup, then operations */}
          <section className="mb-16">
            <h2 className="mb-2 font-heading font-semibold text-2xl tracking-tight">
              Set it up once, then have it run
            </h2>
            <p className="mb-6 text-muted-foreground">
              Two things sit between an AWS account and production email on SES.
              Wraps does both.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Setup</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="mb-4 text-muted-foreground text-sm">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      wraps email init
                    </code>{" "}
                    deploys the whole email surface into the region you pick:
                    SES with DKIM, an EventBridge rule, SQS with a dead letter
                    queue, a Lambda event processor, a DynamoDB table for
                    delivery history, and scoped IAM roles.
                  </p>
                  <ul className="space-y-2 text-muted-foreground text-sm">
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" />
                      Everything namespaced{" "}
                      <code className="rounded bg-muted px-1 py-0.5">
                        wraps-email-*
                      </code>
                      , so it sits alongside SES you already run
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" />
                      Account-level suppression switched on at deploy, bounces
                      and complaints by default
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" />
                      Sandbox status read back at the end of the run, with the
                      production-access request linked
                    </li>
                  </ul>
                </CardContent>
              </Card>

              <Card className="border-primary/30">
                <CardHeader>
                  <CardTitle>Operations</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="mb-4 text-muted-foreground text-sm">
                    The Wraps control plane runs it from there, against the
                    account you own.
                  </p>
                  <ul className="space-y-2 text-muted-foreground text-sm">
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" />
                      Bounce and complaint rates drawn against AWS&apos;s own
                      review and pause lines, swept hourly, owners and admins
                      notified
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" />
                      Your 24-hour send quota on the same card, with a warning
                      line at 80%
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" />
                      CloudWatch alarms deployed into your account, set below
                      AWS&apos;s lines: bounce warns at 2% and goes critical at
                      4% against AWS&apos;s 5% review line, complaints at 0.05%
                      and 0.08% against 0.1%, plus any dead-letter message.
                      Email or webhook to Slack, Discord or PagerDuty. On the
                      Production and Enterprise presets; a Starter deploy has
                      them off
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" />
                      Suppression you can browse and clear, and an event log per
                      message
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" />
                      <span>
                        <code className="rounded bg-muted px-1 py-0.5">
                          wraps email check
                        </code>{" "}
                        audits DKIM, SPF, DMARC, MX, BIMI and public blacklists
                        on demand;{" "}
                        <code className="rounded bg-muted px-1 py-0.5">
                          doctor
                        </code>{" "}
                        names the fix
                      </span>
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </div>

            <p className="mt-4 text-muted-foreground text-sm">
              Resend does this work too, and does it well. They do it on their
              own account, on a sending reputation shared across their senders
              unless you buy a dedicated IP. On Wraps it happens on yours, on an
              account only you send from. The alarms are CloudWatch resources in
              your account, so they go on watching your reputation whether or
              not you keep paying us.
            </p>
          </section>

          {/* The Architectural Difference */}
          <section className="mb-16">
            <h2 className="mb-2 font-heading font-semibold text-2xl tracking-tight">
              The architectural difference
            </h2>
            <p className="mb-6 text-muted-foreground">
              Wraps delivers through AWS SES. Resend historically did too, and
              domains can now opt into its own Forge MTA instead. The difference
              is where the infrastructure lives and who controls it.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Resend</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="mb-4 text-muted-foreground text-sm">
                    Managed SaaS. Your email routes through Resend&apos;s
                    infrastructure, and the sending account, the domain
                    identities and the event history live with them.
                  </p>
                  <ul className="space-y-2 text-muted-foreground text-sm">
                    <li className="flex items-start gap-2">
                      <Minus className="mt-1 size-3 shrink-0" />
                      Email metadata stored in the US regardless of sending
                      region
                    </li>
                    <li className="flex items-start gap-2">
                      <Minus className="mt-1 size-3 shrink-0" />
                      Events capped at 30 days on non-Enterprise plans
                    </li>
                    <li className="flex items-start gap-2">
                      <Minus className="mt-1 size-3 shrink-0" />
                      Customer data deleted upon leaving
                    </li>
                    <li className="flex items-start gap-2">
                      <Minus className="mt-1 size-3 shrink-0" />
                      The sending reputation you build is theirs, not yours
                    </li>
                  </ul>
                </CardContent>
              </Card>

              <Card className="border-primary/30">
                <CardHeader>
                  <CardTitle>Wraps</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="mb-4 text-muted-foreground text-sm">
                    Two planes. SES, EventBridge, SQS, Lambda and DynamoDB run
                    in your account, in your chosen region, and the per-event
                    delivery history lands in that DynamoDB table at whatever
                    retention your deploy config sets. Contacts, templates,
                    broadcasts and workflow state live in the Wraps control
                    plane, along with a row per message carrying recipient,
                    subject, sender, template variables and delivery timestamps.
                  </p>
                  <ul className="space-y-2 text-muted-foreground text-sm">
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" />
                      Sending and delivery data stay in the AWS region you pick
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" />
                      The account, the domain identities and the reputation are
                      yours
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" />
                      Infrastructure persists if you stop using Wraps
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" />
                      Wraps reaches it by assuming an IAM role with an external
                      ID, in one-hour sessions. No AWS keys are stored
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </div>

            <p className="mt-4 text-muted-foreground text-sm">
              One precision, because security review always asks. Wraps does
              hold message-level metadata in its own Postgres: recipient,
              subject, sender, template variables, delivery timestamps. The
              sending itself, and the full event history behind it, stays in
              your account.
            </p>
          </section>

          {/* Pricing at Real Volumes */}
          <section className="mb-16">
            <h2 className="mb-2 font-heading font-semibold text-2xl tracking-tight">
              Pricing at real volumes
            </h2>
            <p className="mb-6 text-muted-foreground">
              Resend bundles sending cost into their platform fee with $0.90/1K
              overage. Wraps charges a platform fee separately -- you pay AWS
              directly at $0.10/1K emails on à la carte (AWS defaults new
              accounts to $0.16 — Wraps tells you which plan applies).
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
                            <span className="font-mono text-2xs text-brand uppercase tracking-widest">
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
                Wraps platform tiers: Free ($0/mo), Pro ($29/mo), Business
                ($199/mo) — priced on AWS accounts, dashboard history, and
                governance features, not send volume. All tiers include
                unlimited sends, contacts, domains, and templates.
              </p>
              <p>
                Worth knowing on Resend: exceeding your tier auto-bills at
                $0.65-0.90/1K. Getting Scale features at 100K costs $90/mo (the
                $35 Pro tier skips SSO and caps domains at 10). CC/BCC count as
                separate emails. Marketing contacts billed separately ($40/mo
                for 5K contacts).
              </p>
              <p>
                At 50K/mo the two are priced about the same, so price is not the
                reason to move. What changes is who sets the account up, who
                watches it, and where the events live: with Wraps they land in
                your own DynamoDB at the retention you choose, against
                Resend&apos;s 30-day cap. (Wraps dashboard history runs 30 days
                to 1 year depending on plan; the underlying events are always
                yours.)
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
            <h2 className="mb-2 font-heading font-semibold text-2xl tracking-tight">
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
            <h2 className="mb-2 font-heading font-semibold text-2xl tracking-tight">
              When to choose Wraps
            </h2>
            <p className="mb-6 text-muted-foreground">
              Wraps is for teams that want Amazon SES without running Amazon SES
              by hand.
            </p>
            <Card className="border-primary/30">
              <CardContent>
                <ul className="space-y-3">
                  {chooseWrapsReasons.map((reason) => (
                    <li className="flex items-start gap-3" key={reason}>
                      <Check className="mt-0.5 size-5 shrink-0 text-success" />
                      <span>{reason}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </section>

          {/* Switching from Resend */}
          <section className="mb-16">
            <h2 className="mb-2 font-heading font-semibold text-2xl tracking-tight">
              Switching from Resend
            </h2>
            <p className="mb-6 text-muted-foreground">
              React Email templates work unchanged. The migration is an SDK swap
              and DNS update. If your domain is still on Resend&apos;s
              SES-backed path, expect the SPF include to be close to what you
              need. If you have activated Resend Forge, check your SPF and DKIM
              records instead of assuming they carry over.
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
                    wraps email init
                  </code>{" "}
                  (~2 minutes)
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
                <li>
                  Done. Same DX, your account, and the control plane watching it
                  from there
                </li>
              </ol>
              <p className="text-muted-foreground text-sm">
                React Email templates are open source and work with any
                provider. Your domain reputation travels with you. The only
                thing that doesn&apos;t transfer is IP reputation if you were on
                Resend&apos;s shared pool.
              </p>
            </div>
          </section>

          <AlsoCompare
            alternativesSlug="resend"
            current="/compare/resend-vs-wraps"
          />

          {/* CTA */}
          <section className="rounded-lg border bg-muted/30 p-8 text-center">
            <h2 className="mb-2 font-heading font-semibold text-xl tracking-tight">
              One command sets up SES in your AWS account
            </h2>
            <p className="mb-6 text-muted-foreground">
              Free to start, no credit card. The control plane watches the
              account from there.
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
              Last updated: September 2026. We update this page as pricing and
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
