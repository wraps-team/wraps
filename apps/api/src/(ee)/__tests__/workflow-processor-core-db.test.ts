/**
 * Workflow Processor Core — REAL DATABASE behavioral tests (Step 1)
 *
 * Replaces the mock-call-structure assertions in workflow-processor-core.test.ts
 * (Units 25/26 + complete/fail/resume race) with assertions against persisted
 * state on the shared Neon test branch.
 *
 * What is mocked: ONLY the true boundaries.
 *   - ../../services/workflow-queue (SQS) — enqueue/delete are no-ops; we keep
 *     every real export (formatScheduleExpression, WorkflowJob, …) via importActual.
 *   - AWS SDK clients (SES / Pinpoint) — never reached by these flows, mocked for
 *     import safety only.
 * @wraps/db is NEVER mocked — we seed rows, run the function, and read the row back.
 *
 * Counter columns under test: workflow.activeExecutions / completedExecutions /
 * failedExecutions. Idempotency is the production concern: SQS is at-least-once,
 * so completeExecution / failExecution / the resume atomic-claim must each be
 * exactly-once against a terminal execution.
 */

import { db, eq, workflow, workflowExecution } from "@wraps/db";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  baseOrgIds,
  cleanupBaseOrg,
  clearWorkflowState,
  executionRow,
  seedBaseOrg,
  workflowRow,
} from "./fixtures/real-db";
import { makeSQSEvent } from "./fixtures/workflow-fixtures";

// ─────────────────────────────────────────────────────────────────────────────
// Boundary mocks (must be declared before importing the processor).
// SQS only — db stays real.
// ─────────────────────────────────────────────────────────────────────────────

vi.mock("../../services/workflow-queue", async () => {
  const actual = await vi.importActual<
    typeof import("../../services/workflow-queue")
  >("../../services/workflow-queue");
  return {
    ...actual,
    enqueueWorkflowStep: vi.fn().mockResolvedValue(undefined),
    enqueueWorkflowStepBatch: vi.fn().mockResolvedValue(undefined),
    scheduleWorkflowStep: vi.fn().mockResolvedValue("sched-step"),
    scheduleWaitTimeout: vi.fn().mockResolvedValue("sched-wait"),
    deleteScheduledStep: vi.fn().mockResolvedValue(undefined),
  };
});

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

const TEST_PREFIX = "wf-proc-core-db";
const ids = baseOrgIds(TEST_PREFIX);

// Import after mocks are registered.
const { failExecution, handler } = await import(
  "../workers/workflow-processor"
);
const { enqueueWorkflowStep } = await import("../../services/workflow-queue");

const WF_ID = `${ids.org}-wf`;
const EXEC_ID = `${ids.org}-exec`;

async function getWorkflow() {
  const [row] = await db
    .select()
    .from(workflow)
    .where(eq(workflow.id, WF_ID))
    .limit(1);
  return row;
}

async function getExecution(id = EXEC_ID) {
  const [row] = await db
    .select()
    .from(workflowExecution)
    .where(eq(workflowExecution.id, id))
    .limit(1);
  return row;
}

/**
 * A workflow whose only post-trigger step is a wait_for_event with NO outgoing
 * transitions. Driving the resume handler down this path lands in
 * processNextStep → no transition → completeExecution.
 */
function waitNoTransitionWorkflow() {
  return workflowRow(ids, {
    id: WF_ID,
    steps: [
      {
        id: "step-wait",
        type: "wait_for_event",
        name: "Wait",
        position: { x: 0, y: 0 },
        config: { type: "wait_for_event", eventName: "x" },
      },
    ],
    transitions: [],
  });
}

describe("Workflow processor core (real DB)", () => {
  beforeAll(async () => {
    await seedBaseOrg(TEST_PREFIX);
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    await clearWorkflowState(ids.org);
  });

  afterAll(async () => {
    await cleanupBaseOrg(TEST_PREFIX);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // failExecution
  // ───────────────────────────────────────────────────────────────────────────

  describe("failExecution", () => {
    it("marks the execution failed and updates workflow counters once", async () => {
      await db
        .insert(workflow)
        .values(workflowRow(ids, { id: WF_ID, activeExecutions: 1 }));
      await db.insert(workflowExecution).values(
        executionRow(ids, {
          id: EXEC_ID,
          status: "active",
          currentStepId: "step-1",
        })
      );

      await failExecution(EXEC_ID, "boom", "step-1", ids.org);

      const exec = await getExecution();
      expect(exec.status).toBe("failed");
      expect(exec.error).toBe("boom");
      expect(exec.errorStepId).toBe("step-1");
      expect(exec.completedAt).not.toBeNull();

      const wf = await getWorkflow();
      expect(wf.failedExecutions).toBe(1);
      expect(wf.activeExecutions).toBe(0);
    });

    it("is idempotent — a second call on a terminal execution leaves counters unchanged (Unit 26)", async () => {
      await db
        .insert(workflow)
        .values(workflowRow(ids, { id: WF_ID, activeExecutions: 1 }));
      await db.insert(workflowExecution).values(
        executionRow(ids, {
          id: EXEC_ID,
          status: "active",
          currentStepId: "step-1",
        })
      );

      await failExecution(EXEC_ID, "boom", "step-1", ids.org);
      // Second delivery (SQS at-least-once): execution is already failed.
      await failExecution(EXEC_ID, "boom again", "step-9", ids.org);

      const wf = await getWorkflow();
      // Counters must NOT double — the notInArray(TERMINAL_STATUSES) guard
      // returns zero rows on the 2nd call, so the counter UPDATE never runs.
      expect(wf.failedExecutions).toBe(1);
      expect(wf.activeExecutions).toBe(0);

      // The original error fields are preserved (no overwrite by the no-op call).
      const exec = await getExecution();
      expect(exec.status).toBe("failed");
      expect(exec.error).toBe("boom");
      expect(exec.errorStepId).toBe("step-1");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // completeExecution (driven through the SQS handler resume path)
  // ───────────────────────────────────────────────────────────────────────────

  describe("completeExecution via resume handler", () => {
    function seedWaiting() {
      return Promise.all([
        db
          .insert(workflow)
          .values(waitNoTransitionWorkflow())
          .then(() => undefined),
        db
          .insert(workflowExecution)
          .values(
            executionRow(ids, {
              id: EXEC_ID,
              status: "waiting",
              currentStepId: "step-wait",
              waitingForEvent: "x",
            })
          )
          .then(() => undefined),
      ]);
    }

    const resumeEvent = makeSQSEvent({
      type: "resume",
      executionId: EXEC_ID,
      branch: "timeout",
    });

    it("completes the execution and increments completedExecutions once", async () => {
      await db.insert(workflow).values(waitNoTransitionWorkflow());
      await db.insert(workflowExecution).values(
        executionRow(ids, {
          id: EXEC_ID,
          status: "waiting",
          currentStepId: "step-wait",
          waitingForEvent: "x",
        })
      );
      // activeExecutions starts at 1 (the execution is in-flight); completion
      // decrements it via GREATEST(0, activeExecutions - 1).
      await db
        .update(workflow)
        .set({ activeExecutions: 1 })
        .where(eq(workflow.id, WF_ID));

      const result = await handler(resumeEvent);
      expect(result.batchItemFailures).toEqual([]);

      const exec = await getExecution();
      expect(exec.status).toBe("completed");
      expect(exec.completedAt).not.toBeNull();

      // No next step to enqueue — completion path, not continuation.
      expect(enqueueWorkflowStep).not.toHaveBeenCalled();

      const wf = await getWorkflow();
      expect(wf.completedExecutions).toBe(1);
      expect(wf.activeExecutions).toBe(0);
    });

    it("is idempotent across duplicate SQS delivery — counters unchanged on 2nd delivery (Unit 25)", async () => {
      await db.insert(workflow).values(waitNoTransitionWorkflow());
      await db.insert(workflowExecution).values(
        executionRow(ids, {
          id: EXEC_ID,
          status: "waiting",
          currentStepId: "step-wait",
          waitingForEvent: "x",
        })
      );
      await db
        .update(workflow)
        .set({ activeExecutions: 1 })
        .where(eq(workflow.id, WF_ID));

      await handler(resumeEvent);
      // SQS redelivers the exact same message. The resume atomic-claim
      // (UPDATE … WHERE status='waiting') now matches zero rows because the
      // execution is 'completed', so completeExecution is never reached.
      const second = await handler(resumeEvent);
      expect(second.batchItemFailures).toEqual([]);

      const wf = await getWorkflow();
      expect(wf.completedExecutions).toBe(1);
      expect(wf.activeExecutions).toBe(0);
    });

    it("concurrent resume race — exactly one delivery transitions the execution", async () => {
      await seedWaiting();
      await db
        .update(workflow)
        .set({ activeExecutions: 1 })
        .where(eq(workflow.id, WF_ID));

      // Two deliveries of the same resume awaited together. Only one can win the
      // atomic claim (UPDATE … WHERE status='waiting'); the loser is a no-op.
      await Promise.all([handler(resumeEvent), handler(resumeEvent)]);

      const exec = await getExecution();
      expect(exec.status).toBe("completed");

      const wf = await getWorkflow();
      // The race must not double-count: exactly one completion.
      expect(wf.completedExecutions).toBe(1);
      expect(wf.activeExecutions).toBe(0);
    });
  });
});
