import { describe, expect, it } from "vitest";
import {
  getBannerLevel,
  getOverallLevel,
  type HealthLevel,
  SES_STATUS_LEVEL,
} from "../health-level";

describe("getOverallLevel", () => {
  it("reports the worst level present", () => {
    expect(getOverallLevel(["healthy", "warning", "critical"])).toBe(
      "critical"
    );
    expect(getOverallLevel(["healthy", "warning"])).toBe("warning");
    expect(getOverallLevel(["healthy", "healthy"])).toBe("healthy");
  });

  it("ranks unknown above healthy, so one unchecked account is not 'all healthy'", () => {
    // The regression this guards: the banner used to read "All systems
    // healthy" while an account nobody could check sat beside it.
    expect(getOverallLevel(["healthy", "unknown"])).toBe("unknown");
  });

  it("still lets a real problem outrank an unchecked account", () => {
    expect(getOverallLevel(["unknown", "warning"])).toBe("warning");
    expect(getOverallLevel(["unknown", "critical"])).toBe("critical");
  });
});

describe("getBannerLevel", () => {
  it("never reports healthy while the verdict is still loading", () => {
    expect(getBannerLevel(["healthy"], true)).toBe("unknown");
  });

  it("never reports healthy when no channel measured anything", () => {
    // The old fallback was `channels.length > 0 ? ... : "healthy"`, which
    // turned "we know nothing" into a green bar.
    expect(getBannerLevel([], false)).toBe("unknown");
  });

  it("passes real verdicts through once loaded", () => {
    expect(getBannerLevel(["healthy", "healthy"], false)).toBe("healthy");
    expect(getBannerLevel(["healthy", "critical"], false)).toBe("critical");
  });
});

describe("SES_STATUS_LEVEL", () => {
  it.each([
    ["healthy", "healthy"],
    ["at_risk", "warning"],
    ["in_danger", "critical"],
    ["unknown", "unknown"],
  ])("maps sweep status %s to banner level %s", (status, expected) => {
    expect(SES_STATUS_LEVEL[status]).toBe(expected);
  });

  it("has no mapping for an unrecognised status, so callers fall back to unknown", () => {
    const level: HealthLevel | undefined = SES_STATUS_LEVEL.something_new;
    expect(level).toBeUndefined();
  });
});
