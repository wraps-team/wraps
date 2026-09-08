import {
  type SesTopic,
  SesTopicArticle,
  sesTopicMetadata,
} from "@/components/ses-topic-article";

const ENFORCEMENT_FAQ =
  "https://docs.aws.amazon.com/ses/latest/dg/faqs-enforcement.html";

const topic: SesTopic = {
  slug: "bounce-rate",
  title:
    "Amazon SES Bounce Rate: The Thresholds and How to Get Back Under Them",
  description:
    "What counts toward your SES bounce rate, the exact percentages at which AWS reviews or pauses an account, and the order to work through when the number is climbing.",
  badge: "Amazon SES",
  lede: "AWS publishes the bounce-rate percentages it acts on, and they are not the numbers most guides quote. Two of them put you under review; a different two stop your sending. Here is which is which, what SES actually counts, and what to do first.",
  triage: [
    {
      symptom: "The rate jumped right after one campaign",
      meaning:
        "One segment, usually an old or imported list, is carrying the bounces. Isolate that send before you change anything global.",
    },
    {
      symptom: "The rate has drifted up over months",
      meaning:
        "List decay. Addresses that were valid at signup stop existing, and nothing is removing them.",
    },
    {
      symptom: "The rate is alarming but your volume is small",
      meaning:
        "SES measures over a representative volume rather than a fixed window, so a handful of bad addresses moves the percentage a long way at low volume.",
    },
    {
      symptom: "AWS emailed you about it",
      meaning:
        "You are already at or past the review threshold. Treat it as an incident, not a metric.",
    },
  ],
  thresholds: {
    caption:
      "AWS states two different things: the level you should stay under, and the level at which it intervenes. Confusing the two is the most common mistake in writing about this.",
    sourceUrl: ENFORCEMENT_FAQ,
    sourceLabel: "Amazon SES sending review process FAQs",
    rows: [
      {
        metric: "Bounce rate",
        bestPractice: "2%",
        review: "5% or greater",
        pause: "10% or greater",
      },
    ],
  },
  sections: [
    {
      heading: "What SES counts as a bounce, and what it does not",
      body: [
        "AWS is specific about this and it changes how you read your own number. Your bounce rate includes only hard bounces to domains you have not verified. Soft bounces, and bounces to domains you have verified in SES, do not count toward it.",
        "That means the metric you see in the SES console and the metric AWS enforces on can diverge from anything you compute yourself. AWS says so directly: you cannot calculate your own bounce rate from the console or from GetSendStatistics, because the rate is measured over a representative volume that varies per sender and can stretch further back than the console shows.",
      ],
      bullets: [
        "Hard bounces to unverified domains: counted.",
        "Soft bounces: not counted.",
        "Bounces to domains you have verified in SES, including your own test domains: not counted.",
        "Sends to the SES mailbox simulator: not counted, and they do not touch your daily quota either.",
      ],
    },
    {
      heading: "Work through it in this order",
      body: [
        "The instinct is to clean the whole list. That is slow, and usually the bounces are concentrated somewhere specific. Narrow before you scrub.",
      ],
      bullets: [
        "Segment the bounces by campaign and by signup date. One cohort is normally responsible.",
        "Separate hard from soft. Only the hard ones against unverified domains move the number AWS enforces on.",
        "Suppress every hard bounce immediately, and make that automatic rather than a task someone remembers.",
        "Look at how those addresses got in. A bounce rate above the threshold is almost always an acquisition problem wearing a list problem's clothes.",
        "Stop sending to the cohort that caused it while you fix the intake, rather than continuing at a lower volume.",
      ],
    },
    {
      heading: "Check the number without guessing",
      body: [
        "The SES console's Reputation metrics page shows the account-level bounce rate, and it links each metric into CloudWatch, where Reputation.BounceRate can carry an alarm. An alarm is the difference between finding out from your dashboard and finding out from AWS.",
        "From the command line, the account's enforcement status is one call. A healthy account and an account under review answer differently.",
      ],
      code: "aws sesv2 get-account \\\n  --query '{Enforcement:EnforcementStatus,Quota:SendQuota,Enabled:SendingEnabled}'",
      codeLanguage: "bash",
    },
    {
      heading: "Test bounce handling without damaging your own metrics",
      body: [
        "The SES mailbox simulator gives you a bounce on demand. Mail sent to it does not count toward your sending quota, your bounce rate, or your complaint rate, and it works while your account is still in the sandbox. You are billed for it as normal.",
        "Use it to prove your suppression path actually suppresses, before you need that path to work under pressure.",
      ],
      code: "aws sesv2 send-email \\\n  --from-email-address you@yourdomain.com \\\n  --destination ToAddresses=bounce@simulator.amazonses.com \\\n  --content 'Simple={Subject={Data=test},Body={Text={Data=test}}}'",
      codeLanguage: "bash",
    },
  ],
  limits: {
    heading: "What no tool can do for you here",
    body: [
      "Nobody can lower a bounce rate that is already recorded. The metric is computed over your recent sending, so it comes down by sending clean mail, not by deleting rows after the fact.",
      "Nobody can override an AWS decision either. If AWS places the account under review or pauses it, that state is lifted by AWS when the underlying problem is fixed and you have said what changed.",
      "Wraps suppresses hard bounces and complaints and shows the rates in one place, which is the part you control. It does not change what AWS counts or what AWS does about it.",
    ],
  },
  faqs: [
    {
      question: "What bounce rate does AWS suspend an SES account at?",
      answer:
        "AWS states that a bounce rate of 5% or greater places the account under review, and 10% or greater may pause the account's ability to send. Aim to stay below 2%.",
    },
    {
      question: "Do soft bounces count toward my SES bounce rate?",
      answer:
        "No. AWS states the bounce rate includes only hard bounces to domains you have not verified. Soft bounces and bounces to verified domains are excluded.",
    },
    {
      question: "Can I calculate my SES bounce rate myself?",
      answer:
        "Not accurately. AWS says the rate is computed over a representative volume that differs per sender and can reach further back than the console or GetSendStatistics shows, so your own arithmetic will not match theirs.",
    },
    {
      question: "How long does it take for a bounce rate to recover?",
      answer:
        "There is no fixed window to wait out, because the rate is not measured over a fixed period. It moves as clean sending accumulates and displaces the bad volume.",
    },
    {
      question: "Does testing with fake addresses hurt my bounce rate?",
      answer:
        "Made-up addresses at real domains do. The SES mailbox simulator does not: AWS excludes simulator mail from your bounce and complaint rates and from your daily quota.",
    },
  ],
  related: [
    {
      href: "/ses/account-under-review",
      label: "Account under review or paused",
      blurb:
        "The next stage of the same incident. What each state permits, and what to send AWS.",
    },
    {
      href: "/ses/complaint-rate",
      label: "Complaint rate",
      blurb:
        "The other metric AWS enforces on, with a much smaller margin for error.",
    },
    {
      href: "/docs/guides/bounce-handling",
      label: "Bounce and complaint handling",
      blurb:
        "The implementation depth: event pipeline, suppression, and what to do per bounce type.",
    },
    {
      href: "/tools",
      label: "Check your domain",
      blurb:
        "SPF, DKIM, DMARC, MX and blacklist checks, in case authentication is part of the picture.",
    },
    {
      href: ENFORCEMENT_FAQ,
      label: "AWS sending review process FAQs",
      blurb: "The primary source for every percentage on this page.",
      external: true,
    },
    {
      href: "/ses/errors/account-sending-paused",
      label: "AccountSendingPausedException",
      blurb: "The exception your code sees once the pause is in effect.",
    },
  ],
};

export const metadata = sesTopicMetadata(topic);

export default function Page() {
  return <SesTopicArticle topic={topic} />;
}
