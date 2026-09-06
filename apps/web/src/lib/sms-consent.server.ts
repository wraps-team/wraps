import { awsAccount, db } from "@wraps/db";
import { and, eq } from "drizzle-orm";

/**
 * Whether the organization is set up to send SMS.
 *
 * This is the same condition `page.tsx` already applied inline before this
 * change; it moved here so the page and the server action cannot drift apart.
 *
 * Deliberately NOT also gated on the sender-default column on
 * `organizationExtension`. That column is a settings pre-fill ("Sender
 * Defaults (pre-fill for new workflows/broadcasts)",
 * `packages/db/src/schema/app.ts:50-54`) and no send path reads it — the
 * workflow SMS handler takes its origination identity from the workflow row's
 * own sender-default field and spreads it conditionally
 * (`apps/api/src/(ee)/workers/workflow-step-handlers.ts:831,839`), so a send
 * without one is still attempted. Gating consent on it would silently discard
 * consent from orgs that can in fact send.
 */
export async function orgCanSendSms(organizationId: string): Promise<boolean> {
  const [account] = await db
    .select({ id: awsAccount.id })
    .from(awsAccount)
    .where(
      and(
        eq(awsAccount.organizationId, organizationId),
        eq(awsAccount.smsEnabled, true)
      )
    )
    .limit(1);

  return !!account;
}
