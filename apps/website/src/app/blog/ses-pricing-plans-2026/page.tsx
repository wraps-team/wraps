import { Card } from "@wraps/ui/components/ui/card";
import {
  AlertTriangle,
  Calculator,
  ChevronRight,
  Globe,
  Layers,
  Receipt,
  Terminal,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { JsonLd } from "@/components/json-ld";
import { CodeBlock } from "./page-content";

const DESCRIPTION =
  "On July 21, 2026 AWS added three subscription plans to Amazon SES and started every new account and Region on Essentials at $0.16 per 1,000 emails on the first 10M each month. À la carte is still $0.10 per 1,000, untiered. What changed, what didn't, and how to move back.";

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "AWS SES Pricing Plans: What Actually Changed",
  description: DESCRIPTION,
  datePublished: "2026-07-21T00:00:00.000Z",
  dateModified: "2026-07-21T00:00:00.000Z",
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
    "@id": "https://wraps.dev/blog/ses-pricing-plans-2026",
  },
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "Did AWS raise the price of Amazon SES?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Not for existing active senders. À la carte pricing is unchanged at $0.10 per 1,000 emails and accounts that sent or processed email since June 1, 2025 stay on it. What changed is the default: from July 21, 2026 new accounts, and account-and-Region combinations with no metered SES activity since June 1, 2025, start on the Essentials plan at $0.16 per 1,000 emails on the first 10 million each month.",
      },
    },
    {
      "@type": "Question",
      name: "Is the Amazon SES free tier gone?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The SES-specific free tier of 3,000 monthly email charges for 12 months is discontinued for new customers as of July 21, 2026. Existing free-tier users keep the benefit through their 12-month period. New AWS accounts instead receive a generic AWS Free Tier credit of up to $200 that applies across eligible AWS services rather than to SES specifically.",
      },
    },
    {
      "@type": "Question",
      name: "Can I switch an SES account back to à la carte pricing?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. AWS documents that upgrades take effect immediately, and that if you did not explicitly choose a plan and were defaulted to Essentials, your first downgrade or cancellation to à la carte pricing also takes effect immediately. All other downgrades or cancellations take effect at the start of your next billing cycle.",
      },
    },
    {
      "@type": "Question",
      name: "Are SES pricing plans set per account or per Region?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Both. AWS states that plans apply for each account and each AWS Region, so you manage your plan separately in every Region where you use Amazon SES. A single AWS account sending from four Regions has four independent plan selections and, for Pro and Enterprise, four monthly fees.",
      },
    },
  ],
};

export const metadata: Metadata = {
  title: "AWS SES Pricing Plans: What Actually Changed",
  description: DESCRIPTION,
  openGraph: {
    title: "AWS SES Pricing Plans: What Actually Changed | Wraps",
    description: DESCRIPTION,
    type: "article",
    url: "https://wraps.dev/blog/ses-pricing-plans-2026",
    publishedTime: "2026-07-21T00:00:00.000Z",
    authors: ["Wraps Team"],
  },
  twitter: {
    card: "summary_large_image",
    title: "AWS SES Pricing Plans: What Actually Changed | Wraps",
    description: DESCRIPTION,
  },
  alternates: {
    canonical: "https://wraps.dev/blog/ses-pricing-plans-2026",
  },
};

const PLAN_ROWS = [
  {
    plan: "À la carte",
    fee: "$0",
    tier1: "$0.10 / 1,000",
    tier2: "$0.10 / 1,000",
    tier3: "$0.10 / 1,000",
  },
  {
    plan: "Essentials",
    fee: "$0",
    tier1: "$0.16 / 1,000",
    tier2: "$0.14 / 1,000",
    tier3: "$0.11 / 1,000",
  },
  {
    plan: "Pro",
    fee: "$105 / mo",
    tier1: "$0.22 / 1,000",
    tier2: "$0.17 / 1,000",
    tier3: "$0.12 / 1,000",
  },
  {
    plan: "Enterprise",
    fee: "$500 / mo",
    tier1: "$0.23 / 1,000",
    tier2: "$0.18 / 1,000",
    tier3: "$0.13 / 1,000",
  },
];

const UNKNOWNS = [
  {
    title: "Whether the per-1,000 rates vary by Region",
    body: "The pricing page publishes one rate table and never says the rates are uniform across Regions. Absence of a statement is not a guarantee, so we are not making one. What AWS does say is that you select and are billed for a plan per Region — and that plans are available in every Region where SES operates except Middle East (UAE) and Middle East (Bahrain).",
  },
  {
    title: "How long the $200 credit lasts",
    body: "The SES pricing page describes the AWS Free Tier credit as valid for 12 months. The AWS blog post announcing the plans describes it as $200 over six months. The AWS Free Tier page describes $100 immediately plus up to $100 more, up to $200 over 6 months. Three AWS pages, three framings. We are not going to pick one for you — check the AWS Free Tier terms against your own account.",
  },
  {
    title: "What happens to dedicated IPs you already own",
    body: "None of the announcement, the pricing page, or the developer guide documents what happens to already-provisioned dedicated IPs when you move into or out of a plan that bundles managed ones. The only adjacent statement is that choosing a plan does not turn features on. Check the console before you change a plan on an account with dedicated IPs in production.",
  },
  {
    title: "The exact IAM action names",
    body: "We could not retrieve the SES entry in the AWS Service Authorization Reference to confirm the action strings behind the two pricing APIs, so this post does not print an IAM policy. If you are scoping a role for this, read the Service Authorization Reference for Amazon SES directly rather than trusting a policy snippet from a blog.",
  },
];

export default function Page() {
  return (
    <>
      <JsonLd data={articleSchema} />
      <JsonLd data={faqSchema} />
      <div className="min-h-screen bg-background text-foreground">
        <LandingNavbar />

        {/* Hero */}
        <header className="relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-orange-900/20 via-transparent to-transparent" />
          <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg width=%2260%22 height=%2260%22 viewBox=%220 0 60 60%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cg fill=%22none%22 fill-rule=%22evenodd%22%3E%3Cg fill=%22%239C92AC%22 fill-opacity=%220.03%22%3E%3Cpath d=%22M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z%22/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] opacity-50" />

          <div className="relative mx-auto max-w-4xl px-6 pt-20 pb-16">
            <div className="mb-4 flex items-center gap-2 font-medium text-orange-600 text-sm dark:text-orange-400">
              <Receipt size={16} />
              <span>Research</span>
              <span className="text-muted-foreground/50">&bull;</span>
              <span className="text-muted-foreground">12 min read</span>
              <span className="text-muted-foreground/50">&bull;</span>
              <span className="text-muted-foreground">Wraps Team</span>
              <span className="text-muted-foreground/50">&bull;</span>
              <span className="text-muted-foreground">July 21, 2026</span>
            </div>

            <h1 className="mb-6 font-bold text-4xl leading-tight md:text-5xl lg:text-6xl">
              AWS SES Now Has
              <span className="block bg-gradient-to-r from-orange-600 to-amber-600 bg-clip-text text-transparent dark:from-orange-400 dark:to-amber-400">
                Pricing Plans
              </span>
            </h1>

            <p className="max-w-2xl text-muted-foreground text-xl leading-relaxed">
              Three subscription plans landed today, the SES-specific free tier
              is closed to new customers, and every new account starts on
              Essentials at $0.16 per 1,000 emails on the first 10M each month
              &mdash; instead of the untiered à la carte rate of $0.10. Here is
              what changed, what didn't, and the one sentence in the docs that
              gets you back.
            </p>

            <div className="mt-8 flex flex-wrap gap-4">
              <div className="flex items-center gap-2 rounded-full border bg-muted/30 px-4 py-2">
                <Globe
                  className="text-orange-600 dark:text-orange-400"
                  size={16}
                />
                <span className="text-foreground/80 text-sm">
                  Set per account, per Region
                </span>
              </div>
              <div className="flex items-center gap-2 rounded-full border bg-muted/30 px-4 py-2">
                <Layers
                  className="text-orange-600 dark:text-orange-400"
                  size={16}
                />
                <span className="text-foreground/80 text-sm">
                  À la carte survives at $0.10/1K
                </span>
              </div>
              <div className="flex items-center gap-2 rounded-full border bg-muted/30 px-4 py-2">
                <Calculator
                  className="text-orange-600 dark:text-orange-400"
                  size={16}
                />
                <span className="text-foreground/80 text-sm">
                  Defaulted accounts can leave immediately
                </span>
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-4xl space-y-16 px-6 py-16">
          {/* Update note — this post's Wraps tier mentions describe the
              pre-2026-08 ladder. Do not rewrite the body; historical. */}
          <div className="rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-4 text-sm">
            <p className="text-foreground/90">
              <strong>Updated 2026-08:</strong> the Wraps "Growth" tier
              mentioned below is now called Business. Existing Growth
              subscriptions keep their $79/mo pricing for life. The AWS SES
              pricing details in this post are unaffected. See{" "}
              <Link className="underline" href="/platform#pricing">
                current Wraps plans
              </Link>
              .
            </p>
          </div>

          {/* What happened */}
          <section>
            <h2 className="mb-6 font-bold text-3xl">What AWS announced</h2>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              On July 21, 2026 AWS published pricing plans for Amazon SES: three
              subscription tiers named <strong>Essentials</strong>,{" "}
              <strong>Pro</strong>, and <strong>Enterprise</strong>, each
              containing everything in the one before it. The announcement went
              out on the AWS What's New feed and, in longer form, on the AWS
              Messaging &amp; Targeting blog under the byline of Advait Gomkale,
              Senior Product Manager for Amazon SES.
            </p>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              The plans are available in every Region where SES operates except
              Middle East (UAE) and Middle East (Bahrain). AWS frames them as a
              bundling exercise: subscribing costs{" "}
              <em>"up to 22% less than purchasing them individually"</em>{" "}
              &mdash; which is AWS's claim about a plan versus buying the same
              add-ons separately, not a claim that a plan is cheaper than plain
              pay-per-email sending.
            </p>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              Two things did not change and are easy to miss under the
              announcement. À la carte pricing still exists, still costs $0.10
              per 1,000 emails, and is still printed on the SES pricing page.
              And accounts that have been actively sending were not repriced.
            </p>

            <p className="text-foreground/80 text-lg leading-relaxed">
              What did change is the <em>default</em>. That is the whole story,
              and it is worth being precise about who it touches.
            </p>
          </section>

          {/* The table */}
          <section>
            <h2 className="mb-6 flex items-center gap-3 font-bold text-3xl">
              <Layers className="text-orange-600 dark:text-orange-400" />
              The four pricing modes
            </h2>

            <p className="mb-6 text-foreground/80 text-lg leading-relaxed">
              SES now has four ways to be billed for outbound sending. Monthly
              fees are charged per account, per Region. The per-email rates are{" "}
              <strong>marginal volume bands</strong>, not flat rates &mdash;
              each band applies only to the volume that falls inside it.
            </p>

            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[680px] text-sm">
                <thead className="border-b bg-muted/40">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-foreground">
                      Mode
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-foreground">
                      Monthly fee
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-foreground">
                      First 10M / mo
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-foreground">
                      10M &ndash; 100M / mo
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-foreground">
                      Above 100M / mo
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {PLAN_ROWS.map((row) => (
                    <tr className="hover:bg-muted/20" key={row.plan}>
                      <td className="px-4 py-3 font-medium text-foreground">
                        {row.plan}
                      </td>
                      <td className="px-4 py-3 font-mono text-muted-foreground text-xs">
                        {row.fee}
                      </td>
                      <td className="px-4 py-3 font-mono text-muted-foreground text-xs">
                        {row.tier1}
                      </td>
                      <td className="px-4 py-3 font-mono text-muted-foreground text-xs">
                        {row.tier2}
                      </td>
                      <td className="px-4 py-3 font-mono text-muted-foreground text-xs">
                        {row.tier3}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-6 mb-4 text-foreground/80 text-lg leading-relaxed">
              The marginal structure matters more than it looks. An account
              sending 20 million emails a month on Essentials pays $0.16 per
              1,000 on the first 10 million and $0.14 per 1,000 on the next 10
              million &mdash; $3,000, not the $3,200 you get by applying the
              headline rate to the whole volume. Any spreadsheet that multiplies
              one rate by total volume is wrong above 10 million, and wrong in
              the direction that makes the plan look worse than it is.
            </p>

            <p className="text-foreground/80 text-lg leading-relaxed">
              À la carte has no bands. It is $0.10 per 1,000 at every volume,
              which is why it stays the cheapest way to buy raw sending no
              matter how large you get.
            </p>
          </section>

          {/* Who is on what */}
          <section>
            <h2 className="mb-6 font-bold text-3xl">
              Who starts on a plan and who doesn't
            </h2>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              The SES pricing page states the rule in one sentence:
            </p>

            <Card className="mb-6 p-6">
              <p className="text-foreground/80 leading-relaxed">
                "New SES accounts and account x region combinations with no
                metered SES activity since June 1, 2025 will start on the
                Essentials plan beginning July 21, 2026."
              </p>
            </Card>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              Read the unit of measurement carefully. It is not "account." It is{" "}
              <strong>account &times; Region</strong>. A company whose us-east-1
              sends millions a month and whose eu-west-1 has been dormant since
              2024 gets two different answers in the same AWS account: us-east-1
              carries on as before, eu-west-1 starts on Essentials.
            </p>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              The corollary is the part most coverage skipped, and it is in the
              AWS blog post: active customers &mdash; anyone who sent or
              processed email since June 1, 2025 &mdash; remain on à la carte
              pricing. Nobody's live sending was moved onto a $0.16 rate. If you
              have a busy production account, your bill is unchanged.
            </p>

            <p className="text-foreground/80 text-lg leading-relaxed">
              The accounts that get caught are the quiet ones: the brand-new AWS
              account you just opened, the second Region you were about to
              expand into, the staging account that hasn't sent since last year,
              and the disaster-recovery Region you provisioned and never used.
            </p>
          </section>

          {/* Per region */}
          <section>
            <h2 className="mb-6 flex items-center gap-3 font-bold text-3xl">
              <Globe className="text-orange-600 dark:text-orange-400" />
              Plans are per account <em>and</em> per Region
            </h2>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              This is the single most consequential detail in the announcement
              and the one that will surprise people six months from now. The SES
              developer guide is explicit:
            </p>

            <Card className="mb-6 p-6">
              <p className="text-foreground/80 leading-relaxed">
                "Plans apply for each account and each AWS Region, so you manage
                your plan separately in each Region where you use Amazon SES."
              </p>
            </Card>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              Three consequences follow directly. First, there is no
              account-wide pricing setting to check; there are as many settings
              as you have Regions. Second, the monthly fees multiply: Pro at
              $105 per month across four Regions is $420 per month, and
              Enterprise at $500 per month across four Regions is $2,000 per
              month, before a single email is sent. Third, an audit that looks
              only at your primary Region will report a clean bill of health
              while a Region you forgot about quietly sits on Essentials.
            </p>

            <p className="text-foreground/80 text-lg leading-relaxed">
              If you run SES in more than one Region &mdash; and most teams
              running SES for latency, residency, or failover do &mdash; the
              plan question is a per-Region inventory task, not a one-time
              decision.
            </p>
          </section>

          {/* What's in each plan */}
          <section>
            <h2 className="mb-6 font-bold text-3xl">
              What the plans actually bundle
            </h2>

            <p className="mb-6 text-foreground/80 text-lg leading-relaxed">
              Every plan includes everything in the plan below it. Here is what
              each one adds, stated the way AWS states it rather than the way
              it's usually summarized.
            </p>

            <div className="space-y-4">
              <div className="rounded-lg border p-5">
                <h3 className="mb-1 font-medium">
                  Essentials &mdash; $0/month + $0.16 per 1,000 on the first 10M
                </h3>
                <p className="text-foreground/80 leading-relaxed">
                  Includes Virtual Deliverability Manager scoped to SES. Note
                  the qualifier: the pricing page splits VDM into two rows, and{" "}
                  <strong>
                    VDM Global Deliverability remains an add-on on Essentials
                  </strong>{" "}
                  &mdash; it's only included from Pro up. "Essentials bundles
                  VDM" is the shorthand everyone reaches for, including our own
                  copy until we checked. It's half right. Standalone, Global
                  Deliverability is $1,250 per month per account per Region.
                </p>
              </div>

              <div className="rounded-lg border p-5">
                <h3 className="mb-1 font-medium">
                  Pro &mdash; $105/month + $0.22 per 1,000 on the first 10M
                </h3>
                <p className="text-foreground/80 leading-relaxed">
                  Adds VDM Global Deliverability &mdash; what AWS calls "global
                  inbox placement visibility" &mdash; plus 1 domain, 1 managed
                  dedicated IP, 5 seed-list tests, and 2,500 API email
                  validations per account per Region per month. For comparison,
                  a standard dedicated IP is $24.95 per month and email
                  validation is $0.01 per validation à la carte.
                </p>
              </div>

              <div className="rounded-lg border p-5">
                <h3 className="mb-1 font-medium">
                  Enterprise &mdash; $500/month + $0.23 per 1,000 on the first
                  10M
                </h3>
                <p className="text-foreground/80 leading-relaxed">
                  Adds Global Endpoints (the multi-Region resilience story), an
                  Open Ingress Endpoint, 1,000 tenants per account per Region, 5
                  domains, 12 managed dedicated IPs, 25 seed-list tests, and
                  5,000 API validations per month. It also lists one annual
                  expert deliverability assessment &mdash; but that one is
                  gated: it requires 12+ months subscribed and 6 billion
                  trailing emails. It is not a perk you get in month one.
                </p>
              </div>
            </div>
          </section>

          {/* The crux */}
          <section>
            <h2 className="mb-6 font-bold text-3xl">
              Buying a plan doesn't turn anything on
            </h2>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              This sentence in the developer guide is the one to internalize:
            </p>

            <Card className="mb-6 p-6">
              <p className="text-foreground/80 leading-relaxed">
                "When you choose a plan, no features turn on automatically. You
                still enable or disable each feature individually."
              </p>
            </Card>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              So an account that was defaulted into Essentials and never touched
              a console pays $0.16 per 1,000 on the first 10 million emails each
              month and receives, in practice, exactly what it would have
              received on à la carte at $0.10 &mdash; because nobody enabled the
              deliverability tooling the extra six cents is buying.
            </p>

            <div className="rounded-lg border-destructive border-l-4 bg-destructive/10 p-5">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium">
                    A plan you didn't choose and don't use is a 60% markup on
                    sending.
                  </p>
                  <p className="mt-2 text-foreground/80 leading-relaxed">
                    $0.16 versus $0.10 per 1,000 is six cents. On 500,000 emails
                    a month that is $30. On 5 million it is $300. The plan is
                    worth it if you turn the features on and would otherwise buy
                    them &mdash; and it is pure overhead if you don't. AWS
                    documents both halves of that honestly; the only failure
                    mode is not looking.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Escape hatch */}
          <section>
            <h2 className="mb-6 font-bold text-3xl">
              The escape hatch, and its one-shot fuse
            </h2>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              This is the most useful paragraph AWS published, and it is buried
              under a heading called "When plan changes take effect":
            </p>

            <Card className="mb-6 p-6">
              <p className="text-foreground/80 leading-relaxed">
                "Upgrades take effect immediately when you submit the request.
                If you did not explicitly choose a plan and were defaulted to
                the Essentials plan, your first downgrade or cancellation to à
                la carte pricing also takes effect immediately. All other
                downgrades or cancellations take effect at the start of your
                next billing cycle."
              </p>
            </Card>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              Three separate rules live in those three sentences:
            </p>

            <div className="mb-6 space-y-4">
              <div className="rounded-lg border p-5">
                <h3 className="mb-1 font-medium">Upgrades are immediate</h3>
                <p className="text-foreground/80 leading-relaxed">
                  Move up and you are on the new plan, and its rate, the moment
                  you submit.
                </p>
              </div>
              <div className="rounded-lg border p-5">
                <h3 className="mb-1 font-medium">
                  Your <em>first</em> exit from a defaulted plan is immediate
                </h3>
                <p className="text-foreground/80 leading-relaxed">
                  Only if you never explicitly chose a plan. If AWS put you on
                  Essentials and you cancel back to à la carte, that takes
                  effect immediately &mdash; you do not wait out a billing cycle
                  at $0.16.
                </p>
              </div>
              <div className="rounded-lg border p-5">
                <h3 className="mb-1 font-medium">
                  Everything else waits for the next billing cycle
                </h3>
                <p className="text-foreground/80 leading-relaxed">
                  Every other downgrade or cancellation takes effect at the
                  start of your next billing cycle.
                </p>
              </div>
            </div>

            <div className="mb-6 rounded-lg border-destructive border-l-4 bg-destructive/10 p-5">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium">
                    The word is "first." The fuse burns once.
                  </p>
                  <p className="mt-2 text-foreground/80 leading-relaxed">
                    If you were defaulted into Essentials, cancelled back to à
                    la carte, then later deliberately subscribed to a plan, a
                    subsequent cancellation is an ordinary downgrade and waits
                    for the next billing cycle. Treat the immediate exit as a
                    one-time correction of a default you never asked for, not as
                    a general-purpose undo button.
                  </p>
                </div>
              </div>
            </div>

            <p className="text-foreground/80 text-lg leading-relaxed">
              In the console this lives at SES &rarr;{" "}
              <strong>Pricing plan</strong>, which shows your{" "}
              <strong>Plan</strong>, your <strong>Region</strong>, and a{" "}
              <strong>Next plan</strong> field that gets populated when a change
              is scheduled, alongside <strong>Change plan</strong> and{" "}
              <strong>Cancel plan</strong> buttons. New customers also see a{" "}
              <strong>Select pricing plan</strong> step in the{" "}
              <strong>Get set up</strong> wizard &mdash; which is the moment to
              make an explicit choice rather than inherit one.
            </p>
          </section>

          {/* Free tier */}
          <section>
            <h2 className="mb-6 font-bold text-3xl">
              The SES free tier is closed to new customers
            </h2>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              The old SES offer &mdash; 3,000 monthly email charges free for 12
              months &mdash; is discontinued for new customers as of July 21,
              2026. Existing free-tier users keep the benefit through their
              12-month period; this is not a retroactive cancellation.
            </p>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              New AWS accounts instead get the generic AWS Free Tier credit of
              up to $200, which applies across eligible AWS services rather than
              to SES specifically. That is a real difference in kind, not just
              in amount: the old offer was a standing monthly allowance on one
              service, and the new one is a pool of credit you can burn on
              anything eligible, including all the infrastructure around your
              sending.
            </p>

            <p className="text-foreground/80 text-lg leading-relaxed">
              We are deliberately not telling you how long that credit lasts.
              See the "What nobody can tell you yet" section below &mdash; AWS's
              own pages give three different framings.
            </p>
          </section>

          {/* APIs */}
          <section>
            <h2 className="mb-6 flex items-center gap-3 font-bold text-3xl">
              <Terminal className="text-orange-600 dark:text-orange-400" />
              Reading and setting the plan from the API
            </h2>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              Two SESv2 operations carry the whole feature, which is good news
              if you want to audit dozens of account-and-Region pairs without
              clicking through consoles.
            </p>

            <p className="mb-2 text-foreground/80 text-lg leading-relaxed">
              <code className="rounded bg-muted px-1.5 py-0.5">GetAccount</code>{" "}
              reads it. No URI parameters, no request body:
            </p>

            <CodeBlock
              code="GET /v2/email/account HTTP/1.1"
              lang="http"
              title="GetAccount"
            />

            <p className="mb-2 text-foreground/80 text-lg leading-relaxed">
              The response carries a new <code>PricingAttributes</code> object
              alongside the familiar <code>SendQuota</code>,{" "}
              <code>SendingEnabled</code>, and <code>VdmAttributes</code>{" "}
              fields:
            </p>

            <CodeBlock
              code={`{
  "PricingAttributes": {
    "CurrentPlan": "string",
    "NextPlan": "string"
  }
}`}
              lang="json"
              title="response fragment"
            />

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              AWS documents this as "the pricing attributes that apply to your
              Amazon SES account, including the currently active pricing plan
              and any scheduled change." <code>NextPlan</code> is the API mirror
              of the console's Next plan field &mdash; so a downgrade that is
              queued for the next billing cycle is visible programmatically
              before it lands. That makes drift detectable: an account whose{" "}
              <code>NextPlan</code> is populated is an account somebody changed.
            </p>

            <p className="mb-2 text-foreground/80 text-lg leading-relaxed">
              <code className="rounded bg-muted px-1.5 py-0.5">
                PutAccountPricingAttributes
              </code>{" "}
              sets it:
            </p>

            <CodeBlock
              code={`PUT /v2/email/account/pricing-attributes HTTP/1.1
Content-type: application/json

{
   "Plan": "string"
}`}
              lang="http"
              title="PutAccountPricingAttributes"
            />

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              <code>Plan</code> is required and takes one of <code>NONE</code>,{" "}
              <code>ESSENTIALS</code>, <code>PRO</code>, or{" "}
              <code>ENTERPRISE</code>. <code>NONE</code> is à la carte &mdash;
              which is a nice piece of API design honesty, because à la carte
              genuinely is the absence of a plan rather than a fourth plan. A
              successful call returns HTTP 200 with an empty body.
            </p>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              Errors worth handling specifically:{" "}
              <code>BadRequestException</code> (400),{" "}
              <code>TooManyRequestsException</code> (429), and{" "}
              <code>ConflictException</code> (409), which AWS documents as
              firing "if there is already an ongoing account details update
              under review." That last one is the interesting one in automation
              &mdash; a 409 here is not a failure, it is a signal that another
              change to the account is already in flight, and retrying blindly
              will not help.
            </p>

            <p className="text-foreground/80 text-lg leading-relaxed">
              Both operations are available in the AWS CLI v2 and every AWS SDK.
              We are not printing an IAM policy for them &mdash; see the
              unknowns below for why.
            </p>
          </section>

          {/* What it costs */}
          <section>
            <h2 className="mb-6 flex items-center gap-3 font-bold text-3xl">
              <Calculator className="text-orange-600 dark:text-orange-400" />
              What the difference actually costs
            </h2>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              Abstract rate tables are easy to nod at and hard to act on, so
              here is a specific, reproducible number. Take a team sending
              500,000 emails a month with 250,000 tracked delivery events, on
              the Wraps Growth tier, running the full event pipeline we deploy
              into their AWS account &mdash; EventBridge, SQS, Lambda, and
              DynamoDB with 90-day retention.
            </p>

            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="border-b bg-muted/40">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-foreground">
                      Line
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-foreground">
                      À la carte
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-foreground">
                      Essentials
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  <tr className="hover:bg-muted/20">
                    <td className="px-4 py-3 text-muted-foreground">
                      SES email sending
                    </td>
                    <td className="px-4 py-3 font-mono text-muted-foreground text-xs">
                      $50.00
                    </td>
                    <td className="px-4 py-3 font-mono text-muted-foreground text-xs">
                      $80.00
                    </td>
                  </tr>
                  <tr className="hover:bg-muted/20">
                    <td className="px-4 py-3 text-muted-foreground">
                      Event pipeline (EventBridge, SQS, Lambda, DynamoDB)
                    </td>
                    <td className="px-4 py-3 font-mono text-muted-foreground text-xs">
                      $15.10
                    </td>
                    <td className="px-4 py-3 font-mono text-muted-foreground text-xs">
                      $15.10
                    </td>
                  </tr>
                  <tr className="hover:bg-muted/20">
                    <td className="px-4 py-3 text-muted-foreground">
                      Wraps Growth
                    </td>
                    <td className="px-4 py-3 font-mono text-muted-foreground text-xs">
                      $79.00
                    </td>
                    <td className="px-4 py-3 font-mono text-muted-foreground text-xs">
                      $79.00
                    </td>
                  </tr>
                  <tr className="hover:bg-muted/20">
                    <td className="px-4 py-3 font-medium text-foreground">
                      Total per month
                    </td>
                    <td className="px-4 py-3 font-mono font-medium text-foreground text-xs">
                      $144.10
                    </td>
                    <td className="px-4 py-3 font-mono font-medium text-foreground text-xs">
                      $174.10
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p className="mt-6 mb-4 text-foreground/80 text-lg leading-relaxed">
              $30 a month, $360 a year, and the only thing that moved is the SES
              sending line: 500,000 &times; ($0.16 &minus; $0.10) / 1,000. Every
              other line is identical because the plan changes what you pay for
              sending and nothing else. At this volume you are inside the first
              10 million band, so the headline rates apply directly.
            </p>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              You don't have to take our word for it. The same math runs behind{" "}
              <a
                className="text-orange-600 underline underline-offset-4 hover:text-orange-500 dark:text-orange-400"
                href="/tools/ses-calculator"
              >
                the SES calculator
              </a>
              , which has an <strong>AWS SES Pricing Plan</strong> selector with
              Essentials labelled "(AWS default)", and behind a public,
              unauthenticated JSON endpoint you can curl:
            </p>

            <CodeBlock
              code={`# à la carte
curl 'https://wraps.dev/api/pricing/estimate?emails=500000&events=250000&tier=growth&sesPlan=alacarte'

# the same workload, defaulted into Essentials
curl 'https://wraps.dev/api/pricing/estimate?emails=500000&events=250000&tier=growth&sesPlan=essentials'`}
              title="terminal"
            />

            <p className="text-foreground/80 text-lg leading-relaxed">
              Every response carries a <code>shareUrl</code> back into the
              calculator with the same inputs, and the endpoint honours{" "}
              <code>Accept: text/markdown</code> if you'd rather read a table
              than parse JSON. The engine walks AWS's marginal bands, so the
              numbers stay right above 10 million a month too.
            </p>
          </section>

          {/* Not covered */}
          <section>
            <h2 className="mb-6 font-bold text-3xl">
              What the plans don't cover
            </h2>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              The plans price outbound sending. Several things on your SES bill
              sit outside them and are unaffected by which plan you're on:
              attachment data at $0.12 per GB, inbound email at $0.10 per 1,000
              messages plus $0.09 per 1,000 incoming chunks, and Mail Manager at
              $0.15 per 1,000 emails processed. Global Endpoints and EC2-based
              senders can also incur data transfer charges.
            </p>

            <p className="text-foreground/80 text-lg leading-relaxed">
              Our calculator does not model attachment data at all, which means
              it understates the bill for attachment-heavy senders. If you're
              routinely shipping megabyte PDFs, add $0.12 per GB by hand.
            </p>
          </section>

          {/* Unknowns */}
          <section>
            <h2 className="mb-6 font-bold text-3xl">
              What nobody can tell you yet
            </h2>

            <p className="mb-6 text-foreground/80 text-lg leading-relaxed">
              Being explicit about the edges of what is documented:
            </p>

            <div className="space-y-4">
              {UNKNOWNS.map((item) => (
                <div className="rounded-lg border p-5" key={item.title}>
                  <h3 className="mb-1 font-medium">{item.title}</h3>
                  <p className="text-foreground/80 leading-relaxed">
                    {item.body}
                  </p>
                </div>
              ))}
              <div className="rounded-lg border p-5">
                <h3 className="mb-1 font-medium">
                  And one gap that's ours, not AWS's
                </h3>
                <p className="text-foreground/80 leading-relaxed">
                  The cost summary printed by the Wraps CLI still quotes the à
                  la carte rate of $0.10 per 1,000 regardless of which plan your
                  account and Region are actually on. The plan-aware surfaces
                  today are the calculator and the estimate API. If you're
                  reading a cost estimate out of a terminal, sanity-check it
                  against your real plan.
                </p>
              </div>
            </div>
          </section>

          {/* Checklist */}
          <section>
            <h2 className="mb-6 font-bold text-3xl">What to do this week</h2>

            <div className="space-y-4">
              <div className="rounded-lg border p-5">
                <h3 className="mb-1 font-medium">
                  1. Call <code>GetAccount</code> in every Region you send from
                </h3>
                <p className="text-foreground/80 leading-relaxed">
                  Not just the busy one. Include staging accounts, failover
                  Regions, and anything provisioned and forgotten. Read{" "}
                  <code>PricingAttributes.CurrentPlan</code> and{" "}
                  <code>NextPlan</code>.
                </p>
              </div>
              <div className="rounded-lg border p-5">
                <h3 className="mb-1 font-medium">
                  2. If you were defaulted in and don't use the bundle, leave
                  now
                </h3>
                <p className="text-foreground/80 leading-relaxed">
                  The immediate-effect exit only applies to accounts that never
                  explicitly chose a plan, and only to the first one. There is
                  no reason to sit on a rate for features nobody enabled.
                </p>
              </div>
              <div className="rounded-lg border p-5">
                <h3 className="mb-1 font-medium">
                  3. If you do use the features, price the bundle honestly
                </h3>
                <p className="text-foreground/80 leading-relaxed">
                  A managed dedicated IP, seed-list tests, global deliverability
                  visibility, and thousands of email validations have real
                  standalone prices. A plan can genuinely be the cheaper way to
                  buy them &mdash; per account, per Region, times however many
                  Regions you run.
                </p>
              </div>
              <div className="rounded-lg border p-5">
                <h3 className="mb-1 font-medium">
                  4. Make the choice explicit, wherever you land
                </h3>
                <p className="text-foreground/80 leading-relaxed">
                  A deliberate plan you can defend beats an inherited default
                  you never noticed. That is the entire lesson of this change,
                  and it applies just as much when the answer is "Essentials is
                  right for us."
                </p>
              </div>
            </div>
          </section>

          {/* Why this matters */}
          <section>
            <h2 className="mb-6 font-bold text-3xl">The wider point</h2>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              Owning your email infrastructure means the pricing page is a
              document you have to read. Nothing here is hidden &mdash; AWS
              published the rates, the defaults, the effective dates, and the
              exit rule, in public, on the same day. But nothing here arrives in
              your inbox as a bill line item that says "you are paying 60% more
              for sending than you need to," either.
            </p>

            <p className="text-foreground/80 text-lg leading-relaxed">
              That is the trade you make when you run on your own account
              instead of renting a managed sending service: total visibility,
              and the obligation to actually look. The tooling's job is to make
              looking cheap. Ours does it per account and per Region, because
              that is the unit AWS chose to bill in.
            </p>
          </section>

          {/* Continue reading */}
          <section className="space-y-4">
            <h2 className="font-bold text-2xl">Continue reading</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <a
                className="group rounded-xl border p-4 transition-colors hover:border-primary/50"
                href="/tools/ses-calculator"
              >
                <h3 className="font-semibold group-hover:text-primary">
                  SES Cost Calculator
                </h3>
                <p className="text-muted-foreground text-sm">
                  Price your plan, your volume, and the infrastructure around it
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
                  What SES actually gives you and what you have to build
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
                  The event pipeline the cost table above is pricing
                </p>
              </a>
              <a
                className="group rounded-xl border p-4 transition-colors hover:border-primary/50"
                href="/docs/guides/production-access"
              >
                <h3 className="font-semibold group-hover:text-primary">
                  Production Access Guide
                </h3>
                <p className="text-muted-foreground text-sm">
                  Getting a new account out of the SES sandbox
                </p>
              </a>
            </div>
          </section>

          {/* CTA */}
          <section className="relative">
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-r from-orange-500/10 to-amber-500/10 blur-xl" />
            <Card className="relative p-8 text-center md:p-12">
              <h2 className="mb-4 font-bold text-3xl md:text-4xl">
                Price your actual plan
              </h2>
              <p className="mx-auto mb-8 max-w-lg text-muted-foreground">
                Pick your plan and volume and see the whole bill &mdash; SES
                sending on AWS's marginal bands, plus the event pipeline, all
                billed to your own AWS account.
              </p>
              <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
                <div className="rounded-xl border bg-muted/30 px-6 py-3 font-mono text-orange-600 dark:text-orange-400">
                  GET /api/pricing/estimate
                </div>
                <a
                  className="flex items-center gap-2 rounded-xl bg-orange-500 px-6 py-3 font-semibold text-white transition-colors hover:bg-orange-400"
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
