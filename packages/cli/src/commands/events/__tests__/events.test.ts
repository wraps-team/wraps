/**
 * Unit tests for `wraps events`.
 *
 * Boundaries are mocked: the API target resolver, clack output and fetch.
 * The exported command functions run their real control flow. Every
 * --json assertion parses the single console.log envelope.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setJsonMode } from "../../../utils/shared/json-output.js";

vi.mock("@clack/prompts");
vi.mock("../../../utils/shared/api-target.js", () => ({
  resolveApiTarget: vi.fn(),
  checkApiTarget: vi.fn(),
}));

import { log, note } from "@clack/prompts";
import {
  checkApiTarget,
  resolveApiTarget,
} from "../../../utils/shared/api-target.js";
import {
  eventsAnalytics,
  eventsGet,
  eventsList,
  eventsNames,
} from "../events.js";

const API_BASE = "http://api.test";
const TOKEN = "wraps_test";

const EVENT = {
  id: "evt_1",
  eventName: "purchase",
  eventData: { amount: 42 },
  createdAt: "2026-10-01T12:00:00.000Z",
  contactId: "con_1",
  contactEmail: "ada@example.com",
  contactFirstName: "Ada",
  contactLastName: "Lovelace",
};

const LIST_KEYS = ["events", "nextCursor", "page", "pageSize", "total"];
const EVENT_KEYS = [
  "contactEmail",
  "contactFirstName",
  "contactId",
  "contactLastName",
  "createdAt",
  "eventData",
  "eventName",
  "id",
];

function res(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function envelope(spy: ReturnType<typeof vi.spyOn>) {
  const lines = spy.mock.calls.map((call) => String(call[0]));
  const last = lines.at(-1);
  if (last === undefined) {
    throw new Error("no console.log output");
  }
  return JSON.parse(last) as {
    success: boolean;
    command: string;
    data?: Record<string, unknown>;
    error?: { code: string; message: string; suggestion?: string };
  };
}

describe("events commands", () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    setJsonMode(true);
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.stubGlobal("fetch", fetchMock);
    vi.mocked(resolveApiTarget).mockResolvedValue({} as never);
    vi.mocked(checkApiTarget).mockReturnValue({
      ok: true,
      target: {
        apiBase: API_BASE,
        token: TOKEN,
        appUrl: "https://example.test",
        selfhosted: false,
        loginCommand: "wraps auth login",
      },
    } as never);
  });

  afterEach(() => {
    process.exitCode = undefined;
    setJsonMode(false);
    vi.unstubAllGlobals();
    consoleLogSpy.mockRestore();
  });

  describe("list", () => {
    it("emits the fixed envelope keys and the event row keys", async () => {
      fetchMock.mockResolvedValueOnce(
        res(200, { events: [EVENT], total: 1, page: 1, pageSize: 50 })
      );

      await eventsList({ json: true, token: TOKEN });

      const env = envelope(consoleLogSpy);
      expect(env.success).toBe(true);
      expect(env.command).toBe("events.list");
      expect(Object.keys(env.data ?? {}).sort()).toEqual(LIST_KEYS);
      expect(Object.keys((env.data?.events as object[])[0]).sort()).toEqual(
        EVENT_KEYS
      );
      expect(env.data?.total).toBe(1);
      expect(env.data?.page).toBe(1);
      expect(env.data?.pageSize).toBe(50);
      expect(env.data?.nextCursor).toBeNull();
      expect(process.exitCode).toBeUndefined();
    });

    it("sends GET to the exact default URL with page 1 and pageSize 50", async () => {
      fetchMock.mockResolvedValueOnce(
        res(200, { events: [], total: 0, page: 1, pageSize: 50 })
      );

      await eventsList({ json: true, token: TOKEN });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(String(fetchMock.mock.calls[0][0])).toBe(
        `${API_BASE}/v1/events?page=1&pageSize=50`
      );
      expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "GET" });
    });

    it("maps --limit to pageSize and --cursor to page, and pins every filter in the URL", async () => {
      fetchMock.mockResolvedValueOnce(
        res(200, { events: [EVENT], total: 9, page: 2, pageSize: 10 })
      );

      await eventsList({
        json: true,
        token: TOKEN,
        limit: "10",
        cursor: "2",
        eventName: "purchase",
        search: "gold",
        contactEmail: "a@b.co",
        dateFrom: "2026-01-31T00:00:00Z",
        dateTo: "2026-02-28",
      });

      expect(String(fetchMock.mock.calls[0][0])).toBe(
        `${API_BASE}/v1/events?page=2&pageSize=10&eventName=purchase&search=gold&contactEmail=a%40b.co&dateFrom=2026-01-31T00%3A00%3A00Z&dateTo=2026-02-28`
      );
      const env = envelope(consoleLogSpy);
      expect(env.data?.page).toBe(2);
      expect(env.data?.pageSize).toBe(10);
    });

    it("returns nextCursor as the next page number while more pages exist", async () => {
      fetchMock.mockResolvedValueOnce(
        res(200, { events: [EVENT, EVENT], total: 5, page: 1, pageSize: 2 })
      );

      await eventsList({ json: true, token: TOKEN, limit: "2" });

      expect(envelope(consoleLogSpy).data?.nextCursor).toBe("2");
    });

    it("returns nextCursor null on the last page when page times pageSize reaches total", async () => {
      fetchMock.mockResolvedValueOnce(
        res(200, { events: [EVENT, EVENT], total: 4, page: 2, pageSize: 2 })
      );

      await eventsList({ json: true, token: TOKEN, limit: "2", cursor: "2" });

      expect(envelope(consoleLogSpy).data?.nextCursor).toBeNull();
    });

    it("returns nextCursor null for an empty page even when total is larger", async () => {
      fetchMock.mockResolvedValueOnce(
        res(200, { events: [], total: 9, page: 5, pageSize: 2 })
      );

      await eventsList({ json: true, token: TOKEN, limit: "2", cursor: "5" });

      expect(envelope(consoleLogSpy).data?.nextCursor).toBeNull();
    });

    it("prints a Next page line with the exact re-run command, limit and filters included", async () => {
      process.exitCode = undefined;
      setJsonMode(false);
      fetchMock.mockResolvedValueOnce(
        res(200, { events: [EVENT, EVENT], total: 5, page: 1, pageSize: 2 })
      );

      await eventsList({
        token: TOKEN,
        limit: "2",
        eventName: "purchase",
        search: "gold coin",
      });

      expect(vi.mocked(log.info)).toHaveBeenCalledWith(
        expect.stringContaining(
          "wraps events list --event-name purchase --search 'gold coin' --limit 2 --cursor 2"
        )
      );
      expect(vi.mocked(note)).toHaveBeenCalledWith(
        expect.stringContaining("purchase"),
        expect.stringContaining("5 total")
      );
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it("prints no Next page line on the last human page", async () => {
      setJsonMode(false);
      fetchMock.mockResolvedValueOnce(
        res(200, { events: [EVENT], total: 1, page: 1, pageSize: 50 })
      );

      await eventsList({ token: TOKEN });

      const infoText = vi.mocked(log.info).mock.calls.map((c) => String(c[0]));
      expect(infoText.some((line) => line.includes("Next page:"))).toBe(false);
    });

    it("rejects --limit 0, 101 and abc with the flag named and zero requests", async () => {
      for (const limit of ["0", "101", "abc"]) {
        consoleLogSpy.mockClear();
        await eventsList({ json: true, token: TOKEN, limit });
        const env = envelope(consoleLogSpy);
        expect(env.error?.code).toBe("INVALID_FLAG_VALUE");
        expect(env.error?.message).toContain(
          "--limit must be a whole number from 1 to 100"
        );
        expect(env.error?.suggestion).toContain("wraps events list --limit 50");
      }
      expect(fetchMock).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });

    it("rejects --cursor abc, 0 and a non-integer with the flag named and zero requests", async () => {
      for (const cursor of ["abc", "0", "1.5"]) {
        consoleLogSpy.mockClear();
        await eventsList({ json: true, token: TOKEN, cursor });
        const env = envelope(consoleLogSpy);
        expect(env.error?.code).toBe("INVALID_FLAG_VALUE");
        expect(env.error?.message).toContain("--cursor");
        expect(env.error?.suggestion).toContain("wraps events list");
      }
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each(["not-a-date", "2026/01/31", "2026-13-01"])(
      "rejects --date-from %s locally, naming the flag and an example",
      async (dateFrom) => {
        await eventsList({ json: true, token: TOKEN, dateFrom });
        const env = envelope(consoleLogSpy);
        expect(env.error?.code).toBe("INVALID_FLAG_VALUE");
        expect(env.error?.message).toContain("--date-from");
        expect(env.error?.suggestion).toContain(
          "wraps events list --date-from 2026-01-31T00:00:00Z"
        );
        expect(fetchMock).not.toHaveBeenCalled();
      }
    );

    it("rejects a bad --date-to with the flag named and zero requests", async () => {
      await eventsList({ json: true, token: TOKEN, dateTo: "tomorrow" });

      const env = envelope(consoleLogSpy);
      expect(env.error?.message).toContain("--date-to");
      expect(env.error?.suggestion).toContain(
        "wraps events list --date-to 2026-01-31T00:00:00Z"
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects a --search over 255 characters before any request", async () => {
      await eventsList({ json: true, token: TOKEN, search: "x".repeat(256) });

      const env = envelope(consoleLogSpy);
      expect(env.error?.message).toContain(
        "--search must be at most 255 characters"
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("maps 401 to NOT_AUTHENTICATED with a suggestion naming wraps auth login", async () => {
      fetchMock.mockResolvedValueOnce(res(401, { error: "Unauthorized" }));

      await eventsList({ json: true, token: TOKEN });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("NOT_AUTHENTICATED");
      expect(env.error?.suggestion).toContain("wraps auth login");
      expect(process.exitCode).toBe(1);
    });

    it("maps a plain 403 to FORBIDDEN with a suggestion naming wraps auth login", async () => {
      fetchMock.mockResolvedValueOnce(res(403, { error: "Forbidden" }));

      await eventsList({ json: true, token: TOKEN });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("FORBIDDEN");
      expect(env.error?.message).toBe("Forbidden");
      expect(env.error?.suggestion).toContain("wraps auth login");
    });

    it("maps 429 to RATE_LIMITED", async () => {
      fetchMock.mockResolvedValueOnce(res(429, { error: "Too many" }));

      await eventsList({ json: true, token: TOKEN });

      expect(envelope(consoleLogSpy).error?.code).toBe("RATE_LIMITED");
    });

    it("maps 5xx to API_ERROR naming the HTTP status", async () => {
      fetchMock.mockResolvedValueOnce(
        res(503, { error: "Internal server error" })
      );

      await eventsList({ json: true, token: TOKEN });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("API_ERROR");
      expect(env.error?.suggestion).toContain("HTTP 503");
    });

    it("maps a 400 from the route to VALIDATION_FAILED and passes its message through", async () => {
      fetchMock.mockResolvedValueOnce(
        res(400, { error: "pageSize must be an integer between 1 and 100" })
      );

      await eventsList({ json: true, token: TOKEN });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("VALIDATION_FAILED");
      expect(env.error?.message).toBe(
        "pageSize must be an integer between 1 and 100"
      );
      expect(env.error?.suggestion).toContain("wraps events --help");
    });

    it("reads message before error in an error body", async () => {
      fetchMock.mockResolvedValueOnce(
        res(400, {
          message: "dateFrom must be an ISO 8601 date-time",
          error: "x",
        })
      );

      await eventsList({ json: true, token: TOKEN });

      expect(envelope(consoleLogSpy).error?.message).toBe(
        "dateFrom must be an ISO 8601 date-time"
      );
    });

    it("maps a network failure to NETWORK_ERROR", async () => {
      fetchMock.mockRejectedValueOnce(new Error("socket hang up"));

      await eventsList({ json: true, token: TOKEN });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("NETWORK_ERROR");
      expect(env.error?.message).toContain("socket hang up");
    });

    it("reports a missing credential as NOT_AUTHENTICATED with no request", async () => {
      vi.mocked(checkApiTarget).mockReturnValueOnce({
        ok: false,
        reason: "No API token",
        suggestion: "Run: wraps auth login",
      } as never);

      await eventsList({ json: true });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("NOT_AUTHENTICATED");
      expect(env.error?.suggestion).toContain("wraps auth login");
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("analytics", () => {
    const ANALYTICS = {
      totalEvents: 6,
      eventsThisPeriod: 5,
      activeContacts: 1,
      avgEventsPerContact: 5,
      dailyEvents: [{ date: "2026-10-27", count: 5 }],
      topEventNames: [
        { name: "purchase", count: 3 },
        { name: "signup", count: 2 },
      ],
    };

    it("emits the analytics keys with the requested days", async () => {
      fetchMock.mockResolvedValueOnce(res(200, ANALYTICS));

      await eventsAnalytics({ json: true, token: TOKEN });

      const env = envelope(consoleLogSpy);
      expect(env.success).toBe(true);
      expect(env.command).toBe("events.analytics");
      expect(Object.keys(env.data ?? {}).sort()).toEqual([
        "activeContacts",
        "avgEventsPerContact",
        "dailyEvents",
        "days",
        "eventsThisPeriod",
        "topEventNames",
        "totalEvents",
      ]);
      expect(env.data?.days).toBe(30);
      expect(env.data?.totalEvents).toBe(6);
      expect(env.data?.eventsThisPeriod).toBe(5);
      expect(env.data?.activeContacts).toBe(1);
      expect(env.data?.avgEventsPerContact).toBe(5);
    });

    it("sends days=7 and the timezone as a URL-encoded query", async () => {
      fetchMock.mockResolvedValueOnce(res(200, ANALYTICS));

      await eventsAnalytics({
        json: true,
        token: TOKEN,
        days: "7",
        timezone: "America/New_York",
      });

      expect(String(fetchMock.mock.calls[0][0])).toBe(
        `${API_BASE}/v1/events/analytics?days=7&timezone=America%2FNew_York`
      );
      expect(envelope(consoleLogSpy).data?.days).toBe(7);
    });

    it("sends the default days=30 with no timezone when none is given", async () => {
      fetchMock.mockResolvedValueOnce(res(200, ANALYTICS));

      await eventsAnalytics({ json: true, token: TOKEN });

      expect(String(fetchMock.mock.calls[0][0])).toBe(
        `${API_BASE}/v1/events/analytics?days=30`
      );
    });

    it("rejects --days 14 with the flag named and zero requests", async () => {
      await eventsAnalytics({ json: true, token: TOKEN, days: "14" });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("INVALID_FLAG_VALUE");
      expect(env.error?.message).toBe('--days must be 7 or 30, got "14"');
      expect(env.error?.suggestion).toContain(
        "wraps events analytics --days 7"
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects a timezone over 64 characters before any request", async () => {
      await eventsAnalytics({
        json: true,
        token: TOKEN,
        timezone: "x".repeat(65),
      });

      const env = envelope(consoleLogSpy);
      expect(env.error?.message).toContain(
        "--timezone must be at most 64 characters"
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("prints a compact summary in human mode", async () => {
      setJsonMode(false);
      fetchMock.mockResolvedValueOnce(res(200, ANALYTICS));

      await eventsAnalytics({ token: TOKEN });

      expect(vi.mocked(note)).toHaveBeenCalledWith(
        expect.stringContaining("Total events:"),
        "Event analytics — last 30 days"
      );
      const body = vi.mocked(note).mock.calls[0][0] as string;
      expect(body).toContain("Last 30 days:");
      expect(body).toContain("Active contacts:");
      expect(body).toContain("Avg per contact:");
      expect(body).toContain("5.0");
      expect(body).toContain("purchase");
      expect(body).toContain("signup");
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it("maps 401 to NOT_AUTHENTICATED", async () => {
      fetchMock.mockResolvedValueOnce(res(401, { error: "Unauthorized" }));

      await eventsAnalytics({ json: true, token: TOKEN });

      expect(envelope(consoleLogSpy).error?.code).toBe("NOT_AUTHENTICATED");
    });

    it("maps a fetch throw to NETWORK_ERROR", async () => {
      fetchMock.mockRejectedValueOnce(new Error("ECONNRESET"));

      await eventsAnalytics({ json: true, token: TOKEN });

      expect(envelope(consoleLogSpy).error?.code).toBe("NETWORK_ERROR");
    });
  });

  describe("names", () => {
    it("emits eventNames and a count, and sends GET /v1/events/names", async () => {
      fetchMock.mockResolvedValueOnce(
        res(200, { eventNames: ["purchase", "signup"] })
      );

      await eventsNames({ json: true, token: TOKEN });

      expect(String(fetchMock.mock.calls[0][0])).toBe(
        `${API_BASE}/v1/events/names`
      );
      const env = envelope(consoleLogSpy);
      expect(env.command).toBe("events.names");
      expect(Object.keys(env.data ?? {}).sort()).toEqual([
        "count",
        "eventNames",
      ]);
      expect(env.data?.eventNames).toEqual(["purchase", "signup"]);
      expect(env.data?.count).toBe(2);
    });

    it("lists the names in a note in human mode", async () => {
      setJsonMode(false);
      fetchMock.mockResolvedValueOnce(
        res(200, { eventNames: ["purchase", "signup"] })
      );

      await eventsNames({ token: TOKEN });

      expect(vi.mocked(note)).toHaveBeenCalledWith(
        "purchase\nsignup",
        "Event names — 2 total"
      );
    });

    it("maps 403 to FORBIDDEN", async () => {
      fetchMock.mockResolvedValueOnce(res(403, { error: "Forbidden" }));

      await eventsNames({ json: true, token: TOKEN });

      expect(envelope(consoleLogSpy).error?.code).toBe("FORBIDDEN");
    });

    it("reports a missing credential as NOT_AUTHENTICATED with no request", async () => {
      vi.mocked(checkApiTarget).mockReturnValueOnce({
        ok: false,
        reason: "No API token",
        suggestion: "Run: wraps auth login",
      } as never);

      await eventsNames({ json: true });

      expect(envelope(consoleLogSpy).error?.code).toBe("NOT_AUTHENTICATED");
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("get", () => {
    it("emits the event keys for one id", async () => {
      fetchMock.mockResolvedValueOnce(res(200, EVENT));

      await eventsGet({ id: "evt_1", json: true, token: TOKEN });

      expect(String(fetchMock.mock.calls[0][0])).toBe(
        `${API_BASE}/v1/events/evt_1`
      );
      const env = envelope(consoleLogSpy);
      expect(env.command).toBe("events.get");
      expect(Object.keys(env.data ?? {}).sort()).toEqual(EVENT_KEYS);
      expect(env.data?.id).toBe("evt_1");
      expect(env.data?.eventName).toBe("purchase");
    });

    it("maps 404 to NOT_FOUND with a suggestion naming wraps events list", async () => {
      fetchMock.mockResolvedValueOnce(res(404, { error: "Event not found" }));

      await eventsGet({ id: "evt_missing", json: true, token: TOKEN });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("NOT_FOUND");
      expect(env.error?.message).toBe("Event not found");
      expect(env.error?.suggestion).toContain("wraps events list");
    });

    it("keeps a hostile id as one encoded path segment", async () => {
      fetchMock.mockResolvedValueOnce(res(404, { error: "Event not found" }));

      await eventsGet({ id: "../x/y?z=1", json: true, token: TOKEN });

      expect(String(fetchMock.mock.calls[0][0])).toBe(
        `${API_BASE}/v1/events/..%2Fx%2Fy%3Fz%3D1`
      );
    });

    it("reports a missing id as MISSING_REQUIRED_FLAG with no request", async () => {
      await eventsGet({ json: true, token: TOKEN });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("MISSING_REQUIRED_FLAG");
      expect(env.error?.message).toBe("Missing event id");
      expect(env.error?.suggestion).toBe("Usage: wraps events get <event-id>");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("maps 401 to NOT_AUTHENTICATED", async () => {
      fetchMock.mockResolvedValueOnce(res(401, { error: "Unauthorized" }));

      await eventsGet({ id: "evt_1", json: true, token: TOKEN });

      expect(envelope(consoleLogSpy).error?.code).toBe("NOT_AUTHENTICATED");
    });

    it("prints the event in a note in human mode", async () => {
      setJsonMode(false);
      fetchMock.mockResolvedValueOnce(res(200, EVENT));

      await eventsGet({ id: "evt_1", token: TOKEN });

      const body = vi.mocked(note).mock.calls[0][0] as string;
      expect(body).toContain("ada@example.com");
      expect(body).toContain("purchase");
      expect(vi.mocked(note).mock.calls[0][1]).toBe("Event — purchase");
    });
  });
});
