/**
 * Batch Sender Worker
 *
 * SQS Lambda handler that processes batch send jobs.
 * Sends emails/SMS in chunks of 100 contacts.
 */

import type { SQSEvent, SQSHandler } from "aws-lambda";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import {
  db,
  batchSend,
  messageSend,
  contact,
  template,
  eq,
} from "@wraps/db";
import { and, isNotNull, sql } from "drizzle-orm";

import { getCredentials } from "../services/credentials";
import type { BatchJob } from "../services/queue";

const CHUNK_SIZE = 100;
const QUEUE_URL = process.env.BATCH_QUEUE_URL;

export const handler: SQSHandler = async (event: SQSEvent) => {
  for (const record of event.Records) {
    const job: BatchJob = JSON.parse(record.body);
    await processJob(job);
  }
};

async function processJob(job: BatchJob): Promise<void> {
  const { batchId, organizationId, awsAccountId, channel, chunkIndex } = job;

  // Load batch details
  const [batch] = await db
    .select()
    .from(batchSend)
    .where(eq(batchSend.id, batchId))
    .limit(1);

  if (!batch) {
    console.error(`Batch ${batchId} not found`);
    return;
  }

  // Check if batch was cancelled
  if (batch.status === "cancelled") {
    console.log(`Batch ${batchId} was cancelled, skipping`);
    return;
  }

  // Mark as processing on first chunk
  if (chunkIndex === 0) {
    await db
      .update(batchSend)
      .set({ status: "processing", startedAt: new Date() })
      .where(eq(batchSend.id, batchId));
  }

  // Get contacts for this chunk
  const offset = chunkIndex * CHUNK_SIZE;
  const contacts = await getContactsChunk(
    organizationId,
    channel,
    offset,
    CHUNK_SIZE
  );

  if (contacts.length === 0) {
    // No more contacts, mark batch as completed
    await db
      .update(batchSend)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(batchSend.id, batchId));
    return;
  }

  // Get customer AWS credentials
  const credentials = await getCredentials(awsAccountId);

  // Create SES client with customer credentials
  const sesClient = new SESClient({
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
    region: process.env.AWS_REGION ?? "us-east-1",
  });

  // Load template if using one
  let templateHtml: string | undefined;
  if (batch.emailTemplateId) {
    const [tmpl] = await db
      .select({ compiledHtml: template.compiledHtml })
      .from(template)
      .where(eq(template.id, batch.emailTemplateId))
      .limit(1);
    templateHtml = tmpl?.compiledHtml ?? undefined;
  }

  // Send to each contact
  let sent = 0;
  let failed = 0;

  for (const recipient of contacts) {
    try {
      if (channel === "email" && recipient.email) {
        const messageId = await sendEmail(sesClient, {
          from: batch.from ?? `noreply@${getDefaultDomain()}`,
          fromName: batch.fromName,
          to: recipient.email,
          subject: batch.subject ?? "Message from Wraps",
          html: templateHtml ?? batch.body ?? "<p>Hello from Wraps!</p>",
          replyTo: batch.replyTo,
        });

        // Record successful send
        await db.insert(messageSend).values({
          organizationId,
          contactId: recipient.id,
          awsAccountId,
          channel: "email",
          batchSendId: batchId,
          sourceType: "batch",
          recipient: recipient.email,
          subject: batch.subject,
          from: batch.from,
          fromName: batch.fromName,
          emailTemplateId: batch.emailTemplateId,
          messageId,
          status: "sent",
          sentAt: new Date(),
        });

        sent++;
      }
      // SMS handling would go here (Phase 3)
    } catch (error) {
      console.error(`Failed to send to ${recipient.email}:`, error);

      // Record failed send
      await db.insert(messageSend).values({
        organizationId,
        contactId: recipient.id,
        awsAccountId,
        channel: "email",
        batchSendId: batchId,
        sourceType: "batch",
        recipient: recipient.email ?? "",
        subject: batch.subject,
        from: batch.from,
        fromName: batch.fromName,
        emailTemplateId: batch.emailTemplateId,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      });

      failed++;
    }
  }

  // Update batch progress
  await db
    .update(batchSend)
    .set({
      processedRecipients: sql`${batchSend.processedRecipients} + ${contacts.length}`,
      sent: sql`${batchSend.sent} + ${sent}`,
      failed: sql`${batchSend.failed} + ${failed}`,
    })
    .where(eq(batchSend.id, batchId));

  // Check if more contacts to process
  const totalProcessed = (chunkIndex + 1) * CHUNK_SIZE;
  if (totalProcessed < batch.totalRecipients) {
    // Enqueue next chunk
    await enqueueNextChunk({
      ...job,
      chunkIndex: chunkIndex + 1,
    });
  } else {
    // Mark batch as completed
    await db
      .update(batchSend)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(batchSend.id, batchId));
  }
}

async function getContactsChunk(
  organizationId: string,
  channel: string,
  offset: number,
  limit: number
): Promise<Array<{ id: string; email: string | null }>> {
  if (channel === "email") {
    return db
      .select({
        id: contact.id,
        email: contact.email,
      })
      .from(contact)
      .where(
        and(
          eq(contact.organizationId, organizationId),
          isNotNull(contact.email)
          // TODO: Add emailStatus = 'active' filter
        )
      )
      .orderBy(contact.createdAt)
      .offset(offset)
      .limit(limit);
  }

  // SMS (Phase 3)
  return [];
}

interface EmailParams {
  from: string;
  fromName?: string | null;
  to: string;
  subject: string;
  html: string;
  replyTo?: string | null;
}

async function sendEmail(
  client: SESClient,
  params: EmailParams
): Promise<string> {
  const source = params.fromName
    ? `${params.fromName} <${params.from}>`
    : params.from;

  const result = await client.send(
    new SendEmailCommand({
      Source: source,
      Destination: {
        ToAddresses: [params.to],
      },
      Message: {
        Subject: { Data: params.subject },
        Body: {
          Html: { Data: params.html },
        },
      },
      ReplyToAddresses: params.replyTo ? [params.replyTo] : undefined,
    })
  );

  return result.MessageId ?? "";
}

async function enqueueNextChunk(job: BatchJob): Promise<void> {
  if (!QUEUE_URL) {
    throw new Error("BATCH_QUEUE_URL not configured");
  }

  const sqsClient = new SQSClient({});
  await sqsClient.send(
    new SendMessageCommand({
      QueueUrl: QUEUE_URL,
      MessageBody: JSON.stringify(job),
      MessageGroupId: job.batchId,
      MessageDeduplicationId: `${job.batchId}-${job.chunkIndex}`,
    })
  );
}

function getDefaultDomain(): string {
  return process.env.DEFAULT_DOMAIN ?? "wraps.dev";
}
