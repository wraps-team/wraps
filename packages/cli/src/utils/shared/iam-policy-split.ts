/**
 * Split an IAM policy into managed policies that IAM accepts, and write them.
 *
 * IAM caps a customer-managed policy at 6,144 characters and doesn't count
 * whitespace ("IAM and AWS STS character limits",
 * https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_iam-quotas.html).
 * The full Wraps deployer policy is larger than that, so
 * `wraps permissions --policy-dir <dir>` writes it as
 * `wraps-deployer-1.json`, `wraps-deployer-2.json`, ... instead.
 *
 * @module utils/shared/iam-policy-split
 */

import {
  closeSync,
  constants,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { errors } from "./errors.js";

/** IAM's size cap for one customer-managed policy, whitespace not counted. */
export const MANAGED_POLICY_SIZE_LIMIT = 6144;

/** File and policy name prefix: `wraps-deployer-<n>`. */
export const POLICY_NAME_PREFIX = "wraps-deployer-";

/** Names `--policy-dir` owns. Anything else in the folder is never touched. */
const OWNED_FILE = /^wraps-deployer-([1-9][0-9]*)\.json$/;

type PolicyStatement = { Sid: string };

type PolicyDocument<S extends PolicyStatement> = {
  Version: string;
  Statement: S[];
};

/** One split part: the policy name and its document. */
export type NamedPolicy<S extends PolicyStatement> = {
  name: string;
  policy: PolicyDocument<S>;
};

/**
 * A policy's size as IAM counts it against the managed-policy cap: the JSON
 * with every whitespace character removed. This policy has no whitespace inside
 * its string values, so removing all of it matches IAM's count.
 */
export function policySize(doc: unknown): number {
  return JSON.stringify(doc).replace(/\s/g, "").length;
}

/**
 * Split a policy into parts of at most `limit` characters each (see
 * `policySize`).
 *
 * Next-fit: statements stay in input order, and a new part starts when the next
 * statement would push the current part over the limit. The whole candidate
 * document is measured each time, so the `Version` wrapper and the commas count.
 *
 * It doesn't deduplicate. IAM only requires a `Sid` to be unique within one
 * policy; Wraps keeps them unique across all parts so a `Sid` names one file.
 * A repeated `Sid` in the input is a bug in the caller, so it throws.
 *
 * Throws if a single statement, alone in a policy, is over the limit. Both
 * throws are `POLICY_SPLIT_FAILED` WrapsErrors: `wraps permissions` splits on
 * every run, so a bad statement must surface with a code, not as an
 * unhandled error.
 */
export function splitPolicy<S extends PolicyStatement>(
  policy: PolicyDocument<S>,
  limit: number = MANAGED_POLICY_SIZE_LIMIT
): NamedPolicy<S>[] {
  const seen = new Set<string>();
  for (const stmt of policy.Statement) {
    if (seen.has(stmt.Sid)) {
      throw errors.policySplitFailed(
        `Duplicate IAM statement Sid "${stmt.Sid}"`
      );
    }
    seen.add(stmt.Sid);
    const alone = policySize({ Version: policy.Version, Statement: [stmt] });
    if (alone > limit) {
      throw errors.policySplitFailed(
        `IAM statement "${stmt.Sid}" alone is ${alone} characters, over the ${limit}-character managed policy limit`
      );
    }
  }

  const docs: PolicyDocument<S>[] = [];
  let current: S[] = [];
  for (const stmt of policy.Statement) {
    const candidate = {
      Version: policy.Version,
      Statement: [...current, stmt],
    };
    if (current.length > 0 && policySize(candidate) > limit) {
      docs.push({ Version: policy.Version, Statement: current });
      current = [stmt];
    } else {
      current = candidate.Statement;
    }
  }
  if (current.length > 0) {
    docs.push({ Version: policy.Version, Statement: current });
  }

  return docs.map((doc, i) => ({
    name: `${POLICY_NAME_PREFIX}${i + 1}`,
    policy: doc,
  }));
}

/** What `writePolicyDir` did, as absolute paths. */
export type PolicyDirResult = {
  dir: string;
  written: string[];
  removed: string[];
};

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Create `dir` if missing; fail if it exists and isn't a directory. */
function ensureDirectory(dir: string, flagValue: string): void {
  let isDirectory: boolean | undefined;
  try {
    isDirectory = statSync(dir).isDirectory();
  } catch {
    // Missing (or unreadable): mkdir below creates it or reports why not.
  }
  if (isDirectory === false) {
    throw errors.invalidFlagUsage(
      `--policy-dir ${flagValue} is a file, not a directory`,
      "Pass a directory: wraps permissions --policy-dir ./wraps-policy"
    );
  }
  if (isDirectory === undefined) {
    try {
      mkdirSync(dir, { recursive: true });
    } catch (err) {
      throw errors.policyDirWriteFailed(
        `Could not create ${dir}: ${errorText(err)}`
      );
    }
  }
}

/** Write `text` to `path`, refusing to follow a symlink at `path`. */
function writeNoFollow(path: string, text: string): void {
  // O_NOFOLLOW is undefined on Windows; the lstat check before still applies.
  const flags =
    // biome-ignore lint/suspicious/noBitwiseOperators: open(2) flags are a bitmask
    constants.O_WRONLY |
    constants.O_CREAT |
    constants.O_TRUNC |
    (constants.O_NOFOLLOW ?? 0);
  const fd = openSync(path, flags, 0o644);
  try {
    writeSync(fd, text);
  } finally {
    closeSync(fd);
  }
}

/**
 * Write each part to `<dir>/wraps-deployer-<n>.json` as a bare IAM policy
 * (pretty-printed, newline-terminated), then remove stale
 * `wraps-deployer-<n>.json` files numbered above the new count.
 *
 * - Every write happens before any removal. If a write fails, nothing is
 *   removed and it throws; files written before the failure stay.
 * - A stale file is a regular file (never a symlink) whose name matches
 *   `wraps-deployer-<n>.json` exactly. Nothing else in the folder is touched.
 * - A symlink at a target path fails the run before anything is written.
 */
export function writePolicyDir<S extends PolicyStatement>(
  dirArg: string,
  parts: NamedPolicy<S>[]
): PolicyDirResult {
  const dir = resolve(dirArg);
  ensureDirectory(dir, dirArg);

  const targets = parts.map((part) => ({
    path: join(dir, `${part.name}.json`),
    text: `${JSON.stringify(part.policy, null, 2)}\n`,
  }));

  for (const { path } of targets) {
    let isLink = false;
    try {
      isLink = lstatSync(path).isSymbolicLink();
    } catch {
      // Doesn't exist yet.
    }
    if (isLink) {
      throw errors.policyDirWriteFailed(
        `${path} is a symlink; wraps permissions won't write through it`,
        "Remove the symlink or choose another --policy-dir, then re-run. Nothing was written."
      );
    }
  }

  const written: string[] = [];
  for (const { path, text } of targets) {
    try {
      writeNoFollow(path, text);
    } catch (err) {
      throw errors.policyDirWriteFailed(
        `Could not write ${path}: ${errorText(err)}`
      );
    }
    written.push(path);
  }

  const stale = findStaleFiles(dir, parts.length);

  const removed: string[] = [];
  for (const path of stale) {
    try {
      unlinkSync(path);
    } catch (err) {
      const already =
        removed.length > 0
          ? ` Already removed in this run: ${removed.join(", ")}.`
          : "";
      throw errors.policyDirWriteFailed(
        `Wrote the new policies but could not remove the stale ${path}: ${errorText(err)}.${already}`,
        "Delete it yourself, and don't create an IAM policy from it. Detach and delete the IAM policies named after every stale file listed here."
      );
    }
    removed.push(path);
  }

  return { dir, written, removed };
}

/**
 * Regular files in `dir` named `wraps-deployer-<n>.json` with n above
 * `count`, in numeric order. Runs after every write, so a failure here throws
 * POLICY_DIR_WRITE_FAILED saying the new files are already written.
 */
function findStaleFiles(dir: string, count: number): string[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch (err) {
    throw errors.policyDirWriteFailed(
      `Wrote the new policies but could not list ${dir} to remove stale files: ${errorText(err)}`,
      `Delete any wraps-deployer-<n>.json numbered above ${count} in that folder yourself, and don't create IAM policies from them.`
    );
  }

  const stale: string[] = [];
  const candidates = names
    .map((name) => ({ name, match: OWNED_FILE.exec(name) }))
    .filter(
      (e): e is { name: string; match: RegExpExecArray } =>
        e.match !== null && Number(e.match[1]) > count
    )
    .sort((a, b) => Number(a.match[1]) - Number(b.match[1]));
  for (const { name } of candidates) {
    const path = join(dir, name);
    let isFile: boolean;
    try {
      isFile = lstatSync(path).isFile();
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        continue; // Gone since readdir: nothing to remove.
      }
      throw errors.policyDirWriteFailed(
        `Wrote the new policies but could not check the stale ${path}: ${errorText(err)}`,
        "Delete it yourself if it's a stale policy file, and don't create an IAM policy from it."
      );
    }
    if (isFile) {
      stale.push(path);
    }
  }
  return stale;
}
