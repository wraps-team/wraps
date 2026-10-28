/**
 * Topics Routes
 *
 * CRUD for subscription topics, plus a paginated subscriber list per topic.
 * Pro+ feature: the whole group sits behind the topics plan gate.
 *
 * GET    /v1/topics                  - List topics with live audience counts
 * GET    /v1/topics/:id              - Get a single topic
 * POST   /v1/topics                  - Create a topic
 * PATCH  /v1/topics/:id              - Update a topic
 * DELETE /v1/topics/:id              - Delete a topic (requires confirm=true)
 * GET    /v1/topics/:id/subscribers  - List a topic's subscribers (paginated)
 *
 * Permissions mirror the dashboard actions: reads need `topics:read`, create
 * and update need `topics:write`, delete needs `topics:delete`.
 */

import { t } from "elysia";
import { requirePermission } from "../lib/require-permission";
import { createAuthenticatedRoutes, getAuth } from "../middleware/auth";
import { planGateMiddleware } from "../middleware/plan-gate";
import {
  createTopicForOrg,
  deleteTopicForOrg,
  getTopicForOrg,
  listTopicSubscribersForOrg,
  listTopicsForOrg,
  type TopicActor,
  type TopicSubscriberView,
  type TopicView,
  updateTopicForOrg,
} from "../services/topics";

const errorResponse = t.Object({ error: t.String() });

const creatorSchema = t.Union([
  t.Object({ id: t.String(), name: t.String(), email: t.String() }),
  t.Null(),
]);

const topicSchema = t.Object({
  id: t.String(),
  name: t.String(),
  slug: t.String(),
  description: t.Union([t.String(), t.Null()]),
  public: t.Boolean({
    description: "Visible on the preference center.",
  }),
  doubleOptIn: t.Boolean(),
  subscriberCount: t.Number({
    description:
      "Opted-in contacts, including ones a broadcast would not reach.",
  }),
  sendableCount: t.Number({
    description:
      "Subscribed contacts a broadcast to this topic would actually reach right now.",
  }),
  pendingCount: t.Number({
    description:
      "Waiting on a double opt-in confirmation. Broadcasts skip these.",
  }),
  createdAt: t.String(),
  updatedAt: t.String(),
  createdBy: creatorSchema,
});

const subscriberSchema = t.Object({
  contactId: t.String(),
  email: t.String(),
  status: t.String(),
  subscribedAt: t.Union([t.String(), t.Null()]),
  unsubscribedAt: t.Union([t.String(), t.Null()]),
});

function toTopicResponse(v: TopicView) {
  return {
    id: v.id,
    name: v.name,
    slug: v.slug,
    description: v.description,
    public: v.public,
    doubleOptIn: v.doubleOptIn,
    subscriberCount: v.subscriberCount,
    sendableCount: v.sendableCount,
    pendingCount: v.pendingCount,
    createdAt: v.createdAt.toISOString(),
    updatedAt: v.updatedAt.toISOString(),
    createdBy: v.createdBy,
  };
}

function toSubscriberResponse(s: TopicSubscriberView) {
  return {
    contactId: s.contactId,
    email: s.email,
    status: s.status,
    subscribedAt: s.subscribedAt?.toISOString() ?? null,
    unsubscribedAt: s.unsubscribedAt?.toISOString() ?? null,
  };
}

function actorFrom(ctx: { request: Request }, userId: string): TopicActor {
  const forwarded = ctx.request.headers.get("x-forwarded-for");
  return {
    userId,
    ipAddress: forwarded ? forwarded.split(",")[0].trim() : null,
    userAgent: ctx.request.headers.get("user-agent"),
  };
}

export const topicsRoutes = createAuthenticatedRoutes("/v1/topics")
  .use(planGateMiddleware("topics"))
  .get(
    "/",
    async (ctx) => {
      const gate = await requirePermission(ctx, "topics", ["read"]);
      if (!gate.ok) {
        return gate.body;
      }
      const authContext = getAuth(ctx);
      const topics = await listTopicsForOrg(authContext.organizationId);
      return { topics: topics.map(toTopicResponse) };
    },
    {
      response: {
        200: t.Object({ topics: t.Array(topicSchema) }),
        403: errorResponse,
      },
      detail: {
        tags: ["topics"],
        summary: "List topics",
        description:
          "Lists the organization's topics with subscriber, sendable and pending counts. Requires a Pro plan or higher.",
      },
    }
  )
  .get(
    "/:id",
    async (ctx) => {
      const { params, set } = ctx;
      const gate = await requirePermission(ctx, "topics", ["read"]);
      if (!gate.ok) {
        return gate.body;
      }
      const authContext = getAuth(ctx);

      const view = await getTopicForOrg(authContext.organizationId, params.id);
      if (!view) {
        set.status = 404;
        return { error: "Topic not found" };
      }
      return toTopicResponse(view);
    },
    {
      params: t.Object({ id: t.String({ maxLength: 36 }) }),
      response: {
        200: topicSchema,
        403: errorResponse,
        404: errorResponse,
      },
      detail: {
        tags: ["topics"],
        summary: "Get a topic",
        description: "Returns a single topic with its audience counts.",
      },
    }
  )
  .post(
    "/",
    async (ctx) => {
      const { body, set } = ctx;
      const gate = await requirePermission(ctx, "topics", ["write"]);
      if (!gate.ok) {
        return gate.body;
      }
      const authContext = getAuth(ctx);

      const result = await createTopicForOrg(
        authContext.organizationId,
        actorFrom(ctx, gate.userId),
        body
      );
      if (!result.ok) {
        set.status = result.status;
        return { error: result.error };
      }

      set.status = 201;
      return toTopicResponse(result.value);
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 200 }),
        slug: t.Optional(t.String({ minLength: 1, maxLength: 200 })),
        description: t.Optional(t.String()),
        public: t.Optional(t.Boolean()),
        doubleOptIn: t.Optional(t.Boolean()),
      }),
      response: {
        201: topicSchema,
        400: errorResponse,
        403: errorResponse,
        409: errorResponse,
      },
      detail: {
        tags: ["topics"],
        summary: "Create a topic",
        description:
          "Creates a topic. The slug is generated from the name unless one is passed; slugs are unique per organization.",
      },
    }
  )
  .patch(
    "/:id",
    async (ctx) => {
      const { params, body, set } = ctx;
      const gate = await requirePermission(ctx, "topics", ["write"]);
      if (!gate.ok) {
        return gate.body;
      }
      const authContext = getAuth(ctx);

      const result = await updateTopicForOrg(
        authContext.organizationId,
        actorFrom(ctx, gate.userId),
        params.id,
        body
      );
      if (!result.ok) {
        set.status = result.status;
        return { error: result.error };
      }
      return toTopicResponse(result.value);
    },
    {
      params: t.Object({ id: t.String({ maxLength: 36 }) }),
      body: t.Object({
        name: t.Optional(t.String({ minLength: 1, maxLength: 200 })),
        slug: t.Optional(t.String({ minLength: 1, maxLength: 200 })),
        description: t.Optional(t.Union([t.String(), t.Null()])),
        public: t.Optional(t.Boolean()),
        doubleOptIn: t.Optional(t.Boolean()),
      }),
      response: {
        200: topicSchema,
        400: errorResponse,
        403: errorResponse,
        404: errorResponse,
        409: errorResponse,
      },
      detail: {
        tags: ["topics"],
        summary: "Update a topic",
        description:
          "Partially updates a topic. Only the fields passed are changed.",
      },
    }
  )
  .delete(
    "/:id",
    async (ctx) => {
      const { params, query, set } = ctx;
      const gate = await requirePermission(ctx, "topics", ["delete"]);
      if (!gate.ok) {
        return gate.body;
      }

      if (query.confirm !== "true") {
        set.status = 400;
        return {
          error:
            "Confirmation required: pass confirm=true to delete this topic. Deleting a topic removes every subscription to it.",
        };
      }

      const authContext = getAuth(ctx);
      const result = await deleteTopicForOrg(
        authContext.organizationId,
        actorFrom(ctx, gate.userId),
        params.id
      );
      if (!result.ok) {
        set.status = result.status;
        return { error: result.error };
      }
      return { success: true };
    },
    {
      params: t.Object({ id: t.String({ maxLength: 36 }) }),
      query: t.Object({
        confirm: t.Optional(
          t.String({
            description: "Must be the string `true` to delete. Required.",
          })
        ),
      }),
      response: {
        200: t.Object({ success: t.Boolean() }),
        400: errorResponse,
        403: errorResponse,
        404: errorResponse,
      },
      detail: {
        tags: ["topics"],
        summary: "Delete a topic",
        description:
          "Deletes a topic and every subscription to it. Destructive: requires `confirm=true` in the query string or the request is refused with 400.",
      },
    }
  )
  .get(
    "/:id/subscribers",
    async (ctx) => {
      const { params, query, set } = ctx;
      const gate = await requirePermission(ctx, "topics", ["read"]);
      if (!gate.ok) {
        return gate.body;
      }
      const authContext = getAuth(ctx);

      const result = await listTopicSubscribersForOrg(
        authContext.organizationId,
        params.id,
        {
          page: query.page ?? 1,
          pageSize: query.pageSize ?? 50,
          status: query.status,
        }
      );
      if (!result.ok) {
        set.status = result.status;
        return { error: result.error };
      }
      return {
        subscribers: result.value.subscribers.map(toSubscriberResponse),
        total: result.value.total,
        page: result.value.page,
        pageSize: result.value.pageSize,
      };
    },
    {
      params: t.Object({ id: t.String({ maxLength: 36 }) }),
      query: t.Object({
        page: t.Optional(t.Number({ default: 1, minimum: 1 })),
        pageSize: t.Optional(
          t.Number({ default: 50, minimum: 1, maximum: 100 })
        ),
        status: t.Optional(
          t.Union([
            t.Literal("subscribed"),
            t.Literal("pending"),
            t.Literal("unsubscribed"),
          ])
        ),
      }),
      response: {
        200: t.Object({
          subscribers: t.Array(subscriberSchema),
          total: t.Number(),
          page: t.Number(),
          pageSize: t.Number(),
        }),
        400: errorResponse,
        403: errorResponse,
        404: errorResponse,
      },
      detail: {
        tags: ["topics"],
        summary: "List topic subscribers",
        description:
          "Paginated subscribers of a topic, filterable by status. `pending` covers double opt-in contacts who have not confirmed yet.",
      },
    }
  );
