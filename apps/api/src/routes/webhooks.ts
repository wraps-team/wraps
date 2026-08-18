/**
 * Webhook Routes
 *
 * POST /webhooks/ses/:awsAccountId - Receive SES events from EventBridge API Destination
 */

import { timingSafeEqual } from "node:crypto";
import {
  awsAccount,
  batchSend,
  contact,
  db,
  eq,
  hasRecentNotification,
  messageSend,
  messageUsageMonthly,
  notifyOrg,
  organization,
  workflow,
  workflowExecution,
} from "@wraps/db";
import { and, inArray, isNull, lt, ne, notInArray, or, sql } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { trackFirstEmailDelivered } from "../lib/activation-tracking";
import { log } from "../lib/logger";
import {
  deleteScheduledStep,
  enqueueWorkflowStep,
} from "../services/workflow-queue";

// SES event types we care about
type SesEventType =
  | "Send"
  | "Delivery"
  | "Open"
  | "Click"
  | "Bounce"
  | "Complaint"
  | "Reject"
  | "Rendering Failure"
  | "DeliveryDelay"
  | "Suppressed";

// EventBridge envelope structure for SES events
type EventBridgeEvent = {
  version: string;
  id: string;
  "detail-type": string;
  source: string;
  account: string;
  time: string;
  region: string;
  detail: {
    eventType: SesEventType;
    mail?: {
      messageId: string;
      timestamp: string;
      source: string;
      destination: string[];
      commonHeaders?: {
        subject?: string;
      };
      tags?: Record<string, string[]>;
    };
    // Event-specific data
    delivery?: {
      timestamp: string;
      recipients: string[];
    };
    // SES also sends `ipAddress` on open/click. We deliberately don't read or
    // store it — it's recipient personal data we have no feature for.
    open?: {
      timestamp: string;
      userAgent?: string;
    };
    click?: {
      timestamp: string;
      link: string;
      userAgent?: string;
    };
    bounce?: {
      bounceType: string;
      bounceSubType: string;
      timestamp: string;
      bouncedRecipients: Array<{ emailAddress: string }>;
    };
    complaint?: {
      timestamp: string;
      complainedRecipients: Array<{ emailAddress: string }>;
      complaintFeedbackType?: string;
    };
    // Suppression event data (from transformed Lambda events)
    suppression?: {
      reason: string; // "Suppressed" or "OnAccountSuppressionList"
      timestamp: string;
      suppressedRecipients: Array<{ emailAddress: string }>;
    };
    // Rendering failure data (SES template variable missing, etc.)
    failure?: {
      errorMessage: string;
      templateName: string;
    };
  };
};

/**
 * Derive the persisted status + event timestamps for an SDK send (direct SES)
 * from whichever lifecycle event arrives first. SES does NOT guarantee event
 * ordering, so the row may be materialized by a Delivery/Bounce that precedes
 * its Send event. Returns null for events that shouldn't create a standalone
 * log row on their own (Open, Click, Reject, DeliveryDelay, Rendering Failure).
 */
function sdkLogLifecycleFields(
  eventType: SesEventType,
  detail: EventBridgeEvent["detail"]
): {
  status: "sent" | "delivered" | "bounced" | "complained" | "suppressed";
  deliveredAt?: Date;
  bouncedAt?: Date;
  bounceType?: string;
  bounceSubType?: string;
  complainedAt?: Date;
  suppressedAt?: Date;
} | null {
  switch (eventType) {
    case "Send":
      return { status: "sent" };
    case "Delivery":
      return {
        status: "delivered",
        deliveredAt: detail.delivery?.timestamp
          ? new Date(detail.delivery.timestamp)
          : undefined,
      };
    case "Bounce":
      return {
        status: "bounced",
        bouncedAt: detail.bounce?.timestamp
          ? new Date(detail.bounce.timestamp)
          : undefined,
        bounceType: detail.bounce?.bounceType,
        bounceSubType: detail.bounce?.bounceSubType,
      };
    case "Complaint":
      return {
        status: "complained",
        complainedAt: detail.complaint?.timestamp
          ? new Date(detail.complaint.timestamp)
          : undefined,
      };
    case "Suppressed":
      return {
        status: "suppressed",
        suppressedAt: detail.suppression?.timestamp
          ? new Date(detail.suppression.timestamp)
          : undefined,
      };
    default:
      return null;
  }
}

/**
 * Increment delivery count for an org in message_usage_monthly.
 * Counts ALL deliveries (SDK + batch + workflow) for billing and analytics.
 */
async function incrementDeliveryCount(organizationId: string) {
  const now = new Date();
  const periodKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  await db
    .insert(messageUsageMonthly)
    .values({
      organizationId,
      periodKey,
      messageCount: 1,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        messageUsageMonthly.organizationId,
        messageUsageMonthly.periodKey,
      ],
      set: {
        messageCount: sql`${messageUsageMonthly.messageCount} + 1`,
        updatedAt: now,
      },
    });
}

const hasZeroRowCount = (value: unknown): boolean => {
  if (typeof value !== "object" || value === null || !("rowCount" in value)) {
    return false;
  }

  const rowCount = (value as { rowCount?: unknown }).rowCount;
  return rowCount === 0;
};

export const webhooksRoutes = new Elysia({ prefix: "/webhooks" }).post(
  "/ses/:awsAccountNumber",
  async ({ params, body, headers, set }) => {
    const { awsAccountNumber } = params;
    const apiKey = headers["x-wraps-api-key"];

    // 1. Lookup ALL AWS accounts registered under this AWS account number.
    // account_id is NOT unique (two orgs may connect the same AWS account, and a
    // malicious org can register a victim's account number), so we must resolve the
    // correct row by matching the inbound secret rather than picking an arbitrary
    // row. webhook_secret is 32 random bytes — collisions are impossible.
    const candidates = await db
      .select({
        id: awsAccount.id,
        webhookSecret: awsAccount.webhookSecret,
        organizationId: awsAccount.organizationId,
      })
      .from(awsAccount)
      .where(eq(awsAccount.accountId, awsAccountNumber));

    const keyBuffer = Buffer.from(apiKey || "");
    const account = candidates.find((candidate) => {
      if (!candidate.webhookSecret) {
        return false;
      }
      const secretBuffer = Buffer.from(candidate.webhookSecret);
      return (
        secretBuffer.length === keyBuffer.length &&
        timingSafeEqual(secretBuffer, keyBuffer)
      );
    });

    // 2. Uniform 401 whether the account number is unknown or the key doesn't match
    // any registered secret (prevents account enumeration).
    if (!account) {
      log.warn("Webhook: authentication failed", { awsAccountNumber });
      set.status = 401;
      return { error: "Unauthorized" };
    }

    // Record feed liveness (throttled to ~1 write/min per account). Best-effort:
    // a failure here must never fail event processing.
    try {
      await db
        .update(awsAccount)
        .set({ lastEventReceivedAt: new Date() })
        .where(
          and(
            eq(awsAccount.id, account.id),
            or(
              isNull(awsAccount.lastEventReceivedAt),
              lt(awsAccount.lastEventReceivedAt, new Date(Date.now() - 60_000))
            )
          )
        );
    } catch (error) {
      log.error("Webhook: failed to record lastEventReceivedAt", error, {
        awsAccountNumber,
      });
    }

    // 3. Parse the EventBridge event
    const event = body as EventBridgeEvent;
    const { eventType, mail } = event.detail;

    if (!mail?.messageId) {
      log.warn("Webhook: event missing mail.messageId", {
        eventType,
        awsAccountNumber,
      });
      return { status: "ignored", reason: "missing mail.messageId" };
    }

    const messageId = mail.messageId;

    log.info("Webhook: processing event", { eventType, messageId });

    // 4. Find the messageSend record, scoped to the authenticated AWS account's org
    const [message] = await db
      .select({
        id: messageSend.id,
        status: messageSend.status,
        batchSendId: messageSend.batchSendId,
        contactId: messageSend.contactId,
        openedAt: messageSend.openedAt,
        clickedAt: messageSend.clickedAt,
      })
      .from(messageSend)
      .where(
        and(
          eq(messageSend.messageId, messageId),
          eq(messageSend.organizationId, account.organizationId)
        )
      )
      .limit(1);

    if (!message) {
      // Message not found — likely sent via SDK (direct SES), not through our
      // batch pipeline. Materialize a minimal row so the send appears in email
      // logs. Because SES doesn't guarantee event order, we create the row from
      // whichever lifecycle event arrives first (e.g. Delivery before Send) and
      // let onConflictDoNothing keep it. Once the row exists, subsequent events
      // find it above and flow through normal status processing.
      const recipient = mail.destination?.[0];
      const lifecycle = sdkLogLifecycleFields(eventType, event.detail);
      let insertedRow = false;
      if (recipient && lifecycle) {
        const inserted = await db
          .insert(messageSend)
          .values({
            organizationId: account.organizationId,
            awsAccountId: account.id,
            channel: "email",
            sourceType: "transactional",
            recipient,
            // SES includes original headers when the configuration set event
            // destination is configured with includeOriginalHeaders — without
            // this, invite/transactional sends show no subject in email logs.
            subject: mail.commonHeaders?.subject ?? null,
            from: mail.source ?? null,
            messageId,
            sentAt: mail.timestamp ? new Date(mail.timestamp) : new Date(),
            ...lifecycle,
          })
          .onConflictDoNothing()
          .returning({ id: messageSend.id });
        insertedRow = inserted.length > 0;
      }
      // Count delivery and track activation in parallel. Billing must only
      // fire when this call actually created the row — a duplicate SDK
      // Delivery event hits onConflictDoNothing (0 rows), so it must not
      // double-count messageUsageMonthly. trackFirstEmailDelivered is itself
      // an idempotent per-org claim, so it can stay unconditional.
      if (eventType === "Delivery") {
        const sdkSideEffects: Promise<unknown>[] = [
          trackFirstEmailDelivered(account.organizationId, "sdk"),
        ];
        if (insertedRow) {
          sdkSideEffects.push(incrementDeliveryCount(account.organizationId));
        }
        for (const r of await Promise.allSettled(sdkSideEffects)) {
          if (r.status === "rejected") {
            log.error("Webhook: SDK delivery side effect failed", r.reason, {
              messageId,
            });
          }
        }
      }
      log.info("Webhook: message not found", { messageId });
      return { status: "ignored", reason: "message not found" };
    }

    // 5. Process based on event type
    try {
      switch (eventType) {
        case "Delivery": {
          // Critical: update message status (throws on failure → 500 → EventBridge retries)
          const didTransition = await processDelivery(
            message,
            event.detail.delivery?.timestamp
          );
          // Best-effort side effects — don't fail the webhook. Billing must
          // only count a genuine transition (duplicate deliveries must not
          // double-count messageUsageMonthly). trackFirstEmailDelivered is
          // itself an idempotent per-org claim, so it can stay unconditional.
          const sideEffects: Promise<unknown>[] = [
            trackFirstEmailDelivered(account.organizationId, "platform"),
          ];
          if (didTransition) {
            sideEffects.push(incrementDeliveryCount(account.organizationId));
          }
          for (const r of await Promise.allSettled(sideEffects)) {
            if (r.status === "rejected") {
              log.error("Webhook: delivery side effect failed", r.reason, {
                messageId,
              });
            }
          }
          break;
        }

        case "Open":
          await processOpen(
            message,
            messageId,
            account.organizationId,
            event.detail.open?.timestamp,
            event.detail.open?.userAgent
          );
          break;

        case "Click":
          await processClick(
            message,
            messageId,
            account.organizationId,
            event.detail.click?.timestamp,
            event.detail.click?.link,
            event.detail.click?.userAgent
          );
          break;

        case "Bounce":
          await processBounce(
            message,
            messageId,
            account.organizationId,
            event.detail.bounce?.bounceType,
            event.detail.bounce?.bounceSubType,
            event.detail.bounce?.timestamp
          );
          break;

        case "Complaint":
          await processComplaint(
            message,
            messageId,
            account.organizationId,
            event.detail.complaint?.timestamp
          );
          break;

        case "Suppressed":
          await processSuppression(
            message,
            event.detail.suppression?.reason,
            event.detail.suppression?.timestamp
          );
          if (message.contactId) {
            await resumeWaitingExecutions(
              messageId,
              message.contactId,
              "bounced",
              account.organizationId
            );
          }
          break;

        case "Reject":
          await processReject(message, messageId, account.organizationId);
          await notifySendFailures(account.organizationId, "reject");
          break;

        case "Rendering Failure":
          await processRenderingFailure(
            message,
            event.detail.failure?.errorMessage,
            event.detail.failure?.templateName,
            mail.tags
          );
          await notifySendFailures(
            account.organizationId,
            "rendering_failure",
            event.detail.failure?.templateName
          );
          break;

        default:
          return {
            status: "ignored",
            reason: `unsupported event type: ${eventType}`,
          };
      }

      return { status: "processed", eventType, messageId };
    } catch (error) {
      log.error("Webhook event processing failed", error, {
        eventType,
        messageId,
      });
      set.status = 500;
      return {
        error: "Failed to process event",
      };
    }
  },
  {
    params: t.Object({
      awsAccountNumber: t.String({
        description: "12-digit AWS account ID",
        minLength: 12,
        maxLength: 12,
        pattern: "^[0-9]{12}$",
      }),
    }),
    response: {
      200: t.Object({
        status: t.String({ description: "Processing status" }),
        eventType: t.Optional(t.String()),
        messageId: t.Optional(t.String()),
        reason: t.Optional(t.String()),
      }),
      401: t.Object({
        error: t.String(),
      }),
      500: t.Object({
        error: t.String(),
        details: t.Optional(t.String()),
      }),
    },
    detail: {
      tags: ["webhooks"],
      summary: "Receive SES events",
      description:
        "Webhook endpoint for receiving SES events from EventBridge API Destination. The awsAccountNumber is the 12-digit AWS account ID.",
    },
  }
);

// Helper types
type MessageRecord = {
  id: string;
  status: string;
  batchSendId: string | null;
  contactId: string | null;
  openedAt: Date | null;
  clickedAt: Date | null;
};

async function processDelivery(
  message: MessageRecord,
  timestamp?: string
): Promise<boolean> {
  // Status precedence: bounced/complained cannot be overwritten by a delivery event
  // (e.g., delayed delivery notification arriving after a bounce)
  if (message.status === "bounced" || message.status === "complained") {
    log.info("Webhook: delivery skipped — status precedence", {
      messageId: message.id,
      currentStatus: message.status,
    });
    return false;
  }

  const deliveredAt = timestamp ? new Date(timestamp) : new Date();

  // Common case first (single query on the hottest webhook path): the row
  // transitions INTO 'delivered' only from a genuinely pre-delivery state.
  // 'opened'/'clicked' imply delivery already happened (a late/duplicate
  // Delivery must not regress the status or re-count), and
  // 'bounced'/'complained'/'suppressed' are terminal-ish (a late Delivery
  // must not overwrite them). When the row IS 'failed', it was wrongly
  // recorded (e.g. a bookkeeping error misfiled as a send failure) — heal it
  // with an atomic status='failed' flip below, so exactly one of N
  // concurrent duplicate events wins and the counter decrement can never
  // double-apply.
  const updated = await db
    .update(messageSend)
    .set({ status: "delivered", deliveredAt })
    .where(
      and(
        eq(messageSend.id, message.id),
        inArray(messageSend.status, ["pending", "queued", "sent"])
      )
    )
    .returning({ id: messageSend.id });

  let wasWronglyFailed = false;
  if (updated.length === 0) {
    const healed = await db
      .update(messageSend)
      .set({ status: "delivered", deliveredAt, error: null })
      .where(
        and(eq(messageSend.id, message.id), eq(messageSend.status, "failed"))
      )
      .returning({ id: messageSend.id });
    wasWronglyFailed = healed.length > 0;
  }

  // Only bump the counter when THIS call transitioned the row — otherwise a
  // duplicate Delivery for an already-delivered row would double-count.
  const didTransition = updated.length > 0 || wasWronglyFailed;

  if (!didTransition) {
    log.info("Webhook: duplicate delivery, skipping counter", {
      messageId: message.id,
    });
    return false;
  }

  // Increment batchSend counter if applicable
  if (message.batchSendId) {
    await db
      .update(batchSend)
      .set({
        delivered: sql`${batchSend.delivered} + 1`,
        ...(wasWronglyFailed
          ? { failed: sql`greatest(${batchSend.failed} - 1, 0)` }
          : {}),
      })
      .where(eq(batchSend.id, message.batchSendId));
  }

  log.info("Webhook: message delivered", {
    messageId: message.id,
    healedFromFailed: wasWronglyFailed,
  });

  return true;
}

async function processOpen(
  message: MessageRecord,
  messageId: string,
  organizationId: string,
  timestamp?: string,
  userAgent?: string
): Promise<void> {
  const openedAt = timestamp ? new Date(timestamp) : new Date();

  // Only record first open (idempotency) — fast path from stale read
  if (message.openedAt) {
    log.info("Webhook: duplicate open, skipping", { messageId: message.id });
    return;
  }

  // Atomic update: WHERE openedAt IS NULL prevents TOCTOU race
  const result = await db
    .update(messageSend)
    .set({
      status: "opened",
      openedAt,
      openUserAgent: userAgent ?? null,
    })
    .where(and(eq(messageSend.id, message.id), isNull(messageSend.openedAt)));

  // If 0 rows affected, another request already recorded the open
  if (hasZeroRowCount(result)) {
    log.info("Webhook: duplicate open (race), skipping", {
      messageId: message.id,
    });
    return;
  }

  // Increment batchSend counter if applicable
  if (message.batchSendId) {
    await db
      .update(batchSend)
      .set({
        opened: sql`${batchSend.opened} + 1`,
      })
      .where(eq(batchSend.id, message.batchSendId));
  }

  // Update contact engagement
  if (message.contactId) {
    await db
      .update(contact)
      .set({
        lastEmailOpenedAt: openedAt,
        emailsOpened: sql`${contact.emailsOpened} + 1`,
      })
      .where(eq(contact.id, message.contactId));

    // Resume waiting workflow executions
    await resumeWaitingExecutions(
      messageId,
      message.contactId,
      "opened",
      organizationId
    );
  }

  log.info("Webhook: message opened", { messageId: message.id });
}

async function processClick(
  message: MessageRecord,
  messageId: string,
  organizationId: string,
  timestamp?: string,
  link?: string,
  userAgent?: string
): Promise<void> {
  const clickedAt = timestamp ? new Date(timestamp) : new Date();

  // Only record first click (idempotency) — fast path from stale read
  if (message.clickedAt) {
    log.info("Webhook: duplicate click, skipping", { messageId: message.id });
    return;
  }

  // Atomic update: WHERE clickedAt IS NULL prevents TOCTOU race
  const result = await db
    .update(messageSend)
    .set({
      status: "clicked",
      clickedAt,
      clickedUrl: link ?? null,
      clickUserAgent: userAgent ?? null,
    })
    .where(and(eq(messageSend.id, message.id), isNull(messageSend.clickedAt)));

  // If 0 rows affected, another request already recorded the click
  if (hasZeroRowCount(result)) {
    log.info("Webhook: duplicate click (race), skipping", {
      messageId: message.id,
    });
    return;
  }

  // Increment batchSend counter if applicable
  if (message.batchSendId) {
    await db
      .update(batchSend)
      .set({
        clicked: sql`${batchSend.clicked} + 1`,
      })
      .where(eq(batchSend.id, message.batchSendId));
  }

  // Update contact engagement
  if (message.contactId) {
    await db
      .update(contact)
      .set({
        lastEmailClickedAt: clickedAt,
        emailsClicked: sql`${contact.emailsClicked} + 1`,
      })
      .where(eq(contact.id, message.contactId));

    // Resume waiting workflow executions
    await resumeWaitingExecutions(
      messageId,
      message.contactId,
      "clicked",
      organizationId
    );
  }

  log.info("Webhook: message clicked", { messageId: message.id });
}

async function processBounce(
  message: MessageRecord,
  messageId: string,
  organizationId: string,
  bounceType?: string,
  bounceSubType?: string,
  timestamp?: string
): Promise<void> {
  if (bounceSubType === "Suppressed") {
    await processSuppression(message, "Suppressed", timestamp);
    if (message.contactId) {
      await resumeWaitingExecutions(
        messageId,
        message.contactId,
        "bounced",
        organizationId
      );
    }
    return;
  }

  const bouncedAt = timestamp ? new Date(timestamp) : new Date();

  // Update messageSend status — guarded on a genuine transition (WHERE status
  // <> 'bounced') so a duplicate Bounce event does not re-count.
  const transitioned = await db
    .update(messageSend)
    .set({
      status: "bounced",
      bouncedAt,
      bounceType: bounceType ?? null,
      bounceSubType: bounceSubType ?? null,
    })
    .where(
      and(eq(messageSend.id, message.id), ne(messageSend.status, "bounced"))
    )
    .returning({ id: messageSend.id });

  if (transitioned.length === 0) {
    log.info("Webhook: duplicate bounce, skipping counter", {
      messageId: message.id,
    });
    return;
  }

  // Increment batchSend counter if applicable
  if (message.batchSendId) {
    await db
      .update(batchSend)
      .set({
        bounced: sql`${batchSend.bounced} + 1`,
      })
      .where(eq(batchSend.id, message.batchSendId));
  }

  // Update contact status for permanent bounces
  if (message.contactId && bounceType === "Permanent") {
    await db
      .update(contact)
      .set({
        emailStatus: "bounced",
        emailBouncedAt: bouncedAt,
      })
      .where(eq(contact.id, message.contactId));
  }

  // Resume waiting workflow executions (any bounce type)
  if (message.contactId) {
    await resumeWaitingExecutions(
      messageId,
      message.contactId,
      "bounced",
      organizationId
    );
  }

  log.info("Webhook: message bounced", {
    messageId: message.id,
    bounceType,
    bounceSubType,
  });
}

async function processComplaint(
  message: MessageRecord,
  messageId: string,
  organizationId: string,
  timestamp?: string
): Promise<void> {
  const complainedAt = timestamp ? new Date(timestamp) : new Date();

  // Update messageSend status — guarded on a genuine transition (WHERE status
  // <> 'complained') so a duplicate Complaint event does not re-count.
  const transitioned = await db
    .update(messageSend)
    .set({
      status: "complained",
      complainedAt,
    })
    .where(
      and(eq(messageSend.id, message.id), ne(messageSend.status, "complained"))
    )
    .returning({ id: messageSend.id });

  if (transitioned.length === 0) {
    log.info("Webhook: duplicate complaint, skipping counter", {
      messageId: message.id,
    });
    return;
  }

  // Increment batchSend counter if applicable
  if (message.batchSendId) {
    await db
      .update(batchSend)
      .set({
        complained: sql`${batchSend.complained} + 1`,
      })
      .where(eq(batchSend.id, message.batchSendId));
  }

  // Update contact status
  if (message.contactId) {
    await db
      .update(contact)
      .set({
        emailStatus: "complained",
        emailComplainedAt: complainedAt,
      })
      .where(eq(contact.id, message.contactId));
  }

  // Resume waiting workflow executions — complaint is treated like a bounce
  if (message.contactId) {
    await resumeWaitingExecutions(
      messageId,
      message.contactId,
      "bounced",
      organizationId
    );
  }

  log.info("Webhook: message complained", { messageId: message.id });
}

/**
 * Alert the org (once per 24h) that SES is refusing or failing to render
 * their sends. Individual Reject / Rendering Failure events are stored per
 * message; this is the "your sends are silently dying" wake-up call.
 */
async function notifySendFailures(
  organizationId: string,
  reason: "reject" | "rendering_failure",
  detail?: string
): Promise<void> {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const already = await hasRecentNotification({
      organizationId,
      type: "ses.send_failures",
      since,
    });
    if (already) {
      return;
    }

    const [org] = await db
      .select({ slug: organization.slug })
      .from(organization)
      .where(eq(organization.id, organizationId))
      .limit(1);
    if (!org?.slug) {
      return;
    }

    const reasonText =
      reason === "reject"
        ? "SES rejected a message before attempting delivery (bad content or account-level reputation)."
        : `SES failed to render a template${detail ? `: ${detail}` : "."}`;

    await notifyOrg({
      organizationId,
      roles: ["owner", "admin"],
      type: "ses.send_failures",
      title: "Email sends are failing",
      body: `${reasonText} Affected messages are marked failed — check your recent sends.`,
      href: `/${org.slug}/emails`,
      data: { reason },
    });
  } catch (error) {
    log.error("Webhook: failed to write send-failure notification", error, {
      organizationId,
    });
  }
}

async function processReject(
  message: MessageRecord,
  messageId: string,
  organizationId: string
): Promise<void> {
  // Status precedence: bounced/complained cannot be overwritten by a reject event
  if (message.status === "bounced" || message.status === "complained") {
    log.info("Webhook: reject skipped — status precedence", {
      messageId: message.id,
      currentStatus: message.status,
    });
    return;
  }

  // SES rejected the message before attempting delivery (e.g., bad content, account reputation).
  // The status enum has no `rejected`, so the reason has to be carried in `error` -
  // otherwise the dashboard shows a bare "Failed" with nothing to act on.
  await db
    .update(messageSend)
    .set({
      status: "failed",
      error: "Rejected by SES",
    })
    .where(
      and(
        eq(messageSend.id, message.id),
        notInArray(messageSend.status, ["bounced", "complained"])
      )
    );

  // Resume any workflow executions waiting for engagement on this message
  if (message.contactId) {
    await resumeWaitingExecutions(
      messageId,
      message.contactId,
      "bounced",
      organizationId
    );
  }

  log.info("Webhook: message rejected by SES", { messageId: message.id });
}

async function processSuppression(
  message: MessageRecord,
  suppressionReason?: string,
  timestamp?: string
): Promise<void> {
  const suppressedAt = timestamp ? new Date(timestamp) : new Date();

  // Update messageSend status — guarded on a genuine transition (WHERE status
  // <> 'suppressed') so a duplicate Suppressed event does not re-count.
  const transitioned = await db
    .update(messageSend)
    .set({
      status: "suppressed",
      suppressedAt,
    })
    .where(
      and(eq(messageSend.id, message.id), ne(messageSend.status, "suppressed"))
    )
    .returning({ id: messageSend.id });

  if (transitioned.length === 0) {
    log.info("Webhook: duplicate suppression, skipping counter", {
      messageId: message.id,
    });
    return;
  }

  // Increment batchSend counter if applicable
  if (message.batchSendId) {
    await db
      .update(batchSend)
      .set({
        suppressed: sql`${batchSend.suppressed} + 1`,
      })
      .where(eq(batchSend.id, message.batchSendId));
  }

  // Update contact status - all suppressions mark contact as suppressed
  if (message.contactId) {
    await db
      .update(contact)
      .set({
        emailStatus: "suppressed",
        emailSuppressedAt: suppressedAt,
      })
      .where(eq(contact.id, message.contactId));
  }

  log.info("Webhook: message suppressed", {
    messageId: message.id,
    reason: suppressionReason,
  });
}

async function processRenderingFailure(
  message: MessageRecord,
  errorMessage?: string,
  templateName?: string,
  tags?: Record<string, string[]>
): Promise<void> {
  const errorText = errorMessage
    ? `Rendering failure: ${errorMessage}`
    : "Template rendering failure";

  // Update messageSend status to failed with the rendering error
  await db
    .update(messageSend)
    .set({
      status: "failed",
      error: errorText,
    })
    .where(eq(messageSend.id, message.id));

  // Increment batchSend failure counter if applicable
  if (message.batchSendId) {
    await db
      .update(batchSend)
      .set({
        failed: sql`${batchSend.failed} + 1`,
      })
      .where(eq(batchSend.id, message.batchSendId));
  }

  // Fail the workflow execution if this was a workflow-sent email
  const executionId = tags?.executionId?.[0];
  if (executionId) {
    await db.transaction(async (tx) => {
      const [execution] = await tx
        .update(workflowExecution)
        .set({
          status: "failed",
          error: errorText,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(workflowExecution.id, executionId),
            inArray(workflowExecution.status, ["active", "paused", "waiting"])
          )
        )
        .returning();

      if (execution) {
        await tx
          .update(workflow)
          .set({
            activeExecutions: sql`GREATEST(0, ${workflow.activeExecutions} - 1)`,
            failedExecutions: sql`${workflow.failedExecutions} + 1`,
          })
          .where(eq(workflow.id, execution.workflowId));
      }
    });
  }

  log.error("Webhook: template rendering failure", {
    messageId: message.id,
    errorMessage,
    templateName,
    executionId,
  });
}

/**
 * Resume workflow executions waiting for email engagement.
 * organizationId is required to prevent cross-org IDOR (Issue #17).
 */
async function resumeWaitingExecutions(
  messageId: string,
  contactId: string,
  branch: "opened" | "clicked" | "bounced",
  organizationId: string
): Promise<void> {
  // Find executions waiting for this email engagement
  const waitingEvent = `email_engagement:${messageId}`;

  const waitingExecutions = await db
    .select()
    .from(workflowExecution)
    .where(
      and(
        eq(workflowExecution.organizationId, organizationId),
        eq(workflowExecution.contactId, contactId),
        eq(workflowExecution.status, "waiting"),
        eq(workflowExecution.waitingForEvent, waitingEvent)
      )
    );

  // Defense-in-depth: filter by organizationId in application code as well as SQL.
  // This prevents cross-org execution resumption even if the SQL WHERE clause is
  // bypassed or future callers omit the org param.
  const safeExecutions = waitingExecutions.filter(
    (e) => e.organizationId === organizationId
  );

  for (const execution of safeExecutions) {
    log.info("Webhook: resuming workflow execution", {
      executionId: execution.id,
      branch,
    });

    // Cancel timeout scheduler
    if (execution.waitTimeoutSchedulerName) {
      await deleteScheduledStep(execution.waitTimeoutSchedulerName);
    }

    // Resume with appropriate branch
    await enqueueWorkflowStep({
      type: "resume",
      executionId: execution.id,
      branch,
      organizationId: execution.organizationId,
    });
  }
}
