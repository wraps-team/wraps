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

## `pnpm check:all` in a fresh checkout

`pnpm install` is **not** enough for `check:all` in a tree nobody has built in — a fresh
clone, a CI runner, or an isolated git worktree. Its `typecheck:infra` step is a bare
`tsc` over `sst.config.ts` and `infra/selfhost.config.ts`, and both files open with
`/// <reference path="./.sst/platform/config.d.ts" />`. That file is *generated*, never
built, so no amount of `turbo run build` produces it. Bootstrap it:

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
