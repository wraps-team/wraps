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

`pnpm dev` serves every app through `portless` (a global CLI) on HTTPS hostnames, not
ports. Use these when checking local work in a browser — `localhost:3000` will not be listening:

| App | Local dev URL | Production |
|---|---|---|
| Dashboard (`apps/web`) | `https://web.wraps.localhost` | `https://app.wraps.dev` |
| Marketing site (`apps/website`) | `https://website.wraps.localhost` | `https://wraps.dev` |
| API (`apps/api`) | `https://api.wraps.localhost` | `https://api.wraps.dev` |

`pnpm cli` uses the CLI's own defaults (`http://localhost:3001` / `:3000`); use `pnpm cli:dev`
to point the CLI at the portless URLs above.

## Design Context

Target users, brand personality, aesthetic direction, design principles, accessibility bar,
and the design system inventory live in the `design-context` skill. Read it before any UI,
visual, or marketing-copy work in `apps/web` or `apps/website`.

<!-- NEXT-AGENTS-MD-START -->
Next.js docs live in `./.next-docs` (gitignored, generated). STOP — what you remember
about Next.js is WRONG for this project; search and read those docs before any Next.js task.
If the directory is missing: `npx @next/codemod agents-md --output CLAUDE.md`
<!-- NEXT-AGENTS-MD-END -->
