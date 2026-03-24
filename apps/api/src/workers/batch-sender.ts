/**
 * Batch Sender Worker
 *
 * SQS Lambda handler that processes batch send jobs.
 * Sends emails/SMS in chunks of 50 contacts (matching SES bulk limit).
 * Respects customer's SES rate limit via SQS delay between chunks.
 */

import {
  type BulkEmailEntry,
  GetAccountCommand,
  SESv2Client,
  SendBulkEmailCommand,
  SendEmailCommand,
} from "@aws-sdk/client-sesv2";
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { toPlainText } from "@react-email/render";
import {
  batchSend,
  buildConditionSQL,
  contact,
  contactTopic,
  db,
  eq,
  messageSend,
  organization,
  organizationExtension,
  segment,
  template,
} from "@wraps/db";
import type { SQSEvent, SQSHandler } from "aws-lambda";
import { and, exists, isNotNull, sql } from "drizzle-orm";
import { trackFirstEmailSent } from "../lib/activation-tracking";
import { awsDefaults } from "../lib/aws-defaults";
import { flushLogger, log } from "../lib/logger";
import { generateUnsubscribeToken } from "../lib/unsubscribe-token";
import { getCredentials } from "../services/credentials";
import type { BatchJob } from "../services/queue";
import { applyVariableMappings } from "./variable-mappings";

/**
 * Transform variables from dot notation to SES-compatible camelCase format.
 * Also converts fallback syntax to Handlebars conditionals.
 *
 * Examples:
 *   {{contact.firstName}} -> {{contactFirstName}}
 *   {{contact.firstName|there}} -> {{#if contactFirstName}}{{contactFirstName}}{{else}}there{{/if}}
 *
 * This is a safety net for the fallback path - normally auto-publish handles this.
 */
function transformVariablesForSes(html: string): string {
  return html.replace(
    /\{\{\s*([a-zA-Z0-9_.]+)(?:\s*\|\s*([^}]*))?\s*\}\}/g,
    (_match, varName: string, fallback: string | undefined) => {
      // Convert dot notation to camelCase: contact.firstName -> contactFirstName
      const sesName = varName
        .split(".")
        .map((part, index) =>
          index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)
        )
        .join("");

      // If there's a fallback value, use Handlebars conditional
      if (fallback !== undefined) {
        const trimmedFallback = fallback.trim();
        return `{{#if ${sesName}}}{{${sesName}}}{{else}}${trimmedFallback}{{/if}}`;
      }

      return `{{${sesName}}}`;
    }
  );
}

// Align chunk size with SES bulk limit for clean 1:1 mapping
const CHUNK_SIZE = 50; // SES SendBulkEmail limit per API call
const DEFAULT_RATE_LIMIT = 14; // Fallback emails/sec if can't fetch from AWS
const QUEUE_URL = process.env.BATCH_QUEUE_URL;

export const handler: SQSHandler = async (event: SQSEvent) => {
  try {
    for (const record of event.Records) {
      const job: BatchJob = JSON.parse(record.body);
      await processJob(job);
    }
  } finally {
    await flushLogger();
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
    log.error("Batch not found", undefined, { batchId });
    return;
  }

  // Check if batch was cancelled
  if (batch.status === "cancelled") {
    log.info("Batch cancelled, skipping", { batchId });
    return;
  }

  // Reject unsupported channels before any state mutation
  if (channel !== "email") {
    log.error("Unsupported batch channel", undefined, { batchId, channel, organizationId });
    await db
      .update(batchSend)
      .set({
        status: "failed",
        completedAt: new Date(),
        processedRecipients: batch.totalRecipients,
        failed: batch.totalRecipients,
        errorMessage: `Unsupported batch channel: ${channel}`,
        errorDetails: { channel },
      })
      .where(eq(batchSend.id, batchId));
    return;
  }

  // Mark as processing on first chunk
  if (chunkIndex === 0) {
    await db
      .update(batchSend)
      .set({ status: "processing", startedAt: new Date() })
      .where(eq(batchSend.id, batchId));
  }

  const remainingRecipients = Math.max(
    batch.totalRecipients - batch.processedRecipients,
    0
  );
  if (remainingRecipients === 0) {
    await db
      .update(batchSend)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(batchSend.id, batchId));
    return;
  }

  // Get contacts for this chunk using cursor-based pagination
  const contacts = await getContactsChunk(
    organizationId,
    channel,
    Math.min(CHUNK_SIZE, remainingRecipients),
    {
      audienceType: batch.audienceType as
        | "all"
        | "topic"
        | "segment"
        | undefined,
      topicId: batch.topicId ?? undefined,
      segmentId: batch.segmentId ?? undefined,
    },
    job.cursor
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
  const credentials = await getCredentials(awsAccountId, organizationId);

  // Create SES v2 client with customer credentials and their SES region
  const sesClient = new SESv2Client({
    ...awsDefaults,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
    region: credentials.region,
  });

  // Fetch customer's SES rate limit
  let maxSendRate = DEFAULT_RATE_LIMIT;
  try {
    const accountInfo = await sesClient.send(new GetAccountCommand({}));
    maxSendRate = accountInfo.SendQuota?.MaxSendRate ?? DEFAULT_RATE_LIMIT;
  } catch (error) {
    log.warn("Could not fetch SES rate limit, using default", {
      error: String(error),
    });
  }

  // Calculate delay between chunks to respect rate limit
  // CHUNK_SIZE recipients / rate limit = seconds to wait
  const rateLimitDelay = Math.ceil(CHUNK_SIZE / maxSendRate);

  // Load template info and organization name
  let sesTemplateName: string | undefined;
  let templateHtml: string | undefined;
  let orgName: string | undefined;
  let emailType: "marketing" | "transactional" = "marketing";

  if (batch.emailTemplateId) {
    const [[tmpl], [org]] = await Promise.all([
      db
        .select({
          sesTemplateName: template.sesTemplateName,
          compiledHtml: template.compiledHtml,
          emailType: template.emailType,
        })
        .from(template)
        .where(
          and(
            eq(template.id, batch.emailTemplateId),
            eq(template.organizationId, organizationId)
          )
        )
        .limit(1),
      db
        .select({ name: organization.name })
        .from(organization)
        .where(eq(organization.id, organizationId))
        .limit(1),
    ]);
    sesTemplateName = tmpl?.sesTemplateName ?? undefined;
    templateHtml = tmpl?.compiledHtml ?? undefined;
    emailType = tmpl?.emailType ?? "marketing";
    orgName = org?.name ?? undefined;
  }

  // Send to contacts using SES
  let sent = 0;
  let failed = 0;

  const apiBaseUrl = process.env.API_BASE_URL || "https://api.wraps.dev";
  const appBaseUrl = process.env.APP_BASE_URL || "https://app.wraps.dev";

  // Filter email contacts
  const emailContacts = contacts.filter((c) => channel === "email" && c.email);

  const isMarketing = emailType === "marketing";

  // Resolve sender: batch.from > org default > owner email domain > fail
  let fromAddress: string | null = batch.from;
  let fromName: string | null = batch.fromName;
  if (!fromAddress) {
    const [orgExt] = await db
      .select({
        defaultFrom: organizationExtension.defaultFrom,
        defaultFromName: organizationExtension.defaultFromName,
      })
      .from(organizationExtension)
      .where(eq(organizationExtension.organizationId, organizationId))
      .limit(1);
    fromAddress = orgExt?.defaultFrom ?? null;
    if (!fromName) {
      fromName = orgExt?.defaultFromName ?? null;
    }
  }

  if (!fromAddress) {
    log.error("No sender address configured for batch", {
      batchId,
      organizationId,
    });
    // Mark all contacts in this chunk as failed
    const failedRecords = emailContacts.map((recipient) => ({
      organizationId,
      contactId: recipient.id,
      awsAccountId,
      channel: "email" as const,
      batchSendId: batchId,
      sourceType: "batch" as const,
      recipient: recipient.email ?? "",
      subject: batch.subject,
      from: batch.from,
      fromName: batch.fromName,
      emailTemplateId: batch.emailTemplateId,
      status: "failed" as const,
      error:
        "No sender email configured. Set a default sender in Settings > Sender Defaults.",
    }));
    if (failedRecords.length > 0) {
      await db.insert(messageSend).values(failedRecords);
    }
    await db
      .update(batchSend)
      .set({
        status: "failed",
        completedAt: new Date(),
        processedRecipients: sql`${batchSend.processedRecipients} + ${emailContacts.length}`,
        failed: sql`${batchSend.failed} + ${emailContacts.length}`,
      })
      .where(eq(batchSend.id, batchId));
    return;
  }

  const fromDisplay = fromName ? `${fromName} <${fromAddress}>` : fromAddress;

  // Use bulk sending for SES templates, individual sends for raw HTML
  if (sesTemplateName) {
    // SES bulk email limit is 50 recipients per API call
    const BULK_BATCH_SIZE = 50;

    // Process in batches of 50
    for (let i = 0; i < emailContacts.length; i += BULK_BATCH_SIZE) {
      const recipientBatch = emailContacts.slice(i, i + BULK_BATCH_SIZE);

      // Build bulk email entries
      const bulkEntries: BulkEmailEntry[] = await Promise.all(
        recipientBatch.map(async (recipient) => {
          // Generate unsubscribe URLs for marketing emails
          let unsubscribeUrl: string | undefined;
          let preferencesUrl: string | undefined;

          if (isMarketing) {
            const unsubscribeToken = await generateUnsubscribeToken(
              recipient.id,
              organizationId
            );
            unsubscribeUrl = `${apiBaseUrl}/unsubscribe/${unsubscribeToken}`;
            preferencesUrl = `${appBaseUrl}/preferences/${unsubscribeToken}`;
          }

          // Build replacement data for SES template
          // IMPORTANT: Only include non-empty values!
          // SES Handlebars treats empty strings as truthy, so {{#if firstName}}
          // would be true even with firstName: "". Omitting the key entirely
          // makes {{#if firstName}} false, allowing fallbacks to work.
          const replacementData: Record<string, string> = {};

          // Helper to add non-empty values
          const addIfPresent = (
            key: string,
            value: string | null | undefined
          ) => {
            if (value) {
              replacementData[key] = value;
            }
          };

          // Always include email (required)
          replacementData.email = recipient.email!;
          replacementData.contactEmail = recipient.email!;

          // Short names (for templates using {{firstName}})
          addIfPresent("firstName", recipient.firstName);
          addIfPresent("lastName", recipient.lastName);
          addIfPresent("company", recipient.company);
          addIfPresent("jobTitle", recipient.jobTitle);

          // Full names with prefix (for templates using {{contact.firstName}})
          addIfPresent("contactFirstName", recipient.firstName);
          addIfPresent("contactLastName", recipient.lastName);
          addIfPresent("contactCompany", recipient.company);
          addIfPresent("contactJobTitle", recipient.jobTitle);

          // Organization and URLs
          addIfPresent("organizationName", orgName);
          addIfPresent("unsubscribeUrl", unsubscribeUrl);
          addIfPresent("preferencesUrl", preferencesUrl);

          // Add custom properties with flattened names (only non-empty)
          if (recipient.properties) {
            for (const [key, value] of Object.entries(recipient.properties)) {
              const strValue = value != null ? String(value) : null;
              if (strValue) {
                replacementData[key] = strValue;
                const flatKey = `contactProperties${key.charAt(0).toUpperCase()}${key.slice(1)}`;
                replacementData[flatKey] = strValue;
              }
            }
          }

          // Apply user-configured variable mappings
          const finalData = applyVariableMappings(
            replacementData,
            batch.variableMappings ?? undefined,
            recipient
          );

          const entry: BulkEmailEntry = {
            Destination: {
              ToAddresses: [recipient.email!],
            },
            ReplacementEmailContent: {
              ReplacementTemplate: {
                ReplacementTemplateData: JSON.stringify(finalData),
              },
            },
          };

          // Add List-Unsubscribe headers for marketing emails (RFC 8058)
          if (isMarketing && unsubscribeUrl) {
            entry.ReplacementHeaders = [
              {
                Name: "List-Unsubscribe",
                Value: `<${unsubscribeUrl}>`,
              },
              {
                Name: "List-Unsubscribe-Post",
                Value: "List-Unsubscribe=One-Click",
              },
            ];
          }

          return entry;
        })
      );

      // Build default template data (required by SES as fallback)
      const defaultTemplateData: Record<string, string> = {
        email: "",
        firstName: "",
        lastName: "",
        company: "",
        jobTitle: "",
        contactEmail: "",
        contactFirstName: "",
        contactLastName: "",
        contactCompany: "",
        contactJobTitle: "",
        organizationName: orgName ?? "",
        unsubscribeUrl: "",
        preferencesUrl: "",
      };

      try {
        const result = await sesClient.send(
          new SendBulkEmailCommand({
            FromEmailAddress: fromDisplay,
            ReplyToAddresses: batch.replyTo ? [batch.replyTo] : undefined,
            DefaultContent: {
              Template: {
                TemplateName: sesTemplateName,
                TemplateData: JSON.stringify(defaultTemplateData),
              },
            },
            BulkEmailEntries: bulkEntries,
            ConfigurationSetName: "wraps-email-tracking",
            // Message tags for tracking in CloudWatch and EventBridge
            DefaultEmailTags: [
              { Name: "batchId", Value: batchId },
              { Name: "organizationId", Value: organizationId },
              ...(batch.emailTemplateId
                ? [{ Name: "templateId", Value: batch.emailTemplateId }]
                : []),
              { Name: "source", Value: "broadcast" },
            ],
          })
        );

        // Collect all send records for batch insert
        const sendRecords: (typeof messageSend.$inferInsert)[] = [];
        for (let j = 0; j < recipientBatch.length; j++) {
          const recipient = recipientBatch[j];
          const bulkResult = result.BulkEmailEntryResults?.[j];

          if (bulkResult?.Status === "SUCCESS") {
            sendRecords.push({
              organizationId,
              contactId: recipient.id,
              awsAccountId,
              channel: "email",
              batchSendId: batchId,
              sourceType: "batch",
              recipient: recipient.email!,
              subject: batch.subject,
              from: batch.from,
              fromName: batch.fromName,
              emailTemplateId: batch.emailTemplateId,
              messageId: bulkResult.MessageId ?? "",
              status: "sent",
              sentAt: new Date(),
            });
            sent++;
          } else {
            log.error("Bulk send failed for recipient", bulkResult?.Error, {
              email: recipient.email,
              batchId,
              organizationId,
            });
            sendRecords.push({
              organizationId,
              contactId: recipient.id,
              awsAccountId,
              channel: "email",
              batchSendId: batchId,
              sourceType: "batch",
              recipient: recipient.email!,
              subject: batch.subject,
              from: batch.from,
              fromName: batch.fromName,
              emailTemplateId: batch.emailTemplateId,
              status: "failed",
              error: bulkResult?.Error ?? "Unknown error",
            });
            failed++;
          }
        }

        // Batch insert all send records
        if (sendRecords.length > 0) {
          await db.insert(messageSend).values(sendRecords);
        }
      } catch (error) {
        // Check if this is a throttle error
        const isThrottle =
          error instanceof Error &&
          (error.name === "Throttling" ||
            error.name === "TooManyRequestsException" ||
            error.message.includes("rate exceeded"));

        if (isThrottle) {
          // Re-queue this chunk with a longer delay (30 seconds)
          log.warn("SES throttled, requeuing chunk with delay", {
            batchId,
            chunkIndex,
            delaySeconds: 30,
          });
          await enqueueNextChunk(
            { ...job }, // Same job, same chunkIndex
            { delaySeconds: 30 }
          );
          return; // Exit early, will retry later
        }

        // Permission error: fail fast with actionable message
        const isPermission =
          error instanceof Error &&
          (error.name === "AccessDeniedException" ||
            error.name === "AccessDenied" ||
            error.message.includes("is not authorized to perform") ||
            error.message.includes("AccessDenied"));

        if (isPermission) {
          const permError =
            "Your IAM role does not have permission to send emails. " +
            "Fix: update your CloudFormation stack to the latest version, " +
            "or run `wraps platform update-role` in the CLI.";
          log.error("Bulk send permission denied", error, {
            batchId,
            organizationId,
          });
          const failedRecords = recipientBatch.map((recipient) => ({
            organizationId,
            contactId: recipient.id,
            awsAccountId,
            channel: "email" as const,
            batchSendId: batchId,
            sourceType: "batch" as const,
            recipient: recipient.email ?? "",
            subject: batch.subject,
            from: batch.from,
            fromName: batch.fromName,
            emailTemplateId: batch.emailTemplateId,
            status: "failed" as const,
            error: permError,
          }));
          await db.insert(messageSend).values(failedRecords);
          throw new Error(permError);
        }

        // Non-throttle error: mark recipients as failed
        log.error("Bulk send failed for chunk", error, {
          batchId,
          chunkOffset: i,
          organizationId,
        });
        const errorMessage =
          error instanceof Error ? error.message : "Bulk send failed";
        const failedRecords = recipientBatch.map((recipient) => ({
          organizationId,
          contactId: recipient.id,
          awsAccountId,
          channel: "email" as const,
          batchSendId: batchId,
          sourceType: "batch" as const,
          recipient: recipient.email ?? "",
          subject: batch.subject,
          from: batch.from,
          fromName: batch.fromName,
          emailTemplateId: batch.emailTemplateId,
          status: "failed" as const,
          error: errorMessage,
        }));
        await db.insert(messageSend).values(failedRecords);
        failed += recipientBatch.length;
      }
    }
  } else {
    // Fallback: individual sends for raw HTML (parallel with concurrency limit)
    // Transform variables to SES format as a safety net
    // Note: templateHtml (from compiledHtml) should already be transformed by publish
    // but batch.htmlContent might contain untransformed variables
    const rawHtml =
      templateHtml ?? batch.htmlContent ?? "<p>Hello from Wraps!</p>";
    const html = transformVariablesForSes(rawHtml);
    const subject = batch.subject ?? "Message from Wraps";
    const CONCURRENCY = 10;

    for (let i = 0; i < emailContacts.length; i += CONCURRENCY) {
      const recipientBatch = emailContacts.slice(i, i + CONCURRENCY);

      const results = await Promise.allSettled(
        recipientBatch.map(async (recipient) => {
          // Generate unsubscribe URLs for marketing emails
          let unsubscribeUrl: string | undefined;

          if (isMarketing) {
            const unsubscribeToken = await generateUnsubscribeToken(
              recipient.id,
              organizationId
            );
            unsubscribeUrl = `${apiBaseUrl}/unsubscribe/${unsubscribeToken}`;
          }

          // Build headers for marketing emails (RFC 8058)
          const headers: Array<{ Name: string; Value: string }> = [];
          if (isMarketing && unsubscribeUrl) {
            headers.push(
              { Name: "List-Unsubscribe", Value: `<${unsubscribeUrl}>` },
              {
                Name: "List-Unsubscribe-Post",
                Value: "List-Unsubscribe=One-Click",
              }
            );
          }

          const result = await sesClient.send(
            new SendEmailCommand({
              FromEmailAddress: fromDisplay,
              ReplyToAddresses: batch.replyTo ? [batch.replyTo] : undefined,
              Destination: {
                ToAddresses: [recipient.email!],
              },
              Content: {
                Simple: {
                  Subject: { Data: subject },
                  Body: {
                    Html: { Data: html },
                    Text: { Data: htmlToPlainText(html) },
                  },
                  Headers: headers.length > 0 ? headers : undefined,
                },
              },
              ConfigurationSetName: "wraps-email-tracking",
              // Message tags for tracking in CloudWatch and EventBridge
              EmailTags: [
                { Name: "batchId", Value: batchId },
                { Name: "organizationId", Value: organizationId },
                ...(batch.emailTemplateId
                  ? [{ Name: "templateId", Value: batch.emailTemplateId }]
                  : []),
                { Name: "source", Value: "broadcast" },
              ],
            })
          );

          return { recipient, messageId: result.MessageId };
        })
      );

      // Collect send records for batch insert
      const sendRecords: (typeof messageSend.$inferInsert)[] = [];
      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        const recipient = recipientBatch[j];

        if (result.status === "fulfilled") {
          sendRecords.push({
            organizationId,
            contactId: recipient.id,
            awsAccountId,
            channel: "email",
            batchSendId: batchId,
            sourceType: "batch",
            recipient: recipient.email!,
            subject: batch.subject,
            from: batch.from,
            fromName: batch.fromName,
            emailTemplateId: batch.emailTemplateId,
            messageId: result.value.messageId ?? "",
            status: "sent",
            sentAt: new Date(),
          });
          sent++;
        } else {
          log.error("Individual send failed", result.reason, {
            email: recipient.email,
            batchId,
            organizationId,
          });
          sendRecords.push({
            organizationId,
            contactId: recipient.id,
            awsAccountId,
            channel: "email",
            batchSendId: batchId,
            sourceType: "batch",
            recipient: recipient.email!,
            subject: batch.subject,
            from: batch.from,
            fromName: batch.fromName,
            emailTemplateId: batch.emailTemplateId,
            status: "failed",
            error:
              result.reason instanceof Error
                ? result.reason.message
                : "Send failed",
          });
          failed++;
        }
      }

      // Batch insert all send records
      if (sendRecords.length > 0) {
        await db.insert(messageSend).values(sendRecords);
      }
    }
  }

  // Track first email sent
  if (sent > 0) {
    await trackFirstEmailSent(organizationId, {
      channel: "email",
      source: "broadcast",
    }).catch((err) =>
      log.error("Activation tracking failed", err, { organizationId })
    );
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

  // Build cursor from last contact for next chunk
  const lastContact = contacts.at(-1);
  const nextCursor = lastContact
    ? { createdAt: lastContact.createdAt.toISOString(), id: lastContact.id }
    : undefined;

  const shouldEnqueueNextChunk =
    contacts.length === Math.min(CHUNK_SIZE, remainingRecipients) &&
    batch.processedRecipients + contacts.length < batch.totalRecipients;
  if (shouldEnqueueNextChunk) {
    await enqueueNextChunk(
      { ...job, chunkIndex: chunkIndex + 1, cursor: nextCursor },
      { delaySeconds: rateLimitDelay }
    );
  } else {
    // Short chunk means we've reached the end — mark batch completed
    await db
      .update(batchSend)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(batchSend.id, batchId));
  }
}

type ContactChunk = {
  id: string;
  email: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  jobTitle: string | null;
  properties: Record<string, unknown>;
  createdAt: Date;
};

type RecipientFilter = {
  audienceType?: "all" | "topic" | "segment";
  topicId?: string;
  segmentId?: string;
};

export type BatchCursor = { createdAt: string; id: string };

export async function getContactsChunk(
  organizationId: string,
  channel: string,
  limit: number,
  filter?: RecipientFilter,
  cursor?: BatchCursor
): Promise<ContactChunk[]> {
  const conditions: (ReturnType<typeof eq> | ReturnType<typeof sql>)[] = [
    eq(contact.organizationId, organizationId),
  ];

  if (channel === "email") {
    conditions.push(isNotNull(contact.email));
    conditions.push(
      sql`(${contact.emailStatus} = 'active' OR ${contact.emailStatus} IS NULL)`
    );
  } else if (channel === "sms") {
    conditions.push(isNotNull(contact.phone));
    conditions.push(eq(contact.smsStatus, "opted_in"));
  } else {
    return [];
  }

  // Apply recipient filter
  if (filter?.audienceType === "topic" && filter.topicId) {
    const topicSubquery = db
      .select({ contactId: contactTopic.contactId })
      .from(contactTopic)
      .where(
        and(
          eq(contactTopic.contactId, contact.id),
          eq(contactTopic.topicId, filter.topicId),
          eq(contactTopic.status, "subscribed")
        )
      );
    conditions.push(exists(topicSubquery));
  }

  if (filter?.audienceType === "segment" && filter.segmentId) {
    const [segmentRow] = await db
      .select({ id: segment.id, condition: segment.condition })
      .from(segment)
      .where(
        and(
          eq(segment.id, filter.segmentId),
          eq(segment.organizationId, organizationId)
        )
      );

    if (!segmentRow) {
      log.warn("Segment not found for batch send", {
        segmentId: filter.segmentId,
        organizationId,
      });
      return [];
    }

    const segmentSQL = buildConditionSQL(segmentRow.condition);
    if (segmentSQL) {
      conditions.push(segmentSQL);
    }
  }

  // Cursor-based (keyset) pagination: skip contacts at or before the cursor
  // position instead of using OFFSET, which breaks when contacts are
  // added/deleted between chunks.
  if (cursor) {
    conditions.push(
      sql`(${contact.createdAt}, ${contact.id}) > (${new Date(cursor.createdAt)}, ${cursor.id})`
    );
  }

  return db
    .select({
      id: contact.id,
      email: contact.email,
      phone: contact.phone,
      firstName: contact.firstName,
      lastName: contact.lastName,
      company: contact.company,
      jobTitle: contact.jobTitle,
      properties: contact.properties,
      createdAt: contact.createdAt,
    })
    .from(contact)
    .where(and(...(conditions as Parameters<typeof and>)))
    .orderBy(contact.createdAt, contact.id)
    .limit(limit);
}

/**
 * Convert HTML to plain text for email fallback
 * Uses react-email's toPlainText for robust HTML-to-text conversion
 */
function htmlToPlainText(html: string): string {
  return toPlainText(html);
}

async function enqueueNextChunk(
  job: BatchJob,
  options?: { delaySeconds?: number }
): Promise<void> {
  if (!QUEUE_URL) {
    throw new Error("BATCH_QUEUE_URL not configured");
  }

  const sqsClient = new SQSClient(awsDefaults);
  await sqsClient.send(
    new SendMessageCommand({
      QueueUrl: QUEUE_URL,
      MessageBody: JSON.stringify(job),
      // SQS delay for rate limiting (max 900 seconds)
      DelaySeconds: options?.delaySeconds
        ? Math.min(options.delaySeconds, 900)
        : undefined,
    })
  );
}
