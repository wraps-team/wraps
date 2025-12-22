"use server";

import { auth } from "@wraps/auth";
import { contactTopic, db, topic } from "@wraps/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createActionLogger, serializeError } from "@/lib/logger";
import { checkFeatureAccess } from "@/lib/plan-limits";
import {
  type CreateTopicResult,
  type DeleteTopicResult,
  type GetTopicResult,
  generateSlug,
  type ListTopicsResult,
  type UpdateTopicResult,
} from "@/lib/topics";

// Re-export types for convenience
export type {
  CreateTopicResult,
  DeleteTopicResult,
  GetTopicResult,
  ListTopicsResult,
  TopicWithMeta,
  UpdateTopicResult,
} from "@/lib/topics";

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
 * List all topics for an organization
 */
export async function listTopics(
  organizationId: string
): Promise<ListTopicsResult> {
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
      with: {
        createdByUser: {
          columns: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: [desc(topic.createdAt)],
    });

    return {
      success: true,
      topics: topics.map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        description: t.description,
        public: t.public,
        doubleOptIn: t.doubleOptIn,
        subscriberCount: t.subscriberCount,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        createdBy: t.createdByUser,
      })),
    };
  } catch (error) {
    const log = createActionLogger("listTopics", { orgSlug: organizationId });
    log.error({ err: serializeError(error) }, "Failed to list topics");
    return { success: false, error: "Failed to fetch topics" };
  }
}

/**
 * Get a single topic by ID
 */
export async function getTopic(
  topicId: string,
  organizationId: string
): Promise<GetTopicResult> {
  try {
    const access = await verifyOrgAccess(organizationId);
    if (!access) {
      return {
        success: false,
        error: "You don't have access to this organization",
      };
    }

    const t = await db.query.topic.findFirst({
      where: (topic, { and, eq }) =>
        and(eq(topic.id, topicId), eq(topic.organizationId, organizationId)),
      with: {
        createdByUser: {
          columns: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!t) {
      return { success: false, error: "Topic not found" };
    }

    return {
      success: true,
      topic: {
        id: t.id,
        name: t.name,
        slug: t.slug,
        description: t.description,
        public: t.public,
        doubleOptIn: t.doubleOptIn,
        subscriberCount: t.subscriberCount,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        createdBy: t.createdByUser,
      },
    };
  } catch (error) {
    const log = createActionLogger("getTopic", { orgSlug: organizationId });
    log.error({ err: serializeError(error), topicId }, "Failed to get topic");
    return { success: false, error: "Failed to fetch topic" };
  }
}

/**
 * Create a new topic
 */
export async function createTopic(
  organizationId: string,
  data: {
    name: string;
    slug?: string;
    description?: string;
    public?: boolean;
    doubleOptIn?: boolean;
  }
): Promise<CreateTopicResult> {
  try {
    const access = await verifyOrgAccess(organizationId);
    if (!access) {
      return {
        success: false,
        error: "You don't have access to this organization",
      };
    }

    // Only owners and admins can create topics
    if (!["owner", "admin"].includes(access.role)) {
      return {
        success: false,
        error: "Only owners and admins can create topics",
      };
    }

    // Check if topics feature is available for this plan
    const featureCheck = await checkFeatureAccess(organizationId, "topics");
    if (!featureCheck.allowed) {
      return {
        success: false,
        error: featureCheck.message ?? "Topics require a Pro plan or higher.",
      };
    }

    // Validate name
    if (!data.name || data.name.trim().length < 1) {
      return { success: false, error: "Topic name is required" };
    }

    // Generate or validate slug
    const slug = data.slug
      ? data.slug.toLowerCase().trim()
      : generateSlug(data.name);

    if (!slug || slug.length < 1) {
      return { success: false, error: "Invalid topic slug" };
    }

    // Check for duplicate slug
    const existing = await db.query.topic.findFirst({
      where: (t, { and, eq }) =>
        and(eq(t.organizationId, organizationId), eq(t.slug, slug)),
    });

    if (existing) {
      return { success: false, error: "A topic with this slug already exists" };
    }

    // Create topic
    const [newTopic] = await db
      .insert(topic)
      .values({
        organizationId,
        name: data.name.trim(),
        slug,
        description: data.description?.trim() || null,
        public: data.public ?? true,
        doubleOptIn: data.doubleOptIn ?? false,
        createdBy: access.userId,
      })
      .returning();

    if (!newTopic) {
      return { success: false, error: "Failed to create topic" };
    }

    // Revalidate
    revalidatePath("/[orgSlug]/topics", "page");

    // Return the created topic
    return await getTopic(newTopic.id, organizationId);
  } catch (error) {
    const log = createActionLogger("createTopic", { orgSlug: organizationId });
    log.error({ err: serializeError(error) }, "Failed to create topic");
    return { success: false, error: "Failed to create topic" };
  }
}

/**
 * Update a topic
 */
export async function updateTopic(
  topicId: string,
  organizationId: string,
  data: {
    name?: string;
    slug?: string;
    description?: string | null;
    public?: boolean;
    doubleOptIn?: boolean;
  }
): Promise<UpdateTopicResult> {
  try {
    const access = await verifyOrgAccess(organizationId);
    if (!access) {
      return {
        success: false,
        error: "You don't have access to this organization",
      };
    }

    // Only owners and admins can update topics
    if (!["owner", "admin"].includes(access.role)) {
      return {
        success: false,
        error: "Only owners and admins can update topics",
      };
    }

    // Verify topic exists
    const existing = await db.query.topic.findFirst({
      where: (t, { and, eq }) =>
        and(eq(t.id, topicId), eq(t.organizationId, organizationId)),
    });

    if (!existing) {
      return { success: false, error: "Topic not found" };
    }

    // Build update data
    const updateData: Partial<typeof topic.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (data.name !== undefined) {
      if (!data.name || data.name.trim().length < 1) {
        return { success: false, error: "Topic name is required" };
      }
      updateData.name = data.name.trim();
    }

    if (data.slug !== undefined) {
      const slug = data.slug.toLowerCase().trim();
      if (!slug || slug.length < 1) {
        return { success: false, error: "Invalid topic slug" };
      }

      // Check for duplicate slug (excluding current topic)
      const duplicate = await db.query.topic.findFirst({
        where: (t, { and, eq, ne }) =>
          and(
            eq(t.organizationId, organizationId),
            eq(t.slug, slug),
            ne(t.id, topicId)
          ),
      });

      if (duplicate) {
        return {
          success: false,
          error: "A topic with this slug already exists",
        };
      }

      updateData.slug = slug;
    }

    if (data.description !== undefined) {
      updateData.description = data.description?.trim() || null;
    }

    if (data.public !== undefined) {
      updateData.public = data.public;
    }

    if (data.doubleOptIn !== undefined) {
      updateData.doubleOptIn = data.doubleOptIn;
    }

    // Update topic
    await db
      .update(topic)
      .set(updateData)
      .where(
        and(eq(topic.id, topicId), eq(topic.organizationId, organizationId))
      );

    // Revalidate
    revalidatePath("/[orgSlug]/topics", "page");

    // Return updated topic
    return await getTopic(topicId, organizationId);
  } catch (error) {
    const log = createActionLogger("updateTopic", { orgSlug: organizationId });
    log.error(
      { err: serializeError(error), topicId },
      "Failed to update topic"
    );
    return { success: false, error: "Failed to update topic" };
  }
}

/**
 * Delete a topic
 */
export async function deleteTopic(
  topicId: string,
  organizationId: string
): Promise<DeleteTopicResult> {
  try {
    const access = await verifyOrgAccess(organizationId);
    if (!access) {
      return {
        success: false,
        error: "You don't have access to this organization",
      };
    }

    // Only owners and admins can delete topics
    if (!["owner", "admin"].includes(access.role)) {
      return {
        success: false,
        error: "Only owners and admins can delete topics",
      };
    }

    // Verify topic exists
    const existing = await db.query.topic.findFirst({
      where: (t, { and, eq }) =>
        and(eq(t.id, topicId), eq(t.organizationId, organizationId)),
    });

    if (!existing) {
      return { success: false, error: "Topic not found" };
    }

    // Delete topic (cascades to contact_topic)
    await db
      .delete(topic)
      .where(
        and(eq(topic.id, topicId), eq(topic.organizationId, organizationId))
      );

    // Revalidate
    revalidatePath("/[orgSlug]/topics", "page");

    return { success: true };
  } catch (error) {
    const log = createActionLogger("deleteTopic", { orgSlug: organizationId });
    log.error(
      { err: serializeError(error), topicId },
      "Failed to delete topic"
    );
    return { success: false, error: "Failed to delete topic" };
  }
}

/**
 * Get topic subscribers (paginated)
 */
export async function getTopicSubscribers(
  topicId: string,
  organizationId: string,
  options: {
    page?: number;
    pageSize?: number;
    status?: "subscribed" | "unsubscribed";
  } = {}
): Promise<{
  success: boolean;
  subscribers?: Array<{
    contactId: string;
    email: string;
    status: string;
    subscribedAt: Date | null;
    unsubscribedAt: Date | null;
  }>;
  total?: number;
  page?: number;
  pageSize?: number;
  error?: string;
}> {
  try {
    const access = await verifyOrgAccess(organizationId);
    if (!access) {
      return {
        success: false,
        error: "You don't have access to this organization",
      };
    }

    const { page = 1, pageSize = 50, status } = options;
    const offset = (page - 1) * pageSize;

    // Verify topic exists and belongs to org
    const topicExists = await db.query.topic.findFirst({
      where: (t, { and, eq }) =>
        and(eq(t.id, topicId), eq(t.organizationId, organizationId)),
    });

    if (!topicExists) {
      return { success: false, error: "Topic not found" };
    }

    // Build where conditions
    const conditions = [eq(contactTopic.topicId, topicId)];
    if (status) {
      conditions.push(eq(contactTopic.status, status));
    }

    // Get total count
    const [totalResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(contactTopic)
      .where(and(...conditions));

    const total = totalResult?.count ?? 0;

    // Get subscribers with contact info
    const subscribers = await db.query.contactTopic.findMany({
      where: and(...conditions),
      with: {
        contact: {
          columns: {
            id: true,
            email: true,
          },
        },
      },
      limit: pageSize,
      offset,
    });

    return {
      success: true,
      subscribers: subscribers.map((s) => ({
        contactId: s.contact.id,
        email: s.contact.email,
        status: s.status,
        subscribedAt: s.subscribedAt,
        unsubscribedAt: s.unsubscribedAt,
      })),
      total,
      page,
      pageSize,
    };
  } catch (error) {
    const log = createActionLogger("getTopicSubscribers", {
      orgSlug: organizationId,
    });
    log.error(
      { err: serializeError(error), topicId },
      "Failed to get topic subscribers"
    );
    return { success: false, error: "Failed to fetch subscribers" };
  }
}
