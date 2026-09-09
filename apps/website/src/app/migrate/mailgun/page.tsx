import { Button } from "@wraps/ui/components/ui/button";
import { Card } from "@wraps/ui/components/ui/card";
import { ArrowRight, Check, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { SectionKicker } from "@/app/landing/components/section-kicker";
import { JsonLd } from "@/components/json-ld";
import { VENDORS } from "@/config/alternatives";

const TITLE = "Migrate from Mailgun to Amazon SES";
const DESCRIPTION =
  "Three Mailgun habits break on SES: Routes, the EU endpoint, and per-domain reputation. Here is what replaces each one, how the three suppression lists collapse into one, and the order that keeps mail flowing.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "migrate from mailgun to ses",
    "mailgun to amazon ses",
    "mailgun routes ses equivalent",
    "mailgun eu region migration",
    "mailgun suppression export",
    "leave mailgun",
  ],
  openGraph: {
    title: `${TITLE} | Wraps`,
    description: DESCRIPTION,
    url: "https://wraps.dev/migrate/mailgun",
    type: "article",
  },
  twitter: {
    card: "summary_large_image",
    title: `${TITLE} | Wraps`,
    description: DESCRIPTION,
  },
  alternates: {
    canonical: "https://wraps.dev/migrate/mailgun",
  },
};

const breadcrumbSchema = {
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
      name: "Migrate",
      item: "https://wraps.dev/migrate",
    },
    {
      "@type": "ListItem",
      position: 3,
      name: "Mailgun",
      item: "https://wraps.dev/migrate/mailgun",
    },
  ],
};

const steps: { title: string; body: React.ReactNode; plain: string }[] = [
  {
    title: "Pick the AWS Region before you pick anything else",
    plain:
      "A Mailgun domain is pinned to the US or EU endpoint. Choose the matching AWS Region first, because SES identities, suppression, and receipt rules are all per-Region.",
    body: (
      <>
        Every Mailgun domain lives behind either <code>api.mailgun.net</code> or{" "}
        <code>api.eu.mailgun.net</code>, and you chose that when you created the
        domain. SES is Regional in the same way, only more so: the verified
        identity, the sending quota, the suppression list, and the reputation
        metrics all belong to one Region. Pick the Region that matches your data
        residency answer now, because moving later means re-verifying the domain
        and starting the reputation history again.
      </>
    ),
  },
  {
    title: "Pull all three suppression lists",
    plain:
      "Mailgun keeps bounces, unsubscribes, and complaints as three separate lists. Export all three before touching DNS.",
    body: (
      <>
        Mailgun splits suppressions into bounces, unsubscribes, and complaints,
        each with its own API endpoint and its own CSV. SES has one
        account-level suppression list and it only understands bounces and
        complaints. Your unsubscribe list has nowhere to go inside SES, which
        means it has to live in your application or in whatever sits on top.
        Losing it is the most expensive mistake available in this migration.
      </>
    ),
  },
  {
    title: "Inventory your Routes",
    plain:
      "Mailgun Routes match on expressions and can forward, store, or POST. SES receipt rules only exist in some Regions and only deliver to S3, SNS, or Lambda.",
    body: (
      <>
        Routes are the Mailgun feature people forget they depend on. A route
        matches with an expression like{" "}
        <code>match_recipient(&quot;.*@example.com&quot;)</code> and then
        forwards, stores, or POSTs the parsed message. SES email receiving is
        the nearest thing and it is a different mechanism: a receipt rule set,
        available only in a subset of Regions, delivering raw MIME to S3, SNS,
        or Lambda. If you use Routes for reply handling or support inboxes,
        write down every one of them before you cancel anything.
      </>
    ),
  },
  {
    title: "Verify the domain and open production access",
    plain:
      "Verify the sending domain in the chosen SES Region, publish the DKIM CNAMEs, and file the production access request on day one.",
    body: (
      <>
        Verify the domain in your chosen Region and publish the DKIM CNAMEs SES
        issues. Then file the production access request the same day. A fresh
        SES account is sandboxed to verified recipients, AWS usually replies
        inside a day and takes longer when it has questions, and it refuses thin
        applications. The{" "}
        <Link className="text-primary underline" href="/blog/ses-sandbox-guide">
          sandbox guide
        </Link>{" "}
        explains the constraint and the{" "}
        <Link
          className="text-primary underline"
          href="/docs/guides/production-access"
        >
          production access guide
        </Link>{" "}
        covers what to write.
      </>
    ),
  },
  {
    title: "Run both SPF includes for a while",
    plain:
      "Add include:amazonses.com to SPF while Mailgun's include stays. Keep the Mailgun DKIM record until traffic has moved.",
    body: (
      <>
        Add <code>include:amazonses.com</code> alongside the Mailgun include
        rather than swapping them, and leave the Mailgun DKIM TXT record where
        it is. DMARC does not change. Watch your SPF lookup count while both are
        published — SPF permits ten DNS lookups and two provider includes eat
        into that faster than people expect. The{" "}
        <Link className="text-primary underline" href="/tools/spf-builder">
          SPF builder
        </Link>{" "}
        counts them for you.
      </>
    ),
  },
  {
    title: "Move the templates and the send call",
    plain:
      "Mailgun stores Handlebars templates with versions. Rebuild them in your codebase and replace the messages endpoint call.",
    body: (
      <>
        Mailgun templates are stored server-side with version history, and SES
        has no equivalent store worth migrating into. The practical move is to
        render in your own code and send the finished message, which is what the
        Wraps SDK does with React Email components living in your repository.
        Substitution variables do not translate on their own; a template using{" "}
        <code>%recipient.name%</code> has to be rewritten.
      </>
    ),
  },
  {
    title: "Watch the account-wide rates during cutover",
    plain:
      "Send a slice of traffic through SES for one to two weeks and watch the account-level bounce and complaint rates, not per-domain ones.",
    body: (
      <>
        Move a slice of production traffic first and let it run for a week or
        two. The metric to watch is not the one you are used to: SES computes
        bounce and complaint rates across the whole account in that Region, so a
        single noisy domain now drags every other domain with it. When the rates
        hold, drop the Mailgun include and DKIM record, then close the account.
      </>
    ),
  },
];

const faqs = [
  {
    q: "What is the SES equivalent of Mailgun Routes?",
    a: "SES email receiving, configured as receipt rules. It is not a drop-in replacement. Routes match on expressions and can POST a parsed message to a URL; receipt rules match on recipient and deliver the raw MIME to S3, SNS, or Lambda, leaving the parsing to you. SES email receiving is also not offered in every Region, so confirm yours supports it before you plan a reply-handling feature around it.",
  },
  {
    q: "I use the EU endpoint. Which SES Region do I move to?",
    a: "Any EU Region where SES is available, most commonly eu-west-1 or eu-central-1. The identity, quota, suppression list, and reputation metrics are all scoped to that one Region, so treat the choice as permanent. Check SES email receiving availability in that Region too if you rely on inbound.",
  },
  {
    q: "What happens to my unsubscribe list?",
    a: "It has no home in SES. The SES account-level suppression list stores addresses that bounced or complained, and nothing else. Export your Mailgun unsubscribes and keep them somewhere your sending path checks before every send, whether that is your own database or a platform on top of SES.",
  },
  {
    q: "Does SES have anything like Mailgun's email validation API?",
    a: "No. Address validation is a separate Mailgun product and AWS does not offer a counterpart. If you validate addresses at signup today, that dependency survives the migration and stays on your bill, or you replace it.",
  },
  {
    q: "Will my delivery rates change?",
    a: "Domain reputation follows you, so mailbox providers still recognise the domain. What changes is the IP: Mailgun's pool is Mailgun's, and you start on the SES shared pool unless you buy and warm a dedicated one. For most senders the shared pool is the right default and the delivery difference is not detectable.",
  },
];

const howToSchema = {
  "@context": "https://schema.org",
  "@type": "HowTo",
  name: TITLE,
  description: DESCRIPTION,
  step: steps.map((step, index) => ({
    "@type": "HowToStep",
    position: index + 1,
    name: step.title,
    text: step.plain,
  })),
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((faq) => ({
    "@type": "Question",
    name: faq.q,
    acceptedAnswer: { "@type": "Answer", text: faq.a },
  })),
};

type Difficulty = "easy" | "work" | "rebuild";

const mapping: {
  feature: string;
  difficulty: Difficulty;
  replacement: string;
}[] = [
  {
    feature: "Messages endpoint",
    difficulty: "easy",
    replacement: "SESv2 SendEmail, or the Region's SMTP endpoint",
  },
  {
    feature: "Sending domains",
    difficulty: "easy",
    replacement: "SES verified identities, one per Region",
  },
  {
    feature: "Event webhooks",
    difficulty: "work",
    replacement: "EventBridge or SNS, with a different payload shape",
  },
  {
    feature: "Log retention and search",
    difficulty: "work",
    replacement: "Whatever you point the event stream at",
  },
  {
    feature: "Stored templates",
    difficulty: "work",
    replacement: "Render in your own code, or SES templates",
  },
  {
    feature: "Three suppression lists",
    difficulty: "work",
    replacement:
      "One SES list for bounces and complaints; unsubscribes are yours",
  },
  {
    feature: "Routes",
    difficulty: "rebuild",
    replacement: "SES receipt rules, Region-limited, raw MIME only",
  },
  {
    feature: "Per-domain reputation",
    difficulty: "rebuild",
    replacement: "Account-wide rates per Region, enforced by AWS",
  },
  {
    feature: "Email validation API",
    difficulty: "rebuild",
    replacement: "No AWS counterpart",
  },
];

const difficultyLabels: Record<Difficulty, string> = {
  easy: "Swap it",
  work: "Some work",
  rebuild: "Rebuild it",
};

export default function MigrateFromMailgunPage() {
  return (
    <div className="min-h-screen bg-background">
      <LandingNavbar />
      <JsonLd data={breadcrumbSchema} />
      <JsonLd data={howToSchema} />
      <JsonLd data={faqSchema} />

      <main className="container mx-auto px-4 pt-24 pb-16">
        <div className="mx-auto max-w-4xl">
          <section className="mb-14">
            <SectionKicker>Migration guide</SectionKicker>
            <h1 className="mb-5 font-heading font-semibold text-4xl tracking-tight sm:text-5xl">
              Migrate from Mailgun to Amazon SES
            </h1>
            <p className="mb-4 max-w-2xl text-lg text-muted-foreground">
              Swapping the messages endpoint for SES is the shortest part. The
              three that take real time are Routes, the EU-or-US decision baked
              into every Mailgun domain, and moving from per-domain reputation
              to a rate AWS measures across your whole account.
            </p>
            <p className="max-w-2xl text-lg text-muted-foreground">
              Everything below is ordered so the things you wait on start first.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild className="cursor-pointer">
                <Link href="/docs/quickstart/email">
                  Stand up SES
                  <ArrowRight aria-hidden="true" className="ml-1.5 size-4" />
                </Link>
              </Button>
              <Button asChild className="cursor-pointer" variant="outline">
                <Link href="/compare/mailgun-vs-wraps">
                  Mailgun vs Wraps, side by side
                </Link>
              </Button>
            </div>
          </section>

          <section className="mb-16">
            <h2 className="mb-3 font-heading font-semibold text-2xl tracking-tight">
              Do not move if any of these is true
            </h2>
            <p className="mb-6 max-w-2xl text-muted-foreground">
              Mailgun earns its price in three specific places. If you are in
              one of them, the arithmetic does not work in your favour.
            </p>
            <Card className="p-6">
              <ul className="grid gap-3.5 text-muted-foreground text-sm">
                {[
                  "Routes carry a product feature. Inbound reply handling on SES is a Region-limited receipt rule writing raw MIME to S3, and you write the parser.",
                  "You are grandfathered on a legacy pay-as-you-go rate. Anyone still on the old Flex pricing should price the alternative carefully before moving.",
                  "The validation API runs at signup. AWS has nothing comparable, so that vendor relationship survives the migration anyway.",
                  "You send for many customers on one account. SES measures bounce and complaint rates account-wide, so one bad tenant can pause everybody.",
                ].map((item) => (
                  <li className="flex gap-2.5" key={item}>
                    <X
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0 text-muted-foreground/70"
                    />
                    {item}
                  </li>
                ))}
              </ul>
            </Card>
          </section>

          <section className="mb-16">
            <h2 className="mb-3 font-heading font-semibold text-2xl tracking-tight">
              Every Mailgun feature, and what it becomes
            </h2>
            <p className="mb-6 max-w-2xl text-muted-foreground">
              Sorted by how much of your week it takes. The bottom three rows
              are the reason this migration is not an afternoon.
            </p>
            <Card className="overflow-hidden py-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-4 text-left font-medium">
                        Mailgun feature
                      </th>
                      <th className="p-4 text-left font-medium">Effort</th>
                      <th className="p-4 text-left font-medium">
                        What replaces it
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {mapping.map((row) => (
                      <tr className="border-b last:border-0" key={row.feature}>
                        <td className="p-4 font-medium text-foreground">
                          {row.feature}
                        </td>
                        <td className="p-4">
                          <span className="inline-block whitespace-nowrap rounded bg-muted px-2 py-0.5 font-medium text-muted-foreground text-xs">
                            {difficultyLabels[row.difficulty]}
                          </span>
                        </td>
                        <td className="p-4 text-muted-foreground">
                          {row.replacement}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </section>

          <section className="mb-16">
            <h2 className="mb-3 font-heading font-semibold text-2xl tracking-tight">
              The migration, in order
            </h2>
            <p className="mb-8 max-w-2xl text-muted-foreground">
              Region first, exports second, AWS approval third. Code last,
              because code is the only part whose schedule you control.
            </p>
            <ol className="grid gap-7">
              {steps.map((step, index) => (
                <li className="flex gap-4" key={step.title}>
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted font-mono font-semibold text-foreground text-xs">
                    {index + 1}
                  </span>
                  <div>
                    <h3 className="mb-1.5 font-semibold text-foreground">
                      {step.title}
                    </h3>
                    <p className="text-muted-foreground text-sm leading-[1.6] [&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em] [&_code]:text-foreground">
                      {step.body}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="mb-16">
            <h2 className="mb-3 font-heading font-semibold text-2xl tracking-tight">
              What you lose
            </h2>
            <p className="mb-6 max-w-2xl text-muted-foreground">
              Naming these up front is cheaper than discovering them in week
              three.
            </p>
            <Card className="p-6">
              <ul className="grid gap-3.5 text-muted-foreground text-sm">
                {[
                  "Routes with expression matching. Receipt rules match recipients and hand you raw MIME, in the Regions that offer them.",
                  "The separate unsubscribe list. SES suppression covers bounces and complaints only.",
                  "Per-domain reputation. AWS aggregates bounce and complaint rates across the account, per Region.",
                  "Address validation. There is no AWS product for it.",
                  "Searchable logs by default. Events land wherever you send them, and nothing is stored until you build or buy that.",
                  "A support queue that owns deliverability. Production access, quota increases, and pauses are now conversations with AWS.",
                ].map((item) => (
                  <li className="flex gap-2.5" key={item}>
                    <X
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0 text-muted-foreground/70"
                    />
                    {item}
                  </li>
                ))}
              </ul>
            </Card>
          </section>

          <section className="mb-16">
            <h2 className="mb-3 font-heading font-semibold text-2xl tracking-tight">
              The published prices, side by side
            </h2>
            <div className="grid gap-6 sm:grid-cols-2">
              <Card className="p-6">
                <h3 className="mb-2 font-semibold text-foreground">Mailgun</h3>
                <p className="text-muted-foreground text-sm leading-[1.6]">
                  {VENDORS.mailgun.pricing}
                </p>
                <p className="mt-3 text-muted-foreground text-sm leading-[1.6]">
                  {VENDORS.mailgun.watchOut}
                </p>
              </Card>
              <Card className="p-6">
                <h3 className="mb-2 font-semibold text-foreground">
                  Amazon SES
                </h3>
                <p className="text-muted-foreground text-sm leading-[1.6]">
                  {VENDORS["amazon-ses"].pricing}
                </p>
                <p className="mt-3 text-muted-foreground text-sm leading-[1.6]">
                  {VENDORS["amazon-ses"].watchOut}
                </p>
              </Card>
            </div>
            <p className="mt-4 max-w-2xl text-muted-foreground text-sm">
              Both figures come from the vendors' own pricing pages, verified
              August 2026. Run your real volume through the{" "}
              <Link
                className="text-primary underline"
                href="/tools/ses-calculator"
              >
                SES calculator
              </Link>{" "}
              before you decide anything.
            </p>
          </section>

          <section className="mb-16">
            <h2 className="mb-3 font-heading font-semibold text-2xl tracking-tight">
              Where Wraps fits
            </h2>
            <p className="mb-5 max-w-2xl text-muted-foreground">
              Steps four through seven are the ones with the most abandoned
              migrations behind them. Wraps handles those and leaves the mail
              itself in your account.
            </p>
            <div className="grid gap-6 sm:grid-cols-2">
              <Card className="p-6">
                <h3 className="mb-4 font-semibold text-foreground">
                  What it does
                </h3>
                <ul className="grid gap-3 text-muted-foreground text-sm">
                  {[
                    "wraps email init provisions SES, EventBridge, SQS, Lambda, DynamoDB and scoped IAM roles in the Region you choose",
                    "wraps email connect adopts an SES setup you already built, without modifying it",
                    "Bounces and complaints land in a suppression list that is checked before the next send",
                    "A per-message event history and a dashboard, so the log search you had does not disappear",
                  ].map((item) => (
                    <li className="flex gap-2.5" key={item}>
                      <Check
                        aria-hidden="true"
                        className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-500"
                      />
                      {item}
                    </li>
                  ))}
                </ul>
              </Card>
              <Card className="p-6">
                <h3 className="mb-4 font-semibold text-foreground">
                  What it does not
                </h3>
                <ul className="grid gap-3 text-muted-foreground text-sm">
                  {[
                    "No inbound routing. Routes have no Wraps counterpart either.",
                    "No address validation.",
                    "No influence over production access. AWS decides, normally inside a day, and can say no.",
                    "Contacts, templates, and workflow state live in our database, not your AWS. Sending data and delivery events are the parts that land in your account.",
                  ].map((item) => (
                    <li className="flex gap-2.5" key={item}>
                      <X
                        aria-hidden="true"
                        className="mt-0.5 size-4 shrink-0 text-muted-foreground/70"
                      />
                      {item}
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
            <p className="mt-5 max-w-2xl text-muted-foreground text-sm">
              {VENDORS.wraps.pricing}
            </p>
          </section>

          <section className="mb-16">
            <h2 className="mb-6 font-heading font-semibold text-2xl tracking-tight">
              Questions people ask before they commit
            </h2>
            <div className="grid gap-6">
              {faqs.map((faq) => (
                <div key={faq.q}>
                  <h3 className="mb-1.5 font-semibold text-foreground">
                    {faq.q}
                  </h3>
                  <p className="text-muted-foreground leading-[1.6]">{faq.a}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-border bg-muted/30 p-8">
            <h2 className="mb-3 font-heading font-semibold text-2xl tracking-tight">
              Pick the Region, then start the clock
            </h2>
            <p className="mb-6 max-w-2xl text-muted-foreground">
              The Region choice is hard to reverse and the AWS approval is a
              queue. Do both this week and the rest is code you can schedule.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild className="cursor-pointer">
                <Link href="/docs/quickstart/email">
                  Deploy SES with one command
                  <ArrowRight aria-hidden="true" className="ml-1.5 size-4" />
                </Link>
              </Button>
              <Button asChild className="cursor-pointer" variant="outline">
                <Link href="/alternatives/mailgun">
                  Other Mailgun alternatives
                </Link>
              </Button>
            </div>
          </section>
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}
