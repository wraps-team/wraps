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
  Bot,
  CheckCircle2,
  Clock,
  Info,
  Mail,
  MessageSquare,
  Server,
  Terminal,
  Zap,
} from "lucide-react";
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

const cursorConfig = `{
  "mcpServers": {
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp@latest"]
    }
  }
}`;

const claudeCodeConfig = `{
  "mcpServers": {
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp@latest"]
    }
  }
}`;

const windsurfConfig = `{
  "mcpServers": {
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp@latest"]
    }
  }
}`;

const examplePromptEmail = `Use context7 to look up @wraps.dev/email docs,
then send a welcome email with React Email template.`;

const examplePromptCli = `Use context7 to look up wraps CLI docs,
then show me how to deploy email infrastructure.`;

const examplePromptSms = `Use context7 to look up @wraps.dev/sms docs,
then send an OTP verification code.`;

const emailSdkExample = `import { WrapsEmail } from '@wraps.dev/email';

const email = new WrapsEmail();

const { messageId } = await email.send({
  from: 'hello@yourapp.com',
  to: 'user@example.com',
  subject: 'Welcome!',
  html: '<h1>Hello from Wraps!</h1>',
});`;

const smsSdkExample = `import { WrapsSMS } from '@wraps.dev/sms';

const sms = new WrapsSMS();

await sms.send({
  to: '+14155551234',
  message: 'Your verification code is 123456',
});`;

export default function Context7PageContent() {
  return (
    <DocsLayout>
      {/* Page Header */}
      <div className="mb-12">
        <Badge className="mb-4" variant="outline">
          Guide
        </Badge>
        <h1 className="mb-4 font-bold text-4xl tracking-tight">
          AI-Assisted Development with Context7
        </h1>
        <p className="text-lg text-muted-foreground">
          Give your AI coding assistant up-to-date Wraps documentation. Context7
          feeds real docs and code examples into your prompts so your AI writes
          correct Wraps code on the first try.
        </p>
        <div className="mt-4 flex items-center gap-4 text-muted-foreground text-sm">
          <span className="flex items-center gap-1">
            <Clock className="h-4 w-4" />3 min read
          </span>
        </div>
      </div>

      {/* Why Context7 */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">Why Context7</h2>
        <p className="mb-4 text-muted-foreground">
          AI models are trained on a snapshot of the internet. When you ask them
          to write Wraps code, they might hallucinate APIs that don&apos;t exist
          or use outdated patterns. Context7 solves this by injecting the latest
          Wraps documentation directly into your AI&apos;s context window.
        </p>
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-start gap-3">
                <Zap className="h-6 w-6 shrink-0 text-primary" />
                <div>
                  <h3 className="font-medium">Accurate code</h3>
                  <p className="mt-1 text-muted-foreground text-sm">
                    Real API signatures, not hallucinated ones
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-start gap-3">
                <Bot className="h-6 w-6 shrink-0 text-primary" />
                <div>
                  <h3 className="font-medium">Works everywhere</h3>
                  <p className="mt-1 text-muted-foreground text-sm">
                    Cursor, Claude Code, Windsurf, and any MCP client
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-start gap-3">
                <Server className="h-6 w-6 shrink-0 text-primary" />
                <div>
                  <h3 className="font-medium">Always current</h3>
                  <p className="mt-1 text-muted-foreground text-sm">
                    Pulls from our latest published docs
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Available Libraries */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">Available Libraries</h2>
        <p className="mb-4 text-muted-foreground">
          Wraps publishes two libraries to Context7, covering the full platform:
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Terminal className="h-5 w-5 text-primary" />
                Wraps Platform
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-3 rounded-md bg-muted px-3 py-2 font-mono text-sm">
                /wraps-team/wraps
              </div>
              <p className="mb-3 text-muted-foreground text-sm">
                CLI commands, infrastructure guides, quickstarts, configuration
                presets, webhooks, templates, workflows, and full platform
                documentation.
              </p>
              <div className="flex items-center gap-2 text-muted-foreground text-xs">
                <span className="rounded-none bg-primary/10 px-2 py-0.5 text-primary">
                  142 snippets
                </span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Mail className="h-5 w-5 text-primary" />
                Wraps JS SDKs
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-3 rounded-md bg-muted px-3 py-2 font-mono text-sm">
                /wraps-team/wraps-js
              </div>
              <p className="mb-3 text-muted-foreground text-sm">
                TypeScript SDKs for email (
                <code className="rounded bg-muted px-1 py-0.5">
                  @wraps.dev/email
                </code>
                ), SMS (
                <code className="rounded bg-muted px-1 py-0.5">
                  @wraps.dev/sms
                </code>
                ), and the platform client (
                <code className="rounded bg-muted px-1 py-0.5">
                  @wraps.dev/client
                </code>
                ).
              </p>
              <div className="flex items-center gap-2 text-muted-foreground text-xs">
                <span className="rounded-none bg-primary/10 px-2 py-0.5 text-primary">
                  BYOC pattern
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Setup */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">Setup</h2>
        <p className="mb-4 text-muted-foreground">
          Add the Context7 MCP server to your editor. This is a one-time setup
          &mdash; once configured, any prompt can pull Wraps docs on demand.
        </p>

        <div className="space-y-6">
          {/* Cursor */}
          <div>
            <h3 className="mb-3 font-medium text-lg">Cursor</h3>
            <p className="mb-3 text-muted-foreground text-sm">
              Add to{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                .cursor/mcp.json
              </code>{" "}
              in your project root:
            </p>
            <CodeBlock
              className="h-auto"
              data={[
                {
                  language: "json",
                  filename: ".cursor/mcp.json",
                  code: cursorConfig,
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

          {/* Claude Code */}
          <div>
            <h3 className="mb-3 font-medium text-lg">Claude Code</h3>
            <p className="mb-3 text-muted-foreground text-sm">
              Add to{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                .claude/settings.json
              </code>{" "}
              or run{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                claude mcp add context7 -- npx -y @upstash/context7-mcp@latest
              </code>
              :
            </p>
            <CodeBlock
              className="h-auto"
              data={[
                {
                  language: "json",
                  filename: ".claude/settings.json",
                  code: claudeCodeConfig,
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

          {/* Windsurf */}
          <div>
            <h3 className="mb-3 font-medium text-lg">Windsurf</h3>
            <p className="mb-3 text-muted-foreground text-sm">
              Add to your MCP config file (
              <code className="rounded bg-muted px-1.5 py-0.5">
                ~/.codeium/windsurf/mcp_config.json
              </code>
              ):
            </p>
            <CodeBlock
              className="h-auto"
              data={[
                {
                  language: "json",
                  filename: "mcp_config.json",
                  code: windsurfConfig,
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

        <div className="mt-6 rounded-lg border-primary border-l-4 bg-primary/10 p-4">
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div>
              <p className="font-medium text-sm">Any MCP client works</p>
              <p className="mt-1 text-muted-foreground text-sm">
                Context7 is a standard MCP server. If your editor supports MCP
                (VS Code with Copilot, Zed, etc.), the same config pattern
                applies.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Using Context7 with Wraps */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">Using Context7 with Wraps</h2>
        <p className="mb-4 text-muted-foreground">
          Once configured, mention &ldquo;use context7&rdquo; in your prompt and
          reference the Wraps library you need. Your AI assistant will
          automatically fetch the relevant docs before generating code.
        </p>

        <h3 className="mb-3 font-medium text-lg">Example Prompts</h3>
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Mail className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <p className="font-medium text-sm">Send email</p>
                  <p className="mt-1 font-mono text-muted-foreground text-sm">
                    {examplePromptEmail}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Terminal className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <p className="font-medium text-sm">Deploy infrastructure</p>
                  <p className="mt-1 font-mono text-muted-foreground text-sm">
                    {examplePromptCli}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <MessageSquare className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <p className="font-medium text-sm">Send SMS</p>
                  <p className="mt-1 font-mono text-muted-foreground text-sm">
                    {examplePromptSms}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <h3 className="mb-3 mt-8 font-medium text-lg">What You Get Back</h3>
        <p className="mb-4 text-muted-foreground">
          Context7 returns real, working code from our docs. Here&apos;s what
          your AI will have access to:
        </p>

        <div className="space-y-4">
          <CodeBlock
            className="h-auto"
            data={[
              {
                language: "typescript",
                filename: "email.ts",
                code: emailSdkExample,
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

          <CodeBlock
            className="h-auto"
            data={[
              {
                language: "typescript",
                filename: "sms.ts",
                code: smsSdkExample,
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
        </div>
      </section>

      {/* Library IDs */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">Library IDs</h2>
        <p className="mb-4 text-muted-foreground">
          For advanced usage, you can reference libraries directly by their
          Context7 ID:
        </p>
        <Card>
          <CardContent className="p-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="pb-2 text-left">Library</th>
                  <th className="pb-2 text-left">Context7 ID</th>
                  <th className="pb-2 text-left">Covers</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b">
                  <td className="py-2 font-medium text-foreground">
                    Wraps Platform
                  </td>
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      /wraps-team/wraps
                    </code>
                  </td>
                  <td className="py-2">
                    CLI, infrastructure, quickstarts, guides, presets
                  </td>
                </tr>
                <tr>
                  <td className="py-2 font-medium text-foreground">
                    Wraps JS SDKs
                  </td>
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      /wraps-team/wraps-js
                    </code>
                  </td>
                  <td className="py-2">
                    @wraps.dev/email, @wraps.dev/sms, @wraps.dev/client
                  </td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
      </section>

      {/* Tips */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">Tips</h2>
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
            <div>
              <p className="font-medium">Be specific in prompts</p>
              <p className="text-muted-foreground text-sm">
                &ldquo;Send email with React Email template using
                @wraps.dev/email&rdquo; pulls better results than &ldquo;send
                email&rdquo;
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
            <div>
              <p className="font-medium">
                Use &ldquo;wraps&rdquo; or &ldquo;wraps-js&rdquo; as the library
                name
              </p>
              <p className="text-muted-foreground text-sm">
                Context7 resolves these to the correct library IDs automatically
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
            <div>
              <p className="font-medium">
                Combine with framework-specific context
              </p>
              <p className="text-muted-foreground text-sm">
                Ask for &ldquo;wraps email in Next.js App Router&rdquo; and
                Context7 will return our Next.js-specific quickstart
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
            <div>
              <p className="font-medium">Docs stay current</p>
              <p className="text-muted-foreground text-sm">
                Context7 syncs from our published docs. When we ship new
                features, your AI gets them automatically
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Next Steps */}
      <section className="mb-12">
        <h2 className="mb-6 font-bold text-2xl">Next Steps</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="transition-colors hover:border-primary/50">
            <CardHeader>
              <CardTitle className="text-lg">Email Quickstart</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-muted-foreground text-sm">
                Deploy email infrastructure and send your first email in under 5
                minutes.
              </p>
              <Button asChild variant="outline">
                <Link href="/docs/quickstart/email">
                  Get Started
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
                Full API reference for @wraps.dev/email including React Email
                support, attachments, and batch sending.
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
    </DocsLayout>
  );
}
