import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { build } from "esbuild";

/**
 * Lambda configuration
 */
export type LambdaConfig = {
  roleArn: pulumi.Output<string>;
  tableName: pulumi.Output<string>;
  bounceComplaintTopicArn: pulumi.Output<string>;
  webhookUrl?: string;
};

/**
 * Lambda functions output
 */
export type LambdaFunctions = {
  eventProcessor: aws.lambda.Function;
  webhookSender: aws.lambda.Function;
};

/**
 * Bundle a Lambda function using esbuild
 */
async function bundleLambda(functionPath: string): Promise<string> {
  const buildId = randomBytes(8).toString("hex");
  const outdir = join(tmpdir(), `byo-lambda-${buildId}`);

  if (!existsSync(outdir)) {
    mkdirSync(outdir, { recursive: true });
  }

  // Bundle with esbuild
  await build({
    entryPoints: [functionPath],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "esm",
    outfile: join(outdir, "index.mjs"),
    external: ["@aws-sdk/*"], // AWS SDK v3 is included in Lambda runtime
    minify: true,
    sourcemap: false,
  });

  return outdir;
}

/**
 * Get the project root directory (where lambda/ folder is)
 */
function getProjectRoot(): string {
  // In development: __dirname is packages/cli/dist
  // In production: __dirname is packages/cli/dist
  // Lambda source is always at project_root/lambda

  // Get the CLI package directory
  const cliDir = process.cwd();

  // Try multiple locations
  const possibleRoots = [
    // Running from project root
    cliDir,
    // Running from packages/cli
    join(cliDir, "..", ".."),
    // Running from packages/cli/dist
    join(cliDir, "..", "..", ".."),
  ];

  for (const root of possibleRoots) {
    const lambdaDir = join(root, "lambda", "event-processor", "index.ts");
    if (existsSync(lambdaDir)) {
      return root;
    }
  }

  // Default to current directory
  return cliDir;
}

/**
 * Deploy Lambda functions for email event processing
 */
export async function deployLambdaFunctions(
  config: LambdaConfig
): Promise<LambdaFunctions> {
  // Get the Lambda source directory
  const projectRoot = getProjectRoot();
  const lambdaDir = join(projectRoot, "lambda");

  // Bundle event-processor
  const eventProcessorPath = join(lambdaDir, "event-processor", "index.ts");
  const eventProcessorBundle = await bundleLambda(eventProcessorPath);

  // Create Lambda execution role policy
  const lambdaAssumeRole = {
    Version: "2012-10-17",
    Statement: [
      {
        Action: "sts:AssumeRole",
        Principal: {
          Service: "lambda.amazonaws.com",
        },
        Effect: "Allow",
      },
    ],
  };

  const lambdaRole = new aws.iam.Role("byo-email-lambda-role", {
    assumeRolePolicy: JSON.stringify(lambdaAssumeRole),
    tags: {
      ManagedBy: "byo-cli",
    },
  });

  // Attach basic Lambda execution policy
  new aws.iam.RolePolicyAttachment("byo-email-lambda-basic-execution", {
    role: lambdaRole.name,
    policyArn:
      "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
  });

  // Attach DynamoDB and SNS permissions
  new aws.iam.RolePolicy("byo-email-lambda-policy", {
    role: lambdaRole.name,
    policy: pulumi
      .all([config.tableName, config.bounceComplaintTopicArn])
      .apply(([tableName, topicArn]) =>
        JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: [
                "dynamodb:PutItem",
                "dynamodb:GetItem",
                "dynamodb:Query",
              ],
              Resource: `arn:aws:dynamodb:*:*:table/${tableName}`,
            },
            {
              Effect: "Allow",
              Action: ["sns:Publish"],
              Resource: topicArn,
            },
          ],
        })
      ),
  });

  // Create event-processor Lambda
  const eventProcessor = new aws.lambda.Function("byo-email-event-processor", {
    name: "byo-email-event-processor",
    runtime: aws.lambda.Runtime.NodeJS20dX,
    handler: "index.handler",
    role: lambdaRole.arn,
    code: new pulumi.asset.FileArchive(eventProcessorBundle),
    timeout: 30,
    memorySize: 256,
    environment: {
      variables: {
        TABLE_NAME: config.tableName,
      },
    },
    tags: {
      ManagedBy: "byo-cli",
    },
  });

  // Allow SNS to invoke event-processor
  new aws.lambda.Permission("byo-email-event-processor-sns-permission", {
    action: "lambda:InvokeFunction",
    function: eventProcessor.name,
    principal: "sns.amazonaws.com",
    sourceArn: config.bounceComplaintTopicArn,
  });

  // Subscribe event-processor to SNS topic
  new aws.sns.TopicSubscription("byo-email-event-processor-subscription", {
    topic: config.bounceComplaintTopicArn,
    protocol: "lambda",
    endpoint: eventProcessor.arn,
  });

  // Bundle webhook-sender
  const webhookSenderPath = join(lambdaDir, "webhook-sender", "index.ts");
  const webhookSenderBundle = await bundleLambda(webhookSenderPath);

  // Create webhook-sender Lambda
  const webhookSender = new aws.lambda.Function("byo-email-webhook-sender", {
    name: "byo-email-webhook-sender",
    runtime: aws.lambda.Runtime.NodeJS20dX,
    handler: "index.handler",
    role: lambdaRole.arn,
    code: new pulumi.asset.FileArchive(webhookSenderBundle),
    timeout: 30,
    memorySize: 256,
    environment: {
      variables: {
        WEBHOOK_URL: config.webhookUrl || "",
      },
    },
    tags: {
      ManagedBy: "byo-cli",
    },
  });

  // Allow SNS to invoke webhook-sender
  new aws.lambda.Permission("byo-email-webhook-sender-sns-permission", {
    action: "lambda:InvokeFunction",
    function: webhookSender.name,
    principal: "sns.amazonaws.com",
    sourceArn: config.bounceComplaintTopicArn,
  });

  // Subscribe webhook-sender to SNS topic
  new aws.sns.TopicSubscription("byo-email-webhook-sender-subscription", {
    topic: config.bounceComplaintTopicArn,
    protocol: "lambda",
    endpoint: webhookSender.arn,
  });

  return {
    eventProcessor,
    webhookSender,
  };
}
