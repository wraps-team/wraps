/**
 * Workflow Definition Drift Test
 *
 * Verifies that in-flight executions are immune to live workflow edits.
 *
 * The workflow processor snapshots the definition (steps + transitions) at
 * execution creation time into `definitionSnapshot`. All subsequent step
 * lookups and transition routing use the snapshot, not the live workflow.
 * This ensures that editing a workflow never corrupts running executions.
 */

import type { SQSEvent } from "aws-lambda";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// Mock data factories
// ─────────────────────────────────────────────────────────────────────────────

function makeWorkflow(overrides: Record<string, unknown> = {}) {
  return {
    id: "wf-drift",
    organizationId: "org-1",
    name: "Drift Test Workflow",
    status: "enabled",
    triggerType: "event",
    triggerConfig: { eventName: "user.signup" },
    awsAccountId: "aws-1",
    allowReentry: true,
    reentryDelaySeconds: null,
    contactCooldownSeconds: null,
    maxConcurrentExecutions: null,
    steps: [
      {
        id: "trigger-1",
        type: "trigger",
        name: "Trigger",
        position: { x: 0, y: 0 },
        config: {
          type: "trigger",
          triggerType: "event",
          eventName: "user.signup",
        },
      },
      {
        id: "step-a",
        type: "webhook",
        name: "Step A",
        position: { x: 0, y: 100 },
        config: {
          type: "webhook",
          url: "https://example.com/a",
          method: "POST",
          headers: {},
          body: {},
        },
      },
      {
        id: "step-b",
        type: "webhook",
        name: "Step B",
        position: { x: 0, y: 200 },
        config: {
          type: "webhook",
          url: "https://example.com/b",
          method: "POST",
          headers: {},
          body: {},
        },
      },
      {
        id: "step-c",
        type: "exit",
        name: "Step C",
        position: { x: 0, y: 300 },
        config: { type: "exit" },
      },
    ],
    transitions: [
      {
        id: "t1",
        fromStepId: "trigger-1",
        toStepId: "step-a",
        condition: null,
      },
      { id: "t2", fromStepId: "step-a", toStepId: "step-b", condition: null },
      { id: "t3", fromStepId: "step-b", toStepId: "step-c", condition: null },
    ],
    defaultFrom: null,
    defaultFromName: null,
    defaultReplyTo: null,
    defaultSenderId: null,
    totalExecutions: 0,
    activeExecutions: 1,
    completedExecutions: 0,
    failedExecutions: 0,
    droppedExecutions: 0,
    lastTriggeredAt: null,
    ...overrides,
  };
}

/**
 * Build a modified workflow where step-b has been removed and transitions
 * now go directly from step-a to step-c. This simulates a user editing
 * the workflow in the dashboard while an execution is in-flight.
 */
function makeModifiedWorkflow() {
  return makeWorkflow({
    steps: [
      {
        id: "trigger-1",
        type: "trigger",
        name: "Trigger",
        position: { x: 0, y: 0 },
        config: {
          type: "trigger",
          triggerType: "event",
          eventName: "user.signup",
        },
      },
      {
        id: "step-a",
        type: "webhook",
        name: "Step A",
        position: { x: 0, y: 100 },
        config: {
          type: "webhook",
          url: "https://example.com/a",
          method: "POST",
          headers: {},
          body: {},
        },
      },
      // step-b REMOVED
      {
        id: "step-c",
        type: "exit",
        name: "Step C",
        position: { x: 0, y: 300 },
        config: { type: "exit" },
      },
    ],
    transitions: [
      {
        id: "t1",
        fromStepId: "trigger-1",
        toStepId: "step-a",
        condition: null,
      },
      // t2 now goes directly from step-a to step-c (step-b removed)
      { id: "t2", fromStepId: "step-a", toStepId: "step-c", condition: null },
      // t3 removed (was step-b → step-c)
    ],
  });
}

/** The original workflow definition, frozen at execution creation time */
const ORIGINAL_SNAPSHOT = {
  steps: makeWorkflow().steps,
  transitions: makeWorkflow().transitions,
  workflowVersion: 1,
};

function makeExecution(overrides: Record<string, unknown> = {}) {
  return {
    id: "exec-drift",
    workflowId: "wf-drift",
    contactId: "contact-1",
    organizationId: "org-1",
    status: "active",
    currentStepId: "step-b",
    definitionSnapshot: ORIGINAL_SNAPSHOT,
    triggerData: {},
    startedAt: new Date(),
    completedAt: null,
    error: null,
    errorStepId: null,
    allowReentry: true,
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
    contactIdsMatchingCondition: vi.fn().mockResolvedValue([]),
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
// Bug reproduction: editing a live workflow corrupts in-flight executions
// ═══════════════════════════════════════════════════════════════════════════

describe("Workflow definition snapshot protects in-flight executions", () => {
  it("uses snapshot to find step-b even when it has been removed from the live workflow", async () => {
    // The live workflow no longer has step-b, but the execution's
    // definitionSnapshot still does — processStep uses the snapshot.

    const modifiedWf = makeModifiedWorkflow(); // step-b removed from live
    const execution = makeExecution({
      currentStepId: "step-b",
      status: "active",
    });
    const contactRecord = makeContact();

    mockDbQueryWorkflowExecution.findFirst.mockResolvedValue(execution);

    let selectCount = 0;
    mockDbSelect.mockImplementation(() => {
      selectCount++;
      if (selectCount === 1) {
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([modifiedWf]),
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

    mockDbUpdate.mockImplementation(() => ({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([execution]),
        }),
      }),
    }));

    await handler(
      makeSQSEvent({
        type: "execute",
        executionId: "exec-drift",
        stepId: "step-b",
        organizationId: "org-1",
      })
    );

    // Snapshot means "Step not found" should never fire
    const { log } = await import("../../lib/logger");
    const errorCalls = vi.mocked(log.error).mock.calls;
    const stepNotFoundError = errorCalls.find(
      (call) => call[0] === "Step not found in workflow"
    );
    expect(stepNotFoundError).toBeUndefined();
  });

  it("executes step-b webhook and enqueues step-c using snapshot after live edit removes step-b", async () => {
    const modifiedWf = makeModifiedWorkflow(); // step-b removed from live
    const execution = makeExecution({
      currentStepId: "step-b",
      status: "active",
    });
    const contactRecord = makeContact();

    mockDbQueryWorkflowExecution.findFirst.mockResolvedValue(execution);

    let selectCount = 0;
    mockDbSelect.mockImplementation(() => {
      selectCount++;
      if (selectCount === 1) {
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([modifiedWf]),
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

    mockDbInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi
            .fn()
            .mockResolvedValue([{ id: "se-1", status: "executing" }]),
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

    mockFetch.mockResolvedValue({ status: 200, ok: true });

    await handler(
      makeSQSEvent({
        type: "execute",
        executionId: "exec-drift",
        stepId: "step-b",
        organizationId: "org-1",
      })
    );

    // Snapshot lets step-b (webhook) execute normally
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("uses snapshot transitions after delay even when live workflow transitions are edited", async () => {
    const modifiedWf = makeWorkflow({
      steps: [
        {
          id: "trigger-1",
          type: "trigger",
          name: "Trigger",
          position: { x: 0, y: 0 },
          config: {
            type: "trigger",
            triggerType: "event",
            eventName: "user.signup",
          },
        },
        {
          id: "step-delay",
          type: "delay",
          name: "Wait 1 hour",
          position: { x: 0, y: 100 },
          config: { type: "delay", amount: 1, unit: "hours" },
        },
        // step-b replaced with step-x in live
        {
          id: "step-x",
          type: "exit",
          name: "New Exit",
          position: { x: 0, y: 200 },
          config: { type: "exit" },
        },
      ],
      transitions: [
        {
          id: "t1",
          fromStepId: "trigger-1",
          toStepId: "step-delay",
          condition: null,
        },
        {
          id: "t2",
          fromStepId: "step-delay",
          toStepId: "step-x",
          condition: null,
        },
      ],
    });

    // Execution's snapshot still has original step-b
    const execution = makeExecution({
      currentStepId: "step-b",
      status: "active",
    });
    const contactRecord = makeContact();

    mockDbQueryWorkflowExecution.findFirst.mockResolvedValue(execution);

    let selectCount = 0;
    mockDbSelect.mockImplementation(() => {
      selectCount++;
      if (selectCount === 1) {
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([modifiedWf]),
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
        executionId: "exec-drift",
        stepId: "step-b",
        organizationId: "org-1",
      })
    );

    // Snapshot protects: step-b still exists in the execution's frozen definition
    const { log } = await import("../../lib/logger");
    const errorCalls = vi.mocked(log.error).mock.calls;
    const stepNotFoundError = errorCalls.find(
      (call) => call[0] === "Step not found in workflow"
    );
    expect(stepNotFoundError).toBeUndefined();
  });

  it("resumes from waiting state using snapshot even when current step is removed from live workflow", async () => {
    const modifiedWf = makeWorkflow({
      steps: [
        {
          id: "trigger-1",
          type: "trigger",
          name: "Trigger",
          position: { x: 0, y: 0 },
          config: {
            type: "trigger",
            triggerType: "event",
            eventName: "user.signup",
          },
        },
        // step-wait REMOVED from live
        {
          id: "step-b",
          type: "exit",
          name: "Exit",
          position: { x: 0, y: 200 },
          config: { type: "exit" },
        },
      ],
      transitions: [
        {
          id: "t1",
          fromStepId: "trigger-1",
          toStepId: "step-b",
          condition: null,
        },
      ],
    });

    // Execution snapshot has step-wait so the resume can find it
    const waitSnapshot = {
      steps: [
        ...ORIGINAL_SNAPSHOT.steps,
        {
          id: "step-wait",
          type: "wait_for_event",
          name: "Wait for event",
          position: { x: 0, y: 150 },
          config: {
            type: "wait_for_event",
            eventName: "user.verified",
            timeoutSeconds: 86_400,
          },
        },
      ],
      transitions: [
        ...ORIGINAL_SNAPSHOT.transitions,
        {
          id: "t-wait",
          fromStepId: "step-wait",
          toStepId: "step-b",
          condition: { branch: "default" },
        },
      ],
      workflowVersion: 1,
    };

    const claimedExecution = makeExecution({
      currentStepId: "step-wait",
      status: "active",
      waitTimeoutSchedulerName: null,
      definitionSnapshot: waitSnapshot,
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
          limit: vi.fn().mockResolvedValue([modifiedWf]),
        }),
      }),
    });

    await handler(
      makeSQSEvent({
        type: "resume",
        executionId: "exec-drift",
        branch: "default",
        organizationId: "org-1",
      })
    );

    // Snapshot lets resume find step-wait and route to next step
    expect(mockEnqueueWorkflowStep).toHaveBeenCalled();
  });
});
