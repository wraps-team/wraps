# AGENTS.md - Wraps

Contributor briefing for this repo. `CLAUDE.md` is a symlink to this file; edit this one.

## Read when

- **Writing or reviewing code** → `CODING_STANDARDS.md` (error handling, banned
  dependencies, security patterns, logging, design-system lint)
- **Running `pnpm check:all` in a fresh clone or worktree** → `docs/agents/fresh-checkout.md`
  (SST bootstrap the build never produces)
- **A Drizzle migration landed, or a worktree was removed** → `docs/agents/test-database.md`
  (refresh or reap the per-worktree Neon branch)
- **Editing CI workflows, or a red `test-api`/`test-web`** → `docs/agents/ci-and-deploy.md`
  (how the production deploy triggers; shared-DB contention)
- **Checking local work in a browser or with the CLI** → `docs/agents/local-dev-urls.md`
  (portless HTTPS hostnames)
- **UI, visual, or marketing-copy work** in `apps/web` or `apps/website` → the
  `design-context` skill (users, brand, design-system inventory)
- **Using Wraps as a product** (CLI flags, SDK calls, presets, pricing) →
  `apps/website/public/llms-full.txt` and `wraps <command> --help`

## Project

**Wraps** is a CLI, web platform, and TypeScript SDK that deploys communication
infrastructure (email via AWS SES, SMS via AWS End User Messaging, CDN via S3+CloudFront)
to the user's own AWS account with zero stored credentials. Users own their infrastructure
and data and pay AWS directly; Wraps provides the tooling and dashboard.

**TypeScript SDKs** (all under `@wraps.dev`): `@wraps.dev/email` (separate repo: `wraps-js`), `@wraps.dev/sms`

## Architecture

Turborepo monorepo with pnpm 11 workspaces. Every package below except `packages/ai`,
except `packages/analytics` and except `packages/observability` has its own CLAUDE.md —
read it before working in that package.

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
| `packages/analytics` | `@wraps/analytics` — server-side PostHog client for `apps/web`, `apps/api` and `packages/auth` (not `apps/website`, which uses a separate key) |
| `packages/observability` | `@wraps/observability` — provider-agnostic `ErrorReporter`, Lambda `createInstrumentHandler`, and `StructuredLogger` contract; zero runtime deps, SDKs injected by each app |
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

The CLI is `wraps <service> <command>`. Services are `email`, `sms`, `cdn`, `auth`, `aws`,
`platform`, `selfhost`, `workflow`, and `license`, plus global commands (`status`,
`doctor`, `destroy`, `console`, `permissions`, `completion`, `telemetry`, `update`,
`news`, `support`), all dispatched from `packages/cli/src/cli.ts`. **Adding or changing a
command** → the `cli-commands` skill.

## Invariants

1. **Non-destructive**: create new AWS resources and leave existing ones untouched.
2. **Namespaced**: prefix every resource `wraps-{service}-` (e.g. `wraps-email-`, `wraps-sms-`).
3. **Validate before deploying.**
4. **Destructive commands need the user**: run `wraps destroy`, `wraps <service> destroy`,
   or any `--force` flag only after the user explicitly confirms.

## Environment

Prerequisites: Node.js 22+, pnpm 11+, AWS CLI configured. Standard scripts live in the
root `package.json`. The non-obvious ones:

```bash
pnpm sst:dev               # SST dev (API Lambda + linked resources)
pnpm cli:dev email status  # CLI against the local portless API/app
pnpm test:ee               # enterprise edition tests
pnpm check:all             # full gate: lint -> typecheck -> baseline -> build -> test
```

<!-- NEXT-AGENTS-MD-START -->
Next.js docs live in `./.next-docs` (gitignored, generated). STOP — what you remember
about Next.js is WRONG for this project; search and read those docs before any Next.js task.
If the directory is missing: `npx @next/codemod agents-md --output AGENTS.md`
<!-- NEXT-AGENTS-MD-END -->

<!-- polylane:start -->
## Investigating production with Polylane

[Polylane](https://polylane.com/?ref=github.onboarding-pr) is an AI production engineer: it watches deploys, telemetry, incidents, and the infrastructure this repository ships to, investigates problems as they happen, and proposes fixes as pull requests. It is connected to this repository and available to coding agents through the [Polylane MCP server](https://mcp.polylane.com/mcp).

- When a question involves production behaviour (an error, a spike, a deploy, a missing signal), query Polylane through its MCP tools before reasoning from the code alone.
- When debugging a failure, start from the incident or issue Polylane recorded: it carries the evidence an investigation already gathered.
- Polylane reviews pull requests in this repository against the live infrastructure. Read its review comment before merging changes that touch production paths.
<!-- polylane:end -->
