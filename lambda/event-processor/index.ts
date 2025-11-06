import { SNSEvent } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const TABLE_NAME = process.env.TABLE_NAME || 'byo-email-history';

/**
 * Lambda handler for processing SES email events (bounces, complaints, deliveries)
 */
export async function handler(event: SNSEvent) {
  console.log('Received SNS event:', JSON.stringify(event, null, 2));

  for (const record of event.Records) {
    try {
      const message = JSON.parse(record.Sns.Message);
      const messageType = message.notificationType || message.eventType;

      console.log('Processing message:', messageType, message);

      // Store the event in DynamoDB
      await docClient.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            messageId: message.mail?.messageId || `event-${Date.now()}`,
            sentAt: Date.now(),
            accountId: record.EventSubscriptionArn?.split(':')[4] || 'unknown',
            eventType: messageType,
            timestamp: message.mail?.timestamp || new Date().toISOString(),
            source: message.mail?.source,
            destination: message.mail?.destination,
            subject: message.mail?.commonHeaders?.subject,
            bounceType: message.bounce?.bounceType,
            bounceSubType: message.bounce?.bounceSubType,
            complaintFeedbackType: message.complaint?.complaintFeedbackType,
            deliveryTimestamp: message.delivery?.timestamp,
            processingTimeMillis: message.delivery?.processingTimeMillis,
            recipients: message.bounce?.bouncedRecipients ||
              message.complaint?.complainedRecipients ||
              message.delivery?.recipients || [],
            rawEvent: message,
            expiresAt: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60, // 90 days TTL
          },
        })
      );

      console.log('Event stored successfully:', messageType);
    } catch (error) {
      console.error('Error processing record:', error);
      console.error('Record:', JSON.stringify(record, null, 2));
      // Don't throw - continue processing other records
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'Events processed successfully' }),
  };
}
