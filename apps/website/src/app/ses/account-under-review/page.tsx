import {
  type SesTopic,
  SesTopicArticle,
  sesTopicMetadata,
} from "@/components/ses-topic-article";

const ENFORCEMENT_FAQ =
  "https://docs.aws.amazon.com/ses/latest/dg/faqs-enforcement.html";

const topic: SesTopic = {
  slug: "account-under-review",
  title: "Amazon SES Account Under Review or Sending Paused: What Each Means",
  description:
    "The difference between an SES account under review and one with sending paused, what AWS wants in the reply to its support case, and the moves that make it worse.",
  badge: "Amazon SES",
  lede: "Under review and paused are two different states with two different consequences, and the emails announcing them read similarly enough that people confuse them. Under review, you can still send. Paused, you cannot.",
  triage: [
    {
      symptom: "AWS says your account is under review",
      meaning:
        "AWS found an issue and is giving you a review period to fix it. Sending continues in the meantime.",
    },
    {
      symptom: "AWS says your ability to send email is paused",
      meaning:
        "Sending has stopped. Usually because a review period ended without the issue being fixed, or the same issue recurred.",
    },
    {
      symptom: "Sends fail but you received no notification",
      meaning:
        "AWS notifies the email address on the AWS account, which is often not the address the team sending mail uses. Check the Account dashboard in the SES console for Healthy or Paused.",
    },
    {
      symptom: "Paused with no prior review",
      meaning:
        "AWS can pause without a review period first when the sending violated the AWS Service Terms seriously enough.",
    },
  ],
  thresholds: {
    caption:
      "Two metrics drive most of these notices, and each has a separate review level and pause level. Being at the review level does not mean you are about to be paused; it means the clock has started.",
    sourceUrl: ENFORCEMENT_FAQ,
    sourceLabel: "Amazon SES sending review process FAQs",
    rows: [
      {
        metric: "Bounce rate",
        bestPractice: "2%",
        review: "5% or greater",
        pause: "10% or greater",
      },
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
      heading: "What each state actually permits",
      body: [
        "AWS describes a review as being given time to fix a detected issue. Its own wording is that you can continue to send email as you normally would, but should correct the issue, and that if you do not correct it before the review period ends it may pause your ability to send.",
        "A review also has a side effect outside SES: AWS says a quota increase request for another service that sends outbound communications may be denied while the SES review is open.",
        "A pause is the end state. Sending stops until AWS reinstates it. AWS records an SES sending paused event in the AWS Health Dashboard, and the SES Account dashboard shows a status of Paused rather than Healthy.",
      ],
    },
    {
      heading: "Confirm the state before you act on it",
      body: [
        "Read it from the API rather than from the email, especially if more than one person has access to the account. The enforcement status and whether sending is enabled are both returned by a single call.",
      ],
      code: "aws sesv2 get-account \\\n  --query '{Enforcement:EnforcementStatus,Enabled:SendingEnabled,Quota:SendQuota}'",
      codeLanguage: "bash",
    },
    {
      heading: "What to put in the reply to AWS",
      body: [
        "AWS opens a support case on your behalf, and the reply to that case is the whole process. AWS asks for three things, and is specific that it wants changes you have already implemented rather than changes you intend to make.",
      ],
      bullets: [
        "The root cause of the event that led to the review, named concretely rather than described as a general list-quality issue.",
        "The changes you have already made to correct it. AWS says to include only steps already implemented, not planned ones.",
        "How those changes prevent the same thing recurring. This is the part most replies skip, and it is the part that decides the outcome.",
        "Anything AWS specifically asked for in its message. It needs that information to evaluate the case.",
      ],
    },
    {
      heading: "What makes it worse",
      body: [
        "Most of the damage in these incidents is self-inflicted after the notification arrives.",
      ],
      bullets: [
        "Continuing to send the same mail to the same list. AWS advises stopping if your situation allows it, because sending unchanged can deepen the issue.",
        "Opening a new support case instead of replying to the one AWS opened. The case AWS created is the thread being evaluated.",
        "Describing a remediation plan rather than completed work.",
        "Moving the same list to a fresh AWS account. It reproduces the problem there, and AWS notes that repeated reviews for the same issue are themselves grounds for a pause.",
      ],
    },
    {
      heading: "Set up the warning you did not have",
      body: [
        "The reason this arrives as a surprise is almost always that nothing was watching. The SES console's Reputation metrics page links both rates into CloudWatch, where Reputation.BounceRate can carry an alarm, and the complaint rate sits alongside it.",
        "Alarm below the review threshold rather than at it. An alarm that fires at 5% bounces tells you at the moment AWS is already acting.",
      ],
    },
  ],
  limits: {
    heading: "What no tool can do for you here",
    body: [
      "No platform can override an AWS pause or shorten a review. If AWS switches off sending for the account, sending stays off until AWS reinstates it.",
      "No platform can write a credible reply for you either. AWS is evaluating whether the underlying practice changed, and that is a claim only you can make truthfully.",
      "Wraps tracks bounce and complaint rates and suppresses the addresses that generate them, which is the part that keeps you away from the thresholds. Once AWS has acted, the conversation is between you and AWS.",
    ],
  },
  faqs: [
    {
      question: "Can I still send email while my SES account is under review?",
      answer:
        "Yes. AWS states you can continue to send as normal during the review period, while correcting the issue. It also advises stopping if your situation allows, because sending unchanged can make the issue worse.",
    },
    {
      question: "How long does an SES review period last?",
      answer:
        "AWS does not publish a fixed duration. The notice you receive describes the issue, and the review ends when AWS is satisfied the cause is fixed or when the period expires without a fix.",
    },
    {
      question: "Why was my SES account paused without a review first?",
      answer:
        "AWS lists three reasons for a pause: an uncorrected review, repeated reviews for the same issue, and sending that violated the AWS Service Terms. The third can result in a pause with no review period.",
    },
    {
      question: "How do I check whether my SES sending is paused?",
      answer:
        "The Account dashboard in the SES console shows Paused or Healthy, the AWS Health Dashboard records an SES sending paused event, and the sesv2 get-account API returns the enforcement status.",
    },
    {
      question: "Should I open a new AWS support case?",
      answer:
        "No. AWS opens a case on your behalf when it places an account under review or pauses it, and asks you to reply to that case. A new case starts a separate thread from the one being evaluated.",
    },
  ],
  related: [
    {
      href: "/ses/bounce-rate",
      label: "Bounce rate",
      blurb:
        "The earlier stage of the same incident, and usually the cause of it.",
    },
    {
      href: "/ses/complaint-rate",
      label: "Complaint rate",
      blurb: "The other metric that triggers a review, with tighter margins.",
    },
    {
      href: "/ses/errors/account-sending-paused",
      label: "AccountSendingPausedException",
      blurb: "The exception your application sees once the pause is live.",
    },
    {
      href: "/docs/guides/account-health",
      label: "Account health",
      blurb:
        "Reading enforcement state and reputation programmatically rather than from an inbox.",
    },
    {
      href: ENFORCEMENT_FAQ,
      label: "AWS sending review process FAQs",
      blurb:
        "AWS's own description of both states and what it asks for in a reply.",
      external: true,
    },
    {
      href: "/docs/guides/reputation",
      label: "Domain reputation on SES",
      blurb: "The longer-run work that keeps the account away from thresholds.",
    },
  ],
};

export const metadata = sesTopicMetadata(topic);

export default function Page() {
  return <SesTopicArticle topic={topic} />;
}
