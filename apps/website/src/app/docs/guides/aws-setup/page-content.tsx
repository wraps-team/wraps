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
  CheckCircle2,
  Clock,
  Cloud,
  Rocket,
  Shield,
  Terminal,
  Wrench,
  Zap,
} from "lucide-react";
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

const setupWizardCommand = "npx @wraps.dev/cli aws setup";

const paths = [
  {
    title: "Quick Start",
    description: "For users with existing AWS credentials configured.",
    href: "/docs/guides/aws-setup/quick",
    icon: Zap,
    time: "2 min",
    for: "I have AWS configured",
  },
  {
    title: "Full Setup Guide",
    description:
      "Complete step-by-step guide for users new to AWS. Covers account creation through first deployment.",
    href: "/docs/guides/aws-setup/full",
    icon: Rocket,
    time: "10 min",
    for: "New to AWS",
  },
  {
    title: "IAM Permissions",
    description:
      "View and configure the exact IAM permissions required for Wraps to deploy infrastructure.",
    href: "/docs/guides/aws-setup/permissions",
    icon: Shield,
    time: "5 min",
    for: "Need specific permissions?",
  },
  {
    title: "Troubleshooting",
    description:
      "Common issues and how to fix them. Credential errors, region problems, and more.",
    href: "/docs/guides/aws-setup/troubleshooting",
    icon: Wrench,
    time: "Reference",
    for: "Having issues?",
  },
];

export default function AWSSetupPageContent() {
  return (
    <DocsLayout>
      {/* Page Header */}
      <div className="mb-12">
        <Badge className="mb-4" variant="outline">
          Guide
        </Badge>
        <h1 className="mb-4 font-bold text-4xl tracking-tight">AWS Setup</h1>
        <p className="text-lg text-muted-foreground">
          Configure your AWS credentials to deploy email infrastructure with
          Wraps. Choose your path based on your experience level.
        </p>
      </div>

      {/* CLI Wizard Option */}
      <section className="mb-12">
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-3">
              <Terminal className="h-6 w-6 text-primary" />
              <CardTitle>Prefer the command line?</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-muted-foreground">
              Run our interactive setup wizard that detects your current state
              and guides you through exactly what you need.
            </p>
            <CodeBlock
              className="h-auto"
              data={[
                {
                  language: "bash",
                  filename: "terminal.sh",
                  code: setupWizardCommand,
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
          </CardContent>
        </Card>
      </section>

      {/* Path Selection */}
      <section className="mb-12">
        <h2 className="mb-6 font-bold text-2xl">Choose Your Path</h2>
        <div className="grid gap-4">
          {paths.map((path) => {
            const Icon = path.icon;
            return (
              <Card
                className="group transition-all hover:border-primary/50 hover:shadow-md"
                key={path.title}
              >
                <CardHeader className="flex flex-row items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Icon className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-xl">{path.title}</CardTitle>
                      <div className="flex items-center gap-2 text-muted-foreground text-sm">
                        <Clock className="h-4 w-4" />
                        {path.time}
                      </div>
                    </div>
                    <Badge className="mt-2" variant="secondary">
                      {path.for}
                    </Badge>
                    <p className="mt-2 text-muted-foreground">
                      {path.description}
                    </p>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <Button asChild variant="outline">
                    <a href={path.href}>
                      Read Guide
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </a>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* What You'll Learn */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">What You Need to Know</h2>
        <p className="mb-4 text-muted-foreground">
          Wraps deploys email infrastructure to <em>your</em> AWS account. This
          means:
        </p>
        <Card>
          <CardContent className="p-6">
            <ul className="space-y-3">
              <li className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                <div>
                  <strong>Sending runs in your account</strong>
                  <p className="text-muted-foreground text-sm">
                    The sending setup lives in your account. No Wraps lock-in.
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                <div>
                  <strong>Pay AWS directly</strong>
                  <p className="text-muted-foreground text-sm">
                    Transparent pricing at $0.10 per 1,000 emails on à la carte
                    ($0.16 on Essentials, the default for new accounts).
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                <div>
                  <strong>We never store your credentials</strong>
                  <p className="text-muted-foreground text-sm">
                    Your AWS credentials are only used locally to set up
                    infrastructure.
                  </p>
                </div>
              </li>
            </ul>
          </CardContent>
        </Card>
      </section>

      {/* Key Concepts */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">Key Concepts</h2>
        <p className="mb-4 text-muted-foreground">
          If you're new to AWS, here are the only concepts you need to
          understand:
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Cloud className="h-4 w-4 text-primary" />
                AWS Account
              </CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground text-sm">
              Your billing account with Amazon. New accounts get $200 in AWS
              Free Tier credits, valid for 6 months.
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Cloud className="h-4 w-4 text-primary" />
                IAM User
              </CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground text-sm">
              A "sub-account" for programmatic access. You create one with
              access keys for the CLI.
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Cloud className="h-4 w-4 text-primary" />
                Access Keys
              </CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground text-sm">
              Like a username/password for the CLI. Consists of an Access Key ID
              and Secret Access Key.
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Cloud className="h-4 w-4 text-primary" />
                Region
              </CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground text-sm">
              Where your infrastructure lives (e.g., us-east-1). Choose one
              close to your users.
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Verify Setup */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">Already Set Up?</h2>
        <p className="mb-4 text-muted-foreground">
          Run our diagnostics command to check if everything is configured
          correctly:
        </p>
        <CodeBlock
          className="h-auto"
          data={[
            {
              language: "bash",
              filename: "terminal.sh",
              code: "npx @wraps.dev/cli aws doctor",
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
    </DocsLayout>
  );
}
