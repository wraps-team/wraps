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
  ArrowRight,
  Bell,
  Clock,
  GitBranch,
  Mail,
  MessageSquare,
  Play,
  Settings,
  Upload,
  Users,
  Webhook,
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

const welcomeWorkflow = `// wraps/workflows/welcome-sequence.ts
import {
  defineWorkflow,
  sendEmail,
  delay,
  condition,
  exit,
  waitForEvent,
} from '@wraps.dev/client';

export default defineWorkflow({
  name: 'Welcome Sequence',
  trigger: {
    type: 'contact.created',
  },
  settings: {
    maxEnrollments: 1, // Each contact enters once
  },
  steps: [
    sendEmail('welcome', { template: 'welcome-email' }),
    delay('wait-1-day', { days: 1 }),
    condition('check-activated', {
      field: 'contact.hasActivated',
      operator: 'equals',
      value: true,
      branches: {
        yes: [exit('already-active')],
        no: [
          sendEmail('activation-reminder', { template: 'activate' }),
          delay('wait-2-days', { days: 2 }),
          sendEmail('final-reminder', { template: 'last-chance' }),
        ],
      },
    }),
  ],
});`;

const validateAndPush = `# Validate workflow definitions
wraps email workflows validate

# Push to Wraps Platform
wraps email workflows push`;

const reengagementWorkflow = `import {
  defineWorkflow,
  sendEmail,
  delay,
  condition,
  exit,
  waitForEmailEngagement,
} from '@wraps.dev/client';

export default defineWorkflow({
  name: 'Re-engagement Campaign',
  trigger: {
    type: 'segment.entered',
    segmentId: 'inactive-30-days',
  },
  steps: [
    sendEmail('win-back', { template: 'we-miss-you' }),
    waitForEmailEngagement('check-opened', {
      emailStepId: 'win-back',
      engagementType: 'opened',
      timeout: { days: 3 },
    }),
    condition('was-opened', {
      field: 'steps.check-opened.engaged',
      operator: 'equals',
      value: true,
      branches: {
        yes: [
          sendEmail('special-offer', { template: 'comeback-offer' }),
          exit('re-engaged'),
        ],
        no: [
          delay('wait-week', { days: 7 }),
          sendEmail('final-attempt', { template: 'last-chance' }),
          exit('campaign-complete'),
        ],
      },
    }),
  ],
});`;

const stepHelpers = [
  {
    name: "sendEmail(id, config)",
    description: "Send an email using a template.",
    config: "template, from?, fromName?",
    icon: Mail,
  },
  {
    name: "sendSms(id, config)",
    description: "Send an SMS message.",
    config: "template?, message?",
    icon: MessageSquare,
  },
  {
    name: "delay(id, duration)",
    description: "Wait before continuing.",
    config: "{ days?, hours?, minutes? }",
    icon: Clock,
  },
  {
    name: "condition(id, config)",
    description: "Branch based on a condition.",
    config: "field, operator, value, branches: { yes: [...], no: [...] }",
    icon: GitBranch,
  },
  {
    name: "waitForEvent(id, config)",
    description: "Pause until an event occurs.",
    config: "eventName, timeout?",
    icon: Bell,
  },
  {
    name: "waitForEmailEngagement(id, config)",
    description: "Wait for email open or click.",
    config: "emailStepId, engagementType ('opened' | 'clicked'), timeout?",
    icon: Mail,
  },
  {
    name: "exit(id, config?)",
    description: "End the workflow.",
    config: "reason?, markAs? ('completed' | 'cancelled')",
    icon: Zap,
  },
  {
    name: "updateContact(id, config)",
    description: "Modify contact fields.",
    config:
      "updates: [{ field, operation: 'set' | 'increment' | 'append', value }]",
    icon: Users,
  },
  {
    name: "subscribeTopic(id, config)",
    description: "Subscribe contact to a topic.",
    config: "topicId, channel ('email' | 'sms')",
    icon: Bell,
  },
  {
    name: "unsubscribeTopic(id, config)",
    description: "Unsubscribe contact from a topic.",
    config: "topicId, channel ('email' | 'sms')",
    icon: Bell,
  },
  {
    name: "webhook(id, config)",
    description: "Call an external webhook.",
    config: "url, method? ('POST' default), headers?, body?",
    icon: Webhook,
  },
];

export default function WorkflowsPageContent() {
  return (
    <DocsLayout>
      {/* Page Header */}
      <div className="mb-12">
        <Badge className="mb-4" variant="outline">
          Guide
        </Badge>
        <h1 className="mb-4 font-bold text-4xl tracking-tight">
          Building Workflows
        </h1>
        <p className="text-lg text-muted-foreground">
          Define automated email and SMS sequences as code using a declarative
          DSL. Build drip campaigns, onboarding sequences, and re-engagement
          flows that run on the Wraps Platform.
        </p>
      </div>

      {/* Defining a Workflow */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <Play className="h-6 w-6 text-primary" />
          Defining a Workflow
        </h2>
        <p className="mb-4 text-muted-foreground">
          A workflow is a sequence of steps triggered by an event. Each workflow
          is defined in a TypeScript file using the{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">defineWorkflow</code>{" "}
          helper and exported as the default export.
        </p>
        <CodeExample
          code={welcomeWorkflow}
          filename="wraps/workflows/welcome-sequence.ts"
          language="typescript"
        />
        <div className="mt-4 rounded-lg border-primary border-l-4 bg-primary/10 p-4">
          <p className="font-medium text-sm">Type-safe workflow definitions</p>
          <p className="mt-1 text-muted-foreground text-sm">
            All step helpers are fully typed. Your editor provides
            autocompletion for configuration options, trigger types, and
            operator values.
          </p>
        </div>
      </section>

      {/* Trigger Types */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">Trigger Types</h2>
        <p className="mb-4 text-muted-foreground">
          Triggers determine when a contact enters a workflow. Each workflow has
          exactly one trigger.
        </p>
        <div className="overflow-x-auto mb-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="pb-3 pr-4 text-left font-medium">Type</th>
                <th className="pb-3 text-left font-medium">Description</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr className="border-b">
                <td className="py-3 pr-4 font-medium text-foreground">
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    contact.created
                  </code>
                </td>
                <td className="py-3">When a new contact is added</td>
              </tr>
              <tr className="border-b">
                <td className="py-3 pr-4 font-medium text-foreground">
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    contact.updated
                  </code>
                </td>
                <td className="py-3">When contact fields change</td>
              </tr>
              <tr className="border-b">
                <td className="py-3 pr-4 font-medium text-foreground">
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    event.received
                  </code>
                </td>
                <td className="py-3">When a custom event is received</td>
              </tr>
              <tr className="border-b">
                <td className="py-3 pr-4 font-medium text-foreground">
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    segment.entered
                  </code>
                </td>
                <td className="py-3">When a contact enters a segment</td>
              </tr>
              <tr className="border-b">
                <td className="py-3 pr-4 font-medium text-foreground">
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    segment.exited
                  </code>
                </td>
                <td className="py-3">When a contact exits a segment</td>
              </tr>
              <tr>
                <td className="py-3 pr-4 font-medium text-foreground">
                  <code className="rounded bg-muted px-1.5 py-0.5">manual</code>
                </td>
                <td className="py-3">Manually triggered via API</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Step Helpers */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <Settings className="h-6 w-6 text-primary" />
          Step Helpers
        </h2>
        <p className="mb-4 text-muted-foreground">
          Wraps provides 11 step helpers to build your workflow logic. Each
          helper takes a unique step ID and a configuration object.
        </p>
        <div className="space-y-3">
          {stepHelpers.map((step, index) => {
            const Icon = step.icon;
            return (
              <Card key={step.name}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground text-xs">
                          {index + 1}.
                        </span>
                        <code className="font-medium text-sm">{step.name}</code>
                      </div>
                      <p className="mt-1 text-muted-foreground text-sm">
                        {step.description}
                      </p>
                      <p className="mt-1 text-muted-foreground text-xs">
                        Config:{" "}
                        <code className="rounded bg-muted px-1 py-0.5">
                          {step.config}
                        </code>
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Validate & Push */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <Upload className="h-6 w-6 text-primary" />
          Validate & Push
        </h2>
        <p className="mb-4 text-muted-foreground">
          Before deploying, validate your workflow definitions to catch errors
          like missing templates, invalid step references, or circular
          dependencies. Then push to the Wraps Platform.
        </p>
        <CodeExample
          code={validateAndPush}
          filename="terminal.sh"
          language="bash"
        />
        <div className="mt-4 rounded-lg border-primary border-l-4 bg-primary/10 p-4">
          <p className="font-medium text-sm">Validation checks:</p>
          <ul className="mt-2 space-y-1 text-muted-foreground text-sm">
            <li>All referenced templates exist in your templates directory</li>
            <li>Step IDs are unique within each workflow</li>
            <li>Condition branches reference valid step IDs</li>
            <li>
              <code className="rounded bg-muted px-1 py-0.5">
                waitForEmailEngagement
              </code>{" "}
              references a valid{" "}
              <code className="rounded bg-muted px-1 py-0.5">sendEmail</code>{" "}
              step
            </li>
          </ul>
        </div>
      </section>

      {/* Re-engagement Example */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">
          Example: Re-engagement Campaign
        </h2>
        <p className="mb-4 text-muted-foreground">
          This workflow targets contacts who have been inactive for 30 days. It
          sends a win-back email, waits for engagement, and branches based on
          whether the contact opened it.
        </p>
        <CodeExample
          code={reengagementWorkflow}
          filename="wraps/workflows/re-engagement.ts"
          language="typescript"
        />
        <div className="mt-4">
          <h3 className="mb-3 font-medium text-lg">How this workflow runs:</h3>
          <ol className="list-decimal space-y-2 pl-6 text-muted-foreground">
            <li>
              Contact enters the{" "}
              <code className="rounded bg-muted px-1 py-0.5">
                inactive-30-days
              </code>{" "}
              segment, triggering the workflow
            </li>
            <li>A "we miss you" email is sent immediately</li>
            <li>
              The workflow waits up to 3 days for the contact to open the email
            </li>
            <li>
              If opened: a special offer email is sent and the workflow ends
            </li>
            <li>
              If not opened: the workflow waits 7 more days, sends a final
              attempt, then ends
            </li>
          </ol>
        </div>
      </section>

      {/* Next Steps */}
      <section className="mb-12">
        <h2 className="mb-6 font-bold text-2xl">Next Steps</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="transition-colors hover:border-primary/50">
            <CardHeader>
              <CardTitle className="text-lg">Templates as Code</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-muted-foreground text-sm">
                Write email templates as React components for use in workflows.
              </p>
              <Button asChild variant="outline">
                <Link href="/docs/guides/templates">
                  Template Guide
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
          <Card className="transition-colors hover:border-primary/50">
            <CardHeader>
              <CardTitle className="text-lg">
                Preventing Duplicate Sends
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-muted-foreground text-sm">
                Workflow steps deduplicate themselves. Sends from your own
                background workers do not — here is how to make them.
              </p>
              <Button asChild variant="outline">
                <Link href="/docs/guides/idempotency">
                  Idempotency Guide
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
