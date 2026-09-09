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

const TITLE = "Migrate from Postmark to Amazon SES";
const DESCRIPTION =
  "Most people leave Postmark over unit price, not over anything Postmark did badly. Here is the volume where that argument starts to hold, what Message Streams and inbound parsing cost you to give up, and the migration order.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "migrate from postmark to ses",
    "postmark to amazon ses",
    "postmark message streams alternative",
    "postmark inbound ses",
    "postmark suppression export",
    "leave postmark",
  ],
  openGraph: {
    title: `${TITLE} | Wraps`,
    description: DESCRIPTION,
    url: "https://wraps.dev/migrate/postmark",
    type: "article",
  },
  twitter: {
    card: "summary_large_image",
    title: `${TITLE} | Wraps`,
    description: DESCRIPTION,
  },
  alternates: {
    canonical: "https://wraps.dev/migrate/postmark",
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
      name: "Postmark",
      item: "https://wraps.dev/migrate/postmark",
    },
  ],
};

const steps: { title: string; body: React.ReactNode; plain: string }[] = [
  {
    title: "Price it at your real volume first",
    plain:
      "Compare the published Postmark price against SES plus a platform fee at your actual monthly volume before doing any work.",
    body: (
      <>
        This is the step people skip, and it is the only one that can tell you
        to stop. Postmark bills per included block with per-thousand overage.
        SES bills per thousand with no included block. Below roughly fifty
        thousand messages a month the difference is small enough that the
        migration does not pay for itself inside a year. Above a few hundred
        thousand it is not close. Put your number in the{" "}
        <Link className="text-primary underline" href="/tools/ses-calculator">
          SES calculator
        </Link>{" "}
        and decide from the answer, not from a blog post.
      </>
    ),
  },
  {
    title: "Write down what each Message Stream is for",
    plain:
      "List every Message Stream and what separates it. SES has no stream concept, so the separation has to be reproduced in your own sending logic.",
    body: (
      <>
        Streams are the part of Postmark that has no SES analogue at all. A
        transactional stream and a broadcast stream carry separate reputations
        and separate suppression, and Postmark actively refuses bulk sending on
        a transactional stream. That refusal is a feature: it is what stops a
        marketing blast from taking down password resets. On SES both go through
        the same account and the same reputation. Whatever kept them apart has
        to be rebuilt as your own rule, or accepted as a risk you now carry.
      </>
    ),
  },
  {
    title: "Export suppressions from every stream",
    plain:
      "Pull suppressions per stream through the Suppressions API. Postmark keeps hard bounces and spam complaints beyond the activity window.",
    body: (
      <>
        Suppressions are per stream, so an account-level export is not one
        request. Pull each one through the Suppressions API and keep the reason
        codes. Postmark holds hard bounces and spam complaints past the
        forty-five day activity window, so this export is often older and more
        complete than your own database, and it is the record that keeps you
        compliant after the switch.
      </>
    ),
  },
  {
    title: "Verify the domain and apply for production access",
    plain:
      "Verify the sending domain in SES, publish DKIM CNAMEs, and file the production access request immediately.",
    body: (
      <>
        Verify the sending domain in your chosen SES Region and publish the DKIM
        CNAMEs. File for production access the same day, because it is the one
        item on this list with a queue in front of it. AWS normally comes back
        within a day, later if it wants more detail, and it does refuse
        applications that do not describe the mail. The{" "}
        <Link className="text-primary underline" href="/blog/ses-sandbox-guide">
          sandbox guide
        </Link>{" "}
        and the{" "}
        <Link
          className="text-primary underline"
          href="/docs/guides/production-access"
        >
          production access guide
        </Link>{" "}
        cover the wording that gets approved.
      </>
    ),
  },
  {
    title: "Recreate the templates in your codebase",
    plain:
      "Postmark renders Handlebars templates server-side and offers no bulk export. Rebuild them where the code lives.",
    body: (
      <>
        Postmark renders your templates on its side from stored Handlebars, and
        there is no bulk export button — you pull them one at a time through the
        API. Because SES has no comparable rendering story worth adopting, the
        usual answer is to render before sending. Wraps templates are React
        Email components in your repository, reviewed like any other code, which
        is a better fit for engineers and a worse fit for a marketer who was
        happily editing templates in a browser.
      </>
    ),
  },
  {
    title: "Handle inbound before you move the MX record",
    plain:
      "If you use Postmark inbound, plan the replacement before removing the MX record pointing at inbound.postmarkapp.com.",
    body: (
      <>
        Postmark inbound takes the MX record, parses the message, scores it for
        spam, strips the quoted reply, and POSTs clean JSON. SES email receiving
        gives you a receipt rule and the raw message in S3. Everything after
        that is yours to write, and only some Regions offer it at all. Do not
        remove the MX record pointing at <code>inbound.postmarkapp.com</code>{" "}
        until the replacement is handling real mail.
      </>
    ),
  },
  {
    title: "Cut over one stream at a time",
    plain:
      "Move the lowest-stakes stream first, watch bounce and complaint rates, then move password resets and receipts last.",
    body: (
      <>
        Move the least important stream first and leave password resets and
        receipts on Postmark until the SES numbers look boring. Compare bounce
        and complaint rates against the Postmark baseline for a week or two.
        Postmark's deliverability is genuinely good, so treat any drop as real
        and worth investigating rather than as noise.
      </>
    ),
  },
];

const faqs = [
  {
    q: "Is there a Message Streams equivalent in Amazon SES?",
    a: "No. Configuration sets are the nearest structure and they separate event destinations and sending options, not reputation and not suppression. The guarantee Postmark gives you — that a broadcast cannot damage transactional delivery, because they are different streams on different reputations — does not exist on SES inside one account. Reproducing it means separate AWS accounts.",
  },
  {
    q: "Should I migrate if I am under 50,000 emails a month?",
    a: "Probably not for the money. At that volume the gap between Postmark's published price and SES plus a platform fee is small, and the migration costs you engineering days plus a production-access application. The reasons that still hold at low volume are ownership of the sending infrastructure and keeping delivery events inside your own AWS account.",
  },
  {
    q: "What do I do about inbound email?",
    a: "SES email receiving, in a Region that offers it, delivering to S3 or Lambda. You lose the parsed JSON, the spam score, and the stripped reply text that Postmark hands you, and you write that layer yourself. If inbound is central to your product, this is the largest single item in the migration and worth costing before you commit.",
  },
  {
    q: "Will deliverability get worse?",
    a: "It can, and pretending otherwise would be dishonest. Postmark sells inbox placement and staffs for it. On SES you inherit AWS's shared pool and your own domain reputation, and nobody is watching your placement for you. Domain reputation carries over, so most senders see no change, but the safety net does go away.",
  },
  {
    q: "Can I keep my templates?",
    a: "The markup, yes. The rendering, no. Postmark stores and renders Handlebars server-side; on SES you either use SES templates or render before you send. There is no converter, and pulling templates out is a per-template API call rather than an export.",
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

const gaps: { capability: string; postmark: string; afterwards: string }[] = [
  {
    capability: "Message Streams",
    postmark:
      "Separate reputation and suppression per stream, bulk blocked on transactional",
    afterwards:
      "One account reputation. Separation is your own rule, or separate AWS accounts",
  },
  {
    capability: "Inbound parsing",
    postmark:
      "MX record, spam score, parsed headers, stripped reply text, JSON webhook",
    afterwards: "Receipt rules to S3 or Lambda, raw MIME, Region-limited",
  },
  {
    capability: "Templates",
    postmark:
      "Stored Handlebars, rendered by Postmark, preview and test data built in",
    afterwards: "Render in your own code, or SES templates with no preview",
  },
  {
    capability: "Deliverability support",
    postmark:
      "Humans who answer placement questions, and a reputation they manage",
    afterwards: "AWS support, on your own reputation and your own thresholds",
  },
  {
    capability: "Activity history",
    postmark: "Searchable message detail, retained on Postmark's schedule",
    afterwards: "Whatever you build or buy on top of the event stream",
  },
  {
    capability: "Sending approval",
    postmark: "Account review at signup, then you send",
    afterwards: "SES production access, an AWS decision that can be refused",
  },
];

export default function MigrateFromPostmarkPage() {
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
              Migrate from Postmark to Amazon SES
            </h1>
            <p className="mb-4 max-w-2xl text-lg text-muted-foreground">
              Almost nobody leaves Postmark because Postmark went wrong. They
              leave because the per-thousand rate stopped making sense at their
              volume. That makes this a different kind of migration guide: the
              first job is working out whether you should do it.
            </p>
            <p className="max-w-2xl text-lg text-muted-foreground">
              Below is the volume where the money argument starts to hold, the
              two Postmark features that have no SES replacement, and the order
              to work in if you go ahead.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild className="cursor-pointer">
                <Link href="/tools/ses-calculator">
                  Price it at your volume
                  <ArrowRight aria-hidden="true" className="ml-1.5 size-4" />
                </Link>
              </Button>
              <Button asChild className="cursor-pointer" variant="outline">
                <Link href="/compare/postmark-vs-wraps">
                  Postmark vs Wraps, side by side
                </Link>
              </Button>
            </div>
          </section>

          <section className="mb-16">
            <h2 className="mb-3 font-heading font-semibold text-2xl tracking-tight">
              Stay on Postmark if this is you
            </h2>
            <p className="mb-6 max-w-2xl text-muted-foreground">
              We would rather you kept paying Postmark than started a migration
              that never finishes. Four cases where staying is the right call.
            </p>
            <Card className="p-6">
              <ul className="grid gap-3.5 text-muted-foreground text-sm">
                {[
                  "You send under about fifty thousand a month. The saving is real but small, and it will not repay a week of engineering plus an AWS approval inside a year.",
                  "Inbox placement on password resets and receipts is the thing you are paid to protect, and nobody on the team wants to own that number.",
                  "Postmark inbound is a product feature. Rebuilding parsed inbound on receipt rules is the biggest line item here.",
                  "You depend on the transactional stream refusing bulk sends. That guardrail does not exist on SES and losing it has taken production email down for other people.",
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
            <p className="mt-4 max-w-2xl text-muted-foreground text-sm">
              The senders this move suits are past a few hundred thousand a
              month, own their sending code, and want delivery events landing in
              an account they control.
            </p>
          </section>

          <section className="mb-16">
            <h2 className="mb-3 font-heading font-semibold text-2xl tracking-tight">
              The six gaps, stated plainly
            </h2>
            <p className="mb-6 max-w-2xl text-muted-foreground">
              Postmark is a narrow product that does its narrow thing very well.
              Everything you are trading away is in this table.
            </p>
            <Card className="overflow-hidden py-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-4 text-left font-medium">Capability</th>
                      <th className="p-4 text-left font-medium">
                        What Postmark gives you
                      </th>
                      <th className="p-4 text-left font-medium">
                        What you have afterwards
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {gaps.map((row) => (
                      <tr
                        className="border-b last:border-0"
                        key={row.capability}
                      >
                        <td className="p-4 font-medium text-foreground">
                          {row.capability}
                        </td>
                        <td className="p-4 text-muted-foreground">
                          {row.postmark}
                        </td>
                        <td className="p-4 text-muted-foreground">
                          {row.afterwards}
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
              Step one can end the project, which is why it is step one.
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
              The first item is the one that has cost other teams an outage.
            </p>
            <Card className="p-6">
              <ul className="grid gap-3.5 text-muted-foreground text-sm">
                {[
                  "The wall between transactional and broadcast. Nothing on SES stops a campaign from harming password reset delivery.",
                  "Parsed inbound with spam scoring and stripped replies. Receipt rules hand you raw MIME, in some Regions only.",
                  "Server-side template rendering with preview and test data.",
                  "A deliverability team that answers when placement drops.",
                  "Message search that already exists on day one, with no pipeline to build.",
                  "A signup that just works. SES production access is an application AWS can refuse.",
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
                <h3 className="mb-2 font-semibold text-foreground">Postmark</h3>
                <p className="text-muted-foreground text-sm leading-[1.6]">
                  {VENDORS.postmark.pricing}
                </p>
                <p className="mt-3 text-muted-foreground text-sm leading-[1.6]">
                  {VENDORS.postmark.watchOut}
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
              Taken from each vendor's own pricing page, verified August 2026.
              Postmark repriced in early 2026, so a long-standing account is
              probably not on these numbers — check your invoice, not this
              table.
            </p>
          </section>

          <section className="mb-16">
            <h2 className="mb-3 font-heading font-semibold text-2xl tracking-tight">
              Where Wraps fits
            </h2>
            <p className="mb-5 max-w-2xl text-muted-foreground">
              Wraps replaces the operational layer you are giving up, not the
              deliverability team. Being clear about that difference is the
              point of this section.
            </p>
            <div className="grid gap-6 sm:grid-cols-2">
              <Card className="p-6">
                <h3 className="mb-4 font-semibold text-foreground">
                  What it does
                </h3>
                <ul className="grid gap-3 text-muted-foreground text-sm">
                  {[
                    "wraps email init deploys SES with EventBridge, SQS, Lambda, DynamoDB and scoped IAM roles into your own AWS account",
                    "wraps email connect adopts SES identities you already verified, leaving them untouched",
                    "Bounces and complaints feed a suppression list checked before the next send",
                    "Message-level history and a dashboard, so you are not staring at CloudWatch",
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
                    "No stream separation. One SES account is one reputation, with or without us.",
                    "No inbound email parsing.",
                    "No deliverability desk. We ship tooling, not placement guarantees.",
                    "Contacts, templates, and workflow state sit in our database, not your AWS. Sending data and delivery events are what land in your account.",
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
              Do the arithmetic before the migration
            </h2>
            <p className="mb-6 max-w-2xl text-muted-foreground">
              Postmark is a good product at a price that stops working at
              volume. If your volume has not reached that point, the honest
              answer is to stay and come back later.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild className="cursor-pointer">
                <Link href="/tools/ses-calculator">
                  Run the numbers
                  <ArrowRight aria-hidden="true" className="ml-1.5 size-4" />
                </Link>
              </Button>
              <Button asChild className="cursor-pointer" variant="outline">
                <Link href="/alternatives/postmark">
                  Other Postmark alternatives
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
