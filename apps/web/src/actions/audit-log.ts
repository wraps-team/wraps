"use server";

import { auditLog, db } from "@wraps/db";
import { and, desc, eq, gte, lt, or } from "drizzle-orm";
import type { AuditLogAction } from "@/lib/audit";
import { getOrganizationPlan } from "@/lib/plan-limits";
import { getHistoryRetentionDays, isTopPlan, type PlanId } from "@/lib/plans";
import { orgAction } from "./shared/org-action";

export type { AuditLogAction } from "@/lib/audit";

export type ListAuditLogsResult =
  | {
      success: true;
      data: (typeof auditLog.$inferSelect)[];
      nextCursor: string | null;
      /**
       * The plan's history window in days. The query already cut the result
       * to it; carrying the number is what lets the viewer say so.
       *
       * Without this the cutoff was computed, applied, and discarded — an
       * owner on Free saw entries simply stop with nothing to distinguish
       * "nothing happened" from "your plan does not keep this".
       */
      retentionDays: number;
      /**
       * False on the top tier. The window is still worth stating there — it
       * explains where the log stops — but there is nothing to upgrade to,
       * and a CTA pointing at a plan the customer already has is worse than
       * the silent cutoff this replaced.
       */
      canExtend: boolean;
    }
  | { success: false; error: string };

export const listAuditLogs = orgAction(
  {
    name: "listAuditLogs",
    resource: "orgSettings",
    permission: ["read"],
    orgId: (
      organizationId: string,
      _opts?: {
        cursor?: string;
        limit?: number;
        filter?: {
          action?: AuditLogAction;
          actorId?: string;
          dateFrom?: Date;
          dateTo?: Date;
        };
      }
    ) => organizationId,
    onError: "Failed to load audit logs",
  },
  async (
    ctx,
    organizationId: string,
    opts?: {
      cursor?: string;
      limit?: number;
      filter?: {
        action?: AuditLogAction;
        actorId?: string;
        dateFrom?: Date;
        dateTo?: Date;
      };
    }
  ): Promise<ListAuditLogsResult> => {
    if (ctx.access.role !== "owner" && ctx.access.role !== "admin") {
      return { success: false, error: "Unauthorized" };
    }

    const planId = await getOrganizationPlan(organizationId);
    const retentionDays = getHistoryRetentionDays(planId);
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    const limit = opts?.limit ?? 50;
    const filter = opts?.filter;

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

    if (opts?.cursor) {
      const { createdAt, id } = JSON.parse(opts.cursor) as {
        createdAt: string;
        id: string;
      };
      const cursorDate = new Date(createdAt);
      const cursorCondition = or(
        lt(auditLog.createdAt, cursorDate),
        and(eq(auditLog.createdAt, cursorDate), lt(auditLog.id, id))
      );
      if (cursorCondition) conditions.push(cursorCondition);
    }

    const rows = await db
      .select()
      .from(auditLog)
      .where(and(...conditions))
      .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    const last = data.at(-1);
    const nextCursor =
      hasMore && last
        ? JSON.stringify({
            createdAt: last.createdAt.toISOString(),
            id: last.id,
          })
        : null;

    return {
      success: true,
      data,
      nextCursor,
      retentionDays,
      canExtend: !isTopPlan(planId as PlanId),
    };
  }
);
