"use client";

import { SectionKicker } from "@/app/landing/components/section-kicker";
import {
  CodeBlock,
  CodeBlockBody,
  CodeBlockContent,
  CodeBlockCopyButton,
  CodeBlockFilename,
  CodeBlockFiles,
  CodeBlockHeader,
  CodeBlockItem,
} from "@/components/ui/shadcn-io/code-block";
import { CONSOLE_ACCESS_POLICY_JSON } from "../console-access-policy";

const disclosures = [
  "An EventBridge rule in your account routes your SES event stream to wraps-email-events, an SQS queue, which a Lambda function drains into your DynamoDB. Once you run platform connect, that same rule gains a second target that also forwards the stream to Wraps: sends, deliveries, opens, clicks, bounces, complaints, rejects, delivery delays, and suppression events. This is what powers suppression, dashboard analytics, and workflow triggers.",
  "On opens and clicks, SES includes the recipient's IP address and user agent in that event. Wraps stores the user agent, which is what lets us filter bot opens out of your open rates. Wraps discards the IP address without storing it. The full event, IP included, still lands in your own DynamoDB.",
  "The same events are written to wraps-email-history in your DynamoDB. That copy is yours, and it stays when you leave.",
  "SDK sends go directly from your application to your own SES via OIDC, assuming the wraps-email-role that email init created in your account. Wraps is not in that request path.",
  "Dashboard-initiated broadcasts execute through wraps-console-access-role, a cross-account role Wraps assumes in your account, gated by an sts:ExternalId condition. email init does not create this role. It exists only if you ran platform connect.",
  "Contacts, templates, workflows, and segments are stored on the Wraps platform, not in your AWS account.",
];

export function SyncsSection() {
  return (
    <section className="py-16" id="what-syncs">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <SectionKicker>What syncs to Wraps</SectionKicker>
          <h2 className="mb-4 font-heading font-semibold text-2xl tracking-tight sm:text-3xl">
            The full disclosure, not the marketing version.
          </h2>
          <p className="mb-8 text-muted-foreground">
            Wraps does not meet the strictest definition of BYOC: zero vendor
            access to your account and data. We hold a cross-account role for
            dashboard-initiated sends, and your full SES event stream syncs back
            to us, not just bounces and complaints. Here is exactly what that
            means.
          </p>

          <ul className="mb-10 space-y-4 rounded-xl border border-border bg-background/50 p-6">
            {disclosures.map((text) => (
              <li className="flex gap-3 text-sm" key={text.slice(0, 40)}>
                <span
                  aria-hidden="true"
                  className="mt-2 size-1.5 shrink-0 rounded-full bg-brand"
                />
                <span className="text-foreground">{text}</span>
              </li>
            ))}
          </ul>

          <h3 className="mb-3 font-heading font-semibold text-lg">
            The wraps-console-access-role policy
          </h3>
          <p className="mb-4 text-muted-foreground text-sm">
            This is the policy for a default email deployment: sending enabled,
            event tracking enabled, no inbound, no archiving, no SMS. Enabling
            inbound, archiving, or SMS adds scoped statements for those
            services. The generator is open source; the DynamoDB, SQS,
            EventBridge, and S3 statements are scoped to{" "}
            <code className="rounded bg-muted px-1 py-0.5">wraps-email-*</code>{" "}
            /{" "}
            <code className="rounded bg-muted px-1 py-0.5">
              wraps-inbound-*
            </code>{" "}
            ARNs. The SES statements use{" "}
            <code className="rounded bg-muted px-1 py-0.5">
              Resource: &quot;*&quot;
            </code>{" "}
            because the SES API does not support resource-level permissions for
            these actions, not because we skipped scoping them.
          </p>

          <div className="mb-4 max-h-[28rem] overflow-y-auto rounded-md border">
            <CodeBlock
              className="h-auto border-0"
              data={[
                {
                  language: "json",
                  filename: "wraps-console-access-role-policy.json",
                  code: CONSOLE_ACCESS_POLICY_JSON,
                },
              ]}
              defaultValue="json"
            >
              <CodeBlockHeader>
                <CodeBlockFiles>
                  {(item) => (
                    <CodeBlockFilename
                      key={item.language}
                      value={item.language}
                    >
                      {item.filename}
                    </CodeBlockFilename>
                  )}
                </CodeBlockFiles>
                <CodeBlockCopyButton />
              </CodeBlockHeader>
              <CodeBlockBody>
                {(item) => (
                  <CodeBlockItem
                    key={item.language}
                    lineNumbers={false}
                    value={item.language}
                  >
                    <CodeBlockContent language={item.language}>
                      {item.code}
                    </CodeBlockContent>
                  </CodeBlockItem>
                )}
              </CodeBlockBody>
            </CodeBlock>
          </div>

          <p className="text-muted-foreground text-sm">
            Read the generator on{" "}
            <a
              className="text-brand-text underline underline-offset-2 hover:text-brand-text"
              href="https://github.com/wraps-team/wraps/blob/main/packages/cli/src/commands/platform/update-role.ts"
              rel="noopener noreferrer"
              target="_blank"
            >
              GitHub
            </a>
            .
          </p>
        </div>
      </div>
    </section>
  );
}
