"use server";

import { contactTopic, db, fetchTopicsForSubscription } from "@wraps/db";
import { and, eq, inArray, or } from "drizzle-orm";
import { revalidateContacts } from "./contacts";
import { orgAction } from "./shared/org-action";

/**
 * Subscribe a contact to topics
 */
export const subscribeContactToTopics = orgAction(
  {
    name: "subscribeContactToTopics",
    resource: "contacts",
    permission: ["write"],
    orgId: (_contactId: string, organizationId: string, _topicIds: string[]) =>
      organizationId,
    onError: "Failed to subscribe to topics",
  },
  async (
    ctx,
    contactId: string,
    organizationId: string,
    topicIds: string[]
  ): Promise<{ success: boolean; error?: string }> => {
    // Filter topicIds to only those owned by this org (silently drop foreign topics)
    const ownedTopics = await fetchTopicsForSubscription(
      topicIds,
      organizationId
    );
    const ownedTopicIds = ownedTopics.map((t) => t.id);

    // Verify contact exists
    const existing = await db.query.contact.findFirst({
      where: (c, { and, eq }) =>
        and(eq(c.id, contactId), eq(c.organizationId, organizationId)),
      with: {
        topics: true,
      },
    });

    if (!existing) {
      return { success: false, error: "Contact not found" };
    }

    // Get current subscriptions
    const currentTopicIds = new Set(
      existing.topics
        .filter((t) => t.status === "subscribed")
        .map((t) => t.topicId)
    );

    // Filter to only new subscriptions (from the org-owned list)
    const newTopicIds = ownedTopicIds.filter((id) => !currentTopicIds.has(id));

    if (newTopicIds.length === 0) {
      return { success: true };
    }

    // Check if any are resubscriptions (previously unsubscribed)
    const previousSubscriptions = existing.topics
      .filter(
        (t) => t.status === "unsubscribed" && newTopicIds.includes(t.topicId)
      )
      .map((t) => t.topicId);

    await ctx.audited(
      async (tx) => {
        if (previousSubscriptions.length > 0) {
          await tx
            .update(contactTopic)
            .set({
              status: "subscribed",
              subscribedAt: new Date(),
              unsubscribedAt: null,
            })
            .where(
              and(
                eq(contactTopic.contactId, contactId),
                or(
                  ...previousSubscriptions.map((id) =>
                    eq(contactTopic.topicId, id)
                  )
                )
              )
            );
        }

        const trulyNewTopicIds = newTopicIds.filter(
          (id) => !previousSubscriptions.includes(id)
        );
        if (trulyNewTopicIds.length > 0) {
          await tx.insert(contactTopic).values(
            trulyNewTopicIds.map((topicId) => ({
              contactId,
              topicId,
              status: "subscribed",
            }))
          );
        }

        return { contactId, ownedTopicIds };
      },
      (r) => ({
        action: "contact.topic_subscribed" as const,
        resource: "contact",
        resourceId: r.contactId,
        metadata: { contactId: r.contactId, topicIds: r.ownedTopicIds },
      })
    );

    revalidateContacts(ctx.access.orgSlug);

    return { success: true };
  }
);

// Discriminated, so `count` is guaranteed present on success rather than
// optional on both branches. The loose shape forced callers to write
// `result.count ?? 0`, which reports "we didn't compute it" as a confident
// zero — the defect the 2026-08-19 audience audit exists to remove — while the
// adjacent toast interpolated the same value unguarded.
type BulkTopicResult =
  | { success: true; count: number; error?: never }
  | { success: false; error: string; count?: never };

/**
 * Bulk subscribe multiple contacts to topics
 */
export const bulkSubscribeContactsToTopics: (
  organizationId: string,
  contactIds: string[],
  topicIds: string[]
) => Promise<BulkTopicResult> = orgAction(
  {
    name: "bulkSubscribeContactsToTopics",
    resource: "contacts",
    permission: ["write"],
    orgId: (
      organizationId: string,
      _contactIds: string[],
      _topicIds: string[]
    ) => organizationId,
    onError: "Failed to subscribe contacts",
  },
  async (
    ctx,
    organizationId: string,
    contactIds: string[],
    topicIds: string[]
  ): Promise<BulkTopicResult> => {
    // Filter topicIds to only those owned by this org (silently drop foreign topics)
    const ownedTopics = await fetchTopicsForSubscription(
      topicIds,
      organizationId
    );
    const ownedTopicIds = ownedTopics.map((t) => t.id);

    // Batch-fetch all contacts + their topic subscriptions in one query
    const existingContacts = await db.query.contact.findMany({
      where: (c, { and, eq }) =>
        and(inArray(c.id, contactIds), eq(c.organizationId, organizationId)),
      with: { topics: true },
    });

    const contactMap = new Map(existingContacts.map((c) => [c.id, c]));

    let subscribed = 0;

    await ctx.audited(
      async (tx) => {
        for (const contactId of contactIds) {
          const existing = contactMap.get(contactId);
          if (!existing) continue;

          const currentTopicIds = new Set(
            existing.topics
              .filter((t) => t.status === "subscribed")
              .map((t) => t.topicId)
          );

          const newTopicIds = ownedTopicIds.filter(
            (id) => !currentTopicIds.has(id)
          );
          if (newTopicIds.length === 0) continue;

          const previousSubs = existing.topics
            .filter(
              (t) =>
                t.status === "unsubscribed" && newTopicIds.includes(t.topicId)
            )
            .map((t) => t.topicId);

          if (previousSubs.length > 0) {
            await tx
              .update(contactTopic)
              .set({
                status: "subscribed",
                subscribedAt: new Date(),
                unsubscribedAt: null,
              })
              .where(
                and(
                  eq(contactTopic.contactId, contactId),
                  or(...previousSubs.map((id) => eq(contactTopic.topicId, id)))
                )
              );
          }

          const trulyNew = newTopicIds.filter(
            (id) => !previousSubs.includes(id)
          );
          if (trulyNew.length > 0) {
            await tx.insert(contactTopic).values(
              trulyNew.map((topicId) => ({
                contactId,
                topicId,
                status: "subscribed",
              }))
            );
          }

          subscribed++;
        }

        return { subscribed, ownedTopicIds };
      },
      (r) => ({
        action: "contact.topics_bulk_subscribed" as const,
        resource: "contact",
        metadata: { contactCount: r.subscribed, topicIds: r.ownedTopicIds },
      })
    );

    revalidateContacts(ctx.access.orgSlug);

    return { success: true, count: subscribed };
  }
);

/**
 * Bulk unsubscribe multiple contacts from topics
 */
export const bulkUnsubscribeContactsFromTopics: (
  organizationId: string,
  contactIds: string[],
  topicIds: string[]
) => Promise<BulkTopicResult> = orgAction(
  {
    name: "bulkUnsubscribeContactsFromTopics",
    resource: "contacts",
    permission: ["write"],
    orgId: (
      organizationId: string,
      _contactIds: string[],
      _topicIds: string[]
    ) => organizationId,
    onError: "Failed to unsubscribe contacts",
  },
  async (
    ctx,
    organizationId: string,
    contactIds: string[],
    topicIds: string[]
  ): Promise<BulkTopicResult> => {
    const existingSubscriptions = await db
      .selectDistinct({ contactId: contactTopic.contactId })
      .from(contactTopic)
      .where(
        and(
          eq(contactTopic.status, "subscribed"),
          or(...contactIds.map((id) => eq(contactTopic.contactId, id))),
          or(...topicIds.map((id) => eq(contactTopic.topicId, id)))
        )
      );

    const unsubscribedCount = existingSubscriptions.length;

    if (unsubscribedCount > 0) {
      await ctx.audited(
        async (tx) => {
          await tx
            .update(contactTopic)
            .set({
              status: "unsubscribed",
              unsubscribedAt: new Date(),
            })
            .where(
              and(
                eq(contactTopic.status, "subscribed"),
                or(...contactIds.map((id) => eq(contactTopic.contactId, id))),
                or(...topicIds.map((id) => eq(contactTopic.topicId, id)))
              )
            );

          return { unsubscribedCount, topicIds };
        },
        (r) => ({
          action: "contact.topics_bulk_unsubscribed" as const,
          resource: "contact",
          metadata: { contactCount: r.unsubscribedCount, topicIds: r.topicIds },
        })
      );
    }

    revalidateContacts(ctx.access.orgSlug);

    return { success: true, count: unsubscribedCount };
  }
);

/**
 * Unsubscribe a contact from topics
 */
export const unsubscribeContactFromTopics = orgAction(
  {
    name: "unsubscribeContactFromTopics",
    resource: "contacts",
    permission: ["write"],
    orgId: (_contactId: string, organizationId: string, _topicIds: string[]) =>
      organizationId,
    onError: "Failed to unsubscribe from topics",
  },
  async (
    ctx,
    contactId: string,
    organizationId: string,
    topicIds: string[]
  ): Promise<{ success: boolean; error?: string }> => {
    // Verify contact exists
    const existing = await db.query.contact.findFirst({
      where: (c, { and, eq }) =>
        and(eq(c.id, contactId), eq(c.organizationId, organizationId)),
    });

    if (!existing) {
      return { success: false, error: "Contact not found" };
    }

    await ctx.audited(
      async (tx) => {
        await tx
          .update(contactTopic)
          .set({
            status: "unsubscribed",
            unsubscribedAt: new Date(),
          })
          .where(
            and(
              eq(contactTopic.contactId, contactId),
              eq(contactTopic.status, "subscribed"),
              or(...topicIds.map((id) => eq(contactTopic.topicId, id)))
            )
          );
        return { contactId, topicIds };
      },
      (r) => ({
        action: "contact.topic_unsubscribed" as const,
        resource: "contact",
        resourceId: r.contactId,
        metadata: { contactId: r.contactId, topicIds: r.topicIds },
      })
    );

    revalidateContacts(ctx.access.orgSlug);

    return { success: true };
  }
);
