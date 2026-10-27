| node | requirement | verdict | evidence |
|---|---|---|---|
| N0 | baseline recorded before edits | pass | graph/byo-notifications/baseline.txt: typecheck exit 0; 3 auth test files pass |
| N1 | no `better-inbox` import/dep left | pass | grep: only 4 prose comments + historical changelog remain; lockfile has 0 better-inbox |
| N1 | frozen-lockfile install clean, no peer warnings | pass | `pnpm install --frozen-lockfile` no warnings; turbo typecheck auth/db/web exit 0, 13/13 |
| N2 | drizzle schema matches plugin expectations | pass | auth-schema-parity test 3/3 (re-run by lead); drizzle-kit check clean |
| N2 | migration additive only | pass | 0094_certain_hellfire_club.sql (regenerated, unpushed): 0 DROP; 2 CREATE TABLE, 1 ADD COLUMN, FKs, 3 inline indexes on new tables; 3 notification indexes (org_created, user_created, created) stripped to the CONCURRENT manifest per repo rule; pnpm test:architecture 150/150 |
| N2 | migration applied to a database | unresolved | not run: no .env.test; applying (and `db:migrate-indexes` for the CONCURRENT index) needs the user's go-ahead and a safe target |
| N3 | routed notification emails from EMAIL_FROM via getWrapsClient | pass | notifications-config.test (memory adapter + mocked getWrapsClient) + notification-routes.test: 24 pass; from = EMAIL_FROM default Wraps <hello@wraps.dev>; sign-in route immediate, cancelIfRead false |
| N3 | processDeliveries cron wired in infra/cron.ts | pass (unsynthesized) | NotificationDeliveries CronV2 rate(1 minute) prod-only, WRAPS_EMAIL_ROLE_ARN + sts:AssumeRole; apps/api handler + cron-monitors tests 20 pass; typecheck 14/14. NOT verified: sst synth, esbuild bundling of the worker |
| N4 | no direct inserts into `notification` remain (per D1) | unresolved | not run |
| N5 | typecheck, lint, tests no worse than baseline | unresolved | not run |
| N4a | @wraps/auth/notify drop-in, same signatures, production-safe secret | pass | notify.test 12 + notifications-secret 5 (+24 earlier) = 41 pass; typecheck 14/14; architecture 150/150 |
