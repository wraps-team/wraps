import { Elysia } from "elysia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContext } from "../middleware/auth";
import { createErrorHarness } from "./error-handler-harness";

const { mockListEmailLogs, mockGetEmailLogByMessageId } = vi.hoisted(() => ({
  mockListEmailLogs: vi.fn(),
  mockGetEmailLogByMessageId: vi.fn(),
}));

vi.mock("@wraps/db", async (importOriginal) => ({
  // Real decodeCursor: the route validates cursors with it before the mocked
  // repository call.
  ...(await importOriginal<typeof import("@wraps/db")>()),
  listEmailLogs: mockListEmailLogs,
  getEmailLogByMessageId: mockGetEmailLogByMessageId,
}));

const mockAuthContext: AuthContext = {
  apiKeyId: "key-test",
  organizationId: "org-email-logs-test",
  userId: "user-test",
  planId: "starter",
};

vi.mock("../middleware/auth", () => ({
  getAuth: (ctx: { auth: unknown }) => ctx.auth,
  getAuthOptional: (ctx: { auth: unknown }) => ctx.auth ?? null,
  createAuthenticatedRoutes: vi.fn((prefix: string) =>
    new Elysia({ prefix })
      .derive(({ headers }) => {
        const hasAuth = !!headers.authorization;
        return hasAuth
          ? {
              auth: mockAuthContext as AuthContext | null,
              authError: null as string | null,
            }
          : {
              auth: null as AuthContext | null,
              authError: "Unauthorized" as string | null,
            };
      })
      .onBeforeHandle(({ auth, authError, set }) => {
        if (authError || !auth) {
          set.status = 401;
          return { error: authError || "Unauthorized" };
        }
      })
  ),
}));

const { emailLogsRoutes } = await import("../routes/email-logs");

function createApp() {
  return new Elysia().use(emailLogsRoutes);
}

function authedGet(path: string) {
  return new Request(`http://localhost${path}`, {
    headers: { Authorization: "Bearer wraps_test_token" },
  });
}

describe("Email Logs Route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /v1/email/logs", () => {
    it("returns {logs, total, nextCursor} with org scoping", async () => {
      const mockLog = {
        id: "log-1",
        messageId: "ses-001",
        status: "delivered",
        recipient: "user@example.com",
        subject: "Hello",
        from: "noreply@app.com",
        sourceType: "transactional",
        sentAt: new Date("2026-05-20T10:00:00Z"),
        deliveredAt: new Date("2026-05-20T10:01:00Z"),
        bouncedAt: null,
        bouncedSubType: null,
        createdAt: new Date("2026-05-20T10:00:00Z"),
      };
      mockListEmailLogs.mockResolvedValue({
        logs: [mockLog],
        total: 1,
        nextCursor: null,
      });

      const app = createApp();
      const response = await app.handle(authedGet("/v1/email/logs"));

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.logs).toHaveLength(1);
      expect(body.logs[0]).toMatchObject({
        messageId: "ses-001",
        status: "delivered",
        recipient: "user@example.com",
      });
      expect(body.total).toBe(1);
      expect(body.nextCursor).toBeNull();
      expect(mockListEmailLogs).toHaveBeenCalledWith(
        mockAuthContext.organizationId,
        expect.objectContaining({ status: undefined, cursor: undefined })
      );
    });

    it("passes status filter to repository", async () => {
      mockListEmailLogs.mockResolvedValue({
        logs: [],
        total: 0,
        nextCursor: null,
      });

      const app = createApp();
      const response = await app.handle(
        authedGet("/v1/email/logs?status=bounced")
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toHaveProperty("logs");
      expect(mockListEmailLogs).toHaveBeenCalledWith(
        mockAuthContext.organizationId,
        expect.objectContaining({ status: "bounced" })
      );
    });

    it("passes cursor to repository", async () => {
      mockListEmailLogs.mockResolvedValue({
        logs: [],
        total: 0,
        nextCursor: null,
      });
      const cursor = Buffer.from(
        "2026-05-20T10:00:00.000Z|log-1",
        "utf8"
      ).toString("base64url");

      const app = createApp();
      const response = await app.handle(
        authedGet(`/v1/email/logs?cursor=${encodeURIComponent(cursor)}`)
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toHaveProperty("logs");
      expect(mockListEmailLogs).toHaveBeenCalledWith(
        mockAuthContext.organizationId,
        expect.objectContaining({ cursor })
      );
    });

    it("rejects a malformed cursor with 400 instead of listing page one", async () => {
      // Mount the real onError handler so the body is the API error shape.
      const { app: harnessApp } = createErrorHarness();
      const app = harnessApp.use(emailLogsRoutes);
      const response = await app.handle(
        authedGet("/v1/email/logs?cursor=2026-05-20T10%3A00%3A00.000Z")
      );

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.code).toBe("BAD_REQUEST");
      expect(body.error).toMatch(/cursor/i);
      expect(mockListEmailLogs).not.toHaveBeenCalled();
    });

    it("passes limit to repository", async () => {
      mockListEmailLogs.mockResolvedValue({
        logs: [],
        total: 0,
        nextCursor: null,
      });

      const app = createApp();
      const response = await app.handle(authedGet("/v1/email/logs?limit=5"));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toHaveProperty("logs");
      expect(mockListEmailLogs).toHaveBeenCalledWith(
        mockAuthContext.organizationId,
        expect.objectContaining({ limit: 5 })
      );
    });

    it("returns 422 for an unrecognised status value", async () => {
      const app = createApp();
      const response = await app.handle(
        authedGet("/v1/email/logs?status=invalid_value")
      );

      expect(response.status).toBe(422);
    });

    it("returns 401 when no auth header is provided", async () => {
      const app = createApp();
      const response = await app.handle(
        new Request("http://localhost/v1/email/logs")
      );

      expect(response.status).toBe(401);
    });
  });

  describe("GET /v1/email/logs/:messageId", () => {
    it("returns full log detail for a known messageId", async () => {
      const mockLog = {
        id: "log-2",
        messageId: "ses-detail-001",
        status: "bounced",
        recipient: "bounce@example.com",
        subject: "Test",
        from: "noreply@app.com",
        sourceType: "batch",
        channel: "email",
        sentAt: new Date("2026-05-21T08:00:00Z"),
        deliveredAt: null,
        bouncedAt: new Date("2026-05-21T08:01:00Z"),
        bounceType: "Permanent",
        bounceSubType: "General",
        organizationId: "org-email-logs-test",
        awsAccountId: "aws-acc-1",
        createdAt: new Date("2026-05-21T08:00:00Z"),
      };
      mockGetEmailLogByMessageId.mockResolvedValue(mockLog);

      const app = createApp();
      const response = await app.handle(
        authedGet("/v1/email/logs/ses-detail-001")
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toMatchObject({
        messageId: "ses-detail-001",
        status: "bounced",
        recipient: "bounce@example.com",
        bounceType: "Permanent",
        bounceSubType: "General",
        organizationId: "org-email-logs-test",
      });
      expect(mockGetEmailLogByMessageId).toHaveBeenCalledWith(
        "ses-detail-001",
        mockAuthContext.organizationId
      );
    });

    it("returns 404 for an unknown messageId", async () => {
      mockGetEmailLogByMessageId.mockResolvedValue(null);

      const app = createApp();
      const response = await app.handle(
        authedGet("/v1/email/logs/ses-unknown-999")
      );

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.error).toBe("Log entry not found");
    });
  });
});
