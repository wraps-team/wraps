# Wraps Comprehensive Strategy: Pricing, Product, & Implementation

**Last Updated**: November 6, 2025

**Core Insight**: Wraps charges for **tooling, DX, and unified dashboard access** - not infrastructure (users pay AWS directly). As users adopt more services, the unified dashboard becomes exponentially more valuable.

---

## Table of Contents

1. [Pricing Philosophy](#pricing-philosophy)
2. [Pricing Tiers](#pricing-tiers)
3. [Service Rollout Timeline](#service-rollout-timeline)
4. [Hosted Dashboard Architecture](#hosted-dashboard-architecture)
5. [Implementation Roadmap](#implementation-roadmap)
6. [AWS Cost Examples](#aws-cost-examples)
7. [Competitive Analysis](#competitive-analysis)
8. [Revenue Projections](#revenue-projections)
9. [Key Decisions & Rationale](#key-decisions--rationale)

---

## Pricing Philosophy

### What You're Selling

**NOT selling**: AWS services (users pay AWS directly)

**Selling**: 
1. **Great DX** - Simple SDKs that wrap AWS complexity
2. **Unified dashboard** - One place to manage email, SMS, queues, IoT
3. **Developer productivity** - Templates, batch operations, testing tools
4. **Team collaboration** - Share access, audit logs, approval workflows

### Multi-Service Value Proposition

```
Using 1 service:  Dashboard is nice ✅
Using 2 services: Dashboard is valuable ✅✅
Using 3+ services: Dashboard is essential ✅✅✅
```

**Key insight**: The more Wraps services a user adopts, the more valuable the unified dashboard becomes. This creates natural platform lock-in and reduces churn.

### No Vendor Lock-In

Even hosted dashboard users **own their infrastructure**. If they churn from Wraps:
- Their email/SMS/queues keep working (infrastructure stays in their AWS account)
- They just lose the dashboard and productivity features
- No data migration needed
- No vendor panic

This is a **unique competitive advantage** vs. Resend/Postmark/SendGrid.

---

## Pricing Tiers

### Platform-Based Pricing (One Subscription, All Services)

| Tier | Price | Services Included | Key Limits |
|------|-------|-------------------|------------|
| **Free** | $0 | Email, SMS, Queues, IoT (local only) | 1 AWS account, local CLI only |
| **Starter** | $10/mo or $100/yr | All services (hosted dashboard) | 1 AWS account, basic features |
| **Pro** | $49/mo or $490/yr | All services + advanced features | 3 AWS accounts, team features |
| **Enterprise** | $399/mo or $3,990/yr | All services + compliance | Unlimited accounts, SSO, audit logs |

**Why platform pricing works**:
- ✅ Simple - One price, all services
- ✅ Natural upsell - "Try email, stay for SMS+Queues"
- ✅ Network effects - More services = more valuable dashboard
- ✅ Predictable revenue - Not usage-dependent
- ✅ Encourages adoption - No fear of additional charges

---

### 🆓 Free Tier (Forever)

**Target**: Solo developers, side projects, learning

**Access**: Local CLI only (`wraps console`)

**Features**:
- ✅ CLI deployment for ALL services
- ✅ Local console dashboard
- ✅ SDKs for email, SMS, queues, IoT
- ✅ Domain/phone verification
- ✅ Real-time metrics (local only)
- ✅ Email event tracking (90-day DynamoDB TTL)
- ✅ 1 AWS account
- ✅ Unlimited team members (local use)
- ✅ Community support (GitHub)

**What's missing**:
- ❌ No templates
- ❌ No batch operations
- ❌ No hosted dashboard
- ❌ No cross-service workflows

**Annual Cost**: $0 + AWS costs (~$1-20/mo for most users)

---

### ⭐ Starter Tier - $10/month

**Target**: Solo developers, freelancers, small startups

**Delivery**: Hosted dashboard at console.wraps.dev

**Email Features**:
- ✅ Unlimited templates
- ✅ Batch sending (100 recipients)
- ✅ Scheduled sending
- ✅ Email history (60 days)
- ✅ Variable substitution
- ✅ HTML template editor

**SMS Features**:
- ✅ SMS templates
- ✅ Batch SMS (100 recipients)
- ✅ Phone number verification
- ✅ SMS history (60 days)
- ✅ Delivery tracking

**Queue Features**:
- ✅ Up to 3 queues
- ✅ Job browser
- ✅ Basic retry logic
- ✅ Queue metrics
- ✅ Failed job management

**IoT Features**:
- ✅ Up to 10 devices
- ✅ Real-time device status
- ✅ Message history (30 days)
- ✅ Device metrics

**Cross-Service**:
- ✅ Unified dashboard (all services)
- ✅ 1 AWS account
- ✅ Unlimited team members
- ✅ 1 API key
- ✅ Weekly email digests
- ✅ Email support (48hr)

**Limits**:
- 1 AWS account
- 100 recipients per batch (email/SMS)
- 3 queues
- 10 IoT devices
- 1 API key

**Total Cost Example** (50K emails + 1K SMS/month):
- Wraps Starter: $10/mo
- AWS costs: ~$10/mo
- **Total: $20/mo**

---

### 💼 Pro Tier - $49/month

**Target**: Small teams (2-10 people), growing startups

**Delivery**: Hosted dashboard with team collaboration

**Email Features**:
- ✅ Everything in Starter
- ✅ Unlimited batch recipients
- ✅ A/B testing
- ✅ Advanced analytics
- ✅ 90-day history
- ✅ Delivery optimization

**SMS Features**:
- ✅ Everything in Starter
- ✅ Unlimited batch SMS
- ✅ A/B testing for SMS
- ✅ Delivery optimization
- ✅ 90-day history

**Queue Features**:
- ✅ Unlimited queues
- ✅ Advanced retry logic
- ✅ Scheduled jobs (cron)
- ✅ Dead letter queue management
- ✅ Queue-to-queue routing
- ✅ Priority handling

**IoT Features**:
- ✅ Unlimited devices
- ✅ Real-time message viewer
- ✅ Device grouping/tagging
- ✅ 90-day message history

**Cross-Service**:
- ✅ 3 AWS accounts (dev, staging, prod)
- ✅ Team collaboration (up to 10 members)
- ✅ Role-based permissions
- ✅ 5 API keys
- ✅ 10 webhooks
- ✅ Cross-service workflows (email → queue → SMS)
- ✅ Shared templates and dashboards
- ✅ Activity feed
- ✅ Email support (24hr)
- ✅ Video chat support (1 session/month)

**Total Cost Example** (500K emails + 5K SMS/month):
- Wraps Pro: $49/mo
- AWS costs: ~$80/mo
- **Total: $129/mo**

---

### 🏢 Enterprise Tier - $399/month

**Target**: Medium/large companies (10+ people), regulated industries

**Delivery**: Hosted dashboard with enterprise features + optional private hosting

**Everything in Pro, plus**:

**Email**:
- ✅ Unlimited history
- ✅ Approval workflows
- ✅ Compliance exports

**SMS**:
- ✅ Unlimited history
- ✅ Dedicated phone numbers
- ✅ TCPA compliance

**Queues**:
- ✅ Multi-region queues
- ✅ Priority queues
- ✅ Approval workflows for production

**IoT**:
- ✅ Device fleet management
- ✅ Bulk device provisioning
- ✅ Custom device policies

**Cross-Service**:
- ✅ Unlimited AWS accounts
- ✅ Unlimited team members
- ✅ Unlimited API keys
- ✅ SSO/SAML (Okta, Azure AD, Google Workspace)
- ✅ Advanced RBAC (custom roles)
- ✅ Audit logs (unlimited retention)
- ✅ SOC 2 Type II attestation
- ✅ HIPAA compliance (BAA available)
- ✅ Multi-region support
- ✅ Datadog integration
- ✅ PagerDuty integration
- ✅ Slack integration
- ✅ Private hosting (optional)
- ✅ Custom domain (console.yourcompany.com)
- ✅ White-labeling
- ✅ Dedicated support (4hr SLA)
- ✅ Quarterly architecture reviews

**Total Cost Example** (1M emails + 10K SMS/month):
- Wraps Enterprise: $399/mo
- AWS costs: ~$160/mo
- **Total: $559/mo**

---

## Service Rollout Timeline

### Phase 1: Email Only (Months 1-6)

**Current state** - Foundation

**What's included**:
```bash
npm install @wraps/email
wraps init --service email

await email.send({
  to: 'user@example.com',
  subject: 'Welcome!',
  html: '<h1>Hello</h1>'
});
```

**Dashboard features**:
- Email metrics (sent, delivered, bounced, complained)
- Domain verification status
- Email event history
- SES quota display

**Pricing**: Free (local) → Starter $10/mo → Pro $49/mo → Enterprise $399/mo

**Focus**: Get to 100+ paying email customers before expanding

---

### Phase 2: Add SMS (Months 7-9)

**What's being added**:
```bash
npm install @wraps/sms
wraps init --service sms

await sms.send({
  to: '+1234567890',
  message: 'Your verification code is 123456'
});
```

**Dashboard additions**:
- SMS metrics (sent, delivered, failed)
- Phone number verification status
- SMS templates (for common messages)
- SMS batching (send to multiple numbers)
- Cost tracking (SMS is more expensive than email)

**Pricing changes**: **NONE** - All tiers get SMS included

**Value prop**:
> "Email + SMS in one dashboard for $10/month. Both use your AWS infrastructure."

**Announcement strategy**:
```
Subject: Introducing Wraps SMS (Already included in your plan!)

Great news: We just launched SMS support.

If you're on Starter/Pro/Enterprise, it's already included.
No price increase. No additional fees.

npm install @wraps/sms
wraps init --service sms

Manage email + SMS in one dashboard.
```

---

### Phase 3: Add Task Queues (Months 10-12)

**What's being added**:
```bash
npm install @wraps/queue
wraps init --service queue

await queue.enqueue('send-welcome-email', {
  userId: '123',
  email: 'user@example.com'
});

queue.worker('send-welcome-email', async (job) => {
  await email.send({
    to: job.data.email,
    template: 'welcome'
  });
});
```

**Dashboard additions**:
- Queue metrics (enqueued, processed, failed, retries)
- Job browser (see individual jobs)
- Worker health monitoring
- Dead letter queue management
- Retry configuration UI
- Scheduled jobs (cron-like)

**Pricing changes**: **NONE** - All tiers get queues included

**Feature differentiation**:
- Free: Local queue console
- Starter: Up to 3 queues, basic monitoring
- Pro: Unlimited queues, advanced retry logic, scheduled jobs
- Enterprise: Approval workflows for production deploys

**Value prop**:
> "Email + SMS + Background Jobs. One dashboard. $10/month."

---

### Phase 4: Add IoT/MQTT (Year 2)

**What's being added**:
```bash
npm install @wraps/iot
wraps init --service iot

await iot.publish('device/123/temperature', {
  value: 72.5,
  unit: 'fahrenheit'
});
```

**Dashboard additions**:
- Connected devices (online, offline)
- Message throughput
- Topic subscriptions
- Device certificates management
- Real-time message viewer

**Pricing changes**: **NONE** - Still all included

---

## Hosted Dashboard Architecture

### Local Console (Phase 1-4) → Hosted Dashboard (Phase 5+)

The local console is **designed for this transition**. 80% of code reuses when expanding to hosted.

### Architecture Comparison

**Local Console (Current)**:
```
User's Browser (localhost:5555)
    ↕ HTTP/SSE
Express Server (User's Machine)
    ↕ AWS SDK
User's AWS Account (IAM Role)
```

**Hosted Dashboard (Future)**:
```
User's Browser (console.wraps.dev)
    ↕ HTTP/HTTPS
Hosted Backend (Vercel/Railway)
    ├─ Auth API (users, teams)
    ├─ Database (PostgreSQL)
    ├─ Billing (Stripe)
    └─ Metrics API (same service layer!)
        ↕ AWS SDK
User's AWS Account (same IAM Role)
```

### What Carries Over (80% Code Reuse)

**✅ Identical in both local and hosted**:

1. **AWS Service Layer** (`src/console/services/`)
   - `aws-metrics.ts` - CloudWatch integration
   - `ses-service.ts` - SES API calls
   - `dynamodb-service.ts` - Email history queries
   - **No changes needed!**

2. **IAM Role Assumption** (`src/utils/assume-role.ts`)
   - Both local and hosted use STS AssumeRole
   - **No changes needed!**

3. **React Frontend** (`console-ui/`)
   - All components, charts, hooks
   - **Only change API base URL**

4. **CloudFormation Template**
   - Users still deploy `wraps-email-role` to their account
   - **Just add hosted backend ARN as trusted principal**

### New Components for Hosted Version

**🆕 Required for hosted**:

1. **User Authentication**
   - Email/password registration
   - OAuth (Google, GitHub)
   - JWT tokens
   - Session management
   - Recommendation: Clerk or Auth.js

2. **Database (PostgreSQL)**
   - Users, teams, workspaces
   - AWS account connections
   - Historical metrics (beyond DynamoDB TTL)
   - Billing data
   - Templates, webhooks, API keys
   - Recommendation: Supabase/Neon/Railway

3. **Multi-Tenancy**
   - User → Teams → Workspaces → AWS Accounts
   - Role-based permissions (admin, member, viewer)
   - Team invitations

4. **Billing Integration**
   - Stripe subscriptions
   - Plan limits enforcement
   - Usage tracking
   - Invoice management

5. **Background Jobs**
   - Periodic metric archiving
   - Email digests/alerts
   - Quota monitoring
   - Recommendation: Inngest or Trigger.dev

### Database Schema (Key Tables)

```sql
-- Users & Authentication
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  name VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Teams
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  owner_id UUID REFERENCES users(id),
  plan VARCHAR(50) DEFAULT 'free', -- free, starter, pro, enterprise
  stripe_customer_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Team Members
CREATE TABLE team_members (
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(50) DEFAULT 'member', -- admin, member, viewer
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (team_id, user_id)
);

-- AWS Account Connections
CREATE TABLE aws_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  account_id VARCHAR(20) NOT NULL,
  region VARCHAR(50) NOT NULL,
  role_arn VARCHAR(255) NOT NULL,
  external_id VARCHAR(255), -- for extra security
  created_at TIMESTAMP DEFAULT NOW()
);

-- Historical Metrics (beyond DynamoDB TTL)
CREATE TABLE metrics_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aws_account_id UUID REFERENCES aws_accounts(id) ON DELETE CASCADE,
  service VARCHAR(50) NOT NULL, -- email, sms, queue, iot
  timestamp TIMESTAMP NOT NULL,
  metric_data JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_metrics_account_service_timestamp 
  ON metrics_snapshots(aws_account_id, service, timestamp DESC);

-- Email Templates
CREATE TABLE email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  subject VARCHAR(255),
  html TEXT,
  variables JSONB DEFAULT '[]',
  created_at TIMESTAMP DEFAULT NOW()
);

-- API Keys
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  key_hash VARCHAR(255) NOT NULL,
  prefix VARCHAR(10) NOT NULL, -- e.g., "wraps_live_"
  permissions TEXT[] DEFAULT '{}',
  last_used TIMESTAMP,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Webhooks
CREATE TABLE webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aws_account_id UUID REFERENCES aws_accounts(id) ON DELETE CASCADE,
  url VARCHAR(2048) NOT NULL,
  events TEXT[] DEFAULT '{}',
  secret VARCHAR(255),
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Tech Stack (Hosted)

```yaml
Frontend:
  - React (same as local)
  - Next.js (for SSR, API routes)
  - Deployed: Vercel

Backend:
  - Next.js API routes
  - Same AWS service layer (reused!)
  - Deployed: Vercel

Database:
  - PostgreSQL (Supabase/Neon)
  - Drizzle ORM

Background Jobs:
  - Inngest or Trigger.dev

Auth:
  - Clerk or Auth.js

Billing:
  - Stripe Checkout
  - Stripe Customer Portal

Monitoring:
  - Sentry (errors)
  - PostHog (analytics)
```

---

## Implementation Roadmap

### Month 1-3: Local Console MVP ✅ (Current Phase)

**Deliverables**:
- [ ] `wraps console` command works
- [ ] Real-time metrics displayed
- [ ] Domain verification UI
- [ ] Email event tracking
- [ ] Free forever
- [ ] 100+ weekly active users

**Reference**: See `wraps-console-implementation-spec-updated.md` for detailed implementation

---

### Month 4-5: Hosted Dashboard MVP

**Goal**: Launch hosted version with basic paid tiers

**Backend Setup**:
- [ ] User authentication (Clerk/Auth.js)
- [ ] Teams and AWS account connections
- [ ] Database setup (PostgreSQL)
- [ ] Stripe integration (Starter/Pro plans)
- [ ] Plan limit enforcement

**Frontend Migration**:
- [ ] Port local console UI to Next.js
- [ ] Copy all React components (no changes needed!)
- [ ] Update API base URL
- [ ] Add team selection UI
- [ ] Add billing UI

**AWS Integration**:
- [ ] Reuse AWS service layer (copy services/)
- [ ] Add hosted backend ARN to IAM role template
- [ ] Update `wraps init` to support hosted mode
- [ ] Test role assumption from hosted backend

**Success Criteria**:
- [ ] 10 beta users
- [ ] 10 paying Starter customers ($100 MRR)
- [ ] <5% churn rate
- [ ] All local features work in hosted mode

---

### Month 6-7: Pro Tier Features

**Goal**: Enable team collaboration and multi-account

**Features**:
- [ ] Historical metrics storage (PostgreSQL)
- [ ] Email template library
- [ ] Batch sending (email)
- [ ] Team member invitations
- [ ] Multi-account support (up to 3)
- [ ] 5 API keys per team
- [ ] Webhook management UI

**Success Criteria**:
- [ ] 50 Starter subscribers
- [ ] 10 Pro subscribers
- [ ] 3 teams using collaboration features
- [ ] $2K+ MRR

---

### Month 7-9: SMS Launch

**Goal**: Add SMS as second service (no price increase)

**Implementation**:
- [ ] SMS SDK (`@wraps/sms`)
- [ ] SMS deployment via `wraps init --service sms`
- [ ] SNS + Pinpoint infrastructure
- [ ] SMS dashboard in console
- [ ] SMS templates
- [ ] Batch SMS (same limits as email)

**Marketing**:
- [ ] Announce to existing customers (already included!)
- [ ] Update homepage (Email + SMS)
- [ ] Launch blog post
- [ ] Update pricing page

**Success Criteria**:
- [ ] 30% of paid users try SMS
- [ ] 20% actively use SMS monthly
- [ ] No churn from feature launch
- [ ] Services per customer: 1.2 → 1.4

---

### Month 8-9: Enterprise Features

**Goal**: Enable enterprise sales

**Features**:
- [ ] SSO/SAML integration
- [ ] Audit logs
- [ ] Advanced RBAC
- [ ] Approval workflows
- [ ] Compliance exports
- [ ] Unlimited AWS accounts
- [ ] Priority support (4hr SLA)

**Sales**:
- [ ] Enterprise sales materials
- [ ] Demo environment
- [ ] SOC 2 preparation (Type I)
- [ ] Security documentation

**Success Criteria**:
- [ ] 100 paying users
- [ ] 3 enterprise customers ($1,200+ MRR from enterprise)
- [ ] $10K+ total MRR

---

### Month 10-12: Task Queues Launch

**Goal**: Add queues as third service (no price increase)

**Implementation**:
- [ ] Queue SDK (`@wraps/queue`)
- [ ] SQS + Lambda infrastructure
- [ ] Queue dashboard
- [ ] Job browser
- [ ] Retry configuration UI
- [ ] Dead letter queue management

**Pro/Enterprise Features**:
- [ ] Unlimited queues (Pro+)
- [ ] Scheduled jobs (cron)
- [ ] Queue-to-queue routing
- [ ] Approval workflows (Enterprise)

**Success Criteria**:
- [ ] 40% of paid users try queues
- [ ] 25% actively use queues monthly
- [ ] Services per customer: 1.4 → 1.8
- [ ] $15K+ MRR

---

### Year 2: IoT + Platform Maturity

**Goals**:
- Launch IoT service (Phase 4)
- SOC 2 Type II compliance
- Advanced analytics
- Custom integrations (Datadog, PagerDuty)
- Private hosting option (Enterprise)
- Scale to 500+ paying customers
- $25K+ MRR

---

## AWS Cost Examples

### Example 1: 50,000 Emails/Month (Small Startup)

**AWS Costs**:
```
SES:          $5.00  (50K × $0.10/1K)
Data:         $0.14  (2.5 GB transfer)
DynamoDB:     $0.16  (100K writes, 100MB storage)
Lambda:       $0.00  (within free tier)
CloudWatch:   $2.59  (metrics polling)
SNS:          $2.00  (event notifications)
────────────────────
TOTAL:        $9.89/month
```

**Wraps Starter**: $10/mo + $9.89 AWS = **$19.89/month total**

---

### Example 2: 100,000 Emails/Month + 1,000 SMS/Month

**AWS Costs**:
```
SES:          $10.00  (100K × $0.10/1K)
SNS (SMS):    $6.45   (1K × $0.00645/SMS)
Data:         $0.36   (5 GB transfer)
DynamoDB:     $0.30   (200K writes, 200MB storage)
Lambda:       $0.00   (within free tier)
CloudWatch:   $2.59   (metrics polling)
SNS Events:   $4.00   (200K notifications)
────────────────────
TOTAL:        $23.70/month
```

**Wraps Starter**: $10/mo + $23.70 AWS = **$33.70/month total**

---

### Example 3: 500,000 Emails + 5,000 SMS/Month

**AWS Costs**:
```
SES:          $50.00
SNS (SMS):    $32.25
Data:         $2.16
DynamoDB:     $1.53
Lambda:       $0.00
CloudWatch:   $2.59
SNS Events:   $20.00
────────────────────
TOTAL:        $108.53/month
```

**Wraps Pro**: $49/mo + $108.53 AWS = **$157.53/month total**

---

### Example 4: 1,000,000 Emails + 10,000 SMS/Month

**AWS Costs**:
```
SES:          $100.00
SNS (SMS):    $64.50
Data:         $4.41
DynamoDB:     $3.13
Lambda:       $0.20
CloudWatch:   $2.59
SNS Events:   $40.00
────────────────────
TOTAL:        $214.83/month
```

**Wraps Enterprise**: $399/mo + $214.83 AWS = **$613.83/month total**

---

## Competitive Analysis

### For 100,000 Emails/Month

| Provider | Total Cost | Your Infrastructure? | Notes |
|----------|-----------|---------------------|-------|
| **Wraps Starter** | **$33.70/mo** | ✅ You own it | + 1K SMS included |
| **Resend Pro** | $40/mo | ❌ Vendor lock-in | Email only |
| **Postmark** | $125/mo | ❌ Vendor lock-in | Email only |
| **SendGrid** | $19.95/mo | ❌ Vendor lock-in | Deliverability issues |
| **Mailgun** | $80/mo | ❌ Vendor lock-in | Email only |

**Wraps wins on**: Price (vs Postmark/Mailgun), infrastructure ownership, multi-service (email + SMS)

---

### For 500,000 Emails + 5,000 SMS/Month

| Provider | Total Cost | Your Infrastructure? |
|----------|-----------|---------------------|
| **Wraps Pro** | **$157.53/mo** | ✅ You own it |
| **Resend Pro** | $200/mo | ❌ | Email only |
| **Postmark** | $625/mo | ❌ | Email only |
| **Twilio** | ~$600/mo | ❌ | Email + SMS separate bills |

**Wraps saves**: 22% vs Resend, 75% vs Postmark, ~74% vs Twilio

---

### Unique Wraps Advantages

1. **Infrastructure ownership** - Churn doesn't break your app
2. **Multi-service platform** - Email, SMS, queues, IoT in one dashboard
3. **No usage-based pricing** - Predictable costs
4. **Transparent AWS costs** - You see exactly what you pay AWS
5. **Platform pricing** - Try new services without additional fees

---

## Revenue Projections

### Conservative Scenario (Year 1)

| Month | Free Users | Starter ($10) | Pro ($49) | Enterprise ($399) | MRR |
|-------|-----------|---------------|-----------|-------------------|-----|
| 1-3 | 200 | 0 | 0 | 0 | $0 |
| 4 | 500 | 10 | 0 | 0 | $100 |
| 5 | 1,000 | 30 | 5 | 0 | $545 |
| 6 | 2,000 | 60 | 10 | 1 | $1,489 |
| 7 | 3,000 | 100 | 20 | 2 | $2,778 |
| 8 | 4,000 | 150 | 30 | 3 | $4,167 |
| 9 | 5,000 | 200 | 50 | 5 | $6,445 |
| 10 | 6,000 | 250 | 75 | 8 | $9,870 |
| 11 | 7,000 | 300 | 100 | 10 | $12,890 |
| 12 | 8,000 | 350 | 125 | 15 | $16,620 |

**Year 1 Total**: $16,620 MRR = **$199K ARR**

---

### With Multi-Service Platform (Year 2)

**Key assumptions**:
- 40% of customers use 2+ services by end of Year 2
- Services per customer: 1.2 (Year 1) → 1.8 (Year 2)
- Lower churn due to platform effects

| Customers | Plan | Services Used | MRR | Notes |
|-----------|------|---------------|-----|-------|
| 300 | Starter | 1 service | $3,000 | Email only |
| 200 | Starter | 2+ services | $2,000 | Email + SMS |
| 150 | Pro | 2+ services | $7,350 | Using 3+ services |
| 30 | Enterprise | 3+ services | $11,970 | Large teams |

**Year 2 Total MRR**: $24,320 = **$291K ARR**

**Growth from Year 1**: +46% due to multi-service adoption

---

### Platform Effect on LTV

**Single-service customer** (email only):
- Churn: 8% monthly
- Average lifetime: 12.5 months
- LTV: $125 (Starter) or $612.50 (Pro)

**Multi-service customer** (email + SMS + queues):
- Churn: 4% monthly (2x better retention)
- Average lifetime: 25 months
- LTV: $250 (Starter) or $1,225 (Pro)

**Platform effect**: 2x better retention, 2x higher LTV

---

## Key Decisions & Rationale

### Decision 1: Platform vs Per-Service Pricing

**✅ CHOSEN: Platform Pricing**

**Rationale**:
- Simpler for users to understand
- Removes friction to try new services
- Better aligns with "unified dashboard" value prop
- Easier to communicate
- Builds platform lock-in (good kind - using multiple services)
- Creates viral moments ("Wraps just added SMS at no extra cost!")

---

### Decision 2: Price Points ($10/$49/$399)

**✅ CHOSEN: $10 Starter, $49 Pro, $399 Enterprise**

**Rationale**:
- **$10 Starter**: Feels like "cost of Netflix" - easy impulse decision
- **$49 Pro**: Industry standard for team tools (similar to GitHub Teams)
- **$399 Enterprise**: Comparable to enterprise dev tools, justified by compliance

**vs alternatives**:
- $20 Starter: Higher barrier to first paid conversion
- $79 Pro: Too expensive for small teams
- $799 Enterprise: Pricing out mid-market companies

---

### Decision 3: Free Tier Strategy

**✅ CHOSEN: Forever Free Local Console**

**Rationale**:
- Validates product-market fit risk-free
- Word-of-mouth growth from free users
- Natural upsell path to hosted dashboard
- Differentiator vs. competitors (Resend has limited free tier)
- Shows confidence in product ("try before you buy")

---

### Decision 4: No Price Increases When Adding Services

**✅ CHOSEN: No price increases**

**Rationale**:
- Amazing user experience
- Encourages faster service adoption
- Creates viral marketing moments
- Users already pay AWS for infrastructure
- Tooling has minimal marginal cost
- Builds trust and loyalty

---

### Decision 5: Service-Specific Limits

**✅ CHOSEN: Yes, but generous**

**Starter limits**:
- 100 recipients per batch (email/SMS)
- 3 queues
- 10 IoT devices

**Rationale**:
- Creates clear upgrade path
- Limits are useful (not restrictive)
- Easy to understand
- Natural triggers when users hit limits

---

## Conversion Triggers

### Free → Starter Triggers

**Trigger 1: Multi-service usage**
```
User sends email AND SMS from local console

Prompt: "You're using 2 Wraps services! 
        Manage both in one hosted dashboard.
        → Try Starter (14-day free trial) - $10/mo"
```

**Trigger 2: Template fatigue**
```
User sends 10+ similar emails in a week

Prompt: "You've sent 12 similar emails this week. 
        Templates can save you hours.
        → Start 14-day free trial"
```

**Trigger 3: Mobile access**
```
User tries to access local console from phone

Prompt: "Can't access localhost from mobile.
        Get the hosted dashboard.
        → Try Starter (14-day free trial)"
```

---

### Starter → Pro Triggers

**Trigger 1: Second AWS account**
```
User has 1 AWS account, tries to add staging

Prompt: "Starter is limited to 1 AWS account.
        Upgrade to Pro for up to 3 accounts.
        → Upgrade to Pro ($49/mo)"
```

**Trigger 2: Queue limit**
```
User has 3 queues (Starter limit), tries to create 4th

Prompt: "Starter supports up to 3 queues.
        Pro has unlimited queues.
        → Upgrade to Pro ($49/mo)"
```

**Trigger 3: Team invitation**
```
User tries to invite team member (not available on Starter)

Prompt: "Want to collaborate with your team?
        Pro includes team features for up to 10 members.
        → Upgrade to Pro ($49/mo)"
```

---

### Pro → Enterprise Triggers

**Trigger 1: SSO request**
```
User tries to enable SSO (not available)

Prompt: "SSO/SAML is available on Enterprise plans.
        → Contact Sales"
```

**Trigger 2: 4th AWS account**
```
User has 3 AWS accounts, tries to add 4th

Prompt: "Pro is limited to 3 AWS accounts.
        Enterprise has unlimited accounts.
        → Contact Sales"
```

**Trigger 3: Compliance need**
```
User exports data for compliance audit

Prompt: "Need audit logs for compliance?
        Enterprise includes SOC 2, HIPAA, unlimited logs.
        → Contact Sales"
```

---

## Success Metrics

### Key Metrics to Track

**Acquisition**:
- Free signups per month
- Free → Starter conversion rate (target: 5%)
- Starter → Pro conversion rate (target: 20%)
- Pro → Enterprise conversion rate (target: 10%)

**Engagement**:
- Services per customer (target: 1.2 → 2.3 over 3 years)
- Weekly active users (WAU)
- Dashboard logins per user per week
- Cross-service workflows created

**Revenue**:
- MRR growth rate (target: 20% month-over-month)
- Customer LTV
- Average revenue per account (ARPA)
- Expansion revenue (upsells)

**Retention**:
- Monthly churn rate (target: <5%)
- Multi-service churn vs single-service churn
- Net revenue retention (target: >100%)

---

## Conclusion

### Why This Strategy Works

**For Users**:
- ✅ Predictable pricing (not usage-based)
- ✅ Infrastructure ownership (no vendor lock-in)
- ✅ Unified dashboard (one place for all services)
- ✅ Try before you buy (free local console)
- ✅ No surprises (adding services doesn't increase price)

**For Wraps**:
- ✅ Simple to communicate (one price, all services)
- ✅ Natural adoption funnel (start email, add SMS later)
- ✅ Platform lock-in (using 3+ services = high switching cost)
- ✅ Higher LTV (more services = better retention)
- ✅ Lower churn (2x better retention for multi-service users)
- ✅ Predictable revenue (not dependent on usage volatility)

**Competitive Moat**:
- No competitor offers unified BYOC platform
- Impossible to replicate without BYOC model
- Network effects between services
- Infrastructure ownership is unique value prop

---

## Next Steps

### Immediate (Next 30 Days)
1. Complete local console implementation (see spec doc)
2. Get to 50+ weekly active users on local console
3. Start database schema design for hosted version
4. Begin Stripe integration planning

### Short-term (Months 2-4)
1. Launch hosted dashboard MVP
2. Migrate 10 beta users from local to hosted
3. Enable Starter tier billing
4. Get first 10 paying customers

### Medium-term (Months 5-9)
1. Launch Pro tier features
2. Add SMS service (no price increase)
3. Get to $5K MRR
4. Begin enterprise feature development

### Long-term (Months 10-12+)
1. Launch task queues
2. Enable enterprise tier
3. Get to $15K MRR
4. Plan Year 2 (IoT service, SOC 2, etc.)

---

**Document Version**: 1.0  
**Last Updated**: November 6, 2025  
**Related Documents**: 
- `wraps-console-implementation-spec-updated.md` - Technical implementation details for local console
- Original source files consolidated: `wraps-multi-service-pricing.md`, `wraps-hosted-dashboard-expansion.md`, `wraps-pricing-corrected.md`, `wraps-pricing-tiers-revised.md`
