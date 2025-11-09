import { DynamoDBClient, ScanCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";

export type DynamoDBMetrics = {
  opens: Array<{ timestamp: number; value: number }>;
  clicks: Array<{ timestamp: number; value: number }>;
};

/**
 * Fetch Open and Click metrics from DynamoDB
 */
export async function fetchDynamoDBMetrics(
  region: string,
  tableName: string,
  timeRange: { start: Date; end: Date }
): Promise<DynamoDBMetrics> {
  const dynamodb = new DynamoDBClient({ region });

  try {
    const startTime = timeRange.start.getTime();
    const endTime = timeRange.end.getTime();

    // Scan the table for events in the time range
    // Note: In production, consider using accountId GSI for better performance
    const response = await dynamodb.send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression:
          "sentAt BETWEEN :startTime AND :endTime AND (eventType = :open OR eventType = :click)",
        ExpressionAttributeValues: {
          ":startTime": { N: startTime.toString() },
          ":endTime": { N: endTime.toString() },
          ":open": { S: "Open" },
          ":click": { S: "Click" },
        },
      })
    );

    const items = (response.Items || []).map((item) => unmarshall(item));

    // Group events by 5-minute buckets (to match CloudWatch period)
    const period = 5 * 60 * 1000; // 5 minutes in milliseconds
    const openBuckets = new Map<number, number>();
    const clickBuckets = new Map<number, number>();

    for (const item of items) {
      const timestamp = Number(item.sentAt);
      const bucket = Math.floor(timestamp / period) * period;
      const eventType = item.eventType;

      if (eventType === "Open") {
        openBuckets.set(bucket, (openBuckets.get(bucket) || 0) + 1);
      } else if (eventType === "Click") {
        clickBuckets.set(bucket, (clickBuckets.get(bucket) || 0) + 1);
      }
    }

    // Convert to array format
    const opens = Array.from(openBuckets.entries()).map(
      ([timestamp, value]) => ({
        timestamp,
        value,
      })
    );

    const clicks = Array.from(clickBuckets.entries()).map(
      ([timestamp, value]) => ({
        timestamp,
        value,
      })
    );

    return {
      opens: opens.sort((a, b) => a.timestamp - b.timestamp),
      clicks: clicks.sort((a, b) => a.timestamp - b.timestamp),
    };
  } catch (error) {
    console.error("Error fetching DynamoDB metrics:", error);
    // Return empty arrays on error instead of throwing
    return {
      opens: [],
      clicks: [],
    };
  }
}
