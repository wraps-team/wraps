---
name: wraps-workflows
description: Build email and SMS automation workflows using the @wraps.dev/client TypeScript DSL. Covers triggers, steps, branching, cascades, and the full defineWorkflow API.
---

# Wraps Workflow DSL

Build email and SMS automation workflows as TypeScript files using `@wraps.dev/client`. Workflows live in `wraps/workflows/*.ts` and are pushed to the Wraps dashboard with `wraps email workflows push`.

## Installation

```bash
npm install @wraps.dev/client
# or
pnpm add @wraps.dev/client
```

## Quick Start

```typescript
import { defineWorkflow, sendEmail, delay, condition, exit } from '@wraps.dev/client';

export default defineWorkflow({
  name: 'Welcome Sequence',
  trigger: { type: 'contact_created' },
  steps: [
    sendEmail('send-welcome', { template: 'welcome-email' }),
    delay('wait-1-day', { days: 1 }),
    condition('check-activated', {
      field: 'contact.hasActivated',
      operator: 'equals',
      value: true,
      branches: {
        yes: [exit('already-active')],
        no: [sendEmail('send-tips', { template: 'getting-started-tips' })],
      },
    }),
  ],
});
```

## Workflow Structure

Every workflow file must:

1. Use `export default defineWorkflow({ ... })`
2. Import only what it uses from `@wraps.dev/client`
3. Have exactly one `trigger`
4. Have a `steps` array of step helper calls

```typescript
import { defineWorkflow, sendEmail, delay } from '@wraps.dev/client';

export default defineWorkflow({
  name: 'Workflow Name',
  description: 'Optional description',
  trigger: { type: 'contact_created' },
  steps: [
    sendEmail('welcome', { template: 'welcome' }),
    delay('wait', { days: 1 }),
  ],

  // Optional settings
  settings: {
    allowReentry: false,
    reentryDelaySeconds: 86400,
    maxConcurrentExecutions: 1000,
    contactCooldownSeconds: 3600,
  },

  // Optional default sender overrides
  defaults: {
    from: 'hello@example.com',
    fromName: 'My App',
    replyTo: 'support@example.com',
  },
});
```

## Trigger Types

```typescript
// New contact created
trigger: { type: 'contact_created' }

// Contact updated: every update through the API or CLI
// (PATCH /v1/contacts/:id, `wraps contacts update`), an edit in the dashboard,
// or an email status change (suppressed, bounced, complained, unsubscribed, or
// active again after a suppression is removed). Imports (dashboard CSV,
// POST /v1/contacts/import, `wraps contacts import`) don't fire it.
// Event data has updatedFields and changeSource: 'api' (an API key), 'user'
// (a signed-in user in the dashboard or CLI), 'bounce', 'complaint',
// 'ses_suppression', or 'unsubscribe' (the unsubscribe link, or the
// preference centre's "unsubscribe from all"). If the workflow sends email,
// set reentryDelaySeconds or add a condition on the 'changeSource' field, so a
// bounce or unsubscribe from its own email does not start it again.
trigger: { type: 'contact_updated' }

// Custom event
trigger: { type: 'event', eventName: 'cart.abandoned' }

// Contact enters a segment
trigger: { type: 'segment_entry', segmentId: 'segment-id' }

// Contact exits a segment
trigger: { type: 'segment_exit', segmentId: 'segment-id' }

// Topic subscription
trigger: { type: 'topic_subscribed', topicId: 'topic-id' }

// Topic unsubscription
trigger: { type: 'topic_unsubscribed', topicId: 'topic-id' }

// Cron schedule
trigger: { type: 'schedule', schedule: '0 9 * * 1', timezone: 'America/New_York' }

// Manual / API trigger
trigger: { type: 'api' }
```

## Step Helpers

### sendEmail

Send an email using a template slug.

```typescript
sendEmail('step-id', { template: 'welcome-email' })

// With overrides
sendEmail('promo', {
  template: 'promo-email',
  from: 'marketing@example.com',
  fromName: 'Marketing Team',
  replyTo: 'replies@example.com',
})
```

### sendSms

Send an SMS using a template slug or inline message.

```typescript
// Template
sendSms('reminder', { template: 'appointment-reminder' })

// Inline message
sendSms('otp', { message: 'Your code is {{otp}}' })

// With sender ID
sendSms('alert', { template: 'alert-sms', senderId: '+15551234567' })
```

### delay

Wait for a duration before continuing.

```typescript
delay('wait-1-day', { days: 1 })
delay('wait-2-hours', { hours: 2 })
delay('wait-30-min', { minutes: 30 })
```

### condition

Branch based on a contact field or event data.

```typescript
condition('check-plan', {
  field: 'contact.plan',
  operator: 'equals',
  value: 'premium',
  branches: {
    yes: [sendEmail('premium-offer', { template: 'premium-perks' })],
    no: [sendEmail('upgrade-offer', { template: 'upgrade-cta' })],
  },
})
```

**Operators:** `equals`, `not_equals`, `contains`, `not_contains`, `starts_with`, `ends_with`, `greater_than`, `less_than`, `greater_than_or_equals`, `less_than_or_equals`, `is_set`, `is_not_set`, `is_true`, `is_false`

### waitForEvent

Pause until a specific event occurs, with an optional timeout.

```typescript
waitForEvent('wait-for-purchase', {
  eventName: 'purchase_completed',
  timeout: { days: 7 },
})
```

### waitForEmailEngagement

Wait for engagement with a previous email step.

```typescript
waitForEmailEngagement('wait-for-open', {
  emailStepId: 'welcome',       // ID of the sendEmail step to track
  engagementType: 'opened',     // 'opened' or 'clicked'
  timeout: { days: 3 },
})
```

### exit

End the workflow.

```typescript
exit('completed')
exit('cancelled', { reason: 'User unsubscribed', markAs: 'cancelled' })
```

**markAs options:** `completed` (default), `cancelled`, `failed`

### updateContact

Modify contact fields.

```typescript
updateContact('mark-welcomed', {
  updates: [
    { field: 'welcomeEmailSent', operation: 'set', value: true },
    { field: 'emailCount', operation: 'increment', value: 1 },
  ],
})
```

**Operations:** `set`, `increment`, `decrement`, `append`, `remove`

### subscribeTopic / unsubscribeTopic

Manage topic subscriptions.

```typescript
subscribeTopic('subscribe-newsletter', {
  topicId: 'newsletter',
  channel: 'email',    // 'email' or 'sms'
})

unsubscribeTopic('unsubscribe-promo', {
  topicId: 'promotions',
  channel: 'email',
})
```

### webhook

Call an external URL.

```typescript
webhook('notify-slack', {
  url: 'https://hooks.slack.com/services/...',
  method: 'POST',
  headers: { 'X-Custom': 'value' },
  body: { text: 'New user signed up!' },
})
```

### cascade

Cross-channel cascade: try channels in order, stop when engagement is detected. Returns an array — use spread syntax.

```typescript
...cascade('notify-user', {
  channels: [
    {
      type: 'email',
      template: 'welcome-email',
      waitFor: { hours: 2 },
      engagement: 'opened',
    },
    {
      type: 'sms',
      template: 'welcome-sms',
    },
  ],
})
```

Expands to: sendEmail -> waitForEmailEngagement -> condition (engaged?) -> yes: exit -> no: sendSms

## Common Patterns

### Welcome Sequence

```typescript
import { defineWorkflow, sendEmail, delay, condition, exit } from '@wraps.dev/client';

export default defineWorkflow({
  name: 'Welcome Sequence',
  trigger: { type: 'contact_created' },
  steps: [
    sendEmail('send-welcome', { template: 'welcome-email' }),
    delay('wait-1-day', { days: 1 }),
    condition('check-activated', {
      field: 'contact.hasActivated',
      operator: 'equals',
      value: true,
      branches: {
        yes: [exit('already-active')],
        no: [
          sendEmail('send-tips', { template: 'getting-started-tips' }),
        ],
      },
    }),
  ],
});
```

### Cart Recovery with Cascade

```typescript
import { defineWorkflow, delay, cascade, exit } from '@wraps.dev/client';

export default defineWorkflow({
  name: 'Cart Recovery',
  trigger: { type: 'event', eventName: 'cart.abandoned' },
  steps: [
    delay('initial-wait', { minutes: 30 }),
    ...cascade('recover-cart', {
      channels: [
        { type: 'email', template: 'cart-recovery', waitFor: { hours: 2 }, engagement: 'opened' },
        { type: 'sms', template: 'cart-sms-reminder' },
      ],
    }),
    exit('cascade-complete'),
  ],
});
```

### Re-engagement with Event Wait

```typescript
import {
  defineWorkflow, sendEmail, waitForEvent, condition, delay, exit,
} from '@wraps.dev/client';

export default defineWorkflow({
  name: 'Re-engagement',
  trigger: { type: 'event', eventName: 'contact.inactive' },
  steps: [
    sendEmail('send-win-back', { template: 'we-miss-you' }),
    waitForEvent('wait-for-activity', {
      eventName: 'contact.active',
      timeout: { days: 7 },
    }),
    condition('check-returned', {
      field: 'contact.lastActiveAt',
      operator: 'is_set',
      value: true,
      branches: {
        yes: [exit('re-engaged')],
        no: [
          sendEmail('final-offer', { template: 'last-chance-offer' }),
          delay('wait-before-cleanup', { days: 3 }),
          exit('not-engaged'),
        ],
      },
    }),
  ],
});
```

## Rules

1. Always use `export default defineWorkflow({ ... })`
2. Import only what you use from `@wraps.dev/client`
3. Step IDs must be kebab-case and unique (e.g., `'send-welcome'`, `'wait-1-day'`)
4. Template slugs should be descriptive kebab-case (e.g., `'welcome-email'`, `'cart-recovery'`)
5. Use the `...cascade()` spread pattern when using cascade
6. Add a JSDoc comment at the top describing the workflow purpose
7. Keep workflows focused — typically 3-10 steps, one clear goal per workflow
8. Use meaningful, human-readable names for the workflow and steps
9. Include appropriate delays between messages (don't spam — wait at least hours or days)
10. Add conditions to personalize flow based on user behavior
11. End branches with exit nodes when appropriate

## Common Event Names

These are conventions — users can define any custom event name:

- `user.signup` — New user registration
- `order.completed` — Purchase completed
- `order.created` — Order placed
- `cart.abandoned` — Cart abandoned
- `subscription.started` — Subscription began
- `subscription.cancelled` — Subscription cancelled
- `trial.ending` — Trial expiring soon
- `contact.inactive` — Contact went inactive
- `form.submitted` — Form submission

## CLI Commands

```bash
# Generate from a built-in template
wraps email workflows generate --template welcome

# Available templates: welcome, cart-recovery, trial-conversion, re-engagement, onboarding

# Validate a workflow
wraps email workflows validate --workflow welcome

# Push all workflows to dashboard
wraps email workflows push
```

## File Structure

Workflow files live in `wraps/workflows/` at the project root:

```
my-project/
├── wraps/
│   └── workflows/
│       ├── welcome.ts
│       ├── cart-recovery.ts
│       └── trial-conversion.ts
├── src/
└── package.json
```
