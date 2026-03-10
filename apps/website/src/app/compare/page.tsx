import { ArrowRight, ChevronRight, GitCompareArrows } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
      "Resend sends from their AWS account. Wraps deploys to yours. Compare data retention (3 days vs unlimited), overage pricing ($0.90/1K vs $0.10/1K), and what happens when you cancel.",
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
      "Customer.io charges per contact — $100/mo at 5K profiles, $1,000/mo at 75K. Wraps charges a flat platform fee with unlimited contacts. Compare the full cost at every volume.",
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
    tagline: "10x cheaper at scale",
    description:
      "Klaviyo is built for e-commerce marketing with Shopify deep integration. If you're a developer-led team sending transactional and lifecycle email, compare what you're actually paying for.",
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
            <div className="mb-4 flex items-center gap-3">
              <GitCompareArrows className="size-8 text-primary" />
              <h1 className="font-bold text-4xl tracking-tight">
                Compare Wraps
              </h1>
            </div>
            <p className="max-w-2xl text-lg text-muted-foreground">
              Honest, data-backed comparisons with real pricing at real volumes.
              We show where competitors win too — because you deserve the full
              picture, not a sales pitch.
            </p>
          </div>

          {/* Comparison Cards */}
          <div className="mb-16 grid gap-4">
            {comparisons.map((c) => (
              <Link href={c.href} key={c.href}>
                <Card className="transition-colors hover:border-primary/50">
                  <CardContent className="flex items-center gap-6">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center gap-3">
                        <h2 className="font-semibold text-xl">
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
            <h2 className="mb-6 font-semibold text-2xl">
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
                    $0.10 per 1,000 emails. No per-contact fees, no overage
                    surcharges, no surprises.
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
            <h2 className="mb-2 font-semibold text-xl">Ready to try it?</h2>
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
            Last updated: March 2026. See something inaccurate?{" "}
            <a className="underline" href="mailto:hey@wraps.dev">
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
