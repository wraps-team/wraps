import {
  GetIdentityVerificationAttributesCommand,
  ListIdentitiesCommand,
  SESClient,
} from "@aws-sdk/client-ses";
import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkRegion,
  getAWSRegion,
  isSESSandbox,
  listSESDomains,
  validateAWSCredentials,
} from "../aws.js";
import { WrapsError } from "../errors.js";

const stsMock = mockClient(STSClient);
const sesMock = mockClient(SESClient);

describe("validateAWSCredentials", () => {
  beforeEach(() => {
    stsMock.reset();
  });

  it("should return identity when credentials are valid", async () => {
    stsMock.on(GetCallerIdentityCommand).resolves({
      Account: "123456789012",
      UserId: "AIDAI123456789",
      Arn: "arn:aws:iam::123456789012:user/test",
    });

    const result = await validateAWSCredentials();

    expect(result).toEqual({
      accountId: "123456789012",
      userId: "AIDAI123456789",
      arn: "arn:aws:iam::123456789012:user/test",
    });
  });

  it("should throw WrapsError when credentials are invalid", async () => {
    stsMock
      .on(GetCallerIdentityCommand)
      .rejects(new Error("Invalid credentials"));

    await expect(validateAWSCredentials()).rejects.toThrow(WrapsError);
    await expect(validateAWSCredentials()).rejects.toThrow(
      "AWS credentials not found"
    );
  });

  it("should throw WrapsError when STS call fails", async () => {
    stsMock.on(GetCallerIdentityCommand).rejects(new Error("Network error"));

    await expect(validateAWSCredentials()).rejects.toThrow(WrapsError);
  });
});

describe("checkRegion", () => {
  it("should return true for valid US regions", async () => {
    expect(await checkRegion("us-east-1")).toBe(true);
    expect(await checkRegion("us-east-2")).toBe(true);
    expect(await checkRegion("us-west-1")).toBe(true);
    expect(await checkRegion("us-west-2")).toBe(true);
  });

  it("should return true for valid EU regions", async () => {
    expect(await checkRegion("eu-west-1")).toBe(true);
    expect(await checkRegion("eu-central-1")).toBe(true);
    expect(await checkRegion("eu-north-1")).toBe(true);
  });

  it("should return true for valid Asia Pacific regions", async () => {
    expect(await checkRegion("ap-southeast-1")).toBe(true);
    expect(await checkRegion("ap-northeast-1")).toBe(true);
  });

  it("should return false for invalid regions", async () => {
    expect(await checkRegion("invalid-region")).toBe(false);
    expect(await checkRegion("us-east-3")).toBe(false);
    expect(await checkRegion("")).toBe(false);
    expect(await checkRegion("foo-bar-1")).toBe(false);
  });

  it("should be case sensitive", async () => {
    expect(await checkRegion("US-EAST-1")).toBe(false);
    expect(await checkRegion("us-EAST-1")).toBe(false);
  });
});

describe("getAWSRegion", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should return AWS_REGION if set", async () => {
    process.env.AWS_REGION = "us-west-2";
    const region = await getAWSRegion();
    expect(region).toBe("us-west-2");
  });

  it("should return AWS_DEFAULT_REGION if AWS_REGION is not set", async () => {
    process.env.AWS_REGION = undefined;
    process.env.AWS_DEFAULT_REGION = "eu-west-1";
    const region = await getAWSRegion();
    expect(region).toBe("eu-west-1");
  });

  it("should prefer AWS_REGION over AWS_DEFAULT_REGION", async () => {
    process.env.AWS_REGION = "us-east-1";
    process.env.AWS_DEFAULT_REGION = "us-west-1";
    const region = await getAWSRegion();
    expect(region).toBe("us-east-1");
  });

  it("should default to us-east-1 if no environment variables are set", async () => {
    process.env.AWS_REGION = undefined;
    process.env.AWS_DEFAULT_REGION = undefined;
    const region = await getAWSRegion();
    expect(region).toBe("us-east-1");
  });
});

describe("listSESDomains", () => {
  beforeEach(() => {
    sesMock.reset();
  });

  it("should return empty array when no domains exist", async () => {
    sesMock.on(ListIdentitiesCommand).resolves({
      Identities: [],
    });

    const domains = await listSESDomains("us-east-1");
    expect(domains).toEqual([]);
  });

  it("should return domains with verification status", async () => {
    sesMock
      .on(ListIdentitiesCommand)
      .resolves({
        Identities: ["example.com", "test.com"],
      })
      .on(GetIdentityVerificationAttributesCommand)
      .resolves({
        VerificationAttributes: {
          "example.com": { VerificationStatus: "Success" },
          "test.com": { VerificationStatus: "Pending" },
        },
      });

    const domains = await listSESDomains("us-east-1");

    expect(domains).toEqual([
      { domain: "example.com", verified: true },
      { domain: "test.com", verified: false },
    ]);
  });

  it("should handle missing verification attributes", async () => {
    sesMock
      .on(ListIdentitiesCommand)
      .resolves({
        Identities: ["example.com"],
      })
      .on(GetIdentityVerificationAttributesCommand)
      .resolves({
        VerificationAttributes: {},
      });

    const domains = await listSESDomains("us-east-1");

    expect(domains).toEqual([{ domain: "example.com", verified: false }]);
  });

  it("should return empty array on API error", async () => {
    sesMock.on(ListIdentitiesCommand).rejects(new Error("API Error"));

    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const domains = await listSESDomains("us-east-1");

    expect(domains).toEqual([]);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Error listing SES domains:",
      expect.any(Error)
    );

    consoleErrorSpy.mockRestore();
  });

  it("should handle multiple domains correctly", async () => {
    const domainList = [
      "domain1.com",
      "domain2.com",
      "domain3.com",
      "domain4.com",
    ];

    sesMock
      .on(ListIdentitiesCommand)
      .resolves({
        Identities: domainList,
      })
      .on(GetIdentityVerificationAttributesCommand)
      .resolves({
        VerificationAttributes: {
          "domain1.com": { VerificationStatus: "Success" },
          "domain2.com": { VerificationStatus: "Success" },
          "domain3.com": { VerificationStatus: "Pending" },
          "domain4.com": { VerificationStatus: "Failed" },
        },
      });

    const domains = await listSESDomains("us-east-1");

    expect(domains).toHaveLength(4);
    expect(domains[0]).toEqual({ domain: "domain1.com", verified: true });
    expect(domains[2]).toEqual({ domain: "domain3.com", verified: false });
  });
});

describe("isSESSandbox", () => {
  beforeEach(() => {
    sesMock.reset();
  });

  it("should return false when SES API call succeeds", async () => {
    sesMock.on(ListIdentitiesCommand).resolves({
      Identities: ["example.com"],
    });

    const result = await isSESSandbox("us-east-1");
    expect(result).toBe(false);
  });

  it("should return false when no identities exist but API works", async () => {
    sesMock.on(ListIdentitiesCommand).resolves({
      Identities: [],
    });

    const result = await isSESSandbox("us-east-1");
    expect(result).toBe(false);
  });

  it("should return true when InvalidParameterValue error occurs", async () => {
    const error = new Error("Invalid parameter");
    (error as any).name = "InvalidParameterValue";
    sesMock.on(ListIdentitiesCommand).rejects(error);

    const result = await isSESSandbox("us-east-1");
    expect(result).toBe(true);
  });

  it("should throw error for other API errors", async () => {
    const error = new Error("Access denied");
    (error as any).name = "AccessDenied";
    sesMock.on(ListIdentitiesCommand).rejects(error);

    await expect(isSESSandbox("us-east-1")).rejects.toThrow("Access denied");
  });
});
