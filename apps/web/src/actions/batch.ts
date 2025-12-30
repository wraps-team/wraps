"use server";

import { auth } from "@wraps/auth";
import { batchSend, contact, contactTopic, db, template } from "@wraps/db";
import {
  and,
  desc,
  eq,
  exists,
  isNotNull,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
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
  RecipientFilter,
} from "@/lib/batch";
import { createActionLogger, serializeError } from "@/lib/logger";
import { checkFeatureAccess } from "@/lib/plan-limits";
import type { FilterCondition, SegmentFilter } from "@/lib/segments";

// Re-export types for convenience
export type {
  AudienceType,
  BatchSendWithMeta,
  CancelBatchResult,
  ContentType,
  CreateBatchResult,
  GetBatchResult,
  ListBatchesResult,
  RecipientFilter,
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
 * Create a new batch send by calling the API
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

    // Check if scheduling is available (requires campaigns feature - Pro+)
    if (data.scheduledFor) {
      const schedulingCheck = await checkFeatureAccess(organizationId, "campaigns");
      if (!schedulingCheck.allowed) {
        return {
          success: false,
          error: "Scheduling broadcasts requires a Pro plan or higher.",
        };
      }
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

    // Count eligible recipients based on filter
    const recipientCount = await countRecipients(
      organizationId,
      data.channel ?? "email",
      data.recipientFilter
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

    // Get session from Better Auth
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return { success: false, error: "Session not found" };
    }

    console.log(
      "[batch] Session token:",
      session.session.token
        ? `${session.session.token.slice(0, 10)}...`
        : "undefined"
    );
    console.log("[batch] Session keys:", Object.keys(session.session));

    // Call the API to create batch and enqueue
    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    if (!apiUrl) {
      return { success: false, error: "API URL not configured" };
    }

    const response = await fetch(`${apiUrl}/v1/batch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.session.token}`,
        "X-Organization-Id": organizationId,
      },
      body: JSON.stringify({
        channel: data.channel ?? "email",
        name: data.name ?? `Broadcast ${new Date().toLocaleDateString()}`,
        subject: data.subject,
        previewText: data.previewText,
        from: data.from,
        fromName: data.fromName,
        replyTo: data.replyTo,
        templateId: data.templateId,
        htmlContent: data.htmlContent,
        body: data.body,
        senderId: data.senderId,
        scheduledFor: data.scheduledFor?.toISOString(),
        awsAccountId: data.awsAccountId,
        totalRecipients: recipientCount,
      }),
    });

    if (!response.ok) {
      // Read body as text first, then try to parse as JSON
      const errorText = await response.text();
      console.error("Failed to create batch via API:", errorText);
      try {
        const errorData = JSON.parse(errorText) as {
          error?: string;
          debug?: unknown;
        };
        return {
          success: false,
          error: `${errorData.error} | debug: ${JSON.stringify(errorData.debug)}`,
        };
      } catch {
        return { success: false, error: errorText || "Unknown error" };
      }
    }

    const result = (await response.json()) as { id: string };

    revalidatePath("/[orgSlug]/send", "page");

    return await getBatchSend(result.id, organizationId);
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
 *
 * Calls the API DELETE endpoint which handles:
 * - Verifying batch exists and ownership
 * - Checking if batch can be cancelled (only scheduled/queued)
 * - Deleting EventBridge schedule if status is "scheduled"
 * - Updating status to "cancelled"
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

    // Get session for API auth
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return { success: false, error: "Session not found" };
    }

    // Call the API to cancel batch (handles EventBridge schedule deletion)
    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    if (!apiUrl) {
      return { success: false, error: "API URL not configured" };
    }

    const response = await fetch(`${apiUrl}/v1/batch/${batchId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${session.session.token}`,
        "X-Organization-Id": organizationId,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      try {
        const errorData = JSON.parse(errorText) as { error?: string };
        return {
          success: false,
          error: errorData.error || "Failed to cancel batch send",
        };
      } catch {
        return { success: false, error: errorText || "Failed to cancel batch send" };
      }
    }

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

// Map of field names to SQL column references for segment filtering
const COLUMN_MAP: Record<string, string> = {
  status: "status",
  email: "email",
  lastActivityAt: "last_activity_at",
  lastEmailSentAt: "last_email_sent_at",
  lastEmailOpenedAt: "last_email_opened_at",
  lastEmailClickedAt: "last_email_clicked_at",
  emailsSent: "emails_sent",
  emailsOpened: "emails_opened",
  emailsClicked: "emails_clicked",
  createdAt: "created_at",
  confirmedAt: "confirmed_at",
};

/**
 * Build SQL condition from a single segment filter
 */
function buildFilterSQL(filter: SegmentFilter): SQL | null {
  const { field, operator, value, unit } = filter;

  // Handle topic-based filters
  if (field === "topics") {
    const topicId = value as string;
    const subquery = db
      .select({ contactId: contactTopic.contactId })
      .from(contactTopic)
      .where(
        and(
          eq(contactTopic.contactId, contact.id),
          eq(contactTopic.topicId, topicId),
          eq(contactTopic.status, "subscribed")
        )
      );

    if (operator === "hasTopic") {
      return exists(subquery);
    }
    if (operator === "notHasTopic") {
      // Use sql to build NOT EXISTS
      return sql`NOT EXISTS (${subquery})`;
    }
    return null;
  }

  // Handle custom properties
  if (field.startsWith("properties.")) {
    const propertyKey = field.replace("properties.", "");

    switch (operator) {
      case "equals":
        return sql`properties->>${propertyKey} = ${String(value)}`;
      case "notEquals":
        return sql`properties->>${propertyKey} != ${String(value)}`;
      case "contains":
        return sql`properties->>${propertyKey} ILIKE ${`%${String(value)}%`}`;
      case "exists":
        return sql`properties ? ${propertyKey}`;
      case "notExists":
        return sql`NOT (properties ? ${propertyKey})`;
      default:
        return null;
    }
  }

  // Handle standard contact fields
  const columnName = COLUMN_MAP[field];
  if (!columnName) {
    return null;
  }

  const col = sql.raw(`"${columnName}"`);

  switch (operator) {
    case "equals":
      return sql`${col} = ${value}`;
    case "notEquals":
      return sql`${col} != ${value}`;
    case "contains":
      return sql`${col} ILIKE ${`%${String(value)}%`}`;
    case "greaterThan":
      return sql`${col} > ${value}`;
    case "lessThan":
      return sql`${col} < ${value}`;
    case "exists":
      return sql`${col} IS NOT NULL`;
    case "notExists":
      return sql`${col} IS NULL`;
    case "within": {
      const timeValue = value as number;
      const interval =
        unit === "hours"
          ? `${timeValue} hours`
          : unit === "minutes"
            ? `${timeValue} minutes`
            : `${timeValue} days`;
      return sql`${col} > NOW() - INTERVAL ${interval}`;
    }
    default:
      return null;
  }
}

/**
 * Build SQL condition from FilterCondition recursively
 */
function buildConditionSQL(condition: FilterCondition): SQL | null {
  const groupConditions: SQL[] = [];

  for (const group of condition.groups) {
    const filterConditions: SQL[] = [];

    for (const filter of group.filters) {
      const filterSQL = buildFilterSQL(filter);
      if (filterSQL) {
        filterConditions.push(filterSQL);
      }
    }

    if (group.nested) {
      const nestedSQL = buildConditionSQL(group.nested);
      if (nestedSQL) {
        filterConditions.push(nestedSQL);
      }
    }

    if (filterConditions.length > 0) {
      groupConditions.push(and(...filterConditions)!);
    }
  }

  if (groupConditions.length === 0) {
    return null;
  }

  if (condition.logic === "OR") {
    return or(...groupConditions) ?? null;
  }
  return and(...groupConditions) ?? null;
}

/**
 * Count eligible recipients for a batch send
 */
async function countRecipients(
  organizationId: string,
  channel: Channel,
  filter?: RecipientFilter
): Promise<number> {
  // Base conditions for channel
  const baseConditions: SQL[] = [eq(contact.organizationId, organizationId)];

  if (channel === "email") {
    baseConditions.push(isNotNull(contact.email));
    baseConditions.push(
      sql`(${contact.emailStatus} = 'active' OR ${contact.emailStatus} IS NULL)`
    );
  } else {
    // SMS
    baseConditions.push(isNotNull(contact.phone));
    baseConditions.push(eq(contact.smsStatus, "opted_in"));
  }

  // Apply recipient filter
  if (filter?.audienceType === "topic" && filter.topicId) {
    // Filter by topic subscription
    const topicSubquery = db
      .select({ contactId: contactTopic.contactId })
      .from(contactTopic)
      .where(
        and(
          eq(contactTopic.contactId, contact.id),
          eq(contactTopic.topicId, filter.topicId),
          eq(contactTopic.status, "subscribed")
        )
      );
    baseConditions.push(exists(topicSubquery));
  } else if (filter?.audienceType === "segment" && filter.segmentId) {
    // Fetch segment and apply its condition
    const seg = await db.query.segment.findFirst({
      where: (s, { and, eq }) =>
        and(eq(s.id, filter.segmentId!), eq(s.organizationId, organizationId)),
    });

    if (seg?.condition) {
      const segmentSQL = buildConditionSQL(seg.condition);
      if (segmentSQL) {
        baseConditions.push(segmentSQL);
      }
    }
  }

  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contact)
    .where(and(...baseConditions));

  return result?.count ?? 0;
}

/**
 * Get recipient preview count for batch send form
 */
export async function getRecipientCount(
  organizationId: string,
  channel: Channel = "email",
  filter?: RecipientFilter
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

    const count = await countRecipients(organizationId, channel, filter);
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

/**
 * List topics for batch send recipient selection
 */
export async function listTopicsForBatch(organizationId: string): Promise<
  | {
      success: true;
      topics: Array<{ id: string; name: string; subscriberCount: number }>;
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

    const topics = await db.query.topic.findMany({
      where: (t, { eq }) => eq(t.organizationId, organizationId),
      columns: {
        id: true,
        name: true,
        subscriberCount: true,
      },
      orderBy: (t, { desc }) => [desc(t.subscriberCount)],
    });

    return {
      success: true,
      topics: topics.map((t) => ({
        id: t.id,
        name: t.name,
        subscriberCount: t.subscriberCount,
      })),
    };
  } catch (error) {
    const log = createActionLogger("listTopicsForBatch", {
      orgSlug: organizationId,
    });
    log.error({ err: serializeError(error) }, "Failed to list topics");
    return { success: false, error: "Failed to fetch topics" };
  }
}

/**
 * List segments for batch send recipient selection
 */
export async function listSegmentsForBatch(organizationId: string): Promise<
  | {
      success: true;
      segments: Array<{ id: string; name: string; memberCount: number }>;
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

    const segments = await db.query.segment.findMany({
      where: (s, { eq }) => eq(s.organizationId, organizationId),
      columns: {
        id: true,
        name: true,
        memberCount: true,
      },
      orderBy: (s, { desc }) => [desc(s.memberCount)],
    });

    return {
      success: true,
      segments: segments.map((s) => ({
        id: s.id,
        name: s.name,
        memberCount: s.memberCount,
      })),
    };
  } catch (error) {
    const log = createActionLogger("listSegmentsForBatch", {
      orgSlug: organizationId,
    });
    log.error({ err: serializeError(error) }, "Failed to list segments");
    return { success: false, error: "Failed to fetch segments" };
  }
}
