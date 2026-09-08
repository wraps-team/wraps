import {
  type SesTopic,
  SesTopicArticle,
  sesTopicMetadata,
} from "@/components/ses-topic-article";

const DELIVERABILITY_DOC =
  "https://docs.aws.amazon.com/ses/latest/dg/send-email-concepts-deliverability.html";

const topic: SesTopic = {
  slug: "spam-folder",
  title:
    "Amazon SES Emails Going to Spam: Check Authentication, Then Reputation, Then Content",
  description:
    "A diagnosis order for SES mail landing in spam: prove authentication first, then look at reputation signals, then content. Includes what nobody can promise you.",
  badge: "Amazon SES",
  lede: "SES accepted the message and the recipient's provider filed it under spam. Those are two separate systems, and the fix depends entirely on which of three layers is failing. Work through them in order, because the first one is cheap to check and accounts for most cases.",
  triage: [
    {
      symptom: "Every recipient sees it in spam, at every provider",
      meaning:
        "Authentication. A missing or misaligned SPF, DKIM or DMARC setup fails uniformly rather than selectively.",
    },
    {
      symptom: "Gmail files it, other providers do not",
      meaning:
        "Provider-specific reputation or bulk-sender requirements. Gmail weighs engagement and one-click unsubscribe more heavily than most.",
    },
    {
      symptom: "It started recently on a domain that was fine",
      meaning:
        "A reputation change. Look for a campaign, a list import, or a DNS edit in the same window.",
    },
    {
      symptom: "Only some campaigns are filtered",
      meaning:
        "Content and audience. The mail that gets filtered is usually the mail people were not expecting.",
    },
    {
      symptom: "Transactional mail is fine, marketing is not",
      meaning:
        "Expected, and a reason to separate the two streams so one cannot drag down the other.",
    },
  ],
  sections: [
    {
      heading: "First: prove authentication, do not assume it",
      body: [
        "AWS lists verification and authentication first among the things that decide whether providers treat your mail as spam, and it is the layer you can settle definitively in a few minutes. Everything below this is probability; this part is a yes or no.",
        "Check it from outside your own network. A record that exists in your DNS provider's interface and a record the internet can resolve are not the same claim.",
      ],
      bullets: [
        "SPF: published on the sending domain, and passing for the domain the receiver actually checks.",
        "DKIM: SES publishes three CNAME records for DKIM. All three must resolve and SES must report the identity as verified.",
        "DMARC: a policy record exists, and at least one of SPF or DKIM aligns with the From domain. Alignment is the part that is usually missing.",
        "A custom MAIL FROM domain if you need SPF alignment specifically, with its own MX and TXT records.",
        "Reverse DNS and MX for the domain, so the sending identity looks like a real one.",
      ],
      code: "dig +short TXT yourdomain.com\ndig +short TXT _dmarc.yourdomain.com\ndig +short CNAME <selector>._domainkey.yourdomain.com",
      codeLanguage: "bash",
    },
    {
      heading: "Second: reputation, which is slower and less visible",
      body: [
        "Once authentication passes, filtering decisions come down to what providers have learned about your domain and about the IPs you send from. AWS notes that it maintains a trusted reputation with providers and requires senders to send high-quality email, which is the polite way of saying your behaviour is the input.",
        "Most SES accounts send from the shared IP pool, so IP reputation is largely AWS's to manage and domain reputation is yours. That split is why domain reputation is where your effort goes.",
      ],
      bullets: [
        "Bounce and complaint rates. These are the two AWS enforces on, and providers read the same signals.",
        "Engagement. Mail that is opened and replied to is treated differently from mail that is ignored for months.",
        "Consistency. A domain that sends 200 a day for a year and then sends 200,000 looks like a compromised domain.",
        "List hygiene. Sending to addresses that have not engaged in a year is the fastest way to teach a provider that your mail is unwanted.",
        "Separation. A subdomain for bulk mail keeps a bad campaign away from your password resets.",
      ],
    },
    {
      heading: "Third: content, which matters least and gets blamed most",
      body: [
        "Content filtering is real, and it is the last place to look rather than the first. A message with clean authentication and a good domain reputation survives content that would sink a cold send from an unknown domain.",
        "When content is the problem, it is usually structural rather than a specific word.",
      ],
      bullets: [
        "Image-only messages with almost no text.",
        "Link shorteners, or links whose domain does not match the sender.",
        "A large HTML payload with broken or unclosed markup.",
        "No plain-text alternative alongside the HTML part.",
        "A subject line that promises something the body does not deliver.",
      ],
    },
    {
      heading: "Test into a real inbox, not into the simulator",
      body: [
        "The SES mailbox simulator is the right tool for testing bounce and complaint handling, because AWS excludes it from your quota and your reputation metrics. It is the wrong tool for spam placement, because nothing is making a filtering decision.",
        "Send to real accounts at the providers your recipients actually use, and read the received headers on the delivered message. The authentication results header is the receiver telling you what it concluded, which is more useful than any checker.",
      ],
    },
  ],
  limits: {
    heading: "What nobody can promise you",
    body: [
      "Whether a message lands in the inbox or in spam is decided by the recipient's provider, using signals that include your domain reputation, the recipient's own behaviour, and factors none of us can see. No sending platform controls that outcome, and any vendor claiming otherwise is selling something.",
      "That is also the honest read on inbox-warmup services. Manufactured opens from accounts that will never buy anything teach a provider that your mail gets opened by people who do not care about it.",
      "What is actually controllable is the list above: authentication you can prove, reputation you can protect, and content you can keep boring. Wraps configures DKIM, SPF and DMARC records during domain setup, tracks bounces and complaints, and suppresses the addresses that generate them. It has no influence over a provider's filtering decision, and neither does anyone else.",
    ],
  },
  faqs: [
    {
      question: "Why do my Amazon SES emails go to spam?",
      answer:
        "In diagnosis order: authentication that does not pass or does not align, then domain reputation, then content. Uniform filtering across every provider almost always means authentication; selective filtering means reputation or content.",
    },
    {
      question: "Does SES have a worse reputation than a managed provider?",
      answer:
        "Most SES accounts send from a shared IP pool that AWS manages, and its reputation is generally good. What differs between senders on it is domain reputation, which is yours regardless of which service sends the mail.",
    },
    {
      question: "Will DMARC stop my email going to spam?",
      answer:
        "It removes one reason to filter you and it is required by major providers for bulk senders, so publishing it is not optional. It does not override a poor domain reputation.",
    },
    {
      question: "Do email warmup services fix SES spam placement?",
      answer:
        "They generate engagement from accounts that are not customers. That teaches providers something about those accounts rather than about your real recipients, and it does nothing for authentication, which is where most cases actually fail.",
    },
    {
      question: "Should I use a dedicated IP to improve inbox placement?",
      answer:
        "Rarely below high volume. A dedicated IP has no reputation until you build one, which means warming it slowly, and a cold IP performs worse than the shared pool until that work is done.",
    },
  ],
  related: [
    {
      href: "/tools",
      label: "Check your domain now",
      blurb:
        "SPF, DKIM, DMARC, MX, BIMI and blacklist checks in one pass. Free, no account.",
    },
    {
      href: "/blog/spf-guide",
      label: "SPF, in depth",
      blurb: "Including the ten-lookup limit that silently breaks SPF records.",
    },
    {
      href: "/blog/your-dmarc-policy-is-useless",
      label: "Why p=none does nothing",
      blurb:
        "The DMARC policy most domains publish, and what it actually buys.",
    },
    {
      href: "/docs/guides/reputation",
      label: "Domain reputation on SES",
      blurb: "The longer-run work behind the second layer above.",
    },
    {
      href: "/ses/complaint-rate",
      label: "Complaint rate",
      blurb:
        "Spam-button presses are the same signal providers use to filter you.",
    },
    {
      href: DELIVERABILITY_DOC,
      label: "AWS on SES deliverability",
      blurb:
        "AWS's own account of verification, authentication, quotas and content filtering.",
      external: true,
    },
  ],
};

export const metadata = sesTopicMetadata(topic);

export default function Page() {
  return <SesTopicArticle topic={topic} />;
}
