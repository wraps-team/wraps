/**
 * SQL-based Segment Evaluator
 *
 * Evaluates whether contacts match segment conditions using SQL queries.
 * Replaces the in-memory JS evaluator with a single SQL-based engine.
 */

import { and, eq, inArray, type SQL, sql } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { contact } from "./schema/contacts";
import { type FilterCondition, segment } from "./schema/segments";
import { buildConditionSQL } from "./segment-filter";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = NeonDatabase<any>;

/**
 * Check if a single contact matches a segment condition via SQL.
 *
 * Returns true if the contact row satisfies the condition WHERE clause.
 * For empty/null conditions (no valid filters), returns true (matches all).
 */
export async function contactMatchesCondition(
  database: DB,
  contactId: string,
  organizationId: string,
  condition: FilterCondition
): Promise<boolean> {
  const conditionSQL = buildConditionSQL(condition);

  // No valid filters = matches everything
  if (!conditionSQL) {
    return true;
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
 * For empty/null conditions (no valid filters), returns all provided IDs.
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

  // No valid filters = matches everything
  if (!conditionSQL) {
    return contactIds;
  }

  const whereClause = and(
    sql`${contact.id} = ANY(${contactIds})`,
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
