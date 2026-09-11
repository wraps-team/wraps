/**
 * Webhook Rendering Failure — Cross-Org IDOR Regression (Plan 303)
 *
 * processRenderingFailure reads `tags.executionId` off the incoming SES
 * message tags — data that travels with the message and is therefore
 * attacker-influenced for any customer sending directly through their own
 * SES account into their own Wraps-deployed event stream. The `tx.update
 * (workflowExecution)` it used to run carried no organizationId predicate,
 * so a caller in org A could name an execution id belonging to org B and
 * have that execution marked "failed" — invisible to the org-scoped-update
 * plugin because the receiver was `tx`, not `db` (fixed by Step 2 of this
 * plan; this test proves Step 1's fix independently of that).
 *
 * What this proves, against persisted DB state (not Drizzle internals):
 *  - Delivering a Rendering Failure event for ORG A's message, with
 *    tags.executionId set to ORG B's execution id, leaves org B's execution
 *    status UNCHANGED and org B's workflow.activeExecutions UNCHANGED.
 *
 * Boundary mocks ONLY: none needed — processRenderingFailure's workflow-
 * execution/workflow updates are plain DB writes, no SQS/Scheduler calls on
 * the failure path this test exercises.
 * Everything else (including @wraps/db) is REAL.
 */

import { db, eq, messageSend, workflow, workflowExecution } from "@wraps/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  type BaseOrgFixture,
  cleanupBaseOrg,
  clearWorkflowState,
  executionRow,
  messageSendRow,
  seedBaseOrg,
  workflowRow,
} from "../(ee)/__tests__/fixtures/real-db";
import { buildRenderingFailureEvent } from "./fixtures/ses-events";

const { Elysia } = await import("elysia");
const { webhooksRoutes } = await import("../routes/webhooks");

const TEST_PREFIX = "wh-render-fail-idor-db";

let fixture: BaseOrgFixture;

function createTestApp() {
  return new Elysia().use(webhooksRoutes);
}

function postWebhook(
  accountNumber: string,
  secret: string,
  event: Record<string, unknown>
) {
  return createTestApp().handle(
    new Request(`http://localhost/webhooks/ses/${accountNumber}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-wraps-api-key": secret,
      },
      body: JSON.stringify(event),
    })
  );
}

describe("Webhook: Rendering Failure (real DB) — cross-org IDOR via tags.executionId", () => {
  beforeAll(async () => {
    fixture = await seedBaseOrg(TEST_PREFIX);
  });

  beforeEach(async () => {
    await clearWorkflowState(fixture.ids.org, fixture.ids.otherOrg);
  });

  afterAll(async () => {
    await cleanupBaseOrg(TEST_PREFIX);
  });

  it("does not fail another org's workflowExecution when tags.executionId names it", async () => {
    const { ids } = fixture;
    const messageId = `${TEST_PREFIX}-ses-render-fail`;

    // 1. messageSend in PRIMARY org (org A) — the message whose event we deliver.
    await db.insert(messageSend).values(
      messageSendRow(ids, {
        id: `${ids.org}-render-fail-msg`,
        messageId,
        status: "sent",
      })
    );

    // 2. Workflow + ACTIVE execution in the OTHER org (org B) — the target
    //    the attacker names via tags.executionId. Seed workflow.activeExecutions
    //    = 1 so a wrongful decrement is observable, not just a status flip.
    const otherWfId = `${ids.otherOrg}-render-fail-wf`;
    await db.insert(workflow).values(
      workflowRow(ids, {
        id: otherWfId,
        organizationId: ids.otherOrg,
        createdBy: ids.user,
        activeExecutions: 1,
      })
    );
    const otherExecId = `${ids.otherOrg}-render-fail-exec`;
    await db.insert(workflowExecution).values(
      executionRow(ids, {
        id: otherExecId,
        workflowId: otherWfId,
        contactId: ids.otherContact,
        organizationId: ids.otherOrg,
        status: "active",
      })
    );

    // 3. Deliver a Rendering Failure event to ORG A's webhook endpoint,
    //    carrying tags.executionId pointed at ORG B's execution.
    const res = await postWebhook(
      fixture.accountNumber,
      fixture.secret,
      buildRenderingFailureEvent({
        mail: { messageId, tags: { executionId: [otherExecId] } },
      })
    );
    expect(res.status).toBe(200);

    // 4. Org B's execution must be UNTOUCHED: still "active", not "failed".
    const [otherExec] = await db
      .select()
      .from(workflowExecution)
      .where(eq(workflowExecution.id, otherExecId));
    expect(otherExec?.status).toBe("active");

    // 5. Org B's workflow.activeExecutions must be UNCHANGED (still 1, not
    //    decremented by the cross-org "failure").
    const [otherWf] = await db
      .select()
      .from(workflow)
      .where(eq(workflow.id, otherWfId));
    expect(otherWf?.activeExecutions).toBe(1);
  });
});
