/**
 * Repeated-topic regression tests (real DB)
 *
 * `contact_topic` is keyed by (contactId, topicId). All three subscription
 * writes — POST /v1/contacts, PATCH /v1/contacts/:id, and
 * PUT /v1/contacts/:id/topics — build their topic list by concatenating
 * `topicIds` with the ids resolved from `topicSlugs`, then narrow it with
 * `.filter()`. Neither step removes a repeat, so a request naming one topic
 * twice reached the INSERT with two identical rows and violated the primary
 * key: the whole write failed as a bare 500.
 *
 * Naming a topic by id and by slug in the same request is enough to trigger
 * it — the caller never has to repeat itself.
 *
 * The PUT is the destructive one: it deletes every existing subscription
 * before inserting, outside a transaction, so the failed insert left the
 * contact with no subscriptions at all.
 *
 * File suffix `-db.test.ts` = real Neon test branch. A primary-key violation
 * is only observable against a real database; a mocked client asserts nothing.
 */

import {
  contact,
  contactTopic,
  db,
  fetchContactSubscriptions,
  fetchTopicsForSubscription,
  member,
  organization,
  topic,
  user,
} from "@wraps/db";
import { sendTopicConfirmationEmail } from "@wraps/email";
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

/**
 * Real `@wraps/db` throughout — the tests below assert against actual rows —
 * except that the two reads feeding the topic writes are spy-wrapped. Both
 * default to the genuine implementation; individual tests override one call to
 * inject a fault that is otherwise only reachable by racing two requests.
 */
vi.mock("@wraps/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@wraps/db")>();
  return {
    ...actual,
    fetchTopicsForSubscription: vi.fn(actual.fetchTopicsForSubscription),
    fetchContactSubscriptions: vi.fn(actual.fetchContactSubscriptions),
  };
});

vi.mock("../services/workflow-events", () => ({
  emitContactCreated: vi.fn().mockResolvedValue(undefined),
  emitContactUpdated: vi.fn().mockResolvedValue(undefined),
  checkSegmentEntry: vi.fn().mockResolvedValue(undefined),
  checkSegmentExit: vi.fn().mockResolvedValue(undefined),
  emitTopicSubscribed: vi.fn().mockResolvedValue(undefined),
  emitTopicUnsubscribed: vi.fn().mockResolvedValue(undefined),
}));

// ─── Fixtures ────────────────────────────────────────────────────────────────

const P = `ct-dup-db-${crypto.randomUUID().slice(0, 8)}`;

const org = {
  id: `${P}-org`,
  name: `${P} Org`,
  slug: `${P}-org`,
  createdAt: new Date(),
  logo: null,
  metadata: null,
};

const testUser = {
  id: `${P}-user`,
  email: `${P}@example.com`,
  name: "Duplicate Topic Test User",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  image: null,
  twoFactorEnabled: false,
  stripeCustomerId: null,
};

const testMember = {
  id: `${P}-member`,
  organizationId: org.id,
  userId: testUser.id,
  role: "owner" as const,
  createdAt: new Date(),
};

const newsletter = {
  id: `${P}-newsletter`,
  organizationId: org.id,
  name: "Newsletter",
  slug: `${P}-newsletter`,
  description: "Weekly newsletter",
  public: true,
  doubleOptIn: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: testUser.id,
};

const productUpdates = {
  id: `${P}-product-updates`,
  organizationId: org.id,
  name: "Product Updates",
  slug: `${P}-product-updates`,
  description: "Release notes",
  public: true,
  doubleOptIn: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: testUser.id,
};

/**
 * Double opt-in topic. Subscribing to this one routes through `pendingTopics`,
 * where the observable side effect of a repeat is an outbound confirmation
 * email rather than a row — the branch a row-count assertion cannot see.
 */
const insiders = {
  id: `${P}-insiders`,
  organizationId: org.id,
  name: "Insiders",
  slug: `${P}-insiders`,
  description: "Confirmed subscribers only",
  public: true,
  doubleOptIn: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: testUser.id,
};

const mockAuth = {
  apiKeyId: `${P}-key`,
  organizationId: org.id,
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

/** Seed a contact with a real UUID so `resolveContactId` treats it as an id. */
async function seedContact(email: string): Promise<string> {
  const contactId = crypto.randomUUID();
  await db.insert(contact).values({
    id: contactId,
    organizationId: org.id,
    email,
    emailHash: `${P}-${crypto.randomUUID().slice(0, 8)}`,
    emailStatus: "active",
    properties: {},
  });
  return contactId;
}

async function subscriptionsFor(contactId: string) {
  return db
    .select({ topicId: contactTopic.topicId, status: contactTopic.status })
    .from(contactTopic)
    .where(eq(contactTopic.contactId, contactId));
}

// ─── Setup / teardown ────────────────────────────────────────────────────────

beforeAll(async () => {
  await db
    .insert(user)
    .values(testUser)
    .onConflictDoUpdate({ target: user.id, set: { updatedAt: new Date() } });
  await db
    .insert(organization)
    .values(org)
    .onConflictDoUpdate({ target: organization.id, set: { name: org.name } });
  await db
    .insert(member)
    .values(testMember)
    .onConflictDoUpdate({ target: member.id, set: { role: testMember.role } });
  await db
    .insert(topic)
    .values(newsletter)
    .onConflictDoUpdate({ target: topic.id, set: { name: newsletter.name } });
  await db
    .insert(topic)
    .values(productUpdates)
    .onConflictDoUpdate({
      target: topic.id,
      set: { name: productUpdates.name },
    });
  await db
    .insert(topic)
    .values(insiders)
    .onConflictDoUpdate({ target: topic.id, set: { name: insiders.name } });
});

beforeEach(async () => {
  await db.delete(contact).where(eq(contact.organizationId, org.id));
  vi.clearAllMocks();
});

afterAll(async () => {
  await db.delete(contact).where(eq(contact.organizationId, org.id));
  await db.delete(topic).where(eq(topic.id, newsletter.id));
  await db.delete(topic).where(eq(topic.id, productUpdates.id));
  await db.delete(topic).where(eq(topic.id, insiders.id));
  await db.delete(member).where(eq(member.id, testMember.id));
  await db.delete(organization).where(eq(organization.id, org.id));
  await db.delete(user).where(eq(user.id, testUser.id));
});

// ─── POST /v1/contacts ───────────────────────────────────────────────────────

describe("Repeated topics — POST /v1/contacts", () => {
  it("subscribes once when topicIds names the same topic twice", async () => {
    const email = `${P}-post-repeat@example.com`;
    const app = createContactsApp();

    const res = await app.handle(
      new Request("http://localhost/v1/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          topicIds: [newsletter.id, newsletter.id],
        }),
      })
    );

    expect(res.status).toBe(201);

    const [created] = await db
      .select({ id: contact.id })
      .from(contact)
      .where(and(eq(contact.organizationId, org.id), eq(contact.email, email)))
      .limit(1);
    expect(created).toBeDefined();

    const subs = await subscriptionsFor(created.id);
    expect(subs).toEqual([{ topicId: newsletter.id, status: "subscribed" }]);
  });

  it("subscribes once when the same topic arrives as both an id and a slug", async () => {
    const email = `${P}-post-id-and-slug@example.com`;
    const app = createContactsApp();

    const res = await app.handle(
      new Request("http://localhost/v1/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          topicIds: [newsletter.id],
          topicSlugs: [newsletter.slug],
        }),
      })
    );

    expect(res.status).toBe(201);

    const [created] = await db
      .select({ id: contact.id })
      .from(contact)
      .where(and(eq(contact.organizationId, org.id), eq(contact.email, email)))
      .limit(1);
    expect(created).toBeDefined();

    const subs = await subscriptionsFor(created.id);
    expect(subs).toEqual([{ topicId: newsletter.id, status: "subscribed" }]);
  });

  it("still subscribes to every distinct topic alongside a repeat", async () => {
    const email = `${P}-post-mixed@example.com`;
    const app = createContactsApp();

    const res = await app.handle(
      new Request("http://localhost/v1/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          topicIds: [newsletter.id, productUpdates.id, newsletter.id],
        }),
      })
    );

    expect(res.status).toBe(201);

    const [created] = await db
      .select({ id: contact.id })
      .from(contact)
      .where(and(eq(contact.organizationId, org.id), eq(contact.email, email)))
      .limit(1);

    const subs = await subscriptionsFor(created.id);
    expect(subs.map((s) => s.topicId).sort()).toEqual(
      [newsletter.id, productUpdates.id].sort()
    );
  });

  it("sends one confirmation email when a repeated topic is double opt-in", async () => {
    const email = `${P}-post-doi@example.com`;
    const app = createContactsApp();

    const res = await app.handle(
      new Request("http://localhost/v1/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          topicIds: [insiders.id, insiders.id],
        }),
      })
    );

    expect(res.status).toBe(201);

    const [created] = await db
      .select({ id: contact.id })
      .from(contact)
      .where(and(eq(contact.organizationId, org.id), eq(contact.email, email)))
      .limit(1);

    const subs = await subscriptionsFor(created.id);
    expect(subs).toEqual([{ topicId: insiders.id, status: "pending" }]);

    expect(sendTopicConfirmationEmail).toHaveBeenCalledTimes(1);
    expect(sendTopicConfirmationEmail).toHaveBeenCalledWith(
      expect.objectContaining({ contactEmail: email, topicId: insiders.id })
    );
  });
});

// ─── PATCH /v1/contacts/:id ──────────────────────────────────────────────────

describe("Repeated topics — PATCH /v1/contacts/:id", () => {
  it("subscribes once when topicIds names the same topic twice", async () => {
    const contactId = await seedContact(`${P}-patch-repeat@example.com`);
    const app = createContactsApp();

    const res = await app.handle(
      new Request(`http://localhost/v1/contacts/${contactId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topicIds: [newsletter.id, newsletter.id],
        }),
      })
    );

    expect(res.status).toBe(200);

    const subs = await subscriptionsFor(contactId);
    expect(subs).toEqual([{ topicId: newsletter.id, status: "subscribed" }]);
  });

  it("subscribes once when the same topic arrives as both an id and a slug", async () => {
    const contactId = await seedContact(`${P}-patch-id-and-slug@example.com`);
    const app = createContactsApp();

    const res = await app.handle(
      new Request(`http://localhost/v1/contacts/${contactId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topicIds: [newsletter.id],
          topicSlugs: [newsletter.slug],
        }),
      })
    );

    expect(res.status).toBe(200);

    const subs = await subscriptionsFor(contactId);
    expect(subs).toEqual([{ topicId: newsletter.id, status: "subscribed" }]);
  });

  it("resubscribes once, and emits one event, when a repeated topic is already inactive", async () => {
    // The quiet one. An existing-but-inactive subscription takes the
    // resubscribe path, which UPDATEs with `inArray` — a repeat never reaches
    // a primary key, so this returned 200 while firing the side effects twice.
    const contactId = await seedContact(`${P}-patch-resub@example.com`);
    await db.insert(contactTopic).values({
      contactId,
      topicId: newsletter.id,
      status: "unsubscribed",
      subscribedAt: null,
      unsubscribedAt: new Date(),
      confirmedAt: new Date(),
    });

    const app = createContactsApp();
    const res = await app.handle(
      new Request(`http://localhost/v1/contacts/${contactId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topicIds: [newsletter.id, newsletter.id],
        }),
      })
    );

    expect(res.status).toBe(200);

    const subs = await subscriptionsFor(contactId);
    expect(subs).toEqual([{ topicId: newsletter.id, status: "subscribed" }]);

    // One resubscribe, one workflow trigger — not two.
    expect(emitTopicSubscribed).toHaveBeenCalledTimes(1);
    expect(emitTopicSubscribed).toHaveBeenCalledWith(
      expect.objectContaining({ contactId, topicId: newsletter.id })
    );
  });

  it("sends one confirmation email when a repeated double opt-in topic is already inactive", async () => {
    // Same resubscribe path, double opt-in branch: the repeat's observable
    // cost is a second confirmation email to the same address.
    const email = `${P}-patch-resub-doi@example.com`;
    const contactId = await seedContact(email);
    await db.insert(contactTopic).values({
      contactId,
      topicId: insiders.id,
      status: "unsubscribed",
      subscribedAt: null,
      unsubscribedAt: new Date(),
      confirmedAt: null, // never confirmed → resubscribe requires confirmation
    });

    const app = createContactsApp();
    const res = await app.handle(
      new Request(`http://localhost/v1/contacts/${contactId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topicIds: [insiders.id],
          topicSlugs: [insiders.slug],
        }),
      })
    );

    expect(res.status).toBe(200);

    const subs = await subscriptionsFor(contactId);
    expect(subs).toEqual([{ topicId: insiders.id, status: "pending" }]);

    expect(sendTopicConfirmationEmail).toHaveBeenCalledTimes(1);
    expect(sendTopicConfirmationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        contactId,
        contactEmail: email,
        topicId: insiders.id,
      })
    );
  });
});

// ─── PUT /v1/contacts/:id/topics ─────────────────────────────────────────────

describe("Repeated topics — PUT /v1/contacts/:id/topics", () => {
  it("subscribes once when topicIds names the same topic twice", async () => {
    const contactId = await seedContact(`${P}-put-repeat@example.com`);
    const app = createContactsTopicsApp();

    const res = await app.handle(
      new Request(`http://localhost/v1/contacts/${contactId}/topics`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topicIds: [newsletter.id, newsletter.id],
        }),
      })
    );

    expect(res.status).toBe(200);

    const body = await res.json();
    expect(
      (body.topics as Array<{ topicId: string }>).map((t) => t.topicId)
    ).toEqual([newsletter.id]);

    const subs = await subscriptionsFor(contactId);
    expect(subs).toEqual([{ topicId: newsletter.id, status: "subscribed" }]);
  });

  it("does not wipe out existing subscriptions when the new list repeats a topic", async () => {
    // The replace deletes every existing row before inserting, and the two
    // statements are not in one transaction — so a failed insert used to
    // leave the contact with nothing at all.
    const contactId = await seedContact(`${P}-put-no-wipe@example.com`);
    await db.insert(contactTopic).values({
      contactId,
      topicId: newsletter.id,
      status: "subscribed",
      subscribedAt: new Date(),
      confirmedAt: new Date(),
    });

    const app = createContactsTopicsApp();
    const res = await app.handle(
      new Request(`http://localhost/v1/contacts/${contactId}/topics`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topicIds: [productUpdates.id, productUpdates.id],
        }),
      })
    );

    expect(res.status).toBe(200);

    // Replace semantics: the old topic goes, the named one lands exactly once.
    // What must never happen is ending up with zero rows.
    const subs = await subscriptionsFor(contactId);
    expect(subs).toEqual([
      { topicId: productUpdates.id, status: "subscribed" },
    ]);
  });

  it("keeps existing subscriptions when the replacing insert fails", async () => {
    // The replace deletes every row before inserting. Unless both statements
    // share a transaction, an insert that fails for any reason leaves the
    // contact with nothing — the request 500s and the subscriptions are gone.
    //
    // The fault is injected upstream of both statements so this asserts the
    // rollback rather than any particular insert call.
    const contactId = await seedContact(`${P}-put-rollback@example.com`);
    await db.insert(contactTopic).values({
      contactId,
      topicId: newsletter.id,
      status: "subscribed",
      subscribedAt: new Date(),
      confirmedAt: new Date(),
    });

    // A topic that passes the ownership filter but has no row in `topic`, so
    // the insert dies on the foreign key. The id must be the one the request
    // asks for, or it is filtered out and nothing is inserted at all.
    const phantomTopicId = crypto.randomUUID();
    vi.mocked(fetchTopicsForSubscription).mockResolvedValueOnce([
      {
        id: phantomTopicId,
        name: "Phantom",
        description: null,
        doubleOptIn: false,
      },
    ]);

    const app = createContactsTopicsApp();
    const res = await app.handle(
      new Request(`http://localhost/v1/contacts/${contactId}/topics`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicIds: [phantomTopicId] }),
      })
    );

    expect(res.status).toBeGreaterThanOrEqual(400);

    // The pre-existing subscription must have survived the failed replace.
    const subs = await subscriptionsFor(contactId);
    expect(subs).toEqual([{ topicId: newsletter.id, status: "subscribed" }]);
  });
});

// ─── Conflict reporting ──────────────────────────────────────────────────────

describe("Subscription conflicts are reported, not swallowed as 500", () => {
  it("answers 409 when a concurrent request already subscribed the topic", async () => {
    // Faithful race simulation: the contact really is subscribed, but the read
    // that decides which topics are new returns nothing — exactly what a
    // concurrent subscribe between the read and the write looks like. The
    // INSERT then collides with the real row.
    const contactId = await seedContact(`${P}-patch-race@example.com`);
    await db.insert(contactTopic).values({
      contactId,
      topicId: newsletter.id,
      status: "subscribed",
      subscribedAt: new Date(),
      confirmedAt: new Date(),
    });

    vi.mocked(fetchContactSubscriptions).mockResolvedValueOnce([]);

    const app = createContactsApp();
    const res = await app.handle(
      new Request(`http://localhost/v1/contacts/${contactId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicIds: [newsletter.id] }),
      })
    );

    expect(res.status).toBe(409);

    const body = await res.json();
    expect(body.error).toMatch(/already subscribed/i);

    // The existing subscription is untouched.
    const subs = await subscriptionsFor(contactId);
    expect(subs).toEqual([{ topicId: newsletter.id, status: "subscribed" }]);
  });
});
