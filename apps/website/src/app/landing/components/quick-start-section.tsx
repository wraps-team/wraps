"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Snippet,
  SnippetCopyButton,
  SnippetHeader,
  SnippetTabsContent,
  SnippetTabsList,
  SnippetTabsTrigger,
} from "@/components/ui/shadcn-io/snippet";

const installCommands = {
  npm: "npm install @wraps.dev/email",
  pnpm: "pnpm add @wraps.dev/email",
  yarn: "yarn add @wraps.dev/email",
  bun: "bun add @wraps.dev/email",
};

const cliExample = `# Deploy infrastructure to AWS
npx @wraps.dev/cli init

# Verify your domain
npx @wraps.dev/cli verify yourdomain.com

# View deployment status
npx @wraps.dev/cli status`;

const sdkExample = `import { Wraps } from '@wraps.dev/email';

const wraps = new Wraps();

const result = await wraps.emails.send({
  from: 'hello@yourdomain.com',
  to: 'user@example.com',
  subject: 'Welcome to our app!',
  html: '<h1>Welcome!</h1><p>Thanks for signing up.</p>',
});

if (result.success) {
  console.log('Email sent:', result.data.messageId);
}`;

export function QuickStartSection() {
  return (
    <section className="border-y bg-gradient-to-b from-background via-muted/20 to-background py-24">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          {/* Section Header */}
          <div className="mb-12 text-center">
            <Badge className="mb-4" variant="outline">
              Quick Start
            </Badge>
            <h2 className="mb-4 font-bold text-3xl tracking-tight sm:text-4xl">
              Get started in minutes
            </h2>
            <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
              Deploy email infrastructure and send your first email in just a
              few commands. No AWS expertise required.
            </p>
          </div>

          {/* Two Column Layout */}
          <div className="grid gap-8 lg:grid-cols-2">
            {/* CLI Setup */}
            <Card className="border-2">
              <CardContent className="p-6">
                <div className="mb-4">
                  <div className="mb-2 flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground">
                      1
                    </div>
                    <h3 className="font-semibold text-xl">
                      Deploy Infrastructure
                    </h3>
                  </div>
                  <p className="text-muted-foreground text-sm">
                    One command deploys AWS SES, DynamoDB, Lambda, and IAM roles
                    to your account.
                  </p>
                </div>
                <div className="group relative">
                  <pre className="overflow-x-auto rounded-lg border bg-muted/50 p-4 text-sm">
                    <code className="text-foreground">{cliExample}</code>
                  </pre>
                  <Button
                    className="absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={() => navigator.clipboard.writeText(cliExample)}
                    size="sm"
                    variant="ghost"
                  >
                    Copy
                  </Button>
                </div>
                <div className="mt-4 rounded-lg bg-muted/50 p-4">
                  <p className="font-medium text-sm">
                    ✨ Takes less than 2 minutes
                  </p>
                  <ul className="mt-2 space-y-1 text-muted-foreground text-xs">
                    <li>• Validates AWS credentials</li>
                    <li>• Shows cost estimates</li>
                    <li>• Deploys all resources</li>
                    <li>• Zero stored credentials</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            {/* SDK Usage */}
            <Card className="border-2">
              <CardContent className="p-6">
                <div className="mb-4">
                  <div className="mb-2 flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground">
                      2
                    </div>
                    <h3 className="font-semibold text-xl">
                      Install SDK & Send Emails
                    </h3>
                  </div>
                  <p className="mb-4 text-muted-foreground text-sm">
                    Install the TypeScript SDK and start sending emails with a
                    Resend-like API.
                  </p>

                  {/* Package Manager Tabs */}
                  <Snippet className="mb-4" defaultValue="npm">
                    <SnippetHeader>
                      <SnippetTabsList>
                        <SnippetTabsTrigger value="npm">npm</SnippetTabsTrigger>
                        <SnippetTabsTrigger value="pnpm">
                          pnpm
                        </SnippetTabsTrigger>
                        <SnippetTabsTrigger value="yarn">
                          yarn
                        </SnippetTabsTrigger>
                        <SnippetTabsTrigger value="bun">bun</SnippetTabsTrigger>
                      </SnippetTabsList>
                      <SnippetCopyButton
                        className="opacity-100"
                        value={installCommands.npm}
                      />
                    </SnippetHeader>
                    {Object.entries(installCommands).map(([key, command]) => (
                      <SnippetTabsContent key={key} value={key}>
                        {command}
                      </SnippetTabsContent>
                    ))}
                  </Snippet>
                </div>

                <p className="mb-2 font-medium text-sm">
                  Send your first email:
                </p>
                <div className="group relative">
                  <pre className="overflow-x-auto rounded-lg border bg-muted/50 p-4 text-sm">
                    <code className="text-foreground">{sdkExample}</code>
                  </pre>
                  <Button
                    className="absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={() => navigator.clipboard.writeText(sdkExample)}
                    size="sm"
                    variant="ghost"
                  >
                    Copy
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Next Steps */}
          <div className="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button asChild size="lg">
              <a href="/docs/quickstart">View Full Quickstart Guide</a>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="/docs/sdk-reference">Explore SDK Reference</a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
