"use client";

import { Badge } from "@wraps/ui/components/ui/badge";
import { Button } from "@wraps/ui/components/ui/button";
import { Card, CardContent } from "@wraps/ui/components/ui/card";
import { ArrowLeft, ArrowRight } from "lucide-react";
import Link from "next/link";
import { CLICommand } from "@/components/docs/cli-command";
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

// ============================================================================
// CODE EXAMPLES
// ============================================================================

const envelopeTypeCode = `type JsonOutput = {
  success: boolean;
  command: string;        // e.g. "email.status"
  data?: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
    suggestion?: string;
    docsUrl?: string;
  };
};`;

const usageExamplesCode = `# Basic usage
wraps email status --json

# Pipe to jq
wraps email status --json | jq .data.region

# Non-interactive deployment
wraps email init --domain example.com --preset production --yes --json

# CI/CD error handling
wraps email init --json || echo "Deploy failed"`;

const successResponseCode = `{
  "success": true,
  "command": "email.status",
  "data": {
    "integrationLevel": "full",
    "region": "us-east-1",
    "domains": ["example.com"],
    "resources": {
      "configSetName": "wraps-email-tracking",
      "roleArn": "arn:aws:iam::123456789012:role/wraps-email-role"
    },
    "tracking": {
      "enabled": true,
      "events": ["SEND", "DELIVERY", "OPEN", "CLICK", "BOUNCE", "COMPLAINT"]
    }
  }
}`;

const errorResponseCode = `{
  "success": false,
  "command": "email.init",
  "error": {
    "code": "NO_AWS_CREDENTIALS",
    "message": "AWS credentials not found",
    "suggestion": "Run: aws configure or aws sso login",
    "docsUrl": "https://wraps.dev/docs/guides/aws-setup"
  }
}`;

const destructiveCommandCode = `# This will error in JSON mode without --force
wraps email destroy --json
# Error: "--force flag is required in JSON mode"

# Correct usage
wraps email destroy --force --json`;

// ============================================================================
// MARKDOWN CONTENT FOR AI COPY
// ============================================================================

const SECTION_MD = {
  envelope: `## Envelope Format

Every JSON response follows a standardized envelope format:

\`\`\`typescript
${envelopeTypeCode}
\`\`\`

- \`success\`: Always present. \`true\` for successful operations, \`false\` for errors.
- \`command\`: Dot-notation identifier for the command (e.g. \`email.status\`, \`sms.init\`).
- \`data\`: Present on success. Contains command-specific output fields.
- \`error\`: Present on failure. Contains structured error details.`,

  usage: `## Usage

\`\`\`bash
${usageExamplesCode}
\`\`\``,

  emailCommands: `## Email Commands

| Command | \`command\` | Key \`data\` fields |
|---|---|---|
| \`email init\` | \`email.init\` | \`roleArn\`, \`configSetName\`, \`region\`, \`domain\`, \`dkimTokens\` |
| \`email status\` | \`email.status\` | \`integrationLevel\`, \`region\`, \`domains\`, \`resources\`, \`tracking\` |
| \`email connect\` | \`email.connect\` | \`roleArn\`, \`configSetName\`, \`region\` |
| \`email check\` | \`email.check\` | Full deliverability check result (SPF, DKIM, DMARC, scores) |
| \`email test\` | \`email.test\` | \`messageId\`, \`from\`, \`to\` |
| \`email upgrade\` | \`email.upgrade\` | \`upgraded\`, \`region\`, deployment outputs |
| \`email destroy\` | \`email.destroy\` | \`destroyed\`, \`region\` |
| \`email config\` | \`email.config\` | \`updated\`, \`region\` |
| \`email restore\` | \`email.restore\` | \`restored\`, \`region\` |
| \`email domains add\` | \`email.domains.add\` | \`domain\`, \`dkimTokens\`, \`trackingDomain\`, \`trackingDomainApplied\` |
| \`email domains list\` | \`email.domains.list\` | \`domains[]\` |
| \`email domains verify\` | \`email.domains.verify\` | \`domain\`, \`verified\` |
| \`email domains get-dkim\` | \`email.domains.get-dkim\` | \`domain\`, \`dkimTokens\` |
| \`email domains remove\` | \`email.domains.remove\` | \`domain\`, \`removed\` |
| \`email inbound init\` | \`email.inbound.init\` | \`receivingDomain\`, \`bucketName\` |
| \`email inbound status\` | \`email.inbound.status\` | \`enabled\`, \`receivingDomain\`, \`bucketName\` |
| \`email inbound verify\` | \`email.inbound.verify\` | \`verified\`, \`receivingDomain\` |
| \`email inbound test\` | \`email.inbound.test\` | \`messageId\`, \`receivingDomain\` |
| \`email inbound destroy\` | \`email.inbound.destroy\` | \`destroyed\` |
| \`email templates init\` | \`email.templates.init\` | \`initialized\`, \`directory\` |
| \`email templates push\` | \`email.templates.push\` | \`pushed\`, \`templates[]\` |
| \`email workflows push\` | \`email.workflows.push\` | \`pushed\`, \`workflows[]\` |
| \`email workflows validate\` | \`email.workflows.validate\` | \`valid\`, \`errors[]\` |`,

  smsCommands: `## SMS Commands

| Command | \`command\` | Key \`data\` fields |
|---|---|---|
| \`sms init\` | \`sms.init\` | \`roleArn\`, \`region\`, \`phoneNumber\` |
| \`sms status\` | \`sms.status\` | \`region\`, \`phoneNumber\`, \`phoneNumberType\`, \`configSetName\` |
| \`sms test\` | \`sms.test\` | \`messageId\`, \`to\` |
| \`sms destroy\` | \`sms.destroy\` | \`destroyed\`, \`region\` |
| \`sms sync\` | \`sms.sync\` | \`synced\`, \`region\` |
| \`sms upgrade\` | \`sms.upgrade\` | \`upgraded\`, \`region\` |
| \`sms verify-number\` | \`sms.verify-number\` | \`phoneNumber\`, \`verified\` |
| \`sms register\` | \`sms.register\` | \`registrationId\`, \`status\` |`,

  cdnCommands: `## CDN Commands

| Command | \`command\` | Key \`data\` fields |
|---|---|---|
| \`cdn init\` | \`cdn.init\` | \`bucketName\`, \`region\`, \`distributionId\`, \`distributionDomain\` |
| \`cdn status\` | \`cdn.status\` | \`bucketName\`, \`region\`, \`distributionId\`, \`distributionDomain\`, \`customDomain\` |
| \`cdn sync\` | \`cdn.sync\` | \`synced\`, \`region\` |
| \`cdn verify\` | \`cdn.verify\` | \`verified\`, \`domain\` |
| \`cdn destroy\` | \`cdn.destroy\` | \`destroyed\`, \`region\` |
| \`cdn upgrade\` | \`cdn.upgrade\` | \`upgraded\`, \`region\` |`,

  authPlatformCommands: `## Auth & Platform Commands

| Command | \`command\` | Key \`data\` fields |
|---|---|---|
| \`auth login\` | \`auth.login\` | \`authenticated\`, \`tokenType\` |
| \`auth status\` | \`auth.status\` | \`authenticated\`, \`user\` |
| \`auth logout\` | \`auth.logout\` | \`loggedOut\` |
| \`aws doctor\` | \`aws.doctor\` | \`checks[]\`, \`summary\`, \`suggestions\` |
| \`platform connect\` | \`platform.connect\` | \`accountId\`, \`connectionId\` |
| \`platform update-role\` | \`platform.update-role\` | \`updated\`, \`roleArn\` |
| \`permissions\` | \`permissions\` | \`policy\` (IAM policy document) |`,

  errorHandling: `## Error Handling

Errors follow the same envelope format:

\`\`\`json
${errorResponseCode}
\`\`\`

- Exit code is non-zero on error (script-friendly).
- Error codes match the ones in the Error Codes reference page.
- \`suggestion\` and \`docsUrl\` provide actionable guidance.`,

  destructiveCommands: `## Destructive Commands

Destructive commands (\`destroy\`) require the \`--force\` flag in JSON mode to prevent accidental deletion:

\`\`\`bash
${destructiveCommandCode}
\`\`\``,
};

const FULL_PAGE_MD = `# JSON Output Reference

Machine-readable output for every CLI command. Add \`--json\` to any command for structured output that AI agents, CI pipelines, and scripts can parse.

${SECTION_MD.envelope}

${SECTION_MD.usage}

${SECTION_MD.emailCommands}

${SECTION_MD.smsCommands}

${SECTION_MD.cdnCommands}

${SECTION_MD.authPlatformCommands}

${SECTION_MD.errorHandling}

${SECTION_MD.destructiveCommands}
`;

const SLASH_COMMAND_MD = `---
description: Wraps CLI JSON output reference - use this when integrating Wraps CLI into scripts, CI/CD, or AI agents
---

${FULL_PAGE_MD}`;

// ============================================================================
// COMMAND TABLE COMPONENT
// ============================================================================

function CommandTable({
  rows,
}: {
  rows: { cli: string; command: string; dataFields: string }[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="px-4 py-2 text-left font-medium">Command</th>
            <th className="px-4 py-2 text-left font-medium">
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                command
              </code>
            </th>
            <th className="px-4 py-2 text-left font-medium">
              Key{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                data
              </code>{" "}
              fields
            </th>
          </tr>
        </thead>
        <tbody className="text-muted-foreground">
          {rows.map((row, i) => (
            <tr
              className={i < rows.length - 1 ? "border-b" : ""}
              key={row.command}
            >
              <td className="px-4 py-2 whitespace-nowrap">
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                  {row.cli}
                </code>
              </td>
              <td className="px-4 py-2 whitespace-nowrap">
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                  {row.command}
                </code>
              </td>
              <td className="px-4 py-2">
                <code className="text-xs">{row.dataFields}</code>
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
          Reference / JSON Output
        </Badge>
        <h1 className="mb-4 font-bold text-4xl tracking-tight">JSON Output</h1>
        <p className="text-lg text-muted-foreground">
          Machine-readable output for every CLI command. Add{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">--json</code> to any
          command for structured output that AI agents, CI pipelines, and
          scripts can parse.
        </p>
      </div>

      {/* Envelope Format */}
      <section className="mb-12">
        <SectionHeading
          className="mb-4"
          id="envelope-format"
          markdown={SECTION_MD.envelope}
          title="Envelope Format"
        />
        <p className="mb-4 text-muted-foreground">
          Every JSON response follows a standardized envelope. Both success and
          error responses share the same top-level structure, making it easy to
          handle any command output programmatically.
        </p>

        <CodeBlock
          className="mb-6 h-auto"
          data={[
            {
              language: "typescript",
              filename: "types.ts",
              code: envelopeTypeCode,
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

        <div className="space-y-3">
          <Card>
            <CardContent className="p-4">
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
                          success
                        </code>
                      </td>
                      <td className="px-4 py-2">boolean</td>
                      <td className="px-4 py-2">
                        Always present.{" "}
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                          true
                        </code>{" "}
                        for successful operations,{" "}
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                          false
                        </code>{" "}
                        for errors.
                      </td>
                    </tr>
                    <tr className="border-b">
                      <td className="px-4 py-2">
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                          command
                        </code>
                      </td>
                      <td className="px-4 py-2">string</td>
                      <td className="px-4 py-2">
                        Dot-notation identifier for the command (e.g.{" "}
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                          email.status
                        </code>
                        ,{" "}
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                          sms.init
                        </code>
                        ).
                      </td>
                    </tr>
                    <tr className="border-b">
                      <td className="px-4 py-2">
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                          data
                        </code>
                      </td>
                      <td className="px-4 py-2">object | undefined</td>
                      <td className="px-4 py-2">
                        Present on success. Contains command-specific output
                        fields.
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2">
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                          error
                        </code>
                      </td>
                      <td className="px-4 py-2">object | undefined</td>
                      <td className="px-4 py-2">
                        Present on failure. Contains structured error details
                        with code, message, and optional suggestion.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Success Response Example */}
      <section className="mb-12">
        <h3 className="mb-4 font-medium text-lg" id="success-response">
          Success Response Example
        </h3>
        <CodeBlock
          className="h-auto"
          data={[
            {
              language: "json",
              filename: "response.json",
              code: successResponseCode,
            },
          ]}
          defaultValue="json"
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

      {/* Usage */}
      <section className="mb-12">
        <SectionHeading
          className="mb-4"
          id="usage"
          markdown={SECTION_MD.usage}
          title="Usage"
        />
        <p className="mb-4 text-muted-foreground">
          Add the <code className="rounded bg-muted px-1.5 py-0.5">--json</code>{" "}
          flag to any command. When active, all interactive prompts are
          suppressed and output is written as a single JSON object to stdout.
          Logs and spinners are sent to stderr so they do not interfere with
          JSON parsing.
        </p>
        <CLICommand command={usageExamplesCode} />
      </section>

      {/* Email Commands */}
      <section className="mb-12">
        <SectionHeading
          className="mb-6"
          id="email-commands"
          markdown={SECTION_MD.emailCommands}
          title="Email Commands"
        />

        <div className="mb-8">
          <h3 className="mb-3 font-medium text-lg" id="email-core">
            Core Commands
          </h3>
          <Card>
            <CardContent className="p-0">
              <CommandTable
                rows={[
                  {
                    cli: "email init",
                    command: "email.init",
                    dataFields:
                      "roleArn, configSetName, region, domain, dkimTokens",
                  },
                  {
                    cli: "email status",
                    command: "email.status",
                    dataFields:
                      "integrationLevel, region, domains, resources, tracking",
                  },
                  {
                    cli: "email connect",
                    command: "email.connect",
                    dataFields: "roleArn, configSetName, region",
                  },
                  {
                    cli: "email check",
                    command: "email.check",
                    dataFields:
                      "Full deliverability result (SPF, DKIM, DMARC, scores)",
                  },
                  {
                    cli: "email test",
                    command: "email.test",
                    dataFields: "messageId, from, to",
                  },
                  {
                    cli: "email upgrade",
                    command: "email.upgrade",
                    dataFields: "upgraded, region, deployment outputs",
                  },
                  {
                    cli: "email destroy",
                    command: "email.destroy",
                    dataFields: "destroyed, region",
                  },
                  {
                    cli: "email config",
                    command: "email.config",
                    dataFields: "updated, region",
                  },
                  {
                    cli: "email restore",
                    command: "email.restore",
                    dataFields: "restored, region",
                  },
                ]}
              />
            </CardContent>
          </Card>
        </div>

        <div className="mb-8">
          <h3 className="mb-3 font-medium text-lg" id="email-domains">
            Domain Commands
          </h3>
          <Card>
            <CardContent className="p-0">
              <CommandTable
                rows={[
                  {
                    cli: "email domains add",
                    command: "email.domains.add",
                    dataFields: "domain, dkimTokens",
                  },
                  {
                    cli: "email domains list",
                    command: "email.domains.list",
                    dataFields: "domains[]",
                  },
                  {
                    cli: "email domains verify",
                    command: "email.domains.verify",
                    dataFields: "domain, verified",
                  },
                  {
                    cli: "email domains get-dkim",
                    command: "email.domains.get-dkim",
                    dataFields: "domain, dkimTokens",
                  },
                  {
                    cli: "email domains remove",
                    command: "email.domains.remove",
                    dataFields: "domain, removed",
                  },
                ]}
              />
            </CardContent>
          </Card>
        </div>

        <div className="mb-8">
          <h3 className="mb-3 font-medium text-lg" id="email-inbound">
            Inbound Commands
          </h3>
          <Card>
            <CardContent className="p-0">
              <CommandTable
                rows={[
                  {
                    cli: "email inbound init",
                    command: "email.inbound.init",
                    dataFields: "receivingDomain, bucketName",
                  },
                  {
                    cli: "email inbound status",
                    command: "email.inbound.status",
                    dataFields: "enabled, receivingDomain, bucketName",
                  },
                  {
                    cli: "email inbound verify",
                    command: "email.inbound.verify",
                    dataFields: "verified, receivingDomain",
                  },
                  {
                    cli: "email inbound test",
                    command: "email.inbound.test",
                    dataFields: "messageId, receivingDomain",
                  },
                  {
                    cli: "email inbound destroy",
                    command: "email.inbound.destroy",
                    dataFields: "destroyed",
                  },
                ]}
              />
            </CardContent>
          </Card>
        </div>

        <div className="mb-8">
          <h3 className="mb-3 font-medium text-lg" id="email-templates">
            Templates & Workflows
          </h3>
          <Card>
            <CardContent className="p-0">
              <CommandTable
                rows={[
                  {
                    cli: "email templates init",
                    command: "email.templates.init",
                    dataFields: "initialized, directory",
                  },
                  {
                    cli: "email templates push",
                    command: "email.templates.push",
                    dataFields: "pushed, templates[]",
                  },
                  {
                    cli: "email workflows push",
                    command: "email.workflows.push",
                    dataFields: "pushed, workflows[]",
                  },
                  {
                    cli: "email workflows validate",
                    command: "email.workflows.validate",
                    dataFields: "valid, errors[]",
                  },
                ]}
              />
            </CardContent>
          </Card>
        </div>
      </section>

      {/* SMS Commands */}
      <section className="mb-12">
        <SectionHeading
          className="mb-6"
          id="sms-commands"
          markdown={SECTION_MD.smsCommands}
          title="SMS Commands"
        />
        <Card>
          <CardContent className="p-0">
            <CommandTable
              rows={[
                {
                  cli: "sms init",
                  command: "sms.init",
                  dataFields: "roleArn, region, phoneNumber",
                },
                {
                  cli: "sms status",
                  command: "sms.status",
                  dataFields:
                    "region, phoneNumber, phoneNumberType, configSetName",
                },
                {
                  cli: "sms test",
                  command: "sms.test",
                  dataFields: "messageId, to",
                },
                {
                  cli: "sms destroy",
                  command: "sms.destroy",
                  dataFields: "destroyed, region",
                },
                {
                  cli: "sms sync",
                  command: "sms.sync",
                  dataFields: "synced, region",
                },
                {
                  cli: "sms upgrade",
                  command: "sms.upgrade",
                  dataFields: "upgraded, region",
                },
                {
                  cli: "sms verify-number",
                  command: "sms.verify-number",
                  dataFields: "phoneNumber, verified",
                },
                {
                  cli: "sms register",
                  command: "sms.register",
                  dataFields: "registrationId, status",
                },
              ]}
            />
          </CardContent>
        </Card>
      </section>

      {/* CDN Commands */}
      <section className="mb-12">
        <SectionHeading
          className="mb-6"
          id="cdn-commands"
          markdown={SECTION_MD.cdnCommands}
          title="CDN Commands"
        />
        <Card>
          <CardContent className="p-0">
            <CommandTable
              rows={[
                {
                  cli: "cdn init",
                  command: "cdn.init",
                  dataFields:
                    "bucketName, region, distributionId, distributionDomain",
                },
                {
                  cli: "cdn status",
                  command: "cdn.status",
                  dataFields:
                    "bucketName, region, distributionId, distributionDomain, customDomain",
                },
                {
                  cli: "cdn sync",
                  command: "cdn.sync",
                  dataFields: "synced, region",
                },
                {
                  cli: "cdn verify",
                  command: "cdn.verify",
                  dataFields: "verified, domain",
                },
                {
                  cli: "cdn destroy",
                  command: "cdn.destroy",
                  dataFields: "destroyed, region",
                },
                {
                  cli: "cdn upgrade",
                  command: "cdn.upgrade",
                  dataFields: "upgraded, region",
                },
              ]}
            />
          </CardContent>
        </Card>
      </section>

      {/* Auth & Platform Commands */}
      <section className="mb-12">
        <SectionHeading
          className="mb-6"
          id="auth-platform-commands"
          markdown={SECTION_MD.authPlatformCommands}
          title="Auth & Platform Commands"
        />
        <Card>
          <CardContent className="p-0">
            <CommandTable
              rows={[
                {
                  cli: "auth login",
                  command: "auth.login",
                  dataFields: "authenticated, tokenType",
                },
                {
                  cli: "auth status",
                  command: "auth.status",
                  dataFields: "authenticated, user",
                },
                {
                  cli: "auth logout",
                  command: "auth.logout",
                  dataFields: "loggedOut",
                },
                {
                  cli: "aws doctor",
                  command: "aws.doctor",
                  dataFields: "checks[], summary, suggestions",
                },
                {
                  cli: "platform connect",
                  command: "platform.connect",
                  dataFields: "accountId, connectionId",
                },
                {
                  cli: "platform update-role",
                  command: "platform.update-role",
                  dataFields: "updated, roleArn",
                },
                {
                  cli: "permissions",
                  command: "permissions",
                  dataFields: "policy (IAM policy document)",
                },
              ]}
            />
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
          Errors follow the same envelope format. The process exit code is
          non-zero on failure, so scripts can use standard shell error handling.
          Error codes match the ones documented in the{" "}
          <a
            className="text-primary underline underline-offset-4"
            href="/docs/reference/errors"
          >
            Error Codes reference
          </a>
          .
        </p>

        <CodeBlock
          className="mb-6 h-auto"
          data={[
            {
              language: "json",
              filename: "error-response.json",
              code: errorResponseCode,
            },
          ]}
          defaultValue="json"
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
          <CardContent className="p-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="px-4 py-2 text-left font-medium">
                      Error Field
                    </th>
                    <th className="px-4 py-2 text-left font-medium">
                      Description
                    </th>
                  </tr>
                </thead>
                <tbody className="text-muted-foreground">
                  <tr className="border-b">
                    <td className="px-4 py-2">
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                        code
                      </code>
                    </td>
                    <td className="px-4 py-2">
                      Machine-readable error identifier (e.g.{" "}
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                        NO_AWS_CREDENTIALS
                      </code>
                      ). Matches codes in the Error Codes reference.
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2">
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                        message
                      </code>
                    </td>
                    <td className="px-4 py-2">
                      Human-readable error description.
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2">
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                        suggestion
                      </code>
                    </td>
                    <td className="px-4 py-2">
                      Optional. Actionable fix or next step the user can take.
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2">
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                        docsUrl
                      </code>
                    </td>
                    <td className="px-4 py-2">
                      Optional. Link to relevant documentation for further
                      guidance.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Destructive Commands */}
      <section className="mb-12">
        <SectionHeading
          className="mb-4"
          id="destructive-commands"
          markdown={SECTION_MD.destructiveCommands}
          title="Destructive Commands"
        />
        <p className="mb-4 text-muted-foreground">
          Destructive commands (
          <code className="rounded bg-muted px-1.5 py-0.5">destroy</code>)
          require the{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">--force</code> flag
          when used with{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">--json</code>. This
          prevents accidental deletion in automated pipelines where interactive
          confirmation is not available.
        </p>
        <CLICommand command={destructiveCommandCode} />
      </section>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button asChild variant="outline">
          <Link href="/docs/reference/errors">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Error Codes
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/docs/reference/environment-variables">
            Environment Variables
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </DocsLayout>
  );
}
