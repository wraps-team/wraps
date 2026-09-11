/**
 * Workflow Reaper Tests
 *
 * Tests the `runReaper(db)` function that fails stuck workflow executions:
 *   - Paused executions with nextStepScheduledAt > 30 minutes ago
 *   - Waiting executions with waitTimeoutAt > 5 minutes ago (past timeout)
 *
 * The mock DB returns ALL candidate rows (no SQL pre-filtering), forcing the
 * application-level threshold filter in runReaper to do the actual selection.
 * This means tests verify the time threshold logic, not just "DB returns rows
 * → failExecution is called."
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PAUSED_STUCK_THRESHOLD_MS,
  WAITING_EXPIRED_THRESHOLD_MS,
} from "../workers/workflow-reaper";

// ─────────────────────────────────────────────────────────────────────────────
// Drizzle mock DB factory
//
// The mock returns ALL seeded rows without any WHERE-clause filtering —
// simulating what would happen if the SQL time filter were absent. The
// application-level filter inside runReaper is what actually separates
// stuck from non-stuck rows.
// ─────────────────────────────────────────────────────────────────────────────

function makeMockDb(options: {
  pausedRows?: Array<{
    id: string;
    workflowId: string;
    organizationId: string;
    nextStepScheduledAt: Date | null;
  }>;
  waitingRows?: Array<{
    id: string;
    workflowId: string;
    organizationId: string;
    waitTimeoutAt: Date | null;
  }>;
}) {
  const pausedRows = options.pausedRows ?? [];
  const waitingRows = options.waitingRows ?? [];

  let selectCallCount = 0;

  const mockDb = {
    select: vi.fn().mockImplementation(() => {
      selectCallCount++;
      // First select call → paused candidates query
      // Second select call → waiting candidates query
      const rows = selectCallCount === 1 ? pausedRows : waitingRows;
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(rows),
          }),
        }),
      };
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              id: "exec-placeholder",
              workflowId: "wf-1",
              organizationId: "org-1",
            },
          ]),
        }),
      }),
    }),
    transaction: vi.fn().mockImplementation(async (callback: Function) => {
      return callback({
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi
                .fn()
                .mockResolvedValue([
                  { id: "exec-1", workflowId: "wf-1", organizationId: "org-1" },
                ]),
            }),
          }),
        }),
      });
    }),
  };

  return mockDb;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock workflow-processor so we can spy on failExecution
// vi.hoisted ensures the mock variable is available when vi.mock is hoisted
// ─────────────────────────────────────────────────────────────────────────────

const { mockFailExecution } = vi.hoisted(() => ({
  mockFailExecution: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../workers/workflow-processor", async () => {
  const actual = await vi.importActual("../workers/workflow-processor");
  return {
    ...actual,
    failExecution: mockFailExecution,
  };
});

vi.mock("../../lib/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  flushLogger: vi.fn().mockResolvedValue(undefined),
}));

// Import after mocks
const { runReaper } = await import("../workers/workflow-reaper");

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockFailExecution.mockResolvedValue(undefined);
});

describe("workflow reaper — paused stuck threshold", () => {
  // Unit 13 (hardened): both stuck and non-stuck rows seeded — only stuck gets failed
  it("fails paused execution past the 30-min threshold but not one within it", async () => {
    const stuck = {
      id: "exec-stuck-paused",
      workflowId: "wf-1",
      organizationId: "org-1",
      nextStepScheduledAt: new Date(
        Date.now() - PAUSED_STUCK_THRESHOLD_MS - 5 * 60 * 1000
      ), // 35 min ago
    };
    const recent = {
      id: "exec-recent-paused",
      workflowId: "wf-1",
      organizationId: "org-1",
      nextStepScheduledAt: new Date(Date.now() - 10 * 60 * 1000), // 10 min ago (within threshold)
    };

    // Mock returns BOTH rows — the app-level filter must pick only the stuck one
    const db = makeMockDb({ pausedRows: [stuck, recent], waitingRows: [] });

    // @ts-expect-error - mock db doesn't fully match DrizzleDB type
    await runReaper(db);

    expect(mockFailExecution).toHaveBeenCalledTimes(1);
    expect(mockFailExecution).toHaveBeenCalledWith(
      "exec-stuck-paused",
      expect.stringMatching(/stuck|paused|lifetime|exceeded/i),
      expect.any(String),
      "org-1"
    );
    expect(mockFailExecution).not.toHaveBeenCalledWith(
      "exec-recent-paused",
      expect.any(String),
      expect.any(String),
      expect.any(String)
    );
  });

  // Unit 14: no stuck rows → failExecution not called
  it("skips all paused executions when none exceed the 30-min threshold", async () => {
    const recent = {
      id: "exec-recent",
      workflowId: "wf-1",
      organizationId: "org-1",
      nextStepScheduledAt: new Date(Date.now() - 10 * 60 * 1000), // 10 min ago
    };

    const db = makeMockDb({ pausedRows: [recent], waitingRows: [] });

    // @ts-expect-error - mock db doesn't fully match DrizzleDB type
    await runReaper(db);

    expect(mockFailExecution).not.toHaveBeenCalled();
  });
});

describe("workflow reaper — waiting expired threshold", () => {
  // Unit 15 (hardened): both expired and non-expired waiting rows seeded
  it("fails waiting execution past the 5-min threshold but not one within it", async () => {
    const expired = {
      id: "exec-expired-wait",
      workflowId: "wf-1",
      organizationId: "org-1",
      waitTimeoutAt: new Date(
        Date.now() - WAITING_EXPIRED_THRESHOLD_MS - 5 * 60 * 1000
      ), // 10 min ago
    };
    const pending = {
      id: "exec-pending-wait",
      workflowId: "wf-1",
      organizationId: "org-1",
      waitTimeoutAt: new Date(Date.now() - 60 * 1000), // 1 min ago (within threshold)
    };

    // Mock returns BOTH rows — app-level filter must pick only the expired one
    const db = makeMockDb({ pausedRows: [], waitingRows: [expired, pending] });

    // @ts-expect-error - mock db doesn't fully match DrizzleDB type
    await runReaper(db);

    expect(mockFailExecution).toHaveBeenCalledTimes(1);
    expect(mockFailExecution).toHaveBeenCalledWith(
      "exec-expired-wait",
      expect.stringMatching(/stuck|waiting|timeout|expired/i),
      expect.any(String),
      "org-1"
    );
    expect(mockFailExecution).not.toHaveBeenCalledWith(
      "exec-pending-wait",
      expect.any(String),
      expect.any(String),
      expect.any(String)
    );
  });
});

describe("workflow reaper — combined run", () => {
  it("processes both stuck paused and expired waiting executions in one run", async () => {
    const stuckPaused = {
      id: "exec-stuck",
      workflowId: "wf-1",
      organizationId: "org-1",
      nextStepScheduledAt: new Date(
        Date.now() - PAUSED_STUCK_THRESHOLD_MS - 60 * 1000
      ),
    };
    const expiredWaiting = {
      id: "exec-expired",
      workflowId: "wf-1",
      organizationId: "org-1",
      waitTimeoutAt: new Date(
        Date.now() - WAITING_EXPIRED_THRESHOLD_MS - 60 * 1000
      ),
    };

    const db = makeMockDb({
      pausedRows: [stuckPaused],
      waitingRows: [expiredWaiting],
    });

    // @ts-expect-error - mock db doesn't fully match DrizzleDB type
    await runReaper(db);

    expect(mockFailExecution).toHaveBeenCalledTimes(2);
    expect(mockFailExecution).toHaveBeenCalledWith(
      "exec-stuck",
      expect.any(String),
      expect.any(String),
      "org-1"
    );
    expect(mockFailExecution).toHaveBeenCalledWith(
      "exec-expired",
      expect.any(String),
      expect.any(String),
      "org-1"
    );
  });
});
