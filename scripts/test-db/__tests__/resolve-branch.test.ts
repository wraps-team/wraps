import { describe, expect, it, vi } from "vitest";
import {
  branchNameForWorktree,
  detectWorktree,
  reapOrphanBranches,
  resolveTestDatabaseUrl,
} from "../resolve-branch.mjs";

const BASE_URL =
  "postgres://testrole:secret@ep-foo-pooler.us-east-2.aws.neon.tech/testdb";
const NEON_ENV = { NEON_API_KEY: "test-key", NEON_PROJECT_ID: "proj-1" };
const BRANCH_NAME = "wt-agent-test123";

/** Minimal fetch Response fake — only the members the resolver reads. */
function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

type RecordedCall = { url: string; method: string; body?: any };

/**
 * Stateful fake of the slice of the Neon API the resolver touches. Tracks a
 * mutable branch list so create/list/delete calls stay consistent across a
 * single resolve, without needing call-count bookkeeping in most tests.
 */
function createNeonMock(
  initialBranches: Array<{
    id: string;
    name: string;
    current_state: string;
  }> = []
) {
  let branches = [...initialBranches];
  const calls: RecordedCall[] = [];

  const fetchImpl = vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const parsed = new URL(url);
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, method, body });

    if (parsed.pathname.endsWith("/endpoints")) {
      return jsonResponse({
        endpoints: [
          { host: "ep-foo.us-east-2.aws.neon.tech", branch_id: "parent-123" },
        ],
      });
    }

    if (parsed.pathname.endsWith("/connection_uri")) {
      return jsonResponse({
        uri: "postgres://role:pw@ep-branch.us-east-2.aws.neon.tech/testdb",
      });
    }

    if (method === "POST" && parsed.pathname.endsWith("/branches")) {
      const name = body.branch.name;
      if (branches.some((b) => b.name === name)) {
        return jsonResponse({ message: `Branch ${name} already exists` }, 409);
      }
      const newBranch = {
        id: `branch-${branches.length + 1}`,
        name,
        parent_id: body.branch.parent_id,
        current_state: "ready",
      };
      branches.push(newBranch);
      return jsonResponse({ branch: newBranch });
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

  return { fetchImpl, calls, getBranches: () => branches };
}

/**
 * Fake execImpl: reports the main checkout (git-dir === git-common-dir), and
 * answers `--show-toplevel` with `toplevel` (as `checkoutRootName` now uses).
 */
function execNotWorktree(toplevel = "/repo") {
  return vi.fn((_cmd: string, args: readonly string[]) => {
    if (args.includes("--git-dir")) {
      return "/repo/.git\n/repo/.git";
    }
    if (args.includes("--show-toplevel")) {
      return toplevel;
    }
    throw new Error(`unexpected exec for not-worktree: ${args.join(" ")}`);
  });
}

/** Fake execImpl: reports a linked worktree named `name`. */
function execWorktree(name = "agent-test123") {
  return vi.fn((_cmd: string, args: readonly string[]) => {
    if (args.includes("--git-dir")) {
      return `/repo/.git/worktrees/${name}\n/repo/.git`;
    }
    if (args.includes("--show-toplevel")) {
      return `/some/path/${name}`;
    }
    // reapOrphanBranches's background sweep asks `git worktree list`; the
    // resolveTestDatabaseUrl tests don't care about its outcome, only that
    // it doesn't throw unhandled — resolve-branch.mjs itself catches this.
    if (args[0] === "worktree") {
      throw new Error("not configured for this test");
    }
    throw new Error(`unexpected exec for worktree: ${args.join(" ")}`);
  });
}

function execThrows() {
  return vi.fn(() => {
    throw new Error("fatal: not a git repository");
  });
}

/** Fake execImpl for reapOrphanBranches: reports the given live worktree paths. */
function execWorktreeList(paths: string[]) {
  return vi.fn((_cmd: string, args: readonly string[]) => {
    if (args[0] === "worktree") {
      return `${paths.map((p) => `worktree ${p}`).join("\n")}\n`;
    }
    throw new Error(`unexpected exec: ${args.join(" ")}`);
  });
}

describe("branchNameForWorktree", () => {
  it("lowercases and prefixes a simple name", () => {
    expect(branchNameForWorktree("agent-adb32cf776fe4b61e")).toBe(
      "wt-agent-adb32cf776fe4b61e"
    );
  });

  it("replaces mixed case, dots, and slashes with dashes", () => {
    expect(branchNameForWorktree("Agent.Foo/Bar_Baz")).toBe(
      "wt-agent-foo-bar-baz"
    );
  });

  it("trims leading/trailing dashes produced by sanitization", () => {
    expect(branchNameForWorktree(".leading-and-trailing.")).toBe(
      "wt-leading-and-trailing"
    );
  });

  it("truncates the sanitized name to 60 chars before prefixing", () => {
    const long = "a".repeat(100);
    const result = branchNameForWorktree(long);
    expect(result).toBe(`wt-${"a".repeat(60)}`);
    expect(result.length).toBe(63);
  });
});

describe("detectWorktree", () => {
  it("reports not-a-worktree when git-dir equals git-common-dir", () => {
    expect(detectWorktree("/repo", { execImpl: execNotWorktree() })).toEqual({
      isWorktree: false,
      name: null,
    });
  });

  it("reports a worktree with the correct basename when the dirs differ", () => {
    expect(
      detectWorktree("/repo", { execImpl: execWorktree("agent-abc123") })
    ).toEqual({ isWorktree: true, name: "agent-abc123" });
  });

  it("reports not-a-worktree when git exec throws (not a repo)", () => {
    expect(detectWorktree("/repo", { execImpl: execThrows() })).toEqual({
      isWorktree: false,
      name: null,
    });
  });
});

describe("resolveTestDatabaseUrl", () => {
  it("returns baseUrl when baseUrl is empty, without calling fetch", async () => {
    const fetchImpl = vi.fn();
    const result = await resolveTestDatabaseUrl(
      "",
      {},
      {
        execImpl: execNotWorktree(),
        fetchImpl,
      }
    );
    expect(result).toBe("");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns baseUrl and warns when no Neon credentials are set, without calling fetch", async () => {
    const fetchImpl = vi.fn();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await resolveTestDatabaseUrl(
      BASE_URL,
      {},
      {
        execImpl: execNotWorktree(),
        fetchImpl,
      }
    );
    expect(result).toBe(BASE_URL);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("NEON_API_KEY/NEON_PROJECT_ID not set")
    );
    warnSpy.mockRestore();
  });

  it("names the branch after the checkout root, not the process cwd", async () => {
    const { fetchImpl, calls } = createNeonMock([]);
    const execImpl = vi.fn((_cmd: string, args: readonly string[]) => {
      if (args.includes("--show-toplevel")) {
        return "/Users/someone/Projects/wraps\n";
      }
      throw new Error(`unexpected exec: ${args.join(" ")}`);
    });

    const result = await resolveTestDatabaseUrl(BASE_URL, NEON_ENV, {
      execImpl,
      fetchImpl,
    });

    const postCall = calls.find((c) => c.method === "POST");
    expect(postCall).toBeDefined();
    expect(postCall?.body.branch).toEqual({
      parent_id: "parent-123",
      name: "wt-wraps",
    });
    expect(result).toBe(
      "postgres://role:pw@ep-branch.us-east-2.aws.neon.tech/testdb"
    );
  });

  it("names the branch after the worktree root when inside a linked worktree", async () => {
    const { fetchImpl, calls } = createNeonMock([]);
    const execImpl = vi.fn((_cmd: string, args: readonly string[]) => {
      if (args.includes("--show-toplevel")) {
        return "/repo/.claude/worktrees/agent-abc123\n";
      }
      throw new Error(`unexpected exec: ${args.join(" ")}`);
    });

    const result = await resolveTestDatabaseUrl(BASE_URL, NEON_ENV, {
      execImpl,
      fetchImpl,
    });

    const postCall = calls.find((c) => c.method === "POST");
    expect(postCall).toBeDefined();
    expect(postCall?.body.branch).toEqual({
      parent_id: "parent-123",
      name: "wt-agent-abc123",
    });
    expect(result).toBe(
      "postgres://role:pw@ep-branch.us-east-2.aws.neon.tech/testdb"
    );
  });

  it("returns baseUrl when the checkout root cannot be determined", async () => {
    const fetchImpl = vi.fn();
    const execImpl = vi.fn(() => {
      throw new Error("fatal: not a git repository");
    });

    const result = await resolveTestDatabaseUrl(BASE_URL, NEON_ENV, {
      execImpl,
      fetchImpl,
    });

    expect(result).toBe(BASE_URL);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns baseUrl and warns when in a worktree without Neon credentials", async () => {
    const fetchImpl = vi.fn();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await resolveTestDatabaseUrl(
      BASE_URL,
      {},
      {
        execImpl: execWorktree(),
        fetchImpl,
      }
    );
    expect(result).toBe(BASE_URL);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("NEON_API_KEY/NEON_PROJECT_ID not set")
    );
    warnSpy.mockRestore();
  });

  it("creates the branch when missing, with the correct parent_id and name", async () => {
    const { fetchImpl, calls } = createNeonMock([]);
    const result = await resolveTestDatabaseUrl(BASE_URL, NEON_ENV, {
      execImpl: execWorktree("agent-test123"),
      fetchImpl,
    });

    const postCall = calls.find((c) => c.method === "POST");
    expect(postCall).toBeDefined();
    expect(postCall?.body.branch).toEqual({
      parent_id: "parent-123",
      name: BRANCH_NAME,
    });
    expect(result).toBe(
      "postgres://role:pw@ep-branch.us-east-2.aws.neon.tech/testdb"
    );
  });

  it("reuses an existing branch without issuing a POST", async () => {
    const { fetchImpl, calls } = createNeonMock([
      { id: "branch-1", name: BRANCH_NAME, current_state: "ready" },
    ]);
    const result = await resolveTestDatabaseUrl(BASE_URL, NEON_ENV, {
      execImpl: execWorktree("agent-test123"),
      fetchImpl,
    });

    expect(calls.some((c) => c.method === "POST")).toBe(false);
    expect(result).toBe(
      "postgres://role:pw@ep-branch.us-east-2.aws.neon.tech/testdb"
    );
  });

  it("re-GETs and proceeds on a 409 from a concurrent create", async () => {
    let listCallCount = 0;
    const fetchImpl = vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? "GET";
      const parsed = new URL(url);

      if (parsed.pathname.endsWith("/endpoints")) {
        return jsonResponse({
          endpoints: [
            {
              host: "ep-foo.us-east-2.aws.neon.tech",
              branch_id: "parent-123",
            },
          ],
        });
      }
      if (method === "POST" && parsed.pathname.endsWith("/branches")) {
        return jsonResponse({ message: "Branch already exists" }, 409);
      }
      if (parsed.pathname.endsWith("/connection_uri")) {
        return jsonResponse({
          uri: "postgres://role:pw@ep-branch.us-east-2.aws.neon.tech/testdb",
        });
      }
      if (method === "GET" && parsed.pathname.endsWith("/branches")) {
        listCallCount++;
        if (listCallCount === 1) {
          return jsonResponse({ branches: [] });
        }
        return jsonResponse({
          branches: [
            { id: "branch-9", name: BRANCH_NAME, current_state: "ready" },
          ],
        });
      }
      throw new Error(`unhandled fetch: ${method} ${url}`);
    });

    const result = await resolveTestDatabaseUrl(BASE_URL, NEON_ENV, {
      execImpl: execWorktree("agent-test123"),
      fetchImpl,
    });

    expect(result).toBe(
      "postgres://role:pw@ep-branch.us-east-2.aws.neon.tech/testdb"
    );
  });

  it("returns baseUrl when any fetch call rejects, and never throws", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await resolveTestDatabaseUrl(BASE_URL, NEON_ENV, {
      execImpl: execWorktree("agent-test123"),
      fetchImpl,
    });

    expect(result).toBe(BASE_URL);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe("reapOrphanBranches", () => {
  it("deletes only wt-* branches absent from the worktree list; keeps live ones and non-wt- branches", async () => {
    const branches = [
      { id: "b-live", name: "wt-agent-live1", current_state: "ready" },
      { id: "b-dead", name: "wt-agent-dead1", current_state: "ready" },
      { id: "b-main", name: "main", current_state: "ready" },
    ];
    const { fetchImpl, calls } = createNeonMock(branches);
    const execImpl = execWorktreeList([
      "/Users/x/Projects/wraps",
      "/Users/x/Projects/wraps/.claude/worktrees/agent-live1",
    ]);

    const result = await reapOrphanBranches(NEON_ENV, { fetchImpl, execImpl });

    expect(result.deleted).toEqual(["wt-agent-dead1"]);
    expect(result.kept).toEqual(["wt-agent-live1"]);

    const deleteUrls = calls
      .filter((c) => c.method === "DELETE")
      .map((c) => c.url);
    expect(deleteUrls).toEqual([
      "https://console.neon.tech/api/v2/projects/proj-1/branches/b-dead",
    ]);
  });

  it("deletes live wt-* branches too when opts.all is true", async () => {
    const branches = [
      { id: "b-live", name: "wt-agent-live1", current_state: "ready" },
    ];
    const { fetchImpl, calls } = createNeonMock(branches);
    const execImpl = execWorktreeList([
      "/Users/x/Projects/wraps",
      "/Users/x/Projects/wraps/.claude/worktrees/agent-live1",
    ]);

    const result = await reapOrphanBranches(NEON_ENV, {
      fetchImpl,
      execImpl,
      all: true,
    });

    expect(result.deleted).toEqual(["wt-agent-live1"]);
    expect(result.kept).toEqual([]);

    const deleteUrls = calls
      .filter((c) => c.method === "DELETE")
      .map((c) => c.url);
    expect(deleteUrls).toEqual([
      "https://console.neon.tech/api/v2/projects/proj-1/branches/b-live",
    ]);
  });
});
