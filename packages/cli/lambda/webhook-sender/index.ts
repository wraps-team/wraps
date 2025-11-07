import type { SNSEvent } from "aws-lambda";

/**
 * Lambda handler for sending webhooks for SES events
 * This is called after event-processor stores the event
 */
export async function handler(event: SNSEvent) {
  console.log(
    "Sending webhooks for SES event:",
    JSON.stringify(event, null, 2)
  );

  const webhookUrl = process.env.WEBHOOK_URL;
  if (!webhookUrl) {
    console.log("No WEBHOOK_URL configured, skipping webhook delivery");
    return {
      statusCode: 200,
      body: JSON.stringify({ message: "No webhook URL configured" }),
    };
  }

  for (const record of event.Records) {
    try {
      const message = JSON.parse(record.Sns.Message);
      const eventType = message.eventType || message.notificationType;

      // Prepare webhook payload
      const payload = {
        event: eventType,
        messageId: message.mail?.messageId,
        timestamp: message.mail?.timestamp,
        source: message.mail?.source,
        destination: message.mail?.destination,
        subject: message.mail?.commonHeaders?.subject,
        data: message,
      };

      // Send webhook
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "BYO-Webhook/1.0",
          "X-BYO-Event": eventType,
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        console.log(`Webhook delivered successfully for ${eventType} event`);
      } else {
        console.error(
          `Webhook delivery failed: ${response.status} ${response.statusText}`
        );
      }
    } catch (error) {
      console.error("Error sending webhook:", error);
      console.error("Record:", JSON.stringify(record, null, 2));
      // Don't throw - continue processing other records
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ message: "Webhooks sent successfully" }),
  };
}
