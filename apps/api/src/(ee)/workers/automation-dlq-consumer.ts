/**
 * Workflow DLQ Consumer
 *
 * Processes messages that failed 3 SQS retries and landed in the dead-letter
 * queue. Marks affected workflow executions as "failed" in the database so
 * they are visible in the dashboard instead of silently expiring.
 *
 * IMPORTANT: This handler must never throw. A throw from a DLQ consumer
 * causes pointless SQS retries with no DLQ-of-DLQ to catch them.
 */

import {
  db,
  eq,
  type TriggerConfig,
  workflow,
  workflowExecution,
} from "@wraps/db";
import type { SQSEvent, SQSHandler } from "aws-lambda";
import { and, sql } from "drizzle-orm";

import { log } from "../../lib/logger";
import type { WorkflowJob } from "../../services/automation-queue";
import { createNextWorkflowSchedule } from "../../services/automation-scheduler";

const TERMINAL_STATUSES = new Set(["completed", "cancelled", "failed"]);

export const handler: SQSHandler = async (event: SQSEvent) => {
  for (const record of event.Records) {
    try {
      const job: WorkflowJob = JSON.parse(record.body);

      log.warn("DLQ: processing failed job", {
        type: job.type,
        messageId: record.messageId,
        receiveCount: record.attributes.ApproximateReceiveCount,
      });

      switch (job.type) {
        case "execute":
          await handleExecute(job);
          break;
        case "resume":
          await handleResume(job);
          break;
        case "trigger":
          await handleTrigger(job);
          break;
        case "schedule-trigger":
          await handleScheduleTrigger(job);
          break;
      }
    } catch (error) {
      // Never throw from a DLQ consumer
      log.error("DLQ: failed to process record", error, {
        messageId: record.messageId,
        body: record.body.slice(0, 500),
      });
    }
  }
};

async function handleExecute(job: Extract<WorkflowJob, { type: "execute" }>) {
  await failExecution(
    job.executionId,
    `Step ${job.stepId} failed after SQS retries exhausted`,
    job.stepId
  );
}

async function handleResume(job: Extract<WorkflowJob, { type: "resume" }>) {
  // Load execution to get currentStepId
  const execution = await db
    .select({
      id: workflowExecution.id,
      status: workflowExecution.status,
      currentStepId: workflowExecution.currentStepId,
    })
    .from(workflowExecution)
    .where(eq(workflowExecution.id, job.executionId))
    .limit(1);

  if (!execution[0]) {
    log.warn("DLQ: resume — execution not found", {
      executionId: job.executionId,
    });
    return;
  }

  if (TERMINAL_STATUSES.has(execution[0].status)) {
    log.info("DLQ: resume — execution already terminal", {
      executionId: job.executionId,
      status: execution[0].status,
    });
    return;
  }

  await failExecution(
    job.executionId,
    `Resume (${job.branch}) failed after SQS retries exhausted`,
    execution[0].currentStepId ?? "unknown"
  );
}

async function handleTrigger(job: Extract<WorkflowJob, { type: "trigger" }>) {
  // Check if an execution was created before the failure
  const executions = await db
    .select({
      id: workflowExecution.id,
      status: workflowExecution.status,
    })
    .from(workflowExecution)
    .where(
      and(
        eq(workflowExecution.workflowId, job.workflowId),
        eq(workflowExecution.contactId, job.contactId),
        sql`${workflowExecution.status} IN ('pending', 'active', 'paused', 'waiting')`
      )
    )
    .limit(1);

  if (executions[0]) {
    await failExecution(
      executions[0].id,
      "Trigger failed after SQS retries exhausted",
      "trigger"
    );
    return;
  }

  log.warn("DLQ: trigger — no active execution found, nothing to fail", {
    workflowId: job.workflowId,
    contactId: job.contactId,
  });
}

async function handleScheduleTrigger(
  job: Extract<WorkflowJob, { type: "schedule-trigger" }>
) {
  const [wf] = await db
    .select({
      id: workflow.id,
      organizationId: workflow.organizationId,
      status: workflow.status,
      triggerType: workflow.triggerType,
      triggerConfig: workflow.triggerConfig,
    })
    .from(workflow)
    .where(eq(workflow.id, job.workflowId))
    .limit(1);

  if (!wf || wf.status !== "enabled" || wf.triggerType !== "schedule") {
    log.warn("DLQ: schedule-trigger — workflow not eligible for chain repair", {
      workflowId: job.workflowId,
      status: wf?.status,
      triggerType: wf?.triggerType,
    });
    return;
  }

  const config = wf.triggerConfig as TriggerConfig;
  if (!config.schedule) {
    log.warn("DLQ: schedule-trigger — no cron expression", {
      workflowId: job.workflowId,
    });
    return;
  }

  try {
    await createNextWorkflowSchedule({
      workflowId: wf.id,
      organizationId: wf.organizationId,
      cronExpression: config.schedule,
      timezone: config.timezone,
    });
    log.info("DLQ: schedule-trigger — chain repaired", {
      workflowId: wf.id,
    });
  } catch (error) {
    log.error("DLQ: schedule-trigger — chain repair failed", error, {
      workflowId: wf.id,
    });
  }
}

/**
 * Mark an execution as failed and update workflow counters.
 *
 * Duplicated from workflow-processor to avoid pulling in SES/Pinpoint/Handlebars
 * transitive dependencies into this lightweight Lambda.
 */
async function failExecution(
  executionId: string,
  error: string,
  stepId: string
): Promise<void> {
  const [execution] = await db
    .update(workflowExecution)
    .set({
      status: "failed",
      error,
      errorStepId: stepId,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(workflowExecution.id, executionId))
    .returning();

  if (execution) {
    await db
      .update(workflow)
      .set({
        activeExecutions: sql`GREATEST(0, ${workflow.activeExecutions} - 1)`,
        failedExecutions: sql`${workflow.failedExecutions} + 1`,
      })
      .where(eq(workflow.id, execution.workflowId));

    log.warn("DLQ: execution marked as failed", {
      executionId,
      workflowId: execution.workflowId,
      error,
      stepId,
    });
  } else {
    log.warn("DLQ: failExecution returned no rows", { executionId });
  }
}
