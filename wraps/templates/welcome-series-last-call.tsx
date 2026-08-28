import {
  A,
  H1,
  Kicker,
  P,
  Rule,
  SecondaryButton,
  Shell,
  Small,
} from "./_components/site-kit";

// -- Metadata --

export const subject = "last one from me";
export const emailType = "marketing" as const;
export const previewText =
  "Wraps isn't right for everyone, and this is the last automated email either way.";

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

export default function WelcomeSeriesLastCall({
  unsubscribeUrl,
  preferencesUrl,
}: Props) {
  return (
    <Shell
      preferencesUrl={preferencesUrl}
      preview={previewText}
      unsubscribeUrl={unsubscribeUrl}
    >
      <Kicker>Last call</Kicker>

      <H1>I&apos;ll stop after this one.</H1>

      <P>
        {"{{#if firstName}}{{firstName}}, you{{else}}You{{/if}}"} signed up a
        little while back and never deployed. This is the last automated email
        in the sequence, so I would rather use it to be straight with you than
        to pitch again.
      </P>

      <Rule />

      <P>
        Wraps is a good fit if you already have an AWS account, you send enough
        that per-email markup is starting to show up on an invoice, and you want
        the sending stack to be something you own. It is worth the setup for
        those people.
      </P>

      <P>
        It is a bad fit if you don&apos;t want to run AWS. That is not a
        limitation we are working around — sending through your account is the
        entire design. If you never want to see an IAM policy, a hosted service
        like Resend or Postmark will make you happier, and I would rather say
        that than have you churn in two months.
      </P>

      <Rule />

      <P>
        If it was closer to &ldquo;I ran out of time,&rdquo; the door stays
        open. Your account, org, and settings are all still there. The{" "}
        <A href="https://wraps.dev/docs/quickstart">quickstart</A> is about ten
        minutes, and{" "}
        <A href="https://github.com/wraps-team/wraps">
          the whole thing is on GitHub
        </A>{" "}
        if you would rather read the code before trusting it with your AWS
        account.
      </P>

      <SecondaryButton href="https://app.wraps.dev">
        Your account is still here
      </SecondaryButton>

      <Small>
        Either way, thanks for taking a look. If there is a reason you bounced
        that I should know about, one line back would genuinely help. &mdash;
        Jarod
      </Small>
    </Shell>
  );
}
