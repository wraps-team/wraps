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
  Lightbulb,
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

type Release = {
  version: string;
  date: string;
  icon: LucideIcon;
  title: string;
  items: ReactNode[];
};

const Code = ({ children }: { children: ReactNode }) => (
  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground text-xs">
    {children}
  </code>
);

const releases: Release[] = [
  {
    version: "CLI v3.6.0",
    date: "September 2026",
    icon: Lock,
    title: "Custom Tracking Domains & Proven-Orphan Cleanup",
    items: [
      <>
        <Code>wraps email domains add</Code> and{" "}
        <Code>wraps email domains config</Code> accept{" "}
        <Code>--tracking-domain</Code>, so open and click links resolve through
        a host under your own domain instead of{" "}
        <Code>r.&lt;region&gt;.awstrack.me</Code>. SES sets this per
        configuration set, so every managed domain needs its own
      </>,
      <>
        <Code>--tracking-https</Code> requests an ACM certificate and puts a
        CloudFront distribution in front of that host. ACM validation takes 5 to
        30 minutes, so it is two runs: the first prints the validation record,
        the second finishes once the certificate is ISSUED
      </>,
      <>
        The five tracking-domain error codes are documented at{" "}
        <Code>/docs/reference/errors</Code>, and the domain verification guide
        explains the CNAME to publish and why a subdomain that was never added
        separately inherits the primary domain&rsquo;s tracking host
      </>,
      <>
        Fix: <Code>wraps email doctor --cleanup</Code> offered to delete
        resources it had never proved were orphans. Any failure of the Pulumi
        stack probe &mdash; stack not found, Pulumi not installed, an
        unreachable state bucket &mdash; read the same as a proven-absent stack,
        which swept in the console access role and the configuration sets{" "}
        <Code>domains add</Code> creates. Stack state is now three-valued, and
        only a positive absent may call anything an orphan
      </>,
      <>
        Fix: doctor checks CloudFormation for a Wraps-owned stack before
        labelling anything orphaned, so a dashboard quick-create deployment is
        no longer mistaken for loose resources. An account it cannot check
        refuses <Code>--cleanup</Code> rather than assuming, and names the
        owning stack when it finds one
      </>,
      <>
        Fix: disabling and re-enabling HTTPS handed back a CloudFront
        distribution the CLI had switched off. SES rewrites every link in
        outbound mail through the tracking domain, so recipients got CloudFront
        errors on click rather than losing tracking. ACM and CloudFront listings
        are paginated too, so a second page no longer causes a fresh certificate
        request on every run
      </>,
      <>
        Fix: a failure to provision HTTPS during <Code>domains add</Code> warns
        and falls back to plain HTTP tracking instead of aborting the command
        and orphaning the identity and configuration set it had already created
      </>,
    ],
  },
  {
    version: "CLI v3.5.3",
    date: "August 2026",
    icon: Terminal,
    title: "Adopting a Deployment the CLI Did Not Create",
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
    version: "Platform v0.26.0",
    date: "August 2026",
    icon: Tags,
    title: "Free, Pro & Business",
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
    version: "Platform v0.25.0",
    date: "August 2026",
    icon: Bot,
    title: "Ask Mode & Guided Setup",
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
    version: "API v1.1",
    date: "August 2026",
    icon: Blocks,
    title: "Machine-Readable Errors & Data Retention",
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
    version: "Platform v0.24.0",
    date: "August 2026",
    icon: Compass,
    title: "Three Deploy Paths & Feed Health",
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
    version: "CLI v3.4.0",
    date: "August 2026",
    icon: Wrench,
    title: "One Doctor Command & Structured Remediations",
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
    version: "Platform v0.23.0",
    date: "August 2026",
    icon: Tags,
    title: "Audience Counts That Match What Sends",
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
    version: "Platform v0.22.0",
    date: "August 2026",
    icon: Send,
    title: "Test Sends, Recipient Results & Resume",
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
    version: "Platform v0.21.0",
    date: "August 2026",
    icon: Inbox,
    title: "Message-Level Search & Full Send History",
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
    version: "CLI v3.2",
    date: "August 2026",
    icon: Terminal,
    title: "Non-Interactive SMS Setup & Corrected Error Codes",
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
    version: "CLI v3.1.0",
    date: "August 2026",
    icon: ShieldCheck,
    title: "BIMI Checks & Configurable Event Types",
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
    version: "Pulumi v0.3.0",
    date: "August 2026",
    icon: Blocks,
    title: "Email Stack Parity Guard",
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
    version: "Platform v0.20.0",
    date: "August 2026",
    icon: Sparkles,
    title: "Preference Center Theming & Multi-Day Broadcasts",
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
    version: "CLI v3.0.0",
    date: "July 2026",
    icon: Wrench,
    title: "One Self-Hosted Path",
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
    version: "CLI v2.30",
    date: "July 2026",
    icon: Terminal,
    title: "Self-Hosted Logs & Control-Plane Routing",
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
    version: "CLI v2.29.1",
    date: "July 2026",
    icon: Wrench,
    title: "Self-Hosted URL Fixes",
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
    version: "CLI v2.29.0",
    date: "July 2026",
    icon: Terminal,
    title: "Self-Hosted Control Plane Hardening",
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
    version: "CLI v2.28.0",
    date: "July 2026",
    icon: SlidersHorizontal,
    title: "SES Pricing Plan Detection",
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
    version: "Platform v0.19.0",
    date: "July 2026",
    icon: Inbox,
    title: "In-App Notifications",
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
    version: "Workflow Engine v2",
    date: "June 2026",
    icon: ShieldCheck,
    title: "Reliability & Security Hardening",
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
    version: "CLI v2.22.0",
    date: "May 2026",
    icon: Search,
    title: "Email Logs Inspection",
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
    version: "Platform v0.18.0",
    date: "May 2026",
    icon: Bot,
    title: "Agent Discovery & WebMCP Tools",
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
    version: "CLI v2.21.0",
    date: "May 2026",
    icon: SlidersHorizontal,
    title: "Per-Domain SES Configuration Sets",
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
    version: "Enterprise v1.0",
    date: "April 2026",
    icon: Building2,
    title: "Okta SSO, SCIM 2.0 & Role-Based Access Control",
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
    version: "Platform v0.17.0",
    date: "April 2026",
    icon: Sparkles,
    title: "Broadcast Drafts, Contact externalId & Segment Improvements",
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
    version: "CLI v2.19.0",
    date: "April 2026",
    icon: MessageSquare,
    title: "Signed Reply-To Threading",
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
    version: "Platform v0.16.0",
    date: "March 2026",
    icon: Compass,
    title: "Onboarding Activation",
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
    version: "Template Editor v2",
    date: "March 2026",
    icon: Sparkles,
    title: "AI Conversation Persistence & Brand Kits",
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
    version: "Agent-Ready Platform",
    date: "March 2026",
    icon: Bot,
    title: "Built for AI Coding Agents",
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
    version: "mail-audit v1.1.1",
    date: "March 2026",
    icon: ShieldCheck,
    title: "Standalone Deliverability CLI",
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
    version: "CLI v2.14–2.17",
    date: "February 2026",
    icon: Terminal,
    title: "CLI Polish & Multi-Domain Management",
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
    version: "Platform v0.15.0",
    date: "February 2026",
    icon: LayoutDashboard,
    title: "Dashboard Overhaul",
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
    version: "SDK v0.10.0",
    date: "February 2026",
    icon: Package,
    title: "Zero-Config Vercel OIDC & Config Helpers",
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
    version: "SMS v0.1.2",
    date: "February 2026",
    icon: Smartphone,
    title: "Multi-Channel SMS Launch",
    items: [
      "SMS moved from waitlist to generally available",
      "Multi-channel database schema — templates, contacts, and workflows support both email and SMS",
      "Cascade nodes in the workflow builder for multi-step, multi-channel sequences",
      "SMS dashboard cleanup with correct event status mapping",
      "SMS SDK v0.1.2 with proper error type mapping",
    ],
  },
  {
    version: "Workflow Engine",
    date: "February 2026",
    icon: Wrench,
    title: "Workflow Reliability Hardening",
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
    version: "Security & Observability",
    date: "February 2026",
    icon: Lock,
    title: "Security Patches & Structured Logging",
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
    version: "Website",
    date: "February 2026",
    icon: Gauge,
    title: "14 New Doc Pages & Performance",
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
    version: "CLI v2.13.0",
    date: "February 2026",
    icon: Zap,
    title: "Webhook Events",
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
    version: "Platform v0.14.0",
    date: "February 2026",
    icon: Sparkles,
    title: "AI Template Editor & Workflows-as-Code",
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
    version: "CLI v2.12",
    date: "February 2026",
    icon: ShieldCheck,
    title: "Reliability & Security",
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
    version: "CLI v2.7.0 + SDK v0.6.0",
    date: "February 2026",
    icon: Inbox,
    title: "Inbound Email",
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
    version: "CLI v2.6.1",
    date: "February 2026",
    icon: Cloud,
    title: "S3 Remote State",
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
    version: "Platform v0.13.0",
    date: "January 2026",
    icon: Gift,
    title: "Free Plan",
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
    version: "CLI v2.4.0",
    date: "January 2026",
    icon: Layers,
    title: "Infrastructure as Code",
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
    version: "CLI v2.1.0",
    date: "January 2026",
    icon: HardDrive,
    title: "CDN Infrastructure",
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
    version: "Platform v0.10.0",
    date: "January 2026",
    icon: Workflow,
    title: "Workflow Automations",
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
    version: "Platform v0.9.0",
    date: "January 2026",
    icon: Send,
    title: "Broadcasts",
    items: [
      "Scheduled broadcasts with bulk SES sending",
      "Brand kits for consistent email styling",
      "Broadcast analytics and delivery tracking",
    ],
  },
  {
    version: "Platform v0.8.0",
    date: "January 2026",
    icon: Tags,
    title: "Topics & Double Opt-In",
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
    version: "CLI v1.5.0",
    date: "December 2025",
    icon: MessageSquare,
    title: "SMS Infrastructure",
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
    version: "CLI v1.4.0",
    date: "December 2025",
    icon: Blocks,
    title: "Deliverability Check",
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
    version: "SDK v0.1.0",
    date: "December 2025",
    icon: Blocks,
    title: "Platform SDK",
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
    version: "Platform v0.4.0",
    date: "December 2025",
    icon: Users,
    title: "Contacts Management",
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
    version: "Platform v0.3.0",
    date: "December 2025",
    icon: LayoutTemplate,
    title: "Template Editor",
    items: [
      "Visual drag-and-drop template editor",
      "Keyboard shortcuts and command menu",
      "Template showcase section",
    ],
  },
  {
    version: "CLI v1.0.0",
    date: "November 2025",
    icon: Terminal,
    title: "Dashboard & Multi-Service CLI",
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
    version: "CLI v0.1.0",
    date: "November 2025",
    icon: Rocket,
    title: "Initial Release",
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

export function ChangelogReleasesSection() {
  return (
    <section className="py-12 pb-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="relative">
          {/* Releases with timeline */}
          <div className="relative">
            {/* Timeline line - contained to releases section */}
            <div className="absolute top-0 bottom-0 left-[24px] w-[1.5px] bg-border" />

            <div className="space-y-12">
              {releases.map((release, index) => {
                const Icon = release.icon;
                return (
                  <div className="relative pl-16" key={release.version}>
                    {/* Timeline dot - outer circle */}
                    <div className="absolute left-0 flex size-12 items-center justify-center rounded-full bg-background">
                      {/* Inner node — orange only marks the latest release */}
                      <div
                        className={
                          index === 0
                            ? "flex size-10 items-center justify-center rounded-full border border-orange-500/40 bg-orange-500/10 text-orange-500"
                            : "flex size-10 items-center justify-center rounded-full border border-border bg-card text-muted-foreground"
                        }
                      >
                        <Icon className="size-5" />
                      </div>
                    </div>

                    {/* Content */}
                    <div className="overflow-hidden rounded-xl border border-border bg-card">
                      {/* Header */}
                      <div className="border-border border-b bg-muted/30 px-6 py-4">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="rounded-full bg-foreground px-3 py-1 font-mono font-semibold text-background text-sm">
                            {release.version.includes("v")
                              ? release.version
                              : `v${release.version}`}
                          </span>
                          <span className="text-muted-foreground text-sm">
                            {release.date}
                          </span>
                          {index === 0 && (
                            <span className="rounded-full border border-orange-500/40 px-2 py-0.5 font-mono text-[10px] text-orange-500 uppercase tracking-[0.12em]">
                              Latest
                            </span>
                          )}
                        </div>
                        <h3 className="mt-2 font-heading font-semibold text-lg tracking-tight">
                          {release.title}
                        </h3>
                      </div>

                      {/* Items */}
                      <div className="p-6">
                        <ul className="space-y-2">
                          {release.items.map((item, itemIndex) => (
                            <li
                              className="flex items-start gap-3 text-sm"
                              key={itemIndex}
                            >
                              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Origin card - where it all began */}
          <div className="relative mt-12 pl-16">
            {/* Line connecting from releases to lightbulb center */}
            <div className="-top-12 absolute left-[24px] h-[72px] w-[1.5px] bg-border" />

            {/* Timeline terminator dot - covers end of line */}
            <div className="absolute left-0 flex size-12 items-center justify-center rounded-full bg-background">
              <div className="flex size-10 items-center justify-center rounded-full border border-border bg-card text-muted-foreground">
                <Lightbulb className="size-5" />
              </div>
            </div>

            {/* Content */}
            <div className="overflow-hidden rounded-xl border border-border border-dashed bg-muted/20">
              <div className="px-6 py-5">
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground text-sm">
                    October 30th, 2025
                  </span>
                </div>
                <h3 className="mt-2 font-heading font-semibold text-lg tracking-tight">
                  The Idea
                </h3>
                <p className="mt-2 text-muted-foreground text-sm">
                  What if deploying email infrastructure to AWS was as simple as
                  one command? No vendor lock-in, no markup on AWS pricing, just
                  great developer experience.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
