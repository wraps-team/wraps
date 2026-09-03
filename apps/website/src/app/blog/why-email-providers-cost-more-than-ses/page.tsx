import { Badge } from "@wraps/ui/components/ui/badge";
import { Button } from "@wraps/ui/components/ui/button";
import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { JsonLd } from "@/components/json-ld";

const TITLE =
  "Why Transactional Email Providers Cost More Than Sending Through SES";
const DESCRIPTION =
  "At 100,000 emails a month SES costs about $10 and SendGrid, Resend and Postmark cost $35 to $132. A line-by-line account of what the difference buys, and when it is worth paying.";
const URL = "https://wraps.dev/blog/why-email-providers-cost-more-than-ses";
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
    title: "Why Email Providers Cost More Than SES | Wraps",
    description: DESCRIPTION,
    type: "article",
    url: URL,
    images: [
      {
        url: "https://wraps.dev/og-image.png",
        width: 1200,
        height: 630,
        alt: "Email provider pricing versus Amazon SES",
      },
    ],
    publishedTime: PUBLISHED,
  },
  twitter: {
    title: "Why Email Providers Cost More Than SES | Wraps",
    description: DESCRIPTION,
  },
  alternates: { canonical: URL },
};

const PRICES: { provider: string; monthly: string; note: string }[] = [
  {
    provider: "Amazon SES (à la carte)",
    monthly: "$10",
    note: "$0.10 per 1,000. Sending only — no dashboard, no templates, no queue.",
  },
  {
    provider: "Amazon SES (Essentials)",
    monthly: "$16",
    note: "$0.16 per 1,000. The plan AWS puts new accounts on by default since July 2026.",
  },
  {
    provider: "SendGrid Essentials",
    monthly: "$34.95",
    note: "100K tier. Two webhooks, seven days of activity history.",
  },
  {
    provider: "Resend Scale",
    monthly: "$90",
    note: "100K included. Seven days of retention.",
  },
  {
    provider: "SendGrid Pro",
    monthly: "$89.95",
    note: "100K tier. Adds a dedicated IP, SSO, and subuser management.",
  },
  {
    provider: "Postmark Pro",
    monthly: "~$132",
    note: "$16.50 base for 10K, then about $1.30 per additional 1,000.",
  },
];

const BUYS: { item: string; body: string }[] = [
  {
    item: "IP reputation, warmed and watched",
    body: "The largest line item, and the one you cannot buy separately. A provider runs pools of addresses with years of sending history, moves customers between them, and employs people who talk to mailbox providers when something goes wrong. You are renting a relationship with Gmail that took a decade to build.",
  },
  {
    item: "Somebody else on call",
    body: "When a queue backs up at 3am it is their pager. On SES the equivalent failure is your Lambda, your dead letter queue, and your morning.",
  },
  {
    item: "Compliance and abuse work",
    body: "Feedback loops with every major ISP, complaint processing, list scrubbing, and the team that catches an abusive sender before they poison the pool your mail is also in. Invisible until it fails.",
  },
  {
    item: "The product on top of the pipe",
    body: "Dashboards, per-message event search, template storage, suppression, retries, sandboxes. SES gives you an API call and a firehose of events. Everything you would then build is what the difference pays for.",
  },
  {
    item: "Support with a human on it",
    body: "AWS support is a paid add-on and its first tier will not debug your deliverability. A transactional provider's support answers email questions specifically, because that is the only product they have.",
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
              Research
            </Badge>
            <h1 className="mb-4 max-w-3xl font-bold text-4xl tracking-tight md:text-5xl">
              Why transactional email providers{" "}
              <span className="text-primary">cost more than SES</span>
            </h1>
            <p className="max-w-2xl text-lg text-muted-foreground">
              The gap at 100,000 emails a month is roughly 3x to 13x. Here is
              what it actually buys, and when paying it is the right call.
            </p>
            <div className="mt-4 flex items-center gap-2 text-muted-foreground text-sm">
              <span>8 min read</span>
              <span>&bull;</span>
              <span>Wraps Team</span>
            </div>
          </div>
        </header>

        <main className="container mx-auto max-w-4xl space-y-16 px-4 py-16">
          <section>
            <p className="mb-6 text-lg text-muted-foreground">
              Sending 100,000 transactional emails through Amazon SES costs
              about $10. The same volume is $34.95 on SendGrid Essentials, $90
              on Resend Scale, and around $132 on Postmark Pro.
            </p>
            <p className="text-muted-foreground">
              That spread is not a markup on bandwidth. Sending an email is
              nearly free for everyone involved, SES included. The difference is
              paying somebody to have already solved a specific set of problems,
              and the useful question is which of those problems you actually
              have.
            </p>
          </section>

          <section>
            <h2 className="mb-6 font-bold text-2xl">
              The spread at 100K/month
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-border border-b">
                    <th className="py-3 pr-4 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                      Provider
                    </th>
                    <th className="py-3 pr-4 text-right font-medium text-muted-foreground text-xs uppercase tracking-wide">
                      Monthly
                    </th>
                    <th className="py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                      What that is
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {PRICES.map((row) => (
                    <tr
                      className="border-border/60 border-b align-top"
                      key={row.provider}
                    >
                      <th className="py-3 pr-4 font-medium text-sm" scope="row">
                        {row.provider}
                      </th>
                      <td className="py-3 pr-4 text-right font-mono tabular-nums">
                        {row.monthly}
                      </td>
                      <td className="py-3 text-muted-foreground">{row.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-muted-foreground text-sm">
              List prices as published, September 2026. Every one of these
              changes; check before quoting them back at anyone.
            </p>
          </section>

          <section>
            <h2 className="mb-6 font-bold text-2xl">
              What the difference buys
            </h2>
            <div className="grid gap-6">
              {BUYS.map((b) => (
                <div className="border-primary/40 border-l-2 pl-5" key={b.item}>
                  <h3 className="mb-2 font-medium text-lg tracking-tight">
                    {b.item}
                  </h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {b.body}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-4 font-bold text-2xl">
              The comparison is not $10 against $90
            </h2>
            <p className="mb-4 text-muted-foreground">
              This is where the SES argument usually cheats. The $10 buys an API
              that accepts messages and emits events. It does not buy the queue
              that absorbs a retry storm, the consumer that writes delivery
              history somewhere you can query it, the suppression enforcement,
              or the dashboard someone in support opens when a customer says the
              invoice never arrived.
            </p>
            <p className="mb-4 text-muted-foreground">
              Build those and the AWS bill grows by a few dollars for Lambda,
              SQS, EventBridge and DynamoDB, which is a rounding error. The
              engineering does not. A first pass is usually a couple of weeks,
              and it is never finished, because bounce classification and
              reputation monitoring are the sort of thing you improve after
              every incident.
            </p>
            <p className="text-muted-foreground">
              So the honest framing is not cheap versus expensive. It is whether
              you want to own that surface. A team with no AWS practice and no
              appetite for one should pay SendGrid and stop reading here — that
              is a real answer and it is right for a lot of companies.
            </p>
          </section>

          <section>
            <h2 className="mb-4 font-bold text-2xl">
              When the markup stops making sense
            </h2>
            <ul className="grid gap-3 text-muted-foreground">
              <li>
                <span className="font-medium text-foreground">
                  You already run on AWS.
                </span>{" "}
                The account, the IAM discipline, and the on-call rotation exist.
                The marginal cost of one more serverless pipeline is much lower
                for you than for a team starting from nothing.
              </li>
              <li>
                <span className="font-medium text-foreground">
                  Volume is climbing.
                </span>{" "}
                Provider pricing is per-email and SES is too, but the multiple
                is what compounds. At 5 million a month the same spread is
                thousands of dollars against a few hundred.
              </li>
              <li>
                <span className="font-medium text-foreground">
                  You need the data to stay put.
                </span>{" "}
                Message content and delivery events living in your own account
                is a different compliance conversation from a vendor&apos;s
                retention policy.
              </li>
              <li>
                <span className="font-medium text-foreground">
                  You want the reputation to be yours.
                </span>{" "}
                On a shared pool a neighbour&apos;s bad week is your problem. On
                your own SES account there are no neighbours, which cuts both
                ways.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-4 font-bold text-2xl">Where Wraps sits</h2>
            <p className="mb-4 text-muted-foreground">
              We build the third option, so weigh this accordingly: the
              infrastructure deploys into your AWS account, AWS bills you for
              sending at its own rate, and we charge a flat monthly platform fee
              that does not move with volume. You get the product surface
              without the per-email markup, and you inherit the parts a provider
              was absorbing for you.
            </p>
            <p className="text-muted-foreground">
              Those parts are real. Your SES account starts in the sandbox, your
              reputation starts at zero, and nobody at AWS is going to warm a
              domain for you. If what you were paying SendGrid for was somebody
              else owning deliverability, moving to any bring-your-own-cloud
              option means taking that back.
            </p>
          </section>

          <section className="rounded-2xl border bg-muted/30 p-8">
            <h2 className="mb-3 font-bold text-2xl">Run your own numbers</h2>
            <p className="mb-6 text-muted-foreground">
              The calculator prices SES and the supporting AWS services at your
              volume. The SES comparison covers the build-versus-buy side in
              more detail.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/tools/ses-calculator">
                  SES cost calculator
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/compare/amazon-ses-vs-wraps">
                  Amazon SES vs Wraps
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
