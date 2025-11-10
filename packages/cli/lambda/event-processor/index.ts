import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import type { SQSEvent } from "aws-lambda";

const dynamodb = new DynamoDBClient({});

/**
 * Lambda handler for processing SES events from SQS (via EventBridge)
 * Stores all SES events in DynamoDB:
 * - Send: Email sent from SES
 * - Delivery: Email delivered to recipient
 * - Open: Email opened by recipient
 * - Click: Link clicked in email
 * - Bounce: Email bounced (permanent or transient)
 * - Complaint: Recipient marked email as spam
 * - Reject: Email rejected before sending
 * - Rendering Failure: Template rendering failed
 * - DeliveryDelay: Temporary delivery delay
 * - Subscription: Recipient unsubscribed/changed preferences
 */
export async function handler(event: SQSEvent) {
  console.log("Processing SES event from SQS:", JSON.stringify(event, null, 2));

  const tableName = process.env.TABLE_NAME;
  if (!tableName) {
    throw new Error("TABLE_NAME environment variable not set");
  }

  for (const record of event.Records) {
    try {
      // Parse the SQS message body (which contains the EventBridge event)
      const eventBridgeEvent = JSON.parse(record.body);

      // The actual SES event is in the 'detail' field of the EventBridge event
      const message = eventBridgeEvent.detail;
      const eventType = message.eventType || message.notificationType;

      // Extract email details
      const mail = message.mail;
      const messageId = mail.messageId;
      const timestamp = new Date(mail.timestamp).getTime();
      const from = mail.source;
      const to = mail.destination;
      const subject = mail.commonHeaders?.subject || "";

      // Extract additional data based on event type
      let additionalData: Record<string, unknown> = {};

      if (eventType === "Send" && message.send) {
        additionalData = {
          tags: mail.tags || {},
        };
      } else if (eventType === "Delivery" && message.delivery) {
        additionalData = {
          timestamp: message.delivery.timestamp,
          processingTimeMillis: message.delivery.processingTimeMillis,
          recipients: message.delivery.recipients,
          smtpResponse: message.delivery.smtpResponse,
          remoteMtaIp: message.delivery.remoteMtaIp,
        };
      } else if (eventType === "Open" && message.open) {
        additionalData = {
          timestamp: message.open.timestamp,
          userAgent: message.open.userAgent,
          ipAddress: message.open.ipAddress,
        };
      } else if (eventType === "Click" && message.click) {
        additionalData = {
          timestamp: message.click.timestamp,
          link: message.click.link,
          linkTags: message.click.linkTags || {},
          userAgent: message.click.userAgent,
          ipAddress: message.click.ipAddress,
        };
      } else if (eventType === "Bounce" && message.bounce) {
        additionalData = {
          bounceType: message.bounce.bounceType,
          bounceSubType: message.bounce.bounceSubType,
          bouncedRecipients: message.bounce.bouncedRecipients,
          timestamp: message.bounce.timestamp,
          feedbackId: message.bounce.feedbackId,
        };
      } else if (eventType === "Complaint" && message.complaint) {
        additionalData = {
          complainedRecipients: message.complaint.complainedRecipients,
          timestamp: message.complaint.timestamp,
          feedbackId: message.complaint.feedbackId,
          complaintFeedbackType: message.complaint.complaintFeedbackType,
          userAgent: message.complaint.userAgent,
        };
      } else if (eventType === "Reject" && message.reject) {
        additionalData = {
          reason: message.reject.reason,
        };
      } else if (eventType === "Rendering Failure" && message.failure) {
        additionalData = {
          errorMessage: message.failure.errorMessage,
          templateName: message.failure.templateName,
        };
      } else if (eventType === "DeliveryDelay" && message.deliveryDelay) {
        additionalData = {
          timestamp: message.deliveryDelay.timestamp,
          delayType: message.deliveryDelay.delayType,
          expirationTime: message.deliveryDelay.expirationTime,
          delayedRecipients: message.deliveryDelay.delayedRecipients,
        };
      } else if (eventType === "Subscription" && message.subscription) {
        additionalData = {
          contactList: message.subscription.contactList,
          timestamp: message.subscription.timestamp,
          source: message.subscription.source,
          newTopicPreferences: message.subscription.newTopicPreferences,
          oldTopicPreferences: message.subscription.oldTopicPreferences,
        };
      }

      // Store event in DynamoDB
      await dynamodb.send(
        new PutItemCommand({
          TableName: tableName,
          Item: {
            messageId: { S: messageId },
            sentAt: { N: timestamp.toString() },
            accountId: { S: process.env.AWS_ACCOUNT_ID || "unknown" },
            from: { S: from },
            to: { SS: to },
            subject: { S: subject },
            eventType: { S: eventType },
            eventData: { S: JSON.stringify(message) },
            additionalData: { S: JSON.stringify(additionalData) },
            createdAt: { N: Date.now().toString() },
            expiresAt: {
              N: (Date.now() + 90 * 24 * 60 * 60 * 1000).toString(),
            }, // 90 days TTL
          },
        })
      );

      console.log(
        `Stored ${eventType} event for message ${messageId}`,
        additionalData
      );
    } catch (error) {
      console.error("Error processing record:", error);
      console.error("Record:", JSON.stringify(record, null, 2));
      // Don't throw - continue processing other records
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ message: "Events processed successfully" }),
  };
}
