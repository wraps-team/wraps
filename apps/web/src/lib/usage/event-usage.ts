import { db } from "@wraps/db";
import { eventUsageMonthly } from "@wraps/db/schema/usage";
import { and, eq, sql } from "drizzle-orm";
import { getOrganizationPlanId } from "@/lib/organization";
import { isSelfHosted } from "@/lib/plan-limits";
import {
  EVENT_GRACE_MULTIPLIER,
  getEventLimit,
  getEventUsageThreshold,
} from "@/lib/plans";

// ═══════════════════════════════════════════════════════════════════════════
// PERIOD KEY HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get the period key for event usage tracking.
 *
 * Uses calendar month (YYYY-MM format) for event limits.
 * This ensures all users get their event limit reset each calendar month.
 */
export function getEventUsagePeriodKey(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// USAGE QUERIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get current event usage for an organization in the current calendar month.
 * This is the fast path - single indexed query.
 */
export async function getEventUsageCount(
  organizationId: string
): Promise<number> {
  const periodKey = getEventUsagePeriodKey();

  const usage = await db.query.eventUsageMonthly.findFirst({
    where: and(
      eq(eventUsageMonthly.organizationId, organizationId),
      eq(eventUsageMonthly.periodKey, periodKey)
    ),
  });

  return usage?.eventCount ?? 0;
}

/**
 * Check if organization can ingest events.
 * Returns detailed usage info including threshold status.
 */
export async function checkEventUsageLimit(organizationId: string): Promise<{
  allowed: boolean;
  current: number;
  limit: number;
  planId: string;
  percentUsed: number;
  threshold: "normal" | "warning" | "critical" | "exceeded";
}> {
  const [planId, currentUsage] = await Promise.all([
    getOrganizationPlanId(organizationId),
    getEventUsageCount(organizationId),
  ]);

  // Self-hosted deployments are licensed, not metered — no event cap.
  const limit = isSelfHosted() ? -1 : getEventLimit(planId);
  const threshold =
    limit === -1 ? "normal" : getEventUsageThreshold(planId, currentUsage);

  // Allow if unlimited (-1) or below the grace ceiling. Reads the shared
  // constant rather than repeating the number: the parity test in
  // baseline/architecture.test.ts compares the two EVENT_GRACE_MULTIPLIER
  // declarations, so a literal here would silently keep enforcing the old
  // ceiling after the constant moved.
  const allowed = limit === -1 || currentUsage < limit * EVENT_GRACE_MULTIPLIER;

  // Calculate percent used (0 if unlimited)
  const percentUsed =
    limit === -1 ? 0 : Math.round((currentUsage / limit) * 100);

  return {
    allowed,
    current: currentUsage,
    limit,
    planId,
    percentUsed,
    threshold,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// USAGE TRACKING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Increment event usage count for an organization.
 * Uses upsert pattern for atomicity.
 *
 * @param organizationId - The organization ID
 * @param count - Number of events to add (default 1)
 * @returns The new total event count for this period
 */
export async function incrementEventUsage(
  organizationId: string,
  count = 1
): Promise<number> {
  const periodKey = getEventUsagePeriodKey();

  // Use upsert with ON CONFLICT to atomically increment
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

// ═══════════════════════════════════════════════════════════════════════════
// WARNING MESSAGES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get warning info based on current event usage.
 * Event usage resets on the 1st of each calendar month.
 */
export function getEventUsageWarning(
  current: number,
  limit: number,
  threshold: "normal" | "warning" | "critical" | "exceeded"
): {
  message: string | null;
  action: "upgrade" | "view_usage" | null;
} {
  // No warning for unlimited plans
  if (limit === -1) {
    return { message: null, action: null };
  }

  const remaining = Math.max(0, limit - current);
  const percentUsed = Math.round((current / limit) * 100);
  const resetInfo = `Resets ${formatNextMonthReset()}.`;

  switch (threshold) {
    case "exceeded":
      return {
        message: `Event limit exceeded (${percentUsed}% used). New events are blocked until ${formatNextMonthReset()} or you upgrade.`,
        action: "upgrade",
      };
    case "critical":
      return {
        message: `You've reached your monthly event limit of ${limit.toLocaleString()}. ${resetInfo}`,
        action: "upgrade",
      };
    case "warning":
      return {
        message: `${remaining.toLocaleString()} events remaining (${100 - percentUsed}% left). ${resetInfo}`,
        action: "view_usage",
      };
    default:
      return { message: null, action: null };
  }
}

/**
 * Format when the next month reset occurs for display
 */
function formatNextMonthReset(): string {
  const now = new Date();

  // Get the 1st of next month in UTC
  const nextMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)
  );

  const diffDays = Math.ceil(
    (nextMonth.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays <= 0) {
    return "soon";
  }
  if (diffDays === 1) {
    return "tomorrow";
  }
  if (diffDays <= 7) {
    return `in ${diffDays} days`;
  }

  // Otherwise show the date (1st of next month)
  return `on ${nextMonth.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// USAGE SUMMARY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get complete event usage summary for an organization.
 * Used for billing page and usage dashboards.
 */
export async function getEventUsageSummary(
  organizationId: string,
  periodKey?: string
): Promise<{
  periodKey: string;
  eventCount: number;
  limit: number;
  planId: string;
  percentUsed: number;
  threshold: "normal" | "warning" | "critical" | "exceeded";
  remaining: number;
}> {
  const period = periodKey ?? getEventUsagePeriodKey();
  const [planId, usage] = await Promise.all([
    getOrganizationPlanId(organizationId),
    db.query.eventUsageMonthly.findFirst({
      where: and(
        eq(eventUsageMonthly.organizationId, organizationId),
        eq(eventUsageMonthly.periodKey, period)
      ),
    }),
  ]);

  const limit = isSelfHosted() ? -1 : getEventLimit(planId);
  const eventCount = usage?.eventCount ?? 0;
  const percentUsed = limit === -1 ? 0 : Math.round((eventCount / limit) * 100);
  const threshold =
    limit === -1 ? "normal" : getEventUsageThreshold(planId, eventCount);
  const remaining = limit === -1 ? -1 : Math.max(0, limit - eventCount);

  return {
    periodKey: period,
    eventCount,
    limit,
    planId,
    percentUsed,
    threshold,
    remaining,
  };
}

/**
 * Calculate the 2-year TTL expiration date for event records.
 * Used when inserting new events to set the expiresAt field.
 */
export function getEventTTLExpiration(): Date {
  const ttl = new Date();
  ttl.setFullYear(ttl.getFullYear() + 2);
  return ttl;
}
