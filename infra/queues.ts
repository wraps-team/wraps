/**
 * SQS Queues for Wraps Platform
 *
 * Batch Queue:
 * - Processes batch email/SMS sends in chunks
 * - Each message contains a batch job with chunk information
 * - Failed messages go to DLQ for investigation
 */

import { schedulerGroup, schedulerRole } from "./scheduler-resources";
import { axiomToken, sentryDsn } from "./secrets";

// Dead Letter Queue for failed batch jobs.
// A consumer (apps/api/src/workers/batch-dlq-consumer.ts) drains it and
// re-enqueues the NEXT chunk on batchQueue using batchSend.lastChunkIndex
// + lastCursor as the resume pointer. Subscription is wired AFTER
// batchQueue is declared (we need its URL/ARN).
export const batchDlq = new sst.aws.Queue("BatchDlq", {
  transform: {
    queue: {
      // Consumer timeout is 60s; visibility timeout must exceed that.
      visibilityTimeoutSeconds: 70,
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
      // 14 days — matches DLQ retention so in-flight chunks can wait out
      // long incidents without silent message loss.
      messageRetentionSeconds: 1_209_600,
      tags: {
        ManagedBy: "sst",
        Service: "wraps-api",
      },
    },
  },
});

// Subscribe DLQ consumer — re-enqueues next chunk onto batchQueue based on
// the durable heartbeat in batchSend.lastChunkIndex/lastCursor. Kill switch
// via BROADCAST_DLQ_CONSUMER_ENABLED=false.
batchDlq.subscribe(
  {
    handler: "apps/api/src/workers/batch-dlq-consumer.handler",
    runtime: "nodejs24.x",
    timeout: "1 minute",
    memory: "256 MB",
    environment: {
      NODE_ENV: "production",
      DATABASE_URL: process.env.DATABASE_URL ?? "",
      AXIOM_TOKEN: axiomToken.value,
      AXIOM_DATASET: "wraps",
      BATCH_QUEUE_URL: batchQueue.url,
      BROADCAST_DLQ_CONSUMER_ENABLED:
        process.env.BROADCAST_DLQ_CONSUMER_ENABLED ?? "true",
      // There is no DLQ-of-DLQ: a record this consumer cannot process is
      // dropped, so Sentry is the only place that failure surfaces.
      SENTRY_DSN: sentryDsn.value,
    },
    nodejs: {
      // @sentry/profiling-node ships native .node binaries that esbuild
      // cannot bundle; installing it keeps it external.
      install: ["pg", "@sentry/profiling-node"],
    },
    permissions: [
      // Re-enqueue chunks onto the main batch queue.
      {
        actions: ["sqs:SendMessage"],
        resources: [batchQueue.arn],
      },
    ],
  },
  {
    batch: {
      size: 10,
      partialResponses: true,
    },
  }
);

// Subscribe batch worker to the queue
// The worker is defined in apps/api/src/workers/batch-sender.ts
const batchSenderSubscription = batchQueue.subscribe(
  {
    handler: "apps/api/src/workers/batch-sender.handler",
    runtime: "nodejs24.x",
    timeout: "5 minutes",
    memory: "512 MB",
    environment: {
      NODE_ENV: "production",
      DATABASE_URL: process.env.DATABASE_URL ?? "",
      AXIOM_TOKEN: axiomToken.value,
      AXIOM_DATASET: "wraps",
      // Base URLs for unsubscribe/preferences links
      API_BASE_URL:
        $app.stage === "production"
          ? "https://api.wraps.dev"
          : (process.env.API_BASE_URL ?? "https://api.wraps.dev"),
      APP_BASE_URL:
        $app.stage === "production"
          ? "https://app.wraps.dev"
          : (process.env.APP_BASE_URL ?? "https://app.wraps.dev"),
      // Secret for signing unsubscribe tokens (must match API and web).
      // Fail the deploy rather than ship an unset key — a mismatch silently
      // breaks every unsubscribe link. `||` not `??`: CI forwards an unset
      // secret as an empty string, which `??` would pass through.
      UNSUBSCRIBE_SECRET:
        process.env.UNSUBSCRIBE_SECRET ||
        (() => {
          throw new Error("UNSUBSCRIBE_SECRET is required");
        })(),
      // Allow enqueuing the next chunk after processing current one
      BATCH_QUEUE_URL: batchQueue.url,
      // PostHog for activation tracking
      POSTHOG_KEY: process.env.POSTHOG_KEY ?? "",
      // Wraps platform for activation event emission. Fail the deploy rather
      // than ship an unset key — an empty key silently turns every activation
      // event emit into a no-op. `||` not `??`: CI forwards an unset secret
      // as an empty string, which `??` would pass through.
      WRAPS_API_KEY:
        process.env.WRAPS_API_KEY ||
        (() => {
          throw new Error("WRAPS_API_KEY is required");
        })(),
      // Post-send bookkeeping failures are swallowed so one bad row cannot
      // abort a broadcast — they only reach Sentry.
      SENTRY_DSN: sentryDsn.value,
      // The stuck-broadcast alert emails the org from wraps.dev, which is
      // verified in the dogfood account (010836206701), not this platform
      // account. getWrapsClient() assumes this role from the function's
      // execution role — the sts:AssumeRole grant below on wraps-* already
      // covers it. Same identity the EventFeedStaleness cron uses.
      WRAPS_EMAIL_ROLE_ARN: "arn:aws:iam::010836206701:role/wraps-email-role",
    },
    nodejs: {
      // PostgreSQL driver for Drizzle; @sentry/profiling-node ships native
      // binaries that esbuild cannot bundle, so it stays external.
      install: ["pg", "@sentry/profiling-node"],
    },
    permissions: [
      // Allow assuming cross-account roles for sending via customer's SES
      {
        actions: ["sts:AssumeRole"],
        resources: ["arn:aws:iam::*:role/wraps-*"],
      },
      // Allow enqueuing the next chunk back onto the batch queue
      {
        actions: ["sqs:SendMessage"],
        resources: [batchQueue.arn],
      },
    ],
  },
  {
    batch: {
      size: 1, // Process one batch job at a time
    },
  }
);

// Opt the batch sender out of Lambda's recursive-loop termination.
//
// A broadcast advances by design as a self-referential chain: batch-sender
// sends the next chunk to batchQueue, which invokes batch-sender again. That is
// exactly the shape Lambda's loop detection is built to kill, and it kills it
// at the DEFAULT THRESHOLD OF 16 HOPS — so every broadcast stopped dead at
// 16 x CHUNK_SIZE = 800 recipients, silently. No error, no throttle, no log
// line, because the invocation is dropped before the handler runs; the only
// evidence is the RecursiveInvocationsDropped metric and an AWS Health alert.
// Reproduced twice on 2026-07-31, and it is account-independent (it has nothing
// to do with concurrency limits).
//
// "Allow" is AWS's sanctioned opt-out for intentional recursion. It is safe
// here because the chain is BOUNDED, not runaway: each hop advances a keyset
// cursor over a frozen audience snapshot, and the worker stops enqueueing once
// contacts run out or processedRecipients reaches totalRecipients. The
// broadcast reaper (infra/cron.ts) remains the backstop for a chunk lost for
// any other reason.
//
// Note the resource's own warning: DESTROYING this reverts recursiveLoop to
// "Terminate", which silently reinstates the 800-recipient ceiling.
new aws.lambda.FunctionRecursionConfig("BatchSenderRecursionConfig", {
  functionName: batchSenderSubscription.nodes.function.apply((fn) => fn.name),
  recursiveLoop: "Allow",
});

/**
 * Workflow Queue for Wraps Automations
 *
 * Processes workflow jobs:
 * - trigger: Start a workflow for a contact
 * - execute: Execute a specific workflow step
 * - resume: Resume a delayed execution
 */

// Dead Letter Queue for failed workflow jobs
export const workflowDlq = new sst.aws.Queue("WorkflowDlq", {
  transform: {
    queue: {
      visibilityTimeoutSeconds: 70, // Must exceed consumer Lambda timeout (60s)
      messageRetentionSeconds: 1_209_600, // 14 days
      tags: {
        ManagedBy: "sst",
        Service: "wraps-api",
      },
    },
  },
});

// Subscribe DLQ consumer to mark failed executions in DB
workflowDlq.subscribe(
  {
    handler: "apps/api/src/(ee)/workers/workflow-dlq-consumer.handler",
    runtime: "nodejs24.x",
    timeout: "1 minute",
    memory: "256 MB",
    environment: {
      NODE_ENV: "production",
      DATABASE_URL: process.env.DATABASE_URL ?? "",
      AXIOM_TOKEN: axiomToken.value,
      AXIOM_DATASET: "wraps",
      // Last handler in the chain: a record it cannot process leaves the
      // execution stuck with nothing left to retry it.
      SENTRY_DSN: sentryDsn.value,
    },
    nodejs: {
      install: ["pg", "@sentry/profiling-node"],
    },
  },
  {
    batch: {
      size: 10,
    },
  }
);

// Main workflow processing queue
export const workflowQueue = new sst.aws.Queue("WorkflowQueue", {
  dlq: {
    queue: workflowDlq.arn,
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

// Subscribe workflow processor to the queue
// The worker is defined in apps/api/src/(ee)/workers/workflow-processor.ts
workflowQueue.subscribe(
  {
    handler: "apps/api/src/(ee)/workers/workflow-processor.handler",
    runtime: "nodejs24.x",
    timeout: "5 minutes",
    memory: "512 MB",
    environment: {
      NODE_ENV: "production",
      DATABASE_URL: process.env.DATABASE_URL ?? "",
      AXIOM_TOKEN: axiomToken.value,
      AXIOM_DATASET: "wraps",
      WORKFLOW_QUEUE_URL: workflowQueue.url,
      WORKFLOW_QUEUE_ARN: workflowQueue.arn,
      // EventBridge Scheduler config for delays
      SCHEDULER_ROLE_ARN: schedulerRole.arn,
      SCHEDULER_GROUP_NAME: schedulerGroup.name,
      // Base URLs for unsubscribe/preferences links
      API_BASE_URL:
        $app.stage === "production"
          ? "https://api.wraps.dev"
          : (process.env.API_BASE_URL ?? "https://api.wraps.dev"),
      APP_BASE_URL:
        $app.stage === "production"
          ? "https://app.wraps.dev"
          : (process.env.APP_BASE_URL ?? "https://app.wraps.dev"),
      // Secret for signing unsubscribe tokens (must match API and web).
      // Fail the deploy rather than ship an unset key — a mismatch silently
      // breaks every unsubscribe link. `||` not `??`: CI forwards an unset
      // secret as an empty string, which `??` would pass through.
      UNSUBSCRIBE_SECRET:
        process.env.UNSUBSCRIBE_SECRET ||
        (() => {
          throw new Error("UNSUBSCRIBE_SECRET is required");
        })(),
      // PostHog for activation tracking
      POSTHOG_KEY: process.env.POSTHOG_KEY ?? "",
      // Wraps platform for activation event emission. Fail the deploy rather
      // than ship an unset key — an empty key silently turns every activation
      // event emit into a no-op. `||` not `??`: CI forwards an unset secret
      // as an empty string, which `??` would pass through.
      WRAPS_API_KEY:
        process.env.WRAPS_API_KEY ||
        (() => {
          throw new Error("WRAPS_API_KEY is required");
        })(),
      // A broken cron chain is never retried by SQS — the workflow just stops
      // firing. That capture is the only warning.
      SENTRY_DSN: sentryDsn.value,
    },
    nodejs: {
      // PostgreSQL driver for Drizzle; @sentry/profiling-node ships native
      // binaries that esbuild cannot bundle, so it stays external.
      install: ["pg", "@sentry/profiling-node"],
    },
    permissions: [
      // Allow assuming cross-account roles for sending via customer's SES
      {
        actions: ["sts:AssumeRole"],
        resources: ["arn:aws:iam::*:role/wraps-*"],
      },
      // Allow sending messages back to workflow queue (for next steps)
      {
        actions: ["sqs:SendMessage"],
        resources: [workflowQueue.arn],
      },
      // Allow creating/deleting EventBridge schedules for delays
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
      // Allow passing the scheduler role
      {
        actions: ["iam:PassRole"],
        resources: [schedulerRole.arn],
      },
    ],
  },
  {
    batch: {
      size: 10,
      partialResponses: true,
    },
  }
);
