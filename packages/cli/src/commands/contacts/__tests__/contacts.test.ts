/**
 * Contacts Command Tests
 *
 * Every sub-command prints exactly one --json envelope with fixed data keys,
 * sets process.exitCode = 1 on each error, and makes no request when it is
 * refused locally (missing id, missing email/phone, bad flag, delete without
 * --yes, delete --dry-run).
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
  contactsCreate,
  contactsDelete,
  contactsGet,
  contactsList,
  contactsUpdate,
} from "../contacts.js";

const CONTACT_KEYS = [
  "id",
  "externalId",
  "email",
  "phone",
  "firstName",
  "lastName",
  "company",
  "jobTitle",
  "emailStatus",
  "smsStatus",
  "preferredChannel",
  "properties",
  "emailsSent",
  "emailsOpened",
  "emailsClicked",
  "smsSent",
  "smsClicked",
  "createdAt",
  "updatedAt",
];

const MUTATION_KEYS = [...CONTACT_KEYS, "pendingTopics"];

const TARGET = { apiBase: "https://api.test", token: "wraps_test" };

function response(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function contact(overrides: Record<string, unknown> = {}) {
  return {
    id: "c_1",
    externalId: null,
    email: "ada@example.com",
    phone: null,
    firstName: "Ada",
    lastName: "Lovelace",
    company: null,
    jobTitle: null,
    emailStatus: "active",
    smsStatus: null,
    preferredChannel: "email",
    properties: { plan: "pro" },
    emailsSent: 0,
    emailsOpened: 0,
    emailsClicked: 0,
    smsSent: 0,
    smsClicked: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("contacts commands", () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockReset();
    process.exitCode = undefined;
    setJsonMode(true);
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.stubGlobal("fetch", fetchMock);

    vi.mocked(clack.log).error = vi.fn();
    vi.mocked(clack.log).info = vi.fn();
    vi.mocked(clack.log).success = vi.fn();
    vi.mocked(clack.note).mockImplementation(() => {});

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

  // Parses the single envelope the command printed.
  function envelope(): Record<string, unknown> {
    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    return JSON.parse(String(consoleLogSpy.mock.calls[0][0]));
  }

  // Asserts the envelope is an error with a code, message and suggestion, and exit 1.
  function expectFailure(code: string): Record<string, unknown> {
    const env = envelope();
    expect(env.success).toBe(false);
    const error = env.error as {
      code: string;
      message: string;
      suggestion: string;
    };
    expect(error.code).toBe(code);
    expect(error.message.length).toBeGreaterThan(0);
    expect(error.suggestion.length).toBeGreaterThan(0);
    expect(process.exitCode).toBe(1);
    return env;
  }

  describe("contacts list", () => {
    it("emits the fixed envelope and synthesizes nextCursor from the page number", async () => {
      fetchMock.mockResolvedValueOnce(
        response(200, {
          contacts: [contact()],
          total: 3,
          page: 1,
          pageSize: 2,
          totalPages: 2,
        })
      );

      await contactsList({ limit: "2", json: true, token: "wraps_test" });

      expect(fetchMock.mock.calls[0][0]).toBe(
        "https://api.test/v1/contacts?page=1&pageSize=2"
      );
      expect(fetchMock.mock.calls[0][1]).toMatchObject({
        headers: { Authorization: "Bearer wraps_test" },
      });
      const env = envelope();
      expect(env.success).toBe(true);
      expect(env.command).toBe("contacts.list");
      const data = env.data as Record<string, unknown>;
      expect(Object.keys(data)).toEqual([
        "contacts",
        "total",
        "page",
        "pageSize",
        "totalPages",
        "nextCursor",
      ]);
      expect(data.nextCursor).toBe("2");
      expect(data.total).toBe(3);
      expect(process.exitCode).toBeUndefined();
    });

    it("lists each contact with the fixed contact keys", async () => {
      fetchMock.mockResolvedValueOnce(
        response(200, {
          contacts: [contact()],
          total: 1,
          page: 1,
          pageSize: 50,
          totalPages: 1,
        })
      );

      await contactsList({ json: true });

      const data = envelope().data as { contacts: Record<string, unknown>[] };
      expect(Object.keys(data.contacts[0])).toEqual(CONTACT_KEYS);
    });

    it("returns nextCursor null on the last page and sends --cursor as the page", async () => {
      fetchMock.mockResolvedValueOnce(
        response(200, {
          contacts: [contact()],
          total: 3,
          page: 2,
          pageSize: 2,
          totalPages: 2,
        })
      );

      await contactsList({ cursor: "2", limit: "2", json: true });

      expect(fetchMock.mock.calls[0][0]).toBe(
        "https://api.test/v1/contacts?page=2&pageSize=2"
      );
      const data = envelope().data as Record<string, unknown>;
      expect(data.nextCursor).toBeNull();
      expect(data.page).toBe(2);
    });

    it("forwards the filter flags as query parameters", async () => {
      fetchMock.mockResolvedValueOnce(
        response(200, {
          contacts: [],
          total: 0,
          page: 1,
          pageSize: 50,
          totalPages: 0,
        })
      );

      await contactsList({
        emailStatus: "bounced",
        smsStatus: "opted_in",
        preferredChannel: "sms",
        search: "ada",
        json: true,
      });

      const url = new URL(String(fetchMock.mock.calls[0][0]));
      expect(url.searchParams.get("emailStatus")).toBe("bounced");
      expect(url.searchParams.get("smsStatus")).toBe("opted_in");
      expect(url.searchParams.get("preferredChannel")).toBe("sms");
      expect(url.searchParams.get("search")).toBe("ada");
      expect(url.searchParams.has("pageSize")).toBe(false);
    });

    it("rejects --limit above 100 without making a request", async () => {
      await contactsList({ limit: "500", json: true });

      expectFailure("INVALID_FLAG_USAGE");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects a non-numeric --cursor without making a request", async () => {
      await contactsList({ cursor: "abc", json: true });

      expectFailure("INVALID_FLAG_USAGE");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("returns NOT_AUTHENTICATED when no target is configured", async () => {
      vi.mocked(checkApiTarget).mockReturnValue({
        ok: false,
        reason: "No API token",
        suggestion: "Run: wraps auth login",
      } as never);

      await contactsList({ json: true });

      expectFailure("NOT_AUTHENTICATED");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each([
      [401, "NOT_AUTHENTICATED"],
      [403, "FORBIDDEN"],
      [429, "RATE_LIMITED"],
      [500, "API_ERROR"],
    ])("maps HTTP %i to %s", async (status, code) => {
      fetchMock.mockResolvedValueOnce(response(status, { error: "boom" }));

      await contactsList({ json: true });

      expectFailure(code);
    });

    it("maps a network failure to NETWORK_ERROR", async () => {
      fetchMock.mockRejectedValueOnce(new Error("socket hang up"));

      await contactsList({ json: true });

      expectFailure("NETWORK_ERROR");
    });

    it("prints a human error and no envelope outside JSON mode", async () => {
      setJsonMode(false);
      fetchMock.mockResolvedValueOnce(response(429, { error: "slow down" }));

      await contactsList({});

      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(vi.mocked(clack.log).error).toHaveBeenCalledTimes(1);
      expect(process.exitCode).toBe(1);
    });
  });

  describe("contacts get", () => {
    it("emits the contact keys plus topics", async () => {
      fetchMock.mockResolvedValueOnce(
        response(200, {
          ...contact(),
          topics: [
            {
              topicId: "t_1",
              topicName: "News",
              status: "subscribed",
              subscribedAt: null,
            },
          ],
        })
      );

      await contactsGet({ id: "c_1", json: true });

      expect(fetchMock.mock.calls[0][0]).toBe(
        "https://api.test/v1/contacts/c_1"
      );
      const env = envelope();
      expect(env.command).toBe("contacts.get");
      expect(Object.keys(env.data as object)).toEqual([
        ...CONTACT_KEYS,
        "topics",
      ]);
      expect(process.exitCode).toBeUndefined();
    });

    it("encodes an email identifier as a single path segment", async () => {
      fetchMock.mockResolvedValueOnce(response(200, contact()));

      await contactsGet({ id: "ada+x@example.com", json: true });

      expect(fetchMock.mock.calls[0][0]).toBe(
        "https://api.test/v1/contacts/ada%2Bx%40example.com"
      );
    });

    it("maps a 404 to NOT_FOUND", async () => {
      fetchMock.mockResolvedValueOnce(
        response(404, { error: "Contact not found", code: "NOT_FOUND" })
      );

      await contactsGet({ id: "missing", json: true });

      const env = expectFailure("NOT_FOUND");
      expect((env.error as { message: string }).message).toBe(
        "Contact not found"
      );
    });

    it("reports MISSING_REQUIRED_FLAG when the id is absent, without a request", async () => {
      await contactsGet({ json: true });

      expectFailure("MISSING_REQUIRED_FLAG");
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("contacts create", () => {
    it("posts the given fields and emits the mutation keys", async () => {
      fetchMock.mockResolvedValueOnce(
        response(201, { ...contact(), pendingTopics: ["t_2"] })
      );

      await contactsCreate({
        email: "ada@example.com",
        firstName: "Ada",
        topicIds: "t_1, t_2",
        properties: '{"plan":"pro"}',
        json: true,
      });

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("https://api.test/v1/contacts");
      expect((init as { method: string }).method).toBe("POST");
      expect(JSON.parse((init as { body: string }).body)).toEqual({
        email: "ada@example.com",
        firstName: "Ada",
        topicIds: ["t_1", "t_2"],
        properties: { plan: "pro" },
      });
      const env = envelope();
      expect(env.command).toBe("contacts.create");
      expect(Object.keys(env.data as object)).toEqual(MUTATION_KEYS);
      expect((env.data as { pendingTopics: string[] }).pendingTopics).toEqual([
        "t_2",
      ]);
    });

    it("reports pendingTopics as an empty array when the route omits it", async () => {
      fetchMock.mockResolvedValueOnce(response(201, contact()));

      await contactsCreate({ phone: "+15550100", json: true });

      const data = envelope().data as Record<string, unknown>;
      expect(data.pendingTopics).toEqual([]);
      expect(Object.keys(data)).toEqual(MUTATION_KEYS);
    });

    it("requires --email or --phone and makes no request without one", async () => {
      await contactsCreate({ firstName: "Ada", json: true });

      const env = expectFailure("MISSING_REQUIRED_FLAG");
      expect((env.error as { message: string }).message).toContain("--email");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects --properties that is not valid JSON", async () => {
      await contactsCreate({
        email: "ada@example.com",
        properties: "{nope",
        json: true,
      });

      expectFailure("INVALID_FLAG_USAGE");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects --properties that is a JSON array", async () => {
      await contactsCreate({
        email: "ada@example.com",
        properties: "[1,2]",
        json: true,
      });

      expectFailure("INVALID_FLAG_USAGE");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("reads the 409 message field before the error field", async () => {
      fetchMock.mockResolvedValueOnce(
        response(409, {
          error: "conflict",
          message: "Contact with this email already exists",
        })
      );

      await contactsCreate({ email: "ada@example.com", json: true });

      const env = expectFailure("CONFLICT");
      expect((env.error as { message: string }).message).toBe(
        "Contact with this email already exists"
      );
    });

    it("maps a 422 to VALIDATION_FAILED", async () => {
      fetchMock.mockResolvedValueOnce(
        response(422, { error: "Validation failed", code: "VALIDATION_FAILED" })
      );

      await contactsCreate({
        email: "ada@example.com",
        emailStatus: "nope",
        json: true,
      });

      expectFailure("VALIDATION_FAILED");
    });
  });

  describe("contacts update", () => {
    it("sends only the fields that were given", async () => {
      fetchMock.mockResolvedValueOnce(
        response(200, contact({ firstName: "Grace" }))
      );

      await contactsUpdate({ id: "c_1", firstName: "Grace", json: true });

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("https://api.test/v1/contacts/c_1");
      expect((init as { method: string }).method).toBe("PATCH");
      expect(JSON.parse((init as { body: string }).body)).toEqual({
        firstName: "Grace",
      });
      const env = envelope();
      expect(env.command).toBe("contacts.update");
      expect(Object.keys(env.data as object)).toEqual(MUTATION_KEYS);
      expect(process.exitCode).toBeUndefined();
    });

    it("refuses an update with no field flags, without a request", async () => {
      await contactsUpdate({ id: "c_1", json: true });

      expectFailure("MISSING_REQUIRED_FLAG");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("reports MISSING_REQUIRED_FLAG when the id is absent, without a request", async () => {
      await contactsUpdate({ firstName: "Grace", json: true });

      expectFailure("MISSING_REQUIRED_FLAG");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("maps a 404 to NOT_FOUND", async () => {
      fetchMock.mockResolvedValueOnce(
        response(404, { error: "Contact not found" })
      );

      await contactsUpdate({ id: "missing", firstName: "Grace", json: true });

      expectFailure("NOT_FOUND");
    });

    it("maps a 403 to FORBIDDEN", async () => {
      fetchMock.mockResolvedValueOnce(response(403, { error: "Forbidden" }));

      await contactsUpdate({ id: "c_1", firstName: "Grace", json: true });

      expectFailure("FORBIDDEN");
    });
  });

  describe("contacts delete", () => {
    it("refuses without --yes, with CONFIRMATION_REQUIRED and zero requests", async () => {
      await contactsDelete({ id: "c_1", json: true });

      expectFailure("CONFIRMATION_REQUIRED");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("--dry-run reports what would happen and makes no request", async () => {
      await contactsDelete({ id: "c_1", dryRun: true, json: true });

      expect(fetchMock).not.toHaveBeenCalled();
      const env = envelope();
      expect(env.success).toBe(true);
      expect(env.command).toBe("contacts.delete");
      expect(env.data).toEqual({ id: "c_1", deleted: false, dryRun: true });
      expect(process.exitCode).toBeUndefined();
    });

    it("--dry-run takes precedence over --yes and still makes no request", async () => {
      await contactsDelete({ id: "c_1", yes: true, dryRun: true, json: true });

      expect(fetchMock).not.toHaveBeenCalled();
      expect((envelope().data as { dryRun: boolean }).dryRun).toBe(true);
    });

    it("deletes with --yes and emits the fixed keys", async () => {
      fetchMock.mockResolvedValueOnce(response(200, { success: true }));

      await contactsDelete({ id: "c_1", yes: true, json: true });

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("https://api.test/v1/contacts/c_1");
      expect((init as { method: string }).method).toBe("DELETE");
      const env = envelope();
      expect(env.command).toBe("contacts.delete");
      expect(Object.keys(env.data as object)).toEqual([
        "id",
        "deleted",
        "dryRun",
      ]);
      expect(env.data).toEqual({ id: "c_1", deleted: true, dryRun: false });
    });

    it("maps a 404 to NOT_FOUND", async () => {
      fetchMock.mockResolvedValueOnce(
        response(404, { error: "Contact not found" })
      );

      await contactsDelete({ id: "missing", yes: true, json: true });

      expectFailure("NOT_FOUND");
    });

    it("reports MISSING_REQUIRED_FLAG when the id is absent, without a request", async () => {
      await contactsDelete({ yes: true, json: true });

      expectFailure("MISSING_REQUIRED_FLAG");
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
