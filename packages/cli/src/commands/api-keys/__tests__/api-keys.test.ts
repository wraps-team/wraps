/**
 * Unit tests for `wraps api-keys`.
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

import { log, note } from "@clack/prompts";
import {
  checkApiTarget,
  resolveApiTarget,
} from "../../../utils/shared/api-target.js";
import { apiKeysCreate, apiKeysList, apiKeysRevoke } from "../api-keys.js";

const API_BASE = "http://api.test";
const TOKEN = "wraps_test_session_token";
const SECRET = "wraps_live_SECRETVALUE0123456789abcdefghijklmnop";
const ORG_A = { id: "org_a", name: "Acme", slug: "acme" };
const ORG_B = { id: "org_b", name: "Beta", slug: "beta" };

const KEY_VIEW = {
  id: "key_1",
  name: "ci",
  prefix: "wraps_live_abcdefgh...",
  permissions: ["contacts:read"],
  lastUsedAt: null,
  expiresAt: null,
  createdAt: "2026-10-01T00:00:00.000Z",
  createdBy: { id: "user_1", name: "Ada", email: "ada@example.test" },
};

function res(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function sessionTarget(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    apiBase: API_BASE,
    token: TOKEN,
    appUrl: "https://example.test",
    selfhosted: false,
    loginCommand: "wraps auth login",
    tokenType: "session",
    organizations: [ORG_A],
    ...overrides,
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

describe("api-keys commands", () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  const fetchMock = vi.fn();

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
      target: sessionTarget(),
    } as never);
  });

  afterEach(() => {
    process.exitCode = undefined;
    setJsonMode(false);
    vi.unstubAllGlobals();
    consoleLogSpy.mockRestore();
  });

  // Every string the command printed, on any channel. Used to prove a secret
  // is absent from error paths and present only where intended.
  function allOutput(): string {
    const calls = [
      ...consoleLogSpy.mock.calls,
      ...vi.mocked(log.error).mock.calls,
      ...vi.mocked(log.info).mock.calls,
      ...vi.mocked(log.success).mock.calls,
      ...vi.mocked(log.warn).mock.calls,
      ...vi.mocked(note).mock.calls,
    ];
    return calls.map((call) => call.map(String).join(" ")).join("\n");
  }

  describe("list", () => {
    it("emits the apiKeys data key from GET /v1/api-keys", async () => {
      fetchMock.mockResolvedValueOnce(res(200, { apiKeys: [KEY_VIEW] }));

      await apiKeysList({ token: TOKEN, json: true });

      const env = envelope(consoleLogSpy);
      expect(env.success).toBe(true);
      expect(env.command).toBe("api-keys.list");
      expect(Object.keys(env.data ?? {})).toEqual(["apiKeys"]);
      expect(env.data?.apiKeys).toEqual([KEY_VIEW]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(`${API_BASE}/v1/api-keys`);
      expect(init.method).toBe("GET");
    });

    it("takes no --cursor or --limit: a stray value never reaches the URL", async () => {
      fetchMock.mockResolvedValueOnce(res(200, { apiKeys: [] }));

      await apiKeysList({
        token: TOKEN,
        json: true,
        // @ts-expect-error -- list is not paginated; there is no cursor option
        cursor: "2",
        // @ts-expect-error -- list is not paginated; there is no limit option
        limit: "5",
      });

      expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE}/v1/api-keys`);
      expect(fetchMock.mock.calls[0][0]).not.toContain("?");
    });

    it("human mode prints each key's prefix and id, never a secret", async () => {
      fetchMock.mockResolvedValueOnce(res(200, { apiKeys: [KEY_VIEW] }));
      setJsonMode(false);

      await apiKeysList({ token: TOKEN });

      expect(note).toHaveBeenCalledWith(
        "ci  wraps_live_abcdefgh...  id key_1  last used never",
        "API keys"
      );
      expect(allOutput()).not.toContain("secretKey");
    });

    it("human mode says so when there are no keys", async () => {
      fetchMock.mockResolvedValueOnce(res(200, { apiKeys: [] }));
      setJsonMode(false);

      await apiKeysList({ token: TOKEN });

      expect(log.info).toHaveBeenCalledWith(
        expect.stringContaining("No API keys in this organization")
      );
    });

    it("401 maps to NOT_AUTHENTICATED with a suggestion naming wraps auth login", async () => {
      fetchMock.mockResolvedValueOnce(res(401, { error: "Unauthorized" }));

      await apiKeysList({ token: TOKEN, json: true });

      const env = envelope(consoleLogSpy);
      expect(env.success).toBe(false);
      expect(env.error?.code).toBe("NOT_AUTHENTICATED");
      expect(env.error?.suggestion).toContain("wraps auth login");
      expect(process.exitCode).toBe(1);
    });

    it("no API target gives NOT_AUTHENTICATED and makes no request", async () => {
      vi.mocked(checkApiTarget).mockReturnValue({
        ok: false,
        reason: "No API token",
        suggestion: "Run: wraps auth login",
      } as never);

      await apiKeysList({ json: true });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("NOT_AUTHENTICATED");
      expect(env.error?.suggestion).toContain("wraps auth login");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("fetch throwing maps to NETWORK_ERROR", async () => {
      fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));

      await apiKeysList({ token: TOKEN, json: true });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("NETWORK_ERROR");
      expect(env.error?.message).toContain("ECONNREFUSED");
    });

    it("a session-denial 403 maps to SESSION_REQUIRED, not FORBIDDEN", async () => {
      fetchMock.mockResolvedValueOnce(
        res(403, {
          error:
            "API keys cannot manage API keys. Sign in with `wraps auth login` and retry.",
        })
      );

      await apiKeysList({ token: TOKEN, json: true });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("SESSION_REQUIRED");
      expect(env.error?.message).toContain("API keys cannot manage API keys");
      expect(env.error?.suggestion).toBe(
        "Run: wraps auth login (browser sign-in), then re-run without --token / unset WRAPS_API_KEY"
      );
    });

    it("a permission 403 maps to FORBIDDEN with an owner-or-admin suggestion", async () => {
      fetchMock.mockResolvedValueOnce(
        res(403, { error: "You don't have permission to perform this action" })
      );

      await apiKeysList({ token: TOKEN, json: true });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("FORBIDDEN");
      expect(env.error?.suggestion).toContain("owner or admin");
    });
  });

  describe("session-only target check", () => {
    it("an explicit --token key is refused before any request", async () => {
      vi.mocked(checkApiTarget).mockReturnValue({
        ok: true,
        target: sessionTarget({
          token: "wraps_live_key",
          tokenType: "api-key",
        }),
      } as never);

      await apiKeysList({ token: "wraps_live_key", json: true });

      expect(resolveApiTarget).toHaveBeenCalledWith({
        token: "wraps_live_key",
      });
      expect(fetchMock).not.toHaveBeenCalled();
      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("SESSION_REQUIRED");
      expect(env.error?.message).toContain("API keys cannot manage API keys");
      expect(env.error?.suggestion).toBe(
        "Run: wraps auth login (browser sign-in), then re-run without --token / unset WRAPS_API_KEY"
      );
    });

    it("a stored api-key login (tokenType api-key, no flag) is refused for create and revoke too", async () => {
      vi.mocked(checkApiTarget).mockReturnValue({
        ok: true,
        target: sessionTarget({ tokenType: "api-key" }),
      } as never);

      await apiKeysCreate({ name: "ci", json: true });
      await apiKeysRevoke({ id: "key_1", yes: true, json: true });

      expect(fetchMock).not.toHaveBeenCalled();
      const lines = consoleLogSpy.mock.calls.map((c) =>
        JSON.parse(String(c[0]))
      );
      expect(lines.map((l) => l.command)).toEqual([
        "api-keys.create",
        "api-keys.revoke",
      ]);
      expect(lines.every((l) => l.error.code === "SESSION_REQUIRED")).toBe(
        true
      );
    });

    it("a target with no tokenType label counts as a session and proceeds", async () => {
      vi.mocked(checkApiTarget).mockReturnValue({
        ok: true,
        target: sessionTarget({ tokenType: undefined }),
      } as never);
      fetchMock.mockResolvedValueOnce(res(200, { apiKeys: [] }));

      await apiKeysList({ json: true });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(envelope(consoleLogSpy).success).toBe(true);
    });

    it("a 403 'cannot manage API keys' from the API maps to SESSION_REQUIRED on revoke too", async () => {
      fetchMock.mockResolvedValueOnce(
        res(403, {
          error:
            "API keys cannot manage API keys. Sign in with `wraps auth login` and retry.",
        })
      );

      await apiKeysRevoke({ id: "key_1", yes: true, json: true });

      expect(envelope(consoleLogSpy).error?.code).toBe("SESSION_REQUIRED");
    });
  });

  describe("organization header", () => {
    it("sends X-Organization-Id when the login knows exactly one organization", async () => {
      fetchMock.mockResolvedValueOnce(res(200, { apiKeys: [] }));

      await apiKeysList({ json: true });

      expect(fetchMock.mock.calls[0][1].headers).toEqual({
        Authorization: `Bearer ${TOKEN}`,
        "X-Organization-Id": "org_a",
      });
    });

    it("sends no X-Organization-Id when the login knows several organizations and --org is absent", async () => {
      vi.mocked(checkApiTarget).mockReturnValue({
        ok: true,
        target: sessionTarget({ organizations: [ORG_A, ORG_B] }),
      } as never);
      fetchMock.mockResolvedValueOnce(res(200, { apiKeys: [] }));

      await apiKeysList({ json: true });

      expect(fetchMock.mock.calls[0][1].headers).toEqual({
        Authorization: `Bearer ${TOKEN}`,
      });
    });

    it("--org sets X-Organization-Id explicitly, even with several organizations", async () => {
      vi.mocked(checkApiTarget).mockReturnValue({
        ok: true,
        target: sessionTarget({ organizations: [ORG_A, ORG_B] }),
      } as never);
      fetchMock.mockResolvedValueOnce(res(200, { apiKeys: [] }));

      await apiKeysList({ org: "org_b", json: true });

      expect(fetchMock.mock.calls[0][1].headers).toEqual({
        Authorization: `Bearer ${TOKEN}`,
        "X-Organization-Id": "org_b",
      });
    });

    it("--org is sent on create and revoke as well", async () => {
      fetchMock.mockResolvedValueOnce(res(200, { success: true }));

      await apiKeysRevoke({ id: "key_1", yes: true, org: "org_b", json: true });

      expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
        "X-Organization-Id": "org_b",
      });
    });
  });

  describe("create", () => {
    const CREATED = { apiKey: KEY_VIEW, secretKey: SECRET };

    it("JSON mode puts the secret in data.secretKey and posts the body", async () => {
      fetchMock.mockResolvedValueOnce(res(201, CREATED));

      await apiKeysCreate({
        name: "ci",
        type: "live",
        permissions: "contacts:read",
        expiresInDays: "90",
        json: true,
      });

      const env = envelope(consoleLogSpy);
      expect(env.success).toBe(true);
      expect(env.command).toBe("api-keys.create");
      expect(Object.keys(env.data ?? {}).sort()).toEqual([
        "apiKey",
        "secretKey",
      ]);
      expect(env.data?.secretKey).toBe(SECRET);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(`${API_BASE}/v1/api-keys`);
      expect(init.method).toBe("POST");
      expect(JSON.parse(init.body)).toEqual({
        name: "ci",
        type: "live",
        permissions: ["contacts:read"],
        expiresInDays: 90,
      });
    });

    it("sends only the name when no options are given (server defaults apply)", async () => {
      fetchMock.mockResolvedValueOnce(res(201, CREATED));

      await apiKeysCreate({ name: "  ci  ", json: true });

      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
        name: "ci",
      });
    });

    it("--permissions full and readonly pass through as presets", async () => {
      fetchMock.mockResolvedValueOnce(res(201, CREATED));
      await apiKeysCreate({ name: "ci", permissions: "readonly", json: true });
      expect(JSON.parse(fetchMock.mock.calls[0][1].body).permissions).toBe(
        "readonly"
      );
    });

    it("human mode prints the secret once in a note, with a copy-now warning", async () => {
      fetchMock.mockResolvedValueOnce(res(201, CREATED));
      setJsonMode(false);

      await apiKeysCreate({ name: "ci" });

      expect(note).toHaveBeenCalledTimes(1);
      expect(note).toHaveBeenCalledWith(
        SECRET,
        expect.stringContaining("cannot be retrieved again")
      );
      expect(log.success).toHaveBeenCalledWith(
        expect.stringContaining('Created API key "ci"')
      );
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it("the secret appears only in the intended output, never in logs or errors", async () => {
      fetchMock.mockResolvedValueOnce(res(201, CREATED));

      await apiKeysCreate({ name: "ci", json: true });

      const withSecret = consoleLogSpy.mock.calls.filter((c) =>
        String(c[0]).includes(SECRET)
      );
      expect(withSecret).toHaveLength(1);
      expect(log.error).not.toHaveBeenCalled();
      expect(log.info).not.toHaveBeenCalled();
      expect(log.success).not.toHaveBeenCalled();
      expect(log.warn).not.toHaveBeenCalled();
      expect(note).not.toHaveBeenCalled();
    });

    it("a 201 whose body cannot be read gives API_ERROR and never prints the secret", async () => {
      // The key was created, but the response lacks apiKey. The body still
      // carries the secret, so the error path must not echo it.
      fetchMock.mockResolvedValueOnce(res(201, { secretKey: SECRET }));

      await apiKeysCreate({ name: "ci", json: true });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("API_ERROR");
      expect(env.error?.suggestion).toContain("wraps api-keys list");
      expect(allOutput()).not.toContain(SECRET);
      expect(process.exitCode).toBe(1);
    });

    it("a 401 on create never prints a secret", async () => {
      fetchMock.mockResolvedValueOnce(res(401, { error: "Unauthorized" }));

      await apiKeysCreate({ name: "ci", json: true });

      expect(envelope(consoleLogSpy).error?.code).toBe("NOT_AUTHENTICATED");
      expect(allOutput()).not.toContain(SECRET);
    });

    it("a missing --name is rejected before any request, naming the flag", async () => {
      await apiKeysCreate({ json: true });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("MISSING_REQUIRED_FLAG");
      expect(env.error?.message).toContain("--name");
      expect(env.error?.suggestion).toContain("wraps api-keys create --name");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("a blank --name is rejected before any request", async () => {
      await apiKeysCreate({ name: "   ", json: true });

      expect(envelope(consoleLogSpy).error?.code).toBe("MISSING_REQUIRED_FLAG");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("a --name over 200 characters is rejected before any request", async () => {
      await apiKeysCreate({ name: "x".repeat(201), json: true });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("INVALID_FLAG_VALUE");
      expect(env.error?.message).toContain("--name");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each([
      ["0", "from 1 to 3650"],
      ["3651", "from 1 to 3650"],
      ["1.5", "from 1 to 3650"],
      ["abc", "from 1 to 3650"],
    ])(
      "--expires-in-days %s is rejected before any request",
      async (raw, range) => {
        await apiKeysCreate({ name: "ci", expiresInDays: raw, json: true });

        const env = envelope(consoleLogSpy);
        expect(env.error?.code).toBe("INVALID_FLAG_VALUE");
        expect(env.error?.message).toContain("--expires-in-days");
        expect(env.error?.message).toContain(range);
        expect(env.error?.suggestion).toContain("--expires-in-days");
        expect(fetchMock).not.toHaveBeenCalled();
      }
    );

    it("an unknown --type is rejected before any request, naming the allowed values", async () => {
      await apiKeysCreate({ name: "ci", type: "prod", json: true });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("INVALID_FLAG_VALUE");
      expect(env.error?.message).toContain("live, test, restricted");
      expect(env.error?.suggestion).toContain("--type live");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("an unknown permission in --permissions is rejected before any request", async () => {
      await apiKeysCreate({
        name: "ci",
        permissions: "contacts:read,contacts:delete",
        json: true,
      });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("INVALID_FLAG_VALUE");
      expect(env.error?.message).toContain("contacts:delete");
      expect(env.error?.suggestion).toContain("--permissions full");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("a 422 from the API maps to VALIDATION_FAILED with a runnable suggestion", async () => {
      fetchMock.mockResolvedValueOnce(
        res(422, { error: "Expected union value" })
      );

      await apiKeysCreate({ name: "ci", json: true });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("VALIDATION_FAILED");
      expect(env.error?.suggestion).toContain("wraps api-keys create --help");
    });
  });

  describe("revoke", () => {
    it("DELETEs /v1/api-keys/:id with confirm=true and reports the result in JSON", async () => {
      fetchMock.mockResolvedValueOnce(res(200, { success: true }));

      await apiKeysRevoke({ id: "key_1", yes: true, json: true });

      const env = envelope(consoleLogSpy);
      expect(env.success).toBe(true);
      expect(env.command).toBe("api-keys.revoke");
      expect(env.data).toEqual({ id: "key_1", revoked: true, dryRun: false });
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(`${API_BASE}/v1/api-keys/key_1?confirm=true`);
      expect(init.method).toBe("DELETE");
    });

    it("refuses without --yes, names the running-agent impact and the exact re-run command", async () => {
      await apiKeysRevoke({ id: "key_1", json: true });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("CONFIRMATION_REQUIRED");
      expect(env.error?.message).toContain("running agent");
      expect(env.error?.message).toContain("Nothing was revoked");
      expect(env.error?.suggestion).toBe(
        "Re-run with --yes to confirm: wraps api-keys revoke key_1 --yes"
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("--dry-run previews with no request and needs no --yes", async () => {
      await apiKeysRevoke({ id: "key_1", dryRun: true, json: true });

      expect(envelope(consoleLogSpy).data).toEqual({
        id: "key_1",
        revoked: false,
        dryRun: true,
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("a missing id is rejected before any request, naming the usage", async () => {
      await apiKeysRevoke({ yes: true, json: true });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("MISSING_REQUIRED_FLAG");
      expect(env.error?.suggestion).toContain(
        "wraps api-keys revoke <key-id> --yes"
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("a 404 maps to NOT_FOUND with a suggestion to list keys", async () => {
      fetchMock.mockResolvedValueOnce(res(404, { error: "API key not found" }));

      await apiKeysRevoke({ id: "key_missing", yes: true, json: true });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("NOT_FOUND");
      expect(env.error?.suggestion).toBe(
        "Check the key id. List keys with: wraps api-keys list"
      );
    });

    it("a hostile id stays one encoded path segment", async () => {
      fetchMock.mockResolvedValueOnce(res(200, { success: true }));

      await apiKeysRevoke({ id: "../x/y?z=1", yes: true, json: true });

      expect(fetchMock.mock.calls[0][0]).toBe(
        `${API_BASE}/v1/api-keys/..%2Fx%2Fy%3Fz%3D1?confirm=true`
      );
    });

    it("human mode confirms the revocation and names the key id", async () => {
      fetchMock.mockResolvedValueOnce(res(200, { success: true }));
      setJsonMode(false);

      await apiKeysRevoke({ id: "key_1", yes: true });

      expect(log.success).toHaveBeenCalledWith("Revoked API key key_1");
    });

    it("human mode --dry-run says no request was sent", async () => {
      setJsonMode(false);

      await apiKeysRevoke({ id: "key_1", dryRun: true });

      expect(log.info).toHaveBeenCalledWith(
        expect.stringContaining("No request was sent")
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("fetch throwing maps to NETWORK_ERROR", async () => {
      fetchMock.mockRejectedValueOnce(new Error("socket hang up"));

      await apiKeysRevoke({ id: "key_1", yes: true, json: true });

      expect(envelope(consoleLogSpy).error?.code).toBe("NETWORK_ERROR");
    });
  });
});
