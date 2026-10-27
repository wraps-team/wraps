# Progress
- **Graph:** drafted; nothing run. Worktree created and `pnpm install --frozen-lockfile` succeeded (baseline deps only).
- **Outputs:** graph.md, checks.md, progress.md in this directory.
- **Decisions:** D1 = auth.api.notify everywhere; D2 = workflow.execution_failed + account-health types (15m ifUnread, 1h throttle) + security.new_device_login (immediate, cancelIfRead false).
- **Open issues:** `apps/web/.env.test` missing in main checkout -> DB tests would use the shared Neon test DB. `scripts/setup-worktree.sh` needs zsh, which is not installed, so the worktree was set up by hand (env links for apps/web/.env.local only; `.claude`/`ai-notes` not linked).
- **Done:** N0 baseline (see baseline.txt).
- **Incident:** an auth test I ran as baseline was DB-backed and hit the dev Neon DB via the symlinked .env.local (fixture user inserted then deleted by the test). No other DB tests run since.
- **Done:** N1 (commit on chore/byo-notifications).
- **Next action:** N2 (packages/db schema+migration) and N3 (packages/auth email wiring + cron) in parallel.
