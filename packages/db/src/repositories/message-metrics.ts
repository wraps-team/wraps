import type { Column, SQL } from "drizzle-orm";
import { and, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { BOT_UA_KEYWORDS } from "../email-bot-detection";
import { db } from "../index";
import { awsAccount } from "../schema/app";
import { messageSend } from "../schema/batch";
import type { DbClient } from "./api-keys";

export type MetricsDimension =
  | "period"
  | "domain"
  | "broadcast"
  | "template"
  | "source"
  | "account"
  | "region";

export type MetricsGranularity = "hourly" | "daily" | "weekly" | "monthly";

export type MetricsQuery = {
  organizationId: string;
  startTime: Date;
  endTime: Date;
  timezone?: string; // IANA, default "UTC"
  granularity?: MetricsGranularity; // default "daily"; only used with "period"
  dimensions?: MetricsDimension[]; // default [] -> totals only
  broadcastId?: string[];
  templateId?: string[];
  awsAccountId?: string[];
  domain?: string[];
  maxRows?: number; // default 10_000
};

export type MetricsRow = {
  // Dimension keys, present only when requested.
  period?: string;
  domain?: string | null;
  broadcastId?: string | null;
  templateId?: string | null;
  source?: string;
  awsAccountId?: string;
  region?: string | null;
  // Counts — always present.
  sent: number;
  delivered: number;
  bounced: number;
  bouncedPermanent: number;
  bouncedTransient: number;
  bouncedUndetermined: number;
  complained: number;
  suppressed: number;
  opened: number; // bot-filtered
  openedRaw: number; // unfiltered
  clicked: number;
  failed: number;
};

export class MetricsQueryError extends Error {
  constructor(
    public readonly code: "invalid_timezone" | "row_cap_exceeded",
    message: string
  ) {
    super(message);
    this.name = "MetricsQueryError";
  }
}

const DEFAULT_MAX_ROWS = 10_000;

// Charset gate before the timezone ever reaches sql.raw: anything outside
// this set (quotes, spaces, semicolons) can't be a real IANA zone and can't
// break out of the single-quoted literal it gets interpolated into below.
const TIMEZONE_CHARSET = /^[A-Za-z0-9_+\-/]+$/;

/**
 * Validates an IANA timezone name. Throws MetricsQueryError("invalid_timezone")
 * rather than falling back to UTC — this is a public API, and silently
 * answering in a different zone than the caller asked for is wrong for it.
 *
 * Deliberately does NOT build an allowlist from Intl's list of every known
 * timezone name: verified on Node 22.22 that list has 418 entries and
 * contains neither "UTC" nor "Etc/UTC", nor common aliases browsers send. The
 * Intl.DateTimeFormat probe below accepts all of those and still throws on
 * garbage.
 */
export function assertValidTimezone(timezone: string): string {
  if (!TIMEZONE_CHARSET.test(timezone)) {
    throw new MetricsQueryError(
      "invalid_timezone",
      `Invalid timezone: "${timezone}"`
    );
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
  } catch {
    throw new MetricsQueryError(
      "invalid_timezone",
      `Invalid timezone: "${timezone}"`
    );
  }
  return timezone;
}

/**
 * SQL fragment that returns TRUE when the open_user_agent is NOT a bot.
 * Derives from the same BOT_UA_KEYWORDS list as the TypeScript `isBotOpen()`.
 * null/empty UAs are considered bots.
 */
const botPattern = BOT_UA_KEYWORDS.join("|");
const isNotBotOpen = sql`(
  ${messageSend.openUserAgent} IS NOT NULL
  AND ${messageSend.openUserAgent} != ''
  AND ${messageSend.openUserAgent} !~* ${botPattern}
)`;

// Aggregate `count(*) filter (...)` expressions. Copied verbatim from
// apps/web/src/lib/analytics-fallback.ts (the readers this repository is
// replacing) — these are the numbers the dashboard already reports, and they
// must not move.
const AGGREGATE_FIELDS = {
  sent: sql<number>`count(*) filter (where ${messageSend.status} != 'failed')::int`,
  delivered: sql<number>`count(*) filter (where ${messageSend.deliveredAt} is not null)::int`,
  bounced: sql<number>`count(*) filter (where ${messageSend.bouncedAt} is not null)::int`,
  bouncedPermanent: sql<number>`count(*) filter (where ${messageSend.bounceType} = 'Permanent')::int`,
  bouncedTransient: sql<number>`count(*) filter (where ${messageSend.bounceType} = 'Transient')::int`,
  bouncedUndetermined: sql<number>`count(*) filter (where ${messageSend.bouncedAt} is not null and (${messageSend.bounceType} is null or ${messageSend.bounceType} not in ('Permanent', 'Transient')))::int`,
  complained: sql<number>`count(*) filter (where ${messageSend.complainedAt} is not null)::int`,
  suppressed: sql<number>`count(*) filter (where ${messageSend.suppressedAt} is not null)::int`,
  opened: sql<number>`count(*) filter (where ${messageSend.openedAt} is not null and ${isNotBotOpen})::int`,
  openedRaw: sql<number>`count(*) filter (where ${messageSend.openedAt} is not null)::int`,
  // Unfiltered, unlike `opened` above. Plan 107 records this as a known
  // asymmetry between opens (bot-filtered) and clicks (not) in the product's
  // open/click-rate definitions and owns whether it changes — do not add a
  // bot filter here without that plan's sign-off.
  clicked: sql<number>`count(*) filter (where ${messageSend.clickedAt} is not null)::int`,
  failed: sql<number>`count(*) filter (where ${messageSend.status} = 'failed')::int`,
};

type DimensionColumn = SQL<unknown> | Column;

/**
 * The period bucket expression for a granularity, in the caller's timezone.
 * Postgres requires every non-aggregated SELECT expression to match its
 * GROUP BY expression structurally, so this is called twice per query (once
 * for the SELECT list, once for GROUP BY) rather than reused — a bound
 * parameter would emit as two non-matching `$n` placeholders, but `tzLiteral`
 * is a raw literal, so the two calls produce identical SQL text.
 */
function periodExpr(
  granularity: MetricsGranularity,
  tzLiteral: SQL
): SQL<string> {
  const localTs = sql`${messageSend.sentAt} AT TIME ZONE 'UTC' AT TIME ZONE ${tzLiteral}`;
  switch (granularity) {
    case "hourly":
      return sql<string>`to_char(${localTs}, 'YYYY-MM-DD"T"HH24:00:00')`;
    case "weekly":
      return sql<string>`to_char(date_trunc('week', ${localTs}), 'YYYY-MM-DD')`;
    case "monthly":
      return sql<string>`to_char(${localTs}, 'YYYY-MM')`;
    default:
      return sql<string>`to_char(${localTs}, 'YYYY-MM-DD')`;
  }
}

function domainExpr(): SQL<string | null> {
  return sql<string | null>`lower(split_part(${messageSend.from}, '@', 2))`;
}

function buildWhereConditions(query: MetricsQuery): SQL[] {
  const conditions: SQL[] = [
    eq(messageSend.organizationId, query.organizationId),
    eq(messageSend.channel, "email"),
    isNotNull(messageSend.sentAt),
    gte(messageSend.sentAt, query.startTime),
    lte(messageSend.sentAt, query.endTime),
  ];

  if (query.broadcastId?.length) {
    conditions.push(inArray(messageSend.batchSendId, query.broadcastId));
  }
  if (query.templateId?.length) {
    conditions.push(inArray(messageSend.emailTemplateId, query.templateId));
  }
  if (query.awsAccountId?.length) {
    conditions.push(inArray(messageSend.awsAccountId, query.awsAccountId));
  }
  if (query.domain?.length) {
    conditions.push(
      inArray(
        domainExpr(),
        query.domain.map((d) => d.toLowerCase())
      )
    );
  }

  return conditions;
}

function buildDimensionSelect(
  dimensions: MetricsDimension[],
  granularity: MetricsGranularity,
  tzLiteral: SQL
): {
  columns: Record<string, DimensionColumn>;
  groupBy: DimensionColumn[];
  needsAccountJoin: boolean;
} {
  const columns: Record<string, DimensionColumn> = {};
  const groupBy: DimensionColumn[] = [];
  let needsAccountJoin = false;

  for (const dim of dimensions) {
    switch (dim) {
      case "period":
        columns.period = periodExpr(granularity, tzLiteral);
        groupBy.push(periodExpr(granularity, tzLiteral));
        break;
      case "domain":
        columns.domain = domainExpr();
        groupBy.push(domainExpr());
        break;
      case "broadcast":
        columns.broadcastId = messageSend.batchSendId;
        groupBy.push(messageSend.batchSendId);
        break;
      case "template":
        columns.templateId = messageSend.emailTemplateId;
        groupBy.push(messageSend.emailTemplateId);
        break;
      case "source":
        columns.source = messageSend.sourceType;
        groupBy.push(messageSend.sourceType);
        break;
      case "account":
        columns.awsAccountId = messageSend.awsAccountId;
        groupBy.push(messageSend.awsAccountId);
        break;
      case "region":
        columns.region = awsAccount.region;
        groupBy.push(awsAccount.region);
        needsAccountJoin = true;
        break;
      default:
        break;
    }
  }

  return { columns, groupBy, needsAccountJoin };
}

/**
 * The bucketed rows only — one aggregate query, no totals. What apps/web's
 * daily-chart adapters need: making them pay for a totals query they'd
 * discard would double their load on the largest table in the database.
 */
export async function queryMessageMetricBuckets(
  query: MetricsQuery,
  dbClient: DbClient = db
): Promise<MetricsRow[]> {
  const timezone = assertValidTimezone(query.timezone ?? "UTC");
  const dimensions = query.dimensions ?? [];

  // Matches Resend's contract: no dimensions requested means totals only,
  // and `data` is empty rather than a single ungrouped bucket.
  if (dimensions.length === 0) {
    return [];
  }

  const granularity = query.granularity ?? "daily";
  const maxRows = query.maxRows ?? DEFAULT_MAX_ROWS;
  const tzLiteral = sql.raw(`'${timezone}'`);

  const conditions = buildWhereConditions(query);
  const { columns, groupBy, needsAccountJoin } = buildDimensionSelect(
    dimensions,
    granularity,
    tzLiteral
  );

  const baseQuery = dbClient
    .select({ ...columns, ...AGGREGATE_FIELDS })
    .from(messageSend)
    .$dynamic();

  // The region dimension is the only one needing a join — add it only when
  // requested so a totals-only or non-region query never pays for it.
  const joined = needsAccountJoin
    ? baseQuery.leftJoin(
        awsAccount,
        eq(messageSend.awsAccountId, awsAccount.id)
      )
    : baseQuery;

  const orderByExprs = dimensions.includes("period")
    ? [periodExpr(granularity, tzLiteral)]
    : [];

  // LIMIT maxRows + 1 so the cap is enforced in SQL (bounding what Postgres
  // materialises) rather than after the fact.
  const rows = await joined
    .where(and(...conditions))
    .groupBy(...groupBy)
    .orderBy(...orderByExprs)
    .limit(maxRows + 1);

  if (rows.length > maxRows) {
    throw new MetricsQueryError(
      "row_cap_exceeded",
      `Metrics query returned more than ${maxRows} rows; narrow the time window, add filters, or use a coarser granularity`
    );
  }

  return rows as unknown as MetricsRow[];
}

async function queryTotals(
  query: MetricsQuery,
  dbClient: DbClient
): Promise<MetricsRow> {
  const conditions = buildWhereConditions(query);

  // A real aggregate query with the same WHERE and no GROUP BY — not a
  // client-side sum of the bucketed rows, which would be wrong for any
  // distinct-count metric added later.
  const [row] = await dbClient
    .select({ ...AGGREGATE_FIELDS })
    .from(messageSend)
    .where(and(...conditions));

  return row as unknown as MetricsRow;
}

/**
 * Buckets plus a separate totals query. What the API route returns.
 */
export async function getMessageMetrics(
  query: MetricsQuery,
  dbClient: DbClient = db
): Promise<{ totals: MetricsRow; data: MetricsRow[] }> {
  // Validated here too (not only inside queryMessageMetricBuckets) so an
  // invalid timezone rejects before either query runs, not just the bucket
  // one.
  assertValidTimezone(query.timezone ?? "UTC");

  const [data, totals] = await Promise.all([
    queryMessageMetricBuckets(query, dbClient),
    queryTotals(query, dbClient),
  ]);

  return { totals, data };
}
