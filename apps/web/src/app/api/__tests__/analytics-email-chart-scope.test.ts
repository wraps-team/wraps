import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  headers: () => new Headers(),
}));

vi.mock("@wraps/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => ({
        user: { id: "user-1", email: "test@example.com", name: "Test" },
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

vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => () => fn(),
}));

const mockGetSESReputationMetrics = vi.fn();
// Reputation is the only reason this route talks to CloudWatch. The count
// metrics it used to read were account-wide and no longer exist in the module.
vi.mock("@/lib/aws/cloudwatch", () => ({
  getSESReputationMetrics: (...args: unknown[]) =>
    mockGetSESReputationMetrics(...args),
  getCloudWatchErrorKind: () => "access_denied",
  SES_METRICS: {
    REPUTATION_BOUNCE_RATE: "Reputation.BounceRate",
    REPUTATION_COMPLAINT_RATE: "Reputation.ComplaintRate",
  },
}));

const mockGetEmailMetricsFromPostgres = vi.fn();
vi.mock("@/lib/analytics-fallback", () => ({
  getEmailMetricsFromPostgres: (...args: unknown[]) =>
    mockGetEmailMetricsFromPostgres(...args),
}));

const mockFindMany = vi.fn();
vi.mock("@wraps/db", () => ({
  db: {
    query: {
      awsAccount: {
        findMany: (...args: unknown[]) => mockFindMany(...args),
      },
    },
  },
}));

vi.mock("@wraps/db/schema/app", () => ({
  awsAccount: { organizationId: "organizationId" },
}));

vi.mock("drizzle-orm", () => ({ eq: () => ({}) }));

vi.mock("@/lib/logger", () => ({
  createRequestLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }),
  serializeError: (e: unknown) => e,
}));

vi.mock("@/lib/analytics-utils", () => ({
  gapFillDates: (
    range: string[],
    map: Map<string, Record<string, number>>,
    defaults: Record<string, number>
  ) =>
    range.map((date) => ({
      date,
      timestamp: new Date(date).getTime(),
      ...(map.get(date) || defaults),
    })),
  generateDateRange: (start: Date, end: Date) => {
    const dates: string[] = [];
    const d = new Date(start);
    while (d <= end) {
      dates.push(d.toISOString().slice(0, 10));
      d.setDate(d.getDate() + 1);
    }
    return dates;
  },
  validateTimezone: (tz: string | null | undefined) => tz || "UTC",
}));

const RECENT = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
const RECENT_DAY = RECENT.toISOString().slice(0, 10);

function postgresDay(overrides: Partial<Record<string, number>> = {}) {
  return new Map([
    [
      RECENT_DAY,
      {
        date: RECENT_DAY,
        sent: 0,
        delivered: 0,
        bounced: 0,
        complaints: 0,
        opens: 0,
        clicks: 0,
        renderingFailures: 0,
        ...overrides,
      },
    ],
  ]);
}

async function callRoute(query = "?days=7&tz=UTC") {
  const { GET } = await import("../[orgSlug]/analytics/email-chart/route");
  const request = new Request(
    `http://localhost/api/test-org/analytics/email-chart${query}`
  );
  const context = { params: Promise.resolve({ orgSlug: "test-org" }) };
  const response = await GET(request, context);
  return response.json();
}

describe("Email chart volume source (F4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindMany.mockResolvedValue([{ id: "acc-1", organizationId: "org-1" }]);
    mockGetSESReputationMetrics.mockResolvedValue({
      bounceRate: null,
      complaintRate: null,
    });
    mockGetEmailMetricsFromPostgres.mockResolvedValue(new Map());
  });

  it("never reads CloudWatch volume metrics", async () => {
    mockGetEmailMetricsFromPostgres.mockResolvedValue(postgresDay({ sent: 5 }));

    await callRoute();

    // Reputation is the only thing this route wants from CloudWatch.
    expect(mockGetSESReputationMetrics).toHaveBeenCalled();

    // Account-wide CloudWatch counts included SES traffic sent outside Wraps,
    // which can never appear in the table. The reader for them is gone from the
    // module entirely, so no route can reintroduce the defect by importing it.
    // Asserted against the real source, not the mock above.
    const cloudWatchSource = await import("node:fs").then((fs) =>
      fs.readFileSync(
        new URL("../../../lib/aws/cloudwatch.ts", import.meta.url),
        "utf8"
      )
    );
    expect(cloudWatchSource).not.toContain("getCloudWatchMetricsBatch");
    expect(cloudWatchSource).not.toContain("getSESMetricsSummary");
  });

  it("takes volume from Postgres, matching what the table can show", async () => {
    mockGetEmailMetricsFromPostgres.mockResolvedValue(
      postgresDay({ sent: 12, delivered: 11, opens: 4, clicks: 2 })
    );

    const data = await callRoute();

    expect(data.overview.totalSent).toBe(12);
    expect(data.overview.totalDelivered).toBe(11);
    const point = data.volume.find(
      (v: { date: string }) => v.date === RECENT_DAY
    );
    expect(point.sent).toBe(12);
    expect(point.opens).toBe(4);
    expect(point.clicks).toBe(2);
  });

  it("queries Postgres over the same org and window the table uses", async () => {
    await callRoute("?days=7&tz=UTC");

    const [orgId, startTime, endTime, timezone] =
      mockGetEmailMetricsFromPostgres.mock.calls[0] as [
        string,
        Date,
        Date,
        string,
      ];
    expect(orgId).toBe("org-1");
    expect(timezone).toBe("UTC");
    const spanDays = Math.round(
      (endTime.getTime() - startTime.getTime()) / (24 * 60 * 60 * 1000)
    );
    expect(spanDays).toBe(7);
  });

  it("does not double-subtract rendering failures from the send total", async () => {
    // `message_send.sent` counts status != 'failed', so failures are already
    // excluded. Subtracting them again (correct for CloudWatch's `Send`, wrong
    // here) would shrink the denominator and overstate the delivery rate.
    mockGetEmailMetricsFromPostgres.mockResolvedValue(
      postgresDay({ sent: 100, delivered: 90, renderingFailures: 10 })
    );

    const data = await callRoute();

    expect(data.overview.totalSent).toBe(100);
    expect(data.overview.deliveryRate).toBeCloseTo(90, 1);
    // The old arithmetic would have produced 90/(100-10) = 100%.
    expect(data.overview.deliveryRate).not.toBeCloseTo(100, 1);
  });

  it("reports zeroes rather than failing when the org has no AWS account", async () => {
    mockFindMany.mockResolvedValue([]);

    const data = await callRoute();

    expect(data.overview.totalSent).toBe(0);
    expect(data.meta).toMatchObject({
      reputationScope: "none",
      awsAccountCount: 0,
      awsAccountsUnavailable: 0,
    });
  });

  it("still charts Wraps sends when the org has no AWS account connected", async () => {
    mockFindMany.mockResolvedValue([]);
    mockGetEmailMetricsFromPostgres.mockResolvedValue(postgresDay({ sent: 3 }));

    const data = await callRoute();

    // Volume no longer depends on CloudWatch, so it must not be gated on an
    // AWS account existing.
    expect(data.overview.totalSent).toBe(3);
  });
});

describe("Email chart reputation scope (F4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindMany.mockResolvedValue([{ id: "acc-1", organizationId: "org-1" }]);
    mockGetSESReputationMetrics.mockResolvedValue({
      bounceRate: null,
      complaintRate: null,
    });
    mockGetEmailMetricsFromPostgres.mockResolvedValue(new Map());
  });

  it("prefers SES account reputation over window arithmetic", async () => {
    mockGetEmailMetricsFromPostgres.mockResolvedValue(
      postgresDay({ sent: 24, bounced: 1, complaints: 1 })
    );
    mockGetSESReputationMetrics.mockResolvedValue({
      bounceRate: 0.0002,
      complaintRate: 0.0003,
    });

    const data = await callRoute();

    expect(data.meta.reputationScope).toBe("ses-account");
    expect(data.overview.bounceRate).toBeCloseTo(0.02, 2);
    // Window arithmetic would have said 1/24 = 4.17%.
    expect(data.overview.bounceRate).not.toBeCloseTo(4.17, 1);
  });

  it("takes the worst rate across a multi-account org", async () => {
    mockFindMany.mockResolvedValue([
      { id: "acc-1", organizationId: "org-1" },
      { id: "acc-2", organizationId: "org-1" },
    ]);
    mockGetSESReputationMetrics
      .mockResolvedValueOnce({ bounceRate: 0.001, complaintRate: 0.0001 })
      .mockResolvedValueOnce({ bounceRate: 0.05, complaintRate: 0.0002 });

    const data = await callRoute();

    expect(data.overview.bounceRate).toBeCloseTo(5, 2);
    expect(data.meta.awsAccountCount).toBe(2);
  });

  it("falls back to window arithmetic and says so when SES published nothing", async () => {
    mockGetEmailMetricsFromPostgres.mockResolvedValue(
      postgresDay({ sent: 100, bounced: 2 })
    );

    const data = await callRoute();

    // Same tile, different population — it has to be able to tell the user which.
    expect(data.meta.reputationScope).toBe("window");
    expect(data.overview.bounceRate).toBeCloseTo(2, 2);
  });

  it("counts AWS accounts whose reputation read failed", async () => {
    mockFindMany.mockResolvedValue([
      { id: "acc-1", organizationId: "org-1" },
      { id: "acc-2", organizationId: "org-1" },
    ]);
    mockGetSESReputationMetrics
      .mockResolvedValueOnce({ bounceRate: 0.001, complaintRate: 0.0001 })
      .mockRejectedValueOnce(new Error("AccessDenied"));

    const data = await callRoute();

    expect(data.meta.awsAccountCount).toBe(2);
    expect(data.meta.awsAccountsUnavailable).toBe(1);
    // A failed account must not silently become a healthy 0%.
    expect(data.overview.bounceRate).toBeCloseTo(0.1, 2);
  });

  it("stamps when the payload was computed so the card can show its age", async () => {
    const before = Date.now();
    const data = await callRoute();

    expect(data.meta.generatedAt).toBeGreaterThanOrEqual(before);
    expect(data.meta.generatedAt).toBeLessThanOrEqual(Date.now());
  });

  it("defaults to a 7-day window, matching the table below the chart", async () => {
    await callRoute("?tz=UTC");

    const [, startTime, endTime] = mockGetEmailMetricsFromPostgres.mock
      .calls[0] as [string, Date, Date, string];
    const spanDays = Math.round(
      (endTime.getTime() - startTime.getTime()) / (24 * 60 * 60 * 1000)
    );
    expect(spanDays).toBe(7);
  });
});
