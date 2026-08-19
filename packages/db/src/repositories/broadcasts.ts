import {
  and,
  desc,
  eq,
  exists,
  inArray,
  isNotNull,
  lte,
  type SQL,
  sql,
} from "drizzle-orm";
import { db } from "../index";
import { awsAccount } from "../schema/app";
import {
  batchSend,
  type Channel,
  MESSAGE_SEND_UNACCEPTED_STATUSES,
  messageSend,
} from "../schema/batch";
import { contact, contactTopic } from "../schema/contacts";
import { template } from "../schema/templates";
import { buildConditionSQL } from "../segment-filter";

type DrizzleTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type DbClient = typeof db | DrizzleTransaction;

export type BroadcastRecord = typeof batchSend.$inferSelect;
export type BroadcastInsert = typeof batchSend.$inferInsert;

export type BroadcastRecipientFilter = {
  audienceType?: "all" | "topic" | "segment";
  topicId?: string;
  segmentId?: string;
  /** Upper bound on contact.createdAt — the broadcast's audience snapshot. */
  createdBefore?: Date;
};

// ── AWS Account ──────────────────────────────────────────────────────────────

export async function findAwsAccountForOrg(
  awsAccountId: string,
  organizationId: string,
  dbClient: DbClient = db
): Promise<{
  id: string;
  dailyQuotaReserve: number | null;
  roleArn: string;
  externalId: string;
  region: string;
} | null> {
  const [result] = await dbClient
    .select({
      id: awsAccount.id,
      dailyQuotaReserve: awsAccount.dailyQuotaReserve,
      roleArn: awsAccount.roleArn,
      externalId: awsAccount.externalId,
      region: awsAccount.region,
    })
    .from(awsAccount)
    .where(
      and(
        eq(awsAccount.id, awsAccountId),
        eq(awsAccount.organizationId, organizationId)
      )
    )
    .limit(1);
  return result ?? null;
}

// ── Broadcast reads ──────────────────────────────────────────────────────────

export async function findBroadcast(
  id: string,
  organizationId: string,
  dbClient: DbClient = db
): Promise<BroadcastRecord | null> {
  const [result] = await dbClient
    .select()
    .from(batchSend)
    .where(
      and(eq(batchSend.id, id), eq(batchSend.organizationId, organizationId))
    )
    .limit(1);
  return result ?? null;
}

export async function findBroadcastStatus(
  id: string,
  organizationId: string,
  dbClient: DbClient = db
): Promise<{ id: string; status: BroadcastRecord["status"] } | null> {
  const result = await dbClient.query.batchSend.findFirst({
    where: and(
      eq(batchSend.id, id),
      eq(batchSend.organizationId, organizationId)
    ),
    columns: { id: true, status: true },
  });
  return result ?? null;
}

export async function findDraftBroadcast(
  id: string,
  organizationId: string,
  dbClient: DbClient = db
): Promise<BroadcastRecord | null> {
  const result = await dbClient.query.batchSend.findFirst({
    where: and(
      eq(batchSend.id, id),
      eq(batchSend.organizationId, organizationId),
      eq(batchSend.status, "draft")
    ),
  });
  return result ?? null;
}

export async function findBroadcastWithMeta(
  id: string,
  organizationId: string,
  dbClient: DbClient = db
) {
  return dbClient.query.batchSend.findFirst({
    where: and(
      eq(batchSend.id, id),
      eq(batchSend.organizationId, organizationId)
    ),
    with: {
      createdByUser: { columns: { id: true, name: true, email: true } },
      awsAccount: { columns: { id: true, name: true, region: true } },
      emailTemplate: { columns: { id: true, name: true } },
    },
  });
}

export type BroadcastWithMeta = NonNullable<
  Awaited<ReturnType<typeof findBroadcastWithMeta>>
>;

export type BroadcastSendOutcomes = {
  total: number;
  accepted: number;
  failed: number;
};

/**
 * Derive send outcomes from message_send row statuses instead of the
 * batch_send counters. The counters are monotonic increments written
 * mid-send and never reconciled — a bookkeeping error can leave them
 * permanently wrong, while row statuses self-heal as SES events arrive.
 * `accepted` counts every status that means SES took the message
 * ('failed' and the pre-send statuses are the only exclusions).
 * `total` is 0 for broadcasts that predate per-message rows — callers
 * should fall back to the counters in that case.
 */
export async function getBroadcastSendOutcomes(
  batchId: string,
  organizationId: string,
  dbClient: DbClient = db
): Promise<BroadcastSendOutcomes> {
  const unaccepted = sql.raw(
    MESSAGE_SEND_UNACCEPTED_STATUSES.map((s) => `'${s}'`).join(", ")
  );
  const [result] = await dbClient
    .select({
      total: sql<number>`count(*)::int`,
      accepted: sql<number>`count(*) filter (where ${messageSend.status} not in (${unaccepted}))::int`,
      failed: sql<number>`count(*) filter (where ${messageSend.status} = 'failed')::int`,
    })
    .from(messageSend)
    .where(
      and(
        eq(messageSend.batchSendId, batchId),
        eq(messageSend.organizationId, organizationId)
      )
    );
  return result ?? { total: 0, accepted: 0, failed: 0 };
}

export const MAX_RECIPIENT_EXPORT_ROWS = 50_000;

export type BroadcastRecipientRow = {
  id: string;
  recipient: string;
  status: string;
  error: string | null;
  bounceType: string | null;
  bounceSubType: string | null;
  sentAt: Date | null;
  createdAt: Date;
};

/**
 * Per-recipient outcomes for one broadcast. Scoped by BOTH batchSendId and
 * organizationId — never by batch id alone. Backed by the existing
 * message_send_status_idx (batch_send_id, status) index.
 */
export async function listBroadcastRecipients(
  batchId: string,
  organizationId: string,
  options: { status?: string; limit?: number; offset?: number } = {},
  dbClient: DbClient = db
): Promise<{ rows: BroadcastRecipientRow[]; total: number }> {
  const limit = Math.min(options.limit ?? 50, MAX_RECIPIENT_EXPORT_ROWS);
  const offset = Math.max(0, options.offset ?? 0);

  const conditions = [
    eq(messageSend.batchSendId, batchId),
    eq(messageSend.organizationId, organizationId),
  ];
  if (options.status) {
    conditions.push(eq(messageSend.status, options.status as never));
  }

  const [totalResult] = await dbClient
    .select({ count: sql<number>`count(*)::int` })
    .from(messageSend)
    .where(and(...conditions));

  const rows = await dbClient
    .select({
      id: messageSend.id,
      recipient: messageSend.recipient,
      status: messageSend.status,
      error: messageSend.error,
      bounceType: messageSend.bounceType,
      bounceSubType: messageSend.bounceSubType,
      sentAt: messageSend.sentAt,
      createdAt: messageSend.createdAt,
    })
    .from(messageSend)
    .where(and(...conditions))
    .orderBy(desc(messageSend.createdAt), desc(messageSend.id))
    .limit(limit)
    .offset(offset);

  return { rows, total: totalResult?.count ?? 0 };
}

export async function listBroadcasts(
  organizationId: string,
  options: {
    page?: number;
    pageSize?: number;
    status?: BroadcastRecord["status"];
    channel?: Channel;
  },
  dbClient: DbClient = db
): Promise<{ batches: BroadcastWithMeta[]; total: number }> {
  const { page = 1, pageSize = 20, status, channel } = options;
  const offset = (page - 1) * pageSize;

  const conditions = [eq(batchSend.organizationId, organizationId)];
  if (status) conditions.push(eq(batchSend.status, status));
  if (channel) conditions.push(eq(batchSend.channel, channel));

  const [totalResult] = await dbClient
    .select({ count: sql<number>`count(*)::int` })
    .from(batchSend)
    .where(and(...conditions));

  const total = totalResult?.count ?? 0;

  const batches = await dbClient.query.batchSend.findMany({
    where: and(...conditions),
    with: {
      createdByUser: { columns: { id: true, name: true, email: true } },
      awsAccount: { columns: { id: true, name: true, region: true } },
      emailTemplate: { columns: { id: true, name: true } },
    },
    orderBy: [desc(batchSend.createdAt)],
    limit: pageSize,
    offset,
  });

  return { batches, total };
}

// ── Broadcast writes ─────────────────────────────────────────────────────────

export async function createBroadcast(
  data: BroadcastInsert,
  dbClient: DbClient = db
): Promise<BroadcastRecord> {
  const [result] = await dbClient.insert(batchSend).values(data).returning();
  return result;
}

export async function promoteBroadcast(
  id: string,
  organizationId: string,
  data: Partial<BroadcastInsert>,
  dbClient: DbClient = db
): Promise<BroadcastRecord | null> {
  const [result] = await dbClient
    .update(batchSend)
    .set({ ...data, updatedAt: new Date() })
    .where(
      and(
        eq(batchSend.id, id),
        eq(batchSend.organizationId, organizationId),
        eq(batchSend.status, "draft")
      )
    )
    .returning();
  return result ?? null;
}

export async function cancelBroadcast(
  id: string,
  organizationId: string,
  dbClient: DbClient = db
): Promise<void> {
  await dbClient
    .update(batchSend)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(
      and(eq(batchSend.id, id), eq(batchSend.organizationId, organizationId))
    );
}

export async function insertDraftBroadcast(
  data: BroadcastInsert,
  dbClient: DbClient = db
): Promise<BroadcastRecord | null> {
  const [result] = await dbClient.insert(batchSend).values(data).returning();
  return result ?? null;
}

export async function updateDraftBroadcast(
  id: string,
  organizationId: string,
  data: Partial<BroadcastInsert>,
  dbClient: DbClient = db
): Promise<void> {
  await dbClient
    .update(batchSend)
    .set({ ...data, updatedAt: new Date() })
    .where(
      and(
        eq(batchSend.id, id),
        eq(batchSend.organizationId, organizationId),
        eq(batchSend.status, "draft")
      )
    );
}

export async function deleteDraftBroadcast(
  id: string,
  organizationId: string,
  dbClient: DbClient = db
): Promise<{ id: string }[]> {
  return dbClient
    .delete(batchSend)
    .where(
      and(
        eq(batchSend.id, id),
        eq(batchSend.organizationId, organizationId),
        eq(batchSend.status, "draft")
      )
    )
    .returning({ id: batchSend.id });
}

export async function duplicateBroadcast(
  source: BroadcastRecord,
  organizationId: string,
  createdBy: string,
  dbClient: DbClient = db
): Promise<BroadcastRecord | null> {
  const [result] = await dbClient
    .insert(batchSend)
    .values({
      organizationId,
      status: "draft",
      channel: source.channel,
      name: `${source.name ?? "Untitled broadcast"} (copy)`,
      subject: source.subject,
      previewText: source.previewText,
      from: source.from,
      fromName: source.fromName,
      replyTo: source.replyTo,
      emailTemplateId: source.emailTemplateId,
      htmlContent: source.htmlContent,
      textContent: source.textContent,
      variableMappings: source.variableMappings,
      body: source.body,
      senderId: source.senderId,
      audienceType: source.audienceType ?? "all",
      topicId: source.topicId,
      segmentId: source.segmentId,
      awsAccountId: source.awsAccountId,
      createdBy,
    })
    .returning();
  return result ?? null;
}

// ── Recipient counting ───────────────────────────────────────────────────────

export type SegmentUsability = "ok" | "missing" | "no-valid-filters";

/**
 * Why a segment-targeted broadcast resolved to nobody. Recipient counting fails
 * closed, so an unusable segment is indistinguishable from an empty one by
 * count alone — call this to tell the user which it was.
 */
export async function checkSegmentUsable(
  organizationId: string,
  segmentId: string,
  dbClient: DbClient = db
): Promise<SegmentUsability> {
  const seg = await dbClient.query.segment.findFirst({
    where: (s, { and: a, eq: e }) =>
      a(e(s.id, segmentId), e(s.organizationId, organizationId)),
  });
  if (!seg) {
    return "missing";
  }
  return buildConditionSQL(seg.condition) ? "ok" : "no-valid-filters";
}

async function buildRecipientConditions(
  organizationId: string,
  channel: Channel,
  filter?: BroadcastRecipientFilter,
  dbClient: DbClient = db
): Promise<SQL[]> {
  const conditions: SQL[] = [eq(contact.organizationId, organizationId)];

  if (channel === "email") {
    conditions.push(isNotNull(contact.email));
    conditions.push(
      sql`(${contact.emailStatus} = 'active' OR ${contact.emailStatus} IS NULL)`
    );
  } else {
    conditions.push(isNotNull(contact.phone));
    conditions.push(eq(contact.smsStatus, "opted_in" as never));
  }

  if (filter?.createdBefore) {
    conditions.push(lte(contact.createdAt, filter.createdBefore));
  }

  if (filter?.audienceType === "topic" && filter.topicId) {
    const topicSubquery = dbClient
      .select({ contactId: contactTopic.contactId })
      .from(contactTopic)
      .where(
        and(
          eq(contactTopic.contactId, contact.id),
          eq(contactTopic.topicId, filter.topicId),
          eq(contactTopic.status, "subscribed")
        )
      );
    conditions.push(exists(topicSubquery));
  } else if (filter?.audienceType === "segment" && filter.segmentId) {
    const seg = await dbClient.query.segment.findFirst({
      where: (s, { and: a, eq: e }) =>
        a(e(s.id, filter.segmentId!), e(s.organizationId, organizationId)),
    });
    const segmentSQL = seg?.condition ? buildConditionSQL(seg.condition) : null;
    // Fail closed. A deleted segment, or one whose filters compile to no SQL
    // (an operator this build doesn't know, e.g. after a rollback), must match
    // nobody — falling through would silently target the entire organization.
    conditions.push(segmentSQL ?? sql`FALSE`);
  }

  return conditions;
}

export async function countBroadcastRecipients(
  organizationId: string,
  channel: Channel,
  filter?: BroadcastRecipientFilter,
  dbClient: DbClient = db
): Promise<number> {
  const conditions = await buildRecipientConditions(
    organizationId,
    channel,
    filter,
    dbClient
  );

  const [result] = await dbClient
    .select({ count: sql<number>`count(*)::int` })
    .from(contact)
    .where(and(...conditions));

  return result?.count ?? 0;
}

/**
 * Sums the recipients still unsent across broadcasts already in flight on the
 * same AWS account — the work a newly created broadcast has to share the SES
 * daily quota with.
 *
 * `queued` and `processing` only: `draft`/`scheduled` have not been admitted,
 * and `completed`/`failed`/`cancelled` are done. A broadcast paused on the
 * quota reserve is still `processing` (there is no `paused` status), which is
 * precisely the contention this measures.
 *
 * Counts the REMAINDER (`total − processed`), not the total: whatever a
 * running broadcast has already sent is already inside SES's
 * `SentLast24Hours`, so counting it again would double-charge it.
 */
export async function sumInFlightBroadcastRecipients(
  organizationId: string,
  awsAccountId: string,
  dbClient: DbClient = db
): Promise<{ batches: number; remainingRecipients: number }> {
  const [result] = await dbClient
    .select({
      batches: sql<number>`count(*)::int`,
      remainingRecipients: sql<number>`coalesce(sum(greatest(${batchSend.totalRecipients} - ${batchSend.processedRecipients}, 0)), 0)::int`,
    })
    .from(batchSend)
    .where(
      and(
        eq(batchSend.organizationId, organizationId),
        eq(batchSend.awsAccountId, awsAccountId),
        eq(batchSend.channel, "email"),
        inArray(batchSend.status, ["queued", "processing"])
      )
    );

  return {
    batches: result?.batches ?? 0,
    remainingRecipients: result?.remainingRecipients ?? 0,
  };
}

export type SampleRecipient = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
};

export async function getSampleBroadcastRecipients(
  organizationId: string,
  channel: Channel,
  filter?: BroadcastRecipientFilter,
  limit = 5,
  dbClient: DbClient = db
): Promise<{ contacts: SampleRecipient[]; totalCount: number }> {
  const conditions = await buildRecipientConditions(
    organizationId,
    channel,
    filter,
    dbClient
  );

  const whereClause = and(...conditions);

  const [[countResult], contacts] = await Promise.all([
    dbClient
      .select({ count: sql<number>`count(*)::int` })
      .from(contact)
      .where(whereClause),
    dbClient
      .select({
        id: contact.id,
        email: contact.email,
        firstName: contact.firstName,
        lastName: contact.lastName,
        company: contact.company,
      })
      .from(contact)
      .where(whereClause)
      .orderBy(desc(contact.createdAt))
      .limit(limit),
  ]);

  return { contacts, totalCount: countResult?.count ?? 0 };
}

export type SampleRecipientWithProperties = SampleRecipient & {
  jobTitle: string | null;
  properties: Record<string, unknown> | null;
};

export async function getSampleRecipientsWithProperties(
  organizationId: string,
  channel: Channel,
  filter?: BroadcastRecipientFilter,
  limit = 50,
  dbClient: DbClient = db
): Promise<{ contacts: SampleRecipientWithProperties[]; totalCount: number }> {
  const conditions = await buildRecipientConditions(
    organizationId,
    channel,
    filter,
    dbClient
  );

  const whereClause = and(...conditions);

  const [[countResult], contacts] = await Promise.all([
    dbClient
      .select({ count: sql<number>`count(*)::int` })
      .from(contact)
      .where(whereClause),
    dbClient
      .select({
        id: contact.id,
        email: contact.email,
        firstName: contact.firstName,
        lastName: contact.lastName,
        company: contact.company,
        jobTitle: contact.jobTitle,
        properties: contact.properties,
      })
      .from(contact)
      .where(whereClause)
      .orderBy(desc(contact.createdAt))
      .limit(limit),
  ]);

  return { contacts, totalCount: countResult?.count ?? 0 };
}

// ── Template queries ──────────────────────────────────────────────────────────

export async function findTemplateForValidation(
  id: string,
  organizationId: string,
  dbClient: DbClient = db
) {
  return dbClient.query.template.findFirst({
    where: (t, { and: a, eq: e }) =>
      a(e(t.id, id), e(t.organizationId, organizationId)),
    columns: {
      id: true,
      sesTemplateName: true,
      subject: true,
      updatedAt: true,
      publishedAt: true,
    },
  });
}

export async function findTemplateVariables(
  id: string,
  organizationId: string,
  dbClient: DbClient = db
) {
  return dbClient.query.template.findFirst({
    where: (t, { and: a, eq: e }) =>
      a(e(t.id, id), e(t.organizationId, organizationId)),
    columns: {
      content: true,
      emailType: true,
      sourceFormat: true,
      variables: true,
      subject: true,
    },
  });
}

export async function findTemplateContent(
  id: string,
  organizationId: string,
  dbClient: DbClient = db
) {
  return dbClient.query.template.findFirst({
    where: (t, { and: a, eq: e }) =>
      a(e(t.id, id), e(t.organizationId, organizationId)),
    columns: {
      content: true,
      subject: true,
      compiledHtml: true,
      sourceFormat: true,
    },
  });
}

export async function listPublishedTemplates(
  organizationId: string,
  dbClient: DbClient = db
) {
  return dbClient.query.template.findMany({
    where: (t, { and: a, eq: e }) =>
      a(e(t.organizationId, organizationId), e(t.status, "PUBLISHED")),
    columns: {
      id: true,
      name: true,
      subject: true,
      previewText: true,
    },
    orderBy: [desc(template.updatedAt)],
  });
}

// ── Topic queries ─────────────────────────────────────────────────────────────

export type TopicWithSubscriberCount = {
  id: string;
  name: string;
  subscriberCount: number;
};

export async function listTopicsWithSubscriberCounts(
  organizationId: string,
  dbClient: DbClient = db
): Promise<TopicWithSubscriberCount[]> {
  const topics = await dbClient.query.topic.findMany({
    where: (t, { eq: e }) => e(t.organizationId, organizationId),
    columns: { id: true, name: true },
  });

  const topicIds = topics.map((t) => t.id);
  const subscriberCounts =
    topicIds.length > 0
      ? await dbClient
          .select({
            topicId: contactTopic.topicId,
            count: sql<number>`count(*)::int`,
          })
          .from(contactTopic)
          .where(
            and(
              eq(contactTopic.status, "subscribed"),
              inArray(contactTopic.topicId, topicIds)
            )
          )
          .groupBy(contactTopic.topicId)
      : [];

  const countMap = new Map(subscriberCounts.map((c) => [c.topicId, c.count]));

  return topics
    .map((t) => ({
      id: t.id,
      name: t.name,
      subscriberCount: countMap.get(t.id) ?? 0,
    }))
    .sort((a, b) => b.subscriberCount - a.subscriberCount);
}

// ── Segment queries ────────────────────────────────────────────────────────────

export type SegmentSummary = {
  id: string;
  name: string;
  memberCount: number;
};

export async function listSegmentsForBroadcast(
  organizationId: string,
  dbClient: DbClient = db
): Promise<SegmentSummary[]> {
  const segments = await dbClient.query.segment.findMany({
    where: (s, { eq: e }) => e(s.organizationId, organizationId),
    columns: { id: true, name: true, memberCount: true },
    orderBy: (s, { desc: d }) => [d(s.memberCount)],
  });

  return segments.map((s) => ({
    id: s.id,
    name: s.name,
    memberCount: s.memberCount,
  }));
}
