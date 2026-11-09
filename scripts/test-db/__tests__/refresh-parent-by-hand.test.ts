import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { projectIdSha256 } from "../ci-branch.mjs";
import {
  checkoutProblem,
  handEnv,
  parseArgs,
  run,
  terminalLog,
} from "../refresh-parent-by-hand.mjs";

const MAIN_SHA = "abcdef0123456789abcdef0123456789abcdef01";
const PR_SHA = "1234567890abcdef1234567890abcdef12345678";
const API_KEY = "fake-neon-key-do-not-print";
const PROJECT_ID = "proj-fake-1";
const PARENT_PW = "parent-secret-pw";
const PARENT_HOST = "ep-fake-parent.us-east-2.aws.neon.tech";
const DATABASE_URL = `postgresql://testrole:${PARENT_PW}@ep-fake-parent-pooler.us-east-2.aws.neon.tech/testdb?sslmode=require`;
const DIRECT_PW = "direct-secret-pw";
const DIRECT_URI = `postgresql://testrole:${DIRECT_PW}@${PARENT_HOST}/testdb?sslmode=require`;
// Fixture apps/web/.env.test: fake values only.
const ENV_TEST = [
  "# fixture",
  `DATABASE_URL=${DATABASE_URL}`,
  "BETTER_AUTH_SECRET=fake-auth-secret",
  `NEON_API_KEY=${API_KEY}`,
  `NEON_PROJECT_ID=${PROJECT_ID}`,
  "",
].join("\n");
const SECRETS = [
  API_KEY,
  PROJECT_ID,
  PARENT_PW,
  DIRECT_PW,
  PARENT_HOST,
  DIRECT_URI,
  DATABASE_URL,
  "fake-auth-secret",
];
// 2026-11-09T12:00:00Z
const NOW = new Date(1_762_689_600_000);
const RUN_ID = "1762689600";

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

/** A git that answers as a checkout at `head`, with origin/main at `main`. */
function fakeGit({
  head = MAIN_SHA,
  main = MAIN_SHA,
  dirty = "",
  fetchFails = false,
} = {}) {
  return vi.fn((args: string[]) => {
    const cmd = args.join(" ");
    if (cmd === "rev-parse HEAD") {
      return `${head}\n`;
    }
    if (cmd === "fetch --quiet origin main") {
      if (fetchFails) {
        throw new Error("network down");
      }
      return "";
    }
    if (cmd === "rev-parse origin/main") {
      return `${main}\n`;
    }
    if (cmd.startsWith("status --porcelain")) {
      return dirty;
    }
    throw new Error(`unexpected git ${cmd}`);
  });
}

/** The read-only slice of the Neon API a dry run touches. */
function fakeNeon() {
  return vi.fn(async (url: string, init: RequestInit = {}) => {
    const { pathname } = new URL(url);
    if ((init.method ?? "GET") !== "GET") {
      throw new Error(`a dry run must not ${init.method} ${pathname}`);
    }
    if (pathname === `/api/v2/projects/${PROJECT_ID}`) {
      return jsonResponse({ project: { id: PROJECT_ID } });
    }
    if (pathname.endsWith("/branches")) {
      return jsonResponse({
        branches: [
          {
            id: "br-parent",
            name: "production",
            default: true,
            current_state: "ready",
          },
        ],
      });
    }
    if (pathname.endsWith("/endpoints")) {
      return jsonResponse({
        endpoints: [{ host: PARENT_HOST, branch_id: "br-parent" }],
      });
    }
    if (pathname.endsWith("/connection_uri")) {
      return jsonResponse({ uri: DIRECT_URI });
    }
    throw new Error(`unhandled fetch: ${url}`);
  });
}

function handHarness(git = fakeGit()) {
  const lines: string[] = [];
  const fetchImpl = fakeNeon();
  const reapImpl = vi.fn(async () => 0);
  const readEnvTest = vi.fn(() => ENV_TEST);
  const io = {
    git,
    readEnvTest,
    now: () => NOW,
    out: (l: string) => lines.push(l),
    err: (l: string) => lines.push(l),
    reapImpl,
    refreshIo: {
      fetchImpl,
      // The fake id stands in for wraps-test; the real id never appears here.
      testProjectIdSha256: projectIdSha256(PROJECT_ID),
    },
  };
  return { io, lines, fetchImpl, reapImpl, readEnvTest, git };
}

describe("parseArgs", () => {
  it("reads --dry-run and --from-branch", () => {
    expect(parseArgs([])).toEqual({ dryRun: false, fromBranch: false });
    expect(parseArgs(["--dry-run"])).toEqual({
      dryRun: true,
      fromBranch: false,
    });
    expect(parseArgs(["--from-branch", "--dry-run"])).toEqual({
      dryRun: true,
      fromBranch: true,
    });
  });

  it("rejects anything else rather than ignoring it", () => {
    expect(parseArgs(["--force"])).toEqual({
      error: 'unknown argument "--force"',
    });
  });
});

describe("handEnv", () => {
  it("builds refreshParent's env from .env.test, with DATABASE_URL as TEST_DATABASE_URL", () => {
    expect(handEnv(ENV_TEST, { sha: MAIN_SHA, runId: RUN_ID })).toEqual({
      env: {
        NEON_API_KEY: API_KEY,
        NEON_PROJECT_ID: PROJECT_ID,
        TEST_DATABASE_URL: DATABASE_URL,
        GITHUB_SHA: MAIN_SHA,
        GITHUB_RUN_ID: RUN_ID,
      },
    });
  });

  it("names the missing keys", () => {
    expect(
      handEnv(`DATABASE_URL=${DATABASE_URL}\n`, { sha: MAIN_SHA, runId: "1" })
    ).toEqual({ missing: ["NEON_API_KEY", "NEON_PROJECT_ID"] });
  });
});

describe("checkoutProblem", () => {
  it("accepts HEAD at origin/main, after fetching it", () => {
    const git = fakeGit();
    expect(checkoutProblem(git, { fromBranch: false })).toEqual({
      sha: MAIN_SHA,
    });
    expect(git).toHaveBeenCalledWith(["fetch", "--quiet", "origin", "main"]);
  });

  it("refuses HEAD off origin/main, saying why", () => {
    const result = checkoutProblem(fakeGit({ head: PR_SHA }), {
      fromBranch: false,
    });
    expect(result).toEqual({ problem: expect.stringContaining("1234567") });
    const { problem } = result as { problem: string };
    expect(problem).toContain("is not origin/main (abcdef0)");
    expect(problem).toContain("only main's schema may reach it");
  });

  it("refuses when origin/main cannot be fetched", () => {
    const result = checkoutProblem(fakeGit({ fetchFails: true }), {
      fromBranch: false,
    });
    expect(result).toEqual({
      problem: expect.stringContaining("could not fetch origin/main"),
    });
  });

  it("refuses uncommitted schema edits, even on main", () => {
    const result = checkoutProblem(
      fakeGit({ dirty: " M packages/db/src/schema/batch.ts\n" }),
      { fromBranch: false }
    );
    expect(result).toEqual({
      problem: expect.stringContaining("uncommitted changes"),
    });
  });

  it("with --from-branch, skips only the origin/main comparison", () => {
    const git = fakeGit({ head: PR_SHA });
    expect(checkoutProblem(git, { fromBranch: true })).toEqual({
      sha: PR_SHA,
    });
    expect(git).not.toHaveBeenCalledWith([
      "fetch",
      "--quiet",
      "origin",
      "main",
    ]);
    expect(
      checkoutProblem(fakeGit({ head: PR_SHA, dirty: " M x\n" }), {
        fromBranch: true,
      })
    ).toEqual({ problem: expect.stringContaining("uncommitted changes") });
  });
});

describe("terminalLog", () => {
  it("drops ::add-mask:: lines and strips workflow prefixes", () => {
    const out: string[] = [];
    const err: string[] = [];
    const log = terminalLog(
      (l) => out.push(l),
      (l) => err.push(l)
    );
    log(`::add-mask::${DIRECT_URI}`);
    log("::error::[ci-branch] refresh-parent: boom");
    log("[ci-branch] fine");
    expect(out).toEqual(["[ci-branch] fine"]);
    expect(err).toEqual(["[ci-branch] refresh-parent: boom"]);
  });
});

describe("run", () => {
  it("--dry-run on main: checks the target, names backup-<sha7>-<epoch>, never reaps, never prints a value", async () => {
    const h = handHarness();
    const code = await run(["--dry-run"], {}, h.io);

    expect(code).toBe(0);
    const output = h.lines.join("\n");
    expect(output).toContain(
      `dry run: would snapshot the parent as backup-abcdef0-${RUN_ID}`
    );
    expect(h.fetchImpl).toHaveBeenCalled();
    expect(h.reapImpl).not.toHaveBeenCalled();
    for (const secret of SECRETS) {
      expect(output).not.toContain(secret);
    }
    expect(output).not.toContain(encodeURIComponent(DIRECT_PW));
  });

  it("passes dryRun and byHand through to refreshParent with the env built from .env.test", async () => {
    const h = handHarness();
    const refreshImpl = vi.fn(async () => ({
      exitCode: 0,
      status: "checked" as const,
    }));
    await run(["--dry-run"], {}, { ...h.io, refreshImpl });

    const [env, io] = refreshImpl.mock.calls[0] as unknown as [any, any];
    expect(env).toEqual({
      NEON_API_KEY: API_KEY,
      NEON_PROJECT_ID: PROJECT_ID,
      TEST_DATABASE_URL: DATABASE_URL,
      GITHUB_SHA: MAIN_SHA,
      GITHUB_RUN_ID: RUN_ID,
    });
    expect(io).toMatchObject({ dryRun: true, byHand: true });
  });

  it("off origin/main, refuses before reading .env.test or calling Neon", async () => {
    const h = handHarness(fakeGit({ head: PR_SHA }));
    const code = await run(["--dry-run"], {}, h.io);

    expect(code).toBe(1);
    expect(h.readEnvTest).not.toHaveBeenCalled();
    expect(h.fetchImpl).not.toHaveBeenCalled();
    expect(h.reapImpl).not.toHaveBeenCalled();
    expect(h.lines.join("\n")).toContain("refusing: HEAD (1234567)");
  });

  it("--from-branch lifts the main check and nothing else: same refreshParent call, plus a warning", async () => {
    const calls: unknown[][] = [];
    const refreshImpl = vi.fn(async (...args: unknown[]) => {
      calls.push(args);
      return { exitCode: 0, status: "checked" as const };
    });
    const onMain = handHarness(fakeGit({ head: PR_SHA, main: PR_SHA }));
    await run(["--dry-run"], {}, { ...onMain.io, refreshImpl });
    const fromBranch = handHarness(fakeGit({ head: PR_SHA }));
    const code = await run(
      ["--dry-run", "--from-branch"],
      {},
      { ...fromBranch.io, refreshIo: onMain.io.refreshIo, refreshImpl }
    );

    expect(code).toBe(0);
    const [mainEnv, mainIo] = calls[0] as [any, any];
    const [branchEnv, branchIo] = calls[1] as [any, any];
    expect(branchEnv).toEqual(mainEnv);
    const { log: _a, ...mainRest } = mainIo;
    const { log: _b, ...branchRest } = branchIo;
    expect(branchRest).toEqual(mainRest);
    expect(fromBranch.lines.join("\n")).toContain(
      "The parent stays ahead of main until this PR merges"
    );
  });

  it("--from-branch still runs the guard: an unpinned project is refused", async () => {
    const h = handHarness(fakeGit({ head: PR_SHA }));
    const code = await run(
      ["--dry-run", "--from-branch"],
      {},
      {
        ...h.io,
        refreshIo: {
          ...h.io.refreshIo,
          testProjectIdSha256: projectIdSha256("some-other-project"),
        },
      }
    );

    expect(code).toBe(1);
    expect(h.fetchImpl).not.toHaveBeenCalled();
    expect(h.lines.join("\n")).toContain("not the wraps-test project");
  });

  it("reaps this checkout's branch only after a real push succeeds", async () => {
    const pushed = handHarness();
    expect(
      await run(
        [],
        {},
        {
          ...pushed.io,
          refreshImpl: async () => ({ exitCode: 0, status: "pushed" as const }),
        }
      )
    ).toBe(0);
    expect(pushed.reapImpl).toHaveBeenCalledOnce();

    const failed = handHarness();
    expect(
      await run(
        [],
        {},
        {
          ...failed.io,
          refreshImpl: async () => ({ exitCode: 1, status: "failed" as const }),
        }
      )
    ).toBe(1);
    expect(failed.reapImpl).not.toHaveBeenCalled();
  });

  it("refuses in CI", async () => {
    const h = handHarness();
    expect(await run([], { GITHUB_ACTIONS: "true" }, h.io)).toBe(1);
    expect(h.git).not.toHaveBeenCalled();
  });

  it("names a missing .env.test key without printing any value", async () => {
    const h = handHarness();
    const code = await run(
      ["--dry-run"],
      {},
      { ...h.io, readEnvTest: () => `DATABASE_URL=${DATABASE_URL}\n` }
    );

    expect(code).toBe(1);
    const output = h.lines.join("\n");
    expect(output).toContain("has no NEON_API_KEY, NEON_PROJECT_ID");
    expect(output).not.toContain(PARENT_PW);
  });

  it("exits 2 on an unknown argument", async () => {
    const h = handHarness();
    expect(await run(["--yes"], {}, h.io)).toBe(2);
    expect(h.git).not.toHaveBeenCalled();
  });
});

describe("the pnpm script", () => {
  it("is a single node command, so pnpm hands --dry-run to the wrapper and not to a later step", () => {
    const pkg = JSON.parse(
      readFileSync(
        path.resolve(import.meta.dirname, "../../../package.json"),
        "utf8"
      )
    );
    expect(pkg.scripts["test-db:refresh"]).toBe(
      "node scripts/test-db/refresh-parent-by-hand.mjs"
    );
  });
});
