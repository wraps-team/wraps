/**
 * Subscription gate
 *
 * Answers one question: does this org have a live subscription right now?
 *
 * Used by the SES webhook to decide whether to ingest events. We are not in a
 * direct-SES customer's send path — their mail flows from their own AWS account
 * with their own credentials — so this can never stop anyone sending. What it
 * stops is a lapsed org continuing to consume platform storage and analytics,
 * since every ingested event materializes or updates a `message_send` row.
 *
 * The gate keys off subscription *status*, not plan name. A free-tier org
 * carries an active `free` subscription and passes; an org whose paid
 * subscription lapsed has no active row and fails. That is the same distinction
 * extractPlan() draws in middleware/auth.ts, where it surfaces as
 * `planId === null` rather than `"free"`.
 */

import { and, db, eq, subscription } from "@wraps/db";
import { inArray } from "drizzle-orm";
import { log } from "./logger";

/** Subscription statuses that entitle an org to platform service. */
const LIVE_STATUSES = ["active", "trialing"];

// A lapsed subscription is a slow-changing condition, but the SES webhook checks
// it on every inbound event. During a lapsed org's sustained send burst that is
// one subscription lookup per event that can only ever resolve to "drop" — the
// same redundant DB round-trip that turns the flood into account-wide Lambda
// concurrency and pool saturation for every other tenant on the shared API
// function. Negative-cache only *definitive* "lapsed" verdicts for a short
// window so repeated drops stop re-querying. Active/trialing verdicts are never
// cached: a subscription that just lapsed must take effect immediately, exactly
// as the existing gate behaviour promises.
const LAPSED_CACHE_TTL_MS = 60_000;
const LAPSED_CACHE_MAX_ENTRIES = 1000;

const lapsedOrgCache = new Map<string, { expiresAt: number }>();

/** Test seam: drop the negative cache so cases share no lapsed state. */
export function resetLapsedSubscriptionCache(): void {
  lapsedOrgCache.clear();
}

export async function hasActiveSubscription(
  organizationId: string
): Promise<boolean> {
  const cached = lapsedOrgCache.get(organizationId);
  if (cached) {
    if (cached.expiresAt > Date.now()) {
      return false;
    }
    lapsedOrgCache.delete(organizationId);
  }

  try {
    const [row] = await db
      .select({ id: subscription.id })
      .from(subscription)
      .where(
        and(
          eq(subscription.referenceId, organizationId),
          inArray(subscription.status, LIVE_STATUSES)
        )
      )
      .limit(1);

    const lapsed = row === undefined;
    if (lapsed) {
      if (lapsedOrgCache.size >= LAPSED_CACHE_MAX_ENTRIES) {
        lapsedOrgCache.clear();
      }
      lapsedOrgCache.set(organizationId, {
        expiresAt: Date.now() + LAPSED_CACHE_TTL_MS,
      });
    }

    return !lapsed;
  } catch (error) {
    log.error("Subscription gate check failed", error, { organizationId });
    // Fail OPEN, matching enforceEventLimit in middleware/event-limit.ts. The
    // caller is the SES webhook, which sits outside any try block — a throw
    // here becomes a 500, and EventBridge retries 5xx with backoff before
    // DLQ-ing. Briefly ingesting for a lapsed org costs a few rows; DLQ-ing a
    // paying customer's delivery events on a transient DB blip loses data we
    // cannot recover. The error path deliberately does NOT write the negative
    // cache: a DB blip must not be remembered as a lapse and later used to
    // drop a paying org's events.
    return true;
  }
}
