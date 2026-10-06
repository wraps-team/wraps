vi.mock("@wraps/email", () => ({
  sendTopicConfirmationEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../services/workflow-events", () => ({
  emitTopicSubscribed: vi.fn().mockResolvedValue({ workflowsTriggered: 0 }),
  emitTopicUnsubscribed: vi.fn().mockResolvedValue({ workflowsTriggered: 0 }),
  checkSegmentEntry: vi.fn().mockResolvedValue(undefined),
  checkSegmentExit: vi.fn().mockResolvedValue(undefined),
  getSegmentMembership: vi.fn().mockResolvedValue([]),
  emitContactCreated: vi.fn().mockResolvedValue({ workflowsTriggered: 0 }),
  emitContactUpdated: vi.fn().mockResolvedValue({ workflowsTriggered: 0 }),
  emitWorkflowEvent: vi.fn().mockResolvedValue({ workflowsTriggered: 0 }),
}));

import {
  contact,
  contactTopic,
  db,
  eq,
  member,
  organization,
  topic,
  user,
} from "@wraps/db";
import { sendTopicConfirmationEmail } from "@wraps/email";
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
import type { AuthContext } from "../middleware/auth";
import { contactsTopicsRoutes } from "../routes/contacts-topics";
import {
  checkSegmentEntry,
  checkSegmentExit,
  emitTopicSubscribed,
  emitTopicUnsubscribed,
  getSegmentMembership,
} from "../services/workflow-events";

const TEST_PREFIX = "ct-topics-test";

const testUser = {
  id: `${TEST_PREFIX}-user-1`,
  email: `${TEST_PREFIX}@example.com`,
  name: "CT Topics Test User",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  image: null,
  twoFactorEnabled: false,
  stripeCustomerId: null,
};

const testOrg = {
  id: `${TEST_PREFIX}-org-1`,
  name: "CT Topics Test Org",
  slug: `${TEST_PREFIX}-org`,
  createdAt: new Date(),
  logo: null,
  metadata: null,
};

const otherOrg = {
  id: `${TEST_PREFIX}-org-2`,
  name: "CT Topics Other Org",
  slug: `${TEST_PREFIX}-org-2`,
  createdAt: new Date(),
  logo: null,
  metadata: null,
};

const testMember = {
  id: `${TEST_PREFIX}-member-1`,
  organizationId: testOrg.id,
  userId: testUser.id,
  role: "owner" as const,
  createdAt: new Date(),
};

const normalTopic = {
  id: `${TEST_PREFIX}-topic-normal`,
  organizationId: testOrg.id,
  name: "Normal Newsletter",
  slug: `${TEST_PREFIX}-normal`,
  description: "A regular topic without double opt-in",
  public: true,
  doubleOptIn: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: testUser.id,
};

const doiTopic = {
  id: `${TEST_PREFIX}-topic-doi`,
  organizationId: testOrg.id,
  name: "Double Opt-In Newsletter",
  slug: `${TEST_PREFIX}-doi`,
  description: "A topic requiring confirmation",
  public: true,
  doubleOptIn: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: testUser.id,
};

const testContact = {
  id: `${TEST_PREFIX}-contact-1`,
  organizationId: testOrg.id,
  email: `${TEST_PREFIX}-contact@example.com`,
  emailHash: `${TEST_PREFIX}-hash-1`,
  emailStatus: "active" as const,
  properties: {},
  createdAt: new Date(),
  updatedAt: new Date(),
};

const otherOrgContact = {
  id: `${TEST_PREFIX}-contact-other`,
  organizationId: otherOrg.id,
  email: `${TEST_PREFIX}-other@example.com`,
  emailHash: `${TEST_PREFIX}-hash-other`,
  emailStatus: "active" as const,
  properties: {},
  createdAt: new Date(),
  updatedAt: new Date(),
};

const auth: AuthContext = {
  apiKeyId: null,
  organizationId: testOrg.id,
  userId: testUser.id,
  planId: "starter",
};

function createTestApp() {
  return new Elysia().derive(() => ({ auth })).use(contactsTopicsRoutes);
}

function putTopics(
  app: ReturnType<typeof createTestApp>,
  contactId: string,
  body: { topicIds?: string[]; topicSlugs?: string[] }
) {
  return app.handle(
    new Request(`http://localhost/v1/contacts/${contactId}/topics`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

beforeAll(async () => {
  await db
    .insert(user)
    .values(testUser)
    .onConflictDoUpdate({ target: user.id, set: { updatedAt: new Date() } });

  await db
    .insert(organization)
    .values(testOrg)
    .onConflictDoUpdate({
      target: organization.id,
      set: { name: testOrg.name },
    });

  await db
    .insert(organization)
    .values(otherOrg)
    .onConflictDoUpdate({
      target: organization.id,
      set: { name: otherOrg.name },
    });

  await db
    .insert(member)
    .values(testMember)
    .onConflictDoUpdate({ target: member.id, set: { role: testMember.role } });

  await db
    .insert(topic)
    .values(normalTopic)
    .onConflictDoUpdate({ target: topic.id, set: { name: normalTopic.name } });

  await db
    .insert(topic)
    .values(doiTopic)
    .onConflictDoUpdate({ target: topic.id, set: { name: doiTopic.name } });

  await db
    .insert(contact)
    .values(testContact)
    .onConflictDoUpdate({ target: contact.id, set: { updatedAt: new Date() } });

  await db
    .insert(contact)
    .values(otherOrgContact)
    .onConflictDoUpdate({
      target: contact.id,
      set: { updatedAt: new Date() },
    });
});

beforeEach(async () => {
  await db
    .delete(contactTopic)
    .where(eq(contactTopic.contactId, testContact.id));
  vi.clearAllMocks();
});

afterAll(async () => {
  await db
    .delete(contactTopic)
    .where(eq(contactTopic.contactId, testContact.id));
  await db.delete(contact).where(eq(contact.id, otherOrgContact.id));
  await db.delete(contact).where(eq(contact.id, testContact.id));
  await db.delete(topic).where(eq(topic.id, doiTopic.id));
  await db.delete(topic).where(eq(topic.id, normalTopic.id));
  await db.delete(member).where(eq(member.id, testMember.id));
  await db.delete(organization).where(eq(organization.id, otherOrg.id));
  await db.delete(organization).where(eq(organization.id, testOrg.id));
  await db.delete(user).where(eq(user.id, testUser.id));
});

describe("PUT /v1/contacts/:id/topics", () => {
  describe("404 handling", () => {
    it("returns 404 when contact does not exist", async () => {
      const app = createTestApp();
      const res = await putTopics(app, "non-existent-id", {
        topicIds: [normalTopic.id],
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("Contact not found");
    });

    it("returns 404 when contact belongs to a different org (IDOR prevention)", async () => {
      const app = createTestApp();
      const res = await putTopics(app, otherOrgContact.id, {
        topicIds: [normalTopic.id],
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("Contact not found");
    });
  });

  describe("normal topic subscription", () => {
    it("subscribes to a normal topic with status subscribed immediately", async () => {
      const app = createTestApp();
      const res = await putTopics(app, testContact.id, {
        topicIds: [normalTopic.id],
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.topics).toHaveLength(1);
      expect(body.topics[0].topicId).toBe(normalTopic.id);
      expect(body.topics[0].status).toBe("subscribed");
      expect(body.pendingTopics).toBeUndefined();

      const rows = await db
        .select()
        .from(contactTopic)
        .where(eq(contactTopic.contactId, testContact.id));
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe("subscribed");
      expect(rows[0].subscribedAt).not.toBeNull();
      expect(rows[0].confirmedAt).not.toBeNull();
    });
  });

  describe("double opt-in topic subscription", () => {
    it("subscribes to a double opt-in topic with status pending", async () => {
      const app = createTestApp();
      const res = await putTopics(app, testContact.id, {
        topicIds: [doiTopic.id],
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.topics).toHaveLength(1);
      expect(body.topics[0].topicId).toBe(doiTopic.id);
      expect(body.topics[0].status).toBe("pending");
      expect(body.pendingTopics).toContain(doiTopic.id);

      const rows = await db
        .select()
        .from(contactTopic)
        .where(eq(contactTopic.contactId, testContact.id));
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe("pending");
      expect(rows[0].subscribedAt).toBeNull();
      expect(rows[0].confirmedAt).toBeNull();
    });

    it("sends confirmation email for double opt-in topic", async () => {
      const app = createTestApp();
      await putTopics(app, testContact.id, { topicIds: [doiTopic.id] });

      expect(sendTopicConfirmationEmail).toHaveBeenCalledTimes(1);
      expect(sendTopicConfirmationEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          contactId: testContact.id,
          contactEmail: testContact.email,
          topicId: doiTopic.id,
          topicName: doiTopic.name,
          organizationId: testOrg.id,
        })
      );
    });

    it("does not send confirmation email for normal topic", async () => {
      const app = createTestApp();
      await putTopics(app, testContact.id, { topicIds: [normalTopic.id] });

      expect(sendTopicConfirmationEmail).not.toHaveBeenCalled();
    });

    it("re-subscription to previously confirmed doi topic skips re-confirmation", async () => {
      const confirmedAt = new Date(Date.now() - 86_400_000);

      await db.insert(contactTopic).values({
        contactId: testContact.id,
        topicId: doiTopic.id,
        status: "unsubscribed",
        subscribedAt: confirmedAt,
        confirmedAt,
        unsubscribedAt: new Date(),
      });

      const app = createTestApp();
      const res = await putTopics(app, testContact.id, {
        topicIds: [doiTopic.id],
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.pendingTopics).toBeUndefined();
      expect(body.topics[0].status).toBe("subscribed");

      expect(sendTopicConfirmationEmail).not.toHaveBeenCalled();

      const rows = await db
        .select()
        .from(contactTopic)
        .where(eq(contactTopic.contactId, testContact.id));
      expect(rows[0].status).toBe("subscribed");
      expect(rows[0].confirmedAt?.getTime()).toBe(confirmedAt.getTime());
    });
  });

  describe("PUT with empty topicIds removes all subscriptions", () => {
    it("removes all existing subscriptions when topicIds is empty", async () => {
      await db.insert(contactTopic).values({
        contactId: testContact.id,
        topicId: normalTopic.id,
        status: "subscribed",
        subscribedAt: new Date(),
        confirmedAt: new Date(),
      });

      const app = createTestApp();
      const res = await putTopics(app, testContact.id, { topicIds: [] });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.topics).toHaveLength(0);

      const rows = await db
        .select()
        .from(contactTopic)
        .where(eq(contactTopic.contactId, testContact.id));
      expect(rows).toHaveLength(0);
    });
  });

  describe("workflow event emission", () => {
    it("emits topic_unsubscribed for topics removed from the new list", async () => {
      await db.insert(contactTopic).values({
        contactId: testContact.id,
        topicId: normalTopic.id,
        status: "subscribed",
        subscribedAt: new Date(),
        confirmedAt: new Date(),
      });

      const app = createTestApp();
      const res = await putTopics(app, testContact.id, { topicIds: [] });

      expect(res.status).toBe(200);
      expect(emitTopicUnsubscribed).toHaveBeenCalledTimes(1);
      expect(emitTopicUnsubscribed).toHaveBeenCalledWith(
        expect.objectContaining({
          contactId: testContact.id,
          organizationId: testOrg.id,
          topicId: normalTopic.id,
        })
      );
    });

    it("emits topic_subscribed for topics new in the list (not pending, not previously subscribed)", async () => {
      const app = createTestApp();
      const res = await putTopics(app, testContact.id, {
        topicIds: [normalTopic.id],
      });

      expect(res.status).toBe(200);
      expect(emitTopicSubscribed).toHaveBeenCalledTimes(1);
      expect(emitTopicSubscribed).toHaveBeenCalledWith(
        expect.objectContaining({
          contactId: testContact.id,
          organizationId: testOrg.id,
          topicId: normalTopic.id,
          topicName: normalTopic.name,
        })
      );
    });

    it("does not emit topic_subscribed for double opt-in topics (they are pending)", async () => {
      const app = createTestApp();
      await putTopics(app, testContact.id, { topicIds: [doiTopic.id] });

      expect(emitTopicSubscribed).not.toHaveBeenCalled();
    });

    it("does not emit topic_subscribed for topics that were already subscribed and remain in the list", async () => {
      await db.insert(contactTopic).values({
        contactId: testContact.id,
        topicId: normalTopic.id,
        status: "subscribed",
        subscribedAt: new Date(),
        confirmedAt: new Date(),
      });

      const app = createTestApp();
      const res = await putTopics(app, testContact.id, {
        topicIds: [normalTopic.id],
      });

      expect(res.status).toBe(200);
      expect(emitTopicSubscribed).not.toHaveBeenCalled();
    });

    it("does not emit topic_unsubscribed for topics that were pending (not actively subscribed)", async () => {
      await db.insert(contactTopic).values({
        contactId: testContact.id,
        topicId: doiTopic.id,
        status: "pending",
        subscribedAt: null,
        confirmedAt: null,
      });

      const app = createTestApp();
      await putTopics(app, testContact.id, { topicIds: [] });

      expect(emitTopicUnsubscribed).not.toHaveBeenCalled();
    });

    it("emits both topic_subscribed and topic_unsubscribed on a swap", async () => {
      await db.insert(contactTopic).values({
        contactId: testContact.id,
        topicId: normalTopic.id,
        status: "subscribed",
        subscribedAt: new Date(),
        confirmedAt: new Date(),
      });

      const app = createTestApp();
      const res = await putTopics(app, testContact.id, {
        topicIds: [doiTopic.id],
      });

      expect(res.status).toBe(200);
      expect(emitTopicUnsubscribed).toHaveBeenCalledTimes(1);
      expect(emitTopicUnsubscribed).toHaveBeenCalledWith(
        expect.objectContaining({ topicId: normalTopic.id })
      );
      expect(emitTopicSubscribed).not.toHaveBeenCalled();
    });
  });

  describe("segment checks", () => {
    it("calls checkSegmentEntry and checkSegmentExit after every PUT", async () => {
      const app = createTestApp();
      await putTopics(app, testContact.id, { topicIds: [normalTopic.id] });

      expect(checkSegmentEntry).toHaveBeenCalledTimes(1);
      expect(checkSegmentEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          contactId: testContact.id,
          organizationId: testOrg.id,
          previousSegmentIds: [],
        })
      );
      expect(checkSegmentExit).toHaveBeenCalledTimes(1);
      expect(checkSegmentExit).toHaveBeenCalledWith(
        expect.objectContaining({
          contactId: testContact.id,
          organizationId: testOrg.id,
          previousSegmentIds: [],
        })
      );
    });

    it("passes the pre-write membership snapshot to both checks", async () => {
      vi.mocked(getSegmentMembership).mockResolvedValueOnce(["seg-1"]);
      const app = createTestApp();
      await putTopics(app, testContact.id, { topicIds: [normalTopic.id] });

      expect(checkSegmentEntry).toHaveBeenCalledWith(
        expect.objectContaining({ previousSegmentIds: ["seg-1"] })
      );
      expect(checkSegmentExit).toHaveBeenCalledWith(
        expect.objectContaining({ previousSegmentIds: ["seg-1"] })
      );
    });

    it("skips both checks but still returns 200 when the snapshot fails", async () => {
      vi.mocked(getSegmentMembership).mockRejectedValueOnce(
        new Error("snapshot failed")
      );
      const app = createTestApp();
      const res = await putTopics(app, testContact.id, {
        topicIds: [normalTopic.id],
      });

      expect(res.status).toBe(200);
      expect(checkSegmentEntry).not.toHaveBeenCalled();
      expect(checkSegmentExit).not.toHaveBeenCalled();
    });

    it("calls segment checks even when topicIds is empty", async () => {
      const app = createTestApp();
      await putTopics(app, testContact.id, { topicIds: [] });

      expect(checkSegmentEntry).toHaveBeenCalledTimes(1);
      expect(checkSegmentExit).toHaveBeenCalledTimes(1);
    });
  });

  describe("slug resolution", () => {
    it("resolves topicSlugs to topic IDs and subscribes", async () => {
      const app = createTestApp();
      const res = await putTopics(app, testContact.id, {
        topicSlugs: [normalTopic.slug],
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.topics).toHaveLength(1);
      expect(body.topics[0].topicId).toBe(normalTopic.id);
      expect(body.topics[0].status).toBe("subscribed");
    });

    it("combines topicIds and topicSlugs without duplication", async () => {
      const app = createTestApp();
      const res = await putTopics(app, testContact.id, {
        topicIds: [normalTopic.id],
        topicSlugs: [doiTopic.slug],
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.topics).toHaveLength(2);

      const topicIds = body.topics.map((t: { topicId: string }) => t.topicId);
      expect(topicIds).toContain(normalTopic.id);
      expect(topicIds).toContain(doiTopic.id);
    });

    it("ignores non-existent slugs gracefully", async () => {
      const app = createTestApp();
      const res = await putTopics(app, testContact.id, {
        topicSlugs: ["does-not-exist"],
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.topics).toHaveLength(0);
    });
  });

  describe("response shape", () => {
    it("returns subscribedAt as ISO string for subscribed topics", async () => {
      const app = createTestApp();
      const res = await putTopics(app, testContact.id, {
        topicIds: [normalTopic.id],
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      const topicEntry = body.topics[0];
      expect(typeof topicEntry.subscribedAt).toBe("string");
      expect(topicEntry.subscribedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("returns subscribedAt as null for pending topics", async () => {
      const app = createTestApp();
      const res = await putTopics(app, testContact.id, {
        topicIds: [doiTopic.id],
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.topics[0].subscribedAt).toBeNull();
    });
  });
});
