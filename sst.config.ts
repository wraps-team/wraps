/// <reference path="./.sst/platform/config.d.ts" />

/**
 * SST v3 (Ion) Configuration for Wraps Platform
 *
 * This deploys the Wraps API infrastructure:
 * - API Gateway + Lambda for Elysia API
 * - SQS queues for batch processing
 * - DynamoDB for rate limiting
 * - EventBridge Scheduler for scheduled broadcasts
 */

export default $config({
  app(input) {
    return {
      name: "wraps",
      removal: input?.stage === "production" ? "retain" : "remove",
      protect: ["production"].includes(input?.stage ?? ""),
      home: "aws",
      providers: {
        aws: {
          region: "us-east-1",
        },
        ...(input?.stage === "production" && { cloudflare: true }),
      },
    };
  },
  async run() {
    // Load environment variables from apps/web/.env.local
    const { config } = await import("dotenv");
    const { resolve } = await import("node:path");
    config({ path: resolve(process.cwd(), "apps/web/.env.local") });

    // Import infrastructure modules
    const { rateLimitTable } = await import("./infra/tables");
    const { batchQueue, batchDlq, workflowQueue, workflowDlq } = await import(
      "./infra/queues"
    );
    const { schedulerGroup, schedulerRole } = await import("./infra/scheduler");
    const { api } = await import("./infra/api");
    const { alertsTopic } = await import("./infra/alarms");
    const {
      auditLogCleanupCron,
      messageSendCleanupCron,
      eventFeedStalenessCron,
      accountHealthCron,
    } = await import("./infra/cron");

    return {
      apiUrl: api.url,
      batchQueueUrl: batchQueue.url,
      batchDlqUrl: batchDlq.url,
      workflowQueueUrl: workflowQueue.url,
      workflowDlqUrl: workflowDlq.url,
      rateLimitTableName: rateLimitTable.name,
      schedulerGroupName: schedulerGroup.name,
      schedulerRoleArn: schedulerRole.arn,
      alertsTopicArn: alertsTopic.arn,
    };
  },
});
