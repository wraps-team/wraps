/**
 * Write-permission gates on POST /v1/contacts, PATCH /v1/contacts/:id,
 * DELETE /v1/contacts/:id, DELETE /v1/contacts (bulk) and
 * PUT /v1/contacts/:id/topics, on the real route stack: real DB, real
 * permission gate. Workflow events and email are mocked so a successful
 * call cannot reach AWS, and the mocks double as "nothing enqueued" checks.
 *
 * File suffix `-db.test.ts` = real Neon test branch (no `@wraps/db` mocks).
 */

import {
  contact,
  contactTopic,
  db,
  hashContactValue,
  member,
  topic,
  user,
} from "@wraps/db";
import { eq, inArray } from "drizzle-orm";
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
  cleanupBaseOrg,
  seedBaseOrg,
} from "../(ee)/__tests__/fixtures/real-db";
import {
  FULL_ACCESS_PERMISSIONS,
  READ_ONLY_PERMISSIONS,
} from "../services/api-keys";
import { createErrorHarness } from "./error-handler-harness";

vi.mock("@wraps/email", () => ({
  sendTopicConfirmationEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../services/workflow-events", () => ({
  emitContactCreated: vi.fn().mockResolvedValue({ workflowsTriggered: 0 }),
  emitContactUpdated: vi.fn().mockResolvedValue({ workflowsTriggered: 0 }),
  emitTopicSubscribed: vi.fn().mockResolvedValue({ workflowsTriggered: 0 }),
  emitTopicUnsubscribed: vi.fn().mockResolvedValue({ workflowsTriggered: 0 }),
  checkSegmentEntry: vi.fn().mockResolvedValue(undefined),
  checkSegmentExit: vi.fn().mockResolvedValue(undefined),
  getSegmentMembership: vi.fn().mockResolvedValue([]),
  emitWorkflowEvent: vi.fn().mockResolvedValue({ workflowsTriggered: 0 }),
}));

const { contactsRoutes } = await import("../routes/contacts");
const { contactsTopicsRoutes } = await import("../routes/contacts-topics");
const workflowEvents = await import("../services/workflow-events");

// PREFIX is only used for seeded rows (names, emails, the read-only user).
const PREFIX = `cperm-${crypto.randomUUID().slice(0, 8)}`;
const READ_ONLY_USER = `${PREFIX}-ro-user`;
const READ_ONLY_MEMBER = `${PREFIX}-ro-member`;
const READ_ONLY_EMAIL = `${PREFIX}-ro@example.com`;

const PERMISSION_DENIED = "You don't have permission to perform this action";

let ids: Awaited<ReturnType<typeof seedBaseOrg>>["ids"];
// Contacts and topics created by a test, removed in afterAll.
const createdContactIds = new Set<string>();
const createdTopicIds = new Set<string>();

function appFor(organizationId: string, userId: string) {
  const { app } = createErrorHarness();
  return app
    .derive(() => ({
      auth: { apiKeyId: null, organizationId, userId, planId: "pro" },
    }))
    .use(contactsRoutes)
    .use(contactsTopicsRoutes);
}

function keyAppFor(scopes: readonly string[]) {
  const { app } = createErrorHarness();
  return app
    .derive(() => ({
      auth: {
        apiKeyId: `${PREFIX}-key`,
        organizationId: ids.org,
        userId: ids.user,
        planId: "pro",
        apiKeyScopes: [...scopes],
      },
    }))
    .use(contactsRoutes)
    .use(contactsTopicsRoutes);
}

async function call(
  app: { handle: (r: Request) => Promise<Response> },
  method: string,
  path: string,
  body?: unknown
) {
  const res = await app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

const asReadOnlySession = () => appFor(ids.org, READ_ONLY_USER);
const asOwnerSession = () => appFor(ids.org, ids.user);
const asReadOnlyKey = () => keyAppFor(READ_ONLY_PERMISSIONS);
const asFullKey = () => keyAppFor(FULL_ACCESS_PERMISSIONS);

async function seedContact(label: string) {
  const id = crypto.randomUUID();
  const email = `${PREFIX}-${label}-${id.slice(0, 8)}@example.com`;
  await db.insert(contact).values({
    id,
    organizationId: ids.org,
    email,
    emailHash: hashContactValue(email),
    emailStatus: "active",
    properties: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  createdContactIds.add(id);
  return { id, email };
}

async function seedTopic(label: string) {
  const id = crypto.randomUUID();
  await db.insert(topic).values({
    id,
    organizationId: ids.org,
    name: `Topic ${label}`,
    slug: `${PREFIX}-${label}-${id.slice(0, 8)}`,
    description: "permission test topic",
    public: true,
    doubleOptIn: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: ids.user,
  });
  createdTopicIds.add(id);
  return id;
}

async function readContact(id: string) {
  const [row] = await db.select().from(contact).where(eq(contact.id, id));
  return row ?? null;
}

async function readSubscriptions(contactId: string) {
  return db
    .select()
    .from(contactTopic)
    .where(eq(contactTopic.contactId, contactId));
}

async function readContactByEmail(email: string) {
  const [row] = await db
    .select({ id: contact.id })
    .from(contact)
    .where(eq(contact.emailHash, hashContactValue(email)));
  return row ?? null;
}

beforeAll(async () => {
  const fixture = await seedBaseOrg(PREFIX);
  ids = fixture.ids;

  await db
    .insert(user)
    .values({
      id: READ_ONLY_USER,
      email: READ_ONLY_EMAIL,
      name: "Read Only Contacts Tester",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      image: null,
    } as typeof user.$inferInsert)
    .onConflictDoNothing();
  await db.insert(member).values({
    id: READ_ONLY_MEMBER,
    organizationId: ids.org,
    userId: READ_ONLY_USER,
    role: "read-only",
    createdAt: new Date(),
  });
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterAll(async () => {
  const contactIds = [...createdContactIds];
  if (contactIds.length > 0) {
    await db
      .delete(contactTopic)
      .where(inArray(contactTopic.contactId, contactIds));
  }
  const topicIds = [...createdTopicIds];
  if (topicIds.length > 0) {
    await db
      .delete(contactTopic)
      .where(inArray(contactTopic.topicId, topicIds));
    await db.delete(topic).where(inArray(topic.id, topicIds));
  }
  await db.delete(member).where(eq(member.id, READ_ONLY_MEMBER));
  await db.delete(user).where(eq(user.id, READ_ONLY_USER));
  await cleanupBaseOrg(PREFIX);
});

describe("POST /v1/contacts", () => {
  it("refuses a read-only session and creates nothing", async () => {
    const email = `${PREFIX}-denied-create@example.com`;
    const res = await call(asReadOnlySession(), "POST", "/v1/contacts", {
      email,
    });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: PERMISSION_DENIED });
    expect(await readContactByEmail(email)).toBeNull();
    expect(workflowEvents.emitContactCreated).not.toHaveBeenCalled();
  });

  it("refuses a key without contacts:write and creates nothing", async () => {
    const email = `${PREFIX}-denied-key-create@example.com`;
    const res = await call(asReadOnlyKey(), "POST", "/v1/contacts", { email });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: PERMISSION_DENIED });
    expect(await readContactByEmail(email)).toBeNull();
    expect(workflowEvents.emitContactCreated).not.toHaveBeenCalled();
  });

  it("lets an owner session create a contact", async () => {
    const email = `${PREFIX}-owner-create@example.com`;
    const res = await call(asOwnerSession(), "POST", "/v1/contacts", { email });

    expect(res.status).not.toBe(403);
    const created = await readContactByEmail(email);
    expect(created).not.toBeNull();
    if (created) {
      createdContactIds.add(created.id);
    }
  });

  it("lets a full-access key create a contact", async () => {
    const email = `${PREFIX}-key-create@example.com`;
    const res = await call(asFullKey(), "POST", "/v1/contacts", { email });

    expect(res.status).not.toBe(403);
    const created = await readContactByEmail(email);
    expect(created).not.toBeNull();
    if (created) {
      createdContactIds.add(created.id);
    }
  });
});

describe("PATCH /v1/contacts/:id", () => {
  it("refuses a read-only session and leaves the row untouched", async () => {
    const seeded = await seedContact("patch-ro");
    const before = await readContact(seeded.id);

    const res = await call(
      asReadOnlySession(),
      "PATCH",
      `/v1/contacts/${seeded.id}`,
      { externalId: `${PREFIX}-ext-denied` }
    );

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: PERMISSION_DENIED });
    expect(await readContact(seeded.id)).toEqual(before);
    expect(workflowEvents.emitContactUpdated).not.toHaveBeenCalled();
  });

  it("refuses a key without contacts:write and leaves the row untouched", async () => {
    const seeded = await seedContact("patch-key-ro");
    const before = await readContact(seeded.id);

    const res = await call(
      asReadOnlyKey(),
      "PATCH",
      `/v1/contacts/${seeded.id}`,
      { externalId: `${PREFIX}-ext-denied-key` }
    );

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: PERMISSION_DENIED });
    expect(await readContact(seeded.id)).toEqual(before);
    expect(workflowEvents.emitContactUpdated).not.toHaveBeenCalled();
  });

  it("lets an owner session update a contact", async () => {
    const seeded = await seedContact("patch-owner");

    const res = await call(
      asOwnerSession(),
      "PATCH",
      `/v1/contacts/${seeded.id}`,
      { externalId: `${PREFIX}-ext-owner` }
    );

    expect(res.status).not.toBe(403);
  });

  it("lets a full-access key update a contact", async () => {
    const seeded = await seedContact("patch-key");

    const res = await call(asFullKey(), "PATCH", `/v1/contacts/${seeded.id}`, {
      externalId: `${PREFIX}-ext-key`,
    });

    expect(res.status).not.toBe(403);
  });
});

describe("DELETE /v1/contacts/:id", () => {
  it("refuses a read-only session and keeps the contact", async () => {
    const seeded = await seedContact("del-ro");

    const res = await call(
      asReadOnlySession(),
      "DELETE",
      `/v1/contacts/${seeded.id}`
    );

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: PERMISSION_DENIED });
    expect(await readContact(seeded.id)).not.toBeNull();
  });

  it("refuses a key without contacts:write and keeps the contact", async () => {
    const seeded = await seedContact("del-key-ro");

    const res = await call(
      asReadOnlyKey(),
      "DELETE",
      `/v1/contacts/${seeded.id}`
    );

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: PERMISSION_DENIED });
    expect(await readContact(seeded.id)).not.toBeNull();
  });

  it("lets an owner session delete a contact", async () => {
    const seeded = await seedContact("del-owner");

    const res = await call(
      asOwnerSession(),
      "DELETE",
      `/v1/contacts/${seeded.id}`
    );

    expect(res.status).toBe(200);
    expect(await readContact(seeded.id)).toBeNull();
  });

  it("lets a full-access key delete a contact", async () => {
    const seeded = await seedContact("del-key");

    const res = await call(asFullKey(), "DELETE", `/v1/contacts/${seeded.id}`);

    expect(res.status).toBe(200);
    expect(await readContact(seeded.id)).toBeNull();
  });
});

describe("DELETE /v1/contacts (bulk)", () => {
  it("refuses a read-only session and keeps every listed contact", async () => {
    const a = await seedContact("bulk-ro-a");
    const b = await seedContact("bulk-ro-b");

    const res = await call(asReadOnlySession(), "DELETE", "/v1/contacts", {
      ids: [a.id, b.id],
    });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: PERMISSION_DENIED });
    expect(await readContact(a.id)).not.toBeNull();
    expect(await readContact(b.id)).not.toBeNull();
  });

  it("refuses a key without contacts:write and keeps every listed contact", async () => {
    const a = await seedContact("bulk-key-ro-a");

    const res = await call(asReadOnlyKey(), "DELETE", "/v1/contacts", {
      ids: [a.id],
    });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: PERMISSION_DENIED });
    expect(await readContact(a.id)).not.toBeNull();
  });

  it("lets an owner session bulk delete", async () => {
    const a = await seedContact("bulk-owner");

    const res = await call(asOwnerSession(), "DELETE", "/v1/contacts", {
      ids: [a.id],
    });

    expect(res.status).toBe(200);
    expect(await readContact(a.id)).toBeNull();
  });

  it("lets a full-access key bulk delete", async () => {
    const a = await seedContact("bulk-key");

    const res = await call(asFullKey(), "DELETE", "/v1/contacts", {
      ids: [a.id],
    });

    expect(res.status).toBe(200);
    expect(await readContact(a.id)).toBeNull();
  });
});

describe("PUT /v1/contacts/:id/topics", () => {
  it("refuses a read-only session and keeps existing subscriptions", async () => {
    const seeded = await seedContact("topics-ro");
    const topicId = await seedTopic("topics-ro");
    await db.insert(contactTopic).values({
      contactId: seeded.id,
      topicId,
      status: "subscribed",
      subscribedAt: new Date(),
      confirmedAt: new Date(),
    });
    const before = await readSubscriptions(seeded.id);

    // An empty list would unsubscribe everything, so a bypassed gate is visible.
    const res = await call(
      asReadOnlySession(),
      "PUT",
      `/v1/contacts/${seeded.id}/topics`,
      { topicIds: [] }
    );

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: PERMISSION_DENIED });
    expect(await readSubscriptions(seeded.id)).toEqual(before);
    expect(before).toHaveLength(1);
  });

  it("refuses a key without contacts:write and keeps existing subscriptions", async () => {
    const seeded = await seedContact("topics-key-ro");
    const topicId = await seedTopic("topics-key-ro");
    await db.insert(contactTopic).values({
      contactId: seeded.id,
      topicId,
      status: "subscribed",
      subscribedAt: new Date(),
      confirmedAt: new Date(),
    });
    const before = await readSubscriptions(seeded.id);

    const res = await call(
      asReadOnlyKey(),
      "PUT",
      `/v1/contacts/${seeded.id}/topics`,
      { topicIds: [] }
    );

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: PERMISSION_DENIED });
    expect(await readSubscriptions(seeded.id)).toEqual(before);
    expect(workflowEvents.emitTopicUnsubscribed).not.toHaveBeenCalled();
  });

  it("lets an owner session replace topic subscriptions", async () => {
    const seeded = await seedContact("topics-owner");
    const topicId = await seedTopic("topics-owner");

    const res = await call(
      asOwnerSession(),
      "PUT",
      `/v1/contacts/${seeded.id}/topics`,
      { topicIds: [topicId] }
    );

    expect(res.status).toBe(200);
    expect(await readSubscriptions(seeded.id)).toHaveLength(1);
  });

  it("lets a full-access key replace topic subscriptions", async () => {
    const seeded = await seedContact("topics-key");
    const topicId = await seedTopic("topics-key");

    const res = await call(
      asFullKey(),
      "PUT",
      `/v1/contacts/${seeded.id}/topics`,
      { topicIds: [topicId] }
    );

    expect(res.status).toBe(200);
    expect(await readSubscriptions(seeded.id)).toHaveLength(1);
  });
});
