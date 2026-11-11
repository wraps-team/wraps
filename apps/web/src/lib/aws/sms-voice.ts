import {
  CloudWatchClient,
  GetMetricDataCommand,
  type MetricDataResult,
} from "@aws-sdk/client-cloudwatch";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  type AccountAttribute,
  type ConfigurationSetInformation,
  DescribeAccountAttributesCommand,
  DescribeConfigurationSetsCommand,
  DescribePhoneNumbersCommand,
  DescribeRegistrationsCommand,
  DescribeSpendLimitsCommand,
  type PhoneNumberInformation,
  PinpointSMSVoiceV2Client,
  type RegistrationInformation,
  type SpendLimit,
} from "@aws-sdk/client-pinpoint-sms-voice-v2";
import {
  DynamoDBDocumentClient,
  QueryCommand,
  type QueryCommandInput,
} from "@aws-sdk/lib-dynamodb";
import * as Sentry from "@sentry/nextjs";
import { db } from "@wraps/db";
import { logger } from "@/lib/logger";
import { getOrAssumeRole } from "./credential-cache";

/**
 * Common SMS metrics available in CloudWatch
 * These are published by AWS End User Messaging (SMS Voice V2)
 */
export const SMS_METRICS = {
  TEXT_MESSAGE_PARTS_SUCCESSFUL: "TextMessagePartsSuccessful",
  TEXT_MESSAGE_PARTS_FAILED: "TextMessagePartsFailed",
  TEXT_MESSAGE_PARTS_QUEUED: "TextMessagePartsQueued",
  TEXT_MESSAGE_PARTS_DELIVERED: "TextMessagePartsDelivered",
  TEXT_MESSAGE_PARTS_INVALID: "TextMessagePartsInvalid",
  TEXT_MESSAGE_PARTS_CARRIER_UNREACHABLE: "TextMessagePartsCarrierUnreachable",
  TEXT_MESSAGE_PARTS_TTL_EXPIRED: "TextMessagePartsTTLExpired",
  TEXT_MESSAGE_PARTS_BLOCKED: "TextMessagePartsBlocked",
} as const;

export type SMSMetricName = (typeof SMS_METRICS)[keyof typeof SMS_METRICS];

type GetSMSMetricsParams = {
  awsAccountId: string;
  organizationId: string;
  metric: SMSMetricName;
  period: number;
  startTime: Date;
  endTime: Date;
  stat?: "Sum" | "Average" | "Maximum" | "Minimum" | "SampleCount";
};

/**
 * Fetches CloudWatch metrics for SMS Voice V2.
 * Automatically handles credential retrieval and caching.
 */
export async function getSMSCloudWatchMetrics(
  params: GetSMSMetricsParams
): Promise<MetricDataResult[]> {
  const {
    awsAccountId,
    organizationId,
    metric,
    period,
    startTime,
    endTime,
    stat = "Sum",
  } = params;

  const account = await db.query.awsAccount.findFirst({
    where: (a, { and, eq }) =>
      and(eq(a.id, awsAccountId), eq(a.organizationId, organizationId)),
  });

  if (!account) {
    throw new Error("AWS account not found");
  }

  const credentials = await getOrAssumeRole({
    roleArn: account.roleArn,
    externalId: account.externalId,
    region: account.region,
  });

  const cloudwatch = new CloudWatchClient({
    region: account.region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });

  const command = new GetMetricDataCommand({
    MetricDataQueries: [
      {
        Id: "m1",
        MetricStat: {
          Metric: {
            Namespace: "AWS/SMSVoice",
            MetricName: metric,
          },
          Period: period,
          Stat: stat,
        },
      },
    ],
    StartTime: startTime,
    EndTime: endTime,
  });

  try {
    const response = await cloudwatch.send(command);
    return response.MetricDataResults || [];
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        `Failed to fetch SMS CloudWatch metrics: ${error.message}`
      );
    }
    throw error;
  }
}

/**
 * Gets SMS account attributes (send limits, voice enabled, etc.)
 */
export async function getSMSAccountAttributes(params: {
  awsAccountId: string;
  organizationId: string;
}): Promise<AccountAttribute[]> {
  const { awsAccountId, organizationId } = params;

  const account = await db.query.awsAccount.findFirst({
    where: (a, { and, eq }) =>
      and(eq(a.id, awsAccountId), eq(a.organizationId, organizationId)),
  });

  if (!account) {
    throw new Error("AWS account not found");
  }

  const credentials = await getOrAssumeRole({
    roleArn: account.roleArn,
    externalId: account.externalId,
    region: account.region,
  });

  const client = new PinpointSMSVoiceV2Client({
    region: account.region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });

  try {
    const response = await client.send(
      new DescribeAccountAttributesCommand({})
    );
    return response.AccountAttributes || [];
  } catch (error) {
    logger.error(
      { err: error, awsAccountId },
      "Failed to fetch SMS account attributes"
    );
    Sentry.captureException(error);
    return [];
  }
}

/**
 * Gets SMS spend limits (monthly spend limit, etc.)
 */
export async function getSMSSpendLimits(params: {
  awsAccountId: string;
  organizationId: string;
}): Promise<SpendLimit[]> {
  const { awsAccountId, organizationId } = params;

  const account = await db.query.awsAccount.findFirst({
    where: (a, { and, eq }) =>
      and(eq(a.id, awsAccountId), eq(a.organizationId, organizationId)),
  });

  if (!account) {
    throw new Error("AWS account not found");
  }

  const credentials = await getOrAssumeRole({
    roleArn: account.roleArn,
    externalId: account.externalId,
    region: account.region,
  });

  const client = new PinpointSMSVoiceV2Client({
    region: account.region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });

  try {
    const response = await client.send(new DescribeSpendLimitsCommand({}));
    return response.SpendLimits || [];
  } catch (error) {
    logger.error(
      {
        err: error,
        awsAccountId,
        accountId: account.accountId,
      },
      "Failed to fetch SMS spend limits"
    );
    Sentry.captureException(error);
    return [];
  }
}

/**
 * Gets SMS phone numbers
 */
export async function getSMSPhoneNumbers(params: {
  awsAccountId: string;
  organizationId: string;
}): Promise<PhoneNumberInformation[]> {
  const { awsAccountId, organizationId } = params;

  const account = await db.query.awsAccount.findFirst({
    where: (a, { and, eq }) =>
      and(eq(a.id, awsAccountId), eq(a.organizationId, organizationId)),
  });

  if (!account) {
    throw new Error("AWS account not found");
  }

  const credentials = await getOrAssumeRole({
    roleArn: account.roleArn,
    externalId: account.externalId,
    region: account.region,
  });

  const client = new PinpointSMSVoiceV2Client({
    region: account.region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });

  const response = await client.send(new DescribePhoneNumbersCommand({}));
  return response.PhoneNumbers || [];
}

/**
 * Gets SMS configuration sets
 */
export async function getSMSConfigurationSets(params: {
  awsAccountId: string;
  organizationId: string;
}): Promise<ConfigurationSetInformation[]> {
  const { awsAccountId, organizationId } = params;

  const account = await db.query.awsAccount.findFirst({
    where: (a, { and, eq }) =>
      and(eq(a.id, awsAccountId), eq(a.organizationId, organizationId)),
  });

  if (!account) {
    throw new Error("AWS account not found");
  }

  const credentials = await getOrAssumeRole({
    roleArn: account.roleArn,
    externalId: account.externalId,
    region: account.region,
  });

  const client = new PinpointSMSVoiceV2Client({
    region: account.region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });

  try {
    const response = await client.send(
      new DescribeConfigurationSetsCommand({})
    );
    return response.ConfigurationSets || [];
  } catch (error) {
    logger.error(
      { err: error, awsAccountId },
      "Failed to fetch SMS configuration sets"
    );
    Sentry.captureException(error);
    return [];
  }
}

/**
 * Gets SMS registrations (toll-free, 10DLC, etc.)
 */
export async function getSMSRegistrations(params: {
  awsAccountId: string;
  organizationId: string;
}): Promise<RegistrationInformation[]> {
  const { awsAccountId, organizationId } = params;

  const account = await db.query.awsAccount.findFirst({
    where: (a, { and, eq }) =>
      and(eq(a.id, awsAccountId), eq(a.organizationId, organizationId)),
  });

  if (!account) {
    throw new Error("AWS account not found");
  }

  const credentials = await getOrAssumeRole({
    roleArn: account.roleArn,
    externalId: account.externalId,
    region: account.region,
  });

  const client = new PinpointSMSVoiceV2Client({
    region: account.region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });

  try {
    const response = await client.send(new DescribeRegistrationsCommand({}));
    return response.Registrations || [];
  } catch (error) {
    logger.error(
      {
        err: error,
        awsAccountId,
        accountId: account.accountId,
      },
      "Failed to fetch SMS registrations"
    );
    Sentry.captureException(error);
    return [];
  }
}

/**
 * Gets multiple SMS metrics at once for dashboard display
 */
export async function getSMSMetricsSummary(params: {
  awsAccountId: string;
  organizationId: string;
  startTime: Date;
  endTime: Date;
  period?: number;
}): Promise<{
  successful: MetricDataResult[];
  failed: MetricDataResult[];
  queued: MetricDataResult[];
  delivered: MetricDataResult[];
}> {
  const {
    awsAccountId,
    organizationId,
    startTime,
    endTime,
    period = 3600,
  } = params;

  const [successful, failed, queued, delivered] = await Promise.all([
    getSMSCloudWatchMetrics({
      awsAccountId,
      organizationId,
      metric: SMS_METRICS.TEXT_MESSAGE_PARTS_SUCCESSFUL,
      period,
      startTime,
      endTime,
    }),
    getSMSCloudWatchMetrics({
      awsAccountId,
      organizationId,
      metric: SMS_METRICS.TEXT_MESSAGE_PARTS_FAILED,
      period,
      startTime,
      endTime,
    }),
    getSMSCloudWatchMetrics({
      awsAccountId,
      organizationId,
      metric: SMS_METRICS.TEXT_MESSAGE_PARTS_QUEUED,
      period,
      startTime,
      endTime,
    }),
    getSMSCloudWatchMetrics({
      awsAccountId,
      organizationId,
      metric: SMS_METRICS.TEXT_MESSAGE_PARTS_DELIVERED,
      period,
      startTime,
      endTime,
    }),
  ]);

  return { successful, failed, queued, delivered };
}

/**
 * SMS Event type from DynamoDB
 */
export type SMSEvent = {
  messageId: string;
  sentAt: number;
  accountId: string;
  destinationNumber: string;
  originationNumber?: string;
  messageBody?: string;
  eventType: string;
  eventStatus: string;
  segments?: number;
  priceInUsd?: number;
  createdAt: number;
  expiresAt?: number;
  additionalData?: string;
  metadata?: Record<string, unknown>;
};

type QuerySMSEventsParams = {
  awsAccountId: string;
  organizationId: string;
  startTime: Date;
  endTime: Date;
  limit?: number;
};

/**
 * Derives a human-readable eventStatus from the AWS eventType.
 * The SMS Lambda processor writes eventType (e.g. TEXT_DELIVERED) but not
 * a separate eventStatus field. This normalizes for all consumers.
 */
function normalizeEventStatus(eventType: string): string {
  const mapping: Record<string, string> = {
    TEXT_QUEUED: "queued",
    TEXT_SENT: "sent",
    TEXT_PENDING: "pending",
    TEXT_DELIVERED: "delivered",
    TEXT_SUCCESSFUL: "delivered",
    TEXT_INVALID: "invalid",
    TEXT_CARRIER_UNREACHABLE: "carrier_unreachable",
    TEXT_TTL_EXPIRED: "ttl_expired",
    TEXT_BLOCKED: "blocked",
    TEXT_UNKNOWN: "failed",
  };
  return mapping[eventType] || eventType;
}

/**
 * Queries SMS events from DynamoDB for a specific AWS account.
 * Uses the accountId-sentAt-index GSI for efficient time-range queries.
 */
export async function querySMSEvents(
  params: QuerySMSEventsParams
): Promise<SMSEvent[]> {
  const {
    awsAccountId,
    organizationId,
    startTime,
    endTime,
    limit = 1000,
  } = params;

  // Get AWS account details from database
  const account = await db.query.awsAccount.findFirst({
    where: (a, { and, eq }) =>
      and(eq(a.id, awsAccountId), eq(a.organizationId, organizationId)),
  });

  if (!account) {
    throw new Error("AWS account not found");
  }

  // Get temporary credentials for customer account
  const credentials = await getOrAssumeRole({
    roleArn: account.roleArn,
    externalId: account.externalId,
    region: account.region,
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
    TableName: "wraps-sms-history",
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
    const result = await docClient.send(new QueryCommand(queryParams));
    const items = (result.Items || []) as Record<string, unknown>[];

    // Normalize: the Lambda processor writes eventType (e.g. TEXT_DELIVERED)
    // but not eventStatus. Derive eventStatus from eventType when missing.
    return items.map((item) => ({
      ...item,
      eventStatus:
        (item.eventStatus as string) ||
        normalizeEventStatus(item.eventType as string),
    })) as SMSEvent[];
  } catch (error) {
    // Handle case where DynamoDB table doesn't exist (user hasn't deployed history tracking)
    if (
      error instanceof Error &&
      (error.name === "ResourceNotFoundException" ||
        error.message.includes("Requested resource not found"))
    ) {
      return [];
    }
    if (error instanceof Error) {
      throw new Error(`Failed to query SMS DynamoDB: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Gets recent SMS activity for the activity feed.
 */
export async function getRecentSMSActivity(params: {
  awsAccountId: string;
  organizationId: string;
  limit?: number;
}): Promise<
  Array<{
    messageId: string;
    destinationNumber: string;
    eventType: string;
    eventStatus: string;
    timestamp: number;
    segments?: number;
    priceInUsd?: number;
  }>
> {
  const { awsAccountId, organizationId, limit = 50 } = params;

  // Query last 7 days of activity
  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - 7 * 24 * 60 * 60 * 1000);

  const events = await querySMSEvents({
    awsAccountId,
    organizationId,
    startTime,
    endTime,
    limit,
  });

  return events.map((event) => ({
    messageId: event.messageId,
    destinationNumber: event.destinationNumber,
    eventType: event.eventType,
    eventStatus: event.eventStatus,
    timestamp: event.createdAt,
    segments: event.segments,
    priceInUsd: event.priceInUsd,
  }));
}
