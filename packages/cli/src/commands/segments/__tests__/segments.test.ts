/**
 * Unit tests for `wraps segments`.
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

import { log } from "@clack/prompts";
import {
  checkApiTarget,
  resolveApiTarget,
} from "../../../utils/shared/api-target.js";
import {
  segmentsCreate,
  segmentsDelete,
  segmentsGet,
  segmentsList,
  segmentsPreview,
  segmentsUpdate,
} from "../segments.js";

const API_BASE = "http://api.test";
const TOKEN = "wraps_test";

const DETAIL_KEYS = [
  "condition",
  "createdAt",
  "description",
  "id",
  "lastComputedAt",
  "memberCount",
  "name",
  "trackMembership",
  "updatedAt",
];

const SUMMARY = {
  id: "seg_1",
  name: "VIP",
  description: null,
  memberCount: 3,
  trackMembership: false,
  lastComputedAt: null,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
};

const DETAIL = {
  ...SUMMARY,
  condition: { filters: [] },
};

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

describe("segments commands", () => {
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
    it("emits fixed data keys and a cursor when more pages exist", async () => {
      fetchMock.mockResolvedValueOnce(
        res(200, {
          segments: [SUMMARY, { ...SUMMARY, id: "seg_2", name: "Trial" }],
          total: 5,
          limit: 2,
          offset: 0,
        })
      );

      await segmentsList({ limit: "2", token: TOKEN, json: true });

      const env = envelope(consoleLogSpy);
      expect(env.success).toBe(true);
      expect(env.command).toBe("segments.list");
      expect(Object.keys(env.data ?? {}).sort()).toEqual([
        "limit",
        "nextCursor",
        "offset",
        "segments",
        "total",
      ]);
      expect(env.data?.nextCursor).toBe("2");
      expect(env.data?.total).toBe(5);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(String(fetchMock.mock.calls[0][0])).toBe(
        `${API_BASE}/v1/segments?limit=2&offset=0`
      );
      expect(process.exitCode).toBeUndefined();
    });

    it("reads the offset from --cursor and returns null on the last page", async () => {
      fetchMock.mockResolvedValueOnce(
        res(200, { segments: [SUMMARY], total: 5, limit: 2, offset: 4 })
      );

      await segmentsList({ limit: "2", cursor: "4", json: true });

      const env = envelope(consoleLogSpy);
      expect(env.data?.nextCursor).toBeNull();
      expect(env.data?.offset).toBe(4);
      expect(String(fetchMock.mock.calls[0][0])).toContain("offset=4");
    });

    it("rejects a --limit outside 1-100 with zero requests", async () => {
      await segmentsList({ limit: "500", json: true });

      const env = envelope(consoleLogSpy);
      expect(env.success).toBe(false);
      expect(env.error?.code).toBe("INVALID_FLAG_VALUE");
      expect(env.error?.suggestion).toBeTruthy();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });

    it("rejects a --cursor that is not an offset with zero requests", async () => {
      await segmentsList({ cursor: "abc", json: true });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("INVALID_FLAG_VALUE");
      expect(fetchMock).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });

    it("maps a plan denial to PLAN_REQUIRED", async () => {
      fetchMock.mockResolvedValueOnce(
        res(403, {
          error:
            "Feature 'segments' requires pro plan or higher. Current plan: free.",
          code: "FORBIDDEN",
        })
      );

      await segmentsList({ json: true });

      const env = envelope(consoleLogSpy);
      expect(env.command).toBe("segments.list");
      expect(env.error?.code).toBe("PLAN_REQUIRED");
      expect(env.error?.suggestion).toBeTruthy();
      expect(process.exitCode).toBe(1);
    });

    it("maps 401 to NOT_AUTHENTICATED", async () => {
      fetchMock.mockResolvedValueOnce(
        res(401, { error: "Unauthorized", code: "UNAUTHORIZED" })
      );

      await segmentsList({ json: true });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("NOT_AUTHENTICATED");
      expect(env.error?.suggestion).toBeTruthy();
      expect(process.exitCode).toBe(1);
    });

    it("maps a plain 403 to FORBIDDEN, not PLAN_REQUIRED", async () => {
      fetchMock.mockResolvedValueOnce(
        res(403, { error: "Forbidden", code: "FORBIDDEN" })
      );

      await segmentsList({ json: true });

      expect(envelope(consoleLogSpy).error?.code).toBe("FORBIDDEN");
      expect(process.exitCode).toBe(1);
    });

    it("maps 429 to RATE_LIMITED", async () => {
      fetchMock.mockResolvedValueOnce(
        res(429, { error: "Rate limit exceeded: 60 requests per minute" })
      );

      await segmentsList({ json: true });

      expect(envelope(consoleLogSpy).error?.code).toBe("RATE_LIMITED");
      expect(process.exitCode).toBe(1);
    });

    it("maps 5xx to API_ERROR", async () => {
      fetchMock.mockResolvedValueOnce(
        res(500, { error: "Internal server error", code: "INTERNAL_ERROR" })
      );

      await segmentsList({ json: true });

      expect(envelope(consoleLogSpy).error?.code).toBe("API_ERROR");
      expect(process.exitCode).toBe(1);
    });

    it("reads message before error in a validation body", async () => {
      fetchMock.mockResolvedValueOnce(
        res(400, { error: "conflict", message: "Search term is too long" })
      );

      await segmentsList({ json: true });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("VALIDATION_FAILED");
      expect(env.error?.message).toBe("Search term is too long");
      expect(process.exitCode).toBe(1);
    });

    it("maps a network failure to NETWORK_ERROR", async () => {
      fetchMock.mockRejectedValueOnce(new Error("socket hang up"));

      await segmentsList({ json: true });

      expect(envelope(consoleLogSpy).error?.code).toBe("NETWORK_ERROR");
      expect(process.exitCode).toBe(1);
    });

    it("reports a missing credential as NOT_AUTHENTICATED with no request", async () => {
      vi.mocked(checkApiTarget).mockReturnValueOnce({
        ok: false,
        reason: "No API token",
        suggestion: "Run: wraps auth login",
      } as never);

      await segmentsList({ json: true });

      expect(envelope(consoleLogSpy).error?.code).toBe("NOT_AUTHENTICATED");
      expect(fetchMock).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });

    it("prints a clack error and sets exitCode in human mode", async () => {
      setJsonMode(false);
      fetchMock.mockResolvedValueOnce(
        res(404, { error: "Segment not found", code: "NOT_FOUND" })
      );

      await segmentsList({});

      expect(log.error).toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });
  });

  describe("get", () => {
    it("emits the detail keys", async () => {
      fetchMock.mockResolvedValueOnce(res(200, DETAIL));

      await segmentsGet({ id: "seg_1", json: true });

      const env = envelope(consoleLogSpy);
      expect(env.success).toBe(true);
      expect(env.command).toBe("segments.get");
      expect(Object.keys(env.data ?? {}).sort()).toEqual(DETAIL_KEYS);
      expect(env.data?.id).toBe("seg_1");
      expect(String(fetchMock.mock.calls[0][0])).toBe(
        `${API_BASE}/v1/segments/seg_1`
      );
      expect(process.exitCode).toBeUndefined();
    });

    it("encodes the id in the path", async () => {
      fetchMock.mockResolvedValueOnce(res(200, DETAIL));

      await segmentsGet({ id: "a/b", json: true });

      expect(String(fetchMock.mock.calls[0][0])).toBe(
        `${API_BASE}/v1/segments/a%2Fb`
      );
    });

    it("maps 404 to NOT_FOUND", async () => {
      fetchMock.mockResolvedValueOnce(
        res(404, { error: "Segment not found", code: "NOT_FOUND" })
      );

      await segmentsGet({ id: "seg_missing", json: true });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("NOT_FOUND");
      expect(env.error?.suggestion).toContain("wraps segments list");
      expect(process.exitCode).toBe(1);
    });

    it("reports a missing id as MISSING_REQUIRED_FLAG with no request", async () => {
      await segmentsGet({ json: true });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("MISSING_REQUIRED_FLAG");
      expect(env.error?.suggestion).toBeTruthy();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });
  });

  describe("create", () => {
    it("posts the name and parsed condition and emits the detail keys", async () => {
      fetchMock.mockResolvedValueOnce(res(201, DETAIL));

      await segmentsCreate({
        name: "VIP",
        condition: '{"filters":[]}',
        trackMembership: true,
        json: true,
      });

      const env = envelope(consoleLogSpy);
      expect(env.command).toBe("segments.create");
      expect(Object.keys(env.data ?? {}).sort()).toEqual(DETAIL_KEYS);
      const init = fetchMock.mock.calls[0][1] as {
        method: string;
        body: string;
      };
      expect(init.method).toBe("POST");
      expect(JSON.parse(init.body)).toEqual({
        name: "VIP",
        condition: { filters: [] },
        trackMembership: true,
      });
      expect(process.exitCode).toBeUndefined();
    });

    it("reports a missing name with no request", async () => {
      await segmentsCreate({ condition: "{}", json: true });

      expect(envelope(consoleLogSpy).error?.code).toBe("MISSING_REQUIRED_FLAG");
      expect(fetchMock).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });

    it("reports a missing condition with no request", async () => {
      await segmentsCreate({ name: "VIP", json: true });

      expect(envelope(consoleLogSpy).error?.code).toBe("MISSING_REQUIRED_FLAG");
      expect(fetchMock).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });

    it("rejects a condition that is not a JSON object with no request", async () => {
      await segmentsCreate({ name: "VIP", condition: "[1,2]", json: true });

      expect(envelope(consoleLogSpy).error?.code).toBe("INVALID_FLAG_VALUE");
      expect(fetchMock).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });

    it("rejects condition text that is not JSON with no request", async () => {
      await segmentsCreate({ name: "VIP", condition: "{nope", json: true });

      expect(envelope(consoleLogSpy).error?.code).toBe("INVALID_FLAG_VALUE");
      expect(fetchMock).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });

    it("maps a 400 from the condition validator to VALIDATION_FAILED", async () => {
      fetchMock.mockResolvedValueOnce(
        res(400, { error: "Unknown filter field: foo" })
      );

      await segmentsCreate({
        name: "VIP",
        condition: '{"foo":1}',
        json: true,
      });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("VALIDATION_FAILED");
      expect(env.error?.message).toBe("Unknown filter field: foo");
      expect(process.exitCode).toBe(1);
    });
  });

  describe("update", () => {
    it("sends only the given fields and emits the detail keys", async () => {
      fetchMock.mockResolvedValueOnce(res(200, { ...DETAIL, name: "VIP 2" }));

      await segmentsUpdate({ id: "seg_1", name: "VIP 2", json: true });

      const env = envelope(consoleLogSpy);
      expect(env.command).toBe("segments.update");
      expect(Object.keys(env.data ?? {}).sort()).toEqual(DETAIL_KEYS);
      const init = fetchMock.mock.calls[0][1] as {
        method: string;
        body: string;
      };
      expect(init.method).toBe("PATCH");
      expect(JSON.parse(init.body)).toEqual({ name: "VIP 2" });
      expect(String(fetchMock.mock.calls[0][0])).toBe(
        `${API_BASE}/v1/segments/seg_1`
      );
    });

    it("reports a missing id with no request", async () => {
      await segmentsUpdate({ name: "x", json: true });

      expect(envelope(consoleLogSpy).error?.code).toBe("MISSING_REQUIRED_FLAG");
      expect(fetchMock).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });

    it("reports an update with no fields as MISSING_REQUIRED_FLAG", async () => {
      await segmentsUpdate({ id: "seg_1", json: true });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("MISSING_REQUIRED_FLAG");
      expect(fetchMock).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });

    it("maps 404 to NOT_FOUND", async () => {
      fetchMock.mockResolvedValueOnce(res(404, { error: "Segment not found" }));

      await segmentsUpdate({ id: "seg_1", name: "x", json: true });

      expect(envelope(consoleLogSpy).error?.code).toBe("NOT_FOUND");
      expect(process.exitCode).toBe(1);
    });
  });

  describe("delete", () => {
    it("refuses without --yes and makes zero requests", async () => {
      await segmentsDelete({ id: "seg_1", json: true });

      const env = envelope(consoleLogSpy);
      expect(env.success).toBe(false);
      expect(env.command).toBe("segments.delete");
      expect(env.error?.code).toBe("CONFIRMATION_REQUIRED");
      expect(env.error?.suggestion).toContain("--yes");
      expect(fetchMock).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });

    it("--dry-run makes zero requests and emits the fixed keys", async () => {
      await segmentsDelete({ id: "seg_1", dryRun: true, json: true });

      const env = envelope(consoleLogSpy);
      expect(env.success).toBe(true);
      expect(Object.keys(env.data ?? {}).sort()).toEqual([
        "deleted",
        "dryRun",
        "id",
      ]);
      expect(env.data).toEqual({ id: "seg_1", deleted: false, dryRun: true });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(process.exitCode).toBeUndefined();
    });

    it("sends the DELETE with --yes and emits the fixed keys", async () => {
      fetchMock.mockResolvedValueOnce(res(200, { success: true }));

      await segmentsDelete({ id: "seg_1", yes: true, json: true });

      const env = envelope(consoleLogSpy);
      expect(env.command).toBe("segments.delete");
      expect(Object.keys(env.data ?? {}).sort()).toEqual([
        "deleted",
        "dryRun",
        "id",
      ]);
      expect(env.data?.deleted).toBe(true);
      const init = fetchMock.mock.calls[0][1] as { method: string };
      expect(init.method).toBe("DELETE");
      expect(process.exitCode).toBeUndefined();
    });

    it("maps 409 (segment targeted by a live broadcast) to CONFLICT", async () => {
      fetchMock.mockResolvedValueOnce(
        res(409, {
          error:
            "This segment is targeted by a scheduled, queued, or in-progress broadcast.",
        })
      );

      await segmentsDelete({ id: "seg_1", yes: true, json: true });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("CONFLICT");
      expect(env.error?.message).toContain("targeted by a scheduled");
      expect(process.exitCode).toBe(1);
    });

    it("reports a missing id with no request", async () => {
      await segmentsDelete({ yes: true, json: true });

      expect(envelope(consoleLogSpy).error?.code).toBe("MISSING_REQUIRED_FLAG");
      expect(fetchMock).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });
  });

  describe("preview", () => {
    it("reads the saved condition, then previews it, and emits the fixed keys", async () => {
      fetchMock.mockResolvedValueOnce(res(200, DETAIL)).mockResolvedValueOnce(
        res(200, {
          count: 3,
          sample: ["a@example.com", "b@example.com"],
        })
      );

      await segmentsPreview({ id: "seg_1", limit: "2", json: true });

      const env = envelope(consoleLogSpy);
      expect(env.command).toBe("segments.preview");
      expect(Object.keys(env.data ?? {}).sort()).toEqual([
        "count",
        "id",
        "sample",
      ]);
      expect(env.data).toEqual({
        id: "seg_1",
        count: 3,
        sample: ["a@example.com", "b@example.com"],
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(String(fetchMock.mock.calls[1][0])).toBe(
        `${API_BASE}/v1/segments/preview`
      );
      const init = fetchMock.mock.calls[1][1] as {
        method: string;
        body: string;
      };
      expect(init.method).toBe("POST");
      expect(JSON.parse(init.body)).toEqual({
        condition: { filters: [] },
        limit: 2,
      });
      expect(process.exitCode).toBeUndefined();
    });

    it("rejects a --limit outside 1-100 with no request", async () => {
      await segmentsPreview({ id: "seg_1", limit: "0", json: true });

      expect(envelope(consoleLogSpy).error?.code).toBe("INVALID_FLAG_VALUE");
      expect(fetchMock).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });

    it("reports a missing id with no request", async () => {
      await segmentsPreview({ json: true });

      expect(envelope(consoleLogSpy).error?.code).toBe("MISSING_REQUIRED_FLAG");
      expect(fetchMock).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });

    it("stops after a 404 on the saved segment and never calls the preview route", async () => {
      fetchMock.mockResolvedValueOnce(
        res(404, { error: "Segment not found", code: "NOT_FOUND" })
      );

      await segmentsPreview({ id: "seg_missing", json: true });

      expect(envelope(consoleLogSpy).error?.code).toBe("NOT_FOUND");
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(process.exitCode).toBe(1);
    });
  });
});
