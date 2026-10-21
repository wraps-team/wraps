# Wraps Core (packages/core)

Shared types, constants, utilities, and pre-bundled Lambda functions for the Wraps infrastructure packages.

## Critical Rules

### 1. Lambda Code Is Pre-Bundled

Lambda functions are bundled at build time with esbuild, NOT at deploy time. The bundled output lives in `lambda/{name}/index.js` with a `.bundled` marker file.

```bash
pnpm --filter @wraps/core build:lambda  # Bundle Lambdas with esbuild
pnpm --filter @wraps/core build         # build:lambda + tsup (main package)
```

If you edit Lambda source, you must rebuild before testing with the CLI.

### 2. Lambdas Are CommonJS, Not ESM

Lambda bundles use CJS format to avoid dynamic `require()` issues with `mailparser`. The main package exports are ESM.

```typescript
// scripts/build-lambda.ts
format: "cjs",       // Lambda bundles
platform: "node",
target: "node20",
external: ["@aws-sdk/*"],  // AWS SDK excluded (provided by Lambda runtime)
```

### 3. Lambda Error Handling: Continue on Record Failure

Lambda event processors handle SQS batches. Individual record failures must NOT throw — log and continue to process remaining records.

```typescript
for (const record of event.Records) {
  try {
    await processRecord(record);
  } catch (error) {
    console.error(JSON.stringify({ error: error.message, recordId: record.messageId }));
    // Don't throw — continue processing batch
  }
}
```

Exception: The inbound processor re-throws errors to trigger Lambda retry/DLQ.

## Exports

### Types
| Type | Description |
|------|-------------|
| `SESEventType` | Union of 10 SES event types (SEND, DELIVERY, OPEN, CLICK, BOUNCE, COMPLAINT, REJECT, RENDERING_FAILURE, DELIVERY_DELAY, SUBSCRIPTION) |
| `ArchiveRetention` | Retention periods ("7days" to "10years", "indefinite", "permanent") |
| `TrackingConfig`, `EventsConfig`, `ArchivingConfig` | Feature configuration |
| `DNSConfig` | Union of Route53, Cloudflare, Vercel DNS providers |
| `OIDCConfig`, `VercelOIDCConfig` | OIDC provider configurations |
| `SMTPConfig`, `WebhookConfig` | Service configurations |

### Constants
| Constant | Value |
|----------|-------|
| `RESOURCE_PREFIX` | `"wraps-email"` |
| `ALL_EVENT_TYPES` | All 10 SES event types |
| `DEFAULT_EVENT_TYPES` | Common subset |
| `DEFAULT_CONFIG_SET_NAME` | Default SES config set name |
| `DEFAULT_HISTORY_RETENTION` | Default retention period |
| `VERCEL_OIDC_URL` | Vercel OIDC provider URL |

### Utilities
| Function | Description |
|----------|-------------|
| `retentionToDays(retention)` | Converts `"90days"` to `90` |
| `retentionToAWSPeriod(retention)` | Converts to AWS MailManager enum (`"THREE_MONTHS"`, etc.) |
| `calculateTTL(retentionDays)` | Unix timestamp for DynamoDB TTL |
| `convertToSMTPPassword(secretAccessKey, region)` | Derives SES SMTP password via HMAC-SHA256 chain |
| `getSMTPEndpoint(region)` | Returns `email-smtp.{region}.amazonaws.com` |
| `getSMTPConnectionDetails(region)` | Returns host, port, secure flags |

### Lambda Paths
```typescript
import { LAMBDA_EVENT_PROCESSOR_PATH, LAMBDA_SMS_EVENT_PROCESSOR_PATH } from "@wraps/core";
```

These resolve to the pre-bundled Lambda code location for Pulumi/CDK to deploy.

## Lambda Functions

### Event Processor (`lambda/event-processor/`)
**Trigger**: SQS (from EventBridge)
**Purpose**: Store SES email events in DynamoDB

- Parses SES events from EventBridge envelope (SQS → EventBridge → Detail → SES event)
- Extracts type-specific data (bounce reasons, click URLs, open metadata, etc.)
- Calculates TTL from `RETENTION_DAYS` env var
- Structured JSON logging with `requestId` + `batchId`

**Env vars**: `TABLE_NAME`, `AWS_ACCOUNT_ID`, `RETENTION_DAYS`

### SMS Event Processor (`lambda/sms-event-processor/`)
**Trigger**: SQS (from SNS)
**Purpose**: Store SMS delivery events in DynamoDB

- Parses AWS End User Messaging SMS events
- Handles TEXT_QUEUED, TEXT_SENT, TEXT_DELIVERED, TEXT_SUCCESSFUL, TEXT_TTL_EXPIRED, TEXT_CARRIER_UNREACHABLE
- Calculates message segments (160 char units)

**Env vars**: `TABLE_NAME`, `RETENTION_DAYS`

### Inbound Processor (`lambda/inbound-processor/`)
**Trigger**: S3 (raw email stored by SES/MailManager)
**Purpose**: Parse MIME → store parsed email + attachments → emit EventBridge event

- Uses `mailparser` to parse raw MIME
- Extracts headers, body (max 200KB HTML), attachments
- Uploads attachments to S3 with sanitized filenames
- Stores the full parsed email at `parsed/{emailId}.json`
- Publishes EventBridge event `email.received` on the default bus. If the entry
  would exceed the PutEvents limit (1 MB; 256 KB in the Regions listed in
  `LEGACY_LIMIT_REGIONS` and GovCloud), `buildEventDetail` drops `html`/`text`/`headers`
  (largest first), then `attachments`, then `to`/`cc` (and cuts the subject),
  and as a last resort sends a bounded envelope; it adds `truncated: true`,
  `truncatedFields` and `parsedS3Key`. Small mail is sent unchanged.
- Throws when PutEvents returns `FailedEntryCount > 0`
- Extracts SES spam/virus verdicts from headers
- **Re-throws errors** (unlike other processors) to trigger retry/DLQ

**Env vars**: `BUCKET_NAME`, `INBOUND_EVENT_SOURCE` (default `wraps.inbound`), `REPLY_SECRET_PARAMETER_PREFIX` (optional), `AWS_REGION`

## Lambda Loading Priority (in CLI)

When the CLI deploys infrastructure, it finds Lambda code in this order:
1. `dist/lambda/{name}/.bundled` (production — npm package)
2. `lambda/{name}/.bundled` (dev — local build)
3. Bundle on-the-fly from TypeScript source (dev fallback)

## Commands

```bash
pnpm --filter @wraps/core build          # Build everything (lambdas + main)
pnpm --filter @wraps/core build:lambda   # Bundle Lambdas only
pnpm --filter @wraps/core test           # Run tests
pnpm --filter @wraps/core typecheck      # Type check
```
