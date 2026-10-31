/**
 * Webhook SDK-send contact linking (real DB)
 *
 * Mail sent through the SDK straight to SES (source_type = 'transactional')
 * has no contact on its message_send row. Bounce, Complaint, Suppressed and
 * Delivery events on those sends update the contact in the SAME organization
 * whose email matches the recipient, with the same rules as broadcast sends.
 * Linking happens both when the first event materializes the row and when the
 * row already exists. No matching contact means nothing happens; a contact is
 * never created, and no contact_id is persisted on the row.
 *
 * Only the true boundaries are mocked: the SQS queue and the activation tracker.
 * `@wraps/db` is real. These tests need apps/web/.env.test and the migration
 * that adds the soft-bounce columns (0097) applied to the test branch.
 */

import { contact, db, eq, hashContactValue, messageSend } from "@wraps/db";
import { count } from "drizzle-orm";
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
import { applyLifecycleToContact } from "../services/contact-bounce";
import {
  buildBounceEvent,
  buildComplaintEvent,
  buildDeliveryEvent,
  buildSuppressionEvent,
} from "./fixtures/ses-events";

vi.mock("../services/workflow-queue", () => ({
  enqueueWorkflowStep: vi.fn().mockResolvedValue(undefined),
  deleteScheduledStep: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/activation-tracking", () => ({
  trackFirstEmailDelivered: vi.fn().mockResolvedValue(undefined),
}));

// Real implementation by default; a test can make it reject once to prove the
// row insert and the contact write roll back together. (recordSoftBounce is
// called from inside this function, so the seam is the function itself.)
vi.mock("../services/contact-bounce", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../services/contact-bounce")>();
  return {
    ...actual,
    applyLifecycleToContact: vi.fn(actual.applyLifecycleToContact),
  };
});

const { webhooksRoutes } = await import("../routes/webhooks");

const TEST_PREFIX = "wh-sdk-link-db";
const HOUR = 60 * 60 * 1000;
const T0 = new Date("2026-10-01T10:00:00.000Z");
const EMAIL = `${TEST_PREFIX}-sdk@example.com`;

let fixture: BaseOrgFixture;
let seq = 0;

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

function nextMessageId(): string {
  seq += 1;
  return `${TEST_PREFIX}-mid-${seq}`;
}

function mailFor(messageId: string, destination = EMAIL) {
  return { messageId, destination: [destination] };
}

function sendEvent(messageId: string, destination: string | string[] = EMAIL) {
  return {
    version: "0",
    id: "event-send-1",
    "detail-type": "Email Sending Events",
    source: "aws.ses",
    account: "123456789012",
    time: new Date().toISOString(),
    region: "us-east-1",
    detail: {
      eventType: "Send",
      mail: {
        messageId,
        timestamp: new Date().toISOString(),
        source: "noreply@test.com",
        destination: Array.isArray(destination) ? destination : [destination],
      },
    },
  };
}

async function post200(event: Record<string, unknown>) {
  const res = await postEvent(event);
  expect(res.status).toBe(200);
}

function hardBounce(messageId: string, at: Date, destination = EMAIL) {
  return buildBounceEvent({
    mail: mailFor(messageId, destination),
    bounceType: "Permanent",
    bounceSubType: "General",
    bouncedAt: at.toISOString(),
  });
}

function softBounce(messageId: string, at: Date) {
  return buildBounceEvent({
    mail: mailFor(messageId),
    bounceType: "Transient",
    bounceSubType: "General",
    bouncedAt: at.toISOString(),
  });
}

async function readSend(messageId: string) {
  const [row] = await db
    .select({
      sourceType: messageSend.sourceType,
      contactId: messageSend.contactId,
      status: messageSend.status,
    })
    .from(messageSend)
    .where(eq(messageSend.messageId, messageId));
  return row;
}

async function readContact(id: string) {
  const [row] = await db
    .select({
      emailStatus: contact.emailStatus,
      emailSoftBounceCount: contact.emailSoftBounceCount,
      emailLastSoftBouncedAt: contact.emailLastSoftBouncedAt,
      emailBouncedAt: contact.emailBouncedAt,
      emailComplainedAt: contact.emailComplainedAt,
      emailSuppressedAt: contact.emailSuppressedAt,
    })
    .from(contact)
    .where(eq(contact.id, id));
  return row;
}

async function contactCount(orgId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(contact)
    .where(eq(contact.organizationId, orgId));
  return Number(row.n);
}

async function resetContact(
  id: string,
  email: string,
  values: Partial<typeof contact.$inferInsert> = {}
) {
  await db
    .update(contact)
    .set({
      email,
      emailHash: hashContactValue(email),
      emailStatus: "active",
      emailSoftBounceCount: 0,
      emailLastSoftBouncedAt: null,
      emailBouncedAt: null,
      emailComplainedAt: null,
      emailSuppressedAt: null,
      ...values,
    })
    .where(eq(contact.id, id));
}

describe("webhook SDK-send contact linking (real DB)", () => {
  beforeAll(async () => {
    fixture = await seedBaseOrg(TEST_PREFIX);
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    await clearWorkflowState(fixture.ids.org, fixture.ids.otherOrg);
    await resetContact(fixture.ids.contact, EMAIL);
    await resetContact(
      fixture.ids.otherContact,
      `${TEST_PREFIX}-other@example.com`
    );
  });

  afterAll(async () => {
    await cleanupBaseOrg(TEST_PREFIX);
  });

  it("1. a hard Bounce as the first event creates the row and bounces the contact", async () => {
    const messageId = nextMessageId();
    await post200(hardBounce(messageId, T0));

    const send = await readSend(messageId);
    expect(send.sourceType).toBe("transactional");
    expect(send.contactId).toBeNull();
    expect(send.status).toBe("bounced");
    const row = await readContact(fixture.ids.contact);
    expect(row.emailStatus).toBe("bounced");
    expect(row.emailBouncedAt?.toISOString()).toBe(T0.toISOString());
  });

  it("2. a Transient/General Bounce as the first event soft-bounces the contact", async () => {
    await post200(softBounce(nextMessageId(), T0));

    const row = await readContact(fixture.ids.contact);
    expect(row.emailStatus).toBe("soft_bounced");
    expect(row.emailSoftBounceCount).toBe(1);
  });

  it("3. a Complaint as the first event marks the contact complained", async () => {
    await post200(
      buildComplaintEvent({
        mail: mailFor(nextMessageId()),
        complainedAt: T0.toISOString(),
      })
    );

    const row = await readContact(fixture.ids.contact);
    expect(row.emailStatus).toBe("complained");
    expect(row.emailComplainedAt?.toISOString()).toBe(T0.toISOString());
  });

  it("4. a Suppressed event as the first event marks the contact suppressed", async () => {
    await post200(
      buildSuppressionEvent({
        mail: mailFor(nextMessageId()),
        suppressedAt: T0.toISOString(),
      })
    );

    const row = await readContact(fixture.ids.contact);
    expect(row.emailStatus).toBe("suppressed");
    expect(row.emailSuppressedAt?.toISOString()).toBe(T0.toISOString());
  });

  it("4b. an OnAccountSuppressionList Bounce as the first event marks the contact suppressed, not bounced", async () => {
    await post200(
      buildBounceEvent({
        mail: mailFor(nextMessageId()),
        bounceType: "Permanent",
        bounceSubType: "OnAccountSuppressionList",
        bouncedAt: T0.toISOString(),
      })
    );

    const row = await readContact(fixture.ids.contact);
    expect(row.emailStatus).toBe("suppressed");
    expect(row.emailSuppressedAt?.toISOString()).toBe(T0.toISOString());
  });

  it("5. Send then a hard Bounce: the row has no contact before, the contact is bounced after", async () => {
    const messageId = nextMessageId();
    await post200(sendEvent(messageId));

    const before = await readSend(messageId);
    expect(before.contactId).toBeNull();
    expect((await readContact(fixture.ids.contact)).emailStatus).toBe("active");

    await post200(hardBounce(messageId, T0));

    const after = await readSend(messageId);
    expect(after.status).toBe("bounced");
    // The link is in memory only: contact_id is never persisted on the row.
    expect(after.contactId).toBeNull();
    expect((await readContact(fixture.ids.contact)).emailStatus).toBe(
      "bounced"
    );
  });

  it("6. three soft bounces on separate messages 25h+ apart escalate to bounced", async () => {
    await post200(softBounce(nextMessageId(), T0));

    const second = nextMessageId();
    await post200(sendEvent(second));
    await post200(softBounce(second, new Date(T0.getTime() + 25 * HOUR)));
    expect((await readContact(fixture.ids.contact)).emailSoftBounceCount).toBe(
      2
    );

    await post200(
      softBounce(nextMessageId(), new Date(T0.getTime() + 50 * HOUR))
    );

    const row = await readContact(fixture.ids.contact);
    expect(row.emailStatus).toBe("bounced");
    expect(row.emailSoftBounceCount).toBe(3);
  });

  it("7. a Delivery as the first event recovers a soft-bounced contact; a stale one does not", async () => {
    await resetContact(fixture.ids.contact, EMAIL, {
      emailStatus: "soft_bounced",
      emailSoftBounceCount: 1,
      emailLastSoftBouncedAt: T0,
    });

    await post200(
      buildDeliveryEvent({
        mail: mailFor(nextMessageId()),
        deliveredAt: new Date(T0.getTime() - HOUR).toISOString(),
      })
    );
    expect((await readContact(fixture.ids.contact)).emailStatus).toBe(
      "soft_bounced"
    );

    await post200(
      buildDeliveryEvent({
        mail: mailFor(nextMessageId()),
        deliveredAt: new Date(T0.getTime() + HOUR).toISOString(),
      })
    );
    const row = await readContact(fixture.ids.contact);
    expect(row.emailStatus).toBe("active");
    expect(row.emailSoftBounceCount).toBe(0);
    expect(row.emailLastSoftBouncedAt).toBeNull();
  });

  it("8. Send then Delivery recovers a soft-bounced contact", async () => {
    await resetContact(fixture.ids.contact, EMAIL, {
      emailStatus: "soft_bounced",
      emailSoftBounceCount: 1,
      emailLastSoftBouncedAt: T0,
    });
    const messageId = nextMessageId();
    await post200(sendEvent(messageId));
    await post200(
      buildDeliveryEvent({
        mail: mailFor(messageId),
        deliveredAt: new Date(T0.getTime() + HOUR).toISOString(),
      })
    );

    const row = await readContact(fixture.ids.contact);
    expect(row.emailStatus).toBe("active");
    expect(row.emailSoftBounceCount).toBe(0);
  });

  it("9. the address match is case-insensitive", async () => {
    await post200(
      hardBounce(
        nextMessageId(),
        T0,
        `${TEST_PREFIX.toUpperCase()}-SDK@Example.com`
      )
    );

    expect((await readContact(fixture.ids.contact)).emailStatus).toBe(
      "bounced"
    );
  });

  it("10. an unknown address creates the row and no contact", async () => {
    const before = await contactCount(fixture.ids.org);
    const messageId = nextMessageId();
    await post200(
      hardBounce(messageId, T0, `${TEST_PREFIX}-nobody@example.com`)
    );

    expect((await readSend(messageId)).status).toBe("bounced");
    expect(await contactCount(fixture.ids.org)).toBe(before);
    expect((await readContact(fixture.ids.contact)).emailStatus).toBe("active");
  });

  it("11. a contact with the same address in another org is untouched", async () => {
    await resetContact(
      fixture.ids.contact,
      `${TEST_PREFIX}-primary@example.com`
    );
    await resetContact(fixture.ids.otherContact, EMAIL);

    await post200(hardBounce(nextMessageId(), T0));
    await post200(
      buildComplaintEvent({
        mail: mailFor(nextMessageId()),
        complainedAt: T0.toISOString(),
      })
    );

    const other = await readContact(fixture.ids.otherContact);
    expect(other.emailStatus).toBe("active");
    expect(other.emailBouncedAt).toBeNull();
    expect(other.emailComplainedAt).toBeNull();
    expect((await readContact(fixture.ids.contact)).emailStatus).toBe("active");
  });

  it("12. a non-transactional row with no contact is not linked by address", async () => {
    const messageId = nextMessageId();
    await db.insert(messageSend).values(
      messageSendRow(fixture.ids, {
        id: `${TEST_PREFIX}-batch-row`,
        messageId,
        recipient: EMAIL,
        sourceType: "batch",
        contactId: null,
        status: "sent",
      })
    );

    await post200(hardBounce(messageId, T0));

    expect((await readSend(messageId)).status).toBe("bounced");
    const row = await readContact(fixture.ids.contact);
    expect(row.emailStatus).toBe("active");
    expect(row.emailBouncedAt).toBeNull();
  });

  it("13. the same Bounce posted twice changes the contact once", async () => {
    const messageId = nextMessageId();
    const event = softBounce(messageId, T0);
    await post200(event);
    await post200(event);

    const row = await readContact(fixture.ids.contact);
    expect(row.emailStatus).toBe("soft_bounced");
    expect(row.emailSoftBounceCount).toBe(1);
  });

  it("14. row creation and contact write are atomic: a failed write rolls the row back and the retry recovers", async () => {
    const messageId = nextMessageId();
    const event = softBounce(messageId, T0);
    vi.mocked(applyLifecycleToContact).mockRejectedValueOnce(new Error("boom"));

    const failed = await postEvent(event);
    expect(failed.status).toBe(500);
    expect(await readSend(messageId)).toBeUndefined();
    expect((await readContact(fixture.ids.contact)).emailStatus).toBe("active");

    await post200(event);

    expect((await readSend(messageId)).status).toBe("bounced");
    const row = await readContact(fixture.ids.contact);
    expect(row.emailStatus).toBe("soft_bounced");
    expect(row.emailSoftBounceCount).toBe(1);
  });

  // The recipient-keyed recovery UPDATE has no org-scoped lookup before it, so
  // cases 15 and 16 are the guard against it touching another org's contact.
  async function seedOtherOrgSoftBounced() {
    await resetContact(
      fixture.ids.contact,
      `${TEST_PREFIX}-primary@example.com`
    );
    await resetContact(fixture.ids.otherContact, EMAIL, {
      emailStatus: "soft_bounced",
      emailSoftBounceCount: 1,
      emailLastSoftBouncedAt: T0,
    });
  }

  async function expectOtherOrgStillSoftBounced() {
    const other = await readContact(fixture.ids.otherContact);
    expect(other.emailStatus).toBe("soft_bounced");
    expect(other.emailSoftBounceCount).toBe(1);
    expect(other.emailLastSoftBouncedAt?.toISOString()).toBe(T0.toISOString());
  }

  it("15. a Delivery as the first event does not recover a soft-bounced contact in another org", async () => {
    await seedOtherOrgSoftBounced();

    await post200(
      buildDeliveryEvent({
        mail: mailFor(nextMessageId()),
        deliveredAt: new Date(T0.getTime() + HOUR).toISOString(),
      })
    );

    await expectOtherOrgStillSoftBounced();
  });

  it("16. Send then Delivery does not recover a soft-bounced contact in another org", async () => {
    await seedOtherOrgSoftBounced();
    const messageId = nextMessageId();

    await post200(sendEvent(messageId));
    await post200(
      buildDeliveryEvent({
        mail: mailFor(messageId),
        deliveredAt: new Date(T0.getTime() + HOUR).toISOString(),
      })
    );

    expect((await readSend(messageId)).status).toBe("delivered");
    await expectOtherOrgStillSoftBounced();
  });

  // Multi-recipient direct-SES sends: SES reports per recipient but the row
  // carries only destination[0], so such sends must never touch a contact.
  const OTHER = `${TEST_PREFIX}-someone-else@example.com`;

  it("17. a multi-recipient hard Bounce as the first event creates the row and leaves the contact alone, in both orders", async () => {
    for (const destination of [
      [OTHER, EMAIL],
      [EMAIL, OTHER],
    ]) {
      const messageId = nextMessageId();
      const res = await postEvent(
        buildBounceEvent({
          mail: { messageId, destination },
          bounceType: "Permanent",
          bounceSubType: "General",
          bouncedAt: T0.toISOString(),
        })
      );
      expect(res.status).toBe(200);

      expect((await readSend(messageId)).status).toBe("bounced");
      const row = await readContact(fixture.ids.contact);
      expect(row.emailStatus).toBe("active");
      expect(row.emailBouncedAt).toBeNull();
    }
  });

  it("18. a multi-recipient Send then Bounce, and Send then Complaint, leave the contact alone", async () => {
    const destination = [EMAIL, OTHER];

    const bounced = nextMessageId();
    await post200(sendEvent(bounced, destination));
    await post200(
      buildBounceEvent({
        mail: { messageId: bounced, destination },
        bounceType: "Permanent",
        bounceSubType: "General",
        bouncedAt: T0.toISOString(),
      })
    );
    expect((await readSend(bounced)).status).toBe("bounced");

    const complained = nextMessageId();
    await post200(sendEvent(complained, destination));
    await post200(
      buildComplaintEvent({
        mail: { messageId: complained, destination },
        complainedAt: T0.toISOString(),
      })
    );
    expect((await readSend(complained)).status).toBe("complained");

    const row = await readContact(fixture.ids.contact);
    expect(row.emailStatus).toBe("active");
    expect(row.emailBouncedAt).toBeNull();
    expect(row.emailComplainedAt).toBeNull();
  });

  it("19. a multi-recipient Delivery, as the first event or after Send, does not recover a soft-bounced contact", async () => {
    await resetContact(fixture.ids.contact, EMAIL, {
      emailStatus: "soft_bounced",
      emailSoftBounceCount: 1,
      emailLastSoftBouncedAt: T0,
    });
    const destination = [EMAIL, OTHER];
    const deliveredAt = new Date(T0.getTime() + HOUR).toISOString();

    await post200(
      buildDeliveryEvent({
        mail: { messageId: nextMessageId(), destination },
        deliveredAt,
      })
    );

    const messageId = nextMessageId();
    await post200(sendEvent(messageId, destination));
    await post200(
      buildDeliveryEvent({
        mail: { messageId, destination },
        deliveredAt,
      })
    );
    expect((await readSend(messageId)).status).toBe("delivered");

    const row = await readContact(fixture.ids.contact);
    expect(row.emailStatus).toBe("soft_bounced");
    expect(row.emailSoftBounceCount).toBe(1);
  });
});
