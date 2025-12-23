import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import type {
  Provider,
  SMSStackConfig,
  SMSStackOutputs,
  WrapsSMSConfig,
} from "../types/index.js";
import { createVercelOIDC } from "./vercel-oidc.js";

/**
 * Check if IAM role exists
 */
async function roleExists(roleName: string): Promise<boolean> {
  try {
    const { IAMClient, GetRoleCommand } = await import("@aws-sdk/client-iam");
    const iam = new IAMClient({
      region: process.env.AWS_REGION || "us-east-1",
    });
    await iam.send(new GetRoleCommand({ RoleName: roleName }));
    return true;
  } catch (error: any) {
    // AWS SDK v3 can return the error code in different places
    if (
      error.name === "NoSuchEntityException" ||
      error.Code === "NoSuchEntity" ||
      error.Error?.Code === "NoSuchEntity"
    ) {
      return false;
    }
    return false;
  }
}

/**
 * Check if DynamoDB table exists
 */
async function tableExists(tableName: string): Promise<boolean> {
  try {
    const { DynamoDBClient, DescribeTableCommand } = await import(
      "@aws-sdk/client-dynamodb"
    );
    const dynamodb = new DynamoDBClient({
      region: process.env.AWS_REGION || "us-east-1",
    });
    await dynamodb.send(new DescribeTableCommand({ TableName: tableName }));
    return true;
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      "name" in error &&
      error.name === "ResourceNotFoundException"
    ) {
      return false;
    }
    return false;
  }
}

/**
 * Create IAM role for SMS infrastructure
 */
async function createSMSIAMRole(config: {
  provider: Provider;
  oidcProvider?: aws.iam.OpenIdConnectProvider;
  vercelTeamSlug?: string;
  vercelProjectName?: string;
  smsConfig: WrapsSMSConfig;
}): Promise<aws.iam.Role> {
  let assumeRolePolicy: pulumi.Output<string>;

  if (config.provider === "vercel" && config.oidcProvider) {
    // For Vercel, allow both OIDC (for SDK) and Lambda (for event processor)
    assumeRolePolicy = pulumi.interpolate`{
      "Version": "2012-10-17",
      "Statement": [
        {
          "Effect": "Allow",
          "Principal": {
            "Federated": "${config.oidcProvider.arn}"
          },
          "Action": "sts:AssumeRoleWithWebIdentity",
          "Condition": {
            "StringEquals": {
              "oidc.vercel.com/${config.vercelTeamSlug}:aud": "https://vercel.com/${config.vercelTeamSlug}"
            },
            "StringLike": {
              "oidc.vercel.com/${config.vercelTeamSlug}:sub": "owner:${config.vercelTeamSlug}:project:${config.vercelProjectName}:environment:*"
            }
          }
        },
        {
          "Effect": "Allow",
          "Principal": {
            "Service": "lambda.amazonaws.com"
          },
          "Action": "sts:AssumeRole"
        }
      ]
    }`;
  } else if (config.provider === "aws") {
    assumeRolePolicy = pulumi.output(`{
      "Version": "2012-10-17",
      "Statement": [{
        "Effect": "Allow",
        "Principal": {
          "Service": ["lambda.amazonaws.com", "ec2.amazonaws.com", "ecs-tasks.amazonaws.com"]
        },
        "Action": "sts:AssumeRole"
      }]
    }`);
  } else {
    throw new Error("Other providers not yet implemented");
  }

  const roleName = "wraps-sms-role";
  const exists = await roleExists(roleName);

  const role = exists
    ? new aws.iam.Role(
        roleName,
        {
          name: roleName,
          assumeRolePolicy,
          tags: {
            ManagedBy: "wraps-cli",
            Service: "sms",
            Provider: config.provider,
          },
        },
        {
          import: roleName,
          customTimeouts: { create: "2m", update: "2m", delete: "2m" },
        }
      )
    : new aws.iam.Role(
        roleName,
        {
          name: roleName,
          assumeRolePolicy,
          tags: {
            ManagedBy: "wraps-cli",
            Service: "sms",
            Provider: config.provider,
          },
        },
        {
          customTimeouts: { create: "2m", update: "2m", delete: "2m" },
        }
      );

  // Build policy statements based on enabled features
  const statements: Record<string, unknown>[] = [];

  // Always allow reading SMS metrics
  statements.push({
    Effect: "Allow",
    Action: [
      "sms-voice:DescribeAccountAttributes",
      "sms-voice:DescribeSpendLimits",
      "sms-voice:DescribeConfigurationSets",
      "sms-voice:DescribeOptOutLists",
      "sms-voice:DescribePools",
      "sms-voice:DescribePhoneNumbers",
      "cloudwatch:GetMetricData",
      "cloudwatch:GetMetricStatistics",
    ],
    Resource: "*",
  });

  // SMS sending permissions
  if (config.smsConfig.sendingEnabled !== false) {
    statements.push({
      Effect: "Allow",
      Action: ["sms-voice:SendTextMessage", "sms-voice:SendMediaMessage"],
      Resource: "*",
    });
  }

  // Opt-out management
  if (config.smsConfig.optOutManagement) {
    statements.push({
      Effect: "Allow",
      Action: [
        "sms-voice:PutOptedOutNumber",
        "sms-voice:DeleteOptedOutNumber",
        "sms-voice:DescribeOptedOutNumbers",
      ],
      Resource: "arn:aws:sms-voice:*:*:opt-out-list/wraps-sms-*",
    });
  }

  // DynamoDB access for history
  if (config.smsConfig.eventTracking?.dynamoDBHistory) {
    statements.push({
      Effect: "Allow",
      Action: [
        "dynamodb:PutItem",
        "dynamodb:GetItem",
        "dynamodb:Query",
        "dynamodb:Scan",
        "dynamodb:BatchGetItem",
        "dynamodb:DescribeTable",
      ],
      Resource: [
        "arn:aws:dynamodb:*:*:table/wraps-sms-*",
        "arn:aws:dynamodb:*:*:table/wraps-sms-*/index/*",
      ],
    });
  }

  // SNS access for event publishing
  if (config.smsConfig.eventTracking?.enabled) {
    statements.push({
      Effect: "Allow",
      Action: ["sns:Publish", "sns:GetTopicAttributes"],
      Resource: "arn:aws:sns:*:*:wraps-sms-*",
    });
  }

  // SQS access
  if (config.smsConfig.eventTracking?.enabled) {
    statements.push({
      Effect: "Allow",
      Action: [
        "sqs:SendMessage",
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sqs:GetQueueAttributes",
      ],
      Resource: "arn:aws:sqs:*:*:wraps-sms-*",
    });
  }

  // Lambda permissions for event processor
  if (config.smsConfig.eventTracking?.dynamoDBHistory) {
    statements.push({
      Effect: "Allow",
      Action: [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents",
      ],
      Resource: "arn:aws:logs:*:*:log-group:/aws/lambda/wraps-sms-*",
    });
  }

  // Attach policy to role
  new aws.iam.RolePolicy("wraps-sms-policy", {
    role: role.name,
    policy: JSON.stringify({
      Version: "2012-10-17",
      Statement: statements,
    }),
  });

  return role;
}

/**
 * Create SMS Configuration Set
 */
function createSMSConfigurationSet(): aws.pinpoint.Smsvoicev2ConfigurationSet {
  return new aws.pinpoint.Smsvoicev2ConfigurationSet("wraps-sms-config", {
    name: "wraps-sms-config",
    defaultMessageType: "TRANSACTIONAL",
    tags: {
      ManagedBy: "wraps-cli",
      Service: "sms",
    },
  });
}

/**
 * Create SMS Opt-Out List
 */
function createSMSOptOutList(): aws.pinpoint.Smsvoicev2OptOutList {
  return new aws.pinpoint.Smsvoicev2OptOutList("wraps-sms-optouts", {
    name: "wraps-sms-optouts",
    tags: {
      ManagedBy: "wraps-cli",
      Service: "sms",
    },
  });
}

/**
 * Check if a wraps-managed phone number already exists
 */
async function findExistingPhoneNumber(
  phoneNumberType: string
): Promise<string | null> {
  try {
    const { PinpointSMSVoiceV2Client, DescribePhoneNumbersCommand } =
      await import("@aws-sdk/client-pinpoint-sms-voice-v2");

    const client = new PinpointSMSVoiceV2Client({
      region: process.env.AWS_REGION || "us-east-1",
    });

    const numberTypeMap: Record<string, string> = {
      simulator: "SIMULATOR",
      "toll-free": "TOLL_FREE",
      "10dlc": "TEN_DLC",
      "short-code": "SHORT_CODE",
    };
    const targetType = numberTypeMap[phoneNumberType] || "SIMULATOR";

    const response = await client.send(new DescribePhoneNumbersCommand({}));

    // Find a phone number that matches our type and is managed by wraps
    for (const phone of response.PhoneNumbers || []) {
      if (phone.NumberType === targetType && phone.PhoneNumberArn) {
        // Check tags to see if it's managed by wraps
        const { ListTagsForResourceCommand } = await import(
          "@aws-sdk/client-pinpoint-sms-voice-v2"
        );
        const tagsResponse = await client.send(
          new ListTagsForResourceCommand({
            ResourceArn: phone.PhoneNumberArn,
          })
        );
        const isWrapsManaged = tagsResponse.Tags?.some(
          (t) => t.Key === "ManagedBy" && t.Value === "wraps-cli"
        );
        if (isWrapsManaged) {
          return phone.PhoneNumberArn;
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Request a phone number
 */
async function createSMSPhoneNumber(
  phoneNumberType: string,
  optOutList: aws.pinpoint.Smsvoicev2OptOutList
): Promise<aws.pinpoint.Smsvoicev2PhoneNumber> {
  // Map our phone number type to AWS number type
  const numberTypeMap: Record<string, string> = {
    simulator: "SIMULATOR",
    "toll-free": "TOLL_FREE",
    "10dlc": "TEN_DLC",
    "short-code": "SHORT_CODE",
  };

  // Check for existing phone number
  const existingArn = await findExistingPhoneNumber(phoneNumberType);

  const phoneConfig = {
    isoCountryCode: "US",
    messageType: "TRANSACTIONAL" as const,
    numberCapabilities: ["SMS"],
    numberType: numberTypeMap[phoneNumberType] || "SIMULATOR",
    optOutListName: optOutList.name,
    deletionProtectionEnabled: false,
    tags: {
      ManagedBy: "wraps-cli",
      Service: "sms",
    },
  };

  if (existingArn) {
    return new aws.pinpoint.Smsvoicev2PhoneNumber(
      "wraps-sms-number",
      phoneConfig,
      {
        import: existingArn,
        customTimeouts: { create: "2m", update: "2m", delete: "2m" },
      }
    );
  }

  return new aws.pinpoint.Smsvoicev2PhoneNumber(
    "wraps-sms-number",
    phoneConfig,
    {
      // Toll-free numbers stay in PENDING status until registration
      // Don't wait for ACTIVE status - return once provisioned
      customTimeouts: {
        create: "2m",
        update: "2m",
        delete: "2m",
      },
    }
  );
}

// Note: Phone pools are created via AWS SDK after Pulumi deployment
// to avoid serialization issues with dynamic providers

/**
 * Check if SQS queue exists
 */
async function sqsQueueExists(queueName: string): Promise<string | null> {
  try {
    const { SQSClient, GetQueueUrlCommand } = await import(
      "@aws-sdk/client-sqs"
    );
    const sqs = new SQSClient({
      region: process.env.AWS_REGION || "us-east-1",
    });
    const response = await sqs.send(
      new GetQueueUrlCommand({ QueueName: queueName })
    );
    return response.QueueUrl || null;
  } catch {
    return null;
  }
}

/**
 * Create SQS queues for event processing
 */
async function createSMSSQSResources(): Promise<{
  queue: aws.sqs.Queue;
  dlq: aws.sqs.Queue;
}> {
  const dlqName = "wraps-sms-events-dlq";
  const queueName = "wraps-sms-events";

  const dlqUrl = await sqsQueueExists(dlqName);
  const queueUrl = await sqsQueueExists(queueName);

  const dlqConfig = {
    name: dlqName,
    messageRetentionSeconds: 1_209_600, // 14 days
    tags: {
      ManagedBy: "wraps-cli",
      Service: "sms",
      Description: "Dead letter queue for failed SMS event processing",
    },
  };

  const dlq = dlqUrl
    ? new aws.sqs.Queue(dlqName, dlqConfig, {
        import: dlqUrl,
        customTimeouts: { create: "2m", update: "2m", delete: "2m" },
      })
    : new aws.sqs.Queue(dlqName, dlqConfig, {
        customTimeouts: { create: "2m", update: "2m", delete: "2m" },
      });

  const queueConfig = {
    name: queueName,
    visibilityTimeoutSeconds: 300, // 5 minutes
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
      Service: "sms",
      Description: "Queue for SMS events from SNS",
    },
  };

  const queue = queueUrl
    ? new aws.sqs.Queue(queueName, queueConfig, {
        import: queueUrl,
        customTimeouts: { create: "2m", update: "2m", delete: "2m" },
      })
    : new aws.sqs.Queue(queueName, queueConfig, {
        customTimeouts: { create: "2m", update: "2m", delete: "2m" },
      });

  return { queue, dlq };
}

/**
 * Check if SNS topic exists
 */
async function snsTopicExists(topicName: string): Promise<string | null> {
  try {
    const { SNSClient, ListTopicsCommand } = await import(
      "@aws-sdk/client-sns"
    );
    const sns = new SNSClient({
      region: process.env.AWS_REGION || "us-east-1",
    });
    let nextToken: string | undefined;

    do {
      const response = await sns.send(
        new ListTopicsCommand({ NextToken: nextToken })
      );
      const found = response.Topics?.find((t) =>
        t.TopicArn?.endsWith(`:${topicName}`)
      );
      if (found?.TopicArn) {
        return found.TopicArn;
      }
      nextToken = response.NextToken;
    } while (nextToken);

    return null;
  } catch {
    return null;
  }
}

/**
 * Create SNS topic for SMS events
 * AWS End User Messaging sends events to SNS topics (not EventBridge)
 */
async function createSMSSNSResources(config: {
  queueArn: pulumi.Output<string>;
  queueUrl: pulumi.Output<string>;
}): Promise<{
  topic: aws.sns.Topic;
  subscription: aws.sns.TopicSubscription;
}> {
  const topicName = "wraps-sms-events";
  const topicArn = await snsTopicExists(topicName);

  const topicConfig = {
    name: topicName,
    tags: {
      ManagedBy: "wraps-cli",
      Service: "sms",
      Description: "SNS topic for SMS delivery events",
    },
  };

  // SNS topic for SMS events
  const topic = topicArn
    ? new aws.sns.Topic("wraps-sms-events-topic", topicConfig, {
        import: topicArn,
        customTimeouts: { create: "2m", update: "2m", delete: "2m" },
      })
    : new aws.sns.Topic("wraps-sms-events-topic", topicConfig, {
        customTimeouts: { create: "2m", update: "2m", delete: "2m" },
      });

  // SNS topic policy to allow SMS service to publish events
  new aws.sns.TopicPolicy("wraps-sms-events-topic-policy", {
    arn: topic.arn,
    policy: topic.arn.apply((topicArn) =>
      JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Sid: "AllowSMSServicePublish",
            Effect: "Allow",
            Principal: { Service: "sms-voice.amazonaws.com" },
            Action: "sns:Publish",
            Resource: topicArn,
          },
        ],
      })
    ),
  });

  // SQS queue policy to allow SNS to send messages
  new aws.sqs.QueuePolicy("wraps-sms-events-queue-policy", {
    queueUrl: config.queueUrl,
    policy: pulumi
      .all([config.queueArn, topic.arn])
      .apply(([queueArn, topicArn]) =>
        JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: { Service: "sns.amazonaws.com" },
              Action: "sqs:SendMessage",
              Resource: queueArn,
              Condition: {
                ArnEquals: { "aws:SourceArn": topicArn },
              },
            },
          ],
        })
      ),
  });

  // Subscribe SQS queue to SNS topic
  const subscription = new aws.sns.TopicSubscription(
    "wraps-sms-events-subscription",
    {
      topic: topic.arn,
      protocol: "sqs",
      endpoint: config.queueArn,
      rawMessageDelivery: true, // Deliver raw message without SNS envelope
    }
  );

  return { topic, subscription };
}

// Note: Event destinations are created via AWS SDK after Pulumi deployment
// to avoid serialization issues with dynamic providers

/**
 * Create DynamoDB table for SMS history
 */
async function createSMSDynamoDBTable(): Promise<aws.dynamodb.Table> {
  const tableName = "wraps-sms-history";
  const exists = await tableExists(tableName);

  const tableConfig = {
    name: tableName,
    billingMode: "PAY_PER_REQUEST" as const,
    hashKey: "messageId",
    rangeKey: "sentAt",
    attributes: [
      { name: "messageId", type: "S" as const },
      { name: "sentAt", type: "N" as const },
      { name: "accountId", type: "S" as const },
      { name: "destinationNumber", type: "S" as const },
    ],
    globalSecondaryIndexes: [
      {
        name: "accountId-sentAt-index",
        hashKey: "accountId",
        rangeKey: "sentAt",
        projectionType: "ALL" as const,
      },
      {
        name: "destinationNumber-sentAt-index",
        hashKey: "destinationNumber",
        rangeKey: "sentAt",
        projectionType: "ALL" as const,
      },
    ],
    ttl: {
      enabled: true,
      attributeName: "expiresAt",
    },
    tags: {
      ManagedBy: "wraps-cli",
      Service: "sms",
    },
  };

  return exists
    ? new aws.dynamodb.Table(tableName, tableConfig, {
        import: tableName,
        customTimeouts: { create: "5m", update: "5m", delete: "5m" },
      })
    : new aws.dynamodb.Table(tableName, tableConfig, {
        customTimeouts: { create: "5m", update: "5m", delete: "5m" },
      });
}

/**
 * Deploy Lambda event processor
 */
async function deploySMSLambdaFunction(config: {
  tableName: pulumi.Output<string>;
  queueArn: pulumi.Output<string>;
  accountId: string;
  region: string;
}): Promise<aws.lambda.Function> {
  // Bundle Lambda code
  const { getLambdaCode } = await import("./resources/lambda.js");
  const codeDir = await getLambdaCode("sms-event-processor");

  // Create dedicated Lambda execution role (like email stack does)
  const lambdaRole = new aws.iam.Role("wraps-sms-lambda-role", {
    name: "wraps-sms-lambda-role",
    assumeRolePolicy: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: { Service: "lambda.amazonaws.com" },
          Action: "sts:AssumeRole",
        },
      ],
    }),
    tags: {
      ManagedBy: "wraps-cli",
      Service: "sms",
    },
  });

  // Attach basic Lambda execution policy (CloudWatch Logs)
  new aws.iam.RolePolicyAttachment("wraps-sms-lambda-basic-execution", {
    role: lambdaRole.name,
    policyArn:
      "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
  });

  // Lambda policy for DynamoDB and SQS
  new aws.iam.RolePolicy("wraps-sms-lambda-policy", {
    role: lambdaRole.name,
    policy: pulumi
      .all([config.tableName, config.queueArn])
      .apply(([tableName, queueArn]) =>
        JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: [
                "dynamodb:PutItem",
                "dynamodb:GetItem",
                "dynamodb:Query",
                "dynamodb:UpdateItem",
              ],
              Resource: [
                `arn:aws:dynamodb:*:*:table/${tableName}`,
                `arn:aws:dynamodb:*:*:table/${tableName}/index/*`,
              ],
            },
            {
              Effect: "Allow",
              Action: [
                "sqs:ReceiveMessage",
                "sqs:DeleteMessage",
                "sqs:GetQueueAttributes",
              ],
              Resource: queueArn,
            },
          ],
        })
      ),
  });

  // Create Lambda function
  const eventProcessor = new aws.lambda.Function(
    "wraps-sms-event-processor",
    {
      name: "wraps-sms-event-processor",
      runtime: "nodejs20.x",
      handler: "index.handler",
      role: lambdaRole.arn,
      code: new pulumi.asset.FileArchive(codeDir),
      timeout: 300, // 5 minutes
      memorySize: 512,
      environment: {
        variables: {
          TABLE_NAME: config.tableName,
          AWS_ACCOUNT_ID: config.accountId,
        },
      },
      tags: {
        ManagedBy: "wraps-cli",
        Service: "sms",
      },
    },
    {
      dependsOn: [lambdaRole],
      customTimeouts: { create: "5m", update: "5m", delete: "2m" },
    }
  );

  // Create event source mapping from SQS
  new aws.lambda.EventSourceMapping(
    "wraps-sms-event-source-mapping",
    {
      eventSourceArn: config.queueArn,
      functionName: eventProcessor.name,
      batchSize: 10,
      maximumBatchingWindowInSeconds: 5,
      functionResponseTypes: ["ReportBatchItemFailures"],
    },
    {
      customTimeouts: { create: "2m", update: "2m", delete: "2m" },
    }
  );

  return eventProcessor;
}

/**
 * Deploy SMS infrastructure stack using Pulumi
 */
export async function deploySMSStack(
  config: SMSStackConfig
): Promise<SMSStackOutputs> {
  // Get current AWS account
  const identity = await aws.getCallerIdentity();
  const accountId = identity.accountId;

  let oidcProvider: aws.iam.OpenIdConnectProvider | undefined;

  // 1. Create OIDC provider if Vercel
  if (config.provider === "vercel" && config.vercel) {
    oidcProvider = await createVercelOIDC({
      teamSlug: config.vercel.teamSlug,
      accountId,
    });
  }

  const smsConfig = config.smsConfig;

  // 2. Create IAM role
  const role = await createSMSIAMRole({
    provider: config.provider,
    oidcProvider,
    vercelTeamSlug: config.vercel?.teamSlug,
    vercelProjectName: config.vercel?.projectName,
    smsConfig,
  });

  // 3. Create opt-out list
  const optOutList = createSMSOptOutList();

  // 4. Create configuration set
  const configSet = createSMSConfigurationSet();

  // 5. Create phone number (if phone number type is specified)
  let phoneNumber: aws.pinpoint.Smsvoicev2PhoneNumber | undefined;
  if (smsConfig.phoneNumberType) {
    phoneNumber = await createSMSPhoneNumber(
      smsConfig.phoneNumberType,
      optOutList
    );
    // Note: Phone pool is created via AWS SDK after Pulumi deployment
  }

  // 6. Create SQS queues (if event tracking enabled)
  let sqsResources;
  if (smsConfig.eventTracking?.enabled) {
    sqsResources = await createSMSSQSResources();
  }

  // 7. Create SNS topic (if event tracking enabled)
  let snsResources;
  if (smsConfig.eventTracking?.enabled && sqsResources) {
    snsResources = await createSMSSNSResources({
      queueArn: sqsResources.queue.arn,
      queueUrl: sqsResources.queue.url,
    });
    // Note: Event destination is created via AWS SDK after Pulumi deployment
  }

  // 8. Create DynamoDB table (if history storage enabled)
  let dynamoTable;
  if (smsConfig.eventTracking?.dynamoDBHistory) {
    dynamoTable = await createSMSDynamoDBTable();
  }

  // 9. Deploy Lambda function (if event tracking + DynamoDB enabled)
  let lambdaFunction;
  if (smsConfig.eventTracking?.dynamoDBHistory && dynamoTable && sqsResources) {
    lambdaFunction = await deploySMSLambdaFunction({
      tableName: dynamoTable.name,
      queueArn: sqsResources.queue.arn,
      accountId,
      region: config.region,
    });
  }

  // Return outputs
  return {
    roleArn: role.arn as unknown as string,
    phoneNumber: phoneNumber?.phoneNumber as unknown as string | undefined,
    phoneNumberArn: phoneNumber?.arn as unknown as string | undefined,
    phoneNumberType: smsConfig.phoneNumberType || "simulator",
    configSetName: configSet.name as unknown as string | undefined,
    tableName: dynamoTable?.name as unknown as string | undefined,
    region: config.region,
    lambdaFunctions: lambdaFunction
      ? [lambdaFunction.arn as unknown as string]
      : undefined,
    snsTopicArn: snsResources?.topic.arn as unknown as string | undefined,
    queueUrl: sqsResources?.queue.url as unknown as string | undefined,
    dlqUrl: sqsResources?.dlq.url as unknown as string | undefined,
    optOutListArn: optOutList.arn as unknown as string | undefined,
  };
}

/**
 * Create SMS Phone Pool using AWS SDK (called after Pulumi deployment)
 * This is separate from Pulumi to avoid dynamic provider serialization issues
 */
export async function createSMSPhonePoolWithSDK(
  phoneNumberArn: string,
  region: string
): Promise<string | undefined> {
  const { PinpointSMSVoiceV2Client, CreatePoolCommand, DescribePoolsCommand } =
    await import("@aws-sdk/client-pinpoint-sms-voice-v2");

  const client = new PinpointSMSVoiceV2Client({ region });

  // Check if pool already exists by listing all pools
  try {
    const existing = await client.send(new DescribePoolsCommand({}));
    if (existing.Pools && existing.Pools.length > 0) {
      // Find pool that contains this phone number
      for (const pool of existing.Pools) {
        if (pool.PoolId) {
          return pool.PoolId;
        }
      }
    }
  } catch {
    // Pool doesn't exist, create it
  }

  try {
    const response = await client.send(
      new CreatePoolCommand({
        OriginationIdentity: phoneNumberArn,
        IsoCountryCode: "US",
        MessageType: "TRANSACTIONAL",
        DeletionProtectionEnabled: false,
        Tags: [
          { Key: "ManagedBy", Value: "wraps-cli" },
          { Key: "Service", Value: "sms" },
        ],
      })
    );
    return response.PoolId;
  } catch {
    // Pool may already exist, phone number pending, or other error
    return;
  }
}

/**
 * Create SMS Event Destination using AWS SDK (called after Pulumi deployment)
 * This is separate from Pulumi to avoid dynamic provider serialization issues
 */
export async function createSMSEventDestinationWithSDK(
  configurationSetName: string,
  snsTopicArn: string,
  region: string
): Promise<string | undefined> {
  const {
    PinpointSMSVoiceV2Client,
    CreateEventDestinationCommand,
    DescribeConfigurationSetsCommand,
  } = await import("@aws-sdk/client-pinpoint-sms-voice-v2");

  const client = new PinpointSMSVoiceV2Client({ region });
  const eventDestinationName = "wraps-sms-sns-destination";

  // Check if event destination already exists
  try {
    const existing = await client.send(
      new DescribeConfigurationSetsCommand({
        ConfigurationSetNames: [configurationSetName],
      })
    );
    const configSet = existing.ConfigurationSets?.[0];
    if (configSet?.EventDestinations) {
      const existingDest = configSet.EventDestinations.find(
        (d) => d.EventDestinationName === eventDestinationName
      );
      if (existingDest) {
        return existingDest.EventDestinationName;
      }
    }
  } catch {
    // Config set may not exist yet
  }

  try {
    const response = await client.send(
      new CreateEventDestinationCommand({
        ConfigurationSetName: configurationSetName,
        EventDestinationName: eventDestinationName,
        MatchingEventTypes: ["ALL"],
        SnsDestination: {
          TopicArn: snsTopicArn,
        },
      })
    );
    return (
      response.EventDestination?.EventDestinationName || eventDestinationName
    );
  } catch {
    // Event destination may already exist
    return eventDestinationName;
  }
}

/**
 * Delete SMS Phone Pool using AWS SDK (called before Pulumi destroy)
 */
export async function deleteSMSPhonePoolWithSDK(region: string): Promise<void> {
  const {
    PinpointSMSVoiceV2Client,
    DeletePoolCommand,
    DescribePoolsCommand,
    ListTagsForResourceCommand,
  } = await import("@aws-sdk/client-pinpoint-sms-voice-v2");

  const client = new PinpointSMSVoiceV2Client({ region });

  try {
    // Find all pools and check their tags
    const existing = await client.send(new DescribePoolsCommand({}));
    if (existing.Pools) {
      for (const pool of existing.Pools) {
        if (!(pool.PoolArn && pool.PoolId)) continue;

        // Get tags for this pool
        const tagsResponse = await client.send(
          new ListTagsForResourceCommand({ ResourceArn: pool.PoolArn })
        );

        // Check if this pool is managed by wraps-cli
        const isWrapsPool = tagsResponse.Tags?.some(
          (t) => t.Key === "ManagedBy" && t.Value === "wraps-cli"
        );

        if (isWrapsPool) {
          await client.send(new DeletePoolCommand({ PoolId: pool.PoolId }));
        }
      }
    }
  } catch {
    // Pool may not exist
  }
}

/**
 * Delete SMS Event Destination using AWS SDK (called before Pulumi destroy)
 */
export async function deleteSMSEventDestinationWithSDK(
  configurationSetName: string,
  region: string
): Promise<void> {
  const { PinpointSMSVoiceV2Client, DeleteEventDestinationCommand } =
    await import("@aws-sdk/client-pinpoint-sms-voice-v2");

  const client = new PinpointSMSVoiceV2Client({ region });
  const eventDestinationName = "wraps-sms-sns-destination";

  try {
    await client.send(
      new DeleteEventDestinationCommand({
        ConfigurationSetName: configurationSetName,
        EventDestinationName: eventDestinationName,
      })
    );
  } catch {
    // Event destination may not exist
  }
}

/**
 * Create SMS Protect Configuration using AWS SDK
 * Configures country-specific messaging controls to prevent SMS pumping fraud
 */
export async function createSMSProtectConfigurationWithSDK(
  configurationSetName: string,
  region: string,
  options?: {
    allowedCountries?: string[];
    aitFiltering?: boolean;
  }
): Promise<string | undefined> {
  const {
    PinpointSMSVoiceV2Client,
    CreateProtectConfigurationCommand,
    UpdateProtectConfigurationCountryRuleSetCommand,
    AssociateProtectConfigurationCommand,
    DescribeProtectConfigurationsCommand,
    GetProtectConfigurationCountryRuleSetCommand,
    ListTagsForResourceCommand,
  } = await import("@aws-sdk/client-pinpoint-sms-voice-v2");

  const client = new PinpointSMSVoiceV2Client({ region });
  const protectConfigName = "wraps-sms-protect";

  // Check if protect configuration already exists by looking up tags
  let existingProtectConfigId: string | undefined;
  try {
    const existing = await client.send(
      new DescribeProtectConfigurationsCommand({})
    );

    // Check each protect config's tags to find ours
    for (const pc of existing.ProtectConfigurations || []) {
      if (!(pc.ProtectConfigurationArn && pc.ProtectConfigurationId)) continue;

      const tagsResponse = await client.send(
        new ListTagsForResourceCommand({
          ResourceArn: pc.ProtectConfigurationArn,
        })
      );

      const nameTag = tagsResponse.Tags?.find((t) => t.Key === "Name");
      if (nameTag?.Value === protectConfigName) {
        existingProtectConfigId = pc.ProtectConfigurationId;
        break;
      }
    }
  } catch {
    // May not exist yet
  }

  try {
    // Use existing or create new protect configuration
    let protectConfigId = existingProtectConfigId;

    if (!protectConfigId) {
      const createResponse = await client.send(
        new CreateProtectConfigurationCommand({
          DeletionProtectionEnabled: false,
          Tags: [
            { Key: "Name", Value: protectConfigName },
            { Key: "ManagedBy", Value: "wraps-cli" },
            { Key: "Service", Value: "sms" },
          ],
        })
      );
      protectConfigId = createResponse.ProtectConfigurationId;
    }

    if (!protectConfigId) {
      throw new Error("Failed to create protect configuration");
    }

    // Get all supported countries from the newly created protect config
    // AWS defaults all countries to ALLOW, so we need to get them all and BLOCK them
    const countryRuleSet = await client.send(
      new GetProtectConfigurationCountryRuleSetCommand({
        ProtectConfigurationId: protectConfigId,
        NumberCapability: "SMS",
      })
    );

    const allowedCountries = options?.allowedCountries || ["US"];
    const allowedSet = new Set(allowedCountries);

    // Build country rule set - BLOCK all countries except allowed ones
    const countryRuleSetUpdates: Record<
      string,
      { ProtectStatus: "ALLOW" | "BLOCK" | "MONITOR" | "FILTER" }
    > = {};

    // First, BLOCK all countries that exist in the rule set
    if (countryRuleSet.CountryRuleSet) {
      for (const countryCode of Object.keys(countryRuleSet.CountryRuleSet)) {
        if (allowedSet.has(countryCode)) {
          // Allow this country (with optional AIT filtering)
          countryRuleSetUpdates[countryCode] = {
            ProtectStatus: options?.aitFiltering ? "FILTER" : "ALLOW",
          };
        } else {
          // Block this country
          countryRuleSetUpdates[countryCode] = {
            ProtectStatus: "BLOCK",
          };
        }
      }
    }

    // Update country rules for SMS capability
    if (Object.keys(countryRuleSetUpdates).length > 0) {
      // AWS has a limit on batch updates, so we may need to chunk this
      const entries = Object.entries(countryRuleSetUpdates);
      const chunkSize = 100; // AWS limit per request

      for (let i = 0; i < entries.length; i += chunkSize) {
        const chunk = entries.slice(i, i + chunkSize);
        const chunkUpdates = Object.fromEntries(chunk);

        await client.send(
          new UpdateProtectConfigurationCountryRuleSetCommand({
            ProtectConfigurationId: protectConfigId,
            NumberCapability: "SMS",
            CountryRuleSetUpdates: chunkUpdates,
          })
        );
      }
    }

    // Associate with configuration set (only if not already associated)
    if (!existingProtectConfigId) {
      await client.send(
        new AssociateProtectConfigurationCommand({
          ProtectConfigurationId: protectConfigId,
          ConfigurationSetName: configurationSetName,
        })
      );
    }

    return protectConfigId;
  } catch {
    return;
  }
}

/**
 * Delete SMS Protect Configuration using AWS SDK
 */
export async function deleteSMSProtectConfigurationWithSDK(
  region: string
): Promise<void> {
  const {
    PinpointSMSVoiceV2Client,
    DeleteProtectConfigurationCommand,
    DescribeProtectConfigurationsCommand,
    ListTagsForResourceCommand,
  } = await import("@aws-sdk/client-pinpoint-sms-voice-v2");

  const client = new PinpointSMSVoiceV2Client({ region });

  try {
    // Find protect configurations managed by wraps-cli
    const existing = await client.send(
      new DescribeProtectConfigurationsCommand({})
    );

    if (existing.ProtectConfigurations) {
      for (const pc of existing.ProtectConfigurations) {
        if (!(pc.ProtectConfigurationArn && pc.ProtectConfigurationId))
          continue;

        // Check tags to see if managed by wraps-cli
        const tagsResponse = await client.send(
          new ListTagsForResourceCommand({
            ResourceArn: pc.ProtectConfigurationArn,
          })
        );

        const isWrapsManaged = tagsResponse.Tags?.some(
          (t) => t.Key === "ManagedBy" && t.Value === "wraps-cli"
        );

        if (isWrapsManaged) {
          await client.send(
            new DeleteProtectConfigurationCommand({
              ProtectConfigurationId: pc.ProtectConfigurationId,
            })
          );
        }
      }
    }
  } catch {
    // Protect configuration may not exist
  }
}
