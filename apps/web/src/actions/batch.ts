"use server";

import { auth } from "@wraps/auth";
import { batchSend, contact, db, template } from "@wraps/db";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import type {
  BatchStatus,
  CancelBatchResult,
  Channel,
  CreateBatchInput,
  CreateBatchResult,
  GetBatchResult,
  ListBatchesResult,
} from "@/lib/batch";
import { createActionLogger, serializeError } from "@/lib/logger";
import { checkFeatureAccess } from "@/lib/plan-limits";

// Re-export types for convenience
export type {
  BatchSendWithMeta,
  CancelBatchResult,
  CreateBatchResult,
  GetBatchResult,
  ListBatchesResult,
} from "@/lib/batch";

/**
 * Verify user has access to organization
 */
async function verifyOrgAccess(
  organizationId: string
): Promise<{ userId: string; role: string } | null> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return null;
  }

  const membership = await db.query.member.findFirst({
    where: (m, { and, eq }) =>
      and(eq(m.organizationId, organizationId), eq(m.userId, session.user.id)),
  });

  if (!membership) {
    return null;
  }

  return { userId: session.user.id, role: membership.role };
}

/**
 * List batch sends for an organization
 */
export async function listBatchSends(
  organizationId: string,
  options: {
    page?: number;
    pageSize?: number;
    status?: BatchStatus;
    channel?: Channel;
  } = {}
): Promise<ListBatchesResult> {
  try {
    const access = await verifyOrgAccess(organizationId);
    if (!access) {
      return {
        success: false,
        error: "You don't have access to this organization",
      };
    }

    const { page = 1, pageSize = 20, status, channel } = options;
    const offset = (page - 1) * pageSize;

    // Build where conditions
    const conditions = [eq(batchSend.organizationId, organizationId)];
    if (status) {
      conditions.push(eq(batchSend.status, status));
    }
    if (channel) {
      conditions.push(eq(batchSend.channel, channel));
    }

    // Get total count
    const [totalResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(batchSend)
      .where(and(...conditions));

    const total = totalResult?.count ?? 0;

    // Get batch sends with relations
    const batches = await db.query.batchSend.findMany({
      where: and(...conditions),
      with: {
        createdByUser: {
          columns: {
            id: true,
            name: true,
            email: true,
          },
        },
        awsAccount: {
          columns: {
            id: true,
            name: true,
            region: true,
          },
        },
        emailTemplate: {
          columns: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [desc(batchSend.createdAt)],
      limit: pageSize,
      offset,
    });

    return {
      success: true,
      batches: batches.map((b) => ({
        id: b.id,
        name: b.name,
        channel: b.channel as Channel,
        status: b.status as BatchStatus,
        subject: b.subject,
        previewText: b.previewText,
        from: b.from,
        fromName: b.fromName,
        replyTo: b.replyTo,
        templateId: b.emailTemplateId,
        templateName: b.emailTemplate?.name,
        totalRecipients: b.totalRecipients,
        processedRecipients: b.processedRecipients,
        sent: b.sent,
        delivered: b.delivered,
        failed: b.failed,
        opened: b.opened,
        clicked: b.clicked,
        bounced: b.bounced,
        complained: b.complained,
        errorMessage: b.errorMessage,
        scheduledFor: b.scheduledFor,
        startedAt: b.startedAt,
        completedAt: b.completedAt,
        createdAt: b.createdAt,
        createdBy: b.createdByUser,
        awsAccount: b.awsAccount,
      })),
      total,
    };
  } catch (error) {
    const log = createActionLogger("listBatchSends", {
      orgSlug: organizationId,
    });
    log.error({ err: serializeError(error) }, "Failed to list batch sends");
    return { success: false, error: "Failed to fetch batch sends" };
  }
}

/**
 * Get a single batch send by ID
 */
export async function getBatchSend(
  batchId: string,
  organizationId: string
): Promise<GetBatchResult> {
  try {
    const access = await verifyOrgAccess(organizationId);
    if (!access) {
      return {
        success: false,
        error: "You don't have access to this organization",
      };
    }

    const b = await db.query.batchSend.findFirst({
      where: (batch, { and, eq }) =>
        and(eq(batch.id, batchId), eq(batch.organizationId, organizationId)),
      with: {
        createdByUser: {
          columns: {
            id: true,
            name: true,
            email: true,
          },
        },
        awsAccount: {
          columns: {
            id: true,
            name: true,
            region: true,
          },
        },
        emailTemplate: {
          columns: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!b) {
      return { success: false, error: "Batch send not found" };
    }

    return {
      success: true,
      batch: {
        id: b.id,
        name: b.name,
        channel: b.channel as Channel,
        status: b.status as BatchStatus,
        subject: b.subject,
        previewText: b.previewText,
        from: b.from,
        fromName: b.fromName,
        replyTo: b.replyTo,
        templateId: b.emailTemplateId,
        templateName: b.emailTemplate?.name,
        totalRecipients: b.totalRecipients,
        processedRecipients: b.processedRecipients,
        sent: b.sent,
        delivered: b.delivered,
        failed: b.failed,
        opened: b.opened,
        clicked: b.clicked,
        bounced: b.bounced,
        complained: b.complained,
        errorMessage: b.errorMessage,
        scheduledFor: b.scheduledFor,
        startedAt: b.startedAt,
        completedAt: b.completedAt,
        createdAt: b.createdAt,
        createdBy: b.createdByUser,
        awsAccount: b.awsAccount,
      },
    };
  } catch (error) {
    const log = createActionLogger("getBatchSend", {
      orgSlug: organizationId,
    });
    log.error(
      { err: serializeError(error), batchId },
      "Failed to get batch send"
    );
    return { success: false, error: "Failed to fetch batch send" };
  }
}

/**
 * Create a new batch send
 */
export async function createBatchSend(
  organizationId: string,
  data: CreateBatchInput
): Promise<CreateBatchResult> {
  try {
    const access = await verifyOrgAccess(organizationId);
    if (!access) {
      return {
        success: false,
        error: "You don't have access to this organization",
      };
    }

    // Only owners and admins can create batch sends
    if (!["owner", "admin"].includes(access.role)) {
      return {
        success: false,
        error: "Only owners and admins can send emails",
      };
    }

    // Check if batch sending is available for this plan
    const featureCheck = await checkFeatureAccess(organizationId, "batch");
    if (!featureCheck.allowed) {
      return {
        success: false,
        error:
          featureCheck.message ??
          "Batch sending is not available on your plan.",
      };
    }

    // Validate AWS account exists and belongs to org
    const awsAccount = await db.query.awsAccount.findFirst({
      where: (a, { and, eq }) =>
        and(eq(a.id, data.awsAccountId), eq(a.organizationId, organizationId)),
    });

    if (!awsAccount) {
      return { success: false, error: "AWS account not found" };
    }

    // Validate template if provided
    if (data.templateId) {
      const tmpl = await db.query.template.findFirst({
        where: (t, { and, eq }) =>
          and(eq(t.id, data.templateId!), eq(t.organizationId, organizationId)),
      });

      if (!tmpl) {
        return { success: false, error: "Template not found" };
      }
    }

    // Count eligible recipients
    const recipientCount = await countRecipients(
      organizationId,
      data.channel ?? "email"
    );

    if (recipientCount === 0) {
      return {
        success: false,
        error:
          data.channel === "sms"
            ? "No contacts with SMS consent found"
            : "No active email contacts found",
      };
    }

    // Create batch send
    const [newBatch] = await db
      .insert(batchSend)
      .values({
        organizationId,
        awsAccountId: data.awsAccountId,
        channel: data.channel ?? "email",
        name: data.name ?? `Batch Send ${new Date().toLocaleDateString()}`,
        status: "queued",
        // Email fields
        subject: data.subject,
        previewText: data.previewText,
        from: data.from,
        fromName: data.fromName,
        replyTo: data.replyTo,
        emailTemplateId: data.templateId,
        // SMS fields
        body: data.body,
        senderId: data.senderId,
        // Timing
        scheduledFor: data.scheduledFor,
        // Recipients
        totalRecipients: recipientCount,
        // Audit
        createdBy: access.userId,
      })
      .returning();

    if (!newBatch) {
      return { success: false, error: "Failed to create batch send" };
    }

    // TODO: Enqueue job to SQS for processing
    // This would typically call an API endpoint or SQS directly
    // For now, we'll leave it in queued status for the worker to pick up

    revalidatePath("/[orgSlug]/send", "page");

    return await getBatchSend(newBatch.id, organizationId);
  } catch (error) {
    const log = createActionLogger("createBatchSend", {
      orgSlug: organizationId,
    });
    log.error({ err: serializeError(error) }, "Failed to create batch send");
    return { success: false, error: "Failed to create batch send" };
  }
}

/**
 * Cancel a batch send
 */
export async function cancelBatchSend(
  batchId: string,
  organizationId: string
): Promise<CancelBatchResult> {
  try {
    const access = await verifyOrgAccess(organizationId);
    if (!access) {
      return {
        success: false,
        error: "You don't have access to this organization",
      };
    }

    // Only owners and admins can cancel batch sends
    if (!["owner", "admin"].includes(access.role)) {
      return {
        success: false,
        error: "Only owners and admins can cancel batch sends",
      };
    }

    // Verify batch exists and can be cancelled
    const existing = await db.query.batchSend.findFirst({
      where: (b, { and, eq }) =>
        and(eq(b.id, batchId), eq(b.organizationId, organizationId)),
    });

    if (!existing) {
      return { success: false, error: "Batch send not found" };
    }

    if (existing.status === "completed") {
      return { success: false, error: "Cannot cancel a completed batch send" };
    }

    if (existing.status === "cancelled") {
      return { success: false, error: "Batch send is already cancelled" };
    }

    // Cancel the batch
    await db
      .update(batchSend)
      .set({
        status: "cancelled",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(batchSend.id, batchId),
          eq(batchSend.organizationId, organizationId)
        )
      );

    revalidatePath("/[orgSlug]/send", "page");
    revalidatePath(`/[orgSlug]/send/${batchId}`, "page");

    return { success: true };
  } catch (error) {
    const log = createActionLogger("cancelBatchSend", {
      orgSlug: organizationId,
    });
    log.error(
      { err: serializeError(error), batchId },
      "Failed to cancel batch send"
    );
    return { success: false, error: "Failed to cancel batch send" };
  }
}

/**
 * Count eligible recipients for a batch send
 */
async function countRecipients(
  organizationId: string,
  channel: Channel
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

  // SMS - count contacts with opted_in SMS status
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

/**
 * Get recipient preview count for batch send form
 */
export async function getRecipientCount(
  organizationId: string,
  channel: Channel = "email"
): Promise<
  { success: true; count: number } | { success: false; error: string }
> {
  try {
    const access = await verifyOrgAccess(organizationId);
    if (!access) {
      return {
        success: false,
        error: "You don't have access to this organization",
      };
    }

    const count = await countRecipients(organizationId, channel);
    return { success: true, count };
  } catch (error) {
    const log = createActionLogger("getRecipientCount", {
      orgSlug: organizationId,
    });
    log.error({ err: serializeError(error) }, "Failed to get recipient count");
    return { success: false, error: "Failed to count recipients" };
  }
}

/**
 * List templates for batch send form
 */
export async function listTemplatesForBatch(organizationId: string): Promise<
  | {
      success: true;
      templates: Array<{ id: string; name: string; subject: string | null }>;
    }
  | { success: false; error: string }
> {
  try {
    const access = await verifyOrgAccess(organizationId);
    if (!access) {
      return {
        success: false,
        error: "You don't have access to this organization",
      };
    }

    const templates = await db.query.template.findMany({
      where: (t, { and, eq }) =>
        and(eq(t.organizationId, organizationId), eq(t.status, "PUBLISHED")),
      columns: {
        id: true,
        name: true,
        subject: true,
      },
      orderBy: [desc(template.updatedAt)],
    });

    return {
      success: true,
      templates,
    };
  } catch (error) {
    const log = createActionLogger("listTemplatesForBatch", {
      orgSlug: organizationId,
    });
    log.error({ err: serializeError(error) }, "Failed to list templates");
    return { success: false, error: "Failed to fetch templates" };
  }
}
