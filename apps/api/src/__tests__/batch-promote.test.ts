/**
 * Batch Draft Promote Tests
 *
 * Tests for POST /v1/batch/:id/send — promotes an existing draft batch_send
 * row to an active send (queued or scheduled). Verifies:
 *  - Draft-scoped update (org-scoped, status='draft')
 *  - IDOR prevention (cross-org draft unreachable)
 *  - Status gating (non-draft rejected with 400)
 *  - Scheduled vs immediate side-effect routing
 *  - Single-row update invariant (no concurrent promote)
 */

import { Elysia } from "elysia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockFindBroadcast,
  mockFindAwsAccountForOrg,
  mockPromoteBroadcast,
  mockEnqueueJob,
  mockCreateBroadcastSchedule,
  mockDeleteBroadcastSchedule,
  mockMarkBroadcastNotScheduled,
} = vi.hoisted(() => ({
  mockMarkBroadcastNotScheduled: vi.fn(async () => {}),
  mockFindBroadcast: vi.fn(),
  mockFindAwsAccountForOrg: vi.fn(),
  mockPromoteBroadcast: vi.fn(),
  mockEnqueueJob: vi.fn(async (_args: unknown) => {}),
  mockCreateBroadcastSchedule: vi.fn(async (args: { batchId: string }) => ({
    scheduleName: `wraps-batch-${args.batchId}`,
    created: true,
  })),
  mockDeleteBroadcastSchedule: vi.fn(async (_args: unknown) => {}),
}));

vi.mock("@wraps/db", () => ({
  findBroadcast: mockFindBroadcast,
  findAwsAccountForOrg: mockFindAwsAccountForOrg,
  promoteBroadcast: mockPromoteBroadcast,
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

// Import after mocks are set up
const { batchRoutes } = await import("../routes/batch");

function createApp() {
  return new Elysia().use(batchRoutes);
}

const draftRow = {
  id: "batch-draft-1",
  organizationId: "org-123",
  awsAccountId: "aws-acc-1",
  channel: "email",
  name: "Draft Campaign",
  status: "draft" as const,
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
  totalRecipients: 0,
  processedRecipients: 0,
  sent: 0,
  failed: 0,
  startedAt: null,
  completedAt: null,
  createdAt: new Date("2026-04-23T00:00:00.000Z"),
  createdBy: "user-123",
  updatedAt: new Date("2026-04-23T00:00:00.000Z"),
};

describe("POST /v1/batch/:id/send (promote draft)", () => {
  beforeEach(() => {
    mockFindBroadcast.mockReset();
    mockFindAwsAccountForOrg.mockReset();
    mockPromoteBroadcast.mockReset();
    mockEnqueueJob.mockReset();
    mockCreateBroadcastSchedule.mockReset();
    mockDeleteBroadcastSchedule.mockReset();
  });

  it("loads a draft matching (id, orgId) and enqueues it with correct ids (201)", async () => {
    mockFindBroadcast.mockResolvedValueOnce(draftRow);
    mockFindAwsAccountForOrg.mockResolvedValueOnce({
      id: draftRow.awsAccountId,
    });
    mockPromoteBroadcast.mockResolvedValueOnce({
      ...draftRow,
      status: "queued",
      totalRecipients: 42,
    });

    const app = createApp();

    const response = await app.handle(
      new Request(`http://localhost/v1/batch/${draftRow.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          awsAccountId: draftRow.awsAccountId,
          channel: "email",
          subject: "Hello",
          from: "hello@example.com",
          totalRecipients: 42,
        }),
      })
    );

    expect(response.status).toBe(201);

    const body = await response.json();
    expect(body.id).toBe(draftRow.id);
    expect(body.status).toBe("queued");

    // Verify the promote was attempted on the right (id, org) pair
    expect(mockPromoteBroadcast).toHaveBeenCalledTimes(1);
    expect(mockPromoteBroadcast).toHaveBeenCalledWith(
      draftRow.id,
      "org-123",
      expect.objectContaining({ status: "queued" })
    );

    // Verify enqueue received the correct ids — not just that it was called
    expect(mockEnqueueJob).toHaveBeenCalledTimes(1);
    expect(mockEnqueueJob).toHaveBeenCalledWith(
      expect.objectContaining({
        batchId: draftRow.id,
        organizationId: "org-123",
        awsAccountId: draftRow.awsAccountId,
        channel: "email",
      })
    );
    expect(mockCreateBroadcastSchedule).not.toHaveBeenCalled();
  });

  it("returns 404 when the draft belongs to a different org (IDOR)", async () => {
    mockFindBroadcast.mockResolvedValueOnce(null);

    const app = createApp();

    const response = await app.handle(
      new Request(`http://localhost/v1/batch/${draftRow.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          awsAccountId: draftRow.awsAccountId,
          channel: "email",
          subject: "Phishing",
          from: "attacker@evil.com",
          totalRecipients: 1,
        }),
      })
    );

    expect(response.status).toBe(404);

    expect(mockEnqueueJob).not.toHaveBeenCalled();
    expect(mockCreateBroadcastSchedule).not.toHaveBeenCalled();
    expect(mockPromoteBroadcast).not.toHaveBeenCalled();
  });

  it("returns 400 when the target batch is not a draft (e.g., already queued)", async () => {
    mockFindBroadcast.mockResolvedValueOnce({
      ...draftRow,
      status: "queued",
    });

    const app = createApp();

    const response = await app.handle(
      new Request(`http://localhost/v1/batch/${draftRow.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          awsAccountId: draftRow.awsAccountId,
          channel: "email",
          subject: "Hello",
          from: "hello@example.com",
          totalRecipients: 10,
        }),
      })
    );

    expect(response.status).toBe(400);

    expect(mockEnqueueJob).not.toHaveBeenCalled();
    expect(mockCreateBroadcastSchedule).not.toHaveBeenCalled();
    expect(mockPromoteBroadcast).not.toHaveBeenCalled();
  });

  it("with scheduledFor in the future, sets status='scheduled' and calls createBroadcastSchedule", async () => {
    const scheduledFor = new Date(Date.now() + 24 * 60 * 60 * 1000);

    mockFindBroadcast.mockResolvedValueOnce(draftRow);
    mockFindAwsAccountForOrg.mockResolvedValueOnce({
      id: draftRow.awsAccountId,
    });
    mockPromoteBroadcast.mockResolvedValueOnce({
      ...draftRow,
      status: "scheduled",
      scheduledFor,
      totalRecipients: 7,
    });

    const app = createApp();

    const response = await app.handle(
      new Request(`http://localhost/v1/batch/${draftRow.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          awsAccountId: draftRow.awsAccountId,
          channel: "email",
          subject: "Hello",
          from: "hello@example.com",
          totalRecipients: 7,
          scheduledFor: scheduledFor.toISOString(),
        }),
      })
    );

    expect(response.status).toBe(201);

    const body = await response.json();
    expect(body.status).toBe("scheduled");

    expect(mockCreateBroadcastSchedule).toHaveBeenCalledTimes(1);
    expect(mockCreateBroadcastSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        batchId: draftRow.id,
        organizationId: "org-123",
        awsAccountId: draftRow.awsAccountId,
        channel: "email",
      })
    );
    expect(mockEnqueueJob).not.toHaveBeenCalled();
  });

  it("refuses to promote when the status-gated update returns null (concurrent promote)", async () => {
    mockFindBroadcast.mockResolvedValueOnce(draftRow);
    mockFindAwsAccountForOrg.mockResolvedValueOnce({
      id: draftRow.awsAccountId,
    });
    // promoteBroadcast returns null when the draft-gated update matches 0 rows
    mockPromoteBroadcast.mockResolvedValueOnce(null);

    const app = createApp();

    const response = await app.handle(
      new Request(`http://localhost/v1/batch/${draftRow.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          awsAccountId: draftRow.awsAccountId,
          channel: "email",
          subject: "Hello",
          from: "hello@example.com",
          totalRecipients: 5,
        }),
      })
    );

    expect(response.status).toBe(409);

    // Verify the DB write was attempted exactly once (proves we got past the guard,
    // not that we short-circuited before calling promoteBroadcast)
    expect(mockPromoteBroadcast).toHaveBeenCalledTimes(1);
    expect(mockPromoteBroadcast).toHaveBeenCalledWith(
      draftRow.id,
      "org-123",
      expect.objectContaining({ status: "queued" })
    );

    // No side effects after the null return
    expect(mockEnqueueJob).not.toHaveBeenCalled();
    expect(mockCreateBroadcastSchedule).not.toHaveBeenCalled();
  });

  it("rejects a scheduledFor in the past instead of silently sending now", async () => {
    // Clock skew or a retried request used to fall through to
    // `isScheduled = false`, converting "schedule for later" into an
    // irreversible immediate send the caller never asked for.
    const scheduledFor = new Date(Date.now() - 2 * 60 * 60 * 1000);

    mockFindBroadcast.mockResolvedValueOnce(draftRow);
    mockFindAwsAccountForOrg.mockResolvedValueOnce({
      id: draftRow.awsAccountId,
    });

    const app = createApp();

    const response = await app.handle(
      new Request(`http://localhost/v1/batch/${draftRow.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          awsAccountId: draftRow.awsAccountId,
          channel: "email",
          subject: "Hello",
          from: "hello@example.com",
          totalRecipients: 7,
          scheduledFor: scheduledFor.toISOString(),
        }),
      })
    );

    expect(response.status).toBe(400);
    // This bare test app has no global onError, so the thrown message arrives
    // as text. In the real app handleApiError passes 4xx messages through
    // verbatim as { error }, which is what the dashboard reads.
    expect(await response.text()).toMatch(/in the past/i);

    expect(mockPromoteBroadcast).not.toHaveBeenCalled();
    expect(mockEnqueueJob).not.toHaveBeenCalled();
    expect(mockCreateBroadcastSchedule).not.toHaveBeenCalled();
  });

  it("treats a scheduledFor inside the skew tolerance as send-now", async () => {
    const scheduledFor = new Date(Date.now() - 5000);

    mockFindBroadcast.mockResolvedValueOnce(draftRow);
    mockFindAwsAccountForOrg.mockResolvedValueOnce({
      id: draftRow.awsAccountId,
    });
    mockPromoteBroadcast.mockResolvedValueOnce({
      ...draftRow,
      status: "queued",
      totalRecipients: 7,
    });

    const app = createApp();

    const response = await app.handle(
      new Request(`http://localhost/v1/batch/${draftRow.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          awsAccountId: draftRow.awsAccountId,
          channel: "email",
          subject: "Hello",
          from: "hello@example.com",
          totalRecipients: 7,
          scheduledFor: scheduledFor.toISOString(),
        }),
      })
    );

    expect(response.status).toBe(201);
    expect(mockEnqueueJob).toHaveBeenCalledTimes(1);
    expect(mockCreateBroadcastSchedule).not.toHaveBeenCalled();
  });

  it("warns and records when the environment has no scheduler configured", async () => {
    const scheduledFor = new Date(Date.now() + 24 * 60 * 60 * 1000);

    mockFindBroadcast.mockResolvedValueOnce(draftRow);
    mockFindAwsAccountForOrg.mockResolvedValueOnce({
      id: draftRow.awsAccountId,
    });
    mockPromoteBroadcast.mockResolvedValueOnce({
      ...draftRow,
      status: "scheduled",
      scheduledFor,
      totalRecipients: 7,
    });
    mockCreateBroadcastSchedule.mockResolvedValueOnce({
      scheduleName: "wraps-batch-x",
      created: false,
    });

    const app = createApp();

    const response = await app.handle(
      new Request(`http://localhost/v1/batch/${draftRow.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          awsAccountId: draftRow.awsAccountId,
          channel: "email",
          subject: "Hello",
          from: "hello@example.com",
          totalRecipients: 7,
          scheduledFor: scheduledFor.toISOString(),
        }),
      })
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as { warning?: string };
    expect(body.warning).toMatch(/will not send automatically/i);
    // Persisted too, so the detail page says it days later, not just the toast.
    expect(mockMarkBroadcastNotScheduled).toHaveBeenCalledWith(
      draftRow.id,
      "org-123",
      expect.stringMatching(/will not send automatically/i)
    );
  });
});
