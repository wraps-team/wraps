/**
 * Contact updates driven by SES soft bounces (called from routes/webhooks.ts).
 *
 * Policy:
 * - A soft bounce sets the contact to `soft_bounced`, which is still sendable
 *   (SES already retried before reporting it).
 * - The soft-bounce count rises at most once per SOFT_BOUNCE_MIN_GAP_HOURS, so a
 *   single recipient-side outage that bounces several emails does not escalate.
 * - At SOFT_BOUNCE_ESCALATION_THRESHOLD counted soft bounces the contact becomes
 *   `bounced` (not sendable) and `emailBouncedAt` is set.
 * - Soft bounces only act on contacts whose status is NULL, `active` or
 *   `soft_bounced`; `unsubscribed`, `complained`, `suppressed` and `bounced`
 *   are never overwritten.
 * - A later successful delivery clears `soft_bounced` back to `active`, resets
 *   the count AND clears `emailLastSoftBouncedAt`: "consecutive" ends at a
 *   successful delivery, so the 24-hour rule must not look back across it.
 *
 * Both writes are a single atomic UPDATE scoped by organizationId. They accept
 * an optional `client` so callers can run them inside their own transaction.
 */

import {
  SOFT_BOUNCE_ESCALATION_THRESHOLD,
  SOFT_BOUNCE_MIN_GAP_HOURS,
} from "@wraps/core/bounce-classification";
import { contact, db, eq } from "@wraps/db";
import { and, inArray, isNull, lt, or, sql } from "drizzle-orm";

type DbClient = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function recordSoftBounce({
  organizationId,
  contactId,
  bouncedAt,
  client = db,
}: {
  organizationId: string;
  contactId: string;
  bouncedAt: Date;
  client?: DbClient;
}): Promise<void> {
  // ISO string cast so the stored wall time is UTC regardless of host timezone.
  const at = sql`${bouncedAt.toISOString()}::timestamp`;
  const counts = sql`(${contact.emailLastSoftBouncedAt} IS NULL OR ${contact.emailLastSoftBouncedAt} <= ${at} - make_interval(hours => ${SOFT_BOUNCE_MIN_GAP_HOURS}))`;
  const nextCount = sql`(${contact.emailSoftBounceCount} + CASE WHEN ${counts} THEN 1 ELSE 0 END)`;
  const escalates = sql`${nextCount} >= ${SOFT_BOUNCE_ESCALATION_THRESHOLD}`;

  await client
    .update(contact)
    .set({
      emailSoftBounceCount: nextCount,
      emailLastSoftBouncedAt: sql`CASE WHEN ${counts} THEN ${at} ELSE ${contact.emailLastSoftBouncedAt} END`,
      emailStatus: sql`CASE WHEN ${escalates} THEN 'bounced' ELSE 'soft_bounced' END`,
      emailBouncedAt: sql`CASE WHEN ${escalates} THEN ${at} ELSE ${contact.emailBouncedAt} END`,
    })
    .where(
      and(
        eq(contact.id, contactId),
        eq(contact.organizationId, organizationId),
        or(
          isNull(contact.emailStatus),
          inArray(contact.emailStatus, ["active", "soft_bounced"])
        )
      )
    );
}

export async function clearSoftBounce({
  organizationId,
  contactId,
  deliveredAt,
  client = db,
}: {
  organizationId: string;
  contactId: string;
  deliveredAt: Date;
  client?: DbClient;
}): Promise<void> {
  // Guarded on the delivery being newer than the last counted soft bounce, so a
  // stale or retried Delivery for an older message cannot clear a newer bounce.
  await client
    .update(contact)
    .set({
      emailStatus: "active",
      emailSoftBounceCount: 0,
      emailLastSoftBouncedAt: null,
    })
    .where(
      and(
        eq(contact.id, contactId),
        eq(contact.organizationId, organizationId),
        eq(contact.emailStatus, "soft_bounced"),
        or(
          isNull(contact.emailLastSoftBouncedAt),
          lt(contact.emailLastSoftBouncedAt, deliveredAt)
        )
      )
    );
}
