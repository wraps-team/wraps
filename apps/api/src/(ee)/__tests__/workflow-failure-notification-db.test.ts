/**
 * Workflow failure notification — real-DB tests
 *
 * `failExecution` (processor) must write one in-app notification per workflow
 * per 24h to the org's owners/admins/marketing, only when it actually flipped a
 * row to failed. The reaper path must record the real step id and notify.
 */

import {
  db,
  deleteNotificationsForOrg,
  eq,
  notification,
  workflow,
  workflowExecution,
} from "@wraps/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { failExecution } from "../workers/workflow-processor";
import {
  PAUSED_STUCK_THRESHOLD_MS,
  runReaper,
} from "../workers/workflow-reaper";
import {
  type BaseOrgFixture,
  cleanupBaseOrg,
  clearWorkflowState,
  executionRow,
  seedBaseOrg,
  workflowRow,
} from "./fixtures/real-db";

const TEST_PREFIX = "wf-fail-notify-db";
const TYPE = "workflow.execution_failed";

describe("workflow failure notifications (real DB)", () => {
  let fx: BaseOrgFixture;

  beforeAll(async () => {
    fx = await seedBaseOrg(TEST_PREFIX);
  });

  beforeEach(async () => {
    await clearWorkflowState(fx.ids.org, fx.ids.otherOrg);
    await deleteNotificationsForOrg(fx.ids.org);
  });

  afterAll(async () => {
    await deleteNotificationsForOrg(fx.ids.org);
    await cleanupBaseOrg(TEST_PREFIX);
  });

  const wfId = (n: string) => `${fx.ids.org}-wf${n}`;

  async function seedWorkflow(n = "") {
    await db.insert(workflow).values(
      workflowRow(fx.ids, {
        id: wfId(n),
        activeExecutions: 1,
        failedExecutions: 0,
      })
    );
  }

  async function seedExecution(
    id: string,
    workflowId: string,
    overrides: Partial<typeof workflowExecution.$inferInsert> = {}
  ) {
    await db
      .insert(workflowExecution)
      .values(executionRow(fx.ids, { id, workflowId, ...overrides }));
  }

  async function notifications() {
    return db
      .select()
      .from(notification)
      .where(eq(notification.organizationId, fx.ids.org));
  }

  it("notifies the org once when an active execution fails", async () => {
    await seedWorkflow();
    const execId = `${fx.ids.org}-exec-1`;
    await seedExecution(execId, wfId(""));

    const result = await failExecution(execId, "boom", "step-a", fx.ids.org);

    expect(result).toEqual({ workflowId: wfId("") });
    const rows = await notifications();
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe(TYPE);
    expect(rows[0].userId).toBe(fx.ids.user);
    expect(rows[0].href).toMatch(
      new RegExp(`/automations/${wfId("")}/executions\\?status=failed$`)
    );
    expect((rows[0].data as { workflowId: string }).workflowId).toBe(wfId(""));
  });

  it("does not notify again for the same workflow within 24h", async () => {
    await seedWorkflow();
    const first = `${fx.ids.org}-exec-1`;
    const second = `${fx.ids.org}-exec-2`;
    await seedExecution(first, wfId(""));
    await failExecution(first, "boom", "step-a", fx.ids.org);
    await seedExecution(second, wfId(""));
    await failExecution(second, "boom again", "step-a", fx.ids.org);

    expect(await notifications()).toHaveLength(1);
  });

  it("notifies separately for a different workflow in the same org", async () => {
    await seedWorkflow("");
    await seedWorkflow("-b");
    const a = `${fx.ids.org}-exec-a`;
    const b = `${fx.ids.org}-exec-b`;
    await seedExecution(a, wfId(""));
    await seedExecution(b, wfId("-b"));
    await failExecution(a, "boom", "step-a", fx.ids.org);
    await failExecution(b, "boom", "step-a", fx.ids.org);

    expect(await notifications()).toHaveLength(2);
  });

  it("writes nothing and returns null for an already-completed execution", async () => {
    await seedWorkflow();
    const execId = `${fx.ids.org}-exec-done`;
    await seedExecution(execId, wfId(""), { status: "completed" });

    const result = await failExecution(execId, "boom", "step-a", fx.ids.org);

    expect(result).toBeNull();
    expect(await notifications()).toHaveLength(0);
  });

  it("reaper records the real step and notifies", async () => {
    await seedWorkflow();
    const execId = `${fx.ids.org}-exec-reaped`;
    await seedExecution(execId, wfId(""), {
      status: "paused",
      currentStepId: "step-a",
      nextStepScheduledAt: new Date(
        Date.now() - (PAUSED_STUCK_THRESHOLD_MS + 5 * 60_000)
      ),
    });

    await runReaper(db);

    const [exec] = await db
      .select()
      .from(workflowExecution)
      .where(eq(workflowExecution.id, execId));
    expect(exec.status).toBe("failed");
    expect(exec.errorStepId).toBe("step-a");
    const rows = await notifications();
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe(TYPE);
  });
});
