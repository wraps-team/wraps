/**
 * Workflow Reaper — real-DB behavioral tests (Step 5)
 *
 * Exercises the REAL SQL time-filter in `runReaper(db)` against the shared Neon
 * test branch. The existing mocked test (`workflow-reaper.test.ts`) hand-feeds
 * candidate rows and so bypasses the `WHERE ... < NOW() - INTERVAL` clause
 * entirely — it can pass even if that SQL filter were deleted. This file seeds
 * rows with concrete timestamps, runs the reaper against the real `db`, and
 * asserts persisted state. If the SQL time-filter were removed, the "fresh"
 * paused/waiting rows would be selected and reaped, failing these tests.
 *
 * `runReaper` calls `failExecution` internally (a real DB transaction) — we let
 * it run for real and assert both the execution `status` and the workflow
 * counter mutations it performs.
 *
 * Seed timestamps are computed relative to the exported thresholds so the test
 * can't rot if a threshold value changes.
 */

import { db, eq, workflow, workflowExecution } from "@wraps/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  PAUSED_STUCK_THRESHOLD_MS,
  runReaper,
  WAITING_EXPIRED_THRESHOLD_MS,
} from "../workers/workflow-reaper";
import {
  type BaseOrgFixture,
  cleanupBaseOrg,
  clearWorkflowState,
  executionRow,
  seedBaseOrg,
  workflowRow,
} from "./fixtures/real-db";

const TEST_PREFIX = "wf-reaper-db";

// Timestamps relative to the exported thresholds (no magic numbers).
const STUCK_PAUSED_AT = () =>
  new Date(Date.now() - (PAUSED_STUCK_THRESHOLD_MS + 5 * 60_000));
const FRESH_PAUSED_AT = () =>
  new Date(Date.now() - (PAUSED_STUCK_THRESHOLD_MS - 20 * 60_000)); // ~10 min ago
const EXPIRED_WAITING_AT = () =>
  new Date(Date.now() - (WAITING_EXPIRED_THRESHOLD_MS + 60_000)); // ~6 min ago
const FRESH_WAITING_AT = () =>
  new Date(Date.now() - (WAITING_EXPIRED_THRESHOLD_MS - 4 * 60_000)); // ~1 min ago

describe("workflow reaper (real DB) — SQL time-filter", () => {
  let fx: BaseOrgFixture;

  beforeAll(async () => {
    fx = await seedBaseOrg(TEST_PREFIX);
  });

  beforeEach(async () => {
    await clearWorkflowState(fx.ids.org, fx.ids.otherOrg);
  });

  afterAll(async () => {
    await cleanupBaseOrg(TEST_PREFIX);
  });

  async function seedWorkflow(
    overrides: Partial<typeof workflow.$inferInsert> = {}
  ) {
    await db.insert(workflow).values(
      workflowRow(fx.ids, {
        activeExecutions: 1,
        failedExecutions: 0,
        completedExecutions: 0,
        ...overrides,
      })
    );
  }

  async function readWorkflowCounters() {
    const [wf] = await db
      .select({
        active: workflow.activeExecutions,
        failed: workflow.failedExecutions,
        completed: workflow.completedExecutions,
      })
      .from(workflow)
      .where(eq(workflow.id, `${fx.ids.org}-wf`));
    return wf;
  }

  async function readExecution(id: string) {
    const [exec] = await db
      .select()
      .from(workflowExecution)
      .where(eq(workflowExecution.id, id));
    return exec;
  }

  // Unit 13 — stuck paused execution is reaped (real SQL filter selects it).
  it("reaps a paused execution stuck past the 30-min threshold", async () => {
    await seedWorkflow();
    const execId = `${fx.ids.org}-exec-stuck`;
    await db.insert(workflowExecution).values(
      executionRow(fx.ids, {
        id: execId,
        status: "paused",
        currentStepId: "step-delay",
        nextStepScheduledAt: STUCK_PAUSED_AT(),
      })
    );

    await runReaper(db);

    const exec = await readExecution(execId);
    expect(exec.status).toBe("failed");
    expect(exec.error).toBe("execution stuck: paused step not delivered");
    expect(exec.errorStepId).toBe("step-delay"); // carried from currentStepId
    expect(exec.completedAt).not.toBeNull();

    const counters = await readWorkflowCounters();
    expect(counters.active).toBe(0); // decremented from 1
    expect(counters.failed).toBe(1); // incremented
  });

  // The reaper only knows the step if the row recorded one; "unknown" is the
  // fallback for rows with no currentStepId.
  it("falls back to errorStepId 'unknown' when currentStepId is null", async () => {
    await seedWorkflow();
    const execId = `${fx.ids.org}-exec-nostep`;
    await db.insert(workflowExecution).values(
      executionRow(fx.ids, {
        id: execId,
        status: "paused",
        currentStepId: null,
        nextStepScheduledAt: STUCK_PAUSED_AT(),
      })
    );

    await runReaper(db);

    const exec = await readExecution(execId);
    expect(exec.status).toBe("failed");
    expect(exec.errorStepId).toBe("unknown");
  });

  // Unit 14 — fresh paused execution is NOT reaped (SQL filter excludes it).
  it("leaves a paused execution within the 30-min threshold untouched", async () => {
    await seedWorkflow();
    const execId = `${fx.ids.org}-exec-fresh`;
    await db.insert(workflowExecution).values(
      executionRow(fx.ids, {
        id: execId,
        status: "paused",
        nextStepScheduledAt: FRESH_PAUSED_AT(),
      })
    );

    await runReaper(db);

    const exec = await readExecution(execId);
    expect(exec.status).toBe("paused"); // unchanged
    expect(exec.error).toBeNull();

    const counters = await readWorkflowCounters();
    expect(counters.active).toBe(1); // unchanged
    expect(counters.failed).toBe(0); // unchanged
  });

  // Unit 15 — expired waiting is reaped, fresh waiting is not (one run, both rows).
  it("reaps an expired waiting execution but not a fresh one", async () => {
    await seedWorkflow({ activeExecutions: 2 });
    const expiredId = `${fx.ids.org}-exec-expired-wait`;
    const freshId = `${fx.ids.org}-exec-fresh-wait`;

    await db.insert(workflowExecution).values([
      executionRow(fx.ids, {
        id: expiredId,
        status: "waiting",
        currentStepId: "step-wait",
        waitTimeoutAt: EXPIRED_WAITING_AT(),
      }),
      executionRow(fx.ids, {
        id: freshId,
        status: "waiting",
        waitTimeoutAt: FRESH_WAITING_AT(),
      }),
    ]);

    await runReaper(db);

    const expired = await readExecution(expiredId);
    expect(expired.status).toBe("failed");
    expect(expired.error).toBe("execution stuck: waiting timeout expired");
    expect(expired.errorStepId).toBe("step-wait");

    const fresh = await readExecution(freshId);
    expect(fresh.status).toBe("waiting"); // untouched
    expect(fresh.error).toBeNull();

    // Exactly one of the two active executions was reaped.
    const counters = await readWorkflowCounters();
    expect(counters.active).toBe(1); // 2 → 1 (only expired reaped)
    expect(counters.failed).toBe(1);
  });

  // Counters decrement only for reaped rows across a mixed run (both branches).
  it("reaps stuck paused and expired waiting together, sparing fresh rows", async () => {
    await seedWorkflow({ activeExecutions: 4 });

    const stuckPausedId = `${fx.ids.org}-exec-sp`;
    const freshPausedId = `${fx.ids.org}-exec-fp`;
    const expiredWaitId = `${fx.ids.org}-exec-ew`;
    const freshWaitId = `${fx.ids.org}-exec-fw`;

    await db.insert(workflowExecution).values([
      executionRow(fx.ids, {
        id: stuckPausedId,
        status: "paused",
        nextStepScheduledAt: STUCK_PAUSED_AT(),
      }),
      executionRow(fx.ids, {
        id: freshPausedId,
        status: "paused",
        nextStepScheduledAt: FRESH_PAUSED_AT(),
      }),
      executionRow(fx.ids, {
        id: expiredWaitId,
        status: "waiting",
        waitTimeoutAt: EXPIRED_WAITING_AT(),
      }),
      executionRow(fx.ids, {
        id: freshWaitId,
        status: "waiting",
        waitTimeoutAt: FRESH_WAITING_AT(),
      }),
    ]);

    await runReaper(db);

    expect((await readExecution(stuckPausedId)).status).toBe("failed");
    expect((await readExecution(expiredWaitId)).status).toBe("failed");
    expect((await readExecution(freshPausedId)).status).toBe("paused");
    expect((await readExecution(freshWaitId)).status).toBe("waiting");

    // 2 reaped of 4 active → active 4-2=2, failed 0+2=2.
    const counters = await readWorkflowCounters();
    expect(counters.active).toBe(2);
    expect(counters.failed).toBe(2);
  });
});
