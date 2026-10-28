/**
 * POST /v1/batch/:id/duplicate and PATCH /v1/batch/:id (batch-lifecycle.ts),
 * plus org isolation for the existing DELETE /v1/batch/:id (cancel), which the
 * CLI `broadcasts cancel` relies on.
 *
 * Real DB (no `@wraps/db` mock). Rate limit is mocked, as in segments-api-db.
 * The plan gate is real; `WRAPS_LICENSE_KEY` is stubbed empty so it cannot be
 * bypassed by the ambient environment.
 */

import { swagger } from "@elysiajs/swagger";
import { auditLog, batchSend, db, eq, member, segment, user } from "@wraps/db";
import { and, inArray } from "drizzle-orm";
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

const { batchLifecycleRoutes } = await import("../routes/batch-lifecycle");
const { batchRoutes } = await import("../routes/batch");

// PREFIX is namespaced `t2x-<id>-<8 chars>`; 17 characters, under the 36 limit.
const PREFIX = `t2x-t25a-${crypto.randomUUID().slice(0, 8)}`;
const MISSING_ID = "00000000-0000-4000-8000-000000000000";

let ids: Awaited<ReturnType<typeof seedBaseOrg>>["ids"];
const roUserId = `${PREFIX}-ro`;
const roMemberId = `${PREFIX}-member-ro`;

function appFor(
  routes: typeof batchLifecycleRoutes | typeof batchRoutes,
  organizationId: string,
  userId: string,
  planId: string | null = "free"
) {
  const { app } = createErrorHarness();
  return app
    .derive(() => ({
      auth: { apiKeyId: null, organizationId, userId, planId },
    }))
    .use(routes);
}

function unauthedApp() {
  const { app } = createErrorHarness();
  return app.use(batchLifecycleRoutes);
}

type BatchOverrides = Partial<typeof batchSend.$inferInsert>;

async function insertBatch(
  organizationId: string,
  overrides: BatchOverrides = {}
): Promise<string> {
  const [row] = await db
    .insert(batchSend)
    .values({
      organizationId,
      status: "draft",
      channel: "email",
      name: `${PREFIX} batch`,
      subject: "Subject line",
      htmlContent: "<p>Hello</p>",
      audienceType: "all",
      awsAccountId:
        organizationId === ids.org ? ids.awsAccount : ids.otherAwsAccount,
      createdBy: ids.user,
      ...overrides,
    })
    .returning({ id: batchSend.id });
  return row.id;
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

async function clearBatches() {
  await db
    .delete(auditLog)
    .where(inArray(auditLog.organizationId, [ids.org, ids.otherOrg]));
  await db
    .delete(batchSend)
    .where(inArray(batchSend.organizationId, [ids.org, ids.otherOrg]));
  await db
    .delete(segment)
    .where(inArray(segment.organizationId, [ids.org, ids.otherOrg]));
}

/** Anything that serves a request: the Elysia apps built by appFor/unauthedApp. */
type AppLike = { handle(request: Request): Response | Promise<Response> };

async function postJson(app: AppLike, path: string, body?: unknown) {
  return app.handle(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );
}

async function patchJson(app: AppLike, path: string, body: unknown) {
  return app.handle(
    new Request(`http://localhost${path}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

async function deleteReq(app: AppLike, path: string) {
  return app.handle(
    new Request(`http://localhost${path}`, { method: "DELETE" })
  );
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
  await clearBatches();
  vi.stubEnv("WRAPS_LICENSE_KEY", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(async () => {
  await clearBatches();
  await db.delete(member).where(eq(member.id, roMemberId));
  await db.delete(user).where(eq(user.id, roUserId));
  await cleanupBaseOrg(PREFIX);
});

describe("auth — 401 with no auth header", () => {
  it("POST /:id/duplicate returns 401", async () => {
    const res = await postJson(
      unauthedApp(),
      `/v1/batch/${MISSING_ID}/duplicate`
    );
    expect(res.status).toBe(401);
  });

  it("PATCH /:id returns 401", async () => {
    const res = await patchJson(unauthedApp(), `/v1/batch/${MISSING_ID}`, {
      name: "x",
    });
    expect(res.status).toBe(401);
  });
});

describe("POST /v1/batch/:id/duplicate", () => {
  it("copies a queued broadcast into a new draft in the same org", async () => {
    const sourceId = await insertBatch(ids.org, {
      status: "queued",
      name: "Spring",
      subject: "Spring sale",
      htmlContent: "<p>Spring</p>",
      audienceType: "all",
      scheduledFor: null,
    });

    const res = await postJson(
      appFor(batchLifecycleRoutes, ids.org, ids.user),
      `/v1/batch/${sourceId}/duplicate`
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      id: string;
      status: string;
      name: string;
    };
    expect(body.id).not.toBe(sourceId);
    expect(body.status).toBe("draft");
    expect(body.name).toBe("Spring (copy)");

    const copy = await readBatch(body.id);
    expect(copy.organizationId).toBe(ids.org);
    expect(copy.status).toBe("draft");
    expect(copy.subject).toBe("Spring sale");
    expect(copy.htmlContent).toBe("<p>Spring</p>");
    expect(copy.createdBy).toBe(ids.user);

    // The source is untouched.
    const source = await readBatch(sourceId);
    expect(source.status).toBe("queued");
    expect(source.name).toBe("Spring");
  });

  it("returns 404 with 'Broadcast not found' for an unknown id", async () => {
    const res = await postJson(
      appFor(batchLifecycleRoutes, ids.org, ids.user),
      `/v1/batch/${MISSING_ID}/duplicate`
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Broadcast not found" });
  });
});

describe("PATCH /v1/batch/:id", () => {
  it("updates a draft and clears a field sent as null", async () => {
    const draftId = await insertBatch(ids.org, {
      name: "Old name",
      subject: "Old subject",
    });

    const res = await patchJson(
      appFor(batchLifecycleRoutes, ids.org, ids.user),
      `/v1/batch/${draftId}`,
      { name: "New name", subject: null }
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      id: string;
      status: string;
      name: string;
      subject: string | null;
    };
    expect(body.id).toBe(draftId);
    expect(body.status).toBe("draft");
    expect(body.name).toBe("New name");
    expect(body.subject).toBeNull();

    const row = await readBatch(draftId);
    expect(row.name).toBe("New name");
    expect(row.subject).toBeNull();
    // Fields not in the body are left alone.
    expect(row.htmlContent).toBe("<p>Hello</p>");
  });

  it("returns 409 naming the status when the broadcast is not a draft", async () => {
    const queuedId = await insertBatch(ids.org, {
      status: "queued",
      name: "Already queued",
    });

    const res = await patchJson(
      appFor(batchLifecycleRoutes, ids.org, ids.user),
      `/v1/batch/${queuedId}`,
      { name: "Should not apply" }
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "Cannot edit: broadcast is already queued",
    });
    const row = await readBatch(queuedId);
    expect(row.name).toBe("Already queued");
  });

  it("returns 400 naming the field for an unparseable scheduledFor", async () => {
    const draftId = await insertBatch(ids.org, { name: "Keep me" });

    const res = await patchJson(
      appFor(batchLifecycleRoutes, ids.org, ids.user, "pro"),
      `/v1/batch/${draftId}`,
      { scheduledFor: "not-a-date" }
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "scheduledFor is not a valid date",
    });
    const row = await readBatch(draftId);
    expect(row.scheduledFor).toBeNull();
  });

  it("returns 400 for a schedule in the past and does not convert it to a send", async () => {
    const draftId = await insertBatch(ids.org);
    const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const res = await patchJson(
      appFor(batchLifecycleRoutes, ids.org, ids.user, "pro"),
      `/v1/batch/${draftId}`,
      { scheduledFor: past }
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("The scheduled time is in the past");
    const row = await readBatch(draftId);
    expect(row.status).toBe("draft");
  });

  it("stores a future schedule on the draft on a plan that allows scheduling", async () => {
    const draftId = await insertBatch(ids.org);
    const when = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const res = await patchJson(
      appFor(batchLifecycleRoutes, ids.org, ids.user, "pro"),
      `/v1/batch/${draftId}`,
      { scheduledFor: when.toISOString() }
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; scheduledFor: string };
    expect(body.status).toBe("draft");
    expect(body.scheduledFor).toBe(when.toISOString());
    const row = await readBatch(draftId);
    expect(row.status).toBe("draft");
    expect(row.scheduledFor?.toISOString()).toBe(when.toISOString());
  });

  it("returns 403 for a future schedule on the free plan (campaigns is pro)", async () => {
    const draftId = await insertBatch(ids.org);
    const when = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const res = await patchJson(
      appFor(batchLifecycleRoutes, ids.org, ids.user, "free"),
      `/v1/batch/${draftId}`,
      { scheduledFor: when.toISOString() }
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("requires the pro plan");
    const row = await readBatch(draftId);
    expect(row.scheduledFor).toBeNull();
  });
});

describe("org isolation", () => {
  it("org A cannot duplicate org B's broadcast: 404 and B row unchanged", async () => {
    const bId = await insertBatch(ids.otherOrg, {
      status: "queued",
      name: "B secret",
    });
    const bCountBefore = (await batchIdsFor(ids.otherOrg)).length;

    const res = await postJson(
      appFor(batchLifecycleRoutes, ids.org, ids.user),
      `/v1/batch/${bId}/duplicate`
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Broadcast not found" });

    const b = await readBatch(bId);
    expect(b.organizationId).toBe(ids.otherOrg);
    expect(b.status).toBe("queued");
    expect(b.name).toBe("B secret");
    expect((await batchIdsFor(ids.otherOrg)).length).toBe(bCountBefore);
  });

  it("a duplicate made by org A lands in org A only", async () => {
    const aId = await insertBatch(ids.org, { name: "A source" });
    const bId = await insertBatch(ids.otherOrg, { name: "B source" });
    const bBefore = await batchIdsFor(ids.otherOrg);

    const res = await postJson(
      appFor(batchLifecycleRoutes, ids.org, ids.user),
      `/v1/batch/${aId}/duplicate`
    );
    expect(res.status).toBe(200);
    const newId = ((await res.json()) as { id: string }).id;

    const aAfter = await batchIdsFor(ids.org);
    expect(aAfter).toContain(newId);
    expect(aAfter).not.toContain(bId);
    // B's rows are exactly what they were before.
    expect(await batchIdsFor(ids.otherOrg)).toEqual(bBefore);
  });

  it("org A cannot edit org B's draft: 404 and B row unchanged", async () => {
    const bId = await insertBatch(ids.otherOrg, { name: "B draft" });

    const res = await patchJson(
      appFor(batchLifecycleRoutes, ids.org, ids.user),
      `/v1/batch/${bId}`,
      { name: "hijacked" }
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Draft not found" });

    const b = await readBatch(bId);
    expect(b.organizationId).toBe(ids.otherOrg);
    expect(b.name).toBe("B draft");
  });

  it("org A cannot point its draft at org B's AWS account: 403 and draft unchanged", async () => {
    const aId = await insertBatch(ids.org, { name: "A draft" });

    const res = await patchJson(
      appFor(batchLifecycleRoutes, ids.org, ids.user),
      `/v1/batch/${aId}`,
      { awsAccountId: ids.otherAwsAccount, name: "changed" }
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: "AWS account does not belong to this organization",
    });

    const a = await readBatch(aId);
    expect(a.awsAccountId).toBe(ids.awsAccount);
    expect(a.name).toBe("A draft");
  });

  it("org A cannot point its draft at org B's segment: 404 and draft unchanged", async () => {
    const segmentId = `${PREFIX}-seg-b`;
    await db.insert(segment).values({
      id: segmentId,
      organizationId: ids.otherOrg,
      name: "B segment",
      condition: { logic: "AND", groups: [] },
    });
    const aId = await insertBatch(ids.org, { name: "A draft" });

    const res = await patchJson(
      appFor(batchLifecycleRoutes, ids.org, ids.user, "pro"),
      `/v1/batch/${aId}`,
      { audienceType: "segment", segmentId, name: "changed" }
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Segment not found" });

    const a = await readBatch(aId);
    expect(a.audienceType).toBe("all");
    expect(a.segmentId).toBeNull();
    expect(a.name).toBe("A draft");
  });

  it("DELETE /v1/batch/:id (existing cancel): org A cannot cancel org B's queued batch, 404 and B row unchanged", async () => {
    const bId = await insertBatch(ids.otherOrg, {
      status: "queued",
      name: "B live",
    });

    const res = await deleteReq(
      appFor(batchRoutes, ids.org, ids.user),
      `/v1/batch/${bId}`
    );
    expect(res.status).toBe(404);
    // This route throws, so the error handler adds code and requestId.
    expect(await res.json()).toMatchObject({
      error: "Batch not found",
      code: "NOT_FOUND",
    });

    const b = await readBatch(bId);
    expect(b.status).toBe("queued");
    expect(b.name).toBe("B live");
  });

  it("DELETE /v1/batch/:id: org A can cancel its own queued batch", async () => {
    const aId = await insertBatch(ids.org, { status: "queued" });

    const res = await deleteReq(
      appFor(batchRoutes, ids.org, ids.user),
      `/v1/batch/${aId}`
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      id: aId,
      status: "cancelled",
    });
    expect((await readBatch(aId)).status).toBe("cancelled");
  });
});

describe("permissions", () => {
  it("PATCH by a read-only member is 403 and the draft is unchanged", async () => {
    const draftId = await insertBatch(ids.org, { name: "Gate me" });

    const res = await patchJson(
      appFor(batchLifecycleRoutes, ids.org, roUserId),
      `/v1/batch/${draftId}`,
      { name: "read-only edit" }
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: "You don't have permission to perform this action",
    });
    expect((await readBatch(draftId)).name).toBe("Gate me");
  });

  it("duplicate by a read-only member is 403 and creates no row", async () => {
    const sourceId = await insertBatch(ids.org, { name: "Gate source" });
    const before = await batchIdsFor(ids.org);

    const res = await postJson(
      appFor(batchLifecycleRoutes, ids.org, roUserId),
      `/v1/batch/${sourceId}/duplicate`
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: "You don't have permission to perform this action",
    });
    expect(await batchIdsFor(ids.org)).toEqual(before);
  });

  // Known gap, not a regression test for new code. The existing DELETE
  // /v1/batch/:id has no write gate (batch.ts is not owned by this node), so a
  // read-only member can cancel. `it.fails` keeps the suite green while the
  // gap exists and turns red as soon as batch.ts gates the route.
  it.fails(
    "KNOWN GAP: DELETE /v1/batch/:id by a read-only member should be 403",
    async () => {
      const queuedId = await insertBatch(ids.org, { status: "queued" });

      const res = await deleteReq(
        appFor(batchRoutes, ids.org, roUserId),
        `/v1/batch/${queuedId}`
      );
      expect(res.status).toBe(403);
    }
  );
});

describe("audit log", () => {
  /** Every audit row written for a broadcast in this org or the other one. */
  async function broadcastAuditRows(organizationId: string) {
    return db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, organizationId),
          eq(auditLog.resource, "broadcast")
        )
      );
  }

  it("a successful duplicate writes exactly one broadcast.duplicated row for org A", async () => {
    const sourceId = await insertBatch(ids.org, { name: "Audited source" });

    const res = await postJson(
      appFor(batchLifecycleRoutes, ids.org, ids.user),
      `/v1/batch/${sourceId}/duplicate`
    );
    expect(res.status).toBe(200);
    const newId = ((await res.json()) as { id: string }).id;

    const rows = await broadcastAuditRows(ids.org);
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe("broadcast.duplicated");
    expect(rows[0].resource).toBe("broadcast");
    expect(rows[0].resourceId).toBe(newId);
    expect(rows[0].metadata).toEqual({
      broadcastId: newId,
      sourceId,
    });
    expect(rows[0].userId).toBe(ids.user);
    expect(rows[0].actorEmail).toBe(`${PREFIX}@example.com`);
    expect(rows[0].organizationId).toBe(ids.org);
  });

  it("a successful PATCH writes exactly one broadcast.draft_updated row for org A", async () => {
    const draftId = await insertBatch(ids.org, { name: "Before audit" });

    const res = await patchJson(
      appFor(batchLifecycleRoutes, ids.org, ids.user),
      `/v1/batch/${draftId}`,
      { name: "After audit" }
    );
    expect(res.status).toBe(200);

    const rows = await broadcastAuditRows(ids.org);
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe("broadcast.draft_updated");
    expect(rows[0].resource).toBe("broadcast");
    expect(rows[0].resourceId).toBe(draftId);
    expect(rows[0].metadata).toEqual({ broadcastId: draftId });
    expect(rows[0].userId).toBe(ids.user);
    expect(rows[0].actorEmail).toBe(`${PREFIX}@example.com`);
  });

  it("failed requests (404, 409, 400, 403 permission, 403 foreign AWS account) write no audit row", async () => {
    const queuedId = await insertBatch(ids.org, { status: "queued" });
    const draftId = await insertBatch(ids.org, { name: "Draft" });
    const bDraftId = await insertBatch(ids.otherOrg, { name: "B draft" });
    const aBefore = (await broadcastAuditRows(ids.org)).length;
    const bBefore = (await broadcastAuditRows(ids.otherOrg)).length;

    const duplicate404 = await postJson(
      appFor(batchLifecycleRoutes, ids.org, ids.user),
      `/v1/batch/${MISSING_ID}/duplicate`
    );
    const patch404 = await patchJson(
      appFor(batchLifecycleRoutes, ids.org, ids.user),
      `/v1/batch/${bDraftId}`,
      { name: "cross-org" }
    );
    const patch409 = await patchJson(
      appFor(batchLifecycleRoutes, ids.org, ids.user),
      `/v1/batch/${queuedId}`,
      { name: "not a draft" }
    );
    const patch400 = await patchJson(
      appFor(batchLifecycleRoutes, ids.org, ids.user, "pro"),
      `/v1/batch/${draftId}`,
      { scheduledFor: "not-a-date" }
    );
    const patch403Account = await patchJson(
      appFor(batchLifecycleRoutes, ids.org, ids.user),
      `/v1/batch/${draftId}`,
      { awsAccountId: ids.otherAwsAccount }
    );
    const patch403Perm = await patchJson(
      appFor(batchLifecycleRoutes, ids.org, roUserId),
      `/v1/batch/${draftId}`,
      { name: "read-only" }
    );
    const duplicate403Perm = await postJson(
      appFor(batchLifecycleRoutes, ids.org, roUserId),
      `/v1/batch/${draftId}/duplicate`
    );

    expect(duplicate404.status).toBe(404);
    expect(patch404.status).toBe(404);
    expect(patch409.status).toBe(409);
    expect(patch400.status).toBe(400);
    expect(patch403Account.status).toBe(403);
    expect(patch403Perm.status).toBe(403);
    expect(duplicate403Perm.status).toBe(403);

    expect((await broadcastAuditRows(ids.org)).length).toBe(aBefore);
    expect((await broadcastAuditRows(ids.otherOrg)).length).toBe(bBefore);
  });

  it("org B gets no audit rows from org A's successful duplicate or PATCH", async () => {
    const aSource = await insertBatch(ids.org, { name: "A source" });
    const aDraft = await insertBatch(ids.org, { name: "A draft" });
    const bBefore = await broadcastAuditRows(ids.otherOrg);

    const dup = await postJson(
      appFor(batchLifecycleRoutes, ids.org, ids.user),
      `/v1/batch/${aSource}/duplicate`
    );
    expect(dup.status).toBe(200);
    const patch = await patchJson(
      appFor(batchLifecycleRoutes, ids.org, ids.user),
      `/v1/batch/${aDraft}`,
      { name: "A edited" }
    );
    expect(patch.status).toBe(200);

    expect(await broadcastAuditRows(ids.otherOrg)).toEqual(bBefore);
    // And the two org A rows point at org A's broadcasts only.
    const aRows = await broadcastAuditRows(ids.org);
    expect(aRows.map((r) => r.resourceId).sort()).toEqual(
      [aDraft, ((await dup.json()) as { id: string }).id].sort()
    );
  });
});

describe("OpenAPI", () => {
  it("publishes the new duplicate and PATCH operations, and no separate cancel route", async () => {
    const app = new Elysia()
      .use(
        swagger({
          path: "/swagger",
          documentation: {},
          exclude: ["/swagger", "/swagger/json"],
        })
      )
      .use(batchLifecycleRoutes);

    const res = await app.handle(new Request("http://localhost/swagger/json"));
    expect(res.status).toBe(200);
    const spec = (await res.json()) as {
      paths: Record<string, Record<string, unknown>>;
    };

    expect(Object.keys(spec.paths["/v1/batch/{id}/duplicate"] ?? {})).toEqual([
      "post",
    ]);
    expect(Object.keys(spec.paths["/v1/batch/{id}"] ?? {})).toEqual(["patch"]);
    expect(spec.paths["/v1/batch/{id}/cancel"]).toBeUndefined();
  });
});
