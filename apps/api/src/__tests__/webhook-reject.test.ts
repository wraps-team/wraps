/**
 * Webhook Reject Tests (Unit 30)
 *
 * Tests that SES "Reject" events correctly:
 * - Update messageSend status to "rejected"
 *   (Note: mapped to "failed" since "rejected" is not in the current DB enum;
 *    a DB migration can add "rejected" as a distinct value later)
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRejectEvent } from "./fixtures/ses-events";

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

vi.mock("../lib/activation-tracking", () => ({
  trackFirstEmailDelivered: vi.fn(),
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
// in this file indexes assuming it only contains messageSend/contact/batchSend
// business updates.
const { awsAccount } = await import("@wraps/db");

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

function updateChain() {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.set = vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue(undefined),
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

function setupWebhookMocks(overrides: Partial<typeof mockMessageSend> = {}) {
  const message = { ...mockMessageSend, ...overrides };

  let selectCallCount = 0;
  mockDbSelect.mockImplementation(() => {
    selectCallCount++;
    if (selectCallCount === 1) return selectChain([mockAwsAccount]);
    if (selectCallCount === 2) return selectChain([message]);
    // 3rd select: resumeWaitingExecutions (no .limit())
    return selectChainNoLimit([]);
  });

  const updateCalls: ReturnType<typeof updateChain>[] = [];
  mockDbUpdate.mockImplementation((table: unknown) => {
    const chain = updateChain();
    // Skip the liveness-tracking update — covered separately in
    // webhook-last-event-received.test.ts, not part of this file's contract.
    if (table !== awsAccount) {
      updateCalls.push(chain);
    }
    return chain;
  });

  return { updateCalls };
}

describe("Webhook: Reject (Unit 30)", () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
  });

  it("sets messageSend status to 'rejected'", async () => {
    const { updateCalls } = setupWebhookMocks();

    const event = buildRejectEvent({ reason: "Bad content" });
    const response = await sendWebhookEvent(app, event);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("processed");
    expect(body.eventType).toBe("Reject");

    // SES Reject maps to "failed" (closest existing enum value; a "rejected" enum
    // value can be added in a future migration for more granular tracking)
    expect(updateCalls[0].set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
      })
    );
  });

  it("returns 200 when messageSend not found (idempotent)", async () => {
    let selectCallCount = 0;
    mockDbSelect.mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) return selectChain([mockAwsAccount]);
      return selectChain([]); // message not found
    });

    mockDbUpdate.mockImplementation(() => updateChain());

    const event = buildRejectEvent();
    const response = await sendWebhookEvent(app, event);

    // Should not fail — idempotent
    expect(response.status).toBe(200);
  });
});
