| node | requirement | verdict | evidence |
|---|---|---|---|
| N0 | baseline recorded before edits | pass | baseline.txt: typecheck exit 0; 3 auth test files pass |
| N1 | no `better-inbox` import/dep left | pass | `git grep better-inbox` in apps/packages/infra: only the historical changelog entry |
| N1 | frozen-lockfile install clean, no peer warnings | pass | `pnpm install --frozen-lockfile` clean; lockfile has 0 better-inbox |
| N2 | drizzle schema matches plugin expectations | pass | auth-schema-parity 3/3; `drizzle-kit check` clean |
| N2 | migration additive only | pass | 0094_certain_hellfire_club.sql: 0 DROP; 2 CREATE TABLE, 1 ADD COLUMN, FKs, 3 inline indexes on the new tables; the 3 notification indexes are stripped to the CONCURRENT manifest per repo rule |
| N2 | migration applied to a database | unresolved | NOT RUN: no apps/web/.env.test; needs the user's go-ahead and a safe target. Also needs `db:migrate-indexes` for the 3 concurrent indexes |
| N3 | routed notification emails from EMAIL_FROM via getWrapsClient | pass | notifications-config.test (memory adapter, mocked getWrapsClient) + notification-routes.test pass |
| N3 | processDeliveries cron wired in infra/cron.ts | pass (unsynthesized) | NotificationDeliveries CronV2 rate(1 minute), prod only, WRAPS_EMAIL_ROLE_ARN + sts:AssumeRole; handler + cron-monitors tests pass. NOT verified: sst synth, esbuild bundle of the worker |
| N4a | @wraps/auth/notify drop-in, production-safe secret | pass | notify.test 12 + notifications-secret 5 pass (child-process test proves the placeholder secret under NODE_ENV=production) |
| N4b | apps/api writers use notify; failures cannot abort jobs | pass | 108 api unit tests pass (with NEXT_PUBLIC_APP_URL set); notifyOnce and message-send-cleanup guarded; DLQ notifier uses dynamic import |
| N4c | web actions, Stripe webhooks, sign-in hook use notify | pass | 73 auth tests (incl. rewritten login test) pass; agents-actions web test passes (12) |
| N4d | no direct inserts into `notification` remain in app code | pass | writers removed from packages/db repository; `git grep "insert(.*notification"` only in the DB test fixtures |
| N5 | typecheck, lint, architecture, baseline | pass | `pnpm turbo run typecheck` 31/31; biome 48 changed files 0 errors; test:architecture 150/150; `pnpm baseline` all ratchets pass |
| N5 | DB-backed suites touching notifications | unresolved | NOT RUN (no .env.test): ~12 apps/web action suites, apps/api *-db suites, packages/db repository-notifications-db. They need migration 0094 applied to their test DB |
| N5 | a real email send from the Wraps account | unresolved | NOT DONE on purpose: needs the user's go-ahead; only mock-mailer and mocked-client tests exist |
