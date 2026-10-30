"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import {
  type MailIcon,
  SendIcon,
  SparklesIcon,
  WorkflowIcon,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { RecentItem } from "../page";

const typeConfig: Record<
  RecentItem["type"],
  { icon: typeof MailIcon; color: string; label: string }
> = {
  broadcast: {
    icon: SendIcon,
    color: "text-info",
    label: "Broadcast",
  },
  event: {
    icon: SparklesIcon,
    color: "text-purple-600 dark:text-purple-400",
    label: "Event",
  },
  workflow: {
    icon: WorkflowIcon,
    color: "text-warning",
    label: "Workflow",
  },
};

function formatTimestamp(timestamp: number) {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (minutes < 1) {
    return "now";
  }
  if (minutes < 60) {
    return `${minutes}m`;
  }
  if (hours < 24) {
    return `${hours}h`;
  }
  return `${days}d`;
}

type ActivityFeedProps = {
  orgSlug: string;
  recentItems: RecentItem[];
};

export function ActivityFeed({ recentItems }: ActivityFeedProps) {
  if (recentItems.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            No recent activity
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {recentItems.map((item) => {
          const config = typeConfig[item.type];
          const Icon = config.icon;
          return (
            <Link
              className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/50 transition-colors"
              href={item.href}
              key={item.id}
            >
              <Icon className={cn("h-3.5 w-3.5 shrink-0", config.color)} />
              <span className="text-sm truncate flex-1 min-w-0">
                {item.title}
              </span>
              {item.subtitle && (
                <span className="text-xs text-muted-foreground truncate max-w-[120px] hidden sm:inline">
                  {item.subtitle}
                </span>
              )}
              <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                {formatTimestamp(item.timestamp)}
              </span>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}
