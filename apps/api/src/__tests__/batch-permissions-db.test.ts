/**
 * Write and send gates on the batch routes (batch.ts and batch-lifecycle.ts).
 *
 * Each gated handler gets three checks:
 *  - a read-only member session is refused with 403 and nothing changes;
 *  - an API key without the needed scope is refused with 403 and nothing changes;
 *  - a positive control (an owner session, or a key with the scope) passes the gate.
 *
 * Real DB (no `@wraps/db` mock). The queue and scheduler are mocked so a test can
 * assert nothing was enqueued or scheduled. Rate limit is mocked, as in
 * batch-lifecycle-api-db.
 */

import { auditLog, batchSend, db, eq, member, user } from "@wraps/db";
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

vi.mock("../services/queue", () => ({
  enqueueJob: vi.fn(async () => {}),
}));

vi.mock("../services/scheduler", () => ({
  createBroadcastSchedule: vi.fn(async () => ({
    scheduleName: "unused",
    created: true,
  })),
  deleteBroadcastSchedule: vi.fn(async () => {}),
}));

const { batchRoutes } = await import("../routes/batch");
const { batchLifecycleRoutes } = await import("../routes/batch-lifecycle");
const { enqueueJob } = await import("../services/queue");
const { FULL_ACCESS_PERMISSIONS, READ_ONLY_PERMISSIONS } = await import(
  "../services/api-keys"
);

// PREFIX is namespaced `t2x-<id>-<8 chars>`; 17 characters, under the 36 limit.
const PREFIX = `t2x-t2g1-${crypto.randomUUID().slice(0, 8)}`;
const MISSING_ID = "00000000-0000-4000-8000-000000000000";
const DENIED = { error: "You don't have permission to perform this action" };

// Only campaigns:write, no send:email: may edit, may not send.
const WRITE_NO_SEND_PERMISSIONS = [
  "campaigns:read",
  "campaigns:write",
] as const;

let ids: Awaited<ReturnType<typeof seedBaseOrg>>["ids"];
const roUserId = `${PREFIX}-ro`;
const roMemberId = `${PREFIX}-member-ro`;

type Caller =
  | { kind: "session"; userId: string }
  | { kind: "key"; scopes: readonly string[] };

/** The batch routes as index.ts mounts them, with auth derived for one caller. */
function appFor(caller: Caller) {
  const { app } = createErrorHarness();
  const auth =
    caller.kind === "session"
      ? {
          apiKeyId: null,
          apiKeyScopes: undefined,
          userId: caller.userId,
          organizationId: ids.org,
          planId: "pro",
        }
      : {
          apiKeyId: `${PREFIX}-key`,
          apiKeyScopes: [...caller.scopes],
          userId: ids.user,
          organizationId: ids.org,
          planId: "pro",
        };
  return app
    .derive(() => ({ auth }))
    .use(batchRoutes)
    .use(batchLifecycleRoutes);
}

/** The seeded owner of the fixture org. */
const ownerCaller = (): Caller => ({ kind: "session", userId: ids.user });
const READ_ONLY_MEMBER: Caller = { kind: "session", userId: roUserId };
const READ_ONLY_KEY: Caller = { kind: "key", scopes: READ_ONLY_PERMISSIONS };
const WRITE_ONLY_KEY: Caller = {
  kind: "key",
  scopes: WRITE_NO_SEND_PERMISSIONS,
};
const FULL_KEY: Caller = { kind: "key", scopes: FULL_ACCESS_PERMISSIONS };

type BatchOverrides = Partial<typeof batchSend.$inferInsert>;

async function insertBatch(overrides: BatchOverrides = {}): Promise<string> {
  const [row] = await db
    .insert(batchSend)
    .values({
      organizationId: ids.org,
      status: "draft",
      channel: "email",
      name: `${PREFIX} batch`,
      subject: "Subject line",
      htmlContent: "<p>Hello</p>",
      audienceType: "all",
      awsAccountId: ids.awsAccount,
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

async function batchIdsForOrg(): Promise<string[]> {
  const rows = await db
    .select({ id: batchSend.id })
    .from(batchSend)
    .where(eq(batchSend.organizationId, ids.org));
  return rows.map((r) => r.id);
}

async function clearBatches() {
  await db
    .delete(auditLog)
    .where(inArray(auditLog.organizationId, [ids.org, ids.otherOrg]));
  await db
    .delete(batchSend)
    .where(inArray(batchSend.organizationId, [ids.org, ids.otherOrg]));
}

type AppLike = { handle(request: Request): Response | Promise<Response> };

function send(
  app: AppLike,
  method: "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown
) {
  return app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );
}

const createBody = () => ({
  awsAccountId: ids.awsAccount,
  totalRecipients: 1,
  name: `${PREFIX} created`,
  subject: "Hi",
  htmlContent: "<p>Hi</p>",
  from: "sender@example.com",
  audienceType: "all",
});

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
  vi.clearAllMocks();
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

describe("POST /v1/batch (create and send)", () => {
  it("refuses a read-only member with 403 and creates no broadcast or job", async () => {
    const before = await batchIdsForOrg();
    const res = await send(
      appFor(READ_ONLY_MEMBER),
      "POST",
      "/v1/batch",
      createBody()
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual(DENIED);
    expect(await batchIdsForOrg()).toEqual(before);
    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it("refuses a read-only key with 403 and creates nothing", async () => {
    const before = await batchIdsForOrg();
    const res = await send(
      appFor(READ_ONLY_KEY),
      "POST",
      "/v1/batch",
      createBody()
    );
    expect(res.status).toBe(403);
    expect(await batchIdsForOrg()).toEqual(before);
    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it("refuses a key with campaigns:write but no send:email with 403", async () => {
    const before = await batchIdsForOrg();
    const res = await send(
      appFor(WRITE_ONLY_KEY),
      "POST",
      "/v1/batch",
      createBody()
    );
    expect(res.status).toBe(403);
    expect(await batchIdsForOrg()).toEqual(before);
    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it("passes the gate for an owner session and for a full-scope key", async () => {
    const ownerRes = await send(
      appFor(ownerCaller()),
      "POST",
      "/v1/batch",
      createBody()
    );
    expect(ownerRes.status).toBe(200);
    const full = await send(appFor(FULL_KEY), "POST", "/v1/batch", {
      ...createBody(),
      name: `${PREFIX} via key`,
    });
    expect(full.status).toBe(200);
    expect(enqueueJob).toHaveBeenCalledTimes(2);
  });
});

describe("POST /v1/batch/:id/send (promote draft)", () => {
  const sendBody = () => ({ awsAccountId: ids.awsAccount, totalRecipients: 1 });

  it("refuses a read-only member with 403 and leaves the draft a draft", async () => {
    const draftId = await insertBatch();
    const res = await send(
      appFor(READ_ONLY_MEMBER),
      "POST",
      `/v1/batch/${draftId}/send`,
      sendBody()
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual(DENIED);
    expect((await readBatch(draftId)).status).toBe("draft");
    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it("refuses a write-only key (no send:email) with 403 and leaves the draft", async () => {
    const draftId = await insertBatch();
    const res = await send(
      appFor(WRITE_ONLY_KEY),
      "POST",
      `/v1/batch/${draftId}/send`,
      sendBody()
    );
    expect(res.status).toBe(403);
    expect((await readBatch(draftId)).status).toBe("draft");
    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it("passes the gate for an owner session and for a full-scope key", async () => {
    const draftId = await insertBatch();
    const res = await send(
      appFor(ownerCaller()),
      "POST",
      `/v1/batch/${draftId}/send`,
      sendBody()
    );
    expect(res.status).toBe(201);
    expect((await readBatch(draftId)).status).toBe("queued");
    expect(enqueueJob).toHaveBeenCalledTimes(1);

    const otherDraft = await insertBatch();
    const keyRes = await send(
      appFor(FULL_KEY),
      "POST",
      `/v1/batch/${otherDraft}/send`,
      sendBody()
    );
    expect(keyRes.status).toBe(201);
  });
});

describe("PATCH /v1/batch/:id (edit draft or scheduled)", () => {
  it("refuses a read-only member on a draft with 403 and leaves it unchanged", async () => {
    const draftId = await insertBatch({ name: "Keep me" });
    const res = await send(
      appFor(READ_ONLY_MEMBER),
      "PATCH",
      `/v1/batch/${draftId}`,
      {
        name: "Changed",
      }
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual(DENIED);
    expect((await readBatch(draftId)).name).toBe("Keep me");
  });

  it("refuses a read-only key on a draft with 403", async () => {
    const draftId = await insertBatch({ name: "Keep me" });
    const res = await send(
      appFor(READ_ONLY_KEY),
      "PATCH",
      `/v1/batch/${draftId}`,
      {
        name: "Changed",
      }
    );
    expect(res.status).toBe(403);
    expect((await readBatch(draftId)).name).toBe("Keep me");
  });

  it("lets a campaigns:write key edit a draft (the draft needs write, not send)", async () => {
    const draftId = await insertBatch({ name: "Old" });
    const res = await send(
      appFor(WRITE_ONLY_KEY),
      "PATCH",
      `/v1/batch/${draftId}`,
      {
        name: "New",
      }
    );
    expect(res.status).toBe(200);
    expect((await readBatch(draftId)).name).toBe("New");
  });

  it("refuses a read-only member on a scheduled broadcast with 403 and leaves it unchanged", async () => {
    const scheduledId = await insertBatch({
      status: "scheduled",
      from: "old@example.com",
      scheduledFor: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    const res = await send(
      appFor(READ_ONLY_MEMBER),
      "PATCH",
      `/v1/batch/${scheduledId}`,
      { from: "new@example.com" }
    );
    expect(res.status).toBe(403);
    expect((await readBatch(scheduledId)).from).toBe("old@example.com");
  });

  it("refuses a campaigns:write key without send:email on a scheduled broadcast with 403", async () => {
    const scheduledId = await insertBatch({
      status: "scheduled",
      from: "old@example.com",
      scheduledFor: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    const res = await send(
      appFor(WRITE_ONLY_KEY),
      "PATCH",
      `/v1/batch/${scheduledId}`,
      { from: "new@example.com" }
    );
    expect(res.status).toBe(403);
    expect((await readBatch(scheduledId)).from).toBe("old@example.com");
  });

  it("passes the gate for an owner session and edits the scheduled broadcast", async () => {
    const scheduledId = await insertBatch({
      status: "scheduled",
      from: "old@example.com",
      scheduledFor: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    const res = await send(
      appFor(ownerCaller()),
      "PATCH",
      `/v1/batch/${scheduledId}`,
      {
        from: "new@example.com",
      }
    );
    expect(res.status).toBe(200);
    expect((await readBatch(scheduledId)).from).toBe("new@example.com");
  });
});

describe("DELETE /v1/batch/:id (cancel)", () => {
  it("refuses a read-only member with 403 and does not cancel", async () => {
    const queuedId = await insertBatch({ status: "queued" });
    const res = await send(
      appFor(READ_ONLY_MEMBER),
      "DELETE",
      `/v1/batch/${queuedId}`
    );
    expect(res.status).toBe(403);
    expect((await readBatch(queuedId)).status).toBe("queued");
  });

  it("refuses a read-only key with 403 and does not cancel", async () => {
    const queuedId = await insertBatch({ status: "queued" });
    const res = await send(
      appFor(READ_ONLY_KEY),
      "DELETE",
      `/v1/batch/${queuedId}`
    );
    expect(res.status).toBe(403);
    expect((await readBatch(queuedId)).status).toBe("queued");
  });

  it("passes the gate for an owner session and cancels", async () => {
    const queuedId = await insertBatch({ status: "queued" });
    const res = await send(
      appFor(ownerCaller()),
      "DELETE",
      `/v1/batch/${queuedId}`
    );
    expect(res.status).toBe(200);
    expect((await readBatch(queuedId)).status).toBe("cancelled");
  });

  it("returns 404 for an unknown id to an owner session", async () => {
    const res = await send(
      appFor(ownerCaller()),
      "DELETE",
      `/v1/batch/${MISSING_ID}`
    );
    expect(res.status).toBe(404);
  });
});

describe("POST /v1/batch/:id/resume", () => {
  const failedBatch = () =>
    insertBatch({
      status: "failed",
      channel: "email",
      lastChunkIndex: 2,
      errorDetails: {},
    });

  it("refuses a read-only member with 403, leaves the batch failed, enqueues nothing", async () => {
    const id = await failedBatch();
    const res = await send(
      appFor(READ_ONLY_MEMBER),
      "POST",
      `/v1/batch/${id}/resume`
    );
    expect(res.status).toBe(403);
    expect((await readBatch(id)).status).toBe("failed");
    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it("refuses a write-only key (no send:email) with 403", async () => {
    const id = await failedBatch();
    const res = await send(
      appFor(WRITE_ONLY_KEY),
      "POST",
      `/v1/batch/${id}/resume`
    );
    expect(res.status).toBe(403);
    expect((await readBatch(id)).status).toBe("failed");
    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it("passes the gate for an owner session and resumes", async () => {
    const id = await failedBatch();
    const res = await send(
      appFor(ownerCaller()),
      "POST",
      `/v1/batch/${id}/resume`
    );
    expect(res.status).toBe(200);
    expect((await readBatch(id)).status).toBe("processing");
    expect(enqueueJob).toHaveBeenCalledTimes(1);
  });
});
