/**
 * The single place that writes deliverability state (bounced, soft_bounced,
 * complained, suppressed, recovery) onto a contact. Called from
 * routes/webhooks.ts.
 *
 * Soft-bounce policy:
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
 * Every write is a single atomic UPDATE scoped by organizationId. They accept
 * an optional `client` so callers can run them inside their own transaction.
 */

import {
  classifyBounce,
  SOFT_BOUNCE_ESCALATION_THRESHOLD,
  SOFT_BOUNCE_MIN_GAP_HOURS,
} from "@wraps/core/bounce-classification";
import {
  contact,
  db,
  eq,
  findContactByEmailHash,
  hashContactValue,
} from "@wraps/db";
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

export async function markContactBounced({
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
  await client
    .update(contact)
    .set({ emailStatus: "bounced", emailBouncedAt: bouncedAt })
    .where(
      and(eq(contact.id, contactId), eq(contact.organizationId, organizationId))
    );
}

export async function markContactComplained({
  organizationId,
  contactId,
  complainedAt,
  client = db,
}: {
  organizationId: string;
  contactId: string;
  complainedAt: Date;
  client?: DbClient;
}): Promise<void> {
  await client
    .update(contact)
    .set({ emailStatus: "complained", emailComplainedAt: complainedAt })
    .where(
      and(eq(contact.id, contactId), eq(contact.organizationId, organizationId))
    );
}

export async function markContactSuppressed({
  organizationId,
  contactId,
  suppressedAt,
  client = db,
}: {
  organizationId: string;
  contactId: string;
  suppressedAt: Date;
  client?: DbClient;
}): Promise<void> {
  await client
    .update(contact)
    .set({ emailStatus: "suppressed", emailSuppressedAt: suppressedAt })
    .where(
      and(eq(contact.id, contactId), eq(contact.organizationId, organizationId))
    );
}

/**
 * Find the contact in `organizationId` whose email matches `recipient`
 * (case-insensitive, via the contact email hash). Returns null when there is
 * none; never creates a contact.
 */
export async function findContactIdByRecipient({
  organizationId,
  recipient,
  client = db,
}: {
  organizationId: string;
  recipient: string | null | undefined;
  client?: DbClient;
}): Promise<string | null> {
  if (!recipient?.trim()) {
    return null;
  }
  const found = await findContactByEmailHash(
    hashContactValue(recipient),
    organizationId,
    client
  );
  return found?.id ?? null;
}

/**
 * Same as clearSoftBounce but keyed by recipient address, for deliveries on SDK
 * sends where no contact id is known. One UPDATE; matches no row in the common
 * case.
 */
export async function clearSoftBounceByRecipient({
  organizationId,
  recipient,
  deliveredAt,
  client = db,
}: {
  organizationId: string;
  recipient: string;
  deliveredAt: Date;
  client?: DbClient;
}): Promise<void> {
  if (!recipient.trim()) {
    return;
  }
  await client
    .update(contact)
    .set({
      emailStatus: "active",
      emailSoftBounceCount: 0,
      emailLastSoftBouncedAt: null,
    })
    .where(
      and(
        eq(contact.emailHash, hashContactValue(recipient)),
        eq(contact.organizationId, organizationId),
        eq(contact.emailStatus, "soft_bounced"),
        or(
          isNull(contact.emailLastSoftBouncedAt),
          lt(contact.emailLastSoftBouncedAt, deliveredAt)
        )
      )
    );
}

type LifecycleDetail = {
  bounce?: { bounceType?: string; bounceSubType?: string; timestamp?: string };
  complaint?: { timestamp?: string };
  suppression?: { timestamp?: string };
  delivery?: { timestamp?: string };
};

function eventTime(timestamp: string | undefined): Date {
  return timestamp ? new Date(timestamp) : new Date();
}

/**
 * Apply an SES lifecycle event to a contact with the same rules the webhook
 * uses for broadcast sends. Used when the first event for an SDK send creates
 * the message row.
 */
export async function applyLifecycleToContact({
  organizationId,
  contactId,
  eventType,
  detail,
  client = db,
}: {
  organizationId: string;
  contactId: string;
  eventType: string;
  detail: LifecycleDetail;
  client?: DbClient;
}): Promise<void> {
  switch (eventType) {
    case "Bounce": {
      const bounceType = detail.bounce?.bounceType;
      const bounceSubType = detail.bounce?.bounceSubType;
      const bouncedAt = eventTime(detail.bounce?.timestamp);
      if (
        bounceSubType === "Suppressed" ||
        bounceSubType === "EmailValidationSuppressed"
      ) {
        await markContactSuppressed({
          organizationId,
          contactId,
          suppressedAt: bouncedAt,
          client,
        });
        return;
      }
      const kind = classifyBounce(bounceType, bounceSubType);
      if (kind === "hard") {
        await markContactBounced({
          organizationId,
          contactId,
          bouncedAt,
          client,
        });
      } else if (kind === "soft") {
        await recordSoftBounce({
          organizationId,
          contactId,
          bouncedAt,
          client,
        });
      }
      return;
    }
    case "Complaint":
      await markContactComplained({
        organizationId,
        contactId,
        complainedAt: eventTime(detail.complaint?.timestamp),
        client,
      });
      return;
    case "Suppressed":
      await markContactSuppressed({
        organizationId,
        contactId,
        suppressedAt: eventTime(detail.suppression?.timestamp),
        client,
      });
      return;
    case "Delivery":
      await clearSoftBounce({
        organizationId,
        contactId,
        deliveredAt: eventTime(detail.delivery?.timestamp),
        client,
      });
      return;
    default:
      return;
  }
}
