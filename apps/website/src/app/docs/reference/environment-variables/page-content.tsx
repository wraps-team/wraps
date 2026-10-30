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

const githubActionsCode = `name: Deploy Email Infrastructure
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789012:role/github-actions
          aws-region: us-east-1
      - run: npx @wraps.dev/cli email init --yes --preset production`;

const vercelExampleCode = `# In Vercel project settings, add:
AWS_ROLE_ARN=arn:aws:iam::123456789012:role/wraps-email-role
# Vercel handles OIDC automatically — no access keys needed`;

// ============================================================================
// MARKDOWN CONTENT FOR AI COPY
// ============================================================================

const SECTION_MD = {
  wrapsConfig: `## Wraps Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| \`WRAPS_LOCAL_ONLY\` | Disable telemetry and API calls | \`false\` |
| \`WRAPS_API_KEY\` | API key for Wraps Platform | - |
| \`WRAPS_API_URL\` | Custom API endpoint | \`https://api.wraps.dev\` |
| \`WRAPS_APP_URL\` | Custom app/dashboard URL | \`https://app.wraps.dev\` |
| \`WRAPS_TELEMETRY_DISABLED\` | Disable anonymous telemetry | \`false\` |`,

  awsCredentials: `## AWS Credentials

| Variable | Description | Default |
|----------|-------------|---------|
| \`AWS_ACCESS_KEY_ID\` | AWS access key | - |
| \`AWS_SECRET_ACCESS_KEY\` | AWS secret key | - |
| \`AWS_SESSION_TOKEN\` | Temporary session token (for STS/SSO) | - |
| \`AWS_REGION\` | AWS region. Post-deploy commands auto-resolve from saved connection metadata when unset. | - |
| \`AWS_DEFAULT_REGION\` | Alternative to \`AWS_REGION\`; checked second. | - |
| \`AWS_PROFILE\` | Named AWS CLI profile | \`default\` |
| \`AWS_ROLE_ARN\` | IAM role ARN for OIDC assumption | - |`,

  dnsAutomation: `## DNS Automation

| Variable | Description | Default |
|----------|-------------|---------|
| \`CLOUDFLARE_API_TOKEN\` | Cloudflare API token for DNS automation | - |
| \`CLOUDFLARE_ZONE_ID\` | Cloudflare zone ID | - |
| \`VERCEL_TOKEN\` | Vercel API token for DNS automation | - |`,

  pulumiInternal: `## Pulumi (Internal)

| Variable | Description | Default |
|----------|-------------|---------|
| \`PULUMI_CONFIG_PASSPHRASE\` | Encryption passphrase for Pulumi state | Auto-generated |
| \`PULUMI_BACKEND_URL\` | Pulumi state backend URL | \`file://~/.wraps/pulumi\` |`,

  cicdExamples: `## CI/CD Examples

### GitHub Actions
\`\`\`yaml
${githubActionsCode}
\`\`\`

### Vercel
\`\`\`bash
${vercelExampleCode}
\`\`\``,
};

const FULL_PAGE_MD = `# Environment Variables

All environment variables used by the Wraps CLI and SDKs.

${SECTION_MD.wrapsConfig}

${SECTION_MD.awsCredentials}

${SECTION_MD.dnsAutomation}

${SECTION_MD.pulumiInternal}

${SECTION_MD.cicdExamples}
`;

const SLASH_COMMAND_MD = `---
description: Wraps environment variables reference - use this when configuring Wraps CLI or SDKs
---

${FULL_PAGE_MD}`;

// ============================================================================
// ENV TABLE COMPONENT
// ============================================================================

function EnvTable({
  rows,
}: {
  rows: { variable: string; description: string; defaultValue: string }[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="px-4 py-2 text-left font-medium">Variable</th>
            <th className="px-4 py-2 text-left font-medium">Description</th>
            <th className="px-4 py-2 text-left font-medium">Default</th>
          </tr>
        </thead>
        <tbody className="text-muted-foreground">
          {rows.map((row, i) => (
            <tr
              className={i < rows.length - 1 ? "border-b" : ""}
              key={row.variable}
            >
              <td className="px-4 py-2">
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                  {row.variable}
                </code>
              </td>
              <td className="px-4 py-2">{row.description}</td>
              <td className="px-4 py-2">
                {row.defaultValue === "-" ? (
                  <span className="text-muted-foreground">-</span>
                ) : (
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                    {row.defaultValue}
                  </code>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

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
          Environment Variables
        </h1>
        <p className="text-lg text-muted-foreground">
          All environment variables used by the Wraps CLI and SDKs.
        </p>
      </div>

      {/* Wraps Configuration */}
      <section className="mb-12">
        <SectionHeading
          className="mb-4"
          id="wraps-configuration"
          markdown={SECTION_MD.wrapsConfig}
          title="Wraps Configuration"
        />
        <p className="mb-4 text-muted-foreground">
          Control CLI behavior, telemetry, and API connectivity.
        </p>
        <Card>
          <CardContent className="p-0">
            <EnvTable
              rows={[
                {
                  variable: "WRAPS_LOCAL_ONLY",
                  description: "Disable telemetry and API calls",
                  defaultValue: "false",
                },
                {
                  variable: "WRAPS_API_KEY",
                  description: "API key for Wraps Platform",
                  defaultValue: "-",
                },
                {
                  variable: "WRAPS_API_URL",
                  description: "Custom API endpoint",
                  defaultValue: "https://api.wraps.dev",
                },
                {
                  variable: "WRAPS_APP_URL",
                  description: "Custom app/dashboard URL",
                  defaultValue: "https://app.wraps.dev",
                },
                {
                  variable: "WRAPS_TELEMETRY_DISABLED",
                  description: "Disable anonymous telemetry",
                  defaultValue: "false",
                },
              ]}
            />
          </CardContent>
        </Card>
      </section>

      {/* AWS Credentials */}
      <section className="mb-12">
        <SectionHeading
          className="mb-4"
          id="aws-credentials"
          markdown={SECTION_MD.awsCredentials}
          title="AWS Credentials"
        />
        <p className="mb-4 text-muted-foreground">
          Standard AWS environment variables for authentication. The CLI and
          SDKs use the default AWS credential chain, so these are only needed
          when not using AWS CLI profiles or IAM roles.
        </p>
        <Card>
          <CardContent className="p-0">
            <EnvTable
              rows={[
                {
                  variable: "AWS_ACCESS_KEY_ID",
                  description: "AWS access key",
                  defaultValue: "-",
                },
                {
                  variable: "AWS_SECRET_ACCESS_KEY",
                  description: "AWS secret key",
                  defaultValue: "-",
                },
                {
                  variable: "AWS_SESSION_TOKEN",
                  description: "Temporary session token (for STS/SSO)",
                  defaultValue: "-",
                },
                {
                  variable: "AWS_REGION",
                  description:
                    "AWS region. Post-deploy commands (upgrade, restore, doctor, etc.) auto-resolve from saved connection metadata when unset — the CLI only falls back to us-east-1 when no saved deployments are found.",
                  defaultValue: "-",
                },
                {
                  variable: "AWS_DEFAULT_REGION",
                  description:
                    "Alternative to AWS_REGION; checked second in the resolution chain.",
                  defaultValue: "-",
                },
                {
                  variable: "AWS_PROFILE",
                  description: "Named AWS CLI profile",
                  defaultValue: "default",
                },
                {
                  variable: "AWS_ROLE_ARN",
                  description: "IAM role ARN for OIDC assumption",
                  defaultValue: "-",
                },
              ]}
            />
          </CardContent>
        </Card>
      </section>

      {/* DNS Automation */}
      <section className="mb-12">
        <SectionHeading
          className="mb-4"
          id="dns-automation"
          markdown={SECTION_MD.dnsAutomation}
          title="DNS Automation"
        />
        <p className="mb-4 text-muted-foreground">
          Provide DNS provider credentials to enable automatic DNS record
          creation during domain verification.
        </p>
        <Card>
          <CardContent className="p-0">
            <EnvTable
              rows={[
                {
                  variable: "CLOUDFLARE_API_TOKEN",
                  description: "Cloudflare API token for DNS automation",
                  defaultValue: "-",
                },
                {
                  variable: "CLOUDFLARE_ZONE_ID",
                  description: "Cloudflare zone ID",
                  defaultValue: "-",
                },
                {
                  variable: "VERCEL_TOKEN",
                  description: "Vercel API token for DNS automation",
                  defaultValue: "-",
                },
              ]}
            />
          </CardContent>
        </Card>
      </section>

      {/* Pulumi (Internal) */}
      <section className="mb-12">
        <SectionHeading
          className="mb-4"
          id="pulumi-internal"
          markdown={SECTION_MD.pulumiInternal}
          title="Pulumi (Internal)"
        />
        <p className="mb-4 text-muted-foreground">
          These variables are managed automatically by the CLI. You should only
          override them if you have a custom Pulumi setup.
        </p>
        <Card>
          <CardContent className="p-0">
            <EnvTable
              rows={[
                {
                  variable: "PULUMI_CONFIG_PASSPHRASE",
                  description: "Encryption passphrase for Pulumi state",
                  defaultValue: "Auto-generated",
                },
                {
                  variable: "PULUMI_BACKEND_URL",
                  description: "Pulumi state backend URL",
                  defaultValue: "file://~/.wraps/pulumi",
                },
              ]}
            />
          </CardContent>
        </Card>
      </section>

      {/* CI/CD Examples */}
      <section className="mb-12">
        <SectionHeading
          className="mb-6"
          id="cicd-examples"
          markdown={SECTION_MD.cicdExamples}
          title="CI/CD Examples"
        />

        {/* GitHub Actions */}
        <div className="mb-6">
          <h3 className="mb-3 font-medium text-lg" id="github-actions">
            GitHub Actions
          </h3>
          <p className="mb-4 text-muted-foreground">
            Use OIDC federation to assume an IAM role without storing access
            keys.
          </p>
          <CodeBlock
            className="h-auto"
            data={[
              {
                language: "yaml",
                filename: ".github/workflows/deploy.yml",
                code: githubActionsCode,
              },
            ]}
            defaultValue="yaml"
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

        {/* Vercel */}
        <div className="mb-6">
          <h3 className="mb-3 font-medium text-lg" id="vercel">
            Vercel
          </h3>
          <p className="mb-4 text-muted-foreground">
            Vercel handles OIDC automatically when you set the role ARN. No
            access keys are needed.
          </p>
          <CodeBlock
            className="h-auto"
            data={[
              {
                language: "bash",
                filename: "Vercel Environment Variables",
                code: vercelExampleCode,
              },
            ]}
            defaultValue="bash"
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

      {/* Next Steps */}
      <section className="mb-12">
        <h2 className="mb-6 font-bold text-2xl">Next Steps</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="transition-colors hover:border-primary/50">
            <CardHeader>
              <CardTitle className="text-lg">AWS Setup</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-muted-foreground text-sm">
                Step-by-step guide for configuring AWS credentials and
                permissions for Wraps.
              </p>
              <Button asChild variant="outline">
                <Link href="/docs/guides/aws-setup">
                  View Guide
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="transition-colors hover:border-primary/50">
            <CardHeader>
              <CardTitle className="text-lg">Error Codes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-muted-foreground text-sm">
                Complete reference for all CLI error codes and SDK error classes
                with solutions.
              </p>
              <Button asChild variant="outline">
                <Link href="/docs/reference/errors">
                  View Reference
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
