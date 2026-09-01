/**
 * Alternatives Pages Configuration
 * Single source of truth for the /alternatives/* ranked lists.
 *
 * Prices verified against vendor pricing pages in August 2026. Every claim here
 * is quotable by a skeptical reader, so keep it to what a vendor publishes —
 * no inferred tiers, no invented averages, no "up to X% cheaper" without the math.
 *
 * ## Why the shared/unique split is drawn where it is
 *
 * A vendor's price is a fact and must be identical everywhere it appears, so it
 * lives once on the vendor record. But rendering the same records across five
 * pages makes those pages near-duplicates of each other, which is a real
 * indexing risk: at 15 entries per page with long shared blocks, measured
 * pairwise similarity hit 39% and two thirds of each page's text also appeared
 * on a sibling.
 *
 * Two rules keep that in check, and a change that breaks either will quietly
 * undo the fix:
 *   1. Shared blocks stay terse. `bestFor` and `watchOut` are one or two
 *      sentences. Detail belongs in the per-page verdict, not here.
 *   2. Rosters are tailored, not copy-pasted. Only the handful of options that
 *      genuinely answer every incumbent appear on every page. If a vendor is a
 *      weak answer for this incumbent, cut it rather than padding to 15.
 *
 * `pnpm test` measures the result and fails if similarity climbs back.
 */

// =============================================================================
// TYPES
// =============================================================================

export type VendorId =
  | "agentmail"
  | "ahasend"
  | "amazon-ses"
  | "bavimail"
  | "brevo"
  | "cloudflare-email"
  | "courier"
  | "customer-io"
  | "klaviyo"
  | "knock"
  | "loops"
  | "mailersend"
  | "mailgun"
  | "mailslurp"
  | "mailtrap"
  | "mandrill"
  | "nylas"
  | "postmark"
  | "resend"
  | "scaleway-tem"
  | "self-hosted"
  | "sendgrid"
  | "smtp2go"
  | "wraps"
  | "zeptomail";

export type Vendor = {
  id: VendorId;
  name: string;
  /** One line on what kind of product this is, not what it costs. */
  category: string;
  /**
   * Published list price. The one shared block deliberately kept long: it is
   * the reason these pages get cited, and it has to be identical everywhere.
   */
  pricing: string;
  /** Who it genuinely suits. One sentence — detail goes in the verdict. */
  bestFor: string;
  /** What they find out in month three. Every vendor gets one, ours included. */
  watchOut: string;
  /** Vendor's own site, for readers who want to check our numbers. */
  url: string;
  /** Set on our own product so the page can label it honestly. */
  isUs?: boolean;
};

export type RankedEntry = {
  vendor: VendorId;
  /**
   * Why a reader leaving *this* incumbent would land here, with the cost
   * comparison against that incumbent where there is one. This is the page's
   * unique content and should carry more weight than the shared blocks.
   */
  verdict: string;
  /** Set on the incumbent's own entry — "stay put" is a real option. */
  isIncumbent?: boolean;
};

export type AlternativesPage = {
  slug: string;
  /** The incumbent this page is about. */
  incumbent: string;
  title: string;
  description: string;
  /** Hero paragraph: who is reading this and what they are deciding. */
  intro: string;
  /** Sourced, specific reasons people move off the incumbent. */
  whyPeopleLeave: readonly string[];
  /** "If X, pick Y" — the part a reader in a hurry actually uses. */
  router: readonly { condition: string; pick: string }[];
  /**
   * The head-to-head page for the same incumbent. Stated explicitly rather
   * than derived from the slug: /compare/* is no longer in the nav, so these
   * links are most of what keeps those pages reachable, and a silent break
   * would strand them. Omitted when no head-to-head exists for this incumbent
   * — the test still enforces that any href set here points at a real page.
   */
  compareHref?: string;
  /** Tailored to this incumbent. Cut weak answers rather than padding. */
  ranked: readonly RankedEntry[];
  /** The honest case for not moving at all. */
  stayIf: readonly string[];
};

// =============================================================================
// VENDORS
// =============================================================================

export const VENDORS: Record<VendorId, Vendor> = {
  "amazon-ses": {
    id: "amazon-ses",
    name: "Amazon SES",
    category: "Raw sending infrastructure from AWS",
    pricing:
      "$0.10 per 1,000 emails on à la carte. New accounts are defaulted to the Essentials plan at $0.16 per 1,000; Pro is $105/mo + $0.22 per 1,000 and Enterprise $500/mo + $0.23 per 1,000. Plans are per-account, per-Region.",
    bestFor:
      "Teams already on AWS with an engineer willing to own the plumbing.",
    watchOut:
      "Production access is an application AWS can refuse, and new accounts start sandboxed to verified addresses. No dashboard, no templates, and nothing stores your events until you build it.",
    url: "https://aws.amazon.com/ses/pricing/",
  },
  postmark: {
    id: "postmark",
    name: "Postmark",
    category: "Transactional email API, deliverability-first",
    pricing:
      "Basic $15, Pro $16.50, Platform $18 per month — each including 10,000 emails. Overage runs $1.80, $1.30, and $1.20 per 1,000 respectively. Dedicated IP $50/mo on Pro and above, 300K/mo minimum.",
    bestFor:
      "Transactional email where inbox placement matters more than unit price.",
    watchOut:
      "The economics invert at volume — roughly $630 at 500K/mo against $50 of raw SES. Marketing tooling is deliberately thin, and the early-2026 repricing means long-standing accounts are not on these numbers.",
    url: "https://postmarkapp.com/pricing",
  },
  resend: {
    id: "resend",
    name: "Resend",
    category: "Developer-first email API built on SES",
    pricing:
      "Free 3,000/mo (100/day). Pro $20 at 50K and $35 at 100K. Scale $350 at 500K. Overage $0.65–0.90 per 1,000. Marketing contacts billed separately at $40/mo per 5,000.",
    bestFor:
      "The fastest path from an empty project to a sent email, especially with React Email.",
    watchOut:
      "Logs are purged at 30 days on every non-Enterprise plan, the API is capped at 2 requests per second on all tiers, and suspension during traffic spikes is the complaint that recurs in its public reviews.",
    url: "https://resend.com/pricing",
  },
  loops: {
    id: "loops",
    name: "Loops",
    category: "Product + marketing email for SaaS, priced per contact",
    pricing:
      "Free at 1,000 contacts and 4,000 sends/mo. Paid plans price on subscribed contacts with unlimited sends — $49/mo in the 1K–5K band, $99/mo in the 5K–10K band, rising from there.",
    bestFor:
      "SaaS teams who want lifecycle and transactional in one tool and never want to count sends again.",
    watchOut:
      "You pay for contacts, not sends, so a large dormant free list stays on the bill. It is a product rather than a primitive, with less low-level control than an email API.",
    url: "https://loops.so/pricing",
  },
  mailgun: {
    id: "mailgun",
    name: "Mailgun",
    category: "High-volume email API with routing and validation",
    pricing:
      "Basic $15 at 10K. Foundation $35 at 50K and $75 at 100K. Scale $90 at 100K rising to $400 at 500K. Dedicated IP included from the $75/mo plans; extra IPs $59/mo each.",
    bestFor:
      "High-volume sending where routing, validation, and log search need to come from one vendor.",
    watchOut:
      "Flex closed to new signups in December 2025 and the legacy rate doubled to $2 per 1,000. The free tier is a hard 100/day cap, and suspensions recur in reviews.",
    url: "https://www.mailgun.com/pricing/",
  },
  sendgrid: {
    id: "sendgrid",
    name: "SendGrid",
    category: "Twilio's email platform — API, SMTP, and marketing",
    pricing:
      "Essentials $19.95 at 50K and $34.95 at 100K. Pro $89.95 at 100K, $249 at 300K, $499 at 700K. Dedicated IP is Pro and above; extra IPs $30/mo. Marketing Campaigns is priced as its own plan, not an add-on.",
    bestFor:
      "Enterprises wanting one procurement relationship, SMTP everywhere, and marketing in the same console.",
    watchOut:
      "The free tier died on 27 May 2025, replaced by a 60-day trial at 100/day. Support latency and abrupt account suspensions dominate its public reviews.",
    url: "https://sendgrid.com/en-us/pricing",
  },
  mailersend: {
    id: "mailersend",
    name: "MailerSend",
    category: "Email API with a drag-and-drop template builder",
    pricing:
      "Free 500/mo (100/day). Starter $35/mo at 50K ($31.50 annual). Professional $110/mo at 50K ($99 annual). Overage from $1.30 per 1,000, falling as plan size grows.",
    bestFor:
      "Mid-market teams who need a template builder a non-engineer can open.",
    watchOut:
      "The free tier is only 500 emails a month, and Professional costs $75/mo more than Starter for identical volume — you are buying seats and retention, not sending.",
    url: "https://www.mailersend.com/pricing",
  },
  ahasend: {
    id: "ahasend",
    name: "AhaSend",
    category: "Pay-as-you-go transactional email API",
    pricing:
      "First 1,000 emails a month free, then $0.50 per 1,000 — $5/mo covers 10,000. No recipient limits and no plan brackets.",
    bestFor:
      "Indie and cost-sensitive projects wanting near-SES pricing without an AWS account.",
    watchOut:
      "Small and young: fewer integrations, a short deliverability record, and thinner support than any incumbent on this list.",
    url: "https://ahasend.com/pricing",
  },
  bavimail: {
    id: "bavimail",
    name: "Bavimail",
    category: "Low-cost transactional API with inbound and per-agent inboxes",
    pricing:
      "Free 6,000/mo (200/day) with 3 inboxes. Pro $5/mo for 50K emails, 10 domains, 10 inboxes per domain. Startup $50/mo for 300K plus overage. Annual billing takes those to $48 and $492 a year.",
    bestFor:
      "Cost-sensitive teams wanting a Resend-shaped API with inbound and per-agent inboxes included.",
    watchOut:
      "New and small, with no published deliverability record, no dedicated-IP or warm-up option, SDKs in TypeScript and Python only, and no overage rate on the pricing page.",
    url: "https://bavimail.com/pricing",
  },
  smtp2go: {
    id: "smtp2go",
    name: "SMTP2GO",
    category: "SMTP relay with strong reporting",
    pricing:
      "Free 1,000/mo (200/day). Starter $10/mo at 10K. Professional from $75/mo at 100K, which is where dedicated IPs and inbound parsing unlock. Overage $1 per 1,000 on Starter, $0.85 on Professional.",
    bestFor:
      "Apps and appliances that need a relay to just work, with reporting good enough to debug from.",
    watchOut:
      "Relay-first by design: no modern SDK, no lifecycle automation, and no React template rendering.",
    url: "https://www.smtp2go.com/pricing/",
  },
  mailtrap: {
    id: "mailtrap",
    name: "Mailtrap",
    category: "Email sandbox plus production sending",
    pricing:
      "Free 4,000/mo (150/day). Basic $15 at 10K, $20 at 50K, $30 at 100K. Business from $85/mo at 100K with dedicated IPs and auto warm-up. The testing sandbox is a separate product from $17/mo.",
    bestFor:
      "Teams wanting one vendor for staging capture and production sending.",
    watchOut:
      "The sandbox is the mature half of the product and production sending is the newer one. Log retention is short on the lower plans.",
    url: "https://mailtrap.io/pricing/",
  },
  zeptomail: {
    id: "zeptomail",
    name: "ZeptoMail",
    category: "Zoho's transactional-only email service",
    pricing:
      "Credit-based pay-as-you-go — one credit covers 10,000 emails and is valid for six months. No monthly fee. The first credit is free.",
    bestFor:
      "The cheapest credible transactional API if you will never touch a marketing feature.",
    watchOut:
      "Credits expire at six months whether used or not. Transactional-only is enforced policy, not guidance, and the tooling is Zoho's.",
    url: "https://www.zoho.com/zeptomail/pricing.html",
  },
  brevo: {
    id: "brevo",
    name: "Brevo",
    category: "EU marketing platform with a transactional API attached",
    pricing:
      "Priced on send volume rather than contacts. Starter runs from roughly $9/mo at 5,000 emails to roughly $69/mo at 100,000; the Business tier is roughly double at each volume and is where automation and A/B testing live.",
    bestFor:
      "Small EU teams wanting email, SMS, and a light CRM on one invoice.",
    watchOut:
      "The headline tier is not the one you need — automation and removing the Brevo logo are both a step up. Shared-pool deliverability draws mixed reports.",
    url: "https://www.brevo.com/pricing/",
  },
  "scaleway-tem": {
    id: "scaleway-tem",
    name: "Scaleway Transactional Email",
    category: "European cloud provider's SES equivalent",
    pricing:
      "Free 300/mo, then €0.25 per 1,000 on Essential with no monthly fee. The Scale plan bundles 100K plus a dedicated IP, with €0.20 per additional 1,000.",
    bestFor:
      "EU data residency with no US cloud in the path, at near-SES pricing.",
    watchOut:
      "European footprint only, a much smaller ecosystem than AWS, and effectively no tooling above the endpoint.",
    url: "https://www.scaleway.com/en/transactional-email-tem/",
  },
  mandrill: {
    id: "mandrill",
    name: "Mailchimp Transactional (Mandrill)",
    category: "Transactional add-on to Mailchimp",
    pricing:
      "$20 per block of 25,000 emails — $0.80 per 1,000. Requires a paid Mailchimp Standard or Premium plan underneath. Dedicated IP $29.95/mo.",
    bestFor:
      "Teams already paying for Mailchimp who want transactional on the same account.",
    watchOut:
      "Not purchasable standalone, so the real price includes a Mailchimp plan you may not want. Eight times raw SES per email, with little recent investment.",
    url: "https://mailchimp.com/features/transactional-email/",
  },
  "customer-io": {
    id: "customer-io",
    name: "Customer.io",
    category: "Behavioral messaging and lifecycle automation",
    pricing:
      "Essentials $100/mo for 5,000 profiles, then $0.009 per additional profile — roughly $145 at 10K, $505 at 50K, and $955 at 100K. Premium starts at $1,000/mo.",
    bestFor: "Behavioral lifecycle messaging a marketing team owns day to day.",
    watchOut:
      "You pay per profile whether or not you ever message them, so signups you never email still raise the bill.",
    url: "https://customer.io/pricing",
  },
  klaviyo: {
    id: "klaviyo",
    name: "Klaviyo",
    category: "Ecommerce marketing automation",
    pricing:
      "$30/mo at 1,000 profiles, $100 at 5,000, $150 at 10,000, $720 at 50,000, and $1,380 at 100,000 — an effective $0.014–0.030 per profile per month.",
    bestFor:
      "Ecommerce, especially Shopify, where per-campaign revenue attribution is the metric.",
    watchOut:
      "Bills all active profiles since February 2025 and auto-upgrades without ever auto-downgrading. Volume is capped at ten times your profile count and sends halt past it.",
    url: "https://www.klaviyo.com/pricing",
  },
  knock: {
    id: "knock",
    name: "Knock",
    category: "Notification infrastructure across email, push, SMS, and in-app",
    pricing: "$250/mo plus $5 per 1,000 notifications.",
    bestFor:
      "Cross-channel product notifications with user preferences and an in-app inbox.",
    watchOut:
      "It orchestrates rather than sends, so you still pay a sending provider underneath, on top of a $250 monthly floor.",
    url: "https://knock.app/pricing",
  },
  courier: {
    id: "courier",
    name: "Courier",
    category: "Notification API and routing layer",
    pricing: "Pay-as-you-go at $0.005 per send, with no base fee.",
    bestFor:
      "Multi-channel notification routing without a platform fee, at low or spiky volume.",
    watchOut:
      "Also routes rather than delivers. At $5 per 1,000 it is fifty times raw SES for the routing alone.",
    url: "https://www.courier.com/pricing",
  },
  "self-hosted": {
    id: "self-hosted",
    name: "Self-hosted (Postal, Listmonk, or your own MTA)",
    category: "Open-source mail server you run yourself",
    pricing:
      "The software is free. You pay for servers, IP addresses, and your own time.",
    bestFor:
      "Teams with a real reason to run an MTA and the operational capacity to staff it.",
    watchOut:
      "IP warming, blocklist remediation, feedback loops, and DMARC alignment become an on-call rotation rather than a one-time setup task.",
    url: "https://docs.postalserver.io/",
  },
  agentmail: {
    id: "agentmail",
    name: "AgentMail",
    category: "Hosted inbox API built specifically for AI agents",
    pricing:
      "Free at 3 inboxes, 3,000 emails/mo and 100/day. Developer $20/mo for 10 inboxes and 10,000 emails/mo. Startup $200/mo for 150 inboxes and 15,000 emails/day, with monthly volume quoted. Enterprise is custom. Overage rates are not published.",
    bestFor:
      "Agent builders who want an inbox from a single API call and no email infrastructure to run.",
    watchOut:
      "Plans meter inboxes before volume — Developer caps at 10 — so a fleet outgrows the tier long before the send limit. Mail sits in their storage, and no compliance certification is published.",
    url: "https://agentmail.to/pricing",
  },
  mailslurp: {
    id: "mailslurp",
    name: "MailSlurp",
    category: "Programmatic inboxes over an API, with SMTP and IMAP",
    pricing:
      "Free sandbox: 1 permanent inbox, 500 inbound and 25 outbound emails. Pro $49.99/mo for unlimited permanent inboxes, 5,000 inbound and 500 outbound. Team $129.99/mo. Overage $0.99 per 1,000 emails.",
    bestFor:
      "Agents needing many inboxes on demand, reachable over REST, SMTP, and IMAP alike.",
    watchOut:
      "Built for test automation first, so outbound allowances are small — 500 a month on Pro — and being a production sender of record is not what the product optimises for.",
    url: "https://app.mailslurp.com/pricing/",
  },
  nylas: {
    id: "nylas",
    name: "Nylas",
    category: "Unified API for real Gmail and Outlook mailboxes",
    pricing:
      "Free sandbox with 5 connected accounts. Full Platform $15/mo base including 5 connected accounts and 20 agent accounts, then $2.00 per extra account and $0.20 per extra agent account. Calendar-only $10/mo. Enterprise custom.",
    bestFor:
      "Agents that must work inside a person's existing mailbox rather than from an address of their own.",
    watchOut:
      "Billing follows connected accounts, and you inherit Google and Microsoft OAuth review — a security assessment on their schedule, not yours, and a common cause of slipped launch dates.",
    url: "https://www.nylas.com/pricing/",
  },
  "cloudflare-email": {
    id: "cloudflare-email",
    name: "Cloudflare Email Routing",
    category: "Free inbound email routing into a Worker you write",
    pricing:
      "Email Routing is free: 200 routing rules per domain, 200 destination addresses per account, 25 MiB per message. Outbound is a separate Cloudflare Email Service with its own quota, and Workers CPU limits apply on the free plan.",
    bestFor:
      "Receiving agent mail straight into code you already run on Workers, at no cost.",
    watchOut:
      "Routing is inbound only, so most setups still need a sending provider alongside it. There is no mailbox and no threading — only the handler you write and whatever you decide to store.",
    url: "https://developers.cloudflare.com/email-routing/limits/",
  },
  wraps: {
    id: "wraps",
    name: "Wraps",
    category: "Email platform that sends through your own AWS account",
    pricing:
      "Platform fee only: Free ($0/mo), Pro ($29/mo), Business ($199/mo) — priced on AWS accounts, dashboard history, and governance features, not send volume. Sending is billed by AWS directly — $0.10 per 1,000 on SES à la carte, or $0.16 on the Essentials plan new AWS accounts are defaulted to. Contacts are unlimited on every tier.",
    bestFor:
      "Teams already on AWS who want the platform layer without sending or logs leaving their account.",
    // Deliberately the longest watch-out on the page. Shortening ours while
    // trimming everyone else's would quietly tilt the list in our favour, and
    // src/__tests__/alternatives.test.ts asserts each of these four facts.
    watchOut:
      "You need an AWS account and SES production access, an AWS approval taking 1–72 hours that is not ours to grant. SDKs are TypeScript and Python only. Contacts, templates, and workflow state live in our database, not yours — only sending data and delivery events land in your AWS. We are not SOC 2 certified.",
    url: "https://wraps.dev",
    isUs: true,
  },
};

// =============================================================================
// PAGES
// =============================================================================

const RESEND_PAGE: AlternativesPage = {
  slug: "resend",
  compareHref: "/compare/resend-vs-wraps",
  incumbent: "Resend",
  title: "Resend Alternatives",
  description:
    "Twelve real alternatives to Resend, ranked, with published prices and the catch on each one. Postmark, Amazon SES, Loops, AhaSend, and where Wraps actually fits.",
  intro:
    "Resend is a good product, and most people reading this are not leaving because it is bad. They are leaving because of a specific thing: logs vanishing at 30 days, a 2 request/second ceiling, an overage line on an invoice, or a suspension at the worst possible hour. Which of those it is decides where you should go, so this list is ordered by how close each option is to being a straight replacement, not by which one we would prefer you pick.",
  whyPeopleLeave: [
    "Log retention is 30 days on every non-Enterprise plan. The bounce you need to explain three months later is not there any more.",
    "The API is rate limited to 2 requests per second on every plan, Scale included.",
    "Overage bills automatically at $0.65 to $0.90 per 1,000 once you pass your tier, and the hard caps that used to stop it were removed in December 2025.",
    "Account suspension during a traffic spike. It is the complaint that repeats across their public reviews, and it lands on signup and password-reset email first.",
  ],
  router: [
    {
      condition: "Deliverability is why you are leaving",
      pick: "Postmark. Nothing else here has a longer track record at inbox placement.",
    },
    {
      condition: "Price is why, and you have an AWS account",
      pick: "Amazon SES direct, or Wraps if you want the platform layer back on top of it.",
    },
    {
      condition: "Price is why, and you do not want AWS",
      pick: "AhaSend at $0.50 per 1,000, or ZeptoMail if credits that expire are acceptable.",
    },
    {
      condition: "You need the logs to be yours",
      pick: "Amazon SES or Wraps. Every hosted option here retains events on their terms, not yours.",
    },
    {
      condition: "You want marketing and product email in one place",
      pick: "Loops. Unlimited sends, priced on contacts.",
    },
    {
      condition: "You need EU data residency",
      pick: "Scaleway Transactional Email, or SES in an EU region.",
    },
  ],
  ranked: [
    {
      vendor: "postmark",
      verdict:
        "The straight swap when deliverability is the reason, and the one option here that is unambiguously better at the single thing Resend gets complained about least. You will pay for it: about $133 at 100K a month against Resend's $35, and roughly $630 at 500K against Resend's $350. The trade is a vendor whose entire product thesis is inbox placement and whose support answers, in exchange for roughly four times the unit price. If receipts and password resets going missing is what brought you here, that is a good trade. If it is not, keep reading.",
    },
    {
      vendor: "amazon-ses",
      verdict:
        "Resend runs on SES, so this is removing the layer rather than replacing it. At 100K a month you go from $35 to about $10, and at 500K from $350 to about $50. What that money was buying comes back to you as work: the dashboard, the template rendering, the suppression list, the retry logic, and an EventBridge pipeline to store the events Resend was keeping for 30 days. Budget an engineer-week or two, and know that production access is an application AWS can refuse and that new accounts start sandboxed.",
    },
    {
      vendor: "loops",
      verdict:
        "The closest thing to Resend's feel for a SaaS team that also sends lifecycle email, and the only option here that removes overage anxiety completely, because paid plans have unlimited sends. The bill moves from volume to contacts, which is a straight win if you send a lot to a small list and a straight loss if you have 40,000 free signups you email twice a year. At $49 for the 1K to 5K band it undercuts Resend Pro; past about 20,000 contacts the arithmetic turns against it.",
    },
    {
      vendor: "wraps",
      verdict:
        "The answer specifically to the retention and suspension complaints rather than to price. Sending runs through SES in your own AWS account and delivery events land in your own DynamoDB, so the 30-day purge stops applying and the only party who can freeze your sending is AWS. Workflows are defined in TypeScript and pushed from the CLI, so a lifecycle change is reviewed in a pull request instead of clicked into a canvas. At 100K a month sending is about $10 of SES plus a flat platform fee of $0 to $199 depending on the plan, not on how much you send. It needs an AWS account, which is simultaneously the entire point and the entire cost.",
    },
    {
      vendor: "ahasend",
      verdict:
        "The nearest thing to SES pricing without opening an AWS account: $0.50 per 1,000, no brackets, no recipient limits. That is about $50 at 100K against Resend's $35, but about $250 at 500K against Resend's $350, so the crossover sits somewhere near 150K. The honest caveat is size. Weigh a young vendor with a short deliverability record against whatever you are about to move onto it, and probably do not start with your payment receipts.",
    },
    {
      vendor: "bavimail",
      verdict:
        "The nearest thing on this list to Resend's shape at a fraction of the price, and it adds the half Resend does not have: inbound MX, parsing, and webhook routing are in the base product. Pro is $5 at 50K against Resend Pro's $20, and Startup covers 300K for $50 where Resend Scale is $350 at 500K. Read that gap as the risk it is. No published deliverability record, no dedicated IP to move to if a shared pool goes bad, and no overage rate on the pricing page, so model your worst month before you put payment receipts on it.",
    },
    {
      vendor: "mailersend",
      verdict:
        "If what you actually liked about Resend was React Email but what your team now needs is a template a marketer can edit without a deploy, this is the trade. Starter at $35 for 50K matches Resend Pro's price at the same volume, so you are swapping developer ergonomics for a builder rather than saving money. Note the free tier is 500 emails a month, so evaluating it properly costs real money almost immediately.",
    },
    {
      vendor: "smtp2go",
      verdict:
        "A step sideways rather than up, and honest about it. There is no SDK story to speak of, but the relay stays up, the reporting is better than the price suggests, and $10 a month at 10K undercuts Resend Pro for small senders. Worth considering if you have realised you were paying for developer experience you stopped using the day after the integration was written.",
    },
    {
      vendor: "mailtrap",
      verdict:
        "Worth a look specifically if part of your Resend friction was that staging email behaved nothing like production. One vendor for sandbox capture and live sending removes a whole class of bug that only shows up after deploy. Basic at $30 for 100K is cheaper than Resend Pro at the same volume, though you are buying two products that share a login and the sending half is the newer one.",
    },
    {
      vendor: "zeptomail",
      verdict:
        "The cheapest credible option on this page if you will never touch a marketing feature, at roughly a tenth of Resend's unit cost. Transactional-only is enforced policy rather than a suggestion, so a drip sequence will get you shut off. Credits expiring at six months whether or not you used them makes it a poor fit for spiky or seasonal sending.",
    },
    {
      vendor: "mailgun",
      verdict:
        "More product than Resend, with inbound routing, email validation, and deep log search, at pricing that stopped being competitive when Flex closed to new signups in December 2025. At 100K you pay $75 to $90 against Resend's $35. Pick it because you need the routing and validation in one place, not because you are trying to save money, and note that it draws the same suspension complaints you may be leaving over.",
    },
    {
      vendor: "scaleway-tem",
      verdict:
        "On this list for one reason: jurisdiction. €0.25 per 1,000 with no US cloud anywhere in the path, which is usually a requirement a buyer hands you rather than a preference you choose. Expect an SMTP endpoint and an API and nothing resembling Resend's tooling, and expect a much smaller ecosystem when something goes wrong at 2am.",
    },
    {
      vendor: "resend",
      isIncumbent: true,
      verdict:
        "Staying is a real option and often the correct one. If the free tier covers you, if React Email is load-bearing for how your team builds, or if you need SDKs in nine languages today, nothing above is an upgrade, because most of this list ships two or three. Migration costs an engineering week plus a month of watching deliverability graphs, and being cheaper rarely repays that below about 100K a month. Leave over retention, rate limits, or a suspension. Do not leave over $15.",
    },
  ],
  stayIf: [
    "You are under 3,000 emails a month and the free tier covers it.",
    "You need SDKs in Python, Ruby, Go, PHP, Java, Rust, or .NET today. Resend ships nine languages; most of this list ships two or three.",
    "You want managed dedicated IP warming without thinking about it.",
    "Nothing in the list of reasons above describes a problem you actually have.",
  ],
};

const SENDGRID_PAGE: AlternativesPage = {
  slug: "sendgrid",
  compareHref: "/compare/sendgrid-vs-wraps",
  incumbent: "SendGrid",
  title: "SendGrid Alternatives",
  description:
    "Twelve real alternatives to SendGrid, ranked, with published prices and the catch on each. Postmark, Amazon SES, Resend, SMTP2GO, and where Wraps actually fits.",
  intro:
    "Most people leaving SendGrid are not shopping for features. They are reacting to something: the free tier ending, a suspension with no self-serve way back, a support ticket that went nowhere, or a Pro invoice that is nine times what the same sending costs on raw SES. This list is ordered by how well each option answers those specific complaints.",
  whyPeopleLeave: [
    "The free tier ended on 27 May 2025. What replaced it is a 60-day trial capped at 100 emails a day.",
    "Suspensions and slow support are the two themes that dominate its public reviews, and there is no self-serve path back once sending is frozen.",
    "Marketing Campaigns is now priced as its own plan rather than a cheap add-on, which turned into a step-change bill for teams using both halves.",
    "Pro at $89.95 for 100K a month is roughly nine times what the same volume costs sending through SES directly.",
  ],
  router: [
    {
      condition: "You left because email stopped arriving",
      pick: "Postmark. Deliverability is the entire product thesis.",
    },
    {
      condition: "You left over price and have AWS",
      pick: "Amazon SES direct, or Wraps if you want a dashboard and templates back on top.",
    },
    {
      condition: "You left over price and do not want AWS",
      pick: "AhaSend or ZeptoMail. Both are an order of magnitude below SendGrid per email.",
    },
    {
      condition: "You need SMTP that works with a legacy system",
      pick: "SMTP2GO. That is precisely what it is for.",
    },
    {
      condition: "You were using Marketing Campaigns too",
      pick: "Brevo. Replacing both halves with two separate vendors usually costs more than one.",
    },
    {
      condition: "A suspension is what you are protecting against",
      pick: "Amazon SES or Wraps. Sending from your own AWS account changes who holds the switch.",
    },
  ],
  ranked: [
    {
      vendor: "postmark",
      verdict:
        "The default recommendation for a team leaving over deliverability or support, and the clearest cultural opposite of SendGrid: smaller, more opinionated, transactional-first, and it answers the phone. The catch is the direction of travel on price. About $133 at 100K a month against SendGrid Essentials at $34.95, and roughly $630 at 500K. You would be paying more, deliberately, for the two things SendGrid is most criticised for.",
    },
    {
      vendor: "amazon-ses",
      verdict:
        "The largest cost reduction available on this page: about $10 at 100K a month against SendGrid Pro's $89.95, and about $50 at 500K against $499 for the 700K tier. You are trading a console for an API, so budget engineering time for the dashboard, suppression handling, template rendering, and event storage you are about to inherit. Production access is a written application AWS can deny, which is a real risk if you are migrating under time pressure after a suspension.",
    },
    {
      vendor: "resend",
      verdict:
        "The biggest single jump in quality of life if SendGrid's console and SDKs are what you resent, and cheaper too, at $35 for 100K against Pro's $89.95. Read its own terms before committing: logs purge at 30 days on every non-Enterprise plan, the API is capped at 2 requests per second on every plan, and suspension complaints exist there too, just fewer of them.",
    },
    {
      vendor: "wraps",
      verdict:
        "For teams whose real objection is that a vendor can freeze their transactional email with no self-serve way back. Sending runs through SES in your own AWS account and delivery events land in your own DynamoDB, so suspension risk moves to AWS and log history stops being rented. Templates, broadcasts, segments, and workflows stay a hosted product, and workflows can be defined in TypeScript and pushed from the CLI. At 100K a month that is about $10 of SES plus a $19 to $79 platform fee depending on events tracked. You need an AWS account and SES production access, which is an AWS decision on AWS's timeline.",
    },
    {
      vendor: "mailgun",
      verdict:
        "The most like-for-like swap in feature terms, with API, SMTP, routing, validation, and log search all present, and for exactly that reason the one to think hardest about. It draws the same suspension complaints that probably brought you here, and its cheap on-ramp closed when Flex stopped accepting new signups. At $75 to $90 for 100K it is priced against SendGrid Pro rather than under it.",
    },
    {
      vendor: "mailersend",
      verdict:
        "The sensible landing spot for teams who actually used SendGrid's template editor and need that to keep existing. Starter at $35 for 50K undercuts Essentials at the same volume, and the API is materially cleaner. The free tier at 500 emails a month is far stingier than what SendGrid used to give you, so plan the evaluation accordingly.",
    },
    {
      vendor: "smtp2go",
      verdict:
        "If SendGrid was only ever an SMTP relay to you, for a printer, a CRM, or an old PHP app, this replaces it exactly for $10 a month at 10K, or $75 at 100K with dedicated IPs included. There is nothing here for lifecycle or marketing, which is rather the point: you stop paying for a platform to do a relay's job.",
    },
    {
      vendor: "brevo",
      verdict:
        "The closest thing to a one-for-one replacement if you were using both transactional and Marketing Campaigns, and the only option here priced on send volume rather than contacts. Roughly $69 at 100K on Starter, against SendGrid Essentials plus a separate Marketing Campaigns plan. The developer experience is a clear step down, and the tier you actually need is usually one above the headline.",
    },
    {
      vendor: "ahasend",
      verdict:
        "$0.50 per 1,000 with no brackets works out around $50 at 100K, roughly half SendGrid Pro, and about $250 at 500K against $499. The counterweight is that you would be moving from one of the largest senders in the world to one of the smallest, with a correspondingly short deliverability record. Read the watch-out and decide with your eyes open.",
    },
    {
      vendor: "bavimail",
      verdict:
        "The far end of the market from Twilio: no procurement, no seat model, no separate marketing SKU, and a bill of $5 at 50K against Essentials' $19.95, or $50 at 300K against Pro's $249. What you give up is most of what the enterprise plan was for — dedicated IPs, a compliance package, a support contract, and a vendor with a decade of sending behind it. Sensible for a small product that got a SendGrid invoice it did not expect. Not the move if you chose SendGrid because legal asked who the sub-processor was.",
    },
    {
      vendor: "zeptomail",
      verdict:
        "The cheapest thing on this page that a serious team would put a password reset on, at roughly a twentieth of SendGrid Pro per email. Transactional-only is enforced, so any marketing traffic you were running through SendGrid has to go somewhere else, which usually means two vendors instead of one. Credits expiring at six months makes it a bad fit for seasonal senders.",
    },
    {
      vendor: "mandrill",
      verdict:
        "Only makes sense if you already pay for Mailchimp, because it cannot be bought standalone. The real price is $20 per 25,000 emails plus a Mailchimp Standard or Premium plan underneath. At $0.80 per 1,000 it is eight times raw SES for a product that has seen little investment in years. It is on this list because teams in exactly this position genuinely do consolidate this way.",
    },
    {
      vendor: "sendgrid",
      isIncumbent: true,
      verdict:
        "Staying is defensible more often than the internet suggests. It handles enormous volume, SMTP works with everything, and if you have a procurement relationship, negotiated pricing, and an account manager who picks up, that is worth real money and none of the list prices above apply to you anyway. Nobody switches email providers for fun. Leave over a suspension or a support failure, not over a feature comparison.",
    },
  ],
  stayIf: [
    "You have a Twilio relationship, an account manager, and a contract that already covers this.",
    "You are sending at a volume where you have negotiated pricing that is nothing like the list prices above.",
    "SMTP compatibility with an old system is the requirement, and it currently works.",
    "Your deliverability is fine and your bill is not the problem. Migration is not free.",
  ],
};

const POSTMARK_PAGE: AlternativesPage = {
  slug: "postmark",
  compareHref: "/compare/postmark-vs-wraps",
  incumbent: "Postmark",
  title: "Postmark Alternatives",
  description:
    "Eleven real alternatives to Postmark, ranked, with published prices and the catch on each. Amazon SES, Resend, Loops, AhaSend, and where Wraps actually fits.",
  intro:
    "Almost nobody leaves Postmark unhappy with the email. They leave because the bill outgrew the value, or because they now need broadcasts and lifecycle automation that Postmark deliberately does not do. Those are two different problems with two different answers, so the router below matters more here than on any other page in this set.",
  whyPeopleLeave: [
    "The bill at volume. Roughly $133 a month at 100K and $630 at 500K, against about $10 and $50 of raw SES for the same sending.",
    "The early-2026 restructuring moved everyone onto Basic, Pro, and Platform with 10,000 emails included and per-1,000 overage on top, which raised costs for a lot of long-standing accounts.",
    "It is transactional by design. The moment you need broadcasts, segments, or lifecycle automation, you are adding a second vendor and a second bill.",
    "There are no published volume tiers past the standard plans. Above roughly 1.5M a month you are in a sales conversation rather than on a pricing page.",
  ],
  router: [
    {
      condition: "Price is the only reason and you have AWS",
      pick: "Amazon SES direct. Same delivery tier at a tenth the price, minus everything else.",
    },
    {
      condition: "Price is the only reason and you do not want AWS",
      pick: "AhaSend at $0.50 per 1,000, with no brackets and no recipient limits.",
    },
    {
      condition: "You need lifecycle and broadcasts as well as transactional",
      pick: "Wraps or Loops, depending on whether you want your own infrastructure or the simplest possible product.",
    },
    {
      condition: "You need marketing automation a marketer will own",
      pick: "Customer.io, if you can live with per-profile pricing.",
    },
    {
      condition: "You want Postmark's feel with a lower bill",
      pick: "Resend. Read its retention and rate-limit terms first.",
    },
    {
      condition: "Deliverability is the reason you chose Postmark",
      pick: "Stay. That is the thing you would be giving up, and it is hard to buy back.",
    },
  ],
  ranked: [
    {
      vendor: "amazon-ses",
      verdict:
        "The honest answer to a Postmark bill. At 500K a month you go from roughly $630 of sending to roughly $50, and at 100K from about $133 to about $10. You then spend some of that difference rebuilding what Postmark was quietly doing: message search, suppression handling, template rendering, bounce classification, and somewhere to keep the events. The deliverability question is the real one, since SES gives you a shared reputation pool and no opinion about your sending practices, which is precisely the opposite of what you were buying.",
    },
    {
      vendor: "resend",
      verdict:
        "The nearest thing to Postmark's developer experience at a materially lower bill: $35 at 100K against roughly $133, and $350 at 500K against roughly $630. Both are transactional-first with good SDKs, so the migration is genuinely small. The costs are 30-day log retention on every non-Enterprise plan, a 2 request/second API ceiling, and a support culture that is not Postmark's.",
    },
    {
      vendor: "wraps",
      verdict:
        "The answer when the problem is that Postmark is fine but you now need broadcasts, segments, and lifecycle workflows too, and you do not want two vendors and two bills. Sending runs through SES in your own AWS account at AWS prices, delivery events land in your own DynamoDB, and the platform layer on top is a flat fee with unlimited contacts. Workflows are TypeScript pushed from the CLI, so a journey change reviews like code. At 100K a month that is about $10 of SES plus $19 to $79 of platform. You need an AWS account and SES production access to get there, and you would be trading Postmark's support culture for a much smaller company's.",
    },
    {
      vendor: "mailgun",
      verdict:
        "Cheaper than Postmark at volume, at $75 to $90 for 100K, with inbound routing and email validation included in the same bill. You are giving up Postmark's deliverability posture and its support culture, which is most of what you were paying for, and you are picking up a vendor with recurring suspension complaints. A reasonable move only if routing and validation are things you actually need.",
    },
    {
      vendor: "mailersend",
      verdict:
        "Starter at $35 for 50K against Postmark's roughly $67 for the same volume, plus a drag-and-drop template builder Postmark does not try to offer. A reasonable mid-market landing spot if what you would miss about Postmark is the price rather than the support. The 500-email free tier makes a proper trial awkward.",
    },
    {
      vendor: "ahasend",
      verdict:
        "$0.50 per 1,000 with no brackets is well under Postmark's cheapest overage rate of $1.20, so 100K costs about $50 against roughly $133. The counterweight is sharp here specifically: you chose Postmark for deliverability, and this is a young vendor with a short deliverability record. That is the exact axis you would be trading away, which makes the saving less attractive than the arithmetic suggests.",
    },
    {
      vendor: "smtp2go",
      verdict:
        "Professional at $75 for 100K undercuts Postmark meaningfully and includes dedicated IPs at that tier, which Postmark charges $50/mo for and gates behind a 300K minimum. Relay-first, so expect nothing modern in the SDK department and nothing at all in the lifecycle department.",
    },
    {
      vendor: "loops",
      verdict:
        "If the reason you are looking is that you needed marketing email and Postmark would not do it, this collapses both jobs into one product with unlimited sends, starting at $49 for the 1K to 5K contact band. Contact-based pricing is the catch, and it is a real one if your list is much larger than the number of people you actually message. You would also be moving down a tier on deliverability focus.",
    },
    {
      vendor: "customer-io",
      verdict:
        "The heavier answer to the same need: real behavioural automation a marketing team can own without an engineer. It is far more tool than a transactional sender needs, and per-profile pricing makes it expensive fast, at $100 a month for 5,000 profiles and roughly $955 at 100,000. Sensible only if the lifecycle side is about to become the main event rather than an addition.",
    },
    {
      vendor: "mailtrap",
      verdict:
        "Basic at $30 for 100K is under a quarter of Postmark's price at the same volume, and the sandbox half is genuinely useful if your staging email is currently a mess. The sending side is the newer half of the product, which matters more than usual when the thing you are leaving is the most deliverability-focused vendor in the category.",
    },
    {
      vendor: "postmark",
      isIncumbent: true,
      verdict:
        "If you chose Postmark for deliverability and support and both are still good, moving is likely to cost you more than it saves. Under about 100K a month the absolute saving from anything on this list is a rounding error against one engineer-week of migration plus the month of watching graphs afterwards. The case for leaving gets genuinely strong at 500K and above, where the gap is roughly $580 a month against raw SES, and stays weak below it.",
    },
  ],
  stayIf: [
    "You are under about 100K emails a month. The absolute saving does not repay the migration.",
    "Inbox placement on receipts and password resets is a thing your business measures.",
    "You use their support, and it has actually helped.",
    "You are purely transactional and adding lifecycle email is not on the roadmap.",
  ],
};

const MAILGUN_PAGE: AlternativesPage = {
  slug: "mailgun",
  compareHref: "/compare/mailgun-vs-wraps",
  incumbent: "Mailgun",
  title: "Mailgun Alternatives",
  description:
    "Twelve real alternatives to Mailgun, ranked, with published prices and the catch on each. Amazon SES, Postmark, Resend, SMTP2GO, and where Wraps actually fits.",
  intro:
    "Mailgun's cheap on-ramp is gone. Flex closed to new signups in December 2025 and the legacy rate doubled, which is why most people arrive at this page. The rest arrive after a suspension. Both problems have good answers, and they are not the same answer.",
  whyPeopleLeave: [
    "Flex, the pay-as-you-go tier, closed to new signups in December 2025, and the legacy rate doubled from $1 to $2 per 1,000.",
    "What remains of the free tier is a hard 100 emails per day.",
    "Account suspensions are a recurring theme in reviews, with the same slow reinstatement path that drives people off SendGrid.",
    "Scale at $400 for 500K a month is about eight times what that volume costs sending through SES directly.",
  ],
  router: [
    {
      condition: "You want the pay-as-you-go model Flex used to be",
      pick: "Amazon SES at $0.10 per 1,000, or AhaSend at $0.50 if you do not want AWS.",
    },
    {
      condition: "Deliverability is why you are leaving",
      pick: "Postmark, and expect to pay more per email for it.",
    },
    {
      condition: "You used inbound routing and parsing",
      pick: "Amazon SES with a Lambda, or SMTP2GO on Professional. Check this before you migrate — it is the feature people forget they depend on.",
    },
    {
      condition: "Suspension risk is what you are solving",
      pick: "Amazon SES or Wraps. Sending from your own AWS account changes who holds the switch.",
    },
    {
      condition: "You want a better developer experience for the same money",
      pick: "Resend or MailerSend.",
    },
    {
      condition: "You need EU data residency",
      pick: "SES in an EU region, which keeps the pay-as-you-go economics.",
    },
  ],
  ranked: [
    {
      vendor: "amazon-ses",
      verdict:
        "The closest thing to what Flex actually was: real pay-as-you-go, no plan brackets, no monthly minimum, at $0.10 per 1,000 against the doubled legacy rate of $2. At 500K a month that is about $50 against Scale's $400. It is also the biggest step down in tooling on this page, because everything Mailgun gave you above the SMTP layer becomes yours to build, including the inbound routing that Mailgun users lean on more than most. Production access is an application AWS can deny.",
    },
    {
      vendor: "postmark",
      verdict:
        "The move if what actually drove you off was mail not arriving rather than the price change. Roughly $133 at 100K against Mailgun's $75 to $90, so you are paying more on purpose in exchange for a vendor whose whole thesis is inbox placement and whose support answers. A bad move if the price rise is what brought you here, since it goes the wrong way.",
    },
    {
      vendor: "resend",
      verdict:
        "The developer-experience upgrade, and cheaper than Mailgun Scale at the same volume: $35 at 100K against $90. React Email support and a clean SDK are the draw. Check the 30-day log retention and the 2 request/second rate limit against how you actually send, particularly if you were using Mailgun's log search to debug delivery months after the fact.",
    },
    {
      vendor: "wraps",
      verdict:
        "For teams whose objection is that a provider can suspend them without warning, which is the second most common reason people arrive here. Sending runs through SES in your own AWS account, delivery events land in your own DynamoDB, and the platform fee is flat and separate from what you send, so a traffic spike changes your AWS bill rather than triggering a review. Workflows are TypeScript pushed from the CLI. At 100K that is about $10 of SES plus $19 to $79 of platform, against Mailgun's $75 to $90. You need an AWS account and SES production access, which is an AWS decision on AWS's timeline.",
    },
    {
      vendor: "smtp2go",
      verdict:
        "The straightforward relay swap, and one of the few options here that also does inbound parsing, on its Professional tier. At $75 for 100K it is priced level with Mailgun Foundation while including dedicated IPs, and the reporting is better than the price suggests. Worth a look precisely because inbound is the Mailgun feature people forget they depend on until it is gone.",
    },
    {
      vendor: "mailersend",
      verdict:
        "Starter at $35 for 50K undercuts Foundation at the same volume and adds a template builder Mailgun does not really have. A reasonable landing spot for teams who used Mailgun as a plain sending API and never touched routing or validation. The 500-email free tier makes evaluation awkward.",
    },
    {
      vendor: "ahasend",
      verdict:
        "$0.50 per 1,000 with no brackets is the closest thing on this list to Flex's original spirit, and a quarter of the doubled legacy rate. About $50 at 100K against Mailgun's $75 to $90, and about $250 at 500K against $400. Small vendor, short track record, priced accordingly, and no inbound routing to speak of.",
    },
    {
      vendor: "bavimail",
      verdict:
        "Here because inbound is the reason most people stay on Mailgun, and it is one of the few options on this page that does inbound at all: MX, parsing, attachment capture, and webhook routing, at $5 a month for 50K sends against Foundation's $35. It does not replace the rest of the bill — no email validation, no deep log search, and no dedicated IP where Mailgun includes one from the $75 plans. The cheap inbound-plus-outbound option for a small app, not a like-for-like swap for a high-volume account.",
    },
    {
      vendor: "sendgrid",
      verdict:
        "Similar scale, similar feature surface, similar suspension complaints, and a free tier that died in May 2025. It is on this list because procurement sometimes picks it and because it genuinely does handle enormous volume. It is worth being blunt that it does not solve the problem most people are leaving Mailgun over.",
    },
    {
      vendor: "zeptomail",
      verdict:
        "Cheap and transactional-only, at roughly a fifth of Mailgun's per-email cost. The hard constraint is the policy: marketing sends will get you shut off, so if any part of your Mailgun traffic was campaigns, this splits you across two vendors. Credits expiring at six months makes it a poor fit for bursty sending.",
    },
    {
      vendor: "brevo",
      verdict:
        "Covers marketing as well as transactional on volume-based pricing, from a European company, at roughly $69 for 100K. A developer-experience downgrade from Mailgun's API, which is a real cost if your integration is deep. Most relevant if you were already planning to add a marketing tool alongside Mailgun.",
    },
    {
      vendor: "self-hosted",
      verdict:
        "Mailgun refugees consider this more often than users of any other vendor here, usually within a week of a suspension, and the appeal is obvious: nobody can turn you off. Understand what you are signing up for. IP warming, blocklist remediation, feedback loop enrolment, and DMARC alignment become a standing on-call responsibility, and the first time a major mailbox provider throttles you it is your problem at 2am.",
    },
    {
      vendor: "mailgun",
      isIncumbent: true,
      verdict:
        "If you are on legacy Flex pricing, still sending, and not suspended, staying may be the cheapest thing you can do. That grandfathered rate is not available to anyone else even after doubling, and the inbound routing and validation are genuinely good. The case for leaving is strongest for new accounts, who get none of that and face a $15 minimum for 10K where Flex used to charge for what you sent.",
    },
  ],
  stayIf: [
    "You are on legacy Flex pricing and it still works. Nobody new can buy that.",
    "You depend on inbound routing, validation, and log search from one vendor, and splitting them costs more than the savings.",
    "You are at a volume with negotiated pricing that looks nothing like the list prices.",
    "You have never been suspended and deliverability is fine.",
  ],
};

const CUSTOMER_IO_PAGE: AlternativesPage = {
  slug: "customer-io",
  compareHref: "/compare/customer-io-vs-wraps",
  incumbent: "Customer.io",
  title: "Customer.io Alternatives",
  description:
    "Eleven real alternatives to Customer.io, ranked, with published prices and the catch on each. Loops, Klaviyo, Knock, Amazon SES, and where Wraps actually fits.",
  intro:
    "Customer.io bills on profiles stored, not messages sent, which is fine until your free tier grows. Most people reading this are doing the arithmetic on a list that got large without getting more valuable. The right replacement depends on whether you actually need behavioural automation or whether you have been paying campaign-tool prices to do an API's job.",
  whyPeopleLeave: [
    "Per-profile billing: $100 a month at 5,000 profiles, roughly $505 at 50,000, roughly $955 at 100,000 — charged on profiles stored, not messages sent.",
    "Free signups you have never emailed still count against that number.",
    "Premium starts at $1,000 a month, so the features you grow into arrive as a step rather than a slope.",
    "If most of what you send is transactional with two or three sequences attached, you are paying for a campaign tool to do the work of an email API.",
  ],
  router: [
    {
      condition: "You want the same journeys, simpler and much cheaper",
      pick: "Loops. Contact-priced too, but at a fraction of the rate and with unlimited sends.",
    },
    {
      condition: "The per-contact bill is the whole problem",
      pick: "Wraps. Flat platform fee, unlimited contacts, sending billed by AWS.",
    },
    {
      condition: "You are ecommerce, especially Shopify",
      pick: "Klaviyo. It is built for exactly that and Customer.io is not.",
    },
    {
      condition: "You only ever really needed transactional email",
      pick: "Postmark, Resend, or Amazon SES. Stop buying automation you do not run.",
    },
    {
      condition:
        "You need product notifications across email, push, and in-app",
      pick: "Knock or Courier. Both route rather than send, so budget a sending provider underneath.",
    },
    {
      condition: "You need one bill for email, SMS, and a light CRM",
      pick: "Brevo.",
    },
  ],
  ranked: [
    {
      vendor: "loops",
      verdict:
        "The most common landing spot, and usually the right one for a SaaS team. Same basic job of lifecycle sequences plus transactional, at a fraction of the price: $99 in the 5K to 10K contact band against Customer.io's $100 at 5,000 profiles and about $145 at 10,000. Sends are unlimited, so the volume anxiety disappears entirely. It is still contact-priced, so a very large dormant list stays a problem, just a much cheaper one, and the automation is genuinely simpler than what you have.",
    },
    {
      vendor: "wraps",
      verdict:
        "The structural answer to per-profile billing rather than a cheaper version of it: contacts are unlimited on every tier, the platform fee is flat, and sending is billed by AWS at $0.10 per 1,000 instead of bundled into a profile count. At 100,000 contacts that is $19 to $199 of platform plus what you actually send, against roughly $955. You keep workflows, broadcasts, segments, and templates, delivery events land in your own DynamoDB, and workflows are defined in TypeScript and pushed from the CLI, so a journey change goes through code review instead of a canvas. The costs are real: you need an AWS account and SES production access, the automation is less sophisticated than Customer.io's, and while sending and events live in your AWS, contacts and workflow state live in ours.",
    },
    {
      vendor: "klaviyo",
      verdict:
        "The right move if you are ecommerce and Customer.io was always a slightly awkward fit, because the Shopify integration and per-campaign revenue attribution are things Customer.io does not really try to match. It is also profile-priced, at $150 for 10,000 and $1,380 for 100,000, so read the mechanics before assuming it is cheaper: since February 2025 it bills all active profiles, auto-upgrades without auto-downgrading, and halts sends past ten times your profile count.",
    },
    {
      vendor: "brevo",
      verdict:
        "Priced on send volume rather than profiles, which directly inverts the thing you are leaving, at roughly $69 for 100,000 emails on Starter regardless of how many contacts you store. That is the single biggest structural difference on this page after Wraps. Automation lives a tier up from the headline price, the developer experience is a step down, and the behavioural targeting is nowhere near what you have today.",
    },
    {
      vendor: "knock",
      verdict:
        "The right shape if what you actually built in Customer.io was product notifications across channels with user preferences and an in-app inbox, rather than marketing journeys. It orchestrates rather than delivers, so a sending provider still sits underneath and bills separately. At $250 a month plus $5 per 1,000 notifications the floor is steep before you have volume, and it does nothing for a marketing team.",
    },
    {
      vendor: "courier",
      verdict:
        "The same idea as Knock with no base fee, at $0.005 per send, which makes it much better at low or spiky volume where a $250 floor would dominate the bill. Equally not an email provider: you are buying routing and you still pay someone to deliver. At $5 per 1,000 the routing alone costs fifty times what raw SES charges to actually send the message.",
    },
    {
      vendor: "resend",
      verdict:
        "For teams willing to admit the automation was never really used, which is more of them than the category would like. A clean API and a low bill, at $35 for 100K emails against a Customer.io invoice driven by profiles you may not message. The trade is that you are giving up journeys entirely, plus 30-day log retention and a 2 request/second cap.",
    },
    {
      vendor: "postmark",
      verdict:
        "The same admission as Resend but with deliverability as the priority rather than price, at roughly $133 for 100K. Transactional only, so if you do genuinely run sequences this is not a replacement and you will be adding a second vendor within a quarter. Worth it if what you send is receipts and resets and the marketing side was aspirational.",
    },
    {
      vendor: "amazon-ses",
      verdict:
        "The floor, at about $10 for 100K emails and nothing else at all: no segments, no journeys, no dashboard, no template rendering. Only sensible if an honest audit of your Customer.io account says you were sending a handful of templated emails on a couple of triggers the whole time. If that audit says otherwise, this is not a cost saving, it is a rebuild.",
    },
    {
      vendor: "mailersend",
      verdict:
        "An API plus a drag-and-drop template builder, so a marketing team can still edit emails without an engineer even after the automation goes away. At $35 for 50K it is a fraction of a Customer.io bill. There is no behavioural automation at all, so this only works as half of a two-tool replacement.",
    },
    {
      vendor: "customer-io",
      isIncumbent: true,
      verdict:
        "If a marketing team owns your journeys day to day and ships campaigns without engineering involvement, Customer.io is genuinely good at that and most of this list is not. The per-profile bill buys real capability: behavioural triggers, data-driven segmentation, and a builder non-engineers can actually use. It stops being worth it when the profile count grows faster than the messaging sophistication does, which is exactly the moment most people arrive at this page.",
    },
  ],
  stayIf: [
    "A marketing team owns your lifecycle journeys and ships them without engineering time.",
    "Your profile count is stable and roughly matches the number of people you actually message.",
    "You depend on behavioural triggers and data-driven segmentation that the simpler tools do not have.",
    "The bill is annoying but smaller than the cost of rebuilding every journey somewhere else.",
  ],
};

const AGENTMAIL_PAGE: AlternativesPage = {
  slug: "agentmail",
  incumbent: "AgentMail",
  title: "AgentMail Alternatives",
  description:
    "Eleven real alternatives to AgentMail, ranked, with published prices and the catch on each. MailSlurp, Nylas, Cloudflare Email Routing, Amazon SES, and where Wraps actually fits.",
  intro:
    "AgentMail gives an agent its own inbox in one API call, and for a lot of projects that is the whole job. People start shopping when the bill meters inboxes rather than emails, when the mail — which is the agent's memory — needs to sit inside their own compliance boundary, or when they notice that the only thing between the agent and a stranger's address is a sentence in a prompt. Which of those applies decides where you go, because this list splits into inbox providers, mailbox APIs, and sending infrastructure, and those three are not substitutes for each other.",
  whyPeopleLeave: [
    "Pricing meters inboxes before volume: Developer is $20 for 10 inboxes and 10,000 emails a month, so a fleet of agents hits the inbox cap long before the sending cap.",
    "The mail is the agent's memory and it lives in AgentMail's storage, allocated by plan at 3 GB free and 10 GB on Developer. Retention becomes a vendor question rather than a schema you control.",
    "An API key is the whole authorization model. Which addresses an agent may write to, and how often, ends up in the prompt rather than in the infrastructure.",
    "Custom domains are supported, but the sending account and the IPs behind it are theirs, so a deliverability problem is something you escalate rather than something you fix.",
  ],
  router: [
    {
      condition: "You need inboxes on demand and mostly receive",
      pick: "MailSlurp. Inbox creation is the product, and the API predates the agent framing by years.",
    },
    {
      condition:
        "The agent should work out of a real person's Gmail or Outlook",
      pick: "Nylas. Connect the mailbox that already exists instead of minting a new identity.",
    },
    {
      condition:
        "You want the agent's sending limited by infrastructure, not by a prompt",
      pick: "Wraps. Allowlist, rate caps, kill switch, and an approval queue, enforced in your own AWS account.",
    },
    {
      condition: "You want AgentMail's shape for less money",
      pick: "Bavimail. Per-agent inboxes on your domain at $5 a month for 50K emails.",
    },
    {
      condition: "You already have a sending provider and only need to receive",
      pick: "Cloudflare Email Routing into a Worker. Free, and it lands where your code already runs.",
    },
    {
      condition: "Volume is the point and a per-agent identity is not",
      pick: "Resend, Postmark, or SES directly. Stop paying per inbox for something you use as a sender.",
    },
  ],
  ranked: [
    {
      vendor: "mailslurp",
      verdict:
        "The closest thing to AgentMail's core trick — an inbox from an API call — from a vendor that was doing it long before agents were the reason. Pro is $49.99 a month for unlimited permanent inboxes against AgentMail Developer's 10 at $20, which is the right trade the moment your agent count matters more than your send volume. The catch is direction. It was built for test automation, so outbound is 500 emails a month on Pro with overage at $0.99 per 1,000. Strong at receiving, thin as a sender of record.",
    },
    {
      vendor: "bavimail",
      verdict:
        "The same shape as AgentMail — per-agent inboxes on your own domain, inbound parsing, webhook routing — at $5 a month for 50K emails against Developer's $20 for 10,000, and 10 inboxes per domain rather than 10 in total. It is also the youngest option here, with no published deliverability record and no dedicated-IP path, so this is a choice between two young vendors rather than an upgrade to a settled one. Cheaper is not the same as more likely to be here in two years.",
    },
    {
      vendor: "nylas",
      verdict:
        "On this list because a good share of people shopping for an agent inbox do not actually want a new address: they want the agent working out of the mailbox a human already uses. Full Platform is $15 a month base with 5 connected accounts and 20 agent accounts, then $2.00 per extra account, which is a different billing unit than inbox count and usually a larger one. Budget for Google and Microsoft OAuth review, a security assessment that runs on their timeline and has moved more than one launch date.",
    },
    {
      vendor: "wraps",
      verdict:
        "The answer when the reason you are shopping is that an API key is the entire authorization model. Each agent gets an address plus an IAM credential whose only permission is invoking one policy Lambda in your own AWS account, so it cannot reach SES directly: kill switch, sender pin, recipient allowlist, hourly and daily caps, and an approval queue for anything that trips them. Defaults are 20 sends an hour, 100 a day, and an empty allowlist, so it starts locked down rather than open. Sending is $0.10 to $0.16 per 1,000 billed by AWS, plus a platform fee of $19 to $79. It needs an AWS account and SES production access, which is real setup cost AgentMail does not charge you.",
    },
    {
      vendor: "resend",
      verdict:
        "The pragmatic answer when the agent sends far more than it receives and does not need an identity of its own. The free tier matches AgentMail's 3,000 a month, and Pro is $20 at 50K against Developer's $20 at 10,000, so on sending alone the arithmetic is not close. What you give up is the inbox: no inbox per agent, no threading model, no mail as memory, and an API key that can reach any address. Logs purge at 30 days too, which is a poor fit when the mail is meant to be the history.",
    },
    {
      vendor: "postmark",
      verdict:
        "Pick this when the agent's mail is transactional in everything but name — confirmations, receipts, replies a customer is waiting on — and inbox placement matters more than inbox creation. Inbound streams parse to a webhook, and the deliverability reputation is the strongest on this page. You are buying a sending product rather than an agent product: no inbox per agent and no threading, at about $133 a month for 100K, where AgentMail's published tiers stop at 10,000 a month before you are talking to sales.",
    },
    {
      vendor: "mailgun",
      verdict:
        "The old answer to this problem, and it still works: inbound routes match on the recipient address and POST the parsed message to your app, with log search and storage attached. Foundation is $35 at 50K against Developer's $20 at 10,000, so it is cheaper per email and more expensive per agent, because routes are not inboxes and the mailbox abstraction is yours to write. Flex closed to new signups in December 2025, and the suspension complaints in its reviews are not folklore.",
    },
    {
      vendor: "amazon-ses",
      verdict:
        "The build-it-yourself option, and the one worth pricing before you accept anyone's per-inbox bill. SES receiving writes to S3 and triggers a Lambda, sending runs $0.10 to $0.16 per 1,000, and there is no cap on how many addresses you route. Budget an engineer-week for parsing, threading, and storage, plus a production-access application AWS can refuse. Cheapest at any real volume, and the only row here where the mail never leaves your own account.",
    },
    {
      vendor: "cloudflare-email",
      verdict:
        "Free, and the right answer if you already run Workers and only need to receive. A routing rule hands the inbound message to a handler you write, which is most of what an agent inbox is when the agent does its own parsing. It does not send: outbound is a separate Cloudflare service with its own quota, so pair it with something else on this page. No mailbox, no threading, no history beyond what you choose to store.",
    },
    {
      vendor: "self-hosted",
      verdict:
        "Here for the reader whose actual constraint is that agent mail cannot touch a third party at all. Stalwart or Postal on a box you own gives you unlimited inboxes and nobody's per-agent pricing. It also gives you IP warming, blocklist remediation, and DMARC alignment as an on-call rotation. At the volumes most agent projects run, the arithmetic favours this far less than it looks, because the cost is attention rather than money.",
    },
    {
      vendor: "agentmail",
      isIncumbent: true,
      verdict:
        "Staying is often right, and this page would be dishonest not to say so. It is the only vendor here whose product is specifically an inbox for an agent — threading, attachments, WebSocket events, an MCP server, IMAP and SMTP alongside REST — where everything above gives you either inboxes without the agent framing or sending without the inboxes. The free tier is three inboxes and 3,000 emails, Developer is $20, and rebuilding that on a sending API is a week of work plus the parsing bugs that come after. Leave when the inbox cap starts pricing your fleet, when the mail has to live inside your own compliance boundary, or when the agent's sending needs a stronger limit than a prompt. Do not leave over $20.",
    },
  ],
  stayIf: [
    "Three inboxes and 3,000 emails a month covers you. The free tier is genuinely usable, not a trial.",
    "The value to you is that inbox creation is one API call and threading arrives already parsed. That is a real week of work to rebuild on a sending API.",
    "You need IMAP and SMTP alongside REST. Most of this list gives you one or the other, not all three.",
    "Nothing in the reasons above describes a problem you actually have. A young vendor is a risk; so is a migration you did not need.",
  ],
};

export const ALTERNATIVES_PAGES: readonly AlternativesPage[] = [
  RESEND_PAGE,
  SENDGRID_PAGE,
  POSTMARK_PAGE,
  MAILGUN_PAGE,
  CUSTOMER_IO_PAGE,
  AGENTMAIL_PAGE,
];

/** Throws rather than returning undefined: a missing slug is a build-time bug. */
export function alternativesPageBySlug(slug: string): AlternativesPage {
  const page = ALTERNATIVES_PAGES.find((entry) => entry.slug === slug);
  if (!page) {
    throw new Error(`No alternatives page configured for slug "${slug}"`);
  }
  return page;
}

/** Stamped on every page so a reader knows how fresh the numbers are. */
export const PRICES_VERIFIED = "August 2026";
