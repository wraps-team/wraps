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
  ChevronDown,
  ChevronRight,
  Database,
  Globe,
  Layers,
  Lock,
  Mail,
  Server,
  Shield,
  Tag,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
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

const architectureDiagram = `# Email Event Processing Pipeline
#
# SES --> EventBridge --> SQS + DLQ --> Lambda --> DynamoDB
#
# 1. SES sends email and emits event notifications
# 2. EventBridge captures configured event types
# 3. SQS buffers events with dead-letter queue for failures
# 4. Lambda processes events and writes to DynamoDB
# 5. DynamoDB stores email history with configurable TTL`;

const baseIamPolicy = `{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "SESSendPermissions",
      "Effect": "Allow",
      "Action": [
        "ses:SendEmail",
        "ses:SendRawEmail",
        "ses:SendTemplatedEmail",
        "ses:SendBulkTemplatedEmail"
      ],
      "Resource": "*"
    },
    {
      "Sid": "SESMetricsPermissions",
      "Effect": "Allow",
      "Action": [
        "ses:GetSendStatistics",
        "ses:GetAccount"
      ],
      "Resource": "*"
    },
    {
      "Sid": "CloudWatchReadPermissions",
      "Effect": "Allow",
      "Action": [
        "cloudwatch:GetMetricData",
        "cloudwatch:GetMetricStatistics"
      ],
      "Resource": "*"
    }
  ]
}`;

const productionIamAdditions = `{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "EventBridgePermissions",
      "Effect": "Allow",
      "Action": [
        "events:PutRule",
        "events:PutTargets",
        "events:DescribeRule"
      ],
      "Resource": "arn:aws:events:*:*:rule/wraps-email-*"
    },
    {
      "Sid": "SQSPermissions",
      "Effect": "Allow",
      "Action": [
        "sqs:SendMessage",
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sqs:GetQueueAttributes"
      ],
      "Resource": "arn:aws:sqs:*:*:wraps-email-*"
    },
    {
      "Sid": "DynamoDBPermissions",
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem",
        "dynamodb:GetItem",
        "dynamodb:Query",
        "dynamodb:Scan"
      ],
      "Resource": "arn:aws:dynamodb:*:*:table/wraps-email-*"
    },
    {
      "Sid": "LambdaPermissions",
      "Effect": "Allow",
      "Action": [
        "lambda:InvokeFunction"
      ],
      "Resource": "arn:aws:lambda:*:*:function:wraps-email-*"
    }
  ]
}`;

function ExpandableSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="rounded-lg border">
      <button
        className="flex w-full items-center justify-between p-4 text-left font-medium"
        onClick={() => setIsOpen(!isOpen)}
        type="button"
      >
        {title}
        {isOpen ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
      </button>
      {isOpen && <div className="border-t px-4 pb-4 pt-2">{children}</div>}
    </div>
  );
}

export default function InfrastructureEmailPageContent() {
  return (
    <DocsLayout>
      {/* Page Header */}
      <div className="mb-12">
        <Badge className="mb-4" variant="outline">
          Infrastructure / Email
        </Badge>
        <h1 className="mb-4 font-bold text-4xl tracking-tight">
          What Gets Deployed: Email
        </h1>
        <p className="text-lg text-muted-foreground">
          Every AWS resource Wraps creates when you run{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">
            wraps email init
          </code>
          , organized by configuration preset.
        </p>
      </div>

      {/* Architecture Overview */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <Layers className="h-6 w-6 text-primary" />
          Architecture Overview
        </h2>
        <p className="mb-4 text-muted-foreground">
          Wraps deploys a serverless event processing pipeline to your AWS
          account. The architecture scales automatically and you only pay for
          what you use.
        </p>
        <CodeBlock
          className="h-auto"
          data={[
            {
              language: "bash",
              filename: "architecture.txt",
              code: architectureDiagram,
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

      {/* Core Resources */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <Shield className="h-6 w-6 text-primary" />
          Core Resources (All Presets)
        </h2>
        <p className="mb-6 text-muted-foreground">
          These resources are created regardless of which preset you choose.
          They form the foundation of your email infrastructure.
        </p>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Lock className="h-5 w-5 text-primary" />
                IAM Role
                <code className="rounded bg-muted px-2 py-0.5 font-mono text-sm">
                  wraps-email-role
                </code>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-2 pl-5 text-muted-foreground text-sm">
                <li>
                  OIDC trust policy for Vercel (or IAM trust for AWS-native
                  providers)
                </li>
                <li>
                  Base SES permissions:{" "}
                  <code className="rounded bg-muted px-1 py-0.5">
                    ses:SendEmail
                  </code>
                  ,{" "}
                  <code className="rounded bg-muted px-1 py-0.5">
                    ses:SendRawEmail
                  </code>
                  ,{" "}
                  <code className="rounded bg-muted px-1 py-0.5">
                    ses:SendTemplatedEmail
                  </code>
                  ,{" "}
                  <code className="rounded bg-muted px-1 py-0.5">
                    ses:SendBulkTemplatedEmail
                  </code>
                </li>
                <li>
                  Metrics access:{" "}
                  <code className="rounded bg-muted px-1 py-0.5">
                    ses:GetSendStatistics
                  </code>
                  ,{" "}
                  <code className="rounded bg-muted px-1 py-0.5">
                    ses:GetAccount
                  </code>
                </li>
                <li>CloudWatch read access for monitoring</li>
                <li>
                  Unique external ID generated per deployment for security
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Mail className="h-5 w-5 text-primary" />
                SES Configuration Set
                <code className="rounded bg-muted px-2 py-0.5 font-mono text-sm">
                  wraps-email-tracking
                </code>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-2 pl-5 text-muted-foreground text-sm">
                <li>Engagement tracking (open and click tracking)</li>
                <li>Suppression list for bounces and complaints</li>
                <li>
                  Event destinations configured based on preset (EventBridge for
                  Production+)
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Globe className="h-5 w-5 text-primary" />
                SES Email Identity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-2 pl-5 text-muted-foreground text-sm">
                <li>Domain identity with DKIM signing (RSA 2048-bit)</li>
                <li>3 CNAME records generated for DKIM verification</li>
                <li>Auto-verification when DNS records are configured</li>
                <li>SPF and DMARC record guidance provided after deployment</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Starter Preset */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <Zap className="h-6 w-6 text-primary" />
          Starter Preset
          <Badge variant="secondary">~$0.05/mo</Badge>
        </h2>
        <p className="mb-4 text-muted-foreground">
          The Starter preset deploys only the core resources listed above. It
          provides the essentials for sending emails with basic tracking.
        </p>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Included Features</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-2 pl-5 text-muted-foreground text-sm">
              <li>Open and click tracking via SES configuration set</li>
              <li>Automatic bounce and complaint suppression</li>
              <li>Domain verification with DKIM</li>
              <li>Send statistics and account metrics</li>
            </ul>
          </CardContent>
        </Card>

        <div className="mt-4 rounded-lg border-primary border-l-4 bg-primary/10 p-4">
          <p className="font-medium text-sm">Best for</p>
          <p className="mt-1 text-muted-foreground text-sm">
            MVPs, side projects, and low-volume senders who need reliable email
            delivery without event history or real-time analytics.
          </p>
        </div>
      </section>

      {/* Production Preset */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <Server className="h-6 w-6 text-primary" />
          Production Preset
          <Badge variant="secondary">~$2-5/mo</Badge>
        </h2>
        <p className="mb-4 text-muted-foreground">
          The Production preset includes everything in Starter plus a full event
          processing pipeline for real-time tracking and email history.
        </p>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Zap className="h-5 w-5 text-primary" />
                EventBridge Rule
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-2 pl-5 text-muted-foreground text-sm">
                <li>
                  Captures 6 SES event types: SEND, DELIVERY, OPEN, CLICK,
                  BOUNCE, COMPLAINT
                </li>
                <li>Routes events to SQS for buffered processing</li>
                <li>Managed rule with automatic scaling</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Layers className="h-5 w-5 text-primary" />
                SQS Queue + Dead Letter Queue
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div>
                  <p className="mb-1 font-medium text-sm">
                    Main Queue:{" "}
                    <code className="rounded bg-muted px-1 py-0.5 font-mono">
                      wraps-email-events
                    </code>
                  </p>
                  <ul className="list-disc space-y-1 pl-5 text-muted-foreground text-sm">
                    <li>Buffers events between EventBridge and Lambda</li>
                    <li>3 retry attempts before sending to DLQ</li>
                  </ul>
                </div>
                <div>
                  <p className="mb-1 font-medium text-sm">
                    Dead Letter Queue:{" "}
                    <code className="rounded bg-muted px-1 py-0.5 font-mono">
                      wraps-email-events-dlq
                    </code>
                  </p>
                  <ul className="list-disc space-y-1 pl-5 text-muted-foreground text-sm">
                    <li>Captures failed messages for inspection</li>
                    <li>14-day message retention</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Server className="h-5 w-5 text-primary" />
                Lambda Function
                <code className="rounded bg-muted px-2 py-0.5 font-mono text-sm">
                  wraps-email-processor
                </code>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-2 pl-5 text-muted-foreground text-sm">
                <li>Runtime: Node.js 20</li>
                <li>Memory: 128 MB</li>
                <li>Timeout: 30 seconds</li>
                <li>Triggered by SQS, writes processed events to DynamoDB</li>
                <li>Bundled with esbuild during deployment</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Database className="h-5 w-5 text-primary" />
                DynamoDB Table
                <code className="rounded bg-muted px-2 py-0.5 font-mono text-sm">
                  wraps-email-history
                </code>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-2 pl-5 text-muted-foreground text-sm">
                <li>
                  Partition key:{" "}
                  <code className="rounded bg-muted px-1 py-0.5">
                    messageId
                  </code>
                </li>
                <li>
                  Sort key:{" "}
                  <code className="rounded bg-muted px-1 py-0.5">
                    timestamp
                  </code>
                </li>
                <li>TTL: 90-day automatic expiration</li>
                <li>Billing: On-demand (pay per request)</li>
                <li>
                  Stores delivery status, opens, clicks, bounces, and complaints
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>

        <div className="mt-4 rounded-lg border-primary border-l-4 bg-primary/10 p-4">
          <p className="font-medium text-sm">
            Recommended for most applications
          </p>
          <p className="mt-1 text-muted-foreground text-sm">
            The Production preset gives you full visibility into email delivery
            with real-time event tracking, a 90-day email history, and
            reputation metrics through the dashboard.
          </p>
        </div>
      </section>

      {/* Enterprise Preset */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <Shield className="h-6 w-6 text-primary" />
          Enterprise Preset
          <Badge variant="secondary">~$50-100/mo</Badge>
        </h2>
        <p className="mb-4 text-muted-foreground">
          The Enterprise preset includes everything in Production plus extended
          history retention and full event type coverage.
        </p>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Extended History</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-2 pl-5 text-muted-foreground text-sm">
                <li>365-day TTL on DynamoDB (vs 90 days in Production)</li>
                <li>Full year of email delivery history</li>
                <li>Useful for compliance and audit requirements</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">All 10 SES Event Types</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-muted-foreground text-sm">
                Production tracks 6 event types. Enterprise adds 4 more:
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded bg-muted/50 p-2 text-sm">SEND</div>
                <div className="rounded bg-muted/50 p-2 text-sm">DELIVERY</div>
                <div className="rounded bg-muted/50 p-2 text-sm">OPEN</div>
                <div className="rounded bg-muted/50 p-2 text-sm">CLICK</div>
                <div className="rounded bg-muted/50 p-2 text-sm">BOUNCE</div>
                <div className="rounded bg-muted/50 p-2 text-sm">COMPLAINT</div>
                <div className="rounded border border-primary/30 bg-primary/5 p-2 text-sm">
                  REJECT
                </div>
                <div className="rounded border border-primary/30 bg-primary/5 p-2 text-sm">
                  RENDERING_FAILURE
                </div>
                <div className="rounded border border-primary/30 bg-primary/5 p-2 text-sm">
                  DELIVERY_DELAY
                </div>
                <div className="rounded border border-primary/30 bg-primary/5 p-2 text-sm">
                  SUBSCRIPTION
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Cost Breakdown Table */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <Database className="h-6 w-6 text-primary" />
          Cost Breakdown
        </h2>
        <p className="mb-4 text-muted-foreground">
          Estimated monthly costs by email volume. All costs are billed directly
          by AWS to your account.
        </p>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-4 text-left font-medium">Volume</th>
                    <th className="p-4 text-left font-medium">Starter</th>
                    <th className="p-4 text-left font-medium">Production</th>
                    <th className="p-4 text-left font-medium">Enterprise</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="p-4 font-medium">1K/mo</td>
                    <td className="p-4 text-muted-foreground">~$0.15</td>
                    <td className="p-4 text-muted-foreground">~$2.15</td>
                    <td className="p-4 text-muted-foreground">~$52</td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-4 font-medium">10K/mo</td>
                    <td className="p-4 text-muted-foreground">~$1.05</td>
                    <td className="p-4 text-muted-foreground">~$3.05</td>
                    <td className="p-4 text-muted-foreground">~$53</td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-4 font-medium">100K/mo</td>
                    <td className="p-4 text-muted-foreground">~$10.05</td>
                    <td className="p-4 text-muted-foreground">~$14</td>
                    <td className="p-4 text-muted-foreground">~$64</td>
                  </tr>
                  <tr>
                    <td className="p-4 font-medium">1M/mo</td>
                    <td className="p-4 text-muted-foreground">~$100</td>
                    <td className="p-4 text-muted-foreground">~$110</td>
                    <td className="p-4 text-muted-foreground">~$175</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <div className="mt-4 rounded-lg border-primary border-l-4 bg-primary/10 p-4">
          <p className="font-medium text-sm">AWS SES pricing</p>
          <p className="mt-1 text-muted-foreground text-sm">
            SES charges $0.10 per 1,000 emails sent. Infrastructure costs
            (DynamoDB, Lambda, SQS) are additional but minimal at most volumes.
          </p>
        </div>
      </section>

      {/* Resource Tags */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <Tag className="h-6 w-6 text-primary" />
          Resource Tags
        </h2>
        <p className="mb-4 text-muted-foreground">
          All resources created by Wraps are tagged for easy identification and
          cost tracking in the AWS Console.
        </p>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-4 text-left font-medium">Tag Key</th>
                    <th className="p-4 text-left font-medium">Tag Value</th>
                    <th className="p-4 text-left font-medium">Description</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="p-4">
                      <code className="rounded bg-muted px-1 py-0.5">
                        ManagedBy
                      </code>
                    </td>
                    <td className="p-4">
                      <code className="rounded bg-muted px-1 py-0.5">
                        wraps-cli
                      </code>
                    </td>
                    <td className="p-4 text-muted-foreground">
                      Identifies resources managed by Wraps
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <p className="mt-4 text-muted-foreground text-sm">
          You can filter resources in the AWS Console by this tag to see
          everything Wraps has deployed. This makes it easy to audit, track
          costs, and manage your infrastructure.
        </p>
      </section>

      {/* IAM Policy Details */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <Lock className="h-6 w-6 text-primary" />
          IAM Policy Details
        </h2>
        <p className="mb-4 text-muted-foreground">
          Wraps follows the principle of least privilege. Each preset grants
          only the permissions required for its features.
        </p>

        <div className="space-y-4">
          <ExpandableSection title="Base IAM Policy (All Presets)">
            <p className="mb-3 text-muted-foreground text-sm">
              Permissions for sending emails and reading metrics. Applied to all
              presets including Starter.
            </p>
            <CodeBlock
              className="h-auto"
              data={[
                {
                  language: "json",
                  filename: "base-policy.json",
                  code: baseIamPolicy,
                },
              ]}
              defaultValue="json"
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
          </ExpandableSection>

          <ExpandableSection title="Additional Permissions (Production & Enterprise)">
            <p className="mb-3 text-muted-foreground text-sm">
              Additional permissions for event processing, history storage, and
              Lambda execution. Added on top of the base policy.
            </p>
            <CodeBlock
              className="h-auto"
              data={[
                {
                  language: "json",
                  filename: "production-additions.json",
                  code: productionIamAdditions,
                },
              ]}
              defaultValue="json"
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
          </ExpandableSection>
        </div>
      </section>

      {/* Next Steps */}
      <section className="mb-12">
        <h2 className="mb-6 font-bold text-2xl">Next Steps</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="transition-colors hover:border-primary/50">
            <CardHeader>
              <CardTitle className="text-lg">CLI Reference</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-muted-foreground text-sm">
                All available email CLI commands and options.
              </p>
              <Button asChild variant="outline">
                <Link href="/docs/cli-reference/email">
                  View CLI Docs
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="transition-colors hover:border-primary/50">
            <CardHeader>
              <CardTitle className="text-lg">Email SDK</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-muted-foreground text-sm">
                Send emails with the TypeScript SDK after deploying.
              </p>
              <Button asChild variant="outline">
                <Link href="/docs/sdk-reference">
                  View SDK Docs
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="transition-colors hover:border-primary/50">
            <CardHeader>
              <CardTitle className="text-lg">Configuration Presets</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-muted-foreground text-sm">
                Compare presets and customize your configuration.
              </p>
              <Button asChild variant="outline">
                <Link href="/docs/guides/configuration-presets">
                  View Guide
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="transition-colors hover:border-primary/50">
            <CardHeader>
              <CardTitle className="text-lg">Infrastructure as Code</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-muted-foreground text-sm">
                Deploy email infrastructure with{" "}
                <Link
                  className="text-primary underline"
                  href="/docs/cdk-reference"
                >
                  CDK
                </Link>{" "}
                or{" "}
                <Link
                  className="text-primary underline"
                  href="/docs/pulumi-reference"
                >
                  Pulumi
                </Link>{" "}
                instead of the CLI.
              </p>
              <Button asChild variant="outline">
                <Link href="/docs/cdk-reference">
                  View CDK Docs
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
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
            If you run into any issues, check our GitHub discussions or open an
            issue.
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
    </DocsLayout>
  );
}
