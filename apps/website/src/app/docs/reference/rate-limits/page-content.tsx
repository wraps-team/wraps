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

const eventLimitExample = `HTTP/1.1 429 Too Many Requests
Retry-After: 1728000
X-Event-Limit: 50000
X-Event-Current: 62500
X-Event-Remaining: 0
X-Event-Percent: 125
X-Event-Exceeded: true

{
  "error": "event_limit_exceeded",
  "message": "Monthly event limit exceeded (125% used). Upgrade your plan to continue ingesting events.",
  "upgradeUrl": "https://app.wraps.dev/settings/billing",
  "current": 62500,
  "limit": 50000,
  "percentUsed": 125,
  "resetsAt": "2026-05-01T00:00:00.000Z"
}`;

const eventHeadersExample = `HTTP/1.1 200 OK
X-Event-Limit: 250000
X-Event-Current: 48320
X-Event-Remaining: 201680
X-Event-Percent: 19`;

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
RateLimit-Policy: 500;w=60, 50000;w=86400
X-RateLimit-Limit: 500
X-RateLimit-Remaining: 487
X-RateLimit-Reset: 34`;

const rateLimitedExample = `HTTP/1.1 429 Too Many Requests
Retry-After: 34
RateLimit-Limit: 500
RateLimit-Remaining: 0
RateLimit-Reset: 34
RateLimit-Policy: 500;w=60, 50000;w=86400
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

The Wraps Platform API enforces per-minute and daily rate limits based on your plan. Limits are applied per organization using DynamoDB-backed sliding windows.

| Plan | Per Minute | Per Day |
|------|-----------|---------|
| Free | 50 | 1,000 |
| Starter | 500 | 50,000 |
| Growth | 2,000 | 200,000 |
| Scale | 5,000 | 500,000 |`,

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

When two policies are in force (per-minute and per-day), the quota headers describe whichever is closest to running out — that is the one to pace against — while \`RateLimit-Policy\` lists both.

### Successful response
\`\`\`
${headersExample}
\`\`\`

### Rate limited response (429)
\`\`\`
${rateLimitedExample}
\`\`\``,

  eventLimits: `## Event Ingestion Limits

Tracked events (sent via \`POST /v1/events\` and \`POST /v1/events/batch\`) are subject to monthly quotas separate from API rate limits. These limits are applied per organization and reset on the 1st of each month (UTC).

| Plan | Monthly Events |
|------|---------------|
| Free | 5,000 |
| Starter | 50,000 |
| Growth | 250,000 |
| Scale | 1,000,000 |
| Enterprise | Unlimited |

### Grace Period

Event limits use a soft cap with a **25% grace period**:

- **0-100%**: Normal operation
- **100-125%**: Warning threshold -- events are still accepted, but dashboard warnings and email notifications are sent
- **125%+**: Hard block -- the API returns \`429 Too Many Requests\` with an \`event_limit_exceeded\` error

The \`Retry-After\` header indicates seconds until the limit resets (1st of next month).

### Event Response Headers

Every event ingestion response includes usage tracking headers:

| Header | Description |
|--------|-------------|
| \`X-Event-Limit\` | Monthly event limit for your plan |
| \`X-Event-Current\` | Events consumed this month |
| \`X-Event-Remaining\` | Events remaining before soft limit |
| \`X-Event-Percent\` | Percentage of limit used |
| \`X-Event-Exceeded\` | Set to \`true\` when hard-blocked at 125% |`,

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
          The Wraps Platform API enforces per-minute and daily rate limits based
          on your plan. Limits are applied per organization using
          DynamoDB-backed sliding windows.
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
                    <th className="px-4 py-2 text-left font-medium">Per Day</th>
                  </tr>
                </thead>
                <tbody className="text-muted-foreground">
                  {[
                    { plan: "Free", minute: "50", daily: "1,000" },
                    { plan: "Starter", minute: "500", daily: "50,000" },
                    { plan: "Growth", minute: "2,000", daily: "200,000" },
                    { plan: "Scale", minute: "5,000", daily: "500,000" },
                  ].map((row, i) => (
                    <tr className={i < 3 ? "border-b" : ""} key={row.plan}>
                      <td className="px-4 py-2 font-medium text-foreground">
                        {row.plan}
                      </td>
                      <td className="px-4 py-2">
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                          {row.minute}
                        </code>{" "}
                        requests
                      </td>
                      <td className="px-4 py-2">
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                          {row.daily}
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

      {/* Event Ingestion Limits */}
      <section className="mb-12">
        <SectionHeading
          className="mb-6"
          id="event-limits"
          markdown={SECTION_MD.eventLimits}
          title="Event Ingestion Limits"
        />
        <p className="mb-4 text-muted-foreground">
          Tracked events (sent via{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-sm">
            POST /v1/events
          </code>{" "}
          and{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-sm">
            POST /v1/events/batch
          </code>
          ) are subject to monthly quotas separate from API rate limits. Limits
          reset on the 1st of each month (UTC).
        </p>
        <Card className="mb-6">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="px-4 py-2 text-left font-medium">Plan</th>
                    <th className="px-4 py-2 text-left font-medium">
                      Monthly Events
                    </th>
                  </tr>
                </thead>
                <tbody className="text-muted-foreground">
                  {[
                    { plan: "Free", events: "5,000" },
                    { plan: "Starter", events: "50,000" },
                    { plan: "Growth", events: "250,000" },
                    { plan: "Scale", events: "1,000,000" },
                    { plan: "Enterprise", events: "Unlimited" },
                  ].map((row, i) => (
                    <tr className={i < 4 ? "border-b" : ""} key={row.plan}>
                      <td className="px-4 py-2 font-medium text-foreground">
                        {row.plan}
                      </td>
                      <td className="px-4 py-2">
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                          {row.events}
                        </code>{" "}
                        events
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <h3 className="mb-3 font-medium text-lg" id="grace-period">
          Grace Period
        </h3>
        <p className="mb-4 text-muted-foreground">
          Event limits use a soft cap with a 25% grace period:
        </p>
        <div className="mb-6 space-y-2">
          {[
            {
              range: "0-100%",
              desc: "Normal operation",
            },
            {
              range: "100-125%",
              desc: "Warning threshold -- events still accepted, dashboard warnings and email notifications sent",
            },
            {
              range: "125%+",
              desc: "Hard block -- API returns 429 with event_limit_exceeded error",
            },
          ].map((tier) => (
            <div
              className="flex items-start gap-3 rounded-lg border border-border p-3"
              key={tier.range}
            >
              <code className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs">
                {tier.range}
              </code>
              <span className="text-muted-foreground text-sm">{tier.desc}</span>
            </div>
          ))}
        </div>

        <h3 className="mb-3 font-medium text-lg" id="event-response-headers">
          Event Response Headers
        </h3>
        <p className="mb-4 text-muted-foreground">
          Every event ingestion response includes usage tracking headers:
        </p>
        <Card className="mb-4">
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
                  {[
                    {
                      header: "X-Event-Limit",
                      desc: "Monthly event limit for your plan",
                    },
                    {
                      header: "X-Event-Current",
                      desc: "Events consumed this month",
                    },
                    {
                      header: "X-Event-Remaining",
                      desc: "Events remaining before soft limit",
                    },
                    {
                      header: "X-Event-Percent",
                      desc: "Percentage of limit used",
                    },
                    {
                      header: "X-Event-Exceeded",
                      desc: "Set to true when hard-blocked at 125%",
                    },
                  ].map((row, i) => (
                    <tr className={i < 4 ? "border-b" : ""} key={row.header}>
                      <td className="px-4 py-2">
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                          {row.header}
                        </code>
                      </td>
                      <td className="px-4 py-2">{row.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <div className="mb-4">
          <h4 className="mb-3 font-medium" id="event-headers-example">
            Normal response
          </h4>
          <CodeBlock
            className="h-auto"
            data={[
              {
                language: "http",
                filename: "event headers",
                code: eventHeadersExample,
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
          <h4 className="mb-3 font-medium" id="event-limit-exceeded">
            Limit exceeded response (429)
          </h4>
          <CodeBlock
            className="h-auto"
            data={[
              {
                language: "http",
                filename: "event limit exceeded",
                code: eventLimitExample,
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
