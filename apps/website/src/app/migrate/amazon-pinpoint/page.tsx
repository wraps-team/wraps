import { Button } from "@wraps/ui/components/ui/button";
import { Card } from "@wraps/ui/components/ui/card";
import { AlertTriangle, ArrowRight, Check, Minus, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { SectionKicker } from "@/app/landing/components/section-kicker";
import { JsonLd } from "@/components/json-ld";

const TITLE =
  "Migrate from Amazon Pinpoint to Amazon SES before October 30, 2026";
const DESCRIPTION =
  "AWS ends support for Amazon Pinpoint on October 30, 2026. Email workloads move to Amazon SES. Here is what breaks, what AWS recommends, what it leaves out, and how to land segments, campaigns, journeys, and analytics in your own AWS account.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "amazon pinpoint end of support",
    "pinpoint migration",
    "pinpoint to ses",
    "amazon pinpoint alternative",
    "pinpoint shutdown 2026",
    "migrate pinpoint email",
  ],
  openGraph: {
    title: `${TITLE} | Wraps`,
    description: DESCRIPTION,
    url: "https://wraps.dev/migrate/amazon-pinpoint",
    type: "article",
  },
  twitter: {
    card: "summary_large_image",
    title: `${TITLE} | Wraps`,
    description: DESCRIPTION,
  },
  alternates: {
    canonical: "https://wraps.dev/migrate/amazon-pinpoint",
  },
};

const END_OF_SUPPORT = "October 30, 2026";

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
      item: "https://wraps.dev/migrate/amazon-pinpoint",
    },
    {
      "@type": "ListItem",
      position: 3,
      name: "Amazon Pinpoint",
      item: "https://wraps.dev/migrate/amazon-pinpoint",
    },
  ],
};

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: TITLE,
  description: DESCRIPTION,
  datePublished: "2026-08-28T00:00:00.000Z",
  dateModified: "2026-08-28T00:00:00.000Z",
  author: {
    "@type": "Organization",
    name: "Wraps",
    url: "https://wraps.dev",
  },
  publisher: {
    "@type": "Organization",
    name: "Wraps",
    logo: { "@type": "ImageObject", url: "https://wraps.dev/logo.png" },
  },
  mainEntityOfPage: {
    "@type": "WebPage",
    "@id": "https://wraps.dev/migrate/amazon-pinpoint",
  },
};

// Every answer here is sourced from the AWS end-of-support guide linked in the
// page body. Where AWS is silent (what happens to a segment definition you
// never exported) the answer says so rather than guessing.
const faqs = [
  {
    q: "When exactly does Amazon Pinpoint shut down?",
    a: "AWS ends support on October 30, 2026. After that date you can no longer access the Amazon Pinpoint console or your Pinpoint resources — endpoints, segments, campaigns, journeys, and analytics. Pinpoint stopped accepting new customers on May 20, 2025, so if your account was created after that date you were never on it.",
  },
  {
    q: "Does this affect my SMS and push notifications?",
    a: "No. The Pinpoint channel APIs — SMS, MMS, mobile push, WhatsApp, voice, OTP, and phone number validate — were renamed AWS End User Messaging in Q3 2024 and are explicitly unaffected. Only the engagement layer and email are going away.",
  },
  {
    q: "What does AWS recommend for Pinpoint email?",
    a: "Amazon SES. AWS says so directly in the migration guide. If you used the Pinpoint email deliverability dashboard, the equivalent is now SES Virtual Deliverability Manager.",
  },
  {
    q: "What replaces segments, campaigns, and journeys?",
    a: "AWS points you at Amazon Connect outbound campaigns and Customer Profiles, and at Amazon Kinesis for event collection and mobile analytics. That is a contact-center product plus a streaming service — a reasonable fit if you run agent-assisted outbound, and a heavy lift if you were only sending lifecycle email.",
  },
  {
    q: "Can I export my Pinpoint data before the cutoff?",
    a: "Yes, and you should do it now. Create a segment with no filters and export it to S3 to capture every endpoint. Use get-segment, get-campaign, get-journey, and list-templates plus the channel-specific get-*-template APIs for the definitions. Analytics KPIs are only retrievable for the trailing three months, so an export on the last day gets you three months of history and nothing more.",
  },
  {
    q: "Where does Wraps fit?",
    a: "Wraps deploys the SES side of the migration — sending, event tracking, bounce and complaint handling, suppression — into your own AWS account in one command, and adds the contacts, segments, broadcasts, workflows, and analytics that raw SES does not have. It covers email and SMS. It does not cover mobile push or in-app messaging; those stay with AWS End User Messaging.",
  },
];

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((faq) => ({
    "@type": "Question",
    name: faq.q,
    acceptedAnswer: { "@type": "Answer", text: faq.a },
  })),
};

type Fate = "gone" | "moves" | "stays";

const inventory: {
  capability: string;
  fate: Fate;
  detail: string;
}[] = [
  {
    capability: "Pinpoint console",
    fate: "gone",
    detail: `Inaccessible after ${END_OF_SUPPORT}`,
  },
  {
    capability: "Endpoints",
    fate: "gone",
    detail: "Export as an unfiltered segment to S3 before the cutoff",
  },
  {
    capability: "Segments",
    fate: "gone",
    detail: "Definitions retrievable via get-segment until the cutoff",
  },
  {
    capability: "Campaigns",
    fate: "gone",
    detail: "Definitions retrievable via get-campaign until the cutoff",
  },
  {
    capability: "Journeys",
    fate: "gone",
    detail: "Definitions retrievable via get-journey until the cutoff",
  },
  {
    capability: "Analytics & KPIs",
    fate: "gone",
    detail: "Only the trailing 3 months are exportable, at any point",
  },
  {
    capability: "Email sending",
    fate: "moves",
    detail: "AWS recommends Amazon SES",
  },
  {
    capability: "Email deliverability dashboard",
    fate: "moves",
    detail: "SES Virtual Deliverability Manager",
  },
  {
    capability: "Message templates",
    fate: "moves",
    detail: "Handlebars syntax carries over; attribute placeholders change",
  },
  {
    capability: "Event collection / mobile analytics",
    fate: "moves",
    detail: "AWS recommends Amazon Kinesis",
  },
  {
    capability: "SMS & MMS",
    fate: "stays",
    detail: "AWS End User Messaging — API unaffected",
  },
  {
    capability: "Mobile push",
    fate: "stays",
    detail: "AWS End User Messaging — API unaffected",
  },
  {
    capability: "WhatsApp & voice",
    fate: "stays",
    detail: "AWS End User Messaging — API unaffected",
  },
  {
    capability: "OTP & phone number validate",
    fate: "stays",
    detail: "AWS End User Messaging — API unaffected",
  },
];

const fateStyles: Record<Fate, { label: string; className: string }> = {
  gone: {
    label: "Goes away",
    className:
      "bg-red-500/10 text-red-700 dark:bg-red-500/15 dark:text-red-400",
  },
  moves: {
    label: "You rebuild it",
    className:
      "bg-orange-500/10 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400",
  },
  stays: {
    label: "Unaffected",
    className:
      "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  },
};

const pathRows: {
  need: string;
  awsPath: string;
  wrapsPath: string;
}[] = [
  {
    need: "Deliver the email",
    awsPath: "Amazon SES — wire up IAM, config sets, event destinations",
    wrapsPath: "Amazon SES, deployed by one command into your account",
  },
  {
    need: "Know what happened to a message",
    awsPath: "Build EventBridge + SQS + Lambda + a datastore",
    wrapsPath: "Event tracking and per-message history, deployed for you",
  },
  {
    need: "Handle bounces and complaints",
    awsPath: "Build the SNS/EventBridge pipeline and suppression logic",
    wrapsPath: "Automatic, with suppression enforced before the next send",
  },
  {
    need: "Store contacts and attributes",
    awsPath: "Amazon Connect Customer Profiles",
    wrapsPath: "Contacts with typed attributes, unlimited on every plan",
  },
  {
    need: "Segment an audience",
    awsPath: "Amazon Connect Customer Profiles",
    wrapsPath: "Segments in the dashboard or defined in code",
  },
  {
    need: "Send a campaign",
    awsPath: "Amazon Connect outbound campaigns",
    wrapsPath: "Broadcasts through your own SES, on your own domains",
  },
  {
    need: "Run a multi-step journey",
    awsPath: "Amazon Connect campaign orchestration",
    wrapsPath: "Workflows, triggered by events you emit",
  },
  {
    need: "Report on engagement",
    awsPath: "Amazon Kinesis, plus somewhere to put the stream",
    wrapsPath: "Analytics on the events already landing in your account",
  },
  {
    need: "Keep sending SMS and push",
    awsPath: "AWS End User Messaging — no change needed",
    wrapsPath: "SMS via AWS End User Messaging; push is not a Wraps feature",
  },
];

const steps: { title: string; body: React.ReactNode }[] = [
  {
    title: "Export everything, this week",
    body: (
      <>
        Analytics KPIs are only available for the trailing three months, so this
        is the one item with a decaying window. Create a segment with no filters
        and export it to S3 to capture every endpoint, then pull your
        definitions with <code>get-segment</code>, <code>get-campaign</code>,{" "}
        <code>get-journey</code>, and <code>list-templates</code>. Do this
        before you decide anything else.
      </>
    ),
  },
  {
    title: "Separate the email workload from the rest",
    body: (
      <>
        SMS, push, WhatsApp, voice, and OTP are already on AWS End User
        Messaging and need no migration at all. Confirm that, and the problem
        shrinks to email plus whatever engagement logic sat on top of it.
      </>
    ),
  },
  {
    title: "Stand up SES with its supporting stack",
    body: (
      <>
        <code>npx @wraps.dev/cli email init</code> provisions SES, EventBridge,
        Lambda, DynamoDB, SQS, and scoped IAM roles into your AWS account in
        about two minutes. Every resource is namespaced{" "}
        <code>wraps-email-</code>, so if you already have SES identities
        configured, use <code>wraps email connect</code> instead and nothing
        existing is touched.
      </>
    ),
  },
  {
    title: "Get out of the SES sandbox early",
    body: (
      <>
        A new SES account starts in the sandbox and can only send to verified
        addresses. Production access is a support request that can take days and
        is routinely denied on the first try. Start it the day you stand up SES,
        not the week you cut over. Our{" "}
        <Link
          className="text-primary underline"
          href="/docs/guides/production-access"
        >
          production access guide
        </Link>{" "}
        covers what the request needs to say.
      </>
    ),
  },
  {
    title: "Port templates",
    body: (
      <>
        Pinpoint and SES both render Handlebars, so the markup carries over.
        What changes is the placeholder namespace — a Pinpoint template
        referencing <code>{"{{User.UserAttributes.Plan}}"}</code> has to be
        rewritten against whatever attribute shape you land on. If you would
        rather stop hand-editing HTML entirely, Wraps templates are React Email
        components that live in your repo and get reviewed in pull requests.
      </>
    ),
  },
  {
    title: "Rebuild segments, campaigns, and journeys",
    body: (
      <>
        This is the part AWS routes through Amazon Connect. If you are not
        running a contact center, Wraps covers the same ground as contacts,
        segments, broadcasts, and workflows — sending through the SES account
        you just stood up, on your own domains and your own reputation.
      </>
    ),
  },
  {
    title: "Cut over and verify",
    body: (
      <>
        Run both paths in parallel for a sending cycle, compare delivery and
        bounce rates, then retire the Pinpoint application. Give yourself weeks
        of margin: after {END_OF_SUPPORT} there is no console to go back to.
      </>
    ),
  },
];

function daysUntilCutoff(): number {
  // Rendered on the server at build/request time. The cutoff is a real AWS
  // date, so this counts down on its own without anyone editing the page.
  const cutoff = Date.UTC(2026, 9, 30);
  const now = Date.now();
  return Math.max(0, Math.ceil((cutoff - now) / 86_400_000));
}

export default function MigrateFromAmazonPinpointPage() {
  const daysLeft = daysUntilCutoff();

  return (
    <div className="min-h-screen bg-background">
      <LandingNavbar />
      <JsonLd data={breadcrumbSchema} />
      <JsonLd data={articleSchema} />
      <JsonLd data={faqSchema} />

      <main className="container mx-auto px-4 pt-24 pb-16">
        <div className="mx-auto max-w-4xl">
          {/* ================= HERO ================= */}
          <section className="mb-14">
            <SectionKicker>Migration guide</SectionKicker>
            <h1 className="mb-5 font-heading font-semibold text-4xl tracking-tight sm:text-5xl">
              Amazon Pinpoint ends {END_OF_SUPPORT}. Your email moves to Amazon
              SES.
            </h1>
            <p className="mb-4 max-w-2xl text-lg text-muted-foreground">
              AWS is not deprecating a feature — it is turning off the console.
              After {END_OF_SUPPORT} you lose access to your endpoints,
              segments, campaigns, journeys, and analytics. AWS's own
              recommendation for Pinpoint email is{" "}
              <strong className="text-foreground">Amazon SES</strong>.
            </p>
            <p className="max-w-2xl text-lg text-muted-foreground">
              The delivery half of that migration is straightforward. The half
              nobody warns you about is that SES has no contacts, no segments,
              no campaigns, and no journeys — and AWS's answer for those is a
              contact-center product. This page covers both halves.
            </p>

            {daysLeft > 0 && (
              <Card className="mt-8 flex flex-col gap-3 border-orange-500/40 bg-orange-500/[0.04] p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <AlertTriangle
                    aria-hidden="true"
                    className="mt-0.5 size-5 shrink-0 text-orange-600 dark:text-orange-500"
                  />
                  <div>
                    <p className="font-semibold text-foreground">
                      {daysLeft.toLocaleString()} days until Pinpoint stops
                      working
                    </p>
                    <p className="text-muted-foreground text-sm">
                      SES production access alone can take a week. Export your
                      data now, even if you have not chosen a destination.
                    </p>
                  </div>
                </div>
              </Card>
            )}

            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild className="cursor-pointer">
                <Link href="/docs/quickstart/email">
                  Start the SES side
                  <ArrowRight aria-hidden="true" className="ml-1.5 size-4" />
                </Link>
              </Button>
              <Button asChild className="cursor-pointer" variant="outline">
                <Link href="/contact">Talk through your migration</Link>
              </Button>
            </div>
          </section>

          {/* ================= WHAT CHANGES ================= */}
          <section className="mb-16">
            <h2 className="mb-3 font-heading font-semibold text-2xl tracking-tight">
              What actually goes away
            </h2>
            <p className="mb-6 max-w-2xl text-muted-foreground">
              Pinpoint was two products sharing a console: an engagement layer
              and a set of channel APIs. Only one of them is ending. Sorting
              your usage into these three buckets is the first useful thing you
              can do.
            </p>

            <Card className="overflow-hidden py-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-4 text-left font-medium">Capability</th>
                      <th className="p-4 text-left font-medium">Status</th>
                      <th className="p-4 text-left font-medium">
                        What you need to know
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventory.map((row) => {
                      const style = fateStyles[row.fate];
                      return (
                        <tr
                          className="border-b last:border-0"
                          key={row.capability}
                        >
                          <td className="p-4 font-medium text-foreground">
                            {row.capability}
                          </td>
                          <td className="p-4">
                            <span
                              className={`inline-block whitespace-nowrap rounded px-2 py-0.5 font-medium text-xs ${style.className}`}
                            >
                              {style.label}
                            </span>
                          </td>
                          <td className="p-4 text-muted-foreground">
                            {row.detail}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            <p className="mt-4 text-muted-foreground text-sm">
              Source:{" "}
              <a
                className="text-primary underline"
                href="https://docs.aws.amazon.com/pinpoint/latest/userguide/migrate.html"
                rel="noopener noreferrer"
                target="_blank"
              >
                Amazon Pinpoint end of support
              </a>{" "}
              (AWS documentation).
            </p>
          </section>

          {/* ================= THE GAP ================= */}
          <section className="mb-16">
            <h2 className="mb-3 font-heading font-semibold text-2xl tracking-tight">
              AWS's recommended path splits your email stack across three
              services
            </h2>
            <p className="mb-6 max-w-2xl text-muted-foreground">
              Read the guide carefully and the recommendation is: SES for
              delivery, Amazon Connect for segments and campaigns and journeys,
              Kinesis for events. That is coherent if you run agent-assisted
              outbound with predictive dialing. If Pinpoint was how you sent
              onboarding email, you are being asked to adopt a contact center to
              replace a drip sequence.
            </p>

            <Card className="overflow-hidden py-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-4 text-left font-medium">
                        What you need
                      </th>
                      <th className="p-4 text-left font-medium">
                        AWS's recommended path
                      </th>
                      <th className="p-4 text-left font-medium text-primary">
                        With Wraps
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pathRows.map((row) => (
                      <tr className="border-b last:border-0" key={row.need}>
                        <td className="p-4 font-medium text-foreground">
                          {row.need}
                        </td>
                        <td className="p-4 text-muted-foreground">
                          {row.awsPath}
                        </td>
                        <td className="p-4 text-foreground">{row.wrapsPath}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <p className="mt-4 text-muted-foreground text-sm">
              In both columns the mail leaves your own AWS account through your
              own SES identities. Wraps changes what sits around SES, not who
              owns it.
            </p>
          </section>

          {/* ================= HONEST SCOPE ================= */}
          <section className="mb-16">
            <h2 className="mb-3 font-heading font-semibold text-2xl tracking-tight">
              Where Wraps fits — and where it doesn't
            </h2>
            <div className="grid gap-6 sm:grid-cols-2">
              <Card className="p-6">
                <h3 className="mb-4 font-semibold text-foreground">
                  Wraps covers
                </h3>
                <ul className="grid gap-3 text-muted-foreground text-sm">
                  {[
                    "Email delivery through your own Amazon SES",
                    "Per-message event history, bounces, complaints, suppression",
                    "Contacts and typed attributes, unlimited on every plan",
                    "Segments, broadcasts, and multi-step workflows",
                    "Engagement analytics and a dashboard for non-engineers",
                    "SMS through AWS End User Messaging",
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
                  Wraps does not cover
                </h3>
                <ul className="grid gap-3 text-muted-foreground text-sm">
                  {[
                    "Mobile push notifications — stay on AWS End User Messaging",
                    "In-app messaging — no successor in Connect either",
                    "WhatsApp and voice — stay on AWS End User Messaging",
                    "Agent-assisted outbound calling — that is Amazon Connect",
                    "Mobile app analytics — AWS points at Kinesis",
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
            <p className="mt-5 flex items-start gap-2.5 text-muted-foreground text-sm">
              <Minus aria-hidden="true" className="mt-1 size-3.5 shrink-0" />
              <span>
                If Pinpoint was your push and in-app channel, this page only
                solves part of your problem. Those APIs are unaffected by the
                shutdown, so the honest answer is to leave them where they are
                and migrate the email half.
              </span>
            </p>
          </section>

          {/* ================= STEPS ================= */}
          <section className="mb-16">
            <h2 className="mb-3 font-heading font-semibold text-2xl tracking-tight">
              The migration, in order
            </h2>
            <p className="mb-8 max-w-2xl text-muted-foreground">
              The ordering matters more than the effort. Two steps have external
              clocks on them — the analytics export window and SES production
              access — and both are cheap to start today.
            </p>
            <ol className="grid gap-7">
              {steps.map((step, i) => (
                <li className="flex gap-4" key={step.title}>
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted font-mono font-semibold text-foreground text-xs">
                    {i + 1}
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

          {/* ================= COST ================= */}
          <section className="mb-16">
            <h2 className="mb-3 font-heading font-semibold text-2xl tracking-tight">
              What it costs after the move
            </h2>
            <p className="mb-4 max-w-2xl text-muted-foreground">
              Pinpoint billed email at the SES rate, so delivery cost is roughly
              a wash — with one change worth knowing about. Since July 2026 SES
              has pricing plans, and{" "}
              <strong className="text-foreground">
                new accounts are defaulted to Essentials at $0.16 per 1,000
                emails
              </strong>{" "}
              rather than à la carte at $0.10 per 1,000. An account defaulted
              into Essentials can move back to à la carte with immediate effect.
            </p>
            <p className="mb-6 max-w-2xl text-muted-foreground">
              If you are standing up a fresh SES account for this migration, you
              are standing up a defaulted one.{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">
                wraps email plan
              </code>{" "}
              reads which plan each Region is on, models your real volume
              against all four, and switches you back if à la carte is cheaper.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild className="cursor-pointer" variant="outline">
                <Link href="/tools/ses-calculator">
                  Estimate your SES cost
                  <ArrowRight aria-hidden="true" className="ml-1.5 size-4" />
                </Link>
              </Button>
              <Button asChild className="cursor-pointer" variant="outline">
                <Link href="/#pricing">See Wraps pricing</Link>
              </Button>
            </div>
          </section>

          {/* ================= FAQ ================= */}
          <section className="mb-16">
            <h2 className="mb-6 font-heading font-semibold text-2xl tracking-tight">
              Frequently asked questions
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

          {/* ================= CTA ================= */}
          <section className="rounded-xl border border-border bg-muted/30 p-8">
            <h2 className="mb-3 font-heading font-semibold text-2xl tracking-tight">
              Start with the part that has a clock on it
            </h2>
            <p className="mb-6 max-w-2xl text-muted-foreground">
              Export your Pinpoint data, then stand up SES so the production
              access request is already in flight. Both are reversible; waiting
              is not.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild className="cursor-pointer">
                <Link href="/docs/quickstart/email">
                  Deploy SES in 2 minutes
                  <ArrowRight aria-hidden="true" className="ml-1.5 size-4" />
                </Link>
              </Button>
              <Button asChild className="cursor-pointer" variant="outline">
                <Link href="/compare/amazon-ses-vs-wraps">
                  Amazon SES vs Wraps
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
