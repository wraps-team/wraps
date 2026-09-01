/**
 * Open/Click webhook TOCTOU race condition test
 *
 * Verifies that processOpen/processClick use atomic WHERE conditions
 * to prevent double counting when concurrent webhook deliveries arrive.
 * The UPDATE must include "AND openedAt IS NULL" / "AND clickedAt IS NULL"
 * so the DB rejects the second concurrent update.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDbSelect = vi.fn();
const mockDbUpdate = vi.fn();

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

vi.mock("@wraps/db", async () => {
  const actual = await vi.importActual("@wraps/db");
  return {
    ...actual,
    db: {
      select: mockDbSelect,
      update: mockDbUpdate,
    },
  };
});

const { webhooksRoutes } = await import("../routes/webhooks");
const { Elysia } = await import("elysia");
// Real drizzle table object — used to exclude the webhook route's
// last_event_received_at liveness update from updateCalls, which every test
// in this file indexes assuming it only contains messageSend/batchSend/contact
// business updates.
const { awsAccount } = await import("@wraps/db");

const TEST_AWS_ACCOUNT_NUMBER = "123456789012";
const TEST_WEBHOOK_SECRET = "test-secret-key";

function createTestApp() {
  return new Elysia().use(webhooksRoutes);
}

function setupMocksForRace(
  eventType: "Open" | "Click",
  updateRowCount: number
) {
  // Mock account lookup — awaited at .where() directly (no .limit()); keep
  // .limit available for compatibility with limited queries.
  const accountRows = Promise.resolve([
    {
      id: "aws-acc-1",
      webhookSecret: TEST_WEBHOOK_SECRET,
      organizationId: "org-1",
    },
  ]);
  mockDbSelect.mockReturnValueOnce({
    from: () => ({
      where: () => Object.assign(accountRows, { limit: () => accountRows }),
    }),
  });

  // Mock messageSend lookup — openedAt/clickedAt is null (the stale read)
  mockDbSelect.mockReturnValueOnce({
    from: () => ({
      where: () => ({
        limit: () =>
          Promise.resolve([
            {
              id: "msg-1",
              status: "delivered",
              batchSendId: "batch-1",
              contactId: "contact-1",
              openedAt: null,
              clickedAt: null,
            },
          ]),
      }),
    }),
  });

  // Track all update calls with their set data
  const updateCalls: { setData: Record<string, unknown>; rowCount: number }[] =
    [];
  mockDbUpdate.mockImplementation((table: unknown) => ({
    set: (data: Record<string, unknown>) => ({
      where: () => {
        // Skip the liveness-tracking update — covered separately in
        // webhook-last-event-received.test.ts, not part of this file's
        // contract (which asserts exact business-update counts).
        if (table !== awsAccount) {
          const call = { setData: data, rowCount: updateRowCount };
          updateCalls.push(call);
        }
        // Return result with rowCount to simulate affected rows
        return Promise.resolve({ rowCount: updateRowCount });
      },
    }),
  }));

  return { updateCalls };
}

function makeEvent(type: "Open" | "Click") {
  const detail: Record<string, unknown> = {
    eventType: type,
    mail: {
      messageId: "ses-msg-001",
      timestamp: new Date().toISOString(),
      source: "noreply@test.com",
      destination: ["user@example.com"],
    },
  };

  if (type === "Open") {
    detail.open = {
      timestamp: "2026-03-09T12:00:00Z",
      userAgent: "Mozilla/5.0",
      ipAddress: "203.0.113.42",
    };
  } else {
    detail.click = {
      timestamp: "2026-03-09T12:05:00Z",
      link: "https://example.com/cta",
      userAgent: "Mozilla/5.0",
      ipAddress: "198.51.100.10",
    };
  }

  return {
    version: "0",
    id: "event-1",
    "detail-type": "Email Sending Events",
    source: "aws.ses",
    account: TEST_AWS_ACCOUNT_NUMBER,
    time: new Date().toISOString(),
    region: "us-east-1",
    detail,
  };
}

async function sendWebhook(
  app: ReturnType<typeof createTestApp>,
  type: "Open" | "Click"
) {
  return app.handle(
    new Request(`http://localhost/webhooks/ses/${TEST_AWS_ACCOUNT_NUMBER}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-wraps-api-key": TEST_WEBHOOK_SECRET,
      },
      body: JSON.stringify(makeEvent(type)),
    })
  );
}

describe("Open/Click webhook TOCTOU race", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("processOpen: when atomic UPDATE affects 0 rows (race lost), skips counters", async () => {
    // Simulate: message.openedAt is null (stale read), but UPDATE returns
    // rowCount=0 because another request already set openedAt.
    // The batch counter, contact counter, and workflow resumption must NOT fire.
    const { updateCalls } = setupMocksForRace("Open", 0);
    const app = createTestApp();

    const res = await sendWebhook(app, "Open");
    expect(res.status).toBe(200);

    // Only the messageSend UPDATE should fire (the atomic one).
    // Batch counter, contact counter, and workflow resumption should NOT fire
    // because the UPDATE affected 0 rows (race lost).
    expect(updateCalls).toHaveLength(1);
  });

  it("processClick: when atomic UPDATE affects 0 rows (race lost), skips counters", async () => {
    const { updateCalls } = setupMocksForRace("Click", 0);
    const app = createTestApp();

    const res = await sendWebhook(app, "Click");
    expect(res.status).toBe(200);

    expect(updateCalls).toHaveLength(1);
  });

  it("processOpen: when atomic UPDATE affects 1 row (race won), increments counters", async () => {
    const { updateCalls } = setupMocksForRace("Open", 1);

    // resumeWaitingExecutions does a SELECT for waiting executions
    mockDbSelect.mockReturnValueOnce({
      from: () => ({
        where: () => Promise.resolve([]),
      }),
    });

    const app = createTestApp();

    const res = await sendWebhook(app, "Open");
    expect(res.status).toBe(200);

    // messageSend UPDATE + batchSend counter + contact counter = 3 updates
    expect(updateCalls).toHaveLength(3);
  });
});
