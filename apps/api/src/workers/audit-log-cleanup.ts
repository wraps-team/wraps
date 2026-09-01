/**
 * Audit Log Cleanup Worker
 *
 * Scheduled Lambda that deletes audit_log rows beyond each org's
 * plan-based retention window. Runs nightly at 02:00 UTC in production.
 *
 * Retention windows:
 *   free     →  30 days
 *   pro      →  90 days
 *   business → 365 days
 *
 *   Legacy plans — see plans/208. Mapped to their new-tier equivalent.
 *   starter →  90 days (pro)
 *   growth  → 365 days (business)
 *   scale   → 365 days (business)
 */

// Initialize Sentry before all other imports
import "../lib/sentry";

import { wrapHandler } from "@sentry/aws-serverless";
import { auditLog, db, subscription } from "@wraps/db";
import type { Handler } from "aws-lambda";
import { and, eq, inArray, lt } from "drizzle-orm";
import { flushLogger, log } from "../lib/logger";
import { isPlanId, type PlanId } from "../lib/plan-ids";

const RETENTION_DAYS: Record<PlanId, number> = {
  free: 30,
  pro: 90,
  business: 365,
  // Legacy plans — see plans/208. Mapped to their new-tier equivalent.
  starter: 90,
  growth: 365,
  scale: 365,
};

const DEFAULT_PLAN = "free";
const BATCH_SIZE = 1000;
const BATCH_PAUSE_MS = 100;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getOrgPlan(organizationId: string): Promise<string> {
  const rows = await db
    .select({ plan: subscription.plan })
    .from(subscription)
    .where(
      and(
        eq(subscription.referenceId, organizationId),
        inArray(subscription.status, ["active", "trialing"])
      )
    )
    .limit(1);

  return rows[0]?.plan ?? DEFAULT_PLAN;
}

async function deleteOldLogsForOrg(
  organizationId: string,
  plan: string
): Promise<number> {
  // Explicit narrow — see the note on RETENTION_DAYS. An unknown plan name
  // deletes on the Free window, which for a paying customer would destroy
  // audit history early, so the fallback must be deliberate and visible.
  const retentionDays = isPlanId(plan)
    ? RETENTION_DAYS[plan]
    : RETENTION_DAYS[DEFAULT_PLAN];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);

  let totalDeleted = 0;

  while (true) {
    // Fetch a batch of IDs to delete — avoids a single massive DELETE
    const batch = await db
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, organizationId),
          lt(auditLog.createdAt, cutoff)
        )
      )
      .limit(BATCH_SIZE);

    if (batch.length === 0) {
      break;
    }

    const ids = batch.map((r) => r.id);
    await db.delete(auditLog).where(inArray(auditLog.id, ids));

    totalDeleted += ids.length;

    if (ids.length < BATCH_SIZE) {
      // Last batch — no need to pause
      break;
    }

    await sleep(BATCH_PAUSE_MS);
  }

  return totalDeleted;
}

export const handler: Handler = wrapHandler(async () => {
  log.info("[audit-log-cleanup] Starting cleanup run");

  // 1. Fetch all distinct organizationIds that have audit logs
  const orgs = await db
    .selectDistinct({ organizationId: auditLog.organizationId })
    .from(auditLog);

  if (orgs.length === 0) {
    log.info("[audit-log-cleanup] No audit logs found, nothing to clean up");
    await flushLogger();
    return;
  }

  log.info("[audit-log-cleanup] Processing orgs", { count: orgs.length });

  let totalDeleted = 0;

  for (const { organizationId } of orgs) {
    const plan = await getOrgPlan(organizationId);
    const deleted = await deleteOldLogsForOrg(organizationId, plan);

    if (deleted > 0) {
      log.info("[audit-log-cleanup] Deleted rows for org", {
        organizationId,
        plan,
        deleted,
      });
    }

    totalDeleted += deleted;
  }

  log.info("[audit-log-cleanup] Cleanup complete", { totalDeleted });
  await flushLogger();
});
