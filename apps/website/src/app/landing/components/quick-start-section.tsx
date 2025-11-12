"use client";

import { CheckCircle2, Copy } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const installCommands = {
  npm: "npm install @wraps-js/email",
  pnpm: "pnpm add @wraps-js/email",
  yarn: "yarn add @wraps-js/email",
};

const cliExample = `# Deploy infrastructure to AWS
npx wraps init

# Verify your domain
npx wraps verify yourdomain.com

# View deployment status
npx wraps status`;

const sdkExample = `import { Wraps } from '@wraps-js/email';

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

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="group relative">
      <pre className="overflow-x-auto rounded-lg border bg-muted/50 p-4 text-sm">
        <code className="text-foreground">{code}</code>
      </pre>
      <Button
        className="absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100"
        onClick={copyToClipboard}
        size="sm"
        variant="ghost"
      >
        {copied ? (
          <>
            <CheckCircle2 className="mr-1 h-3 w-3" />
            Copied!
          </>
        ) : (
          <>
            <Copy className="mr-1 h-3 w-3" />
            Copy
          </>
        )}
      </Button>
    </div>
  );
}

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
                <CodeBlock code={cliExample} />
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
                  <Tabs className="mb-4" defaultValue="npm">
                    <TabsList className="grid w-full grid-cols-3">
                      <TabsTrigger value="npm">npm</TabsTrigger>
                      <TabsTrigger value="pnpm">pnpm</TabsTrigger>
                      <TabsTrigger value="yarn">yarn</TabsTrigger>
                    </TabsList>
                    {Object.entries(installCommands).map(([key, command]) => (
                      <TabsContent key={key} value={key}>
                        <CodeBlock code={command} />
                      </TabsContent>
                    ))}
                  </Tabs>
                </div>

                <p className="mb-2 font-medium text-sm">
                  Send your first email:
                </p>
                <CodeBlock code={sdkExample} />
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
