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
} = vi.hoisted(() => ({
  mockFindAwsAccountForOrg: vi.fn(),
  mockCountBroadcastRecipients: vi.fn(),
  mockCreateBroadcast: vi.fn(),
  mockEnqueueJob: vi.fn(async (_args: unknown) => {}),
}));

vi.mock("@wraps/db", () => ({
  findAwsAccountForOrg: mockFindAwsAccountForOrg,
  countBroadcastRecipients: mockCountBroadcastRecipients,
  createBroadcast: mockCreateBroadcast,
  findBroadcast: vi.fn(),
  promoteBroadcast: vi.fn(),
  cancelBroadcast: vi.fn(),
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
  });

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
});
