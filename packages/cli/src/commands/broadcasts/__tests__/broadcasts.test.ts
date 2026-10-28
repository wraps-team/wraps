/**
 * Tests for `wraps broadcasts`.
 *
 * fetch and the API target are mocked. Each test checks the --json envelope
 * (parsed from the single console.log line), its fixed data keys, the exit
 * code, and the request count. create/send/resume without --yes, and
 * create --dry-run, must make zero requests.
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
  broadcastsCreate,
  broadcastsRecipients,
  broadcastsResume,
  broadcastsSend,
  broadcastsStatus,
} from "../broadcasts.js";

const API_BASE = "http://api.test";
const TOKEN = "wraps_test";

type Envelope = {
  success: boolean;
  command: string;
  data?: Record<string, unknown>;
  error?: { code: string; message: string; suggestion?: string };
};

const CREATE_KEYS = [
  "id",
  "status",
  "channel",
  "totalRecipients",
  "createdAt",
  "warning",
  "dryRun",
  "payload",
];
const SEND_KEYS = ["id", "status", "warning"];
const STATUS_KEYS = [
  "id",
  "status",
  "channel",
  "name",
  "totalRecipients",
  "processedRecipients",
  "sent",
  "delivered",
  "failed",
  "opened",
  "clicked",
  "bounced",
  "complained",
  "suppressed",
  "startedAt",
  "completedAt",
  "createdAt",
];
const RECIPIENTS_KEYS = [
  "id",
  "recipients",
  "limit",
  "offset",
  "total",
  "nextCursor",
];
const RESUME_KEYS = ["id", "resumed", "fromChunkIndex"];

function response(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

describe("wraps broadcasts", () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  const fetchMock = vi.fn();

  function envelope(): Envelope {
    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    return JSON.parse(String(consoleLogSpy.mock.calls[0][0])) as Envelope;
  }

  function sentBody(callIndex = 0): Record<string, unknown> {
    const init = fetchMock.mock.calls[callIndex][1] as { body?: string };
    return JSON.parse(String(init.body)) as Record<string, unknown>;
  }

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
    consoleLogSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  describe("broadcastsCreate", () => {
    it("dry-run reports the payload and makes no request", async () => {
      await broadcastsCreate({
        dryRun: true,
        awsAccountId: "acct_1",
        subject: "Hello",
        audienceType: "all",
        json: true,
      });

      expect(fetchMock).not.toHaveBeenCalled();
      expect(resolveApiTarget).not.toHaveBeenCalled();
      const env = envelope();
      expect(env.success).toBe(true);
      expect(env.command).toBe("broadcasts.create");
      expect(Object.keys(env.data ?? {}).sort()).toEqual(
        [...CREATE_KEYS].sort()
      );
      expect(env.data?.id).toBeNull();
      expect(env.data?.dryRun).toBe(true);
      expect(env.data?.payload).toEqual({
        awsAccountId: "acct_1",
        subject: "Hello",
        audienceType: "all",
      });
      expect(process.exitCode).toBeUndefined();
    });

    it("dry-run without an AWS account id fails locally with MISSING_REQUIRED_FLAG", async () => {
      await broadcastsCreate({ dryRun: true, subject: "Hello", json: true });

      expect(fetchMock).not.toHaveBeenCalled();
      const env = envelope();
      expect(env.success).toBe(false);
      expect(env.command).toBe("broadcasts.create");
      expect(env.error?.code).toBe("MISSING_REQUIRED_FLAG");
      expect(env.error?.suggestion).toBeTruthy();
      expect(process.exitCode).toBe(1);
    });

    it("refuses without --yes and makes zero requests", async () => {
      await broadcastsCreate({
        awsAccountId: "acct_1",
        subject: "Hi",
        json: true,
      });

      expect(fetchMock).not.toHaveBeenCalled();
      const env = envelope();
      expect(env.error?.code).toBe("CONFIRMATION_REQUIRED");
      expect(env.error?.suggestion).toContain("--yes");
      expect(process.exitCode).toBe(1);
    });

    it("queues the send with --yes and emits the stable envelope", async () => {
      fetchMock.mockResolvedValueOnce(
        response(200, {
          id: "bc_1",
          status: "queued",
          channel: "email",
          totalRecipients: 3,
          createdAt: "2026-10-27T00:00:00.000Z",
        })
      );

      await broadcastsCreate({
        yes: true,
        awsAccountId: "acct_1",
        subject: "Hi",
        json: true,
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [
        string,
        { method: string; headers: Record<string, string> },
      ];
      expect(url).toBe(`${API_BASE}/v1/batch`);
      expect(init.method).toBe("POST");
      expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
      expect(sentBody()).toEqual({ awsAccountId: "acct_1", subject: "Hi" });

      const env = envelope();
      expect(env.success).toBe(true);
      expect(env.command).toBe("broadcasts.create");
      expect(Object.keys(env.data ?? {}).sort()).toEqual(
        [...CREATE_KEYS].sort()
      );
      expect(env.data?.id).toBe("bc_1");
      expect(env.data?.warning).toBeNull();
      expect(process.exitCode).toBeUndefined();
    });

    it("scheduled sends send scheduledFor as ISO and keep the API warning", async () => {
      fetchMock.mockResolvedValueOnce(
        response(200, {
          id: "bc_2",
          status: "scheduled",
          channel: "email",
          totalRecipients: 1,
          createdAt: "2026-10-27T00:00:00.000Z",
          warning: "Recipient count was estimated",
        })
      );

      await broadcastsCreate({
        yes: true,
        awsAccountId: "acct_1",
        scheduledFor: "2030-01-01T09:00:00Z",
        json: true,
      });

      expect(sentBody().scheduledFor).toBe("2030-01-01T09:00:00.000Z");
      const env = envelope();
      expect(env.data?.status).toBe("scheduled");
      expect(env.data?.warning).toBe("Recipient count was estimated");
    });

    it("rejects an unknown channel before any request", async () => {
      await broadcastsCreate({
        yes: true,
        awsAccountId: "acct_1",
        channel: "fax",
        json: true,
      });

      expect(fetchMock).not.toHaveBeenCalled();
      expect(envelope().error?.code).toBe("INVALID_FLAG_USAGE");
      expect(process.exitCode).toBe(1);
    });

    it("rejects a topic audience without --topic-id", async () => {
      await broadcastsCreate({
        dryRun: true,
        awsAccountId: "acct_1",
        audienceType: "topic",
        json: true,
      });

      expect(fetchMock).not.toHaveBeenCalled();
      expect(envelope().error?.code).toBe("MISSING_REQUIRED_FLAG");
      expect(process.exitCode).toBe(1);
    });

    it("reports NOT_AUTHENTICATED when no target is configured", async () => {
      vi.mocked(checkApiTarget).mockReturnValueOnce({
        ok: false,
        reason: "No API token",
        suggestion: "Run: wraps auth login",
      } as never);

      await broadcastsCreate({
        yes: true,
        awsAccountId: "acct_1",
        json: true,
      });

      expect(fetchMock).not.toHaveBeenCalled();
      expect(envelope().error?.code).toBe("NOT_AUTHENTICATED");
      expect(process.exitCode).toBe(1);
    });

    it("maps 401 to NOT_AUTHENTICATED", async () => {
      fetchMock.mockResolvedValueOnce(response(401, { error: "Unauthorized" }));

      await broadcastsCreate({ yes: true, awsAccountId: "acct_1", json: true });

      const env = envelope();
      expect(env.error?.code).toBe("NOT_AUTHENTICATED");
      expect(env.error?.message).toBe("Unauthorized");
      expect(process.exitCode).toBe(1);
    });

    it("maps a foreign AWS account 403 to FORBIDDEN", async () => {
      fetchMock.mockResolvedValueOnce(
        response(403, {
          id: "",
          status: "error",
          error: "AWS account does not belong to this organization",
          code: "FORBIDDEN",
        })
      );

      await broadcastsCreate({ yes: true, awsAccountId: "acct_x", json: true });

      const env = envelope();
      expect(env.error?.code).toBe("FORBIDDEN");
      expect(env.error?.message).toBe(
        "AWS account does not belong to this organization"
      );
      expect(env.error?.suggestion).toContain("--aws-account-id");
      expect(process.exitCode).toBe(1);
    });

    it("maps a topic entitlement 403 to PLAN_REQUIRED", async () => {
      fetchMock.mockResolvedValueOnce(
        response(403, {
          error:
            "Topic broadcasts requires the pro plan or higher. Upgrade at https://wraps.dev/upgrade",
          code: "FORBIDDEN",
        })
      );

      await broadcastsCreate({
        yes: true,
        awsAccountId: "acct_1",
        audienceType: "topic",
        topicId: "t_1",
        json: true,
      });

      const env = envelope();
      expect(env.error?.code).toBe("PLAN_REQUIRED");
      expect(env.error?.suggestion).toContain("wraps.dev/upgrade");
      expect(process.exitCode).toBe(1);
    });

    it("maps 402 to PLAN_REQUIRED", async () => {
      fetchMock.mockResolvedValueOnce(
        response(402, { error: "Payment required", code: "PAYMENT_REQUIRED" })
      );

      await broadcastsCreate({ yes: true, awsAccountId: "acct_1", json: true });

      expect(envelope().error?.code).toBe("PLAN_REQUIRED");
      expect(process.exitCode).toBe(1);
    });

    it("maps 400 to VALIDATION_FAILED", async () => {
      fetchMock.mockResolvedValueOnce(
        response(400, {
          error: "scheduledFor must be in the future",
          code: "BAD_REQUEST",
        })
      );

      await broadcastsCreate({ yes: true, awsAccountId: "acct_1", json: true });

      expect(envelope().error?.code).toBe("VALIDATION_FAILED");
      expect(process.exitCode).toBe(1);
    });

    it("maps other 4xx to REQUEST_FAILED", async () => {
      fetchMock.mockResolvedValueOnce(
        response(413, { error: "Payload too large", code: "PAYLOAD_TOO_LARGE" })
      );

      await broadcastsCreate({ yes: true, awsAccountId: "acct_1", json: true });

      expect(envelope().error?.code).toBe("REQUEST_FAILED");
      expect(process.exitCode).toBe(1);
    });

    it("maps 429 to RATE_LIMITED", async () => {
      fetchMock.mockResolvedValueOnce(
        response(429, { error: "Rate limit exceeded", code: "RATE_LIMITED" })
      );

      await broadcastsCreate({ yes: true, awsAccountId: "acct_1", json: true });

      expect(envelope().error?.code).toBe("RATE_LIMITED");
      expect(process.exitCode).toBe(1);
    });

    it("maps 5xx to SERVER_ERROR and tells the user to check status first", async () => {
      fetchMock.mockResolvedValueOnce(
        response(500, {
          error: "Internal server error",
          code: "INTERNAL_ERROR",
        })
      );

      await broadcastsCreate({ yes: true, awsAccountId: "acct_1", json: true });

      const env = envelope();
      expect(env.error?.code).toBe("SERVER_ERROR");
      expect(env.error?.suggestion).toContain("broadcasts status");
      expect(process.exitCode).toBe(1);
    });

    it("maps a network failure to NETWORK_ERROR without raising", async () => {
      fetchMock.mockRejectedValueOnce(new Error("socket hang up"));

      await expect(
        broadcastsCreate({ yes: true, awsAccountId: "acct_1", json: true })
      ).resolves.toBeUndefined();

      const env = envelope();
      expect(env.error?.code).toBe("NETWORK_ERROR");
      expect(env.error?.message).toContain("socket hang up");
      expect(process.exitCode).toBe(1);
    });

    it("prints errors through clack in human mode and still sets the exit code", async () => {
      setJsonMode(false);

      await broadcastsCreate({ dryRun: true, json: false });

      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(clack.log.error).toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });
  });

  describe("broadcastsSend", () => {
    it("refuses without --yes and makes zero requests", async () => {
      await broadcastsSend({
        id: "bc_1",
        awsAccountId: "acct_1",
        totalRecipients: "3",
        json: true,
      });

      expect(fetchMock).not.toHaveBeenCalled();
      expect(envelope().error?.code).toBe("CONFIRMATION_REQUIRED");
      expect(process.exitCode).toBe(1);
    });

    it("requires the broadcast id inside the command", async () => {
      await broadcastsSend({
        yes: true,
        awsAccountId: "acct_1",
        totalRecipients: "3",
        json: true,
      });

      expect(fetchMock).not.toHaveBeenCalled();
      const env = envelope();
      expect(env.command).toBe("broadcasts.send");
      expect(env.error?.code).toBe("MISSING_REQUIRED_FLAG");
      expect(process.exitCode).toBe(1);
    });

    it("requires --total-recipients because the route needs it", async () => {
      await broadcastsSend({
        id: "bc_1",
        yes: true,
        awsAccountId: "acct_1",
        json: true,
      });

      expect(fetchMock).not.toHaveBeenCalled();
      expect(envelope().error?.code).toBe("MISSING_REQUIRED_FLAG");
      expect(process.exitCode).toBe(1);
    });

    it("promotes the draft with --yes and emits the stable envelope", async () => {
      fetchMock.mockResolvedValueOnce(
        response(201, { id: "bc_1", status: "queued" })
      );

      await broadcastsSend({
        id: "bc_1",
        yes: true,
        awsAccountId: "acct_1",
        totalRecipients: "3",
        json: true,
      });

      const [url, init] = fetchMock.mock.calls[0] as [
        string,
        { method: string },
      ];
      expect(url).toBe(`${API_BASE}/v1/batch/bc_1/send`);
      expect(init.method).toBe("POST");
      expect(sentBody()).toEqual({
        awsAccountId: "acct_1",
        totalRecipients: 3,
      });

      const env = envelope();
      expect(env.success).toBe(true);
      expect(env.command).toBe("broadcasts.send");
      expect(Object.keys(env.data ?? {}).sort()).toEqual([...SEND_KEYS].sort());
      expect(env.data?.id).toBe("bc_1");
      expect(process.exitCode).toBeUndefined();
    });

    it("encodes the id in the path", async () => {
      fetchMock.mockResolvedValueOnce(
        response(201, { id: "a/b", status: "queued" })
      );

      await broadcastsSend({
        id: "a/b",
        yes: true,
        awsAccountId: "acct_1",
        totalRecipients: "1",
        json: true,
      });

      expect(fetchMock.mock.calls[0][0]).toBe(
        `${API_BASE}/v1/batch/a%2Fb/send`
      );
    });

    it("explains NOT_DRAFT when the broadcast is not a draft", async () => {
      fetchMock.mockResolvedValueOnce(
        response(400, {
          error:
            "Cannot promote batch in 'queued' status. Only drafts can be promoted.",
          code: "BAD_REQUEST",
        })
      );

      await broadcastsSend({
        id: "bc_1",
        yes: true,
        awsAccountId: "acct_1",
        totalRecipients: "3",
        json: true,
      });

      const env = envelope();
      expect(env.error?.code).toBe("NOT_DRAFT");
      expect(env.error?.suggestion).toContain("dashboard");
      expect(process.exitCode).toBe(1);
    });

    it("maps 404 to NOT_FOUND", async () => {
      fetchMock.mockResolvedValueOnce(
        response(404, { error: "Batch not found", code: "NOT_FOUND" })
      );

      await broadcastsSend({
        id: "bc_missing",
        yes: true,
        awsAccountId: "acct_1",
        totalRecipients: "3",
        json: true,
      });

      expect(envelope().error?.code).toBe("NOT_FOUND");
      expect(process.exitCode).toBe(1);
    });
  });

  describe("broadcastsStatus", () => {
    it("returns the fixed status keys", async () => {
      fetchMock.mockResolvedValueOnce(
        response(200, {
          id: "bc_1",
          status: "completed",
          channel: "email",
          name: "Launch",
          totalRecipients: 10,
          processedRecipients: 10,
          sent: 10,
          delivered: 9,
          failed: 1,
          opened: 4,
          clicked: 2,
          bounced: 1,
          complained: 0,
          suppressed: 0,
          startedAt: "2026-10-27T00:00:00.000Z",
          completedAt: "2026-10-27T00:05:00.000Z",
          createdAt: "2026-10-26T23:59:00.000Z",
        })
      );

      await broadcastsStatus({ id: "bc_1", json: true });

      const [url, init] = fetchMock.mock.calls[0] as [
        string,
        { method: string },
      ];
      expect(url).toBe(`${API_BASE}/v1/batch/bc_1`);
      expect(init.method).toBe("GET");
      const env = envelope();
      expect(env.success).toBe(true);
      expect(env.command).toBe("broadcasts.status");
      expect(Object.keys(env.data ?? {}).sort()).toEqual(
        [...STATUS_KEYS].sort()
      );
      expect(env.data?.id).toBe("bc_1");
      expect(env.data?.delivered).toBe(9);
      expect(process.exitCode).toBeUndefined();
    });

    it("requires the broadcast id", async () => {
      await broadcastsStatus({ json: true });

      expect(fetchMock).not.toHaveBeenCalled();
      expect(envelope().error?.code).toBe("MISSING_REQUIRED_FLAG");
      expect(process.exitCode).toBe(1);
    });

    it("maps 404 to NOT_FOUND", async () => {
      fetchMock.mockResolvedValueOnce(
        response(404, { error: "Batch not found", code: "NOT_FOUND" })
      );

      await broadcastsStatus({ id: "bc_x", json: true });

      expect(envelope().error?.code).toBe("NOT_FOUND");
      expect(process.exitCode).toBe(1);
    });
  });

  describe("broadcastsRecipients", () => {
    it("sends limit and offset and returns a nextCursor when more rows remain", async () => {
      fetchMock.mockResolvedValueOnce(
        response(200, {
          data: [
            { id: "r1", recipient: "a@example.com", status: "sent" },
            { id: "r2", recipient: "b@example.com", status: "sent" },
          ],
          limit: 2,
          offset: 0,
          total: 5,
        })
      );

      await broadcastsRecipients({ id: "bc_1", limit: "2", json: true });

      const url = String(fetchMock.mock.calls[0][0]);
      expect(url).toBe(`${API_BASE}/v1/batch/bc_1/recipients?limit=2&offset=0`);
      const env = envelope();
      expect(env.success).toBe(true);
      expect(env.command).toBe("broadcasts.recipients");
      expect(Object.keys(env.data ?? {}).sort()).toEqual(
        [...RECIPIENTS_KEYS].sort()
      );
      expect(env.data?.nextCursor).toBe("2");
      expect(env.data?.total).toBe(5);
      expect(process.exitCode).toBeUndefined();
    });

    it("returns a null nextCursor on the last page", async () => {
      fetchMock.mockResolvedValueOnce(
        response(200, {
          data: [{ id: "r5", recipient: "e@example.com", status: "sent" }],
          limit: 2,
          offset: 4,
          total: 5,
        })
      );

      await broadcastsRecipients({
        id: "bc_1",
        cursor: "4",
        limit: "2",
        json: true,
      });

      expect(String(fetchMock.mock.calls[0][0])).toContain("offset=4");
      expect(envelope().data?.nextCursor).toBeNull();
    });

    it("without total, returns the next offset only when the page is full", async () => {
      fetchMock.mockResolvedValueOnce(
        response(200, {
          data: [
            { id: "r1", recipient: "a@example.com", status: "sent" },
            { id: "r2", recipient: "b@example.com", status: "sent" },
          ],
          limit: 2,
          offset: 0,
        })
      );

      await broadcastsRecipients({ id: "bc_1", limit: "2", json: true });

      expect(envelope().data?.total).toBeNull();
      expect(envelope().data?.nextCursor).toBe("2");
    });

    it("without total, a short page has no nextCursor", async () => {
      fetchMock.mockResolvedValueOnce(
        response(200, {
          data: [{ id: "r9", recipient: "z@example.com", status: "sent" }],
          limit: 2,
          offset: 4,
        })
      );

      await broadcastsRecipients({
        id: "bc_1",
        cursor: "4",
        limit: "2",
        json: true,
      });

      expect(envelope().data?.nextCursor).toBeNull();
    });

    it("passes the status filter through", async () => {
      fetchMock.mockResolvedValueOnce(
        response(200, { data: [], limit: 50, offset: 0, total: 0 })
      );

      await broadcastsRecipients({ id: "bc_1", status: "bounced", json: true });

      expect(String(fetchMock.mock.calls[0][0])).toContain("status=bounced");
      expect(envelope().data?.nextCursor).toBeNull();
    });

    it("rejects a limit outside 1-1000 before any request", async () => {
      await broadcastsRecipients({ id: "bc_1", limit: "0", json: true });

      expect(fetchMock).not.toHaveBeenCalled();
      expect(envelope().error?.code).toBe("INVALID_FLAG_USAGE");
      expect(process.exitCode).toBe(1);
    });

    it("rejects a cursor that is not an offset before any request", async () => {
      await broadcastsRecipients({ id: "bc_1", cursor: "abc", json: true });

      expect(fetchMock).not.toHaveBeenCalled();
      expect(envelope().error?.code).toBe("INVALID_FLAG_USAGE");
      expect(process.exitCode).toBe(1);
    });

    it("requires the broadcast id", async () => {
      await broadcastsRecipients({ json: true });

      expect(fetchMock).not.toHaveBeenCalled();
      expect(envelope().error?.code).toBe("MISSING_REQUIRED_FLAG");
      expect(process.exitCode).toBe(1);
    });
  });

  describe("broadcastsResume", () => {
    it("refuses without --yes and makes zero requests", async () => {
      await broadcastsResume({ id: "bc_1", json: true });

      expect(fetchMock).not.toHaveBeenCalled();
      expect(envelope().error?.code).toBe("CONFIRMATION_REQUIRED");
      expect(process.exitCode).toBe(1);
    });

    it("requires the broadcast id", async () => {
      await broadcastsResume({ yes: true, json: true });

      expect(fetchMock).not.toHaveBeenCalled();
      expect(envelope().error?.code).toBe("MISSING_REQUIRED_FLAG");
      expect(process.exitCode).toBe(1);
    });

    it("resumes from a chunk with --yes and emits the stable envelope", async () => {
      fetchMock.mockResolvedValueOnce(
        response(200, { resumed: true, fromChunkIndex: 3 })
      );

      await broadcastsResume({
        id: "bc_1",
        yes: true,
        fromChunkIndex: "3",
        json: true,
      });

      const [url, init] = fetchMock.mock.calls[0] as [
        string,
        { method: string },
      ];
      expect(url).toBe(`${API_BASE}/v1/batch/bc_1/resume`);
      expect(init.method).toBe("POST");
      expect(sentBody()).toEqual({ fromChunkIndex: 3 });

      const env = envelope();
      expect(env.success).toBe(true);
      expect(env.command).toBe("broadcasts.resume");
      expect(Object.keys(env.data ?? {}).sort()).toEqual(
        [...RESUME_KEYS].sort()
      );
      expect(env.data?.id).toBe("bc_1");
      expect(env.data?.resumed).toBe(true);
      expect(process.exitCode).toBeUndefined();
    });

    it("sends no body when no chunk index is given", async () => {
      fetchMock.mockResolvedValueOnce(
        response(200, { resumed: true, fromChunkIndex: 0 })
      );

      await broadcastsResume({ id: "bc_1", yes: true, json: true });

      const init = fetchMock.mock.calls[0][1] as { body?: string };
      expect(init.body).toBeUndefined();
    });

    it("rejects a negative chunk index before any request", async () => {
      await broadcastsResume({
        id: "bc_1",
        yes: true,
        fromChunkIndex: "-1",
        json: true,
      });

      expect(fetchMock).not.toHaveBeenCalled();
      expect(envelope().error?.code).toBe("INVALID_FLAG_USAGE");
      expect(process.exitCode).toBe(1);
    });

    it("maps 503 to RESUME_DISABLED", async () => {
      fetchMock.mockResolvedValueOnce(
        response(503, {
          error: "Broadcast resume is temporarily disabled",
          code: "INTERNAL_ERROR",
        })
      );

      await broadcastsResume({ id: "bc_1", yes: true, json: true });

      const env = envelope();
      expect(env.error?.code).toBe("RESUME_DISABLED");
      expect(process.exitCode).toBe(1);
    });

    it("maps 409 to CONFLICT and reads message before error", async () => {
      fetchMock.mockResolvedValueOnce(
        response(409, {
          error: "conflict",
          message: "Broadcast is not processing or failed",
        })
      );

      await broadcastsResume({ id: "bc_1", yes: true, json: true });

      const env = envelope();
      expect(env.error?.code).toBe("CONFLICT");
      expect(env.error?.message).toBe("Broadcast is not processing or failed");
      expect(process.exitCode).toBe(1);
    });
  });
});
