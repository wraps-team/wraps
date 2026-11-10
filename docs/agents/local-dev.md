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

## Running the dashboard locally

`apps/web/.env.local` (gitignored; `scripts/setup-worktree.sh` symlinks it into each
worktree) is the dashboard's local config:

- `DATABASE_URL` is the long-lived `dev` branch of the test-only Neon project `wraps-test`:
  test data, not production. Tests don't read it (see `test-database.md`).
- `NEXT_PUBLIC_APP_URL` and `BETTER_AUTH_URL` are `https://web.wraps.localhost`. The auth
  client sends sign-up and sign-in there, so a plain `next dev -p <port>` renders the pages
  but every auth request 404s. Run auth flows through `pnpm --filter @wraps/web dev`.
- The Turnstile keys are Cloudflare's always-pass test pair, so local sign-up needs no real
  challenge. The real keys live in Vercel.

## Stopping a server you started

Note its PID when you start it, stop it with `kill <pid>`, then check the port is free with
`ss -ltn | grep ':<port> '`. Never `pkill -f <pattern>`: the pattern matches the shell
running the command, which kills itself (exit 144), and `next dev` or `next-server` also
matches your own `pnpm dev` and other sessions' servers.

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

Node 25+ (and some 24.x builds) ship an experimental `localStorage` global that is
`undefined` without `--localstorage-file`, shadowing jsdom's, so component tests failed
with `Cannot read properties of undefined (reading 'clear')`. `apps/web/vitest.config.ts`
now starts its workers with `--no-experimental-webstorage` when the running Node knows
the flag; nothing to do locally. A `pnpm --filter <name>` that matches no package now
exits non-zero (`failIfNoMatch` in `pnpm-workspace.yaml`); pass `--no-fail-if-no-match`
where an empty match is legitimate.

## `pnpm check:changed`: the diff-only gate

Use it while iterating; keep `pnpm check:all` for the final pre-merge run. It diffs
against the merge-base with `origin/main` (committed, staged, unstaged and untracked
files) and runs only what that diff can have affected, under `nice`, at half the cores:

- **lint**: biome on the changed files only.
- **typecheck**: `turbo --affected`, so the changed packages plus their dependents.
  Cached, with `tsconfig.base.json` in the inputs.
- **test**: the directly changed packages only. Dependents' tests, such as the real-DB
  suites in `apps/api` and `apps/web` (~7 min), are left to `check:all`;
  `CHECK_TEST_DEPENDENTS=1` runs them too. Tests are never cached.
- **design, migrations, infra, scripts**: only when their paths changed.
- **Skipped**: build and knip. `check:all` still runs them.

A change to `turbo.json`, root `package.json` or the lockfile makes turbo treat every
package as affected, so expect a full run then. `CHECK_BASE=<ref>` overrides the base.

`VITEST_MAX_WORKERS` reaches vitest only through `passThroughEnv` on the `test` task.
Turbo's strict env mode otherwise strips it, which is why the old `pnpm test` cap of 4
never applied.

## `pnpm check:all` in a fresh checkout

`check:all` no longer needs a manual SST step in a tree nobody has built in: a fresh clone,
a CI runner, or an isolated git worktree (tests still need `apps/web/.env.test`, above). Its
`typecheck:infra` step
(`scripts/typecheck-infra.sh`) runs the root `tsc` over `sst.config.ts` and
`infra/selfhost.config.ts`, and both files open with
`/// <reference path="./.sst/platform/config.d.ts" />`. That file is *generated*, never
built, so no amount of `turbo run build` produces it. The script checks for both
directories first and, when one is missing, runs the two `sst install` commands itself
(about 20 seconds, no AWS credentials, but it needs network access to download the
providers). It prints the commands and exits 1 if either fails or a file is still missing
afterwards. To bootstrap by hand, for example to run `tsc` directly:

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
