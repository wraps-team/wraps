# AWS Integration Utilities

Secure AWS credential management and CloudWatch integration for the Wraps dashboard.

## Overview

This module provides utilities for accessing customer AWS accounts securely using IAM role assumption with temporary credentials. **No customer AWS credentials are ever stored**.

## Architecture

```
Customer AWS Account
    └─ IAM Role (wraps-console-access-role)
        └─ Trust Policy with External ID
            ↓
        AssumeRole via STS
            ↓
Wraps Backend
    └─ Temporary Credentials (1 hour)
        └─ LRU Cache (50 min TTL)
            ↓
    CloudWatch / SES API Calls
```

## Security Features

- **External ID**: Prevents confused deputy attacks
- **Temporary credentials**: Auto-expire after 1 hour
- **Credential caching**: Reduces API calls and improves performance
- **Least privilege**: IAM policy grants only required permissions

## Usage

### 1. Customer Setup (CloudFormation)

Customers deploy the CloudFormation template to their AWS account:

```bash
# Template location
/public/cloudformation/wraps-console-access-role.yaml
```

The template creates:
- IAM Role (`wraps-console-access-role`)
- IAM Policy with CloudWatch + SES permissions
- Trust policy with External ID requirement

### 2. Assuming Roles (Backend)

```typescript
import { getOrAssumeRole } from '@/lib/aws';

// Get temporary credentials (cached automatically)
const credentials = await getOrAssumeRole({
  roleArn: 'arn:aws:iam::123456789012:role/wraps-console-access-role',
  externalId: 'unique-external-id-from-db'
});

// Credentials are valid for ~1 hour and cached for 50 minutes
```

### 3. Fetching SES Reputation

CloudWatch is read for exactly one thing: SES account-level reputation.

```typescript
import { getSESReputationMetrics } from '@/lib/aws';

const { bounceRate, complaintRate } = await getSESReputationMetrics(
  'aws-account-uuid-from-db'
);
// Decimal rates (0-1), or null when SES has not published one yet.
```

These are account-lifetime rolling rates covering the whole AWS account, so
label them as such wherever they are shown.

**Send / delivery / bounce COUNTS do not come from CloudWatch.** SES publishes
those undimensioned, meaning account-wide, including mail sent outside Wraps.
Read counts from Postgres `message_send` via `src/lib/analytics-fallback.ts`,
which scopes by `organizationId`.

## Credential Caching

Credentials are cached using an LRU cache with the following settings:

- **Max entries**: 500 (supports many concurrent users/accounts)
- **TTL**: 50 minutes (10 min buffer before 1 hour expiration)
- **Cache key**: `roleArn:externalId`
- **Refresh logic**: Auto-refresh if <5 minutes remaining

### Cache Management

```typescript
import { clearCredentialCache, invalidateCredentials } from '@/lib/aws';

// Clear all cached credentials (useful for testing)
clearCredentialCache();

// Invalidate specific account credentials (useful when revoking access)
invalidateCredentials({
  roleArn: 'arn:aws:iam::123456789012:role/wraps-console-access-role',
  externalId: 'unique-external-id'
});
```

## Environment Variables

Required in `.env.local`:

```bash
# Backend AWS credentials (for assuming customer roles)
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_BACKEND_ACCOUNT_ID=123456789012
```

## Available SES Metrics

`SES_METRICS` is down to the two account-level reputation rates. The per-send
counters (Send, Delivery, Bounce, Complaint, Reject, Open, Click,
RenderingFailure) used to live here and were removed: undimensioned `AWS/SES`
CloudWatch metrics are ACCOUNT-WIDE, so they counted mail sent outside Wraps
entirely. Volume and engagement now come from Postgres `message_send` via
`lib/analytics-fallback.ts`, which is scoped by organization.

```typescript
import { SES_METRICS } from '@/lib/aws';

SES_METRICS.REPUTATION_BOUNCE_RATE    // Reputation.BounceRate - account-lifetime rolling average
SES_METRICS.REPUTATION_COMPLAINT_RATE // Reputation.ComplaintRate - account-lifetime rolling average
```

Both are pre-computed by SES as decimal rates (0-1) and are the values the SES
console shows and enforces against. Read them with `getSESReputationMetrics()`.

## Error Handling

The utilities provide enhanced error messages:

```typescript
try {
  await assumeRole({ roleArn, externalId });
} catch (error) {
  // Common errors:
  // - "Access denied" → Check trust policy and external ID
  // - "Invalid credentials" → Check backend AWS credentials
  // - "AWS account not found" → Account not in database
}
```

## Files

- `assume-role.ts` - Core IAM role assumption logic
- `credential-cache.ts` - LRU cache for temporary credentials
- `cloudwatch.ts` - CloudWatch metrics integration
- `index.ts` - Public API exports
- `/public/cloudformation/` - Customer CloudFormation templates

## Security Considerations

1. **Never log credentials** - They contain sensitive access keys
2. **Rotate backend credentials** regularly (quarterly recommended)
3. **Monitor AssumeRole calls** - Set up CloudWatch alarms
4. **Validate external IDs** - Must be cryptographically random (UUIDs)
5. **Least privilege** - Only grant minimum required permissions

## Testing

```typescript
// Mock credential cache for tests
jest.mock('@/lib/aws/credential-cache', () => ({
  getOrAssumeRole: jest.fn().mockResolvedValue({
    accessKeyId: 'ASIA...',
    secretAccessKey: 'mock-secret',
    sessionToken: 'mock-token',
    expiration: new Date(Date.now() + 3600000)
  })
}));
```
