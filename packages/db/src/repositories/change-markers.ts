import { and, desc, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { db } from "../index";
import { auditLog } from "../schema/app";
import { batchSend } from "../schema/batch";
import { template, templateVersion } from "../schema/templates";
import { workflow } from "../schema/workflows";
import type { DbClient } from "./api-keys";

/**
 * Rows behind the change markers (the analytics timeline and chart overlays).
 *
 * Reads only existing tables. Each query starts with an organization predicate
 * (`organization_id`, or `template.organization_id` for template versions,
 * since `template_version` has no org column). No query selects an actor, an
 * email, an IP address, a user agent, or a raw `resource_id` / `metadata` for
 * the markers that do not need them. The one `resource_id` use is the workflow
 * join, which runs inside the database and is returned only for workflow rows.
 */

/** Rows read per source. One extra row tells us the source was cut short. */
const MAX_SOURCE_ROWS = 500;
const SOURCE_LIMIT = MAX_SOURCE_ROWS + 1;

/** Audit actions that produce a marker. Kept in one place for the query. */
const MARKER_AUDIT_ACTIONS = [
  "workflow.enabled",
  "workflow.disabled",
  "contact.imported",
  "suppression.removed",
  "settings.sender_defaults_updated",
] as const;

const WORKFLOW_ACTIONS = ["workflow.enabled", "workflow.disabled"] as const;

export type ChangeMarkerBatchRow = {
  id: string;
  name: string | null;
  totalRecipients: number;
  startedAt: Date;
};

export type ChangeMarkerAuditRow = {
  id: string;
  action: string;
  createdAt: Date;
  /** Set only for workflow.enabled and workflow.disabled. Null otherwise. */
  workflowId: string | null;
  /** Set only for contact.imported: the created count, as text from JSON. */
  importCount: string | null;
  /** The workflow's name when the row is a workflow action in this org. */
  workflowName: string | null;
};

export type ChangeMarkerTemplateVersionRow = {
  id: string;
  version: number;
  createdAt: Date;
  templateId: string;
  templateName: string;
};

export type ChangeMarkerRowSet = {
  batches: ChangeMarkerBatchRow[];
  auditRows: ChangeMarkerAuditRow[];
  templateVersions: ChangeMarkerTemplateVersionRow[];
  truncated: boolean;
};

export type ChangeMarkerRowQuery = {
  organizationId: string;
  startTime: Date;
  endTime: Date;
  /** Earliest audit-derived row to return. Older rows are past retention. */
  auditFloor: Date;
};

/**
 * Loads the three sources of change markers for one organization and window.
 * Sources are read in parallel. A source that hits the row limit sets
 * `truncated`, and its rows are cut to MAX_SOURCE_ROWS.
 */
export async function listChangeMarkerRows(
  query: ChangeMarkerRowQuery,
  dbClient: DbClient = db
): Promise<ChangeMarkerRowSet> {
  const { organizationId, startTime, endTime, auditFloor } = query;
  // Audit rows older than the plan's retention are excluded, even when the
  // requested window reaches further back.
  const auditLower = startTime > auditFloor ? startTime : auditFloor;

  const [batchRows, auditRows, versionRows] = await Promise.all([
    dbClient
      .select({
        id: batchSend.id,
        name: batchSend.name,
        totalRecipients: batchSend.totalRecipients,
        startedAt: batchSend.startedAt,
      })
      .from(batchSend)
      .where(
        and(
          eq(batchSend.organizationId, organizationId),
          eq(batchSend.channel, "email"),
          isNotNull(batchSend.startedAt),
          gte(batchSend.startedAt, startTime),
          lte(batchSend.startedAt, endTime)
        )
      )
      .orderBy(desc(batchSend.startedAt))
      .limit(SOURCE_LIMIT),

    dbClient
      .select({
        id: auditLog.id,
        action: auditLog.action,
        createdAt: auditLog.createdAt,
        // Only workflow actions carry a workflow id. For every other action
        // this is null, so a suppressed address in resource_id never leaves
        // the database.
        workflowId: sql<
          string | null
        >`CASE WHEN ${auditLog.action} IN ('workflow.enabled', 'workflow.disabled') THEN ${auditLog.resourceId} END`,
        // Only contact.imported carries a count.
        importCount: sql<
          string | null
        >`CASE WHEN ${auditLog.action} = 'contact.imported' THEN ${auditLog.metadata} ->> 'count' END`,
        workflowName: workflow.name,
      })
      .from(auditLog)
      .leftJoin(
        workflow,
        and(
          eq(workflow.id, auditLog.resourceId),
          eq(workflow.organizationId, auditLog.organizationId),
          inArray(auditLog.action, [...WORKFLOW_ACTIONS])
        )
      )
      .where(
        and(
          eq(auditLog.organizationId, organizationId),
          inArray(auditLog.action, [...MARKER_AUDIT_ACTIONS]),
          gte(auditLog.createdAt, auditLower),
          lte(auditLog.createdAt, endTime)
        )
      )
      .orderBy(desc(auditLog.createdAt))
      .limit(SOURCE_LIMIT),

    dbClient
      .select({
        id: templateVersion.id,
        version: templateVersion.version,
        createdAt: templateVersion.createdAt,
        templateId: template.id,
        templateName: template.name,
      })
      .from(templateVersion)
      .innerJoin(template, eq(template.id, templateVersion.templateId))
      .where(
        and(
          // template_version has no org column: scope through the template.
          eq(template.organizationId, organizationId),
          eq(template.channel, "email"),
          gte(templateVersion.createdAt, startTime),
          lte(templateVersion.createdAt, endTime)
        )
      )
      .orderBy(desc(templateVersion.createdAt))
      .limit(SOURCE_LIMIT),
  ]);

  const truncated = [batchRows, auditRows, versionRows].some(
    (rows) => rows.length >= SOURCE_LIMIT
  );

  return {
    batches: batchRows.slice(0, MAX_SOURCE_ROWS),
    auditRows: auditRows.slice(0, MAX_SOURCE_ROWS),
    templateVersions: versionRows.slice(0, MAX_SOURCE_ROWS),
    truncated,
  };
}
