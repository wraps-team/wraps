"use server";

import {
  batchSend,
  contact,
  contactEvent,
  db,
  messageSend,
  workflow,
  workflowExecution,
} from "@wraps/db";
import { and, count, desc, eq, gt, isNull, or, sql } from "drizzle-orm";
import { orgAction } from "./shared/org-action";

// ═══════════════════════════════════════════════════════════════════════════
// TIMELINE TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type TimelineEventType =
  | "message" // Consolidated message event (email or SMS)
  | "workflow_started"
  | "workflow_completed"
  | "workflow_failed"
  | "contact_created"
  | "custom_event"; // Custom events tracked from SDK

export type MessageStatusTimestamps = {
  sentAt?: Date | null;
  deliveredAt?: Date | null;
  openedAt?: Date | null;
  clickedAt?: Date | null;
  bouncedAt?: Date | null;
  complainedAt?: Date | null;
  optedOutAt?: Date | null; // SMS only
};

export type TimelineEvent = {
  id: string;
  type: TimelineEventType;
  timestamp: Date;
  // Message-specific (type: "message")
  channel?: "email" | "sms";
  subject?: string | null;
  recipient?: string | null;
  sourceType?: "transactional" | "batch" | "campaign" | "workflow" | null;
  batchId?: string | null;
  batchName?: string | null;
  messageId?: string | null;
  status?: MessageStatusTimestamps; // Consolidated status timestamps
  // Workflow-specific
  workflowId?: string | null;
  workflowName?: string | null;
  executionId?: string | null;
  triggerType?: string | null;
  eventName?: string | null;
  eventData?: Record<string, unknown> | null;
};

/**
 * What the timeline can and cannot account for.
 *
 * Without this the timeline had one empty state — "No activity yet" — for two
 * very different situations: a contact nothing has ever been sent to, and a
 * contact whose events have aged out of stored history. The second one is a
 * confident false statement, so the shape below lets the UI tell them apart.
 */
export type TimelineHistory = {
  /** `contact_event` rows past their `expires_at` — recorded, no longer shown. */
  agedOutEvents: number;
  /**
   * The contact's own counters record engagement the timeline has no rows for.
   * Means "there is history we can't show", not "nothing happened".
   */
  hasUnshowableHistory: boolean;
  /** Emails the contact's counters say were sent, whatever survives as events. */
  recordedEmailsSent: number;
  /** SMS the contact's counters say were sent. */
  recordedSmsSent: number;
};

export type GetContactTimelineResult =
  | {
      success: true;
      events: TimelineEvent[];
      hasMore: boolean;
      history: TimelineHistory;
    }
  | { success: false; error: string };

/**
 * Ceiling on rows pulled from any one timeline source per request.
 *
 * Each source is fetched `offset + limit + 1` deep rather than a fixed 50/20/50,
 * because a k-way merge of three descending lists only needs the top
 * `offset + limit` of each to be globally correct. The old fixed caps made
 * `hasMore` go false at roughly 120 events no matter how chatty the contact
 * was, and everything older became unreachable.
 */
const MAX_SOURCE_ROWS = 500;

/**
 * Get timeline events for a contact
 */
export const getContactTimeline = orgAction(
  {
    name: "getContactTimeline",
    resource: "contacts",
    permission: ["read"],
    orgId: (
      _contactId: string,
      organizationId: string,
      _options?: { limit?: number; offset?: number }
    ) => organizationId,
    onError: "Failed to fetch timeline",
  },
  async (
    ctx,
    contactId: string,
    organizationId: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<GetContactTimelineResult> => {
    const { limit = 20, offset = 0 } = options;
    const events: TimelineEvent[] = [];
    const now = new Date();

    // Top-(offset+limit+1) of each source is enough for a correct merge.
    const depth = Math.min(offset + limit + 1, MAX_SOURCE_ROWS);
    let sourceTruncated = false;

    // Verify contact exists and get created date
    const contactRecord = await db.query.contact.findFirst({
      where: (c, { and, eq }) =>
        and(eq(c.id, contactId), eq(c.organizationId, organizationId)),
    });

    if (!contactRecord) {
      return { success: false, error: "Contact not found" };
    }

    // Add contact created event
    events.push({
      id: `contact_created_${contactRecord.id}`,
      type: "contact_created",
      timestamp: contactRecord.createdAt,
    });

    // Fetch messages sent to this contact
    const messages = await db
      .select({
        id: messageSend.id,
        channel: messageSend.channel,
        subject: messageSend.subject,
        recipient: messageSend.recipient,
        sourceType: messageSend.sourceType,
        batchSendId: messageSend.batchSendId,
        batchName: batchSend.name,
        messageId: messageSend.messageId,
        status: messageSend.status,
        sentAt: messageSend.sentAt,
        deliveredAt: messageSend.deliveredAt,
        openedAt: messageSend.openedAt,
        clickedAt: messageSend.clickedAt,
        bouncedAt: messageSend.bouncedAt,
        complainedAt: messageSend.complainedAt,
        optedOutAt: messageSend.optedOutAt,
        createdAt: messageSend.createdAt,
      })
      .from(messageSend)
      .leftJoin(batchSend, eq(messageSend.batchSendId, batchSend.id))
      .where(
        and(
          eq(messageSend.contactId, contactId),
          eq(messageSend.organizationId, organizationId)
        )
      )
      .orderBy(desc(messageSend.createdAt))
      .limit(depth);

    sourceTruncated ||= messages.length >= depth;

    // Convert messages to consolidated timeline events (one event per message)
    for (const msg of messages) {
      // Use sentAt as the primary timestamp, fallback to createdAt
      const timestamp = msg.sentAt ?? msg.createdAt;

      events.push({
        id: msg.id,
        type: "message",
        timestamp,
        channel: msg.channel as "email" | "sms",
        subject: msg.subject,
        recipient: msg.recipient,
        sourceType: msg.sourceType,
        batchId: msg.batchSendId,
        batchName: msg.batchName,
        messageId: msg.messageId,
        status: {
          sentAt: msg.sentAt,
          deliveredAt: msg.deliveredAt,
          openedAt: msg.openedAt,
          clickedAt: msg.clickedAt,
          bouncedAt: msg.bouncedAt,
          complainedAt: msg.complainedAt,
          optedOutAt: msg.optedOutAt,
        },
      });
    }

    // Fetch workflow executions for this contact
    const executions = await db
      .select({
        id: workflowExecution.id,
        workflowId: workflowExecution.workflowId,
        workflowName: workflow.name,
        status: workflowExecution.status,
        triggerType: workflow.triggerType,
        triggerConfig: workflow.triggerConfig,
        triggerData: workflowExecution.triggerData,
        startedAt: workflowExecution.startedAt,
        completedAt: workflowExecution.completedAt,
        createdAt: workflowExecution.createdAt,
      })
      .from(workflowExecution)
      .innerJoin(workflow, eq(workflowExecution.workflowId, workflow.id))
      .where(
        and(
          eq(workflowExecution.contactId, contactId),
          eq(workflowExecution.organizationId, organizationId)
        )
      )
      .orderBy(desc(workflowExecution.createdAt))
      .limit(depth);

    sourceTruncated ||= executions.length >= depth;

    // Convert workflow executions to timeline events
    for (const exec of executions) {
      const triggerConfig = exec.triggerConfig as { eventName?: string } | null;
      const baseEvent = {
        workflowId: exec.workflowId,
        workflowName: exec.workflowName,
        executionId: exec.id,
        triggerType: exec.triggerType,
        eventName: triggerConfig?.eventName ?? null,
        eventData: exec.triggerData as Record<string, unknown> | null,
      };

      // Add completion/failure event
      if (exec.status === "completed" && exec.completedAt) {
        events.push({
          id: `${exec.id}_completed`,
          type: "workflow_completed",
          timestamp: exec.completedAt,
          ...baseEvent,
        });
      } else if (exec.status === "failed" && exec.completedAt) {
        events.push({
          id: `${exec.id}_failed`,
          type: "workflow_failed",
          timestamp: exec.completedAt,
          ...baseEvent,
        });
      }

      // Add started event
      if (exec.startedAt) {
        events.push({
          id: `${exec.id}_started`,
          type: "workflow_started",
          timestamp: exec.startedAt,
          ...baseEvent,
        });
      }
    }

    // Fetch custom events for this contact
    const customEvents = await db
      .select({
        id: contactEvent.id,
        eventName: contactEvent.eventName,
        eventData: contactEvent.eventData,
        createdAt: contactEvent.createdAt,
      })
      .from(contactEvent)
      .where(
        and(
          eq(contactEvent.contactId, contactId),
          eq(contactEvent.organizationId, organizationId),
          // An event past its expires_at is gone as far as the product is
          // concerned — it is counted below and reported, never rendered as if
          // it were still part of the history.
          or(isNull(contactEvent.expiresAt), gt(contactEvent.expiresAt, now))
        )
      )
      .orderBy(desc(contactEvent.createdAt))
      .limit(depth);

    sourceTruncated ||= customEvents.length >= depth;

    // Events that have aged out. The timeline can't show them, but it can say
    // they existed instead of claiming nothing ever happened.
    const [agedOutResult] = await db
      .select({ count: count() })
      .from(contactEvent)
      .where(
        and(
          eq(contactEvent.contactId, contactId),
          eq(contactEvent.organizationId, organizationId),
          sql`${contactEvent.expiresAt} IS NOT NULL`,
          sql`${contactEvent.expiresAt} <= ${now}`
        )
      );
    const agedOutEvents = Number(agedOutResult?.count ?? 0);

    // Convert custom events to timeline events
    for (const customEvent of customEvents) {
      events.push({
        id: customEvent.id,
        type: "custom_event",
        timestamp: customEvent.createdAt,
        eventName: customEvent.eventName,
        eventData: customEvent.eventData as Record<string, unknown> | null,
      });
    }

    // Sort all events by timestamp descending
    events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Apply pagination
    const paginatedEvents = events.slice(offset, offset + limit);
    const hasMore = events.length > offset + limit || sourceTruncated;

    const recordedEmailsSent = contactRecord.emailsSent ?? 0;
    const recordedSmsSent = contactRecord.smsSent ?? 0;

    return {
      success: true,
      events: paginatedEvents,
      hasMore,
      history: {
        agedOutEvents,
        // Counters say messages went out but no message row survives to show
        // them. Sends recorded before this contact's history was retained, or
        // rows cleaned up since — either way, "no activity" would be a lie.
        hasUnshowableHistory:
          agedOutEvents > 0 ||
          ((recordedEmailsSent > 0 || recordedSmsSent > 0) &&
            messages.length === 0),
        recordedEmailsSent,
        recordedSmsSent,
      },
    };
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// ANALYTICS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Contacts by email status, organization-wide.
 *
 * The card above the contacts table reported one number — total contacts — and
 * nothing about whether that list is healthy. For someone who owns their SES
 * account this is the figure that matters: bounces and complaints are what
 * costs them their sending reputation, and they were nowhere on this surface.
 */
export type ContactListHealth = {
  active: number;
  unsubscribed: number;
  bounced: number;
  complained: number;
  suppressed: number;
  /** Contacts with no email status yet — SMS-only contacts included. */
  noEmailStatus: number;
};

export type ContactAnalytics = {
  /** Organization-wide, never scoped to the table's filters. */
  totalContacts: number;
  newContactsThisPeriod: number;
  growthPercent: number;
  avgOpenRate: number;
  avgClickRate: number;
  dailyGrowth: Array<{ date: string; count: number }>;
  /** Organization-wide, same scope as totalContacts. */
  listHealth: ContactListHealth;
};

export type GetContactAnalyticsResult =
  | { success: true; analytics: ContactAnalytics }
  | { success: false; error: string };

/**
 * Get contact analytics for an organization
 */
export const getContactAnalytics = orgAction(
  {
    name: "getContactAnalytics",
    resource: "contacts",
    permission: ["read"],
    orgId: (organizationId: string, _days?: 7 | 30, _timezone?: string) =>
      organizationId,
    onError: "Failed to fetch contact analytics",
  },
  async (
    ctx,
    organizationId: string,
    days: 7 | 30 = 30,
    timezone = "UTC"
  ): Promise<GetContactAnalyticsResult> => {
    const now = new Date();

    // Validate timezone — fall back to UTC if invalid
    let tz = timezone;
    try {
      Intl.DateTimeFormat("en-CA", { timeZone: tz });
    } catch {
      tz = "UTC";
    }

    // Compute date boundaries in user's timezone.
    //
    // INVARIANT — both windows span exactly `days` calendar days, and
    // `dailyGrowth.length === days`:
    //   current  = [startStr, todayStr]     inclusive at both ends
    //   previous = [prevStartStr, startStr) half-open at the top
    //
    // `startStr` is the FIRST day *inside* the current window, so it is
    // `today - (days - 1)`. It used to be `today - days`, which — against
    // queries inclusive of both endpoints — made the current window `days + 1`
    // days long while the previous window stayed `days`, so `growthPercent`
    // divided a 31-day count by a 30-day one and overstated growth by roughly
    // one day of signups.
    //
    // Four consumers depend on these two boundaries: `newContactsThisPeriod`,
    // `previousPeriodContacts`, the `dailyGrowth` query, and the gap-fill walk
    // at the bottom of this function. They must agree on the conventions above
    // — changing one alone re-introduces the mismatch.
    const todayStr = now.toLocaleDateString("en-CA", { timeZone: tz });
    const [y, m, d] = todayStr.split("-").map(Number);
    const startStr = new Date(Date.UTC(y, m - 1, d - (days - 1)))
      .toISOString()
      .split("T")[0];
    const prevStartStr = new Date(Date.UTC(y, m - 1, d - (days * 2 - 1)))
      .toISOString()
      .split("T")[0];

    // SQL helper: convert stored UTC timestamp to user's timezone
    // Use sql.raw for the timezone literal so all references produce identical
    // SQL expressions — parameterized values get unique indices ($1, $3, $5...)
    // which PostgreSQL treats as distinct in GROUP BY.
    // Timezone is validated above via Intl.DateTimeFormat so this is injection-safe.
    const tzLiteral = sql.raw(`'${tz}'`);
    const createdAtLocal = sql`${contact.createdAt} AT TIME ZONE 'UTC' AT TIME ZONE ${tzLiteral}`;

    // Run all six independent queries concurrently
    const [
      [totalResult],
      [newContactsResult],
      [previousPeriodResult],
      [engagementResult],
      dailyGrowthData,
      statusRows,
    ] = await Promise.all([
      // Total contacts
      db
        .select({ count: count() })
        .from(contact)
        .where(eq(contact.organizationId, organizationId)),

      // New contacts in this period: [startStr, todayStr], `days` days
      db
        .select({ count: count() })
        .from(contact)
        .where(
          and(
            eq(contact.organizationId, organizationId),
            sql`DATE(${createdAtLocal}) >= ${startStr}::date`,
            sql`DATE(${createdAtLocal}) <= ${todayStr}::date`
          )
        ),

      // Previous period for growth: [prevStartStr, startStr), also `days` days
      db
        .select({ count: count() })
        .from(contact)
        .where(
          and(
            eq(contact.organizationId, organizationId),
            sql`DATE(${createdAtLocal}) >= ${prevStartStr}::date`,
            sql`DATE(${createdAtLocal}) < ${startStr}::date`
          )
        ),

      // Average open and click rates
      db
        .select({
          totalSent: sql<number>`COALESCE(SUM(${contact.emailsSent}), 0)`,
          totalOpened: sql<number>`COALESCE(SUM(${contact.emailsOpened}), 0)`,
          totalClicked: sql<number>`COALESCE(SUM(${contact.emailsClicked}), 0)`,
        })
        .from(contact)
        .where(
          and(
            eq(contact.organizationId, organizationId),
            sql`${contact.emailsSent} > 0`
          )
        ),

      // Daily growth data for chart, grouped by user's local date. Same
      // window as newContactsThisPeriod, so the chart sums to that number.
      db
        .select({
          date: sql<string>`DATE(${createdAtLocal})::text`,
          count: count(),
        })
        .from(contact)
        .where(
          and(
            eq(contact.organizationId, organizationId),
            sql`DATE(${createdAtLocal}) >= ${startStr}::date`,
            sql`DATE(${createdAtLocal}) <= ${todayStr}::date`
          )
        )
        .groupBy(sql`DATE(${createdAtLocal})`)
        .orderBy(sql`DATE(${createdAtLocal})`),

      // List health: contacts per email status, organization-wide
      db
        .select({ status: contact.emailStatus, count: count() })
        .from(contact)
        .where(eq(contact.organizationId, organizationId))
        .groupBy(contact.emailStatus),
    ]);

    const listHealth: ContactListHealth = {
      active: 0,
      unsubscribed: 0,
      bounced: 0,
      complained: 0,
      suppressed: 0,
      noEmailStatus: 0,
    };
    for (const row of statusRows) {
      const bucket = row.status ?? "noEmailStatus";
      if (bucket in listHealth) {
        listHealth[bucket as keyof ContactListHealth] += Number(row.count);
      } else {
        // An email_status the UI doesn't have a bucket for still belongs in a
        // total the operator can see, rather than silently vanishing.
        listHealth.noEmailStatus += Number(row.count);
      }
    }

    const totalContacts = totalResult?.count ?? 0;
    const newContactsThisPeriod = newContactsResult?.count ?? 0;
    const previousPeriodContacts = previousPeriodResult?.count ?? 0;

    // Calculate growth percent
    const growthPercent =
      previousPeriodContacts > 0
        ? ((newContactsThisPeriod - previousPeriodContacts) /
            previousPeriodContacts) *
          100
        : newContactsThisPeriod > 0
          ? 100
          : 0;

    const totalSent = Number(engagementResult?.totalSent ?? 0);
    const totalOpened = Number(engagementResult?.totalOpened ?? 0);
    const totalClicked = Number(engagementResult?.totalClicked ?? 0);

    const avgOpenRate = totalSent > 0 ? (totalOpened / totalSent) * 100 : 0;
    const avgClickRate = totalSent > 0 ? (totalClicked / totalSent) * 100 : 0;

    // Fill in missing dates with 0 counts
    const dailyGrowth: Array<{ date: string; count: number }> = [];
    const dateMap = new Map(
      dailyGrowthData.map((d) => [
        String(d.date).split("T")[0],
        Number(d.count),
      ])
    );

    // Walk from startStr to todayStr inclusive (both in user's timezone).
    // startStr is today - (days - 1), so this emits exactly `days` points.
    const [sy, sm, sd] = startStr.split("-").map(Number);
    const [ey, em, ed] = todayStr.split("-").map(Number);
    const cursor = new Date(Date.UTC(sy, sm - 1, sd));
    const endUTC = Date.UTC(ey, em - 1, ed);

    while (cursor.getTime() <= endUTC) {
      const dateStr = cursor.toISOString().split("T")[0];
      dailyGrowth.push({
        date: dateStr,
        count: dateMap.get(dateStr) ?? 0,
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return {
      success: true,
      analytics: {
        totalContacts,
        newContactsThisPeriod,
        growthPercent: Math.round(growthPercent * 10) / 10,
        avgOpenRate: Math.round(avgOpenRate * 10) / 10,
        avgClickRate: Math.round(avgClickRate * 10) / 10,
        dailyGrowth,
        listHealth,
      },
    };
  }
);
