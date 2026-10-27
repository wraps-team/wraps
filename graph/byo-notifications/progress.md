# Progress
- **Graph:** N0, N1, N2, N3, N4a-d, N5 done. Nothing running.
- **Commits on chore/byo-notifications (from main 3e2e46a4):** cc1be42e deps swap; b59e5086 db tables + indexes; c918bd2b email wiring + cron; 0dc1d375 @wraps/auth/notify; 0e66f394 web + stripe + sign-in; 66700c8b api writers; plus the db-helper removal and lint fixes.
- **Outputs:** this directory (graph.md, checks.md, progress.md, baseline.txt).
- **Decisions:** D1 = auth.api.notify everywhere; D2 = account-health types + workflow failures (15m unread, 1h throttle) + security.new_device_login (immediate, cancelIfRead false). Org FK on notification kept. All three notification list indexes added (via the CONCURRENT manifest).
- **Open issues / not verified:** see the three `unresolved` rows in checks.md. Also: main moved on (7be242ec, invite-signup work) and touches invitations.ts; rebase before a PR. sst synth and the API Lambda bundle (better-auth is now loaded by the HTTP API Lambda, account-health, batch-sender, event-feed-staleness, message-send-cleanup) are unverified. Self-host has no delivery sweep (cron is production-only).
- **Next action:** user decides: supply .env.test (or approve a scratch Neon branch) to apply 0094 + run db suites; approve a real test send; rebase onto main; open the PR.
