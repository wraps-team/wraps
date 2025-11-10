import * as aws from "@pulumi/aws";

/**
 * SQS resources output
 */
export type SQSResources = {
  queue: aws.sqs.Queue;
  dlq: aws.sqs.Queue;
};

/**
 * Create SQS queue with Dead Letter Queue for event processing
 *
 * Architecture:
 * EventBridge -> SQS Queue -> Lambda (event-processor)
 *                    ↓
 *                   DLQ (failed messages after 3 retries)
 */
export async function createSQSResources(): Promise<SQSResources> {
  // Dead Letter Queue for failed event processing
  const dlq = new aws.sqs.Queue("wraps-email-events-dlq", {
    name: "wraps-email-events-dlq",
    messageRetentionSeconds: 1_209_600, // 14 days
    tags: {
      ManagedBy: "wraps-cli",
      Description: "Dead letter queue for failed SES event processing",
    },
  });

  // Main queue for SES events
  const queue = new aws.sqs.Queue("wraps-email-events", {
    name: "wraps-email-events",
    visibilityTimeoutSeconds: 300, // 5 minutes (Lambda timeout)
    messageRetentionSeconds: 345_600, // 4 days
    receiveWaitTimeSeconds: 20, // Long polling
    redrivePolicy: dlq.arn.apply((arn) =>
      JSON.stringify({
        deadLetterTargetArn: arn,
        maxReceiveCount: 3, // Retry 3 times before sending to DLQ
      })
    ),
    tags: {
      ManagedBy: "wraps-cli",
      Description: "Queue for SES email events from EventBridge",
    },
  });

  return {
    queue,
    dlq,
  };
}
