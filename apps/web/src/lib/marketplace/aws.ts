import { db } from "@wraps/db";
import {
  type AwsMarketplaceSubscription,
  awsMarketplaceSubscription,
} from "@wraps/db/schema/aws-marketplace";
import { and, eq, isNull } from "drizzle-orm";

/**
 * Shared pieces for the AWS Marketplace registration flow.
 *
 * These live outside the route handler because Next.js route files may only
 * export HTTP verbs and a fixed set of config values — anything else fails the
 * build.
 */

export const MARKETPLACE_SESSION_COOKIE = "wraps_awsmp_ref";
/** Holds an already-VERIFIED subscription id from the confirmation email link. */
export const MARKETPLACE_LINK_COOKIE = "wraps_awsmp_link";
export const REGISTRATION_PATH = "/marketplace/aws/register";

/**
 * The seller-side Marketplace APIs are only available in us-east-1, regardless
 * of where the buyer or our own infrastructure runs.
 */
export const MARKETPLACE_REGION = "us-east-1";

/**
 * Reasons the registration page can be reached without a resolved licence.
 * Kept as a union so the page renders a specific message per case instead of a
 * catch-all "something went wrong".
 */
export type RegistrationError =
  | "invalid_request"
  | "missing_token"
  | "expired_token"
  | "invalid_token"
  | "listing_unavailable"
  | "try_again"
  | "resolve_failed"
  | "resolve_incomplete"
  | "persist_failed";

export function findSubscriptionById(id: string) {
  return db
    .select()
    .from(awsMarketplaceSubscription)
    .where(eq(awsMarketplaceSubscription.id, id))
    .limit(1)
    .then((rows) => rows[0] ?? null);
}

export type LinkMarketplaceParams = {
  organizationId: string;
  /** Value of the registration cookie, if the buyer still has it. */
  cookieRef: string | null;
  /** Subscription id from an already-VERIFIED link token, if they arrived by email. */
  linkTokenSubscriptionId?: string | null;
};

/**
 * Attach an AWS Marketplace subscription to a newly created organization.
 *
 * Two routes, because a buyer can arrive either way:
 *
 *   1. The `wraps_awsmp_ref` cookie, set server-side by the registration POST.
 *      This is the strong one — httpOnly, not guessable, and proof the same
 *      browser completed a real ResolveCustomer. It only survives an hour.
 *   2. A signed link token from the confirmation email, already verified by the
 *      caller. This covers the buyer who comes back later or in another browser.
 *
 * Both routes are proof of possession. Matching on the contact address is
 * deliberately NOT one of them: whoever subscribes types that address in, so
 * they could enter a stranger's and have that stranger's later signup silently
 * attach an agreement they never bought.
 *
 * Returns the linked subscription id, or null when there is nothing to link.
 */
export async function linkMarketplaceSubscription({
  organizationId,
  cookieRef,
  linkTokenSubscriptionId,
}: LinkMarketplaceParams): Promise<string | null> {
  let candidate: AwsMarketplaceSubscription | null = null;
  if (cookieRef) {
    candidate = await findSubscriptionById(cookieRef);
  } else if (linkTokenSubscriptionId) {
    candidate = await findSubscriptionById(linkTokenSubscriptionId);
  }

  if (!candidate) {
    return null;
  }

  // Never steal a subscription already attached elsewhere.
  if (candidate.organizationId) {
    return null;
  }

  // Claim conditionally: two signups racing the same cookie, or a retry, must
  // not both attach. Only the update that actually matches an unlinked row wins.
  const [linked] = await db
    .update(awsMarketplaceSubscription)
    .set({ organizationId, updatedAt: new Date() })
    .where(
      and(
        eq(awsMarketplaceSubscription.id, candidate.id),
        isNull(awsMarketplaceSubscription.organizationId)
      )
    )
    .returning({ id: awsMarketplaceSubscription.id });

  return linked?.id ?? null;
}
