# The per-worktree Neon test database

Every git worktree gets its own Neon test-database branch (`wt-<sanitized-name>`) so
parallel test runs cannot collide on the shared fixtures. Every vitest config rewrites
`DATABASE_URL` through `resolveTestDatabaseUrl` to that per-checkout branch, so the
database your tests read is the branch, not anything named in an env file.

The branches live in the test-only Neon project `wraps-test`; `apps/web/.env.test` holds
its project-scoped key. CI doesn't use the resolver: under `GITHUB_ACTIONS=true` it returns
`DATABASE_URL` untouched, and each workflow run gets a `ci-*` branch from
`scripts/test-db/ci-branch.mjs` instead (`docs/agents/ci-and-deploy.md`). Never delete or
reap `ci-*` branches by hand; they expire 3h after creation.

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
every push to main that touches `packages/db/src/schema/**`, `packages/db/src/migrations/**`
or `packages/db/drizzle.config.ts`, it runs `ci-branch.mjs refresh-parent`, which pushes
main's schema to the default branch. It refuses unless the project is the test-only one
and `TEST_DATABASE_URL` names that default branch, and it never gates a deploy.

Refresh the parent by hand (`pnpm test-db:refresh`, from a checkout of **main**) only to
recover:

- **The refresh run failed on a rename.** drizzle-kit asks whether a column or table was
  renamed, which no runner can answer. Run it by hand once and answer the prompt; later
  refreshes see no diff.
- **The refresh run failed for another reason**, or the parent drifted some other way.
  Re-run the workflow (`workflow_dispatch`) or refresh by hand.

Never refresh the parent from an unmerged PR; the one exception is a real rename that CI
can't get past, covered in `docs/agents/ci-and-deploy.md`.

## After a migration lands: refresh — two steps, not one

An **existing** `wt-*` branch is reused as it is until it expires: `resolve-branch.mjs`
cuts a branch from the shared test DB only when one does not already exist, and never
re-cuts or migrates it afterwards. So a schema change reaches your tests only if you both
update the parent *and* drop the stale child:

```bash
pnpm test-db:refresh   # = db:push:test (updates the shared parent)
                       #   + reap-branches.mjs --self (drops THIS checkout's
                       #     branch so it re-cuts from that parent next run)
```

`--self` is the concurrency-safe form of `--all`: it deletes only the current
checkout's branch, so it leaves other agents' worktrees untouched mid-run. Reach for
`--all` only when you deliberately want every checkout onto fresh schema.

`db:push` and `db:push:test` alone are half the job. `db:push` targets the dev DB in
`.env.local`; `db:push:test` targets the raw `DATABASE_URL` in `.env.test` — the shared
*parent*. Neither is the branch your tests read. Tests still failing `42703` after either
push is this gap, not a broken push.
