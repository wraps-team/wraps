/**
 * EventBridge Scheduler for Wraps Platform
 *
 * Scheduler:
 * - Creates one-time schedules for broadcast sends
 * - Triggers batch jobs at scheduled times via SQS
 * - Auto-deletes schedules after execution
 *
 * Note: SST doesn't have a built-in component for EventBridge Scheduler,
 * so we use the raw AWS provider (Pulumi) directly.
 */

import { batchQueue } from "./queues";

// Schedule Group for organizing broadcast schedules
// Using aws.scheduler.ScheduleGroup from the Pulumi AWS provider
export const schedulerGroup = new aws.scheduler.ScheduleGroup(
  "BroadcastSchedules",
  {
    name: $interpolate`wraps-broadcasts-${$app.stage}`,
    tags: {
      ManagedBy: "sst",
      Service: "wraps-api",
    },
  }
);

// IAM Role for EventBridge Scheduler to send messages to SQS
export const schedulerRole = new aws.iam.Role("SchedulerRole", {
  name: $interpolate`wraps-scheduler-role-${$app.stage}`,
  assumeRolePolicy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: {
          Service: "scheduler.amazonaws.com",
        },
        Action: "sts:AssumeRole",
      },
    ],
  }),
  tags: {
    ManagedBy: "sst",
    Service: "wraps-api",
  },
});

// Policy to allow Scheduler to send messages to the batch queue
new aws.iam.RolePolicy("SchedulerSqsPolicy", {
  role: schedulerRole.name,
  policy: $jsonStringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: ["sqs:SendMessage"],
        Resource: [batchQueue.arn],
      },
    ],
  }),
});
