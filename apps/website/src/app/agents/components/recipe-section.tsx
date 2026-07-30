"use client";

import { Card, CardContent } from "@wraps/ui/components/ui/card";
import { Bot } from "lucide-react";
import Link from "next/link";
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

const sendFromAgent = `import { WrapsEmail } from "@wraps.dev/email";

const email = new WrapsEmail();

// The agent already has the rest — it knows the user,
// the message, and when to send. It just needs a sender.
await email.send({
  from: "agent@yourdomain.com",
  to: userEmail,
  subject: reportSubject,
  html: reportHtml,
});`;

const context7McpConfig = `{
  "mcpServers": {
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp@latest"]
    }
  }
}`;

export function AgentsRecipeSection() {
  return (
    <section className="bg-muted/30 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 max-w-3xl">
          <h2 className="mb-3 font-bold text-3xl tracking-tight sm:text-4xl">
            Agents already work with Wraps today.
          </h2>
          <p className="text-lg text-muted-foreground">
            Three pieces, all shipped: the SDK your agent calls at runtime, an
            MCP config that keeps your AI editor writing correct Wraps code, and
            a Wraps MCP server that gives your agent live access to your email
            infrastructure.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="mb-3 font-medium text-sm text-muted-foreground uppercase tracking-wide">
              1. Send from your agent
            </h3>
            <p className="mb-4 text-muted-foreground">
              Call{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
                @wraps.dev/email
              </code>{" "}
              from inside an agent tool. It resolves credentials from your
              environment — no API keys to hand the agent.
            </p>
            <CodeBlock
              className="h-auto"
              data={[
                {
                  language: "typescript",
                  filename: "agent-send.ts",
                  code: sendFromAgent,
                },
              ]}
              defaultValue="typescript"
            >
              <CodeBlockHeader>
                <CodeBlockFiles>
                  {(item) => (
                    <CodeBlockFilename
                      key={item.language}
                      value={item.language}
                    >
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

          <div>
            <h3 className="mb-3 font-medium text-sm text-muted-foreground uppercase tracking-wide">
              2. Help your AI editor write correct Wraps code
            </h3>
            <p className="mb-4 text-muted-foreground">
              Wire{" "}
              <Link
                className="text-orange-500 underline decoration-orange-500/30 underline-offset-4 hover:decoration-orange-500/60"
                href="/docs/guides/context7"
              >
                Context7
              </Link>{" "}
              into Claude Code, Cursor, or any MCP-compatible editor so it pulls
              the latest Wraps docs into context instead of hallucinating APIs.
            </p>
            <CodeBlock
              className="h-auto"
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
                    <CodeBlockFilename
                      key={item.language}
                      value={item.language}
                    >
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
        </div>

        <Card className="mt-8 border-orange-500/30 bg-orange-500/5">
          <CardContent className="flex items-start gap-3 p-6">
            <Bot className="mt-0.5 h-5 w-5 shrink-0 text-orange-500" />
            <div>
              <p className="font-medium">
                3. Give your agent live access with the Wraps MCP server.
              </p>
              <p className="mt-1 text-muted-foreground text-sm">
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                  npx -y @wraps.dev/mcp
                </code>{" "}
                exposes your send history, delivery events, domain status, and
                suppression list as MCP tools — plus guarded sending, off by
                default. Your credentials never leave your machine.{" "}
                <Link
                  className="text-orange-500 underline decoration-orange-500/30 underline-offset-4 hover:decoration-orange-500/60"
                  href="/mcp"
                >
                  Meet the MCP server
                </Link>
                .
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
