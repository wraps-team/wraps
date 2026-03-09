import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";

// ── Metadata ──

export const subject =
  "The setup just got easier{{#if firstName}}, {{firstName}}{{/if}}.";
export const emailType = "marketing" as const;
export const previewText =
  "We rebuilt the init process from scratch. 4 commands, 2 minutes, done.";

// ── Test Data (for preview) ──

export const testData = {
  firstName: "Jane",
  unsubscribeUrl: "https://wraps.dev/unsubscribe",
  preferencesUrl: "https://wraps.dev/preferences",
};

// ── Template ──

type Props = {
  firstName: string;
  unsubscribeUrl: string;
  preferencesUrl: string;
};

export default function ReengagementActivateEmail({
  unsubscribeUrl,
  preferencesUrl,
}: Props) {
  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Tailwind>
        <Body className="bg-[#fdfdfd] font-sans">
          <Container className="mx-auto max-w-[580px] py-10">
            <Section className="px-10 pt-5 text-center">
              <Img
                alt="Wraps"
                className="rounded-lg pb-5 text-center"
                height="40"
                src="https://wraps.dev/_next/image?url=%2Fwraps-light-logo.png&w=256&q=75"
                width="120"
              />
            </Section>
            <Section className="rounded-lg bg-[#292524] p-10">
              {/* Terminal-style intro block */}
              <div
                style={{
                  backgroundColor: "#1c1917",
                  border: "1px solid #44403c",
                  borderRadius: "8px",
                  padding: "12px 16px",
                  marginBottom: "24px",
                  fontFamily: "'Fira Code', 'Consolas', monospace",
                }}
              >
                <Text
                  style={{
                    margin: 0,
                    fontSize: "13px",
                    color: "#22c55e",
                    fontWeight: 600,
                  }}
                >
                  $ wraps email init
                </Text>
                <Text
                  style={{
                    margin: "4px 0 0 0",
                    fontSize: "12px",
                    color: "#a8a29e",
                  }}
                >
                  Deploying to your AWS account... done in 90s
                </Text>
              </div>

              <Heading
                as="h1"
                style={{
                  margin: "0 0 16px 0",
                  fontSize: "24px",
                  fontWeight: 700,
                  color: "#fafaf9",
                }}
              >
                {"{{#if firstName}}Hey {{firstName}}, the{{else}}The{{/if}}"}{" "}
                setup just got easier.
              </Heading>
              <Text
                style={{
                  margin: "0 0 20px 0",
                  fontSize: "16px",
                  lineHeight: "1.6",
                  color: "#a8a29e",
                }}
              >
                I noticed you signed up for Wraps but haven&rsquo;t finished
                setting up yet. Totally fair &mdash; the init process had some
                rough edges when you tried it.
              </Text>
              <Text
                style={{
                  margin: "0 0 20px 0",
                  fontSize: "16px",
                  lineHeight: "1.6",
                  color: "#a8a29e",
                }}
              >
                I spent the last few weeks ironing all of that out. The CLI is
                faster, the prompts are clearer, and the whole flow is genuinely
                smooth now. 4 commands, about 2 minutes, and you&rsquo;re
                sending emails from your own AWS account.
              </Text>

              <Hr style={{ borderColor: "#44403c", margin: "24px 0" }} />

              <Text
                style={{
                  margin: "0 0 16px 0",
                  fontSize: "13px",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "#78716c",
                }}
              >
                The whole setup, step by step
              </Text>

              {/* Step 1 */}
              <div
                style={{
                  backgroundColor: "#1c1917",
                  borderRadius: "8px",
                  padding: "14px 16px",
                  marginBottom: "12px",
                  border: "1px solid #44403c",
                  borderLeft: "3px solid #f59e0b",
                }}
              >
                <Text
                  style={{
                    margin: "0 0 6px 0",
                    fontSize: "12px",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: "#78716c",
                  }}
                >
                  Step 1 &mdash; Install the CLI
                </Text>
                <Text
                  style={{
                    margin: 0,
                    fontSize: "14px",
                    fontFamily: "'Fira Code', 'Consolas', monospace",
                    color: "#fbbf24",
                  }}
                >
                  npm install -g @wraps.dev/cli
                </Text>
                <Text
                  style={{
                    margin: "6px 0 0 0",
                    fontSize: "13px",
                    color: "#a8a29e",
                    lineHeight: "1.5",
                  }}
                >
                  Installs the latest version globally. If you installed it
                  before, this will update you to the new release.
                </Text>
              </div>

              {/* Step 2 */}
              <div
                style={{
                  backgroundColor: "#1c1917",
                  borderRadius: "8px",
                  padding: "14px 16px",
                  marginBottom: "12px",
                  border: "1px solid #44403c",
                  borderLeft: "3px solid #f59e0b",
                }}
              >
                <Text
                  style={{
                    margin: "0 0 6px 0",
                    fontSize: "12px",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: "#78716c",
                  }}
                >
                  Step 2 &mdash; Log in
                </Text>
                <Text
                  style={{
                    margin: 0,
                    fontSize: "14px",
                    fontFamily: "'Fira Code', 'Consolas', monospace",
                    color: "#fbbf24",
                  }}
                >
                  wraps auth login
                </Text>
                <Text
                  style={{
                    margin: "6px 0 0 0",
                    fontSize: "13px",
                    color: "#a8a29e",
                    lineHeight: "1.5",
                  }}
                >
                  Opens your browser to authenticate. One click and you&rsquo;re
                  logged in.
                </Text>
              </div>

              {/* AWS credentials callout */}
              <div
                style={{
                  backgroundColor: "#451a03",
                  border: "1px solid #92400e",
                  borderRadius: "8px",
                  padding: "12px 16px",
                  marginBottom: "12px",
                }}
              >
                <Text
                  style={{
                    margin: 0,
                    fontSize: "13px",
                    color: "#fbbf24",
                    fontWeight: 600,
                  }}
                >
                  Don&rsquo;t have AWS credentials yet?
                </Text>
                <Text
                  style={{
                    margin: "4px 0 0 0",
                    fontSize: "13px",
                    color: "#a8a29e",
                    lineHeight: "1.5",
                  }}
                >
                  Run{" "}
                  <span
                    style={{
                      fontFamily: "'Fira Code', 'Consolas', monospace",
                      color: "#e7e5e4",
                    }}
                  >
                    wraps aws setup
                  </span>{" "}
                  &mdash; it&rsquo;ll walk you through the whole thing. Or check
                  the{" "}
                  <Link
                    href="https://wraps.dev/docs/guides/aws-setup"
                    style={{ color: "#fbbf24", textDecoration: "underline" }}
                  >
                    AWS setup guide
                  </Link>
                  .
                </Text>
              </div>

              {/* Step 3 */}
              <div
                style={{
                  backgroundColor: "#1c1917",
                  borderRadius: "8px",
                  padding: "14px 16px",
                  marginBottom: "12px",
                  border: "1px solid #44403c",
                  borderLeft: "3px solid #f59e0b",
                }}
              >
                <Text
                  style={{
                    margin: "0 0 6px 0",
                    fontSize: "12px",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: "#78716c",
                  }}
                >
                  Step 3 &mdash; Deploy email infrastructure
                </Text>
                <Text
                  style={{
                    margin: 0,
                    fontSize: "14px",
                    fontFamily: "'Fira Code', 'Consolas', monospace",
                    color: "#fbbf24",
                  }}
                >
                  wraps email init
                </Text>
                <Text
                  style={{
                    margin: "6px 0 0 0",
                    fontSize: "13px",
                    color: "#a8a29e",
                    lineHeight: "1.5",
                  }}
                >
                  Deploys SES, IAM roles, event tracking, and everything else to
                  your AWS account. Pick a preset and the CLI handles the rest.
                </Text>
              </div>

              {/* Step 4 */}
              <div
                style={{
                  backgroundColor: "#1c1917",
                  borderRadius: "8px",
                  padding: "14px 16px",
                  marginBottom: "12px",
                  border: "1px solid #44403c",
                  borderLeft: "3px solid #f59e0b",
                }}
              >
                <Text
                  style={{
                    margin: "0 0 6px 0",
                    fontSize: "12px",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: "#78716c",
                  }}
                >
                  Step 4 &mdash; Connect to the dashboard
                </Text>
                <Text
                  style={{
                    margin: 0,
                    fontSize: "14px",
                    fontFamily: "'Fira Code', 'Consolas', monospace",
                    color: "#fbbf24",
                  }}
                >
                  wraps platform connect
                </Text>
                <Text
                  style={{
                    margin: "6px 0 0 0",
                    fontSize: "13px",
                    color: "#a8a29e",
                    lineHeight: "1.5",
                  }}
                >
                  Links your AWS infrastructure to the Wraps dashboard.
                  Templates, analytics, contacts &mdash; all in one place.
                </Text>
              </div>

              <Hr style={{ borderColor: "#44403c", margin: "24px 0" }} />

              <Text
                style={{
                  margin: "0 0 16px 0",
                  fontSize: "13px",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "#78716c",
                }}
              >
                Then you&rsquo;re ready to send
              </Text>
              <pre
                style={{
                  backgroundColor: "#1c1917",
                  color: "#e7e5e4",
                  padding: "16px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontFamily: "'Fira Code', 'Consolas', monospace",
                  overflow: "auto",
                  margin: "0 0 16px 0",
                  border: "1px solid #44403c",
                }}
              >
                <code>
                  <span style={{ color: "#78716c" }}>
                    {"// Install the Email SDK\n"}
                  </span>
                  <span style={{ color: "#fbbf24" }}>npm</span>
                  {" install @wraps.dev/email\n\n"}
                  <span style={{ color: "#78716c" }}>
                    {"// Send your first email\n"}
                  </span>
                  <span style={{ color: "#c084fc" }}>import</span>
                  {" { Wraps } "}
                  <span style={{ color: "#c084fc" }}>from</span>
                  {" '@wraps.dev/email'\n\n"}
                  <span style={{ color: "#c084fc" }}>const</span>
                  {" wraps = "}
                  <span style={{ color: "#c084fc" }}>new</span>
                  {" Wraps()\n\n"}
                  <span style={{ color: "#c084fc" }}>await</span>
                  {" wraps.emails.send({\n"}
                  {"  from: 'hello@yourdomain.com',\n"}
                  {"  to: 'user@example.com',\n"}
                  {"  subject: 'Hello from Wraps!',\n"}
                  {"  html: '<h1>It works!</h1>'\n"}
                  {"})\n"}
                </code>
              </pre>

              <Section style={{ textAlign: "center", margin: "28px 0" }}>
                <Button
                  href="https://wraps.dev/docs/quickstart/email"
                  style={{
                    backgroundColor: "#f59e0b",
                    color: "#1c1917",
                    padding: "12px 24px",
                    fontWeight: 600,
                    borderRadius: "6px",
                    textDecoration: "none",
                    display: "inline-block",
                    fontSize: "16px",
                  }}
                >
                  Finish Setting Up
                </Button>
              </Section>

              <Text
                style={{
                  margin: "0 0 16px 0",
                  fontSize: "15px",
                  lineHeight: "1.6",
                  color: "#a8a29e",
                }}
              >
                If you hit any snags, just reply to this email. I read every
                one.
              </Text>

              <Text
                style={{
                  margin: "0 0 4px 0",
                  fontSize: "15px",
                  color: "#e7e5e4",
                }}
              >
                Cheers,
              </Text>
              <Text
                style={{
                  margin: 0,
                  fontSize: "15px",
                  fontWeight: 700,
                  color: "#fafaf9",
                }}
              >
                Jarod from Wraps
              </Text>
            </Section>
            <Section className="px-10 py-5 text-center">
              <Hr style={{ borderColor: "#44403c", marginBottom: "20px" }} />
              <Text
                className="text-left"
                style={{
                  margin: "0 0 4px 0",
                  fontSize: "12px",
                  color: "#78716c",
                  fontStyle: "italic",
                  lineHeight: "1.5",
                }}
              >
                You&rsquo;re receiving this because you have a Wraps account. If
                you don&rsquo;t want emails like this, unsubscribe below &mdash;
                you&rsquo;ll still get important account emails.
              </Text>
              <Text
                style={{
                  margin: "0 0 8px 0",
                  fontSize: "12px",
                  color: "#78716c",
                }}
              >
                Wraps &bull; Boulder, CO
              </Text>
              <Text style={{ margin: 0, fontSize: "12px" }}>
                <Link
                  href={unsubscribeUrl}
                  style={{
                    fontSize: "12px",
                    color: "#78716c",
                    textDecoration: "underline",
                  }}
                >
                  Unsubscribe
                </Link>
                <span style={{ color: "#78716c" }}>&nbsp;&bull;&nbsp;</span>
                <Link
                  href={preferencesUrl}
                  style={{
                    fontSize: "12px",
                    color: "#78716c",
                    textDecoration: "underline",
                  }}
                >
                  Manage Subscriptions
                </Link>
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
