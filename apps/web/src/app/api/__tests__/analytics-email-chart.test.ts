import { beforeEach, describe, expect, it, vi } from "vitest";

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

// Mock unstable_cache to just call the function directly (no caching)
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => () => fn(),
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

const TEST_DATE = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
const TEST_DAY = TEST_DATE.toISOString().slice(0, 10);

/**
 * One day of `message_send` aggregates, shaped like
 * `getEmailMetricsFromPostgres` returns them. `sent` excludes failed rows;
 * `renderingFailures` counts them.
 */
function postgresDay(day: {
  sent: number;
  delivered: number;
  bounced?: number;
  complaints?: number;
  opens?: number;
  clicks?: number;
  renderingFailures?: number;
}) {
  return new Map([
    [
      TEST_DAY,
      {
        date: TEST_DAY,
        sent: day.sent,
        delivered: day.delivered,
        bounced: day.bounced ?? 0,
        complaints: day.complaints ?? 0,
        opens: day.opens ?? 0,
        clicks: day.clicks ?? 0,
        renderingFailures: day.renderingFailures ?? 0,
      },
    ],
  ]);
}

async function callRoute() {
  const { GET } = await import("../[orgSlug]/analytics/email-chart/route");
  const request = new Request(
    "http://localhost/api/test-org/analytics/email-chart?days=30&tz=UTC"
  );
  const context = { params: Promise.resolve({ orgSlug: "test-org" }) };
  const response = await GET(request, context);
  return response.json();
}

describe("Email Chart API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSESReputationMetrics.mockResolvedValue({
      bounceRate: null,
      complaintRate: null,
      asOf: null,
    });
    mockGetEmailMetricsFromPostgres.mockResolvedValue(new Map());
  });

  it("computes deliveryRate against sends that actually left, excluding failures", async () => {
    // 124 attempted, 13 of them rendering failures — Postgres reports the 111
    // that were not failed as `sent`, so the rate is 110/111.
    mockGetEmailMetricsFromPostgres.mockResolvedValue(
      postgresDay({ sent: 111, delivered: 110, renderingFailures: 13 })
    );

    const data = await callRoute();

    expect(data.overview.deliveryRate).toBeCloseTo(99.1, 1);
    // Counting the failures in the denominator would give 110/124 = 88.71%.
    expect(data.overview.deliveryRate).not.toBeCloseTo(88.71, 1);
    expect(data.overview.totalRenderingFailures).toBe(13);
  });

  it("uses SES reputation bounceRate/complaintRate over period-based calculation", async () => {
    mockGetEmailMetricsFromPostgres.mockResolvedValue(
      postgresDay({ sent: 24, delivered: 20, bounced: 1, complaints: 1 })
    );
    // SES reputation shows much lower rates based on full account history
    mockGetSESReputationMetrics.mockResolvedValue({
      bounceRate: 0.0002,
      complaintRate: 0.0003,
      asOf: new Date(),
    });

    const data = await callRoute();

    // period-based would be 1/24*100 = 4.17% — reputation should win
    expect(data.overview.bounceRate).toBeCloseTo(0.02, 2);
    expect(data.overview.bounceRate).not.toBeCloseTo(4.17, 1);
    // 0.0003 * 100 = 0.03%, rounded to 2 decimals
    expect(data.overview.complaintRate).toBeCloseTo(0.03, 2);
  });

  it("carries engagement through to the volume and engagement series", async () => {
    mockGetEmailMetricsFromPostgres.mockResolvedValue(
      postgresDay({ sent: 100, delivered: 90, opens: 45, clicks: 9 })
    );

    const data = await callRoute();

    const volumePoint = data.volume.find(
      (v: { date: string }) => v.date === TEST_DAY
    );
    expect(volumePoint.opens).toBe(45);
    expect(volumePoint.clicks).toBe(9);

    const engagementPoint = data.engagement.find(
      (v: { date: string }) => v.date === TEST_DAY
    );
    expect(engagementPoint.openRate).toBe(50);
    expect(engagementPoint.clickRate).toBe(10);

    expect(data.overview.totalSent).toBe(100);
  });
});
