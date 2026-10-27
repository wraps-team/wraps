# Graph: better-inbox 0.5.0 -> @byo-oss/notifications 0.11.1, emails via the app's Wraps account

Worktree: /home/jarod/Projects/wraps.chore-byo-notifications (branch chore/byo-notifications, from main 3e2e46a4)
Status: APPROVED by user. D1 = route through auth.api.notify. D2 = default set + security.new_device_login (email right away, cancelIfRead: false). No source edits made yet.

## Inputs
- **Task:** replace `better-inbox@0.5.0` with `@byo-oss/notifications@0.11.1` (the same package, renamed in 0.7), and send the notification emails through the app's own (dogfood) Wraps/SES account.
- **Output:** a PR-ready branch `chore/byo-notifications` with a passing verification report (`checks.md`).
- **Sources:** /home/jarod/Projects/byo-notifications (`llms.txt`, `docs/upgrading.mdx`, `docs/schema.mdx`, `docs/email.mdx`), /home/jarod/Projects/byo-mailer (`docs/wraps.mdx`), `packages/email/src/lib/client.ts` (`getWrapsClient`).
- **Scope (may change):** `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `apps/web/{package.json,src/lib/auth-client.ts,src/components/site-header.tsx,src/app/globals.css}`, `packages/auth/**`, `packages/db/src/schema/auth.ts` + `packages/db/src/migrations`, `packages/db/src/repositories/notifications.ts`, `infra/cron.ts`, and the notification call sites listed in N4.
- **Out of scope:** the user's uncommitted invite-signup work in the main checkout (separate branch); `apps/website` changelog copy; the byo-notifications repo itself.
- **Limit:** 3 correction attempts per node; 6 nodes.

## What the investigation found (facts the graph is built on)
1. Same package. `better-inbox` was renamed to `@byo-oss/notifications` in 0.7; imports change `better-inbox` -> `@byo-oss/notifications` (+ `/client`, `/react`). Catalog pins `better-inbox: 0.5.0` (pnpm-workspace.yaml:121), plus a `minimumReleaseAgeExclude` entry (line 13). Consumers: `apps/web` and `packages/auth`.
2. Peer deps now: `better-auth ^1.7.7` (repo has 1.7.11, ok), NEW required `@better-auth/core ^1.7.7` (same version as better-auth), optional `@wraps.dev/email >=0.15.1` (repo has ^0.15.1, ok).
3. Schema changed in 0.6 and 0.8 (docs/upgrading.mdx): `notification.seenAt` column + new tables `notificationDelivery` and `inboxPresence`, all FKs `onDelete: cascade`. The Wraps drizzle schema (`packages/db/src/schema/auth.ts:219`) hand-declares only the 0.5 `notification` table, so a migration is required even if email were off. 0.10/0.11: no schema change.
4. **Email only fires through `auth.api.notify`.** Delivery rows are created by `notify` against `routes`. The app today writes notification rows by direct SQL (`notifyUser`/`notifyOrg` in `packages/db/src/repositories/notifications.ts`, `createLoginNotification` in `packages/auth/src/index.ts:229`), which never creates delivery rows, so those would never email. Plugin docs also say not to write its tables from app code. About 16 call sites in `apps/web` and `apps/api` use these helpers.
5. Email also needs a scheduler: `auth.api.processDeliveries({})` (or `sweepAll(auth)`) must run about every minute, or delayed emails and retries never go out. The repo's schedulers are SST `CronV2` in `infra/cron.ts`; `EventFeedStaleness` there already shows the pattern for sending through `getWrapsClient` (WRAPS_EMAIL_ROLE_ARN + sts:AssumeRole on the dogfood email role).
6. "App's Wraps account" = the dogfood SES account that `getWrapsClient()` already resolves (Vercel OIDC / assumed role). `wrapsMailer({ client })` needs a synchronous `{ send }` client, but `getWrapsClient()` is async, so we pass a lazy wrapper. Sender defaults to `process.env.EMAIL_FROM || "Wraps <hello@wraps.dev>"`, the same as every other app email.
7. `wrapsEmail` (old channel) is deprecated in 0.11. Use `mailerChannel({ mailer: wrapsMailer(...) })` from `@byo-oss/notifications/mailer` and `@byo-oss/mailer@0.2.0`.
8. `apps/web/.env.test` does not exist in the main checkout, so tests in this worktree fall back to the shared Neon test DB (the setup script warns about this). DB-backed tests are flagged, not trusted, until that is resolved.

## Decisions (LOCKED at approval)
- **D1 - How do app writers reach email?** (a) **Route writers through `auth.api.notify`** (web server code calls the web auth instance; API Lambdas call the same via `@wraps/auth`), then drop the SQL helpers; (b) keep SQL inserts and add a helper that also writes `notificationDelivery` rows (couples to plugin internals, which the docs forbid); (c) email only the writers that already run in web, leave API-Lambda writers in-app-only for now.
- **D2 - Which types email?** Default routes, `ifUnreadAfter: { minutes: 15 }` with `throttle: { hours: 1 }`: `workflow.execution_failed`, and the account-health types. NOT `security.new_device_login` (would email on every sign-in). Everything else stays in-app only.

## Nodes

| id | name | kind | reads | writes | check |
|---|---|---|---|---|---|
| N0 | baseline | code | worktree | `graph/byo-notifications/baseline.txt` | `pnpm typecheck` + vitest for `packages/auth`, `packages/db`, `apps/web` inbox tests recorded pass/fail BEFORE any edit |
| N1 | dependency swap + rename | code (sed + pnpm) | N0 | pnpm-workspace.yaml, lockfile, apps/web + packages/auth package.json and the 5 import/CSS sites | `rg "better-inbox" apps packages --glob '!node_modules'` returns only prose/changelog hits; `pnpm install --frozen-lockfile` clean; peer-dep warnings for the package = 0 |
| N2 | schema migration | subagent | N1, `docs/schema.mdx` | `packages/db/src/schema/auth.ts`, new migration | drizzle schema field-for-field equals docs/schema.mdx (tables, columns, FKs, cascade); `drizzle-kit generate` yields an additive migration only (no drops); applied to a scratch Neon branch via `pnpm test-db:refresh` |
| N3 | email wiring + processDeliveries cron | subagent | N1, D2, `docs/email.mdx`, `getWrapsClient` | `packages/auth/src/index.ts` (+ new `packages/auth` module for the lazy client), `infra/cron.ts`, new `apps/api/src/workers/notification-deliveries.ts` | unit test with `memoryMailer`: a routed notification produces one send from `EMAIL_FROM` after the delay, none if read first; cron handler test calls `processDeliveries`; `pnpm typecheck` |
| N4 | call-site migration | subagent(s), one per disjoint file group | N2, N3, D1 | notifications.ts repository + call sites in `apps/web/src/actions/*`, `apps/api/src/{routes,workers,(ee)}/*`, `packages/auth/src/stripe-webhooks.ts`, `createLoginNotification` | no remaining direct `insert(notification)`; each touched file's tests green; org-scoping (`organizationId`) preserved per CLAUDE.md invariant 4 |
| N5 | verification gate | code | all | `checks.md` | `pnpm check:all` (or the subset that runs here), `pnpm test` for touched packages, biome, no regression vs N0; a real send is NOT done without the user's go-ahead |

Edges: N0 -> N1 -> {N2, N3} -> N4 -> N5. N2 and N3 are parallel (disjoint files: `packages/db` vs `packages/auth` + `infra`). N4 splits into parallel subagents by file group only after N2 and N3 are accepted. No two nodes edit the same file (N4's `packages/auth/src/*` edits are limited to `stripe-webhooks.ts` and `createLoginNotification`, which N3 does not touch after acceptance).

Code nodes (no model call): N0, N1, N5, and the lockfile/merge steps.

## Gates
Each edge is gated on deterministic evidence recorded in `checks.md`: commands run against the saved files, then the node's report. Model confidence is never evidence.

## Permissions
- Edits stay inside Scope, inside the worktree only.
- Ask before: running a real send, deploying/applying the migration to any shared database (only a scratch Neon branch is allowed), pushing, opening a PR.
- Recoverable point: branch `chore/byo-notifications` at 3e2e46a4; commit per accepted node.

## Learning edges (rules proven so far)
- (none yet)
