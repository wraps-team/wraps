/**
 * Platform Alerting Infrastructure
 *
 * SNS topic + CloudWatch alarms for DLQ monitoring.
 * Alerts when any message lands in the workflow, batch, or marketplace DLQs.
 */

import { marketplaceDlq } from "./marketplace";
import { batchDlq, batchQueue, workflowDlq } from "./queues";

// SNS topic for alarm notifications
export const alertsTopic = new aws.sns.Topic("AlertsTopic", {
  name: $interpolate`wraps-alerts-${$app.stage}`,
  tags: {
    ManagedBy: "sst",
    Service: "wraps-api",
  },
});

// Optional email subscription (only created if ALERT_EMAIL is set)
if (process.env.ALERT_EMAIL) {
  new aws.sns.TopicSubscription("AlertsEmailSubscription", {
    topic: alertsTopic.arn,
    protocol: "email",
    endpoint: process.env.ALERT_EMAIL,
  });
}

// Alarm: messages visible in the Workflow DLQ
new aws.cloudwatch.MetricAlarm("WorkflowDlqAlarm", {
  name: $interpolate`wraps-workflow-dlq-${$app.stage}`,
  alarmDescription: "One or more workflow jobs landed in the dead-letter queue",
  namespace: "AWS/SQS",
  metricName: "ApproximateNumberOfMessagesVisible",
  dimensions: {
    QueueName: workflowDlq.nodes.queue.name,
  },
  statistic: "Maximum",
  period: 60,
  evaluationPeriods: 1,
  threshold: 1,
  comparisonOperator: "GreaterThanOrEqualToThreshold",
  treatMissingData: "notBreaching",
  alarmActions: [alertsTopic.arn],
  okActions: [alertsTopic.arn],
  tags: {
    ManagedBy: "sst",
    Service: "wraps-api",
  },
});

// Alarm: messages visible in the Batch DLQ
new aws.cloudwatch.MetricAlarm("BatchDlqAlarm", {
  name: $interpolate`wraps-batch-dlq-${$app.stage}`,
  alarmDescription: "One or more batch jobs landed in the dead-letter queue",
  namespace: "AWS/SQS",
  metricName: "ApproximateNumberOfMessagesVisible",
  dimensions: {
    QueueName: batchDlq.nodes.queue.name,
  },
  statistic: "Maximum",
  period: 60,
  evaluationPeriods: 1,
  threshold: 1,
  comparisonOperator: "GreaterThanOrEqualToThreshold",
  treatMissingData: "notBreaching",
  alarmActions: [alertsTopic.arn],
  okActions: [alertsTopic.arn],
  tags: {
    ManagedBy: "sst",
    Service: "wraps-api",
  },
});

// Alarm: messages visible in the Marketplace DLQ
new aws.cloudwatch.MetricAlarm("MarketplaceDlqAlarm", {
  name: $interpolate`wraps-marketplace-dlq-${$app.stage}`,
  alarmDescription:
    "One or more marketplace events landed in the dead-letter queue",
  namespace: "AWS/SQS",
  metricName: "ApproximateNumberOfMessagesVisible",
  dimensions: {
    QueueName: marketplaceDlq.nodes.queue.name,
  },
  statistic: "Maximum",
  period: 60,
  evaluationPeriods: 1,
  threshold: 1,
  comparisonOperator: "GreaterThanOrEqualToThreshold",
  treatMissingData: "notBreaching",
  alarmActions: [alertsTopic.arn],
  okActions: [alertsTopic.arn],
  tags: {
    ManagedBy: "sst",
    Service: "wraps-api",
  },
});

// Alarm: batch messages sitting too long on the main queue.
// DLQ alarm only fires AFTER 3 retries — roughly 15+ min of failure before
// a broadcast operator sees anything. This fires earlier: if the oldest
// message on the main queue has been waiting >= 15 min, something is
// blocking the worker and we want to know BEFORE DLQ landing.
new aws.cloudwatch.MetricAlarm("BatchQueueAgeAlarm", {
  name: $interpolate`wraps-batch-queue-age-${$app.stage}`,
  alarmDescription:
    "Oldest batch message has been on the queue for >= 15 minutes — worker likely stalled",
  namespace: "AWS/SQS",
  metricName: "ApproximateAgeOfOldestMessage",
  dimensions: {
    QueueName: batchQueue.nodes.queue.name,
  },
  statistic: "Maximum",
  period: 60,
  evaluationPeriods: 3,
  threshold: 900, // 15 minutes
  comparisonOperator: "GreaterThanOrEqualToThreshold",
  treatMissingData: "notBreaching",
  alarmActions: [alertsTopic.arn],
  okActions: [alertsTopic.arn],
  tags: {
    ManagedBy: "sst",
    Service: "wraps-api",
  },
});
