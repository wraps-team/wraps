import {
  DynamoDBClient,
  QueryCommand,
  ScanCommand,
} from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";

export type EmailLog = {
  messageId: string;
  to: string[]; // Array of recipients
  from: string;
  subject: string;
  status:
    | "delivered"
    | "bounced"
    | "complained"
    | "sent"
    | "failed"
    | "opened"
    | "clicked";
  sentAt: number;
  accountId?: string;
  errorMessage?: string;
};

export type EmailEvent = {
  type:
    | "sent"
    | "delivered"
    | "bounced"
    | "complained"
    | "opened"
    | "clicked"
    | "failed";
  timestamp: number;
  metadata?: Record<string, any>;
};

export type EmailDetails = {
  id: string;
  messageId: string;
  from: string;
  to: string[];
  replyTo?: string;
  subject: string;
  htmlBody?: string;
  textBody?: string;
  status:
    | "delivered"
    | "bounced"
    | "complained"
    | "sent"
    | "failed"
    | "opened"
    | "clicked";
  sentAt: number;
  events: EmailEvent[];
};

type FetchEmailLogsOptions = {
  region: string;
  tableName: string;
  accountId?: string;
  limit?: number;
  startTime?: number;
  endTime?: number;
};

/**
 * Fetch email logs from DynamoDB
 */
export async function fetchEmailLogs(
  options: FetchEmailLogsOptions
): Promise<EmailLog[]> {
  const {
    region,
    tableName,
    accountId,
    limit = 100,
    startTime,
    endTime,
  } = options;

  const dynamodb = new DynamoDBClient({ region });

  try {
    // If we have accountId, use GSI for better performance
    let items: any[] = [];
    if (accountId) {
      let keyConditionExpression = "accountId = :accountId";
      const expressionAttributeValues: Record<string, any> = {
        ":accountId": { S: accountId },
      };

      // Add time range if provided
      if (startTime && endTime) {
        keyConditionExpression += " AND sentAt BETWEEN :startTime AND :endTime";
        expressionAttributeValues[":startTime"] = { N: startTime.toString() };
        expressionAttributeValues[":endTime"] = { N: endTime.toString() };
      } else if (startTime) {
        keyConditionExpression += " AND sentAt >= :startTime";
        expressionAttributeValues[":startTime"] = { N: startTime.toString() };
      }

      const response = await dynamodb.send(
        new QueryCommand({
          TableName: tableName,
          IndexName: "accountId-sentAt-index",
          KeyConditionExpression: keyConditionExpression,
          ExpressionAttributeValues: expressionAttributeValues,
          ScanIndexForward: false, // Sort by sentAt descending (newest first)
        })
      );

      items = response.Items || [];
    } else {
      // Otherwise, scan the table (less efficient but works without accountId)
      const response = await dynamodb.send(
        new ScanCommand({
          TableName: tableName,
        })
      );

      items = response.Items || [];
    }

    // Unmarshall all items
    const unmarshalled = items.map((item) => unmarshall(item));

    // Group events by messageId to get the latest status for each email
    const emailMap = new Map<string, any>();

    for (const item of unmarshalled) {
      const messageId = item.messageId;
      const existing = emailMap.get(messageId);

      if (existing) {
        // Keep the event with the most important status
        // Priority: Complaint > Permanent Bounce > Delivery > Transient Bounce > Send
        const currentPriority = getEventPriority(item);
        const existingPriority = getEventPriority(existing);

        if (currentPriority > existingPriority) {
          emailMap.set(messageId, item);
        }
      } else {
        emailMap.set(messageId, item);
      }
    }

    // Convert map to array and normalize
    const logs = Array.from(emailMap.values())
      .map(normalizeEmailLog)
      .sort((a, b) => b.sentAt - a.sentAt);

    // Apply limit
    return logs.slice(0, limit);
  } catch (error) {
    console.error("Error fetching email logs:", error);
    throw error;
  }
}

/**
 * Get priority for event type (higher = more important to display)
 * Priority: Complaint > Permanent Bounce > Click > Open > Delivery > Transient Bounce > Send
 */
function getEventPriority(item: any): number {
  const type = item.eventType?.toLowerCase();

  switch (type) {
    case "complaint":
      return 7;
    case "bounce": {
      // Permanent bounces (hard bounces) are more important than delivery
      // Transient bounces (OOTO, mailbox full) are less important than delivery
      const bounceType = item.bounceType?.toLowerCase();
      return bounceType === "permanent" ? 6 : 2;
    }
    case "click":
      return 5;
    case "open":
      return 4;
    case "delivery":
      return 3;
    case "send":
      return 1;
    default:
      return 0;
  }
}

/**
 * Normalize email log data from DynamoDB
 */
function normalizeEmailLog(data: any): EmailLog {
  // Determine status based on eventType
  let status: EmailLog["status"] = "sent";
  const eventType = data.eventType?.toLowerCase();

  if (eventType === "complaint") {
    status = "complained";
  } else if (eventType === "bounce") {
    status = "bounced";
  } else if (eventType === "click") {
    status = "clicked";
  } else if (eventType === "open") {
    status = "opened";
  } else if (eventType === "delivery") {
    status = "delivered";
  } else if (eventType === "send") {
    status = "sent";
  } else if (data.errorMessage) {
    status = "failed";
  }

  // Handle 'to' field - it's stored as a String Set in DynamoDB
  // DynamoDB String Sets get unmarshalled as JavaScript Set objects
  let toAddresses: string[] = [];
  const toField = data.to || data.destination; // CSV export might show as 'destination'

  if (toField) {
    console.log(
      "Raw 'to' field:",
      toField,
      "Type:",
      typeof toField,
      "Constructor:",
      toField.constructor?.name
    );

    if (toField instanceof Set) {
      // DynamoDB String Set -> JavaScript Set
      toAddresses = Array.from(toField);
    } else if (Array.isArray(toField)) {
      toAddresses = toField;
    } else if (typeof toField === "string") {
      toAddresses = [toField];
    }
  }

  console.log("Normalized toAddresses:", toAddresses);

  return {
    messageId: data.messageId,
    to: toAddresses,
    from: data.from || "unknown",
    subject: data.subject || "(no subject)",
    status,
    sentAt: Number(data.sentAt),
    accountId: data.accountId,
    errorMessage: data.errorMessage,
  };
}

/**
 * Fetch email details by message ID (with all events)
 */
export async function fetchEmailById(
  messageId: string,
  options: { region: string; tableName: string }
): Promise<EmailDetails | null> {
  const { region, tableName } = options;
  const dynamodb = new DynamoDBClient({ region });

  try {
    // Query all events for this messageId
    const response = await dynamodb.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "messageId = :messageId",
        ExpressionAttributeValues: {
          ":messageId": { S: messageId },
        },
      })
    );

    const items = response.Items || [];

    if (items.length === 0) {
      return null;
    }

    // Unmarshall all events
    const events = items.map((item) => unmarshall(item));

    // Get the send event (has the email content)
    const sendEvent = events.find((e) => e.eventType?.toLowerCase() === "send");

    if (!sendEvent) {
      return null;
    }

    console.log("Send event fields:", {
      from: sendEvent.from,
      source: sendEvent.source,
      subject: sendEvent.subject,
      to: sendEvent.to,
      destination: sendEvent.destination,
      availableKeys: Object.keys(sendEvent),
    });

    // Try to extract email content from eventData
    let htmlBody: string | undefined;
    let textBody: string | undefined;

    if (sendEvent.eventData) {
      try {
        const eventData = JSON.parse(sendEvent.eventData);
        console.log("Send event data keys:", Object.keys(eventData));

        // SES doesn't include email content in events by default
        // Check if content was somehow included
        if (eventData.content) {
          htmlBody = eventData.content.html;
          textBody = eventData.content.text;
        }

        // Check mail.content (unlikely but worth trying)
        if (eventData.mail?.content) {
          htmlBody = eventData.mail.content.html;
          textBody = eventData.mail.content.text;
        }
      } catch (e) {
        console.error("Failed to parse eventData:", e);
      }
    }

    // Parse to addresses
    let toAddresses: string[] = [];
    const toField = sendEvent.to || sendEvent.destination;

    if (toField) {
      if (toField instanceof Set) {
        toAddresses = Array.from(toField);
      } else if (Array.isArray(toField)) {
        toAddresses = toField;
      } else if (typeof toField === "string") {
        toAddresses = [toField];
      }
    }

    // Determine final status (priority order: complaint > bounce > click > open > delivery > sent)
    let status: EmailDetails["status"] = "sent";
    const hasDelivery = events.some(
      (e) => e.eventType?.toLowerCase() === "delivery"
    );
    const hasBounce = events.some(
      (e) => e.eventType?.toLowerCase() === "bounce"
    );
    const hasComplaint = events.some(
      (e) => e.eventType?.toLowerCase() === "complaint"
    );
    const hasOpen = events.some((e) => e.eventType?.toLowerCase() === "open");
    const hasClick = events.some((e) => e.eventType?.toLowerCase() === "click");

    if (hasComplaint) {
      status = "complained";
    } else if (hasBounce) {
      status = "bounced";
    } else if (hasClick) {
      status = "clicked";
    } else if (hasOpen) {
      status = "opened";
    } else if (hasDelivery) {
      status = "delivered";
    }

    // Map events to simplified timeline
    const timeline: EmailEvent[] = events
      .map((event) => {
        const eventType = event.eventType?.toLowerCase();
        let type: EmailEvent["type"] = "sent";

        switch (eventType) {
          case "send":
            type = "sent";
            break;
          case "delivery":
            type = "delivered";
            break;
          case "bounce":
            type = "bounced";
            break;
          case "complaint":
            type = "complained";
            break;
          case "open":
            type = "opened";
            break;
          case "click":
            type = "clicked";
            break;
          default:
            type = "sent";
        }

        const metadata: Record<string, any> = {};

        // Add relevant metadata based on event type
        if (eventType === "bounce" && event.bounceType) {
          metadata.bounceType = event.bounceType;
          metadata.bounceSubType = event.bounceSubType;
        }

        if (eventType === "complaint" && event.complaintFeedbackType) {
          metadata.feedbackType = event.complaintFeedbackType;
        }

        if (eventType === "click" && event.link) {
          metadata.link = event.link;
        }

        if (event.userAgent) {
          metadata.userAgent = event.userAgent;
        }

        return {
          type,
          timestamp: Number(event.sentAt || event.timestamp),
          metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        };
      })
      .sort((a, b) => a.timestamp - b.timestamp);

    return {
      id: messageId,
      messageId,
      from: sendEvent.from || "unknown",
      to: toAddresses,
      replyTo: sendEvent.replyTo,
      subject: sendEvent.subject || "(no subject)",
      htmlBody: htmlBody || sendEvent.htmlBody,
      textBody: textBody || sendEvent.textBody,
      status,
      sentAt: Number(sendEvent.sentAt),
      events: timeline,
    };
  } catch (error) {
    console.error("Error fetching email by ID:", error);
    throw error;
  }
}
