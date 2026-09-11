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
// NEON_PROJECT_ID in the env that loads .env.test, which is why CI (no Neon
// credentials) always takes the no-op path.
//
// Every exported function accepts a trailing `opts = { fetchImpl, execImpl }`
// (defaulting to the real global `fetch` and `execFileSync`) so unit tests
// can fake git and the Neon API without any network access or real repo.

import { execFileSync } from "node:child_process";
import path from "node:path";

const NEON_API_BASE = "https://console.neon.tech/api/v2";
const POLL_INTERVAL_MS = 500;
const POLL_MAX_MS = 60_000;
const LEADING_SLASH = /^\//;
const ALREADY_EXISTS = /already exists/i;

/**
 * @typedef {object} ResolverOpts
 * @property {typeof fetch} [fetchImpl]
 * @property {typeof execFileSync} [execImpl]
 * @property {boolean} [all]
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
async function neonFetch(opts, apiKey, url, init = {}) {
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
async function listBranches(opts, apiKey, projectId) {
  const res = await neonFetch(
    opts,
    apiKey,
    `${NEON_API_BASE}/projects/${projectId}/branches`,
    { method: "GET" }
  );
  if (!res.ok) {
    throw new Error(`list branches failed: ${res.status}`);
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
async function resolveParentBranchId(opts, apiKey, projectId, hostname) {
  const strippedHost = hostname.replace("-pooler.", ".");
  const res = await neonFetch(
    opts,
    apiKey,
    `${NEON_API_BASE}/projects/${projectId}/endpoints`,
    { method: "GET" }
  );
  if (!res.ok) {
    throw new Error(`list endpoints failed: ${res.status}`);
  }
  const body = await res.json();
  const endpoints = body.endpoints ?? [];
  const endpoint = endpoints.find((e) => e.host === strippedHost);
  if (!endpoint) {
    throw new Error(`no endpoint found for host ${strippedHost}`);
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
async function pollUntilReady(opts, apiKey, projectId, branchId) {
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
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

/**
 * @typedef {object} BranchTarget
 * @property {string} apiKey
 * @property {string} projectId
 * @property {string} branchName
 * @property {URL} parsedBase
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
async function findOrCreateBranch(opts, target) {
  const { apiKey, projectId, branchName, parsedBase } = target;

  const existing = (await listBranches(opts, apiKey, projectId)).find(
    (b) => b.name === branchName
  );
  if (existing) {
    return existing;
  }

  const parentId = await resolveParentBranchId(
    opts,
    apiKey,
    projectId,
    parsedBase.hostname
  );
  const createRes = await neonFetch(
    opts,
    apiKey,
    `${NEON_API_BASE}/projects/${projectId}/branches`,
    {
      method: "POST",
      body: JSON.stringify({
        branch: { parent_id: parentId, name: branchName },
        endpoints: [{ type: "read_write" }],
      }),
    }
  );

  if (createRes.ok) {
    const created = await createRes.json();
    return created.branch;
  }

  const bodyText = await createRes.text().catch(() => "");
  const isConflict = createRes.status === 409 || ALREADY_EXISTS.test(bodyText);
  if (!isConflict) {
    throw new Error(`create branch failed: ${createRes.status} ${bodyText}`);
  }

  const created = (await listBranches(opts, apiKey, projectId)).find(
    (b) => b.name === branchName
  );
  if (!created) {
    throw new Error(
      `branch create conflict but branch ${branchName} not found`
    );
  }
  return created;
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

    const connUri = new URL(
      `${NEON_API_BASE}/projects/${projectId}/connection_uri`
    );
    connUri.searchParams.set("branch_id", branch.id);
    connUri.searchParams.set("database_name", database);
    connUri.searchParams.set("role_name", role);
    connUri.searchParams.set("pooled", "true");

    const connRes = await neonFetch(opts, apiKey, connUri.toString(), {
      method: "GET",
    });
    if (!connRes.ok) {
      throw new Error(`connection_uri failed: ${connRes.status}`);
    }
    const { uri } = await connRes.json();

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
