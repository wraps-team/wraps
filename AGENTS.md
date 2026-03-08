# AGENTS.md - Wraps

Wraps is a CLI and TypeScript SDK that deploys production-ready email, SMS, and CDN infrastructure to a user's AWS account. Zero credentials stored. OIDC authentication. The user owns everything.

## Prerequisites

- Node.js 20+
- AWS credentials configured (`aws configure` or environment variables)
- A verified domain (for email)

## Install

```bash
# Deploy infrastructure (no install needed)
npx @wraps.dev/cli email init

# Or install globally
npm install -g @wraps.dev/cli

# SDKs
npm install @wraps.dev/email
npm install @wraps.dev/sms
```

## CLI Commands

### Email

```
wraps email init          Deploy email infrastructure (SES, Lambda, DynamoDB, EventBridge)
  -p, --provider          Hosting provider (vercel, aws, railway, other)
  -r, --region            AWS region
  -d, --domain            Domain name
  --preset                Config preset (starter, production, enterprise, custom)
  -y, --yes               Skip confirmation
  --preview               Preview changes without deploying

wraps email connect       Connect to existing SES infrastructure
  -r, --region            AWS region
  --preview               Preview changes

wraps email status        Show email infrastructure details
  --account               AWS account ID
  -r, --region            AWS region

wraps email check [domain]  Check email deliverability
  -q, --quick             Fewer checks (top blacklists, fewer DKIM selectors)
  -j, --json              Output as JSON
  --verbose               Show all checks including passing
  --dkimSelector          Specific DKIM selector
  --skipBlacklists        Skip blacklist checks
  --skipTls               Skip MX TLS checks
  --timeout               DNS timeout in ms

wraps email verify        Verify domain DNS records
  -d, --domain            Domain name (required)

wraps email config        Apply CLI updates to infrastructure
  -r, --region            AWS region
  -y, --yes               Skip confirmation

wraps email upgrade       Add features to existing deployment
  -r, --region            AWS region
  -y, --yes               Skip confirmation
  --preview               Preview changes

wraps email restore       Restore from saved metadata
  -r, --region            AWS region
  -f, --force             Force without confirmation
  --preview               Preview changes

wraps email destroy       Remove all email infrastructure
  -f, --force             Force without confirmation
  -r, --region            AWS region
  --preview               Preview changes
```

### Email Domains

```
wraps email domains add       Add a domain to SES
  -d, --domain                Domain name (required)

wraps email domains list      List all SES domains with status

wraps email domains get-dkim  Get DKIM tokens for DNS configuration
  -d, --domain                Domain name (required)

wraps email domains verify    Verify DKIM, SPF, DMARC records
  -d, --domain                Domain name (required)

wraps email domains remove    Remove a domain from SES
  -d, --domain                Domain name (required)
  -f, --force                 Skip confirmation
```

### Email Inbound

```
wraps email inbound init      Enable inbound email receiving
  -r, --region                AWS region
  -d, --domain                Subdomain for inbound
  -y, --yes                   Skip confirmation
  --preview                   Preview changes

wraps email inbound status    Show inbound email status
  -r, --region                AWS region

wraps email inbound verify    Verify inbound DNS records
  -r, --region                AWS region

wraps email inbound test      Send test email and verify receipt
  -r, --region                AWS region

wraps email inbound destroy   Remove inbound infrastructure
  -r, --region                AWS region
  -f, --force                 Force without confirmation
```

### SMS

```
wraps sms init            Deploy SMS infrastructure (AWS End User Messaging)
  -p, --provider          Hosting provider
  -r, --region            AWS region
  --preset                Config preset (starter, production, enterprise, custom)
  -y, --yes               Skip confirmation

wraps sms status          Show SMS infrastructure details
  --account               AWS account ID

wraps sms test            Send a test SMS
  --to                    Destination number (E.164 format)
  --message               Message content

wraps sms verify-number   Verify a destination phone number
  --phoneNumber           Number to verify (E.164)
  --code                  Verification code
  --list                  List verified numbers
  --delete                Delete a verified number
  --resend                Resend verification code

wraps sms upgrade         Upgrade SMS features
  -r, --region            AWS region
  -y, --yes               Skip confirmation

wraps sms register        Register toll-free number
  -r, --region            AWS region

wraps sms sync            Sync infrastructure
  -r, --region            AWS region
  -y, --yes               Skip confirmation

wraps sms destroy         Remove SMS infrastructure
  -f, --force             Force without confirmation
  --preview               Preview changes
```

### CDN

```
wraps cdn init            Deploy CDN infrastructure (S3 + CloudFront)
  -p, --provider          Hosting provider
  -r, --region            AWS region
  -d, --domain            Custom CDN domain
  --preview               Preview changes

wraps cdn status          Show CDN infrastructure details
  -r, --region            AWS region

wraps cdn verify          Check DNS and certificate status
  -r, --region            AWS region

wraps cdn upgrade         Add custom domain after cert validation
  -r, --region            AWS region
  -y, --yes               Skip confirmation
  --preview               Preview changes

wraps cdn sync            Sync infrastructure with current config
  -r, --region            AWS region

wraps cdn destroy         Remove CDN infrastructure
  -f, --force             Force without confirmation
  -r, --region            AWS region
  --preview               Preview changes
```

### AWS Setup

```
wraps aws setup           Interactive AWS credential setup wizard
  -y, --yes               Skip confirmation

wraps aws doctor          Diagnose AWS configuration issues
```

### Platform

```
wraps platform            Show platform info and pricing
wraps platform connect    Connect to Wraps Platform (events + IAM)
  -r, --region            AWS region
  -f, --force             Force
  -y, --yes               Skip confirmation

wraps platform update-role  Update platform IAM permissions
  -r, --region            AWS region
  -f, --force             Force
```

### Global

```
wraps status              Show overview of all deployed services
  --account               AWS account ID

wraps destroy             Remove all deployed infrastructure
  -f, --force             Force without confirmation
  --preview               Preview changes

wraps console             Start local web dashboard
  --port                  Dashboard port
  --noOpen                Don't open browser

wraps permissions         Show required AWS IAM permissions
  --json                  Output as JSON
  --preset                Config preset
  --service               Service type (email, sms, cdn)

wraps completion          Generate shell completion script
wraps telemetry           Manage telemetry (enable|disable|status)
wraps news                Show recent updates
wraps support             Get help and support info
```

## SDK: @wraps.dev/email

### Send an email

```typescript
import { WrapsEmail } from '@wraps.dev/email';

const email = new WrapsEmail({ region: 'us-east-1' });

const result = await email.send({
  from: 'hello@yourapp.com',
  to: 'user@example.com',
  subject: 'Welcome!',
  html: '<h1>Hello from Wraps!</h1>',
});

console.log('Sent:', result.messageId);
```

### Send with React.email

```typescript
import { WrapsEmail } from '@wraps.dev/email';
import { WelcomeEmail } from './emails/Welcome';

const email = new WrapsEmail();

await email.send({
  from: 'hello@yourapp.com',
  to: 'user@example.com',
  subject: 'Welcome!',
  react: <WelcomeEmail name="Alice" />,
});
```

### Send with attachments

```typescript
await email.send({
  from: 'hello@yourapp.com',
  to: 'user@example.com',
  subject: 'Your Invoice',
  html: '<p>Invoice attached.</p>',
  attachments: [
    {
      filename: 'invoice.pdf',
      content: pdfBuffer, // Buffer or base64 string
      contentType: 'application/pdf',
    },
  ],
});
```

### Templates

```typescript
// Create
await email.templates.create({
  name: 'welcome',
  subject: 'Welcome {{name}}!',
  html: '<h1>Hello {{name}}</h1>',
});

// Send with template
await email.sendTemplate({
  from: 'hello@yourapp.com',
  to: 'user@example.com',
  template: 'welcome',
  templateData: { name: 'Alice' },
});

// Bulk send (up to 50 recipients)
await email.sendBulkTemplate({
  from: 'hello@yourapp.com',
  template: 'weekly-digest',
  destinations: [
    { to: 'alice@example.com', templateData: { name: 'Alice' } },
    { to: 'bob@example.com', templateData: { name: 'Bob' } },
  ],
});

// Other template operations
await email.templates.get('welcome');
await email.templates.list();
await email.templates.update({ name: 'welcome', subject: 'New subject' });
await email.templates.delete('welcome');
```

### Error handling

```typescript
import { WrapsEmailError, ValidationError, SESError } from '@wraps.dev/email';

try {
  await email.send({ /* ... */ });
} catch (error) {
  if (error instanceof ValidationError) {
    console.error('Invalid input:', error.field, error.message);
  } else if (error instanceof SESError) {
    console.error('SES error:', error.code, error.retryable);
  }
}
```

## SDK: @wraps.dev/sms

### Send an SMS

```typescript
import { WrapsSMS } from '@wraps.dev/sms';

const sms = new WrapsSMS();

const result = await sms.send({
  to: '+14155551234',
  message: 'Your verification code is 123456',
});

console.log('Sent:', result.messageId);
```

### Batch send

```typescript
const result = await sms.sendBatch({
  messages: [
    { to: '+14155551234', message: 'Hello Alice!' },
    { to: '+14155555678', message: 'Hello Bob!' },
  ],
  messageType: 'TRANSACTIONAL',
});
```

### Opt-out management

```typescript
await sms.optOuts.check('+14155551234');  // boolean
await sms.optOuts.add('+14155551234');
await sms.optOuts.remove('+14155551234');
```

### List phone numbers

```typescript
const numbers = await sms.numbers.list();
```

### Error handling

```typescript
import { SMSError, ValidationError, OptedOutError } from '@wraps.dev/sms';

try {
  await sms.send({ to: '+14155551234', message: 'Hello!' });
} catch (error) {
  if (error instanceof OptedOutError) {
    console.log('User opted out:', error.phoneNumber);
  } else if (error instanceof ValidationError) {
    console.log('Invalid input:', error.field);
  } else if (error instanceof SMSError) {
    console.log('AWS error:', error.code, error.retryable);
  }
}
```

## Authentication Patterns

All SDKs support the same authentication methods:

### 1. Default credential chain (recommended)

```typescript
const email = new WrapsEmail();
// Resolves: env vars -> ~/.aws/credentials -> IAM role
```

### 2. OIDC (Vercel, EKS, GitHub Actions)

```typescript
const email = new WrapsEmail({
  roleArn: process.env.AWS_ROLE_ARN,
});
```

### 3. Explicit credentials

```typescript
const email = new WrapsEmail({
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
  region: 'us-east-1',
});
```

## Common Workflows

### Deploy email and send first message

```bash
# 1. Deploy infrastructure
npx @wraps.dev/cli email init

# 2. Add your domain
npx @wraps.dev/cli email domains add -d yourapp.com

# 3. Configure DNS records (DKIM, SPF, DMARC)
npx @wraps.dev/cli email domains get-dkim -d yourapp.com
# Add the CNAME records to your DNS provider

# 4. Verify DNS propagation
npx @wraps.dev/cli email domains verify -d yourapp.com

# 5. Install SDK and send
npm install @wraps.dev/email
```

```typescript
import { WrapsEmail } from '@wraps.dev/email';
const email = new WrapsEmail();
await email.send({
  from: 'hello@yourapp.com',
  to: 'test@example.com',
  subject: 'It works!',
  html: '<h1>Hello from Wraps!</h1>',
});
```

### Deploy SMS and send first message

```bash
# 1. Deploy infrastructure
npx @wraps.dev/cli sms init

# 2. Verify a destination number (sandbox mode)
npx @wraps.dev/cli sms verify-number --phoneNumber +14155551234

# 3. Send a test
npx @wraps.dev/cli sms test --to +14155551234 --message "Hello from Wraps!"

# 4. Install SDK
npm install @wraps.dev/sms
```

```typescript
import { WrapsSMS } from '@wraps.dev/sms';
const sms = new WrapsSMS();
await sms.send({ to: '+14155551234', message: 'Hello!' });
```

### Run a deliverability audit

```bash
npx @wraps.dev/cli email check yourapp.com
# Checks: DKIM, SPF, DMARC, MX TLS, blacklists, DNS propagation
```

### Connect existing SES and upgrade

```bash
# 1. Connect existing SES setup
npx @wraps.dev/cli email connect

# 2. Add tracking, history, or dedicated IP
npx @wraps.dev/cli email upgrade
```

## Boundaries

Agents should **never**:

- Modify existing AWS resources (Wraps is non-destructive, always creates new resources with `wraps-` prefix)
- Store or log AWS credentials
- Skip DNS verification steps
- Run `wraps destroy` or `wraps email destroy` without explicit user confirmation
- Assume a domain is verified without checking (`wraps email domains verify`)
- Use `--force` on destructive commands without user approval

## Configuration Presets

### Email
| Preset | Monthly Cost | Features |
|--------|-------------|----------|
| starter | ~$0.05 | Open/click tracking, bounce suppression |
| production | ~$2-5 | + Event tracking, 90-day history, reputation metrics |
| enterprise | ~$50-100 | + Dedicated IP, 1-year history, all event types |

### SMS
| Preset | Monthly Cost | Features |
|--------|-------------|----------|
| starter | ~$1 | Simulator phone number |
| production | ~$2-10 | Toll-free number, event tracking |
| enterprise | ~$10-50 | Full features, link tracking |

Email sending: $0.10 per 1,000 emails (AWS SES pricing).
SMS sending: ~$0.00849/segment + carrier fees (AWS pricing).

## Links

- Website: https://wraps.dev
- Quickstart: https://wraps.dev/docs/quickstart/email
- SDK Reference: https://wraps.dev/docs/sdk-reference
- SMS SDK Reference: https://wraps.dev/docs/sms-sdk-reference
- CLI Reference: https://wraps.dev/cli
- GitHub SDK: https://github.com/wraps-team/wraps-js
- npm (email): https://npmjs.com/package/@wraps.dev/email
- npm (sms): https://npmjs.com/package/@wraps.dev/sms
- npm (cli): https://npmjs.com/package/@wraps.dev/cli

## Cursor Cloud specific instructions

### Environment overview

Turborepo monorepo with pnpm 10 workspaces. Three runnable services:

| Service | Directory | Port | Dev command |
|---------|-----------|------|-------------|
| Web Dashboard | `apps/web` | 3000 | `pnpm --filter @wraps/web dev` |
| Marketing Website | `apps/website` | 3001 | `pnpm --filter wraps-website dev` |
| API (Elysia) | `apps/api` | 3002 | `pnpm --filter @wraps/api dev` (requires bun) |

Standard commands are in root `package.json` and `CLAUDE.md`. Key ones: `pnpm build`, `pnpm dev`, `pnpm test`, `pnpm check`, `pnpm check:errors`, `pnpm check:all`.

### Non-obvious caveats

- **Bun is required** for `apps/api` dev mode and `packages/tui` build. Install globally with `npm install -g bun`.
- **`.env.local` files are auto-generated from injected secrets.** The update script writes `apps/web/.env.local` and `apps/website/.env.local` from environment variables injected via Cursor Cloud secrets. Both `apps/api` (via `--env-file=../web/.env.local`) and SST read from `apps/web/.env.local`.
- **If secrets change**, just re-run the update script or restart the VM to regenerate `.env.local` files.
- **Build before dev**: Run `pnpm build` at least once after `pnpm install` so cross-package types/dist are available. Workspace packages like `@wraps/db`, `@wraps/core`, `@wraps/auth` must be built before dependent apps.
- **Lint `pnpm check` vs `pnpm check:errors`**: `pnpm check` reports warnings + errors (currently ~3500 warnings). `pnpm check:errors` reports only errors and is what `check:all` uses. There is one pre-existing formatting error in `packages/cli/src/commands/email/templates/push.ts`.
- **Auth tests need Stripe env vars**: 4 tests in `packages/auth` (`stripe-config.test.ts`) fail without `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `STRIPE_GROWTH_PRICE_ID` in the environment. All other tests pass without external services.
- **Turbo TUI mode**: When redirecting turbo output to a file/pipe, set `TURBO_UI=stream` to avoid hangs.
- **No database needed for most tests**: The test suites mock database calls. Only integration tests (`test:integration`) require a live Neon PostgreSQL connection.
