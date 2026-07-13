"use client";

import { Badge } from "@wraps/ui/components/ui/badge";
import { Button } from "@wraps/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import {
  AlertTriangle,
  ArrowRight,
  Blocks,
  Book,
  Bot,
  Box,
  Code,
  Layers,
  Mail,
  MessageSquare,
  Server,
  Settings,
  Terminal,
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

const installCode = "npx @wraps.dev/cli email init";

const sendCode = `import { WrapsEmail } from '@wraps.dev/email'

const wraps = new WrapsEmail()

await wraps.send({
  from: 'hello@yourdomain.com',
  to: 'user@example.com',
  subject: 'Welcome',
  html: '<h1>Hello from Wraps</h1>',
})`;

export default function DocsPageContent() {
  return (
    <DocsLayout>
      <div className="mx-auto max-w-4xl space-y-16 py-10">
        {/* Hero */}
        <section>
          <Badge className="mb-4" variant="outline">
            Documentation
          </Badge>
          <h1 className="mb-3 font-bold text-3xl tracking-tight sm:text-4xl">
            Get started with Wraps
          </h1>
          <p className="mb-8 max-w-2xl text-lg text-muted-foreground">
            Deploy email, SMS, and CDN infrastructure to your AWS account. You
            own everything — we provide the tooling.
          </p>

          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <p className="mb-2 font-medium text-muted-foreground text-sm">
                1. Deploy infrastructure
              </p>
              <CodeBlock
                className="h-auto"
                data={[
                  {
                    language: "bash",
                    filename: "terminal",
                    code: installCode,
                  },
                ]}
                defaultValue="bash"
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
              <p className="mb-2 font-medium text-muted-foreground text-sm">
                2. Send your first email
              </p>
              <CodeBlock
                className="h-auto"
                data={[
                  {
                    language: "typescript",
                    filename: "send.ts",
                    code: sendCode,
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
          </div>

          <div className="mt-6 flex gap-3">
            <Button asChild size="lg">
              <Link href="/docs/quickstart">
                Quickstart
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/docs/quickstart/email">Email in 2 minutes</Link>
            </Button>
          </div>

          <div className="mt-6 flex items-start gap-3 rounded-lg border bg-muted/40 p-4">
            <Bot className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p className="text-muted-foreground text-sm">
              <span className="font-medium text-foreground">
                Using an AI assistant?
              </span>{" "}
              Point it at{" "}
              <a
                className="font-medium text-primary underline underline-offset-4"
                href="/llms-full.txt"
              >
                llms-full.txt
              </a>{" "}
              — the complete docs in one file — or{" "}
              <a
                className="font-medium text-primary underline underline-offset-4"
                href="/llms.txt"
              >
                llms.txt
              </a>{" "}
              for the agent-oriented index.
            </p>
          </div>
        </section>

        {/* Build — SDKs */}
        <section>
          <h2 className="mb-1 font-semibold text-xl">Build</h2>
          <p className="mb-4 text-muted-foreground text-sm">
            SDKs for sending email, SMS, and managing your platform.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <LinkCard
              description="Send email, manage templates, track events"
              href="/docs/sdk-reference"
              icon={Mail}
              title="Email SDK"
            />
            <LinkCard
              description="Send email from Python — attachments, templates, suppression"
              href="/docs/python-sdk-reference"
              icon={Code}
              title="Python SDK"
            />
            <LinkCard
              description="Send SMS, manage opt-outs, verify numbers"
              href="/docs/sms-sdk-reference"
              icon={MessageSquare}
              title="SMS SDK"
            />
            <LinkCard
              description="Contacts, batches, workflows, segments"
              href="/docs/client-sdk-reference"
              icon={Blocks}
              title="Platform SDK"
            />
          </div>
        </section>

        {/* Deploy — CLI & IaC */}
        <section>
          <h2 className="mb-1 font-semibold text-xl">Deploy</h2>
          <p className="mb-4 text-muted-foreground text-sm">
            CLI, CDK, and Pulumi for deploying infrastructure.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <LinkCard
              description="All commands and flags"
              href="/docs/cli-reference"
              icon={Terminal}
              title="CLI Reference"
            />
            <LinkCard
              description="What gets deployed"
              href="/docs/infrastructure"
              icon={Server}
              title="Infrastructure"
            />
            <LinkCard
              description="AWS CDK construct"
              href="/docs/cdk-reference"
              icon={Layers}
              title="CDK"
            />
            <LinkCard
              description="Pulumi component"
              href="/docs/pulumi-reference"
              icon={Box}
              title="Pulumi"
            />
          </div>
        </section>

        {/* Operate — Guides & Reference */}
        <section>
          <h2 className="mb-1 font-semibold text-xl">Operate</h2>
          <p className="mb-4 text-muted-foreground text-sm">
            Guides, configuration, and troubleshooting.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <LinkCard
              description="AWS setup, domains, production access"
              href="/docs/guides"
              icon={Book}
              title="Guides"
            />
            <LinkCard
              description="REST API and OpenAPI spec"
              href="/docs/reference/api"
              icon={Code}
              title="API Reference"
            />
            <LinkCard
              description="Error codes with solutions"
              href="/docs/reference/errors"
              icon={AlertTriangle}
              title="Errors"
            />
            <LinkCard
              description="CLI, SDK, and CI/CD config"
              href="/docs/reference/environment-variables"
              icon={Settings}
              title="Environment Variables"
            />
          </div>
        </section>
      </div>
    </DocsLayout>
  );
}

function LinkCard({
  title,
  description,
  href,
  icon: Icon,
}: {
  title: string;
  description: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Link href={href}>
      <Card className="h-full transition-colors hover:border-primary/50">
        <CardHeader className="pb-2">
          <div className="mb-1 flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
            <Icon className="h-4 w-4 text-primary" />
          </div>
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <CardDescription>{description}</CardDescription>
        </CardContent>
      </Card>
    </Link>
  );
}
