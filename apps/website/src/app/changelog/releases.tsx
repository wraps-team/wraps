import {
  Blocks,
  Bot,
  Building2,
  Cloud,
  Compass,
  Gauge,
  Gift,
  HardDrive,
  Inbox,
  Layers,
  LayoutDashboard,
  LayoutTemplate,
  Lock,
  type LucideIcon,
  MessageSquare,
  Package,
  Rocket,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Tags,
  Terminal,
  Users,
  Workflow,
  Wrench,
  Zap,
} from "lucide-react";
import type { ReactNode } from "react";

/** The surfaces a change can land on. One entry may touch several. */
export type ReleaseTag =
  | "cli"
  | "dashboard"
  | "api"
  | "sdk"
  | "iac"
  | "self-hosted"
  | "agents";

/** Display labels for the tags, used by the index and the entry pages. */
export const TAG_LABELS: Record<ReleaseTag, string> = {
  cli: "CLI",
  dashboard: "Dashboard",
  api: "API",
  sdk: "SDK",
  iac: "CDK & Pulumi",
  "self-hosted": "Self-hosted",
  agents: "Agents",
};

/**
 * The figure at the top of an entry, when the release has something worth
 * showing. Rendered in `wraps-private` and installed under `public/email/` by
 * its `scripts/sync-email.zsh`, so the same file backs the changelog entry and
 * the month's update email — one asset, one crop decision, two places.
 */
export type ReleaseMedia = {
  /** Path under public/, e.g. `/email/2026-09-tracking-domains.png`. */
  src: string;
  /** Describes what the figure shows. Not the release title again. */
  alt: string;
  /** Intrinsic size of the file — 2x the display size it was authored for. */
  width: number;
  height: number;
};

export type Release = {
  /**
   * Stable URL segment. Never change one after it ships — plan 339 turns these
   * into permalinks, and docs and support replies will cite them.
   */
  slug: string;
  /** The capability, sentence case, no version. This is the headline. */
  title: string;
  /**
   * ISO `YYYY-MM-DD`. Sorts the index and, from plan 339, becomes the entry
   * page's sitemap `lastmod`. Entries migrated from the old `"Month YYYY"`
   * strings carry the 1st of their month; new entries carry the real date.
   */
  date: string;
  /** Which surfaces this touched. At least one. */
  tags: ReleaseTag[];
  /**
   * One sentence: what a reader can now do. Optional only because the 63
   * migrated entries predate the field — see the ratchet in
   * `src/__tests__/changelog-entries.test.ts`. Required for new entries.
   */
  summary?: string;
  icon: LucideIcon;
  /** Package versions carrying the change. A footnote, not the headline. */
  versions?: string[];
  items: ReactNode[];
  media?: ReleaseMedia;
  /** Doc page for the capability, e.g. `/docs/tracking-domains`. */
  docs?: string;
  /**
   * Minor fixes that belong in the record but do not each earn an entry.
   * Rendered collapsed under the entry. Plain strings — no JSX, because the
   * feed in plan 340 needs them as text.
   */
  alsoFixed?: string[];
};

export const Code = ({ children }: { children: ReactNode }) => (
  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground text-xs">
    {children}
  </code>
);

export const releases: Release[] = [
  {
    slug: "teardown-that-leaves-your-dns-alone",
    versions: ["CLI v3.11.1"],
    date: "2026-09-01",
    icon: Wrench,
    title: "Teardown That Leaves Your DNS Alone",
    tags: ["cli"],
    summary:
      "wraps email destroy now touches only the DNS records Wraps created, across Route53, Cloudflare and Vercel.",
    items: [
      <>
        <Code>wraps email destroy</Code> deletes only the records Wraps created.
        Every deletion matches name, type and exact value, and a Route53 record
        set holding values Wraps did not write is rewritten without Wraps&rsquo;
        value rather than deleted whole &mdash; deletion previously matched name
        and type alone, so accepting the DNS cleanup prompt on a domain that
        already had a <Code>_dmarc</Code> policy removed that policy along with
        the records Wraps wrote. Cloudflare and Vercel domains are cleaned up
        too, not just Route53, and the record lookup is paginated so zones
        larger than 500 record sets no longer skip records silently. If you ran{" "}
        <Code>destroy</Code> before this and the domain had a{" "}
        <Code>_dmarc</Code> policy predating Wraps, confirm it is still
        published
      </>,
      <>
        <Code>wraps email reply destroy</Code> deletes the MX and SPF records it
        created at <Code>r.mail.&lt;domain&gt;</Code> instead of printing a
        reminder to remove them by hand &mdash; left in place, the MX still
        pointed at SES with nothing configured to receive, so signed reply
        addresses bounced. <Code>wraps email inbound destroy</Code> now warns
        when reply threading is configured, and still never deletes those
        records itself: they follow the sending domain, not the inbound
        receiving domain
      </>,
      <>
        Fix: a DNS write that correctly did nothing is no longer reported as a
        failure. Re-running <Code>wraps email inbound init</Code>,{" "}
        <Code>inbound add</Code> or <Code>reply init</Code> against records that
        were already correct used to print the full manual SPF block, and
        following it against an existing SPF record produced a second{" "}
        <Code>v=spf1</Code> record &mdash; the RFC 7208 PermError the preflight
        exists to prevent
      </>,
      <>
        Fix: <Code>wraps email check</Code> recommends <Code>~all</Code> and no
        longer grades a domain down for it. A <Code>-all</Code> deduction now
        applies only where the domain authorizes senders and DMARC is absent,
        invalid, <Code>p=none</Code> or <Code>t=y</Code> &mdash; RFC 9989
        section 7.1 cautions against <Code>-all</Code> because it rejects mail
        pre-DATA, before DMARC can pass it on an aligned DKIM signature &mdash;
        and a parked <Code>v=spf1 -all</Code> is never flagged
      </>,
    ],
    alsoFixed: [
      "The apex SPF record is still left for you to edit by hand — stripping include:amazonses.com from a record that may carry other providers' includes is a rewrite rather than a deletion, and destroy does not attempt it.",
      "wraps support printed a GitHub issues link under the wraps-dev organization, which 404s; it now points at wraps-team, where the repository lives (CLI v3.11.2).",
    ],
  },
  {
    slug: "sending-domains-suppressions-and-stale-roles",
    versions: ["Platform v0.28.0"],
    date: "2026-09-01",
    icon: LayoutDashboard,
    title: "Sending Domains, Suppressions & Stale Roles",
    tags: ["dashboard"],
    summary:
      "Sending domains, suppressions and role health move from CLI-only into the dashboard.",
    media: {
      src: "/email/2026-09-dashboard-domains-clip.gif",
      alt: "Adding notify.acme.dev on the Sending Domains page: it lands as pending verification, and its detail sheet lists the three DKIM CNAME records to publish",
      width: 552,
      height: 310,
    },
    items: [
      <>
        A sending-domains page lists every SES identity with its verification
        state and the DKIM CNAMEs and MAIL FROM records still to publish, adds a
        domain with SES-managed Easy DKIM, and opens a per-identity sheet for
        the configuration set that governs it: tracking domain, TLS policy,
        suppression reasons and event destinations &mdash; the sheet flags an{" "}
        <Code>OPTIONAL</Code> tracking <Code>HttpsPolicy</Code> and an empty
        event-destination list, the usual reasons click links break and delivery
        events never arrive. Onboarding had told customers they could manage
        domains in the dashboard while the only working paths were installing
        the CLI or rebuilding the CloudFormation stack
      </>,
      <>
        The SES suppression list is browsable from the dashboard, and an address
        can be removed. A <Code>COMPLAINT</Code>-reason removal re-reads the
        reason from SES rather than trusting the browser, and refuses without an
        explicit acknowledgement. The underlying{" "}
        <Code>email.suppression.*</Code> grants now ship on every deployment
        path &mdash; CDK, Pulumi and CloudFormation &mdash; but an existing
        deployment needs <Code>wraps platform update-role</Code> (CLI v3.9.0+),
        a CDK 0.3.0+/Pulumi 0.4.0+ redeploy, or a CloudFormation stack update
        before those calls stop returning AccessDenied
      </>,
      <>
        The account page flags when the console role&rsquo;s policy is behind
        the version Wraps expects and links to the IAM-console repair route, and
        reports AWS&rsquo;s actual SES production-access verdict instead of
        discarding it. <Code>wraps email status --json</Code> reports sandbox
        state and quota and recognizes a CloudFormation deployment instead of
        exiting 1 with &ldquo;No email infrastructure found&rdquo;
      </>,
      <>
        Fix: a broadcast into an SES account AWS has paused is now blocked at
        the review step instead of running past the point-of-no-return dialog
        and failing every recipient &mdash; a <Code>PROBATION</Code> account
        only warns rather than blocking, and a check that cannot read account
        state never refuses a legitimate send. Fix: the sending-domains list
        pages through every SES identity instead of showing only the first 100
      </>,
    ],
    alsoFixed: [
      'The setup dashboard\'s "Send a test email" step now links to the sending-domains page instead of sending a test email itself.',
    ],
  },
  {
    slug: "the-api-catches-up-with-the-dashboard",
    versions: ["API v1.2"],
    date: "2026-09-01",
    icon: Blocks,
    title: "The API Catches Up With the Dashboard",
    tags: ["api"],
    summary:
      "API keys can now manage templates, segments and broadcast batches, and read the account-health data the dashboard shows.",
    media: {
      src: "/email/2026-09-api-v1-2.png",
      alt: "A Wraps card reading: API v1.2 — Templates and segments by API key. Domain verification, email metrics and SES account health ship alongside them.",
      width: 1104,
      height: 480,
    },
    items: [
      <>
        The template editor is reachable by API key. <Code>/v1/templates</Code>{" "}
        adds a cursor-paginated list, full detail, create, partial update,{" "}
        <Code>/:id/publish</Code> and <Code>/:id/duplicate</Code> &mdash;
        publish running the same sequence the dashboard uses. A{" "}
        <Code>limit</Code> bound on <Code>GET /v1/templates/pull</Code> is
        opt-in &mdash; it used to return every code-pushed template with full
        TSX source and no pagination, its only ceiling Lambda&rsquo;s response
        limit &mdash; so the CLI&rsquo;s push/pull protocol is byte-for-byte
        unchanged when the bound is omitted. The API does not compile TSX, so{" "}
        <Code>compiledHtml</Code> must come from the caller. There is no DELETE:
        templates are referenced by send history, and removing one would
        silently detach it
      </>,
      <>
        <Code>/v1/segments</Code> adds list, read, create, update, delete and{" "}
        <Code>/preview</Code> for an unsaved condition. The whole group sits
        behind a Pro plan gate on every verb including reads;{" "}
        <Code>memberCount</Code> is always computed live rather than read from
        the cached column, and a delete refuses with 409 while a scheduled or
        processing broadcast still targets the segment
      </>,
      <>
        <Code>/v1/batch</Code> adds a list, per-recipient outcomes and a click
        breakdown, so a caller can see who a broadcast reached instead of only
        creating, promoting, getting, cancelling and resuming it
      </>,
      <>
        <Code>GET /v1/domains</Code>, <Code>GET /v1/email/metrics</Code> and{" "}
        <Code>GET /v1/account/health</Code> round out what a caller can read
        about its own connected account: domain verification and DKIM status (an
        unreachable connected account is marked rather than failing the whole
        request), aggregate email numbers by dimension and granularity with no
        plan gate, and the SES verdict &mdash; sandbox status, production
        access, enforcement pauses, 24-hour quota &mdash; a hosted provider has
        no equivalent for, since there is no per-customer SES account to
        describe. Health thresholds come from the classifier&rsquo;s exported
        constants, so a caller computes its own headroom without hardcoding
        AWS&rsquo;s numbers; <Code>unknown</Code> never collapses to healthy,
        and the read costs zero AWS calls
      </>,
    ],
  },
  {
    slug: "audit-export-sms-consent-and-account-health",
    versions: ["Platform v0.27.0"],
    date: "2026-09-01",
    icon: ShieldCheck,
    title: "Audit Export, SMS Consent & Account Health",
    tags: ["dashboard"],
    summary:
      "Account health, audit export and SMS consent are now visible and self-service in the dashboard, without waiting on an alert to fire.",
    items: [
      <>
        Audit logs export to CSV on Business. The plan was sold on audit export
        with no export path behind it. The export is scoped to the
        caller&rsquo;s organization, bounded by the plan&rsquo;s retention
        window, and self-auditing: exporting the audit trail leaves a row in the
        audit trail
      </>,
      <>
        The preference center lets a contact grant and withdraw SMS consent. It
        already offered SMS as a preferred channel whenever a contact had a
        phone, but nothing let the contact actually consent, so every write to
        that status was an operator assertion. Both transitions record the exact
        consent sentence shown, the IP and the user agent. Granting requires the
        organization to still be able to send; withdrawal never does
      </>,
      <>
        A header pill reports SES account health whenever it is not healthy,
        from a Postgres-only read. The hourly sweep compared{" "}
        <Code>GetAccount</Code> and CloudWatch reputation against AWS&rsquo;s
        enforcement lines and threw every number away, so &ldquo;is my account
        okay right now?&rdquo; had no answer anywhere unless an alert happened
        to fire in the last 24 hours
      </>,
      <>
        Fix: the stale-feed alert stops firing on foreign SES traffic. The
        fallback probe reads the account-wide SES send count, which includes
        mail from applications that have nothing to do with Wraps. One customer
        sharing SES with their own app was flagged with zero Wraps sends against
        15,804 account-wide; the probe now measures that count against a
        seven-day baseline of recorded sends and stays quiet when the surplus is
        someone else&rsquo;s mail
      </>,
    ],
    alsoFixed: [
      "An unauthenticated waitlist endpoint on the dashboard and wraps.dev could subscribe the wrong contact to a topic by resolving an existing address with a substring match; both routes had no caller and are removed.",
      "A documentation code block that omitted its default tab rendered as an empty box, across 95 call sites in 16 files including the base URL on the API reference; the default now falls back to the first item's language.",
    ],
  },
  {
    slug: "custom-tracking-domains-and-proven-orphan-cleanup",
    versions: ["CLI v3.6.0", "CLI v3.7.0"],
    date: "2026-09-01",
    icon: Lock,
    title: "Custom Tracking Domains & Proven-Orphan Cleanup",
    tags: ["cli"],
    summary:
      "Custom tracking domains resolve over HTTPS by default, and doctor --cleanup no longer guesses at orphaned resources.",
    docs: "/docs/guides/domain-verification",
    media: {
      src: "/email/2026-09-tracking-domains.png",
      alt: "A Wraps card reading: CLI v3.6.0 — Custom tracking domains. Open and click links resolve through a host you own.",
      width: 1104,
      height: 480,
    },
    items: [
      <>
        <Code>wraps email domains add</Code> and{" "}
        <Code>wraps email domains config</Code> accept{" "}
        <Code>--tracking-domain</Code>, so open and click links resolve through
        a host under your own domain instead of{" "}
        <Code>r.&lt;region&gt;.awstrack.me</Code>. <Code>--tracking-https</Code>{" "}
        requests an ACM certificate and puts a CloudFront distribution in front
        of that host &mdash; two runs, since ACM validation takes 5 to 30
        minutes: the first prints the validation record, the second finishes
        once the certificate is ISSUED
      </>,
      <>
        <Code>wraps email domains list</Code> and the dashboard report whether
        tracking links are HTTPS, per configuration set &mdash; a multi-domain
        account no longer reports one set&rsquo;s state as the whole
        account&rsquo;s. The failure hides well, since opens keep working over
        plain HTTP and only clicks break. Every tracking-domain write now
        carries an explicit <Code>HttpsPolicy</Code> instead of leaving it{" "}
        <Code>OPTIONAL</Code>, which wrapped click links in the original
        link&rsquo;s protocol and produced a certificate warning instead of the
        destination &mdash; three paths could reach that <Code>OPTIONAL</Code>{" "}
        default, including <Code>domains verify</Code> re-issuing a policy-less
        write that downgraded an already-
        <Code>REQUIRE</Code> configuration set
      </>,
      <>
        Fix: <Code>wraps email doctor --cleanup</Code> no longer treats an
        unreachable Pulumi stack probe or an unchecked CloudFormation stack as a
        proven orphan &mdash; a failed probe used to sweep in the console access
        role and the configuration sets <Code>domains add</Code> creates, and a
        CloudFormation quick-create deployment was mistaken for loose resources.
        A check that cannot confirm an orphan now refuses <Code>--cleanup</Code>{" "}
        instead of assuming, and names the owning stack when it finds one
      </>,
      <>
        Fix: disabling and re-enabling HTTPS no longer hands back a CloudFront
        distribution the CLI had already switched off, breaking every click link
        until it is restored. A failed HTTPS provision during{" "}
        <Code>domains add</Code> now warns and falls back to plain HTTP instead
        of aborting and orphaning the identity it already created
      </>,
    ],
    alsoFixed: [
      "The five tracking-domain error codes are documented at /docs/reference/errors; a subdomain that was never added separately inherits the primary domain's tracking host.",
      "If you saw \"Cannot find module '@wraps/core'\" in index.d.ts when installing @wraps.dev/cdk or @wraps.dev/pulumi, upgrade to CDK v0.3.1 or Pulumi v0.4.1 — the published type declarations no longer reference the unpublished @wraps/core package.",
      "domains config --tracking-domain now offers HTTPS at the point it sets the domain, instead of requiring a second trip through the menu.",
      "A zone-scoped Cloudflare token (Zone → DNS → Edit) now validates correctly for DNS automation; validation previously required the broader User → API Tokens → Read scope it didn't need.",
      "Two DNS paths that used to fail silently now report whether the record was written: the tracking CNAME print, and the ACM validation push that gates certificate issuance.",
      "ACM and CloudFront listings are paginated too, so a second page no longer causes a fresh certificate request on every run.",
      "wraps --help was hiding thirteen shipped subcommands across five groups, including email reply, email logs and workflow entirely; a parity test now checks the dispatcher against the help output.",
      "@wraps.dev/pulumi and @wraps.dev/cdk both accepted tracking.customRedirectDomain and failed differently — Pulumi deployed it with SES's OPTIONAL policy and no CloudFront, CDK ignored it entirely; both now warn at deploy time.",
    ],
  },
  {
    slug: "adopting-a-deployment-the-cli-did-not-create",
    versions: ["CLI v3.5.3"],
    date: "2026-08-01",
    icon: Terminal,
    title: "Adopting a Deployment the CLI Did Not Create",
    tags: ["cli"],
    items: [
      <>
        <Code>wraps platform connect</Code> and{" "}
        <Code>wraps platform update-role</Code> adopt an existing deployment. A
        CloudFormation quick-create customer has no local state file and no S3
        state bucket to sync from, so both commands dead-ended &mdash; including
        on the documented repair path for a broken IAM trust policy.
        Registration is idempotent on the External ID, so adoption registers the
        account and repairs the trust policy without deploying anything
      </>,
      <>
        <Code>wraps doctor</Code> reports <Code>wraps-*</Code> resources it
        finds in AWS with no local connection record, instead of announcing no
        email deployment. That is what a CloudFormation-first connection looks
        like, and what a second machine looks like
      </>,
      <>
        Fix: <Code>wraps update</Code> never resolved a release. It matched tags
        beginning <Code>cli@</Code>; every release is tagged <Code>cli-v</Code>.
        Standalone installs only ever saw &ldquo;Could not determine latest
        version from GitHub releases&rdquo;
      </>,
      <>
        Fix: one telemetry event per invocation. <Code>wraps permissions</Code>{" "}
        emitted three and <Code>wraps email domains add</Code> emitted two names
        a millisecond apart, which inflated the reported failure rate and split
        one command across two names
      </>,
      <>
        Fix: a failure thrown before the handler runs is named by its third
        positional, so a failing <Code>email domains verify</Code> is
        distinguishable from a failing <Code>email domains remove</Code> rather
        than collapsing into <Code>email:domains</Code>
      </>,
    ],
  },
  {
    slug: "free-pro-and-business",
    versions: ["Platform v0.26.0"],
    date: "2026-08-01",
    icon: Tags,
    title: "Free, Pro & Business",
    tags: ["dashboard"],
    items: [
      <>
        The starter, growth and scale ladder is replaced by three purchasable
        plans: Free at $0, Pro at $29 a month, Business at $199 a month. Each is
        a flat fee with no Wraps-side overage. Live subscriptions on the old
        names keep their limits, mapped to the successor plan and never
        displayed again
      </>,
      <>
        Free includes 5,000 custom events a month, warns as the allowance runs
        down, and blocks at 110% of it. Sends are unmetered on every plan: SES
        bills you directly, so metering them would tax the pass-through the
        product is built on
      </>,
      <>
        The daily request meter is retired on every plan and removed from the
        rate-limit reference. The per-minute limiter stays, because that one
        protects the API from bursts rather than metering the customer
      </>,
      <>
        Dashboard history is enforced where it is sold: 30 days on Free, 90 on
        Pro, 365 on Business. The emails list clamps to the plan window on the
        fresh request and on the cursor, which carries its own bounds and could
        otherwise widen page 2 after page 1 was cut back
      </>,
      <>
        Both surfaces now name the window instead of stopping silently, and the
        upgrade path is resolved server-side: Pro gets a self-serve link,
        Business is pointed at Enterprise
      </>,
      <>
        Audit logs move to Business, including the required-plan copy on the
        gated page and the feature list on the Business card. SES event
        ingestion now requires a live subscription, keyed on subscription status
        rather than plan name so free-tier organizations are unaffected, and it
        fails open &mdash; a database blip must not drop a paying
        customer&rsquo;s events
      </>,
      <>
        Fix: the dashboard&rsquo;s IAM role repair is reachable and works.
        Assume-role failures are classified by error code rather than by
        matching message text, and the SMS phone-number query can tell the
        client the role needs repairing
      </>,
      <>
        Fix: workflow sends skip contacts SES has already suppressed. The gate
        asked whether a contact was unsubscribed, bounced or complained and had
        no opinion about <Code>suppressed</Code>, so those addresses reached
        SES, were rejected, and returned as bounces charged to the
        workflow&rsquo;s own stats
      </>,
    ],
  },
  {
    slug: "ask-mode-and-guided-setup",
    versions: ["Platform v0.25.0"],
    date: "2026-08-01",
    icon: Bot,
    title: "Ask Mode & Guided Setup",
    tags: ["dashboard"],
    items: [
      <>
        <Code>&#8984;K</Code> now answers questions. Type two or more characters
        and pick &ldquo;Ask Wraps&rdquo; to get a setup-status card, an
        email-metrics card, or a recent-sends list &mdash; streamed, and
        validated against the tool&rsquo;s output schema before anything renders
      </>,
      <>
        The assistant reads through a read-only tool layer. Every tool closes
        over the <Code>organizationId</Code> of the authenticated request (never
        a model input), projects an explicit field allowlist &mdash; no secrets,
        no PII, no raw metadata &mdash; and is filtered by the caller&rsquo;s
        role before the model is offered it
      </>,
      <>
        Setup gained a next-best-action card that names the single blocking
        step. The choice is deterministic, not generated: a first send comes
        before requesting SES production access, because a sandboxed account can
        already send to verified recipients and the mailbox simulator
      </>,
      <>
        Copy on the top insight and the next step is now phrased from facts the
        dashboard already established. Detection thresholds are unchanged and a
        model decides nothing; only numbers and closed enums cross into the
        prompt, the result is schema-validated, and static copy stands in on any
        failure
      </>,
      <>
        The events feed refreshes itself on the unfiltered first page, and
        pauses when the tab is hidden or you switch it off. Waiting on an event
        you just fired no longer looks the same as a broken integration
      </>,
      "Fix: navigating between dashboard routes keeps the shell mounted instead of tearing it down and rebuilding it",
      "Fix: the events live-refresh toggle no longer crashes during server render",
    ],
  },
  {
    slug: "machine-readable-errors-and-data-retention",
    versions: ["API v1.1"],
    date: "2026-08-01",
    icon: Blocks,
    title: "Machine-Readable Errors & Data Retention",
    tags: ["api"],
    items: [
      <>
        Every 4xx and 5xx body now carries a stable, enumerated{" "}
        <Code>code</Code> and a <Code>requestId</Code> alongside{" "}
        <Code>error</Code>. It comes from one response plugin, so all ~40 routes
        that return their own error object are covered rather than nearly all of
        them
      </>,
      <>
        The OpenAPI spec declares that shape as <Code>ApiError</Code> and
        attaches it to every operation. The <Code>code</Code> enum is derived
        from the handler&rsquo;s own table, so the spec cannot drift from what
        the API emits
      </>,
      <>
        Rate-limited responses gain <Code>RateLimit-Limit</Code>,{" "}
        <Code>RateLimit-Remaining</Code>, <Code>RateLimit-Reset</Code> and{" "}
        <Code>RateLimit-Policy</Code> next to the <Code>X-</Code> originals,
        which are kept. <Code>Reset</Code> is seconds remaining, and the quota
        headers describe whichever window is closest to exhaustion &mdash; the
        one actually pacing you
      </>,
      <>
        New <Code>/docs/reference/versioning</Code> states what counts as a
        breaking change and how a deprecation is announced
      </>,
      <>
        A nightly retention worker ages out <Code>message_send</Code> and{" "}
        <Code>contact_event</Code> rows against your plan&rsquo;s visible
        window, with a 30-day grace period and a one-time owner and admin
        notification before anything is removed. It ships in dry-run: it reports
        what it would delete and deletes nothing
      </>,
      <>
        The unreachable per-org event volume block is retired, and the
        tracked-events definition is corrected everywhere agents read it: the
        docs, <Code>llms.txt</Code> and the generated <Code>pricing.md</Code>
      </>,
      <>
        wraps.dev serves a markdown representation of every page the three ways
        an agent actually asks for one, and sitemap entries carry a real{" "}
        <Code>lastmod</Code> instead of the current timestamp on every request
      </>,
    ],
  },
  {
    slug: "three-deploy-paths-and-feed-health",
    versions: ["Platform v0.24.0"],
    date: "2026-08-01",
    icon: Compass,
    title: "Three Deploy Paths & Feed Health",
    tags: ["dashboard"],
    items: [
      <>
        Onboarding offers the CLI, a coding agent, and the AWS console as peer
        cards. The step used to lead with CloudFormation and bury the other two
        in collapsibles, so a shift toward the CLI would have read as a funnel
        drop rather than a preference
      </>,
      <>
        Self-hosted orgs no longer see the platform CloudFormation path at all:
        the quick-create URL is not built, the card is not rendered, and the CLI
        steps and agent prompt name <Code>wraps selfhost login</Code> and{" "}
        <Code>wraps selfhost connect</Code>
      </>,
      <>
        Launching a stack closes the other two paths, so nobody runs{" "}
        <Code>wraps email init</Code> over resources CloudFormation is still
        creating. The connection gate has a visible terminal state and no longer
        unmounts an in-flight Deploy &amp; Connect
      </>,
      "Retired four onboarding steps that nothing could reach: deploy-infrastructure, deploy, cli-install, and the orphaned AWS connect path",
      <>
        Event-feed stall alerts judge staleness per message rather than against
        a cursor the webhook throttles to one write a minute. That cursor
        flagged every later message in a burst as unacknowledged: 13 of the 14
        alerts this feature had ever sent were false, all against feeds that
        never missed an event
      </>,
      <>
        SDK senders get a stall alert at all. Sends through{" "}
        <Code>@wraps.dev/email</Code> go straight from your infrastructure to
        your SES and never touch the Wraps API, so a broken feed produced no
        rows and looked healthy. The hourly console-access role now reads the{" "}
        <Code>AWS/SES</Code> Send metric as an independent fallback, and a null
        probe means no evidence &mdash; never zero sends
      </>,
      "Fix: the org webhook secret is no longer exposed through the Open AWS Console link",
      <>
        Fix: AWS connection routes require <Code>awsAccounts:write</Code>, not{" "}
        <Code>awsAccounts:read</Code>
      </>,
    ],
  },
  {
    slug: "one-doctor-command-and-structured-remediations",
    versions: ["CLI v3.4.0"],
    date: "2026-08-01",
    icon: Wrench,
    title: "One Doctor Command & Structured Remediations",
    tags: ["cli"],
    items: [
      <>
        New <Code>wraps doctor</Code> merges the AWS and email doctors into one
        report and one exit code, with <Code>--json</Code> carrying remediations
        for MCP and agent callers. <Code>wraps email doctor</Code> is unchanged
      </>,
      <>
        Every finding now carries a structured remediation from one registry
        &mdash; the command that repairs it, rather than a hand-written sentence
        beside it. A single missing SES configuration set previously took a user
        five commands and a CLI reinstall, three of them because the CLI
        misdirected them. Checks with no automatic repair say so instead of
        guessing
      </>,
      <>
        Remediation commands carry the region the doctor actually scanned, so a
        pasted fix cannot fall back to <Code>us-east-1</Code> and report that
        the connection does not exist. <Code>wraps aws doctor -r/--region</Code>{" "}
        answers for a named region on both the human and <Code>--json</Code>{" "}
        paths
      </>,
      <>
        An unrecognized command is reported as bad input with the nearest routed
        command suggested, not as a crash
      </>,
      <>
        Fix: error telemetry is flushed before the process exits &mdash; it was
        being dropped. Event names no longer carry whatever you typed, error
        telemetry no longer ships raw error messages, and{" "}
        <Code>wraps push</Code> no longer puts the template slug in the payload
      </>,
      <>
        Fix: <Code>wraps platform connect</Code> and{" "}
        <Code>wraps email upgrade</Code> no longer print raw API error text
      </>,
      "Fix: a failed Pulumi deploy exits non-zero instead of reporting success",
      "Fix: the standalone binary ships on the Node version it claims to require",
    ],
  },
  {
    slug: "audience-counts-that-match-what-sends",
    versions: ["Platform v0.23.0"],
    date: "2026-08-01",
    icon: Tags,
    title: "Audience Counts That Match What Sends",
    tags: ["dashboard"],
    items: [
      <>
        Segment and topic counts are computed by the send path&rsquo;s own
        counting instead of a <Code>memberCount</Code> column written at create
        and never recomputed. The only segment in production was rendering a
        six-month-old number, and the details sheet showed a different figure
        for that same segment on the same page
      </>,
      <>
        Those counts respect channel eligibility and join contact, so bounced,
        complained, and globally unsubscribed people stop counting as
        subscribers &mdash; one topic read 5 subscribers and would have sent to
        2. Double opt-in pending subscribers get their own count, so turning on
        a compliance feature no longer shrinks your audience with no number
        explaining where the people went
      </>,
      <>
        The segment Status filter resolves to <Code>email_status</Code>, the
        column every send path already reads, instead of the deprecated{" "}
        <Code>contact.status</Code> that defaults to active. Status equals
        Active matched every contact in the org, and Unsubscribed, Bounced, and
        Complained could never match at all
      </>,
      <>
        The list operators on that field emit arrays. Two of the four failed
        every time behind a generic &ldquo;Failed to preview segment&rdquo; with
        the previous count left on screen; a failed preview now says why. Event
        filters were fully implemented and unreachable from any UI
      </>,
      <>
        Fix: CSV import merges custom properties instead of overwriting them.
        Every update-strategy import silently deleted whatever properties the
        file did not mention, including the ones segments filter on, with no
        undo
      </>,
      <>
        Fix: the contact timeline distinguishes events aged out past retention
        from nothing ever having happened, stops swallowing load-more failures,
        and no longer caps out around 120 events regardless of real volume
      </>,
      "Fix: a failed audience fetch renders an error with a retry instead of an empty list that reads as an empty org",
      "Fix: contacts health buckets are a filter you can see and undo, and CSV export ships the search the list actually applied",
    ],
  },
  {
    slug: "test-sends-recipient-results-and-resume",
    versions: ["Platform v0.22.0"],
    date: "2026-08-01",
    icon: Send,
    title: "Test Sends, Recipient Results & Resume",
    tags: ["dashboard"],
    media: {
      src: "/email/2026-08-broadcast-send.gif",
      alt: "A broadcast finishing, with the delivery funnel filling in from sent through delivered, opened, and clicked",
      width: 535,
      height: 404,
    },
    items: [
      <>
        Send a test before committing to the whole list: one rendered copy to
        one address, using a real contact from the selected audience and the
        same variable mappings the batch sender resolves, so what arrives is
        what the broadcast would send. It records nothing &mdash; no batch row,
        no message row, no counters
      </>,
      <>
        A broadcast that reports 50 failed now shows which 50 and why. Address,
        status, error, and SES bounce type per recipient, defaulting to the
        failures, paginated, and exportable to CSV with an explicit notice when
        the export is capped
      </>,
      <>
        Broadcast history paginates against the real total. Rows 21 and beyond
        were unreachable, the footer showed the loaded-row count instead of your
        broadcast count, and CSV export serialised whatever happened to be
        loaded and reported it as the total. Server-side search over name and
        subject, plus a status filter, both live in the URL
      </>,
      <>
        A stuck or failed send can be resumed from the detail page, gated the
        same way the API gates itself. The resume endpoint existed and nothing
        in the dashboard called it, so recovery meant curl and a runbook
      </>,
      <>
        Rates name their denominator and use a consistent one &mdash;
        unsubscribes were rated against sent while opens and clicks used
        delivered. 0% opened now distinguishes nobody opening from no SES event
        ever arriving
      </>,
      "Fix: any fetch failure on the detail page rendered a 404, telling an operator watching a live send that their broadcast did not exist",
      "Fix: auto-refresh latched at mount, so a scheduled broadcast that began sending never started polling",
      "Fix: the clicked-URL breakdown had no limit, so per-recipient unsubscribe links returned one row per recipient",
    ],
  },
  {
    slug: "message-level-search-and-full-send-history",
    versions: ["Platform v0.21.0"],
    date: "2026-08-01",
    icon: Inbox,
    title: "Message-Level Search & Full Send History",
    tags: ["dashboard"],
    items: [
      <>
        The emails page now pages through your entire send history with cursor
        pagination - the previous build capped the list at the 100 most recent
        rows. Search runs server-side across recipient, subject, and sender, and
        uses the same query as browsing, so a message visible in the list can no
        longer vanish the moment you search for it
      </>,
      <>
        Dashboard numbers now come from Wraps&rsquo; own record of what it sent
        rather than from account-wide SES metrics. Two things change as a
        result, and both are the count becoming correct rather than data loss.
        Totals no longer include mail your AWS account sent outside Wraps. And
        open and click counts are now unique per message - a recipient who opens
        the same email three times counts once, where SES counted three times -
        so those two numbers in particular will read lower than they did before.
        Account-level SES reputation is still shown, now labelled as
        account-wide
      </>,
      <>
        Every state says what it is: a failed load says so and offers retry
        instead of rendering "No emails found", sandboxed AWS accounts are told
        they are in the SES sandbox instead of being asked to send their first
        email, and orgs whose event pipeline has never delivered an event see a
        banner explaining why everything reads as Sent
      </>,
      <>
        The message detail page distinguishes an unreadable event timeline from
        an empty one, names the AWS account involved, and points at{" "}
        <Code>wraps email doctor</Code> - it previously bounced you back to the
        list on any failure
      </>,
      <>
        Filters, search, sort, and time range live in the URL, so a filtered
        view survives reload and can be handed to a colleague mid-incident. Rows
        are real links: keyboard, middle-click, and screen readers all reach
        message detail now
      </>,
      <>
        CSV export pages through up to 10,000 matching rows and states the cap
        before writing the file - it previously exported whatever was on screen
        and reported it as the total
      </>,
      <>
        Fix: the analytics refresh button now expires the server-side cache
        instead of refetching the same cached payload for up to five minutes
      </>,
    ],
  },
  {
    slug: "non-interactive-sms-setup-and-corrected-error-codes",
    versions: ["CLI v3.2"],
    date: "2026-08-01",
    icon: Terminal,
    title: "Non-Interactive SMS Setup & Corrected Error Codes",
    tags: ["cli"],
    items: [
      <>
        <Code>wraps sms init --countries</Code> makes SMS setup fully
        automatable without a TTY
      </>,
      <>
        Non-interactive and <Code>--json</Code> runs fail fast naming the flag
        they need instead of hanging on a prompt, and an already-deployed{" "}
        <Code>init</Code> exits with a proper JSON envelope
      </>,
      <>
        Fix: the documented CLI error codes were rewritten from CLI source
        &mdash; all 22 of them were fictional &mdash; and the reference&rsquo;s
        camelCase flags, which the CLI silently ignored, are corrected
      </>,
      <>
        Fix: SSO login links to unverified local users, and callback errors are
        mapped instead of surfacing raw
      </>,
      "Fix: 52 dependency advisories cleared by raising stale CVE-floor overrides that were holding packages below their patched versions",
    ],
  },
  {
    slug: "bimi-checks-and-configurable-event-types",
    versions: ["CLI v3.1.0"],
    date: "2026-08-01",
    icon: ShieldCheck,
    title: "BIMI Checks & Configurable Event Types",
    tags: ["cli"],
    items: [
      <>
        <Code>wraps email check</Code> now reports BIMI: record status, logo and
        VMC validation, a generated <Code>default._bimi.&lt;domain&gt;</Code>{" "}
        TXT template, and which inboxes require a VMC or CMC versus which show a
        self-asserted logo. When DMARC is not yet at enforcement it says so
        instead of printing setup steps that cannot work yet
      </>,
      <>
        Fix: <Code>eventTracking.events</Code> was declared, threaded through
        the stack, and never read. Every deployment sent the same hardcoded ten
        event types to SES, so dropping <Code>OPEN</Code> and <Code>CLICK</Code>{" "}
        to stop engagement tracking reported success and did nothing. The
        configured list is now what SES gets
      </>,
      <>
        <Code>BOUNCE</Code> and <Code>COMPLAINT</Code> can no longer be dropped
        from an event destination. A suppression-list event arrives as a bounce,
        so losing either leaves your pipeline blind to both
      </>,
      <>
        The custom config prompt gained a real event-type multiselect, and the
        Production preset no longer carries its own stale eight-type list
      </>,
      <>
        Fix: the deployed IAM policy grants{" "}
        <Code>ses:ListConfigurationSets</Code>, so configuration-set discovery
        works
      </>,
      <>
        BIMI asset fetching is opt-in, keeping the public tools API off
        attacker-supplied URLs
      </>,
    ],
  },
  {
    slug: "email-stack-parity-guard",
    versions: ["Pulumi v0.3.0"],
    date: "2026-08-01",
    icon: Blocks,
    title: "Email Stack Parity Guard",
    tags: ["iac"],
    items: [
      <>
        The CLI and <Code>@wraps.dev/pulumi</Code> ship two implementations of
        the same email stack. A parity test now compares them resource by
        resource, so a fix landing in one and not the other fails CI instead of
        drifting quietly
      </>,
      "Resource names come from shared constants rather than duplicated string literals in each implementation",
      <>
        Docs spell out what the library does not provide versus the CLI, and
        record that Mail Manager ships as a dynamic provider
      </>,
    ],
  },
  {
    slug: "preference-center-theming-and-multi-day-broadcasts",
    versions: ["Platform v0.20.0"],
    date: "2026-08-01",
    icon: Sparkles,
    title: "Preference Center Theming & Multi-Day Broadcasts",
    tags: ["dashboard"],
    media: {
      src: "/email/2026-08-schedule.png",
      alt: "The When to Send step of a broadcast, offering send immediately or schedule for later with a date and time",
      width: 1104,
      height: 620,
    },
    items: [
      "Theme your preference center: an accent-derived color ramp, live inline preview, CSS import, and contrast checking so a brand color cannot quietly ship unreadable text. Subscribers can switch light, dark, or system themselves",
      "Organization logo uploads are backed by S3, with a dedicated preference-center logo that falls back to the org logo",
      "Broadcasts larger than a single day's SES quota now send across multiple days instead of being blocked. The confirm dialog shows the estimated number of days and folds in other in-flight broadcasts competing for the same quota",
      "New per-AWS-account daily quota reserve keeps headroom for transactional sends. Broadcast chunks pause against the reserve and resume as the rolling 24-hour window frees up",
      <>
        Fix: broadcasts stalled silently at exactly 800 recipients.
        Lambda&rsquo;s recursive-loop detection was terminating the chunk chain
        at its 16-hop default, with no error, no throttle, and no log line. A
        reaper cron now revives any batch stuck without progress for 30 minutes
      </>,
      "A broadcast's audience is frozen at send start, one failing chunk no longer fails the whole audience, and a paused broadcast reads as paused instead of processing",
      "Recipient IP addresses from open and click events are no longer stored. The columns are dropped and the field is discarded at the webhook",
      <>
        Onboarding leads with Connect AWS, and you can send a real test email
        from the dashboard while still in the SES sandbox. The deploy step
        offers a copy-paste prompt for your coding agent
      </>,
      "The template editor is React Email TSX plus an AI chat panel. The TipTap editor and its serializer are gone",
      "Fix: SCIM sync verbs, deactivation, and token hashing, plus SSO IdP trusted origins are now configurable instead of hardcoded",
    ],
  },
  {
    slug: "one-self-hosted-path",
    versions: ["CLI v3.0.0"],
    date: "2026-07-01",
    icon: Wrench,
    title: "One Self-Hosted Path",
    tags: ["cli", "self-hosted"],
    items: [
      <>
        Breaking: the Pulumi self-host variant is removed. Self-hosting is the
        SST full platform via <Code>pnpm selfhost:deploy</Code>. The Pulumi
        control plane multiplexed HTTP and SQS in one Lambda, threw after every
        chunk it processed, and left broadcasts stalled at{" "}
        <Code>processing</Code> forever
      </>,
      <>
        <Code>wraps selfhost</Code> keeps the commands that act on an existing
        deployment: <Code>login</Code>, <Code>logout</Code>, <Code>status</Code>
        , <Code>logs</Code>, <Code>env</Code>, <Code>connect</Code>, and{" "}
        <Code>update-role</Code>
      </>,
      "A pre-deploy check still catches leftovers from a crashed earlier deploy. The account-global scheduler role surviving would otherwise kill the next deploy partway through and lock you out of the deploy path",
      "Self-hosted installs gained batch queue alarms, a workflow DLQ alarm, an SES account-health cron, an event-feed staleness cron, and a workflow reaper",
      "Fix: migrations run before the code that needs them in both the API deploy and the CI upgrade, and CI upgrades reconstruct env-file-only keys instead of dropping them",
    ],
  },
  {
    slug: "self-hosted-logs-and-control-plane-routing",
    versions: ["CLI v2.30"],
    date: "2026-07-01",
    icon: Terminal,
    title: "Self-Hosted Logs & Control-Plane Routing",
    tags: ["cli", "self-hosted"],
    items: [
      <>
        New <Code>wraps selfhost logs</Code> streams CloudWatch logs from a
        self-hosted install without opening the AWS console. Scope to a single
        source with <Code>api</Code>, <Code>web</Code>, or <Code>workers</Code>,
        tail with <Code>--follow</Code>, rewind with <Code>--since</Code>, and
        narrow with <Code>--filter</Code> or <Code>--errors</Code>
      </>,
      <>
        Fix: API commands now route to the control plane you signed in to. A
        self-hosted login no longer sends requests at the Wraps cloud API
      </>,
      <>
        Fix: <Code>wraps status</Code> prints your own dashboard URL on a
        self-hosted install instead of always printing the Wraps one
      </>,
      <>
        Fix: a self-hosted web domain can live outside Route 53, and adding a
        domain after the fact repoints the app URLs that unsubscribe,
        preference, and verification links are built from
      </>,
      <>
        Fix: the SST deployment variant normalizes its API URL, so the two
        deploy paths agree on what the API is called
      </>,
      <>
        Fix: the database connection pool is capped explicitly rather than
        inheriting node-postgres&rsquo; default of 10
      </>,
      <>
        Fix: SDK snippets printed by the CLI — deploy output,{" "}
        <Code>sms init</Code>, and the TUI deploy step — referenced a class and
        an <Code>emails.send</Code> method that never existed. They now show the
        real <Code>email.send</Code> API with an explicit region
      </>,
      "Workers report failures to Sentry, and the self-hosted deploy workflow configures the Sentry DSN",
    ],
  },
  {
    slug: "self-hosted-url-fixes",
    versions: ["CLI v2.29.1"],
    date: "2026-07-01",
    icon: Wrench,
    title: "Self-Hosted URL Fixes",
    tags: ["cli", "self-hosted"],
    items: [
      <>
        Fix: <Code>wraps selfhost deploy</Code> no longer defaults the app URL
        to the Wraps dashboard. Accepting that default deployed a control plane
        that believed our dashboard was its own, and that URL builds every
        unsubscribe, preference and verification link the deployment emails to
        its recipients
      </>,
      <>
        Fix: <Code>wraps email init</Code>, <Code>connect</Code>,{" "}
        <Code>config</Code>, <Code>upgrade</Code> and <Code>status</Code> now
        report your own dashboard on a self-hosted install instead of always
        printing the Wraps one
      </>,
      "Fix: the support address shown by the CLI and its telemetry footer pointed at a domain we do not own",
    ],
  },
  {
    slug: "self-hosted-control-plane-hardening",
    versions: ["CLI v2.29.0"],
    date: "2026-07-01",
    icon: Terminal,
    title: "Self-Hosted Control Plane Hardening",
    tags: ["cli", "self-hosted"],
    items: [
      <>
        Deploy and upgrade now publish the SES templates the dashboard sends by
        name, so signup verification, invitations and password reset work on a
        fresh install instead of failing on a missing template
      </>,
      <>
        <Code>wraps selfhost env</Code> emits <Code>AUTH_EMAIL_FROM</Code>,{" "}
        <Code>AUTH_EMAIL_CONFIGURATION_SET</Code> and{" "}
        <Code>WRAPS_EMAIL_ROLE_ARN</Code> — the API-only variant hosts its own
        dashboard, and this is where it gets that configuration
      </>,
      <>
        The auth sender address is derived from the verified SES identity rather
        than the dashboard domain, which is only sendable when the two happen to
        match
      </>,
      <>
        A self-hosted deployment gets its own{" "}
        <Code>wraps-selfhost-console-access-role</Code>, trusting your account
        rather than Wraps
      </>,
      <>
        <Code>wraps selfhost connect</Code> adds a dedicated SES event target
        instead of repointing the platform&apos;s, so both control planes
        receive events
      </>,
      <>
        Self-hosters can route errors to their own Sentry DSN instead of
        Wraps&apos;
      </>,
      <>
        <Code>--selfhosted</Code> is replaced by the <Code>wraps selfhost</Code>{" "}
        subcommand
      </>,
      "Fix: recover the API URL on SST deployments, whose resource names carry a generated suffix",
    ],
  },
  {
    slug: "ses-pricing-plan-detection",
    versions: ["CLI v2.28.0"],
    date: "2026-07-01",
    icon: SlidersHorizontal,
    title: "SES Pricing Plan Detection",
    tags: ["cli"],
    items: [
      <>
        <Code>wraps email plan</Code> — reports the SES pricing plan for every
        tracked Region, the cheaper alternative if there is one, and the annual
        savings against your real send volume
      </>,
      "AWS added pricing plans to SES on 2026-07-21 and defaults new accounts to Essentials at $0.16/1K instead of a la carte at $0.10/1K. The plan is set per account, per Region, and no line item on your bill names the difference",
      <>
        Read-only by default. <Code>--set</Code> switches plans and always
        requires a confirmation naming the Region and account, or{" "}
        <Code>--yes</Code> — and never guesses a Region for a multi-Region
        account
      </>,
      <>
        Every comparison row carries a per-1K rate, so the gap between plans
        stays legible even when your monthly cost rounds to $0.00
      </>,
      <>
        <Code>--volume</Code> models the comparison against a volume you supply;{" "}
        <Code>--json</Code> for scripting
      </>,
      "Fix: wraps platform connect chose the console role's trust principal from whether self-hosted metadata existed on the local machine rather than from the invoked subcommand. A normal connect run on a machine that had ever run wraps selfhost deploy would silently point the trust policy at the customer's own AWS account and break dashboard access with no error",
      <>
        Fix: <Code>selfhost deploy</Code> and <Code>upgrade</Code> now store the
        API URL normalized, matching <Code>selfhost status</Code>. The raw
        Lambda Function URL's trailing slash produced a double slash in webhook
        paths that the API would not route
      </>,
    ],
  },
  {
    slug: "in-app-notifications",
    versions: ["Platform v0.19.0"],
    date: "2026-07-01",
    icon: Inbox,
    title: "In-App Notifications",
    tags: ["dashboard"],
    items: [
      "Notification bell in the dashboard — account health, billing, team, and send events surface where you already work",
      "Hourly SES health checks: sending pauses, bounce/complaint rates entering the AWS review range, and daily quota above 80% all raise an alert",
      "Milestone notifications for domain verification, SES production access, broadcast completion (with real failure counts), and contact imports",
      "Security notifications: new-device sign-ins, invite acceptances, role changes, and API key creation or revocation",
      "Payment failures notify org owners and admins in-app, alongside the existing email",
      <>
        Alerts for SES <Code>Reject</Code> and <Code>Rendering Failure</Code>{" "}
        events — sends that previously died silently now ring the bell, deduped
        to once per day
      </>,
      <>
        Built on <Code>better-inbox</Code>, an open-source better-auth plugin —
        notifications are rows in the database, not a third-party service
      </>,
    ],
  },
  {
    slug: "reliability-and-security-hardening",
    versions: ["Workflow Engine v2"],
    date: "2026-06-01",
    icon: ShieldCheck,
    title: "Reliability & Security Hardening",
    tags: ["dashboard"],
    items: [
      "Fix: editing a scheduled workflow's schedule no longer fails with AccessDenied in production",
      "Cross-org IDOR prevention on engagement resume — every workflow path scoped by organization",
      "Role-based access control enforced on all workflow mutations",
      "Stuck-execution recovery — a reaper automatically detects and recovers executions that stall mid-run",
      "Atomic execution claims and schedule updates eliminate duplicate runs and lost edits under concurrency",
      "Idempotent counters and hardened dead-letter queue transactions prevent double-counting and data loss",
      "Cycle detection rejects workflow definitions that would loop indefinitely",
    ],
  },
  {
    slug: "email-logs-inspection",
    versions: ["CLI v2.22.0"],
    date: "2026-05-01",
    icon: Search,
    title: "Email Logs Inspection",
    tags: ["cli"],
    items: [
      <>
        <Code>wraps email logs list</Code> — paginated table of sent emails with
        status, recipient, subject, and message ID
      </>,
      <>
        <Code>wraps email logs get {"<messageId>"}</Code> — full delivery detail
        for a single message including bounce type and timestamps
      </>,
      <>
        Filter by status: <Code>--status delivered</Code>,{" "}
        <Code>--status bounced</Code>, <Code>--status complained</Code>, and
        more
      </>,
      <>
        Cursor-based pagination with <Code>--limit</Code> and{" "}
        <Code>--cursor</Code> flags for large result sets
      </>,
      <>
        <Code>--json</Code> output for CI/CD pipelines and scripting
      </>,
      "Logs cover both SDK sends and batch broadcasts — unified view across all sending paths",
    ],
  },
  {
    slug: "agent-discovery-and-webmcp-tools",
    versions: ["Platform v0.18.0"],
    date: "2026-05-01",
    icon: Bot,
    title: "Agent Discovery & WebMCP Tools",
    tags: ["dashboard", "agents"],
    items: [
      <>
        WebMCP tools — <Code>get_pricing</Code>, <Code>get_quickstart</Code>,{" "}
        <Code>search_docs</Code> registered via{" "}
        <Code>navigator.modelContext.provideContext()</Code> for in-browser
        agent interaction
      </>,
      <>
        Per-page markdown at <Code>/api/md/{"<path>"}</Code> — agents requesting
        any docs URL get page-specific content rather than the generic{" "}
        <Code>llms.txt</Code> summary (11 pages: quickstarts, SDK reference, CLI
        reference, webhooks, domain verification)
      </>,
      <>
        OAuth 2.0 discovery at{" "}
        <Code>/.well-known/oauth-authorization-server</Code> (RFC 8414) on both
        wraps.dev and api.wraps.dev — describes Device Authorization Grant for
        agent and CLI authentication
      </>,
      <>
        RFC 9727 API catalog at <Code>/.well-known/api-catalog</Code> —
        linkset+json pointing to OpenAPI spec, docs, and health endpoint
      </>,
      "RFC 8288 Link header on the homepage advertises /docs as the service documentation endpoint for agent discovery",
      <>
        <Code>robots.txt</Code> AI signals via a single{" "}
        <Code>Content-Signal: ai-train=no, search=yes, ai-input=yes</Code>{" "}
        response header
      </>,
    ],
  },
  {
    slug: "per-domain-ses-configuration-sets",
    versions: ["CLI v2.21.0"],
    date: "2026-05-01",
    icon: SlidersHorizontal,
    title: "Per-Domain SES Configuration Sets",
    tags: ["cli"],
    items: [
      <>
        <Code>wraps email domains config</Code> — configure SES options per
        domain interactively or via flags
      </>,
      <>
        Migrate via <Code>wraps email upgrade</Code> → "Per-domain configuration
        sets": creates a dedicated config set for each sending identity, no DNS
        changes needed
      </>,
      "7 configuration groups: open/click tracking, TLS delivery, sending toggle, reputation metrics, bounce/complaint suppression, email archiving, and VDM",
      <>
        10 boolean flags for scripting: <Code>--opens</Code>,{" "}
        <Code>--clicks</Code>, <Code>--tls-required</Code>,{" "}
        <Code>--suppress-bounce</Code>, <Code>--archive</Code>,{" "}
        <Code>--vdm-engagement</Code>, and more
      </>,
      <>
        Shared <Code>wraps-email-archive</Code> Mail Manager archive —
        auto-created on first use, linked to each domain that enables archiving
      </>,
      "VDM options (engagement metrics, inbox placement) only shown when account has Virtual Deliverability Manager enabled",
      "Fix: EventBridge now forwards all SES event types — previously some event subtypes were silently dropped",
    ],
  },
  {
    slug: "okta-sso-scim-2-0-and-role-based-access-control",
    versions: ["Enterprise v1.0"],
    date: "2026-04-01",
    icon: Building2,
    title: "Okta SSO, SCIM 2.0 & Role-Based Access Control",
    tags: ["dashboard"],
    items: [
      "Okta SSO with OIDC-based authentication and IdP-initiated sign-in",
      "SCIM 2.0 provisioning — automatic user and group sync from your identity provider",
      "Domain verification for SSO with DNS TXT record guidance and in-dashboard status",
      <>
        Sign-in redirect URI surfaced in setup form for seamless Okta app
        configuration
      </>,
      "6-role permission model: Owner, Admin, Member, Developer, Viewer, and Billing",
      "RBAC enforced across all dashboard actions and server-side mutations",
      "Billing role isolates billing management from content operations",
    ],
  },
  {
    slug: "broadcast-drafts-contact-externalid-and-segment-improvements",
    versions: ["Platform v0.17.0"],
    date: "2026-04-01",
    icon: Sparkles,
    title: "Broadcast Drafts, Contact externalId & Segment Improvements",
    tags: ["dashboard"],
    items: [
      "Broadcast drafts — save work-in-progress broadcasts without sending",
      "Duplicate any existing broadcast to create a new one from it",
      <>
        Contact <Code>externalId</Code> field for multi-identifier resolution —
        link contacts by your own system IDs via SDK or API
      </>,
      "Numeric comparators (>, <, ≥, ≤) in segment builder for custom number properties",
      "Refresh buttons on all list and analytics pages for on-demand data updates",
      <>
        <Code>@wraps.dev/email-check</Code> published to npm — run{" "}
        <Code>npx @wraps.dev/email-check yourdomain.com</Code> under the Wraps
        scope
      </>,
      "Email sends are analytics-only and not plan-gated",
    ],
  },
  {
    slug: "signed-reply-to-threading",
    versions: ["CLI v2.19.0"],
    date: "2026-04-01",
    icon: MessageSquare,
    title: "Signed Reply-To Threading",
    tags: ["cli"],
    items: [
      <>
        <Code>wraps email reply init --domain yourdomain.com</Code> to enable
        cryptographic reply threading for agent workflows
      </>,
      <>
        Outbound: SDK accepts a <Code>conversationId</Code> option on{" "}
        <Code>email.send</Code> and returns{" "}
        <Code>{"{ conversationId, sendId }"}</Code>
      </>,
      <>
        Inbound: <Code>email.received</Code> now includes{" "}
        <Code>{"replyToken: { status, conversationId?, sendId? }"}</Code> and{" "}
        <Code>autoReply: boolean</Code>
      </>,
      "HMAC secret stays in your AWS SSM Parameter Store — Wraps platform never sees it",
      <>
        Fix: <Code>wraps email inbound init</Code> now respects{" "}
        <Code>--yes</Code> and <Code>--json</Code> on the DNS confirmation
        prompt for CI scripting
      </>,
      <>
        See the{" "}
        <a
          className="underline underline-offset-2 hover:text-foreground"
          href="/docs/guides/reply-threading"
        >
          reply threading guide
        </a>
      </>,
    ],
  },
  {
    slug: "onboarding-activation",
    versions: ["Platform v0.16.0"],
    date: "2026-03-01",
    icon: Compass,
    title: "Onboarding Activation",
    tags: ["dashboard"],
    items: [
      "Choose Path step replaces Welcome — start building or connect AWS first",
      "Mobile signup rescue gate with device-based continuation flow",
      "Go-live banner with AWS action gates across dashboard pages",
      "Activation score tracking with API endpoint and contact property sync",
      "Invite members onboarding step plus sidebar invite activation loop",
      "Template gallery with 6 starters and AI path on empty state",
      "Two-path activation drip: start-building vs connect-aws users",
      "Power-user activation template for velocity signups",
    ],
  },
  {
    slug: "ai-conversation-persistence-and-brand-kits",
    versions: ["Template Editor v2"],
    date: "2026-03-01",
    icon: Sparkles,
    title: "AI Conversation Persistence & Brand Kits",
    tags: ["dashboard"],
    items: [
      "AI chat history persists across sessions — pick up where you left off",
      "Brand kit auto-applied in AI code assistant for on-brand output",
      "Version history with restore — every AI apply is recoverable",
      "New templates default to react-email with JIT TipTap migration",
      <>
        <Code>previewText</Code> column on templates for inbox preheaders
      </>,
      "Real unsubscribe and preference URLs in test email sends",
      "Shared preview panel across code template editor tabs",
      "Broadcast stats with Sankey diagram, click URL tracking, engagement funnel",
    ],
  },
  {
    slug: "built-for-ai-coding-agents",
    versions: ["Agent-Ready Platform"],
    date: "2026-03-01",
    icon: Bot,
    title: "Built for AI Coding Agents",
    tags: ["agents"],
    items: [
      <>
        <Code>agent.json</Code> at the root for AI agent discovery
      </>,
      <>
        <Code>llms.txt</Code> expanded with agent guidance, comparisons, and
        skills
      </>,
      <>
        <Code>context7.json</Code> for Context7 documentation indexing
      </>,
      "Full API reference docs with linked OpenAPI spec",
      "Rate limits documentation for agent integration",
      "Agent-discoverable npm descriptions and keywords across all packages",
      "Context7 guide for AI-assisted development with Wraps",
    ],
  },
  {
    slug: "standalone-deliverability-cli",
    versions: ["mail-audit v1.1.1"],
    date: "2026-03-01",
    icon: ShieldCheck,
    title: "Standalone Deliverability CLI",
    tags: ["cli"],
    items: [
      <>
        <Code>npx mail-audit yourdomain.com</Code> to grade any sending domain
        without a Wraps account
      </>,
      "Auth triad grading across SPF, DKIM, and DMARC with weighted scoring",
      "Reliable bar chars and auto-padded borders in terminal score box",
      "YC W26 batch audit blog post covering deliverability findings",
      "Free tool to capture SES-curious developers before the full Wraps flow",
    ],
  },
  {
    slug: "cli-polish-and-multi-domain-management",
    versions: ["CLI v2.14–2.17"],
    date: "2026-02-01",
    icon: Terminal,
    title: "CLI Polish & Multi-Domain Management",
    tags: ["cli"],
    items: [
      <>
        <Code>--json</Code> output on all commands for CI/CD integration
      </>,
      "Guided multi-domain management with subdomain suggestions for reputation isolation",
      "Root domain support for inbound email receiving",
      "Auto-clear Pulumi stack locks on deploy retry",
      "Hosting provider change in the upgrade menu",
      "Pulumi detection fix for SDK-installed binaries",
      <>
        <Code>wraps email templates preview</Code> with live reload via SSE
      </>,
      "Terminal dashboard UI (TUI) with email init wizard",
    ],
  },
  {
    slug: "dashboard-overhaul",
    versions: ["Platform v0.15.0"],
    date: "2026-02-01",
    icon: LayoutDashboard,
    title: "Dashboard Overhaul",
    tags: ["dashboard"],
    items: [
      "Unified overview page with channel-granular health monitoring",
      <>
        Universal <Code>Cmd-K</Code> command palette with server-side search
      </>,
      "Analytics charts on contacts, events, emails, and inbound pages",
      "CSV import with column mapping and custom properties",
      "CSV export on all dashboard tables",
      "Bulk template actions — select multiple to delete, publish, or change type",
      <>
        Natural language date input for broadcast scheduling (e.g.{" "}
        <Code>next Tuesday at 9am</Code>)
      </>,
      "Send volume sparklines on API key cards",
      "Undo/redo in the visual workflow builder",
      "Pre-enable readiness checks that validate workflows before going live",
      "Searchable condition combobox replacing free-text input",
      "Unsaved changes guard in the workflow builder",
      <>SDK quick start snippets in topic subscribers sheet</>,
    ],
  },
  {
    slug: "zero-config-vercel-oidc-and-config-helpers",
    versions: ["SDK v0.10.0"],
    date: "2026-02-01",
    icon: Package,
    title: "Zero-Config Vercel OIDC & Config Helpers",
    tags: ["sdk"],
    items: [
      <>
        Zero-config Vercel OIDC — SDK auto-detects <Code>AWS_ROLE_ARN</Code>{" "}
        from env, no secrets or env vars needed
      </>,
      <>
        <Code>defineConfig</Code> and <Code>defineBrand</Code> helpers for
        templates-as-code
      </>,
      "Workflow definition helpers for workflows-as-code",
      <>
        <Code>inbox.forward()</Code> and <Code>inbox.reply()</Code> for inbound
        email
      </>,
      "Security patch for fast-xml-parser (CVE override)",
    ],
  },
  {
    slug: "multi-channel-sms-launch",
    versions: ["SMS v0.1.2"],
    date: "2026-02-01",
    icon: Smartphone,
    title: "Multi-Channel SMS Launch",
    tags: ["cli"],
    items: [
      "SMS moved from waitlist to generally available",
      "Multi-channel database schema — templates, contacts, and workflows support both email and SMS",
      "Cascade nodes in the workflow builder for multi-step, multi-channel sequences",
      "SMS dashboard cleanup with correct event status mapping",
      "SMS SDK v0.1.2 with proper error type mapping",
    ],
  },
  {
    slug: "workflow-reliability-hardening",
    versions: ["Workflow Engine"],
    date: "2026-02-01",
    icon: Wrench,
    title: "Workflow Reliability Hardening",
    tags: ["dashboard"],
    items: [
      "DLQ consumer with CloudWatch alarms for failed workflow and batch messages",
      "Fixed dual-resume race condition in the workflow processor",
      "Definition snapshots — in-flight executions are immune to live dashboard edits",
      "Repaired broken EventBridge schedule chains with reconciliation watchdog",
      "Hardened webhook SSRF validation — blocks loopback, link-local, and private networks",
      "8 critical and high severity workflow bugs resolved in one pass",
      "Atomic idempotency keys on step execution inserts to prevent duplicate sends",
    ],
  },
  {
    slug: "security-patches-and-structured-logging",
    versions: ["Security & Observability"],
    date: "2026-02-01",
    icon: Lock,
    title: "Security Patches & Structured Logging",
    tags: ["dashboard"],
    items: [
      "Patched XSS, cross-org IDOR, and RCE vulnerabilities",
      "Timing-safe secret comparison across all auth paths",
      "Resolved 22 Dependabot alerts via dependency upgrades and pnpm overrides",
      "Migrated entire API from console logging to structured JSON logging",
      "Canonical log lines per authenticated request for debugging and analytics",
      "PostHog error tracking on API and Stripe webhooks",
      <>
        Cross-org IDOR prevention: all queries scoped by{" "}
        <Code>organizationId</Code> from auth context
      </>,
      "Guardrail system with Biome GritQL plugins and architecture tests",
    ],
  },
  {
    slug: "14-new-doc-pages-and-performance",
    versions: ["Website"],
    date: "2026-02-01",
    icon: Gauge,
    title: "14 New Doc Pages & Performance",
    tags: ["dashboard"],
    items: [
      "14 new documentation pages: inbound email, EventBridge events, Vercel setup, webhooks, and migration guide",
      "Redesigned pricing comparison with scroll-driven tabs",
      "New about and contact pages with author bylines",
      "Inbound email marketing page",
      "SEO-optimized SES cost calculator",
      "Converted 13 large PNGs to WebP — 95% size reduction (30MB → 1.3MB)",
      "Auto-discovering sitemap replacing hardcoded page list",
      "Vercel Speed Insights integration",
      <>SSR static content on tools pages for SEO</>,
    ],
  },
  {
    slug: "webhook-events",
    versions: ["CLI v2.13.0"],
    date: "2026-02-01",
    icon: Zap,
    title: "Webhook Events",
    tags: ["cli"],
    items: [
      "Configure an HTTPS webhook endpoint to receive real-time SES email events",
      <>
        CLI: <Code>wraps email upgrade</Code> → "Configure webhook endpoint"
      </>,
      "Events delivered via EventBridge API Destination with secret-based authentication",
      <>
        Supports all SES event types: delivery, bounce, complaint, open, click,
        and more
      </>,
      <>
        <Code>X-Wraps-Signature</Code> header for request verification
      </>,
      "Manage, regenerate secrets, or disable from the same upgrade menu",
    ],
  },
  {
    slug: "ai-template-editor-and-workflows-as-code",
    versions: ["Platform v0.14.0"],
    date: "2026-02-01",
    icon: Sparkles,
    title: "AI Template Editor & Workflows-as-Code",
    tags: ["dashboard"],
    items: [
      "AI code assistant with live preview pane and resizable split view",
      "Brand kit picker and local image uploads in AI assistant",
      "Bulk template actions with SES sync on delete",
      <>
        Natural language date input for broadcast scheduling (e.g.{" "}
        <Code>next Tuesday at 9am</Code>)
      </>,
      "Workflows-as-code: define and push automations from the CLI",
      "CloudFormation template brought to full CLI parity",
      "Activation email series and product update templates",
      <>
        Auto-create contacts for <Code>SUBSCRIPTION</Code> events
      </>,
    ],
  },
  {
    slug: "reliability-and-security",
    versions: ["CLI v2.12"],
    date: "2026-02-01",
    icon: ShieldCheck,
    title: "Reliability & Security",
    tags: ["cli"],
    items: [
      "Batch send security, correctness, and maintainability fixes",
      "Device auth flow fixes for telemetry, errors, and config",
      "Delete S3 metadata on destroy to prevent stuck state after partial failure",
      "Graceful Pulumi destroy failure handling instead of leaving stale metadata",
      "Domain verification check before test email send",
      "Prevent Pulumi import collision when stack already has resources",
      <>
        Fix CI detection silently disabling telemetry for Vercel and Netlify
        users
      </>,
      <>
        <Code>wraps email templates preview</Code> command
      </>,
    ],
  },
  {
    slug: "inbound-email",
    versions: ["CLI v2.7.0 + SDK v0.6.0"],
    date: "2026-02-01",
    icon: Inbox,
    title: "Inbound Email",
    tags: ["cli"],
    items: [
      "Receive emails in your AWS account with SES receipt rules",
      "Parse incoming emails with headers, body, and attachments",
      "Spam and virus scanning via SES verdicts",
      <>
        CLI: <Code>wraps email inbound init</Code>, <Code>status</Code>,{" "}
        <Code>test</Code>, and <Code>destroy</Code> commands
      </>,
      <>
        SDK: <Code>inbox.list()</Code>, <Code>get()</Code>, <Code>reply()</Code>
        , <Code>forward()</Code> methods
      </>,
      <>
        EventBridge <Code>email.received</Code> events for real-time webhooks
      </>,
      "Dashboard: Receiving tab with inbound email viewer",
    ],
  },
  {
    slug: "s3-remote-state",
    versions: ["CLI v2.6.1"],
    date: "2026-02-01",
    icon: Cloud,
    title: "S3 Remote State",
    tags: ["cli"],
    items: [
      "Pulumi state automatically stored in S3 for multi-machine deploys",
      "Auto-creates encrypted, versioned state bucket on first deploy",
      "Seamless migration of existing local state to S3",
      "Connection metadata synced across machines with timestamp-based merging",
      <>
        Set <Code>WRAPS_LOCAL_ONLY=1</Code> to opt out and keep local-only state
      </>,
      "Graceful fallback to local state if S3 is unreachable",
    ],
  },
  {
    slug: "free-plan",
    versions: ["Platform v0.13.0"],
    date: "2026-01-01",
    icon: Gift,
    title: "Free Plan",
    tags: ["dashboard"],
    items: [
      "Free tier with contacts, topics, broadcasts, and workflows",
      "Getting Started dashboard with guided activation checklist",
      "Google and GitHub OAuth sign-in",
      "Events log with search, filtering, and usage tracking",
      "Monthly and annual billing toggle with promo code support",
      <>
        CLI: <Code>wraps permissions</Code> command for IAM troubleshooting
      </>,
    ],
  },
  {
    slug: "infrastructure-as-code",
    versions: ["CLI v2.4.0"],
    date: "2026-01-01",
    icon: Layers,
    title: "Infrastructure as Code",
    tags: ["cli"],
    items: [
      <>
        Published <Code>@wraps.dev/cdk</Code> and <Code>@wraps.dev/pulumi</Code>{" "}
        npm packages
      </>,
      "One-click CloudFormation deployment from the dashboard",
      "Multi-provider DNS support (Route53, Cloudflare, Vercel)",
      <>
        CLI: <Code>wraps platform connect</Code> to link CLI deployments to the
        dashboard
      </>,
      "CloudWatch reputation alerting for SES metrics",
      "DKIM, SPF, and DMARC DNS record outputs for all IaC providers",
    ],
  },
  {
    slug: "cdn-infrastructure",
    versions: ["CLI v2.1.0"],
    date: "2026-01-01",
    icon: HardDrive,
    title: "CDN Infrastructure",
    tags: ["cli"],
    items: [
      "S3 bucket + CloudFront CDN deployment",
      "Custom domain support with ACM SSL certificates",
      "Browser-based image optimization",
      "Origin Access Control for secure S3 access",
      <>
        CLI: <Code>wraps cdn init</Code>, <Code>verify</Code>,{" "}
        <Code>upgrade</Code>, and <Code>destroy</Code> commands
      </>,
      "Pay AWS directly (~$5-7/mo for typical usage)",
    ],
  },
  {
    slug: "workflow-automations",
    versions: ["Platform v0.10.0"],
    date: "2026-01-01",
    icon: Workflow,
    title: "Workflow Automations",
    tags: ["dashboard"],
    items: [
      "Visual workflow builder with React Flow canvas",
      "AI-powered Flow Designer for natural language automation",
      "Conditional branching and wait-for-event patterns",
      <>
        CLI: <Code>wraps doctor</Code> and <Code>wraps setup</Code> with SSO
        support
      </>,
      <>
        SDK: <Code>@wraps.dev/client</Code> events and workflow trigger
        endpoints
      </>,
    ],
  },
  {
    slug: "broadcasts",
    versions: ["Platform v0.9.0"],
    date: "2026-01-01",
    icon: Send,
    title: "Broadcasts",
    tags: ["dashboard"],
    items: [
      "Scheduled broadcasts with bulk SES sending",
      "Brand kits for consistent email styling",
      "Broadcast analytics and delivery tracking",
    ],
  },
  {
    slug: "topics-and-double-opt-in",
    versions: ["Platform v0.8.0"],
    date: "2026-01-01",
    icon: Tags,
    title: "Topics & Double Opt-In",
    tags: ["dashboard"],
    items: [
      "Topics for subscription management",
      "Double opt-in confirmation emails",
      "Preference center for subscription management",
      <>
        SDK: <Code>@wraps.dev/client</Code> topicSlugs support
      </>,
    ],
  },
  {
    slug: "sms-infrastructure",
    versions: ["CLI v1.5.0"],
    date: "2025-12-01",
    icon: MessageSquare,
    title: "SMS Infrastructure",
    tags: ["cli"],
    items: [
      "SMS support via AWS End User Messaging",
      "Toll-free number provisioning",
      "SMS analytics and delivery tracking",
      <>
        CLI: <Code>wraps sms init</Code>, <Code>status</Code>, and{" "}
        <Code>destroy</Code> commands
      </>,
      <>
        SDK: <Code>@wraps.dev/sms</Code> v0.1.0 for sending SMS via AWS
      </>,
    ],
  },
  {
    slug: "deliverability-check",
    versions: ["CLI v1.4.0"],
    date: "2025-12-01",
    icon: Blocks,
    title: "Deliverability Check",
    tags: ["cli"],
    items: [
      <>
        CLI: <Code>wraps email check</Code> command
      </>,
      "DNS record validation (SPF, DKIM, DMARC)",
      "Email authentication analysis",
      "Blocklist monitoring across major providers",
      "Actionable remediation suggestions",
    ],
  },
  {
    slug: "platform-sdk",
    versions: ["SDK v0.1.0"],
    date: "2025-12-01",
    icon: Blocks,
    title: "Platform SDK",
    tags: ["sdk"],
    items: [
      <>
        New <Code>@wraps.dev/client</Code> SDK for Platform API
      </>,
      "Type-safe contacts, topics, and segments management",
      "Batch email sending via Platform",
      "API key authentication",
    ],
  },
  {
    slug: "contacts-management",
    versions: ["Platform v0.4.0"],
    date: "2025-12-01",
    icon: Users,
    title: "Contacts Management",
    tags: ["dashboard"],
    items: [
      "Contact creation, editing, and deletion",
      "Activity timeline showing email events per contact",
      "Custom properties with flexible schema",
      "Contact import/export (CSV)",
      "Search and filtering by properties",
      <>
        SDK: <Code>@wraps.dev/client</Code> contacts API
      </>,
    ],
  },
  {
    slug: "template-editor",
    versions: ["Platform v0.3.0"],
    date: "2025-12-01",
    icon: LayoutTemplate,
    title: "Template Editor",
    tags: ["dashboard"],
    items: [
      "Visual drag-and-drop template editor",
      "Keyboard shortcuts and command menu",
      "Template showcase section",
    ],
  },
  {
    slug: "dashboard-and-multi-service-cli",
    versions: ["CLI v1.0.0"],
    date: "2025-11-01",
    icon: Terminal,
    title: "Dashboard & Multi-Service CLI",
    tags: ["cli"],
    items: [
      "Wraps Platform at app.wraps.dev",
      "Email analytics and event tracking",
      "Contact management with activity timeline",
      <>
        CLI: Multi-service architecture (<Code>wraps email</Code>,{" "}
        <Code>wraps sms</Code>)
      </>,
      <>
        CLI: <Code>wraps email domains</Code> and custom tracking domains
      </>,
      <>
        SDK: <Code>@wraps.dev/email</Code> v0.3-0.4 with OIDC federation and
        attachments
      </>,
      "Documentation site with SDK reference",
    ],
  },
  {
    slug: "initial-release",
    versions: ["CLI v0.1.0"],
    date: "2025-11-01",
    icon: Rocket,
    title: "Initial Release",
    tags: ["cli"],
    items: [
      "One-command AWS SES deployment",
      "Preset configurations (Starter, Production, Enterprise)",
      "Domain verification, DKIM, and MAIL FROM setup",
      "Local console for development",
      "Vercel OIDC authentication",
      <>
        <Code>@wraps.dev/cli</Code> for infrastructure deployment
      </>,
      <>
        <Code>@wraps.dev/email</Code> v0.1-0.2 TypeScript SDK for sending emails
      </>,
    ],
  },
];
