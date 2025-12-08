import { Activity, Mail, TrendingUp, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MetricsChart } from "./MetricsChart";
import { QuotaDisplay } from "./QuotaDisplay";

type MetricsData = {
  metrics: {
    sends: Array<{ timestamp: number; value: number }>;
    bounces: Array<{ timestamp: number; value: number }>;
    complaints: Array<{ timestamp: number; value: number }>;
    deliveries: Array<{ timestamp: number; value: number }>;
    opens: Array<{ timestamp: number; value: number }>;
    clicks: Array<{ timestamp: number; value: number }>;
  };
  quota: {
    max24HourSend: number;
    maxSendRate: number;
    sentLast24Hours: number;
  };
  timestamp: number;
};

export function EmailMetrics() {
  const [dateRange, setDateRange] = useState("1");
  const [data, setData] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch metrics data from API
  useEffect(() => {
    async function fetchMetrics() {
      try {
        setLoading(true);
        setError(null);

        // Get token from sessionStorage or URL params
        let token = sessionStorage.getItem("wraps-auth-token");

        if (!token) {
          const params = new URLSearchParams(window.location.search);
          token = params.get("token");

          // Store token for future use
          if (token) {
            sessionStorage.setItem("wraps-auth-token", token);
          }
        }

        if (!token) {
          throw new Error(
            "Authentication token not found. Please use the URL provided by 'wraps console' command."
          );
        }

        // Calculate time range
        const daysAgo = Number.parseInt(dateRange, 10);
        const startTime = Date.now() - daysAgo * 24 * 60 * 60 * 1000;
        const endTime = Date.now();

        const response = await fetch(
          `/api/metrics?startTime=${startTime}&endTime=${endTime}&token=${token}`
        );

        if (!response.ok) {
          let errorMessage = "Failed to fetch email metrics";
          try {
            const errorData = await response.json();
            errorMessage = errorData.error || errorMessage;
          } catch (_e) {
            errorMessage = `${response.status}: ${response.statusText}`;
          }
          throw new Error(errorMessage);
        }

        const metricsData = await response.json();
        setData(metricsData);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        setError(errorMessage);
        console.error("Error fetching email metrics:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchMetrics();
  }, [dateRange]);

  if (error) {
    return (
      <>
        <div>
          <h1 className="font-semibold text-3xl tracking-tight">
            Email Metrics
          </h1>
          <p className="mt-2 text-muted-foreground">
            View detailed metrics and analytics for your email campaigns
          </p>
        </div>

        <div className="mt-4 rounded-md border border-destructive bg-destructive/10 p-4 text-destructive text-sm">
          {error}
        </div>
      </>
    );
  }

  if (loading || !data) {
    return (
      <>
        <div>
          <h1 className="font-semibold text-3xl tracking-tight">
            Email Metrics
          </h1>
          <p className="mt-2 text-muted-foreground">
            View detailed metrics and analytics for your email campaigns
          </p>
        </div>

        <div className="mt-4 flex h-[400px] items-center justify-center text-muted-foreground">
          Loading metrics...
        </div>
      </>
    );
  }

  // Calculate summary stats
  const totalSends =
    data.metrics.sends.reduce((sum, point) => sum + point.value, 0) || 0;
  const totalDeliveries =
    data.metrics.deliveries.reduce((sum, point) => sum + point.value, 0) || 0;
  const totalBounces =
    data.metrics.bounces.reduce((sum, point) => sum + point.value, 0) || 0;
  const totalComplaints =
    data.metrics.complaints.reduce((sum, point) => sum + point.value, 0) || 0;
  const totalOpens =
    data.metrics.opens.reduce((sum, point) => sum + point.value, 0) || 0;
  const totalClicks =
    data.metrics.clicks.reduce((sum, point) => sum + point.value, 0) || 0;
  const deliveryRate =
    totalSends > 0 ? (totalDeliveries / totalSends) * 100 : 0;
  const _bounceRate = totalSends > 0 ? (totalBounces / totalSends) * 100 : 0;
  const openRate =
    totalDeliveries > 0 ? (totalOpens / totalDeliveries) * 100 : 0;
  const clickRate = totalOpens > 0 ? (totalClicks / totalOpens) * 100 : 0;

  const stats = [
    {
      title: "Emails Sent",
      value: totalSends.toLocaleString(),
      description: `${dateRange === "1" ? "Last 24 hours" : `Last ${dateRange} days`}`,
      icon: Mail,
    },
    {
      title: "Delivery Rate",
      value: `${deliveryRate.toFixed(1)}%`,
      description: `${totalDeliveries.toLocaleString()} delivered`,
      icon: TrendingUp,
    },
    {
      title: "Open Rate",
      value: `${openRate.toFixed(1)}%`,
      description: `${totalOpens.toLocaleString()} opened`,
      icon: Activity,
    },
    {
      title: "Click Rate",
      value: `${clickRate.toFixed(1)}%`,
      description: `${totalClicks.toLocaleString()} clicked`,
      icon: Users,
    },
  ];

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-semibold text-3xl tracking-tight">
            Email Metrics
          </h1>
          <p className="mt-2 text-muted-foreground">
            View detailed metrics and analytics for your email campaigns
          </p>
        </div>

        <Select onValueChange={setDateRange} value={dateRange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Last 24 hours</SelectItem>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="15">Last 15 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
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
              <p className="text-muted-foreground text-xs">
                {stat.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quota Display */}
      <QuotaDisplay quota={data.quota} />

      {/* Charts Section */}
      <MetricsChart data={data.metrics} />

      {/* Additional Info */}
      <Card>
        <CardHeader>
          <CardTitle>Metrics Summary</CardTitle>
          <CardDescription>
            Detailed breakdown of your email performance
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm">Total Emails Sent</span>
            <Badge variant="outline">{totalSends.toLocaleString()}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Successfully Delivered</span>
            <Badge variant="default">{totalDeliveries.toLocaleString()}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Opened</span>
            <Badge variant="default">{totalOpens.toLocaleString()}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Clicked</span>
            <Badge variant="default">{totalClicks.toLocaleString()}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Bounced</span>
            <Badge variant="destructive">{totalBounces.toLocaleString()}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Complaints</span>
            <Badge variant="destructive">
              {totalComplaints.toLocaleString()}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
