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

const iamClientConfigs: MockIamClientConfig[] = [];

const sendMock = vi.fn<(command: unknown) => Promise<unknown>>();

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

vi.mock("@pulumi/aws", () => ({
  iam: {
    User: MockUser,
    UserPolicy: MockUserPolicy,
    AccessKey: MockAccessKey,
  },
}));

vi.mock("@aws-sdk/client-iam", () => ({
  IAMClient: MockIAMClient,
  GetUserCommand: MockGetUserCommand,
}));

import {
  convertToSMTPPassword,
  createSMTPCredentials,
} from "../smtp-credentials.js";

describe("smtp credentials resources", () => {
  beforeEach(() => {
    createdUsers.length = 0;
    createdPolicies.length = 0;
    createdAccessKeys.length = 0;
    iamClientConfigs.length = 0;
    sendMock.mockReset();
  });

  it("creates an SMTP send policy without configuration set conditions", async () => {
    const notFoundError = new Error("SMTP user not found");
    notFoundError.name = "NoSuchEntityException";
    sendMock.mockRejectedValueOnce(notFoundError);

    const resources = await createSMTPCredentials({
      configSetName: "wraps-email-tracking",
      region: "us-west-2",
    });

    expect(iamClientConfigs).toHaveLength(1);
    expect(iamClientConfigs[0]).toEqual({
      region: expect.any(String),
    });
    expect(createdUsers).toHaveLength(1);
    expect(createdUsers[0]).toMatchObject({
      logicalName: "wraps-email-smtp-user",
      args: {
        name: "wraps-email-smtp-user",
        tags: {
          ManagedBy: "wraps-cli",
          Purpose: "SES SMTP Authentication",
        },
      },
    });
    expect(createdUsers[0]?.opts).toBeUndefined();

    expect(createdAccessKeys).toEqual([
      {
        logicalName: "wraps-email-smtp-key",
        args: { user: "wraps-email-smtp-user" },
      },
    ]);

    expect(createdPolicies).toHaveLength(1);
    const policy = JSON.parse(
      createdPolicies[0]!.args.policy
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
    expect(createdPolicies[0]!.args.policy).not.toContain(
      "ConfigurationSetName"
    );

    expect(resources.smtpPassword).toBe(
      convertToSMTPPassword("smtp-secret-access-key", "us-west-2")
    );
  });

  it("imports the existing SMTP user instead of creating a duplicate", async () => {
    sendMock.mockResolvedValueOnce({});

    await createSMTPCredentials({
      configSetName: "wraps-email-tracking",
      region: "us-east-1",
    });

    expect(createdUsers).toHaveLength(1);
    expect(createdUsers[0]).toMatchObject({
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

    const [lookupCall] = sendMock.mock.calls;
    expect(lookupCall).toHaveLength(1);
    expect(lookupCall?.[0]).toBeInstanceOf(MockGetUserCommand);
    expect((lookupCall?.[0] as MockGetUserCommand).input).toEqual({
      UserName: "wraps-email-smtp-user",
    });
  });
});
