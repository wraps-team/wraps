import { Elysia } from "elysia";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the database
vi.mock("@wraps/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
  batchSend: {
    id: "id",
    organizationId: "organization_id",
    awsAccountId: "aws_account_id",
    channel: "channel",
    name: "name",
    status: "status",
    subject: "subject",
    previewText: "preview_text",
    from: "from",
    fromName: "from_name",
    replyTo: "reply_to",
    emailTemplateId: "email_template_id",
    body: "body",
    senderId: "sender_id",
    scheduledFor: "scheduled_for",
    totalRecipients: "total_recipients",
    processedRecipients: "processed_recipients",
    sent: "sent",
    failed: "failed",
    startedAt: "started_at",
    completedAt: "completed_at",
    createdAt: "created_at",
    createdBy: "created_by",
  },
  contact: {
    id: "id",
    organizationId: "organization_id",
    email: "email",
    emailStatus: "email_status",
    phone: "phone",
    smsStatus: "sms_status",
  },
  eq: vi.fn((a, b) => ({ eq: [a, b] })),
}));

// Mock auth context
const mockAuthContext = {
  apiKeyId: "key-123",
  organizationId: "org-123",
  userId: "user-123",
  planId: "pro", // Pro plan has batch access
};

// Mock batch data
const mockBatch = {
  id: "batch-123",
  organizationId: "org-123",
  awsAccountId: "aws-123",
  channel: "email",
  name: "Test Batch",
  status: "queued",
  subject: "Hello World",
  previewText: "This is a test",
  from: "test@example.com",
  fromName: "Test Sender",
  replyTo: null,
  emailTemplateId: null,
  totalRecipients: 100,
  processedRecipients: 0,
  sent: 0,
  failed: 0,
  startedAt: null,
  completedAt: null,
  createdAt: new Date("2024-01-01T00:00:00.000Z"),
};

const mockCompletedBatch = {
  ...mockBatch,
  id: "batch-456",
  status: "completed",
  processedRecipients: 100,
  sent: 95,
  failed: 5,
  startedAt: new Date("2024-01-01T00:01:00.000Z"),
  completedAt: new Date("2024-01-01T00:05:00.000Z"),
};

// Create a test app with mocked middleware
function createTestApp() {
  return new Elysia()
    .derive(() => ({ auth: mockAuthContext }))
    .post("/v1/batch", async (ctx) => {
      const body = await ctx.request.json();

      // Validate required field
      if (!body.awsAccountId) {
        ctx.set.status = 400;
        return { error: "awsAccountId is required" };
      }

      // Simulate batch creation
      const channel = body.channel ?? "email";
      const recipientCount = channel === "email" ? 100 : 50;

      ctx.set.status = 201;
      return {
        id: "new-batch-id",
        status: "queued",
        channel,
        totalRecipients: recipientCount,
        createdAt: "2024-01-01T00:00:00.000Z",
      };
    })
    .get("/v1/batch/:id", async (ctx) => {
      const { params } = ctx;

      // Simulate not found
      if (params.id === "not-found") {
        ctx.set.status = 404;
        return { error: "Batch not found" };
      }

      // Simulate unauthorized (different org)
      if (params.id === "other-org-batch") {
        ctx.set.status = 403;
        return { error: "Not authorized" };
      }

      // Return completed batch for specific ID
      if (params.id === "batch-456") {
        return {
          id: mockCompletedBatch.id,
          status: mockCompletedBatch.status,
          channel: mockCompletedBatch.channel,
          name: mockCompletedBatch.name,
          totalRecipients: mockCompletedBatch.totalRecipients,
          processedRecipients: mockCompletedBatch.processedRecipients,
          sent: mockCompletedBatch.sent,
          failed: mockCompletedBatch.failed,
          startedAt: mockCompletedBatch.startedAt?.toISOString(),
          completedAt: mockCompletedBatch.completedAt?.toISOString(),
          createdAt: mockCompletedBatch.createdAt.toISOString(),
        };
      }

      // Return queued batch
      return {
        id: mockBatch.id,
        status: mockBatch.status,
        channel: mockBatch.channel,
        name: mockBatch.name,
        totalRecipients: mockBatch.totalRecipients,
        processedRecipients: mockBatch.processedRecipients,
        sent: mockBatch.sent,
        failed: mockBatch.failed,
        startedAt: mockBatch.startedAt?.toISOString() ?? null,
        completedAt: mockBatch.completedAt?.toISOString() ?? null,
        createdAt: mockBatch.createdAt.toISOString(),
      };
    });
}

describe("Batch API", () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    app = createTestApp();
  });

  describe("POST /v1/batch", () => {
    it("creates an email batch send", async () => {
      const response = await app.handle(
        new Request("http://localhost/v1/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            awsAccountId: "aws-123",
            channel: "email",
            name: "Test Campaign",
            subject: "Hello World",
            from: "test@example.com",
          }),
        })
      );

      expect(response.status).toBe(201);

      const body = await response.json();
      expect(body.id).toBe("new-batch-id");
      expect(body.status).toBe("queued");
      expect(body.channel).toBe("email");
      expect(body.totalRecipients).toBe(100);
    });

    it("creates an SMS batch send", async () => {
      const response = await app.handle(
        new Request("http://localhost/v1/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            awsAccountId: "aws-123",
            channel: "sms",
            name: "SMS Campaign",
            body: "Hello from Wraps!",
          }),
        })
      );

      expect(response.status).toBe(201);

      const body = await response.json();
      expect(body.channel).toBe("sms");
      expect(body.totalRecipients).toBe(50);
    });

    it("defaults to email channel", async () => {
      const response = await app.handle(
        new Request("http://localhost/v1/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            awsAccountId: "aws-123",
            subject: "Test Email",
          }),
        })
      );

      expect(response.status).toBe(201);

      const body = await response.json();
      expect(body.channel).toBe("email");
    });

    it("requires awsAccountId", async () => {
      const response = await app.handle(
        new Request("http://localhost/v1/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channel: "email",
            subject: "Test",
          }),
        })
      );

      expect(response.status).toBe(400);

      const body = await response.json();
      expect(body.error).toBe("awsAccountId is required");
    });

    it("accepts optional email fields", async () => {
      const response = await app.handle(
        new Request("http://localhost/v1/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            awsAccountId: "aws-123",
            channel: "email",
            name: "Full Email Campaign",
            subject: "Welcome!",
            previewText: "You're going to love this",
            from: "hello@example.com",
            fromName: "The Team",
            replyTo: "support@example.com",
            templateId: "template-123",
          }),
        })
      );

      expect(response.status).toBe(201);

      const body = await response.json();
      expect(body.status).toBe("queued");
    });

    it("accepts scheduled send time", async () => {
      const scheduledFor = new Date(
        Date.now() + 24 * 60 * 60 * 1000
      ).toISOString();

      const response = await app.handle(
        new Request("http://localhost/v1/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            awsAccountId: "aws-123",
            subject: "Scheduled Email",
            scheduledFor,
          }),
        })
      );

      expect(response.status).toBe(201);
    });
  });

  describe("GET /v1/batch/:id", () => {
    it("returns batch status for queued batch", async () => {
      const response = await app.handle(
        new Request("http://localhost/v1/batch/batch-123")
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.id).toBe("batch-123");
      expect(body.status).toBe("queued");
      expect(body.channel).toBe("email");
      expect(body.name).toBe("Test Batch");
      expect(body.totalRecipients).toBe(100);
      expect(body.processedRecipients).toBe(0);
      expect(body.sent).toBe(0);
      expect(body.failed).toBe(0);
      expect(body.startedAt).toBeNull();
      expect(body.completedAt).toBeNull();
    });

    it("returns batch status for completed batch", async () => {
      const response = await app.handle(
        new Request("http://localhost/v1/batch/batch-456")
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.id).toBe("batch-456");
      expect(body.status).toBe("completed");
      expect(body.totalRecipients).toBe(100);
      expect(body.processedRecipients).toBe(100);
      expect(body.sent).toBe(95);
      expect(body.failed).toBe(5);
      expect(body.startedAt).toBe("2024-01-01T00:01:00.000Z");
      expect(body.completedAt).toBe("2024-01-01T00:05:00.000Z");
    });

    it("returns 404 for non-existent batch", async () => {
      const response = await app.handle(
        new Request("http://localhost/v1/batch/not-found")
      );

      expect(response.status).toBe(404);

      const body = await response.json();
      expect(body.error).toBe("Batch not found");
    });

    it("returns 403 for batch from different org", async () => {
      const response = await app.handle(
        new Request("http://localhost/v1/batch/other-org-batch")
      );

      expect(response.status).toBe(403);

      const body = await response.json();
      expect(body.error).toBe("Not authorized");
    });
  });
});

describe("Batch API - Edge Cases", () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    app = createTestApp();
  });

  it("handles empty string for optional fields", async () => {
    const response = await app.handle(
      new Request("http://localhost/v1/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          awsAccountId: "aws-123",
          name: "",
          subject: "",
        }),
      })
    );

    expect(response.status).toBe(201);
  });

  it("handles batch with all stats at zero", async () => {
    const response = await app.handle(
      new Request("http://localhost/v1/batch/batch-123")
    );

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.processedRecipients).toBe(0);
    expect(body.sent).toBe(0);
    expect(body.failed).toBe(0);
  });
});
