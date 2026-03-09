import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Preview,
  Row,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";
import { Footer } from "./_components/footer";

// ── Metadata ──

export const subject = "Your first broadcast is out the door!";
export const emailType = "transactional" as const;
export const previewText =
  "You just sent your first broadcast. Here's how to track the results.";

// ── Test Data (for preview) ──

export const testData = {
  firstName: "Jane",
  recipientCount: "1,240",
  templateName: "Product Launch",
  dashboardUrl: "https://app.wraps.dev",
  unsubscribeUrl: "https://wraps.dev/unsubscribe",
};

// ── Template ──

type Props = {
  firstName: string;
  recipientCount: string;
  templateName: string;
  dashboardUrl: string;
  unsubscribeUrl: string;
};

export default function FirstBroadcastEmail({
  recipientCount,
  templateName,
  dashboardUrl,
  unsubscribeUrl,
}: Props) {
  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Tailwind>
        <Body className="bg-[#fff7ed] font-sans">
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
            <Section className="overflow-hidden rounded-lg bg-white">
              <div
                style={{
                  background:
                    "linear-gradient(135deg, #ea580c 0%, #f97316 50%, #fb923c 100%)",
                  padding: "32px",
                  textAlign: "center",
                }}
              >
                <Heading
                  as="h1"
                  style={{
                    margin: 0,
                    fontSize: "24px",
                    fontWeight: 700,
                    color: "#ffffff",
                  }}
                >
                  Broadcast Sent!
                </Heading>
                <Text
                  style={{
                    margin: "8px 0 0 0",
                    fontSize: "15px",
                    color: "rgba(255,255,255,0.9)",
                  }}
                >
                  Your first email just landed in {recipientCount} inboxes
                </Text>
              </div>
              <div style={{ padding: "32px" }}>
                <Text className="m-0 mb-5 text-base leading-relaxed text-gray-600">
                  {
                    "{{#if firstName}}Congrats {{firstName}}! You{{else}}Congrats! You{{/if}}"
                  }{" "}
                  just sent &ldquo;{templateName}
                  &rdquo; to {recipientCount} contacts. SES is processing
                  deliveries now &mdash; results will appear in your dashboard
                  within minutes.
                </Text>
                {/* Stats preview */}
                <Row style={{ marginBottom: "24px" }}>
                  <Column style={{ textAlign: "center", width: "33%" }}>
                    <div
                      style={{
                        backgroundColor: "#fff7ed",
                        borderRadius: "8px",
                        padding: "16px 8px",
                      }}
                    >
                      <Text
                        style={{
                          margin: 0,
                          fontSize: "24px",
                          fontWeight: 700,
                          color: "#ea580c",
                        }}
                      >
                        {recipientCount}
                      </Text>
                      <Text
                        style={{
                          margin: "4px 0 0 0",
                          fontSize: "12px",
                          color: "#9a3412",
                          fontWeight: 600,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                        }}
                      >
                        Sent
                      </Text>
                    </div>
                  </Column>
                  <Column style={{ textAlign: "center", width: "33%" }}>
                    <div
                      style={{
                        backgroundColor: "#fff7ed",
                        borderRadius: "8px",
                        padding: "16px 8px",
                      }}
                    >
                      <Text
                        style={{
                          margin: 0,
                          fontSize: "24px",
                          fontWeight: 700,
                          color: "#ea580c",
                        }}
                      >
                        --
                      </Text>
                      <Text
                        style={{
                          margin: "4px 0 0 0",
                          fontSize: "12px",
                          color: "#9a3412",
                          fontWeight: 600,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                        }}
                      >
                        Opens
                      </Text>
                    </div>
                  </Column>
                  <Column style={{ textAlign: "center", width: "33%" }}>
                    <div
                      style={{
                        backgroundColor: "#fff7ed",
                        borderRadius: "8px",
                        padding: "16px 8px",
                      }}
                    >
                      <Text
                        style={{
                          margin: 0,
                          fontSize: "24px",
                          fontWeight: 700,
                          color: "#ea580c",
                        }}
                      >
                        --
                      </Text>
                      <Text
                        style={{
                          margin: "4px 0 0 0",
                          fontSize: "12px",
                          color: "#9a3412",
                          fontWeight: 600,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                        }}
                      >
                        Clicks
                      </Text>
                    </div>
                  </Column>
                </Row>
                <Hr className="my-6 border-gray-200" />
                <Text className="m-0 mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">
                  What to watch
                </Text>
                <Text className="m-0 mb-2 text-[15px] leading-relaxed text-gray-600">
                  <strong>Delivery rate</strong> &mdash; SES typically delivers
                  &gt;99% of emails within seconds
                </Text>
                <Text className="m-0 mb-2 text-[15px] leading-relaxed text-gray-600">
                  <strong>Open rate</strong> &mdash; Industry average is
                  ~20-25%. Results update in real-time.
                </Text>
                <Text className="m-0 mb-2 text-[15px] leading-relaxed text-gray-600">
                  <strong>Click rate</strong> &mdash; See how many recipients
                  clicked through your email
                </Text>
                <Section className="my-7 text-center">
                  <Button
                    className="rounded-md bg-[#ea580c] px-6 py-3 text-base font-semibold text-white no-underline"
                    href={dashboardUrl}
                  >
                    View Broadcast Results
                  </Button>
                </Section>
                <Text className="m-0 text-sm text-gray-400">
                  Pro tip: Send broadcasts at consistent times. Your audience
                  will start expecting (and opening) your emails.
                </Text>
              </div>
            </Section>
            <Footer unsubscribeUrl={unsubscribeUrl} />
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
