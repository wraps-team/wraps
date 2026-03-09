"use client";

import { ArrowLeft, ArrowRight, Terminal } from "lucide-react";
import Link from "next/link";
import { CLICommand } from "@/components/docs/cli-command";
import { DocsLayout } from "@/components/docs-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function CLIReferencePlatformPageContent() {
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
          CLI Reference / Platform
        </Badge>
        <h1 className="mb-4 font-bold text-4xl tracking-tight">
          Platform Commands
        </h1>
        <p className="text-lg text-muted-foreground">
          Connect your AWS infrastructure to the Wraps Platform for dashboards,
          templates, and workflows.
        </p>
      </div>

      {/* wraps platform connect */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <Terminal className="h-6 w-6 text-primary" />
          wraps platform connect
        </h2>
        <p className="mb-4 text-muted-foreground">
          Link your AWS account to the Wraps Platform. Enables dashboard
          features including analytics, template management, and automated
          workflows.
        </p>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-lg">Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <CLICommand command="npx @wraps.dev/cli platform connect [options]" />
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
                  --token &lt;token&gt;
                </code>
                <p className="mt-2 text-muted-foreground text-sm">
                  API token for authentication. If not provided, uses stored
                  credentials or prompts for login.
                </p>
              </div>
              <div>
                <code className="rounded bg-muted px-2 py-1">--json</code>
                <p className="mt-2 text-muted-foreground text-sm">
                  Output result as JSON for scripting and automation
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
              <li>
                Authenticates with the Wraps Platform (uses stored token or
                prompts for login)
              </li>
              <li>
                Creates or updates an IAM role (
                <code className="rounded bg-muted px-1 py-0.5">
                  wraps-platform-role
                </code>
                ) with a trust policy for the Wraps Platform
              </li>
              <li>
                Sets up an EventBridge webhook connection for real-time event
                streaming
              </li>
              <li>Stores the platform connection in your local metadata</li>
              <li>
                Enables dashboard features: analytics, template management, and
                workflows
              </li>
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
                Interactive connect (uses stored auth or prompts login):
              </p>
              <CLICommand command="npx @wraps.dev/cli platform connect" />
            </div>
            <div className="mt-4">
              <p className="mb-2 text-muted-foreground text-sm">
                Connect with an API token (for CI/CD):
              </p>
              <CLICommand command="npx @wraps.dev/cli platform connect --token wraps_sk_..." />
            </div>
          </CardContent>
        </Card>
      </section>

      {/* wraps platform update-role */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <Terminal className="h-6 w-6 text-primary" />
          wraps platform update-role
        </h2>
        <p className="mb-4 text-muted-foreground">
          Update the IAM role that grants the Wraps Platform read access to your
          AWS account. Run this after upgrading your infrastructure or changing
          services.
        </p>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-lg">Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <CLICommand command="npx @wraps.dev/cli platform update-role [options]" />
          </CardContent>
        </Card>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-lg">Options</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <code className="rounded bg-muted px-2 py-1">--json</code>
                <p className="mt-2 text-muted-foreground text-sm">
                  Output result as JSON for scripting and automation
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
              <li>Reads your current infrastructure metadata</li>
              <li>
                Creates or updates the{" "}
                <code className="rounded bg-muted px-1 py-0.5">
                  wraps-platform-role
                </code>{" "}
                IAM role with minimum required permissions
              </li>
              <li>
                Adds a trust policy allowing the Wraps Platform AWS account to
                assume the role
              </li>
              <li>Updates connection metadata with the new role ARN</li>
            </ul>
          </CardContent>
        </Card>
      </section>

      {/* Platform Features */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">Platform Features</h2>
        <p className="mb-4 text-muted-foreground">
          Connecting to the Wraps Platform unlocks powerful features on top of
          your AWS infrastructure.
        </p>

        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Starter</CardTitle>
              <p className="text-muted-foreground text-sm">$19/mo</p>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground text-sm">
                <li>AI template editor</li>
                <li>Topics, segments & broadcasts</li>
                <li>Unlimited workflows</li>
                <li>50K tracked events/mo</li>
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Growth</CardTitle>
              <p className="text-muted-foreground text-sm">$79/mo</p>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground text-sm">
                <li>Everything in Starter</li>
                <li>AI workflow generation</li>
                <li>3 AWS accounts</li>
                <li>250K tracked events/mo</li>
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Scale</CardTitle>
              <p className="text-muted-foreground text-sm">$199/mo</p>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground text-sm">
                <li>Everything in Growth</li>
                <li>Behavioral segments</li>
                <li>1K AI generations/mo</li>
                <li>Unlimited AWS accounts</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Next Steps */}
      <section className="mb-12">
        <h2 className="mb-6 font-bold text-2xl">Next Steps</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="transition-colors hover:border-primary/50">
            <a className="block p-6" href="/docs/cli-reference/auth">
              <CardTitle className="mb-2 text-lg">Auth Commands</CardTitle>
              <p className="text-muted-foreground text-sm">
                Authenticate with the Wraps Platform for dashboard access,
                templates, and workflows.
              </p>
              <div className="mt-4 flex items-center text-primary text-sm">
                Learn more
                <ArrowRight className="ml-1 h-4 w-4" />
              </div>
            </a>
          </Card>
          <Card className="transition-colors hover:border-primary/50">
            <a className="block p-6" href="/docs/client-sdk-reference">
              <CardTitle className="mb-2 text-lg">Platform SDK</CardTitle>
              <p className="text-muted-foreground text-sm">
                Use the Wraps SDK to send emails, manage templates, and interact
                with your infrastructure programmatically.
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
          <Link href="/docs/cli-reference/auth">
            Auth Commands
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </DocsLayout>
  );
}
