#!/usr/bin/env node
// Gives each CI workflow run its own Neon test-database branch, so two PRs
// testing at once can't delete each other's fixtures on the shared database
// (FK 23503). See plans/031-per-pr-neon-test-branches.md.
//
//   node scripts/test-db/ci-branch.mjs ensure   find or create this run's branch
//   node scripts/test-db/ci-branch.mjs push     drizzle-kit push to that branch
//   node scripts/test-db/ci-branch.mjs delete   delete it when the run ends
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
import { appendFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  fetchConnectionUri,
  findOrCreateBranch,
  listBranches,
  NEON_API_BASE,
  NeonApiError,
  neonFetch,
  pollUntilReady,
} from "./resolve-branch.mjs";

export const CI_BRANCH_PATTERN = /^ci-[0-9a-f]{7}-\d+-\d+$/;
export const CI_BRANCH_TTL_HOURS = 3;
const LEADING_SLASH = /^\//;
const MILLISECONDS = /\.\d{3}Z$/;
const PUSH_TIMEOUT_MS = 10 * 60_000;
// Any constant works; it only has to be the same in every job of the run.
const PUSH_LOCK_KEY = 31_031;
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
 * RFC 3339 in UTC with whole seconds, as Neon's branch-expiration docs show.
 *
 * @param {Date} now
 * @param {number} hours
 * @returns {string}
 */
export function expiresAtFrom(now, hours) {
  return new Date(now.getTime() + hours * 3_600_000)
    .toISOString()
    .replace(MILLISECONDS, "Z");
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
    switch (err.status) {
      case 401:
      case 403:
        return `Neon refused the API key on ${what} (${err.status}): NEON_API_KEY is wrong, revoked, or not scoped to NEON_PROJECT_ID`;
      case 404:
        return `Neon found nothing on ${what} (404): NEON_PROJECT_ID names no project this key can see, or the branch is gone`;
      case 409:
        return `Neon reported a conflict on ${what} (409) and the branch could not be found to reuse`;
      case 422:
        return `Neon rejected the request body on ${what} (422), likely expires_at; not retrying without it`;
      case 423:
        return `the Neon project stayed locked by other operations on ${what} (423) past the retry window`;
      default:
        return `Neon ${what} failed (${err.status})`;
    }
  }
  if (err && typeof err === "object" && err.code === "NO_PARENT_ENDPOINT") {
    return "TEST_DATABASE_URL's host matches no compute endpoint in NEON_PROJECT_ID: the secrets point at different projects";
  }
  return `Neon request failed: ${err instanceof Error ? err.message : String(err)}`;
}

/**
 * Masks a connection URI and its password, raw and URL-encoded, so neither
 * shows in any later log line of the job.
 *
 * @param {(line: string) => void} log
 * @param {string} uri
 */
function maskUri(log, uri) {
  log(`::add-mask::${uri}`);
  const encoded = new URL(uri).password;
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
    const branch = await pollUntilReady(opts, apiKey, projectId, found.id);

    const role = decodeURIComponent(parsedBase.username);
    const database = parsedBase.pathname.replace(LEADING_SLASH, "");
    const conn = { apiKey, projectId, branchId: branch.id, database, role };
    const directUri = await fetchConnectionUri(opts, {
      ...conn,
      pooled: false,
    });
    const pooled = parsedBase.hostname.includes("-pooler.");
    const testUri = pooled
      ? await fetchConnectionUri(opts, { ...conn, pooled: true })
      : directUri;

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
    const branch = (await listBranches(opts, apiKey, projectId)).find(
      (b) => b.name === branchName
    );
    if (!branch) {
      log(`[ci-branch] ${branchName} does not exist, nothing to delete`);
      return { exitCode: 0, status: "absent" };
    }
    const res = await neonFetch(
      opts,
      apiKey,
      `${NEON_API_BASE}/projects/${projectId}/branches/${branch.id}`,
      { method: "DELETE" }
    );
    if (res.status === 404) {
      log(`[ci-branch] ${branchName} was already deleted`);
      return { exitCode: 0, status: "absent" };
    }
    if (!res.ok) {
      throw new NeonApiError("delete branch", res.status);
    }
    log(`[ci-branch] deleted ${branchName}`);
    return { exitCode: 0, status: "deleted" };
  } catch (err) {
    log(
      `::warning::[ci-branch] could not delete ${branchName}: ${describeNeonError(err)}. Neon still deletes it at its expires_at`
    );
    return { exitCode: 1, status: "failed" };
  }
}

/** @param {string} url @returns {Promise<PgClient>} */
async function connectPgDefault(url) {
  // Imported here, not at the top: `ensure` and `delete` run before
  // `pnpm install`, when pg is not there yet.
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  return client;
}

/**
 * Pushes packages/db's schema to this run's branch with
 * `drizzle-kit push --force`. Every DB job runs this; a session advisory lock
 * on the branch serialises them, so the first applies the diff and the rest
 * find nothing to do. Skips (exit 0) when `ensure` fell back: the shared
 * parent is never pushed to from CI.
 *
 * @param {Record<string, string | undefined>} env
 * @param {CiIo} [io]
 * @returns {Promise<{exitCode: number, status: "pushed" | "skipped" | "refused" | "failed"}>}
 */
export async function pushSchema(env, io = {}) {
  const log = logger(io);
  const spawnImpl = io.spawnImpl ?? spawn;
  const connectPg = io.connectPg ?? connectPgDefault;

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

  let client;
  try {
    // Direct URI: PgBouncer (pooled) would not keep a session lock.
    client = await connectPg(directUrl);
    await client.query("SELECT pg_advisory_lock($1)", [PUSH_LOCK_KEY]);
  } catch (err) {
    log(
      `::error::[ci-branch] could not lock ${branchName} for the schema push: ${err instanceof Error ? err.message : String(err)}`
    );
    await client?.end().catch(() => {
      // The connection may never have opened; nothing to close.
    });
    return { exitCode: 1, status: "failed" };
  }

  try {
    const code = await new Promise((resolve) => {
      const child = spawnImpl(
        "pnpm",
        ["--filter", "@wraps/db", "exec", "drizzle-kit", "push", "--force"],
        {
          cwd: REPO_ROOT,
          // drizzle.config.ts loads .env.local with dotenv, which never
          // overrides a set variable, so this URL is the one it uses.
          env: { ...process.env, DATABASE_URL: directUrl },
          // No TTY, as on a runner: a rename prompt --force can't answer
          // must fail here, not wait for input.
          stdio: ["ignore", "inherit", "inherit"],
        }
      );
      const timer = setTimeout(() => {
        log(
          `::error::[ci-branch] drizzle-kit push still running after ${PUSH_TIMEOUT_MS / 60_000} min; it may be waiting on a rename prompt --force does not answer`
        );
        child.kill("SIGKILL");
      }, PUSH_TIMEOUT_MS);
      child.on("error", () => {
        clearTimeout(timer);
        resolve(1);
      });
      child.on("exit", (exitCode) => {
        clearTimeout(timer);
        resolve(exitCode ?? 1);
      });
    });
    if (code !== 0) {
      log(
        `::error::[ci-branch] drizzle-kit push to ${branchName} failed (exit ${code}); the tests would run against a stale schema`
      );
      return { exitCode: 1, status: "failed" };
    }
    log(`[ci-branch] schema pushed to ${branchName}`);
    return { exitCode: 0, status: "pushed" };
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
    default:
      process.stderr.write(
        "Usage: node scripts/test-db/ci-branch.mjs ensure | push | delete [ci-branch-name]\n"
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
