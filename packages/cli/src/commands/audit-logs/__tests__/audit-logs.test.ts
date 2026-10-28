/**
 * Unit tests for `wraps audit-logs list|export`.
 *
 * Boundaries are mocked: the API target resolver, clack output and fetch. The
 * export file writes use a real temp directory under os.tmpdir(), removed after
 * each test. Every --json assertion parses the single console.log envelope.
 */

import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setJsonMode } from "../../../utils/shared/json-output.js";

vi.mock("@clack/prompts");
vi.mock("../../../utils/shared/api-target.js", () => ({
  resolveApiTarget: vi.fn(),
  checkApiTarget: vi.fn(),
}));

import { log } from "@clack/prompts";
import {
  checkApiTarget,
  resolveApiTarget,
} from "../../../utils/shared/api-target.js";
import { auditLogsExport, auditLogsList } from "../audit-logs.js";

const API_BASE = "http://api.test";
const TOKEN = "wraps_test";
const TARGET = { apiBase: API_BASE, token: TOKEN };

const ROW = {
  id: "al_1",
  organizationId: "org_1",
  userId: "usr_1",
  actorEmail: "owner@example.com",
  action: "audit_log.exported",
  resource: "auditLog",
  resourceId: null,
  metadata: null,
  ipAddress: null,
  userAgent: null,
  createdAt: "2026-10-27T10:00:00.000Z",
};

const CSV = "id,action\nal_1,audit_log.exported\n";

const OWNER_ONLY = "Audit logs are available to owners and admins only.";
const PLAN_ONLY = "Audit log export requires a Business plan or higher.";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function csvResponse(
  body: string,
  total: number,
  truncated: boolean
): Response {
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "x-total-count": String(total),
      "x-truncated": String(truncated),
    },
  });
}

describe("wraps audit-logs", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let dir: string;
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockReset();
    process.exitCode = undefined;
    setJsonMode(true);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    vi.stubGlobal("fetch", fetchMock);
    dir = mkdtempSync(join(tmpdir(), "audit-logs-test-"));
    vi.mocked(resolveApiTarget).mockResolvedValue({} as never);
    vi.mocked(checkApiTarget).mockReturnValue({
      ok: true,
      target: TARGET,
    } as never);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    process.exitCode = undefined;
    setJsonMode(false);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** The single envelope printed by the command. */
  function envelope(): {
    success: boolean;
    command: string;
    data?: Record<string, unknown>;
    error?: { code: string; message: string; suggestion: string };
  } {
    expect(logSpy).toHaveBeenCalledTimes(1);
    return JSON.parse(String(logSpy.mock.calls[0][0]));
  }

  /** The single failure envelope; must carry a suggestion and set exit code 1. */
  function failure(): { code: string; message: string; suggestion: string } {
    const env = envelope();
    expect(env.success).toBe(false);
    expect(env.error?.message).toBeTruthy();
    expect(env.error?.suggestion).toBeTruthy();
    expect(process.exitCode).toBe(1);
    return env.error as { code: string; message: string; suggestion: string };
  }

  function requestedUrl(): string {
    expect(fetchMock).toHaveBeenCalledTimes(1);
    return String(fetchMock.mock.calls[0][0]);
  }

  describe("list", () => {
    const LIST_OK = {
      data: [ROW],
      nextCursor: "c_next",
      retentionDays: 90,
      canExtend: true,
    };

    it("prints the route's page in the envelope under audit-logs.list", async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, LIST_OK));

      await auditLogsList({ json: true, token: TOKEN });

      const env = envelope();
      expect(env.success).toBe(true);
      expect(env.command).toBe("audit-logs.list");
      expect(Object.keys(env.data ?? {}).sort()).toEqual([
        "canExtend",
        "data",
        "nextCursor",
        "retentionDays",
      ]);
      expect(env.data?.retentionDays).toBe(90);
      expect(env.data?.canExtend).toBe(true);
      expect(env.data?.nextCursor).toBe("c_next");
      expect((env.data?.data as unknown[]).length).toBe(1);
      expect(process.exitCode).toBeUndefined();
    });

    it("sends GET with the bearer token and no query when no filter is given", async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, LIST_OK));

      await auditLogsList({ json: true, token: TOKEN });

      expect(requestedUrl()).toBe(`${API_BASE}/v1/audit-logs`);
      expect(fetchMock.mock.calls[0][1]).toEqual({
        method: "GET",
        headers: { Authorization: `Bearer ${TOKEN}` },
      });
    });

    it("maps every filter, limit and cursor to the route's query names", async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, LIST_OK));

      await auditLogsList({
        json: true,
        action: "audit_log.exported",
        actor: "usr_1",
        from: "2026-10-01",
        to: "2026-10-08T00:00:00Z",
        limit: "25",
        cursor: "c_abc",
      });

      expect(requestedUrl()).toBe(
        `${API_BASE}/v1/audit-logs?action=audit_log.exported&actorId=usr_1&dateFrom=2026-10-01&dateTo=2026-10-08T00%3A00%3A00Z&limit=25&cursor=c_abc`
      );
    });

    it("keeps a hostile actor id inside one encoded query value", async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, LIST_OK));

      await auditLogsList({ json: true, actor: "../x/y?z=1" });

      expect(requestedUrl()).toBe(
        `${API_BASE}/v1/audit-logs?actorId=..%2Fx%2Fy%3Fz%3D1`
      );
    });

    it("human output prints the retention window and the exact next --cursor command", async () => {
      setJsonMode(false);
      fetchMock.mockResolvedValue(jsonResponse(200, LIST_OK));

      await auditLogsList({ token: TOKEN });

      expect(log.info).toHaveBeenCalledWith(
        "Your plan keeps audit history for 90 days."
      );
      expect(log.info).toHaveBeenCalledWith(
        "Next page: wraps audit-logs list --cursor c_next"
      );
      expect(logSpy).not.toHaveBeenCalled();
    });

    it("human next-page command repeats the filters the user passed", async () => {
      setJsonMode(false);
      fetchMock.mockResolvedValue(jsonResponse(200, LIST_OK));

      await auditLogsList({
        action: "audit_log.exported",
        limit: "25",
        token: TOKEN,
      });

      expect(log.info).toHaveBeenCalledWith(
        "Next page: wraps audit-logs list --action audit_log.exported --limit 25 --cursor c_next"
      );
    });

    it("human output with no next page prints no next-page line", async () => {
      setJsonMode(false);
      fetchMock.mockResolvedValue(
        jsonResponse(200, { ...LIST_OK, nextCursor: null })
      );

      await auditLogsList({ token: TOKEN });

      const lines = vi.mocked(log.info).mock.calls.map((c) => String(c[0]));
      expect(lines.some((line) => line.startsWith("Next page:"))).toBe(false);
    });

    it("human output says when there are no rows", async () => {
      setJsonMode(false);
      fetchMock.mockResolvedValue(
        jsonResponse(200, {
          data: [],
          nextCursor: null,
          retentionDays: 30,
          canExtend: true,
        })
      );

      await auditLogsList({ token: TOKEN });

      expect(log.info).toHaveBeenCalledWith(
        "No audit log entries match these filters."
      );
      expect(log.info).toHaveBeenCalledWith(
        "Your plan keeps audit history for 30 days."
      );
    });

    it("warns that the plan limits history when --from is older than the window and the plan can be extended", async () => {
      setJsonMode(false);
      fetchMock.mockResolvedValue(jsonResponse(200, LIST_OK));

      await auditLogsList({ from: "2020-01-01", token: TOKEN });

      expect(log.warn).toHaveBeenCalledWith(
        "Your plan limits audit history to 90 days, so rows older than that are not returned, even with --from 2020-01-01. A higher plan keeps history for longer."
      );
    });

    it("on a plan that cannot be extended, the window warning omits the upgrade sentence", async () => {
      setJsonMode(false);
      fetchMock.mockResolvedValue(
        jsonResponse(200, { ...LIST_OK, retentionDays: 365, canExtend: false })
      );

      await auditLogsList({ from: "2020-01-01", token: TOKEN });

      expect(log.warn).toHaveBeenCalledWith(
        "Your plan limits audit history to 365 days, so rows older than that are not returned, even with --from 2020-01-01."
      );
    });

    it("does not warn when --from is inside the window", async () => {
      setJsonMode(false);
      fetchMock.mockResolvedValue(jsonResponse(200, LIST_OK));
      const recent = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);

      await auditLogsList({ from: recent, token: TOKEN });

      expect(log.warn).not.toHaveBeenCalled();
    });

    it("401 is NOT_AUTHENTICATED with a suggestion naming wraps auth login", async () => {
      fetchMock.mockResolvedValue(jsonResponse(401, { error: "Unauthorized" }));

      await auditLogsList({ json: true });

      const error = failure();
      expect(error.code).toBe("NOT_AUTHENTICATED");
      expect(error.suggestion).toContain("wraps auth login");
    });

    it("no API target is NOT_AUTHENTICATED and sends no request", async () => {
      vi.mocked(checkApiTarget).mockReturnValue({
        ok: false,
        reason: "No API token",
        suggestion: "Run: wraps auth login",
      } as never);

      await auditLogsList({ json: true });

      const error = failure();
      expect(error.code).toBe("NOT_AUTHENTICATED");
      expect(error.message).toBe("No API token.");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("a request that cannot be sent is NETWORK_ERROR", async () => {
      fetchMock.mockRejectedValue(new Error("socket hang up"));

      await auditLogsList({ json: true });

      const error = failure();
      expect(error.code).toBe("NETWORK_ERROR");
      expect(error.message).toBe(
        "Could not reach the Wraps API (socket hang up)."
      );
      expect(error.suggestion).toContain("WRAPS_API_URL");
    });

    it.each(["0", "101", "1.5", "abc"])(
      "--limit %s is rejected before any request, naming the flag",
      async (limit) => {
        await auditLogsList({ json: true, limit });

        const error = failure();
        expect(error.code).toBe("INVALID_FLAG_VALUE");
        expect(error.message).toBe(
          `--limit must be a whole number from 1 to 100, got "${limit}"`
        );
        expect(error.suggestion).toContain("wraps audit-logs list --limit 50");
        expect(fetchMock).not.toHaveBeenCalled();
      }
    );

    it("a cursor longer than 512 characters is rejected before any request", async () => {
      await auditLogsList({ json: true, cursor: "x".repeat(513) });

      const error = failure();
      expect(error.code).toBe("INVALID_FLAG_VALUE");
      expect(error.message).toBe(
        "--cursor is longer than the 512 characters a cursor can be"
      );
      expect(error.suggestion).toContain("--cursor <nextCursor>");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("an empty cursor is rejected before any request", async () => {
      await auditLogsList({ json: true, cursor: "" });

      const error = failure();
      expect(error.message).toBe("--cursor must not be empty");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("a non-ISO --from is rejected before any request, with an example", async () => {
      await auditLogsList({ json: true, from: "last week" });

      const error = failure();
      expect(error.code).toBe("INVALID_FLAG_VALUE");
      expect(error.message).toBe(
        '--from must be an ISO 8601 date or timestamp, got "last week"'
      );
      expect(error.suggestion).toContain(
        "wraps audit-logs list --from 2026-10-01"
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("an impossible --to date is rejected before any request", async () => {
      await auditLogsList({ json: true, to: "2026-13-45" });

      const error = failure();
      expect(error.message).toBe(
        '--to must be an ISO 8601 date or timestamp, got "2026-13-45"'
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("the owner/admin 403 is FORBIDDEN and says to ask an org owner or admin", async () => {
      fetchMock.mockResolvedValue(jsonResponse(403, { error: OWNER_ONLY }));

      await auditLogsList({ json: true });

      const error = failure();
      expect(error.code).toBe("FORBIDDEN");
      expect(error.message).toBe(OWNER_ONLY);
      expect(error.suggestion).toContain("ask an org owner or admin");
    });

    it("the generic permission 403 is also FORBIDDEN, not PLAN_REQUIRED", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(403, {
          error: "You don't have permission to perform this action",
        })
      );

      await auditLogsList({ json: true });

      const error = failure();
      expect(error.code).toBe("FORBIDDEN");
      expect(error.suggestion).toContain("ask an org owner or admin");
    });

    it("a 400 from the route names the flag it refers to", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(400, {
          error: "limit must be a whole number from 1 to 100",
        })
      );

      await auditLogsList({ json: true });

      const error = failure();
      expect(error.code).toBe("VALIDATION_FAILED");
      expect(error.suggestion).toContain("Fix --limit and retry");
    });

    it("a 429 is RATE_LIMITED", async () => {
      fetchMock.mockResolvedValue(jsonResponse(429, { error: "Slow down" }));

      await auditLogsList({ json: true });

      expect(failure().code).toBe("RATE_LIMITED");
    });
  });

  describe("export", () => {
    it("json without --output returns { logs, total, truncated } in the envelope", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, { logs: [ROW], total: 1, truncated: false })
      );

      await auditLogsExport({ json: true, token: TOKEN });

      const env = envelope();
      expect(env.success).toBe(true);
      expect(env.command).toBe("audit-logs.export");
      expect(Object.keys(env.data ?? {}).sort()).toEqual([
        "logs",
        "total",
        "truncated",
      ]);
      expect(env.data?.total).toBe(1);
      expect(env.data?.truncated).toBe(false);
      expect(requestedUrl()).toBe(
        `${API_BASE}/v1/audit-logs/export?format=json`
      );
    });

    it("sends the same filters as list, plus format", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, { logs: [], total: 0, truncated: false })
      );

      await auditLogsExport({
        json: true,
        action: "audit_log.exported",
        actor: "usr_1",
        from: "2026-10-01",
      });

      expect(requestedUrl()).toBe(
        `${API_BASE}/v1/audit-logs/export?action=audit_log.exported&actorId=usr_1&dateFrom=2026-10-01&format=json`
      );
    });

    it("csv in --json mode without --output is VALIDATION_FAILED and sends no request", async () => {
      await auditLogsExport({ json: true, format: "csv" });

      const error = failure();
      expect(error.code).toBe("VALIDATION_FAILED");
      expect(error.message).toContain("--output");
      expect(error.suggestion).toBe(
        "Add --output to write the file: wraps audit-logs export --format csv --output ./audit-logs.csv --json"
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("writes the CSV body to --output after a successful response, and reports the headers", async () => {
      const out = join(dir, "audit.csv");
      fetchMock.mockResolvedValue(csvResponse(CSV, 7, true));

      await auditLogsExport({ json: true, format: "csv", output: out });

      expect(requestedUrl()).toBe(
        `${API_BASE}/v1/audit-logs/export?format=csv`
      );
      expect(readFileSync(out, "utf8")).toBe(CSV);
      const env = envelope();
      expect(env.success).toBe(true);
      expect(env.command).toBe("audit-logs.export");
      expect(Object.keys(env.data ?? {}).sort()).toEqual([
        "bytes",
        "format",
        "output",
        "total",
        "truncated",
      ]);
      expect(env.data?.format).toBe("csv");
      expect(env.data?.output).toBe(out);
      expect(env.data?.total).toBe(7);
      expect(env.data?.truncated).toBe(true);
      expect(env.data?.bytes).toBe(34);
    });

    it("csv in human mode with no --output prints the body to stdout and nothing to disk", async () => {
      setJsonMode(false);
      fetchMock.mockResolvedValue(csvResponse(CSV, 1, false));

      await auditLogsExport({ format: "csv", token: TOKEN });

      expect(stdoutSpy).toHaveBeenCalledWith(CSV);
      expect(stderrSpy).not.toHaveBeenCalled();
      expect(readdirSync(dir)).toEqual([]);
      expect(logSpy).not.toHaveBeenCalled();
    });

    it("a truncated human stdout export says so on stderr and suggests --from and --to", async () => {
      setJsonMode(false);
      fetchMock.mockResolvedValue(csvResponse(CSV, 60000, true));

      await auditLogsExport({ format: "csv", token: TOKEN });

      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining("truncated at the 50,000-row cap")
      );
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining("Narrow it with --from and --to")
      );
    });

    it("human mode with --output writes the file and reports the row count", async () => {
      setJsonMode(false);
      const out = join(dir, "audit.csv");
      fetchMock.mockResolvedValue(csvResponse(CSV, 7, false));

      await auditLogsExport({ format: "csv", output: out, token: TOKEN });

      expect(readFileSync(out, "utf8")).toBe(CSV);
      expect(log.success).toHaveBeenCalledWith(
        `Wrote 7 matching audit log rows to ${out} (csv).`
      );
      expect(log.warn).not.toHaveBeenCalled();
    });

    it("json with --output writes { logs, total, truncated } as a file", async () => {
      const out = join(dir, "audit.json");
      const body = { logs: [ROW], total: 1, truncated: false };
      fetchMock.mockResolvedValue(jsonResponse(200, body));

      await auditLogsExport({ json: true, output: out });

      expect(JSON.parse(readFileSync(out, "utf8"))).toEqual(body);
      expect(envelope().data?.format).toBe("json");
    });

    it("an existing --output file is not overwritten without --yes, and no export is requested", async () => {
      const out = join(dir, "audit.csv");
      writeFileSync(out, "keep me");

      await auditLogsExport({ json: true, format: "csv", output: out });

      const error = failure();
      expect(error.code).toBe("CONFIRMATION_REQUIRED");
      expect(error.message).toBe(
        `${out} already exists. Nothing was exported because --yes was not passed.`
      );
      expect(error.suggestion).toContain("Re-run with --yes to overwrite it");
      expect(error.suggestion).toContain(
        `wraps audit-logs export --format csv --output ${out}`
      );
      expect(error.suggestion.endsWith(" --yes")).toBe(true);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(readFileSync(out, "utf8")).toBe("keep me");
    });

    it("an existing --output file is replaced with --yes", async () => {
      const out = join(dir, "audit.csv");
      writeFileSync(out, "old contents");
      fetchMock.mockResolvedValue(csvResponse(CSV, 1, false));

      await auditLogsExport({
        json: true,
        format: "csv",
        output: out,
        yes: true,
      });

      expect(readFileSync(out, "utf8")).toBe(CSV);
      expect(envelope().success).toBe(true);
    });

    it("an --output in a missing directory is VALIDATION_FAILED before any request", async () => {
      const out = join(dir, "missing", "audit.csv");

      await auditLogsExport({ json: true, format: "csv", output: out });

      const error = failure();
      expect(error.code).toBe("VALIDATION_FAILED");
      expect(error.message).toBe(
        `--output directory does not exist: ${join(dir, "missing")}`
      );
      expect(fetchMock).not.toHaveBeenCalled();
      expect(existsSync(join(dir, "missing"))).toBe(false);
    });

    it("an --output that is a directory is VALIDATION_FAILED before any request", async () => {
      await auditLogsExport({ json: true, output: dir });

      const error = failure();
      expect(error.code).toBe("VALIDATION_FAILED");
      expect(error.message).toBe(`--output is a directory: ${dir}`);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("an unknown --format is rejected before any request, naming the flag", async () => {
      await auditLogsExport({ json: true, format: "xml" });

      const error = failure();
      expect(error.code).toBe("INVALID_FLAG_VALUE");
      expect(error.message).toBe('--format must be json or csv, got "xml"');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("a non-ISO --from is rejected before any request", async () => {
      await auditLogsExport({ json: true, from: "yesterday" });

      const error = failure();
      expect(error.message).toBe(
        '--from must be an ISO 8601 date or timestamp, got "yesterday"'
      );
      expect(error.suggestion).toContain(
        "wraps audit-logs export --from 2026-10-01"
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("the plan 403 is PLAN_REQUIRED with the upgrade hint, and writes no file", async () => {
      const out = join(dir, "audit.csv");
      fetchMock.mockResolvedValue(jsonResponse(403, { error: PLAN_ONLY }));

      await auditLogsExport({ json: true, format: "csv", output: out });

      const error = failure();
      expect(error.code).toBe("PLAN_REQUIRED");
      expect(error.message).toBe(PLAN_ONLY);
      expect(error.suggestion).toContain("Business plan");
      expect(error.suggestion).toContain(
        "wraps audit-logs list works on every plan"
      );
      expect(existsSync(out)).toBe(false);
    });

    it("the owner/admin 403 is FORBIDDEN and writes no file", async () => {
      const out = join(dir, "audit.csv");
      fetchMock.mockResolvedValue(jsonResponse(403, { error: OWNER_ONLY }));

      await auditLogsExport({ json: true, format: "csv", output: out });

      const error = failure();
      expect(error.code).toBe("FORBIDDEN");
      expect(error.suggestion).toContain("ask an org owner or admin");
      expect(existsSync(out)).toBe(false);
    });

    it("401 is NOT_AUTHENTICATED with a suggestion naming wraps auth login, and writes no file", async () => {
      const out = join(dir, "audit.csv");
      fetchMock.mockResolvedValue(jsonResponse(401, { error: "Unauthorized" }));

      await auditLogsExport({ json: true, format: "csv", output: out });

      const error = failure();
      expect(error.code).toBe("NOT_AUTHENTICATED");
      expect(error.suggestion).toContain("wraps auth login");
      expect(existsSync(out)).toBe(false);
    });

    it("a 5xx is API_ERROR and writes no file", async () => {
      const out = join(dir, "audit.csv");
      fetchMock.mockResolvedValue(jsonResponse(500, { error: "boom" }));

      await auditLogsExport({ json: true, format: "csv", output: out });

      const error = failure();
      expect(error.code).toBe("API_ERROR");
      expect(error.message).toBe("boom");
      expect(existsSync(out)).toBe(false);
    });

    it("a CSV response without X-Total-Count is an unreadable response and writes no file", async () => {
      const out = join(dir, "audit.csv");
      fetchMock.mockResolvedValue(
        new Response(CSV, { status: 200, headers: { "x-truncated": "false" } })
      );

      await auditLogsExport({ json: true, format: "csv", output: out });

      const error = failure();
      expect(error.code).toBe("API_ERROR");
      expect(error.message).toBe(
        "The Wraps API returned a response that could not be read."
      );
      expect(existsSync(out)).toBe(false);
    });

    it("no API target is NOT_AUTHENTICATED and sends no request", async () => {
      vi.mocked(checkApiTarget).mockReturnValue({
        ok: false,
        reason: "No API token",
        suggestion: "Run: wraps auth login",
      } as never);

      await auditLogsExport({ json: true });

      expect(failure().code).toBe("NOT_AUTHENTICATED");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("a request that cannot be sent is NETWORK_ERROR", async () => {
      fetchMock.mockRejectedValue(new Error("socket hang up"));

      await auditLogsExport({ json: true });

      expect(failure().code).toBe("NETWORK_ERROR");
    });
  });
});
