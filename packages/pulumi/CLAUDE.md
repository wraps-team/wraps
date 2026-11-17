# Wraps Pulumi (packages/pulumi)

Pulumi component for deploying Wraps email infrastructure to AWS. Composition over presets — users enable only the features they need.

## No In-Repo Deploy Path — CI Does Not Exercise This Against the CLI

Published as `@wraps.dev/pulumi` for customers who write their own Pulumi
programs (documented at `/docs/pulumi-reference`). **No deploy path in this
monorepo uses it**: its only in-repo dependent is `packages/cli`, as a
devDependency for the parity test below. `packages/cli/src/infrastructure/` is a
second, independent implementation of the same email stack — the one
`email init` actually deploys — and the two are not the same code. They have
already diverged silently once (the CLI hardcoded `matchingEventTypes` while
this package honored a caller-supplied list) and before that, in the opposite
direction, for Mail Manager archiving.

Since no app or deploy path consumes this package, a change here that breaks the
CLI's equivalent behavior (or vice versa) is caught by neither `pnpm build`
nor any app's test suite — only by the guards in
`packages/core/src/constants.ts` (shared resource-name and event-type
literals both packages import) and
`packages/cli/src/infrastructure/resources/__tests__/cli-pulumi-parity.test.ts`
(the one behavior comparison that can't be expressed as a shared constant:
the default-event-type-set derivation). Those guards only cover what they
were written to cover. Known divergences they don't catch: the IAM policy
statement shape differs between the two `wraps-email-role` policies, and the
CLI's 30-day EventBridge replay archive and delivery-failure alarm have no
equivalent here. Before changing resource
names, defaults, or the IAM policy shape in this package, check whether
`packages/cli/src/infrastructure/resources/` needs the same change, and vice
versa — nothing else will tell you.

## Critical Rules

### 1. Composition, Not Presets

No "starter vs production" tiers. Users compose features by providing config:

```typescript
// Minimal — just OIDC + domain
new WrapsEmail("email", {
  vercel: { projectId: "prj_xxx" },
  domain: "example.com",
});

// Full — enable events, tracking, SMTP
new WrapsEmail("email", {
  vercel: { projectId: "prj_xxx" },
  domain: "example.com",
  events: { storeHistory: true, retention: "90days" },
  tracking: { httpsEnabled: true },
  smtp: { enabled: true },
});
```

### 2. Config Flows Through applyDefaults()

All user input is normalized via `applyDefaults()` before use. Never read raw args directly in resource functions — always use `ResolvedConfig`.

```typescript
// In email.ts constructor
const config = applyDefaults(args);  // WrapsEmailArgs → ResolvedConfig
createIAMRole(name, config, tags);   // Pass resolved config
```

### 3. Transform Functions Are the Escape Hatch

Users customize resources via `transform` without forking:

```typescript
new WrapsEmail("email", {
  // ...
  transform: {
    role: (args) => ({ ...args, maxSessionDuration: 7200 }),
    table: (args) => ({ ...args, billingMode: "PROVISIONED" }),
  },
});
```

Every `create*` function accepts an optional transform. Apply it before creating the resource.

### 4. Resources Exposed via .nodes

All underlying Pulumi resources are accessible via `construct.nodes`:

```typescript
type WrapsEmailNodes = {
  role: aws.iam.Role;
  configSet: aws.ses.ConfigurationSet;
  table?: aws.dynamodb.Table;
  queue?: aws.sqs.Queue;
  // ... all optional resources
};
```

### 5. Tags Must Include ManagedBy

Every resource gets `ManagedBy: "wraps-pulumi"` merged with user tags and `DEFAULT_TAGS` from `@wraps/core`.

## Architecture

### Resource Creation Order

1. OIDC provider (Vercel or custom)
2. IAM role (permissions based on enabled features)
3. SES config set + domain identity + DKIM
4. DNS records (if provider configured)
5. Event pipeline (DynamoDB + SQS + EventBridge)
6. Event processor Lambda (if `storeHistory`)
7. HTTPS tracking (ACM in us-east-1 + CloudFront)
8. SMTP credentials (if enabled)

### Key Files

```
src/
├── index.ts           # Exports (WrapsEmail + resource functions)
├── types.ts           # WrapsEmailArgs, ResolvedConfig, Nodes, Outputs
├── defaults.ts        # applyDefaults() — config normalization
├── email.ts           # Main WrapsEmail ComponentResource
└── resources/
    ├── iam.ts         # IAM role + dynamic policy statements
    ├── ses.ts         # SES config set (v2), domain, DKIM
    ├── events.ts      # DynamoDB + SQS + DLQ + EventBridge
    ├── lambda.ts      # Event processor (Node.js 24, 512MB, 300s)
    ├── cloudfront.ts  # CloudFront + WAF for HTTPS tracking
    ├── acm.ts         # ACM cert (must be us-east-1 for CloudFront)
    ├── dns.ts         # Route53 / Cloudflare / Vercel DNS
    ├── oidc.ts        # Vercel + custom OIDC providers
    └── smtp.ts        # IAM user + access key → SMTP creds
```

### Resource Function Signature

Every resource module follows this pattern:

```typescript
function create*(
  name: string,
  config: ResolvedConfig,
  tags: Record<string, string>,
  transform?: TransformFunctions[key],
  opts?: pulumi.ComponentResourceOptions
): ResultType
```

**Exception — dynamic-provider resources** (e.g. `resources/mail-manager.ts`):
these legitimately diverge from the signature above. They take additional
runtime `pulumi.Input`/`Output` parameters that are NOT on `ResolvedConfig`
(e.g. `configSetName` from a created SES config set, the resolved AWS `region`)
and omit `transform?` (dynamic resources don't accept the same transform args).
Don't "normalize" them back to the standard shape. Also: the provider's
`create`/`delete`/`diff`/`update` methods MUST `await import("@aws-sdk/*")`
inside each method body — module-scope SDK imports break Pulumi closure
serialization.

## Default Values

| Setting | Default |
|---------|---------|
| `mailFromSubdomain` | `"mail"` |
| `tracking.enabled` | `true` |
| `tracking.opens` / `clicks` | `true` |
| `tracking.httpsEnabled` | `false` |
| `suppressionList.enabled` | `true` |
| `suppressionList.reasons` | `["BOUNCE", "COMPLAINT"]` |
| `events.retention` | `"90days"` (if events configured) |
| `reputationMetrics` | `true` |
| `tlsRequired` | `false` |
| `dedicatedIp` | `false` |

## Gotchas

- **ACM certs for CloudFront must be us-east-1** — handled transparently with a separate provider
- **SES uses mixed API versions** — `sesv2` for config set, `ses` (v1) for domain identity + DKIM
- **Lambda code path** — looks for `.bundled` marker in `dist/lambda/event-processor/`; throws if not found (run `build:lambda` first)
- **Mail Manager** — implemented as a dynamic provider (`src/resources/mail-manager.ts`); `@pulumi/aws` has no Mail Manager resources (upstream Terraform issue open since 2024-08), so the provider wraps the `@aws-sdk/client-mailmanager` calls directly. `delete()` is deliberately non-destructive — the native Cloud Control resource in `@pulumi/aws-native` marks an archive `PENDING_DELETION` for permanent deletion in 30 days, which violates the non-destructive principle.
- **DNS providers** — Cloudflare uses native Pulumi provider, Vercel uses `@pulumi/command` with curl

## Commands

```bash
pnpm --filter @wraps.dev/pulumi build       # Build + bundle Lambda
pnpm --filter @wraps.dev/pulumi test        # Run tests
pnpm --filter @wraps.dev/pulumi dev         # Watch mode
```
