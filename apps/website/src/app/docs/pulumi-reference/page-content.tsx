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
import {
  Snippet,
  SnippetCopyButton,
  SnippetHeader,
  SnippetTabsContent,
  SnippetTabsList,
  SnippetTabsTrigger,
} from "@/components/ui/shadcn-io/snippet";

const installCommands = {
  npm: "npm install @wraps.dev/pulumi",
  pnpm: "pnpm add @wraps.dev/pulumi",
  yarn: "yarn add @wraps.dev/pulumi",
  bun: "bun add @wraps.dev/pulumi",
};

const quickStartCode = `import { WrapsEmail } from "@wraps.dev/pulumi";

// Minimal setup with Vercel OIDC
const email = new WrapsEmail("email", {
  vercel: {
    teamSlug: "my-team",
    projectName: "my-app",
  },
});

// Export the role ARN for your Vercel environment
export const roleArn = email.roleArn;
export const configSetName = email.configSetName;
export const envVars = email.envVars;`;

const withDomainCode = `const email = new WrapsEmail("email", {
  vercel: {
    teamSlug: "my-team",
    projectName: "my-app",
  },
  domain: "example.com",
  events: {
    types: ["SEND", "DELIVERY", "BOUNCE", "COMPLAINT", "OPEN", "CLICK"],
    storeHistory: true,
    retention: "90days",
  },
});

// Export DKIM tokens for DNS configuration
export const dkimTokens = email.dkimTokens;`;

const fullConfigCode = `const email = new WrapsEmail("email", {
  // Authentication (choose one)
  vercel: {
    teamSlug: "my-team",
    projectName: "my-app",
  },
  // Or custom OIDC:
  // oidc: {
  //   providerUrl: "https://token.actions.githubusercontent.com",
  //   audience: "sts.amazonaws.com",
  //   subjectPattern: "repo:my-org/my-repo:*",
  // },

  // Domain configuration
  domain: "example.com",
  mailFromSubdomain: "mail", // Creates mail.example.com

  // DNS provider (auto-creates DNS records)
  dns: {
    provider: "route53",
    hostedZoneId: "Z1234567890",
  },
  // Or Cloudflare:
  // dns: { provider: "cloudflare", zoneId: "abc123", apiToken: pulumi.secret("token") },

  // Event tracking
  events: {
    types: ["SEND", "DELIVERY", "BOUNCE", "COMPLAINT", "OPEN", "CLICK"],
    storeHistory: true,
    retention: "90days", // "7days" | "30days" | "90days" | "6months" | "1year" | "unlimited"
  },

  // Email settings
  reputationMetrics: true,
  tlsRequired: false,
  sendingEnabled: true,

  // Suppression list
  suppressionList: {
    enabled: true,
    reasons: ["BOUNCE", "COMPLAINT"],
  },

  // SMTP credentials (for legacy systems)
  smtp: {
    enabled: false,
  },

  // Resource tags
  tags: {
    Environment: "production",
  },

  // Transform underlying resources
  transform: {
    table: (args) => ({
      ...args,
      billingMode: "PROVISIONED",
    }),
  },
});`;

const transformCode = `const email = new WrapsEmail("email", {
  vercel: { teamSlug: "my-team", projectName: "my-app" },
  domain: "example.com",
  events: { types: ["SEND"], storeHistory: true },

  // Transform underlying Pulumi resources before creation
  transform: {
    // Customize IAM role
    role: (args) => ({
      ...args,
      maxSessionDuration: 7200, // 2 hours
    }),

    // Customize DynamoDB table
    table: (args) => ({
      ...args,
      billingMode: "PROVISIONED",
      readCapacity: 5,
      writeCapacity: 5,
    }),

    // Customize SQS queue
    queue: (args) => ({
      ...args,
      visibilityTimeoutSeconds: 120,
    }),

    // Customize Lambda function
    lambda: (args) => ({
      ...args,
      memorySize: 1024,
      timeout: 60,
    }),

    // Customize CloudFront distribution
    distribution: (args) => ({
      ...args,
      priceClass: "PriceClass_100", // US/Europe only
    }),
  },
});`;

const accessNodesCode = `const email = new WrapsEmail("email", { /* ... */ });

// Access raw Pulumi resources via .nodes
email.nodes.role;           // aws.iam.Role
email.nodes.configSet;      // aws.ses.ConfigurationSet
email.nodes.domainIdentity; // aws.ses.DomainIdentity (if domain)
email.nodes.domainDkim;     // aws.ses.DomainDkim (if domain)
email.nodes.table;          // aws.dynamodb.Table (if events.storeHistory)
email.nodes.queue;          // aws.sqs.Queue (if events)
email.nodes.dlq;            // aws.sqs.Queue (if events)
email.nodes.lambda;         // aws.lambda.Function (if events.storeHistory)
email.nodes.eventRule;      // aws.cloudwatch.EventRule (if events)
email.nodes.oidcProvider;   // aws.iam.OpenIdConnectProvider (if OIDC)
email.nodes.distribution;   // aws.cloudfront.Distribution (if HTTPS tracking)

// Example: Add custom policy to role
const customPolicy = new aws.iam.RolePolicy("custom", {
  role: email.nodes.role.name,
  policy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [{
      Action: ["ses:ListIdentities"],
      Effect: "Allow",
      Resource: "*",
    }],
  }),
});`;

const githubActionsCode = `const email = new WrapsEmail("email", {
  oidc: {
    providerUrl: "https://token.actions.githubusercontent.com",
    audience: "sts.amazonaws.com",
    subjectPattern: "repo:my-org/my-repo:*",
  },
  domain: "example.com",
});`;

const dnsProvidersCode = `// Route53 (automatic DNS records)
const emailRoute53 = new WrapsEmail("email", {
  domain: "example.com",
  dns: {
    provider: "route53",
    hostedZoneId: "Z1234567890",
  },
});

// Cloudflare
const emailCloudflare = new WrapsEmail("email", {
  domain: "example.com",
  dns: {
    provider: "cloudflare",
    zoneId: "abc123def456",
    apiToken: pulumi.secret(process.env.CLOUDFLARE_API_TOKEN!),
  },
});

// Vercel DNS
const emailVercel = new WrapsEmail("email", {
  domain: "example.com",
  dns: {
    provider: "vercel",
    apiToken: pulumi.secret(process.env.VERCEL_TOKEN!),
    teamId: "team_xxx",
  },
});`;

const envVarsCode = `const email = new WrapsEmail("email", { /* ... */ });

// Convenience output for environment variables
export const envVars = email.envVars;

// Returns:
// {
//   WRAPS_AWS_ROLE_ARN: "arn:aws:iam::123456789:role/wraps-email-role",
//   WRAPS_AWS_REGION: "us-east-1",
//   WRAPS_CONFIG_SET: "wraps-email-tracking",
// }`;

const usingSdkCode = `import { WrapsEmail } from "@wraps.dev/email";

const email = new WrapsEmail();

await email.send({
  from: "hello@example.com",
  to: "user@example.com",
  subject: "Hello from Wraps!",
  html: "<h1>Welcome!</h1>",
});`;

// ============================================================================
// MARKDOWN CONTENT FOR AI COPY
// ============================================================================

const SECTION_MD = {
  installation: `## Installation

Install the Pulumi package using your preferred package manager:

\`\`\`bash
pnpm add @wraps.dev/pulumi
\`\`\`

Or use npm, yarn, or bun:
\`\`\`bash
npm install @wraps.dev/pulumi
yarn add @wraps.dev/pulumi
bun add @wraps.dev/pulumi
\`\`\`

**Requirements:**
- Node.js 20+
- Pulumi 3.x
- @pulumi/aws 6.x or 7.x`,

  quickStart: `## Quick Start

\`\`\`typescript
${quickStartCode}
\`\`\``,

  withDomain: `## With Domain and Event Tracking

\`\`\`typescript
${withDomainCode}
\`\`\``,

  fullConfig: `## Full Configuration

\`\`\`typescript
${fullConfigCode}
\`\`\``,

  args: `## Constructor Args

| Property | Type | Description |
|----------|------|-------------|
| \`vercel\` | VercelOIDCConfig | Vercel OIDC configuration (teamSlug, projectName) |
| \`oidc\` | OIDCConfig | Custom OIDC provider (GitHub Actions, GitLab, etc.) |
| \`domain\` | string | Primary sending domain with DKIM |
| \`dns\` | DNSConfig | DNS provider for automatic record creation |
| \`mailFromSubdomain\` | string | MAIL FROM subdomain (default: "mail") |
| \`tracking\` | TrackingConfig | Open/click tracking configuration |
| \`events\` | EventsConfig | Event tracking and history storage |
| \`archiving\` | ArchivingConfig | Email archiving via Mail Manager |
| \`smtp\` | SMTPConfig | SMTP credentials for legacy systems |
| \`suppressionList\` | SuppressionListConfig | Bounce/complaint suppression |
| \`autoValidation\` | AutoValidationConfig | SES Auto Validation on the configuration set (requires suppressionList.enabled) |
| \`reputationMetrics\` | boolean | Enable SES reputation metrics (default: true) |
| \`tlsRequired\` | boolean | Require TLS for outbound emails (default: false) |
| \`dedicatedIp\` | boolean | Deprecated — has no effect; no dedicated IP is provisioned |
| \`managedDedicatedIps\` | boolean | Route sending through an SES managed dedicated IP pool (wraps-email-managed). Included on SES Pro/Enterprise; add-on otherwise (default: false) |
| \`sendingEnabled\` | boolean | Enable sending (default: true) |
| \`tags\` | Record<string, string> | Tags to apply to all resources |
| \`transform\` | TransformFunctions | Transform functions for resource customization |`,

  outputs: `## Outputs

| Property | Type | Description |
|----------|------|-------------|
| \`roleArn\` | Output<string> | IAM role ARN for SDK authentication |
| \`region\` | Output<string> | AWS region |
| \`configSetName\` | Output<string> | SES configuration set name |
| \`domain\` | Output<string> | Primary domain (if configured) |
| \`dkimTokens\` | Output<string[]> | DKIM tokens for DNS configuration |
| \`mailFromDomain\` | Output<string> | MAIL FROM domain (if configured) |
| \`tableName\` | Output<string> | DynamoDB table name (if history enabled) |
| \`queueUrl\` | Output<string> | SQS queue URL (if events enabled) |
| \`dlqUrl\` | Output<string> | SQS dead letter queue URL |
| \`lambdaArn\` | Output<string> | Lambda function ARN |
| \`smtpUsername\` | Output<string> | SMTP username (if SMTP enabled) |
| \`smtpPassword\` | Output<string> | SMTP password (if SMTP enabled) |
| \`smtpEndpoint\` | Output<string> | SMTP endpoint (if SMTP enabled) |
| \`envVars\` | Output<object> | Environment variables for your app |`,

  transform: `## Transform Functions

Transform functions let you customize underlying Pulumi resources before creation. Each function receives the default resource args and returns modified args.

\`\`\`typescript
${transformCode}
\`\`\`

### Available Transform Functions

| Function | Resource Type | When Available |
|----------|---------------|----------------|
| \`role\` | aws.iam.RoleArgs | Always |
| \`oidcProvider\` | aws.iam.OpenIdConnectProviderArgs | If OIDC configured |
| \`configSet\` | aws.ses.ConfigurationSetArgs | Always |
| \`domainIdentity\` | aws.ses.DomainIdentityArgs | If domain configured |
| \`table\` | aws.dynamodb.TableArgs | If events.storeHistory |
| \`queue\` | aws.sqs.QueueArgs | If events configured |
| \`dlq\` | aws.sqs.QueueArgs | If events configured |
| \`lambda\` | aws.lambda.FunctionArgs | If events.storeHistory |
| \`eventRule\` | aws.cloudwatch.EventRuleArgs | If events configured |
| \`certificate\` | aws.acm.CertificateArgs | If HTTPS tracking |
| \`distribution\` | aws.cloudfront.DistributionArgs | If HTTPS tracking |`,

  accessNodes: `## Accessing Underlying Resources

\`\`\`typescript
${accessNodesCode}
\`\`\`

### Available Nodes

| Property | Type | When Available |
|----------|------|----------------|
| \`role\` | aws.iam.Role | Always |
| \`oidcProvider\` | aws.iam.OpenIdConnectProvider | If OIDC configured |
| \`configSet\` | aws.ses.ConfigurationSet | Always |
| \`domainIdentity\` | aws.ses.DomainIdentity | If domain configured |
| \`domainDkim\` | aws.ses.DomainDkim | If domain configured |
| \`table\` | aws.dynamodb.Table | If events.storeHistory |
| \`queue\` | aws.sqs.Queue | If events configured |
| \`dlq\` | aws.sqs.Queue | If events configured |
| \`lambda\` | aws.lambda.Function | If events.storeHistory |
| \`eventRule\` | aws.cloudwatch.EventRule | If events configured |
| \`distribution\` | aws.cloudfront.Distribution | If HTTPS tracking |
| \`smtpUser\` | aws.iam.User | If SMTP enabled |
| \`smtpAccessKey\` | aws.iam.AccessKey | If SMTP enabled |`,

  dnsProviders: `## DNS Providers

\`\`\`typescript
${dnsProvidersCode}
\`\`\``,

  githubActions: `## GitHub Actions OIDC

\`\`\`typescript
${githubActionsCode}
\`\`\``,

  envVars: `## Environment Variables Output

\`\`\`typescript
${envVarsCode}
\`\`\``,

  usingSdk: `## Using with @wraps.dev/email SDK

After deploying, use the @wraps.dev/email SDK to send emails:

\`\`\`typescript
${usingSdkCode}
\`\`\``,

  cliGaps: `## Differences from \`npx @wraps.dev/cli email init\`

This library and the CLI both deploy the same email stack, but they are two independent implementations, not one codebase with two entry points. They are not identical. This section states the differences plainly, not as a case for either one.

### IAM permissions on the deployed role (wraps-email-role)

| Grant | CLI (email init) | This library |
|---|---|---|
| Suppression list management (ListSuppressedDestinations, GetSuppressedDestination, PutSuppressedDestination, DeleteSuppressedDestination) | Yes | No |
| ses:GetSendQuota | No | Yes |
| cloudwatch:ListMetrics | No | Yes |

Sending, DynamoDB history access, EventBridge, SQS, and Mail Manager archive access are granted identically by both.

### No replay archive, no delivery-failure alarm

The CLI path creates a 30-day EventBridge archive (wraps-email-events-archive) of every raw SES event, so a broken pipeline can be repaired and replayed instead of losing events, plus a CloudWatch alarm on EventBridge delivery failures. This library creates neither. The [BYOC page](/byoc) describes the event pipeline's replay path. That description is accurate for the CLI, not for this library.

### No inbound email

The CLI supports receiving email (wraps email inbound init): an S3 bucket, a receiving Lambda, and an EventBridge rule for inbound mail. This library has no equivalent resources at all.

### What CI checks, and what it does not

Nothing in this monorepo depends on this package, so no build or test run here exercises it against the CLI's actual behavior. A small set of guards keeps the two from drifting on the values that are supposed to be identical: physical resource names, the default SES event-type set, and the EventBridge rule's event pattern. Those guards do not cover IAM statement shape or feature coverage. The differences on this page are not something a test enforces.`,
};

const FULL_PAGE_MD = `# @wraps.dev/pulumi Reference

Pulumi component for deploying Wraps email infrastructure to your AWS account. Zero credentials stored, full AWS ownership, SST-style API with transform functions.

${SECTION_MD.installation}

${SECTION_MD.quickStart}

${SECTION_MD.withDomain}

${SECTION_MD.fullConfig}

${SECTION_MD.args}

${SECTION_MD.outputs}

${SECTION_MD.transform}

${SECTION_MD.accessNodes}

${SECTION_MD.dnsProviders}

${SECTION_MD.githubActions}

${SECTION_MD.envVars}

${SECTION_MD.usingSdk}

${SECTION_MD.cliGaps}

## Resources

- npm: https://www.npmjs.com/package/@wraps.dev/pulumi
- GitHub: https://github.com/wraps-team/wraps
- Pulumi: https://www.pulumi.com/docs/
`;

const SLASH_COMMAND_MD = `---
description: Wraps Pulumi reference - use this when helping users deploy Wraps email infrastructure with Pulumi
---

${FULL_PAGE_MD}`;

export default function PulumiReferencePageContent() {
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
          Pulumi Reference
        </Badge>
        <h1 className="mb-4 font-bold text-4xl tracking-tight">
          @wraps.dev/pulumi
        </h1>
        <p className="text-lg text-muted-foreground">
          Pulumi component for deploying Wraps email infrastructure to your AWS
          account. Zero credentials stored, full AWS ownership, SST-style API
          with transform functions.
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
        <div className="mt-4 text-muted-foreground text-sm">
          <p>
            <strong>Requirements:</strong> Node.js 20+, Pulumi 3.x, @pulumi/aws
            6.x or 7.x
          </p>
        </div>
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
              filename: "index.ts",
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

      {/* With Domain */}
      <section className="mb-12">
        <SectionHeading
          className="mb-4"
          id="with-domain"
          markdown={SECTION_MD.withDomain}
          title="With Domain and Event Tracking"
        />
        <CodeBlock
          className="h-auto"
          data={[
            {
              language: "typescript",
              filename: "with-domain.ts",
              code: withDomainCode,
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

      {/* Full Configuration */}
      <section className="mb-12">
        <SectionHeading
          className="mb-4"
          id="full-config"
          markdown={SECTION_MD.fullConfig}
          title="Full Configuration"
        />
        <CodeBlock
          className="h-auto"
          data={[
            {
              language: "typescript",
              filename: "full-config.ts",
              code: fullConfigCode,
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

      {/* Constructor Args */}
      <section className="mb-12">
        <SectionHeading
          className="mb-4"
          id="args"
          markdown={SECTION_MD.args}
          title="Constructor Args"
        />
        <Card>
          <CardContent className="p-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="pb-2 text-left">Property</th>
                  <th className="pb-2 text-left">Type</th>
                  <th className="pb-2 text-left">Description</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      vercel
                    </code>
                  </td>
                  <td className="py-2">VercelOIDCConfig</td>
                  <td className="py-2">
                    Vercel OIDC configuration (teamSlug, projectName)
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">oidc</code>
                  </td>
                  <td className="py-2">OIDCConfig</td>
                  <td className="py-2">
                    Custom OIDC provider (GitHub Actions, GitLab, etc.)
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      domain
                    </code>
                  </td>
                  <td className="py-2">string</td>
                  <td className="py-2">Primary sending domain with DKIM</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">dns</code>
                  </td>
                  <td className="py-2">DNSConfig</td>
                  <td className="py-2">
                    DNS provider for automatic record creation
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      mailFromSubdomain
                    </code>
                  </td>
                  <td className="py-2">string</td>
                  <td className="py-2">
                    MAIL FROM subdomain (default: &quot;mail&quot;)
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      events
                    </code>
                  </td>
                  <td className="py-2">EventsConfig</td>
                  <td className="py-2">Event tracking and history storage</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">smtp</code>
                  </td>
                  <td className="py-2">SMTPConfig</td>
                  <td className="py-2">SMTP credentials for legacy systems</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      reputationMetrics
                    </code>
                  </td>
                  <td className="py-2">boolean</td>
                  <td className="py-2">
                    Enable SES reputation metrics (default: true)
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">tags</code>
                  </td>
                  <td className="py-2">{"Record<string, string>"}</td>
                  <td className="py-2">Tags to apply to all resources</td>
                </tr>
                <tr>
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      transform
                    </code>
                  </td>
                  <td className="py-2">TransformFunctions</td>
                  <td className="py-2">
                    Transform functions for resource customization
                  </td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
      </section>

      {/* Outputs */}
      <section className="mb-12">
        <SectionHeading
          className="mb-4"
          id="outputs"
          markdown={SECTION_MD.outputs}
          title="Outputs"
        />
        <Card>
          <CardContent className="p-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="pb-2 text-left">Property</th>
                  <th className="pb-2 text-left">Type</th>
                  <th className="pb-2 text-left">Description</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      roleArn
                    </code>
                  </td>
                  <td className="py-2">{"Output<string>"}</td>
                  <td className="py-2">IAM role ARN for SDK authentication</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      region
                    </code>
                  </td>
                  <td className="py-2">{"Output<string>"}</td>
                  <td className="py-2">AWS region</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      configSetName
                    </code>
                  </td>
                  <td className="py-2">{"Output<string>"}</td>
                  <td className="py-2">SES configuration set name</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      dkimTokens
                    </code>
                  </td>
                  <td className="py-2">{"Output<string[]>"}</td>
                  <td className="py-2">DKIM tokens for DNS configuration</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      tableName
                    </code>
                  </td>
                  <td className="py-2">{"Output<string>"}</td>
                  <td className="py-2">
                    DynamoDB table name (if history enabled)
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      queueUrl
                    </code>
                  </td>
                  <td className="py-2">{"Output<string>"}</td>
                  <td className="py-2">SQS queue URL (if events enabled)</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      smtpUsername
                    </code>
                  </td>
                  <td className="py-2">{"Output<string>"}</td>
                  <td className="py-2">SMTP username (if SMTP enabled)</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      smtpPassword
                    </code>
                  </td>
                  <td className="py-2">{"Output<string>"}</td>
                  <td className="py-2">SMTP password (if SMTP enabled)</td>
                </tr>
                <tr>
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      envVars
                    </code>
                  </td>
                  <td className="py-2">{"Output<object>"}</td>
                  <td className="py-2">Environment variables for your app</td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
      </section>

      {/* Transform Functions */}
      <section className="mb-12">
        <SectionHeading
          className="mb-4"
          id="transform"
          markdown={SECTION_MD.transform}
          title="Transform Functions"
        />
        <p className="mb-4 text-muted-foreground">
          Transform functions let you customize underlying Pulumi resources
          before creation. Each function receives the default resource args and
          returns modified args.
        </p>
        <CodeBlock
          className="mb-4 h-auto"
          data={[
            {
              language: "typescript",
              filename: "transform.ts",
              code: transformCode,
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
            <h4 className="mb-3 font-medium">Available Transform Functions</h4>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="pb-2 text-left">Function</th>
                  <th className="pb-2 text-left">Resource Type</th>
                  <th className="pb-2 text-left">When Available</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">role</code>
                  </td>
                  <td className="py-2">aws.iam.RoleArgs</td>
                  <td className="py-2">Always</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      oidcProvider
                    </code>
                  </td>
                  <td className="py-2">aws.iam.OpenIdConnectProviderArgs</td>
                  <td className="py-2">If OIDC configured</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      configSet
                    </code>
                  </td>
                  <td className="py-2">aws.ses.ConfigurationSetArgs</td>
                  <td className="py-2">Always</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      table
                    </code>
                  </td>
                  <td className="py-2">aws.dynamodb.TableArgs</td>
                  <td className="py-2">If events.storeHistory</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      queue
                    </code>
                  </td>
                  <td className="py-2">aws.sqs.QueueArgs</td>
                  <td className="py-2">If events configured</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      lambda
                    </code>
                  </td>
                  <td className="py-2">aws.lambda.FunctionArgs</td>
                  <td className="py-2">If events.storeHistory</td>
                </tr>
                <tr>
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      distribution
                    </code>
                  </td>
                  <td className="py-2">aws.cloudfront.DistributionArgs</td>
                  <td className="py-2">If HTTPS tracking</td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
      </section>

      {/* Access Nodes */}
      <section className="mb-12">
        <SectionHeading
          className="mb-4"
          id="access-nodes"
          markdown={SECTION_MD.accessNodes}
          title="Accessing Underlying Resources"
        />
        <p className="mb-4 text-muted-foreground">
          Access the underlying Pulumi resources via the{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">.nodes</code>{" "}
          property for advanced customization.
        </p>
        <CodeBlock
          className="mb-4 h-auto"
          data={[
            {
              language: "typescript",
              filename: "nodes.ts",
              code: accessNodesCode,
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
            <h4 className="mb-3 font-medium">Available Nodes</h4>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="pb-2 text-left">Property</th>
                  <th className="pb-2 text-left">Type</th>
                  <th className="pb-2 text-left">When Available</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">role</code>
                  </td>
                  <td className="py-2">aws.iam.Role</td>
                  <td className="py-2">Always</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      oidcProvider
                    </code>
                  </td>
                  <td className="py-2">aws.iam.OpenIdConnectProvider</td>
                  <td className="py-2">If OIDC configured</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      configSet
                    </code>
                  </td>
                  <td className="py-2">aws.ses.ConfigurationSet</td>
                  <td className="py-2">Always</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      domainIdentity
                    </code>
                  </td>
                  <td className="py-2">aws.ses.DomainIdentity</td>
                  <td className="py-2">If domain configured</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      table
                    </code>
                  </td>
                  <td className="py-2">aws.dynamodb.Table</td>
                  <td className="py-2">If events.storeHistory</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      queue
                    </code>
                  </td>
                  <td className="py-2">aws.sqs.Queue</td>
                  <td className="py-2">If events configured</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      lambda
                    </code>
                  </td>
                  <td className="py-2">aws.lambda.Function</td>
                  <td className="py-2">If events.storeHistory</td>
                </tr>
                <tr>
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      distribution
                    </code>
                  </td>
                  <td className="py-2">aws.cloudfront.Distribution</td>
                  <td className="py-2">If HTTPS tracking</td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
      </section>

      {/* DNS Providers */}
      <section className="mb-12">
        <SectionHeading
          className="mb-4"
          id="dns-providers"
          markdown={SECTION_MD.dnsProviders}
          title="DNS Providers"
        />
        <p className="mb-4 text-muted-foreground">
          Automatically create DNS records with your preferred provider.
        </p>
        <CodeBlock
          className="h-auto"
          data={[
            {
              language: "typescript",
              filename: "dns-providers.ts",
              code: dnsProvidersCode,
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

      {/* GitHub Actions OIDC */}
      <section className="mb-12">
        <SectionHeading
          className="mb-4"
          id="github-actions"
          markdown={SECTION_MD.githubActions}
          title="GitHub Actions OIDC"
        />
        <p className="mb-4 text-muted-foreground">
          Use custom OIDC configuration for GitHub Actions or other providers.
        </p>
        <CodeBlock
          className="h-auto"
          data={[
            {
              language: "typescript",
              filename: "github-actions.ts",
              code: githubActionsCode,
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

      {/* Environment Variables */}
      <section className="mb-12">
        <SectionHeading
          className="mb-4"
          id="env-vars"
          markdown={SECTION_MD.envVars}
          title="Environment Variables Output"
        />
        <p className="mb-4 text-muted-foreground">
          Convenience output for environment variables to configure your
          application.
        </p>
        <CodeBlock
          className="h-auto"
          data={[
            {
              language: "typescript",
              filename: "env-vars.ts",
              code: envVarsCode,
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

      {/* Using with SDK */}
      <section className="mb-12">
        <SectionHeading
          className="mb-4"
          id="using-sdk"
          markdown={SECTION_MD.usingSdk}
          title="Using with @wraps.dev/email SDK"
        />
        <p className="mb-4 text-muted-foreground">
          After deploying, use the @wraps.dev/email SDK to send emails:
        </p>
        <CodeBlock
          className="h-auto"
          data={[
            {
              language: "typescript",
              filename: "send-email.ts",
              code: usingSdkCode,
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

      {/* Differences from the CLI */}
      <section className="mb-12">
        <SectionHeading
          className="mb-4"
          id="cli-differences"
          markdown={SECTION_MD.cliGaps}
          title="Differences from the CLI"
        />
        <p className="mb-6 text-muted-foreground">
          This library and{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">
            npx @wraps.dev/cli email init
          </code>{" "}
          both deploy the same email stack, but they are two independent
          implementations, not one codebase with two entry points. They are not
          identical. This section states the differences plainly, not as a case
          for either one.
        </p>

        <h3 className="mb-3 font-medium text-lg">
          IAM permissions on the deployed role (
          <code className="rounded bg-muted px-1.5 py-0.5">
            wraps-email-role
          </code>
          )
        </h3>
        <Card className="mb-4">
          <CardContent className="p-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="pb-2 text-left">Grant</th>
                  <th className="pb-2 text-left">CLI (email init)</th>
                  <th className="pb-2 text-left">This library</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b">
                  <td className="py-2">
                    Suppression list management (
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      ListSuppressedDestinations
                    </code>
                    ,{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      GetSuppressedDestination
                    </code>
                    ,{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      PutSuppressedDestination
                    </code>
                    ,{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      DeleteSuppressedDestination
                    </code>
                    )
                  </td>
                  <td className="py-2">Yes</td>
                  <td className="py-2">No</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      ses:GetSendQuota
                    </code>
                  </td>
                  <td className="py-2">No</td>
                  <td className="py-2">Yes</td>
                </tr>
                <tr>
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      cloudwatch:ListMetrics
                    </code>
                  </td>
                  <td className="py-2">No</td>
                  <td className="py-2">Yes</td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
        <p className="mb-6 text-muted-foreground text-sm">
          Sending, DynamoDB history access, EventBridge, SQS, and Mail Manager
          archive access are granted identically by both.
        </p>

        <div className="mb-6 rounded-lg border-brand border-l-4 bg-brand/10 p-4">
          <h3 className="mb-2 font-medium">
            No replay archive, no delivery-failure alarm
          </h3>
          <p className="text-muted-foreground text-sm">
            The CLI path creates a 30-day EventBridge archive (
            <code className="rounded bg-muted px-1 py-0.5">
              wraps-email-events-archive
            </code>
            ) of every raw SES event, so a broken pipeline can be repaired and
            replayed instead of losing events, plus a CloudWatch alarm on
            EventBridge delivery failures. This library creates neither. The{" "}
            <Link className="text-brand underline" href="/byoc">
              BYOC page
            </Link>{" "}
            describes the event pipeline&apos;s replay path. That description is
            accurate for the CLI, not for this library.
          </p>
        </div>

        <div className="mb-6">
          <h3 className="mb-2 font-medium">No inbound email</h3>
          <p className="text-muted-foreground text-sm">
            The CLI supports receiving email (
            <code className="rounded bg-muted px-1 py-0.5">
              wraps email inbound init
            </code>
            ): an S3 bucket, a receiving Lambda, and an EventBridge rule for
            inbound mail. This library has no equivalent resources at all.
          </p>
        </div>

        <div>
          <h3 className="mb-2 font-medium">
            What CI checks, and what it does not
          </h3>
          <p className="text-muted-foreground text-sm">
            Nothing in this monorepo depends on this package, so no build or
            test run here exercises it against the CLI&apos;s actual behavior. A
            small set of guards keeps the two from drifting on the values that
            are supposed to be identical: physical resource names, the default
            SES event-type set, and the EventBridge rule&apos;s event pattern.
            Those guards do not cover IAM statement shape or feature coverage.
            The differences on this page are not something a test enforces.
          </p>
        </div>
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
                  href="https://www.npmjs.com/package/@wraps.dev/pulumi"
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
              <CardTitle className="text-lg">Email SDK</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-muted-foreground text-sm">
                Learn how to send emails with the @wraps.dev/email SDK.
              </p>
              <Button asChild variant="outline">
                <Link href="/docs/sdk-reference">
                  SDK Reference
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="transition-colors hover:border-primary/50">
            <CardHeader>
              <CardTitle className="text-lg">Pulumi Docs</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-muted-foreground text-sm">
                Learn more about Pulumi and infrastructure as code.
              </p>
              <Button asChild variant="outline">
                <a
                  href="https://www.pulumi.com/docs/"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Pulumi Docs
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
