import { describe, expect, it, vi } from "vitest";

const selectedRows: { role: string }[] = [];

vi.mock("@wraps/db", () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => selectedRows }) }),
    }),
  },
  member: { role: "role", userId: "userId", organizationId: "organizationId" },
}));

vi.mock("../middleware/auth", () => ({
  getAuth: (ctx: { auth: unknown }) => ctx.auth,
}));

import {
  keyAllows,
  keyScopesFor,
  requirePermission,
  roleAllows,
} from "../lib/require-permission";

function ctxFor(userId: string | null) {
  return {
    auth: { apiKeyId: null, organizationId: "org-1", userId, planId: "pro" },
    set: { status: 200 },
  };
}

describe("roleAllows", () => {
  it("lets owner and admin write topics", () => {
    expect(roleAllows("owner", "topics", ["write"])).toBe(true);
    expect(roleAllows("admin", "topics", ["write"])).toBe(true);
  });

  it("denies read-only a topics write but allows the read", () => {
    expect(roleAllows("read-only", "topics", ["write"])).toBe(false);
    expect(roleAllows("read-only", "topics", ["read"])).toBe(true);
  });

  it("denies a role that does not exist", () => {
    expect(roleAllows("intern", "topics", ["read"])).toBe(false);
  });
});

describe("requirePermission", () => {
  it("returns 403 when the caller has no user id", async () => {
    const ctx = ctxFor(null);
    const result = await requirePermission(ctx, "topics", ["write"]);
    expect(result.ok).toBe(false);
    expect(ctx.set.status).toBe(403);
  });

  it("returns 403 when the caller is not a member of the org", async () => {
    selectedRows.length = 0;
    const ctx = ctxFor("user-1");
    const result = await requirePermission(ctx, "topics", ["write"]);
    expect(result.ok).toBe(false);
    expect(ctx.set.status).toBe(403);
  });

  it("returns 403 for a role without the action", async () => {
    selectedRows.splice(0, selectedRows.length, { role: "read-only" });
    const ctx = ctxFor("user-1");
    const result = await requirePermission(ctx, "topics", ["write"]);
    expect(result).toEqual({
      ok: false,
      body: { error: "You don't have permission to perform this action" },
    });
    expect(ctx.set.status).toBe(403);
  });

  it("allows an owner and leaves the status alone", async () => {
    selectedRows.splice(0, selectedRows.length, { role: "owner" });
    const ctx = ctxFor("user-1");
    const result = await requirePermission(ctx, "topics", ["write"]);
    expect(result).toEqual({ ok: true, userId: "user-1", role: "owner" });
    expect(ctx.set.status).toBe(200);
  });
});

function ctxForKey(apiKeyScopes: string[] | undefined, userId: string | null) {
  return {
    auth: {
      apiKeyId: "key-1",
      organizationId: "org-1",
      userId,
      planId: "pro",
      apiKeyScopes,
    },
    set: { status: 200 },
  };
}

describe("keyScopesFor", () => {
  it("maps content resources to the dashboard's key scopes", () => {
    expect(keyScopesFor("contacts", ["delete"])).toEqual(["contacts:write"]);
    expect(keyScopesFor("templates", ["publish"])).toEqual(["campaigns:write"]);
    expect(keyScopesFor("events", ["read"])).toEqual(["analytics:read"]);
  });

  it("needs send:email as well as campaigns:write to send a broadcast", () => {
    expect(keyScopesFor("broadcasts", ["send"])).toEqual([
      "campaigns:write",
      "send:email",
    ]);
  });

  it("has no scope for admin resources or unknown actions", () => {
    expect(keyScopesFor("apiKeys", ["read"])).toBeNull();
    expect(keyScopesFor("orgSettings", ["read"])).toBeNull();
    expect(keyScopesFor("events", ["write"])).toBeNull();
  });
});

describe("keyAllows", () => {
  it("needs every scope", () => {
    expect(
      keyAllows(["campaigns:write"], ["campaigns:write", "send:email"])
    ).toBe(false);
    expect(
      keyAllows(
        ["campaigns:write", "send:email"],
        ["campaigns:write", "send:email"]
      )
    ).toBe(true);
  });

  it("refuses when nothing is needed-able or nothing is granted", () => {
    expect(keyAllows(["contacts:write"], null)).toBe(false);
    expect(keyAllows(undefined, ["contacts:read"])).toBe(false);
    expect(keyAllows([], ["contacts:read"])).toBe(false);
  });
});

describe("requirePermission with an API key", () => {
  it("allows a key whose scopes cover the action, without a member row", async () => {
    selectedRows.length = 0;
    const ctx = ctxForKey(["topics:read", "topics:write"], "creator-1");
    const result = await requirePermission(ctx, "topics", ["write"]);
    expect(result).toEqual({ ok: true, userId: "creator-1", role: null });
    expect(ctx.set.status).toBe(200);
  });

  it("allows a key whose creator is gone", async () => {
    const ctx = ctxForKey(["contacts:write"], null);
    const result = await requirePermission(ctx, "contacts", ["write"]);
    expect(result).toEqual({ ok: true, userId: null, role: null });
  });

  it("refuses a read-only key a write, with 403", async () => {
    const ctx = ctxForKey(["topics:read"], "creator-1");
    const result = await requirePermission(ctx, "topics", ["write"]);
    expect(result.ok).toBe(false);
    expect(ctx.set.status).toBe(403);
  });

  it("ignores the creator's role: an owner's read-only key still cannot write", async () => {
    selectedRows.splice(0, selectedRows.length, { role: "owner" });
    const ctx = ctxForKey(["topics:read"], "creator-1");
    const result = await requirePermission(ctx, "topics", ["write"]);
    expect(result.ok).toBe(false);
  });

  it("refuses a key on an admin resource unless the route names scopes", async () => {
    const ctx = ctxForKey(["contacts:read", "contacts:write"], "creator-1");
    expect((await requirePermission(ctx, "awsAccounts", ["write"])).ok).toBe(
      false
    );
    const overridden = ctxForKey(["contacts:write"], "creator-1");
    const result = await requirePermission(
      overridden,
      "awsAccounts",
      ["write"],
      {
        keyScopes: ["contacts:write"],
      }
    );
    expect(result.ok).toBe(true);
  });

  it("refuses a key with no scopes recorded", async () => {
    const ctx = ctxForKey(undefined, "creator-1");
    expect((await requirePermission(ctx, "contacts", ["read"])).ok).toBe(false);
  });
});
