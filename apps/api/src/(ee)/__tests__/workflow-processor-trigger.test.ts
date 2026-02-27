/**
 * Workflow Processor Trigger Tests
 *
 * Tests the `triggerWorkflow` path via `handler(type:"trigger")`.
 * Covers: reentry delay, contact cooldown, max concurrent,
 * duplicate execution conflict, and happy-path creation + enqueue.
 */

import type { SQSEvent } from "aws-lambda";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// Mock data factories
// ─────────────────────────────────────────────────────────────────────────────

function makeWorkflow(overrides: Record<string, unknown> = {}) {
  return {
    id: "wf-1",
    organizationId: "org-1",
    name: "Test Workflow",
    status: "enabled",
    triggerType: "event",
    triggerConfig: {},
    awsAccountId: "aws-1",
    allowReentry: false,
    reentryDelaySeconds: null,
    contactCooldownSeconds: null,
    maxConcurrentExecutions: null,
    steps: [
      { id: "trigger-1", type: "trigger", config: { type: "trigger" } },
      {
        id: "step-1",
        type: "webhook",
        config: {
          type: "webhook",
          url: "https://hook.example.com",
          method: "POST",
          headers: {},
          body: {},
        },
      },
    ],
    transitions: [
      {
        id: "t1",
        fromStepId: "trigger-1",
        toStepId: "step-1",
        condition: null,
      },
    ],
    defaultFrom: null,
    defaultFromName: null,
    defaultReplyTo: null,
    defaultSenderId: null,
    totalExecutions: 0,
    activeExecutions: 0,
    completedExecutions: 0,
    failedExecutions: 0,
    droppedExecutions: 0,
    lastTriggeredAt: null,
    ...overrides,
  };
}

function makeSQSEvent(...bodies: Record<string, unknown>[]): SQSEvent {
  return {
    Records: bodies.map((body, i) => ({
      messageId: `msg-${i}`,
      receiptHandle: `rh-${i}`,
      body: JSON.stringify(body),
      attributes: {
        ApproximateReceiveCount: "1",
        SentTimestamp: "0",
        SenderId: "test",
        ApproximateFirstReceiveTimestamp: "0",
      },
      messageAttributes: {},
      md5OfBody: "",
      eventSource: "aws:sqs",
      eventSourceARN: "arn:aws:sqs:us-east-1:000:test",
      awsRegion: "us-east-1",
    })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Module-level mocks (before handler import)
// ─────────────────────────────────────────────────────────────────────────────

const mockEnqueueWorkflowStep = vi.fn();
const mockEnqueueWorkflowStepBatch = vi.fn();
const mockScheduleWaitTimeout = vi.fn().mockResolvedValue("sched-wait-123");
const mockScheduleWorkflowStep = vi.fn().mockResolvedValue("sched-step-123");
const mockDeleteScheduledStep = vi.fn();
const mockCreateNextWorkflowSchedule = vi.fn();

const mockDbSelect = vi.fn();
const mockDbUpdate = vi.fn();
const mockDbInsert = vi.fn();
const mockDbTransaction = vi.fn();
const mockDbQueryWorkflowExecution = { findFirst: vi.fn() };

mockDbTransaction.mockImplementation(async (callback: Function) =>
  callback({
    select: mockDbSelect,
    update: mockDbUpdate,
    insert: mockDbInsert,
  })
);

vi.mock("@aws-sdk/client-sesv2", () => ({
  SESv2Client: vi.fn().mockImplementation(() => ({ send: vi.fn() })),
  SendEmailCommand: vi.fn(),
}));

vi.mock("@aws-sdk/client-pinpoint-sms-voice-v2", () => ({
  PinpointSMSVoiceV2Client: vi
    .fn()
    .mockImplementation(() => ({ send: vi.fn() })),
  SendTextMessageCommand: vi.fn(),
}));

vi.mock("@react-email/render", () => ({
  toPlainText: vi.fn().mockReturnValue("plain text"),
}));

vi.mock("@wraps/email", () => ({
  generateSESTemplateName: vi.fn().mockReturnValue("ses-tmpl-name"),
  transformVariablesForSes: vi.fn((s: string) => s),
  upsertSESTemplate: vi.fn(),
}));

vi.mock("handlebars", () => ({
  default: { compile: vi.fn().mockReturnValue(() => "compiled") },
}));

vi.mock("../../lib/activation-tracking", () => ({
  trackFirstEmailSent: vi.fn(),
}));

vi.mock("../../lib/logger", () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../../lib/unsubscribe-token", () => ({
  generateUnsubscribeToken: vi.fn().mockReturnValue("mock-token"),
}));

vi.mock("../../services/credentials", () => ({
  getCredentials: vi.fn().mockResolvedValue({
    accessKeyId: "AKIA",
    secretAccessKey: "secret",
    sessionToken: "tok",
  }),
}));

vi.mock("../../services/automation-queue", () => ({
  enqueueAutomationStep: mockEnqueueWorkflowStep,
  enqueueWorkflowStep: mockEnqueueWorkflowStep,
  enqueueAutomationStepBatch: mockEnqueueWorkflowStepBatch,
  enqueueWorkflowStepBatch: mockEnqueueWorkflowStepBatch,
  scheduleWaitTimeout: mockScheduleWaitTimeout,
  scheduleAutomationStep: mockScheduleWorkflowStep,
  scheduleWorkflowStep: mockScheduleWorkflowStep,
  deleteScheduledStep: mockDeleteScheduledStep,
}));

vi.mock("../../services/automation-scheduler", () => ({
  createNextAutomationSchedule: mockCreateNextWorkflowSchedule,
  createNextWorkflowSchedule: mockCreateNextWorkflowSchedule,
}));

vi.mock("@wraps/db", async () => {
  const actual = await vi.importActual("@wraps/db");
  return {
    ...actual,
    db: {
      select: mockDbSelect,
      update: mockDbUpdate,
      insert: mockDbInsert,
      transaction: mockDbTransaction,
      query: {
        workflowExecution: mockDbQueryWorkflowExecution,
      },
    },
    contactIdsMatchingCondition: vi.fn().mockResolvedValue(["c-1", "c-3"]),
    sql: (strings: TemplateStringsArray, ..._values: unknown[]) => ({
      sql: strings.join("?"),
    }),
  };
});

vi.mock("node:dns/promises", () => ({
  default: {
    lookup: vi.fn().mockResolvedValue({ address: "93.184.216.34", family: 4 }),
  },
  lookup: vi.fn().mockResolvedValue({ address: "93.184.216.34", family: 4 }),
}));

// Import handler AFTER all mocks are set up
const { handler } = await import("../workers/workflow-processor");

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockDbTransaction.mockImplementation(async (callback: Function) =>
    callback({
      select: mockDbSelect,
      update: mockDbUpdate,
      insert: mockDbInsert,
    })
  );
});

const triggerJob = {
  type: "trigger" as const,
  workflowId: "wf-1",
  contactId: "contact-1",
  organizationId: "org-1",
};

describe("triggerWorkflow", () => {
  it("returns early when workflow not found", async () => {
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    await handler(makeSQSEvent(triggerJob));

    expect(mockDbInsert).not.toHaveBeenCalled();
    expect(mockEnqueueWorkflowStep).not.toHaveBeenCalled();
  });

  it("returns early when workflow disabled", async () => {
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi
            .fn()
            .mockResolvedValue([makeWorkflow({ status: "paused" })]),
        }),
      }),
    });

    await handler(makeSQSEvent(triggerJob));

    expect(mockDbInsert).not.toHaveBeenCalled();
  });

  it("skips when reentry delay is active", async () => {
    const wf = makeWorkflow({
      allowReentry: false,
      reentryDelaySeconds: 3600,
    });

    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([wf]),
        }),
      }),
    });

    // db.query.workflowExecution.findFirst → found a recent completion
    mockDbQueryWorkflowExecution.findFirst.mockResolvedValue({
      id: "exec-old",
      status: "completed",
      completedAt: new Date(),
    });

    // update for incrementDroppedExecutions
    mockDbUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });

    await handler(makeSQSEvent(triggerJob));

    // Should increment dropped, not create execution
    expect(mockDbUpdate).toHaveBeenCalled();
    expect(mockDbInsert).not.toHaveBeenCalled();
    expect(mockEnqueueWorkflowStep).not.toHaveBeenCalled();
  });

  it("proceeds when reentry delay has expired", async () => {
    const wf = makeWorkflow({
      allowReentry: false,
      reentryDelaySeconds: 3600,
    });

    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([wf]),
        }),
      }),
    });

    // No recent completion found → reentry delay not active
    mockDbQueryWorkflowExecution.findFirst.mockResolvedValue(null);

    // insert execution
    mockDbInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: "exec-new" }]),
        }),
      }),
    });

    // update workflow stats
    mockDbUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });

    await handler(makeSQSEvent(triggerJob));

    expect(mockDbInsert).toHaveBeenCalled();
    expect(mockEnqueueWorkflowStep).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "execute",
        executionId: "exec-new",
        stepId: "step-1",
      })
    );
  });

  it("skips when contact cooldown is active", async () => {
    const wf = makeWorkflow({ contactCooldownSeconds: 7200 });

    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([wf]),
        }),
      }),
    });

    // findFirst call: cooldown check → found a recent execution
    mockDbQueryWorkflowExecution.findFirst.mockResolvedValue({
      id: "exec-recent",
      createdAt: new Date(),
    });

    mockDbUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });

    await handler(makeSQSEvent(triggerJob));

    expect(mockDbInsert).not.toHaveBeenCalled();
    expect(mockEnqueueWorkflowStep).not.toHaveBeenCalled();
  });

  it("skips when max concurrent reached", async () => {
    const wf = makeWorkflow({ maxConcurrentExecutions: 5 });

    let selectCallCount = 0;
    mockDbSelect.mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) {
        // Load workflow
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([wf]),
            }),
          }),
        };
      }
      // Count query returns 5 (at limit)
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 5 }]),
        }),
      };
    });

    mockDbUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });

    await handler(makeSQSEvent(triggerJob));

    expect(mockDbInsert).not.toHaveBeenCalled();
    expect(mockEnqueueWorkflowStep).not.toHaveBeenCalled();
  });

  it("returns early when no trigger step in workflow", async () => {
    const wf = makeWorkflow({
      steps: [
        {
          id: "step-1",
          type: "webhook",
          config: { type: "webhook", url: "https://x.com", method: "POST" },
        },
      ],
    });

    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([wf]),
        }),
      }),
    });

    await handler(makeSQSEvent(triggerJob));

    expect(mockDbInsert).not.toHaveBeenCalled();
  });

  it("returns early when no first transition from trigger", async () => {
    const wf = makeWorkflow({ transitions: [] });

    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([wf]),
        }),
      }),
    });

    await handler(makeSQSEvent(triggerJob));

    expect(mockDbInsert).not.toHaveBeenCalled();
  });

  it("skips on duplicate execution conflict", async () => {
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([makeWorkflow()]),
        }),
      }),
    });

    // insert returns empty → onConflictDoNothing triggered
    mockDbInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    // incrementDroppedExecutions
    mockDbUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });

    await handler(makeSQSEvent(triggerJob));

    expect(mockEnqueueWorkflowStep).not.toHaveBeenCalled();
    // Should have called update for incrementDroppedExecutions
    expect(mockDbUpdate).toHaveBeenCalled();
  });

  it("happy path: creates execution, updates stats, enqueues first step", async () => {
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([makeWorkflow()]),
        }),
      }),
    });

    mockDbInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockReturnValue({
          returning: vi
            .fn()
            .mockResolvedValue([
              { id: "exec-new", workflowId: "wf-1", contactId: "contact-1" },
            ]),
        }),
      }),
    });

    mockDbUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });

    await handler(makeSQSEvent(triggerJob));

    // Should insert execution
    expect(mockDbInsert).toHaveBeenCalled();

    // Should update workflow stats
    expect(mockDbUpdate).toHaveBeenCalled();

    // Should enqueue the first step after trigger
    expect(mockEnqueueWorkflowStep).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "execute",
        executionId: "exec-new",
        stepId: "step-1",
        organizationId: "org-1",
      })
    );
  });

  it("passes eventData as triggerData to execution", async () => {
    const jobWithEvent = {
      ...triggerJob,
      eventData: { source: "api", userId: "u-1" },
    };

    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([makeWorkflow()]),
        }),
      }),
    });

    const insertValuesSpy = vi.fn().mockReturnValue({
      onConflictDoNothing: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: "exec-new" }]),
      }),
    });
    mockDbInsert.mockReturnValue({ values: insertValuesSpy });

    mockDbUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });

    await handler(makeSQSEvent(jobWithEvent));

    const insertedValues = insertValuesSpy.mock.calls[0][0];
    expect(insertedValues.triggerData).toEqual({
      source: "api",
      userId: "u-1",
    });
  });
});
