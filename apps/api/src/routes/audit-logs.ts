/**
 * GET /v1/audit-logs and GET /v1/audit-logs/export.
 *
 * Read-only views of the org's audit log, lifted from the dashboard's
 * `listAuditLogs` and `exportAuditLogs` (apps/web/src/actions/audit-log.ts and
 * export.ts). Access matches those actions: the `orgSettings` read permission,
 * then owner or admin only. Export also needs the Business plan (or a licence).
 * Both are scoped to the caller's org and cut to the plan's history window.
 *
 * `/export` is a static segment with no `/:id` sibling in this prefix, so the
 * mount order does not matter for these routes.
 */

import { t } from "elysia";
import { parseCursorParam } from "../lib/cursor";
import { requirePermission } from "../lib/require-permission";
import { createAuthenticatedRoutes, getAuth } from "../middleware/auth";
import {
  type AuditLogFilter,
  type AuditLogRow,
  auditLogsToCsv,
  canExportAuditLogs,
  DEFAULT_LIST_LIMIT,
  exportAuditLogsForOrg,
  listAuditLogsForOrg,
  MAX_LIST_LIMIT,
  planForAudit,
} from "../services/audit-logs";

const errorResponse = t.Object({ error: t.String() });

const WHOLE_NUMBER = /^\d+$/;

const OWNER_OR_ADMIN_ONLY =
  "Audit logs are available to owners and admins only.";
const EXPORT_PLAN_REQUIRED =
  "Audit log export requires a Business plan or higher.";

const auditLogRowSchema = t.Object({
  id: t.String(),
  organizationId: t.String(),
  userId: t.Nullable(t.String()),
  actorEmail: t.Nullable(t.String()),
  action: t.String(),
  resource: t.String(),
  resourceId: t.Nullable(t.String()),
  metadata: t.Nullable(t.Record(t.String(), t.Unknown())),
  ipAddress: t.Nullable(t.String()),
  userAgent: t.Nullable(t.String()),
  createdAt: t.String(),
});

const listQuery = t.Object({
  limit: t.Optional(t.String({ maxLength: 4 })),
  cursor: t.Optional(t.String({ maxLength: 512 })),
  action: t.Optional(t.String({ maxLength: 64 })),
  actorId: t.Optional(t.String({ maxLength: 255 })),
  dateFrom: t.Optional(t.String({ maxLength: 64 })),
  dateTo: t.Optional(t.String({ maxLength: 64 })),
});

const exportQuery = t.Object({
  ...listQuery.properties,
  format: t.Optional(t.String({ maxLength: 8 })),
});

function toRow(row: AuditLogRow) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    userId: row.userId,
    actorEmail: row.actorEmail,
    action: row.action,
    resource: row.resource,
    resourceId: row.resourceId,
    metadata: row.metadata ?? null,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    createdAt: row.createdAt.toISOString(),
  };
}

function parseLimit(
  raw: string | undefined,
  set: { status?: unknown }
): number {
  if (raw === undefined) {
    return DEFAULT_LIST_LIMIT;
  }
  const value = Number(raw);
  if (!WHOLE_NUMBER.test(raw) || value < 1 || value > MAX_LIST_LIMIT) {
    set.status = 400;
    throw new Error(`limit must be a whole number from 1 to ${MAX_LIST_LIMIT}`);
  }
  return value;
}

function parseDate(
  name: string,
  raw: string | undefined,
  set: { status?: unknown }
): Date | undefined {
  if (raw === undefined) {
    return;
  }
  const value = new Date(raw);
  if (Number.isNaN(value.getTime())) {
    set.status = 400;
    throw new Error(
      `${name} must be an ISO 8601 date, for example 2026-10-01 or 2026-10-01T00:00:00Z`
    );
  }
  return value;
}

function parseFilter(
  query: {
    action?: string;
    actorId?: string;
    dateFrom?: string;
    dateTo?: string;
  },
  set: { status?: unknown }
): AuditLogFilter {
  return {
    action: query.action || undefined,
    actorId: query.actorId || undefined,
    dateFrom: parseDate("dateFrom", query.dateFrom, set),
    dateTo: parseDate("dateTo", query.dateTo, set),
  };
}

function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded ? forwarded.split(",")[0].trim() : null;
}

export const auditLogsRoutes = createAuthenticatedRoutes("/v1/audit-logs")
  .get(
    "/",
    async (ctx) => {
      const { query, set } = ctx;
      const authContext = getAuth(ctx);

      const gate = await requirePermission(ctx, "orgSettings", ["read"]);
      if (!gate.ok) {
        return gate.body;
      }
      if (gate.role !== "owner" && gate.role !== "admin") {
        set.status = 403;
        return { error: OWNER_OR_ADMIN_ONLY };
      }

      const limit = parseLimit(query.limit, set);
      const cursor = parseCursorParam(query.cursor, set);
      const filter = parseFilter(query, set);

      const result = await listAuditLogsForOrg({
        organizationId: authContext.organizationId,
        planId: authContext.planId,
        limit,
        cursor,
        filter,
      });

      return {
        data: result.data.map(toRow),
        nextCursor: result.nextCursor,
        retentionDays: result.retentionDays,
        canExtend: result.canExtend,
      };
    },
    {
      query: listQuery,
      response: {
        200: t.Object({
          data: t.Array(auditLogRowSchema),
          nextCursor: t.Nullable(t.String()),
          retentionDays: t.Number(),
          canExtend: t.Boolean(),
        }),
        400: errorResponse,
        403: errorResponse,
      },
      detail: {
        tags: ["audit-logs"],
        summary: "List audit log entries",
        description:
          "Newest first, keyset-paginated (limit 1-100, default 50; pass nextCursor back unchanged as cursor). Filter with action, actorId, dateFrom and dateTo. Only rows inside the plan's history window are returned; retentionDays states that window and canExtend says whether a higher plan lengthens it. Requires the orgSettings read permission and the owner or admin role.",
      },
    }
  )
  .get(
    "/export",
    async (ctx) => {
      const { query, set, request } = ctx;
      const authContext = getAuth(ctx);

      const gate = await requirePermission(ctx, "orgSettings", ["read"]);
      if (!gate.ok) {
        return gate.body;
      }

      const format = query.format ?? "json";
      if (format !== "json" && format !== "csv") {
        set.status = 400;
        return { error: "format must be json or csv" };
      }

      const planId = planForAudit(authContext.planId);
      if (!canExportAuditLogs(planId)) {
        set.status = 403;
        return { error: EXPORT_PLAN_REQUIRED };
      }
      if (gate.role !== "owner" && gate.role !== "admin") {
        set.status = 403;
        return { error: OWNER_OR_ADMIN_ONLY };
      }

      const filter = parseFilter(query, set);
      const result = await exportAuditLogsForOrg({
        organizationId: authContext.organizationId,
        planId: authContext.planId,
        filter,
        actor: {
          userId: gate.userId,
          ipAddress: clientIp(request),
          userAgent: request.headers.get("user-agent"),
        },
      });

      if (format === "csv") {
        // Same shape as contacts-bulk.ts: headers via `set`, body as a string.
        const day = new Date().toISOString().slice(0, 10);
        set.headers["content-type"] = "text/csv; charset=utf-8";
        set.headers["content-disposition"] =
          `attachment; filename="audit-logs-${day}.csv"`;
        set.headers["x-total-count"] = String(result.total);
        set.headers["x-truncated"] = String(result.truncated);
        return auditLogsToCsv(result.logs);
      }

      return {
        logs: result.logs.map(toRow),
        total: result.total,
        truncated: result.truncated,
      };
    },
    {
      query: exportQuery,
      response: {
        200: t.Union([
          t.Object({
            logs: t.Array(auditLogRowSchema),
            total: t.Number(),
            truncated: t.Boolean(),
          }),
          t.String({ description: "CSV document when format=csv" }),
        ]),
        400: errorResponse,
        403: errorResponse,
      },
      detail: {
        tags: ["audit-logs"],
        summary: "Export audit log entries",
        description:
          "Same filters and plan window as the list. format=json (default) returns { logs, total, truncated }; format=csv returns text/csv with the dashboard's columns and X-Total-Count / X-Truncated headers. Up to 50,000 rows are returned; truncated is true when more matched. Requires the orgSettings read permission, the owner or admin role, and the Business plan (or a licence). Each export writes one audit_log.exported row.",
      },
    }
  );
