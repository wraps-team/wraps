/**
 * Workflow Scheduler Service
 *
 * Manages one-time EventBridge Schedules for schedule-triggered workflows.
 * Uses croner to compute the next run time from a cron expression, then
 * creates a one-time at() schedule that fires at that exact moment.
 * When the schedule fires, the processor chains the next one.
 */

import {
  CreateScheduleCommand,
  DeleteScheduleCommand,
  GetScheduleCommand,
  SchedulerClient,
  UpdateScheduleCommand,
} from "@aws-sdk/client-scheduler";
import { db, eq, type TriggerConfig, workflow } from "@wraps/db";
import { Cron } from "croner";
import { and, lt, sql } from "drizzle-orm";

import { awsDefaults } from "../../lib/aws-defaults";
import { log } from "../../lib/logger";
import {
  formatScheduleExpression,
  type WorkflowJob,
} from "../../services/workflow-queue";

const scheduler = new SchedulerClient(awsDefaults);

const WORKFLOW_QUEUE_ARN = process.env.WORKFLOW_QUEUE_ARN;
const SCHEDULE_GROUP = process.env.SCHEDULER_GROUP_NAME || "wraps-workflows";
const SCHEDULER_ROLE_ARN = process.env.SCHEDULER_ROLE_ARN;
const IS_PRODUCTION = process.env.NODE_ENV === "production";

/**
 * Generate a deterministic schedule name for a workflow.
 * Only one pending schedule per workflow at a time.
 */
function getScheduleName(workflowId: string): string {
  return `wraps-wf-sched-${workflowId.slice(0, 8)}`;
}

/**
 * Create the next one-time EventBridge Schedule for a schedule-triggered workflow.
 *
 * Uses croner to compute nextRun() from the cron expression + timezone,
 * then creates an at() schedule targeting the workflow SQS queue.
 */
export async function createNextWorkflowSchedule(params: {
  workflowId: string;
  organizationId: string;
  cronExpression: string;
  timezone?: string;
}): Promise<string | null> {
  const { workflowId, organizationId, cronExpression, timezone } = params;

  // Compute next run time
  const cron = new Cron(cronExpression, {
    timezone: timezone || "UTC",
  });

  const nextRun = cron.nextRun();

  if (!nextRun) {
    log.warn("Scheduler: no future run time, chain ends", {
      workflowId,
      cronExpression,
    });
    return null;
  }

  const scheduleName = getScheduleName(workflowId);

  if (!(SCHEDULER_ROLE_ARN && WORKFLOW_QUEUE_ARN)) {
    if (IS_PRODUCTION) {
      throw new Error(
        "EventBridge Scheduler not configured for workflow schedules"
      );
    }
    log.warn("Scheduler: skipping schedule creation, config not set", {
      workflowId,
      nextRun: nextRun.toISOString(),
    });
    return scheduleName;
  }

  const scheduleExpression = formatScheduleExpression(nextRun);

  log.info("Scheduler: creating schedule", {
    scheduleName,
    workflowId,
    nextRun: nextRun.toISOString(),
  });

  await scheduler.send(
    new CreateScheduleCommand({
      Name: scheduleName,
      GroupName: SCHEDULE_GROUP,
      ScheduleExpression: scheduleExpression,
      ScheduleExpressionTimezone: "UTC",
      FlexibleTimeWindow: { Mode: "OFF" },
      ActionAfterCompletion: "DELETE",
      Target: {
        Arn: WORKFLOW_QUEUE_ARN,
        RoleArn: SCHEDULER_ROLE_ARN,
        Input: JSON.stringify({
          type: "schedule-trigger",
          workflowId,
          organizationId,
        } satisfies WorkflowJob),
      },
    })
  );

  return scheduleName;
}

/**
 * Delete the pending schedule for a workflow.
 * Handles ResourceNotFoundException gracefully (schedule may have already fired).
 */
export async function deleteWorkflowSchedule(
  workflowId: string
): Promise<void> {
  const scheduleName = getScheduleName(workflowId);

  if (!SCHEDULER_ROLE_ARN) {
    if (!IS_PRODUCTION) {
      log.warn("Scheduler: skipping schedule deletion, config not set");
      return;
    }
    return;
  }

  try {
    await scheduler.send(
      new DeleteScheduleCommand({
        Name: scheduleName,
        GroupName: SCHEDULE_GROUP,
      })
    );
    log.info("Scheduler: deleted schedule", { scheduleName, workflowId });
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "ResourceNotFoundException") {
      // Schedule already fired and auto-deleted, or never existed
      return;
    }
    throw error;
  }
}

/**
 * Atomically update the cron expression for a pending workflow schedule.
 *
 * Uses UpdateScheduleCommand instead of delete+create to avoid the race window
 * where no schedule exists between the two operations.
 */
export async function updateWorkflowSchedule(params: {
  workflowId: string;
  organizationId: string;
  cronExpression: string;
  timezone?: string;
}): Promise<string | null> {
  const { workflowId, organizationId, cronExpression, timezone } = params;

  const cron = new Cron(cronExpression, { timezone: timezone || "UTC" });
  const nextRun = cron.nextRun();

  if (!nextRun) {
    log.warn("Scheduler: no future run time, schedule not updated", {
      workflowId,
      cronExpression,
    });
    return null;
  }

  const scheduleName = getScheduleName(workflowId);

  if (!(SCHEDULER_ROLE_ARN && WORKFLOW_QUEUE_ARN)) {
    if (IS_PRODUCTION) {
      throw new Error(
        "EventBridge Scheduler not configured for workflow schedules"
      );
    }
    log.warn("Scheduler: skipping schedule update, config not set", {
      workflowId,
      nextRun: nextRun.toISOString(),
    });
    return scheduleName;
  }

  const scheduleExpression = formatScheduleExpression(nextRun);

  log.info("Scheduler: updating schedule", {
    scheduleName,
    workflowId,
    nextRun: nextRun.toISOString(),
  });

  try {
    await scheduler.send(
      new UpdateScheduleCommand({
        Name: scheduleName,
        GroupName: SCHEDULE_GROUP,
        ScheduleExpression: scheduleExpression,
        ScheduleExpressionTimezone: "UTC",
        FlexibleTimeWindow: { Mode: "OFF" },
        ActionAfterCompletion: "DELETE",
        Target: {
          Arn: WORKFLOW_QUEUE_ARN,
          RoleArn: SCHEDULER_ROLE_ARN,
          Input: JSON.stringify({
            type: "schedule-trigger",
            workflowId,
            organizationId,
          } satisfies WorkflowJob),
        },
      })
    );
  } catch (error) {
    if (error instanceof Error && error.name === "ResourceNotFoundException") {
      // Schedule fired and self-deleted (ActionAfterCompletion=DELETE) before the
      // update arrived. Fall back to creating the next schedule from scratch.
      log.warn("Scheduler: schedule not found for update, recreating", {
        scheduleName,
        workflowId,
      });
      return createNextWorkflowSchedule({
        workflowId,
        organizationId,
        cronExpression,
        timezone,
      });
    }
    throw error;
  }

  return scheduleName;
}

/**
 * Reconcile schedule chains for all enabled scheduled workflows.
 *
 * Checks EventBridge for each workflow's expected schedule. If missing
 * (ResourceNotFoundException), re-creates the next schedule to repair the chain.
 */
export async function reconcileScheduleChains(): Promise<{
  checked: number;
  repaired: number;
  errors: number;
  details: Array<{ workflowId: string; action: string; error?: string }>;
}> {
  const details: Array<{
    workflowId: string;
    action: string;
    error?: string;
  }> = [];

  if (!(SCHEDULER_ROLE_ARN && WORKFLOW_QUEUE_ARN)) {
    if (!IS_PRODUCTION) {
      log.warn("Reconciliation: skipping, scheduler not configured");
      return { checked: 0, repaired: 0, errors: 0, details };
    }
    throw new Error(
      "EventBridge Scheduler not configured for workflow schedules"
    );
  }

  // biome-ignore lint/plugin: privileged system Lambda; reconciles EventBridge schedules for all orgs' scheduled workflows by design.
  const workflows = await db
    .select({
      id: workflow.id,
      organizationId: workflow.organizationId,
      triggerConfig: workflow.triggerConfig,
    })
    .from(workflow)
    .where(
      and(
        eq(workflow.status, "enabled"),
        eq(workflow.triggerType, "schedule"),
        // Skip recently-updated workflows to avoid racing with in-flight enable/disable operations
        lt(workflow.updatedAt, sql`NOW() - INTERVAL '5 minutes'`)
      )
    );

  let repaired = 0;
  let errors = 0;

  for (const wf of workflows) {
    const config = wf.triggerConfig as TriggerConfig;
    if (!config.schedule) {
      continue;
    }

    const scheduleName = getScheduleName(wf.id);

    try {
      await scheduler.send(
        new GetScheduleCommand({
          Name: scheduleName,
          GroupName: SCHEDULE_GROUP,
        })
      );
      details.push({ workflowId: wf.id, action: "healthy" });
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        error.name === "ResourceNotFoundException"
      ) {
        try {
          await createNextWorkflowSchedule({
            workflowId: wf.id,
            organizationId: wf.organizationId,
            cronExpression: config.schedule,
            timezone: config.timezone,
          });
          repaired++;
          details.push({ workflowId: wf.id, action: "repaired" });
          log.info("Reconciliation: repaired broken chain", {
            workflowId: wf.id,
          });
        } catch (repairError) {
          errors++;
          details.push({
            workflowId: wf.id,
            action: "repair_failed",
            error:
              repairError instanceof Error
                ? repairError.message
                : String(repairError),
          });
        }
      } else {
        errors++;
        details.push({
          workflowId: wf.id,
          action: "check_failed",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  log.info("Reconciliation: complete", {
    checked: workflows.length,
    repaired,
    errors,
  });

  return { checked: workflows.length, repaired, errors, details };
}
