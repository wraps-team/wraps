# @wraps.dev/cdk

AWS CDK construct for deploying Wraps email infrastructure to your AWS account.

## Installation

```bash
npm install @wraps.dev/cdk
```

## Quick Start

```typescript
import { WrapsEmail } from "@wraps.dev/cdk";
import * as cdk from "aws-cdk-lib";

const app = new cdk.App();
const stack = new cdk.Stack(app, "EmailStack");

// Minimal setup with Vercel OIDC
const email = new WrapsEmail(stack, "Email", {
  vercel: {
    teamSlug: "my-team",
    projectName: "my-app",
  },
});

// Outputs are automatically created
// WrapsEmailRoleArn, WrapsEmailConfigSetName, etc.
```

## Features

- **Zero credentials stored** - Uses OIDC for secure authentication
- **Full AWS ownership** - Infrastructure deploys to your AWS account
- **Sensible defaults** - Works out of the box, customize as needed
- **CDK grant methods** - Easy IAM permission management

## Configuration Options

### With Domain and Event Tracking

```typescript
const email = new WrapsEmail(stack, "Email", {
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
import * as cdk from "aws-cdk-lib";

const email = new WrapsEmail(stack, "Email", {
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

  // CDK removal policy
  removalPolicy: cdk.RemovalPolicy.RETAIN,

  // Resource tags
  tags: {
    Environment: "production",
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

## Grant Methods

The construct provides CDK-style grant methods for easy IAM permission management:

```typescript
import * as lambda from "aws-cdk-lib/aws-lambda";

const email = new WrapsEmail(stack, "Email", { /* ... */ });

// Create a Lambda function
const myFunction = new lambda.Function(stack, "MyFunction", { /* ... */ });

// Grant send permissions
email.grantSend(myFunction);

// Grant read access to email history
email.grantReadHistory(myFunction);

// Grant access to consume events from SQS
email.grantConsumeEvents(myFunction);
```

## Accessing Underlying Resources

```typescript
const email = new WrapsEmail(stack, "Email", { /* ... */ });

// Access CDK constructs via .resources
email.resources.role;           // iam.Role
email.resources.configSet;      // ses.ConfigurationSet
email.resources.table;          // dynamodb.Table (if enabled)
email.resources.queue;          // sqs.Queue (if enabled)
email.resources.eventProcessor; // lambda.Function (if enabled)
email.resources.oidcProvider;   // iam.OpenIdConnectProvider (if OIDC)
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
- AWS CDK 2.x
- constructs 10.x

## License

MIT
