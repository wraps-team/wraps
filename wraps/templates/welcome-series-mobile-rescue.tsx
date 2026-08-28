import {
  H1,
  Kicker,
  P,
  Panel,
  SecondaryButton,
  Shell,
  Small,
  Terminal,
} from "./_components/site-kit";

// -- Metadata --

export const subject = "you can't run this one from your phone";
export const emailType = "marketing" as const;
export const previewText =
  "Setup needs a terminal. Keep this email — the command is in it.";

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

export default function WelcomeSeriesMobileRescue({
  unsubscribeUrl,
  preferencesUrl,
}: Props) {
  return (
    <Shell
      preferencesUrl={preferencesUrl}
      preview={previewText}
      unsubscribeUrl={unsubscribeUrl}
    >
      <Kicker>Pick this up later</Kicker>

      <H1>This one needs a terminal.</H1>

      <P>
        {"{{#if firstName}}{{firstName}}, you{{else}}You{{/if}}"} signed up but
        haven&apos;t deployed anything yet, and there is a decent chance
        that&apos;s because you signed up on a phone. Fair enough. Wraps
        provisions infrastructure into your own AWS account, and that step wants
        a shell and credentials, neither of which a phone is good at.
      </P>

      <P>
        So: nothing to do right now. Keep this email, and when you&apos;re back
        at a machine with the AWS CLI already working, it&apos;s one command.
      </P>

      <Terminal
        lines={[
          { kind: "command", text: "npx @wraps.dev/cli email init" },
          { kind: "output", text: "Deploying to us-east-1..." },
          { kind: "success", text: "✓ Infrastructure deployed" },
        ]}
      />

      <Panel label="What you can do from here">
        <P>
          The dashboard works fine on a phone for everything that isn&apos;t
          deployment. You can write templates, look at contacts, and read the
          docs now, then deploy later.
        </P>
      </Panel>

      <SecondaryButton href="https://wraps.dev/docs/quickstart">
        Read the quickstart
      </SecondaryButton>

      <Small>&mdash; Jarod</Small>
    </Shell>
  );
}
