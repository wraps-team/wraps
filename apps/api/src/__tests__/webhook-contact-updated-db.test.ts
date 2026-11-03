/**
 * contact_updated from SES webhooks (real DB)
 *
 * A hard bounce, a complaint, an SES Suppressed event, a bounce with a
 * suppression sub-type, soft bounces escalating to `bounced`, and the SDK-send
 * row-creation path each emit contact_updated once, with the right
 * `changeSource`, after the transaction has committed. A soft bounce that
 * leaves the contact `soft_bounced`, a delivery recovery and a duplicate SES
 * event emit nothing. A failing emit never fails the webhook and never skips
 * resumeWaitingExecutions.
 *
 * Boundaries mocked: the SQS queue and the activation tracker.
 * `emitContactsUpdated` is wrapped around its real implementation so a test
 * can make it reject. `@wraps/db` is the real client.
 */

import {
  contact,
  db,
  eq,
  hashContactValue,
  messageSend,
  workflow,
  workflowExecution,
} from "@wraps/db";
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
import {
  buildBounceEvent,
  buildComplaintEvent,
  buildDeliveryEvent,
  buildSuppressionEvent,
} from "./fixtures/ses-events";

vi.mock("../services/workflow-queue", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../services/workflow-queue")>();
  return {
    ...actual,
    enqueueWorkflowStep: vi.fn().mockResolvedValue(undefined),
    enqueueWorkflowStepBatch: vi.fn().mockResolvedValue(undefined),
    deleteScheduledStep: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("../lib/activation-tracking", () => ({
  trackFirstEmailDelivered: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../services/workflow-events", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../services/workflow-events")>();
  return {
    ...actual,
    emitContactsUpdated: vi.fn(actual.emitContactsUpdated),
  };
});

const { webhooksRoutes } = await import("../routes/webhooks");
const { enqueueWorkflowStep, enqueueWorkflowStepBatch } = await import(
  "../services/workflow-queue"
);
const { emitContactsUpdated } = await import("../services/workflow-events");

const TEST_PREFIX = "wh-contact-updated-db";
const HOUR = 60 * 60 * 1000;
const T0 = new Date("2026-10-01T10:00:00.000Z");
const SDK_EMAIL = `${TEST_PREFIX}-sdk@example.com`;
const SDK_CONTACT = `${TEST_PREFIX}-sdk-contact`;

type TriggerJob = {
  type: string;
  workflowId: string;
  contactId: string;
  organizationId: string;
  eventData?: Record<string, unknown>;
};

const mockedBatch = vi.mocked(enqueueWorkflowStepBatch);
const mockedSingle = vi.mocked(enqueueWorkflowStep);
const mockedEmit = vi.mocked(emitContactsUpdated);

let fixture: BaseOrgFixture;
let seq = 0;
let workflowId: string;
/** The contact's emailStatus as read through `db` when each batch enqueue ran. */
let statusAtEnqueue: (string | null | undefined)[] = [];

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

async function post200(event: Record<string, unknown>) {
  const res = await postEvent(event);
  expect(res.status).toBe(200);
}

async function seedSend(): Promise<string> {
  seq += 1;
  const messageId = `${TEST_PREFIX}-mid-${seq}`;
  await db.insert(messageSend).values(
    messageSendRow(fixture.ids, {
      id: `${TEST_PREFIX}-send-${seq}`,
      messageId,
      recipient: `${TEST_PREFIX}-${seq}@example.com`,
      status: "sent",
      contactId: fixture.ids.contact,
    })
  );
  return messageId;
}

function bounceEvent(
  messageId: string,
  at: Date,
  bounceType = "Permanent",
  bounceSubType = "General",
  destination?: string
) {
  return buildBounceEvent({
    mail: destination
      ? { messageId, destination: [destination] }
      : { messageId },
    bounceType,
    bounceSubType,
    bouncedAt: at.toISOString(),
  });
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

async function statusOf(id: string) {
  const [row] = await db
    .select({ emailStatus: contact.emailStatus })
    .from(contact)
    .where(eq(contact.id, id));
  return row?.emailStatus;
}

function enqueuedJobs(): TriggerJob[] {
  return mockedBatch.mock.calls.flatMap(([jobs]) => jobs as TriggerJob[]);
}

/** Exactly one contact_updated job, for `contactId`, with this status and source. */
function expectOneEvent(
  contactId: string,
  emailStatus: string,
  changeSource: string
) {
  const jobs = enqueuedJobs();
  expect(jobs).toHaveLength(1);
  expect(jobs[0]).toMatchObject({
    type: "trigger",
    workflowId,
    contactId,
    organizationId: fixture.ids.org,
  });
  expect(jobs[0].eventData).toMatchObject({
    emailStatus,
    updatedFields: ["emailStatus"],
    changeSource,
  });
  // Emitted after the commit: a read outside the transaction already saw it.
  expect(statusAtEnqueue).toEqual([emailStatus]);
}

describe("contact_updated from SES webhooks (real DB)", () => {
  beforeAll(async () => {
    fixture = await seedBaseOrg(TEST_PREFIX);
    await db
      .insert(contact)
      .values({
        id: SDK_CONTACT,
        organizationId: fixture.ids.org,
        email: SDK_EMAIL,
        emailHash: hashContactValue(SDK_EMAIL),
        emailStatus: "active",
        status: "active",
      } as typeof contact.$inferInsert)
      .onConflictDoNothing();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    await clearWorkflowState(fixture.ids.org, fixture.ids.otherOrg);
    await resetContact(fixture.ids.contact);
    await resetContact(SDK_CONTACT);
    workflowId = `${TEST_PREFIX}-wf-cu`;
    await db.insert(workflow).values(
      workflowRow(fixture.ids, {
        id: workflowId,
        triggerType: "contact_updated",
        triggerConfig: {},
      })
    );
    statusAtEnqueue = [];
    mockedBatch.mockImplementation(async (jobs) => {
      const contactId = (jobs[0] as TriggerJob | undefined)?.contactId;
      statusAtEnqueue.push(contactId ? await statusOf(contactId) : undefined);
    });
  });

  afterAll(async () => {
    await cleanupBaseOrg(TEST_PREFIX);
  });

  it("a hard bounce emits once with changeSource bounce", async () => {
    await post200(bounceEvent(await seedSend(), T0));

    expect(await statusOf(fixture.ids.contact)).toBe("bounced");
    expectOneEvent(fixture.ids.contact, "bounced", "bounce");
  });

  it("a duplicate of the same Bounce event emits no second event", async () => {
    const event = bounceEvent(await seedSend(), T0);
    await post200(event);
    await post200(event);

    expectOneEvent(fixture.ids.contact, "bounced", "bounce");
  });

  it("a complaint emits once with changeSource complaint", async () => {
    await post200(
      buildComplaintEvent({
        mail: { messageId: await seedSend() },
        complainedAt: T0.toISOString(),
      })
    );

    expect(await statusOf(fixture.ids.contact)).toBe("complained");
    expectOneEvent(fixture.ids.contact, "complained", "complaint");
  });

  it("an SES Suppressed event emits once with changeSource ses_suppression", async () => {
    await post200(
      buildSuppressionEvent({
        mail: { messageId: await seedSend() },
        suppressedAt: T0.toISOString(),
      })
    );

    expect(await statusOf(fixture.ids.contact)).toBe("suppressed");
    expectOneEvent(fixture.ids.contact, "suppressed", "ses_suppression");
  });

  it("a bounce with a suppression sub-type emits once with changeSource ses_suppression", async () => {
    await post200(
      bounceEvent(await seedSend(), T0, "Permanent", "OnAccountSuppressionList")
    );

    expect(await statusOf(fixture.ids.contact)).toBe("suppressed");
    expectOneEvent(fixture.ids.contact, "suppressed", "ses_suppression");
  });

  it("soft bounces emit only on the escalation to bounced", async () => {
    await post200(bounceEvent(await seedSend(), T0, "Transient", "General"));
    await post200(
      bounceEvent(
        await seedSend(),
        new Date(T0.getTime() + 25 * HOUR),
        "Transient",
        "General"
      )
    );
    expect(await statusOf(fixture.ids.contact)).toBe("soft_bounced");
    expect(mockedBatch).not.toHaveBeenCalled();

    await post200(
      bounceEvent(
        await seedSend(),
        new Date(T0.getTime() + 50 * HOUR),
        "Transient",
        "General"
      )
    );

    expect(await statusOf(fixture.ids.contact)).toBe("bounced");
    expectOneEvent(fixture.ids.contact, "bounced", "bounce");
  });

  it("a soft bounce that leaves the contact soft_bounced emits nothing, from active or from NULL", async () => {
    await post200(bounceEvent(await seedSend(), T0, "Transient", "General"));
    expect(await statusOf(fixture.ids.contact)).toBe("soft_bounced");

    await resetContact(fixture.ids.contact, { emailStatus: null });
    await post200(bounceEvent(await seedSend(), T0, "Transient", "General"));
    expect(await statusOf(fixture.ids.contact)).toBe("soft_bounced");

    expect(mockedEmit).not.toHaveBeenCalled();
    expect(mockedBatch).not.toHaveBeenCalled();
  });

  it("a delivery recovering a soft_bounced contact emits nothing", async () => {
    await resetContact(fixture.ids.contact, {
      emailStatus: "soft_bounced",
      emailSoftBounceCount: 1,
      emailLastSoftBouncedAt: T0,
    });

    await post200(
      buildDeliveryEvent({
        mail: { messageId: await seedSend() },
        deliveredAt: new Date(T0.getTime() + HOUR).toISOString(),
      })
    );

    expect(await statusOf(fixture.ids.contact)).toBe("active");
    expect(mockedEmit).not.toHaveBeenCalled();
    expect(mockedBatch).not.toHaveBeenCalled();
  });

  it("a restored active contact whose next soft bounce escalates to bounced emits once", async () => {
    await resetContact(fixture.ids.contact, {
      emailStatus: "active",
      emailSoftBounceCount: 2,
      emailLastSoftBouncedAt: new Date(T0.getTime() - 25 * HOUR),
    });

    await post200(bounceEvent(await seedSend(), T0, "Transient", "General"));

    expect(await statusOf(fixture.ids.contact)).toBe("bounced");
    expectOneEvent(fixture.ids.contact, "bounced", "bounce");
  });

  it("the SDK row-creation path emits once when the first event is a Bounce, and not for the duplicate", async () => {
    seq += 1;
    const messageId = `${TEST_PREFIX}-sdk-mid-${seq}`;
    const event = bounceEvent(messageId, T0, "Permanent", "General", SDK_EMAIL);

    await post200(event);
    // The row now exists; the same event again is a duplicate.
    await post200(event);

    expect(await statusOf(SDK_CONTACT)).toBe("bounced");
    expectOneEvent(SDK_CONTACT, "bounced", "bounce");
  });

  it("a hard bounce on an already-bounced contact emits nothing", async () => {
    await resetContact(fixture.ids.contact, { emailStatus: "bounced" });

    await post200(bounceEvent(await seedSend(), T0));

    expect(mockedEmit).not.toHaveBeenCalled();
    expect(mockedBatch).not.toHaveBeenCalled();
  });

  it("an emit that throws leaves the webhook at 200, after resumeWaitingExecutions has run", async () => {
    const messageId = await seedSend();
    await db.insert(workflowExecution).values(
      executionRow(fixture.ids, {
        id: `${TEST_PREFIX}-exec-wait`,
        workflowId,
        status: "waiting",
        waitingForEvent: `email_engagement:${messageId}`,
      })
    );
    mockedEmit.mockRejectedValueOnce(new Error("emit failed"));

    const res = await postEvent(bounceEvent(messageId, T0));

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "processed" });
    expect(mockedEmit).toHaveBeenCalledTimes(1);
    expect(mockedSingle).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "resume",
        executionId: `${TEST_PREFIX}-exec-wait`,
        branch: "bounced",
      })
    );
    // The resume ran before the emit.
    expect(mockedSingle.mock.invocationCallOrder[0]).toBeLessThan(
      mockedEmit.mock.invocationCallOrder[0]
    );
    expect(await statusOf(fixture.ids.contact)).toBe("bounced");
  });
});
