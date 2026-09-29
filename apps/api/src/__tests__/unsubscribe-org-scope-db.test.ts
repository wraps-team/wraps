/**
 * Unsubscribe org scope (real DB)
 *
 * The global POST /unsubscribe/:token path writes `contact_topic` rows with
 * no org predicate of its own — the SELECT gate that pairs the token's
 * contact with the token's org is the only thing protecting them. These tests
 * drive the real route and re-read persisted state, so a gate that loses its
 * org scope fails here.
 *
 * Only the SQS queue is mocked; `@wraps/db` and the token library are real.
 */

import { and, contact, contactTopic, db, eq, topic } from "@wraps/db";
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
} from "../(ee)/__tests__/fixtures/real-db";

vi.mock("../services/workflow-queue", () => ({
  enqueueWorkflowStep: vi.fn().mockResolvedValue(undefined),
  deleteScheduledStep: vi.fn().mockResolvedValue(undefined),
}));

const { unsubscribeRoutes } = await import("../routes/unsubscribe");
const { generateUnsubscribeToken } = await import("../lib/unsubscribe-token");

const TEST_PREFIX = "unsub-org-scope-db";

let fixture: BaseOrgFixture;
const topicA = `${TEST_PREFIX}-topicA`;
const topicB = `${TEST_PREFIX}-topicB`;

function postUnsubscribe(token: string) {
  return new Elysia()
    .use(unsubscribeRoutes)
    .handle(
      new Request(`http://localhost/unsubscribe/${token}`, { method: "POST" })
    );
}

async function emailStatusOf(contactId: string) {
  const [row] = await db
    .select({ emailStatus: contact.emailStatus })
    .from(contact)
    .where(eq(contact.id, contactId));
  return row?.emailStatus;
}

async function topicStatusOf(contactId: string, topicId: string) {
  const [row] = await db
    .select({ status: contactTopic.status })
    .from(contactTopic)
    .where(
      and(
        eq(contactTopic.contactId, contactId),
        eq(contactTopic.topicId, topicId)
      )
    );
  return row?.status;
}

describe("POST /unsubscribe/:token org scope (real DB)", () => {
  beforeAll(async () => {
    fixture = await seedBaseOrg(TEST_PREFIX);
    const { ids } = fixture;

    await db
      .insert(topic)
      .values([
        {
          id: topicA,
          organizationId: ids.org,
          name: "Topic A",
          slug: `${TEST_PREFIX}-a`,
        },
        {
          id: topicB,
          organizationId: ids.otherOrg,
          name: "Topic B",
          slug: `${TEST_PREFIX}-b`,
        },
      ])
      .onConflictDoNothing();

    await db
      .insert(contactTopic)
      .values([
        { contactId: ids.contact, topicId: topicA, status: "subscribed" },
        { contactId: ids.otherContact, topicId: topicB, status: "subscribed" },
      ])
      .onConflictDoNothing();
  });

  beforeEach(async () => {
    const { ids } = fixture;
    for (const id of [ids.contact, ids.otherContact]) {
      await db
        .update(contact)
        .set({ emailStatus: "active" })
        .where(eq(contact.id, id));
      await db
        .update(contactTopic)
        .set({ status: "subscribed" })
        .where(eq(contactTopic.contactId, id));
    }
  });

  afterAll(async () => {
    await cleanupBaseOrg(TEST_PREFIX);
  });

  it("a token pairing org B's contact with org A is rejected and mutates nothing", async () => {
    const { ids } = fixture;
    const token = await generateUnsubscribeToken(ids.otherContact, ids.org);

    const res = await postUnsubscribe(token);

    expect(res.status).toBe(404);
    expect(await emailStatusOf(ids.otherContact)).toBe("active");
    expect(await topicStatusOf(ids.otherContact, topicB)).toBe("subscribed");
  });

  it("a same-org token unsubscribes that contact and its topics only", async () => {
    const { ids } = fixture;
    const token = await generateUnsubscribeToken(ids.contact, ids.org);

    const res = await postUnsubscribe(token);

    expect(res.status).toBe(200);
    expect(await emailStatusOf(ids.contact)).toBe("unsubscribed");
    expect(await topicStatusOf(ids.contact, topicA)).toBe("unsubscribed");
    expect(await emailStatusOf(ids.otherContact)).toBe("active");
    expect(await topicStatusOf(ids.otherContact, topicB)).toBe("subscribed");
  });
});
