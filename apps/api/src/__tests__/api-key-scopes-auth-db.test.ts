/**
 * API key scopes through the real auth middleware: a `wraps_` bearer token is
 * hashed, looked up in `api_key`, and its `permissions` reach
 * `requirePermission` as `apiKeyScopes`. No auth is injected here, unlike the
 * route permission tests, so a broken lookup fails this file.
 *
 * File suffix `-db.test.ts` = real Neon test branch (no `@wraps/db` mocks).
 */

import { createHash, randomBytes } from "node:crypto";
import { apiKey, auditLog, brandKit, db, member, user } from "@wraps/db";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  cleanupBaseOrg,
  seedBaseOrg,
} from "../(ee)/__tests__/fixtures/real-db";
import {
  FULL_ACCESS_PERMISSIONS,
  READ_ONLY_PERMISSIONS,
} from "../services/api-keys";
import { createErrorHarness } from "./error-handler-harness";

const { brandKitsRoutes } = await import("../routes/brand-kits");

const PREFIX = `aks-${crypto.randomUUID().slice(0, 8)}`;
const READ_ONLY_USER = `${PREFIX}-ro-user`;
const READ_ONLY_MEMBER = `${PREFIX}-ro-member`;
const PERMISSION_DENIED = "You don't have permission to perform this action";

let ids: Awaited<ReturnType<typeof seedBaseOrg>>["ids"];
const keys: Record<string, string> = {};
const keyIds: string[] = [];

async function insertKey(
  name: string,
  permissions: string[],
  createdBy: string | null
): Promise<string> {
  const secret = `wraps_live_${randomBytes(20).toString("hex")}`;
  const id = `${PREFIX}-key-${name}`;
  await db.insert(apiKey).values({
    id,
    organizationId: ids.org,
    name,
    keyHash: createHash("sha256").update(secret).digest("hex"),
    prefix: secret.slice(0, 14),
    permissions,
    createdBy,
  });
  keyIds.push(id);
  return secret;
}

function app() {
  const { app: harness } = createErrorHarness();
  return harness.use(brandKitsRoutes);
}

async function call(secret: string, method: string, body?: unknown) {
  const res = await app().handle(
    new Request("http://localhost/v1/brand-kits", {
      method,
      headers: {
        authorization: `Bearer ${secret}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function kitCount() {
  const rows = await db
    .select({ id: brandKit.id })
    .from(brandKit)
    .where(eq(brandKit.organizationId, ids.org));
  return rows.length;
}

beforeAll(async () => {
  const fixture = await seedBaseOrg(PREFIX);
  ids = fixture.ids;

  await db
    .insert(user)
    .values({
      id: READ_ONLY_USER,
      email: `${PREFIX}-ro@example.com`,
      name: "Read Only Key Creator",
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

  keys.full = await insertKey("full", [...FULL_ACCESS_PERMISSIONS], ids.user);
  keys.readonly = await insertKey(
    "readonly",
    [...READ_ONLY_PERMISSIONS],
    ids.user
  );
  keys.empty = await insertKey("empty", [], ids.user);
  keys.orphan = await insertKey("orphan", [...FULL_ACCESS_PERMISSIONS], null);
  keys.byReadOnlyMember = await insertKey(
    "by-read-only-member",
    [...FULL_ACCESS_PERMISSIONS],
    READ_ONLY_USER
  );
});

afterAll(async () => {
  await db.delete(auditLog).where(eq(auditLog.organizationId, ids.org));
  await db.delete(brandKit).where(eq(brandKit.organizationId, ids.org));
  await db.delete(apiKey).where(inArray(apiKey.id, keyIds));
  await db.delete(member).where(eq(member.id, READ_ONLY_MEMBER));
  await db.delete(user).where(eq(user.id, READ_ONLY_USER));
  await cleanupBaseOrg(PREFIX);
});

describe("API key scopes through the auth middleware", () => {
  it("a full-access key writes", async () => {
    const before = await kitCount();
    const res = await call(keys.full, "POST", { name: "Full key kit" });
    expect(res.status).toBe(201);
    expect(await kitCount()).toBe(before + 1);
  });

  it("a read-only key reads but its write is 403 and writes nothing", async () => {
    expect((await call(keys.readonly, "GET")).status).toBe(200);
    const before = await kitCount();
    const res = await call(keys.readonly, "POST", { name: "Read-only kit" });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe(PERMISSION_DENIED);
    expect(await kitCount()).toBe(before);
  });

  it("a key with no scopes cannot write", async () => {
    const before = await kitCount();
    const res = await call(keys.empty, "POST", { name: "Empty key kit" });
    expect(res.status).toBe(403);
    expect(await kitCount()).toBe(before);
  });

  it("a key whose creator is gone still writes, audited with no user", async () => {
    const res = await call(keys.orphan, "POST", { name: "Orphan key kit" });
    expect(res.status).toBe(201);
    const [row] = await db
      .select({ userId: auditLog.userId })
      .from(auditLog)
      .where(eq(auditLog.resourceId, res.body.id));
    expect(row).toEqual({ userId: null });
  });

  it("the creator's role is ignored: a full key made by a read-only member writes", async () => {
    const res = await call(keys.byReadOnlyMember, "POST", {
      name: "Read-only member's key kit",
    });
    expect(res.status).toBe(201);
  });

  it("an unknown key is 401", async () => {
    const res = await call(`wraps_live_${"0".repeat(40)}`, "GET");
    expect(res.status).toBe(401);
  });
});
