/**
 * Webhook Soft Bounce Tests (real DB)
 *
 * A Transient (General/MailboxFull) or Undetermined SES bounce on a send linked
 * to a contact marks the contact `soft_bounced` (still sendable) and counts it,
 * at most once per 24 hours. The 3rd counted soft bounce escalates the contact
 * to `bounced`. A later Delivery newer than the last counted soft bounce clears
 * it back to `active`. Soft bounces never overwrite unsubscribed, complained,
 * suppressed or bounced contacts, content-related Transient bounces leave the
 * contact alone, a duplicate event counts once, and the update is org-scoped.
 *
 * Only the true boundaries are mocked: the SQS queue and the activation tracker.
 * `@wraps/db` is real. These tests need apps/web/.env.test and the migration
 * that adds the soft-bounce columns (0097) applied to the test branch.
 */

import { contact, db, eq, messageSend } from "@wraps/db";
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
import { clearSoftBounce, recordSoftBounce } from "../services/contact-bounce";
import { buildBounceEvent, buildDeliveryEvent } from "./fixtures/ses-events";

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
    recordSoftBounce: vi.fn(actual.recordSoftBounce),
    clearSoftBounce: vi.fn(actual.clearSoftBounce),
  };
});

const { webhooksRoutes } = await import("../routes/webhooks");

const TEST_PREFIX = "wh-soft-bounce-db";
const HOUR = 60 * 60 * 1000;
// Fixed base time so every assertion on timestamps is deterministic.
const T0 = new Date("2026-10-01T10:00:00.000Z");

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

/** Seed a `sent` message_send linked to a contact; returns its SES message id. */
async function seedSend(
  contactId: string | null = fixture.ids.contact
): Promise<string> {
  seq += 1;
  const messageId = `${TEST_PREFIX}-mid-${seq}`;
  await db.insert(messageSend).values(
    messageSendRow(fixture.ids, {
      id: `${TEST_PREFIX}-send-${seq}`,
      messageId,
      recipient: `${TEST_PREFIX}-${seq}@example.com`,
      status: "sent",
      contactId,
    })
  );
  return messageId;
}

async function bounce(
  messageId: string,
  at: Date,
  bounceType = "Transient",
  bounceSubType = "General"
) {
  const res = await postEvent(
    buildBounceEvent({
      mail: { messageId },
      bounceType,
      bounceSubType,
      bouncedAt: at.toISOString(),
    })
  );
  expect(res.status).toBe(200);
}

async function deliver(messageId: string, at: Date) {
  const res = await postEvent(
    buildDeliveryEvent({
      mail: { messageId },
      deliveredAt: at.toISOString(),
    })
  );
  expect(res.status).toBe(200);
}

async function readSend(messageId: string) {
  const [row] = await db
    .select({
      status: messageSend.status,
      bouncedAt: messageSend.bouncedAt,
      deliveredAt: messageSend.deliveredAt,
    })
    .from(messageSend)
    .where(eq(messageSend.messageId, messageId));
  return row;
}

async function resetContact(
  id: string,
  values: Partial<typeof contact.$inferInsert> = {}
) {
  await db
    .update(contact)
    .set({
      emailStatus: "active",
      emailSoftBounceCount: 0,
      emailLastSoftBouncedAt: null,
      emailBouncedAt: null,
      ...values,
    })
    .where(eq(contact.id, id));
}

async function readContact(id: string) {
  const [row] = await db
    .select({
      emailStatus: contact.emailStatus,
      emailSoftBounceCount: contact.emailSoftBounceCount,
      emailLastSoftBouncedAt: contact.emailLastSoftBouncedAt,
      emailBouncedAt: contact.emailBouncedAt,
    })
    .from(contact)
    .where(eq(contact.id, id));
  return row;
}

describe("webhook soft bounces (real DB)", () => {
  beforeAll(async () => {
    fixture = await seedBaseOrg(TEST_PREFIX);
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    await clearWorkflowState(fixture.ids.org, fixture.ids.otherOrg);
    await resetContact(fixture.ids.contact);
    await resetContact(fixture.ids.otherContact);
  });

  afterAll(async () => {
    await cleanupBaseOrg(TEST_PREFIX);
  });

  it("first Transient/General bounce marks the contact soft_bounced with count 1", async () => {
    await bounce(await seedSend(), T0);

    const row = await readContact(fixture.ids.contact);
    expect(row.emailStatus).toBe("soft_bounced");
    expect(row.emailSoftBounceCount).toBe(1);
    expect(row.emailLastSoftBouncedAt?.toISOString()).toBe(T0.toISOString());
    expect(row.emailBouncedAt).toBeNull();
  });

  it("a second soft bounce within 24 hours is not counted again", async () => {
    await bounce(await seedSend(), T0);
    await bounce(await seedSend(), new Date(T0.getTime() + HOUR));

    const row = await readContact(fixture.ids.contact);
    expect(row.emailStatus).toBe("soft_bounced");
    expect(row.emailSoftBounceCount).toBe(1);
    expect(row.emailLastSoftBouncedAt?.toISOString()).toBe(T0.toISOString());
  });

  it("the third counted soft bounce (25h+ apart) escalates the contact to bounced", async () => {
    await bounce(await seedSend(), T0);
    await bounce(await seedSend(), new Date(T0.getTime() + 25 * HOUR));

    const mid = await readContact(fixture.ids.contact);
    expect(mid.emailStatus).toBe("soft_bounced");
    expect(mid.emailSoftBounceCount).toBe(2);

    const third = new Date(T0.getTime() + 50 * HOUR);
    await bounce(await seedSend(), third);

    const row = await readContact(fixture.ids.contact);
    expect(row.emailStatus).toBe("bounced");
    expect(row.emailSoftBounceCount).toBe(3);
    expect(row.emailBouncedAt?.toISOString()).toBe(third.toISOString());
  });

  it("a Delivery after a soft bounce sets the contact back to active and resets the count", async () => {
    await bounce(await seedSend(), T0);
    await deliver(await seedSend(), new Date(T0.getTime() + HOUR));

    const row = await readContact(fixture.ids.contact);
    expect(row.emailStatus).toBe("active");
    expect(row.emailSoftBounceCount).toBe(0);
    expect(row.emailLastSoftBouncedAt).toBeNull();
  });

  it("a stale Delivery older than the soft bounce does not clear it; a newer one does", async () => {
    await bounce(await seedSend(), T0);

    await deliver(await seedSend(), new Date(T0.getTime() - HOUR));
    const stale = await readContact(fixture.ids.contact);
    expect(stale.emailStatus).toBe("soft_bounced");
    expect(stale.emailSoftBounceCount).toBe(1);

    await deliver(await seedSend(), new Date(T0.getTime() + HOUR));
    const cleared = await readContact(fixture.ids.contact);
    expect(cleared.emailStatus).toBe("active");
    expect(cleared.emailSoftBounceCount).toBe(0);
  });

  it("a Permanent bounce on a soft_bounced contact makes it bounced", async () => {
    await resetContact(fixture.ids.contact, {
      emailStatus: "soft_bounced",
      emailSoftBounceCount: 1,
      emailLastSoftBouncedAt: T0,
    });

    await bounce(
      await seedSend(),
      new Date(T0.getTime() + HOUR),
      "Permanent",
      "General"
    );

    const row = await readContact(fixture.ids.contact);
    expect(row.emailStatus).toBe("bounced");
    expect(row.emailBouncedAt).not.toBeNull();
  });

  it("a Transient bounce never overwrites unsubscribed or complained contacts", async () => {
    for (const status of ["unsubscribed", "complained"] as const) {
      await resetContact(fixture.ids.contact, { emailStatus: status });

      await bounce(await seedSend(), T0);

      const row = await readContact(fixture.ids.contact);
      expect(row.emailStatus).toBe(status);
      expect(row.emailSoftBounceCount).toBe(0);
      expect(row.emailLastSoftBouncedAt).toBeNull();
    }
  });

  it("ContentRejected leaves the contact active; Undetermined soft-bounces it", async () => {
    await bounce(await seedSend(), T0, "Transient", "ContentRejected");
    const content = await readContact(fixture.ids.contact);
    expect(content.emailStatus).toBe("active");
    expect(content.emailSoftBounceCount).toBe(0);

    await bounce(await seedSend(), T0, "Undetermined", "Undetermined");
    const undetermined = await readContact(fixture.ids.contact);
    expect(undetermined.emailStatus).toBe("soft_bounced");
    expect(undetermined.emailSoftBounceCount).toBe(1);
  });

  it("the same Bounce event posted twice counts once", async () => {
    const messageId = await seedSend();
    await bounce(messageId, T0);
    await bounce(messageId, T0);

    const row = await readContact(fixture.ids.contact);
    expect(row.emailStatus).toBe("soft_bounced");
    expect(row.emailSoftBounceCount).toBe(1);
  });

  it("is org-scoped: a send linked to another org's contact never touches it", async () => {
    await bounce(await seedSend(fixture.ids.otherContact), T0);

    const other = await readContact(fixture.ids.otherContact);
    expect(other.emailStatus).toBe("active");
    expect(other.emailSoftBounceCount).toBe(0);
    expect(other.emailLastSoftBouncedAt).toBeNull();
  });

  it("recovery resets the streak: a soft bounce within 24h of the old one is counted", async () => {
    await bounce(await seedSend(), T0);
    const first = await readContact(fixture.ids.contact);
    expect(first.emailStatus).toBe("soft_bounced");
    expect(first.emailSoftBounceCount).toBe(1);

    await deliver(await seedSend(), new Date(T0.getTime() + HOUR));
    const cleared = await readContact(fixture.ids.contact);
    expect(cleared.emailStatus).toBe("active");
    expect(cleared.emailSoftBounceCount).toBe(0);
    expect(cleared.emailLastSoftBouncedAt).toBeNull();

    const again = new Date(T0.getTime() + 2 * HOUR);
    await bounce(await seedSend(), again);
    const row = await readContact(fixture.ids.contact);
    expect(row.emailStatus).toBe("soft_bounced");
    expect(row.emailSoftBounceCount).toBe(1);
    expect(row.emailLastSoftBouncedAt?.toISOString()).toBe(again.toISOString());
  });

  it("a failed soft-bounce contact write rolls the transition back and the retry recovers", async () => {
    const messageId = await seedSend();
    const event = buildBounceEvent({
      mail: { messageId },
      bounceType: "Transient",
      bounceSubType: "General",
      bouncedAt: T0.toISOString(),
    });
    vi.mocked(recordSoftBounce).mockRejectedValueOnce(new Error("boom"));

    const failed = await postEvent(event);
    expect(failed.status).toBe(500);

    const send = await readSend(messageId);
    expect(send.status).toBe("sent");
    expect(send.bouncedAt).toBeNull();
    const untouched = await readContact(fixture.ids.contact);
    expect(untouched.emailStatus).toBe("active");
    expect(untouched.emailSoftBounceCount).toBe(0);

    const retried = await postEvent(event);
    expect(retried.status).toBe(200);

    const sendAfter = await readSend(messageId);
    expect(sendAfter.status).toBe("bounced");
    const row = await readContact(fixture.ids.contact);
    expect(row.emailStatus).toBe("soft_bounced");
    expect(row.emailSoftBounceCount).toBe(1);
  });

  it("a failed recovery write rolls the transition back and the retry recovers", async () => {
    await resetContact(fixture.ids.contact, {
      emailStatus: "soft_bounced",
      emailSoftBounceCount: 1,
      emailLastSoftBouncedAt: T0,
    });
    const messageId = await seedSend();
    const event = buildDeliveryEvent({
      mail: { messageId },
      deliveredAt: new Date(T0.getTime() + HOUR).toISOString(),
    });
    vi.mocked(clearSoftBounce).mockRejectedValueOnce(new Error("boom"));

    const failed = await postEvent(event);
    expect(failed.status).toBe(500);

    const send = await readSend(messageId);
    expect(send.status).toBe("sent");
    expect(send.deliveredAt).toBeNull();
    const untouched = await readContact(fixture.ids.contact);
    expect(untouched.emailStatus).toBe("soft_bounced");

    const retried = await postEvent(event);
    expect(retried.status).toBe(200);

    const sendAfter = await readSend(messageId);
    expect(sendAfter.status).toBe("delivered");
    const row = await readContact(fixture.ids.contact);
    expect(row.emailStatus).toBe("active");
    expect(row.emailSoftBounceCount).toBe(0);
  });
});
