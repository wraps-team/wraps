import {
  contact,
  contactTopic,
  db,
  member,
  organization,
  organizationExtension,
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
  createTopic,
  deleteTopic,
  getTopic,
  getTopicSubscribers,
  listTopics,
  updateTopic,
} from "../topics";

// Test data
const testUser = {
  id: "test-topics-user-1",
  email: "topics-test@example.com",
  name: "Topics Test User",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  image: null,
  twoFactorEnabled: false,
  stripeCustomerId: null,
};

const testMemberUser = {
  id: "test-topics-member-user-1",
  email: "topics-member@example.com",
  name: "Topics Member User",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  image: null,
  twoFactorEnabled: false,
  stripeCustomerId: null,
};

const testOrganization = {
  id: "test-topics-org-1",
  name: "Topics Test Org",
  slug: "topics-test-org",
  createdAt: new Date(),
  logo: null,
  metadata: null,
};

const testOwnerMember = {
  id: "test-topics-owner-member-1",
  organizationId: testOrganization.id,
  userId: testUser.id,
  role: "owner" as const,
  createdAt: new Date(),
};

const testRegularMember = {
  id: "test-topics-regular-member-1",
  organizationId: testOrganization.id,
  userId: testMemberUser.id,
  role: "member" as const,
  createdAt: new Date(),
};

// Track current mock user
let currentMockUserId = testUser.id;

// Mock next/headers
vi.mock("next/headers", () => ({
  headers: () => new Headers(),
}));

// Mock next/cache
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// Mock the auth module - dynamic based on currentMockUserId
vi.mock("@wraps/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => ({
        user: {
          id: currentMockUserId,
          email:
            currentMockUserId === testUser.id
              ? testUser.email
              : testMemberUser.email,
          name:
            currentMockUserId === testUser.id
              ? testUser.name
              : testMemberUser.name,
        },
        session: {
          id: "session-123",
          createdAt: new Date(),
          updatedAt: new Date(),
          userId: currentMockUserId,
          expiresAt: new Date(Date.now() + 86_400_000),
          token: "test-token",
        },
      })),
    },
  },
}));

// Set up test database
beforeAll(async () => {
  // Insert test users
  await db
    .insert(user)
    .values(testUser)
    .onConflictDoUpdate({
      target: user.id,
      set: { updatedAt: new Date() },
    });

  await db
    .insert(user)
    .values(testMemberUser)
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

  // Set up Pro plan for test organization (required for topics feature)
  await db
    .insert(organizationExtension)
    .values({
      organizationId: testOrganization.id,
      plan: "pro",
    })
    .onConflictDoUpdate({
      target: organizationExtension.organizationId,
      set: { plan: "pro" },
    });

  // Insert test members
  await db
    .insert(member)
    .values(testOwnerMember)
    .onConflictDoUpdate({
      target: member.id,
      set: { role: testOwnerMember.role },
    });

  await db
    .insert(member)
    .values(testRegularMember)
    .onConflictDoUpdate({
      target: member.id,
      set: { role: testRegularMember.role },
    });
});

// Clean up topics before each test and reset mock user
beforeEach(async () => {
  currentMockUserId = testUser.id; // Reset to owner
  await db
    .delete(contact)
    .where(eq(contact.organizationId, testOrganization.id));
  await db.delete(topic).where(eq(topic.organizationId, testOrganization.id));
});

// Clean up after all tests
afterAll(async () => {
  await db
    .delete(contact)
    .where(eq(contact.organizationId, testOrganization.id));
  await db.delete(topic).where(eq(topic.organizationId, testOrganization.id));
  await db.delete(member).where(eq(member.id, testOwnerMember.id));
  await db.delete(member).where(eq(member.id, testRegularMember.id));
  await db
    .delete(organizationExtension)
    .where(eq(organizationExtension.organizationId, testOrganization.id));
  await db.delete(organization).where(eq(organization.id, testOrganization.id));
  await db.delete(user).where(eq(user.id, testUser.id));
  await db.delete(user).where(eq(user.id, testMemberUser.id));
});

describe("Topics Server Actions", () => {
  describe("createTopic", () => {
    it("should create a new topic", async () => {
      const result = await createTopic(testOrganization.id, {
        name: "Product Updates",
        description: "Get notified about new features",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.topic.name).toBe("Product Updates");
        expect(result.topic.slug).toBe("product-updates");
        expect(result.topic.description).toBe(
          "Get notified about new features"
        );
        expect(result.topic.public).toBe(true);
        expect(result.topic.doubleOptIn).toBe(false);
        expect(result.topic.subscriberCount).toBe(0);
      }
    });

    it("should create topic with custom slug", async () => {
      const result = await createTopic(testOrganization.id, {
        name: "Weekly Newsletter",
        slug: "weekly",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.topic.slug).toBe("weekly");
      }
    });

    it("should create private topic", async () => {
      const result = await createTopic(testOrganization.id, {
        name: "Internal Updates",
        public: false,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.topic.public).toBe(false);
      }
    });

    it("should create topic with double opt-in", async () => {
      const result = await createTopic(testOrganization.id, {
        name: "Marketing",
        doubleOptIn: true,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.topic.doubleOptIn).toBe(true);
      }
    });

    it("should reject duplicate slug", async () => {
      await createTopic(testOrganization.id, { name: "First Topic" });
      const result = await createTopic(testOrganization.id, {
        name: "Second Topic",
        slug: "first-topic",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("already exists");
      }
    });

    it("should reject empty name", async () => {
      const result = await createTopic(testOrganization.id, {
        name: "",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("required");
      }
    });

    it("should reject creation by regular member", async () => {
      currentMockUserId = testMemberUser.id;

      const result = await createTopic(testOrganization.id, {
        name: "Unauthorized Topic",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Only owners and admins");
      }
    });
  });

  describe("listTopics", () => {
    beforeEach(async () => {
      await createTopic(testOrganization.id, { name: "Newsletter" });
      await createTopic(testOrganization.id, { name: "Product Updates" });
      await createTopic(testOrganization.id, {
        name: "Marketing",
        public: false,
      });
    });

    it("should list all topics", async () => {
      const result = await listTopics(testOrganization.id);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.topics).toHaveLength(3);
      }
    });

    it("should include topic metadata", async () => {
      const result = await listTopics(testOrganization.id);

      expect(result.success).toBe(true);
      if (result.success) {
        const topic = result.topics.find((t) => t.name === "Newsletter");
        expect(topic).toBeDefined();
        expect(topic?.slug).toBe("newsletter");
        expect(topic?.subscriberCount).toBe(0);
        expect(topic?.createdBy).toBeDefined();
      }
    });

    it("should allow regular members to view topics", async () => {
      currentMockUserId = testMemberUser.id;

      const result = await listTopics(testOrganization.id);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.topics).toHaveLength(3);
      }
    });
  });

  describe("getTopic", () => {
    it("should get topic by ID", async () => {
      const createResult = await createTopic(testOrganization.id, {
        name: "Get Topic Test",
      });
      expect(createResult.success).toBe(true);
      if (!createResult.success) {
        return;
      }

      const result = await getTopic(createResult.topic.id, testOrganization.id);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.topic.name).toBe("Get Topic Test");
      }
    });

    it("should return error for non-existent topic", async () => {
      const result = await getTopic("non-existent-id", testOrganization.id);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("not found");
      }
    });
  });

  describe("updateTopic", () => {
    it("should update topic name", async () => {
      const createResult = await createTopic(testOrganization.id, {
        name: "Old Name",
      });
      expect(createResult.success).toBe(true);
      if (!createResult.success) {
        return;
      }

      const result = await updateTopic(
        createResult.topic.id,
        testOrganization.id,
        { name: "New Name" }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.topic.name).toBe("New Name");
      }
    });

    it("should update topic slug", async () => {
      const createResult = await createTopic(testOrganization.id, {
        name: "Slug Test",
      });
      expect(createResult.success).toBe(true);
      if (!createResult.success) {
        return;
      }

      const result = await updateTopic(
        createResult.topic.id,
        testOrganization.id,
        { slug: "new-slug" }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.topic.slug).toBe("new-slug");
      }
    });

    it("should update topic settings", async () => {
      const createResult = await createTopic(testOrganization.id, {
        name: "Settings Test",
        public: true,
        doubleOptIn: false,
      });
      expect(createResult.success).toBe(true);
      if (!createResult.success) {
        return;
      }

      const result = await updateTopic(
        createResult.topic.id,
        testOrganization.id,
        { public: false, doubleOptIn: true }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.topic.public).toBe(false);
        expect(result.topic.doubleOptIn).toBe(true);
      }
    });

    it("should reject duplicate slug on update", async () => {
      await createTopic(testOrganization.id, { name: "Existing Topic" });
      const createResult = await createTopic(testOrganization.id, {
        name: "To Change",
      });
      expect(createResult.success).toBe(true);
      if (!createResult.success) {
        return;
      }

      const result = await updateTopic(
        createResult.topic.id,
        testOrganization.id,
        { slug: "existing-topic" }
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("already exists");
      }
    });

    it("should reject update by regular member", async () => {
      const createResult = await createTopic(testOrganization.id, {
        name: "Protected Topic",
      });
      expect(createResult.success).toBe(true);
      if (!createResult.success) {
        return;
      }

      currentMockUserId = testMemberUser.id;

      const result = await updateTopic(
        createResult.topic.id,
        testOrganization.id,
        { name: "Hacked Name" }
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Only owners and admins");
      }
    });
  });

  describe("deleteTopic", () => {
    it("should delete topic", async () => {
      const createResult = await createTopic(testOrganization.id, {
        name: "To Delete",
      });
      expect(createResult.success).toBe(true);
      if (!createResult.success) {
        return;
      }

      const result = await deleteTopic(
        createResult.topic.id,
        testOrganization.id
      );

      expect(result.success).toBe(true);

      // Verify topic is deleted
      const getResult = await getTopic(
        createResult.topic.id,
        testOrganization.id
      );
      expect(getResult.success).toBe(false);
    });

    it("should cascade delete contact subscriptions", async () => {
      const createResult = await createTopic(testOrganization.id, {
        name: "Topic With Subscribers",
      });
      expect(createResult.success).toBe(true);
      if (!createResult.success) {
        return;
      }

      // Create a contact subscribed to this topic
      await db.insert(contact).values({
        id: "test-cascade-contact",
        organizationId: testOrganization.id,
        email: "cascade@example.com",
        emailHash: "cascade-hash",
        status: "active",
        properties: {},
        emailsSent: 0,
        emailsOpened: 0,
        emailsClicked: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await db.insert(contactTopic).values({
        contactId: "test-cascade-contact",
        topicId: createResult.topic.id,
        status: "subscribed",
      });

      // Delete topic
      const result = await deleteTopic(
        createResult.topic.id,
        testOrganization.id
      );
      expect(result.success).toBe(true);

      // Verify subscription is deleted (contact should have no topics)
      const subscriptions = await db.query.contactTopic.findMany({
        where: eq(contactTopic.contactId, "test-cascade-contact"),
      });
      expect(subscriptions).toHaveLength(0);

      // Clean up test contact
      await db.delete(contact).where(eq(contact.id, "test-cascade-contact"));
    });

    it("should reject deletion by regular member", async () => {
      const createResult = await createTopic(testOrganization.id, {
        name: "Protected Topic",
      });
      expect(createResult.success).toBe(true);
      if (!createResult.success) {
        return;
      }

      currentMockUserId = testMemberUser.id;

      const result = await deleteTopic(
        createResult.topic.id,
        testOrganization.id
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Only owners and admins");
      }
    });

    it("should return error for non-existent topic", async () => {
      const result = await deleteTopic("non-existent-id", testOrganization.id);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("not found");
      }
    });
  });

  describe("getTopicSubscribers", () => {
    it("should return empty list for topic with no subscribers", async () => {
      const createResult = await createTopic(testOrganization.id, {
        name: "Empty Topic",
      });
      expect(createResult.success).toBe(true);
      if (!createResult.success) {
        return;
      }

      const result = await getTopicSubscribers(
        createResult.topic.id,
        testOrganization.id
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.subscribers).toHaveLength(0);
        expect(result.total).toBe(0);
      }
    });

    it("should return subscribers for topic", async () => {
      const createResult = await createTopic(testOrganization.id, {
        name: "Topic With Subscribers",
      });
      expect(createResult.success).toBe(true);
      if (!createResult.success) {
        return;
      }

      // Create contacts subscribed to this topic
      for (let i = 0; i < 3; i++) {
        await db.insert(contact).values({
          id: `test-sub-contact-${i}`,
          organizationId: testOrganization.id,
          email: `subscriber${i}@example.com`,
          emailHash: `sub-hash-${i}`,
          status: "active",
          properties: {},
          emailsSent: 0,
          emailsOpened: 0,
          emailsClicked: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        await db.insert(contactTopic).values({
          contactId: `test-sub-contact-${i}`,
          topicId: createResult.topic.id,
          status: "subscribed",
        });
      }

      const result = await getTopicSubscribers(
        createResult.topic.id,
        testOrganization.id
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.subscribers).toHaveLength(3);
        expect(result.total).toBe(3);
      }

      // Clean up
      for (let i = 0; i < 3; i++) {
        await db.delete(contact).where(eq(contact.id, `test-sub-contact-${i}`));
      }
    });

    it("should paginate subscribers", async () => {
      const createResult = await createTopic(testOrganization.id, {
        name: "Paginated Topic",
      });
      expect(createResult.success).toBe(true);
      if (!createResult.success) {
        return;
      }

      // Create 5 contacts
      for (let i = 0; i < 5; i++) {
        await db.insert(contact).values({
          id: `test-page-contact-${i}`,
          organizationId: testOrganization.id,
          email: `page${i}@example.com`,
          emailHash: `page-hash-${i}`,
          status: "active",
          properties: {},
          emailsSent: 0,
          emailsOpened: 0,
          emailsClicked: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        await db.insert(contactTopic).values({
          contactId: `test-page-contact-${i}`,
          topicId: createResult.topic.id,
          status: "subscribed",
        });
      }

      const result = await getTopicSubscribers(
        createResult.topic.id,
        testOrganization.id,
        { page: 1, pageSize: 2 }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.subscribers).toHaveLength(2);
        expect(result.total).toBe(5);
        expect(result.page).toBe(1);
        expect(result.pageSize).toBe(2);
      }

      // Clean up
      for (let i = 0; i < 5; i++) {
        await db
          .delete(contact)
          .where(eq(contact.id, `test-page-contact-${i}`));
      }
    });

    it("should return error for non-existent topic", async () => {
      const result = await getTopicSubscribers(
        "non-existent-id",
        testOrganization.id
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("not found");
      }
    });
  });
});
