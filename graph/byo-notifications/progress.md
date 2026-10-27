# Progress
- **Graph:** drafted; nothing run. Worktree created and `pnpm install --frozen-lockfile` succeeded (baseline deps only).
- **Outputs:** graph.md, checks.md, progress.md in this directory.
- **Decisions:** D1 = auth.api.notify everywhere; D2 = workflow.execution_failed + account-health types (15m ifUnread, 1h throttle) + security.new_device_login (immediate, cancelIfRead false).
- **Open issues:** `apps/web/.env.test` missing in main checkout -> DB tests would use the shared Neon test DB. `scripts/setup-worktree.sh` needs zsh, which is not installed, so the worktree was set up by hand (env links for apps/web/.env.local only; `.claude`/`ai-notes` not linked).
- **Done:** N0 baseline (see baseline.txt).
- **Incident:** an auth test I ran as baseline was DB-backed and hit the dev Neon DB via the symlinked .env.local (fixture user inserted then deleted by the test). No other DB tests run since.
- **Done:** N1 (commit on chore/byo-notifications).
- **Running:** N2 (packages/db schema + migration; gate = auth-schema-parity test, non-DB) and N3 (packages/auth shared inbox options + notifications-only auth + infra/cron.ts + api worker) in parallel.
- **Next action:** gate N2 and N3 myself against saved files, commit each, then plan N4 (blocked until both accepted).

## Advisor-driven additions (before N2/N3 dispatch)
- N2 gate is `packages/auth/src/__tests__/auth-schema-parity.test.ts` (not DB-backed; verified failing on `notification.seenAt` after N1), not a visual docs comparison.
- Every subagent brief forbids db:push / db:migrate / test-db:refresh / DB-backed tests. Applying the migration stays `unresolved` until the user supplies apps/web/.env.test (or a scratch Neon branch).
- N3 builds ONE shared inbox options module + a notifications-only auth instance (with organization plugin) so API Lambdas never import the full auth, and notify/sweep configs cannot drift.
- N3 checks for a double sign-in alert (login-alert-sms / auth-email-hooks) before wiring security.new_device_login, and adds a test that every route key is a literal at its writer.
- N4 design items to settle: org fan-out role filtering (notifyOrg roles/excludeUserIds), call sites using a drizzle transaction (`dbClient`), createLoginNotification needing a deferred auth reference and waiting up to ~1 min for the sweep.
- Follow-up: globals.css `@source` should point at the package `dist` directory (per its AGENTS.md), not `dist/react/index.js`.
- Do not push or open a PR from a state where N2 has not landed (0.11 reads tables the drizzle schema does not declare).
