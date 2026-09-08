import {
  type SesTopic,
  SesTopicArticle,
  sesTopicMetadata,
} from "@/components/ses-topic-article";

const ENFORCEMENT_FAQ =
  "https://docs.aws.amazon.com/ses/latest/dg/faqs-enforcement.html";

const topic: SesTopic = {
  slug: "complaint-rate",
  title: "Amazon SES Complaint Rate: Why 0.1% Is the Number That Matters",
  description:
    "The SES complaint thresholds AWS acts on, why the rate you can see understates the rate recipients are generating, and what actually reduces complaints.",
  badge: "Amazon SES",
  lede: "One complaint in a thousand puts an SES account under review. That is a tighter budget than most senders realise, and the number SES shows you is lower than the number recipients are actually producing.",
  triage: [
    {
      symptom: "A single campaign spiked the rate",
      meaning:
        "Either the segment did not expect the mail, or the mail did not look like what they signed up for. Content and audience, in that order.",
    },
    {
      symptom: "The rate is steady but sits near 0.1%",
      meaning:
        "You are operating with no margin. Any campaign that lands slightly wrong takes you over the review line.",
    },
    {
      symptom: "Complaints are rising and unsubscribes are not",
      meaning:
        "People cannot find the unsubscribe, or do not trust it. The spam button is the fallback for a missing exit.",
    },
    {
      symptom: "Gmail recipients complain and nothing shows in SES",
      meaning:
        "Expected. SES only counts complaints from providers that feed them back, so your visible rate understates reality.",
    },
  ],
  thresholds: {
    caption:
      "As with bounces, AWS publishes a best-practice level and a separate level at which it intervenes. The gap between them is one complaint in two hundred.",
    sourceUrl: ENFORCEMENT_FAQ,
    sourceLabel: "Amazon SES sending review process FAQs",
    rows: [
      {
        metric: "Complaint rate",
        bestPractice: "0.1%",
        review: "0.1% or greater",
        pause: "0.5% or greater",
      },
    ],
  },
  sections: [
    {
      heading: "The rate you see is not the rate you have",
      body: [
        "AWS is explicit that the complaint rate statistic in the console and from GetSendStatistics does not include complaints from email providers that do not send feedback to SES. Providers that run a feedback loop are counted. Providers that do not are invisible.",
        "So a rate of 0.04% is not evidence that you are at 0.04%. It is evidence that the providers who report to SES are seeing 0.04%. Treat the visible number as a floor, and leave headroom accordingly.",
        "Like the bounce rate, the complaint rate is measured over a representative volume rather than a fixed window, so it is not something you can recompute from your own send log and match.",
      ],
    },
    {
      heading: "What actually causes complaints",
      body: [
        "Complaints are not a deliverability problem that arrived from outside. They are a recipient telling their provider that they did not want this. Almost all of them trace back to one of four things.",
      ],
      bullets: [
        "The recipient does not remember opting in, usually because the opt-in was a side effect of doing something else.",
        "The mail does not resemble what they signed up for. A product update list that starts sending promotions generates complaints from people who are still interested in the product.",
        "The unsubscribe is hard to find, requires a login, or does not appear to work. Marking as spam is faster and always works.",
        "Frequency changed without warning. Weekly to daily is a complaint generator even when the content is good.",
      ],
    },
    {
      heading: "Make unsubscribing easier than complaining",
      body: [
        "This is the single highest-leverage change, and it is mostly mechanical. RFC 8058 one-click unsubscribe puts an unsubscribe control in the provider's own interface, right next to the button that would otherwise register a complaint. Gmail and Yahoo both require it for bulk senders.",
        "Honour it immediately and without a confirmation step. An unsubscribe that takes two clicks and a login is a complaint waiting to happen.",
      ],
      bullets: [
        "Send the List-Unsubscribe and List-Unsubscribe-Post headers on bulk mail.",
        "Keep a visible unsubscribe link in the body as well. The header is for the provider, the link is for the reader.",
        "Suppress on the first request, not on the next export.",
        "Offer fewer emails as an option alongside none. Some complaints are frequency complaints.",
      ],
    },
    {
      heading: "Watch it before AWS does",
      body: [
        "The SES console's Reputation metrics page carries the account-level complaint rate alongside the bounce rate, and both can be graphed and alarmed in CloudWatch. Alarm at a level below the review threshold, not at it, since by the time you cross the line AWS has already acted.",
        "The account's current enforcement state is one API call, and worth wiring into whatever you already page on.",
      ],
      code: "aws sesv2 get-account \\\n  --query '{Enforcement:EnforcementStatus,Enabled:SendingEnabled}'",
      codeLanguage: "bash",
    },
  ],
  limits: {
    heading: "What no tool can do for you here",
    body: [
      "No platform can see complaints that the recipient's provider never reports. The gap between your visible rate and your real rate is structural, and every sender on SES has it.",
      "No platform can stop someone marking mail as spam. What it can do is make the alternative easier and make sure the complaint results in immediate suppression.",
      "Wraps tracks complaints, suppresses the addresses that generate them, and supports one-click unsubscribe. It has no influence over AWS's thresholds or over whether a provider feeds complaints back to SES.",
    ],
  },
  faqs: [
    {
      question: "What is a good complaint rate for Amazon SES?",
      answer:
        "AWS says to maintain a complaint rate below 0.1%. A rate of 0.1% or greater places the account under review, and 0.5% or greater may pause sending.",
    },
    {
      question: "Why is my SES complaint rate lower than I expect?",
      answer:
        "AWS states the complaint rate statistic excludes complaints from email providers that do not send feedback to SES. Providers without a feedback loop generate complaints you never see.",
    },
    {
      question: "Does an unsubscribe count as a complaint in SES?",
      answer:
        "No. An unsubscribe is a request to stop; a complaint is a recipient marking the message as spam with their provider. Only the second one affects the metric AWS enforces on.",
    },
    {
      question: "Does one-click unsubscribe reduce complaints?",
      answer:
        "It gives the recipient an exit in the same place as the spam button, which is where the decision is made. It does not make unwanted mail wanted, so it works alongside fixing targeting and frequency rather than instead of it.",
    },
    {
      question: "How do I find out which campaign caused the complaints?",
      answer:
        "Publish SES complaint events per configuration set or per campaign so the metric is attributable. An account-level rate tells you that something is wrong and nothing about where.",
    },
  ],
  related: [
    {
      href: "/ses/bounce-rate",
      label: "Bounce rate",
      blurb:
        "The other enforced metric, with wider thresholds and different arithmetic.",
    },
    {
      href: "/ses/account-under-review",
      label: "Account under review or paused",
      blurb: "What happens once you cross the line, and how to get back.",
    },
    {
      href: "/docs/guides/suppression-lists",
      label: "Suppression lists",
      blurb:
        "How suppression works in practice, including what gets added automatically.",
    },
    {
      href: "/docs/guides/bounce-handling",
      label: "Bounce and complaint handling",
      blurb: "The event pipeline behind both metrics.",
    },
    {
      href: ENFORCEMENT_FAQ,
      label: "AWS sending review process FAQs",
      blurb: "The primary source for every percentage on this page.",
      external: true,
    },
    {
      href: "/tools",
      label: "Check your domain",
      blurb: "Authentication and blacklist checks, free, no account needed.",
    },
  ],
};

export const metadata = sesTopicMetadata(topic);

export default function Page() {
  return <SesTopicArticle topic={topic} />;
}
