import {
  type SesTopic,
  SesTopicArticle,
  sesTopicMetadata,
} from "@/components/ses-topic-article";

const QUOTA_DOC =
  "https://docs.aws.amazon.com/ses/latest/dg/manage-sending-quotas.html";

const topic: SesTopic = {
  slug: "limits",
  title: "Amazon SES Sending Limits: Sandbox Quotas, Rate vs Daily Cap",
  description:
    "What the SES sandbox quotas are, how the per-second sending rate differs from the rolling 24-hour quota, why quotas count recipients, and how increases actually happen.",
  badge: "Amazon SES",
  lede: "SES enforces two separate limits that fail in similar-looking ways, and both are per region. Knowing which one you hit decides whether backing off helps or whether you need a support case.",
  triage: [
    {
      symptom: "You can only send to addresses you verified",
      meaning:
        "The account is still in the SES sandbox. That is a capability restriction, not a quota problem.",
    },
    {
      symptom: "Sends fail in bursts and succeed on retry",
      meaning: "The per-second sending rate. Backoff fixes this one.",
    },
    {
      symptom: "Sends fail consistently for hours, then recover",
      meaning:
        "The 24-hour quota. Backoff does not help, because capacity returns only as older sends age out.",
    },
    {
      symptom: "Limits look right in the console but wrong in code",
      meaning:
        "Quotas are separate for each AWS region. You are probably reading one region and sending from another.",
    },
  ],
  sections: [
    {
      heading: "The two quotas, and the sandbox numbers",
      body: [
        "AWS defines the sending quota as the maximum number of emails you can send in a 24-hour period, calculated on a rolling basis rather than reset at a fixed hour. Every send checks what you sent in the previous 24 hours, and a send that would exceed the daily maximum is rejected.",
        "The sending rate is separate: the maximum number of emails SES will accept from your account each second. AWS says you can exceed it for short bursts but not for sustained periods, and notes that the rate at which SES accepts your messages can be lower than your stated maximum.",
        "In the sandbox, AWS states the numbers exactly: 200 messages per 24-hour period, and a maximum sending rate of one message per second.",
      ],
      bullets: [
        "Sandbox: 200 messages per 24 hours, 1 message per second.",
        "Both quotas are separate for each AWS region.",
        "The 24-hour quota is a rolling window, not a midnight reset.",
        "Quotas count recipients, not messages. An email to 10 recipients spends 10.",
      ],
    },
    {
      heading: "Recipients, not messages",
      body: [
        "This one catches people at exactly the wrong moment. AWS states that sending quotas are based on recipients rather than messages, so a single call with ten recipients consumes ten units of quota.",
        "AWS also recommends against sending to multiple recipients in one SendEmail call, on the grounds that if the call fails the entire email is rejected. One call per recipient is the recommendation, and it makes quota arithmetic match message counts.",
      ],
    },
    {
      heading: "Read your actual limits",
      body: [
        "Do not plan against a number from a blog post, including this one. The account's own quotas are one call, and they differ per region.",
      ],
      code: "aws sesv2 get-account --region us-east-1 \\\n  --query '{Quota:SendQuota,Enabled:SendingEnabled,Enforcement:EnforcementStatus}'",
      codeLanguage: "bash",
    },
    {
      heading: "How increases actually happen",
      body: [
        "There are two distinct things people call getting limits raised, and conflating them wastes time. Leaving the sandbox removes the restriction on who you can send to. A quota increase raises how much you can send.",
        "AWS lets you ask for both at once: when you submit a request to have the account removed from the sandbox, you can request increased quotas in the same request. After the account is out of the sandbox, further increases are new cases in the AWS Support Center.",
        "AWS also raises quotas on its own as sending volume and reputation build. That path costs nothing and is the one most accounts travel, provided bounce and complaint rates stay low.",
      ],
      bullets: [
        "Ask for a quota increase alongside the production access request rather than after it.",
        "Ask for a number you can justify with actual sending plans. A request with no volume rationale is the one that gets questioned.",
        "Keep bounce and complaint rates low, because automatic increases depend on them and a review pauses other outbound quota requests too.",
      ],
    },
    {
      heading: "Test throughput without spending quota",
      body: [
        "The SES mailbox simulator is limited by your maximum sending rate but does not consume your daily sending quota, and it works while the account is in the sandbox. AWS gives the example directly: an account authorised for 10,000 messages per 24 hours that sends 100 to the simulator can still send 10,000 to real recipients.",
        "It is billed like any other send, so it is free of quota but not free of cost.",
      ],
      code: "aws sesv2 send-email \\\n  --from-email-address you@yourdomain.com \\\n  --destination ToAddresses=success@simulator.amazonses.com \\\n  --content 'Simple={Subject={Data=throughput},Body={Text={Data=throughput}}}'",
      codeLanguage: "bash",
    },
  ],
  limits: {
    heading: "What no tool can do for you here",
    body: [
      "No platform can raise an AWS quota. The numbers belong to your AWS account, and they move either because AWS raised them on your sending history or because you asked in a support case.",
      "No platform can get you out of the sandbox either. Production access is an AWS decision, approval times vary, and requests do get denied.",
      "Wraps shows your current limits and volume next to each other so the ceiling is visible before you reach it, and batch sending respects the rate. Everything on the other side of that is AWS's.",
    ],
  },
  faqs: [
    {
      question: "What are the Amazon SES sandbox limits?",
      answer:
        "AWS states that a sandboxed account can send 200 messages per 24-hour period with a maximum sending rate of one message per second, and only to verified addresses and domains.",
    },
    {
      question: "Does the SES daily sending quota reset at midnight?",
      answer:
        "No. AWS calculates it on a rolling 24-hour period. Each send looks at what you sent in the previous 24 hours, so capacity returns gradually as older sends age out.",
    },
    {
      question: "Do SES quotas count messages or recipients?",
      answer:
        "Recipients. AWS states that an email with 10 recipients counts as 10 against your quota, and recommends one SendEmail call per recipient so a single failure does not reject the whole email.",
    },
    {
      question: "Are SES sending limits the same in every region?",
      answer:
        "No. AWS states that sending quotas are separate for each region, which is why a limit that looks correct in the console can be wrong for the region your code sends from.",
    },
    {
      question: "How do I increase my SES sending quota?",
      answer:
        "Request it in the same submission that asks for production access, or open a case in the AWS Support Center afterwards. AWS also raises quotas automatically as consistent sending builds reputation.",
    },
  ],
  related: [
    {
      href: "/blog/ses-sandbox-guide",
      label: "How to get out of the SES sandbox",
      blurb:
        "The deep guide to the production access request itself: what AWS looks for and why requests get denied.",
    },
    {
      href: "/ses/errors/maximum-sending-rate-exceeded",
      label: "Maximum sending rate exceeded",
      blurb: "The per-second limit as your code experiences it.",
    },
    {
      href: "/ses/errors/daily-sending-quota-exceeded",
      label: "Daily message quota exceeded",
      blurb: "The 24-hour limit as your code experiences it.",
    },
    {
      href: QUOTA_DOC,
      label: "AWS managing your sending limits",
      blurb: "The primary source for every number on this page.",
      external: true,
    },
    {
      href: "/docs/guides/production-access",
      label: "Production access",
      blurb: "The request walked through step by step.",
    },
    {
      href: "/tools/ses-calculator",
      label: "SES cost calculator",
      blurb:
        "What the volume you are asking for actually costs at AWS pricing.",
    },
  ],
};

export const metadata = sesTopicMetadata(topic);

export default function Page() {
  return <SesTopicArticle topic={topic} />;
}
