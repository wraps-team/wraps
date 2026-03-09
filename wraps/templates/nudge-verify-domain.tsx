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

export const subject = "one DNS record away";
export const emailType = "marketing" as const;
export const previewText =
  "Your AWS account is connected. Verify a domain and you can start sending.";

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

export default function NudgeVerifyDomain({ unsubscribeUrl }: Props) {
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
              Your AWS account is connected &mdash; nice. The last thing before
              you can send is verifying a domain. Run{" "}
              <code
                style={{
                  backgroundColor: "#f3f4f6",
                  padding: "2px 6px",
                  borderRadius: "4px",
                  fontSize: "14px",
                }}
              >
                wraps email setup
              </code>{" "}
              and it&apos;ll give you the DNS records to add. Most providers
              propagate in under 10 minutes.
            </Text>

            <Text className="text-[15px] leading-relaxed text-gray-800">
              If you hit any DNS weirdness,{" "}
              <Link
                className="text-gray-800 underline"
                href="https://cal.com/wraps/get-started-with-wraps"
              >
                grab a slot
              </Link>{" "}
              and I&apos;ll sort it out with you. Or just reply here.
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
