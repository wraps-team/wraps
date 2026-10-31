/**
 * Audit-log read and export for `GET /v1/audit-logs` and `GET /v1/audit-logs/export`.
 *
 * Lifted from `apps/web/src/actions/audit-log.ts` (`listAuditLogs`) and
 * `apps/web/src/actions/export.ts` (`exportAuditLogs`). Both actions run under
 * `orgAction` (next/headers, revalidation) and read the plan through the
 * Next-side `getOrganizationPlan`, so the query is copied here rather than
 * imported. The retention table below is copied from `apps/web/src/lib/plans.ts`
 * (`historyRetentionDays`, `getNextPlan`, `auditLogExport`) and must stay in step
 * with it. The API retention worker (`workers/audit-log-cleanup.ts`) carries the
 * same windows.
 */

import { auditLog, db, encodeCursor, user } from "@wraps/db";
import { and, desc, eq, gte, lt, or, type SQL, sql } from "drizzle-orm";
import { isSelfHosted } from "../(ee)/lib/license";
import { isPlanId, type PlanId } from "../lib/plan-ids";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Same cap as `exportAuditLogs` (`MAX_EXPORT_ROWS`). */
export const MAX_EXPORT_ROWS = 50_000;
export const DEFAULT_LIST_LIMIT = 50;
export const MAX_LIST_LIMIT = 100;

/** `historyRetentionDays` per plan in apps/web/src/lib/plans.ts. */
const HISTORY_RETENTION_DAYS: Record<PlanId, number> = {
  free: 30,
  pro: 90,
  business: 365,
  starter: 90,
  growth: 365,
  scale: 365,
};

/**
 * Plans with no next tier (`isTopPlan`). `starter` maps to `pro` and `growth`
 * and `scale` map to `business`, so only these three are top.
 */
const TOP_PLANS: ReadonlySet<PlanId> = new Set<PlanId>([
  "business",
  "growth",
  "scale",
]);

/** Plans whose `features.auditLogExport` is true in apps/web/src/lib/plans.ts. */
const EXPORT_PLANS: ReadonlySet<PlanId> = new Set<PlanId>([
  "business",
  "growth",
  "scale",
]);

export type AuditLogFilter = {
  action?: string;
  actorId?: string;
  dateFrom?: Date;
  dateTo?: Date;
};

export type AuditLogRow = typeof auditLog.$inferSelect;

/**
 * The action resolves the plan with `getOrganizationPlan`, which defaults to
 * `free` when there is no active or trialing paid subscription. `authContext`
 * carries the same subscription row as `planId` (null when none), so null and
 * unknown ids map to `free` here too. Without that mapping retention would fall
 * back to 7 days.
 */
export function planForAudit(planId: string | null | undefined): PlanId {
  return isPlanId(planId) ? planId : "free";
}

export function auditRetentionDays(plan: PlanId): number {
  return HISTORY_RETENTION_DAYS[plan];
}

export function canExtendAuditHistory(plan: PlanId): boolean {
  return !TOP_PLANS.has(plan);
}

export function canExportAuditLogs(plan: PlanId): boolean {
  return isSelfHosted() || EXPORT_PLANS.has(plan);
}

function filterConditions(filter: AuditLogFilter): SQL[] {
  const conditions: SQL[] = [];
  if (filter.action) {
    conditions.push(eq(auditLog.action, filter.action));
  }
  if (filter.actorId) {
    conditions.push(eq(auditLog.userId, filter.actorId));
  }
  if (filter.dateFrom) {
    conditions.push(gte(auditLog.createdAt, filter.dateFrom));
  }
  if (filter.dateTo) {
    conditions.push(lt(auditLog.createdAt, filter.dateTo));
  }
  return conditions;
}

function retentionCutoff(retentionDays: number): Date {
  return new Date(Date.now() - retentionDays * DAY_MS);
}

export type ListAuditLogsResult = {
  data: AuditLogRow[];
  nextCursor: string | null;
  retentionDays: number;
  canExtend: boolean;
};

/**
 * Keyset page of the org's audit rows, newest first, cut to the plan's history
 * window. Mirrors `listAuditLogs`. `cursor` is already decoded by
 * `parseCursorParam`, so a malformed cursor never reaches this function.
 */
export async function listAuditLogsForOrg(input: {
  organizationId: string;
  planId: string | null | undefined;
  limit: number;
  cursor: { createdAt: Date; id: string } | null;
  filter: AuditLogFilter;
}): Promise<ListAuditLogsResult> {
  const plan = planForAudit(input.planId);
  const retentionDays = auditRetentionDays(plan);

  const cursorCondition = input.cursor
    ? or(
        lt(auditLog.createdAt, input.cursor.createdAt),
        and(
          eq(auditLog.createdAt, input.cursor.createdAt),
          lt(auditLog.id, input.cursor.id)
        )
      )
    : undefined;

  const rows = await db
    .select()
    .from(auditLog)
    .where(
      and(
        eq(auditLog.organizationId, input.organizationId),
        gte(auditLog.createdAt, retentionCutoff(retentionDays)),
        ...filterConditions(input.filter),
        cursorCondition
      )
    )
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(input.limit + 1);

  const hasMore = rows.length > input.limit;
  const data = hasMore ? rows.slice(0, input.limit) : rows;
  const last = data.at(-1);
  const nextCursor =
    hasMore && last ? encodeCursor(last.createdAt, last.id) : null;

  return {
    data,
    nextCursor,
    retentionDays,
    canExtend: canExtendAuditHistory(plan),
  };
}

export type ExportAuditLogsResult = {
  logs: AuditLogRow[];
  total: number;
  truncated: boolean;
};

export type AuditActor = {
  userId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
};

async function actorEmailFor(userId: string | null): Promise<string | null> {
  if (!userId) {
    return null;
  }
  const [row] = await db
    .select({ email: user.email })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return row?.email ?? null;
}

/**
 * Up to `MAX_EXPORT_ROWS` rows in the plan's window, plus the true match count.
 *
 * Like `exportAuditLogs`, this writes one `audit_log.exported` row in the same
 * transaction as the read (the dashboard's `ctx.audited`), so an export made
 * through the API leaves the same trail as one made from the dashboard.
 */
export async function exportAuditLogsForOrg(input: {
  organizationId: string;
  planId: string | null | undefined;
  filter: AuditLogFilter;
  actor: AuditActor;
}): Promise<ExportAuditLogsResult> {
  const plan = planForAudit(input.planId);
  const retentionDays = auditRetentionDays(plan);
  const { filter, actor, organizationId } = input;

  const cutoff = retentionCutoff(retentionDays);

  const actorEmail = await actorEmailFor(actor.userId);

  return db.transaction(async (tx) => {
    const [{ value: matchingCount }] = await tx
      .select({ value: sql<number>`count(*)::int` })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, organizationId),
          gte(auditLog.createdAt, cutoff),
          ...filterConditions(filter)
        )
      );

    const rows = await tx
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, organizationId),
          gte(auditLog.createdAt, cutoff),
          ...filterConditions(filter)
        )
      )
      .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
      .limit(MAX_EXPORT_ROWS);

    const truncated = matchingCount > rows.length;

    await tx.insert(auditLog).values({
      organizationId,
      userId: actor.userId,
      actorEmail,
      action: "audit_log.exported",
      resource: "auditLog",
      resourceId: null,
      metadata: {
        rowCount: rows.length,
        total: matchingCount,
        truncated,
        filter: {
          action: filter.action ?? null,
          actorId: filter.actorId ?? null,
          dateFrom: filter.dateFrom ? filter.dateFrom.toISOString() : null,
          dateTo: filter.dateTo ? filter.dateTo.toISOString() : null,
        },
      },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    return { logs: rows, total: matchingCount, truncated };
  });
}

const CSV_COLUMNS: Array<{
  header: string;
  accessor: (r: AuditLogRow) => string | null;
}> = [
  { header: "Timestamp", accessor: (r) => r.createdAt.toISOString() },
  { header: "Action", accessor: (r) => r.action },
  { header: "Resource", accessor: (r) => r.resource },
  { header: "Resource ID", accessor: (r) => r.resourceId },
  { header: "Actor Email", accessor: (r) => r.actorEmail },
  { header: "Actor ID", accessor: (r) => r.userId },
  { header: "IP Address", accessor: (r) => r.ipAddress },
  { header: "User Agent", accessor: (r) => r.userAgent },
  {
    header: "Metadata",
    accessor: (r) => (r.metadata ? JSON.stringify(r.metadata) : ""),
  },
];

// Same quoting as apps/web/src/lib/csv-export.ts `escapeCSVCell`.
const CSV_QUOTE_NEEDED = /[",\r\n]/;

function escapeCell(value: string | null | undefined): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (CSV_QUOTE_NEEDED.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** RFC 4180-style CSV with the columns of the dashboard's `auditLogCSVColumns`. */
export function auditLogsToCsv(rows: AuditLogRow[]): string {
  const header = CSV_COLUMNS.map((c) => escapeCell(c.header)).join(",");
  const body = rows.map((row) =>
    CSV_COLUMNS.map((c) => escapeCell(c.accessor(row))).join(",")
  );
  return [header, ...body].join("\n");
}
