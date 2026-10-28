/**
 * Tests for `wraps email templates list|get|pull|publish|duplicate`
 * (commands/email/templates/remote.ts).
 *
 * The API target and clack are mocked; `fetch` is stubbed, so no test reaches
 * the network. `pull` writes files, so it runs against a mkdtemp directory
 * under os.tmpdir(), never the repo.
 */

import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { log } from "@clack/prompts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkApiTarget,
  resolveApiTarget,
} from "../../../utils/shared/api-target.js";
import { setJsonMode } from "../../../utils/shared/json-output.js";
import {
  templatesDuplicate,
  templatesGet,
  templatesList,
  templatesPublish,
  templatesPull,
} from "../templates/remote.js";

vi.mock("@clack/prompts");
vi.mock("../../../utils/shared/api-target.js", () => ({
  resolveApiTarget: vi.fn(),
  checkApiTarget: vi.fn(),
}));

const API = "https://api.test";
const TOKEN = "wraps_test";

type Envelope = {
  success: boolean;
  command: string;
  data?: Record<string, unknown>;
  error?: { code: string; message: string; suggestion?: string };
};

const DETAIL_KEYS = [
  "channel",
  "compiledHtml",
  "compiledText",
  "createdAt",
  "description",
  "emailType",
  "id",
  "lastEditedFrom",
  "name",
  "previewText",
  "publishedAt",
  "slug",
  "source",
  "sourceHash",
  "status",
  "subject",
  "updatedAt",
  "variables",
];

const fetchMock = vi.fn();
let logSpy: ReturnType<typeof vi.spyOn>;

function res(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function template(overrides: Record<string, unknown> = {}) {
  return {
    id: "tpl_1",
    name: "Welcome",
    description: null,
    subject: "Welcome aboard",
    previewText: null,
    emailType: "marketing",
    channel: "email",
    status: "PUBLISHED",
    slug: "welcome",
    publishedAt: "2026-10-01T00:00:00.000Z",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-10-02T00:00:00.000Z",
    sourceHash: "abc123",
    variables: [],
    lastEditedFrom: "api",
    source: "export default function Welcome() {}",
    compiledHtml: "<p>hi</p>",
    compiledText: "hi",
    ...overrides,
  };
}

/** The single JSON envelope a command printed. Fails if it printed anything else. */
function envelope(): Envelope {
  const lines = logSpy.mock.calls.map((c) => String(c[0]));
  expect(lines).toHaveLength(1);
  return JSON.parse(lines[0]) as Envelope;
}

function expectSuccess(command: string): Envelope {
  const env = envelope();
  expect(env.success).toBe(true);
  expect(env.command).toBe(command);
  expect(process.exitCode).toBeUndefined();
  return env;
}

function expectFailure(command: string, code: string): Envelope {
  const env = envelope();
  expect(env.success).toBe(false);
  expect(env.command).toBe(command);
  expect(env.error?.code).toBe(code);
  expect(env.error?.message).toBeTruthy();
  expect(env.error?.suggestion).toBeTruthy();
  expect(process.exitCode).toBe(1);
  return env;
}

/** [url, init] of the Nth fetch call. */
function requestAt(n: number): [string, { method?: string; body?: string }] {
  return fetchMock.mock.calls[n] as [
    string,
    { method?: string; body?: string },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  process.exitCode = undefined;
  setJsonMode(true);
  logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.stubGlobal("fetch", fetchMock);
  vi.mocked(resolveApiTarget).mockResolvedValue({
    apiBase: API,
    appUrl: "https://app.test",
    token: TOKEN,
    selfhosted: false,
    loginCommand: "wraps auth login",
  });
  vi.mocked(checkApiTarget).mockReturnValue({
    ok: true,
    target: {
      apiBase: API,
      appUrl: "https://app.test",
      token: TOKEN,
      selfhosted: false,
      loginCommand: "wraps auth login",
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  logSpy.mockRestore();
  process.exitCode = undefined;
});

describe("templatesList", () => {
  it("returns templates and nextCursor, with fixed keys", async () => {
    fetchMock.mockResolvedValueOnce(
      res(200, {
        data: [template(), template({ id: "tpl_2", slug: "receipt" })],
        nextCursor: "cur_2",
      })
    );

    await templatesList({ limit: "2", json: true, token: TOKEN });

    const env = expectSuccess("email.templates.list");
    expect(Object.keys(env.data ?? {}).sort()).toEqual([
      "nextCursor",
      "templates",
    ]);
    expect(env.data?.nextCursor).toBe("cur_2");
    const items = env.data?.templates as Array<Record<string, unknown>>;
    expect(items[0]).toMatchObject({ id: "tpl_1", slug: "welcome" });
    expect(Object.keys(items[0]).sort()).toEqual([
      "channel",
      "createdAt",
      "description",
      "emailType",
      "id",
      "name",
      "previewText",
      "publishedAt",
      "slug",
      "status",
      "subject",
      "updatedAt",
    ]);
    expect(requestAt(0)[0]).toBe(`${API}/v1/templates?limit=2`);
    expect(requestAt(0)[1]).toMatchObject({ method: "GET" });
  });

  it("passes cursor, status, channel and search through to the API", async () => {
    fetchMock.mockResolvedValueOnce(res(200, { data: [], nextCursor: null }));

    await templatesList({
      cursor: "cur_2",
      status: "published",
      channel: "email",
      search: "welcome",
      json: true,
    });

    const url = new URL(requestAt(0)[0]);
    expect(url.pathname).toBe("/v1/templates");
    expect(url.searchParams.get("cursor")).toBe("cur_2");
    expect(url.searchParams.get("status")).toBe("PUBLISHED");
    expect(url.searchParams.get("channel")).toBe("email");
    expect(url.searchParams.get("search")).toBe("welcome");
    expect(process.exitCode).toBeUndefined();
  });

  it("rejects an out-of-range limit before any request", async () => {
    await templatesList({ limit: "500", json: true });

    expectFailure("email.templates.list", "VALIDATION_FAILED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an unknown status before any request", async () => {
    await templatesList({ status: "NOPE", json: true });

    expectFailure("email.templates.list", "VALIDATION_FAILED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps 403 to FORBIDDEN", async () => {
    fetchMock.mockResolvedValueOnce(
      res(403, { error: "Forbidden", code: "FORBIDDEN" })
    );

    await templatesList({ json: true });

    expectFailure("email.templates.list", "FORBIDDEN");
  });

  it("maps 429 to RATE_LIMITED", async () => {
    fetchMock.mockResolvedValueOnce(
      res(429, { error: "Rate limit exceeded: 60 requests per minute" })
    );

    await templatesList({ json: true });

    const env = expectFailure("email.templates.list", "RATE_LIMITED");
    expect(env.error?.message).toContain("Rate limit exceeded");
  });

  it("maps 5xx to SERVER_ERROR", async () => {
    fetchMock.mockResolvedValueOnce(
      res(500, {
        error: "Internal server error",
        code: "INTERNAL_ERROR",
        requestId: "req_9",
      })
    );

    await templatesList({ json: true });

    const env = expectFailure("email.templates.list", "SERVER_ERROR");
    expect(env.error?.suggestion).toContain("req_9");
  });

  it("maps other 4xx to API_ERROR", async () => {
    fetchMock.mockResolvedValueOnce(res(418, { error: "teapot" }));

    await templatesList({ json: true });

    expectFailure("email.templates.list", "API_ERROR");
  });

  it("maps a network failure to NETWORK_ERROR", async () => {
    fetchMock.mockRejectedValueOnce(
      new Error("getaddrinfo ENOTFOUND api.test")
    );

    await templatesList({ json: true });

    expectFailure("email.templates.list", "NETWORK_ERROR");
  });

  it("reports a missing token as NOT_AUTHENTICATED without a request", async () => {
    vi.mocked(checkApiTarget).mockReturnValueOnce({
      ok: false,
      reason: "No API token",
      suggestion: "Run: wraps auth login",
    });

    await templatesList({ json: true });

    expectFailure("email.templates.list", "NOT_AUTHENTICATED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps 401 to NOT_AUTHENTICATED", async () => {
    fetchMock.mockResolvedValueOnce(
      res(401, { error: "Unauthorized", code: "UNAUTHORIZED" })
    );

    await templatesList({ json: true });

    expectFailure("email.templates.list", "NOT_AUTHENTICATED");
  });

  it("prints human output and an error without JSON when not in JSON mode", async () => {
    setJsonMode(false);
    fetchMock.mockResolvedValueOnce(res(404, { error: "nope" }));

    await templatesList({});

    expect(process.exitCode).toBe(1);
    expect(logSpy).not.toHaveBeenCalled();
    expect(log.error).toHaveBeenCalledWith("nope");
  });
});

describe("templatesGet", () => {
  it("returns the full template with fixed keys", async () => {
    fetchMock.mockResolvedValueOnce(res(200, template()));

    await templatesGet({ id: "tpl_1", json: true });

    const env = expectSuccess("email.templates.get");
    expect(Object.keys(env.data ?? {}).sort()).toEqual(DETAIL_KEYS);
    expect(env.data).toMatchObject({
      id: "tpl_1",
      slug: "welcome",
      source: expect.any(String),
    });
    expect(requestAt(0)[0]).toBe(`${API}/v1/templates/tpl_1?source=true`);
  });

  it("omits source when --without-source is set and keeps the keys", async () => {
    fetchMock.mockResolvedValueOnce(
      res(
        200,
        template({
          source: undefined,
          compiledHtml: undefined,
          compiledText: undefined,
        })
      )
    );

    await templatesGet({ id: "tpl_1", withoutSource: true, json: true });

    const env = expectSuccess("email.templates.get");
    expect(Object.keys(env.data ?? {}).sort()).toEqual(DETAIL_KEYS);
    expect(env.data).toMatchObject({
      source: null,
      compiledHtml: null,
      compiledText: null,
    });
    expect(requestAt(0)[0]).toBe(`${API}/v1/templates/tpl_1?source=false`);
  });

  it("requires an id before any request", async () => {
    await templatesGet({ json: true });

    expectFailure("email.templates.get", "MISSING_REQUIRED_FLAG");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps 404 to NOT_FOUND", async () => {
    fetchMock.mockResolvedValueOnce(
      res(404, { error: "Template not found", code: "NOT_FOUND" })
    );

    await templatesGet({ id: "tpl_missing", json: true });

    const env = expectFailure("email.templates.get", "NOT_FOUND");
    expect(env.error?.message).toBe("Template not found");
  });

  it("reads the message field of a 409 body, not the bare error word", async () => {
    fetchMock.mockResolvedValueOnce(
      res(409, { error: "conflict", message: "slug already exists" })
    );

    await templatesGet({ id: "tpl_1", json: true });

    const env = expectFailure("email.templates.get", "CONFLICT");
    expect(env.error?.message).toBe("slug already exists");
  });

  it("encodes the id in the path", async () => {
    fetchMock.mockResolvedValueOnce(res(404, { error: "Template not found" }));

    await templatesGet({ id: "a/b c", json: true });

    expect(requestAt(0)[0]).toBe(`${API}/v1/templates/a%2Fb%20c?source=true`);
  });
});

describe("templatesPublish", () => {
  it("refuses without --yes and makes zero requests", async () => {
    await templatesPublish({ id: "tpl_1", json: true, awsAccountId: "acct_1" });

    expectFailure("email.templates.publish", "CONFIRMATION_REQUIRED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires an id before any request", async () => {
    await templatesPublish({ yes: true, json: true });

    expectFailure("email.templates.publish", "MISSING_REQUIRED_FLAG");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("publishes through the named AWS account with --yes", async () => {
    fetchMock.mockResolvedValueOnce(
      res(200, {
        success: true,
        sesTemplateName: "welcome",
        publishedAt: "2026-10-27T00:00:00.000Z",
      })
    );

    await templatesPublish({
      id: "tpl_1",
      yes: true,
      awsAccountId: "acct_1",
      json: true,
    });

    const env = expectSuccess("email.templates.publish");
    expect(Object.keys(env.data ?? {}).sort()).toEqual([
      "awsAccountId",
      "id",
      "publishedAt",
      "sesTemplateName",
    ]);
    expect(env.data).toMatchObject({
      id: "tpl_1",
      awsAccountId: "acct_1",
      sesTemplateName: "welcome",
    });
    const [url, init] = requestAt(0);
    expect(url).toBe(`${API}/v1/templates/tpl_1/publish`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ awsAccountId: "acct_1" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("resolves the only connected AWS account from health when no flag is given", async () => {
    fetchMock
      .mockResolvedValueOnce(
        res(200, {
          status: "healthy",
          checkedAt: null,
          accounts: [{ id: "acct_only", region: "us-east-1" }],
        })
      )
      .mockResolvedValueOnce(
        res(200, {
          success: true,
          sesTemplateName: "welcome",
          publishedAt: "2026-10-27T00:00:00.000Z",
        })
      );

    await templatesPublish({ id: "tpl_1", yes: true, json: true });

    const env = expectSuccess("email.templates.publish");
    expect(env.data?.awsAccountId).toBe("acct_only");
    expect(requestAt(0)[0]).toBe(`${API}/v1/account/health`);
    expect(JSON.parse(String(requestAt(1)[1].body))).toEqual({
      awsAccountId: "acct_only",
    });
  });

  it("refuses to guess when several AWS accounts are connected", async () => {
    fetchMock.mockResolvedValueOnce(
      res(200, {
        status: "healthy",
        checkedAt: null,
        accounts: [
          { id: "acct_1", region: "us-east-1" },
          { id: "acct_2", region: "eu-west-1" },
        ],
      })
    );

    await templatesPublish({ id: "tpl_1", yes: true, json: true });

    const env = expectFailure(
      "email.templates.publish",
      "MISSING_REQUIRED_FLAG"
    );
    expect(env.error?.message).toContain("acct_1");
    expect(env.error?.message).toContain("acct_2");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports NO_AWS_ACCOUNT when none is connected", async () => {
    fetchMock.mockResolvedValueOnce(
      res(200, { status: "unknown", checkedAt: null, accounts: [] })
    );

    await templatesPublish({ id: "tpl_1", yes: true, json: true });

    expectFailure("email.templates.publish", "NO_AWS_ACCOUNT");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("maps a missing AWS account (404) to NOT_FOUND", async () => {
    fetchMock.mockResolvedValueOnce(
      res(404, { error: "AWS account not found", code: "NOT_FOUND" })
    );

    await templatesPublish({
      id: "tpl_1",
      yes: true,
      awsAccountId: "acct_x",
      json: true,
    });

    const env = expectFailure("email.templates.publish", "NOT_FOUND");
    expect(env.error?.message).toBe("AWS account not found");
  });

  it("maps a publish validation failure (400) to VALIDATION_FAILED", async () => {
    fetchMock.mockResolvedValueOnce(
      res(400, {
        error:
          "Template must be compiled before publishing. Provide compiledHtml.",
        code: "BAD_REQUEST",
      })
    );

    await templatesPublish({
      id: "tpl_1",
      yes: true,
      awsAccountId: "acct_1",
      json: true,
    });

    expectFailure("email.templates.publish", "VALIDATION_FAILED");
  });

  it("maps 403 to FORBIDDEN", async () => {
    fetchMock.mockResolvedValueOnce(res(403, { error: "Forbidden" }));

    await templatesPublish({
      id: "tpl_1",
      yes: true,
      awsAccountId: "acct_1",
      json: true,
    });

    expectFailure("email.templates.publish", "FORBIDDEN");
  });
});

describe("templatesDuplicate", () => {
  it("creates a draft copy and returns the detail shape", async () => {
    fetchMock.mockResolvedValueOnce(
      res(
        201,
        template({
          id: "tpl_2",
          name: "Welcome (Copy)",
          status: "DRAFT",
          slug: null,
        })
      )
    );

    await templatesDuplicate({ id: "tpl_1", json: true });

    const env = expectSuccess("email.templates.duplicate");
    expect(Object.keys(env.data ?? {}).sort()).toEqual(DETAIL_KEYS);
    expect(env.data).toMatchObject({
      id: "tpl_2",
      status: "DRAFT",
      slug: null,
    });
    const [url, init] = requestAt(0);
    expect(url).toBe(`${API}/v1/templates/tpl_1/duplicate`);
    expect(init.method).toBe("POST");
  });

  it("requires an id before any request", async () => {
    await templatesDuplicate({ json: true });

    expectFailure("email.templates.duplicate", "MISSING_REQUIRED_FLAG");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps 404 to NOT_FOUND", async () => {
    fetchMock.mockResolvedValueOnce(res(404, { error: "Template not found" }));

    await templatesDuplicate({ id: "tpl_missing", json: true });

    expectFailure("email.templates.duplicate", "NOT_FOUND");
  });
});

describe("templatesPull", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "templates-pull-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const pullRow = (overrides: Record<string, unknown> = {}) => ({
    id: "tpl_1",
    slug: "welcome",
    source: "export default function Welcome() {}\n",
    subject: "Welcome",
    emailType: "marketing",
    channel: "email",
    variables: [],
    sourceHash: "hash_1",
    status: "PUBLISHED",
    updatedAt: "2026-10-02T00:00:00.000Z",
    lastEditedFrom: "api",
    ...overrides,
  });

  it("dry run lists what would be written and writes nothing", async () => {
    fetchMock.mockResolvedValueOnce(
      res(200, { templates: [pullRow()], nextCursor: null })
    );

    await templatesPull({ outDir: dir, dryRun: true, json: true });

    const env = expectSuccess("email.templates.pull");
    expect(Object.keys(env.data ?? {}).sort()).toEqual([
      "dryRun",
      "files",
      "outDir",
      "skipped",
    ]);
    expect(env.data?.dryRun).toBe(true);
    const files = env.data?.files as Array<Record<string, unknown>>;
    expect(files).toEqual([
      expect.objectContaining({
        id: "tpl_1",
        slug: "welcome",
        exists: false,
        written: false,
      }),
    ]);
    expect(await readdir(dir)).toEqual([]);
    expect(requestAt(0)[0]).toBe(
      `${API}/v1/templates/pull?limit=200&source=true`
    );
  });

  it("writes the source byte-for-byte as <slug>.tsx", async () => {
    const source = "export default function Welcome() {}\n";
    fetchMock.mockResolvedValueOnce(
      res(200, { templates: [pullRow({ source })], nextCursor: null })
    );

    await templatesPull({ outDir: dir, json: true });

    expectSuccess("email.templates.pull");
    expect(await readFile(join(dir, "welcome.tsx"), "utf8")).toBe(source);
  });

  it("refuses to overwrite an existing file without --yes and writes nothing", async () => {
    await writeFile(join(dir, "welcome.tsx"), "local edit", "utf8");
    fetchMock.mockResolvedValueOnce(
      res(200, {
        templates: [pullRow(), pullRow({ id: "tpl_2", slug: "receipt" })],
        nextCursor: null,
      })
    );

    await templatesPull({ outDir: dir, json: true });

    const env = expectFailure("email.templates.pull", "WOULD_OVERWRITE");
    expect(env.error?.message).toContain("welcome.tsx");
    expect(await readFile(join(dir, "welcome.tsx"), "utf8")).toBe("local edit");
    expect(existsSync(join(dir, "receipt.tsx"))).toBe(false);
  });

  it("overwrites existing files with --yes", async () => {
    await writeFile(join(dir, "welcome.tsx"), "local edit", "utf8");
    fetchMock.mockResolvedValueOnce(
      res(200, { templates: [pullRow()], nextCursor: null })
    );

    await templatesPull({ outDir: dir, yes: true, json: true });

    expectSuccess("email.templates.pull");
    expect(await readFile(join(dir, "welcome.tsx"), "utf8")).toBe(
      "export default function Welcome() {}\n"
    );
  });

  it("dry run with existing files reports them and does not refuse", async () => {
    await writeFile(join(dir, "welcome.tsx"), "local edit", "utf8");
    fetchMock.mockResolvedValueOnce(
      res(200, { templates: [pullRow()], nextCursor: null })
    );

    await templatesPull({ outDir: dir, dryRun: true, json: true });

    const env = expectSuccess("email.templates.pull");
    const files = env.data?.files as Array<Record<string, unknown>>;
    expect(files[0]).toMatchObject({ exists: true, written: false });
    expect(await readFile(join(dir, "welcome.tsx"), "utf8")).toBe("local edit");
  });

  it("follows nextCursor across pages before writing", async () => {
    fetchMock
      .mockResolvedValueOnce(
        res(200, { templates: [pullRow()], nextCursor: "page_2" })
      )
      .mockResolvedValueOnce(
        res(200, {
          templates: [pullRow({ id: "tpl_2", slug: "receipt" })],
          nextCursor: null,
        })
      );

    await templatesPull({ outDir: dir, json: true });

    expectSuccess("email.templates.pull");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(requestAt(1)[0]).toBe(
      `${API}/v1/templates/pull?limit=200&source=true&cursor=page_2`
    );
    expect((await readdir(dir)).sort()).toEqual(["receipt.tsx", "welcome.tsx"]);
  });

  it("skips rows that cannot become a file and reports them", async () => {
    fetchMock.mockResolvedValueOnce(
      res(200, {
        templates: [
          pullRow(),
          pullRow({ id: "tpl_nullslug", slug: null }),
          pullRow({ id: "tpl_evil", slug: "../escape" }),
          pullRow({ id: "tpl_dupe", slug: "welcome" }),
        ],
        nextCursor: null,
      })
    );

    await templatesPull({ outDir: dir, json: true });

    const env = expectSuccess("email.templates.pull");
    const skipped = env.data?.skipped as Array<Record<string, unknown>>;
    expect(skipped.map((s) => s.id).sort()).toEqual([
      "tpl_dupe",
      "tpl_evil",
      "tpl_nullslug",
    ]);
    expect(await readdir(dir)).toEqual(["welcome.tsx"]);
  });

  it("reports WRITE_FAILED when the output path is a file", async () => {
    const blocker = join(dir, "blocker");
    await writeFile(blocker, "not a folder", "utf8");
    fetchMock.mockResolvedValueOnce(
      res(200, { templates: [pullRow()], nextCursor: null })
    );

    await templatesPull({ outDir: blocker, json: true });

    expectFailure("email.templates.pull", "WRITE_FAILED");
  });

  it("maps a server error to SERVER_ERROR and writes nothing", async () => {
    fetchMock.mockResolvedValueOnce(res(503, { error: "Unavailable" }));

    await templatesPull({ outDir: dir, json: true });

    expectFailure("email.templates.pull", "SERVER_ERROR");
    expect(await readdir(dir)).toEqual([]);
  });

  it("reports NOT_AUTHENTICATED when no token is configured", async () => {
    vi.mocked(checkApiTarget).mockReturnValueOnce({
      ok: false,
      reason: "No API token",
      suggestion: "Run: wraps auth login",
    });

    await templatesPull({ outDir: dir, json: true });

    expectFailure("email.templates.pull", "NOT_AUTHENTICATED");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
