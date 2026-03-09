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
  "Template published to SES{{#if firstName}}, {{firstName}}{{/if}}";
export const emailType = "transactional" as const;
export const previewText =
  "Your template is live on AWS SES. You can now send emails with it.";

// ── Test Data (for preview) ──

export const testData = {
  firstName: "Jane",
  templateName: "Welcome Email",
  dashboardUrl: "https://app.wraps.dev",
  unsubscribeUrl: "https://wraps.dev/unsubscribe",
};

// ── Template ──

type Props = {
  firstName: string;
  templateName: string;
  dashboardUrl: string;
  unsubscribeUrl: string;
};

export default function FirstTemplatePublishedEmail({
  templateName,
  dashboardUrl,
  unsubscribeUrl,
}: Props) {
  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Tailwind>
        <Body className="bg-[#f0fdfa] font-sans">
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
                    "linear-gradient(135deg, #0d9488 0%, #0891b2 100%)",
                  padding: "32px",
                  textAlign: "center",
                }}
              >
                <Text
                  style={{
                    margin: 0,
                    fontSize: "40px",
                    lineHeight: "1",
                  }}
                >
                  &#9889;
                </Text>
                <Heading
                  as="h1"
                  style={{
                    margin: "12px 0 0 0",
                    fontSize: "24px",
                    fontWeight: 700,
                    color: "#ffffff",
                  }}
                >
                  Template is Live
                </Heading>
                <Text
                  style={{
                    margin: "8px 0 0 0",
                    fontSize: "15px",
                    color: "rgba(255,255,255,0.85)",
                  }}
                >
                  &ldquo;{templateName}&rdquo; has been published to AWS SES
                </Text>
              </div>
              <div style={{ padding: "32px" }}>
                <Text className="m-0 mb-5 text-base leading-relaxed text-gray-600">
                  {
                    "{{#if firstName}}Great milestone, {{firstName}}. Your{{else}}Your{{/if}}"
                  }{" "}
                  template is now available on AWS SES, which means you can use
                  it anywhere &mdash; broadcasts, workflows, or the API.
                </Text>
                <Hr className="my-6 border-gray-200" />
                <Text className="m-0 mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">
                  What you can do now
                </Text>
                <div
                  style={{
                    backgroundColor: "#f0fdfa",
                    borderRadius: "8px",
                    padding: "16px 20px",
                    marginBottom: "10px",
                  }}
                >
                  <Text className="m-0 text-[15px] text-gray-700">
                    <strong>Send a test email</strong> to preview it in your
                    inbox before going live
                  </Text>
                </div>
                <div
                  style={{
                    backgroundColor: "#f0fdfa",
                    borderRadius: "8px",
                    padding: "16px 20px",
                    marginBottom: "10px",
                  }}
                >
                  <Text className="m-0 text-[15px] text-gray-700">
                    <strong>Create a broadcast</strong> to send it to your
                    contacts right now
                  </Text>
                </div>
                <div
                  style={{
                    backgroundColor: "#f0fdfa",
                    borderRadius: "8px",
                    padding: "16px 20px",
                    marginBottom: "10px",
                  }}
                >
                  <Text className="m-0 text-[15px] text-gray-700">
                    <strong>Use it in a workflow</strong> to trigger automated
                    email sequences
                  </Text>
                </div>
                <Section className="my-7 text-center">
                  <Button
                    className="rounded-md bg-[#0d9488] px-6 py-3 text-base font-semibold text-white no-underline"
                    href={dashboardUrl}
                  >
                    Send a Test Email
                  </Button>
                </Section>
                <Text className="m-0 text-sm text-gray-400">
                  Made changes? Hit publish again from the dashboard to update
                  the SES template with your latest edits.
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
