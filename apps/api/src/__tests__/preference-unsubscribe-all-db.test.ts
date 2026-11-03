/**
 * POST /v1/preference-events/unsubscribe-all (real DB)
 *
 * The preference centre's "unsubscribe from all". Authenticated only by the
 * unsubscribe token; the API does the write. The contact becomes
 * `unsubscribed`, every topic is unsubscribed, `topic_unsubscribed` fires per
 * subscribed topic and `contact_updated` (changeSource "unsubscribe") fires
 * only when the status changed. A token whose contact is not in its org
 * answers 200 and writes nothing; a bad token is refused.
 *
 * Boundary mocked: the SQS queue. The workflow-events emitters are wrapped
 * around their real implementations so calls can be counted. `@wraps/db` and
 * the token library are real.
 */

import { contact, contactTopic, db, eq, topic, workflow } from "@wraps/db";
import { Elysia } from "elysia";
import * as jose from "jose";
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

const { preferenceEventsRoutes } = await import("../routes/preference-events");
const { generateUnsubscribeToken } = await import("../lib/unsubscribe-token");
const { enqueueWorkflowStepBatch } = await import("../services/workflow-queue");
const { emitContactsUpdated, emitTopicUnsubscribed } = await import(
  "../services/workflow-events"
);

const TEST_PREFIX = "pref-unsub-all-db";
const TOPIC_A = `${TEST_PREFIX}-topic-a`;
const TOPIC_B = `${TEST_PREFIX}-topic-b`;
const OTHER_ORG_TOPIC = `${TEST_PREFIX}-topic-other`;

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

function unsubscribeAll(body: unknown) {
  return new Elysia().use(preferenceEventsRoutes).handle(
    new Request("http://localhost/v1/preference-events/unsubscribe-all", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

function contactUpdatedJobs(): TriggerJob[] {
  return mockedBatch.mock.calls
    .flatMap(([jobs]) => jobs as TriggerJob[])
    .filter((job) => job.workflowId === workflowId);
}

async function emailStatusOf(contactId: string) {
  const [row] = await db
    .select({ emailStatus: contact.emailStatus })
    .from(contact)
    .where(eq(contact.id, contactId));
  return row?.emailStatus;
}

async function topicStatusesOf(contactId: string) {
  const rows = await db
    .select({ topicId: contactTopic.topicId, status: contactTopic.status })
    .from(contactTopic)
    .where(eq(contactTopic.contactId, contactId));
  return Object.fromEntries(rows.map((r) => [r.topicId, r.status]));
}

async function subscribe(contactId: string, topicIds: string[]) {
  await db.delete(contactTopic).where(eq(contactTopic.contactId, contactId));
  if (topicIds.length > 0) {
    await db.insert(contactTopic).values(
      topicIds.map((topicId) => ({
        contactId,
        topicId,
        status: "subscribed" as const,
      }))
    );
  }
}

/** A token signed with the same secret the route verifies with, already expired. */
async function expiredToken(contactId: string, organizationId: string) {
  const secret = new TextEncoder().encode(
    process.env.UNSUBSCRIBE_SECRET ??
      "dev-unsubscribe-secret-change-in-production"
  );
  const now = Math.floor(Date.now() / 1000);
  return await new jose.SignJWT({
    cid: contactId,
    oid: organizationId,
    type: "unsub",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now - 7200)
    .setExpirationTime(now - 3600)
    .sign(secret);
}

describe("POST /v1/preference-events/unsubscribe-all (real DB)", () => {
  beforeAll(async () => {
    fixture = await seedBaseOrg(TEST_PREFIX);
    const { ids } = fixture;
    await db
      .insert(topic)
      .values([
        {
          id: TOPIC_A,
          organizationId: ids.org,
          name: "Newsletter",
          slug: `${TEST_PREFIX}-a`,
        },
        {
          id: TOPIC_B,
          organizationId: ids.org,
          name: "Product updates",
          slug: `${TEST_PREFIX}-b`,
        },
        {
          id: OTHER_ORG_TOPIC,
          organizationId: ids.otherOrg,
          name: "Other org topic",
          slug: `${TEST_PREFIX}-other`,
        },
      ])
      .onConflictDoNothing();
    workflowId = `${TEST_PREFIX}-wf-cu`;
    await db
      .insert(workflow)
      .values(
        workflowRow(ids, {
          id: workflowId,
          triggerType: "event",
          triggerConfig: { eventName: "contact_updated" },
        })
      )
      .onConflictDoNothing();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    const { ids } = fixture;
    for (const id of [ids.contact, ids.otherContact]) {
      await db
        .update(contact)
        .set({ emailStatus: "active", emailUnsubscribedAt: null })
        .where(eq(contact.id, id));
    }
    await subscribe(ids.contact, [TOPIC_A, TOPIC_B]);
    await subscribe(ids.otherContact, [OTHER_ORG_TOPIC]);
  });

  afterAll(async () => {
    await db.delete(workflow).where(eq(workflow.id, workflowId));
    await db
      .delete(contactTopic)
      .where(eq(contactTopic.topicId, OTHER_ORG_TOPIC));
    await db.delete(contactTopic).where(eq(contactTopic.topicId, TOPIC_A));
    await db.delete(contactTopic).where(eq(contactTopic.topicId, TOPIC_B));
    await db.delete(topic).where(eq(topic.id, TOPIC_A));
    await db.delete(topic).where(eq(topic.id, TOPIC_B));
    await db.delete(topic).where(eq(topic.id, OTHER_ORG_TOPIC));
    await cleanupBaseOrg(TEST_PREFIX);
  });

  it("unsubscribes an active contact and its topics, with one contact_updated and one topic_unsubscribed per topic", async () => {
    const { ids } = fixture;
    const token = await generateUnsubscribeToken(ids.contact, ids.org);

    const res = await unsubscribeAll({ token });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(await emailStatusOf(ids.contact)).toBe("unsubscribed");
    expect(await topicStatusesOf(ids.contact)).toEqual({
      [TOPIC_A]: "unsubscribed",
      [TOPIC_B]: "unsubscribed",
    });

    const jobs = contactUpdatedJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].contactId).toBe(ids.contact);
    expect(jobs[0].eventData).toMatchObject({
      emailStatus: "unsubscribed",
      updatedFields: ["emailStatus"],
      changeSource: "unsubscribe",
    });
    expect(mockedEmit).toHaveBeenCalledTimes(1);
    expect(mockedTopicEmit).toHaveBeenCalledTimes(2);
    expect(
      mockedTopicEmit.mock.calls.map(([params]) => params.topicId).sort()
    ).toEqual([TOPIC_A, TOPIC_B].sort());
  });

  it("a second call answers 200 and emits no contact_updated", async () => {
    const { ids } = fixture;
    const token = await generateUnsubscribeToken(ids.contact, ids.org);

    expect((await unsubscribeAll({ token })).status).toBe(200);
    vi.clearAllMocks();

    const second = await unsubscribeAll({ token });

    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ success: true });
    expect(mockedEmit).not.toHaveBeenCalled();
    expect(contactUpdatedJobs()).toHaveLength(0);
    expect(mockedTopicEmit).not.toHaveBeenCalled();
    expect(await emailStatusOf(ids.contact)).toBe("unsubscribed");
  });

  it("a contact with no topics still emits one contact_updated", async () => {
    const { ids } = fixture;
    await subscribe(ids.contact, []);
    const token = await generateUnsubscribeToken(ids.contact, ids.org);

    const res = await unsubscribeAll({ token });

    expect(res.status).toBe(200);
    expect(await emailStatusOf(ids.contact)).toBe("unsubscribed");
    expect(contactUpdatedJobs()).toHaveLength(1);
    expect(mockedTopicEmit).not.toHaveBeenCalled();
  });

  it("a token whose contact is not in its org answers 200, writes nothing and emits nothing", async () => {
    const { ids } = fixture;
    // Org B's contact paired with org A.
    const token = await generateUnsubscribeToken(ids.otherContact, ids.org);

    const res = await unsubscribeAll({ token });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(await emailStatusOf(ids.otherContact)).toBe("active");
    expect(await topicStatusesOf(ids.otherContact)).toEqual({
      [OTHER_ORG_TOPIC]: "subscribed",
    });
    expect(await emailStatusOf(ids.contact)).toBe("active");
    expect(mockedEmit).not.toHaveBeenCalled();
    expect(mockedTopicEmit).not.toHaveBeenCalled();
    expect(mockedBatch).not.toHaveBeenCalled();
  });

  it.each([
    ["an invalid token", async () => "not-a-real-token"],
    [
      "an expired token",
      async () => expiredToken(fixture.ids.contact, fixture.ids.org),
    ],
  ])("%s is refused with a 4xx and writes nothing", async (_name, token) => {
    const res = await unsubscribeAll({ token: await token() });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(await emailStatusOf(fixture.ids.contact)).toBe("active");
    expect(await topicStatusesOf(fixture.ids.contact)).toEqual({
      [TOPIC_A]: "subscribed",
      [TOPIC_B]: "subscribed",
    });
    expect(mockedEmit).not.toHaveBeenCalled();
    expect(mockedTopicEmit).not.toHaveBeenCalled();
  });

  it("a subscription that points at another org's topic is neither unsubscribed nor reported", async () => {
    const { ids } = fixture;
    // Bad data on purpose: contact_topic has no org column, so nothing stops
    // a row for org A's contact pointing at org B's topic.
    await db.insert(contactTopic).values({
      contactId: ids.contact,
      topicId: OTHER_ORG_TOPIC,
      status: "subscribed",
    });
    const token = await generateUnsubscribeToken(ids.contact, ids.org);

    const res = await unsubscribeAll({ token });

    expect(res.status).toBe(200);
    expect(await topicStatusesOf(ids.contact)).toEqual({
      [TOPIC_A]: "unsubscribed",
      [TOPIC_B]: "unsubscribed",
      [OTHER_ORG_TOPIC]: "subscribed",
    });
    expect(
      mockedTopicEmit.mock.calls.map(([params]) => params.topicId).sort()
    ).toEqual([TOPIC_A, TOPIC_B].sort());
    expect(contactUpdatedJobs()).toHaveLength(1);
  });

  it("a token carrying a topic id still unsubscribes from everything", async () => {
    const { ids } = fixture;
    const token = await generateUnsubscribeToken(ids.contact, ids.org, TOPIC_A);

    const res = await unsubscribeAll({ token });

    expect(res.status).toBe(200);
    expect(await emailStatusOf(ids.contact)).toBe("unsubscribed");
    expect(await topicStatusesOf(ids.contact)).toEqual({
      [TOPIC_A]: "unsubscribed",
      [TOPIC_B]: "unsubscribed",
    });
    expect(contactUpdatedJobs()).toHaveLength(1);
    expect(mockedTopicEmit).toHaveBeenCalledTimes(2);
  });
});
