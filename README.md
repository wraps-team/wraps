# Wraps

**SaaS developer experience. AWS economics. Your infrastructure.**

Deploy production-ready email infrastructure to your AWS account in 30 seconds. Own your infrastructure, pay AWS directly, get SaaS-quality developer experience.

```bash
npx @wraps.dev/cli email init
# ✓ SES configured
# ✓ Domain verification guided
# ✓ Event tracking enabled
# Ready to send emails
```

---

## The Problem

AWS SES is powerful and cost-effective, but the developer experience is painful:

- **Hours of configuration** — DKIM, SPF, DMARC, IAM roles, event tracking
- **Opaque rejection criteria** — production access approval is frustrating
- **Terrible console UX** — simple tasks buried in AWS complexity
- **No unified dashboard** — metrics scattered across CloudWatch

Developers either pay 10-100x markup for email SaaS or struggle through AWS setup and give up.

## The Solution

Wraps deploys email infrastructure **to your AWS account** with SaaS-quality developer experience:

- **You own it** — Infrastructure lives in your AWS account
- **You control it** — Data never leaves your cloud
- **You pay AWS** — $0.10 per 1,000 emails (no markup)
- **No lock-in** — Infrastructure stays if you stop using Wraps

---

## Why Wraps?

### For Developers
- **Simple API** — `await wraps.emails.send()` just works
- **30-second setup** — vs. hours of AWS configuration
- **Beautiful dashboard** — analytics, templates, team management
- **TypeScript-first** — full type safety

### For Startup CTOs
- **Full ownership** — audit trail in your AWS account
- **Compliance simplified** — data never leaves your cloud
- **Transparent costs** — AWS bill separate from our fee
- **Exit-friendly** — infrastructure keeps working if you stop paying

### Cost at Scale

**CLI + SDK are free.** You only pay AWS directly.

| Volume | AWS Cost |
|--------|----------|
| 50K emails/mo | **~$8/mo** |
| 200K emails/mo | **~$23/mo** |
| 500K emails/mo | **~$54/mo** |
| 1M emails/mo | **~$106/mo** |

Add our [hosted platform](#pricing) for templates, contact management, and campaigns.

---

## Quick Start

### Prerequisites

- Node.js 20+
- AWS account with credentials configured
- pnpm (recommended) or npm

### Install & Deploy

```bash
# Deploy email infrastructure
npx @wraps.dev/cli email init

# Check deployment status
npx @wraps.dev/cli email status

# Verify domain DNS records
npx @wraps.dev/cli email verify --domain yourapp.com

# Upgrade to add more features
npx @wraps.dev/cli email upgrade

# Clean removal
npx @wraps.dev/cli email destroy
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

## Pricing

**CLI + SDK are free and open source.** Deploy to your AWS account and send emails with zero platform fees.

**Hosted platform** adds visual tools on top of your infrastructure:

| Tier | Price | Contacts | Features |
|------|-------|----------|----------|
| **Starter** | $19/mo | 5K | Template editor, dashboard, analytics, batch sending |
| **Pro** | $49/mo | 25K | + Topics, Segments, Campaigns |
| **Growth** | $149/mo | 100K | + Workflows, Event tracking, Advanced segments |
| **Scale** | $299/mo | 500K | + Custom retention, Priority SLA |

**All tiers include:** Unlimited team members, unlimited templates, AI generation.

**Plus AWS costs:** ~$0.10 per 1,000 emails + minimal Lambda/DynamoDB (~$2-5/mo).

---

## Features

### What's Built

- ✅ **CLI** — One-command deployment to your AWS account
- ✅ **TypeScript SDK** — [`@wraps.dev/email`](https://github.com/wraps-team/wraps-js) for sending emails
- ✅ **Dashboard** — Analytics, email history, team management
- ✅ **Templates** — Drag-n-drop, raw code, and AI generation
- ✅ **Domain verification** — Guided DNS setup with Route53 auto-config
- ✅ **Event tracking** — Bounces, complaints, opens, clicks
- ✅ **OIDC support** — Vercel integration (no AWS credentials in production)

### Coming Soon

- 🚧 **Contact management** — Import, segment, and manage your audience
- 🚧 **Campaigns** — Scheduled, targeted email sends
- 🚧 **SMS** — AWS End User Messaging wrapper (`@wraps.dev/sms`)
- 📋 **Workflows** — Visual automation builder

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

#### Email Commands

**`wraps email init`** - Deploy new email infrastructure
```bash
wraps email init                    # Interactive prompts
wraps email init --provider vercel  # Specify hosting provider
wraps email init --region us-west-2 # Custom AWS region
wraps email init --domain myapp.com # Domain to verify
wraps email init --preset production # Use production preset
```

**`wraps email status`** - Show deployment status
```bash
wraps email status                  # Show current email setup
```

**`wraps email verify`** - Verify domain DNS
```bash
wraps email verify --domain myapp.com # Check DNS propagation
```

**`wraps email upgrade`** - Upgrade email features
```bash
wraps email upgrade                 # Interactive upgrade wizard
```

**`wraps email connect`** - Connect existing SES setup
```bash
wraps email connect                 # Import existing SES infrastructure
```

**`wraps email restore`** - Restore from metadata
```bash
wraps email restore                 # Restore infrastructure from saved state
```

**`wraps email destroy`** - Remove email infrastructure
```bash
wraps email destroy                 # Interactive confirmation
wraps email destroy --yes           # Skip confirmation
```

#### Legacy Commands (Deprecated)

For backwards compatibility, legacy commands still work but show deprecation warnings:
```bash
wraps init      # ⚠️ Deprecated: Use 'wraps email init' instead
wraps status    # ⚠️ Deprecated: Use 'wraps email status' instead
wraps verify    # ⚠️ Deprecated: Use 'wraps email verify' instead
wraps destroy   # ⚠️ Deprecated: Use 'wraps email destroy' instead
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

## Privacy & Telemetry

Wraps collects **anonymous usage data** to improve the CLI. We only collect command names, success/failure status, and system info. We **never** collect AWS credentials, domains, email content, or any personally identifiable information.

**Learn more**: [docs/telemetry.md](docs/telemetry.md)

**Opt-out anytime**:
```bash
wraps telemetry disable
# or set environment variable
export WRAPS_TELEMETRY_DISABLED=1
```

Telemetry is automatically disabled in CI environments.

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
