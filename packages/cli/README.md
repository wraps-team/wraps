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
npm install -g @wraps.dev/cli
# or
pnpm add -g @wraps.dev/cli
# or use npx (no installation required)
npx @wraps.dev/cli init
```

## Quick Start

### 1. Deploy New Infrastructure

```bash
wraps init
```

This will:
- ✅ Validate your AWS credentials
- ✅ Prompt for configuration preset (Starter, Production, Enterprise, or Custom)
- ✅ Show estimated monthly costs based on your volume
- ✅ Deploy infrastructure (IAM roles, SES, DynamoDB, Lambda, EventBridge, SQS)
- ✅ Display next steps with role ARN and DNS records

### 2. Install the SDK

After deploying, install the TypeScript SDK to send emails:

```bash
npm install @wraps.dev/email
# or
pnpm add @wraps.dev/email
```

**Send your first email:**

```typescript
import { Wraps } from '@wraps.dev/email';

const wraps = new Wraps();

await wraps.emails.send({
  from: 'hello@yourapp.com',
  to: 'user@example.com',
  subject: 'Welcome!',
  html: '<h1>Hello from Wraps!</h1>',
});
```

Learn more: [SDK Documentation](https://github.com/wraps-team/wraps-js) | [npm](https://www.npmjs.com/package/@wraps.dev/email)

### 3. Check Status

```bash
wraps status
```

Shows:
- Active features and configuration
- AWS region
- Verified domains
- Deployed resources
- Links to console dashboard

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

### `wraps connect`

Connect to existing AWS SES infrastructure and add Wraps features.

**Options:**
- `--account <account>` - AWS account ID or alias (optional)

**Example:**

```bash
wraps connect
```

### `wraps console`

Start local web dashboard for monitoring email activity.

**Example:**

```bash
wraps console
```

Opens a local dashboard at `http://localhost:3000` with real-time email tracking.

### `wraps verify`

Verify domain DNS records and SES status.

**Options:**
- `-d, --domain <domain>` - Domain to verify

**Example:**

```bash
wraps verify --domain myapp.com
```

### `wraps upgrade`

Add features to existing infrastructure.

**Example:**

```bash
wraps upgrade
```

### `wraps destroy`

Remove all deployed Wraps infrastructure.

**Example:**

```bash
wraps destroy
```

### `wraps completion`

Generate shell completion script.

**Example:**

```bash
wraps completion
```

## Configuration Presets

Wraps offers feature-based configuration presets with transparent cost estimates:

### Starter (~$0.05/mo)
Perfect for MVPs and side projects:
- Open & click tracking
- Bounce/complaint suppression
- Minimal infrastructure

### Production (~$2-5/mo) - Recommended
For most applications:
- Everything in Starter
- Real-time event tracking (EventBridge)
- 90-day email history storage
- Reputation metrics dashboard

### Enterprise (~$50-100/mo)
For high-volume senders:
- Everything in Production
- Dedicated IP address
- 1-year email history retention
- All 10 SES event types tracked

### Custom
Configure each feature individually with granular control.

## Hosting Provider Integration

### Vercel (Recommended)

Wraps uses OIDC federation so you never need to store AWS credentials:

```bash
wraps init --provider vercel
```

You'll be prompted for:
- Vercel team slug
- Vercel project name

### AWS Native

For Lambda, ECS, or EC2 deployments - uses IAM roles automatically:

```bash
wraps init --provider aws
```

### Other Providers

For Railway, Render, or other platforms:

```bash
wraps init --provider other
```

Note: Will require AWS access keys as environment variables.

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
│   │   ├── connect.ts           # Connect existing SES
│   │   ├── console.ts           # Web dashboard
│   │   ├── status.ts            # Show current setup
│   │   ├── verify.ts            # DNS verification
│   │   ├── upgrade.ts           # Add features
│   │   └── destroy.ts           # Clean removal
│   ├── infrastructure/           # Pulumi stacks
│   │   ├── email-stack.ts       # Main stack
│   │   ├── vercel-oidc.ts       # Vercel OIDC setup
│   │   └── resources/           # Resource definitions
│   │       ├── iam.ts           # IAM roles and policies
│   │       ├── ses.ts           # SES configuration
│   │       ├── dynamodb.ts      # Email history storage
│   │       ├── lambda.ts        # Event processing
│   │       ├── sqs.ts           # Event queues + DLQ
│   │       └── eventbridge.ts   # SES event routing
│   ├── console/                  # Web dashboard (React)
│   ├── lambda/                   # Lambda function source
│   │   └── event-processor/     # SQS → DynamoDB processor
│   ├── utils/                    # Utilities
│   │   ├── aws.ts               # AWS SDK helpers
│   │   ├── prompts.ts           # Interactive prompts
│   │   ├── costs.ts             # Cost calculations
│   │   ├── presets.ts           # Config presets
│   │   ├── errors.ts            # Error handling
│   │   └── metadata.ts          # Deployment metadata
│   └── types/
│       └── index.ts
├── lambda/                       # Lambda source (bundled to dist)
└── dist/                         # Build output
    ├── console/                  # Built dashboard
    └── lambda/                   # Lambda source for deployment
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
wraps destroy
wraps init
```

## What's Included

### Core Commands ✅
- [x] `wraps init` - Deploy new infrastructure
- [x] `wraps connect` - Connect existing SES
- [x] `wraps console` - Local web dashboard
- [x] `wraps status` - Infrastructure status
- [x] `wraps verify` - DNS verification
- [x] `wraps upgrade` - Add features
- [x] `wraps destroy` - Clean removal
- [x] `wraps completion` - Shell completion

### Features ✅
- [x] Feature-based configuration presets
- [x] Transparent cost estimation
- [x] Lambda function bundling
- [x] Vercel OIDC integration
- [x] Real-time event tracking (EventBridge → SQS → Lambda → DynamoDB)
- [x] Email history storage
- [x] Bounce/complaint handling
- [x] Non-destructive deployments
- [x] Beautiful interactive prompts
- [x] Comprehensive error handling

### Coming Soon
- [ ] Multi-domain support
- [ ] Advanced analytics dashboard
- [ ] Email template management
- [ ] Webhook integrations

## License

MIT

## Support

- Documentation: https://docs.wraps.dev
- Issues: https://github.com/wraps-team/wraps/issues
- Dashboard: https://dashboard.wraps.dev
