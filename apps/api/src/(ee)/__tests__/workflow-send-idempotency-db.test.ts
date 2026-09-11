/**
 * Workflow send idempotency — claim-before-send (real DB)
 *
 * Plan 034. `handleSendEmail` used to send via SES first and record the
 * `messageSend` row after. If the Lambda crashes/times out between the SES
 * accept and the step being marked `completed`, the step's stale `executing`
 * row is reclaimed after STEP_EXECUTION_TIMEOUT_MINUTES and the handler
 * re-runs — sending the same email a second time with a new SES messageId.
 *
 * `handleSendEmail` now claims a `messageSend` row (status: "queued") for
 * (workflowExecutionId, stepId) BEFORE calling SES, via the partial unique
 * index `message_send_workflow_step_dedup_idx`. A second invocation for the
 * same (executionId, stepId) — the cheap equivalent of waiting out a
 * 15-minute reclaim — loses the claim, sees the first invocation's recorded
 * messageId, and skips the send instead of duplicating it.
 *
 * What is mocked: ONLY the true boundaries — the SES client (never reached
 * over the network in tests) and ../../services/credentials (STS AssumeRole).
 * @wraps/db is NEVER mocked — we seed rows, run the function, and read rows
 * back, mirroring workflow-processor-core-db.test.ts.
 *
 * TEST_PREFIX: wf-send-idem-db (unique across all *-db.test.ts files)
 */

import {
  contact as contactTable,
  db,
  eq,
  messageSend,
  template as templateTable,
  workflow,
  workflowExecution,
} from "@wraps/db";
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

// ─────────────────────────────────────────────────────────────────────────────
// Boundary mocks (must be declared before importing the handler under test).
// ─────────────────────────────────────────────────────────────────────────────

let sesSendCount = 0;
let sesMessageIdCounter = 0;

vi.mock("@aws-sdk/client-sesv2", () => {
  class MockSESv2Client {
    send() {
      sesSendCount++;
      sesMessageIdCounter++;
      return Promise.resolve({ MessageId: `ses-msg-${sesMessageIdCounter}` });
    }
  }
  // biome-ignore lint: constructor returns input for pass-through
  function SendEmailCommand(this: unknown, input: unknown) {
    return input;
  }
  return { SESv2Client: MockSESv2Client, SendEmailCommand };
});

vi.mock("../../services/credentials", () => ({
  getCredentials: vi.fn().mockResolvedValue({
    accessKeyId: "AKIA-TEST",
    secretAccessKey: "secret-test",
    sessionToken: "session-test",
  }),
}));

vi.mock("../../lib/activation-tracking", () => ({
  trackFirstEmailSent: vi.fn().mockResolvedValue(undefined),
}));

// The template fixture has no sesTemplateName, so handleSendEmail attempts to
// auto-publish before falling back to raw HTML. Mock this SES-template write
// too (a true network boundary) rather than let it fail-and-log on every run.
vi.mock("@wraps/email", async () => {
  const actual =
    await vi.importActual<typeof import("@wraps/email")>("@wraps/email");
  return { ...actual, upsertSESTemplate: vi.fn().mockResolvedValue(undefined) };
});

// Recipient-facing link bases have no platform fallback — handleSendEmail
// throws unless the deployment configures its own URLs.
process.env.API_BASE_URL = "https://api.test.local";
process.env.APP_BASE_URL = "https://app.test.local";

const { handleSendEmail, WORKFLOW_SEND_CLAIM_STALE_MINUTES } = await import(
  "../workers/workflow-step-handlers"
);

const TEST_PREFIX = "wf-send-idem-db";
const ids = baseOrgIds(TEST_PREFIX);

const WF_ID = `${ids.org}-wf`;
const EXEC_ID = `${ids.org}-exec`;
const TEMPLATE_ID = `${ids.org}-tmpl`;
const STEP_ID = "step-send-email";
const OTHER_STEP_ID = "step-send-email-2";

const emailStepConfig = {
  type: "send_email" as const,
  templateId: TEMPLATE_ID,
};

function sendEmailStep(stepId: string) {
  return {
    id: stepId,
    type: "send_email" as const,
    name: "Send email",
    position: { x: 0, y: 0 },
    config: emailStepConfig,
  };
}

async function seedWorkflowGraph() {
  await db.insert(workflow).values(
    workflowRow(ids, {
      id: WF_ID,
      defaultFrom: "noreply@example.com",
      defaultFromName: "Test Sender",
      awsAccountId: ids.awsAccount,
      steps: [sendEmailStep(STEP_ID), sendEmailStep(OTHER_STEP_ID)],
      transitions: [],
    })
  );
  await db.insert(workflowExecution).values(
    executionRow(ids, {
      id: EXEC_ID,
      workflowId: WF_ID,
      status: "active",
      currentStepId: STEP_ID,
    })
  );
  await db.insert(templateTable).values({
    id: TEMPLATE_ID,
    organizationId: ids.org,
    name: "Test Template",
    subject: "Hello {{firstName}}",
    emailType: "marketing",
    channel: "email",
    content: {},
    compiledHtml: "<h1>Hi {{firstName}}</h1>",
    sesTemplateName: null,
  } as typeof templateTable.$inferInsert);
}

async function getExecution() {
  const [row] = await db
    .select()
    .from(workflowExecution)
    .where(eq(workflowExecution.id, EXEC_ID))
    .limit(1);
  return row;
}

async function getContact() {
  const [row] = await db
    .select()
    .from(contactTable)
    .where(eq(contactTable.id, ids.contact))
    .limit(1);
  return row;
}

async function getMessageSendRows() {
  return db
    .select()
    .from(messageSend)
    .where(eq(messageSend.workflowExecutionId, EXEC_ID));
}

/**
 * Seed a pre-existing claim row for (EXEC_ID, STEP_ID), as if a prior
 * handleSendEmail invocation had claimed it and then crashed before (or
 * during) the SES call — i.e. before this same test ever calls
 * handleSendEmail itself. `claimedAt` controls whether the stale-reclaim or
 * fresh-in-progress branch is exercised.
 */
async function seedQueuedClaim(claimedAt: Date) {
  await db.insert(messageSend).values({
    organizationId: ids.org,
    contactId: ids.contact,
    awsAccountId: ids.awsAccount,
    channel: "email",
    sourceType: "workflow",
    workflowExecutionId: EXEC_ID,
    stepId: STEP_ID,
    recipient: `${TEST_PREFIX}-c1@example.com`,
    emailTemplateId: TEMPLATE_ID,
    status: "queued",
    claimedAt,
  } as typeof messageSend.$inferInsert);
}

describe("Workflow send idempotency (real DB)", () => {
  beforeAll(async () => {
    await seedBaseOrg(TEST_PREFIX);
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    sesSendCount = 0;
    sesMessageIdCounter = 0;
    await clearWorkflowState(ids.org);
    await db.delete(templateTable).where(eq(templateTable.id, TEMPLATE_ID));
    await seedWorkflowGraph();
  });

  afterAll(async () => {
    await db.delete(templateTable).where(eq(templateTable.id, TEMPLATE_ID));
    await cleanupBaseOrg(TEST_PREFIX);
  });

  it(
    "reclaim does not double-send: two handleSendEmail invocations for the " +
      "same (executionId, stepId) produce exactly one SES send and one " +
      "messageSend row",
    async () => {
      const execution = await getExecution();
      const contactRecord = await getContact();

      // First invocation: the "original" attempt (SES accepts, but — in the
      // pre-fix world — the crash happens before the step is marked
      // completed).
      await handleSendEmail(
        emailStepConfig,
        execution,
        contactRecord,
        ids.org,
        STEP_ID
      );

      // Second invocation: the "reclaim" — a redelivered/retried SQS message
      // re-runs the same step after the stale-executing timeout. This is the
      // cheap equivalent of waiting out STEP_EXECUTION_TIMEOUT_MINUTES. The
      // claim on (executionId, stepId) already carries a messageId, so this
      // is an idempotent replay — no second SES send.
      const second = await handleSendEmail(
        emailStepConfig,
        execution,
        contactRecord,
        ids.org,
        STEP_ID
      );

      expect(sesSendCount).toBe(1);
      expect(second.data.replay).toBe(true);
      expect(second.data.messageId).toBe("ses-msg-1");

      const rows = await getMessageSendRows();
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe("sent");
      expect(rows[0].messageId).toBe("ses-msg-1");
      expect(rows[0].stepId).toBe(STEP_ID);
    }
  );

  it("distinct steps still send: two different send_email steps in one execution each produce a send", async () => {
    const execution = await getExecution();
    const contactRecord = await getContact();

    await handleSendEmail(
      emailStepConfig,
      execution,
      contactRecord,
      ids.org,
      STEP_ID
    );
    await handleSendEmail(
      emailStepConfig,
      execution,
      contactRecord,
      ids.org,
      OTHER_STEP_ID
    );

    // Different stepId → different dedup key → the second call is NOT a
    // replay of the first; the claim-before-send guard must not over-collapse
    // distinct steps in the same execution.
    expect(sesSendCount).toBe(2);

    const rows = await getMessageSendRows();
    expect(rows).toHaveLength(2);
    const stepIds = rows.map((r) => r.stepId).sort();
    expect(stepIds).toEqual([OTHER_STEP_ID, STEP_ID].sort());
    for (const row of rows) {
      expect(row.status).toBe("sent");
      expect(row.messageId).toBeTruthy();
    }
  });

  it("happy path unchanged: a normal single send records status sent with the messageId", async () => {
    const execution = await getExecution();
    const contactRecord = await getContact();

    const result = await handleSendEmail(
      emailStepConfig,
      execution,
      contactRecord,
      ids.org,
      STEP_ID
    );

    expect(sesSendCount).toBe(1);
    expect(result.data.messageId).toBe("ses-msg-1");

    const rows = await getMessageSendRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("sent");
    expect(rows[0].stepId).toBe(STEP_ID);
  });

  it("stale claim is reclaimed and DOES send: a crash-before-SES attempt recovers instead of dropping mail", async () => {
    const execution = await getExecution();
    const contactRecord = await getContact();

    // Simulate a prior invocation that claimed the row and then crashed
    // before ever reaching SES: status 'queued', no messageId, claimedAt
    // past the staleness window.
    const staleClaimedAt = new Date(
      Date.now() - (WORKFLOW_SEND_CLAIM_STALE_MINUTES + 5) * 60 * 1000
    );
    await seedQueuedClaim(staleClaimedAt);

    const result = await handleSendEmail(
      emailStepConfig,
      execution,
      contactRecord,
      ids.org,
      STEP_ID
    );

    // The stale claim was reclaimed and sent — not treated as a replay and
    // not skipped. Exactly one SES send.
    expect(sesSendCount).toBe(1);
    expect(result.data.replay).toBeUndefined();
    expect(result.data.skipped).toBeUndefined();
    expect(result.data.messageId).toBe("ses-msg-1");

    const rows = await getMessageSendRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("sent");
    expect(rows[0].messageId).toBe("ses-msg-1");
    expect(rows[0].stepId).toBe(STEP_ID);
    // claimedAt was advanced by the reclaim UPDATE — no longer the original
    // stale timestamp.
    expect(rows[0].claimedAt?.getTime()).not.toBe(staleClaimedAt.getTime());
  });

  it("fresh claim is NOT reclaimed and does NOT send: another active attempt still owns it", async () => {
    const execution = await getExecution();
    const contactRecord = await getContact();

    // Simulate a claim made moments ago by another (still in-flight)
    // invocation: status 'queued', no messageId, claimedAt well within the
    // staleness window.
    const freshClaimedAt = new Date(
      Date.now() -
        Math.max(1, WORKFLOW_SEND_CLAIM_STALE_MINUTES - 10) * 60 * 1000
    );
    await seedQueuedClaim(freshClaimedAt);

    const result = await handleSendEmail(
      emailStepConfig,
      execution,
      contactRecord,
      ids.org,
      STEP_ID
    );

    // No send: the fresh claim is left alone for its owner to finish.
    expect(sesSendCount).toBe(0);
    expect(result.data.skipped).toBe(true);
    expect(result.data.reason).toBe("send_claim_in_progress");

    const rows = await getMessageSendRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("queued");
    expect(rows[0].messageId).toBeNull();
    expect(rows[0].claimedAt?.getTime()).toBe(freshClaimedAt.getTime());
  });
});
