/**
 * POST /v1/batch/drafts (batch-drafts.ts) on the real route stack: real DB,
 * real permission gate, real plan gate, real audit rows.
 *
 * Real DB (no `@wraps/db` mock). Rate limit and the queue are mocked: the
 * queue mock is how "a draft enqueues nothing" is proven. The plan gate is real;
 * `WRAPS_LICENSE_KEY` is stubbed empty so the ambient environment cannot bypass it.
 */

import { swagger } from "@elysiajs/swagger";
import {
  auditLog,
  batchSend,
  db,
  eq,
  member,
  segment,
  template,
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

vi.mock("../middleware/rate-limit", () => ({
  rateLimitMiddleware: new Elysia(),
}));

const mockEnqueueJob = vi.fn();
vi.mock("../services/queue", () => ({ enqueueJob: mockEnqueueJob }));

const { batchDraftRoutes } = await import("../routes/batch-drafts");
const { batchRoutes } = await import("../routes/batch");
const { batchLifecycleRoutes } = await import("../routes/batch-lifecycle");

// PREFIX is namespaced `t3-<id>-<8 chars>`: 15 characters, under the 36 limit.
const PREFIX = `t3-B2a-${crypto.randomUUID().slice(0, 8)}`;
const NO_PERMISSION = "You don't have permission to perform this action";
const MISSING_ID = "00000000-0000-4000-8000-000000000000";

let ids: Awaited<ReturnType<typeof seedBaseOrg>>["ids"];
const roUserId = `${PREFIX}-ro`;
const roMemberId = `${PREFIX}-member-ro`;

const B_TEMPLATE = `${PREFIX}-tpl-b`;
const B_SEGMENT = `${PREFIX}-seg-b`;
const B_TOPIC = `${PREFIX}-top-b`;

/** Org A's app acting as `userId`, with the real batch-drafts routes mounted. */
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
    .use(batchDraftRoutes);
}

function unauthedApp() {
  const { app } = createErrorHarness();
  return app.use(batchDraftRoutes);
}

/** The list route, mounted the way index.ts mounts it, for the isolation read. */
function listApp(organizationId: string, userId: string) {
  const { app } = createErrorHarness();
  return app
    .derive(() => ({
      auth: { apiKeyId: null, organizationId, userId, planId: "pro" },
    }))
    .use(batchRoutes);
}

type AppLike = { handle(request: Request): Response | Promise<Response> };

async function postDraft(app: AppLike, body?: unknown) {
  const res = await app.handle(
    new Request("http://localhost/v1/batch/drafts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function getList(app: AppLike) {
  const res = await app.handle(new Request("http://localhost/v1/batch"));
  return { status: res.status, body: await res.json() };
}

async function readBatch(id: string) {
  const [row] = await db
    .select()
    .from(batchSend)
    .where(eq(batchSend.id, id))
    .limit(1);
  return row;
}

async function batchIdsFor(organizationId: string): Promise<string[]> {
  const rows = await db
    .select({ id: batchSend.id })
    .from(batchSend)
    .where(eq(batchSend.organizationId, organizationId));
  return rows.map((r) => r.id);
}

async function clearState() {
  const orgs = [ids.org, ids.otherOrg];
  await db.delete(auditLog).where(inArray(auditLog.organizationId, orgs));
  await db.delete(batchSend).where(inArray(batchSend.organizationId, orgs));
  await db.delete(segment).where(inArray(segment.organizationId, orgs));
  await db.delete(topic).where(inArray(topic.organizationId, orgs));
  await db.delete(template).where(inArray(template.organizationId, orgs));
}

beforeAll(async () => {
  const fixture = await seedBaseOrg(PREFIX);
  ids = fixture.ids;
  await db.insert(user).values({
    id: roUserId,
    email: `${roUserId}@example.com`,
    name: "Read Only Member",
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    image: null,
  } as typeof user.$inferInsert);
  await db.insert(member).values({
    id: roMemberId,
    organizationId: ids.org,
    userId: roUserId,
    role: "read-only",
    createdAt: new Date(),
  });
});

beforeEach(async () => {
  await clearState();
  mockEnqueueJob.mockClear();
  vi.stubEnv("WRAPS_LICENSE_KEY", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(async () => {
  await clearState();
  await db.delete(member).where(eq(member.id, roMemberId));
  await db.delete(user).where(eq(user.id, roUserId));
  await cleanupBaseOrg(PREFIX);
});

const asOwner = () => appFor(ids.org, ids.user);
const asReadOnly = () => appFor(ids.org, roUserId);

/** A minimal valid body for org A's own awsAccount. */
function validBody(overrides: Record<string, unknown> = {}) {
  return {
    name: "Spring launch",
    subject: "Hello",
    htmlContent: "<p>Hi</p>",
    awsAccountId: ids.awsAccount,
    ...overrides,
  };
}

/** Inserts a draft row directly, for the org B side of the isolation tests. */
async function insertBDraft(name: string) {
  const [row] = await db
    .insert(batchSend)
    .values({
      organizationId: ids.otherOrg,
      status: "draft",
      channel: "email",
      name,
      audienceType: "all",
      awsAccountId: ids.otherAwsAccount,
      createdBy: ids.user,
    })
    .returning({ id: batchSend.id });
  return row.id;
}

async function seedBReferences() {
  await db.insert(template).values({
    id: B_TEMPLATE,
    organizationId: ids.otherOrg,
    name: "B template",
    content: {},
  });
  await db.insert(segment).values({
    id: B_SEGMENT,
    organizationId: ids.otherOrg,
    name: "B segment",
    condition: { logic: "AND", groups: [] },
  });
  await db.insert(topic).values({
    id: B_TOPIC,
    organizationId: ids.otherOrg,
    name: "B topic",
    slug: B_TOPIC,
    description: null,
    public: true,
    doubleOptIn: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: ids.user,
  });
}

describe("auth", () => {
  it("returns 401 with no auth header", async () => {
    const res = await postDraft(unauthedApp(), validBody());
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Not authenticated");
  });
});

describe("POST /v1/batch/drafts", () => {
  it("creates a draft with status draft, org A, the owner as creator, and enqueues nothing", async () => {
    const res = await postDraft(asOwner(), validBody());

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("draft");
    expect(res.body.name).toBe("Spring launch");
    expect(res.body.channel).toBe("email");
    expect(res.body.totalRecipients).toBe(0);

    const row = await readBatch(res.body.id);
    expect(row.status).toBe("draft");
    expect(row.organizationId).toBe(ids.org);
    expect(row.createdBy).toBe(ids.user);
    expect(row.awsAccountId).toBe(ids.awsAccount);
    expect(row.subject).toBe("Hello");
    expect(row.htmlContent).toBe("<p>Hi</p>");

    expect(mockEnqueueJob).not.toHaveBeenCalled();
  });

  it("stores the recipient filter and a template reference that belong to org A", async () => {
    const tplId = `${PREFIX}-tpl-a`;
    const segId = `${PREFIX}-seg-a`;
    await db.insert(template).values({
      id: tplId,
      organizationId: ids.org,
      name: "A template",
      content: {},
    });
    await db.insert(segment).values({
      id: segId,
      organizationId: ids.org,
      name: "A segment",
      condition: { logic: "AND", groups: [] },
    });

    const res = await postDraft(
      asOwner(),
      validBody({
        templateId: tplId,
        recipientFilter: { audienceType: "segment", segmentId: segId },
      })
    );

    expect(res.status).toBe(201);
    const row = await readBatch(res.body.id);
    expect(row.emailTemplateId).toBe(tplId);
    expect(row.audienceType).toBe("segment");
    expect(row.segmentId).toBe(segId);
    expect(mockEnqueueJob).not.toHaveBeenCalled();
  });

  it("accepts a draft with no fields at all: an empty skeleton is valid", async () => {
    const res = await postDraft(asOwner(), {});
    expect(res.status).toBe(201);
    const row = await readBatch(res.body.id);
    expect(row.status).toBe("draft");
    expect(row.awsAccountId).toBeNull();
    expect(row.audienceType).toBe("all");
    expect(mockEnqueueJob).not.toHaveBeenCalled();
  });

  it("stores a future schedule on the draft and still does not send it", async () => {
    const when = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    const res = await postDraft(asOwner(), validBody({ scheduledFor: when }));

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("draft");
    const row = await readBatch(res.body.id);
    expect(row.status).toBe("draft");
    expect(row.scheduledFor?.toISOString()).toBe(when);
    expect(mockEnqueueJob).not.toHaveBeenCalled();
  });

  it("returns 400 naming scheduledFor for an unparseable date and creates nothing", async () => {
    const before = await batchIdsFor(ids.org);
    const res = await postDraft(
      asOwner(),
      validBody({ scheduledFor: "next tuesday" })
    );

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("scheduledFor is not a valid date");
    expect(await batchIdsFor(ids.org)).toEqual(before);
    expect(mockEnqueueJob).not.toHaveBeenCalled();
  });

  it("returns 400 for a schedule in the past and does not turn it into a send", async () => {
    const before = await batchIdsFor(ids.org);
    const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const res = await postDraft(asOwner(), validBody({ scheduledFor: past }));

    expect(res.status).toBe(400);
    expect(res.body.error).toBe(
      "The scheduled time is in the past. Pick a future time, or leave scheduledFor out and send the draft now."
    );
    expect(await batchIdsFor(ids.org)).toEqual(before);
    expect(mockEnqueueJob).not.toHaveBeenCalled();
  });

  it("returns 422 'Validation failed' for a name over 255 characters and creates nothing", async () => {
    const before = await batchIdsFor(ids.org);
    const res = await postDraft(
      asOwner(),
      validBody({ name: "x".repeat(256) })
    );

    expect(res.status).toBe(422);
    expect(res.body.error).toBe("Validation failed");
    expect(res.body.code).toBe("VALIDATION_FAILED");
    expect(await batchIdsFor(ids.org)).toEqual(before);
  });

  it("returns 404 'AWS account not found' for an unknown awsAccountId and creates nothing", async () => {
    const before = await batchIdsFor(ids.org);
    const res = await postDraft(
      asOwner(),
      validBody({ awsAccountId: MISSING_ID })
    );

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("AWS account not found");
    expect(await batchIdsFor(ids.org)).toEqual(before);
  });
});

describe("plan gate", () => {
  it("returns 403 naming the plan for a topic audience on the free plan, and creates nothing", async () => {
    const before = await batchIdsFor(ids.org);
    const res = await postDraft(
      appFor(ids.org, ids.user, "free"),
      validBody({
        recipientFilter: { audienceType: "topic", topicId: B_TOPIC },
      })
    );

    expect(res.status).toBe(403);
    expect(res.body.error).toBe(
      "Sending a broadcast to a topic requires the pro plan or higher. Upgrade at https://wraps.dev/upgrade"
    );
    expect(await batchIdsFor(ids.org)).toEqual(before);
    expect(mockEnqueueJob).not.toHaveBeenCalled();
  });

  it("returns 403 naming scheduling for a future schedule on the free plan, and creates nothing", async () => {
    const before = await batchIdsFor(ids.org);
    const when = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const res = await postDraft(
      appFor(ids.org, ids.user, "free"),
      validBody({ scheduledFor: when })
    );

    expect(res.status).toBe(403);
    expect(res.body.error).toBe(
      "Scheduling a broadcast requires the pro plan or higher. Upgrade at https://wraps.dev/upgrade"
    );
    expect(await batchIdsFor(ids.org)).toEqual(before);
  });

  it("allows a plain all-contacts draft on the free plan", async () => {
    const res = await postDraft(appFor(ids.org, ids.user, "free"), validBody());
    expect(res.status).toBe(201);
  });
});

describe("org isolation", () => {
  it("org A cannot reference org B's template: 404 'Template not found', no row in either org", async () => {
    await seedBReferences();
    const aBefore = await batchIdsFor(ids.org);
    const bBefore = await batchIdsFor(ids.otherOrg);

    const res = await postDraft(
      asOwner(),
      validBody({ templateId: B_TEMPLATE })
    );

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Template not found");
    expect(await batchIdsFor(ids.org)).toEqual(aBefore);
    expect(await batchIdsFor(ids.otherOrg)).toEqual(bBefore);
    expect(mockEnqueueJob).not.toHaveBeenCalled();
  });

  it("org A cannot reference org B's segment: 404 'Segment not found', no row in either org", async () => {
    await seedBReferences();
    const aBefore = await batchIdsFor(ids.org);
    const bBefore = await batchIdsFor(ids.otherOrg);

    const res = await postDraft(
      asOwner(),
      validBody({
        recipientFilter: { audienceType: "segment", segmentId: B_SEGMENT },
      })
    );

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Segment not found");
    expect(await batchIdsFor(ids.org)).toEqual(aBefore);
    expect(await batchIdsFor(ids.otherOrg)).toEqual(bBefore);
    expect(mockEnqueueJob).not.toHaveBeenCalled();
  });

  it("org A cannot reference org B's topic: 404 'Topic not found', no row in either org", async () => {
    await seedBReferences();
    const aBefore = await batchIdsFor(ids.org);
    const bBefore = await batchIdsFor(ids.otherOrg);

    const res = await postDraft(
      asOwner(),
      validBody({
        recipientFilter: { audienceType: "topic", topicId: B_TOPIC },
      })
    );

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Topic not found");
    expect(await batchIdsFor(ids.org)).toEqual(aBefore);
    expect(await batchIdsFor(ids.otherOrg)).toEqual(bBefore);
    expect(mockEnqueueJob).not.toHaveBeenCalled();
  });

  it("org A cannot use org B's AWS account: 404 'AWS account not found', no row in either org", async () => {
    const aBefore = await batchIdsFor(ids.org);
    const bBefore = await batchIdsFor(ids.otherOrg);

    const res = await postDraft(
      asOwner(),
      validBody({ awsAccountId: ids.otherAwsAccount })
    );

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("AWS account not found");
    expect(await batchIdsFor(ids.org)).toEqual(aBefore);
    expect(await batchIdsFor(ids.otherOrg)).toEqual(bBefore);
    expect(mockEnqueueJob).not.toHaveBeenCalled();
  });

  it("a draft org A creates is stored under org A and is never under org B", async () => {
    const res = await postDraft(asOwner(), validBody());
    expect(res.status).toBe(201);

    const row = await readBatch(res.body.id);
    expect(row.organizationId).toBe(ids.org);
    expect(await batchIdsFor(ids.otherOrg)).not.toContain(res.body.id);
  });

  it("org B's draft never appears in org A's GET /v1/batch list", async () => {
    const bDraft = await insertBDraft("B secret draft");
    const aDraft = await postDraft(asOwner(), validBody({ name: "A draft" }));
    expect(aDraft.status).toBe(201);

    const list = await getList(listApp(ids.org, ids.user));
    expect(list.status).toBe(200);
    const listedIds = list.body.data.map((b: { id: string }) => b.id);
    expect(listedIds).toContain(aDraft.body.id);
    expect(listedIds).not.toContain(bDraft);
    expect(list.body.total).toBe(1);

    // B's row is untouched by the read and by org A's create.
    const b = await readBatch(bDraft);
    expect(b.organizationId).toBe(ids.otherOrg);
    expect(b.name).toBe("B secret draft");
  });
});

describe("permissions", () => {
  it("a read-only member's POST is 403 and creates no row", async () => {
    const before = await batchIdsFor(ids.org);
    const res = await postDraft(asReadOnly(), validBody());

    expect(res.status).toBe(403);
    expect(res.body.error).toBe(NO_PERMISSION);
    expect(await batchIdsFor(ids.org)).toEqual(before);
    expect(mockEnqueueJob).not.toHaveBeenCalled();
  });
});

describe("queue mock is wired", () => {
  it("POSITIVE CONTROL: POST /v1/batch enqueues exactly one job through the same mock", async () => {
    // Proves the zero-call assertions above mean something: the mock is the
    // queue the send route really calls. A send is enqueued; a draft is not.
    const { app } = createErrorHarness();
    const sender = app
      .derive(() => ({
        auth: {
          apiKeyId: null,
          organizationId: ids.org,
          userId: ids.user,
          planId: "pro",
        },
      }))
      .use(batchRoutes);

    const res = await sender.handle(
      new Request("http://localhost/v1/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: "email",
          name: "Control send",
          subject: "Hello",
          htmlContent: "<p>Hi</p>",
          audienceType: "all",
          awsAccountId: ids.awsAccount,
          totalRecipients: 0,
        }),
      })
    );

    expect(res.status).toBe(200);
    expect(mockEnqueueJob).toHaveBeenCalledTimes(1);
  });
});

describe("static route precedence", () => {
  it("POST /v1/batch/drafts creates a draft when the batch and lifecycle routes are mounted after it", async () => {
    // The order index.ts uses: batchDraftRoutes before batchRoutes and
    // batchLifecycleRoutes, so no /:id route can capture the static path.
    const { app } = createErrorHarness();
    const mounted = app
      .derive(() => ({
        auth: {
          apiKeyId: null,
          organizationId: ids.org,
          userId: ids.user,
          planId: "pro",
        },
      }))
      .use(batchDraftRoutes)
      .use(batchRoutes)
      .use(batchLifecycleRoutes);

    const res = await postDraft(mounted, validBody({ name: "Static wins" }));

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Static wins");
    expect(res.body.status).toBe("draft");
    const row = await readBatch(res.body.id);
    expect(row.organizationId).toBe(ids.org);
    expect(row.status).toBe("draft");
    expect(mockEnqueueJob).not.toHaveBeenCalled();
  });
});

describe("audit log", () => {
  it("a successful create writes exactly one broadcast.draft_saved row for org A", async () => {
    const res = await postDraft(asOwner(), validBody());
    expect(res.status).toBe(201);

    const rows = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.resourceId, res.body.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe("broadcast.draft_saved");
    expect(rows[0].organizationId).toBe(ids.org);
    expect(rows[0].userId).toBe(ids.user);
    expect(rows[0].resource).toBe("broadcast");
  });

  it("a rejected create writes no audit row", async () => {
    const res = await postDraft(
      asOwner(),
      validBody({ awsAccountId: ids.otherAwsAccount })
    );
    expect(res.status).toBe(404);
    const rows = await db
      .select()
      .from(auditLog)
      .where(inArray(auditLog.organizationId, [ids.org, ids.otherOrg]));
    expect(rows).toHaveLength(0);
  });
});

describe("OpenAPI", () => {
  it("publishes POST /v1/batch/drafts with the no-send description", async () => {
    const app = new Elysia()
      .use(
        swagger({
          path: "/swagger",
          documentation: {},
          exclude: ["/swagger", "/swagger/json"],
        })
      )
      .use(batchDraftRoutes);

    const res = await app.handle(new Request("http://localhost/swagger/json"));
    expect(res.status).toBe(200);
    const spec = (await res.json()) as {
      paths: Record<string, Record<string, { description?: string }>>;
    };

    const op = spec.paths["/v1/batch/drafts"]?.post;
    expect(op).toBeDefined();
    expect(op?.description).toContain("Creates a draft; nothing is sent.");
  });
});
