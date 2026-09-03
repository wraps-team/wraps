// baseline:allow-large-file
/**
 * Batch Sender Worker
 *
 * SQS Lambda handler that processes batch send jobs.
 * Sends emails/SMS in chunks of 50 contacts (matching SES bulk limit).
 * Respects customer's SES rate limit via SQS delay between chunks.
 */

// Initialize Sentry before all other imports
import "../lib/sentry";

import {
  type BulkEmailEntry,
  GetAccountCommand,
  SESv2Client,
  SendBulkEmailCommand,
  type SendBulkEmailCommandOutput,
} from "@aws-sdk/client-sesv2";
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { toPlainText } from "@react-email/render";
import {
  captureException,
  captureMessage,
  wrapHandler,
} from "@sentry/aws-serverless";
import {
  awsAccount,
  batchSend,
  buildConditionSQL,
  type Channel,
  channelEligibilitySQL,
  contact,
  contactTopic,
  countBroadcastRecipients,
  db,
  eq,
  hasRecentNotification,
  MESSAGE_SEND_UNACCEPTED_STATUSES,
  type MessageSendStatus,
  member,
  messageSend,
  notifyOrg,
  organization,
  organizationExtension,
  segment,
  template,
  user,
} from "@wraps/db";
import {
  resolveAppUrl,
  sendBroadcastStuckEmail,
  toSesVariableName,
  transformVariablesForSes,
} from "@wraps/email";
import { resolveConfigurationSetName, sendEmail } from "@wraps/email-send";
import {
  extractCanonicalVars,
  renderTemplateStrict,
} from "@wraps/template-render";
import { resolveApiBaseUrl } from "@wraps/unsubscribe-token";
import type { Context, SQSEvent, SQSHandler, SQSRecord } from "aws-lambda";
import {
  and,
  exists,
  ilike,
  inArray,
  isNull,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";
import { trackFirstEmailSent } from "../lib/activation-tracking";
import { awsDefaults } from "../lib/aws-defaults";
import { flushLogger, log } from "../lib/logger";
import { generateUnsubscribeToken } from "../lib/unsubscribe-token";
import { getCredentials } from "../services/credentials";
import type { BatchJob } from "../services/queue";
import { applyVariableMappings } from "./variable-mappings";

// Align chunk size with SES bulk limit for clean 1:1 mapping
const CHUNK_SIZE = 50; // SES SendBulkEmail limit per API call
const DEFAULT_RATE_LIMIT = 14; // Fallback emails/sec if can't fetch from AWS
const QUEUE_URL = process.env.BATCH_QUEUE_URL;

/** No progress for this long on a quota-paused broadcast = stuck, not waiting. */
export const QUOTA_STUCK_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24h
/** Minimum gap between stuck escalations for the same broadcast. */
export const QUOTA_STUCK_ALERT_INTERVAL_MS = 72 * 60 * 60 * 1000; // 72h
// Staleness threshold: 3× the Lambda timeout (infra/queues.ts:95 = 5 min).
// A live execution's claim can never be older than 15 minutes; anything older
// means the Lambda crashed before completing, so reclaim is safe.
const CLAIM_STALE_MINUTES = 15;

// Below this remaining-time floor, re-enqueue the chunk instead of racing
// the invocation timeout. Above receiveCount=2, fall through — processing
// slowly beats an infinite re-enqueue loop.
const SELF_RESCHEDULE_FLOOR_MS = 45_000;
const SELF_RESCHEDULE_LOOP_GUARD = 2;
const SELF_RESCHEDULE_DELAY_SECONDS = 10;

// Post-send bookkeeping writes run AFTER SES has accepted a message, so a
// transient DB error there must never surface as a send failure — it would
// mark delivered mail 'failed' and expose it to re-claim (duplicate send).
// Retry with backoff before giving up.
const BOOKKEEPING_ATTEMPTS = 3;
async function withBookkeepingRetries<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < BOOKKEEPING_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < BOOKKEEPING_ATTEMPTS - 1) {
        await new Promise((resolve) => setTimeout(resolve, 100 * 2 ** attempt));
      }
    }
  }
  throw lastError;
}

// Both send paths record per-recipient outcomes through the two helpers below
// so the paths can't drift apart — the 2026-07 incident happened because one
// path wrapped its bookkeeping writes and the other didn't. Neither helper
// ever throws.

type BookkeepingCtx = { organizationId: string; batchId: string };

// After SES accepts a message. On persistent write failure the row stays
// claimed ('queued') without a messageId and becomes stale-reclaimable after
// CLAIM_STALE_MINUTES — never misfiled as 'failed', which re-claim would
// double-send. messageId rule: unique index on messageId; write null (not "")
// so Postgres allows multiple NULL values without a uniqueness collision.
async function recordAcceptedSend(
  ctx: BookkeepingCtx,
  recipient: { id: string; email: string | null },
  values: { messageId: string | null; subject: string | null; sentAt: Date }
): Promise<void> {
  try {
    await withBookkeepingRetries(() =>
      db
        .update(messageSend)
        .set({
          status: "sent",
          messageId: values.messageId,
          subject: values.subject,
          sentAt: values.sentAt,
        })
        .where(
          and(
            eq(messageSend.organizationId, ctx.organizationId),
            eq(messageSend.batchSendId, ctx.batchId),
            eq(messageSend.contactId, recipient.id)
          )
        )
    );
  } catch (updateError) {
    // 2026-07-02 incident: SES's Send event can reach POST /webhooks/ses/:acct
    // before this write lands, so webhooks.ts's "message not found" branch
    // materializes a minimal orphan row carrying values.messageId — and this
    // UPDATE then collides on message_send_message_id_idx. The violation is
    // deterministic, so withBookkeepingRetries above burns all
    // BOOKKEEPING_ATTEMPTS retrying it before we get here (wasted work, but
    // restructuring the shared retry wrapper to skip retries for this one
    // error would also change recordSendFailure's retry semantics — left
    // as-is; see plan 118).
    if (values.messageId && isMessageIdUniqueViolation(updateError)) {
      try {
        await adoptOrphanRow(ctx, recipient, {
          messageId: values.messageId,
          subject: values.subject,
          sentAt: values.sentAt,
        });
      } catch (adoptError) {
        captureException(adoptError, {
          tags: { worker: "batch-sender", stage: "orphan-adoption" },
          extra: {
            messageId: values.messageId,
            batchId: ctx.batchId,
            organizationId: ctx.organizationId,
          },
        });
        log.error("Orphan adoption failed; row remains claimed", adoptError, {
          email: recipient.email,
          messageId: values.messageId,
          batchId: ctx.batchId,
          organizationId: ctx.organizationId,
        });
      }
      return;
    }
    // The mail went out; only the row is wrong. Nothing downstream retries
    // this, and the row stays 'queued' until the stale-claim sweep picks it
    // up, so the send silently under-counts.
    captureException(updateError, {
      tags: { worker: "batch-sender", stage: "record-accepted" },
      extra: {
        messageId: values.messageId,
        batchId: ctx.batchId,
        organizationId: ctx.organizationId,
      },
    });
    log.error(
      "Post-send bookkeeping update failed after retries",
      updateError,
      {
        email: recipient.email,
        messageId: values.messageId,
        batchId: ctx.batchId,
        organizationId: ctx.organizationId,
      }
    );
  }
}

// Walks err -> err.cause (node-postgres/drizzle nest the real pg error there)
// looking for the specific unique-index violation this collision produces.
// Matching the constraint name (not error class identity) because AWS/pg
// error shapes are unreliable across drivers — see MEMORY.md "AWS SDK v3
// Error Handling" for the same pattern applied to AWS errors.
function isMessageIdUniqueViolation(err: unknown): boolean {
  let current: unknown = err;
  const seen = new Set<unknown>();
  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    if (current.message.includes("message_send_message_id_idx")) {
      return true;
    }
    current = (current as Error & { cause?: unknown }).cause;
  }
  return false;
}

// Status precedence for deciding whether the orphan's current status should
// win over the "sent" write this collision interrupted. Same spirit as the
// webhook's own status-precedence checks (processDelivery et al.): later
// lifecycle events always outrank "sent", and bounced/complained/suppressed
// outrank delivered/opened/clicked too. Statuses not listed here (pending,
// queued, failed, opted_out) can't legitimately appear on an SDK-materialized
// orphan and are treated as no-more-advanced-than-sent.
const ORPHAN_STATUS_RANK: Partial<Record<MessageSendStatus, number>> = {
  sent: 0,
  delivered: 1,
  opened: 2,
  clicked: 2,
  bounced: 3,
  complained: 3,
  suppressed: 3,
};

// Adopts the webhook-materialized orphan row (see webhooks.ts's "message not
// found" branch) onto the batch row that lost the messageId race. Runs as a
// single transaction: the orphan is deleted before the batch row is updated
// because both rows would otherwise momentarily share the same messageId,
// which message_send_message_id_idx forbids.
async function adoptOrphanRow(
  ctx: BookkeepingCtx,
  recipient: { id: string; email: string | null },
  values: { messageId: string; subject: string | null; sentAt: Date }
): Promise<void> {
  await db.transaction(async (tx) => {
    const [orphan] = await tx
      .select({
        id: messageSend.id,
        status: messageSend.status,
        deliveredAt: messageSend.deliveredAt,
        openedAt: messageSend.openedAt,
        clickedAt: messageSend.clickedAt,
        bouncedAt: messageSend.bouncedAt,
        bounceType: messageSend.bounceType,
        bounceSubType: messageSend.bounceSubType,
        complainedAt: messageSend.complainedAt,
        suppressedAt: messageSend.suppressedAt,
      })
      .from(messageSend)
      .where(
        and(
          eq(messageSend.organizationId, ctx.organizationId),
          eq(messageSend.messageId, values.messageId),
          isNull(messageSend.batchSendId)
        )
      )
      .for("update");

    if (!orphan) {
      // The colliding row isn't an adoptable orphan (e.g. it already belongs
      // to a batch) — someone else's send genuinely holds this messageId.
      // Leave the batch row 'queued'; the stale-reclaim path picks it up.
      log.warn(
        "Post-send bookkeeping: messageId collision but no adoptable orphan row found",
        {
          messageId: values.messageId,
          batchId: ctx.batchId,
          organizationId: ctx.organizationId,
        }
      );
      return;
    }

    const orphanRank = ORPHAN_STATUS_RANK[orphan.status] ?? 0;
    const orphanIsMoreAdvanced = orphanRank > (ORPHAN_STATUS_RANK.sent ?? 0);

    await tx.delete(messageSend).where(eq(messageSend.id, orphan.id));

    await tx
      .update(messageSend)
      .set({
        status: orphanIsMoreAdvanced ? orphan.status : "sent",
        messageId: values.messageId,
        subject: values.subject,
        sentAt: values.sentAt,
        deliveredAt: orphan.deliveredAt ?? undefined,
        openedAt: orphan.openedAt ?? undefined,
        clickedAt: orphan.clickedAt ?? undefined,
        bouncedAt: orphan.bouncedAt ?? undefined,
        bounceType: orphan.bounceType ?? undefined,
        bounceSubType: orphan.bounceSubType ?? undefined,
        complainedAt: orphan.complainedAt ?? undefined,
        suppressedAt: orphan.suppressedAt ?? undefined,
      })
      .where(
        and(
          eq(messageSend.organizationId, ctx.organizationId),
          eq(messageSend.batchSendId, ctx.batchId),
          eq(messageSend.contactId, recipient.id)
        )
      );

    log.info("Adopted webhook orphan row", {
      messageId: values.messageId,
      batchId: ctx.batchId,
      orphanId: orphan.id,
      adoptedStatus: orphanIsMoreAdvanced ? orphan.status : "sent",
    });
  });
}

// After SES rejects a recipient. Returns whether the failure was recorded —
// callers count `failed` only for recorded rows. On persistent write failure
// the row stays claimed; the stale re-claim path retries this genuinely-unsent
// recipient later.
async function recordSendFailure(
  ctx: BookkeepingCtx,
  recipient: { id: string; email: string | null },
  error: string
): Promise<boolean> {
  try {
    await withBookkeepingRetries(() =>
      db
        .update(messageSend)
        .set({ status: "failed", error })
        .where(
          and(
            eq(messageSend.organizationId, ctx.organizationId),
            eq(messageSend.batchSendId, ctx.batchId),
            eq(messageSend.contactId, recipient.id)
          )
        )
    );
    return true;
  } catch (updateError) {
    captureException(updateError, {
      tags: { worker: "batch-sender", stage: "record-failure" },
      extra: { batchId: ctx.batchId, organizationId: ctx.organizationId },
    });
    log.error(
      "Failed to record send failure; row remains claimed",
      updateError,
      {
        email: recipient.email,
        batchId: ctx.batchId,
        organizationId: ctx.organizationId,
      }
    );
    return false;
  }
}

export const handler: SQSHandler = wrapHandler(
  async (event: SQSEvent, context: Context) => {
    if (!QUEUE_URL) {
      throw new Error(
        "BATCH_QUEUE_URL not configured — check Lambda environment"
      );
    }
    try {
      for (const record of event.Records) {
        const job: BatchJob = JSON.parse(record.body);
        await processJob(job, context, record);
      }
    } finally {
      await flushLogger();
    }
  }
);

/**
 * Write a broadcast-finished inbox notification, once per batch. Failed
 * counts exclude bookkeeping-write artifacts (message_send.error beginning
 * "Failed query") — those rows were accepted by SES, the DB write failed.
 */
async function notifyBroadcastFinished(
  batchId: string,
  organizationId: string
): Promise<void> {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const already = await hasRecentNotification({
      organizationId,
      type: "broadcast.finished",
      since,
      dataEquals: { key: "batchId", value: batchId },
    });
    if (already) {
      return;
    }

    const [[batch], [org]] = await Promise.all([
      db
        .select({
          name: batchSend.name,
          subject: batchSend.subject,
          status: batchSend.status,
          sent: batchSend.sent,
          totalRecipients: batchSend.totalRecipients,
          errorMessage: batchSend.errorMessage,
        })
        .from(batchSend)
        .where(
          and(
            eq(batchSend.id, batchId),
            eq(batchSend.organizationId, organizationId)
          )
        )
        .limit(1),
      db
        .select({ slug: organization.slug })
        .from(organization)
        .where(eq(organization.id, organizationId))
        .limit(1),
    ]);
    if (!(batch && org?.slug)) {
      return;
    }

    const [failedRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(messageSend)
      .where(
        and(
          eq(messageSend.batchSendId, batchId),
          eq(messageSend.organizationId, organizationId),
          eq(messageSend.status, "failed"),
          sql`(${messageSend.error} IS NULL OR ${messageSend.error} NOT LIKE 'Failed query%')`
        )
      );
    const realFailed = failedRow?.count ?? 0;
    const label = batch.name || batch.subject || "Broadcast";

    let title: string;
    let body: string | undefined;
    if (batch.status === "failed") {
      title = `Broadcast "${label}" failed`;
      body = batch.errorMessage ?? undefined;
    } else if (realFailed > 0) {
      title = `Broadcast "${label}" finished with ${realFailed} failed sends`;
      body = `${batch.sent} of ${batch.totalRecipients} recipients received the email. ${realFailed} sends failed.`;
    } else {
      title = `Broadcast "${label}" sent`;
      body = `Delivered to SES for ${batch.sent} of ${batch.totalRecipients} recipients.`;
    }

    await notifyOrg({
      organizationId,
      roles: ["owner", "admin", "marketing"],
      type: "broadcast.finished",
      title,
      body,
      href: `/${org.slug}/emails/broadcasts/${batchId}`,
      data: {
        batchId,
        status: batch.status,
        sent: batch.sent,
        failed: realFailed,
      },
    });
  } catch (error) {
    captureException(error, {
      tags: { worker: "batch-sender", stage: "finished-notification" },
      extra: { batchId, organizationId },
    });
    log.error("Failed to write broadcast-finished notification", error, {
      batchId,
      organizationId,
    });
  }
}

/**
 * Write a broadcast-paused inbox notification, deduplicated per batch per 24h.
 * Mirrors notifyBroadcastFinished's shape exactly — never lets a notification
 * failure break the send loop.
 */
async function notifyBroadcastQuotaPaused(
  batchId: string,
  organizationId: string,
  info: { max24HourSend: number; sentLast24Hours: number; reserve: number }
): Promise<void> {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const already = await hasRecentNotification({
      organizationId,
      type: "broadcast.quota_paused",
      since,
      dataEquals: { key: "batchId", value: batchId },
    });
    if (already) {
      return;
    }

    const [[batch], [org]] = await Promise.all([
      db
        .select({ name: batchSend.name, subject: batchSend.subject })
        .from(batchSend)
        .where(
          and(
            eq(batchSend.id, batchId),
            eq(batchSend.organizationId, organizationId)
          )
        )
        .limit(1),
      db
        .select({ slug: organization.slug })
        .from(organization)
        .where(eq(organization.id, organizationId))
        .limit(1),
    ]);
    if (!(batch && org?.slug)) {
      return;
    }

    const label = batch.name || batch.subject || "Broadcast";
    const title = `Broadcast "${label}" paused to protect your transactional email`;
    const body = `Daily quota ${info.max24HourSend.toLocaleString()}, ${info.sentLast24Hours.toLocaleString()} sent in the last 24h, ${info.reserve.toLocaleString()} reserved for transactional. Sending resumes automatically as quota frees up.`;

    await notifyOrg({
      organizationId,
      roles: ["owner", "admin", "marketing"],
      type: "broadcast.quota_paused",
      title,
      body,
      href: `/${org.slug}/emails/broadcasts/${batchId}`,
      data: {
        batchId,
        max24HourSend: info.max24HourSend,
        sentLast24Hours: info.sentLast24Hours,
        reserve: info.reserve,
      },
    });
  } catch (error) {
    captureException(error, {
      tags: { worker: "batch-sender", stage: "quota-paused-notification" },
      extra: { batchId, organizationId },
    });
    log.error("Failed to write broadcast-quota-paused notification", error, {
      batchId,
      organizationId,
    });
  }
}

/** Owner/admin emails for an org, for escalation mail. Empty array if none. */
async function getOrgAlertEmails(organizationId: string): Promise<string[]> {
  const rows = await db
    .select({ email: user.email, role: member.role })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(
      and(
        eq(member.organizationId, organizationId),
        // Narrow to plausible candidates in SQL. Without this the LIMIT is an
        // unordered slice of ALL members, so in an org with more than 100 a
        // role filter applied afterwards in JS can find nobody purely by
        // chance — and the failure is silent, because notifyOrg still writes
        // the in-app notification. The substring match is deliberately loose;
        // the exact comma-split check below is what actually decides.
        or(ilike(member.role, "%owner%"), ilike(member.role, "%admin%"))
      )
    )
    .limit(100);

  const wanted = ["owner", "admin"];
  const emails = rows
    .filter((r) =>
      r.role.split(",").some((role) => wanted.includes(role.trim()))
    )
    .map((r) => r.email);

  return [...new Set(emails)].slice(0, 10);
}

/**
 * Escalate a quota-paused broadcast that has made zero progress for
 * QUOTA_STUCK_THRESHOLD_MS: a distinct in-app notification (type
 * broadcast.quota_stuck) plus an email to the org's owners/admins. This is an
 * escalation ALONGSIDE the routine broadcast.quota_paused notification, not a
 * replacement — that one fires every 24h regardless of whether the pause is
 * temporary or permanent; this one only fires once a pause has proven itself
 * stuck, and its copy says so explicitly (no "resumes automatically" claim).
 */
async function alertBroadcastQuotaStuck(
  batch: {
    id: string;
    name: string | null;
    subject: string | null;
    awsAccountId: string | null;
    processedRecipients: number;
    totalRecipients: number;
  },
  organizationId: string,
  stuckSince: Date,
  info: { max24HourSend: number; sentLast24Hours: number; reserve: number }
): Promise<void> {
  try {
    const since = new Date(Date.now() - QUOTA_STUCK_ALERT_INTERVAL_MS);
    const already = await hasRecentNotification({
      organizationId,
      type: "broadcast.quota_stuck",
      since,
      dataEquals: { key: "batchId", value: batch.id },
    });
    if (already) {
      return;
    }

    const [[org], alertEmails] = await Promise.all([
      db
        .select({ slug: organization.slug })
        .from(organization)
        .where(eq(organization.id, organizationId))
        .limit(1),
      getOrgAlertEmails(organizationId),
    ]);
    if (!org?.slug) {
      captureMessage("alertBroadcastQuotaStuck: organization slug not found", {
        level: "warning",
        tags: { worker: "batch-sender" },
        extra: { organizationId },
      });
      return;
    }

    const label = batch.name || batch.subject || "Broadcast";

    await notifyOrg({
      organizationId,
      roles: ["owner", "admin", "marketing"],
      type: "broadcast.quota_stuck",
      title: `Broadcast "${label}" has been stuck for over 24 hours`,
      body: `Daily quota ${info.max24HourSend.toLocaleString()}, ${info.sentLast24Hours.toLocaleString()} sent in the last 24h, ${info.reserve.toLocaleString()} reserved for transactional. This broadcast is NOT resuming on its own — raise the SES quota, lower the reserve, or cancel it.`,
      href: `/${org.slug}/emails/broadcasts/${batch.id}`,
      data: {
        batchId: batch.id,
        max24HourSend: info.max24HourSend,
        sentLast24Hours: info.sentLast24Hours,
        reserve: info.reserve,
      },
    });

    if (alertEmails.length === 0) {
      log.info("No owner/admin recipients for quota-stuck email", {
        batchId: batch.id,
        organizationId,
      });
      return;
    }

    try {
      await sendBroadcastStuckEmail({
        to: alertEmails,
        broadcastName: label,
        batchId: batch.id,
        orgSlug: org.slug,
        awsAccountId: batch.awsAccountId,
        stuckSince,
        processedRecipients: batch.processedRecipients,
        totalRecipients: batch.totalRecipients,
        max24HourSend: info.max24HourSend,
        sentLast24Hours: info.sentLast24Hours,
        reserve: info.reserve,
      });
    } catch (error) {
      captureException(error, {
        tags: { worker: "batch-sender", stage: "quota-stuck-email" },
        extra: { batchId: batch.id, organizationId },
      });
      log.error("Failed to send broadcast-quota-stuck email", error, {
        batchId: batch.id,
        organizationId,
      });
    }
  } catch (error) {
    captureException(error, {
      tags: { worker: "batch-sender", stage: "quota-stuck-notification" },
      extra: { batchId: batch.id, organizationId },
    });
    log.error("Failed to alert broadcast-quota-stuck", error, {
      batchId: batch.id,
      organizationId,
    });
  }
}

/**
 * Write a broadcast-stopped-early inbox notification, deduplicated per batch
 * per 24h. Mirrors notifyBroadcastFinished's shape exactly — never lets a
 * notification failure break the send loop. Distinct type from
 * broadcast.finished (a different 24h dedupe key) so firing this one can
 * never suppress the genuine completion notification if the operator resumes
 * the same batch later in the day.
 */
async function notifyBroadcastStoppedEarly(
  batchId: string,
  organizationId: string,
  chunkIndex: number
): Promise<void> {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const already = await hasRecentNotification({
      organizationId,
      type: "broadcast.stopped_early",
      since,
      dataEquals: { key: "batchId", value: batchId },
    });
    if (already) {
      return;
    }

    const [[batch], [org]] = await Promise.all([
      db
        .select({ name: batchSend.name, subject: batchSend.subject })
        .from(batchSend)
        .where(
          and(
            eq(batchSend.id, batchId),
            eq(batchSend.organizationId, organizationId)
          )
        )
        .limit(1),
      db
        .select({ slug: organization.slug })
        .from(organization)
        .where(eq(organization.id, organizationId))
        .limit(1),
    ]);
    if (!(batch && org?.slug)) {
      return;
    }

    const label = batch.name || batch.subject || "Broadcast";
    const title = `Broadcast "${label}" stopped early`;
    const body =
      "Every recipient in a chunk failed to send, so the broadcast was " +
      "stopped to protect the rest of the audience. Most recipients were " +
      "not contacted. Resume from the broadcast page once the cause is fixed.";

    await notifyOrg({
      organizationId,
      roles: ["owner", "admin", "marketing"],
      type: "broadcast.stopped_early",
      title,
      body,
      href: `/${org.slug}/emails/broadcasts/${batchId}`,
      data: { batchId, chunkIndex },
    });
  } catch (error) {
    captureException(error, {
      tags: { worker: "batch-sender", stage: "stopped-early-notification" },
      extra: { batchId, organizationId },
    });
    log.error("Failed to write broadcast-stopped-early notification", error, {
      batchId,
      organizationId,
    });
  }
}

/**
 * Write a broadcast-paused inbox notification for SES daily quota exhaustion,
 * deduplicated per batch per 24h. Mirrors notifyBroadcastQuotaPaused's shape
 * exactly — never lets a notification failure break the send loop. Distinct
 * from notifyBroadcastQuotaPaused: that one is the transactional-reserve
 * gate (a self-imposed headroom), this one is the account's actual SES daily
 * sending limit being exhausted.
 */
async function notifyBroadcastDailyQuotaPaused(
  batchId: string,
  organizationId: string
): Promise<void> {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const already = await hasRecentNotification({
      organizationId,
      type: "broadcast.daily_quota_paused",
      since,
      dataEquals: { key: "batchId", value: batchId },
    });
    if (already) {
      return;
    }

    const [[batch], [org]] = await Promise.all([
      db
        .select({ name: batchSend.name, subject: batchSend.subject })
        .from(batchSend)
        .where(
          and(
            eq(batchSend.id, batchId),
            eq(batchSend.organizationId, organizationId)
          )
        )
        .limit(1),
      db
        .select({ slug: organization.slug })
        .from(organization)
        .where(eq(organization.id, organizationId))
        .limit(1),
    ]);
    if (!(batch && org?.slug)) {
      return;
    }

    const label = batch.name || batch.subject || "Broadcast";
    const title = `Broadcast "${label}" paused: SES daily quota exhausted`;
    const body =
      "Your AWS account's SES daily sending quota is exhausted. Sending " +
      "resumes automatically as the 24h window rolls.";

    await notifyOrg({
      organizationId,
      roles: ["owner", "admin", "marketing"],
      type: "broadcast.daily_quota_paused",
      title,
      body,
      href: `/${org.slug}/emails/broadcasts/${batchId}`,
      data: { batchId },
    });
  } catch (error) {
    captureException(error, {
      tags: {
        worker: "batch-sender",
        stage: "daily-quota-paused-notification",
      },
      extra: { batchId, organizationId },
    });
    log.error(
      "Failed to write broadcast-daily-quota-paused notification",
      error,
      { batchId, organizationId }
    );
  }
}

/**
 * Write a terminal/transitional status onto a batch, LOSING to a concurrent
 * cancel.
 *
 * processJob reads `batch.status` once (the cancelled check near the top) and
 * then runs for as long as a chunk takes to send. A cancel issued inside that
 * window is invisible to this invocation, so an unguarded write would flip the
 * row back out of 'cancelled' — and because the next invocation's cancelled
 * check reads that same column, the chain would resume and keep sending a
 * broadcast the user already stopped.
 *
 * A skipped write is the intended outcome here, not an error worth logging:
 * the batch is cancelled and its status is already correct.
 *
 * Note this makes cancel "stop the chain", not "stop instantly" — the chunk
 * currently in flight still delivers, because those messages are already with
 * SES and cannot be recalled.
 *
 * Every status write on batchSend must go through this. The non-status writes
 * (the progress heartbeat, the pausedReason set/clear) deliberately do not:
 * they cannot resurrect a cancelled batch, since only `status` gates the chain.
 */
async function setBatchStatus(
  batchId: string,
  // PgUpdateSetSource, not Partial<$inferInsert>: several call sites set
  // counters to `sql` expressions (e.g. `failed + ${n}`), which the plain
  // insert type rejects as SQL-not-assignable-to-number.
  values: PgUpdateSetSource<typeof batchSend>
): Promise<void> {
  await db
    .update(batchSend)
    .set(values)
    .where(and(eq(batchSend.id, batchId), ne(batchSend.status, "cancelled")));
}

// Releases claims this invocation made but never sent, restoring the exact
// pre-claim state so a redelivery's INSERT claim works unchanged. Callers that
// re-enqueue the SAME chunk MUST call this first: the redelivery lands well
// inside the 15-minute staleness window, so still-queued rows would block both
// its claim INSERT and its re-claim UPDATE, stranding every unsent contact at
// 'queued' forever.
async function releaseUnusedClaims(
  ctx: { organizationId: string; batchId: string },
  contacts: { id: string }[]
): Promise<void> {
  await db.delete(messageSend).where(
    and(
      eq(messageSend.organizationId, ctx.organizationId),
      eq(messageSend.batchSendId, ctx.batchId),
      inArray(
        messageSend.contactId,
        contacts.map((c) => c.id)
      ),
      eq(messageSend.status, "queued")
    )
  );
}

async function processJob(
  job: BatchJob,
  context: Context,
  record: SQSRecord
): Promise<void> {
  const { batchId, organizationId, awsAccountId, channel, chunkIndex } = job;

  // Scoped by (id, organizationId) — blocks cross-org reads.
  const [batch] = await db
    .select()
    .from(batchSend)
    .where(
      and(
        eq(batchSend.id, batchId),
        eq(batchSend.organizationId, organizationId)
      )
    )
    .limit(1);

  if (!batch) {
    log.error("Batch not found", undefined, { batchId, organizationId });
    return;
  }

  // Cancelled / unsupported-channel checks MUST run before self-reschedule
  // so a doomed batch can't bounce forever on short-remaining invocations.
  if (batch.status === "cancelled") {
    log.info("Batch cancelled, skipping", { batchId });
    return;
  }

  if (channel !== "email") {
    log.error("Unsupported batch channel", undefined, {
      batchId,
      channel,
      organizationId,
    });
    await setBatchStatus(batchId, {
      status: "failed",
      completedAt: new Date(),
      processedRecipients: batch.totalRecipients,
      failed: batch.totalRecipients,
      errorMessage: `Unsupported batch channel: ${channel}`,
      errorDetails: { channel },
    });
    await notifyBroadcastFinished(batchId, organizationId);
    return;
  }

  const remainingMs = context.getRemainingTimeInMillis();
  if (remainingMs < SELF_RESCHEDULE_FLOOR_MS) {
    const receiveCount = Number(record.attributes.ApproximateReceiveCount ?? 1);
    if (receiveCount > SELF_RESCHEDULE_LOOP_GUARD) {
      log.warn("broadcast.self_reschedule.suspected_loop", {
        batchId,
        chunkIndex,
        remainingMs,
        receiveCount,
      });
    } else {
      log.info("broadcast.self_reschedule", {
        batchId,
        chunkIndex,
        remainingMs,
        receiveCount,
      });
      await enqueueNextChunk(job, {
        delaySeconds: SELF_RESCHEDULE_DELAY_SECONDS,
      });
      return;
    }
  }

  // Freeze the audience on the first chunk. Deliberately NOT stamped at
  // preflight or schedule time: the preflight counts at T0 and the route would
  // stamp at T1, so contacts arriving in (T0, T1] would be counted-out but
  // snapshot-in — reintroducing the over-run this fixes. Stamping here also
  // gets scheduled sends right for free: a broadcast scheduled three days out
  // should include contacts added between now and then.
  let audienceSnapshotAt = batch.audienceSnapshotAt ?? undefined;
  if (chunkIndex === 0) {
    const startedAt = new Date();
    audienceSnapshotAt = audienceSnapshotAt ?? startedAt;
    const snapshotTotal = await countBroadcastRecipients(
      organizationId,
      channel as Channel,
      {
        audienceType: batch.audienceType as
          | "all"
          | "topic"
          | "segment"
          | undefined,
        topicId: batch.topicId ?? undefined,
        segmentId: batch.segmentId ?? undefined,
        createdBefore: audienceSnapshotAt,
      }
    );
    // Mutate the in-memory row, not just the DB — every later reference to
    // batch.totalRecipients in THIS invocation (remainingRecipients below,
    // and shouldEnqueueNextChunk's termination check further down) must see
    // the recount, or chunk 0 compares against the stale preflight count and
    // can terminate the send early (recount > stale) or loop one wasted
    // invocation (recount < stale).
    batch.totalRecipients = snapshotTotal;
    // KNOWN GAP (deliberately not fixed here): this stamp is not idempotent.
    // SQS is at-least-once, so chunk 0 can be delivered twice, both
    // invocations can observe a NULL snapshot, and the second overwrites the
    // first — leaving later chunks paginating against a window that differs
    // from the one totalRecipients was counted against.
    //
    // Bounded in practice: the messageSend claim INSERT still prevents double
    // sends, so the damage is a slightly-off totalRecipients/startedAt, and a
    // high totalRecipients self-heals (the chain runs until getContactsChunk
    // returns nothing, then marks completed).
    //
    // A `COALESCE(audience_snapshot_at, $1)` one-liner was tried and REVERTED:
    // it broke batch-sender-orphan-adoption and batch-sender-bookkeeping-db
    // (real-DB suites) — 6 tests — while the mocked suites stayed green,
    // because they stub `sql`. Closing this properly needs the ~20-line
    // claim-the-stamp-then-re-read-on-loss shape, which costs an extra query
    // on a 16,000-invocation path. Not worth it for a chunk-0-only race.
    await setBatchStatus(batchId, {
      status: "processing",
      startedAt,
      audienceSnapshotAt,
      totalRecipients: snapshotTotal,
    });
  }

  const remainingRecipients = Math.max(
    batch.totalRecipients - batch.processedRecipients,
    0
  );
  if (remainingRecipients === 0) {
    await setBatchStatus(batchId, {
      status: "completed",
      completedAt: new Date(),
    });
    await notifyBroadcastFinished(batchId, organizationId);
    return;
  }

  // Get contacts for this chunk using cursor-based pagination
  const contacts = await getContactsChunk(
    organizationId,
    channel,
    Math.min(CHUNK_SIZE, remainingRecipients),
    {
      audienceType: batch.audienceType as
        | "all"
        | "topic"
        | "segment"
        | undefined,
      topicId: batch.topicId ?? undefined,
      segmentId: batch.segmentId ?? undefined,
      createdBefore: audienceSnapshotAt,
    },
    job.cursor
  );

  if (contacts.length === 0) {
    // No more contacts, mark batch as completed
    await setBatchStatus(batchId, {
      status: "completed",
      completedAt: new Date(),
    });
    await notifyBroadcastFinished(batchId, organizationId);
    return;
  }

  // Get customer AWS credentials
  const credentials = await getCredentials(awsAccountId, organizationId);

  // Load account email features; the SES config set is resolved later, once
  // the sender domain is known (config sets are per-domain).
  const [accountRow] = await db
    .select({
      features: awsAccount.features,
      dailyQuotaReserve: awsAccount.dailyQuotaReserve,
    })
    .from(awsAccount)
    .where(
      and(
        eq(awsAccount.id, awsAccountId),
        eq(awsAccount.organizationId, organizationId)
      )
    )
    .limit(1);

  // Create SES v2 client with customer credentials and their SES region
  const sesClient = new SESv2Client({
    ...awsDefaults,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
    region: credentials.region,
  });

  // Fetch customer's SES rate limit (and, for the quota-reserve gate below,
  // the account's daily quota and rolling 24h usage). A GetAccount failure
  // leaves max24HourSend/sentLast24Hours undefined, which fails the gate open.
  let maxSendRate = DEFAULT_RATE_LIMIT;
  let max24HourSend: number | undefined;
  let sentLast24Hours: number | undefined;
  try {
    const accountInfo = await sesClient.send(new GetAccountCommand({}));
    maxSendRate = accountInfo.SendQuota?.MaxSendRate ?? DEFAULT_RATE_LIMIT;
    max24HourSend = accountInfo.SendQuota?.Max24HourSend;
    sentLast24Hours = accountInfo.SendQuota?.SentLast24Hours;
  } catch (error) {
    log.warn("Could not fetch SES rate limit, using default", {
      error: String(error),
    });
  }

  // Calculate delay between chunks to respect rate limit
  // CHUNK_SIZE recipients / rate limit = seconds to wait
  const rateLimitDelay = Math.ceil(CHUNK_SIZE / maxSendRate);

  // Daily quota reserve gate: pause this chunk (re-enqueue unchanged, same
  // chunkIndex/cursor) if sending it would eat into the transactional
  // reserve. Max24HourSend === -1 means unlimited quota — skip the gate.
  const reserve = accountRow?.dailyQuotaReserve ?? 0;
  if (
    channel === "email" &&
    reserve > 0 &&
    typeof max24HourSend === "number" &&
    max24HourSend > 0 &&
    typeof sentLast24Hours === "number"
  ) {
    const headroom = max24HourSend - sentLast24Hours - reserve;
    if (headroom < contacts.length) {
      log.warn("Broadcast paused: would eat into daily quota reserve", {
        batchId,
        max24HourSend,
        sentLast24Hours,
        reserve,
        headroom,
      });
      await notifyBroadcastQuotaPaused(batchId, organizationId, {
        max24HourSend,
        sentLast24Hours,
        reserve,
      });
      // pausedAt, not lastChunkAt: the stuck-alert below reads lastChunkAt's
      // staleness as its "no progress" signal, so the pause path must leave it
      // alone. pausedAt is the separate liveness heartbeat that lets
      // broadcast-reaper tell an alive pause loop from a dead one.
      await db
        .update(batchSend)
        .set({ pausedReason: "quota_reserve", pausedAt: new Date() })
        .where(eq(batchSend.id, batchId));
      // A paused cycle returns before the lastChunkAt write further down, so
      // a stale lastChunkAt on this still-`processing` batch is precisely the
      // "no progress" signal. Fall back to startedAt, then createdAt, for a
      // broadcast that paused on its very first chunk (lastChunkAt is only
      // ever written after a successful chunk). createdAt is NOT NULL in the
      // schema, so all three being absent should never happen against a real
      // row — the null check only guards against reading the elapsed time off
      // an unexpectedly incomplete row rather than crashing the chunk.
      const stuckSince =
        batch.lastChunkAt ?? batch.startedAt ?? batch.createdAt ?? null;
      if (
        stuckSince &&
        Date.now() - stuckSince.getTime() > QUOTA_STUCK_THRESHOLD_MS
      ) {
        await alertBroadcastQuotaStuck(batch, organizationId, stuckSince, {
          max24HourSend,
          sentLast24Hours,
          reserve,
        });
      }
      // Re-enqueue the SAME chunk (same chunkIndex, same cursor) — matches
      // the throttle-recovery re-enqueue shape above. 900s is the SQS
      // DelaySeconds max; the batch resumes as the 24h window rolls.
      await enqueueNextChunk(job, { delaySeconds: 900 });
      return;
    }
  }

  // Load template info and organization name
  let sesTemplateName: string | undefined;
  let templateHtml: string | undefined;
  let orgName: string | undefined;
  let emailType: "marketing" | "transactional" = "marketing";

  if (batch.emailTemplateId) {
    const [[tmpl], [org]] = await Promise.all([
      db
        .select({
          sesTemplateName: template.sesTemplateName,
          compiledHtml: template.compiledHtml,
          emailType: template.emailType,
        })
        .from(template)
        .where(
          and(
            eq(template.id, batch.emailTemplateId),
            eq(template.organizationId, organizationId)
          )
        )
        .limit(1),
      db
        .select({ name: organization.name })
        .from(organization)
        .where(eq(organization.id, organizationId))
        .limit(1),
    ]);
    sesTemplateName = tmpl?.sesTemplateName ?? undefined;
    templateHtml = tmpl?.compiledHtml ?? undefined;
    emailType = tmpl?.emailType ?? "marketing";
    orgName = org?.name ?? undefined;
  }

  // Send to contacts using SES
  let sent = 0;
  let failed = 0;
  const sentContactIds: string[] = [];

  // Both throw when the deployment has not configured its own URLs. That is the
  // intended behavior for a recipient-facing link: a self-hosted customer's
  // unsubscribe token is meaningless to the Wraps platform, so a silent
  // fallback would mail their contacts a dead link on another company's domain.
  // Do not wrap these in a try/catch that restores a default.
  const apiBaseUrl = resolveApiBaseUrl();
  const appBaseUrl = resolveAppUrl();

  // Filter email contacts
  let emailContacts = contacts.filter((c) => channel === "email" && c.email);

  // Claim contacts atomically BEFORE sending. The partial unique index
  // message_send_dedup_idx (batchSendId, contactId) makes the insert a
  // race-safe claim: concurrent duplicate deliveries of this chunk each
  // try to INSERT, only one wins per contact. NOTE: bare onConflictDoNothing()
  // — Drizzle cannot target a partial unique index.
  const now = new Date();
  const claimRows = emailContacts.map((c) => ({
    organizationId,
    contactId: c.id,
    awsAccountId,
    channel: "email" as const,
    batchSendId: batchId,
    sourceType: "batch" as const,
    recipient: c.email ?? "",
    subject: batch.subject,
    from: batch.from,
    fromName: batch.fromName,
    emailTemplateId: batch.emailTemplateId,
    status: "queued" as const,
    claimedAt: now,
  }));
  const claimed = claimRows.length
    ? await db
        .insert(messageSend)
        .values(claimRows)
        .onConflictDoNothing()
        .returning({ contactId: messageSend.contactId })
    : [];
  const claimedIds = new Set(claimed.map((r) => r.contactId));

  // Re-claim retryable rows the insert skipped (failed rows + stale crashed claims).
  // The UPDATE serializes on each row under READ COMMITTED: the loser re-evaluates
  // after the winner commits and sees status='queued' with a fresh claimedAt — so
  // it matches zero rows and the race is closed. NEVER use a blanket
  // `status NOT IN dedupStatuses` here: 'queued' would be outside that set and
  // the predicate would steal FRESH claims from a live concurrent execution,
  // reintroducing the duplicate-send race this whole block is meant to prevent.
  const notClaimed = emailContacts
    .filter((c) => !claimedIds.has(c.id))
    .map((c) => c.id);
  if (notClaimed.length > 0) {
    const reclaimed = await db
      .update(messageSend)
      .set({ status: "queued", error: null, claimedAt: new Date() })
      .where(
        and(
          eq(messageSend.organizationId, organizationId),
          eq(messageSend.batchSendId, batchId),
          inArray(messageSend.contactId, notClaimed),
          or(
            // Only genuinely-unsent failures: a 'failed' row carrying a
            // messageId was accepted by SES (e.g. a bookkeeping error was
            // misfiled as a send failure) — re-claiming it would send a
            // duplicate, and SES has no idempotency token to stop it.
            and(
              eq(messageSend.status, "failed"),
              isNull(messageSend.messageId)
            ),
            and(
              eq(messageSend.status, "queued"),
              isNull(messageSend.messageId),
              sql`${messageSend.claimedAt} < now() - interval '${sql.raw(String(CLAIM_STALE_MINUTES))} minutes'`
            )
          )
        )
      )
      .returning({ contactId: messageSend.contactId });
    for (const r of reclaimed) {
      claimedIds.add(r.contactId);
    }
  }

  emailContacts = emailContacts.filter((c) => claimedIds.has(c.id));

  if (claimedIds.size < claimRows.length) {
    log.info("Batch claim: skipped already-claimed contacts", {
      batchId,
      total: claimRows.length,
      claimed: claimedIds.size,
      skipped: claimRows.length - claimedIds.size,
    });
  }

  const chunkProcessedRecipients = emailContacts.length;
  const isMarketing = emailType === "marketing";

  // Resolve sender: batch.from > org default > owner email domain > fail
  let fromAddress: string | null = batch.from;
  let fromName: string | null = batch.fromName;
  if (!fromAddress) {
    const [orgExt] = await db
      .select({
        defaultFrom: organizationExtension.defaultFrom,
        defaultFromName: organizationExtension.defaultFromName,
      })
      .from(organizationExtension)
      .where(eq(organizationExtension.organizationId, organizationId))
      .limit(1);
    fromAddress = orgExt?.defaultFrom ?? null;
    if (!fromName) {
      fromName = orgExt?.defaultFromName ?? null;
    }
  }

  if (!fromAddress) {
    log.error("No sender address configured for batch", {
      batchId,
      organizationId,
    });
    // Mark all claimed contacts in this chunk as failed
    if (emailContacts.length > 0) {
      await db
        .update(messageSend)
        .set({
          status: "failed",
          error:
            "No sender email configured. Set a default sender in Settings > Sender Defaults.",
        })
        .where(
          and(
            eq(messageSend.organizationId, organizationId),
            eq(messageSend.batchSendId, batchId),
            inArray(
              messageSend.contactId,
              emailContacts.map((c) => c.id)
            )
          )
        );
    }
    await setBatchStatus(batchId, {
      status: "failed",
      completedAt: new Date(),
      processedRecipients: sql`${batchSend.processedRecipients} + ${emailContacts.length}`,
      failed: sql`${batchSend.failed} + ${emailContacts.length}`,
    });
    await notifyBroadcastFinished(batchId, organizationId);
    return;
  }

  const fromDisplay = fromName ? `${fromName} <${fromAddress}>` : fromAddress;

  // Resolve the SES config set from the actual sender domain (config sets are
  // per-domain). Looks up a set discovery confirmed exists; never derives a
  // name that could hard-fail delivery.
  const configSetName = resolveConfigurationSetName({
    fromDomain: fromAddress.split("@").at(-1),
    storedConfigSetName: accountRow?.features?.email?.configSetName,
    identities: accountRow?.features?.email?.identities,
  });

  // For topic-audienced batches, scope the one-click unsubscribe to that topic
  // so recipients are only removed from that list — not all org topics.
  // "all" and "segment" audiences fall back to global unsubscribe since no
  // single topic represents the send.
  const unsubscribeTopicId =
    batch.audienceType === "topic" ? (batch.topicId ?? undefined) : undefined;

  // Use bulk sending for SES templates, individual sends for raw HTML
  if (sesTemplateName) {
    // SES bulk email limit is 50 recipients per API call
    const BULK_BATCH_SIZE = 50;

    // Pre-compute canonical vars that the SES template references so we can
    // pad TemplateData with empty-string fallbacks. SES hard-fails rendering
    // (RenderingFailure → silent non-delivery) when a bare {{var}} is absent
    // from TemplateData. Empty string is falsy for {{#if}} so conditionals
    // still work correctly. We scan both subject and body; use the original
    // compiledHtml since it retains the {{dot.notation}} form that
    // extractCanonicalVars was designed to match.
    const templateCanonicalVars = extractCanonicalVars(
      `${batch.subject ?? ""}\n${templateHtml ?? ""}`
    );

    // Process in batches of 50
    for (let i = 0; i < emailContacts.length; i += BULK_BATCH_SIZE) {
      const recipientBatch = emailContacts.slice(i, i + BULK_BATCH_SIZE);

      // Build bulk email entries, keeping the per-recipient rendered subject
      // alongside each entry so messageSend records what the recipient sees
      // (SES renders server-side; recording batch.subject raw put literal
      // {{#if firstName}} into email logs).
      const prepared = await Promise.all(
        recipientBatch.map(async (recipient) => {
          // Generate unsubscribe URLs for marketing emails
          let unsubscribeUrl: string | undefined;
          let preferencesUrl: string | undefined;

          if (isMarketing) {
            const unsubscribeToken = await generateUnsubscribeToken(
              recipient.id,
              organizationId,
              unsubscribeTopicId
            );
            unsubscribeUrl = `${apiBaseUrl}/unsubscribe/${unsubscribeToken}`;
            preferencesUrl = `${appBaseUrl}/preferences/${unsubscribeToken}`;
          }

          // Apply user-configured variable mappings
          const finalData = applyVariableMappings(
            buildRecipientReplacementData(recipient, {
              orgName,
              unsubscribeUrl,
              preferencesUrl,
            }),
            batch.variableMappings ?? undefined,
            recipient
          );

          // Pad missing vars so SES never encounters an absent variable.
          // SES hard-fails rendering when a bare {{var}} is missing from
          // ReplacementTemplateData. Empty string is falsy for {{#if}}.
          for (const rawVar of templateCanonicalVars) {
            const sesKey = toSesVariableName(rawVar);
            if (!(sesKey in finalData)) {
              finalData[sesKey] = "";
            }
          }

          const entry: BulkEmailEntry = {
            Destination: {
              ToAddresses: [recipient.email!],
            },
            ReplacementEmailContent: {
              ReplacementTemplate: {
                ReplacementTemplateData: JSON.stringify(finalData),
              },
            },
          };

          // Add List-Unsubscribe headers for marketing emails (RFC 8058)
          if (isMarketing && unsubscribeUrl) {
            entry.ReplacementHeaders = [
              {
                Name: "List-Unsubscribe",
                Value: `<${unsubscribeUrl}>`,
              },
              {
                Name: "List-Unsubscribe-Post",
                Value: "List-Unsubscribe=One-Click",
              },
            ];
          }

          return {
            entry,
            renderedSubject: renderSubjectForRecord(batch.subject, finalData),
          };
        })
      );
      const bulkEntries: BulkEmailEntry[] = prepared.map((p) => p.entry);

      // Build default template data (required by SES as fallback)
      const defaultTemplateData: Record<string, string> = {
        email: "",
        firstName: "",
        lastName: "",
        company: "",
        jobTitle: "",
        contactEmail: "",
        contactFirstName: "",
        contactLastName: "",
        contactCompany: "",
        contactJobTitle: "",
        organizationName: orgName ?? "",
        unsubscribeUrl: "",
        preferencesUrl: "",
      };

      // Pad DefaultContent.TemplateData with the same missing vars.
      // SES uses this as a fallback when a recipient entry lacks a key.
      for (const rawVar of templateCanonicalVars) {
        const sesKey = toSesVariableName(rawVar);
        if (!(sesKey in defaultTemplateData)) {
          defaultTemplateData[sesKey] = "";
        }
      }

      let result: SendBulkEmailCommandOutput;
      try {
        result = await sesClient.send(
          new SendBulkEmailCommand({
            FromEmailAddress: fromDisplay,
            ReplyToAddresses: batch.replyTo ? [batch.replyTo] : undefined,
            DefaultContent: {
              Template: {
                TemplateName: sesTemplateName,
                TemplateData: JSON.stringify(defaultTemplateData),
              },
            },
            BulkEmailEntries: bulkEntries,
            ConfigurationSetName: configSetName,
            // Message tags for tracking in CloudWatch and EventBridge
            DefaultEmailTags: [
              { Name: "batchId", Value: batchId },
              { Name: "organizationId", Value: organizationId },
              ...(batch.emailTemplateId
                ? [{ Name: "templateId", Value: batch.emailTemplateId }]
                : []),
              { Name: "source", Value: "broadcast" },
            ],
          })
        );
      } catch (error) {
        // Only SES call errors reach this catch — the post-send bookkeeping
        // moved below it, so a DB error can never be misread as a send
        // failure. Every branch exits the iteration; rows in this sub-batch
        // are all still 'queued' when the catch runs.

        // SES daily sending quota exhausted. This is a wait, not a failure:
        // capacity returns as the rolling 24h window rolls. Checked BEFORE
        // isThrottle because SESv2 may report it as TooManyRequestsException,
        // which isThrottle would otherwise swallow into a 30s retry loop.
        const isDailyQuota =
          error instanceof Error &&
          (/daily (message )?quota exceeded/i.test(error.message) ||
            /sending quota .*exceeded/i.test(error.message) ||
            error.name === "LimitExceededException");

        if (isDailyQuota) {
          await releaseUnusedClaims({ organizationId, batchId }, emailContacts);
          // See the quota_reserve pause above for why this heartbeats pausedAt
          // rather than lastChunkAt. This branch matters most in practice: a
          // send larger than the account's daily quota spends the majority of
          // its wall-clock right here, cycling every 900s for days.
          await db
            .update(batchSend)
            .set({ pausedReason: "daily_quota", pausedAt: new Date() })
            .where(eq(batchSend.id, batchId));
          log.warn("broadcast.daily_quota_paused", {
            batchId,
            chunkIndex,
            organizationId,
          });
          await notifyBroadcastDailyQuotaPaused(batchId, organizationId);
          await enqueueNextChunk({ ...job }, { delaySeconds: 900 });
          return;
        }

        // Check if this is a throttle error
        const isThrottle =
          error instanceof Error &&
          (error.name === "Throttling" ||
            error.name === "TooManyRequestsException" ||
            error.message.includes("rate exceeded"));

        if (isThrottle) {
          // Release this invocation's unused claims BEFORE re-enqueueing. See
          // releaseUnusedClaims for why this must happen before the re-enqueue.
          await releaseUnusedClaims({ organizationId, batchId }, emailContacts);

          // Re-queue this chunk with a longer delay (30 seconds)
          log.warn("SES throttled, requeuing chunk with delay", {
            batchId,
            chunkIndex,
            delaySeconds: 30,
          });
          await enqueueNextChunk(
            { ...job }, // Same job, same chunkIndex
            { delaySeconds: 30 }
          );
          return; // Exit early, will retry later
        }

        // Permission error: fail fast with actionable message
        const isPermission =
          error instanceof Error &&
          (error.name === "AccessDeniedException" ||
            error.name === "AccessDenied" ||
            error.message.includes("is not authorized to perform") ||
            error.message.includes("AccessDenied"));

        if (isPermission) {
          const permError =
            "Your IAM role does not have permission to send emails. " +
            "Fix: update your CloudFormation stack to the latest version, " +
            "or run `wraps platform update-role` in the CLI.";
          log.error("Bulk send permission denied", error, {
            batchId,
            organizationId,
          });
          if (recipientBatch.length > 0) {
            await db
              .update(messageSend)
              .set({ status: "failed", error: permError })
              .where(
                and(
                  eq(messageSend.organizationId, organizationId),
                  eq(messageSend.batchSendId, batchId),
                  inArray(
                    messageSend.contactId,
                    recipientBatch.map((r) => r.id)
                  ),
                  eq(messageSend.status, "queued")
                )
              );
          }
          throw new Error(permError);
        }

        // Non-throttle error: SES rejected the chunk, so claimed recipients
        // were never sent. The status='queued' guard restricts the sweep to
        // rows this sub-batch actually owns in their pre-send state — it can
        // never clobber a row already recorded 'sent'. Count failures from
        // rows actually updated, not chunk size.
        log.error("Bulk send failed for chunk", error, {
          batchId,
          chunkOffset: i,
          organizationId,
        });
        const errorMessage =
          error instanceof Error ? error.message : "Bulk send failed";
        if (recipientBatch.length > 0) {
          const marked = await db
            .update(messageSend)
            .set({ status: "failed", error: errorMessage })
            .where(
              and(
                eq(messageSend.organizationId, organizationId),
                eq(messageSend.batchSendId, batchId),
                inArray(
                  messageSend.contactId,
                  recipientBatch.map((r) => r.id)
                ),
                eq(messageSend.status, "queued")
              )
            )
            .returning({ contactId: messageSend.contactId });
          failed += marked.length;
        }
        continue;
      }

      // Record send results OUTSIDE the SES try/catch. SES has accepted every
      // SUCCESS entry at this point: a transient DB error while recording that
      // fact must not mark rows failed (re-claim would double-send them) and
      // must not count toward the failed counter.
      const ctx = { organizationId, batchId };
      const sentAt = new Date();
      await Promise.all(
        recipientBatch.map(async (recipient, j) => {
          const bulkResult = result.BulkEmailEntryResults?.[j];
          if (bulkResult?.Status === "SUCCESS") {
            await recordAcceptedSend(ctx, recipient, {
              messageId: bulkResult.MessageId || null,
              subject: prepared[j].renderedSubject,
              sentAt,
            });
            sent++;
            sentContactIds.push(recipient.id);
          } else {
            log.error("Bulk send failed for recipient", bulkResult?.Error, {
              email: recipient.email,
              batchId,
              organizationId,
            });
            const recorded = await recordSendFailure(
              ctx,
              recipient,
              bulkResult?.Error ?? "Unknown error"
            );
            if (recorded) {
              failed++;
            }
          }
        })
      );
    }
  } else {
    // Fallback: individual sends for raw HTML (parallel with concurrency limit)
    // Transform variables to SES format so the local renderer sees the same
    // {{contactFirstName}}-style names SES templates use.
    // Note: templateHtml (from compiledHtml) should already be transformed by publish
    // but batch.htmlContent might contain untransformed variables
    const rawHtml =
      templateHtml ?? batch.htmlContent ?? "<p>Hello from Wraps!</p>";
    const htmlTemplate = transformVariablesForSes(rawHtml);
    const subjectTemplate = transformVariablesForSes(
      batch.subject ?? "Message from Wraps"
    );
    const CONCURRENCY = 10;

    for (let i = 0; i < emailContacts.length; i += CONCURRENCY) {
      const recipientBatch = emailContacts.slice(i, i + CONCURRENCY);

      const results = await Promise.allSettled(
        recipientBatch.map(async (recipient) => {
          // Generate unsubscribe URLs for marketing emails
          let unsubscribeUrl: string | undefined;
          let preferencesUrl: string | undefined;

          if (isMarketing) {
            const unsubscribeToken = await generateUnsubscribeToken(
              recipient.id,
              organizationId,
              unsubscribeTopicId
            );
            unsubscribeUrl = `${apiBaseUrl}/unsubscribe/${unsubscribeToken}`;
            preferencesUrl = `${appBaseUrl}/preferences/${unsubscribeToken}`;
          }

          // On this path WE are the rendering engine (no SES template), so
          // substitute per recipient. A render failure throws and the send is
          // recorded as failed — never deliver raw {{...}} syntax.
          const finalData = applyVariableMappings(
            buildRecipientReplacementData(recipient, {
              orgName,
              unsubscribeUrl,
              preferencesUrl,
            }),
            batch.variableMappings ?? undefined,
            recipient
          );
          // Neither is escaped, matching what SES does on the template path
          // above — same template + same contact must not render differently
          // depending on which branch a broadcast happened to take.
          const html = renderForSend(htmlTemplate, finalData);
          const subject = renderForSend(subjectTemplate, finalData);

          const result = await sendEmail({
            client: sesClient,
            from: fromDisplay,
            to: recipient.email!,
            subject,
            html,
            text: htmlToPlainText(html),
            replyTo: batch.replyTo ?? undefined,
            configurationSetName: configSetName,
            marketing:
              isMarketing && unsubscribeUrl ? { unsubscribeUrl } : undefined,
            tags: [
              { name: "batchId", value: batchId },
              { name: "organizationId", value: organizationId },
              ...(batch.emailTemplateId
                ? [{ name: "templateId", value: batch.emailTemplateId }]
                : []),
              { name: "source", value: "broadcast" },
            ],
          });

          return { recipient, messageId: result.messageId, subject };
        })
      );

      // Update claimed rows with send results (raw-HTML individual-send path).
      // Bookkeeping errors are retried and never thrown: an unhandled DB error
      // here would crash the invocation and SQS-redeliver the whole chunk
      // against rows SES already accepted.
      const ctx = { organizationId, batchId };
      const sentAt = new Date();
      await Promise.all(
        results.map(async (result, j) => {
          const recipient = recipientBatch[j];
          if (result.status === "fulfilled") {
            await recordAcceptedSend(ctx, recipient, {
              messageId: result.value.messageId || null,
              subject: result.value.subject,
              sentAt,
            });
            sent++;
            sentContactIds.push(recipient.id);
          } else {
            log.error("Individual send failed", result.reason, {
              email: recipient.email,
              batchId,
              organizationId,
            });
            const recorded = await recordSendFailure(
              ctx,
              recipient,
              result.reason instanceof Error
                ? result.reason.message
                : "Send failed"
            );
            if (recorded) {
              failed++;
            }
          }
        })
      );
    }
  }

  // Track first email sent
  if (sent > 0) {
    await trackFirstEmailSent(organizationId, {
      channel: "email",
      source: "broadcast",
    }).catch((err) =>
      log.error("Activation tracking failed", err, { organizationId })
    );
  }

  // Update contact email counters for successful sends
  if (sentContactIds.length > 0) {
    await db
      .update(contact)
      .set({
        lastEmailSentAt: new Date(),
        emailsSent: sql`COALESCE(${contact.emailsSent}, 0) + 1`,
      })
      .where(inArray(contact.id, sentContactIds));
  }

  // Compute cursor BEFORE the progress UPDATE so the heartbeat pointer
  // (lastCursor) lands in the same write — DLQ consumer and /resume both
  // read lastChunkIndex/lastCursor to know where to pick up.
  const lastContact = contacts.at(-1);
  const nextCursor = lastContact ? { id: lastContact.id } : null;

  await db
    .update(batchSend)
    .set({
      processedRecipients: sql`${batchSend.processedRecipients} + ${chunkProcessedRecipients}`,
      sent: sql`${batchSend.sent} + ${sent}`,
      failed: sql`${batchSend.failed} + ${failed}`,
      lastChunkAt: new Date(),
      lastChunkIndex: chunkIndex,
      lastCursor: nextCursor,
      // This chunk got through, so whatever paused us is resolved. Both pause
      // branches (quota reserve, daily quota) return before reaching here, so
      // this only runs on real progress. pausedAt clears with it — a stale
      // pausedAt left on a running batch would make broadcast-reaper treat a
      // healthy chain as a dead pause loop and enqueue a duplicate.
      pausedReason: null,
      pausedAt: null,
    })
    .where(eq(batchSend.id, batchId));

  // Circuit breaker: a chunk that sent nothing and failed everything means the
  // error is systemic, not per-recipient. Continuing would march the rest of
  // the audience into 'failed' 50 at a time. Stop and let an operator use
  // POST /v1/batch/:id/resume once the cause is fixed. No error classifier is
  // exhaustive, so this — not the classifier above — is the real ceiling on
  // blast radius.
  const chunkWhollyFailed =
    chunkProcessedRecipients > 0 &&
    sent === 0 &&
    failed === chunkProcessedRecipients;

  if (chunkWhollyFailed) {
    log.error("broadcast.chunk_wholly_failed", undefined, {
      batchId,
      chunkIndex,
      organizationId,
      failed,
    });
    await setBatchStatus(batchId, {
      status: "failed",
      completedAt: new Date(),
      errorMessage:
        `Every recipient in chunk ${chunkIndex} failed to send, so the ` +
        "broadcast was stopped to protect the rest of the audience. Fix " +
        "the underlying error and resume from the broadcast page.",
    });
    await notifyBroadcastStoppedEarly(batchId, organizationId, chunkIndex);
    return;
  }

  const shouldEnqueueNextChunk =
    contacts.length === Math.min(CHUNK_SIZE, remainingRecipients) &&
    batch.processedRecipients + contacts.length < batch.totalRecipients;
  if (shouldEnqueueNextChunk) {
    await enqueueNextChunk(
      { ...job, chunkIndex: chunkIndex + 1, cursor: nextCursor ?? undefined },
      { delaySeconds: rateLimitDelay }
    );
  } else {
    // Short chunk means we've reached the end — mark batch completed and
    // reconcile sent/failed from row statuses. The incremental counters can
    // drift when a chunk hits partial failures; rows are the source of truth.
    const unaccepted = sql.raw(
      MESSAGE_SEND_UNACCEPTED_STATUSES.map((s) => `'${s}'`).join(", ")
    );
    await setBatchStatus(batchId, {
      status: "completed",
      completedAt: new Date(),
      sent: sql`(select count(*)::int from ${messageSend} where ${messageSend.batchSendId} = ${batchId} and ${messageSend.organizationId} = ${organizationId} and ${messageSend.status} not in (${unaccepted}))`,
      failed: sql`(select count(*)::int from ${messageSend} where ${messageSend.batchSendId} = ${batchId} and ${messageSend.organizationId} = ${organizationId} and ${messageSend.status} = 'failed')`,
    });
    await notifyBroadcastFinished(batchId, organizationId);
  }
}

type ContactChunk = {
  id: string;
  email: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  jobTitle: string | null;
  properties: Record<string, unknown>;
  createdAt: Date;
};

type RecipientFilter = {
  audienceType?: "all" | "topic" | "segment";
  topicId?: string;
  segmentId?: string;
  /** Upper bound on contact.createdAt — the broadcast's audience snapshot. */
  createdBefore?: Date;
};

export type BatchCursor = { id: string };

export async function getContactsChunk(
  organizationId: string,
  channel: string,
  limit: number,
  filter?: RecipientFilter,
  cursor?: BatchCursor
): Promise<ContactChunk[]> {
  const conditions: (ReturnType<typeof eq> | ReturnType<typeof sql>)[] = [
    eq(contact.organizationId, organizationId),
  ];

  // Same predicate the dashboard counts with, not a copy of it: a broadcast
  // that previews 412 recipients has to send to those 412. This used to be
  // inline SQL here, which is how the count and the send could drift.
  if (channel !== "email" && channel !== "sms") {
    return [];
  }
  conditions.push(channelEligibilitySQL(channel));

  // Apply recipient filter
  if (filter?.audienceType === "topic" && filter.topicId) {
    const topicSubquery = db
      .select({ contactId: contactTopic.contactId })
      .from(contactTopic)
      .where(
        and(
          eq(contactTopic.contactId, contact.id),
          eq(contactTopic.topicId, filter.topicId),
          eq(contactTopic.status, "subscribed")
        )
      );
    conditions.push(exists(topicSubquery));
  }

  if (filter?.audienceType === "segment" && filter.segmentId) {
    const [segmentRow] = await db
      .select({ id: segment.id, condition: segment.condition })
      .from(segment)
      .where(
        and(
          eq(segment.id, filter.segmentId),
          eq(segment.organizationId, organizationId)
        )
      );

    if (!segmentRow) {
      log.warn("Segment not found for batch send", {
        segmentId: filter.segmentId,
        organizationId,
      });
      return [];
    }

    const segmentSQL = buildConditionSQL(segmentRow.condition);
    if (!segmentSQL) {
      // Fail closed rather than falling through to an org-wide send. Reachable
      // when the stored condition uses an operator this build doesn't know —
      // e.g. a segment authored on a newer release after a rollback.
      log.error("Segment condition compiled to no SQL; refusing to send", {
        segmentId: filter.segmentId,
        organizationId,
      });
      return [];
    }
    conditions.push(segmentSQL);
  }

  // Cursor-based (keyset) pagination: skip contacts at or before the cursor
  // position instead of using OFFSET, which breaks when contacts are
  // added/deleted between chunks.
  if (cursor) {
    conditions.push(sql`${contact.id} > ${cursor.id}`);
  }

  // Freeze the audience at send start: a contact created after the snapshot
  // must never be swept into a broadcast already in progress, no matter how
  // long the send takes to drain.
  if (filter?.createdBefore) {
    conditions.push(lte(contact.createdAt, filter.createdBefore));
  }

  return db
    .select({
      id: contact.id,
      email: contact.email,
      phone: contact.phone,
      firstName: contact.firstName,
      lastName: contact.lastName,
      company: contact.company,
      jobTitle: contact.jobTitle,
      properties: contact.properties,
      createdAt: contact.createdAt,
    })
    .from(contact)
    .where(and(...(conditions as Parameters<typeof and>)))
    .orderBy(contact.id)
    .limit(limit);
}

/**
 * Convert HTML to plain text for email fallback
 * Uses react-email's toPlainText for robust HTML-to-text conversion
 */
function htmlToPlainText(html: string): string {
  return toPlainText(html);
}

type BatchRecipient = {
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  jobTitle: string | null;
  properties: Record<string, unknown> | null;
};

/**
 * Build per-recipient replacement data for template rendering.
 * Only includes non-empty values: SES treats both absent and "" as falsy
 * in {{#if}} (verified via test-render), and the local Handlebars renderer
 * treats "" as falsy too, so omitting empties keeps both engines agreeing
 * on conditional branches. Bare {{var}} references to a missing key are
 * the dangerous case — SES hard-fails rendering — which is why the bulk
 * send's DefaultContent.TemplateData supplies every standard key as "".
 */
function buildRecipientReplacementData(
  recipient: BatchRecipient,
  urls: {
    orgName: string | null | undefined;
    unsubscribeUrl: string | undefined;
    preferencesUrl: string | undefined;
  }
): Record<string, string> {
  const replacementData: Record<string, string> = {};

  const addIfPresent = (key: string, value: string | null | undefined) => {
    if (value) {
      replacementData[key] = value;
    }
  };

  // Always include email (required)
  replacementData.email = recipient.email!;
  replacementData.contactEmail = recipient.email!;

  // Short names (for templates using {{firstName}})
  addIfPresent("firstName", recipient.firstName);
  addIfPresent("lastName", recipient.lastName);
  addIfPresent("company", recipient.company);
  addIfPresent("jobTitle", recipient.jobTitle);

  // Full names with prefix (for templates using {{contact.firstName}})
  addIfPresent("contactFirstName", recipient.firstName);
  addIfPresent("contactLastName", recipient.lastName);
  addIfPresent("contactCompany", recipient.company);
  addIfPresent("contactJobTitle", recipient.jobTitle);

  // Organization and URLs
  addIfPresent("organizationName", urls.orgName);
  addIfPresent("unsubscribeUrl", urls.unsubscribeUrl);
  addIfPresent("preferencesUrl", urls.preferencesUrl);

  // Add custom properties with flattened names (only non-empty)
  if (recipient.properties) {
    for (const [key, value] of Object.entries(recipient.properties)) {
      const strValue = value != null ? String(value) : null;
      if (strValue) {
        replacementData[key] = strValue;
        const flatKey = `contactProperties${key.charAt(0).toUpperCase()}${key.slice(1)}`;
        replacementData[flatKey] = strValue;
      }
    }
  }

  return replacementData;
}

/**
 * Render a batch subject for the messageSend record on the SES-template
 * path. SES does the authoritative render server-side; this local render
 * exists so email logs show what the recipient saw instead of raw
 * {{...}} syntax. Best-effort: a render failure falls back to the raw
 * subject rather than blocking a send SES may handle fine.
 */
function renderSubjectForRecord(
  subject: string | null,
  data: Record<string, string>
): string | null {
  if (!subject) {
    return subject;
  }
  try {
    return renderTemplateStrict(transformVariablesForSes(subject), data);
  } catch {
    return subject;
  }
}

/**
 * Render a template string for the raw-HTML send path, where WE are the
 * rendering engine (no SES template involved). A failure throws — the
 * per-recipient send is recorded as failed instead of delivering raw
 * {{...}} template syntax to a real inbox.
 */
function renderForSend(template: string, data: Record<string, string>): string {
  try {
    return renderTemplateStrict(template, data);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Template rendering failed: ${reason}. Send blocked so the recipient does not receive raw {{...}} template syntax.`
    );
  }
}

async function enqueueNextChunk(
  job: BatchJob,
  options?: { delaySeconds?: number }
): Promise<void> {
  if (!QUEUE_URL) {
    throw new Error("BATCH_QUEUE_URL not configured");
  }

  const sqsClient = new SQSClient(awsDefaults);
  await sqsClient.send(
    new SendMessageCommand({
      QueueUrl: QUEUE_URL,
      MessageBody: JSON.stringify(job),
      // SQS delay for rate limiting (max 900 seconds)
      DelaySeconds: options?.delaySeconds
        ? Math.min(options.delaySeconds, 900)
        : undefined,
    })
  );
}
