| node | requirement | verdict | evidence |
|---|---|---|---|
| N0 | baseline recorded before edits | pass | graph/byo-notifications/baseline.txt: typecheck exit 0; 3 auth test files pass |
| N1 | no `better-inbox` import/dep left | pass | grep: only 4 prose comments + historical changelog remain; lockfile has 0 better-inbox |
| N1 | frozen-lockfile install clean, no peer warnings | pass | `pnpm install --frozen-lockfile` no warnings; turbo typecheck auth/db/web exit 0, 13/13 |
| N2 | drizzle schema matches docs/schema.mdx | unresolved | not run |
| N2 | migration additive only | unresolved | not run |
| N3 | routed notification emails from EMAIL_FROM via getWrapsClient | unresolved | not run |
| N3 | processDeliveries cron wired in infra/cron.ts | unresolved | not run |
| N4 | no direct inserts into `notification` remain (per D1) | unresolved | not run |
| N5 | typecheck, lint, tests no worse than baseline | unresolved | not run |
