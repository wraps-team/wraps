/**
 * Window and URL-state parsing for the bounce drill-down.
 *
 * Pure: no React, no database. The client shell uses the lenient parser for
 * URL state; the sends route uses the strict validator and returns 400 on
 * anything it rejects. Both build the same DrilldownWindow.
 */

import { validateTimezone } from "./analytics-utils";

export type DrilldownMetric = "bounce" | "complaint" | "suppression";
export type DrilldownBy = "broadcast" | "workflow" | "template" | "from";

export const DRILLDOWN_METRICS: readonly DrilldownMetric[] = [
  "bounce",
  "complaint",
  "suppression",
];
export const DRILLDOWN_BY: readonly DrilldownBy[] = [
  "broadcast",
  "workflow",
  "template",
  "from",
];

export const DRILLDOWN_DEFAULT_DAYS = 30;
export const DRILLDOWN_MAX_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;
const DIGITS_ONLY = /^\d+$/;
const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * The one window type every tab and every query consumes.
 * `startTime` = `endTime` - days * 24h. `endTime` is the `now` captured once
 * when the window was parsed. `day` is a `YYYY-MM-DD` local date in `tz`, or
 * null for rolling mode. It is a filter on top of the rolling window, never a
 * replacement for it.
 */
export type DrilldownWindow = {
  days: number;
  startTime: Date;
  endTime: Date;
  day: string | null;
  tz: string;
};

export type DrilldownRawParams = {
  metric?: string | null;
  by?: string | null;
  days?: string | null;
  day?: string | null;
  tz?: string | null;
};

/** Returns the value only when it is a real calendar date, else null. */
function parseRealDay(value: string): string | null {
  const match = ISO_DAY.exec(value);
  if (!match) {
    return null;
  }
  const [year, month, dayOfMonth] = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  ];
  const probe = new Date(Date.UTC(year, month - 1, dayOfMonth));
  const isReal =
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === dayOfMonth;
  return isReal ? value : null;
}

function buildWindow(
  days: number,
  day: string | null,
  tz: string,
  now: Date
): DrilldownWindow {
  return {
    days,
    startTime: new Date(now.getTime() - days * DAY_MS),
    endTime: now,
    day,
    tz,
  };
}

function isValidDays(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= DRILLDOWN_MAX_DAYS;
}

/**
 * Lenient parser for URL state. Never throws, and never returns an error: an
 * invalid field becomes its default.
 */
export function parseDrilldownWindow(
  params: { days?: string | null; day?: string | null; tz?: string | null },
  now: Date
): DrilldownWindow {
  const rawDays = params.days ?? "";
  const parsedDays = DIGITS_ONLY.test(rawDays) ? Number(rawDays) : Number.NaN;
  const days = isValidDays(parsedDays) ? parsedDays : DRILLDOWN_DEFAULT_DAYS;

  const rawDay = params.day ?? "";
  const day = rawDay ? parseRealDay(rawDay) : null;

  return buildWindow(days, day, validateTimezone(params.tz), now);
}

export type DrilldownValidation =
  | {
      ok: true;
      metric: DrilldownMetric;
      by: DrilldownBy;
      window: DrilldownWindow;
    }
  | { ok: false; error: string };

/**
 * Strict validator for the sends route. Absent values take their defaults;
 * present values that fail are rejected with the 400 message from the spec.
 * A timezone is never rejected: it falls back to UTC, as the other analytics
 * routes do.
 */
export function validateDrilldownParams(
  params: DrilldownRawParams,
  now: Date
): DrilldownValidation {
  const metric = params.metric || "bounce";
  if (!(DRILLDOWN_METRICS as readonly string[]).includes(metric)) {
    return {
      ok: false,
      error: "metric must be bounce, complaint or suppression",
    };
  }

  const by = params.by || "broadcast";
  if (!(DRILLDOWN_BY as readonly string[]).includes(by)) {
    return {
      ok: false,
      error: "by must be broadcast, workflow, template or from",
    };
  }

  let days = DRILLDOWN_DEFAULT_DAYS;
  if (params.days) {
    const parsed = DIGITS_ONLY.test(params.days)
      ? Number(params.days)
      : Number.NaN;
    if (!isValidDays(parsed)) {
      return { ok: false, error: "days must be between 1 and 90" };
    }
    days = parsed;
  }

  let day: string | null = null;
  if (params.day) {
    day = parseRealDay(params.day);
    if (day === null) {
      return { ok: false, error: "day must be a YYYY-MM-DD date" };
    }
  }

  return {
    ok: true,
    metric: metric as DrilldownMetric,
    by: by as DrilldownBy,
    window: buildWindow(days, day, validateTimezone(params.tz), now),
  };
}

/**
 * Builds the drill-down link used by the analytics entry points. Keys are
 * written in one fixed order so the same window always yields the same URL.
 */
export function buildDrilldownHref(
  orgSlug: string,
  args: {
    metric: DrilldownMetric;
    days: number;
    day?: string | null;
    tz: string;
  }
): string {
  const search = new URLSearchParams({
    metric: args.metric,
    days: String(args.days),
  });
  if (args.day) {
    search.set("day", args.day);
  }
  search.set("tz", args.tz);
  return `/${orgSlug}/emails/analytics/drilldown?${search.toString()}`;
}
