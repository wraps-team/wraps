import { GetRoleCommand, IAMClient } from "@aws-sdk/client-iam";
import { confirm, intro, isCancel, log, outro } from "@clack/prompts";
import pc from "picocolors";
import type { UpdateRoleOptions } from "../../types/index.js";
import {
  getAWSRegion,
  validateAWSCredentials,
} from "../../utils/shared/aws.js";
import { loadConnectionMetadata } from "../../utils/shared/metadata.js";
import { DeploymentProgress } from "../../utils/shared/output.js";

/**
 * Update hosted dashboard access role command
 *
 * Updates the wraps-console-access-role IAM role with the latest permissions
 * needed for feature detection in the hosted dashboard app (e.g., dynamodb:DescribeTable).
 *
 * This role is created when you connect AWS accounts through the hosted dashboard.
 * This command updates its permissions to match your current infrastructure setup.
 *
 * This command:
 * - Only updates the role if it exists (does not create it)
 * - Updates inline policies to match current feature requirements
 * - Preserves the trust policy (AssumeRole configuration)
 */
export async function updateRole(options: UpdateRoleOptions): Promise<void> {
  intro(pc.bold("Update Hosted Dashboard Access Role"));

  const progress = new DeploymentProgress();

  // 1. Validate AWS credentials
  const identity = await progress.execute(
    "Validating AWS credentials",
    async () => validateAWSCredentials()
  );

  // 2. Get region
  const region = options.region || (await getAWSRegion());

  // 3. Load metadata to check if deployment exists
  const metadata = await loadConnectionMetadata(identity.accountId, region);
  if (!metadata) {
    progress.stop();
    log.error(
      `No Wraps deployment found for account ${pc.cyan(identity.accountId)} in region ${pc.cyan(region)}`
    );
    console.log(
      `\nRun ${pc.cyan("wraps email init")} to deploy infrastructure first.\n`
    );
    process.exit(1);
  }

  // 4. Check if wraps-console-access-role exists
  const roleName = "wraps-console-access-role";
  const iam = new IAMClient({ region: "us-east-1" }); // IAM is global

  let roleExists = false;
  try {
    await iam.send(new GetRoleCommand({ RoleName: roleName }));
    roleExists = true;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "name" in error &&
      error.name !== "NoSuchEntity"
    ) {
      throw error;
    }
  }

  if (!roleExists) {
    progress.stop();
    log.warn(`IAM role ${pc.cyan(roleName)} does not exist`);
    console.log(
      "\nThis role is created when you connect AWS accounts through the hosted dashboard."
    );
    console.log(
      "If you haven't connected an AWS account to the hosted dashboard yet, there's nothing to update.\n"
    );
    process.exit(0);
  }

  progress.info(`Found IAM role: ${pc.cyan(roleName)}`);

  // 5. Confirm update (unless --force)
  if (!options.force) {
    progress.stop();
    const shouldContinue = await confirm({
      message: `Update IAM role ${pc.cyan(roleName)} with latest permissions?`,
      initialValue: true,
    });

    if (isCancel(shouldContinue) || !shouldContinue) {
      outro("Update cancelled");
      process.exit(0);
    }
  }

  // 6. Build updated policy
  const emailConfig = metadata.services.email?.config;
  const policy = buildConsolePolicyDocument(emailConfig);

  // Extract config values for display
  const sendingEnabled =
    !emailConfig ||
    (emailConfig.sendingEnabled as boolean | undefined) !== false;
  const eventTracking = emailConfig?.eventTracking as
    | Record<string, unknown>
    | undefined;
  const emailArchiving = emailConfig?.emailArchiving as
    | Record<string, unknown>
    | undefined;

  // 7. Update role policy
  await progress.execute("Updating IAM role permissions", async () => {
    const { PutRolePolicyCommand } = await import("@aws-sdk/client-iam");

    await iam.send(
      new PutRolePolicyCommand({
        RoleName: roleName,
        PolicyName: "wraps-console-access-policy",
        PolicyDocument: JSON.stringify(policy, null, 2),
      })
    );
  });

  progress.stop();

  // Success
  outro(pc.green("✓ Hosted dashboard access role updated successfully"));

  console.log(`\n${pc.bold("Updated Permissions:")}`);
  console.log(
    `  ${pc.green("✓")} SES metrics and identity verification (always enabled)`
  );

  if (sendingEnabled) {
    console.log(`  ${pc.green("✓")} Email sending via SES`);
  }

  if (eventTracking?.dynamoDBHistory) {
    console.log(
      `  ${pc.green("✓")} DynamoDB read access (including DescribeTable)`
    );
  }

  if (eventTracking?.enabled) {
    console.log(`  ${pc.green("✓")} EventBridge and SQS access`);
  }

  if (emailArchiving?.enabled) {
    console.log(`  ${pc.green("✓")} Mail Manager Archive access`);
  }

  console.log(
    `\n${pc.dim("The hosted dashboard will now have updated permissions for feature detection.")}\n`
  );
}

/**
 * Build IAM policy document for hosted dashboard access role
 *
 * This mirrors the permissions from the main wraps-email-role but is used
 * for the hosted dashboard app (not for SDK sending or local console).
 */
type PolicyStatement = {
  Effect: string;
  Action: string[];
  Resource: string | string[];
};

type PolicyDocument = {
  Version: string;
  Statement: PolicyStatement[];
};

function buildConsolePolicyDocument(
  emailConfig: Record<string, unknown> | undefined
): PolicyDocument {
  const statements: PolicyStatement[] = [];

  // Always allow reading SES metrics for dashboard
  statements.push({
    Effect: "Allow",
    Action: [
      "ses:GetSendStatistics",
      "ses:ListIdentities",
      "ses:GetIdentityVerificationAttributes",
      "cloudwatch:GetMetricData",
      "cloudwatch:GetMetricStatistics",
    ],
    Resource: "*",
  });

  // Allow sending if enabled
  const sendingEnabled = !emailConfig || emailConfig.sendingEnabled !== false;
  if (sendingEnabled) {
    statements.push({
      Effect: "Allow",
      Action: [
        "ses:SendEmail",
        "ses:SendRawEmail",
        "ses:SendTemplatedEmail",
        "ses:SendBulkTemplatedEmail",
      ],
      Resource: "*",
    });
  }

  // Allow DynamoDB access if history storage enabled
  const eventTracking = emailConfig?.eventTracking as
    | Record<string, unknown>
    | undefined;
  if (eventTracking?.dynamoDBHistory) {
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
        "arn:aws:dynamodb:*:*:table/wraps-email-*",
        "arn:aws:dynamodb:*:*:table/wraps-email-*/index/*",
      ],
    });
  }

  // Allow EventBridge access if event tracking enabled
  if (eventTracking?.enabled) {
    statements.push({
      Effect: "Allow",
      Action: ["events:PutEvents", "events:DescribeEventBus"],
      Resource: "arn:aws:events:*:*:event-bus/wraps-email-*",
    });
  }

  // Allow SQS access if event tracking enabled
  if (eventTracking?.enabled) {
    statements.push({
      Effect: "Allow",
      Action: [
        "sqs:SendMessage",
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sqs:GetQueueAttributes",
      ],
      Resource: "arn:aws:sqs:*:*:wraps-email-*",
    });
  }

  // Allow Mail Manager Archive access if email archiving enabled
  const emailArchiving = emailConfig?.emailArchiving as
    | Record<string, unknown>
    | undefined;
  if (emailArchiving?.enabled) {
    statements.push({
      Effect: "Allow",
      Action: [
        "ses:StartArchiveSearch",
        "ses:GetArchiveSearchResults",
        "ses:GetArchiveMessage",
        "ses:GetArchiveMessageContent",
        "ses:GetArchive",
        "ses:ListArchives",
        "ses:StartArchiveExport",
        "ses:GetArchiveExport",
      ],
      Resource: "arn:aws:ses:*:*:mailmanager-archive/*",
    });
  }

  return {
    Version: "2012-10-17",
    Statement: statements,
  };
}
