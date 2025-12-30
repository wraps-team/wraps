/**
 * Batch Sending Routes
 *
 * POST /v1/batch - Create a new batch send
 * GET /v1/batch/:id - Get batch send status
 */

import { batchSend, contact, db, eq } from "@wraps/db";
import { and, isNotNull, sql } from "drizzle-orm";
import { Elysia, t } from "elysia";

import {
  type AuthContext,
  authenticate,
  authMiddleware,
} from "../middleware/auth";
import { planGateMiddleware } from "../middleware/plan-gate";
import { rateLimitMiddleware } from "../middleware/rate-limit";
import { enqueueJob } from "../services/queue";
import {
  createBroadcastSchedule,
  deleteBroadcastSchedule,
} from "../services/scheduler";

// Batch send request schema
const createBatchSchema = t.Object({
  channel: t.Optional(t.Union([t.Literal("email"), t.Literal("sms")])),
  name: t.Optional(t.String()),
  // Email-specific fields
  subject: t.Optional(t.String()),
  previewText: t.Optional(t.String()),
  from: t.Optional(t.String()),
  fromName: t.Optional(t.String()),
  replyTo: t.Optional(t.String()),
  templateId: t.Optional(t.String()),
  htmlContent: t.Optional(t.String()),
  // SMS-specific fields (Phase 3)
  body: t.Optional(t.String()),
  senderId: t.Optional(t.String()),
  // Scheduling
  scheduledFor: t.Optional(t.String()),
  // AWS account to use
  awsAccountId: t.String(),
  // Pre-counted recipients (from web action validation)
  totalRecipients: t.Optional(t.Number()),
});

// Batch send response schema
const batchResponseSchema = t.Object({
  id: t.String(),
  status: t.String(),
  channel: t.String(),
  totalRecipients: t.Number(),
  createdAt: t.String(),
});

export const batchRoutes = new Elysia({ prefix: "/v1/batch" })
  .use(authMiddleware)
  .use(rateLimitMiddleware)
  .use(planGateMiddleware("batch"))
  .post(
    "/",
    async (ctx) => {
      const { body, set, request } = ctx;

      // Try middleware auth first, fall back to direct authenticate
      let authContext = (ctx as unknown as { auth?: AuthContext }).auth;

      if (!authContext) {
        // Middleware didn't set auth, call authenticate directly
        const authResult = await authenticate(request);
        if ("error" in authResult) {
          set.status = 401;
          throw new Error(authResult.error);
        }
        authContext = authResult.auth;
      }

      if (!authContext?.organizationId) {
        set.status = 401;
        throw new Error("Auth failed: no organization ID");
      }

      // Use pre-counted recipients if provided, otherwise count here
      let recipientCount = body.totalRecipients;
      if (!recipientCount) {
        recipientCount = await getRecipientCount(
          authContext.organizationId,
          body.channel ?? "email"
        );
      }

      // Determine if this is a scheduled send
      const scheduledFor = body.scheduledFor
        ? new Date(body.scheduledFor)
        : undefined;
      const isScheduled = scheduledFor && scheduledFor > new Date();

      // Create batch send record
      const [batch] = await db
        .insert(batchSend)
        .values({
          organizationId: authContext.organizationId,
          awsAccountId: body.awsAccountId,
          channel: body.channel ?? "email",
          name: body.name ?? `Batch ${new Date().toISOString()}`,
          status: isScheduled ? "scheduled" : "queued",
          // Email fields
          subject: body.subject,
          previewText: body.previewText,
          from: body.from,
          fromName: body.fromName,
          replyTo: body.replyTo,
          emailTemplateId: body.templateId,
          htmlContent: body.htmlContent,
          // SMS fields (Phase 3)
          body: body.body,
          senderId: body.senderId,
          // Scheduling
          scheduledFor,
          // Recipients
          totalRecipients: recipientCount,
          // Tracking
          createdBy: authContext.userId,
        })
        .returning();

      if (isScheduled && scheduledFor) {
        // Create EventBridge schedule for future execution
        await createBroadcastSchedule({
          batchId: batch.id,
          organizationId: authContext.organizationId,
          awsAccountId: body.awsAccountId,
          scheduledFor,
          channel: (body.channel ?? "email") as "email" | "sms",
        });
      } else {
        // Send immediately - enqueue to SQS
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
      const { params, request, set } = ctx;

      // Try middleware auth first, fall back to direct authenticate
      let authContext = (ctx as unknown as { auth?: AuthContext }).auth;

      if (!authContext) {
        const authResult = await authenticate(request);
        if ("error" in authResult) {
          set.status = 401;
          throw new Error(authResult.error);
        }
        authContext = authResult.auth;
      }

      const [batch] = await db
        .select()
        .from(batchSend)
        .where(eq(batchSend.id, params.id))
        .limit(1);

      if (!batch) {
        throw new Error("Batch not found");
      }

      // Verify ownership
      if (batch.organizationId !== authContext.organizationId) {
        throw new Error("Not authorized");
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
        startedAt: batch.startedAt?.toISOString(),
        completedAt: batch.completedAt?.toISOString(),
        createdAt: batch.createdAt.toISOString(),
      };
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      detail: {
        tags: ["batch"],
        summary: "Get batch status",
        description: "Returns the current status of a batch send job",
      },
    }
  )
  .delete(
    "/:id",
    async (ctx) => {
      const { params, request, set } = ctx;

      // Try middleware auth first, fall back to direct authenticate
      let authContext = (ctx as unknown as { auth?: AuthContext }).auth;

      if (!authContext) {
        const authResult = await authenticate(request);
        if ("error" in authResult) {
          set.status = 401;
          throw new Error(authResult.error);
        }
        authContext = authResult.auth;
      }

      // Find the batch
      const [batch] = await db
        .select()
        .from(batchSend)
        .where(eq(batchSend.id, params.id))
        .limit(1);

      if (!batch) {
        set.status = 404;
        throw new Error("Batch not found");
      }

      // Verify ownership
      if (batch.organizationId !== authContext.organizationId) {
        set.status = 403;
        throw new Error("Not authorized");
      }

      // Can only cancel scheduled or queued batches
      if (!["scheduled", "queued"].includes(batch.status)) {
        set.status = 400;
        throw new Error(
          `Cannot cancel batch in '${batch.status}' status. Only scheduled or queued batches can be cancelled.`
        );
      }

      // If scheduled, delete the EventBridge schedule
      if (batch.status === "scheduled") {
        await deleteBroadcastSchedule(batch.id);
      }

      // Update status to cancelled
      await db
        .update(batchSend)
        .set({
          status: "cancelled",
          updatedAt: new Date(),
        })
        .where(eq(batchSend.id, params.id));

      return { success: true, id: batch.id, status: "cancelled" };
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      response: t.Object({
        success: t.Boolean(),
        id: t.String(),
        status: t.String(),
      }),
      detail: {
        tags: ["batch"],
        summary: "Cancel batch send",
        description:
          "Cancels a scheduled or queued batch send. If scheduled, also deletes the EventBridge schedule.",
      },
    }
  );

// Helper to count recipients for a batch
async function getRecipientCount(
  organizationId: string,
  channel: string
): Promise<number> {
  if (channel === "email") {
    // Count contacts with active email status (null treated as active for backwards compat)
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(contact)
      .where(
        and(
          eq(contact.organizationId, organizationId),
          isNotNull(contact.email),
          sql`(${contact.emailStatus} = 'active' OR ${contact.emailStatus} IS NULL)`
        )
      );
    return result?.count ?? 0;
  }

  // SMS - count contacts with opted_in status
  if (channel === "sms") {
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(contact)
      .where(
        and(
          eq(contact.organizationId, organizationId),
          isNotNull(contact.phone),
          eq(contact.smsStatus, "opted_in")
        )
      );
    return result?.count ?? 0;
  }

  return 0;
}
