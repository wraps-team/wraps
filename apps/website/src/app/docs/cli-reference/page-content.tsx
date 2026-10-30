"use client";

import { Badge } from "@wraps/ui/components/ui/badge";
import { Button } from "@wraps/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import {
  ArrowRight,
  Blocks,
  Cloud,
  HardDrive,
  KeyRound,
  Mail,
  MessageSquare,
  Terminal,
} from "lucide-react";
import Link from "next/link";
import { CLICommand } from "@/components/docs/cli-command";
import { DocsLayout } from "@/components/docs-layout";

type DataCommand = {
  command: string;
  summary: string;
  flags?: string;
  data?: string;
  notes?: string;
};

type DataCommandGroup = {
  title: string;
  commands: DataCommand[];
};

const CONTACT_FIELDS =
  "id, externalId, email, phone, firstName, lastName, company, jobTitle, emailStatus, smsStatus, preferredChannel, properties, emailsSent, emailsOpened, emailsClicked, smsSent, smsClicked, createdAt, updatedAt";

const TOPIC_FIELDS =
  "id, name, slug, description, public, doubleOptIn, subscriberCount, sendableCount, pendingCount, createdAt, updatedAt, createdBy";

const SEGMENT_FIELDS =
  "id, name, description, condition, trackMembership, memberCount, lastComputedAt, createdAt, updatedAt";

const TEMPLATE_FIELDS =
  "id, name, slug, channel, emailType, status, subject, previewText, description, variables, source, sourceHash, compiledHtml, compiledText, lastEditedFrom, publishedAt, createdAt, updatedAt";

const APPROVAL_FIELDS =
  "id, agentId, organizationId, status, payload, reason, messageId, errorMessage, decidedAt, decidedBy, createdAt, updatedAt";

const DATA_COMMAND_GROUPS: DataCommandGroup[] = [
  {
    title: "Contacts",
    commands: [
      {
        command: "contacts list",
        summary: "List contacts in your organization.",
        flags:
          "--search, --email-status, --sms-status, --preferred-channel, --limit (1-100), --cursor",
        data: "contacts, total, page, pageSize, totalPages, nextCursor",
        notes: "The cursor is a page number. Pass nextCursor back unchanged.",
      },
      {
        command: "contacts get <id>",
        summary: "Show one contact by UUID, email or externalId.",
        data: `${CONTACT_FIELDS}, topics`,
      },
      {
        command: "contacts create",
        summary: "Create a contact. Needs --email or --phone.",
        flags:
          "--email, --phone, --first-name, --last-name, --company, --job-title, --external-id, --email-status, --sms-status, --preferred-channel, --topic-ids, --properties (JSON object)",
        data: `${CONTACT_FIELDS}, pendingTopics`,
        notes:
          "Returns CONFLICT if the contact already exists. Search with contacts list --search first.",
      },
      {
        command: "contacts update <id>",
        summary: "Change only the fields you pass.",
        flags: "The same field flags as contacts create",
        data: `${CONTACT_FIELDS}, pendingTopics`,
        notes: "At least one field flag is required.",
      },
      {
        command: "contacts delete <id>",
        summary: "Delete a contact.",
        flags: "--yes (required), --dry-run",
        data: "id, deleted, dryRun",
      },
      {
        command: "contacts import --file <path>",
        summary: "Import a CSV or JSON file of up to 10,000 rows in one call.",
        flags:
          "--format (csv or json), --duplicate-strategy (skip or update), --topic-ids, --validate with --aws-account-id and --yes, --dry-run",
        data: "dryRun, file, format, rows, created, updated, skipped, invalid, errors, duplicates, duplicateStrategy, topicIds, sesValidation",
        notes:
          "A row that matches an existing contact by email or phone is skipped by default. update fills blank fields and merges properties, and never overwrites consent. Split a longer file into parts of at most 10,000 rows, each with the header row. --validate checks addresses with SES and AWS bills per address, so it needs --yes.",
      },
      {
        command: "contacts export",
        summary: "Export up to 50,000 contacts, newest first.",
        flags:
          "--format (json or csv), --output <path>, --search, --email-status, --topic-id, --yes (to overwrite --output)",
        data: "format, output, exported, total, truncated, hint, overwritten (without --output, the rows are in contacts)",
        notes:
          "The file is written only after the API answers. An existing file is not overwritten unless --yes is given. CSV in --json mode needs --output.",
      },
      {
        command: "contacts validate",
        summary: "Check up to 100 addresses with SES Email Address Insights.",
        flags:
          "--emails <a@x.com,b@y.com> or --file <path> (one address per line), --aws-account-id (from email health), --yes, --dry-run",
        data: "requested, awsAccountId, verdicts",
        notes:
          "Needs an AWS account whose SES plan is PRO or ENTERPRISE. Reads no contacts and writes nothing. --yes is required because AWS bills per address.",
      },
    ],
  },
  {
    title: "Segments",
    commands: [
      {
        command: "segments list",
        summary: "List segments with live member counts. Pro plan.",
        flags: "--limit (1-100, default 20), --cursor (an offset)",
        data: "segments, total, limit, offset, nextCursor",
      },
      {
        command: "segments get <id>",
        summary: "Show one segment and its filter condition.",
        data: SEGMENT_FIELDS,
      },
      {
        command: "segments create",
        summary: "Create a segment.",
        flags:
          "--name (required), --condition (JSON, required), --description, --track-membership",
        data: SEGMENT_FIELDS,
      },
      {
        command: "segments update <id>",
        summary: "Change a segment's name, description, condition or tracking.",
        flags:
          "--name, --description, --condition, --track-membership (at least one required)",
        data: SEGMENT_FIELDS,
      },
      {
        command: "segments delete <id>",
        summary: "Delete a segment.",
        flags: "--yes (required), --dry-run",
        data: "id, deleted, dryRun",
      },
      {
        command: "segments preview <id>",
        summary:
          "Count and sample who a segment would reach. Read-only, changes nothing.",
        flags: "--limit",
        data: "id, count, sample",
      },
    ],
  },
  {
    title: "Topics",
    commands: [
      {
        command: "topics list",
        summary: "List topics with live subscriber counts. Pro plan.",
        flags: "--limit (1-100, default 20), --cursor (an offset)",
        data: "topics, total, limit, offset, nextCursor",
        notes:
          "The route returns every topic, so the CLI pages the list itself.",
      },
      {
        command: "topics get <id>",
        summary: "Show one topic with its audience counts.",
        data: TOPIC_FIELDS,
      },
      {
        command: "topics create",
        summary: "Create a topic. Needs --name.",
        flags:
          "--name (required), --description, --slug, --public (true or false), --double-opt-in (true or false)",
        data: TOPIC_FIELDS,
        notes:
          "The slug is generated from the name unless you pass one. An existing slug returns CONFLICT.",
      },
      {
        command: "topics update <id>",
        summary:
          "Change a topic's name, slug, description, public or double opt-in.",
        flags:
          "--name, --description, --slug, --public, --double-opt-in (at least one required)",
        data: TOPIC_FIELDS,
      },
      {
        command: "topics delete <id>",
        summary: "Delete a topic and every subscription to it.",
        flags: "--yes (required), --dry-run",
        data: "id, deleted, dryRun",
      },
      {
        command: "topics subscribers <id>",
        summary: "List a topic's subscribers.",
        flags:
          "--status (subscribed, pending or unsubscribed), --limit (1-100, default 50), --cursor (a page number, starting at 1)",
        data: "topicId, subscribers (contactId, email, status, subscribedAt, unsubscribedAt), total, page, pageSize, nextCursor",
        notes:
          "pending covers double opt-in contacts who have not confirmed yet.",
      },
    ],
  },
  {
    title: "Events",
    commands: [
      {
        command: "events list",
        summary: "List contact events, newest first.",
        flags:
          "--limit (1-100, default 50), --cursor (a page number, default 1), --event-name, --search, --contact-email, --date-from, --date-to (ISO 8601)",
        data: "events, total, page, pageSize, nextCursor",
        notes: "Read-only.",
      },
      {
        command: "events analytics",
        summary: "Show event totals and daily counts.",
        flags: "--days (7 or 30, default 30), --timezone",
        data: "days, totalEvents, eventsThisPeriod, activeContacts, avgEventsPerContact, dailyEvents, topEventNames",
      },
      {
        command: "events names",
        summary: "List the distinct event names.",
        data: "eventNames, count",
      },
      {
        command: "events get <id>",
        summary: "Show one event.",
        data: "id, eventName, eventData, createdAt, contactId, contactEmail, contactFirstName, contactLastName",
      },
    ],
  },
  {
    title: "Broadcasts",
    commands: [
      {
        command: "broadcasts draft",
        summary: "Save a new broadcast draft. Sends nothing.",
        flags:
          "--name, --subject, --template-id, --audience-type (all, topic or segment), --topic-id or --segment-id, --aws-account-id, --html-content, --scheduled-for (ISO time)",
        notes:
          "The output prints the broadcasts send command to run next. Draft content is fixed when the draft is created, because the API does not edit drafts on current main.",
      },
      {
        command: "broadcasts create",
        summary:
          "Queue a broadcast. It sends immediately unless --scheduled-for is set.",
        flags:
          "--yes (required), --dry-run, --aws-account-id (from email health), --subject, --channel (email or sms), --audience-type (all, topic or segment), --topic-id, --segment-id, --template-id, --html-content, --body, --from, --from-name, --reply-to, --preview-text, --sender-id, --variable-mappings, --scheduled-for (ISO time)",
        data: "id, status, channel, createdAt, totalRecipients, payload, dryRun, warning",
        notes: "--dry-run validates the payload locally and makes no request.",
      },
      {
        command: "broadcasts send <id>",
        summary:
          "Send a draft, from broadcasts draft or the dashboard. Broadcasts made with create are already queued.",
        flags:
          "--yes (required), --aws-account-id (from email health), --total-recipients (read it from broadcasts status)",
        data: "id, status, warning",
        notes: "Returns NOT_DRAFT for a broadcast that is not a draft.",
      },
      {
        command: "broadcasts status <id>",
        summary: "Show a broadcast's status and delivery counts.",
        data: "id, name, channel, status, totalRecipients, processedRecipients, sent, delivered, failed, opened, clicked, bounced, complained, suppressed, startedAt, completedAt, createdAt",
      },
      {
        command: "broadcasts recipients <id>",
        summary: "List the recipients of a broadcast.",
        flags: "--status, --limit (1-1000), --cursor (an offset)",
        data: "id, recipients, total, limit, offset, nextCursor",
      },
      {
        command: "broadcasts resume <id>",
        summary: "Resume a stopped broadcast.",
        flags: "--yes (required), --from-chunk-index",
        data: "id, resumed, fromChunkIndex",
        notes: "Can return RESUME_DISABLED.",
      },
      {
        command: "broadcasts cancel <id>",
        summary:
          "Cancel a scheduled, queued or processing broadcast. It calls the existing DELETE /v1/batch/{id}.",
        flags: "--yes (required), --dry-run",
        data: "id, status, cancelled, dryRun",
        notes:
          "Other statuses return NOT_CANCELLABLE. There is no cancel route, so this command uses the existing delete route.",
      },
      {
        command: "broadcasts duplicate <id>",
        summary: "Copy any broadcast into a new draft.",
        data: "id, status, name, sourceId",
        notes:
          "The copy is named <name> (copy). It keeps the content, audience and sender, but not the schedule. No --yes needed.",
      },
      {
        command: "broadcasts update <id>",
        summary:
          "Edit a scheduled broadcast. Takes the same content flags as broadcasts create, plus --clear-<field>.",
        flags: "--clear-<field> unsets a nullable field",
        data: "id, status, name, channel, subject, audienceType, topicId, segmentId, awsAccountId, scheduledFor, updatedFields",
        notes:
          "On current main the API edits scheduled broadcasts only. A draft is refused with a 400 that names its status, so set a draft's content with broadcasts draft.",
      },
    ],
  },
  {
    title: "Email Templates, Metrics and Health",
    commands: [
      {
        command: "email templates list",
        summary: "List templates.",
        flags:
          "--limit (1-100), --cursor, --status (DRAFT, PUBLISHED or ARCHIVED), --channel (email or sms), --search",
        data: "templates, nextCursor",
      },
      {
        command: "email templates get <id>",
        summary: "Show one template. The source is included by default.",
        flags: "--without-source",
        data: TEMPLATE_FIELDS,
      },
      {
        command: "email templates pull",
        summary: "Write every template to <slug>.tsx files in a local folder.",
        flags:
          "--out-dir (default wraps/templates), --dry-run, --yes (needed to overwrite existing files)",
        data: "outDir, dryRun, files (id, slug, path, exists, written), skipped",
        notes:
          "Refuses to overwrite existing local files unless --yes is given.",
      },
      {
        command: "email templates publish <id>",
        summary: "Publish a template to SES. This makes it live.",
        flags:
          "--yes (required), --aws-account-id (required when the organization has more than one AWS account)",
        data: "id, publishedAt, sesTemplateName, awsAccountId",
      },
      {
        command: "email templates duplicate <id>",
        summary: "Copy a template as a new draft.",
        data: TEMPLATE_FIELDS,
        notes: "The copy is always a DRAFT.",
      },
      {
        command: "email metrics",
        summary:
          "Aggregate sends, opens, clicks, bounces and cost for the organization.",
        flags:
          "--start-date, --end-date (ISO 8601), --timezone, --granularity (hourly, daily, weekly or monthly), --dimensions (period, domain, broadcast, template, source, account, region), --broadcast-id, --template-id, --aws-account-id (ID filters take up to 100 comma-separated values)",
        data: "object, totals, data, meta",
        notes:
          "Not paginated. Errors: INVALID_DATE, INVALID_DATE_RANGE, INVALID_GRANULARITY.",
      },
      {
        command: "email health",
        summary:
          "Check SES health per AWS account. Each account's id is the value for --aws-account-id.",
        data: "status, checkedAt, accounts (each with id, accountNumber, region, status, checkedAt, sandbox, productionAccessEnabled, sendingEnabled, enforcementStatus, quota, reputation)",
        notes:
          "The id is the awsAccount row id, not the 12-digit AWS account number.",
      },
    ],
  },
  {
    title: "Email Suppressions",
    commands: [
      {
        command: "email suppressions list",
        summary: "List the SES suppression list.",
        flags:
          "--account <awsAccountId>, --reason (bounce or complaint), --limit, --cursor",
        data: "entries (email, reason, awsAccountId, lastUpdated), nextCursor, hasMore, deniedAccountIds, unreachableAccountIds",
        notes:
          "Without --account it covers every connected AWS account. The cursor is opaque: repeat the same --account and --reason with it. A page can be empty while hasMore is true.",
      },
      {
        command: "email suppressions remove <email>",
        summary: "Remove one address from an AWS account's suppression list.",
        flags:
          "--account <awsAccountId> (required), --yes (required), --dry-run, --acknowledge-complaint",
        data: "email, awsAccountId, dryRun, wasPresent",
        notes:
          "An address suppressed for a spam complaint also needs --acknowledge-complaint. The CLI sends that flag only when you pass it. Pass it only after you have confirmed that sending to the address is safe.",
      },
    ],
  },
  {
    title: "Agent Approvals",
    commands: [
      {
        command: "email agent approvals list",
        summary: "List the approval queue.",
        flags: "--status (PENDING, APPROVED, REJECTED, SENT or FAILED)",
        data: "approvals, nextCursor",
        notes:
          "No --limit or --cursor. The whole queue is returned, and nextCursor is always null.",
      },
      {
        command: "email agent approvals approve --id <id>",
        summary: "Approve a pending send. This executes it.",
        flags: "--id (required), --yes (required)",
        data: APPROVAL_FIELDS,
      },
      {
        command: "email agent approvals reject --id <id>",
        summary: "Reject a pending send.",
        flags: "--id (required), --yes (required)",
        data: APPROVAL_FIELDS,
      },
    ],
  },
  {
    title: "Workflows",
    commands: [
      {
        command: "workflows list",
        summary: "List workflows, newest first.",
        flags:
          "--search (matches the name), --status (draft, enabled, paused or archived), --limit (1-100, default 50), --cursor (a page number)",
        data: "workflows, total, page, pageSize, totalPages, nextCursor",
      },
      {
        command: "workflows get <workflow-id>",
        summary: "Show one workflow and its run counts.",
        data: "id, name, description, status, triggerType, version, totalExecutions, activeExecutions, completedExecutions, failedExecutions, createdBy, createdAt, updatedAt",
      },
      {
        command: "workflows executions <workflow-id>",
        summary: "List a workflow's runs, newest first.",
        flags:
          "--status (pending, active, paused, waiting, completed, failed or cancelled), --limit (1-100, default 50), --cursor (a page number)",
        data: "workflowId, executions (each with its contact), total, page, pageSize, totalPages, nextCursor",
      },
      {
        command: "workflows execution <execution-id>",
        summary: "Show one run with its step trace.",
        data: "id, workflowId, contactId, status, currentStepId, startedAt, completedAt, createdAt, updatedAt, contact, workflowName, steps, stepEngagement",
      },
    ],
  },
  {
    title: "Workflow Runs",
    commands: [
      {
        command: "workflows trigger <workflow-id>",
        summary: "Trigger an API workflow for one contact.",
        flags:
          "--contact-id or --contact-email (one required), --data (JSON object), --yes (required), --dry-run",
        data: "workflowId, workflowName, contactId, contactEmail, data, dryRun, message",
        notes: "Returns WORKFLOW_REJECTED when the route rejects the run.",
      },
      {
        command: "workflows enable <workflow-id>",
        summary: "Create the next scheduled run.",
        flags: "--cron (required), --timezone, --yes (required)",
        data: "workflowId, scheduleName, cronExpression, timezone",
      },
      {
        command: "workflows disable <workflow-id>",
        summary: "Remove the pending scheduled run.",
        data: "workflowId, disabled",
        notes: "Does not need --yes.",
      },
      {
        command: "workflows retry <execution-id>",
        summary: "Retry a failed execution.",
        flags: "--yes (required)",
        data: "executionId, message",
      },
      {
        command: "workflows cancel <execution-id>",
        summary: "Cancel an in-progress execution.",
        flags: "--yes (required)",
        data: "executionId, cancelled",
      },
    ],
  },
  {
    title: "Inbound Email (read)",
    commands: [
      {
        command: "email inbound list",
        summary:
          "List inbound emails across the connected AWS accounts, read live from the SES inbound bucket.",
        flags:
          "--account (a Wraps account id), --limit (1-100, default 20), --cursor (opaque)",
        notes:
          "Results are in S3 key order, not received time. A page can be empty while nextCursor is set; keep going until it is null. Denied or unreadable accounts make the listing incomplete.",
      },
      {
        command: "email inbound get <emailId>",
        summary: "Show one inbound email.",
        flags: "--account (a Wraps account id), --json",
        notes:
          "htmlTruncated is true when the HTML body was longer than 200 KB and was cut. Attachments are listed as metadata only; their contents cannot be downloaded.",
      },
    ],
  },
  {
    title: "Brand Kits",
    commands: [
      {
        command: "brand-kits list",
        summary: "List every brand kit in the organization.",
        notes: "Not paginated: one response. The JSON output includes a total.",
      },
      {
        command: "brand-kits get <id>",
        summary: "Show one brand kit.",
      },
      {
        command: "brand-kits create",
        summary: "Create a brand kit. Pass --default to make it the default.",
        flags:
          "--name, --primary-color, --secondary-color, --background-color, --text-color, --font-family, --heading-font-family, --button-style, --button-radius, --company-name, --company-address, --social-links (a JSON array), --logo-url, --source-domain, --default",
        notes:
          "The first kit in the organization becomes the default. --default clears the previous default.",
      },
      {
        command: "brand-kits update <id>",
        summary:
          "Change any of the create fields. At least one flag is required.",
        flags: "The same flags as brand-kits create",
        notes:
          "Pass null to clear a nullable field: logo, heading font, company name, company address or source domain.",
      },
      {
        command: "brand-kits delete <id>",
        summary: "Delete a brand kit.",
        flags: "--yes (required), --dry-run",
        notes:
          "Templates that used the kit lose the link to it. Deleting the default promotes another kit.",
      },
      {
        command: "brand-kits set-default <id>",
        summary: "Make a brand kit the organization's default.",
        notes: "The previous default is cleared.",
      },
    ],
  },
  {
    title: "API Keys (session only)",
    commands: [
      {
        command: "api-keys list",
        summary: "List the organization's API keys. Metadata only.",
        data: "apiKeys",
        notes:
          "Not paginated: there is no --cursor or --limit. Sign in with wraps auth login first. An API key cannot manage API keys, so --token and WRAPS_API_KEY are refused with SESSION_REQUIRED.",
      },
      {
        command: "api-keys create --name <name>",
        summary: "Create an API key.",
        flags:
          "--name (required), --type (live, test or restricted), --permissions (full, readonly or a comma-separated list), --expires-in-days (1-3650)",
        data: "apiKey, secretKey",
        notes:
          "The secret is shown once, in secretKey. It cannot be shown again, so store it when the command returns. --org <id> picks the organization.",
      },
      {
        command: "api-keys revoke <id>",
        summary: "Revoke an API key permanently.",
        flags: "--yes (required), --dry-run",
        data: "id, revoked, dryRun",
        notes: "Any agent using the key stops working at once.",
      },
    ],
  },
  {
    title: "Audit Log (owners and admins)",
    commands: [
      {
        command: "audit-logs list",
        summary: "List audit log entries, newest first.",
        flags:
          "--action, --actor (a user id), --from, --to, --limit (1-100, default 50), --cursor",
        data: "data, nextCursor, retentionDays, canExtend",
        notes:
          "The cursor is opaque. --to is exclusive: --to 2026-10-08 stops before midnight UTC on October 8. Results are limited to the plan's history window.",
      },
      {
        command: "audit-logs export",
        summary: "Export audit log entries as JSON or CSV. Business plan.",
        flags:
          "--format (json or csv), --output <path>, --action, --actor, --from, --to, --yes (to overwrite --output)",
        data: "format, output, total, truncated, bytes (without --output in JSON mode: logs, total, truncated)",
        notes:
          "Exports up to 50,000 rows. The file is written only after the API answers. An existing file is not overwritten unless --yes is given. Each export writes an audit_log.exported entry.",
      },
    ],
  },
];

export default function CLIReferencePageContent() {
  return (
    <DocsLayout>
      {/* Page Header */}
      <div className="mb-12">
        <Badge className="mb-4" variant="outline">
          CLI Reference
        </Badge>
        <h1 className="mb-4 font-bold text-4xl tracking-tight">
          Wraps CLI Commands
        </h1>
        <p className="text-lg text-muted-foreground">
          Complete reference for all Wraps CLI commands. Deploy, manage, and
          monitor your AWS communication infrastructure.
        </p>
        <div className="mt-4 rounded-lg border bg-muted/50 p-4">
          <p className="text-muted-foreground text-sm">
            <strong>Multi-Service Architecture:</strong> Wraps commands are
            organized by service (e.g.,{" "}
            <code className="rounded bg-background px-1.5 py-0.5">
              wraps email init
            </code>
            ,{" "}
            <code className="rounded bg-background px-1.5 py-0.5">
              wraps cdn init
            </code>
            ,{" "}
            <code className="rounded bg-background px-1.5 py-0.5">
              wraps sms init
            </code>
            ).
          </p>
        </div>
      </div>

      {/* Service Commands */}
      <section className="mb-12">
        <h2 className="mb-6 font-bold text-2xl">Service Commands</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="transition-colors hover:border-primary/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Mail className="h-5 w-5 text-primary" />
                Email Commands
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-muted-foreground text-sm">
                Deploy and manage AWS SES email infrastructure with event
                tracking, analytics, and domain management.
              </p>
              <Button asChild className="w-full" variant="outline">
                <Link href="/docs/cli-reference/email">
                  View Email Commands
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="transition-colors hover:border-primary/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <HardDrive className="h-5 w-5 text-primary" />
                CDN Commands
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-muted-foreground text-sm">
                Deploy S3 + CloudFront CDN infrastructure with browser-based
                image optimization.
              </p>
              <Button asChild className="w-full" variant="outline">
                <Link href="/docs/cli-reference/cdn">
                  View CDN Commands
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="transition-colors hover:border-primary/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <MessageSquare className="h-5 w-5 text-primary" />
                SMS Commands
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-muted-foreground text-sm">
                Deploy AWS End User Messaging infrastructure for transactional
                and marketing SMS.
              </p>
              <Button asChild className="w-full" variant="outline">
                <Link href="/docs/cli-reference/sms">
                  View SMS Commands
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="transition-colors hover:border-primary/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <KeyRound className="h-5 w-5 text-primary" />
                Auth Commands
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-muted-foreground text-sm">
                Authenticate with the Wraps Platform for dashboard access,
                templates, and workflows.
              </p>
              <Button asChild className="w-full" variant="outline">
                <Link href="/docs/cli-reference/auth">
                  View Auth Commands
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="transition-colors hover:border-primary/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Cloud className="h-5 w-5 text-primary" />
                AWS Commands
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-muted-foreground text-sm">
                Set up and diagnose your AWS credentials and permissions.
              </p>
              <Button asChild className="w-full" variant="outline">
                <Link href="/docs/cli-reference/aws">
                  View AWS Commands
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="transition-colors hover:border-primary/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Blocks className="h-5 w-5 text-primary" />
                Platform Commands
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-muted-foreground text-sm">
                Connect your AWS infrastructure to the Wraps Platform.
              </p>
              <Button asChild className="w-full" variant="outline">
                <Link href="/docs/cli-reference/platform">
                  View Platform Commands
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Data Commands for Agents */}
      <section className="mb-12">
        <h2 className="mb-6 font-bold text-2xl">Data Commands for Agents</h2>
        <p className="mb-6 text-muted-foreground">
          These commands read and change data in your Wraps organization:
          contacts, topics, segments, templates, broadcasts, events, email
          suppressions, workflows, approvals, API keys and the audit log. They
          use the Wraps API and do not deploy AWS infrastructure.
        </p>
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">
              Authentication, Output and Exit Codes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-2 pl-5 text-muted-foreground text-sm">
              <li>
                Pass --token or set WRAPS_API_KEY. A token or key takes priority
                over a stored session from wraps auth login. Self-hosted
                instances follow wraps selfhost login.
              </li>
              <li>
                Every command below takes --json. Every command except api-keys
                takes --token. The api-keys commands refuse --token and
                WRAPS_API_KEY.
              </li>
              <li>
                With --json, stdout is one JSON object with success, command,
                and either data or error. The error object has code, message and
                suggestion. Command names are dotted, for example contacts.list.
              </li>
              <li>Every error sets exit code 1.</li>
              <li>
                Workflow routes can return HTTP 200 with success false. The CLI
                reports that as an error, so check the exit code or success
                field, not only the HTTP status.
              </li>
            </ul>
          </CardContent>
        </Card>
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">The --yes Rule</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-muted-foreground text-sm">
              These commands send email, make a live change or delete data.
              Without --yes they return CONFIRMATION_REQUIRED before making any
              request: contacts delete, contacts import with --validate,
              contacts validate, segments delete, topics delete, email
              suppressions remove, email templates publish, broadcasts create,
              broadcasts send, broadcasts resume, broadcasts cancel, workflows
              trigger, workflows enable, workflows retry, workflows cancel,
              email agent approvals approve, email agent approvals reject,
              api-keys revoke, and brand-kits delete.
            </p>
            <p className="text-muted-foreground text-sm">
              email templates pull fetches without --yes, but it refuses to
              overwrite existing local files unless --yes is given. contacts
              export --output and audit-logs export --output refuse to overwrite
              an existing file in the same way. workflows disable needs no
              --yes. broadcasts duplicate and broadcasts update need no --yes.
            </p>
          </CardContent>
        </Card>
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Pagination</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-muted-foreground text-sm">
              List commands take --limit and --cursor. Their data includes
              nextCursor, which is null when there are no more results. Pass it
              back unchanged as --cursor and do not construct it yourself. The
              cursor is a page number for contacts list, events list, topics
              subscribers, workflows list and workflows executions. It is an
              offset for topics list, segments list and broadcasts recipients.
              It is opaque for email suppressions list, audit-logs list and
              email inbound list. email agent approvals list, api-keys list,
              brand-kits list and email metrics are not paginated.
            </p>
          </CardContent>
        </Card>
        {DATA_COMMAND_GROUPS.map((group) => (
          <div className="mb-8" key={group.title}>
            <h3 className="mb-4 font-bold text-xl">{group.title}</h3>
            <div className="space-y-4">
              {group.commands.map((doc) => (
                <Card key={doc.command}>
                  <CardHeader>
                    <CardTitle className="font-mono text-base">
                      {`wraps ${doc.command}`}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <p className="text-muted-foreground">{doc.summary}</p>
                    {doc.flags ? (
                      <p>
                        <span className="font-medium">Flags:</span>{" "}
                        <span className="text-muted-foreground">
                          {doc.flags}
                        </span>
                      </p>
                    ) : null}
                    {doc.data ? (
                      <p>
                        <span className="font-medium">JSON data:</span>{" "}
                        <span className="text-muted-foreground">
                          {doc.data}
                        </span>
                      </p>
                    ) : null}
                    {doc.notes ? (
                      <p>
                        <span className="font-medium">Notes:</span>{" "}
                        <span className="text-muted-foreground">
                          {doc.notes}
                        </span>
                      </p>
                    ) : null}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </section>

      {/* Global Commands */}
      <section className="mb-12">
        <h2 className="mb-6 font-bold text-2xl">Global Commands</h2>
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              <div>
                <code className="rounded bg-muted px-2 py-1">wraps push</code>
                <p className="mt-2 text-muted-foreground text-sm">
                  Push templates and workflows to the Wraps Platform and SES
                </p>
              </div>
              <div>
                <code className="rounded bg-muted px-2 py-1">wraps news</code>
                <p className="mt-2 text-muted-foreground text-sm">
                  Show latest Wraps news and updates
                </p>
              </div>
              <div>
                <code className="rounded bg-muted px-2 py-1">
                  wraps support
                </code>
                <p className="mt-2 text-muted-foreground text-sm">
                  Open support channel
                </p>
              </div>
              <div>
                <code className="rounded bg-muted px-2 py-1">wraps update</code>
                <p className="mt-2 text-muted-foreground text-sm">
                  Update the CLI to the latest version. For standalone installs,
                  downloads the latest release from GitHub, verifies the
                  checksum, and replaces the binary. For npm installs, shows the
                  appropriate npm update command instead.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Global Flags */}
      <section className="mb-12">
        <h2 className="mb-6 font-bold text-2xl">Global Flags</h2>
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              <div>
                <code className="rounded bg-muted px-2 py-1">
                  --account &lt;id&gt;
                </code>
                <p className="mt-2 text-muted-foreground text-sm">
                  Target a specific AWS account
                </p>
              </div>
              <div>
                <code className="rounded bg-muted px-2 py-1">
                  --token &lt;token&gt;
                </code>
                <p className="mt-2 text-muted-foreground text-sm">
                  API token for authentication
                </p>
              </div>
              <div>
                <code className="rounded bg-muted px-2 py-1">--verbose</code>
                <p className="mt-2 text-muted-foreground text-sm">
                  Enable verbose output
                </p>
              </div>
              <div>
                <code className="rounded bg-muted px-2 py-1">--json</code>
                <p className="mt-2 text-muted-foreground text-sm">
                  Output JSON (where supported)
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Global Options */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">Global Options</h2>
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              <div>
                <code className="rounded bg-muted px-2 py-1">--help, -h</code>
                <p className="mt-2 text-muted-foreground text-sm">
                  Display help information for any command
                </p>
              </div>
              <div>
                <code className="rounded bg-muted px-2 py-1">
                  --version, -v
                </code>
                <p className="mt-2 text-muted-foreground text-sm">
                  Display the CLI version
                </p>
              </div>
              <div>
                <code className="rounded bg-muted px-2 py-1">--preview</code>
                <p className="mt-2 text-muted-foreground text-sm">
                  Preview infrastructure changes without deploying. Shows what
                  resources would be created, updated, or deleted along with
                  cost estimates. Available on all deployment commands (init,
                  connect, upgrade, restore, destroy).
                </p>
              </div>
              <div>
                <code className="rounded bg-muted px-2 py-1">-y, --yes</code>
                <p className="mt-2 text-muted-foreground text-sm">
                  Skip confirmation prompts for non-destructive operations
                </p>
              </div>
              <div>
                <code className="rounded bg-muted px-2 py-1">-f, --force</code>
                <p className="mt-2 text-muted-foreground text-sm">
                  Force destructive operations without confirmation
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* wraps status */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <Terminal className="h-6 w-6 text-primary" />
          wraps status
        </h2>
        <p className="mb-4 text-muted-foreground">
          Display the current status of your Wraps infrastructure across all
          services, including deployed resources, active features, and
          configuration details.
        </p>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-lg">Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <CLICommand command="npx @wraps.dev/cli status" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">What It Displays</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-2 pl-5 text-muted-foreground text-sm">
              <li>AWS account and region</li>
              <li>All deployed services (email, cdn, sms)</li>
              <li>Active configuration preset and features per service</li>
              <li>Deployed AWS resources</li>
              <li>Links to console and documentation</li>
            </ul>
          </CardContent>
        </Card>
      </section>

      {/* wraps console */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <Terminal className="h-6 w-6 text-primary" />
          wraps console
        </h2>
        <p className="mb-4 text-muted-foreground">
          Launch the local Wraps console to view analytics, event tracking, and
          infrastructure status across all services.
        </p>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-lg">Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <CLICommand command="npx @wraps.dev/cli console" />
          </CardContent>
        </Card>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-lg">Options</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <code className="rounded bg-muted px-2 py-1">
                  --port &lt;port&gt;
                </code>
                <p className="mt-2 text-muted-foreground text-sm">
                  Port to run the console on (default: 5555)
                </p>
              </div>
              <div>
                <code className="rounded bg-muted px-2 py-1">--no-open</code>
                <p className="mt-2 text-muted-foreground text-sm">
                  Don't automatically open browser
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Features</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-2 pl-5 text-muted-foreground text-sm">
              <li>Email history and search</li>
              <li>Delivery rates and analytics</li>
              <li>Bounce and complaint tracking</li>
              <li>Open and click rates</li>
              <li>CDN file management and uploads</li>
              <li>Infrastructure resource viewer</li>
            </ul>
          </CardContent>
        </Card>
      </section>

      {/* wraps destroy */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <Terminal className="h-6 w-6 text-primary" />
          wraps destroy
        </h2>
        <p className="mb-4 text-muted-foreground">
          Remove all Wraps infrastructure from your AWS account across all
          services. This is a destructive operation that requires confirmation.
        </p>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-lg">Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <CLICommand command="npx @wraps.dev/cli destroy [options]" />
          </CardContent>
        </Card>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-lg">Options</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <code className="rounded bg-muted px-2 py-1">-f, --force</code>
                <p className="mt-2 text-muted-foreground text-sm">
                  Skip confirmation prompt (use with caution)
                </p>
              </div>
              <div>
                <code className="rounded bg-muted px-2 py-1">--preview</code>
                <p className="mt-2 text-muted-foreground text-sm">
                  Preview what would be destroyed without making changes
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Important Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-muted-foreground text-sm">
              <p>
                Use service-specific destroy commands to remove individual
                services:
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    wraps email destroy
                  </code>{" "}
                  - Remove email infrastructure only
                </li>
                <li>
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    wraps cdn destroy
                  </code>{" "}
                  - Remove CDN infrastructure only
                </li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* wraps telemetry */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <Terminal className="h-6 w-6 text-primary" />
          wraps telemetry
        </h2>
        <p className="mb-4 text-muted-foreground">
          Manage anonymous telemetry settings. Wraps collects anonymous usage
          data to improve the CLI. No personal information, domains, or AWS
          credentials are ever collected.
        </p>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-lg">Usage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <CLICommand command="npx @wraps.dev/cli telemetry         # Show current status" />
            <CLICommand command="npx @wraps.dev/cli telemetry enable  # Enable telemetry" />
            <CLICommand command="npx @wraps.dev/cli telemetry disable # Disable telemetry" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">What We Collect</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-2 pl-5 text-muted-foreground text-sm">
              <li>Command names and success/failure status</li>
              <li>CLI version and operating system</li>
              <li>
                <strong>Never collected:</strong> domains, AWS credentials,
                email content, or any PII
              </li>
            </ul>
            <p className="mt-4 text-muted-foreground text-sm">
              You can also disable telemetry by setting the environment variable{" "}
              <code className="rounded bg-muted px-1 py-0.5">
                WRAPS_TELEMETRY_DISABLED=1
              </code>
            </p>
          </CardContent>
        </Card>
      </section>

      {/* wraps completion */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <Terminal className="h-6 w-6 text-primary" />
          wraps completion
        </h2>
        <p className="mb-4 text-muted-foreground">
          Generate shell completion scripts for bash, zsh, or fish. Enables
          tab-completion for all Wraps commands and options.
        </p>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-lg">Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <CLICommand command="npx @wraps.dev/cli completion" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Setup</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-muted-foreground text-sm">
              Add the output to your shell configuration file:
            </p>
            <div className="space-y-2">
              <p className="text-muted-foreground text-sm">
                <strong>Bash:</strong> Add to ~/.bashrc
              </p>
              <p className="text-muted-foreground text-sm">
                <strong>Zsh:</strong> Add to ~/.zshrc
              </p>
              <p className="text-muted-foreground text-sm">
                <strong>Fish:</strong> Add to ~/.config/fish/config.fish
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Configuration Files */}
      <section className="mb-12">
        <h2 className="mb-6 font-bold text-2xl">Configuration Files</h2>
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              <div>
                <code className="rounded bg-muted px-2 py-1">~/.wraps/</code>
                <p className="mt-2 text-muted-foreground text-sm">
                  Main configuration directory containing deployment metadata
                  and Pulumi state
                </p>
              </div>
              <div>
                <code className="rounded bg-muted px-2 py-1">
                  ~/.wraps/connections/
                </code>
                <p className="mt-2 text-muted-foreground text-sm">
                  Deployment metadata files (one per AWS account/region
                  combination)
                </p>
              </div>
              <div>
                <code className="rounded bg-muted px-2 py-1">
                  ~/.wraps/pulumi/
                </code>
                <p className="mt-2 text-muted-foreground text-sm">
                  Pulumi stack state files for infrastructure management
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Environment Variables */}
      <section className="mb-12">
        <h2 className="mb-6 font-bold text-2xl">Environment Variables</h2>
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              <div>
                <code className="rounded bg-muted px-2 py-1">AWS_PROFILE</code>
                <p className="mt-2 text-muted-foreground text-sm">
                  AWS CLI profile to use for authentication
                </p>
              </div>
              <div>
                <code className="rounded bg-muted px-2 py-1">AWS_REGION</code>
                <p className="mt-2 text-muted-foreground text-sm">
                  Default AWS region (can be overridden with --region flag)
                </p>
              </div>
              <div>
                <code className="rounded bg-muted px-2 py-1">
                  AWS_ACCESS_KEY_ID
                </code>
                <p className="mt-2 text-muted-foreground text-sm">
                  AWS access key (not recommended, use IAM roles or profiles
                  instead)
                </p>
              </div>
              <div>
                <code className="rounded bg-muted px-2 py-1">
                  AWS_SECRET_ACCESS_KEY
                </code>
                <p className="mt-2 text-muted-foreground text-sm">
                  AWS secret key (not recommended, use IAM roles or profiles
                  instead)
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Help Section */}
      <Card className="bg-muted/50">
        <CardContent className="p-8 text-center">
          <h3 className="mb-2 font-bold text-xl">Need Help?</h3>
          <p className="mb-4 text-muted-foreground">
            If you run into any issues, check our GitHub discussions or open an
            issue.
          </p>
          <Button asChild>
            <a
              href="https://github.com/wraps-team/wraps/discussions"
              rel="noopener noreferrer"
              target="_blank"
            >
              Get Help
              <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </CardContent>
      </Card>
    </DocsLayout>
  );
}
