import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import type { EmailStackConfig, StackOutputs } from "../types/index.js";
import { createDynamoDBTables } from "./resources/dynamodb.js";
import { createEventBridgeResources } from "./resources/eventbridge.js";
import { createIAMRole } from "./resources/iam.js";
import { deployLambdaFunctions } from "./resources/lambda.js";
import { createSESResources } from "./resources/ses.js";
import { createSQSResources } from "./resources/sqs.js";
import { createVercelOIDC } from "./vercel-oidc.js";

/**
 * Deploy email infrastructure stack using Pulumi
 */
export async function deployEmailStack(
  config: EmailStackConfig
): Promise<StackOutputs> {
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

  const emailConfig = config.emailConfig;

  // 2. Create IAM role
  const role = await createIAMRole({
    provider: config.provider,
    oidcProvider,
    vercelTeamSlug: config.vercel?.teamSlug,
    vercelProjectName: config.vercel?.projectName,
    emailConfig,
  });

  // 3. SES resources (if tracking or event tracking enabled)
  let sesResources;
  if (emailConfig.tracking?.enabled || emailConfig.eventTracking?.enabled) {
    sesResources = await createSESResources({
      domain: emailConfig.domain,
      region: config.region,
      trackingConfig: emailConfig.tracking,
      eventTypes: emailConfig.eventTracking?.events,
    });
  }

  // 4. DynamoDB tables (if history storage enabled)
  let dynamoTables;
  if (emailConfig.eventTracking?.dynamoDBHistory) {
    dynamoTables = await createDynamoDBTables({
      retention: emailConfig.eventTracking.archiveRetention,
    });
  }

  // 5. SQS queues (if event tracking enabled)
  let sqsResources;
  if (emailConfig.eventTracking?.enabled) {
    sqsResources = await createSQSResources();
  }

  // 6. EventBridge rule to route SES events to SQS (if event tracking enabled)
  if (emailConfig.eventTracking?.enabled && sesResources && sqsResources) {
    await createEventBridgeResources({
      eventBusArn: sesResources.eventBus.arn,
      queueArn: sqsResources.queue.arn,
      queueUrl: sqsResources.queue.url,
    });
  }

  // 7. Lambda functions (if event tracking and DynamoDB enabled)
  let lambdaFunctions;
  if (
    emailConfig.eventTracking?.dynamoDBHistory &&
    dynamoTables &&
    sqsResources
  ) {
    lambdaFunctions = await deployLambdaFunctions({
      roleArn: role.arn,
      tableName: dynamoTables.emailHistory.name,
      queueArn: sqsResources.queue.arn,
    });
  }

  // Return outputs
  return {
    roleArn: role.arn as any as string,
    configSetName: sesResources?.configSet.configurationSetName as any as
      | string
      | undefined,
    tableName: dynamoTables?.emailHistory.name as any as string | undefined,
    region: config.region,
    lambdaFunctions: lambdaFunctions
      ? [lambdaFunctions.eventProcessor.arn as any as string]
      : undefined,
    domain: emailConfig.domain,
    dkimTokens: sesResources?.dkimTokens as any as string[] | undefined,
    dnsAutoCreated: sesResources?.dnsAutoCreated,
    eventBusName: sesResources?.eventBus.name as any as string | undefined,
    queueUrl: sqsResources?.queue.url as any as string | undefined,
    dlqUrl: sqsResources?.dlq.url as any as string | undefined,
    customTrackingDomain: sesResources?.customTrackingDomain,
  };
}

/**
 * Run Pulumi program inline
 */
export async function runPulumiProgram(
  stackName: string,
  program: () => Promise<StackOutputs>
): Promise<StackOutputs> {
  const stack = await pulumi.automation.LocalWorkspace.createOrSelectStack(
    {
      stackName,
      projectName: "wraps-email",
      program,
    },
    {
      workDir: `${process.env.HOME}/.wraps/pulumi`,
    }
  );

  // Set AWS region
  await stack.setConfig("aws:region", { value: "us-east-1" });

  // Run the deployment
  const upResult = await stack.up({
    onOutput: (msg) => process.stdout.write(msg),
  });

  // Get outputs
  const outputs = upResult.outputs;

  return {
    roleArn: outputs.roleArn?.value as string,
    configSetName: outputs.configSetName?.value as string | undefined,
    tableName: outputs.tableName?.value as string | undefined,
    region: outputs.region?.value as string,
  };
}
