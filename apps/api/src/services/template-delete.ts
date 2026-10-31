/**
 * Template delete: the in-use check, the transactional row delete + audit
 * row, and the best-effort SES cleanup. Used by the DELETE routes in
 * routes/templates.ts.
 *
 * Every query is scoped by organizationId. Ids that do not belong to the org
 * are reported as not found, never read or deleted.
 */

import {
  and,
  auditLog,
  awsAccount,
  batchSend,
  db,
  eq,
  template,
  user,
  workflow,
} from "@wraps/db";
import { deleteSESTemplate } from "@wraps/email";
import { inArray } from "drizzle-orm";
import { log } from "../lib/logger";
import { getCredentials } from "./credentials";

/**
 * A send that is committed or already running. Copied from
 * routes/segments.ts (where it is not exported): keep the two in sync.
 * `draft`, `completed`, `failed` and `cancelled` do not block.
 */
const BLOCKING_BATCH_STATUSES = ["scheduled", "queued", "processing"] as const;

export type TemplateTarget = {
  id: string;
  name: string;
  sesTemplateName: string | null;
};

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

export type DeleteTemplatesResult =
  | { kind: "blocked"; blockers: TemplateBlocker[] }
  | { kind: "deleted"; deleted: TemplateTarget[] };

export type DeleteTemplatesInput = {
  organizationId: string;
  userId: string | null;
  /** Unique ids to delete. Ids outside the org match nothing. */
  ids: string[];
  /** Set for single delete; null for bulk. */
  resourceId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
};

/** Human-readable line for a blocker, used in the 409 message. */
export function describeBlocker(blocker: TemplateBlocker): string {
  if (blocker.kind === "broadcast") {
    const label = blocker.name ? `"${blocker.name}"` : blocker.broadcastId;
    return `broadcast ${label} (${blocker.status})`;
  }
  return `enabled workflow "${blocker.name}"`;
}

async function findBlockingBroadcasts(
  tx: Pick<typeof db, "select">,
  organizationId: string,
  templateIds: string[]
): Promise<TemplateBlocker[]> {
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
        inArray(batchSend.status, [...BLOCKING_BATCH_STATUSES])
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
function referencedTemplateIds(
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
async function findBlockingWorkflows(
  tx: Pick<typeof db, "select">,
  organizationId: string,
  templateIds: Set<string>
): Promise<TemplateBlocker[]> {
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
 * Delete the org's templates among `ids`, or refuse with the blockers.
 *
 * All-or-nothing: the in-use check and the delete run in one transaction, and
 * the org's template rows are locked (FOR UPDATE) first. A broadcast or
 * workflow that starts referencing one of them meanwhile waits on the lock.
 * If any target is blocked, nothing is deleted. The audit row is written in
 * the same transaction as the delete.
 *
 * SES is cleaned up only after the commit. If the DB delete failed first, the
 * SES template could be removed while the row still says PUBLISHED.
 */
export async function deleteTemplates(
  input: DeleteTemplatesInput
): Promise<DeleteTemplatesResult> {
  const { organizationId, userId } = input;

  const actorEmail = userId
    ? ((
        await db
          .select({ email: user.email })
          .from(user)
          .where(eq(user.id, userId))
          .limit(1)
      )[0]?.email ?? null)
    : null;

  const result = await db.transaction(
    async (tx): Promise<DeleteTemplatesResult> => {
      const targets: TemplateTarget[] = await tx
        .select({
          id: template.id,
          name: template.name,
          sesTemplateName: template.sesTemplateName,
        })
        .from(template)
        .where(
          and(
            eq(template.organizationId, organizationId),
            inArray(template.id, input.ids)
          )
        )
        .for("update");

      if (targets.length === 0) {
        return { kind: "deleted", deleted: [] };
      }

      const targetIds = targets.map((target) => target.id);
      const blockers = [
        ...(await findBlockingBroadcasts(tx, organizationId, targetIds)),
        ...(await findBlockingWorkflows(
          tx,
          organizationId,
          new Set(targetIds)
        )),
      ];
      if (blockers.length > 0) {
        return { kind: "blocked", blockers };
      }

      await tx
        .delete(template)
        .where(
          and(
            eq(template.organizationId, organizationId),
            inArray(template.id, targetIds)
          )
        );

      await tx.insert(auditLog).values({
        organizationId,
        userId,
        actorEmail,
        action: "template.deleted",
        resource: "template",
        resourceId: input.resourceId,
        metadata: {
          count: targets.length,
          templateIds: targetIds,
        },
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      });

      return { kind: "deleted", deleted: targets };
    }
  );

  if (result.kind === "deleted" && result.deleted.length > 0) {
    await removeSesTemplates(organizationId, result.deleted);
  }
  return result;
}

/**
 * Best-effort removal of the SES templates the deleted rows published.
 *
 * - Only names Wraps recorded (`sesTemplateName` non-null) are touched.
 * - A name still used by a surviving org template is kept, because same-name
 *   templates share one SES template.
 * - The delete runs in every AWS account of the org, because the template row
 *   does not record which account it was published to. NotFound is success
 *   (deleteSESTemplate already returns quietly for it).
 * - Failures are logged and never fail the request.
 */
async function removeSesTemplates(
  organizationId: string,
  deleted: TemplateTarget[]
): Promise<void> {
  const names = [
    ...new Set(
      deleted
        .map((target) => target.sesTemplateName)
        .filter((name): name is string => Boolean(name))
    ),
  ];
  if (names.length === 0) {
    return;
  }

  try {
    const surviving = await db
      .select({ name: template.sesTemplateName })
      .from(template)
      .where(
        and(
          eq(template.organizationId, organizationId),
          inArray(template.sesTemplateName, names)
        )
      );
    const stillUsed = new Set(surviving.map((row) => row.name));
    const removable = names.filter((name) => !stillUsed.has(name));
    if (removable.length === 0) {
      return;
    }

    const accounts = await db
      .select({ id: awsAccount.id, region: awsAccount.region })
      .from(awsAccount)
      .where(eq(awsAccount.organizationId, organizationId));

    for (const account of accounts) {
      let credentials: Awaited<ReturnType<typeof getCredentials>>;
      try {
        credentials = await getCredentials(account.id, organizationId);
      } catch (error) {
        log.error("Template SES cleanup: could not get credentials", error, {
          organizationId,
          awsAccountId: account.id,
        });
        continue;
      }

      await Promise.all(
        removable.map(async (templateName) => {
          try {
            await deleteSESTemplate(credentials, account.region, templateName);
          } catch (error) {
            log.error("Template SES cleanup: delete failed", error, {
              organizationId,
              awsAccountId: account.id,
              sesTemplateName: templateName,
            });
          }
        })
      );
    }
  } catch (error) {
    log.error("Template SES cleanup failed", error, { organizationId });
  }
}
