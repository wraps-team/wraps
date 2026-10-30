import type { Metadata } from "next";
import Link from "next/link";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { SectionKicker } from "@/app/landing/components/section-kicker";
import { CopyLinkButton } from "./components/copy-link-button";
import { FaqSection } from "./components/faq-section";

/*
 * The forwardable page. Its reader is not the engineer who found Wraps — it is
 * the person that engineer has to convince, who will never run `email init` and
 * whose job is to find the reason not to.
 *
 * So it argues on risk, cost and exit, in that order, and it states our limits
 * before the reviewer finds them. The landing page carries the insight and
 * /approaches carries the market rubric; neither belongs here again.
 */

export const metadata: Metadata = {
  title: "Why Wraps — the evaluation guide you can forward",
  description:
    "What Wraps reduces, what it costs all in, what happens to your infrastructure if we disappear, and the questions a security review will ask — including the ones we fail.",
  openGraph: {
    title: "Why Wraps | Wraps",
    description:
      "What Wraps reduces, what it costs all in, what happens if we disappear, and the questions a security review will ask — including the ones we fail.",
  },
  twitter: {
    title: "Why Wraps | Wraps",
    description:
      "What Wraps reduces, what it costs all in, what happens if we disappear, and the questions a security review will ask — including the ones we fail.",
  },
  alternates: {
    canonical: "https://wraps.dev/why-wraps",
  },
};

/*
 * The risk register. Every row names AWS's own enforcement number, what Wraps
 * does about it, and what Wraps cannot do — the last column is the reason the
 * table is worth forwarding. A row without a real limit would be marketing.
 */
const riskRegister = [
  {
    risk: "Bounce rate climbs",
    awsLine: "AWS can open a manual review above 5% and pause sending at 10%",
    wraps:
      "Bounces are suppressed on the way in from the first send. The rate is drawn against both lines on the dashboard and swept hourly.",
    limit: "Reverse a pause AWS has already applied.",
  },
  {
    risk: "Complaint rate climbs",
    awsLine: "Review above 0.1%, sending can be paused at 0.5%",
    wraps:
      "Complaints feed the same suppression path, and the rate carries the same two lines and the same hourly sweep.",
    limit: "Stop recipients marking mail as spam.",
  },
  {
    risk: "The account cannot send at all",
    awsLine: "New accounts reach verified recipients only, until AWS approves",
    wraps:
      "Sandbox is detected at the end of a deploy and explained, with the request linked, rather than discovered from a failed send.",
    limit: "Approve the request. Only AWS can, from your account.",
  },
  {
    risk: "The daily quota runs out mid-campaign",
    awsLine: "AWS sets a rolling 24-hour send quota per account",
    wraps: "Usage is shown against the quota with a warning line at 80%.",
    limit: "Raise the quota.",
  },
  {
    risk: "Domain authentication drifts and mail lands in spam",
    awsLine: "No AWS alert — you find out from a customer",
    wraps:
      "An on-demand audit covers DKIM, SPF, DMARC, MX and TLS, BIMI, and public blacklists.",
    limit: "Guarantee inbox placement. Nobody can.",
  },
];

const planRows = [
  {
    plan: "Free",
    price: "$0",
    forWho: "One AWS account, 30 days of history. Most first deploys.",
  },
  {
    plan: "Pro",
    price: "$29/mo",
    forWho: "One AWS account, 90 days of history, email support.",
  },
  {
    plan: "Business",
    price: "$199/mo",
    forWho:
      "Unlimited AWS accounts, 365 days of history, SSO and SCIM, audit log with CSV export, priority SLA.",
  },
];

const exitPoints = [
  {
    title: "The infrastructure is already yours",
    body: "SES identities, Lambdas, EventBridge rules and DynamoDB tables are created in your AWS account, namespaced wraps-email-*, and none of them call us to keep working. Stop paying and mail keeps sending.",
  },
  {
    title: "Our access is a role you delete",
    body: "Wraps assumes an IAM role with an external ID. No access keys exist on our side, so revoking access is a change you make in your own account without involving us.",
  },
  {
    title: "The code outlives the company",
    body: "The platform is AGPL-3.0, with an enterprise kernel under a separate licence, and the SDKs are MIT. If Wraps disappears, the thing you deployed is still a fork you can run.",
  },
  {
    title: "What you would lose, stated plainly",
    body: "The dashboard, and everything that lives in our database rather than yours: contacts, templates, broadcasts, workflows, and the per-message send records that drive the dashboard list and analytics. Export them before you go. The SES infrastructure and the event history in your own DynamoDB stay where they are.",
  },
];

const badFit = [
  "You have no AWS account and no appetite for one. Everything on this page depends on holding one, so a hosted sending API is the right shape for you.",
  "Your review requires SOC 2, HIPAA or a BAA today. We have none of them.",
  "You expect to be refused SES production access. Wraps cannot change that outcome, and a sandboxed account sends to nobody.",
  "Your stack is not TypeScript or Python. Those are the SDKs that exist.",
  "A non-engineer needs to own email day to day. A marketing platform will fit their hands better than ours will.",
  "You are shopping purely on price below about 100,000 emails a month. The gap at that volume is small enough that it should not be the deciding factor.",
];

export default function WhyWrapsPage() {
  return (
    <div className="min-h-screen bg-background">
      <LandingNavbar />
      <main className="container mx-auto px-4 pt-24 pb-12">
        <div className="mx-auto max-w-4xl">
          <div className="mb-14">
            <SectionKicker>Wraps · Evaluation guide</SectionKicker>
            <h1 className="mb-4 font-heading font-semibold text-4xl tracking-tight">
              Why Wraps
            </h1>
            <p className="max-w-2xl text-lg text-muted-foreground">
              Written to be forwarded. If you are the person being asked to
              approve this, the sections below are the risk it reduces, what it
              costs in total, what happens to your infrastructure if we
              disappear, and the questions your review will raise — including
              the ones where our answer is no.
            </p>
            <CopyLinkButton />
          </div>

          {/* 01 — risk */}
          <section className="mb-16">
            <div className="mb-3 flex items-baseline gap-3">
              <span className="font-mono text-brand-text text-xs">01</span>
              <h2 className="font-heading font-semibold text-2xl tracking-tight">
                What you are actually buying down
              </h2>
            </div>
            <p className="mb-7 max-w-2xl text-muted-foreground">
              Not a cheaper send. The failure mode that costs a company real
              money is Amazon switching the account off, and every number in the
              second column is AWS's, not ours.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left">
                <thead>
                  <tr>
                    {[
                      "Risk",
                      "AWS's line",
                      "What Wraps does",
                      "What it cannot do",
                    ].map((h) => (
                      <th
                        className="border-border border-b px-3 py-3 font-mono font-medium text-muted-foreground text-xs uppercase tracking-widest"
                        key={h}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {riskRegister.map((row) => (
                    <tr key={row.risk}>
                      <td className="border-border border-b px-3 py-4 align-top font-medium text-foreground text-sm">
                        {row.risk}
                      </td>
                      <td className="border-border border-b px-3 py-4 align-top text-muted-foreground text-sm">
                        {row.awsLine}
                      </td>
                      <td className="border-border border-b px-3 py-4 align-top text-foreground/90 text-sm">
                        {row.wraps}
                      </td>
                      <td className="border-border border-b px-3 py-4 align-top text-muted-foreground text-sm">
                        {row.limit}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* 02 — cost */}
          <section className="mb-16">
            <div className="mb-3 flex items-baseline gap-3">
              <span className="font-mono text-brand-text text-xs">02</span>
              <h2 className="font-heading font-semibold text-2xl tracking-tight">
                What it costs, all in
              </h2>
            </div>
            <p className="mb-7 max-w-2xl text-muted-foreground">
              Two lines on two invoices. A flat platform fee from us, and AWS
              billing you directly for the sending at{" "}
              <strong className="text-foreground">
                $0.10 per 1,000 emails
              </strong>{" "}
              on à la carte, or $0.16 on the Essentials plan new AWS accounts
              default to. There is no per-seat, per-contact or per-send meter on
              any tier.
            </p>

            <dl className="space-y-4">
              {planRows.map((row) => (
                <div
                  className="grid gap-1 border-border border-t pt-4 sm:grid-cols-[8rem_1fr]"
                  key={row.plan}
                >
                  <dt className="font-semibold text-foreground text-sm">
                    {row.plan}
                    <span className="ml-2 font-mono font-normal text-muted-foreground">
                      {row.price}
                    </span>
                  </dt>
                  <dd className="text-muted-foreground text-sm leading-relaxed">
                    {row.forWho}
                  </dd>
                </div>
              ))}
            </dl>

            <p className="mt-7 max-w-2xl text-muted-foreground text-sm leading-relaxed">
              Where the money actually moves: against a contact-priced marketing
              platform the gap is large immediately and widens with the list.
              Against a hosted sending API it is small under roughly 100,000
              emails a month and grows from there. Either way the platform fee
              stays flat while theirs scales, which is the part that compounds.
            </p>
          </section>

          {/* 03 — exit */}
          <section className="mb-16">
            <div className="mb-3 flex items-baseline gap-3">
              <span className="font-mono text-brand-text text-xs">03</span>
              <h2 className="font-heading font-semibold text-2xl tracking-tight">
                What happens if Wraps goes away
              </h2>
            </div>
            <p className="mb-7 max-w-2xl text-muted-foreground">
              The question a careful reviewer asks about any vendor in the send
              path. Here it has a mechanical answer rather than a reassuring
              one.
            </p>

            <div className="grid gap-6 sm:grid-cols-2">
              {exitPoints.map((point) => (
                <div className="border-border border-t pt-4" key={point.title}>
                  <h3 className="mb-2 font-semibold text-foreground text-sm">
                    {point.title}
                  </h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {point.body}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* 04 — the meeting questions */}
          <FaqSection />

          {/* 05 — bad fit */}
          <section className="mb-16">
            <div className="mb-3 flex items-baseline gap-3">
              <span className="font-mono text-brand-text text-xs">05</span>
              <h2 className="font-heading font-semibold text-2xl tracking-tight">
                When the answer is no
              </h2>
            </div>
            <p className="mb-7 max-w-2xl text-muted-foreground">
              If one of these describes your team, a decision against Wraps is
              the correct one, and this page is a faster way to reach it than a
              trial.
            </p>
            <ul className="space-y-4">
              {badFit.map((item) => (
                <li
                  className="border-border border-t pt-4 text-muted-foreground text-sm leading-relaxed"
                  key={item}
                >
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-7 max-w-2xl text-muted-foreground text-sm">
              Still deciding which category you belong in?{" "}
              <Link
                className="text-foreground underline underline-offset-4"
                href="/approaches"
              >
                The four approaches
              </Link>{" "}
              lays out every option, including the ones that are not us.
            </p>
          </section>

          <section className="rounded-lg border bg-muted/30 p-8 text-center">
            <h2 className="mb-2 font-heading font-semibold text-xl tracking-tight">
              Try it against a real AWS account
            </h2>
            <p className="mx-auto mb-6 max-w-xl text-muted-foreground">
              One command, about two minutes, non-destructive. Nothing existing
              in the account is modified, so a trial deploy is reversible.
            </p>
            <Link
              className="inline-flex items-center rounded-md bg-foreground px-5 py-2.5 font-medium text-background text-sm transition-opacity hover:opacity-90"
              href="/docs/quickstart/email"
            >
              Read the quickstart
            </Link>
          </section>
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
