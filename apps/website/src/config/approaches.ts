/**
 * The four ways to send application email, as a rubric rather than a takedown.
 *
 * Source: ~/Obsidian/ops/sops/positioning.md, Section 1 — the positioning
 * canvas. That document is upstream of this file; if the two disagree, it wins.
 *
 * Note the shape: there are FOUR approaches and Wraps is inside the fourth, not
 * a fifth standing outside them. Wraps is a hosted platform over your own SES;
 * only the sending runs in your AWS account. Never call Wraps self-hosted. An earlier version of
 * this file made Wraps its own category and then recommended the free wrappers
 * over it, which argued us out of a category we lead. The comparison that
 * matters happens INSIDE the fourth approach, in WRAPPER_CRITERIA below.
 *
 * Fairness still holds and is still test-pinned: every approach carries a real
 * strength and a real reader, the reader with no AWS account is sent to a
 * hosted API, and WRAPS_LIMITS says where we lose. Fair is not the same as
 * deferential.
 *
 * Vendor prices are NOT inlined here — they live in `alternatives.ts`, which is
 * the single source of truth for every vendor number on the site.
 */

export type ApproachId =
  | "diy"
  | "sending-api"
  | "marketing-platform"
  | "oss-wrapper";

export type Approach = {
  id: ApproachId;
  /** Short label used in the rubric. */
  label: string;
  /** The approach stated as the buyer would state it. */
  title: string;
  /** One sentence for a reader who has never touched email infrastructure. */
  plain: string;
  /** Who plays here. Named, because a reader can check. */
  examples: string;
  /** What this approach is actually good at. Written to be fair. */
  pro: string;
  /** What it costs you. Specific rather than damning. */
  con: string;
  /** The reader this approach is for. */
  pickThisIf: string;
  /** True for the approach Wraps is one of. */
  isOurs?: boolean;
};

export const APPROACHES: readonly Approach[] = [
  {
    id: "diy",
    plain: "You set up Amazon's email service yourself, with nothing on top.",
    label: "Run SES yourself",
    title: "Run Amazon SES yourself",
    examples: "You, the AWS console, and a week",
    pro: "The cheapest way to send: $0.10 per 1,000 emails à la carte, $0.16 on the Essentials plan new accounts default to. The account is yours and you pay AWS directly. No third party sits in the send path, and there is nothing to migrate, ever.",
    con: "Sandboxed by default, and production access is an AWS approval that can be refused. You own bounce and complaint handling, and AWS pauses accounts that get it wrong. There is no dashboard, no templates, no event pipeline, no suppression UI and no message search until you build them.",
    pickThisIf:
      "Your sending is simple enough that one SendEmail call covers it, and you would rather own a hundred lines than a dependency.",
  },
  {
    id: "sending-api",
    plain: "You pay a company to send your email through its service.",
    label: "Rent a sending API",
    title: "Rent a sending API",
    examples: "Resend, Postmark, SendGrid, Mailgun",
    pro: "Working in minutes, with no AWS account at all. Resend's developer experience is excellent. Deliverability is somebody else's job, and when mail goes missing there is a support desk to ask.",
    con: "Markup that compounds with volume. Short log retention. Your sending history lives with them and leaves with them, and you keep no infrastructure when you go.",
    pickThisIf:
      "You have no AWS account and no appetite for one. Everything below this row assumes you are willing to hold an AWS account; if you are not, this is your row.",
  },
  {
    id: "marketing-platform",
    plain: "A tool for campaigns and automations, with the sending included.",
    label: "Rent a marketing platform",
    title: "Rent a marketing or notification platform",
    examples: "Customer.io, Klaviyo, Braze, Knock",
    pro: "Campaigns, segmentation and lifecycle automation that a non-engineer can operate without filing a ticket. A mature, well-understood category with people who already know how to run it.",
    con: "Contact-based pricing, so you pay for contacts who never open anything. Entry pricing before a single send. Sending is bundled in, so you cannot keep the platform and change the sender.",
    pickThisIf:
      "Someone who is not an engineer owns email day to day, and the contact-based bill is worth not having to build campaign tooling.",
  },
  {
    id: "oss-wrapper",
    plain:
      "Tooling that sets up Amazon's email service in your own account and adds a dashboard.",
    label: "Put a wrapper over your own SES",
    title: "Put a wrapper over your own SES",
    examples: "Wraps, OpenSend, useSend, MillionSend",
    pro: "You keep what the first row gives you — your AWS account, your sending domain, AWS's prices — and stop hand-building the parts that are identical for everybody. A dashboard, domain verification, templates, webhooks and an event pipeline, with code you can read and audit. Most of this category is free or close to it.",
    con: "You need an AWS account and someone willing to hold it, and production access is still an AWS approval nobody in this category can grant. Past that, the category varies enormously in how far beyond the API it goes, which is the whole decision once you are here.",
    pickThisIf:
      "You want sending to run in your own account, and you want tooling whose code you can read. This is the row Wraps is in.",
    isOurs: true,
  },
];

/**
 * The within-category comparison — the real decision for anyone who has landed
 * on the fourth approach, and the one nobody writes down, because every project
 * in the category writes about its API instead.
 *
 * Answers were read out of each project's own documentation in September 2026.
 * The last row is deliberately the one where we are no better than anyone else.
 */
export type WrapperCriterion = {
  question: string;
  others: string;
  wraps: string;
};

export const WRAPPER_CRITERIA: readonly WrapperCriterion[] = [
  {
    question: "Does it watch the rates AWS suspends accounts over?",
    others: "No",
    wraps:
      "Bounce and complaint rates drawn against AWS's review and pause lines, swept hourly, owners and admins notified",
  },
  {
    question: "Does it govern bounces and complaints, or only report them?",
    others: "Emits a webhook",
    wraps:
      "SES account-level suppression wired on for bounces and complaints from the first send",
  },
  {
    question: "Does it audit deliverability, or only verify the domain?",
    others: "Domain verification",
    wraps: "DKIM, SPF, DMARC, MX and TLS, BIMI and public blacklist checks",
  },
  {
    question: "What does it want from your AWS account?",
    others: "AWS credentials, in a container you run",
    wraps: "An IAM role you create and can revoke. No stored keys",
  },
  {
    question: "Can it get you SES production access?",
    others: "No",
    wraps:
      "No. Nobody in this category can — it is an AWS decision made from your own account. We detect the sandbox and explain it, and that is the end of what anyone can do",
  },
];

/** Where we lose, in the category we are part of. Test-pinned; do not soften. */
export const WRAPS_LIMITS = [
  "You need an AWS account. There is no version of this that works without one.",
  "We cannot grant SES production access, and some requests are refused.",
  "We don't have SOC 2 yet.",
  "Contacts, templates, workflows and per-message send records live in our database. Sending and the raw delivery events live in your AWS account.",
  "The SDKs are TypeScript and Python. That is the list.",
] as const;

/** The rubric's one-line framing. Kept here so the page and the test agree. */
export const APPROACHES_RUBRIC =
  "Four ways to send application email. Pick the row that describes you, not the one with the most checkmarks.";
