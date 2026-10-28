/**
 * Event analytics for GET /v1/events/analytics.
 *
 * Lifted from `getEventAnalytics` in apps/web/src/actions/events.ts. The web
 * action is Next-only (orgAction, headers()), so the composition is copied
 * here rather than imported. Every query is org-scoped via `organizationId`
 * (the repository functions in @wraps/db/events take it as their first arg).
 */

import {
  countActiveContactsWithEvents,
  countAllContactEvents,
  countContactEventsInPeriod,
  getDailyContactEventCounts,
  getTopContactEventNames,
} from "@wraps/db";

export type EventAnalytics = {
  totalEvents: number;
  eventsThisPeriod: number;
  activeContacts: number;
  avgEventsPerContact: number;
  dailyEvents: Array<{ date: string; count: number }>;
  topEventNames: Array<{ name: string; count: number }>;
};

/**
 * `timezone` falls back to UTC when it is not a valid IANA name. The check is
 * the guard for `makeLocalTs` in packages/db, which interpolates the zone with
 * sql.raw: keep it before any query runs.
 */
export async function computeEventAnalytics(
  organizationId: string,
  days: 7 | 30,
  timezone: string,
  now: Date = new Date()
): Promise<EventAnalytics> {
  // Validate timezone — fall back to UTC if invalid
  let tz = timezone;
  try {
    Intl.DateTimeFormat("en-CA", { timeZone: tz });
  } catch {
    tz = "UTC";
  }

  // Compute date boundaries in user's timezone
  const todayStr = now.toLocaleDateString("en-CA", { timeZone: tz });
  const [y, m, d] = todayStr.split("-").map(Number);
  const startStr = new Date(Date.UTC(y, m - 1, d - days))
    .toISOString()
    .split("T")[0];

  const [
    totalEvents,
    eventsThisPeriod,
    activeContacts,
    dailyEventsData,
    topEventNamesData,
  ] = await Promise.all([
    countAllContactEvents(organizationId),
    countContactEventsInPeriod(organizationId, startStr, tz),
    countActiveContactsWithEvents(organizationId, startStr, tz),
    getDailyContactEventCounts(organizationId, startStr, tz),
    getTopContactEventNames(organizationId, startStr, tz, 5),
  ]);

  const avgEventsPerContact =
    activeContacts > 0
      ? Math.round((eventsThisPeriod / activeContacts) * 10) / 10
      : 0;

  // Fill in missing dates with 0 counts
  const dailyEvents: Array<{ date: string; count: number }> = [];
  const dateMap = new Map(dailyEventsData.map((row) => [row.date, row.count]));

  const [sy, sm, sd] = startStr.split("-").map(Number);
  const cursor = new Date(Date.UTC(sy, sm - 1, sd));
  const [ey, em, ed] = todayStr.split("-").map(Number);
  const endUTC = Date.UTC(ey, em - 1, ed);

  while (cursor.getTime() <= endUTC) {
    const dateStr = cursor.toISOString().split("T")[0];
    dailyEvents.push({
      date: dateStr,
      count: dateMap.get(dateStr) ?? 0,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return {
    totalEvents,
    eventsThisPeriod,
    activeContacts,
    avgEventsPerContact,
    dailyEvents,
    topEventNames: topEventNamesData,
  };
}
