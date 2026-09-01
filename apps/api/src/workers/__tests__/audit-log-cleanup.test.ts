/**
 * Audit Log Cleanup Worker Tests
 *
 * Integration tests using a real database. Verifies that the cleanup
 * handler deletes audit_log rows older than the org's plan retention window
 * and preserves rows within the window.
 */

import {
  auditLog,
  db,
  member,
  organization,
  subscription,
  user,
} from "@wraps/db";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { handler } from "../audit-log-cleanup";

// ─── Test fixtures ────────────────────────────────────────────────────────────

const TEST_PREFIX = "audit-cleanup-test";

const testUser = {
  id: `${TEST_PREFIX}-user-1`,
  email: `${TEST_PREFIX}@example.com`,
  name: "Audit Cleanup Test User",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  image: null,
  twoFactorEnabled: false,
  stripeCustomerId: null,
};

const testOrgFree = {
  id: `${TEST_PREFIX}-org-free`,
  name: "Audit Cleanup Free Org",
  slug: `${TEST_PREFIX}-org-free`,
  createdAt: new Date(),
  logo: null,
  metadata: null,
};

const testOrgScale = {
  id: `${TEST_PREFIX}-org-scale`,
  name: "Audit Cleanup Scale Org",
  slug: `${TEST_PREFIX}-org-scale`,
  createdAt: new Date(),
  logo: null,
  metadata: null,
};

const testOrgFreeB = {
  id: `${TEST_PREFIX}-org-free-b`,
  name: "Audit Cleanup Free Org B",
  slug: `${TEST_PREFIX}-org-free-b`,
  createdAt: new Date(),
  logo: null,
  metadata: null,
};

const testMemberFree = {
  id: `${TEST_PREFIX}-member-free`,
  organizationId: testOrgFree.id,
  userId: testUser.id,
  role: "owner" as const,
  createdAt: new Date(),
};

const testMemberScale = {
  id: `${TEST_PREFIX}-member-scale`,
  organizationId: testOrgScale.id,
  userId: testUser.id,
  role: "owner" as const,
  createdAt: new Date(),
};

const testMemberFreeB = {
  id: `${TEST_PREFIX}-member-free-b`,
  organizationId: testOrgFreeB.id,
  userId: testUser.id,
  role: "owner" as const,
  createdAt: new Date(),
};

const testOrgPro = {
  id: `${TEST_PREFIX}-org-pro`,
  name: "Audit Cleanup Pro Org",
  slug: `${TEST_PREFIX}-org-pro`,
  createdAt: new Date(),
  logo: null,
  metadata: null,
};

const testOrgBusiness = {
  id: `${TEST_PREFIX}-org-business`,
  name: "Audit Cleanup Business Org",
  slug: `${TEST_PREFIX}-org-business`,
  createdAt: new Date(),
  logo: null,
  metadata: null,
};

const testOrgStarter = {
  id: `${TEST_PREFIX}-org-starter`,
  name: "Audit Cleanup Legacy Starter Org",
  slug: `${TEST_PREFIX}-org-starter`,
  createdAt: new Date(),
  logo: null,
  metadata: null,
};

const testMemberPro = {
  id: `${TEST_PREFIX}-member-pro`,
  organizationId: testOrgPro.id,
  userId: testUser.id,
  role: "owner" as const,
  createdAt: new Date(),
};

const testMemberBusiness = {
  id: `${TEST_PREFIX}-member-business`,
  organizationId: testOrgBusiness.id,
  userId: testUser.id,
  role: "owner" as const,
  createdAt: new Date(),
};

const testMemberStarter = {
  id: `${TEST_PREFIX}-member-starter`,
  organizationId: testOrgStarter.id,
  userId: testUser.id,
  role: "owner" as const,
  createdAt: new Date(),
};

// Subscription for scale org
const testSubscriptionScale = {
  id: `${TEST_PREFIX}-sub-scale`,
  plan: "scale",
  referenceId: testOrgScale.id,
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  status: "active",
  periodStart: null,
  periodEnd: null,
  cancelAtPeriodEnd: null,
  seats: null,
  trialStart: null,
  trialEnd: null,
  annual: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const testSubscriptionPro = {
  ...testSubscriptionScale,
  id: `${TEST_PREFIX}-sub-pro`,
  plan: "pro",
  referenceId: testOrgPro.id,
};

const testSubscriptionBusiness = {
  ...testSubscriptionScale,
  id: `${TEST_PREFIX}-sub-business`,
  plan: "business",
  referenceId: testOrgBusiness.id,
};

const testSubscriptionStarter = {
  ...testSubscriptionScale,
  id: `${TEST_PREFIX}-sub-starter`,
  plan: "starter",
  referenceId: testOrgStarter.id,
};

// Helper: build a date N days ago
function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

// Track inserted audit log IDs for cleanup
const insertedLogIds: string[] = [];

beforeAll(async () => {
  // Insert shared user
  await db
    .insert(user)
    .values(testUser)
    .onConflictDoUpdate({ target: user.id, set: { updatedAt: new Date() } });

  // Insert orgs
  for (const org of [
    testOrgFree,
    testOrgScale,
    testOrgFreeB,
    testOrgPro,
    testOrgBusiness,
    testOrgStarter,
  ]) {
    await db
      .insert(organization)
      .values(org)
      .onConflictDoUpdate({ target: organization.id, set: { name: org.name } });
  }

  // Insert members
  for (const m of [
    testMemberFree,
    testMemberScale,
    testMemberFreeB,
    testMemberPro,
    testMemberBusiness,
    testMemberStarter,
  ]) {
    await db
      .insert(member)
      .values(m)
      .onConflictDoUpdate({ target: member.id, set: { role: m.role } });
  }

  // Insert subscriptions
  for (const sub of [
    testSubscriptionScale,
    testSubscriptionPro,
    testSubscriptionBusiness,
    testSubscriptionStarter,
  ]) {
    await db
      .insert(subscription)
      .values(sub)
      .onConflictDoUpdate({
        target: subscription.id,
        set: { status: sub.status },
      });
  }
});

afterAll(async () => {
  // Clean up test audit logs
  if (insertedLogIds.length > 0) {
    await db.delete(auditLog).where(inArray(auditLog.id, insertedLogIds));
  }

  // Clean up test data in reverse dependency order
  await db
    .delete(subscription)
    .where(
      inArray(subscription.id, [
        testSubscriptionScale.id,
        testSubscriptionPro.id,
        testSubscriptionBusiness.id,
        testSubscriptionStarter.id,
      ])
    );
  await db
    .delete(member)
    .where(
      inArray(member.id, [
        testMemberFree.id,
        testMemberScale.id,
        testMemberFreeB.id,
        testMemberPro.id,
        testMemberBusiness.id,
        testMemberStarter.id,
      ])
    );
  for (const org of [
    testOrgFree,
    testOrgScale,
    testOrgFreeB,
    testOrgPro,
    testOrgBusiness,
    testOrgStarter,
  ]) {
    await db.delete(organization).where(eq(organization.id, org.id));
  }
  await db.delete(user).where(eq(user.id, testUser.id));
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function insertAuditLog(orgId: string, createdAt: Date): Promise<string> {
  const [row] = await db
    .insert(auditLog)
    .values({
      organizationId: orgId,
      action: "test.action",
      resource: "test",
      createdAt,
    })
    .returning({ id: auditLog.id });
  insertedLogIds.push(row.id);
  return row.id;
}

async function rowExists(id: string): Promise<boolean> {
  const rows = await db
    .select({ id: auditLog.id })
    .from(auditLog)
    .where(eq(auditLog.id, id));
  return rows.length > 0;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("audit-log-cleanup handler", () => {
  it("deletes events older than retention window (free = 30 days)", async () => {
    const oldId = await insertAuditLog(testOrgFree.id, daysAgo(40));
    const recentId = await insertAuditLog(testOrgFree.id, daysAgo(1));

    await handler({} as never, {} as never, () => {});

    expect(await rowExists(oldId)).toBe(false);
    expect(await rowExists(recentId)).toBe(true);
  });

  it("does NOT delete events within the retention window", async () => {
    const recentId = await insertAuditLog(testOrgFreeB.id, daysAgo(1));

    await handler({} as never, {} as never, () => {});

    expect(await rowExists(recentId)).toBe(true);
  });

  it("applies correct retention per org plan (scale=365, free=30)", async () => {
    // 100-day-old row for scale org — within 365-day window, should survive
    const scaleId = await insertAuditLog(testOrgScale.id, daysAgo(100));
    // 100-day-old row for free org — outside 30-day window, should be deleted
    const freeId = await insertAuditLog(testOrgFree.id, daysAgo(100));

    await handler({} as never, {} as never, () => {});

    expect(await rowExists(scaleId)).toBe(true);
    expect(await rowExists(freeId)).toBe(false);
  });

  it("pro org keeps a 60-day-old row and loses a 100-day-old one (90-day window)", async () => {
    const keptId = await insertAuditLog(testOrgPro.id, daysAgo(60));
    const deletedId = await insertAuditLog(testOrgPro.id, daysAgo(100));

    await handler({} as never, {} as never, () => {});

    expect(await rowExists(keptId)).toBe(true);
    expect(await rowExists(deletedId)).toBe(false);
  });

  it("business org keeps a 300-day-old row (365-day window)", async () => {
    const keptId = await insertAuditLog(testOrgBusiness.id, daysAgo(300));

    await handler({} as never, {} as never, () => {});

    expect(await rowExists(keptId)).toBe(true);
  });

  it("legacy starter org gets the Pro window (90 days), not the old 30-day window", async () => {
    // 60 days old: outside the old 30-day Free window, inside the 90-day Pro
    // window Starter is grandfathered into (plans/208).
    const keptId = await insertAuditLog(testOrgStarter.id, daysAgo(60));
    const deletedId = await insertAuditLog(testOrgStarter.id, daysAgo(100));

    await handler({} as never, {} as never, () => {});

    expect(await rowExists(keptId)).toBe(true);
    expect(await rowExists(deletedId)).toBe(false);
  });
});
