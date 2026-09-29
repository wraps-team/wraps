"use client";

import { Badge } from "@wraps/ui/components/ui/badge";
import { Button } from "@wraps/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import { ArrowRight, Code2, Info } from "lucide-react";
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
  npm: "npm install @wraps.dev/email",
  pnpm: "pnpm add @wraps.dev/email",
  yarn: "yarn add @wraps.dev/email",
  bun: "bun add @wraps.dev/email",
};

const quickStartCode = `import { WrapsEmail } from '@wraps.dev/email';

const email = new WrapsEmail();

const result = await email.send({
  from: 'hello@yourdomain.com',
  to: 'user@example.com',
  subject: 'Welcome!',
  html: '<h1>Hello!</h1>',
});

console.log('Message ID:', result.messageId);`;

const initWithOptionsCode = `const email = new WrapsEmail({
  region: 'us-west-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN, // optional
  },
});`;

const envVarsCode = `# Set environment variables
export AWS_ACCESS_KEY_ID=your_access_key
export AWS_SECRET_ACCESS_KEY=your_secret_key
export AWS_REGION=us-east-1

# Then credentials are auto-detected
const email = new WrapsEmail();`;

const localStackCode = `// Testing with LocalStack
const email = new WrapsEmail({
  region: 'us-east-1',
  endpoint: 'http://localhost:4566',
});`;

const wrapsEmailConfigCode = `type WrapsEmailConfig = {
  client?: SESClient;           // Pre-configured SES client (takes precedence)
  s3Client?: S3Client;          // Pre-configured S3 client for inbox
  inboxBucketName?: string;     // S3 bucket for inbound email storage
  region?: string;              // AWS region (default: 'us-east-1')
  credentials?: {               // Explicit AWS credentials (static or provider)
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  } | AwsCredentialIdentityProvider;
  roleArn?: string;             // IAM role for OIDC assumption
  roleSessionName?: string;     // Session name for AssumeRole
  endpoint?: string;            // Custom endpoint (e.g., LocalStack)
  historyTableName?: string;    // DynamoDB table for email event history
  dynamodbClient?: DynamoDBDocumentClient; // Pre-configured DynamoDB client
  sesv2Client?: SESv2Client;    // Pre-configured SES v2 client for suppression
  replyThreading?: ReplyThreadingConfig; // Enables signed reply-to threading
};`;

const cloudflareWorkersCode = `import { SESError, ValidationError, WrapsEmail } from '@wraps.dev/email/workers';

const email = new WrapsEmail({
  region: env.AWS_REGION,          // required — no credential chain at the edge
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  },
});

const result = await email.send({
  from: 'hello@example.com',
  to: 'user@example.com',
  subject: 'Hello from the edge!',
  html: '<h1>Hi there</h1>',
});

console.log(result.messageId);`;

const basicEmailCode = `const result = await email.send({
  from: 'hello@yourdomain.com',
  to: 'user@example.com',
  subject: 'Welcome to our app',
  html: '<h1>Welcome!</h1><p>Thanks for signing up.</p>',
  text: 'Welcome! Thanks for signing up.',
});

console.log('Message ID:', result.messageId);
console.log('Request ID:', result.requestId);`;

const multipleRecipientsCode = `const result = await email.send({
  from: 'newsletter@yourdomain.com',
  to: ['user1@example.com', 'user2@example.com'],
  cc: 'manager@yourdomain.com',
  bcc: ['archive@yourdomain.com'],
  replyTo: 'support@yourdomain.com',
  subject: 'Weekly Newsletter',
  html: '<h1>This week\\'s updates</h1>',
});`;

const tagsCode = `// Add SES tags for tracking and analytics
await email.send({
  from: 'you@yourdomain.com',
  to: 'user@example.com',
  subject: 'Newsletter',
  html: '<p>Content</p>',
  tags: {
    campaign: 'newsletter-2025-01',
    type: 'marketing',
  },
  configurationSetName: 'wraps-email-tracking', // optional
});`;

const reactEmailCode = `import { WelcomeEmail } from './emails/Welcome';

// Send using React.email component
await email.send({
  from: 'hello@yourdomain.com',
  to: 'user@example.com',
  subject: 'Welcome to our platform',
  react: <WelcomeEmail name="John" orderId="12345" />,
});`;

const attachmentsCode = `// Single attachment
const result = await email.send({
  from: 'you@yourdomain.com',
  to: 'user@example.com',
  subject: 'Your invoice',
  html: '<p>Please find your invoice attached.</p>',
  attachments: [
    {
      filename: 'invoice.pdf',
      content: pdfBuffer, // Buffer or base64 string
      contentType: 'application/pdf', // Optional - auto-detected
    },
  ],
});

// Multiple attachments
await email.send({
  from: 'you@yourdomain.com',
  to: 'user@example.com',
  subject: 'Monthly Report',
  html: '<h1>Monthly Report</h1>',
  attachments: [
    { filename: 'report.pdf', content: pdfBuffer },
    { filename: 'chart.png', content: imageBuffer },
    { filename: 'data.csv', content: csvBuffer },
  ],
});`;

const replyThreadingConfigCode = `const email = new WrapsEmail({
  region: 'us-east-1',
  replyThreading: {
    // Defaults shown — all fields optional
    parameterPrefix: '/wraps/email/reply-secret/', // SSM prefix written by the CLI
    ttlSeconds: 90 * 86_400,                       // 90 days; 0 = infinite
    cacheTtlMs: 5 * 60 * 1000,                     // per-domain secret cache
    // replyDomain: 'r.mail.yourapp.com',          // defaults to r.mail.{fromDomain}
  },
});`;

const replyThreadingSendCode = `const conversationId = email.replyThreading.newConversation();

const result = await email.send({
  from: 'agent@yourapp.com',
  to: 'user@example.com',
  subject: 'Re: your support request',
  html: '<p>Hey — following up on your ticket.</p>',
  conversationId,
});

// result.conversationId === conversationId
// result.sendId is a fresh 11-char id for this specific send
await saveThread({ conversationId: result.conversationId, sendId: result.sendId });`;

const createTemplateCode = `// Create a template with variables
await email.templates.create({
  name: 'welcome-email',
  subject: 'Welcome to {{companyName}}, {{name}}!',
  html: \`
    <h1>Welcome {{name}}!</h1>
    <p>Click to confirm: <a href="{{confirmUrl}}">Confirm Account</a></p>
  \`,
  text: 'Welcome {{name}}! Click to confirm: {{confirmUrl}}',
});`;

const createTemplateFromReactCode = `import { WelcomeEmailTemplate } from './emails/Welcome';

// Create template from React.email component
await email.templates.createFromReact({
  name: 'welcome-email-v2',
  subject: 'Welcome to {{companyName}}, {{name}}!',
  react: <WelcomeEmailTemplate />,
  // React component should use {{variable}} syntax
});`;

const manageTemplatesCode = `// Get template details
const template = await email.templates.get('welcome-email');
console.log(template.name, template.subject);

// List all templates
const templates = await email.templates.list();
templates.forEach(t => console.log(t.name, t.createdTimestamp));

// Update a template
await email.templates.update({
  name: 'welcome-email',
  subject: 'Welcome aboard, {{name}}!',
  html: '<h1>Welcome {{name}}!</h1>...',
});

// Delete a template
await email.templates.delete('welcome-email');`;

const sendTemplateCode = `const result = await email.sendTemplate({
  from: 'hello@yourdomain.com',
  to: 'user@example.com',
  template: 'welcome-email',
  templateData: {
    name: 'John Doe',
    companyName: 'Acme Corp',
    confirmUrl: 'https://example.com/confirm/abc123',
  },
});

console.log('Email sent:', result.messageId);`;

const sendBulkTemplateCode = `const result = await email.sendBulkTemplate({
  from: 'hello@yourdomain.com',
  template: 'weekly-digest',
  destinations: [
    {
      to: 'alice@example.com',
      templateData: { name: 'Alice', unreadCount: 5 },
    },
    {
      to: 'bob@example.com',
      templateData: { name: 'Bob', unreadCount: 12 },
    },
  ],
  defaultTemplateData: {
    companyName: 'Acme Corp',
    year: '2025',
  },
});

// Check results for each recipient
result.status.forEach((item, i) => {
  if (item.status === 'success') {
    console.log(\`Email \${i + 1} sent: \${item.messageId}\`);
  } else {
    console.log(\`Email \${i + 1} failed: \${item.error}\`);
  }
});`;

const sendBatchCode = `const result = await email.sendBatch({
  from: 'hello@yourdomain.com',
  entries: [
    {
      to: 'alice@example.com',
      subject: 'Hi Alice',
      html: '<p>Hello Alice! Your order #1001 has shipped.</p>',
    },
    {
      to: 'bob@example.com',
      subject: 'Hi Bob',
      html: '<p>Hello Bob! Your order #1002 has shipped.</p>',
    },
    {
      to: 'carol@example.com',
      subject: 'Hi Carol',
      html: '<p>Hello Carol! Your order #1003 has shipped.</p>',
    },
  ],
  replyTo: 'support@yourdomain.com',
  tags: { campaign: 'order-shipped' },
});

console.log(\`Sent: \${result.successCount}, Failed: \${result.failureCount}\`);

for (const entry of result.results) {
  if (entry.status === 'success') {
    console.log(\`Entry \${entry.index}: \${entry.messageId}\`);
  } else {
    console.log(\`Entry \${entry.index} failed: \${entry.error}\`);
  }
}`;

const htmlToPlainTextCode = `import { htmlToPlainText } from '@wraps.dev/email';

const html = '<h1>Welcome!</h1><p>Thanks for <a href="https://example.com">signing up</a>.</p>';
const text = htmlToPlainText(html);

console.log(text);
// Welcome!
//
// Thanks for signing up (https://example.com).`;

const inboxGetRawCode = `// Get a presigned URL for the raw MIME email (valid for 1 hour)
const rawUrl = await email.inbox.getRaw('email-abc123');

// Download the raw email
const response = await fetch(rawUrl);
const rawMime = await response.text();

console.log('Raw MIME:', rawMime.substring(0, 200));`;

// Inbox code examples
const inboxInitCode = `const email = new WrapsEmail({
  inboxBucketName: 'your-inbound-bucket-name',
});`;

const inboxListCode = `const { emails, nextToken } = await email.inbox.list({
  maxResults: 20,
  continuationToken: undefined, // for pagination
});

for (const summary of emails) {
  console.log(summary.emailId, summary.key, summary.lastModified);
}`;

const inboxGetCode = `const inboundEmail = await email.inbox.get('email-abc123');

console.log('From:', inboundEmail.from.address);
console.log('Subject:', inboundEmail.subject);
console.log('HTML:', inboundEmail.html);
console.log('Attachments:', inboundEmail.attachments.length);
console.log('Spam:', inboundEmail.spamVerdict);
console.log('Virus:', inboundEmail.virusVerdict);`;

const inboxReplyCode = `// Reply with proper threading headers (In-Reply-To, References)
const result = await email.inbox.reply('email-abc123', {
  from: 'support@yourdomain.com',
  text: 'Thanks for reaching out!',
  html: '<p>Thanks for reaching out!</p>',
  attachments: [], // optional
});

console.log('Reply sent:', result.messageId);`;

const inboxForwardCode = `// Passthrough mode (default): rewrites headers, keeps original body
const result = await email.inbox.forward('email-abc123', {
  from: 'noreply@yourdomain.com',
  to: 'team@yourdomain.com',
  addPrefix: '[Customer]', // optional subject prefix
});

// Wrapped mode: builds new message with forwarded content
const result2 = await email.inbox.forward('email-abc123', {
  from: 'noreply@yourdomain.com',
  to: 'team@yourdomain.com',
  passthrough: false,
  text: 'FYI - see below', // optional intro text
});`;

const inboxAttachmentCode = `// Get presigned URL for an attachment (valid for 1 hour by default)
const url = await email.inbox.getAttachment('email-abc123', 'attachment-id', {
  expiresIn: 3600, // seconds
});`;

const inboxDeleteCode = `// Delete email and all associated files (parsed JSON, raw MIME, attachments)
await email.inbox.delete('email-abc123');`;

// Events code examples
const eventsInitCode = `const email = new WrapsEmail({
  historyTableName: 'wraps-email-history',
});`;

const eventsGetCode = `// Get full status and event timeline for an email
const status = await email.events.get('message-id-from-send');

if (status) {
  console.log('Status:', status.status);     // 'delivered', 'opened', 'bounced', etc.
  console.log('From:', status.from);
  console.log('To:', status.to);
  console.log('Subject:', status.subject);
  console.log('Sent at:', new Date(status.sentAt));
  console.log('Last event:', new Date(status.lastEventAt));

  // Full event timeline
  for (const event of status.events) {
    console.log(\`  \${event.type} at \${new Date(event.timestamp)}\`);
    if (event.metadata) console.log('    metadata:', event.metadata);
  }
}`;

const eventsListCode = `// List recent emails with status (paginated)
const { emails, nextToken } = await email.events.list({
  accountId: '123456789012',
  startTime: new Date('2025-01-01'),
  maxResults: 20,
});

for (const item of emails) {
  console.log(\`\${item.messageId}: \${item.status} - \${item.subject}\`);
}

// Fetch next page
if (nextToken) {
  const nextPage = await email.events.list({
    accountId: '123456789012',
    continuationToken: nextToken,
  });
}`;

// Suppression code examples
const suppressionGetCode = `// Check if an email is suppressed
const entry = await email.suppression.get('user@example.com');

if (entry) {
  console.log('Suppressed:', entry.email);
  console.log('Reason:', entry.reason);       // 'BOUNCE' or 'COMPLAINT'
  console.log('Since:', entry.lastUpdated);
  console.log('Message ID:', entry.messageId); // original bounce/complaint message
} else {
  console.log('Email is not suppressed');
}`;

const suppressionAddCode = `// Manually add an email to the suppression list
await email.suppression.add('bad-address@example.com', 'BOUNCE');

// Also works for complaints
await email.suppression.add('unsubscribed@example.com', 'COMPLAINT');`;

const suppressionRemoveCode = `// Remove from suppression list (idempotent — won't throw if not found)
await email.suppression.remove('user@example.com');`;

const suppressionListCode = `// List all suppressed emails (paginated)
const { entries, nextToken } = await email.suppression.list({
  reason: 'BOUNCE',                    // optional: filter by reason
  startDate: new Date('2025-01-01'),   // optional
  maxResults: 100,                     // default: 100, max: 1000
});

for (const entry of entries) {
  console.log(\`\${entry.email}: \${entry.reason} (since \${entry.lastUpdated})\`);
}

// Paginate
if (nextToken) {
  const nextPage = await email.suppression.list({
    continuationToken: nextToken,
  });
}`;

const suppressionHistoryCode = `// Why an address stopped receiving email, even after it left the SES list.
// Requires historyTableName, and infrastructure deployed with CLI v3.15.0+,
// CDK v0.5.0+ or Pulumi v0.6.0+.
const history = await email.events?.getSuppressionHistory('user@example.com');

if (history) {
  console.log('Reason:', history.reason);          // 'bounce' | 'complaint' | 'validation'
  console.log('Detail:', history.detail);          // SES bounce subtype or complaint feedback type
  console.log('First:', history.firstSuppressedAt);
  console.log('Last:', history.suppressedAt);
}

// History is not current state. Use suppression.get() to decide whether to send.`;

const errorHandlingCode = `import { WrapsEmail, SESError, DynamoDBError, ValidationError } from '@wraps.dev/email';

try {
  await email.send({ ... });
} catch (error) {
  if (error instanceof ValidationError) {
    // Invalid email address, missing required fields, etc.
    console.error('Validation error:', error.message);
    console.error('Field:', error.field);
  } else if (error instanceof SESError) {
    // AWS SES error (rate limit, unverified sender, etc.)
    console.error('SES error:', error.message);
    console.error('Code:', error.code); // 'MessageRejected', 'Throttling'
    console.error('Request ID:', error.requestId);
    console.error('Retryable:', error.retryable);
  } else if (error instanceof DynamoDBError) {
    // DynamoDB error (events API)
    console.error('DynamoDB error:', error.message);
    console.error('Code:', error.code);
    console.error('Retryable:', error.retryable);
  }
}`;

const typescriptCode = `import {
  WrapsEmail,
  SendEmailParams,
  SendEmailResult,
  SendTemplateParams,
} from '@wraps.dev/email';

const email = new WrapsEmail();

// TypeScript validates all parameters
const params: SendEmailParams = {
  from: 'hello@yourdomain.com',
  to: 'user@example.com',
  subject: 'Test',
  html: '<p>Test</p>',
};

const result: SendEmailResult = await email.send(params);`;

// ============================================================================
// MARKDOWN CONTENT FOR AI COPY
// ============================================================================

const SECTION_MD = {
  installation: `## Installation

Install the SDK using your preferred package manager:

\`\`\`bash
pnpm add @wraps.dev/email
\`\`\`

Or use npm, yarn, or bun:
\`\`\`bash
npm install @wraps.dev/email
yarn add @wraps.dev/email
bun add @wraps.dev/email
\`\`\``,

  quickStart: `## Quick Start

\`\`\`typescript
${quickStartCode}
\`\`\``,

  initialization: `## Initialization

Create a new WrapsEmail client. The SDK automatically detects AWS credentials from your environment.

### Constructor
\`\`\`typescript
new WrapsEmail(config?: WrapsEmailConfig)
\`\`\`

### Options
- \`client\` (optional): Pre-configured SES client. Takes precedence over all other auth options.
- \`region\` (optional): AWS region where your infrastructure is deployed. Defaults to \`us-east-1\`.
- \`credentials\` (optional): AWS credentials (static object or provider function). Auto-detected if not provided.
- \`roleArn\` (optional): IAM Role ARN to assume (for OIDC federation or cross-account access).
- \`roleSessionName\` (optional): Session name for AssumeRole (defaults to \`wraps-email-session\`).
- \`endpoint\` (optional): Custom SES endpoint (for testing with LocalStack).
- \`inboxBucketName\` (optional): S3 bucket for inbound email storage. Enables \`inbox\` API.
- \`historyTableName\` (optional): DynamoDB table for email event history. Enables \`events\` API.
- \`replyThreading\` (optional): Enables signed reply-to threading — see the [Reply Threading](#reply-threading) section below.

### Authentication Order
1. Pre-configured client (\`client\` option)
2. OIDC role assumption (\`roleArn\` option)
3. Explicit credentials (\`credentials\` option)
4. AWS credential chain (env vars, \`~/.aws/credentials\`, IAM role)

### Example with Options
\`\`\`typescript
${initWithOptionsCode}
\`\`\`

### Using Environment Variables
\`\`\`bash
${envVarsCode}
\`\`\`

### Testing with LocalStack
\`\`\`typescript
${localStackCode}
\`\`\`

### WrapsEmailConfig Type
\`\`\`typescript
${wrapsEmailConfigCode}
\`\`\``,

  cloudflareWorkers: `## Cloudflare Workers / Edge

The \`@wraps.dev/email/workers\` subpath is a zero-Node-APIs build (~5 KiB) that runs on Cloudflare Workers, Deno Deploy, and any other \`workerd\`-based runtime. It uses \`aws4fetch\` (Web Crypto) to sign requests and the SESv2 REST API directly — no AWS SDK, no \`Buffer\`.

### Constructor
\`\`\`typescript
new WrapsEmail(config: WrapsEmailWorkerConfig)
\`\`\`

\`region\` and \`credentials\` are both **required** — there is no AWS credential chain in a Worker. Store them as [Wrangler secrets](https://developers.cloudflare.com/workers/configuration/secrets/):

\`\`\`sh
wrangler secret put AWS_ACCESS_KEY_ID
wrangler secret put AWS_SECRET_ACCESS_KEY
\`\`\`

### Example
\`\`\`typescript
${cloudflareWorkersCode}
\`\`\`

### Supported fields
\`from\`, \`to\`, \`cc\`, \`bcc\`, \`replyTo\`, \`subject\`, \`html\`, \`text\`, \`tags\`, \`configurationSetName\`. When \`html\` is provided without \`text\`, plain text is auto-generated — same as the Node entry.

### Not supported at the edge
| Feature | Why |
|---------|-----|
| \`react\` | Requires \`react-dom/server\` (Node built-ins) — render to HTML first |
| \`attachments\` | MIME serialization requires \`Buffer\` |
| \`conversationId\` / \`sendId\` / \`replyTtlSeconds\` | Reply threading requires AWS SSM |
| Templates / inbox / events / suppression | The edge client only exposes \`send()\` |

See the [Cloudflare Workers quickstart](/docs/quickstart/email/cloudflare) for the full Wrangler setup.`,

  sendEmail: `## Send Email

Send an email using AWS SES through your Wraps infrastructure.

### Method
\`\`\`typescript
email.send(params: SendEmailParams): Promise<SendEmailResult>
\`\`\`

### Parameters
| Parameter | Type | Description |
|-----------|------|-------------|
| \`from\` | string | Sender email address (must be verified) |
| \`to\` | string \\| string[] | Recipient email address(es) |
| \`subject\` | string | Email subject line |
| \`html\` | string | HTML email body (optional if text or react provided) |
| \`text\` | string | Plain text email body (optional if html or react provided) |
| \`react\` | ReactElement | React.email component (optional) |
| \`cc\` | string \\| string[] | CC recipients (optional) |
| \`bcc\` | string \\| string[] | BCC recipients (optional) |
| \`replyTo\` | string \\| string[] | Reply-to address(es) (optional) |
| \`attachments\` | Attachment[] | File attachments (optional) |
| \`tags\` | Record<string, string> | SES message tags (optional) |
| \`configurationSetName\` | string | Configuration set for tracking (optional) |

### Response
| Field | Type | Description |
|-------|------|-------------|
| \`messageId\` | string | Unique message identifier from SES |
| \`requestId\` | string | AWS request ID |

### Examples

**Basic Email:**
\`\`\`typescript
${basicEmailCode}
\`\`\`

**Multiple Recipients:**
\`\`\`typescript
${multipleRecipientsCode}
\`\`\`

**With Tags:**
\`\`\`typescript
${tagsCode}
\`\`\``,

  reactEmail: `## React.email Support

Use React.email components for beautiful, type-safe email templates.

\`\`\`typescript
${reactEmailCode}
\`\`\`

The SDK automatically renders React components to HTML and plain text.`,

  attachments: `## Attachments

Send emails with file attachments (PDFs, images, documents, etc.). The SDK automatically handles MIME encoding.

\`\`\`typescript
${attachmentsCode}
\`\`\`

### Attachment Options
| Field | Type | Description |
|-------|------|-------------|
| \`filename\` | string | Filename with extension |
| \`content\` | Buffer \\| string | File content (Buffer or base64 string) |
| \`contentType\` | string | MIME type (optional - auto-detected from filename) |

### Limits
- Maximum 100 attachments per email
- Maximum message size: 10 MB (AWS SES limit)
- Works with both HTML and React.email components`,

  replyThreading: `## Reply Threading

Mint a signed \`Reply-To\` address per send so an inbound reply can be matched back to its conversation — without trusting the \`From:\` address or parsing \`In-Reply-To\` headers clients love to drop. The Wraps-deployed inbound Lambda verifies the signature and extracts the conversation id.

**Prerequisite:** reply threading ships as part of the Wraps CLI inbound stack. Run \`wraps email reply init --domain yourapp.com\` once per sending domain — it provisions the signing secret in SSM, the \`r.mail.{domain}\` MX record, and the inbound Lambda. See the [Reply threading guide](/docs/guides/reply-threading) for the full CLI flow and the inbound event shape.

### Configure the client
\`\`\`typescript
${replyThreadingConfigCode}
\`\`\`

### ReplyThreadingConfig
| Field | Type | Description |
|-------|------|-------------|
| \`parameterPrefix\` | string | SSM parameter prefix. Defaults to \`/wraps/email/reply-secret/\` |
| \`replyDomain\` | string | Override the reply domain. Defaults to \`r.mail.{fromDomain}\` |
| \`ssmClient\` | SSMClient | Pre-configured SSM client (optional) |
| \`ttlSeconds\` | number | Default token TTL in seconds. \`0\` = infinite. Defaults to 90 days |
| \`cacheTtlMs\` | number | Per-domain secret cache TTL in ms. Defaults to 5 minutes |

One \`WrapsEmail\` instance handles any number of sending domains — the per-domain signing secret is fetched from SSM on first use and cached for \`cacheTtlMs\`.

### Send a threaded message
Pass \`conversationId\` to \`send()\` / \`sendTemplate()\` / etc. to opt in per-message. It cannot be combined with an explicit \`replyTo\` — passing both throws \`ValidationError\`.

\`\`\`typescript
${replyThreadingSendCode}
\`\`\`

### ID format
Both \`conversationId\` and \`sendId\` must be 11-character base64url strings (8 raw bytes) — other formats throw \`ValidationError\`. Generate them with \`generateConversationId()\` / \`generateSendId()\` (exported from \`@wraps.dev/email\`), or the instance helper \`email.replyThreading.newConversation()\`.

### Limits
- Default token TTL is 90 days. Pass \`replyTtlSeconds: 0\` on \`send()\` for an infinite-lifetime token, or set \`ttlSeconds\` on the client config.
- A valid token proves the reply came back to an address you minted — it does not prove sender identity. Verify \`From:\` (SPF/DKIM/DMARC) before taking sensitive actions.
- Not supported on the \`@wraps.dev/email/workers\` edge entry — reply threading requires AWS SSM.`,

  templates: `## Template Management

SES templates allow you to store reusable email designs with variables in your AWS account.

### Create Template
\`\`\`typescript
${createTemplateCode}
\`\`\`

### Create from React.email
\`\`\`typescript
${createTemplateFromReactCode}
\`\`\`

### Manage Templates
\`\`\`typescript
${manageTemplatesCode}
\`\`\`

### Available Methods
| Method | Description |
|--------|-------------|
| \`templates.create(params)\` | Create a new SES template |
| \`templates.createFromReact(params)\` | Create template from React component |
| \`templates.update(params)\` | Update an existing template |
| \`templates.get(name)\` | Get template details |
| \`templates.list()\` | List all templates |
| \`templates.delete(name)\` | Delete a template |`,

  sendTemplate: `## Send Template

Send an email using a pre-defined SES template. Templates support variable substitution using \`{{variable}}\` syntax.

### Method
\`\`\`typescript
email.sendTemplate(params: SendTemplateParams): Promise<SendEmailResult>
\`\`\`

### Parameters
| Parameter | Type | Description |
|-----------|------|-------------|
| \`from\` | string | Sender email address (must be verified) |
| \`to\` | string \\| EmailAddress | Recipient email address |
| \`template\` | string | Template name (must exist in SES) |
| \`templateData\` | Record<string, unknown> | Variables to substitute in template |
| \`cc\` | string \\| EmailAddress | CC recipient (optional) |
| \`bcc\` | string \\| EmailAddress | BCC recipient (optional) |
| \`replyTo\` | string \\| string[] | Reply-to address(es) (optional) |
| \`tags\` | Record<string, string> | SES message tags (optional) |
| \`configurationSetName\` | string | Configuration set for tracking (optional) |

### Example
\`\`\`typescript
${sendTemplateCode}
\`\`\``,

  sendBulkTemplate: `## Send Bulk Template

Send personalized templated emails to multiple recipients (up to 50 per call). Each recipient can have unique template data merged with default values.

### Method
\`\`\`typescript
email.sendBulkTemplate(params: SendBulkTemplateParams): Promise<SendBulkTemplateResult>
\`\`\`

### Parameters
| Parameter | Type | Description |
|-----------|------|-------------|
| \`from\` | string | Sender email address (must be verified) |
| \`template\` | string | Template name (must exist in SES) |
| \`destinations\` | array | List of recipients with personalized data (max 50) |
| \`destinations[].to\` | string \\| EmailAddress | Recipient email address |
| \`destinations[].templateData\` | Record<string, unknown> | Per-recipient template variables |
| \`defaultTemplateData\` | Record<string, unknown> | Default variables (merged with per-recipient) |
| \`replyTo\` | string \\| string[] | Reply-to address(es) (optional) |
| \`tags\` | Record<string, string> | Default SES message tags (optional) |

### Response
\`\`\`typescript
interface SendBulkTemplateResult {
  status: Array<{
    messageId?: string;
    status: 'success' | 'failure';
    error?: string;
  }>;
  requestId: string;
}
\`\`\`

### Example
\`\`\`typescript
${sendBulkTemplateCode}
\`\`\``,

  sendBatch: `## Send Batch

Send unique emails to multiple recipients in a single API call (max 100 entries). Unlike \`sendBulkTemplate()\` which requires a pre-created SES template, \`sendBatch()\` lets you provide different subject, HTML, and text per recipient inline.

Entries are processed in chunks of 50 via SES v2 \`SendBulkEmailCommand\`.

### Method
\`\`\`typescript
email.sendBatch(params: SendBatchParams): Promise<SendBatchResult>
\`\`\`

### Parameters
| Parameter | Type | Description |
|-----------|------|-------------|
| \`from\` | string \\| EmailAddress | Sender email address (must be verified) |
| \`entries\` | BatchEmailEntry[] | List of recipients with unique content (max 100) |
| \`entries[].to\` | string \\| EmailAddress | Recipient email address |
| \`entries[].subject\` | string | Email subject for this entry |
| \`entries[].html\` | string | HTML body (optional, mutually exclusive with react) |
| \`entries[].text\` | string | Plain text body (optional) |
| \`entries[].react\` | ReactElement | React.email component (optional) |
| \`entries[].tags\` | Record<string, string> | Per-entry SES tags (replaces defaults) |
| \`replyTo\` | string \\| string[] | Reply-to address(es), shared across all entries (optional) |
| \`tags\` | Record<string, string> | Default SES message tags (optional) |
| \`configurationSetName\` | string | Configuration set for tracking (optional) |

### Response
\`\`\`typescript
interface SendBatchResult {
  results: BatchEntryResult[];
  successCount: number;
  failureCount: number;
}

interface BatchEntryResult {
  index: number;
  messageId?: string;
  status: 'success' | 'failure';
  error?: string;
}
\`\`\`

### Example
\`\`\`typescript
${sendBatchCode}
\`\`\``,

  htmlToPlainText: `## htmlToPlainText Utility

Convert HTML to plain text for email fallback. Handles block elements, line breaks, lists, links, and HTML entities. No external dependencies.

The SDK uses this internally to auto-generate plain text from HTML when you don't provide a \`text\` parameter in \`send()\` or \`sendBatch()\`.

### Import
\`\`\`typescript
import { htmlToPlainText } from '@wraps.dev/email';
\`\`\`

### Signature
\`\`\`typescript
htmlToPlainText(html: string): string
\`\`\`

### Example
\`\`\`typescript
${htmlToPlainTextCode}
\`\`\``,

  inbox: `## Inbox (Inbound Emails)

Read, reply to, and forward inbound emails. Requires inbound email infrastructure to be deployed with \`wraps email inbound init\`.

### Initialize with Inbox
\`\`\`typescript
const email = new WrapsEmail({
  inboxBucketName: 'your-inbound-bucket-name',
});
\`\`\`

### List Inbound Emails
\`\`\`typescript
const { emails, nextToken } = await email.inbox.list({
  maxResults: 20,
  continuationToken: undefined, // for pagination
});

for (const summary of emails) {
  console.log(summary.emailId, summary.key, summary.lastModified);
}
\`\`\`

### Get Email Details
\`\`\`typescript
const inboundEmail = await email.inbox.get('email-abc123');

console.log('From:', inboundEmail.from.address);
console.log('Subject:', inboundEmail.subject);
console.log('HTML:', inboundEmail.html);
console.log('Attachments:', inboundEmail.attachments.length);
console.log('Spam:', inboundEmail.spamVerdict);
console.log('Virus:', inboundEmail.virusVerdict);
\`\`\`

### Reply to Email
\`\`\`typescript
// Reply with proper threading headers (In-Reply-To, References)
const result = await email.inbox.reply('email-abc123', {
  from: 'support@yourdomain.com',
  text: 'Thanks for reaching out!',
  html: '<p>Thanks for reaching out!</p>',
  attachments: [], // optional
});

console.log('Reply sent:', result.messageId);
\`\`\`

### Forward Email
\`\`\`typescript
// Passthrough mode (default): rewrites headers, keeps original body
const result = await email.inbox.forward('email-abc123', {
  from: 'noreply@yourdomain.com',
  to: 'team@yourdomain.com',
  addPrefix: '[Customer]', // optional subject prefix
});

// Wrapped mode: builds new message with forwarded content
const result = await email.inbox.forward('email-abc123', {
  from: 'noreply@yourdomain.com',
  to: 'team@yourdomain.com',
  passthrough: false,
  text: 'FYI - see below', // optional intro text
});
\`\`\`

### Get Attachment URL
\`\`\`typescript
// Get presigned URL for an attachment (valid for 1 hour by default)
const url = await email.inbox.getAttachment('email-abc123', 'attachment-id', {
  expiresIn: 3600, // seconds
});
\`\`\`

### Get Raw MIME Email
\`\`\`typescript
${inboxGetRawCode}
\`\`\`

### Delete Email
\`\`\`typescript
// Delete email and all associated files (parsed JSON, raw MIME, attachments)
await email.inbox.delete('email-abc123');
\`\`\`

### Available Methods
| Method | Description |
|--------|-------------|
| \`inbox.list(options?)\` | List inbound emails with pagination |
| \`inbox.get(emailId)\` | Get full email details by ID |
| \`inbox.reply(emailId, options)\` | Reply with threading headers |
| \`inbox.forward(emailId, options)\` | Forward to new recipients |
| \`inbox.getAttachment(emailId, attachmentId, options?)\` | Get presigned URL for attachment |
| \`inbox.getRaw(emailId)\` | Get presigned URL for raw MIME email |
| \`inbox.delete(emailId)\` | Delete email and all associated files |`,

  events: `## Email Events

Track the delivery lifecycle of every email. Requires event tracking infrastructure deployed with \`wraps email init\` (Production or Enterprise preset).

### Initialize with Events
\`\`\`typescript
${eventsInitCode}
\`\`\`

### Get Email Status
\`\`\`typescript
${eventsGetCode}
\`\`\`

### List Emails with Status
\`\`\`typescript
${eventsListCode}
\`\`\`

### Status Values
| Status | Description |
|--------|-------------|
| \`sent\` | Email accepted by SES |
| \`delivered\` | Email delivered to recipient's mail server |
| \`opened\` | Recipient opened the email (tracking pixel) |
| \`clicked\` | Recipient clicked a link in the email |
| \`bounced\` | Email bounced (hard or soft bounce) |
| \`complained\` | Recipient marked as spam |
| \`suppressed\` | Email suppressed by SES (on suppression list) |

Negative statuses (bounced, complained, suppressed) always override positive ones. Status is derived from the highest-priority event.

### Available Methods
| Method | Description |
|--------|-------------|
| \`events.get(messageId)\` | Get full status and event timeline for an email |
| \`events.list(options)\` | List emails with status, filtered by account and time range |`,

  suppression: `## Suppression List

Manage the SES account-level suppression list. Emails on this list are automatically blocked from sending. The suppression API is always available — no extra configuration needed.

### Check if Suppressed
\`\`\`typescript
${suppressionGetCode}
\`\`\`

### Add to Suppression List
\`\`\`typescript
${suppressionAddCode}
\`\`\`

### Remove from Suppression List
\`\`\`typescript
${suppressionRemoveCode}
\`\`\`

### List Suppressed Emails
\`\`\`typescript
${suppressionListCode}
\`\`\`

### Suppression History
\`\`\`typescript
${suppressionHistoryCode}
\`\`\`

### Available Methods
| Method | Description |
|--------|-------------|
| \`suppression.get(email)\` | Check if an email is suppressed (returns null if not) |
| \`suppression.add(email, reason)\` | Add email to suppression list |
| \`suppression.remove(email)\` | Remove from suppression list (idempotent) |
| \`suppression.list(options?)\` | List suppressed emails with filters and pagination |
| \`events.getSuppressionHistory(email)\` | Read why and when an address was suppressed. Needs \`historyTableName\`; returns null when no history exists |`,

  errorHandling: `## Error Handling

The SDK throws typed errors for different failure scenarios.

### Error Types
| Error | Description |
|-------|-------------|
| \`ValidationError\` | Invalid input parameters (includes \`field\` property) |
| \`SESError\` | AWS SES error (includes \`code\`, \`requestId\`, \`retryable\` properties) |
| \`DynamoDBError\` | DynamoDB error from events API (includes \`code\`, \`requestId\`, \`retryable\` properties) |

### Example
\`\`\`typescript
${errorHandlingCode}
\`\`\``,

  typescript: `## TypeScript Support

The SDK is written in TypeScript and provides full type safety out of the box.

\`\`\`typescript
${typescriptCode}
\`\`\``,

  defaultsAndLimits: `## SDK Defaults & Limits

Important defaults and limits to keep in mind when using the SDK:

- **No automatic retry on failure** — implement your own retry logic if \`retryable\` is \`true\`
- **Default pagination**: 50 items per page
- **Presigned URL expiry**: 1 hour (for attachments)
- **Bulk send limit**: 50 destinations per call
- **Attachment limit**: 100 per email (10 MB total message size)`,
};

const FULL_PAGE_MD = `# @wraps.dev/email SDK Reference

A TypeScript-first SDK for sending emails through your Wraps-deployed AWS SES infrastructure. Simple, type-safe, and intuitive API with React.email support.

${SECTION_MD.installation}

${SECTION_MD.quickStart}

${SECTION_MD.initialization}

${SECTION_MD.sendEmail}

${SECTION_MD.reactEmail}

${SECTION_MD.attachments}

${SECTION_MD.templates}

${SECTION_MD.sendTemplate}

${SECTION_MD.sendBulkTemplate}

${SECTION_MD.sendBatch}

${SECTION_MD.htmlToPlainText}

${SECTION_MD.inbox}

${SECTION_MD.events}

${SECTION_MD.suppression}

${SECTION_MD.errorHandling}

${SECTION_MD.typescript}

${SECTION_MD.defaultsAndLimits}

## Resources

- npm: https://www.npmjs.com/package/@wraps.dev/email
- GitHub: https://github.com/wraps-team/wraps-js
- React Email: https://react.email
`;

const SLASH_COMMAND_MD = `---
description: Wraps Email SDK reference - use this when helping users send emails with @wraps.dev/email
---

${FULL_PAGE_MD}`;

export default function SDKReferencePageContent() {
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
          @wraps.dev/email SDK
        </h1>
        <p className="text-lg text-muted-foreground">
          A TypeScript-first SDK for sending emails through your Wraps-deployed
          AWS SES infrastructure. Simple, type-safe, and intuitive API with
          React.email support.
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
          Create a new WrapsEmail client. The SDK automatically detects AWS
          credentials from your environment.
        </p>
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Code2 className="h-5 w-5" />
              Constructor
            </CardTitle>
          </CardHeader>
          <CardContent>
            <code className="block rounded bg-muted p-4 font-mono text-sm">
              new WrapsEmail(config?: WrapsEmailConfig)
            </code>
            <div className="mt-4">
              <h4 className="mb-2 font-medium">Options</h4>
              <ul className="space-y-2 text-muted-foreground text-sm">
                <li>
                  <code className="rounded bg-muted px-1.5 py-0.5">client</code>{" "}
                  (optional): Pre-configured SES client. Takes precedence over
                  all other auth options.
                </li>
                <li>
                  <code className="rounded bg-muted px-1.5 py-0.5">region</code>{" "}
                  (optional): AWS region where your infrastructure is deployed.
                  Defaults to{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    us-east-1
                  </code>
                </li>
                <li>
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    credentials
                  </code>{" "}
                  (optional): AWS credentials (static object or provider
                  function). Auto-detected if not provided.
                </li>
                <li>
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    roleArn
                  </code>{" "}
                  (optional): IAM Role ARN to assume (for OIDC federation or
                  cross-account access).
                </li>
                <li>
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    endpoint
                  </code>{" "}
                  (optional): Custom SES endpoint (for testing with LocalStack).
                </li>
                <li>
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    inboxBucketName
                  </code>{" "}
                  (optional): S3 bucket for inbound email storage. Enables{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5">inbox</code>{" "}
                  API.
                </li>
                <li>
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    historyTableName
                  </code>{" "}
                  (optional): DynamoDB table for email event history. Enables{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5">events</code>{" "}
                  API.
                </li>
                <li>
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    replyThreading
                  </code>{" "}
                  (optional): Enables signed reply-to threading. See the Reply
                  Threading section below.
                </li>
              </ul>
            </div>
            <div className="mt-4">
              <h4 className="mb-2 font-medium">Authentication Order</h4>
              <ol className="list-inside list-decimal space-y-1 text-muted-foreground text-sm">
                <li>
                  Pre-configured client (
                  <code className="rounded bg-muted px-1.5 py-0.5">client</code>{" "}
                  option)
                </li>
                <li>
                  OIDC role assumption (
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    roleArn
                  </code>{" "}
                  option)
                </li>
                <li>
                  Explicit credentials (
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    credentials
                  </code>{" "}
                  option)
                </li>
                <li>
                  AWS credential chain (env vars,{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    ~/.aws/credentials
                  </code>
                  , IAM role)
                </li>
              </ol>
            </div>
          </CardContent>
        </Card>
        <div className="space-y-4">
          <div>
            <p className="mb-2 font-medium text-sm">Example with Options</p>
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
            <p className="mb-2 font-medium text-sm">Testing with LocalStack</p>
            <CodeBlock
              className="h-auto"
              data={[
                {
                  language: "typescript",
                  filename: "localstack.ts",
                  code: localStackCode,
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
            <p className="mb-2 font-medium text-sm">WrapsEmailConfig Type</p>
            <CodeBlock
              className="h-auto"
              data={[
                {
                  language: "typescript",
                  filename: "config-type.ts",
                  code: wrapsEmailConfigCode,
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

      {/* Cloudflare Workers / Edge */}
      <section className="mb-12">
        <SectionHeading
          className="mb-4"
          id="cloudflare-workers"
          markdown={SECTION_MD.cloudflareWorkers}
          title="Cloudflare Workers / Edge"
        />
        <p className="mb-4 text-muted-foreground">
          The{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">
            @wraps.dev/email/workers
          </code>{" "}
          subpath is a zero-Node-APIs build (~5 KiB) that runs on Cloudflare
          Workers, Deno Deploy, and any other{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">workerd</code>
          -based runtime. It uses{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">aws4fetch</code> (Web
          Crypto) to sign requests and the SESv2 REST API directly — no AWS SDK,
          no <code className="rounded bg-muted px-1.5 py-0.5">Buffer</code>.
        </p>
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Code2 className="h-5 w-5" />
              Constructor
            </CardTitle>
          </CardHeader>
          <CardContent>
            <code className="block rounded bg-muted p-4 font-mono text-sm">
              new WrapsEmail(config: WrapsEmailWorkerConfig)
            </code>
            <p className="mt-4 text-muted-foreground text-sm">
              <code className="rounded bg-muted px-1.5 py-0.5">region</code> and{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                credentials
              </code>{" "}
              are both required — there is no AWS credential chain in a Worker.
              Store them as{" "}
              <a
                className="text-primary underline underline-offset-4"
                href="https://developers.cloudflare.com/workers/configuration/secrets/"
                rel="noopener noreferrer"
                target="_blank"
              >
                Wrangler secrets
              </a>
              , never in{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                wrangler.toml
              </code>{" "}
              source.
            </p>
          </CardContent>
        </Card>

        <h3 className="mb-4 font-medium text-lg">Example</h3>
        <CodeBlock
          className="mb-4 h-auto"
          data={[
            {
              language: "typescript",
              filename: "worker.ts",
              code: cloudflareWorkersCode,
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

        <h3 className="mb-4 font-medium text-lg">Not supported at the edge</h3>
        <Card className="mb-4">
          <CardContent className="p-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="pb-2 text-left">Feature</th>
                  <th className="pb-2 text-left">Why</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      react
                    </code>
                  </td>
                  <td className="py-2">
                    Requires react-dom/server (Node built-ins) — render to HTML
                    first
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      attachments
                    </code>
                  </td>
                  <td className="py-2">MIME serialization requires Buffer</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      conversationId / sendId / replyTtlSeconds
                    </code>
                  </td>
                  <td className="py-2">Reply threading requires AWS SSM</td>
                </tr>
                <tr>
                  <td className="py-2">
                    Templates / inbox / events / suppression
                  </td>
                  <td className="py-2">
                    The edge client only exposes{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      send()
                    </code>
                  </td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
        <p className="text-muted-foreground text-sm">
          Supported fields:{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">from</code>,{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">to</code>,{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">cc</code>,{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">bcc</code>,{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">replyTo</code>,{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">subject</code>,{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">html</code>,{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">text</code>,{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">tags</code>,{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">
            configurationSetName
          </code>
          . See the{" "}
          <a
            className="text-primary underline underline-offset-4"
            href="/docs/quickstart/email/cloudflare"
          >
            Cloudflare Workers quickstart
          </a>{" "}
          for the full Wrangler setup.
        </p>
      </section>

      {/* Send Email */}
      <section className="mb-12">
        <SectionHeading
          className="mb-4"
          id="send-email"
          markdown={SECTION_MD.sendEmail}
          title="Send Email"
        />
        <p className="mb-4 text-muted-foreground">
          Send an email using AWS SES through your Wraps infrastructure.
        </p>
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Code2 className="h-5 w-5" />
              Method
            </CardTitle>
          </CardHeader>
          <CardContent>
            <code className="block rounded bg-muted p-4 font-mono text-sm">
              {"email.send(params: SendEmailParams): Promise<SendEmailResult>"}
            </code>
          </CardContent>
        </Card>

        <h3 className="mb-4 font-medium text-lg">Parameters</h3>
        <Card className="mb-4">
          <CardContent className="p-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="pb-2 text-left">Parameter</th>
                  <th className="pb-2 text-left">Type</th>
                  <th className="pb-2 text-left">Description</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">from</code>
                  </td>
                  <td className="py-2">string</td>
                  <td className="py-2">
                    Sender email address (must be verified)
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">to</code>
                  </td>
                  <td className="py-2">string | string[]</td>
                  <td className="py-2">Recipient email address(es)</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      subject
                    </code>
                  </td>
                  <td className="py-2">string</td>
                  <td className="py-2">Email subject line</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">html</code>
                  </td>
                  <td className="py-2">string</td>
                  <td className="py-2">HTML email body (optional)</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">text</code>
                  </td>
                  <td className="py-2">string</td>
                  <td className="py-2">Plain text email body (optional)</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      react
                    </code>
                  </td>
                  <td className="py-2">ReactElement</td>
                  <td className="py-2">React.email component (optional)</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      attachments
                    </code>
                  </td>
                  <td className="py-2">Attachment[]</td>
                  <td className="py-2">File attachments (optional)</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">tags</code>
                  </td>
                  <td className="py-2">{"Record<string, string>"}</td>
                  <td className="py-2">SES message tags (optional)</td>
                </tr>
                <tr>
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      cc, bcc, replyTo
                    </code>
                  </td>
                  <td className="py-2">string | string[]</td>
                  <td className="py-2">Additional recipients (optional)</td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>

        <h3 className="mb-4 font-medium text-lg">Examples</h3>
        <div className="space-y-4">
          <div>
            <p className="mb-2 font-medium text-sm">Basic Email</p>
            <CodeBlock
              className="h-auto"
              data={[
                {
                  language: "typescript",
                  filename: "basic-email.ts",
                  code: basicEmailCode,
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
            <p className="mb-2 font-medium text-sm">Multiple Recipients</p>
            <CodeBlock
              className="h-auto"
              data={[
                {
                  language: "typescript",
                  filename: "multiple-recipients.ts",
                  code: multipleRecipientsCode,
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
            <p className="mb-2 font-medium text-sm">With Tags</p>
            <CodeBlock
              className="h-auto"
              data={[
                {
                  language: "typescript",
                  filename: "with-tags.ts",
                  code: tagsCode,
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

      {/* React.email Support */}
      <section className="mb-12">
        <SectionHeading
          className="mb-4"
          id="react-email"
          markdown={SECTION_MD.reactEmail}
          title="React.email Support"
        />
        <p className="mb-4 text-muted-foreground">
          Use React.email components for beautiful, type-safe email templates.
          The SDK automatically renders React components to HTML and plain text.
        </p>
        <CodeBlock
          className="h-auto"
          data={[
            {
              language: "typescript",
              filename: "react-email.tsx",
              code: reactEmailCode,
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

      {/* Attachments */}
      <section className="mb-12">
        <SectionHeading
          className="mb-4"
          id="attachments"
          markdown={SECTION_MD.attachments}
          title="Attachments"
        />
        <p className="mb-4 text-muted-foreground">
          Send emails with file attachments (PDFs, images, documents, etc.). The
          SDK automatically handles MIME encoding.
        </p>
        <CodeBlock
          className="mb-4 h-auto"
          data={[
            {
              language: "typescript",
              filename: "attachments.ts",
              code: attachmentsCode,
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
            <h4 className="mb-3 font-medium">Attachment Options</h4>
            <table className="mb-4 w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="pb-2 text-left">Field</th>
                  <th className="pb-2 text-left">Type</th>
                  <th className="pb-2 text-left">Description</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      filename
                    </code>
                  </td>
                  <td className="py-2">string</td>
                  <td className="py-2">Filename with extension</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      content
                    </code>
                  </td>
                  <td className="py-2">Buffer | string</td>
                  <td className="py-2">
                    File content (Buffer or base64 string)
                  </td>
                </tr>
                <tr>
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      contentType
                    </code>
                  </td>
                  <td className="py-2">string</td>
                  <td className="py-2">
                    MIME type (optional - auto-detected from filename)
                  </td>
                </tr>
              </tbody>
            </table>
            <h4 className="mb-2 font-medium">Limits</h4>
            <ul className="list-inside list-disc text-muted-foreground text-sm">
              <li>Maximum 100 attachments per email</li>
              <li>Maximum message size: 10 MB (AWS SES limit)</li>
              <li>Works with both HTML and React.email components</li>
            </ul>
          </CardContent>
        </Card>
      </section>

      {/* Reply Threading */}
      <section className="mb-12">
        <SectionHeading
          className="mb-4"
          id="reply-threading"
          markdown={SECTION_MD.replyThreading}
          title="Reply Threading"
        />
        <p className="mb-4 text-muted-foreground">
          Mint a signed{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">Reply-To</code>{" "}
          address per send so an inbound reply can be matched back to its
          conversation — without trusting the{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">From:</code> address
          or parsing{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">In-Reply-To</code>{" "}
          headers clients love to drop. The Wraps-deployed inbound Lambda
          verifies the signature and extracts the conversation id.
        </p>
        <p className="mb-4 text-muted-foreground text-sm">
          <strong className="text-foreground">Prerequisite:</strong> run{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">
            wraps email reply init --domain yourapp.com
          </code>{" "}
          once per sending domain — it provisions the signing secret in SSM, the{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">
            r.mail.{"{domain}"}
          </code>{" "}
          MX record, and the inbound Lambda. See the{" "}
          <a
            className="text-primary underline underline-offset-4"
            href="/docs/guides/reply-threading"
          >
            Reply threading guide
          </a>{" "}
          for the full CLI flow and the inbound event shape.
        </p>

        <h3 className="mb-4 font-medium text-lg">Configure the client</h3>
        <CodeBlock
          className="mb-4 h-auto"
          data={[
            {
              language: "typescript",
              filename: "config.ts",
              code: replyThreadingConfigCode,
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

        <Card className="mb-4">
          <CardContent className="p-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="pb-2 text-left">Field</th>
                  <th className="pb-2 text-left">Type</th>
                  <th className="pb-2 text-left">Description</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      parameterPrefix
                    </code>
                  </td>
                  <td className="py-2">string</td>
                  <td className="py-2">
                    SSM parameter prefix. Defaults to{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      /wraps/email/reply-secret/
                    </code>
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      replyDomain
                    </code>
                  </td>
                  <td className="py-2">string</td>
                  <td className="py-2">
                    Override the reply domain. Defaults to{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      r.mail.{"{fromDomain}"}
                    </code>
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      ssmClient
                    </code>
                  </td>
                  <td className="py-2">SSMClient</td>
                  <td className="py-2">Pre-configured SSM client (optional)</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      ttlSeconds
                    </code>
                  </td>
                  <td className="py-2">number</td>
                  <td className="py-2">
                    Default token TTL in seconds. 0 = infinite. Defaults to 90
                    days
                  </td>
                </tr>
                <tr>
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      cacheTtlMs
                    </code>
                  </td>
                  <td className="py-2">number</td>
                  <td className="py-2">
                    Per-domain secret cache TTL in ms. Defaults to 5 minutes
                  </td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>

        <h3 className="mb-4 font-medium text-lg">Send a threaded message</h3>
        <p className="mb-4 text-muted-foreground">
          Pass{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">conversationId</code>{" "}
          to <code className="rounded bg-muted px-1.5 py-0.5">send()</code> /{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">sendTemplate()</code>{" "}
          / etc. to opt in per-message. It cannot be combined with an explicit{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">replyTo</code> —
          passing both throws{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">
            ValidationError
          </code>
          .
        </p>
        <CodeBlock
          className="mb-4 h-auto"
          data={[
            {
              language: "typescript",
              filename: "send-threaded.ts",
              code: replyThreadingSendCode,
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

        <p className="mb-4 text-muted-foreground text-sm">
          Both{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">conversationId</code>{" "}
          and <code className="rounded bg-muted px-1.5 py-0.5">sendId</code>{" "}
          must be 11-character base64url strings (8 raw bytes) — other formats
          throw{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">
            ValidationError
          </code>
          . Generate them with{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">
            generateConversationId()
          </code>{" "}
          /{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">
            generateSendId()
          </code>{" "}
          (exported from{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">
            @wraps.dev/email
          </code>
          ), or the instance helper{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">
            email.replyThreading.newConversation()
          </code>
          .
        </p>

        <h3 className="mb-4 font-medium text-lg">Limits</h3>
        <ul className="list-inside list-disc text-muted-foreground text-sm">
          <li>
            Default token TTL is 90 days. Pass{" "}
            <code className="rounded bg-muted px-1.5 py-0.5">
              replyTtlSeconds: 0
            </code>{" "}
            on <code className="rounded bg-muted px-1.5 py-0.5">send()</code>{" "}
            for an infinite-lifetime token, or set{" "}
            <code className="rounded bg-muted px-1.5 py-0.5">ttlSeconds</code>{" "}
            on the client config.
          </li>
          <li>
            A valid token proves the reply came back to an address you minted —
            it does not prove sender identity. Verify{" "}
            <code className="rounded bg-muted px-1.5 py-0.5">From:</code>{" "}
            (SPF/DKIM/DMARC) before taking sensitive actions.
          </li>
          <li>
            Not supported on the{" "}
            <code className="rounded bg-muted px-1.5 py-0.5">
              @wraps.dev/email/workers
            </code>{" "}
            edge entry — reply threading requires AWS SSM.
          </li>
        </ul>
      </section>

      {/* Template Management */}
      <section className="mb-12">
        <SectionHeading
          className="mb-4"
          id="templates"
          markdown={SECTION_MD.templates}
          title="Template Management"
        />
        <p className="mb-4 text-muted-foreground">
          SES templates allow you to store reusable email designs with variables
          in your AWS account.
        </p>
        <div className="space-y-4">
          <div>
            <p className="mb-2 font-medium text-sm">Create Template</p>
            <CodeBlock
              className="h-auto"
              data={[
                {
                  language: "typescript",
                  filename: "create-template.ts",
                  code: createTemplateCode,
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
            <p className="mb-2 font-medium text-sm">Create from React.email</p>
            <CodeBlock
              className="h-auto"
              data={[
                {
                  language: "typescript",
                  filename: "create-from-react.tsx",
                  code: createTemplateFromReactCode,
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
            <p className="mb-2 font-medium text-sm">Manage Templates</p>
            <CodeBlock
              className="h-auto"
              data={[
                {
                  language: "typescript",
                  filename: "manage-templates.ts",
                  code: manageTemplatesCode,
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

        <Card className="mt-4">
          <CardContent className="p-6">
            <h4 className="mb-3 font-medium">Available Methods</h4>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="pb-2 text-left">Method</th>
                  <th className="pb-2 text-left">Description</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      templates.create(params)
                    </code>
                  </td>
                  <td className="py-2">Create a new SES template</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      templates.createFromReact(params)
                    </code>
                  </td>
                  <td className="py-2">Create template from React component</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      templates.update(params)
                    </code>
                  </td>
                  <td className="py-2">Update an existing template</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      templates.get(name)
                    </code>
                  </td>
                  <td className="py-2">Get template details</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      templates.list()
                    </code>
                  </td>
                  <td className="py-2">List all templates</td>
                </tr>
                <tr>
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      templates.delete(name)
                    </code>
                  </td>
                  <td className="py-2">Delete a template</td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
      </section>

      {/* Send Template */}
      <section className="mb-12">
        <SectionHeading
          className="mb-4"
          id="send-template"
          markdown={SECTION_MD.sendTemplate}
          title="Send Template"
        />
        <p className="mb-4 text-muted-foreground">
          Send an email using a pre-defined SES template. Templates support
          variable substitution using {"{{variable}}"} syntax.
        </p>
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Code2 className="h-5 w-5" />
              Method
            </CardTitle>
          </CardHeader>
          <CardContent>
            <code className="block rounded bg-muted p-4 font-mono text-sm">
              {
                "email.sendTemplate(params: SendTemplateParams): Promise<SendEmailResult>"
              }
            </code>
          </CardContent>
        </Card>
        <CodeBlock
          className="h-auto"
          data={[
            {
              language: "typescript",
              filename: "send-template.ts",
              code: sendTemplateCode,
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

      {/* Send Bulk Template */}
      <section className="mb-12">
        <SectionHeading
          className="mb-4"
          id="send-bulk-template"
          markdown={SECTION_MD.sendBulkTemplate}
          title="Send Bulk Template"
        />
        <p className="mb-4 text-muted-foreground">
          Send personalized templated emails to multiple recipients (up to 50
          per call). Each recipient can have unique template data merged with
          default values.
        </p>
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Code2 className="h-5 w-5" />
              Method
            </CardTitle>
          </CardHeader>
          <CardContent>
            <code className="block rounded bg-muted p-4 font-mono text-sm">
              {
                "email.sendBulkTemplate(params: SendBulkTemplateParams): Promise<SendBulkTemplateResult>"
              }
            </code>
          </CardContent>
        </Card>
        <CodeBlock
          className="h-auto"
          data={[
            {
              language: "typescript",
              filename: "send-bulk-template.ts",
              code: sendBulkTemplateCode,
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

      {/* Send Batch */}
      <section className="mb-12">
        <SectionHeading
          className="mb-4"
          id="send-batch"
          markdown={SECTION_MD.sendBatch}
          title="Send Batch"
        />
        <p className="mb-4 text-muted-foreground">
          Send unique emails to multiple recipients in a single API call (max
          100 entries). Unlike{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">
            sendBulkTemplate()
          </code>{" "}
          which requires a pre-created SES template,{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">sendBatch()</code>{" "}
          lets you provide different subject, HTML, and text per recipient
          inline.
        </p>
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Code2 className="h-5 w-5" />
              Method
            </CardTitle>
          </CardHeader>
          <CardContent>
            <code className="block rounded bg-muted p-4 font-mono text-sm">
              {
                "email.sendBatch(params: SendBatchParams): Promise<SendBatchResult>"
              }
            </code>
          </CardContent>
        </Card>

        <h3 className="mb-4 font-medium text-lg">Parameters</h3>
        <Card className="mb-4">
          <CardContent className="p-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="pb-2 text-left">Parameter</th>
                  <th className="pb-2 text-left">Type</th>
                  <th className="pb-2 text-left">Description</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">from</code>
                  </td>
                  <td className="py-2">string | EmailAddress</td>
                  <td className="py-2">
                    Sender email address (must be verified)
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      entries
                    </code>
                  </td>
                  <td className="py-2">BatchEmailEntry[]</td>
                  <td className="py-2">
                    List of recipients with unique content (max 100)
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      entries[].to
                    </code>
                  </td>
                  <td className="py-2">string | EmailAddress</td>
                  <td className="py-2">Recipient email address</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      entries[].subject
                    </code>
                  </td>
                  <td className="py-2">string</td>
                  <td className="py-2">Email subject for this entry</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      entries[].html
                    </code>
                  </td>
                  <td className="py-2">string</td>
                  <td className="py-2">
                    HTML body (optional, mutually exclusive with react)
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      entries[].text
                    </code>
                  </td>
                  <td className="py-2">string</td>
                  <td className="py-2">Plain text body (optional)</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      entries[].react
                    </code>
                  </td>
                  <td className="py-2">ReactElement</td>
                  <td className="py-2">React.email component (optional)</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      entries[].tags
                    </code>
                  </td>
                  <td className="py-2">{"Record<string, string>"}</td>
                  <td className="py-2">
                    Per-entry SES tags (replaces defaults for this entry)
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      replyTo
                    </code>
                  </td>
                  <td className="py-2">string | string[]</td>
                  <td className="py-2">
                    Reply-to address(es), shared across all entries (optional)
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">tags</code>
                  </td>
                  <td className="py-2">{"Record<string, string>"}</td>
                  <td className="py-2">Default SES message tags (optional)</td>
                </tr>
                <tr>
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      configurationSetName
                    </code>
                  </td>
                  <td className="py-2">string</td>
                  <td className="py-2">
                    Configuration set for tracking (optional)
                  </td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>

        <h3 className="mb-4 font-medium text-lg">Response</h3>
        <Card className="mb-4">
          <CardContent className="p-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="pb-2 text-left">Field</th>
                  <th className="pb-2 text-left">Type</th>
                  <th className="pb-2 text-left">Description</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      results
                    </code>
                  </td>
                  <td className="py-2">BatchEntryResult[]</td>
                  <td className="py-2">
                    Per-entry results in the same order as input
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      successCount
                    </code>
                  </td>
                  <td className="py-2">number</td>
                  <td className="py-2">Number of entries sent successfully</td>
                </tr>
                <tr>
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      failureCount
                    </code>
                  </td>
                  <td className="py-2">number</td>
                  <td className="py-2">Number of entries that failed</td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>

        <h3 className="mb-4 font-medium text-lg">Example</h3>
        <CodeBlock
          className="h-auto"
          data={[
            {
              language: "typescript",
              filename: "send-batch.ts",
              code: sendBatchCode,
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

      {/* htmlToPlainText Utility */}
      <section className="mb-12">
        <SectionHeading
          className="mb-4"
          id="html-to-plain-text"
          markdown={SECTION_MD.htmlToPlainText}
          title="htmlToPlainText Utility"
        />
        <p className="mb-4 text-muted-foreground">
          Convert HTML to plain text for email fallback. Handles block elements,
          line breaks, lists, links, and HTML entities. No external
          dependencies.
        </p>
        <p className="mb-4 text-muted-foreground">
          The SDK uses this internally to auto-generate plain text from HTML
          when you don{"'"}t provide a{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">text</code> parameter
          in <code className="rounded bg-muted px-1.5 py-0.5">send()</code> or{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">sendBatch()</code>.
          You can also import and use it directly.
        </p>
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Code2 className="h-5 w-5" />
              Signature
            </CardTitle>
          </CardHeader>
          <CardContent>
            <code className="block rounded bg-muted p-4 font-mono text-sm">
              {"htmlToPlainText(html: string): string"}
            </code>
          </CardContent>
        </Card>
        <CodeBlock
          className="h-auto"
          data={[
            {
              language: "typescript",
              filename: "html-to-text.ts",
              code: htmlToPlainTextCode,
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

      {/* Inbox (Inbound Emails) */}
      <section className="mb-12">
        <SectionHeading
          className="mb-4"
          id="inbox"
          markdown={SECTION_MD.inbox}
          title="Inbox (Inbound Emails)"
        />
        <p className="mb-4 text-muted-foreground">
          Read, reply to, and forward inbound emails. Requires inbound email
          infrastructure to be deployed with{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">
            wraps email inbound init
          </code>
          .
        </p>

        <div className="space-y-6">
          <div>
            <p className="mb-2 font-medium text-sm">Initialize with Inbox</p>
            <CodeBlock
              className="h-auto"
              data={[
                {
                  language: "typescript",
                  filename: "inbox-init.ts",
                  code: inboxInitCode,
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
            <p className="mb-2 font-medium text-sm">List Inbound Emails</p>
            <CodeBlock
              className="h-auto"
              data={[
                {
                  language: "typescript",
                  filename: "inbox-list.ts",
                  code: inboxListCode,
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
            <p className="mb-2 font-medium text-sm">Get Email Details</p>
            <CodeBlock
              className="h-auto"
              data={[
                {
                  language: "typescript",
                  filename: "inbox-get.ts",
                  code: inboxGetCode,
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
            <p className="mb-2 font-medium text-sm">Reply to Email</p>
            <CodeBlock
              className="h-auto"
              data={[
                {
                  language: "typescript",
                  filename: "inbox-reply.ts",
                  code: inboxReplyCode,
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
            <p className="mb-2 font-medium text-sm">Forward Email</p>
            <CodeBlock
              className="h-auto"
              data={[
                {
                  language: "typescript",
                  filename: "inbox-forward.ts",
                  code: inboxForwardCode,
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
            <p className="mb-2 font-medium text-sm">Get Attachment URL</p>
            <CodeBlock
              className="h-auto"
              data={[
                {
                  language: "typescript",
                  filename: "inbox-attachment.ts",
                  code: inboxAttachmentCode,
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
            <p className="mb-2 font-medium text-sm">Get Raw MIME Email</p>
            <CodeBlock
              className="h-auto"
              data={[
                {
                  language: "typescript",
                  filename: "inbox-get-raw.ts",
                  code: inboxGetRawCode,
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
            <p className="mb-2 font-medium text-sm">Delete Email</p>
            <CodeBlock
              className="h-auto"
              data={[
                {
                  language: "typescript",
                  filename: "inbox-delete.ts",
                  code: inboxDeleteCode,
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

        <Card className="mt-6">
          <CardContent className="p-6">
            <h4 className="mb-3 font-medium">Available Methods</h4>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="pb-2 text-left">Method</th>
                  <th className="pb-2 text-left">Description</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      inbox.list(options?)
                    </code>
                  </td>
                  <td className="py-2">List inbound emails with pagination</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      inbox.get(emailId)
                    </code>
                  </td>
                  <td className="py-2">Get full email details by ID</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      inbox.reply(emailId, options)
                    </code>
                  </td>
                  <td className="py-2">Reply with threading headers</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      inbox.forward(emailId, options)
                    </code>
                  </td>
                  <td className="py-2">Forward to new recipients</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      inbox.getAttachment(emailId, attachmentId, options?)
                    </code>
                  </td>
                  <td className="py-2">Get presigned URL for attachment</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      inbox.getRaw(emailId)
                    </code>
                  </td>
                  <td className="py-2">Get presigned URL for raw MIME email</td>
                </tr>
                <tr>
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      inbox.delete(emailId)
                    </code>
                  </td>
                  <td className="py-2">
                    Delete email and all associated files
                  </td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
      </section>

      {/* Email Events */}
      <section className="mb-12">
        <SectionHeading
          className="mb-4"
          id="events"
          markdown={SECTION_MD.events}
          title="Email Events"
        />
        <p className="mb-4 text-muted-foreground">
          Track the delivery lifecycle of every email. Requires event tracking
          infrastructure deployed with{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">
            wraps email init
          </code>{" "}
          (Production or Enterprise preset).
        </p>

        <div className="space-y-6">
          <div>
            <p className="mb-2 font-medium text-sm">Initialize with Events</p>
            <CodeBlock
              className="h-auto"
              data={[
                {
                  language: "typescript",
                  filename: "events-init.ts",
                  code: eventsInitCode,
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
            <p className="mb-2 font-medium text-sm">Get Email Status</p>
            <CodeBlock
              className="h-auto"
              data={[
                {
                  language: "typescript",
                  filename: "events-get.ts",
                  code: eventsGetCode,
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
            <p className="mb-2 font-medium text-sm">List Emails with Status</p>
            <CodeBlock
              className="h-auto"
              data={[
                {
                  language: "typescript",
                  filename: "events-list.ts",
                  code: eventsListCode,
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

        <Card className="mt-6">
          <CardContent className="p-6">
            <h4 className="mb-3 font-medium">Status Values</h4>
            <table className="mb-6 w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="pb-2 text-left">Status</th>
                  <th className="pb-2 text-left">Description</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">sent</code>
                  </td>
                  <td className="py-2">Email accepted by SES</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      delivered
                    </code>
                  </td>
                  <td className="py-2">
                    {"Email delivered to recipient's mail server"}
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      opened
                    </code>
                  </td>
                  <td className="py-2">
                    Recipient opened the email (tracking pixel)
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      clicked
                    </code>
                  </td>
                  <td className="py-2">
                    Recipient clicked a link in the email
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      bounced
                    </code>
                  </td>
                  <td className="py-2">Email bounced (hard or soft bounce)</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      complained
                    </code>
                  </td>
                  <td className="py-2">Recipient marked as spam</td>
                </tr>
                <tr>
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      suppressed
                    </code>
                  </td>
                  <td className="py-2">
                    Email suppressed by SES (on suppression list)
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="text-muted-foreground text-sm">
              Negative statuses (bounced, complained, suppressed) always
              override positive ones. Status is derived from the
              highest-priority event.
            </p>
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardContent className="p-6">
            <h4 className="mb-3 font-medium">Available Methods</h4>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="pb-2 text-left">Method</th>
                  <th className="pb-2 text-left">Description</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      events.get(messageId)
                    </code>
                  </td>
                  <td className="py-2">
                    Get full status and event timeline for an email
                  </td>
                </tr>
                <tr>
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      events.list(options)
                    </code>
                  </td>
                  <td className="py-2">
                    List emails with status, filtered by account and time range
                  </td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
      </section>

      {/* Suppression List */}
      <section className="mb-12">
        <SectionHeading
          className="mb-4"
          id="suppression"
          markdown={SECTION_MD.suppression}
          title="Suppression List"
        />
        <p className="mb-4 text-muted-foreground">
          Manage the SES account-level suppression list. Emails on this list are
          automatically blocked from sending. The suppression API is always
          available — no extra configuration needed.
        </p>

        <div className="space-y-6">
          <div>
            <p className="mb-2 font-medium text-sm">Check if Suppressed</p>
            <CodeBlock
              className="h-auto"
              data={[
                {
                  language: "typescript",
                  filename: "suppression-get.ts",
                  code: suppressionGetCode,
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
            <p className="mb-2 font-medium text-sm">Add to Suppression List</p>
            <CodeBlock
              className="h-auto"
              data={[
                {
                  language: "typescript",
                  filename: "suppression-add.ts",
                  code: suppressionAddCode,
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
            <p className="mb-2 font-medium text-sm">
              Remove from Suppression List
            </p>
            <CodeBlock
              className="h-auto"
              data={[
                {
                  language: "typescript",
                  filename: "suppression-remove.ts",
                  code: suppressionRemoveCode,
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
            <p className="mb-2 font-medium text-sm">List Suppressed Emails</p>
            <CodeBlock
              className="h-auto"
              data={[
                {
                  language: "typescript",
                  filename: "suppression-list.ts",
                  code: suppressionListCode,
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
            <p className="mb-2 text-muted-foreground text-sm">
              With <code>historyTableName</code> configured,{" "}
              <code>events.getSuppressionHistory()</code> reads the record the
              Wraps event processor keeps in your{" "}
              <code>wraps-email-history</code> table for each hard bounce,
              complaint and validation suppression. The record stays after the
              address is removed from the SES list. It is history, not current
              state, and <code>null</code> does not mean the address is safe to
              send to.
            </p>
          </div>
          <div>
            <p className="mb-2 font-medium text-sm">Suppression History</p>
            <CodeBlock
              className="h-auto"
              data={[
                {
                  language: "typescript",
                  filename: "suppression-history.ts",
                  code: suppressionHistoryCode,
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

        <Card className="mt-6">
          <CardContent className="p-6">
            <h4 className="mb-3 font-medium">Available Methods</h4>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="pb-2 text-left">Method</th>
                  <th className="pb-2 text-left">Description</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      suppression.get(email)
                    </code>
                  </td>
                  <td className="py-2">
                    Check if an email is suppressed (returns null if not)
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      suppression.add(email, reason)
                    </code>
                  </td>
                  <td className="py-2">Add email to suppression list</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      suppression.remove(email)
                    </code>
                  </td>
                  <td className="py-2">
                    Remove from suppression list (idempotent)
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      suppression.list(options?)
                    </code>
                  </td>
                  <td className="py-2">
                    List suppressed emails with filters and pagination
                  </td>
                </tr>
                <tr>
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      events.getSuppressionHistory(email)
                    </code>
                  </td>
                  <td className="py-2">
                    Read why and when an address was suppressed. Needs{" "}
                    <code>historyTableName</code>; returns null when no history
                    exists
                  </td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
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
          The SDK throws typed errors for different failure scenarios.
        </p>
        <Card className="mb-4">
          <CardContent className="p-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="pb-2 text-left">Error</th>
                  <th className="pb-2 text-left">Description</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      ValidationError
                    </code>
                  </td>
                  <td className="py-2">
                    Invalid input parameters (includes <code>field</code>{" "}
                    property)
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      SESError
                    </code>
                  </td>
                  <td className="py-2">
                    AWS SES error (includes <code>code</code>,{" "}
                    <code>requestId</code>, <code>retryable</code> properties)
                  </td>
                </tr>
                <tr>
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      DynamoDBError
                    </code>
                  </td>
                  <td className="py-2">
                    DynamoDB error from events API (includes <code>code</code>,{" "}
                    <code>requestId</code>, <code>retryable</code> properties)
                  </td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
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
          The SDK is written in TypeScript and provides full type safety out of
          the box.
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

      {/* SDK Defaults & Limits */}
      <section className="mb-12">
        <SectionHeading
          className="mb-4"
          id="defaults-and-limits"
          markdown={SECTION_MD.defaultsAndLimits}
          title="SDK Defaults & Limits"
        />
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-6">
            <div className="flex items-start gap-3">
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div className="text-sm">
                <p className="mb-3 font-medium">
                  Important defaults and limits to keep in mind:
                </p>
                <ul className="space-y-2 text-muted-foreground">
                  <li>
                    <strong>No automatic retry on failure</strong> — implement
                    your own retry logic if{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      retryable
                    </code>{" "}
                    is{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5">true</code>
                  </li>
                  <li>
                    <strong>Default pagination</strong>: 50 items per page
                  </li>
                  <li>
                    <strong>Presigned URL expiry</strong>: 1 hour (for
                    attachments)
                  </li>
                  <li>
                    <strong>Bulk send limit</strong>: 50 destinations per call
                  </li>
                  <li>
                    <strong>Attachment limit</strong>: 100 per email (10 MB
                    total message size)
                  </li>
                </ul>
              </div>
            </div>
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
                  href="https://www.npmjs.com/package/@wraps.dev/email"
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
              <CardTitle className="text-lg">React Email</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-muted-foreground text-sm">
                Learn how to build beautiful email templates with React.
              </p>
              <Button asChild variant="outline">
                <a
                  href="https://react.email"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Learn More
                  <ArrowRight className="ml-2 h-4 w-4" />
                </a>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>
    </DocsLayout>
  );
}
