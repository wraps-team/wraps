import { beforeEach, describe, expect, it, vi } from "vitest";
import { reputationAgeDays, reputationScopeLabel } from "@/lib/analytics-scope";

vi.mock("next/headers", () => ({
  headers: () => new Headers(),
}));

vi.mock("@wraps/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => ({
        user: { id: "user-1", email: "test@example.com", name: "Test" },
        session: {
          id: "session-1",
          createdAt: new Date(),
          updatedAt: new Date(),
          userId: "user-1",
          expiresAt: new Date(Date.now() + 86_400_000),
          token: "test-token",
        },
      })),
    },
  },
}));

vi.mock("@/lib/organization", () => ({
  getOrganizationWithMembership: vi.fn(async () => ({
    id: "org-1",
    name: "Test Org",
    slug: "test-org",
  })),
}));

const mockGetSESReputationMetrics = vi.fn();
vi.mock("@/lib/aws/cloudwatch", () => ({
  getSESReputationMetrics: (...args: unknown[]) =>
    mockGetSESReputationMetrics(...args),
  getCloudWatchErrorKind: () => "unknown",
}));

const mockGetEmailMetricsFromPostgres = vi.fn();
vi.mock("@/lib/analytics-fallback", () => ({
  getEmailMetricsFromPostgres: (...args: unknown[]) =>
    mockGetEmailMetricsFromPostgres(...args),
}));

vi.mock("@wraps/db", () => ({
  db: {
    query: {
      awsAccount: {
        findMany: vi.fn(async () => [{ id: "acc-1", organizationId: "org-1" }]),
      },
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  createRequestLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }),
  serializeError: (e: unknown) => e,
}));

/**
 * One day of `message_send` aggregates.
 *
 * `sent` counts rows whose status is NOT 'failed' and `renderingFailures`
 * counts rows whose status IS 'failed' - disjoint sets. So `sent` is already
 * the effective denominator, which is the whole difference from the CloudWatch
 * shape this route used to read, where `Send` INCLUDED rendering failures.
 */
function makeDay(values: {
  sent: number;
  delivered: number;
  bounced: number;
  complaints: number;
  renderingFailures: number;
  opens?: number;
  clicks?: number;
}) {
  return new Map([
    [
      "2026-04-10",
      {
        date: "2026-04-10",
        opens: 0,
        clicks: 0,
        ...values,
      },
    ],
  ]);
}

async function callOverview() {
  const { GET } = await import("../[orgSlug]/analytics/overview/route");
  const request = new Request(
    "http://localhost/api/test-org/analytics/overview"
  );
  const context = { params: Promise.resolve({ orgSlug: "test-org" }) };
  const response = await GET(request, context);
  return { response, data: await response.json() };
}

describe("Analytics Overview API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no reputation data (new account fallback)
    mockGetSESReputationMetrics.mockResolvedValue({
      bounceRate: null,
      complaintRate: null,
      asOf: null,
    });
  });

  it("reads totals from Postgres, never from account-wide CloudWatch", async () => {
    mockGetEmailMetricsFromPostgres.mockResolvedValueOnce(
      makeDay({
        sent: 111,
        delivered: 110,
        bounced: 1,
        complaints: 0,
        renderingFailures: 13,
      })
    );

    const { data } = await callOverview();

    expect(mockGetEmailMetricsFromPostgres).toHaveBeenCalledWith(
      "org-1",
      expect.any(Date),
      expect.any(Date)
    );
    expect(data.totalSent).toBe(111);
  });

  it("does not subtract rendering failures a second time", async () => {
    // 111 sends (failures already excluded), 13 failures, 110 delivered.
    // Correct: 110/111 = 99.10%. Subtracting again gives 110/98 = 112.24%,
    // which is the CloudWatch-era arithmetic and is now impossible.
    mockGetEmailMetricsFromPostgres.mockResolvedValueOnce(
      makeDay({
        sent: 111,
        delivered: 110,
        bounced: 1,
        complaints: 0,
        renderingFailures: 13,
      })
    );

    const { data } = await callOverview();

    expect(data.deliveryRate).toBeCloseTo(99.1, 1);
    expect(data.deliveryRate).toBeLessThanOrEqual(100);
  });

  it("returns deliveryRate 0 when nothing was sent (no division by zero)", async () => {
    mockGetEmailMetricsFromPostgres.mockResolvedValueOnce(
      makeDay({
        sent: 0,
        delivered: 0,
        bounced: 0,
        complaints: 0,
        renderingFailures: 50,
      })
    );

    const { data } = await callOverview();

    expect(data.deliveryRate).toBe(0);
    expect(data.bounceRate).toBe(0);
    expect(data.complaintRate).toBe(0);
  });

  it("uses SES reputation metrics for bounce/complaint rates when available", async () => {
    // Low recent volume inflates window rates (3/13 = 23%), while SES
    // reputation covers the account's full history (0.02%).
    mockGetEmailMetricsFromPostgres.mockResolvedValueOnce(
      makeDay({
        sent: 13,
        delivered: 10,
        bounced: 3,
        complaints: 0,
        renderingFailures: 0,
      })
    );
    mockGetSESReputationMetrics.mockResolvedValueOnce({
      bounceRate: 0.0002,
      complaintRate: 0.001,
      asOf: new Date(),
    });

    const { data } = await callOverview();

    expect(data.bounceRate).toBeCloseTo(0.02, 2);
    expect(data.complaintRate).toBeCloseTo(0.1, 1);
    expect(data.meta.reputationScope).toBe("ses-account");
  });

  it("falls back to window rates when reputation metrics unavailable", async () => {
    mockGetEmailMetricsFromPostgres.mockResolvedValueOnce(
      makeDay({
        sent: 100,
        delivered: 95,
        bounced: 3,
        complaints: 1,
        renderingFailures: 0,
      })
    );

    const { data } = await callOverview();

    expect(data.bounceRate).toBeCloseTo(3, 0);
    expect(data.complaintRate).toBeCloseTo(1, 0);
    expect(data.meta.reputationScope).toBe("window");
  });

  it("reports a reputation read failure instead of rendering a healthy 0%", async () => {
    mockGetEmailMetricsFromPostgres.mockResolvedValueOnce(
      makeDay({
        sent: 100,
        delivered: 95,
        bounced: 3,
        complaints: 1,
        renderingFailures: 0,
      })
    );
    mockGetSESReputationMetrics.mockRejectedValueOnce(
      new Error(
        "AccessDenied: not authorized to perform cloudwatch:GetMetricData"
      )
    );

    const { data } = await callOverview();

    expect(data.meta.awsAccountsUnavailable).toBe(1);
    expect(data.meta.awsAccountCount).toBe(1);
    // Volume is unaffected by a CloudWatch failure - it comes from Postgres.
    expect(data.totalSent).toBe(100);
  });

  it("includes totalRenderingFailures in response", async () => {
    mockGetEmailMetricsFromPostgres.mockResolvedValueOnce(
      makeDay({
        sent: 111,
        delivered: 110,
        bounced: 1,
        complaints: 0,
        renderingFailures: 13,
      })
    );

    const { data } = await callOverview();

    expect(data).toHaveProperty("totalRenderingFailures");
    expect(data.totalRenderingFailures).toBe(13);
  });

  it("reports open and click rates against delivered mail", async () => {
    mockGetEmailMetricsFromPostgres.mockResolvedValueOnce(
      makeDay({
        sent: 100,
        delivered: 80,
        bounced: 3,
        complaints: 1,
        renderingFailures: 0,
        opens: 40,
        clicks: 8,
      })
    );

    const { data } = await callOverview();

    expect(data.totalOpens).toBe(40);
    expect(data.totalClicks).toBe(8);
    expect(data.openRate).toBeCloseTo(50, 1);
    expect(data.clickRate).toBeCloseTo(10, 1);
  });

  it("rejects an unauthenticated request", async () => {
    const { auth } = await import("@wraps/auth");
    vi.mocked(auth.api.getSession).mockResolvedValueOnce(null);

    const { response } = await callOverview();

    expect(response.status).toBe(401);
  });
});

describe("Overview reputation labelling matches the emails chart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSESReputationMetrics.mockResolvedValue({
      bounceRate: null,
      complaintRate: null,
      asOf: null,
    });
  });

  it("keeps a stale SES rate as the account rate here too", async () => {
    // The analytics page and the emails page read the same two sources. If one
    // route swaps to window arithmetic while the other does not, the same
    // account reads as 0.15% on one page and 10.25% on the other.
    mockGetEmailMetricsFromPostgres.mockResolvedValueOnce(
      makeDay({
        sent: 10_000,
        delivered: 8000,
        bounced: 1025,
        complaints: 112,
        renderingFailures: 0,
      })
    );
    mockGetSESReputationMetrics.mockResolvedValueOnce({
      bounceRate: 0.00147,
      complaintRate: 0.0002,
      asOf: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    });

    const { data } = await callOverview();

    expect(data.meta.reputationScope).toBe("ses-account");
    expect(data.bounceRate).toBeCloseTo(0.15, 2);
    expect(data.bounceRate).not.toBeCloseTo(10.25, 1);
    expect(reputationAgeDays(data.meta)).toBe(10);
    expect(reputationScopeLabel(data.meta).detail).toBe(
      "SES all-time rate for this AWS account, last published 10 days ago"
    );
  });

  it("carries the publish time in meta like the chart route does", async () => {
    mockGetEmailMetricsFromPostgres.mockResolvedValueOnce(
      makeDay({
        sent: 10,
        delivered: 10,
        bounced: 0,
        complaints: 0,
        renderingFailures: 0,
      })
    );
    mockGetSESReputationMetrics.mockResolvedValueOnce({
      bounceRate: 0.001,
      complaintRate: 0.0001,
      asOf: new Date(),
    });

    const { data } = await callOverview();

    expect(data.meta).toHaveProperty("reputationAsOf");
    expect(reputationAgeDays(data.meta)).toBe(0);
    expect(reputationScopeLabel(data.meta).note).toBeNull();
  });
});
