# Wraps Email Template Strategy

## Two Template Approaches

### 1. React.email (Inline Rendering)
**Best for**: One-off transactional emails, development, testing

```typescript
import { WelcomeEmail } from './emails/Welcome';

await email.send({
  from: 'you@company.com',
  to: 'user@example.com',
  subject: 'Welcome!',
  react: <WelcomeEmail name="John" confirmUrl="https://..." />,
});
```

**How it works**:
- React component rendered to HTML at send time
- Auto-generates plain text version
- No template stored in AWS
- Perfect for dynamic, complex emails

### 2. SES Templates (Stored in User's AWS)
**Best for**: High-volume emails, bulk sends, production campaigns

```typescript
// First: Create template (one-time setup)
await email.templates.create({
  name: 'welcome-email',
  subject: 'Welcome to {{companyName}}, {{name}}!',
  html: '<h1>Welcome {{name}}!</h1>...',
});

// Then: Send using template (fast, scalable)
await email.sendTemplate({
  from: 'you@company.com',
  to: 'user@example.com',
  template: 'welcome-email',
  templateData: {
    name: 'John',
    companyName: 'Acme Inc',
  },
});

// Bulk send to 50 recipients
await email.sendBulkTemplate({
  from: 'you@company.com',
  template: 'welcome-email',
  destinations: [
    { to: 'user1@example.com', templateData: { name: 'Alice' } },
    { to: 'user2@example.com', templateData: { name: 'Bob' } },
    // ... up to 50
  ],
});
```

**How it works**:
- Template stored in user's SES account
- Variable substitution happens in AWS
- Optimized for bulk sending (50 recipients per API call)
- Fast - no rendering overhead

## Best Practices

### Development Workflow

**Option A: Pure React.email**
```typescript
// ✅ Simple, great for prototyping
await email.send({
  react: <WelcomeEmail {...props} />,
});
```

**Option B: React.email → SES Template**
```typescript
// Step 1: Create template from React component (one-time)
await email.templates.createFromReact({
  name: 'welcome-v1',
  subject: 'Welcome to {{companyName}}, {{name}}!',
  react: <WelcomeEmail />, // Uses {{variable}} syntax
});

// Step 2: Use template in production
await email.sendTemplate({
  template: 'welcome-v1',
  templateData: { name: 'John', companyName: 'Acme' },
});
```

### When to Use Each

| Scenario | Use This |
|----------|----------|
| One-off password reset | React.email inline |
| Daily digest to 10K users | SES Template + bulk send |
| Order confirmation | Either (personal preference) |
| Marketing campaign (100K) | SES Template (must use bulk) |
| A/B testing email designs | React.email (easy iteration) |
| Production email campaigns | SES Template (versioning) |

### Template Versioning

```typescript
// Deploy new version alongside old
await email.templates.create({
  name: 'welcome-v2',
  subject: 'New welcome design',
  html: '...',
});

// Gradual rollout
const template = Math.random() > 0.5 ? 'welcome-v1' : 'welcome-v2';
await email.sendTemplate({ template, ... });

// Cleanup old version when ready
await email.templates.delete('welcome-v1');
```

### Template Management in Infrastructure

Store templates as code (recommended):

```typescript
// scripts/deploy-templates.ts
const templates = [
  {
    name: 'welcome',
    subject: 'Welcome to {{companyName}}!',
    html: fs.readFileSync('./templates/welcome.html', 'utf-8'),
  },
  {
    name: 'password-reset',
    subject: 'Reset your password',
    html: fs.readFileSync('./templates/password-reset.html', 'utf-8'),
  },
];

for (const template of templates) {
  try {
    await email.templates.update(template);
  } catch {
    // Template doesn't exist yet
    await email.templates.create(template);
  }
}
```

## SES Template Syntax

SES uses Handlebars-like syntax:

```html
<!-- Simple variable -->
<h1>Hello {{name}}!</h1>

<!-- Conditional -->
{{#if isPremium}}
  <p>You have premium access!</p>
{{/if}}

<!-- Loop -->
<ul>
  {{#each items}}
    <li>{{this.name}}: ${{this.price}}</li>
  {{/each}}
</ul>

<!-- Default value -->
<p>Welcome {{name}} from {{city or "Unknown"}}</p>
```

## Migration Path

### Stage 1: Development (Current)
Use React.email inline for everything
```typescript
await email.send({ react: <Template /> });
```

### Stage 2: Scale (When hitting volume)
Convert high-volume emails to SES templates
```typescript
// Keep using React for one-offs
await email.send({ react: <PasswordReset /> });

// Use templates for bulk
await email.sendBulkTemplate({ template: 'newsletter', ... });
```

### Stage 3: Production (Mature)
Most emails use templates, React.email for prototyping
```typescript
// 95% of production sends
await email.sendTemplate({ ... });

// Dev/testing/one-offs
await email.send({ react: <NewFeatureEmail /> });
```

## Cost Comparison

**React.email inline** (1M sends):
- SDK rendering: ~2ms per email
- SES cost: $100
- Lambda/compute cost: ~$5-10
- **Total: ~$110**

**SES Templates** (1M sends):
- No SDK rendering (AWS-side)
- SES cost: $100
- Lambda/compute cost: ~$1-2 (just API calls)
- **Total: ~$102**

**Savings**: Marginal for <100K sends, meaningful at 1M+ sends

## Template Storage

All templates live in the user's AWS account:
- View in AWS Console → SES → Email Templates
- Managed via AWS CLI: `aws ses list-templates`
- Managed via Wraps SDK: `email.templates.list()`
- No data leaves user's AWS account
- No vendor lock-in

## Architecture Diagram

```
┌─────────────────────────────────────────────┐
│           Your Application                   │
├─────────────────────────────────────────────┤
│                                              │
│  Option 1: React.email                       │
│  ┌──────────────────────┐                   │
│  │ <EmailTemplate />    │                   │
│  └──────────┬───────────┘                   │
│             │                                │
│             ▼                                │
│      Render to HTML                          │
│             │                                │
│             ▼                                │
│      email.send({ html })                    │
│                                              │
│  Option 2: SES Templates                     │
│  ┌──────────────────────┐                   │
│  │ templateData         │                   │
│  └──────────┬───────────┘                   │
│             │                                │
│             ▼                                │
│      email.sendTemplate()                    │
│                                              │
└──────────────┬──────────────────────────────┘
               │
               ▼
       ┌───────────────┐
       │  Wraps SDK    │
       │  Thin Wrapper │
       └───────┬───────┘
               │
               ▼
       ┌───────────────┐
       │  AWS SES SDK  │
       └───────┬───────┘
               │
               ▼
    ┌──────────────────────┐
    │  User's AWS Account  │
    │  ┌────────────────┐  │
    │  │  SES Service   │  │
    │  │  + Templates   │  │
    │  └────────────────┘  │
    └──────────────────────┘
```

## Key Takeaways

1. **React.email = Development agility** - Fast iteration, rich components
2. **SES Templates = Production scale** - Bulk sending, lower cost
3. **Both work together** - Use React to design, export to template
4. **Users own everything** - Templates live in their AWS, zero lock-in
5. **Start simple** - React inline is perfect for MVP, add templates when needed
