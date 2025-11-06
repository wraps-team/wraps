# CLAUDE.md - BYO CLI Project Context

## Project Overview

**BYO (Bring Your Own Cloud)** is a CLI tool that deploys email infrastructure (AWS SES) to users' AWS accounts with zero stored credentials, Resend-like developer experience, and AWS pricing.

**Core Value Proposition**: One command deploys production-ready email infrastructure to the user's AWS account with zero credentials stored, Resend-like DX, AWS pricing.

## Key Concepts

### The BYOC Model
- Deploy infrastructure **to the user's AWS account** (not ours)
- Users own their infrastructure and data
- They pay AWS directly (pennies vs. dollars compared to SaaS alternatives)
- We provide tooling, dashboard, and great DX
- No vendor lock-in (infrastructure stays if they churn)

### Why This Matters
- **vs. Resend/Postmark**: No vendor lock-in, lower cost at scale, data residency control
- **vs. Raw AWS**: 10x better DX, 30-second setup vs. 2-hour setup, beautiful dashboards
- **vs. Terraform/Pulumi**: Purpose-built, managed updates, no IaC knowledge required

## Architecture

### Tech Stack
```json
{
  "framework": "Commander.js",
  "prompts": "@inquirer/prompts",
  "infrastructure": "@pulumi/pulumi + @pulumi/aws",
  "ui": {
    "spinners": "ora",
    "colors": "chalk",
    "boxes": "boxen"
  },
  "aws": "@aws-sdk/client-*",
  "bundler": "tsup",
  "runtime": "Node.js 20+",
  "language": "TypeScript (strict mode)",
  "packageManager": "pnpm"
}
```

### Project Structure
```
packages/cli/
├── src/
│   ├── cli.ts                    # Entry point
│   ├── commands/                 # CLI commands
│   │   ├── init.ts              # Deploy new infrastructure
│   │   ├── connect.ts           # Connect existing SES
│   │   ├── status.ts            # Show current setup
│   │   ├── verify.ts            # Verify domain DNS
│   │   └── upgrade.ts           # Upgrade dashboard-only to enhanced
│   ├── infrastructure/           # Pulumi stacks
│   │   ├── email-stack.ts       # Main Pulumi stack
│   │   ├── vercel-oidc.ts       # Vercel OIDC setup
│   │   ├── aws-native.ts        # AWS native (IAM roles)
│   │   └── resources/
│   │       ├── iam.ts           # IAM role definitions
│   │       ├── ses.ts           # SES configuration
│   │       ├── dynamodb.ts      # DynamoDB tables
│   │       ├── lambda.ts        # Lambda functions
│   │       └── sns.ts           # SNS topics
│   ├── providers/                # Platform integrations
│   │   ├── vercel.ts            # Vercel integration
│   │   ├── aws.ts               # AWS native
│   │   └── railway.ts           # Railway (future)
│   ├── utils/                    # Shared utilities
│   │   ├── aws.ts               # AWS SDK helpers
│   │   ├── prompts.ts           # Prompt utilities
│   │   ├── errors.ts            # Error handling
│   │   ├── dns.ts               # DNS record helpers
│   │   └── output.ts            # Console output formatting
│   └── types/
│       └── index.ts             # TypeScript types
├── lambda/                       # Lambda function source
│   ├── event-processor/
│   └── webhook-sender/
└── templates/                    # CloudFormation templates (fallback)
```

## Commands

### 1. `byo init` - Deploy New Infrastructure
- Validates AWS credentials
- Prompts for configuration (provider, region, domain)
- Deploys infrastructure using Pulumi
- Sets up OIDC provider (if Vercel)
- Creates IAM roles, SES config, DynamoDB, Lambda, SNS
- Displays success message with next steps

### 2. `byo connect` - Connect Existing SES
- Scans existing AWS resources (SES domains, config sets, SNS topics)
- Prompts for integration level (dashboard-only or enhanced)
- Deploys **non-destructively** (always create new resources with `byo-` prefix)
- Never modifies existing resources

### 3. `byo status` - Show Current Setup
- Displays integration type, region, domains
- Shows all deployed resources
- Links to dashboard and docs

### 4. `byo verify` - Verify Domain DNS
- Queries DNS records for domain
- Checks DKIM, SPF, DMARC records
- Provides guidance if records missing/incorrect

### 5. `byo upgrade` - Upgrade Integration
- Detects current integration level
- Deploys additional resources
- Updates configuration

## Critical Design Principles

1. **Non-Destructive**: Never modify existing AWS resources
2. **Namespace Everything**: All resources prefixed with `byo-`
3. **Fail Fast**: Validate early, deploy confidently
4. **Great UX**: Beautiful output, clear errors, helpful suggestions
5. **Type-Safe**: Strict TypeScript throughout
6. **Testable**: Write tests for critical paths
7. **Documented**: JSDoc comments on public APIs

## Development Guidelines

### User Experience Patterns

#### Spinner Pattern
```typescript
const progress = new DeploymentProgress();

await progress.step('Validating AWS credentials', async () => {
  return validateAWSCredentials();
});

await progress.step('Creating OIDC provider', async () => {
  return createOIDCProvider();
});
```

#### Success Output
- Use `boxen` for success messages
- Use `chalk` for colors (green for success, red for errors, cyan for values)
- Display role ARN, configuration set name, DNS records
- Always show next steps

#### Error Handling
- Custom `BYOError` class with code, suggestion, and docsUrl
- Clear error messages with actionable suggestions
- Never show raw stack traces to users
- Exit with code 1 on errors

### Infrastructure Deployment

#### Pulumi Stack Entry Point
- Use inline programs (no separate stack file)
- Bundle Lambda functions on-the-fly using esbuild
- Store deployment state in `~/.byo/` directory
- Generate unique external ID for IAM role (security)

#### IAM Roles
- **Vercel**: OIDC provider with AssumeRoleWithWebIdentity
- **AWS Native**: Lambda, EC2, ECS can assume
- **Dashboard-only**: Read-only CloudWatch access
- **Enhanced**: Send + read access (SES, DynamoDB)

#### Resource Naming
- All resources: `byo-{resource-type}`
- Example: `byo-email-role`, `byo-tracking`, `byo-email-history`
- Consistent tagging: `ManagedBy: 'byo-cli'`

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

## Implementation Status

### Phase 1: MVP (Week 1) - IN PROGRESS
- [ ] Basic CLI structure (Commander.js)
- [ ] AWS credential validation
- [ ] Interactive prompts (Inquirer)
- [ ] Simple Pulumi stack (IAM role only)
- [ ] Success output formatting

### Phase 2: Core Deployment (Week 2)
- [ ] Full Pulumi stack (SES, DynamoDB, Lambda, SNS)
- [ ] Vercel OIDC integration
- [ ] Lambda function bundling
- [ ] Error handling
- [ ] `byo status` command

### Phase 3: Existing SES Support (Week 3)
- [ ] `byo connect --existing` flow
- [ ] Resource detection
- [ ] Dashboard-only vs enhanced modes
- [ ] Non-destructive deployment

### Phase 4: Polish (Week 4)
- [ ] DNS verification (`byo verify`)
- [ ] Upgrade command
- [ ] Tests
- [ ] Documentation
- [ ] Publishing to npm

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
3. Tag with `ManagedBy: 'byo-cli'`
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
pnpm typecheck
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

- Always check the spec (notes/cli-spec.md) for implementation details
- Follow the established patterns in existing code
- Prioritize user experience (clear errors, beautiful output)
- Never modify existing AWS resources (non-destructive principle)
- Namespace everything with `byo-` prefix
- Write tests for new features
- Use TypeScript strict mode
- Keep CLI commands simple and focused
