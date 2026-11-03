/**
 * Dashboard template delete: the pieces shared by `bulkDeleteTemplates`
 * (actions/templates.ts) and DELETE /api/[orgSlug]/emails/templates/[id].
 *
 * The in-use rule itself (which broadcasts and workflows block a delete) is
 * `findTemplateDeleteBlockers` in @wraps/db, the same one the API uses. Both
 * callers run, in one transaction: lockTemplatesForDelete, then the blocker
 * check, then the delete and the audit row. SES is cleaned up only after the
 * commit, with removePublishedSesTemplates.
 *
 * A plain module, not a "use server" file, so it may export non-async values.
 */

import {
  and,
  awsAccount,
  db,
  describeBlocker,
  eq,
  type TemplateBlocker,
  template,
} from "@wraps/db";
import { deleteSESTemplate } from "@wraps/email";
import { inArray } from "drizzle-orm";
import { getOrAssumeRole } from "@/lib/aws/credential-cache";
import type { Logger } from "@/lib/logger";

type DrizzleTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type TemplateDeleteTarget = {
  id: string;
  name: string;
  sesTemplateName: string | null;
};

/** Names listed in the error before "and N more". */
const MAX_NAMES_SHOWN = 5;

/**
 * The org's templates among `templateIds`, locked FOR UPDATE until the
 * transaction ends. Ids outside the org match nothing.
 *
 * The lock covers broadcasts only: a broadcast that starts pointing at one of
 * these rows (batch_send.email_template_id is a foreign key) waits for the
 * delete to commit or roll back. Workflows reference templates inside their
 * JSON steps, with no foreign key, so they do not wait: a workflow enabled
 * between the in-use check and the commit is not blocked, and is left
 * pointing at a deleted template.
 */
export async function lockTemplatesForDelete(
  tx: DrizzleTransaction,
  organizationId: string,
  templateIds: string[]
): Promise<TemplateDeleteTarget[]> {
  return await tx
    .select({
      id: template.id,
      name: template.name,
      sesTemplateName: template.sesTemplateName,
    })
    .from(template)
    .where(
      and(
        eq(template.organizationId, organizationId),
        inArray(template.id, templateIds)
      )
    )
    .for("update");
}

function listWithMore(items: string[]): string {
  const shown = items.slice(0, MAX_NAMES_SHOWN).join(", ");
  return items.length > MAX_NAMES_SHOWN
    ? `${shown} and ${items.length - MAX_NAMES_SHOWN} more`
    : shown;
}

/**
 * The error shown when a delete is refused. It names the blocked templates
 * (from `targets`, the locked rows) and what uses them, e.g.
 * `Can't delete "Welcome": still used by broadcast "Spring sale" (draft), enabled workflow "Onboarding".`
 * Each list shows at most 5 names, then "and N more".
 */
export function templateInUseMessage(
  blockers: TemplateBlocker[],
  targets: TemplateDeleteTarget[]
): string {
  const nameById = new Map(targets.map((target) => [target.id, target.name]));
  const blockedTemplates = [
    ...new Set(blockers.map((blocker) => blocker.templateId)),
  ].map((templateId) => `"${nameById.get(templateId) ?? templateId}"`);
  return `Can't delete ${listWithMore(blockedTemplates)}: still used by ${listWithMore(blockers.map(describeBlocker))}.`;
}

/**
 * Best-effort removal of the SES copies of deleted templates, from the org's
 * first AWS account. Run only after the row delete has committed. Failures
 * are logged and never thrown: the rows are already gone.
 *
 * SES names come from the template's display name and are not unique in an
 * org, so same-name templates share one SES template, and broadcasts send by
 * that name. A name still used by a surviving template of the org is kept.
 */
export async function removePublishedSesTemplates(
  organizationId: string,
  deleted: TemplateDeleteTarget[],
  log: Logger
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

    const customerAwsAccount = await db.query.awsAccount.findFirst({
      where: eq(awsAccount.organizationId, organizationId),
    });
    if (!customerAwsAccount) {
      return;
    }

    const credentials = await getOrAssumeRole({
      roleArn: customerAwsAccount.roleArn,
      externalId: customerAwsAccount.externalId,
      region: customerAwsAccount.region,
    });

    await Promise.allSettled(
      removable.map(async (sesTemplateName) => {
        try {
          await deleteSESTemplate(
            credentials,
            customerAwsAccount.region,
            sesTemplateName
          );
          log.info({ sesTemplateName }, "Deleted template from SES");
        } catch (err) {
          log.warn(
            { err, sesTemplateName },
            "Failed to delete template from SES"
          );
        }
      })
    );
  } catch (err) {
    log.warn({ err, organizationId }, "Template SES cleanup failed");
  }
}
