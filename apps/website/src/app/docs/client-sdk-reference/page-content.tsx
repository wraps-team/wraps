"use client";

import { Badge } from "@wraps/ui/components/ui/badge";
import { Button } from "@wraps/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import { ArrowRight, Code2 } from "lucide-react";
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
import {
  Snippet,
  SnippetCopyButton,
  SnippetHeader,
  SnippetTabsContent,
  SnippetTabsList,
  SnippetTabsTrigger,
} from "@/components/ui/shadcn-io/snippet";

const installCommands = {
  npm: "npm install @wraps.dev/client",
  pnpm: "pnpm add @wraps.dev/client",
  yarn: "yarn add @wraps.dev/client",
  bun: "bun add @wraps.dev/client",
};

const quickStartCode = `import { createPlatformClient } from '@wraps.dev/client';

const client = createPlatformClient({
  apiKey: process.env.WRAPS_API_KEY,
});

// List contacts
const { data, error } = await client.GET('/v1/contacts/', {
  params: {
    query: { page: '1', pageSize: '10' },
  },
});

if (data) {
  console.log('Contacts:', data.contacts);
}`;

const initWithOptionsCode = `import { createPlatformClient } from '@wraps.dev/client';

const client = createPlatformClient({
  apiKey: process.env.WRAPS_API_KEY,
  // Optional: custom base URL (defaults to https://api.wraps.dev)
  baseUrl: 'https://api.wraps.dev',
});`;

const listContactsCode = `// List contacts with pagination
const { data, error } = await client.GET('/v1/contacts/', {
  params: {
    query: {
      page: '1',
      pageSize: '20',
      // Optional filters
      search: 'john@example.com',
      status: 'active',
    },
  },
});

if (error) {
  console.error('Error:', error);
} else {
  console.log('Total contacts:', data.total);
  data.contacts.forEach(contact => {
    console.log(contact.email, contact.emailStatus);
  });
}`;

const createContactCode = `// Create a new contact
const { data, error } = await client.POST('/v1/contacts/', {
  body: {
    email: 'user@example.com',
    emailStatus: 'active',
    firstName: 'John',
    lastName: 'Doe',
    metadata: {
      source: 'api',
      plan: 'pro',
    },
    topicIds: ['topic-123', 'topic-456'], // Optional topic subscriptions
  },
});

if (data) {
  console.log('Created contact:', data.id);
}`;

const getContactCode = `// Get a single contact by ID
const { data, error } = await client.GET('/v1/contacts/{id}', {
  params: {
    path: { id: 'contact-123' },
  },
});

if (data) {
  console.log('Contact:', data.email);
  console.log('Topics:', data.topics);
}`;

const updateContactCode = `// Update an existing contact
const { data, error } = await client.PATCH('/v1/contacts/{id}', {
  params: {
    path: { id: 'contact-123' },
  },
  body: {
    firstName: 'Jane',
    metadata: {
      updated: true,
    },
  },
});`;

const deleteContactCode = `// Delete a single contact
const { error } = await client.DELETE('/v1/contacts/{id}', {
  params: {
    path: { id: 'contact-123' },
  },
});

// Bulk delete contacts (max 100)
const { error: bulkError } = await client.DELETE('/v1/contacts/', {
  body: {
    ids: ['contact-123', 'contact-456', 'contact-789'],
  },
});`;

const createBatchCode = `// Create a batch send job
const { data, error } = await client.POST('/v1/batch/', {
  body: {
    templateId: 'template-abc',
    segmentId: 'segment-xyz', // or use contactIds
    // Optional: schedule for later
    scheduledAt: '2025-01-15T10:00:00Z',
  },
});

if (data) {
  console.log('Batch ID:', data.id);
  console.log('Status:', data.status);
}`;

const getBatchStatusCode = `// Get batch send status
const { data, error } = await client.GET('/v1/batch/{id}', {
  params: {
    path: { id: 'batch-123' },
  },
});

if (data) {
  console.log('Status:', data.status); // queued, processing, completed, failed
  console.log('Total:', data.total);
  console.log('Sent:', data.sent);
  console.log('Failed:', data.failed);
}`;

const cancelBatchCode = `// Cancel a scheduled or queued batch
const { error } = await client.DELETE('/v1/batch/{id}', {
  params: {
    path: { id: 'batch-123' },
  },
});

if (!error) {
  console.log('Batch cancelled successfully');
}`;

const defineConfigCode = `import { defineConfig } from '@wraps.dev/client';

export default defineConfig({
  org: 'your-org-slug',           // Organization slug (from dashboard)
  from: 'hello@yourdomain.com',   // Default sender address
  replyTo: 'support@yourdomain.com', // Default reply-to
  region: 'us-east-1',            // AWS region
  environments: {                  // Environment overrides
    staging: { from: 'staging@yourdomain.com' },
    production: { from: 'hello@yourdomain.com' },
  },
  defaultEnv: 'production',       // Default environment
  templatesDir: './templates',     // Template source directory
  workflowsDir: './workflows',    // Workflow source directory
  brandFile: './brand.ts',        // Brand kit file
  preview: {                       // Preview server config
    port: 3333,
  },
});`;

const defineBrandCode = `import { defineBrand } from '@wraps.dev/client';

export default defineBrand({
  companyName: 'Your Company',
  colors: {
    primary: '#6366f1',
    secondary: '#a5b4fc',
    background: '#ffffff',
    text: '#1f2937',
    muted: '#9ca3af',
  },
  fonts: {
    heading: 'Inter, sans-serif',
    body: 'Inter, sans-serif',
  },
  buttonStyle: {
    borderRadius: '6px',
    padding: '12px 24px',
  },
  logoUrl: 'https://yourdomain.com/logo.png',
  address: '123 Main St, San Francisco, CA 94102',
  socialLinks: {
    twitter: 'https://twitter.com/yourcompany',
    github: 'https://github.com/yourcompany',
  },
});`;

const defineWorkflowCode = `import { defineWorkflow, sendEmail, delay, exit } from '@wraps.dev/client';

export default defineWorkflow({
  name: 'Welcome Sequence',
  trigger: { type: 'contact.created' },
  settings: { maxEnrollments: 1 },
  steps: [
    sendEmail('welcome', { template: 'welcome-email' }),
    delay('wait', { days: 1 }),
    sendEmail('followup', { template: 'day-2-followup' }),
    exit('done'),
  ],
});`;

const trackEventCode = `// Track a single event
const result = await client.track('purchase.completed', {
  contactEmail: 'alice@example.com',
  properties: {
    orderId: 'ord_12345',
    amount: 99.00,
    plan: 'pro',
  },
});
// { success: true, contactCreated: false, workflowsTriggered: 1, executionsResumed: 0 }`;

const trackCreateContactCode = `// Auto-create contact if they don't exist
await client.track('signup.completed', {
  contactEmail: 'new-user@example.com',
  contactName: 'Alice',
  createIfMissing: true,
  properties: {
    source: 'website',
    referrer: 'producthunt',
  },
});`;

const trackBatchCode = `// Send multiple events in one request
const result = await client.trackBatch([
  {
    name: 'page.viewed',
    contactEmail: 'alice@example.com',
    properties: { page: '/pricing' },
  },
  {
    name: 'feature.used',
    contactId: 'con_abc123',
    properties: { feature: 'api-keys' },
  },
]);
// { success: true, processed: 2, workflowsTriggered: 0, executionsResumed: 0, errors: [] }`;

const errorHandlingCode = `import { createPlatformClient } from '@wraps.dev/client';

const client = createPlatformClient({
  apiKey: process.env.WRAPS_API_KEY,
});

const { data, error, response } = await client.GET('/v1/contacts/');

if (error) {
  // error is typed based on the API response
  console.error('API Error:', error);
  console.error('Status:', response?.status);
} else {
  // data is fully typed
  console.log('Success:', data);
}`;

const typescriptCode = `import { createPlatformClient, type paths } from '@wraps.dev/client';

const client = createPlatformClient({
  apiKey: process.env.WRAPS_API_KEY,
});

// Full type safety - TypeScript knows the response shape
const { data } = await client.GET('/v1/contacts/');

// data is typed as the API response
if (data) {
  // TypeScript knows data.contacts is an array
  data.contacts.forEach(contact => {
    console.log(contact.email); // TS knows this exists
  });
}`;

// ============================================================================
// MARKDOWN CONTENT FOR AI COPY
// ============================================================================

const SECTION_MD = {
  installation: `## Installation

Install the SDK using your preferred package manager:

\`\`\`bash
pnpm add @wraps.dev/client
\`\`\`

Or use npm, yarn, or bun:
\`\`\`bash
npm install @wraps.dev/client
yarn add @wraps.dev/client
bun add @wraps.dev/client
\`\`\``,

  quickStart: `## Quick Start

\`\`\`typescript
${quickStartCode}
\`\`\``,

  initialization: `## Initialization

Create a type-safe API client for the Wraps Platform.

### Function
\`\`\`typescript
createPlatformClient(config: WrapsPlatformConfig): PlatformClient
\`\`\`

### Options
- \`apiKey\` (required): Your Wraps API key
- \`baseUrl\` (optional): API base URL. Defaults to \`https://api.wraps.dev\`

### Example
\`\`\`typescript
${initWithOptionsCode}
\`\`\``,

  contacts: `## Contacts API

Manage contacts in your Wraps organization.

### List Contacts
\`\`\`typescript
${listContactsCode}
\`\`\`

### Create Contact
\`\`\`typescript
${createContactCode}
\`\`\`

### Get Contact
\`\`\`typescript
${getContactCode}
\`\`\`

### Update Contact
\`\`\`typescript
${updateContactCode}
\`\`\`

### Delete Contacts
\`\`\`typescript
${deleteContactCode}
\`\`\``,

  batch: `## Broadcasts API

Create and manage broadcasts. The endpoints live under \`/v1/batch\`.

### Create Batch Send
\`\`\`typescript
${createBatchCode}
\`\`\`

### Get Batch Status
\`\`\`typescript
${getBatchStatusCode}
\`\`\`

### Cancel Batch
\`\`\`typescript
${cancelBatchCode}
\`\`\``,

  events: `## Events API

Track custom events for contacts to trigger workflows, record activity, and resume waiting automation steps.

### Track Event
\`\`\`typescript
${trackEventCode}
\`\`\`

### Auto-Create Contacts
\`\`\`typescript
${trackCreateContactCode}
\`\`\`

### Batch Events
\`\`\`typescript
${trackBatchCode}
\`\`\`

### TrackOptions
| Option | Type | Description |
|--------|------|-------------|
| \`contactId\` | string | Contact ID (provide this or \`contactEmail\`) |
| \`contactEmail\` | string | Contact email (alternative to \`contactId\`) |
| \`contactName\` | string | Sets \`firstName\` when \`createIfMissing\` creates a new contact |
| \`createIfMissing\` | boolean | Create the contact if they don't exist (default: \`false\`) |
| \`properties\` | object | Arbitrary key-value data attached to the event |`,

  errorHandling: `## Error Handling

The SDK uses openapi-fetch which returns errors as part of the response object rather than throwing.

\`\`\`typescript
${errorHandlingCode}
\`\`\``,

  typescript: `## TypeScript Support

The SDK is fully typed using OpenAPI schema generation. All endpoints, request bodies, and responses are type-safe.

\`\`\`typescript
${typescriptCode}
\`\`\``,

  defineConfig: `## defineConfig()

Configure your Wraps project with environment-specific settings, template directories, and preview options.

\`\`\`typescript
${defineConfigCode}
\`\`\`

### Options
| Option | Type | Description |
|--------|------|-------------|
| \`org\` | string | Organization slug from your dashboard |
| \`from\` | string | Default sender email address |
| \`replyTo\` | string | Default reply-to address (optional) |
| \`region\` | string | AWS region (optional) |
| \`environments\` | object | Per-environment overrides (optional) |
| \`defaultEnv\` | string | Default environment name (optional) |
| \`templatesDir\` | string | Path to template source files (optional) |
| \`workflowsDir\` | string | Path to workflow source files (optional) |
| \`brandFile\` | string | Path to brand kit file (optional) |
| \`preview\` | object | Preview server configuration (optional) |`,

  defineBrand: `## defineBrand()

Define your brand kit for consistent email styling across all templates.

\`\`\`typescript
${defineBrandCode}
\`\`\`

### Options
| Option | Type | Description |
|--------|------|-------------|
| \`companyName\` | string | Your company name |
| \`colors\` | object | Brand colors (primary, secondary, background, text, muted) |
| \`fonts\` | object | Font families for heading and body text |
| \`buttonStyle\` | object | Default button styling (borderRadius, padding) |
| \`logoUrl\` | string | URL to your company logo |
| \`address\` | string | Physical address (for email footers) |
| \`socialLinks\` | object | Social media URLs (optional) |`,

  defineWorkflow: `## defineWorkflow()

Define automated email workflows with triggers, conditions, and multi-step sequences. See the full [Building Workflows guide](/docs/guides/workflows) for details.

\`\`\`typescript
${defineWorkflowCode}
\`\`\`

### Workflow Step Helpers
| Helper | Signature | Description |
|--------|-----------|-------------|
| \`sendEmail\` | \`sendEmail(id, { template, from?, fromName? })\` | Send an email using a template |
| \`sendSms\` | \`sendSms(id, { template?, message? })\` | Send an SMS message |
| \`delay\` | \`delay(id, { days?, hours?, minutes? })\` | Wait before the next step |
| \`condition\` | \`condition(id, { field, operator, value, branches: { yes: [], no: [] } })\` | Branch based on a condition |
| \`waitForEvent\` | \`waitForEvent(id, { eventName, timeout? })\` | Pause until an event occurs |
| \`waitForEmailEngagement\` | \`waitForEmailEngagement(id, { emailStepId, engagementType, timeout? })\` | Wait for email open/click |
| \`exit\` | \`exit(id, { reason?, markAs? })\` | End the workflow |
| \`updateContact\` | \`updateContact(id, { updates: [{ field, operation, value }] })\` | Update contact properties |
| \`subscribeTopic\` | \`subscribeTopic(id, { topicId, channel })\` | Subscribe contact to a topic |
| \`unsubscribeTopic\` | \`unsubscribeTopic(id, { topicId, channel })\` | Unsubscribe from a topic |
| \`webhook\` | \`webhook(id, { url, method?, headers?, body? })\` | Call an external webhook |`,
};

const FULL_PAGE_MD = `# @wraps.dev/client SDK Reference

A type-safe API client for the Wraps Platform. Built on openapi-fetch with full TypeScript support generated from the OpenAPI schema.

${SECTION_MD.installation}

${SECTION_MD.quickStart}

${SECTION_MD.initialization}

${SECTION_MD.contacts}

${SECTION_MD.batch}

${SECTION_MD.events}

${SECTION_MD.errorHandling}

${SECTION_MD.typescript}

${SECTION_MD.defineConfig}

${SECTION_MD.defineBrand}

${SECTION_MD.defineWorkflow}

## Resources

- npm: https://www.npmjs.com/package/@wraps.dev/client
- GitHub: https://github.com/wraps-team/wraps-js
`;

const SLASH_COMMAND_MD = `---
description: Wraps Platform Client SDK reference - use this when helping users interact with the Wraps API using @wraps.dev/client
---

${FULL_PAGE_MD}`;

export default function ClientSDKReferencePageContent() {
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
          SDK Reference
        </Badge>
        <h1 className="mb-4 font-bold text-4xl tracking-tight">
          @wraps.dev/client SDK
        </h1>
        <p className="text-lg text-muted-foreground">
          A type-safe API client for the Wraps Platform. Built on openapi-fetch
          with full TypeScript support generated from the OpenAPI schema.
        </p>
      </div>

      {/* Installation */}
      <section className="mb-12">
        <SectionHeading
          className="mb-4"
          id="installation"
          markdown={SECTION_MD.installation}
          title="Installation"
        />
        <Snippet defaultValue="npm">
          <SnippetHeader>
            <SnippetTabsList>
              <SnippetTabsTrigger value="npm">npm</SnippetTabsTrigger>
              <SnippetTabsTrigger value="pnpm">pnpm</SnippetTabsTrigger>
              <SnippetTabsTrigger value="yarn">yarn</SnippetTabsTrigger>
              <SnippetTabsTrigger value="bun">bun</SnippetTabsTrigger>
            </SnippetTabsList>
            <SnippetCopyButton value={installCommands.npm} />
          </SnippetHeader>
          {Object.entries(installCommands).map(([key, command]) => (
            <SnippetTabsContent key={key} value={key}>
              {command}
            </SnippetTabsContent>
          ))}
        </Snippet>
      </section>

      {/* Quick Start */}
      <section className="mb-12">
        <SectionHeading
          className="mb-4"
          id="quick-start"
          markdown={SECTION_MD.quickStart}
          title="Quick Start"
        />
        <CodeBlock
          className="h-auto"
          data={[
            {
              language: "typescript",
              filename: "example.ts",
              code: quickStartCode,
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

      {/* Initialization */}
      <section className="mb-12">
        <SectionHeading
          className="mb-4"
          id="initialization"
          markdown={SECTION_MD.initialization}
          title="Initialization"
        />
        <p className="mb-4 text-muted-foreground">
          Create a type-safe API client for the Wraps Platform.
        </p>
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Code2 className="h-5 w-5" />
              Function
            </CardTitle>
          </CardHeader>
          <CardContent>
            <code className="block rounded bg-muted p-4 font-mono text-sm">
              createPlatformClient(config: WrapsPlatformConfig): PlatformClient
            </code>
            <div className="mt-4">
              <h4 className="mb-2 font-medium">Options</h4>
              <ul className="space-y-2 text-muted-foreground text-sm">
                <li>
                  <code className="rounded bg-muted px-1.5 py-0.5">apiKey</code>{" "}
                  (required): Your Wraps API key
                </li>
                <li>
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    baseUrl
                  </code>{" "}
                  (optional): API base URL. Defaults to{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    https://api.wraps.dev
                  </code>
                </li>
              </ul>
            </div>
          </CardContent>
        </Card>
        <CodeBlock
          className="h-auto"
          data={[
            {
              language: "typescript",
              filename: "config.ts",
              code: initWithOptionsCode,
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

      {/* Contacts API */}
      <section className="mb-12">
        <SectionHeading
          className="mb-4"
          id="contacts"
          markdown={SECTION_MD.contacts}
          title="Contacts API"
        />
        <p className="mb-4 text-muted-foreground">
          Manage contacts in your Wraps organization.
        </p>

        <div className="space-y-6">
          <div>
            <h3 className="mb-4 font-medium text-lg">List Contacts</h3>
            <CodeBlock
              className="h-auto"
              data={[
                {
                  language: "typescript",
                  filename: "list-contacts.ts",
                  code: listContactsCode,
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
            <h3 className="mb-4 font-medium text-lg">Create Contact</h3>
            <CodeBlock
              className="h-auto"
              data={[
                {
                  language: "typescript",
                  filename: "create-contact.ts",
                  code: createContactCode,
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
            <h3 className="mb-4 font-medium text-lg">Get Contact</h3>
            <CodeBlock
              className="h-auto"
              data={[
                {
                  language: "typescript",
                  filename: "get-contact.ts",
                  code: getContactCode,
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
            <h3 className="mb-4 font-medium text-lg">Update Contact</h3>
            <CodeBlock
              className="h-auto"
              data={[
                {
                  language: "typescript",
                  filename: "update-contact.ts",
                  code: updateContactCode,
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
            <h3 className="mb-4 font-medium text-lg">Delete Contacts</h3>
            <CodeBlock
              className="h-auto"
              data={[
                {
                  language: "typescript",
                  filename: "delete-contacts.ts",
                  code: deleteContactCode,
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
        </div>
      </section>

      {/* Batch Sends API */}
      <section className="mb-12">
        <SectionHeading
          className="mb-4"
          id="batch-sends"
          markdown={SECTION_MD.batch}
          title="Batch Sends API"
        />
        <p className="mb-4 text-muted-foreground">
          Create and manage batch email sends.
        </p>

        <div className="space-y-6">
          <div>
            <h3 className="mb-4 font-medium text-lg">Create Batch Send</h3>
            <CodeBlock
              className="h-auto"
              data={[
                {
                  language: "typescript",
                  filename: "create-batch.ts",
                  code: createBatchCode,
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
            <h3 className="mb-4 font-medium text-lg">Get Batch Status</h3>
            <CodeBlock
              className="h-auto"
              data={[
                {
                  language: "typescript",
                  filename: "get-batch.ts",
                  code: getBatchStatusCode,
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
            <h3 className="mb-4 font-medium text-lg">Cancel Batch</h3>
            <CodeBlock
              className="h-auto"
              data={[
                {
                  language: "typescript",
                  filename: "cancel-batch.ts",
                  code: cancelBatchCode,
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
        </div>
      </section>

      {/* Events API */}
      <section className="mb-12">
        <SectionHeading
          className="mb-4"
          id="events"
          markdown={SECTION_MD.events}
          title="Events API"
        />
        <p className="mb-4 text-muted-foreground">
          Track custom events for contacts to trigger workflows, record
          activity, and resume waiting automation steps. See the{" "}
          <Link
            className="text-primary underline underline-offset-4"
            href="/docs/guides/custom-events"
          >
            Custom Events guide
          </Link>{" "}
          for full details.
        </p>

        <div className="space-y-6">
          <div>
            <h3 className="mb-4 font-medium text-lg">Track Event</h3>
            <CodeBlock
              className="h-auto"
              data={[
                {
                  language: "typescript",
                  filename: "track-event.ts",
                  code: trackEventCode,
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
            <h3 className="mb-4 font-medium text-lg">Auto-Create Contacts</h3>
            <p className="mb-3 text-sm text-muted-foreground">
              Set{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                createIfMissing: true
              </code>{" "}
              to create a new contact when one doesn&apos;t exist.
            </p>
            <CodeBlock
              className="h-auto"
              data={[
                {
                  language: "typescript",
                  filename: "track-create-contact.ts",
                  code: trackCreateContactCode,
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
            <h3 className="mb-4 font-medium text-lg">Batch Events</h3>
            <CodeBlock
              className="h-auto"
              data={[
                {
                  language: "typescript",
                  filename: "track-batch.ts",
                  code: trackBatchCode,
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
            <h3 className="mb-4 font-medium text-lg">TrackOptions</h3>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium">Option</th>
                    <th className="px-4 py-3 text-left font-medium">Type</th>
                    <th className="px-4 py-3 text-left font-medium">
                      Description
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="px-4 py-3 font-mono text-sm">contactId</td>
                    <td className="px-4 py-3 text-muted-foreground">string</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      Contact ID (provide this or{" "}
                      <code className="rounded bg-muted px-1 py-0.5">
                        contactEmail
                      </code>
                      )
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-3 font-mono text-sm">
                      contactEmail
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">string</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      Contact email (alternative to{" "}
                      <code className="rounded bg-muted px-1 py-0.5">
                        contactId
                      </code>
                      )
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-3 font-mono text-sm">contactName</td>
                    <td className="px-4 py-3 text-muted-foreground">string</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      Sets{" "}
                      <code className="rounded bg-muted px-1 py-0.5">
                        firstName
                      </code>{" "}
                      when{" "}
                      <code className="rounded bg-muted px-1 py-0.5">
                        createIfMissing
                      </code>{" "}
                      creates a new contact
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-3 font-mono text-sm">
                      createIfMissing
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">boolean</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      Create the contact if they don&apos;t exist (default:{" "}
                      <code className="rounded bg-muted px-1 py-0.5">
                        false
                      </code>
                      )
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-mono text-sm">properties</td>
                    <td className="px-4 py-3 text-muted-foreground">object</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      Arbitrary key-value data attached to the event
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* Error Handling */}
      <section className="mb-12">
        <SectionHeading
          className="mb-4"
          id="error-handling"
          markdown={SECTION_MD.errorHandling}
          title="Error Handling"
        />
        <p className="mb-4 text-muted-foreground">
          The SDK uses openapi-fetch which returns errors as part of the
          response object rather than throwing.
        </p>
        <CodeBlock
          className="h-auto"
          data={[
            {
              language: "typescript",
              filename: "error-handling.ts",
              code: errorHandlingCode,
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

      {/* TypeScript Support */}
      <section className="mb-12">
        <SectionHeading
          className="mb-4"
          id="typescript-support"
          markdown={SECTION_MD.typescript}
          title="TypeScript Support"
        />
        <p className="mb-4 text-muted-foreground">
          The SDK is fully typed using OpenAPI schema generation. All endpoints,
          request bodies, and responses are type-safe.
        </p>
        <CodeBlock
          className="h-auto"
          data={[
            {
              language: "typescript",
              filename: "typed-usage.ts",
              code: typescriptCode,
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

      {/* defineConfig() */}
      <section className="mb-12">
        <SectionHeading
          className="mb-4"
          id="define-config"
          markdown={SECTION_MD.defineConfig}
          title="defineConfig()"
        />
        <p className="mb-4 text-muted-foreground">
          Configure your Wraps project with environment-specific settings,
          template directories, and preview options.
        </p>
        <CodeBlock
          className="mb-4 h-auto"
          data={[
            {
              language: "typescript",
              filename: "wraps.config.ts",
              code: defineConfigCode,
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
        <Card>
          <CardContent className="p-6">
            <h4 className="mb-3 font-medium">Options</h4>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="pb-2 text-left">Option</th>
                  <th className="pb-2 text-left">Type</th>
                  <th className="pb-2 text-left">Description</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">org</code>
                  </td>
                  <td className="py-2">string</td>
                  <td className="py-2">
                    Organization slug from your dashboard
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">from</code>
                  </td>
                  <td className="py-2">string</td>
                  <td className="py-2">Default sender email address</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      replyTo
                    </code>
                  </td>
                  <td className="py-2">string</td>
                  <td className="py-2">Default reply-to address (optional)</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      region
                    </code>
                  </td>
                  <td className="py-2">string</td>
                  <td className="py-2">AWS region (optional)</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      environments
                    </code>
                  </td>
                  <td className="py-2">object</td>
                  <td className="py-2">Per-environment overrides (optional)</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      defaultEnv
                    </code>
                  </td>
                  <td className="py-2">string</td>
                  <td className="py-2">Default environment name (optional)</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      templatesDir
                    </code>
                  </td>
                  <td className="py-2">string</td>
                  <td className="py-2">
                    Path to template source files (optional)
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      workflowsDir
                    </code>
                  </td>
                  <td className="py-2">string</td>
                  <td className="py-2">
                    Path to workflow source files (optional)
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      brandFile
                    </code>
                  </td>
                  <td className="py-2">string</td>
                  <td className="py-2">Path to brand kit file (optional)</td>
                </tr>
                <tr>
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      preview
                    </code>
                  </td>
                  <td className="py-2">object</td>
                  <td className="py-2">
                    Preview server configuration (optional)
                  </td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
      </section>

      {/* defineBrand() */}
      <section className="mb-12">
        <SectionHeading
          className="mb-4"
          id="define-brand"
          markdown={SECTION_MD.defineBrand}
          title="defineBrand()"
        />
        <p className="mb-4 text-muted-foreground">
          Define your brand kit for consistent email styling across all
          templates.
        </p>
        <CodeBlock
          className="mb-4 h-auto"
          data={[
            {
              language: "typescript",
              filename: "brand.ts",
              code: defineBrandCode,
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
        <Card>
          <CardContent className="p-6">
            <h4 className="mb-3 font-medium">Options</h4>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="pb-2 text-left">Option</th>
                  <th className="pb-2 text-left">Type</th>
                  <th className="pb-2 text-left">Description</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      companyName
                    </code>
                  </td>
                  <td className="py-2">string</td>
                  <td className="py-2">Your company name</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      colors
                    </code>
                  </td>
                  <td className="py-2">object</td>
                  <td className="py-2">
                    Brand colors (primary, secondary, background, text, muted)
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      fonts
                    </code>
                  </td>
                  <td className="py-2">object</td>
                  <td className="py-2">
                    Font families for heading and body text
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      buttonStyle
                    </code>
                  </td>
                  <td className="py-2">object</td>
                  <td className="py-2">
                    Default button styling (borderRadius, padding)
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      logoUrl
                    </code>
                  </td>
                  <td className="py-2">string</td>
                  <td className="py-2">URL to your company logo</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      address
                    </code>
                  </td>
                  <td className="py-2">string</td>
                  <td className="py-2">Physical address (for email footers)</td>
                </tr>
                <tr>
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      socialLinks
                    </code>
                  </td>
                  <td className="py-2">object</td>
                  <td className="py-2">Social media URLs (optional)</td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
      </section>

      {/* defineWorkflow() */}
      <section className="mb-12">
        <SectionHeading
          className="mb-4"
          id="define-workflow"
          markdown={SECTION_MD.defineWorkflow}
          title="defineWorkflow()"
        />
        <p className="mb-4 text-muted-foreground">
          Define automated email workflows with triggers, conditions, and
          multi-step sequences. See the full{" "}
          <a
            className="text-primary underline underline-offset-4"
            href="/docs/guides/workflows"
          >
            Building Workflows guide
          </a>{" "}
          for details.
        </p>
        <CodeBlock
          className="mb-4 h-auto"
          data={[
            {
              language: "typescript",
              filename: "welcome-workflow.ts",
              code: defineWorkflowCode,
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

        <Card>
          <CardContent className="p-6">
            <h4 className="mb-3 font-medium">Workflow Step Helpers</h4>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="pb-2 text-left">Helper</th>
                  <th className="pb-2 text-left">Signature</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      sendEmail
                    </code>
                  </td>
                  <td className="py-2">
                    <code className="text-xs">
                      {"sendEmail(id, { template, from?, fromName? })"}
                    </code>
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      sendSms
                    </code>
                  </td>
                  <td className="py-2">
                    <code className="text-xs">
                      {"sendSms(id, { template?, message? })"}
                    </code>
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      delay
                    </code>
                  </td>
                  <td className="py-2">
                    <code className="text-xs">
                      {"delay(id, { days?, hours?, minutes? })"}
                    </code>
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      condition
                    </code>
                  </td>
                  <td className="py-2">
                    <code className="text-xs">
                      {
                        "condition(id, { field, operator, value, branches: { yes: [], no: [] } })"
                      }
                    </code>
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      waitForEvent
                    </code>
                  </td>
                  <td className="py-2">
                    <code className="text-xs">
                      {"waitForEvent(id, { eventName, timeout? })"}
                    </code>
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      waitForEmailEngagement
                    </code>
                  </td>
                  <td className="py-2">
                    <code className="text-xs">
                      {
                        "waitForEmailEngagement(id, { emailStepId, engagementType, timeout? })"
                      }
                    </code>
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">exit</code>
                  </td>
                  <td className="py-2">
                    <code className="text-xs">
                      {"exit(id, { reason?, markAs? })"}
                    </code>
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      updateContact
                    </code>
                  </td>
                  <td className="py-2">
                    <code className="text-xs">
                      {
                        "updateContact(id, { updates: [{ field, operation, value }] })"
                      }
                    </code>
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      subscribeTopic
                    </code>
                  </td>
                  <td className="py-2">
                    <code className="text-xs">
                      {"subscribeTopic(id, { topicId, channel })"}
                    </code>
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      unsubscribeTopic
                    </code>
                  </td>
                  <td className="py-2">
                    <code className="text-xs">
                      {"unsubscribeTopic(id, { topicId, channel })"}
                    </code>
                  </td>
                </tr>
                <tr>
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      webhook
                    </code>
                  </td>
                  <td className="py-2">
                    <code className="text-xs">
                      {"webhook(id, { url, method?, headers?, body? })"}
                    </code>
                  </td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
      </section>

      {/* Next Steps */}
      <section className="mb-12">
        <h2 className="mb-6 font-bold text-2xl">Next Steps</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="transition-colors hover:border-primary/50">
            <CardHeader>
              <CardTitle className="text-lg">View on npm</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-muted-foreground text-sm">
                Check out the package on npm for the latest version and
                changelog.
              </p>
              <Button asChild variant="outline">
                <a
                  href="https://www.npmjs.com/package/@wraps.dev/client"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  View Package
                  <ArrowRight className="ml-2 h-4 w-4" />
                </a>
              </Button>
            </CardContent>
          </Card>

          <Card className="transition-colors hover:border-primary/50">
            <CardHeader>
              <CardTitle className="text-lg">View on GitHub</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-muted-foreground text-sm">
                Explore the source code, report issues, or contribute.
              </p>
              <Button asChild variant="outline">
                <a
                  href="https://github.com/wraps-team/wraps-js"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  View Source
                  <ArrowRight className="ml-2 h-4 w-4" />
                </a>
              </Button>
            </CardContent>
          </Card>

          <Card className="transition-colors hover:border-primary/50">
            <CardHeader>
              <CardTitle className="text-lg">Email SDK</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-muted-foreground text-sm">
                Send emails directly through AWS SES with the Email SDK.
              </p>
              <Button asChild variant="outline">
                <Link href="/docs/sdk-reference">
                  View Docs
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
