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
  createContact,
  deleteContact,
  getContact,
  listContacts,
  updateContact,
} from "../contacts";
import { getContactAnalytics } from "../contacts-analytics";
import {
  bulkSubscribeContactsToTopics,
  bulkUnsubscribeContactsFromTopics,
  subscribeContactToTopics,
  unsubscribeContactFromTopics,
} from "../contacts-topics";

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

    it("should filter by emailStatus", async () => {
      // Create contacts with different email statuses
      await db
        .update(contact)
        .set({ emailStatus: "bounced" })
        .where(eq(contact.email, "alice@example.com"));

      const result = await listContacts(testOrganization.id, {
        emailStatus: "bounced",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.contacts).toHaveLength(1);
        expect(result.contacts[0].email).toBe("alice@example.com");
        expect(result.contacts[0].emailStatus).toBe("bounced");
      }
    });

    it("should filter by emailStatus suppressed", async () => {
      // Create a suppressed contact
      await db
        .update(contact)
        .set({
          emailStatus: "suppressed",
          emailSuppressedAt: new Date(),
        })
        .where(eq(contact.email, "bob@example.com"));

      const result = await listContacts(testOrganization.id, {
        emailStatus: "suppressed",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.contacts).toHaveLength(1);
        expect(result.contacts[0].email).toBe("bob@example.com");
        expect(result.contacts[0].emailStatus).toBe("suppressed");
        expect(result.contacts[0].emailSuppressedAt).not.toBeNull();
      }
    });

    it("should prefer emailStatus over legacy status filter", async () => {
      // When both emailStatus and status are provided, emailStatus should take precedence
      await db
        .update(contact)
        .set({ emailStatus: "complained" })
        .where(eq(contact.email, "charlie@example.com"));

      const result = await listContacts(testOrganization.id, {
        emailStatus: "complained",
        status: "active", // This should be ignored
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.contacts).toHaveLength(1);
        expect(result.contacts[0].email).toBe("charlie@example.com");
        expect(result.contacts[0].emailStatus).toBe("complained");
      }
    });

    it("should return all email statuses when no filter applied", async () => {
      // Set different statuses for each contact
      await db
        .update(contact)
        .set({ emailStatus: "bounced" })
        .where(eq(contact.email, "alice@example.com"));
      await db
        .update(contact)
        .set({ emailStatus: "suppressed" })
        .where(eq(contact.email, "bob@example.com"));
      await db
        .update(contact)
        .set({ emailStatus: "complained" })
        .where(eq(contact.email, "charlie@example.com"));

      const result = await listContacts(testOrganization.id);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.contacts).toHaveLength(3);
        // Should include all statuses
        const statuses = result.contacts.map((c) => c.emailStatus);
        expect(statuses).toContain("bounced");
        expect(statuses).toContain("suppressed");
        expect(statuses).toContain("complained");
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

      // Delete contact
      await deleteContact(createResult.contact.id, testOrganization.id);
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

      const result = await bulkUnsubscribeContactsFromTopics(
        testOrganization.id,
        [contact1.contact.id, contact2.contact.id],
        [testTopic.id]
      );

      expect(result.success).toBe(true);
      expect(result.count).toBe(2);

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

  describe("getContactAnalytics", () => {
    /** Insert a contact directly with a specific createdAt date */
    async function insertContactAt(email: string, createdAt: Date) {
      const [c] = await db
        .insert(contact)
        .values({
          organizationId: testOrganization.id,
          email,
          createdAt,
        })
        .returning();
      return c;
    }

    /** Create a Date that is `n` days in the past at noon UTC */
    function daysAgo(n: number): Date {
      const d = new Date();
      d.setDate(d.getDate() - n);
      d.setHours(12, 0, 0, 0);
      return d;
    }

    it("should return dailyGrowth with YYYY-MM-DD date strings", async () => {
      await insertContactAt("chart-fmt@test.com", daysAgo(1));

      const result = await getContactAnalytics(testOrganization.id, 7);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.analytics.dailyGrowth.length).toBeGreaterThan(0);
        for (const entry of result.analytics.dailyGrowth) {
          expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        }
      }
    });

    it("should include today in dailyGrowth", async () => {
      await insertContactAt("chart-today@test.com", new Date());

      const result = await getContactAnalytics(testOrganization.id, 7);

      expect(result.success).toBe(true);
      if (result.success) {
        const todayStr = new Date().toISOString().split("T")[0];
        const todayEntry = result.analytics.dailyGrowth.find(
          (d) => d.date === todayStr
        );
        expect(todayEntry).toBeDefined();
        expect(todayEntry!.count).toBeGreaterThanOrEqual(1);
      }
    });

    it("should gap-fill dates with zero counts", async () => {
      await insertContactAt("chart-gap@test.com", daysAgo(3));

      const result = await getContactAnalytics(testOrganization.id, 7);

      expect(result.success).toBe(true);
      if (result.success) {
        const { dailyGrowth } = result.analytics;
        // Should have an entry for every day in the range
        expect(dailyGrowth.length).toBeGreaterThanOrEqual(7);
        // Most days should have 0 count
        const zeroDays = dailyGrowth.filter((d) => d.count === 0);
        expect(zeroDays.length).toBeGreaterThanOrEqual(6);
        // The day with the contact should have count 1
        const nonZeroDays = dailyGrowth.filter((d) => d.count > 0);
        expect(nonZeroDays.length).toBe(1);
        expect(nonZeroDays[0].count).toBe(1);
      }
    });

    it("should aggregate multiple contacts on the same day", async () => {
      const day = daysAgo(2);
      await insertContactAt("chart-agg1@test.com", day);
      await insertContactAt("chart-agg2@test.com", day);
      await insertContactAt("chart-agg3@test.com", day);

      const result = await getContactAnalytics(testOrganization.id, 7);

      expect(result.success).toBe(true);
      if (result.success) {
        const dayStr = day.toISOString().split("T")[0];
        const entry = result.analytics.dailyGrowth.find(
          (d) => d.date === dayStr
        );
        expect(entry).toBeDefined();
        expect(entry!.count).toBe(3);
      }
    });

    it("should only count contacts within the requested period", async () => {
      await insertContactAt("chart-recent@test.com", daysAgo(3));
      await insertContactAt("chart-old@test.com", daysAgo(15));

      const result = await getContactAnalytics(testOrganization.id, 7);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.analytics.newContactsThisPeriod).toBe(1);
        expect(result.analytics.totalContacts).toBe(2);
      }
    });
  });
});

// ─── Security: email validation ────────────────────────────────────────────

describe("createContact — email validation", () => {
  it("rejects an email with no domain part (foo@)", async () => {
    const result = await createContact(testOrganization.id, {
      email: "foo@",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/invalid email/i);
    }
  });

  it("rejects an email with no TLD (foo@bar)", async () => {
    const result = await createContact(testOrganization.id, {
      email: "foo@bar",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/invalid email/i);
    }
  });

  it("rejects an email with no local part (@domain.com)", async () => {
    const result = await createContact(testOrganization.id, {
      email: "@domain.com",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/invalid email/i);
    }
  });

  it("accepts a valid email address", async () => {
    const result = await createContact(testOrganization.id, {
      email: "valid-email-test@example.com",
    });
    expect(result.success).toBe(true);
  });
});

// ─── Security: topicId cross-org IDOR ──────────────────────────────────────

describe("createContact — topicId cross-org IDOR", () => {
  const foreignOrg = {
    id: "sec-foreign-org-1",
    name: "Foreign Org",
    slug: "sec-foreign-org",
    createdAt: new Date(),
    logo: null,
    metadata: null,
  };

  const foreignTopic = {
    id: "sec-foreign-topic-1",
    organizationId: "sec-foreign-org-1",
    name: "Foreign Topic",
    slug: "foreign-topic",
    description: null,
    public: true,
    doubleOptIn: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: null,
  };

  beforeAll(async () => {
    await db
      .insert(organization)
      .values(foreignOrg)
      .onConflictDoUpdate({
        target: organization.id,
        set: { name: foreignOrg.name },
      });
    await db
      .insert(topic)
      .values(foreignTopic)
      .onConflictDoUpdate({
        target: topic.id,
        set: { name: foreignTopic.name },
      });
  });

  afterAll(async () => {
    await db.delete(topic).where(eq(topic.id, foreignTopic.id));
    await db.delete(organization).where(eq(organization.id, foreignOrg.id));
  });

  it("does not subscribe a contact to a topic owned by a different organization", async () => {
    const result = await createContact(testOrganization.id, {
      email: "idor-topic-test@example.com",
      topicIds: [foreignTopic.id],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      // The foreign topic must not appear in the contact's subscriptions
      const subscribedTopicIds =
        result.contact.topics?.map((t) => t.topicId) ?? [];
      expect(subscribedTopicIds).not.toContain(foreignTopic.id);
    }
  });

  it("only subscribes to topics belonging to the correct organization", async () => {
    const result = await createContact(testOrganization.id, {
      email: "mixed-topics@example.com",
      topicIds: [testTopic.id, foreignTopic.id],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      const subscribedTopicIds =
        result.contact.topics?.map((t) => t.topicId) ?? [];
      // Own topic is subscribed
      expect(subscribedTopicIds).toContain(testTopic.id);
      // Foreign topic is silently dropped
      expect(subscribedTopicIds).not.toContain(foreignTopic.id);
    }
  });
});
