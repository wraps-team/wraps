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

const TITLE = "Migrate from Resend to Amazon SES";
const DESCRIPTION =
  "Resend runs on SES, so this is the shortest migration of the four: the SPF include is often already right and React Email templates move unchanged. Under about 100K a month, Resend is usually the cheaper answer — here is where that stops being true.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "migrate from resend to ses",
    "resend to amazon ses",
    "resend to own aws account",
    "resend log retention",
    "resend rate limit",
    "leave resend",
  ],
  openGraph: {
    title: `${TITLE} | Wraps`,
    description: DESCRIPTION,
    url: "https://wraps.dev/migrate/resend",
    type: "article",
  },
  twitter: {
    card: "summary_large_image",
    title: `${TITLE} | Wraps`,
    description: DESCRIPTION,
  },
  alternates: {
    canonical: "https://wraps.dev/migrate/resend",
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
      name: "Resend",
      item: "https://wraps.dev/migrate/resend",
    },
  ],
};

const steps: { title: string; body: React.ReactNode; plain: string }[] = [
  {
    title: "Export the logs, because they expire",
    plain:
      "Resend purges logs at 30 days on every non-Enterprise plan. Export what you need before you stop sending through it.",
    body: (
      <>
        Logs are purged at thirty days on every plan below Enterprise, so
        whatever history you want to keep has to come out before you go quiet.
        The dashboard exports directly under a thousand rows and emails a
        download link above that, valid for a week. Audiences export as CSV
        separately. This is the only irreversible step on the page.
      </>
    ),
  },
  {
    title: "Verify your own SES identity and request production access",
    plain:
      "Verify the domain in your own AWS account, publish the new DKIM CNAMEs, and file the SES production access request.",
    body: (
      <>
        You are already sending through SES; you are just doing it through
        Resend's account. Verifying in your own account gives you a fresh set of
        DKIM CNAMEs, and a sandbox to get out of. File the production access
        request the day you verify. Our{" "}
        <Link className="text-primary underline" href="/blog/ses-sandbox-guide">
          sandbox guide
        </Link>{" "}
        and{" "}
        <Link
          className="text-primary underline"
          href="/docs/guides/production-access"
        >
          production access guide
        </Link>{" "}
        cover what AWS wants to read.
      </>
    ),
  },
  {
    title: "Leave SPF alone and add the DKIM records",
    plain:
      "Resend and your own SES both authorise amazonses.com in SPF, so SPF usually needs no change. Add the new DKIM CNAMEs alongside the old ones.",
    body: (
      <>
        This is the part that surprises people. Resend sends through SES, so
        your SPF record already contains <code>include:amazonses.com</code> and
        usually needs no edit at all. DKIM keys are per account, so you publish
        the three new CNAMEs next to the Resend ones and remove the old set
        after cutover. DMARC is untouched. Fewer DNS moving parts than any other
        migration in this cluster.
      </>
    ),
  },
  {
    title: "Swap the client, keep the templates",
    plain:
      "React Email components move unchanged. Replace the Resend client import and API key with the Wraps SDK equivalent.",
    body: (
      <>
        React Email is open source and provider-agnostic, and Wraps renders the
        same components, so your templates are not part of this migration. What
        changes is the client: an import, a key, and a send call whose shape is
        close enough that most codebases finish this in an afternoon. Webhook
        consumers need re-pointing, since SES emits its own event shape through
        EventBridge rather than Resend's payload.
      </>
    ),
  },
  {
    title: "Run in parallel, then retire the key",
    plain:
      "Send a share of production through your own SES for a week, compare delivery, then revoke the Resend API key.",
    body: (
      <>
        Send a share of production through your own account for a week and
        compare delivery. The number to watch is your bounce rate, because it is
        now yours: on Resend a noisy sender is Resend's problem, and on your own
        account AWS measures it against you and can pause the account. When the
        week looks boring, revoke the Resend key and drop the old DKIM records.
      </>
    ),
  },
];

const faqs = [
  {
    q: "Is Resend cheaper than running SES myself?",
    a: "Below roughly 100,000 emails a month, usually yes, once you add any platform fee to the raw AWS sending cost. Resend's paid tiers are priced for exactly that band and they are hard to beat there. The crossover moves in SES's favour as volume rises, and it moves earlier if you are paying separately for marketing contacts.",
  },
  {
    q: "Do my React Email templates need changing?",
    a: "No. React Email is an open source library, not a Resend feature, and Wraps renders the same components. This is the single biggest reason a Resend migration is shorter than a SendGrid or Postmark one.",
  },
  {
    q: "Does my sending reputation carry over?",
    a: "The domain half does, and that is the half mailbox providers weight most heavily. What you leave behind is Resend's shared IP pool. Your own SES account starts on the AWS shared pool, which is a reasonable default for most senders, and your own bounce and complaint rates now determine what AWS lets you send.",
  },
  {
    q: "What are the non-price reasons to move?",
    a: "Three come up repeatedly: logs purged at 30 days on every non-Enterprise plan, an API capped at 2 requests per second on all tiers, and the risk of a vendor suspending an account during a traffic spike. Sending from your own AWS account replaces all three with limits you can raise by asking AWS.",
  },
  {
    q: "How long does this take?",
    a: "An afternoon of code, plus the production access wait — AWS usually answers within 24 hours, longer if it asks for more detail — plus a week of parallel running if you are careful. It is the shortest of the four migrations on this site, because you are already on SES underneath.",
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

const reasons: { trigger: string; verdict: string }[] = [
  {
    trigger: "Under about 100,000 a month and happy",
    verdict:
      "Stay. Resend is priced for this band and the migration will not repay itself.",
  },
  {
    trigger: "Well past 100,000 a month",
    verdict:
      "Worth pricing. The per-thousand gap compounds and the platform fee stops moving.",
  },
  {
    trigger: "You need history older than a month",
    verdict:
      "Worth moving. Logs are purged at 30 days on every non-Enterprise plan.",
  },
  {
    trigger: "You hit the 2 requests per second cap",
    verdict:
      "Worth moving. That cap applies on every tier; SES throughput rises with your own reputation.",
  },
  {
    trigger: "A suspension during a traffic spike would be fatal",
    verdict:
      "Worth moving. In your own account, throttling is an AWS quota conversation rather than a vendor decision.",
  },
  {
    trigger: "You are paying separately for marketing contacts",
    verdict:
      "Worth pricing. Contact-based billing is a second line item that raw SES does not have.",
  },
  {
    trigger: "Nobody wants to own an AWS account",
    verdict: "Stay. That ownership is the whole trade you would be making.",
  },
];

export default function MigrateFromResendPage() {
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
              Migrate from Resend to Amazon SES
            </h1>
            <p className="mb-4 max-w-2xl text-lg text-muted-foreground">
              Resend sends through SES. That single fact makes this the easiest
              migration on the site — the SPF record often needs no change at
              all, and React Email templates move without an edit.
            </p>
            <p className="max-w-2xl text-lg text-muted-foreground">
              It also means the honest opening is a warning: under roughly a
              hundred thousand emails a month, Resend is usually the cheaper
              answer once a platform fee is in the comparison. Check that before
              you read any further.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild className="cursor-pointer">
                <Link href="/tools/ses-calculator">
                  Check the crossover
                  <ArrowRight aria-hidden="true" className="ml-1.5 size-4" />
                </Link>
              </Button>
              <Button asChild className="cursor-pointer" variant="outline">
                <Link href="/compare/resend-vs-wraps">
                  Resend vs Wraps, side by side
                </Link>
              </Button>
            </div>
          </section>

          <section className="mb-16">
            <h2 className="mb-3 font-heading font-semibold text-2xl tracking-tight">
              Should you move at all
            </h2>
            <p className="mb-6 max-w-2xl text-muted-foreground">
              Find your row. Two of the seven say stay, and we mean them.
            </p>
            <Card className="overflow-hidden py-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-4 text-left font-medium">
                        Where you are
                      </th>
                      <th className="p-4 text-left font-medium">The answer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reasons.map((row) => (
                      <tr className="border-b last:border-0" key={row.trigger}>
                        <td className="p-4 font-medium text-foreground">
                          {row.trigger}
                        </td>
                        <td className="p-4 text-muted-foreground">
                          {row.verdict}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
            <p className="mt-4 max-w-2xl text-muted-foreground text-sm">
              Resend is a good product and it is aimed squarely at teams sending
              modest volume from a small codebase. If that is you, this page is
              not for you yet.
            </p>
          </section>

          <section className="mb-16">
            <h2 className="mb-3 font-heading font-semibold text-2xl tracking-tight">
              The migration, in order
            </h2>
            <p className="mb-8 max-w-2xl text-muted-foreground">
              Five steps, one of them irreversible. Everything else can be
              undone by putting the old key back.
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
              Shorter than the other guides in this cluster, because you are not
              leaving as much behind. It is not empty.
            </p>
            <Card className="p-6">
              <ul className="grid gap-3.5 text-muted-foreground text-sm">
                {[
                  "A managed SES account. Quota increases, production access, and bounce-rate thresholds become your conversations with AWS.",
                  "Resend's shared IP pool and the reputation it carries. You start on the AWS shared pool instead.",
                  "The signup that just works. SES production access is an application AWS can refuse.",
                  "One bill. You now have an AWS bill for sending and a platform bill for everything around it.",
                  "Nobody watching your sending on your behalf. If your bounce rate climbs, it is your account AWS pauses.",
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
                <h3 className="mb-2 font-semibold text-foreground">Resend</h3>
                <p className="text-muted-foreground text-sm leading-[1.6]">
                  {VENDORS.resend.pricing}
                </p>
                <p className="mt-3 text-muted-foreground text-sm leading-[1.6]">
                  {VENDORS.resend.watchOut}
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
              Both taken from the vendors' published pricing, verified August
              2026. A comparison that ignores the platform fee on our side is a
              comparison designed to flatter us, so put your own numbers in the{" "}
              <Link
                className="text-primary underline"
                href="/tools/ses-calculator"
              >
                SES calculator
              </Link>
              .
            </p>
          </section>

          <section className="mb-16">
            <h2 className="mb-3 font-heading font-semibold text-2xl tracking-tight">
              Where Wraps fits
            </h2>
            <p className="mb-5 max-w-2xl text-muted-foreground">
              The developer experience you liked about Resend is the thing we
              are trying not to lose. Same React Email components, same shape of
              send call, your AWS account underneath.
            </p>
            <div className="grid gap-6 sm:grid-cols-2">
              <Card className="p-6">
                <h3 className="mb-4 font-semibold text-foreground">
                  What it does
                </h3>
                <ul className="grid gap-3 text-muted-foreground text-sm">
                  {[
                    "wraps email init puts SES, EventBridge, SQS, Lambda, DynamoDB and scoped IAM roles in your AWS account",
                    "wraps email connect adopts an SES account you already set up, without changing it",
                    "React Email templates render the same way they do today",
                    "Delivery events land in your own account instead of expiring on a vendor's schedule",
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
                    "It does not make us cheaper than Resend at low volume. Below about 100,000 a month, Resend usually wins on price.",
                    "It does not get you production access. AWS decides, typically within 24 hours, and the answer can be no.",
                    "SDKs are TypeScript and Python only.",
                    "Contacts, templates, and workflow state live in our database, not your AWS. Sending data and delivery events are what land in your account.",
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
              Export the logs first
            </h2>
            <p className="mb-6 max-w-2xl text-muted-foreground">
              Everything else here is reversible. A thirty-day purge is not, so
              do that step whether or not you end up moving.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild className="cursor-pointer">
                <Link href="/docs/quickstart/email">
                  Deploy SES with one command
                  <ArrowRight aria-hidden="true" className="ml-1.5 size-4" />
                </Link>
              </Button>
              <Button asChild className="cursor-pointer" variant="outline">
                <Link href="/alternatives/resend">
                  Other Resend alternatives
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
