/**
 * Workflow Execution Cancel Service
 *
 * Cancels active workflow executions, cleans up schedulers,
 * and adjusts workflow stats atomically.
 */

import { db, eq, workflow, workflowExecution } from "@wraps/db";
import { and, sql } from "drizzle-orm";

import { log } from "../lib/logger";
import { deleteScheduledStep } from "./workflow-queue";

const CANCELLABLE_STATUSES = new Set([
  "pending",
  "active",
  "paused",
  "waiting",
]);

type CancelResult = { success: true } | { success: false; error: string };

export async function cancelWorkflowExecution(params: {
  executionId: string;
  organizationId: string;
}): Promise<CancelResult> {
  const { executionId, organizationId } = params;

  // Load execution with org scoping
  const [exec] = await db
    .select()
    .from(workflowExecution)
    .where(
      and(
        eq(workflowExecution.id, executionId),
        eq(workflowExecution.organizationId, organizationId)
      )
    )
    .limit(1);

  if (!exec) {
    return { success: false, error: "Execution not found" };
  }

  if (!CANCELLABLE_STATUSES.has(exec.status)) {
    return {
      success: false,
      error: `Execution in "${exec.status}" status cannot be cancelled`,
    };
  }

  // Clean up any scheduled steps
  const cleanups: Promise<void>[] = [];
  if (exec.delaySchedulerName) {
    cleanups.push(
      deleteScheduledStep(exec.delaySchedulerName).catch((err) => {
        log.error("Failed to delete delay scheduler during cancel", err, {
          schedulerName: exec.delaySchedulerName,
        });
      })
    );
  }
  if (exec.waitTimeoutSchedulerName) {
    cleanups.push(
      deleteScheduledStep(exec.waitTimeoutSchedulerName).catch((err) => {
        log.error("Failed to delete timeout scheduler during cancel", err, {
          schedulerName: exec.waitTimeoutSchedulerName,
        });
      })
    );
  }
  await Promise.all(cleanups);

  // Atomically cancel execution and adjust workflow stats.
  // WHERE includes status check to prevent double-cancel race.
  const claimed = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(workflowExecution)
      .set({
        status: "cancelled",
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(workflowExecution.id, executionId),
          sql`${workflowExecution.status} IN ('pending', 'active', 'paused', 'waiting')`
        )
      )
      .returning({ id: workflowExecution.id });

    if (!updated) return false;

    await tx
      .update(workflow)
      .set({
        activeExecutions: sql`GREATEST(0, ${workflow.activeExecutions} - 1)`,
      })
      .where(eq(workflow.id, exec.workflowId));

    return true;
  });

  if (!claimed) {
    return {
      success: false,
      error: "Execution was already cancelled or is no longer active",
    };
  }

  log.info("Workflow execution cancelled", {
    executionId: exec.id,
    workflowId: exec.workflowId,
    previousStatus: exec.status,
  });

  return { success: true };
}
