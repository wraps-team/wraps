/**
 * Webhook Complaint Tests
 *
 * Tests that SES "Complaint" events correctly:
 * - Update messageSend status to "complained"
 * - Mark contact emailStatus as "complained"
 * - Do NOT call resumeWaitingExecutions (documents current behavior gap —
 *   see hardening backlog; complaints should probably resume waiting execs
 *   similar to bounces, but today they don't).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildComplaintEvent } from "./fixtures/ses-events";

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
const { enqueueWorkflowStep } = await import("../services/workflow-queue");
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

function updateChain() {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.set = vi.fn().mockReturnValue({
    // Thenable that also supports .returning() — processComplaint's
    // transition guard calls .where().returning(); a non-empty row simulates
    // a genuine status transition (the default scenario these tests exercise).
    where: vi.fn().mockReturnValue(
      Object.assign(Promise.resolve(undefined), {
        returning: vi.fn().mockResolvedValue([{ id: "msg-send-1" }]),
      })
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

function selectChainNoLimit(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(rows),
    }),
  };
}

function setupWebhookMocks(
  overrides: Partial<typeof mockMessageSend> = {},
  waitingExecutions: Array<Record<string, unknown>> = []
) {
  const message = { ...mockMessageSend, ...overrides };

  let selectCallCount = 0;
  mockDbSelect.mockImplementation(() => {
    selectCallCount++;
    if (selectCallCount === 1) return selectChain([mockAwsAccount]);
    if (selectCallCount === 2) return selectChain([message]);
    // 3rd select: resumeWaitingExecutions (no .limit())
    return selectChainNoLimit(waitingExecutions);
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

describe("Webhook: Complaint", () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
  });

  it("sets messageSend status to 'complained'", async () => {
    const { updateCalls } = setupWebhookMocks();

    const event = buildComplaintEvent();
    const response = await sendWebhookEvent(app, event);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("processed");
    expect(body.eventType).toBe("Complaint");

    expect(updateCalls[0].set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "complained",
        complainedAt: expect.any(Date),
      })
    );
  });

  it("marks contact emailStatus as 'complained'", async () => {
    const { updateCalls } = setupWebhookMocks();

    const event = buildComplaintEvent();
    await sendWebhookEvent(app, event);

    const contactUpdate = updateCalls.find(
      (c) =>
        (c.set.mock.calls[0]?.[0] as Record<string, unknown>)?.emailStatus ===
        "complained"
    );
    expect(contactUpdate).toBeDefined();
    expect(contactUpdate!.set).toHaveBeenCalledWith(
      expect.objectContaining({
        emailStatus: "complained",
        emailComplainedAt: expect.any(Date),
      })
    );
  });

  // Unit 31: complaint handler calls resumeWaitingExecutions for waiting executions
  it("calls resumeWaitingExecutions for waiting executions (Unit 31)", async () => {
    setupWebhookMocks({}, [
      {
        id: "exec-1",
        organizationId: "org-1",
        contactId: "contact-1",
        status: "waiting",
        waitingForEvent: "email_engagement:ses-msg-001",
        waitTimeoutSchedulerName: null,
      },
    ]);

    const event = buildComplaintEvent();
    await sendWebhookEvent(app, event);

    expect(enqueueWorkflowStep).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "resume",
        executionId: "exec-1",
        branch: "bounced",
        organizationId: "org-1",
      })
    );
  });

  it("does not call resumeWaitingExecutions when no waiting executions", async () => {
    setupWebhookMocks({}, []);

    const event = buildComplaintEvent();
    await sendWebhookEvent(app, event);

    expect(enqueueWorkflowStep).not.toHaveBeenCalled();
  });
});
