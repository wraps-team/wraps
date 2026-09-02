"use server";

import {
  auditLog,
  contact,
  contactTopic,
  db,
  type EventFilters,
  escapeIlike,
  exportContactEvents,
  listBroadcasts,
} from "@wraps/db";
import { and, desc, eq, gte, ilike, lt, sql } from "drizzle-orm";
import type { AuditLogAction } from "@/lib/audit";
import type { BatchSendWithMeta, BatchStatus } from "@/lib/batch";
import type {
  ContactStatus,
  ContactWithMeta,
  EmailStatus,
  PreferredChannel,
  SmsStatus,
} from "@/lib/contacts";
import type { EventWithContact, ListEventsOptions } from "@/lib/events";
import { getOrganizationPlan } from "@/lib/plan-limits";
import { getHistoryRetentionDays } from "@/lib/plans";
import { orgAction } from "./shared/org-action";

const MAX_EXPORT_ROWS = 50_000;

export const exportAllContacts = orgAction(
  {
    name: "exportAllContacts",
    resource: "contacts",
    permission: ["export"],
    orgId: (
      organizationId: string,
      _options?: {
        search?: string;
        emailStatus?: EmailStatus;
        topicId?: string;
      }
    ) => organizationId,
    onError: "Failed to export contacts",
  },
  async (
    ctx,
    organizationId: string,
    options: {
      search?: string;
      emailStatus?: EmailStatus;
      topicId?: string;
    } = {}
  ): Promise<
    | {
        success: true;
        contacts: ContactWithMeta[];
        total: number;
        truncated: boolean;
      }
    | { success: false; error: string }
  > => {
    const { search, emailStatus, topicId } = options;

    // Build where conditions
    const conditions = [eq(contact.organizationId, organizationId)];

    if (search) {
      conditions.push(ilike(contact.email, `%${escapeIlike(search)}%`));
    }

    if (emailStatus) {
      conditions.push(eq(contact.emailStatus, emailStatus));
    }

    // If filtering by topic, we need a subquery
    let topicFilter: ReturnType<typeof sql> | undefined;
    if (topicId) {
      const subscribedContactIds = db
        .select({ contactId: contactTopic.contactId })
        .from(contactTopic)
        .where(
          and(
            eq(contactTopic.topicId, topicId),
            eq(contactTopic.status, "subscribed")
          )
        );
      topicFilter = sql`${contact.id} IN (${subscribedContactIds})`;
    }

    const whereClause = topicFilter
      ? and(...conditions, topicFilter)
      : and(...conditions);

    // The real count of everything matching, independent of MAX_EXPORT_ROWS,
    // so `total` below can be honest instead of reporting the truncated
    // fetch's own length as if it were the whole match (audit F23 — this was
    // the same "count that lies" class the broadcast wave removed downstream).
    const [{ value: matchingCount }] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(contact)
      .where(whereClause);

    // Get contacts without pagination, with safety cap
    const contacts = await db.query.contact.findMany({
      where: whereClause,
      with: {
        createdByUser: {
          columns: {
            id: true,
            name: true,
            email: true,
          },
        },
        topics: {
          with: {
            topic: {
              columns: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: [desc(contact.createdAt)],
      limit: MAX_EXPORT_ROWS,
    });

    return {
      success: true,
      contacts: contacts.map((c) => ({
        id: c.id,
        email: c.email,
        emailStatus: c.emailStatus as EmailStatus | null,
        emailVerifiedAt: c.emailVerifiedAt,
        emailUnsubscribedAt: c.emailUnsubscribedAt,
        emailBouncedAt: c.emailBouncedAt,
        emailComplainedAt: c.emailComplainedAt,
        emailSuppressedAt: c.emailSuppressedAt,
        lastEmailSentAt: c.lastEmailSentAt,
        lastEmailOpenedAt: c.lastEmailOpenedAt,
        lastEmailClickedAt: c.lastEmailClickedAt,
        emailsSent: c.emailsSent,
        emailsOpened: c.emailsOpened,
        emailsClicked: c.emailsClicked,
        phone: c.phone,
        smsStatus: c.smsStatus as SmsStatus | null,
        smsConsentedAt: c.smsConsentedAt,
        smsOptedOutAt: c.smsOptedOutAt,
        smsInvalidAt: c.smsInvalidAt,
        lastSmsSentAt: c.lastSmsSentAt,
        lastSmsClickedAt: c.lastSmsClickedAt,
        smsSent: c.smsSent,
        smsClicked: c.smsClicked,
        firstName: c.firstName,
        lastName: c.lastName,
        company: c.company,
        jobTitle: c.jobTitle,
        preferredChannel: c.preferredChannel as PreferredChannel | null,
        properties: (c.properties as Record<string, unknown>) || {},
        lastActivityAt: c.lastActivityAt,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        createdBy: c.createdByUser,
        topics: c.topics.map((ct) => ({
          topicId: ct.topic.id,
          topicName: ct.topic.name,
          status: ct.status,
          subscribedAt: ct.subscribedAt,
        })),
        status: c.status as ContactStatus,
        confirmedAt: c.confirmedAt,
        unsubscribedAt: c.unsubscribedAt,
        bouncedAt: c.bouncedAt,
        complainedAt: c.complainedAt,
      })),
      total: matchingCount,
      truncated: matchingCount > contacts.length,
    };
  }
);

export const exportAllBroadcasts = orgAction(
  {
    name: "exportAllBroadcasts",
    resource: "broadcasts",
    permission: ["read"],
    orgId: (
      organizationId: string,
      _options?: { search?: string; status?: BatchStatus }
    ) => organizationId,
    onError: "Failed to export broadcasts",
  },
  async (
    ctx,
    organizationId: string,
    options: { search?: string; status?: BatchStatus } = {}
  ): Promise<
    | {
        success: true;
        batches: BatchSendWithMeta[];
        total: number;
        truncated: boolean;
      }
    | { success: false; error: string }
  > => {
    const { batches, total } = await listBroadcasts(organizationId, {
      search: options.search,
      status: options.status,
      page: 1,
      pageSize: MAX_EXPORT_ROWS,
    });

    return {
      success: true,
      batches: batches.map((b) => ({
        id: b.id,
        name: b.name,
        channel: b.channel as BatchSendWithMeta["channel"],
        status: b.status as BatchStatus,
        subject: b.subject,
        previewText: b.previewText,
        from: b.from,
        fromName: b.fromName,
        replyTo: b.replyTo,
        templateId: b.emailTemplateId,
        templateName: b.emailTemplate?.name,
        totalRecipients: b.totalRecipients,
        processedRecipients: b.processedRecipients,
        sent: b.sent,
        delivered: b.delivered,
        failed: b.failed,
        opened: b.opened,
        clicked: b.clicked,
        bounced: b.bounced,
        complained: b.complained,
        errorMessage: b.errorMessage,
        pausedReason: b.pausedReason,
        lastChunkAt: b.lastChunkAt,
        scheduledFor: b.scheduledFor,
        startedAt: b.startedAt,
        completedAt: b.completedAt,
        createdAt: b.createdAt,
        createdBy: b.createdByUser,
        awsAccount: b.awsAccount,
      })),
      total,
      truncated: total > batches.length,
    };
  }
);

export const exportAllEvents = orgAction(
  {
    name: "exportAllEvents",
    resource: "events",
    permission: ["export"],
    orgId: (
      organizationId: string,
      _options?: Omit<ListEventsOptions, "page" | "pageSize">
    ) => organizationId,
    onError: "Failed to export events",
  },
  async (
    ctx,
    organizationId: string,
    options: Omit<ListEventsOptions, "page" | "pageSize"> = {}
  ): Promise<
    | { success: true; events: EventWithContact[]; total: number }
    | { success: false; error: string }
  > => {
    const events = await exportContactEvents(
      organizationId,
      options as EventFilters,
      MAX_EXPORT_ROWS
    );

    return {
      success: true,
      events: events as EventWithContact[],
      total: events.length,
    };
  }
);

export type AuditLogExportFilter = {
  action?: AuditLogAction;
  actorId?: string;
  dateFrom?: Date;
  dateTo?: Date;
};

export const exportAuditLogs = orgAction(
  {
    name: "exportAuditLogs",
    resource: "orgSettings",
    permission: ["read"],
    orgId: (
      organizationId: string,
      _options?: { filter?: AuditLogExportFilter }
    ) => organizationId,
    onError: "Failed to export audit logs",
    feature: "auditLogExport",
  },
  async (
    ctx,
    organizationId: string,
    options: { filter?: AuditLogExportFilter } = {}
  ): Promise<
    | {
        success: true;
        logs: (typeof auditLog.$inferSelect)[];
        total: number;
        truncated: boolean;
      }
    | { success: false; error: string }
  > => {
    if (ctx.access.role !== "owner" && ctx.access.role !== "admin") {
      return { success: false, error: "Unauthorized" };
    }

    const planId = await getOrganizationPlan(organizationId);
    const retentionDays = getHistoryRetentionDays(planId);
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    const filter = options.filter;

    const conditions = [
      eq(auditLog.organizationId, organizationId),
      gte(auditLog.createdAt, cutoff),
    ];

    if (filter?.action) {
      conditions.push(eq(auditLog.action, filter.action));
    }

    if (filter?.actorId) {
      conditions.push(eq(auditLog.userId, filter.actorId));
    }

    if (filter?.dateFrom) {
      conditions.push(gte(auditLog.createdAt, filter.dateFrom));
    }

    if (filter?.dateTo) {
      conditions.push(lt(auditLog.createdAt, filter.dateTo));
    }

    const whereClause = and(...conditions);

    const { rows, matchingCount } = await ctx.audited(
      async (tx) => {
        // The real count of everything matching, independent of
        // MAX_EXPORT_ROWS, so `total` below can be honest instead of
        // reporting the truncated fetch's own length as if it were the whole
        // match (audit F23 — see exportAllContacts above for the original
        // finding).
        const [{ value: matchingCount }] = await tx
          .select({ value: sql<number>`count(*)::int` })
          .from(auditLog)
          .where(whereClause);

        const rows = await tx
          .select()
          .from(auditLog)
          .where(whereClause)
          .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
          .limit(MAX_EXPORT_ROWS);

        return { rows, matchingCount };
      },
      (result) => ({
        action: "audit_log.exported" as const,
        resource: "auditLog",
        metadata: {
          rowCount: result.rows.length,
          total: result.matchingCount,
          truncated: result.matchingCount > result.rows.length,
          filter: {
            action: filter?.action ?? null,
            actorId: filter?.actorId ?? null,
            dateFrom: filter?.dateFrom ? filter.dateFrom.toISOString() : null,
            dateTo: filter?.dateTo ? filter.dateTo.toISOString() : null,
          },
        },
      })
    );

    return {
      success: true,
      logs: rows,
      total: matchingCount,
      truncated: matchingCount > rows.length,
    };
  }
);
