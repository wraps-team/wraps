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

const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT = new Date(Date.now() - 2 * DAY_MS);
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
      asOf: null,
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
      asOf: null,
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
      asOf: new Date(),
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
      .mockResolvedValueOnce({
        bounceRate: 0.001,
        complaintRate: 0.0001,
        asOf: new Date(Date.now() - 9 * DAY_MS),
      })
      .mockResolvedValueOnce({
        bounceRate: 0.05,
        complaintRate: 0.0002,
        asOf: new Date(),
      });

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
      .mockResolvedValueOnce({
        bounceRate: 0.001,
        complaintRate: 0.0001,
        asOf: new Date(),
      })
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

describe("Reputation staleness does not swap populations (passumo)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindMany.mockResolvedValue([{ id: "acc-1", organizationId: "org-1" }]);
    mockGetEmailMetricsFromPostgres.mockResolvedValue(new Map());
  });

  /**
   * The measured shape: SES last published 0.15% bounce, then the org stopped
   * sending. Their window-scoped rate over the same range is 10.25%. Under the
   * old 7-day lookback the tile silently traded one number for the other on the
   * eighth quiet day - same card, no user action, a ~70x jump.
   */
  function passumo(daysSinceLastPublish: number) {
    mockGetSESReputationMetrics.mockResolvedValue({
      bounceRate: 0.00147,
      complaintRate: 0.0002,
      asOf: new Date(Date.now() - daysSinceLastPublish * DAY_MS),
    });
    // 10.25% bounce / 1.12% complaint inside the window.
    mockGetEmailMetricsFromPostgres.mockResolvedValue(
      postgresDay({ sent: 10_000, bounced: 1025, complaints: 112 })
    );
  }

  it("keeps reporting the SES account rate once sending stops", async () => {
    passumo(10);

    const data = await callRoute();

    expect(data.meta.reputationScope).toBe("ses-account");
    expect(data.overview.bounceRate).toBeCloseTo(0.15, 2);
    // The window number for the very same range, which must NOT surface here.
    expect(data.overview.bounceRate).not.toBeCloseTo(10.25, 1);
    expect(data.overview.complaintRate).toBeCloseTo(0.02, 2);
  });

  it("does not move the number at all as the pause lengthens", async () => {
    passumo(1);
    const fresh = await callRoute();
    passumo(10);
    const stale = await callRoute();

    // Same population before and after the old 7-day cliff.
    expect(stale.overview.bounceRate).toBe(fresh.overview.bounceRate);
    expect(stale.meta.reputationScope).toBe(fresh.meta.reputationScope);
    const jump = stale.overview.bounceRate / fresh.overview.bounceRate;
    expect(jump).toBe(1);
  });

  it("carries the real publish time so the tile can date the number", async () => {
    passumo(10);

    const data = await callRoute();

    expect(data.meta.reputationAsOf).not.toBeNull();
    expect(reputationAgeDays(data.meta)).toBe(10);
    // Not stamped with the read time.
    expect(data.meta.reputationAsOf).toBeLessThan(data.meta.generatedAt);
  });

  it("labels the stale rate as an account rate, dated - not as the window", async () => {
    passumo(10);

    const data = await callRoute();
    const label = reputationScopeLabel(data.meta);

    expect(label.title).toBe("Account reputation");
    expect(label.detail).toBe(
      "SES all-time rate for this AWS account, last published 10 days ago"
    );
    expect(label.note).toBe(
      "SES publishes this rate only while the account is sending."
    );
  });

  it("still falls back to the window when SES never rated the account", async () => {
    // The one case the fallback is for: no rate has ever existed, so there is
    // no population to swap away from.
    mockGetSESReputationMetrics.mockResolvedValue({
      bounceRate: null,
      complaintRate: null,
      asOf: null,
    });
    mockGetEmailMetricsFromPostgres.mockResolvedValue(
      postgresDay({ sent: 10_000, bounced: 1025 })
    );

    const data = await callRoute();

    expect(data.meta.reputationScope).toBe("window");
    expect(data.meta.reputationAsOf).toBeNull();
    expect(data.overview.bounceRate).toBeCloseTo(10.25, 2);
    expect(reputationScopeLabel(data.meta).title).toBe(
      "Bounces and complaints"
    );
  });

  it("dates a multi-account rate by its oldest contributor", async () => {
    // Worst-of-N may come from the account that stopped sending first, so the
    // freshness claim has to hold for every number on the tile.
    mockFindMany.mockResolvedValue([
      { id: "acc-1", organizationId: "org-1" },
      { id: "acc-2", organizationId: "org-1" },
    ]);
    mockGetSESReputationMetrics
      .mockResolvedValueOnce({
        bounceRate: 0.02,
        complaintRate: 0.0001,
        asOf: new Date(Date.now() - 12 * DAY_MS),
      })
      .mockResolvedValueOnce({
        bounceRate: 0.001,
        complaintRate: 0.0001,
        asOf: new Date(),
      });

    const data = await callRoute();

    expect(data.overview.bounceRate).toBeCloseTo(2, 2);
    expect(reputationAgeDays(data.meta)).toBe(12);
  });

  it("ignores the publish time of an account that reported no rate", async () => {
    mockFindMany.mockResolvedValue([
      { id: "acc-1", organizationId: "org-1" },
      { id: "acc-2", organizationId: "org-1" },
    ]);
    mockGetSESReputationMetrics
      .mockResolvedValueOnce({
        bounceRate: 0.001,
        complaintRate: 0.0001,
        asOf: new Date(Date.now() - 5 * DAY_MS),
      })
      .mockResolvedValueOnce({
        bounceRate: null,
        complaintRate: null,
        asOf: new Date(Date.now() - 40 * DAY_MS),
      });

    const data = await callRoute();

    expect(reputationAgeDays(data.meta)).toBe(5);
  });
});
