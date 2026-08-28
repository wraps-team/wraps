import {
  A,
  DarkCta,
  H1,
  Kicker,
  P,
  Rule,
  Shell,
  Small,
  StatGrid,
} from "./_components/site-kit";

// -- Metadata --

export const subject = "you're sending — here's what you'll hear from us";
export const emailType = "marketing" as const;
export const previewText =
  "Product updates about once a month, and nothing else. Unsubscribe any time.";

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

export default function WelcomeSeriesProductUpdates({
  unsubscribeUrl,
  preferencesUrl,
}: Props) {
  return (
    <Shell
      preferencesUrl={preferencesUrl}
      preview={previewText}
      unsubscribeUrl={unsubscribeUrl}
    >
      <Kicker>What&apos;s next</Kicker>

      <H1>You&apos;re live. This is the last onboarding email.</H1>

      <P>
        {"{{#if firstName}}Nice work, {{firstName}}. You{{else}}You{{/if}}"}{" "}
        have infrastructure deployed and mail moving through your own AWS
        account. Everything from here is yours: if you stopped paying us
        tomorrow, that stack keeps sending.
      </P>

      <StatGrid
        stats={[
          { value: "Yours", label: "the SES stack we deployed" },
          { value: "Direct", label: "how you pay AWS for delivery" },
          { value: "AGPLv3", label: "the CLI, SDK, and dashboard" },
        ]}
      />

      <P>
        I&apos;ve moved you onto product updates, which go out roughly once a
        month and only when something actually shipped. No drip sequence, no
        re-engagement campaign, no &ldquo;we noticed you haven&apos;t logged
        in.&rdquo; If a monthly note is still one too many, the{" "}
        <A href={preferencesUrl}>preferences link</A> turns it off without
        touching your account.
      </P>

      <Rule />

      <P>
        Two things worth doing now that you&apos;re sending for real. Watch your
        bounce and complaint rates in the dashboard — SES enforces thresholds on
        both, and reputation is the one thing we cannot deploy for you. And read{" "}
        <A href="https://wraps.dev/docs/guides/bounce-handling">
          how bounces are handled
        </A>{" "}
        so you know what the automatic suppression is doing on your behalf.
      </P>

      <DarkCta
        ctaHref="https://wraps.dev/changelog"
        ctaText="See what shipped"
        description="Everything we've released, in the order we released it."
        title="The changelog"
      />

      <Small>
        Feature requests and complaints both go to the same place: reply to this
        email. &mdash; Jarod
      </Small>
    </Shell>
  );
}
