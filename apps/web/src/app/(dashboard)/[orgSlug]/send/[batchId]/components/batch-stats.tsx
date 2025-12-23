"use client";

import {
  CheckCircle,
  Clock,
  Loader2,
  Mail,
  MousePointer,
  RefreshCw,
  Send,
  XCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { BATCH_STATUS_COLORS, BATCH_STATUS_LABELS } from "@/lib/batch";

// Inline helper functions for batch calculations
function calculateProgress(batch: {
  processedRecipients: number;
  totalRecipients: number;
}): number {
  return batch.totalRecipients === 0
    ? 0
    : Math.round((batch.processedRecipients / batch.totalRecipients) * 100);
}

function calculateDeliveryRate(batch: {
  delivered: number;
  sent: number;
}): number {
  return batch.sent === 0
    ? 0
    : Math.round((batch.delivered / batch.sent) * 100);
}

function calculateOpenRate(batch: {
  opened: number;
  delivered: number;
}): number {
  return batch.delivered === 0
    ? 0
    : Math.round((batch.opened / batch.delivered) * 100);
}

function calculateClickRate(batch: {
  clicked: number;
  delivered: number;
}): number {
  return batch.delivered === 0
    ? 0
    : Math.round((batch.clicked / batch.delivered) * 100);
}

function formatDuration(
  startedAt: Date | null,
  completedAt: Date | null
): string {
  if (!startedAt) return "-";
  const end = completedAt ?? new Date();
  const diffMs = end.getTime() - new Date(startedAt).getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return `${diffSec}s`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ${diffSec % 60}s`;
  const diffHour = Math.floor(diffMin / 60);
  return `${diffHour}h ${diffMin % 60}m`;
}

type BatchStatsProps = {
  batch: {
    id: string;
    status: string;
    channel: string;
    totalRecipients: number;
    processedRecipients: number;
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    bounced: number;
    complained: number;
    failed: number;
    startedAt: Date | null;
    completedAt: Date | null;
  };
  organizationId: string;
};

export function BatchStats({
  batch: initialBatch,
  organizationId,
}: BatchStatsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [autoRefresh, setAutoRefresh] = useState(
    initialBatch.status === "processing" || initialBatch.status === "queued"
  );

  // Use initial batch data - router.refresh() will update via server component
  const batch = initialBatch;

  const progress = calculateProgress(batch);
  const deliveryRate = calculateDeliveryRate(batch);
  const openRate = calculateOpenRate(batch);
  const clickRate = calculateClickRate(batch);

  const refresh = useCallback(() => {
    startTransition(() => {
      router.refresh();
      setLastRefresh(new Date());
    });
  }, [router]);

  // Auto-refresh when batch is processing
  useEffect(() => {
    if (!autoRefresh) return;

    // Refresh every 5 seconds while processing
    const interval = setInterval(() => {
      refresh();
    }, 5000);

    return () => clearInterval(interval);
  }, [autoRefresh, refresh]);

  // Stop auto-refresh when batch is complete
  useEffect(() => {
    if (
      batch.status === "completed" ||
      batch.status === "failed" ||
      batch.status === "cancelled"
    ) {
      setAutoRefresh(false);
    }
  }, [batch.status]);

  return (
    <div className="space-y-6">
      {/* Status Badge with Refresh */}
      <div className="flex items-center justify-between">
        <Badge
          className={
            BATCH_STATUS_COLORS[
              batch.status as keyof typeof BATCH_STATUS_COLORS
            ]
          }
          variant="secondary"
        >
          {batch.status === "processing" && (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          )}
          {batch.status === "completed" && (
            <CheckCircle className="mr-1 h-3 w-3" />
          )}
          {batch.status === "failed" && <XCircle className="mr-1 h-3 w-3" />}
          {batch.status === "queued" && <Clock className="mr-1 h-3 w-3" />}
          {
            BATCH_STATUS_LABELS[
              batch.status as keyof typeof BATCH_STATUS_LABELS
            ]
          }
        </Badge>

        <div className="flex items-center gap-2">
          {autoRefresh && (
            <span className="text-muted-foreground text-xs">
              Auto-refreshing...
            </span>
          )}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  disabled={isPending}
                  onClick={refresh}
                  size="sm"
                  variant="outline"
                >
                  <RefreshCw
                    className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`}
                  />
                  <span className="sr-only">Refresh</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  Refresh stats
                  <br />
                  <span className="text-muted-foreground text-xs">
                    Last updated: {lastRefresh.toLocaleTimeString()}
                  </span>
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Progress */}
      {batch.status !== "draft" && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Progress</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>
                  {batch.processedRecipients} of {batch.totalRecipients}{" "}
                  processed
                </span>
                <span>{progress}%</span>
              </div>
              <Progress className="h-3" value={progress} />
            </div>
            <div className="flex justify-between text-muted-foreground text-sm">
              <span>
                Started:{" "}
                {batch.startedAt
                  ? new Date(batch.startedAt).toLocaleString()
                  : "Not started"}
              </span>
              <span>
                Duration: {formatDuration(batch.startedAt, batch.completedAt)}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Sent */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="font-medium text-sm">Sent</CardTitle>
            <Send className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">{batch.sent}</div>
            <p className="text-muted-foreground text-xs">
              {batch.failed > 0 && (
                <span className="text-destructive">{batch.failed} failed</span>
              )}
            </p>
          </CardContent>
        </Card>

        {/* Delivered */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="font-medium text-sm">Delivered</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">{batch.delivered}</div>
            <p className="text-muted-foreground text-xs">
              {deliveryRate}% rate
            </p>
          </CardContent>
        </Card>

        {/* Opened (email only) */}
        {batch.channel === "email" && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="font-medium text-sm">Opened</CardTitle>
              <Mail className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="font-bold text-2xl">{batch.opened}</div>
              <p className="text-muted-foreground text-xs">{openRate}% rate</p>
            </CardContent>
          </Card>
        )}

        {/* Clicked */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="font-medium text-sm">Clicked</CardTitle>
            <MousePointer className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">{batch.clicked}</div>
            <p className="text-muted-foreground text-xs">{clickRate}% rate</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
