# Local dev

## Dev URLs

`pnpm dev` serves every app through `portless` (a global CLI) on HTTPS hostnames, not
ports, so `localhost:3000` is not listening:

| App | Local dev URL | Production |
|---|---|---|
| Dashboard (`apps/web`) | `https://web.wraps.localhost` | `https://app.wraps.dev` |
| Marketing site (`apps/website`) | `https://website.wraps.localhost` | `https://wraps.dev` |
| API (`apps/api`) | `https://api.wraps.localhost` | `https://api.wraps.dev` |

Run the CLI against them with `pnpm cli:dev`. Plain `pnpm cli` uses the CLI's own
defaults (`http://localhost:3001` / `:3000`), which portless leaves unserved.

## Test environment: `apps/web/.env.test`

Every vitest config (`apps/web`, `apps/api`, `packages/auth`, `packages/db`) loads
`apps/web/.env.test` and hands it to the test workers. It is gitignored, so a fresh
checkout has none, and `pnpm test` then fails in ways that look unrelated (the auth
Stripe-config tests want `STRIPE_*` keys). Create it from the template:

```bash
cp apps/web/.env.test.example apps/web/.env.test
```

The template's non-secret values mirror what `.github/workflows/test.yml` sets, so that
alone makes auth, web and the CLI pass. `DATABASE_URL` is the one secret (CI's
`TEST_DATABASE_URL`); until you add it, the database-backed tests in `apps/api` and
`packages/db` fail with `SASL: client password must be a string`. Leave it **unset**
rather than empty: several auth tests skip when it is undefined but try to connect when it
is `""`. See `docs/agents/test-database.md` for how it becomes a per-checkout branch.

If you keep the keys in `.env.local` instead, `vitest` does not read that file for tests.

## `pnpm check:all` in a fresh checkout

`pnpm install` is **not** enough for `check:all` in a tree nobody has built in — a fresh
clone, a CI runner, or an isolated git worktree. Its `typecheck:infra` step
(`scripts/typecheck-infra.sh`) runs the root `tsc` over `sst.config.ts` and
`infra/selfhost.config.ts`, and both files open with
`/// <reference path="./.sst/platform/config.d.ts" />`. That file is *generated*, never
built, so no amount of `turbo run build` produces it. The script checks for both
directories first and prints these commands when one is missing. Bootstrap it:

```bash
pnpm install
node_modules/.bin/sst install                        # root .sst/platform
cd infra && ../node_modules/.bin/sst install \        # infra/.sst
  --config selfhost.config.ts --stage production
```

The `infra` form is the one CI uses (`.github/workflows/test.yml`, "SST config builds
from zero"). Generate the directories this way rather than copying them from another
checkout: `.sst/platform` is ~460MB and `infra/.sst` ~1.3GB, and both are version-pinned,
so a copy goes stale the moment a branch changes the SST version.

CI runs neither `check:all` nor `typecheck:infra`, so this gate is exercised only
locally — which is why the gap stayed invisible until a fresh worktree hit it.
`pnpm typecheck` itself works anywhere: turbo declares `typecheck: dependsOn ["^build"]`.
