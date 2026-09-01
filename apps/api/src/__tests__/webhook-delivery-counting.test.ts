/**
 * Webhook Delivery Counting Tests
 *
 * Verifies that Delivery events upsert message_usage_monthly for all sources
 * (SDK sends without messageSend rows, and platform sends with them).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDbSelect = vi.fn();
const mockDbUpdate = vi.fn();
const mockDbInsert = vi.fn();
const mockInsertValues = vi.fn();
const mockOnConflictDoUpdate = vi.fn();

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
      update: mockDbUpdate,
      insert: mockDbInsert,
    },
  };
});

const { webhooksRoutes } = await import("../routes/webhooks");
const { trackFirstEmailDelivered } = await import("../lib/activation-tracking");
const { Elysia } = await import("elysia");

const AWS_ACCOUNT_NUMBER = "123456789012";
const WEBHOOK_SECRET = "test-secret-key";
const ORG_ID = "org-delivery-count-1";

function createApp() {
  return new Elysia().use(webhooksRoutes);
}

function makeDeliveryEvent(messageId = "ses-msg-001") {
  return {
    version: "0",
    id: "event-1",
    "detail-type": "Email Sending Events",
    source: "aws.ses",
    account: AWS_ACCOUNT_NUMBER,
    time: new Date().toISOString(),
    region: "us-east-1",
    detail: {
      eventType: "Delivery",
      mail: {
        messageId,
        timestamp: new Date().toISOString(),
        source: "noreply@test.com",
        destination: ["user@example.com"],
      },
      delivery: {
        timestamp: new Date().toISOString(),
        recipients: ["user@example.com"],
      },
    },
  };
}

function makeSendEvent(messageId = "ses-msg-002") {
  return {
    ...makeDeliveryEvent(messageId),
    detail: {
      eventType: "Send",
      mail: {
        messageId,
        timestamp: new Date().toISOString(),
        source: "noreply@test.com",
        destination: ["user@example.com"],
      },
    },
  };
}

function mockAccountLookup() {
  // The account lookup awaits .where() directly (no .limit()); keep .limit
  // available for compatibility with limited queries.
  const rows = Promise.resolve([
    {
      id: "aws-acc-1",
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
                  id: "msg-1",
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

function mockInsertChain(insertedRows: unknown[] = [{ id: "sdk-msg-1" }]) {
  mockOnConflictDoUpdate.mockResolvedValue([{ messageCount: 1 }]);
  mockInsertValues.mockReturnValue({
    onConflictDoUpdate: mockOnConflictDoUpdate,
    // The messageSend insert now calls .onConflictDoNothing().returning(...)
    // so the transition guard can tell whether THIS call created the row —
    // a duplicate SDK Delivery hits the conflict and returns [].
    onConflictDoNothing: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue(insertedRows),
    }),
  });
  mockDbInsert.mockReturnValue({ values: mockInsertValues });
}

function mockUpdateChain() {
  mockDbUpdate.mockImplementation(() => ({
    set: () => ({
      // Thenable that also supports .returning() — processDelivery's primary
      // update (WHERE status NOT IN (failed, delivered)) resolves a row here,
      // simulating a genuine first-time delivery transition.
      where: () =>
        Object.assign(Promise.resolve({ rowCount: 1 }), {
          returning: () => Promise.resolve([{ id: "msg-1" }]),
        }),
    }),
  }));
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

describe("webhook delivery counting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("increments message_usage_monthly for SDK delivery (no messageSend row)", async () => {
    mockAccountLookup();
    mockMessageSendLookup(false);
    mockInsertChain();

    const response = await sendWebhook(makeDeliveryEvent());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("ignored");

    // Verify insert was called (incrementDeliveryCount)
    expect(mockDbInsert).toHaveBeenCalled();
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG_ID,
        messageCount: 1,
      })
    );
    expect(mockOnConflictDoUpdate).toHaveBeenCalled();
  });

  it("increments message_usage_monthly for platform delivery (messageSend exists)", async () => {
    mockAccountLookup();
    mockMessageSendLookup(true);
    mockInsertChain();
    mockUpdateChain();

    const response = await sendWebhook(makeDeliveryEvent());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("processed");

    // Verify insert was called (incrementDeliveryCount)
    expect(mockDbInsert).toHaveBeenCalled();
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG_ID,
        messageCount: 1,
      })
    );
  });

  it("does NOT increment message_usage_monthly for Send events (SDK path)", async () => {
    mockAccountLookup();
    mockMessageSendLookup(false);
    mockInsertChain();

    const response = await sendWebhook(makeSendEvent());

    expect(response.status).toBe(200);

    // message_usage_monthly should NOT be incremented for Send events
    // (db.insert IS called to store the messageSend row, but not for usage_monthly)
    expect(mockOnConflictDoUpdate).not.toHaveBeenCalled();
  });

  it("calls trackFirstEmailDelivered for SDK delivery", async () => {
    mockAccountLookup();
    mockMessageSendLookup(false);
    mockInsertChain();

    await sendWebhook(makeDeliveryEvent());

    expect(trackFirstEmailDelivered).toHaveBeenCalledWith(ORG_ID, "sdk");
  });

  it("does NOT call trackFirstEmailDelivered for Send events (SDK path)", async () => {
    mockAccountLookup();
    mockMessageSendLookup(false);
    mockInsertChain();

    await sendWebhook(makeSendEvent());

    expect(trackFirstEmailDelivered).not.toHaveBeenCalled();
  });

  it("still succeeds even if incrementDeliveryCount fails", async () => {
    mockAccountLookup();
    mockMessageSendLookup(true);
    mockUpdateChain();

    // Make insert fail
    mockDbInsert.mockReturnValue({
      values: () => ({
        onConflictDoUpdate: () =>
          Promise.reject(new Error("DB connection lost")),
      }),
    });

    const response = await sendWebhook(makeDeliveryEvent());

    // processDelivery succeeds, so webhook returns 200 despite count failure
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("processed");
  });

  it("returns 500 if processDelivery fails (so EventBridge retries)", async () => {
    mockAccountLookup();
    mockMessageSendLookup(true);
    mockInsertChain();

    // Make update (processDelivery) throw
    mockDbUpdate.mockImplementation(() => ({
      set: () => ({
        where: () => {
          const rejected = Promise.reject(new Error("DB write failed"));
          return Object.assign(rejected, { returning: () => rejected });
        },
      }),
    }));

    const response = await sendWebhook(makeDeliveryEvent());

    expect(response.status).toBe(500);
  });

  // ─── Unit 24: Status precedence — bounced/complained not overwritten ───
  it("does NOT overwrite messageSend.status when existing status is 'bounced'", async () => {
    mockAccountLookup();
    // Message already has bounced status
    mockDbSelect.mockReturnValueOnce({
      from: () => ({
        where: () => ({
          limit: () =>
            Promise.resolve([
              {
                id: "msg-bounced",
                status: "bounced", // Already bounced — must not be overwritten
                batchSendId: null,
                contactId: null,
                openedAt: null,
                clickedAt: null,
              },
            ]),
        }),
      }),
    });
    mockInsertChain();

    const updateSpy = vi.fn();
    mockDbUpdate.mockImplementation(() => ({
      set: (data: Record<string, unknown>) => {
        updateSpy(data);
        return {
          where: () =>
            Object.assign(Promise.resolve({ rowCount: 1 }), {
              returning: () => Promise.resolve([]),
            }),
        };
      },
    }));

    const response = await sendWebhook(makeDeliveryEvent());

    expect(response.status).toBe(200);

    // The update should NOT have been called with status: 'delivered'
    // because the existing status is 'bounced' (higher precedence)
    const deliveryUpdateCall = updateSpy.mock.calls.find(
      (call) => call[0]?.status === "delivered"
    );
    expect(deliveryUpdateCall).toBeUndefined();
  });

  it("does NOT increment count if processDelivery fails", async () => {
    mockAccountLookup();
    mockMessageSendLookup(true);
    mockInsertChain();

    // Make update (processDelivery) throw
    mockDbUpdate.mockImplementation(() => ({
      set: () => ({
        where: () => {
          const rejected = Promise.reject(new Error("DB write failed"));
          return Object.assign(rejected, { returning: () => rejected });
        },
      }),
    }));

    await sendWebhook(makeDeliveryEvent());

    // incrementDeliveryCount should NOT have been called
    expect(mockDbInsert).not.toHaveBeenCalled();
  });

  it("includes correct period key format (YYYY-MM)", async () => {
    mockAccountLookup();
    mockMessageSendLookup(false);
    mockInsertChain();

    await sendWebhook(makeDeliveryEvent());

    // SDK delivery now also materializes a messageSend row, so the usage insert
    // is no longer guaranteed to be the first call — find it by its periodKey.
    const usageInsert = mockInsertValues.mock.calls
      .map((call) => call[0])
      .find((values) => values.periodKey !== undefined);
    expect(usageInsert?.periodKey).toMatch(/^\d{4}-\d{2}$/);
  });
});
