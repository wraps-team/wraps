/**
 * `wraps email metrics` tests.
 *
 * Covers the flag-to-query mapping, the --json envelope (fixed data keys),
 * client-side date and granularity checks (no request made), and the HTTP
 * error mapping. fetch is stubbed, so nothing leaves the test process.
 */

import { log, note } from "@clack/prompts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkApiTarget,
  resolveApiTarget,
} from "../../../utils/shared/api-target.js";
import { setJsonMode } from "../../../utils/shared/json-output.js";
import { emailMetrics } from "../metrics.js";

vi.mock("@clack/prompts", () => ({
  note: vi.fn(),
  log: { error: vi.fn(), info: vi.fn(), success: vi.fn() },
}));

vi.mock("../../../utils/shared/api-target.js", () => ({
  resolveApiTarget: vi.fn(),
  checkApiTarget: vi.fn(),
}));

const API_BASE = "https://api.example.test";
const TOKEN = "wraps_test";
const fetchMock = vi.fn();
let consoleLogSpy: ReturnType<typeof vi.spyOn>;

type Envelope = {
  success: boolean;
  command: string;
  data?: Record<string, unknown>;
  error?: { code: string; message: string; suggestion?: string };
};

const METRICS_BODY = {
  object: "metrics",
  totals: {
    sent: 12,
    delivered: 11,
    opened: 4,
    clicked: 1,
    bounced: 1,
    complained: 0,
    costUsd: 0.0012,
  },
  data: [{ period: "2026-10-01", sent: 12 }],
  meta: {
    start_date: "2026-10-01T00:00:00.000Z",
    end_date: "2026-10-07T00:00:00.000Z",
    timezone: "UTC",
    granularity: "daily",
    dimensions: ["period"],
  },
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function lastEnvelope(): Envelope {
  expect(consoleLogSpy).toHaveBeenCalledTimes(1);
  return JSON.parse(String(consoleLogSpy.mock.calls[0][0])) as Envelope;
}

function requestedUrl(): URL {
  return new URL(String((fetchMock.mock.calls[0] as [string])[0]));
}

describe("emailMetrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockReset();
    process.exitCode = undefined;
    setJsonMode(true);
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.stubGlobal("fetch", fetchMock);
    vi.mocked(resolveApiTarget).mockResolvedValue({} as never);
    vi.mocked(checkApiTarget).mockReturnValue({
      ok: true,
      target: { apiBase: API_BASE, token: TOKEN },
    } as never);
  });

  afterEach(() => {
    process.exitCode = undefined;
    setJsonMode(false);
    vi.unstubAllGlobals();
    consoleLogSpy.mockRestore();
  });

  describe("success", () => {
    it("sends no query by default and emits the fixed envelope keys", async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, METRICS_BODY));

      await emailMetrics({ token: TOKEN });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(requestedUrl().href).toBe(`${API_BASE}/v1/email/metrics`);
      const [, init] = fetchMock.mock.calls[0] as [
        string,
        { headers: Record<string, string> },
      ];
      expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`);

      const envelope = lastEnvelope();
      expect(envelope.success).toBe(true);
      expect(envelope.command).toBe("email.metrics");
      expect(Object.keys(envelope.data ?? {}).sort()).toEqual([
        "data",
        "meta",
        "object",
        "totals",
      ]);
      expect(envelope.data?.totals).toEqual(METRICS_BODY.totals);
      expect(process.exitCode).toBeUndefined();
    });

    it("maps kebab-case flags to the route's snake_case query names", async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, METRICS_BODY));

      await emailMetrics({
        token: TOKEN,
        startDate: "2026-10-01",
        endDate: "2026-10-07",
        timezone: "Europe/London",
        granularity: "weekly",
        dimensions: "period,domain",
        broadcastId: "b_1,b_2",
        templateId: "t_1",
        awsAccountId: "acct_row_1",
        domain: "example.com",
      });

      expect(Object.fromEntries(requestedUrl().searchParams)).toEqual({
        start_date: "2026-10-01",
        end_date: "2026-10-07",
        timezone: "Europe/London",
        granularity: "weekly",
        dimensions: "period,domain",
        broadcast_id: "b_1,b_2",
        template_id: "t_1",
        aws_account_id: "acct_row_1",
        domain: "example.com",
      });
      expect(lastEnvelope().success).toBe(true);
    });

    it("renders a note in human mode and prints no JSON", async () => {
      setJsonMode(false);
      fetchMock.mockResolvedValue(jsonResponse(200, METRICS_BODY));

      await emailMetrics({ token: TOKEN });

      expect(note).toHaveBeenCalledTimes(1);
      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(process.exitCode).toBeUndefined();
    });
  });

  describe("client-side checks make no request", () => {
    it.each([
      ["unparseable start date", { startDate: "not-a-date" }, "INVALID_DATE"],
      ["unparseable end date", { endDate: "2026-13-45" }, "INVALID_DATE"],
      [
        "start after end",
        { startDate: "2026-10-07", endDate: "2026-10-01" },
        "INVALID_DATE_RANGE",
      ],
      [
        "unsupported granularity",
        { granularity: "yearly" },
        "INVALID_GRANULARITY",
      ],
    ])("%s -> %s", async (_label, options, code) => {
      await emailMetrics({ token: TOKEN, ...options });

      expect(fetchMock).not.toHaveBeenCalled();
      const envelope = lastEnvelope();
      expect(envelope.success).toBe(false);
      expect(envelope.command).toBe("email.metrics");
      expect(envelope.error?.code).toBe(code);
      expect(envelope.error?.suggestion).toBeTruthy();
      expect(process.exitCode).toBe(1);
    });
  });

  describe("errors", () => {
    it("reports NOT_AUTHENTICATED when no API target resolves", async () => {
      vi.mocked(checkApiTarget).mockReturnValue({
        ok: false,
        reason: "No API token",
        suggestion: "Run: wraps auth login",
      } as never);

      await emailMetrics({});

      expect(fetchMock).not.toHaveBeenCalled();
      const envelope = lastEnvelope();
      expect(envelope.error?.code).toBe("NOT_AUTHENTICATED");
      expect(envelope.error?.suggestion).toBe("Run: wraps auth login");
      expect(process.exitCode).toBe(1);
    });

    it.each([
      [401, "NOT_AUTHENTICATED"],
      [403, "FORBIDDEN"],
      [404, "NOT_FOUND"],
      [429, "RATE_LIMITED"],
      [500, "SERVER_ERROR"],
      [503, "SERVER_ERROR"],
      [402, "API_ERROR"],
    ])("HTTP %i -> %s with the body's error text", async (status, code) => {
      fetchMock.mockResolvedValue(
        jsonResponse(status, { error: "boom", code: "X" })
      );

      await emailMetrics({ token: TOKEN });

      const envelope = lastEnvelope();
      expect(envelope.success).toBe(false);
      expect(envelope.command).toBe("email.metrics");
      expect(envelope.error?.code).toBe(code);
      expect(envelope.error?.message).toBe("boom");
      expect(envelope.error?.suggestion).toBeTruthy();
      expect(process.exitCode).toBe(1);
    });

    it("maps a 400 from the route to VALIDATION_FAILED", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(400, {
          error: 'Invalid dimension: "bogus"',
          code: "BAD_REQUEST",
        })
      );

      await emailMetrics({ token: TOKEN, dimensions: "bogus" });

      expect(requestedUrl().searchParams.get("dimensions")).toBe("bogus");
      const envelope = lastEnvelope();
      expect(envelope.error?.code).toBe("VALIDATION_FAILED");
      expect(envelope.error?.message).toBe('Invalid dimension: "bogus"');
      expect(process.exitCode).toBe(1);
    });

    it("reads `message` before `error` on an error body", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(422, {
          error: "Validation failed",
          message: "start_date must be an ISO 8601 date",
        })
      );

      await emailMetrics({ token: TOKEN });

      expect(lastEnvelope().error?.message).toBe(
        "start_date must be an ISO 8601 date"
      );
    });

    it("reports NETWORK_ERROR when fetch rejects", async () => {
      fetchMock.mockRejectedValue(new Error("connect ECONNREFUSED"));

      await emailMetrics({ token: TOKEN });

      const envelope = lastEnvelope();
      expect(envelope.error?.code).toBe("NETWORK_ERROR");
      expect(envelope.error?.message).toContain("ECONNREFUSED");
      expect(process.exitCode).toBe(1);
    });

    it("reports INVALID_RESPONSE when a 200 body is not JSON", async () => {
      fetchMock.mockResolvedValue(new Response("<html>", { status: 200 }));

      await emailMetrics({ token: TOKEN });

      expect(lastEnvelope().error?.code).toBe("INVALID_RESPONSE");
      expect(process.exitCode).toBe(1);
    });

    it("prints a human error line and exits 1 in human mode", async () => {
      setJsonMode(false);
      fetchMock.mockResolvedValue(
        jsonResponse(401, { error: "Unauthorized", code: "UNAUTHORIZED" })
      );

      await emailMetrics({ token: TOKEN });

      expect(log.error).toHaveBeenCalledWith("Unauthorized");
      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });
  });
});
