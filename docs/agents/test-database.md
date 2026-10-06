# The per-worktree Neon test database

Every git worktree gets its own Neon test-database branch (`wt-<sanitized-name>`) so
parallel test runs cannot collide on the shared fixtures. Every vitest config rewrites
`DATABASE_URL` through `resolveTestDatabaseUrl` to that per-checkout branch, so the
database your tests read is the branch, not anything named in an env file.

## After removing a worktree: reap its branch

Deleting the worktree leaves its branch alive. Reclaim it:

```bash
node scripts/test-db/reap-branches.mjs        # delete wt-* branches whose worktree is gone
node scripts/test-db/reap-branches.mjs --all  # also delete LIVE wt-* branches
```

**Remove the worktree first, then reap.** The reaper identifies orphans by the absence of
the checkout, so reaping first finds nothing and leaves the branch live indefinitely.

## After a migration lands: refresh — two steps, not one

An **existing** `wt-*` branch is reused verbatim forever: `resolve-branch.mjs` cuts a
branch from the shared test DB only when one does not already exist, and never re-cuts
or migrates it afterwards. So a schema change reaches your tests only if you both
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
