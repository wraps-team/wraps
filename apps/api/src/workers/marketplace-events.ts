/**
 * AWS Marketplace lifecycle consumer.
 *
 * EventBridge delivers AWS Marketplace agreement and licence events to the
 * seller account's DEFAULT event bus (source `aws.agreement-marketplace`). A
 * rule forwards them to an SQS queue; this worker drains it and moves
 * `aws_marketplace_subscription` rows between states.
 *
 * This is the only thing that may activate a subscription. AWS is explicit
 * that resources must not be provisioned before a licence event arrives, so
 * the registration POST deliberately leaves every row `pending`.
 *
 * Two delivery realities shape the logic:
 *
 *   1. SQS is at-least-once with no ordering guarantee. A redelivered
 *      "License Updated" must not resurrect a subscription that was already
 *      deprovisioned, so every write is guarded on the event's own timestamp.
 *   2. Purchase Agreement events carry NO licence ARN — only `agreement.id`
 *      and `acceptor.accountId`. Correlation therefore falls back through
 *      licence -> agreement -> (buyer account + product code).
 *
 * This handler must never throw. Its DLQ is the only retry, and a record it
 * cannot process leaves a buyer stuck at `pending` with nothing to notice.
 */

// Initialize Sentry before all other imports
import "../lib/sentry";

import { captureException, wrapHandler } from "@sentry/aws-serverless";
import {
  and,
  awsMarketplaceSubscription,
  db,
  desc,
  eq,
  ilike,
  isNull,
} from "@wraps/db";
import {
  generateMarketplaceLinkToken,
  sendMarketplaceWelcomeEmail,
} from "@wraps/email";
import type { SQSEvent, SQSHandler } from "aws-lambda";

import { flushLogger, log } from "../lib/logger";

type MarketplaceEvent = {
  id?: string;
  "detail-type"?: string;
  source?: string;
  time?: string;
  detail?: {
    agreement?: { id?: string; status?: string };
    product?: { code?: string; id?: string };
    license?: { arn?: string };
    acceptor?: { accountId?: string };
    offer?: { id?: string };
  };
};

/**
 * Detail types this worker acts on. Everything else is acknowledged and
 * dropped — the rule is deliberately broader than this map so a new event
 * type shows up in logs instead of vanishing.
 *
 * `Purchase Agreement Created` doubles as the activation signal because it is
 * unverified whether a Free-pricing product emits `License Updated` at all
 * (entitlements are a contract-pricing concept). Whichever arrives first wins;
 * the second is a no-op.
 */
const ACTIVATING = new Set([
  "License Updated - Manufacturer",
  "Purchase Agreement Created - Proposer",
  "Purchase Agreement Created - Manufacturer",
]);

const DEACTIVATING = new Set([
  "License Deprovisioned - Manufacturer",
  "Purchase Agreement Ended - Proposer",
  "Purchase Agreement Ended - Manufacturer",
]);

const ADVISORY = new Set(["Purchase Agreement Advisory Issued - Manufacturer"]);

/**
 * AWS's own documentation prints licence ARNs inconsistently — the License
 * event example omits the leading `arn:` that ResolveCustomer returns. Compare
 * on the licence id (`l-…`) so a formatting difference cannot silently prevent
 * every correlation.
 */
export function licenseKey(arn: string | undefined): string | null {
  if (!arn) {
    return null;
  }
  const match = arn.match(/l-[0-9a-f]+/i);
  return match ? match[0].toLowerCase() : arn.toLowerCase();
}

export const handler: SQSHandler = wrapHandler(async (event: SQSEvent) => {
  for (const record of event.Records) {
    try {
      const parsed = JSON.parse(record.body) as MarketplaceEvent;
      await handleEvent(parsed);
    } catch (error) {
      // Never throw: the DLQ is the only retry, and a dropped record leaves a
      // paying buyer stuck at `pending`.
      captureException(error, {
        tags: { worker: "marketplace-events", stage: "record" },
        extra: { messageId: record.messageId },
      });
      log.error("marketplace.event.record_failed", error, {
        messageId: record.messageId,
        body: record.body.slice(0, 1000),
      });
    }
  }

  await flushLogger().catch(() => {
    // Log flushing is best-effort; a failure here must not fail the batch.
  });
});

async function handleEvent(event: MarketplaceEvent): Promise<void> {
  const detailType = event["detail-type"] ?? "";
  const detail = event.detail ?? {};
  const eventAt = event.time ? new Date(event.time) : new Date();

  const arn = detail.license?.arn;
  const agreementId = detail.agreement?.id;
  const accountId = detail.acceptor?.accountId;
  const productCode = detail.product?.code;

  const context = {
    detailType,
    agreementId,
    accountId,
    productCode,
    eventId: event.id,
  };

  if (ADVISORY.has(detailType)) {
    // AWS flags buyer account closure, compromise, abuse or fraud here and
    // tells sellers to assess access themselves. Deliberately does not revoke
    // automatically — it surfaces for a human.
    log.error("marketplace.event.advisory", undefined, context);
    captureException(new Error(`AWS Marketplace advisory: ${detailType}`), {
      tags: { worker: "marketplace-events" },
      extra: context,
    });
    return;
  }

  const activating = ACTIVATING.has(detailType);
  const deactivating = DEACTIVATING.has(detailType);
  if (!(activating || deactivating)) {
    log.info("marketplace.event.ignored", context);
    return;
  }

  const row = await findSubscription({
    arn,
    agreementId,
    accountId,
    productCode,
  });

  if (!row) {
    // A licence event for an unknown row means the buyer subscribed but never
    // completed (or never reached) registration. Nothing to reconcile yet;
    // their eventual registration POST will create the row.
    log.warn("marketplace.event.unmatched", context);
    return;
  }

  // Out-of-order guard. Equal timestamps are allowed through so a duplicate
  // delivery is a harmless idempotent rewrite.
  if (row.lastEventAt && row.lastEventAt > eventAt) {
    log.info("marketplace.event.stale", {
      ...context,
      lastEventAt: row.lastEventAt.toISOString(),
      eventAt: eventAt.toISOString(),
    });
    return;
  }

  await db
    .update(awsMarketplaceSubscription)
    .set({
      status: activating ? "active" : "unsubscribed",
      // Backfill the agreement id the first time an event names it — Purchase
      // Agreement Ended arrives with nothing else to correlate on.
      ...(agreementId ? { agreementId } : {}),
      lastEventAt: eventAt,
      updatedAt: new Date(),
    })
    .where(eq(awsMarketplaceSubscription.id, row.id));

  log.info("marketplace.event.applied", {
    ...context,
    subscriptionId: row.id,
    status: activating ? "active" : "unsubscribed",
  });

  if (activating) {
    await sendWelcomeEmailOnce(row);
  }
}

/**
 * AWS requires a buyer who subscribes to be sent confirmation with clear next
 * steps. Guarded on `welcomeEmailSentAt` because EventBridge delivers
 * at-least-once — without it every redelivered activation emails them again.
 *
 * A send failure must not fail the record: the status change is the important
 * write and it has already committed. The buyer is better served by an
 * activated subscription and a Sentry alert than by a retry loop that keeps
 * re-applying the same event.
 */
async function sendWelcomeEmailOnce(row: {
  id: string;
  contactEmail: string | null;
  customerAwsAccountId: string;
  welcomeEmailSentAt: Date | null;
}): Promise<void> {
  if (row.welcomeEmailSentAt) {
    return;
  }
  if (!row.contactEmail) {
    // They subscribed but never completed the registration form, so there is
    // no address to write to. Their registration will capture one later.
    log.info("marketplace.welcome.no_contact", { subscriptionId: row.id });
    return;
  }

  // Claim the send BEFORE sending, conditional on it being unclaimed. The
  // in-memory check above is not enough: the row was loaded before the status
  // update, the queue delivers batches of 10, and Lambda runs them
  // concurrently — two deliveries of one activation would both see null and
  // both email the buyer. Only the delivery whose UPDATE returns a row sends.
  const claimed = await db
    .update(awsMarketplaceSubscription)
    .set({ welcomeEmailSentAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(awsMarketplaceSubscription.id, row.id),
        isNull(awsMarketplaceSubscription.welcomeEmailSentAt)
      )
    )
    .returning({ id: awsMarketplaceSubscription.id });

  if (claimed.length === 0) {
    return;
  }

  try {
    await sendMarketplaceWelcomeEmail({
      to: row.contactEmail,
      linkToken: await generateMarketplaceLinkToken(row.id),
      customerAwsAccountId: row.customerAwsAccountId,
    });
    log.info("marketplace.welcome.sent", { subscriptionId: row.id });
  } catch (error) {
    // Release the claim so a redelivery can try again. This reopens the
    // duplicate window only for the moment a send is actually in flight,
    // which is the trade we want: a missed confirmation is recoverable, a
    // duplicate one to a customer is not.
    await db
      .update(awsMarketplaceSubscription)
      .set({ welcomeEmailSentAt: null, updatedAt: new Date() })
      .where(eq(awsMarketplaceSubscription.id, row.id))
      .catch(() => {
        // If the release itself fails the claim simply stands and the
        // confirmation is skipped — Sentry below is the only signal either way.
      });

    captureException(error, {
      tags: { worker: "marketplace-events", stage: "welcome-email" },
      extra: { subscriptionId: row.id },
    });
    log.error("marketplace.welcome.failed", error, { subscriptionId: row.id });
  }
}

/**
 * Correlation, most specific first. Licence ARN is the only truly unique key
 * under Concurrent Agreements; account + product is a last resort that can
 * legitimately match several rows, so it takes the newest deliberately rather
 * than whichever Postgres happens to return.
 */
async function findSubscription(keys: {
  arn?: string;
  agreementId?: string;
  accountId?: string;
  productCode?: string;
}) {
  if (keys.arn) {
    // Exact hit on the unique index covers the normal case.
    const [exact] = await db
      .select()
      .from(awsMarketplaceSubscription)
      .where(eq(awsMarketplaceSubscription.licenseArn, keys.arn))
      .limit(1);
    if (exact) {
      return exact;
    }

    // Formatting mismatch fallback — match on the `l-…` id alone. Bounded by
    // LIMIT rather than loading the table into memory.
    const key = licenseKey(keys.arn);
    if (key?.startsWith("l-")) {
      const [suffix] = await db
        .select()
        .from(awsMarketplaceSubscription)
        .where(ilike(awsMarketplaceSubscription.licenseArn, `%${key}%`))
        .limit(1);
      if (suffix) {
        return suffix;
      }
    }
  }

  if (keys.agreementId) {
    const [byAgreement] = await db
      .select()
      .from(awsMarketplaceSubscription)
      .where(eq(awsMarketplaceSubscription.agreementId, keys.agreementId))
      .limit(1);
    if (byAgreement) {
      return byAgreement;
    }
  }

  if (keys.accountId && keys.productCode) {
    const [byAccount] = await db
      .select()
      .from(awsMarketplaceSubscription)
      .where(
        and(
          eq(awsMarketplaceSubscription.customerAwsAccountId, keys.accountId),
          eq(awsMarketplaceSubscription.productCode, keys.productCode)
        )
      )
      .orderBy(desc(awsMarketplaceSubscription.resolvedAt))
      .limit(1);
    if (byAccount) {
      return byAccount;
    }
  }

  return null;
}
