/**
 * API Gateway + Lambda for Wraps Platform API
 *
 * Elysia API:
 * - POST /v1/batch - Create batch send
 * - GET /v1/batch/:id - Get batch status
 * - DELETE /v1/batch/:id - Cancel batch send
 * - GET /health - Health check
 *
 * Features:
 * - API key authentication
 * - Rate limiting via DynamoDB
 * - Plan-based feature gating
 * - Scheduled broadcasts via EventBridge Scheduler
 */

import { batchQueue } from "./queues";
import { schedulerGroup, schedulerRole } from "./scheduler";
import { rateLimitTable } from "./tables";

// API Gateway with Elysia Lambda handler
export const api = new sst.aws.ApiGatewayV2("Api", {
  transform: {
    api: {
      tags: {
        ManagedBy: "sst",
        Service: "wraps-api",
      },
    },
  },
});

// Main API handler - Elysia app
const apiHandler = new sst.aws.Function("ApiHandler", {
  handler: "apps/api/src/lambda.handler",
  timeout: "30 seconds",
  memory: "512 MB",
  environment: {
    DATABASE_URL: process.env.DATABASE_URL ?? "",
    BATCH_QUEUE_URL: batchQueue.url,
    // EventBridge Scheduler config for scheduled broadcasts
    BATCH_QUEUE_ARN: batchQueue.arn,
    SCHEDULER_ROLE_ARN: schedulerRole.arn,
    SCHEDULER_GROUP_NAME: schedulerGroup.name,
  },
  link: [rateLimitTable, batchQueue],
  nodejs: {
    install: ["pg"], // PostgreSQL driver for Drizzle
  },
  url: false, // We use API Gateway, not function URLs
  permissions: [
    // Allow creating/deleting EventBridge Scheduler schedules
    {
      actions: [
        "scheduler:CreateSchedule",
        "scheduler:DeleteSchedule",
        "scheduler:GetSchedule",
      ],
      resources: [
        $interpolate`arn:aws:scheduler:*:*:schedule/${schedulerGroup.name}/*`,
      ],
    },
    // Allow passing the scheduler role to EventBridge
    {
      actions: ["iam:PassRole"],
      resources: [schedulerRole.arn],
    },
  ],
});

// Route all requests to the Elysia handler
api.route("ANY /{proxy+}", apiHandler.arn);
api.route("ANY /", apiHandler.arn);
