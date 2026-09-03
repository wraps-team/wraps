"use client";

import { Badge } from "@wraps/ui/components/ui/badge";
import { Button } from "@wraps/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import { AlertTriangle, ArrowRight, CheckCircle2 } from "lucide-react";
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

const dedupeTableCode = `// One DynamoDB table, one attribute, a TTL. That is the whole mechanism.
//
//   Table:         email-sends
//   Partition key: dedupeKey (String)
//   TTL attribute: expiresAt

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

/**
 * Returns true the first time it sees a key, false every time after.
 * The conditional write is the lock — DynamoDB rejects the second one, so
 * two workers racing on the same message cannot both win.
 */
async function claim(dedupeKey: string): Promise<boolean> {
  try {
    await ddb.send(
      new PutCommand({
        TableName: "email-sends",
        Item: {
          dedupeKey,
          claimedAt: Date.now(),
          // Keep the row well past the longest retry window you allow.
          expiresAt: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
        },
        ConditionExpression: "attribute_not_exists(dedupeKey)",
      }),
    );
    return true;
  } catch (error) {
    if ((error as { name?: string }).name === "ConditionalCheckFailedException") {
      return false;
    }
    throw error;
  }
}`;

const workerCode = `import { WrapsEmail } from "@wraps.dev/email";

const email = new WrapsEmail({ region: "us-east-1" });

export async function handler(event: { Records: { body: string }[] }) {
  for (const record of event.Records) {
    const job = JSON.parse(record.body) as {
      userId: string;
      orderId: string;
      to: string;
    };

    // The key names the thing that should happen once, not the attempt.
    // "order 8891's receipt to this user" happens once. A message id would
    // change on redelivery and defeat the whole exercise.
    const dedupeKey = \`receipt:\${job.orderId}:\${job.userId}\`;

    if (!(await claim(dedupeKey))) {
      // Already sent on an earlier attempt. Ack and move on.
      continue;
    }

    await email.send({
      from: "receipts@yourdomain.com",
      to: job.to,
      subject: \`Receipt for order \${job.orderId}\`,
      html: "<p>Thanks for your order.</p>",
    });
  }
}`;

const orderingCode = `// Claim first, send second. This order is deliberate.
//
// claim() then send()  →  a crash between them loses one email.
// send() then claim()  →  a crash between them sends a second one.
//
// Losing a receipt is a support ticket. Sending a password reset twice is a
// security question. Pick the failure you would rather explain, and for
// almost every transactional email that means claiming first.
//
// If you cannot lose the message, do not reach for a distributed
// transaction. Record the intent in your own database inside the
// transaction that created the order, and let a separate worker drain it.
// That is the outbox pattern and it is the only honest answer here.`;

export default function IdempotencyPageContent() {
  return (
    <DocsLayout>
      <div className="mb-10">
        <Badge className="mb-3" variant="outline">
          Guide
        </Badge>
        <h1 className="mb-4 font-heading font-semibold text-3xl tracking-tight sm:text-4xl">
          Preventing duplicate sends
        </h1>
        <p className="text-lg text-muted-foreground">
          SQS is at-least-once. Your worker will eventually send the same email
          twice unless you stop it, and the day it happens will be the day you
          are sending password resets.
        </p>
      </div>

      <section className="mb-12">
        <h2 className="mb-4 font-heading font-semibold text-2xl tracking-tight">
          Where the duplicates come from
        </h2>
        <p className="mb-4 text-muted-foreground">
          There is no bug to find. Every one of these is a queue or a runtime
          behaving exactly as documented:
        </p>
        <ul className="mb-4 grid gap-3 text-muted-foreground">
          <li>
            A Lambda times out after SES accepted the message but before the
            handler returned. SQS never got the ack, so the message comes back.
          </li>
          <li>
            Your handler takes longer than the queue&apos;s visibility timeout.
            SQS hands the same message to a second consumer while the first is
            still working.
          </li>
          <li>
            A deploy kills a worker mid-batch. Everything it had not
            acknowledged is redelivered.
          </li>
          <li>
            An upstream service retries a webhook it never saw a 200 for, and
            enqueues the job again.
          </li>
        </ul>
        <Card className="border-yellow-500/40 bg-yellow-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="size-4 text-yellow-600 dark:text-yellow-500" />
              Wraps does not deduplicate this for you
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            <p className="mb-3">
              <code>email.send()</code> takes no idempotency key today. Calling
              it twice with identical arguments sends two emails, and SES will
              accept both and return two different message ids. There is nothing
              in the SDK or in SES that notices they are the same message.
            </p>
            <p>
              Workflows are the exception. A workflow step deduplicates
              internally on an execution and step id, so a retried workflow does
              not re-send a step that already completed. That protection does
              not extend to direct <code>send()</code> calls from your own
              workers, which is what this page is about.
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="mb-12">
        <h2 className="mb-4 font-heading font-semibold text-2xl tracking-tight">
          Pick a key that describes the outcome
        </h2>
        <p className="mb-4 text-muted-foreground">
          The whole design is in the key. It has to identify the thing that
          should happen exactly once, and it has to be identical across every
          retry of that thing.
        </p>
        <div className="mb-4 overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-border border-b">
                <th className="py-3 pr-4 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  Key
                </th>
                <th className="py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  Verdict
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-border/60 border-b align-top">
                <td className="py-3 pr-4">
                  <code>
                    receipt:{"{orderId}"}:{"{userId}"}
                  </code>
                </td>
                <td className="py-3 text-muted-foreground">
                  Good. Survives redelivery, names one real-world event.
                </td>
              </tr>
              <tr className="border-border/60 border-b align-top">
                <td className="py-3 pr-4">
                  <code>password-reset:{"{tokenId}"}</code>
                </td>
                <td className="py-3 text-muted-foreground">
                  Good. One token, one email, however many times the job runs.
                </td>
              </tr>
              <tr className="border-border/60 border-b align-top">
                <td className="py-3 pr-4">
                  <code>{"{sqsMessageId}"}</code>
                </td>
                <td className="py-3 text-muted-foreground">
                  Useless. A redelivered message keeps its id, but a re-enqueued
                  job gets a new one, and that is the case you were worried
                  about.
                </td>
              </tr>
              <tr className="border-border/60 border-b align-top">
                <td className="py-3 pr-4">
                  <code>hash(subject + body)</code>
                </td>
                <td className="py-3 text-muted-foreground">
                  Dangerous. Two customers legitimately getting the same
                  notification collide, and the second one silently gets
                  nothing.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-12">
        <h2 className="mb-4 font-heading font-semibold text-2xl tracking-tight">
          The dedupe table
        </h2>
        <p className="mb-4 text-muted-foreground">
          A conditional write against DynamoDB is enough. The condition is the
          lock: two workers racing on the same key cannot both succeed, so you
          do not need any other coordination.
        </p>
        <CodeBlock
          className="mb-6 h-auto"
          data={[
            {
              language: "typescript",
              filename: "dedupe.ts",
              code: dedupeTableCode,
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
        <p className="text-muted-foreground">
          Use your own table rather than the <code>wraps-email-*</code> tables
          the CLI deploys. Those hold delivery history and Wraps manages their
          schema and retention; a dedupe ledger is your application&apos;s state
          and should outlive any decision we make about ours.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="mb-4 font-heading font-semibold text-2xl tracking-tight">
          In the worker
        </h2>
        <CodeBlock
          className="mb-6 h-auto"
          data={[
            {
              language: "typescript",
              filename: "worker.ts",
              code: workerCode,
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

      <section className="mb-12">
        <h2 className="mb-4 font-heading font-semibold text-2xl tracking-tight">
          Claim before you send, and know what that costs
        </h2>
        <p className="mb-4 text-muted-foreground">
          There is no ordering that is safe in every case, because the send and
          the bookkeeping are not one atomic operation and cannot be made into
          one. You are choosing which failure you would rather have.
        </p>
        <CodeBlock
          className="mb-6 h-auto"
          data={[
            {
              language: "typescript",
              filename: "ordering.ts",
              code: orderingCode,
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

      <section className="mb-12">
        <h2 className="mb-4 font-heading font-semibold text-2xl tracking-tight">
          Two settings that cause more duplicates than anything else
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="p-5">
            <h3 className="mb-2 font-semibold text-sm">Visibility timeout</h3>
            <p className="text-muted-foreground text-sm">
              Set it to at least six times your function timeout, which is what
              AWS recommends for Lambda consumers. A visibility timeout shorter
              than the work is a duplicate generator: the queue hands the job to
              a second consumer while the first is still sending.
            </p>
          </Card>
          <Card className="p-5">
            <h3 className="mb-2 font-semibold text-sm">Batch item failures</h3>
            <p className="text-muted-foreground text-sm">
              Report partial batch failures so one bad record does not redeliver
              the nine beside it that already sent. Without it, a batch of ten
              where the last one throws re-sends the first nine.
            </p>
          </Card>
        </div>
      </section>

      <section className="mb-12">
        <h2 className="mb-4 font-heading font-semibold text-2xl tracking-tight">
          Verify it
        </h2>
        <ul className="grid gap-3 text-muted-foreground">
          <li className="flex gap-2.5">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-500" />
            Call your handler twice with the same payload. One email should
            arrive.
          </li>
          <li className="flex gap-2.5">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-500" />
            Throw after the send on purpose. The message redelivers, the claim
            fails, and no second email goes out.
          </li>
          <li className="flex gap-2.5">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-500" />
            Run two consumers against the same message at once. Exactly one
            should win the conditional write.
          </li>
        </ul>
      </section>

      <section className="rounded-2xl border bg-muted/30 p-6">
        <h2 className="mb-2 font-heading font-semibold text-xl tracking-tight">
          Next steps
        </h2>
        <p className="mb-5 text-muted-foreground">
          Workflows handle step-level deduplication for you. The events guide
          covers the queue and dead letter queue the CLI deploys.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/docs/guides/workflows">
              Building workflows
              <ArrowRight className="ml-2 size-4" />
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/docs/infrastructure/events">Event infrastructure</Link>
          </Button>
        </div>
      </section>
    </DocsLayout>
  );
}
