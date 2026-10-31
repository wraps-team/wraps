/**
 * Broadcast draft create.
 *
 * POST /v1/batch/drafts - Save a new broadcast as a draft. Nothing is sent or
 * enqueued. Send it later with POST /v1/batch/{id}/send.
 *
 * Lifted from `saveDraftBatchSend` in `apps/web/src/actions/batch.ts` (the
 * dashboard action, Next-only because of `revalidatePath` and `orgAction`).
 * The insert is `insertDraftBroadcast` from `@wraps/db`, the same repository
 * helper the action calls, and the audit row is `broadcast.draft_saved`, as in
 * the action's `ctx.audited`.
 *
 * Route order matters: this file is mounted before `batchRoutes` in index.ts.
 * It has no `/:id` sibling for POST, so the static path cannot be captured
 * today, but it is mounted first to keep it that way.
 */

import {
  auditLog,
  db,
  eq,
  fetchTopicsForSubscription,
  findAwsAccountForOrg,
  findSegment,
  findTemplateForValidation,
  insertDraftBroadcast,
  user,
} from "@wraps/db";
import { t } from "elysia";
import { checkBroadcastEntitlements } from "../lib/plan-features";
import { requirePermission } from "../lib/require-permission";
import { createAuthenticatedRoutes, getAuth } from "../middleware/auth";
import { planGateMiddleware } from "../middleware/plan-gate";
import { rateLimitMiddleware } from "../middleware/rate-limit";

const errorResponse = t.Object({ error: t.String() });

// Same tolerance and wording as batch.ts `resolveSchedule` and the draft PATCH
// in batch-lifecycle.ts: a past schedule is rejected, not turned into a send.
const SCHEDULE_PAST_TOLERANCE_MS = 60 * 1000;

const createDraftBodySchema = t.Object({
  channel: t.Optional(
    t.Union([t.Literal("email"), t.Literal("sms")], {
      description: "Channel the draft will send through",
    })
  ),
  name: t.Optional(t.String({ maxLength: 255 })),
  subject: t.Optional(t.String({ maxLength: 998 })),
  previewText: t.Optional(t.String({ maxLength: 500 })),
  from: t.Optional(t.String({ maxLength: 255 })),
  fromName: t.Optional(t.String({ maxLength: 100 })),
  replyTo: t.Optional(t.String({ maxLength: 255 })),
  templateId: t.Optional(
    t.String({ description: "Email template ID", maxLength: 36 })
  ),
  htmlContent: t.Optional(t.String()),
  variableMappings: t.Optional(
    t.Array(
      t.Object({
        variableName: t.String(),
        source: t.Union([
          t.Object({ type: t.Literal("static"), value: t.String() }),
          t.Object({ type: t.Literal("contact"), field: t.String() }),
        ]),
      })
    )
  ),
  body: t.Optional(t.String({ description: "SMS body", maxLength: 1600 })),
  senderId: t.Optional(
    t.String({
      description: "SMS origination identity (phone number or alphanumeric ID)",
      maxLength: 20,
    })
  ),
  recipientFilter: t.Optional(
    t.Object({
      audienceType: t.Optional(
        t.Union([t.Literal("all"), t.Literal("topic"), t.Literal("segment")])
      ),
      topicId: t.Optional(t.String({ maxLength: 36 })),
      segmentId: t.Optional(t.String({ maxLength: 36 })),
    })
  ),
  awsAccountId: t.Optional(
    t.String({
      description: "AWS account ID to send from. Optional on drafts.",
      maxLength: 36,
    })
  ),
  scheduledFor: t.Optional(
    t.String({
      description:
        "ISO 8601 schedule stored on the draft. Not sent until the draft is sent.",
    })
  ),
});

const draftResponseSchema = t.Object({
  id: t.String({ description: "Batch ID" }),
  status: t.String({ description: "Always draft" }),
  name: t.Union([t.String(), t.Null()]),
  channel: t.String(),
  totalRecipients: t.Number(),
  processedRecipients: t.Number(),
  sent: t.Number(),
  delivered: t.Number(),
  failed: t.Number(),
  opened: t.Number(),
  clicked: t.Number(),
  bounced: t.Number(),
  complained: t.Number(),
  suppressed: t.Number(),
  startedAt: t.Union([t.String(), t.Null()]),
  completedAt: t.Union([t.String(), t.Null()]),
  createdAt: t.String(),
});

type ScheduleResult =
  | { ok: true; scheduledFor: Date | null; isScheduled: boolean }
  | { ok: false; error: string };

/**
 * Parses the draft's schedule. Omitted means no schedule. A time inside the
 * tolerance counts as now and is stored as no schedule, as batch.ts does.
 */
function resolveDraftSchedule(raw: string | undefined): ScheduleResult {
  if (raw === undefined) {
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
        "The scheduled time is in the past. Pick a future time, or leave scheduledFor out and send the draft now.",
    };
  }
  if (msFromNow <= 0) {
    return { ok: true, scheduledFor: null, isScheduled: false };
  }
  return { ok: true, scheduledFor, isScheduled: true };
}

/**
 * A segment, topic or template id stored on the draft must belong to the
 * caller's org. Every lookup is org-scoped, so a foreign id comes back empty
 * and is reported as not found. Returns the message for the first reference
 * that does not resolve, or null. Same checks as `findUnresolvedReference` in
 * batch.ts and batch-lifecycle.ts (not exported from either).
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

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Runs `fn` and the audit-log insert in one transaction, so a failed insert
 * leaves no audit row. Same derivation as `withBatchAudit` in
 * services/batch-lifecycle.ts, which types its action as a closed union that
 * does not include `broadcast.draft_saved`; copied here rather than edited.
 */
async function withDraftSavedAudit<T>(
  organizationId: string,
  actor: { userId: string | null; request: Request },
  fn: (tx: DbTransaction) => Promise<T>,
  entry: (result: T) => {
    resourceId: string;
    metadata: Record<string, unknown>;
  }
): Promise<T> {
  const [actorRow] = actor.userId
    ? await db
        .select({ email: user.email })
        .from(user)
        .where(eq(user.id, actor.userId))
        .limit(1)
    : [];
  const forwarded = actor.request.headers.get("x-forwarded-for");
  const ipAddress = forwarded ? forwarded.split(",")[0].trim() : null;
  const userAgent = actor.request.headers.get("user-agent");

  return db.transaction(async (tx) => {
    const result = await fn(tx);
    const row = entry(result);
    await tx.insert(auditLog).values({
      organizationId,
      userId: actor.userId,
      actorEmail: actorRow?.email ?? null,
      action: "broadcast.draft_saved",
      resource: "broadcast",
      resourceId: row.resourceId,
      metadata: row.metadata,
      ipAddress,
      userAgent,
    });
    return result;
  });
}

/** Same fields, same names, as the GET /v1/batch/:id response. */
function toDraftResponse(row: {
  id: string;
  status: string;
  channel: string;
  name: string | null;
  totalRecipients: number;
  processedRecipients: number;
  sent: number;
  delivered: number;
  failed: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
  suppressed: number;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: row.id,
    status: row.status,
    channel: row.channel,
    name: row.name,
    totalRecipients: row.totalRecipients,
    processedRecipients: row.processedRecipients,
    sent: row.sent,
    delivered: row.delivered,
    failed: row.failed,
    opened: row.opened,
    clicked: row.clicked,
    bounced: row.bounced,
    complained: row.complained,
    suppressed: row.suppressed,
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export const batchDraftRoutes = createAuthenticatedRoutes("/v1/batch")
  .use(rateLimitMiddleware)
  .use(planGateMiddleware("batch"))
  .post(
    "/drafts",
    async (ctx) => {
      const { body, set } = ctx;
      const authContext = getAuth(ctx);

      const gate = await requirePermission(ctx, "broadcasts", ["write"]);
      if (!gate.ok) {
        return gate.body;
      }

      const orgId = authContext.organizationId;

      const schedule = resolveDraftSchedule(body.scheduledFor);
      if (!schedule.ok) {
        set.status = 400;
        return { error: schedule.error };
      }

      // Same entitlements as the action's checkBroadcastAccess: the audience
      // type and a schedule are separate plan features.
      const entitlement = checkBroadcastEntitlements(authContext.planId, {
        audienceType: body.recipientFilter?.audienceType ?? "all",
        scheduled: schedule.isScheduled,
      });
      if (!entitlement.ok) {
        set.status = 403;
        return { error: entitlement.message };
      }

      // awsAccountId is optional on a draft, but a value given must be one of
      // this org's accounts before the draft stores it.
      if (typeof body.awsAccountId === "string") {
        const account = await findAwsAccountForOrg(body.awsAccountId, orgId);
        if (!account) {
          set.status = 404;
          return { error: "AWS account not found" };
        }
      }

      const unresolved = await findUnresolvedReference(
        {
          segmentId: body.recipientFilter?.segmentId,
          topicId: body.recipientFilter?.topicId,
          templateId: body.templateId,
        },
        orgId
      );
      if (unresolved) {
        set.status = 404;
        return { error: unresolved };
      }

      const channel = body.channel ?? "email";

      // Insert and audit row commit together. Nothing is enqueued: a draft is
      // sent only by POST /v1/batch/{id}/send.
      const draft = await withDraftSavedAudit(
        orgId,
        { userId: gate.userId, request: ctx.request },
        async (tx) => {
          const inserted = await insertDraftBroadcast(
            {
              organizationId: orgId,
              status: "draft",
              channel,
              name: body.name ?? null,
              subject: body.subject ?? null,
              previewText: body.previewText ?? null,
              from: body.from ?? null,
              fromName: body.fromName ?? null,
              replyTo: body.replyTo ?? null,
              emailTemplateId: body.templateId ?? null,
              htmlContent: body.htmlContent ?? null,
              variableMappings: body.variableMappings ?? null,
              body: body.body ?? null,
              senderId: body.senderId ?? null,
              audienceType: body.recipientFilter?.audienceType ?? "all",
              topicId: body.recipientFilter?.topicId ?? null,
              segmentId: body.recipientFilter?.segmentId ?? null,
              awsAccountId: body.awsAccountId ?? null,
              scheduledFor: schedule.scheduledFor,
              createdBy: gate.userId,
            },
            tx
          );
          if (!inserted) {
            throw new Error("Broadcast insert returned null");
          }
          return inserted;
        },
        (inserted) => ({
          resourceId: inserted.id,
          metadata: { broadcastId: inserted.id, channel },
        })
      );

      set.status = 201;
      return toDraftResponse(draft);
    },
    {
      body: createDraftBodySchema,
      response: {
        201: draftResponseSchema,
        400: errorResponse,
        403: errorResponse,
        404: errorResponse,
      },
      detail: {
        tags: ["batch"],
        summary: "Create broadcast draft",
        description:
          "Creates a draft; nothing is sent. Send it with POST /v1/batch/{id}/send. Requires the broadcasts write permission. Every referenced ID (templateId, segmentId, topicId, awsAccountId) must belong to the organization. Returns the new draft.",
      },
    }
  );
