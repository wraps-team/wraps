"use client";

import { TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useTopPerformers } from "../hooks/use-analytics";

export function TopPerformers({ orgSlug }: { orgSlug: string }) {
  const {
    data: topEmails,
    isLoading,
    error,
  } = useTopPerformers(orgSlug, 30, 5);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-green-500" />
            Top Performing Emails
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div className="space-y-2" key={i}>
              <Skeleton className="h-12 w-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error || !topEmails || topEmails.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-green-500" />
            Top Performing Emails
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground text-sm">
            {error
              ? "Failed to load top performers"
              : "No email data available yet"}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-green-500" />
          Top Performing Emails
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {topEmails.map((email, index) => (
          <div
            className="space-y-2 rounded-lg border p-3 transition-colors hover:bg-accent"
            key={index}
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
                <span className="font-medium text-green-600 dark:text-green-400">
                  {email.openRate}%
                </span>
                <span>opens</span>
              </div>
              <div className="h-1 w-1 rounded-full bg-muted-foreground" />
              <div className="flex items-center gap-1">
                <span className="font-medium text-blue-600 dark:text-blue-400">
                  {email.clickRate}%
                </span>
                <span>clicks</span>
              </div>
              <div className="h-1 w-1 rounded-full bg-muted-foreground" />
              <span>{email.sent.toLocaleString()} sent</span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
