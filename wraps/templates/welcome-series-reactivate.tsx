import {
  A,
  Code,
  H1,
  Kicker,
  P,
  Panel,
  SecondaryButton,
  Shell,
  Small,
} from "./_components/site-kit";

// -- Metadata --

export const subject = "what stopped you?";
export const emailType = "marketing" as const;
export const previewText =
  "The setup usually stalls in one of three places. All three have a short answer.";

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

export default function WelcomeSeriesReactivate({
  unsubscribeUrl,
  preferencesUrl,
}: Props) {
  return (
    <Shell
      preferencesUrl={preferencesUrl}
      preview={previewText}
      unsubscribeUrl={unsubscribeUrl}
    >
      <Kicker>Still setting up?</Kicker>

      <H1>What stopped you?</H1>

      <P>
        {"{{#if firstName}}{{firstName}}, your{{else}}Your{{/if}}"} account is
        open but nothing has been deployed to AWS yet. That is a normal place to
        stall, and in my experience it is one of three things.
      </P>

      <Panel label="If it was AWS credentials">
        <P>
          The CLI resolves credentials the same way the AWS CLI does: SSO
          profile, environment variables, or an assumed role. If{" "}
          <Code>aws sts get-caller-identity</Code> works in your shell, the
          Wraps CLI will work too. There is nothing to paste into our dashboard,
          and we never store a credential.
        </P>
      </Panel>

      <Panel label="If you already run SES">
        <P>
          Skip <Code>init</Code> entirely and run{" "}
          <Code>wraps email connect</Code> instead — it adopts the SES setup
          already in your account rather than deploying a second one next to it.
        </P>
      </Panel>

      <Panel label="If you didn't have an AWS account handy">
        <P>
          That is the honest blocker, and there is no way around it: Wraps sends
          through your AWS, so an AWS account is the one hard requirement. If
          you would rather not own that, a hosted service is the better answer
          and I would rather tell you so than keep emailing.
        </P>
      </Panel>

      <P>
        If it was something else entirely, reply and say what happened. The{" "}
        <A href="https://wraps.dev/docs/quickstart">quickstart</A> is the short
        path if you want to try again from the top.
      </P>

      <SecondaryButton href="https://app.wraps.dev">
        Pick up where you left off
      </SecondaryButton>

      <Small>&mdash; Jarod</Small>
    </Shell>
  );
}
