/**
 * `wraps events` — contact events over the /v1/events read API (read-only).
 *
 * Pattern: commands/segments/segments.ts. Every error goes through emitError(),
 * which writes the JSON envelope (or a clack message in human mode) and sets
 * process.exitCode = 1. Bad flags are rejected here, before any request.
 *
 * Paging (uniform --limit/--cursor surface). The route is page-based:
 * `page` (1-indexed, 1-1000000) and `pageSize` (1-100, default 50). The CLI maps:
 *   --limit  -> pageSize (1-100, default 50)
 *   --cursor -> page     (decimal page number, default 1)
 * nextCursor is String(page + 1) while page * pageSize is below `total` and the
 * page is non-empty, otherwise null. A page number only means the same thing
 * with the same --limit, so the human "Next page" line repeats --limit and the
 * active filters. Events inserted between two calls shift later pages.
 *
 * Date flags (--date-from, --date-to) must be ISO 8601 (a date, or a date-time
 * with an optional offset). They are checked here so a typo fails before the
 * request, not as a generic 400.
 *
 * Read-only: no --yes, no --dry-run, no confirm flag.
 */

import { log, note } from "@clack/prompts";
import pc from "picocolors";
import {
  checkApiTarget,
  resolveApiTarget,
} from "../../utils/shared/api-target.js";
import {
  isJsonMode,
  jsonError,
  jsonSuccess,
} from "../../utils/shared/json-output.js";

type EventsCommonOptions = {
  token?: string;
  json?: boolean;
  region?: string;
};

export type EventsListOptions = EventsCommonOptions & {
  limit?: string;
  cursor?: string;
  eventName?: string;
  search?: string;
  contactEmail?: string;
  dateFrom?: string;
  dateTo?: string;
};

export type EventsAnalyticsOptions = EventsCommonOptions & {
  days?: string;
  timezone?: string;
};

export type EventsNamesOptions = EventsCommonOptions;

export type EventsGetOptions = EventsCommonOptions & {
  id?: string;
};

type ErrorSpec = {
  code: string;
  message: string;
  suggestion: string;
};

type Parsed<T> = { ok: true; value: T } | { ok: false; error: ErrorSpec };

type Target = { apiBase: string; token: string };

type ApiOutcome = { ok: true; body: Record<string, unknown> } | { ok: false };

type EventRow = {
  id: string;
  eventName: string;
  eventData: Record<string, unknown> | null;
  createdAt: string;
  contactId: string;
  contactEmail: string | null;
  contactFirstName: string | null;
  contactLastName: string | null;
};

type TopName = { name: string; count: number };

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const MAX_PAGE = 1_000_000;
const DEFAULT_DAYS = 30;
const MAX_TEXT_FILTER = 255;
const MAX_TIMEZONE = 64;
const DIGITS_ONLY = /^\d+$/;
const ISO_8601 =
  /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const SAFE_SHELL_WORD = /^[A-Za-z0-9_.:@+/-]+$/;

function emitError(command: string, error: ErrorSpec): void {
  process.exitCode = 1;
  if (isJsonMode()) {
    jsonError(command, error);
    return;
  }
  log.error(error.message);
  log.info(error.suggestion);
}

function missingInput(what: string, usage: string): ErrorSpec {
  return {
    code: "MISSING_REQUIRED_FLAG",
    message: `Missing ${what}`,
    suggestion: `Usage: ${usage}`,
  };
}

function invalidFlag(message: string, suggestion: string): ErrorSpec {
  return { code: "INVALID_FLAG_VALUE", message, suggestion };
}

function parseLimit(raw: string | undefined): Parsed<number> {
  if (raw === undefined) {
    return { ok: true, value: DEFAULT_LIMIT };
  }
  const value = Number(raw);
  if (!(DIGITS_ONLY.test(raw) && value >= 1 && value <= MAX_LIMIT)) {
    return {
      ok: false,
      error: invalidFlag(
        `--limit must be a whole number from 1 to ${MAX_LIMIT}, got "${raw}"`,
        "Pass --limit with a whole number from 1 to 100, for example: wraps events list --limit 50"
      ),
    };
  }
  return { ok: true, value };
}

// --cursor is the page number from the previous "Next page" line.
function parseCursor(raw: string | undefined): Parsed<number> {
  if (raw === undefined) {
    return { ok: true, value: 1 };
  }
  const value = Number(raw);
  if (!(DIGITS_ONLY.test(raw) && value >= 1 && value <= MAX_PAGE)) {
    return {
      ok: false,
      error: invalidFlag(
        `--cursor "${raw}" is not a valid cursor (expected a page number from 1 to ${MAX_PAGE})`,
        "Pass the --cursor value from the previous page's Next page line, or omit --cursor for the first page: wraps events list"
      ),
    };
  }
  return { ok: true, value };
}

function parseTextFilter(
  raw: string | undefined,
  flag: string
): Parsed<string | undefined> {
  if (raw === undefined || raw === "") {
    return { ok: true, value: undefined };
  }
  if (raw.length > MAX_TEXT_FILTER) {
    return {
      ok: false,
      error: invalidFlag(
        `--${flag} must be at most ${MAX_TEXT_FILTER} characters, got ${raw.length}`,
        `Shorten the value passed to --${flag}, then retry: wraps events list --${flag} <value>`
      ),
    };
  }
  return { ok: true, value: raw };
}

function parseDateFlag(
  raw: string | undefined,
  flag: string
): Parsed<string | undefined> {
  if (raw === undefined || raw === "") {
    return { ok: true, value: undefined };
  }
  if (!(ISO_8601.test(raw) && !Number.isNaN(Date.parse(raw)))) {
    return {
      ok: false,
      error: invalidFlag(
        `--${flag} "${raw}" is not an ISO 8601 date or date-time`,
        `Pass --${flag} as ISO 8601, for example: wraps events list --${flag} 2026-01-31T00:00:00Z (a date alone, such as 2026-01-31, also works)`
      ),
    };
  }
  return { ok: true, value: raw };
}

function parseDays(raw: string | undefined): Parsed<number> {
  if (raw === undefined || raw === "") {
    return { ok: true, value: DEFAULT_DAYS };
  }
  if (raw !== "7" && raw !== "30") {
    return {
      ok: false,
      error: invalidFlag(
        `--days must be 7 or 30, got "${raw}"`,
        "Pass --days 7 or --days 30, for example: wraps events analytics --days 7"
      ),
    };
  }
  return { ok: true, value: Number(raw) };
}

function parseTimezone(raw: string | undefined): Parsed<string | undefined> {
  if (raw === undefined || raw === "") {
    return { ok: true, value: undefined };
  }
  if (raw.length > MAX_TIMEZONE) {
    return {
      ok: false,
      error: invalidFlag(
        `--timezone must be at most ${MAX_TIMEZONE} characters, got ${raw.length}`,
        "Pass an IANA timezone name, for example: wraps events analytics --timezone America/New_York"
      ),
    };
  }
  return { ok: true, value: raw };
}

function apiErrorSpec(status: number, text: string): ErrorSpec {
  if (status === 401) {
    return {
      code: "NOT_AUTHENTICATED",
      message: text,
      suggestion:
        "Run: wraps auth login, or pass --token <api-key> / set WRAPS_API_KEY.",
    };
  }
  if (status === 403) {
    return {
      code: "FORBIDDEN",
      message: text,
      suggestion:
        "Reading events needs contacts read access in this organization. Run: wraps auth login, then retry with the organization that owns the events.",
    };
  }
  if (status === 404) {
    return {
      code: "NOT_FOUND",
      message: text,
      suggestion: "Check the event id. List events with: wraps events list",
    };
  }
  if (status === 429) {
    return {
      code: "RATE_LIMITED",
      message: text,
      suggestion: "Too many requests. Wait a minute, then retry.",
    };
  }
  if (status === 400 || status === 422) {
    return {
      code: "VALIDATION_FAILED",
      message: text,
      suggestion:
        "Fix the value named in the message and retry. Run wraps events --help for the accepted flag values.",
    };
  }
  return {
    code: "API_ERROR",
    message: text,
    suggestion: `The Wraps API returned HTTP ${status}. Retry shortly. If it keeps failing, include this message in your report.`,
  };
}

// Read `message` before `error`: some bodies carry the human text in `message`.
function errorText(body: Record<string, unknown>, status: number): string {
  if (typeof body.message === "string" && body.message.length > 0) {
    return body.message;
  }
  if (typeof body.error === "string" && body.error.length > 0) {
    return body.error;
  }
  return `HTTP ${status}`;
}

async function resolveTarget(
  command: string,
  token: string | undefined
): Promise<Target | null> {
  const check = checkApiTarget(await resolveApiTarget({ token }));
  if (!check.ok) {
    emitError(command, {
      code: "NOT_AUTHENTICATED",
      message: `${check.reason}.`,
      suggestion: check.suggestion,
    });
    return null;
  }
  return { apiBase: check.target.apiBase, token: check.target.token };
}

async function callApi(
  command: string,
  target: Target,
  path: string
): Promise<ApiOutcome> {
  let resp: Response;
  try {
    resp = await fetch(`${target.apiBase}${path}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${target.token}` },
    });
  } catch (error) {
    emitError(command, {
      code: "NETWORK_ERROR",
      message: `Could not reach the Wraps API (${error instanceof Error ? error.message : "unknown error"}).`,
      suggestion:
        "Check your network connection and WRAPS_API_URL, then retry.",
    });
    return { ok: false };
  }

  if (!resp.ok) {
    const parsedError: unknown = await resp.json().catch(() => null);
    const errBody =
      parsedError !== null && typeof parsedError === "object"
        ? (parsedError as Record<string, unknown>)
        : {};
    emitError(
      command,
      apiErrorSpec(resp.status, errorText(errBody, resp.status))
    );
    return { ok: false };
  }

  const parsed: unknown = await resp.json().catch(() => null);
  if (parsed === null || typeof parsed !== "object") {
    emitError(command, {
      code: "API_ERROR",
      message: "The Wraps API returned a response that could not be read.",
      suggestion:
        "Retry shortly. If it keeps failing, include the command you ran in your report.",
    });
    return { ok: false };
  }
  return { ok: true, body: parsed as Record<string, unknown> };
}

// Fixed output shape. An explicit field list keeps the JSON keys stable even
// if the route later adds fields.
function eventJson(event: EventRow): Record<string, unknown> {
  return {
    id: event.id,
    eventName: event.eventName,
    eventData: event.eventData,
    createdAt: event.createdAt,
    contactId: event.contactId,
    contactEmail: event.contactEmail,
    contactFirstName: event.contactFirstName,
    contactLastName: event.contactLastName,
  };
}

function kv(label: string, value: string): string {
  return `${pc.dim(label.padEnd(18))} ${value}`;
}

// Shell-quote a value for the printed re-run command.
function shellWord(value: string): string {
  return SAFE_SHELL_WORD.test(value)
    ? value
    : `'${value.replace(/'/g, "'\\''")}'`;
}

type ListFilters = {
  eventName?: string;
  search?: string;
  contactEmail?: string;
  dateFrom?: string;
  dateTo?: string;
};

function nextPageCommand(
  filters: ListFilters,
  limit: number,
  nextPage: number
): string {
  const parts = ["wraps events list"];
  const flags: [string, string | undefined][] = [
    ["--event-name", filters.eventName],
    ["--search", filters.search],
    ["--contact-email", filters.contactEmail],
    ["--date-from", filters.dateFrom],
    ["--date-to", filters.dateTo],
  ];
  for (const [flag, value] of flags) {
    if (value) {
      parts.push(flag, shellWord(value));
    }
  }
  parts.push("--limit", String(limit), "--cursor", String(nextPage));
  return parts.join(" ");
}

function parseListFilters(options: EventsListOptions): Parsed<ListFilters> {
  const eventName = parseTextFilter(options.eventName, "event-name");
  const search = parseTextFilter(options.search, "search");
  const contactEmail = parseTextFilter(options.contactEmail, "contact-email");
  const dateFrom = parseDateFlag(options.dateFrom, "date-from");
  const dateTo = parseDateFlag(options.dateTo, "date-to");
  for (const parsed of [eventName, search, contactEmail, dateFrom, dateTo]) {
    if (!parsed.ok) {
      return parsed;
    }
  }
  return {
    ok: true,
    value: {
      eventName: eventName.ok ? eventName.value : undefined,
      search: search.ok ? search.value : undefined,
      contactEmail: contactEmail.ok ? contactEmail.value : undefined,
      dateFrom: dateFrom.ok ? dateFrom.value : undefined,
      dateTo: dateTo.ok ? dateTo.value : undefined,
    },
  };
}

function listQuery(
  page: number,
  limit: number,
  filters: ListFilters
): URLSearchParams {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(limit),
  });
  if (filters.eventName) {
    params.set("eventName", filters.eventName);
  }
  if (filters.search) {
    params.set("search", filters.search);
  }
  if (filters.contactEmail) {
    params.set("contactEmail", filters.contactEmail);
  }
  if (filters.dateFrom) {
    params.set("dateFrom", filters.dateFrom);
  }
  if (filters.dateTo) {
    params.set("dateTo", filters.dateTo);
  }
  return params;
}

export async function eventsList(options: EventsListOptions): Promise<void> {
  const command = "events.list";

  const limitParsed = parseLimit(options.limit);
  if (!limitParsed.ok) {
    emitError(command, limitParsed.error);
    return;
  }
  const cursorParsed = parseCursor(options.cursor);
  if (!cursorParsed.ok) {
    emitError(command, cursorParsed.error);
    return;
  }
  const filtersParsed = parseListFilters(options);
  if (!filtersParsed.ok) {
    emitError(command, filtersParsed.error);
    return;
  }
  const filters = filtersParsed.value;

  const limit = limitParsed.value;
  const page = cursorParsed.value;

  const target = await resolveTarget(command, options.token);
  if (!target) {
    return;
  }

  const params = listQuery(page, limit, filters);

  const outcome = await callApi(command, target, `/v1/events?${params}`);
  if (!outcome.ok) {
    return;
  }

  const items = (outcome.body.events ?? []) as EventRow[];
  const total = typeof outcome.body.total === "number" ? outcome.body.total : 0;
  const nextCursor =
    items.length > 0 && page * limit < total ? String(page + 1) : null;

  const data = {
    events: items.map(eventJson),
    total,
    page,
    pageSize: limit,
    nextCursor,
  };

  if (isJsonMode()) {
    jsonSuccess(command, data);
    return;
  }

  if (items.length === 0) {
    log.info("No events found.");
    return;
  }

  const rows = items.map(
    (event) =>
      `${pc.dim(event.createdAt)}  ${event.eventName}  ${event.contactEmail ?? pc.dim("(no email)")}`
  );
  note(rows.join("\n"), `Events — ${total} total`);
  if (nextCursor !== null) {
    log.info(
      `Next page: ${pc.cyan(nextPageCommand(filters, limit, Number(nextCursor)))}`
    );
  }
}

export async function eventsAnalytics(
  options: EventsAnalyticsOptions
): Promise<void> {
  const command = "events.analytics";

  const daysParsed = parseDays(options.days);
  if (!daysParsed.ok) {
    emitError(command, daysParsed.error);
    return;
  }
  const timezoneParsed = parseTimezone(options.timezone);
  if (!timezoneParsed.ok) {
    emitError(command, timezoneParsed.error);
    return;
  }

  const days = daysParsed.value;
  const params = new URLSearchParams({ days: String(days) });
  if (timezoneParsed.value) {
    params.set("timezone", timezoneParsed.value);
  }

  const target = await resolveTarget(command, options.token);
  if (!target) {
    return;
  }
  const outcome = await callApi(
    command,
    target,
    `/v1/events/analytics?${params}`
  );
  if (!outcome.ok) {
    return;
  }

  const body = outcome.body;
  const topEventNames = (body.topEventNames ?? []) as TopName[];
  const data = {
    days,
    totalEvents: body.totalEvents,
    eventsThisPeriod: body.eventsThisPeriod,
    activeContacts: body.activeContacts,
    avgEventsPerContact: body.avgEventsPerContact,
    dailyEvents: body.dailyEvents,
    topEventNames,
  };

  if (isJsonMode()) {
    jsonSuccess(command, data);
    return;
  }

  const top =
    topEventNames.length === 0
      ? pc.dim("none")
      : topEventNames
          .slice(0, 5)
          .map((entry) => `${entry.name} ${pc.dim(`(${entry.count})`)}`)
          .join(", ");
  note(
    [
      kv("Total events:", String(body.totalEvents)),
      kv(`Last ${days} days:`, String(body.eventsThisPeriod)),
      kv("Active contacts:", String(body.activeContacts)),
      kv(
        "Avg per contact:",
        typeof body.avgEventsPerContact === "number"
          ? body.avgEventsPerContact.toFixed(1)
          : "0.0"
      ),
      kv("Top events:", top),
    ].join("\n"),
    `Event analytics — last ${days} days`
  );
}

export async function eventsNames(options: EventsNamesOptions): Promise<void> {
  const command = "events.names";

  const target = await resolveTarget(command, options.token);
  if (!target) {
    return;
  }
  const outcome = await callApi(command, target, "/v1/events/names");
  if (!outcome.ok) {
    return;
  }

  const eventNames = Array.isArray(outcome.body.eventNames)
    ? (outcome.body.eventNames as string[])
    : [];

  if (isJsonMode()) {
    jsonSuccess(command, { eventNames, count: eventNames.length });
    return;
  }

  if (eventNames.length === 0) {
    log.info("No event names yet.");
    return;
  }
  note(eventNames.join("\n"), `Event names — ${eventNames.length} total`);
}

export async function eventsGet(options: EventsGetOptions): Promise<void> {
  const command = "events.get";
  if (!options.id) {
    emitError(command, missingInput("event id", "wraps events get <event-id>"));
    return;
  }

  const target = await resolveTarget(command, options.token);
  if (!target) {
    return;
  }
  const outcome = await callApi(
    command,
    target,
    `/v1/events/${encodeURIComponent(options.id)}`
  );
  if (!outcome.ok) {
    return;
  }

  const event = outcome.body as unknown as EventRow;
  if (isJsonMode()) {
    jsonSuccess(command, eventJson(event));
    return;
  }

  note(
    [
      kv("ID:", event.id),
      kv("Event:", event.eventName),
      kv("Created:", event.createdAt),
      kv("Contact:", event.contactEmail ?? pc.dim("—")),
      kv("Contact ID:", event.contactId),
      kv(
        "Data:",
        event.eventData === null
          ? pc.dim("none")
          : JSON.stringify(event.eventData)
      ),
    ].join("\n"),
    `Event — ${event.eventName}`
  );
}
