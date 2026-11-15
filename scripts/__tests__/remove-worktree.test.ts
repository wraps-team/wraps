import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
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
if (process.env.REAP_FAIL) {
  console.error("reap boom");
  process.exit(1);
}
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

function runScript(
  cwd: string,
  script: string,
  args: string[],
  extraEnv: Record<string, string> = {}
) {
  const r = spawnSync("bash", [script, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, WORKTREE_UNDER_TEST: wt, ...extraEnv },
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

function run(cwd: string, ...args: string[]) {
  return runScript(cwd, SCRIPT, args);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The relink commands the script printed: the indented lines after a blank line. */
function relinkLines(out: string): string[] {
  return out
    .split("\n")
    .filter((l) => l.startsWith("  "))
    .map((l) => l.trim());
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
  // Tracked copy of the script, so a worktree can run it by relative path.
  copyFileSync(SCRIPT, join(main, "scripts", "remove-worktree.sh"));
  // Same ignore rules as the real repo for the paths that matter here.
  writeFileSync(join(main, ".gitignore"), "node_modules/\n.claude/\nplans/\n");
  git(main, "add", "-f", ".claude", "scripts", ".gitignore");
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
    expect(existsSync(join(main, "reap-ran.txt"))).toBe(false);

    // The printed lines are the real relink: .claude is a symlink again, notes
    // is relinked, and status shows the usual dirty pair.
    const lines = relinkLines(r.out);
    expect(lines).toHaveLength(2);
    const w = escapeRegExp(wt);
    const m = escapeRegExp(main);
    expect(lines[0]).toMatch(
      new RegExp(
        `^\\[ -L "${w}/\\.claude" \\] \\|\\| \\{ ` +
          `if \\[ -z "\\$\\(git -C "${w}" status --porcelain --ignored -- \\.claude\\)" \\]; ` +
          `then rm -r "${w}/\\.claude"; else mv "${w}/\\.claude" "${w}/\\.claude\\.restored\\.\\d+"; fi ` +
          `&& ln -sn "${m}/\\.claude" "${w}/\\.claude"; \\}$`
      )
    );
    expect(lines[1]).toBe(
      `[ -e "${wt}/notes" ] || [ -L "${wt}/notes" ] || ln -sn "${main}/notes" "${wt}/notes"`
    );
    for (const line of lines) {
      expect(spawnSync("bash", ["-c", line]).status).toBe(0);
    }
    expect(lstatSync(join(wt, ".claude")).isSymbolicLink()).toBe(true);
    expect(lstatSync(join(wt, "notes")).isSymbolicLink()).toBe(true);
    expect(git(wt, "status", "--porcelain")).toContain(" D .claude/x.md");
  });

  it("--restore-only relink lines are safe to paste twice", () => {
    linkSharedDirs();
    const lines = relinkLines(run(main, "--restore-only", wt).out);
    for (const line of lines) {
      expect(spawnSync("bash", ["-c", line]).status).toBe(0);
    }
    const afterFirst = git(wt, "status", "--porcelain");

    for (const line of lines) {
      expect(spawnSync("bash", ["-c", line]).status).toBe(0);
    }

    expect(lstatSync(join(wt, ".claude")).isSymbolicLink()).toBe(true);
    expect(readdirSync(join(main, "notes"))).toEqual([]);
    expect(readdirSync(join(main, ".claude"))).toEqual(["x.md"]);
    expect(readdirSync(wt).filter((n) => n.includes(".restored."))).toEqual([]);
    expect(git(wt, "status", "--porcelain")).toBe(afterFirst);
  });

  it("--restore-only relink moves .claude aside when it holds ignored work", () => {
    linkSharedDirs();
    const r = run(main, "--restore-only", wt);
    writeFileSync(join(wt, ".claude", "settings.local.json"), "{}\n");

    for (const line of relinkLines(r.out)) {
      expect(spawnSync("bash", ["-c", line]).status).toBe(0);
    }

    expect(lstatSync(join(wt, ".claude")).isSymbolicLink()).toBe(true);
    const backup = readdirSync(wt).find((n) =>
      n.startsWith(".claude.restored.")
    );
    expect(backup).toBeDefined();
    expect(existsSync(join(wt, backup as string, "settings.local.json"))).toBe(
      true
    );
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

  it("refuses ignored work under plans/, keeps it, does not reap", () => {
    linkSharedDirs();
    mkdirSync(join(wt, "plans"));
    writeFileSync(join(wt, "plans", "draft.md"), "unsaved plan\n");
    // Build output is ignored too, and must not block removal on its own.
    mkdirSync(join(wt, "node_modules"));
    writeFileSync(join(wt, "node_modules", "dep.js"), "x\n");

    const r = run(main, wt);

    expect(r.code).toBe(1);
    expect(r.err).toContain("plans/");
    expect(r.err).not.toContain("node_modules");
    expect(r.err).toContain("nothing was removed");
    expect(existsSync(join(wt, "plans", "draft.md"))).toBe(true);
    expect(existsSync(join(main, "reap-ran.txt"))).toBe(false);
    // The unlinked dirs come with a way back.
    expect(r.err).toContain(`ln -sn "${main}/notes" "${wt}/notes"`);
  });

  it("refuses ignored files in a real .claude", () => {
    writeFileSync(join(wt, ".claude", "settings.local.json"), "{}\n");

    const r = run(main, wt);

    expect(r.code).toBe(1);
    expect(r.err).toContain(".claude/settings.local.json");
    expect(existsSync(join(wt, ".claude", "settings.local.json"))).toBe(true);
    expect(existsSync(join(main, "reap-ran.txt"))).toBe(false);
  });

  it.each([
    ["a space", ".claude/my notes.md"],
    ["non-ASCII characters", ".claude/caf\u00e9 \u65e5\u672c.md"],
  ])("refuses an ignored file whose name has %s", (_label, rel) => {
    writeFileSync(join(wt, rel), "unsaved\n");

    const r = run(main, wt);

    expect(r.code).toBe(1);
    expect(r.err).toContain(rel);
    expect(existsSync(join(wt, rel))).toBe(true);
    expect(existsSync(wt)).toBe(true);
    expect(existsSync(join(main, "reap-ran.txt"))).toBe(false);
  });

  it("refuses ignored work nested below the repo root", () => {
    mkdirSync(join(wt, "packages", "app", "plans"), { recursive: true });
    writeFileSync(join(wt, "packages", "app", "plans", "p.md"), "x\n");

    const r = run(main, wt);

    expect(r.code).toBe(1);
    expect(r.err).toContain("packages/app/plans/");
    expect(existsSync(wt)).toBe(true);
  });

  it("removes a worktree whose only ignored files are build output", () => {
    mkdirSync(join(wt, "node_modules"));
    writeFileSync(join(wt, "node_modules", "dep.js"), "x\n");

    const r = run(main, wt);

    expect(r.code).toBe(0);
    expect(existsSync(wt)).toBe(false);
  });

  it("removes the worktree when run from inside it by relative path", () => {
    linkSharedDirs();

    const r = runScript(wt, "scripts/remove-worktree.sh", ["."]);

    expect(r.err).toBe("");
    expect(r.code).toBe(0);
    expect(existsSync(wt)).toBe(false);
    expect(readFileSync(join(main, "reap-ran.txt"), "utf8")).toBe(
      "worktree-gone"
    );
  });

  it("reports a failing reap after the worktree is already gone", () => {
    const r = runScript(main, SCRIPT, [wt], { REAP_FAIL: "1" });

    expect(r.code).not.toBe(0);
    expect(existsSync(wt)).toBe(false);
    expect(r.err).toContain("reap boom");
    expect(r.err).toContain("already gone");
    expect(r.err).toContain("node scripts/test-db/reap-branches.mjs");
  });

  it("does not reap when git refuses to remove (locked worktree)", () => {
    git(main, "worktree", "lock", wt);

    const r = run(main, wt);

    expect(r.code).not.toBe(0);
    expect(existsSync(wt)).toBe(true);
    expect(existsSync(join(main, "reap-ran.txt"))).toBe(false);
  });
});
