# CLAUDE.md - Wraps CLI Project Context

## Project Overview

**Wraps** is a CLI tool and TypeScript SDK that deploys email infrastructure (AWS SES) to users' AWS accounts with zero stored credentials, beautiful developer experience, and AWS pricing.

**Core Value Proposition**: One command deploys production-ready email infrastructure to the user's AWS account with zero credentials stored, intuitive SDK, beautiful DX, and transparent AWS pricing.

**TypeScript SDK**: [`@wraps.dev/email`](https://github.com/wraps-team/wraps-js) provides a simple, type-safe interface for sending emails through the deployed infrastructure. Available on [npm](https://www.npmjs.com/package/@wraps.dev/email).

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
    "prompts": "@clack/prompts",
    "args": "args",
    "colors": "picocolors",
    "completion": "tabtab"
  },
  "infrastructure": "@pulumi/pulumi + @pulumi/aws",
  "aws": "@aws-sdk/client-*",
  "frontend": {
    "framework": "React 19",
    "bundler": "vite",
    "styling": "tailwindcss 4.x + shadcn/ui",
    "components": "radix-ui",
    "forms": "react-hook-form + zod",
    "routing": "react-router-dom",
    "state": "zustand"
  },
  "bundler": "tsup (CLI), vite (web)",
  "runtime": "Node.js 20+",
  "language": "TypeScript (strict mode)",
  "packageManager": "pnpm",
  "linting": "ultracite + biome",
  "testing": "vitest"
}
```

### Project Structure
```
wraps/                            # Monorepo root
├── apps/
│   └── website/                  # Marketing website (Vite + React + shadcn)
│       ├── src/
│       │   ├── app/             # App pages
│       │   ├── components/      # React components
│       │   ├── contexts/        # React contexts
│       │   ├── hooks/           # Custom hooks
│       │   ├── lib/             # Libraries
│       │   └── utils/           # Utilities
│       └── public/              # Public assets
├── packages/
│   ├── cli/                     # CLI package
│   │   ├── src/
│   │   │   ├── cli.ts           # Entry point (multi-service router)
│   │   │   ├── commands/        # CLI commands
│   │   │   │   ├── email/       # Email service commands
│   │   │   │   │   ├── init.ts    # Deploy email infrastructure
│   │   │   │   │   ├── connect.ts # Connect existing SES
│   │   │   │   │   ├── status.ts  # Show email setup
│   │   │   │   │   ├── verify.ts  # Verify domain DNS
│   │   │   │   │   ├── upgrade.ts # Upgrade email features
│   │   │   │   │   ├── restore.ts # Restore email from metadata
│   │   │   │   │   └── destroy.ts # Remove email infrastructure
│   │   │   │   ├── sms/         # SMS service commands (coming soon)
│   │   │   │   ├── init.ts      # Legacy command (deprecated)
│   │   │   │   ├── connect.ts   # Legacy command (deprecated)
│   │   │   │   └── ...          # Other legacy commands
│   │   │   ├── infrastructure/  # Pulumi stacks
│   │   │   │   ├── email-stack.ts    # Email infrastructure stack
│   │   │   │   ├── vercel-oidc.ts    # Vercel OIDC setup
│   │   │   │   └── resources/
│   │   │   │       ├── iam.ts        # IAM role definitions
│   │   │   │       ├── ses.ts        # SES configuration
│   │   │   │       ├── dynamodb.ts   # DynamoDB tables
│   │   │   │       ├── lambda.ts     # Lambda functions
│   │   │   │       ├── sqs.ts        # SQS queues + DLQ
│   │   │   │       └── eventbridge.ts # EventBridge rules
│   │   │   ├── utils/           # Utilities
│   │   │   │   ├── shared/      # Shared utilities
│   │   │   │   │   ├── aws.ts       # AWS SDK helpers
│   │   │   │   │   ├── prompts.ts   # Prompt utilities (@clack/prompts)
│   │   │   │   │   ├── metadata.ts  # Multi-service metadata storage
│   │   │   │   │   ├── errors.ts    # Error handling
│   │   │   │   │   ├── output.ts    # Console output (picocolors)
│   │   │   │   │   ├── fs.ts        # File system helpers
│   │   │   │   │   ├── scanner.ts   # Resource scanner
│   │   │   │   │   └── pulumi.ts    # Pulumi utilities
│   │   │   │   ├── email/       # Email-specific utilities
│   │   │   │   │   ├── costs.ts     # Cost calculations
│   │   │   │   │   ├── presets.ts   # Config presets
│   │   │   │   │   └── route53.ts   # Route53 DNS helpers
│   │   │   │   └── sms/         # SMS-specific utilities (coming soon)
│   │   │   └── types/
│   │   │       ├── index.ts     # Type exports with backwards compat
│   │   │       ├── shared.ts    # Shared types (Provider, ServiceType, etc.)
│   │   │       ├── email.ts     # Email-specific types
│   │   │       └── sms.ts       # SMS-specific types
│   │   └── lambda/              # Lambda function source
│   │       └── event-processor/ # SQS -> DynamoDB processor
│   ├── console-ui/              # Dashboard application (Vite + React)
│   │   └── src/
│   │       ├── components/      # UI components
│   │       ├── contexts/        # React contexts
│   │       ├── hooks/           # Custom hooks
│   │       ├── lib/             # Libraries
│   │       └── styles/          # Styles
│   └── ui/                      # Shared UI components (shadcn)
│       └── src/
│           ├── components/      # Reusable components
│           ├── hooks/           # Shared hooks
│           ├── lib/             # Utilities
│           └── styles/          # Shared styles
├── .github/workflows/           # GitHub Actions CI/CD
├── .cursor/rules/               # Cursor IDE rules
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

Wraps CLI now uses a multi-service command structure to support email, SMS, and future services:

```bash
wraps <service> <command>  # New format
wraps email init           # Deploy email infrastructure
wraps sms init            # Deploy SMS infrastructure (coming soon)
```

**Legacy commands** (deprecated but still work):
```bash
wraps init    # ⚠️ Deprecated: Use 'wraps email init'
wraps status  # ⚠️ Deprecated: Use 'wraps email status'
```

### Email Commands

#### 1. `wraps email init` - Deploy New Email Infrastructure
- Validates AWS credentials
- Prompts for configuration preset (or custom config)
- Shows estimated monthly costs based on volume
- Validates configuration (warns about potential issues)
- Deploys infrastructure using Pulumi
- Sets up OIDC provider (if Vercel)
- Creates IAM roles, SES config, DynamoDB, Lambda, EventBridge, SQS
- Displays success message with next steps

#### 2. `wraps email connect` - Connect Existing SES
- Scans existing AWS resources (SES domains, config sets)
- Prompts for feature selection
- Deploys **non-destructively** (always create new resources with `wraps-email-` prefix)
- Never modifies existing resources

#### 3. `wraps email status` - Show Current Email Setup
- Displays active features, region, domains
- Shows all deployed resources
- Links to dashboard and docs

#### 4. `wraps email verify` - Verify Domain DNS
- Queries DNS records for domain
- Checks DKIM, SPF, DMARC records
- Provides guidance if records missing/incorrect

#### 5. `wraps email domains` - Domain Management
Comprehensive domain management commands for AWS SES:

##### `wraps email domains add` - Add Domain to SES
- Creates email identity in SES
- Configures DKIM signing (RSA 2048-bit)
- Returns DKIM tokens for DNS configuration
- Options: `-d/--domain <domain>`

##### `wraps email domains list` - List All Domains
- Lists all SES email identities (domains only)
- Shows verification status
- Displays DKIM status
- Filters out email addresses

##### `wraps email domains get-dkim` - Get DKIM Tokens
- Retrieves DKIM tokens for domain
- Displays DNS records to configure
- Shows current DKIM status
- Options: `-d/--domain <domain>`

##### `wraps email domains verify` - Verify DNS Records
- Checks DKIM CNAME records
- Verifies SPF TXT record
- Validates DMARC TXT record
- Checks MAIL FROM MX records (if configured)
- Options: `-d/--domain <domain>`

##### `wraps email domains remove` - Remove Domain
- Deletes email identity from SES
- Confirms before deletion (unless `--force`)
- Options: `-d/--domain <domain>`, `-f/--force`

#### 6. `wraps email upgrade` - Add Email Features
- Shows currently enabled features
- Prompts for additional features to enable
- Deploys new resources incrementally
- Updates IAM policies as needed
- Options: upgrade preset, add custom tracking domain, change retention, enable dedicated IP

#### 7. `wraps email restore` - Restore from Metadata
- Restores email infrastructure from saved metadata
- Useful for disaster recovery or re-deployment
- Options: `-r/--region <region>`, `-f/--force`

#### 8. `wraps email destroy` - Remove Email Infrastructure
- Destroys all email infrastructure
- Deletes connection metadata
- Non-reversible (with confirmation prompt)
- Options: `-f/--force`

### CLI Flag Conventions

Wraps uses consistent flag naming with short aliases across all commands:

**Common Flags:**
- `-p, --provider` - Hosting provider (vercel, aws, railway, other)
- `-r, --region` - AWS region
- `-d, --domain` - Domain name
- `-y, --yes` - Skip confirmation for non-destructive operations
- `-f, --force` - Force operation without confirmation (destructive operations)

**Destructive vs Non-Destructive:**
- Use `--yes/-y` for non-destructive operations (init, connect, upgrade)
- Use `--force/-f` for destructive operations (destroy, restore, domains remove)
- This distinction helps prevent accidental data loss

## Critical Design Principles

1. **Non-Destructive**: Never modify existing AWS resources
2. **Namespace Everything**: All resources prefixed with `wraps-email`
3. **Fail Fast**: Validate early, deploy confidently
4. **Great UX**: Beautiful output, clear errors, helpful suggestions
5. **Type-Safe**: Strict TypeScript throughout
6. **Testable**: Write tests for critical paths
7. **Documented**: JSDoc comments on public APIs

## Development Guidelines

### Infrastructure Deployment

#### Pulumi Stack Entry Point
- Use inline programs (no separate stack file)
- Bundle Lambda functions on-the-fly using esbuild
- Store deployment state in `~/.wraps/` directory
- Generate unique external ID for IAM role (security)

#### IAM Roles
Policies are feature-based and grant minimum required permissions:

- **Vercel**: OIDC provider with AssumeRoleWithWebIdentity
- **AWS Native**: Lambda, EC2, ECS can assume via IAM roles
- **Base permissions**: Always include SES metrics + CloudWatch read access
- **Sending enabled**: Adds SES send permissions (SendEmail, SendRawEmail, etc.)
- **Event tracking**: Adds EventBridge + SQS permissions
- **History storage**: Adds DynamoDB read/write permissions

#### Resource Naming
- All resources: `wraps-{resource-type}-`
- Example: `wraps-email-role`, `wraps--email-tracking`, `wraps-email-history`
- Consistent tagging: `ManagedBy: 'wraps-cli'`

### Testing

- Use Vitest for tests
- Mock AWS SDK clients
- Test critical paths: credential validation, deployment flow, error handling
- Keep tests in `__tests__` directories

### Code Style

- Strict TypeScript mode
- ESM modules (not CommonJS)
- Async/await (no callbacks)
- Destructuring when appropriate
- Clear variable names (no abbreviations unless obvious)

## Key Files Reference

- **notes/cli-spec.md**: Complete technical specification for CLI implementation
- **THESIS.md**: Business strategy, product vision, go-to-market plan
- **packages/cli/src/cli.ts**: CLI entry point (Commander.js setup)
- **packages/cli/src/infrastructure/email-stack.ts**: Main Pulumi stack
- **packages/cli/src/utils/errors.ts**: Error handling and common errors
- **packages/cli/src/utils/output.ts**: Console output formatting utilities


## Common Tasks

### Adding a New Command
1. Create file in `packages/cli/src/commands/`
2. Export async function that takes options
3. Register in `packages/cli/src/cli.ts`
4. Add error handling with `handleCLIError`
5. Add spinner progress indicators
6. Add success output with next steps

### Adding a New Pulumi Resource
1. Create file in `packages/cli/src/infrastructure/resources/`
2. Export async function that creates resource
3. Tag with `ManagedBy: 'wraps-cli'`
4. Return resource for use in stack
5. Add to main stack in `email-stack.ts`

### Adding a New Error Type
1. Add to `packages/cli/src/utils/errors.ts`
2. Include error code, message, suggestion, and docsUrl
3. Use in command files: `throw errors.yourError()`

## Environment Setup

### Prerequisites
- Node.js 20+
- pnpm
- AWS CLI configured with valid credentials

### Local Development
```bash
# Install dependencies
pnpm install

# Build CLI
pnpm build

# Test locally
node dist/cli.js init

# Watch mode (for development)
pnpm dev
```

### Testing
```bash
# Run tests
pnpm test

# Watch mode
pnpm test:watch

# Type checking
pnpm check

# Fix some type issues
pnpm fix
```

## Success Criteria

- ✅ One command deploys infrastructure (< 2 minutes)
- ✅ Beautiful terminal output (spinners, colors, boxes)
- ✅ Clear error messages with suggestions
- ✅ Non-destructive (never breaks existing setups)
- ✅ Type-safe (strict TypeScript)
- ✅ Tested (critical paths have tests)
- ✅ Works on macOS, Linux, Windows

## Resources

- **Pulumi Docs**: https://www.pulumi.com/docs/
- **AWS SDK v3**: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/
- **Commander.js**: https://github.com/tj/commander.js
- **Inquirer**: https://github.com/SBoudrias/Inquirer.js
- **Ora**: https://github.com/sindresorhus/ora

## Notes for Claude

- Follow the established patterns in existing code
- Prioritize user experience (clear errors, beautiful output)
- Never modify existing AWS resources (non-destructive principle)
- Namespace everything with `wraps-${email|text|queue}-` prefix
- Write tests for new features
- Use TypeScript strict mode
- Keep CLI commands simple and focused