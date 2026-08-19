/**
 * Batch Sending Routes
 *
 * POST /v1/batch - Create a new batch send
 * GET /v1/batch/:id - Get batch send status
 */

import {
  and,
  batchSend,
  cancelBroadcast,
  countBroadcastRecipients,
  createBroadcast,
  db,
  eq,
  findAwsAccountForOrg,
  findBroadcast,
  markBroadcastNotScheduled,
  promoteBroadcast,
} from "@wraps/db";
import { t } from "elysia";

import { createAuthenticatedRoutes, getAuth } from "../middleware/auth";
import { planGateMiddleware } from "../middleware/plan-gate";
import { rateLimitMiddleware } from "../middleware/rate-limit";
import { enqueueJob } from "../services/queue";
import {
  createBroadcastSchedule,
  deleteBroadcastSchedule,
} from "../services/scheduler";

// Batch send request schema
const createBatchSchema = t.Object({
  channel: t.Optional(
    t.Union([t.Literal("email"), t.Literal("sms")], {
      description: "Channel to send through",
    })
  ),
  name: t.Optional(
    t.String({ description: "Name for the batch send", maxLength: 255 })
  ),
  // Recipient targeting
  audienceType: t.Optional(
    t.Union([t.Literal("all"), t.Literal("topic"), t.Literal("segment")], {
      description: "Audience targeting type",
    })
  ),
  topicId: t.Optional(
    t.String({ description: "Topic ID to target", maxLength: 36 })
  ),
  segmentId: t.Optional(
    t.String({ description: "Segment ID to target", maxLength: 36 })
  ),
  // Email-specific fields
  subject: t.Optional(
    t.String({ description: "Email subject line", maxLength: 998 })
  ),
  previewText: t.Optional(
    t.String({ description: "Email preview text", maxLength: 500 })
  ),
  from: t.Optional(
    t.String({ description: "From email address", maxLength: 255 })
  ),
  fromName: t.Optional(
    t.String({ description: "From display name", maxLength: 100 })
  ),
  replyTo: t.Optional(
    t.String({ description: "Reply-to email address", maxLength: 255 })
  ),
  templateId: t.Optional(
    t.String({ description: "Email template ID", maxLength: 36 })
  ),
  htmlContent: t.Optional(
    t.String({ description: "Raw HTML content (if not using template)" })
  ),
  // Variable mappings for custom template variables
  variableMappings: t.Optional(
    t.Array(
      t.Object({
        variableName: t.String({ description: "Template variable name" }),
        source: t.Union([
          t.Object({
            type: t.Literal("static"),
            value: t.String({ description: "Static value" }),
          }),
          t.Object({
            type: t.Literal("contact"),
            field: t.String({ description: "Contact field name" }),
          }),
        ]),
      }),
      { description: "Variable mappings for custom template variables" }
    )
  ),
  // SMS-specific fields (Phase 3)
  body: t.Optional(t.String({ description: "SMS body text", maxLength: 1600 })),
  senderId: t.Optional(
    t.String({ description: "SMS sender ID", maxLength: 20 })
  ),
  // Scheduling
  scheduledFor: t.Optional(
    t.String({
      description: "ISO 8601 datetime for scheduled send",
      format: "date-time",
    })
  ),
  // AWS account to use
  awsAccountId: t.String({
    description: "AWS account ID to use for sending",
    maxLength: 36,
  }),
  // Pre-counted recipients (from web action validation)
  totalRecipients: t.Optional(
    t.Number({ description: "Pre-counted recipient count" })
  ),
});

// Batch send response schema
const batchResponseSchema = t.Object({
  id: t.String({ description: "Batch ID" }),
  status: t.String({
    description:
      "Batch status (queued, scheduled, processing, completed, failed, cancelled)",
  }),
  channel: t.String({ description: "Channel (email or sms)" }),
  totalRecipients: t.Number({ description: "Total number of recipients" }),
  createdAt: t.String({
    description: "Creation timestamp",
    format: "date-time",
  }),
  warning: t.Optional(
    t.String({
      description:
        "Set when the broadcast was accepted but something about it needs saying — e.g. it was marked scheduled in an environment with no scheduler configured, so it will never fire.",
    })
  ),
});

/**
 * A `scheduledFor` in the past used to fall through to `isScheduled = false`
 * and send immediately. Clock skew between the browser and the server, or a
 * retried request, silently converted "schedule for later" into "send now" —
 * an irreversible action the caller did not ask for. Reject instead.
 *
 * The tolerance absorbs ordinary skew: anything inside it was plainly meant as
 * "now" and sends now, which is what the caller expected either way.
 */
const SCHEDULE_PAST_TOLERANCE_MS = 60 * 1000;

/**
 * Outside production, EventBridge Scheduler is usually unconfigured and
 * createBroadcastSchedule is a no-op. The batch still gets status 'scheduled',
 * so without this the dashboard reported "Scheduled" for a send that would
 * never fire — a self-hosted deployment's first scheduled broadcast just
 * vanished.
 */
const SCHEDULER_UNCONFIGURED_WARNING =
  "Scheduling is not configured in this environment, so this broadcast will not send automatically. Send it now, or configure EventBridge Scheduler (BATCH_QUEUE_ARN and SCHEDULER_ROLE_ARN).";

async function markBroadcastScheduleUnconfigured(
  batchId: string,
  organizationId: string
): Promise<void> {
  await markBroadcastNotScheduled(
    batchId,
    organizationId,
    SCHEDULER_UNCONFIGURED_WARNING
  );
}

function resolveSchedule(
  raw: string | undefined
):
  | { ok: true; scheduledFor: Date | undefined; isScheduled: boolean }
  | { ok: false; error: string } {
  if (!raw) {
    return { ok: true, scheduledFor: undefined, isScheduled: false };
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
    return { ok: true, scheduledFor: undefined, isScheduled: false };
  }
  return { ok: true, scheduledFor, isScheduled: true };
}

export const batchRoutes = createAuthenticatedRoutes("/v1/batch")
  .use(rateLimitMiddleware)
  .use(planGateMiddleware("batch"))
  .post(
    "/",
    async (ctx) => {
      const { body, set } = ctx;
      const authContext = getAuth(ctx);

      // Validate awsAccountId belongs to the authenticated organization
      const account = await findAwsAccountForOrg(
        body.awsAccountId,
        authContext.organizationId
      );

      if (!account) {
        set.status = 403;
        return {
          id: "",
          status: "error",
          channel: body.channel ?? "email",
          totalRecipients: 0,
          createdAt: new Date().toISOString(),
          error: "AWS account does not belong to this organization",
        };
      }

      // Use pre-counted recipients if provided, otherwise count here
      const recipientCount =
        body.totalRecipients ??
        (await countBroadcastRecipients(
          authContext.organizationId,
          body.channel ?? "email",
          {
            audienceType: body.audienceType,
            topicId: body.topicId,
            segmentId: body.segmentId,
          }
        ));

      const schedule = resolveSchedule(body.scheduledFor);
      if (!schedule.ok) {
        set.status = 400;
        throw new Error(schedule.error);
      }
      const { scheduledFor, isScheduled } = schedule;

      const batch = await createBroadcast({
        organizationId: authContext.organizationId,
        awsAccountId: body.awsAccountId,
        channel: body.channel ?? "email",
        name: body.name ?? `Batch ${new Date().toISOString()}`,
        status: isScheduled ? "scheduled" : "queued",
        audienceType: body.audienceType ?? "all",
        topicId: body.topicId,
        segmentId: body.segmentId,
        subject: body.subject,
        previewText: body.previewText,
        from: body.from,
        fromName: body.fromName,
        replyTo: body.replyTo,
        emailTemplateId: body.templateId,
        htmlContent: body.htmlContent,
        variableMappings: body.variableMappings,
        body: body.body,
        senderId: body.senderId,
        scheduledFor,
        totalRecipients: recipientCount,
        createdBy: authContext.userId,
      });

      let scheduleWarning: string | undefined;
      if (isScheduled && scheduledFor) {
        const schedulingResult = await createBroadcastSchedule({
          batchId: batch.id,
          organizationId: authContext.organizationId,
          awsAccountId: body.awsAccountId,
          scheduledFor,
          channel: (body.channel ?? "email") as "email" | "sms",
        });
        if (!schedulingResult.created) {
          scheduleWarning = SCHEDULER_UNCONFIGURED_WARNING;
          // Persist it so the broadcast detail page says the same thing later,
          // not just the toast at creation time.
          await markBroadcastScheduleUnconfigured(
            batch.id,
            authContext.organizationId
          );
        }
      } else {
        await enqueueJob({
          batchId: batch.id,
          organizationId: authContext.organizationId,
          awsAccountId: body.awsAccountId,
          channel: batch.channel,
          chunkIndex: 0,
        });
      }

      return {
        id: batch.id,
        status: batch.status,
        channel: batch.channel,
        totalRecipients: recipientCount,
        createdAt: batch.createdAt.toISOString(),
        ...(scheduleWarning ? { warning: scheduleWarning } : {}),
      };
    },
    {
      body: createBatchSchema,
      response: batchResponseSchema,
      detail: {
        tags: ["batch"],
        summary: "Create batch send",
        description:
          "Creates a new batch send job and queues it for processing",
      },
    }
  )
  .get(
    "/:id",
    async (ctx) => {
      const { params, set } = ctx;
      const authContext = getAuth(ctx);

      const batch = await findBroadcast(params.id, authContext.organizationId);

      if (!batch) {
        set.status = 404;
        throw new Error("Batch not found");
      }

      return {
        id: batch.id,
        status: batch.status,
        channel: batch.channel,
        name: batch.name,
        totalRecipients: batch.totalRecipients,
        processedRecipients: batch.processedRecipients,
        sent: batch.sent,
        failed: batch.failed,
        startedAt: batch.startedAt?.toISOString() ?? null,
        completedAt: batch.completedAt?.toISOString() ?? null,
        createdAt: batch.createdAt.toISOString(),
      };
    },
    {
      params: t.Object({
        id: t.String({ description: "Batch ID", maxLength: 36 }),
      }),
      response: {
        200: t.Object({
          id: t.String(),
          status: t.String(),
          channel: t.String(),
          name: t.Union([t.String(), t.Null()]),
          totalRecipients: t.Number(),
          processedRecipients: t.Number(),
          sent: t.Number(),
          failed: t.Number(),
          startedAt: t.Union([t.String(), t.Null()]),
          completedAt: t.Union([t.String(), t.Null()]),
          createdAt: t.String(),
        }),
      },
      detail: {
        tags: ["batch"],
        summary: "Get batch status",
        description: "Returns the current status of a batch send job",
      },
    }
  )
  .post(
    "/:id/send",
    async (ctx) => {
      const { body, params, set } = ctx;
      const authContext = getAuth(ctx);

      // Load the batch scoped by (id, orgId) — without status filter so we can
      // distinguish 404 (no row in org) from 400 (row exists but not draft).
      const existing = await findBroadcast(
        params.id,
        authContext.organizationId
      );

      if (!existing) {
        set.status = 404;
        throw new Error("Batch not found");
      }

      if (existing.status !== "draft") {
        set.status = 400;
        throw new Error(
          `Cannot promote batch in '${existing.status}' status. Only drafts can be promoted.`
        );
      }

      // Validate awsAccountId belongs to the authenticated org
      const account = await findAwsAccountForOrg(
        body.awsAccountId,
        authContext.organizationId
      );

      if (!account) {
        set.status = 403;
        throw new Error("AWS account does not belong to this organization");
      }

      const schedule = resolveSchedule(body.scheduledFor);
      if (!schedule.ok) {
        set.status = 400;
        throw new Error(schedule.error);
      }
      const { scheduledFor, isScheduled } = schedule;

      const channel = body.channel ?? existing.channel ?? "email";

      // Promote in-place: update the draft row, status-gated for concurrency.
      const batch = await promoteBroadcast(
        params.id,
        authContext.organizationId,
        {
          awsAccountId: body.awsAccountId,
          channel,
          name: body.name ?? existing.name,
          status: isScheduled ? "scheduled" : "queued",
          audienceType: body.audienceType ?? existing.audienceType,
          topicId: body.topicId ?? existing.topicId,
          segmentId: body.segmentId ?? existing.segmentId,
          subject: body.subject ?? existing.subject,
          previewText: body.previewText ?? existing.previewText,
          from: body.from ?? existing.from,
          fromName: body.fromName ?? existing.fromName,
          replyTo: body.replyTo ?? existing.replyTo,
          emailTemplateId: body.templateId ?? existing.emailTemplateId,
          htmlContent: body.htmlContent ?? existing.htmlContent,
          variableMappings: body.variableMappings ?? existing.variableMappings,
          body: body.body ?? existing.body,
          senderId: body.senderId ?? existing.senderId,
          scheduledFor: scheduledFor ?? null,
          totalRecipients: body.totalRecipients,
          createdBy: authContext.userId,
        }
      );

      if (!batch) {
        // Concurrent promote (or row disappeared) — fail loudly, no side effects.
        set.status = 409;
        throw new Error("Expected to promote exactly 1 draft row, updated 0");
      }

      let scheduleWarning: string | undefined;
      if (isScheduled && scheduledFor) {
        const schedulingResult = await createBroadcastSchedule({
          batchId: batch.id,
          organizationId: authContext.organizationId,
          awsAccountId: body.awsAccountId,
          scheduledFor,
          channel: channel as "email" | "sms",
        });
        if (!schedulingResult.created) {
          scheduleWarning = SCHEDULER_UNCONFIGURED_WARNING;
          await markBroadcastScheduleUnconfigured(
            batch.id,
            authContext.organizationId
          );
        }
      } else {
        await enqueueJob({
          batchId: batch.id,
          organizationId: authContext.organizationId,
          awsAccountId: body.awsAccountId,
          channel: batch.channel,
          chunkIndex: 0,
        });
      }

      set.status = 201;
      return {
        id: batch.id,
        status: batch.status,
        ...(scheduleWarning ? { warning: scheduleWarning } : {}),
      };
    },
    {
      params: t.Object({
        id: t.String({
          description: "Draft batch ID to promote",
          maxLength: 36,
        }),
      }),
      body: t.Object({
        channel: t.Optional(t.Union([t.Literal("email"), t.Literal("sms")])),
        name: t.Optional(t.String({ maxLength: 255 })),
        audienceType: t.Optional(
          t.Union([t.Literal("all"), t.Literal("topic"), t.Literal("segment")])
        ),
        topicId: t.Optional(t.String({ maxLength: 36 })),
        segmentId: t.Optional(t.String({ maxLength: 36 })),
        subject: t.Optional(t.String({ maxLength: 998 })),
        previewText: t.Optional(t.String({ maxLength: 500 })),
        from: t.Optional(t.String({ maxLength: 255 })),
        fromName: t.Optional(t.String({ maxLength: 100 })),
        replyTo: t.Optional(t.String({ maxLength: 255 })),
        templateId: t.Optional(t.String({ maxLength: 36 })),
        htmlContent: t.Optional(t.String()),
        variableMappings: t.Optional(
          t.Array(
            t.Object({
              variableName: t.String(),
              source: t.Union([
                t.Object({
                  type: t.Literal("static"),
                  value: t.String(),
                }),
                t.Object({
                  type: t.Literal("contact"),
                  field: t.String(),
                }),
              ]),
            })
          )
        ),
        body: t.Optional(t.String({ maxLength: 1600 })),
        senderId: t.Optional(t.String({ maxLength: 20 })),
        scheduledFor: t.Optional(t.String({ format: "date-time" })),
        awsAccountId: t.String({ maxLength: 36 }),
        totalRecipients: t.Number(),
      }),
      response: {
        201: t.Object({
          id: t.String(),
          status: t.String(),
          warning: t.Optional(t.String()),
        }),
      },
      detail: {
        tags: ["batch"],
        summary: "Promote draft batch send",
        description:
          "Promotes an existing draft batch_send to an active send (queued or scheduled).",
      },
    }
  )
  .delete(
    "/:id",
    async (ctx) => {
      const { params, set } = ctx;
      const authContext = getAuth(ctx);

      // Find the batch (scoped by organization)
      const batch = await findBroadcast(params.id, authContext.organizationId);

      if (!batch) {
        set.status = 404;
        throw new Error("Batch not found");
      }

      // Can only cancel scheduled, queued, or processing batches
      if (!["scheduled", "queued", "processing"].includes(batch.status)) {
        set.status = 400;
        throw new Error(
          `Cannot cancel batch in '${batch.status}' status. Only scheduled, queued, or processing batches can be cancelled.`
        );
      }

      // If scheduled, delete the EventBridge schedule
      if (batch.status === "scheduled") {
        await deleteBroadcastSchedule(batch.id);
      }

      await cancelBroadcast(batch.id, authContext.organizationId);

      return { success: true, id: batch.id, status: "cancelled" };
    },
    {
      params: t.Object({
        id: t.String({ description: "Batch ID to cancel", maxLength: 36 }),
      }),
      response: {
        200: t.Object({
          success: t.Boolean(),
          id: t.String(),
          status: t.String(),
        }),
      },
      detail: {
        tags: ["batch"],
        summary: "Cancel batch send",
        description:
          "Cancels a scheduled or queued batch send. If scheduled, also deletes the EventBridge schedule.",
      },
    }
  )
  .post(
    "/:id/resume",
    async (ctx) => {
      const { params, body, set } = ctx;
      const authContext = getAuth(ctx);

      // Kill switch — turn off without a redeploy if resume starts misbehaving.
      if (process.env.BROADCAST_RESUME_ENABLED === "false") {
        set.status = 503;
        return { error: "Broadcast resume is temporarily disabled" };
      }

      const [batch] = await db
        .select()
        .from(batchSend)
        .where(
          and(
            eq(batchSend.id, params.id),
            eq(batchSend.organizationId, authContext.organizationId)
          )
        )
        .limit(1);

      if (!batch) {
        set.status = 404;
        return { error: "Batch not found" };
      }

      if (!(batch.status === "processing" || batch.status === "failed")) {
        set.status = 409;
        return {
          error: `Cannot resume batch in '${batch.status}' status. Only 'processing' or 'failed' batches can be resumed.`,
        };
      }

      // SMS resume is out of scope — worker would immediately stamp the
      // batch as failed again via the unsupported-channel path.
      if (batch.channel !== "email") {
        set.status = 409;
        return {
          error: `Resume is only supported for email batches. Channel: ${batch.channel}`,
        };
      }

      // AWS account disconnected after the batch was scheduled — operator
      // must reconnect before we can resume.
      if (!batch.awsAccountId) {
        set.status = 409;
        return {
          error:
            "AWS account is not attached to this batch; reconnect it before resuming.",
        };
      }

      // Resume point: caller override wins, else use the durable heartbeat.
      // Off-by-one safety: lastChunkIndex == null means NO chunk completed,
      // so resume at 0 with cursor undefined (NOT 1 with null cursor).
      const override = body?.fromChunkIndex;
      const nextIndex =
        override == null
          ? batch.lastChunkIndex == null
            ? 0
            : batch.lastChunkIndex + 1
          : override;
      const cursor =
        override != null ? undefined : (batch.lastCursor ?? undefined);

      // Append audit trail on batchSend.errorDetails — Axiom logs age out
      // after 30d but the DB audit sticks around.
      const existingDetails =
        (batch.errorDetails as Record<string, unknown> | null) ?? {};
      const existingResumes = Array.isArray(existingDetails.resumes)
        ? (existingDetails.resumes as Record<string, unknown>[])
        : [];
      const resumedBy = authContext.userId ?? authContext.apiKeyId ?? "unknown";
      const nextDetails = {
        ...existingDetails,
        resumes: [
          ...existingResumes,
          {
            resumedAt: new Date().toISOString(),
            resumedBy,
            fromChunkIndex: nextIndex,
          },
        ],
      };

      await db
        .update(batchSend)
        .set({
          status: "processing",
          lastChunkAt: new Date(),
          errorDetails: nextDetails,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(batchSend.id, batch.id),
            eq(batchSend.organizationId, authContext.organizationId)
          )
        );

      await enqueueJob({
        batchId: batch.id,
        organizationId: authContext.organizationId,
        awsAccountId: batch.awsAccountId,
        channel: batch.channel,
        chunkIndex: nextIndex,
        cursor,
      });

      return { resumed: true, fromChunkIndex: nextIndex };
    },
    {
      params: t.Object({
        id: t.String({ description: "Batch ID to resume", maxLength: 36 }),
      }),
      body: t.Optional(
        t.Object({
          fromChunkIndex: t.Optional(
            t.Number({
              description:
                "Operator override — restart from this chunkIndex with a fresh cursor. Omit to use the durable heartbeat.",
              minimum: 0,
            })
          ),
        })
      ),
      detail: {
        tags: ["batch"],
        summary: "Resume batch send",
        description:
          "Resumes a 'processing' or 'failed' email batch from the last successfully completed chunk. Writes a resume entry to errorDetails and enqueues the next chunk.",
      },
    }
  );
