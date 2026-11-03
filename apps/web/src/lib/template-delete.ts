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
  sesTemplateName: string | null;
};

/** Blockers listed by name in the error before "and N more". */
const MAX_BLOCKERS_SHOWN = 5;

/**
 * The org's templates among `templateIds`, locked FOR UPDATE until the
 * transaction ends, so a broadcast or workflow that starts using one of them
 * meanwhile waits for the delete to commit or roll back. Ids outside the org
 * match nothing.
 */
export async function lockTemplatesForDelete(
  tx: DrizzleTransaction,
  organizationId: string,
  templateIds: string[]
): Promise<TemplateDeleteTarget[]> {
  return await tx
    .select({ id: template.id, sesTemplateName: template.sesTemplateName })
    .from(template)
    .where(
      and(
        eq(template.organizationId, organizationId),
        inArray(template.id, templateIds)
      )
    )
    .for("update");
}

/**
 * The error shown when a delete is refused, e.g.
 * `Can't delete: still used by broadcast "Spring sale" (draft), enabled workflow "Welcome".`
 */
export function templateInUseMessage(blockers: TemplateBlocker[]): string {
  const shown = blockers
    .slice(0, MAX_BLOCKERS_SHOWN)
    .map(describeBlocker)
    .join(", ");
  const more =
    blockers.length > MAX_BLOCKERS_SHOWN
      ? ` and ${blockers.length - MAX_BLOCKERS_SHOWN} more`
      : "";
  return `Can't delete: still used by ${shown}${more}.`;
}

/**
 * Best-effort removal of the SES copies of deleted templates, from the org's
 * first AWS account. Run only after the row delete has committed. Failures
 * are logged and never thrown: the rows are already gone.
 */
export async function removePublishedSesTemplates(
  organizationId: string,
  deleted: TemplateDeleteTarget[],
  log: Logger
): Promise<void> {
  const published = deleted.filter(
    (target): target is { id: string; sesTemplateName: string } =>
      Boolean(target.sesTemplateName)
  );
  if (published.length === 0) {
    return;
  }

  try {
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
      published.map(async (target) => {
        try {
          await deleteSESTemplate(
            credentials,
            customerAwsAccount.region,
            target.sesTemplateName
          );
          log.info(
            { templateId: target.id, sesTemplateName: target.sesTemplateName },
            "Deleted template from SES"
          );
        } catch (err) {
          log.warn(
            { err, templateId: target.id },
            "Failed to delete template from SES"
          );
        }
      })
    );
  } catch (err) {
    log.warn({ err, organizationId }, "Template SES cleanup failed");
  }
}
