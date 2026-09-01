"use client";

import { Badge } from "@wraps/ui/components/ui/badge";
import { Button } from "@wraps/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { CopyForAIButton } from "@/components/docs/copy-for-ai-button";
import { SectionHeading } from "@/components/docs/section-heading";
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

const retryCode = `async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const response = await fetch(url, options);

    if (response.status === 429) {
      const retryAfter = Number(response.headers.get('Retry-After') ?? 60);
      await new Promise(r => setTimeout(r, retryAfter * 1000));
      continue;
    }

    return response;
  }

  throw new Error('Rate limit exceeded after retries');
}`;

const headersExample = `HTTP/1.1 200 OK
RateLimit-Limit: 500
RateLimit-Remaining: 487
RateLimit-Reset: 34
RateLimit-Policy: 500;w=60
X-RateLimit-Limit: 500
X-RateLimit-Remaining: 487
X-RateLimit-Reset: 34`;

const rateLimitedExample = `HTTP/1.1 429 Too Many Requests
Retry-After: 34
RateLimit-Limit: 500
RateLimit-Remaining: 0
RateLimit-Reset: 34
RateLimit-Policy: 500;w=60
X-RateLimit-Limit: 500
X-RateLimit-Remaining: 0

{
  "error": "Rate limit exceeded: 500 requests per minute",
  "code": "RATE_LIMITED",
  "requestId": "01JBZ9K3M4N5P6Q7R8S9T0"
}`;

const RESPONSE_HEADERS = [
  {
    name: "RateLimit-Limit",
    description: "Requests permitted in the window closest to exhaustion",
  },
  {
    name: "RateLimit-Remaining",
    description: "Requests still available in that window",
  },
  {
    name: "RateLimit-Reset",
    description: "Seconds until that window resets — not a Unix timestamp",
  },
  {
    name: "RateLimit-Policy",
    description: "Every policy in force, as <limit>;w=<window seconds>",
  },
  {
    name: "Retry-After",
    description: "Seconds to wait before retrying (429 responses only)",
  },
  {
    name: "X-RateLimit-Limit",
    description: "Legacy alias for RateLimit-Limit",
  },
  {
    name: "X-RateLimit-Remaining",
    description: "Legacy alias for RateLimit-Remaining",
  },
  {
    name: "X-RateLimit-Reset",
    description: "Legacy alias for RateLimit-Reset",
  },
];

// ============================================================================
// MARKDOWN CONTENT FOR AI COPY
// ============================================================================

const SECTION_MD = {
  limitsByPlan: `## Limits by Plan

The Wraps Platform API enforces a per-minute rate limit based on your plan. Limits are applied per organization using DynamoDB-backed sliding windows. There is no daily request cap and no monthly send quota on any plan — sends are unlimited and billed by AWS directly. The per-minute limit exists to protect the API from bursts.

| Plan | Per Minute |
|------|-----------|
| Free | 50 |
| Pro | 2,000 |
| Business | 5,000 |`,

  publicEndpoints: `## Public Endpoints

Unauthenticated endpoints (health check, public tools) use IP-based rate limiting:

| Scope | Limit |
|-------|-------|
| Per minute per IP | 10 |
| Per hour per IP | 100 |`,

  responseHeaders: `## Response Headers

Every rate-limited response carries the limit headers. Read the unprefixed \`RateLimit-*\` names — the \`X-\` forms are the originals, kept so existing integrations keep working.

| Header | Description |
|--------|-------------|
| \`RateLimit-Limit\` | Requests permitted in the window closest to exhaustion |
| \`RateLimit-Remaining\` | Requests still available in that window |
| \`RateLimit-Reset\` | **Seconds until** that window resets — not a Unix timestamp |
| \`RateLimit-Policy\` | Every policy in force, as \`<limit>;w=<window seconds>\` |
| \`Retry-After\` | Seconds to wait before retrying (429 responses only) |
| \`X-RateLimit-Limit\` | Legacy alias for \`RateLimit-Limit\` |
| \`X-RateLimit-Remaining\` | Legacy alias for \`RateLimit-Remaining\` |
| \`X-RateLimit-Reset\` | Legacy alias for \`RateLimit-Reset\` |

The quota headers describe the policy closest to running out — that is the one to pace against — while \`RateLimit-Policy\` lists every policy in force. On every current plan that is a single per-minute entry; there is no daily policy.

### Successful response
\`\`\`
${headersExample}
\`\`\`

### Rate limited response (429)
\`\`\`
${rateLimitedExample}
\`\`\``,

  eventLimits: `## Event Ingestion

Custom events (sent via \`POST /v1/events\` and \`POST /v1/events/batch\`) are unmetered on every plan — there is no monthly quota and no 429 for volume. The response still carries \`X-Event-*\` headers for backward compatibility; they always report an unlimited state (\`X-Event-Limit: -1\`, \`X-Event-Remaining: -1\`, \`X-Event-Percent: 0\`).`,

  handling429: `## Handling 429 Errors

When you receive a 429 status code:

1. Read the \`Retry-After\` header for the number of seconds to wait
2. Wait that duration before retrying
3. Use exponential backoff if retries continue to fail

\`\`\`typescript
${retryCode}
\`\`\``,
};

const FULL_PAGE_MD = `# API Rate Limits

Rate limits for the Wraps Platform API by plan, with response headers and error handling.

${SECTION_MD.limitsByPlan}

${SECTION_MD.publicEndpoints}

${SECTION_MD.eventLimits}

${SECTION_MD.responseHeaders}

${SECTION_MD.handling429}
`;

const SLASH_COMMAND_MD = `---
description: Wraps API rate limits - use this when debugging 429 errors or planning API usage
---

${FULL_PAGE_MD}`;

// ============================================================================
// PAGE CONTENT
// ============================================================================

export default function PageContent() {
  return (
    <DocsLayout
      headerActions={
        <CopyForAIButton
          markdown={FULL_PAGE_MD}
          slashCommand={SLASH_COMMAND_MD}
        />
      }
    >
      {/* Page Header */}
      <div className="mb-12">
        <Badge className="mb-4" variant="outline">
          Reference
        </Badge>
        <h1 className="mb-4 font-bold text-4xl tracking-tight">
          API Rate Limits
        </h1>
        <p className="text-lg text-muted-foreground">
          Rate limits for the Wraps Platform API by plan. Includes response
          headers and error handling.
        </p>
      </div>

      {/* Limits by Plan */}
      <section className="mb-12">
        <SectionHeading
          className="mb-6"
          id="limits-by-plan"
          markdown={SECTION_MD.limitsByPlan}
          title="Limits by Plan"
        />
        <p className="mb-4 text-muted-foreground">
          The Wraps Platform API enforces a per-minute rate limit based on your
          plan. Limits are applied per organization using DynamoDB-backed
          sliding windows. There is no daily request cap and no monthly send
          quota on any plan &mdash; sends are unlimited and billed by AWS
          directly. The per-minute limit exists to protect the API from bursts.
        </p>
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="px-4 py-2 text-left font-medium">Plan</th>
                    <th className="px-4 py-2 text-left font-medium">
                      Per Minute
                    </th>
                  </tr>
                </thead>
                <tbody className="text-muted-foreground">
                  {[
                    { plan: "Free", minute: "50" },
                    { plan: "Pro", minute: "2,000" },
                    { plan: "Business", minute: "5,000" },
                  ].map((row, i) => (
                    <tr className={i < 2 ? "border-b" : ""} key={row.plan}>
                      <td className="px-4 py-2 font-medium text-foreground">
                        {row.plan}
                      </td>
                      <td className="px-4 py-2">
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                          {row.minute}
                        </code>{" "}
                        requests
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Public Endpoints */}
      <section className="mb-12">
        <SectionHeading
          className="mb-6"
          id="public-endpoints"
          markdown={SECTION_MD.publicEndpoints}
          title="Public Endpoints"
        />
        <p className="mb-4 text-muted-foreground">
          Unauthenticated endpoints (health check, public tools) use IP-based
          rate limiting:
        </p>
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="px-4 py-2 text-left font-medium">Scope</th>
                    <th className="px-4 py-2 text-left font-medium">Limit</th>
                  </tr>
                </thead>
                <tbody className="text-muted-foreground">
                  <tr className="border-b">
                    <td className="px-4 py-2">Per minute per IP</td>
                    <td className="px-4 py-2">
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                        10
                      </code>{" "}
                      requests
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2">Per hour per IP</td>
                    <td className="px-4 py-2">
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                        100
                      </code>{" "}
                      requests
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Event Ingestion */}
      <section className="mb-12">
        <SectionHeading
          className="mb-6"
          id="event-limits"
          markdown={SECTION_MD.eventLimits}
          title="Event Ingestion"
        />
        <p className="mb-4 text-muted-foreground">
          Custom events (sent via{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-sm">
            POST /v1/events
          </code>{" "}
          and{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-sm">
            POST /v1/events/batch
          </code>
          ) are unmetered on every plan &mdash; there is no monthly quota and no
          429 for volume. The response still carries{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-sm">
            X-Event-*
          </code>{" "}
          headers for backward compatibility; they always report an unlimited
          state.
        </p>
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="px-4 py-2 text-left font-medium">Header</th>
                    <th className="px-4 py-2 text-left font-medium">
                      Always reports
                    </th>
                  </tr>
                </thead>
                <tbody className="text-muted-foreground">
                  {[
                    { header: "X-Event-Limit", value: "-1" },
                    { header: "X-Event-Remaining", value: "-1" },
                    { header: "X-Event-Percent", value: "0" },
                  ].map((row, i) => (
                    <tr className={i < 2 ? "border-b" : ""} key={row.header}>
                      <td className="px-4 py-2">
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                          {row.header}
                        </code>
                      </td>
                      <td className="px-4 py-2">
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                          {row.value}
                        </code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Response Headers */}
      <section className="mb-12">
        <SectionHeading
          className="mb-6"
          id="response-headers"
          markdown={SECTION_MD.responseHeaders}
          title="Response Headers"
        />
        <p className="mb-4 text-muted-foreground">
          Every rate-limited response carries these headers. Read the unprefixed{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
            RateLimit-*
          </code>{" "}
          names — the{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">X-</code>{" "}
          forms are the originals, kept so existing integrations keep working.
        </p>

        <Card className="mb-6">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="px-4 py-2 text-left font-medium">Header</th>
                    <th className="px-4 py-2 text-left font-medium">
                      Description
                    </th>
                  </tr>
                </thead>
                <tbody className="text-muted-foreground">
                  {RESPONSE_HEADERS.map((header) => (
                    <tr className="border-b last:border-b-0" key={header.name}>
                      <td className="px-4 py-2">
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                          {header.name}
                        </code>
                      </td>
                      <td className="px-4 py-2">{header.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <div className="mb-4">
          <h3 className="mb-3 font-medium text-lg" id="successful-response">
            Successful response
          </h3>
          <CodeBlock
            className="h-auto"
            data={[
              {
                language: "http",
                filename: "response headers",
                code: headersExample,
              },
            ]}
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
        </div>

        <div>
          <h3 className="mb-3 font-medium text-lg" id="rate-limited-response">
            Rate limited response (429)
          </h3>
          <CodeBlock
            className="h-auto"
            data={[
              {
                language: "http",
                filename: "429 response",
                code: rateLimitedExample,
              },
            ]}
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
        </div>
      </section>

      {/* Handling 429 Errors */}
      <section className="mb-12">
        <SectionHeading
          className="mb-6"
          id="handling-429"
          markdown={SECTION_MD.handling429}
          title="Handling 429 Errors"
        />
        <p className="mb-4 text-muted-foreground">
          When you receive a 429 status code:
        </p>
        <ol className="mb-6 list-inside list-decimal space-y-2 text-muted-foreground">
          <li>
            Read the{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
              Retry-After
            </code>{" "}
            header for the number of seconds to wait
          </li>
          <li>Wait that duration before retrying</li>
          <li>Use exponential backoff if retries continue to fail</li>
        </ol>
        <CodeBlock
          className="h-auto"
          data={[
            {
              language: "typescript",
              filename: "retry.ts",
              code: retryCode,
            },
          ]}
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
      </section>

      {/* Next Steps */}
      <section>
        <h2 className="mb-4 font-semibold text-2xl" id="next-steps">
          Next Steps
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Error Codes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-muted-foreground text-sm">
                Complete reference for CLI and SDK error codes.
              </p>
              <Button asChild size="sm" variant="outline">
                <Link href="/docs/reference/errors">
                  View Error Codes <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">SDK Reference</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-muted-foreground text-sm">
                Full API reference for the Email SDK.
              </p>
              <Button asChild size="sm" variant="outline">
                <Link href="/docs/sdk-reference">
                  View SDK Reference <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>
    </DocsLayout>
  );
}
