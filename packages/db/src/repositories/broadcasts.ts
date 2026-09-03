import {
  and,
  desc,
  eq,
  exists,
  ilike,
  inArray,
  isNotNull,
  lte,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { db, escapeIlike } from "../index";
import { awsAccount } from "../schema/app";
import {
  batchSend,
  type Channel,
  MESSAGE_SEND_UNACCEPTED_STATUSES,
  messageSend,
} from "../schema/batch";
import {
  contact,
  contactTopic,
  SENDABLE_EMAIL_STATUSES,
} from "../schema/contacts";
import type { FilterCondition } from "../schema/segments";
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
  /** Scanned SES capabilities. Needed to resolve the per-domain configuration
   *  set, which a broadcast test send must match or it is tracked differently
   *  from the broadcast it is testing. */
  features: (typeof awsAccount.$inferSelect)["features"];
} | null> {
  const [result] = await dbClient
    .select({
      id: awsAccount.id,
      dailyQuotaReserve: awsAccount.dailyQuotaReserve,
      roleArn: awsAccount.roleArn,
      externalId: awsAccount.externalId,
      region: awsAccount.region,
      features: awsAccount.features,
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

/**
 * Batched form of getBroadcastSendOutcomes for a list of broadcasts. The list
 * view renders the same sent/failed figures as the detail page, so it needs the
 * same reconciled source — one grouped query rather than N per-row queries.
 * Broadcasts with no per-message rows are simply absent from the map; callers
 * fall back to the counters exactly as the single-batch path does.
 */
export async function getBroadcastSendOutcomesForBatches(
  batchIds: string[],
  organizationId: string,
  dbClient: DbClient = db
): Promise<Map<string, BroadcastSendOutcomes>> {
  if (batchIds.length === 0) {
    return new Map();
  }
  const unaccepted = sql.raw(
    MESSAGE_SEND_UNACCEPTED_STATUSES.map((s) => `'${s}'`).join(", ")
  );
  const rows = await dbClient
    .select({
      batchSendId: messageSend.batchSendId,
      total: sql<number>`count(*)::int`,
      accepted: sql<number>`count(*) filter (where ${messageSend.status} not in (${unaccepted}))::int`,
      failed: sql<number>`count(*) filter (where ${messageSend.status} = 'failed')::int`,
    })
    .from(messageSend)
    .where(
      and(
        inArray(messageSend.batchSendId, batchIds),
        eq(messageSend.organizationId, organizationId)
      )
    )
    .groupBy(messageSend.batchSendId);

  const byBatch = new Map<string, BroadcastSendOutcomes>();
  for (const row of rows) {
    if (row.batchSendId) {
      byBatch.set(row.batchSendId, {
        total: row.total,
        accepted: row.accepted,
        failed: row.failed,
      });
    }
  }
  return byBatch;
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

/** Cap on distinct clicked URLs returned for one broadcast. Unsubscribe and
 *  preference links are per-recipient, so an unbounded GROUP BY returns one row
 *  per recipient — a 100k-recipient broadcast returned 100k rows. Those two
 *  link families are counted in aggregate instead and excluded from the list. */
export const MAX_CLICKED_URLS = 50;

/** Matches the per-recipient unsubscribe and preference links the sender
 *  injects. Mirrors isUnsubscribeUrl in apps/web's sankey-utils — both test the
 *  URL path, not the host, so a self-hosted domain matches too. */
const PREFERENCE_LINK_PATTERN = "^https?://[^/]+/(unsubscribe|preferences)/";

export type BroadcastClickBreakdown = {
  /** Top content links by click count, unsubscribe/preference links excluded. */
  clicksByUrl: Array<{ url: string; count: number }>;
  /** Total clicks on unsubscribe and preference links, counted in aggregate. */
  unsubscribeCount: number;
  /** Distinct content URLs that exist, so callers can say what they omitted. */
  totalDistinctUrls: number;
};

export async function getBroadcastClickBreakdown(
  batchId: string,
  organizationId: string,
  dbClient: DbClient = db
): Promise<BroadcastClickBreakdown> {
  const scope = and(
    eq(messageSend.batchSendId, batchId),
    eq(messageSend.organizationId, organizationId),
    isNotNull(messageSend.clickedUrl)
  );

  const isPreferenceLink = sql`${messageSend.clickedUrl} ~ ${PREFERENCE_LINK_PATTERN}`;

  const [aggregate] = await dbClient
    .select({
      unsubscribeCount: sql<number>`count(*) filter (where ${isPreferenceLink})::int`,
      totalDistinctUrls: sql<number>`count(distinct ${messageSend.clickedUrl}) filter (where not ${isPreferenceLink})::int`,
    })
    .from(messageSend)
    .where(scope);

  const rows = await dbClient
    .select({
      url: messageSend.clickedUrl,
      count: sql<number>`count(*)::int`,
    })
    .from(messageSend)
    .where(and(scope, sql`not ${isPreferenceLink}`))
    .groupBy(messageSend.clickedUrl)
    .orderBy(sql`count(*) desc`)
    .limit(MAX_CLICKED_URLS);

  return {
    clicksByUrl: rows.filter(
      (r): r is { url: string; count: number } => r.url !== null
    ),
    unsubscribeCount: aggregate?.unsubscribeCount ?? 0,
    totalDistinctUrls: aggregate?.totalDistinctUrls ?? 0,
  };
}

export async function listBroadcasts(
  organizationId: string,
  options: {
    page?: number;
    pageSize?: number;
    status?: BroadcastRecord["status"];
    channel?: Channel;
    search?: string;
  },
  dbClient: DbClient = db
): Promise<{ batches: BroadcastWithMeta[]; total: number }> {
  const { page = 1, pageSize = 20, status, channel, search } = options;
  const offset = (page - 1) * pageSize;

  const conditions = [eq(batchSend.organizationId, organizationId)];
  if (status) conditions.push(eq(batchSend.status, status));
  if (channel) conditions.push(eq(batchSend.channel, channel));
  if (search) {
    const pattern = `%${escapeIlike(search)}%`;
    const match = or(
      ilike(batchSend.name, pattern),
      ilike(batchSend.subject, pattern)
    );
    if (match) {
      conditions.push(match);
    }
  }

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

/**
 * Record that a broadcast is marked `scheduled` but has no EventBridge schedule
 * behind it, so nothing will ever fire. Written to `errorMessage` so the detail
 * page says the same thing the creation toast said, days later.
 */
export async function markBroadcastNotScheduled(
  id: string,
  organizationId: string,
  message: string,
  dbClient: DbClient = db
): Promise<void> {
  await dbClient
    .update(batchSend)
    .set({ errorMessage: message, updatedAt: new Date() })
    .where(
      and(eq(batchSend.id, id), eq(batchSend.organizationId, organizationId))
    );
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

/**
 * Whether a contact can be reached on this channel at all — the predicate the
 * sender applies before anything else.
 *
 * Exported because every count the dashboard shows has to be this same
 * predicate, and so does the sender itself — `getContactsChunk` in the
 * batch-sender worker built its own inline copy until it was pointed here.
 * Segment and topic counts used to omit it and so reported an audience larger
 * than any send could reach: a segment counted unsubscribed and email-less
 * contacts, a topic counted subscribers who had since bounced. The fix is one
 * predicate, not five copies of it.
 *
 * The sendable statuses are derived from `SENDABLE_EMAIL_STATUSES` rather than
 * spelled out, so this predicate and the in-memory `isEmailSendable` cannot
 * disagree about a status added later.
 *
 * Self-contained (parenthesised) so it can be dropped into a `count(*) FILTER
 * (WHERE …)` as readily as into a `WHERE`.
 */
export function channelEligibilitySQL(channel: Channel): SQL {
  if (channel === "email") {
    // The IS NULL arm is separate from the IN list on purpose: under SQL's
    // three-valued logic `NULL IN ('active')` is NULL, not false, so folding
    // it into the list would silently drop every null-status contact from
    // audiences they are currently part of.
    return sql`(${contact.email} IS NOT NULL AND (${contact.emailStatus} IS NULL OR ${inArray(contact.emailStatus, SENDABLE_EMAIL_STATUSES)}))`;
  }
  return sql`(${contact.phone} IS NOT NULL AND ${contact.smsStatus} = 'opted_in')`;
}

async function buildRecipientConditions(
  organizationId: string,
  channel: Channel,
  filter?: BroadcastRecipientFilter,
  dbClient: DbClient = db
): Promise<SQL[]> {
  const conditions: SQL[] = [
    eq(contact.organizationId, organizationId),
    channelEligibilitySQL(channel),
  ];

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
 * How many contacts each of these segments would actually send to.
 *
 * One scan for N segments: each segment becomes a `count(*) FILTER (WHERE …)`
 * over the org's eligible contacts, so listing a page of segments costs the
 * same as counting one. A segment that is missing, or whose filters do not all
 * compile, counts nobody — identical to `countBroadcastRecipients`, which is
 * the point: the list and the send must not be able to disagree.
 */
export async function countRecipientsBySegment(
  organizationId: string,
  channel: Channel,
  segmentIds: string[],
  dbClient: DbClient = db
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (segmentIds.length === 0) {
    return counts;
  }

  const rows = await dbClient.query.segment.findMany({
    where: (s, { and: a, eq: e, inArray: ia }) =>
      a(e(s.organizationId, organizationId), ia(s.id, segmentIds)),
    columns: { id: true, condition: true },
  });
  const conditionById = new Map(rows.map((r) => [r.id, r.condition]));

  // Alias by position: a segment id is not a legal SQL identifier.
  const selection: Record<string, SQL<number>> = {};
  const idByAlias = new Map<string, string>();
  segmentIds.forEach((segmentId, index) => {
    const alias = `s${index}`;
    idByAlias.set(alias, segmentId);
    const condition = conditionById.get(segmentId);
    const segmentSQL = condition ? buildConditionSQL(condition) : null;
    selection[alias] =
      sql<number>`count(*) FILTER (WHERE ${segmentSQL ?? sql`FALSE`})::int`;
  });

  const [result] = await dbClient
    .select(selection)
    .from(contact)
    .where(
      and(
        eq(contact.organizationId, organizationId),
        channelEligibilitySQL(channel)
      )
    );

  for (const [alias, segmentId] of idByAlias) {
    counts.set(segmentId, result?.[alias] ?? 0);
  }

  return counts;
}

export type ConditionAudience = {
  /** Contacts the filters match, reachable or not. */
  matched: number;
  /** Of those, the ones a broadcast on this channel would actually reach. */
  sendable: number;
  sampleEmails: string[];
};

/**
 * The audience of an unsaved condition — what the segment builder's preview
 * needs, since there is no segment id to count against yet.
 *
 * Returns `null` when the condition does not compile, so callers report why
 * rather than reporting a zero the query never measured.
 */
export async function previewConditionAudience(
  organizationId: string,
  channel: Channel,
  condition: FilterCondition,
  sampleLimit = 5,
  dbClient: DbClient = db
): Promise<ConditionAudience | null> {
  const conditionSQL = buildConditionSQL(condition);
  if (!conditionSQL) {
    return null;
  }

  const eligible = channelEligibilitySQL(channel);
  const matchWhere = and(
    eq(contact.organizationId, organizationId),
    conditionSQL
  );

  const [counts] = await dbClient
    .select({
      matched: sql<number>`count(*)::int`,
      sendable: sql<number>`count(*) FILTER (WHERE ${eligible})::int`,
    })
    .from(contact)
    .where(matchWhere);

  // Sampling the reachable rows, not the matching ones: a sample drawn from
  // contacts that cannot be mailed is not a sample of the send.
  const samples = await dbClient
    .select({ email: contact.email })
    .from(contact)
    .where(and(matchWhere, eligible))
    .limit(sampleLimit);

  return {
    matched: counts?.matched ?? 0,
    sendable: counts?.sendable ?? 0,
    sampleEmails: samples
      .map((s) => s.email)
      .filter((e): e is string => e !== null),
  };
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
  /** Subscribers a broadcast on this topic would actually reach. */
  subscriberCount: number;
};

export type TopicAudienceCounts = {
  /** Opted in — the number the preference centre and the operator think of. */
  subscribed: number;
  /** Waiting on a double opt-in confirmation. Not subscribers, not nobody. */
  pending: number;
  unsubscribed: number;
  /** Of the subscribed, the ones a broadcast would actually reach. */
  sendable: number;
};

/**
 * Subscribed / pending / unsubscribed / sendable per topic, in one grouped
 * scan.
 *
 * The join to `contact` is what makes `sendable` possible: a subscription row
 * carries no idea whether the person behind it has since bounced, complained,
 * been suppressed, or unsubscribed globally. Counting subscriptions alone
 * reported an audience the sender would never reach — measured at 60% too high
 * on one production topic.
 */
export async function countTopicAudience(
  organizationId: string,
  topicIds: string[],
  channel: Channel = "email",
  dbClient: DbClient = db
): Promise<Map<string, TopicAudienceCounts>> {
  if (topicIds.length === 0) {
    return new Map();
  }

  const eligible = channelEligibilitySQL(channel);

  const rows = await dbClient
    .select({
      topicId: contactTopic.topicId,
      subscribed: sql<number>`count(*) FILTER (WHERE ${contactTopic.status} = 'subscribed')::int`,
      pending: sql<number>`count(*) FILTER (WHERE ${contactTopic.status} = 'pending')::int`,
      unsubscribed: sql<number>`count(*) FILTER (WHERE ${contactTopic.status} = 'unsubscribed')::int`,
      sendable: sql<number>`count(*) FILTER (WHERE ${contactTopic.status} = 'subscribed' AND ${eligible})::int`,
    })
    .from(contactTopic)
    .innerJoin(contact, eq(contact.id, contactTopic.contactId))
    .where(
      and(
        inArray(contactTopic.topicId, topicIds),
        eq(contact.organizationId, organizationId)
      )
    )
    .groupBy(contactTopic.topicId);

  return new Map(
    rows.map((r) => [
      r.topicId,
      {
        subscribed: r.subscribed,
        pending: r.pending,
        unsubscribed: r.unsubscribed,
        sendable: r.sendable,
      },
    ])
  );
}

export async function listTopicsWithSubscriberCounts(
  organizationId: string,
  dbClient: DbClient = db
): Promise<TopicWithSubscriberCount[]> {
  const topics = await dbClient.query.topic.findMany({
    where: (t, { eq: e }) => e(t.organizationId, organizationId),
    columns: { id: true, name: true },
  });

  const audience = await countTopicAudience(
    organizationId,
    topics.map((t) => t.id),
    "email",
    dbClient
  );

  // The picker sits one click from a send, so it shows the sendable figure —
  // the subscribed total belongs on /topics, where the distinction is the
  // point.
  return topics
    .map((t) => ({
      id: t.id,
      name: t.name,
      subscriberCount: audience.get(t.id)?.sendable ?? 0,
    }))
    .sort((a, b) => b.subscriberCount - a.subscriberCount);
}

// ── Segment queries ────────────────────────────────────────────────────────────

export type SegmentSummary = {
  id: string;
  name: string;
  /** Contacts a broadcast to this segment would actually send to, counted now. */
  memberCount: number;
};

/**
 * `segment.member_count` is not read here on purpose. It is written at create,
 * update and split and never again — production's only segment carried a count
 * six months stale — and it counted matching rows rather than reachable ones.
 * Counting live through the same predicate the send uses removes the
 * divergence by construction instead of by synchronisation.
 */
export async function listSegmentsForBroadcast(
  organizationId: string,
  dbClient: DbClient = db
): Promise<SegmentSummary[]> {
  const segments = await dbClient.query.segment.findMany({
    where: (s, { eq: e }) => e(s.organizationId, organizationId),
    columns: { id: true, name: true },
  });

  const counts = await countRecipientsBySegment(
    organizationId,
    "email",
    segments.map((s) => s.id),
    dbClient
  );

  return segments
    .map((s) => ({
      id: s.id,
      name: s.name,
      memberCount: counts.get(s.id) ?? 0,
    }))
    .sort((a, b) => b.memberCount - a.memberCount);
}
