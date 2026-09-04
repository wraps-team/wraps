/**
 * Segments Routes
 *
 * CRUD for audience segments, plus a preview endpoint that answers "who would
 * this send to" without saving anything. Pro+ feature — the whole route group
 * sits behind the segments plan gate, stricter than the dashboard (which only
 * gates create/split): a Free org gets 403 on every verb here, including
 * reads, so a downgraded org's only path to its own segments is the
 * dashboard.
 *
 * GET    /v1/segments       - List segments (paginated)
 * GET    /v1/segments/:id   - Get a single segment
 * POST   /v1/segments       - Create a segment
 * PATCH  /v1/segments/:id   - Update a segment
 * DELETE /v1/segments/:id   - Delete a segment (409 if a live send targets it)
 * POST   /v1/segments/preview - Count + sample an unsaved condition
 */

import {
  and,
  batchSend,
  countRecipientsBySegment,
  db,
  deleteSegmentRow,
  eq,
  findSegment,
  insertSegment,
  listSegmentsForOrg,
  previewConditionAudience,
  updateSegmentFields,
  validateCondition,
} from "@wraps/db";
import { inArray } from "drizzle-orm";
import { t } from "elysia";
import { createAuthenticatedRoutes, getAuth } from "../middleware/auth";
import { planGateMiddleware } from "../middleware/plan-gate";
import { rateLimitMiddleware } from "../middleware/rate-limit";

const CHANNEL = "email" as const;

const UNEVALUABLE_CONDITION =
  "These filters can't be evaluated. Check that every filter has a value its operator accepts.";

// A send that is committed or already running. `draft`, `completed`,
// `failed`, and `cancelled` do not block — see the plan 215 note on why a
// `draft` blocker is a product call, not an implementation detail.
const BLOCKING_BATCH_STATUSES = ["scheduled", "queued", "processing"] as const;

const errorResponse = t.Object({ error: t.String() });

const conditionSchema = t.Any({
  description:
    "Filter condition tree — see https://wraps.dev/docs/reference/segments for the shape.",
});

const segmentListItemSchema = t.Object({
  id: t.String(),
  name: t.String(),
  description: t.Union([t.String(), t.Null()]),
  memberCount: t.Number({
    description:
      "Live count of contacts a broadcast to this segment would reach right now — never the cached column.",
  }),
  trackMembership: t.Boolean(),
  lastComputedAt: t.Union([t.String(), t.Null()]),
  createdAt: t.String(),
  updatedAt: t.String(),
});

const segmentDetailSchema = t.Object({
  id: t.String(),
  name: t.String(),
  description: t.Union([t.String(), t.Null()]),
  condition: conditionSchema,
  memberCount: t.Number(),
  trackMembership: t.Boolean(),
  lastComputedAt: t.Union([t.String(), t.Null()]),
  createdAt: t.String(),
  updatedAt: t.String(),
});

async function liveMemberCounts(
  organizationId: string,
  segmentIds: string[]
): Promise<Map<string, number>> {
  return countRecipientsBySegment(organizationId, CHANNEL, segmentIds);
}

function toDetailResponse(
  row: NonNullable<Awaited<ReturnType<typeof findSegment>>>,
  memberCount: number
) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    condition: row.condition,
    memberCount,
    trackMembership: row.trackMembership,
    lastComputedAt: row.lastComputedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const segmentsRoutes = createAuthenticatedRoutes("/v1/segments")
  .use(rateLimitMiddleware)
  .use(planGateMiddleware("segments"))
  .get(
    "/",
    async (ctx) => {
      const authContext = getAuth(ctx);
      const { limit, offset, search } = ctx.query;

      const { segments, total } = await listSegmentsForOrg(
        authContext.organizationId,
        { limit, offset, search }
      );

      const counts = await liveMemberCounts(
        authContext.organizationId,
        segments.map((s) => s.id)
      );

      return {
        segments: segments.map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          memberCount: counts.get(s.id) ?? 0,
          trackMembership: s.trackMembership,
          lastComputedAt: s.lastComputedAt?.toISOString() ?? null,
          createdAt: s.createdAt.toISOString(),
          updatedAt: s.updatedAt.toISOString(),
        })),
        total,
        limit: limit ?? 20,
        offset: offset ?? 0,
      };
    },
    {
      query: t.Object({
        limit: t.Optional(t.Number({ default: 20, minimum: 1, maximum: 100 })),
        offset: t.Optional(t.Number({ default: 0, minimum: 0 })),
        search: t.Optional(t.String()),
      }),
      response: {
        200: t.Object({
          segments: t.Array(segmentListItemSchema),
          total: t.Number(),
          limit: t.Number(),
          offset: t.Number(),
        }),
      },
      detail: {
        tags: ["segments"],
        summary: "List segments",
        description:
          "Lists the organization's segments with live sendable-recipient counts. Requires a Pro plan or higher.",
      },
    }
  )
  .get(
    "/:id",
    async (ctx) => {
      const { params, set } = ctx;
      const authContext = getAuth(ctx);

      const row = await findSegment(params.id, authContext.organizationId);
      if (!row) {
        set.status = 404;
        return { error: "Segment not found" };
      }

      const counts = await liveMemberCounts(authContext.organizationId, [
        row.id,
      ]);

      return toDetailResponse(row, counts.get(row.id) ?? 0);
    },
    {
      params: t.Object({ id: t.String({ maxLength: 36 }) }),
      response: { 200: segmentDetailSchema, 404: errorResponse },
      detail: {
        tags: ["segments"],
        summary: "Get a segment",
        description:
          "Returns a single segment, including its filter condition and live member count.",
      },
    }
  )
  .post(
    "/",
    async (ctx) => {
      const { body, set } = ctx;
      const authContext = getAuth(ctx);

      const name = body.name.trim();
      if (!name) {
        set.status = 400;
        return { error: "Segment name is required" };
      }

      const conditionError = validateCondition(body.condition);
      if (conditionError) {
        set.status = 400;
        return { error: conditionError };
      }

      const audience = await previewConditionAudience(
        authContext.organizationId,
        CHANNEL,
        body.condition
      );
      if (!audience) {
        set.status = 400;
        return { error: UNEVALUABLE_CONDITION };
      }

      const row = await insertSegment({
        organizationId: authContext.organizationId,
        name,
        description: body.description?.trim() || null,
        condition: body.condition,
        trackMembership: body.trackMembership ?? false,
        memberCount: audience.sendable,
        lastComputedAt: new Date(),
        // There is no user id on an API-key request, so the audit-owner
        // column is left unset here — every response from this surface
        // omits that field entirely regardless.
      });

      set.status = 201;
      return toDetailResponse(row, audience.sendable);
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 200 }),
        description: t.Optional(t.String()),
        condition: conditionSchema,
        trackMembership: t.Optional(t.Boolean()),
      }),
      response: { 201: segmentDetailSchema, 400: errorResponse },
      detail: {
        tags: ["segments"],
        summary: "Create a segment",
        description:
          "Creates a segment. The condition is validated and snapshotted immediately — memberCount reflects live sendable recipients at creation time.",
      },
    }
  )
  .patch(
    "/:id",
    async (ctx) => {
      const { params, body, set } = ctx;
      const authContext = getAuth(ctx);

      const existing = await findSegment(params.id, authContext.organizationId);
      if (!existing) {
        set.status = 404;
        return { error: "Segment not found" };
      }

      const updateData: Parameters<typeof updateSegmentFields>[2] = {
        updatedAt: new Date(),
      };

      if (body.name !== undefined) {
        const name = body.name.trim();
        if (!name) {
          set.status = 400;
          return { error: "Segment name is required" };
        }
        updateData.name = name;
      }

      if (body.description !== undefined) {
        updateData.description = body.description?.trim() || null;
      }

      if (body.condition !== undefined) {
        const conditionError = validateCondition(body.condition);
        if (conditionError) {
          set.status = 400;
          return { error: conditionError };
        }

        const audience = await previewConditionAudience(
          authContext.organizationId,
          CHANNEL,
          body.condition
        );
        if (!audience) {
          set.status = 400;
          return { error: UNEVALUABLE_CONDITION };
        }

        updateData.condition = body.condition;
        updateData.memberCount = audience.sendable;
        updateData.lastComputedAt = new Date();
      }

      if (body.trackMembership !== undefined) {
        updateData.trackMembership = body.trackMembership;
      }

      const updated = await updateSegmentFields(
        params.id,
        authContext.organizationId,
        updateData
      );
      if (!updated) {
        set.status = 404;
        return { error: "Segment not found" };
      }

      const counts = await liveMemberCounts(authContext.organizationId, [
        updated.id,
      ]);

      return toDetailResponse(updated, counts.get(updated.id) ?? 0);
    },
    {
      params: t.Object({ id: t.String({ maxLength: 36 }) }),
      body: t.Object({
        name: t.Optional(t.String({ minLength: 1, maxLength: 200 })),
        description: t.Optional(t.String()),
        condition: t.Optional(conditionSchema),
        trackMembership: t.Optional(t.Boolean()),
      }),
      response: {
        200: segmentDetailSchema,
        400: errorResponse,
        404: errorResponse,
      },
      detail: {
        tags: ["segments"],
        summary: "Update a segment",
        description:
          "Partially updates a segment. Passing `condition` re-validates it and re-snapshots memberCount.",
      },
    }
  )
  .delete(
    "/:id",
    async (ctx) => {
      const { params, set } = ctx;
      const authContext = getAuth(ctx);

      const existing = await findSegment(params.id, authContext.organizationId);
      if (!existing) {
        set.status = 404;
        return { error: "Segment not found" };
      }

      const blocking = await db
        .select({ id: batchSend.id })
        .from(batchSend)
        .where(
          and(
            eq(batchSend.organizationId, authContext.organizationId),
            eq(batchSend.segmentId, params.id),
            inArray(batchSend.status, [...BLOCKING_BATCH_STATUSES])
          )
        )
        .limit(1);

      if (blocking.length > 0) {
        set.status = 409;
        return {
          error:
            "This segment is targeted by a scheduled, queued, or in-progress broadcast. Cancel or wait for it to finish before deleting the segment.",
        };
      }

      await deleteSegmentRow(params.id, authContext.organizationId);

      return { success: true };
    },
    {
      params: t.Object({ id: t.String({ maxLength: 36 }) }),
      response: {
        200: t.Object({ success: t.Boolean() }),
        404: errorResponse,
        409: errorResponse,
      },
      detail: {
        tags: ["segments"],
        summary: "Delete a segment",
        description:
          "Deletes a segment. Refuses with 409 while a scheduled, queued, or processing broadcast still targets it.",
      },
    }
  )
  .post(
    "/preview",
    async (ctx) => {
      const { body, set } = ctx;
      const authContext = getAuth(ctx);

      const conditionError = validateCondition(body.condition);
      if (conditionError) {
        set.status = 400;
        return { error: conditionError };
      }

      const limit = Math.min(body.limit ?? 5, 100);

      const audience = await previewConditionAudience(
        authContext.organizationId,
        CHANNEL,
        body.condition,
        limit
      );
      if (!audience) {
        set.status = 400;
        return { error: UNEVALUABLE_CONDITION };
      }

      return { count: audience.sendable, sample: audience.sampleEmails };
    },
    {
      body: t.Object({
        condition: conditionSchema,
        limit: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
      }),
      response: {
        200: t.Object({
          count: t.Number(),
          sample: t.Array(t.String()),
        }),
        400: errorResponse,
      },
      detail: {
        tags: ["segments"],
        summary: "Preview a condition",
        description:
          "Counts and samples the audience an unsaved condition would reach, without creating a segment.",
      },
    }
  );
