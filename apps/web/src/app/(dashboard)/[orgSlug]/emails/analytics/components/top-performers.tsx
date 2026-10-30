"use client";

import { Badge } from "@wraps/ui/components/ui/badge";
import { Panel, PanelTitle } from "@wraps/ui/components/ui/panel";
import { Skeleton } from "@wraps/ui/components/ui/skeleton";
import { TrendingUp } from "lucide-react";
import { useTopPerformers } from "../hooks/use-analytics";

const label = (
  <PanelTitle className="flex items-center gap-2">
    <TrendingUp className="h-5 w-5 text-success" />
    Top Performing Emails
  </PanelTitle>
);

export function TopPerformers({ orgSlug }: { orgSlug: string }) {
  const {
    data: topEmails,
    isLoading,
    error,
  } = useTopPerformers(orgSlug, 30, 5);

  if (isLoading) {
    return (
      <Panel label={label}>
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div className="space-y-2" key={i}>
              <Skeleton className="h-12 w-full" />
            </div>
          ))}
        </div>
      </Panel>
    );
  }

  if (error || !topEmails || topEmails.length === 0) {
    return (
      <Panel label={label}>
        <p className="text-center text-muted-foreground text-sm">
          {error
            ? "Failed to load top performers"
            : "No email data available yet"}
        </p>
      </Panel>
    );
  }

  return (
    <Panel label={label}>
      <div className="space-y-4">
        {topEmails.map((email, index) => (
          <div
            className="space-y-2 border p-4 transition-colors hover:bg-accent"
            key={`${email.subject}-${email.sent}-${index}`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="line-clamp-2 font-medium text-sm leading-tight">
                {email.subject}
              </p>
              <Badge className="shrink-0" variant="secondary">
                #{index + 1}
              </Badge>
            </div>
            <div className="flex items-center gap-3 text-muted-foreground text-xs">
              <div className="flex items-center gap-1">
                <span className="font-medium text-success">
                  {email.openRate}%
                </span>
                <span>opens</span>
              </div>
              <div className="h-1 w-1 rounded-full bg-muted-foreground" />
              <div className="flex items-center gap-1">
                <span className="font-medium text-info">
                  {email.clickRate}%
                </span>
                <span>clicks</span>
              </div>
              <div className="h-1 w-1 rounded-full bg-muted-foreground" />
              <span>{email.sent.toLocaleString()} sent</span>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
