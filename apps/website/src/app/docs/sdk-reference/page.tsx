"use client";

import { ArrowRight, Code2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function SDKReferencePage() {
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
              SDK Reference
            </Badge>
            <h1 className="mb-4 font-bold text-4xl tracking-tight">
              @wraps.dev/email SDK
            </h1>
            <p className="text-lg text-muted-foreground">
              A TypeScript-first SDK for sending emails through your
              Wraps-deployed AWS SES infrastructure. Simple, type-safe, and
              Resend-compatible API.
            </p>
          </div>

          {/* Installation */}
          <section className="mb-12">
            <h2 className="mb-4 font-bold text-2xl">Installation</h2>
            <Tabs defaultValue="npm">
              <TabsList>
                <TabsTrigger value="npm">npm</TabsTrigger>
                <TabsTrigger value="yarn">yarn</TabsTrigger>
                <TabsTrigger value="pnpm">pnpm</TabsTrigger>
              </TabsList>
              <TabsContent value="npm">
                <Card>
                  <CardContent className="p-6">
                    <pre className="overflow-x-auto rounded bg-muted p-4">
                      <code className="text-sm">
                        npm install @wraps.dev/email
                      </code>
                    </pre>
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="yarn">
                <Card>
                  <CardContent className="p-6">
                    <pre className="overflow-x-auto rounded bg-muted p-4">
                      <code className="text-sm">yarn add @wraps.dev/email</code>
                    </pre>
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="pnpm">
                <Card>
                  <CardContent className="p-6">
                    <pre className="overflow-x-auto rounded bg-muted p-4">
                      <code className="text-sm">pnpm add @wraps.dev/email</code>
                    </pre>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </section>

          {/* Quick Start */}
          <section className="mb-12">
            <h2 className="mb-4 font-bold text-2xl">Quick Start</h2>
            <Card>
              <CardContent className="p-6">
                <pre className="overflow-x-auto rounded bg-muted p-4">
                  <code className="text-sm">{`import { Wraps } from '@wraps.dev/email';

const wraps = new Wraps();

const result = await wraps.emails.send({
  from: 'hello@yourdomain.com',
  to: 'user@example.com',
  subject: 'Welcome!',
  html: '<h1>Hello!</h1>',
});`}</code>
                </pre>
              </CardContent>
            </Card>
          </section>

          {/* Initialization */}
          <section className="mb-12">
            <h2 className="mb-4 font-bold text-2xl">Initialization</h2>
            <p className="mb-4 text-muted-foreground">
              Create a new Wraps client. The SDK automatically detects AWS
              credentials from your environment (OIDC, IAM roles, or environment
              variables).
            </p>
            <Card className="mb-4">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Code2 className="h-5 w-5" />
                  Constructor
                </CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="overflow-x-auto rounded bg-muted p-4">
                  <code className="text-sm">
                    {"new Wraps(options?: WrapsOptions)"}
                  </code>
                </pre>
                <div className="mt-4">
                  <h4 className="mb-2 font-medium">Options</h4>
                  <ul className="space-y-2 text-muted-foreground text-sm">
                    <li>
                      <code className="rounded bg-muted px-1.5 py-0.5">
                        region
                      </code>{" "}
                      (optional): AWS region where your infrastructure is
                      deployed. Defaults to{" "}
                      <code className="rounded bg-muted px-1.5 py-0.5">
                        us-east-1
                      </code>
                    </li>
                    <li>
                      <code className="rounded bg-muted px-1.5 py-0.5">
                        credentials
                      </code>{" "}
                      (optional): AWS credentials object. Auto-detected if not
                      provided.
                    </li>
                  </ul>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Example with Options</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="overflow-x-auto rounded bg-muted p-4">
                  <code className="text-sm">{`const wraps = new Wraps({
  region: 'us-west-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});`}</code>
                </pre>
              </CardContent>
            </Card>
          </section>

          {/* Send Email */}
          <section className="mb-12">
            <h2 className="mb-4 font-bold text-2xl">Send Email</h2>
            <p className="mb-4 text-muted-foreground">
              Send an email using AWS SES through your Wraps infrastructure.
            </p>
            <Card className="mb-4">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Code2 className="h-5 w-5" />
                  Method
                </CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="overflow-x-auto rounded bg-muted p-4">
                  <code className="text-sm">
                    {
                      "wraps.emails.send(params: SendEmailParams): Promise<SendEmailResult>"
                    }
                  </code>
                </pre>
              </CardContent>
            </Card>

            <h3 className="mb-4 font-medium text-lg">Parameters</h3>
            <Card className="mb-4">
              <CardContent className="p-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="pb-2 text-left">Parameter</th>
                      <th className="pb-2 text-left">Type</th>
                      <th className="pb-2 text-left">Description</th>
                    </tr>
                  </thead>
                  <tbody className="text-muted-foreground">
                    <tr className="border-b">
                      <td className="py-2">
                        <code className="rounded bg-muted px-1.5 py-0.5">
                          from
                        </code>
                      </td>
                      <td className="py-2">string</td>
                      <td className="py-2">
                        Sender email address (must be verified)
                      </td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2">
                        <code className="rounded bg-muted px-1.5 py-0.5">
                          to
                        </code>
                      </td>
                      <td className="py-2">string | string[]</td>
                      <td className="py-2">Recipient email address(es)</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2">
                        <code className="rounded bg-muted px-1.5 py-0.5">
                          subject
                        </code>
                      </td>
                      <td className="py-2">string</td>
                      <td className="py-2">Email subject line</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2">
                        <code className="rounded bg-muted px-1.5 py-0.5">
                          html
                        </code>
                      </td>
                      <td className="py-2">string</td>
                      <td className="py-2">
                        HTML email body (optional if text provided)
                      </td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2">
                        <code className="rounded bg-muted px-1.5 py-0.5">
                          text
                        </code>
                      </td>
                      <td className="py-2">string</td>
                      <td className="py-2">
                        Plain text email body (optional if html provided)
                      </td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2">
                        <code className="rounded bg-muted px-1.5 py-0.5">
                          cc
                        </code>
                      </td>
                      <td className="py-2">string | string[]</td>
                      <td className="py-2">CC recipients (optional)</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2">
                        <code className="rounded bg-muted px-1.5 py-0.5">
                          bcc
                        </code>
                      </td>
                      <td className="py-2">string | string[]</td>
                      <td className="py-2">BCC recipients (optional)</td>
                    </tr>
                    <tr>
                      <td className="py-2">
                        <code className="rounded bg-muted px-1.5 py-0.5">
                          replyTo
                        </code>
                      </td>
                      <td className="py-2">string | string[]</td>
                      <td className="py-2">Reply-to address(es) (optional)</td>
                    </tr>
                  </tbody>
                </table>
              </CardContent>
            </Card>

            <h3 className="mb-4 font-medium text-lg">Examples</h3>
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Basic Email</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="overflow-x-auto rounded bg-muted p-4">
                    <code className="text-sm">{`const result = await wraps.emails.send({
  from: 'hello@yourdomain.com',
  to: 'user@example.com',
  subject: 'Welcome to our app',
  html: '<h1>Welcome!</h1><p>Thanks for signing up.</p>',
  text: 'Welcome! Thanks for signing up.',
});

if (result.success) {
  console.log('Email sent:', result.data.messageId);
}`}</code>
                  </pre>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Multiple Recipients
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="overflow-x-auto rounded bg-muted p-4">
                    <code className="text-sm">{`const result = await wraps.emails.send({
  from: 'newsletter@yourdomain.com',
  to: ['user1@example.com', 'user2@example.com'],
  cc: 'manager@yourdomain.com',
  subject: 'Weekly Newsletter',
  html: '<h1>This week's updates</h1>',
});`}</code>
                  </pre>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">With Reply-To</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="overflow-x-auto rounded bg-muted p-4">
                    <code className="text-sm">{`const result = await wraps.emails.send({
  from: 'noreply@yourdomain.com',
  to: 'customer@example.com',
  replyTo: 'support@yourdomain.com',
  subject: 'Order Confirmation',
  html: '<h1>Your order has been confirmed</h1>',
});`}</code>
                  </pre>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* Response */}
          <section className="mb-12">
            <h2 className="mb-4 font-bold text-2xl">Response</h2>
            <p className="mb-4 text-muted-foreground">
              All SDK methods return a result object with type-safe
              success/error handling.
            </p>
            <Card>
              <CardContent className="p-6">
                <pre className="overflow-x-auto rounded bg-muted p-4">
                  <code className="text-sm">{`type SendEmailResult =
  | { success: true; data: { messageId: string } }
  | { success: false; error: Error }

// Usage
const result = await wraps.emails.send({ ... });

if (result.success) {
  // TypeScript knows result.data exists
  console.log('Message ID:', result.data.messageId);
} else {
  // TypeScript knows result.error exists
  console.error('Error:', result.error.message);
}`}</code>
                </pre>
              </CardContent>
            </Card>
          </section>

          {/* Error Handling */}
          <section className="mb-12">
            <h2 className="mb-4 font-bold text-2xl">Error Handling</h2>
            <p className="mb-4 text-muted-foreground">
              The SDK uses a type-safe result pattern instead of throwing
              errors.
            </p>
            <Card>
              <CardContent className="p-6">
                <pre className="overflow-x-auto rounded bg-muted p-4">
                  <code className="text-sm">{`const result = await wraps.emails.send({
  from: 'hello@yourdomain.com',
  to: 'invalid-email',
  subject: 'Test',
  html: '<p>Test</p>',
});

if (!result.success) {
  // Handle error
  console.error('Failed to send email:', result.error.message);

  // Common errors:
  // - Invalid email address
  // - Unverified sender domain
  // - AWS credentials not found
  // - SES service errors
  return;
}

// Success case
console.log('Email sent successfully:', result.data.messageId);`}</code>
                </pre>
              </CardContent>
            </Card>
          </section>

          {/* TypeScript Support */}
          <section className="mb-12">
            <h2 className="mb-4 font-bold text-2xl">TypeScript Support</h2>
            <p className="mb-4 text-muted-foreground">
              The SDK is written in TypeScript and provides full type safety out
              of the box.
            </p>
            <Card>
              <CardContent className="p-6">
                <pre className="overflow-x-auto rounded bg-muted p-4">
                  <code className="text-sm">{`import { Wraps, SendEmailParams, SendEmailResult } from '@wraps.dev/email';

const wraps = new Wraps();

// TypeScript will validate all parameters
const params: SendEmailParams = {
  from: 'hello@yourdomain.com',
  to: 'user@example.com',
  subject: 'Test',
  html: '<p>Test</p>',
};

const result: SendEmailResult = await wraps.emails.send(params);`}</code>
                </pre>
              </CardContent>
            </Card>
          </section>

          {/* Next Steps */}
          <section className="mb-12">
            <h2 className="mb-6 font-bold text-2xl">Next Steps</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <Card className="transition-colors hover:border-primary/50">
                <CardHeader>
                  <CardTitle className="text-lg">View on npm</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="mb-4 text-muted-foreground text-sm">
                    Check out the package on npm for the latest version and
                    changelog.
                  </p>
                  <Button asChild variant="outline">
                    <a
                      href="https://www.npmjs.com/package/@wraps.dev/email"
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      View Package
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </a>
                  </Button>
                </CardContent>
              </Card>

              <Card className="transition-colors hover:border-primary/50">
                <CardHeader>
                  <CardTitle className="text-lg">View on GitHub</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="mb-4 text-muted-foreground text-sm">
                    Explore the source code, report issues, or contribute.
                  </p>
                  <Button asChild variant="outline">
                    <a
                      href="https://github.com/wraps-team/wraps-js"
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      View Source
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </a>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
