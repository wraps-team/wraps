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

vi.mock("@/lib/logger", () => ({
  createRequestLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }),
}));

type FakeAccount = {
  id: string;
  name: string;
  accountId: string;
  region: string;
  healthStatus: "healthy" | "at_risk" | "in_danger" | null;
  healthCheckedAt: Date | null;
  healthDetail: { reasons: string[] } | null;
};

function account(overrides: Partial<FakeAccount>): FakeAccount {
  return {
    id: "acc-1",
    name: "Prod",
    accountId: "123456789012",
    region: "us-east-1",
    healthStatus: "healthy",
    healthCheckedAt: new Date("2026-09-04T00:00:00.000Z"),
    healthDetail: { reasons: [] },
    ...overrides,
  };
}

async function callHealth() {
  const { GET } = await import("../[orgSlug]/health/route");
  const request = new Request("http://localhost/api/test-org/health");
  const context = { params: Promise.resolve({ orgSlug: "test-org" }) };
  const response = await GET(request, context);
  return { response, data: await response.json() };
}

describe("SES Health API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindMany.mockResolvedValue([]);
  });

  it("rejects an unauthenticated request", async () => {
    const { auth } = await import("@wraps/auth");
    vi.mocked(auth.api.getSession).mockResolvedValueOnce(null);

    const { response } = await callHealth();

    expect(response.status).toBe(401);
  });

  it("rejects a non-member of the org", async () => {
    const { getOrganizationWithMembership } = await import(
      "@/lib/organization"
    );
    vi.mocked(getOrganizationWithMembership).mockResolvedValueOnce(null);

    const { response } = await callHealth();

    expect(response.status).toBe(403);
  });

  it("scopes the account query by the authenticated org, never by ID alone (cross-org isolation)", async () => {
    const { awsAccount } = await import("@wraps/db/schema/app");
    const { eq } = await import("drizzle-orm");
    // The mock itself always returns [] regardless of arguments, so it cannot
    // prove isolation on its own — the assertion below on the `where` clause
    // is what proves the route issued an organizationId-scoped query rather
    // than reading account rows unscoped or by account id alone.
    mockFindMany.mockResolvedValueOnce([]);

    await callHealth();

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: eq(awsAccount.organizationId, "org-1"),
      })
    );
  });

  it("returns unknown status with zero connected accounts", async () => {
    mockFindMany.mockResolvedValueOnce([]);

    const { data } = await callHealth();

    expect(data).toEqual({ status: "unknown", checkedAt: null, accounts: [] });
  });

  it("returns healthy status for one healthy account", async () => {
    mockFindMany.mockResolvedValueOnce([account({ healthStatus: "healthy" })]);

    const { data } = await callHealth();

    expect(data.status).toBe("healthy");
    expect(data.accounts).toHaveLength(1);
    expect(data.accounts[0].status).toBe("healthy");
  });

  it("rolls up healthy + at_risk to at_risk", async () => {
    mockFindMany.mockResolvedValueOnce([
      account({ id: "acc-1", healthStatus: "healthy" }),
      account({ id: "acc-2", healthStatus: "at_risk" }),
    ]);

    const { data } = await callHealth();

    expect(data.status).toBe("at_risk");
  });

  it("rolls up at_risk + in_danger to in_danger", async () => {
    mockFindMany.mockResolvedValueOnce([
      account({ id: "acc-1", healthStatus: "at_risk" }),
      account({ id: "acc-2", healthStatus: "in_danger" }),
    ]);

    const { data } = await callHealth();

    expect(data.status).toBe("in_danger");
  });

  it("rolls up healthy + never-checked to unknown, not healthy", async () => {
    mockFindMany.mockResolvedValueOnce([
      account({ id: "acc-1", healthStatus: "healthy" }),
      account({
        id: "acc-2",
        healthStatus: null,
        healthCheckedAt: null,
        healthDetail: null,
      }),
    ]);

    const { data } = await callHealth();

    expect(data.status).toBe("unknown");
  });

  it("reports the OLDEST checkedAt among accounts, not the newest", async () => {
    const older = new Date("2026-09-01T00:00:00.000Z");
    const newer = new Date("2026-09-04T00:00:00.000Z");
    mockFindMany.mockResolvedValueOnce([
      account({ id: "acc-1", healthCheckedAt: newer }),
      account({ id: "acc-2", healthCheckedAt: older }),
    ]);

    const { data } = await callHealth();

    expect(data.checkedAt).toBe(older.getTime());
  });
});
