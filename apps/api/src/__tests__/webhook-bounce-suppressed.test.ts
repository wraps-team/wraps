/**
 * Webhook Bounce — bounceSubType="Suppressed" Tests
 *
 * SES sends Bounce events with bounceSubType="Suppressed" for suppression list hits.
 * These should be treated as suppressions, not standard bounces.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildBounceEvent } from "./fixtures/ses-events";

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
const { enqueueWorkflowStep, deleteScheduledStep } = await import(
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
    // Thenable that also supports .returning() — processSuppression's
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

type MockOpts = {
  message?: Partial<typeof mockMessageSend>;
  waitingExecutions?: Array<Record<string, unknown>>;
};

function setupMocks(opts: MockOpts = {}) {
  const message = { ...mockMessageSend, ...opts.message };
  const waitingExecutions = opts.waitingExecutions ?? [];

  let selectCallCount = 0;
  mockDbSelect.mockImplementation(() => {
    selectCallCount++;
    if (selectCallCount === 1) return selectChain([mockAwsAccount]);
    if (selectCallCount === 2) return selectChain([message]);
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

describe("Webhook: Bounce with bounceSubType=Suppressed", () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
  });

  it("sets messageSend status to 'suppressed' (not 'bounced')", async () => {
    const { updateCalls } = setupMocks();

    const event = buildBounceEvent({
      bounceType: "Permanent",
      bounceSubType: "Suppressed",
    });
    const response = await sendWebhookEvent(app, event);

    expect(response.status).toBe(200);

    expect(updateCalls[0].set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "suppressed",
        suppressedAt: expect.any(Date),
      })
    );
    expect(updateCalls[0].set).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: "bounced" })
    );
  });

  it("sets contact emailStatus to 'suppressed' (not 'bounced')", async () => {
    const { updateCalls } = setupMocks();

    const event = buildBounceEvent({
      bounceType: "Permanent",
      bounceSubType: "Suppressed",
    });
    await sendWebhookEvent(app, event);

    const contactUpdate = updateCalls.find(
      (c) =>
        (c.set.mock.calls[0]?.[0] as Record<string, unknown>)?.emailStatus !==
        undefined
    );
    expect(contactUpdate).toBeDefined();
    expect(contactUpdate!.set).toHaveBeenCalledWith(
      expect.objectContaining({
        emailStatus: "suppressed",
      })
    );
    expect(contactUpdate!.set).not.toHaveBeenCalledWith(
      expect.objectContaining({ emailStatus: "bounced" })
    );
  });

  it("increments batchSend.suppressed (not .bounced) when batchSendId present", async () => {
    const { updateCalls } = setupMocks({
      message: { batchSendId: "batch-1" },
    });

    const event = buildBounceEvent({
      bounceType: "Permanent",
      bounceSubType: "Suppressed",
    });
    await sendWebhookEvent(app, event);

    const suppressedCounterUpdate = updateCalls.find(
      (c) =>
        (c.set.mock.calls[0]?.[0] as Record<string, unknown>)?.suppressed !==
        undefined
    );
    expect(suppressedCounterUpdate).toBeDefined();
    const suppressedArg = (
      suppressedCounterUpdate!.set.mock.calls[0]?.[0] as Record<string, unknown>
    ).suppressed as { queryChunks?: Array<{ value?: string[] }> };
    const chunkText = suppressedArg.queryChunks
      ?.flatMap((c) => c.value ?? [])
      .join(" ");
    expect(chunkText).toContain("+ 1");

    const bouncedCounterUpdate = updateCalls.find(
      (c) =>
        (c.set.mock.calls[0]?.[0] as Record<string, unknown>)?.bounced !==
        undefined
    );
    expect(bouncedCounterUpdate).toBeUndefined();
  });

  it("resumes waiting workflow executions with 'bounced' branch", async () => {
    setupMocks({
      waitingExecutions: [
        {
          id: "exec-1",
          organizationId: "org-1",
          contactId: "contact-1",
          status: "waiting",
          waitingForEvent: "email_engagement:ses-msg-001",
          waitTimeoutSchedulerName: null,
        },
      ],
    });

    const event = buildBounceEvent({
      bounceType: "Permanent",
      bounceSubType: "Suppressed",
    });
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

  it("cancels timeout scheduler when waitTimeoutSchedulerName is set", async () => {
    setupMocks({
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

    const event = buildBounceEvent({
      bounceType: "Permanent",
      bounceSubType: "Suppressed",
    });
    await sendWebhookEvent(app, event);

    expect(deleteScheduledStep).toHaveBeenCalledWith("wraps-wf-to-timeout-1");
    expect(enqueueWorkflowStep).toHaveBeenCalledWith(
      expect.objectContaining({ executionId: "exec-1", branch: "bounced" })
    );
  });

  it("does not call enqueueWorkflowStep when no waiting executions", async () => {
    setupMocks({ waitingExecutions: [] });

    const event = buildBounceEvent({
      bounceType: "Permanent",
      bounceSubType: "Suppressed",
    });
    await sendWebhookEvent(app, event);

    expect(enqueueWorkflowStep).not.toHaveBeenCalled();
  });

  it("does not call resumeWaitingExecutions when contactId is null", async () => {
    setupMocks({ message: { contactId: null } });

    const event = buildBounceEvent({
      bounceType: "Permanent",
      bounceSubType: "Suppressed",
    });
    await sendWebhookEvent(app, event);

    expect(enqueueWorkflowStep).not.toHaveBeenCalled();
  });

  it("resumes all waiting executions when multiple are present", async () => {
    setupMocks({
      waitingExecutions: [
        {
          id: "exec-1",
          organizationId: "org-1",
          contactId: "contact-1",
          status: "waiting",
          waitingForEvent: "email_engagement:ses-msg-001",
          waitTimeoutSchedulerName: null,
        },
        {
          id: "exec-2",
          organizationId: "org-1",
          contactId: "contact-1",
          status: "waiting",
          waitingForEvent: "email_engagement:ses-msg-001",
          waitTimeoutSchedulerName: "wraps-wf-to-timeout-2",
        },
      ],
    });

    const event = buildBounceEvent({
      bounceType: "Permanent",
      bounceSubType: "Suppressed",
    });
    await sendWebhookEvent(app, event);

    expect(enqueueWorkflowStep).toHaveBeenCalledTimes(2);
    expect(enqueueWorkflowStep).toHaveBeenCalledWith(
      expect.objectContaining({ executionId: "exec-1", branch: "bounced" })
    );
    expect(enqueueWorkflowStep).toHaveBeenCalledWith(
      expect.objectContaining({ executionId: "exec-2", branch: "bounced" })
    );
    expect(deleteScheduledStep).toHaveBeenCalledWith("wraps-wf-to-timeout-2");
    expect(deleteScheduledStep).toHaveBeenCalledTimes(1);
  });

  it("still sets status='bounced' for non-Suppressed permanent bounces", async () => {
    const { updateCalls } = setupMocks();

    const event = buildBounceEvent({
      bounceType: "Permanent",
      bounceSubType: "NoEmail",
    });
    await sendWebhookEvent(app, event);

    expect(updateCalls[0].set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "bounced",
        bounceType: "Permanent",
        bounceSubType: "NoEmail",
      })
    );
  });
});
