"use server";

import { contact, contactTopic, db, eq, topic } from "@wraps/db";
import { and, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { verifyUnsubscribeToken } from "@/lib/unsubscribe-token";

interface ActionResult {
  success: boolean;
  error?: string;
}

/**
 * Update topic subscriptions for a contact
 */
export async function updatePreferences(
  token: string,
  contactId: string,
  organizationId: string,
  subscriptions: Record<string, boolean>
): Promise<ActionResult> {
  // Verify token matches the contact
  const payload = await verifyUnsubscribeToken(token);
  if (!payload || payload.cid !== contactId || payload.oid !== organizationId) {
    return { success: false, error: "Invalid token" };
  }

  try {
    const now = new Date();

    for (const [topicId, subscribed] of Object.entries(subscriptions)) {
      // Check if subscription exists
      const [existing] = await db
        .select({ status: contactTopic.status })
        .from(contactTopic)
        .where(
          and(
            eq(contactTopic.contactId, contactId),
            eq(contactTopic.topicId, topicId)
          )
        )
        .limit(1);

      if (subscribed) {
        if (existing) {
          // Update to subscribed
          if (existing.status !== "subscribed") {
            await db
              .update(contactTopic)
              .set({
                status: "subscribed",
                subscribedAt: now,
                unsubscribedAt: null,
              })
              .where(
                and(
                  eq(contactTopic.contactId, contactId),
                  eq(contactTopic.topicId, topicId)
                )
              );

            // Increment topic subscriber count
            await db
              .update(topic)
              .set({
                subscriberCount: sql`${topic.subscriberCount} + 1`,
              })
              .where(eq(topic.id, topicId));
          }
        } else {
          // Create subscription
          await db.insert(contactTopic).values({
            contactId,
            topicId,
            status: "subscribed",
            subscribedAt: now,
          });

          // Increment topic subscriber count
          await db
            .update(topic)
            .set({
              subscriberCount: sql`${topic.subscriberCount} + 1`,
            })
            .where(eq(topic.id, topicId));
        }
      } else if (existing && existing.status === "subscribed") {
        // Unsubscribe
        await db
          .update(contactTopic)
          .set({
            status: "unsubscribed",
            unsubscribedAt: now,
          })
          .where(
            and(
              eq(contactTopic.contactId, contactId),
              eq(contactTopic.topicId, topicId)
            )
          );

        // Decrement topic subscriber count
        await db
          .update(topic)
          .set({
            subscriberCount: sql`GREATEST(0, ${topic.subscriberCount} - 1)`,
          })
          .where(eq(topic.id, topicId));
      }
    }

    revalidatePath(`/preferences/${token}`);
    return { success: true };
  } catch (error) {
    console.error("[PREFERENCES] Error updating preferences:", error);
    return { success: false, error: "Failed to update preferences" };
  }
}

/**
 * Unsubscribe contact from all emails globally
 */
export async function unsubscribeGlobally(
  token: string,
  contactId: string,
  organizationId: string
): Promise<ActionResult> {
  // Verify token matches the contact
  const payload = await verifyUnsubscribeToken(token);
  if (!payload || payload.cid !== contactId || payload.oid !== organizationId) {
    return { success: false, error: "Invalid token" };
  }

  try {
    const now = new Date();

    // Update contact to unsubscribed
    await db
      .update(contact)
      .set({
        emailStatus: "unsubscribed",
        emailUnsubscribedAt: now,
      })
      .where(eq(contact.id, contactId));

    // Unsubscribe from all topics
    const existingSubscriptions = await db
      .select({ topicId: contactTopic.topicId, status: contactTopic.status })
      .from(contactTopic)
      .where(eq(contactTopic.contactId, contactId));

    for (const sub of existingSubscriptions) {
      if (sub.status === "subscribed") {
        await db
          .update(contactTopic)
          .set({
            status: "unsubscribed",
            unsubscribedAt: now,
          })
          .where(
            and(
              eq(contactTopic.contactId, contactId),
              eq(contactTopic.topicId, sub.topicId)
            )
          );

        // Decrement topic subscriber count
        await db
          .update(topic)
          .set({
            subscriberCount: sql`GREATEST(0, ${topic.subscriberCount} - 1)`,
          })
          .where(eq(topic.id, sub.topicId));
      }
    }

    revalidatePath(`/preferences/${token}`);
    return { success: true };
  } catch (error) {
    console.error("[PREFERENCES] Error unsubscribing globally:", error);
    return { success: false, error: "Failed to unsubscribe" };
  }
}
