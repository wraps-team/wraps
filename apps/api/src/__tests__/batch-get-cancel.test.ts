/**
 * Batch GET + DELETE Tests
 *
 * Tests for:
 *   GET  /v1/batch/:id  — status polling, IDOR prevention
 *   DELETE /v1/batch/:id — cancel, status gate, scheduled side-effect, IDOR
 */

import { Elysia } from "elysia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockFindBroadcast, mockCancelBroadcast, mockDeleteBroadcastSchedule } =
  vi.hoisted(() => ({
    mockFindBroadcast: vi.fn(),
    mockCancelBroadcast: vi.fn(async (_id: string, _orgId: string) => {}),
    mockDeleteBroadcastSchedule: vi.fn(async (_id: string) => {}),
  }));

vi.mock("@wraps/db", () => ({
  findBroadcast: mockFindBroadcast,
  cancelBroadcast: mockCancelBroadcast,
  findAwsAccountForOrg: vi.fn(),
  countBroadcastRecipients: vi.fn(),
  createBroadcast: vi.fn(),
  promoteBroadcast: vi.fn(),
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
  enqueueJob: vi.fn(async () => {}),
}));

vi.mock("../services/scheduler", () => ({
  createBroadcastSchedule: vi.fn(async () => ({
    scheduleName: "mock-schedule-name",
    created: true,
  })),
  deleteBroadcastSchedule: mockDeleteBroadcastSchedule,
}));

const { batchRoutes } = await import("../routes/batch");

function createApp() {
  return new Elysia().use(batchRoutes);
}

const queuedBatch = {
  id: "batch-1",
  organizationId: "org-123",
  awsAccountId: "aws-acc-1",
  channel: "email",
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
  totalRecipients: 100,
  processedRecipients: 0,
  sent: 0,
  delivered: 0,
  failed: 0,
  opened: 0,
  clicked: 0,
  bounced: 0,
  complained: 0,
  suppressed: 0,
  startedAt: null,
  completedAt: null,
  createdAt: new Date("2026-04-23T00:00:00.000Z"),
  createdBy: "user-123",
  updatedAt: new Date("2026-04-23T00:00:00.000Z"),
};

// ── GET /v1/batch/:id ────────────────────────────────────────────────────────

describe("GET /v1/batch/:id", () => {
  beforeEach(() => {
    mockFindBroadcast.mockReset();
    mockCancelBroadcast.mockReset();
    mockDeleteBroadcastSchedule.mockReset();
  });

  it("returns batch status fields for an org-owned batch", async () => {
    const processingBatch = {
      ...queuedBatch,
      status: "processing" as const,
      processedRecipients: 40,
      sent: 38,
      failed: 2,
      startedAt: new Date("2026-04-23T01:00:00.000Z"),
    };
    mockFindBroadcast.mockResolvedValueOnce(processingBatch);

    const app = createApp();
    const response = await app.handle(
      new Request(`http://localhost/v1/batch/${processingBatch.id}`)
    );

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.id).toBe(processingBatch.id);
    expect(body.status).toBe("processing");
    expect(body.totalRecipients).toBe(100);
    expect(body.processedRecipients).toBe(40);
    expect(body.sent).toBe(38);
    expect(body.failed).toBe(2);
    expect(body.startedAt).toBe("2026-04-23T01:00:00.000Z");
    expect(body.completedAt).toBeNull();

    // Verify the lookup was org-scoped — not just by id
    expect(mockFindBroadcast).toHaveBeenCalledWith(
      processingBatch.id,
      "org-123"
    );
  });

  it("returns 404 for a batch that belongs to a different org (IDOR)", async () => {
    // findBroadcast returns null for cross-org ids (scoped to org-123)
    mockFindBroadcast.mockResolvedValueOnce(null);

    const app = createApp();
    const response = await app.handle(
      new Request("http://localhost/v1/batch/other-orgs-batch-id")
    );

    expect(response.status).toBe(404);

    // Verify the lookup used the caller's org, not the attacker's
    expect(mockFindBroadcast).toHaveBeenCalledWith(
      "other-orgs-batch-id",
      "org-123"
    );
  });

  it("returns 404 for a batch that does not exist", async () => {
    mockFindBroadcast.mockResolvedValueOnce(null);

    const app = createApp();
    const response = await app.handle(
      new Request("http://localhost/v1/batch/nonexistent-id")
    );

    expect(response.status).toBe(404);
  });
});

// ── DELETE /v1/batch/:id ─────────────────────────────────────────────────────

describe("DELETE /v1/batch/:id (cancel)", () => {
  beforeEach(() => {
    mockFindBroadcast.mockReset();
    mockCancelBroadcast.mockReset();
    mockDeleteBroadcastSchedule.mockReset();
  });

  it("cancels a queued batch and returns success", async () => {
    mockFindBroadcast.mockResolvedValueOnce(queuedBatch);

    const app = createApp();
    const response = await app.handle(
      new Request(`http://localhost/v1/batch/${queuedBatch.id}`, {
        method: "DELETE",
      })
    );

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.id).toBe(queuedBatch.id);
    expect(body.status).toBe("cancelled");

    // Verify the cancel was org-scoped
    expect(mockCancelBroadcast).toHaveBeenCalledTimes(1);
    expect(mockCancelBroadcast).toHaveBeenCalledWith(queuedBatch.id, "org-123");

    // No EventBridge cleanup for a non-scheduled batch
    expect(mockDeleteBroadcastSchedule).not.toHaveBeenCalled();
  });

  it("deletes the EventBridge schedule before cancelling a scheduled batch", async () => {
    const scheduledBatch = {
      ...queuedBatch,
      status: "scheduled" as const,
      scheduledFor: new Date(Date.now() + 24 * 60 * 60 * 1000),
    };
    mockFindBroadcast.mockResolvedValueOnce(scheduledBatch);

    const app = createApp();
    const response = await app.handle(
      new Request(`http://localhost/v1/batch/${scheduledBatch.id}`, {
        method: "DELETE",
      })
    );

    expect(response.status).toBe(200);

    // EventBridge schedule must be deleted for scheduled batches
    expect(mockDeleteBroadcastSchedule).toHaveBeenCalledTimes(1);
    expect(mockDeleteBroadcastSchedule).toHaveBeenCalledWith(scheduledBatch.id);

    // DB cancel must happen regardless
    expect(mockCancelBroadcast).toHaveBeenCalledTimes(1);
    expect(mockCancelBroadcast).toHaveBeenCalledWith(
      scheduledBatch.id,
      "org-123"
    );

    // Order matters: EventBridge must be cleaned up BEFORE the DB status is updated,
    // so a failed delete doesn't leave a live schedule pointing at a cancelled batch.
    const scheduleCallOrder =
      mockDeleteBroadcastSchedule.mock.invocationCallOrder[0];
    const cancelCallOrder = mockCancelBroadcast.mock.invocationCallOrder[0];
    expect(scheduleCallOrder).toBeLessThan(cancelCallOrder);
  });

  it("does NOT delete the EventBridge schedule when cancelling a queued batch", async () => {
    mockFindBroadcast.mockResolvedValueOnce(queuedBatch);

    const app = createApp();
    await app.handle(
      new Request(`http://localhost/v1/batch/${queuedBatch.id}`, {
        method: "DELETE",
      })
    );

    expect(mockDeleteBroadcastSchedule).not.toHaveBeenCalled();
    expect(mockCancelBroadcast).toHaveBeenCalledTimes(1);
  });

  it("returns 404 for a batch that belongs to a different org (IDOR)", async () => {
    mockFindBroadcast.mockResolvedValueOnce(null);

    const app = createApp();
    const response = await app.handle(
      new Request("http://localhost/v1/batch/other-orgs-batch-id", {
        method: "DELETE",
      })
    );

    expect(response.status).toBe(404);

    // No DB writes, no EventBridge calls
    expect(mockCancelBroadcast).not.toHaveBeenCalled();
    expect(mockDeleteBroadcastSchedule).not.toHaveBeenCalled();

    // Verify the lookup was org-scoped
    expect(mockFindBroadcast).toHaveBeenCalledWith(
      "other-orgs-batch-id",
      "org-123"
    );
  });

  it("returns 400 when cancelling a completed batch (status gate)", async () => {
    mockFindBroadcast.mockResolvedValueOnce({
      ...queuedBatch,
      status: "completed" as const,
    });

    const app = createApp();
    const response = await app.handle(
      new Request(`http://localhost/v1/batch/${queuedBatch.id}`, {
        method: "DELETE",
      })
    );

    expect(response.status).toBe(400);

    expect(mockCancelBroadcast).not.toHaveBeenCalled();
    expect(mockDeleteBroadcastSchedule).not.toHaveBeenCalled();
  });

  it("returns 400 when cancelling a draft batch (drafts are deleted, not cancelled)", async () => {
    mockFindBroadcast.mockResolvedValueOnce({
      ...queuedBatch,
      status: "draft" as const,
    });

    const app = createApp();
    const response = await app.handle(
      new Request(`http://localhost/v1/batch/${queuedBatch.id}`, {
        method: "DELETE",
      })
    );

    expect(response.status).toBe(400);

    expect(mockCancelBroadcast).not.toHaveBeenCalled();
    expect(mockDeleteBroadcastSchedule).not.toHaveBeenCalled();
  });
});
