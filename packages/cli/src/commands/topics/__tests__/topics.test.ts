/**
 * Unit tests for `wraps topics`.
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
  topicsCreate,
  topicsDelete,
  topicsGet,
  topicsList,
  topicsSubscribers,
  topicsUpdate,
} from "../topics.js";

const API_BASE = "http://api.test";
const TOKEN = "wraps_test";
const HOSTILE = "../x/y?z=1";

const TOPIC = {
  id: "topic_1",
  name: "Product news",
  slug: "product-news",
  description: null,
  public: true,
  doubleOptIn: false,
  subscriberCount: 4,
  sendableCount: 3,
  pendingCount: 1,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  createdBy: { id: "u_1", name: "Ada", email: "ada@example.test" },
};

const TOPIC_2 = { ...TOPIC, id: "topic_2", name: "Billing", slug: "billing" };
const TOPIC_3 = {
  ...TOPIC,
  id: "topic_3",
  name: "Changelog",
  slug: "changelog",
};

const TOPIC_KEYS = [
  "createdAt",
  "createdBy",
  "description",
  "doubleOptIn",
  "id",
  "name",
  "pendingCount",
  "public",
  "sendableCount",
  "slug",
  "subscriberCount",
  "updatedAt",
];

const SUBSCRIBER = {
  contactId: "c_1",
  email: "reader@example.test",
  status: "subscribed",
  subscribedAt: "2026-10-02T00:00:00.000Z",
  unsubscribedAt: null,
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

describe("topics commands", () => {
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
    it("pages the full list client-side and emits fixed data keys", async () => {
      fetchMock.mockResolvedValueOnce(
        res(200, { topics: [TOPIC, TOPIC_2, TOPIC_3] })
      );

      await topicsList({ limit: "2", token: TOKEN, json: true });

      const env = envelope(consoleLogSpy);
      expect(env.success).toBe(true);
      expect(env.command).toBe("topics.list");
      expect(Object.keys(env.data ?? {}).sort()).toEqual([
        "limit",
        "nextCursor",
        "offset",
        "topics",
        "total",
      ]);
      expect(env.data?.total).toBe(3);
      expect(env.data?.limit).toBe(2);
      expect(env.data?.offset).toBe(0);
      expect(env.data?.nextCursor).toBe("2");
      const topics = env.data?.topics as Record<string, unknown>[];
      expect(topics).toHaveLength(2);
      expect(Object.keys(topics[0]).sort()).toEqual(TOPIC_KEYS);
      expect(topics[0].id).toBe("topic_1");
    });

    it("requests exactly /v1/topics with GET and no query string", async () => {
      fetchMock.mockResolvedValueOnce(res(200, { topics: [TOPIC] }));

      await topicsList({ token: TOKEN, json: true });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(`${API_BASE}/v1/topics`);
      expect((init as RequestInit).method).toBe("GET");
    });

    it("returns the last page with nextCursor null when --cursor reaches the end", async () => {
      fetchMock.mockResolvedValueOnce(
        res(200, { topics: [TOPIC, TOPIC_2, TOPIC_3] })
      );

      await topicsList({ limit: "2", cursor: "2", json: true });

      const env = envelope(consoleLogSpy);
      expect(env.data?.offset).toBe(2);
      expect(env.data?.nextCursor).toBeNull();
      const topics = env.data?.topics as Record<string, unknown>[];
      expect(topics.map((t) => t.id)).toEqual(["topic_3"]);
    });

    it("prints the exact next command in human mode", async () => {
      setJsonMode(false);
      fetchMock.mockResolvedValueOnce(
        res(200, { topics: [TOPIC, TOPIC_2, TOPIC_3] })
      );

      await topicsList({ limit: "2", token: TOKEN });

      expect(log.info).toHaveBeenCalledWith(
        expect.stringContaining("wraps topics list --limit 2 --cursor 2")
      );
    });

    it("rejects --limit 0 with INVALID_FLAG_VALUE naming --limit before any request", async () => {
      await topicsList({ limit: "0", token: TOKEN, json: true });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("INVALID_FLAG_VALUE");
      expect(env.error?.message).toBe(
        '--limit must be a whole number from 1 to 100, got "0"'
      );
      expect(fetchMock).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });

    it("rejects a non-numeric --cursor before any request", async () => {
      await topicsList({ cursor: "abc", token: TOKEN, json: true });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("INVALID_FLAG_VALUE");
      expect(env.error?.message).toBe('--cursor "abc" is not a valid cursor');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("maps a 401 to NOT_AUTHENTICATED with a login suggestion", async () => {
      fetchMock.mockResolvedValueOnce(res(401, { error: "Unauthorized" }));

      await topicsList({ token: TOKEN, json: true });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("NOT_AUTHENTICATED");
      expect(env.error?.message).toBe("Unauthorized");
      expect(env.error?.suggestion).toContain("wraps auth login");
    });

    it("maps a plan 403 to PLAN_REQUIRED with the upgrade suggestion", async () => {
      fetchMock.mockResolvedValueOnce(
        res(403, {
          error:
            "Feature 'topics' requires pro plan or higher. Current plan: free. Upgrade at https://wraps.dev/upgrade",
        })
      );

      await topicsList({ token: TOKEN, json: true });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("PLAN_REQUIRED");
      expect(env.error?.suggestion).toContain("Pro plan");
      expect(env.error?.suggestion).toContain("https://wraps.dev/upgrade");
    });

    it("keeps a permission 403 as FORBIDDEN, not PLAN_REQUIRED", async () => {
      fetchMock.mockResolvedValueOnce(
        res(403, { error: "Missing permission: topics:read" })
      );

      await topicsList({ token: TOKEN, json: true });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("FORBIDDEN");
      expect(env.error?.message).toBe("Missing permission: topics:read");
    });

    it("reports NETWORK_ERROR when fetch throws", async () => {
      fetchMock.mockRejectedValueOnce(new Error("socket hang up"));

      await topicsList({ token: TOKEN, json: true });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("NETWORK_ERROR");
      expect(env.error?.message).toBe(
        "Could not reach the Wraps API (socket hang up)."
      );
    });

    it("refuses to run with no API target and makes no request", async () => {
      vi.mocked(checkApiTarget).mockReturnValueOnce({
        ok: false,
        reason: "No API token",
        suggestion: "Run: wraps auth login",
      } as never);

      await topicsList({ json: true });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("NOT_AUTHENTICATED");
      expect(env.error?.message).toBe("No API token.");
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("get", () => {
    it("returns the topic envelope for one id", async () => {
      fetchMock.mockResolvedValueOnce(res(200, TOPIC));

      await topicsGet({ id: "topic_1", token: TOKEN, json: true });

      const env = envelope(consoleLogSpy);
      expect(env.command).toBe("topics.get");
      expect(Object.keys(env.data ?? {}).sort()).toEqual(TOPIC_KEYS);
      expect(env.data?.subscriberCount).toBe(4);
      expect(env.data?.pendingCount).toBe(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(`${API_BASE}/v1/topics/topic_1`);
      expect((init as RequestInit).method).toBe("GET");
    });

    it("maps a 404 to NOT_FOUND and points at topics list", async () => {
      fetchMock.mockResolvedValueOnce(res(404, { error: "Topic not found" }));

      await topicsGet({ id: "topic_9", token: TOKEN, json: true });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("NOT_FOUND");
      expect(env.error?.message).toBe("Topic not found");
      expect(env.error?.suggestion).toBe(
        "Check the topic id. List topics with: wraps topics list"
      );
    });

    it("requires an id before any request", async () => {
      await topicsGet({ token: TOKEN, json: true });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("MISSING_REQUIRED_FLAG");
      expect(env.error?.message).toBe("Missing topic id");
      expect(env.error?.suggestion).toBe("Usage: wraps topics get <topic-id>");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("keeps a hostile id as one encoded path segment", async () => {
      fetchMock.mockResolvedValueOnce(res(404, { error: "Topic not found" }));

      await topicsGet({ id: HOSTILE, token: TOKEN, json: true });

      const url = new URL(String(fetchMock.mock.calls[0][0]));
      expect(url.pathname).toBe(`/v1/topics/${encodeURIComponent(HOSTILE)}`);
      expect(url.search).toBe("");
    });
  });

  describe("create", () => {
    it("posts name and optional description and returns the created topic", async () => {
      fetchMock.mockResolvedValueOnce(res(201, TOPIC));

      await topicsCreate({
        name: "Product news",
        description: "Launches",
        token: TOKEN,
        json: true,
      });

      const env = envelope(consoleLogSpy);
      expect(env.command).toBe("topics.create");
      expect(env.data?.id).toBe("topic_1");
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(`${API_BASE}/v1/topics`);
      expect((init as RequestInit).method).toBe("POST");
      expect(JSON.parse(String((init as RequestInit).body))).toEqual({
        name: "Product news",
        description: "Launches",
      });
    });

    it("sends --public false and --double-opt-in true as booleans", async () => {
      fetchMock.mockResolvedValueOnce(res(201, TOPIC));

      await topicsCreate({
        name: "Billing",
        slug: "billing",
        public: "false",
        doubleOptIn: "true",
        token: TOKEN,
        json: true,
      });

      const [, init] = fetchMock.mock.calls[0];
      expect(JSON.parse(String((init as RequestInit).body))).toEqual({
        name: "Billing",
        slug: "billing",
        public: false,
        doubleOptIn: true,
      });
    });

    it("requires --name with a usage line naming the flag", async () => {
      await topicsCreate({ token: TOKEN, json: true });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("MISSING_REQUIRED_FLAG");
      expect(env.error?.message).toBe("Missing --name");
      expect(env.error?.suggestion).toContain(
        "wraps topics create --name <name>"
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects --public yes with the accepted values before any request", async () => {
      await topicsCreate({
        name: "Billing",
        public: "yes",
        token: TOKEN,
        json: true,
      });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("INVALID_FLAG_VALUE");
      expect(env.error?.message).toBe(
        '--public must be "true" or "false", got "yes"'
      );
      expect(env.error?.suggestion).toBe(
        "Pass --public true or --public false."
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("maps a duplicate slug 409 to CONFLICT and suggests --slug", async () => {
      fetchMock.mockResolvedValueOnce(
        res(409, { error: "A topic with this slug already exists" })
      );

      await topicsCreate({ name: "Billing", token: TOKEN, json: true });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("CONFLICT");
      expect(env.error?.message).toBe("A topic with this slug already exists");
      expect(env.error?.suggestion).toContain("Pass a different --slug");
    });

    it("maps a 401 to NOT_AUTHENTICATED with a login suggestion", async () => {
      fetchMock.mockResolvedValueOnce(res(401, { error: "Unauthorized" }));

      await topicsCreate({ name: "Billing", token: TOKEN, json: true });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("NOT_AUTHENTICATED");
      expect(env.error?.suggestion).toContain("wraps auth login");
    });
  });

  describe("update", () => {
    it("patches only the fields passed", async () => {
      fetchMock.mockResolvedValueOnce(res(200, { ...TOPIC, name: "News" }));

      await topicsUpdate({
        id: "topic_1",
        name: "News",
        public: "true",
        token: TOKEN,
        json: true,
      });

      const env = envelope(consoleLogSpy);
      expect(env.command).toBe("topics.update");
      expect(env.data?.name).toBe("News");
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(`${API_BASE}/v1/topics/topic_1`);
      expect((init as RequestInit).method).toBe("PATCH");
      expect(JSON.parse(String((init as RequestInit).body))).toEqual({
        name: "News",
        public: true,
      });
    });

    it("refuses an update with no fields before any request", async () => {
      await topicsUpdate({ id: "topic_1", token: TOKEN, json: true });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("MISSING_REQUIRED_FLAG");
      expect(env.error?.message).toBe("Nothing to update");
      expect(env.error?.suggestion).toContain("--name");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("maps a 404 on another org's topic to NOT_FOUND", async () => {
      fetchMock.mockResolvedValueOnce(res(404, { error: "Topic not found" }));

      await topicsUpdate({
        id: "topic_1",
        name: "News",
        token: TOKEN,
        json: true,
      });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("NOT_FOUND");
      expect(process.exitCode).toBe(1);
    });

    it("keeps a hostile id as one encoded path segment", async () => {
      fetchMock.mockResolvedValueOnce(res(404, { error: "Topic not found" }));

      await topicsUpdate({
        id: HOSTILE,
        name: "News",
        token: TOKEN,
        json: true,
      });

      const url = new URL(String(fetchMock.mock.calls[0][0]));
      expect(url.pathname).toBe(`/v1/topics/${encodeURIComponent(HOSTILE)}`);
      expect(url.search).toBe("");
    });
  });

  describe("delete", () => {
    it("refuses without --yes, names the re-run command, and makes no request", async () => {
      await topicsDelete({ id: "topic_1", token: TOKEN, json: true });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("CONFIRMATION_REQUIRED");
      expect(env.error?.suggestion).toBe(
        "Re-run with --yes to confirm: wraps topics delete topic_1 --yes"
      );
      expect(fetchMock).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });

    it("--dry-run previews with no request, even without --yes", async () => {
      await topicsDelete({
        id: "topic_1",
        dryRun: true,
        json: true,
      });

      const env = envelope(consoleLogSpy);
      expect(env.command).toBe("topics.delete");
      expect(env.data).toEqual({ id: "topic_1", deleted: false, dryRun: true });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("with --yes sends DELETE with confirm=true in the query", async () => {
      fetchMock.mockResolvedValueOnce(res(200, { success: true }));

      await topicsDelete({
        id: "topic_1",
        yes: true,
        token: TOKEN,
        json: true,
      });

      const env = envelope(consoleLogSpy);
      expect(env.data).toEqual({ id: "topic_1", deleted: true, dryRun: false });
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(`${API_BASE}/v1/topics/topic_1?confirm=true`);
      expect((init as RequestInit).method).toBe("DELETE");
    });

    it("maps a plan 403 to PLAN_REQUIRED", async () => {
      fetchMock.mockResolvedValueOnce(
        res(403, {
          error:
            "Feature 'topics' requires pro plan or higher. Current plan: free. Upgrade at https://wraps.dev/upgrade",
        })
      );

      await topicsDelete({
        id: "topic_1",
        yes: true,
        token: TOKEN,
        json: true,
      });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("PLAN_REQUIRED");
    });

    it("keeps a hostile id as one encoded path segment", async () => {
      fetchMock.mockResolvedValueOnce(res(404, { error: "Topic not found" }));

      await topicsDelete({
        id: HOSTILE,
        yes: true,
        token: TOKEN,
        json: true,
      });

      const url = new URL(String(fetchMock.mock.calls[0][0]));
      expect(url.pathname).toBe(`/v1/topics/${encodeURIComponent(HOSTILE)}`);
      expect(url.searchParams.get("confirm")).toBe("true");
      expect(url.searchParams.has("z")).toBe(false);
    });
  });

  describe("subscribers", () => {
    it("maps --cursor to page and --limit to pageSize and pins nextCursor", async () => {
      fetchMock.mockResolvedValueOnce(
        res(200, {
          subscribers: [SUBSCRIBER],
          total: 5,
          page: 2,
          pageSize: 2,
        })
      );

      await topicsSubscribers({
        id: "topic_1",
        cursor: "2",
        limit: "2",
        token: TOKEN,
        json: true,
      });

      const env = envelope(consoleLogSpy);
      expect(env.command).toBe("topics.subscribers");
      expect(Object.keys(env.data ?? {}).sort()).toEqual([
        "nextCursor",
        "page",
        "pageSize",
        "subscribers",
        "topicId",
        "total",
      ]);
      expect(env.data?.page).toBe(2);
      expect(env.data?.pageSize).toBe(2);
      expect(env.data?.total).toBe(5);
      expect(env.data?.nextCursor).toBe("3");
      const [url] = fetchMock.mock.calls[0];
      expect(url).toBe(
        `${API_BASE}/v1/topics/topic_1/subscribers?page=2&pageSize=2`
      );
    });

    it("returns nextCursor null on the last page", async () => {
      fetchMock.mockResolvedValueOnce(
        res(200, { subscribers: [SUBSCRIBER], total: 5, page: 3, pageSize: 2 })
      );

      await topicsSubscribers({
        id: "topic_1",
        cursor: "3",
        limit: "2",
        token: TOKEN,
        json: true,
      });

      const env = envelope(consoleLogSpy);
      expect(env.data?.nextCursor).toBeNull();
    });

    it("sends the status filter in the query and defaults to page 1, pageSize 50", async () => {
      fetchMock.mockResolvedValueOnce(
        res(200, { subscribers: [], total: 0, page: 1, pageSize: 50 })
      );

      await topicsSubscribers({
        id: "topic_1",
        status: "pending",
        token: TOKEN,
        json: true,
      });

      const env = envelope(consoleLogSpy);
      expect(env.data?.page).toBe(1);
      expect(env.data?.pageSize).toBe(50);
      expect(env.data?.nextCursor).toBeNull();
      const [url] = fetchMock.mock.calls[0];
      expect(url).toBe(
        `${API_BASE}/v1/topics/topic_1/subscribers?page=1&pageSize=50&status=pending`
      );
    });

    it("rejects an unknown --status before any request", async () => {
      await topicsSubscribers({
        id: "topic_1",
        status: "bounced",
        token: TOKEN,
        json: true,
      });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("INVALID_FLAG_VALUE");
      expect(env.error?.message).toBe(
        '--status must be one of subscribed, pending, unsubscribed, got "bounced"'
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects --cursor 0, since pages start at 1", async () => {
      await topicsSubscribers({
        id: "topic_1",
        cursor: "0",
        token: TOKEN,
        json: true,
      });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("INVALID_FLAG_VALUE");
      expect(env.error?.message).toBe('--cursor "0" is not a valid cursor');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("prints the exact next command in human mode", async () => {
      setJsonMode(false);
      fetchMock.mockResolvedValueOnce(
        res(200, { subscribers: [SUBSCRIBER], total: 5, page: 1, pageSize: 2 })
      );

      await topicsSubscribers({
        id: "topic_1",
        limit: "2",
        token: TOKEN,
      });

      expect(log.info).toHaveBeenCalledWith(
        expect.stringContaining(
          "wraps topics subscribers topic_1 --limit 2 --cursor 2"
        )
      );
    });

    it("maps a 401 to NOT_AUTHENTICATED with a login suggestion", async () => {
      fetchMock.mockResolvedValueOnce(res(401, { error: "Unauthorized" }));

      await topicsSubscribers({ id: "topic_1", token: TOKEN, json: true });

      const env = envelope(consoleLogSpy);
      expect(env.error?.code).toBe("NOT_AUTHENTICATED");
      expect(env.error?.suggestion).toContain("wraps auth login");
    });

    it("keeps a hostile id as one encoded path segment", async () => {
      fetchMock.mockResolvedValueOnce(res(404, { error: "Topic not found" }));

      await topicsSubscribers({ id: HOSTILE, token: TOKEN, json: true });

      const url = new URL(String(fetchMock.mock.calls[0][0]));
      expect(url.pathname).toBe(
        `/v1/topics/${encodeURIComponent(HOSTILE)}/subscribers`
      );
      expect(url.searchParams.get("page")).toBe("1");
      expect(url.searchParams.has("z")).toBe(false);
    });
  });
});
