import {
  A,
  Code,
  DarkCta,
  Figure,
  H1,
  H2,
  Kicker,
  P,
  Panel,
  Rule,
  Shell,
  Small,
  StatGrid,
  Terminal,
} from "./_components/site-kit";

// -- Metadata --

export const subject =
  "July + August — AWS repriced SES, ask mode, broadcast recovery";
export const emailType = "marketing" as const;
export const previewText =
  "AWS now defaults SES accounts to a plan that costs 60% more per email, and nothing on your bill says so. Plus: ⌘K answers questions, broadcasts you can test and resume, and one wraps doctor.";

// -- Test Data (for preview) --

export const testData = {
  unsubscribeUrl: "https://wraps.dev/unsubscribe",
  preferencesUrl: "https://app.wraps.dev/preferences",
};

// -- Template --

type Props = {
  unsubscribeUrl: string;
  preferencesUrl: string;
};

export default function JulyAugustUpdateEmail({
  unsubscribeUrl,
  preferencesUrl,
}: Props) {
  return (
    <Shell
      preferencesUrl={preferencesUrl}
      preview={previewText}
      unsubscribeUrl={unsubscribeUrl}
    >
      <Figure
        alt="A Wraps card reading: July + August 2026 — 19 releases, one price change. The price change is AWS's. No line item names it."
        height={240}
        src="https://wraps.dev/email/2026-08-two-months.png"
      />

      <H1>Two months in one issue.</H1>

      <P>
        July and August came to 461 commits and 19 CLI releases, including a
        major version. The item worth reading first is not ours: AWS changed how
        SES is priced in July, and it shows up on your bill before it shows up
        anywhere else.
      </P>

      <StatGrid
        stats={[
          { value: "461", label: "commits across July and August" },
          { value: "19", label: "CLI releases" },
          { value: "v3.4.0", label: "where the CLI landed" },
        ]}
      />

      <Rule />

      <Kicker>Your AWS bill</Kicker>

      <H2>AWS repriced SES. Check which plan you are on.</H2>

      <P>
        On July 21 AWS added pricing plans to SES. À la carte, the pricing
        everyone was on, is $0.10 per 1,000 emails. New accounts now default to
        Essentials at $0.16, and so do accounts with no metered SES activity
        since June 2025. That is 60% more per email, the plan is set per account
        and per Region, and no line item on your bill names the difference.
      </P>

      <P>
        <Code>wraps email plan</Code> reports the plan for every Region you have
        deployed to, prices each option against your real send volume, and names
        the cheaper one if there is one.
      </P>

      <Terminal
        lines={[
          { kind: "command", text: "wraps email plan" },
          { kind: "output", text: "us-east-1 · account 123456789012" },
          { kind: "output", text: "Current plan: Essentials" },
          { kind: "output", text: "Essentials · $0.16/1K · $8.00/mo" },
          {
            kind: "output",
            text: "À la carte · $0.10/1K · $5.00/mo · cheapest",
          },
          {
            kind: "success",
            text: "Recommendation: switch to À la carte, ~$36.00/yr",
          },
        ]}
      />

      <P>
        It is read-only by default. <Code>--set</Code> switches plans and always
        asks for a confirmation naming the Region and the account first, and it
        will not guess a Region for a multi-Region account. Every row carries a
        per-1K rate, because at low volume both plans round to $0.00 a month and
        the gap only becomes legible as a rate.
      </P>

      <Rule />

      <Kicker>Dashboard</Kicker>

      <H2>⌘K answers questions now.</H2>

      <P>
        Type two or more characters in the command palette and pick &ldquo;Ask
        Wraps&rdquo; to get a setup-status card, an email-metrics card, or a
        recent-sends list, streamed as it resolves. Setup also gained a card
        that names the single thing blocking you, and that choice is
        deterministic rather than generated: a first send comes before
        requesting production access, because a sandboxed account can already
        send to verified recipients and the mailbox simulator.
      </P>

      <P>
        The assistant reads through a read-only tool layer. Each tool closes
        over the organization ID of the authenticated request, so it is never
        something the model can supply, projects an explicit field allowlist
        that excludes secrets, PII, and raw metadata, and is filtered by your
        role before the model is offered it at all. Where copy is generated,
        only numbers and closed enums cross into the prompt, and the result is
        validated against a schema before it renders.
      </P>

      <Rule />

      <Kicker>Broadcasts</Kicker>

      <H2>Test it, watch it, recover it.</H2>

      <P>
        Send a test before committing to the whole list: one rendered copy to
        one address, using a real contact from the selected audience and the
        same variable mappings the batch sender resolves, so what arrives is
        what the broadcast would send. It records nothing, so your counters stay
        clean.
      </P>

      <P>
        While it sends, the detail page shows results per recipient: address,
        status, error, and SES bounce type, filtered to the failures by default
        and exportable to CSV. A send that stalls or fails can be resumed from
        that same page. History paginates and searches server-side over name and
        subject, with the status filter in the URL, so a view survives a reload
        and can be handed to a colleague mid-send.
      </P>

      <Figure
        alt="A broadcast finishing, with the delivery funnel filling in from sent through delivered, opened, and clicked"
        caption="A completed broadcast, on its detail page"
        height={404}
        src="https://wraps.dev/email/2026-08-broadcast-send.gif"
        width={535}
      />

      <Panel label="Broadcasts of any size">
        <P>
          Send to a list bigger than a single day&rsquo;s SES quota and Wraps
          spreads it across as many days as it takes. The confirm dialog shows
          the estimated number of days up front and folds in any other
          broadcasts competing for the same quota. A per-AWS-account daily
          reserve keeps headroom for your transactional mail, so a big campaign
          and your password resets coexist.
        </P>
      </Panel>

      <Rule />

      <Kicker>Emails and audiences</Kicker>

      <H2>Numbers you can reconcile.</H2>

      <P>
        Dashboard totals now come from Wraps&rsquo; own record of what it sent,
        so what you see is your Wraps mail and nothing else. Opens and clicks
        are unique per message: a recipient who opens the same email three times
        counts once, so your open rate reflects people rather than events.
        Account-level SES reputation sits alongside it, labelled as
        account-wide, so both readings are on the page and you know which is
        which.
      </P>

      <P>
        Segment and topic counts are computed the way the send path counts, and
        they respect channel eligibility, so the number on the screen is the
        number of people who will receive the send. Bounced, complained, and
        unsubscribed contacts are held out of it, and double-opt-in pending
        subscribers get their own count, so you can see who is one confirmation
        away.
      </P>

      <P>
        The emails page pages through your entire send history with cursor
        pagination, and search runs server-side across recipient, subject, and
        sender using the same query as browsing. Filters, sort, and time range
        live in the URL, and CSV export pages through up to 10,000 matching rows
        and tells you when it hits the cap.
      </P>

      <Rule />

      <Kicker>CLI</Kicker>

      <H2>One doctor, and remediations you can run.</H2>

      <P>
        <Code>wraps doctor</Code> merges the AWS and email doctors into one
        report and one exit code, and <Code>--json</Code> carries structured
        remediations for MCP and agent callers. Every finding names the command
        that repairs it, drawn from one registry, and that command carries the
        Region the doctor actually scanned, so a fix you paste runs against the
        account you meant. Checks with no automatic repair say so rather than
        guessing.
      </P>

      <Panel label="If you self-host">
        <P>
          Self-hosting is one path now: the SST full platform via{" "}
          <Code>pnpm selfhost:deploy</Code>, with one way to deploy and one way
          to upgrade. CLI v3.0 retires the older Pulumi variant, so if you are
          still on it, that is your move. Your <Code>wraps selfhost</Code>{" "}
          commands are unchanged, <Code>wraps selfhost logs</Code> streams
          CloudWatch straight to your terminal, and API commands go to the
          control plane you signed in to.
        </P>
      </Panel>

      <Rule />

      <Kicker>Also shipped</Kicker>

      <P>
        <Code>wraps email check</Code> reports BIMI: record status, logo and VMC
        validation, and which inboxes need a VMC rather than a self-asserted
        logo. A notification bell in the dashboard surfaces SES health, billing,
        team, and send events, built on{" "}
        <A href="https://github.com/better-inbox/better-inbox">better-inbox</A>{" "}
        rather than a third-party service. The preference center is themeable,
        with contrast checking so a brand color cannot ship unreadable text.
      </P>

      <P>
        Every API error body now carries a stable enumerated code and a request
        ID, the OpenAPI spec declares that shape on every operation, and
        rate-limited responses gained the standard <Code>RateLimit-*</Code>{" "}
        headers alongside the originals. <Code>eventTracking.events</Code> now
        controls exactly which event types your deployment sends to SES.
        Recipient IP addresses from open and click events are no longer stored,
        and the columns are dropped.
      </P>

      <DarkCta
        ctaHref="https://wraps.dev/changelog"
        ctaText="Read the changelog"
        description="Sixteen releases across July and August, in the order they shipped."
        title="Everything, in full"
      />

      <Small>
        If <Code>wraps email plan</Code> turns up something expensive, or the
        numbers on your dashboard are not what you expected, reply to this email
        and I will look at your account. &mdash; Jarod
      </Small>
    </Shell>
  );
}
