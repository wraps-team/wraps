import {
  Code,
  DarkCta,
  Figure,
  H1,
  H2,
  Kicker,
  P,
  Panel,
  Rule,
  SecondaryButton,
  Shell,
  Small,
  StatGrid,
  Terminal,
} from "./_components/site-kit";

// -- Metadata --

export const subject =
  "October — find out what is behind your bounces, edit a scheduled broadcast, and drive Wraps from an agent";
export const emailType = "marketing" as const;
export const previewText =
  "The Deliverability tab takes a bounce rate from a number to the broadcast, the receiver and the addresses behind it, and lets you suppress them from the same page.";

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

export default function OctoberUpdateEmail({
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
        alt="A dark Wraps card reading: See who is behind your bounces. The Deliverability tab rates your sending and lists the addresses to suppress."
        height={240}
        src="https://wraps.dev/email/2026-10-deliverability-tab.png"
      />

      <H1>From a bounce rate to the reason behind it.</H1>

      <P>
        October was 191 commits and 7 CLI releases, v3.17.0 through v3.18.0. The
        biggest change is on the Emails page. A bounce rate used to be a number
        you watched. Now you can follow it to the broadcast, the receiver and
        the addresses that caused it, and suppress them without leaving the
        page.
      </P>

      <Panel label="First, an apology">
        <P>
          Some of our alerts repeated every day for as long as the problem
          lasted. A role behind the current Wraps policy, an account past the
          SES review line or near its sending quota, a paused broadcast, a run
          of failed sends: each put a new notice in your Wraps inbox daily, and
          since October 27, when notifications started going out by email, a new
          email too. The first alert was useful and the rest were noise. That
          was our bug, and I am sorry.
        </P>
        <P>
          As of October 30, an alert fires once, when the problem starts, and
          again only if it clears and comes back. The role alert fires once for
          each policy version we ship and names both versions. The banner on an
          account&rsquo;s Connection tab stays until the role is updated, and{" "}
          <Code>wraps platform update-role</Code> clears it at the next hourly
          check.
        </P>
      </Panel>

      <StatGrid
        stats={[
          { value: "191", label: "commits in October" },
          { value: "7", label: "CLI releases" },
          { value: "v3.18.0", label: "where the CLI landed" },
        ]}
      />

      <Rule />

      <Kicker>Deliverability</Kicker>

      <H2>Follow a bad rate to the sends behind it.</H2>

      <P>
        Emails is now one page with three tabs, Activity, Engagement and
        Deliverability, under one date range. The Deliverability tab opens on a
        verdict: Healthy, Watch once your bounce or complaint rate passes half
        of the SES review line, or At risk at the line itself. It grades the
        reputation rate SES publishes for your account, the number AWS reviews
        you on, and waits for 100 sends before it rates anything.
      </P>

      <P>
        Under the verdict is the rate&rsquo;s trend against the review line.
        Click a day on the chart and the breakdown below narrows to that day.
      </P>

      <Figure
        alt="A looping clip of the Deliverability tab with example data: a win-back broadcast at an 8% bounce rate, red against the 5% SES review line, then the Bounces card with its top reasons marked hard or soft, then Addresses to review, where Suppress all 5 adds five example addresses to the suppression list."
        caption="Example data"
        height={480}
        src="https://wraps.dev/email/2026-10-deliverability-clip.gif"
      />

      <H2>What drove it, and why it bounced.</H2>

      <P>
        &ldquo;What&rsquo;s driving your bounce rate&rdquo; breaks the window
        down by broadcast, workflow, template or from address. Each bar runs to
        twice the review line with a tick at the line, so the one broadcast that
        went to an old list stands out at a glance. Switch to Changes to see
        what happened around the spike instead: a broadcast started, contacts
        imported, an automation turned on, sender defaults changed, each with
        the rate before and after.
      </P>

      <P>
        Beside it, the Bounces card says what SES rejected, and why: your top
        five reasons in plain words, like &ldquo;Recipient account does not
        exist&rdquo; or &ldquo;Recipient inbox is full&rdquo;, each marked hard
        or soft, with its count. SES suppresses hard bounces for you. Repeat
        soft bounces it does not, so they keep counting against you. Complaints
        get the same card. Bounces from before late October show a broader
        category, because detailed reasons were not recorded yet.
      </P>

      <H2>Then suppress the addresses.</H2>

      <P>
        Addresses to review lists the ones SES is not suppressing yet: anyone
        who complained, hard bounced, or soft bounced on three or more days
        since their last delivery. Suppress one, suppress them all after a
        confirmation, or add an address by hand. The Suppressed tab next to it
        is the SES suppression list, where you can take an address back off.
      </P>

      <P>
        Contacts that soft bounce now show <Code>soft_bounced</Code> and stay
        sendable. A third soft bounce on a separate day marks the contact{" "}
        <Code>bounced</Code>, and a delivery clears it. If you read{" "}
        <Code>emailStatus</Code> from the API or <Code>@wraps.dev/client</Code>{" "}
        v0.13.0, handle the new value.
      </P>

      <Panel label="If you connected before CLI v3.18.0">
        <P>
          Adding an address to the suppression list needs a permission your
          console role may not have yet. Run{" "}
          <Code>wraps platform update-role</Code> on CLI v3.18.0, or update the
          console access stack if you connected with CloudFormation. CDK 0.3.0+
          and Pulumi 0.4.0+ already grant it. Until you update, listing and
          removing suppressions still work.
        </P>
      </Panel>

      <SecondaryButton href="https://wraps.dev/docs/guides/suppression-lists">
        Suppression lists guide
      </SecondaryButton>

      <Rule />

      <Kicker>Broadcasts</Kicker>

      <H2>Edit a scheduled broadcast before it sends.</H2>

      <P>
        A scheduled broadcast used to be fixed until you cancelled it. Now Edit
        on a scheduled email broadcast opens it again, so you can fix the from
        address, change the content or move the send time. Edits close a minute
        before the send and once sending starts. The API takes the same edit as{" "}
        <Code>PATCH /v1/batch/:id</Code>, and broadcast times now show in your
        own time zone.
      </P>

      <P>
        Broadcasts to all contacts are now on Free. Pro adds topics, segments
        and scheduling. Every broadcast now carries a one-click unsubscribe,
        whatever its template&rsquo;s type.
      </P>

      <Rule />

      <Kicker>Agents</Kicker>

      <H2>Everything the dashboard does, from the CLI and API.</H2>

      <P>
        An agent with an API key can now do most of what you do in the
        dashboard. The CLI gained commands for contacts, segments, broadcasts,
        workflows, templates, topics, events, suppressions and audit logs, plus
        API key management, which needs a signed-in session rather than a key.
        Each takes <Code>--json</Code> and <Code>--token</Code>, lists page with{" "}
        <Code>--cursor</Code>, and anything that changes data asks for{" "}
        <Code>--yes</Code>.
      </P>

      <Terminal
        lines={[
          { kind: "command", text: "wraps email health --json" },
          { kind: "command", text: "wraps email suppressions list --json" },
          {
            kind: "command",
            text: "wraps broadcasts status <id> --json",
          },
        ]}
      />

      <P>
        Behind them are new API routes for topics, suppressions, events, bulk
        contact import and export, workflow runs and audit logs. A route that
        changes data checks the same role permissions the dashboard does.
      </P>

      <SecondaryButton href="https://wraps.dev/docs/cli-reference">
        CLI reference
      </SecondaryButton>

      <Rule />

      <Kicker>Also shipped</Kicker>

      <P>
        <Code>wraps email templates push</Code> now checks the dashboard first
        and skips any template a teammate edited there since your last push,
        unless you pass <Code>--force</Code>. Workflow push keeps a paused
        workflow paused, and both exit non-zero on failure so CI stops where it
        should. The dashboard meets WCAG 2.2 AAA contrast in light and dark
        themes, and now shares wraps.dev&rsquo;s type, labelled panels and ruled
        tables.
      </P>

      <P>
        We also closed a set of security gaps: the API rejects IDs from another
        organization on <Code>POST /v1/batch</Code>, the webhook secret for an
        AWS account no longer reaches the browser, and a workflow webhook step
        can no longer be pointed at a private, reserved or multicast address.
      </P>

      <DarkCta
        ctaHref="https://wraps.dev/changelog"
        ctaText="Read the changelog"
        description="Every October entry, in the order it shipped."
        title="Everything, in full"
      />

      <Small>
        If the Deliverability tab shows you something you cannot explain, reply
        with a screenshot and I will help you work out what it is. &mdash; Jarod
      </Small>
    </Shell>
  );
}
