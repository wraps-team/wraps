/**
 * Address drill-down reads: which addresses had a bounce, complaint or
 * suppression, and every problem send to one address.
 *
 * Definitions match the analytics totals (message-metrics.ts): a bounce is
 * `bounced_at IS NOT NULL`, a complaint `complained_at IS NOT NULL`, a
 * suppression `suppressed_at IS NOT NULL`, and a send is in a window by
 * `sent_at`, with the end inclusive. So the totals reconcile with the
 * analytics charts for the same window.
 *
 * Org scoping: every query filters `organization_id` in WHERE, and every
 * joined name is taken only from a row of the same org (in the ON clause).
 */

import type { SQL } from "drizzle-orm";
import { and, desc, eq, gte, isNotNull, lte, sql } from "drizzle-orm";
import { db } from "../index";
import { batchSend, messageSend } from "../schema/batch";
import { template } from "../schema/templates";
import { workflow, workflowExecution } from "../schema/workflows";
import type { DbClient } from "./api-keys";
import { assertValidTimezone } from "./message-metrics";

/** Addresses listed on the drill-down tab. */
export const PROBLEM_ADDRESS_LIMIT = 100;
/** One more than the detail shows, so the caller can tell there are more. */
export const PROBLEM_SEND_QUERY_LIMIT = 26;

/**
 * The columns every problem-send read selects from `message_send`. Diagnostic
 * fields added later belong here, so every reader picks them up in one place.
 * Only columns that exist in the schema today are listed.
 */
export const PROBLEM_SEND_COLUMNS = {
  id: messageSend.id,
  subject: messageSend.subject,
  sourceType: messageSend.sourceType,
  sentAt: messageSend.sentAt,
  createdAt: messageSend.createdAt,
  awsAccountId: messageSend.awsAccountId,
  bounceType: messageSend.bounceType,
  bounceSubType: messageSend.bounceSubType,
  bouncedAt: messageSend.bouncedAt,
  complainedAt: messageSend.complainedAt,
  suppressedAt: messageSend.suppressedAt,
} as const;

export type AddressWindowQuery = {
  organizationId: string;
  startTime: Date;
  endTime: Date;
  timezone: string; // IANA, validated by assertValidTimezone
  day?: string | null; // YYYY-MM-DD, a local date in `timezone`
};

export type ProblemAddressRow = {
  address: string;
  complaints: number;
  bounces: number;
  suppressed: number;
  lastProblemAt: Date | null;
};

export type ProblemAddressTotals = {
  bounces: number;
  complaints: number;
  suppressed: number;
  uniqueAddresses: number;
};

export type AddressSendTotals = {
  sends: number;
  bounces: number;
  complaints: number;
  suppressed: number;
};

export type ProblemSendRow = {
  id: string;
  subject: string | null;
  sourceType: string;
  sentAt: Date | null;
  createdAt: Date;
  awsAccountId: string | null;
  bounceType: string | null;
  bounceSubType: string | null;
  bouncedAt: Date | null;
  complainedAt: Date | null;
  suppressedAt: Date | null;
  templateName: string | null;
  broadcastName: string | null;
  workflowName: string | null;
};

// Literal SQL, not bound parameters: the partial index
// message_send_org_problem_sent_at_idx has this exact predicate, and the
// planner matches a partial index only against text it can see.
const PROBLEM_PREDICATE = sql`(${messageSend.bouncedAt} IS NOT NULL OR ${messageSend.complainedAt} IS NOT NULL OR ${messageSend.suppressedAt} IS NOT NULL)`;
const EMAIL_CHANNEL = sql`${messageSend.channel} = 'email'`;

const ADDRESS_KEY = sql`lower(${messageSend.recipient})`;

/**
 * The daily bucket the analytics charts use. Copied from periodExpr("daily")
 * in message-metrics.ts, which is module-private. The two must stay identical,
 * or a clicked day selects a different set of sends than the chart bucket.
 */
function dayBucket(tzLiteral: SQL): SQL<string> {
  return sql<string>`to_char(${messageSend.sentAt} AT TIME ZONE 'UTC' AT TIME ZONE ${tzLiteral}, 'YYYY-MM-DD')`;
}

function timezoneLiteral(timezone: string): SQL {
  // assertValidTimezone runs before sql.raw: it is the charset gate that keeps
  // the zone name from breaking out of its quoted literal.
  return sql.raw(`'${assertValidTimezone(timezone)}'`);
}

/**
 * Q1a. The addresses with at least one problem in the window, worst first:
 * complaints, then bounces, then the latest problem, then address.
 */
export async function queryProblemAddresses(
  query: AddressWindowQuery,
  dbClient: DbClient = db
): Promise<ProblemAddressRow[]> {
  const tzLiteral = timezoneLiteral(query.timezone);
  const complaints = sql<number>`count(*) filter (where ${messageSend.complainedAt} is not null)::int`;
  const bounces = sql<number>`count(*) filter (where ${messageSend.bouncedAt} is not null)::int`;
  const suppressed = sql<number>`count(*) filter (where ${messageSend.suppressedAt} is not null)::int`;
  const lastProblemAt = sql<Date | null>`max(coalesce(${messageSend.complainedAt}, ${messageSend.bouncedAt}, ${messageSend.suppressedAt}))`;

  const rows = await dbClient
    .select({
      address: ADDRESS_KEY,
      complaints,
      bounces,
      suppressed,
      lastProblemAt,
    })
    .from(messageSend)
    .where(
      and(
        eq(messageSend.organizationId, query.organizationId),
        EMAIL_CHANNEL,
        isNotNull(messageSend.sentAt),
        gte(messageSend.sentAt, query.startTime),
        lte(messageSend.sentAt, query.endTime),
        PROBLEM_PREDICATE,
        query.day ? sql`${dayBucket(tzLiteral)} = ${query.day}` : undefined
      )
    )
    .groupBy(ADDRESS_KEY)
    .orderBy(
      desc(complaints),
      desc(bounces),
      desc(lastProblemAt),
      sql`${ADDRESS_KEY} asc`
    )
    .limit(PROBLEM_ADDRESS_LIMIT);

  return rows as ProblemAddressRow[];
}

/**
 * Q1b. Window totals for the tab's totals line, and the exact number of
 * distinct problem addresses. Computed here, not summed from the top rows.
 */
export async function queryProblemAddressTotals(
  query: AddressWindowQuery,
  dbClient: DbClient = db
): Promise<ProblemAddressTotals> {
  const tzLiteral = timezoneLiteral(query.timezone);
  const [row] = await dbClient
    .select({
      bounces: sql<number>`count(*) filter (where ${messageSend.bouncedAt} is not null)::int`,
      complaints: sql<number>`count(*) filter (where ${messageSend.complainedAt} is not null)::int`,
      suppressed: sql<number>`count(*) filter (where ${messageSend.suppressedAt} is not null)::int`,
      uniqueAddresses: sql<number>`count(distinct ${ADDRESS_KEY})::int`,
    })
    .from(messageSend)
    .where(
      and(
        eq(messageSend.organizationId, query.organizationId),
        EMAIL_CHANNEL,
        isNotNull(messageSend.sentAt),
        gte(messageSend.sentAt, query.startTime),
        lte(messageSend.sentAt, query.endTime),
        PROBLEM_PREDICATE,
        query.day ? sql`${dayBucket(tzLiteral)} = ${query.day}` : undefined
      )
    );

  return (
    row ?? { bounces: 0, complaints: 0, suppressed: 0, uniqueAddresses: 0 }
  );
}

/**
 * Q2. Every send to one address in the org, in any channel's address column,
 * matched case-insensitively. Used for the detail's totals line.
 */
export async function queryAddressSendTotals(
  query: { organizationId: string; address: string },
  dbClient: DbClient = db
): Promise<AddressSendTotals> {
  const [row] = await dbClient
    .select({
      sends: sql<number>`count(*)::int`,
      bounces: sql<number>`count(*) filter (where ${messageSend.bouncedAt} is not null)::int`,
      complaints: sql<number>`count(*) filter (where ${messageSend.complainedAt} is not null)::int`,
      suppressed: sql<number>`count(*) filter (where ${messageSend.suppressedAt} is not null)::int`,
    })
    .from(messageSend)
    .where(
      and(
        eq(messageSend.organizationId, query.organizationId),
        sql`lower(${messageSend.recipient}) = lower(${query.address})`
      )
    );

  return row ?? { sends: 0, bounces: 0, complaints: 0, suppressed: 0 };
}

/**
 * Q3. The problem sends to one address, most recent problem first. Reads
 * PROBLEM_SEND_COLUMNS plus the names of the broadcast, workflow and template
 * the send came from. A caller that passes PROBLEM_SEND_QUERY_LIMIT rows gets
 * one row more than it shows, to learn whether there are more.
 */
export async function queryAddressProblemSends(
  query: { organizationId: string; address: string },
  dbClient: DbClient = db
): Promise<ProblemSendRow[]> {
  const orgId = query.organizationId;
  const rows = await dbClient
    .select({
      ...PROBLEM_SEND_COLUMNS,
      templateName: template.name,
      broadcastName: batchSend.name,
      workflowName: workflow.name,
    })
    .from(messageSend)
    .leftJoin(
      template,
      and(
        eq(messageSend.emailTemplateId, template.id),
        eq(template.organizationId, orgId)
      )
    )
    .leftJoin(
      batchSend,
      and(
        eq(messageSend.batchSendId, batchSend.id),
        eq(batchSend.organizationId, orgId)
      )
    )
    .leftJoin(
      workflowExecution,
      and(
        eq(messageSend.workflowExecutionId, workflowExecution.id),
        eq(workflowExecution.organizationId, orgId)
      )
    )
    .leftJoin(
      workflow,
      and(
        eq(workflowExecution.workflowId, workflow.id),
        eq(workflow.organizationId, orgId)
      )
    )
    .where(
      and(
        eq(messageSend.organizationId, orgId),
        sql`lower(${messageSend.recipient}) = lower(${query.address})`,
        EMAIL_CHANNEL,
        PROBLEM_PREDICATE
      )
    )
    .orderBy(
      desc(
        sql`coalesce(${messageSend.complainedAt}, ${messageSend.bouncedAt}, ${messageSend.suppressedAt})`
      ),
      desc(messageSend.id)
    )
    .limit(PROBLEM_SEND_QUERY_LIMIT);

  return rows as ProblemSendRow[];
}
