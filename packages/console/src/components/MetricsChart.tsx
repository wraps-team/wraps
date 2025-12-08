import { format } from "date-fns";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type MetricsChartProps = {
  data: {
    sends: Array<{ timestamp: number; value: number }>;
    bounces: Array<{ timestamp: number; value: number }>;
    complaints: Array<{ timestamp: number; value: number }>;
    deliveries: Array<{ timestamp: number; value: number }>;
    opens: Array<{ timestamp: number; value: number }>;
    clicks: Array<{ timestamp: number; value: number }>;
  };
};

export function MetricsChart({ data }: MetricsChartProps) {
  // Merge all metrics by timestamp
  const mergedData = mergeMetrics(data);

  if (mergedData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Email Metrics</CardTitle>
          <CardDescription>Performance over the last 24 hours</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-[400px] items-center justify-center text-muted-foreground">
            No metrics data available yet
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Email Metrics</CardTitle>
        <CardDescription>Performance over the last 24 hours</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer height={400} width="100%">
          <LineChart data={mergedData}>
            <CartesianGrid className="stroke-muted" strokeDasharray="3 3" />
            <XAxis
              className="text-xs"
              dataKey="timestamp"
              tickFormatter={(timestamp) =>
                format(new Date(timestamp), "HH:mm")
              }
            />
            <YAxis className="text-xs" />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
              }}
              labelFormatter={(timestamp) =>
                format(new Date(timestamp), "MMM d, HH:mm")
              }
            />
            <Legend />
            <Line
              dataKey="sends"
              name="Sends"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              type="monotone"
            />
            <Line
              dataKey="deliveries"
              name="Deliveries"
              stroke="#82ca9d"
              strokeWidth={2}
              type="monotone"
            />
            <Line
              dataKey="opens"
              name="Opens"
              stroke="#8884d8"
              strokeWidth={2}
              type="monotone"
            />
            <Line
              dataKey="clicks"
              name="Clicks"
              stroke="#ffc658"
              strokeWidth={2}
              type="monotone"
            />
            <Line
              dataKey="bounces"
              name="Bounces"
              stroke="#ff7300"
              strokeWidth={2}
              type="monotone"
            />
            <Line
              dataKey="complaints"
              name="Complaints"
              stroke="hsl(var(--destructive))"
              strokeWidth={2}
              type="monotone"
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function mergeMetrics(data: MetricsChartProps["data"]) {
  const timestampMap = new Map<number, unknown>();

  // Add all timestamps
  [
    ...data.sends,
    ...data.bounces,
    ...data.complaints,
    ...data.deliveries,
    ...data.opens,
    ...data.clicks,
  ].forEach((point) => {
    if (!timestampMap.has(point.timestamp)) {
      timestampMap.set(point.timestamp, {
        timestamp: point.timestamp,
        sends: 0,
        bounces: 0,
        complaints: 0,
        deliveries: 0,
        opens: 0,
        clicks: 0,
      });
    }
  });

  // Fill in values
  for (const point of data.sends) {
    (timestampMap.get(point.timestamp) as { sends: number }).sends =
      point.value;
  }
  for (const point of data.bounces) {
    (timestampMap.get(point.timestamp) as { bounces: number }).bounces =
      point.value;
  }
  for (const point of data.complaints) {
    (timestampMap.get(point.timestamp) as { complaints: number }).complaints =
      point.value;
  }
  for (const point of data.deliveries) {
    (timestampMap.get(point.timestamp) as { deliveries: number }).deliveries =
      point.value;
  }
  for (const point of data.opens) {
    (timestampMap.get(point.timestamp) as { opens: number }).opens =
      point.value;
  }
  for (const point of data.clicks) {
    (timestampMap.get(point.timestamp) as { clicks: number }).clicks =
      point.value;
  }

  // Sort by timestamp
  return Array.from(timestampMap.values()).sort(
    (a, b) =>
      (a as { timestamp: number }).timestamp -
      (b as { timestamp: number }).timestamp
  );
}
