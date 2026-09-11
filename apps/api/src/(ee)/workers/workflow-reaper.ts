/**
 * Workflow Reaper
 *
 * Scheduled Lambda that detects and fails stuck workflow executions:
 *
 *   a) Paused executions whose EventBridge schedule fired but the SQS message
 *      was never delivered (nextStepScheduledAt > 30 minutes ago). The 30-minute
 *      buffer exceeds any reasonable EventBridge delivery delay.
 *
 *   b) Waiting executions whose waitTimeoutAt has passed but no webhook or
 *      timeout schedule resumed them (waitTimeoutAt > 5 minutes ago). The
 *      5-minute buffer covers EventBridge delivery jitter.
 *
 * The reaper only FAILS stuck executions — it does not re-enqueue. Re-enqueueing
 * would race with any late EventBridge delivery. Operators can manually restart
 * executions via the dashboard if needed.
 */

// Initialize Sentry before all other imports
import "../../lib/sentry";

import { captureException, wrapHandler } from "@sentry/aws-serverless";
import { db, workflowExecution } from "@wraps/db";
import type { Handler } from "aws-lambda";
import { and, eq, isNotNull, lt, sql } from "drizzle-orm";
import { flushLogger, log } from "../../lib/logger";
import { failExecution } from "./workflow-processor";

// Type alias for the DB instance accepted by runReaper (testable without Lambda env)
type DrizzleDB = typeof db;

// Time thresholds exported so tests can verify application-level filtering
export const PAUSED_STUCK_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes
export const WAITING_EXPIRED_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Core reaper logic — accepts a db instance for testability.
 */
export async function runReaper(db: DrizzleDB): Promise<void> {
  log.info("[workflow-reaper] Starting reaper run");

  const now = Date.now();

  // ── a) Paused executions stuck for more than 30 minutes ──────────────────
  // A paused execution has an EventBridge schedule that should have fired by now.
  // If nextStepScheduledAt is > 30 min ago, the delivery was lost.
  // baseline:allow-unscoped — privileged system Lambda; processes all orgs by design
  // biome-ignore lint/plugin: privileged system Lambda; processes all orgs by design (see baseline:allow-unscoped above)
  const pausedCandidates = await db
    .select({
      id: workflowExecution.id,
      organizationId: workflowExecution.organizationId,
      nextStepScheduledAt: workflowExecution.nextStepScheduledAt,
    })
    .from(workflowExecution)
    .where(
      and(
        eq(workflowExecution.status, "paused"),
        isNotNull(workflowExecution.nextStepScheduledAt),
        lt(
          workflowExecution.nextStepScheduledAt,
          sql`NOW() - INTERVAL '30 minutes'`
        )
      )
    )
    .limit(500);

  if (pausedCandidates.length === 500) {
    log.warn(
      "[workflow-reaper] paused query hit limit — some stuck executions deferred to next run",
      { limit: 500 }
    );
  }

  // Defense-in-depth: apply threshold check in application code as well as SQL.
  // This makes the threshold logic unit-testable without a real DB.
  const pausedStuck = pausedCandidates.filter(
    (r) =>
      r.nextStepScheduledAt != null &&
      now - r.nextStepScheduledAt.getTime() > PAUSED_STUCK_THRESHOLD_MS
  );

  if (pausedStuck.length > 0) {
    log.info("[workflow-reaper] Failing paused stuck executions", {
      count: pausedStuck.length,
    });
    for (const { id, organizationId } of pausedStuck) {
      try {
        await failExecution(
          id,
          "execution stuck: paused step not delivered",
          "unknown",
          organizationId
        );
        log.info("[workflow-reaper] Failed paused stuck execution", {
          executionId: id,
        });
      } catch (err) {
        // The reaper is the backstop for lost scheduler deliveries. When it
        // cannot fail a stuck execution, that execution stays stuck and every
        // later run hits the same error — silently, once an hour.
        captureException(err, {
          tags: { worker: "workflow-reaper", stage: "fail-paused" },
          extra: { executionId: id },
        });
        log.error(
          "[workflow-reaper] Failed to fail paused execution",
          err as Error,
          {
            executionId: id,
          }
        );
      }
    }
  }

  // ── b) Waiting executions past their waitTimeoutAt by more than 5 minutes ─
  // A waiting execution should have been resumed by a timeout schedule. If
  // waitTimeoutAt is > 5 min ago, the scheduler missed it.
  // baseline:allow-unscoped — privileged system Lambda; processes all orgs by design
  // biome-ignore lint/plugin: privileged system Lambda; processes all orgs by design (see baseline:allow-unscoped above)
  const waitingCandidates = await db
    .select({
      id: workflowExecution.id,
      organizationId: workflowExecution.organizationId,
      waitTimeoutAt: workflowExecution.waitTimeoutAt,
    })
    .from(workflowExecution)
    .where(
      and(
        eq(workflowExecution.status, "waiting"),
        isNotNull(workflowExecution.waitTimeoutAt),
        lt(workflowExecution.waitTimeoutAt, sql`NOW() - INTERVAL '5 minutes'`)
      )
    )
    .limit(500);

  if (waitingCandidates.length === 500) {
    log.warn(
      "[workflow-reaper] waiting query hit limit — some expired executions deferred to next run",
      { limit: 500 }
    );
  }

  // Defense-in-depth: apply threshold check in application code as well as SQL.
  const waitingExpired = waitingCandidates.filter(
    (r) =>
      r.waitTimeoutAt != null &&
      now - r.waitTimeoutAt.getTime() > WAITING_EXPIRED_THRESHOLD_MS
  );

  if (waitingExpired.length > 0) {
    log.info("[workflow-reaper] Failing waiting expired executions", {
      count: waitingExpired.length,
    });
    for (const { id, organizationId } of waitingExpired) {
      try {
        await failExecution(
          id,
          "execution stuck: waiting timeout expired",
          "unknown",
          organizationId
        );
        log.info("[workflow-reaper] Failed waiting expired execution", {
          executionId: id,
        });
      } catch (err) {
        captureException(err, {
          tags: { worker: "workflow-reaper", stage: "fail-waiting" },
          extra: { executionId: id },
        });
        log.error(
          "[workflow-reaper] Failed to fail waiting execution",
          err as Error,
          {
            executionId: id,
          }
        );
      }
    }
  }

  log.info("[workflow-reaper] Reaper run complete", {
    pausedStuck: pausedStuck.length,
    waitingExpired: waitingExpired.length,
  });

  await flushLogger();
}

/**
 * Lambda entry point — calls runReaper with the real DB instance.
 */
export const handler: Handler = wrapHandler(async () => {
  await runReaper(db);
});
