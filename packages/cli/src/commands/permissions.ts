/**
 * Permissions command - Display required AWS IAM permissions
 * @module commands/permissions
 */

import * as clack from "@clack/prompts";
import pc from "picocolors";
import { trackCommand } from "../telemetry/events.js";
import { isJsonMode, jsonSuccess } from "../utils/shared/json-output.js";

/**
 * Options for the permissions command
 */
export type PermissionsOptions = {
  /** Output format - if true, output raw JSON policy */
  json?: boolean;
  /** Configuration preset to show permissions for */
  preset?: "starter" | "production" | "enterprise";
  /** Service to show permissions for */
  service?: "email" | "sms" | "cdn";
};

/**
 * IAM policy statement
 */
type IAMStatement = {
  Sid: string;
  Effect: "Allow" | "Deny";
  Action: string[];
  Resource: string | string[];
};

/**
 * IAM policy document
 */
type IAMPolicy = {
  Version: "2012-10-17";
  Statement: IAMStatement[];
};

/**
 * Get base IAM statements required for all deployments
 */
function getBaseStatements(): IAMStatement[] {
  return [
    {
      Sid: "STSGetCallerIdentity",
      Effect: "Allow",
      Action: ["sts:GetCallerIdentity"],
      Resource: "*",
    },
    {
      Sid: "IAMRoleManagement",
      Effect: "Allow",
      Action: [
        "iam:CreateRole",
        "iam:DeleteRole",
        "iam:GetRole",
        "iam:UpdateRole",
        "iam:TagRole",
        "iam:UntagRole",
        "iam:PutRolePolicy",
        "iam:GetRolePolicy",
        "iam:DeleteRolePolicy",
        "iam:AttachRolePolicy",
        "iam:DetachRolePolicy",
        "iam:ListRolePolicies",
        "iam:ListAttachedRolePolicies",
        "iam:PassRole",
      ],
      Resource: ["arn:aws:iam::*:role/wraps-*"],
    },
    {
      Sid: "CloudWatchMetrics",
      Effect: "Allow",
      Action: ["cloudwatch:GetMetricData", "cloudwatch:GetMetricStatistics"],
      Resource: "*",
    },
  ];
}

/**
 * Get SES-related IAM statements
 */
function getSESStatements(): IAMStatement[] {
  return [
    {
      Sid: "SESManagement",
      Effect: "Allow",
      Action: [
        "ses:CreateConfigurationSet",
        "ses:DeleteConfigurationSet",
        "ses:GetConfigurationSet",
        "ses:DescribeConfigurationSet",
        "ses:CreateConfigurationSetEventDestination",
        "ses:DeleteConfigurationSetEventDestination",
        "ses:UpdateConfigurationSetEventDestination",
        "ses:CreateEmailIdentity",
        "ses:DeleteEmailIdentity",
        "ses:GetEmailIdentity",
        "ses:PutEmailIdentityDkimAttributes",
        "ses:PutEmailIdentityMailFromAttributes",
        "ses:PutEmailIdentityFeedbackAttributes",
        "ses:TagResource",
        "ses:UntagResource",
        "ses:ListTagsForResource",
      ],
      Resource: "*",
    },
    {
      Sid: "SESSending",
      Effect: "Allow",
      Action: ["ses:SendEmail", "ses:SendRawEmail", "ses:SendBulkEmail"],
      Resource: "*",
    },
  ];
}

/**
 * Get EventBridge statements for event tracking
 */
function getEventBridgeStatements(): IAMStatement[] {
  return [
    {
      Sid: "EventBridgeManagement",
      Effect: "Allow",
      Action: [
        "events:PutRule",
        "events:DeleteRule",
        "events:DescribeRule",
        "events:EnableRule",
        "events:DisableRule",
        "events:PutTargets",
        "events:RemoveTargets",
        "events:ListTargetsByRule",
        "events:TagResource",
        "events:UntagResource",
      ],
      Resource: ["arn:aws:events:*:*:rule/wraps-*"],
    },
  ];
}

/**
 * Get SQS statements for event queuing
 */
function getSQSStatements(): IAMStatement[] {
  return [
    {
      Sid: "SQSManagement",
      Effect: "Allow",
      Action: [
        "sqs:CreateQueue",
        "sqs:DeleteQueue",
        "sqs:GetQueueAttributes",
        "sqs:SetQueueAttributes",
        "sqs:GetQueueUrl",
        "sqs:TagQueue",
        "sqs:UntagQueue",
        "sqs:ListQueueTags",
      ],
      Resource: ["arn:aws:sqs:*:*:wraps-*"],
    },
  ];
}

/**
 * Get DynamoDB statements for email history
 */
function getDynamoDBStatements(): IAMStatement[] {
  return [
    {
      Sid: "DynamoDBManagement",
      Effect: "Allow",
      Action: [
        "dynamodb:CreateTable",
        "dynamodb:DeleteTable",
        "dynamodb:DescribeTable",
        "dynamodb:UpdateTable",
        "dynamodb:UpdateTimeToLive",
        "dynamodb:DescribeTimeToLive",
        "dynamodb:TagResource",
        "dynamodb:UntagResource",
        "dynamodb:ListTagsOfResource",
      ],
      Resource: ["arn:aws:dynamodb:*:*:table/wraps-*"],
    },
  ];
}

/**
 * Get Lambda statements for event processing
 */
function getLambdaStatements(): IAMStatement[] {
  return [
    {
      Sid: "LambdaManagement",
      Effect: "Allow",
      Action: [
        "lambda:CreateFunction",
        "lambda:DeleteFunction",
        "lambda:GetFunction",
        "lambda:UpdateFunctionCode",
        "lambda:UpdateFunctionConfiguration",
        "lambda:AddPermission",
        "lambda:RemovePermission",
        "lambda:GetPolicy",
        "lambda:CreateEventSourceMapping",
        "lambda:DeleteEventSourceMapping",
        "lambda:GetEventSourceMapping",
        "lambda:UpdateEventSourceMapping",
        "lambda:TagResource",
        "lambda:UntagResource",
        "lambda:ListTags",
      ],
      Resource: ["arn:aws:lambda:*:*:function:wraps-*"],
    },
    {
      Sid: "LambdaEventSourceMapping",
      Effect: "Allow",
      Action: [
        "lambda:CreateEventSourceMapping",
        "lambda:DeleteEventSourceMapping",
        "lambda:GetEventSourceMapping",
        "lambda:UpdateEventSourceMapping",
        "lambda:ListEventSourceMappings",
      ],
      Resource: "*",
    },
  ];
}

/**
 * Get Route53 statements for automatic DNS management (optional)
 */
function getRoute53Statements(): IAMStatement[] {
  return [
    {
      Sid: "Route53DNSManagement",
      Effect: "Allow",
      Action: [
        "route53:ChangeResourceRecordSets",
        "route53:ListResourceRecordSets",
        "route53:GetHostedZone",
        "route53:ListHostedZones",
        "route53:ListHostedZonesByName",
      ],
      Resource: "*",
    },
  ];
}

/**
 * Get OIDC provider statements for Vercel integration
 */
function getOIDCStatements(): IAMStatement[] {
  return [
    {
      Sid: "OIDCProviderManagement",
      Effect: "Allow",
      Action: [
        "iam:CreateOpenIDConnectProvider",
        "iam:DeleteOpenIDConnectProvider",
        "iam:GetOpenIDConnectProvider",
        "iam:TagOpenIDConnectProvider",
        "iam:UntagOpenIDConnectProvider",
        "iam:UpdateOpenIDConnectProviderThumbprint",
      ],
      Resource: ["arn:aws:iam::*:oidc-provider/*"],
    },
  ];
}

/**
 * Get IAM user statements for SMTP credentials
 */
function getSMTPStatements(): IAMStatement[] {
  return [
    {
      Sid: "SMTPUserManagement",
      Effect: "Allow",
      Action: [
        "iam:CreateUser",
        "iam:DeleteUser",
        "iam:GetUser",
        "iam:TagUser",
        "iam:UntagUser",
        "iam:CreateAccessKey",
        "iam:DeleteAccessKey",
        "iam:ListAccessKeys",
        "iam:PutUserPolicy",
        "iam:DeleteUserPolicy",
        "iam:GetUserPolicy",
      ],
      Resource: ["arn:aws:iam::*:user/wraps-*"],
    },
  ];
}

/**
 * Get S3 statements for CDN/email archiving
 */
function getS3Statements(): IAMStatement[] {
  return [
    {
      Sid: "S3BucketManagement",
      Effect: "Allow",
      Action: [
        "s3:CreateBucket",
        "s3:DeleteBucket",
        "s3:GetBucketLocation",
        "s3:GetBucketPolicy",
        "s3:PutBucketPolicy",
        "s3:DeleteBucketPolicy",
        "s3:GetBucketCors",
        "s3:PutBucketCors",
        "s3:GetBucketWebsite",
        "s3:PutBucketWebsite",
        "s3:DeleteBucketWebsite",
        "s3:PutBucketPublicAccessBlock",
        "s3:GetBucketPublicAccessBlock",
        "s3:PutBucketTagging",
        "s3:GetBucketTagging",
        "s3:PutLifecycleConfiguration",
        "s3:GetLifecycleConfiguration",
        "s3:PutBucketVersioning",
        "s3:GetBucketVersioning",
        "s3:PutEncryptionConfiguration",
        "s3:GetEncryptionConfiguration",
      ],
      Resource: ["arn:aws:s3:::wraps-*"],
    },
  ];
}

/**
 * Get S3 statements for state management (Pulumi state + metadata)
 */
function getS3StateStatements(): IAMStatement[] {
  return [
    {
      Sid: "S3StateManagement",
      Effect: "Allow",
      Action: [
        "s3:CreateBucket",
        "s3:HeadBucket",
        "s3:PutBucketEncryption",
        "s3:PutBucketVersioning",
        "s3:PutPublicAccessBlock",
        "s3:PutBucketTagging",
        "s3:GetObject",
        "s3:PutObject",
        "s3:ListBucket",
      ],
      Resource: ["arn:aws:s3:::wraps-state-*", "arn:aws:s3:::wraps-state-*/*"],
    },
  ];
}

/**
 * Get CloudFront statements for CDN
 */
function getCloudFrontStatements(): IAMStatement[] {
  return [
    {
      Sid: "CloudFrontManagement",
      Effect: "Allow",
      Action: [
        "cloudfront:CreateDistribution",
        "cloudfront:DeleteDistribution",
        "cloudfront:GetDistribution",
        "cloudfront:UpdateDistribution",
        "cloudfront:TagResource",
        "cloudfront:UntagResource",
        "cloudfront:ListTagsForResource",
        "cloudfront:CreateOriginAccessControl",
        "cloudfront:DeleteOriginAccessControl",
        "cloudfront:GetOriginAccessControl",
        "cloudfront:UpdateOriginAccessControl",
        "cloudfront:CreateInvalidation",
      ],
      Resource: "*",
    },
  ];
}

/**
 * Get ACM statements for SSL certificates
 */
function getACMStatements(): IAMStatement[] {
  return [
    {
      Sid: "ACMCertificateManagement",
      Effect: "Allow",
      Action: [
        "acm:RequestCertificate",
        "acm:DeleteCertificate",
        "acm:DescribeCertificate",
        "acm:AddTagsToCertificate",
        "acm:RemoveTagsFromCertificate",
        "acm:ListTagsForCertificate",
      ],
      Resource: "*",
    },
  ];
}

/**
 * Get SMS-related IAM statements
 */
function getSMSStatements(): IAMStatement[] {
  return [
    {
      Sid: "SMSManagement",
      Effect: "Allow",
      Action: [
        "sms-voice:CreateConfigurationSet",
        "sms-voice:DeleteConfigurationSet",
        "sms-voice:DescribeConfigurationSets",
        "sms-voice:SendTextMessage",
        "sms-voice:SetDefaultSenderId",
        "sms-voice:RequestPhoneNumber",
        "sms-voice:ReleasePhoneNumber",
        "sms-voice:DescribePhoneNumbers",
        "sms-voice:CreatePool",
        "sms-voice:DeletePool",
        "sms-voice:DescribePools",
        "sms-voice:AssociateOriginationIdentity",
        "sms-voice:DisassociateOriginationIdentity",
        "sms-voice:CreateOptOutList",
        "sms-voice:DeleteOptOutList",
        "sms-voice:DescribeOptOutLists",
        "sms-voice:PutOptedOutNumber",
        "sms-voice:DeleteOptedOutNumber",
        "sms-voice:DescribeOptedOutNumbers",
        "sms-voice:TagResource",
        "sms-voice:UntagResource",
        "sms-voice:ListTagsForResource",
      ],
      Resource: "*",
    },
  ];
}

/**
 * Build IAM policy based on service and preset
 */
function buildPolicy(
  service?: "email" | "sms" | "cdn",
  preset?: "starter" | "production" | "enterprise"
): IAMPolicy {
  const statements: IAMStatement[] = [
    ...getBaseStatements(),
    ...getS3StateStatements(),
  ];

  // Add service-specific statements
  if (!service || service === "email") {
    statements.push(...getSESStatements());

    // Event tracking (Production and Enterprise)
    if (!preset || preset === "production" || preset === "enterprise") {
      statements.push(...getEventBridgeStatements());
      statements.push(...getSQSStatements());
      statements.push(...getDynamoDBStatements());
      statements.push(...getLambdaStatements());
    }

    // SMTP credentials and advanced features
    if (!preset || preset === "enterprise") {
      statements.push(...getSMTPStatements());
    }

    // Route53 for auto DNS (optional for all presets)
    statements.push(...getRoute53Statements());

    // OIDC for Vercel
    statements.push(...getOIDCStatements());
  }

  if (!service || service === "sms") {
    statements.push(...getSMSStatements());
    statements.push(...getDynamoDBStatements());
    statements.push(...getLambdaStatements());
  }

  if (!service || service === "cdn") {
    statements.push(...getS3Statements());
    statements.push(...getCloudFrontStatements());
    statements.push(...getACMStatements());
    statements.push(...getRoute53Statements());
  }

  // Deduplicate statements by Sid
  const uniqueStatements = statements.reduce((acc, stmt) => {
    if (!acc.find((s) => s.Sid === stmt.Sid)) {
      acc.push(stmt);
    }
    return acc;
  }, [] as IAMStatement[]);

  return {
    Version: "2012-10-17",
    Statement: uniqueStatements,
  };
}

/**
 * Display permissions summary
 */
function displaySummary(
  service?: "email" | "sms" | "cdn",
  preset?: "starter" | "production" | "enterprise"
): void {
  clack.intro(pc.bold("Wraps Required AWS Permissions"));

  const serviceLabel = service ? service.toUpperCase() : "All Services";
  const presetLabel = preset
    ? preset.charAt(0).toUpperCase() + preset.slice(1)
    : "All Features";

  console.log(`\n${pc.dim("Service:")} ${pc.cyan(serviceLabel)}`);
  console.log(`${pc.dim("Preset:")} ${pc.cyan(presetLabel)}\n`);

  console.log(pc.bold("Required AWS Services:\n"));

  // Base permissions (always needed)
  console.log(`  ${pc.green("+")} ${pc.bold("IAM")} - Role management`);
  console.log(`  ${pc.green("+")} ${pc.bold("STS")} - Credential validation`);
  console.log(`  ${pc.green("+")} ${pc.bold("CloudWatch")} - Metrics access`);
  console.log(
    `  ${pc.green("+")} ${pc.bold("S3")} - State management ${pc.dim("(wraps-state-* buckets)")}`
  );

  // Service-specific
  if (!service || service === "email") {
    console.log(
      `  ${pc.green("+")} ${pc.bold("SES")} - Email sending & configuration`
    );

    if (!preset || preset === "production" || preset === "enterprise") {
      console.log(
        `  ${pc.green("+")} ${pc.bold("EventBridge")} - Event routing (Production+)`
      );
      console.log(
        `  ${pc.green("+")} ${pc.bold("SQS")} - Event queuing (Production+)`
      );
      console.log(
        `  ${pc.green("+")} ${pc.bold("Lambda")} - Event processing (Production+)`
      );
      console.log(
        `  ${pc.green("+")} ${pc.bold("DynamoDB")} - Email history (Production+)`
      );
    }

    console.log(
      `  ${pc.yellow("?")} ${pc.bold("Route53")} - Auto DNS ${pc.dim("(optional)")}`
    );
    console.log(
      `  ${pc.yellow("?")} ${pc.bold("IAM OIDC")} - Vercel integration ${pc.dim("(if using Vercel)")}`
    );
  }

  if (!service || service === "sms") {
    console.log(
      `  ${pc.green("+")} ${pc.bold("SMS Voice")} - SMS sending & management`
    );
    console.log(`  ${pc.green("+")} ${pc.bold("DynamoDB")} - Message history`);
    console.log(`  ${pc.green("+")} ${pc.bold("Lambda")} - Event processing`);
  }

  if (!service || service === "cdn") {
    console.log(`  ${pc.green("+")} ${pc.bold("S3")} - Asset storage`);
    console.log(
      `  ${pc.green("+")} ${pc.bold("CloudFront")} - CDN distribution`
    );
    console.log(`  ${pc.green("+")} ${pc.bold("ACM")} - SSL certificates`);
    console.log(
      `  ${pc.yellow("?")} ${pc.bold("Route53")} - DNS management ${pc.dim("(optional)")}`
    );
  }

  console.log(`\n${pc.dim("Get full IAM policy JSON:")}`);
  console.log(`  ${pc.cyan("wraps permissions --json")}`);

  if (service) {
    console.log(`\n${pc.dim("Get permissions for all services:")}`);
    console.log(`  ${pc.cyan("wraps permissions")}`);
  }

  console.log(`\n${pc.dim("Documentation:")}`);
  console.log(
    `  ${pc.blue("https://wraps.dev/docs/guides/aws-setup/permissions")}\n`
  );
}

/**
 * Permissions command entry point
 */
export async function permissions(options: PermissionsOptions): Promise<void> {
  const startTime = Date.now();

  const policy = buildPolicy(options.service, options.preset);

  if (isJsonMode()) {
    jsonSuccess("permissions", {
      policy: policy as unknown as Record<string, unknown>,
    });
  } else {
    // Display human-readable summary
    displaySummary(options.service, options.preset);

    // Show how to create the policy
    console.log(pc.bold("Quick Setup:\n"));
    console.log("1. Copy the IAM policy:");
    console.log(
      `   ${pc.cyan("wraps permissions --json > wraps-policy.json")}\n`
    );
    console.log("2. Create the policy in AWS Console:");
    console.log("   IAM > Policies > Create Policy > JSON\n");
    console.log("3. Attach to your IAM user/role\n");

    clack.outro(
      pc.green("Run with --json to get the full IAM policy document")
    );
  }

  // Reported once, on completion. Tracking on entry as well put two
  // `command:permissions` events on the wire for a single run; the flags below
  // are the metadata that entry-time call carried. A throw before this point is
  // reported by cli.ts's fallback instead.
  trackCommand("permissions", {
    success: true,
    duration_ms: Date.now() - startTime,
    json: options.json,
    preset: options.preset,
    service: options.service,
  });
}
