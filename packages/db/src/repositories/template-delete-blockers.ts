/**
 * The in-use rule for deleting templates: which broadcasts and workflows keep
 * a template from being deleted. One implementation, used by the API's
 * DELETE /v1/templates routes and by the dashboard's template deletes.
 *
 * Every query is scoped by organizationId and runs on the caller's
 * transaction handle, so the check sees the same snapshot as the delete that
 * follows it (callers lock the template rows FOR UPDATE first).
 */

import { and, eq, inArray } from "drizzle-orm";
import type { db } from "../index";
import { batchSend } from "../schema/batch";
import { workflow } from "../schema/workflows";

type Selector = Pick<typeof db, "select">;

/**
 * Broadcast statuses that keep a template from being deleted: a draft (which
 * would otherwise lose its template to the FK's SET NULL and be found broken
 * later), and a send that is committed or already running. A paused broadcast
 * is `processing` with `paused_reason` set, so it blocks too. `completed`,
 * `failed` and `cancelled` do not block.
 *
 * Not the same list as apps/api/src/routes/segments.ts: a draft does not keep
 * a segment from being deleted. The two rules are separate on purpose.
 */
export const TEMPLATE_DELETE_BLOCKING_BROADCAST_STATUSES = [
  "draft",
  "scheduled",
  "queued",
  "processing",
] as const;

export type TemplateBlocker =
  | {
      kind: "broadcast";
      templateId: string;
      broadcastId: string;
      name: string | null;
      status: string;
    }
  | {
      kind: "workflow";
      templateId: string;
      workflowId: string;
      name: string;
    };

/** Human-readable line for a blocker, e.g. `broadcast "Spring sale" (draft)`. */
export function describeBlocker(blocker: TemplateBlocker): string {
  if (blocker.kind === "broadcast") {
    const label = blocker.name ? `"${blocker.name}"` : blocker.broadcastId;
    return `broadcast ${label} (${blocker.status})`;
  }
  return `enabled workflow "${blocker.name}"`;
}

/** The org's broadcasts in a blocking status that use one of the templates. */
export async function findBlockingBroadcasts(
  tx: Selector,
  organizationId: string,
  templateIds: string[]
): Promise<TemplateBlocker[]> {
  if (templateIds.length === 0) {
    return [];
  }
  const rows = await tx
    .select({
      broadcastId: batchSend.id,
      templateId: batchSend.emailTemplateId,
      name: batchSend.name,
      status: batchSend.status,
    })
    .from(batchSend)
    .where(
      and(
        eq(batchSend.organizationId, organizationId),
        inArray(batchSend.emailTemplateId, templateIds),
        inArray(batchSend.status, [
          ...TEMPLATE_DELETE_BLOCKING_BROADCAST_STATUSES,
        ])
      )
    );

  const blockers: TemplateBlocker[] = [];
  for (const row of rows) {
    if (row.templateId) {
      blockers.push({
        kind: "broadcast",
        templateId: row.templateId,
        broadcastId: row.broadcastId,
        name: row.name,
        status: row.status,
      });
    }
  }
  return blockers;
}

/** Template ids a workflow's steps reference, through steps or cascade channels. */
export function referencedTemplateIds(
  steps: NonNullable<(typeof workflow.$inferSelect)["steps"]>
): Set<string> {
  const referenced = new Set<string>();
  for (const step of steps) {
    const { config } = step;
    if (
      (config.type === "send_email" || config.type === "send_sms") &&
      config.templateId
    ) {
      referenced.add(config.templateId);
    }
    for (const channel of step.cascadeChannels ?? []) {
      if (channel.templateId) {
        referenced.add(channel.templateId);
      }
    }
  }
  return referenced;
}

/**
 * Enabled workflows in the org whose steps (send_email / send_sms templateId)
 * or cascade channels reference one of the templates. Draft, paused and
 * archived workflows do not block. Cascades are flattened into steps at save
 * time, but `cascadeChannels` on the first step is checked too.
 */
export async function findBlockingWorkflows(
  tx: Selector,
  organizationId: string,
  templateIds: Set<string>
): Promise<TemplateBlocker[]> {
  if (templateIds.size === 0) {
    return [];
  }
  const enabled = await tx
    .select({ id: workflow.id, name: workflow.name, steps: workflow.steps })
    .from(workflow)
    .where(
      and(
        eq(workflow.organizationId, organizationId),
        eq(workflow.status, "enabled")
      )
    );

  const blockers: TemplateBlocker[] = [];
  for (const wf of enabled) {
    for (const templateId of referencedTemplateIds(wf.steps ?? [])) {
      if (templateIds.has(templateId)) {
        blockers.push({
          kind: "workflow",
          templateId,
          workflowId: wf.id,
          name: wf.name,
        });
      }
    }
  }
  return blockers;
}

/**
 * Every broadcast and enabled workflow of the org that keeps one of the
 * templates from being deleted. Empty means the delete may go ahead.
 */
export async function findTemplateDeleteBlockers(
  tx: Selector,
  organizationId: string,
  templateIds: string[]
): Promise<TemplateBlocker[]> {
  return [
    ...(await findBlockingBroadcasts(tx, organizationId, templateIds)),
    ...(await findBlockingWorkflows(tx, organizationId, new Set(templateIds))),
  ];
}
