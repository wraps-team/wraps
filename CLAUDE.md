# CLAUDE.md - Wraps Project Context

## Workflow

Before modifying any code, read all relevant files and understand the full execution flow first. Do not start making changes while still exploring the codebase. If the task is complex, use a Task agent to explore the codebase before writing any code.

## Error Handling

When implementing new features that involve external API calls (e.g., AWS SDK, Vercel API), always wrap each API call with specific error handling that distinguishes between different error types (e.g., NotFound vs CredentialsError vs PermissionDenied). Never use generic catch-all error messages.

When implementing multi-step features (e.g., create resource → save state → use resource), ensure each step's side effects are persisted before proceeding to the next step. Specifically: save all critical state (IDs, external references) immediately after creation, before any subsequent operations that might fail.

## Project Overview

**Wraps** is a CLI tool, web platform, and TypeScript SDK that deploys communication infrastructure (email via AWS SES, SMS via AWS End User Messaging, CDN via S3+CloudFront) to users' AWS accounts with zero stored credentials, beautiful developer experience, and AWS pricing.

**Core Value Proposition**: One command deploys production-ready infrastructure to the user's AWS account with zero credentials stored, intuitive SDK, beautiful DX, and transparent AWS pricing.

**TypeScript SDKs**:
- [`@wraps.dev/email`](https://github.com/wraps-team/wraps-js) - Send emails through deployed SES infrastructure
- `@wraps.dev/sms` - Send SMS through deployed AWS End User Messaging infrastructure

## Key Concepts

### The Wraps Model
- Deploy infrastructure **to the user's AWS account** (not ours)
- Users own their infrastructure and data
- They pay AWS directly at transparent pricing ($0.10 per 1,000 emails)
- We provide tooling, dashboard, and great DX
- No vendor lock-in (infrastructure stays if they churn)

### Why This Matters
- **Great Developer Experience**: Beautiful DX with TypeScript SDK, dashboards, 30-second setup
- **Full Ownership**: Infrastructure in your AWS account, no vendor lock-in, data residency control
- **Cost-Effective**: Pay AWS directly ($0.10 per 1,000 emails), transparent pricing, scale affordably

## Architecture

### Tech Stack
```json
{
  "monorepo": "turborepo",
  "cli": {
    "args": "args",
    "prompts": "@clack/prompts",
    "colors": "picocolors",
    "completion": "tabtab",
    "bundler": "tsup"
  },
  "infrastructure": "@pulumi/pulumi + @pulumi/aws",
  "deployment": "sst (Serverless Stack)",
  "aws": "@aws-sdk/client-*",
  "web": {
    "framework": "Next.js 16 (App Router, Turbopack)",
    "react": "React 19",
    "styling": "tailwindcss 4.x + shadcn/ui",
    "components": "radix-ui",
    "forms": "@tanstack/react-form + zod",
    "state": "zustand",
    "data": "@tanstack/react-query",
    "editor": "TipTap (email templates)",
    "workflow": "@xyflow/react (workflow builder)"
  },
  "api": {
    "framework": "Elysia.js",
    "runtime": "AWS Lambda (via SST)",
    "auth": "better-auth (passkey + Stripe)"
  },
  "database": {
    "orm": "drizzle-orm",
    "provider": "@neondatabase/serverless (PostgreSQL)",
    "migrations": "drizzle-kit"
  },
  "runtime": "Node.js 20+",
  "language": "TypeScript (strict mode)",
  "packageManager": "pnpm 10",
  "linting": "ultracite + biome",
  "testing": "vitest"
}
```

### Project Structure
```
wraps/                            # Monorepo root
├── apps/
│   ├── api/                     # API server (Elysia.js on Lambda)
│   │   └── src/
│   │       ├── index.ts         # Elysia app entry point
│   │       ├── lambda.ts        # Lambda handler
│   │       ├── routes/          # API route handlers
│   │       ├── middleware/       # Auth middleware
│   │       ├── services/        # Business logic (workflow events, etc.)
│   │       └── (ee)/            # Enterprise edition features
│   ├── web/                     # Dashboard app (Next.js 16)
│   │   └── src/
│   │       ├── app/             # Next.js App Router
│   │       │   ├── (auth)/      # Auth pages
│   │       │   ├── (dashboard)/ # Dashboard pages
│   │       │   ├── (onboarding)/ # Onboarding flow
│   │       │   ├── (public)/    # Public pages (preferences, unsubscribe)
│   │       │   ├── (subscription)/ # Billing pages
│   │       │   └── api/         # Next.js API routes
│   │       ├── actions/         # Server actions
│   │       ├── components/
│   │       │   ├── (ee)/        # Enterprise components
│   │       │   │   └── automation-builder/ # React Flow automation canvas
│   │       │   ├── template-editor/     # TipTap email template editor
│   │       │   └── ui/          # shadcn/ui components
│   │       ├── hooks/           # Custom hooks
│   │       └── lib/             # Utilities
│   └── website/                 # Marketing website (Next.js 16)
│       └── src/
│           ├── app/             # Pages + docs
│           └── components/      # Marketing components
├── packages/
│   ├── auth/                    # Auth config (better-auth + Stripe webhooks)
│   ├── cli/                     # CLI package (@wraps.dev/cli)
│   │   ├── src/
│   │   │   ├── cli.ts           # Entry point (multi-service router)
│   │   │   ├── commands/        # CLI commands
│   │   │   │   ├── auth/        # Auth commands (login, logout, status)
│   │   │   │   ├── aws/         # AWS commands (doctor, setup)
│   │   │   │   ├── cdn/         # CDN commands (init, status, sync, etc.)
│   │   │   │   ├── email/       # Email commands (init, connect, status, etc.)
│   │   │   │   │   ├── inbound.ts  # Inbound email receiving
│   │   │   │   │   ├── templates/  # Templates-as-code (init, push, preview)
│   │   │   │   │   └── workflows/  # Workflow management (push, validate)
│   │   │   │   ├── platform/    # Platform commands (connect, update-role)
│   │   │   │   ├── sms/         # SMS commands (init, status, test, etc.)
│   │   │   │   └── workflow/    # Workflow commands
│   │   │   ├── infrastructure/  # Pulumi stacks
│   │   │   │   ├── email-stack.ts    # Email infrastructure
│   │   │   │   ├── sms-stack.ts      # SMS infrastructure
│   │   │   │   ├── cdn-stack.ts      # CDN infrastructure (S3 + CloudFront)
│   │   │   │   ├── vercel-oidc.ts    # Vercel OIDC setup
│   │   │   │   └── resources/        # Pulumi resource definitions
│   │   │   ├── utils/           # Utilities
│   │   │   │   ├── shared/      # Shared utilities
│   │   │   │   ├── email/       # Email-specific utilities
│   │   │   │   └── sms/         # SMS-specific utilities
│   │   │   └── types/           # TypeScript types
│   │   └── lambda/              # Lambda function source (bundled by esbuild)
│   ├── console/                 # Embedded dashboard (Vite + React, bundled into CLI)
│   ├── core/                    # Shared types, utilities, and Lambda code
│   ├── db/                      # Database (Drizzle ORM + Neon PostgreSQL)
│   │   └── src/
│   │       ├── schema/          # Table definitions
│   │       │   ├── app.ts       # Organizations, memberships
│   │       │   ├── auth.ts      # Auth tables (better-auth)
│   │       │   ├── batch.ts     # Email batch tracking
│   │       │   ├── contacts.ts  # Contact management
│   │       │   ├── events.ts    # Email/SMS events
│   │       │   ├── segments.ts  # Audience segments
│   │       │   ├── templates.ts # Email/SMS templates
│   │       │   ├── usage.ts     # Usage tracking
│   │       │   ├── workflows.ts # Workflow definitions
│   │       │   └── waitlist.ts  # Waitlist
│   │       └── migrations/      # Drizzle migrations
│   ├── email/                   # Internal email utilities (React Email templates)
│   ├── email-check/             # Email deliverability checker
│   ├── cdk/                     # AWS CDK construct (alternative to CLI)
│   ├── pulumi/                  # Pulumi component (npm package)
│   ├── tui/                     # Terminal UI (Bun + @opentui)
│   └── ui/                      # Shared UI components (shadcn)
├── .github/workflows/           # GitHub Actions CI/CD
├── .claude/                     # Claude agent configs and skills
├── sst.config.ts                # SST configuration
└── turbo.json                   # Turborepo configuration
```

## Configuration System

### Feature-Based Configuration
Wraps uses a feature-based configuration system with transparent cost calculations:

**Configuration Presets:**
- **Starter** (~$0.05/mo): Minimal tracking for low-volume senders
  - Open & click tracking
  - Bounce/complaint suppression
  - Perfect for MVPs and side projects

- **Production** (~$2-5/mo): Recommended for most applications
  - Everything in Starter
  - Real-time event tracking (EventBridge)
  - 90-day email history storage
  - Reputation metrics dashboard

- **Enterprise** (~$50-100/mo): High-volume senders
  - Everything in Production
  - Dedicated IP address
  - 1-year email history retention
  - All 10 SES event types tracked

- **Custom**: Configure each feature individually

**Event Processing Architecture:**
```
SES → EventBridge → SQS + DLQ → Lambda → DynamoDB
```

**Supported SES Event Types:**
- SEND, DELIVERY, OPEN, CLICK
- BOUNCE, COMPLAINT, REJECT
- RENDERING_FAILURE, DELIVERY_DELAY, SUBSCRIPTION

## Metadata & Migration System

Wraps uses a versioned metadata system to store deployment configuration and enable seamless migrations as the CLI evolves.

### Metadata Structure

All deployment metadata is stored in `~/.wraps/connections/{accountId}-{region}.json`:

```typescript
{
  "version": "1.0.0",              // Metadata format version
  "accountId": "123456789012",
  "region": "us-east-1",
  "provider": "vercel",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "vercel": {                      // Provider-specific config
    "teamSlug": "my-team",
    "projectName": "my-project"
  },
  "services": {
    "email": {                     // Service-specific config
      "preset": "production",
      "config": {
        "tracking": { "enabled": true },
        "sendingEnabled": true
      },
      "pulumiStackName": "wraps-email-123-us-east-1",
      "deployedAt": "2024-01-01T00:00:00.000Z"
    }
  }
}
```

### Automatic Migrations

The metadata system automatically migrates old formats to new versions when loading:

**Location**: `packages/cli/src/utils/shared/metadata.ts`

```typescript
export async function loadConnectionMetadata(
  accountId: string,
  region: string
): Promise<ConnectionMetadata | null> {
  const data = JSON.parse(content);

  // 1. Migrate legacy format (pre-multi-service)
  if (isLegacyMetadata(data)) {
    const migrated = migrateLegacyMetadata(data);
    await saveConnectionMetadata(migrated);  // Auto-save
    return migrated;
  }

  // 2. Add version if missing
  if (!data.version) {
    data.version = "1.0.0";
    await saveConnectionMetadata(data);
  }

  return data;
}
```

### Benefits

1. **Zero User Intervention**: Migrations happen automatically on load
2. **Backward Compatible**: Old metadata files are seamlessly upgraded
3. **Safe Upgrades**: Migrated data is saved for faster future loads
4. **Future-Proof**: Easy to add new versions and migration paths
5. **Testable**: Each migration function can be unit tested

### Adding New Migrations

When making breaking changes to metadata structure:

1. **Bump Version**: Increment `CURRENT_VERSION` (e.g., "1.0.0" → "1.1.0")

2. **Create Migration Function**:
   ```typescript
   function migrateV1ToV1_1(data: any): ConnectionMetadata {
     return {
       ...data,
       version: "1.1.0",
       newField: data.oldField || "default",  // Add new field
     };
   }
   ```

3. **Add to Migration Chain**:
   ```typescript
   if (data.version === "1.0.0") {
     data = migrateV1ToV1_1(data);
     await saveConnectionMetadata(data);
   }
   ```

4. **Write Tests**: Add tests for the migration in `metadata.test.ts`

### Example: Real Migration

The CLI already successfully migrated from legacy format to v1.0.0:

**Before** (legacy - no services):
```json
{
  "accountId": "123456789012",
  "emailConfig": { ... },
  "preset": "production"
}
```

**After** (v1.0.0 - multi-service):
```json
{
  "version": "1.0.0",
  "accountId": "123456789012",
  "services": {
    "email": {
      "config": { ... },
      "preset": "production"
    }
  }
}
```

This migration happens **transparently** - users never need to manually update their metadata files!

### Multi-Service Architecture

The current v1.0.0 metadata format supports multiple services per AWS account/region:

- **Email**: AWS SES configuration
- **SMS**: AWS End User Messaging / Pinpoint SMS
- **CDN**: S3 + CloudFront

Each service maintains its own configuration, preset, and deployment timestamp while sharing the same AWS account credentials.

## TypeScript SDK

After deploying infrastructure with the CLI, developers use the [`@wraps.dev/email`](https://github.com/wraps-team/wraps-js) SDK to send emails:

```typescript
import { Wraps } from '@wraps.dev/email';

const wraps = new Wraps();

const result = await wraps.emails.send({
  from: 'hello@yourapp.com',
  to: 'user@example.com',
  subject: 'Welcome!',
  html: '<h1>Hello from Wraps!</h1>',
});

if (result.success) {
  console.log('Email sent:', result.data.messageId);
}
```

**Key Features:**
- TypeScript-first with full type safety
- Automatic AWS credential handling (OIDC, IAM roles, or environment variables)
- Simple, intuitive API that makes sending emails delightful
- Built on top of AWS SES for reliability and cost-effectiveness

**Package Details:**
- npm: `@wraps.dev/email`
- GitHub: https://github.com/wraps-team/wraps-js
- Namespace: All future SDKs will use `@wraps.dev` (e.g., `@wraps.dev/sms`, `@wraps.dev/queue`)

## Commands

### Multi-Service Architecture

```bash
wraps <service> <command>
wraps email init           # Deploy email infrastructure
wraps sms init             # Deploy SMS infrastructure
wraps cdn init             # Deploy CDN infrastructure
wraps auth login           # Authenticate with Wraps Platform
```

### Service Commands

#### Email (`wraps email ...`)
| Command | Description |
|---------|-------------|
| `init` | Deploy new email infrastructure (SES, IAM, DynamoDB, Lambda, EventBridge, SQS) |
| `connect` | Connect existing SES (non-destructive, creates `wraps-email-` prefixed resources) |
| `status` | Show current email setup, resources, and links |
| `check` | Check email deliverability for a domain |
| `config` | Email configuration management |
| `test` | Send a test email |
| `upgrade` | Add features (dedicated IP, SMTP credentials, custom tracking domain, etc.) |
| `restore` | Restore infrastructure from saved metadata |
| `destroy` | Remove all email infrastructure |
| `domains add/list/get-dkim/verify/remove` | Domain management for SES |
| `inbound init/status/verify/test/destroy` | Inbound email receiving (MailManager + S3) |
| `templates init/push/preview` | Templates-as-code management |
| `workflows push/validate` | Workflow automation management |

#### SMS (`wraps sms ...`)
| Command | Description |
|---------|-------------|
| `init` | Deploy SMS infrastructure (AWS End User Messaging / Pinpoint) |
| `status` | Show SMS setup |
| `sync` | Apply config changes |
| `test` | Send a test SMS |
| `upgrade` | Add features |
| `register` | Register phone number |
| `verify-number` | Verify phone number |
| `destroy` | Remove SMS infrastructure |

#### CDN (`wraps cdn ...`)
| Command | Description |
|---------|-------------|
| `init` | Deploy CDN infrastructure (S3 + CloudFront) |
| `status` | Show CDN setup |
| `sync` | Apply config changes |
| `verify` | Verify domain DNS |
| `upgrade` | Add features |
| `destroy` | Remove CDN infrastructure |

#### Platform (`wraps platform ...`)
| Command | Description |
|---------|-------------|
| `connect` | Connect AWS account to Wraps Platform |
| `update-role` | Update platform IAM permissions |

#### Auth (`wraps auth ...`)
| Command | Description |
|---------|-------------|
| `login` | Authenticate via device flow |
| `status` | Show auth state |
| `logout` | Sign out |

#### AWS (`wraps aws ...`)
| Command | Description |
|---------|-------------|
| `doctor` | AWS account diagnostics |
| `setup` | AWS CLI setup guide |

### CLI Flag Conventions

**Common Flags:**
- `-p, --provider` - Hosting provider (vercel, aws, railway, other)
- `-r, --region` - AWS region
- `-d, --domain` - Domain name
- `-y, --yes` - Skip confirmation for non-destructive operations
- `-f, --force` - Force operation without confirmation (destructive operations)

## Critical Design Principles

1. **Non-Destructive**: Never modify existing AWS resources
2. **Namespace Everything**: All resources prefixed with `wraps-{service}-` (e.g., `wraps-email-`, `wraps-sms-`)
3. **Fail Fast**: Validate early, deploy confidently
4. **Great UX**: Beautiful output, clear errors, helpful suggestions
5. **Type-Safe**: Strict TypeScript throughout
6. **Testable**: Write tests for critical paths
7. **Documented**: JSDoc comments on public APIs

## Development Guidelines

### Infrastructure Deployment

#### Pulumi Stacks
- **Email** (`email-stack.ts`): SES, IAM, DynamoDB, Lambda, EventBridge, SQS, MailManager, S3 (inbound)
- **SMS** (`sms-stack.ts`): AWS End User Messaging / Pinpoint SMS
- **CDN** (`cdn-stack.ts`): S3 + CloudFront + ACM certificates
- All stacks use inline Pulumi programs (no separate stack files)
- Lambda functions bundled on-the-fly using esbuild
- Deployment state stored in `~/.wraps/` directory

#### Infrastructure Resources (`packages/cli/src/infrastructure/resources/`)
| Resource | Description |
|----------|-------------|
| `iam.ts` | IAM role definitions (OIDC, service roles) |
| `ses.ts` | SES configuration (identities, config sets) |
| `dynamodb.ts` | DynamoDB tables (email history) |
| `lambda.ts` | Lambda functions (event processing) |
| `lambda-inbound.ts` | Lambda for inbound email processing |
| `sqs.ts` / `sqs-inbound.ts` | SQS queues + DLQ |
| `eventbridge.ts` | EventBridge rules (outbound events) |
| `eventbridge-inbound.ts` | EventBridge for inbound email events |
| `eventbridge-user-webhook.ts` | User webhook events |
| `mail-manager.ts` | AWS MailManager (email archives) |
| `s3-cdn.ts` / `s3-inbound.ts` | S3 buckets (CDN, inbound emails) |
| `cloudfront.ts` | CloudFront distribution |
| `acm.ts` | ACM certificates |
| `alerting.ts` | CloudWatch alerting |
| `smtp-credentials.ts` | SMTP authentication |

#### Resource Naming
- All resources: `wraps-{service}-{resource}`
- Example: `wraps-email-role`, `wraps-email-tracking`, `wraps-sms-role`
- Consistent tagging: `ManagedBy: 'wraps-cli'`

### Testing

- Use Vitest for tests
- Mock AWS SDK clients
- Test critical paths: credential validation, deployment flow, error handling
- Keep tests in `__tests__` directories

### Code Style

- Strict TypeScript mode
- ESM modules (not CommonJS) — no `require()` or `module.exports`
- Async/await (no callbacks)
- Destructuring when appropriate
- Clear variable names (no abbreviations unless obvious)
- Use `@ts-expect-error` instead of `@ts-ignore` (fails when the error is fixed)
- No `catch (e: any)` — use `catch (e)` with `instanceof` type guards
- No swallowed errors (`catch (_e)`) in CLI commands — handle specifically

### Banned Dependencies

These are enforced by `baseline.toml` and will fail CI:
- **axios** — use native `fetch()`
- **moment** / **dayjs** — use `date-fns` or `Intl` API
- **next/router** — use `next/navigation` (App Router)
- **@radix-ui/\*** directly in `apps/` — import from `components/ui/` (shadcn wrappers)
- **react-hook-form** — use `@tanstack/react-form` (migration in progress, ratcheted)

### Design System Rules

- No arbitrary hex colors (`bg-[#xxx]`) in `apps/web/` — use theme tokens
- Prefer semantic color tokens (`bg-background`, `text-foreground`, `border-border`) over raw Tailwind colors (`bg-gray-500`)
- Ratchets are actively reducing: raw colors, `as any` assertions, and react-hook-form usage

## Key Files Reference

- **THESIS.md**: Business strategy, product vision, go-to-market plan
- **packages/cli/src/cli.ts**: CLI entry point (args-based multi-service router)
- **packages/cli/src/infrastructure/email-stack.ts**: Email Pulumi stack
- **packages/cli/src/infrastructure/sms-stack.ts**: SMS Pulumi stack
- **packages/cli/src/infrastructure/cdn-stack.ts**: CDN Pulumi stack
- **packages/cli/src/utils/shared/errors.ts**: Error handling and common errors
- **packages/cli/src/utils/shared/config.ts**: Centralized API/app URL helpers
- **packages/db/src/schema/**: All database table definitions
- **apps/api/src/routes/**: API route handlers
- **apps/api/src/services/automation-events.ts**: Automation event emission
- **apps/web/src/actions/**: Next.js server actions
- **apps/web/src/components/(ee)/automation-builder/**: Automation builder (React Flow)
- **apps/web/src/components/template-editor/**: Email template editor (TipTap)

## Common Tasks

### Adding a CLI Command
1. Create file in `packages/cli/src/commands/<service>/`
2. Export async function that takes options
3. Register in `packages/cli/src/cli.ts`
4. Add error handling with `handleCLIError`
5. Add spinner progress indicators
6. Add success output with next steps

### Adding a Pulumi Resource
1. Create file in `packages/cli/src/infrastructure/resources/`
2. Export async function that creates resource
3. Tag with `ManagedBy: 'wraps-cli'`
4. Return resource for use in stack
5. Add to relevant stack (`email-stack.ts`, `sms-stack.ts`, or `cdn-stack.ts`)

### Adding a Database Table/Column
1. Edit or create schema file in `packages/db/src/schema/`
2. Run `pnpm --filter @wraps/db db:generate` to generate migration
3. Run `pnpm --filter @wraps/db db:push` to apply (or `db:migrate` for production)

### Adding an API Route
1. Create route file in `apps/api/src/routes/`
2. Always scope queries by `organizationId`
3. Always `await` async operations (Lambda terminates when handler returns)
4. Emit workflow events for state changes (see `apps/api/CLAUDE.md`)

### Adding a New Error Type
1. Add to `packages/cli/src/utils/shared/errors.ts`
2. Include error code, message, suggestion, and docsUrl
3. Use in command files: `throw errors.yourError()`

## Environment Setup

### Prerequisites
- Node.js 20+
- pnpm 10+
- AWS CLI configured with valid credentials

### Local Development
```bash
pnpm install           # Install dependencies
pnpm build             # Build all packages
pnpm dev               # Watch mode (all packages)
pnpm sst:dev           # Run SST dev (API Lambda + linked resources)
pnpm cli email status  # Run CLI (auto-points at local API/app)
```

### CLI Environment Variables

The `pnpm cli` script automatically sets local dev URLs:

| Variable | Default (via `pnpm cli`) | Production |
|---|---|---|
| `WRAPS_API_URL` | `http://localhost:3001` | `https://api.wraps.dev` |
| `WRAPS_APP_URL` | `http://localhost:3000` | `https://app.wraps.dev` |

URL helpers are centralized in `packages/cli/src/utils/shared/config.ts` (`getApiBaseUrl()`, `getAppBaseUrl()`).

### Testing & Linting
```bash
pnpm test              # Run all tests
pnpm test:ee           # Run enterprise edition tests
pnpm check             # Lint check (ultracite + biome)
pnpm fix               # Auto-fix lint issues
pnpm check:all         # Full CI check: lint → typecheck → baseline → build → test
```

## Resources

- **Pulumi Docs**: https://www.pulumi.com/docs/
- **AWS SDK v3**: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/
- **Elysia.js**: https://elysiajs.com/
- **Drizzle ORM**: https://orm.drizzle.team/
- **Next.js**: https://nextjs.org/docs
- **SST**: https://sst.dev/docs
- **@clack/prompts**: https://github.com/bombshell-dev/clack
- **better-auth**: https://www.better-auth.com/

## Notes for Claude

- Follow the established patterns in existing code
- Prioritize user experience (clear errors, beautiful output)
- Never modify existing AWS resources (non-destructive principle)
- Namespace everything with `wraps-{email|sms|cdn}-` prefix
- Write tests for new features
- Use TypeScript strict mode
- Keep CLI commands simple and focused
- Run `pnpm check:all` before committing
- You can use `pnpm check` and `pnpm fix` from the root of the repo
- Enterprise features go in `(ee)/` directories

## Skills (Auto-Trigger Rules)

Claude MUST automatically apply these skills when the task matches:

### Forms (`.claude/skills/create-form/SKILL.md`)
**Trigger when**: Creating, editing, or refactoring any form component
**Key rules**:
- ALWAYS use `@tanstack/react-form` - NEVER use `react-hook-form`
- Use shadcn/ui Field components (`Field`, `FieldLabel`, `FieldContent`, `FieldError`)
- Zod validation with type inference
- Server actions for form submissions (see server action skill)

### Server Actions (`.claude/skills/create-server-action/SKILL.md`)
**Trigger when**: Creating form submission handlers or API mutations from client components
**Key rules**:
- Use `@tanstack/react-form/nextjs` utilities (`createServerValidate`, `ServerValidateError`)
- Share validation logic between client and server via `formOpts`
- Always catch `ServerValidateError` and return `e.formState`
- Return structured responses with `success` flag

### API Routes (`.claude/skills/wraps-api-developer/SKILL.md`)
**Trigger when**: Creating or editing API routes in `apps/api/`
**Key rules**:
- ALWAYS await async operations (Lambda terminates when handler returns)
- No fire-and-forget promises
- Scope all queries by `organizationId`
- Use correct REST semantics (PATCH adds, PUT replaces)

### Migration Backlog (Forms to Migrate)
These files still use `react-hook-form` and should be migrated to `@tanstack/react-form` when touched:
- `apps/web/src/components/template-editor/new-template-form.tsx`
- `apps/web/src/components/template-editor/save-block-modal.tsx`
- `apps/web/src/components/template-editor/send-test-modal.tsx`
- `apps/web/src/components/template-editor/wrappers/template-name-dialog.tsx`
- `apps/web/src/app/(dashboard)/[orgSlug]/topics/components/preference-center-settings.tsx`
- `apps/web/src/app/(dashboard)/[orgSlug]/topics/components/double-opt-in-settings.tsx`

<!-- NEXT-AGENTS-MD-START -->[Next.js Docs Index]|root: ./.next-docs|STOP. What you remember about Next.js is WRONG for this project. Always search docs and read before any task.|If docs missing, run this command first: npx @next/codemod agents-md --output CLAUDE.md|01-app:{glossary.mdx}|01-app/01-getting-started:{01-installation.mdx,02-project-structure.mdx,03-layouts-and-pages.mdx,04-linking-and-navigating.mdx,05-server-and-client-components.mdx,06-cache-components.mdx,07-fetching-data.mdx,08-updating-data.mdx,09-caching-and-revalidating.mdx,10-error-handling.mdx,11-css.mdx,12-images.mdx,13-fonts.mdx,14-metadata-and-og-images.mdx,15-route-handlers.mdx,16-proxy.mdx,17-deploying.mdx,18-upgrading.mdx}|01-app/02-guides:{analytics.mdx,authentication.mdx,backend-for-frontend.mdx,caching.mdx,ci-build-caching.mdx,content-security-policy.mdx,css-in-js.mdx,custom-server.mdx,data-security.mdx,debugging.mdx,draft-mode.mdx,environment-variables.mdx,forms.mdx,incremental-static-regeneration.mdx,instrumentation.mdx,internationalization.mdx,json-ld.mdx,lazy-loading.mdx,local-development.mdx,mcp.mdx,mdx.mdx,memory-usage.mdx,multi-tenant.mdx,multi-zones.mdx,open-telemetry.mdx,package-bundling.mdx,prefetching.mdx,production-checklist.mdx,progressive-web-apps.mdx,redirecting.mdx,sass.mdx,scripts.mdx,self-hosting.mdx,single-page-applications.mdx,static-exports.mdx,tailwind-v3-css.mdx,third-party-libraries.mdx,videos.mdx}|01-app/02-guides/migrating:{app-router-migration.mdx,from-create-react-app.mdx,from-vite.mdx}|01-app/02-guides/testing:{cypress.mdx,jest.mdx,playwright.mdx,vitest.mdx}|01-app/02-guides/upgrading:{codemods.mdx,version-14.mdx,version-15.mdx,version-16.mdx}|01-app/03-api-reference:{07-edge.mdx,08-turbopack.mdx}|01-app/03-api-reference/01-directives:{use-cache-private.mdx,use-cache-remote.mdx,use-cache.mdx,use-client.mdx,use-server.mdx}|01-app/03-api-reference/02-components:{font.mdx,form.mdx,image.mdx,link.mdx,script.mdx}|01-app/03-api-reference/03-file-conventions/01-metadata:{app-icons.mdx,manifest.mdx,opengraph-image.mdx,robots.mdx,sitemap.mdx}|01-app/03-api-reference/03-file-conventions:{default.mdx,dynamic-routes.mdx,error.mdx,forbidden.mdx,instrumentation-client.mdx,instrumentation.mdx,intercepting-routes.mdx,layout.mdx,loading.mdx,mdx-components.mdx,not-found.mdx,page.mdx,parallel-routes.mdx,proxy.mdx,public-folder.mdx,route-groups.mdx,route-segment-config.mdx,route.mdx,src-folder.mdx,template.mdx,unauthorized.mdx}|01-app/03-api-reference/04-functions:{after.mdx,cacheLife.mdx,cacheTag.mdx,connection.mdx,cookies.mdx,draft-mode.mdx,fetch.mdx,forbidden.mdx,generate-image-metadata.mdx,generate-metadata.mdx,generate-sitemaps.mdx,generate-static-params.mdx,generate-viewport.mdx,headers.mdx,image-response.mdx,next-request.mdx,next-response.mdx,not-found.mdx,permanentRedirect.mdx,redirect.mdx,refresh.mdx,revalidatePath.mdx,revalidateTag.mdx,unauthorized.mdx,unstable_cache.mdx,unstable_noStore.mdx,unstable_rethrow.mdx,updateTag.mdx,use-link-status.mdx,use-params.mdx,use-pathname.mdx,use-report-web-vitals.mdx,use-router.mdx,use-search-params.mdx,use-selected-layout-segment.mdx,use-selected-layout-segments.mdx,userAgent.mdx}|01-app/03-api-reference/05-config/01-next-config-js:{adapterPath.mdx,allowedDevOrigins.mdx,appDir.mdx,assetPrefix.mdx,authInterrupts.mdx,basePath.mdx,browserDebugInfoInTerminal.mdx,cacheComponents.mdx,cacheHandlers.mdx,cacheLife.mdx,compress.mdx,crossOrigin.mdx,cssChunking.mdx,devIndicators.mdx,distDir.mdx,env.mdx,expireTime.mdx,exportPathMap.mdx,generateBuildId.mdx,generateEtags.mdx,headers.mdx,htmlLimitedBots.mdx,httpAgentOptions.mdx,images.mdx,incrementalCacheHandlerPath.mdx,inlineCss.mdx,isolatedDevBuild.mdx,logging.mdx,mdxRs.mdx,onDemandEntries.mdx,optimizePackageImports.mdx,output.mdx,pageExtensions.mdx,poweredByHeader.mdx,productionBrowserSourceMaps.mdx,proxyClientMaxBodySize.mdx,reactCompiler.mdx,reactMaxHeadersLength.mdx,reactStrictMode.mdx,redirects.mdx,rewrites.mdx,sassOptions.mdx,serverActions.mdx,serverComponentsHmrCache.mdx,serverExternalPackages.mdx,staleTimes.mdx,staticGeneration.mdx,taint.mdx,trailingSlash.mdx,transpilePackages.mdx,turbopack.mdx,turbopackFileSystemCache.mdx,typedRoutes.mdx,typescript.mdx,urlImports.mdx,useLightningcss.mdx,viewTransition.mdx,webVitalsAttribution.mdx,webpack.mdx}|01-app/03-api-reference/05-config:{02-typescript.mdx,03-eslint.mdx}|01-app/03-api-reference/06-cli:{create-next-app.mdx,next.mdx}|02-pages/01-getting-started:{01-installation.mdx,02-project-structure.mdx,04-images.mdx,05-fonts.mdx,06-css.mdx,11-deploying.mdx}|02-pages/02-guides:{analytics.mdx,authentication.mdx,babel.mdx,ci-build-caching.mdx,content-security-policy.mdx,css-in-js.mdx,custom-server.mdx,debugging.mdx,draft-mode.mdx,environment-variables.mdx,forms.mdx,incremental-static-regeneration.mdx,instrumentation.mdx,internationalization.mdx,lazy-loading.mdx,mdx.mdx,multi-zones.mdx,open-telemetry.mdx,package-bundling.mdx,post-css.mdx,preview-mode.mdx,production-checklist.mdx,redirecting.mdx,sass.mdx,scripts.mdx,self-hosting.mdx,static-exports.mdx,tailwind-v3-css.mdx,third-party-libraries.mdx}|02-pages/02-guides/migrating:{app-router-migration.mdx,from-create-react-app.mdx,from-vite.mdx}|02-pages/02-guides/testing:{cypress.mdx,jest.mdx,playwright.mdx,vitest.mdx}|02-pages/02-guides/upgrading:{codemods.mdx,version-10.mdx,version-11.mdx,version-12.mdx,version-13.mdx,version-14.mdx,version-9.mdx}|02-pages/03-building-your-application/01-routing:{01-pages-and-layouts.mdx,02-dynamic-routes.mdx,03-linking-and-navigating.mdx,05-custom-app.mdx,06-custom-document.mdx,07-api-routes.mdx,08-custom-error.mdx}|02-pages/03-building-your-application/02-rendering:{01-server-side-rendering.mdx,02-static-site-generation.mdx,04-automatic-static-optimization.mdx,05-client-side-rendering.mdx}|02-pages/03-building-your-application/03-data-fetching:{01-get-static-props.mdx,02-get-static-paths.mdx,03-forms-and-mutations.mdx,03-get-server-side-props.mdx,05-client-side.mdx}|02-pages/03-building-your-application/06-configuring:{12-error-handling.mdx}|02-pages/04-api-reference:{06-edge.mdx,08-turbopack.mdx}|02-pages/04-api-reference/01-components:{font.mdx,form.mdx,head.mdx,image-legacy.mdx,image.mdx,link.mdx,script.mdx}|02-pages/04-api-reference/02-file-conventions:{instrumentation.mdx,proxy.mdx,public-folder.mdx,src-folder.mdx}|02-pages/04-api-reference/03-functions:{get-initial-props.mdx,get-server-side-props.mdx,get-static-paths.mdx,get-static-props.mdx,next-request.mdx,next-response.mdx,use-params.mdx,use-report-web-vitals.mdx,use-router.mdx,use-search-params.mdx,userAgent.mdx}|02-pages/04-api-reference/04-config/01-next-config-js:{adapterPath.mdx,allowedDevOrigins.mdx,assetPrefix.mdx,basePath.mdx,bundlePagesRouterDependencies.mdx,compress.mdx,crossOrigin.mdx,devIndicators.mdx,distDir.mdx,env.mdx,exportPathMap.mdx,generateBuildId.mdx,generateEtags.mdx,headers.mdx,httpAgentOptions.mdx,images.mdx,isolatedDevBuild.mdx,onDemandEntries.mdx,optimizePackageImports.mdx,output.mdx,pageExtensions.mdx,poweredByHeader.mdx,productionBrowserSourceMaps.mdx,proxyClientMaxBodySize.mdx,reactStrictMode.mdx,redirects.mdx,rewrites.mdx,serverExternalPackages.mdx,trailingSlash.mdx,transpilePackages.mdx,turbopack.mdx,typescript.mdx,urlImports.mdx,useLightningcss.mdx,webVitalsAttribution.mdx,webpack.mdx}|02-pages/04-api-reference/04-config:{01-typescript.mdx,02-eslint.mdx}|02-pages/04-api-reference/05-cli:{create-next-app.mdx,next.mdx}|03-architecture:{accessibility.mdx,fast-refresh.mdx,nextjs-compiler.mdx,supported-browsers.mdx}|04-community:{01-contribution-guide.mdx,02-rspack.mdx}<!-- NEXT-AGENTS-MD-END -->
