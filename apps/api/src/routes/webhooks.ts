/**
 * Webhook Routes
 *
 * POST /webhooks/ses/:awsAccountId - Receive SES events from EventBridge API Destination
 */

import { awsAccount, batchSend, contact, db, eq, messageSend } from "@wraps/db";
import { sql } from "drizzle-orm";
import { Elysia, t } from "elysia";

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
  | "DeliveryDelay";

// EventBridge envelope structure for SES events
interface EventBridgeEvent {
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
  };
}

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
      console.log(`[WEBHOOK] AWS account not found: ${awsAccountNumber}`);
      set.status = 404;
      return { error: "AWS account not found" };
    }

    // 2. Validate API key
    if (!account.webhookSecret || account.webhookSecret !== apiKey) {
      console.log(`[WEBHOOK] Invalid API key for account: ${awsAccountNumber}`);
      set.status = 401;
      return { error: "Invalid API key" };
    }

    // 3. Parse the EventBridge event
    const event = body as EventBridgeEvent;
    const { eventType, mail } = event.detail;
    const messageId = mail.messageId;

    console.log(
      `[WEBHOOK] Processing ${eventType} event for message: ${messageId}`
    );

    // 4. Find the messageSend record
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
      .where(eq(messageSend.messageId, messageId))
      .limit(1);

    if (!message) {
      // Message not found - might be from a different source (transactional SDK)
      console.log(`[WEBHOOK] Message not found: ${messageId}`);
      return { status: "ignored", reason: "message not found" };
    }

    // 5. Process based on event type
    try {
      switch (eventType) {
        case "Delivery":
          await processDelivery(message, event.detail.delivery?.timestamp);
          break;

        case "Open":
          await processOpen(message, event.detail.open?.timestamp);
          break;

        case "Click":
          await processClick(message, event.detail.click?.timestamp);
          break;

        case "Bounce":
          await processBounce(
            message,
            event.detail.bounce?.bounceType,
            event.detail.bounce?.bounceSubType,
            event.detail.bounce?.timestamp
          );
          break;

        case "Complaint":
          await processComplaint(message, event.detail.complaint?.timestamp);
          break;

        default:
          console.log(`[WEBHOOK] Ignoring event type: ${eventType}`);
          return {
            status: "ignored",
            reason: `unsupported event type: ${eventType}`,
          };
      }

      return { status: "processed", eventType, messageId };
    } catch (error) {
      console.error("[WEBHOOK] Error processing event:", error);
      set.status = 500;
      return {
        error: "Failed to process event",
        details: error instanceof Error ? error.message : String(error),
      };
    }
  },
  {
    params: t.Object({
      awsAccountNumber: t.String(),
    }),
    detail: {
      tags: ["webhooks"],
      summary: "Receive SES events",
      description:
        "Webhook endpoint for receiving SES events from EventBridge API Destination. The awsAccountNumber is the 12-digit AWS account ID.",
    },
  }
);

// Helper types
interface MessageRecord {
  id: string;
  status: string;
  batchSendId: string | null;
  contactId: string | null;
  openedAt: Date | null;
  clickedAt: Date | null;
}

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

  console.log(`[WEBHOOK] Marked message ${message.id} as delivered`);
}

async function processOpen(
  message: MessageRecord,
  timestamp?: string
): Promise<void> {
  const openedAt = timestamp ? new Date(timestamp) : new Date();

  // Only record first open (idempotency)
  if (message.openedAt) {
    console.log(`[WEBHOOK] Message ${message.id} already opened, skipping`);
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
  }

  console.log(`[WEBHOOK] Marked message ${message.id} as opened`);
}

async function processClick(
  message: MessageRecord,
  timestamp?: string
): Promise<void> {
  const clickedAt = timestamp ? new Date(timestamp) : new Date();

  // Only record first click (idempotency)
  if (message.clickedAt) {
    console.log(`[WEBHOOK] Message ${message.id} already clicked, skipping`);
    return;
  }

  // Update messageSend status
  await db
    .update(messageSend)
    .set({
      status: "clicked",
      clickedAt,
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
  }

  console.log(`[WEBHOOK] Marked message ${message.id} as clicked`);
}

async function processBounce(
  message: MessageRecord,
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

  console.log(
    `[WEBHOOK] Marked message ${message.id} as bounced (${bounceType}/${bounceSubType})`
  );
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

  console.log(`[WEBHOOK] Marked message ${message.id} as complained`);
}
