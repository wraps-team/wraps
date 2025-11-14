import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  QueryCommand,
  type QueryCommandInput,
} from "@aws-sdk/lib-dynamodb";
import { db } from "@wraps/db";
import { getOrAssumeRole } from "./credential-cache";

interface EmailEvent {
  messageId: string;
  sentAt: number;
  accountId: string;
  from: string;
  to: string[];
  subject: string;
  eventType: string;
  eventData: string;
  additionalData?: string;
  createdAt: number;
  expiresAt: number;
}

interface QueryEmailEventsParams {
  awsAccountId: string;
  startTime: Date;
  endTime: Date;
  limit?: number;
}

/**
 * Queries email events from DynamoDB for a specific AWS account.
 * Uses the accountId-sentAt-index GSI for efficient time-range queries.
 */
export async function queryEmailEvents(
  params: QueryEmailEventsParams
): Promise<EmailEvent[]> {
  const { awsAccountId, startTime, endTime, limit = 1000 } = params;

  // Get AWS account details from database
  const account = await db.query.awsAccount.findFirst({
    where: (a, { eq }) => eq(a.id, awsAccountId),
  });

  if (!account) {
    throw new Error("AWS account not found");
  }

  // Get temporary credentials for customer account
  const credentials = await getOrAssumeRole({
    roleArn: account.roleArn,
    externalId: account.externalId,
  });

  // Create DynamoDB Document client with temporary credentials
  const client = new DynamoDBClient({
    region: account.region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });

  const docClient = DynamoDBDocumentClient.from(client);

  // Query using the accountId-sentAt-index GSI
  const queryParams: QueryCommandInput = {
    TableName: "wraps-email-history",
    IndexName: "accountId-sentAt-index",
    KeyConditionExpression:
      "accountId = :accountId AND sentAt BETWEEN :startTime AND :endTime",
    ExpressionAttributeValues: {
      ":accountId": account.accountId, // AWS account number
      ":startTime": startTime.getTime(),
      ":endTime": endTime.getTime(),
    },
    Limit: limit,
    ScanIndexForward: false, // Descending order (newest first)
  };

  try {
    console.log("[queryEmailEvents] Querying DynamoDB:", {
      table: queryParams.TableName,
      index: queryParams.IndexName,
      accountId: account.accountId,
      region: account.region,
      timeRange: {
        start: new Date(startTime).toISOString(),
        end: new Date(endTime).toISOString(),
      },
    });

    const result = await docClient.send(new QueryCommand(queryParams));

    console.log("[queryEmailEvents] Query result:", {
      count: result.Items?.length || 0,
      scannedCount: result.ScannedCount,
    });

    return (result.Items as EmailEvent[]) || [];
  } catch (error) {
    console.error("[queryEmailEvents] Failed to query email events:", {
      error,
      accountId: account.id,
      awsAccountId: account.accountId,
      region: account.region,
      roleArn: account.roleArn,
    });
    if (error instanceof Error) {
      throw new Error(`Failed to query DynamoDB: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Groups email events by messageId to calculate engagement metrics per email.
 * Returns aggregated data suitable for top performers analysis.
 */
export async function getEmailEngagementMetrics(
  params: QueryEmailEventsParams
): Promise<
  Array<{
    messageId: string;
    subject: string;
    from: string;
    to: string[];
    sentAt: number;
    eventTypes: string[];
    opens: number;
    clicks: number;
    hasDelivered: boolean;
    hasBounced: boolean;
    hasComplaint: boolean;
  }>
> {
  const events = await queryEmailEvents(params);

  // Group events by messageId
  const emailsMap = new Map<
    string,
    {
      messageId: string;
      subject: string;
      from: string;
      to: string[];
      sentAt: number;
      eventTypes: Set<string>;
      opens: number;
      clicks: number;
      hasDelivered: boolean;
      hasBounced: boolean;
      hasComplaint: boolean;
    }
  >();

  for (const event of events) {
    const existing = emailsMap.get(event.messageId);

    if (existing) {
      existing.eventTypes.add(event.eventType);
      if (event.eventType === "Open") existing.opens++;
      if (event.eventType === "Click") existing.clicks++;
      if (event.eventType === "Delivery") existing.hasDelivered = true;
      if (event.eventType === "Bounce") existing.hasBounced = true;
      if (event.eventType === "Complaint") existing.hasComplaint = true;
    } else {
      emailsMap.set(event.messageId, {
        messageId: event.messageId,
        subject: event.subject,
        from: event.from,
        to: event.to,
        sentAt: event.sentAt,
        eventTypes: new Set([event.eventType]),
        opens: event.eventType === "Open" ? 1 : 0,
        clicks: event.eventType === "Click" ? 1 : 0,
        hasDelivered: event.eventType === "Delivery",
        hasBounced: event.eventType === "Bounce",
        hasComplaint: event.eventType === "Complaint",
      });
    }
  }

  // Convert to array and sort by engagement
  return Array.from(emailsMap.values())
    .map((email) => ({
      ...email,
      eventTypes: Array.from(email.eventTypes),
    }))
    .sort((a, b) => {
      // Sort by clicks first, then opens
      if (b.clicks !== a.clicks) return b.clicks - a.clicks;
      return b.opens - a.opens;
    });
}

/**
 * Gets recent email activity with event details for activity feed.
 */
export async function getRecentEmailActivity(params: {
  awsAccountId: string;
  limit?: number;
}): Promise<
  Array<{
    messageId: string;
    subject: string;
    eventType: string;
    timestamp: number;
    metadata?: Record<string, unknown>;
  }>
> {
  const { awsAccountId, limit = 50 } = params;

  // Query last 7 days of activity
  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - 7 * 24 * 60 * 60 * 1000);

  const events = await queryEmailEvents({
    awsAccountId,
    startTime,
    endTime,
    limit,
  });

  return events.map((event) => ({
    messageId: event.messageId,
    subject: event.subject,
    eventType: event.eventType,
    timestamp: event.createdAt,
    metadata: event.additionalData
      ? JSON.parse(event.additionalData)
      : undefined,
  }));
}
