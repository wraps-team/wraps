import { Badge } from "@wraps/ui/components/ui/badge";
import { Button } from "@wraps/ui/components/ui/button";
import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { JsonLd } from "@/components/json-ld";

const TITLE = "The Five Pricing Models for High-Volume Email";
const DESCRIPTION =
  "Per-email tiers, per-contact, per-event, committed volume, and infrastructure pass-through. What each model does to your bill as you grow, and which vendors use which.";
const URL = "https://wraps.dev/blog/email-pricing-models";
const PUBLISHED = "2026-09-03T00:00:00.000Z";

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: TITLE,
  description: DESCRIPTION,
  image: "https://wraps.dev/og-image.png",
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  author: {
    "@type": "Organization",
    name: "Wraps",
    url: "https://wraps.dev",
    description:
      "Email infrastructure experts building tools to deploy production-ready email systems to AWS.",
    sameAs: ["https://github.com/wraps-team", "https://twitter.com/wrapsdev"],
  },
  publisher: {
    "@type": "Organization",
    name: "Wraps",
    logo: { "@type": "ImageObject", url: "https://wraps.dev/logo.png" },
  },
  mainEntityOfPage: { "@type": "WebPage", "@id": URL },
};

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: "The Five Pricing Models for High-Volume Email | Wraps",
    description: DESCRIPTION,
    type: "article",
    url: URL,
    images: [
      {
        url: "https://wraps.dev/og-image.png",
        width: 1200,
        height: 630,
        alt: "Email pricing models",
      },
    ],
    publishedTime: PUBLISHED,
  },
  twitter: {
    title: "The Five Pricing Models for High-Volume Email | Wraps",
    description: DESCRIPTION,
  },
  alternates: { canonical: URL },
};

type Model = {
  n: string;
  name: string;
  how: string;
  breaks: string;
  who: string;
};

const MODELS: Model[] = [
  {
    n: "01",
    name: "Per-email tiers",
    how: "A monthly plan includes a volume band, and going past it either moves you up a band or bills an overage per thousand. The most common model in transactional email.",
    breaks:
      "Cost tracks sends, which is the thing you least want to discourage. Teams start suppressing useful mail to stay inside a band, and a traffic spike lands as a bill rather than a capacity problem.",
    who: "SendGrid, Resend, Postmark, Mailgun.",
  },
  {
    n: "02",
    name: "Per-contact",
    how: "You pay for how many people are in the database, whether or not you mail them. Sometimes billed on the high-water mark, so one import sets the price for the rest of the term.",
    breaks:
      "It taxes the asset instead of the activity. A dormant list costs the same as an engaged one, and the rational move, deleting people who never open, is the one the pricing punishes you for delaying.",
    who: "Mailchimp, Klaviyo, Customer.io and most marketing automation platforms.",
  },
  {
    n: "03",
    name: "Per-event",
    how: "Billing follows tracked events (opens, clicks, custom events emitted from your app) rather than messages or people.",
    breaks:
      "Instrumenting your product makes the bill go up, so teams under-instrument to stay cheap and end up with worse data than they started with. Watch for whether delivery events count or only custom ones.",
    who: "Usage-based analytics and messaging platforms. Wraps uses it in one place only: custom events on the free plan, capped at 5,000 a month. Paid plans do not meter events at all.",
  },
  {
    n: "04",
    name: "Committed volume",
    how: "An annual contract for a block of sends at a lower unit rate, usually with a minimum and usually negotiated.",
    breaks:
      "You are forecasting a year of traffic. Undershoot and you paid for air; overshoot and the overage rate is rarely the rate you negotiated. Fine at truly large volume, a trap at medium.",
    who: "Enterprise tiers everywhere, typically above a few million a month.",
  },
  {
    n: "05",
    name: "Infrastructure pass-through",
    how: "The vendor charges for software and the cloud provider bills you directly for delivery. Two invoices: a flat platform fee, and AWS at its own list price.",
    breaks:
      "The platform fee is predictable but the cloud bill is yours to understand, and it is not one number. You own the sandbox request, the reputation, and the AWS-side pipeline costs.",
    who: "Bring-your-own-cloud platforms, Wraps included.",
  },
];

export default function Page() {
  return (
    <>
      <JsonLd data={articleSchema} />

      <div className="min-h-screen bg-background">
        <LandingNavbar />

        <header className="relative overflow-hidden border-b pt-24 pb-16">
          <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent" />
          <div className="container relative mx-auto px-4">
            <Badge className="mb-4" variant="outline">
              Buying guide
            </Badge>
            <h1 className="mb-4 max-w-3xl font-bold text-4xl tracking-tight md:text-5xl">
              The five pricing models for{" "}
              <span className="text-primary">high-volume email</span>
            </h1>
            <p className="max-w-2xl text-lg text-muted-foreground">
              Comparing prices is easy and mostly useless. Comparing models
              tells you what your bill does in eighteen months.
            </p>
            <div className="mt-4 flex items-center gap-2 text-muted-foreground text-sm">
              <span>6 min read</span>
              <span>&bull;</span>
              <span>Wraps Team</span>
            </div>
          </div>
        </header>

        <main className="container mx-auto max-w-4xl space-y-16 px-4 py-16">
          <section>
            <p className="mb-6 text-lg text-muted-foreground">
              Two providers can quote the same $90 at 100,000 emails a month and
              bill you completely differently at 500,000, because they are
              charging for different things.
            </p>
            <p className="text-muted-foreground">
              Five models cover essentially the whole market. Each one is a bet
              about which number grows fastest in your business, and each has a
              behaviour it quietly encourages.
            </p>
          </section>

          {MODELS.map((m) => (
            <section key={m.n}>
              <div className="mb-4 flex items-baseline gap-4">
                <span className="font-mono text-lg text-primary">{m.n}</span>
                <h2 className="font-bold text-2xl">{m.name}</h2>
              </div>
              <p className="mb-4 text-muted-foreground">{m.how}</p>
              <div className="mb-4 rounded-xl border bg-muted/30 p-4">
                <div className="mb-1 font-semibold text-sm">
                  What it does to your behaviour
                </div>
                <p className="text-muted-foreground text-sm">{m.breaks}</p>
              </div>
              <p className="text-muted-foreground text-sm">
                <span className="font-medium text-foreground">Used by:</span>{" "}
                {m.who}
              </p>
            </section>
          ))}

          <section>
            <h2 className="mb-4 font-bold text-2xl">
              The question to ask instead of &ldquo;how much&rdquo;
            </h2>
            <p className="mb-4 text-muted-foreground">
              Pick the number in your business that will grow fastest over the
              next two years. For a consumer product it is usually contacts. For
              an API business it is sends. For anything with a usage-based
              product it is events. Then check whether your provider bills on
              that number.
            </p>
            <p className="text-muted-foreground">
              If it does, you are on a plan that gets more expensive precisely
              when things go well. That is not automatically wrong — it is
              exactly what a per-seat SaaS does, and people buy those happily —
              but it should be a decision rather than a surprise.
            </p>
          </section>

          <section>
            <h2 className="mb-4 font-bold text-2xl">
              Where Wraps sits, plainly
            </h2>
            <p className="mb-4 text-muted-foreground">
              Model five, almost entirely. The platform fee is flat per plan and
              does not move with sending volume. AWS bills you directly for
              delivery at its own rate. Sends, domains, contacts, templates and
              team members are unlimited on every plan, paid or not.
            </p>
            <p className="mb-4 text-muted-foreground">
              Three things do carry a monthly allowance, and none of them is
              sending. Custom events posted from your own application are capped
              at 5,000 a month on the free plan and unlimited on paid ones. AI
              template generations run 10, 250 and 1,000 a month across Free,
              Pro and Business. Connected AWS accounts are one on Free and Pro,
              unlimited on Business. All three are our storage and our compute,
              not AWS&apos;s, which is why they are the parts we meter.
            </p>
            <p className="text-muted-foreground">
              The cost of that model is the second invoice. You have an AWS bill
              to read, an SES sandbox request to get through, and a reputation
              that is yours from day one. If a single predictable line item
              matters more to you than the unit economics, a per-email tier is a
              defensible thing to buy.
            </p>
          </section>

          <section className="rounded-2xl border bg-muted/30 p-8">
            <h2 className="mb-3 font-bold text-2xl">Related</h2>
            <p className="mb-6 text-muted-foreground">
              What the markup on a per-email plan actually buys, and what
              changed in AWS SES&apos;s own plans this year.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/blog/why-email-providers-cost-more-than-ses">
                  Why providers cost more than SES
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/blog/ses-pricing-plans-2026">
                  AWS SES pricing plans
                </Link>
              </Button>
            </div>
          </section>
        </main>

        <LandingFooter />
      </div>
    </>
  );
}
