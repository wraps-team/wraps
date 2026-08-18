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

function today(timezone = "UTC") {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function callVolume(query = "") {
  const { GET } = await import("../[orgSlug]/analytics/volume/route");
  const request = new Request(
    `http://localhost/api/test-org/analytics/volume${query}`
  );
  const context = { params: Promise.resolve({ orgSlug: "test-org" }) };
  const response = await GET(request, context);
  return { response, data: await response.json() };
}

describe("Analytics Volume API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetEmailMetricsFromPostgres.mockResolvedValue(new Map());
  });

  it("serves volume from Postgres scoped to the organization", async () => {
    const date = today();
    mockGetEmailMetricsFromPostgres.mockResolvedValueOnce(
      new Map([
        [
          date,
          {
            date,
            sent: 42,
            delivered: 40,
            bounced: 2,
            complaints: 0,
            opens: 10,
            clicks: 3,
            renderingFailures: 1,
          },
        ],
      ])
    );

    const { data } = await callVolume("?days=7&tz=UTC");

    expect(mockGetEmailMetricsFromPostgres).toHaveBeenCalledWith(
      "org-1",
      expect.any(Date),
      expect.any(Date),
      "UTC"
    );

    const point = data.find((d: { date: string }) => d.date === date);
    expect(point).toMatchObject({
      sent: 42,
      delivered: 40,
      bounced: 2,
      renderingFailures: 1,
    });
  });

  it("does not read CloudWatch at all", async () => {
    // The old implementation called getCloudWatchMetricsBatch with no
    // Dimensions, which returns ACCOUNT-WIDE SES counts including mail sent
    // outside Wraps. That function no longer exists; importing the route must
    // not require the CloudWatch module.
    const routeSource = await import("node:fs").then((fs) =>
      fs.readFileSync(
        new URL("../[orgSlug]/analytics/volume/route.ts", import.meta.url),
        "utf8"
      )
    );

    expect(routeSource).not.toContain("aws/cloudwatch");
    expect(routeSource).not.toContain("getCloudWatchMetricsBatch");
  });

  it("gap-fills days with no sends instead of omitting them", async () => {
    const { data } = await callVolume("?days=7&tz=UTC");

    // 7 days back plus today, inclusive.
    expect(data.length).toBeGreaterThanOrEqual(7);
    for (const point of data) {
      expect(point).toMatchObject({
        sent: 0,
        delivered: 0,
        bounced: 0,
        renderingFailures: 0,
      });
    }
  });

  it("clamps the requested window to a year", async () => {
    await callVolume("?days=99999&tz=UTC");

    const [, startTime, endTime] =
      mockGetEmailMetricsFromPostgres.mock.calls[0];
    const spannedDays =
      (endTime.getTime() - startTime.getTime()) / (24 * 60 * 60 * 1000);
    expect(spannedDays).toBeCloseTo(365, 0);
  });

  it("rejects an unauthenticated request", async () => {
    const { auth } = await import("@wraps/auth");
    vi.mocked(auth.api.getSession).mockResolvedValueOnce(null);

    const { response } = await callVolume();

    expect(response.status).toBe(401);
  });

  it("returns 403 when the user is not a member of the org", async () => {
    const { getOrganizationWithMembership } = await import(
      "@/lib/organization"
    );
    vi.mocked(getOrganizationWithMembership).mockResolvedValueOnce(null);

    const { response } = await callVolume();

    expect(response.status).toBe(403);
  });
});
