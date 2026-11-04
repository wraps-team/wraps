# CI and the production deploy

## How `deploy-api.yml` triggers

It triggers on the Test workflow *completing* for a commit on main — not on `push` — and
deploys only if that run's conclusion is `success`:

```yaml
on:
  workflow_run:
    workflows: [Test]
    types: [completed]
    branches: [main]
```

Keep it on `workflow_run`. It used to call `test.yml` as a reusable workflow, and
`test.yml` carries a workflow-level `concurrency` group for the single shared Neon test
database, so the called copy and the standalone push-triggered run competed for one slot:
on `92413fa3` the called copy lost, all twelve jobs were cancelled, and `deploy` was
skipped — a production deploy that silently did not happen, on a run whose conclusion
read `cancelled` rather than `failure`. `baseline/deploy-api-workflow.test.ts` fails if
`deploy-api.yml` calls `test.yml` again.

Consequences to know before editing either file:

- **`workflow_run` has no `paths:` filter**, so the deploy's path list lives in
  `scripts/ci/deploy-gate.sh` (run by the `gate` job; tests in
  `scripts/__tests__/deploy-gate.test.ts`). It diffs against *the last commit this
  workflow actually deployed* — not `HEAD^`. A `HEAD^` comparison strands changes whenever
  a deploy is cancelled, fails, or a push carries several commits. Keep the list in sync
  with `pnpm --filter "@wraps/api^..." list`; it also carries `pnpm-lock.yaml` and
  `pnpm-workspace.yaml`, because the API takes its dependency versions from the pnpm
  catalog.
- **"Last deployed" is a GitHub Deployment, not a past run.** After `sst deploy` succeeds,
  the `deploy` job records the tested SHA as a `success` Deployment in the
  `api-<stage>` environment (`api-production`), and the gate reads the newest one. Past
  runs can't stand in: a run whose gate skipped still concludes `success`, and a
  `workflow_run` run's own `head_sha` is main's HEAD at trigger time, not the commit it
  tested — on 2026-11-03 that hid API commit #247 behind the docs-only #248 until a manual
  dispatch. **Never use `api-<stage>` as a job `environment:`**: GitHub's automatic job
  records carry `github.sha`, the same wrong commit, and would corrupt the lookup. Every
  failure to read the record (none yet, API error, timeout, an unreadable status, SHA not
  in history) deploys. When it can read the record, the gate skips a commit older than the
  recorded one; a manual dispatch always deploys, which is how to roll back on purpose; it lasts until
  the next push to main deploys, so revert on main to keep it.
  A failed record step leaves the job red on purpose: a deployment without its `success`
  status is skipped in favour of the previous record, which is a stale baseline.
- **The deploy checks out the tested SHA** (`needs.gate.outputs.sha`), not the branch tip.
  Under `workflow_run` the default checkout is main's head at trigger time, which may
  already be a newer, untested commit.

## Each CI run has its own Neon test branch

Every run of `test.yml` and `e2e.yml` gets its own branch in the test-only Neon project,
named `ci-<sha7>-<run_id>-<run_attempt>` (on a PR, `sha7` is the merge commit).
`scripts/test-db/ci-branch.mjs` does the work:

- `ensure` runs first in every DB job (test-api, test-auth, test-web, test-db, e2e), before
  `pnpm install`. The jobs of a run compute the same name and converge on one branch. It
  creates the branch with `expires_at` 3h out, masks the URLs, and writes
  `CI_DATABASE_URL`, `CI_DATABASE_DIRECT_URL` and `CI_DB_BRANCH` to `$GITHUB_ENV`.
- `push` runs after install: `drizzle-kit push --force` against the branch's direct URL,
  so the branch carries this commit's schema. Every DB job calls it under an advisory
  lock; the first pushes and writes a marker table (`ci_meta.schema_push`), and the rest
  skip, so the push happens once per run and before any job's tests. It refuses any
  branch not named `ci-*`, and skips when `ensure` fell back. A failed push fails the
  job, since the tests would run on a stale schema.
- A PR that renames a column or table fails `push`: drizzle-kit asks whether it is a
  rename, `--force` doesn't answer that, and a runner has no TTY. (drizzle-kit exits 0
  there; `ci-branch.mjs` reads its output to catch it.) Answer the prompt once on the
  parent with `pnpm test-db:refresh` from a checkout of the PR, and later runs see no diff.
- `delete` runs in `test.yml`'s `cleanup-db-branch` job and in e2e's last step, both
  `always()`. A failed delete only warns, so it can't block the deploy; the 3h expiry
  covers it.
- "Re-run failed jobs" gets a new attempt number, so a new branch that the re-run jobs
  create and push between them.

`resolveTestDatabaseUrl` returns `DATABASE_URL` untouched under `GITHUB_ACTIONS=true`, so
the vitest configs never name, create or reap branches from a runner.

The Neon secrets (`NEON_API_KEY`, `NEON_PROJECT_ID`, `TEST_DATABASE_URL`) reach only the
`ensure` and `delete` steps. The key is scoped to the test-only project, which is the real
control: a same-repo PR can still read it by editing the workflow.

## A red `test-api`/`test-web` on the shared database is usually contention

When `ensure` can't make a branch, it emits a `::warning::` ("so tests use
TEST_DATABASE_URL…") and the run falls back to the shared database. That happens with no
Neon secrets (Dependabot PRs) or when Neon fails, so a Neon outage never blocks a deploy.
On the fallback, two PRs running at once collide again: `test.yml`'s concurrency group
serialises runs only **per ref**.

The signature: `test-api` and `test-web` fail while every other job passes, and the
failures sit in `*-db.test.ts` files — rows coming back `undefined`, FK `23503`, duplicate
keys, PATCH routes returning 500. Check the ensure step's warning, then look for
overlapping runs before reading the diff:

```bash
gh run list --workflow=test.yml --limit 5 --json headBranch,startedAt,conclusion
```

On 2026-09-09 four runs started within 135 seconds and all four failed; the next run, with
the database to itself, passed on unchanged code.

## `e2e.yml` replays committed recordings

The E2E workflow runs `apps/e2e` against a `next dev` it starts on the runner, on its own
per-run `ci-*` branch (see above), deleted in the job's last step. On the
`TEST_DATABASE_URL` fallback each run still inserts only one throwaway owner and org
(`@e2e.wraps.test`), so it can't delete a fixture `test-web` reads.

Agent steps replay from `apps/e2e/.e2e/cache`, which is committed. CI only reads it.
A step whose recording no longer matches the UI falls back to the live agent, so the
run still passes but every run pays for model calls (`AI_GATEWAY_API_KEY` secret)
until someone records it again: run `pnpm test:e2e` locally and commit the changed
`.e2e/cache` files with the UI change. A recording stores paths, so anything that
differs per run, like the workspace slug, goes into the step as `unique(value)`.
