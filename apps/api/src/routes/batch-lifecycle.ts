/**
 * Broadcast lifecycle routes (draft edit and duplicate).
 *
 * POST  /v1/batch/:id/duplicate - Copy a broadcast into a new draft
 * PATCH /v1/batch/:id           - Edit a DRAFT broadcast (non-drafts return 409)
 *
 * Cancel is NOT here: `DELETE /v1/batch/:id` in batch.ts already cancels.
 *
 * Lifted from `apps/web/src/actions/batch.ts` (`duplicateBatchSend`,
 * `updateDraftBatchSend`). The dashboard action is Next-only (headers,
 * revalidatePath); the DB work is the same `@wraps/db` helpers.
 */

import {
  duplicateBroadcast,
  fetchTopicsForSubscription,
  findAwsAccountForOrg,
  findBroadcast,
  findBroadcastStatus,
  findBroadcastWithMeta,
  findSegment,
  findTemplateForValidation,
  updateDraftBroadcast,
} from "@wraps/db";
import { t } from "elysia";
import { checkBroadcastEntitlements } from "../lib/plan-features";
import { requirePermission } from "../lib/require-permission";
import { createAuthenticatedRoutes, getAuth } from "../middleware/auth";
import { planGateMiddleware } from "../middleware/plan-gate";
import { rateLimitMiddleware } from "../middleware/rate-limit";
import { withBatchAudit } from "../services/batch-lifecycle";
import {
  editScheduledBroadcast,
  SCHEDULED_EDIT_DESCRIPTION,
  type ScheduledEditBody,
  scheduledEditResponseSchema,
} from "./batch";

const errorResponse = t.Object({ error: t.String() });

// Same tolerance and wording as batch.ts `resolveSchedule`: a past schedule is
// rejected rather than silently becoming an immediate send.
const SCHEDULE_PAST_TOLERANCE_MS = 60 * 1000;

const duplicateResponseSchema = t.Object({
  id: t.String({ description: "ID of the new draft" }),
  status: t.String({ description: "Status of the new draft (always draft)" }),
  name: t.Union([t.String(), t.Null()], {
    description: "Name of the new draft, with a ' (copy)' suffix",
  }),
});

const draftResponseSchema = t.Object({
  id: t.String(),
  status: t.String(),
  name: t.Union([t.String(), t.Null()]),
  channel: t.String(),
  subject: t.Union([t.String(), t.Null()]),
  audienceType: t.Union([t.String(), t.Null()]),
  topicId: t.Union([t.String(), t.Null()]),
  segmentId: t.Union([t.String(), t.Null()]),
  awsAccountId: t.Union([t.String(), t.Null()]),
  scheduledFor: t.Union([t.String(), t.Null()], {
    description: "ISO 8601 schedule for the draft, or null",
  }),
});

// Every field is optional. Nullable text fields accept `null` to clear them,
// which the dashboard action also does (`data.name ?? null`).
const patchDraftBodySchema = t.Object({
  channel: t.Optional(t.Union([t.Literal("email"), t.Literal("sms")])),
  name: t.Optional(t.Union([t.String({ maxLength: 255 }), t.Null()])),
  audienceType: t.Optional(
    t.Union([t.Literal("all"), t.Literal("topic"), t.Literal("segment")], {
      description:
        "Audience type. Setting it replaces topicId and segmentId with the values sent (or null).",
    })
  ),
  topicId: t.Optional(t.Union([t.String({ maxLength: 36 }), t.Null()])),
  segmentId: t.Optional(t.Union([t.String({ maxLength: 36 }), t.Null()])),
  subject: t.Optional(t.Union([t.String({ maxLength: 998 }), t.Null()])),
  previewText: t.Optional(t.Union([t.String({ maxLength: 500 }), t.Null()])),
  from: t.Optional(t.Union([t.String({ maxLength: 255 }), t.Null()])),
  fromName: t.Optional(t.Union([t.String({ maxLength: 100 }), t.Null()])),
  replyTo: t.Optional(t.Union([t.String({ maxLength: 255 }), t.Null()])),
  templateId: t.Optional(t.Union([t.String({ maxLength: 36 }), t.Null()])),
  htmlContent: t.Optional(t.Union([t.String(), t.Null()])),
  variableMappings: t.Optional(
    t.Union([
      t.Array(
        t.Object({
          variableName: t.String(),
          source: t.Union([
            t.Object({ type: t.Literal("static"), value: t.String() }),
            t.Object({ type: t.Literal("contact"), field: t.String() }),
          ]),
        })
      ),
      t.Null(),
    ])
  ),
  body: t.Optional(t.Union([t.String({ maxLength: 1600 }), t.Null()])),
  senderId: t.Optional(t.Union([t.String({ maxLength: 20 }), t.Null()])),
  scheduledFor: t.Optional(
    t.Union([t.String({ description: "ISO 8601 datetime" }), t.Null()], {
      description: "Schedule for the draft. null clears it.",
    })
  ),
  awsAccountId: t.Optional(t.Union([t.String({ maxLength: 36 }), t.Null()])),
  totalRecipients: t.Optional(
    t.Number({
      description: "Scheduled broadcasts only. Ignored for a draft.",
    })
  ),
});

type ScheduleResult =
  | { ok: true; scheduledFor: Date | null; isScheduled: boolean }
  | { ok: false; error: string };

/**
 * Parse a draft's schedule. `null` clears it. A time within the tolerance of
 * now is stored as no schedule, matching batch.ts.
 */
function resolveDraftSchedule(raw: string | null): ScheduleResult {
  if (raw === null) {
    return { ok: true, scheduledFor: null, isScheduled: false };
  }
  const scheduledFor = new Date(raw);
  if (Number.isNaN(scheduledFor.getTime())) {
    return { ok: false, error: "scheduledFor is not a valid date" };
  }
  const msFromNow = scheduledFor.getTime() - Date.now();
  if (msFromNow < -SCHEDULE_PAST_TOLERANCE_MS) {
    return {
      ok: false,
      error:
        "The scheduled time is in the past. Pick a future time, or send now — a past schedule will not be converted into an immediate send.",
    };
  }
  if (msFromNow <= 0) {
    return { ok: true, scheduledFor: null, isScheduled: false };
  }
  return { ok: true, scheduledFor, isScheduled: true };
}

/**
 * Same check as batch.ts `findUnresolvedReference`: a segment, topic or
 * template id stored on a draft must belong to the caller's org. Returns the
 * message for the first reference that does not resolve, or null.
 */
async function findUnresolvedReference(
  body: { segmentId?: string; topicId?: string; templateId?: string },
  organizationId: string
): Promise<string | null> {
  if (body.segmentId) {
    const row = await findSegment(body.segmentId, organizationId);
    if (!row) {
      return "Segment not found";
    }
  }
  if (body.topicId) {
    const [row] = await fetchTopicsForSubscription(
      [body.topicId],
      organizationId
    );
    if (!row) {
      return "Topic not found";
    }
  }
  if (body.templateId) {
    const row = await findTemplateForValidation(
      body.templateId,
      organizationId
    );
    if (!row) {
      return "Template not found";
    }
  }
  return null;
}

export const batchLifecycleRoutes = createAuthenticatedRoutes("/v1/batch")
  .use(rateLimitMiddleware)
  .use(planGateMiddleware("batch"))
  .post(
    "/:id/duplicate",
    async (ctx) => {
      const { params, set } = ctx;
      const authContext = getAuth(ctx);

      const gate = await requirePermission(ctx, "broadcasts", ["write"]);
      if (!gate.ok) {
        return gate.body;
      }

      const source = await findBroadcastWithMeta(
        params.id,
        authContext.organizationId
      );
      if (!source) {
        set.status = 404;
        return { error: "Broadcast not found" };
      }

      // The copy and its `broadcast.duplicated` audit row commit together; a
      // throw (no row inserted) rolls both back.
      let copy: Awaited<ReturnType<typeof duplicateBroadcast>>;
      try {
        copy = await withBatchAudit(
          authContext.organizationId,
          { userId: gate.userId, request: ctx.request },
          async (tx) => {
            const inserted = await duplicateBroadcast(
              source,
              authContext.organizationId,
              gate.userId,
              tx
            );
            if (!inserted) {
              throw new Error("Broadcast duplicate returned null");
            }
            return inserted;
          },
          (inserted) => ({
            action: "broadcast.duplicated",
            resourceId: inserted.id,
            metadata: { broadcastId: inserted.id, sourceId: params.id },
          })
        );
      } catch {
        set.status = 500;
        return { error: "Failed to duplicate broadcast" };
      }
      if (!copy) {
        set.status = 500;
        return { error: "Failed to duplicate broadcast" };
      }

      return { id: copy.id, status: copy.status, name: copy.name ?? null };
    },
    {
      params: t.Object({
        id: t.String({ description: "Broadcast ID to copy", maxLength: 36 }),
      }),
      response: {
        200: duplicateResponseSchema,
        403: errorResponse,
        404: errorResponse,
        500: errorResponse,
      },
      detail: {
        tags: ["batch"],
        summary: "Duplicate broadcast",
        description:
          "Creates a new draft copy of a broadcast (any status) with ' (copy)' appended to its name. The copy keeps the content, audience and sender, but not the schedule. Requires the broadcasts write permission. Returns the new draft's ID.",
      },
    }
  )
  .patch(
    "/:id",
    async (ctx) => {
      const { params, body, set } = ctx;
      const authContext = getAuth(ctx);

      const gate = await requirePermission(ctx, "broadcasts", ["write"]);
      if (!gate.ok) {
        return gate.body;
      }

      const orgId = authContext.organizationId;

      const existing = await findBroadcastStatus(params.id, orgId);
      if (!existing) {
        set.status = 404;
        return { error: "Broadcast not found" };
      }
      if (existing.status === "scheduled") {
        // A scheduled broadcast keeps a send time and an AWS account, so the
        // draft's "null clears it" does not apply to either.
        if (body.scheduledFor === null || body.awsAccountId === null) {
          set.status = 400;
          return {
            error:
              "A scheduled broadcast needs a send time and an AWS account. Cancel it to unschedule.",
          };
        }
        // Editing a scheduled broadcast changes what goes out and when, so it
        // also needs send, as the dashboard's updateScheduledBatchSend does.
        const sendGate = await requirePermission(ctx, "broadcasts", ["send"]);
        if (!sendGate.ok) {
          return sendGate.body;
        }
        return editScheduledBroadcast(ctx, body as ScheduledEditBody);
      }
      if (existing.status !== "draft") {
        set.status = 409;
        return {
          error: `Cannot edit: broadcast is already ${existing.status}`,
        };
      }

      let scheduled = { scheduledFor: null as Date | null, isScheduled: false };
      if (body.scheduledFor !== undefined) {
        const schedule = resolveDraftSchedule(body.scheduledFor);
        if (!schedule.ok) {
          set.status = 400;
          return { error: schedule.error };
        }
        scheduled = schedule;
      }

      // Audience or schedule is changing: apply the same entitlements as
      // create and promote, on the audience the draft will now target.
      if (body.audienceType !== undefined || body.scheduledFor !== undefined) {
        const current = await findBroadcast(params.id, orgId);
        const entitlement = checkBroadcastEntitlements(authContext.planId, {
          audienceType: (body.audienceType ?? current?.audienceType ?? "all") as
            | "all"
            | "topic"
            | "segment",
          scheduled: scheduled.isScheduled,
        });
        if (!entitlement.ok) {
          set.status = 403;
          return { error: entitlement.message };
        }
      }

      if (typeof body.awsAccountId === "string") {
        const account = await findAwsAccountForOrg(body.awsAccountId, orgId);
        if (!account) {
          set.status = 403;
          return { error: "AWS account does not belong to this organization" };
        }
      }

      const unresolved = await findUnresolvedReference(
        {
          segmentId: body.segmentId ?? undefined,
          topicId: body.topicId ?? undefined,
          templateId: body.templateId ?? undefined,
        },
        orgId
      );
      if (unresolved) {
        set.status = 404;
        return { error: unresolved };
      }

      const update: Parameters<typeof updateDraftBroadcast>[2] = {};
      if (body.channel !== undefined) {
        update.channel = body.channel;
      }
      if (body.name !== undefined) {
        update.name = body.name;
      }
      if (body.subject !== undefined) {
        update.subject = body.subject;
      }
      if (body.previewText !== undefined) {
        update.previewText = body.previewText;
      }
      if (body.from !== undefined) {
        update.from = body.from;
      }
      if (body.fromName !== undefined) {
        update.fromName = body.fromName;
      }
      if (body.replyTo !== undefined) {
        update.replyTo = body.replyTo;
      }
      if (body.templateId !== undefined) {
        update.emailTemplateId = body.templateId;
      }
      if (body.htmlContent !== undefined) {
        update.htmlContent = body.htmlContent;
      }
      if (body.variableMappings !== undefined) {
        update.variableMappings = body.variableMappings;
      }
      if (body.body !== undefined) {
        update.body = body.body;
      }
      if (body.senderId !== undefined) {
        update.senderId = body.senderId;
      }
      if (body.awsAccountId !== undefined) {
        update.awsAccountId = body.awsAccountId;
      }
      if (body.scheduledFor !== undefined) {
        update.scheduledFor = scheduled.scheduledFor;
      }
      if (body.audienceType !== undefined) {
        update.audienceType = body.audienceType;
        update.topicId = body.topicId ?? null;
        update.segmentId = body.segmentId ?? null;
      } else {
        if (body.topicId !== undefined) {
          update.topicId = body.topicId;
        }
        if (body.segmentId !== undefined) {
          update.segmentId = body.segmentId;
        }
      }

      // The update and its `broadcast.draft_updated` audit row commit together.
      await withBatchAudit(
        orgId,
        { userId: gate.userId, request: ctx.request },
        (tx) => updateDraftBroadcast(params.id, orgId, update, tx),
        () => ({
          action: "broadcast.draft_updated",
          resourceId: params.id,
          metadata: { broadcastId: params.id },
        })
      );

      const row = await findBroadcast(params.id, orgId);
      if (!row) {
        set.status = 404;
        return { error: "Draft not found" };
      }
      return {
        id: row.id,
        status: row.status,
        name: row.name ?? null,
        channel: row.channel,
        subject: row.subject ?? null,
        audienceType: row.audienceType ?? null,
        topicId: row.topicId ?? null,
        segmentId: row.segmentId ?? null,
        awsAccountId: row.awsAccountId ?? null,
        scheduledFor: row.scheduledFor ? row.scheduledFor.toISOString() : null,
      };
    },
    {
      params: t.Object({
        id: t.String({
          description: "Draft or scheduled broadcast ID",
          maxLength: 36,
        }),
      }),
      body: patchDraftBodySchema,
      response: {
        200: t.Union([draftResponseSchema, scheduledEditResponseSchema]),
        400: errorResponse,
        403: errorResponse,
        404: errorResponse,
        409: errorResponse,
      },
      detail: {
        tags: ["batch"],
        summary: "Update draft or scheduled broadcast",
        description: `Updates a draft or a scheduled broadcast. Requires the broadcasts write permission.

Draft: only fields present in the body change; send null to clear a nullable field. Setting audienceType or scheduledFor applies the same plan entitlements as creating a broadcast.

Scheduled: ${SCHEDULED_EDIT_DESCRIPTION} scheduledFor and awsAccountId cannot be null.

Any other status returns 409 with the current status (use the send/resume routes for live broadcasts).`,
      },
    }
  );
