# @wraps.dev/pulumi

Pulumi component for deploying Wraps email infrastructure to your AWS account.

## Installation

```bash
npm install @wraps.dev/pulumi
```

## Quick Start

```typescript
import { WrapsEmail } from "@wraps.dev/pulumi";

// Minimal setup with Vercel OIDC
const email = new WrapsEmail("email", {
  vercel: {
    teamSlug: "my-team",
    projectName: "my-app",
  },
});

// Export the role ARN for your Vercel environment
export const roleArn = email.roleArn;
export const configSetName = email.configSetName;
```

## Features

- **Zero credentials stored** - Uses OIDC for secure authentication
- **Full AWS ownership** - Infrastructure deploys to your AWS account
- **Sensible defaults** - Works out of the box, customize as needed
- **SST-style API** - Composition over presets, transform functions for customization

## Configuration Options

### With Domain and Event Tracking

```typescript
const email = new WrapsEmail("email", {
  vercel: {
    teamSlug: "my-team",
    projectName: "my-app",
  },
  domain: "example.com",
  events: {
    types: ["SEND", "DELIVERY", "BOUNCE", "COMPLAINT", "OPEN", "CLICK"],
    storeHistory: true,
    retention: "90days",
  },
});
```

### Full Configuration

```typescript
const email = new WrapsEmail("email", {
  // Authentication (choose one)
  vercel: {
    teamSlug: "my-team",
    projectName: "my-app",
  },
  // Or custom OIDC:
  // oidc: {
  //   providerUrl: "https://token.actions.githubusercontent.com",
  //   audience: "sts.amazonaws.com",
  //   subjectPattern: "repo:my-org/my-repo:*",
  // },

  // Domain configuration
  domain: "example.com",
  mailFromSubdomain: "mail", // Creates mail.example.com

  // Event tracking
  events: {
    types: ["SEND", "DELIVERY", "BOUNCE", "COMPLAINT", "OPEN", "CLICK"],
    storeHistory: true,
    retention: "90days", // "7days" | "30days" | "90days" | "6months" | "1year" | "unlimited"
  },

  // Email settings
  reputationMetrics: true,
  tlsRequired: false,
  sendingEnabled: true,

  // Suppression list
  suppressionList: {
    enabled: true,
    reasons: ["BOUNCE", "COMPLAINT"],
  },

  // SMTP credentials (for legacy systems)
  smtp: {
    enabled: false,
  },

  // Resource tags
  tags: {
    Environment: "production",
  },

  // Transform underlying resources
  transform: {
    table: (args) => ({
      ...args,
      billingMode: "PROVISIONED",
    }),
  },
});
```

## Outputs

| Output | Description |
|--------|-------------|
| `roleArn` | IAM role ARN for SDK authentication |
| `configSetName` | SES configuration set name |
| `tableName` | DynamoDB table name (if history enabled) |
| `queueUrl` | SQS queue URL (if events enabled) |
| `domain` | Verified domain (if configured) |

## Accessing Underlying Resources

```typescript
const email = new WrapsEmail("email", { /* ... */ });

// Access raw Pulumi resources via .nodes
email.nodes.role;           // aws.iam.Role
email.nodes.configSet;      // aws.sesv2.ConfigurationSet
email.nodes.table;          // aws.dynamodb.Table (if enabled)
email.nodes.queue;          // aws.sqs.Queue (if enabled)
email.nodes.lambda;         // aws.lambda.Function (if enabled)
email.nodes.oidcProvider;   // aws.iam.OpenIdConnectProvider (if OIDC)
```

## Using with @wraps.dev/email SDK

After deploying, use the [@wraps.dev/email](https://www.npmjs.com/package/@wraps.dev/email) SDK to send emails:

```typescript
import { WrapsEmail } from "@wraps.dev/email";

const email = new WrapsEmail();

await email.send({
  from: "hello@example.com",
  to: "user@example.com",
  subject: "Hello from Wraps!",
  html: "<h1>Welcome!</h1>",
});
```

## Requirements

- Node.js 20+
- Pulumi 3.x
- @pulumi/aws 6.x or 7.x

## License

AGPL-3.0-or-later
