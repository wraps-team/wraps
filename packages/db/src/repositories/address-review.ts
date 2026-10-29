/**
 * Address review reads: the addresses worth an operator's attention in one
 * window, grouped per address, for the Deliverability review lists
 * (recommended, soft, hard, complaint).
 *
 * Soft and hard follow the classifier in the core package (bounce-classification.ts).
 * This package does not depend on core, so the content sub-types and
 * the escalation threshold arrive as arguments (`classification`).
 *
 * Windows and bounce timestamps follow address-sends.ts: a send is in the
 * window by `sent_at` with the end inclusive, and the timestamp columns are
 * naive values that mean UTC. Soft-bounce days are UTC calendar days.
 * `timezone` is accepted for parity with the other window queries and is not
 * used, because no bucket here is a local day.
 *
 * Org scoping: every query filters `organization_id` in WHERE, both the
 * delivery CTE and the main read. A row from another org never joins.
 */

import type { SQL } from "drizzle-orm";
import { and, eq, gte, isNotNull, lte, sql } from "drizzle-orm";
import { db } from "../index";
import { messageSend } from "../schema/batch";
import type { AddressWindowQuery } from "./address-sends";
import type { DbClient } from "./api-keys";

export type ReviewKind = "soft" | "hard" | "complaint";

export type ReviewClassification = {
  /** Transient sub-types that are about the message, not the address. */
  contentSubTypes: readonly string[];
  /** Soft-bounce days after the last delivery that make an address recommended. */
  softThreshold: number;
};

export type ReviewQuery = Omit<AddressWindowQuery, "day"> & {
  classification: ReviewClassification;
};

export type ReviewAddressRow = {
  address: string; // lower(recipient)
  soft: number;
  hard: number;
  complaints: number;
  hardOpen: number; // hard bounces after the address's latest delivery in the window
  softDays: number; // distinct UTC days with a soft bounce after that delivery
  lastEventAt: Date | null; // latest complaint or bounce
  awsAccountId: string | null; // account of that latest event
};

/** The aggregate expressions, shared by the select list, HAVING and ORDER BY. */
type ReviewAggregates = {
  soft: SQL<number>;
  hard: SQL<number>;
  complaints: SQL<number>;
  hardOpen: SQL<number>;
  softDays: SQL<number>;
  lastEventAt: SQL<Date | null>;
  awsAccountId: SQL<string | null>;
};

export type ReviewListQuery = ReviewQuery & {
  kind?: ReviewKind | "recommended";
  limit: number;
  offset: number;
};

/**
 * The recommendation rule (plan 013, product decision 2): an address is
 * recommended when it has a complaint in the window, a hard bounce after its
 * latest delivery, or enough soft-bounce days after its latest delivery. The
 * SES list check is separate and happens in the web layer.
 */
export function isRecommended(
  row: ReviewAddressRow,
  softThreshold: number
): boolean {
  return (
    row.complaints > 0 || row.hardOpen > 0 || row.softDays >= softThreshold
  );
}

// Literal SQL for the problem predicate, matching address-sends.ts so the
// planner can use the same partial index.
const PROBLEM_PREDICATE = sql`(${messageSend.bouncedAt} IS NOT NULL OR ${messageSend.complainedAt} IS NOT NULL)`;
const EMAIL_CHANNEL = sql`${messageSend.channel} = 'email'`;
const ADDRESS_KEY = sql<string>`lower(${messageSend.recipient})`;

/**
 * The soft-bounce predicate of the classifier: Undetermined is soft, Transient
 * is soft unless its sub-type is a content sub-type, and a null or unknown
 * bounce_type is not an address problem.
 */
function softPredicate(contentSubTypes: readonly string[]): SQL {
  const bounced = sql`${messageSend.bouncedAt} IS NOT NULL`;
  const notContent =
    contentSubTypes.length === 0
      ? sql`true`
      : sql`coalesce(${messageSend.bounceSubType}, '') NOT IN (${sql.join(
          contentSubTypes.map((subType) => sql`${subType}`),
          sql`, `
        )})`;
  return sql`(${bounced} AND (${messageSend.bounceType} = 'Undetermined' OR (${messageSend.bounceType} = 'Transient' AND ${notContent})))`;
}

/**
 * The per-address aggregates. Every "after a delivery" count compares the
 * bounce with `lastOk`, the address's latest delivery in the window, taken
 * from the same CTE join.
 */
function reviewAggregates(
  contentSubTypes: readonly string[],
  lastOk: SQL
): ReviewAggregates {
  const hardPredicate = sql`(${messageSend.bouncedAt} IS NOT NULL AND ${messageSend.bounceType} = 'Permanent')`;
  const softPred = softPredicate(contentSubTypes);
  const afterDelivery = sql`(${lastOk} IS NULL OR ${messageSend.bouncedAt} > ${lastOk})`;
  const lastEvent = sql`greatest(${messageSend.complainedAt}, ${messageSend.bouncedAt})`;

  return {
    soft: sql<number>`count(*) filter (where ${softPred})::int`,
    hard: sql<number>`count(*) filter (where ${hardPredicate})::int`,
    complaints: sql<number>`count(*) filter (where ${messageSend.complainedAt} IS NOT NULL)::int`,
    hardOpen: sql<number>`count(*) filter (where ${hardPredicate} AND ${afterDelivery})::int`,
    // The naive timestamp is UTC by convention. The double AT TIME ZONE makes
    // the day independent of the session's time zone.
    softDays: sql<number>`count(distinct to_char(${messageSend.bouncedAt} AT TIME ZONE 'UTC' AT TIME ZONE 'UTC', 'YYYY-MM-DD')) filter (where ${softPred} AND ${afterDelivery})::int`,
    lastEventAt: sql<Date | null>`max(${lastEvent})`.mapWith(naiveUtcToDate),
    awsAccountId: sql<
      string | null
    >`(array_agg(${messageSend.awsAccountId} ORDER BY ${lastEvent} DESC NULLS LAST))[1]`,
  };
}

/**
 * One row per lower-cased address with at least one complaint or bounce in
 * the window, with the aggregates. Not yet filtered by kind, ordered or
 * limited. The `ok` CTE is the latest delivery per address in the window.
 */
function groupedAddresses(query: ReviewQuery, dbClient: DbClient) {
  const orgId = query.organizationId;
  const ok = dbClient.$with("ok").as(
    dbClient
      .select({
        addr: sql<string>`lower(${messageSend.recipient})`.as("addr"),
        lastOk: sql<Date | null>`max(${messageSend.deliveredAt})`.as("last_ok"),
      })
      .from(messageSend)
      .where(
        and(
          eq(messageSend.organizationId, orgId),
          EMAIL_CHANNEL,
          isNotNull(messageSend.deliveredAt),
          isNotNull(messageSend.sentAt),
          gte(messageSend.sentAt, query.startTime),
          lte(messageSend.sentAt, query.endTime)
        )
      )
      .groupBy(sql`lower(${messageSend.recipient})`)
  );
  const aggregates = reviewAggregates(
    query.classification.contentSubTypes,
    sql`${ok.lastOk}`
  );

  const builder = dbClient
    .with(ok)
    .select({
      address: ADDRESS_KEY.as("address"),
      soft: aggregates.soft.as("soft"),
      hard: aggregates.hard.as("hard"),
      complaints: aggregates.complaints.as("complaints"),
      hardOpen: aggregates.hardOpen.as("hard_open"),
      softDays: aggregates.softDays.as("soft_days"),
      lastEventAt: aggregates.lastEventAt.as("last_event_at"),
      awsAccountId: aggregates.awsAccountId.as("aws_account_id"),
    })
    .from(messageSend)
    .leftJoin(ok, sql`${ok.addr} = ${ADDRESS_KEY}`)
    .where(
      and(
        eq(messageSend.organizationId, orgId),
        EMAIL_CHANNEL,
        isNotNull(messageSend.sentAt),
        gte(messageSend.sentAt, query.startTime),
        lte(messageSend.sentAt, query.endTime),
        PROBLEM_PREDICATE
      )
    )
    .groupBy(ADDRESS_KEY, ok.lastOk);

  return { builder, aggregates };
}

/**
 * The driver returns timestamp columns as naive strings ("2026-10-05 12:00:00")
 * for raw expressions. They are UTC by convention, so read them as UTC.
 */
function naiveUtcToDate(value: unknown): Date | null {
  if (value === null || value === undefined) {
    return null;
  }
  const text = value instanceof Date ? value.toISOString() : String(value);
  return new Date(`${text.replace(" ", "T").replace(/Z?$/, "Z")}`);
}

/**
 * The HAVING predicate for one list. Undefined means every address with a
 * soft, hard or complaint problem (content-only bounces never qualify).
 */
function kindPredicate(
  kind: ReviewKind | "recommended" | undefined,
  aggregates: ReviewAggregates,
  softThreshold: number
): SQL {
  switch (kind) {
    case "soft":
      return sql`${aggregates.soft} > 0`;
    case "hard":
      return sql`${aggregates.hard} > 0`;
    case "complaint":
      return sql`${aggregates.complaints} > 0`;
    case "recommended":
      return sql`(${aggregates.complaints} > 0 OR ${aggregates.hardOpen} > 0 OR ${aggregates.softDays} >= ${softThreshold})`;
    default:
      return sql`(${aggregates.soft} > 0 OR ${aggregates.hard} > 0 OR ${aggregates.complaints} > 0)`;
  }
}

/**
 * One page of addresses for a review list, most recent event first. Fetches
 * `limit + 1` rows to report `hasMore`, and returns at most `limit`.
 */
export async function queryReviewAddresses(
  query: ReviewListQuery,
  dbClient: DbClient = db
): Promise<{ rows: ReviewAddressRow[]; hasMore: boolean }> {
  const { builder, aggregates } = groupedAddresses(query, dbClient);
  const rows = (await builder
    .having(
      kindPredicate(query.kind, aggregates, query.classification.softThreshold)
    )
    .orderBy(
      sql`${aggregates.lastEventAt} DESC NULLS LAST`,
      sql`${ADDRESS_KEY} ASC`
    )
    .limit(query.limit + 1)
    .offset(query.offset)) as ReviewAddressRow[];

  return {
    rows: rows.slice(0, query.limit),
    hasMore: rows.length > query.limit,
  };
}

/**
 * The number of addresses in each review list. An address can be in more
 * than one list, so the counts do not add up to the number of addresses.
 */
export async function queryReviewAddressCounts(
  query: ReviewQuery,
  dbClient: DbClient = db
): Promise<{ soft: number; hard: number; complaint: number }> {
  const { builder } = groupedAddresses(query, dbClient);
  const grouped = builder.as("grouped");
  const [row] = await dbClient
    .select({
      soft: sql<number>`count(*) filter (where ${grouped.soft} > 0)::int`,
      hard: sql<number>`count(*) filter (where ${grouped.hard} > 0)::int`,
      complaint: sql<number>`count(*) filter (where ${grouped.complaints} > 0)::int`,
    })
    .from(grouped);

  return row ?? { soft: 0, hard: 0, complaint: 0 };
}
