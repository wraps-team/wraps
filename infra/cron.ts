/**
 * Scheduled Cron Jobs for Wraps Platform
 *
 * AuditLogCleanup:
 * - Runs nightly at 02:00 UTC in production
 * - Deletes audit_log rows older than the org's plan retention window
 * - free=7d, starter=30d, growth=90d, scale=365d
 *
 * WorkflowReaper:
 * - Runs hourly in production
 * - Detects and fails stuck workflow executions:
 *   - Paused executions with nextStepScheduledAt > 30 minutes ago
 *   - Waiting executions with waitTimeoutAt > 5 minutes ago
 * - This is a backstop for lost EventBridge Scheduler deliveries; each
 *   paused/waiting execution also has its own one-time schedule that
 *   normally resumes it. Always-on so the backstop is never disarmed.
 *
 * BroadcastReaper:
 * - Runs every 15 minutes in production
 * - Revives broadcasts stuck in `processing` with no progress for 30 minutes,
 *   re-enqueueing the next chunk from the durable heartbeat. Backstop for a
 *   chunk message that SQS delivered to nobody — observed when the broadcast's
 *   own SES delivery-event webhooks saturate the account's Lambda concurrency
 *   and starve the batch queue's event source mapping. See
 *   apps/api/src/workers/broadcast-reaper.ts.
 *
 * EventFeedStaleness:
 * - Runs hourly at :15 in production
 * - Flags connected AWS accounts whose SES event feed has gone silent
 *   while sends are still happening, and emails the org owner once per
 *   episode. See apps/api/src/workers/event-feed-staleness.ts.
 * - SES-capable credentials for @wraps/email are wired via
 *   WRAPS_EMAIL_ROLE_ARN + sts:AssumeRole on the dogfood email role
 *   (see the function definition below).
 * - Also assumes each connected account's own customer role (sts:AssumeRole
 *   on wraps-*) to read the SES Send metric as a fallback signal for SDK
 *   senders, whose message_send rows only exist once an event has already
 *   arrived — the precise DB signal is circular for exactly that population.
 *   Consulted only when the DB signal found nothing (plan 195).
 *
 * AccountHealth:
 * - Runs hourly at :45 in production
 * - Assumes each connected account's customer role and checks SES account
 *   health: sending paused/enforcement, reputation thresholds, daily quota,
 *   sandbox->production transitions. Writes inbox notifications (deduped
 *   per account per day). See apps/api/src/workers/account-health.ts.
 */

import { batchQueue } from "./queues";
import { axiomToken, sentryDsn } from "./secrets";

export const broadcastReaperCron = new sst.aws.CronV2("BroadcastReaper", {
  // 15-minute sweep against a 30-minute staleness threshold, so a dead chain
  // is revived within 45 minutes worst case. The threshold cannot go lower
  // without racing the DLQ recovery path (3 receives x 300s = 15 min).
  schedule: "rate(15 minutes)",
  enabled: $app.stage === "production",
  job: {
    handler: "apps/api/src/workers/broadcast-reaper.handler",
    runtime: "nodejs24.x",
    timeout: "5 minutes",
    memory: "256 MB",
    environment: {
      DATABASE_URL:
        process.env.DATABASE_URL ||
        (() => {
          throw new Error("DATABASE_URL is required");
        })(),
      AXIOM_TOKEN: axiomToken.value,
      AXIOM_DATASET: "wraps",
      // Where the revived chunk goes. Without it the reaper throws on every
      // batch it tries to revive, which is the one failure it cannot back off
      // from — it IS the backstop.
      BATCH_QUEUE_URL: batchQueue.url,
      SENTRY_DSN: sentryDsn.value,
    },
    permissions: [
      {
        actions: ["sqs:SendMessage"],
        resources: [batchQueue.arn],
      },
    ],
    nodejs: { install: ["pg", "@sentry/profiling-node"] },
  },
});

export const auditLogCleanupCron = new sst.aws.CronV2("AuditLogCleanup", {
  schedule: "cron(0 2 * * ? *)",
  enabled: $app.stage === "production",
  job: {
    handler: "apps/api/src/workers/audit-log-cleanup.handler",
    runtime: "nodejs24.x",
    timeout: "5 minutes",
    memory: "256 MB",
    environment: {
      DATABASE_URL:
        process.env.DATABASE_URL ||
        (() => {
          throw new Error("DATABASE_URL is required");
        })(),
      AXIOM_TOKEN: axiomToken.value,
      AXIOM_DATASET: "wraps",
      SENTRY_DSN: sentryDsn.value,
    },
    nodejs: { install: ["pg", "@sentry/profiling-node"] },
  },
});

export const workflowReaperCron = new sst.aws.CronV2("WorkflowReaper", {
  schedule: "rate(1 hour)",
  enabled: $app.stage === "production",
  job: {
    handler: "apps/api/src/(ee)/workers/workflow-reaper.handler",
    runtime: "nodejs24.x",
    timeout: "5 minutes",
    memory: "256 MB",
    environment: {
      DATABASE_URL:
        process.env.DATABASE_URL ||
        (() => {
          throw new Error("DATABASE_URL is required");
        })(),
      AXIOM_TOKEN: axiomToken.value,
      AXIOM_DATASET: "wraps",
      // The reaper is itself the backstop — when it cannot fail a stuck
      // execution it just logs and moves on, once an hour, forever.
      SENTRY_DSN: sentryDsn.value,
    },
    nodejs: { install: ["pg", "@sentry/profiling-node"] },
  },
});

export const eventFeedStalenessCron = new sst.aws.CronV2("EventFeedStaleness", {
  schedule: "cron(15 * * * ? *)",
  enabled: $app.stage === "production",
  job: {
    handler: "apps/api/src/workers/event-feed-staleness.handler",
    runtime: "nodejs24.x",
    // The sweep now makes an STS + CloudWatch round trip per candidate
    // account for the SES send-metric fallback (plan 195), matching why
    // accountHealthCron below already needs 10 minutes.
    timeout: "10 minutes",
    memory: "256 MB",
    environment: {
      DATABASE_URL:
        process.env.DATABASE_URL ||
        (() => {
          throw new Error("DATABASE_URL is required");
        })(),
      AXIOM_TOKEN: axiomToken.value,
      AXIOM_DATASET: "wraps",
      // alertOwner() swallows send failures so one org cannot abort the sweep,
      // which means a permanently failing alert is invisible without this.
      SENTRY_DSN: sentryDsn.value,
      // The alert email links to the account's settings page, and resolveAppUrl
      // throws rather than defaulting to app.wraps.dev. Without this the send
      // fails, markAlerted never runs, and the alert retries hourly forever.
      // `||` not `??`: CI passes an unset secret through as an empty string,
      // which `??` would forward verbatim and resolveAppUrl rejects as unset.
      NEXT_PUBLIC_APP_URL:
        process.env.NEXT_PUBLIC_APP_URL || "https://app.wraps.dev",
      // wraps.dev is verified in the dogfood account's SES (010836206701),
      // not this platform account — getWrapsClient() sees this env var and
      // assumes the role from this function's execution role, the same
      // sending identity the web app reaches via Vercel OIDC. The role's
      // trust policy also trusts this platform account for sts:AssumeRole.
      WRAPS_EMAIL_ROLE_ARN: "arn:aws:iam::010836206701:role/wraps-email-role",
    },
    // @sentry/profiling-node ships native .node binaries that esbuild cannot
    // bundle; installing it keeps it external, the same as the API handler.
    nodejs: { install: ["pg", "@sentry/profiling-node"] },
    permissions: [
      {
        actions: ["sts:AssumeRole"],
        resources: ["arn:aws:iam::010836206701:role/wraps-email-role"],
      },
      // Assume cross-account customer roles to read the SES Send metric
      {
        actions: ["sts:AssumeRole"],
        resources: ["arn:aws:iam::*:role/wraps-*"],
      },
    ],
  },
});

export const accountHealthCron = new sst.aws.CronV2("AccountHealth", {
  schedule: "cron(45 * * * ? *)",
  enabled: $app.stage === "production",
  job: {
    handler: "apps/api/src/workers/account-health.handler",
    runtime: "nodejs24.x",
    timeout: "10 minutes",
    memory: "256 MB",
    environment: {
      DATABASE_URL:
        process.env.DATABASE_URL ||
        (() => {
          throw new Error("DATABASE_URL is required");
        })(),
      AXIOM_TOKEN: axiomToken.value,
      AXIOM_DATASET: "wraps",
      // Per-account failures are skipped so one broken role cannot abort the
      // sweep; without this that account silently stops being checked.
      SENTRY_DSN: sentryDsn.value,
    },
    nodejs: { install: ["pg", "@sentry/profiling-node"] },
    permissions: [
      // Assume cross-account customer roles to read SES account health
      {
        actions: ["sts:AssumeRole"],
        resources: ["arn:aws:iam::*:role/wraps-*"],
      },
    ],
  },
});
