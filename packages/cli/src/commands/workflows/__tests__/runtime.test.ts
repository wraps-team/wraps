/**
 * Tests for `wraps workflows trigger|enable|disable|retry|cancel`.
 *
 * Boundaries are mocked: fetch (no real network), target resolution, and clack.
 * The exported command functions run their real control flow.
 *
 * Contract under test: one JSON envelope per invocation with fixed data keys,
 * dotted command names, process.exitCode = 1 on every error, zero requests for
 * dry runs and for --yes-gated sub-commands run without --yes, and HTTP 200
 * with success:false treated as a failure.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkApiTarget,
  resolveApiTarget,
} from "../../../utils/shared/api-target.js";
import { setJsonMode } from "../../../utils/shared/json-output.js";

vi.mock("@clack/prompts", () => ({
  log: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
  note: vi.fn(),
}));
vi.mock("../../../utils/shared/api-target.js", () => ({
  resolveApiTarget: vi.fn(),
  checkApiTarget: vi.fn(),
}));

import { log, note } from "@clack/prompts";
import {
  workflowsCancel,
  workflowsDisable,
  workflowsEnable,
  workflowsRetry,
  workflowsTrigger,
} from "../runtime.js";

const fetchMock = vi.fn();
const API = "https://api.test";

function respond(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function usableTarget(): void {
  vi.mocked(checkApiTarget).mockReturnValue({
    ok: true,
    target: {
      apiBase: API,
      appUrl: "https://app.test",
      token: "wraps_test",
      tokenType: "api-key",
      selfhosted: false,
      loginCommand: "wraps auth login",
    },
  } as never);
}

/** The single JSON envelope printed by the command. */
function envelope(consoleLogSpy: ReturnType<typeof vi.spyOn>) {
  expect(consoleLogSpy).toHaveBeenCalledTimes(1);
  return JSON.parse(String(consoleLogSpy.mock.calls[0][0])) as {
    success: boolean;
    command: string;
    data?: Record<string, unknown>;
    error?: { code: string; message: string; suggestion?: string };
  };
}

describe("workflows runtime commands", () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    setJsonMode(true);
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.stubGlobal("fetch", fetchMock);
    vi.mocked(resolveApiTarget).mockResolvedValue({} as never);
    usableTarget();
  });

  afterEach(() => {
    process.exitCode = undefined;
    setJsonMode(false);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("trigger", () => {
    const base = {
      workflowId: "wf_1",
      contactId: "c_1",
      data: '{"plan":"pro"}',
      token: "wraps_test",
      json: true,
    };

    it("reports a missing workflow ID without any request", async () => {
      await workflowsTrigger({ ...base, workflowId: undefined, yes: true });

      const env = envelope(consoleLogSpy);
      expect(env.success).toBe(false);
      expect(env.command).toBe("workflows.trigger");
      expect(env.error?.code).toBe("MISSING_REQUIRED_FLAG");
      expect(env.error?.suggestion).toBeTruthy();
      expect(process.exitCode).toBe(1);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("requires a contact selection", async () => {
      await workflowsTrigger({ ...base, contactId: undefined, yes: true });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("MISSING_REQUIRED_FLAG");
      expect(process.exitCode).toBe(1);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects both --contact-id and --contact-email", async () => {
      await workflowsTrigger({
        ...base,
        contactEmail: "a@example.com",
        yes: true,
      });

      expect(envelope(consoleLogSpy).error?.code).toBe("INVALID_FLAG_USAGE");
      expect(process.exitCode).toBe(1);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each([
      ["not JSON", "{plan:"],
      ["an array", "[1,2]"],
      ["a scalar", "42"],
    ])("rejects --data that is %s", async (_label, data) => {
      await workflowsTrigger({ ...base, data, yes: true });

      expect(envelope(consoleLogSpy).error?.code).toBe("INVALID_FLAG_USAGE");
      expect(process.exitCode).toBe(1);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("dry run prints the payload and sends nothing, even without --yes", async () => {
      await workflowsTrigger({ ...base, dryRun: true });

      const env = envelope(consoleLogSpy);
      expect(env.success).toBe(true);
      expect(env.command).toBe("workflows.trigger");
      expect(Object.keys(env.data ?? {}).sort()).toEqual(
        [
          "contactEmail",
          "contactId",
          "data",
          "dryRun",
          "message",
          "workflowId",
          "workflowName",
        ].sort()
      );
      expect(env.data).toMatchObject({
        dryRun: true,
        workflowId: "wf_1",
        contactId: "c_1",
        data: { plan: "pro" },
      });
      expect(process.exitCode).toBeUndefined();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("without --yes returns CONFIRMATION_REQUIRED and makes zero requests", async () => {
      await workflowsTrigger({ ...base });

      const env = envelope(consoleLogSpy);
      expect(env.success).toBe(false);
      expect(env.error?.code).toBe("CONFIRMATION_REQUIRED");
      expect(env.error?.suggestion).toBeTruthy();
      expect(process.exitCode).toBe(1);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("with --yes posts the encoded path and body, and prints the fixed keys", async () => {
      fetchMock.mockResolvedValue(
        respond(200, {
          success: true,
          message: "Workflow triggered successfully",
          workflowId: "wf_1",
          workflowName: "Welcome",
          contactId: "c_1",
        })
      );

      await workflowsTrigger({ ...base, workflowId: "wf 1", yes: true });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${API}/v1/workflows/wf%201/trigger`);
      expect(init.method).toBe("POST");
      expect(JSON.parse(String(init.body))).toEqual({
        contactId: "c_1",
        data: { plan: "pro" },
      });

      const env = envelope(consoleLogSpy);
      expect(env.success).toBe(true);
      expect(env.command).toBe("workflows.trigger");
      expect(Object.keys(env.data ?? {}).sort()).toEqual(
        [
          "contactEmail",
          "contactId",
          "data",
          "dryRun",
          "message",
          "workflowId",
          "workflowName",
        ].sort()
      );
      expect(env.data).toMatchObject({
        dryRun: false,
        workflowId: "wf 1",
        workflowName: "Welcome",
        contactId: "c_1",
      });
      expect(process.exitCode).toBeUndefined();
    });

    it("HTTP 200 with success:false is a failure with exit code 1", async () => {
      fetchMock.mockResolvedValue(
        respond(200, { success: false, error: "Workflow is not enabled" })
      );

      await workflowsTrigger({ ...base, yes: true });

      const env = envelope(consoleLogSpy);
      expect(env.success).toBe(false);
      expect(env.command).toBe("workflows.trigger");
      expect(env.error?.code).toBe("WORKFLOW_REJECTED");
      expect(env.error?.message).toBe("Workflow is not enabled");
      expect(env.error?.suggestion).toBeTruthy();
      expect(process.exitCode).toBe(1);
    });

    it("HTTP 200 with a 'not found' success:false maps to NOT_FOUND", async () => {
      fetchMock.mockResolvedValue(
        respond(200, { success: false, error: "Contact not found" })
      );

      await workflowsTrigger({ ...base, yes: true });

      expect(envelope(consoleLogSpy).error?.code).toBe("NOT_FOUND");
      expect(process.exitCode).toBe(1);
    });

    it.each([
      [401, "NOT_AUTHENTICATED", { error: "Unauthorized" }],
      [402, "PLAN_REQUIRED", { error: "Plan does not include this" }],
      [403, "FORBIDDEN", { error: "Forbidden" }],
      [404, "NOT_FOUND", { error: "Workflow not found" }],
      [409, "API_ERROR", { error: "Conflict" }],
      [422, "VALIDATION_FAILED", { error: "Validation failed" }],
      [429, "RATE_LIMITED", { error: "Rate limit exceeded" }],
      [500, "SERVER_ERROR", { error: "Internal server error" }],
    ])("HTTP %i maps to %s and exit code 1", async (status, code, body) => {
      fetchMock.mockResolvedValue(respond(status, body));

      await workflowsTrigger({ ...base, yes: true });

      const env = envelope(consoleLogSpy);
      expect(env.success).toBe(false);
      expect(env.error?.code).toBe(code);
      expect(env.error?.suggestion).toBeTruthy();
      expect(process.exitCode).toBe(1);
    });

    it("a network failure maps to NETWORK_ERROR", async () => {
      fetchMock.mockRejectedValue(new Error("socket hang up"));

      await workflowsTrigger({ ...base, yes: true });

      expect(envelope(consoleLogSpy).error?.code).toBe("NETWORK_ERROR");
      expect(process.exitCode).toBe(1);
    });

    it("without credentials returns NOT_AUTHENTICATED and makes no request", async () => {
      vi.mocked(checkApiTarget).mockReturnValue({
        ok: false,
        reason: "No API token",
        suggestion: "Run: wraps auth login",
      } as never);

      await workflowsTrigger({ ...base, yes: true });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("NOT_AUTHENTICATED");
      expect(env.error?.suggestion).toBe("Run: wraps auth login");
      expect(process.exitCode).toBe(1);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("human mode reports errors through clack and sends nothing to stdout", async () => {
      setJsonMode(false);
      fetchMock.mockResolvedValue(
        respond(200, { success: false, error: "Workflow is not enabled" })
      );

      await workflowsTrigger({ ...base, yes: true });

      expect(log.error).toHaveBeenCalledWith("Workflow is not enabled");
      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });
  });

  describe("enable and disable", () => {
    it("enable requires --cron and makes no request without it", async () => {
      await workflowsEnable({ workflowId: "wf_1", token: "wraps_test" });

      const env = envelope(consoleLogSpy);
      expect(env.command).toBe("workflows.enable");
      expect(env.error?.code).toBe("MISSING_REQUIRED_FLAG");
      expect(process.exitCode).toBe(1);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("enable without --yes returns CONFIRMATION_REQUIRED and makes zero requests", async () => {
      await workflowsEnable({
        workflowId: "wf_1",
        cron: "cron(0 9 * * ? *)",
        token: "wraps_test",
      });

      const env = envelope(consoleLogSpy);
      expect(env.success).toBe(false);
      expect(env.command).toBe("workflows.enable");
      expect(env.error?.code).toBe("CONFIRMATION_REQUIRED");
      expect(env.error?.suggestion).toBeTruthy();
      expect(process.exitCode).toBe(1);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("enable reports a missing workflow ID", async () => {
      await workflowsEnable({ cron: "cron(0 9 * * ? *)" });

      expect(envelope(consoleLogSpy).error?.code).toBe("MISSING_REQUIRED_FLAG");
      expect(process.exitCode).toBe(1);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("enable posts to the workflow-schedules route and prints the fixed keys", async () => {
      fetchMock.mockResolvedValue(
        respond(200, { success: true, scheduleName: "wf_1-next" })
      );

      await workflowsEnable({
        workflowId: "wf_1",
        cron: "cron(0 9 * * ? *)",
        timezone: "UTC",
        yes: true,
        token: "wraps_test",
      });

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${API}/v1/workflow-schedules/wf_1/enable`);
      expect(JSON.parse(String(init.body))).toEqual({
        cronExpression: "cron(0 9 * * ? *)",
        timezone: "UTC",
      });

      const env = envelope(consoleLogSpy);
      expect(env.success).toBe(true);
      expect(env.command).toBe("workflows.enable");
      expect(Object.keys(env.data ?? {}).sort()).toEqual(
        ["cronExpression", "scheduleName", "timezone", "workflowId"].sort()
      );
      expect(env.data).toMatchObject({
        workflowId: "wf_1",
        scheduleName: "wf_1-next",
      });
      expect(process.exitCode).toBeUndefined();
    });

    it("enable surfaces a 404 as NOT_FOUND", async () => {
      fetchMock.mockResolvedValue(
        respond(404, { success: false, error: "Workflow not found" })
      );

      await workflowsEnable({
        workflowId: "wf_missing",
        cron: "cron(0 9 * * ? *)",
        yes: true,
        token: "wraps_test",
      });

      expect(envelope(consoleLogSpy).error?.code).toBe("NOT_FOUND");
      expect(process.exitCode).toBe(1);
    });

    it("enable surfaces a 500 as SERVER_ERROR", async () => {
      fetchMock.mockResolvedValue(
        respond(500, { success: false, error: "Failed to create schedule" })
      );

      await workflowsEnable({
        workflowId: "wf_1",
        cron: "cron(0 9 * * ? *)",
        yes: true,
        token: "wraps_test",
      });

      expect(envelope(consoleLogSpy).error?.code).toBe("SERVER_ERROR");
      expect(process.exitCode).toBe(1);
    });

    it("disable posts to the disable route and prints the fixed keys", async () => {
      fetchMock.mockResolvedValue(respond(200, { success: true }));

      await workflowsDisable({ workflowId: "wf_1", token: "wraps_test" });

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${API}/v1/workflow-schedules/wf_1/disable`);
      expect(init.body).toBeUndefined();

      const env = envelope(consoleLogSpy);
      expect(env.success).toBe(true);
      expect(env.command).toBe("workflows.disable");
      expect(Object.keys(env.data ?? {}).sort()).toEqual(
        ["disabled", "workflowId"].sort()
      );
      expect(process.exitCode).toBeUndefined();
    });

    it("disable reports a missing workflow ID without a request", async () => {
      await workflowsDisable({ token: "wraps_test" });

      expect(envelope(consoleLogSpy).error?.code).toBe("MISSING_REQUIRED_FLAG");
      expect(process.exitCode).toBe(1);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("retry and cancel", () => {
    it.each([
      ["retry", workflowsRetry],
      ["cancel", workflowsCancel],
    ])(
      "%s without --yes returns CONFIRMATION_REQUIRED and makes zero requests",
      async (_name, fn) => {
        await fn({ executionId: "exec_1", token: "wraps_test" });

        const env = envelope(consoleLogSpy);
        expect(env.error?.code).toBe("CONFIRMATION_REQUIRED");
        expect(process.exitCode).toBe(1);
        expect(fetchMock).not.toHaveBeenCalled();
      }
    );

    it.each([
      ["retry", workflowsRetry],
      ["cancel", workflowsCancel],
    ])("%s reports a missing execution ID", async (_name, fn) => {
      await fn({ yes: true, token: "wraps_test" });

      expect(envelope(consoleLogSpy).error?.code).toBe("MISSING_REQUIRED_FLAG");
      expect(process.exitCode).toBe(1);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("retry with --yes posts to the execution retry route", async () => {
      fetchMock.mockResolvedValue(
        respond(200, {
          success: true,
          message: "Execution retry started",
        })
      );

      await workflowsRetry({
        executionId: "exec_1",
        yes: true,
        token: "wraps_test",
      });

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${API}/v1/workflows/executions/exec_1/retry`);
      expect(init.method).toBe("POST");

      const env = envelope(consoleLogSpy);
      expect(env.success).toBe(true);
      expect(env.command).toBe("workflows.retry");
      expect(Object.keys(env.data ?? {}).sort()).toEqual(
        ["executionId", "message"].sort()
      );
      expect(env.data).toMatchObject({ executionId: "exec_1" });
      expect(process.exitCode).toBeUndefined();
    });

    it("retry treats HTTP 200 with success:false as WORKFLOW_REJECTED", async () => {
      fetchMock.mockResolvedValue(
        respond(200, {
          success: false,
          error: "Only failed executions can be retried",
        })
      );

      await workflowsRetry({
        executionId: "exec_1",
        yes: true,
        token: "wraps_test",
      });

      const env = envelope(consoleLogSpy);
      expect(env.success).toBe(false);
      expect(env.command).toBe("workflows.retry");
      expect(env.error?.code).toBe("WORKFLOW_REJECTED");
      expect(env.error?.message).toBe("Only failed executions can be retried");
      expect(process.exitCode).toBe(1);
    });

    it("retry with --yes maps a 429 to RATE_LIMITED", async () => {
      fetchMock.mockResolvedValue(respond(429, { error: "Rate limit" }));

      await workflowsRetry({
        executionId: "exec_1",
        yes: true,
        token: "wraps_test",
      });

      expect(envelope(consoleLogSpy).error?.code).toBe("RATE_LIMITED");
      expect(process.exitCode).toBe(1);
    });

    it("cancel with --yes posts to the execution cancel route", async () => {
      fetchMock.mockResolvedValue(respond(200, { success: true }));

      await workflowsCancel({
        executionId: "exec_1",
        yes: true,
        token: "wraps_test",
      });

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${API}/v1/workflows/executions/exec_1/cancel`);
      expect(init.method).toBe("POST");

      const env = envelope(consoleLogSpy);
      expect(env.success).toBe(true);
      expect(env.command).toBe("workflows.cancel");
      expect(Object.keys(env.data ?? {}).sort()).toEqual(
        ["cancelled", "executionId"].sort()
      );
      expect(env.data).toMatchObject({
        executionId: "exec_1",
        cancelled: true,
      });
      expect(process.exitCode).toBeUndefined();
    });

    it("cancel treats HTTP 200 with success:false as WORKFLOW_REJECTED", async () => {
      fetchMock.mockResolvedValue(
        respond(200, {
          success: false,
          error: 'Execution in "completed" status cannot be cancelled',
        })
      );

      await workflowsCancel({
        executionId: "exec_1",
        yes: true,
        token: "wraps_test",
      });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("WORKFLOW_REJECTED");
      expect(process.exitCode).toBe(1);
    });

    it("cancel with --yes maps a 403 to FORBIDDEN", async () => {
      fetchMock.mockResolvedValue(respond(403, { error: "Forbidden" }));

      await workflowsCancel({
        executionId: "exec_1",
        yes: true,
        token: "wraps_test",
      });

      expect(envelope(consoleLogSpy).error?.code).toBe("FORBIDDEN");
      expect(process.exitCode).toBe(1);
    });
  });
});
