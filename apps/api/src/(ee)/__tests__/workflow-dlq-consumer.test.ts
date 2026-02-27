/**
 * Workflow DLQ Consumer Tests
 *
 * Verifies the dead-letter queue consumer correctly marks failed executions
 * in the database without ever throwing (which would cause pointless SQS retries).
 */

import type { SQSEvent } from "aws-lambda";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeSQSEvent(...bodies: Record<string, unknown>[]): SQSEvent {
  return {
    Records: bodies.map((body, i) => ({
      messageId: `msg-${i}`,
      receiptHandle: `rh-${i}`,
      body: JSON.stringify(body),
      attributes: {
        ApproximateReceiveCount: "4",
        SentTimestamp: "0",
        SenderId: "test",
        ApproximateFirstReceiveTimestamp: "0",
      },
      messageAttributes: {},
      md5OfBody: "",
      eventSource: "aws:sqs",
      eventSourceARN: "arn:aws:sqs:us-east-1:000:test-dlq",
      awsRegion: "us-east-1",
    })),
  };
}

/** db.update().set().where().returning() */
function updateChainReturning(rows: unknown[]) {
  return vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(rows),
      }),
    }),
  });
}

/** db.update().set().where() — void return */
function updateChainVoid() {
  return vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  });
}

/** db.select().from().where().limit() */
function selectChain(rows: unknown[]) {
  return vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(rows),
      }),
    }),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────────────────────────────────────

const mockDbSelect = vi.fn();
const mockDbUpdate = vi.fn();
const mockCreateNextWorkflowSchedule = vi.fn();

vi.mock("../../services/automation-scheduler", () => ({
  createNextAutomationSchedule: mockCreateNextWorkflowSchedule,
  createNextWorkflowSchedule: mockCreateNextWorkflowSchedule,
}));

vi.mock("../../lib/logger", () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@wraps/db", async () => {
  const actual = await vi.importActual("@wraps/db");
  return {
    ...actual,
    db: {
      select: mockDbSelect,
      update: mockDbUpdate,
    },
    sql: (strings: TemplateStringsArray, ..._values: unknown[]) => ({
      sql: strings.join("?"),
    }),
  };
});

const { handler } = await import("../workers/workflow-dlq-consumer");
const { log } = await import("../../lib/logger");

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe("execute job", () => {
  it("marks execution as failed and updates workflow counters", async () => {
    // First call: update execution (returning)
    // Second call: update workflow counters (void)
    let callCount = 0;
    mockDbUpdate.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return updateChainReturning([{ id: "exec-1", workflowId: "wf-1" }])();
      }
      return updateChainVoid()();
    });

    const event = makeSQSEvent({
      type: "execute",
      executionId: "exec-1",
      stepId: "step-1",
      organizationId: "org-1",
    });

    await handler(event, {} as never, () => {});

    expect(mockDbUpdate).toHaveBeenCalledTimes(2);
    expect(log.warn).toHaveBeenCalledWith(
      "DLQ: processing failed job",
      expect.objectContaining({ type: "execute" })
    );
    expect(log.warn).toHaveBeenCalledWith(
      "DLQ: execution marked as failed",
      expect.objectContaining({ executionId: "exec-1" })
    );
  });

  it("logs warning when execution not found (no rows returned)", async () => {
    mockDbUpdate.mockImplementation(() => updateChainReturning([])());

    const event = makeSQSEvent({
      type: "execute",
      executionId: "exec-missing",
      stepId: "step-1",
      organizationId: "org-1",
    });

    await handler(event, {} as never, () => {});

    expect(log.warn).toHaveBeenCalledWith(
      "DLQ: failExecution returned no rows",
      expect.objectContaining({ executionId: "exec-missing" })
    );
  });
});

describe("resume job", () => {
  it("loads execution and marks it as failed", async () => {
    mockDbSelect.mockImplementation(() =>
      selectChain([
        { id: "exec-1", status: "waiting", currentStepId: "step-2" },
      ])()
    );

    let updateCallCount = 0;
    mockDbUpdate.mockImplementation(() => {
      updateCallCount++;
      if (updateCallCount === 1) {
        return updateChainReturning([{ id: "exec-1", workflowId: "wf-1" }])();
      }
      return updateChainVoid()();
    });

    const event = makeSQSEvent({
      type: "resume",
      executionId: "exec-1",
      branch: "timeout",
      organizationId: "org-1",
    });

    await handler(event, {} as never, () => {});

    expect(mockDbSelect).toHaveBeenCalled();
    expect(mockDbUpdate).toHaveBeenCalledTimes(2);
  });

  it("skips already-completed execution", async () => {
    mockDbSelect.mockImplementation(() =>
      selectChain([
        { id: "exec-1", status: "completed", currentStepId: "step-2" },
      ])()
    );

    const event = makeSQSEvent({
      type: "resume",
      executionId: "exec-1",
      branch: "timeout",
      organizationId: "org-1",
    });

    await handler(event, {} as never, () => {});

    expect(mockDbUpdate).not.toHaveBeenCalled();
    expect(log.info).toHaveBeenCalledWith(
      "DLQ: resume — execution already terminal",
      expect.objectContaining({ executionId: "exec-1", status: "completed" })
    );
  });

  it("logs warning when execution not found", async () => {
    mockDbSelect.mockImplementation(() => selectChain([])());

    const event = makeSQSEvent({
      type: "resume",
      executionId: "exec-missing",
      branch: "timeout",
      organizationId: "org-1",
    });

    await handler(event, {} as never, () => {});

    expect(mockDbUpdate).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledWith(
      "DLQ: resume — execution not found",
      expect.objectContaining({ executionId: "exec-missing" })
    );
  });
});

describe("trigger job", () => {
  it("finds active execution and marks it failed", async () => {
    mockDbSelect.mockImplementation(() =>
      selectChain([{ id: "exec-1", status: "active" }])()
    );

    let updateCallCount = 0;
    mockDbUpdate.mockImplementation(() => {
      updateCallCount++;
      if (updateCallCount === 1) {
        return updateChainReturning([{ id: "exec-1", workflowId: "wf-1" }])();
      }
      return updateChainVoid()();
    });

    const event = makeSQSEvent({
      type: "trigger",
      workflowId: "wf-1",
      contactId: "contact-1",
      organizationId: "org-1",
    });

    await handler(event, {} as never, () => {});

    expect(mockDbUpdate).toHaveBeenCalledTimes(2);
  });

  it("logs only when no active execution found", async () => {
    mockDbSelect.mockImplementation(() => selectChain([])());

    const event = makeSQSEvent({
      type: "trigger",
      workflowId: "wf-1",
      contactId: "contact-1",
      organizationId: "org-1",
    });

    await handler(event, {} as never, () => {});

    expect(mockDbUpdate).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledWith(
      "DLQ: trigger — no active execution found, nothing to fail",
      expect.objectContaining({ workflowId: "wf-1", contactId: "contact-1" })
    );
  });
});

describe("schedule-trigger job", () => {
  it("loads workflow and re-creates schedule chain", async () => {
    mockDbSelect.mockImplementation(() =>
      selectChain([
        {
          id: "wf-1",
          organizationId: "org-1",
          status: "enabled",
          triggerType: "schedule",
          triggerConfig: {
            schedule: "0 9 * * 1",
            timezone: "America/New_York",
          },
        },
      ])()
    );

    mockCreateNextWorkflowSchedule.mockResolvedValue("wraps-wf-sched-wf-1");

    const event = makeSQSEvent({
      type: "schedule-trigger",
      workflowId: "wf-1",
      organizationId: "org-1",
    });

    await handler(event, {} as never, () => {});

    expect(mockDbSelect).toHaveBeenCalled();
    expect(mockCreateNextWorkflowSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: "wf-1",
        cronExpression: "0 9 * * 1",
        timezone: "America/New_York",
      })
    );
    expect(log.info).toHaveBeenCalledWith(
      "DLQ: schedule-trigger — chain repaired",
      expect.objectContaining({ workflowId: "wf-1" })
    );
  });

  it("skips chain repair when workflow not enabled", async () => {
    mockDbSelect.mockImplementation(() =>
      selectChain([
        {
          id: "wf-1",
          organizationId: "org-1",
          status: "disabled",
          triggerType: "schedule",
          triggerConfig: { schedule: "0 9 * * 1" },
        },
      ])()
    );

    const event = makeSQSEvent({
      type: "schedule-trigger",
      workflowId: "wf-1",
      organizationId: "org-1",
    });

    await handler(event, {} as never, () => {});

    expect(mockCreateNextWorkflowSchedule).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledWith(
      "DLQ: schedule-trigger — workflow not eligible for chain repair",
      expect.objectContaining({ workflowId: "wf-1", status: "disabled" })
    );
  });

  it("catches chain repair failure without throwing", async () => {
    mockDbSelect.mockImplementation(() =>
      selectChain([
        {
          id: "wf-1",
          organizationId: "org-1",
          status: "enabled",
          triggerType: "schedule",
          triggerConfig: { schedule: "0 9 * * 1" },
        },
      ])()
    );

    mockCreateNextWorkflowSchedule.mockRejectedValueOnce(
      new Error("Scheduler throttled")
    );

    const event = makeSQSEvent({
      type: "schedule-trigger",
      workflowId: "wf-1",
      organizationId: "org-1",
    });

    // Should not throw
    await handler(event, {} as never, () => {});

    expect(log.error).toHaveBeenCalledWith(
      "DLQ: schedule-trigger — chain repair failed",
      expect.any(Error),
      expect.objectContaining({ workflowId: "wf-1" })
    );
  });
});

describe("error resilience", () => {
  it("catches malformed message body without throwing", async () => {
    const event: SQSEvent = {
      Records: [
        {
          messageId: "msg-bad",
          receiptHandle: "rh-bad",
          body: "not valid json {{{",
          attributes: {
            ApproximateReceiveCount: "4",
            SentTimestamp: "0",
            SenderId: "test",
            ApproximateFirstReceiveTimestamp: "0",
          },
          messageAttributes: {},
          md5OfBody: "",
          eventSource: "aws:sqs",
          eventSourceARN: "arn:aws:sqs:us-east-1:000:test-dlq",
          awsRegion: "us-east-1",
        },
      ],
    };

    // Should not throw
    await handler(event, {} as never, () => {});

    expect(log.error).toHaveBeenCalledWith(
      "DLQ: failed to process record",
      expect.anything(),
      expect.objectContaining({ messageId: "msg-bad" })
    );
  });

  it("catches DB error during processing without throwing", async () => {
    mockDbUpdate.mockImplementation(() => ({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue(new Error("DB connection lost")),
        }),
      }),
    }));

    const event = makeSQSEvent({
      type: "execute",
      executionId: "exec-1",
      stepId: "step-1",
      organizationId: "org-1",
    });

    // Should not throw
    await handler(event, {} as never, () => {});

    expect(log.error).toHaveBeenCalledWith(
      "DLQ: failed to process record",
      expect.anything(),
      expect.objectContaining({ messageId: "msg-0" })
    );
  });
});
