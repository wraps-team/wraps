/**
 * Automation Queue Service
 *
 * Manages enqueueing automation steps for processing and scheduling delays.
 */

import {
  CreateScheduleCommand,
  DeleteScheduleCommand,
  SchedulerClient,
} from "@aws-sdk/client-scheduler";
import {
  SendMessageBatchCommand,
  SendMessageCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";

const sqs = new SQSClient({});
const scheduler = new SchedulerClient({});

/**
 * Format a date for EventBridge Scheduler at() expression.
 * Must be in format: at(yyyy-MM-ddTHH:mm:ss) without milliseconds or timezone.
 */
export function formatScheduleExpression(date: Date): string {
  const iso = date.toISOString(); // 2026-01-08T04:37:29.148Z
  const withoutMs = iso.split(".")[0]; // 2026-01-08T04:37:29
  return `at(${withoutMs})`;
}

/**
 * Generate a short schedule name that fits within the 64-char limit.
 * Uses first 8 chars of each UUID to create unique but short names.
 */
export function generateScheduleName(
  prefix: string,
  executionId: string,
  stepId: string
): string {
  const shortExecId = executionId.slice(0, 8);
  const shortStepId = stepId.slice(0, 8);
  return `${prefix}-${shortExecId}-${shortStepId}`;
}

const WORKFLOW_QUEUE_URL = process.env.WORKFLOW_QUEUE_URL;
const WORKFLOW_QUEUE_ARN = process.env.WORKFLOW_QUEUE_ARN;
const SCHEDULE_GROUP = process.env.SCHEDULER_GROUP_NAME || "wraps-workflows";
const SCHEDULER_ROLE_ARN = process.env.SCHEDULER_ROLE_ARN;
const IS_PRODUCTION = process.env.NODE_ENV === "production";

/**
 * Job types for the automation queue
 */
export type AutomationJob =
  | {
      type: "execute";
      executionId: string;
      stepId: string;
      organizationId: string;
    }
  | {
      type: "resume";
      executionId: string;
      branch: "yes" | "no" | "timeout" | "opened" | "clicked" | "bounced";
      organizationId: string;
    }
  | {
      type: "trigger";
      workflowId: string;
      contactId: string;
      organizationId: string;
      eventData?: Record<string, unknown>;
    }
  | {
      type: "schedule-trigger";
      workflowId: string;
      organizationId: string;
    };

/** @deprecated Use `AutomationJob` instead */
export type WorkflowJob = AutomationJob;

/**
 * Enqueue an automation step for immediate processing
 */
export async function enqueueAutomationStep(job: AutomationJob): Promise<void> {
  if (!WORKFLOW_QUEUE_URL) {
    if (IS_PRODUCTION) {
      throw new Error("WORKFLOW_QUEUE_URL not configured");
    }
    console.warn(
      "[automation-queue] Skipping enqueue - queue not configured",
      job
    );
    return;
  }

  await sqs.send(
    new SendMessageCommand({
      QueueUrl: WORKFLOW_QUEUE_URL,
      MessageBody: JSON.stringify(job),
    })
  );
}

/** @deprecated Use `enqueueAutomationStep` instead */
export const enqueueWorkflowStep = enqueueAutomationStep;

/**
 * Enqueue multiple automation steps in batch (up to 10 per SQS SendMessageBatch call)
 */
export async function enqueueAutomationStepBatch(
  jobs: AutomationJob[]
): Promise<void> {
  if (jobs.length === 0) {
    return;
  }

  if (!WORKFLOW_QUEUE_URL) {
    if (IS_PRODUCTION) {
      throw new Error("WORKFLOW_QUEUE_URL not configured");
    }
    console.warn(
      "[automation-queue] Skipping batch enqueue - queue not configured",
      { count: jobs.length }
    );
    return;
  }

  // SQS SendMessageBatch supports max 10 messages per call — fire all chunks in parallel
  const chunks: AutomationJob[][] = [];
  for (let i = 0; i < jobs.length; i += 10) {
    chunks.push(jobs.slice(i, i + 10));
  }
  await Promise.all(
    chunks.map((chunk, chunkIdx) =>
      sqs.send(
        new SendMessageBatchCommand({
          QueueUrl: WORKFLOW_QUEUE_URL,
          Entries: chunk.map((job, idx) => ({
            Id: String(chunkIdx * 10 + idx),
            MessageBody: JSON.stringify(job),
          })),
        })
      )
    )
  );
}

/** @deprecated Use `enqueueAutomationStepBatch` instead */
export const enqueueWorkflowStepBatch = enqueueAutomationStepBatch;

/**
 * Schedule an automation step to execute after a delay
 */
export async function scheduleAutomationStep(params: {
  executionId: string;
  stepId: string;
  organizationId: string;
  delaySeconds: number;
}): Promise<string> {
  const scheduleName = generateScheduleName(
    "wraps-wf",
    params.executionId,
    params.stepId
  );

  if (!(SCHEDULER_ROLE_ARN && WORKFLOW_QUEUE_ARN)) {
    if (IS_PRODUCTION) {
      throw new Error("EventBridge Scheduler not configured for automations");
    }
    console.warn(
      "[automation-queue] Skipping schedule creation - config not set"
    );
    return scheduleName;
  }

  const executeAt = new Date(Date.now() + params.delaySeconds * 1000);
  const scheduleExpression = formatScheduleExpression(executeAt);

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
          type: "execute",
          executionId: params.executionId,
          stepId: params.stepId,
          organizationId: params.organizationId,
        } satisfies AutomationJob),
      },
    })
  );

  return scheduleName;
}

/** @deprecated Use `scheduleAutomationStep` instead */
export const scheduleWorkflowStep = scheduleAutomationStep;

/**
 * Schedule a timeout for wait-for-event step
 */
export async function scheduleWaitTimeout(params: {
  executionId: string;
  stepId: string;
  organizationId: string;
  timeoutSeconds: number;
}): Promise<string> {
  const scheduleName = generateScheduleName(
    "wraps-wf-to",
    params.executionId,
    params.stepId
  );

  if (!(SCHEDULER_ROLE_ARN && WORKFLOW_QUEUE_ARN)) {
    if (IS_PRODUCTION) {
      throw new Error("EventBridge Scheduler not configured for automations");
    }
    console.warn(
      "[automation-queue] Skipping timeout schedule - config not set"
    );
    return scheduleName;
  }

  const timeoutAt = new Date(Date.now() + params.timeoutSeconds * 1000);
  const scheduleExpression = formatScheduleExpression(timeoutAt);

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
          type: "resume",
          executionId: params.executionId,
          branch: "timeout",
          organizationId: params.organizationId,
        } satisfies AutomationJob),
      },
    })
  );

  return scheduleName;
}

/**
 * Delete a scheduled automation step (for cancellation)
 */
export async function deleteScheduledStep(scheduleName: string): Promise<void> {
  if (!SCHEDULER_ROLE_ARN) {
    if (!IS_PRODUCTION) {
      console.warn(
        "[automation-queue] Skipping schedule deletion - config not set"
      );
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
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "ResourceNotFoundException") {
      return;
    }
    throw error;
  }
}
