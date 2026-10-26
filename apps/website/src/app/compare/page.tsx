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
import { ResendForgeNotice } from "@/components/resend-forge-notice";

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
    tagline: "Their infrastructure, or yours",
    description:
      "Resend sends from its own infrastructure (Amazon SES historically, its Forge MTA for domains that opt in). Wraps deploys to your AWS account. Compare data retention (Resend purges after 30 days; with Wraps the raw events land in your own DynamoDB and stay there), overage pricing ($0.90/1K vs $0.10/1K à la carte), and what happens when you cancel.",
  },
  {
    competitor: "Amazon SES",
    href: "/compare/amazon-ses-vs-wraps",
    tagline: "Same SES, set up and run for you",
    description:
      "Wraps is SES underneath — same pricing, same deliverability, your account. The difference is that it is standing in two minutes instead of days, and that the daily job has somewhere to live: bounce and complaint rates against the lines AWS reviews and pauses at, suppression, deliverability audits, every message searchable.",
  },
  {
    competitor: "SendGrid",
    href: "/compare/sendgrid-vs-wraps",
    tagline: "Rent the sending, or own it",
    description:
      "SendGrid has the scale and the support desk, and sends from their infrastructure on shared IPs you do not control. Compare what changes when the account, the reputation and the sending data are yours — and what you take on when they are.",
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
    tagline: "Built for developers, not storefronts",
    description:
      "Klaviyo is excellent at ecommerce lifecycle marketing and a non-engineer can run it. If you are a developer-led team sending transactional and lifecycle email, compare the feature surface you actually use against what contact-based billing charges you for.",
  },
  {
    competitor: "Mailgun",
    href: "/compare/mailgun-vs-wraps",
    tagline: "Your account, your reputation",
    description:
      "Mailgun brings a long track record, EU regions and mature deliverability tooling. Compare pricing at real volumes against sending from an account you own, and what changes when the reputation being built is yours.",
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
              Real pricing at real volumes, and the rows where the other
              platform wins are in here too. Read the ones that describe you.
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
            <p className="mt-4 max-w-2xl text-muted-foreground">
              And if the question is which <em>kind</em> of thing to use rather
              than which vendor — run SES yourself, rent a sending API, rent a
              marketing platform, or put an open-source wrapper over your own
              SES —{" "}
              <Link
                className="text-primary underline underline-offset-4"
                href="/approaches"
              >
                the four approaches
              </Link>{" "}
              is the rubric. Wraps is one of the wrappers, and that page
              compares it against the others.
            </p>
          </div>

          {/* Comparison Cards */}
          <div className="mb-16 grid gap-4">
            {comparisons.map((c) => (
              <Link href={c.href} key={c.href}>
                <Card className="transition-colors hover:border-brand/50">
                  <CardContent className="flex items-center gap-6">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center gap-3">
                        <h2 className="font-heading font-semibold text-xl tracking-tight">
                          {c.competitor} vs Wraps
                        </h2>
                        <span className="text-muted-foreground text-sm">
                          {c.tagline}
                        </span>
                        {c.competitor === "Resend" && (
                          <ResendForgeNotice variant="inline" />
                        )}
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

          <section className="mb-16 rounded-2xl border bg-muted/30 p-6">
            <h2 className="mb-2 font-heading font-semibold text-xl tracking-tight">
              Before the head-to-heads, decide what you are comparing on
            </h2>
            <p className="mb-4 text-muted-foreground">
              Seven things separate an email API you enjoy from one you
              tolerate, each with a test you can run in an afternoon. The
              scoring includes the item Wraps fails.
            </p>
            <div className="flex flex-col gap-2">
              <Link
                className="text-primary underline"
                href="/blog/developer-first-email-api-checklist"
              >
                The developer-first email API checklist
              </Link>
              <Link
                className="text-primary underline"
                href="/blog/why-email-providers-cost-more-than-ses"
              >
                Why providers cost more than sending through SES directly
              </Link>
              <Link
                className="text-primary underline"
                href="/blog/email-pricing-models"
              >
                The five pricing models, and what each does to your bill
              </Link>
            </div>
          </section>

          {/* The Wraps Difference */}
          <section className="mb-16">
            <h2 className="mb-6 font-heading font-semibold text-2xl tracking-tight">
              What makes Wraps different
            </h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle>We set it up</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground text-sm">
                    One command deploys SES, DynamoDB, Lambda, EventBridge and
                    scoped IAM roles into your AWS account. Namespaced, so
                    nothing you already run gets touched.
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>The control plane runs it</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground text-sm">
                    Bounce and complaint rates drawn against the lines AWS
                    reviews and pauses at, swept hourly. Suppression,
                    deliverability and blacklist audits, every message
                    searchable.
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>It stays yours</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground text-sm">
                    Stop paying and the infrastructure keeps running — it is in
                    your account, and AWS bills you directly for the sending.
                    Contacts and templates export on the way out.
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
            Last updated: September 2026. See something inaccurate?{" "}
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
