import { db, eq, workflow, workflowExecution } from "@wraps/db";
import { sql } from "drizzle-orm";

export type ReconcileResult = {
  workflowId: string;
  before: {
    totalExecutions: number;
    activeExecutions: number;
    completedExecutions: number;
    failedExecutions: number;
  };
  actual: {
    totalExecutions: number;
    activeExecutions: number;
    completedExecutions: number;
    failedExecutions: number;
  };
  drifted: boolean;
};

const ACTIVE_STATUSES = new Set(["active", "pending", "paused", "waiting"]);

export async function reconcileWorkflowStats(
  workflowId: string,
  options?: { fix?: boolean }
): Promise<ReconcileResult> {
  // Load current denormalized stats
  const [wf] = await db
    .select({
      id: workflow.id,
      totalExecutions: workflow.totalExecutions,
      activeExecutions: workflow.activeExecutions,
      completedExecutions: workflow.completedExecutions,
      failedExecutions: workflow.failedExecutions,
    })
    .from(workflow)
    .where(eq(workflow.id, workflowId));

  // Count actual executions grouped by status
  const counts = await db
    .select({
      status: workflowExecution.status,
      count: sql<number>`count(*)::int`,
    })
    .from(workflowExecution)
    .where(eq(workflowExecution.workflowId, workflowId))
    .groupBy(workflowExecution.status);

  // Compute actual totals
  let totalExecutions = 0;
  let activeExecutions = 0;
  let completedExecutions = 0;
  let failedExecutions = 0;

  for (const row of counts) {
    totalExecutions += row.count;
    if (ACTIVE_STATUSES.has(row.status)) {
      activeExecutions += row.count;
    } else if (row.status === "completed") {
      completedExecutions = row.count;
    } else if (row.status === "failed") {
      failedExecutions = row.count;
    }
    // "cancelled" counts toward total but not active/completed/failed
  }

  const before = {
    totalExecutions: wf.totalExecutions,
    activeExecutions: wf.activeExecutions,
    completedExecutions: wf.completedExecutions,
    failedExecutions: wf.failedExecutions,
  };

  const actual = {
    totalExecutions,
    activeExecutions,
    completedExecutions,
    failedExecutions,
  };

  const drifted =
    before.totalExecutions !== actual.totalExecutions ||
    before.activeExecutions !== actual.activeExecutions ||
    before.completedExecutions !== actual.completedExecutions ||
    before.failedExecutions !== actual.failedExecutions;

  if (drifted && options?.fix) {
    await db
      .update(workflow)
      .set({
        totalExecutions: actual.totalExecutions,
        activeExecutions: actual.activeExecutions,
        completedExecutions: actual.completedExecutions,
        failedExecutions: actual.failedExecutions,
      })
      .where(eq(workflow.id, workflowId));
  }

  return { workflowId, before, actual, drifted };
}
