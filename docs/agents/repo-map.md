# Repo map

Every package below except `packages/ai`, except `packages/analytics`
and except `packages/observability` has its own CLAUDE.md.

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
| `packages/ui` | Shared React component library |
| `packages/unsubscribe-token` | Signed unsubscribe token mint/verify |

## CLI

`wraps <service> <command>`, all dispatched from `packages/cli/src/cli.ts`. Services are
`email`, `sms`, `cdn`, `auth`, `aws`, `platform`, `selfhost`, `workflow`, and `license`,
plus global commands (`status`, `doctor`, `destroy`, `console`, `permissions`,
`completion`, `telemetry`, `update`, `news`, `support`). Adding or changing a command →
the `cli-commands` skill.
