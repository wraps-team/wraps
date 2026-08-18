"use client";

import { Badge } from "@wraps/ui/components/ui/badge";
import { Button } from "@wraps/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import { ArrowRight, Bot, CheckCircle2, Target } from "lucide-react";
import Link from "next/link";
import { AgentQuickstartPrompt } from "@/components/docs/agent-quickstart-prompt";
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

const agentPrompt = `Give this project's AI agent the ability to send email via Wraps.

1. Verify AWS credentials with: aws sts get-caller-identity — help me configure them if that fails.
2. If Wraps isn't deployed yet, run: npx @wraps.dev/cli email init
   Confirm the estimated monthly cost with me before deploying, then verify my sending domain with npx @wraps.dev/cli email domains verify -d <domain>.
3. Install the SDK: npm install @wraps.dev/email
4. Create a typed send_email tool wrapping WrapsEmail from @wraps.dev/email and register it with my agent framework (detect LangGraph / Vercel AI SDK / Mastra from the codebase, or ask me).
5. Add the Wraps MCP server to my agent config so I can inspect sends, events, and suppressions:
   { "command": "npx", "args": ["-y", "@wraps.dev/mcp"], "env": { "AWS_REGION": "us-east-1" } }
   Use the region my Wraps stack is deployed in. The server requires AWS_REGION (or AWS_DEFAULT_REGION) in its own environment and exits on startup without one.
6. Do a test tool-call send and report the messageId.

Full guide (agent-readable): fetch https://wraps.dev/docs/quickstart/email/agents with header "Accept: text/markdown".`;

const installCommands = {
  npm: "npm install @wraps.dev/email",
  pnpm: "pnpm add @wraps.dev/email",
  yarn: "yarn add @wraps.dev/email",
  bun: "bun add @wraps.dev/email",
};

const agentToolCode = `import { WrapsEmail } from "@wraps.dev/email";

const email = new WrapsEmail();

// The shape works for any agent framework.
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
}`;

const context7McpConfig = `{
  "mcpServers": {
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp@latest"]
    }
  }
}`;

const wrapsMcpConfig = `{
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

export default function AgentEmailQuickstartPageContent() {
  return (
    <DocsLayout>
      <div className="mb-12">
        <Badge className="mb-4" variant="outline">
          <Bot className="mr-1.5 size-3" /> Agent Quickstart
        </Badge>
        <h1 className="mb-4 font-bold text-4xl tracking-tight">
          Send email from your agent
        </h1>
        <p className="text-lg text-muted-foreground">
          Wire Wraps into your agent's tool calls. The infrastructure lives in
          your AWS account; the agent just calls a typed function.
        </p>
      </div>

      <AgentQuickstartPrompt prompt={agentPrompt} />

      <div className="mb-8 rounded-lg border bg-muted/50 p-4">
        <div className="mb-2 flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          <p className="font-medium text-sm">What you'll build</p>
        </div>
        <ul className="mb-3 list-disc space-y-1 pl-5 text-muted-foreground text-sm">
          <li>AWS SES deployed to your account (DKIM, SPF, DMARC included)</li>
          <li>
            A typed send-email tool your agent framework can register as-is
          </li>
          <li>Wraps docs in your AI editor's context via Context7 MCP</li>
          <li>
            Live access to your email infrastructure via the Wraps MCP server
          </li>
        </ul>
        <p className="text-muted-foreground text-xs">Time: ~5 minutes</p>
      </div>

      <Card className="mb-8">
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
            <li>Node.js 20 or later installed</li>
            <li>An AWS account with valid credentials configured</li>
            <li>
              An agent framework you already use (LangGraph, Vercel AI SDK,
              Mastra, or your own)
            </li>
          </ul>
        </CardContent>
      </Card>

      {/* Step 1 */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            1
          </div>
          Deploy infrastructure
        </h2>
        <p className="mb-4 text-muted-foreground">
          The CLI deploys SES, DKIM, bounce handling, and EventBridge event
          processing into your AWS account. Same command as the base email
          quickstart.
        </p>
        <CodeBlock
          className="h-auto"
          data={[
            {
              language: "bash",
              filename: "terminal.sh",
              code: "npx @wraps.dev/cli email init",
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
      </section>

      {/* Step 2 */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            2
          </div>
          Install the SDK
        </h2>
        <p className="mb-4 text-muted-foreground">
          Install{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">
            @wraps.dev/email
          </code>{" "}
          in the package where your agent code lives:
        </p>
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
      </section>

      {/* Step 3 */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            3
          </div>
          Write the agent tool
        </h2>
        <p className="mb-4 text-muted-foreground">
          Wrap{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">email.send()</code>{" "}
          in a typed function. The same shape registers as a tool in any major
          agent framework.
        </p>
        <CodeBlock
          className="mb-4 h-auto"
          data={[
            {
              language: "typescript",
              filename: "send-email-tool.ts",
              code: agentToolCode,
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
        <div className="rounded-lg border-primary border-l-4 bg-primary/10 p-4">
          <p className="font-medium text-sm">Credentials</p>
          <p className="mt-2 text-muted-foreground text-sm">
            The SDK resolves AWS credentials from your environment — the same
            chain the AWS CLI uses. Your agent never sees an API key; it calls a
            function.
          </p>
        </div>
      </section>

      {/* Step 4 */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            4
          </div>
          Give your AI editor Wraps docs
        </h2>
        <p className="mb-4 text-muted-foreground">
          Add Context7 to your MCP config so Claude Code, Cursor, Windsurf, or
          any MCP-compatible editor can pull the latest Wraps docs into context.
          Prevents hallucinated APIs.
        </p>
        <CodeBlock
          className="mb-4 h-auto"
          data={[
            {
              language: "json",
              filename: "mcp.json",
              code: context7McpConfig,
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
        <p className="text-muted-foreground text-sm">
          Full setup (per-editor instructions, library IDs){" "}
          <Link
            className="text-primary underline underline-offset-4"
            href="/docs/guides/context7"
          >
            in the Context7 guide
          </Link>
          .
        </p>
      </section>

      {/* Step 5 */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            5
          </div>
          Give your agent live access with the Wraps MCP server
        </h2>
        <p className="mb-4 text-muted-foreground">
          Context7 gives your editor the docs;{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">@wraps.dev/mcp</code>{" "}
          gives your agent the infrastructure itself. It exposes your send
          history, delivery events, domain status, and suppression list as MCP
          tools — plus guarded sending, disabled by default.
        </p>
        <CodeBlock
          className="mb-4 h-auto"
          data={[
            {
              language: "json",
              filename: ".mcp.json",
              code: wrapsMcpConfig,
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
        <p className="mb-4 text-muted-foreground text-sm">
          Set <code className="rounded bg-muted px-1.5 py-0.5">AWS_REGION</code>{" "}
          to the region your Wraps stack is deployed in. The server reads it
          from its own environment — either{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">AWS_REGION</code> or{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">
            AWS_DEFAULT_REGION
          </code>{" "}
          — and never from your AWS config file, so it exits on startup without
          one.
        </p>
        <p className="text-muted-foreground text-sm">
          Tools, configuration, and write-mode guardrails are covered{" "}
          <Link
            className="text-primary underline underline-offset-4"
            href="/docs/mcp-reference"
          >
            in the MCP reference
          </Link>
          .
        </p>
      </section>

      <section className="mb-12">
        <h2 className="mb-6 font-bold text-2xl">Next Steps</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="transition-colors hover:border-primary/50">
            <CardHeader>
              <CardTitle className="text-lg">Email SDK Reference</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-muted-foreground text-sm">
                Every method, option, and response shape your agent can call.
              </p>
              <Button asChild variant="outline">
                <Link href="/docs/sdk-reference">
                  View SDK Docs
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="transition-colors hover:border-primary/50">
            <CardHeader>
              <CardTitle className="text-lg">CLI Commands</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-muted-foreground text-sm">
                Manage, inspect, and destroy the infrastructure your agent uses.
              </p>
              <Button asChild variant="outline">
                <Link href="/docs/cli-reference/email">
                  View CLI Docs
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
