import { Elysia } from "elysia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContext } from "../middleware/auth";

const { mockGetMessageMetrics } = vi.hoisted(() => ({
  mockGetMessageMetrics: vi.fn(),
}));

vi.mock("@wraps/db", async () => {
  const actual = await vi.importActual<typeof import("@wraps/db")>("@wraps/db");
  return {
    getMessageMetrics: mockGetMessageMetrics,
    MetricsQueryError: actual.MetricsQueryError,
  };
});

const mockAuthContext: AuthContext = {
  apiKeyId: "key-metrics-test",
  organizationId: "org-metrics-test",
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

vi.mock("../middleware/rate-limit", () => ({
  rateLimitMiddleware: new Elysia(),
}));

const { metricsRoutes } = await import("../routes/metrics");
const { MetricsQueryError } = await import("@wraps/db");

function createApp() {
  return new Elysia().use(metricsRoutes);
}

function authedGet(path: string) {
  return new Request(`http://localhost${path}`, {
    headers: { Authorization: "Bearer wraps_test_token" },
  });
}

const emptyResult = {
  totals: {
    sent: 0,
    delivered: 0,
    bounced: 0,
    bouncedPermanent: 0,
    bouncedTransient: 0,
    bouncedUndetermined: 0,
    complained: 0,
    suppressed: 0,
    opened: 0,
    openedRaw: 0,
    clicked: 0,
    failed: 0,
  },
  data: [],
};

describe("GET /v1/email/metrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetMessageMetrics.mockResolvedValue(emptyResult);
  });

  it("returns 401 when no auth header is provided", async () => {
    const app = createApp();
    const response = await app.handle(
      new Request("http://localhost/v1/email/metrics")
    );

    expect(response.status).toBe(401);
    expect(mockGetMessageMetrics).not.toHaveBeenCalled();
  });

  it("ignores any organization_id supplied by the caller and scopes by auth context", async () => {
    const app = createApp();
    const response = await app.handle(
      authedGet("/v1/email/metrics?organization_id=other-org&dimensions=period")
    );

    expect(response.status).toBe(200);
    expect(mockGetMessageMetrics).toHaveBeenCalledTimes(1);
    const call = mockGetMessageMetrics.mock.calls[0]?.[0];
    expect(call.organizationId).toBe(mockAuthContext.organizationId);
    expect(JSON.stringify(call)).not.toContain("other-org");
  });

  it("defaults to a 6-day window ending now, with no dimensions", async () => {
    const app = createApp();
    const before = Date.now();
    const response = await app.handle(authedGet("/v1/email/metrics"));
    const after = Date.now();

    expect(response.status).toBe(200);
    const call = mockGetMessageMetrics.mock.calls[0]?.[0];
    expect(call.dimensions).toEqual([]);

    const spanMs = call.endTime.getTime() - call.startTime.getTime();
    const sixDaysMs = 6 * 24 * 60 * 60 * 1000;
    expect(spanMs).toBeCloseTo(sixDaysMs, -2);
    expect(call.endTime.getTime()).toBeGreaterThanOrEqual(before);
    expect(call.endTime.getTime()).toBeLessThanOrEqual(after);

    const body = await response.json();
    expect(body.data).toEqual([]);
    expect(body.meta.granularity).toBe("daily");
  });

  it("forwards dimensions and granularity from the query string", async () => {
    const app = createApp();
    const response = await app.handle(
      authedGet("/v1/email/metrics?dimensions=period,domain&granularity=hourly")
    );

    expect(response.status).toBe(200);
    const call = mockGetMessageMetrics.mock.calls[0]?.[0];
    expect(call.dimensions).toEqual(["period", "domain"]);
    expect(call.granularity).toBe("hourly");
  });

  it("rejects start_date after end_date without calling the repository", async () => {
    const app = createApp();
    const response = await app.handle(
      authedGet(
        "/v1/email/metrics?start_date=2026-08-31T00:00:00.000Z&end_date=2026-08-01T00:00:00.000Z"
      )
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("2026-08-31");
    expect(body.error).toContain("2026-08-01");
    expect(mockGetMessageMetrics).not.toHaveBeenCalled();
  });

  it("maps a MetricsQueryError from the repository to a 400, not a 500", async () => {
    mockGetMessageMetrics.mockRejectedValue(
      new MetricsQueryError("invalid_timezone", 'Invalid timezone: "Nope"')
    );

    const app = createApp();
    const response = await app.handle(
      authedGet("/v1/email/metrics?timezone=Nope")
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Invalid timezone: "Nope"');
  });

  it("rejects a broadcast_id list over 100 entries without calling the repository", async () => {
    const ids = Array.from({ length: 101 }, (_, i) => `b${i}`).join(",");

    const app = createApp();
    const response = await app.handle(
      authedGet(`/v1/email/metrics?broadcast_id=${ids}`)
    );

    expect(response.status).toBe(400);
    expect(mockGetMessageMetrics).not.toHaveBeenCalled();
  });

  it("rejects an unknown dimension without calling the repository", async () => {
    const app = createApp();
    const response = await app.handle(
      authedGet("/v1/email/metrics?dimensions=tags")
    );

    expect(response.status).toBe(400);
    expect(mockGetMessageMetrics).not.toHaveBeenCalled();
  });

  it("returns the documented response shape", async () => {
    mockGetMessageMetrics.mockResolvedValue({
      totals: { ...emptyResult.totals, sent: 5 },
      data: [{ period: "2026-08-30", ...emptyResult.totals, sent: 5 }],
    });

    const app = createApp();
    const response = await app.handle(
      authedGet("/v1/email/metrics?dimensions=period")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.object).toBe("metrics");
    expect(body.totals.sent).toBe(5);
    expect(body.data).toHaveLength(1);
    expect(body.meta).toMatchObject({
      timezone: "UTC",
      granularity: "daily",
      dimensions: ["period"],
    });
    expect(body.meta.start_date).toEqual(expect.any(String));
    expect(body.meta.end_date).toEqual(expect.any(String));
  });
});
