# Multi-Organization & Multi-AWS Account Architecture Spec

**Goal**: Enable users to belong to multiple organizations, each organization to connect multiple AWS accounts, and provide an aggregated dashboard view with intelligent filtering - following proven SaaS patterns from Datadog, Vercel, and others.

**Architecture Pattern**: Organization-scoped aggregated view with inline filtering (Datadog pattern)

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Data Model](#data-model)
3. [User Flow](#user-flow)
4. [UI/UX Patterns](#uiux-patterns)
5. [Backend Implementation](#backend-implementation)
6. [Frontend Implementation](#frontend-implementation)
7. [Authentication & Authorization](#authentication--authorization)
8. [AWS Account Connection Flow](#aws-account-connection-flow)
9. [Dashboard Aggregation Strategy](#dashboard-aggregation-strategy)
10. [Implementation Phases](#implementation-phases)
11. [Success Criteria](#success-criteria)

---

## Architecture Overview

### Key Design Decisions

Based on research of Datadog and other multi-account SaaS platforms:

**Organization = Billing + Team Boundary**
- Users can be members of multiple organizations
- Organization switcher in top-left (Slack/Vercel pattern)
- Each organization has its own billing, team members, and settings

**AWS Accounts = Technical Detail**
- One organization can connect multiple AWS accounts
- Default view: Aggregated metrics from ALL connected accounts
- Inline filtering by AWS account (dropdown in dashboard header)
- No need to "select into" an account - it's just a filter

**Why This Works:**
- Matches Datadog's proven pattern for infrastructure monitoring
- 86% of Datadog customers use multi-account setups
- Reduces context switching - users see everything in one place
- AWS accounts are implementation details, not primary navigation

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    User Authentication                       │
│             (better-auth with organizations)                 │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                  Organization Selection                      │
│  ┌────────┐  ┌────────┐  ┌────────┐                        │
│  │ Org A  │  │ Org B  │  │ Org C  │  (Top-left switcher)   │
│  └────────┘  └────────┘  └────────┘                        │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│              Selected Organization Dashboard                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  AWS Account Filter: [All Accounts ▼]              │   │
│  │  - Production Account (us-east-1)                   │   │
│  │  - Staging Account (us-west-2)                      │   │
│  │  - Development Account (eu-west-1)                  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │         Aggregated Metrics (All Accounts)           │   │
│  │  - Total Sends: 50,000 (Prod: 45k, Staging: 5k)    │   │
│  │  - Bounce Rate: 2.1% (Prod: 2.0%, Staging: 3.5%)   │   │
│  │  - Charts show combined data with color coding      │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│              AWS Accounts (Multiple per Org)                 │
│  - Each with own IAM role for access                        │
│  - Each with own region configuration                        │
│  - Metrics fetched in parallel, aggregated on backend       │
└─────────────────────────────────────────────────────────────┘
```

---

## Data Model

### Database Schema

Using better-auth organizations plugin + custom AWS account management.

#### Core Tables

**users** (provided by better-auth)
```typescript
interface User {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}
```

**organizations** (provided by better-auth)
```typescript
interface Organization {
  id: string;
  name: string;
  slug: string;
  logo?: string;
  createdAt: Date;
  updatedAt: Date;
  metadata?: {
    // Custom fields
    defaultRegion?: string;
    billingEmail?: string;
    plan?: 'free' | 'starter' | 'pro' | 'enterprise';
  };
}
```

**organization_members** (provided by better-auth)
```typescript
interface OrganizationMember {
  id: string;
  organizationId: string;
  userId: string;
  role: 'owner' | 'admin' | 'member';
  createdAt: Date;
}
```

#### Custom Tables

**aws_accounts** (new)
```typescript
interface AwsAccount {
  id: string;
  organizationId: string;

  // AWS account details
  accountId: string;         // AWS account ID (123456789012)
  accountAlias?: string;     // User-friendly name
  region: string;            // Primary region (us-east-1)

  // Wraps infrastructure details
  roleArn: string;           // IAM role ARN for access
  stackName: string;         // Pulumi stack name

  // SES configuration
  sesConfigurationSet?: string;
  sesDomains: string[];      // Verified domains

  // Feature flags
  features: {
    sendingEnabled: boolean;
    eventTracking: boolean;
    historyStorage: boolean;
  };

  // Metadata
  environment?: 'production' | 'staging' | 'development';
  tags: Record<string, string>;

  // Status
  status: 'active' | 'inactive' | 'error';
  lastSyncedAt?: Date;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;         // User ID who connected account
}
```

**aws_account_metrics_cache** (new - optional optimization)
```typescript
interface AwsAccountMetricsCache {
  id: string;
  awsAccountId: string;

  // Cached metrics
  metricType: 'sends' | 'bounces' | 'complaints' | 'deliveries';
  timeRange: '1h' | '24h' | '7d' | '30d';
  data: Array<{ timestamp: number; value: number }>;

  // Cache metadata
  cachedAt: Date;
  expiresAt: Date;
}
```

#### Relationships

```
User (1) ──< (N) OrganizationMember (N) >── (1) Organization
                                              │
                                              │
                                              └──< (N) AwsAccount
```

---

## User Flow

### 1. Initial Setup Flow

```
1. User signs up → Creates personal organization (default)
2. User runs `wraps init` → Deploys infrastructure to AWS
3. CLI prompts: "Connect this AWS account to an organization?"
4. User selects organization (or creates new one)
5. AWS account is linked to organization
6. User sees dashboard with single account
```

### 2. Adding Additional AWS Accounts

```
1. User navigates to Organization Settings → AWS Accounts
2. Clicks "Connect AWS Account"
3. Options:
   a. Run `wraps init` in new AWS account
   b. Run `wraps connect` to link existing SES setup
4. CLI generates connection token
5. User enters token in web UI (or vice versa)
6. AWS account linked to organization
7. Dashboard now shows aggregated view
```

### 3. Creating New Organization

```
1. User clicks organization switcher (top-left)
2. Selects "Create Organization"
3. Enters organization name
4. Invites team members (optional)
5. New organization created
6. User is owner of new organization
7. Can now connect AWS accounts to this organization
```

### 4. Switching Between Organizations

```
1. User clicks organization switcher (top-left)
2. Sees list of organizations they're member of
3. Selects different organization
4. Dashboard updates to show that org's AWS accounts
5. URL updates to /org/{slug}/dashboard
6. Active org persisted in localStorage for next visit
```

---

## UI/UX Patterns

### Organization Switcher (Top-Left)

Following Vercel/GitHub/Slack pattern:

```tsx
┌─────────────────────────────────────────┐
│  [O] Acme Corp            ▼            │  ← Current organization
├─────────────────────────────────────────┤
│  Personal                               │
│  Acme Corp                         ✓    │
│  Startup Inc                            │
│  ─────────────────────────────────────  │
│  + Create Organization                  │
│  ⚙ Manage Organizations                 │
└─────────────────────────────────────────┘
```

**Component**: `<OrganizationSwitcher />`
**Location**: Top-left of dashboard header
**Behavior**:
- Dropdown shows all orgs user is member of
- Checkmark indicates active org
- Clicking switches organization (updates URL + context)
- Persists selection in localStorage

### AWS Account Filter (Dashboard Header)

```tsx
┌─────────────────────────────────────────┐
│  AWS Accounts: [All Accounts ▼]        │  ← Filter
├─────────────────────────────────────────┤
│  All Accounts                      ✓    │
│  ─────────────────────────────────────  │
│  Production (us-east-1)                 │
│  Staging (us-west-2)                    │
│  Development (eu-west-1)                │
└─────────────────────────────────────────┘
```

**Component**: `<AwsAccountFilter />`
**Location**: Dashboard header, below org switcher
**Behavior**:
- Default: "All Accounts" (aggregated view)
- Selecting specific account filters all metrics
- Shows account alias + region
- Color-coded badges (production=red, staging=yellow, dev=blue)

### Dashboard Layout

```
┌───────────────────────────────────────────────────────────┐
│  [Logo]  Acme Corp ▼              User Menu   [Jarod ▼]  │  ← Header
├───────────────────────────────────────────────────────────┤
│  AWS Accounts: [All Accounts ▼]                          │  ← Filter
├───────────────────────────────────────────────────────────┤
│                                                           │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  Overview                                           │ │
│  │  - Total Sends: 50,000                              │ │
│  │    • Production: 45,000 (90%)                       │ │
│  │    • Staging: 5,000 (10%)                           │ │
│  │  - Bounce Rate: 2.1% (↓ 0.3%)                      │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  Metrics Chart                                      │ │
│  │  [Line chart with multiple series for each account] │ │
│  │  Legend shows account breakdown with color codes    │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  Recent Activity (All Accounts)                     │ │
│  │  Email      To              Status      Account     │ │
│  │  Welcome    user@ex.com     Delivered   Prod        │ │
│  │  Reset PW   admin@ex.com    Bounced     Staging     │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

### Settings Page - AWS Accounts

```
Organization Settings → AWS Accounts

┌─────────────────────────────────────────────────────────┐
│  Connected AWS Accounts (3)          [+ Connect Account]│
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Production Account                 [🟢 Active]  │   │
│  │  AWS Account ID: 123456789012                    │   │
│  │  Region: us-east-1                               │   │
│  │  Role ARN: arn:aws:iam::123456...                │   │
│  │  Domains: app.acme.com, mail.acme.com           │   │
│  │  Last Synced: 2 minutes ago                      │   │
│  │                                                   │   │
│  │  [View Details]  [Edit]  [Disconnect]           │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Staging Account                    [🟡 Active]  │   │
│  │  AWS Account ID: 987654321098                    │   │
│  │  Region: us-west-2                               │   │
│  │  Role ARN: arn:aws:iam::987654...                │   │
│  │  Domains: staging.acme.com                       │   │
│  │  Last Synced: 5 minutes ago                      │   │
│  │                                                   │   │
│  │  [View Details]  [Edit]  [Disconnect]           │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Backend Implementation

### Database Layer (Drizzle ORM)

**File**: `packages/db/src/schema/aws-accounts.ts`

```typescript
import { pgTable, uuid, varchar, jsonb, timestamp, boolean } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';

export const awsAccounts = pgTable('aws_accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),

  // AWS account details
  accountId: varchar('account_id', { length: 12 }).notNull(),
  accountAlias: varchar('account_alias', { length: 255 }),
  region: varchar('region', { length: 50 }).notNull(),

  // Wraps infrastructure
  roleArn: varchar('role_arn', { length: 2048 }).notNull(),
  stackName: varchar('stack_name', { length: 255 }).notNull(),

  // SES configuration
  sesConfigurationSet: varchar('ses_configuration_set', { length: 255 }),
  sesDomains: jsonb('ses_domains').$type<string[]>().default([]),

  // Features
  features: jsonb('features').$type<{
    sendingEnabled: boolean;
    eventTracking: boolean;
    historyStorage: boolean;
  }>().notNull(),

  // Metadata
  environment: varchar('environment', { length: 50 }),
  tags: jsonb('tags').$type<Record<string, string>>().default({}),

  // Status
  status: varchar('status', { length: 50 }).notNull().default('active'),
  lastSyncedAt: timestamp('last_synced_at'),

  // Timestamps
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  createdBy: uuid('created_by').notNull(),
});

// Indexes
export const awsAccountsIndexes = {
  organizationIdx: index('aws_accounts_organization_id_idx').on(awsAccounts.organizationId),
  accountIdIdx: index('aws_accounts_account_id_idx').on(awsAccounts.accountId),
};
```

### API Routes (Next.js App Router)

**File**: `apps/web/src/app/api/organizations/[orgId]/aws-accounts/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@wraps/db';
import { awsAccounts } from '@wraps/db/schema';
import { and, eq } from 'drizzle-orm';

/**
 * GET /api/organizations/:orgId/aws-accounts
 * List all AWS accounts for an organization
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { orgId: string } }
) {
  // 1. Authenticate user
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Check org membership
  const isMember = await auth.api.hasOrgMembership({
    userId: session.user.id,
    organizationId: params.orgId,
  });

  if (!isMember) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // 3. Fetch AWS accounts
  const accounts = await db
    .select()
    .from(awsAccounts)
    .where(eq(awsAccounts.organizationId, params.orgId))
    .orderBy(awsAccounts.createdAt);

  return NextResponse.json({ accounts });
}

/**
 * POST /api/organizations/:orgId/aws-accounts
 * Connect a new AWS account
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { orgId: string } }
) {
  // 1. Authenticate user
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Check org membership (must be admin or owner)
  const membership = await auth.api.getOrgMembership({
    userId: session.user.id,
    organizationId: params.orgId,
  });

  if (!membership || !['admin', 'owner'].includes(membership.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // 3. Parse request body
  const body = await request.json();
  const {
    accountId,
    accountAlias,
    region,
    roleArn,
    stackName,
    features,
    environment,
  } = body;

  // 4. Validate AWS account isn't already connected
  const existing = await db
    .select()
    .from(awsAccounts)
    .where(
      and(
        eq(awsAccounts.organizationId, params.orgId),
        eq(awsAccounts.accountId, accountId)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    return NextResponse.json(
      { error: 'AWS account already connected' },
      { status: 409 }
    );
  }

  // 5. Create AWS account record
  const [account] = await db
    .insert(awsAccounts)
    .values({
      organizationId: params.orgId,
      accountId,
      accountAlias,
      region,
      roleArn,
      stackName,
      features,
      environment,
      createdBy: session.user.id,
      status: 'active',
    })
    .returning();

  return NextResponse.json({ account }, { status: 201 });
}
```

### Metrics Aggregation Service

**File**: `apps/web/src/lib/services/metrics-aggregation.ts`

```typescript
import { db } from '@wraps/db';
import { awsAccounts } from '@wraps/db/schema';
import { eq } from 'drizzle-orm';
import { CloudWatchClient, GetMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { STSClient, AssumeRoleCommand } from '@aws-sdk/client-sts';

interface MetricDataPoint {
  timestamp: number;
  value: number;
  accountId: string;
}

interface AggregatedMetrics {
  sends: MetricDataPoint[];
  bounces: MetricDataPoint[];
  complaints: MetricDataPoint[];
  deliveries: MetricDataPoint[];
}

/**
 * Fetch metrics from multiple AWS accounts and aggregate
 */
export async function fetchAggregatedMetrics(
  organizationId: string,
  timeRange: { start: Date; end: Date },
  filterAccountId?: string
): Promise<AggregatedMetrics> {
  // 1. Get all AWS accounts for this organization
  let query = db
    .select()
    .from(awsAccounts)
    .where(eq(awsAccounts.organizationId, organizationId));

  // 2. Apply account filter if provided
  if (filterAccountId) {
    query = query.where(eq(awsAccounts.accountId, filterAccountId));
  }

  const accounts = await query;

  // 3. Fetch metrics from each account in parallel
  const metricsPromises = accounts.map((account) =>
    fetchAccountMetrics(account, timeRange)
  );

  const allMetrics = await Promise.all(metricsPromises);

  // 4. Aggregate metrics
  return aggregateMetrics(allMetrics);
}

/**
 * Fetch metrics from a single AWS account
 */
async function fetchAccountMetrics(
  account: typeof awsAccounts.$inferSelect,
  timeRange: { start: Date; end: Date }
): Promise<AggregatedMetrics & { accountId: string }> {
  // 1. Assume IAM role
  const sts = new STSClient({ region: account.region });
  const assumeRoleResponse = await sts.send(
    new AssumeRoleCommand({
      RoleArn: account.roleArn,
      RoleSessionName: `wraps-metrics-${account.accountId}`,
      DurationSeconds: 3600,
    })
  );

  if (!assumeRoleResponse.Credentials) {
    throw new Error(`Failed to assume role for account ${account.accountId}`);
  }

  // 2. Create CloudWatch client with temporary credentials
  const cloudwatch = new CloudWatchClient({
    region: account.region,
    credentials: {
      accessKeyId: assumeRoleResponse.Credentials.AccessKeyId!,
      secretAccessKey: assumeRoleResponse.Credentials.SecretAccessKey!,
      sessionToken: assumeRoleResponse.Credentials.SessionToken!,
    },
  });

  // 3. Fetch metrics
  const response = await cloudwatch.send(
    new GetMetricDataCommand({
      MetricDataQueries: [
        {
          Id: 'sends',
          MetricStat: {
            Metric: {
              Namespace: 'AWS/SES',
              MetricName: 'Send',
            },
            Period: 300,
            Stat: 'Sum',
          },
        },
        {
          Id: 'bounces',
          MetricStat: {
            Metric: {
              Namespace: 'AWS/SES',
              MetricName: 'Bounce',
            },
            Period: 300,
            Stat: 'Sum',
          },
        },
        {
          Id: 'complaints',
          MetricStat: {
            Metric: {
              Namespace: 'AWS/SES',
              MetricName: 'Complaint',
            },
            Period: 300,
            Stat: 'Sum',
          },
        },
        {
          Id: 'deliveries',
          MetricStat: {
            Metric: {
              Namespace: 'AWS/SES',
              MetricName: 'Delivery',
            },
            Period: 300,
            Stat: 'Sum',
          },
        },
      ],
      StartTime: timeRange.start,
      EndTime: timeRange.end,
    })
  );

  // 4. Parse and return
  const parseMetric = (id: string): MetricDataPoint[] => {
    const metric = response.MetricDataResults?.find((r) => r.Id === id);
    if (!metric || !metric.Timestamps || !metric.Values) {
      return [];
    }

    return metric.Timestamps.map((timestamp, i) => ({
      timestamp: timestamp.getTime(),
      value: metric.Values![i] || 0,
      accountId: account.accountId,
    }));
  };

  return {
    sends: parseMetric('sends'),
    bounces: parseMetric('bounces'),
    complaints: parseMetric('complaints'),
    deliveries: parseMetric('deliveries'),
    accountId: account.accountId,
  };
}

/**
 * Aggregate metrics from multiple accounts
 */
function aggregateMetrics(
  allMetrics: Array<AggregatedMetrics & { accountId: string }>
): AggregatedMetrics {
  // Combine all data points, maintaining account ID for filtering
  const combined: AggregatedMetrics = {
    sends: [],
    bounces: [],
    complaints: [],
    deliveries: [],
  };

  for (const metrics of allMetrics) {
    combined.sends.push(...metrics.sends);
    combined.bounces.push(...metrics.bounces);
    combined.complaints.push(...metrics.complaints);
    combined.deliveries.push(...metrics.deliveries);
  }

  return combined;
}
```

---

## Frontend Implementation

### Organization Context

**File**: `apps/web/src/contexts/organization-context.tsx`

```typescript
'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from '@/contexts/auth-context';

interface Organization {
  id: string;
  name: string;
  slug: string;
  role: 'owner' | 'admin' | 'member';
}

interface OrganizationContextValue {
  organizations: Organization[];
  activeOrganization: Organization | null;
  setActiveOrganization: (org: Organization) => void;
  isLoading: boolean;
}

const OrganizationContext = createContext<OrganizationContextValue | undefined>(
  undefined
);

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [activeOrganization, setActiveOrgState] = useState<Organization | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load user's organizations
  useEffect(() => {
    if (!user) {
      setOrganizations([]);
      setActiveOrgState(null);
      setIsLoading(false);
      return;
    }

    async function loadOrganizations() {
      try {
        const response = await fetch('/api/organizations');
        const data = await response.json();
        setOrganizations(data.organizations);

        // Load active org from localStorage or use first org
        const savedOrgId = localStorage.getItem('activeOrganizationId');
        const activeOrg =
          data.organizations.find((org: Organization) => org.id === savedOrgId) ||
          data.organizations[0];

        setActiveOrgState(activeOrg);
      } catch (error) {
        console.error('Failed to load organizations:', error);
      } finally {
        setIsLoading(false);
      }
    }

    loadOrganizations();
  }, [user]);

  // Update active organization
  const setActiveOrganization = (org: Organization) => {
    setActiveOrgState(org);
    localStorage.setItem('activeOrganizationId', org.id);

    // Update URL to reflect active org
    window.history.pushState({}, '', `/org/${org.slug}/dashboard`);
  };

  return (
    <OrganizationContext.Provider
      value={{
        organizations,
        activeOrganization,
        setActiveOrganization,
        isLoading,
      }}
    >
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganization() {
  const context = useContext(OrganizationContext);
  if (context === undefined) {
    throw new Error('useOrganization must be used within OrganizationProvider');
  }
  return context;
}
```

### Organization Switcher Component

**File**: `apps/web/src/components/organization-switcher.tsx`

```typescript
'use client';

import { useState } from 'react';
import { useOrganization } from '@/contexts/organization-context';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@wraps/ui/components/ui/dropdown-menu';
import { Button } from '@wraps/ui/components/ui/button';
import { Check, ChevronDown, Plus, Settings } from 'lucide-react';

export function OrganizationSwitcher() {
  const { organizations, activeOrganization, setActiveOrganization } = useOrganization();
  const [open, setOpen] = useState(false);

  if (!activeOrganization) {
    return null;
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
            {activeOrganization.name[0].toUpperCase()}
          </div>
          <span className="font-medium">{activeOrganization.name}</span>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Organizations</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {organizations.map((org) => (
          <DropdownMenuItem
            key={org.id}
            onClick={() => {
              setActiveOrganization(org);
              setOpen(false);
            }}
            className="flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-muted text-muted-foreground">
                {org.name[0].toUpperCase()}
              </div>
              <span>{org.name}</span>
            </div>
            {org.id === activeOrganization.id && <Check className="h-4 w-4" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <Plus className="mr-2 h-4 w-4" />
          Create Organization
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Settings className="mr-2 h-4 w-4" />
          Manage Organizations
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

### AWS Account Filter Component

**File**: `apps/web/src/components/aws-account-filter.tsx`

```typescript
'use client';

import { useState, useEffect } from 'react';
import { useOrganization } from '@/contexts/organization-context';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@wraps/ui/components/ui/select';
import { Badge } from '@wraps/ui/components/ui/badge';

interface AwsAccount {
  id: string;
  accountId: string;
  accountAlias?: string;
  region: string;
  environment?: string;
}

interface AwsAccountFilterProps {
  value: string | null;
  onChange: (accountId: string | null) => void;
}

export function AwsAccountFilter({ value, onChange }: AwsAccountFilterProps) {
  const { activeOrganization } = useOrganization();
  const [accounts, setAccounts] = useState<AwsAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!activeOrganization) return;

    async function loadAccounts() {
      try {
        const response = await fetch(
          `/api/organizations/${activeOrganization.id}/aws-accounts`
        );
        const data = await response.json();
        setAccounts(data.accounts);
      } catch (error) {
        console.error('Failed to load AWS accounts:', error);
      } finally {
        setIsLoading(false);
      }
    }

    loadAccounts();
  }, [activeOrganization]);

  if (isLoading) {
    return <div>Loading accounts...</div>;
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium">AWS Accounts:</span>
      <Select value={value || 'all'} onValueChange={(v) => onChange(v === 'all' ? null : v)}>
        <SelectTrigger className="w-64">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Accounts ({accounts.length})</SelectItem>
          <hr className="my-1" />
          {accounts.map((account) => (
            <SelectItem key={account.id} value={account.accountId}>
              <div className="flex items-center gap-2">
                <span>
                  {account.accountAlias || account.accountId} ({account.region})
                </span>
                {account.environment && (
                  <Badge
                    variant={
                      account.environment === 'production'
                        ? 'destructive'
                        : account.environment === 'staging'
                        ? 'default'
                        : 'secondary'
                    }
                  >
                    {account.environment}
                  </Badge>
                )}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
```

### Dashboard with Aggregated Metrics

**File**: `apps/web/src/app/org/[slug]/dashboard/page.tsx`

```typescript
'use client';

import { useState, useEffect } from 'react';
import { useOrganization } from '@/contexts/organization-context';
import { OrganizationSwitcher } from '@/components/organization-switcher';
import { AwsAccountFilter } from '@/components/aws-account-filter';
import { MetricsChart } from '@/components/metrics-chart';
import { Card, CardContent, CardHeader, CardTitle } from '@wraps/ui/components/ui/card';

export default function DashboardPage() {
  const { activeOrganization } = useOrganization();
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [metrics, setMetrics] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!activeOrganization) return;

    async function loadMetrics() {
      try {
        setIsLoading(true);
        const url = `/api/organizations/${activeOrganization.id}/metrics${
          selectedAccountId ? `?accountId=${selectedAccountId}` : ''
        }`;
        const response = await fetch(url);
        const data = await response.json();
        setMetrics(data.metrics);
      } catch (error) {
        console.error('Failed to load metrics:', error);
      } finally {
        setIsLoading(false);
      }
    }

    loadMetrics();
  }, [activeOrganization, selectedAccountId]);

  if (!activeOrganization) {
    return <div>Loading...</div>;
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="border-b">
        <div className="flex items-center justify-between p-4">
          <OrganizationSwitcher />
          <div>{/* User menu */}</div>
        </div>
      </header>

      {/* Filters */}
      <div className="border-b p-4">
        <AwsAccountFilter
          value={selectedAccountId}
          onChange={setSelectedAccountId}
        />
      </div>

      {/* Dashboard Content */}
      <main className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <div>Loading metrics...</div>
        ) : (
          <div className="space-y-6">
            {/* Overview Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Total Sends</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">
                    {metrics?.totalSends?.toLocaleString() || 0}
                  </div>
                </CardContent>
              </Card>
              {/* Add more overview cards */}
            </div>

            {/* Metrics Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Email Metrics</CardTitle>
              </CardHeader>
              <CardContent>
                <MetricsChart data={metrics} />
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
```

---

## Authentication & Authorization

### Permission Levels

**Organization Roles** (provided by better-auth):
- **Owner**: Full access, can delete organization
- **Admin**: Can manage members, AWS accounts, settings
- **Member**: Read-only access to dashboards

**Per-Operation Checks**:
```typescript
// View dashboard
✓ Any member

// Connect AWS account
✓ Owner or Admin

// Disconnect AWS account
✓ Owner or Admin

// Invite members
✓ Owner or Admin

// Change member roles
✓ Owner only

// Delete organization
✓ Owner only
```

### Authorization Middleware

**File**: `apps/web/src/lib/auth/authorization.ts`

```typescript
import { auth } from '@/lib/auth';

export async function requireOrgMembership(
  userId: string,
  organizationId: string,
  minRole: 'member' | 'admin' | 'owner' = 'member'
) {
  const membership = await auth.api.getOrgMembership({
    userId,
    organizationId,
  });

  if (!membership) {
    throw new Error('Not a member of this organization');
  }

  const roleHierarchy = { member: 0, admin: 1, owner: 2 };
  if (roleHierarchy[membership.role] < roleHierarchy[minRole]) {
    throw new Error(`Requires ${minRole} role or higher`);
  }

  return membership;
}
```

---

## AWS Account Connection Flow

### CLI-Initiated Connection

**Step 1: Run `wraps init` in AWS account**

```bash
$ wraps init
✓ AWS credentials validated
✓ Region: us-east-1

? Do you want to connect this AWS account to an organization? (Y/n)
```

**Step 2: Organization selection**

```bash
? Select an organization:
  > Acme Corp
    Startup Inc
    + Create new organization

✓ Organization: Acme Corp

? Give this AWS account an alias (optional): Production Account
? What environment is this? (optional):
  > Production
    Staging
    Development
```

**Step 3: Generate connection token**

```bash
✓ Deploying infrastructure...
✓ Infrastructure deployed successfully

Connecting to organization "Acme Corp"...

Visit: https://console.wraps.dev/connect?token=eyJhbG...

Or run this command to connect automatically:
  wraps connect --token eyJhbG...

Connection expires in 10 minutes.
```

**Step 4: Web UI confirms connection**

User visits URL or CLI auto-opens browser:

```
Connecting AWS Account

Account ID: 123456789012
Region: us-east-1
Alias: Production Account
Environment: Production

Organization: Acme Corp

[Confirm Connection]  [Cancel]
```

### Web-Initiated Connection

**Step 1: User clicks "Connect AWS Account" in settings**

```
Connect AWS Account

Step 1: Run this command in your AWS account:

  wraps init --connect-token eyJhbG...

Or manually enter connection details:
  [Manual Setup]
```

---

## Dashboard Aggregation Strategy

### Aggregation Methods

**1. Backend Aggregation (Recommended)**

Pros:
- Single API call from frontend
- Consistent aggregation logic
- Can cache aggregated results
- Reduced frontend complexity

Cons:
- Higher backend compute
- Need parallel AWS SDK calls

**2. Frontend Aggregation**

Pros:
- Offload compute to client
- Can show per-account breakdown easily

Cons:
- Multiple API calls
- Inconsistent if accounts have errors
- More frontend complexity

**Recommendation**: Backend aggregation with per-account breakdown included in response.

### Caching Strategy

**Metrics Cache (Optional)**:
```typescript
// Cache metrics for 60 seconds per account
const cacheKey = `metrics:${accountId}:${timeRange}`;
const cached = await redis.get(cacheKey);

if (cached) {
  return JSON.parse(cached);
}

const metrics = await fetchAccountMetrics(account, timeRange);
await redis.set(cacheKey, JSON.stringify(metrics), 'EX', 60);

return metrics;
```

---

## Implementation Phases

### Phase 1: Database & Backend (Week 1)

- [ ] Create `aws_accounts` table schema
- [ ] Add database migrations
- [ ] Implement AWS account CRUD API routes
- [ ] Add organization membership checks
- [ ] Write tests for API routes

### Phase 2: CLI Integration (Week 2)

- [ ] Update `wraps init` to support organization connection
- [ ] Add organization selection prompt
- [ ] Implement connection token generation
- [ ] Add `wraps connect --token` command
- [ ] Store organization ID in Pulumi stack metadata

### Phase 3: Frontend - Organization Switcher (Week 3)

- [ ] Create organization context
- [ ] Build organization switcher component
- [ ] Implement organization switching logic
- [ ] Add organization settings page
- [ ] Test with multiple organizations

### Phase 4: Frontend - AWS Account Management (Week 4)

- [ ] Build AWS accounts settings page
- [ ] Create AWS account connection flow UI
- [ ] Add AWS account list/edit/delete
- [ ] Implement account status indicators
- [ ] Add account sync functionality

### Phase 5: Metrics Aggregation (Week 5-6)

- [ ] Build metrics aggregation service
- [ ] Implement parallel AWS SDK calls
- [ ] Add AWS account filter component
- [ ] Update dashboard to show aggregated metrics
- [ ] Add per-account breakdown in charts
- [ ] Implement metrics caching

### Phase 6: Testing & Polish (Week 7)

- [ ] End-to-end testing with multiple accounts
- [ ] Load testing with 10+ AWS accounts
- [ ] Error handling improvements
- [ ] Documentation updates
- [ ] User onboarding flow

---

## Success Criteria

### Core Functionality

- [ ] User can belong to multiple organizations
- [ ] User can switch between organizations seamlessly
- [ ] Organization can have multiple AWS accounts connected
- [ ] Dashboard shows aggregated metrics from all accounts
- [ ] User can filter dashboard by specific AWS account
- [ ] Charts show per-account breakdown with color coding

### User Experience

- [ ] Organization switch happens in <500ms
- [ ] Dashboard loads in <2 seconds with 3 accounts
- [ ] Clear visual indicators for active organization/account
- [ ] Intuitive AWS account connection flow
- [ ] Helpful error messages for failed AWS connections

### Security

- [ ] Proper authorization checks for all org operations
- [ ] IAM role assumption works for all accounts
- [ ] No cross-organization data leakage
- [ ] Audit logs for AWS account connections

### Performance

- [ ] Metrics fetch from 5 accounts in <3 seconds
- [ ] Metrics fetch from 10 accounts in <5 seconds
- [ ] Caching reduces redundant AWS API calls
- [ ] Parallel API calls prevent sequential bottlenecks

---

## Future Enhancements

### Phase 7: Advanced Features (Post-Launch)

- [ ] **Multi-region support**: Connect same AWS account in multiple regions
- [ ] **Account groups**: Group accounts by team/project
- [ ] **Custom dashboards**: Create custom views with specific accounts
- [ ] **Alerts**: Set up alerts based on aggregated or per-account metrics
- [ ] **Cost allocation**: Show AWS costs per account
- [ ] **Comparison mode**: Compare metrics between accounts side-by-side
- [ ] **Scheduled reports**: Email reports with aggregated metrics

### Phase 8: Enterprise Features

- [ ] **SSO/SAML**: Enterprise authentication
- [ ] **Advanced RBAC**: Custom roles beyond owner/admin/member
- [ ] **Compliance**: SOC 2, HIPAA compliance features
- [ ] **Audit logs**: Detailed audit trail for all operations
- [ ] **Service limits**: Enforce limits on AWS accounts per org
- [ ] **White-label**: Custom branding per organization

---

## Technical Considerations

### AWS API Rate Limits

**CloudWatch GetMetricData**:
- Rate: 1,000 transactions per second (TPS) per account per region
- With 10 accounts: 10,000 TPS total (not a concern)
- Recommend: Poll every 60 seconds, not more frequently

**STS AssumeRole**:
- Rate: 5,000 TPS per account per region
- Not a concern for our use case

### Database Performance

**Indexes Required**:
- `aws_accounts.organization_id` (for fast org lookups)
- `aws_accounts.account_id` (for duplicate checks)
- `aws_accounts.status` (for filtering active accounts)

**Query Optimization**:
```sql
-- Fast query for org's active AWS accounts
SELECT * FROM aws_accounts
WHERE organization_id = $1 AND status = 'active'
ORDER BY created_at DESC;

-- Add index
CREATE INDEX idx_aws_accounts_org_status ON aws_accounts(organization_id, status);
```

### Error Handling

**AWS Account Failures**:
- If 1 of 5 accounts fails, show partial data + error message
- Don't block entire dashboard on single account failure
- Implement exponential backoff for failed accounts
- Show account status indicators (green/yellow/red)

**Partial Data Strategy**:
```typescript
const results = await Promise.allSettled(metricsPromises);

const successfulMetrics = results
  .filter((r) => r.status === 'fulfilled')
  .map((r) => r.value);

const failedAccounts = results
  .filter((r) => r.status === 'rejected')
  .map((r, i) => ({ account: accounts[i], error: r.reason }));

// Return both successful metrics and error details
return {
  metrics: aggregateMetrics(successfulMetrics),
  errors: failedAccounts,
};
```

---

## Migration Path

### For Existing Users

**Users who already ran `wraps init`**:

1. Create personal organization automatically
2. Link existing AWS account to personal organization
3. Prompt to connect additional accounts

**Migration Script**:
```typescript
async function migrateExistingUsers() {
  const users = await db.select().from(users);

  for (const user of users) {
    // 1. Create personal organization
    const [org] = await db
      .insert(organizations)
      .values({
        name: `${user.name}'s Organization`,
        slug: `${user.id}-personal`,
      })
      .returning();

    // 2. Add user as owner
    await db.insert(organizationMembers).values({
      organizationId: org.id,
      userId: user.id,
      role: 'owner',
    });

    // 3. Find existing AWS infrastructure
    const existingStack = await findUserStack(user.id);

    if (existingStack) {
      // 4. Link to organization
      await db.insert(awsAccounts).values({
        organizationId: org.id,
        accountId: existingStack.accountId,
        region: existingStack.region,
        roleArn: existingStack.roleArn,
        stackName: existingStack.stackName,
        createdBy: user.id,
      });
    }
  }
}
```

---

## Appendix: Research Insights

### From Datadog

**Multi-Account Integration Methods**:
1. AWS Organizations + CloudFormation StackSets (recommended)
2. AWS Control Tower (for automated onboarding)
3. Terraform (for enterprise scale)

**Key Stat**: 86% of Datadog customers use multi-account setups, 70% use AWS Organizations.

**Aggregation Pattern**: Single dashboard showing all account data with filtering.

### From SaaS UI Research

**Organization Switching**:
- Leftmost sidebar (Slack pattern)
- Most common and familiar to users
- Quick access to all organizations

**Account Filtering**:
- Inline filtering preferred over separate navigation
- Dropdown/select in header
- "All Accounts" as default view

**Visual Design**:
- Color-code environments (prod=red, staging=yellow, dev=blue)
- Use badges for status indicators
- Show account breakdown in metrics

---

## Questions & Decisions

### Open Questions

1. **Should we support cross-organization account sharing?**
   - Example: Same AWS account connected to multiple orgs
   - Decision: No for MVP (too complex)

2. **How many AWS accounts should we support per organization?**
   - Free: 1 account
   - Starter: 1 account
   - Pro: Up to 3 accounts
   - Enterprise: Unlimited
   - Decision: TBD based on pricing strategy

3. **Should we support AWS Organizations integration like Datadog?**
   - Would auto-discover all accounts in an AWS Organization
   - Decision: Post-MVP feature (too complex for initial launch)

### Decisions Made

1. ✅ **Aggregated view by default** (not account selection)
2. ✅ **Organization = billing boundary**
3. ✅ **AWS account = technical detail** (filter, not primary nav)
4. ✅ **Backend aggregation** (not frontend)
5. ✅ **60-second metrics polling** (not real-time)
6. ✅ **better-auth organizations plugin** (not custom implementation)

---

## Implementation Checklist

### Week 1: Database & Backend
- [ ] Create `aws_accounts` table schema
- [ ] Write database migration
- [ ] Implement AWS account CRUD operations
- [ ] Add authorization middleware
- [ ] Write API route tests

### Week 2: CLI Integration
- [ ] Update `wraps init` for org connection
- [ ] Add organization selection prompt
- [ ] Generate connection tokens
- [ ] Implement `wraps connect --token`
- [ ] Store org ID in Pulumi metadata

### Week 3: Frontend - Org Switcher
- [ ] Create organization context
- [ ] Build organization switcher component
- [ ] Implement switching logic
- [ ] Add organization settings page
- [ ] Test with multiple orgs

### Week 4: Frontend - AWS Accounts
- [ ] Build AWS accounts settings page
- [ ] Create connection flow UI
- [ ] Add account list/edit/delete
- [ ] Implement status indicators
- [ ] Add account sync

### Week 5-6: Metrics Aggregation
- [ ] Build aggregation service
- [ ] Implement parallel AWS SDK calls
- [ ] Add account filter component
- [ ] Update dashboard for aggregation
- [ ] Add per-account breakdown
- [ ] Implement caching

### Week 7: Testing & Polish
- [ ] End-to-end testing
- [ ] Load testing (10+ accounts)
- [ ] Error handling improvements
- [ ] Documentation
- [ ] User onboarding

---

## Acceptance Criteria

**As a user, I can:**
- [x] Belong to multiple organizations
- [x] Switch between organizations in <500ms
- [x] Connect multiple AWS accounts to an organization
- [x] See aggregated metrics from all accounts by default
- [x] Filter dashboard by specific AWS account
- [x] See which account contributed to each metric
- [x] Understand account status (active/error) at a glance
- [x] Connect new AWS accounts via CLI or web
- [x] Disconnect AWS accounts (with confirmation)
- [x] Invite team members to organizations

**System performance:**
- [x] Dashboard loads in <2s with 3 accounts
- [x] Metrics fetch from 5 accounts in <3s
- [x] Metrics fetch from 10 accounts in <5s
- [x] Organization switch happens in <500ms
- [x] No cross-organization data leakage

---

## References

- Datadog multi-account integration: https://docs.datadoghq.com/integrations/guide/aws-organizations-setup/
- better-auth organizations: https://www.better-auth.com/docs/plugins/organization
- SaaS UI patterns: https://www.saasui.design/
- Drizzle ORM: https://orm.drizzle.team/

---

**Last Updated**: 2025-11-12
**Version**: 1.0
**Status**: Ready for Implementation
