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

## Architecture

### How It Works

```
Your App                    AWS
───────                    ───
  │
  ├─ start(workflow) ──► SQS (workflows queue)
  │                           │
  │                     Lambda (SQS trigger)
  │                           │
  │                     ├─ Read/write run state ──► DynamoDB (runs)
  │                     ├─ Execute step ──────────► DynamoDB (steps, events)
  │                     ├─ Queue next step ───────► SQS (steps queue)
  │                     └─ Write output ──────────► DynamoDB (streams)
  │                                                     │
  └─ readFromStream() ◄──── DynamoDB Streams ◄──────────┘
```

1. **Your app** starts a workflow by sending a message to the SQS workflows queue
2. **Lambda** picks up the message, reads/writes run state in DynamoDB, and executes the first step
3. **Each step** queues the next step via SQS, creating a durable execution chain
4. **Streaming output** is written to the streams table, which has DynamoDB Streams enabled for real-time reads
5. **Failed messages** return to the queue (up to 3 retries) before moving to the dead letter queue

### DynamoDB Tables

| Table | PK | SK | GSIs |
|-------|----|----|------|
| `{prefix}-runs` | `runId` | — | `gsi-workflow-name`, `gsi-status` |
| `{prefix}-steps` | `stepId` | — | `gsi-run` |
| `{prefix}-events` | `runId` | `eventId` | `gsi-correlation` |
| `{prefix}-hooks` | `hookId` | — | `gsi-run`, `gsi-token` |
| `{prefix}-waits` | `waitId` | — | `gsi-run` |
| `{prefix}-streams` | `streamId` | `chunkId` | `gsi-run` + DynamoDB Streams |

All tables use on-demand billing (PAY_PER_REQUEST).

### SQS Queues

| Queue | DLQ | Visibility Timeout | Max Receives |
|-------|-----|--------------------|-------------|
| `{prefix}-workflows` | `{prefix}-workflows-dlq` | 900s (15 min) | 3 |
| `{prefix}-steps` | `{prefix}-steps-dlq` | 900s (15 min) | 3 |

Standard queues (not FIFO). Failed messages retry up to 3 times before moving to the dead letter queue.

### Streaming

The streams table uses a two-phase read for real-time output:

1. **Catch-up phase** — reads existing chunks from the table in order
2. **Stream phase** — polls DynamoDB Streams for new inserts (200ms interval)

This ensures no data is missed between table reads and stream polling.

## Local Development

Use [LocalStack](https://localstack.cloud/) or [DynamoDB Local](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DynamoDBLocal.html) for local development. Set the `endpoint` option to point at your local service.

### Using LocalStack

Start LocalStack:

```bash
localstack start
```

Create infrastructure against it:

```bash
npx world-aws-setup --endpoint http://localhost:4566
```

Configure your app:

```bash
WORKFLOW_AWS_ENDPOINT=http://localhost:4566
```

Or programmatically:

```typescript
const world = createWorld({
  endpoint: "http://localhost:4566",
});
```

### Using DynamoDB Local

DynamoDB Local only covers table storage — you'll still need LocalStack or [ElasticMQ](https://github.com/softwaremill/elasticmq) for SQS queues.

```bash
docker run -p 8000:8000 amazon/dynamodb-local
npx world-aws-setup --endpoint http://localhost:8000
```

```bash
WORKFLOW_AWS_ENDPOINT=http://localhost:8000
```

### Running Tests

The test suite uses mocked AWS SDK clients (no running services required):

```bash
pnpm test    # 135 tests
```

## Migrating from Vercel World

`@wraps.dev/world-aws` implements the same `World` interface as Vercel's built-in world. Switching requires three steps:

### 1. Install the package

```bash
pnpm add @wraps.dev/world-aws
```

### 2. Create AWS infrastructure

```bash
npx world-aws-setup --region us-east-1
```

### 3. Set the environment variable

```bash
WORKFLOW_TARGET_WORLD=@wraps.dev/world-aws
```

Your workflow code (`"use workflow"`, `"use step"`, `step()`) stays exactly the same — no code changes required.

### Key Differences

| | Vercel World | AWS World |
|---|---|---|
| **Storage** | Vercel-managed | DynamoDB (your account) |
| **Queues** | Vercel-managed | SQS (your account) |
| **Execution** | Vercel Edge/Serverless | Lambda (SQS trigger) |
| **Streaming** | Vercel infrastructure | DynamoDB Streams |
| **Encryption** | — | Opt-in HKDF-SHA256 |
| **Billing** | Vercel pricing | AWS pay-per-use |
| **Data ownership** | Vercel | You |

### Lambda Handler

The main difference is that AWS World needs a Lambda function to consume SQS messages. Create a handler file:

```typescript
import { createWorld } from "@wraps.dev/world-aws";
import { createSQSHandler } from "@wraps.dev/world-aws/lambda";
import { serve } from "workflow";

const world = createWorld();
export const handler = createSQSHandler(serve(world));
```

Deploy this as a Lambda with SQS event source mappings for the `{prefix}-workflows` and `{prefix}-steps` queues.

## Requirements

- AWS account with DynamoDB and SQS access
- Node.js 20+
- `@workflow/world ^4.0.0`

## License

AGPL-3.0-or-later
