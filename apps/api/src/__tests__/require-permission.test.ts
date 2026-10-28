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

import { requirePermission, roleAllows } from "../lib/require-permission";

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
