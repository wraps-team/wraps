import * as aws from "@pulumi/aws";

/**
 * SQS inbound resources output
 */
export type SQSInboundResources = {
  queue: aws.sqs.Queue;
  dlq: aws.sqs.Queue;
};

/**
 * Create SQS queues for inbound email event processing (DLQ for Lambda failures)
 *
 * Architecture:
 * SES Lambda action (or, legacy, S3 notification) -> Lambda (inbound-processor) -> EventBridge
 *            ↓ (on failure, after Lambda's async retries)
 *           DLQ
 */
export function createSQSInboundResources(): SQSInboundResources {
  // Dead Letter Queue for failed inbound processing
  const dlq = new aws.sqs.Queue("wraps-inbound-events-dlq", {
    name: "wraps-inbound-events-dlq",
    messageRetentionSeconds: 1_209_600, // 14 days
    tags: {
      ManagedBy: "wraps-cli",
      Service: "email-inbound",
      Description: "Dead letter queue for failed inbound email processing",
    },
  });

  // Main queue for inbound email events (used as Lambda DLQ destination)
  const queue = new aws.sqs.Queue("wraps-inbound-events", {
    name: "wraps-inbound-events",
    visibilityTimeoutSeconds: 300, // Must be >= Lambda timeout (120s) * 2 + buffer
    messageRetentionSeconds: 345_600, // 4 days
    receiveWaitTimeSeconds: 20, // Long polling
    redrivePolicy: dlq.arn.apply((arn) =>
      JSON.stringify({
        deadLetterTargetArn: arn,
        maxReceiveCount: 3,
      })
    ),
    tags: {
      ManagedBy: "wraps-cli",
      Service: "email-inbound",
      Description: "Queue for failed inbound email events",
    },
  });

  return {
    queue,
    dlq,
  };
}
