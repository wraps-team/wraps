/**
 * Webhook Engagement Tests
 *
 * Tests that SES "Delivery", "Open", and "Click" events correctly:
 * - Update messageSend status
 * - Update contact engagement counters and timestamps
 * - Call resumeWaitingExecutions with appropriate branch ("opened" / "clicked")
 * - Cancel waitTimeoutSchedulerName when present
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildClickEvent,
  buildDeliveryEvent,
  buildOpenEvent,
} from "./fixtures/ses-events";

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
      insert: mockDbInsert,
    },
  };
});

const { webhooksRoutes } = await import("../routes/webhooks");
const { Elysia } = await import("elysia");
const { deleteScheduledStep, enqueueWorkflowStep } = await import(
  "../services/workflow-queue"
);
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

function selectChainLimited(rows: unknown[]) {
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

function selectChainUnlimited(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(rows),
    }),
  };
}

function updateChain(result: unknown = undefined) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.set = vi.fn().mockReturnValue({
    // Thenable that also supports .returning() — processDelivery's atomic
    // failed→delivered flip calls .where().returning(); [] means "row was
    // not 'failed'", so the code proceeds to the plain update.
    where: vi.fn().mockReturnValue(
      Object.assign(Promise.resolve(result ?? { rowCount: 1 }), {
        returning: vi.fn().mockResolvedValue([]),
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
  openedAt: null as Date | null,
  clickedAt: null as Date | null,
};

type SetupOpts = {
  message?: Partial<typeof mockMessageSend>;
  waitingExecutions?: Array<Record<string, unknown>>;
};

function setupWebhookMocks(opts: SetupOpts = {}) {
  const message = { ...mockMessageSend, ...opts.message };
  const waitingExecutions = opts.waitingExecutions ?? [];

  let selectCallCount = 0;
  mockDbSelect.mockImplementation(() => {
    selectCallCount++;
    if (selectCallCount === 1) return selectChainLimited([mockAwsAccount]);
    if (selectCallCount === 2) return selectChainLimited([message]);
    // resumeWaitingExecutions select: no .limit()
    return selectChainUnlimited(waitingExecutions);
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

  mockDbInsert.mockReturnValue({
    values: vi.fn().mockReturnValue({
      onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
    }),
  });

  return { updateCalls };
}

describe("Webhook: Engagement", () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
  });

  it("delivery updates messageSend status to 'delivered'", async () => {
    const { updateCalls } = setupWebhookMocks();

    const event = buildDeliveryEvent();
    const response = await sendWebhookEvent(app, event);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("processed");
    expect(body.eventType).toBe("Delivery");

    expect(updateCalls[0].set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "delivered",
        deliveredAt: expect.any(Date),
      })
    );
  });

  it("open updates messageSend + contact engagement, calls resumeWaitingExecutions('opened')", async () => {
    const { updateCalls } = setupWebhookMocks({
      waitingExecutions: [
        {
          id: "exec-1",
          organizationId: "org-1",
          contactId: "contact-1",
          status: "waiting",
          waitingForEvent: "email_engagement:ses-msg-001",
          waitTimeoutSchedulerName: "wraps-wf-to-timeout-1",
        },
      ],
    });

    const event = buildOpenEvent();
    const response = await sendWebhookEvent(app, event);

    expect(response.status).toBe(200);

    // messageSend update
    expect(updateCalls[0].set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "opened",
        openedAt: expect.any(Date),
      })
    );

    // contact update
    const contactUpdate = updateCalls.find((c) => {
      const arg = c.set.mock.calls[0]?.[0] as Record<string, unknown>;
      return arg?.lastEmailOpenedAt !== undefined;
    });
    expect(contactUpdate).toBeDefined();

    // Timeout scheduler cancelled
    expect(deleteScheduledStep).toHaveBeenCalledWith("wraps-wf-to-timeout-1");

    // Resume with "opened" branch
    expect(enqueueWorkflowStep).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "resume",
        executionId: "exec-1",
        branch: "opened",
        organizationId: "org-1",
      })
    );
  });

  it("click updates messageSend + contact engagement, calls resumeWaitingExecutions('clicked')", async () => {
    const { updateCalls } = setupWebhookMocks({
      waitingExecutions: [
        {
          id: "exec-2",
          organizationId: "org-1",
          contactId: "contact-1",
          status: "waiting",
          waitingForEvent: "email_engagement:ses-msg-001",
          waitTimeoutSchedulerName: null,
        },
      ],
    });

    const event = buildClickEvent({ link: "https://example.com/cta" });
    const response = await sendWebhookEvent(app, event);

    expect(response.status).toBe(200);

    // messageSend update
    expect(updateCalls[0].set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "clicked",
        clickedAt: expect.any(Date),
        clickedUrl: "https://example.com/cta",
      })
    );

    // contact engagement update
    const contactUpdate = updateCalls.find((c) => {
      const arg = c.set.mock.calls[0]?.[0] as Record<string, unknown>;
      return arg?.lastEmailClickedAt !== undefined;
    });
    expect(contactUpdate).toBeDefined();

    // Resume with "clicked" branch
    expect(enqueueWorkflowStep).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "resume",
        executionId: "exec-2",
        branch: "clicked",
      })
    );
  });

  it("cancels timeout scheduler for click when waitTimeoutSchedulerName is set", async () => {
    setupWebhookMocks({
      waitingExecutions: [
        {
          id: "exec-click",
          organizationId: "org-1",
          contactId: "contact-1",
          status: "waiting",
          waitingForEvent: "email_engagement:ses-msg-001",
          waitTimeoutSchedulerName: "wraps-wf-to-timeout-click",
        },
      ],
    });

    const event = buildClickEvent();
    await sendWebhookEvent(app, event);

    expect(deleteScheduledStep).toHaveBeenCalledWith(
      "wraps-wf-to-timeout-click"
    );
    expect(enqueueWorkflowStep).toHaveBeenCalledWith(
      expect.objectContaining({ executionId: "exec-click", branch: "clicked" })
    );
  });

  it("does not call enqueueWorkflowStep when no waiting executions (open)", async () => {
    setupWebhookMocks({ waitingExecutions: [] });

    const event = buildOpenEvent();
    await sendWebhookEvent(app, event);

    expect(enqueueWorkflowStep).not.toHaveBeenCalled();
  });

  it("does not call enqueueWorkflowStep when no waiting executions (click)", async () => {
    setupWebhookMocks({ waitingExecutions: [] });

    const event = buildClickEvent();
    await sendWebhookEvent(app, event);

    expect(enqueueWorkflowStep).not.toHaveBeenCalled();
  });

  it("resumes all waiting executions when multiple are present (open)", async () => {
    setupWebhookMocks({
      waitingExecutions: [
        {
          id: "exec-a",
          organizationId: "org-1",
          contactId: "contact-1",
          status: "waiting",
          waitingForEvent: "email_engagement:ses-msg-001",
          waitTimeoutSchedulerName: "wraps-wf-to-timeout-a",
        },
        {
          id: "exec-b",
          organizationId: "org-1",
          contactId: "contact-1",
          status: "waiting",
          waitingForEvent: "email_engagement:ses-msg-001",
          waitTimeoutSchedulerName: null,
        },
      ],
    });

    const event = buildOpenEvent();
    await sendWebhookEvent(app, event);

    expect(enqueueWorkflowStep).toHaveBeenCalledTimes(2);
    expect(enqueueWorkflowStep).toHaveBeenCalledWith(
      expect.objectContaining({ executionId: "exec-a", branch: "opened" })
    );
    expect(enqueueWorkflowStep).toHaveBeenCalledWith(
      expect.objectContaining({ executionId: "exec-b", branch: "opened" })
    );
    expect(deleteScheduledStep).toHaveBeenCalledWith("wraps-wf-to-timeout-a");
    expect(deleteScheduledStep).toHaveBeenCalledTimes(1);
  });

  // ─── Unit 23: org-scoped resumeWaitingExecutions (hardened) ──────────────
  // The mock now returns BOTH same-org and cross-org executions (simulating the
  // absence of a SQL WHERE clause). The application-level org filter in
  // resumeWaitingExecutions must discard the cross-org row. Removing the
  // application filter causes two enqueue calls → test fails.
  it("resumes only executions belonging to the same organizationId (cross-org IDOR guard)", async () => {
    const sameOrgExecution = {
      id: "exec-same-org",
      organizationId: mockAwsAccount.organizationId, // "org-1"
      contactId: "contact-1",
      status: "waiting",
      waitingForEvent: "email_engagement:ses-msg-001",
      waitTimeoutSchedulerName: null,
    };
    // A cross-org execution with the same waitingForEvent key — must never be resumed
    const crossOrgExecution = {
      id: "exec-cross-org",
      organizationId: "org-ATTACKER",
      contactId: "contact-attacker",
      status: "waiting",
      waitingForEvent: "email_engagement:ses-msg-001",
      waitTimeoutSchedulerName: null,
    };

    // Mock returns BOTH executions — application-level filter must reject the cross-org one
    let selectCallCount = 0;
    mockDbSelect.mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) return selectChainLimited([mockAwsAccount]);
      if (selectCallCount === 2)
        return selectChainLimited([{ ...mockMessageSend }]);
      // resumeWaitingExecutions: mock returns both orgs (bypasses SQL filter)
      return selectChainUnlimited([sameOrgExecution, crossOrgExecution]);
    });
    mockDbUpdate.mockImplementation(() => updateChain());
    mockDbInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      }),
    });

    const event = buildOpenEvent();
    await sendWebhookEvent(app, event);

    // Only the same-org execution must be resumed — cross-org execution discarded by app filter
    expect(enqueueWorkflowStep).toHaveBeenCalledTimes(1);
    expect(enqueueWorkflowStep).toHaveBeenCalledWith(
      expect.objectContaining({
        executionId: "exec-same-org",
        organizationId: mockAwsAccount.organizationId,
      })
    );
    expect(enqueueWorkflowStep).not.toHaveBeenCalledWith(
      expect.objectContaining({ executionId: "exec-cross-org" })
    );
  });

  it("does NOT call deleteScheduledStep when waitTimeoutSchedulerName is null (open event)", async () => {
    setupWebhookMocks({
      waitingExecutions: [
        {
          id: "exec-3",
          organizationId: "org-1",
          contactId: "contact-1",
          status: "waiting",
          waitingForEvent: "email_engagement:ses-msg-001",
          waitTimeoutSchedulerName: null,
        },
      ],
    });

    const event = buildOpenEvent();
    await sendWebhookEvent(app, event);

    // No deletion call since scheduler name is null
    expect(deleteScheduledStep).not.toHaveBeenCalled();

    // But resume was still enqueued
    expect(enqueueWorkflowStep).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "resume",
        executionId: "exec-3",
        branch: "opened",
      })
    );
  });
});
