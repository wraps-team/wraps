# Wraps

**AWS wrappers with SaaS developer experience.**

Deploy production-ready email infrastructure to your AWS account in 30 seconds. No vendor lock-in, AWS pricing, Resend-like DX.

```bash
npx @wraps.dev/cli init
# ✓ SES configured
# ✓ Domain verification guided
# ✓ Event tracking enabled
# Ready to send emails
```

---

## Description

Wraps deploys communication infrastructure (starting with email) **to your AWS account** with zero stored credentials and a beautiful developer experience. You own the infrastructure, pay AWS directly (pennies vs. dollars), and get SaaS-quality tooling.

**The Problem:** AWS services like SES are powerful and cost-effective but require significant setup time. We wanted the simplicity of modern email APIs with the flexibility of running in your own AWS account.

**The Solution:** One CLI command deploys production-ready infrastructure to your AWS account. Your infrastructure, your data, our tooling.

---

## Philosophy

### Bring Your Own Cloud Account Model

- **You own it** - Infrastructure lives in your AWS account
- **You control it** - Data never leaves your cloud
- **You pay AWS** - Transparent costs, no markup
- **No lock-in** - Infrastructure stays if you churn
- **Exit built-in** - Stop paying us, everything keeps working

### Why This Matters

**Great Developer Experience:**
- ✅ Simple, intuitive TypeScript SDK
- ✅ Beautiful dashboards and analytics
- ✅ 30-second setup with one command
- ✅ Real-time event tracking out of the box

**Full Control & Ownership:**
- ✅ Infrastructure lives in your AWS account
- ✅ No vendor lock-in
- ✅ Data residency control
- ✅ Compliance simplified (data stays in your account)

**Cost-Effective at Scale:**
- ✅ Pay AWS directly ($0.10 per 1,000 emails)
- ✅ Transparent pricing with no markup
- ✅ Scale without worrying about tier limits

---

## Quick Start

### Prerequisites

- Node.js 20+
- AWS account with credentials configured
- pnpm (recommended) or npm

### Install & Deploy

```bash
# Deploy email infrastructure
npx @wraps.dev/cli init

# Check deployment status
npx @wraps.dev/cli status

# Verify domain DNS records
npx @wraps.dev/cli verify --domain yourapp.com

# Clean removal
npx @wraps.dev/cli destroy
```

### What Gets Deployed

- **SES Configuration** - Domain verification, DKIM, SPF, DMARC
- **Event Tracking** - Bounces, complaints, deliveries, opens, clicks
- **DynamoDB Table** - Email event history (90-day TTL)
- **Lambda Functions** - Event processing and webhook handling
- **IAM Roles** - Least-privilege access with OIDC support (Vercel)
- **CloudWatch** - Metrics and alarms

All resources use the `wraps-email-*` namespace prefix.

---

## Features

### Current (v0.1 - Email MVP)

- ✅ **One-command deployment** - `wraps init` sets up everything
- ✅ **Domain verification** - Guided DNS setup with Route53 auto-configuration
- ✅ **Event tracking** - Capture bounces, complaints, opens, clicks
- ✅ **OIDC support** - Vercel integration (no AWS credentials in production)
- ✅ **Non-destructive** - Never modifies existing AWS resources
- ✅ **Beautiful CLI** - Spinners, colors, clear error messages
- ✅ **Infrastructure as Code** - Pulumi-powered deployments

### Roadmap

- ✅ **Email SDK** - [`@wraps.dev/email`](https://github.com/wraps-team/wraps-js) TypeScript SDK for AWS SES
- 🚧 **Hosted Dashboard** - Analytics, logs, team management
- 📋 **SMS** - AWS SNS wrapper (`@wraps.dev/sms`)
- 📋 **MQTT** - AWS IoT Core wrapper (`@wraps.dev/iot`)
- 📋 **Workflows** - SQS + Lambda orchestration (`@wraps.dev/queue`)

---

## Using the SDK

After deploying infrastructure with the CLI, install the TypeScript SDK to send emails:

```bash
npm install @wraps.dev/email
# or
pnpm add @wraps.dev/email
```

**Send your first email:**

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

The SDK automatically uses your AWS credentials (IAM roles, OIDC, or environment variables) configured during CLI deployment.

**Learn more:**
- [SDK Documentation](https://github.com/wraps-team/wraps-js)
- [npm Package](https://www.npmjs.com/package/@wraps.dev/email)

---

## Documentation

### CLI Commands

**`wraps init`** - Deploy new infrastructure
```bash
wraps init                          # Interactive prompts
wraps init --provider vercel        # Specify hosting provider
wraps init --region us-west-2       # Custom AWS region
wraps init --domain myapp.com       # Domain to verify
```

**`wraps status`** - Show deployment status
```bash
wraps status                        # Current account
wraps status --account production   # Specific AWS account
```

**`wraps verify`** - Verify domain DNS
```bash
wraps verify --domain myapp.com     # Check DNS propagation
```

**`wraps destroy`** - Remove all infrastructure
```bash
wraps destroy                       # Interactive confirmation
wraps destroy --yes                 # Skip confirmation
```

### Environment Variables

- `AWS_PROFILE` - AWS credentials profile to use
- `AWS_REGION` - Default AWS region
- `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` - AWS credentials

### Configuration

Deployment state stored in `~/.wraps/` directory (one state file per AWS account + region).

---

## Development

### Setup

```bash
# Clone repository
git clone https://github.com/wraps-team/wraps.git
cd wraps

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

We'd love your help! Wraps is open source and community-driven.

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
- **Namespace Everything** - All resources prefixed `wraps-email-*`
- **Fail Fast** - Validate early, deploy confidently
- **Great UX** - Beautiful output, clear errors, helpful suggestions
- **Type-Safe** - Strict TypeScript throughout
- **Tested** - Critical paths have tests

### Getting Help

- **Documentation** - [docs.wraps.dev](https://docs.wraps.dev) (coming soon)
- **GitHub Issues** - [github.com/wraps-team/wraps/issues](https://github.com/wraps-team/wraps/issues)
- **Discussions** - [github.com/wraps-team/wraps/discussions](https://github.com/wraps-team/wraps/discussions)

---

## License

Copyright (c) 2025 [Jarod Stewart](https://github.com/stewartjarod). This repo is associated with a commercial open-source company, which means some parts of this open-source repository require a commercial license. The concept is called "Open Core" where the core technology (99%) is fully open source, licensed under [AGPLv3](https://opensource.org/license/agpl-v3) and the last 1% is covered under a commercial license (["/ee" Enterprise Edition](<https://github.com/wraps-team/wraps/tree/main/apps/web/app/(ee)>)) which we believe is entirely relevant for larger organisations that require enterprise features. Enterprise features are built by Jarod Stewart.
