import { DotPattern } from "@wraps/ui/components/dot-pattern";
import { ClosingPanel } from "@/app/landing/components/closing-panel";
import { FlowBox } from "@/app/landing/components/flow-primitives";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { Band, SectionHead } from "@/app/landing/components/page-band";
import { SectionKicker } from "@/app/landing/components/section-kicker";
import { AWS_PRICING, formatCurrency, getTier } from "@/config/pricing";
import { SES_PLANS } from "@/lib/ses-cost";
import {
  OperatorsClosingActions,
  OperatorsHeroCTA,
} from "./components/operators-ctas";
import { SendLedger } from "./components/send-ledger";

const pro = getTier("pro");
const business = getTier("business");

const PREFLIGHT = [
  {
    title: "See the count before you commit",
    body: "Pick all contacts, a topic or a segment, and the audience resolves to a number you can look at. The confirmation dialog repeats it before anything leaves.",
  },
  {
    title: "Preview against real contacts",
    body: "The preview carousel renders the template with real sample recipients, so a broken variable shows up as a blank greeting here instead of in someone's inbox.",
  },
  {
    title: "Send a test first",
    body: "A test send renders the template with a sample contact. The unsubscribe and preference links are placeholders in it, and the composer tells you so. They resolve per recipient in the real broadcast.",
  },
  {
    title: "Watch it drain",
    body: "Progress refreshes every five seconds while the broadcast processes. You are not reading a spinner and hoping.",
  },
  {
    title: "Cancel mid-flight",
    body: "Queued, scheduled and in-progress broadcasts can be cancelled. The send you caught at 20% is 80% of a problem you no longer have.",
  },
];

const CONSENT = [
  {
    question: "Did they say yes?",
    answer:
      "Topics carry double opt-in. The confirmation email goes out from a sender you verify, and the contact is not subscribed until they click the link.",
  },
  {
    question: "When, and to what exactly?",
    answer:
      "Subscriptions are per topic, with a confirmation timestamp. Product news and billing alerts are separate consents, not one blanket list.",
  },
  {
    question: "Can they change it without emailing you?",
    answer:
      "Broadcasts and automations fill in a per-recipient link to a hosted preference center for your template footer. It opens by signed link only. They pick topics themselves, and you never process the request by hand.",
  },
  {
    question: "Did the unsubscribe actually take?",
    answer: "Status changes at the contact, not at the campaign.",
  },
];

const FILTERS: [string, string][] = [
  ["Email status", "active, unsubscribed, bounced, complained"],
  ["Last activity", "within, before, after, exists"],
  ["Last email sent, opened, clicked", "date comparisons"],
  ["Emails sent, opened, clicked", "numeric thresholds"],
  ["Topic subscription", "is subscribed to, is not"],
  ["Confirmed date", "exists, within"],
  ["Custom property", "equals, contains, exists"],
  ["Partition", "deterministic cohort split"],
];

const ARTIFACTS = [
  {
    label: "Where it went",
    title: "Where the send went",
    body: "A Sankey diagram traces sent, delivered, opened and clicked for a broadcast, broken out per destination URL, next to a funnel with the conversion rate at each step.",
  },
  {
    label: "Why it didn't land",
    title: "Why it didn't land",
    body: "Bounces separate hard from soft, and complaints are counted on their own, each with its own breakdown. The two numbers AWS judges your sending on don't have to be worked out from a total.",
  },
  {
    label: "One message",
    title: "What happened to one message",
    body: "Search down to a single send and read its event timeline in order. Known scanner and bot opens are filtered out of engagement metrics, so your open rate isn't inflated by a mail scanner.",
  },
  {
    label: "Who changed what",
    title: "Who changed what",
    body: `Audit logs capture the changes behind the send: who edited the template, who cancelled the broadcast, who unsubscribed a contact by hand. Audit logs are on ${business.name}, with CSV export.`,
  },
];

const HISTORY: [string, string][] = [
  [getTier("free").name, getTier("free").limits.historyDisplay],
  [pro.name, pro.limits.historyDisplay],
  [business.name, business.limits.historyDisplay],
];

const OWNERSHIP = [
  {
    label: "If you stop paying us",
    title: "Your app's emails keep going out",
    body: "The SES configuration, the domain identity and the event pipeline live in your account. Cancelling Wraps costs you the dashboard, workflows and platform tooling. Broadcasts and automations stop.",
  },
  {
    label: "From your terminal",
    title: "Audit the sending setup",
    body: "wraps email check reads DKIM, SPF and DMARC on a domain and checks it against public blocklists. No signup and no dashboard, before or after you're a customer.",
  },
  {
    label: "AWS pricing plan",
    title: "Know which plan you're on",
    body: `New AWS accounts are put on the Essentials plan at $${SES_PLANS.essentials.perThousandEmails.toFixed(2)} per 1,000 emails rather than à la carte at $${SES_PLANS.alacarte.perThousandEmails.toFixed(2)}. wraps email plan reads the plan per region and can move you back.`,
  },
];

export function OperatorsPageContent() {
  return (
    <div className="min-h-screen bg-background">
      <LandingNavbar />
      <main>
        <section className="relative overflow-hidden pt-20 pb-16 sm:pt-28">
          <div className="absolute inset-0">
            <DotPattern className="opacity-100" fadeStyle="ellipse" size="md" />
          </div>
          <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-14">
              <div>
                <SectionKicker>For email operations</SectionKicker>
                <h1 className="mb-6 text-pretty font-heading font-semibold text-4xl leading-tight tracking-tight sm:text-5xl">
                  Your name is on the send.{" "}
                  <span className="text-brand-text">
                    So is the paper trail.
                  </span>
                </h1>
                <p className="mb-6 max-w-md text-lg text-muted-foreground">
                  Somebody has to answer for the complaint rate, prove that the
                  person who unsubscribed stopped getting mail, and say what
                  happened to one specific message. Wraps keeps that record, and
                  the sending domain it describes stays in your AWS account.
                </p>
                <OperatorsHeroCTA />
              </div>
              <SendLedger />
            </div>
          </div>
        </section>

        <Band id="before" sunken>
          <SectionHead
            body="Wrong list, unrendered variable, dead unsubscribe link. Every one is catchable before the first message goes out, and the composer makes you walk past the catch."
            kicker="Before the send"
            title="The expensive mistakes happen in the last thirty seconds."
          />
          <ol className="grid gap-x-6 gap-y-8 md:grid-cols-2 lg:grid-cols-3">
            {PREFLIGHT.map((step, index) => (
              <li key={step.title}>
                <FlowBox className="h-full" label={`Step ${index + 1}`}>
                  <h3 className="mb-1 font-heading font-semibold text-lg">
                    {step.title}
                  </h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {step.body}
                  </p>
                </FlowBox>
              </li>
            ))}
          </ol>
          <p className="mt-6 max-w-3xl text-muted-foreground text-sm">
            Scheduling is on Pro, at {formatCurrency(pro.price)} a month.
          </p>
        </Band>

        <Band id="consent">
          <SectionHead
            body="The four questions that arrive together, usually from legal, usually about one person, usually on a Friday."
            kicker="Consent"
            title="Consent is a record you can produce, not a checkbox you remember."
          />
          <dl className="grid gap-x-6 gap-y-8 md:grid-cols-2">
            {CONSENT.map(({ question, answer }) => (
              <FlowBox key={question} label="Consent">
                <dt className="mb-1 font-heading font-semibold text-lg">
                  {question}
                </dt>
                <dd className="text-muted-foreground leading-relaxed">
                  {answer}
                </dd>
              </FlowBox>
            ))}
          </dl>
          <p className="mt-6 max-w-3xl text-muted-foreground text-sm">
            Topics, double opt-in and the preference center are on Pro. Contacts
            are unlimited on every plan.
          </p>
        </Band>

        <Band id="targeting" sunken>
          <div className="grid items-start gap-12 lg:grid-cols-2 lg:gap-16">
            <div>
              <SectionKicker>Targeting</SectionKicker>
              <h2 className="mb-3 text-balance font-heading font-semibold text-3xl tracking-tight sm:text-4xl">
                Marketing uses segments to include. You use them to exclude.
              </h2>
              <p className="mb-5 text-lg text-muted-foreground">
                The same builder, pointed the other way. Conditions nest in
                AND/OR groups, so "engaged in the last 90 days, minus anyone we
                already mailed this week, minus the ones who never confirmed" is
                one saved definition instead of a rule nobody wrote down.
              </p>
              <p className="mb-5 text-muted-foreground leading-relaxed">
                Every segment previews to a count and a sample of matching
                addresses before you save it. Definitions resolve at send time
                instead of freezing a list that quietly rots. A partition filter
                splits a large audience into even cohorts, for when you want to
                ramp a domain instead of hitting it all at once.
              </p>
              <p className="border-brand/40 border-l-2 pl-4 text-muted-foreground leading-relaxed">
                When a segment is deleted or its filters no longer compile,
                recipient selection fails closed. The send resolves to nobody,
                not to everybody. The worst outcome is a broadcast that didn't
                go out.
              </p>
            </div>
            <FlowBox label="Filters available">
              <ul className="grid gap-3 text-sm">
                {FILTERS.map(([field, ops]) => (
                  <li className="flex flex-col gap-0.5" key={field}>
                    <span className="font-medium text-foreground">{field}</span>
                    <span className="text-muted-foreground">{ops}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 border-border/60 border-t pt-3 text-muted-foreground text-xs leading-relaxed">
                Segments are on Pro, including filters on whether a contact has
                triggered a given event, and within what window.
              </p>
            </FlowBox>
          </div>
        </Band>

        <Band id="after">
          <SectionHead
            body="Every incident review asks the same things. None of them should need a support ticket."
            kicker="After the send"
            title="Four questions, four artifacts."
          />
          <div className="mb-8 grid gap-x-6 gap-y-8 md:grid-cols-2">
            {ARTIFACTS.map((item) => (
              <FlowBox key={item.title} label={item.label}>
                <h3 className="mb-1 font-heading font-semibold text-lg">
                  {item.title}
                </h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {item.body}
                </p>
              </FlowBox>
            ))}
          </div>
          <FlowBox label="How far back the dashboard reads">
            <ul className="mb-3 flex flex-wrap gap-x-8 gap-y-2 text-sm">
              {HISTORY.map(([plan, window]) => (
                <li className="flex items-baseline gap-2" key={plan}>
                  <span className="text-muted-foreground">{plan}</span>
                  <span className="font-semibold text-foreground">
                    {window}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground text-xs leading-relaxed">
              That window is what the dashboard shows. The same events are also
              delivered by EventBridge into a DynamoDB table in your own AWS
              account, where the rule and the table are yours, so keeping a
              longer history than your plan shows is something you can set up
              without asking us.
            </p>
          </FlowBox>
        </Band>

        <Band id="ownership" sunken>
          <SectionHead
            body={
              <>
                Wraps sends through your Amazon SES, in your AWS account, on
                your verified domain. The complaint rate is yours to manage. AWS
                sends from shared IP pools by default, and a dedicated IP is{" "}
                {formatCurrency(AWS_PRICING.dedicatedIpMonthly)} a month if you
                want full control of its reputation.
              </>
            }
            kicker="Your account"
            title="Sending runs in your AWS account."
          />
          <div className="grid gap-x-6 gap-y-8 md:grid-cols-3">
            {OWNERSHIP.map((item, index) => (
              <FlowBox dashed={index === 0} key={item.title} label={item.label}>
                <h3 className="mb-1 font-heading font-semibold text-lg">
                  {item.title}
                </h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {item.body}
                </p>
              </FlowBox>
            ))}
          </div>
        </Band>

        <ClosingPanel
          actions={<OperatorsClosingActions />}
          body={`Segments, topics and scheduled broadcasts are on Pro, ${formatCurrency(pro.price)} a month. Contacts are unlimited on every plan.`}
          title="Know what happened to every send."
        />
      </main>
      <LandingFooter />
    </div>
  );
}
