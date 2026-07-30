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

export default function CLIReferenceSMSPageContent() {
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
          CLI Reference / SMS
        </Badge>
        <h1 className="mb-4 font-bold text-4xl tracking-tight">SMS Commands</h1>
        <p className="text-lg text-muted-foreground">
          Deploy AWS End User Messaging SMS infrastructure for transactional and
          marketing messages.
        </p>
        <div className="mt-4 rounded-lg border bg-muted/50 p-4">
          <p className="text-muted-foreground text-sm">
            <strong>Pricing:</strong> Free to use. You pay AWS directly for
            phone numbers ($1-2/mo) and per-message costs (~$0.0075/segment US).
            Registration fees apply for toll-free and 10DLC numbers.
          </p>
        </div>
      </div>

      {/* wraps sms init */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <Terminal className="h-6 w-6 text-primary" />
          wraps sms init
        </h2>
        <p className="mb-4 text-muted-foreground">
          Deploy SMS infrastructure to your AWS account. Sets up phone numbers,
          configuration sets, event tracking, and IAM roles.
        </p>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-lg">Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <CLICommand command="npx @wraps.dev/cli sms init [options]" />
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
                  -p, --provider &lt;provider&gt;
                </code>
                <p className="mt-2 text-muted-foreground text-sm">
                  Hosting provider: vercel, aws, railway, or other
                </p>
              </div>
              <div>
                <code className="rounded bg-muted px-2 py-1">
                  -r, --region &lt;region&gt;
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
                  Configuration preset: starter, production, or enterprise
                </p>
              </div>
              <div>
                <code className="rounded bg-muted px-2 py-1">-y, --yes</code>
                <p className="mt-2 text-muted-foreground text-sm">
                  Skip confirmation prompts
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-lg">Phone Number Types</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-2 pl-5 text-muted-foreground text-sm">
              <li>
                <strong>Simulator</strong> ($1/mo) - Testing only, 100 msg/day,
                no registration required
              </li>
              <li>
                <strong>Toll-free</strong> ($2/mo) - Production ready, 3 MPS,
                requires registration (~15 days)
              </li>
              <li>
                <strong>10DLC</strong> ($2/mo + fees) - High volume, up to 75
                MPS, requires brand + campaign registration
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">What It Does</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-2 pl-5 text-muted-foreground text-sm">
              <li>Creates an IAM role for your application</li>
              <li>
                Provisions a phone number (simulator, toll-free, or 10DLC based
                on selection)
              </li>
              <li>Sets up an opt-out list for compliance</li>
              <li>Configures event tracking via SNS + SQS</li>
              <li>
                Deploys Lambda function for event processing (if event tracking
                enabled)
              </li>
              <li>Creates DynamoDB table for message history (if enabled)</li>
              <li>Configures fraud protection</li>
            </ul>
          </CardContent>
        </Card>
      </section>

      {/* wraps sms status */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <Terminal className="h-6 w-6 text-primary" />
          wraps sms status
        </h2>
        <p className="mb-4 text-muted-foreground">
          Display the current status of your SMS infrastructure, including phone
          number, configuration, and enabled features.
        </p>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-lg">Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <CLICommand command="npx @wraps.dev/cli sms status [options]" />
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
                  Output status as JSON
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">What It Displays</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-2 pl-5 text-muted-foreground text-sm">
              <li>Phone numbers and type</li>
              <li>Opt-out list configuration</li>
              <li>Region and configuration preset</li>
              <li>Event tracking status</li>
              <li>All deployed resources</li>
            </ul>
          </CardContent>
        </Card>
      </section>

      {/* wraps sms test */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <Terminal className="h-6 w-6 text-primary" />
          wraps sms test
        </h2>
        <p className="mb-4 text-muted-foreground">
          Send a test SMS message to verify your setup is working. Supports AWS
          simulator numbers for sandbox testing.
        </p>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-lg">Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <CLICommand command="npx @wraps.dev/cli sms test [options]" />
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
                  --to &lt;phone&gt;
                </code>
                <p className="mt-2 text-muted-foreground text-sm">
                  Destination phone number in E.164 format (e.g., +14155551234)
                </p>
              </div>
              <div>
                <code className="rounded bg-muted px-2 py-1">
                  --message &lt;text&gt;
                </code>
                <p className="mt-2 text-muted-foreground text-sm">
                  Message content to send
                </p>
              </div>
              <div>
                <code className="rounded bg-muted px-2 py-1">--json</code>
                <p className="mt-2 text-muted-foreground text-sm">
                  Output result as JSON
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
              <li>Sends a test SMS to the specified number</li>
              <li>Shows delivery status and segment count</li>
              <li>Supports AWS simulator numbers for sandbox testing</li>
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
                Interactive mode (prompts for destination):
              </p>
              <CLICommand command="npx @wraps.dev/cli sms test" />
            </div>
            <div className="mt-4">
              <p className="mb-2 text-muted-foreground text-sm">
                Send to a specific number:
              </p>
              <CLICommand command='npx @wraps.dev/cli sms test --to +14155551234 --message "Hello from Wraps!"' />
            </div>
          </CardContent>
        </Card>
      </section>

      {/* wraps sms verify-number */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <Terminal className="h-6 w-6 text-primary" />
          wraps sms verify-number
        </h2>
        <p className="mb-4 text-muted-foreground">
          Verify a destination phone number for sandbox testing. In sandbox
          mode, numbers must be verified before they can receive test messages.
        </p>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-lg">Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <CLICommand command="npx @wraps.dev/cli sms verify-number [options]" />
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
                  --phone-number &lt;phone&gt;
                </code>
                <p className="mt-2 text-muted-foreground text-sm">
                  Phone number to verify in E.164 format
                </p>
              </div>
              <div>
                <code className="rounded bg-muted px-2 py-1">
                  --code &lt;code&gt;
                </code>
                <p className="mt-2 text-muted-foreground text-sm">
                  Verification code received via SMS
                </p>
              </div>
              <div>
                <code className="rounded bg-muted px-2 py-1">--resend</code>
                <p className="mt-2 text-muted-foreground text-sm">
                  Resend verification code to a pending number
                </p>
              </div>
              <div>
                <code className="rounded bg-muted px-2 py-1">--list</code>
                <p className="mt-2 text-muted-foreground text-sm">
                  List all verified destination numbers
                </p>
              </div>
              <div>
                <code className="rounded bg-muted px-2 py-1">--delete</code>
                <p className="mt-2 text-muted-foreground text-sm">
                  Remove a number from the verified list
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Examples</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="mb-2 text-muted-foreground text-sm">
                Start verification for a number:
              </p>
              <CLICommand command="npx @wraps.dev/cli sms verify-number --phone-number +14155551234" />
            </div>
            <div className="mt-4">
              <p className="mb-2 text-muted-foreground text-sm">
                Complete verification with code:
              </p>
              <CLICommand command="npx @wraps.dev/cli sms verify-number --phone-number +14155551234 --code 123456" />
            </div>
            <div className="mt-4">
              <p className="mb-2 text-muted-foreground text-sm">
                List verified numbers:
              </p>
              <CLICommand command="npx @wraps.dev/cli sms verify-number --list" />
            </div>
          </CardContent>
        </Card>
      </section>

      {/* wraps sms register */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <Terminal className="h-6 w-6 text-primary" />
          wraps sms register
        </h2>
        <p className="mb-4 text-muted-foreground">
          Submit a toll-free verification request to AWS for production sending.
          Required before toll-free numbers can send messages at scale.
        </p>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-lg">Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <CLICommand command="npx @wraps.dev/cli sms register [options]" />
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
                  AWS region where SMS is deployed
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Registration Requirements</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-2 pl-5 text-muted-foreground text-sm">
              <li>Business name and address</li>
              <li>Use case description (what messages you're sending)</li>
              <li>Sample messages (2-3 examples)</li>
              <li>How users opt-in to receive messages</li>
              <li>Expected monthly message volume</li>
            </ul>
            <p className="mt-4 text-muted-foreground text-sm">
              <strong>Timeline:</strong> Registration typically takes 1-15
              business days.
            </p>
          </CardContent>
        </Card>
      </section>

      {/* wraps sms upgrade */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <Terminal className="h-6 w-6 text-primary" />
          wraps sms upgrade
        </h2>
        <p className="mb-4 text-muted-foreground">
          Enhance your SMS infrastructure with additional features or upgrade to
          a higher-tier phone number.
        </p>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-lg">Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <CLICommand command="npx @wraps.dev/cli sms upgrade [options]" />
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
                  --preset &lt;name&gt;
                </code>
                <p className="mt-2 text-muted-foreground text-sm">
                  Target preset: starter, production, or enterprise
                </p>
              </div>
              <div>
                <code className="rounded bg-muted px-2 py-1">
                  -r, --region &lt;region&gt;
                </code>
                <p className="mt-2 text-muted-foreground text-sm">
                  AWS region where SMS is deployed
                </p>
              </div>
              <div>
                <code className="rounded bg-muted px-2 py-1">-y, --yes</code>
                <p className="mt-2 text-muted-foreground text-sm">
                  Skip confirmation prompts
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Upgrade Options</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-2 pl-5 text-muted-foreground text-sm">
              <li>Upgrade phone number type (simulator → toll-free → 10DLC)</li>
              <li>
                Change configuration preset (starter → production → enterprise)
              </li>
              <li>Enable/disable event tracking</li>
              <li>Change message history retention period</li>
              <li>Enable/disable link click tracking</li>
              <li>Enable/disable message archiving</li>
              <li>
                Configure fraud protection (country allowlist, AIT filtering)
              </li>
            </ul>
          </CardContent>
        </Card>
      </section>

      {/* wraps sms sync */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <Terminal className="h-6 w-6 text-primary" />
          wraps sms sync
        </h2>
        <p className="mb-4 text-muted-foreground">
          Synchronize your local configuration with deployed infrastructure.
          Useful after CLI updates or when resources need to be recreated.
        </p>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-lg">Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <CLICommand command="npx @wraps.dev/cli sms sync [options]" />
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
                  AWS region where SMS is deployed
                </p>
              </div>
              <div>
                <code className="rounded bg-muted px-2 py-1">-y, --yes</code>
                <p className="mt-2 text-muted-foreground text-sm">
                  Skip confirmation prompts
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
              <li>Updates Lambda function code with latest CLI version</li>
              <li>
                Recreates any missing SDK-managed resources (phone pool, event
                destination)
              </li>
              <li>Ensures fraud protection is configured</li>
              <li>Refreshes infrastructure state</li>
            </ul>
          </CardContent>
        </Card>
      </section>

      {/* wraps sms destroy */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <Terminal className="h-6 w-6 text-primary" />
          wraps sms destroy
        </h2>
        <p className="mb-4 text-muted-foreground">
          Remove all SMS infrastructure from your AWS account. This is a
          destructive operation.
        </p>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-lg">Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <CLICommand command="npx @wraps.dev/cli sms destroy [options]" />
          </CardContent>
        </Card>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-lg">Options</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <code className="rounded bg-muted px-2 py-1">-f, --force</code>
                <p className="mt-2 text-muted-foreground text-sm">
                  Skip confirmation prompt (use with caution)
                </p>
              </div>
              <div>
                <code className="rounded bg-muted px-2 py-1">--preview</code>
                <p className="mt-2 text-muted-foreground text-sm">
                  Preview what would be destroyed without making changes
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">What It Removes</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-2 pl-5 text-muted-foreground text-sm">
              <li>Phone number (released back to AWS pool)</li>
              <li>Configuration set and event destination</li>
              <li>SNS topic, SQS queue, and DLQ</li>
              <li>Lambda functions</li>
              <li>DynamoDB table (if event tracking was enabled)</li>
              <li>IAM role and policies</li>
              <li>Protect configuration</li>
              <li>Local metadata and Pulumi state</li>
            </ul>
          </CardContent>
        </Card>
      </section>

      {/* Programmatic Usage */}
      <section className="mb-12">
        <h2 className="mb-6 font-bold text-2xl">Programmatic Usage</h2>
        <p className="mb-4 text-muted-foreground">
          After deploying infrastructure with the CLI, use the SDK to send SMS
          messages from your application.
        </p>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              Example: Send SMS from Node.js
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CodeBlock
              className="h-auto"
              data={[
                {
                  language: "typescript",
                  filename: "send-sms.ts",
                  code: `import { WrapsSMS } from '@wraps.dev/sms';

const sms = new WrapsSMS();

// Send a transactional SMS
const result = await sms.send({
  to: '+14155551234',
  message: 'Your verification code is 123456',
});

console.log('SMS sent:', result.messageId);`,
                },
              ]}
              defaultValue="typescript"
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
                  <CodeBlockItem key={item.language} value={item.language}>
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

      {/* Navigation */}
      <div className="flex justify-between">
        <Button asChild variant="outline">
          <Link href="/docs/cli-reference/cdn">
            <ArrowLeft className="mr-2 h-4 w-4" />
            CDN Commands
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/docs/cli-reference">
            Back to CLI Reference
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </DocsLayout>
  );
}
