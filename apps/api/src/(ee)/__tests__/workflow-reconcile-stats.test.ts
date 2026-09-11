/**
 * Workflow Stats Reconciliation Tests
 *
 * Tests the reconcileWorkflowStats function that computes actual execution
 * counts from the workflowExecution table and corrects drifted denormalized
 * counters on the workflow table.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// Module-level mocks (before function import)
// ─────────────────────────────────────────────────────────────────────────────

const mockDbSelect = vi.fn();
const mockDbUpdate = vi.fn();

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

const { reconcileWorkflowStats } = await import("../workers/workflow-stats");

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe("reconcileWorkflowStats", () => {
  it("computes correct counts from the execution table", async () => {
    // The workflow has drifted stats
    const workflowRow = {
      id: "wf-1",
      totalExecutions: 10,
      activeExecutions: 5,
      completedExecutions: 3,
      failedExecutions: 1,
    };

    // Actual counts from workflowExecution table
    const actualCounts = [
      { status: "active", count: 2 },
      { status: "completed", count: 6 },
      { status: "failed", count: 2 },
      { status: "cancelled", count: 1 },
      { status: "pending", count: 1 },
      { status: "paused", count: 0 },
      { status: "waiting", count: 0 },
    ];

    // First select: load workflow row
    // Second select: count executions grouped by status
    let selectCallCount = 0;
    mockDbSelect.mockImplementation(() => {
      selectCallCount += 1;
      if (selectCallCount === 1) {
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([workflowRow]),
          }),
        };
      }
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockResolvedValue(actualCounts),
          }),
        }),
      };
    });

    const result = await reconcileWorkflowStats("wf-1", "org-1");

    expect(result).toEqual({
      workflowId: "wf-1",
      before: {
        totalExecutions: 10,
        activeExecutions: 5,
        completedExecutions: 3,
        failedExecutions: 1,
      },
      actual: {
        totalExecutions: 12, // 2+6+2+1+1+0+0 = 12
        activeExecutions: 3, // active(2) + pending(1) + paused(0) + waiting(0) = 3
        completedExecutions: 6,
        failedExecutions: 2,
      },
      drifted: true,
    });
  });

  it("corrects drifted counters when fix=true", async () => {
    const workflowRow = {
      id: "wf-1",
      totalExecutions: 10,
      activeExecutions: 5,
      completedExecutions: 3,
      failedExecutions: 1,
    };

    const actualCounts = [
      { status: "active", count: 2 },
      { status: "completed", count: 6 },
      { status: "failed", count: 2 },
      { status: "cancelled", count: 1 },
      { status: "pending", count: 1 },
    ];

    let selectCallCount = 0;
    mockDbSelect.mockImplementation(() => {
      selectCallCount += 1;
      if (selectCallCount === 1) {
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([workflowRow]),
          }),
        };
      }
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockResolvedValue(actualCounts),
          }),
        }),
      };
    });

    mockDbUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });

    const result = await reconcileWorkflowStats("wf-1", "org-1", { fix: true });

    expect(result.drifted).toBe(true);
    // Should have called db.update to fix the counters
    expect(mockDbUpdate).toHaveBeenCalledOnce();
  });

  it("does not update when counters are already correct", async () => {
    const workflowRow = {
      id: "wf-1",
      totalExecutions: 5,
      activeExecutions: 1,
      completedExecutions: 3,
      failedExecutions: 1,
    };

    // Actual counts match the denormalized values
    const actualCounts = [
      { status: "active", count: 1 },
      { status: "completed", count: 3 },
      { status: "failed", count: 1 },
    ];

    let selectCallCount = 0;
    mockDbSelect.mockImplementation(() => {
      selectCallCount += 1;
      if (selectCallCount === 1) {
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([workflowRow]),
          }),
        };
      }
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockResolvedValue(actualCounts),
          }),
        }),
      };
    });

    const result = await reconcileWorkflowStats("wf-1", "org-1", { fix: true });

    expect(result.drifted).toBe(false);
    expect(result.before).toEqual(result.actual);
    // Should NOT call db.update since nothing is drifted
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });
});
