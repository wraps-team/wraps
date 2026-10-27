/**
 * Broadcast entitlements on POST /v1/batch and POST /v1/batch/:id/send,
 * end to end: real route, real plan-gate middleware, real database.
 *
 * Every plan can broadcast to all contacts. A topic audience and a scheduled
 * send need Pro; a segment audience needs Business. Legacy plans rank with
 * their successors (starter = Pro, growth and scale = Business).
 *
 * File suffix `-db.test.ts` = real test database. The plan gate is NOT mocked,
 * and WRAPS_LICENSE_KEY is stubbed empty so `isSelfHosted()` cannot turn it
 * into a no-op. The queue and scheduler are stubbed: this file is about who
 * is allowed to create a broadcast, not about delivering it.
 */

import { batchSend, db } from "@wraps/db";
import { eq, inArray } from "drizzle-orm";
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

const { mockEnqueueJob, mockCreateBroadcastSchedule } = vi.hoisted(() => ({
  mockEnqueueJob: vi.fn(async () => undefined),
  mockCreateBroadcastSchedule: vi.fn(async () => ({ created: true })),
}));

vi.mock("../middleware/rate-limit", () => ({
  rateLimitMiddleware: new Elysia(),
}));
vi.mock("../services/queue", () => ({ enqueueJob: mockEnqueueJob }));
vi.mock("../services/scheduler", () => ({
  createBroadcastSchedule: mockCreateBroadcastSchedule,
  deleteBroadcastSchedule: vi.fn(async () => undefined),
}));

const { batchRoutes } = await import("../routes/batch");

const PREFIX = `bent-${crypto.randomUUID().slice(0, 8)}`;

let ids: Awaited<ReturnType<typeof seedBaseOrg>>["ids"];

type Plan = "free" | "pro" | "business" | "starter" | "growth" | "scale";
type Audience = "all" | "topic" | "segment";

function appFor(planId: Plan) {
  const { app } = createErrorHarness();
  return app
    .derive(() => ({
      auth: {
        apiKeyId: null,
        organizationId: ids.org,
        userId: ids.user,
        planId,
      },
    }))
    .use(batchRoutes);
}

const inOneHour = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();

function createBroadcast(
  planId: Plan,
  opts: { audienceType?: Audience; scheduled?: boolean }
) {
  return appFor(planId).handle(
    new Request("http://localhost/v1/batch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        awsAccountId: ids.awsAccount,
        name: `entitlements ${planId}`,
        subject: "Hello",
        htmlContent: "<p>Hello</p>",
        // Pre-counted so the route never needs a real topic or segment row.
        totalRecipients: 1,
        ...(opts.audienceType ? { audienceType: opts.audienceType } : {}),
        ...(opts.scheduled ? { scheduledFor: inOneHour() } : {}),
      }),
    })
  );
}

async function broadcastCount() {
  const rows = await db
    .select({ id: batchSend.id })
    .from(batchSend)
    .where(inArray(batchSend.organizationId, [ids.org]));
  return rows.length;
}

async function clearBatches() {
  await db
    .delete(batchSend)
    .where(inArray(batchSend.organizationId, [ids.org]));
}

beforeAll(async () => {
  const fixture = await seedBaseOrg(PREFIX);
  ids = fixture.ids;
});

beforeEach(async () => {
  vi.stubEnv("WRAPS_LICENSE_KEY", "");
  mockEnqueueJob.mockClear();
  mockCreateBroadcastSchedule.mockClear();
  await clearBatches();
});

afterEach(() => vi.unstubAllEnvs());

afterAll(async () => {
  await clearBatches();
  await cleanupBaseOrg(PREFIX);
});

const ALL_PLANS: Plan[] = [
  "free",
  "pro",
  "business",
  "starter",
  "growth",
  "scale",
];
const PRO_UP: Plan[] = ["pro", "business", "starter", "growth", "scale"];

describe("POST /v1/batch: all contacts", () => {
  it.each(ALL_PLANS)("%s plan can broadcast to all contacts", async (plan) => {
    const res = await createBroadcast(plan, {});

    expect(res.status).toBe(200);
    expect(await broadcastCount()).toBe(1);
    expect(mockEnqueueJob).toHaveBeenCalledTimes(1);
  });
});

describe("POST /v1/batch: topic audience (Pro and up)", () => {
  it("free plan is refused, and nothing is created or queued", async () => {
    const res = await createBroadcast("free", { audienceType: "topic" });

    expect(res.status).toBe(403);
    expect(await res.text()).toMatch(/topic/i);
    expect(await broadcastCount()).toBe(0);
    expect(mockEnqueueJob).not.toHaveBeenCalled();
  });

  it.each(PRO_UP)("%s plan clears the topic entitlement", async (plan) => {
    const res = await createBroadcast(plan, { audienceType: "topic" });

    // Whatever happens after the entitlement (the topic row is not real here)
    // it must not be a plan refusal.
    expect(res.status).not.toBe(403);
  });
});

describe("POST /v1/batch: segment audience (Pro and up)", () => {
  it("free plan is refused, and nothing is created or queued", async () => {
    const res = await createBroadcast("free", { audienceType: "segment" });

    expect(res.status).toBe(403);
    expect(await broadcastCount()).toBe(0);
    expect(mockEnqueueJob).not.toHaveBeenCalled();
  });

  it("names Pro as the plan that unlocks segments", async () => {
    const res = await createBroadcast("free", { audienceType: "segment" });

    expect(res.status).toBe(403);
    expect(await res.text()).toMatch(/pro/i);
  });

  it.each(PRO_UP)("%s plan clears the segment entitlement", async (plan) => {
    const res = await createBroadcast(plan, { audienceType: "segment" });

    expect(res.status).not.toBe(403);
  });
});

describe("POST /v1/batch: scheduling (Pro and up)", () => {
  it("free plan cannot schedule, and no schedule is created", async () => {
    const res = await createBroadcast("free", { scheduled: true });

    expect(res.status).toBe(403);
    expect(await res.text()).toMatch(/schedul/i);
    expect(await broadcastCount()).toBe(0);
    expect(mockCreateBroadcastSchedule).not.toHaveBeenCalled();
  });

  it.each(PRO_UP)(
    "%s plan can schedule a broadcast to all contacts",
    async (plan) => {
      const res = await createBroadcast(plan, { scheduled: true });

      expect(res.status).toBe(200);
      expect(mockCreateBroadcastSchedule).toHaveBeenCalledTimes(1);
      expect(mockEnqueueJob).not.toHaveBeenCalled();
      const [row] = await db
        .select({ status: batchSend.status })
        .from(batchSend)
        .where(eq(batchSend.organizationId, ids.org));
      expect(row?.status).toBe("scheduled");
    }
  );

  it("a Free plan scheduling to a segment is refused for the segment", async () => {
    const res = await createBroadcast("free", {
      audienceType: "segment",
      scheduled: true,
    });

    expect(res.status).toBe(403);
    expect(await res.text()).toMatch(/segment/i);
    expect(await broadcastCount()).toBe(0);
  });
});

describe("POST /v1/batch/:id/send (promote a draft)", () => {
  async function seedDraft(audienceType: Audience) {
    const id = `${PREFIX}-draft-${audienceType}`;
    const now = new Date();
    await db.insert(batchSend).values({
      id,
      organizationId: ids.org,
      awsAccountId: ids.awsAccount,
      channel: "email",
      status: "draft",
      name: `draft ${audienceType}`,
      subject: "Hello",
      htmlContent: "<p>Hello</p>",
      audienceType,
      totalRecipients: 0,
      createdAt: now,
      updatedAt: now,
    } as typeof batchSend.$inferInsert);
    return id;
  }

  function promote(planId: Plan, id: string) {
    return appFor(planId).handle(
      new Request(`http://localhost/v1/batch/${id}/send`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          awsAccountId: ids.awsAccount,
          totalRecipients: 1,
        }),
      })
    );
  }

  it("a Free plan cannot promote a draft that targets a segment", async () => {
    const id = await seedDraft("segment");

    const res = await promote("free", id);

    expect(res.status).toBe(403);
    const [row] = await db
      .select({ status: batchSend.status })
      .from(batchSend)
      .where(eq(batchSend.id, id));
    expect(row?.status).toBe("draft");
    expect(mockEnqueueJob).not.toHaveBeenCalled();
  });

  it("a Pro plan can promote a draft that targets a segment", async () => {
    const id = await seedDraft("segment");

    const res = await promote("pro", id);

    expect(res.status).not.toBe(403);
  });

  it("a Free plan can promote a draft that targets all contacts", async () => {
    const id = await seedDraft("all");

    const res = await promote("free", id);

    expect(res.status).not.toBe(403);
  });
});
