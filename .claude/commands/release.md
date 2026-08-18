---
name: release
description: Bump a package version, commit, tag, push, and publish — across the wraps, wraps-js, and wraps-py repos, each of which triggers differently.
---

# Release a Package

Releases any publishable package across the three Wraps repos. **The three repos
publish by different mechanisms that are mutually contradictory** — doing the
`wraps` procedure in `wraps-js` silently publishes nothing. Always run Step 0.

## Usage

- `/release cli patch` — bump CLI patch, tag, push, CI does the rest
- `/release mcp minor` — bump `@wraps.dev/mcp`, tag, **and create the GH release**
- `/release email patch` — **ambiguous**, see Step 0
- `/release py-email minor` — bump the Python SDK, tag, push

If no arguments are provided, ask which package and bump type.

## Step 0: Resolve the repo — do this first

The short name determines the repo, and the repo determines everything else.

| Short name | Repo | Directory | Registry | Package |
|---|---|---|---|---|
| `cli` | wraps | `packages/cli` | npm | `@wraps.dev/cli` |
| `cdk` | wraps | `packages/cdk` | npm | `@wraps.dev/cdk` |
| `pulumi` | wraps | `packages/pulumi` | npm | `@wraps.dev/pulumi` |
| `core` | wraps | `packages/core` | npm | `@wraps/core` |
| `mail` | wraps | `packages/mail-audit` | npm | `mail-audit` |
| `email-check` | wraps | `packages/email-check` | npm | `@wraps.dev/email-check` |
| `js-email` | wraps-js | `packages/email` | npm | `@wraps.dev/email` |
| `sms` | wraps-js | `packages/sms` | npm | `@wraps.dev/sms` |
| `client` | wraps-js | `packages/client` | npm | `@wraps.dev/client` |
| `mcp` | wraps-js | `packages/mcp` | npm | `@wraps.dev/mcp` |
| `py-email` | wraps-py | `packages/email` | PyPI | `wraps-email` |

Repo paths: `~/Projects/wraps`, `~/Projects/wraps-js`, `~/Projects/wraps-py`.

**`email` alone is ambiguous** — both wraps-js and wraps-py tag `email-v*`, in
their own repos, at unrelated versions (wraps-js is on 0.9.x, wraps-py on 0.1.x).
If the user says `email`, ask which one. Never guess. Note also that `mail` and
`email-check` are wraps packages and unrelated to either.

`cd` into the resolved repo before doing anything else. Do not assume the
current working directory is the right repo.

## The three mechanisms

Verify against the workflow file if anything looks off — these are the
load-bearing facts.

### wraps — tag push, CI creates the release

`.github/workflows/release.yml`: `on: push: tags: ['*-v*']`

Pushing the tag runs npm publish, builds standalone CLI binaries (CLI only:
darwin-arm64, darwin-x64, linux-x64, linux-arm64), and calls `gh release create`
itself with the assets attached.

**NEVER create the GitHub release manually here.** Releases are immutable — once
created, the tag is locked to it, and CI can neither attach assets nor recreate
it. Pre-creating it breaks the release.

### wraps-js — tag push does nothing; you create the release

`.github/workflows/publish.yml`: `on: release: types: [created]`

**This is the exact inverse of wraps.** Pushing the tag publishes *nothing* — it
is inert. The publish only fires when a GitHub release object is created:

```bash
gh release create <pkg>-v<version> --title "<pkg>-v<version>" --notes "..."
```

CI then verifies `package.json` version matches the tag (hard-fails on mismatch),
runs `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm test`, and publishes
via npm OIDC trusted publishing. There are no binary assets, so creating the
release yourself costs nothing — it is the trigger.

### wraps-py — tag push publishes to PyPI, no release object at all

`.github/workflows/publish.yml`: `on: push: tags: ["email-v*"]`

Tag push runs ruff + ty + pytest, then `uv build --package wraps-email` and
`uv publish --trusted-publishing always` into the `pypi` environment. No GitHub
release is involved in either direction — the repo has none, and none is needed.
Creating one is optional and purely cosmetic; never treat it as the trigger.

## Tag format

`<package>-v<version>` in all three repos — `cli-v2.9.3`, `mcp-v0.5.0`,
`email-v0.1.0`. **Never bare `v<version>`**; every workflow rejects it.

The tag prefix is the short name *the workflow* knows, which is not always the
name in the table above. Both `js-email` and `py-email` tag as `email-v*` — the
disambiguation is which repo you are standing in, not the tag text.

## Steps

1. **Resolve the repo** (Step 0) and `cd` there.
2. **Confirm the branch.** Release from `main` unless the user says otherwise.
   Check `git log origin/main..main` — if local main is ahead, those commits go
   out with this release. Say so explicitly and confirm before pushing.
3. **Read the current version** — `package.json` (wraps, wraps-js) or
   `packages/email/pyproject.toml` (wraps-py).
4. **Review what is actually unreleased**:
   `git log <last-tag>..HEAD --oneline -- <package-dir>`
5. **Sanity-check the bump against that log** (see Semver guard below).
6. **Run the repo's checks** (see Pre-flight below). Never release past red.
7. **Bump the version**, commit as `chore(<pkg>): release v<new-version>`.
8. **Push the commit**, then create and push the annotated tag:
   `git tag -a <pkg>-v<version> -m "<pkg>-v<version>" && git push origin <pkg>-v<version>`
9. **Trigger the publish** — this is the step that differs:
   - wraps: nothing more; the tag push did it.
   - wraps-js: `gh release create` **now**, or nothing publishes.
   - wraps-py: nothing more; the tag push did it.
10. **Watch it**: `gh run watch <run-id> --exit-status`.
11. **Verify it actually landed** — do not trust a green workflow alone:
    - npm: `npm view <pkg> version dist-tags --json`
    - PyPI: `uv pip index versions wraps-email` or check the project page

## Pre-flight checks

Each repo has different scripts. `pnpm check:all` **only exists in wraps** —
running it elsewhere fails with a missing-script error.

**wraps**
```bash
pnpm check:all          # lint, typecheck, baseline, build, test
```

**wraps-js** — no `check:all`; its CLAUDE.md defines the bar as:
```bash
pnpm install --frozen-lockfile   # CI uses this; a stale lockfile fails the run
pnpm lint && pnpm typecheck && pnpm build && pnpm test
```

**wraps-py**
```bash
uv sync --frozen && uv run ruff check && uv run ty check && uv run pytest -q
```

Working directory must be clean apart from the version bump.

## Semver guard

Before accepting the requested bump, read the unreleased log from step 4. If a
`feat:` commit is sitting unreleased and the user asked for `patch`, stop and
flag it — a new tool, export, command, or public surface is a **minor**, not a
patch.

This matters more than usual here: npm and PyPI publishes are permanent. A
version cannot be re-cut, only superseded or yanked. Getting it wrong leaves a
misleading version in the registry forever. Raise it, recommend the correct
bump, and let the user decide.

## Pre-release versions

Append the suffix to both version and tag: `cli-v2.10.0-beta.1`.

- wraps / wraps-js: npm dist-tag (`beta`, `alpha`, `rc`) is set by CI from the
  version string. For wraps-js, pass `--prerelease` to `gh release create`.
- wraps-py: `uv publish` reads the PEP 440 version; use `0.2.0b1` form, not
  `-beta.1`, or the build will not be recognized as a pre-release.

## Rules

- ALWAYS run Step 0 first — the repo decides the entire procedure
- NEVER create a GitHub release in **wraps** (CI owns it, releases are immutable)
- ALWAYS create a GitHub release in **wraps-js** (nothing publishes without it)
- NEVER rely on a GitHub release in **wraps-py** (the tag is the trigger)
- NEVER use bare `v<version>` tags
- NEVER release with failing checks
- NEVER guess when the user says `email` — ask which repo
- ALWAYS confirm before pushing a local main that is ahead of origin
