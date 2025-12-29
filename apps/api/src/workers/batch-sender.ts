/**
 * Batch Sender Worker
 *
 * SQS Lambda handler that processes batch send jobs.
 * Sends emails/SMS in chunks of 100 contacts.
 */

import { SESClient, SendRawEmailCommand } from "@aws-sdk/client-ses";
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { batchSend, contact, db, eq, messageSend, template } from "@wraps/db";
import type { SQSEvent, SQSHandler } from "aws-lambda";
import { and, isNotNull, sql } from "drizzle-orm";

import { generateUnsubscribeToken } from "../lib/unsubscribe-token";
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
          html: templateHtml ?? batch.htmlContent ?? "<p>Hello from Wraps!</p>",
          replyTo: batch.replyTo,
          // For unsubscribe link generation
          contactId: recipient.id,
          organizationId,
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
): Promise<Array<{ id: string; email: string | null; phone: string | null }>> {
  if (channel === "email") {
    // Filter by active email status (null treated as active for backwards compat)
    return db
      .select({
        id: contact.id,
        email: contact.email,
        phone: contact.phone,
      })
      .from(contact)
      .where(
        and(
          eq(contact.organizationId, organizationId),
          isNotNull(contact.email),
          sql`(${contact.emailStatus} = 'active' OR ${contact.emailStatus} IS NULL)`
        )
      )
      .orderBy(contact.createdAt)
      .offset(offset)
      .limit(limit);
  }

  // SMS - filter by opted_in status
  if (channel === "sms") {
    return db
      .select({
        id: contact.id,
        email: contact.email,
        phone: contact.phone,
      })
      .from(contact)
      .where(
        and(
          eq(contact.organizationId, organizationId),
          isNotNull(contact.phone),
          eq(contact.smsStatus, "opted_in")
        )
      )
      .orderBy(contact.createdAt)
      .offset(offset)
      .limit(limit);
  }

  return [];
}

interface EmailParams {
  from: string;
  fromName?: string | null;
  to: string;
  subject: string;
  html: string;
  replyTo?: string | null;
  // Unsubscribe link params
  contactId: string;
  organizationId: string;
  topicId?: string;
}

async function sendEmail(
  client: SESClient,
  params: EmailParams
): Promise<string> {
  const source = params.fromName
    ? `${params.fromName} <${params.from}>`
    : params.from;

  // Generate unsubscribe token for RFC 8058 compliance
  const unsubscribeToken = await generateUnsubscribeToken(
    params.contactId,
    params.organizationId,
    params.topicId
  );

  const apiBaseUrl = process.env.API_BASE_URL || "https://api.wraps.dev";
  const appBaseUrl = process.env.APP_BASE_URL || "https://wraps.dev";
  const unsubscribeUrl = `${apiBaseUrl}/unsubscribe/${unsubscribeToken}`;
  const preferencesUrl = `${appBaseUrl}/preferences/${unsubscribeToken}`;

  // Add unsubscribe footer to HTML
  const htmlWithFooter = addUnsubscribeFooter(
    params.html,
    unsubscribeUrl,
    preferencesUrl
  );

  // Build raw email with List-Unsubscribe headers (RFC 8058)
  const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substring(2)}`;

  const rawEmail = [
    `From: ${source}`,
    `To: ${params.to}`,
    `Subject: ${params.subject}`,
    params.replyTo ? `Reply-To: ${params.replyTo}` : null,
    // RFC 8058 one-click unsubscribe headers
    `List-Unsubscribe: <${unsubscribeUrl}>`,
    "List-Unsubscribe-Post: List-Unsubscribe=One-Click",
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: quoted-printable",
    "",
    stripHtml(htmlWithFooter),
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: quoted-printable",
    "",
    htmlWithFooter,
    "",
    `--${boundary}--`,
  ]
    .filter((line) => line !== null)
    .join("\r\n");

  const result = await client.send(
    new SendRawEmailCommand({
      RawMessage: {
        Data: new TextEncoder().encode(rawEmail),
      },
      ConfigurationSetName: "wraps-email-tracking",
    })
  );

  return result.MessageId ?? "";
}

/**
 * Add unsubscribe footer to HTML email
 */
function addUnsubscribeFooter(
  html: string,
  unsubscribeUrl: string,
  preferencesUrl: string
): string {
  const footer = `
<div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; font-size: 12px; color: #6b7280;">
  <p>
    <a href="${preferencesUrl}" style="color: #6b7280; text-decoration: underline;">Manage preferences</a>
    &nbsp;|&nbsp;
    <a href="${unsubscribeUrl}" style="color: #6b7280; text-decoration: underline;">Unsubscribe</a>
  </p>
</div>`;

  // Insert before </body> if exists, otherwise append
  if (html.includes("</body>")) {
    return html.replace("</body>", `${footer}</body>`);
  }
  return html + footer;
}

/**
 * Strip HTML tags for plain text version
 */
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
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
    })
  );
}

function getDefaultDomain(): string {
  return process.env.DEFAULT_DOMAIN ?? "wraps.dev";
}
