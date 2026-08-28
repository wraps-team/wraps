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
} from "./_components/site-kit";

// -- Metadata --

export const subject = "the SES sandbox is the part that actually blocks you";
export const emailType = "marketing" as const;
export const previewText =
  "AWS decides when you leave the sandbox. Here's what they look for in the request.";

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

export default function WelcomeSeriesAwsSetup({
  unsubscribeUrl,
  preferencesUrl,
}: Props) {
  return (
    <Shell
      preferencesUrl={preferencesUrl}
      preview={previewText}
      unsubscribeUrl={unsubscribeUrl}
    >
      <Kicker>AWS setup</Kicker>

      <H1>Getting out of the SES sandbox.</H1>

      <P>
        {"{{#if firstName}}{{firstName}}, if{{else}}If{{/if}}"} your dashboard
        shows sends but your recipients see nothing, this is almost always why.
        A new AWS account starts SES in sandbox mode, where the only addresses
        you can deliver to are ones you have verified yourself. It is the most
        common reason a first send appears to succeed and lands nowhere.
      </P>

      <P>
        This is the one part of setup we cannot do for you. Production access is
        AWS&apos;s decision, the review takes anywhere from a few hours to a few
        days, and requests do get denied. What we can do is tell you what a
        request that passes looks like.
      </P>

      <Rule />

      <Step number={1} title="Say what you send and to whom">
        Reviewers want a specific use case, not a category. &ldquo;Transactional
        password resets and receipts to users who created an account on our
        app&rdquo; reads very differently from &ldquo;marketing emails.&rdquo;
      </Step>

      <Step number={2} title="Explain where the addresses come from">
        Name the consent path. Signup form, double opt-in, an imported list from
        a prior provider — a request that skips this is the most commonly
        rejected kind.
      </Step>

      <Step number={3} title="Show that bounces are handled">
        Say that bounces and complaints are processed automatically and that
        suppressed addresses stop receiving mail. That handler ships with{" "}
        <Code>email init</Code> and is already running in your account, so this
        part of the request is true for you today.
      </Step>

      <Panel label="Before you file the request">
        <P>
          Verify your sending domain first and get DKIM passing. A request from
          an account with no verified domain and no send history is a weak
          request, and re-applying after a denial is slower than getting it
          right once.
        </P>
      </Panel>

      <P>
        The request itself is filed in the AWS console, on the SES Account
        Dashboard for the region you deployed to. Our{" "}
        <A href="https://wraps.dev/docs/guides/production-access">
          production access guide
        </A>{" "}
        walks through the form field by field, and the{" "}
        <A href="https://wraps.dev/docs/guides/aws-setup">AWS setup guide</A>{" "}
        covers the permissions and region choices around it.
      </P>

      <DarkCta
        ctaHref="https://wraps.dev/docs/guides/production-access"
        ctaText="Read the guide"
        description="What to write, where to file it, and what to do if AWS says no the first time."
        title="Production access, step by step"
      />

      <Small>
        If you were already denied, send me what AWS wrote back. The rejection
        text usually names the gap, and it is usually fixable. &mdash; Jarod
      </Small>
    </Shell>
  );
}
