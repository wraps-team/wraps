"use client";

import { Button } from "@wraps/ui/components/ui/button";
import Link from "next/link";
import { CodeTabs } from "@/components/ui/shadcn-io/code-tabs";
import { Github } from "@/components/ui/svgs/brand-icons";
import { SectionKicker } from "./section-kicker";

const codeExamples: Record<string, string> = {
  "@wraps.dev/email": `import { WrapsEmail } from '@wraps.dev/email';

const email = new WrapsEmail();

await email.send({
  from: 'hello@acme.com',
  to: user.email,
  subject: 'Welcome to Acme',
  react: <WelcomeEmail name={user.name} />,
});`,
  "@aws-sdk/client-sesv2": `import {
  SESv2Client,
  SendEmailCommand,
} from '@aws-sdk/client-sesv2';

const ses = new SESv2Client();

// No ConfigurationSetName needed. Wraps binds it to
// the domain identity, so your events land either way.
await ses.send(new SendEmailCommand({
  FromEmailAddress: 'hello@acme.com',
  Destination: { ToAddresses: [user.email] },
  Content: {
    Simple: {
      Subject: { Data: 'Welcome to Acme' },
      Body: { Html: { Data: html } },
    },
  },
}));`,
};

export function CodeSampleSection() {
  return (
    <section className="border-border border-b py-20 md:py-24">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-[1fr_1.15fr] lg:gap-16 lg:px-8">
        {/* Copy */}
        <div>
          <SectionKicker>TypeScript SDK</SectionKicker>
          <h2 className="font-heading font-semibold text-3xl text-foreground leading-none tracking-tight md:text-4xl">
            Send an email. That&apos;s the whole API.
          </h2>
          <p className="mt-4 max-w-[52ch] text-lg text-muted-foreground leading-relaxed">
            One import, one client, one call. Events stream to DynamoDB in your
            account — query them yourself or use the dashboard.
          </p>
          <p className="mt-4 max-w-[52ch] text-lg text-muted-foreground leading-relaxed">
            Your code talks to SES, not to us. Swap the SDK for the AWS SDK,
            boto3, or plain SMTP and the events still land.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button asChild className="cursor-pointer" variant="brand">
              <Link href="/docs/sdk-reference">Read the docs</Link>
            </Button>
            <Button asChild className="cursor-pointer" variant="outline">
              <a
                href="https://github.com/wraps-team/wraps"
                rel="noopener noreferrer"
                target="_blank"
              >
                <Github aria-hidden="true" className="size-4" />
                View on GitHub
              </a>
            </Button>
          </div>
        </div>

        {/* Code */}
        <CodeTabs
          codes={codeExamples}
          lang="tsx"
          themes={{ light: "vitesse-light", dark: "vitesse-dark" }}
          variant="flush"
        />
      </div>
    </section>
  );
}
