import {
  CloudWatchClient,
  GetMetricDataCommand,
  type MetricDataQuery,
  type MetricDataResult,
} from "@aws-sdk/client-cloudwatch";
import { db } from "@wraps/db";
import { getOrAssumeRole } from "./credential-cache";

interface GetMetricsParams {
  awsAccountId: string;
  metric: string;
  period: number;
  startTime: Date;
  endTime: Date;
  stat?: "Sum" | "Average" | "Maximum" | "Minimum" | "SampleCount";
}

/**
 * Fetches CloudWatch metrics for a customer's SES account.
 * Automatically handles credential retrieval and caching.
 *
 * @param params - Account ID, metric name, time range, and aggregation settings
 * @returns CloudWatch metric data results
 *
 * @example
 * ```ts
 * // Get email send count for last 24 hours
 * const metrics = await getCloudWatchMetrics({
 *   awsAccountId: 'aws-account-uuid',
 *   metric: 'Send',
 *   period: 3600, // 1 hour intervals
 *   startTime: new Date(Date.now() - 24 * 60 * 60 * 1000),
 *   endTime: new Date(),
 * });
 * ```
 */
export async function getCloudWatchMetrics(
  params: GetMetricsParams
): Promise<MetricDataResult[]> {
  const {
    awsAccountId,
    metric,
    period,
    startTime,
    endTime,
    stat = "Sum",
  } = params;

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

  // Create CloudWatch client with temporary credentials
  const cloudwatch = new CloudWatchClient({
    region: account.region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });

  // Define metric query
  const metricQuery: MetricDataQuery = {
    Id: "m1",
    MetricStat: {
      Metric: {
        Namespace: "AWS/SES",
        MetricName: metric,
      },
      Period: period,
      Stat: stat,
    },
  };

  // Fetch metrics
  const command = new GetMetricDataCommand({
    MetricDataQueries: [metricQuery],
    StartTime: startTime,
    EndTime: endTime,
  });

  try {
    const response = await cloudwatch.send(command);
    return response.MetricDataResults || [];
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to fetch CloudWatch metrics: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Common SES metrics available in CloudWatch
 */
export const SES_METRICS = {
  SEND: "Send",
  DELIVERY: "Delivery",
  BOUNCE: "Bounce",
  COMPLAINT: "Complaint",
  REJECT: "Reject",
  OPEN: "Open",
  CLICK: "Click",
  RENDERING_FAILURE: "RenderingFailure",
} as const;

/**
 * Gets multiple SES metrics at once for dashboard display
 */
export async function getSESMetricsSummary(params: {
  awsAccountId: string;
  startTime: Date;
  endTime: Date;
  period?: number;
}): Promise<Record<string, MetricDataResult[]>> {
  const { awsAccountId, startTime, endTime, period = 3600 } = params;

  // Fetch all key metrics in parallel
  const [sends, deliveries, bounces, complaints] = await Promise.all([
    getCloudWatchMetrics({
      awsAccountId,
      metric: SES_METRICS.SEND,
      period,
      startTime,
      endTime,
    }),
    getCloudWatchMetrics({
      awsAccountId,
      metric: SES_METRICS.DELIVERY,
      period,
      startTime,
      endTime,
    }),
    getCloudWatchMetrics({
      awsAccountId,
      metric: SES_METRICS.BOUNCE,
      period,
      startTime,
      endTime,
    }),
    getCloudWatchMetrics({
      awsAccountId,
      metric: SES_METRICS.COMPLAINT,
      period,
      startTime,
      endTime,
    }),
  ]);

  return {
    sends,
    deliveries,
    bounces,
    complaints,
  };
}
