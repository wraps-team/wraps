// Route validation, auth, degradation and response shape for the drill-down
// reasons endpoint. The repository is mocked, so this runs without a database.
// The org-scoped and inclusive-window cases need the real queries and live in
// packages/db/src/__tests__/repository-bounce-reasons-db.test.ts.
import { translateDiagnosticCode } from "@wraps/core/email-diagnostics";
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

const repo = vi.hoisted(() => ({
  queryBounceReasonRows: vi.fn(),
  queryComplaintReasonRows: vi.fn(),
  queryReasonTotals: vi.fn(),
  queryReasonsFallbackSince: vi.fn(),
  queryReasonsSuppressionCount: vi.fn(),
  queryLegacyReasonRows: vi.fn(),
  queryLegacyReasonTotals: vi.fn(),
}));
vi.mock("@wraps/db", () => repo);

const mockWarn = vi.fn();
const mockError = vi.fn();
vi.mock("@/lib/logger", () => ({
  createRequestLogger: () => ({
    info: vi.fn(),
    error: (...args: unknown[]) => mockError(...args),
    warn: (...args: unknown[]) => mockWarn(...args),
  }),
}));

type RouteHandler = (
  request: Request,
  context: { params: Promise<{ orgSlug: string }> }
) => Promise<Response>;

async function loadGet(): Promise<RouteHandler> {
  const mod = await import("../[orgSlug]/analytics/drilldown/reasons/route");
  return mod.GET as unknown as RouteHandler;
}

async function call(query: string, orgSlug = "acme") {
  const GET = await loadGet();
  return GET(
    new Request(
      `https://app.test/api/${orgSlug}/analytics/drilldown/reasons?${query}`
    ),
    { params: Promise.resolve({ orgSlug }) }
  );
}

const SESSION = { user: { id: "user-1", email: "t@example.com", name: "T" } };
const ORG = { id: "org-1", name: "Acme", slug: "acme" };
const FIRST = new Date("2026-10-03T14:22:00.000Z");
const LAST = new Date("2026-10-27T09:00:00.000Z");

// A bounce row as the repository returns it. Domain only: no address field.
function bounceRow(
  overrides: Partial<{
    receiverDomain: string;
    reasonKey: string | null;
    hasDetail: boolean;
    bounceType: string | null;
    bounceSubType: string | null;
    sampleStatus: string | null;
    sampleCode: string | null;
    count: number;
    distinctRecipients: number;
  }> = {}
) {
  return {
    receiverDomain: "gmail.com",
    reasonKey: null,
    hasDetail: false,
    bounceType: "Permanent",
    bounceSubType: "General",
    sampleStatus: null,
    sampleCode: null,
    count: 10,
    distinctRecipients: 4,
    firstSeen: FIRST,
    lastSeen: LAST,
    ...overrides,
  };
}

function complaintRow(
  overrides: Partial<{
    receiverDomain: string;
    feedbackType: string | null;
    hasDetail: boolean;
    count: number;
  }> = {}
) {
  return {
    receiverDomain: "yahoo.com",
    feedbackType: null,
    hasDetail: false,
    count: 3,
    distinctRecipients: 3,
    firstSeen: FIRST,
    lastSeen: LAST,
    ...overrides,
  };
}

function legacyRow(
  overrides: Partial<{
    receiverDomain: string;
    bounceType: string | null;
    bounceSubType: string | null;
    count: number;
  }> = {}
) {
  return {
    receiverDomain: "gmail.com",
    bounceType: "Permanent",
    bounceSubType: "General",
    count: 10,
    distinctRecipients: 4,
    firstSeen: FIRST,
    lastSeen: LAST,
    ...overrides,
  };
}

function totals(totalCount: number, withoutDetail = 0) {
  return { totalCount, withoutDetail };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue(SESSION);
  mockGetOrg.mockResolvedValue(ORG);
  repo.queryBounceReasonRows.mockResolvedValue([
    bounceRow({
      hasDetail: true,
      reasonKey: "gmail||550 5.1.1|x",
      sampleStatus: "5.1.1",
      sampleCode: "smtp; 550 5.1.1 user unknown",
      bounceSubType: "NoEmail",
      count: 10,
    }),
  ]);
  repo.queryComplaintReasonRows.mockResolvedValue([]);
  repo.queryReasonTotals.mockResolvedValue(totals(10, 0));
  repo.queryReasonsFallbackSince.mockResolvedValue(FIRST);
  repo.queryReasonsSuppressionCount.mockResolvedValue(0);
  repo.queryLegacyReasonRows.mockResolvedValue([legacyRow()]);
  repo.queryLegacyReasonTotals.mockResolvedValue(10);
});

describe("GET /api/[orgSlug]/analytics/drilldown/reasons", () => {
  it("returns 401 without a session", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await call("metric=bounce");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(repo.queryReasonTotals).not.toHaveBeenCalled();
  });

  it("returns 403 for a user who is not a member of the org", async () => {
    mockGetOrg.mockResolvedValue(null);
    const res = await call("metric=bounce");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
    expect(repo.queryReasonTotals).not.toHaveBeenCalled();
  });

  it("rejects metric=suppression with 400", async () => {
    const res = await call("metric=suppression");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "metric must be bounce or complaint",
    });
    expect(repo.queryReasonTotals).not.toHaveBeenCalled();
  });

  it("rejects a missing metric with 400", async () => {
    const res = await call("days=7");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "metric must be bounce or complaint",
    });
  });

  it("rejects days outside 1 to 90 with 400", async () => {
    for (const days of ["0", "91", "abc"]) {
      const res = await call(`metric=bounce&days=${days}`);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        error: "days must be between 1 and 90",
      });
    }
    expect(repo.queryReasonTotals).not.toHaveBeenCalled();
  });

  it("rejects an impossible day with 400", async () => {
    const res = await call("metric=bounce&day=2026-02-30");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "day must be a YYYY-MM-DD date",
    });
  });

  it("takes the organization id from membership, never from the URL", async () => {
    await call("metric=bounce&days=7&organizationId=org-other&orgId=org-other");
    expect(repo.queryReasonTotals).toHaveBeenCalledTimes(1);
    expect(repo.queryReasonTotals.mock.calls[0][0]).toMatchObject({
      organizationId: "org-1",
    });
    expect(repo.queryReasonsFallbackSince).toHaveBeenCalledWith(
      "org-1",
      "bounce"
    );
  });

  it("returns mode detailed with the grouped reasons and the catalog copy", async () => {
    const res = await call("metric=bounce&days=30&tz=UTC");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe("detailed");
    expect(body.metric).toBe("bounce");
    expect(body.totalCount).toBe(10);
    expect(body.fallbackSince).toBe(FIRST.toISOString());
    expect(body.windowHasFallbackRows).toBe(false);

    const expected = translateDiagnosticCode({
      status: "5.1.1",
      diagnosticCode: "smtp; 550 5.1.1 user unknown",
    });
    expect(expected).not.toBeNull();
    const group = body.groups[0];
    expect(group.title).toBe(expected?.title);
    expect(group.explanation).toBe(expected?.explanation);
    expect(group.provider).toBe(expected?.provider ?? null);
    expect(group.severity).toBe(expected?.severity);
    expect(group.rawCode).toBe("smtp; 550 5.1.1 user unknown");
    expect(group.hasDetail).toBe(true);
    expect(group.bounceType).toBe("Permanent");
    expect(group.share).toBe(100);
    expect(group.firstSeen).toBe(FIRST.toISOString());
  });

  it("returns the bounce type of each group, Permanent or Transient", async () => {
    repo.queryBounceReasonRows.mockResolvedValue([
      bounceRow({ receiverDomain: "gmail.com", bounceType: "Permanent" }),
      bounceRow({
        receiverDomain: "yahoo.com",
        bounceType: "Transient",
        bounceSubType: "MailboxFull",
        count: 4,
      }),
    ]);
    repo.queryReasonTotals.mockResolvedValue(totals(14, 0));
    const body = await (await call("metric=bounce")).json();
    expect(body.groups[0].bounceType).toBe("Permanent");
    expect(body.groups[1].bounceType).toBe("Transient");
  });

  it("returns the bounce type on legacy bounce groups", async () => {
    repo.queryReasonTotals.mockRejectedValue(
      Object.assign(new Error("column does not exist"), { code: "42703" })
    );
    repo.queryLegacyReasonRows.mockResolvedValue([
      legacyRow({ bounceType: "Transient", bounceSubType: "General" }),
    ]);
    const body = await (await call("metric=bounce")).json();
    expect(body.mode).toBe("legacy");
    expect(body.groups[0].bounceType).toBe("Transient");
  });

  it("gives a pre-M1 row the bounce-subtype copy with no raw code and no detail", async () => {
    repo.queryBounceReasonRows.mockResolvedValue([
      bounceRow({
        receiverDomain: "example.org",
        hasDetail: false,
        bounceType: "Permanent",
        bounceSubType: "NoEmail",
      }),
    ]);
    repo.queryReasonTotals.mockResolvedValue(totals(10, 10));
    repo.queryReasonsFallbackSince.mockResolvedValue(null);
    const body = await (await call("metric=bounce")).json();
    const group = body.groups[0];
    expect(group.hasDetail).toBe(false);
    expect(group.rawCode).toBeNull();
    expect(group.explanation).toBeNull();
    expect(group.title).toMatch(/\S/);
    expect(body.windowHasFallbackRows).toBe(true);
    expect(body.fallbackSince).toBeNull();
  });

  it("titles a recorded complaint with no feedback type as not reported", async () => {
    repo.queryComplaintReasonRows.mockResolvedValue([
      complaintRow({ hasDetail: true, feedbackType: null, count: 4 }),
      complaintRow({
        receiverDomain: "example.net",
        hasDetail: true,
        feedbackType: "abuse",
        count: 1,
      }),
    ]);
    repo.queryReasonTotals.mockResolvedValue(totals(5, 0));
    const body = await (await call("metric=complaint")).json();
    expect(body.groups[0].title).toBe(
      "Feedback type not reported by the receiver"
    );
    expect(body.groups[0].share).toBe(80);
    expect(body.groups[1].title).toBe("Spam complaint — marked as spam");
    expect(body.groups[0].feedbackType).toBeNull();
    expect(body.groups[1].feedbackType).toBe("abuse");
    expect(body.groups[0].bounceType).toBeNull();
    expect(body.groups[1].bounceType).toBeNull();
  });

  it("does not ask for suppression reconciliation on the complaint metric", async () => {
    const body = await (await call("metric=complaint")).json();
    expect(repo.queryReasonsSuppressionCount).not.toHaveBeenCalled();
    expect(body.suppressionReconciliation).toBe(0);
  });

  it("returns the suppression reconciliation count on the bounce metric", async () => {
    repo.queryReasonsSuppressionCount.mockResolvedValue(3);
    const body = await (await call("metric=bounce")).json();
    expect(body.suppressionReconciliation).toBe(3);
  });

  it("returns mode legacy when the detailed query throws 42P01", async () => {
    repo.queryReasonTotals.mockRejectedValue(
      Object.assign(
        new Error('relation "message_send_diagnostic" does not exist'),
        {
          code: "42P01",
        }
      )
    );
    const res = await call("metric=bounce");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe("legacy");
    expect(body.fallbackSince).toBeNull();
    expect(body.windowHasFallbackRows).toBe(true);
    expect(body.totalCount).toBe(10);
    expect(body.groups[0].hasDetail).toBe(false);
    expect(mockWarn).toHaveBeenCalledTimes(1);
    expect(mockWarn.mock.calls[0][0]).toMatchObject({ code: "42P01" });
  });

  it("returns mode legacy when the query throws 42703 on err.cause", async () => {
    repo.queryBounceReasonRows.mockRejectedValue(
      Object.assign(new Error("Failed query"), {
        cause: { code: "42703" },
      })
    );
    const res = await call("metric=bounce");
    expect(res.status).toBe(200);
    expect((await res.json()).mode).toBe("legacy");
    expect(mockWarn.mock.calls[0][0]).toMatchObject({ code: "42703" });
  });

  it("returns 500 for any other error", async () => {
    repo.queryReasonTotals.mockRejectedValue(
      Object.assign(new Error("connection reset"), { code: "08006" })
    );
    const res = await call("metric=bounce");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal server error" });
    expect(mockWarn).not.toHaveBeenCalled();
  });

  it("returns 500 when the legacy query also fails with an unexpected error", async () => {
    repo.queryReasonTotals.mockRejectedValue(
      Object.assign(new Error("missing"), { code: "42P01" })
    );
    repo.queryLegacyReasonRows.mockRejectedValue(new Error("connection reset"));
    const res = await call("metric=bounce");
    expect(res.status).toBe(500);
  });

  it("caps the groups at 50 and otherCount plus the groups equals totalCount", async () => {
    const rows = Array.from({ length: 60 }, (_, index) =>
      bounceRow({
        receiverDomain: `domain${index}.test`,
        count: 60 - index,
      })
    );
    repo.queryBounceReasonRows.mockResolvedValue(rows);
    const totalCount = rows.reduce((sum, row) => sum + row.count, 0);
    repo.queryReasonTotals.mockResolvedValue(totals(totalCount, totalCount));
    const body = await (await call("metric=bounce")).json();
    expect(body.groups).toHaveLength(50);
    const shown = body.groups.reduce(
      (sum: number, group: { count: number }) => sum + group.count,
      0
    );
    expect(body.otherCount + shown).toBe(body.totalCount);
    expect(body.otherCount).toBe(
      rows.slice(50).reduce((sum, row) => sum + row.count, 0)
    );
  });

  it("returns share null when the window has no bounces", async () => {
    repo.queryBounceReasonRows.mockResolvedValue([]);
    repo.queryReasonTotals.mockResolvedValue(totals(0, 0));
    const body = await (await call("metric=bounce")).json();
    expect(body.groups).toEqual([]);
    expect(body.otherCount).toBe(0);
    expect(body.totalCount).toBe(0);
  });

  it("rounds share to two decimals", async () => {
    // The query orders by count, so the larger group comes first.
    repo.queryBounceReasonRows.mockResolvedValue([
      bounceRow({ receiverDomain: "b.test", count: 2 }),
      bounceRow({ receiverDomain: "a.test", count: 1 }),
    ]);
    repo.queryReasonTotals.mockResolvedValue(totals(3, 3));
    const body = await (await call("metric=bounce")).json();
    expect(body.groups[0].share).toBe(66.67);
    expect(body.groups[1].share).toBe(33.33);
  });

  it("response contains no recipient address", async () => {
    repo.queryBounceReasonRows.mockResolvedValue([
      bounceRow({
        hasDetail: true,
        sampleStatus: "5.1.1",
        sampleCode: "smtp; 550 5.1.1 user unknown",
        reasonKey: "gmail||550 5.1.1|x",
      }),
    ]);
    const text = JSON.stringify(await (await call("metric=bounce")).json());
    expect(text).not.toMatch(/[^\s"]+@[^\s"]+/);
  });
});
