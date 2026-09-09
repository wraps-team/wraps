/**
 * AWS Marketplace lifecycle events.
 *
 * AWS publishes agreement and licence events for our SaaS listing to the
 * DEFAULT event bus of the seller account (905130073023, us-east-1). Nothing
 * provisions that stream — it is on by default — so this file only creates a
 * rule to catch it, a queue to buffer it, and the consumer.
 *
 * SQS sits between EventBridge and Lambda deliberately: EventBridge retries a
 * failed Lambda target only briefly and then drops the event silently, which
 * would lose a subscription with no trace. A queue gives real retries and a DLQ.
 *
 * The legacy SNS topic shown on the product page
 * (aws-mp-subscription-notification-<productCode>) is intentionally unused.
 * Concurrent Agreements — mandatory for listings created after 2026-06-01,
 * which ours was — expects EventBridge.
 */

import { axiomToken, sentryDsn } from "./secrets";

// Dead letter queue. Without this a record the consumer cannot process is
// retried forever and then dropped, leaving a buyer stuck at `pending`.
export const marketplaceDlq = new sst.aws.Queue("MarketplaceEventsDlq", {
  transform: {
    queue: {
      messageRetentionSeconds: 1_209_600, // 14 days
      tags: { ManagedBy: "sst", Service: "wraps-api" },
    },
  },
});

export const marketplaceQueue = new sst.aws.Queue("MarketplaceEventsQueue", {
  dlq: { queue: marketplaceDlq.arn, retry: 3 },
  transform: {
    queue: {
      visibilityTimeoutSeconds: 70, // Must exceed the consumer's 60s timeout.
      messageRetentionSeconds: 1_209_600,
      tags: { ManagedBy: "sst", Service: "wraps-api" },
    },
  },
});

// EventBridge needs an explicit resource policy on the queue; an IAM grant on
// the rule is not enough. Without this the rule matches and the delivery fails
// silently.
new aws.sqs.QueuePolicy("MarketplaceEventsQueuePolicy", {
  queueUrl: marketplaceQueue.url,
  policy: marketplaceQueue.arn.apply((queueArn) =>
    JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: { Service: "events.amazonaws.com" },
          Action: "sqs:SendMessage",
          Resource: queueArn,
        },
      ],
    })
  ),
});

/**
 * The pattern is deliberately broader than the set of detail types the worker
 * acts on. Filtering here to only the handled types would mean a new AWS event
 * type is dropped by EventBridge with no record; catching the whole source lets
 * the worker log what it does not recognise.
 */
const marketplaceRule = new aws.cloudwatch.EventRule("MarketplaceEventsRule", {
  description:
    "AWS Marketplace agreement and licence lifecycle events for the Wraps SaaS listing",
  eventPattern: JSON.stringify({
    source: ["aws.agreement-marketplace"],
  }),
});

new aws.cloudwatch.EventTarget("MarketplaceEventsTarget", {
  rule: marketplaceRule.name,
  arn: marketplaceQueue.arn,
});

marketplaceQueue.subscribe(
  {
    handler: "apps/api/src/workers/marketplace-events.handler",
    runtime: "nodejs24.x",
    timeout: "1 minute",
    memory: "256 MB",
    environment: {
      NODE_ENV: "production",
      DATABASE_URL: process.env.DATABASE_URL ?? "",
      AXIOM_TOKEN: axiomToken.value,
      AXIOM_DATASET: "wraps",
      // Advisories (buyer fraud, abuse, account closure) and unprocessable
      // records surface nowhere else.
      SENTRY_DSN: sentryDsn.value,
      // The confirmation email is sent from wraps.dev, which is verified in
      // the dogfood account (010836206701), not this platform account.
      // getWrapsClient() assumes this role from the function's execution role;
      // the sts:AssumeRole grant below covers it. Same identity the batch
      // sender and EventFeedStaleness cron use.
      WRAPS_EMAIL_ROLE_ARN: "arn:aws:iam::010836206701:role/wraps-email-role",
      // Link target in the confirmation email.
      APP_BASE_URL:
        $app.stage === "production"
          ? "https://app.wraps.dev"
          : (process.env.APP_BASE_URL ?? "https://app.wraps.dev"),
    },
    nodejs: {
      // PostgreSQL driver for Drizzle; @sentry/profiling-node ships native
      // binaries esbuild cannot bundle, so it stays external.
      install: ["pg", "@sentry/profiling-node"],
    },
    permissions: [
      // Assume the dogfood account's role to send the confirmation email from
      // a wraps.dev identity.
      {
        actions: ["sts:AssumeRole"],
        resources: ["arn:aws:iam::*:role/wraps-*"],
      },
    ],
  },
  {
    batch: {
      size: 10,
      partialResponses: true,
    },
  }
);
