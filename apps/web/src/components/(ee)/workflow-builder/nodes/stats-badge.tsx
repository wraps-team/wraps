"use client";

import type { WorkflowNodeStepStats } from "@/actions/(ee)/workflows";

type StatsBadgeProps = {
  stats: WorkflowNodeStepStats;
};

export function StatsBadge({ stats }: StatsBadgeProps) {
  const hasEngagement = stats.sentCount !== undefined && stats.sentCount > 0;

  return (
    <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
      <span className="rounded bg-muted px-1.5 py-0.5">
        {stats.completedCount.toLocaleString()} processed
      </span>

      {/* Condition branch split */}
      {stats.yesBranchCount !== undefined &&
        stats.noBranchCount !== undefined &&
        (stats.yesBranchCount > 0 || stats.noBranchCount > 0) && (
          <>
            <span className="rounded bg-success/15 px-1.5 py-0.5 text-success">
              {stats.yesBranchCount} yes
            </span>
            <span className="rounded bg-destructive/15 px-1.5 py-0.5 text-destructive">
              {stats.noBranchCount} no
            </span>
          </>
        )}

      {/* Email/SMS engagement */}
      {hasEngagement && (
        <>
          <span className="rounded bg-info/15 px-1.5 py-0.5 text-info">
            {stats.sentCount} sent
          </span>
          {(stats.openedCount ?? 0) > 0 && (
            <span className="rounded bg-purple-100 px-1.5 py-0.5 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
              {Math.round(((stats.openedCount ?? 0) / stats.sentCount!) * 100)}%
              opened
            </span>
          )}
          {(stats.clickedCount ?? 0) > 0 && (
            <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">
              {Math.round(((stats.clickedCount ?? 0) / stats.sentCount!) * 100)}
              % clicked
            </span>
          )}
        </>
      )}
    </div>
  );
}
