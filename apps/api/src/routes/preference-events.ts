/**
 * Preference Events Routes
 *
 * Called by the public preference center (apps/web), authenticated only by
 * the unsubscribe JWT token.
 *
 * POST /v1/preference-events                 - Emit topic events after the
 *                                               web wrote topic changes
 * POST /v1/preference-events/unsubscribe-all - "Unsubscribe from all": the
 *                                               API does the write and emits
 */

import { Elysia, t } from "elysia";
import { log } from "../lib/logger";
import { verifyUnsubscribeToken } from "../lib/unsubscribe-token";
import { unsubscribeContactGlobally } from "../services/unsubscribe";
import {
  emitTopicSubscribed,
  emitTopicUnsubscribed,
} from "../services/workflow-events";

export const preferenceEventsRoutes = new Elysia({
  prefix: "/v1/preference-events",
})
  .post(
    "/",
    async ({ body, set }) => {
      const { token, contactId, organizationId, changes } = body;

      // Verify JWT token matches the claimed contact/org
      const payload = await verifyUnsubscribeToken(token);
      if (
        !payload ||
        payload.cid !== contactId ||
        payload.oid !== organizationId
      ) {
        set.status = 401;
        return { error: "Invalid or expired token" };
      }

      // Emit workflow events for each change
      let subscribed = 0;
      let unsubscribed = 0;

      for (const change of changes) {
        if (change.action === "subscribed") {
          await emitTopicSubscribed({
            contactId,
            organizationId,
            topicId: change.topicId,
            topicName: change.topicName,
          }).catch((err) => {
            log.error(
              "Failed to emit topic_subscribed from preference center",
              err,
              {
                contactId,
                topicId: change.topicId,
              }
            );
          });
          subscribed++;
        } else if (change.action === "unsubscribed") {
          await emitTopicUnsubscribed({
            contactId,
            organizationId,
            topicId: change.topicId,
            topicName: change.topicName,
          }).catch((err) => {
            log.error(
              "Failed to emit topic_unsubscribed from preference center",
              err,
              {
                contactId,
                topicId: change.topicId,
              }
            );
          });
          unsubscribed++;
        }
      }

      return { success: true, subscribed, unsubscribed };
    },
    {
      body: t.Object({
        token: t.String(),
        contactId: t.String(),
        organizationId: t.String(),
        changes: t.Array(
          t.Object({
            topicId: t.String(),
            topicName: t.Optional(t.String()),
            action: t.Union([
              t.Literal("subscribed"),
              t.Literal("unsubscribed"),
            ]),
          })
        ),
      }),
      response: {
        200: t.Object({
          success: t.Boolean(),
          subscribed: t.Number(),
          unsubscribed: t.Number(),
        }),
        401: t.Object({
          error: t.String(),
        }),
      },
      detail: {
        tags: ["unsubscribe"],
        summary: "Emit workflow events for preference center changes",
        description:
          "Called by the preference center after DB writes to emit topic_subscribed/topic_unsubscribed workflow events. Authenticated via unsubscribe JWT token.",
      },
    }
  )
  /**
   * POST /v1/preference-events/unsubscribe-all
   *
   * The preference center's "unsubscribe from all". The token is the only
   * credential; its `tid` is ignored, since the person chose "all". A contact
   * not in the token's org writes nothing and still answers 200, so only a
   * failure makes the web fall back to its own write. No rate limit: the
   * caller is the web server, whose outbound IPs every org shares (same as
   * /unsubscribe/:token).
   */
  .post(
    "/unsubscribe-all",
    async ({ body, set }) => {
      const payload = await verifyUnsubscribeToken(body.token);
      if (!payload) {
        set.status = 401;
        return { error: "Invalid or expired token" };
      }

      const result = await unsubscribeContactGlobally(payload.oid, payload.cid);
      if (!result.found) {
        log.info("Preference center unsubscribe-all: contact not in org", {
          contactId: payload.cid,
          organizationId: payload.oid,
        });
      }

      return { success: true };
    },
    {
      body: t.Object({
        token: t.String({ maxLength: 2000 }),
      }),
      response: {
        200: t.Object({
          success: t.Boolean(),
        }),
        401: t.Object({
          error: t.String(),
        }),
      },
      detail: {
        hide: true,
        tags: ["unsubscribe"],
        summary: "Unsubscribe from all emails from the preference center",
      },
    }
  );
