import { db } from "@wraps/db";
import { awsMarketplaceSubscription } from "@wraps/db/schema/aws-marketplace";
import { eq } from "drizzle-orm";

/**
 * Shared pieces for the AWS Marketplace registration flow.
 *
 * These live outside the route handler because Next.js route files may only
 * export HTTP verbs and a fixed set of config values — anything else fails the
 * build.
 */

export const MARKETPLACE_SESSION_COOKIE = "wraps_awsmp_ref";
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
