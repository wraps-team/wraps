"use client";

import { cn } from "@wraps/ui/lib/utils";
import type { ReputationStatus } from "../lib/sample-data";

type ThresholdBarProps = {
  value: number;
  reviewAt: number;
  pausedAt: number;
  max?: number;
  status: ReputationStatus;
  format?: (v: number) => string;
};

export function ThresholdBar({
  value,
  reviewAt,
  pausedAt,
  max = pausedAt * 1.2,
  status,
  format = (v) => `${v}%`,
}: ThresholdBarProps) {
  const pct = (v: number) => `${Math.min((v / max) * 100, 100)}%`;
  const markerColor =
    status === "healthy"
      ? "bg-success"
      : status === "review"
        ? "bg-warning"
        : "bg-destructive";

  return (
    <div className="space-y-2">
      <div
        aria-label={`Current value ${format(value)}. Review line at ${format(
          reviewAt
        )}, paused line at ${format(pausedAt)}.`}
        aria-valuemax={max}
        aria-valuemin={0}
        aria-valuenow={value}
        className="relative h-3 w-full overflow-hidden rounded-full"
        role="meter"
      >
        {/* Zone bands */}
        <div className="absolute inset-0 bg-success/25" />
        <div
          className="absolute inset-y-0 bg-warning/30"
          style={{ left: pct(reviewAt), right: `calc(100% - ${pct(pausedAt)})` }}
        />
        <div
          className="absolute inset-y-0 right-0 bg-destructive/30"
          style={{ left: pct(pausedAt) }}
        />
        {/* Value marker */}
        <div
          className={cn(
            "absolute top-1/2 h-5 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-background motion-safe:transition-all",
            markerColor
          )}
          style={{ left: pct(value) }}
        />
      </div>
      <div className="relative h-4 text-muted-foreground text-xs">
        <span className="absolute left-0">0</span>
        <span
          className="absolute -translate-x-1/2 text-warning"
          style={{ left: pct(reviewAt) }}
        >
          review {format(reviewAt)}
        </span>
        <span
          className="absolute -translate-x-1/2 text-destructive"
          style={{ left: pct(pausedAt) }}
        >
          paused {format(pausedAt)}
        </span>
      </div>
    </div>
  );
}
