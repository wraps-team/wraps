import { renderPricingMarkdown } from "./pricing-markdown";

/** Generated from config/pricing.ts + lib/ses-cost.ts — mirrors public/pricing.md */
const PRICING_MARKDOWN = renderPricingMarkdown();

export const AGENT_CONTENT: Record<string, string> = {
  // Pricing is the single most-requested page for agents; serve it on both the
  // page path (via Accept: text/markdown) and the literal .md path.
  "/pricing": PRICING_MARKDOWN,
  "/pricing.md": PRICING_MARKDOWN,
  "/tools/ses-calculator": PRICING_MARKDOWN,
  "/": `# Wraps

> Deploy email, SMS, and CDN infrastructure to your AWS account with one command.
> Modern DX. AWS economics. Full ownership.

Wraps is a CLI and TypeScript SDK that deploys production-ready AWS infrastructure (SES, Lambda, DynamoDB, EventBridge, CloudFront) to your account. Zero credentials stored. OIDC authentication. You own everything.

## Quick Start

\`\`\`bash
npx @wraps.dev/cli email init  # Deploy email infrastructure (~2 min)
npx @wraps.dev/cli sms init    # Deploy SMS infrastructure
npx @wraps.dev/cli cdn init    # Deploy CDN (S3 + CloudFront)
\`\`\`

\`\`\`bash
npm install @wraps.dev/email
\`\`\`

\`\`\`typescript
import { WrapsEmail } from '@wraps.dev/email';
const email = new WrapsEmail();
await email.send({
  from: 'hello@yourdomain.com',
  to: 'user@example.com',
  subject: 'Welcome!',
  html: '<h1>Hello!</h1>',
});
\`\`\`

## Pricing

Wraps charges for the platform. You pay AWS directly for sending — $0.10/1,000 emails on SES à la carte, $0.16/1,000 on the Essentials plan AWS assigns to new accounts by default. Full pricing, SES plan detail, and a cost estimator API: https://wraps.dev/pricing.md

| Plan | Price | Tracked Events/mo | AWS Accounts |
|------|-------|-------------------|--------------|
| Free | $0 | 5,000 | 1 |
| Starter | $19/mo | 50,000 | 1 |
| Growth | $79/mo | 250,000 (+$0.50/1K) | 3 |
| Scale | $199/mo | 1,000,000 (+$0.15/1K) | Unlimited |

Annual plans available (save ~16%). All paid plans: unlimited contacts, unlimited team members.

## Key Pages

- [Email Quickstart](https://wraps.dev/docs/quickstart/email)
- [SMS Quickstart](https://wraps.dev/docs/quickstart/sms)
- [CDN Quickstart](https://wraps.dev/docs/quickstart/cdn)
- [Platform Quickstart](https://wraps.dev/docs/quickstart/platform)
- [Agent Email Quickstart](https://wraps.dev/docs/quickstart/email/agents)
- [Email SDK Reference](https://wraps.dev/docs/sdk-reference)
- [SMS SDK Reference](https://wraps.dev/docs/sms-sdk-reference)
- [CLI Reference](https://wraps.dev/docs/cli-reference)
`,

  "/docs/quickstart/email": `# Email Quickstart

Deploy production-ready email infrastructure to your AWS account in under 2 minutes.

## What You'll Build

- AWS SES with DKIM, SPF, and DMARC configured automatically
- A verified sending domain in your AWS account
- Your first email sent via the TypeScript SDK

Time: ~2 minutes

## Prerequisites

- Node.js 20 or later
- An AWS account with valid credentials configured
- AWS CLI installed and configured (or AWS credentials in environment variables)

## Step 1: Deploy Infrastructure

\`\`\`bash
npx @wraps.dev/cli email init
\`\`\`

This deploys SES, DynamoDB, Lambda, EventBridge, and IAM roles to your AWS account. Takes 1-2 minutes. You'll be prompted to choose a preset (Starter, Production, or Enterprise) and shown estimated monthly AWS costs.

## Step 2: Install the SDK

\`\`\`bash
npm install @wraps.dev/email
# or: pnpm add @wraps.dev/email | yarn add @wraps.dev/email | bun add @wraps.dev/email
\`\`\`

## Step 3: Send Your First Email

\`\`\`typescript
import { WrapsEmail } from '@wraps.dev/email';

const email = new WrapsEmail();

const result = await email.send({
  from: 'hello@yourdomain.com',
  to: 'user@example.com',
  subject: 'Welcome to Wraps!',
  html: '<h1>Hello from Wraps!</h1><p>This email was sent using AWS SES.</p>',
});

if (result.success) {
  console.log('Email sent:', result.data.messageId);
} else {
  console.error('Failed to send email:', result.error);
}
\`\`\`

> **Domain Verification**: Before sending, verify your domain with AWS SES:
> \`npx @wraps.dev/cli email domains verify -d yourdomain.com\`

## Step 4: View Analytics (Optional)

\`\`\`bash
npx @wraps.dev/cli dashboard
\`\`\`

Opens at localhost:5555 — view email history, delivery rates, bounces, and complaints.

## Next Steps

- [Email SDK Reference](https://wraps.dev/docs/sdk-reference) — all methods and options
- [CLI Reference](https://wraps.dev/docs/cli-reference) — manage infrastructure
- [Domain Verification Guide](https://wraps.dev/docs/guides/domain-verification)
- [Next.js Guide](https://wraps.dev/docs/quickstart/email/nextjs)
- [Agent Guide](https://wraps.dev/docs/quickstart/email/agents)
`,

  "/docs/quickstart/email/agents": `# Send Email from Your Agent

Wire Wraps into your agent's tool calls. The infrastructure lives in your AWS account; the agent just calls a typed function.

## What You'll Build

- AWS SES deployed to your account (DKIM, SPF, DMARC included)
- A typed send-email tool your agent framework can register as-is
- Wraps docs in your AI editor's context via Context7 MCP
- Live access to your email infrastructure via the Wraps MCP server

Time: ~5 minutes

## Prerequisites

- Node.js 20 or later
- An AWS account with valid credentials configured
- An agent framework (LangGraph, Vercel AI SDK, Mastra, or your own)

## Step 1: Deploy Infrastructure

\`\`\`bash
npx @wraps.dev/cli email init
\`\`\`

Deploys SES, DKIM, bounce handling, and EventBridge event processing into your AWS account.

## Step 2: Install the SDK

\`\`\`bash
npm install @wraps.dev/email
# or: pnpm add @wraps.dev/email | yarn add @wraps.dev/email | bun add @wraps.dev/email
\`\`\`

## Step 3: Write the Agent Tool

\`\`\`typescript
import { WrapsEmail } from "@wraps.dev/email";

const email = new WrapsEmail();

// Works for any agent framework:
// LangGraph: register as a tool. Vercel AI SDK: pass to tool({}).
// Mastra: wrap with createTool. The signature stays the same.
export async function sendEmailTool(input: {
  to: string;
  subject: string;
  html: string;
}) {
  const result = await email.send({
    from: "agent@yourdomain.com",
    to: input.to,
    subject: input.subject,
    html: input.html,
  });

  if (!result.success) {
    throw new Error(\`Email failed: \${result.error.message}\`);
  }

  return { messageId: result.data.messageId };
}
\`\`\`

The SDK resolves AWS credentials from your environment — the same chain the AWS CLI uses. Your agent never sees an API key; it calls a function.

## Step 4: Give Your AI Editor Wraps Docs

Add Context7 to your MCP config so Claude Code, Cursor, Windsurf, or any MCP-compatible editor can pull the latest Wraps docs into context:

\`\`\`json
{
  "mcpServers": {
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp@latest"]
    }
  }
}
\`\`\`

Full setup at [Context7 Guide](https://wraps.dev/docs/guides/context7).

## Step 5: Give Your Agent Live Access with the Wraps MCP Server

Context7 gives your editor the docs; \`@wraps.dev/mcp\` gives your agent the infrastructure itself. It exposes your send history, delivery events, domain status, and suppression list as MCP tools — plus guarded sending, disabled by default:

\`\`\`json
{
  "mcpServers": {
    "wraps": {
      "command": "npx",
      "args": ["-y", "@wraps.dev/mcp"]
    }
  }
}
\`\`\`

Tools, configuration, and write-mode guardrails: [MCP Server Reference](https://wraps.dev/docs/mcp-reference).

## Next Steps

- [MCP Server Reference](https://wraps.dev/docs/mcp-reference) — give your agent live access to your email infrastructure
- [Email SDK Reference](https://wraps.dev/docs/sdk-reference) — every method and response shape
- [CLI Reference](https://wraps.dev/docs/cli-reference/email) — manage infrastructure
`,

  "/docs/mcp-reference": `# MCP Server Reference (@wraps.dev/mcp)

MCP server for Wraps email infrastructure. Gives AI agents access to your AWS SES sending history, delivery events, domain status, and suppression list — and, optionally, the ability to send email. Runs locally via stdio; your AWS credentials never leave your machine.

## Prerequisites

- Wraps email stack deployed (\`wraps email init\`)
- AWS credentials configured in your environment (same profile used for the Wraps CLI)

## Tools

| Tool | Description | Write? |
|------|-------------|--------|
| \`send_email\` | Send a transactional email via your SES account | Yes — requires \`WRAPS_WRITE_ENABLED=true\` |
| \`list_recent_sends\` | List recent sends from your email history | No |
| \`get_email_event_log\` | Full delivery event log for a message (Send, Delivery, Bounce, Complaint, Open, Click) | No |
| \`verify_domain_status\` | Verification and DKIM status of a sending domain | No |
| \`list_suppressions\` | Addresses on your SES suppression list, filterable by BOUNCE or COMPLAINT | No |
| \`estimate_cost\` | Monthly Wraps + AWS cost for a send volume, including the account's SES pricing plan. Needs no AWS credentials | No |
| \`check_send_status\` | Poll the outcome of a \`pending_approval\` send by \`approvalId\` (enforced mode only) | No |

## Setup: Claude Code

Add to \`.mcp.json\` in your project root. Claude Code inherits your shell's AWS environment — no extra env config needed.

\`\`\`json
{
  "mcpServers": {
    "wraps": {
      "command": "npx",
      "args": ["-y", "@wraps.dev/mcp"]
    }
  }
}
\`\`\`

## Setup: Claude Desktop / Cursor / Windsurf

GUI clients don't inherit your shell, so pass region and profile explicitly. Claude Desktop config lives at \`~/Library/Application Support/Claude/claude_desktop_config.json\`; Cursor uses \`.cursor/mcp.json\`.

\`\`\`json
{
  "mcpServers": {
    "wraps": {
      "command": "npx",
      "args": ["-y", "@wraps.dev/mcp"],
      "env": {
        "AWS_REGION": "us-east-1",
        "AWS_PROFILE": "your-aws-profile"
      }
    }
  }
}
\`\`\`

## Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| \`AWS_REGION\` | Yes | — | AWS region where your Wraps stack is deployed |
| \`WRAPS_HISTORY_TABLE_NAME\` | No | \`wraps-email-history\` | DynamoDB table name for email history |
| \`WRAPS_ACCOUNT_ID\` | No | auto-detected via STS | Your AWS account ID (skips the STS call if set) |
| \`WRAPS_WRITE_ENABLED\` | No | \`false\` | Set to \`true\` to enable \`send_email\` |
| \`WRAPS_FROM_EMAIL\` | No | — | Default \`from\` address for \`send_email\` |
| \`WRAPS_CONFIGURATION_SET\` | No | — | SES configuration set applied to sends (enables open/click tracking) |

## Write Mode

\`send_email\` is disabled by default. Set \`WRAPS_WRITE_ENABLED=true\` to enable it. The \`from\` address must belong to a domain verified in your SES account.

Warning: write mode with no allowlist gives the agent unrestricted send capability to any address your SES account can reach. Set the guardrails below.

## Send Guardrails

| Variable | Default | Description |
|----------|---------|-------------|
| \`WRAPS_ALLOWED_RECIPIENTS\` | — (no restriction) | Comma-separated exact addresses the agent may send to |
| \`WRAPS_ALLOWED_RECIPIENT_DOMAINS\` | — (no restriction) | Comma-separated domains; exact match only (subdomains must be listed explicitly) |
| \`WRAPS_MAX_RECIPIENTS\` | \`50\` | Maximum recipients per \`send_email\` call |
| \`WRAPS_ALLOW_FROM_OVERRIDE\` | \`false\` | Allow the agent to supply a \`from\` differing from \`WRAPS_FROM_EMAIL\` |

A recipient is allowed if it matches either the address list or the domain list.

## Enforced Mode

For agents provisioned via \`wraps email agent create\`, the agent's AWS credential can only invoke an enforcer Lambda in your account — never SES directly. Kill-switch, recipient allowlist, and hourly/daily caps are decided by that Lambda; local guardrails don't apply. Activated by setting both \`WRAPS_AGENT_ID\` and \`WRAPS_AGENT_ENFORCER_ARN\`.

\`send_email\` returns a structured disposition for policy outcomes: \`sent\` (with messageId), \`pending_approval\` (poll \`check_send_status\` with the returned approvalId), or \`blocked\` (with a reason). Enforced mode accepts one recipient per send.

## Resources

- npm: https://www.npmjs.com/package/@wraps.dev/mcp
- GitHub: https://github.com/wraps-team/wraps-js/tree/main/packages/mcp
- Agent quickstart: https://wraps.dev/docs/quickstart/email/agents
`,

  "/docs/quickstart/email/nextjs": `# Send Email from Next.js

Deploy email infrastructure and send your first email from a Next.js application.

## Prerequisites

- Node.js 18 or later
- AWS credentials configured ([AWS Setup Guide](https://wraps.dev/docs/guides/aws-setup))
- A domain you own

## Step 1: Deploy Infrastructure

\`\`\`bash
npx @wraps.dev/cli email init
\`\`\`

Deploys SES, DynamoDB, Lambda, EventBridge, and IAM roles. Takes 1-2 minutes.

## Step 2: Add Your Domain

\`\`\`bash
npx @wraps.dev/cli email domains add -d yourdomain.com
\`\`\`

The CLI outputs DKIM CNAME records to add to your DNS provider. Verify after adding:

\`\`\`bash
npx @wraps.dev/cli email domains verify -d yourdomain.com
\`\`\`

## Step 3: Install the SDK

\`\`\`bash
npm install @wraps.dev/email
\`\`\`

## Step 4: Send from a Server Action

\`\`\`typescript
// app/actions/send-email.ts
'use server'

import { WrapsEmail } from '@wraps.dev/email';

const email = new WrapsEmail();

export async function sendWelcomeEmail(to: string, name: string) {
  const result = await email.send({
    from: 'hello@yourdomain.com',
    to,
    subject: \`Welcome, \${name}!\`,
    html: \`<h1>Welcome to our app, \${name}!</h1><p>We're glad you're here.</p>\`,
  });

  return { messageId: result.messageId };
}
\`\`\`

## Step 5: Send from an API Route

\`\`\`typescript
// app/api/send/route.ts
import { NextResponse } from 'next/server';
import { WrapsEmail } from '@wraps.dev/email';

const email = new WrapsEmail();

export async function POST(request: Request) {
  const { to, subject, html } = await request.json();

  const result = await email.send({
    from: 'hello@yourdomain.com',
    to,
    subject,
    html,
  });

  return NextResponse.json({ messageId: result.messageId });
}
\`\`\`

## Step 6: Deploy to Vercel

When deploying to Vercel, Wraps uses OIDC for authentication — no AWS access keys needed. Set \`AWS_ROLE_ARN\` in your Vercel environment variables.

## Next Steps

- [Email SDK Reference](https://wraps.dev/docs/sdk-reference)
- [Templates Guide](https://wraps.dev/docs/guides/templates)
- [Vercel Setup Guide](https://wraps.dev/docs/guides/vercel-setup)
`,

  "/docs/quickstart/sms": `# SMS Quickstart

Deploy production-ready SMS infrastructure to your AWS account and send your first text message.

## What You'll Build

- AWS End User Messaging with a provisioned phone number
- Automatic opt-out management for compliance
- Your first SMS sent via the TypeScript SDK

Time: ~3 minutes

## Prerequisites

- Node.js 20 or later
- An AWS account with valid credentials configured
- AWS CLI installed and configured

## Step 1: Deploy Infrastructure

\`\`\`bash
npx @wraps.dev/cli sms init
\`\`\`

Provisions a toll-free number, sets up AWS End User Messaging, and deploys IAM roles for OIDC authentication. Takes ~3 minutes.

## Step 2: Install the SDK

\`\`\`bash
npm install @wraps.dev/sms
# or: pnpm add @wraps.dev/sms | yarn add @wraps.dev/sms | bun add @wraps.dev/sms
\`\`\`

## Step 3: Send Your First SMS

\`\`\`typescript
import { WrapsSMS } from '@wraps.dev/sms';

const sms = new WrapsSMS();

const result = await sms.send({
  to: '+14155551234',
  message: 'Your verification code is 123456',
});

console.log('SMS sent:', result.messageId);
\`\`\`

> **Phone Number Format**: Numbers must be in E.164 format (e.g., \`+14155551234\`).

## Next Steps

- [SMS SDK Reference](https://wraps.dev/docs/sms-sdk-reference)
- [CLI Reference](https://wraps.dev/docs/cli-reference)
- [SMS Infrastructure](https://wraps.dev/docs/infrastructure/sms)
- [CDK Reference](https://wraps.dev/docs/cdk-reference) / [Pulumi Reference](https://wraps.dev/docs/pulumi-reference)
`,

  "/docs/quickstart/platform": `# Platform SDK Quickstart

Use the type-safe Platform SDK to manage contacts, send batch emails, and interact with the Wraps API programmatically.

## What You'll Build

- A type-safe Platform SDK client connected to your organization
- Contact management with create and list operations
- Batch email sending to segments of contacts

Time: ~3 minutes

## Prerequisites

- Node.js 20 or later
- A Wraps account with an organization ([sign up here](https://app.wraps.dev/auth?mode=signup))
- An API key from your organization settings

## Step 1: Get Your API Key

1. Go to [app.wraps.dev](https://app.wraps.dev) and sign in
2. Navigate to **Settings** → **API Keys**
3. Click **Create API Key** and copy it (you won't see it again)

Store in an environment variable: \`WRAPS_API_KEY=wraps_live_xxx...\`

## Step 2: Install the SDK

\`\`\`bash
npm install @wraps.dev/client
# or: pnpm add @wraps.dev/client | yarn add @wraps.dev/client | bun add @wraps.dev/client
\`\`\`

## Step 3: Initialize the Client

\`\`\`typescript
import { createPlatformClient } from '@wraps.dev/client';

const client = createPlatformClient({
  apiKey: process.env.WRAPS_API_KEY,
});
\`\`\`

## Step 4: Create a Contact

\`\`\`typescript
const { data, error } = await client.POST('/v1/contacts/', {
  body: {
    email: 'user@example.com',
    emailStatus: 'active',
    firstName: 'John',
    lastName: 'Doe',
  },
});

if (data) {
  console.log('Contact created:', data.id);
} else {
  console.error('Error:', error);
}
\`\`\`

## Step 5: List Contacts

\`\`\`typescript
const { data, error } = await client.GET('/v1/contacts/', {
  params: {
    query: { page: '1', pageSize: '10' },
  },
});

if (data) {
  console.log('Total contacts:', data.total);
  data.contacts.forEach(contact => {
    console.log(contact.email, contact.emailStatus);
  });
}
\`\`\`

## Bonus: Send Batch Emails

\`\`\`typescript
const { data, error } = await client.POST('/v1/batch/', {
  body: {
    templateId: 'your-template-id',
    segmentId: 'your-segment-id',
  },
});

if (data) {
  console.log('Batch created:', data.id, 'Status:', data.status);
}
\`\`\`

## Next Steps

- [Platform SDK Reference](https://wraps.dev/docs/client-sdk-reference)
- [Email SDK](https://wraps.dev/docs/sdk-reference)
`,

  "/docs/sdk-reference": `# @wraps.dev/email SDK Reference

A TypeScript-first SDK for sending emails through your Wraps-deployed AWS SES infrastructure. Simple, type-safe, and intuitive API with React.email support.

## Installation

\`\`\`bash
npm install @wraps.dev/email
# or: pnpm add @wraps.dev/email | yarn add @wraps.dev/email | bun add @wraps.dev/email
\`\`\`

## Quick Start

\`\`\`typescript
import { WrapsEmail } from '@wraps.dev/email';

const email = new WrapsEmail();

const result = await email.send({
  from: 'hello@yourdomain.com',
  to: 'user@example.com',
  subject: 'Welcome!',
  html: '<h1>Hello!</h1>',
});

console.log('Message ID:', result.messageId);
\`\`\`

## Initialization

The SDK automatically detects AWS credentials from your environment.

### Constructor
\`\`\`typescript
new WrapsEmail(config?: WrapsEmailConfig)
\`\`\`

### Configuration Options

| Option | Type | Description |
|--------|------|-------------|
| \`client\` | SESClient | Pre-configured SES client (takes precedence) |
| \`region\` | string | AWS region (default: \`us-east-1\`) |
| \`credentials\` | object or AwsCredentialIdentityProvider | Explicit AWS credentials |
| \`roleArn\` | string | IAM role for OIDC assumption |
| \`roleSessionName\` | string | Session name for AssumeRole |
| \`endpoint\` | string | Custom endpoint (e.g., LocalStack) |
| \`inboxBucketName\` | string | S3 bucket for inbound email storage |
| \`historyTableName\` | string | DynamoDB table for email event history |
| \`dynamodbClient\` | DynamoDBDocumentClient | Pre-configured DynamoDB client |
| \`sesv2Client\` | SESv2Client | Pre-configured SES v2 client |
| \`s3Client\` | S3Client | Pre-configured S3 client for inbox |

### Authentication Order
1. Pre-configured client (\`client\` option)
2. OIDC role assumption (\`roleArn\` option)
3. Explicit credentials (\`credentials\` option)
4. AWS credential chain (env vars, \`~/.aws/credentials\`, IAM role)

### Examples

\`\`\`typescript
// Explicit credentials
const email = new WrapsEmail({
  region: 'us-west-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN, // optional
  },
});

// Testing with LocalStack
const email = new WrapsEmail({
  region: 'us-east-1',
  endpoint: process.env.LOCALSTACK_URL, // e.g. localhost:4566
});
\`\`\`

## Send Email

\`\`\`typescript
email.send(params: SendEmailParams): Promise<SendEmailResult>
\`\`\`

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| \`from\` | string | Sender email address (must be verified) |
| \`to\` | string or string[] | Recipient email address(es) |
| \`subject\` | string | Email subject line |
| \`html\` | string | HTML email body (optional if text or react provided) |
| \`text\` | string | Plain text fallback (optional — auto-generated from html if omitted) |
| \`react\` | ReactElement | React.email component (optional) |
| \`cc\` | string or string[] | CC recipients (optional) |
| \`bcc\` | string or string[] | BCC recipients (optional) |
| \`replyTo\` | string or string[] | Reply-to address(es) (optional) |
| \`attachments\` | Attachment[] | File attachments (optional) |
| \`tags\` | Record<string, string> | SES message tags (optional) |
| \`configurationSetName\` | string | Configuration set for tracking (optional) |

### Response

| Field | Type | Description |
|-------|------|-------------|
| \`messageId\` | string | Unique message identifier from SES |
| \`requestId\` | string | AWS request ID |

### Examples

\`\`\`typescript
// Basic email
const result = await email.send({
  from: 'hello@yourdomain.com',
  to: 'user@example.com',
  subject: 'Welcome to our app',
  html: '<h1>Welcome!</h1><p>Thanks for signing up.</p>',
  text: 'Welcome! Thanks for signing up.',
});
console.log('Message ID:', result.messageId);

// Multiple recipients
await email.send({
  from: 'newsletter@yourdomain.com',
  to: ['user1@example.com', 'user2@example.com'],
  cc: 'manager@yourdomain.com',
  bcc: ['archive@yourdomain.com'],
  replyTo: 'support@yourdomain.com',
  subject: 'Weekly Newsletter',
  html: '<h1>This week\\'s updates</h1>',
});

// With SES tags
await email.send({
  from: 'you@yourdomain.com',
  to: 'user@example.com',
  subject: 'Newsletter',
  html: '<p>Content</p>',
  tags: {
    campaign: 'newsletter-2025-01',
    type: 'marketing',
  },
  configurationSetName: 'wraps-email-tracking',
});
\`\`\`

## React.email Support

\`\`\`typescript
import { WelcomeEmail } from './emails/Welcome';

await email.send({
  from: 'hello@yourdomain.com',
  to: 'user@example.com',
  subject: 'Welcome to our platform',
  react: <WelcomeEmail name="John" orderId="12345" />,
});
\`\`\`

The SDK automatically renders React components to HTML and plain text.

## Attachments

\`\`\`typescript
await email.send({
  from: 'you@yourdomain.com',
  to: 'user@example.com',
  subject: 'Your invoice',
  html: '<p>Please find your invoice attached.</p>',
  attachments: [
    {
      filename: 'invoice.pdf',
      content: pdfBuffer, // Buffer or base64 string
      contentType: 'application/pdf', // Optional - auto-detected from filename
    },
    { filename: 'chart.png', content: imageBuffer },
  ],
});
\`\`\`

Limits: 100 attachments per email, 10 MB total message size.

## Template Management

SES templates stored in your AWS account with \`{{variable}}\` substitution.

\`\`\`typescript
// Create a template
await email.templates.create({
  name: 'welcome-email',
  subject: 'Welcome to {{companyName}}, {{name}}!',
  html: '<h1>Welcome {{name}}!</h1><p>Click: <a href="{{confirmUrl}}">Confirm</a></p>',
  text: 'Welcome {{name}}! Click to confirm: {{confirmUrl}}',
});

// Create from React.email component
await email.templates.createFromReact({
  name: 'welcome-email-v2',
  subject: 'Welcome to {{companyName}}, {{name}}!',
  react: <WelcomeEmailTemplate />,
});

// List, get, update, delete
const templates = await email.templates.list();
const template = await email.templates.get('welcome-email');
await email.templates.update({ name: 'welcome-email', subject: 'Welcome aboard, {{name}}!', html: '...' });
await email.templates.delete('welcome-email');
\`\`\`

| Method | Description |
|--------|-------------|
| \`templates.create(params)\` | Create a new SES template |
| \`templates.createFromReact(params)\` | Create template from React component |
| \`templates.update(params)\` | Update an existing template |
| \`templates.get(name)\` | Get template details |
| \`templates.list()\` | List all templates |
| \`templates.delete(name)\` | Delete a template |

## Send Template

\`\`\`typescript
email.sendTemplate(params: SendTemplateParams): Promise<SendEmailResult>
\`\`\`

\`\`\`typescript
const result = await email.sendTemplate({
  from: 'hello@yourdomain.com',
  to: 'user@example.com',
  template: 'welcome-email',
  templateData: {
    name: 'John Doe',
    companyName: 'Acme Corp',
    confirmUrl: 'https://example.com/confirm/abc123',
  },
});
console.log('Email sent:', result.messageId);
\`\`\`

## Send Bulk Template

Send personalized templated emails to multiple recipients (up to 50 per call).

\`\`\`typescript
email.sendBulkTemplate(params: SendBulkTemplateParams): Promise<SendBulkTemplateResult>
\`\`\`

\`\`\`typescript
const result = await email.sendBulkTemplate({
  from: 'hello@yourdomain.com',
  template: 'weekly-digest',
  destinations: [
    { to: 'alice@example.com', templateData: { name: 'Alice', unreadCount: 5 } },
    { to: 'bob@example.com', templateData: { name: 'Bob', unreadCount: 12 } },
  ],
  defaultTemplateData: { companyName: 'Acme Corp', year: '2025' },
});

result.status.forEach((item, i) => {
  if (item.status === 'success') console.log(\`Email \${i + 1} sent: \${item.messageId}\`);
  else console.log(\`Email \${i + 1} failed: \${item.error}\`);
});
\`\`\`

## Send Batch

Send unique emails to multiple recipients in a single call (max 100 entries). Unlike \`sendBulkTemplate()\`, no pre-created SES template needed — provide subject/HTML per recipient inline.

\`\`\`typescript
email.sendBatch(params: SendBatchParams): Promise<SendBatchResult>
\`\`\`

\`\`\`typescript
const result = await email.sendBatch({
  from: 'hello@yourdomain.com',
  entries: [
    { to: 'alice@example.com', subject: 'Hi Alice', html: '<p>Your order #1001 has shipped.</p>' },
    { to: 'bob@example.com', subject: 'Hi Bob', html: '<p>Your order #1002 has shipped.</p>' },
  ],
  replyTo: 'support@yourdomain.com',
  tags: { campaign: 'order-shipped' },
});

console.log(\`Sent: \${result.successCount}, Failed: \${result.failureCount}\`);
for (const entry of result.results) {
  if (entry.status === 'success') console.log(\`Entry \${entry.index}: \${entry.messageId}\`);
  else console.log(\`Entry \${entry.index} failed: \${entry.error}\`);
}
\`\`\`

## htmlToPlainText Utility

Convert HTML to plain text for email fallback. Used internally by \`send()\` when \`text\` is omitted.

\`\`\`typescript
import { htmlToPlainText } from '@wraps.dev/email';

const text = htmlToPlainText('<h1>Welcome!</h1><p>Thanks for <a href="https://example.com">signing up</a>.</p>');
// Welcome!
//
// Thanks for signing up (https://example.com).
\`\`\`

## Inbox (Inbound Emails)

Read, reply to, and forward inbound emails. Requires \`wraps email inbound init\`.

\`\`\`typescript
const email = new WrapsEmail({ inboxBucketName: 'your-inbound-bucket-name' });

// List inbound emails
const { emails, nextToken } = await email.inbox.list({ maxResults: 20 });

// Get full email details
const inboundEmail = await email.inbox.get('email-abc123');
console.log('From:', inboundEmail.from.address);
console.log('Subject:', inboundEmail.subject);
console.log('Spam verdict:', inboundEmail.spamVerdict);

// Reply with threading headers
await email.inbox.reply('email-abc123', {
  from: 'support@yourdomain.com',
  text: 'Thanks for reaching out!',
  html: '<p>Thanks for reaching out!</p>',
});

// Forward
await email.inbox.forward('email-abc123', {
  from: 'noreply@yourdomain.com',
  to: 'team@yourdomain.com',
  addPrefix: '[Customer]',
});

// Get presigned URL for attachment
const url = await email.inbox.getAttachment('email-abc123', 'attachment-id', { expiresIn: 3600 });

// Delete email and all associated files
await email.inbox.delete('email-abc123');
\`\`\`

| Method | Description |
|--------|-------------|
| \`inbox.list(options?)\` | List inbound emails with pagination |
| \`inbox.get(emailId)\` | Get full email details by ID |
| \`inbox.reply(emailId, options)\` | Reply with threading headers |
| \`inbox.forward(emailId, options)\` | Forward to new recipients |
| \`inbox.getAttachment(emailId, attachmentId, options?)\` | Get presigned URL |
| \`inbox.getRaw(emailId)\` | Get presigned URL for raw MIME email |
| \`inbox.delete(emailId)\` | Delete email and all files |

## Email Events

Track the delivery lifecycle of every email. Requires event tracking infrastructure (Production or Enterprise preset).

\`\`\`typescript
const email = new WrapsEmail({ historyTableName: 'wraps-email-history' });

// Get full status and event timeline
const status = await email.events.get('message-id-from-send');
if (status) {
  console.log('Status:', status.status);   // 'delivered', 'opened', 'bounced', etc.
  console.log('Sent at:', new Date(status.sentAt));
  for (const event of status.events) {
    console.log(\`  \${event.type} at \${new Date(event.timestamp)}\`);
  }
}

// List recent emails with status
const { emails, nextToken } = await email.events.list({
  accountId: '123456789012',
  startTime: new Date('2025-01-01'),
  maxResults: 20,
});
\`\`\`

| Status | Description |
|--------|-------------|
| \`sent\` | Email accepted by SES |
| \`delivered\` | Delivered to recipient's mail server |
| \`opened\` | Recipient opened the email |
| \`clicked\` | Recipient clicked a link |
| \`bounced\` | Email bounced (hard or soft) |
| \`complained\` | Recipient marked as spam |
| \`suppressed\` | On the SES suppression list |

## Suppression List

\`\`\`typescript
// Check if suppressed
const entry = await email.suppression.get('user@example.com');
if (entry) {
  console.log('Suppressed:', entry.reason); // 'BOUNCE' or 'COMPLAINT'
}

// Add manually
await email.suppression.add('bad-address@example.com', 'BOUNCE');

// Remove (idempotent)
await email.suppression.remove('user@example.com');

// List with filters
const { entries, nextToken } = await email.suppression.list({
  reason: 'BOUNCE',
  startDate: new Date('2025-01-01'),
  maxResults: 100,
});
\`\`\`

## Error Handling

\`\`\`typescript
import { WrapsEmail, SESError, DynamoDBError, ValidationError } from '@wraps.dev/email';

try {
  await email.send({ ... });
} catch (error) {
  if (error instanceof ValidationError) {
    console.error('Validation error:', error.message, 'Field:', error.field);
  } else if (error instanceof SESError) {
    console.error('SES error:', error.message, 'Code:', error.code, 'Retryable:', error.retryable);
  } else if (error instanceof DynamoDBError) {
    console.error('DynamoDB error:', error.message, 'Retryable:', error.retryable);
  }
}
\`\`\`

## TypeScript Support

The SDK is written in TypeScript and provides full type safety:

\`\`\`typescript
import { WrapsEmail, SendEmailParams, SendEmailResult } from '@wraps.dev/email';

const email = new WrapsEmail();
const params: SendEmailParams = {
  from: 'hello@yourdomain.com',
  to: 'user@example.com',
  subject: 'Test',
  html: '<p>Test</p>',
};
const result: SendEmailResult = await email.send(params);
\`\`\`

## SDK Defaults & Limits

- No automatic retry on failure — implement your own if \`retryable\` is true
- Default pagination: 50 items per page
- Presigned URL expiry: 1 hour
- Bulk send limit: 50 destinations per call
- Attachment limit: 100 per email (10 MB total message size)

## Resources

- npm: https://www.npmjs.com/package/@wraps.dev/email
- GitHub: https://github.com/wraps-team/wraps-js
`,

  "/docs/cli-reference": `# CLI Reference

The Wraps CLI deploys and manages communication infrastructure on AWS. Install via npx (no global install needed).

## Global Usage

\`\`\`bash
npx @wraps.dev/cli <service> <command> [options]
\`\`\`

## Services

| Service | Description |
|---------|-------------|
| \`email\` | AWS SES email infrastructure |
| \`sms\` | AWS End User Messaging SMS infrastructure |
| \`cdn\` | S3 + CloudFront CDN infrastructure |
| \`auth\` | OIDC authentication management |
| \`platform\` | Wraps Platform connection |

## Quick Reference

\`\`\`bash
# Email
npx @wraps.dev/cli email init                          # Deploy email stack
npx @wraps.dev/cli email status                        # Check deployment status
npx @wraps.dev/cli email destroy                       # Tear down all resources
npx @wraps.dev/cli email domains add -d domain.com     # Add domain to SES
npx @wraps.dev/cli email domains list                  # List domains
npx @wraps.dev/cli email domains verify -d domain.com  # Verify DNS records
npx @wraps.dev/cli email domains get-dkim -d domain.com # Get DKIM tokens
npx @wraps.dev/cli email domains remove -d domain.com  # Remove domain
npx @wraps.dev/cli email domains config                # Configure domain settings

# SMS
npx @wraps.dev/cli sms init     # Deploy SMS stack
npx @wraps.dev/cli sms status   # Check SMS deployment
npx @wraps.dev/cli sms destroy  # Tear down SMS resources

# CDN
npx @wraps.dev/cli cdn init     # Deploy CDN (S3 + CloudFront)
npx @wraps.dev/cli cdn status   # Check CDN deployment
npx @wraps.dev/cli cdn destroy  # Tear down CDN resources

# Dashboard
npx @wraps.dev/cli dashboard    # Open local analytics dashboard
\`\`\`

## Detailed References

- [Email Commands](https://wraps.dev/docs/cli-reference/email)
- [SMS Commands](https://wraps.dev/docs/cli-reference/sms)
- [CDN Commands](https://wraps.dev/docs/cli-reference/cdn)
- [Auth Commands](https://wraps.dev/docs/cli-reference/auth)
- [Platform Commands](https://wraps.dev/docs/cli-reference/platform)
`,

  "/docs/cli-reference/email": `# Email CLI Reference

Deploy and manage AWS SES email infrastructure with event tracking, analytics, and domain management.

## wraps email init

Deploy new email infrastructure to your AWS account.

\`\`\`bash
npx @wraps.dev/cli email init [options]
\`\`\`

Deploys: SES configuration set, DynamoDB event history table, Lambda processor, EventBridge rules, IAM roles with OIDC trust policies.

Interactive: prompts for AWS region, configuration preset (Starter / Production / Enterprise), and shows estimated monthly costs before deploying.

Options:
- \`--region <region>\` — AWS region (default: prompted)
- \`--preset <preset>\` — Configuration preset: \`starter\`, \`production\`, or \`enterprise\`
- \`--yes\` — Skip confirmation prompts

## wraps email status

Check the status of your deployed email infrastructure.

\`\`\`bash
npx @wraps.dev/cli email status
\`\`\`

Shows: deployment status, AWS region, SES configuration, DynamoDB table, Lambda function, EventBridge rules.

## wraps email destroy

Remove all Wraps email infrastructure from your AWS account.

\`\`\`bash
npx @wraps.dev/cli email destroy [options]
\`\`\`

Options:
- \`-f, --force\` — Skip confirmation prompt

Removes all \`wraps-email-*\` resources. Non-destructive to other AWS resources.

## wraps email domains

Manage domains in AWS SES.

### wraps email domains add

\`\`\`bash
npx @wraps.dev/cli email domains add -d <domain>
\`\`\`

Adds a domain to SES with DKIM signing enabled. Options: \`-d, --domain <domain>\` (required)

### wraps email domains list

\`\`\`bash
npx @wraps.dev/cli email domains list
\`\`\`

Lists all domains in SES with verification and DKIM status.

### wraps email domains get-dkim

\`\`\`bash
npx @wraps.dev/cli email domains get-dkim -d <domain>
\`\`\`

Retrieves DKIM CNAME records to add to your DNS provider. Options: \`-d, --domain <domain>\` (required)

### wraps email domains verify

\`\`\`bash
npx @wraps.dev/cli email domains verify -d <domain>
\`\`\`

Checks DNS verification status: SES domain status, DKIM records (3 CNAMEs), SPF TXT record, DMARC TXT record, MAIL FROM MX records. Provides copy-paste DNS record values.

### wraps email domains remove

\`\`\`bash
npx @wraps.dev/cli email domains remove -d <domain> [-f]
\`\`\`

Removes a domain from SES. Options: \`-d\` domain (required), \`-f\` skip confirmation.

### wraps email domains config

\`\`\`bash
npx @wraps.dev/cli email domains config [options]
\`\`\`

Configure SES configuration set options for a domain. Interactive menu or non-interactive via flags.

Options:
- \`-d, --domain <domain>\` — Domain to configure
- \`--opens / --no-opens\` — Open tracking
- \`--clicks / --no-clicks\` — Click tracking
- \`--tls-required / --no-tls-required\` — Require TLS delivery
- \`--sending-enabled / --no-sending-enabled\` — Enable/disable sending
- \`--reputation-metrics / --no-reputation-metrics\` — Reputation metrics
- \`--suppress-bounce / --no-suppress-bounce\` — Bounce suppression
- \`--suppress-complaint / --no-suppress-complaint\` — Complaint suppression
- \`--archive / --no-archive\` — Email archiving via Mail Manager
- \`--vdm-engagement / --no-vdm-engagement\` — VDM engagement tracking
- \`--vdm-inbox / --no-vdm-inbox\` — VDM inbox placement optimization

## wraps email inbound init

Deploy inbound email infrastructure (S3 receipt rules + EventBridge).

\`\`\`bash
npx @wraps.dev/cli email inbound init
\`\`\`

Prompts for webhook URL and creates EventBridge→HTTP rule with \`X-Wraps-Inbound-Key\` HMAC header.

## Global Options

- \`--help, -h\` — Show help
- \`--version, -v\` — Show version
`,

  "/docs/guides/domain-verification": `# Domain Verification

Verify your domain with AWS SES for reliable email delivery. Wraps automates DKIM setup; you add DNS records.

## Why Verify?

- Proves ownership of your sending domain to AWS SES
- Enables DKIM signing (improves deliverability and prevents spoofing)
- Required before sending in production (SES sandbox mode blocks unverified senders)
- Needed for SPF and DMARC alignment

## The Three Pillars of Email Auth

- **DKIM**: Cryptographic signature proving the email was sent from your domain
- **SPF**: Lists authorized mail servers for your domain (automatic with Wraps — SES handles it)
- **DMARC**: Policy telling receivers what to do with failed DKIM/SPF checks

## Step 1: Add Your Domain

\`\`\`bash
npx @wraps.dev/cli email domains add -d yourdomain.com
\`\`\`

## Step 2: Get DKIM Records

\`\`\`bash
npx @wraps.dev/cli email domains get-dkim -d yourdomain.com
\`\`\`

You'll get 3 CNAME records like:

\`\`\`
# Record 1
Name:  abc123._domainkey.yourdomain.com
Type:  CNAME
Value: abc123.dkim.amazonses.com

# Record 2
Name:  def456._domainkey.yourdomain.com
Type:  CNAME
Value: def456.dkim.amazonses.com

# Record 3
Name:  ghi789._domainkey.yourdomain.com
Type:  CNAME
Value: ghi789.dkim.amazonses.com
\`\`\`

Add all 3 to your DNS provider (Vercel, Cloudflare, Route53, etc.).

> **Note**: On Cloudflare, set the CNAME record to "DNS only" (not proxied).

## Step 3: Verify DNS Records

\`\`\`bash
npx @wraps.dev/cli email domains verify -d yourdomain.com
\`\`\`

DNS propagation takes up to 72 hours, but usually completes within 30 minutes.

## Step 4: SPF (Automatic)

SPF is configured automatically by SES. You don't need to add an SPF record manually — SES uses its own SPF alignment via the \`amazonses.com\` sending domain.

## Step 5: Add DMARC (Recommended)

\`\`\`bash
# Add this TXT record to your DNS
Name:  _dmarc.yourdomain.com
Type:  TXT
Value: v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com
\`\`\`

DMARC policy options:
- \`p=none\` — Monitor only (recommended to start)
- \`p=quarantine\` — Failed emails go to spam
- \`p=reject\` — Failed emails are rejected

## Verification Checklist

- [ ] Domain added to SES (\`domains add\`)
- [ ] 3 DKIM CNAME records added to DNS
- [ ] DNS records verified (\`domains verify\` shows all green)
- [ ] DMARC TXT record added

## Troubleshooting

- **DKIM not verifying**: DNS propagation can take up to 72 hours. Run \`domains verify\` again later.
- **Wrong record format**: Some providers auto-append your domain. Use only the subdomain prefix (e.g., \`abc123._domainkey\`, not \`abc123._domainkey.yourdomain.com\`).
- **Still in sandbox**: Request production access from the AWS SES console.

## Next Steps

- [Production Access Guide](https://wraps.dev/docs/guides/production-access)
- [Email SDK Reference](https://wraps.dev/docs/sdk-reference)
`,

  "/docs/guides/webhooks": `# Webhooks

Receive real-time notifications for email events (delivery, bounces, complaints, opens, clicks).

## Overview

Wraps uses AWS EventBridge to capture SES events and forward them to your webhook URL. Events include: Delivery, Bounce, Complaint, Open, Click, Send, Reject, Subscription.

Event flow: SES → EventBridge → Lambda → your webhook URL

## Prerequisites

- Email infrastructure deployed (\`wraps email init\`)
- An HTTPS URL that can receive POST requests
- Webhook secret stored in your environment

## Setup

Configure your webhook URL in the Wraps dashboard under **Settings → Webhooks → Add Webhook**. Enter your HTTPS URL and generate a webhook secret.

## Webhook Payload

Every event is a POST request with \`Content-Type: application/json\`:

\`\`\`json
{
  "event": "Delivery",
  "detail": {
    "delivery": {
      "timestamp": "2024-01-15T10:30:00.000Z",
      "processingTimeMillis": 1234,
      "recipients": ["user@example.com"],
      "smtpResponse": "250 2.0.0 OK",
      "reportingMTA": "a8-31.smtp-out.amazonses.com"
    },
    "mail": {
      "messageId": "abc-123-def",
      "source": "hello@yourapp.com",
      "destination": ["user@example.com"]
    }
  },
  "timestamp": "2024-01-15T10:30:00Z",
  "messageId": "abc-123-def",
  "source": "wraps"
}
\`\`\`

## Signature Verification

Every request includes an \`x-wraps-signature\` header. Always verify it:

\`\`\`typescript
import crypto from "crypto";

function verifySignature(req: Request, secret: string): boolean {
  const signature = req.headers.get("x-wraps-signature");
  if (!signature || !secret) return false;

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(secret)
  );
}
\`\`\`

## Example: Express.js Handler

\`\`\`typescript
import express from "express";
import crypto from "crypto";

const app = express();
app.use(express.json());

const WEBHOOK_SECRET = process.env.WRAPS_WEBHOOK_SECRET;

app.post("/webhooks/email", (req, res) => {
  const signature = req.headers["x-wraps-signature"];
  if (!signature || !crypto.timingSafeEqual(
    Buffer.from(signature as string),
    Buffer.from(WEBHOOK_SECRET!)
  )) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  const { event, messageId, detail } = req.body;

  switch (event) {
    case "Delivery":
      console.log(\`Email \${messageId} delivered\`);
      break;
    case "Bounce":
      console.log(\`Email \${messageId} bounced\`);
      // Remove from your list
      break;
    case "Complaint":
      console.log(\`Email \${messageId} complained\`);
      // Unsubscribe the user
      break;
  }

  res.json({ received: true });
});
\`\`\`

## Example: Next.js Route Handler

\`\`\`typescript
import crypto from "crypto";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const signature = request.headers.get("x-wraps-signature");
  const secret = process.env.WRAPS_WEBHOOK_SECRET!;

  if (!signature || !crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(secret)
  )) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const payload = await request.json();
  const { event, messageId } = payload;

  // Handle the event...
  console.log(\`Received \${event} for message \${messageId}\`);

  return NextResponse.json({ received: true });
}
\`\`\`

## Troubleshooting

- **No events received**: Check EventBridge rules are active (\`wraps email status\`)
- **Signature mismatch**: Ensure you're comparing the raw header value to your stored secret
- **Timeout errors**: Respond with 200 immediately, process async

## Next Steps

- [Email SDK Reference](https://wraps.dev/docs/sdk-reference)
- [Email Events API](https://wraps.dev/docs/sdk-reference#email-events)
`,
};
