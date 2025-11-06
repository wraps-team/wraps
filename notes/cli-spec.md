# BYO CLI - Build Specification

## Project Overview

Build a professional command-line tool that deploys email infrastructure (AWS SES) to users' AWS accounts. The CLI should handle infrastructure deployment, OIDC federation setup (for Vercel), and provide an excellent developer experience.

**Core Value Proposition:** One command deploys production-ready email infrastructure to the user's AWS account with zero credentials stored, Resend-like DX, AWS pricing.

---

## Tech Stack

```json
{
  "framework": "Commander.js",
  "prompts": "@inquirer/prompts",
  "infrastructure": "@pulumi/pulumi + @pulumi/aws",
  "ui": {
    "spinners": "ora",
    "colors": "chalk", 
    "boxes": "boxen"
  },
  "aws": "@aws-sdk/client-*",
  "bundler": "tsup",
  "runtime": "Node.js 20+",
  "language": "TypeScript (strict mode)",
  "packageManager": "pnpm"
}
```

---

## Project Structure

```
packages/cli/
├── src/
│   ├── cli.ts                    # Entry point
│   ├── commands/
│   │   ├── init.ts              # Deploy new infrastructure
│   │   ├── connect.ts           # Connect existing SES
│   │   ├── status.ts            # Show current setup
│   │   ├── verify.ts            # Verify domain DNS
│   │   └── upgrade.ts           # Upgrade dashboard-only to enhanced
│   ├── infrastructure/
│   │   ├── email-stack.ts       # Main Pulumi stack
│   │   ├── vercel-oidc.ts       # Vercel OIDC setup
│   │   ├── aws-native.ts        # AWS native (IAM roles)
│   │   └── resources/
│   │       ├── iam.ts           # IAM role definitions
│   │       ├── ses.ts           # SES configuration
│   │       ├── dynamodb.ts      # DynamoDB tables
│   │       ├── lambda.ts        # Lambda functions
│   │       └── sns.ts           # SNS topics
│   ├── providers/
│   │   ├── vercel.ts            # Vercel integration
│   │   ├── aws.ts               # AWS native
│   │   └── railway.ts           # Railway (future)
│   ├── utils/
│   │   ├── aws.ts               # AWS SDK helpers
│   │   ├── prompts.ts           # Prompt utilities
│   │   ├── errors.ts            # Error handling
│   │   ├── dns.ts               # DNS record helpers
│   │   └── output.ts            # Console output formatting
│   └── types/
│       └── index.ts             # TypeScript types
├── lambda/                       # Lambda function source
│   ├── event-processor/
│   │   ├── index.ts
│   │   └── package.json
│   └── webhook-sender/
│       ├── index.ts
│       └── package.json
├── templates/                    # CloudFormation templates (fallback)
│   └── email-stack.yaml
├── tsup.config.ts
├── package.json
├── tsconfig.json
└── README.md
```

---

## Commands to Implement

### 1. `byo init` - Deploy New Infrastructure

**Usage:**
```bash
byo init
byo init --provider vercel --region us-east-1
byo init --provider aws --domain myapp.com
```

**Flow:**
1. Validate AWS credentials (`aws sts get-caller-identity`)
2. Prompt for configuration:
   - Hosting provider (Vercel, AWS, Railway, Other)
   - AWS region (default: us-east-1)
   - Domain to verify (optional)
   - If Vercel: team slug, project name
3. Deploy infrastructure using Pulumi:
   - OIDC provider (if Vercel)
   - IAM role (appropriate trust policy)
   - SES configuration set
   - DynamoDB table for email history
   - Lambda functions (event processor, webhook sender)
   - SNS topics (bounce/complaint handling)
   - CloudWatch alarms
4. If Vercel: Set environment variables via Vercel API
5. Display success message with:
   - Role ARN
   - Configuration set name
   - DNS records to add
   - Next steps

**Technical Details:**
- Use Pulumi inline program (no separate stack file)
- Bundle Lambda functions on-the-fly using esbuild
- Store deployment state in `~/.byo/` directory
- Generate unique external ID for IAM role (security)

### 2. `byo connect` - Connect Existing SES

**Usage:**
```bash
byo connect --existing
byo connect --existing --dashboard-only
byo connect --existing --enhanced
```

**Flow:**
1. Validate AWS credentials
2. Scan existing AWS resources:
   - Find verified SES domains
   - Find existing configuration sets
   - Find existing SNS topics
   - Find existing Lambda functions
3. Prompt:
   - Integration level (dashboard-only or enhanced)
   - Select domains to track
4. Deploy:
   - Dashboard-only: Just IAM role (read-only)
   - Enhanced: New resources with `byo-` prefix (non-destructive)
5. Display integration status

**Important:** Never modify existing resources. Always create new ones with `byo-` prefix.

### 3. `byo status` - Show Current Setup

**Usage:**
```bash
byo status
byo status --account production
```

**Output:**
```
BYO Email Infrastructure

Integration: Enhanced
Region: us-east-1
Domains: myapp.com (verified), staging.myapp.com (pending)

Resources:
  ✓ IAM Role: arn:aws:iam::123456789:role/byo-email-role
  ✓ Configuration Set: byo-tracking
  ✓ DynamoDB Table: byo-email-history
  ✓ Lambda Functions: 2 deployed
  ✓ SNS Topics: 2 configured

Dashboard: https://dashboard.byo.dev
Docs: https://docs.byo.dev
```

### 4. `byo verify` - Verify Domain DNS

**Usage:**
```bash
byo verify --domain myapp.com
```

**Flow:**
1. Query DNS records for domain
2. Check DKIM, SPF, DMARC records
3. Display status (✓ or ✗ for each)
4. Provide guidance if records missing/incorrect

### 5. `byo upgrade` - Upgrade Integration

**Usage:**
```bash
byo upgrade --enhanced
```

**Flow:**
1. Detect current integration level
2. Deploy additional resources
3. Update configuration

---

## Pulumi Stack Implementation

### Main Stack Entry Point

```typescript
// src/infrastructure/email-stack.ts
import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import { createVercelOIDC } from './vercel-oidc';
import { createIAMRole } from './resources/iam';
import { createSESResources } from './resources/ses';
import { createDynamoDBTables } from './resources/dynamodb';
import { deployLambdaFunctions } from './resources/lambda';

export interface EmailStackConfig {
  provider: 'vercel' | 'aws' | 'other';
  region: string;
  domain?: string;
  vercel?: {
    teamSlug: string;
    projectName: string;
  };
  integrationLevel: 'dashboard-only' | 'enhanced';
}

export async function deployEmailStack(config: EmailStackConfig) {
  // Get current AWS account
  const identity = await aws.getCallerIdentity();
  const accountId = identity.accountId;

  let oidcProvider: aws.iam.OpenIdConnectProvider | undefined;
  
  // 1. Create OIDC provider if Vercel
  if (config.provider === 'vercel' && config.vercel) {
    oidcProvider = await createVercelOIDC({
      teamSlug: config.vercel.teamSlug,
      accountId,
    });
  }

  // 2. Create IAM role
  const role = await createIAMRole({
    provider: config.provider,
    oidcProvider,
    vercelTeamSlug: config.vercel?.teamSlug,
    vercelProjectName: config.vercel?.projectName,
    integrationLevel: config.integrationLevel,
  });

  // 3. SES resources (if enhanced)
  let sesResources;
  if (config.integrationLevel === 'enhanced') {
    sesResources = await createSESResources({
      domain: config.domain,
    });
  }

  // 4. DynamoDB tables (if enhanced)
  let dynamoTables;
  if (config.integrationLevel === 'enhanced') {
    dynamoTables = await createDynamoDBTables();
  }

  // 5. Lambda functions (if enhanced)
  let lambdaFunctions;
  if (config.integrationLevel === 'enhanced') {
    lambdaFunctions = await deployLambdaFunctions({
      roleArn: role.arn,
      tableName: dynamoTables!.emailHistory.name,
    });
  }

  // Return outputs
  return {
    roleArn: role.arn,
    configSetName: sesResources?.configSet.name,
    tableName: dynamoTables?.emailHistory.name,
    region: config.region,
  };
}
```

### Vercel OIDC Setup

```typescript
// src/infrastructure/vercel-oidc.ts
import * as aws from '@pulumi/aws';

export async function createVercelOIDC(config: {
  teamSlug: string;
  accountId: string;
}) {
  return new aws.iam.OpenIdConnectProvider('byo-vercel-oidc', {
    url: `https://oidc.vercel.com/${config.teamSlug}`,
    clientIdLists: [`https://vercel.com/${config.teamSlug}`],
    thumbprintLists: [
      '20032e77eca0785eece16b56b42c9b330b906320',
      '696db3af0dffc17e65c6a20d925c5a7bd24dec7e',
    ],
    tags: {
      ManagedBy: 'byo-cli',
      Provider: 'vercel',
    },
  });
}
```

### IAM Role Creation

```typescript
// src/infrastructure/resources/iam.ts
import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';

export async function createIAMRole(config: {
  provider: 'vercel' | 'aws' | 'other';
  oidcProvider?: aws.iam.OpenIdConnectProvider;
  vercelTeamSlug?: string;
  vercelProjectName?: string;
  integrationLevel: 'dashboard-only' | 'enhanced';
}) {
  // Build assume role policy based on provider
  let assumeRolePolicy: pulumi.Output<string>;

  if (config.provider === 'vercel' && config.oidcProvider) {
    assumeRolePolicy = pulumi.interpolate`{
      "Version": "2012-10-17",
      "Statement": [{
        "Effect": "Allow",
        "Principal": {
          "Federated": "${config.oidcProvider.arn}"
        },
        "Action": "sts:AssumeRoleWithWebIdentity",
        "Condition": {
          "StringEquals": {
            "oidc.vercel.com/${config.vercelTeamSlug}:aud": "https://vercel.com/${config.vercelTeamSlug}"
          },
          "StringLike": {
            "oidc.vercel.com/${config.vercelTeamSlug}:sub": "owner:${config.vercelTeamSlug}:project:${config.vercelProjectName}:environment:*"
          }
        }
      }]
    }`;
  } else if (config.provider === 'aws') {
    // Native AWS - EC2, Lambda, ECS can assume
    assumeRolePolicy = pulumi.output(`{
      "Version": "2012-10-17",
      "Statement": [{
        "Effect": "Allow",
        "Principal": {
          "Service": ["lambda.amazonaws.com", "ec2.amazonaws.com", "ecs-tasks.amazonaws.com"]
        },
        "Action": "sts:AssumeRole"
      }]
    }`);
  } else {
    // Other providers - will use access keys
    throw new Error('Other providers not yet implemented');
  }

  const role = new aws.iam.Role('byo-email-role', {
    name: 'byo-email-role',
    assumeRolePolicy,
    tags: {
      ManagedBy: 'byo-cli',
      Provider: config.provider,
    },
  });

  // Attach policies based on integration level
  if (config.integrationLevel === 'dashboard-only') {
    // Read-only access
    new aws.iam.RolePolicy('byo-dashboard-read-policy', {
      role: role.name,
      policy: JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Action: [
              'ses:GetSendStatistics',
              'ses:ListIdentities',
              'ses:GetIdentityVerificationAttributes',
              'cloudwatch:GetMetricData',
              'cloudwatch:GetMetricStatistics',
              'logs:FilterLogEvents',
            ],
            Resource: '*',
          },
        ],
      }),
    });
  } else {
    // Enhanced - send + read access
    new aws.iam.RolePolicy('byo-email-policy', {
      role: role.name,
      policy: JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Action: [
              'ses:SendEmail',
              'ses:SendRawEmail',
              'ses:SendTemplatedEmail',
              'ses:GetSendStatistics',
              'ses:ListIdentities',
            ],
            Resource: '*',
          },
          {
            Effect: 'Allow',
            Action: [
              'dynamodb:PutItem',
              'dynamodb:GetItem',
              'dynamodb:Query',
              'dynamodb:Scan',
            ],
            Resource: 'arn:aws:dynamodb:*:*:table/byo-*',
          },
        ],
      }),
    });
  }

  return role;
}
```

### SES Resources

```typescript
// src/infrastructure/resources/ses.ts
import * as aws from '@pulumi/aws';

export async function createSESResources(config: {
  domain?: string;
}) {
  // Configuration set for tracking
  const configSet = new aws.ses.ConfigurationSet('byo-tracking', {
    name: 'byo-tracking',
    tags: {
      ManagedBy: 'byo-cli',
    },
  });

  // SNS topic for bounce/complaint notifications
  const bounceComplaintTopic = new aws.sns.Topic('byo-bounce-complaints', {
    name: 'byo-bounce-complaints',
    tags: {
      ManagedBy: 'byo-cli',
    },
  });

  // Event destination for bounces/complaints
  new aws.ses.EventDestination('byo-bounce-complaint-events', {
    name: 'byo-bounce-complaints',
    configurationSetName: configSet.name,
    enabled: true,
    matchingTypes: ['bounce', 'complaint'],
    snsDestination: {
      topicArn: bounceComplaintTopic.arn,
    },
  });

  // Optional: Verify domain if provided
  let domainIdentity;
  if (config.domain) {
    domainIdentity = new aws.ses.DomainIdentity('byo-domain', {
      domain: config.domain,
    });

    // DKIM tokens
    const dkim = new aws.ses.DomainDkim('byo-dkim', {
      domain: domainIdentity.domain,
    });
  }

  return {
    configSet,
    bounceComplaintTopic,
    domainIdentity,
  };
}
```

### DynamoDB Tables

```typescript
// src/infrastructure/resources/dynamodb.ts
import * as aws from '@pulumi/aws';

export async function createDynamoDBTables() {
  // Email history table
  const emailHistory = new aws.dynamodb.Table('byo-email-history', {
    name: 'byo-email-history',
    billingMode: 'PAY_PER_REQUEST',
    hashKey: 'messageId',
    rangeKey: 'sentAt',
    attributes: [
      { name: 'messageId', type: 'S' },
      { name: 'sentAt', type: 'N' },
      { name: 'accountId', type: 'S' },
    ],
    globalSecondaryIndexes: [
      {
        name: 'accountId-sentAt-index',
        hashKey: 'accountId',
        rangeKey: 'sentAt',
        projectionType: 'ALL',
      },
    ],
    ttl: {
      enabled: true,
      attributeName: 'expiresAt',
    },
    tags: {
      ManagedBy: 'byo-cli',
    },
  });

  return {
    emailHistory,
  };
}
```

---

## CLI User Experience

### Spinner Pattern

```typescript
// src/utils/output.ts
import ora from 'ora';
import chalk from 'chalk';

export class DeploymentProgress {
  private spinner: ora.Ora;
  private steps: string[] = [];

  constructor() {
    this.spinner = ora();
  }

  start(message: string) {
    this.spinner.text = message;
    this.spinner.start();
  }

  succeed(message: string) {
    this.steps.push(message);
    this.spinner.succeed(message);
  }

  fail(message: string) {
    this.spinner.fail(message);
  }

  info(message: string) {
    this.spinner.info(message);
  }

  async step<T>(message: string, fn: () => Promise<T>): Promise<T> {
    this.start(message);
    try {
      const result = await fn();
      this.succeed(message);
      return result;
    } catch (error) {
      this.fail(message);
      throw error;
    }
  }
}

// Usage in commands
const progress = new DeploymentProgress();

await progress.step('Validating AWS credentials', async () => {
  return validateAWSCredentials();
});

await progress.step('Creating OIDC provider', async () => {
  return createOIDCProvider();
});
```

### Success Output

```typescript
// src/utils/output.ts
import boxen from 'boxen';
import chalk from 'chalk';

export function displaySuccess(outputs: {
  roleArn: string;
  configSetName?: string;
  region: string;
  dnsRecords?: { name: string; type: string; value: string }[];
}) {
  console.log('\n' + boxen(
    chalk.green.bold('✓ Email infrastructure deployed!\n\n') +
    chalk.white('Role ARN:\n') +
    chalk.cyan(`  ${outputs.roleArn}\n\n`) +
    chalk.white('Region: ') + chalk.cyan(outputs.region) +
    (outputs.configSetName ? `\n${chalk.white('Config Set: ')}${chalk.cyan(outputs.configSetName)}` : '') +
    '\n\n' +
    chalk.gray('Next steps:\n') +
    chalk.white('1. Install SDK: ') + chalk.yellow('npm install @byo/email\n') +
    chalk.white('2. View dashboard: ') + chalk.blue.underline('https://dashboard.byo.dev'),
    {
      padding: 1,
      margin: 1,
      borderStyle: 'round',
      borderColor: 'green',
    }
  ));

  if (outputs.dnsRecords && outputs.dnsRecords.length > 0) {
    console.log(chalk.white.bold('\nDNS Records to add:\n'));
    outputs.dnsRecords.forEach(record => {
      console.log(chalk.cyan(`  ${record.name}`) + 
                  chalk.gray(' ' + record.type + ' ') + 
                  chalk.white(`"${record.value}"`));
    });
    console.log(chalk.gray('\nRun: ') + 
                chalk.yellow('byo verify --domain yourapp.com') + 
                chalk.gray(' (after DNS propagates)\n'));
  }
}
```

---

## Error Handling

```typescript
// src/utils/errors.ts
import chalk from 'chalk';

export class BYOError extends Error {
  constructor(
    message: string,
    public code: string,
    public suggestion?: string,
    public docsUrl?: string
  ) {
    super(message);
    this.name = 'BYOError';
  }
}

export function handleCLIError(error: unknown): never {
  console.error(''); // Blank line

  if (error instanceof BYOError) {
    console.error(chalk.red.bold(`✖ ${error.message}\n`));
    
    if (error.suggestion) {
      console.error(chalk.yellow('Suggestion:'));
      console.error(chalk.white(`  ${error.suggestion}\n`));
    }

    if (error.docsUrl) {
      console.error(chalk.gray('Documentation:'));
      console.error(chalk.blue.underline(`  ${error.docsUrl}\n`));
    }

    process.exit(1);
  }

  // Unknown error
  console.error(chalk.red.bold('An unexpected error occurred:\n'));
  console.error(error);
  console.error(chalk.gray('\nIf this persists, please report at:'));
  console.error(chalk.blue.underline('  https://github.com/byo/byo/issues\n'));
  process.exit(1);
}

// Common errors
export const errors = {
  noAWSCredentials: () => new BYOError(
    'AWS credentials not found',
    'NO_AWS_CREDENTIALS',
    'Run: aws configure\nOr set AWS_PROFILE environment variable',
    'https://docs.byo.dev/setup/aws-credentials'
  ),
  
  stackExists: (stackName: string) => new BYOError(
    `Stack "${stackName}" already exists`,
    'STACK_EXISTS',
    `To update: byo upgrade\nTo remove: byo destroy --stack ${stackName}`,
    'https://docs.byo.dev/cli/upgrade'
  ),

  invalidRegion: (region: string) => new BYOError(
    `Invalid AWS region: ${region}`,
    'INVALID_REGION',
    'Use a valid AWS region like: us-east-1, eu-west-1, ap-southeast-1',
    'https://docs.aws.amazon.com/general/latest/gr/rande.html'
  ),
};
```

---

## AWS Utilities

```typescript
// src/utils/aws.ts
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { SESClient, VerifyDomainIdentityCommand } from '@aws-sdk/client-ses';
import { errors } from './errors';

export async function validateAWSCredentials() {
  const sts = new STSClient({ region: 'us-east-1' });
  
  try {
    const identity = await sts.send(new GetCallerIdentityCommand({}));
    return {
      accountId: identity.Account!,
      userId: identity.UserId!,
      arn: identity.Arn!,
    };
  } catch (error) {
    throw errors.noAWSCredentials();
  }
}

export async function checkRegion(region: string): Promise<boolean> {
  // Validate region by trying to create SES client
  try {
    const ses = new SESClient({ region });
    await ses.send(new VerifyDomainIdentityCommand({ Domain: 'test.com' }));
    return true;
  } catch (error: any) {
    if (error.name === 'InvalidParameterValue' && error.message.includes('region')) {
      return false;
    }
    return true; // Other errors are fine (like permissions)
  }
}

export async function getAWSRegion(): Promise<string> {
  // Try to detect region from various sources
  if (process.env.AWS_REGION) return process.env.AWS_REGION;
  if (process.env.AWS_DEFAULT_REGION) return process.env.AWS_DEFAULT_REGION;
  
  // Try to read from AWS config file
  // ... implementation
  
  return 'us-east-1'; // Default fallback
}
```

---

## Prompt Utilities

```typescript
// src/utils/prompts.ts
import { select, input, confirm } from '@inquirer/prompts';

export async function promptProvider() {
  return select({
    message: 'Where is your app hosted?',
    choices: [
      {
        name: 'Vercel',
        value: 'vercel',
        description: 'Uses OIDC (no AWS credentials needed)',
      },
      {
        name: 'AWS (Lambda/ECS/EC2)',
        value: 'aws',
        description: 'Uses IAM roles automatically',
      },
      {
        name: 'Railway',
        value: 'railway',
        description: 'Requires AWS credentials',
      },
      {
        name: 'Other',
        value: 'other',
        description: 'Will use AWS access keys',
      },
    ],
  });
}

export async function promptRegion(defaultRegion: string) {
  return input({
    message: 'AWS Region:',
    default: defaultRegion,
    validate: (value) => {
      const validRegions = [
        'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
        'eu-west-1', 'eu-west-2', 'eu-central-1',
        'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1',
      ];
      if (!validRegions.includes(value)) {
        return 'Please enter a valid AWS region';
      }
      return true;
    },
  });
}

export async function promptDomain() {
  return input({
    message: 'Domain to verify (optional):',
    validate: (value) => {
      if (!value) return true; // Optional
      if (!value.includes('.')) {
        return 'Please enter a valid domain (e.g., myapp.com)';
      }
      return true;
    },
  });
}

export async function promptVercelConfig() {
  const teamSlug = await input({
    message: 'Vercel team slug:',
    validate: (value) => {
      if (!value) return 'Team slug is required for Vercel integration';
      return true;
    },
  });

  const projectName = await input({
    message: 'Vercel project name:',
    validate: (value) => {
      if (!value) return 'Project name is required';
      return true;
    },
  });

  return { teamSlug, projectName };
}

export async function confirmDeploy() {
  return confirm({
    message: 'Deploy infrastructure to your AWS account?',
    default: true,
  });
}
```

---

## Testing

```typescript
// src/commands/__tests__/init.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { init } from '../init';
import * as aws from '@aws-sdk/client-sts';

describe('init command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validates AWS credentials', async () => {
    const mockSTS = vi.spyOn(aws, 'STSClient').mockImplementation(() => ({
      send: vi.fn().mockResolvedValue({
        Account: '123456789',
        UserId: 'AIDAI...',
        Arn: 'arn:aws:iam::123456789:user/test',
      }),
    } as any));

    // Test that credentials are validated
    // ... test implementation
  });

  it('throws error when credentials missing', async () => {
    const mockSTS = vi.spyOn(aws, 'STSClient').mockImplementation(() => ({
      send: vi.fn().mockRejectedValue(new Error('No credentials')),
    } as any));

    await expect(init({ region: 'us-east-1' })).rejects.toThrow('AWS credentials not found');
  });

  it('prompts for required configuration', async () => {
    // Test interactive prompts
    // ... test implementation
  });

  it('deploys infrastructure successfully', async () => {
    // Test full deployment flow
    // ... test implementation
  });
});
```

---

## Package Configuration

### package.json

```json
{
  "name": "@byo/cli",
  "version": "0.1.0",
  "description": "CLI for deploying BYO email infrastructure",
  "type": "module",
  "bin": {
    "byo": "./dist/cli.js"
  },
  "scripts": {
    "dev": "tsup --watch",
    "build": "tsup",
    "test": "vitest",
    "test:watch": "vitest --watch",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src",
    "prepublishOnly": "pnpm build"
  },
  "keywords": ["aws", "ses", "email", "infrastructure", "cli"],
  "author": "BYO",
  "license": "MIT",
  "dependencies": {
    "commander": "^11.1.0",
    "@inquirer/prompts": "^4.0.0",
    "ora": "^7.0.1",
    "chalk": "^5.3.0",
    "boxen": "^7.1.1",
    "@pulumi/pulumi": "^3.100.0",
    "@pulumi/aws": "^6.20.0",
    "@aws-sdk/client-cloudformation": "^3.490.0",
    "@aws-sdk/client-sts": "^3.490.0",
    "@aws-sdk/client-ses": "^3.490.0",
    "@aws-sdk/client-sns": "^3.490.0",
    "@aws-sdk/client-dynamodb": "^3.490.0",
    "cosmiconfig": "^9.0.0",
    "esbuild": "^0.19.0"
  },
  "devDependencies": {
    "tsup": "^8.0.1",
    "typescript": "^5.3.3",
    "vitest": "^1.2.0",
    "@types/node": "^20.11.0",
    "eslint": "^8.56.0"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

### tsup.config.ts

```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  shims: true,
  splitting: false,
  bundle: true,
  minify: false, // Keep readable for debugging
  sourcemap: true,
  target: 'node20',
  outDir: 'dist',
  onSuccess: 'chmod +x dist/cli.js',
});
```

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "lib": ["ES2022"],
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "allowJs": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

---

## Implementation Priority

### Phase 1: MVP (Week 1)
1. ✅ Basic CLI structure (Commander.js)
2. ✅ AWS credential validation
3. ✅ Interactive prompts (Inquirer)
4. ✅ Simple Pulumi stack (IAM role only)
5. ✅ Success output formatting

### Phase 2: Core Deployment (Week 2)
1. ✅ Full Pulumi stack (SES, DynamoDB, Lambda, SNS)
2. ✅ Vercel OIDC integration
3. ✅ Lambda function bundling
4. ✅ Error handling
5. ✅ `byo status` command

### Phase 3: Existing SES Support (Week 3)
1. ✅ `byo connect --existing` flow
2. ✅ Resource detection
3. ✅ Dashboard-only vs enhanced modes
4. ✅ Non-destructive deployment

### Phase 4: Polish (Week 4)
1. ✅ DNS verification (`byo verify`)
2. ✅ Upgrade command
3. ✅ Tests
4. ✅ Documentation
5. ✅ Publishing to npm

---

## Critical Design Principles

1. **Non-Destructive:** Never modify existing AWS resources
2. **Namespace Everything:** All resources prefixed with `byo-`
3. **Fail Fast:** Validate early, deploy confidently
4. **Great UX:** Beautiful output, clear errors, helpful suggestions
5. **Type-Safe:** Strict TypeScript throughout
6. **Testable:** Write tests for critical paths
7. **Documented:** JSDoc comments on public APIs

---

## Entry Point Example

```typescript
#!/usr/bin/env node
// src/cli.ts
import { Command } from 'commander';
import { init } from './commands/init';
import { connect } from './commands/connect';
import { status } from './commands/status';
import { verify } from './commands/verify';
import { upgrade } from './commands/upgrade';
import { handleCLIError } from './utils/errors';

const program = new Command();

program
  .name('byo')
  .description('Deploy email infrastructure to your AWS account')
  .version('0.1.0');

program
  .command('init')
  .description('Deploy new email infrastructure')
  .option('-p, --provider <provider>', 'hosting provider (vercel, aws, railway)')
  .option('-r, --region <region>', 'AWS region')
  .option('-d, --domain <domain>', 'domain to verify')
  .action(async (options) => {
    try {
      await init(options);
    } catch (error) {
      handleCLIError(error);
    }
  });

program
  .command('connect')
  .description('Connect existing AWS SES setup')
  .option('--existing', 'connect to existing SES')
  .option('--dashboard-only', 'read-only dashboard access')
  .option('--enhanced', 'full tracking infrastructure')
  .action(async (options) => {
    try {
      await connect(options);
    } catch (error) {
      handleCLIError(error);
    }
  });

program
  .command('status')
  .description('Show current infrastructure status')
  .option('-a, --account <account>', 'AWS account ID or alias')
  .action(async (options) => {
    try {
      await status(options);
    } catch (error) {
      handleCLIError(error);
    }
  });

program
  .command('verify')
  .description('Verify domain DNS records')
  .requiredOption('-d, --domain <domain>', 'domain to verify')
  .action(async (options) => {
    try {
      await verify(options);
    } catch (error) {
      handleCLIError(error);
    }
  });

program
  .command('upgrade')
  .description('Upgrade integration level')
  .option('--enhanced', 'upgrade to enhanced tracking')
  .action(async (options) => {
    try {
      await upgrade(options);
    } catch (error) {
      handleCLIError(error);
    }
  });

program.parse();
```

---

## Success Criteria

✅ One command deploys infrastructure (< 2 minutes)
✅ Beautiful terminal output (spinners, colors, boxes)
✅ Clear error messages with suggestions
✅ Non-destructive (never breaks existing setups)
✅ Type-safe (strict TypeScript)
✅ Tested (critical paths have tests)
✅ Works on macOS, Linux, Windows

---

## Getting Started

1. Create new directory: `mkdir -p packages/cli`
2. Initialize: `pnpm init`
3. Install dependencies from package.json above
4. Create src/ directory with structure
5. Start with cli.ts entry point
6. Implement commands one by one (init first)
7. Test locally: `pnpm build && node dist/cli.js init`

---

## Resources

- **Pulumi Docs:** https://www.pulumi.com/docs/
- **AWS SDK v3:** https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/
- **Commander.js:** https://github.com/tj/commander.js
- **Inquirer:** https://github.com/SBoudrias/Inquirer.js
- **Ora:** https://github.com/sindresorhus/ora

---

This specification should give you everything you need to build the BYO CLI tool. Start with Phase 1 (basic structure) and iterate from there. Focus on great UX and non-destructive deployment patterns.