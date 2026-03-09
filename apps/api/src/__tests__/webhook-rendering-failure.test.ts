/**
 * Webhook Rendering Failure Tests
 *
 * Tests that SES "Rendering Failure" events correctly:
 * - Mark messageSend as failed
 * - Increment batchSend.failed counter
 * - Fail active workflow executions via mail.tags
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// Module-level mocks
// ─────────────────────────────────────────────────────────────────────────────

const mockDbSelect = vi.fn();
const mockDbUpdate = vi.fn();
const mockDbTransaction = vi.fn();

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
      transaction: mockDbTransaction,
    },
  };
});

const { webhooksRoutes } = await import("../routes/webhooks");
const { Elysia } = await import("elysia");

// ─────────────────────────────────────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────────────────────────────────────

const TEST_AWS_ACCOUNT_NUMBER = "123456789012";
const TEST_WEBHOOK_SECRET = "test-secret-key";

function createTestApp() {
  return new Elysia().use(webhooksRoutes);
}

function makeEventBridgeEvent(overrides: Record<string, unknown> = {}) {
  return {
    version: "0",
    id: "event-1",
    "detail-type": "Email Sending Events",
    source: "aws.ses",
    account: TEST_AWS_ACCOUNT_NUMBER,
    time: new Date().toISOString(),
    region: "us-east-1",
    detail: {
      eventType: "Rendering Failure",
      mail: {
        messageId: "ses-msg-001",
        timestamp: new Date().toISOString(),
        source: "noreply@test.com",
        destination: ["user@example.com"],
      },
      failure: {
        errorMessage:
          "Attribute 'firstName' is not present in the rendering data.",
        templateName: "nudge-connect-aws",
      },
      ...overrides,
    },
  };
}

function selectChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(rows),
      }),
    }),
  };
}

function updateChain(returning?: unknown[]) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.set = vi.fn().mockReturnValue({
    where: vi
      .fn()
      .mockReturnValue(
        returning !== undefined
          ? { returning: vi.fn().mockResolvedValue(returning) }
          : Promise.resolve(undefined)
      ),
  });
  return chain;
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

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const mockAwsAccount = {
  id: "aws-1",
  webhookSecret: TEST_WEBHOOK_SECRET,
  organizationId: "org-1",
};

const mockMessageSend = {
  id: "msg-send-1",
  status: "sent",
  batchSendId: null,
  contactId: "contact-1",
  openedAt: null,
  clickedAt: null,
};

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Webhook: Rendering Failure", () => {
  let app: ReturnType<typeof createTestApp>;
  let updateCalls: ReturnType<typeof updateChain>[];

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
    updateCalls = [];

    // Setup select chain: 1st call = awsAccount, 2nd call = messageSend
    let selectCallCount = 0;
    mockDbSelect.mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) {
        return selectChain([mockAwsAccount]);
      }
      if (selectCallCount === 2) {
        return selectChain([mockMessageSend]);
      }
      return selectChain([]);
    });

    // Capture update calls
    mockDbUpdate.mockImplementation(() => {
      const chain = updateChain();
      updateCalls.push(chain);
      return chain;
    });
  });

  it("sets messageSend status to 'failed' with rendering error", async () => {
    const event = makeEventBridgeEvent();
    const response = await sendWebhookEvent(app, event);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("processed");
    expect(body.eventType).toBe("Rendering Failure");

    // First update should be messageSend with status "failed" and error
    expect(updateCalls.length).toBeGreaterThanOrEqual(1);
    expect(updateCalls[0].set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        error:
          "Rendering failure: Attribute 'firstName' is not present in the rendering data.",
      })
    );
  });

  it("increments batchSend.failed counter when batchSendId present", async () => {
    // Override messageSend to include a batchSendId
    let selectCallCount = 0;
    mockDbSelect.mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) return selectChain([mockAwsAccount]);
      if (selectCallCount === 2)
        return selectChain([{ ...mockMessageSend, batchSendId: "batch-1" }]);
      return selectChain([]);
    });

    const event = makeEventBridgeEvent();
    const response = await sendWebhookEvent(app, event);

    expect(response.status).toBe(200);

    // Should have 2 updates: messageSend + batchSend
    expect(updateCalls.length).toBe(2);

    // Second update should increment batchSend.failed
    expect(updateCalls[1].set).toHaveBeenCalledWith(
      expect.objectContaining({
        failed: expect.anything(),
      })
    );
  });

  it("fails active workflow execution when executionId tag present", async () => {
    // Mock transaction to capture the updates inside it
    const txUpdateCalls: ReturnType<typeof updateChain>[] = [];
    mockDbTransaction.mockImplementation(async (callback: Function) => {
      const txUpdate = vi.fn().mockImplementation(() => {
        const chain = updateChain([{ id: "exec-1", workflowId: "wf-1" }]);
        txUpdateCalls.push(chain);
        return chain;
      });
      return callback({ update: txUpdate });
    });

    // Event with mail.tags containing executionId
    const event = makeEventBridgeEvent({
      mail: {
        messageId: "ses-msg-001",
        timestamp: new Date().toISOString(),
        source: "noreply@test.com",
        destination: ["user@example.com"],
        tags: {
          executionId: ["exec-1"],
          source: ["automation"],
        },
      },
    });

    const response = await sendWebhookEvent(app, event);
    expect(response.status).toBe(200);

    // Should have called db.transaction to fail the execution
    expect(mockDbTransaction).toHaveBeenCalled();

    // First tx update: workflowExecution set to failed
    expect(txUpdateCalls.length).toBeGreaterThanOrEqual(1);
    expect(txUpdateCalls[0].set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        error: expect.stringContaining("Rendering failure"),
        completedAt: expect.any(Date),
      })
    );

    // Second tx update: workflow counter adjustments
    expect(txUpdateCalls.length).toBe(2);
    expect(txUpdateCalls[1].set).toHaveBeenCalledWith(
      expect.objectContaining({
        activeExecutions: expect.anything(),
        failedExecutions: expect.anything(),
      })
    );
  });

  it("skips workflow counter update when execution already completed", async () => {
    // Transaction returns empty array (no rows matched = execution was already completed/failed)
    const txUpdateCalls: ReturnType<typeof updateChain>[] = [];
    mockDbTransaction.mockImplementation(async (callback: Function) => {
      const txUpdate = vi.fn().mockImplementation(() => {
        // Return empty array — no execution matched the WHERE clause
        const chain = updateChain([]);
        txUpdateCalls.push(chain);
        return chain;
      });
      return callback({ update: txUpdate });
    });

    const event = makeEventBridgeEvent({
      mail: {
        messageId: "ses-msg-001",
        timestamp: new Date().toISOString(),
        source: "noreply@test.com",
        destination: ["user@example.com"],
        tags: {
          executionId: ["exec-already-done"],
          source: ["automation"],
        },
      },
    });

    const response = await sendWebhookEvent(app, event);
    expect(response.status).toBe(200);

    // Transaction was called (it tried to fail the execution)
    expect(mockDbTransaction).toHaveBeenCalled();

    // Only 1 tx update (workflowExecution) — no workflow counter update
    // because the returning() was empty (execution not in active/paused/waiting)
    expect(txUpdateCalls.length).toBe(1);
  });

  it("skips execution failure when no executionId tag present", async () => {
    mockDbTransaction.mockClear();

    // Event with no tags (e.g., batch send, not workflow)
    const event = makeEventBridgeEvent();
    const response = await sendWebhookEvent(app, event);

    expect(response.status).toBe(200);

    // messageSend was updated to failed
    expect(updateCalls.length).toBeGreaterThanOrEqual(1);
    expect(updateCalls[0].set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed" })
    );

    // No transaction — no workflow execution to fail
    expect(mockDbTransaction).not.toHaveBeenCalled();
  });
});
