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
  "Your first template is ready{{#if firstName}}, {{firstName}}{{/if}}";
export const emailType = "transactional" as const;
export const previewText =
  "Beautiful emails start with great templates. Publish it to start sending.";

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

export default function FirstTemplateEmail({
  templateName,
  dashboardUrl,
  unsubscribeUrl,
}: Props) {
  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Tailwind>
        <Body className="bg-[#eff6ff] font-sans">
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
                  backgroundColor: "#dbeafe",
                  borderLeft: "4px solid #3b82f6",
                  borderRadius: "8px",
                  padding: "16px 20px",
                  marginBottom: "24px",
                }}
              >
                <Text
                  style={{
                    margin: 0,
                    fontSize: "13px",
                    color: "#1d4ed8",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  Template Created
                </Text>
                <Text
                  style={{
                    margin: "4px 0 0 0",
                    fontSize: "18px",
                    color: "#1e3a5f",
                    fontWeight: 700,
                  }}
                >
                  {templateName}
                </Text>
              </div>
              <Heading className="m-0 mb-4 text-2xl font-semibold text-gray-800">
                {
                  "{{#if firstName}}Nice work, {{firstName}}. Your{{else}}Your{{/if}}"
                }{" "}
                first template is drafted.
              </Heading>
              <Text className="m-0 mb-5 text-base leading-relaxed text-gray-600">
                Templates are the building blocks of Wraps. Use them in
                broadcasts to reach your audience, in workflows to automate
                sequences, or via the API for transactional emails.
              </Text>
              <Hr className="my-6 border-gray-200" />
              <Heading
                as="h3"
                className="m-0 mb-4 text-lg font-semibold text-gray-700"
              >
                Two ways to build templates
              </Heading>
              <div
                style={{
                  backgroundColor: "#f8fafc",
                  borderRadius: "8px",
                  padding: "20px",
                  marginBottom: "12px",
                }}
              >
                <Text className="m-0 mb-1 text-[15px] font-semibold text-gray-700">
                  Visual Editor
                </Text>
                <Text className="m-0 text-sm leading-relaxed text-gray-500">
                  Rich text editor in the dashboard with formatting, links, and
                  images. No code needed.
                </Text>
              </div>
              <div
                style={{
                  backgroundColor: "#f8fafc",
                  borderRadius: "8px",
                  padding: "20px",
                  marginBottom: "12px",
                }}
              >
                <Text className="m-0 mb-1 text-[15px] font-semibold text-gray-700">
                  Code Templates (React Email)
                </Text>
                <Text className="m-0 text-sm leading-relaxed text-gray-500">
                  Write templates as React components and push from the CLI.
                  Version-controlled and type-safe.
                </Text>
              </div>
              <Section className="my-7 text-center">
                <Button
                  className="rounded-md bg-[#2563eb] px-6 py-3 text-base font-semibold text-white no-underline"
                  href={dashboardUrl}
                >
                  Edit Template
                </Button>
              </Section>
              <Text className="m-0 text-sm text-gray-400">
                Next up: publish your template to SES so you can start sending.
              </Text>
            </Section>
            <Footer unsubscribeUrl={unsubscribeUrl} />
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
