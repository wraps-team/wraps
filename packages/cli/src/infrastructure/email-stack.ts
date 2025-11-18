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

  // 3. CloudFront + ACM (if HTTPS tracking enabled)
  let cloudFrontResources;
  let acmResources;

  if (
    emailConfig.tracking?.enabled &&
    emailConfig.tracking.customRedirectDomain &&
    emailConfig.tracking.httpsEnabled
  ) {
    // Check for Route53 hosted zone (for automatic DNS validation)
    const { findHostedZone } = await import("../utils/email/route53.js");
    const hostedZone = await findHostedZone(
      emailConfig.tracking.customRedirectDomain,
      config.region
    );

    // Create ACM certificate (in us-east-1 for CloudFront)
    const { createACMCertificate } = await import("./resources/acm.js");
    acmResources = await createACMCertificate({
      domain: emailConfig.tracking.customRedirectDomain,
      hostedZoneId: hostedZone?.id,
    });

    // Create CloudFront distribution with SSL certificate
    // Import CloudFront creation function
    const { createCloudFrontTracking } = await import(
      "./resources/cloudfront.js"
    );

    // Determine which certificate ARN to use:
    // - Route53: Use certificateValidation.certificateArn (waits for validation)
    // - Manual DNS: Use certificate.arn directly (CloudFront will fail if not validated)
    const certificateArn = acmResources.certificateValidation
      ? acmResources.certificateValidation.certificateArn
      : acmResources.certificate.arn;

    cloudFrontResources = await createCloudFrontTracking({
      customTrackingDomain: emailConfig.tracking.customRedirectDomain,
      region: config.region,
      certificateArn,
    });
  }

  // 4. SES resources (if tracking or event tracking enabled)
  let sesResources;
  if (emailConfig.tracking?.enabled || emailConfig.eventTracking?.enabled) {
    sesResources = await createSESResources({
      domain: emailConfig.domain,
      mailFromDomain: emailConfig.mailFromDomain,
      region: config.region,
      trackingConfig: emailConfig.tracking,
      eventTypes: emailConfig.eventTracking?.events,
    });
  }

  // 5. DynamoDB tables (if history storage enabled)
  let dynamoTables;
  if (emailConfig.eventTracking?.dynamoDBHistory) {
    dynamoTables = await createDynamoDBTables({
      retention: emailConfig.eventTracking.archiveRetention,
    });
  }

  // 6. SQS queues (if event tracking enabled)
  let sqsResources;
  if (emailConfig.eventTracking?.enabled) {
    sqsResources = await createSQSResources();
  }

  // 7. EventBridge rule to route SES events to SQS (if event tracking enabled)
  if (emailConfig.eventTracking?.enabled && sesResources && sqsResources) {
    await createEventBridgeResources({
      eventBusArn: sesResources.eventBus.arn,
      queueArn: sqsResources.queue.arn,
      queueUrl: sqsResources.queue.url,
    });
  }

  // 8. Lambda functions (if event tracking and DynamoDB enabled)
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
      accountId,
      region: config.region,
    });
  }

  // 9. Mail Manager Archive (if email archiving enabled)
  let archiveResources;
  if (emailConfig.emailArchiving?.enabled && sesResources) {
    const { createMailManagerArchive } = await import(
      "./resources/mail-manager.js"
    );
    archiveResources = await createMailManagerArchive({
      name: "email",
      retention: emailConfig.emailArchiving.retention,
      configSetName: sesResources.configSet.configurationSetName,
      region: config.region,
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
    httpsTrackingEnabled: emailConfig.tracking?.httpsEnabled,
    cloudFrontDomain: cloudFrontResources?.domainName as any as
      | string
      | undefined,
    acmCertificateValidationRecords: acmResources?.validationRecords as any as
      | Array<{ name: string; type: string; value: string }>
      | undefined,
    mailFromDomain: sesResources?.mailFromDomain,
    archiveArn: archiveResources?.archiveArn,
    archivingEnabled: emailConfig.emailArchiving?.enabled,
    archiveRetention: emailConfig.emailArchiving?.enabled
      ? emailConfig.emailArchiving.retention
      : undefined,
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
