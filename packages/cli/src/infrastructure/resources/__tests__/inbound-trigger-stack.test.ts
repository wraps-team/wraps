import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailStackConfig, InboundTrigger } from "../../../types/index.js";

/**
 * Plan 041 / design §4.3: which inbound resources the stack creates per
 * trigger mode. No Pulumi mock harness exists, so `@pulumi/aws` is replaced by
 * recording constructors and the test reads back names and arguments.
 */

type FakeOutput<T> = {
  __value: T;
  apply<U>(fn: (v: T) => U): FakeOutput<U>;
};

const state = vi.hoisted(() => {
  function makeOutput<T>(value: T): FakeOutput<T> {
    return {
      __value: value,
      apply<U>(fn: (v: T) => U): FakeOutput<U> {
        return makeOutput(fn(value));
      },
    };
  }
  const created: Array<{
    type: string;
    name: string;
    args: any;
    opts?: any;
  }> = [];
  return { makeOutput, created };
});

vi.mock("@pulumi/aws", () => {
  function recorder(type: string) {
    return class {
      name: FakeOutput<string>;
      arn: FakeOutput<string>;
      id: FakeOutput<string>;
      constructor(name: string, args: any, opts?: any) {
        state.created.push({ type, name, args, opts });
        const physical = args?.name ?? args?.bucket ?? name;
        this.name = state.makeOutput(physical);
        this.id = state.makeOutput(physical);
        this.arn = state.makeOutput(
          type.startsWith("s3.")
            ? `arn:aws:s3:::${physical}`
            : `arn:aws:${type.split(".")[0]}:us-east-1:123456789012:${physical}`
        );
      }
    };
  }
  return {
    getCallerIdentity: vi.fn().mockResolvedValue({ accountId: "123456789012" }),
    iam: {
      Role: recorder("iam.Role"),
      RolePolicy: recorder("iam.RolePolicy"),
      RolePolicyAttachment: recorder("iam.RolePolicyAttachment"),
    },
    lambda: {
      Function: recorder("lambda.Function"),
      Permission: recorder("lambda.Permission"),
    },
    s3: {
      BucketV2: recorder("s3.BucketV2"),
      BucketPublicAccessBlock: recorder("s3.BucketPublicAccessBlock"),
      BucketServerSideEncryptionConfigurationV2: recorder(
        "s3.BucketServerSideEncryptionConfigurationV2"
      ),
      BucketLifecycleConfigurationV2: recorder(
        "s3.BucketLifecycleConfigurationV2"
      ),
      BucketPolicy: recorder("s3.BucketPolicy"),
      BucketNotification: recorder("s3.BucketNotification"),
    },
    sqs: {
      Queue: recorder("sqs.Queue"),
    },
    cloudwatch: {
      EventRule: recorder("cloudwatch.EventRule"),
      EventTarget: recorder("cloudwatch.EventTarget"),
      EventConnection: recorder("cloudwatch.EventConnection"),
      EventApiDestination: recorder("cloudwatch.EventApiDestination"),
    },
  };
});

vi.mock("@pulumi/pulumi", () => ({
  all: (values: unknown[]) =>
    state.makeOutput(
      values.map((v) =>
        v && typeof v === "object" && "__value" in v
          ? (v as FakeOutput<unknown>).__value
          : v
      )
    ),
  output: (v: unknown) => state.makeOutput(v),
  asset: {
    FileArchive: class {
      path: string;
      constructor(path: string) {
        this.path = path;
      }
    },
  },
}));

vi.mock("../lambda.js", () => ({
  getLambdaCode: vi.fn().mockResolvedValue("/tmp/wraps-test/inbound"),
  deployLambdaFunctions: vi.fn(),
}));

vi.mock("../iam.js", () => ({
  createIAMRole: vi.fn().mockResolvedValue({
    arn: state.makeOutput("arn:aws:iam::123456789012:role/wraps-email-role"),
    name: state.makeOutput("wraps-email-role"),
  }),
}));

import { buildEmailStackConfig } from "../../../utils/shared/metadata.js";
import { deployEmailStack } from "../../email-stack.js";

function stackConfig(trigger?: InboundTrigger): EmailStackConfig {
  return {
    provider: "aws",
    region: "us-east-1",
    emailConfig: {
      domain: "example.com",
      sendingEnabled: true,
      inbound: {
        enabled: true,
        subdomain: "inbound",
        receivingDomain: "inbound.example.com",
        bucketName: "wraps-inbound-123456789012-us-east-1",
        ...(trigger ? { trigger } : {}),
      },
    },
  } as EmailStackConfig;
}

function named(type: string, name: string) {
  return state.created.filter((c) => c.type === type && c.name === name);
}

function bucketPolicyResources(): string[] {
  const policy = named("s3.BucketPolicy", "wraps-inbound-bucket-policy")[0];
  const doc = JSON.parse((policy.args.policy as FakeOutput<string>).__value);
  const stmt = doc.Statement.find(
    (s: { Sid: string }) => s.Sid === "AllowSESPut"
  );
  return stmt.Resource;
}

describe("inbound stack resources per trigger mode", () => {
  beforeEach(() => {
    state.created.length = 0;
  });

  it('"ses-lambda-action": SES invoke permission, no S3 permission, no bucket notification', async () => {
    await deployEmailStack(stackConfig("ses-lambda-action"));

    const ses = named("lambda.Permission", "wraps-inbound-ses-invoke");
    expect(ses).toHaveLength(1);
    expect(ses[0].args).toMatchObject({
      statementId: "wraps-inbound-ses-invoke",
      action: "lambda:InvokeFunction",
      principal: "ses.amazonaws.com",
      sourceAccount: "123456789012",
      sourceArn:
        "arn:aws:ses:us-east-1:123456789012:receipt-rule-set/wraps-inbound-rules:receipt-rule/wraps-inbound-catch-all",
    });
    expect(named("lambda.Permission", "wraps-inbound-s3-invoke")).toHaveLength(
      0
    );
    expect(
      named("s3.BucketNotification", "wraps-inbound-s3-notification")
    ).toHaveLength(0);
  });

  it('"s3-notification" (saved explicitly): both permissions and the raw/ notification', async () => {
    await deployEmailStack(stackConfig("s3-notification"));

    expect(named("lambda.Permission", "wraps-inbound-ses-invoke")).toHaveLength(
      1
    );
    expect(named("lambda.Permission", "wraps-inbound-s3-invoke")).toHaveLength(
      1
    );
    const notification = named(
      "s3.BucketNotification",
      "wraps-inbound-s3-notification"
    );
    expect(notification).toHaveLength(1);
    expect(notification[0].args.lambdaFunctions[0].filterPrefix).toBe("raw/");
  });

  it("absent trigger (every legacy deployment) deploys the s3-notification mode", async () => {
    await deployEmailStack(stackConfig(undefined));

    expect(named("lambda.Permission", "wraps-inbound-s3-invoke")).toHaveLength(
      1
    );
    expect(
      named("s3.BucketNotification", "wraps-inbound-s3-notification")
    ).toHaveLength(1);
    expect(named("lambda.Permission", "wraps-inbound-ses-invoke")).toHaveLength(
      1
    );
  });

  it.each(["s3-notification", "ses-lambda-action"] as const)(
    "AllowSESPut covers raw/* and mail/* in %s mode",
    async (trigger) => {
      await deployEmailStack(stackConfig(trigger));
      expect(bucketPolicyResources()).toEqual([
        "arn:aws:s3:::wraps-inbound-123456789012-us-east-1/raw/*",
        "arn:aws:s3:::wraps-inbound-123456789012-us-east-1/mail/*",
      ]);
    }
  );

  it("the processor role grants s3:GetObject/PutObject and no non-action s3:HeadObject", async () => {
    await deployEmailStack(stackConfig("ses-lambda-action"));
    const policy = named("iam.RolePolicy", "wraps-inbound-lambda-policy")[0];
    const doc = JSON.parse((policy.args.policy as FakeOutput<string>).__value);
    const s3Actions = doc.Statement.flatMap((s: { Action: string[] }) =>
      s.Action.filter((a) => a.startsWith("s3:"))
    );
    expect(s3Actions).toEqual(["s3:GetObject", "s3:PutObject"]);
  });

  it("a deploy built from saved metadata keeps the saved trigger (no deploy-site change needed)", async () => {
    const config = stackConfig("ses-lambda-action");
    const metadata = {
      version: "1.0.0",
      accountId: "123456789012",
      region: "us-east-1",
      provider: "aws",
      timestamp: "2026-11-10T00:00:00.000Z",
      services: {
        email: {
          preset: "production",
          config: config.emailConfig,
          deployedAt: "2026-11-10T00:00:00.000Z",
        },
      },
    } as Parameters<typeof buildEmailStackConfig>[0];

    await deployEmailStack(buildEmailStackConfig(metadata, "us-east-1"));

    expect(
      named("s3.BucketNotification", "wraps-inbound-s3-notification")
    ).toHaveLength(0);
    expect(named("lambda.Permission", "wraps-inbound-s3-invoke")).toHaveLength(
      0
    );
  });
});
