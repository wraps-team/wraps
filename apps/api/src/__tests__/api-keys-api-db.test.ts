/**
 * /v1/api-keys on the combined app: list, create, revoke. Session-only (D1).
 *
 * File suffix `-db.test.ts` = real Neon test branch (no `@wraps/db` mocks).
 * The key and session paths run the REAL `authenticate()` (no injected auth)
 * wherever a test is about how a credential is classified. Injected auth is
 * used only where the test is about the route's own gates.
 *
 * Mocked: `@wraps/auth/notify` (sends email and SMS to org admins).
 */

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { swagger } from "@elysiajs/swagger";
import { apiKey, auditLog, db, member, session, user } from "@wraps/db";
import { eq, inArray } from "drizzle-orm";
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
import { injectErrorResponses } from "../lib/openapi-errors";
import { errorContract } from "../middleware/error-contract";
import { createErrorHarness } from "./error-handler-harness";

const { mockNotifyOrg } = vi.hoisted(() => ({
  mockNotifyOrg: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@wraps/auth/notify", () => ({
  notifyOrg: (...args: unknown[]) => mockNotifyOrg(...args),
}));

const { apiKeysRoutes } = await import("../routes/api-keys");
const { contactsRoutes } = await import("../routes/contacts");
const { READ_ONLY_PERMISSIONS } = await import("../services/api-keys");

// PREFIX is also used inside path params (`id: t.String({ maxLength: 36 })`),
// so it stays short. Node T2.7a: `t2x-t27-` + 8 random chars.
const PREFIX = `t2x-t27-${randomUUID().replace(/-/g, "").slice(0, 8)}`;

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const randomHex = (bytes: number) => randomBytes(bytes).toString("hex");

const ids = (() => {
  const prefix = PREFIX;
  return {
    keyA: `${prefix}-keya`,
    keyB: `${prefix}-keyb`,
    keyRevoke: `${prefix}-keyr`,
    roUser: `${prefix}-ro`,
    roMember: `${prefix}-ro-m`,
    session: `${prefix}-sess`,
    stranger: `${prefix}-stranger`,
  };
})();

// Real keys, minted in the same shape generateApiKey() produces (wraps_live_ + 32 chars).
const RAW_KEY_A = `wraps_live_${randomHex(16)}`;
const RAW_KEY_B = `wraps_live_${randomHex(16)}`;
const RAW_KEY_REVOKE = `wraps_live_${randomHex(16)}`;
const SESSION_TOKEN = `t2x27sess${randomHex(12)}`;

let base: Awaited<ReturnType<typeof seedBaseOrg>>;

const OWNER_ID = () => base.ids.user;
const ORG_A = () => base.ids.org;
const ORG_B = () => base.ids.otherOrg;

async function insertKeyRow(args: {
  id: string;
  organizationId: string;
  rawKey: string;
  createdBy: string;
  name?: string;
}) {
  await db.insert(apiKey).values({
    id: args.id,
    organizationId: args.organizationId,
    name: args.name ?? args.id,
    keyHash: sha256(args.rawKey),
    prefix: `${args.rawKey.slice(0, 19)}...`,
    permissions: [],
    createdBy: args.createdBy,
  });
}

async function apiKeyRows(organizationId: string) {
  return db.query.apiKey.findMany({
    where: (k, { eq: eqOp }) => eqOp(k.organizationId, organizationId),
  });
}

/** Injected-auth app: the route under test with `auth` set by the test. */
function appFor(auth: {
  apiKeyId: string | null;
  organizationId: string;
  userId: string | null;
}) {
  return createErrorHarness()
    .app.use(errorContract)
    .derive(() => ({
      auth: { ...auth, planId: "pro" },
    }))
    .use(apiKeysRoutes);
}

/** Real authenticate(): no derive, so the bearer decides who the caller is. */
function realKeysApp() {
  return createErrorHarness().app.use(errorContract).use(apiKeysRoutes);
}

function realContactsApp() {
  return createErrorHarness().app.use(errorContract).use(contactsRoutes);
}

function ownerApp(apiKeyId: string | null = null) {
  return appFor({
    apiKeyId,
    organizationId: ORG_A(),
    userId: OWNER_ID(),
  });
}

function bearer(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

function jsonHeaders(token?: string): Record<string, string> {
  return {
    "content-type": "application/json",
    ...(token ? bearer(token) : {}),
  };
}

const KEY_FIELDS = [
  "createdAt",
  "createdBy",
  "expiresAt",
  "id",
  "lastUsedAt",
  "name",
  "permissions",
  "prefix",
];

beforeAll(async () => {
  base = await seedBaseOrg(PREFIX);
  const now = new Date();

  // A read-only member of org A: may read keys, may not write them.
  await db.insert(user).values({
    id: ids.roUser,
    email: `${PREFIX}-ro@example.com`,
    name: "Read Only Member",
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
    image: null,
  } as typeof user.$inferInsert);
  await db.insert(member).values({
    id: ids.roMember,
    organizationId: ORG_A(),
    userId: ids.roUser,
    role: "read-only",
    createdAt: now,
  } as typeof member.$inferInsert);

  await insertKeyRow({
    id: ids.keyA,
    organizationId: ORG_A(),
    rawKey: RAW_KEY_A,
    createdBy: OWNER_ID(),
    name: "Org A key",
  });
  await insertKeyRow({
    id: ids.keyRevoke,
    organizationId: ORG_A(),
    rawKey: RAW_KEY_REVOKE,
    createdBy: OWNER_ID(),
    name: ids.keyRevoke,
  });
  await insertKeyRow({
    id: ids.keyB,
    organizationId: ORG_B(),
    rawKey: RAW_KEY_B,
    createdBy: OWNER_ID(),
    name: "Org B key",
  });

  // A device-login-shaped session: the same row better-auth writes for a CLI login.
  await db.insert(session).values({
    id: ids.session,
    token: SESSION_TOKEN,
    userId: OWNER_ID(),
    activeOrganizationId: ORG_A(),
    expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
    createdAt: now,
    updatedAt: now,
  });
});

beforeEach(() => {
  mockNotifyOrg.mockClear();
});

afterAll(async () => {
  const orgIds = [ORG_A(), ORG_B()];
  await db.delete(auditLog).where(inArray(auditLog.organizationId, orgIds));
  await db.delete(apiKey).where(inArray(apiKey.organizationId, orgIds));
  await db.delete(session).where(eq(session.id, ids.session));
  await db.delete(member).where(eq(member.id, ids.roMember));
  await db.delete(user).where(eq(user.id, ids.roUser));
  await cleanupBaseOrg(PREFIX);
});

describe("session-only: API keys cannot manage API keys", () => {
  it("GET: a key-authenticated request is refused with 403 and the reason is named", async () => {
    const res = await ownerApp(ids.keyA).handle(
      new Request("http://localhost/v1/api-keys")
    );

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error:
        "API keys cannot manage API keys. Sign in with `wraps auth login` and retry.",
      code: "FORBIDDEN",
    });
  });

  it("POST: a key-authenticated request is refused with 403 and writes no row", async () => {
    const name = `${PREFIX}-blocked`;
    const res = await ownerApp(ids.keyA).handle(
      new Request("http://localhost/v1/api-keys", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ name }),
      })
    );

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({
      error: expect.stringContaining("API keys cannot manage API keys"),
    });
    const rows = await db.query.apiKey.findMany({
      where: (k, { eq: eqOp }) => eqOp(k.name, name),
    });
    expect(rows).toHaveLength(0);
    expect(mockNotifyOrg).not.toHaveBeenCalled();
  });

  it("DELETE: a key-authenticated request is refused with 403 before the confirm check, and the row is untouched", async () => {
    const before = await db.query.apiKey.findFirst({
      where: (k, { eq: eqOp }) => eqOp(k.id, ids.keyA),
    });

    // No confirm=true: the 403 must come first, not the 400 confirm error.
    const res = await ownerApp(ids.keyA).handle(
      new Request(`http://localhost/v1/api-keys/${ids.keyA}`, {
        method: "DELETE",
      })
    );

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({
      error: expect.stringContaining("API keys cannot manage API keys"),
    });
    const after = await db.query.apiKey.findFirst({
      where: (k, { eq: eqOp }) => eqOp(k.id, ids.keyA),
    });
    expect(after?.keyHash).toBe(before?.keyHash);
    expect(after).toBeDefined();
  });

  it("real authenticate: a wraps_ key presented as a bearer is refused on all three routes", async () => {
    const app = realKeysApp();
    const idsBefore = (await apiKeyRows(ORG_A())).map((r) => r.id).sort();

    const list = await app.handle(
      new Request("http://localhost/v1/api-keys", {
        headers: bearer(RAW_KEY_A),
      })
    );
    expect(list.status).toBe(403);
    expect(await list.json()).toMatchObject({
      error: expect.stringContaining("API keys cannot manage API keys"),
    });

    const create = await app.handle(
      new Request("http://localhost/v1/api-keys", {
        method: "POST",
        headers: jsonHeaders(RAW_KEY_A),
        body: JSON.stringify({ name: `${PREFIX}-via-key` }),
      })
    );
    expect(create.status).toBe(403);

    const revoke = await app.handle(
      new Request(`http://localhost/v1/api-keys/${ids.keyA}?confirm=true`, {
        method: "DELETE",
        headers: bearer(RAW_KEY_A),
      })
    );
    expect(revoke.status).toBe(403);

    // Nothing the three requests did is visible afterward.
    const idsAfter = (await apiKeyRows(ORG_A())).map((r) => r.id).sort();
    expect(idsAfter).toEqual(idsBefore);
    expect(idsAfter).toContain(ids.keyA);
    expect(idsAfter).toContain(ids.keyRevoke);
  });

  it("session control: the owner's session gets 200 on the list (injected auth)", async () => {
    const res = await ownerApp(null).handle(
      new Request("http://localhost/v1/api-keys")
    );
    expect(res.status).toBe(200);
  });

  it("real authenticate: a device-login-shaped session token is accepted and lists the org's keys", async () => {
    const res = await realKeysApp().handle(
      new Request("http://localhost/v1/api-keys", {
        headers: bearer(SESSION_TOKEN),
      })
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { apiKeys: { id: string }[] };
    expect(body.apiKeys.map((k) => k.id)).toContain(ids.keyA);
  });
});

describe("GET /v1/api-keys", () => {
  it("lists the caller's org keys and never the secret, its hash, or a keyHash field", async () => {
    const res = await ownerApp(null).handle(
      new Request("http://localhost/v1/api-keys")
    );
    expect(res.status).toBe(200);

    const raw = await res.text();
    expect(raw).not.toContain("keyHash");
    expect(raw).not.toContain(RAW_KEY_A);
    expect(raw).not.toContain(sha256(RAW_KEY_A));

    const body = JSON.parse(raw) as {
      apiKeys: Array<Record<string, unknown>>;
    };
    const keyA = body.apiKeys.find((k) => k.id === ids.keyA);
    expect(keyA).toBeDefined();
    expect(keyA?.prefix).toBe(`${RAW_KEY_A.slice(0, 19)}...`);
    expect(keyA?.name).toBe("Org A key");
  });

  it("returns exactly the documented fields for every key", async () => {
    const res = await ownerApp(null).handle(
      new Request("http://localhost/v1/api-keys")
    );
    const body = (await res.json()) as {
      apiKeys: Array<Record<string, unknown>>;
    };
    expect(body.apiKeys.length).toBeGreaterThan(0);
    for (const k of body.apiKeys) {
      expect(Object.keys(k).sort()).toEqual(KEY_FIELDS);
    }
  });

  it("a read-only member can list (apiKeys:read) and sees org A's keys", async () => {
    const res = await appFor({
      apiKeyId: null,
      organizationId: ORG_A(),
      userId: ids.roUser,
    }).handle(new Request("http://localhost/v1/api-keys"));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { apiKeys: { id: string }[] };
    expect(body.apiKeys.map((k) => k.id)).toContain(ids.keyA);
  });
});

describe("POST /v1/api-keys", () => {
  it("creates a live key, returns the secret once, and stores only its hash and display prefix", async () => {
    const res = await ownerApp(null).handle(
      new Request("http://localhost/v1/api-keys", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ name: `${PREFIX}-ci` }),
      })
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      apiKey: Record<string, unknown> & { id: string; prefix: string };
      secretKey: string;
    };

    // wraps_live_ (11 chars) + 32 base64url chars from 24 random bytes.
    expect(body.secretKey).toMatch(/^wraps_live_[A-Za-z0-9_-]{32}$/);
    expect(body.secretKey).toHaveLength(43);
    expect(body.apiKey.prefix).toBe(`${body.secretKey.slice(0, 19)}...`);
    expect(body.apiKey).not.toHaveProperty("keyHash");
    expect(body.apiKey).not.toHaveProperty("secretKey");

    const row = await db.query.apiKey.findFirst({
      where: (k, { eq: eqOp }) => eqOp(k.id, body.apiKey.id),
    });
    expect(row?.keyHash).toBe(sha256(body.secretKey));
    expect(row?.keyHash).not.toBe(body.secretKey);
    expect(row?.prefix).toBe(body.apiKey.prefix);
    expect(row?.organizationId).toBe(ORG_A());
    expect(row?.createdBy).toBe(OWNER_ID());
    expect(row?.expiresAt).toBeNull();

    const audit = await db.query.auditLog.findFirst({
      where: (a, { and: andOp, eq: eqOp }) =>
        andOp(
          eqOp(a.organizationId, ORG_A()),
          eqOp(a.action, "api_key.created"),
          eqOp(a.resourceId, body.apiKey.id)
        ),
    });
    expect(audit?.metadata).toEqual({
      name: `${PREFIX}-ci`,
      type: "live",
    });

    expect(mockNotifyOrg).toHaveBeenCalledTimes(1);
    expect(mockNotifyOrg).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG_A(),
        type: "api_key.created",
        excludeUserIds: [OWNER_ID()],
        roles: ["owner", "admin"],
      })
    );
    // The secret never reaches the notification.
    expect(JSON.stringify(mockNotifyOrg.mock.calls)).not.toContain(
      body.secretKey
    );
  });

  it("the returned secret authenticates through validateApiKey on an unrelated route (real authenticate)", async () => {
    const created = await ownerApp(null).handle(
      new Request("http://localhost/v1/api-keys", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ name: `${PREFIX}-usable` }),
      })
    );
    const { apiKey: createdKey, secretKey } = (await created.json()) as {
      apiKey: { id: string };
      secretKey: string;
    };

    // Real authenticate() on /v1/contacts, which is not an api-keys route.
    const res = await realContactsApp().handle(
      new Request("http://localhost/v1/contacts", {
        headers: bearer(secretKey),
      })
    );
    expect(res.status).toBe(200);

    // validateApiKey matched the row this route inserted (it stamps lastUsedAt).
    const row = await db.query.apiKey.findFirst({
      where: (k, { eq: eqOp }) => eqOp(k.id, createdKey.id),
    });
    expect(row?.lastUsedAt).not.toBeNull();
  });

  it("permissions: 'readonly' stores the read-only set; the default stores the full set", async () => {
    const readonly = await ownerApp(null).handle(
      new Request("http://localhost/v1/api-keys", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({
          name: `${PREFIX}-ro-preset`,
          permissions: "readonly",
        }),
      })
    );
    expect(readonly.status).toBe(201);
    const roBody = (await readonly.json()) as {
      apiKey: { permissions: string[] };
    };
    expect(roBody.apiKey.permissions).toEqual([
      "contacts:read",
      "topics:read",
      "segments:read",
      "campaigns:read",
      "workflows:read",
      "analytics:read",
    ]);
    expect(roBody.apiKey.permissions).toEqual(READ_ONLY_PERMISSIONS);

    const full = await ownerApp(null).handle(
      new Request("http://localhost/v1/api-keys", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ name: `${PREFIX}-full-default` }),
      })
    );
    const fullBody = (await full.json()) as {
      apiKey: { permissions: string[] };
    };
    expect(fullBody.apiKey.permissions).toEqual([
      "contacts:read",
      "contacts:write",
      "topics:read",
      "topics:write",
      "segments:read",
      "segments:write",
      "campaigns:read",
      "campaigns:write",
      "workflows:read",
      "workflows:write",
      "analytics:read",
      "send:email",
    ]);
  });

  it("400 names the problem when the name is blank", async () => {
    const res = await ownerApp(null).handle(
      new Request("http://localhost/v1/api-keys", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ name: "   " }),
      })
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: "API key name is required",
    });
    expect(mockNotifyOrg).not.toHaveBeenCalled();
  });

  it("422 when the permission list names a permission that does not exist", async () => {
    const res = await ownerApp(null).handle(
      new Request("http://localhost/v1/api-keys", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({
          name: `${PREFIX}-bad-perm`,
          permissions: ["admin:everything"],
        }),
      })
    );

    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_FAILED" });
  });
});

describe("DELETE /v1/api-keys/:id", () => {
  it("without confirm=true returns 400 naming confirm=true, and the key is still there", async () => {
    const missing = await ownerApp(null).handle(
      new Request(`http://localhost/v1/api-keys/${ids.keyA}`, {
        method: "DELETE",
      })
    );
    expect(missing.status).toBe(400);
    expect(await missing.json()).toMatchObject({
      error: expect.stringContaining(
        "Confirmation required: pass confirm=true"
      ),
    });

    const notTrue = await ownerApp(null).handle(
      new Request(`http://localhost/v1/api-keys/${ids.keyA}?confirm=false`, {
        method: "DELETE",
      })
    );
    expect(notTrue.status).toBe(400);

    const row = await db.query.apiKey.findFirst({
      where: (k, { eq: eqOp }) => eqOp(k.id, ids.keyA),
    });
    expect(row?.keyHash).toBe(sha256(RAW_KEY_A));
    expect(mockNotifyOrg).not.toHaveBeenCalled();
  });

  it("with confirm=true revokes the key: row gone, audit row written, and the secret stops authenticating", async () => {
    const res = await ownerApp(null).handle(
      new Request(
        `http://localhost/v1/api-keys/${ids.keyRevoke}?confirm=true`,
        {
          method: "DELETE",
        }
      )
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });

    const row = await db.query.apiKey.findFirst({
      where: (k, { eq: eqOp }) => eqOp(k.id, ids.keyRevoke),
    });
    expect(row).toBeUndefined();

    const audit = await db.query.auditLog.findFirst({
      where: (a, { and: andOp, eq: eqOp }) =>
        andOp(
          eqOp(a.organizationId, ORG_A()),
          eqOp(a.action, "api_key.revoked"),
          eqOp(a.resourceId, ids.keyRevoke)
        ),
    });
    expect(audit?.metadata).toEqual({ name: ids.keyRevoke });

    // The revoked secret is now refused by real authenticate().
    const after = await realContactsApp().handle(
      new Request("http://localhost/v1/contacts", {
        headers: bearer(RAW_KEY_REVOKE),
      })
    );
    expect(after.status).toBe(401);

    expect(mockNotifyOrg).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "api_key.revoked",
        organizationId: ORG_A(),
      })
    );
  });

  it("an unknown id in the caller's org returns 404 'API key not found'", async () => {
    const res = await ownerApp(null).handle(
      new Request(`http://localhost/v1/api-keys/${PREFIX}-nope?confirm=true`, {
        method: "DELETE",
      })
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: "API key not found",
      code: "NOT_FOUND",
    });
  });
});

describe("permissions", () => {
  it("POST: a read-only member gets 403 and no key is written", async () => {
    const name = `${PREFIX}-ro-create`;
    const res = await appFor({
      apiKeyId: null,
      organizationId: ORG_A(),
      userId: ids.roUser,
    }).handle(
      new Request("http://localhost/v1/api-keys", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ name }),
      })
    );

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: "You don't have permission to perform this action",
      code: "FORBIDDEN",
    });
    const rows = await db.query.apiKey.findMany({
      where: (k, { eq: eqOp }) => eqOp(k.name, name),
    });
    expect(rows).toHaveLength(0);
    expect(mockNotifyOrg).not.toHaveBeenCalled();
  });

  it("DELETE: a read-only member gets 403 even with confirm=true, and the key is untouched", async () => {
    const res = await appFor({
      apiKeyId: null,
      organizationId: ORG_A(),
      userId: ids.roUser,
    }).handle(
      new Request(`http://localhost/v1/api-keys/${ids.keyA}?confirm=true`, {
        method: "DELETE",
      })
    );

    expect(res.status).toBe(403);
    const row = await db.query.apiKey.findFirst({
      where: (k, { eq: eqOp }) => eqOp(k.id, ids.keyA),
    });
    expect(row?.keyHash).toBe(sha256(RAW_KEY_A));
    expect(mockNotifyOrg).not.toHaveBeenCalled();
  });

  it("GET: a session whose user is not a member of the org gets 403", async () => {
    const res = await appFor({
      apiKeyId: null,
      organizationId: ORG_A(),
      userId: ids.stranger,
    }).handle(new Request("http://localhost/v1/api-keys"));

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({
      error: "You don't have permission to perform this action",
    });
  });
});

describe("org isolation", () => {
  it("org A's list does not contain org B's key", async () => {
    const res = await ownerApp(null).handle(
      new Request("http://localhost/v1/api-keys")
    );
    const body = (await res.json()) as { apiKeys: { id: string }[] };
    expect(body.apiKeys.map((k) => k.id)).not.toContain(ids.keyB);
    expect(body.apiKeys.map((k) => k.id)).toContain(ids.keyA);
  });

  it("org A revoking org B's key id returns 404, and B's row and secret are unchanged afterward", async () => {
    const before = await db.query.apiKey.findFirst({
      where: (k, { eq: eqOp }) => eqOp(k.id, ids.keyB),
    });

    const res = await ownerApp(null).handle(
      new Request(`http://localhost/v1/api-keys/${ids.keyB}?confirm=true`, {
        method: "DELETE",
      })
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: "API key not found",
      code: "NOT_FOUND",
    });

    const after = await db.query.apiKey.findFirst({
      where: (k, { eq: eqOp }) => eqOp(k.id, ids.keyB),
    });
    expect(after).toBeDefined();
    expect(after?.organizationId).toBe(ORG_B());
    expect(after?.name).toBe("Org B key");
    expect(after?.keyHash).toBe(before?.keyHash);
    expect(after?.keyHash).toBe(sha256(RAW_KEY_B));

    // Org B's key still authenticates through the real path.
    const still = await realContactsApp().handle(
      new Request("http://localhost/v1/contacts", {
        headers: bearer(RAW_KEY_B),
      })
    );
    expect(still.status).toBe(200);

    expect(mockNotifyOrg).not.toHaveBeenCalled();
  });
});

describe("OpenAPI", () => {
  it("every new path and method is in the generated spec, with the error responses attached", async () => {
    const specApp = new Elysia()
      .onAfterHandle({ as: "global" }, ({ path, response }) => {
        if (
          path === "/swagger/json" &&
          response &&
          typeof response === "object"
        ) {
          injectErrorResponses(response as Record<string, never>);
        }
      })
      .use(
        swagger({
          path: "/swagger",
          documentation: {} as never,
          exclude: ["/swagger", "/swagger/json"],
        })
      )
      .use(apiKeysRoutes);

    const res = await specApp.handle(
      new Request("http://localhost/swagger/json")
    );
    expect(res.status).toBe(200);
    const spec = (await res.json()) as {
      paths: Record<
        string,
        Record<string, { tags?: string[]; responses?: Record<string, unknown> }>
      >;
    };

    // Elysia documents the prefix root with a trailing slash, as the other prefix routes do.
    expect(Object.keys(spec.paths["/v1/api-keys/"] ?? {}).sort()).toEqual([
      "get",
      "post",
    ]);
    expect(Object.keys(spec.paths["/v1/api-keys/{id}"] ?? {})).toEqual([
      "delete",
    ]);
    expect(spec.paths["/v1/api-keys/"].get.tags).toEqual(["api-keys"]);
    expect(
      Object.keys(spec.paths["/v1/api-keys/"].post.responses ?? {})
    ).toEqual(expect.arrayContaining(["201", "400", "403"]));
  });
});
