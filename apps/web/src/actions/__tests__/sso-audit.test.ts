/**
 * Audit Log Instrumentation Tests — Chunk 6
 *
 * Verifies that saveSsoProvider, deleteSsoProvider, requestDomainVerification,
 * verifyDomain, and generateScimToken each write a correctly-shaped audit log
 * row after a successful mutation.
 */

import {
  auditLog,
  db,
  member,
  organization,
  ssoProvider,
  user,
} from "@wraps/db";
import { and, eq } from "drizzle-orm";
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
  deleteSsoProvider,
  generateScimToken,
  requestDomainVerification,
  saveSsoProvider,
  verifyDomain,
} from "../sso";

// --- Test fixtures ---

const testUser = {
  id: "audit-v2-sso-user-1",
  email: "audit-v2-sso@example.com",
  name: "Audit V2 SSO User",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  image: null,
  twoFactorEnabled: false,
  stripeCustomerId: null,
};

const testOrganization = {
  id: "audit-v2-sso-org-1",
  name: "Audit V2 SSO Org",
  slug: "audit-v2-sso-org",
  createdAt: new Date(),
  logo: null,
  metadata: null,
};

const testMember = {
  id: "audit-v2-sso-member-1",
  organizationId: testOrganization.id,
  userId: testUser.id,
  role: "owner" as const,
  createdAt: new Date(),
};

const testProvider = {
  id: "audit-v2-sso-provider-1",
  providerId: "audit-v2-sso.example.com",
  issuer: "https://sso.example.com",
  domain: "audit-v2-sso.example.com",
  organizationId: testOrganization.id,
  domainVerified: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  oidcConfig: null,
  samlConfig: null,
  userId: null,
};

// --- Mocks ---

vi.mock("@/lib/plan-limits", () => ({
  checkFeatureAccess: vi
    .fn()
    .mockResolvedValue({ allowed: true, requiredPlan: null }),
}));

vi.mock("next/headers", () => ({
  headers: () => new Headers(),
}));

vi.mock("next/server", () => ({
  after: vi.fn((fn: () => unknown) => fn()),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@wraps/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => ({
        user: {
          id: testUser.id,
          email: testUser.email,
          name: testUser.name,
        },
        session: {
          id: "audit-v2-sso-session-1",
          createdAt: new Date(),
          updatedAt: new Date(),
          userId: testUser.id,
          expiresAt: new Date(Date.now() + 86_400_000),
          token: "audit-v2-sso-token",
        },
      })),
      // SSO API methods (cast via SsoScimApi in sso.ts)
      registerSSOProvider: vi.fn(async () => {}),
      deleteSSOProvider: vi.fn(async () => {}),
      requestDomainVerification: vi.fn(async () => ({
        domainVerificationToken: "audit-v2-sso-domain-token",
      })),
      verifyDomain: vi.fn(async () => {}),
      generateSCIMToken: vi.fn(async () => ({
        scimToken: "audit-v2-sso-scim-token",
      })),
    },
  },
}));

// --- DB setup & teardown ---

beforeAll(async () => {
  await db
    .insert(user)
    .values(testUser)
    .onConflictDoUpdate({ target: user.id, set: { updatedAt: new Date() } });

  await db
    .insert(organization)
    .values(testOrganization)
    .onConflictDoUpdate({
      target: organization.id,
      set: { name: testOrganization.name },
    });

  await db
    .insert(member)
    .values(testMember)
    .onConflictDoUpdate({ target: member.id, set: { role: testMember.role } });

  await db
    .insert(ssoProvider)
    .values(testProvider)
    .onConflictDoUpdate({
      target: ssoProvider.id,
      set: { updatedAt: new Date() },
    });
});

afterAll(async () => {
  await db
    .delete(auditLog)
    .where(eq(auditLog.organizationId, testOrganization.id));
  await db
    .delete(ssoProvider)
    .where(eq(ssoProvider.organizationId, testOrganization.id));
  await db.delete(member).where(eq(member.organizationId, testOrganization.id));
  await db.delete(organization).where(eq(organization.id, testOrganization.id));
  await db.delete(user).where(eq(user.id, testUser.id));
});

beforeEach(async () => {
  await db
    .delete(auditLog)
    .where(eq(auditLog.organizationId, testOrganization.id));
});

// --- Tests ---

describe("deleteSsoProvider — writes sso.provider_deleted audit log", () => {
  it("inserts an sso.provider_deleted audit log row with correct fields", async () => {
    const result = await deleteSsoProvider(
      testOrganization.id,
      testProvider.providerId
    );

    expect(result.success).toBe(true);

    const rows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, testOrganization.id),
          eq(auditLog.action, "sso.provider_deleted")
        )
      )
      .orderBy(auditLog.createdAt);

    expect(rows.length).toBeGreaterThan(0);
    const row = rows[rows.length - 1];
    expect(row.organizationId).toBe(testOrganization.id);
    expect(row.userId).toBe(testUser.id);
    expect(row.actorEmail).toBe(testUser.email);
    expect(row.action).toBe("sso.provider_deleted");
    expect(row.resource).toBe("sso_provider");
    expect(row.resourceId).toBe(testProvider.providerId);
    expect(row.metadata).toMatchObject({ providerId: testProvider.providerId });
  });
});

describe("requestDomainVerification — writes sso.domain_verification_requested audit log", () => {
  it("inserts an sso.domain_verification_requested audit log row with correct fields", async () => {
    const result = await requestDomainVerification(
      testOrganization.id,
      testProvider.providerId
    );

    expect(result.success).toBe(true);

    const rows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, testOrganization.id),
          eq(auditLog.action, "sso.domain_verification_requested")
        )
      )
      .orderBy(auditLog.createdAt);

    expect(rows.length).toBeGreaterThan(0);
    const row = rows[rows.length - 1];
    expect(row.organizationId).toBe(testOrganization.id);
    expect(row.userId).toBe(testUser.id);
    expect(row.actorEmail).toBe(testUser.email);
    expect(row.action).toBe("sso.domain_verification_requested");
    expect(row.resource).toBe("sso_provider");
    expect(row.resourceId).toBe(testProvider.providerId);
    expect(row.metadata).toMatchObject({ domain: testProvider.domain });
  });
});

describe("verifyDomain — writes sso.domain_verified audit log", () => {
  it("inserts an sso.domain_verified audit log row with correct fields", async () => {
    const result = await verifyDomain(
      testOrganization.id,
      testProvider.providerId
    );

    expect(result.success).toBe(true);

    const rows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, testOrganization.id),
          eq(auditLog.action, "sso.domain_verified")
        )
      )
      .orderBy(auditLog.createdAt);

    expect(rows.length).toBeGreaterThan(0);
    const row = rows[rows.length - 1];
    expect(row.organizationId).toBe(testOrganization.id);
    expect(row.userId).toBe(testUser.id);
    expect(row.actorEmail).toBe(testUser.email);
    expect(row.action).toBe("sso.domain_verified");
    expect(row.resource).toBe("sso_provider");
    expect(row.resourceId).toBe(testProvider.providerId);
    expect(row.metadata).toMatchObject({ domain: testProvider.domain });
  });
});

describe("generateScimToken — writes sso.scim_token_generated audit log", () => {
  it("inserts an sso.scim_token_generated audit log row with correct fields", async () => {
    const result = await generateScimToken(
      testOrganization.id,
      testProvider.providerId
    );

    expect(result.success).toBe(true);

    const rows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, testOrganization.id),
          eq(auditLog.action, "sso.scim_token_generated")
        )
      )
      .orderBy(auditLog.createdAt);

    expect(rows.length).toBeGreaterThan(0);
    const row = rows[rows.length - 1];
    expect(row.organizationId).toBe(testOrganization.id);
    expect(row.userId).toBe(testUser.id);
    expect(row.actorEmail).toBe(testUser.email);
    expect(row.action).toBe("sso.scim_token_generated");
    expect(row.resource).toBe("sso_provider");
    expect(row.resourceId).toBe(testProvider.providerId);
    expect(row.metadata).toMatchObject({});
  });
});

describe("saveSsoProvider — writes sso.provider_saved audit log (best-effort)", () => {
  it("inserts an sso.provider_saved audit log row with correct fields", async () => {
    const result = await saveSsoProvider(testOrganization.id, {
      domain: testProvider.domain,
      issuer: testProvider.issuer,
      clientId: "audit-v2-sso-client-id",
      clientSecret: "audit-v2-sso-client-secret",
    });

    expect(result.success).toBe(true);

    // Best-effort: give the async write a moment to settle
    await new Promise((r) => setTimeout(r, 50));

    const rows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, testOrganization.id),
          eq(auditLog.action, "sso.provider_saved")
        )
      )
      .orderBy(auditLog.createdAt);

    expect(rows.length).toBeGreaterThan(0);
    const row = rows[rows.length - 1];
    expect(row.organizationId).toBe(testOrganization.id);
    expect(row.userId).toBe(testUser.id);
    expect(row.actorEmail).toBe(testUser.email);
    expect(row.action).toBe("sso.provider_saved");
    expect(row.resource).toBe("sso_provider");
    expect(row.metadata).toMatchObject({
      domain: testProvider.domain,
      issuer: testProvider.issuer,
    });
  });
});
