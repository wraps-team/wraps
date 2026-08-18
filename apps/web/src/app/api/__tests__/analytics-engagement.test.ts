import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  headers: () => new Headers(),
}));

const { mockGetSession, mockFindMany } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockFindMany: vi.fn(),
}));

vi.mock("@wraps/auth", () => ({
  auth: { api: { getSession: mockGetSession } },
}));

vi.mock("@wraps/db", () => ({
  db: { query: { awsAccount: { findMany: mockFindMany } } },
}));

vi.mock("@/lib/organization", () => ({
  getOrganizationWithMembership: vi.fn(async () => ({
    id: "org-1",
    name: "Test Org",
    slug: "test-org",
  })),
}));

const mockGetEmailMetricsFromPostgres = vi.fn();
vi.mock("@/lib/analytics-fallback", () => ({
  getEmailMetricsFromPostgres: (...args: unknown[]) =>
    mockGetEmailMetricsFromPostgres(...args),
}));

vi.mock("@/lib/logger", () => ({
  createRequestLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }),
  serializeError: (e: unknown) => e,
}));

// Mock analytics-utils — return the data as-is
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

describe("Engagement Analytics API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ user: { id: "user-1" }, session: {} });
    mockFindMany.mockResolvedValue([{ id: "acc-1", organizationId: "org-1" }]);
    mockGetEmailMetricsFromPostgres.mockResolvedValue(new Map());
  });

  it("computes rates from Postgres data", async () => {
    const testDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const testDay = testDate.toISOString().slice(0, 10);

    mockGetEmailMetricsFromPostgres.mockResolvedValueOnce(
      new Map([
        [
          testDay,
          {
            date: testDay,
            sent: 100,
            delivered: 90,
            bounced: 0,
            complaints: 0,
            opens: 45,
            clicks: 9,
            renderingFailures: 0,
          },
        ],
      ])
    );

    const { GET } = await import("../[orgSlug]/analytics/engagement/route");
    const request = new Request(
      "http://localhost/api/test-org/analytics/engagement?days=30&tz=UTC"
    );
    const context = { params: Promise.resolve({ orgSlug: "test-org" }) };

    const response = await GET(request, context);
    const data = await response.json();

    const point = data.find((d: { date: string }) => d.date === testDay);
    expect(point.openRate).toBe(50);
    expect(point.clickRate).toBe(10);
    expect(point.ctr).toBe(20);
  });

  it("yields zero rates (not NaN) for a zero-delivered day", async () => {
    const testDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const testDay = testDate.toISOString().slice(0, 10);

    mockGetEmailMetricsFromPostgres.mockResolvedValueOnce(
      new Map([
        [
          testDay,
          {
            date: testDay,
            sent: 5,
            delivered: 0,
            bounced: 0,
            complaints: 0,
            opens: 0,
            clicks: 0,
            renderingFailures: 0,
          },
        ],
      ])
    );

    const { GET } = await import("../[orgSlug]/analytics/engagement/route");
    const request = new Request(
      "http://localhost/api/test-org/analytics/engagement?days=30&tz=UTC"
    );
    const context = { params: Promise.resolve({ orgSlug: "test-org" }) };

    const response = await GET(request, context);
    const data = await response.json();

    const point = data.find((d: { date: string }) => d.date === testDay);
    expect(point.openRate).toBe(0);
    expect(point.clickRate).toBe(0);
    expect(point.ctr).toBe(0);
  });

  it("still reports sends when the org has no AWS account row", async () => {
    // This route makes no AWS call, so gating on an AWS account only produced a
    // false empty chart for orgs whose event pipeline never came up while their
    // sends were recorded in Postgres all along.
    mockFindMany.mockResolvedValueOnce([]);

    const { GET } = await import("../[orgSlug]/analytics/engagement/route");
    const request = new Request(
      "http://localhost/api/test-org/analytics/engagement?days=30&tz=UTC"
    );
    const context = { params: Promise.resolve({ orgSlug: "test-org" }) };

    const response = await GET(request, context);
    const data = await response.json();

    expect(mockGetEmailMetricsFromPostgres).toHaveBeenCalledWith(
      "org-1",
      expect.any(Date),
      expect.any(Date),
      "UTC"
    );
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
  });

  it("returns 401 when the session is unauthorized", async () => {
    mockGetSession.mockResolvedValueOnce(null);

    const { GET } = await import("../[orgSlug]/analytics/engagement/route");
    const request = new Request(
      "http://localhost/api/test-org/analytics/engagement?days=30&tz=UTC"
    );
    const context = { params: Promise.resolve({ orgSlug: "test-org" }) };

    const response = await GET(request, context);
    expect(response.status).toBe(401);
  });
});
