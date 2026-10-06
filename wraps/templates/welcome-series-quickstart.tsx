import {
  A,
  Code,
  DarkCta,
  Figure,
  H1,
  Kicker,
  P,
  Panel,
  SetupTrack,
  Shell,
  Small,
  Step,
  Terminal,
} from "./_components/site-kit";

// -- Metadata --

export const subject = "You haven't connected AWS yet. Here's the short path.";
export const emailType = "transactional" as const;
export const previewText =
  "Deploy, verify a domain, send a test. The slow part is DNS and the SES sandbox, not the deploy.";

// -- Test Data (for preview) --

export const testData = {
  firstName: "Jane",
  unsubscribeUrl: "https://wraps.dev/unsubscribe",
  preferencesUrl: "https://app.wraps.dev/preferences",
};

// -- Template --

type Props = {
  firstName: string;
  unsubscribeUrl: string;
  preferencesUrl: string;
};

export default function WelcomeSeriesQuickstart({
  unsubscribeUrl,
  preferencesUrl,
}: Props) {
  return (
    <Shell
      preferencesUrl={preferencesUrl}
      preview={previewText}
      unsubscribeUrl={unsubscribeUrl}
    >
      <Kicker>Quickstart</Kicker>

      <H1>Three steps, then you&apos;re sending.</H1>

      <P>
        {"{{#if firstName}}{{firstName}}, you{{else}}You{{/if}}"} signed up
        yesterday but haven&apos;t connected AWS yet. This is the whole path
        from here to a real send.
      </P>

      <SetupTrack
        current={0}
        steps={["Connect AWS", "Verify a domain", "First send"]}
      />

      <Step number={1} title="Connect AWS">
        <A href="https://wraps.dev/docs/quickstart">wraps email init</A> asks
        for your sending domain, then creates the SES configuration set, the
        event pipeline, and the IAM roles in your account. If your DNS is on
        Route 53 or a provider it supports, it writes the DKIM records too.
        Nothing existing gets modified. Every resource it makes carries a{" "}
        <Code>wraps-email-</Code> prefix.
      </Step>

      <Step number={2} title="Verify a domain">
        Verification waits on DNS propagation, which nobody can rush. Usually
        minutes, sometimes longer. Check it with the verify command below, or
        watch the status flip on the Domains page.
      </Step>

      <Figure
        alt="The Sending Domains page with notify.acme.dev pending verification, and its detail sheet listing the three DKIM CNAME records to publish"
        height={310}
        src="https://wraps.dev/email/2026-09-dashboard-domains-clip.png"
      />

      <Step number={3} title="First send">
        <Code>wraps email test</Code> offers the SES simulator first. It works
        in the sandbox and doesn&apos;t touch your sending reputation, so
        it&apos;s the fastest way to prove the whole path end to end.
      </Step>

      <Terminal
        lines={[
          { kind: "command", text: "npx @wraps.dev/cli email init" },
          {
            kind: "command",
            text: "npx @wraps.dev/cli email domains verify -d yourdomain.com",
          },
          { kind: "success", text: "✓ Domain verified" },
          { kind: "command", text: "npx @wraps.dev/cli email test" },
        ]}
      />

      <Panel label="Other ways in">
        <P>
          No terminal? The dashboard deploys the same stack from your browser
          with CloudFormation. Already sending through SES? Run{" "}
          <Code>wraps email connect</Code> instead of <Code>init</Code>. It
          adopts what you have rather than deploying a second stack.
        </P>
      </Panel>

      <P>
        Start your production access request today too. A new SES account can
        only send to verified addresses until AWS approves it, and that takes
        hours to days. The form is in the dashboard.
      </P>

      <DarkCta
        ctaHref="https://app.wraps.dev"
        ctaText="Connect your AWS account"
        description="Pick the CLI or the browser deploy. The dashboard walks you through either."
        title="Pick up where you left off"
      />

      <Small>
        Stuck on a specific error? Reply with what the CLI printed and I&apos;ll
        tell you what it means. &mdash; Jarod
      </Small>
    </Shell>
  );
}
