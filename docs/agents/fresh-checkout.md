# `pnpm check:all` in a fresh checkout

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
