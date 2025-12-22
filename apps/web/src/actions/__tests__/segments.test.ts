import { contact, db, member, organization, organizationExtension, segment, user } from "@wraps/db";
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
  createSegment,
  deleteSegment,
  getSegment,
  listSegments,
  previewSegment,
  updateSegment,
} from "../segments";

// Test data
const testUser = {
  id: "test-segments-user-1",
  email: "segments-test@example.com",
  name: "Segments Test User",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  image: null,
  twoFactorEnabled: false,
  stripeCustomerId: null,
};

const testOrganization = {
  id: "test-segments-org-1",
  name: "Segments Test Org",
  slug: "segments-test-org",
  createdAt: new Date(),
  logo: null,
  metadata: null,
};

const testMember = {
  id: "test-segments-member-1",
  organizationId: testOrganization.id,
  userId: testUser.id,
  role: "owner" as const,
  createdAt: new Date(),
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

  // Set up Pro plan for test organization (required for segments feature)
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

  // Insert test member
  await db
    .insert(member)
    .values(testMember)
    .onConflictDoUpdate({
      target: member.id,
      set: { role: testMember.role },
    });
});

// Clean up segments and contacts before each test
beforeEach(async () => {
  await db
    .delete(segment)
    .where(eq(segment.organizationId, testOrganization.id));
  await db
    .delete(contact)
    .where(eq(contact.organizationId, testOrganization.id));
});

// Clean up after all tests
afterAll(async () => {
  await db
    .delete(segment)
    .where(eq(segment.organizationId, testOrganization.id));
  await db
    .delete(contact)
    .where(eq(contact.organizationId, testOrganization.id));
  await db.delete(member).where(eq(member.id, testMember.id));
  await db.delete(organizationExtension).where(eq(organizationExtension.organizationId, testOrganization.id));
  await db.delete(organization).where(eq(organization.id, testOrganization.id));
  await db.delete(user).where(eq(user.id, testUser.id));
});

describe("Segments Server Actions", () => {
  describe("createSegment", () => {
    it("should create a segment with valid data", async () => {
      const result = await createSegment(testOrganization.id, {
        name: "Active Users",
        description: "Users with active status",
        condition: {
          logic: "AND",
          groups: [
            {
              filters: [
                { field: "status", operator: "equals", value: "active" },
              ],
            },
          ],
        },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.segment.name).toBe("Active Users");
        expect(result.segment.description).toBe("Users with active status");
        expect(result.segment.condition.logic).toBe("AND");
        expect(result.segment.memberCount).toBe(0); // No contacts yet
      }
    });

    it("should fail to create segment without name", async () => {
      const result = await createSegment(testOrganization.id, {
        name: "",
        condition: {
          logic: "AND",
          groups: [
            {
              filters: [
                { field: "status", operator: "equals", value: "active" },
              ],
            },
          ],
        },
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("name");
      }
    });

    it("should fail to create segment with invalid condition", async () => {
      const result = await createSegment(testOrganization.id, {
        name: "Test Segment",
        condition: {
          logic: "AND",
          groups: [], // Empty groups is invalid
        },
      });

      expect(result.success).toBe(false);
    });
  });

  describe("listSegments", () => {
    it("should list all segments for an organization", async () => {
      // Create two segments
      await createSegment(testOrganization.id, {
        name: "Segment 1",
        condition: {
          logic: "AND",
          groups: [
            {
              filters: [
                { field: "status", operator: "equals", value: "active" },
              ],
            },
          ],
        },
      });

      await createSegment(testOrganization.id, {
        name: "Segment 2",
        condition: {
          logic: "OR",
          groups: [
            {
              filters: [
                { field: "status", operator: "equals", value: "bounced" },
              ],
            },
          ],
        },
      });

      const result = await listSegments(testOrganization.id);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.segments).toHaveLength(2);
        expect(result.segments.map((s) => s.name)).toContain("Segment 1");
        expect(result.segments.map((s) => s.name)).toContain("Segment 2");
      }
    });

    it("should return empty array when no segments exist", async () => {
      const result = await listSegments(testOrganization.id);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.segments).toHaveLength(0);
      }
    });
  });

  describe("getSegment", () => {
    it("should get a segment by ID", async () => {
      const createResult = await createSegment(testOrganization.id, {
        name: "Test Segment",
        description: "A test segment",
        condition: {
          logic: "AND",
          groups: [
            {
              filters: [
                { field: "status", operator: "equals", value: "active" },
              ],
            },
          ],
        },
      });

      if (!createResult.success) {
        throw new Error("Failed to create segment");
      }

      const result = await getSegment(
        createResult.segment.id,
        testOrganization.id
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.segment.name).toBe("Test Segment");
        expect(result.segment.description).toBe("A test segment");
      }
    });

    it("should fail to get non-existent segment", async () => {
      const result = await getSegment("non-existent-id", testOrganization.id);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("not found");
      }
    });
  });

  describe("updateSegment", () => {
    it("should update segment name", async () => {
      const createResult = await createSegment(testOrganization.id, {
        name: "Original Name",
        condition: {
          logic: "AND",
          groups: [
            {
              filters: [
                { field: "status", operator: "equals", value: "active" },
              ],
            },
          ],
        },
      });

      if (!createResult.success) {
        throw new Error("Failed to create segment");
      }

      const result = await updateSegment(
        createResult.segment.id,
        testOrganization.id,
        {
          name: "Updated Name",
        }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.segment.name).toBe("Updated Name");
      }
    });

    it("should update segment condition", async () => {
      const createResult = await createSegment(testOrganization.id, {
        name: "Test Segment",
        condition: {
          logic: "AND",
          groups: [
            {
              filters: [
                { field: "status", operator: "equals", value: "active" },
              ],
            },
          ],
        },
      });

      if (!createResult.success) {
        throw new Error("Failed to create segment");
      }

      const newCondition = {
        logic: "OR" as const,
        groups: [
          {
            filters: [
              {
                field: "status",
                operator: "equals" as const,
                value: "bounced",
              },
            ],
          },
        ],
      };

      const result = await updateSegment(
        createResult.segment.id,
        testOrganization.id,
        { condition: newCondition }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.segment.condition.logic).toBe("OR");
      }
    });

    it("should fail to update non-existent segment", async () => {
      const result = await updateSegment(
        "non-existent-id",
        testOrganization.id,
        { name: "New Name" }
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("not found");
      }
    });
  });

  describe("deleteSegment", () => {
    it("should delete a segment", async () => {
      const createResult = await createSegment(testOrganization.id, {
        name: "To Delete",
        condition: {
          logic: "AND",
          groups: [
            {
              filters: [
                { field: "status", operator: "equals", value: "active" },
              ],
            },
          ],
        },
      });

      if (!createResult.success) {
        throw new Error("Failed to create segment");
      }

      const deleteResult = await deleteSegment(
        createResult.segment.id,
        testOrganization.id
      );

      expect(deleteResult.success).toBe(true);

      // Verify it's deleted
      const getResult = await getSegment(
        createResult.segment.id,
        testOrganization.id
      );
      expect(getResult.success).toBe(false);
    });

    it("should fail to delete non-existent segment", async () => {
      const result = await deleteSegment(
        "non-existent-id",
        testOrganization.id
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("not found");
      }
    });
  });

  describe("previewSegment", () => {
    it("should preview segment with matching contacts", async () => {
      // Create some test contacts
      const crypto = await import("node:crypto");
      await db.insert(contact).values([
        {
          id: crypto.randomUUID(),
          organizationId: testOrganization.id,
          email: "active1@example.com",
          emailHash: crypto
            .createHash("sha256")
            .update("active1@example.com")
            .digest("hex"),
          status: "active",
          properties: {},
        },
        {
          id: crypto.randomUUID(),
          organizationId: testOrganization.id,
          email: "active2@example.com",
          emailHash: crypto
            .createHash("sha256")
            .update("active2@example.com")
            .digest("hex"),
          status: "active",
          properties: {},
        },
        {
          id: crypto.randomUUID(),
          organizationId: testOrganization.id,
          email: "bounced@example.com",
          emailHash: crypto
            .createHash("sha256")
            .update("bounced@example.com")
            .digest("hex"),
          status: "bounced",
          properties: {},
        },
      ]);

      const result = await previewSegment(testOrganization.id, {
        logic: "AND",
        groups: [
          {
            filters: [{ field: "status", operator: "equals", value: "active" }],
          },
        ],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.count).toBe(2);
        expect(result.sampleEmails).toHaveLength(2);
        expect(result.sampleEmails).toContain("active1@example.com");
        expect(result.sampleEmails).toContain("active2@example.com");
      }
    });

    it("should return zero for empty segment", async () => {
      const result = await previewSegment(testOrganization.id, {
        logic: "AND",
        groups: [
          {
            filters: [{ field: "status", operator: "equals", value: "active" }],
          },
        ],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.count).toBe(0);
        expect(result.sampleEmails).toHaveLength(0);
      }
    });

    it("should fail with invalid condition", async () => {
      const result = await previewSegment(testOrganization.id, {
        logic: "AND",
        groups: [], // Empty groups is invalid
      });

      expect(result.success).toBe(false);
    });
  });

  describe("segment member count computation", () => {
    it("should compute member count when creating segment with matching contacts", async () => {
      // Create test contacts first
      const crypto = await import("node:crypto");
      await db.insert(contact).values([
        {
          id: crypto.randomUUID(),
          organizationId: testOrganization.id,
          email: "user1@example.com",
          emailHash: crypto
            .createHash("sha256")
            .update("user1@example.com")
            .digest("hex"),
          status: "active",
          properties: {},
        },
        {
          id: crypto.randomUUID(),
          organizationId: testOrganization.id,
          email: "user2@example.com",
          emailHash: crypto
            .createHash("sha256")
            .update("user2@example.com")
            .digest("hex"),
          status: "active",
          properties: {},
        },
      ]);

      const result = await createSegment(testOrganization.id, {
        name: "Active Users",
        condition: {
          logic: "AND",
          groups: [
            {
              filters: [
                { field: "status", operator: "equals", value: "active" },
              ],
            },
          ],
        },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.segment.memberCount).toBe(2);
      }
    });

    it("should recompute member count when updating segment condition", async () => {
      // Create test contacts
      const crypto = await import("node:crypto");
      await db.insert(contact).values([
        {
          id: crypto.randomUUID(),
          organizationId: testOrganization.id,
          email: "active@example.com",
          emailHash: crypto
            .createHash("sha256")
            .update("active@example.com")
            .digest("hex"),
          status: "active",
          properties: {},
        },
        {
          id: crypto.randomUUID(),
          organizationId: testOrganization.id,
          email: "bounced@example.com",
          emailHash: crypto
            .createHash("sha256")
            .update("bounced@example.com")
            .digest("hex"),
          status: "bounced",
          properties: {},
        },
      ]);

      // Create segment for active users
      const createResult = await createSegment(testOrganization.id, {
        name: "Test Segment",
        condition: {
          logic: "AND",
          groups: [
            {
              filters: [
                { field: "status", operator: "equals", value: "active" },
              ],
            },
          ],
        },
      });

      if (!createResult.success) {
        throw new Error("Failed to create segment");
      }

      expect(createResult.segment.memberCount).toBe(1);

      // Update to bounced users
      const updateResult = await updateSegment(
        createResult.segment.id,
        testOrganization.id,
        {
          condition: {
            logic: "AND",
            groups: [
              {
                filters: [
                  { field: "status", operator: "equals", value: "bounced" },
                ],
              },
            ],
          },
        }
      );

      expect(updateResult.success).toBe(true);
      if (updateResult.success) {
        expect(updateResult.segment.memberCount).toBe(1);
      }
    });
  });

  describe("OR logic segments", () => {
    it("should match contacts with OR logic", async () => {
      // Create test contacts
      const crypto = await import("node:crypto");
      await db.insert(contact).values([
        {
          id: crypto.randomUUID(),
          organizationId: testOrganization.id,
          email: "active@example.com",
          emailHash: crypto
            .createHash("sha256")
            .update("active@example.com")
            .digest("hex"),
          status: "active",
          properties: {},
        },
        {
          id: crypto.randomUUID(),
          organizationId: testOrganization.id,
          email: "bounced@example.com",
          emailHash: crypto
            .createHash("sha256")
            .update("bounced@example.com")
            .digest("hex"),
          status: "bounced",
          properties: {},
        },
        {
          id: crypto.randomUUID(),
          organizationId: testOrganization.id,
          email: "unsubscribed@example.com",
          emailHash: crypto
            .createHash("sha256")
            .update("unsubscribed@example.com")
            .digest("hex"),
          status: "unsubscribed",
          properties: {},
        },
      ]);

      // Create segment for active OR bounced
      const result = await createSegment(testOrganization.id, {
        name: "Active or Bounced",
        condition: {
          logic: "OR",
          groups: [
            {
              filters: [
                { field: "status", operator: "equals", value: "active" },
              ],
            },
            {
              filters: [
                { field: "status", operator: "equals", value: "bounced" },
              ],
            },
          ],
        },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.segment.memberCount).toBe(2);
      }
    });
  });
});
