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

export const subject = "you've got {{contactCount}} contacts waiting" as const;
export const subjectFallback = "your contacts are waiting" as const;
export const emailType = "marketing" as const;
export const previewText = "You've been building a list. Time to use it.";

// -- Test Data (for preview) --

export const testData = {
  firstName: "Jane",
  contactCount: 847,
  dashboardUrl: "https://app.wraps.dev/broadcasts/new",
  unsubscribeUrl: "https://wraps.dev/unsubscribe",
};

// -- Template --

type Props = {
  firstName: string;
  contactCount?: number;
  dashboardUrl: string;
  unsubscribeUrl: string;
};

export default function NudgeSendBroadcast({
  contactCount,
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
              You&apos;ve got{" "}
              {contactCount
                ? `${contactCount.toLocaleString()} contacts`
                : "contacts"}{" "}
              and templates ready to go. A broadcast reaches your whole list at
              once &mdash; and it costs $0.10 per 1,000 emails through SES.
            </Text>

            <Text className="text-[15px] leading-relaxed text-gray-800">
              <Link className="text-gray-800 underline" href={dashboardUrl}>
                Send your first broadcast
              </Link>{" "}
              and see how it feels to reach everyone at once.
            </Text>

            <Text className="text-[15px] leading-relaxed text-gray-800">
              Let me know how it goes.
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
