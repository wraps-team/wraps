# Wraps CLI

> Deploy email, SMS, and CDN infrastructure to your AWS account.

## What It Creates

### Email (`wraps email init`)
- **IAM Role** with OIDC trust policy (for Vercel) or instance profile (for AWS-native)
- **SES Configuration Set** with event tracking rules
- **EventBridge Rule** to capture SES events
- **SQS Queue + Dead Letter Queue** for event buffering
- **Lambda Function** to process events and write to DynamoDB
- **DynamoDB Table** for email history storage

### SMS (`wraps sms init`)
- **IAM Role** with scoped permissions for End User Messaging
- **Phone Pool** with toll-free number via AWS End User Messaging
- **Lambda Function** to process delivery receipts
- **DynamoDB Table** for message history storage
- **EventBridge Rule** to capture SMS events

### CDN (`wraps cdn init`)
- **IAM Role** with scoped permissions for S3 and CloudFront
- **S3 Bucket** with private access and origin access control
- **CloudFront Distribution** with global edge caching
- **ACM Certificate** with automatic DNS validation

All resources are tagged with `ManagedBy: wraps-cli` and prefixed with `wraps-{service}-`.

## Features

- `--preview` flag shows what would be created without deploying
- OIDC federation for Vercel (no AWS credentials in your app)
- Never modifies existing AWS resources
- Stores deployment metadata locally in `~/.wraps/`

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
npx @wraps.dev/cli email init
```

## Quick Start

### 1. Deploy Infrastructure

```bash
# Email
wraps email init

# SMS
wraps sms init

# CDN
wraps cdn init
```

Each command will:
- Validate your AWS credentials
- Prompt for configuration options
- Show estimated monthly costs
- Deploy infrastructure via Pulumi
- Display next steps with role ARN and any DNS records

### 2. Install the SDK

```bash
# Email SDK
npm install @wraps.dev/email

# SMS SDK (coming soon to npm)
npm install @wraps.dev/sms
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

**Send your first SMS:**

```typescript
import { Wraps } from '@wraps.dev/sms';

const wraps = new Wraps();

await wraps.sms.send({
  to: '+14155551234',
  message: 'Your code is 123456',
});
```

Learn more: [SDK Documentation](https://github.com/wraps-team/wraps-js) | [npm](https://www.npmjs.com/package/@wraps.dev/email)

### 3. Check Status

```bash
wraps status
```

Shows active features and configuration across all services, AWS region and account, verified domains, deployed resources, and links to dashboard.

## Global Options

These options work across all deployment commands:

| Option | Description |
|--------|-------------|
| `-p, --provider` | Hosting provider (vercel, aws, railway, other) |
| `-r, --region` | AWS region |
| `-d, --domain` | Domain name |
| `--preset` | Configuration preset |
| `-y, --yes` | Skip confirmation prompts |
| `-f, --force` | Force destructive operations |
| `--preview` | Preview changes without deploying |

### Preview Mode

Use `--preview` to see what infrastructure changes would be made without actually deploying. This is useful for:

- **Reviewing changes** before applying them
- **Cost estimation** - see estimated monthly costs
- **CI/CD pipelines** - validate deployments in dry-run mode

```bash
# Preview new deployment
wraps email init --preview

# Preview upgrade changes
wraps email upgrade --preview

# Preview what would be destroyed
wraps destroy --preview
```

**Example output:**

```
--- PREVIEW MODE (no changes will be made) ---

Resource Changes:
  + 8 to create

Estimated Monthly Cost:
  ~$2.50/mo (based on 10,000 emails/month)

--- END PREVIEW (no changes were made) ---

Preview complete. Run without --preview to deploy.
```

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
- `--preview` - Preview changes without deploying

**Examples:**

```bash
# Interactive mode (recommended)
wraps email init

# Preview what would be deployed (no changes made)
wraps email init --preview

# With flags
wraps email init --provider vercel --region us-east-1 --domain myapp.com --preset production
```

#### Other Email Commands

| Command | Description |
|---------|-------------|
| `wraps email connect` | Connect to existing AWS SES infrastructure |
| `wraps email test` | Send a test email to verify your setup |
| `wraps email check` | Check email deliverability for a domain |
| `wraps email config` | Apply CLI config updates to infrastructure (alias: `sync`) |
| `wraps email status` | Show email infrastructure details |
| `wraps email upgrade` | Add features incrementally (presets, tracking domain, SMTP, dedicated IP, etc.) |
| `wraps email verify` | Verify domain DNS records (DKIM, SPF, DMARC) |
| `wraps email restore` | Restore infrastructure from saved metadata |
| `wraps email destroy` | Remove all email infrastructure |

#### Domain Commands

| Command | Description |
|---------|-------------|
| `wraps email domains add` | Add a new domain to SES with DKIM signing |
| `wraps email domains list` | List all SES domains with verification status |
| `wraps email domains get-dkim` | Get DKIM tokens for a domain |
| `wraps email domains verify` | Verify domain DNS records |
| `wraps email domains remove` | Remove a domain from SES |

#### Inbound Email Commands

| Command | Description |
|---------|-------------|
| `wraps email inbound init` | Enable inbound email receiving |
| `wraps email inbound status` | Show inbound email configuration |
| `wraps email inbound verify` | Verify inbound DNS records |
| `wraps email inbound test` | Send a test inbound email |
| `wraps email inbound destroy` | Remove inbound email infrastructure |

#### Template Commands

| Command | Description |
|---------|-------------|
| `wraps email templates init` | Initialize templates-as-code in your project |
| `wraps email templates push` | Push templates to SES and the dashboard |
| `wraps email templates preview` | Preview templates in your browser |

#### Workflow Commands

| Command | Description |
|---------|-------------|
| `wraps email workflows validate` | Validate workflow configuration files |
| `wraps email workflows push` | Push workflows to the dashboard |

### SMS Commands

#### `wraps sms init`

Deploy SMS infrastructure to your AWS account.

**Options:**
- `-p, --provider <provider>` - Hosting provider (vercel, aws, railway, other)
- `-r, --region <region>` - AWS region (default: us-east-1)
- `-y, --yes` - Skip confirmation prompts
- `--preview` - Preview changes without deploying

**Examples:**

```bash
# Interactive mode (recommended)
wraps sms init

# Preview what would be deployed
wraps sms init --preview

# With flags
wraps sms init --provider vercel --region us-east-1
```

#### Other SMS Commands

| Command | Description |
|---------|-------------|
| `wraps sms status` | Show SMS infrastructure details |
| `wraps sms test` | Send a test SMS message |
| `wraps sms verify-number` | Verify a destination phone number |
| `wraps sms sync` | Sync infrastructure with current config |
| `wraps sms upgrade` | Upgrade SMS features |
| `wraps sms register` | Register a toll-free number |
| `wraps sms destroy` | Remove all SMS infrastructure |

### CDN Commands

#### `wraps cdn init`

Deploy CDN infrastructure (S3 + CloudFront) to your AWS account.

**Options:**
- `-p, --provider <provider>` - Hosting provider (vercel, aws, railway, other)
- `-r, --region <region>` - AWS region (default: us-east-1)
- `-d, --domain <domain>` - Custom domain for the CDN
- `-y, --yes` - Skip confirmation prompts
- `--preview` - Preview changes without deploying

**Examples:**

```bash
# Interactive mode (recommended)
wraps cdn init

# Preview what would be deployed
wraps cdn init --preview

# With flags
wraps cdn init --provider vercel --region us-east-1 --domain cdn.myapp.com
```

#### Other CDN Commands

| Command | Description |
|---------|-------------|
| `wraps cdn status` | Show CDN infrastructure details |
| `wraps cdn verify` | Check DNS and certificate validation status |
| `wraps cdn upgrade` | Add a custom domain after certificate validation |
| `wraps cdn sync` | Sync infrastructure with current config |
| `wraps cdn destroy` | Remove all CDN infrastructure |

### Auth Commands

| Command | Description |
|---------|-------------|
| `wraps auth login` | Sign in to wraps.dev (device flow) |
| `wraps auth status` | Show current authentication state |
| `wraps auth logout` | Sign out and remove stored token |

### AWS Commands

| Command | Description |
|---------|-------------|
| `wraps aws setup` | Interactive AWS credentials setup wizard |
| `wraps aws doctor` | Diagnose AWS configuration issues |

### Platform Commands

| Command | Description |
|---------|-------------|
| `wraps platform connect` | Connect to Wraps Platform (events + IAM) |
| `wraps platform update-role` | Update platform IAM permissions |

### Global Commands

These commands work across all services:

| Command | Description |
|---------|-------------|
| `wraps status` | Show infrastructure status across all services |
| `wraps console` | Launch local web console for monitoring |
| `wraps destroy` | Remove all deployed infrastructure |
| `wraps push` | Push templates to SES and dashboard (alias for `email templates push`) |
| `wraps completion` | Generate shell completion script |
| `wraps permissions` | Show required AWS IAM permissions (`--json` for policy output) |
| `wraps news` | Show recent Wraps updates |
| `wraps support` | Get help and support contact info |

### Telemetry Commands

| Command | Description |
|---------|-------------|
| `wraps telemetry enable` | Enable anonymous usage telemetry |
| `wraps telemetry disable` | Disable anonymous usage telemetry |
| `wraps telemetry status` | Show current telemetry setting |

### Legacy Commands (Deprecated)

For backwards compatibility, these commands still work but show deprecation warnings:

```bash
wraps init      # → Use 'wraps email init'
wraps connect   # → Use 'wraps email connect'
wraps verify    # → Use 'wraps email domains verify'
wraps upgrade   # → Use 'wraps email upgrade'
```

**Note:** `status`, `console`, and `destroy` are now global commands that work across all services.

## Configuration Presets

The CLI offers four presets that control which AWS resources are created:

### Starter (~$0.05/mo)
- SES configuration set with open/click tracking
- Suppression list for bounces/complaints
- No event storage (events are tracked but not persisted)

### Production (~$2-5/mo)
- Everything in Starter
- EventBridge → SQS → Lambda pipeline
- DynamoDB table with 90-day TTL
- Tracks: SEND, DELIVERY, OPEN, CLICK, BOUNCE, COMPLAINT

### Enterprise (~$50-100/mo)
- Everything in Production
- Dedicated IP address ($24.95/mo from AWS)
- 1-year DynamoDB TTL
- All 10 SES event types (adds REJECT, RENDERING_FAILURE, DELIVERY_DELAY, SUBSCRIPTION)

### Custom
Select individual features. Useful if you want event storage without a dedicated IP, or specific event types only.

## DNS Configuration

During `wraps email init`, `wraps email inbound init`, and `wraps email upgrade`, the CLI creates DNS records for email authentication. You choose your DNS provider and the CLI either creates records automatically or shows you exactly what to add manually.

### What Records Are Created

| Record | Type | Purpose | Required? |
|--------|------|---------|-----------|
| DKIM (3 records) | CNAME | Cryptographic signatures proving emails are from your domain | Yes |
| SPF | TXT | Authorizes Amazon SES to send email on behalf of your domain | Yes |
| DMARC | TXT | Policy for how receivers handle emails failing DKIM/SPF | Recommended (skip if you have one) |
| MAIL FROM MX | MX | Routes bounce notifications to SES for proper handling | Recommended for DMARC alignment |
| MAIL FROM SPF | TXT | Authorizes SES to send from the MAIL FROM subdomain | With MAIL FROM only |
| Tracking | CNAME | Routes open/click tracking through your domain | Optional |

The CLI shows all records before creating them and lets you select which to create. For example, if you already have a DMARC policy, you can deselect the DMARC record.

### Supported DNS Providers

| Provider | Authentication | Required Token Scopes |
|----------|---------------|----------------------|
| AWS Route53 | Your AWS credentials | `route53:ChangeResourceRecordSets` |
| Cloudflare | API Token | Zone > DNS > Edit (for your zone) |
| Vercel DNS | API Token | Full Access, or scoped with DNS access |
| Manual | — | You add records yourself |

### Providing Credentials

**Option 1: Environment variables** (recommended for CI/CD and repeat use)

```bash
# Cloudflare
export CLOUDFLARE_API_TOKEN=your_token
export CLOUDFLARE_ZONE_ID=your_zone_id  # optional, auto-detected from domain

# Vercel
export VERCEL_TOKEN=your_token
export VERCEL_TEAM_ID=team_xxxxx  # optional, for team accounts

# Route53 — uses your existing AWS credentials
aws configure
```

**Option 2: Interactive prompt**

If no environment variable is set, the CLI prompts you to paste your token during setup. The token is used for the current session only and is never stored to disk.

### Creating API Tokens

**Cloudflare:**

1. Go to https://dash.cloudflare.com/profile/api-tokens
2. Click **Create Token**
3. Use the **Edit zone DNS** template
4. Under Zone Resources, select your domain's zone
5. Create the token and copy it

**Vercel:**

1. Go to https://vercel.com/account/tokens
2. Click **Create**
3. Give it a descriptive name (e.g., "wraps-dns")
4. Set scope to your team if applicable
5. Create and copy the token

### Manual DNS

If you choose "Manual" or don't have a supported DNS provider, the CLI displays all required records grouped by purpose with copy-paste values:

```
DKIM (3 CNAMEs)
Cryptographic signatures proving emails are from your domain

  CNAME  abc123._domainkey.example.com
  →      abc123.dkim.amazonses.com

SPF (TXT)
Authorizes Amazon SES to send email on behalf of your domain

  TXT    example.com
  →      v=spf1 include:amazonses.com ~all

DMARC (TXT)
Policy for how receivers handle emails failing DKIM/SPF checks

  TXT    _dmarc.example.com
  →      v=DMARC1; p=quarantine; sp=quarantine; np=reject; rua=mailto:postmaster@example.com
```

## Hosting Provider Integration

### Vercel

Uses OIDC federation - your Vercel deployment assumes an IAM role directly, no AWS credentials stored:

```bash
wraps email init --provider vercel
```

You'll be prompted for:
- Vercel team slug
- Vercel project name

### AWS Native

For Lambda, ECS, or EC2 deployments - uses IAM roles automatically:

```bash
wraps email init --provider aws
```

### Other Providers

For Railway, Render, or other platforms:

```bash
wraps email init --provider other
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
│   │   │   ├── test.ts          # Send test email
│   │   │   ├── check.ts         # Deliverability check
│   │   │   ├── config.ts        # Apply CLI updates (sync)
│   │   │   ├── console.ts       # Email dashboard
│   │   │   ├── status.ts        # Show email setup
│   │   │   ├── verify.ts        # DNS verification
│   │   │   ├── upgrade.ts       # Add email features
│   │   │   ├── restore.ts       # Restore from metadata
│   │   │   ├── destroy.ts       # Remove email infrastructure
│   │   │   ├── domains.ts       # Domain management (add, list, verify, get-dkim, remove)
│   │   │   ├── inbound.ts       # Inbound email (init, status, verify, test, destroy)
│   │   │   ├── templates/       # Templates-as-code
│   │   │   │   ├── init.ts     # Initialize templates
│   │   │   │   ├── push.ts     # Push templates to SES
│   │   │   │   └── preview.ts  # Preview in browser
│   │   │   └── workflows/       # Workflow automation
│   │   │       ├── validate.ts  # Validate workflow files
│   │   │       └── push.ts      # Push workflows
│   │   ├── sms/                  # SMS service commands
│   │   │   ├── init.ts          # Deploy SMS infrastructure
│   │   │   ├── status.ts        # Show SMS setup
│   │   │   ├── test.ts          # Send test SMS
│   │   │   ├── verify-number.ts # Verify phone number
│   │   │   ├── sync.ts          # Sync infrastructure
│   │   │   ├── upgrade.ts       # Upgrade features
│   │   │   ├── register.ts      # Register toll-free number
│   │   │   └── destroy.ts       # Remove SMS infrastructure
│   │   ├── cdn/                  # CDN service commands
│   │   │   ├── init.ts          # Deploy CDN (S3 + CloudFront)
│   │   │   ├── status.ts        # Show CDN setup
│   │   │   ├── verify.ts        # Check DNS & certs
│   │   │   ├── upgrade.ts       # Add custom domain
│   │   │   ├── sync.ts          # Sync infrastructure
│   │   │   └── destroy.ts       # Remove CDN infrastructure
│   │   ├── auth/                 # Authentication
│   │   │   ├── login.ts         # Sign in (device flow)
│   │   │   ├── status.ts        # Show auth state
│   │   │   └── logout.ts        # Sign out
│   │   ├── aws/                  # AWS helpers
│   │   │   ├── setup.ts         # AWS setup wizard
│   │   │   └── doctor.ts        # Diagnose AWS config
│   │   ├── platform/             # Wraps Platform
│   │   │   ├── connect.ts       # Connect to Platform
│   │   │   └── update-role.ts   # Update IAM permissions
│   │   ├── shared/               # Cross-service commands
│   │   │   ├── status.ts        # Status across all services
│   │   │   ├── destroy.ts       # Destroy all infrastructure
│   │   │   └── dashboard.ts     # Local web console
│   │   ├── telemetry.ts         # Telemetry management
│   │   ├── permissions.ts       # IAM permissions
│   │   ├── news.ts              # Recent updates
│   │   └── support.ts           # Help & support
│   ├── infrastructure/           # Pulumi stacks
│   │   ├── email-stack.ts       # Email infrastructure stack
│   │   ├── sms-stack.ts         # SMS infrastructure stack
│   │   ├── cdn-stack.ts         # CDN infrastructure stack
│   │   ├── vercel-oidc.ts       # Vercel OIDC provider setup
│   │   ├── shared/              # Shared infrastructure
│   │   │   ├── iam.ts           # IAM roles and policies
│   │   │   └── resource-checks.ts
│   │   └── resources/           # Resource definitions
│   │       ├── ses.ts           # SES configuration
│   │       ├── dynamodb.ts      # DynamoDB tables
│   │       ├── lambda.ts        # Lambda functions
│   │       ├── sqs.ts           # SQS queues + DLQ
│   │       ├── eventbridge.ts   # SES event routing
│   │       ├── s3-cdn.ts        # S3 bucket for CDN
│   │       ├── cloudfront.ts    # CloudFront distribution
│   │       ├── acm.ts           # ACM certificates
│   │       ├── s3-inbound.ts    # S3 for inbound emails
│   │       ├── lambda-inbound.ts # Inbound processing
│   │       ├── sqs-inbound.ts   # Inbound queue
│   │       ├── eventbridge-inbound.ts
│   │       ├── mail-manager.ts  # Mail manager
│   │       ├── smtp-credentials.ts
│   │       └── alerting.ts      # CloudWatch alerting
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
│       ├── index.ts             # Type exports
│       ├── shared.ts            # Shared types
│       ├── email.ts             # Email-specific types
│       └── sms.ts               # SMS-specific types
├── lambda/                       # Lambda source (bundled to dist)
└── dist/                         # Build output
    ├── console/                  # Built dashboard
    └── lambda/                   # Lambda source for deployment
```

## AWS Permissions

Wraps needs specific IAM permissions to deploy and manage infrastructure in your AWS account. Use the `wraps permissions` command to see exactly what's required.

### Viewing Required Permissions

```bash
# Show permissions summary
wraps permissions

# Get full IAM policy JSON
wraps permissions --json

# Get permissions for specific preset
wraps permissions --preset production --json

# Get permissions for specific service
wraps permissions --service email --json
```

### Minimum Permissions by Preset

#### Starter Preset (~$0.05/mo)
- **IAM** - Role management for OIDC/credential handling
- **STS** - Credential validation
- **SES** - Email configuration and sending
- **CloudWatch** - Metrics access

#### Production Preset (~$2-5/mo)
All Starter permissions plus:
- **EventBridge** - Event routing
- **SQS** - Event queuing
- **Lambda** - Event processing
- **DynamoDB** - Email history storage

#### Enterprise Preset (~$50-100/mo)
All Production permissions plus:
- **IAM User Management** - SMTP credentials

### Optional Permissions

These permissions enhance functionality but are not required:

- **Route53** - Automatic DNS record management (can add records manually instead)
- **IAM OIDC Provider** - Only needed for Vercel deployments

### Creating an IAM Policy

1. Generate the policy JSON:
   ```bash
   wraps permissions --json > wraps-policy.json
   ```

2. Create the policy in AWS Console:
   - Go to IAM > Policies > Create Policy
   - Select "JSON" tab
   - Paste the policy content
   - Name it "WrapsDeploymentPolicy"

3. Attach to your IAM user or role:
   - Go to IAM > Users (or Roles)
   - Select your user/role
   - Add permissions > Attach policies
   - Select "WrapsDeploymentPolicy"

### Using AWS Organizations / Permission Boundaries

If your organization uses permission boundaries or Service Control Policies (SCPs), ensure they allow:

```json
{
  "Effect": "Allow",
  "Action": [
    "ses:*",
    "iam:CreateRole",
    "iam:PassRole",
    "dynamodb:CreateTable",
    "lambda:CreateFunction",
    "events:PutRule",
    "sqs:CreateQueue"
  ],
  "Resource": ["arn:aws:*:*:*:wraps-*"]
}
```

## Troubleshooting

### AWS Credentials Not Found

```bash
# Configure AWS CLI
aws configure

# Or set environment variables
export AWS_PROFILE=your-profile
```

### SSO Session Expired

If using AWS SSO and you see "SSO session has expired":

```bash
# Re-authenticate with SSO
aws sso login

# Or with a specific profile
aws sso login --profile your-profile
```

### Permission Denied Errors

If you see permission errors during deployment:

1. Check required permissions:
   ```bash
   wraps permissions --json
   ```

2. Verify your IAM user/role has the policy attached

3. Check for organization-level restrictions (SCPs)

4. If using assumed roles, ensure the trust policy allows your principal

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
wraps email init
```

## What's Included

### Global Commands
- [x] `wraps status` - Show infrastructure status (all services)
- [x] `wraps console` - Local web console (all services)
- [x] `wraps destroy` - Remove all infrastructure (all services)
- [x] `wraps push` - Push templates (alias for `email templates push`)
- [x] `wraps completion` - Shell completion
- [x] `wraps permissions` - Show required AWS IAM permissions
- [x] `wraps news` - Show recent updates
- [x] `wraps support` - Get help and support info

### Auth Commands
- [x] `wraps auth login` - Sign in to wraps.dev
- [x] `wraps auth status` - Show auth state
- [x] `wraps auth logout` - Sign out

### AWS Commands
- [x] `wraps aws setup` - Interactive AWS setup wizard
- [x] `wraps aws doctor` - Diagnose AWS configuration

### Platform Commands
- [x] `wraps platform connect` - Connect to Wraps Platform
- [x] `wraps platform update-role` - Update platform IAM permissions

### Email Commands
- [x] `wraps email init` - Deploy new infrastructure
- [x] `wraps email connect` - Connect existing SES
- [x] `wraps email test` - Send a test email
- [x] `wraps email check` - Check email deliverability
- [x] `wraps email config` - Apply CLI updates to infrastructure (alias: `sync`)
- [x] `wraps email status` - Show email infrastructure details
- [x] `wraps email upgrade` - Add features incrementally
- [x] `wraps email verify` - Verify domain DNS records
- [x] `wraps email restore` - Restore from metadata
- [x] `wraps email destroy` - Remove email infrastructure
- [x] `wraps email domains` - Domain management (add, list, verify, get-dkim, remove)
- [x] `wraps email inbound` - Inbound email (init, status, verify, test, destroy)
- [x] `wraps email templates` - Templates-as-code (init, push, preview)
- [x] `wraps email workflows` - Workflow automation (validate, push)

### SMS Commands
- [x] `wraps sms init` - Deploy SMS infrastructure
- [x] `wraps sms status` - Show SMS infrastructure details
- [x] `wraps sms test` - Send a test SMS
- [x] `wraps sms verify-number` - Verify a destination phone number
- [x] `wraps sms sync` - Sync infrastructure
- [x] `wraps sms upgrade` - Upgrade SMS features
- [x] `wraps sms register` - Register toll-free number
- [x] `wraps sms destroy` - Remove SMS infrastructure

### CDN Commands
- [x] `wraps cdn init` - Deploy CDN infrastructure (S3 + CloudFront)
- [x] `wraps cdn status` - Show CDN infrastructure details
- [x] `wraps cdn verify` - Check DNS and certificate status
- [x] `wraps cdn upgrade` - Add custom domain
- [x] `wraps cdn sync` - Sync infrastructure
- [x] `wraps cdn destroy` - Remove CDN infrastructure

### Telemetry Commands
- [x] `wraps telemetry enable` - Enable anonymous telemetry
- [x] `wraps telemetry disable` - Disable anonymous telemetry
- [x] `wraps telemetry status` - Show telemetry setting

### Features
- [x] Preview mode (`--preview`) for all deployment commands
- [x] Configuration presets (Starter, Production, Enterprise, Custom)
- [x] Cost estimation based on AWS pricing
- [x] MAIL FROM domain configuration for DMARC alignment
- [x] Custom tracking domain (HTTP, HTTPS coming in v1.1.0)
- [x] Configurable event types (10 SES event types available)
- [x] Configurable email history retention (7 days to 1 year TTL)
- [x] Dedicated IP address provisioning
- [x] Lambda bundling with esbuild
- [x] Vercel OIDC integration
- [x] Event pipeline: EventBridge → SQS → Lambda → DynamoDB
- [x] Domain management (add, list, verify, remove)
- [x] Suppression list for bounces/complaints
- [x] Inbound email receiving and processing
- [x] Templates-as-code with browser preview
- [x] Workflow automation
- [x] Non-destructive (never modifies existing resources)
- [x] Built with @clack/prompts

## License

AGPLv3

## Support

- Documentation: https://wraps.dev/docs
- Issues: https://github.com/wraps-team/wraps/issues
- Dashboard: https://app.wraps.dev
