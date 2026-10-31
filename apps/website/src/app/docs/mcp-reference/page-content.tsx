"use client";

import { Badge } from "@wraps/ui/components/ui/badge";
import { Button } from "@wraps/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import { ArrowRight, Bot, CheckCircle2 } from "lucide-react";
import Link from "next/link";
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

const hostedConfig = `{
  "mcpServers": {
    "wraps-docs": {
      "type": "http",
      "url": "https://wraps.dev/mcp"
    }
  }
}`;

const hostedCurl = `curl -s https://wraps.dev/mcp \\
  -H 'content-type: application/json' \\
  -H 'accept: application/json' \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`;

const claudeCodeConfig = `{
  "mcpServers": {
    "wraps": {
      "command": "npx",
      "args": ["-y", "@wraps.dev/mcp"],
      "env": {
        "AWS_REGION": "us-east-1"
      }
    }
  }
}`;

const claudeDesktopConfig = `{
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
}`;

const writeModeConfig = `{
  "mcpServers": {
    "wraps": {
      "command": "npx",
      "args": ["-y", "@wraps.dev/mcp"],
      "env": {
        "AWS_REGION": "us-east-1",
        "WRAPS_WRITE_ENABLED": "true",
        "WRAPS_FROM_EMAIL": "you@yourdomain.com",
        "WRAPS_ALLOWED_RECIPIENT_DOMAINS": "yourcompany.com"
      }
    }
  }
}`;

const apiKeyConfig = `{
  "mcpServers": {
    "wraps": {
      "command": "npx",
      "args": ["-y", "@wraps.dev/mcp"],
      "env": {
        "AWS_REGION": "us-east-1",
        "WRAPS_API_KEY": "wraps_..."
      }
    }
  }
}`;

const tools = [
  {
    name: "list_recent_sends",
    write: false,
    description: "List recent sends from your email history",
  },
  {
    name: "get_email_event_log",
    write: false,
    description:
      "Full delivery event log for a message (Send, Delivery, Bounce, Complaint, Open, Click)",
  },
  {
    name: "verify_domain_status",
    write: false,
    description: "Verification and DKIM status of a sending domain",
  },
  {
    name: "list_suppressions",
    write: false,
    description:
      "Addresses on your SES suppression list, filterable by BOUNCE or COMPLAINT",
  },
  {
    name: "estimate_cost",
    write: false,
    description:
      "Monthly Wraps + AWS cost for a send volume, including which SES pricing plan the account is on — needs no AWS credentials",
  },
  {
    name: "get_setup_status",
    write: false,
    description:
      "Check whether the account is in the SES sandbox, and get the next step toward a first send",
  },
  {
    name: "send_email",
    write: true,
    description:
      "Send a transactional email via your SES account (requires WRAPS_WRITE_ENABLED=true)",
  },
  {
    name: "check_send_status",
    write: false,
    description:
      "Poll the outcome of a pending_approval send by approvalId (enforced mode only)",
  },
  {
    name: "list_contacts",
    write: false,
    description:
      "List contacts in your Wraps organization, optionally filtered by email status, SMS status, preferred channel, or a search string on email or phone.",
  },
  {
    name: "get_contact",
    write: false,
    description: "Get one contact in full, including its topic subscriptions.",
  },
  {
    name: "create_contact",
    write: true,
    description: "Create one new contact.",
  },
  {
    name: "update_contact",
    write: true,
    description: "Change one existing contact.",
  },
  {
    name: "set_contact_topics",
    write: true,
    description: "REPLACE the full topic subscription list of one contact.",
  },
  {
    name: "delete_contact",
    write: true,
    description:
      "Permanently delete ONE contact by UUID, email, or externalId. Needs confirm: true.",
  },
  {
    name: "validate_contact_emails",
    write: false,
    description:
      "Check up to 100 email addresses with SES Email Address Insights and return a deliverability verdict (HIGH, MEDIUM, LOW, or UNKNOWN) for each.",
  },
  {
    name: "export_contacts",
    write: false,
    description:
      "Export the contacts that match optional filters, newest first, up to 1,000 rows per call. truncated is true when more contacts matched; there is no paging, so narrow the filters and call again.",
  },
  {
    name: "import_contacts",
    write: true,
    description:
      "Import up to 10,000 contacts in one call and get back created, updated, skipped and invalid counts, with the reason for each rejected row. Changing existing contacts (duplicateStrategy update) needs confirm: true.",
  },
  {
    name: "list_segments",
    write: false,
    description:
      "List the audience segments saved in this Wraps organization, with each segment's live member count.",
  },
  {
    name: "get_segment",
    write: false,
    description:
      "Get one audience segment by id, including its full filter condition and live member count.",
  },
  {
    name: "preview_segment",
    write: false,
    description:
      "Preview the audience an unsaved filter condition would reach, without saving a segment.",
  },
  {
    name: "create_segment",
    write: true,
    description: "Save a new audience segment from a filter condition.",
  },
  {
    name: "update_segment",
    write: true,
    description:
      "Change an existing audience segment: rename it, edit its description, replace its condition, or toggle trackMembership.",
  },
  {
    name: "delete_segment",
    write: true,
    description: "Permanently delete an audience segment. Needs confirm: true.",
  },
  {
    name: "list_topics",
    write: false,
    description:
      "List the organization's subscription topics with live audience counts: subscriberCount (opted in), sendableCount (a broadcast would reach now) and pendingCount (waiting on double opt-in).",
  },
  {
    name: "get_topic",
    write: false,
    description:
      "Get one subscription topic by id, with its audience counts (subscriberCount, sendableCount, pendingCount) and its creator.",
  },
  {
    name: "list_topic_subscribers",
    write: false,
    description:
      "List the contacts subscribed to one topic, filtered by status (subscribed, pending for double opt-in not yet confirmed, or unsubscribed).",
  },
  {
    name: "create_topic",
    write: true,
    description:
      "Create a subscription topic that contacts can subscribe to and broadcasts can target.",
  },
  {
    name: "update_topic",
    write: true,
    description:
      "Change a subscription topic's name, slug, description, public flag or double opt-in setting.",
  },
  {
    name: "delete_topic",
    write: true,
    description:
      "Permanently delete a subscription topic and every subscription to it. Needs confirm: true.",
  },
  {
    name: "list_templates",
    write: false,
    description: "List the Wraps email and SMS templates in your organization.",
  },
  {
    name: "get_template",
    write: false,
    description:
      "Get one Wraps template by id: its metadata, status, variables, and by default its React Email source, compiled HTML, and compiled text.",
  },
  {
    name: "create_template",
    write: true,
    description: "Create a new Wraps email or SMS template as a DRAFT.",
  },
  {
    name: "update_template",
    write: true,
    description: "Change an existing Wraps template.",
  },
  {
    name: "duplicate_template",
    write: true,
    description: "Copy an existing Wraps template to start a variant.",
  },
  {
    name: "publish_template",
    write: true,
    description:
      "Publish a Wraps template to SES, so sends and workflows that use it get this content. Needs confirm: true.",
  },
  {
    name: "delete_template",
    write: true,
    description:
      "Permanently delete up to 100 templates, with their versions, and their published SES copies where no other template uses the same SES name. Refused with 409 (nothing deleted) while a scheduled, queued or processing broadcast, or an enabled workflow, uses one. Needs confirm: true.",
  },
  {
    name: "list_broadcasts",
    write: false,
    description:
      "List broadcasts (email or SMS batch sends) for your organization, with their status and delivery counts.",
  },
  {
    name: "get_broadcast",
    write: false,
    description: "Get the status and delivery counts of ONE broadcast by id.",
  },
  {
    name: "list_broadcast_recipients",
    write: false,
    description:
      "List the per-recipient outcome of one broadcast: who was sent to, and whether each send was delivered, bounced, suppressed or failed, with the error reason.",
  },
  {
    name: "get_broadcast_clicks",
    write: false,
    description:
      "Get the link-click breakdown for ONE broadcast: which URLs were clicked and how often, plus the unsubscribe click count.",
  },
  {
    name: "create_broadcast",
    write: true,
    description: "Create a NEW broadcast as a draft.",
  },
  {
    name: "update_broadcast",
    write: true,
    description:
      "Edit a SCHEDULED broadcast before it sends: its content, sender, audience, template, AWS account or send time.",
  },
  {
    name: "duplicate_broadcast",
    write: true,
    description:
      "Copy an existing broadcast into a NEW draft, whatever the status of the original.",
  },
  {
    name: "send_broadcast",
    write: true,
    description:
      "Send a DRAFT broadcast to its audience, now or at scheduledFor. Needs confirm: true.",
  },
  {
    name: "resume_broadcast",
    write: true,
    description:
      "Resume an email broadcast that stopped part-way, from the last chunk it finished, so recipients who were not yet sent to get the message. Needs confirm: true.",
  },
  {
    name: "cancel_broadcast",
    write: true,
    description:
      "Cancel a broadcast that is scheduled, queued or processing, so the messages that have not gone out yet are not sent. Needs confirm: true.",
  },
  {
    name: "list_events",
    write: false,
    description:
      "List custom events tracked for this Wraps organization, newest first, optionally filtered by event name, contact, text search, or date range.",
  },
  {
    name: "get_event",
    write: false,
    description:
      "Get one custom event by id: its name, properties, time, and the contact it belongs to.",
  },
  {
    name: "get_event_analytics",
    write: false,
    description:
      "Get custom-event totals for this organization over the last 7 or 30 days: events in the period, active contacts, average events per contact, a zero-filled daily series, and the top event names.",
  },
  {
    name: "list_event_names",
    write: false,
    description:
      "List every distinct custom event name recorded for this Wraps organization, sorted.",
  },
  {
    name: "track_event",
    write: true,
    description: "Record a custom event for one contact. Needs confirm: true.",
  },
  {
    name: "add_suppression",
    write: true,
    description:
      "Add up to 100 addresses to the SES account-level suppression list of one AWS account, so Wraps stops sending to them. Undo one address at a time with remove_suppression. Needs confirm: true.",
  },
  {
    name: "remove_suppression",
    write: true,
    description:
      "Remove one address from the SES account-level suppression list of one AWS account, so Wraps sends to it again. Needs confirm: true.",
  },
  {
    name: "list_workflows",
    write: false,
    description:
      "List the email and SMS automation workflows in your Wraps organization, newest first, with status and execution counts.",
  },
  {
    name: "get_workflow",
    write: false,
    description:
      "Get one workflow by id, including its trigger config, steps and transitions, so you can see what it does before triggering it or changing its schedule.",
  },
  {
    name: "list_workflow_executions",
    write: false,
    description:
      "List the executions of one workflow (one run per contact), newest first, each with its contact and status.",
  },
  {
    name: "get_workflow_execution",
    write: false,
    description:
      "Get one workflow execution by id, with its step trace (every step it reached and that step status), its contact, the workflow name and per-step engagement.",
  },
  {
    name: "enable_workflow_schedule",
    write: true,
    description:
      "Turn on the recurring schedule of a schedule-triggered workflow by creating its next one-time run from a cron expression and timezone.",
  },
  {
    name: "disable_workflow_schedule",
    write: true,
    description:
      "Turn off the recurring schedule of a schedule-triggered workflow by deleting its pending scheduled run.",
  },
  {
    name: "trigger_workflow",
    write: true,
    description:
      "Start one run of an API-triggered workflow for one contact, so the workflow steps begin for that contact now. Needs confirm: true.",
  },
  {
    name: "retry_workflow_execution",
    write: true,
    description:
      "Retry a failed workflow execution from the step where it failed. Needs confirm: true.",
  },
  {
    name: "cancel_workflow_execution",
    write: true,
    description:
      "Cancel a workflow execution that is still running (pending, active, paused or waiting), so no further steps run for that contact and its scheduled steps are removed. Needs confirm: true.",
  },
  {
    name: "list_agents",
    write: false,
    description:
      "List the leashed agents in your organization: each one's sending address, send policy (hourly and daily caps and recipient allowlists), and whether it is ACTIVE or KILLED.",
  },
  {
    name: "create_agent",
    write: true,
    description:
      "Create a leashed agent: a named sender with its own address and send policy. Recorded in Wraps only; its AWS resources are deployed with the CLI. Needs an owner or admin. Not registered in enforced mode.",
  },
  {
    name: "kill_agent",
    write: true,
    description:
      "Kill one leashed agent so it can no longer send. Irreversible: no route returns a killed agent to ACTIVE. Needs an owner or admin and confirm: true. Not registered in enforced mode.",
  },
  {
    name: "set_agent_policy",
    write: true,
    description:
      "Replace one leashed agent's send policy in full: hourly and daily caps and both recipient allowlists. Overwrites the previous policy. Needs an owner or admin and confirm: true. Not registered in enforced mode.",
  },
  {
    name: "list_agent_approvals",
    write: false,
    description:
      "List the approval queue for agents: the sends that an agent asked to make and that were held for a human decision.",
  },
  {
    name: "approve_agent_approval",
    write: true,
    description:
      "Approve one send that an agent asked to make and that was held for a human decision, so Wraps sends it now. Needs confirm: true.",
  },
  {
    name: "reject_agent_approval",
    write: true,
    description:
      "Reject one send that an agent asked to make and that was held for a human decision, so it is never delivered. Needs confirm: true.",
  },
  {
    name: "get_email_metrics",
    write: false,
    description:
      "Get aggregate email sending metrics for this organization over a time window: sent, delivered, bounced (split into permanent, transient and undetermined), complained, suppressed, opened, clicked, failed, and an estimated costUsd.",
  },
  {
    name: "list_inbound_emails",
    write: false,
    description:
      "List one page of parsed inbound emails that the customer's SES inbound bucket received, across the organization's connected AWS accounts.",
  },
  {
    name: "get_inbound_email",
    write: false,
    description:
      "Get one parsed inbound email from the customer's SES inbound bucket by emailId, with its from/to/cc, subject, date, headers, text body, HTML body and attachment metadata.",
  },
  {
    name: "get_account_health",
    write: false,
    description:
      "Get the SES sending health of the AWS accounts connected to your organization: status, when it was last checked, quota, reputation and the reasons for the status. Reads the verdict the hourly sweep last saved, with no AWS calls.",
  },
  {
    name: "email_check",
    write: false,
    description:
      "Check a domain's SPF, DKIM, DMARC, MX, blacklist and related setup, and return a grade with the issues that cost points. Read-only, sends no mail. The request is public and rate limited to 10 per minute per IP.",
  },
  {
    name: "list_brand_kits",
    write: false,
    description:
      "List the organization's brand kits: name, logo, colors, fonts, button style, company details and social links, with isDefault marking the one default kit.",
  },
  {
    name: "get_brand_kit",
    write: false,
    description:
      "Get one brand kit by id: logo, colors, fonts, button style, company details, social links, and isDefault.",
  },
  {
    name: "create_brand_kit",
    write: true,
    description:
      "Create a brand kit: a name, logo, colors, fonts, button style, company details and social links that email templates can use.",
  },
  {
    name: "update_brand_kit",
    write: true,
    description:
      "Change one or more fields of a brand kit: name, logo, colors, fonts, button style, company details, social links.",
  },
  {
    name: "set_default_brand_kit",
    write: true,
    description: "Make one brand kit the default for the organization.",
  },
  {
    name: "delete_brand_kit",
    write: true,
    description: "Delete a brand kit permanently. Needs confirm: true.",
  },
];

const configVars = [
  {
    name: "AWS_REGION",
    required: "Yes",
    defaultValue: "—",
    description: "AWS region where your Wraps stack is deployed",
  },
  {
    name: "WRAPS_HISTORY_TABLE_NAME",
    required: "No",
    defaultValue: "wraps-email-history",
    description: "DynamoDB table name for email history",
  },
  {
    name: "WRAPS_ACCOUNT_ID",
    required: "No",
    defaultValue: "auto-detected via STS",
    description: "Your AWS account ID (skips the STS call if set)",
  },
  {
    name: "WRAPS_WRITE_ENABLED",
    required: "No",
    defaultValue: "false",
    description:
      "Set to true to enable send_email and every write or destructive API-backed tool",
  },
  {
    name: "WRAPS_FROM_EMAIL",
    required: "No",
    defaultValue: "—",
    description: "Default from address for send_email",
  },
  {
    name: "WRAPS_CONFIGURATION_SET",
    required: "No",
    defaultValue: "—",
    description:
      "SES configuration set applied to sends (enables open/click tracking)",
  },
  {
    name: "WRAPS_API_KEY",
    required: "No",
    defaultValue: "—",
    description:
      "Wraps API key (wraps_...) for the API-backed tools. Without it, the session from wraps auth login is used",
  },
  {
    name: "WRAPS_API_URL",
    required: "No",
    defaultValue: "https://api.wraps.dev",
    description: "Wraps API base URL. Set it for a self-hosted control plane",
  },
  {
    name: "WRAPS_ORG_ID",
    required: "No",
    defaultValue: "—",
    description:
      "Organization to act in when the session belongs to several. Sent as x-organization-id",
  },
];

const guardrailVars = [
  {
    name: "WRAPS_ALLOWED_RECIPIENTS",
    defaultValue: "— (no restriction)",
    description:
      "Comma-separated exact addresses the agent may send to. If set, any address not in this list (or the domains list) is rejected.",
  },
  {
    name: "WRAPS_ALLOWED_RECIPIENT_DOMAINS",
    defaultValue: "— (no restriction)",
    description:
      "Comma-separated domains the agent may send to. Matching is exact: example.com allows user@example.com but not subdomains — list each subdomain explicitly.",
  },
  {
    name: "WRAPS_MAX_RECIPIENTS",
    defaultValue: "50",
    description: "Maximum number of recipients per send_email call.",
  },
  {
    name: "WRAPS_ALLOW_FROM_OVERRIDE",
    defaultValue: "false",
    description:
      "Set to true to let the agent supply a from address that differs from WRAPS_FROM_EMAIL. When false, a mismatched from is rejected.",
  },
];

function ConfigBlock({
  filename,
  code,
  language = "json",
}: {
  filename: string;
  code: string;
  language?: string;
}) {
  return (
    <CodeBlock
      className="h-auto"
      data={[{ language, filename, code }]}
      defaultValue={language}
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
  );
}

export default function McpReferencePageContent() {
  return (
    <DocsLayout>
      <div className="mb-12">
        <Badge className="mb-4" variant="outline">
          <Bot className="mr-1.5 size-3" /> MCP Reference
        </Badge>
        <h1 className="mb-4 font-bold text-4xl tracking-tight">MCP Server</h1>
        <p className="text-lg text-muted-foreground">
          <code className="rounded bg-muted px-1.5 py-0.5">@wraps.dev/mcp</code>{" "}
          gives AI agents access to your AWS SES sending history, delivery
          events, domain status, and suppression list — and, optionally, the
          ability to send email. It runs locally over stdio; your AWS
          credentials never leave your machine.
        </p>
      </div>

      {/* Hosted docs server */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">
          Hosted server: docs and pricing
        </h2>
        <p className="mb-4 text-muted-foreground">
          There is a second, public server at{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">
            https://wraps.dev/mcp
          </code>{" "}
          over the Streamable HTTP transport. It answers questions{" "}
          <em>about</em> Wraps — it never touches your AWS account, so it needs
          no credentials, no API key, and no account. Four read-only tools:{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">search_docs</code>,{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">get_doc</code>,{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">list_docs</code>, and{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">estimate_cost</code>.
        </p>
        <div className="mb-4">
          <ConfigBlock code={hostedConfig} filename=".mcp.json" />
        </div>
        <p className="mb-4 text-muted-foreground">
          Or call it directly — it is plain JSON-RPC over HTTPS:
        </p>
        <div className="mb-4">
          <ConfigBlock code={hostedCurl} filename="terminal" language="bash" />
        </div>
        <p className="text-muted-foreground">
          A manifest covering both servers is published at{" "}
          <a
            className="text-brand-text underline underline-offset-4"
            href="/.well-known/mcp.json"
          >
            /.well-known/mcp.json
          </a>
          . Everything below this section is about the local server.
        </p>
      </section>

      <Card className="mb-12">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            Prerequisites
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-muted-foreground">
            Before you begin, make sure you have:
          </p>
          <ul className="list-disc space-y-2 pl-6 text-muted-foreground">
            <li>
              A Wraps email stack deployed (
              <code className="rounded bg-muted px-1.5 py-0.5">
                wraps email init
              </code>
              )
            </li>
            <li>
              AWS credentials configured in your environment — the same profile
              the Wraps CLI uses
            </li>
            <li>
              A Wraps API key (WRAPS_API_KEY) or a wraps auth login session, for
              the API-backed tools
            </li>
          </ul>
        </CardContent>
      </Card>

      {/* Tools */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">Tools</h2>
        <p className="mb-4 text-muted-foreground">
          The server exposes the AWS tools and, with a Wraps API credential, the
          API-backed tools. Tools marked write change data and stay disabled
          until WRAPS_WRITE_ENABLED=true. Destructive tools also need confirm:
          true.
        </p>
        <Card>
          <CardContent className="p-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="pb-2 text-left">Tool</th>
                    <th className="pb-2 text-left">Description</th>
                    <th className="pb-2 text-left">Access</th>
                  </tr>
                </thead>
                <tbody className="text-muted-foreground">
                  {tools.map((tool) => (
                    <tr className="border-b last:border-0" key={tool.name}>
                      <td className="py-2 pr-4 font-medium font-mono text-foreground text-xs">
                        {tool.name}
                      </td>
                      <td className="py-2 pr-4">{tool.description}</td>
                      <td className="py-2">
                        <Badge variant={tool.write ? "brand" : "outline"}>
                          {tool.write ? "write" : "read"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Setup */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">Setup</h2>

        <h3 className="mb-3 font-medium text-lg">Claude Code</h3>
        <p className="mb-4 text-muted-foreground">
          Add to{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">.mcp.json</code> in
          your project root. Claude Code passes your shell environment through,
          so whichever AWS credentials you already use are picked up. Set{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">AWS_REGION</code>{" "}
          here regardless: the server reads the region from its own environment
          — either that or{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">
            AWS_DEFAULT_REGION
          </code>{" "}
          — and never from your AWS config file, so it exits on startup without
          one.
        </p>
        <div className="mb-8">
          <ConfigBlock code={claudeCodeConfig} filename=".mcp.json" />
        </div>

        <h3 className="mb-3 font-medium text-lg">
          Claude Desktop, Cursor, Windsurf
        </h3>
        <p className="mb-4 text-muted-foreground">
          GUI clients inherit nothing from your shell, so any credential
          settings belong in the same{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">env</code> block
          alongside the region. For Claude Desktop the file is{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">
            ~/Library/Application Support/Claude/claude_desktop_config.json
          </code>
          ; for Cursor it's{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">
            .cursor/mcp.json
          </code>
          .
        </p>
        <ConfigBlock
          code={claudeDesktopConfig}
          filename="claude_desktop_config.json"
        />
      </section>

      {/* API-backed tools */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">API-backed tools</h2>
        <p className="mb-4 text-muted-foreground">
          The API-backed tools call the Wraps API for your organization. They
          register at startup only when a credential is present. Write tools
          need{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">
            WRAPS_WRITE_ENABLED=true
          </code>
          . Destructive tools also need{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">confirm: true</code>{" "}
          in the call, so set it only after the user has confirmed the change.
        </p>
        <p className="mb-4 text-muted-foreground">
          The server uses{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">WRAPS_API_KEY</code>{" "}
          when it is set. Otherwise it reuses the unexpired session that{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">
            wraps auth login
          </code>{" "}
          stored. An expired or revoked credential does not stop startup; the
          call returns a tool error that names the fix.
        </p>
        <div className="mb-4">
          <ConfigBlock code={apiKeyConfig} filename=".mcp.json" />
        </div>
        <p className="text-muted-foreground">
          When{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">WRAPS_AGENT_ID</code>{" "}
          is set (enforced mode),{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">
            approve_agent_approval
          </code>
          ,{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">
            reject_agent_approval
          </code>
          , <code className="rounded bg-muted px-1.5 py-0.5">create_agent</code>
          , <code className="rounded bg-muted px-1.5 py-0.5">kill_agent</code>{" "}
          and{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">
            set_agent_policy
          </code>{" "}
          are not registered, so an enforced agent cannot approve or reject its
          own sends, or create agents, kill them or change their policies.
          list_agents stays registered.
        </p>
      </section>

      {/* Configuration */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">Configuration</h2>
        <p className="mb-4 text-muted-foreground">
          All configuration is via environment variables.
        </p>
        <Card>
          <CardContent className="p-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="pb-2 text-left">Variable</th>
                    <th className="pb-2 text-left">Required</th>
                    <th className="pb-2 text-left">Default</th>
                    <th className="pb-2 text-left">Description</th>
                  </tr>
                </thead>
                <tbody className="text-muted-foreground">
                  {configVars.map((row) => (
                    <tr className="border-b last:border-0" key={row.name}>
                      <td className="py-2 pr-4 font-medium font-mono text-foreground text-xs">
                        {row.name}
                      </td>
                      <td className="py-2 pr-4">{row.required}</td>
                      <td className="py-2 pr-4">{row.defaultValue}</td>
                      <td className="py-2">{row.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Write mode */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">Write mode</h2>
        <p className="mb-4 text-muted-foreground">
          <code className="rounded bg-muted px-1.5 py-0.5">send_email</code> is
          disabled by default. Set{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">
            WRAPS_WRITE_ENABLED=true
          </code>{" "}
          to enable it, along with every other write tool. The{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">from</code> address
          must belong to a domain verified in your SES account.
        </p>
        <div className="mb-4">
          <ConfigBlock code={writeModeConfig} filename=".mcp.json" />
        </div>
        <div className="rounded-lg border-warning border-l-4 bg-warning/10 p-4">
          <p className="font-medium text-sm">No allowlist means no limits</p>
          <p className="mt-2 text-muted-foreground text-sm">
            Running with{" "}
            <code className="rounded bg-muted px-1.5 py-0.5">
              WRAPS_WRITE_ENABLED=true
            </code>{" "}
            and no allowlist gives the agent unrestricted send capability to any
            address your SES account can reach. Set the guardrails below.
          </p>
        </div>
      </section>

      {/* Send guardrails */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">Send guardrails</h2>
        <p className="mb-4 text-muted-foreground">
          These variables apply to send_email only. When write mode is enabled,
          use them to restrict the agent's sending scope. A recipient is allowed
          if it matches either the address list or the domain list.
        </p>
        <Card>
          <CardContent className="p-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="pb-2 text-left">Variable</th>
                    <th className="pb-2 text-left">Default</th>
                    <th className="pb-2 text-left">Description</th>
                  </tr>
                </thead>
                <tbody className="text-muted-foreground">
                  {guardrailVars.map((row) => (
                    <tr className="border-b last:border-0" key={row.name}>
                      <td className="py-2 pr-4 font-medium font-mono text-foreground text-xs">
                        {row.name}
                      </td>
                      <td className="py-2 pr-4">{row.defaultValue}</td>
                      <td className="py-2">{row.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Enforced mode */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">Enforced mode</h2>
        <p className="mb-4 text-muted-foreground">
          For agents provisioned via{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">
            wraps email agent create
          </code>
          , the MCP server runs in enforced mode. The agent's AWS credential can
          only invoke an enforcer Lambda in your account — never SES directly.
          Kill-switch, recipient allowlist, and hourly/daily caps are decided by
          that Lambda, so the local guardrails above don't apply.
        </p>
        <p className="mb-4 text-muted-foreground">
          Enforced mode activates when both{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">WRAPS_AGENT_ID</code>{" "}
          and{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">
            WRAPS_AGENT_ENFORCER_ARN
          </code>{" "}
          are set.{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">send_email</code>{" "}
          then returns a structured disposition instead of an error for policy
          outcomes:
        </p>
        <ul className="mb-4 list-disc space-y-2 pl-6 text-muted-foreground">
          <li>
            <code className="rounded bg-muted px-1.5 py-0.5">sent</code> —
            delivered, with a{" "}
            <code className="rounded bg-muted px-1.5 py-0.5">messageId</code>
          </li>
          <li>
            <code className="rounded bg-muted px-1.5 py-0.5">
              pending_approval
            </code>{" "}
            — an operator must approve; poll{" "}
            <code className="rounded bg-muted px-1.5 py-0.5">
              check_send_status
            </code>{" "}
            with the returned{" "}
            <code className="rounded bg-muted px-1.5 py-0.5">approvalId</code>
          </li>
          <li>
            <code className="rounded bg-muted px-1.5 py-0.5">blocked</code> —
            refused by policy (kill-switch, allowlist, or caps), with a reason
          </li>
        </ul>
        <div className="rounded-lg border-primary border-l-4 bg-primary/10 p-4">
          <p className="font-medium text-sm">One recipient per send</p>
          <p className="mt-2 text-muted-foreground text-sm">
            Enforced mode accepts a single recipient per call. Pass one address
            (or a one-element array); larger arrays are rejected — send one
            email per recipient.
          </p>
        </div>
      </section>

      {/* Next Steps */}
      <section className="mb-12">
        <h2 className="mb-6 font-bold text-2xl">Next Steps</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="transition-colors hover:border-primary/50">
            <CardHeader>
              <CardTitle className="text-lg">Agent Email Quickstart</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-muted-foreground text-sm">
                Deploy SES and wire a typed send-email tool into your agent
                framework.
              </p>
              <Button asChild variant="outline">
                <Link href="/docs/quickstart/email/agents">
                  View Quickstart
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="transition-colors hover:border-primary/50">
            <CardHeader>
              <CardTitle className="text-lg">Email SDK Reference</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-muted-foreground text-sm">
                Every method, option, and response shape in @wraps.dev/email.
              </p>
              <Button asChild variant="outline">
                <Link href="/docs/sdk-reference">
                  View SDK Docs
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      <Card className="bg-muted/50">
        <CardContent className="p-8 text-center">
          <h3 className="mb-2 font-bold text-xl">Need Help?</h3>
          <p className="mb-4 text-muted-foreground">
            Open an issue or join the GitHub discussions — we read every one.
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
