/**
 * Tests for `wraps email health` (GET /v1/account/health).
 *
 * The API client is mocked at api-target and fetch is stubbed, so nothing
 * reaches the network. Every error path must emit one JSON envelope with a
 * distinct code and a suggestion, and must set process.exitCode = 1.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setJsonMode } from "../../../utils/shared/json-output.js";

vi.mock("@clack/prompts");
vi.mock("../../../utils/shared/api-target.js", () => ({
  resolveApiTarget: vi.fn(),
  checkApiTarget: vi.fn(),
}));

import * as clack from "@clack/prompts";
import {
  checkApiTarget,
  resolveApiTarget,
} from "../../../utils/shared/api-target.js";
import { emailHealth } from "../health.js";

const API_BASE = "http://api.test";
const TOKEN = "wraps_test";
const LOGIN = "wraps auth login";

const ACCOUNT_ROW_ID = "aws_row_abc123";

function healthyAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: ACCOUNT_ROW_ID,
    accountNumber: "123456789012",
    region: "us-east-1",
    status: "healthy",
    checkedAt: "2026-10-27T10:00:00.000Z",
    sandbox: false,
    productionAccessEnabled: true,
    sendingEnabled: true,
    enforcementStatus: "HEALTHY",
    quota: {
      max24Hour: 50000,
      sentLast24Hours: 1200,
      usedRatio: 0.024,
      maxSendRate: 14,
    },
    reputation: { bounceRate: 0.01, complaintRate: 0.0001 },
    thresholds: {
      bounceReview: 0.03,
      bouncePause: 0.05,
      complaintReview: 0.0005,
      complaintPause: 0.001,
      quotaWarn: 0.8,
    },
    reasons: [],
    ...overrides,
  };
}

function healthBody(overrides: Record<string, unknown> = {}) {
  return {
    status: "healthy",
    checkedAt: "2026-10-27T10:00:00.000Z",
    accounts: [healthyAccount()],
    ...overrides,
  };
}

function response(status: number, body: unknown) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  };
}

function lastEnvelope(consoleLogSpy: ReturnType<typeof vi.spyOn>) {
  expect(consoleLogSpy).toHaveBeenCalledTimes(1);
  return JSON.parse(String(consoleLogSpy.mock.calls[0][0])) as {
    success: boolean;
    command: string;
    data?: Record<string, unknown>;
    error?: { code: string; message: string; suggestion?: string };
  };
}

describe("emailHealth", () => {
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
        appUrl: "https://app.test",
        token: TOKEN,
        selfhosted: false,
        loginCommand: LOGIN,
      },
    } as never);
  });

  afterEach(() => {
    process.exitCode = undefined;
    setJsonMode(false);
    vi.unstubAllGlobals();
    consoleLogSpy.mockRestore();
  });

  describe("success", () => {
    it("emits the envelope as email.health with fixed data keys", async () => {
      fetchMock.mockResolvedValue(response(200, healthBody()));

      await emailHealth({ json: true });

      const envelope = lastEnvelope(consoleLogSpy);
      expect(envelope.success).toBe(true);
      expect(envelope.command).toBe("email.health");
      expect(envelope.error).toBeUndefined();
      expect(Object.keys(envelope.data ?? {})).toEqual([
        "status",
        "checkedAt",
        "accounts",
      ]);
      expect(process.exitCode).toBeUndefined();
    });

    it("calls GET /v1/account/health once with the bearer token", async () => {
      fetchMock.mockResolvedValue(response(200, healthBody()));

      await emailHealth({ json: true });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [
        string,
        { headers: Record<string, string> },
      ];
      expect(url).toBe(`${API_BASE}/v1/account/health`);
      expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    });

    it("keeps the awsAccount row id on each account", async () => {
      fetchMock.mockResolvedValue(response(200, healthBody()));

      await emailHealth({ json: true });

      const envelope = lastEnvelope(consoleLogSpy);
      const accounts = envelope.data?.accounts as Array<
        Record<string, unknown>
      >;
      expect(accounts).toHaveLength(1);
      expect(accounts[0].id).toBe(ACCOUNT_ROW_ID);
      expect(accounts[0].accountNumber).toBe("123456789012");
      expect(Object.keys(accounts[0])).toEqual([
        "id",
        "accountNumber",
        "region",
        "status",
        "checkedAt",
        "sandbox",
        "productionAccessEnabled",
        "sendingEnabled",
        "enforcementStatus",
        "quota",
        "reputation",
        "thresholds",
        "reasons",
      ]);
    });

    it("succeeds with an empty account list and nulls the checkedAt", async () => {
      fetchMock.mockResolvedValue(
        response(
          200,
          healthBody({ status: "unknown", checkedAt: null, accounts: [] })
        )
      );

      await emailHealth({ json: true });

      const envelope = lastEnvelope(consoleLogSpy);
      expect(envelope.success).toBe(true);
      expect(envelope.data).toEqual({
        status: "unknown",
        checkedAt: null,
        accounts: [],
      });
      expect(process.exitCode).toBeUndefined();
    });

    it("does not treat at_risk or in_danger as a failure", async () => {
      fetchMock.mockResolvedValue(
        response(
          200,
          healthBody({
            status: "in_danger",
            accounts: [
              healthyAccount({
                status: "in_danger",
                reasons: ["bounce rate high"],
              }),
            ],
          })
        )
      );

      await emailHealth({ json: true });

      const envelope = lastEnvelope(consoleLogSpy);
      expect(envelope.success).toBe(true);
      expect(envelope.data?.status).toBe("in_danger");
      expect(process.exitCode).toBeUndefined();
    });

    it("never prints secret-like fields, even when the API sends them", async () => {
      const leakedSecret = "wJalrXUtnSECRET-must-not-print";
      fetchMock.mockResolvedValue(
        response(
          200,
          healthBody({
            accounts: [
              healthyAccount({
                webhookSecret: leakedSecret,
                secretAccessKey: leakedSecret,
                sessionToken: leakedSecret,
              }),
            ],
          })
        )
      );

      await emailHealth({ json: true });

      const printed = String(consoleLogSpy.mock.calls[0][0]);
      expect(printed).not.toContain(leakedSecret);
      expect(printed).not.toContain("webhookSecret");
      expect(printed).not.toContain("secretAccessKey");
      expect(printed).not.toContain("sessionToken");
    });

    it("prints a human note with the account ids and no JSON in human mode", async () => {
      setJsonMode(false);
      fetchMock.mockResolvedValue(response(200, healthBody()));

      await emailHealth({});

      expect(consoleLogSpy).not.toHaveBeenCalled();
      const noteCalls = vi.mocked(clack.note).mock.calls;
      expect(noteCalls).toHaveLength(1);
      expect(String(noteCalls[0][0])).toContain(ACCOUNT_ROW_ID);
      expect(String(noteCalls[0][0])).toContain("--aws-account-id");
      expect(process.exitCode).toBeUndefined();
    });
  });

  describe("errors", () => {
    it("NOT_AUTHENTICATED when no target is usable, without a request", async () => {
      vi.mocked(checkApiTarget).mockReturnValue({
        ok: false,
        reason: "No API token",
        suggestion: `Run: ${LOGIN}`,
      } as never);

      await emailHealth({ json: true });

      const envelope = lastEnvelope(consoleLogSpy);
      expect(envelope.success).toBe(false);
      expect(envelope.command).toBe("email.health");
      expect(envelope.error?.code).toBe("NOT_AUTHENTICATED");
      expect(envelope.error?.suggestion).toBeTruthy();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });

    it("NOT_AUTHENTICATED on 401", async () => {
      fetchMock.mockResolvedValue(response(401, { error: "Unauthorized" }));

      await emailHealth({ json: true });

      const envelope = lastEnvelope(consoleLogSpy);
      expect(envelope.error?.code).toBe("NOT_AUTHENTICATED");
      expect(envelope.error?.suggestion).toContain(LOGIN);
      expect(process.exitCode).toBe(1);
    });

    it("FORBIDDEN on 403", async () => {
      fetchMock.mockResolvedValue(response(403, { error: "Forbidden" }));

      await emailHealth({ json: true });

      const envelope = lastEnvelope(consoleLogSpy);
      expect(envelope.error?.code).toBe("FORBIDDEN");
      expect(envelope.error?.suggestion).toBeTruthy();
      expect(process.exitCode).toBe(1);
    });

    it("NOT_FOUND on 404", async () => {
      fetchMock.mockResolvedValue(response(404, { error: "Not found" }));

      await emailHealth({ json: true });

      const envelope = lastEnvelope(consoleLogSpy);
      expect(envelope.error?.code).toBe("NOT_FOUND");
      expect(envelope.error?.suggestion).toBeTruthy();
      expect(process.exitCode).toBe(1);
    });

    it("RATE_LIMITED on 429, keeping the API's message", async () => {
      fetchMock.mockResolvedValue(
        response(429, {
          error: "Rate limit exceeded",
          code: "RATE_LIMITED",
          message: "Rate limit exceeded: 60 requests per minute",
        })
      );

      await emailHealth({ json: true });

      const envelope = lastEnvelope(consoleLogSpy);
      expect(envelope.error?.code).toBe("RATE_LIMITED");
      expect(envelope.error?.message).toBe(
        "Rate limit exceeded: 60 requests per minute"
      );
      expect(process.exitCode).toBe(1);
    });

    it("SERVER_ERROR on 500", async () => {
      fetchMock.mockResolvedValue(
        response(500, {
          error: "Internal server error",
          code: "INTERNAL_ERROR",
        })
      );

      await emailHealth({ json: true });

      const envelope = lastEnvelope(consoleLogSpy);
      expect(envelope.error?.code).toBe("SERVER_ERROR");
      expect(envelope.error?.message).toBe("Internal server error");
      expect(envelope.error?.suggestion).toBeTruthy();
      expect(process.exitCode).toBe(1);
    });

    it("reads message before error on an API error body", async () => {
      fetchMock.mockResolvedValue(
        response(400, { error: "conflict", message: "the real text" })
      );

      await emailHealth({ json: true });

      const envelope = lastEnvelope(consoleLogSpy);
      expect(envelope.error?.code).toBe("API_ERROR");
      expect(envelope.error?.message).toBe("the real text");
      expect(process.exitCode).toBe(1);
    });

    it("API_ERROR with a status-based message when the body is not JSON", async () => {
      fetchMock.mockResolvedValue({
        status: 418,
        ok: false,
        json: async () => {
          throw new SyntaxError("Unexpected token");
        },
      });

      await emailHealth({ json: true });

      const envelope = lastEnvelope(consoleLogSpy);
      expect(envelope.error?.code).toBe("API_ERROR");
      expect(envelope.error?.message).toContain("418");
      expect(process.exitCode).toBe(1);
    });

    it("NETWORK_ERROR when fetch rejects", async () => {
      fetchMock.mockRejectedValue(new Error("connect ECONNREFUSED"));

      await emailHealth({ json: true });

      const envelope = lastEnvelope(consoleLogSpy);
      expect(envelope.error?.code).toBe("NETWORK_ERROR");
      expect(envelope.error?.message).toContain("ECONNREFUSED");
      expect(envelope.error?.suggestion).toBeTruthy();
      expect(process.exitCode).toBe(1);
    });

    it("API_ERROR when a 200 body is not the health shape", async () => {
      fetchMock.mockResolvedValue(response(200, { status: "healthy" }));

      await emailHealth({ json: true });

      const envelope = lastEnvelope(consoleLogSpy);
      expect(envelope.success).toBe(false);
      expect(envelope.error?.code).toBe("API_ERROR");
      expect(envelope.error?.suggestion).toBeTruthy();
      expect(process.exitCode).toBe(1);
    });

    it("prints errors with clack and sets exitCode in human mode", async () => {
      setJsonMode(false);
      fetchMock.mockResolvedValue(response(500, { error: "boom" }));

      await emailHealth({});

      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(vi.mocked(clack.log.error)).toHaveBeenCalledWith("boom");
      expect(vi.mocked(clack.log.info)).toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });
  });
});
