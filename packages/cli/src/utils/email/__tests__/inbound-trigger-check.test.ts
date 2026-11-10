import { GetPolicyCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { GetBucketPolicyCommand, S3Client } from "@aws-sdk/client-s3";
import { DescribeReceiptRuleCommand, SESClient } from "@aws-sdk/client-ses";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it } from "vitest";
import {
  checkInboundTrigger,
  compareInboundTrigger,
} from "../inbound-trigger-check.js";

const ses = mockClient(SESClient);
const lambda = mockClient(LambdaClient);
const s3 = mockClient(S3Client);

const BUCKET = "wraps-inbound-123456789012-us-east-1";
const REPAIR =
  "wraps email inbound init --domain example.com --subdomain inbound --region us-east-1 --yes";
const NEW_RULE = {
  Name: "wraps-inbound-catch-all",
  Recipients: ["inbound.example.com"],
  Actions: [
    { S3Action: { BucketName: BUCKET, ObjectKeyPrefix: "mail/" } },
    {
      LambdaAction: {
        FunctionArn:
          "arn:aws:lambda:us-east-1:123456789012:function:wraps-inbound-email-processor",
        InvocationType: "Event" as const,
      },
    },
  ],
};
const SES_POLICY = JSON.stringify({
  Statement: [
    {
      Sid: "wraps-inbound-ses-invoke",
      Effect: "Allow",
      Principal: { Service: "ses.amazonaws.com" },
      Action: "lambda:InvokeFunction",
    },
  ],
});
function bucketPolicy(prefixes: string[]) {
  return JSON.stringify({
    Statement: [
      {
        Sid: "AllowSESPut",
        Effect: "Allow",
        Principal: { Service: "ses.amazonaws.com" },
        Action: "s3:PutObject",
        Resource: prefixes.map((p) => `arn:aws:s3:::${BUCKET}/${p}*`),
      },
    ],
  });
}
function named(name: string) {
  const error = new Error(name);
  error.name = name;
  return error;
}

beforeEach(() => {
  ses.reset();
  lambda.reset();
  s3.reset();
});

describe("checkInboundTrigger", () => {
  it("reports agreement for a fully switched deployment", async () => {
    ses.on(DescribeReceiptRuleCommand).resolves({ Rule: NEW_RULE });
    lambda.on(GetPolicyCommand).resolves({ Policy: SES_POLICY });
    s3.on(GetBucketPolicyCommand).resolves({
      Policy: bucketPolicy(["raw/", "mail/"]),
    });

    const result = await checkInboundTrigger({
      region: "us-east-1",
      bucketName: BUCKET,
      savedTrigger: "ses-lambda-action",
      repairCommand: REPAIR,
    });

    expect(result).toEqual({
      savedTrigger: "ses-lambda-action",
      ruleTrigger: "ses-lambda-action",
      sesInvokePermission: true,
      bucketPolicyCoversMail: true,
      mismatches: [],
      warnings: [],
    });
  });

  it("flags an older CLI's redeploy: SES permission gone and policy back to raw/* only", async () => {
    ses.on(DescribeReceiptRuleCommand).resolves({ Rule: NEW_RULE });
    lambda.on(GetPolicyCommand).resolves({
      Policy: JSON.stringify({
        Statement: [
          {
            Sid: "s3",
            Effect: "Allow",
            Principal: { Service: "s3.amazonaws.com" },
            Action: "lambda:InvokeFunction",
          },
        ],
      }),
    });
    s3.on(GetBucketPolicyCommand).resolves({ Policy: bucketPolicy(["raw/"]) });

    const result = await checkInboundTrigger({
      region: "us-east-1",
      bucketName: BUCKET,
      savedTrigger: "ses-lambda-action",
      repairCommand: REPAIR,
    });

    expect(result.sesInvokePermission).toBe(false);
    expect(result.bucketPolicyCoversMail).toBe(false);
    expect(result.mismatches).toEqual([
      "ses-invoke-permission-missing",
      "bucket-policy-missing-mail",
    ]);
    expect(result.warnings.every((w) => w.includes(REPAIR))).toBe(true);
  });

  it("treats ResourceNotFound / NoSuchBucketPolicy as absent and AccessDenied as unchecked", async () => {
    ses.on(DescribeReceiptRuleCommand).rejects(named("AccessDenied"));
    lambda.on(GetPolicyCommand).rejects(named("ResourceNotFoundException"));
    s3.on(GetBucketPolicyCommand).rejects(named("NoSuchBucketPolicy"));

    const result = await checkInboundTrigger({
      region: "us-east-1",
      bucketName: BUCKET,
      savedTrigger: "ses-lambda-action",
      repairCommand: REPAIR,
    });
    expect(result.ruleTrigger).toBeNull();
    expect(result.sesInvokePermission).toBe(false);
    expect(result.bucketPolicyCoversMail).toBe(false);

    lambda.on(GetPolicyCommand).rejects(named("AccessDeniedException"));
    s3.on(GetBucketPolicyCommand).rejects(named("AccessDenied"));
    const unchecked = await checkInboundTrigger({
      region: "us-east-1",
      bucketName: BUCKET,
      savedTrigger: "ses-lambda-action",
      repairCommand: REPAIR,
    });
    expect(unchecked.sesInvokePermission).toBeNull();
    expect(unchecked.bucketPolicyCoversMail).toBeNull();
    expect(unchecked.mismatches).toEqual([]);
  });
});

describe("compareInboundTrigger", () => {
  it("flags a rule that differs from the saved mode (switch stopped at step 3)", () => {
    expect(
      compareInboundTrigger(
        {
          savedTrigger: "s3-notification",
          ruleTrigger: "ses-lambda-action",
          sesInvokePermission: true,
          bucketPolicyCoversMail: true,
        },
        REPAIR
      ).mismatches
    ).toEqual(["rule-differs-from-saved"]);
  });

  it("does not flag a missing SES permission while the legacy trigger is fully in use", () => {
    expect(
      compareInboundTrigger(
        {
          savedTrigger: "s3-notification",
          ruleTrigger: "s3-notification",
          sesInvokePermission: false,
          bucketPolicyCoversMail: false,
        },
        REPAIR
      ).mismatches
    ).toEqual([]);
  });

  it("flags a missing rule and an unrecognized rule", () => {
    expect(
      compareInboundTrigger(
        {
          savedTrigger: "ses-lambda-action",
          ruleTrigger: "missing",
          sesInvokePermission: true,
          bucketPolicyCoversMail: true,
        },
        REPAIR
      ).mismatches
    ).toEqual(["rule-missing"]);
    expect(
      compareInboundTrigger(
        {
          savedTrigger: "ses-lambda-action",
          ruleTrigger: "unknown",
          sesInvokePermission: true,
          bucketPolicyCoversMail: true,
        },
        REPAIR
      ).mismatches
    ).toEqual(["rule-unrecognized"]);
  });
});
