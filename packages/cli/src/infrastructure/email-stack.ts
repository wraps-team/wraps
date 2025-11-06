import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import { EmailStackConfig, StackOutputs } from '../types/index.js';
import { createVercelOIDC } from './vercel-oidc.js';
import { createIAMRole } from './resources/iam.js';
import { createSESResources } from './resources/ses.js';
import { createDynamoDBTables } from './resources/dynamodb.js';
import { deployLambdaFunctions } from './resources/lambda.js';

/**
 * Deploy email infrastructure stack using Pulumi
 */
export async function deployEmailStack(config: EmailStackConfig): Promise<StackOutputs> {
  // Get current AWS account
  const identity = await aws.getCallerIdentity();
  const accountId = identity.accountId;

  let oidcProvider: aws.iam.OpenIdConnectProvider | undefined;

  // 1. Create OIDC provider if Vercel
  if (config.provider === 'vercel' && config.vercel) {
    oidcProvider = await createVercelOIDC({
      teamSlug: config.vercel.teamSlug,
      accountId,
    });
  }

  // 2. Create IAM role
  const role = await createIAMRole({
    provider: config.provider,
    oidcProvider,
    vercelTeamSlug: config.vercel?.teamSlug,
    vercelProjectName: config.vercel?.projectName,
    integrationLevel: config.integrationLevel,
  });

  // 3. SES resources (if enhanced)
  let sesResources;
  if (config.integrationLevel === 'enhanced') {
    sesResources = await createSESResources({
      domain: config.domain,
      region: config.region,
    });
  }

  // 4. DynamoDB tables (if enhanced)
  let dynamoTables;
  if (config.integrationLevel === 'enhanced') {
    dynamoTables = await createDynamoDBTables();
  }

  // 5. Lambda functions (if enhanced)
  let lambdaFunctions;
  if (config.integrationLevel === 'enhanced' && sesResources && dynamoTables) {
    lambdaFunctions = await deployLambdaFunctions({
      roleArn: role.arn,
      tableName: dynamoTables.emailHistory.name,
      bounceComplaintTopicArn: sesResources.bounceComplaintTopic.arn,
      webhookUrl: config.webhookUrl,
    });
  }

  // Return outputs
  return {
    roleArn: role.arn as any as string,
    configSetName: sesResources?.configSet.name as any as string | undefined,
    tableName: dynamoTables?.emailHistory.name as any as string | undefined,
    region: config.region,
    lambdaFunctions: lambdaFunctions
      ? [
          lambdaFunctions.eventProcessor.arn as any as string,
          lambdaFunctions.webhookSender.arn as any as string,
        ]
      : undefined,
    domain: config.domain,
    dkimTokens: sesResources?.dkimTokens as any as string[] | undefined,
    dnsAutoCreated: sesResources?.dnsAutoCreated,
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
      projectName: 'byo-email',
      program,
    },
    {
      workDir: process.env.HOME + '/.byo/pulumi',
    }
  );

  // Set AWS region
  await stack.setConfig('aws:region', { value: 'us-east-1' });

  // Run the deployment
  const upResult = await stack.up({ onOutput: (msg) => process.stdout.write(msg) });

  // Get outputs
  const outputs = upResult.outputs;

  return {
    roleArn: outputs.roleArn?.value as string,
    configSetName: outputs.configSetName?.value as string | undefined,
    tableName: outputs.tableName?.value as string | undefined,
    region: outputs.region?.value as string,
  };
}
