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

const mockBounces = vi.fn();
const mockComplaints = vi.fn();
const mockSuppression = vi.fn();
const mockTopPerformers = vi.fn();
const mockRecentActivity = vi.fn();
vi.mock("@/lib/analytics-fallback", () => ({
  getBounceMetricsFromPostgres: (...args: unknown[]) => mockBounces(...args),
  getComplaintMetricsFromPostgres: (...args: unknown[]) =>
    mockComplaints(...args),
  getSuppressionMetricsFromPostgres: (...args: unknown[]) =>
    mockSuppression(...args),
  getTopPerformersFromPostgres: (...args: unknown[]) =>
    mockTopPerformers(...args),
  getRecentActivityFromPostgres: (...args: unknown[]) =>
    mockRecentActivity(...args),
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

// Static imports: the bundler cannot resolve a templated specifier, and a
// typo'd route name must fail loudly rather than resolve to nothing.
const ROUTES: Record<string, () => Promise<{ GET: RouteHandler }>> = {
  bounces: () => import("../[orgSlug]/analytics/bounces/route"),
  complaints: () => import("../[orgSlug]/analytics/complaints/route"),
  suppression: () => import("../[orgSlug]/analytics/suppression/route"),
  "top-performers": () => import("../[orgSlug]/analytics/top-performers/route"),
  "recent-activity": () =>
    import("../[orgSlug]/analytics/recent-activity/route"),
};

type RouteHandler = (
  request: Request,
  context: { params: Promise<{ orgSlug: string }> }
) => Promise<Response>;

async function call(route: string, query = "") {
  const load = ROUTES[route];
  if (!load) {
    throw new Error(`Unknown analytics route: ${route}`);
  }
  const { GET } = await load();
  const request = new Request(
    `http://localhost/api/test-org/analytics/${route}${query}`
  );
  const context = { params: Promise.resolve({ orgSlug: "test-org" }) };
  const response = await GET(request, context);
  return { response, data: await response.json() };
}

function readRouteSource(route: string) {
  return import("node:fs").then((fs) =>
    fs.readFileSync(
      new URL(`../[orgSlug]/analytics/${route}/route.ts`, import.meta.url),
      "utf8"
    )
  );
}

describe("Analytics routes served from Postgres", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBounces.mockResolvedValue(new Map());
    mockComplaints.mockResolvedValue(new Map());
    mockSuppression.mockResolvedValue(new Map());
    mockTopPerformers.mockResolvedValue([]);
    mockRecentActivity.mockResolvedValue([]);
  });

  // The customer's DynamoDB event table is keyed per AWS ACCOUNT, so reading it
  // counted SES activity for mail sent outside Wraps entirely - the same
  // account-wide-source defect the volume chart had.
  it.each([
    "bounces",
    "complaints",
    "suppression",
    "top-performers",
    "recent-activity",
  ])(
    "%s does not read the account-wide DynamoDB event table",
    async (route) => {
      const source = await readRouteSource(route);
      expect(source).not.toContain("aws/dynamodb");
      expect(source).not.toContain("queryEmailEvents");
    }
  );

  it("bounces computes rate against the org's own sends", async () => {
    const date = today();
    mockBounces.mockResolvedValueOnce(
      new Map([
        [date, { permanent: 3, transient: 1, undetermined: 0, sent: 100 }],
      ])
    );

    const { data } = await call("bounces", "?days=7&tz=UTC");

    expect(mockBounces).toHaveBeenCalledWith(
      "org-1",
      expect.any(Date),
      expect.any(Date),
      "UTC"
    );
    const point = data.find((d: { date: string }) => d.date === date);
    expect(point.total).toBe(4);
    expect(point.bounceRate).toBeCloseTo(4, 2);
  });

  it("complaints computes rate against the org's own sends", async () => {
    const date = today();
    mockComplaints.mockResolvedValueOnce(
      new Map([[date, { complaints: 2, sent: 1000 }]])
    );

    const { data } = await call("complaints", "?days=7&tz=UTC");

    const point = data.find((d: { date: string }) => d.date === date);
    expect(point.complaintRate).toBeCloseTo(0.2, 4);
  });

  it("suppression reports one honest count, not a fabricated account/global split", async () => {
    const date = today();
    mockSuppression.mockResolvedValueOnce(
      new Map([[date, { suppressed: 5, sent: 200 }]])
    );

    const { data } = await call("suppression", "?days=7&tz=UTC");

    const point = data.find((d: { date: string }) => d.date === date);
    expect(point.suppressed).toBe(5);
    expect(point.suppressionRate).toBeCloseTo(2.5, 2);
    // Postgres records that a message was suppressed, never the SES reason, so
    // the old accountLevel field could only ever be 0.
    expect(point).not.toHaveProperty("accountLevel");
    expect(point).not.toHaveProperty("globalLevel");
  });

  it("suppression gap-fills quiet days at a 0% rate", async () => {
    const { data } = await call("suppression", "?days=7&tz=UTC");

    expect(data.length).toBeGreaterThanOrEqual(7);
    for (const point of data) {
      expect(point.suppressed).toBe(0);
      expect(point.suppressionRate).toBe(0);
    }
  });

  it("top-performers ranks the org's subjects over the requested window", async () => {
    mockTopPerformers.mockResolvedValueOnce([
      {
        subject: "Welcome",
        openRate: 55.5,
        clickRate: 12,
        sent: 200,
        opens: 111,
        clicks: 24,
        sentAt: Date.parse("2026-04-10T00:00:00Z"),
      },
    ]);

    const { data } = await call("top-performers", "?days=30&limit=5");

    expect(mockTopPerformers).toHaveBeenCalledWith(
      "org-1",
      expect.any(Date),
      expect.any(Date),
      5
    );
    expect(data[0].subject).toBe("Welcome");
  });

  it("recent-activity returns a usable detail link id", async () => {
    // The client used to rebuild this by splitting a composite DynamoDB id on
    // "-" and dropping the last segment, which mangles a Postgres UUID.
    mockRecentActivity.mockResolvedValueOnce([
      {
        id: "0192f0a1-1c2d-7e3f-8a4b-5c6d7e8f9a0b",
        messageId: "0100018f-ses-message-id",
        subject: "Welcome",
        eventType: "Delivery",
        timestamp: Date.parse("2026-04-10T00:00:00Z"),
        sentAt: Date.parse("2026-04-10T00:00:00Z"),
        timestampFormatted: "2026-04-10T00:00:00.000Z",
        metadata: { to: "user@example.com" },
      },
    ]);

    const { data } = await call("recent-activity", "?limit=20");

    expect(mockRecentActivity).toHaveBeenCalledWith("org-1", 20);
    expect(data[0].messageId).toBe("0100018f-ses-message-id");
  });

  it.each([
    "bounces",
    "complaints",
    "suppression",
    "top-performers",
    "recent-activity",
  ])("%s rejects an unauthenticated request", async (route) => {
    const { auth } = await import("@wraps/auth");
    vi.mocked(auth.api.getSession).mockResolvedValueOnce(null);

    const { response } = await call(route);

    expect(response.status).toBe(401);
  });

  it.each([
    "bounces",
    "complaints",
    "suppression",
    "top-performers",
    "recent-activity",
  ])("%s returns 403 for a non-member", async (route) => {
    const { getOrganizationWithMembership } = await import(
      "@/lib/organization"
    );
    vi.mocked(getOrganizationWithMembership).mockResolvedValueOnce(null);

    const { response } = await call(route);

    expect(response.status).toBe(403);
  });
});
