"use server";

import type { SuppressionListReason } from "@aws-sdk/client-sesv2";
import {
  and,
  awsAccount,
  db,
  eq,
  suppressContactByEmailWithChange,
  unsuppressContactByEmailWithChange,
} from "@wraps/db";
import { revalidatePath } from "next/cache";
import { normalizeAddressInput } from "@/lib/address-explanation";
import {
  deleteSuppressedAddress,
  getSuppressedAddress,
  listSuppressedAddresses,
  putSuppressedAddress,
  type SuppressionListPage,
} from "@/lib/aws/ses-suppression";
import { emitContactsUpdatedViaApi } from "@/lib/contact-updated-api";
import { type OrgActionCtx, orgAction } from "./shared/org-action";

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

    // Broadcasts read the contact's status, not the SES list: put a contact
    // this address's suppression had parked back in the audience.
    const restored = await unsuppressContactByEmailWithChange(
      organizationId,
      email
    );
    const contactRestored = restored.changed;

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
            contactRestored,
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

    if (restored.contactId) {
      await emitContactsUpdatedViaApi(ctx, organizationId, [
        { contactId: restored.contactId, updatedFields: ["emailStatus"] },
      ]);
    }

    revalidatePath(`/${ctx.access.orgSlug}/emails`, "page");

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

export type SuppressionRequest = {
  awsAccountId: string;
  email: string;
  reason: "BOUNCE" | "COMPLAINT";
};

type SuppressOneOutcome = {
  result: AddSuppressionResult;
  /** The contact whose email status this call changed, if any. */
  changedContactId: string | null;
};

function failed(error: string): SuppressOneOutcome {
  return { result: { success: false, error }, changedContactId: null };
}

/**
 * Validates, writes and audits one suppression. Shared by `addSuppression` and
 * `addSuppressions`; the callers revalidate and emit contact_updated, so a
 * batch does each once.
 */
async function suppressOne(
  ctx: OrgActionCtx,
  { awsAccountId, email, reason }: SuppressionRequest
): Promise<SuppressOneOutcome> {
  const { organizationId } = ctx;
  // Never trust a reason from the client: SES only accepts these two.
  if (!ADDABLE_REASONS.includes(reason)) {
    return failed("Reason must be BOUNCE or COMPLAINT.");
  }

  const normalized = normalizeAddressInput(email);
  if (!normalized.ok) {
    return failed(normalized.error);
  }
  const address = normalized.address.toLowerCase();
  if (address.length > MAX_EMAIL_LENGTH || !EMAIL_SHAPE.test(address)) {
    return failed("Enter a valid email address.");
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
    return failed("AWS account not found");
  }

  // Read the current record first. A repeat add is a no-op, and a COMPLAINT
  // is never weakened to a BOUNCE. If the read is denied, fail closed.
  const current = await getSuppressedAddress({ account, email: address });
  if (current.status === "denied") {
    return failed(PERMISSION_DENIED_ERROR);
  }
  if (
    current.status === "found" &&
    (current.address.reason === reason ||
      current.address.reason === "COMPLAINT")
  ) {
    // SES already has it, but the contact may not: a list entry SES added
    // itself, or one written before contacts were kept in step. Idempotent.
    const write = await suppressContactByEmailWithChange(
      organizationId,
      address
    );
    return {
      result: { success: true, email: address, alreadyPresent: true },
      changedContactId: write.contactId,
    };
  }

  // AWS first, same as removeSuppression: the write cannot run inside the
  // audit transaction. Audit after the fact.
  const added = await putSuppressedAddress({
    account,
    email: address,
    reason,
  });
  if (added.status === "denied") {
    return failed(PERMISSION_DENIED_ERROR);
  }

  // Broadcasts choose recipients from the contact's status and never read the
  // SES list, so the contact has to say "suppressed" too or the next broadcast
  // still sends to it. Outside the audit transaction, so a failed audit write
  // cannot roll it back; if this throws, the action reports failure and a
  // retry takes the already-present path above, which repeats it.
  const write = await suppressContactByEmailWithChange(organizationId, address);
  const contactSuppressed = write.changed;

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
          contactSuppressed,
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

  return {
    result: { success: true, email: address, alreadyPresent: false },
    changedContactId: write.contactId,
  };
}

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
    const { result, changedContactId } = await suppressOne(ctx, {
      awsAccountId,
      email,
      reason,
    });
    if (changedContactId) {
      await emitContactsUpdatedViaApi(ctx, organizationId, [
        { contactId: changedContactId, updatedFields: ["emailStatus"] },
      ]);
    }
    if (result.success && !result.alreadyPresent) {
      revalidatePath(`/${ctx.access.orgSlug}/emails`, "page");
    }
    return result;
  }
);

/** One entry per request, in request order. `email` is as the caller sent it. */
export type AddSuppressionsItem =
  | { email: string; success: true; alreadyPresent: boolean }
  | { email: string; success: false; error: string };

export type AddSuppressionsResult =
  | { success: true; results: AddSuppressionsItem[] }
  | { success: false; error: string };

/** Recommendations show at most 25 rows; this leaves room without being unbounded. */
const MAX_BATCH_SUPPRESSIONS = 100;

/** Same ceiling as the review list's GetSuppressedDestination checks. */
const SUPPRESS_CONCURRENCY = 5;

/**
 * Suppresses several addresses in one round trip. Each address succeeds or
 * fails on its own — an exception for one (a throttle, a timeout) is that
 * address's failure, never the batch's — and the page revalidates once.
 */
export const addSuppressions = orgAction(
  {
    name: "addSuppressions",
    resource: "awsAccounts",
    permission: ["write"],
    orgId: (organizationId: string, _requests: SuppressionRequest[]) =>
      organizationId,
    onError: "Failed to add suppressions",
  },
  async (
    ctx,
    organizationId: string,
    requests: SuppressionRequest[]
  ): Promise<AddSuppressionsResult> => {
    if (!Array.isArray(requests) || requests.length === 0) {
      return { success: false, error: "Choose at least one address." };
    }
    if (requests.length > MAX_BATCH_SUPPRESSIONS) {
      return {
        success: false,
        error: `Suppress at most ${MAX_BATCH_SUPPRESSIONS} addresses at a time.`,
      };
    }

    const results: AddSuppressionsItem[] = new Array(requests.length);
    const changedContactIds = new Set<string>();
    let next = 0;

    const worker = async () => {
      while (next < requests.length) {
        const index = next;
        next += 1;
        const request = requests[index];
        try {
          const { result, changedContactId } = await suppressOne(ctx, request);
          if (changedContactId) {
            changedContactIds.add(changedContactId);
          }
          results[index] = result.success
            ? {
                email: request.email,
                success: true,
                alreadyPresent: result.alreadyPresent,
              }
            : { email: request.email, success: false, error: result.error };
        } catch (err) {
          ctx.log.error(
            { err, awsAccountId: request.awsAccountId },
            "addSuppressions: one address failed"
          );
          results[index] = {
            email: request.email,
            success: false,
            error: "Failed to add suppression",
          };
        }
      }
    };

    const workerCount = Math.min(SUPPRESS_CONCURRENCY, requests.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));

    // One call for the whole batch (at most MAX_BATCH_SUPPRESSIONS contacts,
    // the API's limit too).
    await emitContactsUpdatedViaApi(
      ctx,
      organizationId,
      [...changedContactIds].map((contactId) => ({
        contactId,
        updatedFields: ["emailStatus"],
      }))
    );

    if (results.some((r) => r.success && !r.alreadyPresent)) {
      revalidatePath(`/${ctx.access.orgSlug}/emails`, "page");
    }

    return { success: true, results };
  }
);
