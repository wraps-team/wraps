/**
 * Global unsubscribe, shared by the unsubscribe link (POST /unsubscribe/:token)
 * and the preference centre's "unsubscribe from all"
 * (POST /v1/preference-events/unsubscribe-all).
 *
 * Its own module, not part of workflow-events.ts: tests mock and wrap that
 * module's emitters, and a call from inside the same module would skip their
 * wrappers.
 */

import { contact, contactTopic, db, eq, topic } from "@wraps/db";
import { and, sql } from "drizzle-orm";
import { log } from "../lib/logger";
import { emitContactsUpdated, emitTopicUnsubscribed } from "./workflow-events";

export type GlobalUnsubscribeResult = {
  /** False when the contact is not in the organization; nothing was written. */
  found: boolean;
  /** True when this call moved the contact to `unsubscribed`. */
  changed: boolean;
  /** Topics the contact was subscribed to before this call. */
  topicCount: number;
};

/**
 * Unsubscribe the org's contact from all email: the contact becomes
 * `unsubscribed` and every topic subscription is unsubscribed. Emits
 * `topic_unsubscribed` per previously subscribed topic, and `contact_updated`
 * (changeSource "unsubscribe") only when the contact's status changed.
 *
 * `contact_topic` has no org column, so the org-scoped contact lookup comes
 * first: a contact outside the org returns `found: false` and touches nothing.
 */
export async function unsubscribeContactGlobally(
  organizationId: string,
  contactId: string
): Promise<GlobalUnsubscribeResult> {
  const [existingContact] = await db
    .select({ id: contact.id })
    .from(contact)
    .where(
      and(eq(contact.id, contactId), eq(contact.organizationId, organizationId))
    )
    .limit(1);

  if (!existingContact) {
    return { found: false, changed: false, topicCount: 0 };
  }

  const now = new Date();

  // Get all subscribed topics before unsubscribing (for event emission)
  const subscribedTopics = await db
    .select({
      topicId: contactTopic.topicId,
      topicName: topic.name,
    })
    .from(contactTopic)
    .innerJoin(
      topic,
      and(
        eq(topic.id, contactTopic.topicId),
        eq(topic.organizationId, organizationId)
      )
    )
    .where(
      and(
        eq(contactTopic.contactId, contactId),
        eq(contactTopic.status, "subscribed")
      )
    );

  // Guarded so only a real change writes and emits: two concurrent
  // one-click POSTs emit once, and a repeat keeps the first
  // emailUnsubscribedAt. The topic writes below stay unconditional.
  const changed = await db
    .update(contact)
    .set({
      emailStatus: "unsubscribed",
      emailUnsubscribedAt: now,
    })
    .where(
      and(
        eq(contact.id, contactId),
        eq(contact.organizationId, organizationId),
        sql`${contact.emailStatus} IS DISTINCT FROM 'unsubscribed'`
      )
    )
    .returning({ id: contact.id });

  // Also unsubscribe from all topics. The contact lookup above is the org
  // gate for this write.
  await db
    .update(contactTopic)
    .set({
      status: "unsubscribed",
      unsubscribedAt: now,
    })
    .where(eq(contactTopic.contactId, contactId));

  // Emit topic_unsubscribed events for all previously subscribed topics
  await Promise.all(
    subscribedTopics.map((t) =>
      emitTopicUnsubscribed({
        contactId,
        organizationId,
        topicId: t.topicId,
        topicName: t.topicName,
      }).catch((err) => {
        log.error("Failed to emit topic_unsubscribed event", err, {
          contactId,
          topicId: t.topicId,
        });
      })
    )
  );

  // After the contact write. A failed emit is logged: a committed
  // unsubscribe never becomes a 500.
  if (changed.length > 0) {
    await emitContactsUpdated(organizationId, [
      {
        contactId,
        updatedFields: ["emailStatus"],
        changeSource: "unsubscribe",
      },
    ]).catch((err) => {
      log.error("Failed to emit contact_updated event", err, {
        contactId,
      });
    });
  }

  log.info("Unsubscribe: global unsubscribe", {
    contactId,
    topicCount: subscribedTopics.length,
  });

  return {
    found: true,
    changed: changed.length > 0,
    topicCount: subscribedTopics.length,
  };
}
