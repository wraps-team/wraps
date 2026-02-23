import {
  type AttributeDefinition,
  CreateTableCommand,
  DynamoDBClient as DDBClient,
  DescribeTableCommand,
  type DynamoDBClient,
  type GlobalSecondaryIndex,
  type KeySchemaElement,
  type StreamSpecification,
} from "@aws-sdk/client-dynamodb";
import {
  CreateQueueCommand,
  GetQueueUrlCommand,
  SQSClient,
  type SQSClient as SQSClientType,
} from "@aws-sdk/client-sqs";
import { type AWSWorldConfig, resolveConfig } from "../config.js";
import { GSI, getTableNames } from "../dynamodb/tables.js";

type TableDef = {
  name: string;
  keys: KeySchemaElement[];
  attributes: AttributeDefinition[];
  gsis?: GlobalSecondaryIndex[];
  streamSpecification?: StreamSpecification;
};

function buildTableDefs(prefix: string): TableDef[] {
  const tables = getTableNames(prefix);

  return [
    {
      name: tables.runs,
      keys: [{ AttributeName: "runId", KeyType: "HASH" }],
      attributes: [
        { AttributeName: "runId", AttributeType: "S" },
        { AttributeName: "workflowName", AttributeType: "S" },
        { AttributeName: "status", AttributeType: "S" },
      ],
      gsis: [
        {
          IndexName: GSI.runs.workflowName,
          KeySchema: [
            { AttributeName: "workflowName", KeyType: "HASH" },
            { AttributeName: "runId", KeyType: "RANGE" },
          ],
          Projection: { ProjectionType: "ALL" },
        },
        {
          IndexName: GSI.runs.status,
          KeySchema: [
            { AttributeName: "status", KeyType: "HASH" },
            { AttributeName: "runId", KeyType: "RANGE" },
          ],
          Projection: { ProjectionType: "ALL" },
        },
      ],
    },
    {
      name: tables.steps,
      keys: [{ AttributeName: "stepId", KeyType: "HASH" }],
      attributes: [
        { AttributeName: "stepId", AttributeType: "S" },
        { AttributeName: "runId", AttributeType: "S" },
      ],
      gsis: [
        {
          IndexName: GSI.steps.run,
          KeySchema: [
            { AttributeName: "runId", KeyType: "HASH" },
            { AttributeName: "stepId", KeyType: "RANGE" },
          ],
          Projection: { ProjectionType: "ALL" },
        },
      ],
    },
    {
      name: tables.events,
      keys: [
        { AttributeName: "runId", KeyType: "HASH" },
        { AttributeName: "eventId", KeyType: "RANGE" },
      ],
      attributes: [
        { AttributeName: "runId", AttributeType: "S" },
        { AttributeName: "eventId", AttributeType: "S" },
        { AttributeName: "correlationId", AttributeType: "S" },
      ],
      gsis: [
        {
          IndexName: GSI.events.correlation,
          KeySchema: [
            { AttributeName: "correlationId", KeyType: "HASH" },
            { AttributeName: "eventId", KeyType: "RANGE" },
          ],
          Projection: { ProjectionType: "ALL" },
        },
      ],
    },
    {
      name: tables.hooks,
      keys: [{ AttributeName: "hookId", KeyType: "HASH" }],
      attributes: [
        { AttributeName: "hookId", AttributeType: "S" },
        { AttributeName: "runId", AttributeType: "S" },
        { AttributeName: "token", AttributeType: "S" },
      ],
      gsis: [
        {
          IndexName: GSI.hooks.run,
          KeySchema: [
            { AttributeName: "runId", KeyType: "HASH" },
            { AttributeName: "hookId", KeyType: "RANGE" },
          ],
          Projection: { ProjectionType: "ALL" },
        },
        {
          IndexName: GSI.hooks.token,
          KeySchema: [{ AttributeName: "token", KeyType: "HASH" }],
          Projection: { ProjectionType: "ALL" },
        },
      ],
    },
    {
      name: tables.waits,
      keys: [{ AttributeName: "waitId", KeyType: "HASH" }],
      attributes: [
        { AttributeName: "waitId", AttributeType: "S" },
        { AttributeName: "runId", AttributeType: "S" },
      ],
      gsis: [
        {
          IndexName: GSI.waits.run,
          KeySchema: [
            { AttributeName: "runId", KeyType: "HASH" },
            { AttributeName: "waitId", KeyType: "RANGE" },
          ],
          Projection: { ProjectionType: "ALL" },
        },
      ],
    },
    {
      name: tables.streams,
      keys: [
        { AttributeName: "streamId", KeyType: "HASH" },
        { AttributeName: "chunkId", KeyType: "RANGE" },
      ],
      attributes: [
        { AttributeName: "streamId", AttributeType: "S" },
        { AttributeName: "chunkId", AttributeType: "S" },
        { AttributeName: "runId", AttributeType: "S" },
      ],
      gsis: [
        {
          IndexName: GSI.streams.run,
          KeySchema: [
            { AttributeName: "runId", KeyType: "HASH" },
            { AttributeName: "streamId", KeyType: "RANGE" },
          ],
          Projection: { ProjectionType: "ALL" },
        },
      ],
      streamSpecification: {
        StreamEnabled: true,
        StreamViewType: "NEW_IMAGE",
      },
    },
  ];
}

async function tableExists(
  client: DynamoDBClient,
  tableName: string
): Promise<boolean> {
  try {
    await client.send(new DescribeTableCommand({ TableName: tableName }));
    return true;
  } catch (e) {
    if (e instanceof Error && e.name === "ResourceNotFoundException") {
      return false;
    }
    throw e;
  }
}

async function createTable(
  client: DynamoDBClient,
  def: TableDef
): Promise<void> {
  if (await tableExists(client, def.name)) {
    console.log(`  Table ${def.name} already exists, skipping`);
    return;
  }

  await client.send(
    new CreateTableCommand({
      TableName: def.name,
      KeySchema: def.keys,
      AttributeDefinitions: def.attributes,
      BillingMode: "PAY_PER_REQUEST",
      ...(def.gsis?.length ? { GlobalSecondaryIndexes: def.gsis } : {}),
      ...(def.streamSpecification
        ? { StreamSpecification: def.streamSpecification }
        : {}),
    })
  );

  console.log(`  Created table ${def.name}`);
}

async function queueExists(
  client: SQSClientType,
  queueName: string
): Promise<boolean> {
  try {
    await client.send(new GetQueueUrlCommand({ QueueName: queueName }));
    return true;
  } catch (e) {
    if (e instanceof Error && e.name === "QueueDoesNotExist") {
      return false;
    }
    throw e;
  }
}

async function createSQSQueue(
  client: SQSClientType,
  queueName: string,
  dlqArn?: string
): Promise<string> {
  if (await queueExists(client, queueName)) {
    console.log(`  Queue ${queueName} already exists, skipping`);
    const result = await client.send(
      new GetQueueUrlCommand({ QueueName: queueName })
    );
    return result.QueueUrl!;
  }

  const attributes: Record<string, string> = {
    VisibilityTimeout: "900", // 15 minutes
  };

  if (dlqArn) {
    attributes.RedrivePolicy = JSON.stringify({
      deadLetterTargetArn: dlqArn,
      maxReceiveCount: 3,
    });
  }

  const result = await client.send(
    new CreateQueueCommand({
      QueueName: queueName,
      Attributes: attributes,
    })
  );

  console.log(`  Created queue ${queueName}`);
  return result.QueueUrl!;
}

async function main() {
  const configOverride: AWSWorldConfig = {};

  // Parse CLI args
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--region" && args[i + 1]) {
      configOverride.region = args[++i];
    } else if (args[i] === "--prefix" && args[i + 1]) {
      configOverride.tablePrefix = args[++i];
      configOverride.queuePrefix = args[i];
    } else if (args[i] === "--endpoint" && args[i + 1]) {
      configOverride.endpoint = args[++i];
    }
  }

  const config = resolveConfig(configOverride);
  console.log("Setting up AWS World infrastructure...");
  console.log(`  Region: ${config.region}`);
  console.log(`  Table prefix: ${config.tablePrefix}`);
  console.log(`  Queue prefix: ${config.queuePrefix}`);
  if (config.endpoint) {
    console.log(`  Endpoint: ${config.endpoint}`);
  }

  const ddbClient = new DDBClient({
    region: config.region,
    ...(config.endpoint ? { endpoint: config.endpoint } : {}),
  });

  const sqsClient = new SQSClient({
    region: config.region,
    ...(config.endpoint ? { endpoint: config.endpoint } : {}),
  });

  // Create DynamoDB tables
  console.log("\nCreating DynamoDB tables...");
  const tableDefs = buildTableDefs(config.tablePrefix);
  for (const def of tableDefs) {
    await createTable(ddbClient, def);
  }

  // Create SQS queues (DLQs first, then main queues)
  console.log("\nCreating SQS queues...");

  await createSQSQueue(sqsClient, `${config.queuePrefix}-workflows-dlq`);
  await createSQSQueue(sqsClient, `${config.queuePrefix}-steps-dlq`);

  // Extract DLQ ARN from URL for RedrivePolicy
  // For local development with endpoint, use a placeholder ARN
  const accountId = process.env.AWS_ACCOUNT_ID ?? "000000000000";
  const workflowsDlqArn = `arn:aws:sqs:${config.region}:${accountId}:${config.queuePrefix}-workflows-dlq`;
  const stepsDlqArn = `arn:aws:sqs:${config.region}:${accountId}:${config.queuePrefix}-steps-dlq`;

  await createSQSQueue(
    sqsClient,
    `${config.queuePrefix}-workflows`,
    workflowsDlqArn
  );
  await createSQSQueue(sqsClient, `${config.queuePrefix}-steps`, stepsDlqArn);

  console.log("\nSetup complete!");
  console.log("\nTo use this world, set:");
  console.log("  WORKFLOW_TARGET_WORLD=@wraps.dev/world-aws");

  ddbClient.destroy();
  sqsClient.destroy();
}

main().catch((e) => {
  console.error("Setup failed:", e);
  process.exit(1);
});
