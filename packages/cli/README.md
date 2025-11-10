# Wraps CLI

> Deploy production-ready email infrastructure to your AWS account in 30 seconds.

## Features

- **Zero Configuration**: One command deploys everything you need
- **OIDC Support**: Vercel integration with no AWS credentials needed
- **Non-Destructive**: Never modifies existing resources
- **Beautiful UX**: Built with Bomb.sh stack (@clack/prompts) - beautiful interactive prompts and spinners
- **Lightweight**: Uses args (<1kB) for blazing-fast CLI parsing
- **Type-Safe**: Built with strict TypeScript
- **Tab Completion**: Shell completion support (coming soon)

## Prerequisites

- **Node.js 20+**
- **AWS CLI** - Configured with valid credentials
  ```bash
  aws configure
  ```

**Note:** Pulumi CLI will be automatically installed on first run if not already present. You can also pre-install it manually:
```bash
# macOS
brew install pulumi/tap/pulumi

# Linux
curl -fsSL https://get.pulumi.com | sh

# Windows
choco install pulumi
```

## Installation

```bash
npm install -g @wraps/cli
# or
pnpm add -g @wraps/cli
```

## Quick Start

### 1. Deploy New Infrastructure

```bash
wraps init
```

This will:
- ✅ Validate your AWS credentials
- ✅ Prompt for configuration (provider, region, domain)
- ✅ Deploy IAM roles, SES config, DynamoDB, Lambda, SNS
- ✅ Display next steps with role ARN and DNS records

### 2. Check Status

```bash
wraps status
```

Shows:
- Integration level (dashboard-only or enhanced)
- AWS region
- Verified domains
- Deployed resources

## Commands

### `wraps init`

Deploy new email infrastructure to your AWS account.

**Options:**
- `-p, --provider <provider>` - Hosting provider (vercel, aws, railway, other)
- `-r, --region <region>` - AWS region (default: us-east-1)
- `-d, --domain <domain>` - Domain to verify (optional)

**Examples:**

```bash
# Interactive mode (recommended)
wraps init

# With flags
wraps init --provider vercel --region us-east-1 --domain myapp.com
```

### `wraps status`

Show current infrastructure status.

**Options:**
- `--account <account>` - AWS account ID or alias (optional)

**Example:**

```bash
wraps status
```

### `wraps completion`

Generate shell completion script.

**Example:**

```bash
wraps completion
```

This will display tab completion information for your shell.

## Configuration

### Vercel Integration (Recommended)

For Vercel projects, Wraps uses OIDC federation so you never need to store AWS credentials:

```bash
wraps init --provider vercel
```

You'll be prompted for:
- Vercel team slug
- Vercel project name

### AWS Native

For Lambda, ECS, or EC2 deployments:

```bash
wraps init --provider aws
```

Uses IAM roles automatically.

### Other Providers

For Railway, Render, or other platforms:

```bash
wraps init --provider other
```

Note: Will require AWS access keys.

## Integration Levels

### Enhanced (Recommended)

Creates full email tracking infrastructure:
- ✅ IAM role with send permissions
- ✅ SES configuration set
- ✅ DynamoDB table for email history
- ✅ Lambda functions for event processing
- ✅ SNS topics for bounce/complaint handling

### Dashboard-Only

Read-only access for dashboard integration:
- ✅ IAM role with read-only permissions
- ❌ No sending capabilities
- ❌ No email history tracking

## Development

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

## Project Structure

```
packages/cli/
├── src/
│   ├── cli.ts                    # Entry point
│   ├── commands/                 # CLI commands
│   │   ├── init.ts              # Deploy new infrastructure
│   │   └── status.ts            # Show current setup
│   ├── infrastructure/           # Pulumi stacks
│   │   ├── email-stack.ts       # Main stack
│   │   ├── vercel-oidc.ts       # Vercel OIDC setup
│   │   └── resources/           # Resource definitions
│   │       ├── iam.ts
│   │       ├── ses.ts
│   │       └── dynamodb.ts
│   ├── utils/                    # Utilities
│   │   ├── aws.ts
│   │   ├── prompts.ts
│   │   ├── errors.ts
│   │   └── output.ts
│   └── types/
│       └── index.ts
└── dist/                         # Build output
```

## Troubleshooting

### AWS Credentials Not Found

```bash
# Configure AWS CLI
aws configure

# Or set environment variables
export AWS_PROFILE=your-profile
```

### Invalid Region

Make sure you're using a valid AWS region:
- `us-east-1`, `us-east-2`, `us-west-1`, `us-west-2`
- `eu-west-1`, `eu-west-2`, `eu-central-1`
- `ap-southeast-1`, `ap-southeast-2`, `ap-northeast-1`

### Stack Already Exists

If you've already deployed infrastructure:

```bash
# Check status
wraps status

# To redeploy, destroy the existing stack first
# (coming in Phase 3)
```

## Roadmap

### Phase 1: MVP ✅
- [x] Basic CLI structure
- [x] AWS credential validation
- [x] Interactive prompts
- [x] Pulumi stack deployment
- [x] Success output formatting

### Phase 2: Core Deployment (Next)
- [ ] Lambda function bundling
- [ ] Enhanced error handling
- [ ] Vercel environment variable setup
- [ ] CloudWatch alarms

### Phase 3: Existing SES Support
- [ ] `wraps connect` command
- [ ] Resource detection
- [ ] Non-destructive deployment

### Phase 4: Polish
- [ ] `wraps verify` command (DNS verification)
- [ ] `wraps upgrade` command
- [ ] Comprehensive tests
- [ ] Publishing to npm

## License

MIT

## Support

- Documentation: https://docs.wraps.dev
- Issues: https://github.com/wraps-team/wraps/issues
- Dashboard: https://dashboard.wraps.dev
