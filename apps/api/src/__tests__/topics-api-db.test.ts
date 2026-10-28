/**
 * GET/POST/PATCH/DELETE /v1/topics and GET /v1/topics/:id/subscribers on the
 * real route stack — real DB, real plan-gate and real permission gate.
 *
 * File suffix `-db.test.ts` = real Neon test branch (no `@wraps/db` mocks).
 * `WRAPS_LICENSE_KEY` is stubbed empty so `isSelfHosted()` cannot turn the
 * plan gate into a no-op.
 */

import { swagger } from "@elysiajs/swagger";
import {
  auditLog,
  contact,
  contactTopic,
  db,
  eq,
  member,
  topic,
  user,
} from "@wraps/db";
import { inArray } from "drizzle-orm";
import { Elysia } from "elysia";
import {
  afterAll,
  afterEach,
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
import { createErrorHarness } from "./error-handler-harness";

const { topicsRoutes } = await import("../routes/topics");

// PREFIX doubles as a route param (`id: t.String({ maxLength: 36 })`), so it
// must stay short. 8 + 8 chars.
const PREFIX = `t2x-t21-${crypto.randomUUID().slice(0, 8)}`;

const READ_ONLY_USER = `${PREFIX}-ro-user`;
const READ_ONLY_MEMBER = `${PREFIX}-ro-member`;
const READ_ONLY_EMAIL = `${PREFIX}-ro@example.com`;

const CONTACT_IDS = [
  `${PREFIX}-c1`,
  `${PREFIX}-c2`,
  `${PREFIX}-c3`,
  `${PREFIX}-b1`,
];

let ids: Awaited<ReturnType<typeof seedBaseOrg>>["ids"];

function appFor(
  organizationId: string,
  userId: string,
  planId: string | null = "pro"
) {
  const { app } = createErrorHarness();
  return app
    .derive(() => ({
      auth: { apiKeyId: null, organizationId, userId, planId },
    }))
    .use(topicsRoutes);
}

function unauthedApp() {
  const { app } = createErrorHarness();
  return app.use(topicsRoutes);
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

/** The org A app, acting as the org owner (seeded membership). */
const asOwner = () => appFor(ids.org, ids.user);
/** The org A app, acting as the read-only member inserted in beforeAll. */
const asReadOnly = () => appFor(ids.org, READ_ONLY_USER);

async function insertTopic(
  organizationId: string,
  overrides: Partial<typeof topic.$inferInsert> & { id: string; slug: string }
) {
  await db.insert(topic).values({
    organizationId,
    name: overrides.name ?? `Topic ${overrides.slug}`,
    createdBy: ids.user,
    ...overrides,
  });
  return overrides.id;
}

async function readTopic(id: string) {
  const [row] = await db.select().from(topic).where(eq(topic.id, id));
  return row ?? null;
}

async function insertContact(
  id: string,
  organizationId: string,
  emailStatus: typeof contact.$inferInsert.emailStatus = "active"
) {
  await db.insert(contact).values({
    id,
    organizationId,
    email: `${id}@example.com`,
    emailHash: `${id}-hash`,
    emailStatus,
    properties: {},
  });
}

async function subscribe(
  contactId: string,
  topicId: string,
  status: "subscribed" | "pending" | "unsubscribed",
  subscribedAt?: Date
) {
  await db.insert(contactTopic).values({
    contactId,
    topicId,
    status,
    subscribedAt: subscribedAt ?? new Date(),
  });
}

const PAGING_IDS = [1, 2, 3, 4, 5, 6, 7].map((n) => `${PREFIX}-s${n}`);

async function clearTopicState() {
  const orgs = [ids.org, ids.otherOrg];
  await db.delete(auditLog).where(inArray(auditLog.organizationId, orgs));
  // contact_topic cascades from topic.
  await db.delete(topic).where(inArray(topic.organizationId, orgs));
  await db
    .delete(contact)
    .where(inArray(contact.id, [...CONTACT_IDS, ...PAGING_IDS]));
}

beforeAll(async () => {
  const fixture = await seedBaseOrg(PREFIX);
  ids = fixture.ids;

  await db
    .insert(user)
    .values({
      id: READ_ONLY_USER,
      email: READ_ONLY_EMAIL,
      name: "Read Only Topic Tester",
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

beforeEach(async () => {
  await clearTopicState();
  // isSelfHosted() reads this at call time; empty forces the real plan check.
  vi.stubEnv("WRAPS_LICENSE_KEY", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(async () => {
  await clearTopicState();
  await db.delete(member).where(eq(member.id, READ_ONLY_MEMBER));
  await db.delete(user).where(eq(user.id, READ_ONLY_USER));
  await cleanupBaseOrg(PREFIX);
});

describe("auth and plan gate", () => {
  it("returns 401 with no auth header", async () => {
    const res = await call(unauthedApp(), "GET", "/v1/topics");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Not authenticated");
  });

  it("returns 403 naming the topics feature on a Free plan", async () => {
    const res = await call(
      appFor(ids.org, ids.user, "free"),
      "GET",
      "/v1/topics"
    );
    expect(res.status).toBe(403);
    expect(res.body.error).toContain("Feature 'topics' requires pro plan");
  });
});

describe("CRUD", () => {
  it("creates a topic with a generated slug and writes a topic.created audit row", async () => {
    const res = await call(asOwner(), "POST", "/v1/topics", {
      name: "Product Updates!",
      description: "  Release notes  ",
    });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Product Updates!");
    expect(res.body.slug).toBe("product-updates");
    expect(res.body.description).toBe("Release notes");
    expect(res.body.public).toBe(true);
    expect(res.body.doubleOptIn).toBe(false);
    expect(res.body.subscriberCount).toBe(0);
    expect(res.body.createdBy.id).toBe(ids.user);

    const row = await readTopic(res.body.id);
    expect(row?.organizationId).toBe(ids.org);

    const [audit] = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.resourceId, res.body.id));
    expect(audit?.action).toBe("topic.created");
    expect(audit?.organizationId).toBe(ids.org);
    expect(audit?.userId).toBe(ids.user);
  });

  it("lists topics with pinned subscriber, sendable and pending counts", async () => {
    const topicId = await insertTopic(ids.org, {
      id: `${PREFIX}-t-list`,
      slug: "list-me",
    });
    await insertContact(CONTACT_IDS[0], ids.org, "active");
    await insertContact(CONTACT_IDS[1], ids.org, "active");
    await insertContact(CONTACT_IDS[2], ids.org, "active");
    await subscribe(CONTACT_IDS[0], topicId, "subscribed");
    await subscribe(CONTACT_IDS[1], topicId, "subscribed");
    await subscribe(CONTACT_IDS[2], topicId, "pending");

    const res = await call(asOwner(), "GET", "/v1/topics");
    expect(res.status).toBe(200);
    const listed = res.body.topics.find(
      (t: { id: string }) => t.id === topicId
    );
    expect(listed.subscriberCount).toBe(2);
    expect(listed.sendableCount).toBe(2);
    expect(listed.pendingCount).toBe(1);
  });

  it("gets one topic by id", async () => {
    const topicId = await insertTopic(ids.org, {
      id: `${PREFIX}-t-get`,
      slug: "get-me",
    });
    const res = await call(asOwner(), "GET", `/v1/topics/${topicId}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(topicId);
    expect(res.body.slug).toBe("get-me");
  });

  it("returns 404 with the not-found text for an unknown id", async () => {
    const res = await call(asOwner(), "GET", `/v1/topics/${PREFIX}-missing`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Topic not found");
  });

  it("PATCH changes only the fields sent and clears description with null", async () => {
    const topicId = await insertTopic(ids.org, {
      id: `${PREFIX}-t-patch`,
      slug: "patch-me",
      description: "old",
      public: true,
    });

    const res = await call(asOwner(), "PATCH", `/v1/topics/${topicId}`, {
      public: false,
      description: null,
    });
    expect(res.status).toBe(200);
    expect(res.body.public).toBe(false);
    expect(res.body.description).toBeNull();
    expect(res.body.name).toBe("Topic patch-me");
    expect(res.body.slug).toBe("patch-me");

    const row = await readTopic(topicId);
    expect(row?.public).toBe(false);
    expect(row?.description).toBeNull();
  });

  it("creates a second topic with a duplicate slug in the same org as 409", async () => {
    await insertTopic(ids.org, { id: `${PREFIX}-t-dup`, slug: "dup-slug" });
    const res = await call(asOwner(), "POST", "/v1/topics", {
      name: "Other",
      slug: "dup-slug",
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("A topic with this slug already exists");
  });

  it("rejects a whitespace-only name on create with 400 naming the field", async () => {
    const res = await call(asOwner(), "POST", "/v1/topics", {
      name: "   ",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Topic name is required");
  });

  it("rejects a whitespace-only name on PATCH with 400 and leaves the row alone", async () => {
    const topicId = await insertTopic(ids.org, {
      id: `${PREFIX}-t-badname`,
      slug: "bad-name",
      name: "Keep Me",
    });
    const res = await call(asOwner(), "PATCH", `/v1/topics/${topicId}`, {
      name: "   ",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Topic name is required");
    expect((await readTopic(topicId))?.name).toBe("Keep Me");
  });

  it("DELETE without confirm=true returns 400 and leaves the topic in place", async () => {
    const topicId = await insertTopic(ids.org, {
      id: `${PREFIX}-t-noconfirm`,
      slug: "no-confirm",
    });
    const res = await call(asOwner(), "DELETE", `/v1/topics/${topicId}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain(
      "Confirmation required: pass confirm=true"
    );

    expect(await readTopic(topicId)).not.toBeNull();
  });

  it("DELETE with confirm=false is also refused and leaves the topic in place", async () => {
    const topicId = await insertTopic(ids.org, {
      id: `${PREFIX}-t-confirmfalse`,
      slug: "confirm-false",
    });
    const res = await call(
      asOwner(),
      "DELETE",
      `/v1/topics/${topicId}?confirm=false`
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toContain(
      "Confirmation required: pass confirm=true"
    );
    expect(await readTopic(topicId)).not.toBeNull();
  });

  it("DELETE with confirm=true removes the topic and its subscriptions", async () => {
    const topicId = await insertTopic(ids.org, {
      id: `${PREFIX}-t-del`,
      slug: "delete-me",
    });
    await insertContact(CONTACT_IDS[0], ids.org, "active");
    await subscribe(CONTACT_IDS[0], topicId, "subscribed");

    const res = await call(
      asOwner(),
      "DELETE",
      `/v1/topics/${topicId}?confirm=true`
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(await readTopic(topicId)).toBeNull();

    const remaining = await db
      .select()
      .from(contactTopic)
      .where(eq(contactTopic.topicId, topicId));
    expect(remaining).toHaveLength(0);
  });
});

describe("subscribers", () => {
  it("pages subscribers and pins total, page and pageSize", async () => {
    const topicId = await insertTopic(ids.org, {
      id: `${PREFIX}-t-subs`,
      slug: "subs",
    });
    await insertContact(CONTACT_IDS[0], ids.org, "active");
    await insertContact(CONTACT_IDS[1], ids.org, "active");
    await insertContact(CONTACT_IDS[2], ids.org, "active");
    await subscribe(CONTACT_IDS[0], topicId, "subscribed");
    await subscribe(CONTACT_IDS[1], topicId, "subscribed");
    await subscribe(CONTACT_IDS[2], topicId, "pending");

    const page1 = await call(
      asOwner(),
      "GET",
      `/v1/topics/${topicId}/subscribers?page=1&pageSize=2`
    );
    expect(page1.status).toBe(200);
    expect(page1.body.total).toBe(3);
    expect(page1.body.page).toBe(1);
    expect(page1.body.pageSize).toBe(2);
    expect(page1.body.subscribers).toHaveLength(2);

    const page2 = await call(
      asOwner(),
      "GET",
      `/v1/topics/${topicId}/subscribers?page=2&pageSize=2`
    );
    expect(page2.body.subscribers).toHaveLength(1);
  });

  it("walking every page returns each subscriber exactly once, in a pinned order, when timestamps tie", async () => {
    const topicId = await insertTopic(ids.org, {
      id: `${PREFIX}-t-walk`,
      slug: "walk",
    });
    // Identical subscribedAt on every row: only the id tie-break orders them.
    const sameInstant = new Date("2026-01-01T00:00:00.000Z");
    for (const id of PAGING_IDS) {
      await insertContact(id, ids.org, "active");
      await subscribe(id, topicId, "subscribed", sameInstant);
    }

    const seen: string[] = [];
    for (let page = 1; page <= 4; page++) {
      const res = await call(
        asOwner(),
        "GET",
        `/v1/topics/${topicId}/subscribers?page=${page}&pageSize=2`
      );
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(7);
      seen.push(
        ...res.body.subscribers.map((s: { contactId: string }) => s.contactId)
      );
    }

    // 7 rows, pageSize 2: pages of 2, 2, 2, 1, then nothing on page 5.
    expect(seen).toEqual([
      `${PREFIX}-s1`,
      `${PREFIX}-s2`,
      `${PREFIX}-s3`,
      `${PREFIX}-s4`,
      `${PREFIX}-s5`,
      `${PREFIX}-s6`,
      `${PREFIX}-s7`,
    ]);
    expect(new Set(seen).size).toBe(7);

    const past = await call(
      asOwner(),
      "GET",
      `/v1/topics/${topicId}/subscribers?page=5&pageSize=2`
    );
    expect(past.body.subscribers).toHaveLength(0);
  });

  it("filters by status=pending", async () => {
    const topicId = await insertTopic(ids.org, {
      id: `${PREFIX}-t-pend`,
      slug: "pend",
    });
    await insertContact(CONTACT_IDS[0], ids.org, "active");
    await insertContact(CONTACT_IDS[1], ids.org, "active");
    await subscribe(CONTACT_IDS[0], topicId, "subscribed");
    await subscribe(CONTACT_IDS[1], topicId, "pending");

    const res = await call(
      asOwner(),
      "GET",
      `/v1/topics/${topicId}/subscribers?status=pending`
    );
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.subscribers[0].contactId).toBe(CONTACT_IDS[1]);
    expect(res.body.subscribers[0].status).toBe("pending");
    expect(res.body.subscribers[0].email).toBe(`${CONTACT_IDS[1]}@example.com`);
  });
});

describe("org isolation", () => {
  it("list shows only org A's topics, never org B's", async () => {
    const aTopic = await insertTopic(ids.org, {
      id: `${PREFIX}-t-a`,
      slug: "org-a-topic",
    });
    const bTopic = await insertTopic(ids.otherOrg, {
      id: `${PREFIX}-t-b`,
      slug: "org-b-topic",
    });

    const res = await call(asOwner(), "GET", "/v1/topics");
    expect(res.status).toBe(200);
    const listedIds = res.body.topics.map((t: { id: string }) => t.id);
    expect(listedIds).toContain(aTopic);
    expect(listedIds).not.toContain(bTopic);
  });

  it("get-by-id of an org B topic is 404", async () => {
    const bTopic = await insertTopic(ids.otherOrg, {
      id: `${PREFIX}-t-b-get`,
      slug: "b-get",
    });
    const res = await call(asOwner(), "GET", `/v1/topics/${bTopic}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Topic not found");
  });

  it("subscribers of an org B topic are 404 and do not leak", async () => {
    const bTopic = await insertTopic(ids.otherOrg, {
      id: `${PREFIX}-t-b-subs`,
      slug: "b-subs",
    });
    await insertContact(CONTACT_IDS[3], ids.otherOrg, "active");
    await subscribe(CONTACT_IDS[3], bTopic, "subscribed");

    const res = await call(
      asOwner(),
      "GET",
      `/v1/topics/${bTopic}/subscribers`
    );
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Topic not found");
    expect(res.body.subscribers).toBeUndefined();
  });

  it("PATCH of an org B topic is 404 and the B row is unchanged", async () => {
    const bTopic = await insertTopic(ids.otherOrg, {
      id: `${PREFIX}-t-b-patch`,
      slug: "b-patch",
      name: "B Original",
      public: true,
    });
    const before = await readTopic(bTopic);

    const res = await call(asOwner(), "PATCH", `/v1/topics/${bTopic}`, {
      name: "Hijacked",
      public: false,
    });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Topic not found");

    const after = await readTopic(bTopic);
    expect(after?.name).toBe("B Original");
    expect(after?.public).toBe(true);
    expect(after?.updatedAt.getTime()).toBe(before?.updatedAt.getTime());
  });

  it("DELETE of an org B topic with confirm=true is 404 and the B row survives", async () => {
    const bTopic = await insertTopic(ids.otherOrg, {
      id: `${PREFIX}-t-b-del`,
      slug: "b-del",
    });

    const res = await call(
      asOwner(),
      "DELETE",
      `/v1/topics/${bTopic}?confirm=true`
    );
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Topic not found");

    const after = await readTopic(bTopic);
    expect(after?.name).toBe(`Topic b-del`);
    expect(after?.organizationId).toBe(ids.otherOrg);
  });

  it("creating a slug that exists only in org B succeeds in org A", async () => {
    await insertTopic(ids.otherOrg, {
      id: `${PREFIX}-t-b-slug`,
      slug: "shared-slug",
    });
    const res = await call(asOwner(), "POST", "/v1/topics", {
      name: "Shared Slug",
      slug: "shared-slug",
    });
    expect(res.status).toBe(201);
    expect(res.body.slug).toBe("shared-slug");
  });
});

describe("permissions", () => {
  it("a read-only member can read the list, one topic and its subscribers", async () => {
    const topicId = await insertTopic(ids.org, {
      id: `${PREFIX}-t-ro-read`,
      slug: "ro-read",
    });

    expect((await call(asReadOnly(), "GET", "/v1/topics")).status).toBe(200);
    expect(
      (await call(asReadOnly(), "GET", `/v1/topics/${topicId}`)).status
    ).toBe(200);
    expect(
      (await call(asReadOnly(), "GET", `/v1/topics/${topicId}/subscribers`))
        .status
    ).toBe(200);
  });

  it("a read-only member's POST is 403 and creates nothing", async () => {
    const before = await db
      .select({ id: topic.id })
      .from(topic)
      .where(eq(topic.organizationId, ids.org));

    const res = await call(asReadOnly(), "POST", "/v1/topics", {
      name: "Sneaky",
    });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe(
      "You don't have permission to perform this action"
    );

    const after = await db
      .select({ id: topic.id })
      .from(topic)
      .where(eq(topic.organizationId, ids.org));
    expect(after).toHaveLength(before.length);
  });

  it("a read-only member's PATCH is 403 and the row is unchanged", async () => {
    const topicId = await insertTopic(ids.org, {
      id: `${PREFIX}-t-ro-patch`,
      slug: "ro-patch",
      name: "Stable Name",
    });

    const res = await call(asReadOnly(), "PATCH", `/v1/topics/${topicId}`, {
      name: "Changed",
    });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe(
      "You don't have permission to perform this action"
    );
    expect((await readTopic(topicId))?.name).toBe("Stable Name");
  });

  it("a read-only member's DELETE is 403 even with confirm=true and the row survives", async () => {
    const topicId = await insertTopic(ids.org, {
      id: `${PREFIX}-t-ro-del`,
      slug: "ro-del",
    });

    const res = await call(
      asReadOnly(),
      "DELETE",
      `/v1/topics/${topicId}?confirm=true`
    );
    expect(res.status).toBe(403);
    expect(res.body.error).toBe(
      "You don't have permission to perform this action"
    );
    expect(await readTopic(topicId)).not.toBeNull();
  });
});

describe("openapi", () => {
  it("publishes every topics path and method in the spec", async () => {
    const app = new Elysia()
      .use(
        swagger({
          path: "/swagger",
          documentation: {},
          exclude: ["/swagger", "/swagger/json"],
        })
      )
      .use(topicsRoutes);

    const res = await app.handle(new Request("http://localhost/swagger/json"));
    expect(res.status).toBe(200);
    const spec = (await res.json()) as {
      paths: Record<string, Record<string, unknown>>;
    };

    // Elysia keys a prefix-root route with a trailing slash.
    expect(Object.keys(spec.paths["/v1/topics/"] ?? {}).sort()).toEqual([
      "get",
      "post",
    ]);
    expect(Object.keys(spec.paths["/v1/topics/{id}"] ?? {}).sort()).toEqual([
      "delete",
      "get",
      "patch",
    ]);
    expect(
      Object.keys(spec.paths["/v1/topics/{id}/subscribers"] ?? {})
    ).toEqual(["get"]);
  });
});
