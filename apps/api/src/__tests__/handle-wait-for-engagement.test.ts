/**
 * handleWaitForEmailEngagement Tests
 *
 * Tests the wait_for_email_engagement workflow step handler, focusing on:
 * 1. CascadeGroupId scoping — only matches send_email steps in the same group
 * 2. Timeout scheduling
 * 3. Execution state update
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Track DB interactions
let lastExecutionUpdate: Record<string, unknown> | null = null;

// Mock send_email step execution for the "completed" query
let mockPreviousStepExecs: Record<string, unknown>[] = [];

const mockScheduleWaitTimeout = vi.fn((..._args: any[]) =>
  Promise.resolve("scheduler-1")
);

// Mock drizzle-orm (and, sql are imported from here in the source)
const mockAnd = vi.fn((...args: unknown[]) => ({ _op: "and", args }));
const mockSqlTagged = Object.assign(
  vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    _sql: true,
    strings,
    values,
  })),
  { raw: vi.fn() }
);

vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => mockAnd(...args),
  sql: mockSqlTagged,
}));

vi.mock("@wraps/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve(mockPreviousStepExecs)),
          })),
        })),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn((values: Record<string, unknown>) => {
        lastExecutionUpdate = values;
        return {
          where: vi.fn(() => Promise.resolve()),
        };
      }),
    })),
  },
  contact: { id: "contact.id", organizationId: "contact.organizationId" },
  eq: vi.fn((a: unknown, b: unknown) => ({ _op: "eq", a, b })),
  CASCADE_ENGAGEMENT_FIELD: "engagement.status",
  awsAccount: {},
  contactTopic: {},
  messageSend: {},
  organization: {},
  template: {},
  automation: {},
  automationExecution: { id: "workflowExecution.id" },
  automationStepExecution: {
    executionId: "wse.executionId",
    stepType: "wse.stepType",
    status: "wse.status",
    stepId: "wse.stepId",
    completedAt: "wse.completedAt",
  },
  workflow: {},
  workflowExecution: { id: "workflowExecution.id" },
  workflowStepExecution: {
    executionId: "wse.executionId",
    stepType: "wse.stepType",
    status: "wse.status",
    stepId: "wse.stepId",
    completedAt: "wse.completedAt",
  },
}));

vi.mock("@wraps/email", () => ({
  generateSESTemplateName: vi.fn(),
  transformVariablesForSes: vi.fn(),
  upsertSESTemplate: vi.fn(),
}));

vi.mock("@react-email/render", () => ({
  toPlainText: vi.fn(() => ""),
}));

vi.mock("../lib/activation-tracking", () => ({
  trackFirstEmailSent: vi.fn(),
}));

vi.mock("../lib/unsubscribe-token", () => ({
  generateUnsubscribeToken: vi.fn(),
}));

vi.mock("../services/credentials", () => ({
  getCredentials: vi.fn(),
}));

// Mock paths relative to THIS test file (src/__tests__/) to reach src/services/
vi.mock("../services/automation-queue", () => ({
  deleteScheduledStep: vi.fn(),
  enqueueAutomationStep: vi.fn(),
  enqueueAutomationStepBatch: vi.fn(),
  enqueueWorkflowStep: vi.fn(),
  enqueueWorkflowStepBatch: vi.fn(),
  scheduleWaitTimeout: (...args: any[]) => mockScheduleWaitTimeout(...args),
  scheduleAutomationStep: vi.fn(),
  scheduleWorkflowStep: vi.fn(),
}));

vi.mock("../services/automation-scheduler", () => ({
  createNextAutomationSchedule: vi.fn(),
  createNextWorkflowSchedule: vi.fn(),
}));

vi.mock("handlebars", () => ({
  default: { compile: vi.fn(() => vi.fn(() => "")) },
}));

const mockExecution = {
  id: "exec-1",
  workflowId: "wf-1",
  contactId: "contact-1",
  status: "active",
} as any;

function makeStep(overrides: Record<string, unknown> = {}) {
  return {
    id: "wait-1",
    type: "wait_for_email_engagement",
    name: "Wait",
    position: { x: 0, y: 0 },
    config: { type: "wait_for_email_engagement" },
    ...overrides,
  } as any;
}

beforeEach(() => {
  lastExecutionUpdate = null;
  mockPreviousStepExecs = [];
  vi.clearAllMocks();
});

describe("handleWaitForEmailEngagement", () => {
  it("returns wait action", async () => {
    const { handleWaitForEmailEngagement } = await import(
      "../(ee)/workers/workflow-processor"
    );

    const result = await handleWaitForEmailEngagement(
      { type: "wait_for_email_engagement", timeoutSeconds: 7200 },
      mockExecution,
      makeStep(),
      "org-1"
    );

    expect(result).toEqual({ action: "wait" });
  });

  it("schedules timeout with correct parameters", async () => {
    const { handleWaitForEmailEngagement } = await import(
      "../(ee)/workers/workflow-processor"
    );

    await handleWaitForEmailEngagement(
      { type: "wait_for_email_engagement", timeoutSeconds: 7200 },
      mockExecution,
      makeStep(),
      "org-1"
    );

    expect(mockScheduleWaitTimeout).toHaveBeenCalledWith({
      executionId: "exec-1",
      stepId: "wait-1",
      organizationId: "org-1",
      timeoutSeconds: 7200,
    });
  });

  it("updates execution to waiting state with message ID", async () => {
    mockPreviousStepExecs = [
      {
        stepId: "send-0",
        result: { messageId: "msg-abc" },
        completedAt: new Date(),
      },
    ];

    const { handleWaitForEmailEngagement } = await import(
      "../(ee)/workers/workflow-processor"
    );

    await handleWaitForEmailEngagement(
      { type: "wait_for_email_engagement", timeoutSeconds: 7200 },
      mockExecution,
      makeStep(),
      "org-1"
    );

    expect(lastExecutionUpdate?.status).toBe("waiting");
    expect(lastExecutionUpdate?.waitingForEvent).toBe(
      "email_engagement:msg-abc"
    );
    expect(lastExecutionUpdate?.waitTimeoutSchedulerName).toBe("scheduler-1");
  });

  it("uses 'unknown' when no previous email step found", async () => {
    mockPreviousStepExecs = [];

    const { handleWaitForEmailEngagement } = await import(
      "../(ee)/workers/workflow-processor"
    );

    await handleWaitForEmailEngagement(
      { type: "wait_for_email_engagement", timeoutSeconds: 7200 },
      mockExecution,
      makeStep(),
      "org-1"
    );

    expect(lastExecutionUpdate?.waitingForEvent).toBe(
      "email_engagement:unknown"
    );
  });

  it("applies cascadeGroupId filter when present", async () => {
    const { handleWaitForEmailEngagement } = await import(
      "../(ee)/workers/workflow-processor"
    );

    await handleWaitForEmailEngagement(
      { type: "wait_for_email_engagement", timeoutSeconds: 7200 },
      mockExecution,
      makeStep({ id: "recover-cart-wait-0", cascadeGroupId: "recover-cart" }),
      "org-1"
    );

    // and() should be called with the cascade filter included
    expect(mockAnd).toHaveBeenCalled();
    const andArgs = mockAnd.mock.calls[0];
    // Should have 4 args: executionId eq, stepType eq, status eq, and LIKE filter
    expect(andArgs.length).toBe(4);
    // The 4th argument should be the SQL LIKE filter (not undefined)
    expect(andArgs[3]).toBeDefined();
    expect((andArgs[3] as any)._sql).toBe(true);
  });

  it("does not apply cascadeGroupId filter when absent", async () => {
    const { handleWaitForEmailEngagement } = await import(
      "../(ee)/workers/workflow-processor"
    );

    await handleWaitForEmailEngagement(
      { type: "wait_for_email_engagement", timeoutSeconds: 7200 },
      mockExecution,
      makeStep(), // No cascadeGroupId
      "org-1"
    );

    expect(mockAnd).toHaveBeenCalled();
    const andArgs = mockAnd.mock.calls[0];
    // The 4th argument should be undefined (no cascade filter)
    expect(andArgs[3]).toBeUndefined();
  });

  it("defaults to 3 days timeout when not specified", async () => {
    const { handleWaitForEmailEngagement } = await import(
      "../(ee)/workers/workflow-processor"
    );

    await handleWaitForEmailEngagement(
      { type: "wait_for_email_engagement" } as any,
      mockExecution,
      makeStep(),
      "org-1"
    );

    expect(mockScheduleWaitTimeout).toHaveBeenCalledWith(
      expect.objectContaining({ timeoutSeconds: 259_200 })
    );
  });
});
