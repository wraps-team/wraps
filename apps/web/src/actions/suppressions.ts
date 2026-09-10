"use server";

import type { SuppressionListReason } from "@aws-sdk/client-sesv2";
import { and, awsAccount, db, eq } from "@wraps/db";
import { revalidatePath } from "next/cache";
import {
  deleteSuppressedAddress,
  getSuppressedAddress,
  listSuppressedAddresses,
  type SuppressionListPage,
} from "@/lib/aws/ses-suppression";
import { orgAction } from "./shared/org-action";

// Verbatim copy of the string `mapCommonAwsError` returns for an
// access-denied error, from ses-onboarding.ts:93-104 (module-private there —
// see the comment on `isAccessDeniedError` in lib/aws/ses-suppression.ts for
// why this is duplicated rather than imported). Plan 283 owns any change to
// this string.
const PERMISSION_DENIED_ERROR =
  "Wraps doesn't have permission to manage the suppression list on this account. Run `wraps platform update-role` to refresh permissions.";

export type ListSuppressionsResult =
  | { success: true; page: SuppressionListPage }
  | { success: false; error: string };

export const listSuppressions = orgAction(
  {
    name: "listSuppressions",
    resource: "awsAccounts",
    permission: ["read"],
    orgId: (
      organizationId: string,
      _options?: {
        limit?: number;
        startToken?: string;
        reason?: SuppressionListReason;
      }
    ) => organizationId,
    onError: "Failed to load suppressions",
  },
  async (
    _ctx,
    organizationId: string,
    options?: {
      limit?: number;
      startToken?: string;
      reason?: SuppressionListReason;
    }
  ): Promise<ListSuppressionsResult> => {
    const page = await listSuppressedAddresses({
      organizationId,
      limit: options?.limit,
      startToken: options?.startToken,
      reason: options?.reason,
    });
    return { success: true, page };
  }
);

export type RemoveSuppressionResult =
  | { success: true; email: string; wasPresent: boolean }
  | { success: false; error: string };

export const removeSuppression = orgAction(
  {
    name: "removeSuppression",
    resource: "awsAccounts",
    permission: ["write"],
    orgId: (
      organizationId: string,
      _awsAccountId: string,
      _email: string,
      _acknowledgedComplaint: boolean
    ) => organizationId,
    onError: "Failed to remove suppression",
  },
  async (
    ctx,
    organizationId: string,
    awsAccountId: string,
    email: string,
    acknowledgedComplaint: boolean
  ): Promise<RemoveSuppressionResult> => {
    // Never trust an AWS account id from the client — scope to the caller's
    // org, same as addSendingDomain in actions/domains.ts.
    const account = await db.query.awsAccount.findFirst({
      where: and(
        eq(awsAccount.id, awsAccountId),
        eq(awsAccount.organizationId, organizationId)
      ),
    });
    if (!account) {
      return { success: false, error: "AWS account not found" };
    }

    // Re-read the reason server-side — never trust a reason sent from the
    // client. If the re-read is itself denied, fail closed: refuse the
    // removal rather than proceed on an unverified reason.
    const current = await getSuppressedAddress({ account, email });
    if (current.status === "denied") {
      return { success: false, error: PERMISSION_DENIED_ERROR };
    }
    if (current.status === "not_found") {
      return {
        success: false,
        error: "This address is not on the suppression list.",
      };
    }
    if (current.address.reason === "COMPLAINT" && !acknowledgedComplaint) {
      return {
        success: false,
        error:
          "This address was suppressed because of a spam complaint. Confirm you understand before removing it.",
      };
    }

    // AWS first: DeleteSuppressedDestination cannot be rolled back, so it must
    // not run inside ctx.audited's database transaction. Audit after the fact.
    const deleted = await deleteSuppressedAddress({ account, email });
    if (deleted.status === "denied") {
      return { success: false, error: PERMISSION_DENIED_ERROR };
    }

    try {
      await ctx.audited(
        // No DB write here — the mutation already happened against AWS
        // above. ctx.audited still opens a transaction just to insert the
        // audit row; this callback has nothing else to do in it.
        () => Promise.resolve({ email }),
        () => ({
          action: "suppression.removed" as const,
          resource: "suppression",
          resourceId: email,
          metadata: {
            email,
            reason: current.address.reason,
            awsAccountId,
          },
        })
      );
    } catch (auditError) {
      // The address really is unsuppressed at this point — reporting failure
      // because the audit row didn't write would be worse than a missing
      // audit entry. Log loudly and still report success.
      ctx.log.error(
        { err: auditError, email, awsAccountId },
        "suppression.removed audit log failed to write after AWS delete succeeded"
      );
    }

    revalidatePath(`/${ctx.access.orgSlug}/emails/suppressions`, "page");

    return {
      success: true,
      email,
      wasPresent: deleted.status === "removed",
    };
  }
);
