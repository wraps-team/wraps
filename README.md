# BYO (Bring Your Own Cloud)

**AWS primitives with SaaS developer experience.**

Deploy production-ready email infrastructure to your AWS account in 30 seconds. No vendor lock-in, AWS pricing, Resend-like DX.

```bash
npx @byo/cli init
# ✓ SES configured
# ✓ Domain verification guided
# ✓ Event tracking enabled
# Ready to send emails
```

---

## Description

BYO deploys communication infrastructure (starting with email) **to your AWS account** with zero stored credentials and a beautiful developer experience. You own the infrastructure, pay AWS directly (pennies vs. dollars), and get SaaS-quality tooling.

**The Problem:** AWS services like SES are powerful and cost-effective but have terrible DX. Developers either pay 10-100x markup for SaaS alternatives (Resend, Postmark) or struggle through complex AWS setup and give up.

**The Solution:** One CLI command deploys production-ready infrastructure to your AWS account. Your infrastructure, your data, our tooling.

---

## Philosophy

### Bring Your Own Cloud (BYOC) Model

- **You own it** - Infrastructure lives in your AWS account
- **You control it** - Data never leaves your cloud
- **You pay AWS** - Transparent costs, no markup
- **No lock-in** - Infrastructure stays if you churn
- **Exit built-in** - Stop paying us, everything keeps working

### Why This Matters

**vs. Resend/Postmark:**
- ✅ No vendor lock-in (own your infrastructure)
- ✅ Lower cost at scale (AWS pricing)
- ✅ Data residency control
- ✅ Compliance simplified (data in your account)

**vs. Raw AWS:**
- ✅ 10x better developer experience
- ✅ 30-second setup vs. 2-hour setup
- ✅ Beautiful dashboards (not AWS Console chaos)
- ✅ Managed updates and best practices

**vs. Terraform/Pulumi:**
- ✅ Purpose-built for communication primitives
- ✅ No IaC knowledge required
- ✅ Automatic DNS configuration
- ✅ Dashboard included

---

## Quick Start

### Prerequisites

- Node.js 20+
- AWS account with credentials configured
- pnpm (recommended) or npm

### Install & Deploy

```bash
# Deploy email infrastructure
npx @byo/cli init

# Check deployment status
npx @byo/cli status

# Verify domain DNS records
npx @byo/cli verify --domain yourapp.com

# Clean removal
npx @byo/cli destroy
```

### What Gets Deployed

- **SES Configuration** - Domain verification, DKIM, SPF, DMARC
- **Event Tracking** - Bounces, complaints, deliveries, opens, clicks
- **DynamoDB Table** - Email event history (90-day TTL)
- **Lambda Functions** - Event processing and webhook handling
- **IAM Roles** - Least-privilege access with OIDC support (Vercel)
- **CloudWatch** - Metrics and alarms

All resources use the `byo-email-*` namespace prefix.

---

## Features

### Current (v0.1 - Email MVP)

- ✅ **One-command deployment** - `byo init` sets up everything
- ✅ **Domain verification** - Guided DNS setup with Route53 auto-configuration
- ✅ **Event tracking** - Capture bounces, complaints, opens, clicks
- ✅ **OIDC support** - Vercel integration (no AWS credentials in production)
- ✅ **Non-destructive** - Never modifies existing AWS resources
- ✅ **Beautiful CLI** - Spinners, colors, clear error messages
- ✅ **Infrastructure as Code** - Pulumi-powered deployments

### Roadmap

- 🚧 **SDK** - `@byo/email` with Resend-like API
- 🚧 **Hosted Dashboard** - Analytics, logs, team management
- 📋 **SMS** - AWS SNS wrapper (`@byo/sms`)
- 📋 **MQTT** - AWS IoT Core wrapper (`@byo/iot`)
- 📋 **Workflows** - SQS + Lambda orchestration (`@byo/queue`)

---

## Repository Structure

```
byo/
├── packages/
│   └── cli/                 # @byo/cli - Infrastructure deployment tool
│       ├── src/
│       │   ├── commands/    # CLI commands (init, status, verify, destroy)
│       │   ├── infrastructure/  # Pulumi stacks and resources
│       │   ├── utils/       # Helpers (AWS, prompts, errors, output)
│       │   └── types/       # TypeScript definitions
│       ├── lambda/          # Lambda function source
│       │   ├── event-processor/   # SES event handling
│       │   └── webhook-sender/    # Webhook delivery
│       └── package.json
├── .gitignore
├── turbo.json               # Turborepo configuration
├── pnpm-workspace.yaml      # pnpm workspace config
└── README.md                # This file
```

---

## Documentation

### CLI Commands

**`byo init`** - Deploy new infrastructure
```bash
byo init                          # Interactive prompts
byo init --provider vercel        # Specify hosting provider
byo init --region us-west-2       # Custom AWS region
byo init --domain myapp.com       # Domain to verify
```

**`byo status`** - Show deployment status
```bash
byo status                        # Current account
byo status --account production   # Specific AWS account
```

**`byo verify`** - Verify domain DNS
```bash
byo verify --domain myapp.com     # Check DNS propagation
```

**`byo destroy`** - Remove all infrastructure
```bash
byo destroy                       # Interactive confirmation
byo destroy --yes                 # Skip confirmation
```

### Environment Variables

- `AWS_PROFILE` - AWS credentials profile to use
- `AWS_REGION` - Default AWS region
- `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` - AWS credentials

### Configuration

Deployment state stored in `~/.byo/` directory (one state file per AWS account + region).

---

## Development

### Setup

```bash
# Clone repository
git clone https://github.com/byo-team/byo.git
cd byo

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Build in watch mode
pnpm dev
```

### Working on CLI

```bash
# Navigate to CLI package
cd packages/cli

# Build CLI
pnpm build

# Run locally
node dist/cli.js init

# Or use direct execution
./dist/cli.js status

# Run tests
pnpm test

# Type checking
pnpm typecheck
```

### Project Structure

- **Monorepo** - Managed with Turborepo + pnpm workspaces
- **Language** - TypeScript (strict mode)
- **Build** - tsup (esbuild-powered)
- **IaC** - Pulumi (inline programs, local state)
- **AWS SDK** - v3 (modular imports)
- **CLI Framework** - args + @clack/prompts
- **Testing** - Vitest

### Adding a New Package

```bash
# Create package directory
mkdir -p packages/your-package

# Initialize package.json
cd packages/your-package
pnpm init

# Turborepo will automatically detect it
cd ../..
pnpm build  # Builds all packages in dependency order
```

---

## Want to Contribute?

We'd love your help! BYO is open source and community-driven.

### Ways to Contribute

- **Report bugs** - Open an issue on GitHub
- **Suggest features** - Share your ideas in discussions
- **Improve docs** - Fix typos, add examples, clarify instructions
- **Submit PRs** - Bug fixes, new features, tests

### Contribution Guidelines

1. **Fork the repository**
2. **Create a feature branch** - `git checkout -b feature/amazing-feature`
3. **Make your changes** - Follow existing code style
4. **Write tests** - For new features
5. **Update docs** - If changing CLI behavior
6. **Commit with conventional commits** - `feat:`, `fix:`, `chore:`, etc.
7. **Push and open a PR** - We'll review and provide feedback

### Development Principles

- **Non-Destructive** - Never modify existing AWS resources
- **Namespace Everything** - All resources prefixed `byo-email-*`
- **Fail Fast** - Validate early, deploy confidently
- **Great UX** - Beautiful output, clear errors, helpful suggestions
- **Type-Safe** - Strict TypeScript throughout
- **Tested** - Critical paths have tests

### Getting Help

- **Documentation** - [docs.byo.dev](https://docs.byo.dev) (coming soon)
- **GitHub Issues** - [github.com/byo-team/byo/issues](https://github.com/byo-team/byo/issues)
- **Discussions** - [github.com/byo-team/byo/discussions](https://github.com/byo-team/byo/discussions)

---

## License

MIT License - see [LICENSE](LICENSE) for details.

---

## Tagline

*The DX of Resend. The economics of AWS. Your infrastructure.*

---

**Built with [Claude Code](https://claude.com/claude-code)**
