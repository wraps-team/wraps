/**
 * Credentials Service Tests
 *
 * Verifies that getCredentials returns both AWS credentials AND
 * the customer's SES region from the awsAccount record.
 * Also verifies org-scoping prevents cross-tenant credential access.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockStsSend = vi.fn().mockResolvedValue({
  Credentials: {
    AccessKeyId: "AKIA-test",
    SecretAccessKey: "secret-test",
    SessionToken: "token-test",
    Expiration: new Date("2099-01-01"),
  },
});

vi.mock("@aws-sdk/client-sts", () => ({
  STSClient: class MockSTSClient {
    send = mockStsSend;
  },
  AssumeRoleCommand: class MockAssumeRoleCommand {
    constructor(public input: unknown) {}
  },
}));

vi.mock("@wraps/db", () => {
  const mockLimit = vi.fn();
  const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
  const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
  const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

  return {
    db: { select: mockSelect },
    eq: vi.fn(),
    and: vi.fn(),
    awsAccount: {
      id: "id",
      organizationId: "organization_id",
      roleArn: "role_arn",
      externalId: "external_id",
      region: "region",
    },
    __mockLimit: mockLimit,
  };
});

const { __mockLimit, and: mockAnd } = await import("@wraps/db" as string);

const { getCredentials } = await import("../services/credentials");

describe("getCredentials", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear the credential cache between tests by re-importing would be complex,
    // so we use unique account IDs per test to avoid cache hits
  });

  it("returns the customer's AWS region from the awsAccount record", async () => {
    (__mockLimit as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        roleArn: "arn:aws:iam::123456789012:role/wraps-email-role",
        externalId: "ext-123",
        region: "eu-west-1",
      },
    ]);

    const result = await getCredentials("account-eu-west-1", "org-1");

    expect(result.region).toBe("eu-west-1");
  });

  it("returns credentials alongside region", async () => {
    (__mockLimit as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        roleArn: "arn:aws:iam::123456789012:role/wraps-email-role",
        externalId: "ext-456",
        region: "ap-southeast-1",
      },
    ]);

    const result = await getCredentials("account-ap-southeast-1", "org-1");

    expect(result.accessKeyId).toBe("AKIA-test");
    expect(result.secretAccessKey).toBe("secret-test");
    expect(result.sessionToken).toBe("token-test");
    expect(result.region).toBe("ap-southeast-1");
  });

  it("scopes the DB query by organizationId using and()", async () => {
    (__mockLimit as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        roleArn: "arn:aws:iam::123456789012:role/wraps-email-role",
        externalId: "ext-scoped",
        region: "us-east-1",
      },
    ]);

    await getCredentials("account-scoped", "org-scope-check");

    // Verify the query uses and() to combine both conditions
    expect(mockAnd).toHaveBeenCalled();
  });

  it("does not reuse cached credentials across organizations for the same account", async () => {
    (__mockLimit as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([
        {
          roleArn: "arn:aws:iam::123456789012:role/wraps-email-role",
          externalId: "ext-org-1",
          region: "us-east-1",
        },
      ])
      .mockResolvedValueOnce([
        {
          roleArn: "arn:aws:iam::123456789012:role/wraps-email-role",
          externalId: "ext-org-2",
          region: "eu-central-1",
        },
      ]);

    const first = await getCredentials("shared-account", "org-1");
    const second = await getCredentials("shared-account", "org-2");

    expect(first.region).toBe("us-east-1");
    expect(second.region).toBe("eu-central-1");
    expect(__mockLimit).toHaveBeenCalledTimes(2);
    expect(mockStsSend).toHaveBeenCalledTimes(2);
  });
});
