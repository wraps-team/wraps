/**
 * contact_updated from the unsubscribe link (real DB)
 *
 * The global POST /unsubscribe/:token emits contact_updated (changeSource
 * "unsubscribe") only when it moves the contact to `unsubscribed`. A repeat
 * POST emits nothing and keeps the first emailUnsubscribedAt, but still
 * unsubscribes any topic the contact holds, fires topic_unsubscribed and
 * returns 200. Two concurrent POSTs emit once.
 *
 * Boundary mocked: the SQS queue. The workflow-events emitters are wrapped
 * around their real implementations so calls can be counted. `@wraps/db` and
 * the token library are real.
 */

import { and, contact, contactTopic, db, eq, topic, workflow } from "@wraps/db";
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
  seedBaseOrg,
  workflowRow,
} from "../(ee)/__tests__/fixtures/real-db";

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

vi.mock("../services/workflow-events", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../services/workflow-events")>();
  return {
    ...actual,
    emitContactsUpdated: vi.fn(actual.emitContactsUpdated),
    emitTopicUnsubscribed: vi.fn(actual.emitTopicUnsubscribed),
  };
});

const { unsubscribeRoutes } = await import("../routes/unsubscribe");
const { generateUnsubscribeToken } = await import("../lib/unsubscribe-token");
const { enqueueWorkflowStepBatch } = await import("../services/workflow-queue");
const { emitContactsUpdated, emitTopicUnsubscribed } = await import(
  "../services/workflow-events"
);

const TEST_PREFIX = "unsub-contact-upd-db";
const TOPIC_ID = `${TEST_PREFIX}-topic`;

type TriggerJob = {
  workflowId: string;
  contactId: string;
  eventData?: Record<string, unknown>;
};

const mockedBatch = vi.mocked(enqueueWorkflowStepBatch);
const mockedEmit = vi.mocked(emitContactsUpdated);
const mockedTopicEmit = vi.mocked(emitTopicUnsubscribed);

let fixture: BaseOrgFixture;
let workflowId: string;

function oneClick(token: string) {
  return new Elysia().use(unsubscribeRoutes).handle(
    new Request(`http://localhost/unsubscribe/${token}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "List-Unsubscribe=One-Click",
    })
  );
}

function contactUpdatedJobs(): TriggerJob[] {
  return mockedBatch.mock.calls
    .flatMap(([jobs]) => jobs as TriggerJob[])
    .filter((job) => job.workflowId === workflowId);
}

async function readContact() {
  const [row] = await db
    .select({
      emailStatus: contact.emailStatus,
      emailUnsubscribedAt: contact.emailUnsubscribedAt,
    })
    .from(contact)
    .where(eq(contact.id, fixture.ids.contact));
  return row;
}

async function topicStatus() {
  const [row] = await db
    .select({ status: contactTopic.status })
    .from(contactTopic)
    .where(
      and(
        eq(contactTopic.contactId, fixture.ids.contact),
        eq(contactTopic.topicId, TOPIC_ID)
      )
    );
  return row?.status;
}

async function resubscribeTopic() {
  await db
    .update(contactTopic)
    .set({ status: "subscribed", unsubscribedAt: null })
    .where(eq(contactTopic.contactId, fixture.ids.contact));
}

describe("POST /unsubscribe/:token contact_updated (real DB)", () => {
  beforeAll(async () => {
    fixture = await seedBaseOrg(TEST_PREFIX);
    await db
      .insert(topic)
      .values({
        id: TOPIC_ID,
        organizationId: fixture.ids.org,
        name: "Newsletter",
        slug: `${TEST_PREFIX}-news`,
      })
      .onConflictDoNothing();
    await db
      .insert(contactTopic)
      .values({
        contactId: fixture.ids.contact,
        topicId: TOPIC_ID,
        status: "subscribed",
      })
      .onConflictDoNothing();
    workflowId = `${TEST_PREFIX}-wf-cu`;
    await db
      .insert(workflow)
      .values(
        workflowRow(fixture.ids, {
          id: workflowId,
          triggerType: "event",
          triggerConfig: { eventName: "contact_updated" },
        })
      )
      .onConflictDoNothing();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    await db
      .update(contact)
      .set({ emailStatus: "active", emailUnsubscribedAt: null })
      .where(eq(contact.id, fixture.ids.contact));
    await resubscribeTopic();
  });

  afterAll(async () => {
    await db.delete(workflow).where(eq(workflow.id, workflowId));
    await db.delete(contactTopic).where(eq(contactTopic.topicId, TOPIC_ID));
    await db.delete(topic).where(eq(topic.id, TOPIC_ID));
    await cleanupBaseOrg(TEST_PREFIX);
  });

  it("the first POST emits once; a repeat emits nothing, keeps emailUnsubscribedAt, and still unsubscribes a held topic", async () => {
    const token = await generateUnsubscribeToken(
      fixture.ids.contact,
      fixture.ids.org
    );

    const first = await oneClick(token);
    expect(first.status).toBe(200);
    const afterFirst = await readContact();
    expect(afterFirst.emailStatus).toBe("unsubscribed");
    expect(afterFirst.emailUnsubscribedAt).not.toBeNull();

    const jobs = contactUpdatedJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ contactId: fixture.ids.contact });
    expect(jobs[0].eventData).toMatchObject({
      emailStatus: "unsubscribed",
      updatedFields: ["emailStatus"],
      changeSource: "unsubscribe",
    });
    expect(mockedTopicEmit).toHaveBeenCalledTimes(1);

    // The contact re-subscribes to the topic; the old link is clicked again.
    await resubscribeTopic();
    vi.clearAllMocks();

    const second = await oneClick(token);
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ success: true });

    expect(mockedEmit).not.toHaveBeenCalled();
    expect(contactUpdatedJobs()).toHaveLength(0);
    expect(await topicStatus()).toBe("unsubscribed");
    expect(mockedTopicEmit).toHaveBeenCalledTimes(1);
    expect(mockedTopicEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        contactId: fixture.ids.contact,
        topicId: TOPIC_ID,
      })
    );
    const afterSecond = await readContact();
    expect(afterSecond.emailStatus).toBe("unsubscribed");
    expect(afterSecond.emailUnsubscribedAt?.toISOString()).toBe(
      afterFirst.emailUnsubscribedAt?.toISOString()
    );
  });

  it("two concurrent one-click POSTs emit once", async () => {
    const token = await generateUnsubscribeToken(
      fixture.ids.contact,
      fixture.ids.org
    );

    const responses = await Promise.all([oneClick(token), oneClick(token)]);

    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    expect(mockedEmit).toHaveBeenCalledTimes(1);
    expect(contactUpdatedJobs()).toHaveLength(1);
  });

  it("a contact that was bounced and unsubscribes emits with the new status", async () => {
    await db
      .update(contact)
      .set({ emailStatus: "bounced" })
      .where(eq(contact.id, fixture.ids.contact));
    const token = await generateUnsubscribeToken(
      fixture.ids.contact,
      fixture.ids.org
    );

    const res = await oneClick(token);

    expect(res.status).toBe(200);
    const jobs = contactUpdatedJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].eventData).toMatchObject({
      emailStatus: "unsubscribed",
      changeSource: "unsubscribe",
    });
  });

  it("a failing emit is logged and the unsubscribe still returns 200", async () => {
    mockedEmit.mockRejectedValueOnce(new Error("emit failed"));
    const token = await generateUnsubscribeToken(
      fixture.ids.contact,
      fixture.ids.org
    );

    const res = await oneClick(token);

    expect(res.status).toBe(200);
    expect((await readContact()).emailStatus).toBe("unsubscribed");
  });
});
