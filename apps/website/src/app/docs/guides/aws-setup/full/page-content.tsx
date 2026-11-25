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
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  ExternalLink,
  Info,
  Key,
  Shield,
  User,
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
import {
  Snippet,
  SnippetCopyButton,
  SnippetHeader,
  SnippetTabsContent,
  SnippetTabsList,
  SnippetTabsTrigger,
} from "@/components/ui/shadcn-io/snippet";

const installCommands = {
  macOS: "brew install awscli",
  Linux: `curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install`,
  Windows: "msiexec.exe /i https://awscli.amazonaws.com/AWSCLIV2.msi",
};

const verifyInstall = "aws --version";

const configureCommand = "aws configure";

const configureOutput = `AWS Access Key ID [None]: AKIAIOSFODNN7EXAMPLE
AWS Secret Access Key [None]: wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
Default region name [None]: us-east-1
Default output format [None]: json`;

const verifyCredentials = "aws sts get-caller-identity";

const deployCommand = "npx @wraps.dev/cli email init";

export default function FullGuidePageContent() {
  return (
    <DocsLayout>
      {/* Page Header */}
      <div className="mb-12">
        <Badge className="mb-4" variant="outline">
          Complete Guide
        </Badge>
        <h1 className="mb-4 font-bold text-4xl tracking-tight">
          Complete AWS Setup Guide
        </h1>
        <p className="text-lg text-muted-foreground">
          New to AWS? This guide walks you through everything from account
          creation to deploying your first email infrastructure.
        </p>
        <div className="mt-4 flex items-center gap-4 text-muted-foreground text-sm">
          <span className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            10-15 min
          </span>
        </div>
      </div>

      {/* What is AWS */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">What is AWS?</h2>
        <p className="mb-4 text-muted-foreground">
          Amazon Web Services (AWS) is Amazon's cloud computing platform. When
          you use Wraps, we deploy email infrastructure to your AWS account.
          This means:
        </p>
        <ul className="mb-4 space-y-2 text-muted-foreground">
          <li className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            <span>
              <strong className="text-foreground">
                Sending runs in your account
              </strong>{" "}
              — The sending setup is yours
            </span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            <span>
              <strong className="text-foreground">Transparent pricing</strong> —
              Pay AWS directly at $0.10/1,000 emails on à la carte ($0.16 on
              Essentials)
            </span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            <span>
              <strong className="text-foreground">No Wraps lock-in</strong> —
              Infrastructure stays even if you stop using Wraps
            </span>
          </li>
        </ul>
        <div className="rounded-lg border-primary border-l-4 bg-primary/10 p-4">
          <p className="font-medium text-sm">AWS Free Tier</p>
          <p className="mt-1 text-muted-foreground text-sm">
            New AWS accounts get $200 in AWS Free Tier credits, valid for 6
            months and usable across AWS services. There is no longer an
            SES-specific free sending allowance.
          </p>
        </div>
      </section>

      {/* Step 1: Create AWS Account */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            1
          </div>
          Create an AWS Account
        </h2>
        <p className="mb-4 text-muted-foreground">
          If you don't have an AWS account yet, you'll need to create one.
        </p>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              What You'll Need
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-muted-foreground">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-success" />
                Email address
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-success" />
                Phone number for verification
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-success" />
                Credit or debit card (for verification, free tier available)
              </li>
            </ul>
          </CardContent>
        </Card>

        <Button asChild>
          <a
            href="https://aws.amazon.com/free"
            rel="noopener noreferrer"
            target="_blank"
          >
            Create AWS Account
            <ExternalLink className="ml-2 h-4 w-4" />
          </a>
        </Button>

        <div className="mt-4 rounded-lg border-warning border-l-4 bg-warning/10 p-4">
          <p className="flex items-center gap-2 font-medium text-sm">
            <AlertTriangle className="h-4 w-4" />
            Account activation takes a few minutes
          </p>
          <p className="mt-1 text-muted-foreground text-sm">
            AWS may take up to 24 hours to fully activate your account, but most
            are ready within minutes.
          </p>
        </div>
      </section>

      {/* Step 2: Install AWS CLI */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            2
          </div>
          Install AWS CLI
        </h2>
        <p className="mb-4 text-muted-foreground">
          The AWS Command Line Interface (CLI) lets you interact with AWS from
          your terminal.
        </p>

        <Snippet defaultValue="macOS">
          <SnippetHeader>
            <SnippetTabsList>
              <SnippetTabsTrigger value="macOS">macOS</SnippetTabsTrigger>
              <SnippetTabsTrigger value="Linux">Linux</SnippetTabsTrigger>
              <SnippetTabsTrigger value="Windows">Windows</SnippetTabsTrigger>
            </SnippetTabsList>
            <SnippetCopyButton value={installCommands.macOS} />
          </SnippetHeader>
          {Object.entries(installCommands).map(([key, command]) => (
            <SnippetTabsContent key={key} value={key}>
              {command}
            </SnippetTabsContent>
          ))}
        </Snippet>

        <p className="mt-3 text-muted-foreground text-sm">
          <strong>macOS:</strong> Requires{" "}
          <a
            className="text-primary underline"
            href="https://brew.sh"
            rel="noopener noreferrer"
            target="_blank"
          >
            Homebrew
          </a>
          . Or download directly from{" "}
          <a
            className="text-primary underline"
            href="https://awscli.amazonaws.com/AWSCLIV2.pkg"
            rel="noopener noreferrer"
            target="_blank"
          >
            AWS
          </a>
          .
        </p>

        <h3 className="mt-6 mb-3 font-medium text-lg">Verify Installation</h3>
        <p className="mb-4 text-muted-foreground">
          After installing, verify the CLI is working:
        </p>
        <CodeBlock
          className="h-auto"
          data={[
            {
              language: "bash",
              filename: "terminal.sh",
              code: verifyInstall,
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
        <p className="mt-2 text-muted-foreground text-sm">
          You should see something like{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">
            aws-cli/2.x.x Python/3.x.x ...
          </code>
        </p>
      </section>

      {/* Step 3: Create IAM User */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            3
          </div>
          Create IAM User with Access Keys
        </h2>
        <p className="mb-4 text-muted-foreground">
          IAM (Identity and Access Management) lets you create users with
          specific permissions. You'll create a user that the CLI can use.
        </p>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5 text-primary" />
              What are Access Keys?
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            Access Keys are like a username/password for programmatic access.
            They consist of:
            <ul className="mt-2 list-disc space-y-1 pl-4">
              <li>
                <strong className="text-foreground">Access Key ID</strong> —
                Like a username (starts with AKIA...)
              </li>
              <li>
                <strong className="text-foreground">Secret Access Key</strong> —
                Like a password (keep this secret!)
              </li>
            </ul>
          </CardContent>
        </Card>

        <h3 className="mb-3 font-medium text-lg">Step-by-Step:</h3>
        <ol className="mb-4 list-decimal space-y-4 pl-6 text-muted-foreground">
          <li>
            <strong className="text-foreground">Open IAM Console</strong>
            <br />
            <a
              className="font-medium text-primary underline"
              href="https://console.aws.amazon.com/iam/home#/users"
              rel="noopener noreferrer"
              target="_blank"
            >
              https://console.aws.amazon.com/iam/home#/users
            </a>
          </li>
          <li>
            <strong className="text-foreground">Create User</strong>
            <br />
            Click "Create user" → Name it{" "}
            <code className="rounded bg-muted px-1.5 py-0.5">wraps-cli</code> →
            Click "Next"
          </li>
          <li>
            <strong className="text-foreground">Set Permissions</strong>
            <br />
            Select "Attach policies directly" → Search for{" "}
            <code className="rounded bg-muted px-1.5 py-0.5">
              AdministratorAccess
            </code>{" "}
            → Check the box → Click "Next" → "Create user"
          </li>
          <li>
            <strong className="text-foreground">Create Access Key</strong>
            <br />
            Click on your new user → "Security credentials" tab → "Create access
            key" → Select "Command Line Interface (CLI)" → Click through the
            confirmation
          </li>
          <li>
            <strong className="text-foreground">Save Your Keys</strong>
            <br />
            Copy your Access Key ID and Secret Access Key. You'll need these in
            the next step.
          </li>
        </ol>

        <div className="rounded-lg border-warning border-l-4 bg-warning/10 p-4">
          <p className="flex items-center gap-2 font-medium text-sm">
            <Shield className="h-4 w-4" />
            Keep your Secret Access Key safe!
          </p>
          <p className="mt-1 text-muted-foreground text-sm">
            AWS only shows the secret key once. Store it securely (password
            manager) and never share it.
          </p>
        </div>
      </section>

      {/* Step 4: Configure CLI */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            4
          </div>
          Configure AWS CLI
        </h2>
        <p className="mb-4 text-muted-foreground">
          Now configure the AWS CLI with your access keys:
        </p>
        <CodeBlock
          className="mb-4 h-auto"
          data={[
            {
              language: "bash",
              filename: "terminal.sh",
              code: configureCommand,
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

        <p className="mb-4 text-muted-foreground">
          When prompted, enter your values:
        </p>
        <CodeBlock
          className="mb-4 h-auto"
          data={[
            {
              language: "text",
              filename: "Output",
              code: configureOutput,
            },
          ]}
          defaultValue="text"
        >
          <CodeBlockHeader>
            <CodeBlockFiles>
              {(item) => (
                <CodeBlockFilename key={item.language} value={item.language}>
                  {item.filename}
                </CodeBlockFilename>
              )}
            </CodeBlockFiles>
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

        <Card className="mb-4">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div className="text-sm">
                <strong>Region Selection</strong>
                <p className="text-muted-foreground">
                  Choose a region close to your users. Common choices:
                </p>
                <ul className="mt-1 text-muted-foreground">
                  <li>
                    <code className="rounded bg-muted px-1 py-0.5">
                      us-east-1
                    </code>{" "}
                    — US East (Virginia)
                  </li>
                  <li>
                    <code className="rounded bg-muted px-1 py-0.5">
                      eu-west-1
                    </code>{" "}
                    — Europe (Ireland)
                  </li>
                  <li>
                    <code className="rounded bg-muted px-1 py-0.5">
                      ap-southeast-1
                    </code>{" "}
                    — Asia (Singapore)
                  </li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Step 5: Verify */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            5
          </div>
          Verify Your Setup
        </h2>
        <p className="mb-4 text-muted-foreground">
          Test that your credentials are working:
        </p>
        <CodeBlock
          className="mb-4 h-auto"
          data={[
            {
              language: "bash",
              filename: "terminal.sh",
              code: verifyCredentials,
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
        <p className="text-muted-foreground text-sm">
          You should see your Account ID, User ID, and ARN. If you get an error,
          check the{" "}
          <a
            className="font-medium text-primary underline"
            href="/docs/guides/aws-setup/troubleshooting"
          >
            troubleshooting guide
          </a>
          .
        </p>
      </section>

      {/* Step 6: Deploy */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            6
          </div>
          Deploy Wraps
        </h2>
        <p className="mb-4 text-muted-foreground">
          Now you're ready to deploy email infrastructure:
        </p>
        <CodeBlock
          className="mb-4 h-auto"
          data={[
            {
              language: "bash",
              filename: "terminal.sh",
              code: deployCommand,
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
        <p className="text-muted-foreground text-sm">
          The wizard will guide you through selecting your hosting provider,
          region, and configuration.
        </p>
      </section>

      {/* Checklist */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">Complete Checklist</h2>
        <Card>
          <CardContent className="p-6">
            <ul className="space-y-3">
              <li className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-success" />
                <span>AWS account created and activated</span>
              </li>
              <li className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-success" />
                <span>AWS CLI installed</span>
              </li>
              <li className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-success" />
                <span>IAM user created with access keys</span>
              </li>
              <li className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-success" />
                <span>
                  AWS CLI configured (
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    aws configure
                  </code>
                  )
                </span>
              </li>
              <li className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-success" />
                <span>
                  Verified with{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    aws sts get-caller-identity
                  </code>
                </span>
              </li>
              <li className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-success" />
                <span>
                  Deployed with{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    npx @wraps.dev/cli email init
                  </code>
                </span>
              </li>
            </ul>
          </CardContent>
        </Card>
      </section>

      {/* Next Steps */}
      <section className="mb-12">
        <h2 className="mb-6 font-bold text-2xl">Next Steps</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="transition-colors hover:border-primary/50">
            <CardHeader>
              <CardTitle className="text-lg">Verify Your Domain</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-muted-foreground text-sm">
                Set up DKIM, SPF, and DMARC for better deliverability.
              </p>
              <Button asChild variant="outline">
                <Link href="/docs/guides/domain-verification">
                  Domain Setup
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="transition-colors hover:border-primary/50">
            <CardHeader>
              <CardTitle className="text-lg">Production Access</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-muted-foreground text-sm">
                Move out of sandbox mode to send to any recipient.
              </p>
              <Button asChild variant="outline">
                <Link href="/docs/guides/production-access">
                  Get Production Access
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
