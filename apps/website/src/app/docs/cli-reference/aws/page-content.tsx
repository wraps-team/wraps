"use client";

import { Badge } from "@wraps/ui/components/ui/badge";
import { Button } from "@wraps/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import { ArrowLeft, ArrowRight, Terminal } from "lucide-react";
import Link from "next/link";
import { CLICommand } from "@/components/docs/cli-command";
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

export default function CLIReferenceAWSPageContent() {
  return (
    <DocsLayout>
      {/* Breadcrumb */}
      <div className="mb-6">
        <Button asChild className="gap-2" size="sm" variant="ghost">
          <Link href="/docs/cli-reference">
            <ArrowLeft className="h-4 w-4" />
            CLI Reference
          </Link>
        </Button>
      </div>

      {/* Page Header */}
      <div className="mb-12">
        <Badge className="mb-4" variant="outline">
          CLI Reference / AWS
        </Badge>
        <h1 className="mb-4 font-bold text-4xl tracking-tight">AWS Commands</h1>
        <p className="text-lg text-muted-foreground">
          Set up and diagnose your AWS credentials and permissions for Wraps.
        </p>
      </div>

      {/* wraps aws setup */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <Terminal className="h-6 w-6 text-primary" />
          wraps aws setup
        </h2>
        <p className="mb-4 text-muted-foreground">
          Interactive wizard that detects and configures your AWS credentials.
          Guides you through setting up IAM users or SSO profiles for use with
          Wraps.
        </p>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-lg">Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <CLICommand command="npx @wraps.dev/cli aws setup" />
          </CardContent>
        </Card>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-lg">What It Does</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-2 pl-5 text-muted-foreground text-sm">
              <li>
                Detects existing AWS configuration (environment variables,{" "}
                <code className="rounded bg-muted px-1 py-0.5">
                  ~/.aws/credentials
                </code>
                , SSO profiles)
              </li>
              <li>
                If SSO profiles are found, offers to use an existing profile
              </li>
              <li>
                If no credentials are detected, guides you through IAM user
                creation or SSO setup
              </li>
              <li>
                Validates credentials by calling STS{" "}
                <code className="rounded bg-muted px-1 py-0.5">
                  GetCallerIdentity
                </code>
              </li>
              <li>
                Tests SES permissions to ensure your account can send email
              </li>
              <li>Displays your AWS account ID and configured region</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Examples</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="mb-2 text-muted-foreground text-sm">
                Interactive setup (recommended for first time):
              </p>
              <CLICommand command="npx @wraps.dev/cli aws setup" />
            </div>
          </CardContent>
        </Card>
      </section>

      {/* wraps aws doctor */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <Terminal className="h-6 w-6 text-primary" />
          wraps aws doctor
        </h2>
        <p className="mb-4 text-muted-foreground">
          Diagnostic tool that checks your AWS configuration and permissions.
          Run this when you encounter credential or permission errors.
        </p>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-lg">Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <CLICommand command="npx @wraps.dev/cli aws doctor [options]" />
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
                  -r, --region &lt;region&gt;
                </code>
                <p className="mt-2 text-muted-foreground text-sm">
                  AWS region to diagnose. The SES sending-status check is
                  per-region, so this decides which region the report is about.
                </p>
              </div>
              <div>
                <code className="rounded bg-muted px-2 py-1">--json</code>
                <p className="mt-2 text-muted-foreground text-sm">
                  Output diagnostic results as JSON for scripting and automation
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-lg">What It Checks</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-2 pl-5 text-muted-foreground text-sm">
              <li>
                AWS credential chain (environment variables, profile, SSO,
                instance role)
              </li>
              <li>
                STS identity validation (
                <code className="rounded bg-muted px-1 py-0.5">
                  GetCallerIdentity
                </code>
                )
              </li>
              <li>
                SES permissions (
                <code className="rounded bg-muted px-1 py-0.5">SendEmail</code>,{" "}
                <code className="rounded bg-muted px-1 py-0.5">GetAccount</code>
                )
              </li>
              <li>Region configuration and availability</li>
              <li>Reports any issues with specific fix suggestions</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Example Output</CardTitle>
          </CardHeader>
          <CardContent>
            <CodeBlock
              className="h-auto"
              data={[
                {
                  language: "text",
                  filename: "output.txt",
                  code: `AWS Credential Check
  ✓ Credentials found via SSO profile "wraps-dev"
  ✓ STS identity validated (Account: 123456789012)
  ✓ Region: us-east-1

SES Permission Check
  ✓ ses:SendEmail — allowed
  ✓ ses:GetAccount — allowed
  ✓ ses:GetSendQuota — allowed

All checks passed. Your AWS configuration is ready for Wraps.`,
                },
              ]}
              defaultValue="text"
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
          </CardContent>
        </Card>
      </section>

      {/* Next Steps */}
      <section className="mb-12">
        <h2 className="mb-6 font-bold text-2xl">Next Steps</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="transition-colors hover:border-primary/50">
            <a className="block p-6" href="/docs/guides/aws-setup">
              <CardTitle className="mb-2 text-lg">AWS Setup Guide</CardTitle>
              <p className="text-muted-foreground text-sm">
                Detailed walkthrough for configuring your AWS account,
                credentials, and permissions for Wraps.
              </p>
              <div className="mt-4 flex items-center text-primary text-sm">
                Learn more
                <ArrowRight className="ml-1 h-4 w-4" />
              </div>
            </a>
          </Card>
          <Card className="transition-colors hover:border-primary/50">
            <a className="block p-6" href="/docs/cli-reference/email">
              <CardTitle className="mb-2 text-lg">Email Commands</CardTitle>
              <p className="text-muted-foreground text-sm">
                Deploy and manage AWS SES email infrastructure with event
                tracking, analytics, and domain management.
              </p>
              <div className="mt-4 flex items-center text-primary text-sm">
                Learn more
                <ArrowRight className="ml-1 h-4 w-4" />
              </div>
            </a>
          </Card>
        </div>
      </section>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button asChild variant="outline">
          <Link href="/docs/cli-reference">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to CLI Reference
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/docs/cli-reference/email">
            Email Commands
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </DocsLayout>
  );
}
