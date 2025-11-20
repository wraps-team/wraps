"use client";

import {
  CheckCircle2,
  Clock,
  Mail,
  MousePointerClick,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { Fragment } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useRecentActivity } from "../hooks/use-analytics";

const getActivityIcon = (type: string) => {
  if (type === "Delivery") {
    return (
      <CheckCircle2 className="h-4 w-4 text-green-700 dark:text-green-400" />
    );
  }
  if (type === "Send") {
    return <Clock className="h-4 w-4 text-gray-700 dark:text-gray-400" />;
  }
  if (type === "Open") {
    return <Mail className="h-4 w-4 text-blue-700 dark:text-blue-400" />;
  }
  if (type === "Click") {
    return (
      <MousePointerClick className="h-4 w-4 text-purple-700 dark:text-purple-400" />
    );
  }
  if (type === "Bounce") {
    return <XCircle className="h-4 w-4 text-orange-700 dark:text-orange-400" />;
  }
  if (type === "Complaint") {
    return <XCircle className="h-4 w-4 text-red-700 dark:text-red-400" />;
  }
  if (type === "Reject") {
    return <XCircle className="h-4 w-4 text-red-700 dark:text-red-400" />;
  }
  return <Clock className="h-4 w-4 text-gray-700 dark:text-gray-400" />;
};

const getActivityBadgeConfig = (type: string) => {
  const configs: Record<
    string,
    {
      variant: "default" | "secondary" | "destructive" | "outline";
      className: string;
    }
  > = {
    Send: {
      variant: "default",
      className:
        "bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20",
    },
    Delivery: {
      variant: "default",
      className:
        "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20",
    },
    Open: {
      variant: "default",
      className:
        "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
    },
    Click: {
      variant: "default",
      className:
        "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20",
    },
    Bounce: {
      variant: "default",
      className:
        "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20",
    },
    Complaint: {
      variant: "default",
      className:
        "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
    },
    Reject: {
      variant: "default",
      className:
        "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
    },
  };

  return (
    configs[type] || {
      variant: "secondary" as const,
      className:
        "bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20",
    }
  );
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
            <Clock className="h-5 w-5" />
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
            <Clock className="h-5 w-5" />
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
          <Clock className="h-5 w-5" />
          Recent Activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ItemGroup>
          {activities.map((activity, index) => {
            const messageId = activity.id.split("-").slice(0, -1).join("-");
            return (
              <Fragment key={activity.id}>
                <Item asChild>
                  <Link href={`/${orgSlug}/emails/${messageId}`}>
                    <ItemMedia>{getActivityIcon(activity.eventType)}</ItemMedia>
                    <ItemContent>
                      <ItemTitle>{activity.subject}</ItemTitle>
                      <ItemDescription>
                        {formatTimestamp(activity.timestamp)}
                      </ItemDescription>
                    </ItemContent>
                    <Badge
                      className={cn(
                        "ml-auto",
                        getActivityBadgeConfig(activity.eventType).className
                      )}
                      variant={
                        getActivityBadgeConfig(activity.eventType).variant
                      }
                    >
                      {activity.eventType}
                    </Badge>
                  </Link>
                </Item>
                {index !== activities.length - 1 && <ItemSeparator />}
              </Fragment>
            );
          })}
        </ItemGroup>
      </CardContent>
    </Card>
  );
}
