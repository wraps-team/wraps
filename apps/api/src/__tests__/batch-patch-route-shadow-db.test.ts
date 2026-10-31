/**
 * Regression: PATCH /v1/batch/:id must have exactly one registration, and that
 * one must edit both drafts and scheduled broadcasts.
 *
 * It used to be registered twice (batch.ts, scheduled-only, and
 * batch-lifecycle.ts, draft-only). index.ts mounts batch.ts first, so the
 * scheduled-only handler won and draft edits returned 400. Each router's own
 * test passed alone, so nothing caught the collision. This test mounts the
 * three /v1/batch routers in one app, in the order index.ts uses, and checks
 * both behaviors and the composed route list.
 *
 * Real DB (no `@wraps/db` mock). Rate limit, queue and scheduler are mocked.
 */

import { auditLog, batchSend, db, eq } from "@wraps/db";
import { inArray } from "drizzle-orm";
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

// Same order as apps/api/src/index.ts: batchDraftRoutes, batchRoutes, batchLifecycleRoutes.
const { batchDraftRoutes } = await import("../routes/batch-drafts");
const { batchRoutes } = await import("../routes/batch");
const { batchLifecycleRoutes } = await import("../routes/batch-lifecycle");

// PREFIX is namespaced `t2x-<id>-<8 chars>`; 17 characters, under the 36 limit.
const PREFIX = `t2x-t2rs-${crypto.randomUUID().slice(0, 8)}`;

let ids: Awaited<ReturnType<typeof seedBaseOrg>>["ids"];

/** The /v1/batch routers as index.ts composes them, with an owner session derived. */
function composedApp() {
  const { app } = createErrorHarness();
  return app
    .derive(() => ({
      auth: {
        apiKeyId: null,
        apiKeyScopes: undefined,
        organizationId: ids.org,
        userId: ids.user,
        planId: "pro",
      },
    }))
    .use(batchDraftRoutes)
    .use(batchRoutes)
    .use(batchLifecycleRoutes);
}

async function insertBatch(
  overrides: Partial<typeof batchSend.$inferInsert> = {}
): Promise<string> {
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

async function patch(
  app: { handle(r: Request): Response | Promise<Response> },
  id: string,
  body: unknown
) {
  return app.handle(
    new Request(`http://localhost/v1/batch/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

beforeAll(async () => {
  const fixture = await seedBaseOrg(PREFIX);
  ids = fixture.ids;
});

beforeEach(async () => {
  vi.stubEnv("WRAPS_LICENSE_KEY", "");
  await db.delete(auditLog).where(inArray(auditLog.organizationId, [ids.org]));
  await db
    .delete(batchSend)
    .where(inArray(batchSend.organizationId, [ids.org]));
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await db
    .delete(batchSend)
    .where(inArray(batchSend.organizationId, [ids.org]));
  await cleanupBaseOrg(PREFIX);
});

describe("PATCH /v1/batch/:id across the composed /v1/batch routers", () => {
  it("is registered exactly once", () => {
    const app = composedApp();
    const patches = app.routes.filter(
      (route) => route.method === "PATCH" && route.path === "/v1/batch/:id"
    );
    expect(patches).toHaveLength(1);
  });

  it("edits a draft: 200, and the draft row changes", async () => {
    const draftId = await insertBatch({ name: "Before" });

    const res = await patch(composedApp(), draftId, { name: "After" });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      id: string;
      status: string;
      name: string;
    };
    expect(body.id).toBe(draftId);
    expect(body.status).toBe("draft");
    expect(body.name).toBe("After");
    expect((await readBatch(draftId)).name).toBe("After");
  });

  it("still edits a scheduled broadcast in place: 200, schedule kept", async () => {
    const scheduledFor = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const scheduledId = await insertBatch({
      status: "scheduled",
      from: "old@example.com",
      scheduledFor,
    });

    const res = await patch(composedApp(), scheduledId, {
      from: "new@example.com",
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; scheduledFor: string };
    expect(body.status).toBe("scheduled");
    expect(new Date(body.scheduledFor).getTime()).toBe(scheduledFor.getTime());
    const row = await readBatch(scheduledId);
    expect(row.from).toBe("new@example.com");
    expect(row.status).toBe("scheduled");
  });

  it("refuses a queued broadcast with 409, naming its status", async () => {
    const queuedId = await insertBatch({ status: "queued", name: "In flight" });

    const res = await patch(composedApp(), queuedId, { name: "Nope" });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "Cannot edit: broadcast is already queued",
    });
    expect((await readBatch(queuedId)).name).toBe("In flight");
  });
});
