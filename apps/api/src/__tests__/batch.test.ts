/**
 * POST /v1/batch — Batch Creation
 *
 * Tests unique POST /v1/batch behaviors not covered elsewhere:
 *   - Scheduled vs immediate send routing
 *   - Recipient count: auto-count vs pre-counted
 *   - Response shape
 *
 * IDOR prevention is in batch-idor.test.ts.
 * GET/DELETE is in batch-get-cancel.test.ts.
 * Draft promote (POST /:id/send) is in batch-promote.test.ts.
 */

import { Elysia } from "elysia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockFindAwsAccountForOrg,
  mockCountBroadcastRecipients,
  mockCreateBroadcast,
  mockEnqueueJob,
  mockCreateBroadcastSchedule,
  mockMarkBroadcastNotScheduled,
} = vi.hoisted(() => ({
  mockFindAwsAccountForOrg: vi.fn(),
  mockCountBroadcastRecipients: vi.fn(),
  mockCreateBroadcast: vi.fn(),
  mockEnqueueJob: vi.fn(async (_args: unknown) => {}),
  mockCreateBroadcastSchedule: vi.fn(async (args: { batchId: string }) => ({
    scheduleName: `wraps-batch-${args.batchId}`,
    created: true,
  })),
  mockMarkBroadcastNotScheduled: vi.fn(async () => {}),
}));

vi.mock("@wraps/db", () => ({
  findAwsAccountForOrg: mockFindAwsAccountForOrg,
  countBroadcastRecipients: mockCountBroadcastRecipients,
  createBroadcast: mockCreateBroadcast,
  findBroadcast: vi.fn(),
  promoteBroadcast: vi.fn(),
  cancelBroadcast: vi.fn(),
  markBroadcastNotScheduled: mockMarkBroadcastNotScheduled,
}));

vi.mock("../middleware/auth", () => ({
  getAuth: (ctx: { auth: unknown }) => ctx.auth,
  getAuthOptional: (ctx: { auth: unknown }) => ctx.auth ?? null,
  createAuthenticatedRoutes: vi.fn((prefix: string) =>
    new Elysia({ prefix }).derive(() => ({
      auth: {
        apiKeyId: "key-123",
        organizationId: "org-123",
        userId: "user-123",
        planId: "pro",
      },
      authError: null,
    }))
  ),
}));

vi.mock("../middleware/plan-gate", () => ({
  planGateMiddleware: vi.fn(() => new Elysia()),
}));

vi.mock("../middleware/rate-limit", () => ({
  rateLimitMiddleware: new Elysia(),
}));

vi.mock("../services/queue", () => ({
  enqueueJob: mockEnqueueJob,
}));

vi.mock("../services/scheduler", () => ({
  createBroadcastSchedule: mockCreateBroadcastSchedule,
  deleteBroadcastSchedule: vi.fn(async () => {}),
}));

const { batchRoutes } = await import("../routes/batch");

function createApp() {
  return new Elysia().use(batchRoutes);
}

const baseCreatedBatch = {
  id: "batch-new",
  organizationId: "org-123",
  awsAccountId: "aws-acc-1",
  channel: "email" as const,
  name: "Test Campaign",
  status: "queued" as const,
  audienceType: "all",
  topicId: null,
  segmentId: null,
  subject: "Hello",
  previewText: null,
  from: "hello@example.com",
  fromName: null,
  replyTo: null,
  emailTemplateId: null,
  htmlContent: null,
  body: null,
  senderId: null,
  scheduledFor: null,
  totalRecipients: 50,
  processedRecipients: 0,
  sent: 0,
  failed: 0,
  startedAt: null,
  completedAt: null,
  createdAt: new Date("2026-04-23T00:00:00.000Z"),
  createdBy: "user-123",
  updatedAt: new Date("2026-04-23T00:00:00.000Z"),
};

describe("POST /v1/batch", () => {
  beforeEach(() => {
    mockFindAwsAccountForOrg.mockReset();
    mockCountBroadcastRecipients.mockReset();
    mockCreateBroadcast.mockReset();
    mockEnqueueJob.mockReset();
    mockCreateBroadcastSchedule.mockReset();
    mockCreateBroadcastSchedule.mockImplementation(
      async (args: { batchId: string }) => ({
        scheduleName: `wraps-batch-${args.batchId}`,
        created: true,
      })
    );
    mockMarkBroadcastNotScheduled.mockReset();
  });

  it("returns full response shape: id, status, channel, totalRecipients, createdAt", async () => {
    mockFindAwsAccountForOrg.mockResolvedValueOnce({ id: "aws-acc-1" });
    mockCountBroadcastRecipients.mockResolvedValueOnce(50);
    mockCreateBroadcast.mockResolvedValueOnce(baseCreatedBatch);

    const app = createApp();
    const response = await app.handle(
      new Request("http://localhost/v1/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          awsAccountId: "aws-acc-1",
          channel: "email",
          subject: "Hello",
          from: "hello@example.com",
        }),
      })
    );

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.id).toBe("batch-new");
    expect(body.status).toBe("queued");
    expect(body.channel).toBe("email");
    expect(body.totalRecipients).toBe(50);
    expect(body.createdAt).toBe("2026-04-23T00:00:00.000Z");
  });

  it("counts recipients from DB when totalRecipients is not provided", async () => {
    mockFindAwsAccountForOrg.mockResolvedValueOnce({ id: "aws-acc-1" });
    mockCountBroadcastRecipients.mockResolvedValueOnce(77);
    mockCreateBroadcast.mockResolvedValueOnce({
      ...baseCreatedBatch,
      totalRecipients: 77,
    });

    const app = createApp();
    await app.handle(
      new Request("http://localhost/v1/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          awsAccountId: "aws-acc-1",
          channel: "email",
          subject: "Hello",
          from: "hello@example.com",
        }),
      })
    );

    expect(mockCountBroadcastRecipients).toHaveBeenCalledTimes(1);
    expect(mockCountBroadcastRecipients).toHaveBeenCalledWith(
      "org-123",
      "email",
      expect.objectContaining({ audienceType: undefined })
    );
  });

  it("skips countBroadcastRecipients when totalRecipients is pre-counted in request", async () => {
    mockFindAwsAccountForOrg.mockResolvedValueOnce({ id: "aws-acc-1" });
    mockCreateBroadcast.mockResolvedValueOnce({
      ...baseCreatedBatch,
      totalRecipients: 42,
    });

    const app = createApp();
    const response = await app.handle(
      new Request("http://localhost/v1/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          awsAccountId: "aws-acc-1",
          channel: "email",
          subject: "Hello",
          from: "hello@example.com",
          totalRecipients: 42,
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(mockCountBroadcastRecipients).not.toHaveBeenCalled();

    const body = await response.json();
    expect(body.totalRecipients).toBe(42);
  });

  it("with scheduledFor in the future: creates EventBridge schedule and does NOT enqueue", async () => {
    const scheduledFor = new Date(Date.now() + 24 * 60 * 60 * 1000);

    mockFindAwsAccountForOrg.mockResolvedValueOnce({ id: "aws-acc-1" });
    mockCountBroadcastRecipients.mockResolvedValueOnce(20);
    mockCreateBroadcast.mockResolvedValueOnce({
      ...baseCreatedBatch,
      status: "scheduled",
      scheduledFor,
      totalRecipients: 20,
    });

    const app = createApp();
    const response = await app.handle(
      new Request("http://localhost/v1/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          awsAccountId: "aws-acc-1",
          channel: "email",
          subject: "Hello",
          from: "hello@example.com",
          scheduledFor: scheduledFor.toISOString(),
        }),
      })
    );

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.status).toBe("scheduled");

    expect(mockCreateBroadcastSchedule).toHaveBeenCalledTimes(1);
    expect(mockCreateBroadcastSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        batchId: "batch-new",
        organizationId: "org-123",
        awsAccountId: "aws-acc-1",
        channel: "email",
      })
    );
    expect(mockEnqueueJob).not.toHaveBeenCalled();
  });

  it("with immediate send: enqueues job with chunkIndex=0 and does NOT create EventBridge schedule", async () => {
    mockFindAwsAccountForOrg.mockResolvedValueOnce({ id: "aws-acc-1" });
    mockCountBroadcastRecipients.mockResolvedValueOnce(10);
    mockCreateBroadcast.mockResolvedValueOnce(baseCreatedBatch);

    const app = createApp();
    await app.handle(
      new Request("http://localhost/v1/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          awsAccountId: "aws-acc-1",
          channel: "email",
          subject: "Hello",
          from: "hello@example.com",
        }),
      })
    );

    expect(mockEnqueueJob).toHaveBeenCalledTimes(1);
    expect(mockEnqueueJob).toHaveBeenCalledWith(
      expect.objectContaining({
        batchId: "batch-new",
        organizationId: "org-123",
        awsAccountId: "aws-acc-1",
        channel: "email",
        chunkIndex: 0,
      })
    );
    expect(mockCreateBroadcastSchedule).not.toHaveBeenCalled();
  });
});
