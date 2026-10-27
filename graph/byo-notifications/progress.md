# Progress
- **Graph:** N0, N1, N2, N3, N4a-d, N5 done. Nothing running.
- **Commits on chore/byo-notifications (from main 3e2e46a4):** cc1be42e deps swap; b59e5086 db tables + indexes; c918bd2b email wiring + cron; 0dc1d375 @wraps/auth/notify; 0e66f394 web + stripe + sign-in; 66700c8b api writers; plus the db-helper removal and lint fixes.
- **Outputs:** this directory (graph.md, checks.md, progress.md, baseline.txt).
- **Decisions:** D1 = auth.api.notify everywhere; D2 = account-health types + workflow failures (15m unread, 1h throttle) + security.new_device_login (immediate, cancelIfRead false). Org FK on notification kept. All three notification list indexes added (via the CONCURRENT manifest).
- **Open issues / not verified:** see the three `unresolved` rows in checks.md. Also: main moved on (7be242ec, invite-signup work) and touches invitations.ts; rebase before a PR. sst synth and the API Lambda bundle (better-auth is now loaded by the HTTP API Lambda, account-health, batch-sender, event-feed-staleness, message-send-cleanup) are unverified. Self-host has no delivery sweep (cron is production-only).
- **Next action:** user decides: supply .env.test (or approve a scratch Neon branch) to apply 0094 + run db suites; approve a real test send; rebase onto main; open the PR.

## Pre-handoff checks (advisor review)
- notify never sends inline here: scheduleDeliveries only sends in-process when `advanced.backgroundTasks.handler` is set; nothing in this repo sets it and better-auth installs no default. The NotificationDeliveries cron is the only sender, so only it needs WRAPS_EMAIL_ROLE_ARN + sts:AssumeRole.
- New signups do not get a "New sign-in" email: isNewDeviceOrIp returns false for a user's first session. Existing users get one on a new IP or user agent.
- Merge with main (7be242ec, invite-signup): clean. Verified on a throwaway branch: frozen install, typecheck 31/31, schema-parity + notify + login tests pass. 7be242ec adds no notifyUser/notifyOrg calls. Branch itself is not merged or rebased.
- Deploy order: .github/workflows/migrate.yml runs `db:migrate` then `db:migrate-indexes` (the 3 concurrent notification indexes) ahead of the API Lambda deploy. apps/web deploys via Vercel git integration and is NOT ordered behind it (documented race in that file). If web promotes before 0094 lands, the inbox queries `seen_at` and notify touches notification_delivery, so the bell errors and notifications are lost (call sites catch and log) until the migration applies. Consider applying the migration manually before merging.
