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

### 1. Deploy New Email Infrastructure

```bash
wraps email init
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
wraps email status
```

Shows:
- Active features and configuration
- AWS region
- Verified domains
- Deployed resources
- Links to console dashboard

## Commands

### Email Commands

#### `wraps email init`

Deploy new email infrastructure to your AWS account.

**Options:**
- `-p, --provider <provider>` - Hosting provider (vercel, aws, railway, other)
- `-r, --region <region>` - AWS region (default: us-east-1)
- `-d, --domain <domain>` - Domain to verify (optional)
- `--preset <preset>` - Configuration preset (starter, production, enterprise, custom)
- `-y, --yes` - Skip confirmation prompts

**Examples:**

```bash
# Interactive mode (recommended)
wraps email init

# With flags
wraps email init --provider vercel --region us-east-1 --domain myapp.com --preset production
```

#### `wraps email status`

Show current infrastructure status.

**Example:**

```bash
wraps email status
```

#### `wraps email connect`

Connect to existing AWS SES infrastructure and add Wraps features.

**Example:**

```bash
wraps email connect
```

#### `wraps email console`

Start local web dashboard for monitoring email activity.

**Example:**

```bash
wraps email console
```

Opens a local dashboard at `http://localhost:3000` with real-time email tracking.

#### `wraps email verify`

Verify domain DNS records and SES status.

**Options:**
- `-d, --domain <domain>` - Domain to verify

**Example:**

```bash
wraps email verify --domain myapp.com
```

#### `wraps email domains`

Manage SES domains (add, list, verify, get DKIM tokens, remove).

##### `wraps email domains add`

Add a new domain to SES with DKIM signing.

**Options:**
- `-d, --domain <domain>` - Domain to add

**Example:**

```bash
wraps email domains add --domain myapp.com
```

##### `wraps email domains list`

List all SES domains with verification status.

**Example:**

```bash
wraps email domains list
```

##### `wraps email domains get-dkim`

Get DKIM tokens for a domain (for DNS configuration).

**Options:**
- `-d, --domain <domain>` - Domain to get DKIM tokens for

**Example:**

```bash
wraps email domains get-dkim --domain myapp.com
```

##### `wraps email domains verify`

Verify domain DNS records (DKIM, SPF, DMARC, MX).

**Options:**
- `-d, --domain <domain>` - Domain to verify

**Example:**

```bash
wraps email domains verify --domain myapp.com
```

##### `wraps email domains remove`

Remove a domain from SES.

**Options:**
- `-d, --domain <domain>` - Domain to remove
- `-f, --force` - Skip confirmation prompt

**Example:**

```bash
wraps email domains remove --domain myapp.com
wraps email domains remove --domain myapp.com --force  # Skip confirmation
```

#### `wraps email upgrade`

Add features to existing infrastructure.

**Example:**

```bash
wraps email upgrade
```

Interactive wizard to:
- Upgrade to a higher preset (Starter → Production → Enterprise)
- Add custom tracking domain
- Change email history retention
- Customize tracked event types
- Enable dedicated IP

#### `wraps email restore`

Restore infrastructure from saved metadata.

**Options:**
- `-r, --region <region>` - AWS region to restore from
- `-f, --force` - Force restore without confirmation (destructive)

**Example:**

```bash
wraps email restore
wraps email restore --region us-west-2 --force  # Skip confirmation
```

#### `wraps email destroy`

Remove all deployed email infrastructure.

**Options:**
- `-f, --force` - Force destroy without confirmation (destructive)

**Example:**

```bash
wraps email destroy
wraps email destroy --force  # Skip confirmation
```

### Global Commands

#### `wraps completion`

Generate shell completion script.

**Example:**

```bash
wraps completion
```

### Legacy Commands (Deprecated)

For backwards compatibility, these commands still work but show deprecation warnings:

```bash
wraps init      # → Use 'wraps email init'
wraps status    # → Use 'wraps email status'
wraps connect   # → Use 'wraps email connect'
wraps verify    # → Use 'wraps email verify'
wraps upgrade   # → Use 'wraps email upgrade'
wraps destroy   # → Use 'wraps email destroy'
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
│   ├── cli.ts                    # Entry point (multi-service router)
│   ├── commands/                 # CLI commands
│   │   ├── email/                # Email service commands
│   │   │   ├── init.ts          # Deploy email infrastructure
│   │   │   ├── connect.ts       # Connect existing SES
│   │   │   ├── console.ts       # Email dashboard
│   │   │   ├── status.ts        # Show email setup
│   │   │   ├── verify.ts        # DNS verification
│   │   │   ├── upgrade.ts       # Add email features
│   │   │   ├── restore.ts       # Restore from metadata
│   │   │   └── destroy.ts       # Remove email infrastructure
│   │   ├── sms/                  # SMS service commands (coming soon)
│   │   ├── init.ts              # Legacy command (deprecated)
│   │   ├── status.ts            # Legacy command (deprecated)
│   │   └── ...                   # Other legacy commands
│   ├── infrastructure/           # Pulumi stacks
│   │   ├── email-stack.ts       # Email infrastructure stack
│   │   ├── vercel-oidc.ts       # Vercel OIDC provider setup
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
│   │   ├── shared/              # Shared utilities
│   │   │   ├── aws.ts           # AWS SDK helpers
│   │   │   ├── prompts.ts       # Interactive prompts
│   │   │   ├── metadata.ts      # Multi-service metadata
│   │   │   ├── errors.ts        # Error handling
│   │   │   ├── output.ts        # Console formatting
│   │   │   ├── fs.ts            # File system helpers
│   │   │   └── pulumi.ts        # Pulumi utilities
│   │   └── email/               # Email-specific utilities
│   │       ├── costs.ts         # Cost calculations
│   │       ├── presets.ts       # Config presets
│   │       └── route53.ts       # DNS helpers
│   └── types/
│       ├── index.ts             # Type exports with backwards compat
│       ├── shared.ts            # Shared types
│       ├── email.ts             # Email-specific types
│       └── sms.ts               # SMS-specific types
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

### Email Commands ✅
- [x] `wraps email init` - Deploy new infrastructure
- [x] `wraps email connect` - Connect existing SES
- [x] `wraps email console` - Local web dashboard
- [x] `wraps email status` - Infrastructure status
- [x] `wraps email verify` - DNS verification
- [x] `wraps email domains` - Domain management
  - [x] `wraps email domains add` - Add domain to SES
  - [x] `wraps email domains list` - List all domains
  - [x] `wraps email domains get-dkim` - Get DKIM tokens
  - [x] `wraps email domains verify` - Verify DNS records
  - [x] `wraps email domains remove` - Remove domain
- [x] `wraps email upgrade` - Add features
- [x] `wraps email restore` - Restore from metadata
- [x] `wraps email destroy` - Clean removal
- [x] `wraps completion` - Shell completion

### SMS Commands 🚧 (Coming Soon)
- [ ] `wraps sms init` - Deploy SMS infrastructure
- [ ] `wraps sms status` - SMS infrastructure status
- [ ] `wraps sms destroy` - Remove SMS infrastructure

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
- [ ] Advanced analytics dashboard
- [ ] Email template management
- [ ] Webhook integrations
- [ ] MAIL FROM domain configuration
- [ ] Custom tracking domain setup

## License

MIT

## Support

- Documentation: https://docs.wraps.dev
- Issues: https://github.com/wraps-team/wraps/issues
- Dashboard: https://dashboard.wraps.dev
