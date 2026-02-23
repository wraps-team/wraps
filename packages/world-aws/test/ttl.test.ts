import { describe, expect, it } from "vitest";
import { computeTTL } from "../src/dynamodb/ttl.js";

describe("computeTTL", () => {
  it("returns undefined when ttlSeconds is undefined", () => {
    expect(computeTTL(undefined, "2024-01-01T00:00:00.000Z")).toBeUndefined();
  });

  it("returns correct epoch when ttlSeconds is set", () => {
    const now = "2024-01-01T00:00:00.000Z";
    const nowEpoch = Math.floor(new Date(now).getTime() / 1000);
    const ttlSeconds = 86_400; // 1 day

    const result = computeTTL(ttlSeconds, now);

    expect(result).toBe(nowEpoch + ttlSeconds);
  });

  it("handles zero ttlSeconds", () => {
    const now = "2024-06-15T12:00:00.000Z";
    const nowEpoch = Math.floor(new Date(now).getTime() / 1000);

    expect(computeTTL(0, now)).toBe(nowEpoch);
  });

  it("handles large ttlSeconds (90 days)", () => {
    const now = "2024-01-01T00:00:00.000Z";
    const nowEpoch = Math.floor(new Date(now).getTime() / 1000);
    const ninetyDays = 90 * 86_400;

    expect(computeTTL(ninetyDays, now)).toBe(nowEpoch + ninetyDays);
  });
});
