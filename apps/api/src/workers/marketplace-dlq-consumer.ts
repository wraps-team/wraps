/**
 * Marketplace DLQ Consumer
 *
 * Drains `MarketplaceEventsDlq`, the dead-letter queue of the AWS Marketplace
 * agreement-event pipeline. The main worker redrives into it after three SQS
 * deliveries fail, but — unlike `batchDlq` and `workflowDlq`, which both
 * subscribe a consumer — nothing was ever subscribed here, so a dead-lettered
 * onboarding event sat until the 14-day retention deleted it and the buyer's
 * registration never completed.
 *
 * This consumer gives each dead-lettered event a terminal, visible outcome: it
 * correlates the event to its `aws_marketplace_subscription` row and moves it
 * to `failed` — the status the schema documents for exactly this case — so the
 * subscription surfaces for a human instead of silently expiring. Only a row
 * still `pending` is failed: the main worker swallows per-record errors, so
 * what reaches this queue is usually a whole batch whose Lambda timed out or
 * crashed, and records earlier in that batch may already have been applied.
 * Overwriting those would fail a live subscription. It does not
 * re-enqueue: the main handler already exhausts its retries before a message
 * lands here, and replaying the event would risk a queue/DLQ loop on a record
 * that fails deterministically.
 *
 * IMPORTANT: this handler must never throw. There is no DLQ-of-DLQ.
 */

// Initialize Sentry before all other imports
import "../lib/sentry";

import { captureException, wrapHandler } from "@sentry/aws-serverless";
import { and, awsMarketplaceSubscription, db, eq } from "@wraps/db";
import type { SQSEvent, SQSHandler } from "aws-lambda";

import { flushLogger, log } from "../lib/logger";
import {
  ACTIVATING,
  DEACTIVATING,
  findSubscription,
  type MarketplaceEvent,
} from "../services/marketplace-event";

export const handler: SQSHandler = wrapHandler(async (event: SQSEvent) => {
  for (const record of event.Records) {
    try {
      const parsed = JSON.parse(record.body) as MarketplaceEvent;
      await handleDeadLettered(parsed, record.messageId);
    } catch (error) {
      // Never throw from a DLQ consumer — a throw causes pointless SQS retries
      // with no DLQ-of-DLQ to catch them. This capture is the only signal.
      captureException(error, {
        tags: { worker: "marketplace-dlq-consumer", stage: "record" },
        extra: { messageId: record.messageId },
      });
      log.error("marketplace.dlq.record_failed", error, {
        messageId: record.messageId,
        body: record.body.slice(0, 1000),
      });
    }
  }

  await flushLogger().catch(() => {
    // Log flushing is best-effort; a failure here must not fail the batch.
  });
});

async function handleDeadLettered(
  event: MarketplaceEvent,
  messageId: string
): Promise<void> {
  const detailType = event["detail-type"] ?? "";
  const detail = event.detail ?? {};

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
    messageId,
  };

  if (!(ACTIVATING.has(detailType) || DEACTIVATING.has(detailType))) {
    // Advisory and unrecognised types have no subscription transition to fail;
    // the main handler already surfaced whatever it could before dead-lettering.
    // Nothing to mark, but a record did exhaust its retries, so raise it.
    log.error("marketplace.dlq.unactionable", undefined, context);
    captureException(
      new Error(
        `Dead-lettered AWS Marketplace event is not actionable: ${detailType}`
      ),
      {
        tags: { worker: "marketplace-dlq-consumer", stage: "unactionable" },
        extra: context,
      }
    );
    return;
  }

  const row = await findSubscription({
    arn,
    agreementId,
    accountId,
    productCode,
  });

  if (!row) {
    // No row to fail — the buyer subscribed but never completed (or never
    // reached) registration, so there is nothing to reconcile. Tracking this
    // means the exhausted event is not lost without trace.
    log.warn("marketplace.dlq.unmatched", context);
    captureException(
      new Error(
        `Dead-lettered AWS Marketplace ${detailType} matched no subscription`
      ),
      {
        tags: { worker: "marketplace-dlq-consumer", stage: "unmatched" },
        extra: context,
      }
    );
    return;
  }

  // Guarded in the WHERE, not on `row.status`, so a delivery that lands
  // between the select and the update cannot be overwritten either.
  const [failed] = await db
    .update(awsMarketplaceSubscription)
    .set({ status: "failed", updatedAt: new Date() })
    .where(
      and(
        eq(awsMarketplaceSubscription.id, row.id),
        eq(awsMarketplaceSubscription.status, "pending")
      )
    )
    .returning({ id: awsMarketplaceSubscription.id });

  if (!failed) {
    // The row already left `pending`, so its status is left alone. The event
    // still exhausted its retries — a dead-lettered deactivation on an
    // `active` row means a buyer who left still has access — so raise it.
    log.error("marketplace.dlq.subscription_settled", undefined, {
      ...context,
      subscriptionId: row.id,
      status: row.status,
    });
    captureException(
      new Error(
        `AWS Marketplace ${detailType} exhausted SQS retries for settled subscription ${row.id}`
      ),
      {
        tags: { worker: "marketplace-dlq-consumer", stage: "settled" },
        extra: { ...context, subscriptionId: row.id, status: row.status },
      }
    );
    return;
  }

  log.error("marketplace.dlq.subscription_failed", undefined, {
    ...context,
    subscriptionId: row.id,
    previousStatus: row.status,
  });
  captureException(
    new Error(
      `AWS Marketplace ${detailType} exhausted SQS retries for subscription ${row.id}`
    ),
    {
      tags: { worker: "marketplace-dlq-consumer", stage: "exhausted" },
      extra: { ...context, subscriptionId: row.id },
    }
  );
}
