/**
 * GET/POST/PATCH/DELETE /v1/segments and /v1/segments/preview on the combined
 * app — real DB, real plan-gate middleware.
 *
 * File suffix `-db.test.ts` = real Neon test branch (no `@wraps/db` mocks).
 * The plan gate is NOT mocked here (unlike most route suites) — this file
 * exists specifically to prove the gate runs, so `../middleware/plan-gate`
 * must stay real. `WRAPS_LICENSE_KEY` is stubbed empty per test so
 * `isSelfHosted()` cannot make the gate a no-op the way it would with the key
 * set in the ambient shell env.
 */

import { batchSend, contact, db, eq, insertSegment, segment } from "@wraps/db";
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

const { segmentsRoutes } = await import("../routes/segments");

// PREFIX doubles as a route param (`id: t.String({ maxLength: 36 })`), so
// keep it short — see the plan 216 lesson on this exact trap.
const PREFIX = `sapi-${crypto.randomUUID().slice(0, 8)}`;

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
    .use(segmentsRoutes);
}

function unauthedApp() {
  const { app } = createErrorHarness();
  return app.use(segmentsRoutes);
}

const basicCondition = {
  logic: "AND" as const,
  groups: [
    {
      filters: [
        { field: "status", operator: "equals" as const, value: "active" },
      ],
    },
  ],
};

async function clearSegments() {
  await db
    .delete(segment)
    .where(inArray(segment.organizationId, [ids.org, ids.otherOrg]));
  await db
    .delete(batchSend)
    .where(inArray(batchSend.organizationId, [ids.org, ids.otherOrg]));
  // The shared base fixture seeds one active contact per org (see
  // fixtures/real-db.ts), which would otherwise match `basicCondition`
  // ("status equals active") and pollute every memberCount assertion here.
  // Segment tests own their contacts explicitly, so clear the slate.
  await db
    .delete(contact)
    .where(inArray(contact.organizationId, [ids.org, ids.otherOrg]));
}

function collectKeys(v: unknown, out: Set<string> = new Set()): Set<string> {
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

beforeAll(async () => {
  const fixture = await seedBaseOrg(PREFIX);
  ids = fixture.ids;
});

beforeEach(async () => {
  await clearSegments();
  // isSelfHosted() reads WRAPS_LICENSE_KEY at call time — stubbing it empty
  // for every test forces the real gate to evaluate plan rank instead of
  // short-circuiting as "licensed, everything unlocked".
  vi.stubEnv("WRAPS_LICENSE_KEY", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(async () => {
  await clearSegments();
  await cleanupBaseOrg(PREFIX);
});

describe("auth — 401 with no auth header", () => {
  const cases: Array<[string, () => Request]> = [
    ["GET /", () => new Request("http://localhost/v1/segments")],
    [
      "GET /:id",
      () => new Request(`http://localhost/v1/segments/${PREFIX}-nope`),
    ],
    [
      "POST /",
      () =>
        new Request("http://localhost/v1/segments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "x", condition: basicCondition }),
        }),
    ],
    [
      "PATCH /:id",
      () =>
        new Request(`http://localhost/v1/segments/${PREFIX}-nope`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        }),
    ],
    [
      "DELETE /:id",
      () =>
        new Request(`http://localhost/v1/segments/${PREFIX}-nope`, {
          method: "DELETE",
        }),
    ],
    [
      "POST /preview",
      () =>
        new Request("http://localhost/v1/segments/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ condition: basicCondition }),
        }),
    ],
  ];

  it.each(cases)("%s returns 401", async (_label, buildRequest) => {
    const app = unauthedApp();
    const res = await app.handle(buildRequest());
    expect(res.status).toBe(401);
  });
});

describe("cross-org 404", () => {
  it("GET /:id, PATCH /:id, and DELETE /:id all 404 for another org's segment", async () => {
    const foreign = await insertSegment({
      organizationId: ids.otherOrg,
      name: "Foreign Segment",
      condition: basicCondition,
    });

    const app = appFor(ids.org, ids.user);

    const getRes = await app.handle(
      new Request(`http://localhost/v1/segments/${foreign.id}`)
    );
    expect(getRes.status).toBe(404);

    const patchRes = await app.handle(
      new Request(`http://localhost/v1/segments/${foreign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Hijacked" }),
      })
    );
    expect(patchRes.status).toBe(404);

    const deleteRes = await app.handle(
      new Request(`http://localhost/v1/segments/${foreign.id}`, {
        method: "DELETE",
      })
    );
    expect(deleteRes.status).toBe(404);

    // Confirm the foreign row really is untouched.
    const [stillThere] = await db
      .select()
      .from(segment)
      .where(eq(segment.id, foreign.id));
    expect(stillThere).toBeDefined();
    expect(stillThere.name).toBe("Foreign Segment");
  });
});

describe("GET /v1/segments — list", () => {
  it("returns only this org's segments", async () => {
    await insertSegment({
      organizationId: ids.org,
      name: "Mine",
      condition: basicCondition,
    });
    await insertSegment({
      organizationId: ids.otherOrg,
      name: "Not Mine",
      condition: basicCondition,
    });

    const app = appFor(ids.org, ids.user);
    const res = await app.handle(new Request("http://localhost/v1/segments"));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.segments.map((s: { name: string }) => s.name)).toContain(
      "Mine"
    );
    expect(body.segments.map((s: { name: string }) => s.name)).not.toContain(
      "Not Mine"
    );
  });

  it("never returns createdBy on any response", async () => {
    const created = await insertSegment({
      organizationId: ids.org,
      name: "No CreatedBy Here",
      condition: basicCondition,
      createdBy: ids.user,
    });

    const app = appFor(ids.org, ids.user);

    const listRes = await app.handle(
      new Request("http://localhost/v1/segments")
    );
    const listBody = await listRes.json();
    expect(collectKeys(listBody).has("createdBy")).toBe(false);

    const getRes = await app.handle(
      new Request(`http://localhost/v1/segments/${created.id}`)
    );
    const getBody = await getRes.json();
    expect(collectKeys(getBody).has("createdBy")).toBe(false);
  });

  it("memberCount reflects live sendable recipients, not the stored column", async () => {
    const now = new Date();
    await db.insert(contact).values({
      id: crypto.randomUUID(),
      organizationId: ids.org,
      email: `${PREFIX}-live@example.com`,
      emailHash: `${PREFIX}-live-hash`,
      emailStatus: "active",
      createdAt: now,
      updatedAt: now,
    });

    // Deliberately wrong stored column — the response must not echo this.
    const created = await insertSegment({
      organizationId: ids.org,
      name: "Live Count Segment",
      condition: basicCondition,
      memberCount: 9999,
    });

    const app = appFor(ids.org, ids.user);
    const res = await app.handle(new Request("http://localhost/v1/segments"));
    const body = await res.json();
    const row = body.segments.find((s: { id: string }) => s.id === created.id);

    expect(row).toBeDefined();
    expect(row.memberCount).not.toBe(9999);
    expect(row.memberCount).toBe(1);
  });
});

describe("POST /v1/segments — create", () => {
  it("400s on a malformed condition instead of 500ing", async () => {
    const app = appFor(ids.org, ids.user);
    const res = await app.handle(
      new Request("http://localhost/v1/segments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Bad Condition",
          condition: { logic: "AND", groups: [] },
        }),
      })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(typeof body.error).toBe("string");
  });

  it("creates a segment and snapshots a live memberCount", async () => {
    const app = appFor(ids.org, ids.user);
    const res = await app.handle(
      new Request("http://localhost/v1/segments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "New Segment",
          condition: basicCondition,
        }),
      })
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe("New Segment");
    expect(body.memberCount).toBe(0);
    expect(collectKeys(body).has("createdBy")).toBe(false);

    const [row] = await db
      .select()
      .from(segment)
      .where(eq(segment.id, body.id));
    expect(row.createdBy).toBeNull();
  });
});

describe("DELETE /v1/segments/:id", () => {
  it("refuses with 409 when a scheduled/queued/processing batch targets it, and keeps the row", async () => {
    const created = await insertSegment({
      organizationId: ids.org,
      name: "Targeted By A Live Send",
      condition: basicCondition,
    });

    await db.insert(batchSend).values({
      organizationId: ids.org,
      segmentId: created.id,
      status: "queued",
    });

    const app = appFor(ids.org, ids.user);
    const res = await app.handle(
      new Request(`http://localhost/v1/segments/${created.id}`, {
        method: "DELETE",
      })
    );
    expect(res.status).toBe(409);

    const [stillThere] = await db
      .select()
      .from(segment)
      .where(eq(segment.id, created.id));
    expect(stillThere).toBeDefined();
  });

  it("succeeds when unreferenced, and the row is gone", async () => {
    const created = await insertSegment({
      organizationId: ids.org,
      name: "Safe To Delete",
      condition: basicCondition,
    });

    const app = appFor(ids.org, ids.user);
    const res = await app.handle(
      new Request(`http://localhost/v1/segments/${created.id}`, {
        method: "DELETE",
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    const [gone] = await db
      .select()
      .from(segment)
      .where(eq(segment.id, created.id));
    expect(gone).toBeUndefined();
  });

  it("still allows delete when the only referencing batch is completed", async () => {
    const created = await insertSegment({
      organizationId: ids.org,
      name: "Referenced By A Finished Send",
      condition: basicCondition,
    });

    await db.insert(batchSend).values({
      organizationId: ids.org,
      segmentId: created.id,
      status: "completed",
    });

    const app = appFor(ids.org, ids.user);
    const res = await app.handle(
      new Request(`http://localhost/v1/segments/${created.id}`, {
        method: "DELETE",
      })
    );
    expect(res.status).toBe(200);
  });
});

describe("POST /v1/segments/preview", () => {
  it("respects the limit cap", async () => {
    const now = new Date();
    await db.insert(contact).values(
      Array.from({ length: 5 }, (_, i) => ({
        id: crypto.randomUUID(),
        organizationId: ids.org,
        email: `${PREFIX}-preview-${i}@example.com`,
        emailHash: `${PREFIX}-preview-hash-${i}`,
        emailStatus: "active" as const,
        createdAt: now,
        updatedAt: now,
      }))
    );

    const app = appFor(ids.org, ids.user);
    const res = await app.handle(
      new Request("http://localhost/v1/segments/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ condition: basicCondition, limit: 2 }),
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(5);
    expect(body.sample.length).toBeLessThanOrEqual(2);
  });

  it("does not execute a condition carrying SQL metacharacters — the query runs safely and the segment table is unaffected", async () => {
    const app = appFor(ids.org, ids.user);
    const maliciousCondition = {
      logic: "AND" as const,
      groups: [
        {
          filters: [
            {
              field: "properties.name'); DROP TABLE segment; --",
              operator: "equals" as const,
              value: "x' OR '1'='1",
            },
          ],
        },
      ],
    };

    const res = await app.handle(
      new Request("http://localhost/v1/segments/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ condition: maliciousCondition }),
      })
    );

    // Whatever the app decides about the filter's validity, it must not 500,
    // and the table must still be queryable afterward.
    expect(res.status).not.toBe(500);

    const rows = await db.select().from(segment).limit(1);
    expect(Array.isArray(rows)).toBe(true);
  });
});

describe("plan gate", () => {
  const gatedCases: Array<[string, () => Request]> = [
    ["GET /", () => new Request("http://localhost/v1/segments")],
    [
      "GET /:id",
      () => new Request(`http://localhost/v1/segments/${PREFIX}-gate`),
    ],
    [
      "POST /",
      () =>
        new Request("http://localhost/v1/segments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "x", condition: basicCondition }),
        }),
    ],
    [
      "PATCH /:id",
      () =>
        new Request(`http://localhost/v1/segments/${PREFIX}-gate`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        }),
    ],
    [
      "DELETE /:id",
      () =>
        new Request(`http://localhost/v1/segments/${PREFIX}-gate`, {
          method: "DELETE",
        }),
    ],
    [
      "POST /preview",
      () =>
        new Request("http://localhost/v1/segments/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ condition: basicCondition }),
        }),
    ],
  ];

  it.each(gatedCases)(
    "a free org gets 403 on %s, naming the required plan",
    async (_label, buildRequest) => {
      const app = appFor(ids.org, ids.user, "free");
      const res = await app.handle(buildRequest());
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(String(body.error ?? body.message)).toMatch(/pro/i);
    }
  );

  it("a null planId (no valid subscription) gets 403", async () => {
    const app = appFor(ids.org, ids.user, null);
    const res = await app.handle(new Request("http://localhost/v1/segments"));
    expect(res.status).toBe(403);
  });

  it.each(["pro", "business", "starter", "growth", "scale"])(
    "a %s org gets a non-403 status on GET /",
    async (planId) => {
      const app = appFor(ids.org, ids.user, planId);
      const res = await app.handle(new Request("http://localhost/v1/segments"));
      expect(res.status).not.toBe(403);
    }
  );

  it("the gate rejects a free org's POST /preview before the handler runs — an intentionally invalid condition still returns 403, not 400", async () => {
    const app = appFor(ids.org, ids.user, "free");
    const res = await app.handle(
      new Request("http://localhost/v1/segments/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          condition: { logic: "AND", groups: [] }, // would 400 if the handler ran
        }),
      })
    );

    expect(res.status).toBe(403);

    // No segment was created as a side effect of this rejected request.
    const rows = await db
      .select()
      .from(segment)
      .where(eq(segment.organizationId, ids.org));
    expect(rows).toHaveLength(0);
  });
});
