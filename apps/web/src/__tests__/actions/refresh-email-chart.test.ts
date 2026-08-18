import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.fn();
vi.mock("@wraps/auth", () => ({
  auth: {
    api: { getSession: (...args: unknown[]) => mockGetSession(...args) },
  },
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const mockUpdateTag = vi.fn();
const mockRevalidateTag = vi.fn();
vi.mock("next/cache", () => ({
  updateTag: (...args: unknown[]) => mockUpdateTag(...args),
  revalidateTag: (...args: unknown[]) => mockRevalidateTag(...args),
}));

const mockGetOrg = vi.fn();
vi.mock("@/lib/organization", () => ({
  getOrganizationWithMembership: (...args: unknown[]) => mockGetOrg(...args),
}));

vi.mock("@/lib/logger", () => ({
  createActionLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }),
  serializeError: (e: unknown) => e,
}));

/**
 * Each test needs a clean module so the in-process cooldown map starts empty.
 */
async function loadAction() {
  vi.resetModules();
  const mod = await import("@/actions/analytics");
  return mod.refreshEmailChart;
}

describe("refreshEmailChart (F9)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ user: { id: "user-1" } });
    mockGetOrg.mockResolvedValue({ id: "org-uuid-1", slug: "test-org" });
  });

  it("expires the cache tag the chart route is wrapped in", async () => {
    const refreshEmailChart = await loadAction();

    const result = await refreshEmailChart("test-org");

    expect(result.ok).toBe(true);
    // The tag must match the route's `email-chart-${orgId}` exactly, and be
    // keyed by the org UUID rather than the slug, or it busts nothing.
    expect(mockUpdateTag).toHaveBeenCalledWith("email-chart-org-uuid-1");
    expect(mockUpdateTag).toHaveBeenCalledTimes(1);
  });

  it("uses updateTag, not revalidateTag's stale-while-revalidate path", async () => {
    const refreshEmailChart = await loadAction();

    await refreshEmailChart("test-org");

    // revalidateTag(tag, "max") would serve the stale payload once more, which
    // is the exact "spinner returns identical bytes" bug being fixed.
    expect(mockRevalidateTag).not.toHaveBeenCalled();
  });

  it("refuses an unauthenticated caller without touching the cache", async () => {
    mockGetSession.mockResolvedValue(null);
    const refreshEmailChart = await loadAction();

    const result = await refreshEmailChart("test-org");

    expect(result).toEqual({ ok: false, reason: "unauthorized" });
    expect(mockUpdateTag).not.toHaveBeenCalled();
  });

  it("refuses a user who is not a member of the org", async () => {
    mockGetOrg.mockResolvedValue(null);
    const refreshEmailChart = await loadAction();

    const result = await refreshEmailChart("someone-elses-org");

    expect(result).toEqual({ ok: false, reason: "unauthorized" });
    expect(mockUpdateTag).not.toHaveBeenCalled();
  });

  it("throttles a repeat refresh so CloudWatch cannot be hammered", async () => {
    const refreshEmailChart = await loadAction();

    const first = await refreshEmailChart("test-org");
    const second = await refreshEmailChart("test-org");

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    if (second.ok === false) {
      expect(second.reason).toBe("cooldown");
      expect(second.retryAfterSeconds).toBeGreaterThan(0);
      expect(second.retryAfterSeconds).toBeLessThanOrEqual(30);
    }
    // The second press must not have fanned out another invalidation.
    expect(mockUpdateTag).toHaveBeenCalledTimes(1);
  });

  it("throttles per org, not globally", async () => {
    const refreshEmailChart = await loadAction();

    mockGetOrg.mockResolvedValue({ id: "org-a", slug: "a" });
    const first = await refreshEmailChart("a");
    mockGetOrg.mockResolvedValue({ id: "org-b", slug: "b" });
    const second = await refreshEmailChart("b");

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(mockUpdateTag).toHaveBeenCalledWith("email-chart-org-a");
    expect(mockUpdateTag).toHaveBeenCalledWith("email-chart-org-b");
  });

  it("reports failure instead of throwing into the client", async () => {
    mockGetOrg.mockRejectedValue(new Error("db down"));
    const refreshEmailChart = await loadAction();

    const result = await refreshEmailChart("test-org");

    expect(result).toEqual({ ok: false, reason: "error" });
  });
});
