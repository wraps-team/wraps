/**
 * Connections Routes — Real DB Integration Tests
 *
 * Tests cross-domain behavior that can only be verified with a real database.
 * The mocked unit tests in connection-limit-race.test.ts cover:
 *   - Transaction wrapping, FOR UPDATE lock, plan limit logic, upsert at limit
 *
 * This file covers what only a real DB can verify:
 *   - Actual row insertion and field persistence
 *   - Upsert returns same connectionId/externalId, new webhookSecret
 *   - GET list returns correct shape (no webhookSecret, webhookConnected: true)
 *   - Org-scoping (other org sees empty list)
 *   - DELETE clears webhookSecret but preserves row
 *   - DELETE 404 for unknown id
 *   - DELETE IDOR (cannot delete another org's connection)
 *   - Plan limit enforced against real count in DB
 */

import { awsAccount, db, eq, member, organization, user } from "@wraps/db";
import { and } from "drizzle-orm";
import { Elysia } from "elysia";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AuthContext } from "../middleware/auth";
import { connectionsRoutes } from "../routes/connections";

const TEST_PREFIX = "conn-int-test";

// --- Fixtures ---

const testUser = {
  id: `${TEST_PREFIX}-user-1`,
  email: `${TEST_PREFIX}@example.com`,
  name: "Connections Integration Test User",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  image: null,
  twoFactorEnabled: false,
  stripeCustomerId: null,
};

const testOrg = {
  id: `${TEST_PREFIX}-org-1`,
  name: "Connections Integration Test Org",
  slug: `${TEST_PREFIX}-org`,
  createdAt: new Date(),
  logo: null,
  metadata: null,
};

const testMember = {
  id: `${TEST_PREFIX}-member-1`,
  organizationId: testOrg.id,
  userId: testUser.id,
  role: "owner" as const,
  createdAt: new Date(),
};

// Second org for IDOR tests
const otherUser = {
  id: `${TEST_PREFIX}-user-2`,
  email: `${TEST_PREFIX}-other@example.com`,
  name: "Other Org User",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  image: null,
  twoFactorEnabled: false,
  stripeCustomerId: null,
};

const otherOrg = {
  id: `${TEST_PREFIX}-org-2`,
  name: "Other Org",
  slug: `${TEST_PREFIX}-other-org`,
  createdAt: new Date(),
  logo: null,
  metadata: null,
};

const otherMember = {
  id: `${TEST_PREFIX}-member-2`,
  organizationId: otherOrg.id,
  userId: otherUser.id,
  role: "owner" as const,
  createdAt: new Date(),
};

// --- Auth contexts ---

const freeAuth: AuthContext = {
  apiKeyId: null,
  organizationId: testOrg.id,
  userId: testUser.id,
  planId: "free",
};

const otherOrgAuth: AuthContext = {
  apiKeyId: null,
  organizationId: otherOrg.id,
  userId: otherUser.id,
  planId: "free",
};

// --- Helpers ---

function createTestApp(authOverride?: Partial<AuthContext>) {
  const auth: AuthContext = { ...freeAuth, ...authOverride };
  return new Elysia().derive(() => ({ auth })).use(connectionsRoutes);
}

function postConnection(
  app: ReturnType<typeof createTestApp>,
  body: Record<string, unknown> = {}
) {
  return app.handle(
    new Request("http://localhost/v1/connections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountId: "123456789012",
        region: "us-east-1",
        ...body,
      }),
    })
  );
}

function getConnections(app: ReturnType<typeof createTestApp>) {
  return app.handle(new Request("http://localhost/v1/connections"));
}

function deleteConnection(app: ReturnType<typeof createTestApp>, id: string) {
  return app.handle(
    new Request(`http://localhost/v1/connections/${id}`, { method: "DELETE" })
  );
}

// --- Setup / teardown ---

beforeAll(async () => {
  await db
    .insert(user)
    .values(testUser)
    .onConflictDoUpdate({ target: user.id, set: { updatedAt: new Date() } });

  await db
    .insert(user)
    .values(otherUser)
    .onConflictDoUpdate({ target: user.id, set: { updatedAt: new Date() } });

  await db
    .insert(organization)
    .values(testOrg)
    .onConflictDoUpdate({
      target: organization.id,
      set: { name: testOrg.name },
    });

  await db
    .insert(organization)
    .values(otherOrg)
    .onConflictDoUpdate({
      target: organization.id,
      set: { name: otherOrg.name },
    });

  await db
    .insert(member)
    .values(testMember)
    .onConflictDoUpdate({ target: member.id, set: { role: testMember.role } });

  await db
    .insert(member)
    .values(otherMember)
    .onConflictDoUpdate({
      target: member.id,
      set: { role: otherMember.role },
    });
});

afterAll(async () => {
  // member rows cascade-delete from org; delete orgs first, then users
  await db.delete(organization).where(eq(organization.id, testOrg.id));
  await db.delete(organization).where(eq(organization.id, otherOrg.id));
  await db.delete(user).where(eq(user.id, testUser.id));
  await db.delete(user).where(eq(user.id, otherUser.id));
});

beforeEach(async () => {
  // Delete all aws_account rows for both test orgs so each test starts clean
  await db.delete(awsAccount).where(eq(awsAccount.organizationId, testOrg.id));
  await db.delete(awsAccount).where(eq(awsAccount.organizationId, otherOrg.id));
});

// --- Tests ---

describe("POST /v1/connections — real DB", () => {
  it("creates a connection and returns expected fields", async () => {
    const app = createTestApp();
    const res = await postConnection(app);

    expect(res.status).toBe(201);
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(typeof body.connectionId).toBe("string");
    expect(body.connectionId.length).toBeGreaterThan(0);
    expect(typeof body.externalId).toBe("string");
    expect(body.externalId).toMatch(/^wraps_[0-9a-f]{32}$/);
    expect(body.roleArn).toBe(
      "arn:aws:iam::123456789012:role/wraps-console-access-role"
    );
    expect(typeof body.webhookSecret).toBe("string");
    expect(body.webhookSecret.length).toBeGreaterThan(0);
    expect(body.webhookEndpoint).toBe(
      "https://api.wraps.dev/webhooks/ses/123456789012"
    );
  });

  it("persists the row to the database with correct values", async () => {
    const app = createTestApp();
    const res = await postConnection(app, {
      accountId: "111122223333",
      region: "eu-west-1",
      name: "My EU Account",
    });

    expect(res.status).toBe(201);
    const body = await res.json();

    const [row] = await db
      .select()
      .from(awsAccount)
      .where(eq(awsAccount.id, body.connectionId));

    expect(row).toBeDefined();
    expect(row.organizationId).toBe(testOrg.id);
    expect(row.accountId).toBe("111122223333");
    expect(row.region).toBe("eu-west-1");
    expect(row.name).toBe("My EU Account");
    expect(row.externalId).toBe(body.externalId);
    expect(row.webhookSecret).toBe(body.webhookSecret);
    expect(row.isVerified).toBe(true);
    expect(row.createdBy).toBe(testUser.id);
  });

  it("uses accountId as default name when name is omitted", async () => {
    const app = createTestApp();
    const res = await postConnection(app);
    const body = await res.json();

    const [row] = await db
      .select({ name: awsAccount.name })
      .from(awsAccount)
      .where(eq(awsAccount.id, body.connectionId));

    expect(row.name).toBe("AWS 123456789012");
  });
});

describe("POST /v1/connections — upsert (real DB)", () => {
  it("returns 200 and same connectionId/externalId when same accountId is posted again", async () => {
    const app = createTestApp();

    const first = await postConnection(app);
    expect(first.status).toBe(201);
    const firstBody = await first.json();

    const second = await postConnection(app);
    expect(second.status).toBe(200);
    const secondBody = await second.json();

    expect(secondBody.success).toBe(true);
    expect(secondBody.connectionId).toBe(firstBody.connectionId);
    expect(secondBody.externalId).toBe(firstBody.externalId);
  });

  it("issues a new webhookSecret on upsert", async () => {
    const app = createTestApp();

    const first = await postConnection(app);
    const firstBody = await first.json();

    const second = await postConnection(app);
    const secondBody = await second.json();

    expect(secondBody.webhookSecret).not.toBe(firstBody.webhookSecret);
  });

  it("only one row exists in DB after create + upsert", async () => {
    const app = createTestApp();
    await postConnection(app);
    await postConnection(app);

    const rows = await db
      .select()
      .from(awsAccount)
      .where(eq(awsAccount.organizationId, testOrg.id));

    expect(rows).toHaveLength(1);
  });
});

describe("GET /v1/connections — real DB", () => {
  it("returns empty connections array when org has no connections", async () => {
    const app = createTestApp();
    const res = await getConnections(app);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.connections).toEqual([]);
  });

  it("returns the created connection with expected fields", async () => {
    const app = createTestApp();
    await postConnection(app);

    const res = await getConnections(app);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.connections).toHaveLength(1);
    const conn = body.connections[0];

    expect(typeof conn.id).toBe("string");
    expect(conn.accountId).toBe("123456789012");
    expect(conn.region).toBe("us-east-1");
    expect(conn.isVerified).toBe(true);
    expect(conn.webhookConnected).toBe(true);
    // GET must NOT expose the webhook secret
    expect(conn.webhookSecret).toBeUndefined();
    expect(conn.externalId).toBeUndefined();
    // Dates are serialized to ISO strings
    expect(typeof conn.createdAt).toBe("string");
    expect(conn.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("exposes lastEventReceivedAt as null when no webhook event has arrived", async () => {
    const app = createTestApp();
    await postConnection(app);

    const res = await getConnections(app);
    const body = await res.json();

    expect(body.connections).toHaveLength(1);
    expect(body.connections[0].lastEventReceivedAt).toBeNull();
  });

  it("reports webhookConnected: false and hides webhookSecret after disconnect", async () => {
    const app = createTestApp();
    const postRes = await postConnection(app);
    const { connectionId } = await postRes.json();

    const delRes = await deleteConnection(app, connectionId);
    expect(delRes.status).toBe(200);

    const res = await getConnections(app);
    const body = await res.json();

    expect(body.connections).toHaveLength(1);
    const conn = body.connections[0];
    expect(conn.webhookConnected).toBe(false);
    expect(conn.webhookSecret).toBeUndefined();
  });

  it("is scoped to the authenticated org — other org sees empty list", async () => {
    const appA = createTestApp({ organizationId: testOrg.id });
    const appB = createTestApp({
      organizationId: otherOrg.id,
      userId: otherUser.id,
    });

    // Create a connection for testOrg
    await postConnection(appA);

    const resA = await getConnections(appA);
    const bodyA = await resA.json();
    expect(bodyA.connections).toHaveLength(1);

    // otherOrg should still see nothing
    const resB = await getConnections(appB);
    const bodyB = await resB.json();
    expect(bodyB.connections).toHaveLength(0);
  });
});

describe("DELETE /v1/connections/:id — real DB", () => {
  it("returns { success: true } and preserves row but nulls webhookSecret", async () => {
    const app = createTestApp();
    const postRes = await postConnection(app);
    const { connectionId } = await postRes.json();

    const delRes = await deleteConnection(app, connectionId);
    expect(delRes.status).toBe(200);
    const delBody = await delRes.json();
    expect(delBody.success).toBe(true);

    // Row still exists
    const [row] = await db
      .select()
      .from(awsAccount)
      .where(eq(awsAccount.id, connectionId));

    expect(row).toBeDefined();
    expect(row.webhookSecret).toBeNull();
  });

  it("returns 404 for a nonexistent connection id", async () => {
    const app = createTestApp();
    const res = await deleteConnection(
      app,
      "nonexistent-id-that-does-not-exist"
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Connection not found");
  });

  it("cannot delete another org's connection (IDOR — returns 404)", async () => {
    // Create a connection belonging to testOrg
    const appTestOrg = createTestApp({ organizationId: testOrg.id });
    const postRes = await postConnection(appTestOrg);
    const { connectionId } = await postRes.json();

    // otherOrg tries to delete testOrg's connection
    const appOtherOrg = createTestApp({
      organizationId: otherOrg.id,
      userId: otherUser.id,
    });
    const delRes = await deleteConnection(appOtherOrg, connectionId);
    expect(delRes.status).toBe(404);

    // Verify the row was NOT modified
    const [row] = await db
      .select({ webhookSecret: awsAccount.webhookSecret })
      .from(awsAccount)
      .where(eq(awsAccount.id, connectionId));

    expect(row.webhookSecret).not.toBeNull();
  });
});

describe("Plan limit enforcement (real DB count)", () => {
  it("allows the first connection on free plan (201)", async () => {
    const app = createTestApp({ planId: "free" });
    const res = await postConnection(app);
    expect(res.status).toBe(201);
  });

  it("blocks a second different accountId on free plan (403)", async () => {
    const app = createTestApp({ planId: "free" });

    // First connection — should succeed
    const first = await postConnection(app, { accountId: "111122223333" });
    expect(first.status).toBe(201);

    // Second connection with a different accountId — should be blocked
    const second = await postConnection(app, { accountId: "444455556666" });
    expect(second.status).toBe(403);
    const body = await second.json();
    expect(body.error).toContain("AWS account limit reached");
    expect(body.error).toContain("1");
  });

  it("allows upsert of an existing accountId even when at the free plan limit", async () => {
    const app = createTestApp({ planId: "free" });

    await postConnection(app, { accountId: "123456789012" });

    // Re-posting the same accountId is an upsert, must succeed even at limit
    const upsert = await postConnection(app, { accountId: "123456789012" });
    expect(upsert.status).toBe(200);
    const body = await upsert.json();
    expect(body.success).toBe(true);
  });

  it("allows unlimited connections on scale plan", async () => {
    const app = createTestApp({ planId: "scale" });

    const accountIds = ["100000000001", "100000000002", "100000000003"];

    for (const accountId of accountIds) {
      const res = await postConnection(app, { accountId });
      expect(res.status).toBe(201);
    }

    const rows = await db
      .select()
      .from(awsAccount)
      .where(eq(awsAccount.organizationId, testOrg.id));

    expect(rows).toHaveLength(3);
  });
});
