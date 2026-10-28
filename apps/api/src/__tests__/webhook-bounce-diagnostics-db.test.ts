/**
 * Webhook Bounce Diagnostics Tests (real DB)
 *
 * A SES Bounce on a batch send stores the receiver's diagnostic in
 * message_send_diagnostic: the enhanced status, the redacted diagnostic code and
 * the reason key. A duplicate event keeps the first stored value. A bounce that
 * follows a complaint keeps both diagnostic rows. A messageId that belongs to
 * another org writes no diagnostic row.
 *
 * Only the true boundaries are mocked: the SQS queue and the activation tracker.
 * `@wraps/db` is real. These tests need apps/web/.env.test and the migration
 * that creates message_send_diagnostic (0095) applied to the test branch.
 */

import { translateDiagnosticCode } from "@wraps/core/email-diagnostics";
import { and, db, eq, messageSend, messageSendDiagnostic } from "@wraps/db";
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
  messageSendRow,
  seedBaseOrg,
} from "../(ee)/__tests__/fixtures/real-db";
import { buildBounceEvent, buildComplaintEvent } from "./fixtures/ses-events";

vi.mock("../services/workflow-queue", () => ({
  enqueueWorkflowStep: vi.fn().mockResolvedValue(undefined),
  deleteScheduledStep: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/activation-tracking", () => ({
  trackFirstEmailDelivered: vi.fn().mockResolvedValue(undefined),
}));

const { webhooksRoutes } = await import("../routes/webhooks");

const TEST_PREFIX = "wh-bounce-diag-db";

let fixture: BaseOrgFixture;

function createApp() {
  return new Elysia().use(webhooksRoutes);
}

function postEvent(
  accountNumber: string,
  event: Record<string, unknown>,
  secret: string
) {
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

async function seedSend(
  id: string,
  messageId: string,
  recipient: string,
  overrides: Partial<typeof messageSend.$inferInsert> = {}
) {
  await db.insert(messageSend).values(
    messageSendRow(fixture.ids, {
      id,
      messageId,
      recipient,
      status: "delivered",
      contactId: null,
      ...overrides,
    })
  );
}

async function diagnosticsFor(sendId: string) {
  return db
    .select({
      eventType: messageSendDiagnostic.eventType,
      organizationId: messageSendDiagnostic.organizationId,
      enhancedStatus: messageSendDiagnostic.enhancedStatus,
      diagnosticCode: messageSendDiagnostic.diagnosticCode,
      reasonKey: messageSendDiagnostic.reasonKey,
      feedbackType: messageSendDiagnostic.feedbackType,
    })
    .from(messageSendDiagnostic)
    .where(eq(messageSendDiagnostic.messageSendId, sendId));
}

async function bounceDiagnostic(sendId: string) {
  const rows = await db
    .select({
      organizationId: messageSendDiagnostic.organizationId,
      enhancedStatus: messageSendDiagnostic.enhancedStatus,
      diagnosticCode: messageSendDiagnostic.diagnosticCode,
      reasonKey: messageSendDiagnostic.reasonKey,
      feedbackType: messageSendDiagnostic.feedbackType,
    })
    .from(messageSendDiagnostic)
    .where(
      and(
        eq(messageSendDiagnostic.messageSendId, sendId),
        eq(messageSendDiagnostic.eventType, "bounce")
      )
    );
  return rows;
}

describe("webhook bounce diagnostics (real DB)", () => {
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

  it("webhook persists the diagnostic row for a batch bounce end to end", async () => {
    const messageId = `${TEST_PREFIX}-mid-diag`;
    const sendId = `${TEST_PREFIX}-send-diag`;
    const recipient = `${TEST_PREFIX}-bounce@example.com`;
    await seedSend(sendId, messageId, recipient);

    const diagnosticCode = `smtp; 550 5.1.1 <${recipient}> user unknown`;
    const res = await postEvent(
      fixture.accountNumber,
      buildBounceEvent({
        mail: { messageId },
        recipients: [recipient],
        bounceType: "Permanent",
        bounceSubType: "NoEmail",
        status: "5.1.1",
        diagnosticCode,
      }),
      fixture.secret
    );
    expect(res.status).toBe(200);

    const redacted = "smtp; 550 5.1.1 <[address]> user unknown";
    const expected = translateDiagnosticCode({
      status: "5.1.1",
      diagnosticCode: redacted,
    });
    const rows = await bounceDiagnostic(sendId);
    expect(rows).toEqual([
      {
        organizationId: fixture.ids.org,
        enhancedStatus: "5.1.1",
        diagnosticCode: redacted,
        reasonKey: `${expected?.provider ?? ""}|${expected?.code ?? ""}|${expected?.title}`,
        feedbackType: null,
      },
    ]);
    expect(JSON.stringify(rows)).not.toContain(recipient);
  });

  it("duplicate SES event leaves the first stored diagnostic in place", async () => {
    const messageId = `${TEST_PREFIX}-mid-dup`;
    const sendId = `${TEST_PREFIX}-send-dup`;
    const recipient = `${TEST_PREFIX}-dup@example.com`;
    await seedSend(sendId, messageId, recipient);

    const first = buildBounceEvent({
      mail: { messageId },
      recipients: [recipient],
      status: "5.1.1",
      diagnosticCode: "smtp; 550 5.1.1 user unknown",
    });
    const second = buildBounceEvent({
      mail: { messageId },
      recipients: [recipient],
      status: "5.7.1",
      diagnosticCode: "smtp; 550 5.7.1 policy rejection",
    });

    expect(
      (await postEvent(fixture.accountNumber, first, fixture.secret)).status
    ).toBe(200);
    expect(
      (await postEvent(fixture.accountNumber, second, fixture.secret)).status
    ).toBe(200);

    const rows = await bounceDiagnostic(sendId);
    expect(rows).toHaveLength(1);
    expect(rows[0].enhancedStatus).toBe("5.1.1");
    expect(rows[0].diagnosticCode).toBe("smtp; 550 5.1.1 user unknown");
  });

  it("event for another org's messageId writes no diagnostic row", async () => {
    const messageId = `${TEST_PREFIX}-mid-other`;
    const sendId = `${TEST_PREFIX}-send-other`;
    const recipient = `${TEST_PREFIX}-other@example.com`;
    await seedSend(sendId, messageId, recipient, {
      organizationId: fixture.ids.otherOrg,
      awsAccountId: fixture.ids.otherAwsAccount,
      contactId: fixture.ids.otherContact,
    });

    // Sent with this org's account. The org-scoped lookup finds nothing, and the
    // SDK-path insert conflicts on the global message_id index, so no diagnostic
    // is written for the other org's send.
    const res = await postEvent(
      fixture.accountNumber,
      buildBounceEvent({
        mail: { messageId },
        recipients: [recipient],
        status: "5.1.1",
        diagnosticCode: "smtp; 550 5.1.1 user unknown",
      }),
      fixture.secret
    );
    expect(res.status).toBe(200);

    expect(await diagnosticsFor(sendId)).toHaveLength(0);
  });

  it("a bounce arriving after a complaint keeps both diagnostic rows", async () => {
    const messageId = `${TEST_PREFIX}-mid-both`;
    const sendId = `${TEST_PREFIX}-send-both`;
    const recipient = `${TEST_PREFIX}-both@example.com`;
    await seedSend(sendId, messageId, recipient);

    const complaint = buildComplaintEvent({
      mail: { messageId },
      recipients: [recipient],
      complaintFeedbackType: "abuse",
    });
    const bounce = buildBounceEvent({
      mail: { messageId },
      recipients: [recipient],
      status: "5.1.1",
      diagnosticCode: "smtp; 550 5.1.1 user unknown",
    });

    expect(
      (await postEvent(fixture.accountNumber, complaint, fixture.secret)).status
    ).toBe(200);
    expect(
      (await postEvent(fixture.accountNumber, bounce, fixture.secret)).status
    ).toBe(200);

    const rows = await diagnosticsFor(sendId);
    expect(rows.map((r) => r.eventType).sort()).toEqual([
      "bounce",
      "complaint",
    ]);
    const complaintRow = rows.find((r) => r.eventType === "complaint");
    expect(complaintRow?.feedbackType).toBe("abuse");
    const bounceRow = rows.find((r) => r.eventType === "bounce");
    expect(bounceRow?.enhancedStatus).toBe("5.1.1");
  });
});
