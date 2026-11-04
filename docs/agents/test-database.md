# The per-worktree Neon test database

Every git worktree gets its own Neon test-database branch (`wt-<sanitized-name>`) so
parallel test runs cannot collide on the shared fixtures. Every vitest config rewrites
`DATABASE_URL` through `resolveTestDatabaseUrl` to that per-checkout branch, so the
database your tests read is the branch, not anything named in an env file.

The branches live in the test-only Neon project `wraps-test`; `apps/web/.env.test` holds
its project-scoped key. CI doesn't use the resolver: under `GITHUB_ACTIONS=true` it returns
`DATABASE_URL` untouched, and each workflow run gets a `ci-*` branch from
`scripts/test-db/ci-branch.mjs` instead (`docs/agents/ci-and-deploy.md`). Never delete or
reap `ci-*` branches by hand; they expire 3h after creation. `backup-*` branches are the
parent refresh's snapshots and expire after 7 days.

## Branches expire 24h after their last test run

A `wt-*` branch is created with `expires_at` 24h out, and every test run that resolves it
slides that forward another 24h (a background PATCH; a failed one only warns). A worktree in
use keeps its branch; one that was removed, or left idle for a day, loses it without anyone
running anything. An expired branch is simply re-cut from the parent on the next run.

## After removing a worktree: reaping is optional

Deleting the worktree leaves its branch alive until it expires. To reclaim it now:

```bash
node scripts/test-db/reap-branches.mjs        # delete wt-* branches whose worktree is gone
node scripts/test-db/reap-branches.mjs --all  # also delete LIVE wt-* branches
```

**Remove the worktree first, then reap.** The reaper identifies orphans by the absence of
the checkout, so reaping first finds nothing and leaves the branch live indefinitely.

## The parent follows main on its own

Every CI run and every worktree branches from the parent, the `wraps-test` project's
default branch. `.github/workflows/refresh-test-parent.yml` keeps it on main's schema: on
every push to main that touches `packages/db/src/schema/**`,
`packages/db/src/migrations/**`, `packages/db/drizzle.config.ts` or
`packages/db/package.json`, it runs `ci-branch.mjs refresh-parent`, which pushes main's
schema to the default branch. It refuses unless the project is the test-only one
and `TEST_DATABASE_URL` names that default branch, and it never gates a deploy.

Each automatic refresh first snapshots the parent as a `backup-*` branch (7-day expiry).
If a refresh damaged the parent's data, restore the parent from that branch in the Neon
console (`docs/agents/ci-and-deploy.md`).

Refresh the parent by hand (`pnpm test-db:refresh`, from a checkout of **main**) only to
recover:

- **The refresh run failed on a rename.** drizzle-kit asks whether a column or table was
  renamed, which no runner can answer. Run it by hand once and answer the prompt; later
  refreshes see no diff.
- **The refresh run failed or was killed for another reason**, or the parent drifted some
  other way. Re-run the workflow (`workflow_dispatch`) or refresh by hand.

After any refresh, automatic or by hand, run `reap-branches.mjs --self` in each worktree
that needs main's schema: a `wt-*` branch cut while a refresh was running keeps a partial
schema.

Never refresh the parent from an unmerged PR; the one exception is a real rename that CI
can't get past, covered in `docs/agents/ci-and-deploy.md`.

## After a schema change merges: re-cut your branch

An **existing** `wt-*` branch is reused as it is until it expires: `resolve-branch.mjs`
cuts a branch from the parent only when one does not already exist, and never re-cuts or
migrates it afterwards. Once a schema change merges, `refresh-test-parent.yml` brings the
parent to main's schema. All you do is drop your stale branch, so it re-cuts from the
refreshed parent on the next test run:

```bash
node scripts/test-db/reap-branches.mjs --self
```

`--self` is the concurrency-safe form of `--all`: it deletes only the current
checkout's branch, so it leaves other agents' worktrees untouched mid-run. Reach for
`--all` only when you deliberately want every checkout onto fresh schema.

## Testing a PR's schema change: push it to your own branch

Before a schema change merges, the parent doesn't have it, so your tests fail `42703`.
Put the PR's schema on **this worktree's own branch**, never the parent:

```bash
node scripts/test-db/ci-branch.mjs push-worktree
```

It resolves this checkout's `wt-*` branch the way the tests do (creating it if needed),
refuses anything that isn't `wt-*` or is the project's default branch, and runs
`drizzle-kit push` **without `--force`**. Run it in a terminal: drizzle-kit asks you about
renames and data loss, and you answer. With no terminal (an agent's shell, say) a prompt
fails it red instead. To return to main's schema afterwards, `reap-branches.mjs --self`.

Don't run `pnpm test-db:refresh` or `db:push:test` from a PR: both push to the shared
parent, putting it ahead of main, and then every other run, main's included, hits
drizzle-kit's rename prompt and fails.

Neither `db:push` nor `db:push:test` reaches the branch your tests read. `db:push`
targets the dev DB in `.env.local`; `db:push:test` targets the raw `DATABASE_URL` in
`.env.test`, the shared *parent*. Tests still failing `42703` after either push is this
gap, not a broken push.
