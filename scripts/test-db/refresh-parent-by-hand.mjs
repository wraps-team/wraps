#!/usr/bin/env node
// `pnpm test-db:refresh`: refresh the wraps-test parent by hand through the
// same guard CI uses (`refreshParent` in ci-branch.mjs: the pinned project
// confirmed by the Neon API, no prod or dev endpoint, TEST_DATABASE_URL on
// the default branch, a backup-* snapshot before the push, the advisory
// lock), then drop this checkout's own wt-* branch so it re-cuts from the
// refreshed parent.
//
//   pnpm test-db:refresh                 from a checkout of main
//   pnpm test-db:refresh --dry-run       check the target, push nothing
//   pnpm test-db:refresh --from-branch   a PR that really renames something:
//                                        HEAD need not BE origin/main, but
//                                        must contain it (rebased on main)
//
// Reads NEON_API_KEY, NEON_PROJECT_ID and DATABASE_URL (the parent) from
// apps/web/.env.test. Names the snapshot backup-<HEAD sha7>-<epoch seconds>,
// the shape CI's GITHUB_SHA and GITHUB_RUN_ID give it, so the 7-day expiry
// applies. drizzle-kit runs without --force: at a terminal you answer its
// prompts.
//
// Every line refreshParent logs passes through terminalLog, which masks the
// .env.test values and every ::add-mask:: value as ***, as a GitHub runner
// would. drizzle-kit's own output goes straight to the terminal unfiltered,
// as it did under the old db:push:test.

import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseEnv } from "node:util";
import { refreshParent } from "./ci-branch.mjs";

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");
const ENV_TEST = "apps/web/.env.test";
const REQUIRED_KEYS = ["NEON_API_KEY", "NEON_PROJECT_ID", "DATABASE_URL"];
// Uncommitted edits here would reach the parent although HEAD is main.
const SCHEMA_PATHS = ["packages/db/src", "packages/db/drizzle.config.ts"];
const WORKFLOW_PREFIX = /^::(error|warning|notice)::/;
const USAGE =
  "Usage: pnpm test-db:refresh [--dry-run] [--from-branch]\n  --dry-run      check the target and name the snapshot, push nothing\n  --from-branch  push this branch's schema, not main's: only for a PR that really renames a column or table (docs/agents/ci-and-deploy.md)\n";

/**
 * @typedef {object} HandIo
 * @property {(args: string[]) => string} [git] runs git in the repo root,
 *   returns stdout
 * @property {() => string} [readEnvTest] apps/web/.env.test's text
 * @property {() => Date} [now]
 * @property {(line: string) => void} [out]
 * @property {(line: string) => void} [err]
 * @property {typeof refreshParent} [refreshImpl]
 * @property {() => Promise<number>} [reapImpl] reap-branches.mjs --self
 * @property {object} [refreshIo] extra io for refreshParent (tests only)
 */

/**
 * @param {string[]} argv
 * @returns {{dryRun: boolean, fromBranch: boolean} | {error: string}}
 */
export function parseArgs(argv) {
  let dryRun = false;
  let fromBranch = false;
  for (const arg of argv) {
    if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--from-branch") {
      fromBranch = true;
    } else {
      return { error: `unknown argument "${arg}"` };
    }
  }
  return { dryRun, fromBranch };
}

/**
 * refreshParent's env from .env.test's text: TEST_DATABASE_URL is the file's
 * DATABASE_URL; GITHUB_SHA and GITHUB_RUN_ID name the snapshot. Nothing comes
 * from the shell, so a stray NEON_API_KEY there cannot pick the project.
 *
 * @param {string} envText
 * @param {{sha: string, runId: string}} snapshot
 * @returns {{env: Record<string, string>} | {missing: string[]}}
 */
export function handEnv(envText, snapshot) {
  const file = parseEnv(envText);
  const missing = REQUIRED_KEYS.filter((k) => !file[k]);
  if (missing.length > 0) {
    return { missing };
  }
  return {
    env: {
      NEON_API_KEY: file.NEON_API_KEY,
      NEON_PROJECT_ID: file.NEON_PROJECT_ID,
      TEST_DATABASE_URL: file.DATABASE_URL,
      GITHUB_SHA: snapshot.sha,
      GITHUB_RUN_ID: snapshot.runId,
    },
  };
}

/**
 * Why this checkout must not refresh the parent, or null. Fetches main, then
 * requires HEAD to be origin/main, or with `fromBranch` to contain it (a PR
 * rebased on main: otherwise its schema would drop main's newer columns from
 * the parent), and no uncommitted schema edits. Makes no Neon call.
 *
 * @param {(args: string[]) => string} git
 * @param {{fromBranch: boolean}} flags
 * @returns {{problem: string} | {sha: string}}
 */
export function checkoutProblem(git, { fromBranch }) {
  let head;
  try {
    head = git(["rev-parse", "HEAD"]).trim();
  } catch {
    return { problem: "not inside a git checkout" };
  }
  let main;
  try {
    git(["fetch", "--quiet", "origin", "main"]);
    main = git(["rev-parse", "origin/main"]).trim();
  } catch {
    return {
      problem:
        "could not fetch origin/main, so cannot check this checkout against it",
    };
  }
  if (fromBranch) {
    try {
      git(["merge-base", "--is-ancestor", "origin/main", "HEAD"]);
    } catch {
      return {
        problem: `HEAD (${head.slice(0, 7)}) does not contain origin/main (${main.slice(0, 7)}): rebase on origin/main first, or this branch's schema would drop main's newer columns and tables from the parent`,
      };
    }
  } else if (head !== main) {
    return {
      problem: `HEAD (${head.slice(0, 7)}) is not origin/main (${main.slice(0, 7)}). Every ci-* and wt-* branch is cut from the parent, so only main's schema may reach it: check out main, pull, and re-run. A PR that really renames a column or table uses --from-branch (docs/agents/ci-and-deploy.md)`,
    };
  }
  let dirty;
  try {
    dirty = git(["status", "--porcelain", "--", ...SCHEMA_PATHS]).trim();
  } catch {
    return { problem: "could not read git status" };
  }
  if (dirty) {
    return {
      problem: `uncommitted changes under ${SCHEMA_PATHS.join(" or ")} would reach the parent: commit or stash them first`,
    };
  }
  return { sha: head };
}

/**
 * The values to mask from the start: the env's secrets, and the URL's host
 * (direct and pooled) and password (raw and decoded).
 *
 * @param {Record<string, string>} env handEnv's env
 * @returns {string[]}
 */
export function secretsOf(env) {
  const values = [env.NEON_API_KEY, env.NEON_PROJECT_ID, env.TEST_DATABASE_URL];
  try {
    const url = new URL(env.TEST_DATABASE_URL);
    values.push(url.hostname, url.hostname.replace("-pooler.", "."));
    if (url.password) {
      values.push(url.password, decodeURIComponent(url.password));
    }
  } catch {
    // Not a URL: refreshParent refuses it; the raw value is masked above.
  }
  return values;
}

/**
 * refreshParent's log, made fit for a terminal, emulating a GitHub runner:
 * an `::add-mask::` line prints nothing and masks its value as *** in every
 * later line, as do the `seeds` from the start. Strips the workflow-command
 * prefix from errors and warnings, which go to `err`.
 *
 * @param {(line: string) => void} out
 * @param {(line: string) => void} err
 * @param {string[]} [seeds]
 * @returns {(line: string) => void}
 */
export function terminalLog(out, err, seeds = []) {
  const secrets = new Set();
  const learn = (value) => {
    if (value) {
      secrets.add(value);
    }
  };
  for (const seed of seeds) {
    learn(seed);
  }
  const mask = (line) => {
    let masked = line;
    // Longest first, so a URL is masked whole before its host or password.
    for (const secret of [...secrets].sort((a, b) => b.length - a.length)) {
      masked = masked.split(secret).join("***");
    }
    return masked;
  };
  return (line) => {
    if (line.startsWith("::add-mask::")) {
      learn(line.slice("::add-mask::".length));
      return;
    }
    if (WORKFLOW_PREFIX.test(line)) {
      err(mask(line.replace(WORKFLOW_PREFIX, "")));
      return;
    }
    out(mask(line));
  };
}

function gitDefault(args) {
  return execFileSync("git", args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function reapDefault() {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [path.join(REPO_ROOT, "scripts/test-db/reap-branches.mjs"), "--self"],
      { cwd: REPO_ROOT, stdio: "inherit" }
    );
    child.on("error", () => resolve(1));
    child.on("close", (code) => resolve(code ?? 1));
  });
}

/**
 * @param {string[]} argv
 * @param {Record<string, string | undefined>} processEnv
 * @param {HandIo} [io]
 * @returns {Promise<number>} the exit code
 */
export async function run(argv, processEnv, io = {}) {
  const out = io.out ?? ((l) => process.stdout.write(`${l}\n`));
  const err = io.err ?? ((l) => process.stderr.write(`${l}\n`));
  const refuse = (message) => {
    err(`[test-db:refresh] refusing: ${message}`);
    return 1;
  };

  const flags = parseArgs(argv);
  if ("error" in flags) {
    err(`[test-db:refresh] ${flags.error}`);
    err(USAGE);
    return 2;
  }
  if (processEnv.GITHUB_ACTIONS === "true") {
    return refuse(
      "CI refreshes the parent with `node scripts/test-db/ci-branch.mjs refresh-parent`"
    );
  }

  const checkout = checkoutProblem(io.git ?? gitDefault, flags);
  if ("problem" in checkout) {
    return refuse(checkout.problem);
  }

  let envText;
  try {
    envText = (
      io.readEnvTest ??
      (() => readFileSync(path.join(REPO_ROOT, ENV_TEST), "utf8"))
    )();
  } catch {
    return refuse(`could not read ${ENV_TEST}`);
  }
  const now = io.now ?? (() => new Date());
  const built = handEnv(envText, {
    sha: checkout.sha,
    runId: String(Math.floor(now().getTime() / 1000)),
  });
  if ("missing" in built) {
    return refuse(`${ENV_TEST} has no ${built.missing.join(", ")}`);
  }

  if (flags.fromBranch) {
    err(
      `[test-db:refresh] warning: --from-branch pushes ${checkout.sha.slice(0, 7)}'s schema, not main's. The parent stays ahead of main until this PR merges, so merge it straight away`
    );
  }

  const refresh = io.refreshImpl ?? refreshParent;
  const result = await refresh(built.env, {
    ...io.refreshIo,
    log: terminalLog(out, err, secretsOf(built.env)),
    dryRun: flags.dryRun,
    byHand: true,
  });
  if (result.exitCode !== 0 || flags.dryRun) {
    return result.exitCode;
  }
  // As before this script existed: drop this checkout's wt-* branch, cut
  // from the old parent, so the next test run re-cuts it.
  return await (io.reapImpl ?? reapDefault)();
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  process.exitCode = await run(process.argv.slice(2), process.env);
}
