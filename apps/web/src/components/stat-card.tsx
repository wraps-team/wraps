"use client";

import { Skeleton } from "@wraps/ui/components/ui/skeleton";
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type StatCardProps = {
  title: string;
  value: string;
  change?: number;
  icon: React.ReactNode;
  trend?: "up" | "down";
  isLoading?: boolean;
  /** Placement in the ruled grid the parent `Panel` draws, e.g. `border-l pl-4`. */
  className?: string;
};

/**
 * One figure in a ruled stat grid. It is a cell, not a card: the `Panel` that
 * holds the grid owns the frame, and the rules between cells come from the
 * caller's `className`.
 */
export function StatCard({
  title,
  value,
  change,
  icon,
  trend = "up",
  isLoading,
  className,
}: StatCardProps) {
  const isPositive = (change ?? 0) >= 0;
  const trendColor =
    trend === "up"
      ? isPositive
        ? "text-success"
        : "text-destructive"
      : isPositive
        ? "text-destructive"
        : "text-success";

  return (
    <div className={cn("py-3", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-2xs text-muted-foreground uppercase tracking-eyebrow">
            {title}
          </p>
          {isLoading ? (
            <>
              <Skeleton className="mt-1.5 h-8 w-24" />
              <Skeleton className="mt-2 h-4 w-32" />
            </>
          ) : (
            <>
              <p className="mt-1.5 font-heading font-semibold text-2xl leading-none tabular-nums">
                {value}
              </p>
              {change !== undefined && (
                <div className="mt-1.5 flex items-center gap-1 text-sm">
                  {isPositive ? (
                    <ArrowUpIcon className={`h-4 w-4 ${trendColor}`} />
                  ) : (
                    <ArrowDownIcon className={`h-4 w-4 ${trendColor}`} />
                  )}
                  <span className={trendColor}>
                    {Math.abs(change).toFixed(1)}% vs last period
                  </span>
                </div>
              )}
            </>
          )}
        </div>
        <div className="shrink-0 text-muted-foreground">{icon}</div>
      </div>
    </div>
  );
}
