/**
 * Event Usage Limit Middleware
 *
 * Observability only. Reports monthly custom-event usage per plan tier via
 * response headers and logs a warning at 100% of the plan's included volume.
 * It does not block ingestion — event volume is unmetered on every plan; see
 * the comment on enforceEventLimit for why.
 *
 * Usage: call applyEventLimit(app) on the Elysia instance that owns your
 * routes. Do NOT wrap in a plugin — Elysia 1.4 does not propagate plugin
 * hooks to parent route instances.
 */

import { and, db, eq, eventUsageMonthly, sqlExpr as sql } from "@wraps/db";

import { isSelfHosted } from "../(ee)/lib/license";
import { log } from "../lib/logger";
import { getAuthOptional } from "./auth";

// Tracked event limits per plan (tracked events per month, -1 = unlimited)
// Aligned with apps/web/src/lib/plans.ts
const EVENT_LIMITS = {
  free: -1,
  pro: -1,
  business: -1,
  // Legacy plans — see plans/208. Events are unmetered on every plan.
  starter: -1,
  growth: -1,
  scale: -1,
} as const;

/**
 * Get period key for current month (YYYY-MM format)
 */
function getPeriodKey(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Get current event usage count for an organization
 */
async function getEventUsageCount(organizationId: string): Promise<number> {
  const periodKey = getPeriodKey();

  const [usage] = await db
    .select({ eventCount: eventUsageMonthly.eventCount })
    .from(eventUsageMonthly)
    .where(
      and(
        eq(eventUsageMonthly.organizationId, organizationId),
        eq(eventUsageMonthly.periodKey, periodKey)
      )
    )
    .limit(1);

  return usage?.eventCount ?? 0;
}

/**
 * Increment event usage count (called after successful event ingestion)
 */
export async function incrementEventUsage(
  organizationId: string,
  count = 1
): Promise<number> {
  const periodKey = getPeriodKey();

  const result = await db
    .insert(eventUsageMonthly)
    .values({
      organizationId,
      periodKey,
      eventCount: count,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [eventUsageMonthly.organizationId, eventUsageMonthly.periodKey],
      set: {
        eventCount: sql`${eventUsageMonthly.eventCount} + ${count}`,
        updatedAt: new Date(),
      },
    })
    .returning({ eventCount: eventUsageMonthly.eventCount });

  return result[0]?.eventCount ?? count;
}

/**
 * Calculate 2-year TTL for event records (used in events route)
 */
export function getEventTTLExpiration(): Date {
  const ttl = new Date();
  ttl.setFullYear(ttl.getFullYear() + 2);
  return ttl;
}

/**
 * onBeforeHandle callback that enforces monthly event limits.
 *
 * Add directly to the Elysia instance that owns your routes:
 *   createAuthenticatedRoutes("/v1/events").onBeforeHandle(enforceEventLimit).post(...)
 *
 * Elysia 1.4 does not propagate plugin hooks to parent route instances, so
 * this must be added inline — not wrapped in a plugin and .use()-d.
 */
// Observability only — this no longer blocks. Event volume is unmetered on
// every plan; the abuse backstop is the per-org rate limit (see rateLimits in
// apps/web/src/lib/plans.ts), not this counter. Headers are retained because
// the dashboard's event-usage card reads them.
// biome-ignore lint/suspicious/noExplicitAny: ctx shape varies across Elysia route instances
export async function enforceEventLimit(ctx: any) {
  const auth = getAuthOptional(ctx);
  if (!auth) return;

  // Self-hosted deployments are licensed — no monthly event cap.
  if (isSelfHosted()) return;

  const { set } = ctx;
  const { organizationId, planId } = auth;
  const limit =
    EVENT_LIMITS[planId as keyof typeof EVENT_LIMITS] ?? EVENT_LIMITS.free;

  try {
    const currentUsage = await getEventUsageCount(organizationId);

    if (limit === -1) {
      set.headers["X-Event-Limit"] = "-1";
      set.headers["X-Event-Current"] = String(currentUsage);
      set.headers["X-Event-Remaining"] = "-1";
      set.headers["X-Event-Percent"] = "0";
      return;
    }

    const percentUsed = Math.round((currentUsage / limit) * 100);
    const remaining = Math.max(0, limit - currentUsage);

    set.headers["X-Event-Limit"] = String(limit);
    set.headers["X-Event-Current"] = String(currentUsage);
    set.headers["X-Event-Remaining"] = String(remaining);
    set.headers["X-Event-Percent"] = String(percentUsed);

    if (currentUsage >= limit) {
      log.warn("Event limit reached", {
        organizationId,
        percentUsed,
        currentUsage,
        limit,
      });
    }
  } catch (error) {
    log.error("Event limit check failed", error, { organizationId });
    // fail open — a DB error here should not block event ingestion
  }
}
