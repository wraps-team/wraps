# BYO Lambda Functions

This directory contains Lambda functions deployed by the BYO CLI for email event processing.

## Functions

### 1. `event-processor/`

**Purpose**: Processes SES email events (bounces, complaints, deliveries) and stores them in DynamoDB.

**Triggered by**: SNS topic subscriptions for SES events

**What it does**:
- Receives SNS notifications from SES
- Parses bounce, complaint, and delivery events
- Stores event data in DynamoDB (`byo-email-history` table)
- Implements 90-day TTL for automatic data retention

**Environment Variables**:
- `TABLE_NAME`: DynamoDB table name (default: `byo-email-history`)

**Use case**: Track email bounces and complaints for reputation management

---

### 2. `webhook-sender/`

**Purpose**: Forwards email events to a webhook endpoint for custom processing.

**Triggered by**: SNS topic subscriptions for SES events

**What it does**:
- Receives SNS notifications from SES
- Formats event data
- Sends HTTP POST request to configured webhook URL
- Continues processing even if webhook fails (non-blocking)

**Environment Variables**:
- `WEBHOOK_URL`: Your webhook endpoint URL (optional)

**Use case**: Integrate email events with external systems (Slack, Discord, custom dashboards)

---

## Deployment

These functions are automatically bundled and deployed by the BYO CLI when you enable the following features:

- **Event Processor**: Enabled with `emailHistory` feature
- **Webhook Sender**: Enabled with `eventProcessor` feature

```bash
# Deploy with these features
byo init
# Select: Email History, Event Processor
```

---

## Event Types

The Lambda functions handle these SES event types:

- **Bounce**: Email bounced (hard bounce, soft bounce)
- **Complaint**: Recipient marked email as spam
- **Delivery**: Email successfully delivered
- **Send**: Email sent (if configured)
- **Reject**: Email rejected before sending
- **Open**: Email opened (if tracking enabled)
- **Click**: Link clicked (if tracking enabled)

---

## Development

### Local Testing

```bash
# Install dependencies
cd lambda/event-processor
npm install

# Run tests (TODO)
npm test
```

### Modifying Functions

1. Edit the `index.ts` file in the respective function directory
2. Re-deploy with `byo upgrade` or `byo init`
3. The CLI will automatically bundle and deploy the updated code

---

## Architecture

```
SES Email Event
    ↓
SNS Topic (byo-bounce-complaints)
    ↓
    ├─→ event-processor Lambda → DynamoDB (byo-email-history)
    └─→ webhook-sender Lambda → Your Webhook URL
```

---

## Data Schema

### DynamoDB Item Structure

```typescript
{
  messageId: string;           // Primary key
  sentAt: number;              // Sort key (timestamp)
  accountId: string;           // AWS account ID
  eventType: string;           // bounce | complaint | delivery
  timestamp: string;           // ISO 8601 timestamp
  source: string;              // From address
  destination: string[];       // To addresses
  subject: string;             // Email subject
  bounceType?: string;         // hard | soft
  bounceSubType?: string;      // Details
  complaintFeedbackType?: string;
  deliveryTimestamp?: string;
  processingTimeMillis?: number;
  recipients: Array<any>;      // Recipient details
  rawEvent: any;               // Full SES event
  expiresAt: number;           // TTL (90 days)
}
```

---

## Notes

- Functions use AWS SDK v3 (excluded from bundle, provided by Lambda runtime)
- Bundled with esbuild for fast cold starts
- Node.js 20.x runtime
- 256MB memory allocation
- 30-second timeout
- Automatic CloudWatch Logs integration
