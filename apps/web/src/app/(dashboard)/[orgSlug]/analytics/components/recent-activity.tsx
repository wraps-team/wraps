"use client";

import { Activity, AlertCircle, CheckCircle2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useRecentActivity } from "../hooks/use-analytics";

const getActivityIcon = (type: string) => {
  if (type === "Delivery" || type === "Send") {
    return <CheckCircle2 className="h-4 w-4 text-green-500" />;
  }
  if (type === "Bounce" || type === "Reject") {
    return <XCircle className="h-4 w-4 text-red-500" />;
  }
  if (type === "Complaint") {
    return <AlertCircle className="h-4 w-4 text-yellow-500" />;
  }
  return <Activity className="h-4 w-4" />;
};

const getActivityBadgeVariant = (type: string) => {
  if (
    type === "Delivery" ||
    type === "Send" ||
    type === "Open" ||
    type === "Click"
  ) {
    return "default" as const;
  }
  if (type === "Bounce" || type === "Reject") {
    return "destructive" as const;
  }
  return "secondary" as const;
};

const formatTimestamp = (timestamp: number) => {
  const now = Date.now();
  const diff = now - timestamp;

  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (minutes < 1) {
    return "Just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  if (hours < 24) {
    return `${hours}h ago`;
  }
  return `${days}d ago`;
};

export function RecentActivity({ orgSlug }: { orgSlug: string }) {
  const { data: activities, isLoading, error } = useRecentActivity(orgSlug, 20);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton className="h-16 w-full" key={i} />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error || !activities || activities.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground text-sm">
            {error ? "Failed to load recent activity" : "No recent activity"}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Recent Activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {activities.map((activity) => (
            <div
              className="flex items-start gap-4 rounded-lg border p-4 transition-colors hover:bg-accent"
              key={activity.id}
            >
              <div className="mt-0.5">
                {getActivityIcon(activity.eventType)}
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-sm leading-tight">
                    {activity.subject}
                  </p>
                  <Badge
                    className="shrink-0"
                    variant={getActivityBadgeVariant(activity.eventType)}
                  >
                    {activity.eventType}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground text-xs">
                  <span>{formatTimestamp(activity.timestamp)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
