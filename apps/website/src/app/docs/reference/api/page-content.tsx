"use client";

import { Badge } from "@wraps/ui/components/ui/badge";
import { Button } from "@wraps/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import { ArrowRight, ExternalLink } from "lucide-react";
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

const curlExample = `curl -X GET https://api.wraps.dev/health

# Authenticated request
curl -X GET https://api.wraps.dev/contacts \\
  -H "Authorization: Bearer wraps_your_api_key"`;

const sdkExample = `import { createPlatformClient } from '@wraps.dev/client';

const client = createPlatformClient({
  apiKey: process.env.WRAPS_API_KEY,
});

const { data } = await client.GET('/v1/contacts/', {
  params: { query: { page: '1' } },
});`;

const triggerWorkflowExample = `curl -X POST https://api.wraps.dev/v1/workflows/:workflowId/trigger \\
  -H "Authorization: Bearer wraps_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "contactEmail": "user@example.com",
    "data": { "plan": "pro", "source": "api" }
  }'`;

const batchTriggerExample = `curl -X POST https://api.wraps.dev/v1/workflows/:workflowId/trigger/batch \\
  -H "Authorization: Bearer wraps_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "contacts": [
      { "contactEmail": "alice@example.com", "data": { "tier": "gold" } },
      { "contactEmail": "bob@example.com" }
    ],
    "data": { "campaign": "spring-2026" }
  }'`;

const retryExecutionExample = `curl -X POST https://api.wraps.dev/v1/workflows/executions/:executionId/retry \\
  -H "Authorization: Bearer wraps_your_api_key"`;

const cancelExecutionExample = `curl -X POST https://api.wraps.dev/v1/workflows/executions/:executionId/cancel \\
  -H "Authorization: Bearer wraps_your_api_key"`;

const batchStatusExample = `// GET /v1/batch/:id response
{
  "id": "batch_abc123",
  "status": "completed",
  "channel": "email",
  "name": "Spring Campaign",
  "totalRecipients": 5000,
  "processedRecipients": 5000,
  "sent": 4985,
  "delivered": 4970,
  "failed": 15,
  "opened": 3102,
  "clicked": 540,
  "bounced": 12,
  "complained": 1,
  "suppressed": 2,
  "startedAt": "2026-04-06T10:00:00.000Z",
  "completedAt": "2026-04-06T10:05:32.000Z",
  "createdAt": "2026-04-06T09:59:58.000Z"
}`;

const batchListExample = `// GET /v1/batch?pageSize=1 response
{
  "data": [
    {
      "id": "batch_abc123",
      "name": "Spring Campaign",
      "status": "completed",
      "channel": "email",
      "subject": "Spring is here",
      "totalRecipients": 5000,
      "processedRecipients": 5000,
      "sent": 4985,
      "delivered": 4970,
      "opened": 3102,
      "clicked": 540,
      "bounced": 12,
      "complained": 1,
      "suppressed": 2,
      "failed": 15,
      "scheduledFor": null,
      "startedAt": "2026-04-06T10:00:00.000Z",
      "completedAt": "2026-04-06T10:05:32.000Z",
      "createdAt": "2026-04-06T09:59:58.000Z",
      "template": { "id": "tmpl_1", "name": "Spring Newsletter" },
      "awsAccount": { "id": "aws_1", "name": "Production", "region": "us-east-1" }
    }
  ],
  "page": 1,
  "pageSize": 1,
  "total": 42
}`;

const batchRecipientsExample = `// GET /v1/batch/:id/recipients response
{
  "data": [
    {
      "id": "msg_1",
      "recipient": "user@example.com",
      "status": "bounced",
      "error": null,
      "bounceType": "Permanent",
      "bounceSubType": "General",
      "sentAt": "2026-04-06T10:00:01.000Z",
      "createdAt": "2026-04-06T10:00:00.000Z"
    }
  ],
  "limit": 50,
  "offset": 0,
  "total": 15
}`;

const batchClicksExample = `// GET /v1/batch/:id/clicks response
{
  "data": [
    { "url": "https://example.com/product", "count": 312 },
    { "url": "https://example.com/blog", "count": 88 }
  ],
  "unsubscribeCount": 19,
  "totalDistinctUrls": 2,
  "truncated": false
}`;

const contactTopicPatchExample = `# PATCH adds topics without removing existing ones
curl -X PATCH https://api.wraps.dev/v1/contacts/:id \\
  -H "Authorization: Bearer wraps_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{ "topicIds": ["topic_new"] }'

# PUT replaces ALL topic subscriptions
curl -X PUT https://api.wraps.dev/v1/contacts/:id/topics \\
  -H "Authorization: Bearer wraps_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{ "topicIds": ["topic_a", "topic_b"] }'`;

const metricsExample = `curl -X GET "https://api.wraps.dev/v1/email/metrics?start_date=2026-08-25&end_date=2026-08-31&dimensions=period&granularity=daily" \\
  -H "Authorization: Bearer wraps_your_api_key"`;

const metricsResponseExample = `// GET /v1/email/metrics response
{
  "object": "metrics",
  "totals": {
    "sent": 1234,
    "delivered": 1200,
    "bounced": 12,
    "bouncedPermanent": 8,
    "bouncedTransient": 4,
    "bouncedUndetermined": 0,
    "complained": 1,
    "suppressed": 3,
    "opened": 640,
    "openedRaw": 705,
    "clicked": 210,
    "failed": 22
  },
  "data": [
    {
      "period": "2026-08-30",
      "sent": 180,
      "delivered": 176,
      "bounced": 1,
      "bouncedPermanent": 1,
      "bouncedTransient": 0,
      "bouncedUndetermined": 0,
      "complained": 0,
      "suppressed": 0,
      "opened": 92,
      "openedRaw": 101,
      "clicked": 30,
      "failed": 2
    }
  ],
  "meta": {
    "start_date": "2026-08-25T00:00:00.000Z",
    "end_date": "2026-08-31T00:00:00.000Z",
    "timezone": "UTC",
    "granularity": "daily",
    "dimensions": ["period"]
  }
}`;

// ============================================================================
// MARKDOWN CONTENT FOR AI COPY
// ============================================================================

const SECTION_MD = {
  baseUrl: `## Base URL

All API requests are made to:

\`\`\`
https://api.wraps.dev
\`\`\`

The API follows REST conventions and returns JSON responses.`,

  authentication: `## Authentication

Authenticate using a Bearer token in the \`Authorization\` header:

\`\`\`
Authorization: Bearer wraps_your_api_key
\`\`\`

Two authentication methods are supported:

| Method | Format | Use Case |
|--------|--------|----------|
| API Key | \`wraps_*\` prefix | Server-to-server, SDK usage |
| Session Token | better-auth session | Dashboard, browser-based |

API keys are created in the Wraps dashboard under Settings > API Keys.`,

  endpoints: `## Endpoints

| Group | Description | Auth Required |
|-------|-------------|---------------|
| Health | Health check and API info | No |
| Contacts | Create, update, delete, and list contacts | Yes |
| Batch | Batch email sending for broadcasts | Yes |
| Email Metrics | Aggregate email metrics (sent, delivered, opens, clicks, bounces) | Yes |
| Events | Custom event ingestion for triggering workflows | Yes |
| Workflows | API-triggered workflow execution | Yes |
| Connections | AWS account connection management | Yes |
| Webhooks | Receive SES delivery events | Secret-based |
| Unsubscribe | RFC 8058 one-click unsubscribe | Token-based |
| Tools | Free email deliverability tools | No |`,

  workflows: `## Workflows

Trigger, manage, and control workflow executions via the API. Workflows must have \`triggerType: "api"\` and be enabled.

### Trigger Workflow

\`POST /v1/workflows/:workflowId/trigger\`

Triggers a workflow for a single contact. Identify the contact by ID or email.

**Request body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| \`contactId\` | string | One of contactId/contactEmail | Contact UUID |
| \`contactEmail\` | string | One of contactId/contactEmail | Contact email address |
| \`data\` | object | No | Arbitrary data passed to the workflow |

**Response (200):**
\`\`\`json
{ "success": true, "message": "Workflow triggered successfully", "workflowId": "...", "workflowName": "...", "contactId": "..." }
\`\`\`

### Batch Trigger Workflow

\`POST /v1/workflows/:workflowId/trigger/batch\`

Trigger a workflow for multiple contacts in one request. Per-contact data is merged with common data. Duplicate contacts are automatically deduplicated.

**Request body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| \`contacts\` | array | Yes | Array of \`{ contactId?, contactEmail?, data? }\` |
| \`data\` | object | No | Common data merged into every trigger |

**Response (200):**
\`\`\`json
{ "success": true, "workflowId": "...", "workflowName": "...", "triggered": 42, "errors": [] }
\`\`\`

### Retry Failed Execution

\`POST /v1/workflows/executions/:executionId/retry\`

Retries a failed workflow execution from the step where it failed. Previously completed steps are preserved. Only executions with \`status: "failed"\` can be retried.

**Response (200):**
\`\`\`json
{ "success": true, "message": "Execution retry started" }
\`\`\`

### Cancel Execution

\`POST /v1/workflows/executions/:executionId/cancel\`

Cancels an active workflow execution. Cleans up any pending schedulers and adjusts workflow stats.

**Response (200):**
\`\`\`json
{ "success": true }
\`\`\``,

  batch: `## Batch Sending

Every \`/v1/batch\` route requires the Pro plan or above.

### Create Batch Send

\`POST /v1/batch\` -- Creates a batch send job and queues it for processing. Supports immediate and scheduled sends.

### List Batch Sends

\`GET /v1/batch\` -- Lists batch sends for the organization, newest first.

**Query parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| \`page\` | number | Page number, default 1 |
| \`pageSize\` | number | Results per page, default 20, max 100 |
| \`status\` | string | Filter by \`draft\`, \`scheduled\`, \`queued\`, \`processing\`, \`completed\`, \`failed\`, or \`cancelled\` |
| \`channel\` | string | Filter by \`email\` or \`sms\` |
| \`search\` | string | Matches against name and subject |

**Response (200):** \`{ data: BatchSend[], page, pageSize, total }\` -- each item carries the same fields as \`GET /v1/batch/:id\` below, plus \`template\` and \`awsAccount\` summaries. \`total\` is the full filtered count, not the page length.

### Get Batch Status

\`GET /v1/batch/:id\` -- Returns the full status of a batch send job including progress tracking fields.

**Response (200):**
| Field | Type | Description |
|-------|------|-------------|
| \`id\` | string | Batch ID |
| \`status\` | string | \`queued\`, \`scheduled\`, \`processing\`, \`completed\`, \`failed\`, or \`cancelled\` |
| \`channel\` | string | \`email\` or \`sms\` |
| \`name\` | string or null | Batch name |
| \`totalRecipients\` | number | Total number of targeted recipients |
| \`processedRecipients\` | number | Recipients processed so far |
| \`sent\` | number | Successfully sent count |
| \`delivered\` | number | Delivered count |
| \`failed\` | number | Failed send count |
| \`opened\` | number | Opened count |
| \`clicked\` | number | Clicked count |
| \`bounced\` | number | Bounced count |
| \`complained\` | number | Spam complaint count |
| \`suppressed\` | number | Suppressed (SES suppression list) count |
| \`startedAt\` | string or null | ISO 8601 timestamp when processing began |
| \`completedAt\` | string or null | ISO 8601 timestamp when processing finished |
| \`createdAt\` | string | ISO 8601 creation timestamp |

Counts are maintained incrementally during the send and reflect SES events received so far.

### List Recipients

\`GET /v1/batch/:id/recipients\` -- Returns per-recipient outcomes for a batch send. \`limit\` defaults to 50 and is capped at **1000** -- this route returns JSON through Lambda, which has a response-size ceiling a larger page could exceed. \`status\` filters by any \`message_send\` status (\`pending\`, \`queued\`, \`sent\`, \`delivered\`, \`opened\`, \`clicked\`, \`bounced\`, \`complained\`, \`suppressed\`, \`failed\`, \`opted_out\`). Returns 404 -- not an empty list -- for a batch id that doesn't belong to your organization.

**Response (200):** \`{ data: Recipient[], limit, offset, total }\` -- each recipient is \`{ id, recipient, status, error, bounceType, bounceSubType, sentAt, createdAt }\`.

### Clicked Links

\`GET /v1/batch/:id/clicks\` -- Returns the top clicked links for a batch send, ordered by click count and capped at **50 URLs**. \`truncated\` is \`true\` when more distinct URLs exist than were returned. Per-recipient unsubscribe and preference-centre links are aggregated into \`unsubscribeCount\` and excluded from \`data\`.

**Response (200):** \`{ data: { url, count }[], unsubscribeCount, totalDistinctUrls, truncated }\`.

### Cancel Batch Send

\`DELETE /v1/batch/:id\` -- Cancels a batch in \`scheduled\`, \`queued\`, or \`processing\` status. Scheduled batches also have their EventBridge schedule deleted.`,

  metrics: `## Email Metrics

\`GET /v1/email/metrics\` -- Returns aggregate email metrics for the organization: sent, delivered, bounces (with permanent/transient/undetermined breakdown), complaints, suppressions, opens, clicks, and rendering failures. Optionally grouped by dimension and time granularity. Shares the same per-minute API rate limit as every other endpoint -- reading your own numbers is not a paid feature.

**Query parameters (all optional):**
| Param | Type | Default |
|-------|------|---------|
| \`start_date\` | ISO 8601 date or datetime | 6 days before \`end_date\` |
| \`end_date\` | ISO 8601 date or datetime | now |
| \`timezone\` | IANA timezone name | \`UTC\` |
| \`granularity\` | \`hourly\`, \`daily\`, \`weekly\`, or \`monthly\` | \`daily\` |
| \`dimensions\` | Comma-separated: \`period\`, \`domain\`, \`broadcast\`, \`template\`, \`source\`, \`account\`, \`region\` | none (totals only) |
| \`broadcast_id\`, \`template_id\`, \`aws_account_id\`, \`domain\` | Comma-separated, max 100 values each | -- |

**Response (200):**
\`\`\`json
{ "object": "metrics", "totals": { "sent": 1234, "delivered": 1200 }, "data": [{ "period": "2026-08-30", "sent": 180 }], "meta": { "start_date": "...", "end_date": "...", "timezone": "UTC", "granularity": "daily", "dimensions": ["period"] } }
\`\`\`

\`opened\` excludes user agents matching a known-bot list; \`openedRaw\` reports the same count with no bot filter applied. \`clicked\` is currently unfiltered. There is no \`tags\` dimension -- SES message tags are not persisted on sends. The \`template\`, \`source\`, \`account\`, and \`region\` dimensions have no equivalent in other providers' email APIs.`,

  contactTopics: `## Contact Topics: PATCH vs PUT

Topic subscriptions support two update strategies:

### PATCH /v1/contacts/:id (with topicIds/topicSlugs)

**Adds** topics to the contact's existing subscriptions without removing any. Existing subscriptions are preserved. If a topic requires double opt-in and was not previously confirmed, a confirmation email is sent.

### PUT /v1/contacts/:id/topics

**Replaces all** topic subscriptions. Existing subscriptions not in the new list are removed. Previously confirmed topics keep their confirmation status when re-subscribed. Triggers \`topic_subscribed\` and \`topic_unsubscribed\` workflow events as appropriate.

Both endpoints accept \`topicIds\` (UUIDs) and \`topicSlugs\` (human-readable slugs) in the request body.`,

  openapi: `## OpenAPI Spec

The full OpenAPI 3.0.3 specification is available at:

- **Interactive docs**: https://api.wraps.dev/swagger
- **JSON spec**: https://api.wraps.dev/swagger/json

Use the JSON spec with any OpenAPI-compatible tool (Postman, Insomnia, Scalar, etc.) to explore and test endpoints.`,
};

const FULL_PAGE_MD = `# API Reference

OpenAPI reference for the Wraps Platform API.

${SECTION_MD.baseUrl}

${SECTION_MD.authentication}

${SECTION_MD.endpoints}

${SECTION_MD.workflows}

${SECTION_MD.batch}

${SECTION_MD.metrics}

${SECTION_MD.contactTopics}

${SECTION_MD.openapi}
`;

const SLASH_COMMAND_MD = `---
description: Wraps Platform API reference - use this for endpoint discovery, auth setup, and OpenAPI spec access
---

${FULL_PAGE_MD}`;

// ============================================================================
// PAGE CONTENT
// ============================================================================

const endpointGroups = [
  {
    name: "Health",
    description: "Health check and API info",
    auth: false,
    methods: ["GET"],
  },
  {
    name: "Contacts",
    description: "Create, update, delete, and list contacts",
    auth: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
  },
  {
    name: "Batch",
    description: "Batch email sending for broadcasts",
    auth: true,
    methods: ["POST", "GET", "DELETE"],
  },
  {
    name: "Email Metrics",
    description:
      "Aggregate email metrics (sent, delivered, opens, clicks, bounces)",
    auth: true,
    methods: ["GET"],
  },
  {
    name: "Events",
    description: "Custom event ingestion for triggering workflows",
    auth: true,
    methods: ["POST"],
  },
  {
    name: "Workflows",
    description: "API-triggered workflow execution",
    auth: true,
    methods: ["POST"],
  },
  {
    name: "Connections",
    description: "AWS account connection management",
    auth: true,
    methods: ["GET", "POST", "DELETE"],
  },
  {
    name: "Webhooks",
    description: "Receive SES delivery events",
    auth: false,
    methods: ["POST"],
  },
  {
    name: "Unsubscribe",
    description: "RFC 8058 one-click unsubscribe",
    auth: false,
    methods: ["GET", "POST"],
  },
  {
    name: "Tools",
    description: "Free email deliverability tools",
    auth: false,
    methods: ["GET", "POST"],
  },
];

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
          API Reference
        </h1>
        <p className="text-lg text-muted-foreground">
          OpenAPI reference for the Wraps Platform API. Browse endpoints, auth,
          and the interactive spec.
        </p>
      </div>

      {/* Swagger Callout */}
      <Card className="mb-12 border-primary/30 bg-primary/5">
        <CardHeader>
          <CardTitle className="text-lg">Interactive API Explorer</CardTitle>
          <p className="text-muted-foreground text-sm">
            Try endpoints directly in your browser with the OpenAPI spec.
          </p>
        </CardHeader>
        <CardContent className="pt-0">
          <Button asChild>
            <a
              href="https://api.wraps.dev/swagger"
              rel="noopener noreferrer"
              target="_blank"
            >
              Open Swagger UI
              <ExternalLink className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </CardContent>
      </Card>

      {/* Base URL */}
      <section className="mb-12">
        <SectionHeading
          className="mb-6"
          id="base-url"
          markdown={SECTION_MD.baseUrl}
          title="Base URL"
        />
        <p className="mb-4 text-muted-foreground">
          All API requests are made to:
        </p>
        <CodeBlock
          className="h-auto"
          data={[
            {
              language: "text",
              filename: "base url",
              code: "https://api.wraps.dev",
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

      {/* Authentication */}
      <section className="mb-12">
        <SectionHeading
          className="mb-6"
          id="authentication"
          markdown={SECTION_MD.authentication}
          title="Authentication"
        />
        <p className="mb-4 text-muted-foreground">
          Authenticate using a Bearer token in the{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-sm">
            Authorization
          </code>{" "}
          header. Two methods are supported:
        </p>
        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">API Key</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-2 text-muted-foreground text-sm">
                Prefixed with{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">
                  wraps_
                </code>
                . Best for server-to-server and SDK usage.
              </p>
              <p className="text-muted-foreground text-sm">
                Create keys in the dashboard under Settings &gt; API Keys.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Session Token</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                better-auth session token. Used by the dashboard and
                browser-based clients.
              </p>
            </CardContent>
          </Card>
        </div>

        <CodeBlock
          className="h-auto"
          data={[
            { language: "bash", filename: "curl examples", code: curlExample },
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

      {/* Endpoints */}
      <section className="mb-12">
        <SectionHeading
          className="mb-6"
          id="endpoints"
          markdown={SECTION_MD.endpoints}
          title="Endpoints"
        />
        <p className="mb-4 text-muted-foreground">
          The API is organized into endpoint groups. See the interactive docs
          for full request/response schemas.
        </p>
        <div className="mb-6 space-y-3">
          {endpointGroups.map((group) => (
            <div
              className="flex items-start justify-between rounded-lg border border-border p-3"
              key={group.name}
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground text-sm">
                    {group.name}
                  </span>
                  {!group.auth && (
                    <Badge className="text-xs" variant="outline">
                      Public
                    </Badge>
                  )}
                </div>
                <p className="mt-0.5 text-muted-foreground text-xs">
                  {group.description}
                </p>
              </div>
              <div className="flex gap-1">
                {group.methods.map((method) => (
                  <Badge className="text-xs" key={method} variant="secondary">
                    {method}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Workflows */}
      <section className="mb-12">
        <SectionHeading
          className="mb-6"
          id="workflows"
          markdown={SECTION_MD.workflows}
          title="Workflows"
        />
        <p className="mb-4 text-muted-foreground">
          Trigger, manage, and control workflow executions via the API.
          Workflows must have{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-sm">
            triggerType: &quot;api&quot;
          </code>{" "}
          and be enabled.
        </p>

        {/* Trigger Workflow */}
        <div className="mb-6">
          <h3 className="mb-3 font-medium text-lg" id="trigger-workflow">
            Trigger Workflow
          </h3>
          <div className="mb-3 flex items-center gap-2">
            <Badge variant="secondary">POST</Badge>
            <code className="text-sm">/v1/workflows/:workflowId/trigger</code>
          </div>
          <p className="mb-3 text-muted-foreground text-sm">
            Triggers a workflow for a single contact. Identify the contact by ID
            or email. Arbitrary data can be passed through to the workflow.
          </p>
          <Card className="mb-3">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="px-4 py-2 text-left font-medium">Field</th>
                      <th className="px-4 py-2 text-left font-medium">Type</th>
                      <th className="px-4 py-2 text-left font-medium">
                        Description
                      </th>
                    </tr>
                  </thead>
                  <tbody className="text-muted-foreground">
                    <tr className="border-b">
                      <td className="px-4 py-2">
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                          contactId
                        </code>
                      </td>
                      <td className="px-4 py-2">string</td>
                      <td className="px-4 py-2">
                        Contact UUID (provide this or contactEmail)
                      </td>
                    </tr>
                    <tr className="border-b">
                      <td className="px-4 py-2">
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                          contactEmail
                        </code>
                      </td>
                      <td className="px-4 py-2">string</td>
                      <td className="px-4 py-2">
                        Contact email (alternative to contactId)
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2">
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                          data
                        </code>
                      </td>
                      <td className="px-4 py-2">object</td>
                      <td className="px-4 py-2">
                        Arbitrary data passed to the workflow
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
          <CodeBlock
            className="h-auto"
            data={[
              {
                language: "bash",
                filename: "trigger workflow",
                code: triggerWorkflowExample,
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

        {/* Batch Trigger */}
        <div className="mb-6">
          <h3 className="mb-3 font-medium text-lg" id="batch-trigger-workflow">
            Batch Trigger Workflow
          </h3>
          <div className="mb-3 flex items-center gap-2">
            <Badge variant="secondary">POST</Badge>
            <code className="text-sm">
              /v1/workflows/:workflowId/trigger/batch
            </code>
          </div>
          <p className="mb-3 text-muted-foreground text-sm">
            Trigger a workflow for multiple contacts in one request. Per-contact
            data is merged with common data. Duplicate contacts are
            automatically deduplicated.
          </p>
          <Card className="mb-3">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="px-4 py-2 text-left font-medium">Field</th>
                      <th className="px-4 py-2 text-left font-medium">Type</th>
                      <th className="px-4 py-2 text-left font-medium">
                        Description
                      </th>
                    </tr>
                  </thead>
                  <tbody className="text-muted-foreground">
                    <tr className="border-b">
                      <td className="px-4 py-2">
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                          contacts
                        </code>
                      </td>
                      <td className="px-4 py-2">array</td>
                      <td className="px-4 py-2">
                        Array of{" "}
                        <code className="rounded bg-muted px-1 py-0.5 text-xs">
                          {"{ contactId?, contactEmail?, data? }"}
                        </code>
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2">
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                          data
                        </code>
                      </td>
                      <td className="px-4 py-2">object</td>
                      <td className="px-4 py-2">
                        Common data merged into every trigger
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
          <CodeBlock
            className="h-auto"
            data={[
              {
                language: "bash",
                filename: "batch trigger",
                code: batchTriggerExample,
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

        {/* Retry Execution */}
        <div className="mb-6">
          <h3 className="mb-3 font-medium text-lg" id="retry-execution">
            Retry Failed Execution
          </h3>
          <div className="mb-3 flex items-center gap-2">
            <Badge variant="secondary">POST</Badge>
            <code className="text-sm">
              /v1/workflows/executions/:executionId/retry
            </code>
          </div>
          <p className="mb-3 text-muted-foreground text-sm">
            Retries a failed workflow execution from the step where it failed.
            Previously completed steps are preserved. Only executions with
            status{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">failed</code>{" "}
            can be retried.
          </p>
          <CodeBlock
            className="h-auto"
            data={[
              {
                language: "bash",
                filename: "retry execution",
                code: retryExecutionExample,
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

        {/* Cancel Execution */}
        <div className="mb-6">
          <h3 className="mb-3 font-medium text-lg" id="cancel-execution">
            Cancel Execution
          </h3>
          <div className="mb-3 flex items-center gap-2">
            <Badge variant="secondary">POST</Badge>
            <code className="text-sm">
              /v1/workflows/executions/:executionId/cancel
            </code>
          </div>
          <p className="mb-3 text-muted-foreground text-sm">
            Cancels an active workflow execution. Cleans up any pending
            schedulers and adjusts workflow stats.
          </p>
          <CodeBlock
            className="h-auto"
            data={[
              {
                language: "bash",
                filename: "cancel execution",
                code: cancelExecutionExample,
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

      {/* Batch Sending */}
      <section className="mb-12">
        <SectionHeading
          className="mb-6"
          id="batch-sending"
          markdown={SECTION_MD.batch}
          title="Batch Sending"
        />
        <p className="mb-4 text-muted-foreground">
          The{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-sm">
            GET /v1/batch/:id
          </code>{" "}
          endpoint returns the full batch status including progress tracking
          fields:
        </p>
        <Card className="mb-4">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="px-4 py-2 text-left font-medium">Field</th>
                    <th className="px-4 py-2 text-left font-medium">Type</th>
                    <th className="px-4 py-2 text-left font-medium">
                      Description
                    </th>
                  </tr>
                </thead>
                <tbody className="text-muted-foreground">
                  {[
                    {
                      field: "id",
                      type: "string",
                      desc: "Batch ID",
                    },
                    {
                      field: "status",
                      type: "string",
                      desc: "queued, scheduled, processing, completed, failed, or cancelled",
                    },
                    {
                      field: "channel",
                      type: "string",
                      desc: "email or sms",
                    },
                    {
                      field: "name",
                      type: "string | null",
                      desc: "Batch name",
                    },
                    {
                      field: "totalRecipients",
                      type: "number",
                      desc: "Total targeted recipients",
                    },
                    {
                      field: "processedRecipients",
                      type: "number",
                      desc: "Recipients processed so far",
                    },
                    {
                      field: "sent",
                      type: "number",
                      desc: "Successfully sent count",
                    },
                    {
                      field: "delivered",
                      type: "number",
                      desc: "Delivered count",
                    },
                    {
                      field: "failed",
                      type: "number",
                      desc: "Failed send count",
                    },
                    {
                      field: "opened",
                      type: "number",
                      desc: "Opened count",
                    },
                    {
                      field: "clicked",
                      type: "number",
                      desc: "Clicked count",
                    },
                    {
                      field: "bounced",
                      type: "number",
                      desc: "Bounced count",
                    },
                    {
                      field: "complained",
                      type: "number",
                      desc: "Spam complaint count",
                    },
                    {
                      field: "suppressed",
                      type: "number",
                      desc: "Suppressed (SES suppression list) count",
                    },
                    {
                      field: "startedAt",
                      type: "string | null",
                      desc: "ISO 8601 timestamp when processing began",
                    },
                    {
                      field: "completedAt",
                      type: "string | null",
                      desc: "ISO 8601 timestamp when processing finished",
                    },
                    {
                      field: "createdAt",
                      type: "string",
                      desc: "ISO 8601 creation timestamp",
                    },
                  ].map((row, i, arr) => (
                    <tr
                      className={i < arr.length - 1 ? "border-b" : ""}
                      key={row.field}
                    >
                      <td className="px-4 py-2">
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                          {row.field}
                        </code>
                      </td>
                      <td className="px-4 py-2 font-mono text-xs">
                        {row.type}
                      </td>
                      <td className="px-4 py-2">{row.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
        <CodeBlock
          className="h-auto"
          data={[
            {
              language: "json",
              filename: "batch status response",
              code: batchStatusExample,
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
        <p className="mt-3 mb-8 text-muted-foreground text-sm">
          Counts are maintained incrementally during the send and reflect SES
          events received so far.
        </p>

        <h3 className="mb-3 font-medium text-lg">List Batch Sends</h3>
        <p className="mb-4 text-muted-foreground">
          <code className="rounded bg-muted px-1.5 py-0.5 text-sm">
            GET /v1/batch
          </code>{" "}
          lists batch sends for the organization, newest first. Query with{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">page</code>,{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">pageSize</code>{" "}
          (max 100),{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">status</code>,{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">channel</code>,
          or{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">search</code>{" "}
          (matches name and subject). The response envelope is{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
            {"{ data, page, pageSize, total }"}
          </code>{" "}
          — <code className="rounded bg-muted px-1 py-0.5 text-xs">total</code>{" "}
          is the full filtered count, not the page length.
        </p>
        <CodeBlock
          className="mb-8 h-auto"
          data={[
            {
              language: "json",
              filename: "batch list response",
              code: batchListExample,
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

        <h3 className="mb-3 font-medium text-lg">List Recipients</h3>
        <p className="mb-4 text-muted-foreground">
          <code className="rounded bg-muted px-1.5 py-0.5 text-sm">
            GET /v1/batch/:id/recipients
          </code>{" "}
          returns per-recipient outcomes.{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">limit</code>{" "}
          defaults to 50 and is capped at{" "}
          <strong className="text-foreground">1000</strong> — this route returns
          JSON through Lambda, which has a response-size ceiling a larger page
          could exceed. Returns 404 (not an empty list) for a batch id that
          doesn't belong to your organization.
        </p>
        <CodeBlock
          className="mb-8 h-auto"
          data={[
            {
              language: "json",
              filename: "batch recipients response",
              code: batchRecipientsExample,
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

        <h3 className="mb-3 font-medium text-lg">Clicked Links</h3>
        <p className="mb-4 text-muted-foreground">
          <code className="rounded bg-muted px-1.5 py-0.5 text-sm">
            GET /v1/batch/:id/clicks
          </code>{" "}
          returns the top clicked links for a batch send, ordered by click count
          and capped at <strong className="text-foreground">50 URLs</strong> —{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">
            truncated
          </code>{" "}
          is <code className="rounded bg-muted px-1 py-0.5 text-xs">true</code>{" "}
          when more distinct URLs exist than were returned. Per-recipient
          unsubscribe and preference-centre links are aggregated into{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">
            unsubscribeCount
          </code>{" "}
          and excluded from{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">data</code>.
        </p>
        <CodeBlock
          className="mb-4 h-auto"
          data={[
            {
              language: "json",
              filename: "batch clicks response",
              code: batchClicksExample,
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

        <p className="mt-3 text-muted-foreground text-sm">
          Use{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
            DELETE /v1/batch/:id
          </code>{" "}
          to cancel a batch in{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">
            scheduled
          </code>
          , <code className="rounded bg-muted px-1 py-0.5 text-xs">queued</code>
          , or{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">
            processing
          </code>{" "}
          status.
        </p>
      </section>

      {/* Email Metrics */}
      <section className="mb-12">
        <SectionHeading
          className="mb-6"
          id="email-metrics"
          markdown={SECTION_MD.metrics}
          title="Email Metrics"
        />
        <p className="mb-4 text-muted-foreground">
          <code className="rounded bg-muted px-1.5 py-0.5 text-sm">
            GET /v1/email/metrics
          </code>{" "}
          returns aggregate email metrics for the organization -- sent,
          delivered, bounces, complaints, suppressions, opens, clicks, and
          rendering failures -- optionally grouped by dimension and time
          granularity. It shares the same per-minute API rate limit as every
          other endpoint; reading your own numbers is not a paid feature.
        </p>
        <Card className="mb-4">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="px-4 py-2 text-left font-medium">Param</th>
                    <th className="px-4 py-2 text-left font-medium">Type</th>
                    <th className="px-4 py-2 text-left font-medium">Default</th>
                  </tr>
                </thead>
                <tbody className="text-muted-foreground">
                  {[
                    {
                      field: "start_date",
                      type: "ISO 8601 date or datetime",
                      desc: "6 days before end_date",
                    },
                    {
                      field: "end_date",
                      type: "ISO 8601 date or datetime",
                      desc: "now",
                    },
                    {
                      field: "timezone",
                      type: "IANA timezone name",
                      desc: "UTC",
                    },
                    {
                      field: "granularity",
                      type: "hourly | daily | weekly | monthly",
                      desc: "daily",
                    },
                    {
                      field: "dimensions",
                      type: "comma-separated dimension names",
                      desc: "none (totals only)",
                    },
                    {
                      field:
                        "broadcast_id, template_id, aws_account_id, domain",
                      type: "comma-separated, max 100 each",
                      desc: "--",
                    },
                  ].map((row, i) => (
                    <tr className={i < 5 ? "border-b" : ""} key={row.field}>
                      <td className="px-4 py-2">
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                          {row.field}
                        </code>
                      </td>
                      <td className="px-4 py-2 font-mono text-xs">
                        {row.type}
                      </td>
                      <td className="px-4 py-2">{row.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
        <p className="mb-3 text-muted-foreground text-sm">
          Dimensions:{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">period</code>,{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">domain</code>,{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">
            broadcast
          </code>
          ,{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">template</code>
          , <code className="rounded bg-muted px-1 py-0.5 text-xs">source</code>
          ,{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">account</code>,
          and{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">region</code>.
          There is no{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">tags</code>{" "}
          dimension -- SES message tags are not persisted on sends. The{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">template</code>
          , <code className="rounded bg-muted px-1 py-0.5 text-xs">source</code>
          ,{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">account</code>,
          and{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">region</code>{" "}
          dimensions have no equivalent in other providers&apos; email APIs.
        </p>
        <CodeBlock
          className="mb-4 h-auto"
          data={[
            {
              language: "bash",
              filename: "terminal.sh",
              code: metricsExample,
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
        <CodeBlock
          className="h-auto"
          data={[
            {
              language: "json",
              filename: "metrics response",
              code: metricsResponseExample,
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
        <p className="mt-3 text-muted-foreground text-sm">
          <code className="rounded bg-muted px-1 py-0.5 text-xs">opened</code>{" "}
          excludes user agents matching a known-bot list;{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">
            openedRaw
          </code>{" "}
          reports the same count with no bot filter applied.{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">clicked</code>{" "}
          is currently unfiltered.
        </p>
      </section>

      {/* Contact Topics */}
      <section className="mb-12">
        <SectionHeading
          className="mb-6"
          id="contact-topics"
          markdown={SECTION_MD.contactTopics}
          title="Contact Topics: PATCH vs PUT"
        />
        <p className="mb-4 text-muted-foreground">
          Topic subscriptions support two update strategies with different
          semantics:
        </p>
        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                PATCH /v1/contacts/:id
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                <strong>Adds</strong> topics to existing subscriptions. No
                topics are removed. Safe for incremental updates from multiple
                sources.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                PUT /v1/contacts/:id/topics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                <strong>Replaces all</strong> subscriptions. Topics not in the
                new list are unsubscribed. Triggers workflow events for both
                additions and removals.
              </p>
            </CardContent>
          </Card>
        </div>
        <p className="mb-4 text-muted-foreground text-sm">
          Both endpoints accept{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">topicIds</code>{" "}
          (UUIDs) and{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">
            topicSlugs
          </code>{" "}
          (human-readable slugs). Topics with double opt-in enabled will send a
          confirmation email unless the contact was previously confirmed.
        </p>
        <CodeBlock
          className="h-auto"
          data={[
            {
              language: "bash",
              filename: "PATCH vs PUT",
              code: contactTopicPatchExample,
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

      {/* SDK Usage */}
      <section className="mb-12">
        <h2 className="mb-6 font-bold text-2xl" id="sdk-usage">
          SDK Usage
        </h2>
        <p className="mb-4 text-muted-foreground">
          The{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-sm">
            @wraps.dev/client
          </code>{" "}
          SDK provides a typed wrapper around the API.
        </p>
        <CodeBlock
          className="h-auto"
          data={[
            { language: "typescript", filename: "client.ts", code: sdkExample },
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

      {/* OpenAPI Spec */}
      <section className="mb-12">
        <SectionHeading
          className="mb-6"
          id="openapi-spec"
          markdown={SECTION_MD.openapi}
          title="OpenAPI Spec"
        />
        <p className="mb-4 text-muted-foreground">
          The full OpenAPI 3.0.3 specification is auto-generated from route
          definitions. Use it with any OpenAPI-compatible tool.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Interactive Docs</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-muted-foreground text-sm">
                Browse and test endpoints in the Swagger UI.
              </p>
              <Button asChild size="sm" variant="outline">
                <a
                  href="https://api.wraps.dev/swagger"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Open Swagger UI
                  <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                </a>
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">JSON Spec</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-muted-foreground text-sm">
                Import into Postman, Insomnia, Scalar, or any OpenAPI tool.
              </p>
              <Button asChild size="sm" variant="outline">
                <a
                  href="https://api.wraps.dev/swagger/json"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Download OpenAPI JSON
                  <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                </a>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Next Steps */}
      <section>
        <h2 className="mb-4 font-semibold text-2xl" id="next-steps">
          Next Steps
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Rate Limits</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-muted-foreground text-sm">
                Per-minute and daily limits by plan.
              </p>
              <Button asChild size="sm" variant="outline">
                <Link href="/docs/reference/rate-limits">
                  View Rate Limits <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
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
              <CardTitle className="text-base">Platform SDK</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-muted-foreground text-sm">
                Typed TypeScript wrapper for the API.
              </p>
              <Button asChild size="sm" variant="outline">
                <Link href="/docs/client-sdk-reference">
                  View SDK Reference <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Environment Variables</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-muted-foreground text-sm">
                All env vars for CLI, SDKs, and CI/CD.
              </p>
              <Button asChild size="sm" variant="outline">
                <Link href="/docs/reference/environment-variables">
                  View Env Vars <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>
    </DocsLayout>
  );
}
