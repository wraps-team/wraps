import { describe, expect, it } from "vitest";
import { getRoleStatus } from "../role-status";

const now = new Date("2026-09-30T12:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000);

describe("getRoleStatus", () => {
  it("reads 'Not checked yet' and needs no repair when the role was never reached", () => {
    const status = getRoleStatus({
      lastReachableAt: null,
      consolePolicyVersion: null,
      consolePolicyCheckedAt: null,
      now,
    });

    expect(status.label).toBe("Not checked yet");
    expect(status.level).toBe("unknown");
    expect(status.needsRepair).toBe(false);
  });

  it("is Unreachable and needs repair when last reached 4 hours ago", () => {
    const status = getRoleStatus({
      lastReachableAt: hoursAgo(4),
      consolePolicyVersion: null,
      consolePolicyCheckedAt: null,
      now,
    });

    expect(status.label).toBe("Unreachable");
    expect(status.level).toBe("critical");
    expect(status.needsRepair).toBe(true);
  });

  it("needs repair when reachable but the policy is behind", () => {
    const status = getRoleStatus({
      lastReachableAt: hoursAgo(1),
      consolePolicyVersion: 5,
      consolePolicyCheckedAt: hoursAgo(1),
      now,
    });

    expect(status.level).toBe("warning");
    expect(status.label).toBe("Policy outdated");
    expect(status.needsRepair).toBe(true);
    expect(status.detail).toContain("policy v5 of 6");
  });

  it("is healthy and needs no repair when reachable on the current policy", () => {
    const status = getRoleStatus({
      lastReachableAt: hoursAgo(1),
      consolePolicyVersion: 6,
      consolePolicyCheckedAt: hoursAgo(1),
      now,
    });

    expect(status.level).toBe("healthy");
    expect(status.label).toBe("Reachable");
    expect(status.needsRepair).toBe(false);
    expect(status.detail).toContain("Last reached");
  });
});
