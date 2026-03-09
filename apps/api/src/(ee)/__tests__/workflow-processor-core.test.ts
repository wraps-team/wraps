/**
 * Workflow Processor Core Tests
 *
 * Tests the real `handler` function (SQS Lambda entry point) with mocked
 * dependencies. Covers 4 critical flows:
 *   1. Schedule trigger fan-out
 *   2. Wait-for-event resume
 *   3. Concurrent resume race condition
 *   4. Webhook step execution
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
    triggerType: "schedule",
    triggerConfig: { schedule: "0 9 * * 1", timezone: "UTC" },
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

function makeExecution(overrides: Record<string, unknown> = {}) {
  return {
    id: "exec-1",
    workflowId: "wf-1",
    contactId: "contact-1",
    organizationId: "org-1",
    status: "active",
    currentStepId: "step-1",
    triggerData: {},
    startedAt: new Date(),
    completedAt: null,
    error: null,
    errorStepId: null,
    allowReentry: false,
    waitingForEvent: null,
    waitTimeoutAt: null,
    waitTimeoutSchedulerName: null,
    delaySchedulerName: null,
    nextStepScheduledAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeContact(overrides: Record<string, unknown> = {}) {
  return {
    id: "contact-1",
    email: "test@example.com",
    phone: null,
    firstName: "Test",
    lastName: "User",
    company: null,
    jobTitle: null,
    organizationId: "org-1",
    emailStatus: "active",
    status: "active",
    properties: {},
    preferredChannel: null,
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
// Drizzle chain helpers
// ─────────────────────────────────────────────────────────────────────────────

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

/** db.select().from().where().orderBy().limit() */
function selectOrderByChain(rows: unknown[]) {
  return vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(rows),
        }),
        limit: vi.fn().mockResolvedValue(rows),
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

/** db.insert().values().onConflictDoNothing().returning() */
function insertChainConflictDoNothing(rows: unknown[]) {
  return vi.fn().mockReturnValue({
    values: vi.fn().mockReturnValue({
      onConflictDoNothing: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(rows),
      }),
    }),
  });
}

/** db.insert().values().onConflictDoUpdate().returning() */
function insertChainConflictDoUpdate(rows: unknown[]) {
  return vi.fn().mockReturnValue({
    values: vi.fn().mockReturnValue({
      onConflictDoUpdate: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(rows),
      }),
    }),
  });
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
const mockFetch = vi.fn();

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
  flushLogger: vi.fn().mockResolvedValue(undefined),
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

vi.mock("../../services/workflow-queue", () => ({
  enqueueWorkflowStep: mockEnqueueWorkflowStep,
  enqueueWorkflowStepBatch: mockEnqueueWorkflowStepBatch,
  scheduleWaitTimeout: mockScheduleWaitTimeout,
  scheduleWorkflowStep: mockScheduleWorkflowStep,
  deleteScheduledStep: mockDeleteScheduledStep,
}));

vi.mock("../../services/workflow-scheduler", () => ({
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

vi.stubGlobal("fetch", mockFetch);

// Import handler AFTER all mocks are set up
const { handler } = await import("../workers/workflow-processor");

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockReset();
  mockDbTransaction.mockImplementation(async (callback: Function) =>
    callback({
      select: mockDbSelect,
      update: mockDbUpdate,
      insert: mockDbInsert,
    })
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// Suite 1: Schedule Trigger Fan-out
// ═══════════════════════════════════════════════════════════════════════════

describe("Schedule Trigger Fan-out", () => {
  const scheduleJob = {
    type: "schedule-trigger" as const,
    workflowId: "wf-1",
    organizationId: "org-1",
  };

  function setupScheduleWorkflow(
    wfOverrides: Record<string, unknown> = {},
    contacts: { id: string }[] = [{ id: "c-1" }, { id: "c-2" }, { id: "c-3" }]
  ) {
    const wf = makeWorkflow(wfOverrides);

    // 1st select: load workflow
    // 2nd select: load contacts
    let callCount = 0;
    mockDbSelect.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // Workflow select chain
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([wf]),
            }),
          }),
        };
      }
      // Contacts select chain
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(contacts),
          }),
        }),
      };
    });

    // update: lastTriggeredAt
    mockDbUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });

    return wf;
  }

  it("fans out trigger jobs for all contacts", async () => {
    setupScheduleWorkflow();

    await handler(makeSQSEvent(scheduleJob));

    expect(mockEnqueueWorkflowStepBatch).toHaveBeenCalledOnce();
    const batch = mockEnqueueWorkflowStepBatch.mock.calls[0][0];
    expect(batch).toHaveLength(3);
    expect(batch.map((j: { contactId: string }) => j.contactId)).toEqual([
      "c-1",
      "c-2",
      "c-3",
    ]);
    for (const job of batch) {
      expect(job.type).toBe("trigger");
      expect(job.workflowId).toBe("wf-1");
      expect(job.organizationId).toBe("org-1");
    }
  });

  it("uses segment contacts when segmentId configured", async () => {
    const { contactIdsMatchingCondition } = await import("@wraps/db");

    // Workflow with segment
    const wf = makeWorkflow({
      triggerConfig: {
        schedule: "0 9 * * 1",
        timezone: "UTC",
        segmentId: "seg-1",
      },
    });

    let callCount = 0;
    mockDbSelect.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // Load workflow
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([wf]),
            }),
          }),
        };
      }
      if (callCount === 2) {
        // Load segment condition
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi
                .fn()
                .mockResolvedValue([{ condition: { field: "email" } }]),
            }),
          }),
        };
      }
      // Load all contacts for segment evaluation
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi
              .fn()
              .mockResolvedValue([{ id: "c-1" }, { id: "c-2" }, { id: "c-3" }]),
          }),
        }),
      };
    });

    mockDbUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });

    await handler(makeSQSEvent(scheduleJob));

    expect(contactIdsMatchingCondition).toHaveBeenCalled();
    expect(mockEnqueueWorkflowStepBatch).toHaveBeenCalledOnce();
    const batch = mockEnqueueWorkflowStepBatch.mock.calls[0][0];
    // Only c-1 and c-3 match (per mock)
    expect(batch).toHaveLength(2);
    expect(batch.map((j: { contactId: string }) => j.contactId)).toEqual([
      "c-1",
      "c-3",
    ]);
  });

  it("handles zero contacts", async () => {
    setupScheduleWorkflow({}, []);

    await handler(makeSQSEvent(scheduleJob));

    expect(mockEnqueueWorkflowStepBatch).toHaveBeenCalledWith([]);
  });

  it("returns early when workflow not found", async () => {
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    await handler(makeSQSEvent(scheduleJob));

    expect(mockEnqueueWorkflowStepBatch).not.toHaveBeenCalled();
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

    await handler(makeSQSEvent(scheduleJob));

    expect(mockEnqueueWorkflowStepBatch).not.toHaveBeenCalled();
  });

  it("returns early when triggerType is not schedule", async () => {
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi
            .fn()
            .mockResolvedValue([makeWorkflow({ triggerType: "event" })]),
        }),
      }),
    });

    await handler(makeSQSEvent(scheduleJob));

    expect(mockEnqueueWorkflowStepBatch).not.toHaveBeenCalled();
  });

  it("returns early when no cron schedule", async () => {
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi
            .fn()
            .mockResolvedValue([makeWorkflow({ triggerConfig: {} })]),
        }),
      }),
    });

    await handler(makeSQSEvent(scheduleJob));

    expect(mockEnqueueWorkflowStepBatch).not.toHaveBeenCalled();
  });

  it("chains next schedule after processing", async () => {
    setupScheduleWorkflow();

    await handler(makeSQSEvent(scheduleJob));

    expect(mockCreateNextWorkflowSchedule).toHaveBeenCalledWith({
      workflowId: "wf-1",
      organizationId: "org-1",
      cronExpression: "0 9 * * 1",
      timezone: "UTC",
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Suite 2: Wait-for-Event Resume Flow
// ═══════════════════════════════════════════════════════════════════════════

describe("Wait-for-Event Resume Flow", () => {
  function setupExecuteWaitForEvent() {
    const wf = makeWorkflow({
      steps: [
        { id: "trigger-1", type: "trigger", config: { type: "trigger" } },
        {
          id: "step-wait",
          type: "wait_for_event",
          config: {
            type: "wait_for_event",
            eventName: "user.upgraded",
            timeoutSeconds: 7200,
          },
        },
        {
          id: "step-2",
          type: "webhook",
          config: {
            type: "webhook",
            url: "https://hook.example.com",
            method: "POST",
          },
        },
      ],
      transitions: [
        {
          id: "t1",
          fromStepId: "trigger-1",
          toStepId: "step-wait",
          condition: null,
        },
        {
          id: "t2",
          fromStepId: "step-wait",
          toStepId: "step-2",
          condition: { branch: "default" },
        },
      ],
    });

    const execution = makeExecution({
      currentStepId: "step-wait",
      status: "active",
    });
    const contactRecord = makeContact();

    // db.query.workflowExecution.findFirst → execution
    mockDbQueryWorkflowExecution.findFirst.mockResolvedValue(execution);

    // 1st select: load workflow, 2nd select: load contact
    let selectCount = 0;
    mockDbSelect.mockImplementation(() => {
      selectCount++;
      if (selectCount === 1) {
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([wf]),
            }),
          }),
        };
      }
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([contactRecord]),
          }),
        }),
      };
    });

    // insert: step execution (onConflictDoUpdate → returning)
    mockDbInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              id: "se-1",
              status: "executing",
              idempotencyKey: "exec-1-step-wait",
            },
          ]),
        }),
      }),
    });

    // update calls (execution status, step completion)
    mockDbUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([execution]),
        }),
      }),
    });

    return { wf, execution };
  }

  it("schedules timeout and sets execution to waiting", async () => {
    setupExecuteWaitForEvent();

    await handler(
      makeSQSEvent({
        type: "execute",
        executionId: "exec-1",
        stepId: "step-wait",
        organizationId: "org-1",
      })
    );

    expect(mockScheduleWaitTimeout).toHaveBeenCalledWith(
      expect.objectContaining({
        executionId: "exec-1",
        stepId: "step-wait",
        organizationId: "org-1",
        timeoutSeconds: 7200,
      })
    );
  });

  it("uses default 24h timeout when not configured", async () => {
    const wf = makeWorkflow({
      steps: [
        { id: "trigger-1", type: "trigger", config: { type: "trigger" } },
        {
          id: "step-wait",
          type: "wait_for_event",
          config: {
            type: "wait_for_event",
            eventName: "user.upgraded",
            // no timeoutSeconds → default 86400
          },
        },
      ],
      transitions: [
        {
          id: "t1",
          fromStepId: "trigger-1",
          toStepId: "step-wait",
          condition: null,
        },
      ],
    });

    const execution = makeExecution({ currentStepId: "step-wait" });
    mockDbQueryWorkflowExecution.findFirst.mockResolvedValue(execution);

    let selectCount = 0;
    mockDbSelect.mockImplementation(() => {
      selectCount++;
      if (selectCount === 1) {
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([wf]),
            }),
          }),
        };
      }
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([makeContact()]),
          }),
        }),
      };
    });

    mockDbInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              id: "se-1",
              status: "executing",
              idempotencyKey: "exec-1-step-wait",
            },
          ]),
        }),
      }),
    });

    mockDbUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([execution]),
        }),
      }),
    });

    await handler(
      makeSQSEvent({
        type: "execute",
        executionId: "exec-1",
        stepId: "step-wait",
        organizationId: "org-1",
      })
    );

    expect(mockScheduleWaitTimeout).toHaveBeenCalledWith(
      expect.objectContaining({ timeoutSeconds: 86_400 })
    );
  });

  it("resumes execution and processes next step", async () => {
    const wf = makeWorkflow({
      steps: [
        { id: "trigger-1", type: "trigger", config: { type: "trigger" } },
        {
          id: "step-wait",
          type: "wait_for_event",
          config: { type: "wait_for_event", eventName: "user.upgraded" },
        },
        {
          id: "step-2",
          type: "webhook",
          config: {
            type: "webhook",
            url: "https://example.com",
            method: "POST",
          },
        },
      ],
      transitions: [
        {
          id: "t1",
          fromStepId: "step-wait",
          toStepId: "step-2",
          condition: { branch: "default" },
        },
      ],
    });

    const claimedExecution = makeExecution({
      status: "active",
      currentStepId: "step-wait",
      waitTimeoutSchedulerName: "sched-timeout-abc",
    });

    // Atomic claim: update...returning
    mockDbUpdate.mockImplementation(() => ({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([claimedExecution]),
        }),
      }),
    }));

    // Load workflow
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([wf]),
        }),
      }),
    });

    await handler(
      makeSQSEvent({
        type: "resume",
        executionId: "exec-1",
        branch: "default",
      })
    );

    expect(mockEnqueueWorkflowStep).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "execute",
        executionId: "exec-1",
        stepId: "step-2",
      })
    );
  });

  it("cancels timeout scheduler on event resume", async () => {
    const wf = makeWorkflow({
      steps: [
        {
          id: "step-wait",
          type: "wait_for_event",
          config: { type: "wait_for_event", eventName: "x" },
        },
        {
          id: "step-2",
          type: "webhook",
          config: { type: "webhook", url: "https://x.com", method: "POST" },
        },
      ],
      transitions: [
        {
          id: "t1",
          fromStepId: "step-wait",
          toStepId: "step-2",
          condition: { branch: "default" },
        },
      ],
    });

    const claimedExecution = makeExecution({
      currentStepId: "step-wait",
      waitTimeoutSchedulerName: "sched-timeout-xyz",
    });

    mockDbUpdate.mockImplementation(() => ({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([claimedExecution]),
        }),
      }),
    }));

    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([wf]),
        }),
      }),
    });

    await handler(
      makeSQSEvent({
        type: "resume",
        executionId: "exec-1",
        branch: "default",
      })
    );

    expect(mockDeleteScheduledStep).toHaveBeenCalledWith("sched-timeout-xyz");
  });

  it("does NOT cancel timeout on timeout resume", async () => {
    const wf = makeWorkflow({
      steps: [
        {
          id: "step-wait",
          type: "wait_for_event",
          config: { type: "wait_for_event", eventName: "x" },
        },
      ],
      transitions: [],
    });

    const claimedExecution = makeExecution({
      currentStepId: "step-wait",
      waitTimeoutSchedulerName: "sched-timeout-xyz",
    });

    mockDbUpdate.mockImplementation(() => ({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([claimedExecution]),
        }),
      }),
    }));

    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([wf]),
        }),
      }),
    });

    await handler(
      makeSQSEvent({
        type: "resume",
        executionId: "exec-1",
        branch: "timeout",
      })
    );

    expect(mockDeleteScheduledStep).not.toHaveBeenCalled();
  });

  it("completes execution when no matching transition", async () => {
    const wf = makeWorkflow({
      steps: [
        {
          id: "step-wait",
          type: "wait_for_event",
          config: { type: "wait_for_event", eventName: "x" },
        },
      ],
      transitions: [], // no transitions → completeExecution
    });

    const claimedExecution = makeExecution({
      currentStepId: "step-wait",
      waitTimeoutSchedulerName: null,
    });

    // First update call: atomic claim → returns claimed
    // Second update call: step execution completion
    // Third update call: completeExecution → set status=completed
    // Fourth update call: workflow stats
    let updateCount = 0;
    mockDbUpdate.mockImplementation(() => {
      updateCount++;
      return {
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([claimedExecution]),
          }),
        }),
      };
    });

    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([wf]),
        }),
      }),
    });

    await handler(
      makeSQSEvent({
        type: "resume",
        executionId: "exec-1",
        branch: "timeout",
      })
    );

    // completeExecution should be called (no enqueue for next step)
    expect(mockEnqueueWorkflowStep).not.toHaveBeenCalled();
    // At least 3 update calls: claim, step completion, complete execution
    expect(mockDbUpdate).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Suite 3: Concurrent Resume Race Condition
// ═══════════════════════════════════════════════════════════════════════════

describe("Concurrent Resume Race Condition", () => {
  it("first caller claims and processes", async () => {
    const wf = makeWorkflow({
      steps: [
        {
          id: "step-wait",
          type: "wait_for_event",
          config: { type: "wait_for_event", eventName: "x" },
        },
        {
          id: "step-2",
          type: "webhook",
          config: { type: "webhook", url: "https://x.com", method: "POST" },
        },
      ],
      transitions: [
        {
          id: "t1",
          fromStepId: "step-wait",
          toStepId: "step-2",
          condition: { branch: "default" },
        },
      ],
    });

    const claimed = makeExecution({
      currentStepId: "step-wait",
      waitTimeoutSchedulerName: null,
    });

    mockDbUpdate.mockImplementation(() => ({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([claimed]),
        }),
      }),
    }));

    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([wf]),
        }),
      }),
    });

    await handler(
      makeSQSEvent({
        type: "resume",
        executionId: "exec-1",
        branch: "default",
      })
    );

    expect(mockEnqueueWorkflowStep).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "execute",
        stepId: "step-2",
      })
    );
  });

  it("second caller bails out when already claimed", async () => {
    // Atomic UPDATE returns [] — another handler already transitioned it
    mockDbUpdate.mockImplementation(() => ({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    }));

    await handler(
      makeSQSEvent({
        type: "resume",
        executionId: "exec-1",
        branch: "default",
      })
    );

    expect(mockEnqueueWorkflowStep).not.toHaveBeenCalled();
    expect(mockDbSelect).not.toHaveBeenCalled();
  });

  it("two resume jobs in same SQS batch — only first processes", async () => {
    const wf = makeWorkflow({
      steps: [
        {
          id: "step-wait",
          type: "wait_for_event",
          config: { type: "wait_for_event", eventName: "x" },
        },
        {
          id: "step-2",
          type: "webhook",
          config: { type: "webhook", url: "https://x.com", method: "POST" },
        },
      ],
      transitions: [
        {
          id: "t1",
          fromStepId: "step-wait",
          toStepId: "step-2",
          condition: { branch: "default" },
        },
      ],
    });

    const claimed = makeExecution({
      currentStepId: "step-wait",
      waitTimeoutSchedulerName: null,
    });

    // First resume succeeds (returns row), second returns [] (already claimed)
    let resumeCallCount = 0;
    mockDbUpdate.mockImplementation(() => ({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockImplementation(() => {
            resumeCallCount++;
            // First 2 update calls are from the first resume:
            //   1) atomic claim (returns row)
            //   2) step execution update
            // 3rd update call is from processNextStep's enqueue
            // But when the 2nd SQS record is processed, the claim returns []
            if (resumeCallCount === 1) return Promise.resolve([claimed]);
            if (resumeCallCount >= 3) return Promise.resolve([]);
            return Promise.resolve([claimed]);
          }),
        }),
      }),
    }));

    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([wf]),
        }),
      }),
    });

    const event = makeSQSEvent(
      { type: "resume", executionId: "exec-1", branch: "default" },
      { type: "resume", executionId: "exec-1", branch: "timeout" }
    );

    await handler(event);

    // Only one enqueue from the first resume
    expect(mockEnqueueWorkflowStep).toHaveBeenCalledTimes(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Suite 4: Webhook Step
// ═══════════════════════════════════════════════════════════════════════════

describe("Webhook Step", () => {
  function setupWebhookExecution(
    webhookConfig: Record<string, unknown> = {},
    contactOverrides: Record<string, unknown> = {}
  ) {
    const wf = makeWorkflow({
      steps: [
        { id: "trigger-1", type: "trigger", config: { type: "trigger" } },
        {
          id: "step-hook",
          type: "webhook",
          config: {
            type: "webhook",
            url: "https://hook.example.com/callback",
            method: "POST",
            headers: {},
            body: {},
            ...webhookConfig,
          },
        },
      ],
      transitions: [
        {
          id: "t1",
          fromStepId: "trigger-1",
          toStepId: "step-hook",
          condition: null,
        },
      ],
    });

    const execution = makeExecution({ currentStepId: "step-hook" });
    const contactRecord = makeContact(contactOverrides);

    mockDbQueryWorkflowExecution.findFirst.mockResolvedValue(execution);

    let selectCount = 0;
    mockDbSelect.mockImplementation(() => {
      selectCount++;
      if (selectCount === 1) {
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([wf]),
            }),
          }),
        };
      }
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([contactRecord]),
          }),
        }),
      };
    });

    // insert: step execution
    mockDbInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi
            .fn()
            .mockResolvedValue([{ id: "se-1", status: "executing" }]),
        }),
      }),
    });

    // update calls
    mockDbUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([execution]),
        }),
      }),
    });

    return { wf, execution, contactRecord };
  }

  const executeJob = {
    type: "execute" as const,
    executionId: "exec-1",
    stepId: "step-hook",
    organizationId: "org-1",
  };

  it("sends POST with contact/execution data", async () => {
    setupWebhookExecution();
    mockFetch.mockResolvedValue({ status: 200, ok: true });

    await handler(makeSQSEvent(executeJob));

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("https://hook.example.com/callback");
    expect(opts.method).toBe("POST");

    const body = JSON.parse(opts.body);
    expect(body.contact.id).toBe("contact-1");
    expect(body.execution.id).toBe("exec-1");
    expect(body.execution.workflowId).toBe("wf-1");
  });

  it("sends GET without body", async () => {
    setupWebhookExecution({ method: "GET" });
    mockFetch.mockResolvedValue({ status: 200, ok: true });

    await handler(makeSQSEvent(executeJob));

    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.method).toBe("GET");
    expect(opts.body).toBeUndefined();
  });

  it("merges custom headers", async () => {
    setupWebhookExecution({
      headers: { "X-Custom": "value", Authorization: "Bearer tok" },
    });
    mockFetch.mockResolvedValue({ status: 200, ok: true });

    await handler(makeSQSEvent(executeJob));

    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.headers["Content-Type"]).toBe("application/json");
    expect(opts.headers["X-Custom"]).toBe("value");
    expect(opts.headers.Authorization).toBe("Bearer tok");
  });

  it("includes config.body in request", async () => {
    setupWebhookExecution({ body: { customKey: "customVal" } });
    mockFetch.mockResolvedValue({ status: 200, ok: true });

    await handler(makeSQSEvent(executeJob));

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.customKey).toBe("customVal");
    expect(body.contact.id).toBe("contact-1");
  });

  it("handles network failure without throwing", async () => {
    setupWebhookExecution();
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));

    // handler should NOT throw — webhook failure is non-fatal
    const result = await handler(makeSQSEvent(executeJob));
    expect(result.batchItemFailures).toEqual([]);
  });

  it("handles non-ok status and continues", async () => {
    setupWebhookExecution();
    mockFetch.mockResolvedValue({ status: 500, ok: false });

    const result = await handler(makeSQSEvent(executeJob));
    expect(result.batchItemFailures).toEqual([]);
  });
});

describe("Step retry clears stale error", () => {
  it("onConflictDoUpdate clears error and completedAt when re-executing a failed step", async () => {
    const wf = makeWorkflow({
      steps: [
        { id: "trigger-1", type: "trigger", config: { type: "trigger" } },
        {
          id: "step-hook",
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
          toStepId: "step-hook",
          condition: null,
        },
      ],
    });

    const execution = makeExecution({
      currentStepId: "step-hook",
      definitionSnapshot: { steps: wf.steps, transitions: wf.transitions },
    });

    const contactRecord = makeContact();

    // select: workflow
    mockDbSelect
      .mockReturnValueOnce(selectChain([wf])())
      // select: execution
      .mockReturnValueOnce(selectChain([execution])())
      // select: contact
      .mockReturnValueOnce(selectChain([contactRecord])());

    // Capture the onConflictDoUpdate config to assert on its `set` object
    let capturedConflictConfig: Record<string, unknown> | null = null;
    mockDbInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn((config: Record<string, unknown>) => {
          capturedConflictConfig = config;
          return {
            returning: vi
              .fn()
              .mockResolvedValue([{ id: "se-1", status: "executing" }]),
          };
        }),
      }),
    });

    // update calls (execution status, step completion)
    mockDbUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([execution]),
        }),
      }),
    });

    mockFetch.mockResolvedValue({ status: 200, ok: true });

    await handler(
      makeSQSEvent({
        type: "execute",
        executionId: "exec-1",
        stepId: "step-hook",
        organizationId: "org-1",
      })
    );

    // The onConflictDoUpdate set must clear stale error/completedAt from previous failed attempt
    expect(capturedConflictConfig).not.toBeNull();
    const setObj = (
      capturedConflictConfig as unknown as Record<string, unknown>
    ).set as Record<string, unknown>;
    expect(setObj).toHaveProperty("error", null);
    expect(setObj).toHaveProperty("completedAt", null);
  });
});
