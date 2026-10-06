import {
  DarkCta,
  Figure,
  H1,
  Kicker,
  P,
  Panel,
  SetupTrack,
  Shell,
  Small,
  StatGrid,
} from "./_components/site-kit";

// -- Metadata --

export const subject = "Welcome to Wraps, {{firstName|there}}";
export const emailType = "transactional" as const;
export const previewText =
  "Three steps to your first send. The first one is a single command.";

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

export default function WelcomeSeriesWelcome({
  unsubscribeUrl,
  preferencesUrl,
}: Props) {
  return (
    <Shell
      preferencesUrl={preferencesUrl}
      preview={previewText}
      unsubscribeUrl={unsubscribeUrl}
    >
      <Kicker>Welcome to Wraps</Kicker>

      <H1>Email that sends through your AWS.</H1>

      <P>
        {"{{#if firstName}}Hey {{firstName}}, thanks{{else}}Thanks{{/if}}"} for
        signing up. Wraps runs your email on Amazon SES inside your own AWS
        account. You pay AWS for sending. We charge for the tooling on top:
        templates, workflows, broadcasts, and the SDK.
      </P>

      <P>Three steps get you from here to a first send.</P>

      <SetupTrack
        current={0}
        steps={["Connect AWS", "Verify a domain", "First send"]}
      />

      <P>
        Step one is one command. It deploys the whole stack into your account
        and touches nothing that is already there.
      </P>

      <Figure
        alt="A terminal running npx @wraps.dev/cli email init. It deploys an IAM role, an SES configuration set, an EventBridge rule, a Lambda and a DynamoDB table, then sets up DKIM, SPF and DMARC for the domain."
        caption="npx @wraps.dev/cli email init"
        height={430}
        href="https://wraps.dev/docs/quickstart"
        src="https://wraps.dev/email/2026-10-welcome-deploy-cli-552.gif"
      />

      <P>
        No terminal handy? The dashboard deploys the same stack from your
        browser with CloudFormation. No Node.js, no local credentials.
      </P>

      <StatGrid
        stats={[
          { value: "~2 min", label: "typical first deploy" },
          { value: "$0.16", label: "per 1k emails on AWS's default plan" },
          { value: "0", label: "credentials we store" },
        ]}
      />

      <Panel label="Start this on day one">
        <P>
          New SES accounts begin in the sandbox, where you can only send to
          addresses you have verified. AWS decides when you get out, and it can
          take a few hours or a few days. The dashboard has a production access
          form that tells you what AWS wants to see. File it as soon as you
          deploy, not the day you need to send.
        </P>
      </Panel>

      <DarkCta
        ctaHref="https://app.wraps.dev"
        ctaText="Connect your AWS account"
        description="Pick the CLI or the browser deploy. The dashboard walks you through either."
        title="Start with step one"
      />

      <Small>
        If something is already in your way, reply to this. It reaches me, and I
        read all of them. &mdash; Jarod
      </Small>
    </Shell>
  );
}
