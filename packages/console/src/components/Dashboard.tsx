import { Activity, Mail, TrendingUp, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useSSE } from "@/hooks/useSSE";
import { MetricsChart } from "./MetricsChart";
import { QuotaDisplay } from "./QuotaDisplay";

type MetricsData = {
  type: "metrics";
  timestamp: number;
  metrics: {
    sends: Array<{ timestamp: number; value: number }>;
    bounces: Array<{ timestamp: number; value: number }>;
    complaints: Array<{ timestamp: number; value: number }>;
    deliveries: Array<{ timestamp: number; value: number }>;
  };
  quota: {
    max24HourSend: number;
    maxSendRate: number;
    sentLast24Hours: number;
  };
};

export function Dashboard() {
  const { data, error, isConnected } = useSSE<MetricsData>(
    "/api/metrics/stream"
  );

  if (error) {
    return (
      <div className="flex h-[calc(100vh-200px)] flex-col items-center justify-center space-y-4">
        <div className="font-semibold text-destructive">Connection Error</div>
        <p className="text-muted-foreground">{error.message}</p>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="flex h-[calc(100vh-200px)] flex-col items-center justify-center space-y-4">
        <div className="font-semibold text-lg">
          Connecting to Wraps Console...
        </div>
        <div className="h-2 w-48 overflow-hidden rounded-full bg-muted">
          <div className="h-full animate-pulse bg-primary" />
        </div>
      </div>
    );
  }

  if (!data || data.type !== "metrics") {
    return (
      <div className="flex h-[calc(100vh-200px)] flex-col items-center justify-center space-y-4">
        <div className="font-semibold text-lg">Loading metrics...</div>
      </div>
    );
  }

  // Calculate some summary stats
  const totalSends =
    data.metrics.sends.reduce((sum, point) => sum + point.value, 0) || 0;
  const totalDeliveries =
    data.metrics.deliveries.reduce((sum, point) => sum + point.value, 0) || 0;
  const totalBounces =
    data.metrics.bounces.reduce((sum, point) => sum + point.value, 0) || 0;
  const deliveryRate =
    totalSends > 0 ? (totalDeliveries / totalSends) * 100 : 0;

  const stats = [
    {
      title: "Emails Sent (24h)",
      value: totalSends.toLocaleString(),
      change: "",
      icon: Mail,
    },
    {
      title: "Delivery Rate",
      value: `${deliveryRate.toFixed(1)}%`,
      change: "",
      icon: TrendingUp,
    },
    {
      title: "Bounces",
      value: totalBounces.toLocaleString(),
      change: "",
      icon: Activity,
    },
    {
      title: "Quota Used",
      value: `${((data.quota.sentLast24Hours / data.quota.max24HourSend) * 100).toFixed(1)}%`,
      change: "",
      icon: Users,
    },
  ];

  return (
    <>
      {/* Connection Status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge className="gap-2" variant="outline">
            <div className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
            Live
          </Badge>
          <span className="text-muted-foreground text-xs">
            Last updated: {new Date(data.timestamp).toLocaleTimeString()}
          </span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="font-medium text-sm">
                {stat.title}
              </CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="font-bold text-2xl">{stat.value}</div>
              {stat.change && (
                <p className="text-muted-foreground text-xs">{stat.change}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quota Display */}
      <QuotaDisplay quota={data.quota} />

      {/* Charts Section */}
      <MetricsChart data={data.metrics} />

      {/* Domain Status */}
      <Card>
        <CardHeader>
          <CardTitle>Domain Verification Status</CardTitle>
          <CardDescription>
            DKIM, SPF, and DMARC configuration for your domains
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-muted-foreground text-sm">
            Domain verification details will be displayed here
          </div>
        </CardContent>
      </Card>
    </>
  );
}
