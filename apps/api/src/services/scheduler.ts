/**
 * EventBridge Scheduler Service
 *
 * Creates and deletes one-time schedules for broadcast sends.
 * Uses EventBridge Scheduler to trigger batch jobs at scheduled times.
 */

import {
  CreateScheduleCommand,
  DeleteScheduleCommand,
  SchedulerClient,
} from "@aws-sdk/client-scheduler";

const schedulerClient = new SchedulerClient({});

const SCHEDULE_GROUP = process.env.SCHEDULER_GROUP_NAME || "wraps-broadcasts";
const TARGET_QUEUE_ARN = process.env.BATCH_QUEUE_ARN;
const SCHEDULER_ROLE_ARN = process.env.SCHEDULER_ROLE_ARN;
const IS_PRODUCTION = process.env.NODE_ENV === "production";

export interface ScheduleBroadcastParams {
  batchId: string;
  organizationId: string;
  awsAccountId: string;
  scheduledFor: Date;
  channel: "email" | "sms";
}

/**
 * Create a one-time EventBridge schedule for a broadcast
 *
 * In development/test mode, logs a warning if scheduler config is missing
 * but doesn't fail. In production, throws an error.
 */
export async function createBroadcastSchedule(
  params: ScheduleBroadcastParams
): Promise<string> {
  const scheduleName = `wraps-batch-${params.batchId}`;

  if (!TARGET_QUEUE_ARN || !SCHEDULER_ROLE_ARN) {
    if (IS_PRODUCTION) {
      throw new Error(
        "EventBridge Scheduler not configured: BATCH_QUEUE_ARN and SCHEDULER_ROLE_ARN required"
      );
    }
    // In development/test, log warning and return without creating schedule
    console.warn(
      `[scheduler] Skipping EventBridge schedule creation for ${scheduleName} - config not set`
    );
    return scheduleName;
  }

  // Format: at(yyyy-mm-ddThh:mm:ss) - no milliseconds, no Z
  const scheduleExpression = `at(${params.scheduledFor.toISOString().replace(".000Z", "").replace("Z", "")})`;

  await schedulerClient.send(
    new CreateScheduleCommand({
      Name: scheduleName,
      GroupName: SCHEDULE_GROUP,
      ScheduleExpression: scheduleExpression,
      ScheduleExpressionTimezone: "UTC",
      FlexibleTimeWindow: { Mode: "OFF" },
      ActionAfterCompletion: "DELETE", // Auto-cleanup after execution
      Target: {
        Arn: TARGET_QUEUE_ARN,
        RoleArn: SCHEDULER_ROLE_ARN,
        Input: JSON.stringify({
          batchId: params.batchId,
          organizationId: params.organizationId,
          awsAccountId: params.awsAccountId,
          channel: params.channel,
          chunkIndex: 0,
        }),
      },
    })
  );

  return scheduleName;
}

/**
 * Delete a broadcast schedule (for cancellation)
 *
 * In development/test mode, skips deletion if scheduler config is missing.
 */
export async function deleteBroadcastSchedule(batchId: string): Promise<void> {
  const scheduleName = `wraps-batch-${batchId}`;

  if (!TARGET_QUEUE_ARN || !SCHEDULER_ROLE_ARN) {
    if (!IS_PRODUCTION) {
      // In development/test, log warning and return
      console.warn(
        `[scheduler] Skipping EventBridge schedule deletion for ${scheduleName} - config not set`
      );
      return;
    }
    // In production, warn but don't fail - schedule might not exist anyway
    console.warn(
      `[scheduler] Cannot delete schedule ${scheduleName} - config not set`
    );
    return;
  }

  try {
    await schedulerClient.send(
      new DeleteScheduleCommand({
        Name: scheduleName,
        GroupName: SCHEDULE_GROUP,
      })
    );
  } catch (error: unknown) {
    // Ignore if schedule doesn't exist (already executed or deleted)
    if (
      error instanceof Error &&
      error.name === "ResourceNotFoundException"
    ) {
      return;
    }
    throw error;
  }
}
