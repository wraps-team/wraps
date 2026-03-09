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

export const subject =
  "You added your first contact{{#if firstName}}, {{firstName}}{{/if}}!";
export const emailType = "transactional" as const;
export const previewText =
  "Your audience is growing. Here's how to make the most of it.";

// ── Test Data (for preview) ──

export const testData = {
  firstName: "Jane",
  contactName: "Alex Smith",
  dashboardUrl: "https://app.wraps.dev",
  unsubscribeUrl: "https://wraps.dev/unsubscribe",
};

// ── Template ──

type Props = {
  firstName: string;
  contactName: string;
  dashboardUrl: string;
  unsubscribeUrl: string;
};

export default function FirstContactEmail({
  contactName,
  dashboardUrl,
  unsubscribeUrl,
}: Props) {
  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Tailwind>
        <Body className="bg-[#f0fdf4] font-sans">
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
              <div
                style={{
                  backgroundColor: "#dcfce7",
                  borderRadius: "12px",
                  padding: "16px 20px",
                  marginBottom: "24px",
                  textAlign: "center",
                }}
              >
                <Text
                  style={{
                    margin: 0,
                    fontSize: "32px",
                    lineHeight: "1",
                  }}
                >
                  +1
                </Text>
                <Text
                  style={{
                    margin: "8px 0 0 0",
                    fontSize: "14px",
                    color: "#15803d",
                    fontWeight: 600,
                  }}
                >
                  Contact Added
                </Text>
              </div>
              <Heading className="m-0 mb-4 text-2xl font-semibold text-gray-800">
                {
                  "{{#if firstName}}Your audience starts here, {{firstName}}.{{else}}Your audience starts here.{{/if}}"
                }
              </Heading>
              <Text className="m-0 mb-5 text-base leading-relaxed text-gray-600">
                You just added <strong>{contactName}</strong> as your first
                contact. That&apos;s the foundation of everything &mdash;
                broadcasts, automations, and targeted campaigns all start with
                your contact list.
              </Text>
              <Hr className="my-6 border-gray-200" />
              <Text className="m-0 mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">
                Next Steps
              </Text>
              <Row className="mb-3">
                <Column width={40}>
                  <div
                    style={{
                      width: "28px",
                      height: "28px",
                      backgroundColor: "#22c55e",
                      borderRadius: "50%",
                      textAlign: "center",
                      lineHeight: "28px",
                      color: "white",
                      fontSize: "14px",
                      fontWeight: 700,
                    }}
                  >
                    1
                  </div>
                </Column>
                <Column>
                  <Text className="m-0 text-[15px] leading-relaxed text-gray-600">
                    <strong>Import your list</strong> &mdash; Bulk import via
                    the Platform SDK (<code>@wraps.dev/client</code>)
                  </Text>
                </Column>
              </Row>
              <Row className="mb-3">
                <Column width={40}>
                  <div
                    style={{
                      width: "28px",
                      height: "28px",
                      backgroundColor: "#22c55e",
                      borderRadius: "50%",
                      textAlign: "center",
                      lineHeight: "28px",
                      color: "white",
                      fontSize: "14px",
                      fontWeight: 700,
                    }}
                  >
                    2
                  </div>
                </Column>
                <Column>
                  <Text className="m-0 text-[15px] leading-relaxed text-gray-600">
                    <strong>Create a template</strong> &mdash; design your first
                    email in the editor
                  </Text>
                </Column>
              </Row>
              <Row className="mb-3">
                <Column width={40}>
                  <div
                    style={{
                      width: "28px",
                      height: "28px",
                      backgroundColor: "#22c55e",
                      borderRadius: "50%",
                      textAlign: "center",
                      lineHeight: "28px",
                      color: "white",
                      fontSize: "14px",
                      fontWeight: 700,
                    }}
                  >
                    3
                  </div>
                </Column>
                <Column>
                  <Text className="m-0 text-[15px] leading-relaxed text-gray-600">
                    <strong>Send a broadcast</strong> &mdash; reach your
                    audience with a single click
                  </Text>
                </Column>
              </Row>
              <Section className="my-7 text-center">
                <Button
                  className="rounded-md bg-[#16a34a] px-6 py-3 text-base font-semibold text-white no-underline"
                  href={dashboardUrl}
                >
                  View Contacts
                </Button>
              </Section>
              <Text className="m-0 text-sm text-gray-400">
                Add contacts from the dashboard or programmatically with the
                Platform SDK.
              </Text>
            </Section>
            <Footer unsubscribeUrl={unsubscribeUrl} />
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
