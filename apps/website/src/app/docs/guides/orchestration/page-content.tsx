"use client";

import { Badge } from "@wraps/ui/components/ui/badge";
import { Button } from "@wraps/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import {
  ArrowDown,
  ArrowRight,
  GitBranch,
  Layers,
  Mail,
  MessageSquare,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { DocsLayout } from "@/components/docs-layout";
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

function CodeExample({
  code,
  filename,
  language = "typescript",
}: {
  code: string;
  filename: string;
  language?: string;
}) {
  return (
    <CodeBlock
      className="h-auto"
      data={[{ language, filename, code }]}
      defaultValue={language}
    >
      <CodeBlockHeader>
        <CodeBlockFiles>
          {(item) => (
            <CodeBlockFilename key={item.language} value={item.language}>
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
  );
}

const basicCascade = `import { defineWorkflow, cascade } from '@wraps.dev/client';

export default defineWorkflow({
  name: 'Cart Recovery Cascade',
  trigger: { type: 'event', eventName: 'cart.abandoned' },

  steps: [
    ...cascade('recover-cart', {
      channels: [
        {
          type: 'email',
          template: 'cart-recovery',
          waitFor: { hours: 2 },
          engagement: 'opened',
        },
        {
          type: 'sms',
          template: 'cart-sms-reminder',
        },
      ],
    }),
  ],
});`;

const expandedSteps = `// What cascade() expands to:
//
// 1. sendEmail('recover-cart-email', { template: 'cart-recovery' })
// 2. waitForEmailEngagement('recover-cart-email-wait', {
//      emailStepId: 'recover-cart-email',
//      engagementType: 'opened',
//      timeout: { hours: 2 },
//    })
// 3. condition('recover-cart-email-check', {
//      field: 'steps.recover-cart-email-wait.engaged',
//      operator: 'equals',
//      value: true,
//      branches: {
//        yes: [exit('recover-cart-engaged')],
//      },
//    })
// 4. sendSms('recover-cart-sms', { template: 'cart-sms-reminder' })`;

const threeChannelCascade = `import { defineWorkflow, cascade } from '@wraps.dev/client';

export default defineWorkflow({
  name: 'Urgent Notification',
  trigger: { type: 'event', eventName: 'payment.failed' },

  steps: [
    ...cascade('payment-alert', {
      channels: [
        {
          type: 'email',
          template: 'payment-failed',
          waitFor: { hours: 4 },
          engagement: 'clicked',
        },
        {
          type: 'sms',
          template: 'payment-failed-sms',
          waitFor: { hours: 2 },
        },
        {
          type: 'email',
          template: 'payment-final-notice',
        },
      ],
    }),
  ],
});`;

const mixedWorkflow = `import {
  defineWorkflow,
  cascade,
  sendEmail,
  delay,
  condition,
  exit,
} from '@wraps.dev/client';

export default defineWorkflow({
  name: 'Onboarding with Cascade',
  trigger: { type: 'contact_created' },

  steps: [
    // Standard welcome email
    sendEmail('welcome', { template: 'welcome' }),
    delay('wait-1-day', { days: 1 }),

    // Check if user activated
    condition('check-activated', {
      field: 'contact.hasActivated',
      operator: 'equals',
      value: true,
      branches: {
        yes: [exit('activated')],
        no: [
          // Cascade: try email, fall back to SMS
          ...cascade('activation-nudge', {
            channels: [
              {
                type: 'email',
                template: 'activation-reminder',
                waitFor: { hours: 6 },
                engagement: 'opened',
              },
              {
                type: 'sms',
                template: 'activate-now-sms',
              },
            ],
          }),
        ],
      },
    }),
  ],
});`;

export default function OrchestrationPageContent() {
  return (
    <DocsLayout>
      {/* Page Header */}
      <div className="mb-12">
        <Badge className="mb-4" variant="outline">
          Guide
        </Badge>
        <h1 className="mb-4 font-bold text-4xl tracking-tight">
          Cross-Channel Orchestration
        </h1>
        <p className="text-lg text-muted-foreground">
          Build cascading notification flows that try channels in order and stop
          when engagement is detected. One function call, zero new
          infrastructure.
        </p>
      </div>

      {/* What is a Cascade? */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <Layers className="h-6 w-6 text-primary" />
          What is a Cascade?
        </h2>
        <p className="mb-4 text-muted-foreground">
          A cascade is an ordered sequence of notification channels. Your
          message is sent on the first channel (usually email), and if the user
          doesn't engage within a timeout, it falls back to the next channel
          (usually SMS). The cascade stops as soon as engagement is detected.
        </p>
        <div className="flex flex-col items-center gap-2 rounded-lg border bg-muted/30 p-6">
          <div className="flex items-center gap-2 rounded-lg border bg-background px-4 py-2">
            <Mail className="h-4 w-4 text-info" />
            <span className="font-medium text-sm">Send Email</span>
          </div>
          <ArrowDown className="h-4 w-4 text-muted-foreground" />
          <div className="flex items-center gap-2 rounded-lg border bg-background px-4 py-2">
            <GitBranch className="h-4 w-4 text-brand-text" />
            <span className="font-medium text-sm">Opened?</span>
          </div>
          <div className="flex gap-8">
            <div className="flex flex-col items-center gap-1">
              <span className="rounded bg-success/10 px-2 py-0.5 font-medium text-success text-xs">
                Yes
              </span>
              <span className="text-muted-foreground text-xs">Stop</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <span className="rounded bg-destructive/10 px-2 py-0.5 font-medium text-destructive text-xs">
                No
              </span>
              <ArrowDown className="h-3 w-3 text-muted-foreground" />
              <div className="flex items-center gap-2 rounded-lg border bg-background px-4 py-2">
                <MessageSquare className="h-4 w-4 text-success" />
                <span className="font-medium text-sm">Send SMS</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* The cascade() Helper */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <Zap className="h-6 w-6 text-primary" />
          The cascade() Helper
        </h2>
        <p className="mb-4 text-muted-foreground">
          The <code className="rounded bg-muted px-1.5 py-0.5">cascade()</code>{" "}
          function is a compile-time helper that expands into standard workflow
          steps. No new infrastructure or step types are needed — it uses the
          same primitives you already know.
        </p>
        <CodeExample
          code={basicCascade}
          filename="wraps/workflows/cart-recovery.ts"
          language="typescript"
        />
        <div className="mt-4 rounded-lg border-primary border-l-4 bg-primary/10 p-4">
          <p className="font-medium text-sm">Zero runtime overhead</p>
          <p className="mt-1 text-muted-foreground text-sm">
            <code className="rounded bg-muted px-1 py-0.5">cascade()</code> runs
            at definition time, not execution time. It returns an array of
            standard step definitions that your existing workflow processor
            already understands.
          </p>
        </div>
      </section>

      {/* How It Works */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">How It Works</h2>
        <p className="mb-4 text-muted-foreground">
          Under the hood,{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">cascade()</code>{" "}
          expands each channel into a send → wait → check → fallback sequence.
          The last channel in the array is the final fallback and has no wait or
          check.
        </p>
        <CodeExample
          code={expandedSteps}
          filename="expansion.ts"
          language="typescript"
        />
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="pb-3 pr-4 text-left font-medium">Option</th>
                <th className="pb-3 pr-4 text-left font-medium">Type</th>
                <th className="pb-3 text-left font-medium">Description</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr className="border-b">
                <td className="py-3 pr-4 font-medium text-foreground">
                  <code className="rounded bg-muted px-1.5 py-0.5">type</code>
                </td>
                <td className="py-3 pr-4">
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    'email' | 'sms'
                  </code>
                </td>
                <td className="py-3">Channel type for this step</td>
              </tr>
              <tr className="border-b">
                <td className="py-3 pr-4 font-medium text-foreground">
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    template
                  </code>
                </td>
                <td className="py-3 pr-4">
                  <code className="rounded bg-muted px-1.5 py-0.5">string</code>
                </td>
                <td className="py-3">Template slug to send</td>
              </tr>
              <tr className="border-b">
                <td className="py-3 pr-4 font-medium text-foreground">
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    waitFor
                  </code>
                </td>
                <td className="py-3 pr-4">
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    DurationConfig
                  </code>
                </td>
                <td className="py-3">
                  How long to wait for engagement before trying next channel
                </td>
              </tr>
              <tr className="border-b">
                <td className="py-3 pr-4 font-medium text-foreground">
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    engagement
                  </code>
                </td>
                <td className="py-3 pr-4">
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    'opened' | 'clicked'
                  </code>
                </td>
                <td className="py-3">
                  What counts as engagement (email only, default: 'opened')
                </td>
              </tr>
              <tr>
                <td className="py-3 pr-4 font-medium text-foreground">
                  <code className="rounded bg-muted px-1.5 py-0.5">from</code>,{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    senderId
                  </code>
                </td>
                <td className="py-3 pr-4">
                  <code className="rounded bg-muted px-1.5 py-0.5">string</code>
                </td>
                <td className="py-3">Channel-specific sender overrides</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Examples */}
      <section className="mb-12">
        <h2 className="mb-6 font-bold text-2xl">Examples</h2>

        <div className="space-y-8">
          <div>
            <h3 className="mb-3 font-medium text-lg">3-Channel Cascade</h3>
            <p className="mb-4 text-muted-foreground">
              For critical notifications, cascade through multiple channels.
              Each non-final channel waits for engagement before falling back.
            </p>
            <CodeExample
              code={threeChannelCascade}
              filename="wraps/workflows/payment-alert.ts"
              language="typescript"
            />
          </div>

          <div>
            <h3 className="mb-3 font-medium text-lg">
              Mixed Workflow with Cascade
            </h3>
            <p className="mb-4 text-muted-foreground">
              Cascades compose naturally with other workflow steps. Use them
              inside condition branches, after delays, or anywhere you need
              multi-channel delivery.
            </p>
            <CodeExample
              code={mixedWorkflow}
              filename="wraps/workflows/onboarding.ts"
              language="typescript"
            />
          </div>
        </div>
      </section>

      {/* Best Practices */}
      <section className="mb-12">
        <h2 className="mb-6 font-bold text-2xl">Best Practices</h2>
        <div className="space-y-4">
          <div className="rounded-lg border p-4">
            <h4 className="mb-1 font-medium">
              Start with the least intrusive channel
            </h4>
            <p className="text-muted-foreground text-sm">
              Email first, SMS second. Email is free (or near-free) and
              non-intrusive. SMS costs more and should be reserved for users who
              didn't engage with email.
            </p>
          </div>
          <div className="rounded-lg border p-4">
            <h4 className="mb-1 font-medium">Set reasonable timeouts</h4>
            <p className="text-muted-foreground text-sm">
              2-4 hours is typical for email engagement checks. Too short and
              you'll spam users who just haven't checked their inbox yet. Too
              long and the message loses urgency.
            </p>
          </div>
          <div className="rounded-lg border p-4">
            <h4 className="mb-1 font-medium">
              Use clicked for high-intent actions
            </h4>
            <p className="text-muted-foreground text-sm">
              For transactional notifications (payment failures, account
              security), use{" "}
              <code className="rounded bg-muted px-1 py-0.5">
                engagement: 'clicked'
              </code>{" "}
              to ensure the user actually took action, not just opened the
              email.
            </p>
          </div>
          <div className="rounded-lg border p-4">
            <h4 className="mb-1 font-medium">Keep cascades short</h4>
            <p className="text-muted-foreground text-sm">
              2-3 channels is ideal. More than that and you risk annoying users.
              If they didn't engage after 3 attempts across different channels,
              they probably don't want to hear from you right now.
            </p>
          </div>
        </div>
      </section>

      {/* Next Steps */}
      <section className="mb-12">
        <h2 className="mb-6 font-bold text-2xl">Next Steps</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="transition-colors hover:border-primary/50">
            <CardHeader>
              <CardTitle className="text-lg">Building Workflows</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-muted-foreground text-sm">
                Learn the full workflow DSL including triggers, conditions, and
                all step helpers.
              </p>
              <Button asChild variant="outline">
                <Link href="/docs/guides/workflows">
                  Workflow Guide
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="transition-colors hover:border-primary/50">
            <CardHeader>
              <CardTitle className="text-lg">Platform SDK</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-muted-foreground text-sm">
                Full reference for the Wraps client SDK and workflow API.
              </p>
              <Button asChild variant="outline">
                <Link href="/docs/client-sdk-reference">
                  SDK Reference
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>
    </DocsLayout>
  );
}
