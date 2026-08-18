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
    description: "Set to true to enable send_email",
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

function ConfigBlock({ filename, code }: { filename: string; code: string }) {
  return (
    <CodeBlock
      className="h-auto"
      data={[{ language: "json", filename, code }]}
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
          </ul>
        </CardContent>
      </Card>

      {/* Tools */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">Tools</h2>
        <p className="mb-4 text-muted-foreground">
          The server exposes six tools. Only{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">send_email</code>{" "}
          writes anything, and it stays disabled until you opt in.
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
                        <Badge
                          className={
                            tool.write
                              ? "border-orange-500/40 text-orange-500"
                              : "text-muted-foreground"
                          }
                          variant="outline"
                        >
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
          to enable it. The{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">from</code> address
          must belong to a domain verified in your SES account.
        </p>
        <div className="mb-4">
          <ConfigBlock code={writeModeConfig} filename=".mcp.json" />
        </div>
        <div className="rounded-lg border-yellow-500 border-l-4 bg-yellow-500/10 p-4">
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
          When write mode is enabled, use these variables to restrict the
          agent's sending scope. A recipient is allowed if it matches either the
          address list or the domain list.
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
