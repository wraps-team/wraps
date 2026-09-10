import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { EMAIL_ROLE_NAME } from "@wraps/core";
import type {
  OIDCConfig,
  ResolvedConfig,
  TransformFunctions,
  VercelOIDCConfig,
} from "../types.js";

/**
 * IAM role configuration
 */
export type IAMRoleConfig = {
  vercel?: VercelOIDCConfig;
  oidc?: OIDCConfig;
  oidcProvider?: aws.iam.OpenIdConnectProvider;
  config: ResolvedConfig;
};

/**
 * IAM role result
 */
export type IAMRoleResult = {
  role: aws.iam.Role;
  policy: aws.iam.RolePolicy;
};

/**
 * Build assume role policy based on provider configuration
 */
function buildAssumeRolePolicy(
  config: IAMRoleConfig
): pulumi.Output<string> | string {
  if (config.vercel && config.oidcProvider) {
    return pulumi.interpolate`{
      "Version": "2012-10-17",
      "Statement": [{
        "Effect": "Allow",
        "Principal": {
          "Federated": "${config.oidcProvider.arn}"
        },
        "Action": "sts:AssumeRoleWithWebIdentity",
        "Condition": {
          "StringEquals": {
            "oidc.vercel.com/${config.vercel.teamSlug}:aud": "https://vercel.com/${config.vercel.teamSlug}"
          },
          "StringLike": {
            "oidc.vercel.com/${config.vercel.teamSlug}:sub": "owner:${config.vercel.teamSlug}:project:${config.vercel.projectName}:environment:*"
          }
        }
      }]
    }`;
  }

  if (config.oidc && config.oidcProvider) {
    return pulumi.interpolate`{
      "Version": "2012-10-17",
      "Statement": [{
        "Effect": "Allow",
        "Principal": {
          "Federated": "${config.oidcProvider.arn}"
        },
        "Action": "sts:AssumeRoleWithWebIdentity",
        "Condition": {
          "StringEquals": {
            "${config.oidc.providerUrl}:aud": "${config.oidc.audience}"
          },
          "StringLike": {
            "${config.oidc.providerUrl}:sub": "${config.oidc.subjectPattern}"
          }
        }
      }]
    }`;
  }

  // Default: Allow AWS services (Lambda, EC2, ECS) to assume
  return JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: {
          Service: [
            "lambda.amazonaws.com",
            "ec2.amazonaws.com",
            "ecs-tasks.amazonaws.com",
          ],
        },
        Action: "sts:AssumeRole",
      },
    ],
  });
}

/**
 * Build IAM policy statements based on enabled features
 */
function buildPolicyStatements(config: ResolvedConfig): object[] {
  const statements: object[] = [];

  // Always allow reading SES metrics
  statements.push({
    Sid: "SESReadAccess",
    Effect: "Allow",
    Action: [
      "ses:GetAccount",
      "ses:GetSendQuota",
      "ses:GetSendStatistics",
      "ses:ListIdentities",
      "ses:GetIdentityVerificationAttributes",
      "ses:ListEmailIdentities",
      "ses:GetEmailIdentity",
      "ses:ListConfigurationSets",
      "ses:GetConfigurationSet",
      "ses:GetConfigurationSetEventDestinations",
      "cloudwatch:GetMetricData",
      "cloudwatch:GetMetricStatistics",
      "cloudwatch:ListMetrics",
    ],
    Resource: "*",
  });

  // Allow sending if enabled
  if (config.sendingEnabled) {
    statements.push({
      Sid: "SESSendAccess",
      Effect: "Allow",
      Action: [
        "ses:SendEmail",
        "ses:SendRawEmail",
        "ses:SendTemplatedEmail",
        "ses:SendBulkTemplatedEmail",
        "ses:SendBulkEmail",
      ],
      Resource: "*",
    });
  }

  // Allow SES suppression list access if enabled
  if (config.suppressionList.enabled) {
    statements.push({
      Sid: "SESSuppressionList",
      Effect: "Allow",
      Action: [
        "ses:ListSuppressedDestinations",
        "ses:GetSuppressedDestination",
        "ses:PutSuppressedDestination",
        "ses:DeleteSuppressedDestination",
      ],
      Resource: "*",
    });
  }

  // Allow DynamoDB access if history storage enabled
  if (config.events?.storeHistory) {
    statements.push({
      Sid: "DynamoDBAccess",
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

  // Allow EventBridge access if events configured
  if (config.events) {
    statements.push({
      Sid: "EventBridgeAccess",
      Effect: "Allow",
      Action: ["events:PutEvents", "events:DescribeEventBus"],
      Resource: "arn:aws:events:*:*:event-bus/wraps-email-*",
    });
  }

  // Allow SQS access if events configured
  if (config.events) {
    statements.push({
      Sid: "SQSAccess",
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

  // Allow Mail Manager Archive access if archiving enabled
  if (config.archiving?.enabled) {
    statements.push({
      Sid: "MailManagerArchiveAccess",
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

  return statements;
}

/**
 * Create IAM role for email infrastructure
 */
export function createIAMRole(
  name: string,
  roleConfig: IAMRoleConfig,
  tags: Record<string, string>,
  transform?: TransformFunctions["role"],
  opts?: pulumi.ComponentResourceOptions
): IAMRoleResult {
  const assumeRolePolicy = buildAssumeRolePolicy(roleConfig);

  let roleArgs: aws.iam.RoleArgs = {
    name: EMAIL_ROLE_NAME,
    assumeRolePolicy,
    tags: {
      ...tags,
      Provider: roleConfig.vercel
        ? "vercel"
        : roleConfig.oidc
          ? "custom-oidc"
          : "aws",
    },
  };

  // Apply transform if provided
  if (transform) {
    roleArgs = transform(roleArgs);
  }

  const role = new aws.iam.Role(`${name}-role`, roleArgs, opts);

  // Build and attach policy
  const policyStatements = buildPolicyStatements(roleConfig.config);
  const policy = new aws.iam.RolePolicy(
    `${name}-policy`,
    {
      role: role.name,
      policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: policyStatements,
      }),
    },
    opts
  );

  return { role, policy };
}
