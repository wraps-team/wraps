import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// scripts/remove-worktree.sh undoes setup-worktree.sh's symlinks, removes the
// worktree, then reaps its Neon branch. These tests run the real script against
// a throwaway repo (never a real worktree), with a fake reap-branches.mjs that
// writes a marker file recording whether the worktree still existed when it ran.
const SCRIPT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "remove-worktree.sh"
);

const FAKE_REAP = `import { existsSync, writeFileSync } from "node:fs";
writeFileSync(
  "reap-ran.txt",
  existsSync(process.env.WORKTREE_UNDER_TEST) ? "worktree-still-there" : "worktree-gone"
);
`;

let root: string;
let main: string;
let wt: string;

function git(cwd: string, ...args: string[]): string {
  const r = spawnSync(
    "git",
    ["-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", ...args],
    { cwd, encoding: "utf8" }
  );
  if (r.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
  }
  return r.stdout;
}

function run(cwd: string, ...args: string[]) {
  const r = spawnSync("bash", [SCRIPT, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, WORKTREE_UNDER_TEST: wt },
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

/** What setup-worktree.sh does: swap the tracked .claude for a symlink to the main tree's. */
function linkSharedDirs(): void {
  rmSync(join(wt, ".claude"), { recursive: true });
  symlinkSync(join(main, ".claude"), join(wt, ".claude"));
  mkdirSync(join(main, "notes"));
  symlinkSync(join(main, "notes"), join(wt, "notes"));
}

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "remove-worktree-")));
  main = join(root, "main");
  wt = join(root, "wt");
  mkdirSync(main);
  git(main, "init", "-q", "-b", "main");
  git(main, "config", "user.email", "t@example.com");
  git(main, "config", "user.name", "t");
  mkdirSync(join(main, ".claude"));
  writeFileSync(join(main, ".claude", "x.md"), "tracked\n");
  mkdirSync(join(main, "scripts", "test-db"), { recursive: true });
  writeFileSync(
    join(main, "scripts", "test-db", "reap-branches.mjs"),
    FAKE_REAP
  );
  git(main, "add", ".claude", "scripts");
  git(main, "commit", "-q", "-m", "init");
  git(main, "worktree", "add", "-q", "-b", "feature", wt);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("remove-worktree.sh", () => {
  it("restores .claude, removes a clean worktree, then reaps", () => {
    linkSharedDirs();
    expect(lstatSync(join(wt, ".claude")).isSymbolicLink()).toBe(true);

    const r = run(main, wt);

    expect(r.err).toBe("");
    expect(r.code).toBe(0);
    expect(existsSync(wt)).toBe(false);
    expect(git(main, "worktree", "list", "--porcelain")).not.toContain(wt);
    // Reap ran from the main tree, after the removal.
    expect(readFileSync(join(main, "reap-ran.txt"), "utf8")).toBe(
      "worktree-gone"
    );
    // The main tree's own .claude was never touched.
    expect(existsSync(join(main, ".claude", "x.md"))).toBe(true);
  });

  it("refuses a dirty worktree: exit 1, still there, no reap", () => {
    linkSharedDirs();
    writeFileSync(join(wt, "scratch.txt"), "work in progress\n");

    const r = run(main, wt);

    expect(r.code).toBe(1);
    expect(r.err).toContain("scratch.txt");
    expect(r.err).toContain("nothing was removed");
    expect(existsSync(wt)).toBe(true);
    expect(existsSync(join(wt, "scratch.txt"))).toBe(true);
    expect(existsSync(join(main, "reap-ran.txt"))).toBe(false);
    // .claude was restored even though nothing was removed.
    expect(lstatSync(join(wt, ".claude")).isDirectory()).toBe(true);
  });

  it("--restore-only restores the dirs, keeps the worktree, prints the relink commands", () => {
    linkSharedDirs();

    const r = run(main, "--restore-only", wt);

    expect(r.code).toBe(0);
    expect(existsSync(wt)).toBe(true);
    expect(lstatSync(join(wt, ".claude")).isSymbolicLink()).toBe(false);
    expect(lstatSync(join(wt, ".claude")).isDirectory()).toBe(true);
    expect(existsSync(join(wt, ".claude", "x.md"))).toBe(true);
    expect(existsSync(join(wt, "notes"))).toBe(false);
    expect(git(wt, "status", "--porcelain")).toBe("");
    expect(r.out).toContain(`ln -s "${main}/.claude" "${wt}/.claude"`);
    expect(r.out).toContain(`ln -s "${main}/notes" "${wt}/notes"`);
    expect(existsSync(join(main, "reap-ran.txt"))).toBe(false);
  });

  it("does not discard edits in a real (never symlinked) .claude", () => {
    writeFileSync(join(wt, ".claude", "x.md"), "edited\n");

    const r = run(main, wt);

    expect(r.code).toBe(1);
    expect(existsSync(wt)).toBe(true);
    expect(git(wt, "status", "--porcelain")).toContain(".claude/x.md");
  });

  it("refuses the main tree", () => {
    const r = run(main, main);
    expect(r.code).toBe(1);
    expect(r.err).toContain("main working tree");
    expect(existsSync(main)).toBe(true);
    // Also from inside a worktree.
    expect(run(wt, main).code).toBe(1);
  });

  it("refuses a path that is not a registered worktree", () => {
    const stray = join(root, "stray");
    mkdirSync(stray);
    const r = run(main, stray);
    expect(r.code).toBe(1);
    expect(r.err).toContain("not listed");
    expect(existsSync(stray)).toBe(true);

    expect(run(main, join(root, "missing")).code).toBe(1);
  });

  it("exits 2 without exactly one path", () => {
    expect(run(main).code).toBe(2);
    expect(run(main, wt, wt).code).toBe(2);
    expect(run(main, "--bogus", wt).code).toBe(2);
  });
});
