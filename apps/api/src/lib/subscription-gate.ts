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

export async function hasActiveSubscription(
  organizationId: string
): Promise<boolean> {
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

    return row !== undefined;
  } catch (error) {
    log.error("Subscription gate check failed", error, { organizationId });
    // Fail OPEN, matching enforceEventLimit in middleware/event-limit.ts. The
    // caller is the SES webhook, which sits outside any try block — a throw
    // here becomes a 500, and EventBridge retries 5xx with backoff before
    // DLQ-ing. Briefly ingesting for a lapsed org costs a few rows; DLQ-ing a
    // paying customer's delivery events on a transient DB blip loses data we
    // cannot recover.
    return true;
  }
}
