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

export const subject = "let me set this up for you";
export const emailType = "marketing" as const;
export const previewText =
  "Book 15 min and I'll get your AWS email infra running live on the call.";

// -- Test Data (for preview) --

export const testData = {
  firstName: "Jane",
  unsubscribeUrl: "https://wraps.dev/unsubscribe",
};

// -- Template --

type Props = {
  firstName: string;
  unsubscribeUrl: string;
};

export default function NudgeConnectAws({ unsubscribeUrl }: Props) {
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
              I noticed you signed up but haven&apos;t connected your AWS
              account yet. That&apos;s the one step that unlocks everything
              &mdash; verified domains, sending, workflows, all of it.
            </Text>

            <Text className="text-[15px] leading-relaxed text-gray-800">
              I do these setups all the time.{" "}
              <Link
                className="text-gray-800 underline"
                href="https://cal.com/wraps/get-started-with-wraps"
              >
                Book 15 minutes with me
              </Link>{" "}
              and I&apos;ll walk you through connecting your account and
              verifying your first domain live on the call. Most people are
              sending emails before we hang up.
            </Text>

            <Text className="text-[15px] leading-relaxed text-gray-800">
              Or if you prefer self-serve, run{" "}
              <code
                style={{
                  backgroundColor: "#f3f4f6",
                  padding: "2px 6px",
                  borderRadius: "4px",
                  fontSize: "14px",
                }}
              >
                wraps auth connect
              </code>{" "}
              and follow the prompts.
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
