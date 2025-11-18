import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import type { Provider, WrapsEmailConfig } from "../../types/index.js";

/**
 * IAM role configuration
 */
export type IAMRoleConfig = {
  provider: Provider;
  oidcProvider?: aws.iam.OpenIdConnectProvider;
  vercelTeamSlug?: string;
  vercelProjectName?: string;
  emailConfig: WrapsEmailConfig;
};

/**
 * Check if IAM role exists
 */
async function roleExists(roleName: string): Promise<boolean> {
  try {
    const { IAMClient, GetRoleCommand } = await import("@aws-sdk/client-iam");
    const iam = new IAMClient({});

    await iam.send(new GetRoleCommand({ RoleName: roleName }));
    return true;
  } catch (error: any) {
    if (error.name === "NoSuchEntityException") {
      return false;
    }
    console.error("Error checking for existing IAM role:", error);
    return false;
  }
}

/**
 * Create IAM role for email infrastructure
 */
export async function createIAMRole(
  config: IAMRoleConfig
): Promise<aws.iam.Role> {
  // Build assume role policy based on provider
  let assumeRolePolicy: pulumi.Output<string>;

  if (config.provider === "vercel" && config.oidcProvider) {
    assumeRolePolicy = pulumi.interpolate`{
      "Version": "2012-10-17",
      "Statement": [{
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
      }]
    }`;
  } else if (config.provider === "aws") {
    // Native AWS - EC2, Lambda, ECS can assume
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
    // Other providers - will use access keys
    throw new Error("Other providers not yet implemented");
  }

  // Check if role already exists
  const roleName = "wraps-email-role";
  const exists = await roleExists(roleName);

  const role = exists
    ? new aws.iam.Role(
        roleName,
        {
          name: roleName,
          assumeRolePolicy,
          tags: {
            ManagedBy: "wraps-cli",
            Provider: config.provider,
          },
        },
        {
          import: roleName, // Import existing role (use role name, not ARN)
        }
      )
    : new aws.iam.Role(roleName, {
        name: roleName,
        assumeRolePolicy,
        tags: {
          ManagedBy: "wraps-cli",
          Provider: config.provider,
        },
      });

  // Build policy statements based on enabled features
  const statements: any[] = [];

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
  if (config.emailConfig.sendingEnabled !== false) {
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
  if (config.emailConfig.eventTracking?.dynamoDBHistory) {
    statements.push({
      Effect: "Allow",
      Action: [
        "dynamodb:PutItem",
        "dynamodb:GetItem",
        "dynamodb:Query",
        "dynamodb:Scan",
        "dynamodb:BatchGetItem",
      ],
      Resource: [
        "arn:aws:dynamodb:*:*:table/wraps-email-*",
        "arn:aws:dynamodb:*:*:table/wraps-email-*/index/*",
      ],
    });
  }

  // Allow EventBridge access if event tracking enabled
  if (config.emailConfig.eventTracking?.enabled) {
    statements.push({
      Effect: "Allow",
      Action: ["events:PutEvents", "events:DescribeEventBus"],
      Resource: "arn:aws:events:*:*:event-bus/wraps-email-*",
    });
  }

  // Allow SQS access if event tracking enabled
  if (config.emailConfig.eventTracking?.enabled) {
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
  if (config.emailConfig.emailArchiving?.enabled) {
    statements.push({
      Effect: "Allow",
      Action: [
        // Archive search operations
        "ses:StartArchiveSearch",
        "ses:GetArchiveSearchResults",
        // Archive message retrieval
        "ses:GetArchiveMessage",
        "ses:GetArchiveMessageContent",
        // Archive metadata
        "ses:GetArchive",
        "ses:ListArchives",
        // Archive export (for future use)
        "ses:StartArchiveExport",
        "ses:GetArchiveExport",
      ],
      Resource: "arn:aws:ses:*:*:mailmanager-archive/*",
    });
  }

  // Attach policy to role
  new aws.iam.RolePolicy("wraps-email-policy", {
    role: role.name,
    policy: JSON.stringify({
      Version: "2012-10-17",
      Statement: statements,
    }),
  });

  return role;
}
