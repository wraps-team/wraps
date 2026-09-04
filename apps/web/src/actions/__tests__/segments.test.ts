import {
  contact,
  countBroadcastRecipients,
  db,
  member,
  organization,
  organizationExtension,
  segment,
  subscription,
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
  createSegment,
  deleteSegment,
  getPropertyKeys,
  getSegment,
  listSegments,
  previewSegment,
  splitSegment,
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

  // Set up organization extension for usage tracking
  await db
    .insert(organizationExtension)
    .values({
      organizationId: testOrganization.id,
    })
    .onConflictDoUpdate({
      target: organizationExtension.organizationId,
      set: { updatedAt: new Date() },
    });

  // Set up Starter plan subscription (required for segments feature)
  await db
    .insert(subscription)
    .values({
      id: `sub_test_${testOrganization.id}`,
      plan: "starter",
      referenceId: testOrganization.id,
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: subscription.id,
      set: { plan: "growth", status: "active" },
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
  await db
    .delete(organizationExtension)
    .where(eq(organizationExtension.organizationId, testOrganization.id));
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

    it("does not create a segment for another organization", async () => {
      const result = await createSegment("some-other-org-id", {
        name: "Cross Org Create",
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

      const list = await listSegments(testOrganization.id);
      expect(list.success).toBe(true);
      if (list.success) {
        expect(list.segments.map((s) => s.name)).not.toContain(
          "Cross Org Create"
        );
      }
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

    it("does not list another organization's segments", async () => {
      const created = await createSegment(testOrganization.id, {
        name: "Owned By Test Org",
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
      expect(created.success).toBe(true);
      if (!created.success) {
        throw new Error("Failed to set up segment for cross-org test");
      }

      const result = await listSegments("some-other-org-id");

      expect(result.success).toBe(false);
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

    it("does not get another organization's segment", async () => {
      const created = await createSegment(testOrganization.id, {
        name: "Get Cross Org",
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
      expect(created.success).toBe(true);
      if (!created.success) {
        throw new Error("Failed to set up segment for cross-org test");
      }

      const result = await getSegment(created.segment.id, "some-other-org-id");

      expect(result.success).toBe(false);
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

    it("does not update another organization's segment", async () => {
      const created = await createSegment(testOrganization.id, {
        name: "Update Cross Org",
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
      expect(created.success).toBe(true);
      if (!created.success) {
        throw new Error("Failed to set up segment for cross-org test");
      }

      const result = await updateSegment(
        created.segment.id,
        "some-other-org-id",
        { name: "Hijacked Name" }
      );

      expect(result.success).toBe(false);

      const unchanged = await getSegment(
        created.segment.id,
        testOrganization.id
      );
      expect(unchanged.success).toBe(true);
      if (unchanged.success) {
        expect(unchanged.segment.name).toBe("Update Cross Org");
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

    it("does not delete another organization's segment", async () => {
      const created = await createSegment(testOrganization.id, {
        name: "Delete Cross Org",
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
      expect(created.success).toBe(true);
      if (!created.success) {
        throw new Error("Failed to set up segment for cross-org test");
      }

      const result = await deleteSegment(
        created.segment.id,
        "some-other-org-id"
      );

      expect(result.success).toBe(false);

      const stillThere = await getSegment(
        created.segment.id,
        testOrganization.id
      );
      expect(stillThere.success).toBe(true);
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
          emailStatus: "active",
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
          emailStatus: "active",
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
          emailStatus: "bounced",
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

    it("greaterThan on a mixed-type property does not throw and returns only numeric-matching contacts", async () => {
      const crypto = await import("node:crypto");
      await db.insert(contact).values([
        {
          id: crypto.randomUUID(),
          organizationId: testOrganization.id,
          email: "high-spend@example.com",
          emailHash: crypto
            .createHash("sha256")
            .update("high-spend@example.com")
            .digest("hex"),
          emailStatus: "active",
          status: "active",
          properties: { monthly_spend: "500" },
        },
        {
          id: crypto.randomUUID(),
          organizationId: testOrganization.id,
          email: "low-spend@example.com",
          emailHash: crypto
            .createHash("sha256")
            .update("low-spend@example.com")
            .digest("hex"),
          emailStatus: "active",
          status: "active",
          properties: { monthly_spend: "50" },
        },
        {
          id: crypto.randomUUID(),
          organizationId: testOrganization.id,
          email: "string-plan@example.com",
          emailHash: crypto
            .createHash("sha256")
            .update("string-plan@example.com")
            .digest("hex"),
          emailStatus: "active",
          status: "active",
          properties: { monthly_spend: "enterprise" },
        },
      ]);

      const result = await previewSegment(testOrganization.id, {
        logic: "AND",
        groups: [
          {
            filters: [
              {
                field: "properties.monthly_spend",
                operator: "greaterThan",
                value: 100,
              },
            ],
          },
        ],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.count).toBe(1);
        expect(result.sampleEmails).toEqual(["high-spend@example.com"]);
      }
    });

    it("lessThan on a fully-numeric property returns the correct count", async () => {
      const crypto = await import("node:crypto");
      await db.insert(contact).values([
        {
          id: crypto.randomUUID(),
          organizationId: testOrganization.id,
          email: "score-10@example.com",
          emailHash: crypto
            .createHash("sha256")
            .update("score-10@example.com")
            .digest("hex"),
          emailStatus: "active",
          status: "active",
          properties: { score: "10" },
        },
        {
          id: crypto.randomUUID(),
          organizationId: testOrganization.id,
          email: "score-50@example.com",
          emailHash: crypto
            .createHash("sha256")
            .update("score-50@example.com")
            .digest("hex"),
          emailStatus: "active",
          status: "active",
          properties: { score: "50" },
        },
        {
          id: crypto.randomUUID(),
          organizationId: testOrganization.id,
          email: "score-100@example.com",
          emailHash: crypto
            .createHash("sha256")
            .update("score-100@example.com")
            .digest("hex"),
          emailStatus: "active",
          status: "active",
          properties: { score: "100" },
        },
      ]);

      const result = await previewSegment(testOrganization.id, {
        logic: "AND",
        groups: [
          {
            filters: [
              {
                field: "properties.score",
                operator: "lessThan",
                value: 60,
              },
            ],
          },
        ],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.count).toBe(2);
        expect(result.sampleEmails).toEqual(
          expect.arrayContaining([
            "score-10@example.com",
            "score-50@example.com",
          ])
        );
        expect(result.sampleEmails).toHaveLength(2);
        expect(result.sampleEmails).not.toContain("score-100@example.com");
      }
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
          emailStatus: "active",
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
          emailStatus: "active",
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
          emailStatus: "active",
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
          emailStatus: "bounced",
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
        // One contact is bounced, and a bounced contact cannot be emailed.
        // Every count on this surface is the count that sends, so the answer
        // here is 0 — not "1 row matches the filters".
        expect(updateResult.segment.memberCount).toBe(0);
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
          emailStatus: "active",
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
          emailStatus: "bounced",
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
          emailStatus: "unsubscribed",
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
        // Three contacts, two match the filters (active, bounced) — but only
        // the active one is reachable.
        expect(result.segment.memberCount).toBe(1);
      }
    });
  });

  describe("splitSegment", () => {
    const seedContacts = async (count: number, tag: string) => {
      const crypto = await import("node:crypto");
      await db.insert(contact).values(
        Array.from({ length: count }, (_, i) => {
          const email = `split-${tag}-${i}@example.com`;
          return {
            id: crypto.randomUUID(),
            organizationId: testOrganization.id,
            email,
            emailHash: crypto.createHash("sha256").update(email).digest("hex"),
            emailStatus: "active" as const,
            status: "active" as const,
            properties: {},
          };
        })
      );
    };

    it("partitions the source exactly — no contact lost, none counted twice", async () => {
      await seedContacts(120, "exact");

      const source = await createSegment(testOrganization.id, {
        name: "Split Source Exact",
        condition: {
          logic: "AND",
          groups: [
            {
              filters: [
                { field: "email", operator: "contains", value: "split-exact-" },
              ],
            },
          ],
        },
      });
      expect(source.success).toBe(true);
      if (!source.success) return;

      const result = await splitSegment(
        source.segment.id,
        testOrganization.id,
        6
      );

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.segments).toHaveLength(6);

      // The property that makes this safe to send: the partitions tile the
      // source exactly. A gap silently drops contacts from the campaign; an
      // overlap double-sends to them.
      const total = result.segments.reduce((sum, s) => sum + s.memberCount, 0);
      expect(total).toBe(source.segment.memberCount);
      expect(total).toBe(120);

      // Every contact must be reachable — no empty partition.
      for (const s of result.segments) {
        expect(s.memberCount).toBeGreaterThan(0);
      }
    });

    it("names partitions 1-based and preserves the source name", async () => {
      await seedContacts(30, "names");

      const source = await createSegment(testOrganization.id, {
        name: "Split Source Names",
        condition: {
          logic: "AND",
          groups: [
            {
              filters: [
                { field: "email", operator: "contains", value: "split-names-" },
              ],
            },
          ],
        },
      });
      if (!source.success) return;

      const result = await splitSegment(
        source.segment.id,
        testOrganization.id,
        3
      );
      if (!result.success) return;

      expect(result.segments.map((s) => s.name)).toEqual([
        "Split Source Names (1/3)",
        "Split Source Names (2/3)",
        "Split Source Names (3/3)",
      ]);
    });

    it("refuses to split a segment that is already a partition", async () => {
      await seedContacts(20, "double");

      const source = await createSegment(testOrganization.id, {
        name: "Split Source Double",
        condition: {
          logic: "AND",
          groups: [
            {
              filters: [
                {
                  field: "email",
                  operator: "contains",
                  value: "split-double-",
                },
              ],
            },
          ],
        },
      });
      if (!source.success) return;

      const first = await splitSegment(
        source.segment.id,
        testOrganization.id,
        2
      );
      if (!first.success) return;

      const again = await splitSegment(
        first.segments[0].id,
        testOrganization.id,
        2
      );

      expect(again.success).toBe(false);
      if (!again.success) {
        expect(again.error).toContain("already a partition");
      }
    });

    it.each([1, 0, -1, 51, 2.5])(
      "rejects a partition count of %s",
      async (count) => {
        const source = await createSegment(testOrganization.id, {
          name: `Split Bad Count ${count}`,
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
        if (!source.success) return;

        const result = await splitSegment(
          source.segment.id,
          testOrganization.id,
          count
        );
        expect(result.success).toBe(false);
      }
    );

    it("does not split another organization's segment", async () => {
      const source = await createSegment(testOrganization.id, {
        name: "Split Cross Org",
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
      if (!source.success) return;

      const result = await splitSegment(
        source.segment.id,
        "some-other-org-id",
        3
      );

      expect(result.success).toBe(false);
    });
  });

  describe("getPropertyKeys", () => {
    it("should return distinct property keys from contacts", async () => {
      const crypto = await import("node:crypto");
      await db.insert(contact).values([
        {
          id: crypto.randomUUID(),
          organizationId: testOrganization.id,
          email: "props1@example.com",
          emailHash: crypto
            .createHash("sha256")
            .update("props1@example.com")
            .digest("hex"),
          emailStatus: "active",
          status: "active",
          properties: { plan: "pro", country: "US" },
        },
        {
          id: crypto.randomUUID(),
          organizationId: testOrganization.id,
          email: "props2@example.com",
          emailHash: crypto
            .createHash("sha256")
            .update("props2@example.com")
            .digest("hex"),
          emailStatus: "active",
          status: "active",
          properties: { role: "admin", country: "UK" },
        },
      ]);

      const result = await getPropertyKeys(testOrganization.id);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.keys).toEqual(["country", "plan", "role"]);
      }
    });

    it("should deduplicate keys shared across multiple contacts", async () => {
      const crypto = await import("node:crypto");
      await db.insert(contact).values([
        {
          id: crypto.randomUUID(),
          organizationId: testOrganization.id,
          email: "dup1@example.com",
          emailHash: crypto
            .createHash("sha256")
            .update("dup1@example.com")
            .digest("hex"),
          emailStatus: "active",
          status: "active",
          properties: { plan: "pro", source: "web" },
        },
        {
          id: crypto.randomUUID(),
          organizationId: testOrganization.id,
          email: "dup2@example.com",
          emailHash: crypto
            .createHash("sha256")
            .update("dup2@example.com")
            .digest("hex"),
          emailStatus: "active",
          status: "active",
          properties: { plan: "free", source: "api" },
        },
        {
          id: crypto.randomUUID(),
          organizationId: testOrganization.id,
          email: "dup3@example.com",
          emailHash: crypto
            .createHash("sha256")
            .update("dup3@example.com")
            .digest("hex"),
          emailStatus: "active",
          status: "active",
          properties: { plan: "enterprise" },
        },
      ]);

      const result = await getPropertyKeys(testOrganization.id);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.keys).toEqual(["plan", "source"]);
      }
    });

    it("should return empty array when no contacts exist", async () => {
      const result = await getPropertyKeys(testOrganization.id);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.keys).toEqual([]);
      }
    });

    it("should return empty array when all contacts have empty properties", async () => {
      const crypto = await import("node:crypto");
      await db.insert(contact).values([
        {
          id: crypto.randomUUID(),
          organizationId: testOrganization.id,
          email: "empty1@example.com",
          emailHash: crypto
            .createHash("sha256")
            .update("empty1@example.com")
            .digest("hex"),
          emailStatus: "active",
          status: "active",
          properties: {},
        },
        {
          id: crypto.randomUUID(),
          organizationId: testOrganization.id,
          email: "empty2@example.com",
          emailHash: crypto
            .createHash("sha256")
            .update("empty2@example.com")
            .digest("hex"),
          emailStatus: "active",
          status: "active",
          properties: {},
        },
      ]);

      const result = await getPropertyKeys(testOrganization.id);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.keys).toEqual([]);
      }
    });

    it("does not return property keys for another organization", async () => {
      const crypto = await import("node:crypto");
      await db.insert(contact).values({
        id: crypto.randomUUID(),
        organizationId: testOrganization.id,
        email: "cross-org-props@example.com",
        emailHash: crypto
          .createHash("sha256")
          .update("cross-org-props@example.com")
          .digest("hex"),
        emailStatus: "active",
        status: "active",
        properties: { onlyOnTestOrg: "yes" },
      });

      const result = await getPropertyKeys("some-other-org-id");

      expect(result.success).toBe(false);
    });
  });
});

/**
 * The assertion the audit found nowhere in the repo (F20): the number a
 * surface shows for a segment is the number a broadcast to that segment would
 * send to. Everything else about counts is downstream of this.
 */
describe("segment counts equal what a broadcast to the segment would send", () => {
  const seedMixedAudience = async () => {
    const crypto = await import("node:crypto");
    const row = (email: string | null, emailStatus: string | null) => ({
      id: crypto.randomUUID(),
      organizationId: testOrganization.id,
      email,
      emailHash: email
        ? crypto.createHash("sha256").update(email).digest("hex")
        : null,
      emailStatus: emailStatus as never,
      properties: {},
    });

    await db
      .insert(contact)
      .values([
        row("reachable@example.com", "active"),
        row("no-status@example.com", null),
        row("gone@example.com", "unsubscribed"),
        row("hard-bounce@example.com", "bounced"),
        row(null, null),
      ]);
  };

  // Matches every contact in the org: emails_sent is NOT NULL and defaults to 0.
  const everyone = {
    logic: "AND" as const,
    groups: [
      {
        filters: [
          {
            field: "emailsSent",
            operator: "greaterThanOrEqual" as const,
            value: 0,
          },
        ],
      },
    ],
  };

  it("the segments list shows the send-path count", async () => {
    await seedMixedAudience();
    const created = await createSegment(testOrganization.id, {
      name: "Everyone",
      condition: everyone,
    });
    if (!created.success) {
      throw new Error("Failed to create segment");
    }

    const sendCount = await countBroadcastRecipients(
      testOrganization.id,
      "email",
      { audienceType: "segment", segmentId: created.segment.id }
    );
    const listed = await listSegments(testOrganization.id);

    expect(sendCount).toBe(2);
    if (listed.success) {
      expect(
        listed.segments.find((s) => s.id === created.segment.id)?.memberCount
      ).toBe(sendCount);
    }
  });

  it("the preview shows the same number as the send", async () => {
    await seedMixedAudience();
    const created = await createSegment(testOrganization.id, {
      name: "Everyone",
      condition: everyone,
    });
    if (!created.success) {
      throw new Error("Failed to create segment");
    }

    const preview = await previewSegment(testOrganization.id, everyone);
    const sendCount = await countBroadcastRecipients(
      testOrganization.id,
      "email",
      { audienceType: "segment", segmentId: created.segment.id }
    );

    expect(preview.success).toBe(true);
    if (preview.success) {
      expect(preview.count).toBe(sendCount);
      // The sample is drawn from the same predicate, so it never shows an
      // address the broadcast would skip.
      expect(preview.sampleEmails).not.toContain("gone@example.com");
    }
  });

  it("follows the audience when a contact unsubscribes, with no recompute", async () => {
    await seedMixedAudience();
    const created = await createSegment(testOrganization.id, {
      name: "Everyone",
      condition: everyone,
    });
    if (!created.success) {
      throw new Error("Failed to create segment");
    }

    // Nothing calls a recompute action — there isn't one any more. The list
    // counts live, so it cannot go stale the way `member_count` did.
    await db
      .update(contact)
      .set({ emailStatus: "unsubscribed" })
      .where(eq(contact.email, "reachable@example.com"));

    const listed = await listSegments(testOrganization.id);
    const sendCount = await countBroadcastRecipients(
      testOrganization.id,
      "email",
      { audienceType: "segment", segmentId: created.segment.id }
    );

    expect(sendCount).toBe(1);
    if (listed.success) {
      expect(
        listed.segments.find((s) => s.id === created.segment.id)?.memberCount
      ).toBe(sendCount);
    }
  });
});
