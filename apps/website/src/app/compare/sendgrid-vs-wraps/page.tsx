import {
  AlertTriangle,
  ArrowRight,
  Check,
  CircleDollarSign,
  GitFork,
  MessageSquareQuote,
  Server,
  ShieldAlert,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import { Fragment } from "react";
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
  title: "SendGrid vs Wraps - Own Your Email Infrastructure",
  description:
    "Compare SendGrid and Wraps side by side. Same developer experience, your AWS account, AWS pricing, no vendor lock-in. See pricing, features, and migration path.",
  openGraph: {
    title: "SendGrid vs Wraps | Wraps",
    description:
      "Compare SendGrid and Wraps side by side. Same developer experience, your AWS account, AWS pricing, no vendor lock-in.",
    url: "https://wraps.dev/compare/sendgrid-vs-wraps",
  },
  twitter: {
    title: "SendGrid vs Wraps | Wraps",
    description:
      "Compare SendGrid and Wraps side by side. Same developer experience, your AWS account, AWS pricing, no vendor lock-in.",
  },
  alternates: {
    canonical: "https://wraps.dev/compare/sendgrid-vs-wraps",
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
      name: "SendGrid vs Wraps",
      item: "https://wraps.dev/compare/sendgrid-vs-wraps",
    },
  ],
};

const tldrComparison = [
  {
    dimension: "Infrastructure",
    sendgrid: "SendGrid's servers",
    wraps: "Your AWS account",
  },
  {
    dimension: "Pricing (100K emails/mo)",
    sendgrid: "$89.95/mo",
    wraps: "$79 + $10 AWS = $89/mo",
  },
  {
    dimension: "Pricing (500K emails/mo)",
    sendgrid: "~$449/mo",
    wraps: "$199 + $50 AWS = $249/mo",
  },
  {
    dimension: "Account suspension risk",
    sendgrid: "High (1.2/5 Trustpilot)",
    wraps: "None (your AWS account)",
  },
  {
    dimension: "Data ownership",
    sendgrid: "SendGrid stores everything",
    wraps: "Stays in your AWS",
  },
  {
    dimension: "Vendor lock-in",
    sendgrid: "IP reputation lost on exit",
    wraps: "Infrastructure stays if you leave",
  },
];

const pricingComparison = [
  {
    volume: "10K/mo",
    sendgridTier: "Essentials 50K",
    sendgridCost: "$19.95/mo",
    wrapsTier: "Free",
    wrapsPlatform: "$0",
    wrapsAws: "$1.00",
    wrapsTotal: "$1.00/mo",
    savings: "95%",
  },
  {
    volume: "50K/mo",
    sendgridTier: "Essentials 50K",
    sendgridCost: "$19.95/mo",
    wrapsTier: "Starter",
    wrapsPlatform: "$19",
    wrapsAws: "$5.00",
    wrapsTotal: "$24.00/mo",
    savings: null,
  },
  {
    volume: "100K/mo",
    sendgridTier: "Pro 100K",
    sendgridCost: "$89.95/mo",
    wrapsTier: "Growth",
    wrapsPlatform: "$79",
    wrapsAws: "$10.00",
    wrapsTotal: "$89.00/mo",
    savings: null,
  },
  {
    volume: "500K/mo",
    sendgridTier: "Pro 700K",
    sendgridCost: "~$449/mo",
    wrapsTier: "Scale",
    wrapsPlatform: "$199",
    wrapsAws: "$50.00",
    wrapsTotal: "$249.00/mo",
    savings: "44%",
  },
];

const featureComparison = [
  {
    category: "Sending",
    features: [
      {
        name: "Transactional email API",
        sendgrid: true,
        wraps: true,
      },
      {
        name: "SMTP relay",
        sendgrid: true,
        wraps: true,
      },
      {
        name: "Dedicated IP included",
        sendgrid: "Pro plan ($89.95+)",
        wraps: "Customer manages in SES",
      },
      {
        name: "Shared IP pool",
        sendgrid: "Yes (Essentials plan)",
        wraps: "Yes (SES default, dedicated IPs available)",
      },
    ],
  },
  {
    category: "Templates",
    features: [
      {
        name: "Dynamic templates",
        sendgrid: "Handlebars syntax",
        wraps: "React Email (JSX)",
      },
      {
        name: "Template editing",
        sendgrid: "Drag-and-drop editor",
        wraps: "AI designer + code editor",
      },
      {
        name: "Template versioning",
        sendgrid: true,
        wraps: true,
      },
    ],
  },
  {
    category: "Analytics & Events",
    features: [
      {
        name: "Delivery, open, click, bounce tracking",
        sendgrid: true,
        wraps: true,
      },
      {
        name: "Email activity history",
        sendgrid: "3-30 days (plan dependent)",
        wraps: "You decide (your DynamoDB)",
      },
      {
        name: "Webhook event delivery",
        sendgrid: "1-5 URLs (plan dependent)",
        wraps: "EventBridge (unlimited targets)",
      },
    ],
  },
  {
    category: "Developer Experience",
    features: [
      {
        name: "TypeScript SDK quality",
        sendgrid: "Ships types, known issues",
        wraps: "Strict TypeScript, full type safety",
      },
      {
        name: "Multi-language SDKs",
        sendgrid: "7 languages",
        wraps: "TypeScript only",
      },
      {
        name: "CLI tooling",
        sendgrid: "Abandoned bash scripts",
        wraps: "Full CLI with interactive setup",
      },
      {
        name: "Time to first email",
        sendgrid: "10-30 min (up to 48hr for domain auth)",
        wraps: "~3 min (wraps email setup)",
      },
    ],
  },
  {
    category: "Platform & Ownership",
    features: [
      {
        name: "Infrastructure ownership",
        sendgrid: false,
        wraps: true,
      },
      {
        name: "Data portability",
        sendgrid: "CSV export only",
        wraps: "Your AWS account (full access)",
      },
      {
        name: "Unlimited contacts",
        sendgrid: "$10/10K contacts/mo extra",
        wraps: "All tiers",
      },
      {
        name: "What happens when you leave",
        sendgrid: "Data deleted, IPs reclaimed",
        wraps: "Infrastructure keeps running",
      },
    ],
  },
  {
    category: "Marketing Features",
    features: [
      {
        name: "Marketing campaigns",
        sendgrid: true,
        wraps: true,
      },
      {
        name: "A/B testing",
        sendgrid: "Single Sends only",
        wraps: false,
      },
      {
        name: "Automation workflows",
        sendgrid: "Advanced plan only",
        wraps: "Visual builder + CLI (all tiers)",
      },
      {
        name: "Audience segmentation",
        sendgrid: true,
        wraps: true,
      },
    ],
  },
];

const sendgridCode = `import sgMail from "@sendgrid/mail";

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

await sgMail.send({
  to: "user@example.com",
  from: "you@company.com",
  subject: "Hello",
  html: "<p>World</p>",
});`;

const wrapsCode = `import { Wraps } from "@wraps.dev/email";

const wraps = new Wraps();

await wraps.emails.send({
  to: "user@example.com",
  from: "you@company.com",
  subject: "Hello",
  html: "<p>World</p>",
});`;

export default function SendGridVsWrapsPage() {
  return (
    <div className="min-h-screen bg-background">
      <LandingNavbar />
      <Script id="breadcrumb-jsonld" type="application/ld+json">
        {JSON.stringify(breadcrumbJsonLd)}
      </Script>

      <main className="container mx-auto px-4 pt-24 pb-16">
        <div className="mx-auto max-w-4xl">
          <CompareBreadcrumb competitor="SendGrid vs Wraps" />

          {/* 1. Hero */}
          <section className="mb-16">
            <Badge className="mb-4" variant="secondary">
              Comparison
            </Badge>
            <h1 className="mb-4 font-bold text-4xl tracking-tight sm:text-5xl">
              SendGrid vs Wraps
            </h1>
            <p className="mb-4 max-w-2xl text-lg text-muted-foreground">
              SendGrid sends email from their infrastructure. Wraps deploys
              email infrastructure to your AWS account. Same developer
              experience, fundamentally different architecture.
            </p>
            <p className="max-w-2xl text-muted-foreground">
              SendGrid was built for a world where email infrastructure was
              hard. Wraps was built for a world where it shouldn't be. Your AWS
              account. Your pricing. Your data. No surprise bans.
            </p>
          </section>

          {/* 2. TL;DR Comparison Table */}
          <section className="mb-16">
            <h2 className="mb-6 font-semibold text-2xl">At a Glance</h2>
            <Card className="overflow-hidden py-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-4 text-left font-medium" />
                      <th className="p-4 text-left font-medium">SendGrid</th>
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
                          {row.sendgrid}
                        </td>
                        <td className="p-4 text-primary">{row.wraps}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </section>

          {/* 3. "Sound Familiar?" */}
          <section className="mb-16">
            <div className="mb-6 flex items-center gap-3">
              <MessageSquareQuote className="size-6 text-primary" />
              <h2 className="font-semibold text-2xl">Sound Familiar?</h2>
            </div>
            <p className="mb-6 text-muted-foreground">
              Real quotes from SendGrid users across Trustpilot, Sitejabber, and
              developer forums.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <CardContent>
                  <blockquote className="border-l-2 border-destructive/50 pl-4 text-sm italic text-muted-foreground">
                    "Try and cancel, 3 months I have been trying. They are
                    corrupt."
                  </blockquote>
                  <p className="mt-3 text-muted-foreground/70 text-xs">
                    Trustpilot review, March 2026
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent>
                  <blockquote className="border-l-2 border-destructive/50 pl-4 text-sm italic text-muted-foreground">
                    "5 days with an account suspension... NOT ONE
                    COMMUNICATION."
                  </blockquote>
                  <p className="mt-3 text-muted-foreground/70 text-xs">
                    Trustpilot review, March 2026
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent>
                  <blockquote className="border-l-2 border-destructive/50 pl-4 text-sm italic text-muted-foreground">
                    "I just signed up for Twilio SendGrid, and got instantly
                    permabanned."
                  </blockquote>
                  <p className="mt-3 text-muted-foreground/70 text-xs">
                    dev.to post (front page of Hacker News), October 2024
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent>
                  <blockquote className="border-l-2 border-destructive/50 pl-4 text-sm italic text-muted-foreground">
                    "90% of outgoing mails ending in spam."
                  </blockquote>
                  <p className="mt-3 text-muted-foreground/70 text-xs">
                    Microsoft Q&A, reporting shared IP reputation issues
                  </p>
                </CardContent>
              </Card>
            </div>
            <p className="mt-4 text-muted-foreground text-sm">
              SendGrid holds a 1.2/5 rating on Trustpilot across ~550 reviews.
              The most common complaints: account suspensions without warning,
              unreachable support, and shared IP deliverability problems.
            </p>
          </section>

          {/* 4. The Architectural Difference */}
          <section className="mb-16">
            <div className="mb-6 flex items-center gap-3">
              <Server className="size-6 text-primary" />
              <h2 className="font-semibold text-2xl">
                The Architectural Difference
              </h2>
            </div>
            <p className="mb-6 text-muted-foreground">
              This isn't a feature gap. It's a fundamentally different model for
              who owns your email infrastructure.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>SendGrid: Managed Multi-Tenant</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-muted-foreground text-sm">
                    <li>
                      Email sends from SendGrid's infrastructure (hybrid on-prem
                      + AWS)
                    </li>
                    <li>
                      All data (templates, contacts, analytics) stored on their
                      servers
                    </li>
                    <li>
                      Shared IP pools on Essentials plan -- other customers'
                      behavior affects your deliverability
                    </li>
                    <li>
                      Dedicated IPs require Pro plan ($89.95/mo) plus 30-60 day
                      warmup
                    </li>
                    <li>When you cancel: data deleted, IPs reclaimed</li>
                  </ul>
                </CardContent>
              </Card>
              <Card className="border-primary/30">
                <CardHeader>
                  <CardTitle className="text-primary">
                    Wraps: Your AWS Account
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-muted-foreground text-sm">
                    <li>
                      Email sends from SES in your AWS account -- you own the
                      infrastructure
                    </li>
                    <li>
                      Email events stay in your DynamoDB, Lambda, and
                      EventBridge. Contacts exportable anytime.
                    </li>
                    <li>
                      SES reputation is domain-based -- no IP warmup needed,
                      with dedicated IPs available when needed
                    </li>
                    <li>
                      When you stop paying Wraps: everything keeps running in
                      your AWS
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </div>

            <Card className="mt-6 border-destructive/30 bg-destructive/5">
              <CardContent>
                <div className="flex items-start gap-3">
                  <ShieldAlert className="mt-0.5 size-5 shrink-0 text-destructive" />
                  <div>
                    <h3 className="mb-1 font-medium">
                      SendGrid's security track record
                    </h3>
                    <p className="text-muted-foreground text-sm">
                      428 documented outages over ~6 years (averaging 6.1 per
                      month). An alleged data breach in April 2025 exposed
                      848,000 customer records. SendGrid credentials are
                      actively sold on dark web forums for $15. In January 2026,
                      attackers leveraged SendGrid's infrastructure for a
                      sophisticated phishing campaign. With Wraps, your
                      infrastructure is isolated in your own AWS account.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* 5. Pricing at Real Volumes */}
          <section className="mb-16">
            <div className="mb-6 flex items-center gap-3">
              <CircleDollarSign className="size-6 text-primary" />
              <h2 className="font-semibold text-2xl">
                Pricing at Real Volumes
              </h2>
            </div>
            <p className="mb-6 text-muted-foreground">
              Wraps charges a flat platform fee for tooling (dashboard,
              analytics, templates). You pay AWS directly for sending at
              $0.10/1,000 emails. SendGrid charges per plan tier with separate
              billing for marketing and transactional email.
            </p>
            <Card className="overflow-hidden py-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-4 text-left font-medium">Volume</th>
                      <th className="p-4 text-left font-medium">SendGrid</th>
                      <th className="p-4 text-left font-medium text-primary">
                        Wraps (Platform + AWS)
                      </th>
                      <th className="p-4 text-left font-medium">Savings</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {pricingComparison.map((row) => (
                      <tr key={row.volume}>
                        <td className="p-4 font-medium">{row.volume}</td>
                        <td className="p-4 text-muted-foreground">
                          <span>{row.sendgridCost}</span>
                          <span className="block text-muted-foreground/60 text-xs">
                            {row.sendgridTier}
                          </span>
                        </td>
                        <td className="p-4">
                          <span className="font-medium text-primary">
                            {row.wrapsTotal}
                          </span>
                          <span className="block text-muted-foreground/60 text-xs">
                            {row.wrapsPlatform} platform + {row.wrapsAws} AWS
                          </span>
                        </td>
                        <td className="p-4">
                          {row.savings ? (
                            <Badge variant="secondary">{row.savings}</Badge>
                          ) : (
                            <span className="text-muted-foreground/60 text-xs">
                              Comparable
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <Card>
                <CardContent>
                  <h3 className="mb-1 font-medium text-sm">Hidden cost #1</h3>
                  <p className="text-muted-foreground text-sm">
                    SendGrid bills Email API and Marketing Campaigns separately.
                    Need both? 100K transactional + 20K contacts = $89.95 + $100
                    = $189.95/mo minimum.
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent>
                  <h3 className="mb-1 font-medium text-sm">Hidden cost #2</h3>
                  <p className="text-muted-foreground text-sm">
                    Contact storage costs $10 per 10,000 contacts/month on
                    Marketing Campaigns plans. Wraps includes unlimited contacts
                    on all tiers.
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent>
                  <h3 className="mb-1 font-medium text-sm">Hidden cost #3</h3>
                  <p className="text-muted-foreground text-sm">
                    Email activity history maxes at 30 days even on Pro. Wraps
                    Events live in your DynamoDB -- you control retention.
                    SendGrid offers no equivalent at any price.
                  </p>
                </CardContent>
              </Card>
            </div>

            <p className="mt-4 text-muted-foreground text-sm">
              SendGrid pricing from{" "}
              <a
                className="text-primary underline"
                href="https://sendgrid.com/en-us/pricing"
                rel="noopener noreferrer"
                target="_blank"
              >
                sendgrid.com/pricing
              </a>
              . Wraps AWS cost = $0.10 per 1,000 emails via SES. All prices as
              of March 2026.{" "}
              <a
                className="text-primary underline"
                href="/tools/ses-calculator"
              >
                Calculate your costs
              </a>
            </p>
          </section>

          {/* 6. Detailed Feature Comparison */}
          <section className="mb-16">
            <h2 className="mb-6 font-semibold text-2xl">
              Detailed Feature Comparison
            </h2>
            <Card className="overflow-hidden py-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-4 text-left font-medium">Feature</th>
                      <th className="p-4 text-left font-medium">SendGrid</th>
                      <th className="p-4 text-left font-medium text-primary">
                        Wraps
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {featureComparison.map((group) => (
                      <Fragment key={group.category}>
                        <tr className="bg-muted/30">
                          <td
                            className="p-4 font-semibold text-xs uppercase tracking-wider"
                            colSpan={3}
                          >
                            {group.category}
                          </td>
                        </tr>
                        {group.features.map((feature) => (
                          <tr
                            className="border-b last:border-b-0"
                            key={feature.name}
                          >
                            <td className="p-4">{feature.name}</td>
                            <td className="p-4">
                              <FeatureCell value={feature.sendgrid} />
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

          {/* 7. When to Choose SendGrid */}
          <section className="mb-16">
            <div className="mb-6 flex items-center gap-3">
              <AlertTriangle className="size-6 text-muted-foreground" />
              <h2 className="font-semibold text-2xl">
                When to Choose SendGrid
              </h2>
            </div>
            <Card>
              <CardContent>
                <p className="mb-4 text-muted-foreground">
                  SendGrid has real advantages that we want to acknowledge
                  honestly.
                </p>
                <ul className="space-y-3">
                  {[
                    "You need a visual drag-and-drop email editor and built-in A/B testing -- Wraps uses AI-powered editing and code-first templates.",
                    "You need SDKs in Python, Ruby, Go, Java, C#, or PHP -- Wraps supports TypeScript only.",
                    "You want zero infrastructure management. SendGrid is API-key-in, email-out. Wraps requires an AWS account and a 3-minute deployment.",
                    "You're buying within a Twilio enterprise contract with bundled pricing.",
                    "Non-developer team members need to build and send emails without code.",
                  ].map((point) => (
                    <li className="flex items-start gap-3" key={point}>
                      <Check className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                      <span className="text-sm">{point}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </section>

          {/* 8. When to Choose Wraps */}
          <section className="mb-16">
            <h2 className="mb-6 font-semibold text-2xl">
              When to Choose Wraps
            </h2>
            <Card className="border-primary/30">
              <CardContent>
                <ul className="space-y-3">
                  {[
                    "You care about cost at scale. At 500K emails/month, Wraps saves $200/mo ($2,400/year) over SendGrid.",
                    "You want to own your email infrastructure and data. If you leave Wraps, your SES, DynamoDB, and Lambda stay in your account.",
                    "You need reliability you control. SES reputation is domain-based, and dedicated IPs are available when you need them.",
                    "You're already on AWS and don't want to add another vendor dependency.",
                    "You want full control over data retention. Events live in your DynamoDB -- keep them as long as you need. SendGrid maxes at 30 days even on Pro.",
                    "You value transparency. You can see exactly what infrastructure runs, audit the open-source code, and pay AWS directly.",
                  ].map((point) => (
                    <li className="flex items-start gap-3" key={point}>
                      <Check className="mt-0.5 size-5 shrink-0 text-green-500" />
                      <span className="text-sm">{point}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </section>

          {/* 9. Switching from SendGrid */}
          <section className="mb-16">
            <div className="mb-6 flex items-center gap-3">
              <GitFork className="size-6 text-primary" />
              <h2 className="font-semibold text-2xl">
                Switching from SendGrid
              </h2>
            </div>
            <p className="mb-6 text-muted-foreground">
              Replace{" "}
              <code className="rounded bg-muted px-1">@sendgrid/mail</code> with{" "}
              <code className="rounded bg-muted px-1">@wraps.dev/email</code>.
              The SDK swap is straightforward.
            </p>

            <CodeComparison
              after={{
                label: "After (Wraps)",
                filename: "send.ts",
                language: "typescript",
                code: wrapsCode,
                highlight: true,
              }}
              before={{
                label: "Before (SendGrid)",
                filename: "send.ts",
                language: "typescript",
                code: sendgridCode,
              }}
            />

            <div className="mt-6 space-y-3">
              <h3 className="font-medium">Migration advantages with Wraps</h3>
              <ul className="space-y-2 text-muted-foreground text-sm">
                <li className="flex items-start gap-3">
                  <Check className="mt-0.5 size-5 shrink-0 text-green-500" />
                  <span>
                    <strong>No IP warmup needed.</strong> SES reputation is
                    domain-based. If you already have SES sending history, you
                    keep your reputation.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="mt-0.5 size-5 shrink-0 text-green-500" />
                  <span>
                    <strong>No DNS vendor dependency.</strong> Domain
                    verification is done in SES (your account). No third-party
                    DNS records to maintain.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="mt-0.5 size-5 shrink-0 text-green-500" />
                  <span>
                    <strong>Suppression list import.</strong> Export your
                    SendGrid suppression CSV and import it into Wraps.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="mt-0.5 size-5 shrink-0 text-green-500" />
                  <span>
                    <strong>Deploy in ~3 minutes.</strong> Run{" "}
                    <code className="rounded bg-muted px-1">
                      wraps email setup
                    </code>{" "}
                    to deploy the full stack to your AWS account.
                  </span>
                </li>
              </ul>
            </div>
          </section>

          <AlsoCompare current="/compare/sendgrid-vs-wraps" />

          {/* CTA */}
          <section className="rounded-lg border bg-muted/30 p-8 text-center">
            <h2 className="mb-2 font-semibold text-xl">
              Ready to own your email infrastructure?
            </h2>
            <p className="mb-6 text-muted-foreground">
              Deploy to your AWS in 2 minutes. Free tier includes 5K tracked
              events/month.
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

          {/* Footer note */}
          <div className="mt-12 space-y-2 text-center text-muted-foreground text-xs">
            <p>Last updated: March 2026</p>
            <p>
              We update this page regularly. If anything here is inaccurate,{" "}
              <a className="text-primary underline" href="mailto:hey@wraps.dev">
                let us know
              </a>
              . All SendGrid pricing and features sourced from{" "}
              <a
                className="text-primary underline"
                href="https://sendgrid.com/en-us/pricing"
                rel="noopener noreferrer"
                target="_blank"
              >
                sendgrid.com
              </a>{" "}
              and{" "}
              <a
                className="text-primary underline"
                href="https://www.trustpilot.com/review/sendgrid.com"
                rel="noopener noreferrer"
                target="_blank"
              >
                Trustpilot
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
