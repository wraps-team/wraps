/**
 * Unit tests for `wraps broadcasts draft`.
 *
 * Boundaries are mocked: the API target resolver, clack output and fetch.
 * The exported command runs its real control flow. Every --json assertion
 * parses the single console.log envelope.
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
import { broadcastsDraft } from "../draft.js";

const API_BASE = "http://api.test";
const TOKEN = "wraps_test";
const DRAFT_ID = "bc_draft_1";

const CREATED = {
  id: DRAFT_ID,
  status: "draft",
  name: "Spring sale",
  channel: "email",
  totalRecipients: 0,
  processedRecipients: 0,
  sent: 0,
  delivered: 0,
  failed: 0,
  opened: 0,
  clicked: 0,
  bounced: 0,
  complained: 0,
  suppressed: 0,
  startedAt: null,
  completedAt: null,
  createdAt: "2026-10-29T12:00:00.000Z",
};

const ENVELOPE_KEYS = [
  "channel",
  "createdAt",
  "id",
  "name",
  "sendCommand",
  "sendRequires",
  "status",
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

function sentBody(
  fetchMock: ReturnType<typeof vi.fn>
): Record<string, unknown> {
  const init = fetchMock.mock.calls[0]?.[1] as { body: string };
  return JSON.parse(init.body) as Record<string, unknown>;
}

describe("broadcasts draft", () => {
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

  describe("success", () => {
    it("posts the draft body and emits the fixed envelope keys", async () => {
      fetchMock.mockResolvedValueOnce(res(201, CREATED));

      await broadcastsDraft({
        name: "Spring sale",
        subject: "Hello",
        templateId: "tpl_1",
        audienceType: "segment",
        segmentId: "seg_1",
        awsAccountId: "acct_1",
        token: TOKEN,
        json: true,
      });

      const env = envelope(consoleLogSpy);
      expect(env.success).toBe(true);
      expect(env.command).toBe("broadcasts.draft");
      expect(Object.keys(env.data ?? {}).sort()).toEqual(ENVELOPE_KEYS);
      expect(env.data?.id).toBe(DRAFT_ID);
      expect(env.data?.status).toBe("draft");
      expect(env.data?.name).toBe("Spring sale");
      expect(env.data?.sendCommand).toBe(
        "wraps broadcasts send bc_draft_1 --yes --aws-account-id acct_1 --total-recipients <n>"
      );
      expect(env.data?.sendRequires).toEqual([
        "--aws-account-id",
        "--total-recipients",
      ]);
      expect(process.exitCode).toBeUndefined();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [
        string,
        { method: string; headers: Record<string, string> },
      ];
      expect(url).toBe("http://api.test/v1/batch/drafts");
      expect(init.method).toBe("POST");
      expect(init.headers.Authorization).toBe("Bearer wraps_test");
      expect(sentBody(fetchMock)).toEqual({
        name: "Spring sale",
        subject: "Hello",
        templateId: "tpl_1",
        awsAccountId: "acct_1",
        recipientFilter: { audienceType: "segment", segmentId: "seg_1" },
      });
    });

    it("prints a send command with a placeholder account when none was passed", async () => {
      fetchMock.mockResolvedValueOnce(res(201, CREATED));

      await broadcastsDraft({ name: "Spring sale", token: TOKEN, json: true });

      const env = envelope(consoleLogSpy);
      expect(env.data?.sendCommand).toBe(
        "wraps broadcasts send bc_draft_1 --yes --aws-account-id <aws-account-id> --total-recipients <n>"
      );
    });

    it("sends nothing but the draft post, never the send route", async () => {
      fetchMock.mockResolvedValueOnce(res(201, CREATED));

      await broadcastsDraft({ name: "Spring sale", token: TOKEN, json: true });

      const urls = fetchMock.mock.calls.map((call) => String(call[0]));
      expect(urls).toEqual(["http://api.test/v1/batch/drafts"]);
      expect(urls.some((url) => url.includes("/send"))).toBe(false);
    });

    it("prints the draft id and the complete send command in human mode", async () => {
      setJsonMode(false);
      fetchMock.mockResolvedValueOnce(res(201, CREATED));

      await broadcastsDraft({
        name: "Spring sale",
        awsAccountId: "acct_1",
        token: TOKEN,
      });

      expect(log.success).toHaveBeenCalledWith(
        "Draft bc_draft_1 saved. Nothing was sent."
      );
      expect(log.info).toHaveBeenCalledWith(
        "Send it with: wraps broadcasts send bc_draft_1 --yes --aws-account-id acct_1 --total-recipients <n>"
      );
      expect(log.info).toHaveBeenCalledWith(
        expect.stringContaining(
          "The content was set when the draft was created."
        )
      );
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it("resolves the target with the --token flag", async () => {
      fetchMock.mockResolvedValueOnce(res(201, CREATED));

      await broadcastsDraft({ name: "Spring sale", token: TOKEN, json: true });

      expect(resolveApiTarget).toHaveBeenCalledWith({ token: TOKEN });
    });

    it("sends htmlContent from --html-content", async () => {
      fetchMock.mockResolvedValueOnce(res(201, CREATED));

      await broadcastsDraft({
        name: "Spring sale",
        htmlContent: "<h1>Hi</h1>",
        token: TOKEN,
        json: true,
      });

      expect(sentBody(fetchMock).htmlContent).toBe("<h1>Hi</h1>");
    });

    it("sends scheduledFor as the pinned ISO instant", async () => {
      fetchMock.mockResolvedValueOnce(res(201, CREATED));

      await broadcastsDraft({
        name: "Spring sale",
        scheduledFor: "2030-01-01T09:00:00Z",
        token: TOKEN,
        json: true,
      });

      expect(sentBody(fetchMock).scheduledFor).toBe("2030-01-01T09:00:00.000Z");
    });

    it("sends the audience as all when no --audience-type is given", async () => {
      fetchMock.mockResolvedValueOnce(res(201, CREATED));

      await broadcastsDraft({ name: "Spring sale", token: TOKEN, json: true });

      expect(sentBody(fetchMock).recipientFilter).toEqual({
        audienceType: "all",
      });
    });
  });

  describe("local validation (no request)", () => {
    it("rejects --audience-type topic without --topic-id, naming the flag", async () => {
      await broadcastsDraft({
        audienceType: "topic",
        token: TOKEN,
        json: true,
      });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("MISSING_REQUIRED_FLAG");
      expect(env.error?.message).toBe("--topic-id is required");
      expect(env.error?.suggestion).toContain("--audience-type all");
      expect(fetchMock).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });

    it("rejects --audience-type segment without --segment-id, naming the flag", async () => {
      await broadcastsDraft({
        audienceType: "segment",
        token: TOKEN,
        json: true,
      });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("MISSING_REQUIRED_FLAG");
      expect(env.error?.message).toBe("--segment-id is required");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects --topic-id without --audience-type topic", async () => {
      await broadcastsDraft({
        topicId: "topic_1",
        token: TOKEN,
        json: true,
      });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("INVALID_FLAG_USAGE");
      expect(env.error?.message).toBe(
        "--topic-id and --segment-id need --audience-type topic or --audience-type segment"
      );
      expect(env.error?.suggestion).toContain("--audience-type topic");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects an unknown --audience-type value", async () => {
      await broadcastsDraft({
        audienceType: "everyone",
        token: TOKEN,
        json: true,
      });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("INVALID_FLAG_USAGE");
      expect(env.error?.message).toBe(
        "--audience-type must be all, topic or segment"
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects a --scheduled-for that is not a date, naming the flag", async () => {
      await broadcastsDraft({
        scheduledFor: "next tuesday",
        token: TOKEN,
        json: true,
      });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("INVALID_FLAG_USAGE");
      expect(env.error?.message).toContain(
        "--scheduled-for must be an ISO 8601"
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("target and transport", () => {
    it("reports NOT_AUTHENTICATED with the token hint when no target resolves", async () => {
      vi.mocked(checkApiTarget).mockReturnValueOnce({
        ok: false,
        reason: "No API token",
        suggestion: "Run: wraps auth login",
      } as never);

      await broadcastsDraft({ name: "Spring sale", json: true });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("NOT_AUTHENTICATED");
      expect(env.error?.message).toBe("No API token");
      expect(env.error?.suggestion).toContain("wraps auth login");
      expect(env.error?.suggestion).toContain("--token");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("maps a fetch failure to NETWORK_ERROR", async () => {
      fetchMock.mockRejectedValueOnce(new Error("socket hang up"));

      await broadcastsDraft({ name: "Spring sale", token: TOKEN, json: true });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("NETWORK_ERROR");
      expect(env.error?.message).toBe(
        "Could not reach the Wraps API: socket hang up"
      );
      expect(process.exitCode).toBe(1);
    });

    it("maps a 401 to NOT_AUTHENTICATED with the login hint", async () => {
      fetchMock.mockResolvedValueOnce(res(401, { error: "Unauthorized" }));

      await broadcastsDraft({ name: "Spring sale", token: TOKEN, json: true });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("NOT_AUTHENTICATED");
      expect(env.error?.message).toBe("Unauthorized");
      expect(env.error?.suggestion).toContain("wraps auth login");
    });

    it("maps a read-only role's 403 to FORBIDDEN naming the write permission", async () => {
      fetchMock.mockResolvedValueOnce(
        res(403, { error: "You don't have permission to perform this action" })
      );

      await broadcastsDraft({ name: "Spring sale", token: TOKEN, json: true });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("FORBIDDEN");
      expect(env.error?.message).toBe(
        "You don't have permission to perform this action"
      );
      expect(env.error?.suggestion).toContain("broadcasts write permission");
    });

    it("maps a plan-gate 403 to PLAN_REQUIRED with the upgrade hint", async () => {
      fetchMock.mockResolvedValueOnce(
        res(403, {
          error:
            "Scheduled broadcasts requires the pro plan or higher. Upgrade at https://wraps.dev/upgrade",
        })
      );

      await broadcastsDraft({
        name: "Spring sale",
        scheduledFor: "2030-01-01T09:00:00Z",
        token: TOKEN,
        json: true,
      });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("PLAN_REQUIRED");
      expect(env.error?.message).toContain("requires the pro plan or higher");
      expect(env.error?.suggestion).toContain("wraps.dev/upgrade");
    });

    it("maps a foreign segment 404 to NOT_FOUND naming --segment-id", async () => {
      fetchMock.mockResolvedValueOnce(res(404, { error: "Segment not found" }));

      await broadcastsDraft({
        audienceType: "segment",
        segmentId: "seg_foreign",
        token: TOKEN,
        json: true,
      });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("NOT_FOUND");
      expect(env.error?.message).toBe("Segment not found");
      expect(env.error?.suggestion).toContain("--segment-id");
      expect(env.error?.suggestion).toContain("wraps segments list");
    });

    it("maps a foreign AWS account 404 to NOT_FOUND naming --aws-account-id", async () => {
      fetchMock.mockResolvedValueOnce(
        res(404, { error: "AWS account not found" })
      );

      await broadcastsDraft({
        name: "Spring sale",
        awsAccountId: "acct_foreign",
        token: TOKEN,
        json: true,
      });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("NOT_FOUND");
      expect(env.error?.message).toBe("AWS account not found");
      expect(env.error?.suggestion).toContain("--aws-account-id");
    });

    it("maps a 5xx to SERVER_ERROR and warns against a duplicate draft", async () => {
      fetchMock.mockResolvedValueOnce(
        res(500, { error: "Internal server error" })
      );

      await broadcastsDraft({ name: "Spring sale", token: TOKEN, json: true });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("SERVER_ERROR");
      expect(env.error?.suggestion).toContain("duplicate draft");
    });

    it("maps a 422 to VALIDATION_FAILED", async () => {
      fetchMock.mockResolvedValueOnce(
        res(422, { error: "subject must be at most 998 characters" })
      );

      await broadcastsDraft({ name: "Spring sale", token: TOKEN, json: true });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("VALIDATION_FAILED");
      expect(env.error?.message).toBe("subject must be at most 998 characters");
    });

    it("rejects a 201 without an id as REQUEST_FAILED", async () => {
      fetchMock.mockResolvedValueOnce(res(201, { status: "draft" }));

      await broadcastsDraft({ name: "Spring sale", token: TOKEN, json: true });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("REQUEST_FAILED");
      expect(env.error?.suggestion).toContain("duplicate draft");
    });
  });
});
