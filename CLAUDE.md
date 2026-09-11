# CLAUDE.md - Wraps Project Context

## Workflow

Before modifying any code, read all relevant files and understand the full execution flow first. Do not start making changes while still exploring the codebase. If the task is complex, use a Task agent to explore the codebase before writing any code.

## Error Handling

When implementing new features that involve external API calls (e.g., AWS SDK, Vercel API), always wrap each API call with specific error handling that distinguishes between different error types (e.g., NotFound vs CredentialsError vs PermissionDenied). Never use generic catch-all error messages.

When implementing multi-step features (e.g., create resource -> save state -> use resource), ensure each step's side effects are persisted before proceeding to the next step. Specifically: save all critical state (IDs, external references) immediately after creation, before any subsequent operations that might fail.

## Project Overview

**Wraps** is a CLI tool, web platform, and TypeScript SDK that deploys communication infrastructure (email via AWS SES, SMS via AWS End User Messaging, CDN via S3+CloudFront) to users' AWS accounts with zero stored credentials, beautiful developer experience, and AWS pricing.

**The Wraps Model**: Deploy infrastructure to the user's AWS account (not ours). Users own their infrastructure and data, pay AWS directly at transparent pricing, no vendor lock-in. We provide tooling, dashboard, and great DX.

**TypeScript SDKs** (all under `@wraps.dev`): `@wraps.dev/email` (separate repo: `wraps-js`), `@wraps.dev/sms`

## Architecture Overview

Turborepo monorepo with pnpm 11 workspaces. Every package below except `packages/ai`
has its own CLAUDE.md with detailed context — read it before working in that package.

**Apps**

| Path | What it is |
|---|---|
| `apps/web` | Dashboard (Next.js App Router) — `app.wraps.dev` |
| `apps/website` | Marketing site + docs — `wraps.dev` |
| `apps/api` | Elysia API on AWS Lambda — `api.wraps.dev` |

**Packages**

| Path | What it is |
|---|---|
| `packages/ai` | `@wraps/ai` — AI SDK wiring for template generation and chat |
| `packages/auth` | better-auth setup, SSO/SCIM, org + session handling |
| `packages/cdk` | `@wraps.dev/cdk` — AWS CDK L3 construct for email infra (mirrors `pulumi`) |
| `packages/cli` | `@wraps.dev/cli` — the `wraps` command |
| `packages/console` | Local web console served by `wraps console` |
| `packages/core` | Shared config types + `applyDefaults()` — the source of truth for both IaC packages |
| `packages/db` | Drizzle schema, migrations, repositories |
| `packages/email` | Internal email primitives |
| `packages/email-check` | Deliverability auditing (DKIM/SPF/DMARC/blacklists) behind `wraps email check` |
| `packages/email-send` | Send path shared by API and Lambda |
| `packages/mail-audit` | Mailbox auditing |
| `packages/pulumi` | Pulumi provider for email infra (mirrors `cdk`) |
| `packages/template-render` | React Email → HTML rendering |
| `packages/tui` | Terminal UI components for the CLI |
| `packages/ui` | Shared React component library |
| `packages/unsubscribe-token` | Signed unsubscribe token mint/verify |

`packages/cdk` and `packages/pulumi` deploy the same infrastructure two ways and share
types from `packages/core`. **Change a default in one, change it in both.**

Multi-service CLI architecture: `wraps <service> <command>`. Services are `email`, `sms`,
`cdn`, `auth`, `aws`, `platform`, `selfhost`, `workflow`, and `license`, plus global
commands (`status`, `doctor`, `destroy`, `console`, `permissions`, `completion`, `telemetry`,
`update`, `news`, `support`). The whole tree is dispatched from `packages/cli/src/cli.ts`.
See `cli-commands` skill for the detailed reference.

## Critical Design Principles

1. **Non-Destructive**: Never modify existing AWS resources
2. **Namespace Everything**: All resources prefixed with `wraps-{service}-` (e.g., `wraps-email-`, `wraps-sms-`)
3. **Fail Fast**: Validate early, deploy confidently
4. **Great UX**: Beautiful output, clear errors, helpful suggestions
5. **Type-Safe**: Strict TypeScript throughout

## Banned Dependencies

Enforced by `baseline.toml` (CI will fail):
- **axios** — use native `fetch()`
- **moment** / **dayjs** — use `date-fns` or `Intl` API
- **next/router** — use `next/navigation` (App Router)
- **@radix-ui/\*** directly in `apps/` — import from `components/ui/` (shadcn wrappers)
- **react-hook-form** / **@hookform/resolvers** — use `@tanstack/react-form`

## Security Patterns

- **SSRF Validation**: Webhook URLs must call `validateWebhookUrl()` before HTTP requests
- **Timing-Safe Secrets**: Use `timingSafeEqual()` for webhook secrets, API keys, tokens — never `===`
- **Cross-Org IDOR Prevention**: All DB queries must scope by `organizationId` from `authContext` — never query by ID alone
- **Resource Ownership Validation**: Verify user-provided `awsAccountId` belongs to authenticated org before use

See package-level CLAUDE.md files for specific enforcement patterns.

## Code Style

- ESM modules only — no `require()` or `module.exports`
- Use `@ts-expect-error` instead of `@ts-ignore`
- Structured logging only — never `console.log` in production code paths
  - `apps/web`: Pino logger at `src/lib/logger.ts`
  - `apps/api`: Custom JSON logger at `src/lib/logger.ts`
- Design system: no arbitrary hex colors in `apps/web/` — use semantic theme tokens (`bg-background`, `text-foreground`)

## Environment Setup

Prerequisites: Node.js 22+, pnpm 11+, AWS CLI configured. Standard scripts (`install`, `build`, `dev`, `test`, `check`, `fix`) are in the root `package.json`. The non-obvious ones:

```bash
pnpm sst:dev           # Run SST dev (API Lambda + linked resources)
pnpm cli email status  # Run CLI (auto-points at local API/app)
pnpm test:ee           # Run enterprise edition tests
pnpm check:all         # Full CI check: lint -> typecheck -> baseline -> build -> test
```

### `pnpm check:all` needs a bootstrap in a fresh checkout

`pnpm install` is **not** enough for `check:all` in a tree nobody has built in — a fresh
clone, a CI runner, or an isolated git worktree. Its `typecheck:infra` step is a bare
`tsc` over `sst.config.ts` and `infra/selfhost.config.ts`, and both files open with
`/// <reference path="./.sst/platform/config.d.ts" />`. That file is *generated*, never
built, so no amount of `turbo run build` produces it:

```bash
pnpm install
node_modules/.bin/sst install                        # root .sst/platform
cd infra && ../node_modules/.bin/sst install \        # infra/.sst
  --config selfhost.config.ts --stage production
```

The `infra` form is the one CI uses (`.github/workflows/test.yml`, "SST config builds
from zero"). Do not try to fix this by copying the directories in from another checkout:
`.sst/platform` is ~460MB and `infra/.sst` ~1.3GB, and both are version-pinned, so a copy
goes stale the moment a branch changes the SST version.

Note that CI runs neither `check:all` nor `typecheck:infra`, so this gate is exercised
only locally — which is why the gap stayed invisible until a fresh worktree hit it.
`pnpm typecheck` itself is fine anywhere: turbo declares `typecheck: dependsOn ["^build"]`.

### A worktree owns a Neon branch — reclaim it after teardown

Every git worktree gets its own Neon test-database branch (`wt-<sanitized-name>`) so
parallel test runs cannot collide on the shared fixtures. Deleting the worktree does
**not** delete the branch:

```bash
node scripts/test-db/reap-branches.mjs        # delete wt-* branches whose worktree is gone
node scripts/test-db/reap-branches.mjs --all  # also delete LIVE wt-* branches — use after
                                              # new Drizzle migrations, to force every
                                              # worktree onto fresh schema
```

**Run it after removing the worktree, never before.** The reaper identifies orphans by
the absence of the checkout, so reaping first finds nothing and leaves the branch live
indefinitely.

### After a migration lands, refresh the test branches — two steps, not one

An **existing** `wt-*` branch is reused verbatim forever: `resolve-branch.mjs` cuts a
branch from the shared test DB only when one does not already exist, and never re-cuts
or migrates it afterwards. So a schema change reaches your tests only if you both
update the parent *and* drop the stale child:

```bash
pnpm test-db:refresh   # = db:push:test (updates the shared parent)
                       #   + reap-branches.mjs --self (drops THIS checkout's
                       #     branch so it re-cuts from that parent next run)
```

`--self` is the concurrency-safe form of `--all`: it deletes only the current
checkout's branch, so it cannot pull the database out from under another agent's
worktree mid-run. Use `--all` only when you deliberately want every checkout refreshed.

**`db:push` and `db:push:test` alone do not do this.** `db:push` targets the dev DB in
`.env.local`; `db:push:test` targets the raw `DATABASE_URL` in `.env.test` — the shared
*parent*. Neither is the database your tests read, because every vitest config rewrites
`DATABASE_URL` through `resolveTestDatabaseUrl` to the per-checkout branch. Running
either and seeing tests still fail `42703` is this gap, not a broken push.

`pnpm dev` serves every app through `portless` (a global CLI) on HTTPS hostnames, not
ports. Use these when checking local work in a browser — `localhost:3000` will not be listening:

| App | Local dev URL | Production |
|---|---|---|
| Dashboard (`apps/web`) | `https://web.wraps.localhost` | `https://app.wraps.dev` |
| Marketing site (`apps/website`) | `https://website.wraps.localhost` | `https://wraps.dev` |
| API (`apps/api`) | `https://api.wraps.localhost` | `https://api.wraps.dev` |

`pnpm cli` uses the CLI's own defaults (`http://localhost:3001` / `:3000`); use `pnpm cli:dev`
to point the CLI at the portless URLs above.

## CI and the production deploy

`deploy-api.yml` does **not** trigger on `push`. It triggers on the Test workflow
*completing* for a commit on main, and deploys only if that run's conclusion is `success`:

```yaml
on:
  workflow_run:
    workflows: [Test]
    types: [completed]
    branches: [main]
```

It used to call `test.yml` as a reusable workflow. Do not go back to that. `test.yml`
carries a workflow-level `concurrency` group for the single shared Neon test database, so
the called copy and the standalone push-triggered run competed for one slot: on `92413fa3`
the called copy lost, all twelve jobs were cancelled, and `deploy` was skipped — a
production deploy that silently did not happen, on a run whose conclusion read `cancelled`
rather than `failure`. `baseline/deploy-api-workflow.test.ts` fails if `deploy-api.yml`
calls `test.yml` again.

Two consequences before editing either file:

- **`workflow_run` has no `paths:` filter**, so the deploy's path list lives in the `gate`
  job, which diffs against *the last commit this workflow actually deployed* — not `HEAD^`.
  A `HEAD^` comparison strands changes whenever a deploy is cancelled, fails, or a push
  carries several commits. Keep the list in sync with `pnpm --filter "@wraps/api^..." list`.
- **The deploy checks out the tested SHA** (`needs.gate.outputs.sha`), not the branch tip.
  Under `workflow_run` the default checkout is main's head at trigger time, which may
  already be a newer, untested commit.

### A red `test-api`/`test-web` is usually contention, not code

Every DB-backed CI job shares one Neon branch — `TEST_DATABASE_URL` is a single secret, and
`resolve-branch.mjs` only isolates worktrees, never CI. `test.yml`'s concurrency group
serialises runs **per ref**, so two pushes to main queue behind each other, but two
different PRs still run at once and collide.

The signature: `test-api` and `test-web` fail while every other job passes, and the
failures sit in `*-db.test.ts` files — rows coming back `undefined`, FK `23503`, duplicate
keys, PATCH routes returning 500. Check for overlapping runs before reading the diff:

```bash
gh run list --workflow=test.yml --limit 5 --json headBranch,startedAt,conclusion
```

On 2026-09-09 four runs started within 135 seconds and all four failed; the next run, with
the database to itself, passed on unchanged code.

## Design Context

Target users, brand personality, aesthetic direction, design principles, accessibility bar,
and the design system inventory live in the `design-context` skill. Read it before any UI,
visual, or marketing-copy work in `apps/web` or `apps/website`.

<!-- NEXT-AGENTS-MD-START -->
Next.js docs live in `./.next-docs` (gitignored, generated). STOP — what you remember
about Next.js is WRONG for this project; search and read those docs before any Next.js task.
If the directory is missing: `npx @next/codemod agents-md --output CLAUDE.md`
<!-- NEXT-AGENTS-MD-END -->

<!-- polylane:start -->
## Investigating production with Polylane

[Polylane](https://polylane.com/?ref=github.onboarding-pr) is an AI production engineer: it watches deploys, telemetry, incidents, and the infrastructure this repository ships to, investigates problems as they happen, and proposes fixes as pull requests. It is connected to this repository and available to coding agents through the [Polylane MCP server](https://mcp.polylane.com/mcp).

- When a question involves production behaviour (an error, a spike, a deploy, a missing signal), query Polylane through its MCP tools before reasoning from the code alone.
- When debugging a failure, start from the incident or issue Polylane recorded: it carries the evidence an investigation already gathered.
- Polylane reviews pull requests in this repository against the live infrastructure. Read its review comment before merging changes that touch production paths.
<!-- polylane:end -->
