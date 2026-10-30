/**
 * Unit tests for `wraps email inbound list|get`.
 *
 * Boundaries are mocked: the API target resolver, clack output and fetch.
 * The exported command functions run their real control flow. Every --json
 * assertion parses the single console.log envelope.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setJsonMode } from "../../../utils/shared/json-output.js";

vi.mock("@clack/prompts");
vi.mock("../../../utils/shared/api-target.js", () => ({
  resolveApiTarget: vi.fn(),
  checkApiTarget: vi.fn(),
}));

import { log, note } from "@clack/prompts";
import {
  checkApiTarget,
  resolveApiTarget,
} from "../../../utils/shared/api-target.js";
import { inboundEmailsGet, inboundEmailsList } from "../inbound-emails.js";

const API_BASE = "http://api.test";
const TOKEN = "wraps_test";
const TARGET = { apiBase: API_BASE, token: TOKEN };
const HOSTILE = "../x/y?z=1";

const SUMMARY = {
  awsAccountId: "acc_1",
  emailId: "em_1",
  from: { address: "sender@example.com", name: "Sender" },
  to: [{ address: "support@example.com", name: "" }],
  subject: "Hello there",
  receivedAt: "2026-10-01T10:00:00.000Z",
  hasAttachments: true,
  attachmentCount: 2,
  spamVerdict: "PASS",
  virusVerdict: "PASS",
};

const SUMMARY_KEYS = [
  "attachmentCount",
  "awsAccountId",
  "emailId",
  "from",
  "hasAttachments",
  "receivedAt",
  "spamVerdict",
  "subject",
  "to",
  "virusVerdict",
];

const DETAIL = {
  awsAccountId: "acc_1",
  emailId: "em_1",
  messageId: "<msg-1@example.com>",
  from: { address: "sender@example.com", name: "Sender" },
  to: [{ address: "support@example.com", name: "" }],
  cc: [],
  subject: "Hello there",
  date: "Sat, 1 Oct 2026 10:00:00 +0000",
  html: "<p>Hi</p>",
  htmlTruncated: true,
  text: "Hi",
  headers: { "x-test": "1" },
  attachments: [
    {
      id: "att_1",
      filename: "invoice.pdf",
      contentType: "application/pdf",
      size: 1024,
      s3Key: "parsed/attachments/invoice.pdf",
      contentDisposition: "attachment",
      cid: null,
    },
  ],
  spamVerdict: "PASS",
  virusVerdict: "PASS",
  rawS3Key: "parsed/em_1.json",
  receivedAt: "2026-10-01T10:00:00.000Z",
};

const DETAIL_KEYS = [
  "attachments",
  "awsAccountId",
  "cc",
  "date",
  "emailId",
  "from",
  "headers",
  "html",
  "htmlTruncated",
  "messageId",
  "rawS3Key",
  "receivedAt",
  "spamVerdict",
  "subject",
  "text",
  "to",
  "virusVerdict",
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

describe("wraps email inbound", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    setJsonMode(true);
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.mocked(resolveApiTarget).mockResolvedValue({} as never);
    vi.mocked(checkApiTarget).mockReturnValue({
      ok: true,
      target: TARGET,
    } as never);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.mocked(log.info).mockClear();
    vi.mocked(log.warn).mockClear();
    vi.mocked(log.error).mockClear();
    vi.mocked(note).mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    setJsonMode(false);
    process.exitCode = 0;
  });

  describe("list", () => {
    it("--json prints the list envelope with the route's keys, and the data keys are pinned", async () => {
      fetchMock.mockResolvedValue(
        res(200, {
          data: [SUMMARY],
          nextCursor: "cur_2",
          deniedAccountIds: [],
          unreachableAccountIds: [],
        })
      );

      await inboundEmailsList({ json: true });

      const env = envelope(logSpy);
      expect(env.success).toBe(true);
      expect(env.command).toBe("email.inbound.list");
      expect(Object.keys(env.data ?? {}).sort()).toEqual([
        "data",
        "deniedAccountIds",
        "nextCursor",
        "unreachableAccountIds",
      ]);
      expect(env.data?.nextCursor).toBe("cur_2");
      const rows = env.data?.data as Record<string, unknown>[];
      expect(rows).toHaveLength(1);
      expect(Object.keys(rows[0]).sort()).toEqual(SUMMARY_KEYS);
      expect(rows[0].emailId).toBe("em_1");
      expect(rows[0].attachmentCount).toBe(2);
    });

    it("calls GET /v1/email/inbound with no query when no flags are given", async () => {
      fetchMock.mockResolvedValue(
        res(200, {
          data: [],
          nextCursor: null,
          deniedAccountIds: [],
          unreachableAccountIds: [],
        })
      );

      await inboundEmailsList({ json: true });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toBe(
        "http://api.test/v1/email/inbound"
      );
      expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "GET" });
    });

    it("sends --account, --limit and --cursor as awsAccountId, limit and cursor query params", async () => {
      fetchMock.mockResolvedValue(
        res(200, {
          data: [],
          nextCursor: null,
          deniedAccountIds: [],
          unreachableAccountIds: [],
        })
      );

      await inboundEmailsList({
        account: "acc_1",
        limit: "50",
        cursor: "cur_2",
        json: true,
      });

      expect(fetchMock.mock.calls[0][0]).toBe(
        "http://api.test/v1/email/inbound?awsAccountId=acc_1&limit=50&cursor=cur_2"
      );
    });

    it("passes --token to the target resolver", async () => {
      fetchMock.mockResolvedValue(
        res(200, {
          data: [],
          nextCursor: null,
          deniedAccountIds: [],
          unreachableAccountIds: [],
        })
      );

      await inboundEmailsList({ token: "wraps_flag", json: true });

      expect(resolveApiTarget).toHaveBeenCalledWith({ token: "wraps_flag" });
    });

    it("human output prints the exact next --cursor command when nextCursor is set", async () => {
      setJsonMode(false);
      fetchMock.mockResolvedValue(
        res(200, {
          data: [SUMMARY],
          nextCursor: "cur_2",
          deniedAccountIds: [],
          unreachableAccountIds: [],
        })
      );

      await inboundEmailsList({ account: "acc_1", limit: "1" });

      expect(log.info).toHaveBeenCalledWith(
        "Next page: wraps email inbound list --account acc_1 --limit 1 --cursor cur_2"
      );
      expect(note).toHaveBeenCalledWith(
        expect.stringContaining("em_1"),
        expect.stringContaining("S3 key order, not received time")
      );
    });

    it("human output says the page is empty but more emails follow when data is [] and nextCursor is set", async () => {
      setJsonMode(false);
      fetchMock.mockResolvedValue(
        res(200, {
          data: [],
          nextCursor: "cur_3",
          deniedAccountIds: [],
          unreachableAccountIds: [],
        })
      );

      await inboundEmailsList({});

      expect(log.info).toHaveBeenCalledWith(
        expect.stringContaining("This page is empty, but more emails follow")
      );
      expect(log.info).toHaveBeenCalledWith(
        "Next page: wraps email inbound list --cursor cur_3"
      );
    });

    it("human output names the denied account and the fix when an account is skipped", async () => {
      setJsonMode(false);
      fetchMock.mockResolvedValue(
        res(200, {
          data: [SUMMARY],
          nextCursor: null,
          deniedAccountIds: ["acc_9"],
          unreachableAccountIds: [],
        })
      );

      await inboundEmailsList({});

      expect(log.warn).toHaveBeenCalledWith(
        "No permission on 1 account(s): acc_9. They were skipped."
      );
      expect(log.info).toHaveBeenCalledWith(
        expect.stringContaining("wraps platform update-role")
      );
      expect(log.info).toHaveBeenCalledWith("Last page: no nextCursor.");
    });

    it("401 from the API is NOT_AUTHENTICATED with a suggestion that names wraps auth login", async () => {
      fetchMock.mockResolvedValue(res(401, { error: "Unauthorized" }));

      await inboundEmailsList({ json: true });

      const env = envelope(logSpy);
      expect(env.success).toBe(false);
      expect(env.error?.code).toBe("NOT_AUTHENTICATED");
      expect(env.error?.suggestion).toContain("wraps auth login");
      expect(process.exitCode).toBe(1);
    });

    it("no API target is NOT_AUTHENTICATED with the resolver's suggestion, and no request is made", async () => {
      vi.mocked(checkApiTarget).mockReturnValue({
        ok: false,
        reason: "No API token",
        suggestion: "Run: wraps auth login",
      } as never);

      await inboundEmailsList({ json: true });

      const env = envelope(logSpy);
      expect(env.error?.code).toBe("NOT_AUTHENTICATED");
      expect(env.error?.message).toBe("No API token");
      expect(env.error?.suggestion).toContain("wraps auth login");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("a request that cannot be sent is NETWORK_ERROR and names WRAPS_API_URL", async () => {
      fetchMock.mockRejectedValue(new Error("socket hang up"));

      await inboundEmailsList({ json: true });

      const env = envelope(logSpy);
      expect(env.error?.code).toBe("NETWORK_ERROR");
      expect(env.error?.message).toContain("socket hang up");
      expect(env.error?.suggestion).toContain("WRAPS_API_URL");
    });

    it("404 for an unknown --account is NOT_FOUND and points at wraps email health", async () => {
      fetchMock.mockResolvedValue(res(404, { error: "AWS account not found" }));

      await inboundEmailsList({ account: "acc_missing", json: true });

      const env = envelope(logSpy);
      expect(env.error?.code).toBe("NOT_FOUND");
      expect(env.error?.message).toBe("AWS account not found");
      expect(env.error?.suggestion).toContain("wraps email health");
    });

    it("a 400 from the API is VALIDATION_FAILED and names --cursor", async () => {
      fetchMock.mockResolvedValue(
        res(400, { error: "Invalid cursor. Pass the nextCursor" })
      );

      await inboundEmailsList({ cursor: "cur_bad", json: true });

      const env = envelope(logSpy);
      expect(env.error?.code).toBe("VALIDATION_FAILED");
      expect(env.error?.suggestion).toContain("--cursor");
    });

    it("rejects --limit 0, 101 and a non-number before any request, naming --limit", async () => {
      for (const limit of ["0", "101", "abc"]) {
        await inboundEmailsList({ limit, json: true });
        const env = envelope(logSpy);
        expect(env.error?.code).toBe("INVALID_FLAG_VALUE");
        expect(env.error?.message).toContain(
          "--limit must be a whole number from 1 to 100"
        );
        expect(env.error?.suggestion).toContain(
          "wraps email inbound list --limit 20"
        );
        logSpy.mockClear();
      }
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects an empty --cursor before any request, and names the flag", async () => {
      await inboundEmailsList({ cursor: "   ", json: true });

      const env = envelope(logSpy);
      expect(env.error?.code).toBe("INVALID_FLAG_VALUE");
      expect(env.error?.message).toContain(
        "--cursor needs the nextCursor value"
      );
      expect(env.error?.suggestion).toContain("--cursor <value>");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects a bare --account (no value) before any request, and names --account", async () => {
      await inboundEmailsList({
        account: true as unknown as string,
        json: true,
      });

      const env = envelope(logSpy);
      expect(env.error?.code).toBe("INVALID_FLAG_VALUE");
      expect(env.error?.message).toContain("--account needs an awsAccountId");
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("get", () => {
    it("--json prints the detail envelope with the route's keys, and pins htmlTruncated true", async () => {
      fetchMock.mockResolvedValue(res(200, DETAIL));

      await inboundEmailsGet({ emailId: "em_1", json: true });

      const env = envelope(logSpy);
      expect(env.success).toBe(true);
      expect(env.command).toBe("email.inbound.get");
      expect(Object.keys(env.data ?? {}).sort()).toEqual(DETAIL_KEYS);
      expect(env.data?.htmlTruncated).toBe(true);
      expect(env.data?.emailId).toBe("em_1");
      expect(env.data?.messageId).toBe("<msg-1@example.com>");
      const attachments = env.data?.attachments as Record<string, unknown>[];
      expect(attachments).toHaveLength(1);
      expect(attachments[0].filename).toBe("invoice.pdf");
      expect(attachments[0].size).toBe(1024);
    });

    it("calls GET /v1/email/inbound/:emailId and sends --account as awsAccountId", async () => {
      fetchMock.mockResolvedValue(res(200, DETAIL));

      await inboundEmailsGet({ emailId: "em_1", account: "acc_1", json: true });

      expect(fetchMock.mock.calls[0][0]).toBe(
        "http://api.test/v1/email/inbound/em_1?awsAccountId=acc_1"
      );
    });

    it("passes --token to the target resolver", async () => {
      fetchMock.mockResolvedValue(res(200, DETAIL));

      await inboundEmailsGet({
        emailId: "em_1",
        token: "wraps_flag",
        json: true,
      });

      expect(resolveApiTarget).toHaveBeenCalledWith({ token: "wraps_flag" });
    });

    it("human output prints a visible htmlTruncated warning and the headers note", async () => {
      setJsonMode(false);
      fetchMock.mockResolvedValue(res(200, DETAIL));

      await inboundEmailsGet({ emailId: "em_1" });

      expect(log.warn).toHaveBeenCalledWith(
        expect.stringContaining("htmlTruncated: true")
      );
      expect(note).toHaveBeenCalledWith(
        expect.stringContaining("Message ID:"),
        "Inbound email — Hello there"
      );
      expect(note).toHaveBeenCalledWith("Hi", "Text body");
      expect(note).toHaveBeenCalledWith(
        expect.stringContaining("invoice.pdf"),
        expect.stringContaining("metadata only")
      );
    });

    it("human output with no text part says the email is HTML only and points at --json", async () => {
      setJsonMode(false);
      fetchMock.mockResolvedValue(
        res(200, { ...DETAIL, text: null, htmlTruncated: false })
      );

      await inboundEmailsGet({ emailId: "em_1" });

      expect(log.info).toHaveBeenCalledWith(
        expect.stringContaining("HTML part and no plain-text part")
      );
      expect(log.warn).not.toHaveBeenCalled();
    });

    it("404 is NOT_FOUND and says how to find the emailId", async () => {
      fetchMock.mockResolvedValue(
        res(404, { error: "Inbound email not found" })
      );

      await inboundEmailsGet({ emailId: "em_missing", json: true });

      const env = envelope(logSpy);
      expect(env.error?.code).toBe("NOT_FOUND");
      expect(env.error?.message).toBe("Inbound email not found");
      expect(env.error?.suggestion).toContain("wraps email inbound list");
    });

    it("401 from the API is NOT_AUTHENTICATED with a suggestion that names wraps auth login", async () => {
      fetchMock.mockResolvedValue(res(401, { error: "Unauthorized" }));

      await inboundEmailsGet({ emailId: "em_1", json: true });

      const env = envelope(logSpy);
      expect(env.error?.code).toBe("NOT_AUTHENTICATED");
      expect(env.error?.suggestion).toContain("wraps auth login");
    });

    it("no API target is NOT_AUTHENTICATED and sends no request", async () => {
      vi.mocked(checkApiTarget).mockReturnValue({
        ok: false,
        reason: "No API token",
        suggestion: "Run: wraps auth login",
      } as never);

      await inboundEmailsGet({ emailId: "em_1", json: true });

      expect(envelope(logSpy).error?.code).toBe("NOT_AUTHENTICATED");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("a request that cannot be sent is NETWORK_ERROR", async () => {
      fetchMock.mockRejectedValue(new Error("socket hang up"));

      await inboundEmailsGet({ emailId: "em_1", json: true });

      expect(envelope(logSpy).error?.code).toBe("NETWORK_ERROR");
    });

    it("a missing emailId is MISSING_REQUIRED_FLAG with the usage line, and sends no request", async () => {
      await inboundEmailsGet({ json: true });

      const env = envelope(logSpy);
      expect(env.error?.code).toBe("MISSING_REQUIRED_FLAG");
      expect(env.error?.suggestion).toBe(
        "Usage: wraps email inbound get <emailId>"
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("a hostile emailId stays one encoded path segment", async () => {
      fetchMock.mockResolvedValue(
        res(404, { error: "Inbound email not found" })
      );

      await inboundEmailsGet({ emailId: HOSTILE, json: true });

      const url = new URL(String(fetchMock.mock.calls[0][0]));
      const segments = url.pathname.split("/").filter(Boolean);
      expect(segments).toEqual([
        "v1",
        "email",
        "inbound",
        "..%2Fx%2Fy%3Fz%3D1",
      ]);
      expect(url.search).toBe("");
    });
  });
});
