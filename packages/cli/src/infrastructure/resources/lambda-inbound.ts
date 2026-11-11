import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import type { InboundTrigger } from "../../types/index.js";
import {
  INBOUND_PROCESSOR_FUNCTION_NAME,
  INBOUND_SES_INVOKE_PERMISSION,
  inboundReceiptRuleArn,
} from "../../utils/email/inbound-names.js";
import { getLambdaCode } from "./lambda.js";

/**
 * Lambda inbound configuration
 */
export type LambdaInboundConfig = {
  bucketName: string;
  bucketArn: pulumi.Output<string>;
  accountId: string;
  region: string;
  dlqArn: pulumi.Output<string>;
  /**
   * When true, adds a wildcard `ssm:GetParameter` grant on
   * `/wraps/email/reply-secret/*` and sets the
   * `REPLY_SECRET_PARAMETER_PREFIX` env var so the inbound processor can
   * fetch per-domain signing secrets for reply-threading verification.
   */
  replyThreadingEnabled?: boolean;
  /**
   * What invokes the processor (design §4.3). The SES permission exists in
   * both modes, so a switch can move the rule to the Lambda action before the
   * S3 notification and its permission are removed.
   */
  trigger: InboundTrigger;
};

/**
 * Lambda inbound resources output
 */
export type LambdaInboundResources = {
  lambdaFunction: aws.lambda.Function;
  sesInvokePermission: aws.lambda.Permission;
  /** Only in "s3-notification" mode. */
  s3InvokePermission?: aws.lambda.Permission;
};

/**
 * Deploy Lambda function for inbound email processing
 *
 * Architecture, by trigger mode:
 * - "ses-lambda-action": SES receipt rule -> S3 (mail/) then Lambda action
 *   (SES event, envelope included) -> S3 (parsed/, attachments/) + EventBridge
 * - "s3-notification" (legacy): SES receipt rule -> S3 (raw/) -> bucket
 *   notification -> Lambda -> S3 (parsed/, attachments/) + EventBridge
 */
export async function deployInboundLambda(
  config: LambdaInboundConfig
): Promise<LambdaInboundResources> {
  // Get Lambda code directory (pre-bundled in production, bundled on-the-fly in dev)
  const inboundProcessorCode = await getLambdaCode("inbound-processor");

  // IAM role for inbound Lambda execution
  const lambdaRole = new aws.iam.Role("wraps-inbound-lambda-role", {
    name: "wraps-inbound-lambda-role",
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
      Service: "email-inbound",
    },
  });

  // Attach basic Lambda execution policy (CloudWatch Logs)
  new aws.iam.RolePolicyAttachment("wraps-inbound-lambda-basic-execution", {
    role: lambdaRole.name,
    policyArn:
      "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
  });

  // Lambda policy for S3 read/write and EventBridge PutEvents
  new aws.iam.RolePolicy("wraps-inbound-lambda-policy", {
    role: lambdaRole.name,
    policy: pulumi
      .all([config.bucketArn, config.dlqArn])
      .apply(([bucketArn, dlqArn]) => {
        const statements: Record<string, unknown>[] = [
          {
            // S3 read (raw/, mail/) and write (parsed/, attachments/).
            // GetObject also authorizes HeadObject; "s3:HeadObject" is not
            // an IAM action.
            Effect: "Allow",
            Action: ["s3:GetObject", "s3:PutObject"],
            Resource: `${bucketArn}/*`,
          },
          {
            // EventBridge PutEvents for email.received events
            Effect: "Allow",
            Action: ["events:PutEvents"],
            Resource: `arn:aws:events:${config.region}:${config.accountId}:event-bus/default`,
          },
          {
            // SQS access for DLQ
            Effect: "Allow",
            Action: ["sqs:SendMessage"],
            Resource: dlqArn,
          },
        ];

        if (config.replyThreadingEnabled) {
          statements.push({
            // Reply-threading: fetch per-domain signing secrets. Wildcard is
            // scoped to the one SSM path prefix in this account, never
            // cross-tenant.
            Effect: "Allow",
            Action: ["ssm:GetParameter"],
            Resource: `arn:aws:ssm:${config.region}:${config.accountId}:parameter/wraps/email/reply-secret/*`,
          });
        }

        return JSON.stringify({
          Version: "2012-10-17",
          Statement: statements,
        });
      }),
  });

  const functionName = INBOUND_PROCESSOR_FUNCTION_NAME;

  // Create inbound processor Lambda
  const lambdaFunction = new aws.lambda.Function(functionName, {
    name: functionName,
    runtime: "nodejs24.x",
    handler: "index.handler",
    role: lambdaRole.arn,
    code: new pulumi.asset.FileArchive(inboundProcessorCode),
    timeout: 120,
    memorySize: 1024,
    environment: {
      variables: {
        BUCKET_NAME: config.bucketName,
        INBOUND_EVENT_SOURCE: "wraps.inbound",
        ...(config.replyThreadingEnabled
          ? {
              REPLY_SECRET_PARAMETER_PREFIX: "/wraps/email/reply-secret/",
            }
          : {}),
      },
    },
    deadLetterConfig: {
      targetArn: config.dlqArn,
    },
    tags: {
      ManagedBy: "wraps-cli",
      Service: "email-inbound",
    },
  });

  // Allow SES to invoke the Lambda function from the wraps receipt rule.
  // Created in both modes: the trigger switch needs it in place before the
  // rule gets its Lambda action (SES checks the permission on rule writes).
  const sesInvokePermission = new aws.lambda.Permission(
    INBOUND_SES_INVOKE_PERMISSION,
    {
      statementId: INBOUND_SES_INVOKE_PERMISSION,
      action: "lambda:InvokeFunction",
      function: lambdaFunction.name,
      principal: "ses.amazonaws.com",
      sourceAccount: config.accountId,
      sourceArn: inboundReceiptRuleArn(config.region, config.accountId),
    }
  );

  // Allow S3 to invoke the Lambda function (legacy trigger only)
  const s3InvokePermission =
    config.trigger === "s3-notification"
      ? new aws.lambda.Permission("wraps-inbound-s3-invoke", {
          action: "lambda:InvokeFunction",
          function: lambdaFunction.name,
          principal: "s3.amazonaws.com",
          sourceArn: config.bucketArn,
          sourceAccount: config.accountId,
        })
      : undefined;

  return {
    lambdaFunction,
    sesInvokePermission,
    s3InvokePermission,
  };
}
