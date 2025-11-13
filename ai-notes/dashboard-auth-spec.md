# BYO Hosted Dashboard: Complete Implementation Spec

**Version**: 3.0 (Clean Implementation)  
**Last Updated**: November 12, 2025  
**Status**: Ready for implementation - no legacy code, building from scratch

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Tech Stack](#tech-stack)
3. [Database Schema](#database-schema)
4. [better-auth Setup](#better-auth-setup)
5. [Permission System (DAC)](#permission-system-dac)
6. [AWS Credential Management](#aws-credential-management)
7. [API Routes](#api-routes)
8. [Frontend Components](#frontend-components)
9. [Implementation Steps](#implementation-steps)
10. [Testing Checklist](#testing-checklist)

---

## Architecture Overview

### Core Concepts

```
User
  └─ Member of Organizations (role: owner/admin/member)
      └─ Organizations own AWS Accounts
          └─ Per-account permissions via better-auth DAC
```

### Key Principles

1. **Organizations own resources**: AWS accounts belong to organizations, not individual users
2. **Owners bypass restrictions**: Organization owners have full access to all org resources
3. **Per-account permissions**: Admins and members need explicit grants for each AWS account
4. **IAM role assumption**: Never store AWS credentials - use temporary credentials via AssumeRole
5. **better-auth DAC**: Use built-in Dynamic Access Control instead of custom RBAC

### Permission Flow

```
API Request
    ↓
1. Authenticate user (better-auth session)
    ↓
2. Check org membership
    ↓
3. If owner → Grant full access (bypass DAC)
    ↓
4. If admin/member → Check DAC statement
    ↓
5. If authorized → Assume IAM role → Get temp AWS credentials
    ↓
6. Call AWS API (CloudWatch, SES, etc.)
```

---

## Tech Stack

```yaml
Backend:
  - Next.js 14 (App Router)
  - TypeScript
  - Vercel (hosting)

Database:
  - PostgreSQL (Neon or Supabase)
  - Drizzle ORM

Auth:
  - better-auth with plugins:
    - organization (multi-tenancy)
    - access (Dynamic Access Control)

AWS:
  - AWS SDK v3
  - STS (AssumeRole)
  - CloudWatch (metrics)
  - SES (email service)
  - DynamoDB (email events)

Frontend:
  - React
  - TanStack Query (data fetching)
  - Tailwind CSS

Additional:
  - Stripe (billing)
  - Zod (validation)
```

---

## Database Schema

### better-auth Tables (Auto-Generated)

These tables are created automatically by better-auth:

```typescript
// Created by better-auth core
user {
  id: uuid
  name: string
  email: string
  emailVerified: boolean
  image?: string
  createdAt: timestamp
  updatedAt: timestamp
}

session {
  id: uuid
  userId: uuid
  token: string
  expiresAt: timestamp
  ipAddress?: string
  userAgent?: string
}

// Created by organization plugin
organization {
  id: uuid
  name: string
  slug: string
  logo?: string
  createdAt: timestamp
  updatedAt: timestamp
}

organization_member {
  id: uuid
  organizationId: uuid
  userId: uuid
  role: string  // 'owner' | 'admin' | 'member'
  createdAt: timestamp
}

// Created by access (DAC) plugin
statement {
  id: uuid
  userId?: uuid
  organizationId?: uuid
  roleId?: uuid
  effect: string  // 'allow' | 'deny'
  action: string
  resource: string
  condition?: json
  expiresAt?: timestamp
  createdAt: timestamp
  updatedAt: timestamp
}
```

### Custom Tables (You Define)

```typescript
// lib/db/schema.ts
import { pgTable, uuid, varchar, timestamp, boolean, integer, json, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// Organization billing/plan info
export const organizationExtensions = pgTable("organization_extension", {
  organizationId: uuid("organization_id")
    .references(() => organizations.id, { onDelete: "cascade" })
    .primaryKey(),
  
  // Subscription
  plan: varchar("plan", { length: 50 }).default("free").notNull(),
  stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
  stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }),
  
  // Usage tracking
  awsAccountCount: integer("aws_account_count").default(0).notNull(),
  memberCount: integer("member_count").default(1).notNull(),
  
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// AWS Account Connections
export const awsAccounts = pgTable(
  "aws_account",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),

    name: varchar("name", { length: 255 }).notNull(),
    accountId: varchar("account_id", { length: 20 }).notNull(),
    region: varchar("region", { length: 50 }).notNull(),

    // IAM Role for access (AssumeRole)
    roleArn: varchar("role_arn", { length: 255 }).notNull(),
    externalId: varchar("external_id", { length: 36 }).notNull().unique(),

    // Verification
    isVerified: boolean("is_verified").default(false).notNull(),
    lastVerifiedAt: timestamp("last_verified_at"),

    // Audit
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    orgIdx: index("aws_account_org_idx").on(table.organizationId),
    externalIdIdx: index("aws_account_external_id_idx").on(table.externalId),
  })
);

// AWS Account Permissions (custom permission system)
export const awsAccountPermissions = pgTable(
  "aws_account_permission",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),

    awsAccountId: uuid("aws_account_id")
      .references(() => awsAccounts.id, { onDelete: "cascade" })
      .notNull(),

    // Array of permissions: ["view", "send", "manage"]
    permissions: json("permissions").$type<string[]>().notNull(),

    // Audit
    grantedBy: uuid("granted_by").references(() => users.id).notNull(),
    expiresAt: timestamp("expires_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index("aws_account_permission_user_idx").on(table.userId),
    accountIdx: index("aws_account_permission_account_idx").on(table.awsAccountId),
    uniqueUserAccount: index("aws_account_permission_unique_idx").on(table.userId, table.awsAccountId),
  })
);

// Email Templates
export const emailTemplates = pgTable(
  "email_template",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    subject: varchar("subject", { length: 255 }),
    html: text("html"),
    variables: json("variables").default([]),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    orgIdx: index("email_template_org_idx").on(table.organizationId),
  })
);

// API Keys
export const apiKeys = pgTable(
  "api_key",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    keyHash: varchar("key_hash", { length: 255 }).notNull(),
    prefix: varchar("prefix", { length: 10 }).notNull(),
    permissions: json("permissions").default([]),
    lastUsedAt: timestamp("last_used_at"),
    expiresAt: timestamp("expires_at"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    orgIdx: index("api_key_org_idx").on(table.organizationId),
    prefixIdx: index("api_key_prefix_idx").on(table.prefix),
  })
);

// Audit Logs (Enterprise)
export const auditLogs = pgTable(
  "audit_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id").references(() => users.id),
    action: varchar("action", { length: 255 }).notNull(),
    resource: varchar("resource", { length: 255 }).notNull(),
    resourceId: varchar("resource_id", { length: 255 }),
    metadata: json("metadata"),
    ipAddress: varchar("ip_address", { length: 255 }),
    userAgent: varchar("user_agent", { length: 255 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    orgIdx: index("audit_log_org_idx").on(table.organizationId),
    timestampIdx: index("audit_log_timestamp_idx").on(table.createdAt),
  })
);

// Drizzle Relations
export const organizationsRelations = relations(organizations, ({ one, many }) => ({
  extension: one(organizationExtensions),
  members: many(organizationMembers),
  awsAccounts: many(awsAccounts),
  templates: many(emailTemplates),
  apiKeys: many(apiKeys),
  auditLogs: many(auditLogs),
}));

export const awsAccountsRelations = relations(awsAccounts, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [awsAccounts.organizationId],
    references: [organizations.id],
  }),
  createdByUser: one(users, {
    fields: [awsAccounts.createdBy],
    references: [users.id],
  }),
  permissions: many(awsAccountPermissions),
}));

export const awsAccountPermissionsRelations = relations(awsAccountPermissions, ({ one }) => ({
  user: one(users, {
    fields: [awsAccountPermissions.userId],
    references: [users.id],
  }),
  awsAccount: one(awsAccounts, {
    fields: [awsAccountPermissions.awsAccountId],
    references: [awsAccounts.id],
  }),
  grantedByUser: one(users, {
    fields: [awsAccountPermissions.grantedBy],
    references: [users.id],
  }),
}));
```

---

## better-auth Setup

### Installation

```bash
npm install better-auth @better-auth/react drizzle-orm postgres
```

### Configuration

```typescript
// lib/auth.ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { db } from "./db/client";

export const auth = betterAuth({
  // Database
  database: drizzleAdapter(db, {
    provider: "pg",
  }),

  // Email/password + OAuth
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
  },

  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },

  // Plugins
  plugins: [
    // Organization plugin - multi-tenancy
    organization({
      // Auto-create personal org on signup
      async creator(user) {
        return {
          name: `${user.name}'s Organization`,
          slug: `${user.email.split('@')[0]}-${Date.now()}`,
        };
      },

      // Available roles
      roles: ["owner", "admin", "member"],

      // Default role for invited members
      defaultRole: "member",
    }),
  ],

  // Session config
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24,     // Update every 24 hours
  },
});
```

### API Routes

```typescript
// app/api/auth/[...all]/route.ts
import { auth } from "@/lib/auth";

export const { GET, POST } = auth.handler;
```

### Client Setup

```typescript
// lib/auth-client.ts
import { createAuthClient } from "@better-auth/react";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL,
});

export const {
  useSession,
  signIn,
  signOut,
  signUp,
  useOrganization,
} = authClient;
```

### Environment Variables

```bash
# .env.local

# Database
DATABASE_URL=postgresql://user:password@host:5432/database

# better-auth
BETTER_AUTH_SECRET=your-random-secret-key-here

# OAuth (optional)
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# AWS Backend Credentials
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_BACKEND_ACCOUNT_ID=123456789012

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
```

---

## Permission System (Custom)

### Overview

We use a simple custom permission system with a dedicated table for AWS account permissions. This is cleaner and more testable than trying to use Better-Auth's DAC plugin for resource-level permissions.

**Key Design:**
- Organization owners have full access to all org AWS accounts (no explicit grant needed)
- Non-owners (admins/members) need explicit permission grants for each AWS account
- Permissions are stored as arrays: `["view", "send", "manage"]`
- Simple to query, audit, and test

### Permission Levels

```typescript
// lib/permissions/types.ts

export const PERMISSION_LEVELS = {
  READ_ONLY: ["view"],
  FULL_ACCESS: ["view", "send"],
  ADMIN: ["view", "send", "manage"],
} as const;

export type PermissionLevel = keyof typeof PERMISSION_LEVELS;
export type Permission = "view" | "send" | "manage";
```

### Grant Access

```typescript
// lib/permissions/grant-access.ts
import { db } from "@/lib/db/client";
import { awsAccountPermissions } from "@/lib/db/schema";
import { PERMISSION_LEVELS, type PermissionLevel } from "./types";
import { eq, and } from "drizzle-orm";

export async function grantAWSAccountAccess(params: {
  userId: string;
  awsAccountId: string;
  permissions: PermissionLevel;
  grantedBy: string;
  expiresAt?: Date;
}) {
  const permissionList = PERMISSION_LEVELS[params.permissions];

  // Check if permission already exists
  const existing = await db.query.awsAccountPermissions.findFirst({
    where: (p, { and, eq }) =>
      and(
        eq(p.userId, params.userId),
        eq(p.awsAccountId, params.awsAccountId)
      ),
  });

  if (existing) {
    // Update existing permission
    await db
      .update(awsAccountPermissions)
      .set({
        permissions: permissionList,
        expiresAt: params.expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(awsAccountPermissions.id, existing.id));
  } else {
    // Create new permission
    await db.insert(awsAccountPermissions).values({
      userId: params.userId,
      awsAccountId: params.awsAccountId,
      permissions: permissionList,
      grantedBy: params.grantedBy,
      expiresAt: params.expiresAt,
    });
  }
}
```

### Revoke Access

```typescript
// lib/permissions/revoke-access.ts
import { db } from "@/lib/db/client";
import { awsAccountPermissions } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function revokeAWSAccountAccess(params: {
  userId: string;
  awsAccountId: string;
}) {
  await db
    .delete(awsAccountPermissions)
    .where(
      and(
        eq(awsAccountPermissions.userId, params.userId),
        eq(awsAccountPermissions.awsAccountId, params.awsAccountId)
      )
    );
}
```

### Check Access (with Owner Bypass)

```typescript
// lib/permissions/check-access.ts
import { db } from "@/lib/db/client";
import { type Permission } from "./types";

export async function checkAWSAccountAccess(params: {
  userId: string;
  organizationId: string;
  awsAccountId: string;
  permission: Permission; // "view" | "send" | "manage"
}): Promise<{ authorized: boolean; reason: string }> {

  // 1. Verify user is org member
  const membership = await db.query.organizationMembers.findFirst({
    where: (m, { and, eq }) =>
      and(
        eq(m.userId, params.userId),
        eq(m.organizationId, params.organizationId)
      ),
  });

  if (!membership) {
    return { authorized: false, reason: "Not a member of this organization" };
  }

  // 2. Owners bypass all resource-level permissions
  if (membership.role === "owner") {
    return { authorized: true, reason: "Organization owner" };
  }

  // 3. For non-owners, check explicit permission
  const grant = await db.query.awsAccountPermissions.findFirst({
    where: (p, { and, eq }) =>
      and(
        eq(p.userId, params.userId),
        eq(p.awsAccountId, params.awsAccountId)
      ),
  });

  if (!grant) {
    return { authorized: false, reason: "No permission grant" };
  }

  // Check if permission is expired
  if (grant.expiresAt && grant.expiresAt < new Date()) {
    return { authorized: false, reason: "Permission expired" };
  }

  // Check if user has the required permission
  const hasPermission = grant.permissions.includes(params.permission);

  return {
    authorized: hasPermission,
    reason: hasPermission ? "Explicit grant" : "Insufficient permissions",
  };
}
```

### List User Permissions

```typescript
// lib/permissions/list-permissions.ts
import { db } from "@/lib/db/client";

export async function listUserAWSAccountPermissions(params: {
  userId: string;
  organizationId: string;
}) {
  // Get all AWS accounts in the org
  const awsAccounts = await db.query.awsAccounts.findMany({
    where: (a, { eq }) => eq(a.organizationId, params.organizationId),
  });

  // Get user's org membership
  const membership = await db.query.organizationMembers.findFirst({
    where: (m, { and, eq }) =>
      and(
        eq(m.userId, params.userId),
        eq(m.organizationId, params.organizationId)
      ),
  });

  // If owner, return all accounts with full permissions
  if (membership?.role === "owner") {
    return awsAccounts.map((account) => ({
      awsAccountId: account.id,
      awsAccountName: account.name,
      permissions: ["view", "send", "manage"],
      reason: "owner",
      expiresAt: null,
    }));
  }

  // Get explicit grants for non-owners
  const grants = await db.query.awsAccountPermissions.findMany({
    where: (p, { eq }) => eq(p.userId, params.userId),
  });

  // Map grants to accounts
  return awsAccounts
    .map((account) => {
      const grant = grants.find((g) => g.awsAccountId === account.id);
      if (!grant) return null;

      // Filter out expired grants
      if (grant.expiresAt && grant.expiresAt < new Date()) return null;

      return {
        awsAccountId: account.id,
        awsAccountName: account.name,
        permissions: grant.permissions,
        reason: "explicit",
        expiresAt: grant.expiresAt,
      };
    })
    .filter(Boolean);
}
```

### Middleware for API Routes

```typescript
// lib/permissions/middleware.ts
import { auth } from "@/lib/auth";
import { checkAWSAccountAccess } from "./check-access";
import { type Permission } from "./types";
import { NextResponse } from "next/server";

export async function requireAWSAccountAccess(
  request: Request,
  params: {
    organizationId: string;
    awsAccountId: string;
    permission: Permission;
  }
) {
  // Get session
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
    return {
      authorized: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  // Check access
  const access = await checkAWSAccountAccess({
    userId: session.user.id,
    organizationId: params.organizationId,
    awsAccountId: params.awsAccountId,
    permission: params.permission,
  });

  if (!access.authorized) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: "Access denied", reason: access.reason },
        { status: 403 }
      ),
    };
  }

  return {
    authorized: true,
    userId: session.user.id,
  };
}
```

---

## AWS Credential Management

### IAM Role Assumption

```typescript
// lib/aws/assume-role.ts
import { STSClient, AssumeRoleCommand } from "@aws-sdk/client-sts";

interface AssumeRoleParams {
  roleArn: string;
  externalId: string;
  sessionName?: string;
}

export async function assumeRole(params: AssumeRoleParams) {
  const { roleArn, externalId, sessionName = "byo-console-session" } = params;

  const sts = new STSClient({
    region: "us-east-1",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });

  const command = new AssumeRoleCommand({
    RoleArn: roleArn,
    RoleSessionName: sessionName,
    ExternalId: externalId,
    DurationSeconds: 3600, // 1 hour
  });

  const response = await sts.send(command);

  if (!response.Credentials) {
    throw new Error("Failed to assume role: No credentials returned");
  }

  return {
    accessKeyId: response.Credentials.AccessKeyId!,
    secretAccessKey: response.Credentials.SecretAccessKey!,
    sessionToken: response.Credentials.SessionToken!,
    expiration: response.Credentials.Expiration!,
  };
}
```

### Credential Caching

```typescript
// lib/aws/credential-cache.ts
import { LRUCache } from "lru-cache";
import { assumeRole } from "./assume-role";

interface CachedCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiration: Date;
}

const credentialCache = new LRUCache<string, CachedCredentials>({
  max: 500,
  ttl: 50 * 60 * 1000, // 50 minutes (10 min buffer before 1hr expiry)
  updateAgeOnGet: false,
});

export async function getOrAssumeRole(params: {
  roleArn: string;
  externalId: string;
}): Promise<CachedCredentials> {
  const cacheKey = `${params.roleArn}:${params.externalId}`;

  // Check cache
  const cached = credentialCache.get(cacheKey);
  if (cached) {
    const expiresIn = cached.expiration.getTime() - Date.now();
    if (expiresIn > 5 * 60 * 1000) {
      // Still valid (>5 min left)
      return cached;
    }
  }

  // Cache miss or expired - assume role
  const credentials = await assumeRole(params);

  const cachedCreds: CachedCredentials = {
    ...credentials,
    expiration: credentials.expiration,
  };

  credentialCache.set(cacheKey, cachedCreds);
  return cachedCreds;
}
```

### CloudWatch Integration

```typescript
// lib/aws/cloudwatch.ts
import { CloudWatchClient, GetMetricDataCommand } from "@aws-sdk/client-cloudwatch";
import { getOrAssumeRole } from "./credential-cache";
import { db } from "@/lib/db/client";

export async function getCloudWatchMetrics(params: {
  awsAccountId: string;
  metric: string;
  period: number;
  startTime: Date;
  endTime: Date;
}) {
  // Get AWS account details
  const account = await db.query.awsAccounts.findFirst({
    where: (a, { eq }) => eq(a.id, params.awsAccountId),
  });

  if (!account) {
    throw new Error("AWS account not found");
  }

  // Get temporary credentials
  const credentials = await getOrAssumeRole({
    roleArn: account.roleArn,
    externalId: account.externalId,
  });

  // Create CloudWatch client with temporary credentials
  const cloudwatch = new CloudWatchClient({
    region: account.region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });

  // Fetch metrics
  const command = new GetMetricDataCommand({
    MetricDataQueries: [
      {
        Id: "m1",
        MetricStat: {
          Metric: {
            Namespace: "AWS/SES",
            MetricName: params.metric,
          },
          Period: params.period,
          Stat: "Sum",
        },
      },
    ],
    StartTime: params.startTime,
    EndTime: params.endTime,
  });

  const response = await cloudwatch.send(command);
  return response.MetricDataResults;
}
```

### CloudFormation Template

```yaml
# cloudformation/byo-console-access-role.yaml
AWSTemplateFormatVersion: '2010-09-09'
Description: 'BYO Console Access Role'

Parameters:
  ExternalId:
    Type: String
    Description: 'External ID for secure role assumption'
  
  BYOBackendAccountId:
    Type: String
    Description: 'AWS Account ID of BYO hosted backend'
    Default: '123456789012'

Resources:
  BYOConsoleAccessRole:
    Type: 'AWS::IAM::Role'
    Properties:
      RoleName: 'byo-console-access-role'
      AssumeRolePolicyDocument:
        Version: '2012-10-17'
        Statement:
          - Effect: Allow
            Principal:
              AWS: !Sub 'arn:aws:iam::${BYOBackendAccountId}:root'
            Action: 'sts:AssumeRole'
            Condition:
              StringEquals:
                'sts:ExternalId': !Ref ExternalId
      ManagedPolicyArns:
        - !Ref BYOConsoleAccessPolicy

  BYOConsoleAccessPolicy:
    Type: 'AWS::IAM::ManagedPolicy'
    Properties:
      PolicyDocument:
        Version: '2012-10-17'
        Statement:
          - Sid: 'CloudWatchMetricsReadOnly'
            Effect: Allow
            Action:
              - 'cloudwatch:GetMetricData'
              - 'cloudwatch:GetMetricStatistics'
              - 'cloudwatch:ListMetrics'
            Resource: '*'
          
          - Sid: 'SESReadAndSend'
            Effect: Allow
            Action:
              - 'ses:GetSendQuota'
              - 'ses:GetSendStatistics'
              - 'ses:GetAccount'
              - 'ses:ListIdentities'
              - 'ses:SendEmail'
              - 'ses:SendRawEmail'
            Resource: '*'
          
          - Sid: 'DynamoDBReadEmailEvents'
            Effect: Allow
            Action:
              - 'dynamodb:Query'
              - 'dynamodb:Scan'
              - 'dynamodb:GetItem'
            Resource:
              - !Sub 'arn:aws:dynamodb:*:${AWS::AccountId}:table/byo-email-events'

Outputs:
  RoleArn:
    Value: !GetAtt BYOConsoleAccessRole.Arn
  ExternalId:
    Value: !Ref ExternalId
```

---

## API Routes

### Connect AWS Account

```typescript
// app/api/organizations/[orgId]/aws-accounts/route.ts
import { auth, ac } from "@/lib/auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { awsAccounts } from "@/lib/db/schema";
import { assumeRole } from "@/lib/aws/assume-role";
import { grantAWSAccountAccess } from "@/lib/permissions/grant-access";
import { randomUUID } from "crypto";

const connectSchema = z.object({
  name: z.string().min(1).max(255),
  accountId: z.string().regex(/^\d{12}$/),
  region: z.string(),
  roleArn: z.string().startsWith("arn:aws:iam::"),
});

export async function POST(
  request: Request,
  { params }: { params: { orgId: string } }
) {
  try {
    // 1. Authenticate
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Check org membership and role
    const membership = await db.query.organizationMembers.findFirst({
      where: (m, { and, eq }) =>
        and(
          eq(m.userId, session.user.id),
          eq(m.organizationId, params.orgId)
        ),
    });

    if (!membership) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }

    // Only owners and admins can add AWS accounts
    if (!["owner", "admin"].includes(membership.role)) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      );
    }

    // 3. Parse request
    const body = await request.json();
    const data = connectSchema.parse(body);

    // 4. Generate external ID
    const externalId = randomUUID();

    // 5. Test connection
    try {
      await assumeRole({
        roleArn: data.roleArn,
        externalId: externalId,
      });
    } catch (error) {
      return NextResponse.json(
        {
          error: "Unable to assume role",
          details: error.message,
        },
        { status: 400 }
      );
    }

    // 6. Save to database
    const [account] = await db
      .insert(awsAccounts)
      .values({
        organizationId: params.orgId,
        name: data.name,
        accountId: data.accountId,
        region: data.region,
        roleArn: data.roleArn,
        externalId: externalId,
        isVerified: true,
        lastVerifiedAt: new Date(),
        createdBy: session.user.id,
      })
      .returning();

    // 7. Grant default access to all org members
    const allMembers = await db.query.organizationMembers.findMany({
      where: (m, { eq }) => eq(m.organizationId, params.orgId),
    });

    for (const member of allMembers) {
      // Skip owners (they have access by default)
      if (member.role === "owner") continue;

      // Admins get full access, members get read-only
      const permissions = member.role === "admin" ? "FULL_ACCESS" : "READ_ONLY";

      await grantAWSAccountAccess({
        userId: member.userId,
        awsAccountId: account.id,
        permissions: permissions,
        grantedBy: session.user.id,
      });
    }

    return NextResponse.json({
      success: true,
      account: {
        id: account.id,
        name: account.name,
        region: account.region,
      },
    });
  } catch (error) {
    console.error("Error connecting AWS account:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
```

### Get Metrics

```typescript
// app/api/organizations/[orgId]/aws-accounts/[accountId]/metrics/route.ts
import { requireAWSAccountAccess } from "@/lib/permissions/middleware";
import { getCloudWatchMetrics } from "@/lib/aws/cloudwatch";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: { orgId: string; accountId: string } }
) {
  // Check permission
  const permission = await requireAWSAccountAccess(request, {
    organizationId: params.orgId,
    awsAccountId: params.accountId,
    permission: "view",
  });

  if (!permission.authorized) {
    return permission.response;
  }

  // Parse query params
  const { searchParams } = new URL(request.url);
  const metric = searchParams.get("metric") || "Send";
  const period = parseInt(searchParams.get("period") || "3600");
  const startTime = new Date(
    searchParams.get("startTime") || Date.now() - 24 * 60 * 60 * 1000
  );
  const endTime = new Date(searchParams.get("endTime") || Date.now());

  // Fetch metrics
  const metrics = await getCloudWatchMetrics({
    awsAccountId: params.accountId,
    metric,
    period,
    startTime,
    endTime,
  });

  return NextResponse.json({ metrics });
}
```

### Grant Access

```typescript
// app/api/organizations/[orgId]/aws-accounts/[accountId]/access/route.ts
import { auth } from "@/lib/auth";
import { checkAWSAccountAccess } from "@/lib/permissions/check-access";
import { grantAWSAccountAccess } from "@/lib/permissions/grant-access";
import { NextResponse } from "next/server";
import { z } from "zod";

const grantSchema = z.object({
  userId: z.string().uuid(),
  permissions: z.enum(["READ_ONLY", "FULL_ACCESS", "ADMIN"]),
  expiresAt: z.string().datetime().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: { orgId: string; accountId: string } }
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check if user can manage this account
  const access = await checkAWSAccountAccess({
    userId: session.user.id,
    organizationId: params.orgId,
    awsAccountId: params.accountId,
    permission: "manage",
  });

  if (!access.authorized) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  // Parse request
  const body = await request.json();
  const data = grantSchema.parse(body);

  // Grant access
  await grantAWSAccountAccess({
    userId: data.userId,
    awsAccountId: params.accountId,
    permissions: data.permissions,
    grantedBy: session.user.id,
    expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
  });

  return NextResponse.json({ success: true });
}
```

---

## Frontend Components

### Organization Switcher

```typescript
// components/org-switcher.tsx
"use client";

import { useOrganization } from "@/lib/auth-client";

export function OrgSwitcher() {
  const { organizations, activeOrganization, setActiveOrganization } = useOrganization();

  return (
    <select
      value={activeOrganization?.id}
      onChange={(e) => {
        const org = organizations.find((o) => o.id === e.target.value);
        if (org) setActiveOrganization(org);
      }}
      className="px-4 py-2 border rounded-lg"
    >
      {organizations.map((org) => (
        <option key={org.id} value={org.id}>
          {org.name}
        </option>
      ))}
    </select>
  );
}
```

### AWS Account List

```typescript
// components/aws-account-list.tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { useOrganization } from "@/lib/auth-client";

export function AWSAccountList() {
  const { activeOrganization } = useOrganization();

  const { data: accounts, isLoading } = useQuery({
    queryKey: ["aws-accounts", activeOrganization?.id],
    queryFn: async () => {
      const res = await fetch(
        `/api/organizations/${activeOrganization.id}/aws-accounts`
      );
      return res.json();
    },
    enabled: !!activeOrganization,
  });

  if (isLoading) return <div>Loading...</div>;

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">AWS Accounts</h2>
      
      {accounts?.accounts.map((account) => (
        <div key={account.id} className="border p-4 rounded-lg">
          <h3 className="font-semibold">{account.name}</h3>
          <p className="text-sm text-gray-600">
            {account.accountId} • {account.region}
          </p>
          
          <div className="mt-2 flex gap-2">
            {account.permissions.canView && (
              <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                View
              </span>
            )}
            {account.permissions.canSend && (
              <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                Send
              </span>
            )}
            {account.permissions.canManage && (
              <span className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded">
                Manage
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
```

### Connect AWS Account Form

```typescript
// components/connect-aws-account-form.tsx
"use client";

import { useState } from "react";
import { useOrganization } from "@/lib/auth-client";

export function ConnectAWSAccountForm() {
  const { activeOrganization } = useOrganization();
  const [externalId] = useState(() => crypto.randomUUID());
  const [formData, setFormData] = useState({
    name: "",
    accountId: "",
    region: "us-east-1",
    roleArn: "",
  });
  const [isConnecting, setIsConnecting] = useState(false);

  const cloudFormationUrl = `https://console.aws.amazon.com/cloudformation/home#/stacks/create/review?stackName=byo-console-access&templateURL=https://s3.amazonaws.com/byo-assets/cloudformation/access-role.yaml&param_ExternalId=${externalId}`;

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsConnecting(true);

    try {
      const res = await fetch(
        `/api/organizations/${activeOrganization.id}/aws-accounts`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        }
      );

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error);
      }

      // Success - redirect to dashboard
      window.location.href = "/dashboard";
    } catch (error) {
      alert(error.message);
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* Step 1: Deploy CloudFormation */}
      <div className="border p-6 rounded-lg">
        <h3 className="text-lg font-semibold mb-4">
          Step 1: Deploy IAM Role
        </h3>
        
        <div className="bg-gray-50 p-4 rounded mb-4">
          <p className="text-sm mb-2">Your External ID:</p>
          <code className="block bg-white p-2 rounded border text-sm">
            {externalId}
          </code>
        </div>

        <a
          href={cloudFormationUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700"
        >
          Deploy to AWS →
        </a>
      </div>

      {/* Step 2: Enter details */}
      <form onSubmit={handleConnect} className="border p-6 rounded-lg space-y-4">
        <h3 className="text-lg font-semibold mb-4">
          Step 2: Connect Account
        </h3>

        <div>
          <label className="block text-sm font-medium mb-2">
            Account Name
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Production"
            className="w-full px-4 py-2 border rounded-lg"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            AWS Account ID
          </label>
          <input
            type="text"
            value={formData.accountId}
            onChange={(e) => setFormData({ ...formData, accountId: e.target.value })}
            placeholder="123456789012"
            className="w-full px-4 py-2 border rounded-lg"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Region</label>
          <select
            value={formData.region}
            onChange={(e) => setFormData({ ...formData, region: e.target.value })}
            className="w-full px-4 py-2 border rounded-lg"
          >
            <option value="us-east-1">us-east-1</option>
            <option value="us-west-2">us-west-2</option>
            <option value="eu-west-1">eu-west-1</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Role ARN</label>
          <input
            type="text"
            value={formData.roleArn}
            onChange={(e) => setFormData({ ...formData, roleArn: e.target.value })}
            placeholder="arn:aws:iam::123456789012:role/byo-console-access-role"
            className="w-full px-4 py-2 border rounded-lg font-mono text-sm"
            required
          />
        </div>

        <button
          type="submit"
          disabled={isConnecting}
          className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {isConnecting ? "Connecting..." : "Connect Account"}
        </button>
      </form>
    </div>
  );
}
```

---

## Test Suite (100% Coverage)

### Test Setup

```typescript
// lib/permissions/__tests__/setup.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { db } from "@/lib/db/client";

// Mock database client
vi.mock("@/lib/db/client", () => ({
  db: {
    query: {
      organizationMembers: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      awsAccountPermissions: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      awsAccounts: {
        findMany: vi.fn(),
      },
    },
    insert: vi.fn(() => ({ values: vi.fn() })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) })),
    delete: vi.fn(() => ({ where: vi.fn() })),
  },
}));

// Test data
export const mockUser = {
  id: "user-123",
  email: "test@example.com",
  name: "Test User",
};

export const mockOrganization = {
  id: "org-123",
  name: "Test Org",
  slug: "test-org",
};

export const mockAWSAccount = {
  id: "aws-123",
  organizationId: "org-123",
  name: "Production",
  accountId: "123456789012",
  region: "us-east-1",
  roleArn: "arn:aws:iam::123456789012:role/test",
  externalId: "external-123",
  isVerified: true,
};
```

### Unit Tests: grant-access.ts

```typescript
// lib/permissions/__tests__/grant-access.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { grantAWSAccountAccess } from "../grant-access";
import { db } from "@/lib/db/client";
import { mockUser, mockAWSAccount } from "./setup";

describe("grantAWSAccountAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create new permission when none exists", async () => {
    const insertMock = vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });
    vi.mocked(db.insert).mockReturnValue(insertMock as any);
    vi.mocked(db.query.awsAccountPermissions.findFirst).mockResolvedValue(null);

    await grantAWSAccountAccess({
      userId: mockUser.id,
      awsAccountId: mockAWSAccount.id,
      permissions: "READ_ONLY",
      grantedBy: "admin-123",
    });

    expect(db.query.awsAccountPermissions.findFirst).toHaveBeenCalledWith({
      where: expect.any(Function),
    });
    expect(db.insert).toHaveBeenCalled();
    expect(insertMock.values).toHaveBeenCalledWith({
      userId: mockUser.id,
      awsAccountId: mockAWSAccount.id,
      permissions: ["view"],
      grantedBy: "admin-123",
      expiresAt: undefined,
    });
  });

  it("should update existing permission", async () => {
    const existingPermission = {
      id: "perm-123",
      userId: mockUser.id,
      awsAccountId: mockAWSAccount.id,
      permissions: ["view"],
      grantedBy: "admin-123",
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: null,
    };

    vi.mocked(db.query.awsAccountPermissions.findFirst).mockResolvedValue(
      existingPermission
    );

    const updateMock = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });
    vi.mocked(db.update).mockReturnValue(updateMock as any);

    await grantAWSAccountAccess({
      userId: mockUser.id,
      awsAccountId: mockAWSAccount.id,
      permissions: "FULL_ACCESS",
      grantedBy: "admin-123",
    });

    expect(db.update).toHaveBeenCalled();
    expect(updateMock.set).toHaveBeenCalledWith({
      permissions: ["view", "send"],
      expiresAt: undefined,
      updatedAt: expect.any(Date),
    });
  });

  it("should set expiration date when provided", async () => {
    vi.mocked(db.query.awsAccountPermissions.findFirst).mockResolvedValue(null);
    const insertMock = vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });
    vi.mocked(db.insert).mockReturnValue(insertMock as any);

    const expiresAt = new Date("2025-12-31");

    await grantAWSAccountAccess({
      userId: mockUser.id,
      awsAccountId: mockAWSAccount.id,
      permissions: "ADMIN",
      grantedBy: "admin-123",
      expiresAt,
    });

    expect(insertMock.values).toHaveBeenCalledWith({
      userId: mockUser.id,
      awsAccountId: mockAWSAccount.id,
      permissions: ["view", "send", "manage"],
      grantedBy: "admin-123",
      expiresAt,
    });
  });
});
```

### Unit Tests: revoke-access.ts

```typescript
// lib/permissions/__tests__/revoke-access.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { revokeAWSAccountAccess } from "../revoke-access";
import { db } from "@/lib/db/client";
import { mockUser, mockAWSAccount } from "./setup";

describe("revokeAWSAccountAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should delete permission grant", async () => {
    const deleteMock = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });
    vi.mocked(db.delete).mockReturnValue(deleteMock as any);

    await revokeAWSAccountAccess({
      userId: mockUser.id,
      awsAccountId: mockAWSAccount.id,
    });

    expect(db.delete).toHaveBeenCalled();
    expect(deleteMock.where).toHaveBeenCalled();
  });

  it("should not throw error if permission doesn't exist", async () => {
    const deleteMock = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });
    vi.mocked(db.delete).mockReturnValue(deleteMock as any);

    await expect(
      revokeAWSAccountAccess({
        userId: mockUser.id,
        awsAccountId: mockAWSAccount.id,
      })
    ).resolves.not.toThrow();
  });
});
```

### Unit Tests: check-access.ts

```typescript
// lib/permissions/__tests__/check-access.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { checkAWSAccountAccess } from "../check-access";
import { db } from "@/lib/db/client";
import { mockUser, mockOrganization, mockAWSAccount } from "./setup";

describe("checkAWSAccountAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should deny access if user is not org member", async () => {
    vi.mocked(db.query.organizationMembers.findFirst).mockResolvedValue(null);

    const result = await checkAWSAccountAccess({
      userId: mockUser.id,
      organizationId: mockOrganization.id,
      awsAccountId: mockAWSAccount.id,
      permission: "view",
    });

    expect(result).toEqual({
      authorized: false,
      reason: "Not a member of this organization",
    });
  });

  it("should grant access if user is org owner", async () => {
    vi.mocked(db.query.organizationMembers.findFirst).mockResolvedValue({
      id: "member-123",
      userId: mockUser.id,
      organizationId: mockOrganization.id,
      role: "owner",
      createdAt: new Date(),
    });

    const result = await checkAWSAccountAccess({
      userId: mockUser.id,
      organizationId: mockOrganization.id,
      awsAccountId: mockAWSAccount.id,
      permission: "view",
    });

    expect(result).toEqual({
      authorized: true,
      reason: "Organization owner",
    });
  });

  it("should deny access if non-owner has no permission grant", async () => {
    vi.mocked(db.query.organizationMembers.findFirst).mockResolvedValue({
      id: "member-123",
      userId: mockUser.id,
      organizationId: mockOrganization.id,
      role: "member",
      createdAt: new Date(),
    });
    vi.mocked(db.query.awsAccountPermissions.findFirst).mockResolvedValue(null);

    const result = await checkAWSAccountAccess({
      userId: mockUser.id,
      organizationId: mockOrganization.id,
      awsAccountId: mockAWSAccount.id,
      permission: "view",
    });

    expect(result).toEqual({
      authorized: false,
      reason: "No permission grant",
    });
  });

  it("should grant access if non-owner has valid permission", async () => {
    vi.mocked(db.query.organizationMembers.findFirst).mockResolvedValue({
      id: "member-123",
      userId: mockUser.id,
      organizationId: mockOrganization.id,
      role: "member",
      createdAt: new Date(),
    });
    vi.mocked(db.query.awsAccountPermissions.findFirst).mockResolvedValue({
      id: "perm-123",
      userId: mockUser.id,
      awsAccountId: mockAWSAccount.id,
      permissions: ["view", "send"],
      grantedBy: "admin-123",
      expiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await checkAWSAccountAccess({
      userId: mockUser.id,
      organizationId: mockOrganization.id,
      awsAccountId: mockAWSAccount.id,
      permission: "send",
    });

    expect(result).toEqual({
      authorized: true,
      reason: "Explicit grant",
    });
  });

  it("should deny access if permission is expired", async () => {
    vi.mocked(db.query.organizationMembers.findFirst).mockResolvedValue({
      id: "member-123",
      userId: mockUser.id,
      organizationId: mockOrganization.id,
      role: "member",
      createdAt: new Date(),
    });
    vi.mocked(db.query.awsAccountPermissions.findFirst).mockResolvedValue({
      id: "perm-123",
      userId: mockUser.id,
      awsAccountId: mockAWSAccount.id,
      permissions: ["view"],
      grantedBy: "admin-123",
      expiresAt: new Date("2020-01-01"), // Expired
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await checkAWSAccountAccess({
      userId: mockUser.id,
      organizationId: mockOrganization.id,
      awsAccountId: mockAWSAccount.id,
      permission: "view",
    });

    expect(result).toEqual({
      authorized: false,
      reason: "Permission expired",
    });
  });

  it("should deny access if user lacks required permission", async () => {
    vi.mocked(db.query.organizationMembers.findFirst).mockResolvedValue({
      id: "member-123",
      userId: mockUser.id,
      organizationId: mockOrganization.id,
      role: "member",
      createdAt: new Date(),
    });
    vi.mocked(db.query.awsAccountPermissions.findFirst).mockResolvedValue({
      id: "perm-123",
      userId: mockUser.id,
      awsAccountId: mockAWSAccount.id,
      permissions: ["view"], // Only view, not manage
      grantedBy: "admin-123",
      expiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await checkAWSAccountAccess({
      userId: mockUser.id,
      organizationId: mockOrganization.id,
      awsAccountId: mockAWSAccount.id,
      permission: "manage",
    });

    expect(result).toEqual({
      authorized: false,
      reason: "Insufficient permissions",
    });
  });
});
```

### Unit Tests: list-permissions.ts

```typescript
// lib/permissions/__tests__/list-permissions.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { listUserAWSAccountPermissions } from "../list-permissions";
import { db } from "@/lib/db/client";
import { mockUser, mockOrganization, mockAWSAccount } from "./setup";

describe("listUserAWSAccountPermissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return all accounts with full permissions for owners", async () => {
    vi.mocked(db.query.awsAccounts.findMany).mockResolvedValue([mockAWSAccount]);
    vi.mocked(db.query.organizationMembers.findFirst).mockResolvedValue({
      id: "member-123",
      userId: mockUser.id,
      organizationId: mockOrganization.id,
      role: "owner",
      createdAt: new Date(),
    });

    const result = await listUserAWSAccountPermissions({
      userId: mockUser.id,
      organizationId: mockOrganization.id,
    });

    expect(result).toEqual([
      {
        awsAccountId: mockAWSAccount.id,
        awsAccountName: mockAWSAccount.name,
        permissions: ["view", "send", "manage"],
        reason: "owner",
        expiresAt: null,
      },
    ]);
  });

  it("should return only accounts with explicit grants for non-owners", async () => {
    vi.mocked(db.query.awsAccounts.findMany).mockResolvedValue([
      mockAWSAccount,
      { ...mockAWSAccount, id: "aws-456", name: "Staging" },
    ]);
    vi.mocked(db.query.organizationMembers.findFirst).mockResolvedValue({
      id: "member-123",
      userId: mockUser.id,
      organizationId: mockOrganization.id,
      role: "member",
      createdAt: new Date(),
    });
    vi.mocked(db.query.awsAccountPermissions.findMany).mockResolvedValue([
      {
        id: "perm-123",
        userId: mockUser.id,
        awsAccountId: mockAWSAccount.id,
        permissions: ["view"],
        grantedBy: "admin-123",
        expiresAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const result = await listUserAWSAccountPermissions({
      userId: mockUser.id,
      organizationId: mockOrganization.id,
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      awsAccountId: mockAWSAccount.id,
      awsAccountName: mockAWSAccount.name,
      permissions: ["view"],
      reason: "explicit",
      expiresAt: null,
    });
  });

  it("should filter out expired permissions", async () => {
    vi.mocked(db.query.awsAccounts.findMany).mockResolvedValue([mockAWSAccount]);
    vi.mocked(db.query.organizationMembers.findFirst).mockResolvedValue({
      id: "member-123",
      userId: mockUser.id,
      organizationId: mockOrganization.id,
      role: "member",
      createdAt: new Date(),
    });
    vi.mocked(db.query.awsAccountPermissions.findMany).mockResolvedValue([
      {
        id: "perm-123",
        userId: mockUser.id,
        awsAccountId: mockAWSAccount.id,
        permissions: ["view"],
        grantedBy: "admin-123",
        expiresAt: new Date("2020-01-01"),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const result = await listUserAWSAccountPermissions({
      userId: mockUser.id,
      organizationId: mockOrganization.id,
    });

    expect(result).toHaveLength(0);
  });
});
```

### Unit Tests: middleware.ts

```typescript
// lib/permissions/__tests__/middleware.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { requireAWSAccountAccess } from "../middleware";
import { auth } from "@/lib/auth";
import { checkAWSAccountAccess } from "../check-access";
import { mockUser, mockOrganization, mockAWSAccount } from "./setup";

vi.mock("@/lib/auth");
vi.mock("../check-access");

describe("requireAWSAccountAccess", () => {
  const mockRequest = new Request("http://localhost");

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 401 if no session", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);

    const result = await requireAWSAccountAccess(mockRequest, {
      organizationId: mockOrganization.id,
      awsAccountId: mockAWSAccount.id,
      permission: "view",
    });

    expect(result.authorized).toBe(false);
    expect(result.response?.status).toBe(401);
  });

  it("should return 403 if access denied", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({
      user: mockUser,
      session: { id: "session-123" },
    } as any);
    vi.mocked(checkAWSAccountAccess).mockResolvedValue({
      authorized: false,
      reason: "No permission grant",
    });

    const result = await requireAWSAccountAccess(mockRequest, {
      organizationId: mockOrganization.id,
      awsAccountId: mockAWSAccount.id,
      permission: "view",
    });

    expect(result.authorized).toBe(false);
    expect(result.response?.status).toBe(403);
  });

  it("should return authorized true if access granted", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({
      user: mockUser,
      session: { id: "session-123" },
    } as any);
    vi.mocked(checkAWSAccountAccess).mockResolvedValue({
      authorized: true,
      reason: "Organization owner",
    });

    const result = await requireAWSAccountAccess(mockRequest, {
      organizationId: mockOrganization.id,
      awsAccountId: mockAWSAccount.id,
      permission: "view",
    });

    expect(result.authorized).toBe(true);
    expect(result.userId).toBe(mockUser.id);
  });
});
```

### Integration Tests

```typescript
// lib/permissions/__tests__/integration.test.ts
import { describe, it, expect } from "vitest";
import { grantAWSAccountAccess } from "../grant-access";
import { checkAWSAccountAccess } from "../check-access";
import { revokeAWSAccountAccess } from "../revoke-access";

describe("Permission System Integration", () => {
  it("should grant, check, and revoke permissions", async () => {
    const userId = "user-123";
    const awsAccountId = "aws-123";
    const organizationId = "org-123";

    // Grant permission
    await grantAWSAccountAccess({
      userId,
      awsAccountId,
      permissions: "FULL_ACCESS",
      grantedBy: "admin-123",
    });

    // Check permission
    let result = await checkAWSAccountAccess({
      userId,
      organizationId,
      awsAccountId,
      permission: "send",
    });
    expect(result.authorized).toBe(true);

    // Revoke permission
    await revokeAWSAccountAccess({ userId, awsAccountId });

    // Check permission again
    result = await checkAWSAccountAccess({
      userId,
      organizationId,
      awsAccountId,
      permission: "send",
    });
    expect(result.authorized).toBe(false);
  });
});
```

### Running Tests

```bash
# Run all tests with coverage
pnpm test:coverage

# Run specific test file
pnpm test lib/permissions/__tests__/check-access.test.ts

# Watch mode
pnpm test:watch
```

### Coverage Goals

- **Line Coverage**: 100%
- **Branch Coverage**: 100%
- **Function Coverage**: 100%
- **Statement Coverage**: 100%

---

## Implementation Steps

### Phase 1: Foundation (Week 1)

1. **Database Setup**
   ```bash
   # Set up PostgreSQL (Neon/Supabase)
   # Create database
   # Update DATABASE_URL in .env
   ```

2. **better-auth Setup**
   ```bash
   npm install better-auth @better-auth/react
   ```
   - [ ] Create `lib/auth.ts` with configuration
   - [ ] Add organization plugin
   - [ ] Add access (DAC) plugin
   - [ ] Create API route: `app/api/auth/[...all]/route.ts`
   - [ ] Test sign-up flow

3. **Database Schema**
   - [ ] Define custom tables in `lib/db/schema.ts`
   - [ ] Generate migrations: `npm run db:generate`
   - [ ] Run migrations: `npm run db:migrate`
   - [ ] Test database connection

### Phase 2: AWS Integration (Week 2)

1. **IAM Role Assumption**
   - [ ] Implement `lib/aws/assume-role.ts`
   - [ ] Implement `lib/aws/credential-cache.ts`
   - [ ] Test AssumeRole locally

2. **CloudFormation Template**
   - [ ] Create template file
   - [ ] Upload to S3 (public bucket)
   - [ ] Test deployment manually

3. **CloudWatch Integration**
   - [ ] Implement `lib/aws/cloudwatch.ts`
   - [ ] Test fetching metrics

### Phase 3: Permission System (Week 2-3)

1. **Permission Helpers**
   - [ ] Create `lib/permissions/types.ts`
   - [ ] Create `lib/permissions/grant-access.ts`
   - [ ] Create `lib/permissions/revoke-access.ts`
   - [ ] Create `lib/permissions/check-access.ts`
   - [ ] Create `lib/permissions/list-permissions.ts`
   - [ ] Create `lib/permissions/middleware.ts`

2. **Write Comprehensive Tests (100% Coverage)**
   - [ ] Unit tests for `grant-access.ts`
   - [ ] Unit tests for `revoke-access.ts`
   - [ ] Unit tests for `check-access.ts`
   - [ ] Unit tests for `list-permissions.ts`
   - [ ] Unit tests for `middleware.ts`
   - [ ] Integration tests for permission flow
   - [ ] Edge case tests (expired permissions, non-members, etc.)

### Phase 4: API Routes (Week 3)

1. **Core Routes**
   - [ ] POST `/api/organizations/[orgId]/aws-accounts` (connect)
   - [ ] GET `/api/organizations/[orgId]/aws-accounts` (list)
   - [ ] GET `/api/organizations/[orgId]/aws-accounts/[id]/metrics`
   - [ ] POST `/api/organizations/[orgId]/aws-accounts/[id]/access` (grant)
   - [ ] DELETE `/api/organizations/[orgId]/aws-accounts/[id]/access/[userId]` (revoke)

2. **Test with curl/Postman**

### Phase 5: Frontend (Week 4)

1. **Auth Pages**
   - [ ] Sign-up page
   - [ ] Sign-in page
   - [ ] Email verification flow

2. **Dashboard**
   - [ ] Organization switcher
   - [ ] AWS account list
   - [ ] Connect AWS account form
   - [ ] Metrics display

3. **Permission Management UI**
   - [ ] Member list with per-account access
   - [ ] Grant/revoke access modals

### Phase 6: Testing & Launch (Week 5)

1. **Testing**
   - [ ] Unit tests for permission logic
   - [ ] Integration tests for API routes
   - [ ] E2E tests for onboarding

2. **Deploy**
   - [ ] Deploy to Vercel
   - [ ] Configure environment variables
   - [ ] Test in production

---

## Testing Checklist

### Authentication
- [ ] User can sign up with email/password
- [ ] User can sign in with GitHub OAuth
- [ ] User can sign in with Google OAuth
- [ ] Personal organization auto-created on signup
- [ ] Session persists across page reloads

### Organizations
- [ ] User can create additional organizations
- [ ] User can invite members to organization
- [ ] User can switch between organizations
- [ ] Organization roles work (owner/admin/member)

### AWS Account Connection
- [ ] CloudFormation template deploys successfully
- [ ] External ID is unique per connection
- [ ] AssumeRole works with correct external ID
- [ ] AssumeRole fails with incorrect external ID
- [ ] AWS account appears in organization

### Permissions
- [ ] Owner can access all AWS accounts
- [ ] Admin needs explicit grant for AWS account
- [ ] Member needs explicit grant for AWS account
- [ ] READ_ONLY grant allows viewing only
- [ ] FULL_ACCESS grant allows viewing + sending
- [ ] Time-bound grants expire correctly
- [ ] Revoking access works

### Metrics
- [ ] CloudWatch metrics display correctly
- [ ] Credential caching works
- [ ] Expired credentials re-fetched automatically

### Edge Cases
- [ ] User not in organization gets 403
- [ ] User without grant gets 403
- [ ] Invalid AWS credentials handled gracefully
- [ ] Expired grants checked correctly

---

## Summary

This spec provides everything you need to build the BYO hosted dashboard from scratch using:

✅ **better-auth** for authentication with organizations
✅ **better-auth DAC** for per-AWS-account permissions  
✅ **IAM role assumption** for secure AWS access
✅ **No custom RBAC** - using built-in better-auth features

**Key Files to Create:**
- `lib/auth.ts` - better-auth configuration
- `lib/permissions/*.ts` - Permission helpers
- `lib/aws/*.ts` - AWS integration
- `lib/db/schema.ts` - Database schema
- `app/api/organizations/[orgId]/*` - API routes
- `components/*` - Frontend components

**Database Tables:**
- better-auth creates: user, organization, organization_member, statement
- You create: aws_account, email_template, api_key, audit_log

**No migration code needed** - you're building from scratch!
