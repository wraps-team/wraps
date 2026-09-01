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
  Clock,
  Code2,
  Layers,
  Radio,
  Send,
  UserPlus,
  Workflow,
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

// ── Code Examples ───────────────────────────────────────────────────

const singleEventCode = `import { createPlatformClient } from '@wraps.dev/client';

const client = createPlatformClient({
  apiKey: process.env.WRAPS_API_KEY,
});

const result = await client.track('purchase.completed', {
  contactEmail: 'alice@example.com',
  properties: {
    orderId: 'ord_12345',
    amount: 99.00,
    plan: 'pro',
  },
});

// { success: true, contactCreated: false, workflowsTriggered: 1, executionsResumed: 0 }`;

const createIfMissingCode = `await client.track('signup.completed', {
  contactEmail: 'new-user@example.com',
  contactName: 'Alice',
  createIfMissing: true,
  properties: {
    source: 'website',
    referrer: 'producthunt',
  },
});`;

const batchCode = `const result = await client.trackBatch([
  {
    name: 'page.viewed',
    contactEmail: 'alice@example.com',
    properties: { page: '/pricing' },
  },
  {
    name: 'page.viewed',
    contactEmail: 'bob@example.com',
    properties: { page: '/docs' },
  },
  {
    name: 'feature.used',
    contactId: 'con_abc123',
    properties: { feature: 'api-keys' },
  },
]);

// { success: true, processed: 3, workflowsTriggered: 0, executionsResumed: 0, errors: [] }`;

const nextjsCode = `// app/api/checkout/route.ts
import { createPlatformClient } from '@wraps.dev/client';
import { NextResponse } from 'next/server';

const client = createPlatformClient({
  apiKey: process.env.WRAPS_API_KEY,
});

export async function POST(request: Request) {
  const { email, plan, orderId } = await request.json();

  // ... process payment ...

  // Emit event to trigger post-purchase workflow
  await client.track('purchase.completed', {
    contactEmail: email,
    createIfMissing: true,
    properties: { plan, orderId },
  });

  return NextResponse.json({ success: true });
}`;

const webhookHandlerCode = `// app/api/stripe-webhook/route.ts
import { createPlatformClient } from '@wraps.dev/client';
import { NextResponse } from 'next/server';

const client = createPlatformClient({
  apiKey: process.env.WRAPS_API_KEY,
});

export async function POST(request: Request) {
  const event = await request.json();

  switch (event.type) {
    case 'customer.subscription.created':
      await client.track('subscription.created', {
        contactEmail: event.data.object.customer_email,
        createIfMissing: true,
        properties: {
          plan: event.data.object.items.data[0].price.id,
          stripeCustomerId: event.data.object.customer,
        },
      });
      break;

    case 'customer.subscription.deleted':
      await client.track('subscription.cancelled', {
        contactEmail: event.data.object.customer_email,
        properties: {
          cancelReason: event.data.object.cancellation_details?.reason,
        },
      });
      break;
  }

  return NextResponse.json({ received: true });
}`;

// ── Component ───────────────────────────────────────────────────────

export default function CustomEventsPageContent() {
  return (
    <DocsLayout>
      <div className="mx-auto max-w-4xl">
        {/* ── Header ──────────────────────────────────────────────── */}
        <section className="mb-12">
          <Badge className="mb-4" variant="outline">
            Guide
          </Badge>
          <h1 className="mb-4 font-bold text-4xl tracking-tight">
            Custom Events
          </h1>
          <p className="mb-6 text-lg text-muted-foreground">
            Emit events from your application to trigger workflows, track
            contact activity, and resume waiting automation steps.
          </p>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" />5 min read
            </span>
          </div>
        </section>

        {/* ── Overview ────────────────────────────────────────────── */}
        <section className="mb-12">
          <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
            <Radio className="h-6 w-6 text-primary" />
            Overview
          </h2>
          <p className="mb-4 text-muted-foreground">
            Custom events let you send signals from your application to the
            Wraps platform. When an event is received, three things happen:
          </p>
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Layers className="h-4 w-4 text-primary" />
                  Stored
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  The event is recorded on the contact&apos;s timeline with a
                  2-year TTL.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Workflow className="h-4 w-4 text-primary" />
                  Workflows triggered
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Any enabled workflow with an{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    event.received
                  </code>{" "}
                  trigger matching this event name starts a new execution.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Zap className="h-4 w-4 text-primary" />
                  Waiting steps resumed
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Any workflow execution waiting for this event on this contact
                  resumes down the &ldquo;yes&rdquo; branch.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* ── Sending an Event ────────────────────────────────────── */}
        <section className="mb-12">
          <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
            <Send className="h-6 w-6 text-primary" />
            Sending an Event
          </h2>
          <p className="mb-4 text-muted-foreground">
            Use{" "}
            <code className="rounded bg-muted px-1.5 py-0.5">
              client.track()
            </code>{" "}
            from the{" "}
            <code className="rounded bg-muted px-1.5 py-0.5">
              @wraps.dev/client
            </code>{" "}
            SDK to send events with full type safety.
          </p>

          <CodeBlock
            className="h-auto"
            data={[
              {
                language: "typescript",
                filename: "send-event.ts",
                code: singleEventCode,
              },
            ]}
            defaultValue="typescript"
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
                <CodeBlockItem key={item.language} value={item.language}>
                  <CodeBlockContent language={item.language}>
                    {item.code}
                  </CodeBlockContent>
                </CodeBlockItem>
              )}
            </CodeBlockBody>
          </CodeBlock>
        </section>

        {/* ── Request Schema ──────────────────────────────────────── */}
        <section className="mb-12">
          <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
            <Code2 className="h-6 w-6 text-primary" />
            Track Options
          </h2>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium">Field</th>
                  <th className="px-4 py-3 text-left font-medium">Type</th>
                  <th className="px-4 py-3 text-left font-medium">Required</th>
                  <th className="px-4 py-3 text-left font-medium">
                    Description
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <td className="px-4 py-3 font-mono text-sm">name</td>
                  <td className="px-4 py-3 text-muted-foreground">string</td>
                  <td className="px-4 py-3">Yes</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    First argument to{" "}
                    <code className="rounded bg-muted px-1 py-0.5">
                      track()
                    </code>
                    . Event name, e.g.{" "}
                    <code className="rounded bg-muted px-1 py-0.5">
                      purchase.completed
                    </code>
                    . Max 255 chars.
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="px-4 py-3 font-mono text-sm">contactId</td>
                  <td className="px-4 py-3 text-muted-foreground">string</td>
                  <td className="px-4 py-3">
                    One of{" "}
                    <code className="rounded bg-muted px-1 py-0.5">
                      contactId
                    </code>{" "}
                    or{" "}
                    <code className="rounded bg-muted px-1 py-0.5">
                      contactEmail
                    </code>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Contact ID to associate the event with.
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="px-4 py-3 font-mono text-sm">contactEmail</td>
                  <td className="px-4 py-3 text-muted-foreground">string</td>
                  <td className="px-4 py-3">
                    Alternative to{" "}
                    <code className="rounded bg-muted px-1 py-0.5">
                      contactId
                    </code>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Look up the contact by email address.
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="px-4 py-3 font-mono text-sm">contactName</td>
                  <td className="px-4 py-3 text-muted-foreground">string</td>
                  <td className="px-4 py-3">No</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Sets{" "}
                    <code className="rounded bg-muted px-1 py-0.5">
                      firstName
                    </code>{" "}
                    when{" "}
                    <code className="rounded bg-muted px-1 py-0.5">
                      createIfMissing
                    </code>{" "}
                    creates a new contact.
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="px-4 py-3 font-mono text-sm">
                    createIfMissing
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">boolean</td>
                  <td className="px-4 py-3">No</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    If{" "}
                    <code className="rounded bg-muted px-1 py-0.5">true</code>{" "}
                    and the contact doesn&apos;t exist, create one from{" "}
                    <code className="rounded bg-muted px-1 py-0.5">
                      contactEmail
                    </code>
                    . Defaults to{" "}
                    <code className="rounded bg-muted px-1 py-0.5">false</code>.
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-mono text-sm">properties</td>
                  <td className="px-4 py-3 text-muted-foreground">object</td>
                  <td className="px-4 py-3">No</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Arbitrary key-value data attached to the event. Passed to
                    workflows as event data.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Auto-Creating Contacts ──────────────────────────────── */}
        <section className="mb-12">
          <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
            <UserPlus className="h-6 w-6 text-primary" />
            Auto-Creating Contacts
          </h2>
          <p className="mb-4 text-muted-foreground">
            Set{" "}
            <code className="rounded bg-muted px-1.5 py-0.5">
              createIfMissing: true
            </code>{" "}
            to create a new contact when one doesn&apos;t exist. Requires{" "}
            <code className="rounded bg-muted px-1.5 py-0.5">contactEmail</code>
            . The response includes{" "}
            <code className="rounded bg-muted px-1.5 py-0.5">
              contactCreated: true
            </code>{" "}
            when a contact was created.
          </p>

          <CodeBlock
            className="h-auto"
            data={[
              {
                language: "typescript",
                filename: "create-if-missing.ts",
                code: createIfMissingCode,
              },
            ]}
            defaultValue="typescript"
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
                <CodeBlockItem key={item.language} value={item.language}>
                  <CodeBlockContent language={item.language}>
                    {item.code}
                  </CodeBlockContent>
                </CodeBlockItem>
              )}
            </CodeBlockBody>
          </CodeBlock>

          <div className="mt-4 rounded-lg border border-primary/50 bg-primary/10 p-4">
            <p className="text-sm text-foreground">
              <strong>Tip:</strong> This is useful for signup flows where the
              contact may not exist in Wraps yet. The event fires, the contact
              is created, and any matching workflows start immediately.
            </p>
          </div>
        </section>

        {/* ── Batch Events ────────────────────────────────────────── */}
        <section className="mb-12">
          <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
            <Layers className="h-6 w-6 text-primary" />
            Batch Events
          </h2>
          <p className="mb-4 text-muted-foreground">
            Send multiple events in a single request with{" "}
            <code className="rounded bg-muted px-1.5 py-0.5">
              client.trackBatch()
            </code>
            . Contact resolution, workflow matching, and execution resumption
            are all batched for efficiency.
          </p>

          <CodeBlock
            className="h-auto"
            data={[
              {
                language: "typescript",
                filename: "batch-events.ts",
                code: batchCode,
              },
            ]}
            defaultValue="typescript"
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
                <CodeBlockItem key={item.language} value={item.language}>
                  <CodeBlockContent language={item.language}>
                    {item.code}
                  </CodeBlockContent>
                </CodeBlockItem>
              )}
            </CodeBlockBody>
          </CodeBlock>

          <div className="mt-4 rounded-lg border border-primary/50 bg-primary/10 p-4">
            <p className="text-sm text-foreground">
              <strong>Note:</strong> Batch does not support{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                createIfMissing
              </code>
              . Contacts must already exist when using the batch endpoint.
            </p>
          </div>
        </section>

        {/* ── How Events Connect to Workflows ─────────────────────── */}
        <section className="mb-12">
          <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
            <Workflow className="h-6 w-6 text-primary" />
            How Events Connect to Workflows
          </h2>
          <p className="mb-4 text-muted-foreground">
            Events integrate with workflows in two ways:
          </p>

          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  1. Trigger new workflows
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-2 text-sm text-muted-foreground">
                  Create a workflow with the{" "}
                  <code className="rounded bg-muted px-1 py-0.5">
                    event.received
                  </code>{" "}
                  trigger type and set the event name to match. When the event
                  fires for a contact, a new workflow execution begins.
                </p>
                <p className="text-sm text-muted-foreground">
                  The event&apos;s{" "}
                  <code className="rounded bg-muted px-1 py-0.5">
                    properties
                  </code>{" "}
                  are passed as event data and available in workflow step
                  conditions.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  2. Resume waiting steps
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Workflows can include a &ldquo;Wait for Event&rdquo; step that
                  pauses execution until a specific event is received for that
                  contact. When the matching event arrives, execution resumes
                  down the &ldquo;yes&rdquo; branch. If the timeout expires
                  first, it takes the &ldquo;no&rdquo; branch.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* ── Event Limits ────────────────────────────────────────── */}
        <section className="mb-12">
          <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
            <Clock className="h-6 w-6 text-primary" />
            Event Limits
          </h2>
          <p className="mb-4 text-muted-foreground">
            Custom events are unmetered on every plan that has the feature —
            there is no monthly quota, grace period, or hard cap. Free
            doesn&apos;t include event tracking; Pro and Business do.
          </p>
        </section>

        {/* ── Examples ────────────────────────────────────────────── */}
        <section className="mb-12">
          <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
            <Code2 className="h-6 w-6 text-primary" />
            Examples
          </h2>

          <div className="space-y-8">
            <div>
              <h3 className="mb-3 font-semibold text-lg">
                Next.js checkout handler
              </h3>
              <p className="mb-3 text-sm text-muted-foreground">
                Emit an event after processing a payment to kick off a
                post-purchase workflow.
              </p>
              <CodeBlock
                className="h-auto"
                data={[
                  {
                    language: "typescript",
                    filename: "app/api/checkout/route.ts",
                    code: nextjsCode,
                  },
                ]}
                defaultValue="typescript"
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
                    <CodeBlockItem key={item.language} value={item.language}>
                      <CodeBlockContent language={item.language}>
                        {item.code}
                      </CodeBlockContent>
                    </CodeBlockItem>
                  )}
                </CodeBlockBody>
              </CodeBlock>
            </div>

            <div>
              <h3 className="mb-3 font-semibold text-lg">
                Stripe webhook handler
              </h3>
              <p className="mb-3 text-sm text-muted-foreground">
                Forward Stripe subscription events to Wraps for lifecycle
                automation.
              </p>
              <CodeBlock
                className="h-auto"
                data={[
                  {
                    language: "typescript",
                    filename: "app/api/stripe-webhook/route.ts",
                    code: webhookHandlerCode,
                  },
                ]}
                defaultValue="typescript"
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
                    <CodeBlockItem key={item.language} value={item.language}>
                      <CodeBlockContent language={item.language}>
                        {item.code}
                      </CodeBlockContent>
                    </CodeBlockItem>
                  )}
                </CodeBlockBody>
              </CodeBlock>
            </div>
          </div>
        </section>

        {/* ── Event Naming Conventions ─────────────────────────────── */}
        <section className="mb-12">
          <h2 className="mb-4 font-bold text-2xl">Event Naming Conventions</h2>
          <p className="mb-4 text-muted-foreground">
            Use dot-separated{" "}
            <code className="rounded bg-muted px-1.5 py-0.5">
              resource.action
            </code>{" "}
            names. Keep them lowercase and consistent across your application.
          </p>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium">Event</th>
                  <th className="px-4 py-3 text-left font-medium">Use case</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <td className="px-4 py-3 font-mono text-sm">
                    signup.completed
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    User finished onboarding
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="px-4 py-3 font-mono text-sm">
                    purchase.completed
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Order placed successfully
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="px-4 py-3 font-mono text-sm">
                    subscription.cancelled
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    User cancelled their plan
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="px-4 py-3 font-mono text-sm">feature.used</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Specific feature was activated
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="px-4 py-3 font-mono text-sm">
                    trial.expiring
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Trial ends within 3 days
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-mono text-sm">invoice.paid</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Payment processed successfully
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Next Steps ──────────────────────────────────────────── */}
        <section className="mb-12">
          <h2 className="mb-6 font-bold text-2xl">Next Steps</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="transition-colors hover:border-primary/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Workflow className="h-4 w-4 text-primary" />
                  Building Workflows
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-3 text-sm text-muted-foreground">
                  Create automation workflows that trigger on your custom
                  events.
                </p>
                <Button asChild size="sm" variant="outline">
                  <Link href="/docs/guides/workflows">
                    Workflow guide
                    <ArrowRight className="ml-1 h-3 w-3" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
            <Card className="transition-colors hover:border-primary/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Zap className="h-4 w-4 text-primary" />
                  Webhooks
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-3 text-sm text-muted-foreground">
                  Receive real-time delivery events at your HTTPS endpoint.
                </p>
                <Button asChild size="sm" variant="outline">
                  <Link href="/docs/guides/webhooks">
                    Webhooks guide
                    <ArrowRight className="ml-1 h-3 w-3" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </DocsLayout>
  );
}
