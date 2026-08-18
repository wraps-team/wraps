/**
 * Webhook Reject Tests (real DB)
 *
 * Unit 30 — a SES Reject event marks the messageSend as `failed`.
 *
 * Behavioral, real-Neon-DB version of `processReject` (routes/webhooks.ts).
 * SES rejects a message before delivery (bad content, account reputation).
 * The `message_send_status` enum has NO `rejected` value
 * (see packages/db/src/schema/batch.ts), so a Reject maps to `status="failed"`
 * — a documented build deviation. We seed a real `messageSend` row, POST a real
 * SES Reject event through the route, then re-query the persisted row to assert
 * its status. No coupling to query-builder internals.
 *
 * `processReject` also has a precedence guard
 * (`notInArray(status, ["bounced","complained"])`) so a late Reject cannot
 * overwrite a terminal bounce/complaint.
 *
 * On execution resumption: `processReject` does NOT directly mutate waiting
 * executions. It calls `resumeWaitingExecutions`, which ENQUEUES a `resume`
 * job (branch "bounced") onto SQS — the actual status transition happens
 * downstream in the processor. So here we assert the resume job is enqueued
 * and the execution row itself stays `waiting` (the webhook leaves it alone).
 *
 * Only true boundaries are mocked: the SQS queue (`workflow-queue`) and the
 * activation tracker (`activation-tracking`). `@wraps/db` is REAL — the
 * `messageSend.status` write under test runs against Neon.
 */

import { db, eq, messageSend, workflow, workflowExecution } from "@wraps/db";
import { Elysia } from "elysia";
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
  type BaseOrgFixture,
  cleanupBaseOrg,
  clearWorkflowState,
  executionRow,
  messageSendRow,
  seedBaseOrg,
  workflowRow,
} from "../(ee)/__tests__/fixtures/real-db";
import { buildRejectEvent } from "./fixtures/ses-events";

vi.mock("../services/workflow-queue", () => ({
  enqueueWorkflowStep: vi.fn().mockResolvedValue(undefined),
  deleteScheduledStep: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/activation-tracking", () => ({
  trackFirstEmailDelivered: vi.fn().mockResolvedValue(undefined),
}));

const { webhooksRoutes } = await import("../routes/webhooks");
const { enqueueWorkflowStep } = await import("../services/workflow-queue");

const TEST_PREFIX = "wh-reject-db";

let fixture: BaseOrgFixture;

function createApp() {
  return new Elysia().use(webhooksRoutes);
}

function postReject(accountNumber: string, messageId: string, secret: string) {
  const event = buildRejectEvent({ mail: { messageId } });
  return createApp().handle(
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

async function seedMessage(
  messageId: string,
  status: "sent" | "bounced" | "complained"
) {
  await db.insert(messageSend).values(
    messageSendRow(fixture.ids, {
      id: `${TEST_PREFIX}-msg-${status}`,
      messageId,
      status,
    })
  );
}

async function getMessage(messageId: string) {
  const [row] = await db
    .select({
      status: messageSend.status,
      error: messageSend.error,
    })
    .from(messageSend)
    .where(eq(messageSend.messageId, messageId))
    .limit(1);
  return row;
}

describe("webhook reject → messageSend failed (real DB)", () => {
  beforeAll(async () => {
    fixture = await seedBaseOrg(TEST_PREFIX);
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    await clearWorkflowState(fixture.ids.org, fixture.ids.otherOrg);
  });

  afterAll(async () => {
    await cleanupBaseOrg(TEST_PREFIX);
  });

  it("marks a 'sent' messageSend as 'failed' (enum has no 'rejected')", async () => {
    const messageId = `${TEST_PREFIX}-mid-sent`;
    await seedMessage(messageId, "sent");

    const res = await postReject(
      fixture.accountNumber,
      messageId,
      fixture.secret
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("processed");
    expect(body.eventType).toBe("Reject");

    const row = await getMessage(messageId);
    expect(row.status).toBe("failed");
    // The enum cannot say "rejected", so the reason lives in `error`. Without
    // it the dashboard shows a bare "Failed" and no cause.
    expect(row.error).toBe("Rejected by SES");
  });

  it("does NOT overwrite a terminal 'bounced' status (precedence guard)", async () => {
    const messageId = `${TEST_PREFIX}-mid-bounced`;
    await seedMessage(messageId, "bounced");

    const res = await postReject(
      fixture.accountNumber,
      messageId,
      fixture.secret
    );
    expect(res.status).toBe(200);

    const row = await getMessage(messageId);
    expect(row.status).toBe("bounced");
    expect(row.error).toBeNull();
  });

  it("does NOT overwrite a terminal 'complained' status (precedence guard)", async () => {
    const messageId = `${TEST_PREFIX}-mid-complained`;
    await seedMessage(messageId, "complained");

    const res = await postReject(
      fixture.accountNumber,
      messageId,
      fixture.secret
    );
    expect(res.status).toBe(200);

    const row = await getMessage(messageId);
    expect(row.status).toBe("complained");
  });

  it("enqueues a resume job for an execution waiting on this message; the execution row stays 'waiting'", async () => {
    const messageId = `${TEST_PREFIX}-mid-waiting`;
    await seedMessage(messageId, "sent");

    // Seed the workflow + a waiting execution keyed on this message's engagement.
    // (clearWorkflowState removed any prior copy in beforeEach.)
    await db.insert(workflow).values(workflowRow(fixture.ids));

    const executionId = `${TEST_PREFIX}-exec-waiting`;
    await db.insert(workflowExecution).values(
      executionRow(fixture.ids, {
        id: executionId,
        status: "waiting",
        waitingForEvent: `email_engagement:${messageId}`,
        currentStepId: "step-1",
      })
    );

    const res = await postReject(
      fixture.accountNumber,
      messageId,
      fixture.secret
    );
    expect(res.status).toBe(200);

    // Message is failed.
    const msg = await getMessage(messageId);
    expect(msg.status).toBe("failed");

    // A resume job (branch "bounced") was enqueued for the waiting execution.
    expect(enqueueWorkflowStep).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "resume",
        executionId,
        branch: "bounced",
        organizationId: fixture.ids.org,
      })
    );

    // The webhook does NOT mutate the execution row — it stays 'waiting' until
    // the processor handles the enqueued resume job.
    const [exec] = await db
      .select({ status: workflowExecution.status })
      .from(workflowExecution)
      .where(eq(workflowExecution.id, executionId))
      .limit(1);
    expect(exec.status).toBe("waiting");
  });

  it("rejects a wrong secret with 401 and does not change status", async () => {
    const messageId = `${TEST_PREFIX}-mid-auth`;
    await seedMessage(messageId, "sent");

    const res = await postReject(
      fixture.accountNumber,
      messageId,
      "wrong-secret"
    );
    expect(res.status).toBe(401);

    const row = await getMessage(messageId);
    expect(row.status).toBe("sent");
  });
});
