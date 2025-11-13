# Wraps Console Implementation Spec

**Goal**: Add a `wraps console` command that starts a local web dashboard to monitor AWS SES metrics, email events, and domain verification status in real-time.

**Architecture**: Local-first Express server with Vite-built React frontend, Server-Sent Events for real-time updates, and AWS CloudWatch/SES API polling.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Package Structure](#package-structure)
3. [Implementation Phases](#implementation-phases)
4. [Detailed Implementation Guide](#detailed-implementation-guide)
5. [API Endpoints](#api-endpoints)
6. [Frontend Components](#frontend-components)
7. [AWS Integration](#aws-integration)
8. [Testing Strategy](#testing-strategy)
9. [Success Criteria](#success-criteria)

---

## Architecture Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       User's Browser                         │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           React Dashboard (Vite-built)               │  │
│  │  - Real-time metrics charts                          │  │
│  │  - Domain verification status                        │  │
│  │  - Recent email events                               │  │
│  │  - SSE connection for live updates                   │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            ↕ HTTP/SSE
┌─────────────────────────────────────────────────────────────┐
│              Express Server (localhost:5555)                 │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  - Serve static Vite build                           │  │
│  │  - SSE endpoint (/api/metrics/stream)                │  │
│  │  - REST endpoints for actions                        │  │
│  │  - Token-based authentication                        │  │
│  │  - Poll AWS APIs every 30-60 seconds                 │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            ↕ AWS SDK
┌─────────────────────────────────────────────────────────────┐
│                    User's AWS Account                        │
│  - Assume IAM role (created by wraps init)                    │
│  - CloudWatch (GetMetricData for SES metrics)               │
│  - SES (GetSendStatistics, GetSendQuota)                    │
│  - SESv2 (GetEmailIdentity for domain verification)         │
│  - DynamoDB (Query email history table)                     │
└─────────────────────────────────────────────────────────────┘
```

### Key Architectural Decisions

**Based on Research Findings:**

1. **Local-First Approach** (like Drizzle Studio & SST Console)
   - CLI command starts local server on 127.0.0.1:5555
   - No hosted infrastructure required initially
   - Future: Add hosted option later (like SST) - See `wraps-hosted-dashboard-expansion.md`
   - **Critical**: Architecture designed so 80% of code reuses for hosted version (IAM role pattern, service layer, React components all carry over)

2. **Server-Sent Events (SSE)** for Real-Time Updates
   - Simpler than WebSocket (no bidirectional communication needed)
   - Automatic reconnection built-in
   - Text-based protocol (easy debugging)
   - Perfect for one-way server→client metrics streaming

3. **CloudWatch Polling** (30-60 second intervals)
   - CloudWatch doesn't offer streaming APIs
   - Batch queries with GetMetricData (efficient)
   - Cache results on server to reduce API calls

4. **IAM Role Assumption** (SST Pattern)
   - Use existing IAM role created by `wraps init`
   - No credential storage required
   - Temporary credentials via STS AssumeRole

5. **Embedded Web Server** Pattern
   - Pre-build React app with Vite during package publish
   - Serve static assets from CLI package
   - Fast startup, small distribution size

---

## Package Structure

### Monorepo Structure (shadcn/ui Best Practices)

Following shadcn/ui monorepo guide, we'll create a shared UI package:

```
packages/
├── cli/                                   # Existing CLI package
│   ├── src/
│   │   ├── commands/
│   │   │   └── console.ts                # NEW: Console command
│   │   ├── console/                       # NEW: Console server
│   │   │   ├── server.ts                 # Express server setup
│   │   │   ├── routes/
│   │   │   │   ├── metrics.ts            # SSE metrics endpoint
│   │   │   │   ├── domains.ts            # Domain info endpoint
│   │   │   │   └── events.ts             # Email events endpoint
│   │   │   ├── services/
│   │   │   │   ├── aws-metrics.ts        # CloudWatch integration
│   │   │   │   ├── ses-service.ts        # SES API calls
│   │   │   │   └── dynamodb-service.ts   # Email history queries
│   │   │   └── middleware/
│   │   │       ├── auth.ts               # Token authentication
│   │   │       └── error.ts              # Error handling
│   │   └── utils/
│   │       └── assume-role.ts            # NEW: IAM role assumption
│   └── package.json                       # Updated with new scripts
│
├── console-ui/                            # NEW: React dashboard app
│   ├── src/
│   │   ├── App.tsx                       # Main app component
│   │   ├── main.tsx                      # Entry point
│   │   ├── components/
│   │   │   ├── MetricsChart.tsx          # Charts for metrics
│   │   │   ├── DomainStatus.tsx          # Domain verification UI
│   │   │   ├── RecentEvents.tsx          # Email events table
│   │   │   └── QuotaDisplay.tsx          # SES quota visualization
│   │   ├── hooks/
│   │   │   ├── useSSE.ts                 # SSE connection hook
│   │   │   └── useMetrics.ts             # Metrics state management
│   │   ├── utils/
│   │   │   └── api.ts                    # API client
│   │   └── styles/
│   │       └── globals.css               # Import from @wraps/ui
│   ├── components.json                    # shadcn/ui config for app
│   ├── index.html
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── package.json
│
└── ui/                                    # NEW: Shared UI components
    ├── src/
    │   ├── components/
    │   │   └── ui/                       # shadcn/ui components (installed here)
    │   │       ├── card.tsx
    │   │       ├── table.tsx
    │   │       ├── badge.tsx
    │   │       ├── button.tsx
    │   │       ├── progress.tsx
    │   │       ├── dialog.tsx
    │   │       └── ...
    │   ├── hooks/
    │   ├── lib/
    │   │   └── utils.ts                  # cn() utility
    │   └── styles/
    │       └── globals.css               # Tailwind v4 + theme
    ├── components.json                    # shadcn/ui config for shared components
    ├── tsconfig.json
    └── package.json

pnpm-workspace.yaml                        # Define workspace packages
```

### Workspace Configuration

**File**: `pnpm-workspace.yaml` (root)

```yaml
packages:
  - 'packages/*'
```

### Root package.json (for pnpm overrides)

**File**: `package.json` (root)

```json
{
  "name": "wraps-monorepo",
  "private": true,
  "scripts": {
    "dev": "pnpm --filter @wraps/console-ui dev",
    "build": "pnpm --filter @wraps/ui build && pnpm --filter @wraps/console-ui build && pnpm --filter @wraps/cli build",
    "build:ui": "pnpm --filter @wraps/ui build",
    "build:console": "pnpm --filter @wraps/console-ui build",
    "build:cli": "pnpm --filter @wraps/cli build"
  },
  "devDependencies": {
    "typescript": "^5.7.2"
  },
  "pnpm": {
    "overrides": {
      "react-is": "$react-is"
    }
  }
}
```

### packages/ui/package.json (Shared UI Components)

```json
{
  "name": "@wraps/ui",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    "./components/*": "./src/components/*.tsx",
    "./lib/*": "./src/lib/*.ts",
    "./hooks/*": "./src/hooks/*.ts",
    "./styles/*": "./src/styles/*.css"
  },
  "scripts": {
    "build": "tsc --noEmit"
  },
  "dependencies": {
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.1",
    "tailwind-merge": "^2.5.5",
    "lucide-react": "^0.462.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.1",
    "@types/react-dom": "^19.0.1",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.7.2"
  },
  "peerDependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  }
}
```

### packages/console-ui/package.json (React Dashboard)

```json
{
  "name": "@wraps/console-ui",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@wraps/ui": "workspace:*",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-is": "^19.0.0",
    "recharts": "^2.15.1",
    "date-fns": "^4.1.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.1",
    "@types/react-dom": "^19.0.1",
    "@vitejs/plugin-react": "^5.0.0",
    "typescript": "^5.7.2",
    "vite": "^6.0.3",
    "tailwindcss": "^4.0.0",
    "tw-animate-css": "^0.3.0"
  }
}
```

### packages/cli/package.json (Updated)

Add new dependencies to existing package.json:

```json
{
  "dependencies": {
    "@aws-sdk/client-cloudwatch": "^3.490.0",
    "express": "^4.21.2",
    "open": "^10.1.0",
    "get-port": "^7.1.0",
    "http-terminator": "^3.2.0"
  },
  "devDependencies": {
    "@types/express": "^5.0.0"
  },
  "scripts": {
    "build": "pnpm build:console && tsup",
    "build:console": "pnpm --filter @wraps/console-ui build"
  }
}
```

### Latest Package Versions (2025)

All packages updated to latest stable versions:

- **React 19** (19.0.0) - Latest major release
- **Tailwind CSS v4** (4.0.0) - Latest major release, CSS-first config
- **Vite 6** (6.0.3) - Latest major release
- **TypeScript 5.7** (5.7.2) - Latest stable
- **Recharts 2.15.1** - Latest stable (v3 still in migration)
- **date-fns 4.x** - Latest major version
- **lucide-react** - Latest icons
- **tw-animate-css** - Replaces deprecated tailwindcss-animate for v4

---

## Implementation Phases

### Phase 1: Core Infrastructure (Week 1)

**Goal**: Get basic server running with SSE endpoint and AWS integration

- [ ] Create `wraps console` command handler
- [ ] Set up Express server with static file serving
- [ ] Implement token-based authentication middleware
- [ ] Add IAM role assumption utility
- [ ] Create SSE endpoint for metrics streaming
- [ ] Implement CloudWatch metrics polling
- [ ] Add graceful shutdown handling

### Phase 2: Frontend Dashboard (Week 2)

**Goal**: Build React UI with real-time metrics visualization using shadcn/ui

- [ ] Set up Vite + React project structure
- [ ] Configure Tailwind CSS and shadcn/ui
- [ ] Install shadcn/ui components (card, table, badge, progress, dialog, etc.)
- [ ] Create SSE connection hook
- [ ] Build metrics charts with shadcn/ui Card + Recharts
- [ ] Add domain verification status display with shadcn/ui Table
- [ ] Implement recent events table with shadcn/ui Table
- [ ] Add SES quota visualization with shadcn/ui Progress
- [ ] Build and test production bundle

### Phase 3: Enhanced Features (Week 3)

**Goal**: Add DynamoDB email history and polish UX

- [ ] Implement email history queries from DynamoDB
- [ ] Add detailed event viewer (click on event to see full data)
- [ ] Create domain verification guide UI
- [ ] Add DNS record copy buttons
- [ ] Implement error states and loading indicators
- [ ] Add empty states for new deployments

### Phase 4: Testing & Polish (Week 4)

**Goal**: Ensure reliability and great UX

- [ ] Write tests for AWS service integrations
- [ ] Test graceful shutdown and error recovery
- [ ] Test with multiple AWS accounts/regions
- [ ] Polish UI/UX (animations, transitions)
- [ ] Add comprehensive error messages
- [ ] Update documentation

---

## Detailed Implementation Guide

### Step 1: Create Console Command

**File**: `packages/cli/src/commands/console.ts`

```typescript
import * as clack from '@clack/prompts';
import pc from 'picocolors';
import open from 'open';
import getPort from 'get-port';
import { ConsoleOptions } from '../types/index.js';
import { validateAWSCredentials, getAWSRegion } from '../utils/aws.js';
import { DeploymentProgress } from '../utils/output.js';
import { startConsoleServer } from '../console/server.js';
import { getStackOutputs } from '../utils/pulumi-state.js';

/**
 * Console command - Start local web dashboard
 */
export async function console(options: ConsoleOptions): Promise<void> {
  clack.intro(pc.bold('Wraps Console'));

  const progress = new DeploymentProgress();

  // 1. Validate AWS credentials
  const identity = await progress.execute('Validating AWS credentials', async () => {
    return validateAWSCredentials();
  });

  // 2. Get region
  const region = await getAWSRegion();

  // 3. Load stack outputs to get IAM role ARN
  const outputs = await progress.execute('Loading infrastructure configuration', async () => {
    return getStackOutputs(`wraps-${identity.accountId}-${region}`);
  });

  if (!outputs.roleArn) {
    progress.stop();
    clack.log.error('No Wraps infrastructure found');
    console.log(`\nRun ${pc.cyan('wraps init')} to deploy infrastructure first.\n`);
    process.exit(1);
  }

  // 4. Find available port
  const port = options.port || await getPort({ port: [5555, 5556, 5557, 5558, 5559] });

  // 5. Start server
  progress.stop();
  clack.log.success('Starting console server...');

  const { url, token } = await startConsoleServer({
    port,
    roleArn: outputs.roleArn,
    region,
    tableName: outputs.tableName,
    noOpen: options.noOpen || false,
  });

  console.log(`\n${pc.bold('Console:')} ${pc.cyan(url)}`);
  console.log(`${pc.dim('Press Ctrl+C to stop')}\n`);

  // 6. Open browser (unless --no-open)
  if (!options.noOpen) {
    await open(url);
  }

  // Keep process alive
  await new Promise(() => {});
}
```

**File**: `packages/cli/src/types/index.ts` (add to existing types)

```typescript
/**
 * Command options for console
 */
export interface ConsoleOptions {
  port?: number;
  noOpen?: boolean;
}
```

### Step 2: IAM Role Assumption Utility

**File**: `packages/cli/src/utils/assume-role.ts`

```typescript
import { STSClient, AssumeRoleCommand } from '@aws-sdk/client-sts';
import { AwsCredentialIdentity } from '@aws-sdk/types';

/**
 * Assume IAM role and return temporary credentials
 */
export async function assumeRole(
  roleArn: string,
  region: string,
  sessionName: string = 'wraps-console'
): Promise<AwsCredentialIdentity> {
  const sts = new STSClient({ region });

  const response = await sts.send(
    new AssumeRoleCommand({
      RoleArn: roleArn,
      RoleSessionName: sessionName,
      DurationSeconds: 3600, // 1 hour
    })
  );

  if (!response.Credentials) {
    throw new Error('Failed to assume role: No credentials returned');
  }

  return {
    accessKeyId: response.Credentials.AccessKeyId!,
    secretAccessKey: response.Credentials.SecretAccessKey!,
    sessionToken: response.Credentials.SessionToken!,
    expiration: response.Credentials.Expiration,
  };
}
```

### Step 3: Express Server Setup

**File**: `packages/cli/src/console/server.ts`

```typescript
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { createHttpTerminator } from 'http-terminator';
import { authenticateToken } from './middleware/auth.js';
import { errorHandler } from './middleware/error.js';
import { createMetricsRouter } from './routes/metrics.js';
import { createDomainsRouter } from './routes/domains.js';
import { createEventsRouter } from './routes/events.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface ServerConfig {
  port: number;
  roleArn: string;
  region: string;
  tableName?: string;
  noOpen: boolean;
}

export interface ServerInfo {
  url: string;
  token: string;
}

/**
 * Start console server
 */
export async function startConsoleServer(config: ServerConfig): Promise<ServerInfo> {
  const app = express();

  // Generate auth token
  const authToken = crypto.randomBytes(32).toString('hex');

  // Middleware
  app.use(express.json());

  // Security headers
  app.use((req, res, next) => {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self' 'unsafe-inline' 'unsafe-eval'");
    next();
  });

  // API routes (with authentication)
  app.use('/api/metrics', authenticateToken(authToken), createMetricsRouter(config));
  app.use('/api/domains', authenticateToken(authToken), createDomainsRouter(config));
  app.use('/api/events', authenticateToken(authToken), createEventsRouter(config));

  // Serve static files from console-ui build
  const staticDir = path.join(__dirname, '../console');
  app.use(express.static(staticDir));

  // SPA fallback
  app.get('*', (req, res) => {
    res.sendFile(path.join(staticDir, 'index.html'));
  });

  // Error handler
  app.use(errorHandler);

  // Start server
  const server = app.listen(config.port, '127.0.0.1');

  // Setup graceful shutdown
  const httpTerminator = createHttpTerminator({ server });

  process.on('SIGTERM', async () => {
    console.log('\nShutting down gracefully...');
    await httpTerminator.terminate();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('\nShutting down gracefully...');
    await httpTerminator.terminate();
    process.exit(0);
  });

  const url = `http://localhost:${config.port}?token=${authToken}`;

  return { url, token: authToken };
}
```

### Step 4: Authentication Middleware

**File**: `packages/cli/src/console/middleware/auth.ts`

```typescript
import { Request, Response, NextFunction } from 'express';

/**
 * Token-based authentication middleware
 */
export function authenticateToken(expectedToken: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Get token from query param or header
    const token = req.query.token || req.headers['x-auth-token'];

    if (!token || token !== expectedToken) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    next();
  };
}
```

### Step 5: CloudWatch Metrics Service

**File**: `packages/cli/src/console/services/aws-metrics.ts`

```typescript
import { CloudWatchClient, GetMetricDataCommand, MetricDataQuery } from '@aws-sdk/client-cloudwatch';
import { assumeRole } from '../../utils/assume-role.js';

export interface MetricsData {
  sends: Array<{ timestamp: number; value: number }>;
  bounces: Array<{ timestamp: number; value: number }>;
  complaints: Array<{ timestamp: number; value: number }>;
  deliveries: Array<{ timestamp: number; value: number }>;
  opens: Array<{ timestamp: number; value: number }>;
  clicks: Array<{ timestamp: number; value: number }>;
}

/**
 * Fetch SES metrics from CloudWatch
 */
export async function fetchSESMetrics(
  roleArn: string,
  region: string,
  timeRange: { start: Date; end: Date }
): Promise<MetricsData> {
  // Assume role
  const credentials = await assumeRole(roleArn, region);

  // Create CloudWatch client
  const cloudwatch = new CloudWatchClient({ region, credentials });

  // Define metric queries
  const queries: MetricDataQuery[] = [
    {
      Id: 'sends',
      MetricStat: {
        Metric: {
          Namespace: 'AWS/SES',
          MetricName: 'Send',
        },
        Period: 300, // 5 minutes
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
  ];

  // Fetch metrics
  const response = await cloudwatch.send(
    new GetMetricDataCommand({
      MetricDataQueries: queries,
      StartTime: timeRange.start,
      EndTime: timeRange.end,
    })
  );

  // Parse results
  const results = response.MetricDataResults || [];

  const parseMetric = (id: string) => {
    const metric = results.find((r) => r.Id === id);
    if (!metric || !metric.Timestamps || !metric.Values) {
      return [];
    }

    return metric.Timestamps.map((timestamp, i) => ({
      timestamp: timestamp.getTime(),
      value: metric.Values![i] || 0,
    }));
  };

  return {
    sends: parseMetric('sends'),
    bounces: parseMetric('bounces'),
    complaints: parseMetric('complaints'),
    deliveries: parseMetric('deliveries'),
    opens: [], // Not available in CloudWatch by default
    clicks: [], // Not available in CloudWatch by default
  };
}
```

### Step 6: SES Service

**File**: `packages/cli/src/console/services/ses-service.ts`

```typescript
import { SESClient, GetSendStatisticsCommand, GetSendQuotaCommand } from '@aws-sdk/client-ses';
import { SESv2Client, GetEmailIdentityCommand } from '@aws-sdk/client-sesv2';
import { assumeRole } from '../../utils/assume-role.js';

export interface SendQuota {
  max24HourSend: number;
  maxSendRate: number;
  sentLast24Hours: number;
}

export interface DomainInfo {
  domain: string;
  verified: boolean;
  dkimStatus: string;
  dkimTokens: string[];
}

/**
 * Fetch SES send quota
 */
export async function fetchSendQuota(roleArn: string, region: string): Promise<SendQuota> {
  const credentials = await assumeRole(roleArn, region);
  const ses = new SESClient({ region, credentials });

  const response = await ses.send(new GetSendQuotaCommand({}));

  return {
    max24HourSend: response.Max24HourSend || 0,
    maxSendRate: response.MaxSendRate || 0,
    sentLast24Hours: response.SentLast24Hours || 0,
  };
}

/**
 * Fetch domain verification status
 */
export async function fetchDomainInfo(
  roleArn: string,
  region: string,
  domain: string
): Promise<DomainInfo> {
  const credentials = await assumeRole(roleArn, region);
  const sesv2 = new SESv2Client({ region, credentials });

  const response = await sesv2.send(
    new GetEmailIdentityCommand({
      EmailIdentity: domain,
    })
  );

  return {
    domain,
    verified: response.VerifiedForSendingStatus || false,
    dkimStatus: response.DkimAttributes?.Status || 'PENDING',
    dkimTokens: response.DkimAttributes?.Tokens || [],
  };
}
```

### Step 7: SSE Metrics Endpoint

**File**: `packages/cli/src/console/routes/metrics.ts`

```typescript
import { Router, Request, Response } from 'express';
import { ServerConfig } from '../server.js';
import { fetchSESMetrics } from '../services/aws-metrics.js';
import { fetchSendQuota } from '../services/ses-service.js';

export function createMetricsRouter(config: ServerConfig): Router {
  const router = Router();

  /**
   * SSE endpoint for real-time metrics
   */
  router.get('/stream', async (req: Request, res: Response) => {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Send initial connection event
    res.write('data: {"type":"connected"}\n\n');

    // Function to fetch and send metrics
    const sendMetrics = async () => {
      try {
        // Fetch last 24 hours of metrics
        const timeRange = {
          start: new Date(Date.now() - 24 * 60 * 60 * 1000),
          end: new Date(),
        };

        const [metrics, quota] = await Promise.all([
          fetchSESMetrics(config.roleArn, config.region, timeRange),
          fetchSendQuota(config.roleArn, config.region),
        ]);

        const data = {
          type: 'metrics',
          timestamp: Date.now(),
          metrics,
          quota,
        };

        res.write(`data: ${JSON.stringify(data)}\n\n`);
      } catch (error: any) {
        res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
      }
    };

    // Send immediately on connect
    await sendMetrics();

    // Poll every 60 seconds
    const interval = setInterval(sendMetrics, 60000);

    // Clean up on disconnect
    req.on('close', () => {
      clearInterval(interval);
    });
  });

  /**
   * Get current metrics snapshot (REST endpoint)
   */
  router.get('/snapshot', async (req: Request, res: Response) => {
    try {
      const timeRange = {
        start: new Date(Date.now() - 24 * 60 * 60 * 1000),
        end: new Date(),
      };

      const [metrics, quota] = await Promise.all([
        fetchSESMetrics(config.roleArn, config.region, timeRange),
        fetchSendQuota(config.roleArn, config.region),
      ]);

      res.json({ metrics, quota });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
```

### Step 8: Frontend Setup (Vite + React)

**File**: `packages/cli/console-ui/vite.config.ts`

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../dist/console',
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:5555',
        changeOrigin: true,
      },
    },
  },
});
```

**File**: `packages/cli/console-ui/package.json`

```json
{
  "name": "wraps-console-ui",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "recharts": "^2.10.0",
    "date-fns": "^3.0.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.43",
    "@types/react-dom": "^18.2.17",
    "@vitejs/plugin-react": "^4.2.0",
    "typescript": "^5.3.3",
    "vite": "^5.0.0"
  }
}
```

### Step 9: SSE Hook (React)

**File**: `packages/cli/console-ui/src/hooks/useSSE.ts`

```typescript
import { useEffect, useState, useRef } from 'react';

export interface SSEMessage<T = any> {
  type: string;
  data: T;
}

export function useSSE<T = any>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // Get token from URL params
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');

    if (!token) {
      setError(new Error('Authentication token not found'));
      return;
    }

    // Create EventSource with token
    const eventSource = new EventSource(`${url}?token=${token}`);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setIsConnected(true);
      setError(null);
    };

    eventSource.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        
        if (message.type === 'error') {
          setError(new Error(message.error));
        } else {
          setData(message);
        }
      } catch (err) {
        setError(err as Error);
      }
    };

    eventSource.onerror = () => {
      setIsConnected(false);
      setError(new Error('Connection lost'));
    };

    // Cleanup
    return () => {
      eventSource.close();
    };
  }, [url]);

  return { data, error, isConnected };
}
```

### Step 10: Metrics Chart Component

**File**: `packages/cli/console-ui/src/components/MetricsChart.tsx`

```typescript
import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { format } from 'date-fns';

interface MetricsChartProps {
  data: {
    sends: Array<{ timestamp: number; value: number }>;
    bounces: Array<{ timestamp: number; value: number }>;
    complaints: Array<{ timestamp: number; value: number }>;
    deliveries: Array<{ timestamp: number; value: number }>;
  };
}

export function MetricsChart({ data }: MetricsChartProps) {
  // Merge all metrics by timestamp
  const mergedData = mergeMetrics(data);

  return (
    <div className="metrics-chart">
      <h2>Email Metrics (Last 24 Hours)</h2>
      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={mergedData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="timestamp"
            tickFormatter={(timestamp) => format(new Date(timestamp), 'HH:mm')}
          />
          <YAxis />
          <Tooltip
            labelFormatter={(timestamp) => format(new Date(timestamp), 'MMM d, HH:mm')}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="sends"
            stroke="#8884d8"
            name="Sends"
            strokeWidth={2}
          />
          <Line
            type="monotone"
            dataKey="deliveries"
            stroke="#82ca9d"
            name="Deliveries"
            strokeWidth={2}
          />
          <Line
            type="monotone"
            dataKey="bounces"
            stroke="#ff7300"
            name="Bounces"
            strokeWidth={2}
          />
          <Line
            type="monotone"
            dataKey="complaints"
            stroke="#ff0000"
            name="Complaints"
            strokeWidth={2}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function mergeMetrics(data: MetricsChartProps['data']) {
  const timestampMap = new Map<number, any>();

  // Add all timestamps
  [...data.sends, ...data.bounces, ...data.complaints, ...data.deliveries].forEach((point) => {
    if (!timestampMap.has(point.timestamp)) {
      timestampMap.set(point.timestamp, {
        timestamp: point.timestamp,
        sends: 0,
        bounces: 0,
        complaints: 0,
        deliveries: 0,
      });
    }
  });

  // Fill in values
  data.sends.forEach((point) => {
    timestampMap.get(point.timestamp)!.sends = point.value;
  });
  data.bounces.forEach((point) => {
    timestampMap.get(point.timestamp)!.bounces = point.value;
  });
  data.complaints.forEach((point) => {
    timestampMap.get(point.timestamp)!.complaints = point.value;
  });
  data.deliveries.forEach((point) => {
    timestampMap.get(point.timestamp)!.deliveries = point.value;
  });

  // Sort by timestamp
  return Array.from(timestampMap.values()).sort((a, b) => a.timestamp - b.timestamp);
}
```

### Step 11: Main App Component

**File**: `packages/cli/console-ui/src/App.tsx`

```typescript
import React from 'react';
import { useSSE } from './hooks/useSSE';
import { MetricsChart } from './components/MetricsChart';
import { QuotaDisplay } from './components/QuotaDisplay';
import { DomainStatus } from './components/DomainStatus';
import './App.css';

interface MetricsData {
  type: 'metrics';
  timestamp: number;
  metrics: {
    sends: Array<{ timestamp: number; value: number }>;
    bounces: Array<{ timestamp: number; value: number }>;
    complaints: Array<{ timestamp: number; value: number }>;
    deliveries: Array<{ timestamp: number; value: number }>;
  };
  quota: {
    max24HourSend: number;
    maxSendRate: number;
    sentLast24Hours: number;
  };
}

export default function App() {
  const { data, error, isConnected } = useSSE<MetricsData>('/api/metrics/stream');

  if (error) {
    return (
      <div className="error">
        <h1>Connection Error</h1>
        <p>{error.message}</p>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="loading">
        <h1>Connecting to Wraps Console...</h1>
      </div>
    );
  }

  if (!data || data.type !== 'metrics') {
    return (
      <div className="loading">
        <h1>Loading metrics...</h1>
      </div>
    );
  }

  return (
    <div className="app">
      <header>
        <h1>Wraps Console</h1>
        <div className="connection-status">
          <span className="status-indicator connected" />
          <span>Live</span>
        </div>
      </header>

      <main>
        <section className="quota-section">
          <QuotaDisplay quota={data.quota} />
        </section>

        <section className="metrics-section">
          <MetricsChart data={data.metrics} />
        </section>

        <section className="domains-section">
          <DomainStatus />
        </section>
      </main>
    </div>
  );
}
```

### Step 12: Register Console Command

**File**: `packages/cli/src/cli.ts` (update)

```typescript
import { console as consoleCommand } from './commands/console.js';

// ... existing code ...

async function run() {
  try {
    switch (command) {
      // ... existing cases ...

      case 'console':
        await consoleCommand({
          port: flags.port,
          noOpen: flags.noOpen,
        });
        break;

      // ... rest of cases ...
    }
  } catch (error) {
    handleCLIError(error);
  }
}
```

---

## API Endpoints

### Server-Sent Events

**GET /api/metrics/stream**

Real-time metrics streaming endpoint.

**Query Parameters:**
- `token` (required): Authentication token

**Response Format (SSE):**
```
data: {"type":"connected"}\n\n

data: {"type":"metrics","timestamp":1234567890,"metrics":{...},"quota":{...}}\n\n
```

### REST Endpoints

**GET /api/metrics/snapshot**

Get current metrics snapshot.

**Response:**
```json
{
  "metrics": {
    "sends": [{"timestamp": 1234567890, "value": 100}],
    "bounces": [...],
    "complaints": [...],
    "deliveries": [...]
  },
  "quota": {
    "max24HourSend": 50000,
    "maxSendRate": 14,
    "sentLast24Hours": 1234
  }
}
```

**GET /api/domains/:domain**

Get domain verification status.

**Response:**
```json
{
  "domain": "example.com",
  "verified": true,
  "dkimStatus": "SUCCESS",
  "dkimTokens": ["token1", "token2", "token3"]
}
```

**GET /api/events**

Get recent email events from DynamoDB.

**Query Parameters:**
- `limit` (default: 100): Number of events to return
- `startTime` (optional): Start timestamp
- `endTime` (optional): End timestamp

**Response:**
```json
{
  "events": [
    {
      "messageId": "...",
      "sentAt": 1234567890,
      "from": "sender@example.com",
      "to": ["recipient@example.com"],
      "subject": "Test Email",
      "eventType": "Send",
      "eventData": {...}
    }
  ]
}
```

---

## Frontend Components

### Core Components

Built with **shadcn/ui** for consistent, accessible design:

1. **MetricsChart** - Line chart showing sends, deliveries, bounces, complaints over time
   - Uses Recharts for visualization
   - shadcn/ui Card component for container

2. **QuotaDisplay** - Gauge/progress bar showing SES quota usage
   - shadcn/ui Progress component
   - shadcn/ui Badge for status indicators

3. **DomainStatus** - List of domains with verification status
   - shadcn/ui Table component
   - shadcn/ui Badge for verification status
   - shadcn/ui Button for copy actions

4. **RecentEvents** - Table of recent email events
   - shadcn/ui Table component with sorting
   - shadcn/ui Dialog for event details

5. **ConnectionIndicator** - Visual indicator of SSE connection status
   - Custom component with Lucide React icons
   - shadcn/ui Badge for status

### shadcn/ui Components to Install

```bash
# Initial setup
npx shadcn@latest init

# Install required components
npx shadcn@latest add card
npx shadcn@latest add table
npx shadcn@latest add badge
npx shadcn@latest add button
npx shadcn@latest add progress
npx shadcn@latest add dialog
npx shadcn@latest add skeleton
npx shadcn@latest add alert
npx shadcn@latest add tooltip
```

### Component Hierarchy

```
App
├── Header
│   ├── Logo
│   └── ConnectionIndicator (Badge + Lucide icons)
├── QuotaDisplay (Card + Progress)
├── MetricsChart (Card + Recharts)
├── DomainStatus (Card + Table)
│   └── DomainCard (Card + Badge + Button)
└── RecentEvents (Card + Table + Dialog)
    └── EventRow (Table Row)
```

---

## shadcn/ui Setup & Configuration

### Monorepo Setup with Tailwind v4

Following shadcn/ui monorepo guide with Tailwind CSS v4.

### Initial Setup

**File**: `packages/ui/components.json` (Shared UI Package)

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/styles/globals.css",
    "baseColor": "slate",
    "cssVariables": true
  },
  "aliases": {
    "components": "@wraps/ui/components",
    "utils": "@wraps/ui/lib/utils",
    "hooks": "@wraps/ui/hooks",
    "lib": "@wraps/ui/lib",
    "ui": "@wraps/ui/components/ui"
  }
}
```

**Note**: For Tailwind v4, leave the `config` field empty (no tailwind.config.ts needed)

**File**: `packages/console-ui/components.json` (Dashboard App)

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "../../ui/src/styles/globals.css",
    "baseColor": "slate",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "hooks": "@/hooks",
    "lib": "@/lib",
    "utils": "@wraps/ui/lib/utils",
    "ui": "@wraps/ui/components/ui"
  }
}
```

**File**: `packages/ui/src/styles/globals.css` (Tailwind v4 CSS-First Configuration)

```css
@import "tailwindcss";

/* Light mode colors */
:root {
  --background: hsl(0 0% 100%);
  --foreground: hsl(222.2 84% 4.9%);
  --card: hsl(0 0% 100%);
  --card-foreground: hsl(222.2 84% 4.9%);
  --popover: hsl(0 0% 100%);
  --popover-foreground: hsl(222.2 84% 4.9%);
  --primary: hsl(222.2 47.4% 11.2%);
  --primary-foreground: hsl(210 40% 98%);
  --secondary: hsl(210 40% 96.1%);
  --secondary-foreground: hsl(222.2 47.4% 11.2%);
  --muted: hsl(210 40% 96.1%);
  --muted-foreground: hsl(215.4 16.3% 46.9%);
  --accent: hsl(210 40% 96.1%);
  --accent-foreground: hsl(222.2 47.4% 11.2%);
  --destructive: hsl(0 84.2% 60.2%);
  --destructive-foreground: hsl(210 40% 98%);
  --border: hsl(214.3 31.8% 91.4%);
  --input: hsl(214.3 31.8% 91.4%);
  --ring: hsl(222.2 84% 4.9%);
  --radius: 0.5rem;
}

/* Dark mode colors */
.dark {
  --background: hsl(222.2 84% 4.9%);
  --foreground: hsl(210 40% 98%);
  --card: hsl(222.2 84% 4.9%);
  --card-foreground: hsl(210 40% 98%);
  --popover: hsl(222.2 84% 4.9%);
  --popover-foreground: hsl(210 40% 98%);
  --primary: hsl(210 40% 98%);
  --primary-foreground: hsl(222.2 47.4% 11.2%);
  --secondary: hsl(217.2 32.6% 17.5%);
  --secondary-foreground: hsl(210 40% 98%);
  --muted: hsl(217.2 32.6% 17.5%);
  --muted-foreground: hsl(215 20.2% 65.1%);
  --accent: hsl(217.2 32.6% 17.5%);
  --accent-foreground: hsl(210 40% 98%);
  --destructive: hsl(0 62.8% 30.6%);
  --destructive-foreground: hsl(210 40% 98%);
  --border: hsl(217.2 32.6% 17.5%);
  --input: hsl(217.2 32.6% 17.5%);
  --ring: hsl(212.7 26.8% 83.9%);
}

/* Tailwind v4 @theme directive for CSS variables */
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --radius: var(--radius);
}

* {
  border-color: hsl(var(--border));
}

body {
  background-color: hsl(var(--background));
  color: hsl(var(--foreground));
}
```

**File**: `packages/ui/src/lib/utils.ts`

```typescript
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

### Vite Configuration

**File**: `packages/console-ui/vite.config.ts`

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@wraps/ui': path.resolve(__dirname, '../ui/src'),
    },
  },
  build: {
    outDir: '../cli/dist/console',
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:5555',
        changeOrigin: true,
      },
    },
  },
  css: {
    postcss: {
      plugins: [
        require('tailwindcss'),
      ],
    },
  },
});
```

### TypeScript Configuration

**File**: `packages/ui/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@wraps/ui/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

**File**: `packages/console-ui/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"],
      "@wraps/ui/*": ["../ui/src/*"]
    }
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

### Installing shadcn/ui Components

Run these commands from the `packages/ui` directory:

```bash
cd packages/ui

# Initialize shadcn/ui (will create components.json if not exists)
npx shadcn@latest init

# Add components (they'll be installed in packages/ui/src/components/ui/)
npx shadcn@latest add card
npx shadcn@latest add table
npx shadcn@latest add badge
npx shadcn@latest add button
npx shadcn@latest add progress
npx shadcn@latest add dialog
npx shadcn@latest add skeleton
npx shadcn@latest add alert
npx shadcn@latest add tooltip
```

These components will be shared across all workspace packages.

### Example: Metrics Chart with shadcn/ui

**File**: `packages/console-ui/src/components/MetricsChart.tsx`

```typescript
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@wraps/ui/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';

interface MetricsChartProps {
  data: {
    sends: Array<{ timestamp: number; value: number }>;
    bounces: Array<{ timestamp: number; value: number }>;
    complaints: Array<{ timestamp: number; value: number }>;
    deliveries: Array<{ timestamp: number; value: number }>;
  };
}

export function MetricsChart({ data }: MetricsChartProps) {
  const mergedData = mergeMetrics(data);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Email Metrics</CardTitle>
        <CardDescription>Performance over the last 24 hours</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={mergedData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="timestamp"
              tickFormatter={(timestamp) => format(new Date(timestamp), 'HH:mm')}
              className="text-xs"
            />
            <YAxis className="text-xs" />
            <Tooltip
              labelFormatter={(timestamp) => format(new Date(timestamp), 'MMM d, HH:mm')}
              contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))' }}
            />
            <Legend />
            <Line type="monotone" dataKey="sends" stroke="hsl(var(--primary))" name="Sends" strokeWidth={2} />
            <Line type="monotone" dataKey="deliveries" stroke="#82ca9d" name="Deliveries" strokeWidth={2} />
            <Line type="monotone" dataKey="bounces" stroke="#ff7300" name="Bounces" strokeWidth={2} />
            <Line type="monotone" dataKey="complaints" stroke="hsl(var(--destructive))" name="Complaints" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function mergeMetrics(data: MetricsChartProps['data']) {
  const timestampMap = new Map<number, any>();

  [...data.sends, ...data.bounces, ...data.complaints, ...data.deliveries].forEach((point) => {
    if (!timestampMap.has(point.timestamp)) {
      timestampMap.set(point.timestamp, {
        timestamp: point.timestamp,
        sends: 0,
        bounces: 0,
        complaints: 0,
        deliveries: 0,
      });
    }
  });

  data.sends.forEach((point) => {
    timestampMap.get(point.timestamp)!.sends = point.value;
  });
  data.bounces.forEach((point) => {
    timestampMap.get(point.timestamp)!.bounces = point.value;
  });
  data.complaints.forEach((point) => {
    timestampMap.get(point.timestamp)!.complaints = point.value;
  });
  data.deliveries.forEach((point) => {
    timestampMap.get(point.timestamp)!.deliveries = point.value;
  });

  return Array.from(timestampMap.values()).sort((a, b) => a.timestamp - b.timestamp);
}
```

### Example: Quota Display with shadcn/ui

**File**: `packages/console-ui/src/components/QuotaDisplay.tsx`

```typescript
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@wraps/ui/components/ui/card';
import { Progress } from '@wraps/ui/components/ui/progress';
import { Badge } from '@wraps/ui/components/ui/badge';

interface QuotaDisplayProps {
  quota: {
    max24HourSend: number;
    maxSendRate: number;
    sentLast24Hours: number;
  };
}

export function QuotaDisplay({ quota }: QuotaDisplayProps) {
  const usagePercent = (quota.sentLast24Hours / quota.max24HourSend) * 100;
  const status = usagePercent > 90 ? 'destructive' : usagePercent > 70 ? 'warning' : 'default';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          SES Quota
          <Badge variant={status === 'destructive' ? 'destructive' : 'secondary'}>
            {usagePercent.toFixed(1)}% used
          </Badge>
        </CardTitle>
        <CardDescription>24-hour sending limits</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="flex justify-between text-sm mb-2">
            <span className="text-muted-foreground">Emails sent</span>
            <span className="font-medium">
              {quota.sentLast24Hours.toLocaleString()} / {quota.max24HourSend.toLocaleString()}
            </span>
          </div>
          <Progress value={usagePercent} className="h-2" />
        </div>

        <div className="flex justify-between items-center pt-2 border-t">
          <span className="text-sm text-muted-foreground">Max send rate</span>
          <span className="text-sm font-medium">{quota.maxSendRate} emails/sec</span>
        </div>
      </CardContent>
    </Card>
  );
}
```

---

## AWS Integration

### IAM Role Requirements

The IAM role created by `wraps init` must have these permissions for the console:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "cloudwatch:GetMetricData",
        "cloudwatch:ListMetrics"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ses:GetSendStatistics",
        "ses:GetSendQuota",
        "ses:ListIdentities"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ses:GetEmailIdentity",
        "ses:GetAccount"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:Query",
        "dynamodb:Scan"
      ],
      "Resource": "arn:aws:dynamodb:*:*:table/wraps-email-*"
    }
  ]
}
```

### Credential Flow

1. User runs `wraps console`
2. CLI validates AWS credentials (local AWS CLI credentials)
3. CLI loads IAM role ARN from Pulumi state
4. Console server uses STS AssumeRole with local credentials
5. Server receives temporary credentials (1 hour expiration)
6. Server uses temporary credentials to access CloudWatch/SES/DynamoDB
7. Temporary credentials auto-refresh when expired

---

## Testing Strategy

### Unit Tests

**Test Files to Create:**

1. `packages/cli/src/console/services/__tests__/aws-metrics.test.ts`
   - Test CloudWatch metric parsing
   - Test error handling for missing metrics
   - Mock AWS SDK responses

2. `packages/cli/src/console/services/__tests__/ses-service.test.ts`
   - Test quota fetching
   - Test domain status parsing
   - Mock SES API responses

3. `packages/cli/src/utils/__tests__/assume-role.test.ts`
   - Test role assumption
   - Test credential expiration handling
   - Mock STS responses

### Integration Tests

**Test Scenarios:**

1. **Server Startup**
   - Server starts successfully on available port
   - Static files are served correctly
   - Authentication middleware works

2. **AWS Integration**
   - Role assumption succeeds with valid credentials
   - CloudWatch metrics fetch successfully
   - SES quota fetch succeeds
   - DynamoDB queries work

3. **SSE Connection**
   - Client connects successfully
   - Metrics are streamed at correct interval
   - Connection closes gracefully
   - Reconnection works after disconnect

### Manual Testing Checklist

- [ ] Run `wraps console` with valid infrastructure
- [ ] Verify browser opens automatically
- [ ] Check metrics load and update every 60 seconds
- [ ] Verify quota display shows correct values
- [ ] Test with domain that needs verification
- [ ] Test with verified domain
- [ ] Test graceful shutdown (Ctrl+C)
- [ ] Test with multiple AWS accounts
- [ ] Test with different regions
- [ ] Test error states (invalid role ARN, no permissions, etc.)

---

## Success Criteria

### Week 1 (Core Infrastructure)

- [ ] `wraps console` command starts Express server
- [ ] SSE endpoint streams mock data to browser
- [ ] Token authentication works correctly
- [ ] Server binds to localhost only (127.0.0.1)
- [ ] IAM role assumption succeeds
- [ ] CloudWatch metrics fetch successfully
- [ ] Browser opens automatically with token

### Week 2 (Frontend Dashboard)

- [ ] React app loads in browser
- [ ] SSE connection established from frontend
- [ ] Metrics chart displays real CloudWatch data
- [ ] Quota display shows current SES limits
- [ ] Connection indicator shows live status
- [ ] UI updates in real-time (60-second intervals)
- [ ] Production build completes successfully

### Week 3 (Enhanced Features)

- [ ] DynamoDB email history displays
- [ ] Domain verification status shows correctly
- [ ] DKIM tokens display for pending domains
- [ ] Recent events table works
- [ ] Copy-to-clipboard for DNS records works
- [ ] Error states display properly
- [ ] Empty states for new deployments

### Week 4 (Polish & Testing)

- [ ] All unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing checklist complete
- [ ] Error messages are helpful
- [ ] Documentation updated
- [ ] Performance is acceptable (page load <2s)
- [ ] No memory leaks after hours of running

---

## Implementation Priorities

### Must Have (MVP)

1. ✅ Console command that starts local server
2. ✅ Token-based authentication
3. ✅ SSE endpoint for metrics streaming
4. ✅ CloudWatch metrics integration
5. ✅ SES quota display
6. ✅ Basic React UI with charts
7. ✅ Graceful shutdown
8. ✅ Browser auto-open

### Should Have (Week 2-3)

9. Domain verification status
10. DNS record display
11. DynamoDB email history
12. Recent events table
13. Error states and loading indicators
14. Empty states

### Could Have (Future)

15. Domain verification flow in UI
16. Email preview (for stored emails)
17. Detailed event viewer (modal)
18. Export metrics as CSV
19. Webhook configuration UI
20. Multi-account switching
21. Hosted console option (like SST)

---

## Known Limitations

1. **No Real-Time Events** - Email events require DynamoDB queries, not available in real-time through CloudWatch
2. **CloudWatch Latency** - Metrics have ~5-10 minute delay from AWS
3. **Polling Only** - No true real-time streaming, relies on 60-second polling
4. **Single Region** - Console connects to one region at a time
5. **Browser Required** - No CLI-only dashboard option
6. **Credential Expiration** - Temporary credentials expire after 1 hour, requires restart

---

## Future Enhancements

### Phase 5: Hosted Console (like SST)

**See**: `wraps-hosted-dashboard-expansion.md` for detailed architecture and implementation plan.

**Key Insight**: The local console architecture is designed for this transition. 80% of the code (AWS services, React components, API patterns) will be reused. The IAM role pattern works identically - no security redesign needed.

**Hosted Architecture Overview**:
- Deploy console as hosted web app at `console.wraps.dev`
- Users authenticate with email/password or OAuth
- Reuse existing IAM role pattern (users grant hosted backend access to their AWS account)
- Same AWS service layer - just different context for getting roleArn and region
- Add team collaboration, historical data storage (PostgreSQL), and billing (Stripe)

**Timeline**: 3-4 months from local MVP to hosted MVP (Months 4-7)

**Business Model**:
- **Free tier**: Local console (current implementation) - Forever free
- **Starter ($20/mo)**: Hosted dashboard + templates + batch sending
- **Pro ($49/mo)**: Team collaboration (up to 10) + multi-account (up to 3) + A/B testing
- **Enterprise ($399/mo)**: SSO/SAML + compliance + unlimited scale + audit logs

See `wraps-pricing-corrected.md` for detailed pricing strategy and competitive analysis.

**No Vendor Lock-In**: Even hosted users own their infrastructure. If they churn, their email keeps working - they just lose the dashboard. This is a unique selling point vs. Resend/Postmark.

---

### Phase 6: Advanced Features (Post-Hosted Launch)

**When**: After hosted console has product-market fit (Months 8-12)

- Email template preview
- A/B testing dashboard
- Deliverability insights
- Domain reputation monitoring
- Automated DNS verification
- Custom metric dashboards
- Webhook testing UI

---

## Implementation Notes

### Key Learnings from Research

1. **Start Simple** - Drizzle and SST both started with minimal features
2. **Local First** - Easier to validate product-market fit without infrastructure costs
3. **SSE > WebSocket** - For one-way streaming, SSE is simpler and more reliable
4. **Poll AWS APIs** - CloudWatch doesn't support streaming, polling is the only option
5. **Token Auth Essential** - Even for localhost, prevent cross-process access
6. **Graceful Shutdown** - Critical for long-running CLI processes
7. **Pre-Build Frontend** - Vite build during package publish keeps CLI distribution fast

### Debugging Tips

- Use `DEBUG=express:*` to see Express routing
- Check browser DevTools Network tab for SSE connection
- Monitor AWS CloudWatch API costs during development
- Use `--no-open` flag to prevent browser auto-open during debugging
- Test with `curl http://localhost:5555/api/metrics/snapshot?token=TOKEN` for server-side debugging

---

## Acceptance Criteria

**User Story**: As a Wraps user, I want to monitor my email infrastructure in real-time so that I can ensure emails are being delivered successfully.

**Acceptance Criteria:**

1. When I run `wraps console`, a browser opens showing my email metrics
2. I can see send rate, bounce rate, and complaint rate for the last 24 hours
3. Metrics update automatically every 60 seconds without page refresh
4. I can see my current SES quota and usage
5. I can see verification status for all my domains
6. If domains are pending verification, I see DKIM tokens
7. The console runs on my local machine (127.0.0.1)
8. When I press Ctrl+C, the console shuts down gracefully
9. If I don't have infrastructure deployed, I get a helpful error message
10. The console works with all AWS regions

---

## Appendix: File Checklist

### New Files (Total: 25)

#### Backend (13 files)

- [ ] `src/commands/console.ts`
- [ ] `src/console/server.ts`
- [ ] `src/console/routes/metrics.ts`
- [ ] `src/console/routes/domains.ts`
- [ ] `src/console/routes/events.ts`
- [ ] `src/console/services/aws-metrics.ts`
- [ ] `src/console/services/ses-service.ts`
- [ ] `src/console/services/dynamodb-service.ts`
- [ ] `src/console/middleware/auth.ts`
- [ ] `src/console/middleware/error.ts`
- [ ] `src/utils/assume-role.ts`
- [ ] `src/utils/pulumi-state.ts`
- [ ] `src/types/index.ts` (update existing)

#### Frontend (12 files)

- [ ] `console-ui/src/App.tsx`
- [ ] `console-ui/src/App.css`
- [ ] `console-ui/src/main.tsx`
- [ ] `console-ui/src/components/MetricsChart.tsx`
- [ ] `console-ui/src/components/QuotaDisplay.tsx`
- [ ] `console-ui/src/components/DomainStatus.tsx`
- [ ] `console-ui/src/components/RecentEvents.tsx`
- [ ] `console-ui/src/components/ConnectionIndicator.tsx`
- [ ] `console-ui/src/hooks/useSSE.ts`
- [ ] `console-ui/src/utils/api.ts`
- [ ] `console-ui/vite.config.ts`
- [ ] `console-ui/package.json`
- [ ] `console-ui/index.html`
- [ ] `console-ui/tsconfig.json`

#### Configuration & Tests

- [ ] Update `packages/cli/package.json` (dependencies)
- [ ] Update `packages/cli/src/cli.ts` (register command)
- [ ] Add tests for AWS services
- [ ] Add tests for SSE endpoint
- [ ] Add tests for authentication middleware

---

## Getting Started

**To implement the Wraps Console, follow this order:**

1. **Set up package dependencies**
   - Add Express, Vite, React, Recharts
   - Install Tailwind CSS dependencies
   - Install shadcn/ui utilities (clsx, tailwind-merge, class-variance-authority, lucide-react)

2. **Create server infrastructure**
   - Express server, authentication, routes
   - SSE endpoint for real-time metrics

3. **Add AWS integration**
   - IAM role assumption, CloudWatch polling
   - SES and DynamoDB services

4. **Build frontend structure**
   - Vite + React setup with TypeScript
   - Configure Tailwind CSS (tailwind.config.ts, postcss.config.js)
   - Set up shadcn/ui (run `npx shadcn@latest init`)
   - Install required shadcn/ui components
   - Create SSE hook for real-time updates

5. **Implement core components**
   - MetricsChart with shadcn/ui Card + Recharts
   - QuotaDisplay with shadcn/ui Progress + Badge
   - DomainStatus with shadcn/ui Table
   - RecentEvents with shadcn/ui Table + Dialog
   - ConnectionIndicator with shadcn/ui Badge

6. **Test end-to-end**
   - Deploy infrastructure with `wraps init`
   - Run `wraps console`
   - Verify metrics load and update every 60 seconds
   - Test all UI interactions

7. **Polish UX**
   - Add loading states (shadcn/ui Skeleton)
   - Error handling (shadcn/ui Alert)
   - Empty states for new deployments
   - Dark mode support (already included with shadcn/ui)

8. **Write tests**
   - Unit tests for AWS services
   - Integration tests for server
   - Component tests for React UI

9. **Update documentation**
   - README with shadcn/ui setup
   - CLAUDE.md with console usage
   - Add screenshots of dashboard

**Time Estimate**: 3-4 weeks for full implementation

**MVP Time Estimate**: 1-2 weeks (basic metrics + quota display with shadcn/ui)

**Quick Start Commands**:

```bash
# From project root:

# 1. Install all workspace dependencies
pnpm install

# 2. Set up shared UI package with shadcn/ui
cd packages/ui
npx shadcn@latest init
# Select: "New York" style, CSS variables: yes, Base color: slate

# 3. Install shadcn/ui components (in packages/ui)
npx shadcn@latest add card table badge button progress dialog skeleton alert tooltip

# 4. Return to root and start development server
cd ../..
pnpm dev  # Starts console-ui dev server

# 5. Build all packages for production
pnpm build  # Builds ui -> console-ui -> cli in correct order
```

**Important Notes for Tailwind v4**:

- No `tailwind.config.ts` needed - configuration is in CSS with `@import "tailwindcss"` and `@theme inline`
- Use `tw-animate-css` instead of deprecated `tailwindcss-animate`
- Colors should use `hsl()` format directly in CSS variables
- React 19 requires `react-is` override in root package.json
- Recharts 2.15.1 is the latest stable (v3 still in migration)
