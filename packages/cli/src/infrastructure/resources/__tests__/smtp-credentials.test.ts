import { beforeEach, describe, expect, it, vi } from "vitest";

type MockUserArgs = {
  name: string;
  tags: Record<string, string>;
};

type MockUserOptions = {
  import?: string;
};

type MockPolicyArgs = {
  user: string;
  policy: string;
};

type MockAccessKeyArgs = {
  user: string;
};

type MockIamClientConfig = {
  region: string;
};

type PolicyDocument = {
  Version: string;
  Statement: Array<Record<string, unknown>>;
};

const pulumiState = vi.hoisted(() => {
  const createdUsers: Array<{
    logicalName: string;
    args: MockUserArgs;
    opts?: MockUserOptions;
  }> = [];

  const createdPolicies: Array<{
    logicalName: string;
    args: MockPolicyArgs;
  }> = [];

  const createdAccessKeys: Array<{
    logicalName: string;
    args: MockAccessKeyArgs;
  }> = [];

  class MockUser {
    readonly name: string;

    constructor(
      logicalName: string,
      args: MockUserArgs,
      opts?: MockUserOptions
    ) {
      this.name = args.name;
      createdUsers.push({ logicalName, args, opts });
    }
  }

  class MockUserPolicy {
    constructor(logicalName: string, args: MockPolicyArgs) {
      createdPolicies.push({ logicalName, args });
    }
  }

  class MockAccessKey {
    readonly secret = {
      apply: (fn: (secret: string) => string): string =>
        fn("smtp-secret-access-key"),
    };

    constructor(logicalName: string, args: MockAccessKeyArgs) {
      createdAccessKeys.push({ logicalName, args });
    }
  }

  return {
    createdUsers,
    createdPolicies,
    createdAccessKeys,
    MockUser,
    MockUserPolicy,
    MockAccessKey,
  };
});

const iamState = vi.hoisted(() => {
  const iamClientConfigs: MockIamClientConfig[] = [];
  const sendMock = vi.fn<(command: unknown) => Promise<unknown>>();

  class MockIAMClient {
    constructor(config: MockIamClientConfig) {
      iamClientConfigs.push(config);
    }

    send(command: unknown): Promise<unknown> {
      return sendMock(command);
    }
  }

  class MockGetUserCommand {
    constructor(readonly input: { UserName: string }) {}
  }

  return {
    iamClientConfigs,
    sendMock,
    MockIAMClient,
    MockGetUserCommand,
  };
});

vi.mock("@pulumi/aws", () => ({
  iam: {
    User: pulumiState.MockUser,
    UserPolicy: pulumiState.MockUserPolicy,
    AccessKey: pulumiState.MockAccessKey,
  },
}));

vi.mock("@aws-sdk/client-iam", () => ({
  IAMClient: iamState.MockIAMClient,
  GetUserCommand: iamState.MockGetUserCommand,
}));

import {
  convertToSMTPPassword,
  createSMTPCredentials,
} from "../smtp-credentials.js";

describe("smtp credentials resources", () => {
  beforeEach(() => {
    pulumiState.createdUsers.length = 0;
    pulumiState.createdPolicies.length = 0;
    pulumiState.createdAccessKeys.length = 0;
    iamState.iamClientConfigs.length = 0;
    iamState.sendMock.mockReset();
  });

  it("creates an SMTP send policy without configuration set conditions", async () => {
    const notFoundError = new Error("SMTP user not found");
    notFoundError.name = "NoSuchEntityException";
    iamState.sendMock.mockRejectedValueOnce(notFoundError);

    const resources = await createSMTPCredentials({
      configSetName: "wraps-email-tracking",
      region: "us-west-2",
    });

    expect(iamState.iamClientConfigs).toHaveLength(1);
    expect(iamState.iamClientConfigs[0]).toEqual({
      region: expect.any(String),
    });
    expect(pulumiState.createdUsers).toHaveLength(1);
    expect(pulumiState.createdUsers[0]).toMatchObject({
      logicalName: "wraps-email-smtp-user",
      args: {
        name: "wraps-email-smtp-user",
        tags: {
          ManagedBy: "wraps-cli",
          Purpose: "SES SMTP Authentication",
        },
      },
    });
    expect(pulumiState.createdUsers[0]?.opts).toBeUndefined();

    expect(pulumiState.createdAccessKeys).toEqual([
      {
        logicalName: "wraps-email-smtp-key",
        args: { user: "wraps-email-smtp-user" },
      },
    ]);

    expect(pulumiState.createdPolicies).toHaveLength(1);
    const policy = JSON.parse(
      pulumiState.createdPolicies[0]!.args.policy
    ) as PolicyDocument;

    expect(policy).toEqual({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: "ses:SendRawEmail",
          Resource: "*",
        },
      ],
    });
    expect(pulumiState.createdPolicies[0]!.args.policy).not.toContain(
      "ConfigurationSetName"
    );

    expect(resources.smtpPassword).toBe(
      convertToSMTPPassword("smtp-secret-access-key", "us-west-2")
    );
  });

  it("imports the existing SMTP user instead of creating a duplicate", async () => {
    iamState.sendMock.mockResolvedValueOnce({});

    await createSMTPCredentials({
      configSetName: "wraps-email-tracking",
      region: "us-east-1",
    });

    expect(pulumiState.createdUsers).toHaveLength(1);
    expect(pulumiState.createdUsers[0]).toMatchObject({
      logicalName: "wraps-email-smtp-user",
      opts: { import: "wraps-email-smtp-user" },
      args: {
        name: "wraps-email-smtp-user",
        tags: {
          ManagedBy: "wraps-cli",
          Service: "email",
          Purpose: "SES SMTP Authentication",
        },
      },
    });

    const [lookupCall] = iamState.sendMock.mock.calls;
    expect(lookupCall).toHaveLength(1);
    expect(lookupCall?.[0]).toBeInstanceOf(iamState.MockGetUserCommand);
    expect((lookupCall?.[0] as { input: { UserName: string } }).input).toEqual({
      UserName: "wraps-email-smtp-user",
    });
  });
});
