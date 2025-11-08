import {
  CloudWatchClient,
  GetMetricDataCommand,
  type MetricDataQuery,
} from "@aws-sdk/client-cloudwatch";
import { assumeRole } from "../../utils/assume-role.js";

export interface MetricsData {
  sends: Array<{ timestamp: number; value: number }>;
  bounces: Array<{ timestamp: number; value: number }>;
  complaints: Array<{ timestamp: number; value: number }>;
  deliveries: Array<{ timestamp: number; value: number }>;
  opens: Array<{ timestamp: number; value: number }>;
  clicks: Array<{ timestamp: number; value: number }>;
}

/**
 * Fetch SES metrics from CloudWatch
 */
export async function fetchSESMetrics(
  roleArn: string | undefined,
  region: string,
  timeRange: { start: Date; end: Date }
): Promise<MetricsData> {
  // For console usage, use current credentials instead of assuming role
  const credentials = roleArn ? await assumeRole(roleArn, region) : undefined;

  // Create CloudWatch client
  const cloudwatch = new CloudWatchClient({ region, credentials });

  // Define metric queries
  const queries: MetricDataQuery[] = [
    {
      Id: "sends",
      MetricStat: {
        Metric: {
          Namespace: "AWS/SES",
          MetricName: "Send",
        },
        Period: 300, // 5 minutes
        Stat: "Sum",
      },
    },
    {
      Id: "bounces",
      MetricStat: {
        Metric: {
          Namespace: "AWS/SES",
          MetricName: "Bounce",
        },
        Period: 300,
        Stat: "Sum",
      },
    },
    {
      Id: "complaints",
      MetricStat: {
        Metric: {
          Namespace: "AWS/SES",
          MetricName: "Complaint",
        },
        Period: 300,
        Stat: "Sum",
      },
    },
    {
      Id: "deliveries",
      MetricStat: {
        Metric: {
          Namespace: "AWS/SES",
          MetricName: "Delivery",
        },
        Period: 300,
        Stat: "Sum",
      },
    },
  ];

  // Fetch metrics
  const response = await cloudwatch.send(
    new GetMetricDataCommand({
      MetricDataQueries: queries,
      StartTime: timeRange.start,
      EndTime: timeRange.end,
    })
  );

  // Parse results
  const results = response.MetricDataResults || [];

  const parseMetric = (id: string) => {
    const metric = results.find((r) => r.Id === id);
    if (!(metric && metric.Timestamps && metric.Values)) {
      return [];
    }

    return metric.Timestamps.map((timestamp, i) => ({
      timestamp: timestamp.getTime(),
      value: metric.Values![i] || 0,
    }));
  };

  return {
    sends: parseMetric("sends"),
    bounces: parseMetric("bounces"),
    complaints: parseMetric("complaints"),
    deliveries: parseMetric("deliveries"),
    opens: [], // Not available in CloudWatch by default
    clicks: [], // Not available in CloudWatch by default
  };
}
