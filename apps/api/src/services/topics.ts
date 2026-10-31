/**
 * Topic CRUD and subscriber listing for the public API.
 *
 * Lifted from `apps/web/src/actions/topics.ts`. The dashboard action is
 * Next-only (`revalidatePath`, `orgAction`, `getAuditContext` reads `headers()`),
 * so the query and audit logic is copied here instead of imported. Behaviour
 * (validation text, slug rules, audit actions, count joins) matches the action.
 *
 * Every query is scoped by `organizationId`, including lookups by id.
 */

import {
  auditLog,
  contact,
  contactTopic,
  countTopicAudience,
  db,
  topic,
  user,
} from "@wraps/db";
import { and, asc, desc, eq, ne, sql } from "drizzle-orm";

export type ServiceFailure = {
  ok: false;
  status: 400 | 404 | 409;
  error: string;
};

export type ServiceResult<T> = { ok: true; value: T } | ServiceFailure;

export type TopicView = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  public: boolean;
  doubleOptIn: boolean;
  subscriberCount: number;
  sendableCount: number;
  pendingCount: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: { id: string; name: string; email: string } | null;
};

export type SubscriberStatus = "subscribed" | "pending" | "unsubscribed";

export type TopicSubscriberView = {
  contactId: string;
  email: string;
  status: string;
  subscribedAt: Date | null;
  unsubscribedAt: Date | null;
};

export type CreateTopicInput = {
  name: string;
  slug?: string;
  description?: string;
  public?: boolean;
  doubleOptIn?: boolean;
};

export type UpdateTopicInput = {
  name?: string;
  slug?: string;
  description?: string | null;
  public?: boolean;
  doubleOptIn?: boolean;
};

/** The person behind the request. Mutations are audited against this. */
export type TopicActor = {
  /** For an API key, its creator (null once gone). */
  userId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
};

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const CREATOR_COLUMNS = { id: true, name: true, email: true } as const;

function fail(status: ServiceFailure["status"], error: string): ServiceFailure {
  return { ok: false, status, error };
}

/** Copied from `apps/web/src/lib/topics.ts` (`generateSlug`). */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function toView(
  t: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    public: boolean;
    doubleOptIn: boolean;
    createdAt: Date;
    updatedAt: Date;
    createdByUser: { id: string; name: string; email: string } | null;
  },
  audience:
    | { subscribed: number; sendable: number; pending: number }
    | undefined
): TopicView {
  return {
    id: t.id,
    name: t.name,
    slug: t.slug,
    description: t.description,
    public: t.public,
    doubleOptIn: t.doubleOptIn,
    subscriberCount: audience?.subscribed ?? 0,
    sendableCount: audience?.sendable ?? 0,
    pendingCount: audience?.pending ?? 0,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    createdBy: t.createdByUser,
  };
}

async function actorEmail(userId: string | null): Promise<string | null> {
  if (!userId) {
    return null;
  }
  const [row] = await db
    .select({ email: user.email })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return row?.email ?? null;
}

/**
 * Runs `fn` and the audit-log insert in one transaction, the same as the
 * dashboard's `ctx.audited`. A failed mutation leaves no audit row.
 */
async function audited<T>(
  organizationId: string,
  actor: TopicActor,
  fn: (tx: DbTransaction) => Promise<T>,
  fields: (result: T) => {
    action: string;
    resource: string;
    resourceId: string | null;
    metadata: Record<string, unknown>;
  }
): Promise<T> {
  const email = await actorEmail(actor.userId);
  return db.transaction(async (tx) => {
    const result = await fn(tx);
    const entry = fields(result);
    await tx.insert(auditLog).values({
      organizationId,
      userId: actor.userId,
      actorEmail: email,
      action: entry.action,
      resource: entry.resource,
      resourceId: entry.resourceId,
      metadata: entry.metadata,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });
    return result;
  });
}

export async function listTopicsForOrg(
  organizationId: string
): Promise<TopicView[]> {
  const topics = await db.query.topic.findMany({
    where: (t, { eq }) => eq(t.organizationId, organizationId),
    with: { createdByUser: { columns: CREATOR_COLUMNS } },
    orderBy: [desc(topic.createdAt)],
  });

  const audience = await countTopicAudience(
    organizationId,
    topics.map((t) => t.id)
  );

  return topics.map((t) => toView(t, audience.get(t.id)));
}

export async function getTopicForOrg(
  organizationId: string,
  topicId: string
): Promise<TopicView | null> {
  const t = await db.query.topic.findFirst({
    where: (tp, { and, eq }) =>
      and(eq(tp.id, topicId), eq(tp.organizationId, organizationId)),
    with: { createdByUser: { columns: CREATOR_COLUMNS } },
  });
  if (!t) {
    return null;
  }

  const audience = (await countTopicAudience(organizationId, [topicId])).get(
    topicId
  );
  return toView(t, audience);
}

export async function createTopicForOrg(
  organizationId: string,
  actor: TopicActor,
  data: CreateTopicInput
): Promise<ServiceResult<TopicView>> {
  if (!data.name || data.name.trim().length < 1) {
    return fail(400, "Topic name is required");
  }

  const slug = data.slug
    ? data.slug.toLowerCase().trim()
    : generateSlug(data.name);
  if (!slug || slug.length < 1) {
    return fail(400, "Invalid topic slug");
  }

  const existing = await db.query.topic.findFirst({
    where: (t, { and, eq }) =>
      and(eq(t.organizationId, organizationId), eq(t.slug, slug)),
  });
  if (existing) {
    return fail(409, "A topic with this slug already exists");
  }

  const created = await audited(
    organizationId,
    actor,
    async (tx) => {
      const [r] = await tx
        .insert(topic)
        .values({
          organizationId,
          name: data.name.trim(),
          slug,
          description: data.description?.trim() || null,
          public: data.public ?? true,
          doubleOptIn: data.doubleOptIn ?? false,
          createdBy: actor.userId,
        })
        .returning();
      return r;
    },
    (r) => ({
      action: "topic.created",
      resource: "topic",
      resourceId: r.id,
      metadata: { topicId: r.id, name: r.name, slug: r.slug },
    })
  );

  const view = await getTopicForOrg(organizationId, created.id);
  if (!view) {
    return fail(404, "Topic not found");
  }
  return { ok: true, value: view };
}

export async function updateTopicForOrg(
  organizationId: string,
  actor: TopicActor,
  topicId: string,
  data: UpdateTopicInput
): Promise<ServiceResult<TopicView>> {
  const existing = await db.query.topic.findFirst({
    where: (t, { and, eq }) =>
      and(eq(t.id, topicId), eq(t.organizationId, organizationId)),
  });
  if (!existing) {
    return fail(404, "Topic not found");
  }

  const updateData: Partial<typeof topic.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (data.name !== undefined) {
    if (!data.name || data.name.trim().length < 1) {
      return fail(400, "Topic name is required");
    }
    updateData.name = data.name.trim();
  }

  if (data.slug !== undefined) {
    const slug = data.slug.toLowerCase().trim();
    if (!slug || slug.length < 1) {
      return fail(400, "Invalid topic slug");
    }

    const duplicate = await db.query.topic.findFirst({
      where: (t, { and, eq }) =>
        and(
          eq(t.organizationId, organizationId),
          eq(t.slug, slug),
          ne(t.id, topicId)
        ),
    });
    if (duplicate) {
      return fail(409, "A topic with this slug already exists");
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

  await audited(
    organizationId,
    actor,
    async (tx) => {
      await tx
        .update(topic)
        .set(updateData)
        .where(
          and(eq(topic.id, topicId), eq(topic.organizationId, organizationId))
        );
    },
    () => ({
      action: "topic.updated",
      resource: "topic",
      resourceId: topicId,
      metadata: { topicId, name: updateData.name ?? existing.name },
    })
  );

  const view = await getTopicForOrg(organizationId, topicId);
  if (!view) {
    return fail(404, "Topic not found");
  }
  return { ok: true, value: view };
}

/**
 * Deletes a topic. Subscriptions cascade (`contact_topic`). The route is
 * responsible for the `confirm=true` gate; this function does not check it.
 */
export async function deleteTopicForOrg(
  organizationId: string,
  actor: TopicActor,
  topicId: string
): Promise<ServiceResult<{ success: true }>> {
  const existing = await db.query.topic.findFirst({
    where: (t, { and, eq }) =>
      and(eq(t.id, topicId), eq(t.organizationId, organizationId)),
  });
  if (!existing) {
    return fail(404, "Topic not found");
  }

  await audited(
    organizationId,
    actor,
    async (tx) => {
      await tx
        .delete(topic)
        .where(
          and(eq(topic.id, topicId), eq(topic.organizationId, organizationId))
        );
    },
    () => ({
      action: "topic.deleted",
      resource: "topic",
      resourceId: topicId,
      metadata: { topicId },
    })
  );

  return { ok: true, value: { success: true } };
}

export async function listTopicSubscribersForOrg(
  organizationId: string,
  topicId: string,
  options: { page: number; pageSize: number; status?: SubscriberStatus }
): Promise<
  ServiceResult<{
    subscribers: TopicSubscriberView[];
    total: number;
    page: number;
    pageSize: number;
  }>
> {
  const { page, pageSize, status } = options;
  const offset = (page - 1) * pageSize;

  const topicExists = await db.query.topic.findFirst({
    where: (t, { and, eq }) =>
      and(eq(t.id, topicId), eq(t.organizationId, organizationId)),
  });
  if (!topicExists) {
    return fail(404, "Topic not found");
  }

  // The contact join carries the org filter as well as the topic check above,
  // so a subscription row can never surface a contact from another org.
  const conditions = [
    eq(contactTopic.topicId, topicId),
    eq(contact.organizationId, organizationId),
  ];
  if (status) {
    conditions.push(eq(contactTopic.status, status));
  }

  const [totalResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contactTopic)
    .innerJoin(contact, eq(contact.id, contactTopic.contactId))
    .where(and(...conditions));
  const total = totalResult?.count ?? 0;

  const rows = await db
    .select({
      contactId: contact.id,
      email: contact.email,
      status: contactTopic.status,
      subscribedAt: contactTopic.subscribedAt,
      unsubscribedAt: contactTopic.unsubscribedAt,
    })
    .from(contactTopic)
    .innerJoin(contact, eq(contact.id, contactTopic.contactId))
    .where(and(...conditions))
    // Deterministic page order: subscribe time, then contact id as the
    // tie-break (the (contactId, topicId) primary key makes contactId unique
    // within one topic). Without this, rows can repeat or be skipped across pages.
    .orderBy(asc(contactTopic.subscribedAt), asc(contactTopic.contactId))
    .limit(pageSize)
    .offset(offset);

  return {
    ok: true,
    value: {
      subscribers: rows.map((r) => ({
        contactId: r.contactId,
        email: r.email || "",
        status: r.status,
        subscribedAt: r.subscribedAt,
        unsubscribedAt: r.unsubscribedAt,
      })),
      total,
      page,
      pageSize,
    },
  };
}
