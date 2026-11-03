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
 * Every write is a single atomic UPDATE scoped by organizationId.
 *
 * The writes that can end sendability (bounced, soft bounce, complained,
 * suppressed) first lock the contact row and read its status, then return
 * what changed so the caller can emit `contact_updated` once the transaction
 * commits. They require a transaction `client`: on the pool the read would
 * auto-commit and release its lock before the UPDATE, and two concurrent
 * calls could both report the same change. Recovery takes an optional
 * `client`, returns nothing and never emits.
 */

import {
  classifyBounce,
  isSuppressionBounceSubType,
  SOFT_BOUNCE_ESCALATION_THRESHOLD,
  SOFT_BOUNCE_MIN_GAP_HOURS,
} from "@wraps/core/bounce-classification";
import {
  contact,
  db,
  type EmailStatus,
  eq,
  findContactByEmailHash,
  hashContactValue,
} from "@wraps/db";
import { and, inArray, isNull, lt, or, sql } from "drizzle-orm";
import type { ContactChangeSource } from "./workflow-events";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbClient = typeof db | DbTransaction;

/** A contact's email status before and after one of the writes below. */
export type EmailStatusChange = {
  contactId: string;
  previousStatus: EmailStatus | null;
  newStatus: EmailStatus | null;
};

/**
 * Whether a write's result emits `contact_updated`: the status really changed,
 * and it is not a soft bounce that left the contact `soft_bounced` (still
 * sendable). A soft bounce that escalates to `bounced` does emit.
 */
export function emitsContactUpdated(
  change: EmailStatusChange | null
): change is EmailStatusChange {
  return (
    change !== null &&
    change.previousStatus !== change.newStatus &&
    change.newStatus !== "soft_bounced"
  );
}

/**
 * Lock the contact row and read its status, scoped like the UPDATE that
 * follows, on the caller's transaction so the read and the write see the same
 * row. `FOR NO KEY UPDATE` is the lock that UPDATE takes anyway (it sets no
 * key column), so the read adds no new conflict: unlike `FOR UPDATE` it does
 * not block the `FOR KEY SHARE` lock a foreign-key check takes when a row
 * referencing the contact (contact_event, message_send, workflow_execution,
 * contact_topic) is inserted. It still serializes concurrent writers.
 */
async function lockEmailStatus(
  client: DbTransaction,
  organizationId: string,
  contactId: string
): Promise<{ emailStatus: EmailStatus | null } | undefined> {
  const [row] = await client
    .select({ emailStatus: contact.emailStatus })
    .from(contact)
    .where(
      and(eq(contact.id, contactId), eq(contact.organizationId, organizationId))
    )
    .for("no key update");
  return row;
}

function statusChange(
  contactId: string,
  before: { emailStatus: EmailStatus | null } | undefined,
  after: { emailStatus: EmailStatus | null } | undefined
): EmailStatusChange | null {
  if (!(before && after)) {
    return null;
  }
  return {
    contactId,
    previousStatus: before.emailStatus,
    newStatus: after.emailStatus,
  };
}

/** `client` must be a transaction: the row lock lasts until it commits. */
export async function recordSoftBounce({
  organizationId,
  contactId,
  bouncedAt,
  client,
}: {
  organizationId: string;
  contactId: string;
  bouncedAt: Date;
  client: DbTransaction;
}): Promise<EmailStatusChange | null> {
  // ISO string cast so the stored wall time is UTC regardless of host timezone.
  const at = sql`${bouncedAt.toISOString()}::timestamp`;
  const counts = sql`(${contact.emailLastSoftBouncedAt} IS NULL OR ${contact.emailLastSoftBouncedAt} <= ${at} - make_interval(hours => ${SOFT_BOUNCE_MIN_GAP_HOURS}))`;
  const nextCount = sql`(${contact.emailSoftBounceCount} + CASE WHEN ${counts} THEN 1 ELSE 0 END)`;
  const escalates = sql`${nextCount} >= ${SOFT_BOUNCE_ESCALATION_THRESHOLD}`;

  const before = await lockEmailStatus(client, organizationId, contactId);
  const [after] = await client
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
    )
    .returning({ emailStatus: contact.emailStatus });
  return statusChange(contactId, before, after);
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

/** `client` must be a transaction: the row lock lasts until it commits. */
export async function markContactBounced({
  organizationId,
  contactId,
  bouncedAt,
  client,
}: {
  organizationId: string;
  contactId: string;
  bouncedAt: Date;
  client: DbTransaction;
}): Promise<EmailStatusChange | null> {
  const before = await lockEmailStatus(client, organizationId, contactId);
  const [after] = await client
    .update(contact)
    .set({ emailStatus: "bounced", emailBouncedAt: bouncedAt })
    .where(
      and(eq(contact.id, contactId), eq(contact.organizationId, organizationId))
    )
    .returning({ emailStatus: contact.emailStatus });
  return statusChange(contactId, before, after);
}

/** `client` must be a transaction: the row lock lasts until it commits. */
export async function markContactComplained({
  organizationId,
  contactId,
  complainedAt,
  client,
}: {
  organizationId: string;
  contactId: string;
  complainedAt: Date;
  client: DbTransaction;
}): Promise<EmailStatusChange | null> {
  const before = await lockEmailStatus(client, organizationId, contactId);
  const [after] = await client
    .update(contact)
    .set({ emailStatus: "complained", emailComplainedAt: complainedAt })
    .where(
      and(eq(contact.id, contactId), eq(contact.organizationId, organizationId))
    )
    .returning({ emailStatus: contact.emailStatus });
  return statusChange(contactId, before, after);
}

/** `client` must be a transaction: the row lock lasts until it commits. */
export async function markContactSuppressed({
  organizationId,
  contactId,
  suppressedAt,
  client,
}: {
  organizationId: string;
  contactId: string;
  suppressedAt: Date;
  client: DbTransaction;
}): Promise<EmailStatusChange | null> {
  const before = await lockEmailStatus(client, organizationId, contactId);
  const [after] = await client
    .update(contact)
    .set({ emailStatus: "suppressed", emailSuppressedAt: suppressedAt })
    .where(
      and(eq(contact.id, contactId), eq(contact.organizationId, organizationId))
    )
    .returning({ emailStatus: contact.emailStatus });
  return statusChange(contactId, before, after);
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

/** The `changeSource` a lifecycle write reports. */
export type LifecycleChangeSource = Extract<
  ContactChangeSource,
  "bounce" | "complaint" | "ses_suppression"
>;

export type LifecycleChange = EmailStatusChange & {
  changeSource: LifecycleChangeSource;
};

function withSource(
  change: EmailStatusChange | null,
  changeSource: LifecycleChangeSource
): LifecycleChange | null {
  return change ? { ...change, changeSource } : null;
}

/**
 * Apply an SES lifecycle event to a contact with the same rules the webhook
 * uses for broadcast sends. Used when the first event for an SDK send creates
 * the message row. Returns the write's change and its `changeSource`; a
 * Delivery (recovery) or an event that writes nothing returns null. `client`
 * must be a transaction (see the helpers it calls).
 */
export async function applyLifecycleToContact({
  organizationId,
  contactId,
  eventType,
  detail,
  client,
}: {
  organizationId: string;
  contactId: string;
  eventType: string;
  detail: LifecycleDetail;
  client: DbTransaction;
}): Promise<LifecycleChange | null> {
  switch (eventType) {
    case "Bounce": {
      const bounceType = detail.bounce?.bounceType;
      const bounceSubType = detail.bounce?.bounceSubType;
      const bouncedAt = eventTime(detail.bounce?.timestamp);
      if (isSuppressionBounceSubType(bounceSubType)) {
        return withSource(
          await markContactSuppressed({
            organizationId,
            contactId,
            suppressedAt: bouncedAt,
            client,
          }),
          "ses_suppression"
        );
      }
      const kind = classifyBounce(bounceType, bounceSubType);
      if (kind === "hard") {
        return withSource(
          await markContactBounced({
            organizationId,
            contactId,
            bouncedAt,
            client,
          }),
          "bounce"
        );
      }
      if (kind === "soft") {
        return withSource(
          await recordSoftBounce({
            organizationId,
            contactId,
            bouncedAt,
            client,
          }),
          "bounce"
        );
      }
      return null;
    }
    case "Complaint":
      return withSource(
        await markContactComplained({
          organizationId,
          contactId,
          complainedAt: eventTime(detail.complaint?.timestamp),
          client,
        }),
        "complaint"
      );
    case "Suppressed":
      return withSource(
        await markContactSuppressed({
          organizationId,
          contactId,
          suppressedAt: eventTime(detail.suppression?.timestamp),
          client,
        }),
        "ses_suppression"
      );
    case "Delivery":
      await clearSoftBounce({
        organizationId,
        contactId,
        deliveredAt: eventTime(detail.delivery?.timestamp),
        client,
      });
      return null;
    default:
      return null;
  }
}
