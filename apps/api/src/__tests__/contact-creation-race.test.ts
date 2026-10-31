/**
 * Contact creation race condition test
 *
 * Verifies that concurrent POST /v1/contacts with the same email
 * cannot create duplicate contacts. The route must use INSERT...ON CONFLICT
 * instead of SELECT-then-INSERT to prevent the TOCTOU race.
 */

import { contact, db, member, organization, user } from "@wraps/db";
import { eq } from "drizzle-orm";
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
import { contactsRoutes } from "../routes/contacts";
import { FULL_ACCESS_PERMISSIONS } from "../services/api-keys";

vi.mock("@wraps/email", () => ({
  sendTopicConfirmationEmail: vi.fn().mockResolvedValue(true),
}));

const TEST_PREFIX = "contact-race";

const testUser = {
  id: `${TEST_PREFIX}-user-1`,
  email: `${TEST_PREFIX}@example.com`,
  name: "Race Condition Test User",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  image: null,
  twoFactorEnabled: false,
  stripeCustomerId: null,
};

const testOrg = {
  id: `${TEST_PREFIX}-org-1`,
  name: "Race Condition Test Org",
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

const mockAuth = {
  apiKeyId: `${TEST_PREFIX}-key-1`,
  organizationId: testOrg.id,
  userId: testUser.id,
  planId: "pro",
  apiKeyScopes: [...FULL_ACCESS_PERMISSIONS],
};

function createTestApp() {
  return new Elysia().derive(() => ({ auth: mockAuth })).use(contactsRoutes);
}

beforeAll(async () => {
  await db
    .insert(user)
    .values(testUser)
    .onConflictDoUpdate({ target: user.id, set: { updatedAt: new Date() } });
  await db
    .insert(organization)
    .values(testOrg)
    .onConflictDoUpdate({
      target: organization.id,
      set: { name: testOrg.name },
    });
  await db
    .insert(member)
    .values(testMember)
    .onConflictDoUpdate({ target: member.id, set: { role: testMember.role } });
});

beforeEach(async () => {
  await db.delete(contact).where(eq(contact.organizationId, testOrg.id));
});

afterAll(async () => {
  await db.delete(contact).where(eq(contact.organizationId, testOrg.id));
  await db.delete(member).where(eq(member.id, testMember.id));
  await db.delete(organization).where(eq(organization.id, testOrg.id));
  await db.delete(user).where(eq(user.id, testUser.id));
});

describe("Contact creation race condition", () => {
  it("INSERT hitting unique constraint returns 409 not 500", async () => {
    // Simulate the TOCTOU race: a contact exists in the DB but the route's
    // SELECT check has already passed (stale read). The INSERT will hit the
    // unique constraint. The route must handle this gracefully as 409.
    const app = createTestApp();
    const email = `${TEST_PREFIX}-race@example.com`;

    // Pre-insert a contact directly in DB (simulates the other request winning the race)
    const { createHash } = await import("node:crypto");
    const emailHash = createHash("sha256")
      .update(email.toLowerCase())
      .digest("hex");
    await db.insert(contact).values({
      organizationId: testOrg.id,
      email,
      emailHash,
      emailStatus: "active",
      properties: {},
    });

    // Monkey-patch db.select for ONE call to return empty, simulating stale read.
    // This forces the code past the duplicate check into the INSERT path.
    const originalSelect = db.select.bind(db);
    let intercepted = false;
    vi.spyOn(db, "select").mockImplementation((...args: unknown[]) => {
      // Let the first select (email duplicate check) return empty
      if (!intercepted) {
        intercepted = true;
        return {
          from: () => ({
            where: () => ({
              limit: () => Promise.resolve([]),
            }),
          }),
        } as any;
      }
      return (originalSelect as any)(...args);
    });

    const res = await app.handle(
      new Request("http://localhost/v1/contacts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      })
    );

    vi.restoreAllMocks();

    // Must be 409 (conflict), not 500 (unhandled unique constraint violation)
    expect(res.status).toBe(409);

    // Verify still only one contact
    const contacts = await db
      .select({ id: contact.id })
      .from(contact)
      .where(eq(contact.organizationId, testOrg.id));
    expect(contacts).toHaveLength(1);
  });

  it("concurrent POST /v1/contacts with same email: no 500, exactly one contact", async () => {
    const app = createTestApp();
    const email = `${TEST_PREFIX}-concurrent@example.com`;

    const results = await Promise.all(
      [1, 2, 3].map(() =>
        app.handle(
          new Request("http://localhost/v1/contacts", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email }),
          })
        )
      )
    );

    const statuses = results.map((r) => r.status);

    // No 500s — all should be 201 (created) or 409 (conflict)
    for (const status of statuses) {
      expect([201, 409]).toContain(status);
    }

    // Exactly one 201 (created), rest 409 (conflict)
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(2);

    // Exactly one contact in DB
    const contacts = await db
      .select({ id: contact.id })
      .from(contact)
      .where(eq(contact.organizationId, testOrg.id));
    expect(contacts).toHaveLength(1);
  });
});
