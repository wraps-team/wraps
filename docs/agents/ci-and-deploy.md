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
  recorded one; a manual dispatch always deploys, which is how to roll back on purpose.
  A failed record step leaves the job red on purpose: a deployment without its `success`
  status is skipped in favour of the previous record, which is a stale baseline.
- **The deploy checks out the tested SHA** (`needs.gate.outputs.sha`), not the branch tip.
  Under `workflow_run` the default checkout is main's head at trigger time, which may
  already be a newer, untested commit.

## A red `test-api`/`test-web` is usually contention, not code

Every DB-backed CI job shares one Neon branch — `TEST_DATABASE_URL` is a single secret, and
`resolve-branch.mjs` isolates worktrees only, not CI. `test.yml`'s concurrency group
serialises runs **per ref**, so two pushes to main queue behind each other, but two
different PRs still run at once and collide.

The signature: `test-api` and `test-web` fail while every other job passes, and the
failures sit in `*-db.test.ts` files — rows coming back `undefined`, FK `23503`, duplicate
keys, PATCH routes returning 500. Check for overlapping runs before reading the diff:

```bash
gh run list --workflow=test.yml --limit 5 --json headBranch,startedAt,conclusion
```

On 2026-09-09 four runs started within 135 seconds and all four failed; the next run, with
the database to itself, passed on unchanged code.

## `e2e.yml` replays committed recordings

The E2E workflow runs `apps/e2e` against a `next dev` it starts on the runner, on the
same Neon branch as `test-web` (`TEST_DATABASE_URL`). Each run inserts one throwaway
owner and org (`@e2e.wraps.test`), so it can't delete a fixture `test-web` reads.

Agent steps replay from `apps/e2e/.e2e/cache`, which is committed. CI only reads it.
A step whose recording no longer matches the UI falls back to the live agent, so the
run still passes but every run pays for model calls (`AI_GATEWAY_API_KEY` secret)
until someone records it again: run `pnpm test:e2e` locally and commit the changed
`.e2e/cache` files with the UI change. A recording stores paths, so anything that
differs per run, like the workspace slug, goes into the step as `unique(value)`.
