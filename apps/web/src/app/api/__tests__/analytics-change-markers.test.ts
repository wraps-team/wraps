// Route validation, auth, delta gating and org isolation for the change-markers
// endpoint. Fully mocked, so it runs without a database. The repository query
// is covered by the DB-backed test in packages/db.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  headers: () => new Headers(),
}));

const mockGetSession = vi.fn();
vi.mock("@wraps/auth", () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
    },
  },
}));

const mockGetOrg = vi.fn();
vi.mock("@/lib/organization", () => ({
  getOrganizationWithMembership: (...args: unknown[]) => mockGetOrg(...args),
}));

const mockGetPlan = vi.fn();
vi.mock("@/lib/plan-limits", () => ({
  getOrganizationPlan: (...args: unknown[]) => mockGetPlan(...args),
}));

const mockListRows = vi.fn();
const mockBuckets = vi.fn();
const mockMetricsTotals = vi.fn();
const mockAttribution = vi.fn();
vi.mock("@wraps/db", () => ({
  listChangeMarkerRows: (...args: unknown[]) => mockListRows(...args),
  queryMessageMetricBuckets: (...args: unknown[]) => mockBuckets(...args),
  // Spies: the timeline must not call these metric helpers.
  getMessageMetrics: (...args: unknown[]) => mockMetricsTotals(...args),
  queryMessageAttributionRows: (...args: unknown[]) => mockAttribution(...args),
}));

vi.mock("@/lib/logger", () => ({
  createRequestLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }),
}));

type RouteHandler = (
  request: Request,
  context: { params: Promise<{ orgSlug: string }> }
) => Promise<Response>;

async function loadGet(): Promise<RouteHandler> {
  const mod = await import("../[orgSlug]/analytics/change-markers/route");
  return mod.GET as unknown as RouteHandler;
}

async function call(query: string, orgSlug = "acme") {
  const GET = await loadGet();
  return GET(
    new Request(
      `https://app.test/api/${orgSlug}/analytics/change-markers?${query}`
    ),
    { params: Promise.resolve({ orgSlug }) }
  );
}

const SESSION = { user: { id: "user-1", email: "t@example.com", name: "T" } };
const ORG = { id: "org-1", name: "Acme", slug: "acme" };
const NOW = new Date("2026-10-28T12:00:00.000Z");
const DAY = 24 * 3_600_000;

function emptyRows(overrides: Record<string, unknown> = {}) {
  return {
    batches: [],
    auditRows: [],
    templateVersions: [],
    truncated: false,
    ...overrides,
  };
}

function oneBroadcast() {
  return emptyRows({
    batches: [
      {
        id: "b1",
        name: "Launch",
        totalRecipients: 500,
        startedAt: new Date("2026-10-27T10:20:00.000Z"),
      },
    ],
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  mockGetSession.mockResolvedValue(SESSION);
  mockGetOrg.mockResolvedValue(ORG);
  mockGetPlan.mockResolvedValue("free");
  mockListRows.mockResolvedValue(emptyRows());
  mockBuckets.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/[orgSlug]/analytics/change-markers", () => {
  it("returns 401 without a session", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await call("days=30");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(mockListRows).not.toHaveBeenCalled();
  });

  it("returns 403 for a user who is not a member of the org", async () => {
    mockGetOrg.mockResolvedValue(null);
    const res = await call("days=30");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
    expect(mockListRows).not.toHaveBeenCalled();
  });

  it.each(["0", "91", "abc"])(
    "days=%s returns 400 with the spec message",
    async (days) => {
      const res = await call(`days=${days}`);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        error: "days must be between 1 and 90",
      });
      expect(mockListRows).not.toHaveBeenCalled();
    }
  );

  it("deltas=0 does not call queryMessageMetricBuckets", async () => {
    mockListRows.mockResolvedValue(oneBroadcast());
    const res = await call("days=30&deltas=0");
    expect(res.status).toBe(200);
    expect(mockBuckets).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.deltasIncluded).toBe(false);
    expect(body.markers[0].delta).toBeNull();
  });

  it("deltas=1 calls queryMessageMetricBuckets once and no other metric helper", async () => {
    mockListRows.mockResolvedValue(oneBroadcast());
    const res = await call("days=30");
    expect(res.status).toBe(200);
    expect(mockBuckets).toHaveBeenCalledTimes(1);
    expect(mockMetricsTotals).not.toHaveBeenCalled();
    expect(mockAttribution).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.deltasIncluded).toBe(true);
    expect(body.markers[0].delta).not.toBeNull();
  });

  it("the metrics query uses hourly UTC buckets grouped by period, org from membership", async () => {
    mockListRows.mockResolvedValue(oneBroadcast());
    await call("days=30&tz=America%2FNew_York");
    expect(mockBuckets).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        timezone: "UTC",
        granularity: "hourly",
        dimensions: ["period"],
      })
    );
  });

  it("groups alone never reach the metrics query", async () => {
    mockListRows.mockResolvedValue(
      emptyRows({
        batches: [
          {
            id: "a",
            name: "A",
            totalRecipients: 1,
            startedAt: new Date("2026-10-27T08:00:00Z"),
          },
          {
            id: "b",
            name: "B",
            totalRecipients: 1,
            startedAt: new Date("2026-10-27T09:00:00Z"),
          },
        ],
      })
    );
    const res = await call("days=30");
    const body = await res.json();
    expect(body.markers).toHaveLength(1);
    expect(body.markers[0].count).toBe(2);
    expect(body.markers[0].delta).toBeNull();
    expect(mockBuckets).not.toHaveBeenCalled();
  });

  it("auditFloor uses getHistoryRetentionDays for the plan (free plan: 30 days)", async () => {
    await call("days=7");
    expect(mockGetPlan).toHaveBeenCalledWith("org-1");
    const args = mockListRows.mock.calls[0][0];
    expect(args.auditFloor.getTime()).toBe(NOW.getTime() - 30 * DAY);
    expect(args.startTime.getTime()).toBe(NOW.getTime() - 7 * DAY);
    expect(args.endTime.getTime()).toBe(NOW.getTime());
  });

  it("org isolation: the orgId passed to every source query is the membership org, never a value from the URL", async () => {
    await call("days=7&organizationId=org-other&orgId=org-other");
    expect(mockListRows).toHaveBeenCalledTimes(1);
    expect(mockListRows.mock.calls[0][0]).toMatchObject({
      organizationId: "org-1",
    });
    expect(mockGetPlan).toHaveBeenCalledWith("org-1");
  });

  it("an invalid timezone falls back to UTC in the response window", async () => {
    const res = await call("days=7&tz=Not%2FA_Zone");
    const body = await res.json();
    expect(body.window.timezone).toBe("UTC");
  });

  it("sets truncated when a source reported the row limit", async () => {
    mockListRows.mockResolvedValue(emptyRows({ truncated: true }));
    const res = await call("days=30&deltas=0");
    const body = await res.json();
    expect(body.truncated).toBe(true);
  });

  it("the response carries only the minimal marker fields and no actor or email", async () => {
    mockListRows.mockResolvedValue(oneBroadcast());
    const res = await call("days=30");
    const text = await res.text();
    // Match JSON keys only: an href such as /emails/broadcasts is allowed.
    expect(text).not.toMatch(
      /"(actor\w*|\w*email\w*|ip\w*|user\w*agent|userId)"\s*:/i
    );
    expect(Object.keys(JSON.parse(text).markers[0]).sort()).toEqual(
      [
        "at",
        "count",
        "date",
        "delta",
        "href",
        "id",
        "label",
        "type",
        "value",
        "weight",
      ].sort()
    );
  });
});
