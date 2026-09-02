/**
 * Contact Topics Routes
 *
 * PUT /v1/contacts/:id/topics - Replace all topic subscriptions
 */

import {
  contact,
  contactTopic,
  db,
  eq,
  fetchTopicsForSubscription,
  resolveTopicSlugs,
  topic,
} from "@wraps/db";
import { sendTopicConfirmationEmail } from "@wraps/email";
import { and } from "drizzle-orm";
import { t } from "elysia";

import { log } from "../lib/logger";
import { createAuthenticatedRoutes, getAuth } from "../middleware/auth";
import {
  checkSegmentEntry,
  checkSegmentExit,
  emitTopicSubscribed,
  emitTopicUnsubscribed,
} from "../services/workflow-events";

// Common response schemas
const errorResponse = t.Object({
  error: t.String({ description: "Error message" }),
});

export const contactsTopicsRoutes = createAuthenticatedRoutes("/v1/contacts")
  // Replace all topic subscriptions
  .put(
    "/:id/topics",
    async (ctx) => {
      const { params, body } = ctx;
      const authContext = getAuth(ctx);

      // Check contact exists
      const [existing] = await db
        .select({ id: contact.id })
        .from(contact)
        .where(
          and(
            eq(contact.id, params.id),
            eq(contact.organizationId, authContext.organizationId)
          )
        )
        .limit(1);

      if (!existing) {
        ctx.set.status = 404;
        return { error: "Contact not found" };
      }

      // Resolve topic slugs to IDs if provided
      let topicIds = body.topicIds || [];
      if (body.topicSlugs && body.topicSlugs.length > 0) {
        const resolvedIds = await resolveTopicSlugs(
          body.topicSlugs,
          authContext.organizationId
        );
        topicIds = [...topicIds, ...resolvedIds];
      }
      // contact_topic is keyed by (contactId, topicId), and the narrowing below
      // is a filter rather than a set — so a topic named twice (repeated in
      // topicIds, or given once by id and once by slug) would reach the INSERT
      // as two identical rows and fail on the primary key. That matters more
      // here than anywhere else: this handler deletes every existing
      // subscription before inserting, so a failed insert left the contact
      // with none at all.
      topicIds = [...new Set(topicIds)];

      // Get existing subscriptions to preserve confirmation dates and for event emission
      const existingSubscriptions = await db
        .select({
          topicId: contactTopic.topicId,
          topicName: topic.name,
          status: contactTopic.status,
          confirmedAt: contactTopic.confirmedAt,
        })
        .from(contactTopic)
        .innerJoin(topic, eq(topic.id, contactTopic.topicId))
        .where(eq(contactTopic.contactId, params.id));

      const existingTopicIds = new Set(
        existingSubscriptions.map((s) => s.topicId)
      );
      const confirmedTopics = new Map(
        existingSubscriptions
          .filter((s) => s.confirmedAt !== null)
          .map((s) => [s.topicId, s.confirmedAt])
      );
      // Track actively subscribed topics for unsubscribe events
      const activelySubscribedTopics = existingSubscriptions.filter(
        (s) => s.status === "subscribed"
      );

      // Remove all existing subscriptions
      await db
        .delete(contactTopic)
        .where(eq(contactTopic.contactId, params.id));

      // Add new subscriptions with double opt-in check
      const pendingTopics: string[] = [];
      if (topicIds.length > 0) {
        // Get topic info to check for double opt-in (org-scoped helper)
        const topicInfos = await fetchTopicsForSubscription(
          topicIds,
          authContext.organizationId
        );

        const topicMap = new Map(topicInfos.map((t) => [t.id, t]));
        const ownedTopicIds = topicIds.filter((id) => topicMap.has(id));
        const now = new Date();

        // Get contact email for confirmation emails
        const [contactData] = await db
          .select({ email: contact.email })
          .from(contact)
          .where(eq(contact.id, params.id))
          .limit(1);

        await db.insert(contactTopic).values(
          ownedTopicIds.map((topicId) => {
            const topicInfo = topicMap.get(topicId)!;
            const requiresConfirmation = topicInfo.doubleOptIn;
            const previouslyConfirmed = confirmedTopics.has(topicId);

            // Skip confirmation if previously confirmed (re-subscription)
            const needsConfirmation =
              requiresConfirmation && !previouslyConfirmed;

            if (needsConfirmation) {
              pendingTopics.push(topicId);
            }

            return {
              contactId: params.id,
              topicId,
              status: needsConfirmation ? "pending" : "subscribed",
              subscribedAt: needsConfirmation ? null : now,
              confirmedAt: needsConfirmation
                ? null
                : previouslyConfirmed
                  ? confirmedTopics.get(topicId)
                  : now,
            };
          })
        );

        // Send confirmation emails for newly pending topics
        if (pendingTopics.length > 0 && contactData?.email) {
          await Promise.all(
            pendingTopics.map(async (topicId) => {
              const topicInfo = topicMap.get(topicId);
              if (topicInfo) {
                try {
                  await sendTopicConfirmationEmail({
                    contactId: params.id,
                    contactEmail: contactData.email!,
                    topicId,
                    topicName: topicInfo.name,
                    topicDescription: topicInfo.description,
                    organizationId: authContext.organizationId,
                  });
                } catch (err) {
                  log.error("Failed to send confirmation email", err, {
                    topicId,
                    organizationId: authContext.organizationId,
                  });
                }
              }
            })
          );
        }

        // Emit topic_subscribed events for newly subscribed topics (not pending, not previously subscribed)
        const newlySubscribedTopics = ownedTopicIds.filter(
          (tid) => !(pendingTopics.includes(tid) || existingTopicIds.has(tid))
        );

        await Promise.all(
          newlySubscribedTopics.map((topicId) => {
            const topicInfo = topicMap.get(topicId);
            return emitTopicSubscribed({
              contactId: params.id,
              organizationId: authContext.organizationId,
              topicId,
              topicName: topicInfo?.name,
            }).catch((err) => {
              log.error("Failed to emit topic_subscribed event", err, {
                organizationId: authContext.organizationId,
              });
            });
          })
        );
      }

      // Emit topic_unsubscribed events for removed topics (were actively subscribed, not in new list)
      const removedTopics = activelySubscribedTopics.filter(
        (t) => !topicIds.includes(t.topicId)
      );

      if (removedTopics.length > 0) {
        await Promise.all(
          removedTopics.map((t) =>
            emitTopicUnsubscribed({
              contactId: params.id,
              organizationId: authContext.organizationId,
              topicId: t.topicId,
              topicName: t.topicName,
            }).catch((err) => {
              log.error("Failed to emit topic_unsubscribed event", err, {
                organizationId: authContext.organizationId,
              });
            })
          )
        );
      }

      // Check segment triggers (topic changes may affect segment membership)
      await Promise.all([
        checkSegmentEntry({
          contactId: params.id,
          organizationId: authContext.organizationId,
        }).catch((err) => {
          log.error("Failed to check segment entry", err, {
            organizationId: authContext.organizationId,
          });
        }),
        checkSegmentExit({
          contactId: params.id,
          organizationId: authContext.organizationId,
        }).catch((err) => {
          log.error("Failed to check segment exit", err, {
            organizationId: authContext.organizationId,
          });
        }),
      ]);

      // Get updated topics to return
      const updatedTopics = await db
        .select({
          topicId: contactTopic.topicId,
          topicName: topic.name,
          status: contactTopic.status,
          subscribedAt: contactTopic.subscribedAt,
        })
        .from(contactTopic)
        .innerJoin(topic, eq(topic.id, contactTopic.topicId))
        .where(eq(contactTopic.contactId, params.id));

      return {
        topics: updatedTopics.map((t) => ({
          ...t,
          subscribedAt: t.subscribedAt?.toISOString() ?? null,
        })),
        pendingTopics: pendingTopics.length > 0 ? pendingTopics : undefined,
      };
    },
    {
      params: t.Object({
        id: t.String({ description: "Contact ID", maxLength: 36 }),
      }),
      body: t.Object({
        topicIds: t.Optional(
          t.Array(t.String({ maxLength: 36 }), {
            description: "Topic IDs to subscribe",
          })
        ),
        topicSlugs: t.Optional(
          t.Array(t.String({ maxLength: 100 }), {
            description: "Topic slugs to subscribe",
          })
        ),
      }),
      response: {
        200: t.Object({
          topics: t.Array(
            t.Object({
              topicId: t.String(),
              topicName: t.String(),
              status: t.String(),
              subscribedAt: t.Union([t.String(), t.Null()]),
            })
          ),
          pendingTopics: t.Optional(t.Array(t.String())),
        }),
        404: errorResponse,
      },
      detail: {
        tags: ["contacts"],
        summary: "Replace contact topics",
        description:
          "Replaces all topic subscriptions for a contact. Use PATCH to add topics without removing existing ones.",
      },
    }
  );
