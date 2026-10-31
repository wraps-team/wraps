/**
 * Write-permission gates on POST /v1/segments, PATCH /v1/segments/:id,
 * DELETE /v1/segments/:id and POST /v1/segments/preview (a read), on the real
 * route stack: real DB, real permission gate, real plan gate.
 *
 * File suffix `-db.test.ts` = real Neon test branch (no `@wraps/db` mocks).
 */

import { db, eq, insertSegment, member, segment, user } from "@wraps/db";
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
import {
  FULL_ACCESS_PERMISSIONS,
  READ_ONLY_PERMISSIONS,
} from "../services/api-keys";
import { createErrorHarness } from "./error-handler-harness";

vi.mock("../middleware/rate-limit", () => ({
  rateLimitMiddleware: new Elysia(),
}));

const { segmentsRoutes } = await import("../routes/segments");

// PREFIX doubles as a route param (`id: t.String({ maxLength: 36 })`), so it
// stays short.
const PREFIX = `sperm-${crypto.randomUUID().slice(0, 8)}`;
const READ_ONLY_USER = `${PREFIX}-ro-user`;
const READ_ONLY_MEMBER = `${PREFIX}-ro-member`;
const READ_ONLY_EMAIL = `${PREFIX}-ro@example.com`;

const PERMISSION_DENIED = "You don't have permission to perform this action";

let ids: Awaited<ReturnType<typeof seedBaseOrg>>["ids"];

function sessionApp(organizationId: string, userId: string) {
  const { app } = createErrorHarness();
  return app
    .derive(() => ({
      auth: { apiKeyId: null, organizationId, userId, planId: "pro" },
    }))
    .use(segmentsRoutes);
}

function keyApp(scopes: readonly string[]) {
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
    .use(segmentsRoutes);
}

const asReadOnlySession = () => sessionApp(ids.org, READ_ONLY_USER);
const asOwnerSession = () => sessionApp(ids.org, ids.user);
const asReadOnlyKey = () => keyApp(READ_ONLY_PERMISSIONS);
const asFullKey = () => keyApp(FULL_ACCESS_PERMISSIONS);
const asKeyWithoutSegments = () => keyApp(["contacts:read"]);

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

async function seedSegment(name: string) {
  const row = await insertSegment({
    organizationId: ids.org,
    name,
    condition: basicCondition,
  });
  return row.id;
}

async function readSegment(id: string) {
  const [row] = await db.select().from(segment).where(eq(segment.id, id));
  return row ?? null;
}

async function segmentsNamed(name: string) {
  return db
    .select({ id: segment.id })
    .from(segment)
    .where(eq(segment.name, name));
}

async function clearSegments() {
  await db.delete(segment).where(inArray(segment.organizationId, [ids.org]));
}

beforeAll(async () => {
  const fixture = await seedBaseOrg(PREFIX);
  ids = fixture.ids;

  await db
    .insert(user)
    .values({
      id: READ_ONLY_USER,
      email: READ_ONLY_EMAIL,
      name: "Read Only Segments Tester",
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
  await clearSegments();
  // isSelfHosted() reads WRAPS_LICENSE_KEY at call time; an empty value keeps
  // the real plan gate in charge (see segments-api-db.test.ts).
  vi.stubEnv("WRAPS_LICENSE_KEY", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(async () => {
  await clearSegments();
  await db.delete(member).where(eq(member.id, READ_ONLY_MEMBER));
  await db.delete(user).where(eq(user.id, READ_ONLY_USER));
  await cleanupBaseOrg(PREFIX);
});

describe("POST /v1/segments", () => {
  it("refuses a read-only session and creates nothing", async () => {
    const res = await call(asReadOnlySession(), "POST", "/v1/segments", {
      name: "Denied create",
      condition: basicCondition,
    });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: PERMISSION_DENIED });
    expect(await segmentsNamed("Denied create")).toHaveLength(0);
  });

  it("refuses a key without segments:write and creates nothing", async () => {
    const res = await call(asReadOnlyKey(), "POST", "/v1/segments", {
      name: "Denied key create",
      condition: basicCondition,
    });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: PERMISSION_DENIED });
    expect(await segmentsNamed("Denied key create")).toHaveLength(0);
  });

  it("lets an owner session create a segment", async () => {
    const res = await call(asOwnerSession(), "POST", "/v1/segments", {
      name: "Owner create",
      condition: basicCondition,
    });

    expect(res.status).not.toBe(403);
    expect(res.status).toBe(201);
  });

  it("lets a full-access key create a segment", async () => {
    const res = await call(asFullKey(), "POST", "/v1/segments", {
      name: "Key create",
      condition: basicCondition,
    });

    expect(res.status).not.toBe(403);
    expect(res.status).toBe(201);
  });
});

describe("PATCH /v1/segments/:id", () => {
  it("refuses a read-only session and leaves the segment untouched", async () => {
    const id = await seedSegment("Patch target ro");
    const before = await readSegment(id);

    const res = await call(asReadOnlySession(), "PATCH", `/v1/segments/${id}`, {
      name: "Renamed by read-only",
    });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: PERMISSION_DENIED });
    expect(await readSegment(id)).toEqual(before);
  });

  it("refuses a key without segments:write and leaves the segment untouched", async () => {
    const id = await seedSegment("Patch target key ro");
    const before = await readSegment(id);

    const res = await call(asReadOnlyKey(), "PATCH", `/v1/segments/${id}`, {
      name: "Renamed by read-only key",
    });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: PERMISSION_DENIED });
    expect(await readSegment(id)).toEqual(before);
  });

  it("lets an owner session update a segment", async () => {
    const id = await seedSegment("Patch target owner");

    const res = await call(asOwnerSession(), "PATCH", `/v1/segments/${id}`, {
      name: "Renamed by owner",
    });

    expect(res.status).toBe(200);
    expect((await readSegment(id))?.name).toBe("Renamed by owner");
  });

  it("lets a full-access key update a segment", async () => {
    const id = await seedSegment("Patch target key");

    const res = await call(asFullKey(), "PATCH", `/v1/segments/${id}`, {
      name: "Renamed by key",
    });

    expect(res.status).toBe(200);
    expect((await readSegment(id))?.name).toBe("Renamed by key");
  });
});

describe("DELETE /v1/segments/:id", () => {
  it("refuses a read-only session and keeps the segment", async () => {
    const id = await seedSegment("Delete target ro");

    const res = await call(asReadOnlySession(), "DELETE", `/v1/segments/${id}`);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: PERMISSION_DENIED });
    expect(await readSegment(id)).not.toBeNull();
  });

  it("refuses a key without segments:write and keeps the segment", async () => {
    const id = await seedSegment("Delete target key ro");

    const res = await call(asReadOnlyKey(), "DELETE", `/v1/segments/${id}`);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: PERMISSION_DENIED });
    expect(await readSegment(id)).not.toBeNull();
  });

  it("lets an owner session delete a segment", async () => {
    const id = await seedSegment("Delete target owner");

    const res = await call(asOwnerSession(), "DELETE", `/v1/segments/${id}`);

    expect(res.status).toBe(200);
    expect(await readSegment(id)).toBeNull();
  });

  it("lets a full-access key delete a segment", async () => {
    const id = await seedSegment("Delete target key");

    const res = await call(asFullKey(), "DELETE", `/v1/segments/${id}`);

    expect(res.status).toBe(200);
    expect(await readSegment(id)).toBeNull();
  });
});

describe("POST /v1/segments/preview (read)", () => {
  it("lets a read-only session preview, since previewing only reads", async () => {
    const res = await call(
      asReadOnlySession(),
      "POST",
      "/v1/segments/preview",
      {
        condition: basicCondition,
      }
    );

    expect(res.status).toBe(200);
    expect(typeof res.body.count).toBe("number");
  });

  it("lets a read-only key preview", async () => {
    const res = await call(asReadOnlyKey(), "POST", "/v1/segments/preview", {
      condition: basicCondition,
    });

    expect(res.status).toBe(200);
  });

  it("refuses a key without segments:read", async () => {
    const res = await call(
      asKeyWithoutSegments(),
      "POST",
      "/v1/segments/preview",
      {
        condition: basicCondition,
      }
    );

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: PERMISSION_DENIED });
  });
});
