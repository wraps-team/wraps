import { SNSEvent } from 'aws-lambda';

const WEBHOOK_URL = process.env.WEBHOOK_URL || '';

/**
 * Lambda handler for forwarding email events to a webhook endpoint
 */
export async function handler(event: SNSEvent) {
  console.log('Received SNS event for webhook:', JSON.stringify(event, null, 2));

  if (!WEBHOOK_URL) {
    console.log('No webhook URL configured, skipping');
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'No webhook URL configured' }),
    };
  }

  const results = [];

  for (const record of event.Records) {
    try {
      const message = JSON.parse(record.Sns.Message);
      const messageType = message.notificationType || message.eventType;

      console.log('Forwarding to webhook:', messageType);

      // Send to webhook
      const response = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'BYO-Email-Webhook/1.0',
          'X-BYO-Event-Type': messageType,
        },
        body: JSON.stringify({
          eventType: messageType,
          timestamp: new Date().toISOString(),
          messageId: message.mail?.messageId,
          source: message.mail?.source,
          destination: message.mail?.destination,
          subject: message.mail?.commonHeaders?.subject,
          bounce: message.bounce,
          complaint: message.complaint,
          delivery: message.delivery,
          rawMessage: message,
        }),
      });

      if (!response.ok) {
        console.error('Webhook request failed:', response.status, response.statusText);
        results.push({
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
        });
      } else {
        console.log('Webhook request successful:', response.status);
        results.push({ success: true });
      }
    } catch (error) {
      console.error('Error forwarding to webhook:', error);
      results.push({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
      // Don't throw - continue processing other records
    }
  }

  const failedCount = results.filter((r) => !r.success).length;

  return {
    statusCode: failedCount > 0 ? 207 : 200, // 207 Multi-Status if some failed
    body: JSON.stringify({
      message: 'Webhook processing complete',
      total: results.length,
      successful: results.length - failedCount,
      failed: failedCount,
      results,
    }),
  };
}
