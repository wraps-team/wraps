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
const REPAIR = "wraps email upgrade --action redeploy --region us-east-1 --yes";
const ACTIVE = {
  ruleEnabled: true,
  activeRuleSet: "wraps-inbound-rules",
  ruleSetInactive: false,
};
const NEW_RULE = {
  Name: "wraps-inbound-catch-all",
  Enabled: true,
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
      activeRuleSet: "wraps-inbound-rules",
    });

    expect(result).toEqual({
      savedTrigger: "ses-lambda-action",
      ruleTrigger: "ses-lambda-action",
      ruleEnabled: true,
      activeRuleSet: "wraps-inbound-rules",
      ruleSetInactive: false,
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
      activeRuleSet: "wraps-inbound-rules",
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
      activeRuleSet: "wraps-inbound-rules",
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
      activeRuleSet: "wraps-inbound-rules",
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
          ...ACTIVE,
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
          ...ACTIVE,
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
          ...ACTIVE,
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
          ...ACTIVE,
          savedTrigger: "ses-lambda-action",
          ruleTrigger: "unknown",
          sesInvokePermission: true,
          bucketPolicyCoversMail: true,
        },
        REPAIR
      ).mismatches
    ).toEqual(["rule-unrecognized"]);
  });

  it("another active rule set: flags it by name and never suggests a command that would activate wraps-inbound-rules", async () => {
    ses.on(DescribeReceiptRuleCommand).resolves({ Rule: NEW_RULE });
    lambda.on(GetPolicyCommand).rejects(named("ResourceNotFoundException"));
    s3.on(GetBucketPolicyCommand).resolves({
      Policy: bucketPolicy(["raw/", "mail/"]),
    });

    const result = await checkInboundTrigger({
      region: "us-east-1",
      bucketName: BUCKET,
      savedTrigger: "ses-lambda-action",
      repairCommand: REPAIR,
      activeRuleSet: "customer-rules",
    });

    expect(result.ruleSetInactive).toBe(true);
    expect(result.activeRuleSet).toBe("customer-rules");
    expect(result.mismatches).toContain("rule-set-inactive");
    const inactive = result.warnings[0];
    expect(inactive).toContain("customer-rules");
    // no warning tells the user to run a command that activates our set
    for (const w of result.warnings) {
      expect(w).not.toMatch(/Run `wraps email inbound (init|add)/);
      expect(w).not.toMatch(/inbound (init|add)[^`]*--yes/);
      expect(
        w.includes("inbound init") ? w.includes("deactivates") : true
      ).toBe(true);
    }
    // the repair it does name never touches the active set
    expect(result.warnings.some((w) => w.includes(REPAIR))).toBe(true);
  });

  it("a missing rule while another set is active names no command", () => {
    const { warnings } = compareInboundTrigger(
      {
        ruleEnabled: null,
        activeRuleSet: "customer-rules",
        ruleSetInactive: true,
        savedTrigger: "ses-lambda-action",
        ruleTrigger: "missing",
        sesInvokePermission: true,
        bucketPolicyCoversMail: true,
      },
      REPAIR
    );
    expect(warnings.join("\n")).not.toMatch(
      /`wraps email inbound init`\s+recreates/
    );
  });

  it("flags a disabled rule", () => {
    const { mismatches, warnings } = compareInboundTrigger(
      {
        ...ACTIVE,
        ruleEnabled: false,
        savedTrigger: "ses-lambda-action",
        ruleTrigger: "ses-lambda-action",
        sesInvokePermission: true,
        bucketPolicyCoversMail: true,
      },
      REPAIR
    );
    expect(mismatches).toEqual(["rule-disabled"]);
    expect(warnings[0]).toContain("disabled");
  });
});
