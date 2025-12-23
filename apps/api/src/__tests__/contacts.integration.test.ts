/**
 * Contacts API Integration Tests
 *
 * Tests the actual route handlers with a real database.
 */

import {
  contact,
  contactTopic,
  db,
  member,
  organization,
  topic,
  user,
} from "@wraps/db";
import { eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { contactsRoutes } from "../routes/contacts";

// Test data IDs (unique to avoid conflicts with other tests)
const TEST_PREFIX = "api-contacts-int";
const testUser = {
  id: `${TEST_PREFIX}-user-1`,
  email: `${TEST_PREFIX}@example.com`,
  name: "API Contacts Test User",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  image: null,
  twoFactorEnabled: false,
  stripeCustomerId: null,
};

const testOrg = {
  id: `${TEST_PREFIX}-org-1`,
  name: "API Contacts Test Org",
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

const testTopic = {
  id: `${TEST_PREFIX}-topic-1`,
  organizationId: testOrg.id,
  name: "Test Newsletter",
  slug: "test-newsletter",
  description: "Test topic for API tests",
  public: true,
  doubleOptIn: false,
  subscriberCount: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: testUser.id,
};

// Mock auth context
const mockAuth = {
  apiKeyId: `${TEST_PREFIX}-key-1`,
  organizationId: testOrg.id,
  userId: testUser.id,
  planId: "pro",
};

// Create test app with mocked auth (bypasses actual API key validation)
function createTestApp() {
  return new Elysia().derive(() => ({ auth: mockAuth })).use(contactsRoutes);
}

// Setup test data
beforeAll(async () => {
  // Insert test user
  await db
    .insert(user)
    .values(testUser)
    .onConflictDoUpdate({
      target: user.id,
      set: { updatedAt: new Date() },
    });

  // Insert test organization
  await db
    .insert(organization)
    .values(testOrg)
    .onConflictDoUpdate({
      target: organization.id,
      set: { name: testOrg.name },
    });

  // Insert test member
  await db
    .insert(member)
    .values(testMember)
    .onConflictDoUpdate({
      target: member.id,
      set: { role: testMember.role },
    });

  // Insert test topic
  await db
    .insert(topic)
    .values(testTopic)
    .onConflictDoUpdate({
      target: topic.id,
      set: { name: testTopic.name },
    });
});

// Clean up contacts before each test
beforeEach(async () => {
  await db.delete(contact).where(eq(contact.organizationId, testOrg.id));
});

// Clean up after all tests
afterAll(async () => {
  await db.delete(contact).where(eq(contact.organizationId, testOrg.id));
  await db.delete(topic).where(eq(topic.organizationId, testOrg.id));
  await db.delete(member).where(eq(member.organizationId, testOrg.id));
  await db.delete(organization).where(eq(organization.id, testOrg.id));
  await db.delete(user).where(eq(user.id, testUser.id));
});

describe("Contacts API Integration", () => {
  describe("GET /v1/contacts", () => {
    it("returns empty list when no contacts exist", async () => {
      const app = createTestApp();
      const response = await app.handle(
        new Request("http://localhost/v1/contacts")
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.contacts).toHaveLength(0);
      expect(body.total).toBe(0);
    });

    it("returns paginated contacts", async () => {
      // Insert test contacts
      await db.insert(contact).values([
        {
          organizationId: testOrg.id,
          email: "contact1@test.com",
          emailHash: "hash1",
          emailStatus: "active",
          properties: {},
          createdBy: testUser.id,
        },
        {
          organizationId: testOrg.id,
          email: "contact2@test.com",
          emailHash: "hash2",
          emailStatus: "active",
          properties: {},
          createdBy: testUser.id,
        },
      ]);

      const app = createTestApp();
      const response = await app.handle(
        new Request("http://localhost/v1/contacts?page=1&pageSize=10")
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.contacts).toHaveLength(2);
      expect(body.total).toBe(2);
      expect(body.page).toBe(1);
      expect(body.pageSize).toBe(10);
    });

    it("filters by emailStatus", async () => {
      await db.insert(contact).values([
        {
          organizationId: testOrg.id,
          email: "active@test.com",
          emailHash: "hash-active",
          emailStatus: "active",
          properties: {},
        },
        {
          organizationId: testOrg.id,
          email: "bounced@test.com",
          emailHash: "hash-bounced",
          emailStatus: "bounced",
          properties: {},
        },
      ]);

      const app = createTestApp();
      const response = await app.handle(
        new Request("http://localhost/v1/contacts?emailStatus=active")
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.contacts).toHaveLength(1);
      expect(body.contacts[0].email).toBe("active@test.com");
    });

    it("searches by email", async () => {
      await db.insert(contact).values([
        {
          organizationId: testOrg.id,
          email: "john@example.com",
          emailHash: "hash-john",
          properties: {},
        },
        {
          organizationId: testOrg.id,
          email: "jane@test.com",
          emailHash: "hash-jane",
          properties: {},
        },
      ]);

      const app = createTestApp();
      const response = await app.handle(
        new Request("http://localhost/v1/contacts?search=john")
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.contacts).toHaveLength(1);
      expect(body.contacts[0].email).toBe("john@example.com");
    });
  });

  describe("GET /v1/contacts/:id", () => {
    it("returns contact with topics", async () => {
      // Insert contact
      const [newContact] = await db
        .insert(contact)
        .values({
          organizationId: testOrg.id,
          email: "test@example.com",
          emailHash: "hash-test",
          emailStatus: "active",
          properties: { name: "Test User" },
        })
        .returning();

      // Subscribe to topic
      await db.insert(contactTopic).values({
        contactId: newContact.id,
        topicId: testTopic.id,
        status: "subscribed",
      });

      const app = createTestApp();
      const response = await app.handle(
        new Request(`http://localhost/v1/contacts/${newContact.id}`)
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.id).toBe(newContact.id);
      expect(body.email).toBe("test@example.com");
      expect(body.topics).toHaveLength(1);
      expect(body.topics[0].topicName).toBe("Test Newsletter");
    });

    it("returns 404 for non-existent contact", async () => {
      const app = createTestApp();
      const response = await app.handle(
        new Request("http://localhost/v1/contacts/non-existent-id")
      );

      expect(response.status).toBe(404);
    });
  });

  describe("POST /v1/contacts", () => {
    it("creates contact with email", async () => {
      const app = createTestApp();
      const response = await app.handle(
        new Request("http://localhost/v1/contacts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "new@example.com",
            properties: { name: "New User" },
          }),
        })
      );

      expect(response.status).toBe(201);

      const body = await response.json();
      expect(body.email).toBe("new@example.com");
      expect(body.emailStatus).toBe("active");

      // Verify in database
      const [dbContact] = await db
        .select()
        .from(contact)
        .where(eq(contact.id, body.id));
      expect(dbContact).toBeDefined();
      expect(dbContact.email).toBe("new@example.com");
    });

    it("creates contact with phone", async () => {
      const app = createTestApp();
      const response = await app.handle(
        new Request("http://localhost/v1/contacts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone: "+15551234567",
          }),
        })
      );

      expect(response.status).toBe(201);

      const body = await response.json();
      expect(body.phone).toBe("+15551234567");
      expect(body.smsStatus).toBe("pending_consent");
    });

    it("creates contact with topic subscriptions", async () => {
      const app = createTestApp();
      const response = await app.handle(
        new Request("http://localhost/v1/contacts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "subscriber@example.com",
            topicIds: [testTopic.id],
          }),
        })
      );

      expect(response.status).toBe(201);

      const body = await response.json();

      // Verify topic subscription in database
      const subscriptions = await db
        .select()
        .from(contactTopic)
        .where(eq(contactTopic.contactId, body.id));
      expect(subscriptions).toHaveLength(1);
      expect(subscriptions[0].topicId).toBe(testTopic.id);
    });

    it("returns 400 when no email or phone provided", async () => {
      const app = createTestApp();
      const response = await app.handle(
        new Request("http://localhost/v1/contacts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        })
      );

      expect(response.status).toBe(400);

      const body = await response.json();
      expect(body.error).toBe("Email or phone is required");
    });

    it("returns 409 for duplicate email", async () => {
      // Create first contact
      const app = createTestApp();
      const firstResponse = await app.handle(
        new Request("http://localhost/v1/contacts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "existing@example.com",
          }),
        })
      );
      expect(firstResponse.status).toBe(201);

      // Try to create duplicate
      const response = await app.handle(
        new Request("http://localhost/v1/contacts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "existing@example.com",
          }),
        })
      );

      expect(response.status).toBe(409);

      const body = await response.json();
      expect(body.error).toContain("already exists");
    });
  });

  describe("PATCH /v1/contacts/:id", () => {
    it("updates contact email", async () => {
      const [existing] = await db
        .insert(contact)
        .values({
          organizationId: testOrg.id,
          email: "old@example.com",
          emailHash: "hash-old",
          properties: {},
        })
        .returning();

      const app = createTestApp();
      const response = await app.handle(
        new Request(`http://localhost/v1/contacts/${existing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "new@example.com",
          }),
        })
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.email).toBe("new@example.com");

      // Verify in database
      const [updated] = await db
        .select()
        .from(contact)
        .where(eq(contact.id, existing.id));
      expect(updated.email).toBe("new@example.com");
    });

    it("updates contact properties", async () => {
      const [existing] = await db
        .insert(contact)
        .values({
          organizationId: testOrg.id,
          email: "props@example.com",
          emailHash: "hash-props",
          properties: { name: "Old Name" },
        })
        .returning();

      const app = createTestApp();
      const response = await app.handle(
        new Request(`http://localhost/v1/contacts/${existing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            properties: { name: "New Name", company: "Acme Inc" },
          }),
        })
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.properties).toEqual({
        name: "New Name",
        company: "Acme Inc",
      });
    });

    it("returns 404 for non-existent contact", async () => {
      const app = createTestApp();
      const response = await app.handle(
        new Request("http://localhost/v1/contacts/non-existent", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "new@example.com" }),
        })
      );

      expect(response.status).toBe(404);
    });
  });

  describe("DELETE /v1/contacts/:id", () => {
    it("deletes contact", async () => {
      const [existing] = await db
        .insert(contact)
        .values({
          organizationId: testOrg.id,
          email: "delete@example.com",
          emailHash: "hash-delete",
          properties: {},
        })
        .returning();

      const app = createTestApp();
      const response = await app.handle(
        new Request(`http://localhost/v1/contacts/${existing.id}`, {
          method: "DELETE",
        })
      );

      expect(response.status).toBe(200);

      // Verify deleted from database
      const [deleted] = await db
        .select()
        .from(contact)
        .where(eq(contact.id, existing.id));
      expect(deleted).toBeUndefined();
    });

    it("returns 404 for non-existent contact", async () => {
      const app = createTestApp();
      const response = await app.handle(
        new Request("http://localhost/v1/contacts/non-existent", {
          method: "DELETE",
        })
      );

      expect(response.status).toBe(404);
    });
  });

  describe("DELETE /v1/contacts (bulk)", () => {
    it("deletes multiple contacts", async () => {
      const inserted = await db
        .insert(contact)
        .values([
          {
            organizationId: testOrg.id,
            email: "bulk1@example.com",
            emailHash: "hash-bulk1",
            properties: {},
          },
          {
            organizationId: testOrg.id,
            email: "bulk2@example.com",
            emailHash: "hash-bulk2",
            properties: {},
          },
          {
            organizationId: testOrg.id,
            email: "bulk3@example.com",
            emailHash: "hash-bulk3",
            properties: {},
          },
        ])
        .returning();

      const ids = inserted.map((c) => c.id);

      const app = createTestApp();
      const response = await app.handle(
        new Request("http://localhost/v1/contacts", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids }),
        })
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.deleted).toBe(3);

      // Verify all deleted
      const remaining = await db
        .select()
        .from(contact)
        .where(eq(contact.organizationId, testOrg.id));
      expect(remaining).toHaveLength(0);
    });

    it("returns 400 when no IDs provided", async () => {
      const app = createTestApp();
      const response = await app.handle(
        new Request("http://localhost/v1/contacts", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: [] }),
        })
      );

      expect(response.status).toBe(400);
    });
  });
});
