"use server";

import type { SuppressionListReason } from "@aws-sdk/client-sesv2";
import { and, awsAccount, db, eq } from "@wraps/db";
import { revalidatePath } from "next/cache";
import { normalizeAddressInput } from "@/lib/address-explanation";
import {
  deleteSuppressedAddress,
  getSuppressedAddress,
  listSuppressedAddresses,
  putSuppressedAddress,
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

export type AddSuppressionResult =
  | { success: true; email: string; alreadyPresent: boolean }
  | { success: false; error: string };

const ADDABLE_REASONS = ["BOUNCE", "COMPLAINT"] as const;
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;

export const addSuppression = orgAction(
  {
    name: "addSuppression",
    resource: "awsAccounts",
    permission: ["write"],
    orgId: (
      organizationId: string,
      _awsAccountId: string,
      _email: string,
      _reason: "BOUNCE" | "COMPLAINT"
    ) => organizationId,
    onError: "Failed to add suppression",
  },
  async (
    ctx,
    organizationId: string,
    awsAccountId: string,
    email: string,
    reason: "BOUNCE" | "COMPLAINT"
  ): Promise<AddSuppressionResult> => {
    // Never trust a reason from the client: SES only accepts these two.
    if (!ADDABLE_REASONS.includes(reason)) {
      return { success: false, error: "Reason must be BOUNCE or COMPLAINT." };
    }

    const normalized = normalizeAddressInput(email);
    if (!normalized.ok) {
      return { success: false, error: normalized.error };
    }
    const address = normalized.address.toLowerCase();
    if (address.length > MAX_EMAIL_LENGTH || !EMAIL_SHAPE.test(address)) {
      return { success: false, error: "Enter a valid email address." };
    }

    // Never trust an AWS account id from the client — scope to the caller's
    // org, same as removeSuppression.
    const account = await db.query.awsAccount.findFirst({
      where: and(
        eq(awsAccount.id, awsAccountId),
        eq(awsAccount.organizationId, organizationId)
      ),
    });
    if (!account) {
      return { success: false, error: "AWS account not found" };
    }

    // Read the current record first. A repeat add is a no-op, and a COMPLAINT
    // is never weakened to a BOUNCE. If the read is denied, fail closed.
    const current = await getSuppressedAddress({ account, email: address });
    if (current.status === "denied") {
      return { success: false, error: PERMISSION_DENIED_ERROR };
    }
    if (
      current.status === "found" &&
      (current.address.reason === reason ||
        current.address.reason === "COMPLAINT")
    ) {
      return { success: true, email: address, alreadyPresent: true };
    }

    // AWS first, same as removeSuppression: the write cannot run inside the
    // audit transaction. Audit after the fact.
    const added = await putSuppressedAddress({
      account,
      email: address,
      reason,
    });
    if (added.status === "denied") {
      return { success: false, error: PERMISSION_DENIED_ERROR };
    }

    try {
      await ctx.audited(
        // No DB write here — the mutation already happened against AWS above.
        () => Promise.resolve({ email: address }),
        () => ({
          action: "suppression.added" as const,
          resource: "suppression",
          resourceId: address,
          metadata: {
            email: address,
            reason,
            awsAccountId,
            source: "manual",
          },
        })
      );
    } catch (auditError) {
      // The address really is suppressed at this point — reporting failure
      // because the audit row didn't write would be worse than a missing
      // audit entry. Log loudly and still report success.
      ctx.log.error(
        { err: auditError, email: address, awsAccountId },
        "suppression.added audit log failed to write after AWS put succeeded"
      );
    }

    revalidatePath(`/${ctx.access.orgSlug}/emails/suppressions`, "page");

    return { success: true, email: address, alreadyPresent: false };
  }
);
