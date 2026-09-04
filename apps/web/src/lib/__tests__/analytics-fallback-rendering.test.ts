import { describe, expect, it, vi } from "vitest";

// Mock @wraps/db's queryMessageMetricBuckets (the aggregation now lives
// there, tested for real in packages/db) rather than the raw Drizzle chain —
// getEmailMetricsFromPostgres delegates to it instead of building SQL itself.
const { mockQueryMessageMetricBuckets } = vi.hoisted(() => ({
  mockQueryMessageMetricBuckets: vi.fn().mockResolvedValue([
    {
      period: "2026-04-10",
      sent: 111,
      delivered: 110,
      bounced: 1,
      bouncedPermanent: 0,
      bouncedTransient: 0,
      bouncedUndetermined: 0,
      complained: 0,
      suppressed: 0,
      opened: 20,
      openedRaw: 20,
      clicked: 5,
      failed: 13,
    },
  ]),
}));

vi.mock("@wraps/db", () => ({
  queryMessageMetricBuckets: mockQueryMessageMetricBuckets,
}));

describe("getEmailMetricsFromPostgres", () => {
  it("returns renderingFailures in the DailyEmailMetrics type", async () => {
    const { getEmailMetricsFromPostgres } = await import(
      "../analytics-fallback"
    );

    const result = await getEmailMetricsFromPostgres(
      "org-1",
      new Date("2026-04-01"),
      new Date("2026-04-10")
    );

    const entry = result.get("2026-04-10");
    expect(entry).toBeDefined();
    expect(entry).toHaveProperty("renderingFailures");
    expect(entry!.renderingFailures).toBe(13);
    // sent should NOT include rendering failures (111, not 124)
    expect(entry!.sent).toBe(111);
  });
});
