/**
 * Platform Alerting Infrastructure
 *
 * SNS topic + CloudWatch alarms for DLQ monitoring.
 * Alerts when any message lands in the workflow or batch DLQs.
 */

import { accountHealthCron } from "./cron";
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

// The account-health sweep assumes each connected account's console-access role
// to read its SES state. When that role can no longer be assumed for an account
// that passed a check before, the sweep logs
//   "[account-health] Customer role unusable, skipping account"
// once per hour and moves on, deliberately: a deleted or drifted role is the
// customer's configuration to repair, and the customer is told in-app. But the
// sweep's own Sentry signal is gated on an active paid subscription, so when the
// account reads as free nothing internal is told. One customer's account
// (550430683003) was skipped this way for 36 days with no alarm and no issue.
//
// The literal is emitted only for an account whose role worked before
// (roleLastReachableAt is set); an account that never passed a check logs a
// different, info-level line and stays silent here, so this cannot fire for an
// abandoned free signup.
const ACCOUNT_HEALTH_ROLE_UNUSABLE_METRIC = {
  namespace: "Wraps/AccountHealth",
  name: "CustomerRoleUnusable",
};

new aws.cloudwatch.LogMetricFilter("AccountHealthRoleUnusableFilter", {
  name: $interpolate`wraps-account-health-role-unusable-${$app.stage}`,
  logGroupName: accountHealthCron.nodes.function.apply((fn) =>
    fn.nodes.logGroup.apply((logGroup) => {
      if (!logGroup) {
        throw new Error(
          "account-health function has no log group to filter on"
        );
      }
      return logGroup.name;
    })
  ),
  pattern: '"Customer role unusable, skipping account"',
  metricTransformation: {
    name: ACCOUNT_HEALTH_ROLE_UNUSABLE_METRIC.name,
    namespace: ACCOUNT_HEALTH_ROLE_UNUSABLE_METRIC.namespace,
    value: "1",
  },
});

// Alarm: a connected AWS account's console-access role stopped being assumable,
// so that account's SES health checks are being skipped. The sweep logs the
// filtered line once per hour while the account stays unreachable, so a 1-hour
// Sum >= 1 keeps the alarm in ALARM for as long as the account is unmonitored
// and clears it once the role is repaired.
new aws.cloudwatch.MetricAlarm("AccountHealthRoleUnusableAlarm", {
  name: $interpolate`wraps-account-health-role-unusable-${$app.stage}`,
  alarmDescription:
    "A connected AWS account's console-access role can no longer be assumed; its SES health checks are being skipped",
  namespace: ACCOUNT_HEALTH_ROLE_UNUSABLE_METRIC.namespace,
  metricName: ACCOUNT_HEALTH_ROLE_UNUSABLE_METRIC.name,
  statistic: "Sum",
  period: 3600,
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
