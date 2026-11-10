import * as aws from "@pulumi/aws";
import {
  INBOUND_LEGACY_PREFIX,
  INBOUND_MAIL_PREFIX,
  retentionToDays,
} from "@wraps/core";
import type { ArchiveRetention } from "../../types/index.js";

/**
 * S3 inbound bucket configuration
 */
export type S3InboundConfig = {
  accountId: string;
  region: string;
  retention?: ArchiveRetention;
};

/**
 * S3 inbound resources output
 */
export type S3InboundResources = {
  bucket: aws.s3.BucketV2;
  bucketName: string;
};

/**
 * Create S3 bucket for inbound email storage
 *
 * Structure:
 *   mail/{messageId}        - Raw MIME from the SES receipt rule ("ses-lambda-action" mode)
 *   raw/{messageId}         - Raw MIME from the SES receipt rule (legacy "s3-notification"
 *                             mode, and all mail received before a deployment switched)
 *   parsed/{emailId}.json   - Parsed email JSON from Lambda
 *   attachments/{emailId}/  - Extracted attachments
 */
export async function createS3InboundResources(
  config: S3InboundConfig
): Promise<S3InboundResources> {
  const bucketName = `wraps-inbound-${config.accountId}-${config.region}`;

  // Create the bucket
  const bucket = new aws.s3.BucketV2("wraps-inbound-bucket", {
    bucket: bucketName,
    forceDestroy: true,
    tags: {
      ManagedBy: "wraps-cli",
      Service: "email-inbound",
    },
  });

  // Block all public access
  new aws.s3.BucketPublicAccessBlock("wraps-inbound-public-access-block", {
    bucket: bucket.id,
    blockPublicAcls: true,
    blockPublicPolicy: true,
    ignorePublicAcls: true,
    restrictPublicBuckets: true,
  });

  // AES-256 encryption
  new aws.s3.BucketServerSideEncryptionConfigurationV2(
    "wraps-inbound-encryption",
    {
      bucket: bucket.id,
      rules: [
        {
          applyServerSideEncryptionByDefault: {
            sseAlgorithm: "AES256",
          },
        },
      ],
    }
  );

  // Lifecycle rule for retention
  if (config.retention) {
    const retentionDays = retentionToDays(config.retention);
    if (retentionDays > 0) {
      new aws.s3.BucketLifecycleConfigurationV2("wraps-inbound-lifecycle", {
        bucket: bucket.id,
        rules: [
          {
            id: "wraps-inbound-retention",
            status: "Enabled",
            expiration: {
              days: retentionDays,
            },
          },
        ],
      });
    }
  }

  // Bucket policy allowing SES to write raw emails. Covers both prefixes in
  // both trigger modes, so the switch can move the rule from raw/ to mail/
  // without a policy change in between.
  const identity = await aws.getCallerIdentity();
  new aws.s3.BucketPolicy("wraps-inbound-bucket-policy", {
    bucket: bucket.id,
    policy: bucket.arn.apply((arn) =>
      JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Sid: "AllowSESPut",
            Effect: "Allow",
            Principal: {
              Service: "ses.amazonaws.com",
            },
            Action: "s3:PutObject",
            Resource: [
              `${arn}/${INBOUND_LEGACY_PREFIX}*`,
              `${arn}/${INBOUND_MAIL_PREFIX}*`,
            ],
            Condition: {
              StringEquals: {
                "aws:SourceAccount": identity.accountId,
              },
            },
          },
        ],
      })
    ),
  });

  return {
    bucket,
    bucketName,
  };
}
