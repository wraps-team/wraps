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
    title: "Broadcasts",
    commands: [
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
          "Send a draft made in the dashboard. Broadcasts made with create are already queued.",
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
          contacts, segments, templates, broadcasts, workflow runs and
          approvals. They use the Wraps API and do not deploy AWS
          infrastructure.
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
              <li>Every command below takes --token and --json.</li>
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
              request: contacts delete, segments delete, email templates
              publish, broadcasts create, broadcasts send, broadcasts resume,
              workflows trigger, workflows enable, workflows retry, workflows
              cancel, email agent approvals approve, and email agent approvals
              reject.
            </p>
            <p className="text-muted-foreground text-sm">
              email templates pull fetches without --yes, but it refuses to
              overwrite existing local files unless --yes is given. workflows
              disable needs no --yes.
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
              back unchanged as --cursor and do not construct it yourself. email
              agent approvals list has no --limit or --cursor, and email metrics
              is not paginated.
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
