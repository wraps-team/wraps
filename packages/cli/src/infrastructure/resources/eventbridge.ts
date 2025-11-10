import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

/**
 * EventBridge resources configuration
 */
export type EventBridgeConfig = {
  eventBusArn: pulumi.Output<string>;
  queueArn: pulumi.Output<string>;
  queueUrl: pulumi.Output<string>;
};

/**
 * EventBridge resources output
 */
export type EventBridgeResources = {
  rule: aws.cloudwatch.EventRule;
  target: aws.cloudwatch.EventTarget;
};

/**
 * Create EventBridge rule to route SES events to SQS queue
 *
 * This rule captures all SES events from the custom event bus
 * and routes them to the SQS queue for processing.
 */
export async function createEventBridgeResources(
  config: EventBridgeConfig
): Promise<EventBridgeResources> {
  // Extract event bus name from ARN
  const eventBusName = config.eventBusArn.apply((arn) => arn.split("/").pop()!);

  // EventBridge rule to capture all SES events
  const rule = new aws.cloudwatch.EventRule("wraps-email-events-rule", {
    name: "wraps-email-events-to-sqs",
    description: "Route all SES email events to SQS for processing",
    eventBusName,
    eventPattern: JSON.stringify({
      source: ["aws.ses"],
      "detail-type": [
        "SES Email Event", // EventBridge format from SES
      ],
    }),
    tags: {
      ManagedBy: "wraps-cli",
    },
  });

  // SQS queue policy to allow EventBridge to send messages
  new aws.sqs.QueuePolicy("wraps-email-events-queue-policy", {
    queueUrl: config.queueUrl,
    policy: pulumi
      .all([config.queueArn, rule.arn])
      .apply(([queueArn, ruleArn]) =>
        JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: {
                Service: "events.amazonaws.com",
              },
              Action: "sqs:SendMessage",
              Resource: queueArn,
              Condition: {
                ArnEquals: {
                  "aws:SourceArn": ruleArn,
                },
              },
            },
          ],
        })
      ),
  });

  // EventBridge target to send events to SQS
  const target = new aws.cloudwatch.EventTarget("wraps-email-events-target", {
    rule: rule.name,
    eventBusName,
    arn: config.queueArn,
  });

  return {
    rule,
    target,
  };
}
