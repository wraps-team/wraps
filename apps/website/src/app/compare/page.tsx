import { Button } from "@wraps/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import { ArrowRight, ChevronRight, GitCompareArrows } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { SectionKicker } from "@/app/landing/components/section-kicker";

export const metadata: Metadata = {
  title: "Compare Wraps to Email Platforms — Resend, SendGrid, SES & More",
  description:
    "See how Wraps compares to Resend, SendGrid, Amazon SES, Postmark, Customer.io, and Klaviyo. Real pricing, real features, honest tradeoffs.",
  openGraph: {
    title: "Compare Wraps to Email Platforms | Wraps",
    description:
      "See how Wraps compares to Resend, SendGrid, Amazon SES, Postmark, Customer.io, and Klaviyo. Real pricing, real features, honest tradeoffs.",
    url: "https://wraps.dev/compare",
  },
  twitter: {
    title: "Compare Wraps to Email Platforms | Wraps",
    description:
      "See how Wraps compares to Resend, SendGrid, Amazon SES, Postmark, Customer.io, and Klaviyo.",
  },
  alternates: {
    canonical: "https://wraps.dev/compare",
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
  ],
};

const comparisons = [
  {
    competitor: "Resend",
    href: "/compare/resend-vs-wraps",
    tagline: "Same DX, different economics",
    description:
      "Resend sends from their AWS account. Wraps deploys to yours. Compare data retention (Resend purges after 30 days; with Wraps the raw events land in your own DynamoDB and stay there), overage pricing ($0.90/1K vs $0.10/1K à la carte), and what happens when you cancel.",
  },
  {
    competitor: "Amazon SES",
    href: "/compare/amazon-ses-vs-wraps",
    tagline: "Same infrastructure, better DX",
    description:
      "Wraps is SES underneath — same pricing, same deliverability. The difference is setup time (2 minutes vs days), a TypeScript SDK, templates, workflows, and a dashboard you don't have to build.",
  },
  {
    competitor: "SendGrid",
    href: "/compare/sendgrid-vs-wraps",
    tagline: "Escape the legacy tax",
    description:
      "SendGrid's 1.2/5 Trustpilot rating tells the story. Compare account suspension risk, hidden costs at scale, and why thousands of developers are moving off Twilio's email platform.",
  },
  {
    competitor: "Customer.io",
    href: "/compare/customer-io-vs-wraps",
    tagline: "Unlimited contacts, no surprise bills",
    description:
      "Customer.io charges per contact — $100/mo at 5K profiles, ~$1,000/mo at 100K. Wraps charges a flat platform fee with unlimited contacts. Compare the full cost at every volume.",
  },
  {
    competitor: "Postmark",
    href: "/compare/postmark-vs-wraps",
    tagline: "Beyond transactional sending",
    description:
      "Postmark is transactional-only with great deliverability. Wraps adds automations, broadcasts, segments, and templates — all sending through infrastructure you own in your AWS account.",
  },
  {
    competitor: "Klaviyo",
    href: "/compare/klaviyo-vs-wraps",
    tagline: "Up to 5.6x cheaper at scale",
    description:
      "Klaviyo is built for e-commerce marketing with Shopify deep integration. If you're a developer-led team sending transactional and lifecycle email, compare what you're actually paying for.",
  },
  {
    competitor: "Mailgun",
    href: "/compare/mailgun-vs-wraps",
    tagline: "Your infra, AWS pricing, no suspensions",
    description:
      "Mailgun's Flex tier is gone and account suspensions are a recurring complaint. Compare pricing at real volumes, deliverability controls, and what owning the sending infrastructure changes.",
  },
  {
    competitor: "Hand-rolled bounce handling",
    href: "/compare/ses-bounce-handling-hand-rolled-vs-wraps",
    tagline: "152 honest lines, and what they don't cover",
    description:
      "The real alternative to Wraps usually isn't a competitor — it's writing it yourself. We show the full 85-line SNS signature verification, confirm it's correct, and then make the case for what the code doesn't cover.",
  },
];

export default function ComparePage() {
  return (
    <div className="min-h-screen bg-background">
      <LandingNavbar />
      <Script id="breadcrumb-jsonld" type="application/ld+json">
        {JSON.stringify(breadcrumbJsonLd)}
      </Script>

      <main className="container mx-auto px-4 pt-24 pb-16">
        <div className="mx-auto max-w-4xl">
          <nav aria-label="Breadcrumb" className="mb-8">
            <ol className="flex items-center gap-1.5 text-muted-foreground text-sm">
              <li>
                <Link
                  className="transition-colors hover:text-foreground"
                  href="/"
                >
                  Home
                </Link>
              </li>
              <li>
                <ChevronRight className="size-3.5" />
              </li>
              <li className="text-foreground">Compare</li>
            </ol>
          </nav>

          {/* Hero */}
          <div className="mb-12">
            <SectionKicker>Comparisons</SectionKicker>
            <div className="mb-4 flex items-center gap-3">
              <GitCompareArrows className="size-8 text-muted-foreground" />
              <h1 className="font-heading font-semibold text-4xl tracking-tight">
                Compare Wraps
              </h1>
            </div>
            <p className="mb-4 max-w-2xl text-lg text-muted-foreground">
              Honest, data-backed comparisons with real pricing at real volumes.
              We show where competitors win too — because you deserve the full
              picture, not a sales pitch.
            </p>
            <p className="max-w-2xl text-muted-foreground">
              These are head-to-heads: Wraps against one platform at a time. If
              you are still surveying the field,{" "}
              <Link
                className="text-primary underline underline-offset-4"
                href="/alternatives"
              >
                the ranked alternatives lists
              </Link>{" "}
              cover every real option, ours placed where it honestly belongs.
            </p>
          </div>

          {/* Comparison Cards */}
          <div className="mb-16 grid gap-4">
            {comparisons.map((c) => (
              <Link href={c.href} key={c.href}>
                <Card className="transition-colors hover:border-orange-500/50">
                  <CardContent className="flex items-center gap-6">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center gap-3">
                        <h2 className="font-heading font-semibold text-xl tracking-tight">
                          {c.competitor} vs Wraps
                        </h2>
                        <span className="text-muted-foreground text-sm">
                          {c.tagline}
                        </span>
                      </div>
                      <p className="text-muted-foreground text-sm">
                        {c.description}
                      </p>
                    </div>
                    <ArrowRight className="size-5 shrink-0 text-muted-foreground" />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>

          {/* The Wraps Difference */}
          <section className="mb-16">
            <h2 className="mb-6 font-heading font-semibold text-2xl tracking-tight">
              What makes Wraps different
            </h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle>Your infrastructure</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground text-sm">
                    Wraps deploys SES, DynamoDB, and Lambda to your AWS account.
                    You own everything.
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>AWS pricing</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground text-sm">
                    $0.10 per 1,000 emails à la carte (AWS defaults new accounts
                    to $0.16 — Wraps tells you which plan applies). No
                    per-contact fees, no overage surcharges.
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>No lock-in</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground text-sm">
                    Stop paying Wraps anytime. Your infrastructure keeps
                    running. Email events stay in your DynamoDB. Contacts
                    exportable anytime.
                  </p>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* CTA */}
          <section className="rounded-lg border bg-muted/30 p-8 text-center">
            <h2 className="mb-2 font-heading font-semibold text-xl tracking-tight">
              Ready to try it?
            </h2>
            <p className="mb-6 text-muted-foreground">
              Deploy in 2 minutes. No credit card required.
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

          <p className="mt-8 text-center text-muted-foreground text-xs">
            Last updated: July 2026. See something inaccurate?{" "}
            <a className="underline" href="mailto:support@wraps.dev">
              Let us know
            </a>
            .
          </p>
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}
