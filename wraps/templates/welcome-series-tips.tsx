import {
  A,
  Code,
  DarkCta,
  H1,
  H2,
  Kicker,
  P,
  Rule,
  Shell,
  Small,
} from "./_components/site-kit";

// -- Metadata --

export const subject = "four things people miss in their first week";
export const emailType = "marketing" as const;
export const previewText =
  "Deliverability checks, the template editor, suppression lists, and the MCP server.";

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

export default function WelcomeSeriesTips({
  unsubscribeUrl,
  preferencesUrl,
}: Props) {
  return (
    <Shell
      preferencesUrl={preferencesUrl}
      preview={previewText}
      unsubscribeUrl={unsubscribeUrl}
    >
      <Kicker>Tips</Kicker>

      <H1>Four things worth knowing early.</H1>

      <P>
        {
          "{{#if firstName}}You've been poking around, {{firstName}}, so here are{{else}}Here are{{/if}}"
        }{" "}
        the parts of Wraps people tend to find three months in, when they would
        have been more useful on day two.
      </P>

      <Rule />

      <H2>
        1. Audit your own deliverability before a recipient does it for you
      </H2>
      <P>
        <Code>wraps email check</Code> inspects DKIM, SPF, and DMARC on a domain
        and looks it up against the common blacklists. It is the fastest way to
        find out that your DMARC record says <Code>p=none</Code> and has been
        quietly doing nothing.
      </P>

      <H2>2. Templates are React, not a drag-and-drop canvas</H2>
      <P>
        The editor is React Email TSX in Monaco with an AI chat panel beside it.
        That means components, props, and version control if you author them in
        your repo and push with the CLI. The{" "}
        <A href="https://wraps.dev/docs/guides/templates">templates guide</A>{" "}
        covers the variable syntax, which is the one part that trips people up.
      </P>

      <H2>3. Suppression lists are yours, and they live in your account</H2>
      <P>
        Bounces and complaints feed a suppression list on your SES account, not
        on some vendor&apos;s. Sending to a hard-bounced address a second time
        is the single fastest way to hurt a new domain&apos;s reputation, so it
        is worth reading{" "}
        <A href="https://wraps.dev/docs/guides/suppression-lists">
          how the list is managed
        </A>{" "}
        before your first real campaign.
      </P>

      <H2>4. Your agents can send too</H2>
      <P>
        There is an MCP server, so Claude or any MCP client can check setup
        status, send, and read the event log without you writing glue code.{" "}
        <Code>wraps email agent</Code> sets up the scoped credentials for it.
        Worth noting: in the SES sandbox an agent can still only reach verified
        addresses, which is usually the confusing part.
      </P>

      <DarkCta
        ctaHref="https://wraps.dev/docs"
        ctaText="Browse the docs"
        description="Guides for domain verification, bounce handling, workflows, and the SDK reference."
        title="The rest of it"
      />

      <Small>
        If one of these is not doing what you expected, reply and tell me which.
        That feedback is how the docs get less wrong. &mdash; Jarod
      </Small>
    </Shell>
  );
}
