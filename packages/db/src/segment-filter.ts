/**
 * Segment Filter SQL Builder
 *
 * Pure SQL builder functions that translate segment FilterCondition trees
 * into Drizzle SQL fragments. No database dependency — only builds SQL.
 *
 * Used by both the web dashboard (server actions) and the batch sender (Lambda worker).
 */

import { and, or, type SQL, sql } from "drizzle-orm";
import type { FilterCondition, SegmentFilter } from "./schema/segments";

const VALID_UNITS = new Set(["days", "hours", "minutes"]);

// Guards for casting a JSON text property before comparing it. Rows whose value
// doesn't match are folded to NULL by the CASE rather than erroring the query.
const NUMERIC_GUARD = String.raw`^-?[0-9]*\.?[0-9]+$`;
const DATE_GUARD = String.raw`^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])`;

// A comparison value shaped like a date ("2026-07-31" or a full ISO-8601
// timestamp) selects the timestamp path; anything else stays numeric.
const DATE_VALUE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])([T ]|$)/;
const BARE_DATE_VALUE = /^\d{4}-\d{2}-\d{2}$/;

function isDateValue(value: unknown): value is string {
  return typeof value === "string" && DATE_VALUE.test(value);
}

/**
 * Build the (left, right) operands for an ordered comparison on a custom
 * property. Properties are stored as JSON text, so both sides need an explicit
 * cast — numeric for counts/scores, timestamptz for dates.
 */
function orderedPropertyOperands(propertyKey: string, value: unknown) {
  if (isDateValue(value)) {
    // A bare "YYYY-MM-DD" carries no zone, so ::timestamptz would resolve it
    // against the server's timezone. Anchor it to UTC to keep the boundary
    // identical on Neon and on self-hosted Postgres.
    const anchored = BARE_DATE_VALUE.test(value) ? `${value}T00:00:00Z` : value;
    return {
      left: sql`(CASE WHEN properties->>${propertyKey} ~ ${DATE_GUARD} THEN (properties->>${propertyKey})::timestamptz END)`,
      right: sql`${anchored}::timestamptz`,
    };
  }

  return {
    left: sql`(CASE WHEN properties->>${propertyKey} ~ ${NUMERIC_GUARD} THEN (properties->>${propertyKey})::numeric END)`,
    right: sql`${value}`,
  };
}

// Upper bound on partition count — generous for splitting a large send, low
// enough that a typo can't generate a pathological filter.
const MAX_BUCKETS = 1000;

export type BucketValue = { buckets: number; index: number };

function parseBucketValue(value: unknown): BucketValue | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const { buckets, index } = value as Record<string, unknown>;
  if (
    !(Number.isInteger(buckets) && Number.isInteger(index)) ||
    typeof buckets !== "number" ||
    typeof index !== "number"
  ) {
    return null;
  }
  if (buckets < 2 || buckets > MAX_BUCKETS) {
    return null;
  }
  // 1-based: "partition 1 of 6" through "partition 6 of 6".
  if (index < 1 || index > buckets) {
    return null;
  }
  return { buckets, index };
}

/**
 * Split contacts into `buckets` deterministic partitions and match partition
 * `index`. Every contact lands in exactly one partition, sizes are even to
 * within sampling noise, and membership is stable across runs.
 *
 * Uses md5 rather than hashtext: hashtext is an internal function whose output
 * is not guaranteed stable across Postgres major versions, which would reshuffle
 * partitions under a self-hosted customer mid-campaign.
 *
 * The double modulo keeps the result non-negative — the bit(32) cast is signed,
 * so a bare `% n` yields negatives for roughly half of all ids.
 */
export function bucketIndexSQL(buckets: number): SQL {
  return sql`((((('x' || substr(md5("contact"."id"), 1, 8))::bit(32)::int % ${buckets}) + ${buckets}) % ${buckets}) + 1)`;
}

function buildBucketSQL(value: unknown): SQL | null {
  const parsed = parseBucketValue(value);
  if (!parsed) {
    return null;
  }
  const { buckets, index } = parsed;
  return sql`${bucketIndexSQL(buckets)} = ${index}`;
}

/**
 * List operators bind their value as a single array param. A scalar reaching
 * `= ANY($1)` makes Postgres throw `malformed array literal`, so a value that
 * isn't an array compiles to no SQL — the callers all fail closed on null.
 */
function asList(value: unknown): string[] | null {
  return Array.isArray(value) ? value.map((v) => String(v)) : null;
}

function validateInterval(
  value: unknown,
  unit: string | undefined
): string | null {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num) || num <= 0 || !Number.isInteger(num)) {
    return null;
  }
  if (unit && !VALID_UNITS.has(unit)) {
    return null;
  }
  const resolvedUnit = unit && VALID_UNITS.has(unit) ? unit : "days";
  return `${num} ${resolvedUnit}`;
}

const COLUMN_MAP: Record<string, string> = {
  // "status" is the filter field id the UI has always emitted; it resolves to
  // email_status, the column the product actually writes. contact.status is
  // deprecated, defaults to 'active', and is never set to anything else — a
  // filter on it matched every contact in the org, unsubscribed included.
  status: "email_status",
  email: "email",
  lastActivityAt: "last_activity_at",
  lastEmailSentAt: "last_email_sent_at",
  lastEmailOpenedAt: "last_email_opened_at",
  lastEmailClickedAt: "last_email_clicked_at",
  emailsSent: "emails_sent",
  emailsOpened: "emails_opened",
  emailsClicked: "emails_clicked",
  createdAt: "created_at",
  confirmedAt: "confirmed_at",
};

export function buildFilterSQL(filter: SegmentFilter): SQL | null {
  const { field, operator, value, unit } = filter;

  // Handle event-based operators (field is the event name)
  if (
    operator === "triggered" ||
    operator === "triggeredWithin" ||
    operator === "notTriggered"
  ) {
    // The UI namespaces the field as "event.<name>" so the field picker can
    // recognise it; stored conditions and the API accept a bare name too.
    const eventName = field.startsWith("event.")
      ? field.slice("event.".length)
      : field;
    if (!eventName) {
      return null;
    }
    if (operator === "triggered") {
      return sql`EXISTS (SELECT 1 FROM "contact_event" WHERE "contact_id" = "contact"."id" AND "event_name" = ${eventName})`;
    }
    if (operator === "triggeredWithin") {
      const interval = validateInterval(value, unit);
      if (!interval) {
        return null;
      }
      return sql`EXISTS (SELECT 1 FROM "contact_event" WHERE "contact_id" = "contact"."id" AND "event_name" = ${eventName} AND "created_at" > NOW() - INTERVAL ${interval})`;
    }
    // notTriggered
    return sql`NOT EXISTS (SELECT 1 FROM "contact_event" WHERE "contact_id" = "contact"."id" AND "event_name" = ${eventName})`;
  }

  // Deterministic hash partitioning (field carries no data of its own)
  if (operator === "inBucket") {
    return buildBucketSQL(value);
  }

  // Handle topic-based filters via raw SQL (no db dependency)
  if (field === "topics") {
    const topicId = value as string;
    if (operator === "hasTopic") {
      return sql`EXISTS (SELECT 1 FROM "contact_topic" WHERE "contact_id" = "contact"."id" AND "topic_id" = ${topicId} AND "status" = 'subscribed')`;
    }
    if (operator === "notHasTopic") {
      return sql`NOT EXISTS (SELECT 1 FROM "contact_topic" WHERE "contact_id" = "contact"."id" AND "topic_id" = ${topicId} AND "status" = 'subscribed')`;
    }
    return null;
  }

  // Handle custom properties (field starts with "properties.")
  if (field.startsWith("properties.")) {
    const propertyKey = field.replace("properties.", "");
    switch (operator) {
      case "equals":
        return sql`properties->>${propertyKey} = ${String(value)}`;
      case "notEquals":
        return sql`properties->>${propertyKey} != ${String(value)}`;
      case "contains":
        return sql`properties->>${propertyKey} ILIKE ${`%${String(value)}%`}`;
      case "notContains":
        return sql`properties->>${propertyKey} NOT ILIKE ${`%${String(value)}%`}`;
      case "startsWith":
        return sql`properties->>${propertyKey} ILIKE ${`${String(value)}%`}`;
      case "endsWith":
        return sql`properties->>${propertyKey} ILIKE ${`%${String(value)}`}`;
      case "greaterThan": {
        const { left, right } = orderedPropertyOperands(propertyKey, value);
        return sql`${left} > ${right}`;
      }
      case "lessThan": {
        const { left, right } = orderedPropertyOperands(propertyKey, value);
        return sql`${left} < ${right}`;
      }
      case "greaterThanOrEqual": {
        const { left, right } = orderedPropertyOperands(propertyKey, value);
        return sql`${left} >= ${right}`;
      }
      case "lessThanOrEqual": {
        const { left, right } = orderedPropertyOperands(propertyKey, value);
        return sql`${left} <= ${right}`;
      }
      case "exists":
        return sql`properties ? ${propertyKey}`;
      case "notExists":
        return sql`NOT (properties ? ${propertyKey})`;
      case "inList": {
        const values = asList(value);
        if (!values) {
          return null;
        }
        if (values.length === 0) {
          return sql`FALSE`;
        }
        return sql`properties->>${propertyKey} = ANY(${sql.param(values)})`;
      }
      case "notInList": {
        const values = asList(value);
        if (!values) {
          return null;
        }
        if (values.length === 0) {
          return sql`TRUE`;
        }
        return sql`properties->>${propertyKey} != ALL(${sql.param(values)})`;
      }
      default:
        return null;
    }
  }

  // Handle standard contact fields
  const columnName = COLUMN_MAP[field];
  if (!columnName) {
    return null;
  }

  const col = sql.raw(`"${columnName}"`);

  switch (operator) {
    case "equals":
      return sql`${col} = ${value}`;
    case "notEquals":
      return sql`${col} != ${value}`;
    case "contains":
      return sql`${col} ILIKE ${`%${String(value)}%`}`;
    case "notContains":
      return sql`${col} NOT ILIKE ${`%${String(value)}%`}`;
    case "startsWith":
      return sql`${col} ILIKE ${`${String(value)}%`}`;
    case "endsWith":
      return sql`${col} ILIKE ${`%${String(value)}`}`;
    case "greaterThan":
      return sql`${col} > ${value}`;
    case "lessThan":
      return sql`${col} < ${value}`;
    case "greaterThanOrEqual":
      return sql`${col} >= ${value}`;
    case "lessThanOrEqual":
      return sql`${col} <= ${value}`;
    case "exists":
      return sql`${col} IS NOT NULL`;
    case "notExists":
      return sql`${col} IS NULL`;
    case "inList": {
      const values = asList(value);
      if (!values) {
        return null;
      }
      if (values.length === 0) {
        return sql`FALSE`;
      }
      return sql`${col} = ANY(${sql.param(values)})`;
    }
    case "notInList": {
      const values = asList(value);
      if (!values) {
        return null;
      }
      if (values.length === 0) {
        return sql`TRUE`;
      }
      return sql`${col} != ALL(${sql.param(values)})`;
    }
    case "within": {
      const interval = validateInterval(value, unit);
      if (!interval) {
        return null;
      }
      return sql`${col} > NOW() - INTERVAL ${interval}`;
    }
    default:
      return null;
  }
}

/**
 * Compile a whole condition, or nothing.
 *
 * A filter that compiles to `null` used to be dropped while the rest of its
 * group survived. That is a silent widening: the send path reads a *stored*
 * condition, so a segment written by an older build — or through the API with,
 * say, a scalar where a list operator expects an array — would lose its
 * narrowing filter at send time and mail more people than the segment says.
 * The action layer validates on create/update/preview; the send path has no
 * such gate, so refusing the whole condition here is what makes it fail closed.
 * Callers already treat `null` as "matches nobody".
 */
export function buildConditionSQL(condition: FilterCondition): SQL | null {
  const groupConditions: SQL[] = [];

  for (const group of condition.groups) {
    const filterConditions: SQL[] = [];

    for (const filter of group.filters) {
      const filterSQL = buildFilterSQL(filter);
      if (!filterSQL) {
        return null;
      }
      filterConditions.push(filterSQL);
    }

    // An empty nested block carries no intent and is skipped, as before. One
    // that holds filters and still compiles to nothing is the widening case.
    if (group.nested && group.nested.groups.length > 0) {
      const nestedSQL = buildConditionSQL(group.nested);
      if (!nestedSQL) {
        return null;
      }
      filterConditions.push(nestedSQL);
    }

    if (filterConditions.length > 0) {
      groupConditions.push(and(...filterConditions)!);
    }
  }

  if (groupConditions.length === 0) {
    return null;
  }

  if (condition.logic === "OR") {
    return or(...groupConditions) ?? null;
  }
  return and(...groupConditions) ?? null;
}
