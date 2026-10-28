/**
 * Unit tests for `wraps email agent approvals` (list/approve/reject).
 *
 * Boundaries are mocked (HTTP fetch, API target resolution, clack prompts);
 * the exported command functions run their real control flow. fetch is stubbed
 * for every test, so nothing reaches a real network.
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
import {
  agentApprovalsApprove,
  agentApprovalsList,
  agentApprovalsReject,
} from "../agent-approvals.js";

const API_BASE = "http://api.test";
const TOKEN = "wraps_test";
const LIST_COMMAND = "email.agent.approvals.list";
const APPROVE_COMMAND = "email.agent.approvals.approve";
const REJECT_COMMAND = "email.agent.approvals.reject";

const APPROVAL_KEYS = [
  "agentId",
  "createdAt",
  "decidedAt",
  "decidedBy",
  "errorMessage",
  "id",
  "messageId",
  "organizationId",
  "payload",
  "reason",
  "status",
  "updatedAt",
];

function approvalRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "apr_1",
    organizationId: "org_1",
    agentId: "agent-abc",
    payload: {
      from: "sdr@example.com",
      to: "lead@example.com",
      subject: "Hello",
    },
    reason: "recipient not on the allowlist",
    status: "PENDING",
    decidedBy: null,
    decidedAt: null,
    messageId: null,
    errorMessage: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

type ResponseLike = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

function res(status: number, body: unknown): ResponseLike {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

type Envelope = {
  success: boolean;
  command: string;
  data?: Record<string, unknown>;
  error?: { code: string; message: string; suggestion?: string };
};

describe("email agent approvals commands", () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    setJsonMode(true);
    process.exitCode = undefined;
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    vi.mocked(resolveApiTarget)
      .mockReset()
      .mockResolvedValue({} as never);
    vi.mocked(checkApiTarget)
      .mockReset()
      .mockReturnValue({
        ok: true,
        target: { apiBase: API_BASE, token: TOKEN },
      } as never);

    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    setJsonMode(false);
    process.exitCode = undefined;
    consoleLogSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  /** The single JSON envelope this invocation printed. */
  function envelope(): Envelope {
    const lines = consoleLogSpy.mock.calls.map((c) => String(c[0]));
    expect(lines).toHaveLength(1);
    return JSON.parse(lines[0]) as Envelope;
  }

  /** Assert a failure envelope with the given code, a suggestion, and exit code 1. */
  function expectError(code: string, command: string): Envelope {
    const env = envelope();
    expect(env.command).toBe(command);
    expect(env.success).toBe(false);
    expect(env.error?.code).toBe(code);
    expect(env.error?.message).toBeTruthy();
    expect(env.error?.suggestion).toBeTruthy();
    expect(process.exitCode).toBe(1);
    return env;
  }

  function respondOnce(status: number, body: unknown) {
    fetchMock.mockResolvedValueOnce(res(status, body));
  }

  // ---------------------------------------------------------------------------
  // list
  // ---------------------------------------------------------------------------
  describe("approvals list", () => {
    it("lists the queue with a fixed data shape and no query string", async () => {
      respondOnce(200, { approvals: [approvalRecord()] });

      await agentApprovalsList({});

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toBe(
        `${API_BASE}/v1/agents/approvals`
      );
      const env = envelope();
      expect(env.success).toBe(true);
      expect(env.command).toBe(LIST_COMMAND);
      expect(Object.keys(env.data ?? {})).toEqual(["approvals", "nextCursor"]);
      expect(env.data?.nextCursor).toBeNull();
      const [first] = env.data?.approvals as Record<string, unknown>[];
      expect(Object.keys(first).sort()).toEqual([...APPROVAL_KEYS].sort());
      expect(first.id).toBe("apr_1");
      expect(process.exitCode).toBeUndefined();
    });

    it("sends --status as an upper-case query parameter", async () => {
      respondOnce(200, { approvals: [] });

      await agentApprovalsList({ status: "pending" });

      expect(fetchMock.mock.calls[0][0]).toBe(
        `${API_BASE}/v1/agents/approvals?status=PENDING`
      );
      const env = envelope();
      expect(env.success).toBe(true);
      expect(env.data?.approvals).toEqual([]);
    });

    it("sends the bearer token on every request", async () => {
      respondOnce(200, { approvals: [] });

      await agentApprovalsList({});

      const init = fetchMock.mock.calls[0][1] as RequestInit;
      expect((init.headers as Record<string, string>).Authorization).toBe(
        `Bearer ${TOKEN}`
      );
    });

    it("an unknown --status is VALIDATION and makes no request", async () => {
      await agentApprovalsList({ status: "bogus" });

      expect(fetchMock).not.toHaveBeenCalled();
      expectError("VALIDATION", LIST_COMMAND);
    });

    it("no credentials is NOT_AUTHENTICATED and makes no request", async () => {
      vi.mocked(checkApiTarget).mockReturnValue({
        ok: false,
        reason: "No API token",
        suggestion: "Run: wraps auth login",
      } as never);

      await agentApprovalsList({});

      expect(fetchMock).not.toHaveBeenCalled();
      expectError("NOT_AUTHENTICATED", LIST_COMMAND);
    });

    it("401 is NOT_AUTHENTICATED", async () => {
      respondOnce(401, { error: "Unauthorized", code: "UNAUTHORIZED" });

      await agentApprovalsList({});

      expectError("NOT_AUTHENTICATED", LIST_COMMAND);
    });

    it("422 from the API is VALIDATION_FAILED", async () => {
      respondOnce(422, { error: "Invalid status", code: "VALIDATION_FAILED" });

      await agentApprovalsList({ status: "SENT" });

      expectError("VALIDATION_FAILED", LIST_COMMAND);
    });

    it("429 is RATE_LIMITED", async () => {
      respondOnce(429, { error: "Rate limit exceeded", code: "RATE_LIMITED" });

      await agentApprovalsList({});

      expectError("RATE_LIMITED", LIST_COMMAND);
    });

    it("5xx is SERVER_ERROR", async () => {
      respondOnce(500, { error: "Internal server error" });

      await agentApprovalsList({});

      expectError("SERVER_ERROR", LIST_COMMAND);
    });

    it("another non-2xx status is API_ERROR", async () => {
      respondOnce(408, { error: "Request timeout" });

      await agentApprovalsList({});

      expectError("API_ERROR", LIST_COMMAND);
    });

    it("a network failure is NETWORK_ERROR, not a thrown exception", async () => {
      fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));

      await agentApprovalsList({});

      expectError("NETWORK_ERROR", LIST_COMMAND);
    });

    it("a body without an approvals array is INVALID_RESPONSE", async () => {
      respondOnce(200, {});

      await agentApprovalsList({});

      expectError("INVALID_RESPONSE", LIST_COMMAND);
    });

    it("human mode: an API error prints through clack and still sets exit code 1", async () => {
      setJsonMode(false);
      respondOnce(429, { error: "Rate limit exceeded" });

      await agentApprovalsList({});

      expect(clack.log.error).toHaveBeenCalledTimes(1);
      expect(String(vi.mocked(clack.log.error).mock.calls[0][0])).toContain(
        "Rate limit exceeded"
      );
      expect(process.exitCode).toBe(1);
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it("human mode: an empty queue prints info and succeeds", async () => {
      setJsonMode(false);
      respondOnce(200, { approvals: [] });

      await agentApprovalsList({});

      expect(clack.log.info).toHaveBeenCalledWith(
        "The approval queue is empty."
      );
      expect(process.exitCode).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // approve
  // ---------------------------------------------------------------------------
  describe("approvals approve", () => {
    it("without --yes is CONFIRMATION_REQUIRED and makes zero requests", async () => {
      await agentApprovalsApprove({ id: "apr_1" });

      expect(fetchMock).not.toHaveBeenCalled();
      expectError("CONFIRMATION_REQUIRED", APPROVE_COMMAND);
    });

    it("without --id is MISSING_REQUIRED_FLAG and makes zero requests", async () => {
      await agentApprovalsApprove({ yes: true });

      expect(fetchMock).not.toHaveBeenCalled();
      expectError("MISSING_REQUIRED_FLAG", APPROVE_COMMAND);
    });

    it("with --yes posts to the approve route and returns the fixed approval keys", async () => {
      respondOnce(
        200,
        approvalRecord({
          status: "SENT",
          decidedBy: "user_1",
          decidedAt: "2026-10-01T00:01:00.000Z",
          messageId: "msg_1",
        })
      );

      await agentApprovalsApprove({ id: "apr_1", yes: true });

      expect(fetchMock.mock.calls[0][0]).toBe(
        `${API_BASE}/v1/agents/approvals/apr_1/approve`
      );
      expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe("POST");
      const env = envelope();
      expect(env.success).toBe(true);
      expect(env.command).toBe(APPROVE_COMMAND);
      expect(Object.keys(env.data ?? {}).sort()).toEqual(
        [...APPROVAL_KEYS].sort()
      );
      expect(env.data?.id).toBe("apr_1");
      expect(env.data?.status).toBe("SENT");
      expect(env.data?.messageId).toBe("msg_1");
      expect(process.exitCode).toBeUndefined();
    });

    it("status FAILED from a 200 is SEND_FAILED with exit code 1 and the id in the message", async () => {
      respondOnce(
        200,
        approvalRecord({
          status: "FAILED",
          errorMessage: "Email address is not verified",
        })
      );

      await agentApprovalsApprove({ id: "apr_1", yes: true });

      const env = expectError("SEND_FAILED", APPROVE_COMMAND);
      expect(env.error?.message).toContain("apr_1");
      expect(env.error?.message).toContain("Email address is not verified");
    });

    it("a status other than SENT or FAILED is UNEXPECTED_STATUS", async () => {
      respondOnce(200, approvalRecord({ status: "APPROVED" }));

      await agentApprovalsApprove({ id: "apr_1", yes: true });

      expectError("UNEXPECTED_STATUS", APPROVE_COMMAND);
    });

    it("a non-object body is INVALID_RESPONSE", async () => {
      respondOnce(200, null);

      await agentApprovalsApprove({ id: "apr_1", yes: true });

      expectError("INVALID_RESPONSE", APPROVE_COMMAND);
    });

    it("403 (key creator is not owner or admin) is FORBIDDEN_ROLE with an owner/admin suggestion", async () => {
      respondOnce(403, {
        error: "This action requires an organization owner or admin",
        code: "FORBIDDEN",
      });

      await agentApprovalsApprove({ id: "apr_1", yes: true });

      const env = expectError("FORBIDDEN_ROLE", APPROVE_COMMAND);
      expect(env.error?.suggestion).toContain("owner or admin");
    });

    it("404 is NOT_FOUND", async () => {
      respondOnce(404, { error: "Approval not found", code: "NOT_FOUND" });

      await agentApprovalsApprove({ id: "apr_missing", yes: true });

      expectError("NOT_FOUND", APPROVE_COMMAND);
    });

    it("409 (agent killed, or already decided) is CONFLICT", async () => {
      respondOnce(409, {
        error: "Agent is killed — cannot approve its sends",
        code: "CONFLICT",
      });

      await agentApprovalsApprove({ id: "apr_1", yes: true });

      expectError("CONFLICT", APPROVE_COMMAND);
    });

    it("401 is NOT_AUTHENTICATED", async () => {
      respondOnce(401, { error: "Unauthorized" });

      await agentApprovalsApprove({ id: "apr_1", yes: true });

      expectError("NOT_AUTHENTICATED", APPROVE_COMMAND);
    });

    it("429 is RATE_LIMITED", async () => {
      respondOnce(429, { error: "Rate limit exceeded" });

      await agentApprovalsApprove({ id: "apr_1", yes: true });

      expectError("RATE_LIMITED", APPROVE_COMMAND);
    });

    it("5xx is SERVER_ERROR", async () => {
      respondOnce(503, { error: "Service unavailable" });

      await agentApprovalsApprove({ id: "apr_1", yes: true });

      expectError("SERVER_ERROR", APPROVE_COMMAND);
    });

    it("reads message before error when both are present", async () => {
      respondOnce(409, { message: "Approval already SENT", error: "conflict" });

      await agentApprovalsApprove({ id: "apr_1", yes: true });

      const env = expectError("CONFLICT", APPROVE_COMMAND);
      expect(env.error?.message).toBe("Approval already SENT");
    });

    it("encodes the id as a single path segment", async () => {
      respondOnce(200, approvalRecord({ id: "a/b", status: "SENT" }));

      await agentApprovalsApprove({ id: "a/b", yes: true });

      expect(fetchMock.mock.calls[0][0]).toBe(
        `${API_BASE}/v1/agents/approvals/a%2Fb/approve`
      );
    });

    it("no credentials is NOT_AUTHENTICATED with --yes, and makes no request", async () => {
      vi.mocked(checkApiTarget).mockReturnValue({
        ok: false,
        reason: "No API token",
        suggestion: "Run: wraps auth login",
      } as never);

      await agentApprovalsApprove({ id: "apr_1", yes: true });

      expect(fetchMock).not.toHaveBeenCalled();
      expectError("NOT_AUTHENTICATED", APPROVE_COMMAND);
    });

    it("human mode: a refused approve prints through clack and sets exit code 1", async () => {
      setJsonMode(false);
      respondOnce(403, {
        error: "This action requires an organization owner or admin",
      });

      await agentApprovalsApprove({ id: "apr_1", yes: true });

      expect(clack.log.error).toHaveBeenCalledTimes(1);
      expect(process.exitCode).toBe(1);
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // reject
  // ---------------------------------------------------------------------------
  describe("approvals reject", () => {
    it("without --yes is CONFIRMATION_REQUIRED and makes zero requests", async () => {
      await agentApprovalsReject({ id: "apr_1" });

      expect(fetchMock).not.toHaveBeenCalled();
      expectError("CONFIRMATION_REQUIRED", REJECT_COMMAND);
    });

    it("without --id is MISSING_REQUIRED_FLAG and makes zero requests", async () => {
      await agentApprovalsReject({ yes: true });

      expect(fetchMock).not.toHaveBeenCalled();
      expectError("MISSING_REQUIRED_FLAG", REJECT_COMMAND);
    });

    it("with --yes posts to the reject route and returns the fixed approval keys", async () => {
      respondOnce(
        200,
        approvalRecord({ status: "REJECTED", decidedBy: "user_1" })
      );

      await agentApprovalsReject({ id: "apr_1", yes: true });

      expect(fetchMock.mock.calls[0][0]).toBe(
        `${API_BASE}/v1/agents/approvals/apr_1/reject`
      );
      const env = envelope();
      expect(env.success).toBe(true);
      expect(env.command).toBe(REJECT_COMMAND);
      expect(Object.keys(env.data ?? {}).sort()).toEqual(
        [...APPROVAL_KEYS].sort()
      );
      expect(env.data?.status).toBe("REJECTED");
      expect(process.exitCode).toBeUndefined();
    });

    it("409 (already decided) is CONFLICT", async () => {
      respondOnce(409, { error: "Approval already SENT", code: "CONFLICT" });

      await agentApprovalsReject({ id: "apr_1", yes: true });

      const env = expectError("CONFLICT", REJECT_COMMAND);
      expect(env.error?.message).toContain("already SENT");
    });

    it("403 is FORBIDDEN_ROLE", async () => {
      respondOnce(403, {
        error: "This action requires an organization owner or admin",
      });

      await agentApprovalsReject({ id: "apr_1", yes: true });

      expectError("FORBIDDEN_ROLE", REJECT_COMMAND);
    });

    it("404 is NOT_FOUND", async () => {
      respondOnce(404, { error: "Approval not found" });

      await agentApprovalsReject({ id: "apr_missing", yes: true });

      expectError("NOT_FOUND", REJECT_COMMAND);
    });

    it("a 200 that is not REJECTED is UNEXPECTED_STATUS", async () => {
      respondOnce(200, approvalRecord({ status: "PENDING" }));

      await agentApprovalsReject({ id: "apr_1", yes: true });

      expectError("UNEXPECTED_STATUS", REJECT_COMMAND);
    });

    it("a rejected fetch is NETWORK_ERROR, not a thrown exception", async () => {
      fetchMock.mockRejectedValueOnce(new Error("socket hang up"));

      await agentApprovalsReject({ id: "apr_1", yes: true });

      expectError("NETWORK_ERROR", REJECT_COMMAND);
    });

    it("human mode: a confirmed reject prints success and leaves the exit code unset", async () => {
      setJsonMode(false);
      respondOnce(200, approvalRecord({ status: "REJECTED" }));

      await agentApprovalsReject({ id: "apr_1", yes: true });

      expect(clack.log.success).toHaveBeenCalledWith(
        expect.stringContaining("Rejected approval")
      );
      expect(process.exitCode).toBeUndefined();
    });
  });
});
