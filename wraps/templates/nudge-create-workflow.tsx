import {
  Body,
  Container,
  Head,
  Html,
  Link,
  Preview,
  Tailwind,
  Text,
} from "@react-email/components";
import { Footer } from "./_components/footer";

// -- Metadata --

export const subject = "one thing most teams skip";
export const emailType = "marketing" as const;
export const previewText =
  "You're sending emails manually. There's a faster way.";

// -- Test Data (for preview) --

export const testData = {
  firstName: "Jane",
  dashboardUrl: "https://app.wraps.dev/workflows/new",
  unsubscribeUrl: "https://wraps.dev/unsubscribe",
};

// -- Template --

type Props = {
  firstName: string;
  dashboardUrl: string;
  unsubscribeUrl: string;
};

export default function NudgeCreateWorkflow({
  dashboardUrl,
  unsubscribeUrl,
}: Props) {
  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Tailwind>
        <Body className="bg-white font-sans">
          <Container className="mx-auto max-w-[580px] px-4 py-10">
            <Text className="text-[15px] leading-relaxed text-gray-800">
              {"{{#if firstName}}Hey {{firstName}},{{else}}Hey there,{{/if}}"}
            </Text>

            <Text className="text-[15px] leading-relaxed text-gray-800">
              You&apos;re sending emails &mdash; that&apos;s great. But most
              teams stop there and manually trigger every send.
            </Text>

            <Text className="text-[15px] leading-relaxed text-gray-800">
              Workflows let you define triggers once and emails send themselves.
              A welcome series, a follow-up after signup, whatever you need.{" "}
              <Link className="text-gray-800 underline" href={dashboardUrl}>
                Create your first workflow
              </Link>{" "}
              &mdash; takes about 2 minutes.
            </Text>

            <Text className="text-[15px] leading-relaxed text-gray-800">
              Reply if you want a hand setting it up.
            </Text>

            <Text className="text-[15px] leading-relaxed text-gray-800">
              -- Jarod
            </Text>

            <Footer unsubscribeUrl={unsubscribeUrl} />
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
