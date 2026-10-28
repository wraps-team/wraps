/**
 * Tests for `wraps broadcasts cancel | duplicate | update`.
 *
 * fetch and the API target are mocked. Each test checks the --json envelope
 * (parsed from the single console.log line), its fixed data keys, the exit
 * code, and the exact request URL, method and body. Refusals (no --yes,
 * --dry-run, local validation) must make zero requests.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setJsonMode } from "../../../utils/shared/json-output.js";

vi.mock("@clack/prompts");
vi.mock("../../../utils/shared/api-target.js", () => ({
  resolveApiTarget: vi.fn(),
  checkApiTarget: vi.fn(),
}));

import {
  checkApiTarget,
  resolveApiTarget,
} from "../../../utils/shared/api-target.js";
import {
  broadcastsCancel,
  broadcastsDuplicate,
  broadcastsUpdate,
} from "../lifecycle.js";

const API_BASE = "http://api.test";
const TOKEN = "wraps_test";
const HOSTILE = "../x/y?z=1";

type Envelope = {
  success: boolean;
  command: string;
  data?: Record<string, unknown>;
  error?: { code: string; message: string; suggestion?: string };
};

const CANCEL_KEYS = ["id", "status", "cancelled", "dryRun"];
const DUPLICATE_KEYS = ["id", "status", "name", "sourceId"];
const UPDATE_KEYS = [
  "id",
  "status",
  "name",
  "channel",
  "subject",
  "audienceType",
  "topicId",
  "segmentId",
  "awsAccountId",
  "scheduledFor",
  "updatedFields",
];

function response(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

describe("wraps broadcasts lifecycle", () => {
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

  describe("broadcastsCancel", () => {
    it("dry-run makes no request and reports cancelled false", async () => {
      await broadcastsCancel({ id: "bc_1", dryRun: true, json: true });

      expect(fetchMock).not.toHaveBeenCalled();
      expect(resolveApiTarget).not.toHaveBeenCalled();
      const env = envelope();
      expect(env.success).toBe(true);
      expect(env.command).toBe("broadcasts.cancel");
      expect(Object.keys(env.data ?? {}).sort()).toEqual(
        [...CANCEL_KEYS].sort()
      );
      expect(env.data).toEqual({
        id: "bc_1",
        status: null,
        cancelled: false,
        dryRun: true,
      });
      expect(process.exitCode).toBeUndefined();
    });

    it("refuses without --yes with CONFIRMATION_REQUIRED and the exact re-run command", async () => {
      await broadcastsCancel({ id: "bc_1", json: true });

      expect(fetchMock).not.toHaveBeenCalled();
      const env = envelope();
      expect(env.success).toBe(false);
      expect(env.command).toBe("broadcasts.cancel");
      expect(env.error?.code).toBe("CONFIRMATION_REQUIRED");
      expect(env.error?.suggestion).toBe(
        "Re-run with --yes to confirm: wraps broadcasts cancel bc_1 --yes"
      );
      expect(process.exitCode).toBe(1);
    });

    it("cancels with --yes: DELETE to the existing batch route, no confirm parameter", async () => {
      fetchMock.mockResolvedValueOnce(
        response(200, { success: true, id: "bc_1", status: "cancelled" })
      );

      await broadcastsCancel({ id: "bc_1", yes: true, json: true });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [
        string,
        { method: string; body?: string },
      ];
      expect(url).toBe("http://api.test/v1/batch/bc_1");
      expect(init.method).toBe("DELETE");
      expect(init.body).toBeUndefined();
      const env = envelope();
      expect(env.success).toBe(true);
      expect(env.command).toBe("broadcasts.cancel");
      expect(Object.keys(env.data ?? {}).sort()).toEqual(
        [...CANCEL_KEYS].sort()
      );
      expect(env.data).toEqual({
        id: "bc_1",
        status: "cancelled",
        cancelled: true,
        dryRun: false,
      });
      expect(process.exitCode).toBeUndefined();
    });

    it("a broadcast that already sent is NOT_CANCELLABLE and names its status", async () => {
      fetchMock.mockResolvedValueOnce(
        response(400, {
          error:
            "Cannot cancel batch in 'sent' status. Only scheduled, queued, or processing batches can be cancelled.",
        })
      );

      await broadcastsCancel({ id: "bc_1", yes: true, json: true });

      const env = envelope();
      expect(env.error?.code).toBe("NOT_CANCELLABLE");
      expect(env.error?.suggestion).toContain("this one is sent");
      expect(env.error?.suggestion).toContain("wraps broadcasts status bc_1");
      expect(process.exitCode).toBe(1);
    });

    it("an unknown id is NOT_FOUND with a suggestion", async () => {
      fetchMock.mockResolvedValueOnce(
        response(404, { error: "Batch not found" })
      );

      await broadcastsCancel({ id: "bc_missing", yes: true, json: true });

      const env = envelope();
      expect(env.error?.code).toBe("NOT_FOUND");
      expect(env.error?.message).toBe("Batch not found");
      expect(env.error?.suggestion).toBeTruthy();
    });

    it("a missing id fails locally with MISSING_REQUIRED_FLAG and makes no request", async () => {
      await broadcastsCancel({ yes: true, json: true });

      expect(fetchMock).not.toHaveBeenCalled();
      const env = envelope();
      expect(env.error?.code).toBe("MISSING_REQUIRED_FLAG");
      expect(env.error?.suggestion).toContain("wraps broadcasts cancel <id>");
    });

    it("a 401 is NOT_AUTHENTICATED and suggests wraps auth login", async () => {
      fetchMock.mockResolvedValueOnce(response(401, { error: "Unauthorized" }));

      await broadcastsCancel({ id: "bc_1", yes: true, json: true });

      const env = envelope();
      expect(env.error?.code).toBe("NOT_AUTHENTICATED");
      expect(env.error?.suggestion).toContain("wraps auth login");
    });

    it("no API target is NOT_AUTHENTICATED and sends no request", async () => {
      vi.mocked(checkApiTarget).mockReturnValue({
        ok: false,
        reason: "No API token",
        suggestion: "Run: wraps auth login",
      } as never);

      await broadcastsCancel({ id: "bc_1", yes: true, json: true });

      expect(fetchMock).not.toHaveBeenCalled();
      expect(envelope().error?.code).toBe("NOT_AUTHENTICATED");
    });

    it("a request that cannot be sent is NETWORK_ERROR", async () => {
      fetchMock.mockRejectedValueOnce(new Error("socket hang up"));

      await broadcastsCancel({ id: "bc_1", yes: true, json: true });

      expect(envelope().error?.code).toBe("NETWORK_ERROR");
    });

    it("a hostile id stays one encoded path segment", async () => {
      fetchMock.mockResolvedValueOnce(response(404, { error: "Not found" }));

      await broadcastsCancel({ id: HOSTILE, yes: true, json: true });

      const url = new URL(String((fetchMock.mock.calls[0] as [string])[0]));
      expect(url.pathname).toBe(`/v1/batch/${encodeURIComponent(HOSTILE)}`);
      expect(url.search).toBe("");
    });
  });

  describe("broadcastsDuplicate", () => {
    it("POSTs to the duplicate route and returns the new draft", async () => {
      fetchMock.mockResolvedValueOnce(
        response(200, { id: "bc_2", status: "draft", name: "Launch (copy)" })
      );

      await broadcastsDuplicate({ id: "bc_1", json: true });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [
        string,
        { method: string; body?: string },
      ];
      expect(url).toBe("http://api.test/v1/batch/bc_1/duplicate");
      expect(init.method).toBe("POST");
      expect(init.body).toBeUndefined();
      const env = envelope();
      expect(env.success).toBe(true);
      expect(env.command).toBe("broadcasts.duplicate");
      expect(Object.keys(env.data ?? {}).sort()).toEqual(
        [...DUPLICATE_KEYS].sort()
      );
      expect(env.data).toEqual({
        id: "bc_2",
        status: "draft",
        name: "Launch (copy)",
        sourceId: "bc_1",
      });
      expect(process.exitCode).toBeUndefined();
    });

    it("needs no --yes: it is not destructive", async () => {
      fetchMock.mockResolvedValueOnce(
        response(200, { id: "bc_2", status: "draft", name: null })
      );

      await broadcastsDuplicate({ id: "bc_1", json: true });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(envelope().success).toBe(true);
    });

    it("a read-only member gets FORBIDDEN that names the write permission", async () => {
      fetchMock.mockResolvedValueOnce(
        response(403, { error: "Insufficient permissions" })
      );

      await broadcastsDuplicate({ id: "bc_1", json: true });

      const env = envelope();
      expect(env.error?.code).toBe("FORBIDDEN");
      expect(env.error?.suggestion).toContain("write access");
    });

    it("a plan-gated 403 is PLAN_REQUIRED with the upgrade hint", async () => {
      fetchMock.mockResolvedValueOnce(
        response(403, {
          error:
            "Feature 'batch' requires pro plan or higher. Current plan: free. Upgrade at https://wraps.dev/upgrade",
        })
      );

      await broadcastsDuplicate({ id: "bc_1", json: true });

      const env = envelope();
      expect(env.error?.code).toBe("PLAN_REQUIRED");
      expect(env.error?.suggestion).toContain("wraps.dev/upgrade");
    });

    it("an unknown id is NOT_FOUND", async () => {
      fetchMock.mockResolvedValueOnce(
        response(404, { error: "Broadcast not found" })
      );

      await broadcastsDuplicate({ id: "bc_missing", json: true });

      expect(envelope().error?.code).toBe("NOT_FOUND");
    });

    it("a missing id fails locally and makes no request", async () => {
      await broadcastsDuplicate({ json: true });

      expect(fetchMock).not.toHaveBeenCalled();
      expect(envelope().error?.code).toBe("MISSING_REQUIRED_FLAG");
    });

    it("a 401 is NOT_AUTHENTICATED and suggests wraps auth login", async () => {
      fetchMock.mockResolvedValueOnce(response(401, { error: "Unauthorized" }));

      await broadcastsDuplicate({ id: "bc_1", json: true });

      const env = envelope();
      expect(env.error?.code).toBe("NOT_AUTHENTICATED");
      expect(env.error?.suggestion).toContain("wraps auth login");
    });

    it("no API target is NOT_AUTHENTICATED and sends no request", async () => {
      vi.mocked(checkApiTarget).mockReturnValue({
        ok: false,
        reason: "No API token",
        suggestion: "Run: wraps auth login",
      } as never);

      await broadcastsDuplicate({ id: "bc_1", json: true });

      expect(fetchMock).not.toHaveBeenCalled();
      expect(envelope().error?.code).toBe("NOT_AUTHENTICATED");
    });

    it("a request that cannot be sent is NETWORK_ERROR", async () => {
      fetchMock.mockRejectedValueOnce(new Error("socket hang up"));

      await broadcastsDuplicate({ id: "bc_1", json: true });

      expect(envelope().error?.code).toBe("NETWORK_ERROR");
    });

    it("a hostile id stays one encoded path segment", async () => {
      fetchMock.mockResolvedValueOnce(response(404, { error: "Not found" }));

      await broadcastsDuplicate({ id: HOSTILE, json: true });

      const url = new URL(String((fetchMock.mock.calls[0] as [string])[0]));
      expect(url.pathname).toBe(
        `/v1/batch/${encodeURIComponent(HOSTILE)}/duplicate`
      );
      expect(url.search).toBe("");
    });
  });

  describe("broadcastsUpdate", () => {
    it("PATCHes only the flags passed, as a flat body", async () => {
      fetchMock.mockResolvedValueOnce(
        response(200, {
          id: "bc_1",
          status: "draft",
          name: "Launch",
          channel: "email",
          subject: "New subject",
          audienceType: "all",
          topicId: null,
          segmentId: null,
          awsAccountId: "acct_1",
          scheduledFor: "2030-01-01T09:00:00.000Z",
        })
      );

      await broadcastsUpdate({
        id: "bc_1",
        subject: "New subject",
        scheduledFor: "2030-01-01T09:00:00Z",
        json: true,
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [
        string,
        { method: string },
      ];
      expect(url).toBe("http://api.test/v1/batch/bc_1");
      expect(init.method).toBe("PATCH");
      expect(sentBody()).toEqual({
        subject: "New subject",
        scheduledFor: "2030-01-01T09:00:00.000Z",
      });
      const env = envelope();
      expect(env.success).toBe(true);
      expect(env.command).toBe("broadcasts.update");
      expect(Object.keys(env.data ?? {}).sort()).toEqual(
        [...UPDATE_KEYS].sort()
      );
      expect(env.data?.id).toBe("bc_1");
      expect(env.data?.status).toBe("draft");
      expect(env.data?.updatedFields).toEqual(["subject", "scheduledFor"]);
      expect(process.exitCode).toBeUndefined();
    });

    it("--clear-<field> sends null for that field", async () => {
      fetchMock.mockResolvedValueOnce(
        response(200, { id: "bc_1", status: "draft" })
      );

      await broadcastsUpdate({
        id: "bc_1",
        clear: { subject: true, scheduledFor: true },
        json: true,
      });

      expect(sentBody()).toEqual({ subject: null, scheduledFor: null });
      expect(envelope().data?.updatedFields).toEqual([
        "subject",
        "scheduledFor",
      ]);
    });

    it("a flag and its --clear- counterpart together are refused without a request", async () => {
      await broadcastsUpdate({
        id: "bc_1",
        subject: "Hi",
        clear: { subject: true },
        json: true,
      });

      expect(fetchMock).not.toHaveBeenCalled();
      const env = envelope();
      expect(env.error?.code).toBe("INVALID_FLAG_USAGE");
      expect(env.error?.message).toBe(
        "--subject and --clear-subject cannot be used together"
      );
    });

    it("no changes is VALIDATION_FAILED naming the flags, with no request", async () => {
      await broadcastsUpdate({ id: "bc_1", json: true });

      expect(fetchMock).not.toHaveBeenCalled();
      const env = envelope();
      expect(env.error?.code).toBe("VALIDATION_FAILED");
      expect(env.error?.message).toContain("--name");
      expect(env.error?.message).toContain("--clear-<field>");
      expect(env.error?.suggestion).toContain("wraps broadcasts update <id>");
    });

    it("a non-draft returns 409 CONFLICT naming the status and the duplicate command", async () => {
      fetchMock.mockResolvedValueOnce(
        response(409, { error: "Cannot edit: broadcast is already sent" })
      );

      await broadcastsUpdate({ id: "bc_1", subject: "Hi", json: true });

      const env = envelope();
      expect(env.error?.code).toBe("CONFLICT");
      expect(env.error?.message).toBe("Cannot edit: broadcast is already sent");
      expect(env.error?.suggestion).toContain("this broadcast is sent");
      expect(env.error?.suggestion).toContain(
        "wraps broadcasts duplicate bc_1"
      );
    });

    it("a topic audience without --topic-id is refused locally", async () => {
      await broadcastsUpdate({
        id: "bc_1",
        audienceType: "topic",
        json: true,
      });

      expect(fetchMock).not.toHaveBeenCalled();
      const env = envelope();
      expect(env.error?.code).toBe("MISSING_REQUIRED_FLAG");
      expect(env.error?.message).toBe(
        "--topic-id is required for a topic audience"
      );
    });

    it("an unparseable --scheduled-for is refused locally and names the flag", async () => {
      await broadcastsUpdate({
        id: "bc_1",
        scheduledFor: "next tuesday",
        json: true,
      });

      expect(fetchMock).not.toHaveBeenCalled();
      const env = envelope();
      expect(env.error?.code).toBe("INVALID_FLAG_USAGE");
      expect(env.error?.message).toBe(
        "--scheduled-for must be an ISO 8601 date-time such as 2030-01-01T09:00:00Z"
      );
    });

    it("an invalid --channel is refused locally", async () => {
      await broadcastsUpdate({ id: "bc_1", channel: "fax", json: true });

      expect(fetchMock).not.toHaveBeenCalled();
      expect(envelope().error?.message).toBe("--channel must be email or sms");
    });

    it("a plan-gated schedule is PLAN_REQUIRED with a suggestion to drop --scheduled-for", async () => {
      fetchMock.mockResolvedValueOnce(
        response(403, {
          error:
            "Scheduling a broadcast requires the pro plan or higher. Upgrade at https://wraps.dev/upgrade",
        })
      );

      await broadcastsUpdate({
        id: "bc_1",
        scheduledFor: "2030-01-01T09:00:00Z",
        json: true,
      });

      const env = envelope();
      expect(env.error?.code).toBe("PLAN_REQUIRED");
      expect(env.error?.suggestion).toContain("drop --scheduled-for");
    });

    it("a 400 that names scheduledFor points at --scheduled-for or --clear-scheduled-for", async () => {
      fetchMock.mockResolvedValueOnce(
        response(400, {
          error:
            "The scheduled time is in the past. Pick a future time, or send now",
        })
      );

      await broadcastsUpdate({
        id: "bc_1",
        scheduledFor: "2020-01-01T09:00:00Z",
        json: true,
      });

      const env = envelope();
      expect(env.error?.code).toBe("VALIDATION_FAILED");
      expect(env.error?.suggestion).toContain("--clear-scheduled-for");
    });

    it("a 404 for an unknown segment names --segment-id", async () => {
      fetchMock.mockResolvedValueOnce(
        response(404, { error: "Segment not found" })
      );

      await broadcastsUpdate({ id: "bc_1", segmentId: "seg_x", json: true });

      const env = envelope();
      expect(env.error?.code).toBe("NOT_FOUND");
      expect(env.error?.suggestion).toContain("--segment-id");
    });

    it("a read-only member gets FORBIDDEN with no change made", async () => {
      fetchMock.mockResolvedValueOnce(
        response(403, { error: "Insufficient permissions" })
      );

      await broadcastsUpdate({ id: "bc_1", subject: "Hi", json: true });

      expect(envelope().error?.code).toBe("FORBIDDEN");
      expect(process.exitCode).toBe(1);
    });

    it("a 401 is NOT_AUTHENTICATED and suggests wraps auth login", async () => {
      fetchMock.mockResolvedValueOnce(response(401, { error: "Unauthorized" }));

      await broadcastsUpdate({ id: "bc_1", subject: "Hi", json: true });

      const env = envelope();
      expect(env.error?.code).toBe("NOT_AUTHENTICATED");
      expect(env.error?.suggestion).toContain("wraps auth login");
    });

    it("no API target is NOT_AUTHENTICATED and sends no request", async () => {
      vi.mocked(checkApiTarget).mockReturnValue({
        ok: false,
        reason: "No API token",
        suggestion: "Run: wraps auth login",
      } as never);

      await broadcastsUpdate({ id: "bc_1", subject: "Hi", json: true });

      expect(fetchMock).not.toHaveBeenCalled();
      expect(envelope().error?.code).toBe("NOT_AUTHENTICATED");
    });

    it("a request that cannot be sent is NETWORK_ERROR", async () => {
      fetchMock.mockRejectedValueOnce(new Error("socket hang up"));

      await broadcastsUpdate({ id: "bc_1", subject: "Hi", json: true });

      expect(envelope().error?.code).toBe("NETWORK_ERROR");
    });

    it("a hostile id stays one encoded path segment", async () => {
      fetchMock.mockResolvedValueOnce(response(404, { error: "Not found" }));

      await broadcastsUpdate({ id: HOSTILE, subject: "Hi", json: true });

      const url = new URL(String((fetchMock.mock.calls[0] as [string])[0]));
      expect(url.pathname).toBe(`/v1/batch/${encodeURIComponent(HOSTILE)}`);
      expect(url.search).toBe("");
    });
  });
});
