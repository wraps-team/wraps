import {
  Body,
  Button,
  Container,
  Head,
  Heading,
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
  "[Test] Welcome to Wraps{{#if firstName}}, {{firstName}}{{/if}}!";
export const emailType = "transactional" as const;
export const previewText =
  "Deploy email infrastructure to your AWS account in 30 seconds.";

// ── Test Data (for preview) ──

export const testData = {
  firstName: "Jane",
  dashboardUrl: "https://wraps.dev/dashboard",
  unsubscribeUrl: "https://wraps.dev/unsubscribe",
};

// ── Template ──

type Props = {
  firstName: string;
  dashboardUrl: string;
  unsubscribeUrl: string;
};

export default function WelcomeEmail({ dashboardUrl, unsubscribeUrl }: Props) {
  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Tailwind>
        <Body className="bg-[#f6f9fc] font-sans">
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
              <Heading className="m-0 mb-4 text-2xl font-semibold text-gray-800">
                {
                  "{{#if firstName}}Welcome aboard, {{firstName}}!{{else}}Welcome aboard!{{/if}}"
                }
              </Heading>
              <Text className="m-0 mb-5 text-base leading-relaxed text-gray-600">
                You just deployed production-ready email infrastructure to your
                AWS account. Here&apos;s what you can do next:
              </Text>
              <Text className="m-0 mb-2 pl-1 text-[15px] leading-relaxed text-gray-600">
                <strong>1.</strong> Send your first email with the TypeScript
                SDK
              </Text>
              <Text className="m-0 mb-2 pl-1 text-[15px] leading-relaxed text-gray-600">
                <strong>2.</strong> Set up domain verification for
                deliverability
              </Text>
              <Text className="m-0 mb-2 pl-1 text-[15px] leading-relaxed text-gray-600">
                <strong>3.</strong> Explore templates and broadcasts in the
                dashboard
              </Text>
              <Section className="my-7 text-center">
                <Button
                  className="rounded-md bg-[#5046e5] px-6 py-3 text-base font-semibold text-white no-underline"
                  href={dashboardUrl}
                >
                  Open Dashboard
                </Button>
              </Section>
              <Text className="m-0 text-sm text-gray-400">
                Need help? Just reply to this email — we read every message.
              </Text>
            </Section>
            <Footer unsubscribeUrl={unsubscribeUrl} />
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
