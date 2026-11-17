# Infrastructure — Pulumi Stacks & Resources

This directory contains the Pulumi inline programs that deploy AWS infrastructure to user accounts.

## Structure

```
infrastructure/
├── email-stack.ts      # Email: SES, IAM, DynamoDB, Lambda, EventBridge, SQS, MailManager, S3
├── sms-stack.ts        # SMS: AWS End User Messaging / Pinpoint SMS
├── cdn-stack.ts        # CDN: S3 + CloudFront + ACM certificates
├── vercel-oidc.ts      # Vercel OIDC provider setup
└── resources/          # One file per concern
    ├── iam.ts          # IAM roles and policies
    ├── ses.ts          # SES configuration sets, identities
    ├── dynamodb.ts     # DynamoDB tables
    ├── lambda.ts       # Lambda functions (esbuild bundling)
    ├── eventbridge.ts  # EventBridge rules and targets
    ├── sqs.ts          # SQS queues and DLQs
    ├── s3-cdn.ts       # S3 buckets for CDN
    ├── s3-inbound.ts   # S3 buckets for inbound email
    ├── cloudfront.ts   # CloudFront distributions
    ├── acm.ts          # ACM certificates
    ├── mail-manager.ts # SES Mail Manager (inbound routing)
    ├── alerting.ts     # CloudWatch alarms and SNS topics
    ├── smtp-credentials.ts  # SMTP credential generation
    └── ...
```

## Key Patterns

### Stack Composition
Each stack file (`email-stack.ts`, etc.) is a Pulumi inline program that composes resources from `resources/`. Stacks handle orchestration and dependency ordering; resource files handle the AWS API details.

### Resource Naming
Name every resource `wraps-{service}-{resource}` (invariant 2):
- `wraps-email-role`, `wraps-email-tracking`, `wraps-email-events`
- `wraps-sms-role`, `wraps-sms-sending`
- `wraps-cdn-bucket`, `wraps-cdn-distribution`

### Tagging
Tag every AWS resource `ManagedBy: 'wraps-cli'`. The tag marks a resource as Wraps-made where its name can't, as with SMS phone numbers (the phone-number lookup in `sms-stack.ts` checks it).

### Lambda Bundling
Lambda functions are bundled at deploy time using esbuild. The `resources/lambda.ts` file:
1. Takes a source file path (TypeScript entry point from `packages/core/`)
2. Bundles with esbuild (target: `node24`, format: `esm`, external: `@aws-sdk/*`)
3. Creates a Pulumi `AssetArchive` from the bundle output
4. Deploys as a Lambda function with the appropriate IAM role

### Resource Dependency Ordering
Within a stack, create resources in dependency order:
1. IAM roles and policies (everything else depends on these)
2. Storage (DynamoDB, S3)
3. Messaging (SQS, EventBridge)
4. Compute (Lambda — needs IAM role + event source mappings)
5. Configuration (SES config sets — needs Lambda ARNs for event destinations)

Pulumi handles most ordering via output references, but explicit `dependsOn` is needed when there's no direct property reference.

## Rules

- Create new `wraps-{service}-` resources. Before importing an existing one into a stack, confirm Wraps created it: by its `wraps-` name, or by its `ManagedBy` tag where the name can't tell (the SMS phone-number lookup in `sms-stack.ts`). Never modify an AWS resource Wraps didn't create (invariant 1).
- Keep each file in `resources/` to one concern (e.g. `sqs.ts`, `eventbridge-inbound.ts`, `iam-agent-user.ts`); orchestration stays in the stack files.
- Return the created resources from each resource function so stacks can wire up dependencies.
- Bundle Lambda functions with `@aws-sdk/*` as externals; the Lambda runtime provides them.
