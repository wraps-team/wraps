/**
 * Unit tests for `wraps brand-kits`.
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
  brandKitsCreate,
  brandKitsDelete,
  brandKitsGet,
  brandKitsList,
  brandKitsSetDefault,
  brandKitsUpdate,
} from "../brand-kits.js";

const API_BASE = "http://api.test";
const TOKEN = "wraps_test";
const HOSTILE = "../x/y?z=1";

const KIT = {
  id: "bk_1",
  organizationId: "org_a",
  name: "Acme",
  logoUrl: null,
  primaryColor: "#112233",
  secondaryColor: "#445566",
  backgroundColor: "#ffffff",
  textColor: "#000000",
  fontFamily: "Inter",
  headingFontFamily: null,
  buttonStyle: "rounded",
  buttonRadius: "8px",
  companyName: "Acme Inc",
  companyAddress: null,
  socialLinks: [{ platform: "x", url: "https://x.com/acme" }],
  sourceDomain: "acme.test",
  autoExtracted: false,
  isDefault: true,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-02T00:00:00.000Z",
};

const KIT_2 = { ...KIT, id: "bk_2", name: "Beta", isDefault: false };

const KIT_KEYS = [
  "autoExtracted",
  "backgroundColor",
  "buttonRadius",
  "buttonStyle",
  "companyAddress",
  "companyName",
  "createdAt",
  "fontFamily",
  "headingFontFamily",
  "id",
  "isDefault",
  "logoUrl",
  "name",
  "organizationId",
  "primaryColor",
  "secondaryColor",
  "socialLinks",
  "sourceDomain",
  "textColor",
  "updatedAt",
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

function sentBody(fetchMock: ReturnType<typeof vi.fn>, call = 0) {
  const init = fetchMock.mock.calls[call]?.[1] as { body?: string };
  return JSON.parse(init.body ?? "null") as Record<string, unknown>;
}

describe("brand-kits commands", () => {
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
    it("returns every kit unpaginated with a total and fixed keys", async () => {
      fetchMock.mockResolvedValueOnce(
        res(200, { brandKits: [KIT, KIT_2], count: 2 })
      );

      await brandKitsList({ token: TOKEN, json: true });

      const env = envelope(consoleLogSpy);
      expect(env.success).toBe(true);
      expect(env.command).toBe("brand-kits.list");
      expect(Object.keys(env.data ?? {}).sort()).toEqual([
        "brandKits",
        "total",
      ]);
      expect(env.data?.total).toBe(2);
      const kits = env.data?.brandKits as Record<string, unknown>[];
      expect(kits.map((kit) => kit.id)).toEqual(["bk_1", "bk_2"]);
      expect(Object.keys(kits[0] ?? {}).sort()).toEqual(KIT_KEYS);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0]?.[0]).toBe(`${API_BASE}/v1/brand-kits`);
      expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
        method: "GET",
        headers: { Authorization: `Bearer ${TOKEN}` },
      });
    });

    it("reports zero kits with total 0", async () => {
      fetchMock.mockResolvedValueOnce(res(200, { brandKits: [], count: 0 }));

      await brandKitsList({ token: TOKEN, json: true });

      const env = envelope(consoleLogSpy);
      expect(env.data).toEqual({ brandKits: [], total: 0 });
    });
  });

  describe("get", () => {
    it("fetches one kit by id and emits the fixed shape", async () => {
      fetchMock.mockResolvedValueOnce(res(200, KIT));

      await brandKitsGet({ id: "bk_1", token: TOKEN, json: true });

      const env = envelope(consoleLogSpy);
      expect(env.command).toBe("brand-kits.get");
      expect(Object.keys(env.data ?? {}).sort()).toEqual(KIT_KEYS);
      expect(env.data?.id).toBe("bk_1");
      expect(fetchMock.mock.calls[0]?.[0]).toBe(
        `${API_BASE}/v1/brand-kits/bk_1`
      );
    });

    it("refuses a missing id before any request", async () => {
      await brandKitsGet({ token: TOKEN, json: true });

      const env = envelope(consoleLogSpy);
      expect(env.success).toBe(false);
      expect(env.error?.code).toBe("MISSING_REQUIRED_FLAG");
      expect(env.error?.suggestion).toMatch(/^Usage: wraps brand-kits get /);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });
  });

  describe("create", () => {
    it("sends only the flags passed, as typed, and returns the new kit", async () => {
      fetchMock.mockResolvedValueOnce(res(201, KIT));

      await brandKitsCreate({
        token: TOKEN,
        json: true,
        name: "Acme",
        primaryColor: "#112233",
        companyName: "Acme Inc",
        socialLinks: '[{"platform":"x","url":"https://x.com/acme"}]',
        default: true,
      });

      expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "POST" });
      expect(sentBody(fetchMock)).toEqual({
        name: "Acme",
        primaryColor: "#112233",
        companyName: "Acme Inc",
        socialLinks: [{ platform: "x", url: "https://x.com/acme" }],
        isDefault: true,
      });
      const env = envelope(consoleLogSpy);
      expect(env.command).toBe("brand-kits.create");
      expect(env.data?.id).toBe("bk_1");
    });

    it("sends null for a nullable field given the literal null", async () => {
      fetchMock.mockResolvedValueOnce(res(201, KIT));

      await brandKitsCreate({ token: TOKEN, json: true, logoUrl: "null" });

      expect(sentBody(fetchMock)).toEqual({ logoUrl: null });
    });

    it("refuses malformed --social-links before any request", async () => {
      await brandKitsCreate({
        token: TOKEN,
        json: true,
        socialLinks: '{"platform":"x"}',
      });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("INVALID_FLAG_VALUE");
      expect(env.error?.suggestion).toContain("--social-links");
      expect(fetchMock).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });

    it("refuses --social-links that is not JSON before any request", async () => {
      await brandKitsCreate({ token: TOKEN, json: true, socialLinks: "x.com" });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("INVALID_FLAG_VALUE");
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("update", () => {
    it("sends a PATCH with only the flags passed", async () => {
      fetchMock.mockResolvedValueOnce(res(200, { ...KIT, name: "Acme 2" }));

      await brandKitsUpdate({
        id: "bk_1",
        name: "Acme 2",
        headingFontFamily: "null",
        token: TOKEN,
        json: true,
      });

      expect(fetchMock.mock.calls[0]?.[0]).toBe(
        `${API_BASE}/v1/brand-kits/bk_1`
      );
      expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "PATCH" });
      expect(sentBody(fetchMock)).toEqual({
        name: "Acme 2",
        headingFontFamily: null,
      });
      const env = envelope(consoleLogSpy);
      expect(env.command).toBe("brand-kits.update");
      expect(env.data?.name).toBe("Acme 2");
    });

    it("refuses an update with no brand flags before any request", async () => {
      await brandKitsUpdate({ id: "bk_1", token: TOKEN, json: true });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("MISSING_REQUIRED_FLAG");
      expect(env.error?.message).toBe("Nothing to update");
      expect(env.error?.suggestion).toContain("wraps brand-kits update");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("refuses a missing id before any request", async () => {
      await brandKitsUpdate({ name: "x", token: TOKEN, json: true });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("MISSING_REQUIRED_FLAG");
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("delete", () => {
    it("refuses without --yes and names the re-run command", async () => {
      await brandKitsDelete({ id: "bk_1", token: TOKEN, json: true });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("CONFIRMATION_REQUIRED");
      expect(env.error?.suggestion).toBe(
        "Re-run with --yes to confirm: wraps brand-kits delete bk_1 --yes"
      );
      expect(fetchMock).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });

    it("--dry-run makes no request and needs no --yes", async () => {
      await brandKitsDelete({ id: "bk_1", dryRun: true, json: true });

      const env = envelope(consoleLogSpy);
      expect(env.success).toBe(true);
      expect(env.data).toEqual({ id: "bk_1", deleted: false, dryRun: true });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("with --yes sends DELETE with confirm=true and an encoded id", async () => {
      fetchMock.mockResolvedValueOnce(res(200, { success: true }));

      await brandKitsDelete({
        id: "bk_1",
        yes: true,
        token: TOKEN,
        json: true,
      });

      expect(fetchMock.mock.calls[0]?.[0]).toBe(
        `${API_BASE}/v1/brand-kits/bk_1?confirm=true`
      );
      expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "DELETE" });
      const env = envelope(consoleLogSpy);
      expect(env.command).toBe("brand-kits.delete");
      expect(env.data).toEqual({ id: "bk_1", deleted: true, dryRun: false });
    });
  });

  describe("set-default", () => {
    it("POSTs to /default and returns the kit now marked default", async () => {
      fetchMock.mockResolvedValueOnce(res(200, KIT));

      await brandKitsSetDefault({ id: "bk_1", token: TOKEN, json: true });

      expect(fetchMock.mock.calls[0]?.[0]).toBe(
        `${API_BASE}/v1/brand-kits/bk_1/default`
      );
      expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "POST" });
      const env = envelope(consoleLogSpy);
      expect(env.command).toBe("brand-kits.set-default");
      expect(env.data?.isDefault).toBe(true);
    });
  });

  describe("API errors", () => {
    it("maps a 401 to NOT_AUTHENTICATED with the login fix", async () => {
      fetchMock.mockResolvedValueOnce(res(401, { error: "Unauthorized" }));

      await brandKitsList({ token: TOKEN, json: true });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("NOT_AUTHENTICATED");
      expect(env.error?.suggestion).toContain("wraps auth login");
      expect(process.exitCode).toBe(1);
    });

    it("maps a 403 to FORBIDDEN naming the templates write permission", async () => {
      fetchMock.mockResolvedValueOnce(res(403, { error: "Forbidden" }));

      await brandKitsSetDefault({ id: "bk_1", token: TOKEN, json: true });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("FORBIDDEN");
      expect(env.error?.suggestion).toContain("templates write permission");
    });

    it("maps a 404 to NOT_FOUND pointing at the list command", async () => {
      fetchMock.mockResolvedValueOnce(
        res(404, { error: "Brand kit not found" })
      );

      await brandKitsGet({ id: "bk_missing", token: TOKEN, json: true });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("NOT_FOUND");
      expect(env.error?.message).toBe("Brand kit not found");
      expect(env.error?.suggestion).toContain("wraps brand-kits list");
    });

    it("maps a 400 to VALIDATION_FAILED", async () => {
      fetchMock.mockResolvedValueOnce(res(400, { error: "Name is required" }));

      await brandKitsUpdate({
        id: "bk_1",
        name: " ",
        token: TOKEN,
        json: true,
      });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("VALIDATION_FAILED");
    });

    it("reports a fetch failure as NETWORK_ERROR", async () => {
      fetchMock.mockRejectedValueOnce(new Error("socket hang up"));

      await brandKitsList({ token: TOKEN, json: true });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("NETWORK_ERROR");
      expect(env.error?.message).toContain("socket hang up");
    });

    it("keeps a hostile id one encoded path segment", async () => {
      fetchMock.mockResolvedValueOnce(res(200, KIT));

      await brandKitsGet({ id: HOSTILE, token: TOKEN, json: true });

      expect(fetchMock.mock.calls[0]?.[0]).toBe(
        `${API_BASE}/v1/brand-kits/${encodeURIComponent(HOSTILE)}`
      );
    });
  });

  describe("no target", () => {
    it("refuses before any request when no API target is configured", async () => {
      vi.mocked(checkApiTarget).mockReturnValue({
        ok: false,
        reason: "Not logged in",
        suggestion: "Run: wraps auth login",
      } as never);

      await brandKitsList({ json: true });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("NOT_AUTHENTICATED");
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("human output", () => {
    beforeEach(() => {
      setJsonMode(false);
    });

    it("says so when the org has no kits", async () => {
      fetchMock.mockResolvedValueOnce(res(200, { brandKits: [], count: 0 }));

      await brandKitsList({ token: TOKEN });

      expect(log.info).toHaveBeenCalledWith(
        expect.stringContaining("wraps brand-kits create")
      );
    });
  });
});
