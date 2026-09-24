/**
 * Declared search intent for every content route on wraps.dev.
 *
 * One entry per route that exists to be found by a stranger. Product and legal
 * pages are listed in NON_CONTENT_ROUTES instead, so the test can prove the
 * split is exhaustive and no route is silently unaccounted for.
 *
 * `primaryQuery` is the one query this page is trying to win. It must be
 * unique across the whole map — two pages aiming at the same query is
 * cannibalization, and the test fails on it.
 *
 * Derived from each page's own `metadata.title` / `description` as of
 * commit e33f3278 (2026-09-08) — this records what each page already aims
 * at, it does not re-aim any of them. See `src/__tests__/search-intent-map.test.ts`.
 */
export type SearchIntentEntry = {
  route: string;
  /** The single query this page exists to win. Unique across the map. */
  primaryQuery: string;
  /** Supporting queries. May repeat across entries. */
  secondaryQueries: string[];
  /** Who is typing this: someone with a problem, or someone evaluating us. */
  audience: "stranger-with-problem" | "evaluating-wraps" | "existing-user";
  /** Why this page is winnable, in one line. Evidence, not hope. */
  rationale: string;
};

export const SEARCH_INTENT: readonly SearchIntentEntry[] = [
  // --- Rubric ---
  {
    route: "/approaches",
    primaryQuery: "best way to send application email aws ses vs api",
    secondaryQueries: [
      "should i use ses or resend",
      "open source resend alternative self host ses",
      "usesend vs opensend vs ses",
      "run ses yourself or use a sending api",
    ],
    audience: "stranger-with-problem",
    rationale:
      "Nobody else writes the rubric — every page in this space is one vendor arguing for itself, and the open-source SES wrappers that appeared in 2026 are absent from all of them. A page that names all four approaches and sends the reader elsewhere when that is the right answer is the kind of page an LLM cites.",
  },

  // --- Blog ---
  {
    route: "/blog/agent-mailboxes",
    primaryQuery: "constrain ai agent email sending permissions",
    secondaryQueries: [
      "ai agent email security",
      "prevent agent email abuse",
      "scoped credentials for ai agents",
    ],
    audience: "stranger-with-problem",
    rationale:
      "We shipped a specific mechanism — identity from the alias qualifier, enforced by a Lambda in the reader's own AWS account — that no competitor's docs describe, because none of them run in the reader's account.",
  },
  {
    route: "/blog/agent-readable-docs",
    primaryQuery: "make documentation readable by ai agents",
    secondaryQueries: [
      "llms.txt for docs",
      "agent discoverable documentation",
      "ai crawl signals for a website",
    ],
    audience: "stranger-with-problem",
    rationale:
      "The post names the exact four mechanisms shipped — per-page markdown, well-known discovery documents, an in-browser tool surface, AI crawl signals — and states plainly which of them is an actual standard, which most posts on this topic do not.",
  },
  {
    route: "/blog/aws-ses-marketing-tools",
    primaryQuery: "self hosted email marketing tools on ses",
    secondaryQueries: [
      "sendy alternative on aws",
      "email campaign tool own aws account",
      "emailoctopus vs wraps",
    ],
    audience: "stranger-with-problem",
    rationale:
      "The post names five specific competing tools (Sendy, EmailOctopus, MailBluster, Mailblast, Wraps) that all sit on top of SES the reader already owns, a comparison nobody else writes because most of them are the vendor being compared.",
  },
  {
    route: "/blog/aws-ses-simplified",
    primaryQuery: "simplify aws ses account setup",
    secondaryQueries: [
      "ses setup takes too long",
      "one command ses deploy",
      "aws ses onboarding friction",
    ],
    audience: "stranger-with-problem",
    rationale:
      'Directly names the pain ("a multi-day odyssey") and the fix (one command) — this is the exact complaint AWS\'s own SES production-access flow generates, which is why Wraps exists.',
  },
  {
    route: "/blog/base44-send-email",
    primaryQuery: "send email from base44 app",
    secondaryQueries: [
      "base44 email integration",
      "base44 transactional email",
    ],
    audience: "stranger-with-problem",
    rationale:
      "Platform-specific: Base44 has no first-party transactional email story, and this post states the exact setup time (10 minutes) with no Lambda deploy required, which is a concrete claim a reader can verify.",
  },
  {
    route: "/blog/bolt-send-email",
    primaryQuery: "send email from bolt.new app",
    secondaryQueries: [
      "bolt.new email integration",
      "bolt.new transactional email",
    ],
    audience: "stranger-with-problem",
    rationale:
      "Same gap as Base44 and Lovable — AI app builders emit events but have no email layer — and each vibe-coding platform is a distinct enough audience that this earns its own page rather than folding into the umbrella post.",
  },
  {
    route: "/blog/developer-first-email-api-checklist",
    primaryQuery: "traits of a developer friendly email api",
    secondaryQueries: [
      "what makes a good email api",
      "email api developer experience checklist",
    ],
    audience: "stranger-with-problem",
    rationale:
      "Names seven testable criteria a reader can run in an afternoon, and explicitly states where Wraps itself fails the list — the self-critical framing is evidence this isn't marketing copy dressed as a checklist.",
  },
  {
    route: "/blog/dmarcbis-what-changes",
    primaryQuery: "rfc 9989 dmarc standard changes",
    secondaryQueries: [
      "dmarcbis explained",
      "public suffix list replaced dmarc",
      "dmarc standards track may 2026",
    ],
    audience: "stranger-with-problem",
    rationale:
      "Cites the exact RFC number, the exact obsoleted RFCs, and named field-level changes (pct= removed, np= and t= added) — specificity search engines and readers both reward over a generic DMARC explainer.",
  },
  {
    route: "/blog/email-pricing-models",
    primaryQuery: "high volume email pricing models compared",
    secondaryQueries: [
      "per-contact vs per-event email pricing",
      "committed volume email pricing",
      "email vendor pricing structures",
    ],
    audience: "stranger-with-problem",
    rationale:
      "Names five distinct billing models and which vendors use each — a structural comparison none of the vendor pricing pages themselves offer, because naming the model exposes how it works against the buyer as volume grows.",
  },
  {
    route: "/blog/email-templates-react-workflows-typescript",
    primaryQuery: "react email templates typescript workflows",
    secondaryQueries: [
      "version controlled email templates",
      "type safe email infrastructure",
    ],
    audience: "stranger-with-problem",
    rationale:
      "Describes a specific architectural choice — templates as React, automations as TypeScript, both code-reviewable — that is the actual shape of the Wraps template editor after TipTap was removed, not an abstract pitch.",
  },
  {
    route: "/blog/email-vendor-lock-in",
    primaryQuery: "avoid email vendor lock in",
    secondaryQueries: [
      "switching email providers difficulty",
      "what makes leaving an esp expensive",
    ],
    audience: "stranger-with-problem",
    rationale:
      "Names five specific costs of migration beyond contact export, and frames them as questions to ask before signing — a pre-purchase checklist that ranks for buyer-intent queries earlier in the funnel than a comparison page.",
  },
  {
    route: "/blog/how-email-works",
    primaryQuery: "how email actually works explained",
    secondaryQueries: [
      "smtp handshake explained",
      "email dns lookup process",
      "interactive email protocol demo",
    ],
    audience: "stranger-with-problem",
    rationale:
      "An interactive, typeable terminal walking SMTP handshakes, DNS lookups, and relay hops is a genuinely differentiated format versus the static explainer articles that dominate this query today.",
  },
  {
    route: "/blog/inbound-email-guide",
    primaryQuery: "build support inbox from inbound email",
    secondaryQueries: [
      "email to ticket workflow",
      "automate order processing from email",
      "inbound email parsing guide",
    ],
    audience: "stranger-with-problem",
    rationale:
      "Names three concrete build targets (support inboxes, order-processing automation, email-to-ticket) backed by EventBridge webhooks running in the reader's own account, distinct from the /inbound product page's bottom-funnel framing.",
  },
  {
    route: "/blog/lovable-send-email",
    primaryQuery: "send email from lovable app",
    secondaryQueries: [
      "lovable email integration",
      "lovable transactional email",
    ],
    audience: "stranger-with-problem",
    rationale:
      "Lovable has no built-in email sending, and Lovable's own community forums show the question asked repeatedly — a named-platform post answers a query the platform itself does not.",
  },
  {
    route: "/blog/nextjs-vercel-ses-guide",
    primaryQuery: "next.js vercel aws ses integration guide",
    secondaryQueries: [
      "vercel send email aws ses",
      "next.js email infrastructure setup",
    ],
    audience: "stranger-with-problem",
    rationale:
      "Names the specific stack (Next.js + Vercel + SES) that is Wraps' own primary deployment target per the CLAUDE.md tech stack, so the guide describes a path the team runs and tests itself.",
  },
  {
    route: "/blog/python-email-sdk",
    primaryQuery: "python sdk for aws ses",
    secondaryQueries: [
      "wraps-email pypi",
      "sigv4 signed ses requests python",
      "no boto3 ses client",
    ],
    audience: "stranger-with-problem",
    rationale:
      "States the exact release (wraps-email 0.1.0 on PyPI) and the specific architectural claim — SigV4 signed directly against SES, no Wraps API key or server in the request path — that a competing SDK cannot make.",
  },
  {
    route: "/blog/reduce-transactional-email-costs",
    primaryQuery: "reduce transactional email costs at scale",
    secondaryQueries: [
      "lower aws ses bill",
      "dedicated ip cost email",
      "email attachment cost optimization",
    ],
    audience: "stranger-with-problem",
    rationale:
      "Gives exact dollar figures (a la carte $10/100K, dedicated IP $24.95, a 2MB attachment on every message $24) and orders them by actual impact — a cost breakdown a reader can check against their own AWS bill.",
  },
  {
    route: "/blog/replit-send-email",
    primaryQuery: "send email from replit app",
    secondaryQueries: [
      "replit email integration",
      "replit transactional email",
    ],
    audience: "stranger-with-problem",
    rationale:
      "Same platform-specific gap as Base44, Bolt, and Lovable — Replit apps emit events with no built-in email path, and the 10-minute, no-Lambda-deploy claim is specific enough to verify.",
  },
  {
    route: "/blog/scale-plan-enterprise-features",
    primaryQuery: "wraps scale plan enterprise features",
    secondaryQueries: [
      "wraps sso scim",
      "wraps behavioral segments",
      "wraps unlimited aws accounts",
    ],
    audience: "evaluating-wraps",
    rationale:
      "Names the exact Scale-exclusive features (SSO + SCIM, behavioral segments, unlimited AWS accounts, 1-year history) an enterprise buyer checks against a vendor shortlist before a sales call.",
  },
  {
    route: "/blog/ses-pricing-plans-2026",
    primaryQuery: "aws ses essentials pricing plan 2026",
    secondaryQueries: [
      "ses essentials plan cost",
      "aws ses subscription plans july 2026",
      "move ses account back to a la carte",
    ],
    audience: "stranger-with-problem",
    rationale:
      "Dates the exact AWS change (July 21, 2026), the exact new default price ($0.16/1,000 on Essentials vs $0.10/1,000 a la carte), and how to move back — the kind of dated, numbered post that wins a repricing-driven query spike.",
  },
  {
    route: "/blog/ses-production-architecture",
    primaryQuery: "aws ses production architecture patterns",
    secondaryQueries: [
      "ses dedicated ip setup",
      "ses rate limiting configuration sets",
      "protect sender reputation ses",
    ],
    audience: "stranger-with-problem",
    rationale:
      "Covers the operational surface (dedicated IPs, bounce handling, rate limiting, configuration sets) a reader needs at scale, distinct from ses-sandbox-guide's narrower focus on getting approved for production access in the first place.",
  },
  {
    route: "/blog/ses-sandbox-guide",
    primaryQuery: "get out of aws ses sandbox",
    secondaryQueries: [
      "ses production access request",
      "ses sandbox approval checklist",
      "ses production access denied",
    ],
    audience: "stranger-with-problem",
    rationale:
      "Interactive checklists and request templates target the single highest-friction moment in adopting SES — production access approval — which reference_yc_s26_targeting identifies as the real pain point over pricing.",
  },
  {
    route: "/blog/signed-reply-threading",
    primaryQuery: "signed reply to email threading for agents",
    secondaryQueries: [
      "hmac signed reply-to address",
      "verify email reply conversation agent",
    ],
    audience: "stranger-with-problem",
    rationale:
      "Describes a specific cryptographic mechanism (HMAC-signed reply-to, verified in a Lambda in the reader's own account) for a problem — correlating agent email replies to the right conversation — that has no established name yet.",
  },
  {
    route: "/blog/spf-guide",
    primaryQuery: "spf 10 lookup limit explained",
    secondaryQueries: [
      "spf lookup limit exceeded",
      "which spf includes cost the most lookups",
    ],
    audience: "stranger-with-problem",
    rationale:
      "The 10-lookup ceiling is an RFC-defined, frequently-hit limit that breaks SPF silently; the post explains how lookups are counted and which providers cost the most, which is the actual debugging question readers arrive with.",
  },
  {
    route: "/blog/supabase-email-guide",
    primaryQuery: "supabase app email flows guide",
    secondaryQueries: [
      "supabase email beyond magic links",
      "supabase transactional email setup",
    ],
    audience: "stranger-with-problem",
    rationale:
      "Names the exact gap — Supabase covers auth and database, not the four email flows a production app needs beyond magic links — and lists all four, which is more specific than Supabase's own docs on the topic.",
  },
  {
    route: "/blog/vibe-coding-email",
    primaryQuery: "send email from ai built apps",
    secondaryQueries: [
      "vibe coded app email",
      "connect ai app to email workflow",
    ],
    audience: "stranger-with-problem",
    rationale:
      "The umbrella post for a reader who has not yet picked a platform, distinct from the four platform-specific posts (Lovable, Bolt, Base44, Replit) each written for someone who already has — different point in the funnel, not the same query.",
  },
  {
    route: "/blog/why-email-providers-cost-more-than-ses",
    primaryQuery: "sendgrid resend postmark pricing vs ses",
    secondaryQueries: [
      "why is resend more expensive than ses",
      "esp markup over raw ses cost",
    ],
    audience: "stranger-with-problem",
    rationale:
      'Gives a line-by-line accounting of the $10 vs $35-$133.50 gap at 100K emails/month and states plainly when the difference is worth paying — a specific-numbers post, not a generic "ESPs are expensive" claim.',
  },
  {
    route: "/blog/yc-w26-email-security-audit",
    primaryQuery: "yc startups email security audit results",
    secondaryQueries: [
      "yc w26 dmarc adoption",
      "startup email authentication statistics",
    ],
    audience: "stranger-with-problem",
    rationale:
      "Original data from scanning every YC W26 company's public DNS records (70% don't enforce DMARC, 12% have zero authentication) is the kind of primary-source content that earns backlinks a generic explainer cannot.",
  },
  {
    route: "/blog/your-dmarc-policy-is-useless",
    primaryQuery: "dmarc policy p=none does nothing",
    secondaryQueries: [
      "dmarc p=none enforcement",
      "82 percent domains no dmarc",
    ],
    audience: "stranger-with-problem",
    rationale:
      "Leads with the specific statistic (82% of domains have no DMARC, and most that do set p=none, which does not enforce) that is the actual finding a reader searching this exact frustration wants confirmed.",
  },

  // --- Compare ---
  {
    route: "/compare",
    primaryQuery: "wraps vs other email platforms compared",
    secondaryQueries: [
      "wraps competitor comparison",
      "email infrastructure vendor comparison hub",
    ],
    audience: "evaluating-wraps",
    rationale:
      "The hub page's own metadata names all six incumbents it links to (Resend, SendGrid, Amazon SES, Postmark, Customer.io, Klaviyo) and promises real pricing and honest tradeoffs, which is the aggregation query a shortlist-stage buyer runs before opening any single comparison.",
  },
  {
    route: "/compare/amazon-ses-vs-wraps",
    primaryQuery: "wraps vs raw amazon ses setup",
    secondaryQueries: [
      "wraps built on ses",
      "ses infrastructure ownership vs wraps",
    ],
    audience: "evaluating-wraps",
    rationale:
      "The page's own framing is unusual among comparisons — Wraps deploys TO SES, not instead of it — so the honest comparison is DX and dashboard on top of identical AWS pricing, not a pricing fight.",
  },
  {
    route: "/compare/customer-io-vs-wraps",
    primaryQuery: "customer.io vs wraps pricing model",
    secondaryQueries: [
      "customer.io contact based billing",
      "customer.io high watermark pricing",
    ],
    audience: "evaluating-wraps",
    rationale:
      "Names the specific billing mechanic that drives Customer.io's cost at scale — per-contact with high-watermark billing — against unlimited contacts on every Wraps tier, a concrete structural difference rather than a feature checklist.",
  },
  {
    route: "/compare/klaviyo-vs-wraps",
    primaryQuery: "klaviyo vs wraps for developers",
    secondaryQueries: [
      "klaviyo alternative for developers",
      "profile based marketing vs byoc email",
    ],
    audience: "evaluating-wraps",
    rationale:
      "Frames the actual audience split — Klaviyo is an e-commerce profile-based marketing platform, Wraps is developer-first BYOC infrastructure — which is a different buyer question than the transactional-email comparisons on this route.",
  },
  {
    route: "/compare/mailgun-vs-wraps",
    primaryQuery: "mailgun vs wraps hipaa compliance",
    secondaryQueries: [
      "mailgun sends from their servers",
      "mailgun infrastructure ownership comparison",
    ],
    audience: "evaluating-wraps",
    rationale:
      "HIPAA compliance is named explicitly in the page's own metadata as a comparison point specific to Mailgun, alongside the sends-from-their-servers vs deploys-to-yours framing shared with the Resend and Amazon SES pages.",
  },
  {
    route: "/compare/postmark-vs-wraps",
    primaryQuery: "postmark vs wraps transactional email",
    secondaryQueries: [
      "postmark migration guide",
      "postmark architecture tradeoffs vs wraps",
    ],
    audience: "evaluating-wraps",
    rationale:
      "The page's own description promises pricing at real volumes plus a migration guide, which targets a reader already sending through Postmark and pricing out a move, not a first-time evaluator.",
  },
  {
    route: "/compare/resend-vs-wraps",
    primaryQuery: "resend vs wraps data retention and ownership",
    secondaryQueries: [
      "resend sends from their aws",
      "resend infrastructure ownership",
    ],
    audience: "evaluating-wraps",
    rationale:
      "Deliberately distinct from /alternatives/resend per the documented 2026-08-27 pairing decision: this page is the head-to-head for someone who already knows both vendors, the alternatives page is for someone who only knows Resend.",
  },
  {
    route: "/compare/sendgrid-vs-wraps",
    primaryQuery: "sendgrid vs wraps vendor lock in",
    secondaryQueries: [
      "sendgrid migration path",
      "sendgrid same dx aws pricing",
    ],
    audience: "evaluating-wraps",
    rationale:
      "SendGrid is the incumbent named in reference_yc_s26_targeting as the largest player Wraps competes against on price under 100K/month, so this page's vendor lock-in framing addresses the actual switching objection.",
  },
  {
    route: "/compare/ses-bounce-handling-hand-rolled-vs-wraps",
    primaryQuery: "hand rolled ses bounce handling vs wraps",
    secondaryQueries: [
      "sns signature verification ses bounces",
      "diy ses bounce handling code",
    ],
    audience: "evaluating-wraps",
    rationale:
      "States its own honesty constraint up front — hand-rolling SNS signature verification takes 85 lines a competent developer or agent can write correctly — and shows that exact code plus what it still doesn't cover, which is unusually self-checking for a vendor comparison.",
  },

  // --- Alternatives ---
  {
    route: "/alternatives",
    primaryQuery: "amazon ses and email platform alternatives",
    secondaryQueries: [
      "email platform alternatives ranked",
      "esp alternatives hub",
    ],
    audience: "evaluating-wraps",
    rationale:
      "The hub's own metadata promises published prices, a stated catch on every option, and keeps the incumbent itself on the list — a structural honesty commitment the child pages inherit and that the test in alternatives.test.ts already enforces.",
  },
  {
    route: "/alternatives/resend",
    primaryQuery: "resend alternatives ranked list",
    secondaryQueries: ["resend competitors", "tools like resend"],
    audience: "evaluating-wraps",
    rationale:
      "Resend owns 33% of YC S26 per reference_yc_s26_targeting, making it the single highest-volume incumbent to be found switching away from, and the page's own title states a ranked list with a stated count.",
  },
  {
    route: "/alternatives/sendgrid",
    primaryQuery: "sendgrid alternatives ranked list",
    secondaryQueries: ["sendgrid competitors", "tools like sendgrid"],
    audience: "evaluating-wraps",
    rationale:
      "SendGrid is the incumbent named in the marketplace-segment DNS scan as the most commonly detected ESP among prospects, so this alternatives page targets the largest identifiable pool of switchers.",
  },
  {
    route: "/alternatives/postmark",
    primaryQuery: "postmark alternatives ranked list",
    secondaryQueries: ["postmark competitors", "tools like postmark"],
    audience: "evaluating-wraps",
    rationale:
      "Postmark's own audience (transactional-email-focused developers) overlaps closely with Wraps' ICP, and the page's per-incumbent tailored reasons (config-driven per src/config/alternatives.ts) are sourced rather than generic.",
  },
  {
    route: "/alternatives/mailgun",
    primaryQuery: "mailgun alternatives ranked list",
    secondaryQueries: ["mailgun competitors", "tools like mailgun"],
    audience: "evaluating-wraps",
    rationale:
      'Mailgun appears both as a direct compare target and an alternatives-hub incumbent because it draws two different searcher intents — head-to-head evaluation versus "what else is out there" — and the config keeps sourced, specific reasons per incumbent rather than padding a list to a fixed count.',
  },
  {
    route: "/alternatives/customer-io",
    primaryQuery: "customer.io alternatives ranked list",
    secondaryQueries: ["customer.io competitors", "tools like customer.io"],
    audience: "evaluating-wraps",
    rationale:
      "Customer.io's high-watermark per-contact billing (also the subject of the direct compare page) is a well-documented switching trigger, so an alternatives page for it targets buyers actively pricing out a move.",
  },
  {
    route: "/alternatives/agentmail",
    primaryQuery: "agentmail alternatives ranked list",
    secondaryQueries: ["agentmail competitors", "tools like agentmail"],
    audience: "evaluating-wraps",
    rationale:
      'AgentMail is a narrower, newer incumbent than the other five; the alternatives.ts config\'s own "weak answer, cut it" rule means this page only exists because Wraps has a genuinely differentiated answer for the agent-email use case, not because every incumbent needs one.',
  },

  // --- Tools ---
  {
    route: "/tools",
    primaryQuery: "free email deliverability checker tools",
    secondaryQueries: ["dmarc analyzer free", "spf validator free tool"],
    audience: "stranger-with-problem",
    rationale:
      "The hub's own title names the exact free tools offered (SPF, DMARC, Amazon SES checks) — a tool-seeking query distinct from the educational blog posts on the same topics, and it is the entry point to two indexed sub-tools.",
  },
  {
    route: "/tools/ses-calculator",
    primaryQuery: "amazon ses pricing",
    secondaryQueries: [
      "aws ses pricing",
      "ses pricing",
      "aws ses pricing calculator",
      "ses true cost lambda dynamodb",
    ],
    audience: "stranger-with-problem",
    rationale:
      "Re-aimed 2026-09-24 from Search Console: it already ranks ~7.5 for amazon/aws ses pricing (~7.9K impressions in 90 days), and is the only page-1 result showing all four 2026 SES plans rather than the old $0.10/1K.",
  },
  {
    route: "/tools/spf-builder",
    primaryQuery: "spf record builder tool online",
    secondaryQueries: ["generate spf record", "validate spf record tool"],
    audience: "stranger-with-problem",
    rationale:
      'An interactive builder is a different intent than the spf-guide blog post\'s explainer of the 10-lookup limit — one is "help me build this," the other is "help me understand this," and both currently rank for overlapping but distinct queries.',
  },
  {
    route: "/tools/ses-production-access",
    primaryQuery: "ses production access request template",
    secondaryQueries: [
      "ses production access denied",
      "what to write in ses production access request",
      "appeal aws ses sandbox denial",
    ],
    audience: "stranger-with-problem",
    rationale:
      'The sandbox guide explains the process; this is the artifact you send, and nothing else on the web generates one. Someone typing this has already read an explainer and wants text they can paste into a support case, which is a different intent from the guide\'s "get out of aws ses sandbox".',
  },

  // --- Migrate ---
  {
    route: "/migrate",
    primaryQuery: "migrate to amazon ses",
    secondaryQueries: [
      "move email sending to aws ses",
      "switch email provider to amazon ses",
    ],
    audience: "stranger-with-problem",
    rationale:
      "The hub carries the five facts every provider migration shares — production access, parallel DNS, domain-not-IP reputation, suppression export, account-wide rates — so the per-vendor guides do not have to repeat them and stay distinct from each other.",
  },
  {
    route: "/migrate/sendgrid",
    primaryQuery: "migrate from sendgrid to amazon ses",
    secondaryQueries: [
      "sendgrid subuser equivalent in ses",
      "sendgrid inbound parse alternative",
      "sendgrid to ses suppression export",
    ],
    audience: "stranger-with-problem",
    rationale:
      "Subusers are the most-asked question about this migration on AWS re:Post and the answer is SES tenants; the current SERP is affiliate round-ups and AWS's own generic 'migrating from another solution' doc, neither of which maps subusers onto tenants or names the surfaces that still have no equivalent.",
  },
  {
    route: "/migrate/mailgun",
    primaryQuery: "migrate from mailgun to amazon ses",
    secondaryQueries: [
      "mailgun routes ses equivalent",
      "mailgun eu region to ses",
      "mailgun suppression list export",
    ],
    audience: "stranger-with-problem",
    rationale:
      "Mailgun's EU endpoint pins a domain to a region and its suppressions are three separate lists against SES's one, which no existing guide addresses; both are decisions a reader has to make before writing any code.",
  },
  {
    route: "/migrate/postmark",
    primaryQuery: "migrate from postmark to amazon ses",
    secondaryQueries: [
      "postmark message streams alternative",
      "postmark inbound parsing on ses",
      "is postmark worth it at volume",
    ],
    audience: "stranger-with-problem",
    rationale:
      "People leave Postmark over unit price rather than over a failure, so the winnable page is the one that names the volume where that argument starts to hold and tells smaller senders to stay — an answer no vendor-funded guide will publish.",
  },
  {
    route: "/migrate/resend",
    primaryQuery: "migrate from resend to amazon ses",
    secondaryQueries: [
      "resend log retention 30 days",
      "resend rate limit 2 requests per second",
      "resend to own aws account",
    ],
    audience: "stranger-with-problem",
    rationale:
      "Resend runs on SES, so the SPF include is usually already correct and React Email templates move unedited — two specific facts that make this migration shorter than every guide currently ranking, and the page also states the volume below which staying on Resend is cheaper.",
  },
  {
    route: "/migrate/amazon-pinpoint",
    primaryQuery: "amazon pinpoint end of support migration",
    secondaryQueries: [
      "pinpoint email migrate to ses",
      "pinpoint deprecation october 2026",
    ],
    audience: "stranger-with-problem",
    rationale:
      "AWS's own announced end-of-support date (October 30, 2026) creates a forced, dated migration event; the page states what AWS's guidance leaves out and how to land segments, campaigns, journeys, and analytics in the reader's own account.",
  },

  // --- Standalone marketing/product pages ---
  {
    route: "/agents",
    primaryQuery: "ai agent email api with guardrails",
    secondaryQueries: [
      "agent email send caps allowlist",
      "kill switch for ai agent email",
    ],
    audience: "evaluating-wraps",
    rationale:
      "This is the product page for the shipped agent-mailboxes feature (enforcer Lambda, alias-bound identity, approval queue); distinct from /blog/agent-mailboxes, which is the technical explainer of how the same feature works.",
  },
  {
    route: "/byoc",
    primaryQuery: "bring your own cloud email infrastructure",
    secondaryQueries: [
      "byoc email sending",
      "deploy ses eventbridge dynamodb one command",
    ],
    audience: "evaluating-wraps",
    rationale:
      "Names the exact resources deployed (SES, EventBridge, DynamoDB) with one CLI command and explicitly rules out Kubernetes, targeting the buyer who wants infrastructure ownership without the operational weight of a self-hosted stack.",
  },
  {
    route: "/cli",
    primaryQuery: "cli to deploy aws ses infrastructure",
    secondaryQueries: [
      "open source email cli aws",
      "one command ses deploy tool",
    ],
    audience: "evaluating-wraps",
    rationale:
      "The page's own title states a specific, checkable time claim (2 minutes) and that the CLI is free and open source, which is the product's actual entry point per the CLAUDE.md architecture overview.",
  },
  {
    route: "/inbound",
    primaryQuery: "inbound email eventbridge webhooks product",
    secondaryQueries: [
      "receive email in aws account product",
      "parse inbound email attachments spam detection",
    ],
    audience: "evaluating-wraps",
    rationale:
      "This is the product page (parse headers, extract attachments, detect spam, trigger webhooks) for a buyer already sold on the need; /blog/inbound-email-guide targets the earlier-funnel reader still figuring out whether to build this at all.",
  },
  {
    route: "/mcp",
    primaryQuery: "mcp server for email infrastructure",
    secondaryQueries: [
      "ai agent read access to email data",
      "mcp guarded email sending",
    ],
    audience: "evaluating-wraps",
    rationale:
      "Names the exact install path (npx -y @wraps.dev/mcp) and the specific data surface exposed (send history, delivery events, domain status, suppressions) plus guarded sending, which is a checkable product claim, not a category pitch.",
  },
  {
    route: "/platform",
    primaryQuery: "hosted email platform on your aws",
    secondaryQueries: [
      "email templates broadcasts workflows dashboard",
      "premium layer on top of ses",
    ],
    audience: "evaluating-wraps",
    rationale:
      'Its own metadata frames the platform explicitly as "the premium layer on top of your AWS infrastructure," which is the specific positioning distinguishing it from both the free CLI and the raw-SES comparison pages.',
  },
  {
    route: "/sdk",
    primaryQuery: "typescript sdk for aws ses email",
    secondaryQueries: [
      "typescript sms sdk",
      "workflow automation sdk typescript",
    ],
    audience: "evaluating-wraps",
    rationale:
      "Covers three concrete SDK surfaces named in its own description — email, SMS, workflow automation with templates and custom events — matching the actual `@wraps.dev/email` and `@wraps.dev/sms` packages this project ships.",
  },
  {
    route: "/sms",
    primaryQuery: "sms infrastructure on your own aws",
    secondaryQueries: [
      "aws end user messaging sms setup",
      "sms api same dx as email",
    ],
    audience: "evaluating-wraps",
    rationale:
      'States its positioning directly against the email product — "same great DX as email" — for AWS End User Messaging, a newer and less-covered AWS service than SES, giving this page less incumbent competition to outrank.',
  },
  {
    route: "/why-wraps",
    primaryQuery: "is wraps production ready for company email",
    secondaryQueries: [
      "wraps soc 2 compliance",
      "wraps security review questions",
      "what happens to my infrastructure if wraps shuts down",
    ],
    audience: "evaluating-wraps",
    rationale:
      'Rewritten 2026-09-14 for the approver rather than the engineer: a risk register in AWS\'s own enforcement numbers, the exit story, and the security-review questions answered including the ones we fail. Nothing else on the site answers "should we let this vendor into our AWS account", and the old framing (AWS pricing plus modern DX) duplicated every /compare/*-vs-wraps page.',
  },
  {
    route: "/for/marketing",
    primaryQuery: "email marketing unlimited contacts pricing",
    secondaryQueries: [
      "broadcasts segments topics preference center",
      "flat priced email marketing not by contacts",
    ],
    audience: "evaluating-wraps",
    rationale:
      "States a specific, checkable pricing claim — unlimited contacts on every plan starting at $29/month, flat by plan rather than metered by contacts stored — directly against the per-contact billing named as the pain point on the Customer.io and Klaviyo compare pages.",
  },
  {
    route: "/for/operators",
    primaryQuery: "email deliverability operations audit trail",
    secondaryQueries: [
      "preflight broadcast before sending",
      "double opt in consent record",
    ],
    audience: "evaluating-wraps",
    rationale:
      "Targets the person accountable for the send rather than the marketer composing it — preflight checks, consent as a record, and end-to-end message tracing are operator concerns distinct from /for/marketing's campaign-authoring framing.",
  },

  // --- Amazon SES ---
  {
    route: "/ses",
    primaryQuery: "how to run amazon ses in production",
    secondaryQueries: [
      "amazon ses operations reference",
      "ses limits and errors overview",
      "operating aws ses at scale",
    ],
    audience: "stranger-with-problem",
    rationale:
      "The hub for the SES failure surface rather than another setup tutorial, and the only page on the site that indexes AWS's own exceptions next to the operational limits AWS enforces on every account.",
  },
  {
    route: "/ses/errors",
    primaryQuery: "amazon ses error codes list",
    secondaryQueries: [
      "ses exception reference",
      "aws ses send email error codes",
      "ses smtp response codes",
    ],
    audience: "stranger-with-problem",
    rationale:
      "Groups every mapped SES exception by what actually went wrong instead of listing them alphabetically, and every row is traceable to a WrapsError code a shipped CLI raises, which no aggregator page can claim.",
  },
  {
    route: "/ses/errors/email-address-not-verified",
    primaryQuery: "ses email address is not verified error",
    secondaryQueries: [
      "messagerejected email address is not verified",
      "ses identities failed the check in region",
      "ses sandbox recipient not verified",
    ],
    audience: "stranger-with-problem",
    rationale:
      "This is the most-pasted SES string in existence and the page separates the three causes the CLI already distinguishes — sandbox, unverified sender, receive-only domain — where the incumbent results treat it as one problem.",
  },
  {
    route: "/ses/errors/maximum-sending-rate-exceeded",
    primaryQuery: "ses maximum sending rate exceeded",
    secondaryQueries: [
      "aws ses throttling error retry",
      "ses 454 throttling failure",
      "ses rate limit backoff",
    ],
    audience: "stranger-with-problem",
    rationale:
      "Separates the per-second rate from the 24-hour quota, which is the distinction that decides whether backoff helps at all, and most results for this string conflate the two.",
  },
  {
    route: "/ses/errors/daily-sending-quota-exceeded",
    primaryQuery: "ses daily message quota exceeded",
    secondaryQueries: [
      "aws ses 24 hour sending quota",
      "increase ses sending quota",
      "ses limitexceededexception sending",
    ],
    audience: "stranger-with-problem",
    rationale:
      "Names the rolling 24-hour window rather than a midnight reset, which is the single most common wrong assumption about this limit and the reason people wait for capacity that is already back.",
  },
  {
    route: "/ses/errors/account-sending-paused",
    primaryQuery: "aws paused sending for my ses account",
    secondaryQueries: [
      "accountsendingpausedexception ses",
      "ses account under review sending disabled",
      "resume ses sending after pause",
    ],
    audience: "stranger-with-problem",
    rationale:
      "The reader is in an incident, and the page leads with the Reputation Dashboard and the bounce and complaint thresholds AWS enforces rather than a retry, which is what the CLI does with this exception too.",
  },
  {
    route: "/ses/errors/configuration-set-does-not-exist",
    primaryQuery: "ses configuration set does not exist error",
    secondaryQueries: [
      "configurationsetdoesnotexistexception",
      "ses configuration set wrong region",
      "ses configuration set name not found",
    ],
    audience: "stranger-with-problem",
    rationale:
      "Leads with the regional-resource explanation, which accounts for most occurrences, and Wraps deploys this resource itself so the failure mode is one we have to get right in code, not just describe.",
  },
  {
    route: "/ses/errors/configuration-set-sending-paused",
    primaryQuery: "ses configuration set sending is paused",
    secondaryQueries: [
      "configurationsetsendingpausedexception",
      "resume configuration set ses",
      "ses pause scoped to configuration set",
    ],
    audience: "stranger-with-problem",
    rationale:
      "Almost nothing on the web distinguishes a configuration-set pause from an account pause, and the exception names are the only reliable way to tell which incident you are in.",
  },
  {
    route: "/ses/errors/mail-from-domain-not-verified",
    primaryQuery: "ses mail from domain is not verified",
    secondaryQueries: [
      "mailfromdomainnotverifiedexception",
      "ses custom mail from mx record",
      "ses mail from spf record pending",
    ],
    audience: "stranger-with-problem",
    rationale:
      "Names both DNS records SES needs on the MAIL FROM subdomain and says plainly that removing the custom MAIL FROM is a valid fix, which vendor docs avoid because they want the SPF alignment.",
  },
  {
    route: "/ses/errors/invalid-client-token-id",
    primaryQuery: "aws invalidclienttokenid security token is invalid",
    secondaryQueries: [
      "invalidclienttokenid ses",
      "aws access key deactivated error",
      "aws credential precedence environment variable",
    ],
    audience: "stranger-with-problem",
    rationale:
      "Distinguishes an unresolvable key from an expired session and from a denied permission, a three-way split the Wraps CLI had to get right because collapsing it into a credentials error is the exact bug we fixed in our own catalog.",
  },
  {
    route: "/ses/errors/signature-does-not-match",
    primaryQuery: "the request signature we calculated does not match",
    secondaryQueries: [
      "signaturedoesnotmatch aws ses",
      "sigv4 signature mismatch clock skew",
      "aws secret access key signature error",
    ],
    audience: "stranger-with-problem",
    rationale:
      "Covers clock skew and post-signing request mutation alongside the obvious wrong-secret case, and those two account for the occurrences that look intermittent and therefore stay unfixed longest.",
  },
  {
    route: "/ses/errors/unrecognized-client-exception",
    primaryQuery: "unrecognizedclientexception aws ses security token invalid",
    secondaryQueries: [
      "unrecognizedclientexception credential chain",
      "aws profile does not exist error",
      "container task role not attached aws",
    ],
    audience: "stranger-with-problem",
    rationale:
      "Frames this as an empty or unresolved credential chain rather than a wrong key, which is what it usually is in containers, and is why the CLI refuses to report it as credentials not found.",
  },
  {
    route: "/ses/errors/expired-token",
    primaryQuery: "aws expired token error when sending email",
    secondaryQueries: [
      "expiredtokenexception aws sdk",
      "aws sso session expired mid job",
      "refresh assumed role credentials",
    ],
    audience: "stranger-with-problem",
    rationale:
      "Targets the batch-send case where the session outlives nothing and the job outlives the session, and names freezing credentials into environment variables as the cause, which is the part people reintroduce after every fix.",
  },
  {
    route: "/ses/errors/access-denied",
    primaryQuery: "aws ses access denied when sending email",
    secondaryQueries: [
      "is not authorized to perform ses:sendemail",
      "ses iam permission denied",
      "aws accessdenied principal action resource",
    ],
    audience: "stranger-with-problem",
    rationale:
      "Teaches the reader to read the principal, action and resource out of the message rather than pasting a wildcard policy, and points at the CLI command that already prints the actions a given operation needs.",
  },

  // --- Amazon SES operations ---
  // These target the symptom in the reader's own words. The /ses/errors/*
  // pages above target the literal AWS exception, which is a different search.
  {
    route: "/ses/bounce-rate",
    primaryQuery: "ses bounce rate too high",
    secondaryQueries: [
      "aws ses bounce rate limit",
      "reduce bounce rate amazon ses",
      "what bounce rate does aws suspend at",
    ],
    audience: "stranger-with-problem",
    rationale:
      "Separates AWS's 2% best-practice level from the 5% review level and the 10% pause level, three numbers most results collapse into one, and states the rule that bounce rate counts only hard bounces to unverified domains.",
  },
  {
    route: "/ses/complaint-rate",
    primaryQuery: "what is a good ses complaint rate",
    secondaryQueries: [
      "aws ses complaint rate threshold",
      "ses 0.1 percent complaint limit",
      "reduce spam complaints amazon ses",
    ],
    audience: "stranger-with-problem",
    rationale:
      "Carries the fact almost nothing else does: AWS excludes complaints from providers with no feedback loop, so the rate in the console is a floor rather than a measurement, which changes how much headroom a sender needs.",
  },
  {
    route: "/ses/account-under-review",
    primaryQuery: "amazon ses account under review what to do",
    secondaryQueries: [
      "ses sending paused how to fix",
      "aws ses support case reply reputation",
      "difference between ses review and pause",
    ],
    audience: "stranger-with-problem",
    rationale:
      "Distinguishes two states that AWS's own notification emails read similarly for, and quotes what AWS asks for in the case reply, which is changes already implemented rather than a remediation plan.",
  },
  {
    route: "/ses/limits",
    primaryQuery: "amazon ses sending limits and quotas",
    secondaryQueries: [
      "increase ses sending quota",
      "ses sandbox 200 emails per day",
      "ses sending rate per second",
    ],
    audience: "stranger-with-problem",
    rationale:
      "States the sandbox numbers exactly, separates the per-second rate from the rolling 24-hour cap, and names the recipients-not-messages rule that makes quota arithmetic surprise people mid-broadcast.",
  },
  {
    route: "/ses/spam-folder",
    primaryQuery: "ses emails going to spam folder",
    secondaryQueries: [
      "aws ses email in spam gmail",
      "why does ses mail get filtered",
      "fix ses deliverability spam placement",
    ],
    audience: "stranger-with-problem",
    rationale:
      "This SERP is owned by inbox-warmup vendors whose product benefits from the problem, so a page that puts authentication first and says plainly that no one controls a provider's filtering decision wins on substance rather than volume.",
  },

  // --- Versus (generated) ---
  // Everything between these markers is written by
  // `pnpm --filter wraps-website versus:generate` from src/config/versus.ts.
  // Edit that file, not this block — a regenerate overwrites it.
  // BEGIN GENERATED VERSUS INTENT
  {
    route: "/versus",
    primaryQuery: "email vendor head to head comparisons",
    secondaryQueries: [
      "compare two email providers directly",
      "email api comparison not written by a vendor",
      "which email platform should i choose",
    ],
    audience: "stranger-with-problem",
    rationale:
      "Every comparison hub in this space is a vendor listing itself against the field. This one indexes pairs it is not part of, which is both a different query shape and the only version of the page a reader has a reason to trust.",
  },
  {
    route: "/versus/postmark-vs-resend",
    primaryQuery: "postmark vs resend for transactional email",
    secondaryQueries: [
      "is resend or postmark better for deliverability",
      "resend 30 day log retention limit",
      "resend two requests per second rate limit",
      "react email with postmark",
      "which transactional provider stores the message body",
      "moving postmark layouts into react email components",
      "enforced separation between bulk and transactional mail",
    ],
    audience: "stranger-with-problem",
    rationale:
      "The two facts that decide this in practice — Resend purging logs at thirty days on every non-Enterprise plan, and a two-per-second API ceiling that does not lift on any tier — appear in neither vendor's own comparison, because neither vendor is going to write them down.",
  },
  {
    route: "/versus/loops-vs-resend",
    primaryQuery: "loops vs resend for product email",
    secondaryQueries: [
      "does resend do drip campaigns",
      "per contact or per send email pricing",
      "loops transactional email quality",
      "onboarding sequence without building it yourself",
      "keeping email templates in version control",
      "building drip sequences with durable timers",
      "email provider with both an smtp relay and an api",
    ],
    audience: "stranger-with-problem",
    rationale:
      "These two look interchangeable from the outside and are not: Resend has no journeys at all, so a drip sequence is code you write. Stating that plainly, with the inverted billing units next to it, answers the question people are actually asking when they search the pair.",
  },
  {
    route: "/versus/mailgun-vs-sendgrid",
    primaryQuery: "mailgun vs sendgrid for high volume sending",
    secondaryQueries: [
      "sendgrid free tier ended what replaced it",
      "sendgrid account suspended no warning",
      "is sendgrid marketing campaigns a separate plan",
      "dedicated ip mailgun or sendgrid",
      "mailgun routes compared with inbound parse",
      "subaccounts versus subusers for multi tenant sending",
      "keeping category reporting across an email migration",
    ],
    audience: "stranger-with-problem",
    rationale:
      "Both vendors' free tiers are gone — SendGrid's ended in May 2025, Mailgun's is a hard hundred a day — and nearly every comparison still treats one of them as the free option. The suspension pattern that dominates both vendors' public reviews is likewise absent from every vendor-written page.",
  },
  {
    route: "/versus/mailgun-vs-postmark",
    primaryQuery: "mailgun vs postmark deliverability and pricing",
    secondaryQueries: [
      "did mailgun raise its prices",
      "mailgun flex plan discontinued",
      "postmark message streams explained",
      "which email api has better inbound routing",
      "postmark servers versus mailgun sending domains",
      "how many tags per message can i send",
      "email api that does not offer list validation",
    ],
    audience: "stranger-with-problem",
    rationale:
      "Almost every comparison of these two still quotes Mailgun's pre-December-2025 pay-as-you-go rate, which closed to new signups and then doubled. A page that prices what you can actually buy today is correcting a specific, checkable error the rest of the results are repeating.",
  },
  {
    route: "/versus/customer-io-vs-klaviyo",
    primaryQuery: "customer.io vs klaviyo for lifecycle messaging",
    secondaryQueries: [
      "klaviyo for saas instead of ecommerce",
      "customer.io profile based pricing explained",
      "lifecycle email tool that is not ecommerce first",
      "per profile billing marketing automation",
      "klaviyo smart sending skipped recipients",
      "lifecycle messaging triggered by an account not a person",
      "exporting segment membership from a marketing platform",
    ],
    audience: "stranger-with-problem",
    rationale:
      "These two are usually compared on feature tables when the decision is actually made by data model — events you define against orders and catalogues you did not — and by a shared per-profile meter that neither vendor's page frames as the trade it is.",
  },
  {
    route: "/versus/brevo-vs-klaviyo",
    primaryQuery: "brevo vs klaviyo for ecommerce email",
    secondaryQueries: [
      "does klaviyo charge for unsubscribed profiles",
      "klaviyo bill keeps going up",
      "cheaper klaviyo alternative for a big list",
      "klaviyo sending limit ten times profiles",
      "per list unsubscribe versus global suppression",
      "does my email tool store the product catalogue",
      "keeping proof of opt-in when changing email platform",
    ],
    audience: "stranger-with-problem",
    rationale:
      "Klaviyo has billed all active profiles rather than only subscribers since February 2025 and auto-upgrades across bands without auto-downgrading. That ratchet is the single most common complaint from stores and it is the thing a send-metered competitor is genuinely an answer to.",
  },
  {
    route: "/versus/brevo-vs-sendgrid",
    primaryQuery: "brevo vs sendgrid marketing and transactional",
    secondaryQueries: [
      "eu based alternative to sendgrid",
      "does brevo put its logo on my emails",
      "brevo automation which plan",
      "gdpr compliant transactional email provider",
      "brevo contact attribute must exist before import",
      "brevo transactional template id required",
      "new email account daily sending limit first week",
    ],
    audience: "stranger-with-problem",
    rationale:
      "The decision is usually made by a European compliance review rather than by features, and the two facts that actually change the quote — Brevo branding your footer on lower plans, and SendGrid billing Marketing Campaigns as a second plan — are absent from the comparison tables that rank for this.",
  },
  {
    route: "/versus/customer-io-vs-loops",
    primaryQuery: "customer.io vs loops for saas lifecycle email",
    secondaryQueries: [
      "cheaper alternative to customer.io for a startup",
      "lifecycle and transactional email in one tool",
      "customer.io minimum monthly cost",
      "when do you outgrow loops",
      "segment on events over a rolling time window",
      "test a lifecycle email before it reaches customers",
      "alert when automated emails stop sending",
    ],
    audience: "stranger-with-problem",
    rationale:
      "Nearly every result for this pair compares features when the monthly floor decides it first, and neither vendor will say out loud that the deciding question is whether anyone on the team will actually own the messaging platform day to day.",
  },
  {
    route: "/versus/amazon-ses-vs-resend",
    primaryQuery: "should i use amazon ses directly or resend",
    secondaryQueries: [
      "resend is built on amazon ses",
      "what does resend add on top of ses",
      "moving from resend to raw ses",
      "ses sandbox versus a hosted email api",
      "exporting resend logs before the window closes",
      "does a hosted provider reputation transfer to my aws account",
      "requesting an ses sending rate increase",
    ],
    audience: "stranger-with-problem",
    rationale:
      "Almost every result for this comparison is published by one of the two parties, and neither leads with the fact that decides it: they share a delivery substrate, so the real trade is ownership and tooling rather than inbox placement.",
  },
  {
    route: "/versus/amazon-ses-vs-self-hosted",
    primaryQuery: "is it worth running your own mail server instead of ses",
    secondaryQueries: [
      "postal mail server versus amazon ses",
      "self hosted smtp deliverability problems",
      "port 25 blocked on cloud provider",
      "cost of running your own outbound mail server",
      "reverse dns ptr record for a sending mail server",
      "enrolling in complaint feedback loops for a new ip",
      "what aws asks in the ses production access request",
    ],
    audience: "stranger-with-problem",
    rationale:
      "The people asking this have already rejected the hosted-API tier on price, so a comparison that reasons about per-message rates is answering a question they stopped asking. What they need priced is the operational work, and nobody selling either option has a reason to itemise it.",
  },
  {
    route: "/versus/amazon-ses-vs-cloudflare-email",
    primaryQuery: "how to receive email in code with aws or cloudflare",
    secondaryQueries: [
      "cloudflare email workers versus ses inbound",
      "parse incoming email into a lambda",
      "free way to receive email programmatically",
      "ses receipt rules explained",
      "does cloudflare email routing require cloudflare dns",
      "what happens when an email worker throws an error",
      "switching mx records without losing inbound mail",
    ],
    audience: "stranger-with-problem",
    rationale:
      "Inbound email is the half of the stack almost nobody writes about, so the query is answered today by product documentation on both sides and by nothing that puts the two next to each other — including the fact that only one of them can also send.",
  },
  {
    route: "/versus/courier-vs-knock",
    primaryQuery:
      "notification infrastructure platform comparison for engineers",
    secondaryQueries: [
      "do we need a notification service or just send email",
      "in app notification inbox build or buy",
      "user notification preference centre off the shelf",
      "notification orchestration layer pricing",
      "batching notifications into a digest window",
      "notification failover when a provider is down",
      "giving a third party our email provider api key",
    ],
    audience: "stranger-with-problem",
    rationale:
      "Teams reach this comparison after deciding to stop hand-rolling notification fan-out, which means they are evaluating a category rather than two products — and the category question, whether this layer is worth paying for at all, is one neither vendor's site will answer honestly.",
  },
  {
    route: "/versus/agentmail-vs-mailslurp",
    primaryQuery: "api that gives an ai agent its own email inbox",
    secondaryQueries: [
      "programmatic inbox for autonomous agents",
      "how many inboxes can i create over an api",
      "email address per agent instead of per user",
      "receive and reply to email from code",
      "outbound sending limit on a test inbox provider",
      "how to thread an email reply correctly from code",
      "how long does an api inbox keep messages",
    ],
    audience: "stranger-with-problem",
    rationale:
      "The agent-inbox category is new enough that search results are still dominated by test-automation tooling, so a buyer looking for a production sender of record for a fleet of agents is being shown products whose outbound allowance is measured in hundreds a month.",
  },
  {
    route: "/versus/agentmail-vs-nylas",
    primaryQuery: "should an ai agent have its own mailbox or use the users",
    secondaryQueries: [
      "connect gmail and outlook to an ai agent",
      "google oauth verification for email scopes timeline",
      "agent sending email on behalf of a user",
      "unified email api versus hosted agent inbox",
      "what does a casa security assessment involve",
      "handling a revoked oauth token for a mailbox integration",
      "why is the first mailbox sync so slow",
    ],
    audience: "stranger-with-problem",
    rationale:
      "This is an architecture decision disguised as a vendor comparison, and the expensive part — a third-party security review of your Gmail scopes, on Google's schedule — appears in neither vendor's marketing and routinely slips launch dates by months.",
  },
  {
    route: "/versus/mailslurp-vs-mailtrap",
    primaryQuery: "how to test email flows in an automated test suite",
    secondaryQueries: [
      "capture outgoing email in staging instead of sending",
      "assert on a one time code sent by email",
      "end to end test for signup email verification",
      "fake smtp server for integration tests",
      "stop a staging deploy sending real email",
      "how many emails does a test suite generate",
      "should a test assert on rendered email html",
    ],
    audience: "stranger-with-problem",
    rationale:
      "The common framing treats these as interchangeable email-testing tools, which hides the distinction that actually matters to somebody writing the test: only one of them can receive a message that your own application did not send.",
  },
  {
    route: "/versus/mailtrap-vs-smtp2go",
    primaryQuery: "reliable smtp relay with good delivery reporting",
    secondaryQueries: [
      "smtp relay for an application that cannot use an api",
      "send email from a device or appliance over smtp",
      "which smtp service has the best logs",
      "smtp relay with a staging sandbox",
      "assert on email contents in integration tests",
      "separate streams for bulk and transactional mail",
      "spam score and html check before sending",
    ],
    audience: "stranger-with-problem",
    rationale:
      "Buyers searching for a relay rather than an API are usually constrained — a device, a legacy application, a framework with an SMTP transport — and the comparison content in this space is written for people choosing a modern SDK, which is a different reader entirely.",
  },
  {
    route: "/versus/ahasend-vs-zeptomail",
    primaryQuery: "cheapest transactional email api that is not amazon ses",
    secondaryQueries: [
      "transactional only email provider policy",
      "prepaid email credits that expire",
      "low cost email api without an aws account",
      "email api under a cent per message",
      "is a re-engagement email transactional or marketing",
      "what happens when prepaid email credits run out",
      "email provider support hours for a small team",
    ],
    audience: "stranger-with-problem",
    rationale:
      "Price-led comparisons in this category are written by vendors who are not the cheapest, so the two products that genuinely are get described in terms of what they lack rather than in terms of the two very different bets a buyer is choosing between.",
  },
  {
    route: "/versus/ahasend-vs-bavimail",
    primaryQuery:
      "small independent alternatives to resend for transactional mail",
    secondaryQueries: [
      "new transactional email providers worth trying",
      "email api with inbound inboxes included",
      "is a new email provider safe to rely on",
      "flat rate transactional email pricing",
      "email plan limited by number of domains not volume",
      "what is the overage rate on an email plan",
      "migrating inbound email addresses to another provider",
    ],
    audience: "stranger-with-problem",
    rationale:
      "Both vendors are too new to appear in the comparison content that ranks today, so the person evaluating them is doing it from two pricing pages and no independent read of what each actually includes or what the risk of either is.",
  },
  {
    route: "/versus/mailersend-vs-sendgrid",
    primaryQuery: "email platform with a template builder a marketer can use",
    secondaryQueries: [
      "sendgrid alternative for a small team",
      "email api with drag and drop templates",
      "sending for multiple brands from one account",
      "moving off sendgrid after the free tier ended",
      "mailersend account approval before sending",
      "what replaces sendgrid subusers",
      "bulk email endpoint versus personalizations array",
    ],
    audience: "stranger-with-problem",
    rationale:
      "Searches in this space spiked after SendGrid retired its free tier, and the results are dominated by developer-first APIs — which is the wrong recommendation for the substantial share of these teams whose actual requirement is a template a non-engineer can edit.",
  },
  {
    route: "/versus/mandrill-vs-postmark",
    primaryQuery:
      "moving transactional email off mailchimp to a dedicated provider",
    secondaryQueries: [
      "mandrill requires a paid mailchimp plan",
      "is mandrill still being developed",
      "transactional email separate from marketing platform",
      "mailchimp transactional email alternatives",
      "do mandrill email credits expire",
      "converting mailchimp merge tags to another provider",
      "mandrill rejection list stuck address",
    ],
    audience: "stranger-with-problem",
    rationale:
      "The people asking this are already Mailchimp customers evaluating whether to keep transactional there, so the decisive fact is a purchasing constraint rather than a feature gap — and a comparison written for greenfield buyers never mentions it.",
  },
  {
    route: "/versus/brevo-vs-scaleway-tem",
    primaryQuery: "european email provider for gdpr data residency",
    secondaryQueries: [
      "send email without any us cloud provider",
      "eu hosted transactional email api",
      "scaleway transactional email review",
      "european alternative to sendgrid and mailgun",
      "how to read a subprocessor list for a residency requirement",
      "building an unsubscribe endpoint against a bare sending api",
      "dedicated sending address on a european email provider",
    ],
    audience: "stranger-with-problem",
    rationale:
      "Residency-driven searches return marketing pages asserting EU hosting without distinguishing where data is stored from who the subprocessors are, which is the distinction a procurement questionnaire actually asks about.",
  },
  {
    route: "/versus/customer-io-vs-knock",
    primaryQuery: "lifecycle messaging platform or notification infrastructure",
    secondaryQueries: [
      "product notifications versus marketing automation tool",
      "who should own notification logic engineering or marketing",
      "in app notification feed with preferences",
      "notification system billed per profile or per send",
      "idempotency key for notifications from a queue",
      "cost of building an in app notification feed",
      "which system owns notification preferences",
    ],
    audience: "stranger-with-problem",
    rationale:
      "Teams discover late that these two are answering different questions, having evaluated them on an overlapping feature list; the decisive difference is organisational — which team owns the workflow — and no vendor page frames it that way.",
  },
  {
    route: "/versus/amazon-ses-vs-sendgrid",
    primaryQuery: "is amazon ses cheaper than sendgrid",
    secondaryQueries: [
      "what does sendgrid do that amazon ses cannot",
      "sendgrid free tier retired replacement",
      "sendgrid smtp relay versus ses smtp endpoint",
      "aws support plan cost when running ses",
      "migrating sendgrid dynamic templates to ses",
      "is there a subuser equivalent in amazon ses",
      "sendgrid event webhook compared to ses notifications",
    ],
    audience: "stranger-with-problem",
    rationale:
      "Everyone answering this compares a plan price to a per-thousand rate and stops. The costs that decide it in practice — an AWS support plan you did not previously need on one side, a marketing plan sold separately on the other — appear on neither pricing page next to the number people quote.",
  },
  {
    route: "/versus/amazon-ses-vs-postmark",
    primaryQuery: "does postmark deliver better than amazon ses",
    secondaryQueries: [
      "postmark message streams explained",
      "how long does postmark keep message content",
      "is postmark worth the price over raw ses",
      "transactional email that never shares a pool with marketing",
      "exporting postmark suppressions before leaving",
      "replacing postmark activity search on aws",
      "what to do with postmark layouts when moving to ses",
    ],
    audience: "stranger-with-problem",
    rationale:
      "The interesting claim on this pair is not the price gap, which is obvious, but whether a managed sender's inbox placement is structurally better than a well-run account of your own. Nobody neutral writes that down, because both parties have an interest in the answer.",
  },
  {
    route: "/versus/amazon-ses-vs-mailgun",
    primaryQuery: "what mailgun adds on top of amazon ses",
    secondaryQueries: [
      "mailgun inbound routes versus ses receipt rules",
      "email address validation api alternatives",
      "mailgun flex plan closed to new signups",
      "searchable email logs without building a pipeline",
      "turning mailgun routes into ses receipt rules",
      "replacing mailgun validation after a migration",
      "mailgun webhook signing versus sns notifications",
    ],
    audience: "stranger-with-problem",
    rationale:
      "Mailgun sits closer to SES on the stack than any other hosted vendor, so the comparison turns on specific capabilities rather than on philosophy — and on a repricing in December 2025 that existing customers noticed and prospective ones have not heard about.",
  },
  {
    route: "/versus/resend-vs-sendgrid",
    primaryQuery: "resend or sendgrid for a new product",
    secondaryQueries: [
      "sendgrid replacement for a small dev team",
      "resend rate limit two requests per second",
      "sendgrid trial after free tier ended",
      "does resend have marketing campaigns",
      "converting sendgrid dynamic templates to react email",
      "per tenant sending credentials for an agency",
      "what to do when a sendgrid trial expires",
    ],
    audience: "stranger-with-problem",
    rationale:
      "Almost every result is a migration guide published by one of the two. The facts that decide it — a fixed request-rate ceiling on one side that no plan lifts, a retired free tier on the other — are in neither guide, because neither company benefits from raising them.",
  },
  {
    route: "/versus/mailgun-vs-resend",
    primaryQuery: "mailgun replacement for a modern stack",
    secondaryQueries: [
      "does resend support inbound email routing",
      "resend api rate limit for bulk sending",
      "mailgun pay as you go plan discontinued",
      "email api with address validation built in",
      "what to do with mailgun routes when switching provider",
      "how long does mailgun keep logs on each plan",
      "sending bulk email under a strict api rate limit",
    ],
    audience: "stranger-with-problem",
    rationale:
      "Teams arrive at this comparison after the December 2025 Mailgun repricing and evaluate Resend on developer experience alone, which is the half that is easy to see. The capabilities they would be giving up — inbound routing, validation, deep log search — are not on Resend's feature page to be missed.",
  },
  {
    route: "/versus/postmark-vs-sendgrid",
    primaryQuery: "postmark or sendgrid for transactional email",
    secondaryQueries: [
      "leaving sendgrid after the free tier ended",
      "postmark message streams versus sendgrid categories",
      "which email provider suspends accounts less",
      "transactional email with a real support team",
      "moving sendgrid suppression lists to another provider",
      "per client sending isolation without subusers",
      "inbound parse alternatives for transactional email",
    ],
    audience: "stranger-with-problem",
    rationale:
      "This pair is searched by people already on SendGrid and unhappy about something specific — a suspension, a support ticket, a retired free tier. The comparison they need is operational rather than a feature grid, and nobody writes the operational one because it makes both vendors look partly bad.",
  },
  {
    route: "/versus/amazon-ses-vs-brevo",
    primaryQuery: "european email platform or aws ses for a small business",
    secondaryQueries: [
      "brevo transactional api versus raw ses",
      "gdpr compliant email sending without a us vendor",
      "which brevo plan includes automation",
      "do i need a marketing platform or just a send api",
      "how to move from brevo to amazon ses",
      "does amazon ses generate an unsubscribe link",
      "exporting brevo blocklisted contacts to a suppression list",
    ],
    audience: "stranger-with-problem",
    rationale:
      "These two sit in different categories, so the search that produces this comparison is usually a small European team deciding what kind of tool they need at all. That question has no neutral answer published anywhere, because every vendor answering it sells one of the two shapes.",
  },
  {
    route: "/versus/amazon-ses-vs-klaviyo",
    primaryQuery: "can i replace klaviyo with amazon ses",
    secondaryQueries: [
      "klaviyo active profile billing explained",
      "klaviyo sending limit ten times profile count",
      "cheaper way to send ecommerce campaigns",
      "shopify transactional email without klaviyo",
      "does klaviyo attributed revenue data export",
      "moving order confirmations off klaviyo",
      "rebuilding abandoned cart without a marketing platform",
    ],
    audience: "stranger-with-problem",
    rationale:
      "The search is driven by a Klaviyo invoice, and the answers available are written either by Klaviyo or by competitors selling a similar shape. Nobody explains that the honest replacement for Klaviyo is not a send API, which is the thing the person asking most needs to hear.",
  },
  {
    route: "/versus/amazon-ses-vs-customer-io",
    primaryQuery: "build lifecycle emails in house or buy a messaging platform",
    secondaryQueries: [
      "customer.io profile billing for unengaged signups",
      "what it takes to build drip campaigns on ses",
      "who should own onboarding email logic",
      "cheaper alternative to a behavioural messaging platform",
      "migrating liquid templates off a messaging platform",
      "topic level unsubscribe with amazon ses",
      "exporting customer.io workflows to another system",
    ],
    audience: "stranger-with-problem",
    rationale:
      "The build-or-buy question for lifecycle messaging is asked constantly by SaaS teams and answered almost exclusively by vendors selling the buy side. The specific thing missing from those answers is an honest account of what the build actually contains after the first sprint.",
  },
  {
    route: "/versus/amazon-ses-vs-loops",
    primaryQuery: "contact based pricing versus per send email costs",
    secondaryQueries: [
      "loops unlimited sends contact pricing explained",
      "email tool for saas with a big free tier",
      "dormant signups inflating email bill",
      "one tool for product and marketing email",
      "single subscription state across product and marketing mail",
      "how to preview transactional email on amazon ses",
      "exporting mailing list membership when changing email tools",
    ],
    audience: "stranger-with-problem",
    rationale:
      "The two pricing models are genuinely opposite and the crossover point depends entirely on a ratio — sends per contact — that no vendor calculator asks you for. A page that names the ratio is more useful than either pricing page.",
  },
  {
    route: "/versus/brevo-vs-resend",
    primaryQuery: "marketing suite or developer email api for a startup",
    secondaryQueries: [
      "brevo transactional api developer experience",
      "resend broadcasts versus a real marketing tool",
      "eu based email platform for gdpr",
      "does resend charge for marketing contacts",
      "sending a large campaign under a two per second rate limit",
      "using react email with a marketing suite",
      "what happens to email logs after thirty days",
    ],
    audience: "stranger-with-problem",
    rationale:
      "European startups evaluate these two together because one is the default EU answer and the other is the default developer answer. Neither vendor's material acknowledges the other's category, so the comparison a buyer needs does not exist on either site.",
  },
  {
    route: "/versus/customer-io-vs-resend",
    primaryQuery: "do i need a messaging platform or just a send api",
    secondaryQueries: [
      "resend for onboarding sequences",
      "customer.io versus sending email from your own code",
      "when to move lifecycle email off an api",
      "cost of a messaging platform for a small saas",
      "segment on engagement older than thirty days",
      "subscription topics versus a single unsubscribe flag",
      "tagging sends so reporting can group by campaign",
    ],
    audience: "stranger-with-problem",
    rationale:
      "Teams reach this comparison at the moment their onboarding email stops being one message, which is a specific and recurring decision point. Every article about it is published by a platform vendor, so the honest version of when you do not need one is unwritten.",
  },
  {
    route: "/versus/klaviyo-vs-resend",
    primaryQuery: "cut ecommerce email costs by moving to an api",
    secondaryQueries: [
      "resend for shopify transactional email",
      "klaviyo profile billing keeps increasing",
      "what you lose leaving an ecommerce marketing platform",
      "send order confirmations without a marketing tool",
      "sending order confirmations during a flash sale rate limit",
      "how long are transactional email logs kept",
      "where to store manually suppressed customers",
    ],
    audience: "stranger-with-problem",
    rationale:
      "This search comes from a merchant looking at a Klaviyo invoice, and every available answer is from a competing marketing platform proposing a like-for-like swap. Nobody explains which half of the bill can actually move to a send API and which half cannot.",
  },
  {
    route: "/versus/amazon-ses-vs-mailersend",
    primaryQuery: "email api with a template editor for non developers",
    secondaryQueries: [
      "mailersend starter versus professional plan difference",
      "who edits transactional email templates",
      "aws ses template api limitations",
      "multi brand transactional email for an agency",
      "blocking an entire domain from receiving your email",
      "where to store amazon ses delivery events for search",
      "separating client sending accounts on aws",
    ],
    audience: "stranger-with-problem",
    rationale:
      "The decision here is organisational rather than technical — whether a person without commit access needs to change an email — and it is not a decision either vendor's pricing page is organised around, so the comparison has to be written from the outside.",
  },
  {
    route: "/versus/mailersend-vs-resend",
    primaryQuery: "mailersend or resend for transactional email",
    secondaryQueries: [
      "email api where marketing can edit the template",
      "react email versus drag and drop builder",
      "mailersend api rate limit compared to resend",
      "transactional email with sms on the same account",
      "idempotency key for sending transactional email",
      "verifying email provider webhook signatures",
      "choosing a region for a sending domain",
    ],
    audience: "stranger-with-problem",
    rationale:
      "Both vendors describe themselves as developer-friendly email APIs, which is why they show up in the same shortlist and why the shortlist is usually wrong — the deciding question is who is allowed to change an email without a deploy, and neither pricing page frames it that way.",
  },
  {
    route: "/versus/resend-vs-smtp2go",
    primaryQuery: "email api or smtp relay for an application i did not write",
    secondaryQueries: [
      "smtp relay for a legacy system with good reporting",
      "resend smtp support versus a dedicated relay",
      "sending email from an appliance or crm",
      "smtp2go reporting compared to an email api",
      "which outbound smtp port is blocked on my network",
      "legacy app drops email silently instead of retrying",
      "daily sending cap versus monthly allowance",
    ],
    audience: "stranger-with-problem",
    rationale:
      "Comparisons in this category assume the reader controls the sending code, and a large share of the people searching do not — they are wiring up a NAS, an ERP, a WordPress install or a vendor appliance whose only email setting is a hostname, a port and a password.",
  },
  {
    route: "/versus/mandrill-vs-resend",
    primaryQuery: "migrating transactional email from mandrill to a modern api",
    secondaryQueries: [
      "is mandrill worth keeping in 2026",
      "mandrill rejection list export before migrating",
      "replacing mailchimp transactional email",
      "mandrill merge tags versus react email",
      "what replaces mandrill subaccounts",
      "email api that keeps the content of sent messages",
      "tagging sends so you can group events later",
    ],
    audience: "stranger-with-problem",
    rationale:
      "The searcher here already has the integration in production and is estimating the cost of leaving, so the useful content is the export list and the failure modes of the cutover — which no vendor comparison written for greenfield buyers contains.",
  },
  {
    route: "/versus/mailersend-vs-postmark",
    primaryQuery: "mailersend or postmark for product email",
    secondaryQueries: [
      "email api with a builder and good deliverability",
      "postmark message streams versus a single domain",
      "do i need message streams for transactional email",
      "email vendor a non engineer can use safely",
      "how many message streams should i create",
      "moving inbound parsing between email providers",
      "email provider that also sends sms on one account",
    ],
    audience: "stranger-with-problem",
    rationale:
      "These two are cross-shopped by teams who want one vendor for product email and the occasional announcement, and the decisive difference is architectural rather than cosmetic — whether bulk and transactional reputation are separated by the product or by everyone remembering to be careful.",
  },
  {
    route: "/versus/postmark-vs-smtp2go",
    primaryQuery: "best email provider for diagnosing delivery problems",
    secondaryQueries: [
      "postmark activity view versus smtp2go reporting",
      "smtp relay with blacklist monitoring",
      "which email vendor shows the raw bounce reason",
      "email provider for a support team to debug from",
      "one smtp credential per device instead of a shared password",
      "email relay that pins processing to a region",
      "appliance fails dmarc envelope and header from",
    ],
    audience: "stranger-with-problem",
    rationale:
      "Reporting is the one attribute both of these vendors are chosen for, so a page that separates per-message forensics from sender-health monitoring answers a comparison neither vendor will make, because each would rather claim the whole word.",
  },
  {
    route: "/versus/mailersend-vs-mailgun",
    primaryQuery: "mailersend or mailgun for a growing product",
    secondaryQueries: [
      "email api with conditional inbound routing rules",
      "mailgun subaccounts versus a flat domain list",
      "email validation built into the sending provider",
      "mailgun flex plan closed to new signups",
      "retrieve the original mime of a message you sent",
      "email validation api without sending through the same vendor",
      "inbound routing rules evaluated in priority order",
    ],
    audience: "stranger-with-problem",
    rationale:
      "Mailgun's December 2025 repricing pushed a cohort of small senders into evaluating alternatives for the first time in years, and the comparisons they find are written as if Mailgun were still primarily a cheap developer API rather than a volume platform with a routing engine attached.",
  },
  {
    route: "/versus/mailgun-vs-smtp2go",
    primaryQuery: "reliable smtp relay for business systems",
    secondaryQueries: [
      "mailgun alternative after the flex plan closed",
      "smtp relay with dedicated ip and reporting",
      "sending mail from devices and internal applications",
      "mailgun routes versus a simple relay",
      "mailgun sandbox domain authorized recipients",
      "smtp relay that verifies sender addresses",
      "one smtp credential per system instead of a shared password",
    ],
    audience: "stranger-with-problem",
    rationale:
      "Mailgun's entry-level repricing in December 2025 sent a specific cohort looking: small businesses relaying modest volumes from software they did not write, for whom Mailgun's routing and validation surface was never the point and is now being paid for.",
  },
  {
    route: "/versus/mailgun-vs-mandrill",
    primaryQuery:
      "transactional email that is not tied to a marketing platform",
    secondaryQueries: [
      "mandrill alternative that does inbound routing",
      "mailgun routes compared to mandrill inbound",
      "transactional email without buying mailchimp",
      "which transactional provider is still being developed",
      "how much does mailchimp transactional really cost",
      "mandrill hourly quota and reputation score",
      "setting up a custom click tracking domain",
    ],
    audience: "stranger-with-problem",
    rationale:
      "Both are long-established transactional products with an inbound story, which puts them on the same shortlist for teams doing reply handling — and the deciding facts are a purchasing prerequisite on one side and an ongoing investment question on the other, neither of which appears on a feature comparison.",
  },
  {
    route: "/versus/klaviyo-vs-sendgrid",
    primaryQuery: "klaviyo or sendgrid marketing campaigns for an online store",
    secondaryQueries: [
      "sendgrid marketing campaigns versus a dedicated ecommerce platform",
      "do i need klaviyo or is sendgrid enough",
      "ecommerce email attribution without klaviyo",
      "moving marketing email off sendgrid",
      "why does my klaviyo bill go up without sending",
      "who owns consent when marketing and transactional split",
      "separate subdomain for marketing and receipts",
    ],
    audience: "stranger-with-problem",
    rationale:
      "SendGrid Marketing Campaigns is bought by a lot of stores because it is already in the account, and the comparison they need is not about sending quality — it is about whether a contact list with custom fields can substitute for a behavioural profile, which no vendor will answer honestly.",
  },
  {
    route: "/versus/loops-vs-sendgrid",
    primaryQuery: "simple lifecycle email tool instead of sendgrid",
    secondaryQueries: [
      "loops.so versus sendgrid marketing campaigns",
      "email tool for a small saas team",
      "sendgrid replacement after the free tier ended",
      "unlimited sends priced per contact",
      "does loops have an smtp server",
      "loops transactional email needs a published template",
      "sendgrid marketing contacts billed separately from sending",
    ],
    audience: "stranger-with-problem",
    rationale:
      "The cohort SendGrid's free-tier retirement pushed into the market is mostly small software teams, and the tools they are shown are enterprise platforms — the useful comparison is against a product deliberately scoped to their size, including where it stops.",
  },
  {
    route: "/versus/customer-io-vs-sendgrid",
    primaryQuery:
      "behavioural messaging platform versus sendgrid marketing campaigns",
    secondaryQueries: [
      "customer.io instead of sendgrid for lifecycle email",
      "do i need an event based messaging tool",
      "sendgrid automations versus a real journey builder",
      "sending events to a messaging platform from my app",
      "customer.io workspace identifier id or email",
      "do transactional messages skip the unsubscribe check",
      "cost of instrumenting events for a messaging platform",
    ],
    audience: "stranger-with-problem",
    rationale:
      "Teams already holding a SendGrid account evaluate Customer.io when their automations stop being expressible, and the real question is whether they are prepared to instrument their product with events — a cost that no pricing page shows and that decides whether the upgrade works at all.",
  },
  {
    route: "/versus/klaviyo-vs-loops",
    primaryQuery: "klaviyo or loops for a subscription business",
    secondaryQueries: [
      "marketing email tool for saas instead of ecommerce",
      "loops.so compared to klaviyo",
      "do i need ecommerce flows for a software product",
      "email platform priced per contact with unlimited sends",
      "klaviyo predictive analytics minimum order history",
      "does a transactional email respect an unsubscribe",
      "moving email templates between platforms",
    ],
    audience: "stranger-with-problem",
    rationale:
      "Klaviyo dominates the search results for marketing email regardless of the searcher's business model, so software teams keep landing on an ecommerce platform whose most valuable features — cart, catalogue and order attribution — have no analogue in what they sell.",
  },
  {
    route: "/versus/brevo-vs-loops",
    primaryQuery: "brevo or loops for a small software company",
    secondaryQueries: [
      "email platform priced on sends versus per contact",
      "brevo automation is on the higher tier",
      "eu email marketing platform for saas",
      "removing the vendor logo from marketing emails",
      "do unsubscribed contacts count toward a contact priced plan",
      "daily sending limit under a free email tier",
      "moving sms sender registrations between providers",
    ],
    audience: "stranger-with-problem",
    rationale:
      "Brevo is recommended constantly on price without anyone mentioning that automation sits a tier above the headline plan, and Loops is recommended on simplicity without anyone mentioning that a large dormant list is billed forever — the two facts that actually decide this.",
  },
  {
    route: "/versus/brevo-vs-customer-io",
    primaryQuery: "brevo or customer.io for lifecycle messaging",
    secondaryQueries: [
      "affordable alternative to customer.io for a small team",
      "when is a behavioural messaging platform worth it",
      "eu data residency for a messaging platform",
      "brevo automation versus a real journey builder",
      "customer.io monthly minimum for a small company",
      "can a customer.io data region be changed later",
      "frequency capping on a behavioural messaging platform",
    ],
    audience: "stranger-with-problem",
    rationale:
      "These two appear on the same shortlist whenever a growing company asks what comes after basic campaigns, and the honest deciding factors — a monthly floor that excludes small companies, and an event pipeline somebody has to build — are absent from both vendors' own comparisons.",
  },
  // END GENERATED VERSUS INTENT
];

/** Routes that exist for reasons other than search. */
export const NON_CONTENT_ROUTES: readonly string[] = [
  // Home, company, legal, and navigational pages
  "/",
  "/about",
  "/blog",
  "/changelog",
  "/contact",
  "/dpa",
  "/privacy",
  "/security",
  "/subprocessors",
  "/terms",

  // /docs/** — deliberately deferred (see Maintenance notes below and in the
  // docs-pages skill). None of these are written for a stranger's search
  // query; they are the reference material a user reaches after choosing
  // Wraps, not before.
  "/docs",
  "/docs/cdk-reference",
  "/docs/cli-reference",
  "/docs/cli-reference/auth",
  "/docs/cli-reference/aws",
  "/docs/cli-reference/cdn",
  "/docs/cli-reference/email",
  "/docs/cli-reference/platform",
  "/docs/cli-reference/sms",
  "/docs/client-sdk-reference",
  "/docs/cookbook",
  "/docs/guides",
  "/docs/guides/account-health",
  "/docs/guides/aws-setup",
  "/docs/guides/aws-setup/full",
  "/docs/guides/aws-setup/permissions",
  "/docs/guides/aws-setup/quick",
  "/docs/guides/aws-setup/troubleshooting",
  "/docs/guides/better-auth",
  "/docs/guides/bounce-handling",
  "/docs/guides/configuration-presets",
  "/docs/guides/context7",
  "/docs/guides/custom-events",
  "/docs/guides/domain-verification",
  "/docs/guides/idempotency",
  "/docs/guides/migration",
  "/docs/guides/orchestration",
  "/docs/guides/production-access",
  "/docs/guides/reply-threading",
  "/docs/guides/reputation",
  "/docs/guides/self-hosted",
  "/docs/guides/smtp",
  "/docs/guides/suppression-lists",
  "/docs/guides/template-handoff",
  "/docs/guides/templates",
  "/docs/guides/vercel-setup",
  "/docs/guides/webhooks",
  "/docs/guides/workflows",
  "/docs/infrastructure",
  "/docs/infrastructure/cdn",
  "/docs/infrastructure/email",
  "/docs/infrastructure/events",
  "/docs/infrastructure/sms",
  "/docs/mcp-reference",
  "/docs/pulumi-reference",
  "/docs/python-sdk-reference",
  "/docs/quickstart",
  "/docs/quickstart/cdn",
  "/docs/quickstart/email",
  "/docs/quickstart/email/agents",
  "/docs/quickstart/email/cloudflare",
  "/docs/quickstart/email/express",
  "/docs/quickstart/email/inbound",
  "/docs/quickstart/email/nextjs",
  "/docs/quickstart/email/remix",
  "/docs/quickstart/email/templates",
  "/docs/quickstart/email/workflows",
  "/docs/quickstart/platform",
  "/docs/quickstart/sms",
  "/docs/reference",
  "/docs/reference/api",
  "/docs/reference/environment-variables",
  "/docs/reference/errors",
  "/docs/reference/json-output",
  "/docs/reference/rate-limits",
  "/docs/reference/versioning",
  "/docs/sdk-reference",
  "/docs/sms-sdk-reference",
  "/docs/telemetry",
];
