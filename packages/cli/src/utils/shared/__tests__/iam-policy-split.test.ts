import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { WrapsError } from "../errors.js";

/** Make one fs call fail for a given path; everything else is the real fs. */
const failures = vi.hoisted(() => ({
  unlink: undefined as string | undefined,
  readdir: undefined as string | undefined,
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  const eacces = (syscall: string, path: string) =>
    Object.assign(
      new Error(`EACCES: permission denied, ${syscall} '${path}'`),
      { code: "EACCES" }
    );
  return {
    ...actual,
    unlinkSync: (path: string) => {
      if (path === failures.unlink) {
        throw eacces("unlink", path);
      }
      return actual.unlinkSync(path);
    },
    readdirSync: ((path: string, ...rest: unknown[]) => {
      if (path === failures.readdir) {
        throw eacces("scandir", path);
      }
      return (actual.readdirSync as (...a: unknown[]) => unknown)(
        path,
        ...rest
      );
    }) as typeof actual.readdirSync,
  };
});

afterEach(() => {
  failures.unlink = undefined;
  failures.readdir = undefined;
});

import {
  MANAGED_POLICY_SIZE_LIMIT,
  type NamedPolicy,
  policySize,
  splitPolicy,
  writePolicyDir,
} from "../iam-policy-split.js";

type Stmt = {
  Sid: string;
  Effect: "Allow";
  Action: string[];
  Resource: string;
};

function stmt(sid: string, actionLength: number): Stmt {
  return {
    Sid: sid,
    Effect: "Allow",
    Action: ["a".repeat(actionLength)],
    Resource: "*",
  };
}

function doc(statements: Stmt[]) {
  return { Version: "2012-10-17", Statement: statements };
}

/** Two statements whose combined policy measures exactly `size`. */
function pairOfSize(size: number): Stmt[] {
  const first = stmt("First", 100);
  const probe = stmt("Second", 0);
  const base = policySize(doc([first, probe]));
  return [first, stmt("Second", size - base)];
}

describe("policySize", () => {
  it("counts the JSON with whitespace removed", () => {
    expect(policySize({ a: "b" })).toBe('{"a":"b"}'.length);
    expect(policySize(doc([stmt("S", 3)]))).toBe(
      '{"Version":"2012-10-17","Statement":[{"Sid":"S","Effect":"Allow","Action":["aaa"],"Resource":"*"}]}'
        .length
    );
  });
});

describe("splitPolicy", () => {
  it("a policy of exactly 6,144 characters is one part", () => {
    const statements = pairOfSize(MANAGED_POLICY_SIZE_LIMIT);
    expect(policySize(doc(statements))).toBe(6144);
    const parts = splitPolicy(doc(statements));
    expect(parts.map((p) => p.name)).toEqual(["wraps-deployer-1"]);
    expect(parts[0]?.policy).toEqual(doc(statements));
  });

  it("a policy of 6,145 characters splits in two", () => {
    const statements = pairOfSize(MANAGED_POLICY_SIZE_LIMIT + 1);
    expect(policySize(doc(statements))).toBe(6145);
    const parts = splitPolicy(doc(statements));
    expect(parts.map((p) => p.policy.Statement.map((s) => s.Sid))).toEqual([
      ["First"],
      ["Second"],
    ]);
    expect(parts.map((p) => p.name)).toEqual([
      "wraps-deployer-1",
      "wraps-deployer-2",
    ]);
  });

  it("a small limit gives many parts, statements in input order, each under the limit", () => {
    const statements = Array.from({ length: 12 }, (_, i) =>
      stmt(`S${i}`, 50 + i * 20)
    );
    const parts = splitPolicy(doc(statements), 800);
    expect(parts.length).toBe(4);
    for (const part of parts) {
      expect(policySize(part.policy)).toBeLessThanOrEqual(800);
      expect(part.policy.Version).toBe("2012-10-17");
    }
    expect(parts.flatMap((p) => p.policy.Statement)).toEqual(statements);
  });

  it("next-fit: a later small statement doesn't move into an earlier part", () => {
    // Big + Big don't fit; Small would fit after the first Big, but order wins.
    const statements = [stmt("Big1", 500), stmt("Big2", 500), stmt("Small", 1)];
    const parts = splitPolicy(doc(statements), 800);
    expect(parts.map((p) => p.policy.Statement.map((s) => s.Sid))).toEqual([
      ["Big1"],
      ["Big2", "Small"],
    ]);
  });

  it("throws POLICY_SPLIT_FAILED when one statement alone is over the limit", () => {
    const thrown = catchError(() =>
      splitPolicy(doc([stmt("Ok", 10), stmt("Huge", 7000)]))
    );
    expect(thrown).toBeInstanceOf(WrapsError);
    expect(thrown.code).toBe("POLICY_SPLIT_FAILED");
    expect(thrown.message).toMatch(
      /^IAM statement "Huge" alone is \d+ characters, over the 6144-character managed policy limit$/
    );
    expect(thrown.suggestion).toBe(
      "This is a bug in the Wraps CLI's deployer policy, not in your setup. Report it with the command you ran: wraps support"
    );
  });

  it("throws POLICY_SPLIT_FAILED on a duplicate Sid instead of deduplicating", () => {
    const thrown = catchError(() =>
      splitPolicy(doc([stmt("Same", 10), stmt("Other", 10), stmt("Same", 20)]))
    );
    expect(thrown).toBeInstanceOf(WrapsError);
    expect(thrown.code).toBe("POLICY_SPLIT_FAILED");
    expect(thrown.message).toBe('Duplicate IAM statement Sid "Same"');
  });
});

function catchError(fn: () => unknown): WrapsError {
  try {
    fn();
  } catch (err) {
    return err as WrapsError;
  }
  throw new Error("expected a throw");
}

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "wraps-policy-dir-"));
  tempDirs.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function parts(count: number): NamedPolicy<Stmt>[] {
  return Array.from({ length: count }, (_, i) => ({
    name: `wraps-deployer-${i + 1}`,
    policy: doc([stmt(`Part${i + 1}`, 10)]),
  }));
}

describe("writePolicyDir", () => {
  it("creates the folder and writes bare, pretty-printed, newline-terminated policies", () => {
    const dir = join(tempDir(), "nested", "wraps-policy");
    const result = writePolicyDir(dir, parts(2));

    expect(result.written).toEqual([
      join(dir, "wraps-deployer-1.json"),
      join(dir, "wraps-deployer-2.json"),
    ]);
    expect(result.removed).toEqual([]);
    const text = readFileSync(join(dir, "wraps-deployer-1.json"), "utf8");
    expect(text).toBe(`${JSON.stringify(doc([stmt("Part1", 10)]), null, 2)}\n`);
    expect(Object.keys(JSON.parse(text))).toEqual(["Version", "Statement"]);
  });

  it("returns absolute paths for a relative folder", () => {
    const base = tempDir();
    const cwd = vi.spyOn(process, "cwd").mockReturnValue(base);
    try {
      const result = writePolicyDir("./rel", parts(1));
      expect(result.dir).toBe(join(base, "rel"));
      expect(result.written).toEqual([
        join(base, "rel", "wraps-deployer-1.json"),
      ]);
    } finally {
      cwd.mockRestore();
    }
  });

  it("removes stale wraps-deployer-<n>.json above the new count and touches nothing else", () => {
    const dir = tempDir();
    writePolicyDir(dir, parts(3));
    writeFileSync(join(dir, "wraps-deployer-03.json"), "keep");
    writeFileSync(join(dir, "notes.json"), "keep");
    writeFileSync(join(dir, "wraps-deployer-1.json.bak"), "keep");
    writeFileSync(join(dir, "elsewhere.json"), "target");
    symlinkSync(
      join(dir, "elsewhere.json"),
      join(dir, "wraps-deployer-4.json")
    );

    const result = writePolicyDir(dir, parts(2));

    expect(result.removed).toEqual([join(dir, "wraps-deployer-3.json")]);
    expect(readdirSync(dir).sort()).toEqual(
      [
        "elsewhere.json",
        "notes.json",
        "wraps-deployer-03.json",
        "wraps-deployer-1.json",
        "wraps-deployer-1.json.bak",
        "wraps-deployer-2.json",
        "wraps-deployer-4.json",
      ].sort()
    );
    expect(lstatSync(join(dir, "wraps-deployer-4.json")).isSymbolicLink()).toBe(
      true
    );
    expect(readFileSync(join(dir, "elsewhere.json"), "utf8")).toBe("target");
  });

  it("removes nothing when a write fails", () => {
    const dir = tempDir();
    writePolicyDir(dir, parts(3));
    // A directory where wraps-deployer-2.json should go makes that write fail.
    rmSync(join(dir, "wraps-deployer-2.json"));
    mkdirSync(join(dir, "wraps-deployer-2.json"));

    let thrown: unknown;
    try {
      writePolicyDir(dir, parts(2));
    } catch (err) {
      thrown = err;
    }
    // The count dropped to 2, but -3 stays because a write failed.
    expect(thrown).toBeInstanceOf(WrapsError);
    expect((thrown as WrapsError).code).toBe("POLICY_DIR_WRITE_FAILED");
    expect(existsSync(join(dir, "wraps-deployer-3.json"))).toBe(true);
  });

  it("refuses to write through a symlink at a target path, before writing anything", () => {
    const dir = tempDir();
    writeFileSync(join(dir, "victim.txt"), "untouched");
    symlinkSync(join(dir, "victim.txt"), join(dir, "wraps-deployer-2.json"));

    let thrown: unknown;
    try {
      writePolicyDir(dir, parts(2));
    } catch (err) {
      thrown = err;
    }
    expect((thrown as WrapsError).code).toBe("POLICY_DIR_WRITE_FAILED");
    expect((thrown as WrapsError).message).toContain("is a symlink");
    expect(readFileSync(join(dir, "victim.txt"), "utf8")).toBe("untouched");
    expect(existsSync(join(dir, "wraps-deployer-1.json"))).toBe(false);
  });

  it("fails with a suggestion when the folder is a file", () => {
    const file = join(tempDir(), "not-a-dir");
    writeFileSync(file, "x");
    let thrown: unknown;
    try {
      writePolicyDir(file, parts(1));
    } catch (err) {
      thrown = err;
    }
    expect((thrown as WrapsError).code).toBe("INVALID_FLAG_USAGE");
    expect((thrown as WrapsError).message).toBe(
      `--policy-dir ${file} is a file, not a directory`
    );
    expect((thrown as WrapsError).suggestion).toBe(
      "Pass a directory: wraps permissions --policy-dir ./wraps-policy"
    );
    expect(readFileSync(file, "utf8")).toBe("x");
  });
});

describe("writePolicyDir: failures after the writes", () => {
  it("a failed mkdir throws POLICY_DIR_WRITE_FAILED", () => {
    const file = join(tempDir(), "a-file");
    writeFileSync(file, "x");
    const thrown = catchError(() =>
      writePolicyDir(join(file, "sub"), parts(1))
    );
    expect(thrown).toBeInstanceOf(WrapsError);
    expect(thrown.code).toBe("POLICY_DIR_WRITE_FAILED");
    expect(thrown.message).toMatch(
      new RegExp(`^Could not create ${join(file, "sub")}: ENOTDIR`)
    );
    expect(readFileSync(file, "utf8")).toBe("x");
  });

  it("an unlink failing partway names the file and the ones already removed", () => {
    const dir = tempDir();
    writePolicyDir(dir, parts(4));
    failures.unlink = join(dir, "wraps-deployer-3.json");

    const thrown = catchError(() => writePolicyDir(dir, parts(1)));

    expect(thrown.code).toBe("POLICY_DIR_WRITE_FAILED");
    expect(thrown.message).toBe(
      `Wrote the new policies but could not remove the stale ${join(dir, "wraps-deployer-3.json")}: EACCES: permission denied, unlink '${join(dir, "wraps-deployer-3.json")}'. Already removed in this run: ${join(dir, "wraps-deployer-2.json")}.`
    );
    expect(thrown.suggestion).toBe(
      "Delete it yourself, and don't create an IAM policy from it. Detach and delete the IAM policies named after every stale file listed here."
    );
    expect(existsSync(join(dir, "wraps-deployer-2.json"))).toBe(false);
    expect(existsSync(join(dir, "wraps-deployer-3.json"))).toBe(true);
    // Stopped at the failure: -4 is left for the next run.
    expect(existsSync(join(dir, "wraps-deployer-4.json"))).toBe(true);
  });

  it("an unlink failing first says nothing was removed yet", () => {
    const dir = tempDir();
    writePolicyDir(dir, parts(2));
    failures.unlink = join(dir, "wraps-deployer-2.json");
    const thrown = catchError(() => writePolicyDir(dir, parts(1)));
    expect(thrown.code).toBe("POLICY_DIR_WRITE_FAILED");
    expect(thrown.message).not.toContain("Already removed");
  });

  it("a failed listing of the folder throws POLICY_DIR_WRITE_FAILED after the writes", () => {
    const dir = tempDir();
    writePolicyDir(dir, parts(3));
    failures.readdir = dir;

    const thrown = catchError(() => writePolicyDir(dir, parts(2)));

    expect(thrown).toBeInstanceOf(WrapsError);
    expect(thrown.code).toBe("POLICY_DIR_WRITE_FAILED");
    expect(thrown.message).toBe(
      `Wrote the new policies but could not list ${dir} to remove stale files: EACCES: permission denied, scandir '${dir}'`
    );
    expect(thrown.suggestion).toBe(
      "Delete any wraps-deployer-<n>.json numbered above 2 in that folder yourself, and don't create IAM policies from them."
    );
    expect(existsSync(join(dir, "wraps-deployer-3.json"))).toBe(true);
  });
});
