import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";
import { Footer } from "./_components/footer";

// ── Metadata ──

export const subject =
  "Your first workflow is ready{{#if firstName}}, {{firstName}}{{/if}}";
export const emailType = "transactional" as const;
export const previewText =
  "Automation unlocked. Enable it when you're ready and it runs on autopilot.";

// ── Test Data (for preview) ──

export const testData = {
  firstName: "Jane",
  workflowName: "Welcome Sequence",
  dashboardUrl: "https://app.wraps.dev",
  unsubscribeUrl: "https://wraps.dev/unsubscribe",
};

// ── Template ──

type Props = {
  firstName: string;
  workflowName: string;
  dashboardUrl: string;
  unsubscribeUrl: string;
};

export default function FirstWorkflowEmail({
  workflowName,
  dashboardUrl,
  unsubscribeUrl,
}: Props) {
  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Tailwind>
        <Body className="bg-[#faf5ff] font-sans">
          <Container className="mx-auto max-w-[580px] py-10">
            <Section className="px-10 pt-5">
              <Img
                alt="Wraps"
                className="rounded-lg"
                height="40"
                src="https://wraps.dev/logo.png"
                width="40"
              />
            </Section>
            <Section className="rounded-lg bg-white p-10">
              <Heading className="m-0 mb-2 text-2xl font-semibold text-gray-800">
                Automation unlocked.
              </Heading>
              <Text className="m-0 mb-6 text-base leading-relaxed text-gray-600">
                {"{{#if firstName}}{{firstName}}, you{{else}}You{{/if}}"} just
                created your first workflow: <strong>{workflowName}</strong>.
                Once you enable it, emails will send themselves.
              </Text>
              {/* Visual workflow representation */}
              <div
                style={{
                  backgroundColor: "#faf5ff",
                  borderRadius: "12px",
                  padding: "24px",
                  marginBottom: "24px",
                }}
              >
                <div style={{ textAlign: "center" }}>
                  {/* Trigger */}
                  <div
                    style={{
                      display: "inline-block",
                      backgroundColor: "#7c3aed",
                      color: "white",
                      padding: "10px 20px",
                      borderRadius: "8px",
                      fontSize: "14px",
                      fontWeight: 600,
                    }}
                  >
                    Trigger
                  </div>
                  <Text
                    style={{
                      margin: "4px 0",
                      fontSize: "20px",
                      color: "#c4b5fd",
                    }}
                  >
                    &#8595;
                  </Text>
                  {/* Delay */}
                  <div
                    style={{
                      display: "inline-block",
                      backgroundColor: "#ffffff",
                      border: "2px solid #c4b5fd",
                      color: "#6d28d9",
                      padding: "10px 20px",
                      borderRadius: "8px",
                      fontSize: "14px",
                      fontWeight: 600,
                    }}
                  >
                    Delay
                  </div>
                  <Text
                    style={{
                      margin: "4px 0",
                      fontSize: "20px",
                      color: "#c4b5fd",
                    }}
                  >
                    &#8595;
                  </Text>
                  {/* Send Email */}
                  <div
                    style={{
                      display: "inline-block",
                      backgroundColor: "#ffffff",
                      border: "2px solid #c4b5fd",
                      color: "#6d28d9",
                      padding: "10px 20px",
                      borderRadius: "8px",
                      fontSize: "14px",
                      fontWeight: 600,
                    }}
                  >
                    Send Email
                  </div>
                  <Text
                    style={{
                      margin: "4px 0",
                      fontSize: "20px",
                      color: "#c4b5fd",
                    }}
                  >
                    &#8595;
                  </Text>
                  {/* Condition */}
                  <div
                    style={{
                      display: "inline-block",
                      backgroundColor: "#ffffff",
                      border: "2px solid #c4b5fd",
                      color: "#6d28d9",
                      padding: "10px 20px",
                      borderRadius: "8px",
                      fontSize: "14px",
                      fontWeight: 600,
                    }}
                  >
                    Condition
                  </div>
                </div>
              </div>
              <Hr className="my-6 border-gray-200" />
              <Text className="m-0 mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">
                Workflow Ideas
              </Text>
              <div
                style={{
                  padding: "12px 16px",
                  marginBottom: "8px",
                  borderLeft: "3px solid #8b5cf6",
                  backgroundColor: "#faf5ff",
                  borderRadius: "0 6px 6px 0",
                }}
              >
                <Text className="m-0 text-[15px] text-gray-700">
                  <strong>Welcome series</strong> &mdash; Onboard new contacts
                  with a drip sequence
                </Text>
              </div>
              <div
                style={{
                  padding: "12px 16px",
                  marginBottom: "8px",
                  borderLeft: "3px solid #a78bfa",
                  backgroundColor: "#faf5ff",
                  borderRadius: "0 6px 6px 0",
                }}
              >
                <Text className="m-0 text-[15px] text-gray-700">
                  <strong>Re-engagement</strong> &mdash; Win back inactive
                  contacts automatically
                </Text>
              </div>
              <div
                style={{
                  padding: "12px 16px",
                  marginBottom: "8px",
                  borderLeft: "3px solid #c4b5fd",
                  backgroundColor: "#faf5ff",
                  borderRadius: "0 6px 6px 0",
                }}
              >
                <Text className="m-0 text-[15px] text-gray-700">
                  <strong>Event-driven</strong> &mdash; Send follow-ups based on
                  user actions in your app
                </Text>
              </div>
              <Section className="my-7 text-center">
                <Button
                  className="rounded-md bg-[#7c3aed] px-6 py-3 text-base font-semibold text-white no-underline"
                  href={dashboardUrl}
                >
                  Open Workflow Editor
                </Button>
              </Section>
              <Text className="m-0 text-sm text-gray-400">
                Enable your workflow when you&apos;re ready and it will run
                automatically for every matching trigger.
              </Text>
            </Section>
            <Footer unsubscribeUrl={unsubscribeUrl} />
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
