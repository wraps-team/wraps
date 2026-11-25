import type { Metadata } from "next";
import Link from "next/link";
import { ClosingPanel } from "@/app/landing/components/closing-panel";
import { FlowBox } from "@/app/landing/components/flow-primitives";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { Band, SectionHead } from "@/app/landing/components/page-band";
import { SectionKicker } from "@/app/landing/components/section-kicker";
import { TrackedClosingActions } from "@/components/tracked-closing-actions";
import { LICENSE_STATEMENT } from "@/config/license";
import { AWS_PRICING, formatCurrency, getTier } from "@/config/pricing";
import { pageMetadata } from "@/lib/page-metadata";
import { estimateCost, SES_PLANS } from "@/lib/ses-cost";
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

export const metadata: Metadata = pageMetadata({
  title: "Why Wraps — the evaluation guide you can forward",
  description:
    "What Wraps reduces, what it costs all in, what happens to your infrastructure if we disappear, and the questions a security review will ask — including the ones we fail.",
  path: "/why-wraps",
  social: {
    title: "Why Wraps",
    description:
      "What Wraps reduces, what it costs all in, what happens if we disappear, and the questions a security review will ask — including the ones we fail.",
  },
});

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
    price: formatCurrency(getTier("free").price),
    forWho: `One AWS account, ${getTier("free").limits.historyDisplay} of history. Most first deploys.`,
  },
  {
    plan: "Pro",
    price: `${formatCurrency(getTier("pro").price)}/mo`,
    forWho: `One AWS account, ${getTier("pro").limits.historyDisplay} of history, email support.`,
  },
  {
    plan: "Business",
    price: `${formatCurrency(getTier("business").price)}/mo`,
    forWho: `Unlimited AWS accounts, ${getTier("business").limits.historyDisplay} of history, SSO and SCIM, audit log with CSV export, priority support.`,
  },
];

const ESSENTIALS_RATE = SES_PLANS.essentials.perThousandEmails.toFixed(2);
const allIn100k = (sesPlan: "alacarte" | "essentials") =>
  `$${estimateCost({ emailsPerMonth: 100_000, tier: "free", sesPlan }).total.toFixed(2)}`;

const exitPoints = [
  {
    title: "The sending setup is already in your account",
    body: "SES identities, Lambdas, EventBridge rules and DynamoDB tables are created in your AWS account, namespaced wraps-email-*, and none of them call us to keep working. Stop paying and your app's emails keep going out. Broadcasts and automations stop.",
  },
  {
    title: "Our access is a role you delete",
    body: "Wraps assumes an IAM role with an external ID. No access keys exist on our side, so revoking access is a change you make in your own account without involving us.",
  },
  {
    title: "The code is public",
    body: `Your reviewer can read what Wraps sets up, including every IAM policy it generates. ${LICENSE_STATEMENT}`,
  },
  {
    title: "What you would lose, stated plainly",
    body: "The dashboard, and everything that lives in our database rather than yours: contacts, templates, broadcasts, workflows, and the per-message send records that drive the dashboard list and analytics. Contacts and templates can be exported, so export them before you go. The SES setup and the event history in your own DynamoDB stay where they are.",
  },
];

const badFit = [
  "You have no AWS account and no appetite for one. Everything on this page depends on holding one, so a hosted sending API is the right shape for you.",
  "You need SOC 2 today. We don't have SOC 2 yet.",
  "You expect to be refused SES production access. Wraps cannot change that outcome, and a sandboxed account sends to nobody.",
  "You need a drag-and-drop email editor or A/B testing today. Templates are code, with an AI that writes the first draft, and there is no split testing.",
  "Your stack is not TypeScript or Python. Those are the SDKs that exist.",
];

export default function WhyWrapsPage() {
  return (
    <div className="min-h-screen bg-background">
      <LandingNavbar />
      <main>
        <section className="pt-24 pb-12">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl">
              <SectionKicker>Evaluation guide</SectionKicker>
              <h1 className="mb-4 text-pretty font-heading font-semibold text-4xl leading-tight tracking-tight sm:text-5xl">
                Why Wraps
              </h1>
              <p className="max-w-2xl text-lg text-muted-foreground">
                Written to be forwarded. If you are the person being asked to
                approve this, the sections below cover the risk it reduces, what
                it costs in total, what happens to your setup if we disappear,
                and the questions your review will raise, including the ones
                where our answer is no.
              </p>
              <CopyLinkButton />
            </div>
          </div>
        </section>

        <Band sunken>
          <SectionHead
            body="Not a cheaper send. The failure that costs a company real money is Amazon switching the account off, and every number in the second column is AWS's, not ours."
            kicker="01 · Risk"
            title="What can go wrong with sending"
          />
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
                      className="border-border border-b px-3 py-3 font-sans font-semibold text-muted-foreground text-xs uppercase tracking-eyebrow"
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
        </Band>

        <Band>
          <SectionHead
            body={
              <>
                Two lines on two invoices. A flat platform fee from us, and AWS
                billing you directly for the sending: $
                {AWS_PRICING.sesPerThousand.toFixed(2)} per 1,000 emails on à la
                carte, or ${ESSENTIALS_RATE} on the Essentials plan AWS puts new
                accounts on. There is no per-seat, per-contact or per-email fee
                from Wraps on any plan.
              </>
            }
            kicker="02 · Cost"
            title="What it costs, all in"
          />
          <div className="grid gap-x-6 gap-y-8 md:grid-cols-3">
            {planRows.map((row) => (
              <FlowBox key={row.plan} label={row.plan}>
                <p className="mb-2 font-heading font-semibold text-2xl">
                  {row.price}
                </p>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {row.forWho}
                </p>
              </FlowBox>
            ))}
          </div>
          <p className="mt-8 max-w-2xl text-muted-foreground leading-relaxed">
            For scale: 100,000 emails a month costs {allIn100k("alacarte")} on
            Amazon's $0.10 plan and {allIn100k("essentials")} on the $
            {ESSENTIALS_RATE} plan, including the AWS event pipeline, with the
            Wraps Free plan on top at $0. Against a marketing platform that
            charges per contact, the gap widens with the list. Against a sending
            API, work it out with the{" "}
            <Link
              className="text-foreground underline underline-offset-4"
              href="/tools/ses-calculator"
            >
              cost calculator
            </Link>{" "}
            for your own volume.
          </p>
        </Band>

        <Band sunken>
          <SectionHead
            body="The question a careful reviewer asks about any vendor in the send path. Here it has a mechanical answer rather than a reassuring one."
            kicker="03 · Exit"
            title="What happens if Wraps goes away"
          />
          <div className="grid gap-x-6 gap-y-8 sm:grid-cols-2">
            {exitPoints.map((point, i) => (
              <FlowBox dashed={i === 0} key={point.title} label={point.title}>
                <p className="text-muted-foreground leading-relaxed">
                  {point.body}
                </p>
              </FlowBox>
            ))}
          </div>
        </Band>

        <FaqSection />

        <Band sunken>
          <SectionHead
            body="If one of these describes your team, a decision against Wraps is the correct one, and this page is a faster way to reach it than a trial."
            kicker="05 · Fit"
            title="When the answer is no"
          />
          <FlowBox label="Not the right fit if">
            <ul className="space-y-3 text-muted-foreground leading-relaxed">
              {badFit.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </FlowBox>
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
        </Band>

        <ClosingPanel
          actions={
            <TrackedClosingActions
              location="why_wraps_closing"
              primary={{
                label: "Read the quickstart",
                href: "/docs/quickstart/email",
              }}
              secondary={{ label: "See the security page", href: "/security" }}
            />
          }
          body="Connect an AWS account and look at it. Nothing already in the account is modified, so a trial deploy is reversible."
          title="Try it against a real AWS account."
        />
      </main>
      <LandingFooter />
    </div>
  );
}
