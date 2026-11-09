#!/usr/bin/env node
// Gives each CI workflow run its own Neon test-database branch, so two PRs
// testing at once can't delete each other's fixtures on the shared database
// (FK 23503). See plans/031-per-pr-neon-test-branches.md.
//
//   node scripts/test-db/ci-branch.mjs ensure   find or create this run's branch
//   node scripts/test-db/ci-branch.mjs push     drizzle-kit push to that branch
//   node scripts/test-db/ci-branch.mjs delete   delete it when the run ends
//   node scripts/test-db/ci-branch.mjs push-worktree
//       push this checkout's schema to its own wt-* branch, never the parent;
//       without --force, so a human at a terminal answers any prompt
//   node scripts/test-db/ci-branch.mjs refresh-parent [--dry-run]
//       push main's schema to the project's default branch, the parent every
//       branch is cut from (refresh-test-parent.yml, on schema changes to main)
//       (`pnpm test-db:refresh` runs the same function by hand, through
//       refresh-parent-by-hand.mjs)
//
// The branch is `ci-<sha7>-<run_id>-<run_attempt>`. Every DB job of a run
// computes the same name and runs `ensure` itself, so the jobs converge on one
// branch with no job outputs. That also holds for "re-run failed jobs": the
// new attempt has a new name, and whichever re-run job comes first creates it.
// Neon deletes the branch on its own 3h after creation (`expires_at`), which
// covers any run whose cleanup never ran.
//
// `ensure` runs before `pnpm install`, so it uses Node built-ins and fetch
// only. It never fails the job: with no Neon secrets (Dependabot) or on any
// Neon error it writes nothing, and the tests fall back to TEST_DATABASE_URL.
// A Neon outage must not block a production deploy, which waits on a green
// Test run.
//
// Never prints a connection string, password or key.

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseEnv } from "node:util";
import {
  branchNameForWorktree,
  checkoutRootName,
  expiresAtFrom,
  extendBranchExpiry,
  fetchConnectionUri,
  findOrCreateBranch,
  listBranches,
  NEON_API_BASE,
  NeonApiError,
  neonFetch,
  pollUntilReady,
  WT_BRANCH_TTL_HOURS,
} from "./resolve-branch.mjs";

export const CI_BRANCH_PATTERN = /^ci-[0-9a-f]{7}-\d+-\d+$/;
const WT_BRANCH_PATTERN = /^wt-/;
export const CI_BRANCH_TTL_HOURS = 3;
const LEADING_SLASH = /^\//;
// A no-op push takes ~15s. Serialised jobs wait on each other, so a stuck
// push must die well inside the jobs' 30-minute timeout.
const PUSH_TIMEOUT_MS = 3 * 60_000;
const INTERACTIVE_PROMPT = /Interactive prompts require a TTY/;
const PUSH_SUCCEEDED = /Changes applied|No changes detected/;
const LOCK_TIMEOUT = "5min";
const CONNECT_TIMEOUT_MS = 30_000;
// drizzle-kit needs only DATABASE_URL.
const CHILD_ENV_STRIPPED = ["NEON_API_KEY", "TEST_DATABASE_URL"];
const PR_PROMPT_ADVICE =
  "This branch's schema and the wraps-test parent differ in a way drizzle-kit reads as a possible rename. One of four things: (1) the parent is behind main, because the latest Refresh test parent run failed: refresh it from current main (`pnpm test-db:refresh` on main, or re-run that workflow); (2) the parent is ahead of main, because someone pushed an unmerged schema to it: refresh it from current main the same way; (3) this run's commit is older than a schema change already on main and the parent: rebase on main, or re-run on a newer commit; (4) this PR really renames a column or table: from this PR rebased on main, run `pnpm test-db:refresh --from-branch` at a terminal and answer the prompt, then merge the PR straight away, since until then the parent is ahead of every other run";
const PARENT_PROMPT_ADVICE =
  "A rename landed on main. Refresh the parent once by hand from a checkout of main (`pnpm test-db:refresh`) and answer the prompt; later refreshes see no diff";
const BY_HAND_PROMPT_ADVICE =
  "Run `pnpm test-db:refresh` from a terminal, on a checkout of main, and answer it";
// Endpoint host prefixes of the prod and dev databases in the old shared
// project. The test project must hold neither (plan 031, P1).
const FORBIDDEN_HOST_PREFIXES = ["ep-damp-heart", "ep-autumn-block"];
// sha256 (hex) of the wraps-test project's id, the only project
// `refresh-parent` may push to. A hash, because this repo is public. If the
// project is ever recreated, recompute it from the new id (1Password:
// op://Agents/Neon wraps-test API Key/project_id) with no trailing newline:
//   printf %s "$NEON_PROJECT_ID" | sha256sum
export const TEST_PROJECT_ID_SHA256 =
  "d4a06438a4e9133e5d828ababb097beb2d866a815702122b47d7de6b93773a84";
const BACKUP_TTL_HOURS = 7 * 24;
const SHA7 = /^[0-9a-f]{7}$/;
const DIGITS = /^\d+$/;
// Any constant works; it only has to be the same in every job of the run.
const PUSH_LOCK_KEY = 31_031;
// What a 404 means for each operation this script and the resolver make.
const NOT_FOUND_MEANS = {
  "list branches": "NEON_PROJECT_ID names no project this key can see",
  "list endpoints": "NEON_PROJECT_ID names no project this key can see",
  "get project": "NEON_PROJECT_ID names no project this key can see",
  "create branch": "the project or the parent branch is gone",
  connection_uri:
    "the branch, or TEST_DATABASE_URL's role or database, does not exist on it",
  "extend branch expiry": "the branch is gone",
  "delete branch": "the branch is gone",
};
const REPO_ROOT = path.resolve(import.meta.dirname, "../..");
const FALLBACK =
  "tests use TEST_DATABASE_URL, the shared database, where concurrent runs can collide";

/**
 * @typedef {object} CiIo
 * @property {typeof fetch} [fetchImpl]
 * @property {(ms: number) => Promise<void>} [sleepImpl]
 * @property {(line: string) => void} [log] stdout: workflow commands go here
 * @property {(file: string, text: string) => void} [appendFile]
 * @property {() => Date} [now]
 * @property {typeof spawn} [spawnImpl]
 * @property {(url: string) => Promise<PgClient>} [connectPg]
 * @property {(pid: number, signal: string) => void} [killImpl]
 * @property {number} [pushTimeoutMs]
 * @property {number} [connectTimeoutMs]
 * @property {string} [testProjectIdSha256] tests only: replaces
 *   TEST_PROJECT_ID_SHA256 so a fake project id can pass the identity check
 */

/**
 * @typedef {object} PgClient
 * @property {(sql: string, params?: unknown[]) => Promise<unknown>} query
 * @property {() => Promise<void>} end
 */

/** @param {CiIo} io */
function logger(io) {
  return io.log ?? ((line) => process.stdout.write(`${line}\n`));
}

/**
 * The run's branch name. Throws when the GitHub context is missing or odd,
 * rather than inventing a name the delete guard would later refuse.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {string}
 */
export function ciBranchName(env) {
  const sha = (env.GITHUB_SHA ?? "").toLowerCase();
  const name = `ci-${sha.slice(0, 7)}-${env.GITHUB_RUN_ID ?? ""}-${
    env.GITHUB_RUN_ATTEMPT ?? ""
  }`;
  if (!CI_BRANCH_PATTERN.test(name)) {
    throw new Error(
      "GITHUB_SHA, GITHUB_RUN_ID and GITHUB_RUN_ATTEMPT must be set to build the ci-<sha7>-<run_id>-<run_attempt> name"
    );
  }
  return name;
}

/**
 * One message per failure kind (CODING_STANDARDS.md "Error handling"). Never
 * echoes a host or URL: the parent-endpoint error names the host locally, so
 * it is matched by code and rephrased here.
 *
 * @param {unknown} err
 * @returns {string}
 */
export function describeNeonError(err) {
  if (err instanceof NeonApiError) {
    const what = err.operation;
    const neonSays = err.detail ? `. Neon says: ${err.detail}` : "";
    switch (err.status) {
      case 401:
      case 403:
        return `Neon refused the API key on ${what} (${err.status}): NEON_API_KEY is wrong, revoked, or not scoped to NEON_PROJECT_ID${neonSays}`;
      case 404:
        return `Neon found nothing on ${what} (404): ${NOT_FOUND_MEANS[what] ?? "the resource is gone"}${neonSays}`;
      case 409:
        return `Neon reported a conflict on ${what} (409)${neonSays}`;
      case 422:
        return `Neon rejected the ${what} request (422)${
          what === "create branch"
            ? "; its body carries expires_at, and the create is not retried without it"
            : ""
        }${neonSays}`;
      case 423:
        return `the Neon project stayed locked by other operations on ${what} (423) past the retry window${neonSays}`;
      default:
        return `Neon ${what} failed (${err.status})${neonSays}`;
    }
  }
  if (err && typeof err === "object" && err.code === "NO_PARENT_ENDPOINT") {
    return "TEST_DATABASE_URL's host matches no compute endpoint in NEON_PROJECT_ID: the secrets point at different projects";
  }
  if (err instanceof Error && err.name === "TimeoutError") {
    return "a Neon request got no answer within 30s";
  }
  return `Neon request failed: ${err instanceof Error ? err.message : String(err)}`;
}

/**
 * Masks a connection URI, its endpoint host, and its password raw and
 * URL-encoded, so none shows in any later log line of the job.
 *
 * @param {(line: string) => void} log
 * @param {string} uri
 */
function maskUri(log, uri) {
  log(`::add-mask::${uri}`);
  const parsed = new URL(uri);
  log(`::add-mask::${parsed.hostname}`);
  const encoded = parsed.password;
  if (!encoded) {
    return;
  }
  log(`::add-mask::${encoded}`);
  const decoded = decodeURIComponent(encoded);
  if (decoded !== encoded) {
    log(`::add-mask::${decoded}`);
  }
}

/**
 * A sibling job (or an earlier `ensure`) made the branch: give it the full 3h
 * from now. Failing that only costs TTL headroom, so it only warns.
 *
 * @param {import("./resolve-branch.mjs").ResolverOpts} opts
 * @param {(line: string) => void} log
 * @param {{apiKey: string, projectId: string, branchId: string, branchName: string, expiresAt: string}} target
 */
async function extendOnReuse(opts, log, target) {
  try {
    await extendBranchExpiry(opts, target);
  } catch (err) {
    log(
      `::warning::[ci-branch] reusing ${target.branchName}, but could not extend its expiry: ${describeNeonError(err)}`
    );
  }
}

/**
 * The branch's direct URI, and the URI the tests get: pooled when
 * TEST_DATABASE_URL is pooled, else the direct one.
 *
 * @param {import("./resolve-branch.mjs").ResolverOpts} opts
 * @param {{apiKey: string, projectId: string, branchId: string, parsedBase: URL, pooled: boolean}} args
 * @returns {Promise<{testUri: string, directUri: string}>}
 */
async function branchUris(opts, args) {
  const { apiKey, projectId, branchId, parsedBase, pooled } = args;
  const conn = {
    apiKey,
    projectId,
    branchId,
    database: parsedBase.pathname.replace(LEADING_SLASH, ""),
    role: decodeURIComponent(parsedBase.username),
  };
  const directUri = await fetchConnectionUri(opts, { ...conn, pooled: false });
  const testUri = pooled
    ? await fetchConnectionUri(opts, { ...conn, pooled: true })
    : directUri;
  return { testUri, directUri };
}

/**
 * Finds or creates this run's branch and appends CI_DATABASE_URL (same pooling
 * as TEST_DATABASE_URL), CI_DATABASE_DIRECT_URL and CI_DB_BRANCH to
 * $GITHUB_ENV. Always resolves; on any problem it warns and writes nothing.
 *
 * @param {Record<string, string | undefined>} env
 * @param {CiIo} [io]
 * @returns {Promise<{status: "ready" | "skipped" | "fallback", branchName?: string}>}
 */
export async function ensure(env, io = {}) {
  const log = logger(io);
  const appendFile = io.appendFile ?? appendFileSync;
  const now = io.now ?? (() => new Date());

  if (!(env.NEON_API_KEY && env.NEON_PROJECT_ID)) {
    log(
      `::notice::[ci-branch] NEON_API_KEY/NEON_PROJECT_ID not available (Dependabot or a fork), so ${FALLBACK}`
    );
    return { status: "skipped" };
  }

  const warn = (reason) => {
    log(`::warning::[ci-branch] ${reason}, so ${FALLBACK}`);
    return /** @type {const} */ ({ status: "fallback" });
  };

  if (!env.TEST_DATABASE_URL) {
    return warn(
      "TEST_DATABASE_URL is not set, so there is no parent to branch from"
    );
  }
  if (!env.GITHUB_ENV) {
    return warn("GITHUB_ENV is not set, so the URL has nowhere to go");
  }

  let branchName;
  let parsedBase;
  try {
    branchName = ciBranchName(env);
    parsedBase = new URL(env.TEST_DATABASE_URL);
  } catch (err) {
    return warn(err instanceof Error ? err.message : String(err));
  }

  const apiKey = env.NEON_API_KEY;
  const projectId = env.NEON_PROJECT_ID;
  const opts = { fetchImpl: io.fetchImpl, sleepImpl: io.sleepImpl };
  const expiresAt = expiresAtFrom(now(), CI_BRANCH_TTL_HOURS);

  try {
    const found = await findOrCreateBranch(opts, {
      apiKey,
      projectId,
      branchName,
      parsedBase,
      expiresAt,
    });
    if (!found.createdHere) {
      await extendOnReuse(opts, log, {
        apiKey,
        projectId,
        branchId: found.id,
        branchName,
        expiresAt,
      });
    }
    const branch = await pollUntilReady(opts, apiKey, projectId, found.id);

    const pooled = parsedBase.hostname.includes("-pooler.");
    const { testUri, directUri } = await branchUris(opts, {
      apiKey,
      projectId,
      branchId: branch.id,
      parsedBase,
      pooled,
    });

    // Mask before anything else can print them.
    maskUri(log, testUri);
    if (testUri !== directUri) {
      maskUri(log, directUri);
    }

    appendFile(
      env.GITHUB_ENV,
      `CI_DATABASE_URL=${testUri}\nCI_DATABASE_DIRECT_URL=${directUri}\nCI_DB_BRANCH=${branchName}\n`
    );

    log(
      `[ci-branch] tests use Neon branch ${branchName} (${
        pooled ? "pooled" : "direct"
      }), expiring ${branch.expires_at ?? expiresAt}`
    );
    return { status: "ready", branchName };
  } catch (err) {
    return warn(describeNeonError(err));
  }
}

/**
 * Deletes this run's branch. Refuses any name outside CI_BRANCH_PATTERN and
 * resolves the target only by that exact name. A branch that is already gone
 * counts as success.
 *
 * @param {Record<string, string | undefined>} env
 * @param {CiIo & {branchName?: string}} [io] `branchName` defaults to the
 *   name this run computes
 * @returns {Promise<{exitCode: number, status: "deleted" | "absent" | "skipped" | "refused" | "failed"}>}
 */
export async function deleteCiBranch(env, io = {}) {
  const log = logger(io);

  let branchName = io.branchName;
  if (branchName === undefined) {
    try {
      branchName = ciBranchName(env);
    } catch (err) {
      log(
        `::warning::[ci-branch] delete skipped: ${err instanceof Error ? err.message : String(err)}`
      );
      return { exitCode: 1, status: "refused" };
    }
  }
  if (!CI_BRANCH_PATTERN.test(branchName)) {
    log(
      `::warning::[ci-branch] refusing to delete "${branchName}": only ci-<sha7>-<run_id>-<run_attempt> branches may be deleted here`
    );
    return { exitCode: 1, status: "refused" };
  }

  if (!(env.NEON_API_KEY && env.NEON_PROJECT_ID)) {
    log(
      "[ci-branch] NEON_API_KEY/NEON_PROJECT_ID not available, so this run made no branch to delete"
    );
    return { exitCode: 0, status: "skipped" };
  }

  const apiKey = env.NEON_API_KEY;
  const projectId = env.NEON_PROJECT_ID;
  const opts = { fetchImpl: io.fetchImpl };

  try {
    const { found, deleted } = await deleteAllNamed(opts, {
      apiKey,
      projectId,
      branchName,
    });
    if (found === 0) {
      log(`[ci-branch] ${branchName} does not exist, nothing to delete`);
      return { exitCode: 0, status: "absent" };
    }
    if (deleted === 0) {
      log(`[ci-branch] ${branchName} was already deleted`);
      return { exitCode: 0, status: "absent" };
    }
    const count = found > 1 ? ` (${found} branches by that name)` : "";
    log(`[ci-branch] deleted ${branchName}${count}`);
    return { exitCode: 0, status: "deleted" };
  } catch (err) {
    log(
      `::warning::[ci-branch] could not delete ${branchName}: ${describeNeonError(err)}. Neon still deletes it at its expires_at`
    );
    return { exitCode: 1, status: "failed" };
  }
}

/**
 * Deletes every branch named exactly `branchName`: Neon names need not be
 * unique. A 404 means it went in the meantime.
 *
 * @param {import("./resolve-branch.mjs").ResolverOpts} opts
 * @param {{apiKey: string, projectId: string, branchName: string}} target
 * @returns {Promise<{found: number, deleted: number}>}
 */
async function deleteAllNamed(opts, target) {
  const { apiKey, projectId, branchName } = target;
  const matches = (await listBranches(opts, apiKey, projectId)).filter(
    (b) => b.name === branchName
  );
  let deleted = 0;
  for (const branch of matches) {
    const res = await neonFetch(
      opts,
      apiKey,
      `${NEON_API_BASE}/projects/${projectId}/branches/${branch.id}`,
      { method: "DELETE" }
    );
    if (!(res.ok || res.status === 404)) {
      throw await NeonApiError.fromResponse("delete branch", res);
    }
    deleted += res.ok ? 1 : 0;
  }
  return { found: matches.length, deleted };
}

/**
 * drizzle-kit's environment: this process's, minus the Neon secrets it has
 * no use for, with DATABASE_URL set to the target. drizzle.config.ts loads
 * .env.local with dotenv, which never overrides a set variable, so this URL
 * is the one it uses.
 *
 * @param {string} directUrl
 * @returns {NodeJS.ProcessEnv}
 */
function drizzleEnv(directUrl) {
  const env = { ...process.env, DATABASE_URL: directUrl };
  for (const secret of CHILD_ENV_STRIPPED) {
    delete env[secret];
  }
  return env;
}

/**
 * Runs `drizzle-kit push` against `directUrl`.
 *
 * Default (CI): `--force`, no TTY, output piped through and returned, since
 * drizzle-kit can fail with exit code 0. It runs in its own process group so
 * the timeout kills drizzle-kit itself, not just the pnpm wrapping it.
 *
 * `interactive` (a human at a terminal): stdio inherited so drizzle-kit's
 * prompts reach them, in the foreground group, with no timeout. The output is
 * not captured; the exit code is all there is.
 *
 * @param {CiIo} io
 * @param {string} directUrl
 * @param {{force?: boolean, interactive?: boolean}} [mode]
 * @returns {Promise<{code: number, output: string}>}
 */
function runDrizzlePush(io, directUrl, mode = {}) {
  const { force = true, interactive = false } = mode;
  const log = logger(io);
  const spawnImpl = io.spawnImpl ?? spawn;
  const killImpl = io.killImpl ?? process.kill.bind(process);
  const timeoutMs = io.pushTimeoutMs ?? PUSH_TIMEOUT_MS;
  const args = ["--filter", "@wraps/db", "exec", "drizzle-kit", "push"];
  if (force) {
    args.push("--force");
  }

  return new Promise((resolve) => {
    const child = spawnImpl("pnpm", args, {
      cwd: REPO_ROOT,
      env: drizzleEnv(directUrl),
      // Without a TTY a rename prompt --force can't answer fails at once
      // rather than waiting for input.
      stdio: interactive ? "inherit" : ["ignore", "pipe", "pipe"],
      detached: !interactive,
    });
    let output = "";
    const collect = (stream, sink) => {
      stream?.on("data", (chunk) => {
        output += String(chunk);
        sink.write(chunk);
      });
    };
    collect(child.stdout, process.stdout);
    collect(child.stderr, process.stderr);

    const timer = interactive
      ? undefined
      : setTimeout(() => {
          log(
            `::error::[ci-branch] drizzle-kit push still running after ${timeoutMs / 1000}s, killing its process group`
          );
          try {
            killImpl(-child.pid, "SIGKILL");
          } catch {
            child.kill("SIGKILL");
          }
        }, timeoutMs);
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ code: 1, output: `${output}\n${err.message}` });
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      resolve({ code: exitCode ?? 1, output });
    });
  });
}

/**
 * Why a drizzle-kit push failed, or null if it succeeded. drizzle-kit 0.31
 * exits 0 when a rename prompt meets a non-TTY, so the exit code alone is
 * not enough: success also needs its "applied" or "no changes" line.
 *
 * @param {number} code
 * @param {string} output
 * @param {string} [promptAdvice] what to do about a rename prompt
 * @returns {string | null}
 */
export function pushFailure(code, output, promptAdvice = PR_PROMPT_ADVICE) {
  if (INTERACTIVE_PROMPT.test(output)) {
    return `drizzle-kit asked whether a column or table was renamed, which --force does not answer. ${promptAdvice}`;
  }
  if (code !== 0) {
    return `exit ${code}`;
  }
  if (!PUSH_SUCCEEDED.test(output)) {
    return "it exited 0 without reporting changes applied or no changes";
  }
  return null;
}

/** @param {string} url @returns {Promise<PgClient>} */
async function connectPgDefault(url) {
  // Imported here, not at the top: `ensure` and `delete` run before
  // `pnpm install`, when pg is not there yet.
  const { default: pg } = await import("pg");
  const client = new pg.Client({
    connectionString: url,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
  });
  // A dropped connection emits 'error'; unhandled, it would crash the step
  // with a stack trace instead of the message below.
  client.on("error", (err) => {
    process.stderr.write(
      `[ci-branch] database connection error: ${err.message}\n`
    );
  });
  await client.connect();
  return client;
}

/**
 * Whether this run's branch already carries the done-marker. Keyed on the
 * branch name: a branch inherits its parent's tables, so a bare "table
 * exists" check would make a marker that leaked into the parent skip every
 * run's push.
 *
 * @param {PgClient} client
 * @param {string} branchName
 * @returns {Promise<boolean>}
 */
async function alreadyPushed(client, branchName) {
  const table = await client.query(
    "SELECT to_regclass('ci_meta.schema_push') IS NOT NULL AS present"
  );
  if (!table?.rows?.[0]?.present) {
    return false;
  }
  try {
    const row = await client.query(
      "SELECT 1 FROM ci_meta.schema_push WHERE branch = $1",
      [branchName]
    );
    return (row?.rows?.length ?? 0) > 0;
  } catch {
    // A marker table of some other shape: treat as not pushed.
    return false;
  }
}

/**
 * Why taking the push lock failed, in words.
 *
 * @param {unknown} err
 * @returns {string}
 */
function lockFailureReason(err) {
  if (err && typeof err === "object" && err.code === "55P03") {
    return `another job held the push lock for over ${LOCK_TIMEOUT}`;
  }
  return err instanceof Error ? err.message : String(err);
}

/**
 * Rejects if `promise` has not settled within `ms`.
 *
 * @template T
 * @param {Promise<T>} promise
 * @param {number} ms
 * @param {string} what
 * @returns {Promise<T>}
 */
function withTimeout(promise, ms, what) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${what} took over ${ms / 1000}s`)),
      ms
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Takes the push advisory lock on `directUrl` (direct, not pooled: PgBouncer
 * would not keep a session lock), runs `body` while holding it, and always
 * releases it. The wait is bounded by `lock_timeout`.
 *
 * @template T
 * @param {string} directUrl
 * @param {CiIo} io
 * @param {string} label the target, for messages
 * @param {(client: PgClient) => Promise<T>} body
 * @returns {Promise<T | {exitCode: 1, status: "failed"}>}
 */
async function withPushLock(directUrl, io, label, body) {
  const log = logger(io);
  const connectPg = io.connectPg ?? connectPgDefault;

  let client;
  try {
    client = await withTimeout(
      connectPg(directUrl),
      io.connectTimeoutMs ?? CONNECT_TIMEOUT_MS,
      "connecting to the database"
    );
    await client.query(`SET lock_timeout = '${LOCK_TIMEOUT}'`);
    await client.query("SELECT pg_advisory_lock($1)", [PUSH_LOCK_KEY]);
  } catch (err) {
    log(
      `::error::[ci-branch] could not lock ${label} for the schema push: ${lockFailureReason(err)}`
    );
    await client?.end().catch(() => {
      // The connection may never have opened; nothing to close.
    });
    return { exitCode: 1, status: "failed" };
  }

  try {
    return await body(client);
  } finally {
    // Best effort: closing the session releases the lock regardless.
    await client
      .query("SELECT pg_advisory_unlock($1)", [PUSH_LOCK_KEY])
      .catch(() => {
        // Released by end() below.
      });
    await client.end().catch(() => {
      // The runner exits right after; the server drops the session.
    });
  }
}

/**
 * Runs the drizzle-kit push and reports the failure, if any, as an
 * `::error::`. Returns whether it succeeded.
 *
 * @param {CiIo} io
 * @param {string} directUrl
 * @param {{label: string, consequence: string, promptAdvice?: string, force?: boolean}} report
 *   the target's name, what a failure means, what to do about a rename
 *   prompt, and whether to pass --force (default true)
 * @returns {Promise<boolean>}
 */
async function checkedPush(io, directUrl, report) {
  const { label, consequence, promptAdvice = PR_PROMPT_ADVICE } = report;
  const log = logger(io);
  const { code, output } = await runDrizzlePush(io, directUrl, {
    force: report.force ?? true,
  });
  const failure = pushFailure(code, output, promptAdvice);
  if (failure) {
    log(
      `::error::[ci-branch] drizzle-kit push to ${label} failed: ${failure}. ${consequence}`
    );
    return false;
  }
  return true;
}

/**
 * Pushes packages/db's schema to this run's branch with
 * `drizzle-kit push --force`, once per run. Every DB job calls this; a session
 * advisory lock serialises them, and the first to succeed records this
 * branch in a marker table (`ci_meta.schema_push`) so the rest skip. Skips
 * (exit 0) when `ensure` fell back: the shared parent is never pushed to from
 * a test run.
 *
 * @param {Record<string, string | undefined>} env
 * @param {CiIo} [io]
 * @returns {Promise<{exitCode: number, status: "pushed" | "skipped" | "refused" | "failed"}>}
 */
export async function pushSchema(env, io = {}) {
  const log = logger(io);
  const directUrl = env.CI_DATABASE_DIRECT_URL;
  const branchName = env.CI_DB_BRANCH ?? "";
  if (!directUrl) {
    log(
      "[ci-branch] no per-run branch (ensure fell back or was skipped), so no schema push: the shared database is never pushed to from CI"
    );
    return { exitCode: 0, status: "skipped" };
  }
  if (!CI_BRANCH_PATTERN.test(branchName)) {
    log(
      `::error::[ci-branch] refusing to push: CI_DB_BRANCH "${branchName}" is not a ci-<sha7>-<run_id>-<run_attempt> branch`
    );
    return { exitCode: 1, status: "refused" };
  }

  return await withPushLock(directUrl, io, branchName, async (client) => {
    // A sibling job of this run already pushed: the branch is current, and a
    // second push would re-run drizzle's non-converging DDL (it drops and
    // re-adds a primary key every time) under another job's running tests.
    if (await alreadyPushed(client, branchName)) {
      log(
        `[ci-branch] a sibling job already pushed the schema to ${branchName}, skipping`
      );
      return { exitCode: 0, status: "skipped" };
    }
    const ok = await checkedPush(io, directUrl, {
      label: branchName,
      consequence: "The tests would run against a stale schema",
    });
    if (!ok) {
      return { exitCode: 1, status: "failed" };
    }
    await markPushed(client, branchName, log);
    log(`[ci-branch] schema pushed to ${branchName}`);
    return { exitCode: 0, status: "pushed" };
  });
}

/**
 * Records `branchName` as pushed. Only after a successful push, so a failed
 * one leaves the next job to retry. Outside `public`, so drizzle never sees
 * it.
 *
 * @param {PgClient} client
 * @param {string} branchName
 * @param {(line: string) => void} log
 */
async function markPushed(client, branchName, log) {
  try {
    await client.query("CREATE SCHEMA IF NOT EXISTS ci_meta");
    await client.query(
      "CREATE TABLE IF NOT EXISTS ci_meta.schema_push (branch text PRIMARY KEY, pushed_at timestamptz NOT NULL DEFAULT now())"
    );
    await client.query(
      "INSERT INTO ci_meta.schema_push (branch) VALUES ($1) ON CONFLICT DO NOTHING",
      [branchName]
    );
  } catch (err) {
    log(
      `::warning::[ci-branch] schema pushed, but the done-marker could not be written, so sibling jobs will push again: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * sha256 (hex) of a Neon project id, the form TEST_PROJECT_ID_SHA256 pins.
 *
 * @param {string} projectId
 * @returns {string}
 */
export function projectIdSha256(projectId) {
  return createHash("sha256").update(projectId).digest("hex");
}

/**
 * Why NEON_PROJECT_ID is not the pinned wraps-test project, or null. Pure
 * and network-free, so `refresh-parent` runs it before any Neon call. The
 * message names no id.
 *
 * @param {string} projectId NEON_PROJECT_ID
 * @param {string} [expectedSha256] TEST_PROJECT_ID_SHA256 unless a test
 *   passes its own
 * @returns {string | null}
 */
export function projectIdentityProblem(
  projectId,
  expectedSha256 = TEST_PROJECT_ID_SHA256
) {
  if (projectIdSha256(projectId) !== expectedSha256) {
    return "NEON_PROJECT_ID is not the wraps-test project: its sha256 does not match TEST_PROJECT_ID_SHA256 in scripts/test-db/ci-branch.mjs (check the value for stray whitespace or a trailing newline)";
  }
  return null;
}

/**
 * Checks what Neon returned for NEON_PROJECT_ID: that it is that project
 * (the key and the id agree), that it holds no prod or dev endpoint, and
 * that TEST_DATABASE_URL points at its one default branch. Returns why not,
 * or null. Branch names play no part: extra branches with endpoints (a
 * long-lived `dev`, say) are fine. Never names a host or an id.
 *
 * @param {object} target
 * @param {string} target.projectId NEON_PROJECT_ID
 * @param {{id?: string} | undefined} target.project Neon's `project` from
 *   GET /projects/{projectId}
 * @param {{id: string, name: string, default?: boolean}[]} target.branches
 * @param {{host: string, branch_id: string}[]} target.endpoints
 * @param {string} target.baseHost TEST_DATABASE_URL's host
 * @returns {string | null}
 */
export function parentTargetProblem({
  projectId,
  project,
  branches,
  endpoints,
  baseHost,
}) {
  if (project?.id !== projectId) {
    return "Neon answered for a different project than NEON_PROJECT_ID: NEON_API_KEY and NEON_PROJECT_ID do not belong together";
  }
  const defaults = branches.filter((b) => b.default === true);
  if (defaults.length !== 1) {
    return `the project has ${defaults.length} default branches, expected exactly 1`;
  }
  const parent = defaults[0];

  if (
    endpoints.some((e) =>
      FORBIDDEN_HOST_PREFIXES.some((p) => e.host.startsWith(p))
    )
  ) {
    return "the project has a prod or dev endpoint: NEON_PROJECT_ID is not the test-only project";
  }

  const strippedHost = baseHost.replace("-pooler.", ".");
  const baseEndpoint = endpoints.find((e) => e.host === strippedHost);
  if (!baseEndpoint) {
    return "TEST_DATABASE_URL's host matches no endpoint in NEON_PROJECT_ID";
  }
  if (baseEndpoint.branch_id !== parent.id) {
    return "TEST_DATABASE_URL points at a branch other than the project's default branch";
  }
  return null;
}

/**
 * Fetches the project itself, then lists its branches and endpoints.
 *
 * @param {import("./resolve-branch.mjs").ResolverOpts} opts
 * @param {string} apiKey
 * @param {string} projectId
 */
async function projectInventory(opts, apiKey, projectId) {
  const projectRes = await neonFetch(
    opts,
    apiKey,
    `${NEON_API_BASE}/projects/${projectId}`,
    { method: "GET" }
  );
  if (!projectRes.ok) {
    throw await NeonApiError.fromResponse("get project", projectRes);
  }
  const { project } = await projectRes.json();
  const branches = await listBranches(opts, apiKey, projectId);
  const res = await neonFetch(
    opts,
    apiKey,
    `${NEON_API_BASE}/projects/${projectId}/endpoints`,
    { method: "GET" }
  );
  if (!res.ok) {
    throw await NeonApiError.fromResponse("list endpoints", res);
  }
  const { endpoints = [] } = await res.json();
  return { project, branches, endpoints };
}

/**
 * `backup-<sha7>-<run_id>`, or null without the GitHub run context. A re-run
 * of the workflow finds the attempt-1 snapshot and keeps it: that is the
 * state before any attempt touched the parent.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {string | null}
 */
export function backupBranchName(env) {
  const sha = (env.GITHUB_SHA ?? "").toLowerCase().slice(0, 7);
  const runId = env.GITHUB_RUN_ID ?? "";
  if (!(SHA7.test(sha) && DIGITS.test(runId))) {
    return null;
  }
  return `backup-${sha}-${runId}`;
}

/**
 * Cuts a child of the parent (the branch TEST_DATABASE_URL names) with no
 * compute, and waits until it is ready. Same create-and-poll code as
 * `ensure`.
 *
 * @param {import("./resolve-branch.mjs").ResolverOpts} opts
 * @param {import("./resolve-branch.mjs").BranchTarget} target
 */
async function snapshotParent(opts, target) {
  const branch = await findOrCreateBranch(opts, {
    ...target,
    withEndpoint: false,
  });
  return await pollUntilReady(opts, target.apiKey, target.projectId, branch.id);
}

/**
 * Pushes the checked-out schema (main's, in refresh-test-parent.yml) to the
 * project's default branch, the parent every wt-* and ci-* branch is cut
 * from, under the same advisory lock and prompt detection as `push`.
 * Refuses unless NEON_PROJECT_ID is the pinned wraps-test project (its
 * sha256 is TEST_PROJECT_ID_SHA256, checked before any Neon call, and Neon
 * returns that same project for the key) and TEST_DATABASE_URL names its
 * default branch. Before pushing it snapshots the parent as
 * `backup-<sha7>-<run_id>` (7-day expiry); no snapshot, no push. No
 * fallback: it gates nothing, so it fails red. `dryRun` resolves and checks
 * the target, prints the planned snapshot name, and stops before the lock.
 *
 * `byHand` (`pnpm test-db:refresh`): the same checks, snapshot and lock, but
 * drizzle-kit runs WITHOUT --force, so a person answers its rename and
 * data-loss prompts. At a terminal (`interactive`, default: stdin and stdout
 * are TTYs) the prompts reach them; with no terminal the prompt detection
 * fails it red, as in CI.
 *
 * @param {Record<string, string | undefined>} env
 * @param {CiIo & {dryRun?: boolean, byHand?: boolean, interactive?: boolean}} [io]
 * @returns {Promise<{exitCode: number, status: "pushed" | "checked" | "refused" | "failed"}>}
 */
export async function refreshParent(env, io = {}) {
  const log = logger(io);
  const fail = (status, message) => {
    log(`::error::[ci-branch] refresh-parent: ${message}`);
    return { exitCode: 1, status };
  };
  if (!(env.NEON_API_KEY && env.NEON_PROJECT_ID && env.TEST_DATABASE_URL)) {
    return fail(
      "refused",
      "NEON_API_KEY, NEON_PROJECT_ID and TEST_DATABASE_URL must all be set"
    );
  }

  const backupName = backupBranchName(env);
  if (!backupName) {
    return fail(
      "refused",
      "GITHUB_SHA and GITHUB_RUN_ID must be set to name the snapshot (for a local dry run, use `pnpm test-db:refresh --dry-run`)"
    );
  }

  const apiKey = env.NEON_API_KEY;
  const projectId = env.NEON_PROJECT_ID;
  const identityProblem = projectIdentityProblem(
    projectId,
    io.testProjectIdSha256
  );
  if (identityProblem) {
    return fail("refused", `refusing to push: ${identityProblem}`);
  }
  const opts = { fetchImpl: io.fetchImpl };
  const now = io.now ?? (() => new Date());
  let parent;
  let directUri;
  let parsedBase;
  try {
    parsedBase = new URL(env.TEST_DATABASE_URL);
    const { project, branches, endpoints } = await projectInventory(
      opts,
      apiKey,
      projectId
    );
    const problem = parentTargetProblem({
      projectId,
      project,
      branches,
      endpoints,
      baseHost: parsedBase.hostname,
    });
    if (problem) {
      return fail("refused", `refusing to push: ${problem}`);
    }
    parent = branches.find((b) => b.default === true);
    ({ directUri } = await branchUris(opts, {
      apiKey,
      projectId,
      branchId: parent.id,
      parsedBase,
      pooled: false,
    }));
  } catch (err) {
    return fail("failed", describeNeonError(err));
  }
  maskUri(log, directUri);

  const label = `the test parent (default branch ${parent.name})`;
  if (io.dryRun) {
    log(
      `[ci-branch] dry run: would snapshot the parent as ${backupName}, then push the schema to ${label}`
    );
    return { exitCode: 0, status: "checked" };
  }
  return await withPushLock(directUri, io, label, async () => {
    // Under the lock, so the snapshot is the state this push starts from.
    // `--force` may TRUNCATE ... CASCADE a populated table (a NOT NULL column
    // without a default, a type change); the snapshot is the way back.
    try {
      await snapshotParent(
        { fetchImpl: io.fetchImpl, sleepImpl: io.sleepImpl },
        {
          apiKey,
          projectId,
          branchName: backupName,
          parsedBase,
          expiresAt: expiresAtFrom(now(), BACKUP_TTL_HOURS),
        }
      );
    } catch (err) {
      return fail(
        "failed",
        `could not snapshot the parent as ${backupName}, so nothing was pushed: ${describeNeonError(err)}`
      );
    }
    log(
      `[ci-branch] snapshot ${backupName} is ready; restore the parent from it in the Neon console if this push goes wrong`
    );
    const ok = await parentPush(io, directUri, label);
    if (!ok) {
      return { exitCode: 1, status: "failed" };
    }
    log(`[ci-branch] schema pushed to ${label}`);
    return { exitCode: 0, status: "pushed" };
  });
}

/**
 * The push step of `refreshParent`. In CI: `--force`, output read for the
 * rename prompt. By hand: no `--force`; at a terminal drizzle-kit asks the
 * person directly, otherwise the prompt detection fails it.
 *
 * @param {CiIo & {byHand?: boolean, interactive?: boolean}} io
 * @param {string} directUri
 * @param {string} label
 * @returns {Promise<boolean>}
 */
async function parentPush(io, directUri, label) {
  const consequence =
    "New ci-* branches start from the old schema, and each run's own push makes up the difference until the parent is refreshed";
  if (!io.byHand) {
    return await checkedPush(io, directUri, {
      label,
      consequence,
      promptAdvice: PARENT_PROMPT_ADVICE,
    });
  }
  const interactive =
    io.interactive ?? Boolean(process.stdin.isTTY && process.stdout.isTTY);
  if (!interactive) {
    return await checkedPush(io, directUri, {
      label,
      consequence,
      promptAdvice: BY_HAND_PROMPT_ADVICE,
      force: false,
    });
  }
  const { code } = await runDrizzlePush(io, directUri, {
    force: false,
    interactive: true,
  });
  if (code !== 0) {
    logger(io)(
      `::error::[ci-branch] drizzle-kit push to ${label} exited ${code}. ${consequence}`
    );
    return false;
  }
  return true;
}

/**
 * Why `branch` must not take a worktree push, or null. Only this checkout's
 * own `wt-*` branch may, and never the project's default branch.
 *
 * @param {{name: string, default?: boolean}} branch
 * @returns {string | null}
 */
export function worktreeTargetProblem(branch) {
  if (!WT_BRANCH_PATTERN.test(branch.name)) {
    return `"${branch.name}" is not a wt-* branch`;
  }
  if (branch.default === true) {
    return `"${branch.name}" is the project's default branch, the parent`;
  }
  return null;
}

/**
 * Pushes this checkout's schema to its own `wt-*` branch, so a PR's schema
 * reaches its tests without touching the shared parent. The branch is the
 * one the resolver gives this checkout (created if missing). Runs
 * drizzle-kit WITHOUT --force: at a terminal its prompts (renames, data
 * loss) go to the human; with no terminal the prompt detection fails it.
 *
 * @param {Record<string, string | undefined>} env NEON_API_KEY,
 *   NEON_PROJECT_ID and DATABASE_URL (the parent), as in apps/web/.env.test
 * @param {CiIo & {execImpl?: Function, interactive?: boolean}} [io]
 * @returns {Promise<{exitCode: number, status: "pushed" | "refused" | "failed"}>}
 */
export async function pushWorktree(env, io = {}) {
  const log = logger(io);
  const fail = (status, message) => {
    log(`[ci-branch] push-worktree: ${message}`);
    return { exitCode: 1, status };
  };
  if (env.GITHUB_ACTIONS === "true") {
    return fail("refused", "not in CI; CI runs use `push`");
  }
  if (!(env.NEON_API_KEY && env.NEON_PROJECT_ID && env.DATABASE_URL)) {
    return fail(
      "refused",
      "NEON_API_KEY, NEON_PROJECT_ID and DATABASE_URL must be set in apps/web/.env.test"
    );
  }
  const checkout = checkoutRootName(process.cwd(), {
    execImpl: io.execImpl,
  });
  if (!checkout) {
    return fail("refused", "not inside a git checkout");
  }

  const apiKey = env.NEON_API_KEY;
  const projectId = env.NEON_PROJECT_ID;
  const opts = { fetchImpl: io.fetchImpl, sleepImpl: io.sleepImpl };
  const branchName = branchNameForWorktree(checkout);
  let directUri;
  try {
    const parsedBase = new URL(env.DATABASE_URL);
    const found = await findOrCreateBranch(opts, {
      apiKey,
      projectId,
      branchName,
      parsedBase,
      expiresAt: expiresAtFrom(new Date(), WT_BRANCH_TTL_HOURS),
    });
    const branch = await pollUntilReady(opts, apiKey, projectId, found.id);
    const problem = worktreeTargetProblem(branch);
    if (problem) {
      return fail("refused", `refusing to push: ${problem}`);
    }
    ({ directUri } = await branchUris(opts, {
      apiKey,
      projectId,
      branchId: branch.id,
      parsedBase,
      pooled: false,
    }));
    if (
      new URL(directUri).hostname ===
      parsedBase.hostname.replace("-pooler.", ".")
    ) {
      return fail(
        "refused",
        "refusing to push: the branch resolves to the parent's endpoint"
      );
    }
  } catch (err) {
    return fail("failed", describeNeonError(err));
  }

  const interactive =
    io.interactive ?? Boolean(process.stdin.isTTY && process.stdout.isTTY);
  return await withPushLock(directUri, io, branchName, async () => {
    if (interactive) {
      const { code } = await runDrizzlePush(io, directUri, {
        force: false,
        interactive: true,
      });
      if (code !== 0) {
        return fail(
          "failed",
          `drizzle-kit push to ${branchName} exited ${code}`
        );
      }
    } else {
      const ok = await checkedPush(io, directUri, {
        label: branchName,
        consequence: "Nothing was pushed",
        promptAdvice:
          "Run `node scripts/test-db/ci-branch.mjs push-worktree` from a terminal and answer it",
        force: false,
      });
      if (!ok) {
        return { exitCode: 1, status: "failed" };
      }
    }
    log(`[ci-branch] schema pushed to ${branchName}`);
    return { exitCode: 0, status: "pushed" };
  });
}

/**
 * apps/web/.env.test over the process env, as the vitest configs see it.
 *
 * @returns {Record<string, string | undefined>}
 */
function envTest() {
  const file = path.resolve(REPO_ROOT, "apps/web/.env.test");
  try {
    return { ...process.env, ...parseEnv(readFileSync(file, "utf8")) };
  } catch {
    return { ...process.env };
  }
}

async function main(argv) {
  const [command, name] = argv;
  switch (command) {
    case "ensure":
      await ensure(process.env);
      return 0;
    case "push":
      return (await pushSchema(process.env)).exitCode;
    case "delete":
      return (await deleteCiBranch(process.env, { branchName: name })).exitCode;
    case "push-worktree":
      return (await pushWorktree(envTest())).exitCode;
    case "refresh-parent":
      return (
        await refreshParent(process.env, { dryRun: name === "--dry-run" })
      ).exitCode;
    default:
      process.stderr.write(
        "Usage: node scripts/test-db/ci-branch.mjs ensure | push | delete [ci-branch-name] | push-worktree | refresh-parent [--dry-run]\n"
      );
      return 2;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  process.exitCode = await main(process.argv.slice(2));
}
