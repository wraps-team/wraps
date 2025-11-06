import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { SNSEvent } from 'aws-lambda';

const dynamodb = new DynamoDBClient({});

/**
 * Lambda handler for processing SES events from SNS
 * Stores all SES events (send, delivery, bounce, complaint, open, click) in DynamoDB
 */
export async function handler(event: SNSEvent) {
  console.log('Processing SES event:', JSON.stringify(event, null, 2));

  const tableName = process.env.TABLE_NAME;
  if (!tableName) {
    throw new Error('TABLE_NAME environment variable not set');
  }

  for (const record of event.Records) {
    try {
      const message = JSON.parse(record.Sns.Message);
      const eventType = message.eventType || message.notificationType;

      // Extract email details
      const mail = message.mail;
      const messageId = mail.messageId;
      const timestamp = new Date(mail.timestamp).getTime();
      const from = mail.source;
      const to = mail.destination;
      const subject = mail.commonHeaders?.subject || '';

      // Extract additional data based on event type
      let additionalData: Record<string, any> = {};

      if (eventType === 'Open' && message.open) {
        additionalData = {
          userAgent: message.open.userAgent,
          ipAddress: message.open.ipAddress,
        };
      } else if (eventType === 'Click' && message.click) {
        additionalData = {
          link: message.click.link,
          userAgent: message.click.userAgent,
          ipAddress: message.click.ipAddress,
        };
      } else if (eventType === 'Bounce' && message.bounce) {
        additionalData = {
          bounceType: message.bounce.bounceType,
          bounceSubType: message.bounce.bounceSubType,
        };
      } else if (eventType === 'Complaint' && message.complaint) {
        additionalData = {
          complaintFeedbackType: message.complaint.complaintFeedbackType,
        };
      }

      // Store event in DynamoDB
      await dynamodb.send(
        new PutItemCommand({
          TableName: tableName,
          Item: {
            messageId: { S: messageId },
            sentAt: { N: timestamp.toString() },
            accountId: { S: process.env.AWS_ACCOUNT_ID || 'unknown' },
            from: { S: from },
            to: { SS: to },
            subject: { S: subject },
            eventType: { S: eventType },
            eventData: { S: JSON.stringify(message) },
            additionalData: { S: JSON.stringify(additionalData) },
            createdAt: { N: Date.now().toString() },
            expiresAt: { N: (Date.now() + 90 * 24 * 60 * 60 * 1000).toString() }, // 90 days TTL
          },
        })
      );

      console.log(`Stored ${eventType} event for message ${messageId}`, additionalData);
    } catch (error) {
      console.error('Error processing SNS record:', error);
      console.error('Record:', JSON.stringify(record, null, 2));
      // Don't throw - continue processing other records
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'Events processed successfully' }),
  };
}
