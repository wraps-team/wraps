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

const TITLE = "Migrate from SendGrid to Amazon SES";
const DESCRIPTION =
  "A SendGrid-to-SES migration in the order it has to happen: subusers onto SES tenants, Inbound Parse, dynamic templates, the unsubscribe groups SES has no slot for, and the production-access request that decides your timeline.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "migrate from sendgrid to ses",
    "sendgrid to amazon ses",
    "sendgrid migration guide",
    "sendgrid subuser alternative",
    "sendgrid inbound parse ses",
    "leave sendgrid",
  ],
  openGraph: {
    title: `${TITLE} | Wraps`,
    description: DESCRIPTION,
    url: "https://wraps.dev/migrate/sendgrid",
    type: "article",
  },
  twitter: {
    card: "summary_large_image",
    title: `${TITLE} | Wraps`,
    description: DESCRIPTION,
  },
  alternates: {
    canonical: "https://wraps.dev/migrate/sendgrid",
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
      name: "SendGrid",
      item: "https://wraps.dev/migrate/sendgrid",
    },
  ],
};

// Steps are the HowTo. Keep this derived from the `steps` array below so the
// structured data cannot drift away from what the page actually tells you.
const steps: { title: string; body: React.ReactNode; plain: string }[] = [
  {
    title: "Map your subusers onto SES tenants before anything else",
    plain:
      "SES tenants are the subuser equivalent. Create one tenant per subuser, associate the identity and configuration set it sends through, and pass the tenant name on every send, because this decision shapes every later step.",
    body: (
      <>
        If you send on behalf of customers through SendGrid subusers, this is
        the step that decides whether the migration takes a week or a quarter.
        The shape that matches is an SES tenant. Create one per subuser,
        associate the identity and configuration set it sends through, then name
        the tenant on the send — the <code>X-SES-TENANT</code> header over SMTP,{" "}
        <code>TenantName</code> on SESv2. Each tenant reports its own bounce and
        complaint rates, can carry its own suppression list and IP pool, and a
        reputation policy can pause that tenant on its own rather than stopping
        the account. Two things do not carry over. Tenants are a paid SES
        add-on, not something the account has by default, and every tenant's
        numbers still sum into the account-wide rate AWS enforces on. Isolation
        here buys a smaller blast radius, not a separate reputation.
      </>
    ),
  },
  {
    title: "Export the suppression data while you still have a login",
    plain:
      "Export global unsubscribes, group unsubscribes, bounces, and spam reports from SendGrid as CSV before you touch DNS.",
    body: (
      <>
        Global unsubscribes, group unsubscribes, bounces, blocks, and spam
        reports each export as CSV from the Suppressions area. Take all of them.
        Re-mailing someone who unsubscribed is a compliance problem, not an
        inconvenience, and SendGrid does not hand this back after you close the
        account.
      </>
    ),
  },
  {
    title: "Verify the domain in SES and open production access",
    plain:
      "Verify your sending domain in SES, publish the DKIM CNAMEs, and file the production access request the same day.",
    body: (
      <>
        Verify the domain in the SES Region you intend to send from and publish
        the three DKIM CNAMEs SES gives you. Then file the production access
        request immediately, before the code work starts. A new SES account is
        sandboxed to verified addresses, AWS typically answers within a day and
        longer if it comes back with questions, and it can be refused. Our{" "}
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
        cover what the request has to say to get approved on the first try.
      </>
    ),
  },
  {
    title: "Publish DNS for both senders at once",
    plain:
      "Add the SES DKIM records alongside SendGrid's, and add amazonses.com to SPF without removing the SendGrid include yet.",
    body: (
      <>
        Add the SES records next to the SendGrid ones rather than replacing
        them. In practice that means adding <code>include:amazonses.com</code>{" "}
        to your SPF record while <code>include:sendgrid.net</code> is still
        there, and leaving the <code>s1._domainkey</code> and{" "}
        <code>s2._domainkey</code> CNAMEs alone. DMARC needs no change at all —
        the policy is about alignment, not about who sends. If you use SendGrid
        link branding, the click-tracking CNAME is the one record you cannot run
        in parallel; point it last.
      </>
    ),
  },
  {
    title: "Rewrite dynamic templates",
    plain:
      "SendGrid dynamic templates are Handlebars stored in SendGrid and export one at a time. Rebuild them where your code lives.",
    body: (
      <>
        Dynamic templates are Handlebars documents living in SendGrid's editor,
        and the export is one template at a time. There is no bulk download.
        Budget real hours here if you have dozens. Wraps templates are React
        Email components that sit in your repository and get reviewed in pull
        requests, which is a different working model, not a converter — nothing
        automatically translates <code>{"{{#if}}"}</code> blocks for you.
      </>
    ),
  },
  {
    title: "Swap the send call and the event consumer",
    plain:
      "Replace sgMail.send() calls with the new client, and re-point whatever consumes SendGrid Event Webhook payloads.",
    body: (
      <>
        Every <code>sgMail.send()</code> call needs a new client. The larger job
        is usually downstream: anything consuming the SendGrid Event Webhook is
        reading SendGrid's JSON shape, and SES emits its own event shape through
        EventBridge. The fields map cleanly enough — delivered, bounce,
        complaint, open, click — but the payload is not drop-in.
      </>
    ),
  },
  {
    title: "Split traffic, then cut over",
    plain:
      "Send a percentage through SES for one to two weeks, compare bounce and complaint rates, then remove the SendGrid SPF include.",
    body: (
      <>
        Route a slice of production traffic through SES for a week or two and
        watch bounce and complaint rates against the SendGrid baseline you
        already have. When the numbers match, drop{" "}
        <code>include:sendgrid.net</code> from SPF and remove the SendGrid DKIM
        CNAMEs. Cancel the account last: a suspended SendGrid account keeps
        billing until it is explicitly cancelled.
      </>
    ),
  },
];

const faqs = [
  {
    q: "What replaces SendGrid subusers in Amazon SES?",
    a: "SES tenants. A tenant owns its identities, configuration sets, and templates, reports its own bounce and complaint rates, and can hold its own suppression list and IP pool. Reputation policies pause a single tenant on a threshold breach and leave the others sending. The default ceiling is 10,000 tenants per account per Region and AWS raises it on request. Two differences are worth planning around: tenants are a paid SES add-on, and each tenant's rates still roll up into the account-wide number AWS enforces on.",
  },
  {
    q: "Does SES have an equivalent of Inbound Parse?",
    a: "SES email receiving is the closest thing, and it is not the same shape. Inbound Parse POSTs a parsed multipart body to your URL. SES receipt rules take delivery of the raw message and hand it to S3, SNS, or Lambda, and you do the MIME parsing yourself. SES email receiving is also only offered in a subset of Regions, so check yours before you plan around it.",
  },
  {
    q: "Do I lose my sender reputation when I leave SendGrid?",
    a: "You keep the domain half and lose the IP half. Mailbox providers score the domain, and that history travels with you. If you were on a SendGrid dedicated IP, that IP is SendGrid's and its warmth does not come with you. Starting on the SES shared pool is usually the right move rather than buying a dedicated IP and warming it from cold.",
  },
  {
    q: "What happens to my Marketing Campaigns automations?",
    a: "They do not move. Marketing Campaigns is priced and built as its own product, and its automations, segments, and sign-up forms have no export path into anything else. If those are load-bearing for you, rebuilding them is the migration, and the sending swap is the easy part.",
  },
  {
    q: "How long does the whole thing take?",
    a: "For a single-domain transactional sender with a handful of templates, a working day of code, plus the wait on SES production access — usually an AWS answer inside a day, longer if they ask for more detail — plus a week or two of parallel running. Multi-tenant senders on subusers, and anyone with a large Marketing Campaigns footprint, should plan in weeks.",
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

const surfaces: { surface: string; sendgrid: string; ses: string }[] = [
  {
    surface: "Send call",
    sendgrid: "@sendgrid/mail, or SMTP relay on smtp.sendgrid.net",
    ses: "SESv2 SendEmail, or SMTP on the Region's SES endpoint",
  },
  {
    surface: "Templates",
    sendgrid: "Dynamic templates, Handlebars, edited and stored in SendGrid",
    ses: "SES templates, or render in your own code before sending",
  },
  {
    surface: "Events",
    sendgrid: "Event Webhook, HTTP POST of a batched JSON array",
    ses: "EventBridge or SNS, one event per message, your consumer",
  },
  {
    surface: "Suppression",
    sendgrid: "Global list, plus unsubscribe groups per category",
    ses: "One account-level list holding bounces and complaints only",
  },
  {
    surface: "Inbound",
    sendgrid: "Inbound Parse, parsed body POSTed to your URL",
    ses: "Receipt rules to S3, SNS, or Lambda, in some Regions only",
  },
  {
    surface: "Tenant isolation",
    sendgrid: "Subusers with their own credentials, IPs, and reputation",
    ses: "Tenants, with their own credentials, IP pool, and suppression list",
  },
  {
    surface: "Reputation signal",
    sendgrid: "Per-subuser stats, and the shared or dedicated IP pool",
    ses: "Per-tenant rates that still sum into the account-wide one",
  },
  {
    surface: "Marketing side",
    sendgrid: "Marketing Campaigns, priced as its own plan",
    ses: "Not offered — SES sends what you tell it to send",
  },
];

const losses = [
  "Marketing Campaigns. The automations, segments, and sign-up forms are a separate SendGrid product with no export path into anything else.",
  "Unsubscribe groups. The SES suppression list holds bounces and complaints, and has no concept of a per-category opt-out.",
  "Inbound Parse. SES receipt rules deliver raw MIME, are Region-limited, and leave the parsing to you.",
  "The Design Editor. There is no drag-and-drop template builder anywhere in SES.",
  "Account-wide safety margin. AWS watches your bounce and complaint rate across the whole account and can pause sending on it, and per-tenant rates still sum into that number.",
  "First-try approval. SES production access is an application AWS reviews, and refusals on a thin application are common.",
];

export default function MigrateFromSendGridPage() {
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
              Migrate from SendGrid to Amazon SES
            </h1>
            <p className="mb-4 max-w-2xl text-lg text-muted-foreground">
              The sending swap is an afternoon. What makes this migration hard
              is everything SendGrid does that is not sending: unsubscribe
              groups, Inbound Parse, and the Marketing Campaigns side. Subusers
              map onto SES tenants. Those three map onto nothing.
            </p>
            <p className="max-w-2xl text-lg text-muted-foreground">
              This page is the order of operations, the surfaces that have no
              SES equivalent, and an honest read on who should not do this at
              all.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild className="cursor-pointer">
                <Link href="/docs/quickstart/email">
                  Stand up SES
                  <ArrowRight aria-hidden="true" className="ml-1.5 size-4" />
                </Link>
              </Button>
              <Button asChild className="cursor-pointer" variant="outline">
                <Link href="/compare/sendgrid-vs-wraps">
                  SendGrid vs Wraps, side by side
                </Link>
              </Button>
            </div>
          </section>

          <section className="mb-16">
            <h2 className="mb-3 font-heading font-semibold text-2xl tracking-tight">
              Who should stay on SendGrid
            </h2>
            <p className="mb-6 max-w-2xl text-muted-foreground">
              Four situations where the move costs more than it returns, and
              saying so is cheaper for both of us than a bounced migration.
            </p>
            <Card className="p-6">
              <ul className="grid gap-3.5 text-muted-foreground text-sm">
                {[
                  "Inbound Parse is a product feature and not a convenience. SES email receiving runs in a handful of Regions, hands you raw MIME in S3, and the parser becomes yours to write and keep running.",
                  "Marketing Campaigns is where your automations, segments, and sign-up forms live. None of that exports.",
                  "You are on a Twilio enterprise agreement and email is one line on it. Procurement will cost more than the sending does.",
                  "You have no one who wants to own an AWS account. SES production access, bounce-rate thresholds, and Region choices are now your job.",
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
              The people this migration serves well are transactional senders
              with one or two domains, a codebase they control, and a bill that
              has grown faster than their send volume.
            </p>
          </section>

          <section className="mb-16">
            <h2 className="mb-3 font-heading font-semibold text-2xl tracking-tight">
              Surface by surface, what actually changes
            </h2>
            <p className="mb-6 max-w-2xl text-muted-foreground">
              Read the last three rows first. Those are the ones that turn a
              migration into a project.
            </p>
            <Card className="overflow-hidden py-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-4 text-left font-medium">Surface</th>
                      <th className="p-4 text-left font-medium">On SendGrid</th>
                      <th className="p-4 text-left font-medium">On SES</th>
                    </tr>
                  </thead>
                  <tbody>
                    {surfaces.map((row) => (
                      <tr className="border-b last:border-0" key={row.surface}>
                        <td className="p-4 font-medium text-foreground">
                          {row.surface}
                        </td>
                        <td className="p-4 text-muted-foreground">
                          {row.sendgrid}
                        </td>
                        <td className="p-4 text-muted-foreground">{row.ses}</td>
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
              Two steps have clocks on them that you do not control: SES
              production access, and DNS propagation. Both are free to start on
              day one, so start them on day one.
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
              SES is cheaper because it is less product. Six things go away the
              day you cut over, and no tool on top of SES puts the first three
              back.
            </p>
            <Card className="p-6">
              <ul className="grid gap-3.5 text-muted-foreground text-sm">
                {losses.map((item) => (
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
              What the two of them cost
            </h2>
            <div className="grid gap-6 sm:grid-cols-2">
              <Card className="p-6">
                <h3 className="mb-2 font-semibold text-foreground">SendGrid</h3>
                <p className="text-muted-foreground text-sm leading-[1.6]">
                  {VENDORS.sendgrid.pricing}
                </p>
                <p className="mt-3 text-muted-foreground text-sm leading-[1.6]">
                  {VENDORS.sendgrid.watchOut}
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
              Prices are what each vendor publishes, verified August 2026. Put
              your own volume through the{" "}
              <Link
                className="text-primary underline"
                href="/tools/ses-calculator"
              >
                SES calculator
              </Link>{" "}
              rather than trusting a ratio from a comparison page, ours
              included.
            </p>
          </section>

          <section className="mb-16">
            <h2 className="mb-3 font-heading font-semibold text-2xl tracking-tight">
              Where Wraps fits
            </h2>
            <p className="mb-5 max-w-2xl text-muted-foreground">
              Steps three, four, and six above are the ones people abandon on.
              Wraps is the tool for those, and it changes nothing about who owns
              the mail.
            </p>
            <div className="grid gap-6 sm:grid-cols-2">
              <Card className="p-6">
                <h3 className="mb-4 font-semibold text-foreground">
                  What it does
                </h3>
                <ul className="grid gap-3 text-muted-foreground text-sm">
                  {[
                    "wraps email init deploys SES, EventBridge, SQS, Lambda, DynamoDB and scoped IAM roles into your AWS account",
                    "wraps email connect adopts SES identities you already have, without touching them",
                    "Every resource is namespaced wraps-email-, so nothing existing is modified",
                    "Bounce and complaint handling, suppression enforcement, and a per-message event history",
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
                    "It does not manage SES tenants. You configure those against SES directly.",
                    "It does not do inbound email parsing.",
                    "It does not get you production access — that approval is AWS's, usually answered within a day, and refusable.",
                    "Contacts, templates, and workflow state live in our database, not your AWS. Only sending data and delivery events land in your account.",
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
              Start with the request AWS has to approve
            </h2>
            <p className="mb-6 max-w-2xl text-muted-foreground">
              Verify the domain and file for production access first. Everything
              else on this page is work you control; that one is a queue you
              wait in.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild className="cursor-pointer">
                <Link href="/docs/quickstart/email">
                  Deploy SES with one command
                  <ArrowRight aria-hidden="true" className="ml-1.5 size-4" />
                </Link>
              </Button>
              <Button asChild className="cursor-pointer" variant="outline">
                <Link href="/alternatives/sendgrid">
                  Other SendGrid alternatives
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
