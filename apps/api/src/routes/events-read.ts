/**
 * Event read routes: GET /v1/events, /v1/events/analytics, /v1/events/names,
 * /v1/events/:id.
 *
 * Lifted from apps/web/src/actions/events.ts (listEvents, getEventAnalytics,
 * getEventNames, getEvent). Read-only, so no mutation gate and no event-limit:
 * enforceEventLimit meters ingestion (POST in events.ts) and must not run here.
 * Permission matches the actions: resource "contacts", action "read".
 *
 * Kept in its own file because events.ts applies planGateMiddleware and
 * enforceEventLimit to every route in its group. Both prefixes are /v1/events;
 * the methods do not overlap, so mount order between the two files does not
 * change which handler answers (see the events-read-api-db test).
 */

import {
  type EventFilters,
  getContactEvent,
  listContactEvents,
  listDistinctEventNames,
} from "@wraps/db";
import { t } from "elysia";
import { requirePermission } from "../lib/require-permission";
import { createAuthenticatedRoutes, getAuth } from "../middleware/auth";
import { computeEventAnalytics } from "../services/event-analytics";

const errorResponse = t.Object({ error: t.String() });

const eventSchema = t.Object({
  id: t.String(),
  eventName: t.String(),
  eventData: t.Nullable(t.Record(t.String(), t.Unknown())),
  createdAt: t.String({ description: "ISO 8601 timestamp" }),
  contactId: t.String(),
  contactEmail: t.Nullable(t.String()),
  contactFirstName: t.Nullable(t.String()),
  contactLastName: t.Nullable(t.String()),
});

const analyticsSchema = t.Object({
  totalEvents: t.Number(),
  eventsThisPeriod: t.Number(),
  activeContacts: t.Number(),
  avgEventsPerContact: t.Number(),
  dailyEvents: t.Array(t.Object({ date: t.String(), count: t.Number() })),
  topEventNames: t.Array(t.Object({ name: t.String(), count: t.Number() })),
});

const MAX_TEXT_FILTER = 255;
const DIGITS_ONLY = /^\d+$/;

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/** Integer query param in [min, max]; absent or empty returns the fallback. */
function parseIntParam(
  raw: string | undefined,
  opts: { name: string; min: number; max: number; fallback: number }
): Parsed<number> {
  const { name, min, max, fallback } = opts;
  if (raw === undefined || raw === "") {
    return { ok: true, value: fallback };
  }
  const n = DIGITS_ONLY.test(raw) ? Number(raw) : Number.NaN;
  if (!(Number.isSafeInteger(n) && n >= min && n <= max)) {
    return {
      ok: false,
      error: `${name} must be an integer between ${min} and ${max}`,
    };
  }
  return { ok: true, value: n };
}

function parseTextFilter(
  raw: string | undefined,
  name: string
): Parsed<string | undefined> {
  if (raw === undefined || raw === "") {
    return { ok: true, value: undefined };
  }
  if (raw.length > MAX_TEXT_FILTER) {
    return {
      ok: false,
      error: `${name} must be at most ${MAX_TEXT_FILTER} characters`,
    };
  }
  return { ok: true, value: raw };
}

function parseDateParam(
  raw: string | undefined,
  name: string
): Parsed<Date | undefined> {
  if (raw === undefined || raw === "") {
    return { ok: true, value: undefined };
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    return {
      ok: false,
      error: `${name} must be an ISO 8601 date-time, for example 2026-01-31T00:00:00Z`,
    };
  }
  return { ok: true, value: d };
}

function toEventJson<
  E extends { createdAt: Date; eventData: Record<string, unknown> | null },
>(event: E) {
  return { ...event, createdAt: event.createdAt.toISOString() };
}

export const eventsReadRoutes = createAuthenticatedRoutes("/v1/events")
  /**
   * List events for the org, newest first. Filters match the dashboard's
   * ListEventsOptions: eventName, search (event name, event data, contact),
   * contactEmail, dateFrom and dateTo.
   */
  .get(
    "/",
    async (ctx) => {
      const { query, set } = ctx;
      const authContext = getAuth(ctx);
      const gate = await requirePermission(ctx, "contacts", ["read"]);
      if (!gate.ok) {
        return gate.body;
      }

      const page = parseIntParam(query.page, {
        name: "page",
        min: 1,
        max: 1_000_000,
        fallback: 1,
      });
      const pageSize = parseIntParam(query.pageSize, {
        name: "pageSize",
        min: 1,
        max: 100,
        fallback: 50,
      });
      const search = parseTextFilter(query.search, "search");
      const eventName = parseTextFilter(query.eventName, "eventName");
      const contactEmail = parseTextFilter(query.contactEmail, "contactEmail");
      const dateFrom = parseDateParam(query.dateFrom, "dateFrom");
      const dateTo = parseDateParam(query.dateTo, "dateTo");

      for (const p of [
        page,
        pageSize,
        search,
        eventName,
        contactEmail,
        dateFrom,
        dateTo,
      ]) {
        if (!p.ok) {
          set.status = 400;
          return { error: p.error };
        }
      }

      const filters: EventFilters = {
        search: search.ok ? search.value : undefined,
        eventName: eventName.ok ? eventName.value : undefined,
        contactEmail: contactEmail.ok ? contactEmail.value : undefined,
        dateFrom: dateFrom.ok ? dateFrom.value : undefined,
        dateTo: dateTo.ok ? dateTo.value : undefined,
      };

      const pageValue = page.ok ? page.value : 1;
      const pageSizeValue = pageSize.ok ? pageSize.value : 50;
      const { events, total } = await listContactEvents(
        authContext.organizationId,
        filters,
        { page: pageValue, pageSize: pageSizeValue }
      );

      return {
        events: events.map(toEventJson),
        total,
        page: pageValue,
        pageSize: pageSizeValue,
      };
    },
    {
      query: t.Object({
        page: t.Optional(t.String({ description: "Page number (1-indexed)" })),
        pageSize: t.Optional(
          t.String({ description: "Items per page (1-100, default 50)" })
        ),
        eventName: t.Optional(t.String({ description: "Exact event name" })),
        search: t.Optional(
          t.String({
            description:
              "Case-insensitive match on event name, event data, or contact name/email (max 255)",
          })
        ),
        contactEmail: t.Optional(
          t.String({ description: "Case-insensitive contact email match" })
        ),
        dateFrom: t.Optional(
          t.String({ description: "ISO 8601 lower bound on createdAt" })
        ),
        dateTo: t.Optional(
          t.String({ description: "ISO 8601 upper bound on createdAt" })
        ),
      }),
      response: {
        200: t.Object({
          events: t.Array(eventSchema),
          total: t.Number(),
          page: t.Number(),
          pageSize: t.Number(),
        }),
        400: errorResponse,
        403: errorResponse,
      },
      detail: {
        tags: ["events"],
        summary: "List events",
        description:
          "Paginated contact events for the organization, newest first. Requires contacts:read.",
      },
    }
  )

  /**
   * Event analytics: totals, the period count and active contacts, a daily
   * series (zero-filled), and the top five event names. `days` is 7 or 30.
   * `timezone` is an IANA name; an invalid one falls back to UTC.
   */
  .get(
    "/analytics",
    async (ctx) => {
      const { query, set } = ctx;
      const authContext = getAuth(ctx);
      const gate = await requirePermission(ctx, "contacts", ["read"]);
      if (!gate.ok) {
        return gate.body;
      }

      const days =
        query.days === undefined || query.days === "" ? 30 : Number(query.days);
      if (days !== 7 && days !== 30) {
        set.status = 400;
        return { error: "days must be 7 or 30" };
      }

      const analytics = await computeEventAnalytics(
        authContext.organizationId,
        days,
        query.timezone || "UTC"
      );
      return analytics;
    },
    {
      query: t.Object({
        days: t.Optional(
          t.String({ description: "Window in days: 7 or 30 (default 30)" })
        ),
        timezone: t.Optional(
          t.String({
            description:
              "IANA timezone for day boundaries (default UTC; invalid values fall back to UTC)",
            maxLength: 64,
          })
        ),
      }),
      response: {
        200: analyticsSchema,
        400: errorResponse,
        403: errorResponse,
      },
      detail: {
        tags: ["events"],
        summary: "Event analytics",
        description:
          "Totals, period count, active contacts, a zero-filled daily series and top event names for the last 7 or 30 days. Requires contacts:read.",
      },
    }
  )

  /** Distinct event names for the org, sorted. */
  .get(
    "/names",
    async (ctx) => {
      const authContext = getAuth(ctx);
      const gate = await requirePermission(ctx, "contacts", ["read"]);
      if (!gate.ok) {
        return gate.body;
      }

      const eventNames = await listDistinctEventNames(
        authContext.organizationId
      );
      return { eventNames };
    },
    {
      response: {
        200: t.Object({ eventNames: t.Array(t.String()) }),
        403: errorResponse,
      },
      detail: {
        tags: ["events"],
        summary: "List event names",
        description:
          "Distinct event names recorded for the organization, sorted. Requires contacts:read.",
      },
    }
  )

  /**
   * One event by id. Scoped to the org on both the event row and its contact,
   * so another org's event id is a 404.
   */
  .get(
    "/:id",
    async (ctx) => {
      const { params, set } = ctx;
      const authContext = getAuth(ctx);
      const gate = await requirePermission(ctx, "contacts", ["read"]);
      if (!gate.ok) {
        return gate.body;
      }

      const event = await getContactEvent(
        params.id,
        authContext.organizationId
      );
      if (!event) {
        set.status = 404;
        return { error: "Event not found" };
      }
      return toEventJson(event);
    },
    {
      params: t.Object({ id: t.String({ maxLength: 36 }) }),
      response: {
        200: eventSchema,
        403: errorResponse,
        404: errorResponse,
      },
      detail: {
        tags: ["events"],
        summary: "Get an event",
        description:
          "One contact event by id. Returns 404 when the event does not exist in this organization. Requires contacts:read.",
      },
    }
  );
