import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { build } from "esbuild";

/**
 * Get the package root directory (where package.json lives)
 * Works both in development (src/) and production (dist/)
 */
function getPackageRoot(): string {
  const currentFile = fileURLToPath(import.meta.url);
  let dir = dirname(currentFile);

  // Walk up the directory tree until we find package.json
  while (dir !== dirname(dir)) {
    if (existsSync(join(dir, "package.json"))) {
      return dir;
    }
    dir = dirname(dir);
  }

  throw new Error("Could not find package.json");
}

/**
 * Lambda configuration
 */
export type LambdaConfig = {
  roleArn: pulumi.Output<string>;
  tableName: pulumi.Output<string>;
  queueArn: pulumi.Output<string>;
  accountId: string;
};

/**
 * Lambda functions output
 */
export type LambdaFunctions = {
  eventProcessor: aws.lambda.Function;
  eventSourceMapping: aws.lambda.EventSourceMapping;
};

/**
 * Get the Lambda function code directory
 *
 * In production (published package), uses pre-bundled code from dist/lambda/
 * In development, bundles the TypeScript source on-the-fly
 */
async function getLambdaCode(functionName: string): Promise<string> {
  const packageRoot = getPackageRoot();

  // Check for pre-bundled Lambda code in dist/ (production - published package)
  const distLambdaPath = join(packageRoot, "dist", "lambda", functionName);
  const distBundleMarker = join(distLambdaPath, ".bundled");

  if (existsSync(distBundleMarker)) {
    // Use pre-bundled code from dist/
    return distLambdaPath;
  }

  // Check for pre-bundled Lambda code in lambda/ (development build)
  const lambdaPath = join(packageRoot, "lambda", functionName);
  const lambdaBundleMarker = join(lambdaPath, ".bundled");

  if (existsSync(lambdaBundleMarker)) {
    // Use pre-bundled code from lambda/
    return lambdaPath;
  }

  // Development mode: bundle on-the-fly from TypeScript source
  const sourcePath = join(lambdaPath, "index.ts");

  if (!existsSync(sourcePath)) {
    throw new Error(
      `Lambda source not found: ${sourcePath}\n` +
        `This usually means the build process didn't complete successfully.\n` +
        "Try running: pnpm build"
    );
  }

  const buildId = randomBytes(8).toString("hex");
  const outdir = join(tmpdir(), `wraps-lambda-${buildId}`);

  if (!existsSync(outdir)) {
    mkdirSync(outdir, { recursive: true });
  }

  // Bundle with esbuild
  await build({
    entryPoints: [sourcePath],
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
 * Deploy Lambda functions for email event processing
 *
 * Architecture:
 * SQS Queue -> Lambda (event-processor) -> DynamoDB
 *
 * The Lambda function is triggered by SQS via Event Source Mapping.
 * Failed messages are automatically sent to the DLQ after 3 retries.
 */
export async function deployLambdaFunctions(
  config: LambdaConfig
): Promise<LambdaFunctions> {
  // Get Lambda code directory (pre-bundled in production, bundled on-the-fly in dev)
  const eventProcessorCode = await getLambdaCode("event-processor");

  // IAM role for Lambda execution
  const lambdaRole = new aws.iam.Role("wraps-email-lambda-role", {
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
    },
  });

  // Attach basic Lambda execution policy
  new aws.iam.RolePolicyAttachment("wraps-email-lambda-basic-execution", {
    role: lambdaRole.name,
    policyArn:
      "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
  });

  // Lambda policy for DynamoDB and SQS
  new aws.iam.RolePolicy("wraps-email-lambda-policy", {
    role: lambdaRole.name,
    policy: pulumi
      .all([config.tableName, config.queueArn])
      .apply(([tableName, queueArn]) =>
        JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              // DynamoDB access
              Effect: "Allow",
              Action: [
                "dynamodb:PutItem",
                "dynamodb:GetItem",
                "dynamodb:Query",
                "dynamodb:Scan",
                "dynamodb:UpdateItem",
              ],
              Resource: [
                `arn:aws:dynamodb:*:*:table/${tableName}`,
                `arn:aws:dynamodb:*:*:table/${tableName}/index/*`,
              ],
            },
            {
              // SQS access for event source mapping
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

  // Create event-processor Lambda
  const eventProcessor = new aws.lambda.Function(
    "wraps-email-event-processor",
    {
      name: "wraps-email-event-processor",
      runtime: aws.lambda.Runtime.NodeJS20dX,
      handler: "index.handler",
      role: lambdaRole.arn,
      code: new pulumi.asset.FileArchive(eventProcessorCode),
      timeout: 300, // 5 minutes (matches SQS visibility timeout)
      memorySize: 512,
      environment: {
        variables: {
          TABLE_NAME: config.tableName,
          AWS_ACCOUNT_ID: config.accountId,
        },
      },
      tags: {
        ManagedBy: "wraps-cli",
        Description: "Process SES email events from SQS and store in DynamoDB",
      },
    }
  );

  // Create SQS event source mapping for Lambda
  // This automatically polls SQS and invokes the Lambda function
  const eventSourceMapping = new aws.lambda.EventSourceMapping(
    "wraps-email-event-source-mapping",
    {
      eventSourceArn: config.queueArn,
      functionName: eventProcessor.name,
      batchSize: 10, // Process up to 10 messages per invocation
      maximumBatchingWindowInSeconds: 5, // Wait up to 5 seconds to batch messages
      functionResponseTypes: ["ReportBatchItemFailures"], // Enable partial batch responses
    }
  );

  return {
    eventProcessor,
    eventSourceMapping,
  };
}
