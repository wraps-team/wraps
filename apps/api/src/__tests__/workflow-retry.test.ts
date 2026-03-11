/**
 * Workflow Execution Retry Tests
 *
 * Tests the POST /v1/workflows/executions/:executionId/retry endpoint:
 * 1. Resets failed execution to active and enqueues retry
 * 2. Rejects non-failed executions
 * 3. Prevents IDOR (cross-org access)
 */

import { Elysia } from "elysia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSelectLimit, mockTransaction, mockEnqueueWorkflowStep } =
  vi.hoisted(() => ({
    mockSelectLimit: vi.fn(),
    mockTransaction: vi.fn(),
    mockEnqueueWorkflowStep: vi.fn(),
  }));

vi.mock("@wraps/db", () => {
  const makeWhereResult = () => ({
    limit: mockSelectLimit,
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable mock for Drizzle query chains
    then(resolve: (v: unknown) => void, reject?: (e: unknown) => void) {
      return Promise.resolve(mockSelectLimit()).then(resolve, reject);
    },
  });

  return {
    db: {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => makeWhereResult()),
        })),
      })),
      transaction: mockTransaction,
    },
    workflowExecution: {
      id: "id",
      organizationId: "organization_id",
      status: "status",
      currentStepId: "current_step_id",
      error: "error",
      errorStepId: "error_step_id",
      completedAt: "completed_at",
      updatedAt: "updated_at",
    },
    workflow: {
      id: "id",
      activeExecutions: "active_executions",
      failedExecutions: "failed_executions",
    },
    contact: {
      id: "id",
      organizationId: "organization_id",
      email: "email",
    },
    eq: vi.fn(),
    and: vi.fn(),
  };
});

vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  inArray: vi.fn(),
  sql: Object.assign(vi.fn(), { raw: vi.fn() }),
}));

vi.mock("../middleware/auth", () => ({
  createAuthenticatedRoutes: vi.fn((prefix: string) =>
    new Elysia({ prefix }).derive(() => ({
      auth: {
        apiKeyId: null,
        organizationId: "org-123",
        userId: "user-123",
        planId: "pro",
      },
      authError: null,
    }))
  ),
}));

vi.mock("../middleware/rate-limit", () => ({
  rateLimitMiddleware: new Elysia(),
}));

vi.mock("../services/workflow-queue", () => ({
  enqueueWorkflowStep: mockEnqueueWorkflowStep,
  enqueueWorkflowStepBatch: vi.fn(),
}));

vi.mock("../lib/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { workflowsRoutes } = await import("../(ee)/routes/workflows");

function createApp() {
  return new Elysia().use(workflowsRoutes);
}

describe("Workflow Execution Retry", () => {
  beforeEach(() => {
    mockSelectLimit.mockReset();
    mockTransaction.mockReset();
    mockEnqueueWorkflowStep.mockReset();
  });

  it("resets failed execution to active and returns success", async () => {
    const failedExecution = {
      id: "exec-123",
      workflowId: "wf-456",
      organizationId: "org-123",
      status: "failed",
      errorStepId: "step-789",
      error: "Template not found",
    };

    mockSelectLimit.mockResolvedValueOnce([failedExecution]);
    mockTransaction.mockImplementation(async (cb: Function) => {
      const txMock = {
        update: vi.fn(() => ({
          set: vi.fn(() => ({
            where: vi.fn(() => ({
              returning: vi.fn(() => [{ id: "exec-123" }]),
            })),
          })),
        })),
      };
      return cb(txMock);
    });
    mockEnqueueWorkflowStep.mockResolvedValueOnce(undefined);

    const app = createApp();
    const response = await app.handle(
      new Request("http://localhost/v1/workflows/executions/exec-123/retry", {
        method: "POST",
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(mockEnqueueWorkflowStep).toHaveBeenCalledWith({
      type: "execute",
      executionId: "exec-123",
      stepId: "step-789",
      organizationId: "org-123",
    });
  });

  it("rejects non-failed execution with error", async () => {
    mockSelectLimit.mockResolvedValueOnce([
      {
        id: "exec-123",
        workflowId: "wf-456",
        organizationId: "org-123",
        status: "active",
        errorStepId: null,
      },
    ]);

    const app = createApp();
    const response = await app.handle(
      new Request("http://localhost/v1/workflows/executions/exec-123/retry", {
        method: "POST",
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("failed");
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockEnqueueWorkflowStep).not.toHaveBeenCalled();
  });

  it("rejects execution from different org (IDOR prevention)", async () => {
    // Execution not found because org scoping filters it out
    mockSelectLimit.mockResolvedValueOnce([]);

    const app = createApp();
    const response = await app.handle(
      new Request(
        "http://localhost/v1/workflows/executions/exec-other-org/retry",
        { method: "POST" }
      )
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("not found");
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockEnqueueWorkflowStep).not.toHaveBeenCalled();
  });

  it("rolls back retry state when enqueue fails", async () => {
    const failedExecution = {
      id: "exec-123",
      workflowId: "wf-456",
      organizationId: "org-123",
      status: "failed",
      errorStepId: "step-789",
      error: "Template not found",
    };

    mockSelectLimit.mockResolvedValueOnce([failedExecution]);
    mockTransaction.mockImplementation(async (cb: Function) => {
      const txMock = {
        update: vi.fn(() => ({
          set: vi.fn(() => ({
            where: vi.fn(() => ({
              returning: vi.fn(() => [{ id: "exec-123" }]),
            })),
          })),
        })),
      };
      return cb(txMock);
    });
    mockEnqueueWorkflowStep.mockRejectedValueOnce(
      new Error("SQS send failed")
    );

    const app = createApp();
    const response = await app.handle(
      new Request("http://localhost/v1/workflows/executions/exec-123/retry", {
        method: "POST",
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("enqueue");
    expect(mockTransaction).toHaveBeenCalledTimes(2);
  });
});
