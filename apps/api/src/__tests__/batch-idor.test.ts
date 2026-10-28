/**
 * Batch IDOR Security Tests
 *
 * Tests that batch send validates awsAccountId belongs to the
 * authenticated organization, preventing cross-org AWS account usage.
 */

import { Elysia } from "elysia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockFindAwsAccountForOrg,
  mockCountBroadcastRecipients,
  mockCreateBroadcast,
  mockEnqueueJob,
  mockFindSegment,
  mockFetchTopicsForSubscription,
  mockFindTemplateForValidation,
} = vi.hoisted(() => ({
  mockFindAwsAccountForOrg: vi.fn(),
  mockCountBroadcastRecipients: vi.fn(),
  mockCreateBroadcast: vi.fn(),
  mockEnqueueJob: vi.fn(async (_args: unknown) => {}),
  mockFindSegment: vi.fn(),
  mockFetchTopicsForSubscription: vi.fn(),
  mockFindTemplateForValidation: vi.fn(),
}));

vi.mock("@wraps/db", () => ({
  findAwsAccountForOrg: mockFindAwsAccountForOrg,
  countBroadcastRecipients: mockCountBroadcastRecipients,
  createBroadcast: mockCreateBroadcast,
  findBroadcast: vi.fn(),
  promoteBroadcast: vi.fn(),
  cancelBroadcast: vi.fn(),
  findSegment: mockFindSegment,
  fetchTopicsForSubscription: mockFetchTopicsForSubscription,
  findTemplateForValidation: mockFindTemplateForValidation,
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
  createBroadcastSchedule: vi.fn(async () => ({
    scheduleName: "mock-schedule-name",
    created: true,
  })),
  deleteBroadcastSchedule: vi.fn(async () => {}),
}));

// Import after mocks are set up
const { batchRoutes } = await import("../routes/batch");

function createApp() {
  return new Elysia().use(batchRoutes);
}

describe("Batch IDOR Prevention", () => {
  beforeEach(() => {
    mockFindAwsAccountForOrg.mockReset();
    mockCountBroadcastRecipients.mockReset();
    mockCreateBroadcast.mockReset();
    mockEnqueueJob.mockReset();
    mockFindSegment.mockReset();
    mockFetchTopicsForSubscription.mockReset();
    mockFindTemplateForValidation.mockReset();
    mockFindAwsAccountForOrg.mockResolvedValue({ id: "valid-aws-account" });
    // Defaults mirror what production does with a foreign segment: the count
    // comes back 0 and the broadcast row is inserted anyway.
    mockCountBroadcastRecipients.mockResolvedValue(0);
    mockCreateBroadcast.mockResolvedValue({
      id: "batch-default",
      status: "queued",
      channel: "email",
      totalRecipients: 0,
      createdAt: new Date("2024-01-01"),
    });
  });

  // Behaves like the real org-scoped lookups: a row is visible only to the
  // organization that owns it. Ids ending in "-org-b" belong to org 2; the
  // caller is org-123, so those lookups must come back empty.
  const ownedRow = (id: string, orgId: string) =>
    id.endsWith(`-${orgId}`) ? { id, organizationId: orgId } : null;

  it("allows batch send when awsAccountId belongs to the authenticated org", async () => {
    mockFindAwsAccountForOrg.mockResolvedValueOnce({ id: "valid-aws-account" });
    mockCountBroadcastRecipients.mockResolvedValueOnce(50);
    mockCreateBroadcast.mockResolvedValueOnce({
      id: "batch-new",
      status: "queued",
      channel: "email",
      totalRecipients: 50,
      createdAt: new Date("2024-01-01"),
    });

    const app = createApp();

    const response = await app.handle(
      new Request("http://localhost/v1/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          awsAccountId: "valid-aws-account",
          channel: "email",
          subject: "Legit Campaign",
          from: "hello@mycompany.com",
        }),
      })
    );

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.id).toBe("batch-new");
    expect(body.status).toBe("queued");

    // Verify the job was enqueued with the correct ids — not just that it was called
    expect(mockEnqueueJob).toHaveBeenCalledTimes(1);
    expect(mockEnqueueJob).toHaveBeenCalledWith(
      expect.objectContaining({
        batchId: "batch-new",
        organizationId: "org-123",
        awsAccountId: "valid-aws-account",
        channel: "email",
      })
    );
  });

  it("rejects batch send when awsAccountId does not belong to the authenticated org", async () => {
    mockFindAwsAccountForOrg.mockResolvedValueOnce(null);

    const app = createApp();

    const response = await app.handle(
      new Request("http://localhost/v1/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          awsAccountId: "attacker-aws-account-id",
          channel: "email",
          subject: "Phishing Campaign",
          from: "legit@victim-company.com",
        }),
      })
    );

    expect(response.status).toBe(403);

    const body = await response.json();
    expect(body.error).toBe("AWS account does not belong to this organization");

    // Prove the DB was never written to and nothing was queued
    expect(mockCreateBroadcast).not.toHaveBeenCalled();
    expect(mockEnqueueJob).not.toHaveBeenCalled();
  });

  describe("ids referenced by the body must belong to the caller's org", () => {
    const post = (body: Record<string, unknown>) =>
      createApp().handle(
        new Request("http://localhost/v1/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            awsAccountId: "valid-aws-account",
            channel: "email",
            ...body,
          }),
        })
      );

    it("rejects a segmentId owned by another org with 404 before anything is written", async () => {
      mockFindSegment.mockImplementation(async (id: string, orgId: string) =>
        ownedRow(id, orgId)
      );

      const response = await post({
        audienceType: "segment",
        segmentId: "seg-org-b",
        subject: "Cross-org segment",
        from: "hello@mycompany.com",
      });

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "Segment not found" });
      expect(mockFindSegment).toHaveBeenCalledWith("seg-org-b", "org-123");
      expect(mockCountBroadcastRecipients).not.toHaveBeenCalled();
      expect(mockCreateBroadcast).not.toHaveBeenCalled();
      expect(mockEnqueueJob).not.toHaveBeenCalled();
    });

    it("still accepts a segmentId owned by the caller's org", async () => {
      mockFindSegment.mockImplementation(async (id: string, orgId: string) =>
        ownedRow(id, orgId)
      );
      mockCountBroadcastRecipients.mockResolvedValueOnce(12);
      mockCreateBroadcast.mockResolvedValueOnce({
        id: "batch-seg",
        status: "queued",
        channel: "email",
        totalRecipients: 12,
        createdAt: new Date("2024-01-01"),
      });

      const response = await post({
        audienceType: "segment",
        segmentId: "seg-org-123",
        subject: "Own segment",
        from: "hello@mycompany.com",
      });

      expect(response.status).toBe(200);
      expect(mockCreateBroadcast).toHaveBeenCalledWith(
        expect.objectContaining({ segmentId: "seg-org-123" })
      );
    });

    it("rejects a topicId owned by another org with 404 before anything is written", async () => {
      mockFetchTopicsForSubscription.mockResolvedValueOnce([]);

      const response = await post({
        audienceType: "topic",
        topicId: "topic-org-b",
        subject: "Cross-org topic",
        from: "hello@mycompany.com",
      });

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "Topic not found" });
      expect(mockFetchTopicsForSubscription).toHaveBeenCalledWith(
        ["topic-org-b"],
        "org-123"
      );
      expect(mockCreateBroadcast).not.toHaveBeenCalled();
      expect(mockEnqueueJob).not.toHaveBeenCalled();
    });

    it("rejects a templateId owned by another org with 404 before anything is written", async () => {
      mockFindTemplateForValidation.mockResolvedValueOnce(null);

      const response = await post({
        templateId: "tpl-org-b",
        subject: "Cross-org template",
        from: "hello@mycompany.com",
      });

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "Template not found" });
      expect(mockFindTemplateForValidation).toHaveBeenCalledWith(
        "tpl-org-b",
        "org-123"
      );
      expect(mockCreateBroadcast).not.toHaveBeenCalled();
      expect(mockEnqueueJob).not.toHaveBeenCalled();
    });
  });
});
