import { AssumeRoleCommand, STSClient } from "@aws-sdk/client-sts";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it } from "vitest";
import { assumeRole } from "../assume-role.js";

const stsMock = mockClient(STSClient);

describe("assume-role utilities", () => {
  const mockRoleArn = "arn:aws:iam::123456789012:role/test-role";
  const mockRegion = "us-east-1";
  const mockAccessKeyId = "AKIAIOSFODNN7EXAMPLE";
  const mockSecretAccessKey = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";
  const mockSessionToken = "FwoGZXIvYXdzEBYaDOZV...";
  const mockExpiration = new Date("2024-01-01T12:00:00Z");

  beforeEach(() => {
    stsMock.reset();
  });

  describe("assumeRole", () => {
    it("should successfully assume role and return credentials", async () => {
      stsMock.on(AssumeRoleCommand).resolves({
        Credentials: {
          AccessKeyId: mockAccessKeyId,
          SecretAccessKey: mockSecretAccessKey,
          SessionToken: mockSessionToken,
          Expiration: mockExpiration,
        },
      });

      const result = await assumeRole(mockRoleArn, mockRegion);

      expect(result).toEqual({
        accessKeyId: mockAccessKeyId,
        secretAccessKey: mockSecretAccessKey,
        sessionToken: mockSessionToken,
        expiration: mockExpiration,
      });
    });

    it("should create STS client with correct region", async () => {
      stsMock.on(AssumeRoleCommand).resolves({
        Credentials: {
          AccessKeyId: mockAccessKeyId,
          SecretAccessKey: mockSecretAccessKey,
          SessionToken: mockSessionToken,
        },
      });

      await assumeRole(mockRoleArn, "eu-west-1");

      const calls = stsMock.commandCalls(AssumeRoleCommand);
      expect(calls.length).toBe(1);
    });

    it("should use provided role ARN", async () => {
      stsMock.on(AssumeRoleCommand).resolves({
        Credentials: {
          AccessKeyId: mockAccessKeyId,
          SecretAccessKey: mockSecretAccessKey,
          SessionToken: mockSessionToken,
        },
      });

      await assumeRole(mockRoleArn, mockRegion);

      const calls = stsMock.commandCalls(AssumeRoleCommand);
      expect(calls[0].args[0].input.RoleArn).toBe(mockRoleArn);
    });

    it("should use default session name if not provided", async () => {
      stsMock.on(AssumeRoleCommand).resolves({
        Credentials: {
          AccessKeyId: mockAccessKeyId,
          SecretAccessKey: mockSecretAccessKey,
          SessionToken: mockSessionToken,
        },
      });

      await assumeRole(mockRoleArn, mockRegion);

      const calls = stsMock.commandCalls(AssumeRoleCommand);
      expect(calls[0].args[0].input.RoleSessionName).toBe("wraps-console");
    });

    it("should use custom session name if provided", async () => {
      stsMock.on(AssumeRoleCommand).resolves({
        Credentials: {
          AccessKeyId: mockAccessKeyId,
          SecretAccessKey: mockSecretAccessKey,
          SessionToken: mockSessionToken,
        },
      });

      await assumeRole(mockRoleArn, mockRegion, "custom-session");

      const calls = stsMock.commandCalls(AssumeRoleCommand);
      expect(calls[0].args[0].input.RoleSessionName).toBe("custom-session");
    });

    it("should set duration to 1 hour (3600 seconds)", async () => {
      stsMock.on(AssumeRoleCommand).resolves({
        Credentials: {
          AccessKeyId: mockAccessKeyId,
          SecretAccessKey: mockSecretAccessKey,
          SessionToken: mockSessionToken,
        },
      });

      await assumeRole(mockRoleArn, mockRegion);

      const calls = stsMock.commandCalls(AssumeRoleCommand);
      expect(calls[0].args[0].input.DurationSeconds).toBe(3600);
    });

    it("should throw error if no credentials returned", async () => {
      stsMock.on(AssumeRoleCommand).resolves({
        Credentials: undefined,
      });

      await expect(assumeRole(mockRoleArn, mockRegion)).rejects.toThrow(
        "Failed to assume role: No credentials returned"
      );
    });

    it("should handle AWS SDK errors", async () => {
      stsMock
        .on(AssumeRoleCommand)
        .rejects(new Error("AccessDenied: User not authorized"));

      await expect(assumeRole(mockRoleArn, mockRegion)).rejects.toThrow(
        "AccessDenied: User not authorized"
      );
    });

    it("should handle missing credentials fields gracefully", async () => {
      stsMock.on(AssumeRoleCommand).resolves({
        Credentials: {
          AccessKeyId: mockAccessKeyId,
          SecretAccessKey: mockSecretAccessKey,
          SessionToken: mockSessionToken,
          // No Expiration
        },
      });

      const result = await assumeRole(mockRoleArn, mockRegion);

      expect(result.expiration).toBeUndefined();
    });

    it("should work with different regions", async () => {
      stsMock.on(AssumeRoleCommand).resolves({
        Credentials: {
          AccessKeyId: mockAccessKeyId,
          SecretAccessKey: mockSecretAccessKey,
          SessionToken: mockSessionToken,
        },
      });

      await assumeRole(mockRoleArn, "ap-southeast-1");

      const calls = stsMock.commandCalls(AssumeRoleCommand);
      expect(calls.length).toBe(1);
    });

    it("should handle role ARN with different account IDs", async () => {
      const differentRoleArn = "arn:aws:iam::999888777666:role/other-role";

      stsMock.on(AssumeRoleCommand).resolves({
        Credentials: {
          AccessKeyId: mockAccessKeyId,
          SecretAccessKey: mockSecretAccessKey,
          SessionToken: mockSessionToken,
        },
      });

      await assumeRole(differentRoleArn, mockRegion);

      const calls = stsMock.commandCalls(AssumeRoleCommand);
      expect(calls[0].args[0].input.RoleArn).toBe(differentRoleArn);
    });

    it("should return all credential fields", async () => {
      stsMock.on(AssumeRoleCommand).resolves({
        Credentials: {
          AccessKeyId: mockAccessKeyId,
          SecretAccessKey: mockSecretAccessKey,
          SessionToken: mockSessionToken,
          Expiration: mockExpiration,
        },
      });

      const result = await assumeRole(mockRoleArn, mockRegion);

      expect(result).toHaveProperty("accessKeyId");
      expect(result).toHaveProperty("secretAccessKey");
      expect(result).toHaveProperty("sessionToken");
      expect(result).toHaveProperty("expiration");
    });
  });
});
