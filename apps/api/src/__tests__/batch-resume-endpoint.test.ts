/**
 * Batch Resume Endpoint Tests
 *
 * POST /v1/batch/:id/resume — operator escape hatch for stuck broadcasts.
 * Covers org scoping, channel/status/aws gating, the kill switch, and the
 * off-by-one-safe resume-point computation.
 */

import { Elysia } from "elysia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSelectLimit, mockUpdateWhere, mockEnqueueJob } = vi.hoisted(() => ({
  mockSelectLimit: vi.fn(),
  mockUpdateWhere: vi.fn(),
  mockEnqueueJob: vi.fn(),
}));

const updateSetCalls: Record<string, unknown>[] = [];

vi.mock("@wraps/db", () => {
  const makeWhereResult = () => ({
    limit: mockSelectLimit,
    then(resolve: (v: unknown) => void, reject?: (e: unknown) => void) {
      return Promise.resolve(mockSelectLimit()).then(resolve, reject);
    },
  });

  return {
    db: {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => makeWhereResult()),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn((values: Record<string, unknown>) => {
          updateSetCalls.push(values);
          return { where: mockUpdateWhere };
        }),
      })),
    },
    batchSend: {
      id: "id",
      organizationId: "organization_id",
      awsAccountId: "aws_account_id",
      channel: "channel",
      status: "status",
      lastChunkIndex: "last_chunk_index",
      lastCursor: "last_cursor",
      lastChunkAt: "last_chunk_at",
      errorDetails: "error_details",
      updatedAt: "updated_at",
    },
    awsAccount: {
      id: "id",
      organizationId: "organization_id",
    },
    contact: {
      id: "id",
      organizationId: "organization_id",
      email: "email",
      emailStatus: "email_status",
      phone: "phone",
      smsStatus: "sms_status",
    },
    contactTopic: {
      contactId: "contact_id",
      topicId: "topic_id",
      status: "status",
    },
    eq: vi.fn((a, b) => ({ eq: [a, b] })),
    and: vi.fn((...args) => ({ and: args })),
  };
});

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args) => ({ and: args })),
  exists: vi.fn(),
  isNotNull: vi.fn(),
  sql: vi.fn(),
}));

vi.mock("../middleware/auth", () => ({
  getAuth: (ctx: { auth: unknown }) => ctx.auth,
  getAuthOptional: (ctx: { auth: unknown }) => ctx.auth ?? null,
  createAuthenticatedRoutes: vi.fn((prefix: string) =>
    new Elysia({ prefix }).derive(() => ({
      auth: {
        apiKeyId: "key-123",
        organizationId: "org-123",
        userId: "user-456",
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
  createBroadcastSchedule: vi.fn(async () => ({
    scheduleName: "mock-schedule-name",
    created: true,
  })),
  deleteBroadcastSchedule: vi.fn(async () => {}),
}));

const { batchRoutes } = await import("../routes/batch");

function createApp() {
  return new Elysia().use(batchRoutes);
}

function resumeRequest(id: string, body?: Record<string, unknown>): Request {
  return new Request(`http://localhost/v1/batch/${id}/resume`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

function makeBatch(overrides: Record<string, unknown> = {}) {
  return {
    id: "batch-1",
    organizationId: "org-123",
    awsAccountId: "aws-1",
    channel: "email",
    status: "failed",
    lastChunkIndex: 3,
    lastCursor: { createdAt: "2026-01-15T10:00:00.000Z", id: "contact-150" },
    errorDetails: null,
    ...overrides,
  };
}

beforeEach(() => {
  mockSelectLimit.mockReset();
  mockUpdateWhere.mockReset().mockResolvedValue(undefined);
  mockEnqueueJob.mockReset().mockResolvedValue(undefined);
  updateSetCalls.length = 0;
  delete process.env.BROADCAST_RESUME_ENABLED;
});

describe("POST /v1/batch/:id/resume", () => {
  it("resumes a failed batch from the durable heartbeat pointer (tracer)", async () => {
    mockSelectLimit.mockResolvedValueOnce([makeBatch()]);

    const response = await createApp().handle(resumeRequest("batch-1"));

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ resumed: true, fromChunkIndex: 4 });

    expect(mockEnqueueJob).toHaveBeenCalledTimes(1);
    expect(mockEnqueueJob).toHaveBeenCalledWith({
      batchId: "batch-1",
      organizationId: "org-123",
      awsAccountId: "aws-1",
      channel: "email",
      chunkIndex: 4,
      cursor: { createdAt: "2026-01-15T10:00:00.000Z", id: "contact-150" },
    });
  });

  it("starts at chunk 0 with no cursor when no chunk has completed", async () => {
    mockSelectLimit.mockResolvedValueOnce([
      makeBatch({ lastChunkIndex: null, lastCursor: null }),
    ]);

    const response = await createApp().handle(resumeRequest("batch-1"));

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ resumed: true, fromChunkIndex: 0 });

    expect(mockEnqueueJob).toHaveBeenCalledWith(
      expect.objectContaining({ chunkIndex: 0, cursor: undefined })
    );
  });

  it("operator override: body.fromChunkIndex forces cursor=undefined", async () => {
    mockSelectLimit.mockResolvedValueOnce([makeBatch()]);

    await createApp().handle(resumeRequest("batch-1", { fromChunkIndex: 2 }));

    expect(mockEnqueueJob).toHaveBeenCalledWith(
      expect.objectContaining({ chunkIndex: 2, cursor: undefined })
    );
  });

  it("flips status to processing and appends a resumes entry to errorDetails", async () => {
    mockSelectLimit.mockResolvedValueOnce([
      makeBatch({
        errorDetails: { chunksFailed: [{ failedChunkIndex: 3, at: "t0" }] },
      }),
    ]);

    await createApp().handle(resumeRequest("batch-1"));

    const mutation = updateSetCalls.find(
      (call) => call.status === "processing"
    );
    expect(mutation).toBeDefined();
    expect(mutation?.lastChunkAt).toBeInstanceOf(Date);

    const details = mutation?.errorDetails as {
      chunksFailed?: unknown[];
      resumes?: Array<Record<string, unknown>>;
    };
    // Preserves prior audit
    expect(details.chunksFailed).toHaveLength(1);
    // Appends new resume entry
    expect(details.resumes).toBeDefined();
    expect(details.resumes?.[0]).toMatchObject({
      fromChunkIndex: 4,
      resumedBy: "user-456",
    });
    expect(details.resumes?.[0]?.resumedAt).toEqual(expect.any(String));
  });

  it("returns 404 when the batch does not exist in this org", async () => {
    mockSelectLimit.mockResolvedValueOnce([]);

    const response = await createApp().handle(resumeRequest("missing"));

    expect(response.status).toBe(404);
    expect(mockEnqueueJob).not.toHaveBeenCalled();
  });

  it("returns 409 when status is not processing or failed", async () => {
    for (const status of [
      "draft",
      "scheduled",
      "queued",
      "completed",
      "cancelled",
    ] as const) {
      mockSelectLimit.mockReset();
      mockEnqueueJob.mockClear();
      mockSelectLimit.mockResolvedValueOnce([makeBatch({ status })]);

      const response = await createApp().handle(resumeRequest("batch-1"));
      expect(response.status, `status=${status}`).toBe(409);
      expect(mockEnqueueJob).not.toHaveBeenCalled();
    }
  });

  it("returns 409 for SMS-channel batches (resume is email-only)", async () => {
    mockSelectLimit.mockResolvedValueOnce([
      makeBatch({ channel: "sms", status: "failed" }),
    ]);

    const response = await createApp().handle(resumeRequest("batch-1"));

    expect(response.status).toBe(409);
    expect(mockEnqueueJob).not.toHaveBeenCalled();
  });

  it("returns 409 when awsAccountId is null (AWS account was disconnected)", async () => {
    mockSelectLimit.mockResolvedValueOnce([makeBatch({ awsAccountId: null })]);

    const response = await createApp().handle(resumeRequest("batch-1"));

    expect(response.status).toBe(409);
    expect(mockEnqueueJob).not.toHaveBeenCalled();
  });

  it("returns 503 when BROADCAST_RESUME_ENABLED=false (kill switch)", async () => {
    process.env.BROADCAST_RESUME_ENABLED = "false";
    mockSelectLimit.mockResolvedValueOnce([makeBatch()]);

    const response = await createApp().handle(resumeRequest("batch-1"));

    expect(response.status).toBe(503);
    expect(mockEnqueueJob).not.toHaveBeenCalled();
  });
});
