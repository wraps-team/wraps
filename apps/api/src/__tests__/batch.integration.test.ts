/**
 * Batch API Integration Tests
 *
 * Tests the actual route handlers with a real database.
 */

import {
  awsAccount,
  batchSend,
  contact,
  db,
  member,
  organization,
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

import { batchRoutes } from "../routes/batch";

// Mock the queue service (we don't want to actually enqueue jobs in tests)
vi.mock("../services/queue", () => ({
  enqueueJob: vi.fn().mockResolvedValue(undefined),
}));

// Mock the scheduler service (we don't want to actually create EventBridge schedules in tests)
vi.mock("../services/scheduler", () => ({
  createBroadcastSchedule: vi.fn().mockResolvedValue("mock-schedule-name"),
  deleteBroadcastSchedule: vi.fn().mockResolvedValue(undefined),
}));

// Test data IDs (unique to avoid conflicts with other tests)
const TEST_PREFIX = "api-batch-int";
const testUser = {
  id: `${TEST_PREFIX}-user-1`,
  email: `${TEST_PREFIX}@example.com`,
  name: "API Batch Test User",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  image: null,
  twoFactorEnabled: false,
  stripeCustomerId: null,
};

const testOrg = {
  id: `${TEST_PREFIX}-org-1`,
  name: "API Batch Test Org",
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

const testAwsAccount = {
  id: `${TEST_PREFIX}-aws-1`,
  organizationId: testOrg.id,
  name: "Test AWS Account",
  accountId: "123456789012",
  region: "us-east-1",
  externalId: "test-external-id",
  roleArn: "arn:aws:iam::123456789012:role/test-role",
  status: "active" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: testUser.id,
};

// Mock auth context
const mockAuth = {
  apiKeyId: `${TEST_PREFIX}-key-1`,
  organizationId: testOrg.id,
  userId: testUser.id,
  planId: "pro", // Pro plan has batch access
};

// Create test app with mocked auth and plan gate (bypasses actual validation)
function createTestApp() {
  return new Elysia().derive(() => ({ auth: mockAuth })).use(batchRoutes);
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

  // Insert test AWS account
  await db
    .insert(awsAccount)
    .values(testAwsAccount)
    .onConflictDoUpdate({
      target: awsAccount.id,
      set: { name: testAwsAccount.name },
    });
});

// Clean up batch sends and contacts before each test
beforeEach(async () => {
  await db.delete(batchSend).where(eq(batchSend.organizationId, testOrg.id));
  await db.delete(contact).where(eq(contact.organizationId, testOrg.id));
});

// Clean up after all tests
afterAll(async () => {
  await db.delete(batchSend).where(eq(batchSend.organizationId, testOrg.id));
  await db.delete(contact).where(eq(contact.organizationId, testOrg.id));
  await db.delete(awsAccount).where(eq(awsAccount.organizationId, testOrg.id));
  await db.delete(member).where(eq(member.organizationId, testOrg.id));
  await db.delete(organization).where(eq(organization.id, testOrg.id));
  await db.delete(user).where(eq(user.id, testUser.id));
});

describe("Batch API Integration", () => {
  describe("POST /v1/batch", () => {
    it("creates email batch send", async () => {
      // Insert some contacts to send to
      await db.insert(contact).values([
        {
          organizationId: testOrg.id,
          email: "recipient1@test.com",
          emailHash: "hash-r1",
          emailStatus: "active",
          properties: {},
        },
        {
          organizationId: testOrg.id,
          email: "recipient2@test.com",
          emailHash: "hash-r2",
          emailStatus: "active",
          properties: {},
        },
      ]);

      const app = createTestApp();
      const response = await app.handle(
        new Request("http://localhost/v1/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            awsAccountId: testAwsAccount.id,
            channel: "email",
            name: "Test Email Campaign",
            subject: "Hello World",
            from: "test@example.com",
          }),
        })
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.id).toBeDefined();
      expect(body.status).toBe("queued");
      expect(body.channel).toBe("email");
      expect(body.totalRecipients).toBe(2);

      // Verify in database
      const [dbBatch] = await db
        .select()
        .from(batchSend)
        .where(eq(batchSend.id, body.id));
      expect(dbBatch).toBeDefined();
      expect(dbBatch.name).toBe("Test Email Campaign");
      expect(dbBatch.subject).toBe("Hello World");
    });

    it("creates SMS batch send", async () => {
      // Insert contacts with opted-in SMS
      await db.insert(contact).values([
        {
          organizationId: testOrg.id,
          phone: "+15551234567",
          phoneHash: "hash-p1",
          smsStatus: "opted_in",
          properties: {},
        },
      ]);

      const app = createTestApp();
      const response = await app.handle(
        new Request("http://localhost/v1/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            awsAccountId: testAwsAccount.id,
            channel: "sms",
            name: "Test SMS Campaign",
            body: "Hello from Wraps!",
          }),
        })
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.channel).toBe("sms");
      expect(body.totalRecipients).toBe(1);
    });

    it("defaults to email channel", async () => {
      await db.insert(contact).values({
        organizationId: testOrg.id,
        email: "default@test.com",
        emailHash: "hash-default",
        emailStatus: "active",
        properties: {},
      });

      const app = createTestApp();
      const response = await app.handle(
        new Request("http://localhost/v1/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            awsAccountId: testAwsAccount.id,
            subject: "Default Channel Test",
          }),
        })
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.channel).toBe("email");
    });

    it("counts only active email contacts", async () => {
      // Insert contacts with various statuses
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
        {
          organizationId: testOrg.id,
          email: "null-status@test.com",
          emailHash: "hash-null",
          // emailStatus is null (should be treated as active)
          properties: {},
        },
      ]);

      const app = createTestApp();
      const response = await app.handle(
        new Request("http://localhost/v1/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            awsAccountId: testAwsAccount.id,
            subject: "Status Filter Test",
          }),
        })
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      // Should count active + null status (2), not bounced
      expect(body.totalRecipients).toBe(2);
    });

    it("counts only opted-in SMS contacts", async () => {
      await db.insert(contact).values([
        {
          organizationId: testOrg.id,
          phone: "+15551111111",
          phoneHash: "hash-opted-in",
          smsStatus: "opted_in",
          properties: {},
        },
        {
          organizationId: testOrg.id,
          phone: "+15552222222",
          phoneHash: "hash-pending",
          smsStatus: "pending_consent",
          properties: {},
        },
        {
          organizationId: testOrg.id,
          phone: "+15553333333",
          phoneHash: "hash-opted-out",
          smsStatus: "opted_out",
          properties: {},
        },
      ]);

      const app = createTestApp();
      const response = await app.handle(
        new Request("http://localhost/v1/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            awsAccountId: testAwsAccount.id,
            channel: "sms",
            body: "SMS Status Test",
          }),
        })
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      // Should only count opted_in (1)
      expect(body.totalRecipients).toBe(1);
    });

    it("accepts scheduling options", async () => {
      await db.insert(contact).values({
        organizationId: testOrg.id,
        email: "scheduled@test.com",
        emailHash: "hash-scheduled",
        properties: {},
      });

      const scheduledFor = new Date(
        Date.now() + 24 * 60 * 60 * 1000
      ).toISOString();

      const app = createTestApp();
      const response = await app.handle(
        new Request("http://localhost/v1/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            awsAccountId: testAwsAccount.id,
            subject: "Scheduled Email",
            scheduledFor,
          }),
        })
      );

      expect(response.status).toBe(200);

      const body = await response.json();

      // Verify scheduled time in database
      const [dbBatch] = await db
        .select()
        .from(batchSend)
        .where(eq(batchSend.id, body.id));
      expect(dbBatch.scheduledFor).toBeDefined();
    });
  });

  describe("GET /v1/batch/:id", () => {
    it("returns batch status", async () => {
      // Create a batch directly in DB
      const [batch] = await db
        .insert(batchSend)
        .values({
          organizationId: testOrg.id,
          awsAccountId: testAwsAccount.id,
          channel: "email",
          name: "Test Batch",
          status: "queued",
          subject: "Test Subject",
          totalRecipients: 100,
          processedRecipients: 0,
          sent: 0,
          failed: 0,
          createdBy: testUser.id,
        })
        .returning();

      const app = createTestApp();
      const response = await app.handle(
        new Request(`http://localhost/v1/batch/${batch.id}`)
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.id).toBe(batch.id);
      expect(body.status).toBe("queued");
      expect(body.name).toBe("Test Batch");
      expect(body.totalRecipients).toBe(100);
      expect(body.processedRecipients).toBe(0);
    });

    it("returns completed batch with stats", async () => {
      const [batch] = await db
        .insert(batchSend)
        .values({
          organizationId: testOrg.id,
          awsAccountId: testAwsAccount.id,
          channel: "email",
          name: "Completed Batch",
          status: "completed",
          subject: "Completed Test",
          totalRecipients: 100,
          processedRecipients: 100,
          sent: 95,
          failed: 5,
          startedAt: new Date(Date.now() - 60_000),
          completedAt: new Date(),
          createdBy: testUser.id,
        })
        .returning();

      const app = createTestApp();
      const response = await app.handle(
        new Request(`http://localhost/v1/batch/${batch.id}`)
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.status).toBe("completed");
      expect(body.processedRecipients).toBe(100);
      expect(body.sent).toBe(95);
      expect(body.failed).toBe(5);
      expect(body.startedAt).toBeDefined();
      expect(body.completedAt).toBeDefined();
    });

    it("returns error for non-existent batch", async () => {
      const app = createTestApp();
      const response = await app.handle(
        new Request("http://localhost/v1/batch/non-existent-id")
      );

      // The route throws an error for not found
      expect(response.status).toBe(500); // Error is thrown, not 404
    });
  });
});
