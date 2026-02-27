/**
 * Schedule Chain Reconciliation Tests
 *
 * Verifies that the schedule chain is resilient to failures:
 * 1. processScheduleTrigger catches chain errors without re-throwing
 *    (preventing duplicate contact fan-out from SQS retries)
 * 2. reconcileScheduleChains exists for detecting and repairing broken chains
 */

import type { SQSEvent } from "aws-lambda";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeScheduledWorkflow(overrides: Record<string, unknown> = {}) {
  return {
    id: "wf-sched-001",
    organizationId: "org-1",
    name: "Weekly Newsletter",
    status: "enabled",
    triggerType: "schedule",
    triggerConfig: {
      schedule: "0 9 * * 1", // Every Monday 9am
      timezone: "America/New_York",
    },
    awsAccountId: "aws-1",
    allowReentry: true,
    reentryDelaySeconds: null,
    contactCooldownSeconds: null,
    maxConcurrentExecutions: null,
    steps: [
      { id: "trigger-1", type: "trigger", config: { type: "trigger" } },
      {
        id: "step-1",
        type: "send_email",
        config: {
          type: "send_email",
          templateId: "tmpl-1",
          from: "news@example.com",
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
    defaultFrom: "news@example.com",
    defaultFromName: "Newsletter",
    defaultReplyTo: null,
    defaultSenderId: null,
    totalExecutions: 100,
    activeExecutions: 0,
    completedExecutions: 100,
    failedExecutions: 0,
    droppedExecutions: 0,
    lastTriggeredAt: new Date("2026-02-16T14:00:00Z"),
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
// Module-level mocks
// ─────────────────────────────────────────────────────────────────────────────

const mockEnqueueWorkflowStep = vi.fn();
const mockEnqueueWorkflowStepBatch = vi.fn();
const mockScheduleWaitTimeout = vi.fn().mockResolvedValue("sched-wait-123");
const mockScheduleWorkflowStep = vi.fn().mockResolvedValue("sched-step-123");
const mockDeleteScheduledStep = vi.fn();
const mockCreateNextWorkflowSchedule = vi.fn();
const mockReconcileScheduleChains = vi.fn().mockResolvedValue({
  checked: 1,
  repaired: 1,
  errors: 0,
  details: [{ workflowId: "wf-sched-001", action: "repaired" }],
});

const mockDbSelect = vi.fn();
const mockDbUpdate = vi.fn();
const mockDbInsert = vi.fn();
const mockDbQueryWorkflowExecution = { findFirst: vi.fn() };

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
  formatScheduleExpression: vi.fn((d: Date) => `at(${d.toISOString()})`),
}));

vi.mock("../../services/automation-scheduler", () => ({
  createNextAutomationSchedule: mockCreateNextWorkflowSchedule,
  createNextWorkflowSchedule: mockCreateNextWorkflowSchedule,
  reconcileScheduleChains: mockReconcileScheduleChains,
}));

vi.mock("@wraps/db", async () => {
  const actual = await vi.importActual("@wraps/db");
  return {
    ...actual,
    db: {
      select: mockDbSelect,
      update: mockDbUpdate,
      insert: mockDbInsert,
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

// Import handler AFTER all mocks are set up
const { handler } = await import("../../(ee)/workers/workflow-processor");
const { log } = await import("../../lib/logger");

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Schedule chain resilience", () => {
  /**
   * Setup helper: configure mocks so processScheduleTrigger gets through
   * the workflow load and contact fan-out, then hits createNextWorkflowSchedule.
   */
  function setupScheduleTriggerMocks(wf = makeScheduledWorkflow()) {
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
      // Get contacts (return 2 active contacts)
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi
              .fn()
              .mockResolvedValue([{ id: "contact-1" }, { id: "contact-2" }]),
          }),
        }),
      };
    });

    // enqueueWorkflowStepBatch succeeds (fan-out to contacts)
    mockEnqueueWorkflowStepBatch.mockResolvedValue(undefined);

    // db.update for lastTriggeredAt
    mockDbUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });
  }

  it("catches chain failure without re-throwing, preserving contact fan-out", async () => {
    setupScheduleTriggerMocks();

    // Simulate createNextWorkflowSchedule failing (e.g., Lambda timeout, throttle)
    mockCreateNextWorkflowSchedule.mockRejectedValueOnce(
      new Error("ServiceUnavailableException: Rate exceeded")
    );

    const event = makeSQSEvent({
      type: "schedule-trigger",
      workflowId: "wf-sched-001",
      organizationId: "org-1",
    });

    // Handler catches the chain error internally — does NOT throw
    await handler(event);

    // Contact fan-out still succeeded (not duplicated by SQS retry)
    expect(mockEnqueueWorkflowStepBatch).toHaveBeenCalledTimes(1);

    // Chain creation was attempted but failed
    expect(mockCreateNextWorkflowSchedule).toHaveBeenCalledTimes(1);
    expect(mockCreateNextWorkflowSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: "wf-sched-001",
        organizationId: "org-1",
        cronExpression: "0 9 * * 1",
        timezone: "America/New_York",
      })
    );

    // Chain break was logged with structured metadata
    expect(log.error).toHaveBeenCalledWith(
      expect.stringContaining("CHAIN BROKEN"),
      expect.any(Error),
      expect.objectContaining({ chainBroken: true, workflowId: "wf-sched-001" })
    );
  });

  it("reconcileScheduleChains is exported from workflow-scheduler", async () => {
    const mod = await import("../../services/workflow-scheduler");
    expect(mod.reconcileScheduleChains).toBeDefined();
    expect(typeof mod.reconcileScheduleChains).toBe("function");
  });

  it("reconcileScheduleChains detects and repairs broken chains", async () => {
    const mod = await import("../../services/workflow-scheduler");
    const result = await mod.reconcileScheduleChains();

    expect(result).toBeDefined();
    expect(result).toHaveProperty("checked");
    expect(result).toHaveProperty("repaired");
    expect(result).toHaveProperty("errors");
    expect(result).toHaveProperty("details");
    expect(result.repaired).toBe(1);
    expect(result.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          workflowId: "wf-sched-001",
          action: "repaired",
        }),
      ])
    );
  });
});
