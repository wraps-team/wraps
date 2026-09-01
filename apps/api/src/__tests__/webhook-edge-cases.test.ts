/**
 * Webhook Edge Cases
 *
 * Tests for webhook handler paths not covered by event-specific test files:
 * - Unsupported SES event types return "ignored" (not an error)
 * - SDK delivery (message not found + Delivery event) triggers side effects
 * - Side effect failures on SDK delivery are logged but don't fail the request
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildBounceEvent, buildDeliveryEvent } from "./fixtures/ses-events";

const mockDbSelect = vi.fn();
const mockDbUpdate = vi.fn();
const mockDbInsert = vi.fn();

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

const mockTrackFirstEmailDelivered = vi.fn();
vi.mock("../lib/activation-tracking", () => ({
  trackFirstEmailDelivered: mockTrackFirstEmailDelivered,
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
const { Elysia } = await import("elysia");
const { log } = await import("../lib/logger");

const TEST_AWS_ACCOUNT_NUMBER = "123456789012";
const TEST_WEBHOOK_SECRET = "test-secret-key";

function createTestApp() {
  return new Elysia().use(webhooksRoutes);
}

function selectChain(rows: unknown[]) {
  // .where() result is BOTH awaitable (the account lookup awaits it directly,
  // no .limit()) and .limit()-capable (the messageSend lookup uses .limit(1)).
  const whereResult = Object.assign(Promise.resolve(rows), {
    limit: vi.fn().mockResolvedValue(rows),
  });
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue(whereResult),
    }),
  };
}

function selectChainNoLimit(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(rows),
    }),
  };
}

async function sendWebhookEvent(
  app: ReturnType<typeof createTestApp>,
  body: Record<string, unknown>
) {
  return app.handle(
    new Request(`http://localhost/webhooks/ses/${TEST_AWS_ACCOUNT_NUMBER}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-wraps-api-key": TEST_WEBHOOK_SECRET,
      },
      body: JSON.stringify(body),
    })
  );
}

const mockAwsAccount = {
  id: "aws-1",
  webhookSecret: TEST_WEBHOOK_SECRET,
  organizationId: "org-1",
};

const mockMessageSend = {
  id: "msg-send-1",
  status: "sent",
  batchSendId: null as string | null,
  contactId: "contact-1" as string | null,
  openedAt: null,
  clickedAt: null,
};

function setupAccountOnly() {
  mockDbSelect.mockImplementation(() => selectChain([mockAwsAccount]));
  mockDbInsert.mockReturnValue({
    values: vi.fn().mockReturnValue({
      onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      // .onConflictDoNothing() now chains .returning() so the SDK-path
      // transition guard can tell whether this call created the row.
      onConflictDoNothing: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: "sdk-msg-1" }]),
      }),
    }),
  });
}

function setupWithMessage() {
  let selectCallCount = 0;
  mockDbSelect.mockImplementation(() => {
    selectCallCount++;
    if (selectCallCount === 1) return selectChain([mockAwsAccount]);
    if (selectCallCount === 2) return selectChain([mockMessageSend]);
    return selectChainNoLimit([]);
  });
  mockDbUpdate.mockImplementation(() => ({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  }));
  mockDbInsert.mockReturnValue({
    values: vi.fn().mockReturnValue({
      onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      // .onConflictDoNothing() now chains .returning() so the SDK-path
      // transition guard can tell whether this call created the row.
      onConflictDoNothing: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: "sdk-msg-1" }]),
      }),
    }),
  });
}

function buildUnsupportedEvent(eventType: string) {
  return {
    version: "0",
    id: "event-1",
    "detail-type": "Email Sending Events",
    source: "aws.ses",
    account: TEST_AWS_ACCOUNT_NUMBER,
    time: new Date().toISOString(),
    region: "us-east-1",
    detail: {
      eventType,
      mail: {
        messageId: "ses-msg-001",
        timestamp: new Date().toISOString(),
        source: "noreply@test.com",
        destination: ["user@example.com"],
      },
    },
  };
}

describe("Webhook: unsupported event types", () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
    setupWithMessage();
  });

  it.each(["Send", "DeliveryDelay"])(
    "returns 200 ignored for '%s' event type",
    async (eventType) => {
      const event = buildUnsupportedEvent(eventType);
      const response = await sendWebhookEvent(app, event);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.status).toBe("ignored");
      expect(body.reason).toContain("unsupported event type");
      expect(body.reason).toContain(eventType);
    }
  );
});

describe("Webhook: SDK delivery (message not found)", () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
    // Account found, but no messageSend record (SDK send)
    let selectCallCount = 0;
    mockDbSelect.mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) return selectChain([mockAwsAccount]);
      return selectChain([]); // message not found
    });
    mockTrackFirstEmailDelivered.mockResolvedValue(undefined);
    mockDbInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
        onConflictDoNothing: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: "sdk-msg-1" }]),
        }),
      }),
    });
  });

  it("returns 200 ignored when messageSend not found", async () => {
    const event = buildDeliveryEvent();
    const response = await sendWebhookEvent(app, event);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("ignored");
    expect(body.reason).toBe("message not found");
  });

  it("tracks activation for SDK delivery when message not found", async () => {
    const event = buildDeliveryEvent();
    await sendWebhookEvent(app, event);

    expect(mockTrackFirstEmailDelivered).toHaveBeenCalledWith("org-1", "sdk");
  });

  it("increments delivery count for SDK delivery when message not found", async () => {
    const event = buildDeliveryEvent();
    await sendWebhookEvent(app, event);

    expect(mockDbInsert).toHaveBeenCalled();
  });

  it("does not call trackFirstEmailDelivered for non-Delivery events when message not found", async () => {
    const event = buildBounceEvent({ bounceType: "Permanent" });
    await sendWebhookEvent(app, event);

    expect(mockTrackFirstEmailDelivered).not.toHaveBeenCalled();
  });

  it("still returns 200 ignored when SDK delivery side effect fails", async () => {
    mockTrackFirstEmailDelivered.mockRejectedValue(
      new Error("activation service down")
    );

    const event = buildDeliveryEvent();
    const response = await sendWebhookEvent(app, event);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("ignored");
    expect(log.error).toHaveBeenCalled();
  });
});

describe("Webhook: account found, message not found for non-Delivery events", () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
    let selectCallCount = 0;
    mockDbSelect.mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) return selectChain([mockAwsAccount]);
      return selectChain([]);
    });
    // Lifecycle events (Bounce/Complaint) now materialize a minimal SDK log row.
    mockDbInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: "sdk-msg-1" }]),
        }),
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      }),
    });
  });

  it.each(["Bounce", "Complaint", "Open", "Click"])(
    "returns 200 ignored for '%s' event when message not found",
    async (eventType) => {
      const event = buildUnsupportedEvent(eventType);
      const response = await sendWebhookEvent(app, event);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.status).toBe("ignored");
      expect(body.reason).toBe("message not found");
    }
  );
});
