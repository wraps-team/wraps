/**
 * GET /v1/batch — list batch sends (real DB)
 *
 * File suffix `-db.test.ts` = real Neon test branch (no `@wraps/db` mocks).
 * Only the DynamoDB-backed module middlewares (rate limit, plan gate) are
 * stubbed — see the plan-gate/rate-limit mocks below.
 */

import { batchSend, db } from "@wraps/db";
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
vi.mock("../middleware/plan-gate", () => ({
  planGateMiddleware: vi.fn(() => new Elysia()),
}));

const { batchRoutes } = await import("../routes/batch");

const PREFIX = `batch-list-db-${crypto.randomUUID().slice(0, 8)}`;

let ids: Awaited<ReturnType<typeof seedBaseOrg>>["ids"];

function appFor(organizationId: string, userId: string) {
  const { app } = createErrorHarness();
  return app
    .derive(() => ({
      auth: { apiKeyId: null, organizationId, userId, planId: "pro" },
    }))
    .use(batchRoutes);
}

function unauthedApp() {
  const { app } = createErrorHarness();
  return app.use(batchRoutes);
}

function batchRow(
  id: string,
  organizationId: string,
  overrides: Partial<typeof batchSend.$inferInsert> = {}
): typeof batchSend.$inferInsert {
  const now = new Date();
  return {
    id,
    organizationId,
    awsAccountId: ids.awsAccount,
    channel: "email",
    status: "completed",
    name: `Batch ${id}`,
    subject: "Hello",
    audienceType: "all",
    totalRecipients: 10,
    processedRecipients: 10,
    sent: 9,
    delivered: 8,
    failed: 1,
    opened: 0,
    clicked: 0,
    bounced: 0,
    complained: 0,
    suppressed: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as typeof batchSend.$inferInsert;
}

async function clearBatches() {
  await db
    .delete(batchSend)
    .where(inArray(batchSend.organizationId, [ids.org, ids.otherOrg]));
}

beforeAll(async () => {
  const fixture = await seedBaseOrg(PREFIX);
  ids = fixture.ids;
});

beforeEach(async () => {
  await clearBatches();
});

afterAll(async () => {
  await clearBatches();
  await cleanupBaseOrg(PREFIX);
});

describe("GET /v1/batch", () => {
  it("returns 401 when no auth is provided", async () => {
    const app = unauthedApp();
    const res = await app.handle(new Request("http://localhost/v1/batch"));
    expect(res.status).toBe(401);
  });

  it("returns only the authed org's broadcasts", async () => {
    await db
      .insert(batchSend)
      .values([
        batchRow(`${PREFIX}-own-1`, ids.org),
        batchRow(`${PREFIX}-foreign-1`, ids.otherOrg),
      ]);

    const app = appFor(ids.org, ids.user);
    const res = await app.handle(new Request("http://localhost/v1/batch"));
    expect(res.status).toBe(200);

    const body = await res.json();
    const returnedIds = body.data.map((b: { id: string }) => b.id);
    expect(returnedIds).toContain(`${PREFIX}-own-1`);
    expect(returnedIds).not.toContain(`${PREFIX}-foreign-1`);
  });

  it("total reflects the filtered count, not the page length", async () => {
    await db
      .insert(batchSend)
      .values([
        batchRow(`${PREFIX}-p1`, ids.org),
        batchRow(`${PREFIX}-p2`, ids.org),
        batchRow(`${PREFIX}-p3`, ids.org),
      ]);

    const app = appFor(ids.org, ids.user);
    const res = await app.handle(
      new Request("http://localhost/v1/batch?pageSize=2")
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.length).toBe(2);
    expect(body.total).toBe(3);
  });

  it("status filter narrows results", async () => {
    await db
      .insert(batchSend)
      .values([
        batchRow(`${PREFIX}-completed-1`, ids.org, { status: "completed" }),
        batchRow(`${PREFIX}-failed-1`, ids.org, { status: "failed" }),
      ]);

    const app = appFor(ids.org, ids.user);
    const res = await app.handle(
      new Request("http://localhost/v1/batch?status=failed")
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    const returnedIds = body.data.map((b: { id: string }) => b.id);
    expect(returnedIds).toContain(`${PREFIX}-failed-1`);
    expect(returnedIds).not.toContain(`${PREFIX}-completed-1`);
  });

  it("returns 422 with VALIDATION_FAILED when pageSize exceeds the max", async () => {
    const app = appFor(ids.org, ids.user);
    const res = await app.handle(
      new Request("http://localhost/v1/batch?pageSize=101")
    );
    expect(res.status).toBe(422);

    const body = await res.json();
    expect(body.code).toBe("VALIDATION_FAILED");
  });

  it("never returns an email or createdByUser key anywhere in the response", async () => {
    await db.insert(batchSend).values(batchRow(`${PREFIX}-pii-1`, ids.org));

    const app = appFor(ids.org, ids.user);
    const res = await app.handle(new Request("http://localhost/v1/batch"));
    expect(res.status).toBe(200);

    const body = await res.json();

    function collectKeys(
      v: unknown,
      out: Set<string> = new Set()
    ): Set<string> {
      if (Array.isArray(v)) {
        for (const x of v) collectKeys(x, out);
      } else if (v && typeof v === "object") {
        for (const [k, x] of Object.entries(v)) {
          out.add(k);
          collectKeys(x, out);
        }
      }
      return out;
    }

    const keys = collectKeys(body);
    expect(keys.has("email")).toBe(false);
    expect(keys.has("createdByUser")).toBe(false);
  });
});
