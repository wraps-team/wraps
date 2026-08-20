/**
 * SQL-based Segment Evaluator
 *
 * Evaluates whether contacts match segment conditions using SQL queries.
 * Replaces the in-memory JS evaluator with a single SQL-based engine.
 */

import { and, eq, inArray, type SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { contact } from "./schema/contacts";
import { type FilterCondition, segment } from "./schema/segments";
import { buildConditionSQL } from "./segment-filter";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = NodePgDatabase<any>;

/**
 * Check if a single contact matches a segment condition via SQL.
 *
 * Returns true if the contact row satisfies the condition WHERE clause.
 *
 * Fails closed: a condition that compiles to no SQL — empty, or using an
 * operator this build doesn't know — matches nobody. This mirrors the send
 * paths (`buildRecipientConditions` in repositories/broadcasts.ts and
 * `getContactsChunk` in batch-sender.ts), which both refuse rather than fall
 * through to the whole organization. A segment that blocks a broadcast must
 * not simultaneously admit every contact to a workflow.
 */
export async function contactMatchesCondition(
  database: DB,
  contactId: string,
  organizationId: string,
  condition: FilterCondition
): Promise<boolean> {
  const conditionSQL = buildConditionSQL(condition);

  // No valid filters = matches nobody (fail closed, as the senders do)
  if (!conditionSQL) {
    return false;
  }

  const whereClause = and(
    eq(contact.id, contactId),
    eq(contact.organizationId, organizationId),
    conditionSQL as SQL
  );

  const [row] = await database
    .select({ id: contact.id })
    .from(contact)
    .where(whereClause!)
    .limit(1);

  return !!row;
}

/**
 * Filter a batch of contact IDs to only those matching a segment condition via SQL.
 *
 * Returns the subset of contactIds that satisfy the condition WHERE clause.
 *
 * Fails closed for the same reason as `contactMatchesCondition`: a condition
 * that compiles to no SQL selects nobody, never everybody.
 */
export async function contactIdsMatchingCondition(
  database: DB,
  contactIds: string[],
  organizationId: string,
  condition: FilterCondition
): Promise<string[]> {
  if (contactIds.length === 0) {
    return [];
  }

  const conditionSQL = buildConditionSQL(condition);

  // No valid filters = matches nobody (fail closed, as the senders do)
  if (!conditionSQL) {
    return [];
  }

  const whereClause = and(
    inArray(contact.id, contactIds),
    eq(contact.organizationId, organizationId),
    conditionSQL as SQL
  );

  const rows = await database
    .select({ id: contact.id })
    .from(contact)
    .where(whereClause!);

  return rows.map((r) => r.id);
}

/**
 * Batch-fetch segments by IDs (1 query)
 */
export async function getSegmentsByIds(
  database: DB,
  segmentIds: string[],
  organizationId: string
): Promise<Map<string, typeof segment.$inferSelect>> {
  const result = new Map<string, typeof segment.$inferSelect>();
  if (segmentIds.length === 0) {
    return result;
  }

  const segments = await database
    .select()
    .from(segment)
    .where(
      and(
        inArray(segment.id, segmentIds),
        eq(segment.organizationId, organizationId)
      )
    );

  for (const seg of segments) {
    result.set(seg.id, seg);
  }

  return result;
}
