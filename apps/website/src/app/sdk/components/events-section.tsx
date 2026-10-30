import { ArrowRight } from "lucide-react";
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
  CodeBlockSelect,
  CodeBlockSelectContent,
  CodeBlockSelectItem,
  CodeBlockSelectTrigger,
  CodeBlockSelectValue,
} from "@/components/ui/shadcn-io/code-block";

const trackCode = `import { createPlatformClient } from "@wraps.dev/client";

const wraps = createPlatformClient({ apiKey: process.env.WRAPS_API_KEY });

// Emit an event — triggers any workflow listening for "order.completed"
await wraps.track("order.completed", {
  contactEmail: "alice@example.com",
  properties: {
    orderId: "ord_8f3k2",
    amount: 149,
    plan: "pro",
  },
});`;

const batchCode = `// Track multiple events in one request
await wraps.trackBatch([
  {
    name: "page.viewed",
    contactEmail: "alice@example.com",
    properties: { page: "/pricing" },
  },
  {
    name: "feature.used",
    contactEmail: "bob@example.com",
    properties: { feature: "api-keys" },
  },
]);`;

const workflowCode = `// This workflow triggers automatically when "order.completed" fires
export default defineWorkflow({
  name: "Post-Purchase",
  trigger: { type: "event", eventName: "order.completed" },

  steps: [
    sendEmail("receipt", { template: "order-receipt" }),
    delay("wait-3d", { days: 3 }),
    sendEmail("review", { template: "ask-for-review" }),
  ],
});`;

const codeData = [
  { language: "track", filename: "app/checkout.ts", code: trackCode },
  { language: "batch", filename: "app/analytics.ts", code: batchCode },
  {
    language: "workflow",
    filename: "wraps/workflows/post-purchase.ts",
    code: workflowCode,
  },
];

export function SdkEventsSection() {
  return (
    <section className="relative py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mb-14">
          <SectionKicker>Trigger</SectionKicker>
          <h2 className="font-heading font-semibold text-2xl tracking-tight sm:text-3xl">
            Custom Events
          </h2>
        </div>

        <div className="grid items-start gap-12 lg:grid-cols-2">
          <div className="space-y-6">
            <p className="text-lg text-muted-foreground">
              Emit events from anywhere in your app.{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
                wraps.track()
              </code>{" "}
              fires the event &mdash; workflows listening for that event name
              execute automatically.
            </p>

            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div
                  aria-hidden="true"
                  className="mt-2 h-px w-3 shrink-0 bg-brand"
                />
                <p className="text-sm">
                  <span className="font-medium">Any event name</span>
                  <span className="text-muted-foreground">
                    {" "}
                    &mdash;{" "}
                    <code className="font-mono text-xs">user.signed_up</code>,{" "}
                    <code className="font-mono text-xs">order.completed</code>,{" "}
                    <code className="font-mono text-xs">trial.expiring</code>
                  </span>
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div
                  aria-hidden="true"
                  className="mt-2 h-px w-3 shrink-0 bg-brand"
                />
                <p className="text-sm">
                  <span className="font-medium">Typed properties</span>
                  <span className="text-muted-foreground">
                    {" "}
                    &mdash; attach any JSON payload, available in templates and
                    conditions
                  </span>
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div
                  aria-hidden="true"
                  className="mt-2 h-px w-3 shrink-0 bg-brand"
                />
                <p className="text-sm">
                  <span className="font-medium">Batch support</span>
                  <span className="text-muted-foreground">
                    {" "}
                    &mdash; send multiple events in a single API call
                  </span>
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div
                  aria-hidden="true"
                  className="mt-2 h-px w-3 shrink-0 bg-brand"
                />
                <p className="text-sm">
                  <span className="font-medium">
                    Automatic contact resolution
                  </span>
                  <span className="text-muted-foreground">
                    {" "}
                    &mdash; match events to contacts by email or ID
                  </span>
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-muted/40 p-4">
              <p className="text-muted-foreground text-sm">
                <span className="font-medium text-foreground">
                  How it works:
                </span>{" "}
                Call{" "}
                <code className="font-mono text-xs">
                  wraps.track("order.completed")
                </code>{" "}
                from your checkout flow. Any workflow with{" "}
                <code className="font-mono text-xs">
                  trigger: {"{"} eventName: "order.completed" {"}"}
                </code>{" "}
                runs automatically.
              </p>
            </div>

            <a
              className="inline-flex items-center gap-1 font-medium text-brand-text text-sm hover:text-brand-text"
              href="/docs/guides/custom-events"
            >
              Events reference
              <ArrowRight className="size-3" />
            </a>
          </div>

          <div>
            <CodeBlock data={codeData} defaultValue="track">
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
                <CodeBlockSelect>
                  <CodeBlockSelectTrigger>
                    <CodeBlockSelectValue />
                  </CodeBlockSelectTrigger>
                  <CodeBlockSelectContent>
                    {(item) => (
                      <CodeBlockSelectItem
                        key={item.language}
                        value={item.language}
                      >
                        {item.filename}
                      </CodeBlockSelectItem>
                    )}
                  </CodeBlockSelectContent>
                </CodeBlockSelect>
                <CodeBlockCopyButton />
              </CodeBlockHeader>
              <CodeBlockBody>
                {(item) => (
                  <CodeBlockItem key={item.language} value={item.language}>
                    <CodeBlockContent language="typescript">
                      {item.code}
                    </CodeBlockContent>
                  </CodeBlockItem>
                )}
              </CodeBlockBody>
            </CodeBlock>
          </div>
        </div>
      </div>
    </section>
  );
}
