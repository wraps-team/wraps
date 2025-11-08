import {
  DynamoDBClient,
  QueryCommand,
  ScanCommand,
} from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";

export interface EmailLog {
  messageId: string;
  to: string[]; // Array of recipients
  from: string;
  subject: string;
  status: "delivered" | "bounced" | "complained" | "sent" | "failed";
  sentAt: number;
  accountId?: string;
  errorMessage?: string;
}

interface FetchEmailLogsOptions {
  region: string;
  tableName: string;
  accountId?: string;
  limit?: number;
  startTime?: number;
  endTime?: number;
}

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
 * Priority: Complaint > Permanent Bounce > Delivery > Transient Bounce > Send
 */
function getEventPriority(item: any): number {
  const type = item.eventType?.toLowerCase();

  switch (type) {
    case "complaint":
      return 5;
    case "bounce": {
      // Permanent bounces (hard bounces) are more important than delivery
      // Transient bounces (OOTO, mailbox full) are less important than delivery
      const bounceType = item.bounceType?.toLowerCase();
      return bounceType === "permanent" ? 4 : 2;
    }
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
