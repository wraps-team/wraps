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
  "API key created. Your app is connected{{#if firstName}}, {{firstName}}{{/if}}.";
export const emailType = "transactional" as const;
export const previewText =
  "Manage contacts, trigger workflows, and track events from your app.";

// ── Test Data (for preview) ──

export const testData = {
  firstName: "Jane",
  dashboardUrl: "https://app.wraps.dev",
  unsubscribeUrl: "https://wraps.dev/unsubscribe",
};

// ── Template ──

type Props = {
  firstName: string;
  dashboardUrl: string;
  unsubscribeUrl: string;
};

export default function FirstApiKeyEmail({
  dashboardUrl,
  unsubscribeUrl,
}: Props) {
  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Tailwind>
        <Body className="bg-[#fdfdfd] font-sans">
          <Container className="mx-auto max-w-[580px] py-10">
            <Section className="px-10 pt-5 align-center text-center">
              <Img
                alt="Wraps"
                className="rounded-lg pb-5 text-center"
                height="40"
                src="https://wraps.dev/_next/image?url=%2Fwraps-light-logo.png&w=256&q=75"
                width="120"
              />
            </Section>
            <Section className="rounded-lg bg-[#292524] p-10">
              <div
                style={{
                  backgroundColor: "#451a03",
                  border: "1px solid #92400e",
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
                    color: "#fbbf24",
                    fontWeight: 600,
                  }}
                >
                  $ API key created
                </Text>
                <Text
                  style={{
                    margin: "4px 0 0 0",
                    fontSize: "12px",
                    color: "#a8a29e",
                  }}
                >
                  wraps_live_****...****
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
                {
                  "{{#if firstName}}Your app is connected, {{firstName}}.{{else}}Your app is connected.{{/if}}"
                }
              </Heading>
              <Text
                style={{
                  margin: "0 0 20px 0",
                  fontSize: "16px",
                  lineHeight: "1.6",
                  color: "#a8a29e",
                }}
              >
                Your API key unlocks the Wraps Platform API. Use it to manage
                contacts, trigger workflows, and track events directly from your
                application code.
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
                Platform API Quick Start
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
                    {"// Install the Platform SDK\n"}
                  </span>
                  <span style={{ color: "#fbbf24" }}>npm</span>
                  {" install @wraps.dev/client\n\n"}
                  <span style={{ color: "#78716c" }}>
                    {"// Connect to the Platform API\n"}
                  </span>
                  <span style={{ color: "#c084fc" }}>import</span>
                  {" { createPlatformClient } "}
                  <span style={{ color: "#c084fc" }}>from</span>
                  {" '@wraps.dev/client'\n\n"}
                  <span style={{ color: "#c084fc" }}>const</span>
                  {" client = createPlatformClient({\n"}
                  {"  apiKey: process.env.WRAPS_API_KEY\n"}
                  {"})\n\n"}
                  <span style={{ color: "#78716c" }}>
                    {"// Create a contact\n"}
                  </span>
                  <span style={{ color: "#c084fc" }}>await</span>
                  {" client.POST('/v1/contacts/', {\n"}
                  {"  body: {\n"}
                  {"    email: 'user@example.com',\n"}
                  {"    firstName: 'Alex'\n"}
                  {"  }\n"}
                  {"})\n"}
                </code>
              </pre>
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
                What the Platform API can do
              </Text>
              <div
                style={{
                  backgroundColor: "#1c1917",
                  borderRadius: "8px",
                  padding: "12px 16px",
                  marginBottom: "8px",
                  border: "1px solid #44403c",
                }}
              >
                <Text
                  style={{
                    margin: 0,
                    fontSize: "14px",
                    color: "#e7e5e4",
                  }}
                >
                  <strong style={{ color: "#fbbf24" }}>Contacts</strong>
                  <span style={{ color: "#78716c" }}>{" — "}</span>
                  Create, update, and manage your audience
                </Text>
              </div>
              <div
                style={{
                  backgroundColor: "#1c1917",
                  borderRadius: "8px",
                  padding: "12px 16px",
                  marginBottom: "8px",
                  border: "1px solid #44403c",
                }}
              >
                <Text
                  style={{
                    margin: 0,
                    fontSize: "14px",
                    color: "#e7e5e4",
                  }}
                >
                  <strong style={{ color: "#fbbf24" }}>Events</strong>
                  <span style={{ color: "#78716c" }}>{" — "}</span>
                  Track user actions to trigger automations
                </Text>
              </div>
              <div
                style={{
                  backgroundColor: "#1c1917",
                  borderRadius: "8px",
                  padding: "12px 16px",
                  marginBottom: "8px",
                  border: "1px solid #44403c",
                }}
              >
                <Text
                  style={{
                    margin: 0,
                    fontSize: "14px",
                    color: "#e7e5e4",
                  }}
                >
                  <strong style={{ color: "#fbbf24" }}>Workflows</strong>
                  <span style={{ color: "#78716c" }}>{" — "}</span>
                  Trigger automation sequences via API
                </Text>
              </div>
              <div
                style={{
                  backgroundColor: "#1c1917",
                  borderRadius: "8px",
                  padding: "12px 16px",
                  marginBottom: "8px",
                  border: "1px solid #44403c",
                }}
              >
                <Text
                  style={{
                    margin: 0,
                    fontSize: "14px",
                    color: "#e7e5e4",
                  }}
                >
                  <strong style={{ color: "#fbbf24" }}>Topics</strong>
                  <span style={{ color: "#78716c" }}>{" — "}</span>
                  Manage subscription preferences
                </Text>
              </div>
              <Section style={{ textAlign: "center", margin: "28px 0" }}>
                <Button
                  href="https://wraps.dev/docs/quickstart"
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
                  Read the API Docs
                </Button>
              </Section>
              <div
                style={{
                  backgroundColor: "#1c1917",
                  borderRadius: "8px",
                  padding: "16px",
                  border: "1px solid #44403c",
                }}
              >
                <Text
                  style={{
                    margin: 0,
                    fontSize: "13px",
                    color: "#a8a29e",
                  }}
                >
                  <strong style={{ color: "#fbbf24" }}>Note:</strong> API keys
                  are for the Platform API (contacts, events, workflows). To
                  send emails, use{" "}
                  <span
                    style={{
                      fontFamily: "'Fira Code', 'Consolas', monospace",
                      color: "#e7e5e4",
                    }}
                  >
                    @wraps.dev/email
                  </span>{" "}
                  with your AWS credentials &mdash; no API key needed.
                </Text>
              </div>
            </Section>
            <Section className="px-10 py-5 text-center">
              <Hr style={{ borderColor: "#44403c", marginBottom: "20px" }} />
              <Text
                style={{
                  margin: "0 0 8px 0",
                  fontSize: "12px",
                  color: "#78716c",
                }}
              >
                Wraps &bull; Boulder, CO
              </Text>
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
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
