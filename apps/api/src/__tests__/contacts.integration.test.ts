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

// Mock @wraps/email to track confirmation email calls
vi.mock("@wraps/email", () => ({
  sendTopicConfirmationEmail: vi.fn().mockResolvedValue(true),
}));

import { sendTopicConfirmationEmail } from "@wraps/email";

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
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: testUser.id,
};

const testDoubleOptInTopic = {
  id: `${TEST_PREFIX}-topic-doi`,
  organizationId: testOrg.id,
  name: "Double Opt-In Newsletter",
  slug: "double-opt-in-newsletter",
  description: "Test topic requiring confirmation",
  public: true,
  doubleOptIn: true,
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

  // Insert test topics
  await db
    .insert(topic)
    .values(testTopic)
    .onConflictDoUpdate({
      target: topic.id,
      set: { name: testTopic.name },
    });

  await db
    .insert(topic)
    .values(testDoubleOptInTopic)
    .onConflictDoUpdate({
      target: topic.id,
      set: { name: testDoubleOptInTopic.name },
    });
});

// Clean up contacts before each test and reset mocks
beforeEach(async () => {
  await db.delete(contact).where(eq(contact.organizationId, testOrg.id));
  vi.clearAllMocks();
});

// Clean up after all tests
afterAll(async () => {
  // contactTopic rows cascade-delete when contacts are deleted
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

    it("filters by preferredChannel", async () => {
      await db.insert(contact).values([
        {
          organizationId: testOrg.id,
          email: "email-pref@test.com",
          emailHash: "hash-email-pref",
          preferredChannel: "email",
          properties: {},
        },
        {
          organizationId: testOrg.id,
          email: "sms-pref@test.com",
          emailHash: "hash-sms-pref",
          preferredChannel: "sms",
          properties: {},
        },
        {
          organizationId: testOrg.id,
          email: "no-pref@test.com",
          emailHash: "hash-no-pref",
          properties: {},
        },
      ]);

      const app = createTestApp();
      const response = await app.handle(
        new Request("http://localhost/v1/contacts?preferredChannel=email")
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.contacts).toHaveLength(1);
      expect(body.contacts[0].email).toBe("email-pref@test.com");
      expect(body.contacts[0].preferredChannel).toBe("email");
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

    it("returns preferredChannel in response", async () => {
      const [newContact] = await db
        .insert(contact)
        .values({
          organizationId: testOrg.id,
          email: "channel-get@example.com",
          emailHash: "hash-channel-get",
          emailStatus: "active",
          preferredChannel: "email",
          properties: {},
        })
        .returning();

      const app = createTestApp();
      const response = await app.handle(
        new Request(`http://localhost/v1/contacts/${newContact.id}`)
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.preferredChannel).toBe("email");
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

    it("creates contact with preferredChannel", async () => {
      const app = createTestApp();
      const response = await app.handle(
        new Request("http://localhost/v1/contacts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "channel-pref@example.com",
            preferredChannel: "sms",
          }),
        })
      );

      expect(response.status).toBe(201);

      const body = await response.json();
      expect(body.preferredChannel).toBe("sms");

      // Verify in database
      const [dbContact] = await db
        .select()
        .from(contact)
        .where(eq(contact.id, body.id));
      expect(dbContact.preferredChannel).toBe("sms");
    });

    it("creates contact with null preferredChannel by default", async () => {
      const app = createTestApp();
      const response = await app.handle(
        new Request("http://localhost/v1/contacts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "no-channel-pref@example.com",
          }),
        })
      );

      expect(response.status).toBe(201);

      const body = await response.json();
      expect(body.preferredChannel).toBeNull();
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

    it("creates contact with topicSlugs", async () => {
      const app = createTestApp();
      const response = await app.handle(
        new Request("http://localhost/v1/contacts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "slug-subscriber@example.com",
            topicSlugs: [testTopic.slug],
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

    it("creates contact with both topicIds and topicSlugs", async () => {
      // Create a second topic
      const secondTopic = {
        id: `${TEST_PREFIX}-topic-2`,
        organizationId: testOrg.id,
        name: "Second Topic",
        slug: "second-topic",
        description: "Second test topic",
        public: true,
        doubleOptIn: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: testUser.id,
      };
      await db
        .insert(topic)
        .values(secondTopic)
        .onConflictDoUpdate({
          target: topic.id,
          set: { name: secondTopic.name },
        });

      const app = createTestApp();
      const response = await app.handle(
        new Request("http://localhost/v1/contacts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "both-topics@example.com",
            topicIds: [testTopic.id],
            topicSlugs: [secondTopic.slug],
          }),
        })
      );

      expect(response.status).toBe(201);

      const body = await response.json();

      // Verify both topic subscriptions in database
      const subscriptions = await db
        .select()
        .from(contactTopic)
        .where(eq(contactTopic.contactId, body.id));
      expect(subscriptions).toHaveLength(2);

      const topicIds = subscriptions.map((s) => s.topicId);
      expect(topicIds).toContain(testTopic.id);
      expect(topicIds).toContain(secondTopic.id);

      // Clean up
      await db.delete(topic).where(eq(topic.id, secondTopic.id));
    });

    it("ignores non-existent topicSlugs", async () => {
      const app = createTestApp();
      const response = await app.handle(
        new Request("http://localhost/v1/contacts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "invalid-slug@example.com",
            topicSlugs: ["non-existent-slug"],
          }),
        })
      );

      expect(response.status).toBe(201);

      const body = await response.json();

      // Should create contact but with no subscriptions
      const subscriptions = await db
        .select()
        .from(contactTopic)
        .where(eq(contactTopic.contactId, body.id));
      expect(subscriptions).toHaveLength(0);
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

    it("creates contact with pending status for double opt-in topic", async () => {
      const app = createTestApp();
      const response = await app.handle(
        new Request("http://localhost/v1/contacts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "doi-subscriber@example.com",
            topicIds: [testDoubleOptInTopic.id],
          }),
        })
      );

      expect(response.status).toBe(201);

      const body = await response.json();
      expect(body.pendingTopics).toBeDefined();
      expect(body.pendingTopics).toContain(testDoubleOptInTopic.id);

      // Verify subscription is pending in database
      const subscriptions = await db
        .select()
        .from(contactTopic)
        .where(eq(contactTopic.contactId, body.id));
      expect(subscriptions).toHaveLength(1);
      expect(subscriptions[0].status).toBe("pending");
      expect(subscriptions[0].subscribedAt).toBeNull();
      expect(subscriptions[0].confirmedAt).toBeNull();
    });

    it("sends confirmation email for double opt-in topic", async () => {
      const app = createTestApp();
      const response = await app.handle(
        new Request("http://localhost/v1/contacts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "confirmation-email-test@example.com",
            topicIds: [testDoubleOptInTopic.id],
          }),
        })
      );

      expect(response.status).toBe(201);

      const body = await response.json();

      // Wait a tick for the async email to be queued
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Verify confirmation email was sent
      expect(sendTopicConfirmationEmail).toHaveBeenCalledTimes(1);
      expect(sendTopicConfirmationEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          contactId: body.id,
          contactEmail: "confirmation-email-test@example.com",
          topicId: testDoubleOptInTopic.id,
          topicName: testDoubleOptInTopic.name,
          organizationId: testOrg.id,
        })
      );
    });

    it("does not send confirmation email for regular topic", async () => {
      const app = createTestApp();
      const response = await app.handle(
        new Request("http://localhost/v1/contacts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "no-confirmation-email@example.com",
            topicIds: [testTopic.id],
          }),
        })
      );

      expect(response.status).toBe(201);

      // Wait a tick
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Verify no confirmation email was sent
      expect(sendTopicConfirmationEmail).not.toHaveBeenCalled();
    });

    it("creates contact with mixed regular and double opt-in topics", async () => {
      const app = createTestApp();
      const response = await app.handle(
        new Request("http://localhost/v1/contacts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "mixed-topics@example.com",
            topicIds: [testTopic.id, testDoubleOptInTopic.id],
          }),
        })
      );

      expect(response.status).toBe(201);

      const body = await response.json();
      // Only double opt-in topic should be pending
      expect(body.pendingTopics).toHaveLength(1);
      expect(body.pendingTopics).toContain(testDoubleOptInTopic.id);

      // Verify subscriptions in database
      const subscriptions = await db
        .select()
        .from(contactTopic)
        .where(eq(contactTopic.contactId, body.id));
      expect(subscriptions).toHaveLength(2);

      const regularSub = subscriptions.find((s) => s.topicId === testTopic.id);
      const doiSub = subscriptions.find(
        (s) => s.topicId === testDoubleOptInTopic.id
      );

      expect(regularSub?.status).toBe("subscribed");
      expect(regularSub?.subscribedAt).not.toBeNull();
      expect(regularSub?.confirmedAt).not.toBeNull();

      expect(doiSub?.status).toBe("pending");
      expect(doiSub?.subscribedAt).toBeNull();
      expect(doiSub?.confirmedAt).toBeNull();
    });

    it("creates contact with regular topic without pendingTopics", async () => {
      const app = createTestApp();
      const response = await app.handle(
        new Request("http://localhost/v1/contacts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "regular-subscriber@example.com",
            topicIds: [testTopic.id],
          }),
        })
      );

      expect(response.status).toBe(201);

      const body = await response.json();
      // No pending topics for regular topics
      expect(body.pendingTopics).toBeUndefined();

      // Verify subscription is subscribed in database
      const subscriptions = await db
        .select()
        .from(contactTopic)
        .where(eq(contactTopic.contactId, body.id));
      expect(subscriptions).toHaveLength(1);
      expect(subscriptions[0].status).toBe("subscribed");
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

    it("updates contact properties (merged with existing)", async () => {
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

    it("updates preferredChannel", async () => {
      const [existing] = await db
        .insert(contact)
        .values({
          organizationId: testOrg.id,
          email: "update-channel@example.com",
          emailHash: "hash-update-channel",
          properties: {},
        })
        .returning();

      const app = createTestApp();
      const response = await app.handle(
        new Request(`http://localhost/v1/contacts/${existing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ preferredChannel: "email" }),
        })
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.preferredChannel).toBe("email");

      // Verify in database
      const [updated] = await db
        .select()
        .from(contact)
        .where(eq(contact.id, existing.id));
      expect(updated.preferredChannel).toBe("email");
    });

    it("clears preferredChannel with null", async () => {
      const [existing] = await db
        .insert(contact)
        .values({
          organizationId: testOrg.id,
          email: "clear-channel@example.com",
          emailHash: "hash-clear-channel",
          preferredChannel: "sms",
          properties: {},
        })
        .returning();

      const app = createTestApp();
      const response = await app.handle(
        new Request(`http://localhost/v1/contacts/${existing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ preferredChannel: null }),
        })
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.preferredChannel).toBeNull();

      // Verify in database
      const [updated] = await db
        .select()
        .from(contact)
        .where(eq(contact.id, existing.id));
      expect(updated.preferredChannel).toBeNull();
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

    it("accepts email as the :id parameter", async () => {
      const [existing] = await db
        .insert(contact)
        .values({
          organizationId: testOrg.id,
          email: "lookup-by-email@example.com",
          emailHash: "hash-lookup-by-email",
          properties: { source: "web" },
        })
        .returning();

      const app = createTestApp();
      const response = await app.handle(
        new Request(
          "http://localhost/v1/contacts/lookup-by-email@example.com",
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ firstName: "Updated" }),
          }
        )
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.firstName).toBe("Updated");
      expect(body.id).toBe(existing.id);
    });

    it("merges properties instead of replacing them", async () => {
      const [existing] = await db
        .insert(contact)
        .values({
          organizationId: testOrg.id,
          email: "merge-props@example.com",
          emailHash: "hash-merge-props",
          properties: { source: "web", signupAt: "2024-01-01" },
        })
        .returning();

      const app = createTestApp();
      const response = await app.handle(
        new Request(`http://localhost/v1/contacts/${existing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            properties: { onboardingPath: "start_building" },
          }),
        })
      );

      expect(response.status).toBe(200);

      // Verify in database that existing properties were preserved
      const [updated] = await db
        .select()
        .from(contact)
        .where(eq(contact.id, existing.id));
      expect(updated.properties).toEqual({
        source: "web",
        signupAt: "2024-01-01",
        onboardingPath: "start_building",
      });
    });

    it("preserves concurrent property updates", async () => {
      const [existing] = await db
        .insert(contact)
        .values({
          organizationId: testOrg.id,
          email: "merge-concurrent@example.com",
          emailHash: "hash-merge-concurrent",
          properties: { source: "web" },
        })
        .returning();

      const app = createTestApp();
      const updates = [
        { fastKeyA: "a" },
        { fastKeyB: "b" },
        { fastKeyC: "c" },
        { fastKeyD: "d" },
        { fastKeyE: "e" },
      ];

      const responses = await Promise.all(
        updates.map((properties) =>
          app.handle(
            new Request(`http://localhost/v1/contacts/${existing.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ properties }),
            })
          )
        )
      );

      for (const response of responses) {
        expect(response.status).toBe(200);
      }

      const [updated] = await db
        .select()
        .from(contact)
        .where(eq(contact.id, existing.id));
      expect(updated.properties).toMatchObject({
        source: "web",
        fastKeyA: "a",
        fastKeyB: "b",
        fastKeyC: "c",
        fastKeyD: "d",
        fastKeyE: "e",
      });
    });

    it("updates contact subscriptions with topicSlugs", async () => {
      // Create contact without subscriptions
      const [existing] = await db
        .insert(contact)
        .values({
          organizationId: testOrg.id,
          email: "update-slugs@example.com",
          emailHash: "hash-update-slugs",
          properties: {},
        })
        .returning();

      const app = createTestApp();
      const response = await app.handle(
        new Request(`http://localhost/v1/contacts/${existing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topicSlugs: [testTopic.slug],
          }),
        })
      );

      expect(response.status).toBe(200);

      // Verify topic subscription in database
      const subscriptions = await db
        .select()
        .from(contactTopic)
        .where(eq(contactTopic.contactId, existing.id));
      expect(subscriptions).toHaveLength(1);
      expect(subscriptions[0].topicId).toBe(testTopic.id);
    });

    it("adds topics without removing existing subscriptions when using topicSlugs", async () => {
      // Create a second topic
      const secondTopic = {
        id: `${TEST_PREFIX}-topic-3`,
        organizationId: testOrg.id,
        name: "Third Topic",
        slug: "third-topic",
        description: "Third test topic",
        public: true,
        doubleOptIn: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: testUser.id,
      };
      await db
        .insert(topic)
        .values(secondTopic)
        .onConflictDoUpdate({
          target: topic.id,
          set: { name: secondTopic.name },
        });

      // Create contact with first topic
      const [existing] = await db
        .insert(contact)
        .values({
          organizationId: testOrg.id,
          email: "add-slugs@example.com",
          emailHash: "hash-add-slugs",
          properties: {},
        })
        .returning();

      await db.insert(contactTopic).values({
        contactId: existing.id,
        topicId: testTopic.id,
        status: "subscribed",
      });

      // Add second topic via PATCH (should keep existing)
      const app = createTestApp();
      const response = await app.handle(
        new Request(`http://localhost/v1/contacts/${existing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topicSlugs: [secondTopic.slug],
          }),
        })
      );

      expect(response.status).toBe(200);

      // Verify both topic subscriptions exist (PATCH adds, doesn't replace)
      const subscriptions = await db
        .select()
        .from(contactTopic)
        .where(eq(contactTopic.contactId, existing.id));
      expect(subscriptions).toHaveLength(2);
      const topicIds = subscriptions.map((s) => s.topicId);
      expect(topicIds).toContain(testTopic.id);
      expect(topicIds).toContain(secondTopic.id);

      // Clean up
      await db.delete(topic).where(eq(topic.id, secondTopic.id));
    });

    it("sets pending status when adding double opt-in topic", async () => {
      // Create contact without subscriptions
      const [existing] = await db
        .insert(contact)
        .values({
          organizationId: testOrg.id,
          email: "patch-doi@example.com",
          emailHash: "hash-patch-doi",
          properties: {},
        })
        .returning();

      const app = createTestApp();
      const response = await app.handle(
        new Request(`http://localhost/v1/contacts/${existing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topicIds: [testDoubleOptInTopic.id],
          }),
        })
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.pendingTopics).toBeDefined();
      expect(body.pendingTopics).toContain(testDoubleOptInTopic.id);

      // Verify subscription is pending in database
      const subscriptions = await db
        .select()
        .from(contactTopic)
        .where(eq(contactTopic.contactId, existing.id));
      expect(subscriptions).toHaveLength(1);
      expect(subscriptions[0].status).toBe("pending");
      expect(subscriptions[0].subscribedAt).toBeNull();
      expect(subscriptions[0].confirmedAt).toBeNull();
    });

    it("sends confirmation email when adding double opt-in topic via PATCH", async () => {
      // Create contact without subscriptions
      const [existing] = await db
        .insert(contact)
        .values({
          organizationId: testOrg.id,
          email: "patch-confirmation-email@example.com",
          emailHash: "hash-patch-confirmation",
          properties: {},
        })
        .returning();

      const app = createTestApp();
      const response = await app.handle(
        new Request(`http://localhost/v1/contacts/${existing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topicIds: [testDoubleOptInTopic.id],
          }),
        })
      );

      expect(response.status).toBe(200);

      // Wait a tick for the async email to be queued
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Verify confirmation email was sent
      expect(sendTopicConfirmationEmail).toHaveBeenCalledTimes(1);
      expect(sendTopicConfirmationEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          contactId: existing.id,
          contactEmail: "patch-confirmation-email@example.com",
          topicId: testDoubleOptInTopic.id,
          topicName: testDoubleOptInTopic.name,
          organizationId: testOrg.id,
        })
      );
    });

    it("does not send confirmation email for auto-confirmed re-subscription", async () => {
      const confirmedAt = new Date(Date.now() - 86_400_000); // 1 day ago

      // Create contact with previously confirmed subscription
      const [existing] = await db
        .insert(contact)
        .values({
          organizationId: testOrg.id,
          email: "no-email-resubscribe@example.com",
          emailHash: "hash-no-email-resubscribe",
          properties: {},
        })
        .returning();

      // Create previously confirmed but now unsubscribed subscription
      await db.insert(contactTopic).values({
        contactId: existing.id,
        topicId: testDoubleOptInTopic.id,
        status: "unsubscribed",
        subscribedAt: confirmedAt,
        confirmedAt,
        unsubscribedAt: new Date(),
      });

      // Re-subscribe via PATCH
      const app = createTestApp();
      const response = await app.handle(
        new Request(`http://localhost/v1/contacts/${existing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topicIds: [testDoubleOptInTopic.id],
          }),
        })
      );

      expect(response.status).toBe(200);

      // Wait a tick
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should NOT send confirmation email since auto-confirmed
      expect(sendTopicConfirmationEmail).not.toHaveBeenCalled();
    });

    it("auto-confirms re-subscription if previously confirmed", async () => {
      const confirmedAt = new Date(Date.now() - 86_400_000); // 1 day ago

      // Create contact with previously confirmed subscription
      const [existing] = await db
        .insert(contact)
        .values({
          organizationId: testOrg.id,
          email: "resubscribe-confirmed@example.com",
          emailHash: "hash-resubscribe-confirmed",
          properties: {},
        })
        .returning();

      // Create previously confirmed but now unsubscribed subscription
      await db.insert(contactTopic).values({
        contactId: existing.id,
        topicId: testDoubleOptInTopic.id,
        status: "unsubscribed",
        subscribedAt: confirmedAt,
        confirmedAt,
        unsubscribedAt: new Date(),
      });

      // Re-subscribe via PATCH
      const app = createTestApp();
      const response = await app.handle(
        new Request(`http://localhost/v1/contacts/${existing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topicIds: [testDoubleOptInTopic.id],
          }),
        })
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      // Should NOT be pending since previously confirmed
      expect(body.pendingTopics).toBeUndefined();

      // Verify subscription is auto-confirmed in database
      const subscriptions = await db
        .select()
        .from(contactTopic)
        .where(eq(contactTopic.contactId, existing.id));
      expect(subscriptions).toHaveLength(1);
      expect(subscriptions[0].status).toBe("subscribed");
      // Preserves original confirmedAt
      expect(subscriptions[0].confirmedAt?.getTime()).toBe(
        confirmedAt.getTime()
      );
    });

    it("requires confirmation for re-subscription if never confirmed", async () => {
      // Create contact with never-confirmed subscription
      const [existing] = await db
        .insert(contact)
        .values({
          organizationId: testOrg.id,
          email: "resubscribe-unconfirmed@example.com",
          emailHash: "hash-resubscribe-unconfirmed",
          properties: {},
        })
        .returning();

      // Create subscription that was pending (never confirmed)
      await db.insert(contactTopic).values({
        contactId: existing.id,
        topicId: testDoubleOptInTopic.id,
        status: "unsubscribed",
        subscribedAt: null,
        confirmedAt: null, // Never confirmed
        unsubscribedAt: new Date(),
      });

      // Re-subscribe via PATCH
      const app = createTestApp();
      const response = await app.handle(
        new Request(`http://localhost/v1/contacts/${existing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topicIds: [testDoubleOptInTopic.id],
          }),
        })
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      // Should be pending since never confirmed
      expect(body.pendingTopics).toBeDefined();
      expect(body.pendingTopics).toContain(testDoubleOptInTopic.id);

      // Verify subscription is pending in database
      const subscriptions = await db
        .select()
        .from(contactTopic)
        .where(eq(contactTopic.contactId, existing.id));
      expect(subscriptions).toHaveLength(1);
      expect(subscriptions[0].status).toBe("pending");
    });

    it("handles mixed topics with and without previous confirmation", async () => {
      const confirmedAt = new Date(Date.now() - 86_400_000);

      // Create contact
      const [existing] = await db
        .insert(contact)
        .values({
          organizationId: testOrg.id,
          email: "mixed-confirmation@example.com",
          emailHash: "hash-mixed-confirmation",
          properties: {},
        })
        .returning();

      // Create previously confirmed subscription for double opt-in topic
      await db.insert(contactTopic).values({
        contactId: existing.id,
        topicId: testDoubleOptInTopic.id,
        status: "unsubscribed",
        subscribedAt: confirmedAt,
        confirmedAt,
        unsubscribedAt: new Date(),
      });

      // Re-subscribe to both regular and double opt-in topics
      const app = createTestApp();
      const response = await app.handle(
        new Request(`http://localhost/v1/contacts/${existing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topicIds: [testTopic.id, testDoubleOptInTopic.id],
          }),
        })
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      // No pending topics: regular topic doesn't require confirmation,
      // double opt-in topic was previously confirmed
      expect(body.pendingTopics).toBeUndefined();

      // Verify subscriptions in database
      const subscriptions = await db
        .select()
        .from(contactTopic)
        .where(eq(contactTopic.contactId, existing.id));
      expect(subscriptions).toHaveLength(2);

      const regularSub = subscriptions.find((s) => s.topicId === testTopic.id);
      const doiSub = subscriptions.find(
        (s) => s.topicId === testDoubleOptInTopic.id
      );

      expect(regularSub?.status).toBe("subscribed");
      expect(doiSub?.status).toBe("subscribed");
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
