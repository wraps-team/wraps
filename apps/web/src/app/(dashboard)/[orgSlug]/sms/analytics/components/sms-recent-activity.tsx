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
  AlertTriangle,
  CheckCircle2,
  Clock,
  MessageSquare,
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
import { useSMSRecentActivity } from "../hooks/use-sms-analytics";

const getActivityIcon = (status: string) => {
  const statusLower = status.toLowerCase();

  if (statusLower === "delivered" || statusLower === "delivery") {
    return <CheckCircle2 className="h-4 w-4 text-success" />;
  }
  if (statusLower === "queued" || statusLower === "pending") {
    return <Clock className="h-4 w-4 text-muted-foreground" />;
  }
  if (statusLower === "sent") {
    return <MessageSquare className="h-4 w-4 text-info" />;
  }
  if (
    statusLower === "failed" ||
    statusLower === "failure" ||
    statusLower === "blocked"
  ) {
    return <XCircle className="h-4 w-4 text-destructive" />;
  }
  if (statusLower === "invalid" || statusLower.includes("unreachable")) {
    return <AlertTriangle className="h-4 w-4 text-warning" />;
  }
  return <Clock className="h-4 w-4 text-muted-foreground" />;
};

type BadgeVariant = ComponentProps<typeof Badge>["variant"];

const getActivityBadgeConfig = (
  status: string
): { variant: BadgeVariant; label: string } => {
  const statusLower = status.toLowerCase();

  const configs: Record<string, { variant: BadgeVariant; label: string }> = {
    delivered: { variant: "success", label: "Delivered" },
    delivery: { variant: "success", label: "Delivered" },
    sent: { variant: "info", label: "Sent" },
    queued: { variant: "secondary", label: "Queued" },
    pending: { variant: "secondary", label: "Pending" },
    failed: { variant: "destructive", label: "Failed" },
    failure: { variant: "destructive", label: "Failed" },
    blocked: { variant: "destructive", label: "Blocked" },
    invalid: { variant: "warning", label: "Invalid" },
  };

  return configs[statusLower] || { variant: "secondary", label: status };
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

const formatPhoneNumber = (phone: string) => {
  // Format as +1 (XXX) XXX-XXXX for US numbers
  if (phone.startsWith("+1") && phone.length === 12) {
    return `+1 (${phone.slice(2, 5)}) ${phone.slice(5, 8)}-${phone.slice(8)}`;
  }
  return phone;
};

export function SMSRecentActivity({ orgSlug }: { orgSlug: string }) {
  const {
    data: activities,
    isLoading,
    error,
  } = useSMSRecentActivity(orgSlug, 20);

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
            const badgeConfig = getActivityBadgeConfig(activity.eventStatus);
            return (
              <Fragment key={activity.id}>
                <Item asChild>
                  <Link href={`/${orgSlug}/sms/${messageId}`}>
                    <ItemMedia>
                      {getActivityIcon(activity.eventStatus)}
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>
                        {formatPhoneNumber(activity.destinationNumber)}
                      </ItemTitle>
                      <ItemDescription>
                        {formatTimestamp(activity.timestamp)}
                        {activity.segments && activity.segments > 1 && (
                          <span className="ml-2">
                            ({activity.segments} segments)
                          </span>
                        )}
                      </ItemDescription>
                    </ItemContent>
                    <Badge className="ml-auto" variant={badgeConfig.variant}>
                      {badgeConfig.label}
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
