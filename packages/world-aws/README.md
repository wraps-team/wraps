# @wraps.dev/world-aws

AWS World for [Vercel Workflow DevKit](https://workflow.vercel.app/) — DynamoDB + SQS.

## Install

```bash
pnpm add @wraps.dev/world-aws
```

## Quick Start

Set the environment variable so Workflow uses this world:

```bash
WORKFLOW_TARGET_WORLD=@wraps.dev/world-aws
```

Then create the infrastructure:

```bash
npx world-aws-setup
```

## Infrastructure Setup

The setup CLI creates 6 DynamoDB tables and 4 SQS queues:

```bash
npx world-aws-setup --region us-east-1 --prefix workflow
```

| Flag | Description | Default |
|------|-------------|---------|
| `--region` | AWS region | `us-east-1` |
| `--prefix` | Table and queue name prefix | `workflow` |
| `--endpoint` | Custom endpoint (for local dev) | — |

### What Gets Created

**DynamoDB Tables:**
- `{prefix}-runs` — Workflow run state
- `{prefix}-steps` — Step execution state
- `{prefix}-events` — Event log (append-only)
- `{prefix}-hooks` — Webhook registrations
- `{prefix}-waits` — Wait/sleep state
- `{prefix}-streams` — Streaming data (DynamoDB Streams enabled)

**SQS Queues:**
- `{prefix}-workflows` — Workflow execution queue
- `{prefix}-workflows-dlq` — Dead letter queue
- `{prefix}-steps` — Step execution queue
- `{prefix}-steps-dlq` — Dead letter queue

All tables use on-demand billing (pay-per-request).

## Configuration

```typescript
import { createWorld } from "@wraps.dev/world-aws";

const world = createWorld({
  region: "us-east-1",        // AWS region
  tablePrefix: "workflow",    // DynamoDB table prefix
  queuePrefix: "workflow",    // SQS queue prefix
  endpoint: undefined,        // Custom endpoint (local dev)
  deploymentId: undefined,    // Deployment identifier
  encryptionKey: undefined,   // Base64-encoded 32-byte key (opt-in)
});
```

| Option | Env Variable | Default |
|--------|-------------|---------|
| `region` | `AWS_REGION` / `AWS_DEFAULT_REGION` | `us-east-1` |
| `tablePrefix` | `WORKFLOW_AWS_TABLE_PREFIX` | `workflow` |
| `queuePrefix` | `WORKFLOW_AWS_QUEUE_PREFIX` | `workflow` |
| `endpoint` | `WORKFLOW_AWS_ENDPOINT` | — |
| `deploymentId` | `WORKFLOW_AWS_DEPLOYMENT_ID` | `aws-{region}` |
| `encryptionKey` | `WORKFLOW_AWS_ENCRYPTION_KEY` | — |

## Lambda Integration

Use `createSQSHandler` to process workflow queue messages in AWS Lambda:

```typescript
import { createSQSHandler } from "@wraps.dev/world-aws/lambda";
import { serve } from "workflow";
import { createWorld } from "@wraps.dev/world-aws";

const world = createWorld();

export const handler = createSQSHandler(serve(world));
```

The handler supports SQS partial batch failure reporting — failed messages are returned to the queue for retry while successful messages are acknowledged.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `WORKFLOW_TARGET_WORLD` | Set to `@wraps.dev/world-aws` |
| `AWS_REGION` | AWS region for DynamoDB and SQS |
| `AWS_ACCOUNT_ID` | AWS account ID (used by setup CLI) |
| `WORKFLOW_AWS_TABLE_PREFIX` | DynamoDB table name prefix |
| `WORKFLOW_AWS_QUEUE_PREFIX` | SQS queue name prefix |
| `WORKFLOW_AWS_ENDPOINT` | Custom endpoint for local development |
| `WORKFLOW_AWS_DEPLOYMENT_ID` | Deployment identifier |
| `WORKFLOW_AWS_ENCRYPTION_KEY` | Base64-encoded 32-byte encryption key |

## Encryption

Encryption is opt-in. When an `encryptionKey` is provided, all workflow step input/output data is encrypted at rest in DynamoDB using HKDF-SHA256 per-run key derivation — each workflow run gets a unique derived key.

Generate a key:

```bash
openssl rand -base64 32
```

Set it via environment variable or config:

```bash
WORKFLOW_AWS_ENCRYPTION_KEY=<your-base64-key>
```

## Requirements

- AWS account with DynamoDB and SQS access
- Node.js 20+
- `@workflow/world ^4.0.0`

## License

AGPL-3.0-or-later
