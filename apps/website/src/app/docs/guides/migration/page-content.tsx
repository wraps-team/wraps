"use client";

import { Badge } from "@wraps/ui/components/ui/badge";
import { Button } from "@wraps/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
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

const sendgridCode = `import sgMail from '@sendgrid/mail';

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

await sgMail.send({
  to: 'user@example.com',
  from: 'hello@yourapp.com',
  subject: 'Welcome!',
  html: '<h1>Hello!</h1>',
});`;

const postmarkCode = `import { ServerClient } from 'postmark';

const client = new ServerClient(process.env.POSTMARK_SERVER_TOKEN);

await client.sendEmail({
  To: 'user@example.com',
  From: 'hello@yourapp.com',
  Subject: 'Welcome!',
  HtmlBody: '<h1>Hello!</h1>',
});`;

const resendCode = `import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

await resend.emails.send({
  to: 'user@example.com',
  from: 'hello@yourapp.com',
  subject: 'Welcome!',
  html: '<h1>Hello!</h1>',
});`;

const wrapsCode = `import { WrapsEmail } from '@wraps.dev/email';

const email = new WrapsEmail();

await email.send({
  to: 'user@example.com',
  from: 'hello@yourapp.com',
  subject: 'Welcome!',
  html: '<h1>Hello!</h1>',
});`;

export default function MigrationGuidePageContent() {
  return (
    <DocsLayout>
      {/* Back link */}
      <div className="mb-8">
        <Button asChild size="sm" variant="ghost">
          <Link href="/docs/guides">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Guides
          </Link>
        </Button>
      </div>

      {/* Page Header */}
      <div className="mb-12">
        <Badge className="mb-4" variant="outline">
          Guide
        </Badge>
        <h1 className="mb-4 font-bold text-4xl tracking-tight">
          Migration Guide
        </h1>
        <p className="text-lg text-muted-foreground">
          Switch from SendGrid, Postmark, or Resend to Wraps. Side-by-side code
          comparisons, cost analysis, and step-by-step migration instructions.
        </p>
      </div>

      {/* Why Migrate */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">Why Migrate to Wraps?</h2>
        <Card>
          <CardContent className="p-6">
            <ul className="space-y-3">
              <li className="flex items-start gap-3">
                <Check className="mt-0.5 h-5 w-5 shrink-0 text-green-500" />
                <div>
                  <span className="font-medium">Own your infrastructure</span>
                  <p className="text-muted-foreground text-sm">
                    Email infrastructure deploys to your AWS account. No
                    middleman, no vendor lock-in.
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <Check className="mt-0.5 h-5 w-5 shrink-0 text-green-500" />
                <div>
                  <span className="font-medium">$0.10 per 1,000 emails</span>
                  <p className="text-muted-foreground text-sm">
                    Pay AWS directly at transparent pricing. No markup, no
                    surprise bills.
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <Check className="mt-0.5 h-5 w-5 shrink-0 text-green-500" />
                <div>
                  <span className="font-medium">No vendor lock-in</span>
                  <p className="text-muted-foreground text-sm">
                    Infrastructure stays in your account even if you stop using
                    Wraps. Your data is always yours.
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <Check className="mt-0.5 h-5 w-5 shrink-0 text-green-500" />
                <div>
                  <span className="font-medium">Full data ownership</span>
                  <p className="text-muted-foreground text-sm">
                    Email logs, metrics, and sending data live in your AWS
                    account with full data residency control.
                  </p>
                </div>
              </li>
            </ul>
          </CardContent>
        </Card>
      </section>

      {/* From SendGrid */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">Migrating from SendGrid</h2>
        <p className="mb-4 text-muted-foreground">
          Replace your SendGrid API key with OIDC-based authentication. No more
          managing API keys in environment variables.
        </p>
        <CodeBlock
          className="mb-4 h-auto"
          data={[
            {
              language: "sendgrid",
              filename: "SendGrid (before)",
              code: sendgridCode,
            },
            {
              language: "wraps",
              filename: "Wraps (after)",
              code: wrapsCode,
            },
          ]}
          defaultValue="sendgrid"
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
                <CodeBlockContent language="typescript">
                  {item.code}
                </CodeBlockContent>
              </CodeBlockItem>
            )}
          </CodeBlockBody>
        </CodeBlock>
        <div className="rounded-lg border-primary border-l-4 bg-primary/10 p-4">
          <p className="font-medium text-sm">No more API keys</p>
          <p className="mt-2 text-muted-foreground text-sm">
            Wraps uses OIDC for authentication when deployed on Vercel, or IAM
            roles on AWS. No secrets to rotate or leak.
          </p>
        </div>
      </section>

      {/* From Postmark */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">Migrating from Postmark</h2>
        <p className="mb-4 text-muted-foreground">
          Postmark uses different field names (PascalCase). Wraps uses a
          familiar camelCase API that matches modern JavaScript conventions.
        </p>
        <CodeBlock
          className="mb-4 h-auto"
          data={[
            {
              language: "postmark",
              filename: "Postmark (before)",
              code: postmarkCode,
            },
            {
              language: "wraps",
              filename: "Wraps (after)",
              code: wrapsCode,
            },
          ]}
          defaultValue="postmark"
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
                <CodeBlockContent language="typescript">
                  {item.code}
                </CodeBlockContent>
              </CodeBlockItem>
            )}
          </CodeBlockBody>
        </CodeBlock>
      </section>

      {/* From Resend */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">Migrating from Resend</h2>
        <p className="mb-4 text-muted-foreground">
          Resend and Wraps have a similar developer experience, but with Wraps
          the infrastructure lives in your AWS account at a fraction of the
          cost.
        </p>
        <CodeBlock
          className="mb-4 h-auto"
          data={[
            {
              language: "resend",
              filename: "Resend (before)",
              code: resendCode,
            },
            {
              language: "wraps",
              filename: "Wraps (after)",
              code: wrapsCode,
            },
          ]}
          defaultValue="resend"
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
                <CodeBlockContent language="typescript">
                  {item.code}
                </CodeBlockContent>
              </CodeBlockItem>
            )}
          </CodeBlockBody>
        </CodeBlock>
        <div className="rounded-lg border-primary border-l-4 bg-primary/10 p-4">
          <p className="font-medium text-sm">
            Same great DX, you own the infra
          </p>
          <p className="mt-2 text-muted-foreground text-sm">
            The API is intentionally familiar. The difference is that your
            emails flow through infrastructure you own in your AWS account.
          </p>
        </div>
      </section>

      {/* Common Migration Steps */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">Common Migration Steps</h2>
        <Card>
          <CardContent className="p-6">
            <ol className="space-y-6">
              <li>
                <div className="mb-2 flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary font-medium text-primary-foreground text-xs">
                    1
                  </div>
                  <span className="font-medium">Deploy infrastructure</span>
                </div>
                <CLICommand command="npx @wraps.dev/cli email init" />
              </li>
              <li>
                <div className="mb-2 flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary font-medium text-primary-foreground text-xs">
                    2
                  </div>
                  <span className="font-medium">Add your domain</span>
                </div>
                <CLICommand command="npx @wraps.dev/cli email domains add -d yourdomain.com" />
              </li>
              <li>
                <div className="mb-2 flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary font-medium text-primary-foreground text-xs">
                    3
                  </div>
                  <span className="font-medium">Install the SDK</span>
                </div>
                <CLICommand command="npm install @wraps.dev/email" />
              </li>
              <li>
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary font-medium text-primary-foreground text-xs">
                    4
                  </div>
                  <span className="font-medium">Update your send calls</span>
                </div>
                <p className="mt-1 pl-8 text-muted-foreground text-sm">
                  Swap your existing import and client initialization with the
                  Wraps SDK as shown in the examples above.
                </p>
              </li>
              <li>
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary font-medium text-primary-foreground text-xs">
                    5
                  </div>
                  <span className="font-medium">
                    Verify DNS (DKIM, SPF, DMARC)
                  </span>
                </div>
                <p className="mt-1 pl-8 text-muted-foreground text-sm">
                  Configure your DNS records for email authentication. See the{" "}
                  <a
                    className="font-medium text-primary underline"
                    href="/docs/guides/domain-verification"
                  >
                    domain verification guide
                  </a>{" "}
                  for details.
                </p>
              </li>
              <li>
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary font-medium text-primary-foreground text-xs">
                    6
                  </div>
                  <span className="font-medium">Test and cutover</span>
                </div>
                <p className="mt-1 pl-8 text-muted-foreground text-sm">
                  Send a test email, verify delivery, then switch your
                  production traffic to Wraps.
                </p>
              </li>
            </ol>
          </CardContent>
        </Card>
      </section>

      {/* Cost Comparison */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">Cost Comparison</h2>
        <p className="mb-4 text-muted-foreground">
          Monthly cost by email volume. Wraps uses AWS SES pricing at $0.10 per
          1,000 emails with no markup.
        </p>
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="p-4 text-left font-medium">
                      Monthly Volume
                    </th>
                    <th className="p-4 text-left font-medium">SendGrid</th>
                    <th className="p-4 text-left font-medium">Postmark</th>
                    <th className="p-4 text-left font-medium">Resend</th>
                    <th className="p-4 text-left font-medium text-primary">
                      Wraps
                    </th>
                  </tr>
                </thead>
                <tbody className="text-muted-foreground">
                  <tr className="border-b">
                    <td className="p-4 font-medium text-foreground">10,000</td>
                    <td className="p-4">$19.95</td>
                    <td className="p-4">$15</td>
                    <td className="p-4">$20</td>
                    <td className="p-4 font-medium text-primary">$1</td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-4 font-medium text-foreground">50,000</td>
                    <td className="p-4">$19.95</td>
                    <td className="p-4">$50</td>
                    <td className="p-4">$20</td>
                    <td className="p-4 font-medium text-primary">$5</td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-4 font-medium text-foreground">100,000</td>
                    <td className="p-4">$34.95</td>
                    <td className="p-4">$100</td>
                    <td className="p-4">$80</td>
                    <td className="p-4 font-medium text-primary">$10</td>
                  </tr>
                  <tr>
                    <td className="p-4 font-medium text-foreground">500,000</td>
                    <td className="p-4">$249.95</td>
                    <td className="p-4">$500</td>
                    <td className="p-4">$380</td>
                    <td className="p-4 font-medium text-primary">$50</td>
                  </tr>
                </tbody>
              </table>
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
              <CardTitle className="text-lg">Email Quickstart</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-muted-foreground text-sm">
                Follow the step-by-step quickstart to deploy infrastructure and
                send your first email.
              </p>
              <Button asChild variant="outline">
                <Link href="/docs/quickstart/email">
                  Get Started
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="transition-colors hover:border-primary/50">
            <CardHeader>
              <CardTitle className="text-lg">Domain Verification</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-muted-foreground text-sm">
                Set up DKIM, SPF, and DMARC to ensure reliable email delivery
                from your domain.
              </p>
              <Button asChild variant="outline">
                <Link href="/docs/guides/domain-verification">
                  Verify Domain
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
