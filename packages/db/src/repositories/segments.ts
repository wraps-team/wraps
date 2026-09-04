import { and, desc, eq, sql } from "drizzle-orm";
import { db, escapeIlike } from "../index";
import { contact } from "../schema/contacts";
import { segment } from "../schema/segments";

type DrizzleTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type DbClient = typeof db | DrizzleTransaction;

export type SegmentRecord = typeof segment.$inferSelect;
export type SegmentInsert = typeof segment.$inferInsert;
export type SegmentUpdate = Partial<typeof segment.$inferInsert>;

export type ListSegmentsOptions = {
  limit?: number;
  offset?: number;
  search?: string;
};

export type ListSegmentsResult = {
  segments: SegmentRecord[];
  total: number;
};

/**
 * All of the org's segments, newest first. With no options this reproduces
 * the dashboard's original unpaginated query exactly — callers that never
 * pass `limit`/`offset` get every row, in the same order, with no LIMIT
 * clause added.
 *
 * Returns rows only — `memberCount` on each row is the cached column, never
 * the live sendable count. Callers must overlay `countRecipientsBySegment`
 * themselves; see the header comment in `apps/web/src/actions/segments.ts`
 * for why the cached column must never reach a response unmodified.
 */
export async function listSegmentsForOrg(
  organizationId: string,
  options?: ListSegmentsOptions,
  dbClient: DbClient = db
): Promise<ListSegmentsResult> {
  const conditions = [eq(segment.organizationId, organizationId)];

  if (options?.search) {
    const search = `%${escapeIlike(options.search)}%`;
    conditions.push(sql`${segment.name} ILIKE ${search}`);
  }

  const [countResult] = await dbClient
    .select({ count: sql<number>`count(*)::int` })
    .from(segment)
    .where(and(...conditions));

  const total = countResult?.count ?? 0;

  const baseQuery = dbClient
    .select()
    .from(segment)
    .where(and(...conditions))
    .orderBy(desc(segment.createdAt));

  const segments =
    options?.limit === undefined && options?.offset === undefined
      ? await baseQuery
      : await baseQuery
          .limit(options?.limit ?? total)
          .offset(options?.offset ?? 0);

  return { segments, total };
}

export async function findSegment(
  id: string,
  organizationId: string,
  dbClient: DbClient = db
): Promise<SegmentRecord | null> {
  const [row] = await dbClient
    .select()
    .from(segment)
    .where(and(eq(segment.id, id), eq(segment.organizationId, organizationId)))
    .limit(1);

  return row ?? null;
}

export async function insertSegment(
  data: SegmentInsert,
  dbClient: DbClient = db
): Promise<SegmentRecord> {
  const [row] = await dbClient.insert(segment).values(data).returning();

  if (!row) {
    throw new Error("Failed to insert segment");
  }

  return row;
}

export async function updateSegmentFields(
  id: string,
  organizationId: string,
  fields: Partial<SegmentUpdate>,
  dbClient: DbClient = db
): Promise<SegmentRecord | null> {
  const [row] = await dbClient
    .update(segment)
    .set(fields)
    .where(and(eq(segment.id, id), eq(segment.organizationId, organizationId)))
    .returning();

  return row ?? null;
}

export async function deleteSegmentRow(
  id: string,
  organizationId: string,
  dbClient: DbClient = db
): Promise<boolean> {
  const result = await dbClient
    .delete(segment)
    .where(and(eq(segment.id, id), eq(segment.organizationId, organizationId)))
    .returning({ id: segment.id });

  return result.length > 0;
}

/**
 * Distinct top-level keys across every contact's `properties` JSON for this
 * org — how the segment builder offers "Custom Property" filters without a
 * property registry.
 */
export async function listContactPropertyKeys(
  organizationId: string,
  dbClient: DbClient = db
): Promise<string[]> {
  const rows = await dbClient.execute<{ key: string }>(
    sql`SELECT DISTINCT json_object_keys(${contact.properties}) AS key
        FROM ${contact}
        WHERE ${contact.organizationId} = ${organizationId}
          AND ${contact.properties} IS NOT NULL`
  );

  return rows.rows.map((r) => r.key).sort();
}
