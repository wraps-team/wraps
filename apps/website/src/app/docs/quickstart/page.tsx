"use client";

import { ArrowRight, CheckCircle2, Terminal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function QuickstartPage() {
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
              Quickstart Guide
            </Badge>
            <h1 className="mb-4 font-bold text-4xl tracking-tight">
              Get Started with Wraps
            </h1>
            <p className="text-lg text-muted-foreground">
              Deploy production-ready email infrastructure to your AWS account
              in under 2 minutes and send your first email.
            </p>
          </div>

          {/* Prerequisites */}
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
                  AWS CLI installed and configured (or AWS credentials in
                  environment variables)
                </li>
              </ul>
            </CardContent>
          </Card>

          {/* Step 1: Deploy Infrastructure */}
          <section className="mb-12">
            <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
                1
              </div>
              Deploy Infrastructure
            </h2>
            <p className="mb-4 text-muted-foreground">
              Run the Wraps CLI to deploy email infrastructure to your AWS
              account:
            </p>
            <Card>
              <CardContent className="p-6">
                <div className="mb-2 flex items-center gap-2 text-muted-foreground text-sm">
                  <Terminal className="h-4 w-4" />
                  Terminal
                </div>
                <pre className="overflow-x-auto rounded bg-muted p-4">
                  <code className="text-sm">npx @wraps.dev/cli email init</code>
                </pre>
              </CardContent>
            </Card>
            <div className="mt-4 rounded-lg border-primary border-l-4 bg-primary/10 p-4">
              <p className="font-medium text-sm">
                What happens during deployment?
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground text-sm">
                <li>Validates your AWS credentials</li>
                <li>
                  Prompts you to choose a configuration preset (Starter,
                  Production, or Enterprise)
                </li>
                <li>Shows estimated monthly AWS costs</li>
                <li>
                  Deploys SES, DynamoDB, Lambda, EventBridge, and IAM roles to
                  your AWS account
                </li>
                <li>Takes 1-2 minutes to complete</li>
              </ul>
            </div>
          </section>

          {/* Step 2: Install SDK */}
          <section className="mb-12">
            <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
                2
              </div>
              Install the TypeScript SDK
            </h2>
            <p className="mb-4 text-muted-foreground">
              Install the{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                @wraps.dev/email
              </code>{" "}
              package:
            </p>
            <Card>
              <CardContent className="p-6">
                <div className="mb-2 flex items-center gap-2 text-muted-foreground text-sm">
                  <Terminal className="h-4 w-4" />
                  npm
                </div>
                <pre className="overflow-x-auto rounded bg-muted p-4">
                  <code className="text-sm">npm install @wraps.dev/email</code>
                </pre>
              </CardContent>
            </Card>
          </section>

          {/* Step 3: Send Your First Email */}
          <section className="mb-12">
            <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
                3
              </div>
              Send Your First Email
            </h2>
            <p className="mb-4 text-muted-foreground">
              Create a new file and send an email using the SDK:
            </p>
            <Card className="mb-4">
              <CardContent className="p-6">
                <div className="mb-2 flex items-center gap-2 text-muted-foreground text-sm">
                  <Terminal className="h-4 w-4" />
                  TypeScript / JavaScript
                </div>
                <pre className="overflow-x-auto rounded bg-muted p-4">
                  <code className="text-sm">{`import { Wraps } from '@wraps.dev/email';

// Initialize the client
const wraps = new Wraps();

// Send an email
const result = await wraps.emails.send({
  from: 'hello@yourdomain.com',
  to: 'user@example.com',
  subject: 'Welcome to Wraps!',
  html: '<h1>Hello from Wraps!</h1><p>This email was sent using AWS SES.</p>',
});

if (result.success) {
  console.log('Email sent:', result.data.messageId);
} else {
  console.error('Failed to send email:', result.error);
}`}</code>
                </pre>
              </CardContent>
            </Card>
            <div className="rounded-lg border-primary border-l-4 bg-primary/10 p-4">
              <p className="font-medium text-sm">Note: Domain Verification</p>
              <p className="mt-2 text-muted-foreground text-sm">
                Before sending emails, you need to verify your domain with AWS
                SES. Run{" "}
                <code className="rounded bg-muted px-1.5 py-0.5">
                  npx @wraps.dev/cli email verify --domain yourdomain.com
                </code>{" "}
                to check your DNS records and get setup instructions.
              </p>
            </div>
          </section>

          {/* Step 4: View Analytics */}
          <section className="mb-12">
            <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
                4
              </div>
              View Analytics (Optional)
            </h2>
            <p className="mb-4 text-muted-foreground">
              Run the local console to view email analytics and event tracking:
            </p>
            <Card className="mb-4">
              <CardContent className="p-6">
                <div className="mb-2 flex items-center gap-2 text-muted-foreground text-sm">
                  <Terminal className="h-4 w-4" />
                  Terminal
                </div>
                <pre className="overflow-x-auto rounded bg-muted p-4">
                  <code className="text-sm">npx @wraps.dev/cli console</code>
                </pre>
              </CardContent>
            </Card>
            <p className="text-muted-foreground text-sm">
              The console will open at{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                http://localhost:3000
              </code>{" "}
              where you can view email history, delivery rates, bounces,
              complaints, and more.
            </p>
          </section>

          {/* Next Steps */}
          <section className="mb-12">
            <h2 className="mb-6 font-bold text-2xl">Next Steps</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <Card className="transition-colors hover:border-primary/50">
                <CardHeader>
                  <CardTitle className="text-lg">SDK Reference</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="mb-4 text-muted-foreground text-sm">
                    Learn about all available methods, options, and advanced
                    features.
                  </p>
                  <Button asChild variant="outline">
                    <a href="/docs/sdk-reference">
                      View SDK Docs
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </a>
                  </Button>
                </CardContent>
              </Card>

              <Card className="transition-colors hover:border-primary/50">
                <CardHeader>
                  <CardTitle className="text-lg">CLI Commands</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="mb-4 text-muted-foreground text-sm">
                    Explore all CLI commands for managing your infrastructure.
                  </p>
                  <Button asChild variant="outline">
                    <a href="/docs/cli-reference">
                      View CLI Docs
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
