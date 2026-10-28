// Route validation and auth for the drill-down sends endpoint. Fully mocked, so
// it runs without a database. The org-isolation and reconciliation cases need
// the real query and live in analytics-drilldown-sends-db.test.ts.
import { beforeEach, describe, expect, it, vi } from "vitest";

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

const mockCheckFeatureAccess = vi.fn();
vi.mock("@/lib/plan-limits", () => ({
  checkFeatureAccess: (...args: unknown[]) => mockCheckFeatureAccess(...args),
}));

const mockQuery = vi.fn();
vi.mock("@wraps/db", () => {
  class MetricsQueryError extends Error {
    constructor(
      public readonly code: "invalid_timezone" | "row_cap_exceeded",
      message: string
    ) {
      super(message);
      this.name = "MetricsQueryError";
    }
  }
  return {
    MetricsQueryError,
    queryMessageAttributionRows: (...args: unknown[]) => mockQuery(...args),
  };
});

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
  const mod = await import("../[orgSlug]/analytics/drilldown/sends/route");
  return mod.GET as unknown as RouteHandler;
}

async function call(query: string, orgSlug = "acme") {
  const GET = await loadGet();
  return GET(
    new Request(
      `https://app.test/api/${orgSlug}/analytics/drilldown/sends?${query}`
    ),
    { params: Promise.resolve({ orgSlug }) }
  );
}

const SESSION = { user: { id: "user-1", email: "t@example.com", name: "T" } };
const ORG = { id: "org-1", name: "Acme", slug: "acme" };

function row(
  key: string | null,
  c: { sent: number; bounced: number; complained?: number; suppressed?: number }
) {
  return {
    key,
    label: key,
    sourceTypes: ["batch"],
    sent: c.sent,
    bounced: c.bounced,
    bouncedPermanent: c.bounced,
    bouncedTransient: 0,
    bouncedUndetermined: 0,
    complained: c.complained ?? 0,
    suppressed: c.suppressed ?? 0,
    opened: 0,
    openedRaw: 0,
    clicked: 0,
    failed: 0,
    delivered: 0,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue(SESSION);
  mockGetOrg.mockResolvedValue(ORG);
  mockCheckFeatureAccess.mockResolvedValue({ allowed: true });
  mockQuery.mockResolvedValue([row("b1", { sent: 300, bounced: 30 })]);
});

describe("GET /api/[orgSlug]/analytics/drilldown/sends", () => {
  it("returns 401 without a session", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await call("metric=bounce");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("returns 403 for a user who is not a member of the org", async () => {
    mockGetOrg.mockResolvedValue(null);
    const res = await call("metric=bounce");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("returns 400 for days=91", async () => {
    const res = await call("days=91");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "days must be between 1 and 90",
    });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("returns 400 for an unknown by value", async () => {
    const res = await call("by=domain");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "by must be broadcast, workflow, template or from",
    });
  });

  it("returns 400 for an impossible day", async () => {
    const res = await call("day=2026-02-30");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "day must be a YYYY-MM-DD date",
    });
  });

  it("returns 400 for an unknown metric value", async () => {
    const res = await call("metric=reasons");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "metric must be bounce, complaint or suppression",
    });
  });

  it("returns 422 when the group count exceeds the row cap", async () => {
    const { MetricsQueryError } = await import("@wraps/db");
    mockQuery.mockRejectedValue(
      new MetricsQueryError("row_cap_exceeded", "too many")
    );
    const res = await call("days=90");
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      error:
        "This window has more sending groups than can be broken down. Try a shorter window.",
    });
  });

  it("returns 500 with a generic message for an unexpected error", async () => {
    mockQuery.mockRejectedValue(new Error("connection reset"));
    const res = await call("days=7");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal server error" });
  });

  it("takes the organization id from membership, never from the URL", async () => {
    await call("days=7&organizationId=org-other&orgId=org-other");
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery.mock.calls[0][0]).toMatchObject({
      organizationId: "org-1",
    });
    expect(mockCheckFeatureAccess).toHaveBeenCalledWith("org-1", "workflows");
  });

  it("passes the parsed window, grouping and day to the repository", async () => {
    await call(
      "metric=complaint&by=from&days=7&day=2026-10-20&tz=America%2FNew_York"
    );
    const args = mockQuery.mock.calls[0][0];
    expect(args).toMatchObject({
      by: "from",
      timezone: "America/New_York",
      day: "2026-10-20",
    });
    expect(args.endTime.getTime() - args.startTime.getTime()).toBe(
      7 * 24 * 60 * 60 * 1000
    );
  });

  it("falls back to UTC for an invalid timezone without an error", async () => {
    const res = await call("tz=Not%2FAZone");
    expect(res.status).toBe(200);
    expect(mockQuery.mock.calls[0][0]).toMatchObject({ timezone: "UTC" });
  });

  it("workflowLinks is false when the plan does not include workflows", async () => {
    mockCheckFeatureAccess.mockResolvedValue({ allowed: false });
    const res = await call("by=workflow");
    expect(res.status).toBe(200);
    expect((await res.json()).workflowLinks).toBe(false);
  });

  it("workflowLinks is true when the plan includes workflows", async () => {
    const res = await call("by=workflow");
    expect((await res.json()).workflowLinks).toBe(true);
  });

  it("returns the response shape, with ranked, belowFloor and omitted summing to totals", async () => {
    mockQuery.mockResolvedValue([
      row("b1", { sent: 300, bounced: 30 }),
      row("b2", { sent: 300, bounced: 6 }),
      row(null, { sent: 10, bounced: 5 }),
    ]);
    const res = await call("metric=bounce&by=broadcast&days=30");
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.metric).toBe("bounce");
    expect(body.by).toBe("broadcast");
    expect(body.floor).toBe(100);
    expect(body.window).toMatchObject({
      mode: "rolling",
      days: 30,
      day: null,
      tz: "UTC",
    });
    expect(body.totals).toMatchObject({ sent: 610, bounced: 41 });
    expect(body.totals.rate).toBeCloseTo(6.72, 2);

    const listed = [...body.ranked, ...body.belowFloor];
    const sumSent = listed.reduce(
      (a: number, g: { sent: number }) => a + g.sent,
      0
    );
    expect(sumSent + body.omitted.sent).toBe(body.totals.sent);
    const sumBounced = listed.reduce(
      (a: number, g: { bounced: number }) => a + g.bounced,
      0
    );
    expect(sumBounced + body.omitted.bounced).toBe(body.totals.bounced);
    expect(body.ranked[0].key).toBe("b1");
    expect(body.belowFloor.map((g: { key: string | null }) => g.key)).toEqual([
      null,
    ]);
  });

  it("reports day mode in the window when day is given", async () => {
    const res = await call("day=2026-10-20&days=7");
    const body = await res.json();
    expect(body.window).toMatchObject({
      mode: "day",
      day: "2026-10-20",
      days: 7,
    });
  });

  it("returns empty groups and zero totals when the window has no sends", async () => {
    mockQuery.mockResolvedValue([]);
    const res = await call("days=30");
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ranked).toEqual([]);
    expect(body.belowFloor).toEqual([]);
    expect(body.totals).toMatchObject({ sent: 0, bounced: 0, rate: null });
    expect(body.omitted).toMatchObject({ groups: 0, sent: 0 });
  });
});
