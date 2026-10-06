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

Two consequences before editing either file:

- **`workflow_run` has no `paths:` filter**, so the deploy's path list lives in the `gate`
  job, which diffs against *the last commit this workflow actually deployed* — not `HEAD^`.
  A `HEAD^` comparison strands changes whenever a deploy is cancelled, fails, or a push
  carries several commits. Keep the list in sync with `pnpm --filter "@wraps/api^..." list`.
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
