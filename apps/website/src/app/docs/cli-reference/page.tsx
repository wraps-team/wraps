"use client";

import { ArrowRight, Terminal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function CLIReferencePage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <a className="flex items-center gap-2" href="/">
              <span className="font-bold text-xl">Wraps</span>
            </a>
            <div className="flex gap-2">
              <Button asChild variant="ghost">
                <a href="/docs">Docs</a>
              </Button>
              <Button asChild variant="ghost">
                <a href="/">Home</a>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
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
              monitor your AWS email infrastructure.
            </p>
          </div>

          {/* Global Options */}
          <section className="mb-12">
            <h2 className="mb-4 font-bold text-2xl">Global Options</h2>
            <Card>
              <CardContent className="p-6">
                <div className="space-y-4">
                  <div>
                    <code className="rounded bg-muted px-2 py-1">
                      --help, -h
                    </code>
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
                </div>
              </CardContent>
            </Card>
          </section>

          {/* wraps init */}
          <section className="mb-12">
            <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
              <Terminal className="h-6 w-6 text-primary" />
              wraps init
            </h2>
            <p className="mb-4 text-muted-foreground">
              Deploy new email infrastructure to your AWS account. This is the
              primary command for setting up Wraps for the first time.
            </p>

            <Card className="mb-4">
              <CardHeader>
                <CardTitle className="text-lg">Usage</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="overflow-x-auto rounded bg-muted p-4">
                  <code className="text-sm">
                    npx @wraps.dev/cli init [options]
                  </code>
                </pre>
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
                      --domain &lt;domain&gt;
                    </code>
                    <p className="mt-2 text-muted-foreground text-sm">
                      Domain to configure for sending emails (e.g.,
                      yourdomain.com)
                    </p>
                  </div>
                  <div>
                    <code className="rounded bg-muted px-2 py-1">
                      --region &lt;region&gt;
                    </code>
                    <p className="mt-2 text-muted-foreground text-sm">
                      AWS region to deploy infrastructure (default: us-east-1)
                    </p>
                  </div>
                  <div>
                    <code className="rounded bg-muted px-2 py-1">
                      --preset &lt;preset&gt;
                    </code>
                    <p className="mt-2 text-muted-foreground text-sm">
                      Configuration preset: starter, production, enterprise, or
                      custom
                    </p>
                  </div>
                  <div>
                    <code className="rounded bg-muted px-2 py-1">
                      --provider &lt;provider&gt;
                    </code>
                    <p className="mt-2 text-muted-foreground text-sm">
                      Hosting provider: vercel, lambda, ecs, or ec2
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="mb-4">
              <CardHeader>
                <CardTitle className="text-lg">What It Does</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc space-y-2 pl-5 text-muted-foreground text-sm">
                  <li>Validates your AWS credentials and account access</li>
                  <li>
                    Prompts for configuration preferences (if not provided via
                    flags)
                  </li>
                  <li>
                    Shows estimated monthly AWS costs based on selected features
                  </li>
                  <li>
                    Deploys AWS SES, DynamoDB, Lambda, EventBridge, SQS, and IAM
                    roles
                  </li>
                  <li>
                    Sets up OIDC provider for Vercel deployments (if selected)
                  </li>
                  <li>Creates configuration metadata for future commands</li>
                  <li>Takes 1-2 minutes to complete</li>
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
                  <pre className="overflow-x-auto rounded bg-muted p-3">
                    <code className="text-sm">npx @wraps.dev/cli init</code>
                  </pre>
                </div>
                <div>
                  <p className="mb-2 text-muted-foreground text-sm">
                    Non-interactive with all options:
                  </p>
                  <pre className="overflow-x-auto rounded bg-muted p-3">
                    <code className="text-sm">
                      npx @wraps.dev/cli init --domain yourdomain.com --region
                      us-west-2 --preset production --provider vercel
                    </code>
                  </pre>
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
              Display the current status of your Wraps infrastructure, including
              deployed resources, active features, and configuration details.
            </p>

            <Card className="mb-4">
              <CardHeader>
                <CardTitle className="text-lg">Usage</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="overflow-x-auto rounded bg-muted p-4">
                  <code className="text-sm">npx @wraps.dev/cli status</code>
                </pre>
              </CardContent>
            </Card>

            <Card className="mb-4">
              <CardHeader>
                <CardTitle className="text-lg">What It Displays</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc space-y-2 pl-5 text-muted-foreground text-sm">
                  <li>AWS account and region</li>
                  <li>Verified SES domains and their status</li>
                  <li>Active configuration preset and features</li>
                  <li>
                    Deployed AWS resources (IAM roles, DynamoDB tables, Lambda
                    functions)
                  </li>
                  <li>DKIM tokens for DNS configuration</li>
                  <li>Links to local console and documentation</li>
                </ul>
              </CardContent>
            </Card>
          </section>

          {/* wraps verify */}
          <section className="mb-12">
            <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
              <Terminal className="h-6 w-6 text-primary" />
              wraps verify
            </h2>
            <p className="mb-4 text-muted-foreground">
              Check the DNS verification status of a domain, including DKIM,
              SPF, and DMARC records. Provides guidance if records are missing
              or incorrect.
            </p>

            <Card className="mb-4">
              <CardHeader>
                <CardTitle className="text-lg">Usage</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="overflow-x-auto rounded bg-muted p-4">
                  <code className="text-sm">
                    npx @wraps.dev/cli verify &lt;domain&gt;
                  </code>
                </pre>
              </CardContent>
            </Card>

            <Card className="mb-4">
              <CardHeader>
                <CardTitle className="text-lg">What It Checks</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc space-y-2 pl-5 text-muted-foreground text-sm">
                  <li>SES domain verification status</li>
                  <li>DKIM DNS records (3 CNAME records)</li>
                  <li>SPF record (TXT record for sender verification)</li>
                  <li>
                    DMARC record (TXT record for email authentication policy)
                  </li>
                  <li>Provides copy-paste ready DNS record values</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Example</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="overflow-x-auto rounded bg-muted p-4">
                  <code className="text-sm">
                    npx @wraps.dev/cli verify yourdomain.com
                  </code>
                </pre>
              </CardContent>
            </Card>
          </section>

          {/* wraps connect */}
          <section className="mb-12">
            <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
              <Terminal className="h-6 w-6 text-primary" />
              wraps connect
            </h2>
            <p className="mb-4 text-muted-foreground">
              Connect to existing AWS SES resources and add Wraps features
              non-destructively. Never modifies your existing SES setup.
            </p>

            <Card className="mb-4">
              <CardHeader>
                <CardTitle className="text-lg">Usage</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="overflow-x-auto rounded bg-muted p-4">
                  <code className="text-sm">
                    npx @wraps.dev/cli connect [options]
                  </code>
                </pre>
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
                      --region &lt;region&gt;
                    </code>
                    <p className="mt-2 text-muted-foreground text-sm">
                      AWS region to scan for existing resources
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="mb-4">
              <CardHeader>
                <CardTitle className="text-lg">What It Does</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc space-y-2 pl-5 text-muted-foreground text-sm">
                  <li>Scans existing SES domains and configuration sets</li>
                  <li>Prompts for which features to add</li>
                  <li>
                    Creates new resources with{" "}
                    <code className="rounded bg-muted px-1 py-0.5">wraps-</code>{" "}
                    prefix
                  </li>
                  <li>Never modifies or deletes existing resources</li>
                  <li>Configures event tracking and analytics</li>
                </ul>
              </CardContent>
            </Card>
          </section>

          {/* wraps upgrade */}
          <section className="mb-12">
            <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
              <Terminal className="h-6 w-6 text-primary" />
              wraps upgrade
            </h2>
            <p className="mb-4 text-muted-foreground">
              Add additional features to your existing Wraps deployment. Upgrade
              from Starter to Production, or add individual features
              incrementally.
            </p>

            <Card className="mb-4">
              <CardHeader>
                <CardTitle className="text-lg">Usage</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="overflow-x-auto rounded bg-muted p-4">
                  <code className="text-sm">
                    npx @wraps.dev/cli upgrade [options]
                  </code>
                </pre>
              </CardContent>
            </Card>

            <Card className="mb-4">
              <CardHeader>
                <CardTitle className="text-lg">What It Does</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc space-y-2 pl-5 text-muted-foreground text-sm">
                  <li>Shows currently enabled features</li>
                  <li>Prompts for additional features to enable</li>
                  <li>Deploys new resources incrementally</li>
                  <li>Updates IAM policies with new permissions</li>
                  <li>Updates DynamoDB tables if needed</li>
                  <li>Shows updated cost estimates</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Example Upgrades</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc space-y-2 pl-5 text-muted-foreground text-sm">
                  <li>
                    Starter → Production: Adds real-time event tracking and
                    90-day history
                  </li>
                  <li>
                    Production → Enterprise: Adds dedicated IP and 1-year
                    history retention
                  </li>
                  <li>
                    Add individual features: Enable specific event types or
                    extend storage
                  </li>
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
              Launch the local Wraps console dashboard to view email analytics,
              event tracking, and infrastructure status.
            </p>

            <Card className="mb-4">
              <CardHeader>
                <CardTitle className="text-lg">Usage</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="overflow-x-auto rounded bg-muted p-4">
                  <code className="text-sm">npx @wraps.dev/cli console</code>
                </pre>
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
                      Port to run the console on (default: 3000)
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="mb-4">
              <CardHeader>
                <CardTitle className="text-lg">Features</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc space-y-2 pl-5 text-muted-foreground text-sm">
                  <li>Email history and search</li>
                  <li>Delivery rates and analytics</li>
                  <li>Bounce and complaint tracking</li>
                  <li>Open and click rates</li>
                  <li>Domain verification status</li>
                  <li>Infrastructure resource viewer</li>
                </ul>
              </CardContent>
            </Card>
          </section>

          {/* wraps restore */}
          <section className="mb-12">
            <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
              <Terminal className="h-6 w-6 text-primary" />
              wraps restore
            </h2>
            <p className="mb-4 text-muted-foreground">
              Restore Wraps deployment from existing metadata. Useful if you've
              lost local configuration but infrastructure still exists in AWS.
            </p>

            <Card className="mb-4">
              <CardHeader>
                <CardTitle className="text-lg">Usage</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="overflow-x-auto rounded bg-muted p-4">
                  <code className="text-sm">
                    npx @wraps.dev/cli restore [options]
                  </code>
                </pre>
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
                      --region &lt;region&gt;
                    </code>
                    <p className="mt-2 text-muted-foreground text-sm">
                      AWS region where infrastructure was deployed
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">What It Does</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc space-y-2 pl-5 text-muted-foreground text-sm">
                  <li>Scans AWS for existing Wraps resources</li>
                  <li>Reconstructs deployment metadata</li>
                  <li>Re-imports Pulumi stack state</li>
                  <li>Restores local configuration</li>
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
              Remove all Wraps infrastructure from your AWS account. This is a
              destructive operation and requires confirmation.
            </p>

            <Card className="mb-4">
              <CardHeader>
                <CardTitle className="text-lg">Usage</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="overflow-x-auto rounded bg-muted p-4">
                  <code className="text-sm">
                    npx @wraps.dev/cli destroy [options]
                  </code>
                </pre>
              </CardContent>
            </Card>

            <Card className="mb-4">
              <CardHeader>
                <CardTitle className="text-lg">Options</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <code className="rounded bg-muted px-2 py-1">--force</code>
                    <p className="mt-2 text-muted-foreground text-sm">
                      Skip confirmation prompt (use with caution)
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="mb-4">
              <CardHeader>
                <CardTitle className="text-lg">What It Removes</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc space-y-2 pl-5 text-muted-foreground text-sm">
                  <li>IAM roles and policies</li>
                  <li>DynamoDB tables (email history will be lost)</li>
                  <li>Lambda functions</li>
                  <li>EventBridge rules</li>
                  <li>SQS queues</li>
                  <li>OIDC providers (if created)</li>
                  <li>Local metadata and Pulumi state</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Important Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-muted-foreground text-sm">
                  <p>
                    ⚠️ This command does NOT delete your SES domains or verified
                    identities. Those remain in your AWS account.
                  </p>
                  <p>
                    ⚠️ All email history stored in DynamoDB will be permanently
                    deleted.
                  </p>
                  <p>
                    ⚠️ This operation cannot be undone. Make sure you have
                    backups if needed.
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
                    <code className="rounded bg-muted px-2 py-1">
                      ~/.wraps/
                    </code>
                    <p className="mt-2 text-muted-foreground text-sm">
                      Main configuration directory containing deployment
                      metadata and Pulumi state
                    </p>
                  </div>
                  <div>
                    <code className="rounded bg-muted px-2 py-1">
                      ~/.wraps/metadata/
                    </code>
                    <p className="mt-2 text-muted-foreground text-sm">
                      Deployment metadata files (one per AWS account/region
                      combination)
                    </p>
                  </div>
                  <div>
                    <code className="rounded bg-muted px-2 py-1">
                      ~/.wraps/stacks/
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
                    <code className="rounded bg-muted px-2 py-1">
                      AWS_PROFILE
                    </code>
                    <p className="mt-2 text-muted-foreground text-sm">
                      AWS CLI profile to use for authentication
                    </p>
                  </div>
                  <div>
                    <code className="rounded bg-muted px-2 py-1">
                      AWS_REGION
                    </code>
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

          {/* Next Steps */}
          <section className="mb-12">
            <h2 className="mb-6 font-bold text-2xl">Next Steps</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <Card className="transition-colors hover:border-primary/50">
                <CardHeader>
                  <CardTitle className="text-lg">Quickstart Guide</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="mb-4 text-muted-foreground text-sm">
                    New to Wraps? Start with our step-by-step quickstart guide.
                  </p>
                  <Button asChild variant="outline">
                    <a href="/docs/quickstart">
                      Get Started
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </a>
                  </Button>
                </CardContent>
              </Card>

              <Card className="transition-colors hover:border-primary/50">
                <CardHeader>
                  <CardTitle className="text-lg">SDK Reference</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="mb-4 text-muted-foreground text-sm">
                    Learn how to send emails with the TypeScript SDK.
                  </p>
                  <Button asChild variant="outline">
                    <a href="/docs/sdk-reference">
                      View SDK Docs
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </a>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* Help Section */}
          <Card className="bg-muted/50">
            <CardContent className="p-8 text-center">
              <h3 className="mb-2 font-bold text-xl">Need Help?</h3>
              <p className="mb-4 text-muted-foreground">
                If you run into any issues, check our GitHub discussions or open
                an issue.
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
        </div>
      </div>
    </div>
  );
}
