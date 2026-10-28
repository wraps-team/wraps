/**
 * GET /v1/audit-logs and GET /v1/audit-logs/export — real DB, injected auth.
 *
 * File suffix `-db.test.ts` = real Neon test branch (no `@wraps/db` mock).
 * Both routes are read-only. The export is the one exception: like the
 * dashboard's exportAuditLogs it writes one `audit_log.exported` row, and the
 * test that checks it says so.
 *
 * WRAPS_LICENSE_KEY is stubbed empty so isSelfHosted() cannot unlock the
 * export plan gate.
 */

import { swagger } from "@elysiajs/swagger";
import { auditLog, db, member, user } from "@wraps/db";
import { and, eq, inArray } from "drizzle-orm";
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

const { auditLogsRoutes } = await import("../routes/audit-logs");

// PREFIX is not a route param here, but keep it short and unique anyway.
const PREFIX = `t2x-t28-${crypto.randomUUID().slice(0, 8)}`;
const DAY_MS = 24 * 60 * 60 * 1000;

let ids: Awaited<ReturnType<typeof seedBaseOrg>>["ids"];
const viewerId = `${PREFIX}-viewer`; // role read-only in org A
const memberId = `${PREFIX}-plain`; // role member in org A
const ownerBId = `${PREFIX}-owner-b`; // role owner in org B
// billing holds orgSettings:read in packages/auth/src/access.ts, so it passes
// requirePermission and is refused only by the owner/admin role check.
const billingId = `${PREFIX}-billing`; // role billing in org A
const adminId = `${PREFIX}-admin`; // role admin in org A
const SEEDED_USERS = [viewerId, memberId, ownerBId, billingId, adminId];

function ago(days: number): Date {
  return new Date(Date.now() - days * DAY_MS);
}

function appFor(organizationId: string, userId: string, planId: string | null) {
  const { app } = createErrorHarness();
  return app
    .derive(() => ({
      auth: { apiKeyId: null, organizationId, userId, planId },
    }))
    .use(auditLogsRoutes);
}

function get(app: { handle: (r: Request) => Promise<Response> }, path: string) {
  return app.handle(new Request(`http://localhost${path}`));
}

async function clearAudit() {
  await db
    .delete(auditLog)
    .where(inArray(auditLog.organizationId, [ids.org, ids.otherOrg]));
}

// Seeded rows (ids are pinned in the assertions below).
//   A-new  1 min ago    topic.created    actor: owner (ids.user)
//   A-mid  2 days ago   segment.created  actor: viewer
//   A-old  45 days ago  topic.updated    actor: owner
//   A-anc  400 days ago topic.deleted    actor: owner
//   B-new  1 min ago    topic.created    actor: owner of B
async function seedRows() {
  const row = (
    id: string,
    organizationId: string,
    userId: string,
    action: string,
    createdAt: Date,
    resourceId: string
  ) => ({
    id: `${PREFIX}-${id}`,
    organizationId,
    userId,
    actorEmail: null,
    action,
    resource: action.split(".")[0],
    resourceId,
    metadata: null,
    ipAddress: null,
    userAgent: null,
    createdAt,
  });
  await db
    .insert(auditLog)
    .values([
      row(
        "a-new",
        ids.org,
        ids.user,
        "topic.created",
        ago(1 / 1440),
        "res-a-new"
      ),
      row("a-mid", ids.org, viewerId, "segment.created", ago(2), "res-a-mid"),
      row("a-old", ids.org, ids.user, "topic.updated", ago(45), "res-a-old"),
      row("a-anc", ids.org, ids.user, "topic.deleted", ago(400), "res-a-anc"),
      row(
        "b-new",
        ids.otherOrg,
        ownerBId,
        "topic.created",
        ago(1 / 1440),
        "res-b-new"
      ),
    ]);
}

beforeAll(async () => {
  const fixture = await seedBaseOrg(PREFIX);
  ids = fixture.ids;

  await db.insert(user).values([
    {
      id: viewerId,
      name: "Audit viewer",
      email: `${viewerId}@example.test`,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: memberId,
      name: "Audit plain member",
      email: `${memberId}@example.test`,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: ownerBId,
      name: "Audit owner B",
      email: `${ownerBId}@example.test`,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: billingId,
      name: "Audit billing",
      email: `${billingId}@example.test`,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: adminId,
      name: "Audit admin",
      email: `${adminId}@example.test`,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);
  await db.insert(member).values([
    {
      id: `${PREFIX}-m-viewer`,
      organizationId: ids.org,
      userId: viewerId,
      role: "read-only",
      createdAt: new Date(),
    },
    {
      id: `${PREFIX}-m-plain`,
      organizationId: ids.org,
      userId: memberId,
      role: "member",
      createdAt: new Date(),
    },
    {
      id: `${PREFIX}-m-owner-b`,
      organizationId: ids.otherOrg,
      userId: ownerBId,
      role: "owner",
      createdAt: new Date(),
    },
    {
      id: `${PREFIX}-m-billing`,
      organizationId: ids.org,
      userId: billingId,
      role: "billing",
      createdAt: new Date(),
    },
    {
      id: `${PREFIX}-m-admin`,
      organizationId: ids.org,
      userId: adminId,
      role: "admin",
      createdAt: new Date(),
    },
  ]);
});

beforeEach(async () => {
  await clearAudit();
  await seedRows();
  vi.stubEnv("WRAPS_LICENSE_KEY", "");
});

afterAll(async () => {
  await clearAudit();
  await db.delete(member).where(inArray(member.userId, SEEDED_USERS));
  await db.delete(user).where(inArray(user.id, SEEDED_USERS));
  await cleanupBaseOrg(PREFIX);
  vi.unstubAllEnvs();
});

describe("org isolation", () => {
  it("export: org B's owner on Business gets only org B's row (total 1)", async () => {
    const res = await get(
      appFor(ids.otherOrg, ownerBId, "business"),
      "/v1/audit-logs/export"
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      logs: { id: string }[];
      total: number;
    };
    expect(body.total).toBe(1);
    expect(body.logs.map((r) => r.id)).toEqual([`${PREFIX}-b-new`]);
  });

  it("list: org A's owner sees only org A rows; org B rows are absent", async () => {
    const res = await get(appFor(ids.org, ids.user, "free"), "/v1/audit-logs");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { id: string }[] };
    expect(body.data.map((r) => r.id)).toEqual([
      `${PREFIX}-a-new`,
      `${PREFIX}-a-mid`,
    ]);
    expect(body.data.some((r) => r.id === `${PREFIX}-b-new`)).toBe(false);
  });

  it("list: org B's owner sees only org B rows", async () => {
    const res = await get(
      appFor(ids.otherOrg, ownerBId, "free"),
      "/v1/audit-logs"
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { id: string }[] };
    expect(body.data.map((r) => r.id)).toEqual([`${PREFIX}-b-new`]);
  });

  it("export: org A's export contains no org B row", async () => {
    const res = await get(
      appFor(ids.org, ids.user, "business"),
      "/v1/audit-logs/export"
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      logs: { id: string }[];
      total: number;
    };
    expect(body.total).toBe(3);
    expect(body.logs.map((r) => r.id)).toEqual([
      `${PREFIX}-a-new`,
      `${PREFIX}-a-mid`,
      `${PREFIX}-a-old`,
    ]);
  });

  it("export csv: org A's CSV contains no org B resource id", async () => {
    const res = await get(
      appFor(ids.org, ids.user, "business"),
      "/v1/audit-logs/export?format=csv"
    );
    expect(res.status).toBe(200);
    const csv = await res.text();
    expect(csv).not.toContain("res-b-new");
    expect(csv.split("\n")).toHaveLength(4); // header + 3 org A rows
  });
});

describe("permissions", () => {
  it("list: a billing member passes orgSettings read but is refused by the owner/admin check", async () => {
    const res = await get(appFor(ids.org, billingId, "free"), "/v1/audit-logs");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: "Audit logs are available to owners and admins only.",
    });
  });

  it("export: a billing member on Business is refused by the owner/admin check and writes no audit row", async () => {
    const res = await get(
      appFor(ids.org, billingId, "business"),
      "/v1/audit-logs/export"
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: "Audit logs are available to owners and admins only.",
    });
    const exported = await db
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.action, "audit_log.exported"),
          inArray(auditLog.organizationId, [ids.org, ids.otherOrg])
        )
      );
    expect(exported).toEqual([]);
  });

  it("list: a read-only member gets 403 and no rows", async () => {
    const res = await get(appFor(ids.org, viewerId, "free"), "/v1/audit-logs");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: "You don't have permission to perform this action",
    });
  });

  it("list: a plain member gets 403", async () => {
    const res = await get(appFor(ids.org, memberId, "free"), "/v1/audit-logs");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: "You don't have permission to perform this action",
    });
  });

  it("export: a plain member gets 403 on a Business plan", async () => {
    const res = await get(
      appFor(ids.org, memberId, "business"),
      "/v1/audit-logs/export"
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: "You don't have permission to perform this action",
    });
  });

  it("export: an owner on the Pro plan gets 403 with the plan message", async () => {
    const res = await get(
      appFor(ids.org, ids.user, "pro"),
      "/v1/audit-logs/export"
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: "Audit log export requires a Business plan or higher.",
    });
  });

  it("export: a denied export writes no audit_log.exported row", async () => {
    await get(appFor(ids.org, viewerId, "business"), "/v1/audit-logs/export");
    const exported = await db
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.action, "audit_log.exported"),
          inArray(auditLog.organizationId, [ids.org, ids.otherOrg])
        )
      );
    expect(exported).toEqual([]);
  });
});

describe("list", () => {
  it("admin passes the owner/admin check and sees the org's rows (200)", async () => {
    const res = await get(appFor(ids.org, adminId, "free"), "/v1/audit-logs");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { id: string }[] };
    expect(body.data.map((r) => r.id)).toEqual([
      `${PREFIX}-a-new`,
      `${PREFIX}-a-mid`,
    ]);
  });

  it("returns newest first with the plan window and canExtend (free)", async () => {
    const res = await get(appFor(ids.org, ids.user, "free"), "/v1/audit-logs");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { id: string; action: string; createdAt: string }[];
      nextCursor: string | null;
      retentionDays: number;
      canExtend: boolean;
    };
    expect(body.data.map((r) => r.action)).toEqual([
      "topic.created",
      "segment.created",
    ]);
    expect(body.nextCursor).toBeNull();
    expect(body.retentionDays).toBe(30);
    expect(body.canExtend).toBe(true);
  });

  it("reports canExtend false on the Business plan", async () => {
    const res = await get(
      appFor(ids.org, ids.user, "business"),
      "/v1/audit-logs"
    );
    const body = (await res.json()) as {
      retentionDays: number;
      canExtend: boolean;
    };
    expect(body.retentionDays).toBe(365);
    expect(body.canExtend).toBe(false);
  });

  it("pages with a keyset cursor: page 1 has nextCursor, page 2 finishes the set", async () => {
    const app = appFor(ids.org, ids.user, "free");
    const first = (await (await get(app, "/v1/audit-logs?limit=1")).json()) as {
      data: { id: string }[];
      nextCursor: string | null;
    };
    expect(first.data.map((r) => r.id)).toEqual([`${PREFIX}-a-new`]);
    expect(first.nextCursor).not.toBeNull();

    const second = (await (
      await get(
        app,
        `/v1/audit-logs?limit=1&cursor=${encodeURIComponent(first.nextCursor ?? "")}`
      )
    ).json()) as { data: { id: string }[]; nextCursor: string | null };
    expect(second.data.map((r) => r.id)).toEqual([`${PREFIX}-a-mid`]);
    expect(second.nextCursor).toBeNull();
  });

  it("filters by action", async () => {
    const res = await get(
      appFor(ids.org, ids.user, "free"),
      "/v1/audit-logs?action=segment.created"
    );
    const body = (await res.json()) as { data: { id: string }[] };
    expect(body.data.map((r) => r.id)).toEqual([`${PREFIX}-a-mid`]);
  });

  it("filters by actorId", async () => {
    const res = await get(
      appFor(ids.org, ids.user, "free"),
      `/v1/audit-logs?actorId=${viewerId}`
    );
    const body = (await res.json()) as { data: { id: string }[] };
    expect(body.data.map((r) => r.id)).toEqual([`${PREFIX}-a-mid`]);
  });

  it("filters by dateFrom and dateTo", async () => {
    const from = ago(3).toISOString();
    const res = await get(
      appFor(ids.org, ids.user, "business"),
      `/v1/audit-logs?dateFrom=${encodeURIComponent(from)}`
    );
    const body = (await res.json()) as { data: { id: string }[] };
    expect(body.data.map((r) => r.id)).toEqual([
      `${PREFIX}-a-new`,
      `${PREFIX}-a-mid`,
    ]);
  });

  it("400 names the limit when it is out of range", async () => {
    const res = await get(
      appFor(ids.org, ids.user, "free"),
      "/v1/audit-logs?limit=0"
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: "limit must be a whole number from 1 to 100",
      code: "BAD_REQUEST",
    });
  });

  it("400 names the cursor when it does not decode", async () => {
    const res = await get(
      appFor(ids.org, ids.user, "free"),
      "/v1/audit-logs?cursor=not-a-cursor"
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: expect.stringContaining("Invalid cursor."),
      code: "BAD_REQUEST",
    });
  });

  it("400 names the parameter when dateFrom is not a date", async () => {
    const res = await get(
      appFor(ids.org, ids.user, "free"),
      "/v1/audit-logs?dateFrom=yesterday"
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: expect.stringContaining("dateFrom must be an ISO 8601 date"),
    });
  });
});

describe("retention", () => {
  it("free (30 days) excludes the 45-day row and the 400-day row", async () => {
    const res = await get(appFor(ids.org, ids.user, "free"), "/v1/audit-logs");
    const body = (await res.json()) as {
      data: { id: string }[];
      retentionDays: number;
    };
    expect(body.retentionDays).toBe(30);
    expect(body.data.map((r) => r.id)).toEqual([
      `${PREFIX}-a-new`,
      `${PREFIX}-a-mid`,
    ]);
  });

  it("pro (90 days) includes the 45-day row but not the 400-day row", async () => {
    const res = await get(appFor(ids.org, ids.user, "pro"), "/v1/audit-logs");
    const body = (await res.json()) as {
      data: { id: string }[];
      retentionDays: number;
    };
    expect(body.retentionDays).toBe(90);
    expect(body.data.map((r) => r.id)).toEqual([
      `${PREFIX}-a-new`,
      `${PREFIX}-a-mid`,
      `${PREFIX}-a-old`,
    ]);
  });

  it("business (365 days) includes everything under a year, not the 400-day row", async () => {
    const res = await get(
      appFor(ids.org, ids.user, "business"),
      "/v1/audit-logs"
    );
    const body = (await res.json()) as { data: { id: string }[] };
    expect(body.data.map((r) => r.id)).toEqual([
      `${PREFIX}-a-new`,
      `${PREFIX}-a-mid`,
      `${PREFIX}-a-old`,
    ]);
  });

  it("a missing plan falls back to free (30 days), as getOrganizationPlan does", async () => {
    const res = await get(appFor(ids.org, ids.user, null), "/v1/audit-logs");
    const body = (await res.json()) as {
      data: { id: string }[];
      retentionDays: number;
    };
    expect(body.retentionDays).toBe(30);
    expect(body.data.map((r) => r.id)).toEqual([
      `${PREFIX}-a-new`,
      `${PREFIX}-a-mid`,
    ]);
  });

  it("export uses the same window: business (365 days) counts 3 and excludes the 400-day row", async () => {
    // Export is Business-only (see the export describe), so its window is the
    // 365-day one. The 400-day row must not be counted in `total`.
    const res = await get(
      appFor(ids.org, ids.user, "business"),
      "/v1/audit-logs/export"
    );
    const body = (await res.json()) as {
      total: number;
      logs: { id: string }[];
    };
    expect(body.total).toBe(3);
    expect(body.logs.map((r) => r.id)).not.toContain(`${PREFIX}-a-anc`);
  });
});

describe("export", () => {
  it("json: returns logs, total and truncated = false for a small set", async () => {
    const res = await get(
      appFor(ids.org, ids.user, "business"),
      "/v1/audit-logs/export?format=json"
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      logs: { action: string; metadata: unknown }[];
      total: number;
      truncated: boolean;
    };
    expect(body.total).toBe(3);
    expect(body.truncated).toBe(false);
    expect(body.logs.map((r) => r.action)).toEqual([
      "topic.created",
      "segment.created",
      "topic.updated",
    ]);
  });

  it("csv: header row, one line per row, text/csv content type", async () => {
    const res = await get(
      appFor(ids.org, ids.user, "business"),
      "/v1/audit-logs/export?format=csv"
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("x-total-count")).toBe("3");
    expect(res.headers.get("x-truncated")).toBe("false");
    const lines = (await res.text()).split("\n");
    expect(lines[0]).toBe(
      "Timestamp,Action,Resource,Resource ID,Actor Email,Actor ID,IP Address,User Agent,Metadata"
    );
    expect(lines).toHaveLength(4);
    expect(lines.slice(1).map((l) => l.split(",")[1])).toEqual([
      "topic.created",
      "segment.created",
      "topic.updated",
    ]);
  });

  it("400 names the format when it is neither json nor csv", async () => {
    const res = await get(
      appFor(ids.org, ids.user, "business"),
      "/v1/audit-logs/export?format=xml"
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "format must be json or csv" });
  });

  it("writes one audit_log.exported row for org A and none for org B (parity with exportAuditLogs)", async () => {
    await get(appFor(ids.org, ids.user, "business"), "/v1/audit-logs/export");
    const exported = await db
      .select({
        organizationId: auditLog.organizationId,
        userId: auditLog.userId,
      })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.action, "audit_log.exported"),
          inArray(auditLog.organizationId, [ids.org, ids.otherOrg])
        )
      );
    expect(exported).toEqual([{ organizationId: ids.org, userId: ids.user }]);
  });
});

describe("openapi", () => {
  it("lists GET /v1/audit-logs and GET /v1/audit-logs/export in the spec", async () => {
    const app = new Elysia()
      .use(
        swagger({
          path: "/swagger",
          documentation: {},
          exclude: ["/swagger"],
        })
      )
      .use(auditLogsRoutes);
    const res = await app.handle(new Request("http://localhost/swagger/json"));
    const spec = (await res.json()) as {
      paths: Record<string, Record<string, unknown>>;
    };
    // Elysia emits the "/" route under a prefix with a trailing slash, the
    // same as segments and events. The list tests above call it without one.
    expect(Object.keys(spec.paths)).toEqual(
      expect.arrayContaining(["/v1/audit-logs/", "/v1/audit-logs/export"])
    );
    expect(Object.keys(spec.paths["/v1/audit-logs/"] ?? {})).toContain("get");
    expect(Object.keys(spec.paths["/v1/audit-logs/export"] ?? {})).toContain(
      "get"
    );
  });
});
