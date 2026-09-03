"use client";

import { Badge } from "@wraps/ui/components/ui/badge";
import { Button } from "@wraps/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock } from "lucide-react";
import Link from "next/link";
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

const webhookHandlerCode = `import crypto from "crypto";
import { type NextRequest, NextResponse } from "next/server";

const WEBHOOK_SECRET = process.env.WRAPS_WEBHOOK_SECRET!;

export async function POST(request: NextRequest) {
  // Verify the webhook signature
  const signature = request.headers.get("x-wraps-signature");
  if (
    !signature ||
    !crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(WEBHOOK_SECRET),
    )
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { event, detail, messageId } = await request.json();

  switch (event) {
    case "Bounce": {
      const { bounceType, bounceSubType, bouncedRecipients } = detail.bounce;

      // Permanent = hard bounce. Stop sending to this address, permanently.
      if (bounceType === "Permanent") {
        // These subtypes mean SES never attempted delivery — the address was
        // already suppressed. They do not count toward your bounce rate, and
        // they are not new information about the recipient.
        const alreadySuppressed =
          bounceSubType === "OnAccountSuppressionList" ||
          bounceSubType === "OnTenantSuppressionList";

        if (!alreadySuppressed) {
          for (const r of bouncedRecipients) {
            await db.contacts.update({
              where: { email: r.emailAddress },
              data: { bounced: true, bouncedAt: new Date() },
            });
          }
        }
      }

      // Transient = soft bounce. Do NOT suppress on the first one — a full
      // mailbox today is a deliverable address next week. Count them instead.
      if (bounceType === "Transient") {
        for (const r of bouncedRecipients) {
          await db.contacts.incrementSoftBounce(r.emailAddress);
        }
      }
      break;
    }

    case "Complaint": {
      // Someone hit "mark as spam". Unsubscribe immediately, every time.
      for (const r of detail.complaint.complainedRecipients) {
        await db.contacts.update({
          where: { email: r.emailAddress },
          data: { unsubscribed: true, unsubscribedAt: new Date() },
        });
      }
      break;
    }

    case "Delivery":
      // Note: a Delivery event does not mean the message is safe. The
      // receiving server can accept a message and bounce it afterward.
      break;
  }

  return NextResponse.json({ received: true });
}`;

const simulatorCode = `import { WrapsEmail } from "@wraps.dev/email";

const email = new WrapsEmail({ region: "us-east-1" });

// Each address triggers a specific event. None of them affect your
// reputation metrics or your daily sending quota.
await email.send({
  from: "hello@yourapp.com",
  to: "bounce@simulator.amazonses.com", // -> Permanent bounce
  subject: "Bounce test",
  html: "<p>Testing bounce handling</p>",
});

// Labels let you correlate the event back to the send that caused it
await email.send({
  from: "hello@yourapp.com",
  to: "bounce+signup-flow@simulator.amazonses.com",
  subject: "Bounce test",
  html: "<p>Testing bounce handling</p>",
});`;

const bounceTypes = [
  {
    type: "Permanent",
    subTypes: "General, NoEmail, Suppressed, OnAccountSuppressionList",
    meaning:
      "Hard bounce — the address does not work and will not start working",
    action: "Stop sending immediately. Mark the contact dead.",
    tone: "bad" as const,
  },
  {
    type: "Transient",
    subTypes:
      "General, MailboxFull, MessageTooLarge, ContentRejected, AttachmentRejected",
    meaning:
      "Soft bounce — a temporary condition, or a problem with this message",
    action: "Do not suppress on the first one. Count and threshold.",
    tone: "warn" as const,
  },
  {
    type: "Undetermined",
    subTypes: "Undetermined",
    meaning: "The provider bounced but did not say why",
    action: "Treat as transient. Watch for repeats on the same address.",
    tone: "warn" as const,
  },
];

const simulatorAddresses = [
  {
    address: "success@simulator.amazonses.com",
    scenario: "Accepted and delivered — fires a Delivery event",
  },
  {
    address: "bounce@simulator.amazonses.com",
    scenario: "Rejected with SMTP 550 5.1.1 — fires a Permanent bounce",
  },
  {
    address: "complaint@simulator.amazonses.com",
    scenario: "Delivered, then marked as spam — fires a Complaint",
  },
  {
    address: "suppressionlist@simulator.amazonses.com",
    scenario: "Hard bounce as if the address were on the suppression list",
  },
  {
    address: "ooto@simulator.amazonses.com",
    scenario: "Delivered, then returns an out-of-office auto-response",
  },
];

export default function BounceHandlingPageContent() {
  return (
    <DocsLayout>
      {/* Page Header */}
      <div className="mb-12">
        <Badge className="mb-4" variant="outline">
          Guide
        </Badge>
        <h1 className="mb-4 font-bold text-4xl tracking-tight">
          Bounce &amp; Complaint Handling
        </h1>
        <p className="text-lg text-muted-foreground">
          Bounces and complaints are the two metrics AWS uses to decide whether
          you keep your ability to send. Here is what the events mean, what to
          do with each one, and how to test it before it matters.
        </p>
        <div className="mt-4 flex items-center gap-4 text-muted-foreground text-sm">
          <span className="flex items-center gap-1">
            <Clock className="h-4 w-4" />5 min read
          </span>
        </div>
      </div>

      {/* Why this matters */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">Why This Matters</h2>
        <p className="mb-4 text-muted-foreground">
          Unlike a hosted email API, SES does not quietly absorb your bad
          addresses. Your bounce and complaint rates are computed at the account
          level, and AWS acts on them. These are the published thresholds:
        </p>
        <Card className="mb-4 overflow-hidden py-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="p-4 text-left font-medium">Metric</th>
                  <th className="p-4 text-left font-medium">AWS recommends</th>
                  <th className="p-4 text-left font-medium">
                    Sending may be paused
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <tr>
                  <td className="p-4 font-medium">Bounce rate</td>
                  <td className="p-4 text-muted-foreground">Under 5%</td>
                  <td className="p-4 text-muted-foreground">Above 10%</td>
                </tr>
                <tr>
                  <td className="p-4 font-medium">Complaint rate</td>
                  <td className="p-4 text-muted-foreground">Under 0.1%</td>
                  <td className="p-4 text-muted-foreground">Above 0.5%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
        <div className="rounded-lg border-primary border-l-4 bg-primary/10 p-4">
          <p className="font-medium text-sm">
            The thresholds are lower than they look
          </p>
          <p className="mt-2 text-muted-foreground text-sm">
            A 0.1% complaint rate is one complaint per thousand delivered
            emails. Gmail's own bulk sender guidelines are stricter still. By
            the time you notice a problem in the SES console, the rate is
            already an account-wide average that takes real volume to pull back
            down — which is why alerting well below the AWS line matters more
            than reacting at it.
          </p>
        </div>
      </section>

      {/* What Wraps deploys */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">What Wraps Deploys for You</h2>
        <p className="mb-4 text-muted-foreground">
          <code className="rounded bg-muted px-1.5 py-0.5">
            wraps email init
          </code>{" "}
          deploys the full event pipeline into your AWS account — an SES
          configuration set, EventBridge rules, an SQS queue with a dead-letter
          queue, a Lambda event processor, and a DynamoDB event history table.
        </p>
        <p className="mb-4 text-muted-foreground">
          Reputation alarms are part of that pipeline, but{" "}
          <strong className="text-foreground">
            which ones you get depends on the preset you deploy
          </strong>
          . The Starter preset ships with alerting turned off; Production and
          Enterprise add CloudWatch alarms that fire well before the AWS
          thresholds:
        </p>
        <Card className="mb-4 overflow-hidden py-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="p-4 text-left font-medium">Preset</th>
                  <th className="p-4 text-left font-medium">
                    Bounce warn / critical
                  </th>
                  <th className="p-4 text-left font-medium">
                    Complaint warn / critical
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <tr>
                  <td className="p-4 font-medium">Starter</td>
                  <td className="p-4 text-muted-foreground" colSpan={2}>
                    Alerting disabled — no reputation alarms deployed
                  </td>
                </tr>
                <tr>
                  <td className="p-4 font-medium">Production</td>
                  <td className="p-4 text-muted-foreground">2% / 4%</td>
                  <td className="p-4 text-muted-foreground">0.05% / 0.08%</td>
                </tr>
                <tr>
                  <td className="p-4 font-medium">Enterprise</td>
                  <td className="p-4 text-muted-foreground">1% / 2%</td>
                  <td className="p-4 text-muted-foreground">0.03% / 0.05%</td>
                </tr>
                <tr className="bg-muted/30">
                  <td className="p-4 font-medium">AWS acts at</td>
                  <td className="p-4 text-muted-foreground">
                    5% recommended / 10% may pause
                  </td>
                  <td className="p-4 text-muted-foreground">
                    0.1% recommended / 0.5% may pause
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
        <p className="text-muted-foreground text-sm">
          Production and Enterprise also alarm on dead-letter queue depth, so a
          failing event processor surfaces instead of silently dropping events.
          Thresholds are overridable per deployment — see{" "}
          <a
            className="font-medium text-primary underline"
            href="/docs/guides/configuration-presets"
          >
            Configuration Presets
          </a>
          .
        </p>
      </section>

      {/* Event types */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">Reading a Bounce</h2>
        <p className="mb-4 text-muted-foreground">
          The single most common bounce-handling bug is treating every bounce
          the same. SES tells you exactly how permanent the problem is via{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">bounceType</code> and{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">bounceSubType</code>:
        </p>
        <div className="space-y-4">
          {bounceTypes.map((b) => (
            <Card key={b.type}>
              <CardContent className="p-6">
                <div className="mb-3 flex items-center gap-3">
                  {b.tone === "bad" ? (
                    <AlertTriangle className="h-5 w-5 shrink-0 text-red-500" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 shrink-0 text-yellow-500" />
                  )}
                  <code className="font-semibold text-base">{b.type}</code>
                </div>
                <p className="mb-2 text-muted-foreground">{b.meaning}</p>
                <p className="mb-3 font-medium text-sm">{b.action}</p>
                <p className="text-muted-foreground text-xs">
                  <span className="font-medium">Subtypes:</span> {b.subTypes}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="mt-4 rounded-lg border-primary border-l-4 bg-primary/10 p-4">
          <p className="font-medium text-sm">
            Not every Permanent bounce is a new dead address
          </p>
          <p className="mt-2 text-muted-foreground text-sm">
            The subtypes{" "}
            <code className="rounded bg-muted px-1 text-xs">
              OnAccountSuppressionList
            </code>{" "}
            and{" "}
            <code className="rounded bg-muted px-1 text-xs">
              OnTenantSuppressionList
            </code>{" "}
            mean SES never attempted delivery — the address was already
            suppressed. AWS does not count these toward your bounce rate, and
            neither should your internal metrics.
          </p>
        </div>
      </section>

      {/* Handler code */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">Handling Events in Your App</h2>
        <p className="mb-4 text-muted-foreground">
          Wraps delivers events to your endpoint over HTTPS with a shared secret
          in the{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">
            X-Wraps-Signature
          </code>{" "}
          header. Compare it with a constant-time comparison, never{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">===</code>:
        </p>
        <CodeBlock
          className="h-auto"
          data={[
            {
              language: "typescript",
              filename: "app/api/webhooks/email/route.ts",
              code: webhookHandlerCode,
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

      {/* Gotchas */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">
          Three Things That Surprise People
        </h2>
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                A Delivery event does not mean the message survived
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                The receiving mail server can accept a message — firing a
                Delivery event — and then decide during processing that it
                bounces, firing a Bounce event for the same message afterward.
                Treat message status as a log you append to, not a state machine
                that only moves forward.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                One event can cover many recipients — or one each
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                SES makes no batching or ordering guarantees. A single bounce
                notification may list several recipients, or you may get one
                notification per recipient for the same send. Always iterate{" "}
                <code className="rounded bg-muted px-1 text-xs">
                  bouncedRecipients
                </code>
                ; never assume index 0 is the whole story.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                Complaints rarely name the complainer
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                Most ISPs strip the recipient address from the feedback report,
                so{" "}
                <code className="rounded bg-muted px-1 text-xs">
                  complainedRecipients
                </code>{" "}
                is SES's best guess based on the original message. Sending one
                message per recipient — rather than one message with thirty
                addresses in BCC — is what makes that guess exact.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Testing */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">Test It Before You Need It</h2>
        <p className="mb-4 text-muted-foreground">
          SES runs a mailbox simulator that produces real events on demand.
          Messages sent to these addresses{" "}
          <strong className="text-foreground">
            do not affect your reputation metrics
          </strong>{" "}
          or your daily sending quota, and they work while you are still in the
          sandbox. You are billed for them as normal sends.
        </p>
        <Card className="mb-4 overflow-hidden py-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="p-4 text-left font-medium">Address</th>
                  <th className="p-4 text-left font-medium">What it does</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {simulatorAddresses.map((s) => (
                  <tr key={s.address}>
                    <td className="p-4">
                      <code className="text-xs">{s.address}</code>
                    </td>
                    <td className="p-4 text-muted-foreground">{s.scenario}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <CodeBlock
          className="h-auto"
          data={[
            {
              language: "typescript",
              filename: "test-bounces.ts",
              code: simulatorCode,
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

      {/* Checklist */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">Checklist</h2>
        <ul className="space-y-3">
          {[
            "Permanent bounces stop sending to that address permanently",
            "Transient bounces increment a counter, not a suppression",
            "Complaints unsubscribe immediately, with no threshold",
            "OnAccountSuppressionList bounces are excluded from your own metrics",
            "Your handler iterates every recipient in the event",
            "You have tested all five simulator addresses end to end",
          ].map((item) => (
            <li className="flex items-start gap-3" key={item}>
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-500" />
              <span className="text-muted-foreground">{item}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Next Steps */}
      <section className="mb-12">
        <h2 className="mb-6 font-bold text-2xl">Next Steps</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="transition-colors hover:border-primary/50">
            <CardHeader>
              <CardTitle className="text-lg">Suppression Lists</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-muted-foreground text-sm">
                SES keeps its own list of addresses it refuses to send to. Learn
                how it interacts with yours.
              </p>
              <Button asChild variant="outline">
                <Link href="/docs/guides/suppression-lists">
                  Suppression Lists
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="transition-colors hover:border-primary/50">
            <CardHeader>
              <CardTitle className="text-lg">Webhook Setup</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-muted-foreground text-sm">
                Point Wraps at your endpoint and configure retries and
                signatures.
              </p>
              <Button asChild variant="outline">
                <Link href="/docs/guides/webhooks">
                  Webhooks Guide
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
          <Card className="transition-colors hover:border-primary/50">
            <CardHeader>
              <CardTitle className="text-lg">Domain Reputation</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-muted-foreground text-sm">
                Keeping the rates on this page low in the first place, and the
                runbook for when one starts climbing.
              </p>
              <Button asChild variant="outline">
                <Link href="/docs/guides/reputation">
                  Reputation Guide
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
