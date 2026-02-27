/**
 * Authentication & Authorization Tests
 *
 * Integration tests for the real auth middleware against a real database.
 * Tests API key auth, session auth, tenant isolation, and edge cases.
 */

import { createHash } from "node:crypto";
import {
  apiKey,
  db,
  eq,
  member,
  organization,
  session,
  subscription,
  user,
} from "@wraps/db";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuthenticatedRoutes } from "../middleware/auth";

const TEST_PREFIX = "auth-test";

// --- Test data ---

const testUser1 = {
  id: `${TEST_PREFIX}-user-1`,
  email: `${TEST_PREFIX}-1@example.com`,
  name: "Auth Test User 1",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  image: null,
  twoFactorEnabled: false,
  stripeCustomerId: null,
};

const testUser2 = {
  id: `${TEST_PREFIX}-user-2`,
  email: `${TEST_PREFIX}-2@example.com`,
  name: "Auth Test User 2",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  image: null,
  twoFactorEnabled: false,
  stripeCustomerId: null,
};

const testOrg1 = {
  id: `${TEST_PREFIX}-org-1`,
  name: "Auth Test Org 1",
  slug: `${TEST_PREFIX}-org-1`,
  createdAt: new Date(),
  logo: null,
  metadata: null,
};

const testOrg2 = {
  id: `${TEST_PREFIX}-org-2`,
  name: "Auth Test Org 2",
  slug: `${TEST_PREFIX}-org-2`,
  createdAt: new Date(),
  logo: null,
  metadata: null,
};

// Pre-compute API key hashes
const RAW_KEY_ORG1 = "wraps_live_authtest_org1_key";
const RAW_KEY_ORG2 = "wraps_live_authtest_org2_key";
const RAW_KEY_EXPIRED = "wraps_live_authtest_expired_key";

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

const testApiKeyOrg1 = {
  id: `${TEST_PREFIX}-apikey-org1`,
  organizationId: testOrg1.id,
  name: "Test Key Org 1",
  keyHash: hashKey(RAW_KEY_ORG1),
  prefix: "wraps_live_auth",
  permissions: [],
  expiresAt: null,
  createdBy: testUser1.id,
  createdAt: new Date(),
};

const testApiKeyOrg2 = {
  id: `${TEST_PREFIX}-apikey-org2`,
  organizationId: testOrg2.id,
  name: "Test Key Org 2",
  keyHash: hashKey(RAW_KEY_ORG2),
  prefix: "wraps_live_auth",
  permissions: [],
  expiresAt: null,
  createdBy: testUser2.id,
  createdAt: new Date(),
};

const testApiKeyExpired = {
  id: `${TEST_PREFIX}-apikey-expired`,
  organizationId: testOrg1.id,
  name: "Expired Key",
  keyHash: hashKey(RAW_KEY_EXPIRED),
  prefix: "wraps_live_auth",
  permissions: [],
  expiresAt: new Date("2020-01-01"),
  createdBy: testUser1.id,
  createdAt: new Date(),
};

const SESSION_TOKEN_ORG1 = `${TEST_PREFIX}-session-token-1`;

const testSessionOrg1 = {
  id: `${TEST_PREFIX}-session-1`,
  token: SESSION_TOKEN_ORG1,
  userId: testUser1.id,
  activeOrganizationId: testOrg1.id,
  expiresAt: new Date(Date.now() + 86_400_000),
  createdAt: new Date(),
  updatedAt: new Date(),
  ipAddress: null,
  userAgent: null,
};

const SESSION_TOKEN_EXPIRED = `${TEST_PREFIX}-session-token-expired`;

const testSessionExpired = {
  id: `${TEST_PREFIX}-session-expired`,
  token: SESSION_TOKEN_EXPIRED,
  userId: testUser1.id,
  activeOrganizationId: testOrg1.id,
  expiresAt: new Date("2020-01-01"),
  createdAt: new Date(),
  updatedAt: new Date(),
  ipAddress: null,
  userAgent: null,
};

const testSubscriptionOrg1 = {
  id: `${TEST_PREFIX}-sub-1`,
  plan: "starter",
  referenceId: testOrg1.id,
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  status: "active",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const testSubscriptionOrg2 = {
  id: `${TEST_PREFIX}-sub-2`,
  plan: "growth",
  referenceId: testOrg2.id,
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  status: "active",
  createdAt: new Date(),
  updatedAt: new Date(),
};

// --- Test app using the real auth middleware ---

function createTestApp() {
  return createAuthenticatedRoutes("/v1").get("/me", ({ auth }) => ({
    organizationId: auth!.organizationId,
    userId: auth!.userId,
    planId: auth!.planId,
    apiKeyId: auth!.apiKeyId,
  }));
}

// --- DB setup/teardown ---

beforeAll(async () => {
  // Insert users
  await db
    .insert(user)
    .values([testUser1, testUser2])
    .onConflictDoUpdate({ target: user.id, set: { updatedAt: new Date() } });

  // Insert orgs
  await db
    .insert(organization)
    .values([testOrg1, testOrg2])
    .onConflictDoUpdate({
      target: organization.id,
      set: { name: testOrg1.name },
    });

  // Insert memberships
  await db
    .insert(member)
    .values([
      {
        id: `${TEST_PREFIX}-member-1`,
        organizationId: testOrg1.id,
        userId: testUser1.id,
        role: "owner",
        createdAt: new Date(),
      },
      {
        id: `${TEST_PREFIX}-member-2`,
        organizationId: testOrg2.id,
        userId: testUser2.id,
        role: "owner",
        createdAt: new Date(),
      },
    ])
    .onConflictDoUpdate({ target: member.id, set: { role: "owner" } });

  // Insert subscriptions
  await db
    .insert(subscription)
    .values([testSubscriptionOrg1, testSubscriptionOrg2])
    .onConflictDoUpdate({
      target: subscription.id,
      set: { updatedAt: new Date() },
    });

  // Insert API keys
  await db
    .insert(apiKey)
    .values([testApiKeyOrg1, testApiKeyOrg2, testApiKeyExpired])
    .onConflictDoUpdate({
      target: apiKey.id,
      set: { createdAt: new Date() },
    });

  // Insert sessions
  await db
    .insert(session)
    .values([testSessionOrg1, testSessionExpired])
    .onConflictDoUpdate({
      target: session.id,
      set: { updatedAt: new Date() },
    });
});

afterAll(async () => {
  await db.delete(session).where(eq(session.userId, testUser1.id));
  const orgIds = [testOrg1.id, testOrg2.id];
  const userIds = [testUser1.id, testUser2.id];
  await db.delete(apiKey).where(inArray(apiKey.organizationId, orgIds));
  await db.delete(member).where(inArray(member.organizationId, orgIds));
  await db
    .delete(subscription)
    .where(inArray(subscription.referenceId, orgIds));
  await db.delete(organization).where(inArray(organization.id, orgIds));
  await db.delete(user).where(inArray(user.id, userIds));
});

// --- Tests ---

describe("Authentication", () => {
  describe("API Key Authentication", () => {
    it("authenticates with valid API key", async () => {
      const app = createTestApp();
      const response = await app.handle(
        new Request("http://localhost/v1/me", {
          headers: { Authorization: `Bearer ${RAW_KEY_ORG1}` },
        })
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.organizationId).toBe(testOrg1.id);
      expect(body.apiKeyId).toBe(testApiKeyOrg1.id);
      expect(body.userId).toBe(testUser1.id);
    });

    it("returns plan from subscription", async () => {
      const app = createTestApp();
      const response = await app.handle(
        new Request("http://localhost/v1/me", {
          headers: { Authorization: `Bearer ${RAW_KEY_ORG1}` },
        })
      );

      const body = await response.json();
      expect(body.planId).toBe("starter");
    });

    it("different org gets different plan", async () => {
      const app = createTestApp();
      const response = await app.handle(
        new Request("http://localhost/v1/me", {
          headers: { Authorization: `Bearer ${RAW_KEY_ORG2}` },
        })
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.organizationId).toBe(testOrg2.id);
      expect(body.planId).toBe("growth");
    });

    it("rejects invalid API key", async () => {
      const app = createTestApp();
      const response = await app.handle(
        new Request("http://localhost/v1/me", {
          headers: { Authorization: "Bearer wraps_live_doesnotexist" },
        })
      );

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error).toContain("invalid API key");
    });

    it("rejects expired API key", async () => {
      const app = createTestApp();
      const response = await app.handle(
        new Request("http://localhost/v1/me", {
          headers: { Authorization: `Bearer ${RAW_KEY_EXPIRED}` },
        })
      );

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error).toContain("invalid API key");
    });

    it("handles API key without Bearer prefix", async () => {
      const app = createTestApp();
      const response = await app.handle(
        new Request("http://localhost/v1/me", {
          headers: { Authorization: RAW_KEY_ORG1 },
        })
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.organizationId).toBe(testOrg1.id);
    });

    it("updates lastUsedAt on successful auth", async () => {
      const app = createTestApp();
      const before = new Date();

      await app.handle(
        new Request("http://localhost/v1/me", {
          headers: { Authorization: `Bearer ${RAW_KEY_ORG1}` },
        })
      );

      const [updatedKey] = await db
        .select({ lastUsedAt: apiKey.lastUsedAt })
        .from(apiKey)
        .where(eq(apiKey.id, testApiKeyOrg1.id))
        .limit(1);

      expect(updatedKey.lastUsedAt).toBeInstanceOf(Date);
      expect(updatedKey.lastUsedAt!.getTime()).toBeGreaterThanOrEqual(
        before.getTime() - 1000
      );
    });
  });

  describe("Session Authentication", () => {
    it("authenticates with valid session token", async () => {
      const app = createTestApp();
      const response = await app.handle(
        new Request("http://localhost/v1/me", {
          headers: { Authorization: `Bearer ${SESSION_TOKEN_ORG1}` },
        })
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.organizationId).toBe(testOrg1.id);
      expect(body.userId).toBe(testUser1.id);
      expect(body.apiKeyId).toBeNull();
    });

    it("rejects invalid session token", async () => {
      const app = createTestApp();
      const response = await app.handle(
        new Request("http://localhost/v1/me", {
          headers: { Authorization: "Bearer invalid-session-token" },
        })
      );

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error).toContain("session not found");
    });

    it("rejects expired session", async () => {
      const app = createTestApp();
      const response = await app.handle(
        new Request("http://localhost/v1/me", {
          headers: { Authorization: `Bearer ${SESSION_TOKEN_EXPIRED}` },
        })
      );

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error).toContain("session expired");
    });

    it("rejects session for non-member org via X-Organization-Id header", async () => {
      const app = createTestApp();
      // User 1 trying to access Org 2 (they're not a member)
      const response = await app.handle(
        new Request("http://localhost/v1/me", {
          headers: {
            Authorization: `Bearer ${SESSION_TOKEN_ORG1}`,
            "X-Organization-Id": testOrg2.id,
          },
        })
      );

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error).toContain("not member of org");
    });
  });

  describe("No Auth", () => {
    it("rejects requests without auth header", async () => {
      const app = createTestApp();
      const response = await app.handle(new Request("http://localhost/v1/me"));

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error).toContain("no auth header");
    });
  });

  describe("Concurrent Requests", () => {
    it("isolates auth context across concurrent requests", async () => {
      const app = createTestApp();

      const [r1, r2, r3] = await Promise.all([
        app.handle(
          new Request("http://localhost/v1/me", {
            headers: { Authorization: `Bearer ${RAW_KEY_ORG1}` },
          })
        ),
        app.handle(
          new Request("http://localhost/v1/me", {
            headers: { Authorization: `Bearer ${RAW_KEY_ORG2}` },
          })
        ),
        app.handle(
          new Request("http://localhost/v1/me", {
            headers: { Authorization: `Bearer ${SESSION_TOKEN_ORG1}` },
          })
        ),
      ]);

      const [b1, b2, b3] = await Promise.all([r1.json(), r2.json(), r3.json()]);

      expect(b1.organizationId).toBe(testOrg1.id);
      expect(b2.organizationId).toBe(testOrg2.id);
      expect(b3.organizationId).toBe(testOrg1.id);

      // API key vs session auth
      expect(b1.apiKeyId).toBe(testApiKeyOrg1.id);
      expect(b3.apiKeyId).toBeNull();
    });
  });

  describe("Security Edge Cases", () => {
    it("rejects empty authorization header", async () => {
      const app = createTestApp();
      const response = await app.handle(
        new Request("http://localhost/v1/me", {
          headers: { Authorization: "" },
        })
      );

      expect(response.status).toBe(401);
    });

    it("rejects Bearer with no token", async () => {
      const app = createTestApp();
      const response = await app.handle(
        new Request("http://localhost/v1/me", {
          headers: { Authorization: "Bearer " },
        })
      );

      expect(response.status).toBe(401);
    });

    it("rejects non-wraps_ prefix tokens as invalid sessions", async () => {
      const app = createTestApp();
      const response = await app.handle(
        new Request("http://localhost/v1/me", {
          headers: { Authorization: "Bearer some_random_token" },
        })
      );

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error).toContain("session not found");
    });

    it("handles very long API keys gracefully", async () => {
      const app = createTestApp();
      const longKey = `wraps_live_${"a".repeat(10_000)}`;
      const response = await app.handle(
        new Request("http://localhost/v1/me", {
          headers: { Authorization: `Bearer ${longKey}` },
        })
      );

      expect(response.status).toBe(401);
    });

    it("prevents auth header injection via wrong header name", async () => {
      const app = createTestApp();
      const response = await app.handle(
        new Request("http://localhost/v1/me", {
          headers: { "X-Authorization": `Bearer ${RAW_KEY_ORG1}` },
        })
      );

      expect(response.status).toBe(401);
    });
  });
});
