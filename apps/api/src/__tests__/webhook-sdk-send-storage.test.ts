/**
 * Webhook SDK Send Storage Tests
 *
 * Verifies that lifecycle events for unknown messageIds (SDK transactional
 * sends) materialize a messageSend row regardless of arrival order, while
 * engagement-only events (Open, Click) are still ignored.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDbSelect = vi.fn();
const mockDbInsert = vi.fn();
const mockInsertValues = vi.fn();
const mockOnConflictDoNothing = vi.fn();

vi.mock("../lib/subscription-gate", () => ({
  hasActiveSubscription: vi.fn().mockResolvedValue(true),
}));

vi.mock("../services/workflow-queue", () => ({
  enqueueWorkflowStep: vi.fn(),
  deleteScheduledStep: vi.fn(),
}));

vi.mock("../lib/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../lib/activation-tracking", () => ({
  trackFirstEmailDelivered: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@wraps/db", async () => {
  const actual = await vi.importActual("@wraps/db");
  return {
    ...actual,
    db: {
      select: mockDbSelect,
      update: vi.fn().mockImplementation(() => ({
        set: () => ({ where: () => Promise.resolve({ rowCount: 1 }) }),
      })),
      insert: mockDbInsert,
    },
  };
});

const { webhooksRoutes } = await import("../routes/webhooks");
const { Elysia } = await import("elysia");

const AWS_ACCOUNT_NUMBER = "111122223333";
const WEBHOOK_SECRET = "sdk-send-secret";
const ORG_ID = "org-sdk-send-1";

function createApp() {
  return new Elysia().use(webhooksRoutes);
}

function mockAccountLookup() {
  // The account lookup awaits .where() directly (no .limit()); keep .limit
  // available for compatibility with limited queries.
  const rows = Promise.resolve([
    {
      id: "aws-acc-sdk-1",
      webhookSecret: WEBHOOK_SECRET,
      organizationId: ORG_ID,
    },
  ]);
  mockDbSelect.mockReturnValueOnce({
    from: () => ({
      where: () => Object.assign(rows, { limit: () => rows }),
    }),
  });
}

function mockMessageSendLookup(found: boolean) {
  mockDbSelect.mockReturnValueOnce({
    from: () => ({
      where: () => ({
        limit: () =>
          found
            ? Promise.resolve([
                {
                  id: "msg-found",
                  status: "sent",
                  batchSendId: null,
                  contactId: null,
                  openedAt: null,
                  clickedAt: null,
                },
              ])
            : Promise.resolve([]),
      }),
    }),
  });
}

function mockInsertChain() {
  // .onConflictDoNothing() now chains .returning() so the SDK-path transition
  // guard can tell whether this call created the row.
  mockOnConflictDoNothing.mockReturnValue({
    returning: vi.fn().mockResolvedValue([{ id: "sdk-msg-1" }]),
  });
  // The same values() mock backs both the messageSend insert
  // (onConflictDoNothing) and the usage-tracking insert (onConflictDoUpdate)
  // that the Delivery path fires.
  mockInsertValues.mockReturnValue({
    onConflictDoNothing: mockOnConflictDoNothing,
    onConflictDoUpdate: vi.fn().mockResolvedValue([{ messageCount: 1 }]),
  });
  mockDbInsert.mockReturnValue({ values: mockInsertValues });
}

function makeSendEvent(messageId = "ses-sdk-001") {
  return {
    version: "0",
    id: "event-send-1",
    "detail-type": "Email Sending Events",
    source: "aws.ses",
    account: AWS_ACCOUNT_NUMBER,
    time: new Date().toISOString(),
    region: "us-east-1",
    detail: {
      eventType: "Send",
      mail: {
        messageId,
        timestamp: new Date().toISOString(),
        source: "sender@example.com",
        destination: ["recipient@example.com"],
      },
    },
  };
}

function makeEventOfType(eventType: string, messageId = "ses-sdk-002") {
  return {
    ...makeSendEvent(messageId),
    detail: {
      eventType,
      mail: {
        messageId,
        timestamp: new Date().toISOString(),
        source: "sender@example.com",
        destination: ["recipient@example.com"],
      },
    },
  };
}

async function sendWebhook(event: Record<string, unknown>) {
  const app = createApp();
  return app.handle(
    new Request(`http://localhost/webhooks/ses/${AWS_ACCOUNT_NUMBER}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-wraps-api-key": WEBHOOK_SECRET,
      },
      body: JSON.stringify(event),
    })
  );
}

describe("webhook SDK send storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Send event for unknown messageId inserts exactly one messageSend row", async () => {
    mockAccountLookup();
    mockMessageSendLookup(false);
    mockInsertChain();

    const response = await sendWebhook(makeSendEvent("ses-sdk-new-001"));

    expect(response.status).toBe(200);
    expect(mockDbInsert).toHaveBeenCalledTimes(1);
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: "ses-sdk-new-001" })
    );
  });

  it("messageSend row has sourceType:'transactional', correct org, recipient, from, messageId", async () => {
    mockAccountLookup();
    mockMessageSendLookup(false);
    mockInsertChain();

    await sendWebhook(makeSendEvent("ses-sdk-new-002"));

    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG_ID,
        sourceType: "transactional",
        recipient: "recipient@example.com",
        from: "sender@example.com",
        messageId: "ses-sdk-new-002",
        channel: "email",
        status: "sent",
      })
    );
  });

  it("records the subject from mail.commonHeaders when present", async () => {
    mockAccountLookup();
    mockMessageSendLookup(false);
    mockInsertChain();

    const event = makeSendEvent("ses-sdk-subject-001");
    (event.detail.mail as Record<string, unknown>).commonHeaders = {
      subject: "You've been invited to join Rinya on Wraps",
    };
    await sendWebhook(event);

    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: "ses-sdk-subject-001",
        subject: "You've been invited to join Rinya on Wraps",
      })
    );
  });

  it("records a null subject when the event has no commonHeaders", async () => {
    mockAccountLookup();
    mockMessageSendLookup(false);
    mockInsertChain();

    await sendWebhook(makeSendEvent("ses-sdk-nosubject-001"));

    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: "ses-sdk-nosubject-001",
        subject: null,
      })
    );
  });

  it("Send insert uses onConflictDoNothing — idempotent on duplicate", async () => {
    mockAccountLookup();
    mockMessageSendLookup(false);
    mockInsertChain();

    await sendWebhook(makeSendEvent("ses-sdk-dupe-001"));

    // Called with no arguments — bare .onConflictDoNothing(), not .onConflictDoNothing({ target })
    expect(mockOnConflictDoNothing).toHaveBeenCalledWith();
  });

  it("Delivery event for unknown messageId materializes a delivered row (out-of-order safe)", async () => {
    mockAccountLookup();
    mockMessageSendLookup(false);
    mockInsertChain();

    const response = await sendWebhook(
      makeEventOfType("Delivery", "ses-sdk-delivery-001")
    );

    expect(response.status).toBe(200);
    // SES does not guarantee event order. A Delivery that arrives before its
    // Send must still create the log row, with the delivered status.
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: "ses-sdk-delivery-001",
        sourceType: "transactional",
        status: "delivered",
      })
    );
    expect(mockOnConflictDoNothing).toHaveBeenCalledWith();
  });

  it("Open event for unknown messageId does not materialize a row", async () => {
    mockAccountLookup();
    mockMessageSendLookup(false);
    mockInsertChain();

    const response = await sendWebhook(
      makeEventOfType("Open", "ses-sdk-open-001")
    );

    expect(response.status).toBe(200);
    // Engagement-only events don't represent a send/delivery outcome — skip.
    expect(mockInsertValues).not.toHaveBeenCalled();
  });

  it("Send event with no destination is skipped (no insert)", async () => {
    mockAccountLookup();
    mockMessageSendLookup(false);
    mockInsertChain();

    const eventNoRecipient = {
      ...makeSendEvent("ses-sdk-no-recipient"),
      detail: {
        eventType: "Send",
        mail: {
          messageId: "ses-sdk-no-recipient",
          timestamp: new Date().toISOString(),
          source: "sender@example.com",
          destination: [],
        },
      },
    };

    const response = await sendWebhook(eventNoRecipient);

    expect(response.status).toBe(200);
    expect(mockInsertValues).not.toHaveBeenCalled();
  });

  it("Bounce event for unknown messageId materializes a bounced row", async () => {
    mockAccountLookup();
    mockMessageSendLookup(false);
    mockInsertChain();

    const response = await sendWebhook(
      makeEventOfType("Bounce", "ses-sdk-bounce-001")
    );

    expect(response.status).toBe(200);
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: "ses-sdk-bounce-001",
        status: "bounced",
      })
    );
    expect(mockOnConflictDoNothing).toHaveBeenCalledWith();
  });
});
