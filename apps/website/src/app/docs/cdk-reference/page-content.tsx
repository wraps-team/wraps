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
  npm: "npm install @wraps.dev/cdk",
  pnpm: "pnpm add @wraps.dev/cdk",
  yarn: "yarn add @wraps.dev/cdk",
  bun: "bun add @wraps.dev/cdk",
};

const quickStartCode = `import { WrapsEmail } from "@wraps.dev/cdk";
import * as cdk from "aws-cdk-lib";

const app = new cdk.App();
const stack = new cdk.Stack(app, "EmailStack");

// Minimal setup with Vercel OIDC
const email = new WrapsEmail(stack, "Email", {
  vercel: {
    teamSlug: "my-team",
    projectName: "my-app",
  },
});

// Access outputs
console.log("Role ARN:", email.roleArn);
console.log("Config Set:", email.configSetName);`;

const withDomainCode = `const email = new WrapsEmail(stack, "Email", {
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

// DKIM records are output for DNS configuration
email.dkimRecords?.forEach((record, i) => {
  console.log(\`DKIM \${i + 1}: \${record.name} CNAME \${record.value}\`);
});`;

const fullConfigCode = `import * as cdk from "aws-cdk-lib";

const email = new WrapsEmail(stack, "Email", {
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
  hostedZoneId: "Z1234567890", // Auto-creates DNS records

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

  // CDK removal policy
  removalPolicy: cdk.RemovalPolicy.RETAIN,
});`;

const grantMethodsCode = `import * as lambda from "aws-cdk-lib/aws-lambda";

const email = new WrapsEmail(stack, "Email", { /* ... */ });

// Create a Lambda function
const myFunction = new lambda.Function(stack, "MyFunction", {
  runtime: lambda.Runtime.NODEJS_20_X,
  handler: "index.handler",
  code: lambda.Code.fromAsset("./lambda"),
});

// Grant send permissions
email.grantSend(myFunction);

// Grant read access to email history
email.grantReadHistory(myFunction);

// Grant access to consume events from SQS
email.grantConsumeEvents(myFunction);`;

const accessResourcesCode = `const email = new WrapsEmail(stack, "Email", { /* ... */ });

// Access CDK constructs via .resources
email.resources.role;           // iam.IRole
email.resources.configSet;      // ses.IConfigurationSet
email.resources.emailIdentity;  // ses.IEmailIdentity (if domain)
email.resources.table;          // dynamodb.ITable (if events.storeHistory)
email.resources.queue;          // sqs.IQueue (if events)
email.resources.dlq;            // sqs.IQueue (if events)
email.resources.eventProcessor; // lambda.IFunction (if events.storeHistory)
email.resources.oidcProvider;   // iam.IOpenIdConnectProvider (if OIDC)

// Example: Add custom policy to role
email.resources.role.addToPolicy(
  new iam.PolicyStatement({
    actions: ["ses:ListIdentities"],
    resources: ["*"],
  })
);`;

const githubActionsCode = `const email = new WrapsEmail(stack, "Email", {
  oidc: {
    providerUrl: "https://token.actions.githubusercontent.com",
    audience: "sts.amazonaws.com",
    subjectPattern: "repo:my-org/my-repo:*",
  },
  domain: "example.com",
});`;

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

Install the CDK package using your preferred package manager:

\`\`\`bash
pnpm add @wraps.dev/cdk
\`\`\`

Or use npm, yarn, or bun:
\`\`\`bash
npm install @wraps.dev/cdk
yarn add @wraps.dev/cdk
bun add @wraps.dev/cdk
\`\`\`

**Requirements:**
- Node.js 20+
- AWS CDK 2.x
- constructs 10.x`,

  quickStart: `## Quick Start

\`\`\`typescript
${quickStartCode}
\`\`\`

Outputs are automatically created as CloudFormation exports (WrapsEmailRoleArn, WrapsEmailConfigSetName, etc.)`,

  withDomain: `## With Domain and Event Tracking

\`\`\`typescript
${withDomainCode}
\`\`\``,

  fullConfig: `## Full Configuration

\`\`\`typescript
${fullConfigCode}
\`\`\``,

  props: `## Constructor Props

| Property | Type | Description |
|----------|------|-------------|
| \`vercel\` | VercelOIDCConfig | Vercel OIDC configuration (teamSlug, projectName) |
| \`oidc\` | OIDCConfig | Custom OIDC provider (GitHub Actions, GitLab, etc.) |
| \`domain\` | string | Primary sending domain with DKIM |
| \`hostedZoneId\` | string | Route53 zone ID for automatic DNS records |
| \`mailFromSubdomain\` | string | MAIL FROM subdomain (default: "mail") |
| \`tracking\` | TrackingConfig | Open/click tracking configuration |
| \`events\` | EventsConfig | Event tracking and history storage |
| \`archiving\` | ArchivingConfig | Email archiving via Mail Manager |
| \`smtp\` | SMTPConfig | SMTP credentials for legacy systems |
| \`suppressionList\` | SuppressionListConfig | Bounce/complaint suppression |
| \`autoValidation\` | AutoValidationConfig | SES Auto Validation on the configuration set (requires suppressionList.enabled) |
| \`reputationMetrics\` | boolean | Enable SES reputation metrics (default: true) |
| \`tlsRequired\` | boolean | Require TLS for outbound emails (default: false) |
| \`dedicatedIp\` | boolean | Enable dedicated IP (~$25/mo) |
| \`sendingEnabled\` | boolean | Enable sending (default: true) |
| \`removalPolicy\` | RemovalPolicy | CDK removal policy for stateful resources |`,

  outputs: `## Outputs

| Property | Type | Description |
|----------|------|-------------|
| \`roleArn\` | string | IAM role ARN for SDK authentication |
| \`configSetName\` | string | SES configuration set name |
| \`domain\` | string | Primary domain (if configured) |
| \`mailFromDomain\` | string | MAIL FROM domain (if configured) |
| \`dkimRecords\` | Array | DKIM CNAME records for DNS |
| \`tableName\` | string | DynamoDB table name (if history enabled) |
| \`queueUrl\` | string | SQS queue URL (if events enabled) |
| \`dlqUrl\` | string | SQS dead letter queue URL |
| \`smtpEndpoint\` | string | SMTP endpoint (if SMTP enabled) |`,

  grantMethods: `## Grant Methods

The construct provides CDK-style grant methods for easy IAM permission management:

\`\`\`typescript
${grantMethodsCode}
\`\`\`

### Available Grant Methods

| Method | Description |
|--------|-------------|
| \`grantSend(grantee)\` | Grant permissions to send emails |
| \`grantReadHistory(grantee)\` | Grant read access to email history table |
| \`grantConsumeEvents(grantee)\` | Grant access to consume events from SQS |`,

  accessResources: `## Accessing Underlying Resources

\`\`\`typescript
${accessResourcesCode}
\`\`\`

### Available Resources

| Property | Type | When Available |
|----------|------|----------------|
| \`role\` | iam.IRole | Always |
| \`oidcProvider\` | iam.IOpenIdConnectProvider | If Vercel or custom OIDC |
| \`configSet\` | ses.IConfigurationSet | Always |
| \`emailIdentity\` | ses.IEmailIdentity | If domain is provided |
| \`table\` | dynamodb.ITable | If events.storeHistory is true |
| \`queue\` | sqs.IQueue | If events is configured |
| \`dlq\` | sqs.IQueue | If events is configured |
| \`eventProcessor\` | lambda.IFunction | If events.storeHistory is true |
| \`smtpUser\` | iam.IUser | If smtp.enabled is true |`,

  githubActions: `## GitHub Actions OIDC

\`\`\`typescript
${githubActionsCode}
\`\`\``,

  usingSdk: `## Using with @wraps.dev/email SDK

After deploying, use the @wraps.dev/email SDK to send emails:

\`\`\`typescript
${usingSdkCode}
\`\`\``,
};

const FULL_PAGE_MD = `# @wraps.dev/cdk Reference

AWS CDK construct for deploying Wraps email infrastructure to your AWS account. Zero credentials stored, full AWS ownership, sensible defaults.

${SECTION_MD.installation}

${SECTION_MD.quickStart}

${SECTION_MD.withDomain}

${SECTION_MD.fullConfig}

${SECTION_MD.props}

${SECTION_MD.outputs}

${SECTION_MD.grantMethods}

${SECTION_MD.accessResources}

${SECTION_MD.githubActions}

${SECTION_MD.usingSdk}

## Resources

- npm: https://www.npmjs.com/package/@wraps.dev/cdk
- GitHub: https://github.com/wraps-team/wraps
- AWS CDK: https://docs.aws.amazon.com/cdk/
`;

const SLASH_COMMAND_MD = `---
description: Wraps CDK reference - use this when helping users deploy Wraps email infrastructure with AWS CDK
---

${FULL_PAGE_MD}`;

export default function CDKReferencePageContent() {
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
          CDK Reference
        </Badge>
        <h1 className="mb-4 font-bold text-4xl tracking-tight">
          @wraps.dev/cdk
        </h1>
        <p className="text-lg text-muted-foreground">
          AWS CDK construct for deploying Wraps email infrastructure to your AWS
          account. Zero credentials stored, full AWS ownership, sensible
          defaults.
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
            <strong>Requirements:</strong> Node.js 20+, AWS CDK 2.x, constructs
            10.x
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
              filename: "email-stack.ts",
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
        <p className="mt-4 text-muted-foreground text-sm">
          Outputs are automatically created as CloudFormation exports
          (WrapsEmailRoleArn, WrapsEmailConfigSetName, etc.)
        </p>
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

      {/* Constructor Props */}
      <section className="mb-12">
        <SectionHeading
          className="mb-4"
          id="props"
          markdown={SECTION_MD.props}
          title="Constructor Props"
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
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      hostedZoneId
                    </code>
                  </td>
                  <td className="py-2">string</td>
                  <td className="py-2">
                    Route53 zone ID for automatic DNS records
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
                      suppressionList
                    </code>
                  </td>
                  <td className="py-2">SuppressionListConfig</td>
                  <td className="py-2">Bounce/complaint suppression</td>
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
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      tlsRequired
                    </code>
                  </td>
                  <td className="py-2">boolean</td>
                  <td className="py-2">
                    Require TLS for outbound emails (default: false)
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      sendingEnabled
                    </code>
                  </td>
                  <td className="py-2">boolean</td>
                  <td className="py-2">Enable sending (default: true)</td>
                </tr>
                <tr>
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      removalPolicy
                    </code>
                  </td>
                  <td className="py-2">RemovalPolicy</td>
                  <td className="py-2">
                    CDK removal policy for stateful resources
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
                  <td className="py-2">string</td>
                  <td className="py-2">IAM role ARN for SDK authentication</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      configSetName
                    </code>
                  </td>
                  <td className="py-2">string</td>
                  <td className="py-2">SES configuration set name</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      domain
                    </code>
                  </td>
                  <td className="py-2">string</td>
                  <td className="py-2">Primary domain (if configured)</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      dkimRecords
                    </code>
                  </td>
                  <td className="py-2">Array</td>
                  <td className="py-2">DKIM CNAME records for DNS</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      tableName
                    </code>
                  </td>
                  <td className="py-2">string</td>
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
                  <td className="py-2">string</td>
                  <td className="py-2">SQS queue URL (if events enabled)</td>
                </tr>
                <tr>
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      smtpEndpoint
                    </code>
                  </td>
                  <td className="py-2">string</td>
                  <td className="py-2">SMTP endpoint (if SMTP enabled)</td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
      </section>

      {/* Grant Methods */}
      <section className="mb-12">
        <SectionHeading
          className="mb-4"
          id="grant-methods"
          markdown={SECTION_MD.grantMethods}
          title="Grant Methods"
        />
        <p className="mb-4 text-muted-foreground">
          The construct provides CDK-style grant methods for easy IAM permission
          management.
        </p>
        <CodeBlock
          className="mb-4 h-auto"
          data={[
            {
              language: "typescript",
              filename: "grants.ts",
              code: grantMethodsCode,
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
            <h4 className="mb-3 font-medium">Available Grant Methods</h4>
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
                      grantSend(grantee)
                    </code>
                  </td>
                  <td className="py-2">Grant permissions to send emails</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      grantReadHistory(grantee)
                    </code>
                  </td>
                  <td className="py-2">
                    Grant read access to email history table
                  </td>
                </tr>
                <tr>
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      grantConsumeEvents(grantee)
                    </code>
                  </td>
                  <td className="py-2">
                    Grant access to consume events from SQS
                  </td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
      </section>

      {/* Access Resources */}
      <section className="mb-12">
        <SectionHeading
          className="mb-4"
          id="access-resources"
          markdown={SECTION_MD.accessResources}
          title="Accessing Underlying Resources"
        />
        <CodeBlock
          className="mb-4 h-auto"
          data={[
            {
              language: "typescript",
              filename: "resources.ts",
              code: accessResourcesCode,
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
            <h4 className="mb-3 font-medium">Available Resources</h4>
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
                  <td className="py-2">iam.IRole</td>
                  <td className="py-2">Always</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      oidcProvider
                    </code>
                  </td>
                  <td className="py-2">iam.IOpenIdConnectProvider</td>
                  <td className="py-2">If Vercel or custom OIDC</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      configSet
                    </code>
                  </td>
                  <td className="py-2">ses.IConfigurationSet</td>
                  <td className="py-2">Always</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      emailIdentity
                    </code>
                  </td>
                  <td className="py-2">ses.IEmailIdentity</td>
                  <td className="py-2">If domain is provided</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      table
                    </code>
                  </td>
                  <td className="py-2">dynamodb.ITable</td>
                  <td className="py-2">If events.storeHistory is true</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      queue
                    </code>
                  </td>
                  <td className="py-2">sqs.IQueue</td>
                  <td className="py-2">If events is configured</td>
                </tr>
                <tr>
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      eventProcessor
                    </code>
                  </td>
                  <td className="py-2">lambda.IFunction</td>
                  <td className="py-2">If events.storeHistory is true</td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
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
                  href="https://www.npmjs.com/package/@wraps.dev/cdk"
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
              <CardTitle className="text-lg">AWS CDK Docs</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-muted-foreground text-sm">
                Learn more about AWS CDK and infrastructure as code.
              </p>
              <Button asChild variant="outline">
                <a
                  href="https://docs.aws.amazon.com/cdk/"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  CDK Docs
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
