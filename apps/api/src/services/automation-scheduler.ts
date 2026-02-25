/**
 * Automation Scheduler Service
 *
 * Manages one-time EventBridge Schedules for schedule-triggered automations.
 * Uses croner to compute the next run time from a cron expression, then
 * creates a one-time at() schedule that fires at that exact moment.
 * When the schedule fires, the processor chains the next one.
 */

import {
  CreateScheduleCommand,
  DeleteScheduleCommand,
  GetScheduleCommand,
  SchedulerClient,
} from "@aws-sdk/client-scheduler";
import { db, eq, type TriggerConfig, automation } from "@wraps/db";
import { Cron } from "croner";
import { and } from "drizzle-orm";

import { log } from "../lib/logger";
import { formatScheduleExpression, type AutomationJob } from "./automation-queue";

const scheduler = new SchedulerClient({});

const WORKFLOW_QUEUE_ARN = process.env.WORKFLOW_QUEUE_ARN;
const SCHEDULE_GROUP = process.env.SCHEDULER_GROUP_NAME || "wraps-workflows";
const SCHEDULER_ROLE_ARN = process.env.SCHEDULER_ROLE_ARN;
const IS_PRODUCTION = process.env.NODE_ENV === "production";

/**
 * Generate a deterministic schedule name for an automation.
 * Only one pending schedule per automation at a time.
 */
function getScheduleName(automationId: string): string {
  return `wraps-wf-sched-${automationId.slice(0, 8)}`;
}

/**
 * Create the next one-time EventBridge Schedule for a schedule-triggered automation.
 *
 * Uses croner to compute nextRun() from the cron expression + timezone,
 * then creates an at() schedule targeting the automation SQS queue.
 */
export async function createNextAutomationSchedule(params: {
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
        "EventBridge Scheduler not configured for automation schedules"
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
        } satisfies AutomationJob),
      },
    })
  );

  return scheduleName;
}

/** @deprecated Use `createNextAutomationSchedule` instead */
export const createNextWorkflowSchedule = createNextAutomationSchedule;

/**
 * Delete the pending schedule for an automation.
 * Handles ResourceNotFoundException gracefully (schedule may have already fired).
 */
export async function deleteAutomationSchedule(
  automationId: string
): Promise<void> {
  const scheduleName = getScheduleName(automationId);

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
    log.info("Scheduler: deleted schedule", {
      scheduleName,
      automationId,
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "ResourceNotFoundException") {
      // Schedule already fired and auto-deleted, or never existed
      return;
    }
    throw error;
  }
}

/** @deprecated Use `deleteAutomationSchedule` instead */
export const deleteWorkflowSchedule = deleteAutomationSchedule;

/**
 * Reconcile schedule chains for all enabled scheduled automations.
 *
 * Checks EventBridge for each automation's expected schedule. If missing
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
      "EventBridge Scheduler not configured for automation schedules"
    );
  }

  const automations = await db
    .select({
      id: automation.id,
      organizationId: automation.organizationId,
      triggerConfig: automation.triggerConfig,
    })
    .from(automation)
    .where(
      and(
        eq(automation.status, "enabled"),
        eq(automation.triggerType, "schedule")
      )
    );

  let repaired = 0;
  let errors = 0;

  for (const a of automations) {
    const config = a.triggerConfig as TriggerConfig;
    if (!config.schedule) continue;

    const scheduleName = getScheduleName(a.id);

    try {
      await scheduler.send(
        new GetScheduleCommand({
          Name: scheduleName,
          GroupName: SCHEDULE_GROUP,
        })
      );
      details.push({ workflowId: a.id, action: "healthy" });
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        error.name === "ResourceNotFoundException"
      ) {
        try {
          await createNextAutomationSchedule({
            workflowId: a.id,
            organizationId: a.organizationId,
            cronExpression: config.schedule,
            timezone: config.timezone,
          });
          repaired++;
          details.push({ workflowId: a.id, action: "repaired" });
          log.info("Reconciliation: repaired broken chain", {
            workflowId: a.id,
          });
        } catch (repairError) {
          errors++;
          details.push({
            workflowId: a.id,
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
          workflowId: a.id,
          action: "check_failed",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  log.info("Reconciliation: complete", {
    checked: automations.length,
    repaired,
    errors,
  });

  return { checked: automations.length, repaired, errors, details };
}
