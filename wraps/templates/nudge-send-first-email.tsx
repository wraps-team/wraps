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

export const subject = "quick question{{#if firstName}}, {{firstName}}{{/if}}";
export const emailType = "marketing" as const;
export const previewText =
  "Your SES infrastructure has been sitting idle for 2 days.";

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

export default function NudgeSendFirstEmail({ unsubscribeUrl }: Props) {
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
              Your email infrastructure deployed 2 days ago but you haven&apos;t
              sent anything yet. The hardest part is done &mdash; sending is 5
              lines of code.
            </Text>

            <Text className="text-[15px] leading-relaxed text-gray-800">
              Call{" "}
              <code
                style={{
                  backgroundColor: "#f3f4f6",
                  padding: "2px 6px",
                  borderRadius: "4px",
                  fontSize: "14px",
                }}
              >
                wraps.emails.send()
              </code>{" "}
              with a from, to, and subject and you&apos;ll see it land in
              seconds.{" "}
              <Link
                className="text-gray-800 underline"
                href="https://wraps.dev/docs/quickstart/email"
              >
                Here&apos;s the quickstart
              </Link>{" "}
              if you need a reference.
            </Text>

            <Text className="text-[15px] leading-relaxed text-gray-800">
              Hit reply if you&apos;re stuck on anything.
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
