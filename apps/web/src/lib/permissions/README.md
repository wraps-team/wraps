# Permission System

Dynamic Access Control (DAC) for AWS account access in the Wraps dashboard.

## Overview

This module implements a permission system using better-auth's access plugin. It provides:

- **Access Levels**: READ_ONLY, FULL_ACCESS, ADMIN
- **Owner Bypass**: Organization owners have full access to all resources
- **DAC Statements**: Per-user, per-resource permissions
- **API Middleware**: Protect routes with permission checks

## Architecture

```
Organization
├── Owners (bypass all checks)
├── Admins (need explicit grants)
└── Members (need explicit grants)
    └── Per-AWS-Account Permissions
        ├── READ_ONLY: View metrics
        ├── FULL_ACCESS: View + Send emails
        └── ADMIN: View + Send + Manage
```

## Access Levels

### READ_ONLY
- View CloudWatch metrics
- View email send statistics
- View DynamoDB event data

### FULL_ACCESS
- Everything in READ_ONLY
- Send emails via SES

### ADMIN
- Everything in FULL_ACCESS
- Add/remove AWS accounts
- Configure account settings
- Manage other users' access

## Usage

### Granting Access

```typescript
import { grantAWSAccountAccess } from '@/lib/permissions';

// Grant read-only access
await grantAWSAccountAccess({
  userId: 'user-123',
  awsAccountId: 'aws-account-uuid',
  accessLevel: 'READ_ONLY'
});

// Grant temporary full access (expires in 7 days)
await grantAWSAccountAccess({
  userId: 'user-123',
  awsAccountId: 'aws-account-uuid',
  accessLevel: 'FULL_ACCESS',
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
});

// Grant default access to all org members when adding AWS account
await grantDefaultAccessToMembers({
  awsAccountId: 'aws-account-uuid',
  organizationId: 'org-uuid',
  defaultAccessLevel: 'READ_ONLY'
});
```

### Checking Access

```typescript
import { checkAWSAccountAccess, getEffectiveAccessLevel } from '@/lib/permissions';

// Check single action
const access = await checkAWSAccountAccess({
  userId: 'user-123',
  organizationId: 'org-uuid',
  awsAccountId: 'aws-account-uuid',
  action: 'aws-account:view'
});

if (!access.authorized) {
  throw new Error(access.reason);
}

// Get effective access level
const { accessLevel, actions } = await getEffectiveAccessLevel({
  userId: 'user-123',
  organizationId: 'org-uuid',
  awsAccountId: 'aws-account-uuid'
});

console.log(accessLevel); // "FULL_ACCESS"
console.log(actions); // ["aws-account:view", "aws-account:send"]
```

### Revoking Access

```typescript
import { revokeAWSAccountAccess, revokeAllOrgAWSAccess } from '@/lib/permissions';

// Revoke access to specific AWS account
await revokeAWSAccountAccess({
  userId: 'user-123',
  awsAccountId: 'aws-account-uuid'
});

// Revoke all AWS account access when removing from org
await revokeAllOrgAWSAccess({
  userId: 'user-123',
  organizationId: 'org-uuid'
});
```

### API Route Protection

```typescript
import { requireAWSAccountAccess, requireOrgRole } from '@/lib/permissions';

// Protect resource route
export async function GET(
  request: Request,
  { params }: { params: { orgId: string; accountId: string } }
) {
  // Check permission
  const permission = await requireAWSAccountAccess(request, {
    organizationId: params.orgId,
    awsAccountId: params.accountId,
    action: 'aws-account:view',
  });

  if (!permission.authorized) {
    return permission.response; // 401 or 403
  }

  // User is authorized
  const metrics = await getMetrics(params.accountId);
  return NextResponse.json({ metrics });
}

// Protect org admin route
export async function POST(
  request: Request,
  { params }: { params: { orgId: string } }
) {
  const permission = await requireOrgRole(request, params.orgId, 'admin');

  if (!permission.authorized) {
    return permission.response;
  }

  // Admin action
  await updateOrgSettings(params.orgId);
  return NextResponse.json({ success: true });
}
```

## Owner Bypass

Organization owners automatically have full access to all AWS accounts in their organization:

```typescript
// In check-access.ts
if (membership.role === 'owner') {
  return {
    authorized: true,
    reason: 'Organization owner (bypass)',
    role: 'owner',
  };
}
```

This means owners don't need explicit grants in the DAC system.

## Implementation Status

⚠️ **Note**: The grant/revoke/check functions currently use placeholder API calls to better-auth's access plugin. These need to be updated with the actual better-auth access plugin API methods once verified.

**TODO**: Verify and update the following methods:
- `auth.api.createAccessStatement()` → Check actual better-auth access API
- `auth.api.checkAccessStatement()` → Check actual better-auth access API
- `auth.api.revokeAccessStatement()` → Check actual better-auth access API

## Files

- `levels.ts` - Access level definitions
- `grant-access.ts` - Grant access helpers
- `revoke-access.ts` - Revoke access helpers
- `check-access.ts` - Check access with owner bypass
- `middleware.ts` - API route protection
- `index.ts` - Public API exports

## Database

Access control statements are stored in the `statement` table (created by better-auth access plugin):

```sql
CREATE TABLE statement (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES user(id),
  organization_id TEXT REFERENCES organization(id),
  role_id TEXT,
  effect TEXT NOT NULL, -- 'allow' | 'deny'
  action TEXT NOT NULL, -- 'aws-account:view' etc.
  resource TEXT NOT NULL, -- 'aws-account:uuid'
  condition TEXT, -- JSON string
  expires_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
);
```

## Security

1. **Owner Bypass**: Owners have full access, no DAC checks
2. **Explicit Grants**: Admins and members need explicit grants
3. **Per-Resource**: Permissions are per-AWS-account, not global
4. **Time-Bound**: Grants can have expiration dates
5. **Audit Trail**: All statements logged in database

## Testing

```typescript
// Mock permission checks
jest.mock('@/lib/permissions/check-access', () => ({
  checkAWSAccountAccess: jest.fn().mockResolvedValue({
    authorized: true,
    reason: 'Test user',
    role: 'admin'
  })
}));
```
