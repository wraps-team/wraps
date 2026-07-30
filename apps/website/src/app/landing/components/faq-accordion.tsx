"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@wraps/ui/components/ui/accordion";
import type { ReactNode } from "react";

const faqLink =
  "text-foreground underline underline-offset-2 hover:text-orange-500";
const faqCode =
  "rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground";

type FaqItem = {
  value: string;
  question: string;
  answer: string;
  richAnswer?: ReactNode;
};

const faqItems: FaqItem[] = [
  {
    value: "item-1",
    question: "How is this different from using AWS SES directly?",
    answer:
      "Wraps deploys all the infrastructure AWS SES needs (IAM roles, EventBridge, DynamoDB, Lambda, SQS) in one command instead of 2+ hours of manual setup. You get event tracking, analytics, and a dashboard out of the box. The TypeScript SDK is just `email.send()` - no boilerplate.",
    richAnswer: (
      <>
        Wraps deploys all the infrastructure AWS SES needs (IAM roles,
        EventBridge, DynamoDB, Lambda, SQS) in{" "}
        <a className={faqLink} href="/docs/quickstart/email">
          one command
        </a>{" "}
        instead of 2+ hours of manual setup. You get event tracking, analytics,
        and a{" "}
        <a className={faqLink} href="/platform">
          dashboard
        </a>{" "}
        out of the box. The{" "}
        <a className={faqLink} href="/docs/sdk-reference">
          TypeScript SDK
        </a>{" "}
        is just <code className={faqCode}>email.send()</code> &mdash; no
        boilerplate.
      </>
    ),
  },
  {
    value: "item-2",
    question: "What are the costs for running Wraps?",
    answer:
      "With Wraps, you pay AWS directly with no markup: à la carte SES is $0.10 per 1,000 emails, though AWS now defaults new accounts to Essentials at $0.16 (Wraps tells you which plan you're on). For example, 50,000 emails/month costs ~$5-8 to AWS. There's a free tier with 5,000 tracked events/month included. Paid plans start at $19/month. The infrastructure is yours forever—no vendor lock-in, no surprise bills.",
    richAnswer: (
      <>
        With Wraps, you pay AWS directly with no markup:{" "}
        <a className={faqLink} href="/tools/ses-calculator">
          à la carte SES is $0.10 per 1,000 emails
        </a>
        , though AWS now defaults new accounts to Essentials at $0.16 (Wraps
        tells you which plan you&rsquo;re on). For example, 50,000 emails/month
        costs ~$5-8 to AWS. There&rsquo;s a free tier with 5,000 tracked
        events/month included. Paid plans start at $19/month. The infrastructure
        is yours forever&mdash;no vendor lock-in, no surprise bills.
      </>
    ),
  },
  {
    value: "item-2b",
    question: "What counts as a tracked event?",
    answer:
      "Tracked events are custom behavioral events you send to our API—things like user.signed_up, order.completed, or plan.upgraded. Use them to trigger workflows or as wait-for-event conditions. Email sends, contacts stored, opens/clicks/deliveries, and template previews don't count against your tracked event limit.",
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
      "Your infrastructure keeps running! All resources are in your AWS account. You lose access to the Wraps Platform (if you had it) but can still use the free local console. Your SDK code keeps working, emails keep sending, and you keep paying AWS directly. Zero vendor lock-in.",
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
      "Yes! Wraps supports inbound email receiving. Run 'npx @wraps.dev/cli email inbound init' to deploy the infrastructure, then use the SDK to list, read, reply, and forward emails. EventBridge triggers let you build webhooks for real-time processing.",
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
        build webhooks for real-time processing.
      </>
    ),
  },
];

export function FaqAccordion() {
  return (
    <Accordion className="space-y-2" collapsible type="single">
      {faqItems.map((item) => (
        <AccordionItem
          className="rounded-lg border px-4 transition-colors data-[state=open]:border-orange-500/30 data-[state=open]:bg-orange-500/5 last:border-b"
          key={item.value}
          value={item.value}
        >
          <AccordionTrigger className="cursor-pointer py-4 text-left hover:no-underline">
            <span className="font-medium">{item.question}</span>
          </AccordionTrigger>
          <AccordionContent className="pb-4 text-muted-foreground">
            {item.richAnswer ?? item.answer}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}

// Export FAQ items for use in Schema.org markup
export { faqItems };
