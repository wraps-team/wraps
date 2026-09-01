/**
 * Event Usage Limit Middleware
 *
 * Enforces the monthly custom-event allowance for the org's plan.
 *
 * Only Free is metered (5,000/month). Paid plans are unlimited, so this is a
 * Free-to-Pro upgrade prompt, not a billing meter — it is the one lever with an
 * observed organic conversion behind it. It meters custom events only, never
 * email sends: sending runs through the customer's own SES account and Wraps
 * takes no cut of it.
 *
 * Thresholds:
 * - 100%: warning logged, headers report zero remaining
 * - 110%: hard block with 429 (see EVENT_GRACE_MULTIPLIER)
 *
 * Usage: call applyEventLimit(app) on the Elysia instance that owns your
 * routes. Do NOT wrap in a plugin — Elysia 1.4 does not propagate plugin
 * hooks to parent route instances.
 */

import { and, db, eq, eventUsageMonthly, sqlExpr as sql } from "@wraps/db";

import { isSelfHosted } from "../(ee)/lib/license";
import { log } from "../lib/logger";
import { isPlanId, type PlanId } from "../lib/plan-ids";
import { getAuthOptional } from "./auth";

// Monthly custom-event allowance per plan (-1 = unlimited).
// Mirrors `maxCustomEvents` in apps/web/src/lib/plans.ts; a parity test in
// baseline/architecture.test.ts fails if the two drift.
const EVENT_LIMITS = {
  free: 5000,
  pro: -1,
  business: -1,
  // Legacy plans are unlimited — they all map to a paid tier.
  starter: -1,
  growth: -1,
  scale: -1,
} as const satisfies Record<PlanId, number>;

/**
 * Grace above the allowance before ingestion is blocked. Mirrors
 * EVENT_GRACE_MULTIPLIER in apps/web/src/lib/plans.ts — a parity test in
 * baseline/architecture.test.ts fails if the two drift. 5,000 included events
 * keep flowing to 5,500, so an org that trips the cap mid-month gets a warning
 * and a header countdown before a wall of 429s.
 */
export const EVENT_GRACE_MULTIPLIER = 1.1;

/**
 * How many events this request is asking to store.
 *
 * The gate runs before the handler and the counter is incremented after it, so
 * checking `currentUsage` alone lets a single batch land entirely on top of the
 * grace ceiling — a 1,000-event batch (the route's `maxItems`) posted at 5,499
 * used to settle at 6,499, ~30% past a 10% grace band. Charging the request its
 * real cost up front closes that: the ceiling holds no matter how the events
 * are packetized.
 *
 * Reads the parsed body defensively. If the shape is not the batch envelope —
 * the single-event route, or a body Elysia has not parsed at this point in the
 * lifecycle — the cost is 1, which is what the check did before.
 */
function requestedEventCount(body: unknown): number {
  if (
    typeof body === "object" &&
    body !== null &&
    "events" in body &&
    Array.isArray((body as { events: unknown[] }).events)
  ) {
    return (body as { events: unknown[] }).events.length;
  }
  return 1;
}

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
// biome-ignore lint/suspicious/noExplicitAny: ctx shape varies across Elysia route instances
export async function enforceEventLimit(ctx: any) {
  const auth = getAuthOptional(ctx);
  if (!auth) return;

  // Self-hosted deployments are licensed — no monthly event cap.
  if (isSelfHosted()) return;

  const { set } = ctx;
  const { organizationId, planId } = auth;
  // Explicit narrow — see the note in middleware/plan-gate.ts. A raw index
  // returns a Function for a prototype key, which would make the headers NaN.
  const limit = isPlanId(planId) ? EVENT_LIMITS[planId] : EVENT_LIMITS.free;

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
    const graceLimit = Math.floor(limit * EVENT_GRACE_MULTIPLIER);
    const requested = requestedEventCount(ctx.body);

    set.headers["X-Event-Limit"] = String(limit);
    set.headers["X-Event-Current"] = String(currentUsage);
    set.headers["X-Event-Remaining"] = String(remaining);
    set.headers["X-Event-Percent"] = String(percentUsed);

    // Refuse the request that would CROSS the ceiling, not merely the one that
    // starts past it. All-or-nothing on a batch: partially ingesting would make
    // the response's `processed` count disagree with what the caller sent, and
    // there is no way to tell them which events were dropped.
    if (currentUsage + requested > graceLimit) {
      set.status = 429;
      set.headers["X-Event-Exceeded"] = "true";
      set.headers["Retry-After"] = String(getSecondsUntilNextMonth());
      return {
        error: "event_limit_exceeded",
        message: `Monthly custom event limit exceeded (${percentUsed}% used). This request asks to store ${requested} event${requested === 1 ? "" : "s"} with ${Math.max(0, graceLimit - currentUsage)} remaining before the cap. Upgrade your plan to continue ingesting events.`,
        upgradeUrl: "https://app.wraps.dev/settings/billing",
        current: currentUsage,
        limit,
        requested,
        percentUsed,
        resetsAt: getNextMonthResetDate().toISOString(),
      };
    }

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

/**
 * Get seconds until the 1st of next month (for Retry-After header)
 */
function getSecondsUntilNextMonth(): number {
  const now = new Date();
  return Math.ceil((getNextMonthResetDate().getTime() - now.getTime()) / 1000);
}

/**
 * Get the Date object for the 1st of next month
 */
function getNextMonthResetDate(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0)
  );
}
