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
  messageSend,
  workflow,
  workflowExecution,
} from "@wraps/db";
import { and, inArray, sql } from "drizzle-orm";
import { Elysia, t } from "elysia";
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
    mail: {
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
    open?: {
      timestamp: string;
      userAgent?: string;
      ipAddress?: string;
    };
    click?: {
      timestamp: string;
      link: string;
      userAgent?: string;
      ipAddress?: string;
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

export const webhooksRoutes = new Elysia({ prefix: "/webhooks" }).post(
  "/ses/:awsAccountNumber",
  async ({ params, body, headers, set }) => {
    const { awsAccountNumber } = params;
    const apiKey = headers["x-wraps-api-key"];

    // 1. Lookup AWS account by AWS account number (e.g., "123456789012")
    const [account] = await db
      .select({
        id: awsAccount.id,
        webhookSecret: awsAccount.webhookSecret,
        organizationId: awsAccount.organizationId,
      })
      .from(awsAccount)
      .where(eq(awsAccount.accountId, awsAccountNumber))
      .limit(1);

    if (!account) {
      log.warn("Webhook: AWS account not found", { awsAccountNumber });
      set.status = 404;
      return { error: "AWS account not found" };
    }

    // 2. Validate API key (constant-time comparison to prevent timing attacks)
    const secretBuffer = Buffer.from(account.webhookSecret || "");
    const keyBuffer = Buffer.from(apiKey || "");
    if (
      !account.webhookSecret ||
      secretBuffer.length !== keyBuffer.length ||
      !timingSafeEqual(secretBuffer, keyBuffer)
    ) {
      log.warn("Webhook: invalid API key", { awsAccountNumber });
      set.status = 401;
      return { error: "Invalid API key" };
    }

    // 3. Parse the EventBridge event
    const event = body as EventBridgeEvent;
    const { eventType, mail } = event.detail;
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
      // Message not found - might be from a different source (transactional SDK)
      log.info("Webhook: message not found", { messageId });
      return { status: "ignored", reason: "message not found" };
    }

    // 5. Process based on event type
    try {
      switch (eventType) {
        case "Delivery":
          await processDelivery(message, event.detail.delivery?.timestamp);
          break;

        case "Open":
          await processOpen(message, messageId, event.detail.open?.timestamp);
          break;

        case "Click":
          await processClick(
            message,
            messageId,
            event.detail.click?.timestamp,
            event.detail.click?.link
          );
          break;

        case "Bounce":
          await processBounce(
            message,
            messageId,
            event.detail.bounce?.bounceType,
            event.detail.bounce?.bounceSubType,
            event.detail.bounce?.timestamp
          );
          break;

        case "Complaint":
          await processComplaint(message, event.detail.complaint?.timestamp);
          break;

        case "Suppressed":
          await processSuppression(
            message,
            event.detail.suppression?.reason,
            event.detail.suppression?.timestamp
          );
          break;

        case "Rendering Failure":
          await processRenderingFailure(
            message,
            event.detail.failure?.errorMessage,
            event.detail.failure?.templateName,
            mail.tags
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
        maxLength: 12,
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
      404: t.Object({
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
): Promise<void> {
  const deliveredAt = timestamp ? new Date(timestamp) : new Date();

  // Update messageSend status
  await db
    .update(messageSend)
    .set({
      status: "delivered",
      deliveredAt,
    })
    .where(eq(messageSend.id, message.id));

  // Increment batchSend counter if applicable
  if (message.batchSendId) {
    await db
      .update(batchSend)
      .set({
        delivered: sql`${batchSend.delivered} + 1`,
      })
      .where(eq(batchSend.id, message.batchSendId));
  }

  log.info("Webhook: message delivered", { messageId: message.id });
}

async function processOpen(
  message: MessageRecord,
  messageId: string,
  timestamp?: string
): Promise<void> {
  const openedAt = timestamp ? new Date(timestamp) : new Date();

  // Only record first open (idempotency)
  if (message.openedAt) {
    log.info("Webhook: duplicate open, skipping", { messageId: message.id });
    return;
  }

  // Update messageSend status
  await db
    .update(messageSend)
    .set({
      status: "opened",
      openedAt,
    })
    .where(eq(messageSend.id, message.id));

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
    await resumeWaitingExecutions(messageId, message.contactId, "opened");
  }

  log.info("Webhook: message opened", { messageId: message.id });
}

async function processClick(
  message: MessageRecord,
  messageId: string,
  timestamp?: string,
  link?: string
): Promise<void> {
  const clickedAt = timestamp ? new Date(timestamp) : new Date();

  // Only record first click (idempotency)
  if (message.clickedAt) {
    log.info("Webhook: duplicate click, skipping", { messageId: message.id });
    return;
  }

  // Update messageSend status
  await db
    .update(messageSend)
    .set({
      status: "clicked",
      clickedAt,
      clickedUrl: link ?? null,
    })
    .where(eq(messageSend.id, message.id));

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
    await resumeWaitingExecutions(messageId, message.contactId, "clicked");
  }

  log.info("Webhook: message clicked", { messageId: message.id });
}

async function processBounce(
  message: MessageRecord,
  messageId: string,
  bounceType?: string,
  bounceSubType?: string,
  timestamp?: string
): Promise<void> {
  const bouncedAt = timestamp ? new Date(timestamp) : new Date();

  // Update messageSend status
  await db
    .update(messageSend)
    .set({
      status: "bounced",
      bouncedAt,
      bounceType: bounceType ?? null,
      bounceSubType: bounceSubType ?? null,
    })
    .where(eq(messageSend.id, message.id));

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
    await resumeWaitingExecutions(messageId, message.contactId, "bounced");
  }

  log.info("Webhook: message bounced", {
    messageId: message.id,
    bounceType,
    bounceSubType,
  });
}

async function processComplaint(
  message: MessageRecord,
  timestamp?: string
): Promise<void> {
  const complainedAt = timestamp ? new Date(timestamp) : new Date();

  // Update messageSend status
  await db
    .update(messageSend)
    .set({
      status: "complained",
      complainedAt,
    })
    .where(eq(messageSend.id, message.id));

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

  log.info("Webhook: message complained", { messageId: message.id });
}

async function processSuppression(
  message: MessageRecord,
  suppressionReason?: string,
  timestamp?: string
): Promise<void> {
  const suppressedAt = timestamp ? new Date(timestamp) : new Date();

  // Update messageSend status
  await db
    .update(messageSend)
    .set({
      status: "suppressed",
      suppressedAt,
    })
    .where(eq(messageSend.id, message.id));

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
 * Resume workflow executions waiting for email engagement
 */
async function resumeWaitingExecutions(
  messageId: string,
  contactId: string,
  branch: "opened" | "clicked" | "bounced"
): Promise<void> {
  // Find executions waiting for this email engagement
  const waitingEvent = `email_engagement:${messageId}`;

  const waitingExecutions = await db
    .select()
    .from(workflowExecution)
    .where(
      and(
        eq(workflowExecution.contactId, contactId),
        eq(workflowExecution.status, "waiting"),
        eq(workflowExecution.waitingForEvent, waitingEvent)
      )
    );

  for (const execution of waitingExecutions) {
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
