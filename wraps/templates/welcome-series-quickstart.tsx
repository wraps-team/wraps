import {
  A,
  Code,
  DarkCta,
  H1,
  Kicker,
  P,
  Panel,
  Rule,
  Shell,
  Small,
  Step,
  Terminal,
} from "./_components/site-kit";

// -- Metadata --

export const subject = "The short version of getting Wraps running";
export const emailType = "transactional" as const;
export const previewText =
  "Three commands to a verified domain and a first send. The slow part is DNS, not the deploy.";

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

      <H1>Three commands, then you&apos;re sending.</H1>

      <P>
        {"{{#if firstName}}{{firstName}}, this{{else}}This{{/if}}"} is the whole
        path from a fresh account to a real send. Everything runs against your
        AWS credentials, so you need a terminal and an AWS account you can
        deploy to.
      </P>

      <Rule />

      <Step number={1} title="Deploy the infrastructure">
        <A href="https://wraps.dev/docs/quickstart">wraps email init</A> creates
        the SES configuration set, the event pipeline, and the IAM roles in your
        account. Nothing existing gets modified — every resource it makes
        carries a <Code>wraps-email-</Code> prefix.
      </Step>

      <Step number={2} title="Add and verify a domain">
        You get DKIM records to paste into your DNS. Verification is usually
        quick, but propagation is the one step nobody can rush, so start it
        before you need it.
      </Step>

      <Step number={3} title="Send something to yourself">
        <Code>wraps email test</Code> proves the whole path end to end. In the
        sandbox it can only reach addresses you have already verified, which is
        why your own is the right first target.
      </Step>

      <Terminal
        lines={[
          { kind: "command", text: "npx @wraps.dev/cli email init" },
          {
            kind: "command",
            text: "npx @wraps.dev/cli email domains add -d yourdomain.com",
          },
          {
            kind: "command",
            text: "npx @wraps.dev/cli email domains verify -d yourdomain.com",
          },
          { kind: "success", text: "✓ Domain verified" },
          { kind: "command", text: "npx @wraps.dev/cli email test" },
        ]}
      />

      <Panel label="Already have SES set up">
        <P>
          If your AWS account is already sending through SES, skip{" "}
          <Code>init</Code> and run <Code>wraps email connect</Code> instead. It
          adopts what you have rather than deploying a second stack alongside
          it.
        </P>
      </Panel>

      <P>
        From there the SDK is four lines. Install{" "}
        <A href="https://wraps.dev/docs/sdk-reference">@wraps.dev/email</A>,
        construct a <Code>WrapsEmail</Code> client, and <Code>send()</Code> does
        the rest. Credentials resolve the same way the AWS CLI resolves them, so
        there is nothing to paste into an env file.
      </P>

      <DarkCta
        ctaHref="https://wraps.dev/docs/quickstart"
        ctaText="Read the quickstart"
        description="The full walkthrough, including the AWS permissions each command needs."
        title="Every step, written out"
      />

      <Small>
        Stuck on a specific error? Reply with what the CLI printed and I&apos;ll
        tell you what it means. &mdash; Jarod
      </Small>
    </Shell>
  );
}
