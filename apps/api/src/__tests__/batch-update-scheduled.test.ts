/**
 * Scheduled Batch Edit Tests
 *
 * Tests for PATCH /v1/batch/:id — edits a scheduled broadcast before it
 * starts. The route lives in batch-lifecycle.ts and hands a scheduled
 * broadcast to editScheduledBroadcast in batch.ts. Verifies:
 *  - Status gating (only draft and scheduled are editable)
 *  - The near-send cutoff
 *  - The EventBridge schedule moves only when time, account or channel change
 *  - A lost race with the worker (0 rows updated) is a 409, not a silent no-op
 *  - A failed re-create marks the row instead of leaving a silent orphan
 */

import { Elysia } from "elysia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FULL_ACCESS_PERMISSIONS } from "../services/api-keys";

const {
  mockFindBroadcast,
  mockFindBroadcastStatus,
  mockFindAwsAccountForOrg,
  mockUpdateScheduledBroadcast,
  mockEnqueueJob,
  mockCreateBroadcastSchedule,
  mockDeleteBroadcastSchedule,
  mockMarkBroadcastNotScheduled,
} = vi.hoisted(() => ({
  mockFindBroadcast: vi.fn(),
  mockFindBroadcastStatus: vi.fn(),
  mockFindAwsAccountForOrg: vi.fn(),
  mockUpdateScheduledBroadcast: vi.fn(),
  mockEnqueueJob: vi.fn(async (_args: unknown) => {}),
  mockCreateBroadcastSchedule: vi.fn(),
  mockDeleteBroadcastSchedule: vi.fn(async (_args: unknown) => {}),
  mockMarkBroadcastNotScheduled: vi.fn(async (..._args: unknown[]) => {}),
}));

vi.mock("@wraps/db", () => ({
  findBroadcast: mockFindBroadcast,
  findBroadcastStatus: mockFindBroadcastStatus,
  findAwsAccountForOrg: mockFindAwsAccountForOrg,
  updateScheduledBroadcast: mockUpdateScheduledBroadcast,
  promoteBroadcast: vi.fn(),
  countBroadcastRecipients: vi.fn(),
  createBroadcast: vi.fn(),
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
        apiKeyScopes: [...FULL_ACCESS_PERMISSIONS],
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
  deleteBroadcastSchedule: mockDeleteBroadcastSchedule,
}));

vi.mock("../lib/require-permission", () => ({
  requirePermission: vi.fn(async () => ({
    ok: true,
    userId: "user-123",
    role: "owner",
  })),
}));

vi.mock("../services/batch-lifecycle", () => ({
  withBatchAudit: vi.fn(),
}));

const { batchRoutes } = await import("../routes/batch");
const { batchLifecycleRoutes } = await import("../routes/batch-lifecycle");

// Mounted as index.ts mounts them, so the test hits the PATCH production does.
function createApp() {
  return new Elysia().use(batchRoutes).use(batchLifecycleRoutes);
}

const inOneDay = () => new Date(Date.now() + 24 * 60 * 60 * 1000);

function scheduledRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "batch-sched-1",
    organizationId: "org-123",
    awsAccountId: "aws-acc-1",
    channel: "email",
    name: "Launch",
    status: "scheduled" as const,
    audienceType: "all",
    topicId: null,
    segmentId: null,
    subject: "Hello",
    previewText: "Preview",
    from: "old@example.com",
    fromName: "Old Name",
    replyTo: null,
    emailTemplateId: null,
    htmlContent: "<p>Hi</p>",
    variableMappings: null,
    body: null,
    senderId: null,
    scheduledFor: inOneDay(),
    totalRecipients: 10,
    ...overrides,
  };
}

function patch(body: Record<string, unknown>, id = "batch-sched-1") {
  return createApp().handle(
    new Request(`http://localhost/v1/batch/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

describe("PATCH /v1/batch/:id (edit scheduled)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindBroadcastStatus.mockResolvedValue({ status: "scheduled" });
    mockFindAwsAccountForOrg.mockResolvedValue({ id: "aws-acc-1" });
    mockCreateBroadcastSchedule.mockImplementation(
      async (args: { batchId: string }) => ({
        scheduleName: `wraps-batch-${args.batchId}`,
        created: true,
      })
    );
  });

  it("updates the from address in place without touching the schedule", async () => {
    const row = scheduledRow();
    mockFindBroadcast.mockResolvedValueOnce(row);
    mockUpdateScheduledBroadcast.mockResolvedValueOnce({
      ...row,
      from: "new@example.com",
    });

    const response = await patch({ from: "new@example.com" });

    expect(response.status).toBe(200);
    expect(mockUpdateScheduledBroadcast).toHaveBeenCalledWith(
      row.id,
      "org-123",
      expect.objectContaining({
        from: "new@example.com",
        // Omitted fields keep their stored values.
        fromName: "Old Name",
        subject: "Hello",
        scheduledFor: row.scheduledFor,
      })
    );
    expect(mockDeleteBroadcastSchedule).not.toHaveBeenCalled();
    expect(mockCreateBroadcastSchedule).not.toHaveBeenCalled();
    expect(mockEnqueueJob).not.toHaveBeenCalled();
  });

  it("clears a field sent as null", async () => {
    const row = scheduledRow();
    mockFindBroadcast.mockResolvedValueOnce(row);
    mockUpdateScheduledBroadcast.mockResolvedValueOnce(row);

    await patch({ previewText: null, fromName: null });

    expect(mockUpdateScheduledBroadcast).toHaveBeenCalledWith(
      row.id,
      "org-123",
      expect.objectContaining({ previewText: null, fromName: null })
    );
  });

  it("deletes then re-creates the schedule when the time moves", async () => {
    const row = scheduledRow();
    const newTime = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    newTime.setMilliseconds(0);
    mockFindBroadcast.mockResolvedValueOnce(row);
    mockUpdateScheduledBroadcast.mockResolvedValueOnce({
      ...row,
      scheduledFor: newTime,
    });

    const response = await patch({ scheduledFor: newTime.toISOString() });

    expect(response.status).toBe(200);
    expect(mockDeleteBroadcastSchedule).toHaveBeenCalledWith(row.id);
    expect(mockCreateBroadcastSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        batchId: row.id,
        organizationId: "org-123",
        awsAccountId: "aws-acc-1",
        scheduledFor: newTime,
      })
    );
    const deleteOrder = mockDeleteBroadcastSchedule.mock.invocationCallOrder[0];
    const updateOrder =
      mockUpdateScheduledBroadcast.mock.invocationCallOrder[0];
    const createOrder = mockCreateBroadcastSchedule.mock.invocationCallOrder[0];
    expect(deleteOrder).toBeLessThan(updateOrder);
    expect(updateOrder).toBeLessThan(createOrder);
  });

  it("re-creates the schedule when the AWS account changes", async () => {
    const row = scheduledRow();
    mockFindAwsAccountForOrg.mockResolvedValueOnce({ id: "aws-acc-2" });
    mockFindBroadcast.mockResolvedValueOnce(row);
    mockUpdateScheduledBroadcast.mockResolvedValueOnce({
      ...row,
      awsAccountId: "aws-acc-2",
    });

    await patch({ awsAccountId: "aws-acc-2" });

    expect(mockDeleteBroadcastSchedule).toHaveBeenCalledWith(row.id);
    expect(mockCreateBroadcastSchedule).toHaveBeenCalledWith(
      expect.objectContaining({ awsAccountId: "aws-acc-2" })
    );
  });

  it("rejects a broadcast that is neither draft nor scheduled (409)", async () => {
    mockFindBroadcastStatus.mockResolvedValueOnce({ status: "processing" });

    const response = await patch({ from: "new@example.com" });

    expect(response.status).toBe(409);
    expect(mockUpdateScheduledBroadcast).not.toHaveBeenCalled();
  });

  it("rejects clearing the send time of a scheduled broadcast (400)", async () => {
    const response = await patch({ scheduledFor: null });

    expect(response.status).toBe(400);
    expect(mockUpdateScheduledBroadcast).not.toHaveBeenCalled();
    expect(mockDeleteBroadcastSchedule).not.toHaveBeenCalled();
  });

  it("returns 404 for a batch outside the org", async () => {
    mockFindBroadcastStatus.mockResolvedValueOnce(null);

    const response = await patch({ from: "attacker@evil.com" });

    expect(response.status).toBe(404);
    expect(mockUpdateScheduledBroadcast).not.toHaveBeenCalled();
  });

  it("rejects edits inside the cutoff before the send time (409)", async () => {
    mockFindBroadcast.mockResolvedValueOnce(
      scheduledRow({ scheduledFor: new Date(Date.now() + 30 * 1000) })
    );

    const response = await patch({ from: "new@example.com" });

    expect(response.status).toBe(409);
    expect(mockUpdateScheduledBroadcast).not.toHaveBeenCalled();
    expect(mockDeleteBroadcastSchedule).not.toHaveBeenCalled();
  });

  it("refuses to turn an edit into an immediate send", async () => {
    mockFindBroadcast.mockResolvedValueOnce(scheduledRow());

    const response = await patch({ scheduledFor: new Date().toISOString() });

    expect(response.status).toBe(400);
    expect(mockUpdateScheduledBroadcast).not.toHaveBeenCalled();
    expect(mockEnqueueJob).not.toHaveBeenCalled();
  });

  it("returns 409 when the worker started the send first", async () => {
    mockFindBroadcast.mockResolvedValueOnce(scheduledRow());
    mockUpdateScheduledBroadcast.mockResolvedValueOnce(null);

    const response = await patch({ from: "new@example.com" });

    expect(response.status).toBe(409);
    expect(mockCreateBroadcastSchedule).not.toHaveBeenCalled();
  });

  it("marks the row when the moved schedule cannot be re-created", async () => {
    const row = scheduledRow();
    mockFindBroadcast.mockResolvedValueOnce(row);
    mockUpdateScheduledBroadcast.mockResolvedValueOnce(row);
    mockCreateBroadcastSchedule.mockRejectedValueOnce(
      new Error("EventBridge down")
    );

    const response = await patch({
      scheduledFor: new Date(
        Date.now() + 3 * 24 * 60 * 60 * 1000
      ).toISOString(),
    });

    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(mockMarkBroadcastNotScheduled).toHaveBeenCalledWith(
      row.id,
      "org-123",
      expect.stringContaining("could not be moved")
    );
  });

  it("re-creates a schedule lost by an earlier failed move, then clears the marker", async () => {
    const row = scheduledRow({
      errorMessage:
        "The schedule for this broadcast could not be moved after an edit, so it will not send automatically. Edit it again to reschedule, or cancel it.",
    });
    mockFindBroadcast.mockResolvedValueOnce(row);
    mockUpdateScheduledBroadcast.mockResolvedValue(row);

    // Same time as stored: only the marker forces the re-create.
    const response = await patch({ from: "new@example.com" });

    expect(response.status).toBe(200);
    expect(mockCreateBroadcastSchedule).toHaveBeenCalledTimes(1);
    expect(mockUpdateScheduledBroadcast).toHaveBeenLastCalledWith(
      row.id,
      "org-123",
      { errorMessage: null }
    );
  });
});
