/**
 * Webhook complaint / suppression atomicity tests (real DB)
 *
 * processComplaint and processSuppression move the message_send row, bump the
 * batch counter and write the contact in ONE transaction. If the contact write
 * fails, the route returns 500 and everything rolls back, so the EventBridge
 * retry sees an untransitioned row and the contact is still marked
 * complained / suppressed. Before this the retry hit the duplicate-event early
 * return and the contact update was lost for good.
 *
 * Only the true boundaries are mocked: the SQS queue and the activation tracker.
 * `@wraps/db` is real. These tests need apps/web/.env.test and the migration
 * that adds the soft-bounce columns (0097) applied to the test branch.
 */

import { batchSend, contact, db, eq, messageSend } from "@wraps/db";
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
import {
  markContactComplained,
  markContactSuppressed,
} from "../services/contact-bounce";
import {
  buildBounceEvent,
  buildComplaintEvent,
  buildSuppressionEvent,
} from "./fixtures/ses-events";

vi.mock("../services/workflow-queue", () => ({
  enqueueWorkflowStep: vi.fn().mockResolvedValue(undefined),
  deleteScheduledStep: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/activation-tracking", () => ({
  trackFirstEmailDelivered: vi.fn().mockResolvedValue(undefined),
}));

// Real implementations by default; a test can make one reject once to prove the
// transition and the contact write roll back together.
vi.mock("../services/contact-bounce", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../services/contact-bounce")>();
  return {
    ...actual,
    markContactComplained: vi.fn(actual.markContactComplained),
    markContactSuppressed: vi.fn(actual.markContactSuppressed),
  };
});

const { webhooksRoutes } = await import("../routes/webhooks");

const TEST_PREFIX = "wh-contact-atomic-db";
const T0 = new Date("2026-10-01T10:00:00.000Z");

let fixture: BaseOrgFixture;
let seq = 0;
const batchIds: string[] = [];

function postEvent(event: Record<string, unknown>) {
  return new Elysia().use(webhooksRoutes).handle(
    new Request(`http://localhost/webhooks/ses/${fixture.accountNumber}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-wraps-api-key": fixture.secret,
      },
      body: JSON.stringify(event),
    })
  );
}

/** Seed a `sent` message_send linked to the fixture contact; returns its SES message id. */
async function seedSend(batchSendId: string | null = null): Promise<string> {
  seq += 1;
  const messageId = `${TEST_PREFIX}-mid-${seq}`;
  await db.insert(messageSend).values(
    messageSendRow(fixture.ids, {
      id: `${TEST_PREFIX}-send-${seq}`,
      messageId,
      recipient: `${TEST_PREFIX}-${seq}@example.com`,
      status: "sent",
      contactId: fixture.ids.contact,
      ...(batchSendId ? { sourceType: "batch", batchSendId } : {}),
    })
  );
  return messageId;
}

async function seedBatch(): Promise<string> {
  seq += 1;
  const id = `${TEST_PREFIX}-batch-${seq}`;
  await db.insert(batchSend).values({
    id,
    organizationId: fixture.ids.org,
    awsAccountId: fixture.ids.awsAccount,
    channel: "email",
    status: "completed",
    audienceType: "all",
    totalRecipients: 1,
    processedRecipients: 1,
    sent: 1,
    complained: 0,
    suppressed: 0,
  } as typeof batchSend.$inferInsert);
  batchIds.push(id);
  return id;
}

async function readSend(messageId: string) {
  const [row] = await db
    .select({
      status: messageSend.status,
      complainedAt: messageSend.complainedAt,
      suppressedAt: messageSend.suppressedAt,
      bouncedAt: messageSend.bouncedAt,
    })
    .from(messageSend)
    .where(eq(messageSend.messageId, messageId));
  return row;
}

async function readContact() {
  const [row] = await db
    .select({
      emailStatus: contact.emailStatus,
      emailComplainedAt: contact.emailComplainedAt,
      emailSuppressedAt: contact.emailSuppressedAt,
    })
    .from(contact)
    .where(eq(contact.id, fixture.ids.contact));
  return row;
}

async function readBatch(id: string) {
  const [row] = await db
    .select({
      complained: batchSend.complained,
      suppressed: batchSend.suppressed,
    })
    .from(batchSend)
    .where(eq(batchSend.id, id));
  return row;
}

function complaintEvent(messageId: string) {
  return buildComplaintEvent({
    mail: { messageId },
    complainedAt: T0.toISOString(),
  });
}

function suppressionEvent(messageId: string) {
  return buildSuppressionEvent({
    mail: { messageId },
    suppressedAt: T0.toISOString(),
  });
}

describe("webhook complaint / suppression atomicity (real DB)", () => {
  beforeAll(async () => {
    fixture = await seedBaseOrg(TEST_PREFIX);
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    await clearWorkflowState(fixture.ids.org, fixture.ids.otherOrg);
    await db
      .update(contact)
      .set({
        emailStatus: "active",
        emailComplainedAt: null,
        emailSuppressedAt: null,
      })
      .where(eq(contact.id, fixture.ids.contact));
  });

  afterAll(async () => {
    for (const id of batchIds) {
      await db.delete(messageSend).where(eq(messageSend.batchSendId, id));
      await db.delete(batchSend).where(eq(batchSend.id, id));
    }
    await cleanupBaseOrg(TEST_PREFIX);
  });

  it("a failed complaint contact write rolls the transition back and the retry recovers", async () => {
    const messageId = await seedSend();
    const event = complaintEvent(messageId);
    vi.mocked(markContactComplained).mockRejectedValueOnce(new Error("boom"));

    const failed = await postEvent(event);
    expect(failed.status).toBe(500);

    const send = await readSend(messageId);
    expect(send.status).toBe("sent");
    expect(send.complainedAt).toBeNull();
    const untouched = await readContact();
    expect(untouched.emailStatus).toBe("active");

    const retried = await postEvent(event);
    expect(retried.status).toBe(200);

    const sendAfter = await readSend(messageId);
    expect(sendAfter.status).toBe("complained");
    const row = await readContact();
    expect(row.emailStatus).toBe("complained");
    expect(row.emailComplainedAt).not.toBeNull();
  });

  it("a failed suppression contact write rolls the transition back and the retry recovers", async () => {
    const messageId = await seedSend();
    const event = suppressionEvent(messageId);
    vi.mocked(markContactSuppressed).mockRejectedValueOnce(new Error("boom"));

    const failed = await postEvent(event);
    expect(failed.status).toBe(500);

    const send = await readSend(messageId);
    expect(send.status).toBe("sent");
    expect(send.suppressedAt).toBeNull();
    const untouched = await readContact();
    expect(untouched.emailStatus).toBe("active");

    const retried = await postEvent(event);
    expect(retried.status).toBe(200);

    const sendAfter = await readSend(messageId);
    expect(sendAfter.status).toBe("suppressed");
    const row = await readContact();
    expect(row.emailStatus).toBe("suppressed");
    expect(row.emailSuppressedAt).not.toBeNull();
  });

  it("a Suppressed-subtype bounce goes through the same atomic path", async () => {
    const messageId = await seedSend();
    const event = buildBounceEvent({
      mail: { messageId },
      bounceType: "Permanent",
      bounceSubType: "Suppressed",
      bouncedAt: T0.toISOString(),
    });
    vi.mocked(markContactSuppressed).mockRejectedValueOnce(new Error("boom"));

    const failed = await postEvent(event);
    expect(failed.status).toBe(500);

    const send = await readSend(messageId);
    expect(send.status).toBe("sent");
    expect(send.suppressedAt).toBeNull();
    const untouched = await readContact();
    expect(untouched.emailStatus).toBe("active");

    const retried = await postEvent(event);
    expect(retried.status).toBe(200);

    const sendAfter = await readSend(messageId);
    expect(sendAfter.status).toBe("suppressed");
    const row = await readContact();
    expect(row.emailStatus).toBe("suppressed");
  });

  it("happy path: complaint and suppression mark the contact, and a duplicate changes nothing", async () => {
    const complaintId = await seedSend();
    const complaint = complaintEvent(complaintId);
    expect((await postEvent(complaint)).status).toBe(200);

    const afterComplaint = await readContact();
    expect(afterComplaint.emailStatus).toBe("complained");
    const complainedAt = afterComplaint.emailComplainedAt;
    expect(complainedAt?.toISOString()).toBe(T0.toISOString());
    expect((await readSend(complaintId)).status).toBe("complained");

    // Duplicate: markContactComplained is not called again and nothing moves.
    vi.mocked(markContactComplained).mockClear();
    expect((await postEvent(complaint)).status).toBe(200);
    expect(markContactComplained).not.toHaveBeenCalled();
    const dupComplaint = await readContact();
    expect(dupComplaint.emailStatus).toBe("complained");
    expect(dupComplaint.emailComplainedAt?.toISOString()).toBe(
      T0.toISOString()
    );

    // Fresh active contact state for the suppression half.
    await db
      .update(contact)
      .set({ emailStatus: "active", emailComplainedAt: null })
      .where(eq(contact.id, fixture.ids.contact));

    const suppressedId = await seedSend();
    const suppression = suppressionEvent(suppressedId);
    expect((await postEvent(suppression)).status).toBe(200);

    const afterSuppression = await readContact();
    expect(afterSuppression.emailStatus).toBe("suppressed");
    expect(afterSuppression.emailSuppressedAt?.toISOString()).toBe(
      T0.toISOString()
    );
    expect((await readSend(suppressedId)).status).toBe("suppressed");

    vi.mocked(markContactSuppressed).mockClear();
    expect((await postEvent(suppression)).status).toBe(200);
    expect(markContactSuppressed).not.toHaveBeenCalled();
    expect((await readContact()).emailStatus).toBe("suppressed");
  });

  it("the batch counter rolls back with a failed contact write and increments once on retry", async () => {
    const batchId = await seedBatch();
    const messageId = await seedSend(batchId);
    const event = complaintEvent(messageId);
    vi.mocked(markContactComplained).mockRejectedValueOnce(new Error("boom"));

    const failed = await postEvent(event);
    expect(failed.status).toBe(500);
    expect((await readBatch(batchId)).complained).toBe(0);

    const retried = await postEvent(event);
    expect(retried.status).toBe(200);
    expect((await readBatch(batchId)).complained).toBe(1);

    // A further duplicate must not increment again.
    expect((await postEvent(event)).status).toBe(200);
    expect((await readBatch(batchId)).complained).toBe(1);
  });
});
