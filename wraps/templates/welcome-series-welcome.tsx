import { Section, Text } from "@react-email/components";
import {
  A,
  DarkCta,
  H1,
  Kicker,
  P,
  Shell,
  Small,
  StatGrid,
  Terminal,
} from "./_components/site-kit";
import { text } from "./_components/style-guide";

// -- Metadata --

export const subject = "Welcome to Wraps, {{firstName|there}}";
export const emailType = "transactional" as const;
export const previewText =
  "One command deploys sending infrastructure into your own AWS account. Here's where to start.";

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
        {"{{#if firstName}}Hey {{firstName}} — thanks{{else}}Thanks{{/if}}"} for
        signing up. Wraps is the platform layer on top of Amazon SES:
        automations, templates, broadcasts, and a TypeScript SDK, with the
        sending itself running inside your own AWS account. You pay AWS directly
        for delivery. We charge for the tooling, not the infrastructure.
      </P>

      <P>
        The whole first step is one command. It provisions SES, DynamoDB,
        Lambda, EventBridge, and the IAM roles they need, then hands you back a
        deployment you own.
      </P>

      <Terminal
        lines={[
          { kind: "command", text: "npx @wraps.dev/cli email init" },
          { kind: "output", text: "Deploying to us-east-1..." },
          { kind: "success", text: "✓ SES identity verified" },
          { kind: "success", text: "✓ DKIM, SPF, DMARC configured" },
          { kind: "success", text: "✓ Event tracking pipeline deployed" },
          { kind: "output", text: "Ready to send. Run: wraps email status" },
        ]}
      />

      <StatGrid
        stats={[
          { value: "~2 min", label: "typical first deploy" },
          { value: "$0.10", label: "per 1k emails, paid to AWS" },
          { value: "0", label: "credentials we store" },
        ]}
      />

      <Section style={{ marginTop: "8px" }}>
        <Text style={text.body}>
          Two things worth knowing before you start. If your AWS account is new
          to SES, it begins in the sandbox, which means you can only send to
          addresses you have verified. Getting production access is AWS&apos;s
          call, not ours, and it takes anywhere from a few hours to a few days.
          And AWS now defaults new accounts to the $0.16 per 1,000 pricing plan
          rather than $0.10 —{" "}
          <A href="https://wraps.dev/docs/cli-reference">wraps email plan</A>{" "}
          shows you which one you are on.
        </Text>
      </Section>

      <DarkCta
        ctaHref="https://app.wraps.dev"
        ctaText="Open the dashboard"
        description="Follow the setup checklist, or run the CLI and let the dashboard catch up."
        title="Ready when you are"
      />

      <Small>
        I&apos;ll send a short quickstart in a couple of hours. If something is
        already in your way, just reply to this — it reaches me, and I read all
        of them. &mdash; Jarod
      </Small>
    </Shell>
  );
}
