/**
 * Unit tests for `wraps workflows list|get|executions|execution`.
 *
 * Boundaries are mocked: the API target resolver, clack output and fetch.
 * The exported command functions run their real control flow. Every --json
 * assertion parses the single console.log envelope.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setJsonMode } from "../../../utils/shared/json-output.js";

vi.mock("@clack/prompts", () => ({
  log: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warn: vi.fn() },
  note: vi.fn(),
}));
vi.mock("../../../utils/shared/api-target.js", () => ({
  resolveApiTarget: vi.fn(),
  checkApiTarget: vi.fn(),
}));

import { log } from "@clack/prompts";
import {
  checkApiTarget,
  resolveApiTarget,
} from "../../../utils/shared/api-target.js";
import {
  workflowsExecution,
  workflowsExecutions,
  workflowsGet,
  workflowsList,
} from "../read.js";

const API_BASE = "https://api.test";
const TOKEN = "wraps_test";
const HOSTILE = "../x/y?z=1";

const WORKFLOW = {
  id: "wf_1",
  organizationId: "org_a",
  name: "Welcome",
  description: null,
  status: "enabled",
  triggerType: "api",
  triggerConfig: {},
  steps: [],
  transitions: [],
  version: 3,
  totalExecutions: 10,
  activeExecutions: 2,
  completedExecutions: 7,
  failedExecutions: 1,
  createdBy: "user_1",
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-02T00:00:00.000Z",
  createdByUser: { id: "user_1", name: "Ada", email: "ada@example.com" },
};

const WORKFLOW_KEYS = [
  "completedExecutions",
  "createdAt",
  "createdBy",
  "description",
  "failedExecutions",
  "id",
  "name",
  "status",
  "totalExecutions",
  "triggerType",
  "updatedAt",
  "version",
  "activeExecutions",
].sort();

const EXECUTION = {
  id: "ex_1",
  workflowId: "wf_1",
  contactId: "c_1",
  organizationId: "org_a",
  status: "failed",
  currentStepId: "send_1",
  startedAt: "2026-10-03T00:00:00.000Z",
  completedAt: null,
  createdAt: "2026-10-03T00:00:00.000Z",
  updatedAt: "2026-10-03T01:00:00.000Z",
  contact: {
    id: "c_1",
    email: "ada@example.com",
    firstName: "Ada",
    lastName: null,
  },
};

const STEP = {
  id: "se_1",
  executionId: "ex_1",
  stepId: "send_1",
  stepType: "send_email",
  status: "failed",
  createdAt: "2026-10-03T00:00:00.000Z",
  extraColumn: "dropped",
};

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

/** The single envelope printed, parsed. */
function envelope(logSpy: ReturnType<typeof vi.spyOn>): {
  success: boolean;
  command: string;
  data?: Record<string, unknown>;
  error?: { code: string; message: string; suggestion?: string };
} {
  expect(logSpy).toHaveBeenCalledTimes(1);
  return JSON.parse(String(logSpy.mock.calls[0][0]));
}

describe("wraps workflows read commands", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockReset();
    process.exitCode = undefined;
    setJsonMode(true);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
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
    vi.restoreAllMocks();
  });

  describe("workflowsList", () => {
    it("sends page, pageSize, status and search and prints workflows.list with pinned data", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, {
          workflows: [WORKFLOW],
          total: 5,
          page: 2,
          pageSize: 2,
        })
      );

      await workflowsList({
        limit: "2",
        cursor: "2",
        status: "enabled",
        search: "welcome",
        json: true,
      });

      expect(String(fetchMock.mock.calls[0][0])).toBe(
        `${API_BASE}/v1/workflows?page=2&pageSize=2&search=welcome&status=enabled`
      );
      expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "GET" });
      const env = envelope(logSpy);
      expect(env.success).toBe(true);
      expect(env.command).toBe("workflows.list");
      expect(env.data).toMatchObject({
        total: 5,
        page: 2,
        pageSize: 2,
        totalPages: 3,
        nextCursor: "3",
      });
      expect(Object.keys(env.data as object).sort()).toEqual([
        "nextCursor",
        "page",
        "pageSize",
        "total",
        "totalPages",
        "workflows",
      ]);
      const row = (env.data?.workflows as Record<string, unknown>[])[0];
      expect(Object.keys(row).sort()).toEqual(WORKFLOW_KEYS);
      expect(row.id).toBe("wf_1");
      expect(row.totalExecutions).toBe(10);
      expect(row).not.toHaveProperty("organizationId");
      expect(process.exitCode).toBeUndefined();
    });

    it("sends no query string when no filter, limit or cursor is given", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, { workflows: [], total: 0, page: 1, pageSize: 50 })
      );

      await workflowsList({ json: true });

      expect(String(fetchMock.mock.calls[0][0])).toBe(
        `${API_BASE}/v1/workflows?page=1`
      );
      expect(envelope(logSpy).data).toMatchObject({
        total: 0,
        page: 1,
        pageSize: 50,
        totalPages: 0,
        nextCursor: null,
      });
    });

    it("on the last page returns nextCursor null", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, {
          workflows: [WORKFLOW],
          total: 3,
          page: 2,
          pageSize: 2,
        })
      );

      await workflowsList({ limit: "2", cursor: "2", json: true });

      expect(envelope(logSpy).data).toMatchObject({
        totalPages: 2,
        nextCursor: null,
      });
    });

    it("human mode prints the exact next-page command with the same filters", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, {
          workflows: [WORKFLOW],
          total: 5,
          page: 1,
          pageSize: 2,
        })
      );
      setJsonMode(false);

      await workflowsList({ limit: "2", status: "enabled" });

      const infoLines = vi.mocked(log.info).mock.calls.map((c) => String(c[0]));
      expect(
        infoLines.some((l) => l.includes("More workflows available"))
      ).toBe(true);
      expect(
        infoLines.some((l) =>
          l.includes(
            "wraps workflows list --limit 2 --status enabled --cursor 2"
          )
        )
      ).toBe(true);
    });

    it("human mode on an empty result says No workflows found.", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, { workflows: [], total: 0, page: 1, pageSize: 50 })
      );
      setJsonMode(false);

      await workflowsList({});

      expect(vi.mocked(log.info)).toHaveBeenCalledWith("No workflows found.");
    });

    it("rejects --limit outside 1 to 100 before any request", async () => {
      for (const limit of ["0", "101", "abc", "1.5", "-3"]) {
        await workflowsList({ limit, json: true });
        expect(envelope(logSpy).error?.code).toBe("INVALID_FLAG_VALUE");
        expect(envelope(logSpy).error?.message).toContain("--limit");
        logSpy.mockClear();
        process.exitCode = undefined;
      }
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects a malformed --cursor before any request, naming --cursor", async () => {
      for (const cursor of ["0", "-1", "abc", "1.5", "2x"]) {
        await workflowsList({ cursor, json: true });
        expect(envelope(logSpy).error?.code).toBe("INVALID_FLAG_VALUE");
        expect(envelope(logSpy).error?.message).toContain("--cursor");
        expect(envelope(logSpy).error?.suggestion).toContain(
          "wraps workflows list --cursor 2"
        );
        logSpy.mockClear();
        process.exitCode = undefined;
      }
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects an unknown --status before any request, naming --status and the values", async () => {
      await workflowsList({ status: "bogus", json: true });

      const error = envelope(logSpy).error;
      expect(error?.code).toBe("INVALID_FLAG_VALUE");
      expect(error?.message).toContain("--status");
      expect(error?.suggestion).toContain("draft, enabled, paused, archived");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects a --search longer than 255 characters before any request", async () => {
      await workflowsList({ search: "x".repeat(256), json: true });

      expect(envelope(logSpy).error?.message).toContain("--search");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("maps a 422 from the route to VALIDATION_FAILED with a suggestion naming the flags", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(422, { error: "Validation failed" })
      );

      await workflowsList({ json: true });

      const error = envelope(logSpy).error;
      expect(error?.code).toBe("VALIDATION_FAILED");
      expect(error?.message).toBe("Validation failed");
      expect(error?.suggestion).toContain("--status");
      expect(error?.suggestion).toContain("--cursor");
      expect(process.exitCode).toBe(1);
    });
  });

  describe("workflowsGet", () => {
    it("GETs /v1/workflows/:id and prints workflows.get with pinned keys", async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, WORKFLOW));

      await workflowsGet({ workflowId: "wf_1", json: true });

      expect(String(fetchMock.mock.calls[0][0])).toBe(
        `${API_BASE}/v1/workflows/wf_1`
      );
      const env = envelope(logSpy);
      expect(env.command).toBe("workflows.get");
      expect(Object.keys(env.data as object).sort()).toEqual(WORKFLOW_KEYS);
      expect(env.data).toMatchObject({
        id: "wf_1",
        name: "Welcome",
        version: 3,
        failedExecutions: 1,
      });
    });

    it("404 names wraps workflows list in the suggestion", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(404, { error: "Workflow not found" })
      );

      await workflowsGet({ workflowId: "wf_missing", json: true });

      const error = envelope(logSpy).error;
      expect(error?.code).toBe("NOT_FOUND");
      expect(error?.message).toBe("Workflow not found");
      expect(error?.suggestion).toContain("wraps workflows list");
    });

    it("missing workflow ID fails before any request, with a runnable usage", async () => {
      await workflowsGet({ json: true });

      const error = envelope(logSpy).error;
      expect(error?.code).toBe("MISSING_REQUIRED_FLAG");
      expect(error?.suggestion).toBe(
        "Usage: wraps workflows get <workflow-id>"
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("workflowsExecutions", () => {
    it("sends page, pageSize and status and prints workflows.executions", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, {
          executions: [EXECUTION],
          total: 4,
          page: 1,
          pageSize: 1,
        })
      );

      await workflowsExecutions({
        workflowId: "wf_1",
        limit: "1",
        status: "failed",
        json: true,
      });

      expect(String(fetchMock.mock.calls[0][0])).toBe(
        `${API_BASE}/v1/workflows/wf_1/executions?page=1&pageSize=1&status=failed`
      );
      const env = envelope(logSpy);
      expect(env.command).toBe("workflows.executions");
      expect(env.data).toMatchObject({
        workflowId: "wf_1",
        total: 4,
        page: 1,
        pageSize: 1,
        totalPages: 4,
        nextCursor: "2",
      });
      const row = (env.data?.executions as Record<string, unknown>[])[0];
      expect(row.id).toBe("ex_1");
      expect(row.status).toBe("failed");
      expect(row.contact).toMatchObject({ email: "ada@example.com" });
    });

    it("human mode prints the next-page command for executions", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, {
          executions: [EXECUTION],
          total: 4,
          page: 1,
          pageSize: 1,
        })
      );
      setJsonMode(false);

      await workflowsExecutions({ workflowId: "wf_1", limit: "1" });

      const infoLines = vi.mocked(log.info).mock.calls.map((c) => String(c[0]));
      expect(
        infoLines.some((l) =>
          l.includes("wraps workflows executions wf_1 --limit 1 --cursor 2")
        )
      ).toBe(true);
    });

    it("404 for an unknown workflow names wraps workflows list in the suggestion", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(404, { error: "Workflow not found" })
      );

      await workflowsExecutions({ workflowId: "wf_missing", json: true });

      const error = envelope(logSpy).error;
      expect(error?.code).toBe("NOT_FOUND");
      expect(error?.message).toBe("Workflow not found");
      expect(error?.suggestion).toContain("wraps workflows list");
    });

    it("rejects an unknown --status before any request, naming --status", async () => {
      await workflowsExecutions({
        workflowId: "wf_1",
        status: "enabled",
        json: true,
      });

      const error = envelope(logSpy).error;
      expect(error?.code).toBe("INVALID_FLAG_VALUE");
      expect(error?.message).toContain("--status");
      expect(error?.suggestion).toContain("cancelled");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects --limit 101 before any request, naming --limit", async () => {
      await workflowsExecutions({
        workflowId: "wf_1",
        limit: "101",
        json: true,
      });

      expect(envelope(logSpy).error?.message).toContain("--limit");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("missing workflow ID fails before any request, with a runnable usage", async () => {
      await workflowsExecutions({ json: true });

      const error = envelope(logSpy).error;
      expect(error?.code).toBe("MISSING_REQUIRED_FLAG");
      expect(error?.suggestion).toBe(
        "Usage: wraps workflows executions <workflow-id>"
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("workflowsExecution", () => {
    it("GETs /v1/workflows/executions/:id and prints the step trace", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, {
          ...EXECUTION,
          workflow: { name: "Welcome" },
          stepExecutions: [STEP],
          stepEngagement: { send_1: { opened: 1 } },
        })
      );

      await workflowsExecution({ executionId: "ex_1", json: true });

      expect(String(fetchMock.mock.calls[0][0])).toBe(
        `${API_BASE}/v1/workflows/executions/ex_1`
      );
      const env = envelope(logSpy);
      expect(env.command).toBe("workflows.execution");
      expect(env.data).toMatchObject({
        id: "ex_1",
        status: "failed",
        workflowName: "Welcome",
        stepEngagement: { send_1: { opened: 1 } },
      });
      const steps = env.data?.steps as Record<string, unknown>[];
      expect(steps).toHaveLength(1);
      expect(Object.keys(steps[0]).sort()).toEqual([
        "createdAt",
        "executionId",
        "id",
        "status",
        "stepId",
        "stepType",
      ]);
      expect(steps[0].stepType).toBe("send_email");
    });

    it("404 names the list and executions commands in the suggestion", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(404, { error: "Execution not found" })
      );

      await workflowsExecution({ executionId: "ex_missing", json: true });

      const error = envelope(logSpy).error;
      expect(error?.code).toBe("NOT_FOUND");
      expect(error?.suggestion).toContain("wraps workflows list");
      expect(error?.suggestion).toContain("wraps workflows executions");
    });

    it("missing execution ID fails before any request, with a runnable usage", async () => {
      await workflowsExecution({ json: true });

      const error = envelope(logSpy).error;
      expect(error?.code).toBe("MISSING_REQUIRED_FLAG");
      expect(error?.suggestion).toBe(
        "Usage: wraps workflows execution <execution-id>"
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("shared failure handling", () => {
    it("401 maps to NOT_AUTHENTICATED with a suggestion naming wraps auth login", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(401, { error: "Unauthorized", code: "UNAUTHORIZED" })
      );

      await workflowsList({ json: true });

      const error = envelope(logSpy).error;
      expect(error?.code).toBe("NOT_AUTHENTICATED");
      expect(error?.suggestion).toContain("wraps auth login");
    });

    it("403 with a plan message maps to PLAN_REQUIRED", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(403, { error: "This feature requires the Pro plan" })
      );

      await workflowsGet({ workflowId: "wf_1", json: true });

      const error = envelope(logSpy).error;
      expect(error?.code).toBe("PLAN_REQUIRED");
      expect(error?.suggestion).toContain("Upgrade");
    });

    it("403 without a plan message maps to FORBIDDEN", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(403, {
          error: "You don't have permission to perform this action",
        })
      );

      await workflowsExecutions({ workflowId: "wf_1", json: true });

      expect(envelope(logSpy).error?.code).toBe("FORBIDDEN");
    });

    it("no API target fails with NOT_AUTHENTICATED and sends no request", async () => {
      vi.mocked(checkApiTarget).mockReturnValue({
        ok: false,
        reason: "No API token",
        suggestion: "Run: wraps auth login",
      } as never);

      await workflowsList({ json: true });

      expect(envelope(logSpy).error?.code).toBe("NOT_AUTHENTICATED");
      expect(envelope(logSpy).error?.message).toBe("No API token");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("a fetch that throws maps to NETWORK_ERROR", async () => {
      fetchMock.mockRejectedValue(new Error("socket hang up"));

      await workflowsGet({ workflowId: "wf_1", json: true });

      const error = envelope(logSpy).error;
      expect(error?.code).toBe("NETWORK_ERROR");
      expect(error?.message).toContain("socket hang up");
    });

    it("human mode prints the failure message through log.error", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(404, { error: "Workflow not found" })
      );
      setJsonMode(false);

      await workflowsGet({ workflowId: "wf_missing" });

      expect(vi.mocked(log.error)).toHaveBeenCalledWith("Workflow not found");
      expect(vi.mocked(log.info)).toHaveBeenCalledWith(
        expect.stringContaining("wraps workflows list")
      );
      expect(process.exitCode).toBe(1);
    });

    it("a hostile id stays one encoded path segment on get, executions and execution", async () => {
      fetchMock.mockResolvedValue(jsonResponse(404, { error: "Not found" }));

      await workflowsGet({ workflowId: HOSTILE, json: true });
      await workflowsExecutions({ workflowId: HOSTILE, json: true });
      await workflowsExecution({ executionId: HOSTILE, json: true });

      expect(fetchMock).toHaveBeenCalledTimes(3);
      const encoded = encodeURIComponent(HOSTILE);
      const urls = fetchMock.mock.calls.map((c) => new URL(String(c[0])));
      expect(urls[0].pathname).toBe(`/v1/workflows/${encoded}`);
      expect(urls[1].pathname).toBe(`/v1/workflows/${encoded}/executions`);
      expect(urls[2].pathname).toBe(`/v1/workflows/executions/${encoded}`);
      // Only the executions list carries a query (its own page=1); the hostile id never adds one.
      expect(urls[0].search).toBe("");
      expect(urls[1].search).toBe("?page=1");
      expect(urls[2].search).toBe("");
      for (const url of urls) {
        expect(url.search).not.toContain("z=1");
      }
    });
  });
});
