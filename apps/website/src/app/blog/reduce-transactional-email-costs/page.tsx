import { Card } from "@wraps/ui/components/ui/card";
import {
  AlertTriangle,
  ChevronRight,
  Globe,
  Paperclip,
  Receipt,
  Scissors,
  Server,
  TrendingDown,
} from "lucide-react";
import type { Metadata } from "next";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { JsonLd } from "@/components/json-ld";
import { CodeBlock } from "./page-content";

const DESCRIPTION =
  "At 100,000 transactional emails a month, sending costs $10 on AWS SES à la carte. One dedicated IP costs $24.95. A 2 MB attachment on every message costs $24. The per-email rate is the small number — here is the order to actually attack the bill in.";

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "How to Reduce Transactional Email Costs Above 100K a Month",
  description: DESCRIPTION,
  datePublished: "2026-08-21T00:00:00.000Z",
  dateModified: "2026-08-21T00:00:00.000Z",
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
    logo: {
      "@type": "ImageObject",
      url: "https://wraps.dev/logo.png",
    },
  },
  mainEntityOfPage: {
    "@type": "WebPage",
    "@id": "https://wraps.dev/blog/reduce-transactional-email-costs",
  },
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "How much does it cost to send 100,000 transactional emails per month?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "On Amazon SES à la carte pricing, 100,000 emails cost $10.00 per month. On the Essentials plan that AWS now assigns to new accounts by default, the same volume costs $16.00. On SES Pro it costs $127.00 and on SES Enterprise $523.00, because those plans carry monthly fees of $105 and $500 per account per Region. Managed providers at the same volume range from roughly $35 to $177 per month depending on plan.",
      },
    },
    {
      "@type": "Question",
      name: "What is the cheapest way to send 100,000 transactional emails a month?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Amazon SES on à la carte pricing, at $0.10 per 1,000 emails. À la carte has no volume bands and no monthly fee, and its rate is lower than the best band of every SES subscription plan, so it is the cheapest way to buy raw sending at any volume. The full bill including an event pipeline built on EventBridge, SQS, Lambda and DynamoDB comes to about $12.50 a month at 100,000 emails, or $0.125 per 1,000 all in.",
      },
    },
    {
      "@type": "Question",
      name: "Should I buy a dedicated IP at 100,000 emails per month?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Usually not. 100,000 emails a month is roughly 3,300 a day, which is thin volume for holding a dedicated IP's reputation warm. A standard SES dedicated IP costs $24.95 a month, which is 2.5 times the $10 you spend on sending at that volume — it takes your effective rate from $0.10 to $0.35 per 1,000. Dedicated IP guidance is generally about volume per day, and a monthly figure is frequently substituted for it.",
      },
    },
    {
      "@type": "Question",
      name: "Does sending fewer emails meaningfully reduce costs at 100K a month?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "It depends entirely on your marginal per-email rate. Cutting 30,000 emails a month saves $3.00 on SES à la carte and $4.80 on SES Essentials — not worth an engineering sprint. The same 30,000 emails saves $54.00 a month on Postmark's Basic overage rate of $1.80 per 1,000 and $39.00 on Mailgun's Foundation overage rate. Multiply the emails you would delete by your own overage rate before scoping the work.",
      },
    },
    {
      "@type": "Question",
      name: "Is it worth self-hosting SMTP to save money at 100K emails a month?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No. Sending 100,000 emails on SES costs $10 a month, so there is no sending cost left to recover. Self-hosting replaces a $10 line item with IP warming, bounce and complaint processing, DKIM/SPF/DMARC operations, queueing, retry logic, blacklist monitoring and deliverability troubleshooting — all of which cost engineering time worth far more than $10 a month.",
      },
    },
  ],
};

const SES_AT_100K = [
  {
    mode: "À la carte",
    fee: "$0",
    rate: "$0.10 / 1,000",
    total: "$10.00",
    note: "No bands, no fee. Cheapest raw sending at any volume.",
  },
  {
    mode: "Essentials",
    fee: "$0",
    rate: "$0.16 / 1,000",
    total: "$16.00",
    note: "AWS assigns this to new accounts and dormant Regions by default.",
  },
  {
    mode: "Pro",
    fee: "$105 / mo",
    rate: "$0.22 / 1,000",
    total: "$127.00",
    note: "Fee is per account, per Region. Bundles a managed dedicated IP.",
  },
  {
    mode: "Enterprise",
    fee: "$500 / mo",
    rate: "$0.23 / 1,000",
    total: "$523.00",
    note: "Multi-Region, tenants, 5 domains, 12 dedicated IPs.",
  },
];

const FULL_BILL = [
  {
    line: "SES sending",
    cost: "$10.00",
    detail: "100,000 emails × $0.10 / 1,000, à la carte",
  },
  {
    line: "EventBridge",
    cost: "$0.80",
    detail: "800,000 events at 8 event types per email",
  },
  {
    line: "SQS",
    cost: "$0.70",
    detail: "2.4M requests, after the 1M free tier",
  },
  {
    line: "Lambda",
    cost: "$0.00",
    detail: "Inside the free tier at 512 MB and 100ms average",
  },
  {
    line: "DynamoDB",
    cost: "$1.00",
    detail: "800,000 writes plus 4.6 GB at steady state, 90-day retention",
  },
];

const PROVIDERS_AT_100K = [
  { provider: "AWS SES, à la carte", plan: "Pay per email", monthly: "$10.00" },
  {
    provider: "AWS SES, Essentials",
    plan: "AWS default for new accounts",
    monthly: "$16.00",
  },
  { provider: "SendGrid", plan: "Essentials", monthly: "$34.95" },
  { provider: "Resend", plan: "Pro", monthly: "$35.00" },
  { provider: "Mailgun", plan: "Foundation", monthly: "$75.00" },
  { provider: "SendGrid", plan: "Pro", monthly: "$89.95" },
  { provider: "Mailgun", plan: "Scale", monthly: "$90.00" },
  {
    provider: "Postmark",
    plan: "Platform, $18 + 90K × $1.20",
    monthly: "$126.00",
  },
  {
    provider: "Postmark",
    plan: "Pro, $16.50 + 90K × $1.30",
    monthly: "$133.50",
  },
  {
    provider: "Postmark",
    plan: "Basic, $15 + 90K × $1.80",
    monthly: "$177.00",
  },
];

const SES_CURVE = [
  { volume: "100K", alacarte: "$10", essentials: "$16", pro: "$127" },
  { volume: "500K", alacarte: "$50", essentials: "$80", pro: "$215" },
  { volume: "1M", alacarte: "$100", essentials: "$160", pro: "$325" },
  { volume: "5M", alacarte: "$500", essentials: "$800", pro: "$1,205" },
];

const DELETION_VALUE = [
  { where: "AWS SES, à la carte", rate: "$0.10 / 1,000", saved: "$3.00" },
  { where: "AWS SES, Essentials", rate: "$0.16 / 1,000", saved: "$4.80" },
  {
    where: "Resend, pay-as-you-go",
    rate: "$0.65–0.90 / 1,000",
    saved: "$19.50–27.00",
  },
  {
    where: "Postmark Platform overage",
    rate: "$1.20 / 1,000",
    saved: "$36.00",
  },
  {
    where: "Mailgun Foundation overage",
    rate: "$1.30 / 1,000",
    saved: "$39.00",
  },
  { where: "Postmark Basic overage", rate: "$1.80 / 1,000", saved: "$54.00" },
];

export const metadata: Metadata = {
  title: "How to Reduce Transactional Email Costs Above 100K a Month",
  description: DESCRIPTION,
  keywords: [
    "reduce transactional email costs",
    "transactional email pricing 100k",
    "cheapest transactional email provider",
    "AWS SES cost 100000 emails",
    "SES vs SendGrid vs Postmark pricing",
  ],
  openGraph: {
    title: "How to Reduce Transactional Email Costs Above 100K a Month",
    description: DESCRIPTION,
    type: "article",
    url: "https://wraps.dev/blog/reduce-transactional-email-costs",
    publishedTime: "2026-08-21T00:00:00.000Z",
  },
  twitter: {
    card: "summary_large_image",
    title: "Reducing Transactional Email Costs Above 100K a Month | Wraps",
    description: DESCRIPTION,
  },
  alternates: {
    canonical: "https://wraps.dev/blog/reduce-transactional-email-costs",
  },
};

export default function Page() {
  return (
    <>
      <JsonLd data={articleSchema} />
      <JsonLd data={faqSchema} />
      <div className="min-h-screen bg-background text-foreground">
        <LandingNavbar />

        {/* Hero */}
        <header className="relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-900/20 via-transparent to-transparent" />

          <div className="relative mx-auto max-w-4xl px-6 pt-20 pb-16">
            <div className="mb-4 flex items-center gap-2 font-medium text-emerald-600 text-sm dark:text-emerald-400">
              <Receipt size={16} />
              <span>Research</span>
              <span className="text-muted-foreground/50">&bull;</span>
              <span className="text-muted-foreground">11 min read</span>
              <span className="text-muted-foreground/50">&bull;</span>
              <span className="text-muted-foreground">Wraps Team</span>
              <span className="text-muted-foreground/50">&bull;</span>
              <span className="text-muted-foreground">August 21, 2026</span>
            </div>

            <h1 className="mb-6 font-bold text-4xl leading-tight md:text-5xl lg:text-6xl">
              At 100K Emails a Month,
              <span className="block bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent dark:from-emerald-400 dark:to-teal-400">
                the Send Rate Is the Small Number
              </span>
            </h1>

            <p className="max-w-2xl text-muted-foreground text-xl leading-relaxed">
              Sending 100,000 transactional emails on Amazon SES costs $10 a
              month. One dedicated IP costs $24.95. A 2 MB attachment on every
              message costs $24. The SES Pro plan costs $127. Almost every line
              item around your sending is larger than your sending &mdash; which
              means the standard advice to "send fewer emails" is aimed at the
              wrong number.
            </p>

            <div className="mt-8 flex flex-wrap gap-4">
              <div className="flex items-center gap-2 rounded-full border bg-muted/30 px-4 py-2">
                <TrendingDown
                  className="text-emerald-600 dark:text-emerald-400"
                  size={16}
                />
                <span className="text-foreground/80 text-sm">
                  $12.50/mo all-in at 100K
                </span>
              </div>
              <div className="flex items-center gap-2 rounded-full border bg-muted/30 px-4 py-2">
                <AlertTriangle
                  className="text-emerald-600 dark:text-emerald-400"
                  size={16}
                />
                <span className="text-foreground/80 text-sm">
                  You may be on a plan you never chose
                </span>
              </div>
              <div className="flex items-center gap-2 rounded-full border bg-muted/30 px-4 py-2">
                <Scissors
                  className="text-emerald-600 dark:text-emerald-400"
                  size={16}
                />
                <span className="text-foreground/80 text-sm">
                  Cutting 30K sends saves $3.00
                </span>
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-4xl space-y-16 px-6 py-16">
          {/* Short answer */}
          <section>
            <h2 className="mb-6 font-bold text-3xl">The short answer</h2>

            <Card className="mb-6 border-emerald-600/30 p-6 dark:border-emerald-400/30">
              <ol className="space-y-3 text-foreground/80 leading-relaxed">
                <li>
                  <strong>1.</strong> Check which SES pricing plan each account
                  and each Region is on. AWS now defaults new and dormant ones
                  to Essentials at $0.16 per 1,000 instead of the $0.10 à la
                  carte rate, and nothing on your bill announces it.
                </li>
                <li>
                  <strong>2.</strong> Find the fixed and per-gigabyte line items
                  that are larger than your sending: dedicated IPs, attachment
                  data, plan fees that multiply per Region.
                </li>
                <li>
                  <strong>3.</strong> Price a move off a managed provider
                  honestly. At 100K the saving is $25&ndash;$167 a month. The
                  reason to move is the shape of the curve above 1M, not the
                  number at 100K.
                </li>
                <li>
                  <strong>4.</strong> Only then reduce volume &mdash; and only
                  after multiplying the emails you would delete by your actual
                  marginal rate. On SES that number is usually too small to fund
                  the work.
                </li>
              </ol>
            </Card>

            <p className="text-foreground/80 text-lg leading-relaxed">
              Every figure in this post is either taken from a published pricing
              page or computed from published rates, and the arithmetic is shown
              so you can check it. AWS rates were verified against the SES
              pricing page in August 2026. Competitor pricing was verified
              against live pricing pages on July 13, 2026.
            </p>
          </section>

          {/* What 100K costs */}
          <section>
            <h2 className="mb-6 flex items-center gap-3 font-bold text-3xl">
              <Receipt className="text-emerald-600 dark:text-emerald-400" />
              What 100,000 emails actually costs
            </h2>

            <p className="mb-6 text-foreground/80 text-lg leading-relaxed">
              Amazon SES has four billing modes since July 2026. Here is each
              one priced at exactly 100,000 emails a month. Monthly fees are
              charged per account, <em>per Region</em>.
            </p>

            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="border-b bg-muted/40">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-foreground">
                      Mode
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-foreground">
                      Monthly fee
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-foreground">
                      Rate
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-foreground">
                      100K / mo
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-foreground">
                      Notes
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {SES_AT_100K.map((row) => (
                    <tr className="hover:bg-muted/20" key={row.mode}>
                      <td className="px-4 py-3 font-medium text-foreground">
                        {row.mode}
                      </td>
                      <td className="px-4 py-3 font-mono text-muted-foreground text-xs">
                        {row.fee}
                      </td>
                      <td className="px-4 py-3 font-mono text-muted-foreground text-xs">
                        {row.rate}
                      </td>
                      <td className="px-4 py-3 font-mono font-semibold text-foreground text-xs">
                        {row.total}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {row.note}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-6 mb-4 text-foreground/80 text-lg leading-relaxed">
              One conclusion falls straight out of that table and holds at every
              volume:{" "}
              <strong>
                à la carte is always the cheapest way to buy raw sending.
              </strong>{" "}
              Its $0.10 rate is lower than the best marginal band any
              subscription plan reaches &mdash; Essentials bottoms out at $0.11
              above 100M, Pro at $0.12 &mdash; and it carries no monthly fee.
              There is no crossover point. If all you want is delivery, no SES
              plan ever beats à la carte on price.
            </p>

            <p className="text-foreground/80 text-lg leading-relaxed">
              That does not make the plans a trap. They bundle real products
              with real standalone prices &mdash; Essentials includes Virtual
              Deliverability Manager, which AWS otherwise sells at $1,250 a
              month for the global tier. At 100K a month, Essentials costs you
              $6 more than à la carte. If you use VDM, that is the cheapest VDM
              will ever be. If you don't, you are paying a 60% premium on
              sending for a dashboard you never open.
            </p>
          </section>

          {/* The full bill */}
          <section>
            <h2 className="mb-6 font-bold text-3xl">
              The rest of the bill, in full
            </h2>

            <p className="mb-6 text-foreground/80 text-lg leading-relaxed">
              "SES is $10" is true and incomplete. SES delivers email; it does
              not store your event history, and every open, click, bounce,
              complaint and delivery has to land somewhere. Here is the whole
              monthly bill for 100,000 emails through a standard SES event
              pipeline &mdash; EventBridge to SQS to Lambda to DynamoDB &mdash;
              in us-east-1, at 8 event types per email and 90-day retention.
            </p>

            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[620px] text-sm">
                <thead className="border-b bg-muted/40">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-foreground">
                      Line item
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-foreground">
                      Monthly
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-foreground">
                      Basis
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {FULL_BILL.map((row) => (
                    <tr className="hover:bg-muted/20" key={row.line}>
                      <td className="px-4 py-3 font-medium text-foreground">
                        {row.line}
                      </td>
                      <td className="px-4 py-3 font-mono text-muted-foreground text-xs">
                        {row.cost}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {row.detail}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-muted/30 font-semibold">
                    <td className="px-4 py-3 text-foreground">Total</td>
                    <td className="px-4 py-3 font-mono text-foreground text-xs">
                      $12.50
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      $0.125 per 1,000, all in
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p className="mt-6 text-foreground/80 text-lg leading-relaxed">
              $2.50 of infrastructure on top of $10 of sending. That is the real
              floor for a 100K-a-month transactional sender with full event
              history in their own account. Hold that number in mind, because
              every optimization below gets measured against it.
            </p>
          </section>

          {/* Step 1 */}
          <section>
            <h2 className="mb-6 flex items-center gap-3 font-bold text-3xl">
              <Globe className="text-emerald-600 dark:text-emerald-400" />
              Step 1: Find out which plan you're on
            </h2>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              On July 21, 2026 AWS started assigning the Essentials plan to
              every new SES account, and to every account-and-Region pair with
              no metered SES activity since June 1, 2025. Accounts that were
              actively sending were not repriced. The unit is not "account" — it
              is <strong>account &times; Region</strong>.
            </p>

            <p className="mb-6 text-foreground/80 text-lg leading-relaxed">
              So the answer to "which plan am I on" is not one answer. It is one
              answer per Region, and the Regions most likely to be sitting on
              Essentials are exactly the ones nobody audits: the staging
              account, the second Region you expanded into last quarter, the
              disaster-recovery Region you provisioned and never used. At 100K a
              month the difference is $6. At 1M it is $60. It compounds silently
              and it never shows up on your bill as anything other than a
              slightly larger number.
            </p>

            <CodeBlock
              code={`# Read the plan for every Region you send from, and model
# your real volume against all four billing modes
wraps email plan

# Model a specific volume
wraps email plan --volume 100000

# Move a Region back to à la carte
wraps email plan --region us-east-1 --set alacarte`}
              title="terminal"
            />

            <p className="mt-4 text-foreground/80 text-lg leading-relaxed">
              If you'd rather do it by hand, the plan is readable through the
              SES{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
                GetAccount
              </code>{" "}
              API and writable through{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
                PutAccountPricingAttributes
              </code>
              , once per Region. One detail is worth knowing before you plan a
              migration window: an account that AWS <em>defaulted</em> onto
              Essentials can cancel back to à la carte with immediate effect.
              Every other downgrade waits for the next billing cycle.
            </p>
          </section>

          {/* Step 2 */}
          <section>
            <h2 className="mb-6 flex items-center gap-3 font-bold text-3xl">
              <Paperclip className="text-emerald-600 dark:text-emerald-400" />
              Step 2: Find what costs more than your sending
            </h2>

            <p className="mb-6 text-foreground/80 text-lg leading-relaxed">
              At $10 of sending, the bar for "this line item dwarfs my sending"
              is very low. Four things routinely clear it.
            </p>

            <div className="space-y-4">
              <div className="rounded-lg border p-5">
                <h3 className="mb-2 font-medium text-lg">
                  A dedicated IP you probably shouldn't own &mdash; $24.95/mo
                </h3>
                <p className="mb-3 text-foreground/80 leading-relaxed">
                  A standard SES dedicated IP is $24.95 a month. That is{" "}
                  <strong>2.5&times; your entire sending bill</strong> at 100K,
                  and it takes your effective rate from $0.10 to $0.35 per
                  1,000. Managed dedicated IPs are structured differently
                  &mdash; $15 a month per account plus $0.02&ndash;0.08 per
                  1,000 — but the shape of the problem is identical.
                </p>
                <p className="text-foreground/80 leading-relaxed">
                  The deeper issue is that 100,000 a month is about{" "}
                  <strong>3,300 a day</strong>, and dedicated IP reputation is
                  built and held by consistent daily volume. Thin, spiky volume
                  on a dedicated IP is a deliverability liability rather than an
                  asset, because you own a reputation you don't send enough to
                  maintain. Guidance phrased as "100K+" is generally about
                  volume per day; a monthly figure gets substituted for it
                  surprisingly often. Check which unit you are reading before
                  you buy.
                </p>
              </div>

              <div className="rounded-lg border p-5">
                <h3 className="mb-2 font-medium text-lg">
                  Attachments &mdash; $0.12 per GB
                </h3>
                <p className="text-foreground/80 leading-relaxed">
                  SES bills attachment data separately at $0.12 per GB. A 2 MB
                  PDF on every one of 100,000 messages is roughly 200 GB, which
                  is{" "}
                  <strong>
                    $24 a month &mdash; 2.4&times; what you paid to send the
                    emails themselves
                  </strong>
                  . Replacing the attachment with a signed download URL takes
                  that line to zero, shrinks your messages, and removes the
                  single most common reason a transactional message gets held at
                  a gateway. This is the highest-ratio change available to most
                  senders at this volume and it is usually a one-day job.
                </p>
              </div>

              <div className="rounded-lg border p-5">
                <h3 className="mb-2 font-medium text-lg">
                  Plan fees, multiplied by Region &mdash; $105 to $2,000/mo
                </h3>
                <p className="text-foreground/80 leading-relaxed">
                  SES Pro is $105 per month <em>per account, per Region</em>.
                  Across four Regions that is $420 a month before a single email
                  is sent &mdash; 42&times; your sending cost. Enterprise across
                  four Regions is $2,000. If you subscribed a Region for a
                  feature you use in one place, check whether the subscription
                  quietly followed you into the others.
                </p>
              </div>

              <div className="rounded-lg border p-5">
                <h3 className="mb-2 font-medium text-lg">
                  Retention you never chose
                </h3>
                <p className="text-foreground/80 leading-relaxed">
                  Event storage is small at this volume &mdash; 4.6 GB and $1.00
                  a month at 90 days &mdash; but it is the one line that grows
                  without anyone deciding it should. Indefinite retention at
                  100K a month is roughly 24&times; a month's data before it
                  stabilizes. Set a TTL deliberately. $1.00 is not worth
                  optimizing; an unbounded table at 1M a month is.
                </p>
              </div>
            </div>
          </section>

          {/* Step 3 */}
          <section>
            <h2 className="mb-6 font-bold text-3xl">
              Step 3: Price the switch honestly
            </h2>

            <p className="mb-6 text-foreground/80 text-lg leading-relaxed">
              Here is 100,000 emails a month across the providers most
              transactional senders are actually choosing between, computed from
              published plan prices and overage rates as verified on July 13,
              2026.
            </p>

            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[600px] text-sm">
                <thead className="border-b bg-muted/40">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-foreground">
                      Provider
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-foreground">
                      Plan
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-foreground">
                      100K / mo
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {PROVIDERS_AT_100K.map((row) => (
                    <tr
                      className="hover:bg-muted/20"
                      key={`${row.provider}-${row.plan}`}
                    >
                      <td className="px-4 py-3 font-medium text-foreground">
                        {row.provider}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {row.plan}
                      </td>
                      <td className="px-4 py-3 font-mono font-semibold text-foreground text-xs">
                        {row.monthly}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-6 mb-4 text-foreground/80 text-lg leading-relaxed">
              Two things are worth pulling out of that table. First, the spread
              between the cheapest and most expensive way to send the same
              100,000 emails is <strong>17&times;</strong>, and nothing about
              the messages changed.
            </p>

            <p className="mb-6 text-foreground/80 text-lg leading-relaxed">
              Second, look at the three Postmark rows. At exactly this volume
              their <em>most expensive</em> base plan is the cheapest total:
              Platform at $18 a month with a $1.20 overage comes to $126, while
              Basic at $15 a month with a $1.80 overage comes to $177. Buying
              the higher plan saves $51 a month. That inversion is a general
              property of include-plus-overage pricing, not a Postmark quirk
              &mdash; if your provider prices that way, recompute your own tier
              at your own volume before you assume you're on the right one.
            </p>

            <p className="mb-6 text-foreground/80 text-lg leading-relaxed">
              But at 100K a month, moving to SES saves $25 to $167. That is real
              money and it is not, on its own, a good reason to migrate email
              infrastructure. The actual reason is the shape of the curve:
            </p>

            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="border-b bg-muted/40">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-foreground">
                      Volume / mo
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-foreground">
                      À la carte
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-foreground">
                      Essentials
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-foreground">
                      Pro
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {SES_CURVE.map((row) => (
                    <tr className="hover:bg-muted/20" key={row.volume}>
                      <td className="px-4 py-3 font-medium text-foreground">
                        {row.volume}
                      </td>
                      <td className="px-4 py-3 font-mono text-muted-foreground text-xs">
                        {row.alacarte}
                      </td>
                      <td className="px-4 py-3 font-mono text-muted-foreground text-xs">
                        {row.essentials}
                      </td>
                      <td className="px-4 py-3 font-mono text-muted-foreground text-xs">
                        {row.pro}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-6 text-foreground/80 text-lg leading-relaxed">
              À la carte is a straight line at $0.10 per 1,000 forever. Managed
              providers price in tiers with step changes, and the steps get
              steeper. If 100K a month is where you are today and 1M is where
              you'll be in eighteen months, migrate for the 1M number, not the
              100K one &mdash; and migrate while the volume is small enough that
              warming and cutover are easy.
            </p>
          </section>

          {/* The standard advice */}
          <section>
            <h2 className="mb-6 flex items-center gap-3 font-bold text-3xl">
              <Scissors className="text-emerald-600 dark:text-emerald-400" />
              The standard advice, priced out
            </h2>

            <p className="mb-6 text-foreground/80 text-lg leading-relaxed">
              Search this question and you'll get the same four suggestions
              everywhere. Three of them are good advice for reasons that have
              nothing to do with cost, and it's worth being precise about which
              is which.
            </p>

            <h3 className="mb-3 font-semibold text-xl">
              "Reduce the number of emails you send"
            </h3>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              This is routinely called the highest-ROI optimization. The value
              of deleting an email is exactly your marginal per-email rate, so
              here is what cutting 30,000 emails a month &mdash; a 30%
              reduction, which is an ambitious engineering project &mdash; is
              worth in each place you might be sending from:
            </p>

            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="border-b bg-muted/40">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-foreground">
                      Where you send
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-foreground">
                      Marginal rate
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-foreground">
                      30K fewer / mo
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {DELETION_VALUE.map((row) => (
                    <tr className="hover:bg-muted/20" key={row.where}>
                      <td className="px-4 py-3 font-medium text-foreground">
                        {row.where}
                      </td>
                      <td className="px-4 py-3 font-mono text-muted-foreground text-xs">
                        {row.rate}
                      </td>
                      <td className="px-4 py-3 font-mono font-semibold text-foreground text-xs">
                        {row.saved}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-6 mb-6 text-foreground/80 text-lg leading-relaxed">
              An 18&times; spread on identical work. On SES à la carte, deleting
              nearly a third of your email volume saves $3.00 a month &mdash;
              you cannot fund a sprint with that. On Postmark's Basic overage it
              saves $54.00 a month, and the same sprint pays for itself.{" "}
              <strong>Multiply before you scope.</strong> And if you find
              duplicate sends, race conditions firing two password resets, or a
              retry loop with no ceiling, fix them anyway &mdash; those are bugs
              your users can see, which is a much better reason than $3.
            </p>

            <h3 className="mb-3 font-semibold text-xl">
              "Suppress bounces and complaints immediately"
            </h3>

            <p className="mb-6 text-foreground/80 text-lg leading-relaxed">
              Do this, but not to save money. A 3% hard bounce rate on 100,000
              sends is 3,000 wasted emails, worth <strong>$0.30 a month</strong>
              . The reason to run a tight suppression list is that bounce and
              complaint rates are what get your sending paused, and a paused
              account costs you every email, not 3% of them. AWS maintains an
              account-level suppression list at no charge and it is on by
              default &mdash; the work is making sure your own retry logic
              respects it rather than reintroducing addresses it already
              dropped.
            </p>

            <h3 className="mb-3 font-semibold text-xl">
              "Separate transactional from marketing"
            </h3>

            <p className="mb-6 text-foreground/80 text-lg leading-relaxed">
              Correct, and also not a cost measure &mdash; it's a reputation
              measure. Poor engagement on marketing sends drags the reputation
              that your password resets depend on. On SES the mechanism is
              configuration sets and, if volume justifies it, separate
              subdomains. The cost impact is indirect but large: it is the
              difference between your receipts landing in the inbox and landing
              in spam.
            </p>

            <h3 className="mb-3 font-semibold text-xl">
              "Don't self-host SMTP"
            </h3>

            <p className="text-foreground/80 text-lg leading-relaxed">
              Right, and the arithmetic is blunter than the usual framing. At
              100K a month there is no sending cost left to recover &mdash; the
              entire prize is $10. What you would take on to win it is IP
              warming, bounce and complaint processing, DKIM, SPF and DMARC
              operations, queueing, retry policy, blacklist monitoring and
              deliverability triage. That is not a $10-a-month problem at any
              company.
            </p>
          </section>

          {/* Order */}
          <section>
            <h2 className="mb-6 flex items-center gap-3 font-bold text-3xl">
              <Server className="text-emerald-600 dark:text-emerald-400" />
              The order to do this in
            </h2>

            <div className="space-y-4">
              <div className="rounded-lg border p-5">
                <h3 className="mb-1 font-medium">
                  1. Audit your SES plan per Region &mdash; 10 minutes
                </h3>
                <p className="text-foreground/80 leading-relaxed">
                  One reading per Region. A defaulted account can leave
                  Essentials immediately. Worth $6/mo at 100K, $60/mo at 1M, and
                  it is the only item on this list that is silently wrong by
                  default.
                </p>
              </div>
              <div className="rounded-lg border p-5">
                <h3 className="mb-1 font-medium">
                  2. Kill the fixed line items &mdash; an afternoon
                </h3>
                <p className="text-foreground/80 leading-relaxed">
                  Dedicated IPs you don't have the daily volume to justify. Plan
                  subscriptions in Regions that don't use the feature. These are
                  the largest single numbers on the bill at this volume.
                </p>
              </div>
              <div className="rounded-lg border p-5">
                <h3 className="mb-1 font-medium">
                  3. Move attachments to signed URLs &mdash; a day
                </h3>
                <p className="text-foreground/80 leading-relaxed">
                  $0.12 per GB stops. Messages get smaller, gateways get
                  happier. Best ratio of saving to effort available at 100K.
                </p>
              </div>
              <div className="rounded-lg border p-5">
                <h3 className="mb-1 font-medium">
                  4. Recompute your provider tier at your real volume
                </h3>
                <p className="text-foreground/80 leading-relaxed">
                  Include-plus-overage pricing regularly makes a more expensive
                  base plan the cheaper total. Do the multiplication rather than
                  assuming the entry tier is the frugal choice.
                </p>
              </div>
              <div className="rounded-lg border p-5">
                <h3 className="mb-1 font-medium">
                  5. Reduce volume last, and only if the rate justifies it
                </h3>
                <p className="text-foreground/80 leading-relaxed">
                  Multiply emails removed by marginal rate. If the answer is
                  under $10 a month, do the work for user-experience reasons or
                  don't do it &mdash; but stop calling it a cost project.
                </p>
              </div>
            </div>
          </section>

          {/* What we charge */}
          <section>
            <h2 className="mb-6 font-bold text-3xl">
              What this costs with Wraps in it
            </h2>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              It would be a strange post to argue that hidden line items are the
              problem and then hide ours. Wraps deploys the SES pipeline priced
              above into your AWS account &mdash; the $12.50 lands on your bill,
              from AWS, with no markup from us. What we charge for is the
              platform on top: the dashboard, templates, workflows, broadcasts
              and segments.
            </p>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              The Free tier includes the CLI and the TypeScript SDK with 5,000
              tracked events a month, so a 100K-a-month sender who wants
              infrastructure and nothing else pays us nothing. If you want the
              full send history in the dashboard, 100,000 emails generates
              enough tracked events to need Starter at $19 or Growth at $79,
              depending on how many event types you record.
            </p>

            <p className="text-foreground/80 text-lg leading-relaxed">
              Which means the honest full-stack number at 100K a month is $12.50
              to AWS plus $0&ndash;79 to us &mdash; and worth comparing against
              the $35&ndash;177 in the provider table, with the difference that
              the AWS half of it keeps costing $0.10 per 1,000 at 10M.
            </p>
          </section>

          {/* Continue reading */}
          <section className="space-y-4">
            <h2 className="font-bold text-2xl">Continue reading</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <a
                className="group rounded-xl border p-4 transition-colors hover:border-primary/50"
                href="/blog/ses-pricing-plans-2026"
              >
                <h3 className="font-semibold group-hover:text-primary">
                  AWS SES Pricing Plans: What Actually Changed
                </h3>
                <p className="text-muted-foreground text-sm">
                  The full detail on the four billing modes and the default
                </p>
              </a>
              <a
                className="group rounded-xl border p-4 transition-colors hover:border-primary/50"
                href="/tools/ses-calculator"
              >
                <h3 className="font-semibold group-hover:text-primary">
                  SES Cost Calculator
                </h3>
                <p className="text-muted-foreground text-sm">
                  Your volume, your plan, your Regions, priced line by line
                </p>
              </a>
              <a
                className="group rounded-xl border p-4 transition-colors hover:border-primary/50"
                href="/blog/ses-production-architecture"
              >
                <h3 className="font-semibold group-hover:text-primary">
                  SES Production Architecture
                </h3>
                <p className="text-muted-foreground text-sm">
                  The event pipeline the $12.50 above is paying for
                </p>
              </a>
              <a
                className="group rounded-xl border p-4 transition-colors hover:border-primary/50"
                href="/blog/aws-ses-simplified"
              >
                <h3 className="font-semibold group-hover:text-primary">
                  AWS SES, Simplified
                </h3>
                <p className="text-muted-foreground text-sm">
                  What SES gives you and what you still have to build
                </p>
              </a>
            </div>
          </section>

          {/* CTA */}
          <section className="relative">
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-r from-emerald-500/10 to-teal-500/10 blur-xl" />
            <Card className="relative p-8 text-center md:p-12">
              <h2 className="mb-4 font-bold text-3xl md:text-4xl">
                Price your own 100K
              </h2>
              <p className="mx-auto mb-8 max-w-lg text-muted-foreground">
                Put in your volume, your SES plan and your Regions, and get the
                whole bill line by line &mdash; sending, event pipeline,
                storage, all of it billed to your own AWS account.
              </p>
              <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
                <div className="rounded-xl border bg-muted/30 px-6 py-3 font-mono text-emerald-600 dark:text-emerald-400">
                  GET /api/pricing/estimate
                </div>
                <a
                  className="flex items-center gap-2 rounded-xl bg-emerald-500 px-6 py-3 font-semibold text-white transition-colors hover:bg-emerald-400"
                  href="/tools/ses-calculator"
                >
                  Open the Calculator
                  <ChevronRight size={18} />
                </a>
              </div>
            </Card>
          </section>
        </main>

        <LandingFooter />
      </div>
    </>
  );
}
