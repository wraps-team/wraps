import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import {
  CI_BRANCH_PATTERN,
  ciBranchName,
  deleteCiBranch,
  ensure,
  expiresAtFrom,
  pushSchema,
} from "../ci-branch.mjs";

const SHA = "0123456789abcdef0123456789abcdef01234567";
const BRANCH = "ci-0123456-41767588020-2";
const BASE_URL =
  "postgresql://testrole:parentpw@ep-parent-pooler.us-east-2.aws.neon.tech/testdb?sslmode=require";
const POOLED_URI =
  "postgresql://testrole:br%2Fpw@ep-child-pooler.us-east-2.aws.neon.tech/testdb?sslmode=require";
const DIRECT_URI =
  "postgresql://testrole:br%2Fpw@ep-child.us-east-2.aws.neon.tech/testdb?sslmode=require";
const NOW = new Date("2026-11-03T12:34:56.789Z");

/**
 * The env a DB job's ensure step sees. Built per test: these tests run on a
 * GitHub runner too (test-scripts), so nothing may come from process.env.
 */
function ciEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    NEON_API_KEY: "test-key",
    NEON_PROJECT_ID: "proj-1",
    TEST_DATABASE_URL: BASE_URL,
    GITHUB_SHA: SHA,
    GITHUB_RUN_ID: "41767588020",
    GITHUB_RUN_ATTEMPT: "2",
    GITHUB_ENV: "/fake/github_env",
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

type Call = {
  method: string;
  path: string;
  search: URLSearchParams;
  body?: any;
};

/** Stateful fake of the Neon API slice ci-branch.mjs touches. */
function neonMock(
  options: {
    branches?: Array<{ id: string; name: string; current_state: string }>;
    createStatus?: number[];
    fail?: { method: string; pathEnds: string; status: number };
  } = {}
) {
  let branches = [...(options.branches ?? [])];
  const createStatus = [...(options.createStatus ?? [])];
  const calls: Call[] = [];

  const fetchImpl = vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const parsed = new URL(url);
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({
      method,
      path: parsed.pathname,
      search: parsed.searchParams,
      body,
    });

    const { fail } = options;
    if (
      fail &&
      fail.method === method &&
      parsed.pathname.endsWith(fail.pathEnds)
    ) {
      return jsonResponse({ message: "nope" }, fail.status);
    }
    if (parsed.pathname.endsWith("/endpoints")) {
      return jsonResponse({
        endpoints: [
          { host: "ep-parent.us-east-2.aws.neon.tech", branch_id: "parent-1" },
        ],
      });
    }
    if (parsed.pathname.endsWith("/connection_uri")) {
      const pooled = parsed.searchParams.get("pooled") === "true";
      return jsonResponse({ uri: pooled ? POOLED_URI : DIRECT_URI });
    }
    if (method === "POST" && parsed.pathname.endsWith("/branches")) {
      const status = createStatus.shift();
      if (status === 409) {
        // A sibling job created it a moment earlier.
        branches.push({
          id: "br-sibling",
          name: body.branch.name,
          current_state: "ready",
        });
        return jsonResponse({ message: "branch already exists" }, 409);
      }
      if (status && status !== 201) {
        return jsonResponse({ message: "nope" }, status);
      }
      const branch = {
        id: `br-${branches.length + 1}`,
        name: body.branch.name,
        current_state: "ready",
        expires_at: body.branch.expires_at,
      };
      branches.push(branch);
      return jsonResponse({ branch }, 201);
    }
    if (method === "DELETE") {
      const id = parsed.pathname.split("/").pop();
      branches = branches.filter((b) => b.id !== id);
      return jsonResponse({});
    }
    if (method === "GET" && parsed.pathname.endsWith("/branches")) {
      return jsonResponse({ branches });
    }
    throw new Error(`unhandled fetch: ${method} ${url}`);
  });

  return { fetchImpl, calls, branches: () => branches };
}

function harness(mock = neonMock()) {
  const lines: string[] = [];
  const written: Array<{ file: string; text: string }> = [];
  const io = {
    fetchImpl: mock.fetchImpl as unknown as typeof fetch,
    sleepImpl: vi.fn(async () => {}),
    log: (line: string) => lines.push(line),
    appendFile: (file: string, text: string) => written.push({ file, text }),
    now: () => NOW,
  };
  return { io, lines, written, mock };
}

describe("ciBranchName", () => {
  it("is ci-<sha7>-<run_id>-<run_attempt>", () => {
    expect(ciBranchName(ciEnv())).toBe(BRANCH);
    expect(CI_BRANCH_PATTERN.test(BRANCH)).toBe(true);
  });

  it("throws when the GitHub run context is missing", () => {
    expect(() =>
      ciBranchName(ciEnv({ GITHUB_RUN_ATTEMPT: undefined }))
    ).toThrow(/GITHUB_RUN_ATTEMPT/);
    expect(() => ciBranchName(ciEnv({ GITHUB_SHA: "" }))).toThrow();
  });
});

describe("expiresAtFrom", () => {
  it("is RFC 3339 UTC with whole seconds", () => {
    expect(expiresAtFrom(NOW, 3)).toBe("2026-11-03T15:34:56Z");
  });
});

describe("ensure", () => {
  it("creates the branch from the parent with a 3h expires_at", async () => {
    const { io, mock } = harness();
    const result = await ensure(ciEnv(), io);

    expect(result).toEqual({ status: "ready", branchName: BRANCH });
    const post = mock.calls.find((c) => c.method === "POST");
    expect(post?.body).toEqual({
      branch: {
        parent_id: "parent-1",
        name: BRANCH,
        expires_at: "2026-11-03T15:34:56Z",
      },
      endpoints: [{ type: "read_write" }],
    });
  });

  it("writes the pooled URL, the direct URL and the branch name to $GITHUB_ENV", async () => {
    const { io, written, mock } = harness();
    await ensure(ciEnv(), io);

    expect(written).toEqual([
      {
        file: "/fake/github_env",
        text: `CI_DATABASE_URL=${POOLED_URI}\nCI_DATABASE_DIRECT_URL=${DIRECT_URI}\nCI_DB_BRANCH=${BRANCH}\n`,
      },
    ]);
    const conn = mock.calls.filter((c) => c.path.endsWith("/connection_uri"));
    expect(conn.map((c) => c.search.get("role_name"))).toEqual([
      "testrole",
      "testrole",
    ]);
    expect(conn.map((c) => c.search.get("database_name"))).toEqual([
      "testdb",
      "testdb",
    ]);
  });

  it("hands over the direct URL as CI_DATABASE_URL when TEST_DATABASE_URL is direct", async () => {
    const { io, written } = harness();
    await ensure(
      ciEnv({ TEST_DATABASE_URL: BASE_URL.replace("-pooler.", ".") }),
      io
    );
    expect(written[0].text).toContain(`CI_DATABASE_URL=${DIRECT_URI}\n`);
  });

  it("masks both URIs and the password, encoded and decoded, before writing them", async () => {
    const { io, lines } = harness();
    await ensure(ciEnv(), io);

    const masks = lines.filter((l) => l.startsWith("::add-mask::"));
    expect(masks).toEqual(
      expect.arrayContaining([
        `::add-mask::${POOLED_URI}`,
        `::add-mask::${DIRECT_URI}`,
        "::add-mask::br%2Fpw",
        "::add-mask::br/pw",
      ])
    );
    // No other line carries a secret.
    for (const line of lines.filter((l) => !l.startsWith("::add-mask::"))) {
      expect(line).not.toContain("br%2Fpw");
      expect(line).not.toContain("br/pw");
      expect(line).not.toContain("parentpw");
      expect(line).not.toContain("test-key");
    }
  });

  it("reuses the branch a sibling job created, without a second POST", async () => {
    const { io, written, mock } = harness(
      neonMock({
        branches: [{ id: "br-existing", name: BRANCH, current_state: "ready" }],
      })
    );
    const result = await ensure(ciEnv(), io);

    expect(result.status).toBe("ready");
    expect(mock.calls.some((c) => c.method === "POST")).toBe(false);
    expect(
      mock.calls
        .find((c) => c.path.endsWith("/connection_uri"))
        ?.search.get("branch_id")
    ).toBe("br-existing");
    expect(written).toHaveLength(1);
  });

  it("reuses the branch when its own create loses the race (409)", async () => {
    const { io, written, mock } = harness(neonMock({ createStatus: [409] }));
    const result = await ensure(ciEnv(), io);

    expect(result.status).toBe("ready");
    expect(mock.branches().map((b) => b.id)).toEqual(["br-sibling"]);
    expect(written).toHaveLength(1);
  });

  it("waits out a 423 project lock and retries the create", async () => {
    const { io, written, mock } = harness(
      neonMock({ createStatus: [423, 423] })
    );
    const result = await ensure(ciEnv(), io);

    expect(result.status).toBe("ready");
    expect(mock.calls.filter((c) => c.method === "POST")).toHaveLength(3);
    expect(io.sleepImpl).toHaveBeenCalledTimes(2);
    expect(written).toHaveLength(1);
  });

  it("with no Neon keys, makes no call, writes nothing and resolves", async () => {
    const { io, lines, written, mock } = harness();
    const result = await ensure(
      ciEnv({ NEON_API_KEY: "", NEON_PROJECT_ID: undefined }),
      io
    );

    expect(result).toEqual({ status: "skipped" });
    expect(mock.fetchImpl).not.toHaveBeenCalled();
    expect(written).toEqual([]);
    expect(lines.join("\n")).toContain("TEST_DATABASE_URL");
  });

  it.each([
    [401, "API key"],
    [403, "API key"],
    [404, "NEON_PROJECT_ID"],
    [422, "expires_at"],
    [500, "(500)"],
  ])(
    "falls back with a warning on a %i from Neon, never retrying without expires_at",
    async (status, phrase) => {
      const { io, lines, written, mock } = harness(
        neonMock({ createStatus: [status] })
      );
      const result = await ensure(ciEnv(), io);

      expect(result).toEqual({ status: "fallback" });
      expect(written).toEqual([]);
      const warning = lines.find((l) => l.startsWith("::warning::"));
      expect(warning).toContain(phrase);
      expect(warning).toContain("TEST_DATABASE_URL");
      const posts = mock.calls.filter((c) => c.method === "POST");
      expect(posts).toHaveLength(1);
      expect(posts[0].body.branch.expires_at).toBe("2026-11-03T15:34:56Z");
    }
  );

  it("falls back on a network error", async () => {
    const { io, lines, written } = harness();
    io.fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));
    const result = await ensure(ciEnv(), io);

    expect(result).toEqual({ status: "fallback" });
    expect(written).toEqual([]);
    expect(lines.some((l) => l.startsWith("::warning::"))).toBe(true);
  });

  it("falls back without naming the host when TEST_DATABASE_URL matches no endpoint", async () => {
    const { io, lines, written } = harness();
    const result = await ensure(
      ciEnv({
        TEST_DATABASE_URL: BASE_URL.replace("ep-parent", "ep-elsewhere"),
      }),
      io
    );

    expect(result).toEqual({ status: "fallback" });
    expect(written).toEqual([]);
    const warning = lines.find((l) => l.startsWith("::warning::")) ?? "";
    expect(warning).toContain("different projects");
    expect(warning).not.toContain("ep-elsewhere");
  });

  it("falls back when the run context is missing", async () => {
    const { io, written, mock } = harness();
    const result = await ensure(ciEnv({ GITHUB_RUN_ID: undefined }), io);

    expect(result).toEqual({ status: "fallback" });
    expect(mock.fetchImpl).not.toHaveBeenCalled();
    expect(written).toEqual([]);
  });
});

describe("deleteCiBranch", () => {
  it("deletes this run's branch by exact name", async () => {
    const mock = neonMock({
      branches: [
        { id: "br-prod", name: "production", current_state: "ready" },
        { id: "br-run", name: BRANCH, current_state: "ready" },
      ],
    });
    const { io } = harness(mock);
    const result = await deleteCiBranch(ciEnv(), io);

    expect(result).toEqual({ exitCode: 0, status: "deleted" });
    expect(
      mock.calls.filter((c) => c.method === "DELETE").map((c) => c.path)
    ).toEqual(["/api/v2/projects/proj-1/branches/br-run"]);
    expect(mock.branches().map((b) => b.name)).toEqual(["production"]);
  });

  it.each([
    "production",
    "wt-wraps",
    "ci-0123456-1",
    "ci-XYZ1234-1-1",
    `${BRANCH}-x`,
  ])("refuses %s without calling Neon", async (name) => {
    const { io, lines, mock } = harness();
    const result = await deleteCiBranch(ciEnv(), { ...io, branchName: name });

    expect(result).toEqual({ exitCode: 1, status: "refused" });
    expect(mock.fetchImpl).not.toHaveBeenCalled();
    expect(lines.join("\n")).toContain("refusing");
  });

  it("treats an absent branch as success", async () => {
    const { io } = harness();
    expect(await deleteCiBranch(ciEnv(), io)).toEqual({
      exitCode: 0,
      status: "absent",
    });
  });

  it("succeeds without keys, since ensure made no branch", async () => {
    const { io, mock } = harness();
    const result = await deleteCiBranch(ciEnv({ NEON_API_KEY: undefined }), io);
    expect(result).toEqual({ exitCode: 0, status: "skipped" });
    expect(mock.fetchImpl).not.toHaveBeenCalled();
  });

  it("warns and exits 1 when Neon refuses the delete", async () => {
    const mock = neonMock({
      branches: [{ id: "br-run", name: BRANCH, current_state: "ready" }],
      fail: { method: "DELETE", pathEnds: "/br-run", status: 403 },
    });
    const { io, lines } = harness(mock);
    const result = await deleteCiBranch(ciEnv(), io);

    expect(result).toEqual({ exitCode: 1, status: "failed" });
    const warning = lines.find((l) => l.startsWith("::warning::"));
    expect(warning).toContain("API key");
    expect(warning).toContain("expires_at");
  });
});

describe("pushSchema", () => {
  function fakeChild(exitCode: number) {
    const child = new EventEmitter() as EventEmitter & { kill: () => void };
    child.kill = vi.fn();
    setTimeout(() => child.emit("exit", exitCode), 0);
    return child;
  }

  function pushHarness(exitCode = 0) {
    const order: string[] = [];
    const client = {
      query: vi.fn(async (sql: string) => {
        order.push(sql.includes("unlock") ? "unlock" : "lock");
      }),
      end: vi.fn(async () => {
        order.push("end");
      }),
    };
    const connectPg = vi.fn(async () => client);
    const spawnImpl = vi.fn((..._args: unknown[]) => {
      order.push("push");
      return fakeChild(exitCode);
    });
    const lines: string[] = [];
    return {
      io: { connectPg, spawnImpl, log: (l: string) => lines.push(l) } as any,
      order,
      connectPg,
      spawnImpl,
      lines,
    };
  }

  const pushEnv = {
    CI_DATABASE_DIRECT_URL: DIRECT_URI,
    CI_DB_BRANCH: BRANCH,
  };

  it("pushes under an advisory lock on the direct URL, with DATABASE_URL set to it", async () => {
    const h = pushHarness();
    const result = await pushSchema(pushEnv, h.io);

    expect(result).toEqual({ exitCode: 0, status: "pushed" });
    expect(h.connectPg).toHaveBeenCalledWith(DIRECT_URI);
    expect(h.order).toEqual(["lock", "push", "unlock", "end"]);
    const [cmd, args, options] = h.spawnImpl.mock.calls[0] as [
      string,
      string[],
      any,
    ];
    expect(cmd).toBe("pnpm");
    expect(args).toEqual([
      "--filter",
      "@wraps/db",
      "exec",
      "drizzle-kit",
      "push",
      "--force",
    ]);
    expect(options.env.DATABASE_URL).toBe(DIRECT_URI);
    expect(options.stdio[0]).toBe("ignore");
  });

  it("skips, touching nothing, when ensure fell back", async () => {
    const h = pushHarness();
    const result = await pushSchema({}, h.io);

    expect(result).toEqual({ exitCode: 0, status: "skipped" });
    expect(h.connectPg).not.toHaveBeenCalled();
    expect(h.spawnImpl).not.toHaveBeenCalled();
  });

  it.each(["production", "wt-wraps", ""])(
    "refuses a branch named %j",
    async (name) => {
      const h = pushHarness();
      const result = await pushSchema({ ...pushEnv, CI_DB_BRANCH: name }, h.io);

      expect(result).toEqual({ exitCode: 1, status: "refused" });
      expect(h.connectPg).not.toHaveBeenCalled();
      expect(h.spawnImpl).not.toHaveBeenCalled();
    }
  );

  it("fails the step, and still unlocks, when drizzle-kit push fails", async () => {
    const h = pushHarness(1);
    const result = await pushSchema(pushEnv, h.io);

    expect(result).toEqual({ exitCode: 1, status: "failed" });
    expect(h.order).toEqual(["lock", "push", "unlock", "end"]);
    expect(h.lines.some((l) => l.startsWith("::error::"))).toBe(true);
  });
});
