/**
 * Unit tests for `wraps email suppressions list|remove`.
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
import { suppressionsList, suppressionsRemove } from "../suppressions.js";

const API_BASE = "http://api.test";
const TOKEN = "wraps_test";
const TARGET = { apiBase: API_BASE, token: TOKEN };
const ACCOUNT = "acc_1";
const EMAIL = "a@x.co";

const ENTRY = {
  email: "bounced@example.com",
  reason: "BOUNCE",
  lastUpdated: "2026-10-01T00:00:00.000Z",
  awsAccountId: ACCOUNT,
  region: "us-east-1",
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

function requestedUrl(fetchMock: ReturnType<typeof vi.fn>, call = 0): URL {
  return new URL(String(fetchMock.mock.calls[call][0]));
}

describe("wraps email suppressions", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    setJsonMode(true);
    process.exitCode = undefined;
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.mocked(resolveApiTarget).mockResolvedValue({} as never);
    vi.mocked(checkApiTarget).mockReturnValue({
      ok: true,
      target: TARGET,
    } as never);
  });

  afterEach(() => {
    process.exitCode = undefined;
    setJsonMode(false);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** The single envelope printed for a failure, with exit code 1. */
  function failure(): { code: string; message: string; suggestion: string } {
    expect(logSpy).toHaveBeenCalledTimes(1);
    const env = envelope(logSpy);
    expect(env.success).toBe(false);
    expect(process.exitCode).toBe(1);
    return env.error as { code: string; message: string; suggestion: string };
  }

  describe("list", () => {
    it("lists entries in --json with pinned values and the envelope command name", async () => {
      fetchMock.mockResolvedValue(
        res(200, {
          entries: [ENTRY],
          nextCursor: undefined,
          hasMore: false,
          deniedAccountIds: [],
          unreachableAccountIds: [],
        })
      );

      await suppressionsList({ json: true, token: TOKEN });

      const env = envelope(logSpy);
      expect(env.success).toBe(true);
      expect(env.command).toBe("email.suppressions.list");
      expect(env.data).toEqual({
        entries: [ENTRY],
        nextCursor: null,
        hasMore: false,
        deniedAccountIds: [],
        unreachableAccountIds: [],
        suggestion: null,
      });
      expect(fetchMock.mock.calls[0][1]).toMatchObject({
        method: "GET",
        headers: { Authorization: `Bearer ${TOKEN}` },
      });
      expect(requestedUrl(fetchMock).pathname).toBe("/v1/suppressions");
      expect(requestedUrl(fetchMock).search).toBe("");
    });

    it("sends awsAccountId, reason in upper case, limit, and the cursor unchanged", async () => {
      const cursor = "eyJhY2Mx_-aWQiOiJ4In0=";
      fetchMock.mockResolvedValue(
        res(200, {
          entries: [],
          hasMore: false,
          deniedAccountIds: [],
          unreachableAccountIds: [],
        })
      );

      await suppressionsList({
        json: true,
        account: ACCOUNT,
        reason: "bounce",
        limit: "2",
        cursor,
      });

      const url = requestedUrl(fetchMock);
      expect(url.searchParams.get("awsAccountId")).toBe("acc_1");
      expect(url.searchParams.get("reason")).toBe("BOUNCE");
      expect(url.searchParams.get("limit")).toBe("2");
      expect(url.searchParams.get("cursor")).toBe(cursor);
      expect(url.searchParams.size).toBe(4);
    });

    it("human mode prints the entry, and the next-page command repeats --account, --reason and --limit", async () => {
      setJsonMode(false);
      fetchMock.mockResolvedValue(
        res(200, {
          entries: [ENTRY],
          nextCursor: "CURSOR_ABC-_",
          hasMore: true,
          deniedAccountIds: [],
          unreachableAccountIds: [],
        })
      );

      await suppressionsList({
        account: ACCOUNT,
        reason: "bounce",
        limit: "1",
      });

      expect(note).toHaveBeenCalledWith(
        expect.stringContaining("bounced@example.com  BOUNCE  acc_1"),
        "1 suppressed address(es)"
      );
      expect(log.info).toHaveBeenCalledWith(
        "Next page: wraps email suppressions list --account acc_1 --reason bounce --limit 1 --cursor CURSOR_ABC-_"
      );
    });

    it("a page can be empty while hasMore is true, and the human output says so", async () => {
      setJsonMode(false);
      fetchMock.mockResolvedValue(
        res(200, {
          entries: [],
          nextCursor: "TOKEN_ON_LAST_PAGE",
          hasMore: true,
          deniedAccountIds: [],
          unreachableAccountIds: [],
        })
      );

      await suppressionsList({ json: false });

      expect(log.info).toHaveBeenCalledWith(
        "No suppressed addresses match this filter."
      );
      expect(log.info).toHaveBeenCalledWith(
        expect.stringContaining(
          "A page can come back empty while hasMore is true"
        )
      );
      expect(process.exitCode).toBeUndefined();
    });

    it("surfaces denied and unreachable accounts in --json with the fix-it commands", async () => {
      fetchMock.mockResolvedValue(
        res(200, {
          entries: [ENTRY],
          hasMore: false,
          deniedAccountIds: ["acc_2"],
          unreachableAccountIds: ["acc_3"],
        })
      );

      await suppressionsList({ json: true });

      const env = envelope(logSpy);
      expect(env.success).toBe(true);
      expect(env.data?.deniedAccountIds).toEqual(["acc_2"]);
      expect(env.data?.unreachableAccountIds).toEqual(["acc_3"]);
      expect(String(env.data?.suggestion)).toContain(
        "wraps platform update-role"
      );
      expect(String(env.data?.suggestion)).toContain("wraps email health");
    });

    it("surfaces denied and unreachable accounts in human mode with a warning and the suggestion", async () => {
      setJsonMode(false);
      fetchMock.mockResolvedValue(
        res(200, {
          entries: [],
          hasMore: false,
          deniedAccountIds: ["acc_2"],
          unreachableAccountIds: ["acc_3"],
        })
      );

      await suppressionsList({});

      expect(log.warn).toHaveBeenCalledWith(
        "No permission on 1 account(s): acc_2. They were skipped."
      );
      expect(log.warn).toHaveBeenCalledWith(
        "Could not reach 1 account(s): acc_3. They were skipped."
      );
      expect(log.info).toHaveBeenCalledWith(
        expect.stringContaining("wraps platform update-role")
      );
    });

    it("401 is NOT_AUTHENTICATED with a suggestion naming wraps auth login", async () => {
      fetchMock.mockResolvedValue(
        res(401, { error: "Unauthorized", code: "UNAUTHORIZED" })
      );

      await suppressionsList({ json: true });

      const err = failure();
      expect(err.code).toBe("NOT_AUTHENTICATED");
      expect(err.suggestion).toContain("wraps auth login");
    });

    it("no API target is NOT_AUTHENTICATED and sends no request", async () => {
      vi.mocked(checkApiTarget).mockReturnValue({
        ok: false,
        reason: "No API token",
        suggestion: "Run: wraps auth login",
      } as never);

      await suppressionsList({ json: true });

      expect(failure().code).toBe("NOT_AUTHENTICATED");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("a request that cannot be sent is NETWORK_ERROR", async () => {
      fetchMock.mockRejectedValue(new Error("socket hang up"));

      await suppressionsList({ json: true });

      const err = failure();
      expect(err.code).toBe("NETWORK_ERROR");
      expect(err.message).toContain("socket hang up");
    });

    it("403 with no update-role text is FORBIDDEN naming awsAccounts read access", async () => {
      fetchMock.mockResolvedValue(res(403, { error: "Forbidden" }));

      await suppressionsList({ json: true });

      const err = failure();
      expect(err.code).toBe("FORBIDDEN");
      expect(err.suggestion).toContain("awsAccounts read access");
    });

    it("404 for an account outside the org is NOT_FOUND and points at the list command", async () => {
      fetchMock.mockResolvedValue(res(404, { error: "AWS account not found" }));

      await suppressionsList({ json: true, account: "acc_other" });

      const err = failure();
      expect(err.code).toBe("NOT_FOUND");
      expect(err.message).toBe("AWS account not found");
      expect(err.suggestion).toContain("wraps email suppressions list --json");
    });

    it("400 for a cursor the API cannot decode is VALIDATION_FAILED and names the cursor", async () => {
      fetchMock.mockResolvedValue(res(400, { error: "Cursor is not valid" }));

      await suppressionsList({ json: true, cursor: "garbage" });

      const err = failure();
      expect(err.code).toBe("VALIDATION_FAILED");
      expect(err.suggestion).toContain("nextCursor");
    });

    it("502 is API_ERROR and suggests wraps email health", async () => {
      fetchMock.mockResolvedValue(
        res(502, { error: "Failed to load suppressions" })
      );

      await suppressionsList({ json: true });

      const err = failure();
      expect(err.code).toBe("API_ERROR");
      expect(err.suggestion).toContain("wraps email health");
    });

    it("rejects --limit outside 1-100 before any request, naming the flag", async () => {
      for (const limit of ["0", "101", "abc", "-1", "1.5"]) {
        logSpy.mockClear();
        process.exitCode = undefined;
        await suppressionsList({ json: true, limit });
        const err = failure();
        expect(err.code).toBe("INVALID_FLAG_VALUE");
        expect(err.message).toBe(
          "--limit must be a whole number from 1 to 100"
        );
        expect(err.suggestion).toContain("--limit 50");
      }
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects --limit given with no value before any request", async () => {
      await suppressionsList({ json: true, limit: true as unknown as string });

      expect(failure().code).toBe("INVALID_FLAG_VALUE");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects --reason other than bounce or complaint before any request, naming the flag", async () => {
      await suppressionsList({ json: true, reason: "spam" });

      const err = failure();
      expect(err.code).toBe("INVALID_FLAG_VALUE");
      expect(err.message).toBe("--reason must be bounce or complaint");
      expect(err.suggestion).toContain("--reason bounce");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects an empty --cursor before any request, naming the flag", async () => {
      await suppressionsList({ json: true, cursor: "   " });

      const err = failure();
      expect(err.code).toBe("INVALID_FLAG_VALUE");
      expect(err.message).toContain("--cursor");
      expect(err.suggestion).toContain("wraps email suppressions list --json");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("nextCursor is null in --json when the API omits it", async () => {
      fetchMock.mockResolvedValue(
        res(200, {
          entries: [],
          hasMore: false,
          deniedAccountIds: [],
          unreachableAccountIds: [],
        })
      );

      await suppressionsList({ json: true });

      expect(envelope(logSpy).data?.nextCursor).toBeNull();
    });
  });

  describe("remove", () => {
    it("removes with DELETE, the encoded email, awsAccountId and confirm=true, and no acknowledgedComplaint", async () => {
      fetchMock.mockResolvedValue(
        res(200, { success: true, email: "a+b@x.co", wasPresent: true })
      );

      await suppressionsRemove({
        email: "a+b@x.co",
        account: ACCOUNT,
        yes: true,
        json: true,
      });

      expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "DELETE" });
      const url = requestedUrl(fetchMock);
      expect(url.pathname).toBe("/v1/suppressions/a%2Bb%40x.co");
      expect(url.search).toBe("?awsAccountId=acc_1&confirm=true");
      expect(url.searchParams.has("acknowledgedComplaint")).toBe(false);

      const env = envelope(logSpy);
      expect(env.success).toBe(true);
      expect(env.command).toBe("email.suppressions.remove");
      expect(env.data).toEqual({
        email: "a+b@x.co",
        awsAccountId: ACCOUNT,
        dryRun: false,
        wasPresent: true,
      });
    });

    it("sends acknowledgedComplaint=true only when the user passed --acknowledge-complaint", async () => {
      fetchMock.mockResolvedValue(
        res(200, { success: true, email: EMAIL, wasPresent: true })
      );

      await suppressionsRemove({
        email: EMAIL,
        account: ACCOUNT,
        yes: true,
        acknowledgeComplaint: true,
        json: true,
      });

      expect(
        requestedUrl(fetchMock).searchParams.get("acknowledgedComplaint")
      ).toBe("true");
    });

    it("without --yes it refuses with CONFIRMATION_REQUIRED and an exact re-run command, and sends nothing", async () => {
      await suppressionsRemove({ email: EMAIL, account: ACCOUNT, json: true });

      const err = failure();
      expect(err.code).toBe("CONFIRMATION_REQUIRED");
      expect(err.suggestion).toBe(
        "Re-run with --yes to confirm: wraps email suppressions remove a@x.co --account acc_1 --yes"
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("the --yes re-run command repeats --acknowledge-complaint only when the user passed it", async () => {
      await suppressionsRemove({
        email: EMAIL,
        account: ACCOUNT,
        acknowledgeComplaint: true,
        json: true,
      });

      expect(failure().suggestion).toBe(
        "Re-run with --yes to confirm: wraps email suppressions remove a@x.co --account acc_1 --yes --acknowledge-complaint"
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("--dry-run previews with no request and no --yes", async () => {
      await suppressionsRemove({
        email: EMAIL,
        account: ACCOUNT,
        dryRun: true,
        json: true,
      });

      const env = envelope(logSpy);
      expect(env.success).toBe(true);
      expect(env.data).toEqual({
        email: EMAIL,
        awsAccountId: ACCOUNT,
        dryRun: true,
        wasPresent: null,
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("--dry-run in human mode says no request was sent", async () => {
      setJsonMode(false);

      await suppressionsRemove({
        email: EMAIL,
        account: ACCOUNT,
        dryRun: true,
      });

      expect(log.info).toHaveBeenCalledWith(
        "Dry run: a@x.co would be removed from account acc_1. No request was sent."
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("without --account it fails VALIDATION_FAILED and points at the list command", async () => {
      await suppressionsRemove({ email: EMAIL, yes: true, json: true });

      const err = failure();
      expect(err.code).toBe("VALIDATION_FAILED");
      expect(err.message).toBe("Missing --account <awsAccountId>");
      expect(err.suggestion).toContain("wraps email suppressions list --json");
      expect(err.suggestion).toContain("awsAccountId");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("without an email it fails MISSING_REQUIRED_FLAG with the usage line", async () => {
      await suppressionsRemove({ account: ACCOUNT, yes: true, json: true });

      const err = failure();
      expect(err.code).toBe("MISSING_REQUIRED_FLAG");
      expect(err.suggestion).toContain(
        "wraps email suppressions remove <email>"
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("refuses an email containing / with one envelope, exit code 1, and no fetch", async () => {
      await suppressionsRemove({
        email: "../x/y?z=1",
        account: ACCOUNT,
        yes: true,
        json: true,
      });

      const err = failure();
      expect(err.code).toBe("VALIDATION_FAILED");
      expect(err.message).toContain('"/"');
      expect(err.suggestion).toContain("wraps email suppressions list --json");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("keeps a hostile address that has no slash as one encoded path segment", async () => {
      fetchMock.mockResolvedValue(
        res(200, { success: true, email: "a?z=1#b+c@x.co", wasPresent: true })
      );

      await suppressionsRemove({
        email: "a?z=1#b+c@x.co",
        account: ACCOUNT,
        yes: true,
        json: true,
      });

      const url = requestedUrl(fetchMock);
      expect(url.pathname).toBe("/v1/suppressions/a%3Fz%3D1%23b%2Bc%40x.co");
      expect(url.pathname.split("/")).toHaveLength(4);
      expect(url.search).toBe("?awsAccountId=acc_1&confirm=true");
    });

    it("409 for a complaint suppression says removing it risks reputation and gives the re-run with --acknowledge-complaint", async () => {
      fetchMock.mockResolvedValue(
        res(409, {
          error:
            "This address was suppressed because of a spam complaint. Confirm you understand before removing it.",
        })
      );

      await suppressionsRemove({
        email: EMAIL,
        account: ACCOUNT,
        yes: true,
        json: true,
      });

      const err = failure();
      expect(err.code).toBe("CONFLICT");
      expect(err.message).toContain("spam complaint");
      expect(err.message).toContain("risks your sending reputation");
      expect(err.suggestion).toBe(
        "Only if you have confirmed it is safe, re-run with --acknowledge-complaint: wraps email suppressions remove a@x.co --account acc_1 --yes --acknowledge-complaint"
      );
    });

    it("404 when the address is not on the list is NOT_FOUND naming the list command", async () => {
      fetchMock.mockResolvedValue(
        res(404, { error: "This address is not on the suppression list." })
      );

      await suppressionsRemove({
        email: EMAIL,
        account: ACCOUNT,
        yes: true,
        json: true,
      });

      const err = failure();
      expect(err.code).toBe("NOT_FOUND");
      expect(err.message).toBe("This address is not on the suppression list.");
      expect(err.suggestion).toContain("wraps email suppressions list --json");
    });

    it("404 for an account outside the org is NOT_FOUND naming the list command", async () => {
      fetchMock.mockResolvedValue(res(404, { error: "AWS account not found" }));

      await suppressionsRemove({
        email: EMAIL,
        account: "acc_other",
        yes: true,
        json: true,
      });

      const err = failure();
      expect(err.code).toBe("NOT_FOUND");
      expect(err.suggestion).toContain("wraps email suppressions list --json");
    });

    it("401 is NOT_AUTHENTICATED with a suggestion naming wraps auth login", async () => {
      fetchMock.mockResolvedValue(res(401, { error: "Unauthorized" }));

      await suppressionsRemove({
        email: EMAIL,
        account: ACCOUNT,
        yes: true,
        json: true,
      });

      const err = failure();
      expect(err.code).toBe("NOT_AUTHENTICATED");
      expect(err.suggestion).toContain("wraps auth login");
    });

    it("403 with the SES permission text is FORBIDDEN and names wraps platform update-role", async () => {
      fetchMock.mockResolvedValue(
        res(403, {
          error:
            "Wraps doesn't have permission to manage the suppression list on this account. Run `wraps platform update-role` to refresh permissions.",
        })
      );

      await suppressionsRemove({
        email: EMAIL,
        account: ACCOUNT,
        yes: true,
        json: true,
      });

      const err = failure();
      expect(err.code).toBe("FORBIDDEN");
      expect(err.suggestion).toContain("wraps platform update-role");
    });

    it("403 for a read-only member is FORBIDDEN naming awsAccounts write access", async () => {
      fetchMock.mockResolvedValue(res(403, { error: "Forbidden" }));

      await suppressionsRemove({
        email: EMAIL,
        account: ACCOUNT,
        yes: true,
        json: true,
      });

      expect(failure().suggestion).toContain("awsAccounts write access");
    });

    it("502 is API_ERROR", async () => {
      fetchMock.mockResolvedValue(
        res(502, { error: "Failed to remove suppression" })
      );

      await suppressionsRemove({
        email: EMAIL,
        account: ACCOUNT,
        yes: true,
        json: true,
      });

      expect(failure().code).toBe("API_ERROR");
    });

    it("no API target is NOT_AUTHENTICATED and sends no request", async () => {
      vi.mocked(checkApiTarget).mockReturnValue({
        ok: false,
        reason: "No API token",
        suggestion: "Run: wraps auth login",
      } as never);

      await suppressionsRemove({
        email: EMAIL,
        account: ACCOUNT,
        yes: true,
        json: true,
      });

      expect(failure().code).toBe("NOT_AUTHENTICATED");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("a request that cannot be sent is NETWORK_ERROR", async () => {
      fetchMock.mockRejectedValue(new Error("socket hang up"));

      await suppressionsRemove({
        email: EMAIL,
        account: ACCOUNT,
        yes: true,
        json: true,
      });

      expect(failure().code).toBe("NETWORK_ERROR");
    });

    it("human success names the address and the account", async () => {
      setJsonMode(false);
      fetchMock.mockResolvedValue(
        res(200, { success: true, email: EMAIL, wasPresent: true })
      );

      await suppressionsRemove({ email: EMAIL, account: ACCOUNT, yes: true });

      expect(log.success).toHaveBeenCalledWith(
        "Removed a@x.co from the suppression list of account acc_1."
      );
    });

    it("human mode reports wasPresent=false as nothing changed", async () => {
      setJsonMode(false);
      fetchMock.mockResolvedValue(
        res(200, { success: true, email: EMAIL, wasPresent: false })
      );

      await suppressionsRemove({ email: EMAIL, account: ACCOUNT, yes: true });

      expect(log.warn).toHaveBeenCalledWith(
        "a@x.co was no longer on the list of account acc_1; nothing changed."
      );
    });
  });
});
