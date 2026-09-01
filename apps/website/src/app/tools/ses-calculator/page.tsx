import { Badge } from "@wraps/ui/components/ui/badge";
import { Button } from "@wraps/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { JsonLd } from "@/components/json-ld";
import SESCalculatorPageContent from "./page-content";

export const metadata: Metadata = {
  title: "Amazon SES Pricing Calculator",
  description:
    "Calculate your true AWS SES email costs including infrastructure (Lambda, DynamoDB, SQS, EventBridge). The only SES pricing calculator that shows full production costs, not just the $0.10/1K à la carte sending fee — or the $0.16/1K AWS defaults new accounts to.",
  openGraph: {
    title: "Amazon SES Pricing Calculator | Wraps",
    description:
      "Calculate your true AWS SES costs including infrastructure. See full production email costs beyond the $0.10/1K à la carte headline — AWS now defaults new accounts to $0.16/1K instead.",
  },
  twitter: {
    title: "Amazon SES Pricing Calculator | Wraps",
    description:
      "Calculate your true AWS SES costs including infrastructure. See full production email costs beyond the $0.10/1K à la carte headline — AWS now defaults new accounts to $0.16/1K instead.",
  },
  alternates: {
    canonical: "https://wraps.dev/tools/ses-calculator",
  },
};

const webAppSchema = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Amazon SES Pricing Calculator",
  description:
    "Interactive calculator for estimating AWS SES email costs including full infrastructure pricing for Lambda, DynamoDB, SQS, EventBridge, dedicated IPs, and more.",
  url: "https://wraps.dev/tools/ses-calculator",
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Any",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  provider: {
    "@type": "Organization",
    name: "Wraps",
    url: "https://wraps.dev",
  },
  featureList: [
    "AWS SES sending cost calculation",
    "Full infrastructure cost breakdown (Lambda, DynamoDB, SQS, EventBridge)",
    "Feature-based pricing (event tracking, dedicated IP, HTTPS tracking)",
    "AWS Free Tier calculations included",
    "Shareable calculator configurations via URL",
    "Volume presets for common use cases",
  ],
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "How much does AWS SES cost per email?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "AWS SES costs $0.10 per 1,000 emails ($0.0001 per email) at the à la carte rate. AWS defaults every new account to the Essentials plan instead, at $0.16 per 1,000 emails — moving back to à la carte takes effect immediately. However, a production email setup also requires infrastructure for event processing and storage — EventBridge, SQS, Lambda, and DynamoDB — which typically adds $1-10/mo depending on volume.",
      },
    },
    {
      "@type": "Question",
      name: "What is the total cost of running AWS SES in production?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "For a typical startup sending 50,000 emails/month with event tracking and 90-day history retention on the à la carte SES rate, expect roughly $5-10/month total including SES sending fees and supporting infrastructure — a few dollars more if the account defaults to AWS's pricier Essentials plan. Most AWS services include generous free tiers that cover low-volume infrastructure usage, though SES sending itself has no free tier.",
      },
    },
    {
      "@type": "Question",
      name: "Does AWS SES have a free tier?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "SES itself has no permanent free sending tier — the à la carte rate is $0.10 per 1,000 emails, though AWS defaults new accounts to the Essentials plan at $0.16 per 1,000 instead. The SES-specific free tier (3,000 emails/month for 12 months) no longer exists for new accounts. New AWS accounts get a generic $200 AWS credit instead. However, the supporting infrastructure benefits from AWS free tiers: 1 million Lambda requests/month, 1 million SQS requests/month, and 25 GB of DynamoDB storage.",
      },
    },
    {
      "@type": "Question",
      name: "How much does a dedicated IP cost in AWS SES?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "A dedicated IP address in AWS SES costs $24.95 per month on the à la carte or Essentials plans. Dedicated IPs are recommended for senders with consistent volume over 100,000 emails per day, as they give you full control over your sending IP reputation. The Pro and Enterprise SES plans include one managed dedicated IP at no extra charge.",
      },
    },
    {
      "@type": "Question",
      name: "Is AWS SES cheaper than SendGrid, Resend, or Postmark?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "AWS SES is significantly cheaper at scale. SES costs $0.10 per 1,000 emails at the à la carte rate (AWS defaults new accounts to the pricier Essentials plan at $0.16 per 1,000 instead) with no monthly minimum. By comparison, SendGrid starts at $19.95/month for 50K emails and Resend starts at $20/month. The trade-off is SES requires infrastructure setup, which tools like Wraps automate with a single command.",
      },
    },
  ],
};

export default function SESCalculatorPage() {
  return (
    <>
      <JsonLd data={webAppSchema} />
      <JsonLd data={faqSchema} />
      <div className="min-h-dvh bg-background">
        <LandingNavbar />

        {/* Main Content */}
        <main className="container mx-auto px-4 pt-24 pb-12">
          <div className="mx-auto max-w-6xl">
            {/* Page Header */}
            <div className="mb-12 text-center">
              <Badge className="mb-4" variant="outline">
                Cost Estimator
              </Badge>
              <h1 className="mb-4 text-balance font-bold text-4xl tracking-tight">
                Amazon SES Pricing Calculator
              </h1>
              <p className="mx-auto max-w-2xl text-pretty text-lg text-muted-foreground">
                Calculate your true AWS SES costs — not just the $0.10/1K à la
                carte sending fee (AWS now defaults new accounts to $0.16/1K
                instead), but the full production infrastructure: EventBridge,
                Lambda, SQS, and DynamoDB. The only SES calculator that shows
                what you&apos;ll actually pay.
              </p>
            </div>

            {/* Interactive Calculator Widget */}
            <Suspense>
              <SESCalculatorPageContent />
            </Suspense>

            {/* Mid-page CTA — high-intent users who just saw their number */}
            <section className="mt-12">
              <Card className="overflow-hidden border-primary/30 bg-gradient-to-br from-primary/10 via-background to-background">
                <CardContent className="p-6 md:p-8">
                  <div className="flex flex-col items-start gap-6 md:flex-row md:items-center">
                    <div className="flex-1">
                      <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 font-mono text-primary text-xs uppercase tracking-wider">
                        One command
                      </div>
                      <h3 className="mb-2 font-bold text-2xl tracking-tight">
                        Deploy this exact setup in minutes
                      </h3>
                      <p className="text-muted-foreground">
                        Wraps provisions every service in your breakdown —
                        Lambda, SQS, DynamoDB, EventBridge — to your AWS
                        account. Still AWS pricing, still your data, no
                        boilerplate.
                      </p>
                    </div>
                    <div className="flex w-full flex-col gap-3 sm:flex-row md:w-auto md:flex-col lg:flex-row">
                      <Button asChild size="lg">
                        <a href="https://app.wraps.dev/auth?mode=signup">
                          Start free
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </a>
                      </Button>
                      <Button asChild size="lg" variant="outline">
                        <Link href="/docs/quickstart/email">
                          See quickstart
                        </Link>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* Educational Content Section */}
            <section className="mt-16 space-y-8">
              <div className="text-center">
                <h2 className="mb-4 font-bold text-3xl tracking-tight">
                  Understanding AWS SES Pricing
                </h2>
                <p className="mx-auto max-w-2xl text-muted-foreground">
                  SES advertises $0.10 per 1,000 emails at the à la carte rate,
                  but AWS defaults new accounts to the pricier Essentials plan
                  ($0.16/1,000) instead — and production email infrastructure
                  costs more on top. Here&apos;s what most calculators miss.
                </p>
              </div>

              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">
                      Four Rates, Not One
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-muted-foreground text-sm">
                    <p>
                      AWS SES has four pricing plans: à la carte ($0.10/1,000),
                      Essentials ($0.16/1,000), Pro ($105/mo + $0.22/1,000), and
                      Enterprise ($500/mo + $0.23/1,000). AWS defaults every new
                      account to Essentials — use the calculator above to
                      compare all four and see what switching to à la carte
                      would save.
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">
                      Hidden Infrastructure
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-muted-foreground text-sm">
                    <p>
                      To track bounces, opens, clicks, and deliveries, you need
                      EventBridge for real-time events, SQS for queuing, Lambda
                      for processing, and DynamoDB for storage. These add
                      $1-10/mo depending on volume.
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">
                      Dedicated IP Costs
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-muted-foreground text-sm">
                    <p>
                      A dedicated IP costs $24.95/month. You only need one if
                      you send 100K+ emails per day consistently. Shared IPs
                      work fine for most senders with good practices.
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">
                      Free Tier Benefits
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-muted-foreground text-sm">
                    <p>
                      AWS free tiers cover most low-volume infrastructure: 1M
                      Lambda requests, 1M SQS requests, and 25GB DynamoDB
                      storage per month. SES sending itself has no free tier, so
                      small senders often pay only the à la carte (or
                      Essentials) sending fee.
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">
                      SES vs. SendGrid/Resend
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-muted-foreground text-sm">
                    <p>
                      SendGrid starts at $19.95/mo for 50K emails. Resend starts
                      at $20/mo. With SES + infrastructure, the same volume
                      costs ~$5-7/mo. The savings compound at scale.
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">
                      Why Own Your Setup?
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-muted-foreground text-sm">
                    <p>
                      With SES, infrastructure runs in your AWS account. No
                      vendor lock-in, full data ownership, and transparent
                      pay-as-you-go pricing. Wraps deploys this in one command.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </section>

            {/* FAQ Section */}
            <section className="mt-16 space-y-8">
              <div className="text-center">
                <h2 className="mb-4 font-bold text-3xl tracking-tight">
                  Frequently Asked Questions
                </h2>
                <p className="mx-auto max-w-2xl text-muted-foreground">
                  Common questions about AWS SES pricing and costs.
                </p>
              </div>

              <div className="mx-auto max-w-3xl space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      How much does AWS SES cost per email?
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-muted-foreground text-sm">
                    <p>
                      AWS SES costs $0.10 per 1,000 emails ($0.0001 per email)
                      at the à la carte rate. AWS defaults every new account to
                      the Essentials plan instead, at $0.16 per 1,000 emails —
                      moving back to à la carte takes effect immediately.
                      However, a production email setup also requires
                      infrastructure for event processing and storage —
                      EventBridge, SQS, Lambda, and DynamoDB — which typically
                      adds $1-10/mo depending on volume.
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      What is the total cost of running AWS SES in production?
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-muted-foreground text-sm">
                    <p>
                      For a typical startup sending 50,000 emails/month with
                      event tracking and 90-day history retention on the à la
                      carte SES rate, expect roughly $5-10/month total including
                      SES sending fees and supporting infrastructure — a few
                      dollars more if the account defaults to AWS&apos;s pricier
                      Essentials plan. Most AWS services include generous free
                      tiers that cover low-volume infrastructure usage, though
                      SES sending itself has no free tier.
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      Does AWS SES have a free tier?
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-muted-foreground text-sm">
                    <p>
                      SES itself has no permanent free sending tier — the à la
                      carte rate is $0.10 per 1,000 emails, though AWS defaults
                      new accounts to the Essentials plan at $0.16 per 1,000
                      instead. The SES-specific free tier (3,000 emails/month
                      for 12 months) no longer exists for new accounts. New AWS
                      accounts get a generic $200 AWS credit instead. However,
                      the supporting infrastructure benefits from AWS free
                      tiers: 1 million Lambda requests/month, 1 million SQS
                      requests/month, and 25 GB of DynamoDB storage.
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      How much does a dedicated IP cost in AWS SES?
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-muted-foreground text-sm">
                    <p>
                      A dedicated IP address in AWS SES costs $24.95 per month
                      on the à la carte or Essentials plans. Dedicated IPs are
                      recommended for senders with consistent volume over
                      100,000 emails per day, as they give you full control over
                      your sending IP reputation. The Pro and Enterprise SES
                      plans include one managed dedicated IP at no extra charge.
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      Is AWS SES cheaper than SendGrid, Resend, or Postmark?
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-muted-foreground text-sm">
                    <p>
                      AWS SES is significantly cheaper at scale. SES costs $0.10
                      per 1,000 emails at the à la carte rate (AWS defaults new
                      accounts to the pricier Essentials plan at $0.16 per 1,000
                      instead) with no monthly minimum. By comparison, SendGrid
                      starts at $19.95/month for 50K emails and Resend starts at
                      $20/month. The trade-off is SES requires infrastructure
                      setup, which tools like Wraps automate with a single
                      command.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </section>

            {/* Pricing Notes */}
            <Card className="mt-12">
              <CardHeader>
                <CardTitle>Pricing Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div>
                  <h3 className="mb-2 font-semibold">How We Calculate Costs</h3>
                  <p className="text-pretty text-muted-foreground">
                    All costs are based on official AWS pricing as of 2026-07-21
                    for US East (N. Virginia) region. Costs include AWS free
                    tier benefits where applicable. Storage costs shown
                    represent <strong>steady-state</strong> (after retention
                    period fills up) - initial months will be cheaper as storage
                    builds gradually. Your actual costs may vary based on region
                    and usage patterns.
                  </p>
                </div>
                <div>
                  <h3 className="mb-2 font-semibold">What&apos;s Included</h3>
                  <ul className="list-inside list-disc space-y-1 text-muted-foreground">
                    <li>
                      SES email sending ($0.10 per 1,000 emails at the à la
                      carte rate; AWS defaults new accounts to Essentials at
                      $0.16 per 1,000 instead)
                    </li>
                    <li>
                      Event processing (EventBridge, SQS, Lambda) if enabled
                    </li>
                    <li>Email history storage in DynamoDB if enabled</li>
                    <li>Optional dedicated IP address ($24.95/month)</li>
                    <li>
                      All infrastructure runs in your AWS account - you pay AWS
                      directly
                    </li>
                  </ul>
                </div>
                <div>
                  <h3 className="mb-2 font-semibold">Wraps Platform Fee</h3>
                  <p className="text-pretty text-muted-foreground">
                    Wraps is a platform fee for email infrastructure you own.
                    You pay us for tooling (dashboard, workflows, AI, analytics)
                    and AWS directly for sending ($0.10/1K emails at the à la
                    carte rate, or $0.16/1K if your account defaults to
                    Essentials). Sends, domains, contacts, and templates are
                    unlimited on every plan. Paid plans unlock longer dashboard
                    history, more AWS accounts, and features like topics,
                    segments, and campaigns.
                  </p>
                </div>
                <div>
                  <h3 className="mb-2 font-semibold">CLI & SDK</h3>
                  <p className="text-pretty text-muted-foreground">
                    The Wraps CLI and TypeScript SDK work with all plans,
                    including Free. Deploy to your AWS account — no vendor
                    lock-in, no hidden fees.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Cross-links to other tools */}
            <section className="mt-12">
              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="pt-6">
                  <div className="flex flex-col items-center gap-4 text-center md:flex-row md:text-left">
                    <div className="flex-1">
                      <h3 className="mb-2 font-bold text-xl">
                        Check your email deliverability
                      </h3>
                      <p className="text-muted-foreground">
                        Use our free Email Deliverability Checker to verify SPF,
                        DKIM, DMARC, and domain reputation before you send.
                      </p>
                    </div>
                    <Button asChild size="lg">
                      <Link href="/tools">
                        Check Your Domain
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </section>
          </div>
        </main>

        <LandingFooter />
      </div>
    </>
  );
}
