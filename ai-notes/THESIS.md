# Wraps: AWS Infrastructure Wrappers

**Primary Name**: Wraps (wraps.dev, @wraps/email)
**Alternative**: Trusses (@trusses/email)

## The Opportunity

AWS services (SES, SNS, IoT Core, SQS) are powerful and cost-effective but have terrible developer experience. Developers either:
1. Pay 10-100x markup for SaaS alternatives (Resend, Twilio, Trigger.dev)
2. Struggle through complex AWS setup and give up

**The wedge**: 90% of developers who try AWS SES abandon it during domain verification.

## The Solution: BYOC (Bring Your Own Cloud) Model

Deploy infrastructure **to the user's AWS account** with SaaS-quality developer experience:
- Users own their infrastructure and data
- They pay AWS directly (pennies vs. dollars)
- We provide tooling, dashboard, and great DX
- No vendor lock-in (infra stays if they churn)

**Similar to**: Supabase self-hosting, ClickHouse Cloud VPC deployment, Terraform Cloud

## Product Strategy: Start Dead Simple

### Phase 1: Email Only (MVP)
**One feature**: Deploy production-ready SES in 30 seconds
```bash
npx @wraps/email init --domain myapp.com
# Sets up SES, guides DNS verification, ready to send
```

**Not building initially**:
- ❌ Dashboard
- ❌ SMS/IoT/Workflows
- ❌ Analytics
- ❌ Templates

**Only building**:
- ✅ CLI that configures SES correctly
- ✅ Simple SDK wrapper (Resend-like API)
- ✅ Domain verification helper

### Why Email First?
- Clear value prop vs. both raw AWS and Resend
- Fastest path to validation
- Natural expansion to other services

### Future Phases
2. **SMS** (SNS wrapper)
3. **MQTT** (IoT Core wrapper)
4. **Workflows** (SQS + Lambda - competes with Trigger.dev)

## Business Model: Open Core

### Free Tier (OSS)
- CLI deployment tools
- SDK for sending emails
- Domain verification helper
- Community support (GitHub)
- Self-hosted dashboard option
- Up to 1 AWS account

### Pro Tier ($49-99/month)
- Hosted dashboard (analytics, bounces, complaints)
- 90-day data retention
- Up to 5 AWS accounts
- Email support (24hr)
- Template library
- Batch sending queues

### Enterprise Tier ($499-999/month)
- Unlimited AWS accounts
- SSO/SAML (Okta, Azure AD)
- Advanced RBAC (team permissions)
- Audit logs (unlimited retention)
- Approval workflows (production deployments)
- Private hosting (dashboard in their VPC)
- Custom integrations (Datadog, PagerDuty)
- Dedicated support (4hr SLA)
- Quarterly architecture reviews
- API access
- SOC 2 attestation

### Enterprise Plus ($1,999+/month)
- White-labeling
- Custom feature development
- 1hr SLA
- Dedicated engineer

## Go-to-Market Strategy

### Launch Philosophy
1. **Start with 1 dead-simple feature** - No platform, just email
2. **Launch again and again** - Iterate publicly, nobody remembers your first try
3. **Build so users spread it** - Product-led growth
4. **Onboarding <30 seconds** - Critical for dev tools
5. **Freemium that sells paid** - Free tier good enough to show value
6. **Spread inside teams/orgs** - Viral within companies
7. **Watch retention** - Data over hunches

### Week-by-Week Launch
- **Week 1**: CLI + basic SDK → 10 users (X/Twitter, /r/aws)
- **Week 2**: Fix pain points, better errors → 100 users (HN: "I made AWS SES not suck")
- **Week 3**: Add local dashboard → 500 users (Tutorial: "Replace Resend with BYO")
- **Week 4**: Launch hosted dashboard (paid) → 1 paying customer

### Success Metrics (Week 4)
- ✅ 10+ people use it weekly without prompting
- ✅ Someone told someone else about it
- ✅ People would be sad if it disappeared
- ✅ Someone asked for paid features

### Built-in Virality
```typescript
// Package.json shows up in every repo
"dependencies": {
  "@wraps/email": "^1.0.0"
}

// Shareable setup guides
"Setup complete! Share with your team: wraps.dev/setup/abc123"

// Optional subtle branding in emails (opt-out)
```

## Competitive Positioning

### vs. Resend/Postmark (Traditional SaaS)
- ✅ No vendor lock-in (own your infra)
- ✅ Lower cost at scale (AWS pricing)
- ✅ Data residency control
- ✅ Compliance (data stays in their account)
- ❌ Slightly more complex setup

### vs. Raw AWS
- ✅ 10x better developer experience
- ✅ Beautiful dashboards
- ✅ Unified API across services
- ✅ 30-second setup vs. 2-hour setup

### vs. Terraform/Pulumi
- ✅ Purpose-built for communication/workflows
- ✅ Managed updates
- ✅ Dashboard included
- ✅ No IaC knowledge required

## The BYO Advantage

The name "BYO" isn't just clever branding—it's the entire business strategy:

**Developer Pitch**: *"You know Resend? Same API, same DX. But it deploys to YOUR AWS account. You own it, you pay AWS directly, no markup. If you stop paying us, it keeps working."*

**CTOs Love It Because**:
- Full infrastructure ownership (audit trail in their AWS)
- Data never leaves their cloud (compliance simplified)
- Transparent costs (see AWS bill vs. our fee separately)
- No vendor lock-in (CloudFormation stacks are theirs)
- Exit strategy built-in (churn doesn't break their app)

**Developers Love It Because**:
- Resend-quality API (`await email.send()`)
- 30-second setup vs. 2-hour AWS configuration
- Beautiful dashboard (not AWS Console chaos)
- OSS with transparent pricing

**We Win Because**:
- Zero infrastructure costs (they run it)
- Easy expansion (add services to their account)
- Enterprise sales angle (governance, multi-account, compliance)
- Credible at every stage (solo dev → startup → enterprise)

## Why This Model Works

### Economics
- No infrastructure costs (users pay AWS directly)
- Lower price resistance (your fee vs. their AWS bill are separate)
- Charge $49-200/month while they pay pennies for usage
- Scales without scaling costs

### User Trust
- "No vendor lock-in" - they own the infrastructure
- Data stays in their account (compliance win)
- If they churn, infrastructure keeps working
- Exit credibility

### Enterprise Wedge
1. Developer finds OSS → Deploys to personal AWS
2. They love the DX → Show their team
3. Team wants dashboard → Pro tier ($49/mo)
4. Company wants governance → Enterprise tier ($499/mo)
5. Expand to more services → SMS, IoT, Workflows

## Technical Architecture

### Deployment Model
```bash
# User runs CLI
npx @wraps/email init

# Deploys CloudFormation stack to their account:
# - SES configuration + domain verification
# - Lambda functions for webhook handling
# - CloudWatch dashboards
# - IAM role (read-only for dashboard metrics)
```

### SDK Layer
```typescript
import { email } from '@wraps/email';

await email.send({
  from: 'you@company.com',
  to: 'user@example.com',
  subject: 'Welcome!',
  html: '<h1>Hello</h1>',
});

// Under the hood:
// 1. Hits your API gateway
// 2. Your API assumes role in their account
// 3. Calls their SES
// 4. Returns success/failure
```

### Dashboard Access
- User grants read-only CloudWatch access via IAM role
- Dashboard assumes role on-demand
- Never store their credentials
- Shows metrics from THEIR resources

## Naming: BYO (Bring Your Own)

**Primary Choice**: BYO
- `wraps.dev` - Domain
- `@wraps/email`, `@wraps/sms`, `@wraps/queue` - npm packages
- GitHub: `github.com/wraps-team`

### Why BYO Works

**1. Self-Explanatory**
- "BYO" is already familiar (Bring Your Own Bottle/Beer)
- Immediately communicates the core model: Bring Your Own Cloud
- No explanation needed - developers instantly get it

**2. Perfect Brand Fit**
- The name IS the value prop: "You bring your own AWS account"
- Memorable 3-letter acronym (like AWS, GCP, SST)
- Works across all services: @wraps/email, @wraps/sms, @wraps/iot

**3. Not Cloud-Specific**
- Can expand: "BYO AWS", "BYO GCP", "BYO Azure"
- Future-proof for multi-cloud support
- Platform-agnostic positioning

**4. Marketing Built-In**
- Natural taglines: "BYO Cloud", "BYO Infrastructure"
- Easy to explain: "Like Resend, but BYO AWS account"
- Developer-friendly, casual but professional

**5. Package Structure**
```bash
npm install @wraps/email      # AWS SES wrapper
npm install @wraps/sms        # AWS SNS wrapper
npm install @wraps/queue      # AWS SQS wrapper
npm install @wraps/workflows  # Step Functions wrapper
npm install @wraps/mqtt       # IoT Core wrapper
```
