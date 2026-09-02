import {
  auditLog,
  db,
  eq,
  member,
  organization,
  subscription,
  user,
} from "@wraps/db";
import { and } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { listAuditLogs } from "../audit-log";
import { exportAuditLogs } from "../export";

// --- Mocks ---

vi.mock("next/headers", () => ({
  headers: () => new Headers(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@wraps/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => ({
        user: { id: userA.id, email: userA.email, name: userA.name },
        session: {
          id: "audit-log-test-session-a",
          createdAt: new Date(),
          updatedAt: new Date(),
          userId: userA.id,
          expiresAt: new Date(Date.now() + 86_400_000),
          token: "audit-log-test-token",
        },
      })),
    },
  },
}));

// --- Test fixtures ---

const userA = {
  id: "audit-test-user-a",
  email: "audit-user-a@example.com",
  name: "Audit User A",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  image: null,
  twoFactorEnabled: false,
  stripeCustomerId: null,
};

const userB = {
  id: "audit-test-user-b",
  email: "audit-user-b@example.com",
  name: "Audit User B",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  image: null,
  twoFactorEnabled: false,
  stripeCustomerId: null,
};

const orgA = {
  id: "audit-test-org-a",
  name: "Audit Org A",
  slug: "audit-org-a",
  createdAt: new Date(),
  logo: null,
  metadata: null,
};

const orgB = {
  id: "audit-test-org-b",
  name: "Audit Org B",
  slug: "audit-org-b",
  createdAt: new Date(),
  logo: null,
  metadata: null,
};

const memberA = {
  id: "audit-test-member-a",
  organizationId: orgA.id,
  userId: userA.id,
  role: "owner" as const,
  createdAt: new Date(),
};

// --- DB setup & teardown ---

beforeAll(async () => {
  await db
    .insert(user)
    .values(userA)
    .onConflictDoUpdate({ target: user.id, set: { updatedAt: new Date() } });
  await db
    .insert(user)
    .values(userB)
    .onConflictDoUpdate({ target: user.id, set: { updatedAt: new Date() } });

  await db
    .insert(organization)
    .values(orgA)
    .onConflictDoUpdate({ target: organization.id, set: { name: orgA.name } });
  await db
    .insert(organization)
    .values(orgB)
    .onConflictDoUpdate({ target: organization.id, set: { name: orgB.name } });

  await db
    .insert(member)
    .values(memberA)
    .onConflictDoUpdate({ target: member.id, set: { role: memberA.role } });
});

afterAll(async () => {
  await db.delete(auditLog).where(eq(auditLog.organizationId, orgA.id));
  await db.delete(auditLog).where(eq(auditLog.organizationId, orgB.id));
  await db.delete(subscription).where(eq(subscription.referenceId, orgA.id));
  await db.delete(member).where(eq(member.id, memberA.id));
  await db.delete(organization).where(eq(organization.id, orgA.id));
  await db.delete(organization).where(eq(organization.id, orgB.id));
  await db.delete(user).where(eq(user.id, userA.id));
  await db.delete(user).where(eq(user.id, userB.id));
});

/** Gives orgA a plan by replacing its subscription row. `null` removes any
 * subscription so `getOrganizationPlan` falls back to "free". */
async function setOrgAPlan(plan: "free" | "business"): Promise<void> {
  await db.delete(subscription).where(eq(subscription.referenceId, orgA.id));
  if (plan === "free") {
    return;
  }
  await db.insert(subscription).values({
    id: `audit-export-test-sub-${plan}`,
    plan,
    referenceId: orgA.id,
    status: "active",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

// --- listAuditLogs ---

describe("listAuditLogs", () => {
  it("returns events scoped to the caller's org only (not another org's events)", async () => {
    // Insert an event for orgB directly
    await db.insert(auditLog).values({
      organizationId: orgB.id,
      userId: userB.id,
      actorEmail: userB.email,
      action: "settings.updated",
      resource: "organization",
    });

    const result = await listAuditLogs(orgA.id);

    expect(result.success).toBe(true);
    if (!result.success) return;

    // All returned events must belong to orgA
    for (const event of result.data) {
      expect(event.organizationId).toBe(orgA.id);
    }

    // orgB event must NOT appear
    const orgBEvent = result.data.find((e) => e.organizationId === orgB.id);
    expect(orgBEvent).toBeUndefined();
  });

  it("returns { success: false, error: 'Unauthorized' } for a user with no org membership", async () => {
    const { auth } = await import("@wraps/auth");
    vi.mocked(auth.api.getSession).mockResolvedValueOnce({
      user: { id: "no-such-user", email: "ghost@example.com", name: null },
      session: {
        id: "ghost-session",
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: "no-such-user",
        expiresAt: new Date(Date.now() + 86_400_000),
        token: "ghost-token",
      },
    } as any);

    const result = await listAuditLogs(orgA.id);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBe("You don't have access to this organization");
  });

  it("never returns events older than the org's plan retention window", async () => {
    // Insert an event created 100 days ago (exceeds all plan windows)
    const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);
    await db.insert(auditLog).values({
      id: "audit-old-event-test",
      organizationId: orgA.id,
      userId: userA.id,
      actorEmail: userA.email,
      action: "api_key.created",
      resource: "api_key",
      createdAt: oldDate,
    });

    // Insert a recent event (2 days ago — well within the free plan 7-day window)
    const recentDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    await db.insert(auditLog).values({
      id: "audit-recent-event-test",
      organizationId: orgA.id,
      userId: userA.id,
      actorEmail: userA.email,
      action: "settings.updated",
      resource: "organization",
      createdAt: recentDate,
    });

    // orgA is on free plan (7-day retention) — no paid subscription
    const result = await listAuditLogs(orgA.id);

    expect(result.success).toBe(true);
    if (!result.success) return;

    // Old event must be excluded
    const oldEvent = result.data.find((e) => e.id === "audit-old-event-test");
    expect(oldEvent).toBeUndefined();

    // Recent event must be included — confirms the query is filtering, not returning nothing
    const recentEvent = result.data.find(
      (e) => e.id === "audit-recent-event-test"
    );
    expect(recentEvent).toBeDefined();
  });

  it("filters results by action type when filter.action is provided", async () => {
    // Seed a sentinel row with a different action — must be excluded by the filter
    await db.insert(auditLog).values({
      id: "audit-filter-sentinel",
      organizationId: orgA.id,
      userId: userA.id,
      actorEmail: userA.email,
      action: "member.invited",
      resource: "member",
    });

    await db.insert(auditLog).values({
      organizationId: orgA.id,
      userId: userA.id,
      actorEmail: userA.email,
      action: "api_key.revoked",
      resource: "api_key",
      resourceId: "key-123",
    });

    const result = await listAuditLogs(orgA.id, {
      filter: { action: "api_key.revoked" },
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.length).toBeGreaterThan(0);
    for (const event of result.data) {
      expect(event.action).toBe("api_key.revoked");
    }

    // The sentinel row with a different action must not appear
    const sentinel = result.data.find((e) => e.id === "audit-filter-sentinel");
    expect(sentinel).toBeUndefined();
  });

  it("returns Unauthorized for a user with the member role (not owner or admin)", async () => {
    const memberUser = {
      id: "audit-test-member-user",
      email: "member@example.com",
      name: "Member User",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      image: null,
      twoFactorEnabled: false,
      stripeCustomerId: null,
    };
    await db
      .insert(user)
      .values(memberUser)
      .onConflictDoUpdate({ target: user.id, set: { updatedAt: new Date() } });
    await db
      .insert(member)
      .values({
        id: "audit-test-member-role",
        organizationId: orgA.id,
        userId: memberUser.id,
        role: "member",
        createdAt: new Date(),
      })
      .onConflictDoNothing();

    const { auth } = await import("@wraps/auth");
    vi.mocked(auth.api.getSession).mockResolvedValueOnce({
      user: {
        id: memberUser.id,
        email: memberUser.email,
        name: memberUser.name,
      },
      session: {
        id: "member-session",
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: memberUser.id,
        expiresAt: new Date(Date.now() + 86_400_000),
        token: "member-token",
      },
    } as any);

    const result = await listAuditLogs(orgA.id);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBe(
      "You don't have permission to perform this action"
    );

    // Cleanup
    await db.delete(member).where(eq(member.id, "audit-test-member-role"));
    await db.delete(user).where(eq(user.id, memberUser.id));
  });
});

// --- exportAuditLogs ---

describe("exportAuditLogs", () => {
  it("scopes the export to the caller's org only (not another org's rows)", async () => {
    await setOrgAPlan("business");

    await db.insert(auditLog).values({
      id: "audit-export-orgb-row",
      organizationId: orgB.id,
      userId: userB.id,
      actorEmail: userB.email,
      action: "settings.updated",
      resource: "organization",
    });

    const result = await exportAuditLogs(orgA.id, {});

    expect(result.success).toBe(true);
    if (!result.success) return;

    for (const row of result.logs) {
      expect(row.organizationId).toBe(orgA.id);
    }

    const orgBRow = result.logs.find((r) => r.organizationId === orgB.id);
    expect(orgBRow).toBeUndefined();
  });

  // These two tests are a matched pair: together they prove the orgAction
  // `feature: "auditLogExport"` gate actually flips with the plan, not just
  // that *something* about the call succeeds or fails.
  it("denies the export when the org's plan lacks auditLogExport", async () => {
    await setOrgAPlan("free");

    const result = await exportAuditLogs(orgA.id, {});

    expect(result.success).toBe(false);
    if (result.success) return;
    // Asserts the wrapper's actual plan-gate message (checkFeatureAccess +
    // PLANS.business.name), not just success === false — a bad fixture, a
    // thrown error, or an accidental auditLogExport: true on free would all
    // still satisfy a bare success === false check.
    expect(result.error).toBe("Audit log export requires a Business plan.");
  });

  it("allows the export when the org's plan has auditLogExport (business)", async () => {
    await setOrgAPlan("business");

    const result = await exportAuditLogs(orgA.id, {});

    expect(result.success).toBe(true);
  });

  it("never returns rows older than the org's plan retention window", async () => {
    await setOrgAPlan("business"); // 365-day retention

    const veryOldDate = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000);
    await db.insert(auditLog).values({
      id: "audit-export-old-row",
      organizationId: orgA.id,
      userId: userA.id,
      actorEmail: userA.email,
      action: "api_key.created",
      resource: "api_key",
      createdAt: veryOldDate,
    });

    const recentDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    await db.insert(auditLog).values({
      id: "audit-export-recent-row",
      organizationId: orgA.id,
      userId: userA.id,
      actorEmail: userA.email,
      action: "settings.updated",
      resource: "organization",
      createdAt: recentDate,
    });

    const result = await exportAuditLogs(orgA.id, {});

    expect(result.success).toBe(true);
    if (!result.success) return;

    const oldRow = result.logs.find((r) => r.id === "audit-export-old-row");
    expect(oldRow).toBeUndefined();

    const recentRow = result.logs.find(
      (r) => r.id === "audit-export-recent-row"
    );
    expect(recentRow).toBeDefined();
  });

  it("denies export for a user with the member role (not owner or admin)", async () => {
    await setOrgAPlan("business");

    const exportMemberUser = {
      id: "audit-export-test-member-user",
      email: "export-member@example.com",
      name: "Export Member User",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      image: null,
      twoFactorEnabled: false,
      stripeCustomerId: null,
    };
    await db
      .insert(user)
      .values(exportMemberUser)
      .onConflictDoUpdate({ target: user.id, set: { updatedAt: new Date() } });
    await db
      .insert(member)
      .values({
        id: "audit-export-test-member-role",
        organizationId: orgA.id,
        userId: exportMemberUser.id,
        role: "member",
        createdAt: new Date(),
      })
      .onConflictDoNothing();

    const { auth } = await import("@wraps/auth");
    vi.mocked(auth.api.getSession).mockResolvedValueOnce({
      user: {
        id: exportMemberUser.id,
        email: exportMemberUser.email,
        name: exportMemberUser.name,
      },
      session: {
        id: "export-member-session",
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: exportMemberUser.id,
        expiresAt: new Date(Date.now() + 86_400_000),
        token: "export-member-token",
      },
    } as any);

    const result = await exportAuditLogs(orgA.id, {});

    expect(result.success).toBe(false);
    if (result.success) return;
    // Matches listAuditLogs: the "member" role fails the resource-level
    // permission check in orgAction before the handler's own owner/admin
    // check ever runs, so the message is the generic permission-denied one,
    // not the handler's "Unauthorized" literal.
    expect(result.error).toBe(
      "You don't have permission to perform this action"
    );

    // Cleanup
    await db
      .delete(member)
      .where(eq(member.id, "audit-export-test-member-role"));
    await db.delete(user).where(eq(user.id, exportMemberUser.id));
  });

  it("writes its own audit_log.exported row when the export succeeds", async () => {
    await setOrgAPlan("business");

    const before = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, orgA.id),
          eq(auditLog.action, "audit_log.exported")
        )
      );

    const result = await exportAuditLogs(orgA.id, {});
    expect(result.success).toBe(true);

    const after = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, orgA.id),
          eq(auditLog.action, "audit_log.exported")
        )
      );

    expect(after.length).toBe(before.length + 1);

    const beforeIds = new Set(before.map((r) => r.id));
    const newRow = after.find((r) => !beforeIds.has(r.id));
    expect(newRow).toBeDefined();
    expect(newRow?.actorEmail).toBe(userA.email);
  });
});
