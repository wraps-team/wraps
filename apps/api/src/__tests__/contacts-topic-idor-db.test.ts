/**
 * Cross-org topic-subscription IDOR regression tests (real DB)
 *
 * Verifies that POST /v1/contacts, PATCH /v1/contacts/:id, and
 * PUT /v1/contacts/:id/topics all filter user-supplied topicIds to
 * org-owned topics before writing contact_topic rows. A foreign-org
 * topic UUID must be silently dropped, never persisted.
 *
 * File suffix `-db.test.ts` = real Neon test branch (no mocks for DB).
 */

import {
  contact,
  contactTopic,
  db,
  member,
  organization,
  topic,
  user,
} from "@wraps/db";
import { and, eq } from "drizzle-orm";
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

import { contactsRoutes } from "../routes/contacts";
import { contactsTopicsRoutes } from "../routes/contacts-topics";
import { emitTopicSubscribed } from "../services/workflow-events";

// ─── Boundary mocks ─────────────────────────────────────────────────────────

vi.mock("@wraps/email", () => ({
  sendTopicConfirmationEmail: vi.fn().mockResolvedValue(true),
}));

vi.mock("../services/workflow-events", () => ({
  emitContactCreated: vi.fn().mockResolvedValue(undefined),
  emitContactUpdated: vi.fn().mockResolvedValue(undefined),
  checkSegmentEntry: vi.fn().mockResolvedValue(undefined),
  checkSegmentExit: vi.fn().mockResolvedValue(undefined),
  getSegmentMembership: vi.fn().mockResolvedValue([]),
  emitTopicSubscribed: vi.fn().mockResolvedValue(undefined),
  emitTopicUnsubscribed: vi.fn().mockResolvedValue(undefined),
}));

// ─── Fixtures ────────────────────────────────────────────────────────────────

const P = `ct-idor-db-${crypto.randomUUID().slice(0, 8)}`;

const orgA = {
  id: `${P}-org-a`,
  name: `${P} Org A`,
  slug: `${P}-org-a`,
  createdAt: new Date(),
  logo: null,
  metadata: null,
};
const orgB = {
  id: `${P}-org-b`,
  name: `${P} Org B`,
  slug: `${P}-org-b`,
  createdAt: new Date(),
  logo: null,
  metadata: null,
};

const testUser = {
  id: `${P}-user`,
  email: `${P}@example.com`,
  name: "IDOR DB Test User",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  image: null,
  twoFactorEnabled: false,
  stripeCustomerId: null,
};

const testMember = {
  id: `${P}-member`,
  organizationId: orgA.id,
  userId: testUser.id,
  role: "owner" as const,
  createdAt: new Date(),
};

const ownTopic = {
  id: `${P}-own-topic`,
  organizationId: orgA.id,
  name: "Org A Newsletter",
  slug: `${P}-own-topic`,
  description: "Org A topic",
  public: true,
  doubleOptIn: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: testUser.id,
};

const foreignTopic = {
  id: `${P}-foreign-topic`,
  organizationId: orgB.id,
  name: "Org B Newsletter",
  slug: `${P}-foreign-topic`,
  description: "Org B topic",
  public: true,
  doubleOptIn: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: null,
};

// Auth context for org-a requests
const mockAuth = {
  apiKeyId: `${P}-key`,
  organizationId: orgA.id,
  userId: testUser.id,
  planId: "pro",
};

function createContactsApp() {
  return new Elysia().derive(() => ({ auth: mockAuth })).use(contactsRoutes);
}

function createContactsTopicsApp() {
  return new Elysia()
    .derive(() => ({ auth: mockAuth }))
    .use(contactsTopicsRoutes);
}

// ─── Setup / teardown ────────────────────────────────────────────────────────

beforeAll(async () => {
  await db
    .insert(user)
    .values(testUser)
    .onConflictDoUpdate({
      target: user.id,
      set: { updatedAt: new Date() },
    });
  await db
    .insert(organization)
    .values(orgA)
    .onConflictDoUpdate({
      target: organization.id,
      set: { name: orgA.name },
    });
  await db
    .insert(organization)
    .values(orgB)
    .onConflictDoUpdate({
      target: organization.id,
      set: { name: orgB.name },
    });
  await db
    .insert(member)
    .values(testMember)
    .onConflictDoUpdate({
      target: member.id,
      set: { role: testMember.role },
    });
  await db
    .insert(topic)
    .values(ownTopic)
    .onConflictDoUpdate({
      target: topic.id,
      set: { name: ownTopic.name },
    });
  await db
    .insert(topic)
    .values(foreignTopic)
    .onConflictDoUpdate({
      target: topic.id,
      set: { name: foreignTopic.name },
    });
});

beforeEach(async () => {
  await db.delete(contact).where(eq(contact.organizationId, orgA.id));
  vi.clearAllMocks();
});

afterAll(async () => {
  await db.delete(contact).where(eq(contact.organizationId, orgA.id));
  await db.delete(topic).where(eq(topic.id, ownTopic.id));
  await db.delete(topic).where(eq(topic.id, foreignTopic.id));
  await db.delete(member).where(eq(member.id, testMember.id));
  await db.delete(organization).where(eq(organization.id, orgA.id));
  await db.delete(organization).where(eq(organization.id, orgB.id));
  await db.delete(user).where(eq(user.id, testUser.id));
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Cross-org topic IDOR — POST /v1/contacts (site 1)", () => {
  it("creates contact but does NOT create contact_topic row for a foreign-org topic", async () => {
    const app = createContactsApp();
    const res = await app.handle(
      new Request("http://localhost/v1/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: `${P}-post-idor@example.com`,
          topicIds: [ownTopic.id, foreignTopic.id],
        }),
      })
    );

    expect(res.status).toBe(201);

    // Re-query the created contact
    const [created] = await db
      .select({ id: contact.id })
      .from(contact)
      .where(
        and(
          eq(contact.organizationId, orgA.id),
          eq(contact.email, `${P}-post-idor@example.com`)
        )
      )
      .limit(1);
    expect(created).toBeDefined();

    // Own-topic row must exist
    const ownSubs = await db
      .select()
      .from(contactTopic)
      .where(
        and(
          eq(contactTopic.contactId, created.id),
          eq(contactTopic.topicId, ownTopic.id)
        )
      );
    expect(ownSubs).toHaveLength(1);

    // Foreign-topic row must NOT exist
    const foreignSubs = await db
      .select()
      .from(contactTopic)
      .where(
        and(
          eq(contactTopic.contactId, created.id),
          eq(contactTopic.topicId, foreignTopic.id)
        )
      );
    expect(foreignSubs).toHaveLength(0);

    // Characterization: the immediate-subscription event carries the owned
    // topic's name (sourced from fetchTopicsForSubscription, no extra query),
    // and is never emitted for the foreign topic.
    expect(emitTopicSubscribed).toHaveBeenCalledWith(
      expect.objectContaining({
        contactId: created.id,
        topicId: ownTopic.id,
        topicName: ownTopic.name,
      })
    );
    expect(emitTopicSubscribed).not.toHaveBeenCalledWith(
      expect.objectContaining({ topicId: foreignTopic.id })
    );
  });
});

describe("Cross-org topic IDOR — PATCH /v1/contacts/:id (site 2)", () => {
  it("updates contact but does NOT create contact_topic row for a foreign-org topic", async () => {
    // Seed an existing contact with a real UUID so resolveContactId detects "uuid"
    const contactId = crypto.randomUUID();
    await db.insert(contact).values({
      id: contactId,
      organizationId: orgA.id,
      email: `${P}-patch-idor@example.com`,
      emailHash: `${P}-patch-hash`,
      emailStatus: "active",
      properties: {},
    });
    const seeded = { id: contactId };

    const app = createContactsApp();
    const res = await app.handle(
      new Request(`http://localhost/v1/contacts/${seeded.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topicIds: [foreignTopic.id],
        }),
      })
    );

    expect(res.status).toBe(200);

    // Foreign-topic row must NOT have been created
    const foreignSubs = await db
      .select()
      .from(contactTopic)
      .where(
        and(
          eq(contactTopic.contactId, seeded.id),
          eq(contactTopic.topicId, foreignTopic.id)
        )
      );
    expect(foreignSubs).toHaveLength(0);
  });
});

describe("Cross-org topic IDOR — PUT /v1/contacts/:id/topics (site 3)", () => {
  it("replaces topics but drops foreign-org topic from the write", async () => {
    const contactId = crypto.randomUUID();
    await db.insert(contact).values({
      id: contactId,
      organizationId: orgA.id,
      email: `${P}-put-idor@example.com`,
      emailHash: `${P}-put-hash`,
      emailStatus: "active",
      properties: {},
    });
    const seeded = { id: contactId };

    const app = createContactsTopicsApp();
    const res = await app.handle(
      new Request(`http://localhost/v1/contacts/${seeded.id}/topics`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topicIds: [ownTopic.id, foreignTopic.id],
        }),
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();

    // Response topics array must not include the foreign topic
    const topicIds = (body.topics as Array<{ topicId: string }>).map(
      (t) => t.topicId
    );
    expect(topicIds).toContain(ownTopic.id);
    expect(topicIds).not.toContain(foreignTopic.id);

    // DB must not have a row for the foreign topic
    const foreignSubs = await db
      .select()
      .from(contactTopic)
      .where(
        and(
          eq(contactTopic.contactId, seeded.id),
          eq(contactTopic.topicId, foreignTopic.id)
        )
      );
    expect(foreignSubs).toHaveLength(0);
  });
});
