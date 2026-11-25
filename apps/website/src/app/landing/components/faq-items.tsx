/**
 * FAQ copy for the landing page. Lives outside the accordion component so the
 * server-rendered <noscript> fallback in faq-section.tsx can render the same
 * answers — a Radix accordion ships its panels `hidden`, so without JS the
 * questions are visible and every answer is not.
 */

import type { ReactNode } from "react";
import { LICENSE_STATEMENT } from "@/config/license";
import { getTier } from "@/config/pricing";
import { estimateCost, SES_PLANS } from "@/lib/ses-cost";

export type FaqItem = {
  value: string;
  question: string;
  answer: string;
  richAnswer?: ReactNode;
};

const faqLink =
  "text-foreground underline underline-offset-2 hover:text-brand-text";
const faqCode =
  "rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground";

// The 50,000-emails example, from the same estimator pricing.md's worked
// examples use (no custom events, Free plan), so it moves when the rates do.
const fiftyK = (sesPlan: "alacarte" | "essentials") =>
  `$${estimateCost({ emailsPerMonth: 50_000, eventsPerMonth: 0, tier: "free", sesPlan }).total.toFixed(2)}`;
const ALACARTE_RATE = SES_PLANS.alacarte.perThousandEmails.toFixed(2);
const ESSENTIALS_RATE = SES_PLANS.essentials.perThousandEmails.toFixed(2);
const PRO_PRICE = getTier("pro").price;
const FIFTY_K_EXAMPLE = `For example, 50,000 emails a month is about ${fiftyK("alacarte")} to AWS on à la carte and ${fiftyK("essentials")} on Essentials, all in.`;

export const faqItems: FaqItem[] = [
  {
    value: "item-1",
    question: "How is this different from using AWS SES directly?",
    answer:
      "Two things. Setup: Wraps deploys all the infrastructure AWS SES needs (IAM roles, EventBridge, DynamoDB, Lambda, SQS) with one deploy command instead of 2+ hours of manual work, and the TypeScript SDK is just email.send(). Then the part that lasts longer — running it. The dashboard is a control plane for the daily job: bounce and complaint rates drawn against the lines AWS reviews and pauses at, swept hourly; suppression you can browse and clear; deliverability and blacklist audits; every message searchable. SES gives you none of that on its own.",
    richAnswer: (
      <>
        Two things. Setup: Wraps deploys all the infrastructure AWS SES needs
        (IAM roles, EventBridge, DynamoDB, Lambda, SQS) with{" "}
        <a className={faqLink} href="/docs/quickstart/email">
          one deploy command
        </a>{" "}
        instead of 2+ hours of manual work, and the{" "}
        <a className={faqLink} href="/docs/sdk-reference">
          TypeScript SDK
        </a>{" "}
        is just <code className={faqCode}>email.send()</code>. Then the part
        that lasts longer &mdash; running it. The{" "}
        <a className={faqLink} href="/platform">
          dashboard
        </a>{" "}
        is a control plane for the daily job: bounce and complaint rates drawn
        against the lines AWS reviews and pauses at, swept hourly; suppression
        you can browse and clear; deliverability and blacklist audits; every
        message searchable. SES gives you none of that on its own.
      </>
    ),
  },
  {
    value: "item-1b",
    question: "How is this different from the free open-source SES wrappers?",
    answer: `Wraps is one of them. ${LICENSE_STATEMENT} Open source is table stakes in this category rather than the difference. The difference is what happens past the send API. OpenSend, useSend and MillionSend give you an API and a dashboard over your own SES; checked in September 2026, none of them watches your account against the rates AWS suspends over, governs bounces past emitting a webhook, or runs blacklist and authentication audits. They also want AWS credentials in a container you run, where Wraps assumes an IAM role you can revoke. Our CLI and SDKs are free and open source too, so if the deploy is all you want, take that.`,
    richAnswer: (
      <>
        Wraps is one of them. Open source under{" "}
        <a
          className={faqLink}
          href="https://github.com/wraps-team/wraps/blob/main/LICENSE"
        >
          AGPLv3
        </a>
        , except the enterprise (ee) directories, which are under a commercial
        license. The SDKs are MIT. Open source is table stakes in this category
        rather than the difference. The difference is what happens past the send
        API. OpenSend, useSend and MillionSend give you an API and a dashboard
        over your own SES; checked in September 2026, none of them watches your
        account against the rates AWS suspends over, governs bounces past
        emitting a webhook, or runs blacklist and authentication audits. They
        also want AWS credentials in a container you run, where Wraps assumes an
        IAM role you can revoke. The full rubric is on{" "}
        <a className={faqLink} href="/approaches">
          the approaches page
        </a>
        .
      </>
    ),
  },
  {
    value: "item-1c",
    question:
      "What happens when my bounce or complaint rate crosses an AWS line?",
    answer:
      "An hourly sweep reads your account's SES reputation metrics. When a rate reaches AWS's review lines (5% bounce, 0.1% complaint), your organization's owners and admins are notified, and an ongoing episode notifies once a day rather than every hour. If the account is paused or reaches AWS's pause lines (10% bounce, 0.5% complaint), Wraps also holds scheduled broadcasts back instead of queueing more mail behind it. Wraps cannot lift an AWS review or pause, because that is AWS's decision about your account. It tells you early and shows you what to clean up.",
  },
  {
    value: "item-2",
    question: "What are the costs for running Wraps?",
    answer: `With Wraps, you pay AWS directly with no markup: à la carte SES is $${ALACARTE_RATE} per 1,000 emails, though AWS now defaults new accounts to Essentials at $${ESSENTIALS_RATE} (Wraps tells you which plan you're on). ${FIFTY_K_EXAMPLE} Every plan, including Free, includes unlimited sends, domains, contacts, templates, and team members; AWS bills the sending. Paid plans start at $${PRO_PRICE}/month. No Wraps lock-in: sending keeps running without us.`,
    richAnswer: (
      <>
        With Wraps, you pay AWS directly with no markup:{" "}
        <a className={faqLink} href="/tools/ses-calculator">
          à la carte SES is ${ALACARTE_RATE} per 1,000 emails
        </a>
        , though AWS now defaults new accounts to Essentials at $
        {ESSENTIALS_RATE} (Wraps tells you which plan you&rsquo;re on).{" "}
        {FIFTY_K_EXAMPLE} Every plan, including Free, includes unlimited sends,
        domains, contacts, templates, and team members; AWS bills the sending.
        Paid plans start at ${PRO_PRICE}/month. No Wraps lock-in: sending keeps
        running without us.
      </>
    ),
  },
  {
    value: "item-3",
    question: "Do you store my AWS credentials?",
    answer:
      "No! We use OIDC (OpenID Connect) for Vercel deployments or IAM roles for AWS-native deployments. The CLI uses your local AWS credentials for the initial deployment, then creates IAM roles that your app can assume. We never see or store your AWS access keys.",
    richAnswer: (
      <>
        No! We use OIDC (OpenID Connect) for Vercel deployments or IAM roles for
        AWS-native deployments. The{" "}
        <a className={faqLink} href="/docs/cli-reference">
          CLI
        </a>{" "}
        uses your local AWS credentials for the initial deployment, then creates
        IAM roles that your app can assume. We never see or store your AWS
        access keys.
      </>
    ),
  },
  {
    value: "item-4",
    question: "What happens if I stop paying for Wraps?",
    answer:
      "Sending keeps running without us. The sending setup lives in your AWS account, so your SDK code keeps working, your emails keep going out, and you keep paying AWS directly. You lose the Wraps dashboard and workflows. Contacts and templates are stored by Wraps, and you can export them. No Wraps lock-in.",
  },
  {
    value: "item-5",
    question: "Can I customize the infrastructure deployment?",
    answer:
      "Yes! The CLI offers infrastructure presets for different needs—from minimal tracking to full analytics with dedicated IPs. You can also use 'npx @wraps.dev/cli email upgrade' to add features incrementally. For full customization, all infrastructure is deployed as open-source Pulumi code you can fork and modify.",
    richAnswer: (
      <>
        Yes! The CLI offers infrastructure presets for different
        needs&mdash;from minimal tracking to full analytics with dedicated IPs.
        You can also use{" "}
        <code className={faqCode}>npx @wraps.dev/cli email upgrade</code> to add
        features incrementally. For full customization, all infrastructure is
        deployed as{" "}
        <a
          className={faqLink}
          href="https://github.com/wraps-team/wraps"
          rel="noopener noreferrer"
          target="_blank"
        >
          open-source Pulumi code
        </a>{" "}
        you can fork and modify.
      </>
    ),
  },
  {
    value: "item-6",
    question: "Does this work with my existing SES setup?",
    answer:
      "Yes! Use 'npx @wraps.dev/cli email connect' to scan your existing SES resources and add Wraps features non-destructively. We never modify existing resources—all our infrastructure uses the 'wraps-email-' prefix. You can also use 'npx @wraps.dev/cli email init' for a completely fresh deployment.",
    richAnswer: (
      <>
        Yes! Use{" "}
        <code className={faqCode}>npx @wraps.dev/cli email connect</code> to
        scan your existing SES resources and add Wraps features
        non-destructively. We never modify existing resources&mdash;all our
        infrastructure uses the <code className={faqCode}>wraps-email-</code>{" "}
        prefix. You can also use{" "}
        <code className={faqCode}>npx @wraps.dev/cli email init</code> for a
        completely fresh deployment.
      </>
    ),
  },
  {
    value: "item-7",
    question: "Can I receive emails too?",
    answer:
      "Yes! Wraps supports inbound email receiving. Run 'npx @wraps.dev/cli email inbound init' to deploy the infrastructure, then use the SDK to list, read, reply, and forward emails. EventBridge triggers let you build webhooks for fast event processing.",
    richAnswer: (
      <>
        Yes! Wraps supports{" "}
        <a className={faqLink} href="/inbound">
          inbound email receiving
        </a>
        . Run{" "}
        <code className={faqCode}>npx @wraps.dev/cli email inbound init</code>{" "}
        to deploy the infrastructure, then use the{" "}
        <a className={faqLink} href="/docs/sdk-reference">
          SDK
        </a>{" "}
        to list, read, reply, and forward emails. EventBridge triggers let you
        build webhooks for fast event processing.
      </>
    ),
  },
];
