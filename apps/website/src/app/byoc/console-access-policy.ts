/**
 * The `wraps-console-access-role` policy for a default email deployment
 * (sending enabled, event tracking enabled, no inbound, no archiving, no
 * SMS), reproduced by hand from `buildConsolePolicyDocument()` in
 * `packages/cli/src/commands/platform/update-role.ts`. Not generated at
 * build time. If that function's statements change, this drifts, so
 * verify against source before editing.
 */
export const CONSOLE_ACCESS_POLICY_JSON = JSON.stringify(
  {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: [
          "ses:GetAccount",
          "ses:GetSendStatistics",
          "ses:ListIdentities",
          "ses:GetIdentityVerificationAttributes",
          "ses:ListEmailIdentities",
          "ses:GetEmailIdentity",
          "ses:CreateEmailIdentity",
          "ses:ListConfigurationSets",
          "ses:GetConfigurationSet",
          "ses:GetConfigurationSetEventDestinations",
          "cloudwatch:GetMetricData",
          "cloudwatch:GetMetricStatistics",
          "ses:GetDedicatedIps",
        ],
        Resource: "*",
      },
      {
        Effect: "Allow",
        Action: ["s3:HeadBucket"],
        Resource: "arn:aws:s3:::wraps-inbound-*",
      },
      {
        Effect: "Allow",
        Action: [
          "ses:GetTemplate",
          "ses:ListTemplates",
          "ses:CreateTemplate",
          "ses:UpdateTemplate",
          "ses:DeleteTemplate",
          "ses:TestRenderTemplate",
          "ses:GetEmailTemplate",
          "ses:ListEmailTemplates",
          "ses:CreateEmailTemplate",
          "ses:UpdateEmailTemplate",
          "ses:DeleteEmailTemplate",
          "ses:TestRenderEmailTemplate",
        ],
        Resource: "*",
      },
      {
        Effect: "Allow",
        Action: [
          "ses:SendEmail",
          "ses:SendRawEmail",
          "ses:SendTemplatedEmail",
          "ses:SendBulkTemplatedEmail",
          "ses:SendBulkEmail",
        ],
        Resource: "*",
      },
      {
        Effect: "Allow",
        Action: [
          "ses:ListSuppressedDestinations",
          "ses:GetSuppressedDestination",
          "ses:DeleteSuppressedDestination",
        ],
        Resource: "*",
      },
      {
        Effect: "Allow",
        Action: [
          "dynamodb:DescribeTable",
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:GetItem",
          "dynamodb:BatchGetItem",
        ],
        Resource: [
          "arn:aws:dynamodb:*:*:table/wraps-email-*",
          "arn:aws:dynamodb:*:*:table/wraps-email-*/index/*",
        ],
      },
      {
        Effect: "Allow",
        Action: ["events:PutEvents", "events:DescribeEventBus"],
        Resource: "arn:aws:events:*:*:event-bus/wraps-email-*",
      },
      {
        Effect: "Allow",
        Action: [
          "sqs:SendMessage",
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes",
        ],
        Resource: "arn:aws:sqs:*:*:wraps-email-*",
      },
    ],
  },
  null,
  2
);
