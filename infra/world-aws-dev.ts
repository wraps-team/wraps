/**
 * World-AWS Dev Infrastructure
 *
 * References existing DynamoDB tables + SQS queues (created by `world-aws-setup`)
 * and wires up a Lambda with SQS event source mappings for local dev via SST.
 *
 * Usage:
 *   1. Run `world-aws-setup --region us-east-1` to create tables + queues
 *   2. Run `pnpm sst:dev` to start SST dev (Live Lambda Dev)
 */

const prefix = process.env.WORKFLOW_AWS_TABLE_PREFIX ?? "workflow";
const region = process.env.AWS_REGION ?? "us-east-1";

// Look up existing SQS queues (created by world-aws-setup)
const workflowsQueue = aws.sqs.getQueueOutput({
  name: `${prefix}-workflows`,
});
const stepsQueue = aws.sqs.getQueueOutput({
  name: `${prefix}-steps`,
});

// Lambda handler that processes SQS messages through the Workflow runtime
const worldAwsHandler = new sst.aws.Function("WorldAwsHandler", {
  handler: "packages/world-aws/dev/handler.handler",
  runtime: "nodejs22.x",
  timeout: "15 minutes",
  memory: "512 MB",
  environment: {
    WORKFLOW_AWS_TABLE_PREFIX: prefix,
    WORKFLOW_AWS_QUEUE_PREFIX: prefix,
    WORKFLOW_LOCAL_BASE_URL:
      process.env.WORKFLOW_LOCAL_BASE_URL ?? "http://localhost:3000",
  },
  permissions: [
    {
      actions: [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query",
        "dynamodb:BatchWriteItem",
        "dynamodb:DescribeTable",
        "dynamodb:DescribeStream",
        "dynamodb:GetRecords",
        "dynamodb:GetShardIterator",
        "dynamodb:ListStreams",
      ],
      resources: [
        $interpolate`arn:aws:dynamodb:${region}:*:table/${prefix}-*`,
        $interpolate`arn:aws:dynamodb:${region}:*:table/${prefix}-*/index/*`,
        $interpolate`arn:aws:dynamodb:${region}:*:table/${prefix}-*/stream/*`,
      ],
    },
    {
      actions: [
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sqs:GetQueueAttributes",
        "sqs:SendMessage",
        "sqs:GetQueueUrl",
      ],
      resources: [$interpolate`arn:aws:sqs:${region}:*:${prefix}-*`],
    },
  ],
});

// Wire SQS → Lambda event source mappings
new aws.lambda.EventSourceMapping("WorldAwsWorkflowsTrigger", {
  eventSourceArn: workflowsQueue.arn,
  functionName: worldAwsHandler.nodes.function.name,
  batchSize: 10,
  functionResponseTypes: ["ReportBatchItemFailures"],
});

new aws.lambda.EventSourceMapping("WorldAwsStepsTrigger", {
  eventSourceArn: stepsQueue.arn,
  functionName: worldAwsHandler.nodes.function.name,
  batchSize: 10,
  functionResponseTypes: ["ReportBatchItemFailures"],
});

export { worldAwsHandler };
