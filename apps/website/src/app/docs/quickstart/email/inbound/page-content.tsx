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
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Inbox,
  Mail,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { AgentQuickstartPrompt } from "@/components/docs/agent-quickstart-prompt";
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
import {
  Snippet,
  SnippetCopyButton,
  SnippetHeader,
  SnippetTabsContent,
  SnippetTabsList,
  SnippetTabsTrigger,
} from "@/components/ui/shadcn-io/snippet";

const agentPrompt = `Set up Wraps inbound email so I can receive, list, and reply to emails.

1. Verify AWS credentials with: aws sts get-caller-identity — help me configure them if that fails.
2. A deployed Wraps email stack is required. If missing, run npx @wraps.dev/cli email init first (confirm the estimated cost with me before deploying).
3. Run: npx @wraps.dev/cli email inbound init
   If it prompts for a webhook URL, ask me whether I want webhook delivery and for the URL.
4. Show me the MX/DNS records to add and wait for me to confirm they're in place.
5. Install the SDK (npm install @wraps.dev/email) and write a small script that lists inbound emails via the inbox API.
6. Have me send a test email to my inbound address, confirm it shows up, and show me how to reply and forward with proper threading.

Full Wraps docs (agent-readable): https://wraps.dev/llms-full.txt`;

const installCommands = {
  npm: "npm install @wraps.dev/email",
  pnpm: "pnpm add @wraps.dev/email",
  yarn: "yarn add @wraps.dev/email",
  bun: "bun add @wraps.dev/email",
};

const listInboundCode = `import { WrapsEmail } from '@wraps.dev/email';

const email = new WrapsEmail({
  inboxBucketName: 'your-inbound-bucket-name',
});

// List recent inbound emails
const { emails, nextToken } = await email.inbox.list({
  maxResults: 20,
});

for (const summary of emails) {
  console.log(\`From: \${summary.emailId}\`);
  console.log(\`Key: \${summary.key}\`);
  console.log(\`Received: \${summary.lastModified}\`);
}`;

const getEmailCode = `// Get full email details
const inboundEmail = await email.inbox.get('email-abc123');

console.log('From:', inboundEmail.from.address);
console.log('Subject:', inboundEmail.subject);
console.log('Body:', inboundEmail.html || inboundEmail.text);

// Check attachments
if (inboundEmail.attachments.length > 0) {
  for (const att of inboundEmail.attachments) {
    console.log(\`Attachment: \${att.filename} (\${att.size} bytes)\`);
  }
}

// Check spam/virus verdicts
console.log('Spam:', inboundEmail.spamVerdict);
console.log('Virus:', inboundEmail.virusVerdict);`;

const replyCode = `// Reply to an inbound email with proper threading
const result = await email.inbox.reply('email-abc123', {
  from: 'support@yourdomain.com',
  text: 'Thanks for reaching out! We will get back to you shortly.',
  html: '<p>Thanks for reaching out! We will get back to you shortly.</p>',
});

console.log('Reply sent:', result.messageId);`;

const forwardCode = `// Forward an inbound email to another recipient
const result = await email.inbox.forward('email-abc123', {
  from: 'noreply@yourdomain.com',
  to: 'team@yourdomain.com',
  addPrefix: '[Customer Email]',
});

console.log('Forwarded:', result.messageId);`;

const eventBridgeEventCode = `// EventBridge event payload (email.received)
{
  "source": "wraps.inbound",
  "detail-type": "email.received",
  "detail": {
    "emailId": "abc123...",
    "messageId": "<message-id@mail.example.com>",
    "from": { "name": "John Doe", "address": "john@example.com" },
    "to": [{ "name": "", "address": "support@yourdomain.com" }],
    "subject": "Help with my order",
    "html": "<p>Email body...</p>",
    "text": "Email body...",
    "receivedAt": 1706745600000,
    "spamVerdict": "PASS",
    "virusVerdict": "PASS",
    "attachments": [
      { "id": "att-1", "filename": "screenshot.png", "size": 12345 }
    ],
    "replyToken": {
      "conversationId": "aGVsbG8gd29y",
      "sendId": "MDEyMzQ1Njc",
      "status": "valid"
    },
    "autoReply": false
  }
}`;

const eventBridgeRuleCode = `// Example: Lambda handler for email.received events
export async function handler(event: EventBridgeEvent) {
  const email = event.detail;

  console.log('New email from:', email.from.address);
  console.log('Subject:', email.subject);

  // Route to appropriate handler based on recipient
  if (email.to.some(r => r.address.includes('support@'))) {
    await createSupportTicket(email);
  } else if (email.to.some(r => r.address.includes('orders@'))) {
    await processOrderEmail(email);
  }
}`;

export default function InboundEmailQuickstartPageContent() {
  return (
    <DocsLayout>
      {/* Breadcrumb */}
      <div className="mb-6">
        <Button asChild className="gap-2" size="sm" variant="ghost">
          <Link href="/docs/quickstart/email">
            <ArrowLeft className="h-4 w-4" />
            Email Quickstart
          </Link>
        </Button>
      </div>

      {/* Page Header */}
      <div className="mb-12">
        <Badge className="mb-4" variant="outline">
          Inbound Email Quickstart
        </Badge>
        <h1 className="mb-4 font-bold text-4xl tracking-tight">
          Receive Emails with Wraps
        </h1>
        <p className="text-lg text-muted-foreground">
          Set up inbound email receiving in your AWS account. Parse incoming
          emails, extract attachments, reply with proper threading, and forward
          to your team.
        </p>
      </div>

      <AgentQuickstartPrompt prompt={agentPrompt} />

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
            <li>
              Email infrastructure deployed (
              <a className="underline" href="/docs/quickstart/email">
                Email Quickstart
              </a>
              )
            </li>
            <li>A verified domain in AWS SES</li>
            <li>AWS CLI installed with valid credentials</li>
          </ul>
        </CardContent>
      </Card>

      {/* Step 1: Deploy Inbound Infrastructure */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            1
          </div>
          Deploy Inbound Infrastructure
        </h2>
        <p className="mb-4 text-muted-foreground">
          Run the Wraps CLI to deploy inbound email infrastructure:
        </p>
        <CodeBlock
          className="h-auto"
          data={[
            {
              language: "bash",
              filename: "terminal.sh",
              code: "npx @wraps.dev/cli email inbound init",
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
        <div className="mt-4 rounded-lg border-primary border-l-4 bg-primary/10 p-4">
          <p className="font-medium text-sm">What gets deployed?</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground text-sm">
            <li>S3 bucket for storing incoming emails</li>
            <li>SES receipt rule set with active rule</li>
            <li>Lambda function to parse and process emails</li>
            <li>EventBridge for real-time email.received events</li>
            <li>MX records configuration for your domain</li>
          </ul>
        </div>
      </section>

      {/* Step 2: Configure DNS */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            2
          </div>
          Configure DNS (MX Record)
        </h2>
        <p className="mb-4 text-muted-foreground">
          Add an MX record to your domain to route incoming emails to AWS SES.
          The CLI will display the exact record to add:
        </p>
        <CodeBlock
          className="h-auto"
          data={[
            {
              language: "text",
              filename: "DNS Record",
              code: `Type: MX
Name: @ (or your subdomain, e.g., inbound)
Value: 10 inbound-smtp.us-east-1.amazonaws.com
TTL: 300`,
            },
          ]}
          defaultValue="text"
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
        <div className="mt-4 rounded-lg border-warning border-l-4 bg-warning/10 p-4">
          <p className="font-medium text-warning text-sm dark:text-warning">
            Region-specific endpoint
          </p>
          <p className="mt-1 text-muted-foreground text-sm">
            The MX record endpoint varies by region. Use{" "}
            <code className="rounded bg-muted px-1.5 py-0.5">
              inbound-smtp.{"{region}"}.amazonaws.com
            </code>{" "}
            where region is your SES region (e.g., us-east-1, eu-west-1).
          </p>
        </div>
      </section>

      {/* Step 3: Install SDK */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            3
          </div>
          Install the SDK
        </h2>
        <p className="mb-4 text-muted-foreground">
          Install the{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">
            @wraps.dev/email
          </code>{" "}
          package (v0.6.0+):
        </p>
        <Snippet defaultValue="npm">
          <SnippetHeader>
            <SnippetTabsList>
              <SnippetTabsTrigger value="npm">npm</SnippetTabsTrigger>
              <SnippetTabsTrigger value="pnpm">pnpm</SnippetTabsTrigger>
              <SnippetTabsTrigger value="yarn">yarn</SnippetTabsTrigger>
              <SnippetTabsTrigger value="bun">bun</SnippetTabsTrigger>
            </SnippetTabsList>
            <SnippetCopyButton value={installCommands.npm} />
          </SnippetHeader>
          {Object.entries(installCommands).map(([key, command]) => (
            <SnippetTabsContent key={key} value={key}>
              {command}
            </SnippetTabsContent>
          ))}
        </Snippet>
      </section>

      {/* Step 4: List Inbound Emails */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            4
          </div>
          Read Inbound Emails
        </h2>
        <p className="mb-4 text-muted-foreground">
          Use the SDK to list and read incoming emails:
        </p>
        <CodeBlock
          className="mb-4 h-auto"
          data={[
            {
              language: "typescript",
              filename: "list-emails.ts",
              code: listInboundCode,
            },
          ]}
          defaultValue="typescript"
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

        <p className="mb-4 text-muted-foreground">
          Get full details for a specific email:
        </p>
        <CodeBlock
          className="h-auto"
          data={[
            {
              language: "typescript",
              filename: "get-email.ts",
              code: getEmailCode,
            },
          ]}
          defaultValue="typescript"
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

      {/* Step 5: Reply and Forward */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            5
          </div>
          Reply and Forward Emails
        </h2>
        <p className="mb-4 text-muted-foreground">
          Reply to inbound emails with proper threading (In-Reply-To and
          References headers):
        </p>
        <CodeBlock
          className="mb-4 h-auto"
          data={[
            {
              language: "typescript",
              filename: "reply.ts",
              code: replyCode,
            },
          ]}
          defaultValue="typescript"
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

        <p className="mb-4 text-muted-foreground">
          Forward emails to another address:
        </p>
        <CodeBlock
          className="h-auto"
          data={[
            {
              language: "typescript",
              filename: "forward.ts",
              code: forwardCode,
            },
          ]}
          defaultValue="typescript"
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

      {/* Step 6: View in Dashboard */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            6
          </div>
          View in Dashboard
        </h2>
        <p className="mb-4 text-muted-foreground">
          Run the dashboard to view inbound emails in a web interface:
        </p>
        <CodeBlock
          className="mb-4 h-auto"
          data={[
            {
              language: "bash",
              filename: "terminal.sh",
              code: "npx @wraps.dev/cli dashboard",
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
        <p className="text-muted-foreground text-sm">
          Navigate to the <strong>Receiving</strong> tab to see all inbound
          emails with sender, subject, attachments, and spam/virus verdicts.
        </p>
      </section>

      {/* Step 7: EventBridge Events */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            7
          </div>
          Listen to EventBridge Events
        </h2>
        <p className="mb-4 text-muted-foreground">
          Every inbound email triggers an EventBridge event that you can use to
          build automated workflows, notifications, or integrations.
        </p>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              Event Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid gap-2 text-sm">
              <div className="flex gap-2">
                <span className="font-medium">Source:</span>
                <code className="rounded bg-muted px-1.5 py-0.5">
                  wraps.inbound
                </code>
              </div>
              <div className="flex gap-2">
                <span className="font-medium">Detail Type:</span>
                <code className="rounded bg-muted px-1.5 py-0.5">
                  email.received
                </code>
              </div>
              <div className="flex gap-2">
                <span className="font-medium">Detail:</span>
                <span className="text-muted-foreground">
                  Full parsed email with headers, body, attachments, and
                  spam/virus verdicts
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <p className="mb-2 font-medium text-sm">Event Payload Example</p>
        <CodeBlock
          className="mb-4 h-auto"
          data={[
            {
              language: "json",
              filename: "event.json",
              code: eventBridgeEventCode,
            },
          ]}
          defaultValue="json"
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

        <p className="mb-4 text-muted-foreground text-sm">
          Filter{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">
            event.detail.replyToken?.status === "valid"
          </code>{" "}
          to thread replies. See the{" "}
          <Link
            className="font-medium text-primary underline"
            href="/docs/guides/reply-threading"
          >
            reply-threading guide
          </Link>
          .
        </p>

        <p className="mb-4 text-muted-foreground text-sm">
          Very large emails are trimmed to fit the EventBridge size limit: the
          event then has{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">
            truncated: true
          </code>
          , drops <code className="rounded bg-muted px-1.5 py-0.5">html</code>,{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">text</code>,{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">headers</code> or{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">attachments</code>{" "}
          (listed in{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">
            truncatedFields
          </code>
          ), and gives the full parsed email's S3 key in{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">parsedS3Key</code>.
          Sender, recipients, subject and verdicts are kept unless they alone
          are too large; then{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">to</code>/
          <code className="rounded bg-muted px-1.5 py-0.5">cc</code> are
          replaced by counts and the subject is cut, and as a last resort only{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">emailId</code>,{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">rawS3Key</code>,{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">parsedS3Key</code>,{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">receivedAt</code>,{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">replyToken</code> and{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">autoReply</code> are
          sent.
        </p>

        <p className="mb-2 font-medium text-sm">Example Lambda Handler</p>
        <CodeBlock
          className="h-auto"
          data={[
            {
              language: "typescript",
              filename: "handler.ts",
              code: eventBridgeRuleCode,
            },
          ]}
          defaultValue="typescript"
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

        <div className="mt-4 rounded-lg border-primary border-l-4 bg-primary/10 p-4">
          <p className="font-medium text-sm">Common Use Cases</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground text-sm">
            <li>Create support tickets from customer emails</li>
            <li>Send Slack/Teams notifications for new emails</li>
            <li>Auto-respond to specific email patterns</li>
            <li>Route emails to different teams based on recipient</li>
            <li>Trigger workflows for order confirmations or invoices</li>
          </ul>
        </div>
      </section>

      {/* Next Steps */}
      <section className="mb-12">
        <h2 className="mb-6 font-bold text-2xl">Next Steps</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="transition-colors hover:border-primary/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Mail className="h-5 w-5 text-primary" />
                Email SDK Reference
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-muted-foreground text-sm">
                Full API reference for inbox methods, attachments, and email
                parsing.
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
              <CardTitle className="flex items-center gap-2 text-lg">
                <Inbox className="h-5 w-5 text-primary" />
                CLI Commands
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-muted-foreground text-sm">
                Manage inbound infrastructure with CLI commands.
              </p>
              <Button asChild variant="outline">
                <Link href="/docs/cli-reference/email">
                  View CLI Docs
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
