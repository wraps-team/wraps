import {
  contact,
  db,
  member,
  organization,
  subscription,
  topic,
  user,
} from "@wraps/db";
import { eq } from "drizzle-orm";
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
  bulkSubscribeContactsToTopics,
  bulkUnsubscribeContactsFromTopics,
  createContact,
  deleteContact,
  getContact,
  listContacts,
  subscribeContactToTopics,
  unsubscribeContactFromTopics,
  updateContact,
} from "../contacts";

// Test data
const testUser = {
  id: "test-contacts-user-1",
  email: "contacts-test@example.com",
  name: "Contacts Test User",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  image: null,
  twoFactorEnabled: false,
  stripeCustomerId: null,
};

const testOrganization = {
  id: "test-contacts-org-1",
  name: "Contacts Test Org",
  slug: "contacts-test-org",
  createdAt: new Date(),
  logo: null,
  metadata: null,
};

const testMember = {
  id: "test-contacts-member-1",
  organizationId: testOrganization.id,
  userId: testUser.id,
  role: "owner" as const,
  createdAt: new Date(),
};

const testTopic = {
  id: "test-contacts-topic-1",
  organizationId: testOrganization.id,
  name: "Newsletter",
  slug: "newsletter",
  description: "Weekly newsletter",
  public: true,
  doubleOptIn: false,
  subscriberCount: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: testUser.id,
};

const testTopic2 = {
  id: "test-contacts-topic-2",
  organizationId: testOrganization.id,
  name: "Product Updates",
  slug: "product-updates",
  description: "Product release notes",
  public: true,
  doubleOptIn: false,
  subscriberCount: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: testUser.id,
};

const testSubscription = {
  id: "test-contacts-subscription-1",
  plan: "starter",
  referenceId: testOrganization.id,
  status: "active",
  createdAt: new Date(),
  updatedAt: new Date(),
};

// Mock next/headers
vi.mock("next/headers", () => ({
  headers: () => new Headers(),
}));

// Mock next/cache
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// Mock the auth module
vi.mock("@wraps/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => ({
        user: { id: testUser.id, email: testUser.email, name: testUser.name },
        session: {
          id: "session-123",
          createdAt: new Date(),
          updatedAt: new Date(),
          userId: testUser.id,
          expiresAt: new Date(Date.now() + 86_400_000),
          token: "test-token",
        },
      })),
    },
  },
}));

// Set up test database
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
    .values(testOrganization)
    .onConflictDoUpdate({
      target: organization.id,
      set: { name: testOrganization.name },
    });

  // Insert test member
  await db
    .insert(member)
    .values(testMember)
    .onConflictDoUpdate({
      target: member.id,
      set: { role: testMember.role },
    });

  // Insert test subscription (required for plan limits)
  await db
    .delete(subscription)
    .where(eq(subscription.referenceId, testOrganization.id));
  await db.insert(subscription).values(testSubscription);

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
    .values(testTopic2)
    .onConflictDoUpdate({
      target: topic.id,
      set: { name: testTopic2.name },
    });
});

// Clean up contacts before each test
beforeEach(async () => {
  await db
    .delete(contact)
    .where(eq(contact.organizationId, testOrganization.id));
  // Reset topic subscriber counts
  await db
    .update(topic)
    .set({ subscriberCount: 0 })
    .where(eq(topic.id, testTopic.id));
  await db
    .update(topic)
    .set({ subscriberCount: 0 })
    .where(eq(topic.id, testTopic2.id));
});

// Clean up after all tests
afterAll(async () => {
  await db
    .delete(contact)
    .where(eq(contact.organizationId, testOrganization.id));
  await db.delete(topic).where(eq(topic.organizationId, testOrganization.id));
  await db.delete(member).where(eq(member.id, testMember.id));
  await db.delete(organization).where(eq(organization.id, testOrganization.id));
  await db.delete(user).where(eq(user.id, testUser.id));
});

describe("Contacts Server Actions", () => {
  describe("createContact", () => {
    it("should create a new contact", async () => {
      const result = await createContact(testOrganization.id, {
        email: "new@example.com",
        status: "active",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.contact.email).toBe("new@example.com");
        expect(result.contact.status).toBe("active");
      }
    });

    it("should create contact with custom properties", async () => {
      const result = await createContact(testOrganization.id, {
        email: "props@example.com",
        properties: {
          firstName: "John",
          lastName: "Doe",
          plan: "pro",
        },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.contact.properties).toEqual({
          firstName: "John",
          lastName: "Doe",
          plan: "pro",
        });
      }
    });

    it("should subscribe contact to topics on creation", async () => {
      const result = await createContact(testOrganization.id, {
        email: "subscribed@example.com",
        topicIds: [testTopic.id],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.contact.topics).toHaveLength(1);
        expect(result.contact.topics?.[0].topicId).toBe(testTopic.id);
        expect(result.contact.topics?.[0].status).toBe("subscribed");
      }

      // Verify topic subscriber count was incremented
      const updatedTopic = await db.query.topic.findFirst({
        where: eq(topic.id, testTopic.id),
      });
      expect(updatedTopic?.subscriberCount).toBe(1);
    });

    it("should reject duplicate email", async () => {
      await createContact(testOrganization.id, {
        email: "duplicate@example.com",
      });
      const result = await createContact(testOrganization.id, {
        email: "duplicate@example.com",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("already exists");
      }
    });

    it("should reject invalid email", async () => {
      const result = await createContact(testOrganization.id, {
        email: "invalid-email",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Invalid email");
      }
    });

    it("should normalize email to lowercase", async () => {
      const result = await createContact(testOrganization.id, {
        email: "UPPERCASE@EXAMPLE.COM",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.contact.email).toBe("uppercase@example.com");
      }
    });
  });

  describe("listContacts", () => {
    beforeEach(async () => {
      // Create test contacts
      await createContact(testOrganization.id, {
        email: "alice@example.com",
        status: "active",
      });
      await createContact(testOrganization.id, {
        email: "bob@example.com",
        status: "active",
        topicIds: [testTopic.id],
      });
      await createContact(testOrganization.id, {
        email: "charlie@example.com",
        status: "unsubscribed",
      });
    });

    it("should list all contacts", async () => {
      const result = await listContacts(testOrganization.id);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.contacts).toHaveLength(3);
        expect(result.total).toBe(3);
      }
    });

    it("should paginate results", async () => {
      const result = await listContacts(testOrganization.id, {
        page: 1,
        pageSize: 2,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.contacts).toHaveLength(2);
        expect(result.total).toBe(3);
        expect(result.page).toBe(1);
        expect(result.pageSize).toBe(2);
      }
    });

    it("should filter by status", async () => {
      const result = await listContacts(testOrganization.id, {
        status: "unsubscribed",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.contacts).toHaveLength(1);
        expect(result.contacts[0].email).toBe("charlie@example.com");
      }
    });

    it("should filter by topic", async () => {
      const result = await listContacts(testOrganization.id, {
        topicId: testTopic.id,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.contacts).toHaveLength(1);
        expect(result.contacts[0].email).toBe("bob@example.com");
      }
    });

    it("should search by email", async () => {
      const result = await listContacts(testOrganization.id, {
        search: "alice",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.contacts).toHaveLength(1);
        expect(result.contacts[0].email).toBe("alice@example.com");
      }
    });
  });

  describe("getContact", () => {
    it("should get contact by ID", async () => {
      const createResult = await createContact(testOrganization.id, {
        email: "get@example.com",
      });

      expect(createResult.success).toBe(true);
      if (!createResult.success) {
        return;
      }

      const result = await getContact(
        createResult.contact.id,
        testOrganization.id
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.contact.email).toBe("get@example.com");
      }
    });

    it("should return error for non-existent contact", async () => {
      const result = await getContact("non-existent-id", testOrganization.id);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("not found");
      }
    });
  });

  describe("updateContact", () => {
    it("should update contact email", async () => {
      const createResult = await createContact(testOrganization.id, {
        email: "old@example.com",
      });
      expect(createResult.success).toBe(true);
      if (!createResult.success) {
        return;
      }

      const result = await updateContact(
        createResult.contact.id,
        testOrganization.id,
        { email: "new@example.com" }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.contact.email).toBe("new@example.com");
      }
    });

    it("should update contact status", async () => {
      const createResult = await createContact(testOrganization.id, {
        email: "status@example.com",
        status: "active",
      });
      expect(createResult.success).toBe(true);
      if (!createResult.success) {
        return;
      }

      const result = await updateContact(
        createResult.contact.id,
        testOrganization.id,
        { status: "unsubscribed" }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.contact.status).toBe("unsubscribed");
        expect(result.contact.unsubscribedAt).not.toBeNull();
      }
    });

    it("should update contact properties", async () => {
      const createResult = await createContact(testOrganization.id, {
        email: "props-update@example.com",
        properties: { firstName: "John" },
      });
      expect(createResult.success).toBe(true);
      if (!createResult.success) {
        return;
      }

      const result = await updateContact(
        createResult.contact.id,
        testOrganization.id,
        { properties: { firstName: "Jane", lastName: "Doe" } }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.contact.properties).toEqual({
          firstName: "Jane",
          lastName: "Doe",
        });
      }
    });

    it("should reject duplicate email on update", async () => {
      await createContact(testOrganization.id, {
        email: "existing@example.com",
      });
      const createResult = await createContact(testOrganization.id, {
        email: "tochange@example.com",
      });
      expect(createResult.success).toBe(true);
      if (!createResult.success) {
        return;
      }

      const result = await updateContact(
        createResult.contact.id,
        testOrganization.id,
        { email: "existing@example.com" }
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("already exists");
      }
    });
  });

  describe("deleteContact", () => {
    it("should delete contact", async () => {
      const createResult = await createContact(testOrganization.id, {
        email: "delete@example.com",
      });
      expect(createResult.success).toBe(true);
      if (!createResult.success) {
        return;
      }

      const result = await deleteContact(
        createResult.contact.id,
        testOrganization.id
      );

      expect(result.success).toBe(true);

      // Verify contact is deleted
      const getResult = await getContact(
        createResult.contact.id,
        testOrganization.id
      );
      expect(getResult.success).toBe(false);
    });

    it("should decrement topic subscriber counts on delete", async () => {
      const createResult = await createContact(testOrganization.id, {
        email: "delete-sub@example.com",
        topicIds: [testTopic.id],
      });
      expect(createResult.success).toBe(true);
      if (!createResult.success) {
        return;
      }

      // Verify subscriber count is 1
      let topicData = await db.query.topic.findFirst({
        where: eq(topic.id, testTopic.id),
      });
      expect(topicData?.subscriberCount).toBe(1);

      // Delete contact
      await deleteContact(createResult.contact.id, testOrganization.id);

      // Verify subscriber count is 0
      topicData = await db.query.topic.findFirst({
        where: eq(topic.id, testTopic.id),
      });
      expect(topicData?.subscriberCount).toBe(0);
    });

    it("should return error for non-existent contact", async () => {
      const result = await deleteContact(
        "non-existent-id",
        testOrganization.id
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("not found");
      }
    });
  });

  describe("subscribeContactToTopics", () => {
    it("should subscribe contact to new topics", async () => {
      const createResult = await createContact(testOrganization.id, {
        email: "subscribe@example.com",
      });
      expect(createResult.success).toBe(true);
      if (!createResult.success) {
        return;
      }

      const result = await subscribeContactToTopics(
        createResult.contact.id,
        testOrganization.id,
        [testTopic.id]
      );

      expect(result.success).toBe(true);

      // Verify subscription
      const getResult = await getContact(
        createResult.contact.id,
        testOrganization.id
      );
      expect(getResult.success).toBe(true);
      if (getResult.success) {
        expect(getResult.contact.topics).toHaveLength(1);
        expect(getResult.contact.topics?.[0].status).toBe("subscribed");
      }
    });

    it("should resubscribe previously unsubscribed contact", async () => {
      const createResult = await createContact(testOrganization.id, {
        email: "resubscribe@example.com",
        topicIds: [testTopic.id],
      });
      expect(createResult.success).toBe(true);
      if (!createResult.success) {
        return;
      }

      // Unsubscribe
      await unsubscribeContactFromTopics(
        createResult.contact.id,
        testOrganization.id,
        [testTopic.id]
      );

      // Resubscribe
      const result = await subscribeContactToTopics(
        createResult.contact.id,
        testOrganization.id,
        [testTopic.id]
      );

      expect(result.success).toBe(true);

      // Verify resubscription
      const getResult = await getContact(
        createResult.contact.id,
        testOrganization.id
      );
      expect(getResult.success).toBe(true);
      if (getResult.success) {
        expect(getResult.contact.topics?.[0].status).toBe("subscribed");
      }
    });
  });

  describe("unsubscribeContactFromTopics", () => {
    it("should unsubscribe contact from topics", async () => {
      const createResult = await createContact(testOrganization.id, {
        email: "unsubscribe@example.com",
        topicIds: [testTopic.id],
      });
      expect(createResult.success).toBe(true);
      if (!createResult.success) {
        return;
      }

      const result = await unsubscribeContactFromTopics(
        createResult.contact.id,
        testOrganization.id,
        [testTopic.id]
      );

      expect(result.success).toBe(true);

      // Verify topic subscriber count decremented
      const topicData = await db.query.topic.findFirst({
        where: eq(topic.id, testTopic.id),
      });
      expect(topicData?.subscriberCount).toBe(0);
    });
  });

  describe("bulkSubscribeContactsToTopics", () => {
    it("should subscribe multiple contacts to a topic", async () => {
      // Create test contacts
      const contact1 = await createContact(testOrganization.id, {
        email: "bulk1@example.com",
      });
      const contact2 = await createContact(testOrganization.id, {
        email: "bulk2@example.com",
      });
      const contact3 = await createContact(testOrganization.id, {
        email: "bulk3@example.com",
      });
      expect(contact1.success && contact2.success && contact3.success).toBe(
        true
      );
      if (!(contact1.success && contact2.success && contact3.success)) {
        return;
      }

      const contactIds = [
        contact1.contact.id,
        contact2.contact.id,
        contact3.contact.id,
      ];

      const result = await bulkSubscribeContactsToTopics(
        testOrganization.id,
        contactIds,
        [testTopic.id]
      );

      expect(result.success).toBe(true);
      expect(result.count).toBe(3);

      // Verify topic subscriber count
      const topicData = await db.query.topic.findFirst({
        where: eq(topic.id, testTopic.id),
      });
      expect(topicData?.subscriberCount).toBe(3);

      // Verify each contact is subscribed
      for (const id of contactIds) {
        const contactResult = await getContact(id, testOrganization.id);
        expect(contactResult.success).toBe(true);
        if (contactResult.success) {
          expect(contactResult.contact.topics).toHaveLength(1);
          expect(contactResult.contact.topics?.[0].status).toBe("subscribed");
        }
      }
    });

    it("should skip contacts already subscribed to topic", async () => {
      // Create contacts - one already subscribed
      const contact1 = await createContact(testOrganization.id, {
        email: "already-sub@example.com",
        topicIds: [testTopic.id],
      });
      const contact2 = await createContact(testOrganization.id, {
        email: "new-sub@example.com",
      });
      expect(contact1.success && contact2.success).toBe(true);
      if (!(contact1.success && contact2.success)) {
        return;
      }

      const result = await bulkSubscribeContactsToTopics(
        testOrganization.id,
        [contact1.contact.id, contact2.contact.id],
        [testTopic.id]
      );

      expect(result.success).toBe(true);
      // Only 1 new subscription (contact2)
      expect(result.count).toBe(1);

      // Topic count should be 2 (1 from creation + 1 from bulk)
      const topicData = await db.query.topic.findFirst({
        where: eq(topic.id, testTopic.id),
      });
      expect(topicData?.subscriberCount).toBe(2);
    });

    it("should subscribe contacts to multiple topics", async () => {
      const contact1 = await createContact(testOrganization.id, {
        email: "multi-topic@example.com",
      });
      expect(contact1.success).toBe(true);
      if (!contact1.success) {
        return;
      }

      const result = await bulkSubscribeContactsToTopics(
        testOrganization.id,
        [contact1.contact.id],
        [testTopic.id, testTopic2.id]
      );

      expect(result.success).toBe(true);
      expect(result.count).toBe(1);

      // Verify contact has both subscriptions
      const contactResult = await getContact(
        contact1.contact.id,
        testOrganization.id
      );
      expect(contactResult.success).toBe(true);
      if (contactResult.success) {
        expect(contactResult.contact.topics).toHaveLength(2);
      }

      // Verify both topic counts
      const topic1Data = await db.query.topic.findFirst({
        where: eq(topic.id, testTopic.id),
      });
      const topic2Data = await db.query.topic.findFirst({
        where: eq(topic.id, testTopic2.id),
      });
      expect(topic1Data?.subscriberCount).toBe(1);
      expect(topic2Data?.subscriberCount).toBe(1);
    });
  });

  describe("bulkUnsubscribeContactsFromTopics", () => {
    it("should unsubscribe multiple contacts from a topic", async () => {
      // Create test contacts subscribed to topic
      const contact1 = await createContact(testOrganization.id, {
        email: "unsub1@example.com",
        topicIds: [testTopic.id],
      });
      const contact2 = await createContact(testOrganization.id, {
        email: "unsub2@example.com",
        topicIds: [testTopic.id],
      });
      expect(contact1.success && contact2.success).toBe(true);
      if (!(contact1.success && contact2.success)) {
        return;
      }

      // Verify initial count
      let topicData = await db.query.topic.findFirst({
        where: eq(topic.id, testTopic.id),
      });
      expect(topicData?.subscriberCount).toBe(2);

      const result = await bulkUnsubscribeContactsFromTopics(
        testOrganization.id,
        [contact1.contact.id, contact2.contact.id],
        [testTopic.id]
      );

      expect(result.success).toBe(true);
      expect(result.count).toBe(2);

      // Verify topic subscriber count is 0
      topicData = await db.query.topic.findFirst({
        where: eq(topic.id, testTopic.id),
      });
      expect(topicData?.subscriberCount).toBe(0);

      // Verify contacts are unsubscribed
      const contact1Result = await getContact(
        contact1.contact.id,
        testOrganization.id
      );
      expect(contact1Result.success).toBe(true);
      if (contact1Result.success) {
        expect(contact1Result.contact.topics?.[0].status).toBe("unsubscribed");
      }
    });

    it("should only unsubscribe from specified topic", async () => {
      // Create contact subscribed to both topics
      const contact1 = await createContact(testOrganization.id, {
        email: "multi-unsub@example.com",
        topicIds: [testTopic.id, testTopic2.id],
      });
      expect(contact1.success).toBe(true);
      if (!contact1.success) {
        return;
      }

      // Unsubscribe only from first topic
      const result = await bulkUnsubscribeContactsFromTopics(
        testOrganization.id,
        [contact1.contact.id],
        [testTopic.id]
      );

      expect(result.success).toBe(true);
      expect(result.count).toBe(1);

      // Verify contact is still subscribed to second topic
      const contactResult = await getContact(
        contact1.contact.id,
        testOrganization.id
      );
      expect(contactResult.success).toBe(true);
      if (contactResult.success) {
        const topic1Sub = contactResult.contact.topics?.find(
          (t) => t.topicId === testTopic.id
        );
        const topic2Sub = contactResult.contact.topics?.find(
          (t) => t.topicId === testTopic2.id
        );
        expect(topic1Sub?.status).toBe("unsubscribed");
        expect(topic2Sub?.status).toBe("subscribed");
      }

      // Verify topic counts
      const topic1Data = await db.query.topic.findFirst({
        where: eq(topic.id, testTopic.id),
      });
      const topic2Data = await db.query.topic.findFirst({
        where: eq(topic.id, testTopic2.id),
      });
      expect(topic1Data?.subscriberCount).toBe(0);
      expect(topic2Data?.subscriberCount).toBe(1);
    });

    it("should handle unsubscribing contacts not subscribed to topic", async () => {
      // Create contact not subscribed to any topic
      const contact1 = await createContact(testOrganization.id, {
        email: "not-subscribed@example.com",
      });
      expect(contact1.success).toBe(true);
      if (!contact1.success) {
        return;
      }

      const result = await bulkUnsubscribeContactsFromTopics(
        testOrganization.id,
        [contact1.contact.id],
        [testTopic.id]
      );

      // Should succeed but with 0 count
      expect(result.success).toBe(true);
      expect(result.count).toBe(0);
    });
  });
});
