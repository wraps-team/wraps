import { randomUUID } from "node:crypto";
import {
  DynamoDBClient,
  PutItemCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import type { Context, SQSEvent } from "aws-lambda";

const awsDefaults = {
  requestHandler: new NodeHttpHandler({
    requestTimeout: 10_000,
    connectionTimeout: 5000,
  }),
  maxAttempts: 5,
};

const dynamodb = new DynamoDBClient(awsDefaults);

type LedgerEntry = {
  reason: "bounce" | "complaint" | "validation";
  detail?: string;
};

/** Which SES events write a suppression-history item, and with what reason. */
export function ledgerEntryFor(message: {
  eventType?: string;
  notificationType?: string;
  bounce?: { bounceType?: string; bounceSubType?: string };
  complaint?: { complaintFeedbackType?: string };
}): LedgerEntry | null {
  const type = message.eventType || message.notificationType;
  if (type === "Bounce" && message.bounce) {
    const sub = message.bounce.bounceSubType;
    if (sub === "EmailValidationSuppressed") {
      return { reason: "validation", detail: sub };
    }
    if (sub === "Suppressed" || sub === "OnAccountSuppressionList") {
      return { reason: "bounce", detail: sub };
    }
    if (message.bounce.bounceType === "Permanent") {
      return { reason: "bounce", detail: sub };
    }
    return null;
  }
  if (type === "Complaint" && message.complaint) {
    return {
      reason: "complaint",
      detail: message.complaint.complaintFeedbackType,
    };
  }
  return null;
}

export function recipientEmails(recipients: unknown): string[] {
  if (!Array.isArray(recipients)) return [];
  return recipients
    .map((r) =>
      r && typeof r === "object"
        ? (r as { emailAddress?: unknown }).emailAddress
        : undefined
    )
    .filter((e): e is string => typeof e === "string")
    .map((e) => e.toLowerCase().trim())
    .filter((e) => e.length > 0);
}

/**
 * Lambda handler for processing SES events from SQS (via EventBridge)
 * Stores all SES events in DynamoDB:
 * - Send: Email sent from SES
 * - Delivery: Email delivered to recipient
 * - Open: Email opened by recipient
 * - Click: Link clicked in email
 * - Bounce: Email bounced (permanent or transient)
 * - Suppressed: Email blocked due to recipient on suppression list
 * - Complaint: Recipient marked email as spam
 * - Reject: Email rejected before sending
 * - Rendering Failure: Template rendering failed
 * - DeliveryDelay: Temporary delivery delay
 * - Subscription: Recipient unsubscribed/changed preferences
 */
export async function handler(event: SQSEvent, context: Context) {
  const requestId = context.awsRequestId;
  const batchId = randomUUID().slice(0, 8);

  const log = (msg: string, data?: Record<string, unknown>) => {
    console.info(JSON.stringify({ requestId, batchId, msg, ...data }));
  };
  const logError = (
    msg: string,
    error: unknown,
    data?: Record<string, unknown>
  ) => {
    console.error(
      JSON.stringify({ requestId, batchId, msg, error: String(error), ...data })
    );
  };

  log("Processing SES batch", { recordCount: event.Records.length });

  const tableName = process.env.TABLE_NAME;
  if (!tableName) {
    throw new Error("TABLE_NAME environment variable not set");
  }

  // Get retention days from environment, default to 90
  const retentionDays = Number.parseInt(process.env.RETENTION_DAYS || "90", 10);

  for (const record of event.Records) {
    try {
      // Parse the SQS message body (which contains the EventBridge event)
      const eventBridgeEvent = JSON.parse(record.body);

      // The actual SES event is in the 'detail' field of the EventBridge event
      const message = eventBridgeEvent.detail;
      let eventType = message.eventType || message.notificationType;

      // Extract email details
      const mail = message.mail;
      const messageId = mail.messageId;
      const mailTimestamp = new Date(mail.timestamp).getTime();
      const from = mail.source;
      const to = mail.destination || [];
      const subject = mail.commonHeaders?.subject || "";

      log("Processing email event", {
        messageId,
        eventType,
        recipientCount: to.length,
      });

      // Extract additional data and event-specific timestamp based on event type
      let additionalData: Record<string, unknown> = {};
      let eventTimestamp = mailTimestamp; // Default to mail timestamp

      if (eventType === "Send" && message.send) {
        // Send event uses mail timestamp
        additionalData = {
          tags: mail.tags || {},
        };
      } else if (eventType === "Delivery" && message.delivery) {
        eventTimestamp = new Date(message.delivery.timestamp).getTime();
        additionalData = {
          timestamp: message.delivery.timestamp,
          processingTimeMillis: message.delivery.processingTimeMillis,
          recipients: message.delivery.recipients,
          smtpResponse: message.delivery.smtpResponse,
          remoteMtaIp: message.delivery.remoteMtaIp,
        };
      } else if (eventType === "Open" && message.open) {
        eventTimestamp = new Date(message.open.timestamp).getTime();
        additionalData = {
          timestamp: message.open.timestamp,
          userAgent: message.open.userAgent,
          ipAddress: message.open.ipAddress,
        };
      } else if (eventType === "Click" && message.click) {
        eventTimestamp = new Date(message.click.timestamp).getTime();
        additionalData = {
          timestamp: message.click.timestamp,
          link: message.click.link,
          linkTags: message.click.linkTags || {},
          userAgent: message.click.userAgent,
          ipAddress: message.click.ipAddress,
        };
      } else if (eventType === "Bounce" && message.bounce) {
        const bounceSubType = message.bounce.bounceSubType;

        // Treat suppression as a distinct event type, not a bounce
        // SES sends suppressions as bounces with bounceSubType of "Suppressed" or "OnAccountSuppressionList"
        if (
          bounceSubType === "Suppressed" ||
          bounceSubType === "OnAccountSuppressionList"
        ) {
          eventType = "Suppressed";
          eventTimestamp = new Date(message.bounce.timestamp).getTime();
          additionalData = {
            reason: bounceSubType,
            suppressedRecipients: message.bounce.bouncedRecipients,
            timestamp: message.bounce.timestamp,
            feedbackId: message.bounce.feedbackId,
          };
        } else {
          // Regular bounce handling
          eventTimestamp = new Date(message.bounce.timestamp).getTime();
          additionalData = {
            bounceType: message.bounce.bounceType,
            bounceSubType: message.bounce.bounceSubType,
            bouncedRecipients: message.bounce.bouncedRecipients,
            timestamp: message.bounce.timestamp,
            feedbackId: message.bounce.feedbackId,
          };
        }
      } else if (eventType === "Complaint" && message.complaint) {
        eventTimestamp = new Date(message.complaint.timestamp).getTime();
        additionalData = {
          complainedRecipients: message.complaint.complainedRecipients,
          timestamp: message.complaint.timestamp,
          feedbackId: message.complaint.feedbackId,
          complaintFeedbackType: message.complaint.complaintFeedbackType,
          userAgent: message.complaint.userAgent,
        };
      } else if (eventType === "Reject" && message.reject) {
        // Reject doesn't have a specific timestamp, use mail timestamp
        additionalData = {
          reason: message.reject.reason,
        };
      } else if (eventType === "Rendering Failure" && message.failure) {
        // Rendering failure doesn't have a specific timestamp, use mail timestamp
        additionalData = {
          errorMessage: message.failure.errorMessage,
          templateName: message.failure.templateName,
        };
      } else if (eventType === "DeliveryDelay" && message.deliveryDelay) {
        eventTimestamp = new Date(message.deliveryDelay.timestamp).getTime();
        additionalData = {
          timestamp: message.deliveryDelay.timestamp,
          delayType: message.deliveryDelay.delayType,
          expirationTime: message.deliveryDelay.expirationTime,
          delayedRecipients: message.deliveryDelay.delayedRecipients,
        };
      } else if (eventType === "Subscription" && message.subscription) {
        eventTimestamp = new Date(message.subscription.timestamp).getTime();
        additionalData = {
          contactList: message.subscription.contactList,
          timestamp: message.subscription.timestamp,
          source: message.subscription.source,
          newTopicPreferences: message.subscription.newTopicPreferences,
          oldTopicPreferences: message.subscription.oldTopicPreferences,
        };
      }

      // Calculate TTL based on retention days (0 or negative means no TTL)
      const expiresAt =
        retentionDays > 0
          ? Date.now() + retentionDays * 24 * 60 * 60 * 1000
          : Date.now() + 365 * 24 * 60 * 60 * 1000; // Default 1 year if not specified

      // Store event in DynamoDB
      // Use eventTimestamp as sort key to ensure each event type creates a unique record
      // mailSentAt preserves the original mail send time for display (sentAt is the event timestamp for DynamoDB key uniqueness)
      // Note: DynamoDB String Sets (SS) cannot be empty, so we use a List (L) for recipients
      await dynamodb.send(
        new PutItemCommand({
          TableName: tableName,
          Item: {
            messageId: { S: messageId },
            sentAt: { N: eventTimestamp.toString() },
            mailSentAt: { N: mailTimestamp.toString() },
            accountId: { S: process.env.AWS_ACCOUNT_ID || "unknown" },
            from: { S: from },
            to: { L: to.map((email: string) => ({ S: email })) },
            subject: { S: subject },
            eventType: { S: eventType },
            eventData: { S: JSON.stringify(message) },
            additionalData: { S: JSON.stringify(additionalData) },
            createdAt: { N: Date.now().toString() },
            expiresAt: { N: expiresAt.toString() },
          },
        })
      );

      log("Stored event", { eventType, messageId });

      const ledger = ledgerEntryFor(message);
      if (ledger) {
        const recipients = recipientEmails(
          ledger.reason === "complaint"
            ? message.complaint?.complainedRecipients
            : message.bounce?.bouncedRecipients
        );
        const feedbackId: string | undefined =
          message.bounce?.feedbackId || message.complaint?.feedbackId;
        if (recipients.length === 0) {
          log("No recipients for suppression ledger", {
            messageId,
            reason: ledger.reason,
          });
        }
        for (const email of recipients) {
          try {
            await dynamodb.send(
              new UpdateItemCommand({
                TableName: tableName,
                Key: {
                  messageId: { S: `SUPPRESSION#${email}` },
                  sentAt: { N: "0" },
                },
                UpdateExpression:
                  "SET #et = :et, #em = :em, #r = :r, #src = :src, #sa = :sa, " +
                  "#fsa = if_not_exists(#fsa, :sa)" +
                  (ledger.detail ? ", #d = :d" : "") +
                  (feedbackId ? ", #fid = :fid" : ""),
                ExpressionAttributeNames: {
                  "#et": "eventType",
                  "#em": "email",
                  "#r": "reason",
                  "#src": "source",
                  "#sa": "suppressedAt",
                  "#fsa": "firstSuppressedAt",
                  ...(ledger.detail ? { "#d": "detail" } : {}),
                  ...(feedbackId ? { "#fid": "feedbackId" } : {}),
                },
                ExpressionAttributeValues: {
                  ":et": { S: "Suppressed" },
                  ":em": { S: email },
                  ":r": { S: ledger.reason },
                  ":src": { S: "ses_event" },
                  ":sa": { N: eventTimestamp.toString() },
                  ...(ledger.detail ? { ":d": { S: ledger.detail } } : {}),
                  ...(feedbackId ? { ":fid": { S: feedbackId } } : {}),
                },
              })
            );
            log("Recorded suppression ledger entry", {
              messageId,
              reason: ledger.reason,
            });
          } catch (error) {
            // Ledger write must never abort the SQS batch or skip other recipients.
            logError("Error recording suppression ledger entry", error, {
              messageId,
              reason: ledger.reason,
            });
          }
        }
      }
    } catch (error) {
      logError("Error processing record", error, {
        sqsMessageId: record.messageId,
      });
      // Don't throw - continue processing other records
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ message: "Events processed successfully" }),
  };
}
