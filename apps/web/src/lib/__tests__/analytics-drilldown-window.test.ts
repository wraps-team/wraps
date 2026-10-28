import { describe, expect, it } from "vitest";
import {
  buildDrilldownHref,
  DRILLDOWN_DEFAULT_DAYS,
  DRILLDOWN_METRIC_LABEL,
  describeDrilldownWindow,
  parseDrilldownWindow,
  validateDrilldownParams,
} from "../analytics-drilldown-window";

const NOW = new Date("2026-10-28T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

describe("parseDrilldownWindow (lenient, for URL state)", () => {
  it("rolling window is now minus days times 24h, matching the bounces route", () => {
    const w = parseDrilldownWindow({ days: "30" }, NOW);
    expect(w.days).toBe(30);
    expect(w.endTime.getTime()).toBe(NOW.getTime());
    expect(w.startTime.getTime()).toBe(NOW.getTime() - 30 * DAY_MS);
    expect(w.startTime.toISOString()).toBe("2026-09-28T12:00:00.000Z");
  });

  it("day mode keeps the rolling window and adds the day filter", () => {
    const rolling = parseDrilldownWindow({ days: "7" }, NOW);
    const dayMode = parseDrilldownWindow({ days: "7", day: "2026-10-20" }, NOW);
    expect(dayMode.day).toBe("2026-10-20");
    expect(dayMode.startTime.getTime()).toBe(rolling.startTime.getTime());
    expect(dayMode.endTime.getTime()).toBe(rolling.endTime.getTime());
    expect(dayMode.days).toBe(7);
  });

  it("falls back to the default days (30) for values outside 1 to 90", () => {
    expect(parseDrilldownWindow({ days: "0" }, NOW).days).toBe(30);
    expect(parseDrilldownWindow({ days: "91" }, NOW).days).toBe(30);
    expect(parseDrilldownWindow({ days: "abc" }, NOW).days).toBe(30);
    expect(parseDrilldownWindow({ days: "30abc" }, NOW).days).toBe(30);
    expect(parseDrilldownWindow({ days: "-5" }, NOW).days).toBe(30);
    expect(parseDrilldownWindow({ days: "7.5" }, NOW).days).toBe(30);
    expect(parseDrilldownWindow({ days: "90" }, NOW).days).toBe(90);
    expect(parseDrilldownWindow({ days: "1" }, NOW).days).toBe(1);
    expect(DRILLDOWN_DEFAULT_DAYS).toBe(30);
  });

  it("falls back to rolling mode for a day that is not a real calendar date", () => {
    expect(parseDrilldownWindow({ day: "2026-02-30" }, NOW).day).toBeNull();
    expect(parseDrilldownWindow({ day: "2026-13-01" }, NOW).day).toBeNull();
    expect(parseDrilldownWindow({ day: "20-10-2026" }, NOW).day).toBeNull();
    expect(parseDrilldownWindow({ day: "2026-10-20" }, NOW).day).toBe(
      "2026-10-20"
    );
  });

  it("falls back to UTC for an invalid timezone, as validateTimezone does", () => {
    expect(parseDrilldownWindow({ tz: "Not/AZone" }, NOW).tz).toBe("UTC");
    expect(parseDrilldownWindow({ tz: "" }, NOW).tz).toBe("UTC");
    expect(parseDrilldownWindow({}, NOW).tz).toBe("UTC");
    expect(parseDrilldownWindow({ tz: "America/New_York" }, NOW).tz).toBe(
      "America/New_York"
    );
  });

  it("defaults to days 30, day null and tz UTC when no params are given", () => {
    const w = parseDrilldownWindow({}, NOW);
    expect(w).toMatchObject({ days: 30, day: null, tz: "UTC" });
  });
});

describe("validateDrilldownParams (strict, for the route)", () => {
  it("returns a window for valid params", () => {
    const r = validateDrilldownParams(
      {
        metric: "complaint",
        by: "from",
        days: "14",
        day: "2026-10-20",
        tz: "Europe/Paris",
      },
      NOW
    );
    expect(r.ok).toBe(true);
    if (!r.ok) {
      return;
    }
    expect(r.metric).toBe("complaint");
    expect(r.by).toBe("from");
    expect(r.window).toMatchObject({
      days: 14,
      day: "2026-10-20",
      tz: "Europe/Paris",
    });
  });

  it("uses defaults for absent metric, by and days", () => {
    const r = validateDrilldownParams({}, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) {
      return;
    }
    expect(r.metric).toBe("bounce");
    expect(r.by).toBe("broadcast");
    expect(r.window.days).toBe(30);
    expect(r.window.day).toBeNull();
  });

  it("rejects days outside 1 to 90, and non-integer days, with 400 wording", () => {
    for (const days of ["0", "91", "abc", "30abc", "7.5"]) {
      const r = validateDrilldownParams({ days }, NOW);
      expect(r).toEqual({ ok: false, error: "days must be between 1 and 90" });
    }
  });

  it("rejects a day that is not a real calendar date", () => {
    for (const day of ["2026-02-30", "2026-13-01", "2026-1-1"]) {
      const r = validateDrilldownParams({ day }, NOW);
      expect(r).toEqual({ ok: false, error: "day must be a YYYY-MM-DD date" });
    }
  });

  it("rejects an unknown metric or by value", () => {
    expect(validateDrilldownParams({ metric: "reasons" }, NOW)).toEqual({
      ok: false,
      error: "metric must be bounce, complaint or suppression",
    });
    expect(validateDrilldownParams({ by: "domain" }, NOW)).toEqual({
      ok: false,
      error: "by must be broadcast, workflow, template or from",
    });
  });

  it("passes an invalid timezone through as UTC, without an error", () => {
    const r = validateDrilldownParams({ tz: "Not/AZone" }, NOW);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.window.tz).toBe("UTC");
    }
  });
});

describe("buildDrilldownHref", () => {
  it("builds a rolling link with metric, days and tz", () => {
    expect(
      buildDrilldownHref("acme", {
        metric: "bounce",
        days: 30,
        tz: "America/New_York",
      })
    ).toBe(
      "/acme/emails/analytics/drilldown?metric=bounce&days=30&tz=America%2FNew_York"
    );
  });

  it("adds the day when given, and omits it otherwise", () => {
    expect(
      buildDrilldownHref("acme", {
        metric: "complaint",
        days: 7,
        day: "2026-10-20",
        tz: "UTC",
      })
    ).toBe(
      "/acme/emails/analytics/drilldown?metric=complaint&days=7&day=2026-10-20&tz=UTC"
    );
  });
});

describe("describeDrilldownWindow", () => {
  it("labels a one-day rolling window as the last 24 hours", () => {
    const w = parseDrilldownWindow({ days: "1" }, NOW);
    expect(describeDrilldownWindow(w)).toBe("the last 24 hours");
  });

  it("labels a rolling window of N days as the last N days", () => {
    expect(
      describeDrilldownWindow(parseDrilldownWindow({ days: "30" }, NOW))
    ).toBe("the last 30 days");
    expect(
      describeDrilldownWindow(parseDrilldownWindow({ days: "7" }, NOW))
    ).toBe("the last 7 days");
  });

  it("labels day mode as the sent-on date in the window's timezone", () => {
    const w = parseDrilldownWindow(
      { days: "30", day: "2026-10-20", tz: "America/New_York" },
      NOW
    );
    expect(describeDrilldownWindow(w)).toBe("sent on Oct 20, 2026");
  });

  it("names each metric for the page title and summary", () => {
    expect(DRILLDOWN_METRIC_LABEL).toEqual({
      bounce: "Bounce rate",
      complaint: "Complaint rate",
      suppression: "Suppression rate",
    });
  });
});
