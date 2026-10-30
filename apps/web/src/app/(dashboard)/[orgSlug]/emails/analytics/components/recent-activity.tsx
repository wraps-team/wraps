"use client";

import { Badge } from "@wraps/ui/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import { Skeleton } from "@wraps/ui/components/ui/skeleton";
import {
  CheckCircle2,
  Clock,
  Mail,
  MousePointerClick,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { type ComponentProps, Fragment } from "react";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";
import { useRecentActivity } from "../hooks/use-analytics";

const getActivityIcon = (type: string) => {
  if (type === "Delivery") {
    return <CheckCircle2 className="h-4 w-4 text-success" />;
  }
  if (type === "Send") {
    return <Clock className="h-4 w-4 text-muted-foreground" />;
  }
  if (type === "Open") {
    return <Mail className="h-4 w-4 text-info" />;
  }
  if (type === "Click") {
    return (
      <MousePointerClick className="h-4 w-4 text-purple-700 dark:text-purple-400" />
    );
  }
  if (type === "Bounce") {
    return <XCircle className="h-4 w-4 text-warning" />;
  }
  if (type === "Complaint") {
    return <XCircle className="h-4 w-4 text-destructive" />;
  }
  if (type === "Reject") {
    return <XCircle className="h-4 w-4 text-destructive" />;
  }
  return <Clock className="h-4 w-4 text-muted-foreground" />;
};

type BadgeVariant = ComponentProps<typeof Badge>["variant"];

const getActivityBadgeConfig = (type: string): { variant: BadgeVariant } => {
  const configs: Record<string, { variant: BadgeVariant }> = {
    Send: { variant: "secondary" },
    Delivery: { variant: "success" },
    Open: { variant: "info" },
    Click: { variant: "brand" },
    Bounce: { variant: "warning" },
    Complaint: { variant: "destructive" },
    Reject: { variant: "destructive" },
  };

  return configs[type] || { variant: "secondary" };
};

const formatRelativeTime = (timestamp: number) => {
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
            // Sent by the route. This used to be reconstructed by splitting a
            // composite DynamoDB id on "-", which mangles a Postgres UUID.
            const messageId = activity.messageId;
            return (
              <Fragment key={activity.id}>
                <Item asChild>
                  <Link href={`/${orgSlug}/emails/${messageId}`}>
                    <ItemMedia>{getActivityIcon(activity.eventType)}</ItemMedia>
                    <ItemContent>
                      <ItemTitle>{activity.subject}</ItemTitle>
                      <ItemDescription>
                        {formatRelativeTime(activity.timestamp)}
                        {activity.sentAt &&
                          activity.eventType !== "Send" &&
                          activity.timestamp - activity.sentAt >
                            24 * 60 * 60 * 1000 && (
                            <span className="text-muted-foreground">
                              {" "}
                              · sent {formatRelativeTime(activity.sentAt)}
                            </span>
                          )}
                      </ItemDescription>
                    </ItemContent>
                    <Badge
                      className="ml-auto"
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
