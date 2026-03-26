import { describe, expect, it } from "vitest";
import {
  amountUnitToSeconds,
  formatDurationCompact,
  formatDurationVerbose,
  parseDurationToAmountUnit,
  toSafeRedirectPath,
} from "../utils";

// ═══════════════════════════════════════════════════════════════════════════
// parseDurationToAmountUnit TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("parseDurationToAmountUnit", () => {
  it("should return fallback defaults for 0 seconds", () => {
    const result = parseDurationToAmountUnit(0);

    expect(result).toEqual({ amount: 1, unit: "hours" });
  });

  it("should return custom fallback for 0 seconds when provided", () => {
    const result = parseDurationToAmountUnit(0, {
      amount: 5,
      unit: "minutes",
    });

    expect(result).toEqual({ amount: 5, unit: "minutes" });
  });

  it("should return hours fallback for small non-zero seconds (< 60)", () => {
    // 30 seconds is below the 60-second threshold, so it falls through
    // to the small-value handler: Math.max(1, Math.round(30/3600)) = 1 hour
    const result = parseDurationToAmountUnit(30);

    expect(result).toEqual({ amount: 1, unit: "hours" });
  });

  it("should parse 60 seconds as 1 minute", () => {
    const result = parseDurationToAmountUnit(60);

    expect(result).toEqual({ amount: 1, unit: "minutes" });
  });

  it("should parse 3600 seconds as 1 hour", () => {
    const result = parseDurationToAmountUnit(3600);

    expect(result).toEqual({ amount: 1, unit: "hours" });
  });

  it("should parse 86400 seconds as 1 day", () => {
    const result = parseDurationToAmountUnit(86_400);

    expect(result).toEqual({ amount: 1, unit: "days" });
  });

  it("should parse 7200 seconds as 2 hours", () => {
    const result = parseDurationToAmountUnit(7200);

    expect(result).toEqual({ amount: 2, unit: "hours" });
  });

  it("should parse 5400 seconds (90 min) as 1 hour (floors to hours)", () => {
    // 5400 >= 3600, so it takes the hours branch: Math.floor(5400/3600) = 1
    const result = parseDurationToAmountUnit(5400);

    expect(result).toEqual({ amount: 1, unit: "hours" });
  });

  it("should parse 172800 seconds as 2 days", () => {
    const result = parseDurationToAmountUnit(172_800);

    expect(result).toEqual({ amount: 2, unit: "days" });
  });

  it("should parse 120 seconds as 2 minutes", () => {
    const result = parseDurationToAmountUnit(120);

    expect(result).toEqual({ amount: 2, unit: "minutes" });
  });

  it("should floor partial days (e.g. 90000s = 1 day)", () => {
    // 90000 / 86400 = 1.041... -> Math.floor = 1
    const result = parseDurationToAmountUnit(90_000);

    expect(result).toEqual({ amount: 1, unit: "days" });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// amountUnitToSeconds TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("amountUnitToSeconds", () => {
  it("should return raw amount for seconds (default case)", () => {
    const result = amountUnitToSeconds(1, "seconds");

    expect(result).toBe(1);
  });

  it("should convert 1 minute to 60 seconds", () => {
    const result = amountUnitToSeconds(1, "minutes");

    expect(result).toBe(60);
  });

  it("should convert 1 hour to 3600 seconds", () => {
    const result = amountUnitToSeconds(1, "hours");

    expect(result).toBe(3600);
  });

  it("should convert 1 day to 86400 seconds", () => {
    const result = amountUnitToSeconds(1, "days");

    expect(result).toBe(86_400);
  });

  it("should return 0 for 0 amount regardless of unit", () => {
    expect(amountUnitToSeconds(0, "hours")).toBe(0);
    expect(amountUnitToSeconds(0, "minutes")).toBe(0);
    expect(amountUnitToSeconds(0, "days")).toBe(0);
  });

  it("should handle multiple units correctly", () => {
    expect(amountUnitToSeconds(5, "minutes")).toBe(300);
    expect(amountUnitToSeconds(24, "hours")).toBe(86_400);
    expect(amountUnitToSeconds(7, "days")).toBe(604_800);
  });

  it("should return raw amount for unknown unit (default case)", () => {
    const result = amountUnitToSeconds(42, "unknown");

    expect(result).toBe(42);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// formatDurationCompact TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("formatDurationCompact", () => {
  it("should format 60 seconds as '1m'", () => {
    expect(formatDurationCompact(60)).toBe("1m");
  });

  it("should format 3600 seconds as '1h'", () => {
    expect(formatDurationCompact(3600)).toBe("1h");
  });

  it("should format 86400 seconds as '1d'", () => {
    expect(formatDurationCompact(86_400)).toBe("1d");
  });

  it("should format 90 seconds as '1m' (floors to minutes)", () => {
    // 90 >= 60 -> Math.floor(90/60) = 1
    expect(formatDurationCompact(90)).toBe("1m");
  });

  it("should format small values in seconds", () => {
    expect(formatDurationCompact(30)).toBe("30s");
    expect(formatDurationCompact(1)).toBe("1s");
    expect(formatDurationCompact(0)).toBe("0s");
  });

  it("should format multi-unit values using largest applicable unit", () => {
    expect(formatDurationCompact(7200)).toBe("2h");
    expect(formatDurationCompact(172_800)).toBe("2d");
    expect(formatDurationCompact(300)).toBe("5m");
  });

  it("should floor partial units", () => {
    // 5400s = 1.5h -> floors to 1h
    expect(formatDurationCompact(5400)).toBe("1h");
    // 90000s = 1.04d -> floors to 1d
    expect(formatDurationCompact(90_000)).toBe("1d");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// formatDurationVerbose TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("formatDurationVerbose", () => {
  it("should format 3600 seconds as '1 hour'", () => {
    expect(formatDurationVerbose(3600)).toBe("1 hour");
  });

  it("should format 7200 seconds as '2 hours'", () => {
    expect(formatDurationVerbose(7200)).toBe("2 hours");
  });

  it("should format 86400 seconds as '1 day'", () => {
    expect(formatDurationVerbose(86_400)).toBe("1 day");
  });

  it("should format 172800 seconds as '2 days'", () => {
    expect(formatDurationVerbose(172_800)).toBe("2 days");
  });

  it("should format 60 seconds as '1 min'", () => {
    expect(formatDurationVerbose(60)).toBe("1 min");
  });

  it("should format 120 seconds as '2 mins'", () => {
    expect(formatDurationVerbose(120)).toBe("2 mins");
  });

  it("should format small values in seconds", () => {
    expect(formatDurationVerbose(30)).toBe("30 secs");
    expect(formatDurationVerbose(1)).toBe("1 sec");
    expect(formatDurationVerbose(0)).toBe("0 secs");
  });

  it("should floor partial units and use largest applicable unit", () => {
    // 5400s = 1.5h -> "1 hour"
    expect(formatDurationVerbose(5400)).toBe("1 hour");
    // 90000s = 1.04d -> "1 day"
    expect(formatDurationVerbose(90_000)).toBe("1 day");
  });
});

describe("toSafeRedirectPath", () => {
  it("returns fallback for null or empty values", () => {
    expect(toSafeRedirectPath(null, "/dashboard")).toBe("/dashboard");
    expect(toSafeRedirectPath("", "/dashboard")).toBe("/dashboard");
    expect(toSafeRedirectPath("   ", "/dashboard")).toBe("/dashboard");
  });

  it("allows relative in-app paths", () => {
    expect(toSafeRedirectPath("/onboarding", "/")).toBe("/onboarding");
    expect(toSafeRedirectPath("/device?user_code=abc", "/")).toBe(
      "/device?user_code=abc"
    );
    expect(toSafeRedirectPath("/invitations/test#section", "/")).toBe(
      "/invitations/test#section"
    );
  });

  it("rejects absolute and protocol-relative URLs", () => {
    expect(toSafeRedirectPath("https://evil.example/phish", "/")).toBe("/");
    expect(toSafeRedirectPath("javascript:alert(1)", "/")).toBe("/");
    expect(toSafeRedirectPath("//evil.example/path", "/")).toBe("/");
  });
});
