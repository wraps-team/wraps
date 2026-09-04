/**
 * PostgreSQL analytics queries.
 *
 * Primary data source for the email chart and analytics endpoints.
 * Aggregates from the `message_send` table with bot open filtering.
 */

import { db, queryMessageMetricBuckets } from "@wraps/db";
import { messageSend } from "@wraps/db/schema/batch";
import { and, desc, eq, gte, isNotNull, lte, sql } from "drizzle-orm";
import { BOT_UA_KEYWORDS } from "./email-bot-detection";

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

// ---------------------------------------------------------------------------
// Daily email volume (sent / delivered / bounced / complaints / opens / clicks)
// ---------------------------------------------------------------------------

export type DailyEmailMetrics = {
  date: string;
  sent: number;
  delivered: number;
  bounced: number;
  complaints: number;
  opens: number;
  clicks: number;
  renderingFailures: number;
};

export async function getEmailMetricsFromPostgres(
  organizationId: string,
  startTime: Date,
  endTime: Date,
  timezone = "UTC"
): Promise<Map<string, DailyEmailMetrics>> {
  const rows = await queryMessageMetricBuckets({
    organizationId,
    startTime,
    endTime,
    timezone,
    dimensions: ["period"],
    granularity: "daily",
  });

  const map = new Map<string, DailyEmailMetrics>();
  for (const row of rows) {
    const date = row.period as string;
    map.set(date, {
      date,
      sent: row.sent,
      delivered: row.delivered,
      bounced: row.bounced,
      complaints: row.complained,
      opens: row.opened,
      clicks: row.clicked,
      renderingFailures: row.failed,
    });
  }
  return map;
}

// ---------------------------------------------------------------------------
// Daily bounce breakdown (permanent / transient / undetermined)
// ---------------------------------------------------------------------------

export type DailyBounceMetrics = {
  permanent: number;
  transient: number;
  undetermined: number;
  sent: number;
};

export async function getBounceMetricsFromPostgres(
  organizationId: string,
  startTime: Date,
  endTime: Date,
  timezone = "UTC"
): Promise<Map<string, DailyBounceMetrics>> {
  const rows = await queryMessageMetricBuckets({
    organizationId,
    startTime,
    endTime,
    timezone,
    dimensions: ["period"],
    granularity: "daily",
  });

  const map = new Map<string, DailyBounceMetrics>();
  for (const row of rows) {
    const date = row.period as string;
    map.set(date, {
      permanent: row.bouncedPermanent,
      transient: row.bouncedTransient,
      undetermined: row.bouncedUndetermined,
      sent: row.sent,
    });
  }
  return map;
}

// ---------------------------------------------------------------------------
// Daily complaint metrics
// ---------------------------------------------------------------------------

export type DailyComplaintMetrics = {
  complaints: number;
  sent: number;
};

export async function getComplaintMetricsFromPostgres(
  organizationId: string,
  startTime: Date,
  endTime: Date,
  timezone = "UTC"
): Promise<Map<string, DailyComplaintMetrics>> {
  const rows = await queryMessageMetricBuckets({
    organizationId,
    startTime,
    endTime,
    timezone,
    dimensions: ["period"],
    granularity: "daily",
  });

  const map = new Map<string, DailyComplaintMetrics>();
  for (const row of rows) {
    const date = row.period as string;
    map.set(date, { complaints: row.complained, sent: row.sent });
  }
  return map;
}

// ---------------------------------------------------------------------------
// Daily suppression metrics
// ---------------------------------------------------------------------------

export type DailySuppressionMetrics = {
  suppressed: number;
  sent: number;
};

export async function getSuppressionMetricsFromPostgres(
  organizationId: string,
  startTime: Date,
  endTime: Date,
  timezone = "UTC"
): Promise<Map<string, DailySuppressionMetrics>> {
  const rows = await queryMessageMetricBuckets({
    organizationId,
    startTime,
    endTime,
    timezone,
    dimensions: ["period"],
    granularity: "daily",
  });

  const map = new Map<string, DailySuppressionMetrics>();
  for (const row of rows) {
    const date = row.period as string;
    map.set(date, { suppressed: row.suppressed, sent: row.sent });
  }
  return map;
}

// ---------------------------------------------------------------------------
// Top performers (grouped by subject)
// ---------------------------------------------------------------------------

export type TopPerformer = {
  subject: string;
  openRate: number;
  clickRate: number;
  sent: number;
  opens: number;
  clicks: number;
  sentAt: number;
};

/**
 * Ranks subjects by engagement over the SAME population the chart and the
 * emails list describe: this organization's email sends with a `sent_at`
 * inside the window. It used to filter on `delivered_at IS NOT NULL` while
 * reporting the group size as `sent`, so the column labelled "sent" in the UI
 * was really a delivered count, and every rate below it was divided by
 * deliveries while claiming to be per send.
 *
 * `sent` here means what it means everywhere else in this file: rows whose
 * status is not 'failed'. Groups where nothing actually left SES are dropped
 * rather than listed as a performer with a zero denominator.
 */
export async function getTopPerformersFromPostgres(
  organizationId: string,
  startTime: Date,
  endTime: Date,
  limit: number
): Promise<TopPerformer[]> {
  const sentCount = sql<number>`count(*) filter (where ${messageSend.status} != 'failed')::int`;
  const rows = await db
    .select({
      subject: messageSend.subject,
      sent: sentCount,
      opens: sql<number>`count(*) filter (where ${messageSend.openedAt} is not null and ${isNotBotOpen})::int`,
      clicks: sql<number>`count(*) filter (where ${messageSend.clickedAt} is not null)::int`,
      // Epoch millis, not the raw timestamp: drizzle's node-postgres driver
      // hands back timestamps as strings and only its own column mappers turn
      // them into Dates. A bare `sql<Date>` gets the string, so `.getTime()`
      // on it threw and took the whole route down whenever it had rows.
      earliestSentMs: sql<number>`(extract(epoch from min(${messageSend.sentAt})) * 1000)::float8`,
    })
    .from(messageSend)
    .where(
      and(
        eq(messageSend.organizationId, organizationId),
        eq(messageSend.channel, "email"),
        isNotNull(messageSend.sentAt),
        isNotNull(messageSend.subject),
        gte(messageSend.sentAt, startTime),
        lte(messageSend.sentAt, endTime)
      )
    )
    .groupBy(messageSend.subject)
    .having(sql`${sentCount} > 0`)
    .orderBy(
      desc(
        sql`count(*) filter (where ${messageSend.clickedAt} is not null) * 2 + count(*) filter (where ${messageSend.openedAt} is not null)`
      )
    )
    .limit(limit);

  return rows.map((r) => {
    const openRate = r.sent > 0 ? (r.opens / r.sent) * 100 : 0;
    const clickRate = r.sent > 0 ? (r.clicks / r.sent) * 100 : 0;
    return {
      subject: r.subject!,
      openRate: Number(openRate.toFixed(1)),
      clickRate: Number(clickRate.toFixed(1)),
      sent: r.sent,
      opens: r.opens,
      clicks: r.clicks,
      sentAt: r.earliestSentMs,
    };
  });
}

// ---------------------------------------------------------------------------
// Recent activity
// ---------------------------------------------------------------------------

export type RecentActivity = {
  id: string;
  /**
   * What `/[orgSlug]/emails/[emailId]` should be linked with. The detail route
   * resolves either the Postgres row id or the SES message id, and older rows
   * have no message id at all, so fall back to the row id.
   */
  messageId: string;
  subject: string;
  eventType: string;
  timestamp: number;
  sentAt: number;
  timestampFormatted: string;
  metadata: Record<string, unknown>;
};

export async function getRecentActivityFromPostgres(
  organizationId: string,
  limit: number
): Promise<RecentActivity[]> {
  const rows = await db
    .select({
      id: messageSend.id,
      messageId: messageSend.messageId,
      subject: messageSend.subject,
      status: messageSend.status,
      sentAt: messageSend.sentAt,
      deliveredAt: messageSend.deliveredAt,
      openedAt: messageSend.openedAt,
      clickedAt: messageSend.clickedAt,
      bouncedAt: messageSend.bouncedAt,
      complainedAt: messageSend.complainedAt,
      recipient: messageSend.recipient,
    })
    .from(messageSend)
    .where(
      and(
        eq(messageSend.organizationId, organizationId),
        eq(messageSend.channel, "email"),
        // Same predicate as every other reader in this file. Without it, rows
        // that were created but never sent (no `sent_at`) came back and were
        // stamped with `Date.now()` below - a queued message reported as
        // activity that happened just now.
        isNotNull(messageSend.sentAt)
      )
    )
    .orderBy(desc(messageSend.createdAt))
    .limit(limit);

  return rows.flatMap((r) => {
    const statusToEventType: Record<string, string> = {
      sent: "Send",
      delivered: "Delivery",
      opened: "Open",
      clicked: "Click",
      bounced: "Bounce",
      complained: "Complaint",
      suppressed: "Suppressed",
      failed: "Reject",
      pending: "Send",
      queued: "Send",
    };
    // The WHERE clause guarantees this; the guard is how TypeScript learns it,
    // and it is a skip rather than a fabricated timestamp so a row that somehow
    // arrives unsent is left out instead of being dated "just now".
    if (!r.sentAt) {
      return [];
    }

    const eventType = statusToEventType[r.status] ?? "Send";
    const sentAtTs = r.sentAt.getTime();

    // Use the most recent event timestamp, not always sentAt
    const eventTimeMap: Record<string, number | undefined> = {
      Open: r.openedAt?.getTime(),
      Click: r.clickedAt?.getTime(),
      Bounce: r.bouncedAt?.getTime(),
      Complaint: r.complainedAt?.getTime(),
    };
    const ts = eventTimeMap[eventType] ?? sentAtTs;

    return [
      {
        id: r.id,
        messageId: r.messageId ?? r.id,
        subject: r.subject ?? "(no subject)",
        eventType,
        timestamp: ts,
        sentAt: sentAtTs,
        timestampFormatted: new Date(ts).toISOString(),
        metadata: { to: r.recipient },
      },
    ];
  });
}
