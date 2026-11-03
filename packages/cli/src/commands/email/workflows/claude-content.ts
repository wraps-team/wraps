/**
 * Claude Code context content for workflow scaffolding.
 *
 * These constants are written to .claude/ when running `wraps email workflows init`.
 */

/** Section added to .claude/CLAUDE.md */
export const WORKFLOWS_CLAUDE_MD_SECTION = `
## Workflows

Workflow automation files live at \`wraps/workflows/*.ts\` and are written using the \`@wraps.dev/client\` DSL.

### Key Commands

- \`wraps email workflows validate\` — Validate workflow files locally
- \`wraps email workflows push\` — Push workflows to the Wraps dashboard

### Quick Reference

- Import helpers from \`@wraps.dev/client\`
- Use \`export default defineWorkflow({...})\` as the default export
- Step IDs must be unique kebab-case strings
- Template slugs reference templates pushed via \`wraps email templates push\`
- See the \`wraps-workflows\` skill for the full DSL API reference
`;

/** Full skill content written to .claude/skills/wraps-workflows/SKILL.md */
export const WORKFLOWS_SKILL_CONTENT = `
# Wraps Workflows DSL

You are an expert at writing Wraps workflow automation files using the \`@wraps.dev/client\` TypeScript DSL.

## File Structure

Workflow files live at \`wraps/workflows/*.ts\`. Each file exports a single workflow:

\`\`\`typescript
import { defineWorkflow, sendEmail, delay } from '@wraps.dev/client';

export default defineWorkflow({
  name: 'My Workflow',
  description: 'Optional description',
  trigger: { type: 'contact_created' },
  steps: [
    sendEmail('send-welcome', { template: 'welcome-email' }),
    delay('wait-1-day', { days: 1 }),
  ],
});
\`\`\`

## defineWorkflow Structure

\`\`\`typescript
defineWorkflow({
  name: string;                    // Human-readable workflow name
  description?: string;            // Optional description
  trigger: TriggerDefinition;      // What starts the workflow
  steps: StepDefinition[];         // Array of step helper calls
  settings?: WorkflowSettings;     // Execution settings
  defaults?: {                     // Default sender settings
    from?: string;                 // Default from email
    fromName?: string;             // Default from name
    replyTo?: string;              // Default reply-to
    senderId?: string;             // Default SMS sender ID
  };
})
\`\`\`

## Trigger Types

| Type | Required Config | Description |
|------|----------------|-------------|
| \`contact_created\` | — | Fires when a new contact is created |
| \`contact_updated\` | — | Fires on every contact update through the API or CLI, when a contact's fields change in the dashboard, and when its email status changes (suppressed, bounced, complained, unsubscribed, or active again after a suppression is removed). Event data carries \`updatedFields\` and \`changeSource\`: \`api\` (an API key), \`user\` (a signed-in user in the dashboard or CLI), \`bounce\`, \`complaint\`, \`ses_suppression\` or \`unsubscribe\` (the unsubscribe link, or the preference centre's "unsubscribe from all"). If the workflow sends email, set \`reentryDelaySeconds\` or branch on \`changeSource\`, so a bounce or unsubscribe from its own email does not start it again |
| \`event\` | \`eventName: string\` | Fires on a custom event (e.g. \`'cart.abandoned'\`) |
| \`segment_entry\` | \`segmentId: string\` | Fires when a contact enters a segment |
| \`segment_exit\` | \`segmentId: string\` | Fires when a contact exits a segment |
| \`topic_subscribed\` | \`topicId: string\` | Fires when subscribed to a topic |
| \`topic_unsubscribed\` | \`topicId: string\` | Fires when unsubscribed from a topic |
| \`schedule\` | \`schedule: string\`, \`timezone?: string\` | Runs on a cron schedule |
| \`api\` | — | Triggered manually via API call |

### Examples

\`\`\`typescript
// Custom event
trigger: { type: 'event', eventName: 'cart.abandoned' }

// Cron schedule (Mondays at 9am EST)
trigger: { type: 'schedule', schedule: '0 9 * * 1', timezone: 'America/New_York' }

// Segment entry
trigger: { type: 'segment_entry', segmentId: 'high-value-customers' }
\`\`\`

## Step Helpers

All step helpers are imported from \`@wraps.dev/client\`. Every step takes a unique kebab-case \`id\` as the first argument.

### sendEmail(id, config)

Send an email using a template slug.

\`\`\`typescript
sendEmail('send-welcome', {
  template: 'welcome-email',   // Required: template slug
  subject?: string,             // Override template subject
  from?: string,                // Override from address
})
\`\`\`

### sendSms(id, config)

Send an SMS using a template slug.

\`\`\`typescript
sendSms('send-reminder', {
  template: 'appointment-reminder',  // Required: template slug
})
\`\`\`

### delay(id, duration)

Pause the workflow for a duration. At least one duration field is required.

\`\`\`typescript
delay('wait-1-day', { days: 1 })
delay('short-wait', { hours: 2, minutes: 30 })
delay('quick-pause', { minutes: 15 })
\`\`\`

### condition(id, config)

Branch based on a contact field condition.

\`\`\`typescript
condition('check-activated', {
  field: 'contact.hasActivated',    // Dot-notation field path
  operator: 'equals',               // See operators below
  value: true,                      // Value to compare against
  branches: {
    yes: [/* steps when true */],
    no: [/* steps when false */],
  },
})
\`\`\`

**Condition Operators:**
- \`equals\`, \`not_equals\`
- \`greater_than\`, \`less_than\`
- \`contains\`, \`not_contains\`
- \`is_set\`, \`is_not_set\`

### waitForEvent(id, config)

Wait for a specific event with a timeout fallback.

\`\`\`typescript
waitForEvent('wait-for-purchase', {
  eventName: 'purchase.completed',
  timeout: { days: 3 },
  branches: {
    received: [/* steps when event fires */],
    timeout: [/* steps when timeout expires */],
  },
})
\`\`\`

### webhook(id, config)

Call an external webhook URL.

\`\`\`typescript
webhook('notify-slack', {
  url: 'https://hooks.slack.com/...',
  method: 'POST',           // Optional, defaults to POST
})
\`\`\`

### updateContact(id, config)

Update contact fields.

\`\`\`typescript
updateContact('mark-onboarded', {
  fields: {
    onboardingComplete: true,
    onboardedAt: '{{now}}',
  },
})
\`\`\`

### subscribeTopic(id, config) / unsubscribeTopic(id, config)

Manage topic subscriptions.

\`\`\`typescript
subscribeTopic('subscribe-updates', { topicId: 'product-updates' })
unsubscribeTopic('unsubscribe-promo', { topicId: 'promotions' })
\`\`\`

### exit(id)

End the workflow. Terminal — no steps can follow.

\`\`\`typescript
exit('workflow-complete')
\`\`\`

### cascade(id, config)

Cross-channel cascade: tries channels in order, falling back if no engagement.
**Important:** Returns an array — use the spread operator.

\`\`\`typescript
...cascade('recover-cart', {
  channels: [
    {
      type: 'email',
      template: 'cart-recovery',
      waitFor: { hours: 2 },        // How long to wait for engagement
      engagement: 'opened',          // What counts as engagement
    },
    {
      type: 'sms',
      template: 'cart-sms-reminder', // Final fallback (no waitFor needed)
    },
  ],
})
\`\`\`

## WorkflowSettings

\`\`\`typescript
settings: {
  allowReentry?: boolean;              // Allow contacts to re-enter (default: false)
  reentryDelaySeconds?: number;        // Min seconds between re-entries
  maxConcurrentExecutions?: number;    // Max parallel executions
  contactCooldownSeconds?: number;     // Cooldown per contact
}
\`\`\`

## Validation Rules

1. **Unique IDs**: All step IDs must be unique within a workflow
2. **Kebab-case IDs**: Step IDs must use kebab-case (e.g. \`send-welcome\`, not \`sendWelcome\`)
3. **At least 1 step**: Every workflow needs at least one step
4. **Template references**: Template slugs must match templates pushed via \`wraps email templates push\`
5. **Trigger config**: Event triggers require \`eventName\`, segment triggers require \`segmentId\`, etc.
6. **Single default export**: Each file must have exactly one \`export default defineWorkflow({...})\`

## Complete Examples

### Welcome Sequence

\`\`\`typescript
import {
  defineWorkflow,
  sendEmail,
  delay,
  condition,
  exit,
} from '@wraps.dev/client';

/**
 * Welcome Sequence
 *
 * Send a welcome email when a contact is created,
 * wait 1 day, then check if they activated.
 * If not, send a follow-up with tips.
 */
export default defineWorkflow({
  name: 'Welcome Sequence',
  trigger: {
    type: 'contact_created',
  },

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
\`\`\`

### Cart Recovery Cascade

\`\`\`typescript
import {
  defineWorkflow,
  sendEmail,
  sendSms,
  delay,
  cascade,
  exit,
} from '@wraps.dev/client';

/**
 * Cart Recovery Cascade
 *
 * When a cart is abandoned, wait 30 minutes, then try
 * email first. If not opened after 2 hours, fall back to SMS.
 */
export default defineWorkflow({
  name: 'Cart Recovery Cascade',
  trigger: {
    type: 'event',
    eventName: 'cart.abandoned',
  },

  steps: [
    delay('initial-wait', { minutes: 30 }),

    ...cascade('recover-cart', {
      channels: [
        {
          type: 'email',
          template: 'cart-recovery',
          waitFor: { hours: 2 },
          engagement: 'opened',
        },
        {
          type: 'sms',
          template: 'cart-sms-reminder',
        },
      ],
    }),

    exit('cascade-complete'),
  ],
});
\`\`\`

## Key Commands

\`\`\`bash
wraps email workflows validate                     # Validate all workflow files
wraps email workflows validate --workflow welcome   # Validate a specific workflow
wraps email workflows push                         # Push workflows to dashboard
\`\`\`
`;
