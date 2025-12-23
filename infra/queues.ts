/**
 * SQS Queues for Wraps Platform
 *
 * Batch Queue:
 * - Processes batch email/SMS sends in chunks
 * - Each message contains a batch job with chunk information
 * - Failed messages go to DLQ for investigation
 */

// Dead Letter Queue for failed batch jobs
export const batchDlq = new sst.aws.Queue("BatchDlq", {
  transform: {
    queue: {
      messageRetentionSeconds: 1_209_600, // 14 days
      tags: {
        ManagedBy: "sst",
        Service: "wraps-api",
      },
    },
  },
});

// Main batch processing queue
export const batchQueue = new sst.aws.Queue("BatchQueue", {
  dlq: {
    queue: batchDlq.arn,
    retry: 3, // Retry 3 times before sending to DLQ
  },
  transform: {
    queue: {
      visibilityTimeoutSeconds: 300, // 5 minutes for processing
      messageRetentionSeconds: 86_400, // 1 day
      tags: {
        ManagedBy: "sst",
        Service: "wraps-api",
      },
    },
  },
});

// Subscribe batch worker to the queue
// The worker is defined in apps/api/src/workers/batch-sender.ts
batchQueue.subscribe(
  {
    handler: "apps/api/src/workers/batch-sender.handler",
    timeout: "5 minutes",
    memory: "512 MB",
    environment: {
      DATABASE_URL: process.env.DATABASE_URL ?? "",
    },
    nodejs: {
      install: ["pg"], // PostgreSQL driver for Drizzle
    },
  },
  {
    batch: {
      size: 1, // Process one batch job at a time
    },
  }
);
