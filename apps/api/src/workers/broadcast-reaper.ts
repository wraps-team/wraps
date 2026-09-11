/**
 * Broadcast Reaper
 *
 * Scheduled Lambda that revives broadcasts whose chunk chain died in transit.
 *
 * A broadcast advances by a chain of SQS messages: each batch-sender invocation
 * enqueues the next chunk before it returns. Nothing in the worker can end that
 * chain without either enqueueing again or writing a terminal status — so a
 * batch sitting in `processing` with no progress means the message itself was
 * never delivered to the function.
 *
 * That is not hypothetical. Reproduced twice on 2026-07-31: a broadcast stopped
 * dead at exactly 800 recipients (16 chunks) with the next chunk sitting in the
 * queue, `status='processing'`, and no error, no throttle, and no log line
 * anywhere — because the code was never reached. A direct invoke of the
 * identical payload succeeded, so neither the worker nor the payload was at
 * fault. Every resume moved it exactly one more burst before stalling again.
 *
 * The TRIGGER is not fully characterised. On the test account it was Lambda
 * concurrency starvation — the broadcast's own SES delivery-event webhooks
 * (~2 invocations per recipient) saturated a low account limit, leaving the
 * batch queue's event source mapping unable to invoke. That cannot be the whole
 * story: a customer hitting the same 800-recipient stall has the default 1000
 * concurrency. The shared invariant is the chunk COUNT, not the load.
 *
 * So this reaper is deliberately cause-agnostic: it revives any chain whose
 * chunk message was never delivered, whatever stopped the delivery. Do not
 * narrow it to a concurrency check.
 *
 * Reserved concurrency is NOT an available mitigation either: AWS refuses any
 * reservation that would drop unreserved account concurrency below its minimum,
 * which rules it out on precisely the low-limit accounts that suffer this. So
 * the chain has to survive lost delivery instead, and this is that backstop.
 *
 * Always-on, like WorkflowReaper — a backstop that can be disarmed isn't one.
 */

// Initialize Sentry before all other imports
import "../lib/sentry";

import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import {
  captureException,
  captureMessage,
  wrapHandler,
} from "@sentry/aws-serverless";
import { batchSend, db } from "@wraps/db";
import type { Handler } from "aws-lambda";
import { and, eq, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { awsDefaults } from "../lib/aws-defaults";
import { flushLogger, log } from "../lib/logger";
import type { BatchJob } from "../services/queue";

type DrizzleDB = typeof db;

/**
 * How long a `processing` batch may go without progress before we treat the
 * chain as lost.
 *
 * This MUST stay comfortably above the DLQ recovery path, or the reaper races
 * it and both re-enqueue the same chunk. A wedged message needs
 * maxReceiveCount(3) x visibilityTimeout(300s) = 15 minutes to reach the DLQ,
 * after which batch-dlq-consumer revives the chain on its own. 30 minutes
 * leaves a full 15-minute margin and matches WorkflowReaper's paused threshold,
 * which encodes the same "delivery was lost" judgement.
 */
export const BROADCAST_STALL_THRESHOLD_MS = 30 * 60 * 1000;

/**
 * How long a PAUSED batch may go without a pause-loop heartbeat before we treat
 * its re-enqueued message as lost.
 *
 * Must exceed the 900s pause cycle by enough that ordinary jitter (SQS delivery
 * latency, a slow invocation) never looks like death. 45 minutes = three missed
 * cycles.
 */
export const PAUSE_STALL_THRESHOLD_MS = 45 * 60 * 1000;

/** Cap per run so one sweep can't spawn unbounded work. */
const MAX_REAPS_PER_RUN = 200;

const QUEUE_URL = process.env.BATCH_QUEUE_URL;

type ReapEntry = {
  reapedChunkIndex: number;
  at: string;
  reason: string;
};

/**
 * Core reaper logic — takes its db and enqueue function so it is testable
 * without Lambda env or a live queue.
 */
export async function runBroadcastReaper(
  dbClient: DrizzleDB,
  deps: { enqueue: (job: BatchJob) => Promise<void> }
): Promise<{ reaped: number; skipped: number }> {
  log.info("broadcast.reaper.start");

  // Two different staleness questions, because a paused batch and a sending
  // batch advance on completely different clocks:
  //
  //   not paused — a healthy chain lands a chunk every few seconds, so
  //     lastChunkAt older than 30 minutes means the chain is gone.
  //
  //   paused — lastChunkAt is stale BY DESIGN (the pause path returns before
  //     the progress write, and the quota-stuck alert reads that staleness as
  //     its signal), so judging a paused batch by it would reap every healthy
  //     quota pause. pausedAt is the pause loop's own heartbeat, rewritten on
  //     each 900s cycle; older than 45 minutes means three cycles were missed
  //     and the re-enqueued message is gone. This case is the one that matters
  //     for a send larger than the daily quota, which spends most of its life
  //     paused — exactly the window nothing used to be able to recover.
  //
  // A paused batch with pausedAt NULL was paused by a build predating the
  // column. Skipped rather than reaped: it may well be a live chain, and
  // double-enqueueing one is worse than waiting for its next cycle to stamp
  // the heartbeat.
  //
  // baseline:allow-unscoped — privileged system Lambda; sweeps all orgs by design
  // biome-ignore lint/plugin: privileged system Lambda; sweeps all orgs by design (see baseline:allow-unscoped above)
  const candidates = await dbClient
    .select({
      id: batchSend.id,
      organizationId: batchSend.organizationId,
      awsAccountId: batchSend.awsAccountId,
      channel: batchSend.channel,
      lastChunkIndex: batchSend.lastChunkIndex,
      lastCursor: batchSend.lastCursor,
      processedRecipients: batchSend.processedRecipients,
      totalRecipients: batchSend.totalRecipients,
      errorDetails: batchSend.errorDetails,
      pausedReason: batchSend.pausedReason,
    })
    .from(batchSend)
    .where(
      and(
        eq(batchSend.status, "processing"),
        or(
          and(
            isNull(batchSend.pausedReason),
            // lastChunkAt is only written after a chunk lands, so a batch that
            // died on its very first chunk has none — fall back to startedAt,
            // then createdAt (NOT NULL in the schema, so this always resolves).
            lt(
              sql`COALESCE(${batchSend.lastChunkAt}, ${batchSend.startedAt}, ${batchSend.createdAt})`,
              sql`NOW() - INTERVAL '30 minutes'`
            )
          ),
          and(
            isNotNull(batchSend.pausedReason),
            isNotNull(batchSend.pausedAt),
            lt(batchSend.pausedAt, sql`NOW() - INTERVAL '45 minutes'`)
          )
        )
      )
    )
    .limit(MAX_REAPS_PER_RUN);

  if (candidates.length === MAX_REAPS_PER_RUN) {
    log.warn("broadcast.reaper.hit_limit", { limit: MAX_REAPS_PER_RUN });
  }

  let reaped = 0;
  let skipped = 0;

  for (const batch of candidates) {
    // One bad row must not abort the sweep — the remaining batches are still
    // stalled and still need reviving.
    try {
      if (!batch.awsAccountId) {
        log.warn("broadcast.reaper.aws_account_missing", {
          batchId: batch.id,
          organizationId: batch.organizationId,
        });
        skipped += 1;
        continue;
      }

      // Already through its audience: the chain owes a terminal status, not
      // another chunk. Mirrors batch-dlq-consumer's identical guard.
      if (batch.processedRecipients >= batch.totalRecipients) {
        log.info("broadcast.reaper.already_complete", {
          batchId: batch.id,
          processedRecipients: batch.processedRecipients,
          totalRecipients: batch.totalRecipients,
        });
        skipped += 1;
        continue;
      }

      // Resume from the durable heartbeat, never from a message body — the
      // same rule batch-dlq-consumer follows. lastChunkIndex == null means no
      // chunk ever completed, so resume at 0 with no cursor.
      const resumeChunkIndex =
        batch.lastChunkIndex == null ? 0 : batch.lastChunkIndex + 1;
      const resumeCursor = batch.lastCursor ?? undefined;

      const existingDetails =
        (batch.errorDetails as Record<string, unknown> | null) ?? {};
      const existingReaped = Array.isArray(existingDetails.chunksReaped)
        ? (existingDetails.chunksReaped as ReapEntry[])
        : [];
      const entry: ReapEntry = {
        reapedChunkIndex: resumeChunkIndex,
        at: new Date().toISOString(),
        reason: batch.pausedReason
          ? `stalled pause loop (${batch.pausedReason}) — re-enqueued chunk never delivered`
          : "stalled chain — chunk message never delivered",
      };

      // Audit trail lands BEFORE the enqueue. If the enqueue then fails we have
      // a record of the attempt and the next sweep retries; if we wrote it
      // after, a crash in between would revive the chain with no trace of why.
      await dbClient
        .update(batchSend)
        .set({
          errorDetails: {
            ...existingDetails,
            chunksReaped: [...existingReaped, entry],
          },
        })
        .where(
          and(
            eq(batchSend.id, batch.id),
            eq(batchSend.organizationId, batch.organizationId),
            // Lost race with a late delivery or an operator resume: the batch
            // moved on and no longer needs reviving.
            eq(batchSend.status, "processing")
          )
        );

      await deps.enqueue({
        batchId: batch.id,
        organizationId: batch.organizationId,
        awsAccountId: batch.awsAccountId,
        channel: batch.channel,
        chunkIndex: resumeChunkIndex,
        cursor: resumeCursor,
      });

      reaped += 1;

      // A stalled broadcast is never routine — it means delivery was lost. Left
      // at info this would sit unread in a log group; a repeated reap on the
      // same batch is the signal that the account is starved, not that one
      // message got unlucky.
      log.warn("broadcast.reaper.revived", {
        batchId: batch.id,
        organizationId: batch.organizationId,
        pausedReason: batch.pausedReason ?? null,
        resumeChunkIndex,
        resumeFromCursor: Boolean(resumeCursor),
        priorReaps: existingReaped.length,
        processedRecipients: batch.processedRecipients,
        totalRecipients: batch.totalRecipients,
      });

      // Repeat offenders mean the underlying cause is still there (typically an
      // account Lambda concurrency ceiling). Surface it rather than quietly
      // reviving the same broadcast forever.
      if (existingReaped.length >= 2) {
        captureMessage("Broadcast repeatedly stalled and reaped", {
          level: "warning",
          tags: { worker: "broadcast-reaper" },
          extra: {
            batchId: batch.id,
            organizationId: batch.organizationId,
            reapCount: existingReaped.length + 1,
          },
        });
      }
    } catch (error) {
      skipped += 1;
      captureException(error, {
        tags: { worker: "broadcast-reaper", stage: "reap" },
        extra: { batchId: batch.id, organizationId: batch.organizationId },
      });
      log.error("broadcast.reaper.reap_failed", error, {
        batchId: batch.id,
        organizationId: batch.organizationId,
      });
    }
  }

  log.info("broadcast.reaper.done", {
    candidates: candidates.length,
    reaped,
    skipped,
  });

  return { reaped, skipped };
}

async function enqueueChunk(job: BatchJob): Promise<void> {
  if (!QUEUE_URL) {
    throw new Error("BATCH_QUEUE_URL not configured");
  }
  const sqsClient = new SQSClient(awsDefaults);
  const body: Record<string, unknown> = {
    batchId: job.batchId,
    organizationId: job.organizationId,
    awsAccountId: job.awsAccountId,
    channel: job.channel,
    chunkIndex: job.chunkIndex,
  };
  if (job.cursor !== undefined) {
    body.cursor = job.cursor;
  }
  await sqsClient.send(
    new SendMessageCommand({
      QueueUrl: QUEUE_URL,
      MessageBody: JSON.stringify(body),
    })
  );
}

export const handler: Handler = wrapHandler(async () => {
  try {
    await runBroadcastReaper(db, { enqueue: enqueueChunk });
  } finally {
    await flushLogger();
  }
});
