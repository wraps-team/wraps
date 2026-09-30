import {
  A,
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
  "September — production access from the CLI, sending domains in the dashboard, and what your SES plan includes";
export const emailType = "marketing" as const;
export const previewText =
  "File for SES production access from your terminal, add and check sending domains in the dashboard, and turn on what your SES plan already includes.";

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

export default function SeptemberUpdateEmail({
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
        alt="A Wraps card reading: September 2026 — Sandbox to sending, in Wraps. Production access, sending domains and suppressions, from the CLI or the dashboard."
        height={240}
        src="https://wraps.dev/email/2026-09-sandbox-to-sending.png"
      />

      <H1>Less time in the AWS console.</H1>

      <P>
        September was 432 commits and 20 CLI releases, v3.5.0 through v3.15.0.
        Most of it takes jobs you used to do in the SES console and puts them in
        Wraps: requesting production access, adding sending domains, checking
        DNS, clearing suppressions, and turning on the features your SES plan
        already includes.
      </P>

      <StatGrid
        stats={[
          { value: "432", label: "commits in September" },
          { value: "20", label: "CLI releases" },
          { value: "v3.15.0", label: "where the CLI landed" },
        ]}
      />

      <Rule />

      <Kicker>Production access</Kicker>

      <H2>Request production access from your terminal.</H2>

      <P>
        A new SES account starts in the sandbox, and it can only send to
        addresses you have verified. <Code>wraps email production-access</Code>{" "}
        shows whether the account is still in the sandbox, the status and case
        ID of AWS&rsquo;s review, and your daily quota. It changes nothing. Add{" "}
        <Code>--request</Code> to file the request with your own AWS
        credentials.
      </P>

      <Terminal
        lines={[
          { kind: "command", text: "wraps email production-access" },
          {
            kind: "command",
            text: "wraps email production-access --request \\",
          },
          {
            kind: "output",
            text: "  --website https://acme.dev --mail-type transactional",
          },
        ]}
      />

      <P>
        The API sends less than the console form does. It has no field for the
        acknowledgment that your recipients opted in and that you handle bounces
        and complaints, so make sure both are true before you file. AWS still
        reviews every request by hand, usually within 24 hours.
      </P>

      <P>
        If you would rather use the console, the sandbox banner in the dashboard
        now opens a dialog that explains each field on AWS&rsquo;s form and
        links to the SES page in your account&rsquo;s own Region. To draft the
        request text first, or to read a denial, the{" "}
        <A href="https://wraps.dev/tools/ses-production-access">
          production access request builder
        </A>{" "}
        takes six answers and writes the case for you. A denial you paste into
        it stays in your browser.
      </P>

      <Rule />

      <Kicker>Dashboard</Kicker>

      <H2>Sending domains and suppressions, without the CLI.</H2>

      <P>
        The new Sending Domains page lists every SES identity with its
        verification state and the DNS records still to publish. You can add a
        domain from the page, and it gets the same per-domain configuration set
        the CLI creates, so opens, clicks and deliveries are tracked from the
        first send.
      </P>

      <Figure
        alt="The Sending Domains page with notify.acme.dev pending verification, and its detail sheet listing the three DKIM CNAME records to publish"
        height={310}
        src="https://wraps.dev/email/2026-09-dashboard-domains-clip.png"
      />

      <P>
        Open a domain to check its DKIM, MAIL FROM and DMARC records against
        live DNS, not the status SES caches. A record that passed before and
        fails now raises a drift alert, so an edit in your DNS provider shows up
        in Wraps. SES never checks DMARC at all.
      </P>

      <P>
        The SES suppression list is in the dashboard too. You can browse it and
        remove an address, and a complaint-reason removal asks you to
        acknowledge it first. The overview now shows your bounce and complaint
        rates next to the lines where AWS reviews and pauses an account, which
        answers the question an SES operator actually has: will this account
        still be sending tomorrow?
      </P>

      <Panel label="If you connected before September">
        <P>
          Suppression management needs permissions your console role may not
          have yet. Run <Code>wraps platform update-role</Code>, redeploy on CDK
          0.3.0+ or Pulumi 0.4.0+, or update the CloudFormation stack. The
          account page tells you when the role is behind.
        </P>
      </Panel>

      <Rule />

      <Kicker>Your SES plan</Kicker>

      <H2>Turn on what your SES plan already includes.</H2>

      <P>
        Last month was about which SES pricing plan you are on. This month is
        about what it includes. Open an AWS account in the dashboard to see its
        plan, how it compares with à la carte at your volume, and the Virtual
        Deliverability Manager recommendations from the hourly health check.
      </P>

      <Terminal
        lines={[
          { kind: "command", text: "wraps email vdm" },
          {
            kind: "command",
            text: "wraps email domains config --auto-validation",
          },
          {
            kind: "command",
            text: "wraps email upgrade --action managed-dedicated-ips",
          },
        ]}
      />

      <P>
        VDM is included on Essentials, Pro and Enterprise. Auto Validation drops
        sends to addresses that fail validation before SES tries them, and
        managed dedicated IPs route your sending through a pool AWS warms and
        scales. Both are included on Pro and Enterprise and billed as add-ons on
        the other plans. The CLI shows the cost on your plan before it changes
        anything, and CDK and Pulumi take <Code>autoValidation</Code> and{" "}
        <Code>managedDedicatedIps</Code>.
      </P>

      <Rule />

      <Kicker>SDK</Kicker>

      <H2>One-click unsubscribe and suppression history.</H2>

      <P>
        <Code>@wraps.dev/email</Code> v0.14.0 lets <Code>send()</Code> set
        custom headers, which is what Gmail and Yahoo need to show their
        unsubscribe button to bulk senders. Set <Code>List-Unsubscribe</Code> to
        your URL and <Code>List-Unsubscribe-Post</Code> to{" "}
        <Code>List-Unsubscribe=One-Click</Code>. Reserved headers like{" "}
        <Code>From</Code> and <Code>Subject</Code> throw before anything is
        sent.
      </P>

      <P>
        v0.15.0 adds <Code>events.getSuppressionHistory(address)</Code>: why an
        address stopped receiving your mail, and when, even after it has left
        the SES suppression list. Run <Code>wraps email sync</Code> on CLI
        v3.15.0, or redeploy on CDK v0.5.0 or Pulumi v0.6.0, to start recording.
        Suppressions from before the redeploy are not backfilled.
      </P>

      <SecondaryButton href="https://wraps.dev/docs/sdk-reference">
        SDK reference
      </SecondaryButton>

      <Rule />

      <Kicker>Guardrails</Kicker>

      <H2>Stops that fire before the damage.</H2>

      <P>
        A running broadcast now pauses when the hourly health check puts the
        account past AWS&rsquo;s pause line, and checks again every 15 minutes
        before sending the next chunk. A broadcast into an account AWS has
        already paused is blocked at the review step.
      </P>

      <P>
        <Code>wraps email destroy</Code> deletes only the DNS records Wraps
        created, matched on name, type and exact value, across Route53,
        Cloudflare and Vercel. <Code>wraps email inbound</Code> refuses to write
        MX or SPF over an existing mail setup.{" "}
        <Code>wraps email doctor --cleanup</Code> only removes resources it has
        proven are orphans. Workflow email sends now claim a record before
        calling SES, so a retry after a crash does not send the same email
        twice.
      </P>

      <Rule />

      <Kicker>Also shipped</Kicker>

      <P>
        API v1.2 puts templates, segments and broadcast batches behind an API
        key, and adds <Code>GET /v1/domains</Code>,{" "}
        <Code>/v1/email/metrics</Code> and <Code>/v1/account/health</Code>.
        Custom tracking domains send open and click links through a host you
        own, with HTTPS via ACM and CloudFront. An agent mailbox&rsquo;s send
        caps and allowlist can be changed after creation with{" "}
        <Code>wraps email agent policy</Code>, and{" "}
        <Code>wraps platform connect --org</Code> runs unattended in CI.
      </P>

      <P>
        Audit logs export to CSV on Business. Contacts can grant and withdraw
        SMS consent from the preference center. And if you are moving off
        SendGrid, Mailgun, Postmark or Resend, there is now a{" "}
        <A href="https://wraps.dev/migrate">migration guide</A> for each,
        including what you lose by switching.
      </P>

      <DarkCta
        ctaHref="https://wraps.dev/changelog"
        ctaText="Read the changelog"
        description="Twelve entries for September, in the order they shipped."
        title="Everything, in full"
      />

      <Small>
        If you are stuck in the sandbox or AWS denied your request, reply with
        the denial and I will help you with the next one. &mdash; Jarod
      </Small>
    </Shell>
  );
}
