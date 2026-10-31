/**
 * GET/POST/PATCH/DELETE /v1/brand-kits and POST /v1/brand-kits/:id/default on
 * the real route stack: real DB, real permission gate, real audit rows.
 *
 * File suffix `-db.test.ts` = real Neon test branch (no `@wraps/db` mocks).
 */

import { swagger } from "@elysiajs/swagger";
import { auditLog, brandKit, db, member, template, user } from "@wraps/db";
import { eq, inArray } from "drizzle-orm";
import { Elysia } from "elysia";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  cleanupBaseOrg,
  seedBaseOrg,
} from "../(ee)/__tests__/fixtures/real-db";
import { createErrorHarness } from "./error-handler-harness";

const { brandKitsRoutes } = await import("../routes/brand-kits");

// PREFIX doubles as a route param (`id: t.String({ maxLength: 36 })`), so it
// stays short: "t3-B1a-" (7) + 8 random chars.
const PREFIX = `t3-B1a-${crypto.randomUUID().slice(0, 8)}`;

const READ_ONLY_USER = `${PREFIX}-ro-user`;
const READ_ONLY_MEMBER = `${PREFIX}-ro-member`;
const READ_ONLY_EMAIL = `${PREFIX}-ro@example.com`;

const PERMISSION_DENIED = "You don't have permission to perform this action";

let ids: Awaited<ReturnType<typeof seedBaseOrg>>["ids"];

function appFor(organizationId: string, userId: string) {
  const { app } = createErrorHarness();
  return app
    .derive(() => ({
      auth: { apiKeyId: null, organizationId, userId, planId: "pro" },
    }))
    .use(brandKitsRoutes);
}

function unauthedApp() {
  const { app } = createErrorHarness();
  return app.use(brandKitsRoutes);
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

async function insertKit(
  organizationId: string,
  overrides: Partial<typeof brandKit.$inferInsert> & { id: string }
) {
  await db.insert(brandKit).values({
    organizationId,
    name: `Kit ${overrides.id}`,
    ...overrides,
  });
  return overrides.id;
}

async function readKit(id: string) {
  const [row] = await db.select().from(brandKit).where(eq(brandKit.id, id));
  return row ?? null;
}

async function clearBrandKitState() {
  const orgs = [ids.org, ids.otherOrg];
  await db.delete(auditLog).where(inArray(auditLog.organizationId, orgs));
  await db.delete(template).where(inArray(template.organizationId, orgs));
  await db.delete(brandKit).where(inArray(brandKit.organizationId, orgs));
}

beforeAll(async () => {
  const fixture = await seedBaseOrg(PREFIX);
  ids = fixture.ids;

  await db
    .insert(user)
    .values({
      id: READ_ONLY_USER,
      email: READ_ONLY_EMAIL,
      name: "Read Only Brand Kit Tester",
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
  await clearBrandKitState();
});

afterAll(async () => {
  await clearBrandKitState();
  await db.delete(member).where(eq(member.id, READ_ONLY_MEMBER));
  await db.delete(user).where(eq(user.id, READ_ONLY_USER));
  await cleanupBaseOrg(PREFIX);
});

describe("auth", () => {
  it("returns 401 with no auth header", async () => {
    const res = await call(unauthedApp(), "GET", "/v1/brand-kits");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Unauthorized");
  });
});

describe("CRUD", () => {
  it("first kit becomes default, trims the name, and writes a brand_kit.created audit row", async () => {
    const res = await call(asOwner(), "POST", "/v1/brand-kits", {
      name: "  Acme  ",
      primaryColor: "#112233",
    });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Acme");
    expect(res.body.isDefault).toBe(true);
    expect(res.body.primaryColor).toBe("#112233");
    expect(res.body.secondaryColor).toBe("#6366f1");
    expect(res.body.buttonStyle).toBe("rounded");
    expect(res.body.socialLinks).toEqual([]);
    expect(res.body.organizationId).toBe(ids.org);

    const rows = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "brand_kit.created"));
    const mine = rows.filter((r) => r.organizationId === ids.org);
    expect(mine).toHaveLength(1);
    expect(mine[0].resourceId).toBe(res.body.id);
    expect(mine[0].userId).toBe(ids.user);
    expect(mine[0].resource).toBe("brand_kit");
    expect(mine[0].metadata).toEqual({ brandKitId: res.body.id, name: "Acme" });
  });

  it("a later kit is not default unless isDefault is true, which clears the old default", async () => {
    const first = await call(asOwner(), "POST", "/v1/brand-kits", {
      name: "First",
    });
    const second = await call(asOwner(), "POST", "/v1/brand-kits", {
      name: "Second",
    });
    expect(second.body.isDefault).toBe(false);

    const third = await call(asOwner(), "POST", "/v1/brand-kits", {
      name: "Third",
      isDefault: true,
    });
    expect(third.body.isDefault).toBe(true);

    expect((await readKit(first.body.id))?.isDefault).toBe(false);
    expect((await readKit(second.body.id))?.isDefault).toBe(false);
    expect((await readKit(third.body.id))?.isDefault).toBe(true);
  });

  it("a blank name becomes 'Untitled Brand Kit' on create, as the handler does", async () => {
    const res = await call(asOwner(), "POST", "/v1/brand-kits", {
      name: "   ",
    });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Untitled Brand Kit");
  });

  it("list returns the default first, then most recently updated, and pins the count", async () => {
    const older = new Date("2026-01-01T00:00:00Z");
    const newer = new Date("2026-06-01T00:00:00Z");
    const newest = new Date("2026-09-01T00:00:00Z");
    const dflt = await insertKit(ids.org, {
      id: `${PREFIX}-k-dflt`,
      isDefault: true,
      updatedAt: older,
    });
    const mid = await insertKit(ids.org, {
      id: `${PREFIX}-k-mid`,
      updatedAt: newer,
    });
    const top = await insertKit(ids.org, {
      id: `${PREFIX}-k-top`,
      updatedAt: newest,
    });

    const res = await call(asOwner(), "GET", "/v1/brand-kits");
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(3);
    expect(res.body.brandKits.map((k: { id: string }) => k.id)).toEqual([
      dflt,
      top,
      mid,
    ]);
  });

  it("GET one returns the kit, and an unknown id is 404 with the not-found text", async () => {
    const id = await insertKit(ids.org, {
      id: `${PREFIX}-k-one`,
      name: "One",
      companyName: "Acme Co",
    });

    const ok = await call(asOwner(), "GET", `/v1/brand-kits/${id}`);
    expect(ok.status).toBe(200);
    expect(ok.body.id).toBe(id);
    expect(ok.body.name).toBe("One");
    expect(ok.body.companyName).toBe("Acme Co");

    const missing = await call(
      asOwner(),
      "GET",
      `/v1/brand-kits/${PREFIX}-k-nope`
    );
    expect(missing.status).toBe(404);
    expect(missing.body.error).toBe("Brand kit not found");
  });

  it("PATCH changes only the fields sent and clears a logo with an empty string", async () => {
    const id = await insertKit(ids.org, {
      id: `${PREFIX}-k-patch`,
      name: "Old",
      primaryColor: "#aaaaaa",
      textColor: "#bbbbbb",
      logoUrl: "https://example.com/logo.png",
      isDefault: true,
    });

    const res = await call(asOwner(), "PATCH", `/v1/brand-kits/${id}`, {
      name: "New",
      textColor: "#000000",
      logoUrl: "",
    });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("New");
    expect(res.body.textColor).toBe("#000000");
    expect(res.body.primaryColor).toBe("#aaaaaa");
    expect(res.body.logoUrl).toBeNull();
    expect(res.body.isDefault).toBe(true);

    const rows = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "brand_kit.updated"));
    expect(rows.filter((r) => r.organizationId === ids.org)).toHaveLength(1);
  });

  it("PATCH with a blank name is 400 naming the name and leaves the row alone", async () => {
    const id = await insertKit(ids.org, {
      id: `${PREFIX}-k-blank`,
      name: "Keep Me",
    });
    const before = await readKit(id);

    const res = await call(asOwner(), "PATCH", `/v1/brand-kits/${id}`, {
      name: "   ",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Brand kit name cannot be empty");
    expect(await readKit(id)).toEqual(before);
  });

  it("POST with a socialLinks entry that has no url is 400 naming socialLinks and creates nothing", async () => {
    const res = await call(asOwner(), "POST", "/v1/brand-kits", {
      name: "Links",
      socialLinks: [{ platform: "x", url: "   " }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(
      "socialLinks entries need a non-empty platform and url"
    );
    expect(
      await db
        .select({ id: brandKit.id })
        .from(brandKit)
        .where(eq(brandKit.organizationId, ids.org))
    ).toHaveLength(0);
  });

  it("POST /:id/default makes the kit the only default and writes brand_kit.set_default", async () => {
    const dflt = await insertKit(ids.org, {
      id: `${PREFIX}-k-old-d`,
      isDefault: true,
    });
    const other = await insertKit(ids.org, {
      id: `${PREFIX}-k-new-d`,
      isDefault: false,
    });

    const res = await call(
      asOwner(),
      "POST",
      `/v1/brand-kits/${other}/default`
    );
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(other);
    expect(res.body.isDefault).toBe(true);
    expect((await readKit(dflt))?.isDefault).toBe(false);
    expect((await readKit(other))?.isDefault).toBe(true);

    const rows = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "brand_kit.set_default"));
    const mine = rows.filter((r) => r.organizationId === ids.org);
    expect(mine).toHaveLength(1);
    expect(mine[0].resourceId).toBe(other);
  });

  it("DELETE without confirm=true, or with confirm=false, is 400 and the kit survives", async () => {
    const id = await insertKit(ids.org, { id: `${PREFIX}-k-noconf` });
    const before = await readKit(id);

    const none = await call(asOwner(), "DELETE", `/v1/brand-kits/${id}`);
    expect(none.status).toBe(400);
    expect(none.body.error).toContain(
      "Confirmation required: pass confirm=true to delete this brand kit"
    );

    const no = await call(
      asOwner(),
      "DELETE",
      `/v1/brand-kits/${id}?confirm=false`
    );
    expect(no.status).toBe(400);
    expect(no.body.error).toContain("Confirmation required");

    expect(await readKit(id)).toEqual(before);
  });

  it("DELETE with confirm=true removes a non-default kit and leaves the default alone", async () => {
    const dflt = await insertKit(ids.org, {
      id: `${PREFIX}-k-keep-d`,
      isDefault: true,
    });
    const gone = await insertKit(ids.org, {
      id: `${PREFIX}-k-drop`,
      name: "Dropped",
    });

    const res = await call(
      asOwner(),
      "DELETE",
      `/v1/brand-kits/${gone}?confirm=true`
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(await readKit(gone)).toBeNull();
    expect((await readKit(dflt))?.isDefault).toBe(true);

    const rows = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "brand_kit.deleted"));
    const mine = rows.filter((r) => r.organizationId === ids.org);
    expect(mine).toHaveLength(1);
    expect(mine[0].metadata).toEqual({ brandKitId: gone, name: "Dropped" });
  });

  it("deleting the default promotes the remaining kit so exactly one default is left", async () => {
    const dflt = await insertKit(ids.org, {
      id: `${PREFIX}-k-del-d`,
      isDefault: true,
    });
    const rest = await insertKit(ids.org, { id: `${PREFIX}-k-rest` });

    const res = await call(
      asOwner(),
      "DELETE",
      `/v1/brand-kits/${dflt}?confirm=true`
    );
    expect(res.status).toBe(200);
    expect(await readKit(dflt)).toBeNull();
    expect((await readKit(rest))?.isDefault).toBe(true);
  });

  it("deleting the last kit succeeds and leaves the org with no kits", async () => {
    const only = await insertKit(ids.org, {
      id: `${PREFIX}-k-only`,
      isDefault: true,
    });

    const res = await call(
      asOwner(),
      "DELETE",
      `/v1/brand-kits/${only}?confirm=true`
    );
    expect(res.status).toBe(200);

    const list = await call(asOwner(), "GET", "/v1/brand-kits");
    expect(list.body).toEqual({ brandKits: [], count: 0 });
  });

  it("deleting a kit a template used clears template.brandKitId and keeps the template", async () => {
    const kit = await insertKit(ids.org, {
      id: `${PREFIX}-k-fk`,
      isDefault: true,
    });
    const tplId = `${PREFIX}-tpl-fk`;
    await db.insert(template).values({
      id: tplId,
      organizationId: ids.org,
      name: "Uses a kit",
      content: {},
      brandKitId: kit,
    });

    const res = await call(
      asOwner(),
      "DELETE",
      `/v1/brand-kits/${kit}?confirm=true`
    );
    expect(res.status).toBe(200);

    const [tpl] = await db
      .select({ id: template.id, brandKitId: template.brandKitId })
      .from(template)
      .where(eq(template.id, tplId));
    expect(tpl).toEqual({ id: tplId, brandKitId: null });
  });
});

describe("org isolation", () => {
  it("list shows only org A's kits, never org B's", async () => {
    const aKit = await insertKit(ids.org, { id: `${PREFIX}-a-list` });
    const bKit = await insertKit(ids.otherOrg, {
      id: `${PREFIX}-b-list`,
      isDefault: true,
    });

    const res = await call(asOwner(), "GET", "/v1/brand-kits");
    expect(res.status).toBe(200);
    const listedIds = res.body.brandKits.map((k: { id: string }) => k.id);
    expect(listedIds).toContain(aKit);
    expect(listedIds).not.toContain(bKit);
    expect(res.body.count).toBe(1);
  });

  it("get-by-id of an org B kit is 404", async () => {
    const bKit = await insertKit(ids.otherOrg, { id: `${PREFIX}-b-get` });
    const res = await call(asOwner(), "GET", `/v1/brand-kits/${bKit}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Brand kit not found");
  });

  it("PATCH of an org B kit is 404 and the B row is unchanged", async () => {
    const bKit = await insertKit(ids.otherOrg, {
      id: `${PREFIX}-b-patch`,
      name: "B stable",
      isDefault: true,
    });
    const before = await readKit(bKit);

    const res = await call(asOwner(), "PATCH", `/v1/brand-kits/${bKit}`, {
      name: "Hijacked",
    });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Brand kit not found");
    expect(await readKit(bKit)).toEqual(before);
  });

  it("POST default of an org B kit is 404 and B's default is untouched", async () => {
    const bDefault = await insertKit(ids.otherOrg, {
      id: `${PREFIX}-b-def-1`,
      isDefault: true,
    });
    const bOther = await insertKit(ids.otherOrg, {
      id: `${PREFIX}-b-def-2`,
      isDefault: false,
    });
    const beforeDefault = await readKit(bDefault);
    const beforeOther = await readKit(bOther);

    const res = await call(
      asOwner(),
      "POST",
      `/v1/brand-kits/${bOther}/default`
    );
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Brand kit not found");
    expect(await readKit(bDefault)).toEqual(beforeDefault);
    expect(await readKit(bOther)).toEqual(beforeOther);
    expect((await readKit(bOther))?.isDefault).toBe(false);
  });

  it("DELETE of an org B kit with confirm=true is 404 and the B row survives", async () => {
    const bKit = await insertKit(ids.otherOrg, {
      id: `${PREFIX}-b-del`,
      isDefault: true,
    });
    const before = await readKit(bKit);

    const res = await call(
      asOwner(),
      "DELETE",
      `/v1/brand-kits/${bKit}?confirm=true`
    );
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Brand kit not found");
    expect(await readKit(bKit)).toEqual(before);
  });

  it("creating a default kit in org A does not clear org B's default", async () => {
    await insertKit(ids.org, { id: `${PREFIX}-a-exists` });
    const bDefault = await insertKit(ids.otherOrg, {
      id: `${PREFIX}-b-keep-d`,
      isDefault: true,
    });
    const before = await readKit(bDefault);

    const res = await call(asOwner(), "POST", "/v1/brand-kits", {
      name: "A new default",
      isDefault: true,
    });
    expect(res.status).toBe(201);
    expect(res.body.isDefault).toBe(true);
    expect(await readKit(bDefault)).toEqual(before);
  });
});

describe("permissions", () => {
  it("a read-only member can read the list and one kit", async () => {
    const id = await insertKit(ids.org, { id: `${PREFIX}-ro-read` });

    expect((await call(asReadOnly(), "GET", "/v1/brand-kits")).status).toBe(
      200
    );
    expect(
      (await call(asReadOnly(), "GET", `/v1/brand-kits/${id}`)).status
    ).toBe(200);
  });

  it("a read-only member's POST is 403 and creates nothing", async () => {
    const res = await call(asReadOnly(), "POST", "/v1/brand-kits", {
      name: "Sneaky",
    });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe(PERMISSION_DENIED);
    expect(
      await db
        .select({ id: brandKit.id })
        .from(brandKit)
        .where(eq(brandKit.organizationId, ids.org))
    ).toHaveLength(0);
  });

  it("a read-only member's PATCH is 403 and the row is unchanged", async () => {
    const id = await insertKit(ids.org, {
      id: `${PREFIX}-ro-patch`,
      name: "Stable Name",
    });
    const before = await readKit(id);

    const res = await call(asReadOnly(), "PATCH", `/v1/brand-kits/${id}`, {
      name: "Changed",
    });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe(PERMISSION_DENIED);
    expect(await readKit(id)).toEqual(before);
  });

  it("a read-only member's DELETE is 403 even with confirm=true and the row survives", async () => {
    const id = await insertKit(ids.org, { id: `${PREFIX}-ro-del` });
    const before = await readKit(id);

    const res = await call(
      asReadOnly(),
      "DELETE",
      `/v1/brand-kits/${id}?confirm=true`
    );
    expect(res.status).toBe(403);
    expect(res.body.error).toBe(PERMISSION_DENIED);
    expect(await readKit(id)).toEqual(before);
  });

  it("a read-only member's POST /:id/default is 403 and the default does not move", async () => {
    const dflt = await insertKit(ids.org, {
      id: `${PREFIX}-ro-def-1`,
      isDefault: true,
    });
    const other = await insertKit(ids.org, { id: `${PREFIX}-ro-def-2` });
    const beforeDefault = await readKit(dflt);
    const beforeOther = await readKit(other);

    const res = await call(
      asReadOnly(),
      "POST",
      `/v1/brand-kits/${other}/default`
    );
    expect(res.status).toBe(403);
    expect(res.body.error).toBe(PERMISSION_DENIED);
    expect(await readKit(dflt)).toEqual(beforeDefault);
    expect(await readKit(other)).toEqual(beforeOther);
  });
});

describe("openapi", () => {
  it("publishes every brand-kits path and method in the spec", async () => {
    const app = new Elysia()
      .use(
        swagger({
          path: "/swagger",
          documentation: {},
          exclude: ["/swagger", "/swagger/json"],
        })
      )
      .use(brandKitsRoutes);

    const res = await app.handle(new Request("http://localhost/swagger/json"));
    expect(res.status).toBe(200);
    const spec = (await res.json()) as {
      paths: Record<string, Record<string, unknown>>;
    };

    // Elysia keys a prefix-root route with a trailing slash.
    expect(Object.keys(spec.paths["/v1/brand-kits/"] ?? {}).sort()).toEqual([
      "get",
      "post",
    ]);
    expect(Object.keys(spec.paths["/v1/brand-kits/{id}"] ?? {}).sort()).toEqual(
      ["delete", "get", "patch"]
    );
    expect(
      Object.keys(spec.paths["/v1/brand-kits/{id}/default"] ?? {})
    ).toEqual(["post"]);
  });
});
