// Gives each git checkout its own Neon test-database branch, so a Claude Code
// agent worktree — or the main checkout — running tests can't collide with
// any other checkout on the shared test database's fixed-ID fixtures
// (`test-org-123` et al.). See plans/017-per-worktree-neon-test-branches.md
// and plans/297-check-all-own-test-database.md.
//
// Every vitest config that loads apps/web/.env.test calls
// `resolveTestDatabaseUrl` before handing DATABASE_URL to test workers. The
// resolver is intentionally paranoid: any failure (missing keys, network
// error, unexpected API shape) falls back to the original `baseUrl` so tests
// never fail to start because of this feature. Every checkout — main or a
// linked worktree — gets its own branch, named after its directory; the only
// way to fall back to the shared database is a missing NEON_API_KEY or
// NEON_PROJECT_ID in the env that loads .env.test.
//
// CI never resolves here: under GitHub Actions (`GITHUB_ACTIONS=true`) the
// resolver returns `baseUrl` untouched, with no naming, Neon call or reap. A
// runner's `git worktree list` holds only itself, so a reap from there would
// delete every live `wt-*` branch. CI gets its own per-run `ci-*` branch from
// `ci-branch.mjs`, which hands the URL to the test step as DATABASE_URL.
//
// Every exported function accepts a trailing `opts = { fetchImpl, execImpl }`
// (defaulting to the real global `fetch` and `execFileSync`) so unit tests
// can fake git and the Neon API without any network access or real repo.

import { execFileSync } from "node:child_process";
import path from "node:path";

export const NEON_API_BASE = "https://console.neon.tech/api/v2";
const POLL_INTERVAL_MS = 500;
const POLL_MAX_MS = 60_000;
const LEADING_SLASH = /^\//;
const ALREADY_EXISTS = /already exists/i;
// Neon answers 423 Locked while another operation on the project (such as a
// concurrent branch create from a sibling CI job) is still running. Retry the
// create with backoff for up to this long, re-listing first each time.
const LOCKED_RETRY_MAX_MS = 60_000;
const LOCKED_BACKOFF_MS = [1000, 2000, 4000, 8000];

/**
 * A non-2xx answer from the Neon API. `status` lets callers give 401/403,
 * 404, 409, 422 and 423 their own messages.
 */
export class NeonApiError extends Error {
  /**
   * @param {string} operation
   * @param {number} status
   * @param {string} [detail]
   */
  constructor(operation, status, detail = "") {
    super(`${operation} failed: ${status}${detail ? ` ${detail}` : ""}`);
    this.name = "NeonApiError";
    this.operation = operation;
    this.status = status;
  }
}

/**
 * @typedef {object} ResolverOpts
 * @property {typeof fetch} [fetchImpl]
 * @property {typeof execFileSync} [execImpl]
 * @property {boolean} [all]
 * @property {(ms: number) => Promise<void>} [sleepImpl]
 */

/**
 * @typedef {object} WorktreeInfo
 * @property {boolean} isWorktree
 * @property {string|null} name
 */

/**
 * Determines whether `cwd` is inside a linked git worktree (as opposed to the
 * main checkout), and if so, its directory basename.
 *
 * @param {string} cwd
 * @param {ResolverOpts} [opts]
 * @returns {WorktreeInfo}
 */
export function detectWorktree(cwd, opts = {}) {
  const execImpl = opts.execImpl ?? execFileSync;
  try {
    const output = execImpl(
      "git",
      ["rev-parse", "--git-dir", "--git-common-dir"],
      { cwd, encoding: "utf8" }
    ).toString();
    const [gitDir, commonDir] = output.trim().split("\n");
    const resolvedGitDir = path.resolve(cwd, gitDir);
    const resolvedCommonDir = path.resolve(cwd, commonDir);

    if (resolvedGitDir === resolvedCommonDir) {
      return { isWorktree: false, name: null };
    }

    const toplevel = execImpl("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
    })
      .toString()
      .trim();

    return { isWorktree: true, name: path.basename(toplevel) };
  } catch {
    return { isWorktree: false, name: null };
  }
}

/**
 * The basename of the checkout root containing `cwd` — the main checkout's
 * directory, or a linked worktree's. Uses `git rev-parse --show-toplevel`, so
 * it is independent of which subdirectory the process runs from: vitest runs
 * with cwd set to the package directory, and naming a branch after that would
 * cut one branch per package instead of one per checkout.
 *
 * @param {string} cwd
 * @param {ResolverOpts} [opts]
 * @returns {string|null}
 */
export function checkoutRootName(cwd, opts = {}) {
  const execImpl = opts.execImpl ?? execFileSync;
  try {
    const toplevel = execImpl("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
    })
      .toString()
      .trim();
    return toplevel ? path.basename(toplevel) : null;
  } catch {
    return null;
  }
}

/**
 * Sanitizes a worktree directory name into a Neon branch name.
 *
 * @param {string} name
 * @returns {string}
 */
export function branchNameForWorktree(name) {
  const sanitized = name
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `wt-${sanitized}`;
}

/**
 * @param {ResolverOpts} opts
 * @param {string} apiKey
 * @param {string} url
 * @param {RequestInit} [init]
 */
export async function neonFetch(opts, apiKey, url, init = {}) {
  const fetchImpl = opts.fetchImpl ?? fetch;
  return await fetchImpl(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

/**
 * @param {ResolverOpts} opts
 * @param {string} apiKey
 * @param {string} projectId
 * @returns {Promise<Array<{id: string, name: string, current_state: string, parent_id?: string}>>}
 */
export async function listBranches(opts, apiKey, projectId) {
  const res = await neonFetch(
    opts,
    apiKey,
    `${NEON_API_BASE}/projects/${projectId}/branches`,
    { method: "GET" }
  );
  if (!res.ok) {
    throw new NeonApiError("list branches", res.status);
  }
  const body = await res.json();
  return body.branches ?? [];
}

/**
 * Maps the existing DATABASE_URL's host (with any `-pooler` suffix stripped)
 * to the Neon endpoint whose branch is that URL's parent branch.
 *
 * @param {ResolverOpts} opts
 * @param {string} apiKey
 * @param {string} projectId
 * @param {string} hostname
 * @returns {Promise<string>}
 */
export async function resolveParentBranchId(opts, apiKey, projectId, hostname) {
  const strippedHost = hostname.replace("-pooler.", ".");
  const res = await neonFetch(
    opts,
    apiKey,
    `${NEON_API_BASE}/projects/${projectId}/endpoints`,
    { method: "GET" }
  );
  if (!res.ok) {
    throw new NeonApiError("list endpoints", res.status);
  }
  const body = await res.json();
  const endpoints = body.endpoints ?? [];
  const endpoint = endpoints.find((e) => e.host === strippedHost);
  if (!endpoint) {
    const err = new Error(`no endpoint found for host ${strippedHost}`);
    // ci-branch.mjs matches on this rather than the message, which names a
    // host CI logs must not show.
    err.code = "NO_PARENT_ENDPOINT";
    throw err;
  }
  return endpoint.branch_id;
}

/**
 * Polls `GET /branches` until the branch reaches `current_state === "ready"`.
 *
 * @param {ResolverOpts} opts
 * @param {string} apiKey
 * @param {string} projectId
 * @param {string} branchId
 */
export async function pollUntilReady(opts, apiKey, projectId, branchId) {
  const start = Date.now();
  for (;;) {
    const branches = await listBranches(opts, apiKey, projectId);
    const branch = branches.find((b) => b.id === branchId);
    if (!branch) {
      throw new Error(`branch ${branchId} disappeared while polling`);
    }
    if (branch.current_state === "ready") {
      return branch;
    }
    if (Date.now() - start > POLL_MAX_MS) {
      throw new Error(`branch ${branchId} not ready after ${POLL_MAX_MS}ms`);
    }
    await sleep(opts, POLL_INTERVAL_MS);
  }
}

/**
 * @param {ResolverOpts} opts
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(opts, ms) {
  if (opts.sleepImpl) {
    return opts.sleepImpl(ms);
  }
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @typedef {object} BranchTarget
 * @property {string} apiKey
 * @property {string} projectId
 * @property {string} branchName
 * @property {URL} parsedBase
 * @property {string} [expiresAt] RFC 3339 time Neon deletes the branch at
 */

/**
 * Finds the worktree's branch, creating it (from the parent implied by
 * `target.parsedBase`'s host) if it doesn't exist yet. Handles the 409
 * raised when a concurrent vitest process in the same worktree (turbo runs
 * web/api/auth configs in parallel) creates it first: re-GETs and reuses
 * that branch.
 *
 * @param {ResolverOpts} opts
 * @param {BranchTarget} target
 * @returns {Promise<{id: string, name: string, current_state: string}>}
 */
export async function findOrCreateBranch(opts, target) {
  const { apiKey, projectId, branchName, parsedBase, expiresAt } = target;

  const findByName = async () =>
    (await listBranches(opts, apiKey, projectId)).find(
      (b) => b.name === branchName
    );

  const existing = await findByName();
  if (existing) {
    return existing;
  }

  const parentId = await resolveParentBranchId(
    opts,
    apiKey,
    projectId,
    parsedBase.hostname
  );
  const branchBody = { parent_id: parentId, name: branchName };
  if (expiresAt) {
    branchBody.expires_at = expiresAt;
  }
  const requestBody = JSON.stringify({
    branch: branchBody,
    endpoints: [{ type: "read_write" }],
  });

  // A 423 means a concurrent create (a sibling CI job, say) holds the project
  // lock. Wait, then look again: that create may have made this very branch.
  const start = Date.now();
  for (let attempt = 0; ; attempt++) {
    const result = await attemptCreate(opts, target, requestBody, findByName);
    if (result.branch) {
      return result.branch;
    }
    if (Date.now() - start >= LOCKED_RETRY_MAX_MS) {
      throw new NeonApiError("create branch", 423, result.bodyText);
    }
    await sleep(
      opts,
      LOCKED_BACKOFF_MS[Math.min(attempt, LOCKED_BACKOFF_MS.length - 1)]
    );
    const appeared = await findByName();
    if (appeared) {
      return appeared;
    }
  }
}

/**
 * One create POST. Returns the branch (created, or created first by a
 * concurrent caller), or `locked` on a 423; throws on anything else.
 *
 * @param {ResolverOpts} opts
 * @param {BranchTarget} target
 * @param {string} requestBody
 * @param {() => Promise<{id: string, name: string, current_state: string} | undefined>} findByName
 * @returns {Promise<{branch?: {id: string, name: string, current_state: string}, locked?: true, bodyText?: string}>}
 */
async function attemptCreate(opts, target, requestBody, findByName) {
  const { apiKey, projectId, branchName } = target;
  const createRes = await neonFetch(
    opts,
    apiKey,
    `${NEON_API_BASE}/projects/${projectId}/branches`,
    { method: "POST", body: requestBody }
  );

  if (createRes.ok) {
    const created = await createRes.json();
    return { branch: created.branch };
  }

  const bodyText = await createRes.text().catch(() => "");
  if (createRes.status === 409 || ALREADY_EXISTS.test(bodyText)) {
    const created = await findByName();
    if (!created) {
      throw new Error(
        `branch create conflict but branch ${branchName} not found`
      );
    }
    return { branch: created };
  }
  if (createRes.status === 423) {
    return { locked: true, bodyText };
  }
  throw new NeonApiError("create branch", createRes.status, bodyText);
}

/**
 * Fetches a connection URI for `branchId`: pooled (through Neon's PgBouncer
 * host) or direct. Session-level features such as advisory locks need direct.
 *
 * @param {ResolverOpts} opts
 * @param {{apiKey: string, projectId: string, branchId: string, database: string, role: string, pooled: boolean}} args
 * @returns {Promise<string>}
 */
export async function fetchConnectionUri(opts, args) {
  const { apiKey, projectId, branchId, database, role, pooled } = args;
  const connUri = new URL(
    `${NEON_API_BASE}/projects/${projectId}/connection_uri`
  );
  connUri.searchParams.set("branch_id", branchId);
  connUri.searchParams.set("database_name", database);
  connUri.searchParams.set("role_name", role);
  connUri.searchParams.set("pooled", pooled ? "true" : "false");

  const connRes = await neonFetch(opts, apiKey, connUri.toString(), {
    method: "GET",
  });
  if (!connRes.ok) {
    throw new NeonApiError("connection_uri", connRes.status);
  }
  const { uri } = await connRes.json();
  return uri;
}

/**
 * Resolves the DATABASE_URL test workers should use: unchanged outside a
 * worktree or without Neon credentials, otherwise a connection URI for a
 * per-worktree branch (created on first use, reused after).
 *
 * @param {string} baseUrl
 * @param {Record<string, string | undefined>} env
 * @param {ResolverOpts} [opts]
 * @returns {Promise<string>}
 */
export async function resolveTestDatabaseUrl(baseUrl, env, opts = {}) {
  if (!baseUrl) {
    return baseUrl;
  }

  // CI: ci-branch.mjs already pointed DATABASE_URL at this run's own `ci-*`
  // branch (or deliberately fell back to the shared one). Resolving here would
  // also fire the reap below from a runner, whose worktree list holds only
  // itself, deleting every live `wt-*` branch. Read from `env`, not
  // process.env: callers pass process.env (or vite's copy of it) anyway, and
  // tests running on a runner can then still exercise the local path.
  if (env.GITHUB_ACTIONS === "true") {
    return baseUrl;
  }

  // Every checkout gets its own branch, main included: `check:all` runs every
  // package's suite in parallel against one URL, so the main checkout collides
  // with itself (and with any other vitest run on the box) exactly when its
  // verdict matters most. `liveWorktreeBranchNames` already lists the main
  // checkout, so the reaper treats this branch as live without any change.
  // The name comes from the checkout root (`git rev-parse --show-toplevel`),
  // not `process.cwd()`: vitest's cwd is the package directory under turbo,
  // and naming after that would cut one branch per package instead of one
  // per checkout.
  const checkoutName = checkoutRootName(process.cwd(), opts);
  if (!checkoutName) {
    return baseUrl;
  }

  if (!(env.NEON_API_KEY && env.NEON_PROJECT_ID)) {
    console.warn(
      "[test-db] NEON_API_KEY/NEON_PROJECT_ID not set — falling back to the SHARED test database"
    );
    return baseUrl;
  }

  const apiKey = env.NEON_API_KEY;
  const projectId = env.NEON_PROJECT_ID;
  const branchName = branchNameForWorktree(checkoutName);

  try {
    const parsedBase = new URL(baseUrl);
    const role = parsedBase.username;
    const database = parsedBase.pathname.replace(LEADING_SLASH, "");

    const found = await findOrCreateBranch(opts, {
      apiKey,
      projectId,
      branchName,
      parsedBase,
    });
    const branch = await pollUntilReady(opts, apiKey, projectId, found.id);

    const uri = await fetchConnectionUri(opts, {
      apiKey,
      projectId,
      branchId: branch.id,
      database,
      role,
      pooled: true,
    });

    // Fire-and-forget: sweep dead branches on every test start. Never await
    // this on the resolve path — it must not slow down or block test start.
    reapOrphanBranches(env, opts).catch(() => {
      // Best-effort sweep; failures here must never affect test start.
    });

    return uri;
  } catch (err) {
    console.warn(
      `[test-db] ${err instanceof Error ? err.message : String(err)}`
    );
    return baseUrl;
  }
}

/**
 * Set of `wt-*` branch names for every worktree `git worktree list` still
 * reports. Any git failure (e.g. not a repo) yields an empty set — the
 * caller then treats every `wt-*` branch as dead, which is the safe
 * direction (worst case: an extra branch gets recreated on next test run).
 *
 * @param {ResolverOpts} opts
 * @returns {Set<string>}
 */
function liveWorktreeBranchNames(opts) {
  const execImpl = opts.execImpl ?? execFileSync;
  try {
    const output = execImpl("git", ["worktree", "list", "--porcelain"], {
      encoding: "utf8",
    }).toString();
    const worktreePaths = output
      .split("\n")
      .filter((line) => line.startsWith("worktree "))
      .map((line) => line.slice("worktree ".length).trim());
    return new Set(
      worktreePaths.map((p) => branchNameForWorktree(path.basename(p)))
    );
  } catch {
    return new Set();
  }
}

/**
 * @param {ResolverOpts} opts
 * @param {string} apiKey
 * @param {string} projectId
 * @param {{id: string, name: string}} branch
 * @returns {Promise<boolean>} whether the delete succeeded
 */
async function deleteBranch(opts, apiKey, projectId, branch) {
  try {
    const delRes = await neonFetch(
      opts,
      apiKey,
      `${NEON_API_BASE}/projects/${projectId}/branches/${branch.id}`,
      { method: "DELETE" }
    );
    if (delRes.ok) {
      return true;
    }
    console.warn(
      `[test-db] failed to delete branch ${branch.name}: ${delRes.status}`
    );
    return false;
  } catch (err) {
    console.warn(
      `[test-db] failed to delete branch ${branch.name}: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return false;
  }
}

/**
 * Deletes `wt-*` Neon branches whose worktree no longer exists. Never
 * touches a branch that doesn't start with `wt-` — that's what protects the
 * parent/default branches by construction.
 *
 * @param {Record<string, string | undefined>} env
 * @param {ResolverOpts} [opts]
 * @returns {Promise<{ deleted: string[], kept: string[], failed: string[] }>}
 */
export async function reapOrphanBranches(env, opts = {}) {
  if (!(env.NEON_API_KEY && env.NEON_PROJECT_ID)) {
    return { deleted: [], kept: [], failed: [] };
  }

  const apiKey = env.NEON_API_KEY;
  const projectId = env.NEON_PROJECT_ID;
  const liveNames = liveWorktreeBranchNames(opts);
  const branches = await listBranches(opts, apiKey, projectId);

  const deleted = [];
  const kept = [];
  const failed = [];

  for (const branch of branches) {
    if (!branch.name.startsWith("wt-")) {
      continue;
    }

    // `only` is authoritative when given: delete exactly those branches and
    // keep every other, live or not. That is what lets one checkout refresh
    // its own branch after a migration lands without deleting a branch another
    // agent's worktree is mid-run against (which `--all` does by design).
    const shouldDelete = opts.only
      ? opts.only.includes(branch.name)
      : opts.all === true || !liveNames.has(branch.name);
    if (!shouldDelete) {
      kept.push(branch.name);
      continue;
    }

    const ok = await deleteBranch(opts, apiKey, projectId, branch);
    (ok ? deleted : failed).push(branch.name);
  }

  return { deleted, kept, failed };
}
