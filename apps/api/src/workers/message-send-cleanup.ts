/**
 * Message Send / Contact Event Retention Worker
 *
 * Scheduled Lambda that deletes message_send rows beyond each org's
 * plan-based retention window, and contact_event rows past their explicit
 * `expires_at`. Runs nightly at 03:00 UTC in production.
 *
 * Two distinct windows per plan, on purpose: VISIBLE_DAYS is how much
 * history the dashboard shows, and deletion always lags that by a
 * GRACE_DAYS grace month. Owners/admins are warned once a org has rows in
 * that grace window, before those rows are actually deleted.
 *
 * Ships with RETENTION_DRY_RUN defaulting to true — see plans/210 step 8.
 * Do not flip it without a human reviewing a real dry-run report first.
 */

// Initialize Sentry before all other imports
import "../lib/sentry";

import { wrapHandler } from "@sentry/aws-serverless";
import {
  contactEvent,
  db,
  messageSend,
  notification,
  notifyOrg,
  subscription,
} from "@wraps/db";
import type { Handler } from "aws-lambda";
import { and, eq, gte, inArray, isNotNull, lt } from "drizzle-orm";
import { flushLogger, log } from "../lib/logger";

// When true, the worker logs exactly what it would delete and deletes nothing.
// Ships as true. Flipped to false only after a human reviews a dry-run report.
const DRY_RUN = process.env.RETENTION_DRY_RUN !== "false";

/** Days of history visible in the dashboard, by plan. */
const VISIBLE_DAYS: Record<string, number> = {
  free: 30,
  pro: 90,
  business: 365,
  // Legacy plans — see plans/208. Mapped to their new-tier equivalent.
  starter: 90,
  growth: 365,
  scale: 365,
};

/**
 * Rows are deleted this many days AFTER the visible window closes. The gap is
 * the customer's grace month: they are warned when data enters it, and have
 * until the end of it to upgrade or export.
 */
const GRACE_DAYS = 30;

/** Extra days a canceled subscription keeps its old window before dropping to free. */
const CANCELLATION_GRACE_DAYS = 30;

const DEFAULT_PLAN = "free";
const BATCH_SIZE = 1000;
const BATCH_PAUSE_MS = 100;
const WARNING_DEDUPE_DAYS = 30;
const WARNING_TYPE = "retention.warning";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

type OrgRetention = {
  plan: string;
  visibleDays: number;
  deleteAfterDays: number;
  canceledAt: Date | null;
};

/**
 * Resolve an org's effective retention window.
 *
 * Active/trialing subscriptions use that plan's window. Canceled
 * subscriptions keep their old plan's window for CANCELLATION_GRACE_DAYS
 * after their period ends, then drop to free. No subscription row at all is
 * treated as free.
 */
export async function getOrgRetention(
  organizationId: string
): Promise<OrgRetention> {
  const rows = await db
    .select({
      plan: subscription.plan,
      status: subscription.status,
      periodEnd: subscription.periodEnd,
    })
    .from(subscription)
    .where(eq(subscription.referenceId, organizationId))
    .limit(1);

  const row = rows[0];

  let plan = DEFAULT_PLAN;
  let canceledAt: Date | null = null;

  if (row) {
    if (row.status === "active" || row.status === "trialing") {
      plan = row.plan;
    } else if (row.periodEnd) {
      // Canceled (or any other terminal status) — keep the old plan's
      // window until CANCELLATION_GRACE_DAYS after the period ended.
      const graceCutoff = daysAgo(CANCELLATION_GRACE_DAYS);
      if (row.periodEnd >= graceCutoff) {
        plan = row.plan;
      } else {
        plan = DEFAULT_PLAN;
      }
      canceledAt = row.periodEnd;
    }
    // No periodEnd on a non-active row — nothing to grace off of, free.
  }

  const visibleDays = VISIBLE_DAYS[plan] ?? VISIBLE_DAYS[DEFAULT_PLAN];
  const deleteAfterDays = visibleDays + GRACE_DAYS;

  return { plan, visibleDays, deleteAfterDays, canceledAt };
}

type MessageSendCleanupResult = {
  rowsDeleted: number;
  oldestRemaining: Date | null;
};

/**
 * Delete (or, in dry-run, count) message_send rows older than the org's
 * deleteAfterDays cutoff, batched by id — never a single unbatched DELETE.
 */
async function cleanupMessageSendForOrg(
  organizationId: string,
  deleteAfterDays: number
): Promise<MessageSendCleanupResult> {
  const cutoff = daysAgo(deleteAfterDays);
  let rowsDeleted = 0;

  while (true) {
    const batch = await db
      .select({ id: messageSend.id })
      .from(messageSend)
      .where(
        and(
          eq(messageSend.organizationId, organizationId),
          lt(messageSend.createdAt, cutoff)
        )
      )
      .limit(BATCH_SIZE);

    if (batch.length === 0) {
      break;
    }

    if (DRY_RUN) {
      rowsDeleted += batch.length;
      break;
    }

    const ids = batch.map((r) => r.id);
    // biome-ignore lint/plugin: ids came from the org-scoped select above —
    // deleting by that id set is already scoped to organizationId.
    await db.delete(messageSend).where(inArray(messageSend.id, ids));
    rowsDeleted += ids.length;

    if (ids.length < BATCH_SIZE) {
      break;
    }

    await sleep(BATCH_PAUSE_MS);
  }

  const [oldest] = await db
    .select({ createdAt: messageSend.createdAt })
    .from(messageSend)
    .where(eq(messageSend.organizationId, organizationId))
    .orderBy(messageSend.createdAt)
    .limit(1);

  return { rowsDeleted, oldestRemaining: oldest?.createdAt ?? null };
}

/**
 * Count message_send rows for an org that are older than the visible window
 * but not yet past the delete cutoff — the grace-month population that gets
 * the warning notification.
 */
async function countGraceWindowRows(
  organizationId: string,
  visibleDays: number,
  deleteAfterDays: number
): Promise<number> {
  const visibleCutoff = daysAgo(visibleDays);
  const deleteCutoff = daysAgo(deleteAfterDays);

  const rows = await db
    .select({ id: messageSend.id })
    .from(messageSend)
    .where(
      and(
        eq(messageSend.organizationId, organizationId),
        lt(messageSend.createdAt, visibleCutoff),
        gte(messageSend.createdAt, deleteCutoff)
      )
    )
    .limit(BATCH_SIZE);

  return rows.length;
}

async function wasRecentlyWarned(organizationId: string): Promise<boolean> {
  const [recent] = await db
    .select({ id: notification.id })
    .from(notification)
    .where(
      and(
        eq(notification.organizationId, organizationId),
        eq(notification.type, WARNING_TYPE),
        gte(notification.createdAt, daysAgo(WARNING_DEDUPE_DAYS))
      )
    )
    .limit(1);

  return Boolean(recent);
}

/**
 * Warn org owners/admins that rows have entered the grace window and will be
 * deleted soon. Deduped: at most one warning per org per WARNING_DEDUPE_DAYS.
 *
 * The body states a fact about these specific rows (count + deletion date),
 * never a claim about the plan's advertised retention — VISIBLE_DAYS here is
 * deliberately more generous than `historyRetentionDays` in
 * apps/web/src/lib/plans.ts, so a stated N-day retention promise would be
 * false for every plan but scale. See plans/210.
 */
async function warnOrgIfNeeded(
  organizationId: string,
  plan: string,
  visibleDays: number,
  deleteAfterDays: number
): Promise<void> {
  const count = await countGraceWindowRows(
    organizationId,
    visibleDays,
    deleteAfterDays
  );

  if (count === 0) {
    return;
  }

  if (await wasRecentlyWarned(organizationId)) {
    return;
  }

  const deletionDate = daysAgo(-GRACE_DAYS).toISOString().slice(0, 10);

  await notifyOrg({
    organizationId,
    roles: ["owner", "admin"],
    type: WARNING_TYPE,
    title: "Some of your email history will be removed soon",
    body: `${count} messages older than ${visibleDays} days will be deleted from your Wraps dashboard on ${deletionDate}. Upgrade to keep a longer history — your raw delivery events remain in your own AWS account either way.`,
    href: "/settings/billing",
    data: { rowsAffected: count, deletionDate, plan, visibleDays },
  });
}

/**
 * Delete (or, in dry-run, count) contact_event rows past their expires_at.
 * Global pass, not per-org — expires_at is already the contract on these
 * rows. Rows with a NULL expires_at predate the TTL and are left alone.
 */
async function cleanupExpiredContactEvents(): Promise<number> {
  let rowsDeleted = 0;

  while (true) {
    const batch = await db
      .select({ id: contactEvent.id })
      .from(contactEvent)
      // biome-ignore lint/plugin: deliberately global, not org-scoped —
      // expires_at is already the contract on these rows (see plans/210 step
      // 4), so plan windows and per-org scoping don't apply to this pass.
      .where(
        and(
          isNotNull(contactEvent.expiresAt),
          lt(contactEvent.expiresAt, new Date())
        )
      )
      .limit(BATCH_SIZE);

    if (batch.length === 0) {
      break;
    }

    if (DRY_RUN) {
      rowsDeleted += batch.length;
      break;
    }

    const ids = batch.map((r) => r.id);
    // biome-ignore lint/plugin: ids came from the global expires_at select
    // above, which is intentionally not org-scoped (see comment above).
    await db.delete(contactEvent).where(inArray(contactEvent.id, ids));
    rowsDeleted += ids.length;

    if (ids.length < BATCH_SIZE) {
      break;
    }

    await sleep(BATCH_PAUSE_MS);
  }

  return rowsDeleted;
}

export const handler: Handler = wrapHandler(async () => {
  log.info("[message-send-cleanup] Starting cleanup run", { dryRun: DRY_RUN });

  const orgs = await db
    .selectDistinct({ organizationId: messageSend.organizationId })
    .from(messageSend);

  log.info("[message-send-cleanup] Processing orgs", { count: orgs.length });

  let totalDeleted = 0;

  for (const { organizationId } of orgs) {
    const { plan, visibleDays, deleteAfterDays } =
      await getOrgRetention(organizationId);

    await warnOrgIfNeeded(organizationId, plan, visibleDays, deleteAfterDays);

    const { rowsDeleted, oldestRemaining } = await cleanupMessageSendForOrg(
      organizationId,
      deleteAfterDays
    );

    if (rowsDeleted > 0) {
      log.info("[message-send-cleanup] Processed org", {
        organizationId,
        plan,
        deleteAfterDays,
        dryRun: DRY_RUN,
        ...(DRY_RUN ? { rowsWouldDelete: rowsDeleted } : { rowsDeleted }),
        oldestRemaining,
      });
    }

    totalDeleted += rowsDeleted;
  }

  const contactEventsDeleted = await cleanupExpiredContactEvents();

  log.info("[message-send-cleanup] Cleanup complete", {
    dryRun: DRY_RUN,
    ...(DRY_RUN
      ? { messageSendRowsWouldDelete: totalDeleted }
      : { messageSendRowsDeleted: totalDeleted }),
    ...(DRY_RUN
      ? { contactEventRowsWouldDelete: contactEventsDeleted }
      : { contactEventRowsDeleted: contactEventsDeleted }),
  });

  await flushLogger();
});
