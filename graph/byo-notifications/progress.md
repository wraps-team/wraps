# Progress
- **Graph:** drafted; nothing run. Worktree created and `pnpm install --frozen-lockfile` succeeded (baseline deps only).
- **Outputs:** graph.md, checks.md, progress.md in this directory.
- **Decisions:** D1 = auth.api.notify everywhere; D2 = workflow.execution_failed + account-health types (15m ifUnread, 1h throttle) + security.new_device_login (immediate, cancelIfRead false).
- **Open issues:** `apps/web/.env.test` missing in main checkout -> DB tests would use the shared Neon test DB. `scripts/setup-worktree.sh` needs zsh, which is not installed, so the worktree was set up by hand (env links for apps/web/.env.local only; `.claude`/`ai-notes` not linked).
- **Done:** N0 baseline (see baseline.txt).
- **Incident:** an auth test I ran as baseline was DB-backed and hit the dev Neon DB via the symlinked .env.local (fixture user inserted then deleted by the test). No other DB tests run since.
- **Done:** N1 (commit on chore/byo-notifications).
- **Done:** N2 accepted (b59e5086), N3 accepted (c918bd2b).
- **Running:** N4a: `@wraps/auth/notify` drop-in `notifyUser`/`notifyOrg` backed by `auth.api.notify`, plus production-secret handling.
- **Next action:** after N4a is gated, run N4b (apps/api writers) and N4c (apps/web actions, stripe-webhooks.ts, createLoginNotification) in parallel, then remove the db helpers (N4d, by me) and run N5.

## Advisor-driven additions (before N2/N3 dispatch)
- N2 gate is `packages/auth/src/__tests__/auth-schema-parity.test.ts` (not DB-backed; verified failing on `notification.seenAt` after N1), not a visual docs comparison.
- Every subagent brief forbids db:push / db:migrate / test-db:refresh / DB-backed tests. Applying the migration stays `unresolved` until the user supplies apps/web/.env.test (or a scratch Neon branch).
- N3 builds ONE shared inbox options module + a notifications-only auth instance (with organization plugin) so API Lambdas never import the full auth, and notify/sweep configs cannot drift.
- N3 checks for a double sign-in alert (login-alert-sms / auth-email-hooks) before wiring security.new_device_login, and adds a test that every route key is a literal at its writer.
- N4 design items to settle: org fan-out role filtering (notifyOrg roles/excludeUserIds), call sites using a drizzle transaction (`dbClient`), createLoginNotification needing a deferred auth reference and waiting up to ~1 min for the sweep.
- Follow-up: globals.css `@source` should point at the package `dist` directory (per its AGENTS.md), not `dist/react/index.js`.
- Do not push or open a PR from a state where N2 has not landed (0.11 reads tables the drizzle schema does not declare).

## Decisions made after N3
- security.new_device_login IS routed (immediate, cancelIfRead false), per the user's D2. N3 had held it back for a possible double alert; investigation found no existing sign-in email, and the SMS alert cannot deliver today (no origination identity). Recheck when SMS goes live.
- sendNowIfAway left at the plugin default (true): a user not in the app gets the 15-minute email at the next sweep.
- The 15-min unread / 1h throttle rule also covers workflow.execution_failed (as in D2).
- Not routed on purpose: events.feed_stale (event-feed-staleness.ts already emails the owner directly).
- N3 unverified items: sst synth, esbuild bundling of the worker with better-auth and the @byo-oss packages, self-host has no sweep (cron is production-only).
- N4 design: drop-in `@wraps/auth/notify` so ~30 call sites only change imports; hasRecentNotification (read-only dedupe) stays in @wraps/db.

## Decisions after N4a (accepted behaviour changes)
- notifyUser with organizationId now requires org membership (plugin throws USER_NOT_IN_ORGANIZATION). Affects members.ts (target is a member) and invitations.ts (inviter may have left since inviting: the row is dropped; call sites catch and log). The old helper wrote the row regardless.
- Orgs over 1000 members: notifyOrg throws FAN_OUT_LIMIT_EXCEEDED instead of silently truncating to the first 1000. Call sites catch and log.
- createNotificationsAuth uses BETTER_AUTH_SECRET or a named placeholder, because API Lambdas run NODE_ENV=production and better-auth rejects its default secret there. Proven by a child-process test, not an in-process one (isProduction is read at module load).
- mise.toml in this worktree pins node 24; the workspace CLAUDE.md says 22. Not changed here.
