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
    primaryQuery: "aws ses pricing cost calculator",
    secondaryQueries: [
      "ses true cost lambda dynamodb",
      "ses cost beyond per email price",
    ],
    audience: "stranger-with-problem",
    rationale:
      "Its own description makes a specific, checkable claim of differentiation — it includes infrastructure costs (Lambda, DynamoDB, SQS, EventBridge) that other SES calculators omit, plus both the $0.10 and $0.16 per-1K rates AWS now runs in parallel.",
  },
  {
    route: "/tools/spf-builder",
    primaryQuery: "spf record builder tool online",
    secondaryQueries: ["generate spf record", "validate spf record tool"],
    audience: "stranger-with-problem",
    rationale:
      'An interactive builder is a different intent than the spf-guide blog post\'s explainer of the 10-lookup limit — one is "help me build this," the other is "help me understand this," and both currently rank for overlapping but distinct queries.',
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
      "Subusers are the most-asked question about this migration on AWS re:Post and have no SES answer; the current SERP is affiliate round-ups and AWS's own generic 'migrating from another solution' doc, neither of which names the four features that have no equivalent.",
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
    primaryQuery: "why choose wraps over email saas",
    secondaryQueries: [
      "own your email infrastructure vs saas",
      "aws pricing modern developer experience email",
    ],
    audience: "evaluating-wraps",
    rationale:
      'This is the page named in its own title as the direct answer to a buyer\'s "why this vendor" question, pairing AWS-direct pricing with modern DX — the two axes every /compare/*-vs-wraps page also argues on individually.',
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
