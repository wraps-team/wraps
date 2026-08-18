"use client";

import { Badge } from "@wraps/ui/components/ui/badge";
import { Button } from "@wraps/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import { AlertTriangle, ArrowRight } from "lucide-react";
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

const retryPatternCode = `import { WrapsEmail, SESError } from '@wraps.dev/email';

const email = new WrapsEmail();

async function sendWithRetry(params, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await email.send(params);
    } catch (error) {
      if (error instanceof SESError && error.retryable && attempt < maxRetries - 1) {
        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
        continue;
      }
      throw error;
    }
  }
}`;

const errorHandlingCode = `import { WrapsEmail, SESError, DynamoDBError, ValidationError } from '@wraps.dev/email';

const email = new WrapsEmail();

try {
  await email.send({
    from: 'hello@yourdomain.com',
    to: 'user@example.com',
    subject: 'Hello',
    html: '<p>Hello!</p>',
  });
} catch (error) {
  if (error instanceof ValidationError) {
    console.error('Invalid input:', error.field, error.message);
  } else if (error instanceof SESError) {
    console.error('SES error:', error.code, error.retryable);
  } else if (error instanceof DynamoDBError) {
    console.error('DynamoDB error:', error.code, error.retryable);
  }
}`;

const jsonErrorEnvelopeCode = `{
  "success": false,
  "command": "email.init",
  "error": {
    "code": "<one of the CLI error codes below>",
    "message": "...",
    "suggestion": "...",
    "docsUrl": "https://wraps.dev/docs/..."
  }
}`;

// ============================================================================
// MARKDOWN CONTENT FOR AI COPY
// ============================================================================

type ErrorRow = { code: string; message: string; solution: string };
type ErrorSection = { id: string; title: string; rows: ErrorRow[] };

// Source of truth: the second argument to every `new WrapsError(...)` call
// across packages/cli/src, plus the UNKNOWN_ERROR JSON-mode fallback in
// handleCLIError (errors.ts:364). Re-extract with the CLI source if this
// page ever drifts — see apps/website/src/__tests__/cli-error-codes.test.ts.
const CLI_ERROR_SECTIONS: ErrorSection[] = [
  {
    id: "credentials-session",
    title: "Credentials & Session",
    rows: [
      {
        code: "NO_AWS_CREDENTIALS",
        message: "AWS credentials not found",
        solution:
          "Set up AWS SSO (aws configure sso), IAM access keys (aws configure), environment variables, or AWS_PROFILE",
      },
      {
        code: "PROFILE_NOT_FOUND",
        message: 'AWS profile "<profile>" not found',
        solution:
          "List available profiles, or configure a new one: aws configure --profile <profile>",
      },
      {
        code: "CREDENTIALS_FILE_MISSING",
        message: "AWS credentials file not found",
        solution:
          "Set up AWS SSO, IAM access keys, environment variables, or AWS_PROFILE",
      },
      {
        code: "ACCESS_KEY_INVALID",
        message: "AWS access key is invalid or has been deactivated",
        solution:
          "Check the IAM console, run aws configure, or generate new access keys",
      },
      {
        code: "SESSION_TOKEN_EXPIRED",
        message: "AWS session token has expired",
        solution:
          "SSO users: aws sso login. Assumed roles: re-run your assume-role command",
      },
      {
        code: "SSO_SESSION_EXPIRED",
        message: 'AWS SSO session has expired for profile "<profile>"',
        solution: "Run aws sso login --profile <profile>",
      },
      {
        code: "NOT_AUTHENTICATED",
        message: "Not authenticated to Wraps Platform",
        solution: "Run wraps auth login, or provide --token / WRAPS_API_KEY",
      },
      {
        code: "ORG_NOT_FOUND",
        message: "Could not determine organization",
        solution: "Pass --org, or sign in first: wraps auth login",
      },
    ],
  },
  {
    id: "iam-permissions",
    title: "IAM & Permissions",
    rows: [
      {
        code: "IAM_PERMISSION_DENIED",
        message: "Permission denied: <action> on <resource>",
        solution:
          "Your credentials lack the permission. View required permissions: wraps permissions --json",
      },
      {
        code: "SES_PERMISSION_DENIED",
        message: "SES permission denied: <action>",
        solution: "wraps permissions --service email --json",
      },
      {
        code: "DYNAMODB_PERMISSION_DENIED",
        message: "DynamoDB permission denied",
        solution: "Needs CreateTable, DeleteTable, DescribeTable, UpdateTable",
      },
      {
        code: "LAMBDA_PERMISSION_DENIED",
        message: "Lambda permission denied",
        solution: "Needs CreateFunction, UpdateFunctionCode, DeleteFunction",
      },
      {
        code: "EVENTBRIDGE_PERMISSION_DENIED",
        message: "EventBridge permission denied",
        solution: "Needs PutRule, PutTargets, DeleteRule",
      },
      {
        code: "SQS_PERMISSION_DENIED",
        message: "SQS permission denied",
        solution: "Needs CreateQueue, DeleteQueue, GetQueueAttributes",
      },
      {
        code: "CLOUDWATCH_LOGS_PERMISSION_DENIED",
        message: "CloudWatch Logs permission denied",
        solution:
          "Needs logs:DescribeLogGroups, logs:FilterLogEvents, logs:StartLiveTail",
      },
      {
        code: "ROUTE53_PERMISSION_DENIED",
        message: "Route53 permission denied",
        solution:
          "Needs ChangeResourceRecordSets, ListHostedZones (optional — add DNS records manually instead)",
      },
      {
        code: "IAM_ENTITY_NOT_FOUND",
        message: "IAM entity not found",
        solution: "Run wraps platform connect",
      },
    ],
  },
  {
    id: "region-aws-limits",
    title: "Region & AWS Limits",
    rows: [
      {
        code: "INVALID_REGION",
        message: "Invalid AWS region: <region>",
        solution:
          "Use a valid AWS region like us-east-1, eu-west-1, ap-southeast-1",
      },
      {
        code: "REGION_REQUIRED",
        message: "Region is required and could not be determined",
        solution: "Pass --region or set AWS_REGION",
      },
      {
        code: "REGION_REQUIRED_FOR_SET",
        message: "Could not determine which Region to change",
        solution: "Pass --region <r> with the Region you want to change",
      },
      {
        code: "AWS_THROTTLED",
        message: "AWS request was throttled",
        solution:
          "Wait and retry. Request a quota increase if this happens repeatedly",
      },
      {
        code: "AWS_LIMIT_EXCEEDED",
        message: "AWS service limit exceeded",
        solution: "Request a quota increase in Service Quotas",
      },
    ],
  },
  {
    id: "stack-deployment",
    title: "Stack & Deployment",
    rows: [
      {
        code: "NO_STACK",
        message: "No Wraps infrastructure found in this AWS account",
        solution: "Run wraps email init",
      },
      {
        code: "STACK_EXISTS",
        message: 'Stack "<stackName>" already exists',
        solution:
          "To update: wraps email upgrade. To remove: wraps destroy --stack <stackName>",
      },
      {
        code: "STACK_LOCKED",
        message: "The Pulumi stack is locked from a previous run",
        solution:
          "Remove ~/.wraps/pulumi/.pulumi/locks (local), or delete the lock object under .pulumi/locks/ in your wraps-state-* bucket (S3)",
      },
      {
        code: "PULUMI_ERROR",
        message: "Infrastructure deployment failed: <message>",
        solution: "Check your AWS permissions and try again",
      },
      {
        code: "PULUMI_NOT_INSTALLED",
        message: "Pulumi CLI is not installed",
        solution:
          "Install via brew/curl/choco, or download from pulumi.com/docs/install",
      },
      {
        code: "RESOURCE_CONFLICT",
        message: "Resource already exists: <resourceName>",
        solution: "Diagnose and clean up: wraps email doctor --cleanup",
      },
      {
        code: "S3_STATE_BUCKET_CREATION_FAILED",
        message: "Failed to create S3 state bucket: <bucketName>",
        solution:
          "Ensure s3:CreateBucket, s3:PutBucketEncryption, s3:PutBucketVersioning, or export WRAPS_LOCAL_ONLY=1",
      },
      {
        code: "S3_STATE_ACCESS_DENIED",
        message: "Access denied to S3 state bucket",
        solution:
          "Ensure s3:GetObject, s3:PutObject, s3:ListBucket on wraps-state-*, or export WRAPS_LOCAL_ONLY=1",
      },
      {
        code: "STATE_MIGRATION_FAILED",
        message: "Failed to migrate Pulumi state to S3",
        solution:
          "Local state is still intact. export WRAPS_LOCAL_ONLY=1 to skip migration",
      },
      {
        code: "SELFHOST_NO_LOG_GROUPS",
        message: "No self-hosted log groups found in <region>",
        solution: "Check wraps selfhost status, or target a different region",
      },
      {
        code: "SELFHOST_NO_LOG_GROUPS_FOR_SOURCE",
        message: "No <source> log groups in this deployment",
        solution: "Drop the filter: wraps selfhost logs",
      },
      {
        code: "LAMBDA_FUNCTION_NOT_FOUND",
        message: "Agent enforcer Lambda not found",
        solution: "Deploy it: wraps email agent create",
      },
      {
        code: "DYNAMODB_TABLE_NOT_FOUND",
        message: "Agent policy table not found",
        solution: "Deploy it: wraps email agent create",
      },
    ],
  },
  {
    id: "email-ses",
    title: "Email / SES",
    rows: [
      {
        code: "SES_MESSAGE_REJECTED",
        message: "SES rejected the message: <detail>",
        solution:
          "Sandbox with unverified recipient, unverified sender identity, or receiving-only domain. Check wraps email status / wraps email doctor",
      },
      {
        code: "SES_MAIL_FROM_NOT_VERIFIED",
        message: "SES MAIL FROM domain is not verified: <detail>",
        solution: "Check DNS records: wraps email verify",
      },
      {
        code: "SES_ACCOUNT_SENDING_PAUSED",
        message: "SES account-level sending is paused",
        solution: "Check the SES console Reputation Dashboard",
      },
      {
        code: "SES_CONFIG_SET_SENDING_PAUSED",
        message: "SES configuration set sending is paused",
        solution:
          "Resume it in the SES console, or send without that configuration set",
      },
      {
        code: "SES_CONFIG_SET_MISSING",
        message: "SES configuration set does not exist: <detail>",
        solution:
          "Create it in the SES console, switch regions, or remove ConfigurationSetName",
      },
      {
        code: "EVENT_DESTINATION_NOT_FOUND",
        message: "Event destination not found for <domain>",
        solution: "Run wraps email upgrade",
      },
      {
        code: "INVALID_EVENT_DESTINATION",
        message:
          "Event destination for <domain> is not an EventBridge destination",
        solution: "Run wraps email upgrade",
      },
      {
        code: "EVENT_TYPES_MISSING_SUPPRESSION_EVENTS",
        message:
          "eventTracking.events is missing required event type(s): <missing>",
        solution:
          "BOUNCE and COMPLAINT must always be included in eventTracking.events",
      },
      {
        code: "INVALID_SES_PRICING_PLAN",
        message: "No pricing plan specified",
        solution: "Pass --set with one of the valid pricing plans",
      },
      {
        code: "SES_PRICING_PLAN_CHANGE_REJECTED",
        message: "SES rejected the pricing plan change: <detail>",
        solution: "Check the current plan: wraps email plan",
      },
    ],
  },
  {
    id: "inbound-email",
    title: "Inbound Email",
    rows: [
      {
        code: "INBOUND_REGION_NOT_SUPPORTED",
        message: "SES email receiving is not supported in <region>",
        solution: "Deploy in us-east-1, us-west-2, or eu-west-1",
      },
      {
        code: "INBOUND_REQUIRES_OUTBOUND",
        message: "Inbound email requires outbound email infrastructure",
        solution: "Run wraps email init, then wraps email inbound init",
      },
      {
        code: "RECEIPT_RULE_SET_CONFLICT",
        message: "Another receipt rule set is active: <activeRuleSet>",
        solution:
          "Wraps will activate wraps-inbound-rules, deactivating the current set",
      },
      {
        code: "INBOUND_TEST_SEND_FAILED",
        message: "Failed to send inbound test email to <recipient>",
        solution: "Check wraps email status / wraps email doctor",
      },
      {
        code: "INBOUND_TEST_MAIL_FROM_NOT_VERIFIED",
        message: "Custom MAIL FROM domain is not verified for <domain>",
        solution: "Verify DNS records: wraps email verify",
      },
      {
        code: "INBOUND_TEST_MESSAGE_REJECTED",
        message: "SES rejected the inbound test send: <message>",
        solution:
          "Sandbox with unverified recipient, unverified sender domain, or receiving-only domain. Check wraps email status / doctor",
      },
      {
        code: "INBOUND_TEST_SENDING_PAUSED",
        message: "SES sending is paused for this account",
        solution: "Check the SES console Reputation Dashboard",
      },
      {
        code: "INBOUND_TEST_PERMISSION_DENIED",
        message: "IAM permission denied: ses:SendEmail in <region>",
        solution: "wraps permissions --service email --json",
      },
    ],
  },
  {
    id: "reply-threading",
    title: "Reply Threading",
    rows: [
      {
        code: "REPLY_SECRET_PARAMETER_MISSING",
        message: "SSM parameter for <domain> was not created",
        solution: "Run wraps email reply status to diagnose, or retry the init",
      },
      {
        code: "REPLY_REQUIRES_INBOUND",
        message: "Reply threading requires inbound email infrastructure",
        solution: "Deploy inbound first: wraps email inbound init",
      },
      {
        code: "REPLY_NO_INBOUND_DOMAINS",
        message: "No inbound domains configured",
        solution: "Add one: wraps email inbound add --domain yourapp.com",
      },
      {
        code: "REPLY_INBOUND_DOMAIN_NOT_FOUND",
        message: "Domain <target> is not configured for inbound email",
        solution: "Add it to inbound first: wraps email inbound add <target>",
      },
      {
        code: "REPLY_ALREADY_ENABLED",
        message: "Reply threading is already enabled for <target>",
        solution:
          "To rotate the signing secret: wraps email reply rotate --domain <target>",
      },
      {
        code: "REPLY_MISSING_DOMAIN",
        message: "Specify a domain or use --all",
        solution: "wraps email reply init --domain yourapp.com, or --all",
      },
      {
        code: "REPLY_ROTATE_MISSING_DOMAIN",
        message: "--domain is required for rotate",
        solution: "wraps email reply rotate --domain yourapp.com",
      },
      {
        code: "REPLY_NOT_ENABLED",
        message: "Reply threading is not enabled",
        solution:
          "Enable it first: wraps email reply init --domain yourapp.com",
      },
      {
        code: "REPLY_DOMAIN_NOT_ENABLED",
        message: "Reply threading is not enabled for <domain>",
        solution: "Enable it first: wraps email reply init --domain <domain>",
      },
      {
        code: "REPLY_DESTROY_MISSING_DOMAIN",
        message: "Specify a domain or use --all",
        solution: "wraps email reply destroy --domain yourapp.com, or --all",
      },
      {
        code: "REPLY_DECODE_MISSING_ADDRESS",
        message: "Usage: wraps email reply decode <token>@r.mail.yourapp.com",
        solution: "Provide a signed reply address",
      },
      {
        code: "REPLY_DECODE_MALFORMED_ADDRESS",
        message: "Address must be in the form <token>@r.mail.example.com",
        solution: "Pass a full signed reply address",
      },
    ],
  },
  {
    id: "sms-errors",
    title: "SMS",
    rows: [
      {
        code: "SMS_NOT_CONFIGURED",
        message: "SMS infrastructure not found",
        solution: "Run wraps sms init",
      },
      {
        code: "SMS_PHONE_NOT_VERIFIED",
        message: "Phone number registration not complete",
        solution:
          "Toll-free numbers require registration (15+ days). Check status in the AWS console",
      },
      {
        code: "SMS_OPTED_OUT",
        message: "Destination number <phoneNumber> has opted out",
        solution: "The recipient can opt back in by texting START",
      },
      {
        code: "SMS_SPENDING_LIMIT",
        message: "AWS SMS spending limit reached",
        solution: "Request a spending limit increase in the AWS console",
      },
      {
        code: "SMS_INVALID_PHONE_NUMBER",
        message: "Invalid phone number format: <phoneNumber>",
        solution: "Use E.164 format, e.g. +14155551234",
      },
      {
        code: "SMS_INVALID_COUNTRIES",
        message: "Invalid --countries value: <raw>",
        solution:
          "Comma-separated ISO 3166-1 alpha-2 codes, e.g. --countries US,CA,GB",
      },
      {
        code: "SMS_INVALID_VOLUME",
        message: "Invalid --volume value: <raw>",
        solution: "Positive whole number of messages per month",
      },
      {
        code: "SMS_SIMULATOR_LIMIT",
        message: "Simulator daily message limit reached (100 messages)",
        solution: "Upgrade: wraps sms upgrade --phone-type toll-free",
      },
    ],
  },
  {
    id: "smtp-errors",
    title: "SMTP",
    rows: [
      {
        code: "SMTP_CREDENTIALS_NOT_FOUND",
        message: "SMTP credentials not found",
        solution: 'wraps email upgrade and select "Enable SMTP credentials"',
      },
      {
        code: "SMTP_REQUIRES_SENDING",
        message: "SMTP credentials require email sending to be enabled",
        solution: 'wraps email upgrade and select "Custom configuration"',
      },
    ],
  },
  {
    id: "templates-config",
    title: "Templates & Config",
    rows: [
      {
        code: "WRAPS_CONFIG_NOT_FOUND",
        message: "wraps/wraps.config.ts not found",
        solution: "Initialize templates first: wraps email templates init",
      },
      {
        code: "TEMPLATE_COMPILATION_FAILED",
        message: 'Failed to compile template "<name>": <error>',
        solution: "Check your template for syntax errors and valid imports",
      },
      {
        code: "TEMPLATE_PUSH_FAILED",
        message: 'Failed to push template "<name>": <error>',
        solution: "Check your API key and network connection",
      },
      {
        code: "TEMPLATES_DIR_EXISTS",
        message: "wraps/ directory already exists",
        solution:
          "Use --force to overwrite: wraps email templates init --force",
      },
    ],
  },
  {
    id: "cli-usage-automation",
    title: "CLI Usage & Automation",
    rows: [
      {
        code: "NON_INTERACTIVE_INPUT",
        message: "<what> is required in non-interactive mode",
        solution: "Pass the required flag, or run in an interactive terminal",
      },
      {
        code: "MISSING_REQUIRED_FLAG",
        message: "A required flag is missing in JSON mode",
        solution: "Provide the flag named in the error message",
      },
      {
        code: "JSON_REQUIRES_FORCE",
        message:
          "--force flag is required in JSON mode for destructive operations",
        solution: "Add --force to the command",
      },
      {
        code: "CONFIRMATION_REQUIRED",
        message: "Confirmation required to change your SES pricing plan",
        solution: "Pass --yes to skip the confirmation prompt",
      },
      {
        code: "OPERATION_CANCELLED",
        message: "Operation cancelled",
        solution: "Pass --region to skip the interactive prompt",
      },
      {
        code: "INVALID_LOG_SOURCE",
        message: "Unknown --source value: <value>",
        solution: "Valid sources: api, web, workers, other, all",
      },
      {
        code: "INVALID_LOG_WINDOW",
        message: "Invalid --since value: <value>",
        solution: "Use a positive number followed by s, m, h, or d",
      },
      {
        code: "UNKNOWN_ERROR",
        message: "An unexpected error occurred",
        solution:
          "The thrown value was not a recognized WrapsError. Check the CLI logs for details",
      },
    ],
  },
];

const sectionMd = (s: ErrorSection) =>
  [
    `### ${s.title}`,
    "",
    "| Code | Message | Solution |",
    "|------|---------|----------|",
    ...s.rows.map((r) => `| ${r.code} | ${r.message} | ${r.solution} |`),
  ].join("\n");

const CLI_ERRORS_MD = CLI_ERROR_SECTIONS.map(sectionMd).join("\n\n");

const EXIT_CODES_MD = `### Exit Codes

Every command exits \`0\` on success and \`1\` on error, with one exception:

| Command | Exit code | Meaning |
|---------|-----------|---------|
| Any command | \`0\` | Success |
| Any command | \`1\` | Error |
| \`wraps email check\` | \`0\` | Deliverability grade A or B |
| \`wraps email check\` | \`1\` | Deliverability grade C or D |
| \`wraps email check\` | \`2\` | Deliverability grade F |
| \`wraps email check\` | \`4\` | Check itself failed to run, or grade was unrecognized |

In \`--json\` mode, errors are still written to **stdout** as a JSON envelope (the exit code is what signals failure to scripts):

\`\`\`json
${jsonErrorEnvelopeCode}
\`\`\``;

const SECTION_MD = {
  sdkEmailErrors: `## SDK Error Classes — Email SDK (@wraps.dev/email)

- **WrapsEmailError** — Base class every other email SDK error extends. Catch-all \`instanceof\` check.
- **SESError** — AWS SES API error. Properties: \`code\` (string), \`requestId\` (string), \`retryable\` (boolean). Common codes: MessageRejected, Throttling, AccountSuspended, MailFromDomainNotVerified.
- **DynamoDBError** — Email history read/write error. Properties: \`code\` (string), \`requestId\` (string), \`retryable\` (boolean).
- **ValidationError** — Invalid input. Properties: \`field\` (string), \`message\` (string).
- **CredentialsError** — The AWS credential chain produced nothing, so no request was signed. Properties: \`cause\` (unknown). The message lists every way to supply credentials without ranking them.
- **SandboxError** — Extends \`SESError\`. SES rejected the send because an identity is not verified in the region used — either a region mismatch or the SES sandbox; the message separates the two. Properties: \`region\` (string, when resolvable) plus everything on \`SESError\`.

\`sendBatch()\` never throws on partial send failure — it reports per-entry outcomes in its resolved \`SendBatchResult\` (\`results\`, \`successCount\`, \`failureCount\`). A credential failure is the exception: nothing was attempted, so it throws \`CredentialsError\`. (\`BatchError\` was removed in 0.13.0 — it was never thrown.)`,

  sdkSmsErrors: `## SDK Error Classes — SMS SDK (@wraps.dev/sms)

- **WrapsSMSError** — Base class every other SMS SDK error extends. Catch-all \`instanceof\` check.
- **SMSError** — AWS End User Messaging error. Properties: \`code\` (string), \`retryable\` (boolean).
- **ValidationError** — Invalid input. Properties: \`field\` (string), \`message\` (string).
- **OptedOutError** — Recipient opted out. Properties: \`phoneNumber\` (string).
- **RateLimitError** — Rate limit exceeded. Properties: \`retryAfter\` (number, seconds).
- **CredentialsError** — The AWS credential chain produced nothing. Properties: \`cause\` (unknown). Neutral message listing every credential option.
- **ConfigurationError** — No AWS region could be resolved from config, environment, or profile. Properties: \`cause\` (unknown). New in 0.2.0: there is no implicit us-east-1 default.
- **SendingRestrictionError** — AWS refused the send because of an account-level restriction, not the request. Properties: \`restriction\` (e.g. SANDBOX_DESTINATION_NOT_VERIFIED, NO_ORIGINATION_IDENTITY, SPEND_LIMIT_REACHED).`,

  retryPattern: `## Retry Pattern

The SDKs do NOT automatically retry failed requests. If \`retryable\` is \`true\`, implement your own retry logic.

\`\`\`typescript
${retryPatternCode}
\`\`\``,
};

const FULL_PAGE_MD = `# Error Codes & Troubleshooting

Complete reference for all CLI error codes and SDK error classes, with solutions for each.

## CLI Error Codes

${CLI_ERRORS_MD}

${EXIT_CODES_MD}

${SECTION_MD.sdkEmailErrors}

${SECTION_MD.sdkSmsErrors}

${SECTION_MD.retryPattern}
`;

const SLASH_COMMAND_MD = `---
description: Wraps error codes and troubleshooting - use this when debugging CLI or SDK errors
---

${FULL_PAGE_MD}`;

// ============================================================================
// ERROR TABLE COMPONENT
// ============================================================================

function ErrorTable({
  rows,
}: {
  rows: { code: string; message: string; solution: string }[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="px-4 py-2 text-left font-medium">Code</th>
            <th className="px-4 py-2 text-left font-medium">Message</th>
            <th className="px-4 py-2 text-left font-medium">Solution</th>
          </tr>
        </thead>
        <tbody className="text-muted-foreground">
          {rows.map((row, i) => (
            <tr
              className={i < rows.length - 1 ? "border-b" : ""}
              key={row.code}
            >
              <td className="px-4 py-2">
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                  {row.code}
                </code>
              </td>
              <td className="px-4 py-2">{row.message}</td>
              <td className="px-4 py-2">{row.solution}</td>
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
          Error Codes & Troubleshooting
        </h1>
        <p className="text-lg text-muted-foreground">
          Complete reference for all CLI error codes and SDK error classes, with
          solutions for each.
        </p>
      </div>

      {/* CLI Error Codes */}
      <section className="mb-12">
        <SectionHeading
          className="mb-6"
          id="cli-error-codes"
          markdown={`## CLI Error Codes\n\n${CLI_ERRORS_MD}`}
          title="CLI Error Codes"
        />

        {CLI_ERROR_SECTIONS.map((section) => (
          <div className="mb-8" key={section.id}>
            <h3 className="mb-3 font-medium text-lg" id={section.id}>
              {section.title}
            </h3>
            <Card>
              <CardContent className="p-0">
                <ErrorTable rows={section.rows} />
              </CardContent>
            </Card>
          </div>
        ))}
      </section>

      {/* Exit Codes */}
      <section className="mb-12">
        <SectionHeading
          className="mb-6"
          id="exit-codes"
          markdown={EXIT_CODES_MD}
          title="Exit Codes"
        />
        <p className="mb-4 text-muted-foreground">
          Every command exits{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">0</code> on success
          and <code className="rounded bg-muted px-1.5 py-0.5">1</code> on
          error, with one exception.
        </p>
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="px-4 py-2 text-left font-medium">Command</th>
                    <th className="px-4 py-2 text-left font-medium">
                      Exit code
                    </th>
                    <th className="px-4 py-2 text-left font-medium">Meaning</th>
                  </tr>
                </thead>
                <tbody className="text-muted-foreground">
                  <tr className="border-b">
                    <td className="px-4 py-2">Any command</td>
                    <td className="px-4 py-2">
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                        0
                      </code>
                    </td>
                    <td className="px-4 py-2">Success</td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2">Any command</td>
                    <td className="px-4 py-2">
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                        1
                      </code>
                    </td>
                    <td className="px-4 py-2">Error</td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2">
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                        wraps email check
                      </code>
                    </td>
                    <td className="px-4 py-2">
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                        0
                      </code>
                    </td>
                    <td className="px-4 py-2">Deliverability grade A or B</td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2">
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                        wraps email check
                      </code>
                    </td>
                    <td className="px-4 py-2">
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                        1
                      </code>
                    </td>
                    <td className="px-4 py-2">Deliverability grade C or D</td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2">
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                        wraps email check
                      </code>
                    </td>
                    <td className="px-4 py-2">
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                        2
                      </code>
                    </td>
                    <td className="px-4 py-2">Deliverability grade F</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2">
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                        wraps email check
                      </code>
                    </td>
                    <td className="px-4 py-2">
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                        4
                      </code>
                    </td>
                    <td className="px-4 py-2">
                      Check itself failed to run, or grade was unrecognized
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
        <p className="mt-4 text-muted-foreground text-sm">
          In <code className="rounded bg-muted px-1.5 py-0.5">--json</code>{" "}
          mode, errors are still written to <strong>stdout</strong> as a JSON
          envelope — the exit code is what signals failure to scripts:
        </p>
        <CodeBlock
          className="mt-3 h-auto"
          data={[
            {
              language: "json",
              filename: "error-envelope.json",
              code: jsonErrorEnvelopeCode,
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

      {/* SDK Error Classes */}
      <section className="mb-12">
        <SectionHeading
          className="mb-6"
          id="sdk-error-classes"
          markdown={`${SECTION_MD.sdkEmailErrors}\n\n${SECTION_MD.sdkSmsErrors}`}
          title="SDK Error Classes"
        />

        {/* Email SDK */}
        <div className="mb-8">
          <h3 className="mb-4 font-medium text-lg" id="email-sdk-errors">
            Email SDK (
            <code className="rounded bg-muted px-1.5 py-0.5">
              @wraps.dev/email
            </code>
            )
          </h3>
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">WrapsEmailError</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm">
                  Base class every other email SDK error extends. Use it for a
                  single catch-all{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    instanceof
                  </code>{" "}
                  check that covers all of them.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">SESError</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-3 text-muted-foreground text-sm">
                  Thrown when an AWS SES API call fails.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="px-4 py-2 text-left font-medium">
                          Property
                        </th>
                        <th className="px-4 py-2 text-left font-medium">
                          Type
                        </th>
                        <th className="px-4 py-2 text-left font-medium">
                          Description
                        </th>
                      </tr>
                    </thead>
                    <tbody className="text-muted-foreground">
                      <tr className="border-b">
                        <td className="px-4 py-2">
                          <code className="rounded bg-muted px-1.5 py-0.5">
                            code
                          </code>
                        </td>
                        <td className="px-4 py-2">string</td>
                        <td className="px-4 py-2">
                          MessageRejected, Throttling, AccountSuspended,
                          MailFromDomainNotVerified
                        </td>
                      </tr>
                      <tr className="border-b">
                        <td className="px-4 py-2">
                          <code className="rounded bg-muted px-1.5 py-0.5">
                            requestId
                          </code>
                        </td>
                        <td className="px-4 py-2">string</td>
                        <td className="px-4 py-2">AWS request identifier</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2">
                          <code className="rounded bg-muted px-1.5 py-0.5">
                            retryable
                          </code>
                        </td>
                        <td className="px-4 py-2">boolean</td>
                        <td className="px-4 py-2">
                          Whether the request can be retried
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">DynamoDBError</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-3 text-muted-foreground text-sm">
                  Thrown when an email history read/write operation fails.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="px-4 py-2 text-left font-medium">
                          Property
                        </th>
                        <th className="px-4 py-2 text-left font-medium">
                          Type
                        </th>
                        <th className="px-4 py-2 text-left font-medium">
                          Description
                        </th>
                      </tr>
                    </thead>
                    <tbody className="text-muted-foreground">
                      <tr className="border-b">
                        <td className="px-4 py-2">
                          <code className="rounded bg-muted px-1.5 py-0.5">
                            code
                          </code>
                        </td>
                        <td className="px-4 py-2">string</td>
                        <td className="px-4 py-2">DynamoDB error code</td>
                      </tr>
                      <tr className="border-b">
                        <td className="px-4 py-2">
                          <code className="rounded bg-muted px-1.5 py-0.5">
                            requestId
                          </code>
                        </td>
                        <td className="px-4 py-2">string</td>
                        <td className="px-4 py-2">AWS request identifier</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2">
                          <code className="rounded bg-muted px-1.5 py-0.5">
                            retryable
                          </code>
                        </td>
                        <td className="px-4 py-2">boolean</td>
                        <td className="px-4 py-2">
                          Whether the request can be retried
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">ValidationError</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-3 text-muted-foreground text-sm">
                  Thrown when input parameters are invalid.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="px-4 py-2 text-left font-medium">
                          Property
                        </th>
                        <th className="px-4 py-2 text-left font-medium">
                          Type
                        </th>
                        <th className="px-4 py-2 text-left font-medium">
                          Description
                        </th>
                      </tr>
                    </thead>
                    <tbody className="text-muted-foreground">
                      <tr className="border-b">
                        <td className="px-4 py-2">
                          <code className="rounded bg-muted px-1.5 py-0.5">
                            field
                          </code>
                        </td>
                        <td className="px-4 py-2">string</td>
                        <td className="px-4 py-2">
                          Which field failed validation
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2">
                          <code className="rounded bg-muted px-1.5 py-0.5">
                            message
                          </code>
                        </td>
                        <td className="px-4 py-2">string</td>
                        <td className="px-4 py-2">
                          Human-readable error description
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">CredentialsError</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-3 text-muted-foreground text-sm">
                  The AWS credential chain produced nothing usable, so no
                  request was ever signed. The message lists every way to supply
                  credentials — SSO, access keys, environment variables, a named
                  profile, or the constructor — without ranking one over
                  another.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="px-4 py-2 text-left font-medium">
                          Property
                        </th>
                        <th className="px-4 py-2 text-left font-medium">
                          Type
                        </th>
                        <th className="px-4 py-2 text-left font-medium">
                          Description
                        </th>
                      </tr>
                    </thead>
                    <tbody className="text-muted-foreground">
                      <tr className="border-b">
                        <td className="px-4 py-2">
                          <code className="rounded bg-muted px-1.5 py-0.5">
                            cause
                          </code>
                        </td>
                        <td className="px-4 py-2">unknown</td>
                        <td className="px-4 py-2">
                          The underlying AWS SDK error, for debugging
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">SandboxError</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-3 text-muted-foreground text-sm">
                  Extends SESError. SES rejected the send because an identity
                  involved is not verified in the region the request went to.
                  Two unrelated causes produce this one AWS error — a region
                  mismatch and the SES sandbox — so the message names the region
                  actually used and walks through both, including the
                  mailbox-simulator address that proves sending works without
                  production access.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="px-4 py-2 text-left font-medium">
                          Property
                        </th>
                        <th className="px-4 py-2 text-left font-medium">
                          Type
                        </th>
                        <th className="px-4 py-2 text-left font-medium">
                          Description
                        </th>
                      </tr>
                    </thead>
                    <tbody className="text-muted-foreground">
                      <tr className="border-b">
                        <td className="px-4 py-2">
                          <code className="rounded bg-muted px-1.5 py-0.5">
                            region
                          </code>
                        </td>
                        <td className="px-4 py-2">string | undefined</td>
                        <td className="px-4 py-2">
                          The region this client sent to, when resolvable
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* SMS SDK */}
        <div className="mb-8">
          <h3 className="mb-4 font-medium text-lg" id="sms-sdk-errors">
            SMS SDK (
            <code className="rounded bg-muted px-1.5 py-0.5">
              @wraps.dev/sms
            </code>
            )
          </h3>
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">WrapsSMSError</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm">
                  Base class every other SMS SDK error extends. Use it for a
                  single catch-all{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    instanceof
                  </code>{" "}
                  check that covers all of them.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">SMSError</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-3 text-muted-foreground text-sm">
                  Thrown when an AWS End User Messaging API call fails.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="px-4 py-2 text-left font-medium">
                          Property
                        </th>
                        <th className="px-4 py-2 text-left font-medium">
                          Type
                        </th>
                        <th className="px-4 py-2 text-left font-medium">
                          Description
                        </th>
                      </tr>
                    </thead>
                    <tbody className="text-muted-foreground">
                      <tr className="border-b">
                        <td className="px-4 py-2">
                          <code className="rounded bg-muted px-1.5 py-0.5">
                            code
                          </code>
                        </td>
                        <td className="px-4 py-2">string</td>
                        <td className="px-4 py-2">AWS error code</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2">
                          <code className="rounded bg-muted px-1.5 py-0.5">
                            retryable
                          </code>
                        </td>
                        <td className="px-4 py-2">boolean</td>
                        <td className="px-4 py-2">
                          Whether the request can be retried
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">ValidationError</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-3 text-muted-foreground text-sm">
                  Thrown when input parameters are invalid.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="px-4 py-2 text-left font-medium">
                          Property
                        </th>
                        <th className="px-4 py-2 text-left font-medium">
                          Type
                        </th>
                        <th className="px-4 py-2 text-left font-medium">
                          Description
                        </th>
                      </tr>
                    </thead>
                    <tbody className="text-muted-foreground">
                      <tr className="border-b">
                        <td className="px-4 py-2">
                          <code className="rounded bg-muted px-1.5 py-0.5">
                            field
                          </code>
                        </td>
                        <td className="px-4 py-2">string</td>
                        <td className="px-4 py-2">
                          Which field failed validation
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2">
                          <code className="rounded bg-muted px-1.5 py-0.5">
                            message
                          </code>
                        </td>
                        <td className="px-4 py-2">string</td>
                        <td className="px-4 py-2">
                          Human-readable error description
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">OptedOutError</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-3 text-muted-foreground text-sm">
                  Thrown when the recipient has opted out of receiving messages.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="px-4 py-2 text-left font-medium">
                          Property
                        </th>
                        <th className="px-4 py-2 text-left font-medium">
                          Type
                        </th>
                        <th className="px-4 py-2 text-left font-medium">
                          Description
                        </th>
                      </tr>
                    </thead>
                    <tbody className="text-muted-foreground">
                      <tr>
                        <td className="px-4 py-2">
                          <code className="rounded bg-muted px-1.5 py-0.5">
                            phoneNumber
                          </code>
                        </td>
                        <td className="px-4 py-2">string</td>
                        <td className="px-4 py-2">
                          The phone number that opted out
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">RateLimitError</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-3 text-muted-foreground text-sm">
                  Thrown when the sending rate limit has been exceeded.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="px-4 py-2 text-left font-medium">
                          Property
                        </th>
                        <th className="px-4 py-2 text-left font-medium">
                          Type
                        </th>
                        <th className="px-4 py-2 text-left font-medium">
                          Description
                        </th>
                      </tr>
                    </thead>
                    <tbody className="text-muted-foreground">
                      <tr>
                        <td className="px-4 py-2">
                          <code className="rounded bg-muted px-1.5 py-0.5">
                            retryAfter
                          </code>
                        </td>
                        <td className="px-4 py-2">number</td>
                        <td className="px-4 py-2">
                          Seconds to wait before retrying
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Important Callout */}
      <section className="mb-12">
        <div className="rounded-lg border-amber-500 border-l-4 bg-amber-500/10 p-4">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
            <div>
              <p className="font-medium">No Automatic Retries</p>
              <p className="mt-1 text-muted-foreground text-sm">
                The SDKs do NOT automatically retry failed requests. If{" "}
                <code className="rounded bg-muted px-1.5 py-0.5">
                  retryable
                </code>{" "}
                is <code className="rounded bg-muted px-1.5 py-0.5">true</code>,
                implement your own retry logic using the pattern below.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Retry Pattern */}
      <section className="mb-12">
        <SectionHeading
          className="mb-4"
          id="retry-pattern"
          markdown={SECTION_MD.retryPattern}
          title="Retry Pattern"
        />
        <p className="mb-4 text-muted-foreground">
          Use exponential backoff when retrying failed requests. This example
          uses a simple retry loop with increasing delays.
        </p>
        <CodeBlock
          className="h-auto"
          data={[
            {
              language: "typescript",
              filename: "retry-pattern.ts",
              code: retryPatternCode,
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

      {/* Error Handling Example */}
      <section className="mb-12">
        <SectionHeading
          className="mb-4"
          id="error-handling-example"
          markdown={`## Error Handling Example\n\n\`\`\`typescript\n${errorHandlingCode}\n\`\`\``}
          title="Error Handling Example"
        />
        <p className="mb-4 text-muted-foreground">
          Catch and handle specific error types to provide appropriate responses
          in your application.
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

      {/* Next Steps */}
      <section className="mb-12">
        <h2 className="mb-6 font-bold text-2xl">Next Steps</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="transition-colors hover:border-primary/50">
            <CardHeader>
              <CardTitle className="text-lg">Email SDK</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-muted-foreground text-sm">
                Full API reference for the @wraps.dev/email TypeScript SDK.
              </p>
              <Button asChild variant="outline">
                <Link href="/docs/sdk-reference">
                  View Reference
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="transition-colors hover:border-primary/50">
            <CardHeader>
              <CardTitle className="text-lg">SMS SDK</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-muted-foreground text-sm">
                Full API reference for the @wraps.dev/sms TypeScript SDK.
              </p>
              <Button asChild variant="outline">
                <Link href="/docs/sms-sdk-reference">
                  View Reference
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="transition-colors hover:border-primary/50">
            <CardHeader>
              <CardTitle className="text-lg">AWS Setup</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-muted-foreground text-sm">
                Configure AWS credentials and permissions for Wraps.
              </p>
              <Button asChild variant="outline">
                <Link href="/docs/guides/aws-setup">
                  View Guide
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
