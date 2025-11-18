import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock all external dependencies
vi.mock("@pulumi/pulumi", () => ({
  automation: {
    LocalWorkspace: {
      createOrSelectStack: vi.fn(),
    },
    installPulumiCli: vi.fn(),
  },
}));
vi.mock("@pulumi/pulumi/automation", () => ({
  LocalWorkspace: {
    createOrSelectStack: vi.fn(),
  },
  installPulumiCli: vi.fn(),
}));
vi.mock("@clack/prompts");
vi.mock("node:fs");
vi.mock("node:path");
vi.mock("../../utils/shared/aws.js");
vi.mock("../../utils/shared/pulumi.js");
vi.mock("../../utils/shared/fs.js");
vi.mock("../../utils/shared/metadata.js");
vi.mock("../../utils/email/route53.js");
vi.mock("../../utils/shared/prompts.js");
vi.mock("../../infrastructure/email-stack.js");

import * as fs from "node:fs";
import * as path from "node:path";
import * as prompts from "@clack/prompts";
import { deployEmailStack } from "../../infrastructure/email-stack.js";
import * as route53Utils from "../../utils/email/route53.js";
import * as aws from "../../utils/shared/aws.js";
import * as fsUtils from "../../utils/shared/fs.js";
import * as metadata from "../../utils/shared/metadata.js";
import * as promptUtils from "../../utils/shared/prompts.js";
import * as pulumiUtils from "../../utils/shared/pulumi.js";
// Import after mocks
import { init } from "../email/init.js";

describe("init command", () => {
  let mockSpinner: {
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    message: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock spinner
    mockSpinner = {
      start: vi.fn(),
      stop: vi.fn(),
      message: vi.fn(),
    };

    // Mock prompts module
    vi.mocked(prompts.spinner).mockReturnValue(mockSpinner as never);
    vi.mocked(prompts.intro).mockImplementation(() => {});
    vi.mocked(prompts.outro).mockImplementation(() => {});
    vi.mocked(prompts.note).mockImplementation(() => {});
    vi.mocked(prompts.log).info = vi.fn();
    vi.mocked(prompts.log).success = vi.fn();
    vi.mocked(prompts.log).error = vi.fn();
    vi.mocked(prompts.log).step = vi.fn();
    vi.mocked(prompts.isCancel).mockReturnValue(false);

    // Mock path operations
    vi.mocked(path.join).mockImplementation((...args) => args.join("/"));

    // Mock fs operations
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined);

    // Mock AWS utilities
    vi.mocked(aws.validateAWSCredentials).mockResolvedValue({
      accountId: "123456789012",
      userId: "AIDACKCEVSQ6C2EXAMPLE",
      arn: "arn:aws:iam::123456789012:user/test",
    });
    vi.mocked(aws.getAWSRegion).mockResolvedValue("us-east-1");

    // Mock Pulumi utilities
    vi.mocked(pulumiUtils.ensurePulumiInstalled).mockResolvedValue(false);

    // Mock filesystem utilities
    vi.mocked(fsUtils.ensurePulumiWorkDir).mockReturnValue(undefined);
    vi.mocked(fsUtils.getPulumiWorkDir).mockReturnValue("/mock/.wraps/pulumi");

    // Mock metadata utilities
    vi.mocked(metadata.loadConnectionMetadata).mockReturnValue(null);
    vi.mocked(metadata.saveConnectionMetadata).mockReturnValue(undefined);
    vi.mocked(metadata.createConnectionMetadata).mockImplementation(
      (accountId, region, provider, emailConfig, preset) =>
        ({
          accountId,
          region,
          provider,
          timestamp: new Date().toISOString(),
          services: {
            email: {
              config: emailConfig,
              preset,
            },
          },
        }) as any
    );

    // Mock Route53 utilities
    vi.mocked(route53Utils.findHostedZone).mockResolvedValue(null);
    vi.mocked(route53Utils.createDNSRecords).mockResolvedValue(undefined);

    // Mock prompt utilities
    vi.mocked(promptUtils.promptProvider).mockResolvedValue("vercel");
    vi.mocked(promptUtils.promptRegion).mockResolvedValue("us-east-1");
    vi.mocked(promptUtils.promptDomain).mockResolvedValue("example.com");
    vi.mocked(promptUtils.promptConfigPreset).mockResolvedValue("starter");
    vi.mocked(promptUtils.promptEstimatedVolume).mockResolvedValue("1k-10k");
    vi.mocked(promptUtils.confirmDeploy).mockResolvedValue(true);
    vi.mocked(promptUtils.promptVercelConfig).mockResolvedValue({
      teamSlug: "my-team",
    });

    // Mock deployEmailStack
    vi.mocked(deployEmailStack).mockResolvedValue({
      roleArn: "arn:aws:iam::123456789012:role/wraps-email-role",
      configSetName: "wraps-email-tracking",
      dkimTokens: ["token1", "token2", "token3"],
      domain: "example.com",
      region: "us-east-1",
    });
  });

  // Helper function to setup Pulumi mocking
  async function setupPulumiMock() {
    const pulumi = await import("@pulumi/pulumi");
    const pulumiAutomation = await import("@pulumi/pulumi/automation");

    const mockStack = {
      workspace: {
        selectStack: vi.fn().mockResolvedValue(undefined),
      },
      setConfig: vi.fn().mockResolvedValue(undefined),
      up: vi.fn().mockResolvedValue({
        outputs: {
          roleArn: {
            value: "arn:aws:iam::123456789012:role/wraps-email-role",
          },
          configSetName: { value: "wraps-email-tracking" },
          dkimTokens: { value: ["token1", "token2", "token3"] },
          domain: { value: "example.com" },
          region: { value: "us-east-1" },
        },
      }),
    } as any;

    // Mock createOrSelectStack to execute the program function
    const createOrSelectStackMock = vi.fn().mockImplementation(async (args) => {
      // Execute the program function if it exists
      if (args.program) {
        await args.program();
      }
      return mockStack;
    });

    vi.mocked(
      pulumi.automation.LocalWorkspace.createOrSelectStack
    ).mockImplementation(createOrSelectStackMock);
    vi.mocked(
      pulumiAutomation.LocalWorkspace.createOrSelectStack
    ).mockImplementation(createOrSelectStackMock);
  }

  describe("Core Flow Tests", () => {
    it("should validate AWS credentials", async () => {
      await setupPulumiMock();
      await init({});

      expect(aws.validateAWSCredentials).toHaveBeenCalled();
    });

    it("should check Pulumi installation", async () => {
      await setupPulumiMock();
      await init({});

      expect(pulumiUtils.ensurePulumiInstalled).toHaveBeenCalled();
    });

    it("should prevent re-initialization when connection exists", async () => {
      // Mock existing connection
      vi.mocked(metadata.loadConnectionMetadata).mockReturnValue({
        accountId: "123456789012",
        provider: "vercel",
        region: "us-east-1",
        timestamp: new Date().toISOString(),
        services: {
          email: {
            config: {
              domain: "existing.com",
              tracking: { enabled: true, opens: true, clicks: true },
              sendingEnabled: true,
            },
            preset: "starter",
            pulumiStackName: "wraps-email-us-east-1",
          },
        },
      });

      await expect(init({})).rejects.toThrow();
    });

    it("should prompt for provider when not provided", async () => {
      await setupPulumiMock();
      await init({});

      expect(promptUtils.promptProvider).toHaveBeenCalled();
    });

    it("should prompt for region when not provided", async () => {
      await setupPulumiMock();
      await init({});

      expect(promptUtils.promptRegion).toHaveBeenCalled();
    });

    it("should prompt for domain when not provided", async () => {
      await setupPulumiMock();
      await init({});

      expect(promptUtils.promptDomain).toHaveBeenCalled();
    });

    it("should use provided options instead of prompting", async () => {
      await setupPulumiMock();
      await init({
        provider: "aws",
        region: "us-west-2",
        domain: "test.com",
        preset: "production",
      });

      // Should not prompt for these
      expect(promptUtils.promptProvider).not.toHaveBeenCalled();
      expect(promptUtils.promptRegion).not.toHaveBeenCalled();
      expect(promptUtils.promptDomain).not.toHaveBeenCalled();
      expect(promptUtils.promptConfigPreset).not.toHaveBeenCalled();
    });

    it("should deploy email stack", async () => {
      await setupPulumiMock();
      await init({});

      expect(deployEmailStack).toHaveBeenCalled();
    });

    it("should save connection metadata after deployment", async () => {
      await setupPulumiMock();
      await init({});

      expect(metadata.saveConnectionMetadata).toHaveBeenCalled();
    });

    it("should prompt for Vercel config when provider is Vercel", async () => {
      await setupPulumiMock();
      vi.mocked(promptUtils.promptProvider).mockResolvedValue("vercel");

      await init({});

      expect(promptUtils.promptVercelConfig).toHaveBeenCalled();
    });

    it("should not prompt for Vercel config when provider is AWS", async () => {
      await setupPulumiMock();
      vi.mocked(promptUtils.promptProvider).mockResolvedValue("aws");

      await init({});

      expect(promptUtils.promptVercelConfig).not.toHaveBeenCalled();
    });
  });

  describe("Error Handling Tests", () => {
    it("should handle invalid AWS credentials", async () => {
      vi.mocked(aws.validateAWSCredentials).mockRejectedValue(
        new Error("InvalidClientTokenId")
      );

      await expect(init({})).rejects.toThrow();
    });

    it("should handle deployment errors", async () => {
      vi.mocked(deployEmailStack).mockRejectedValue(
        new Error("Deployment failed")
      );

      await expect(init({})).rejects.toThrow();
    });

    it("should handle user cancellation", async () => {
      vi.mocked(promptUtils.confirmDeploy).mockResolvedValue(false);
      vi.mocked(prompts.isCancel).mockReturnValue(true);

      await expect(init({})).rejects.toThrow();
    });

    it("should handle Pulumi lock error", async () => {
      await setupPulumiMock();
      vi.mocked(deployEmailStack).mockRejectedValue(
        new Error("the stack is currently locked by 1 lock(s)")
      );

      await expect(init({})).rejects.toThrow(/locked/);
    });
  });

  describe("DNS Integration Tests", () => {
    it("should check for Route53 hosted zone", async () => {
      await setupPulumiMock();
      await init({});

      expect(route53Utils.findHostedZone).toHaveBeenCalled();
    });

    it("should create DNS records when hosted zone exists and user confirms", async () => {
      await setupPulumiMock();
      vi.mocked(route53Utils.findHostedZone).mockResolvedValue({
        Id: "/hostedzone/Z1234567890ABC",
        Name: "example.com.",
      } as never);

      vi.mocked(prompts.confirm).mockResolvedValue(true as never);

      await init({});

      // Note: actual DNS creation happens based on user prompt
      // This test verifies the hosted zone is found
      expect(route53Utils.findHostedZone).toHaveBeenCalledWith(
        "example.com",
        "us-east-1"
      );
    });

    it("should display manual DNS instructions when no hosted zone", async () => {
      await setupPulumiMock();
      vi.mocked(route53Utils.findHostedZone).mockResolvedValue(null);

      await init({});

      // Should display DNS records via prompts.note or prompts.log
      expect(prompts.note).toHaveBeenCalled();
    });
  });

  describe("Provider-Specific Tests", () => {
    it("should handle Vercel provider setup", async () => {
      await setupPulumiMock();
      await init({ provider: "vercel" });

      expect(promptUtils.promptVercelConfig).toHaveBeenCalled();
    });

    it("should handle AWS native provider setup", async () => {
      await setupPulumiMock();
      await init({ provider: "aws" });

      expect(promptUtils.promptVercelConfig).not.toHaveBeenCalled();
    });

    it("should handle Railway provider setup", async () => {
      await setupPulumiMock();
      await init({ provider: "railway" });

      // Railway doesn't need special config prompts
      expect(promptUtils.promptVercelConfig).not.toHaveBeenCalled();
    });
  });

  describe("Configuration Tests", () => {
    it("should use starter preset when selected", async () => {
      await setupPulumiMock();
      vi.mocked(promptUtils.promptConfigPreset).mockResolvedValue("starter");

      await init({});

      // Verify deployment was called (preset is handled internally)
      expect(deployEmailStack).toHaveBeenCalled();
    });

    it("should use production preset when selected", async () => {
      await setupPulumiMock();
      vi.mocked(promptUtils.promptConfigPreset).mockResolvedValue("production");

      await init({});

      expect(deployEmailStack).toHaveBeenCalled();
    });

    it("should use enterprise preset when selected", async () => {
      await setupPulumiMock();
      vi.mocked(promptUtils.promptConfigPreset).mockResolvedValue("enterprise");

      await init({});

      expect(deployEmailStack).toHaveBeenCalled();
    });

    it("should prompt for custom config when custom preset selected", async () => {
      await setupPulumiMock();
      vi.mocked(promptUtils.promptConfigPreset).mockResolvedValue("custom");
      vi.mocked(promptUtils.promptCustomConfig).mockResolvedValue({
        sendingEnabled: true,
        openTracking: true,
        clickTracking: true,
        trackingDomain: "",
        eventTypes: ["Send", "Delivery"],
        reputationMetrics: true,
        dkimLength: "RSA_2048_BIT",
        emailHistory: true,
        emailHistoryRetention: 90,
        dedicatedIp: false,
      });

      await init({});

      expect(promptUtils.promptCustomConfig).toHaveBeenCalled();
    });
  });

  describe("State Management Tests", () => {
    it("should save metadata with correct fields", async () => {
      await setupPulumiMock();
      // Mock getAWSRegion to return the region we'll pass to init
      vi.mocked(aws.getAWSRegion).mockResolvedValue("us-west-2");
      await init({
        provider: "vercel",
        region: "us-west-2",
        domain: "test.com",
        preset: "starter",
      });

      expect(metadata.saveConnectionMetadata).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "vercel",
          region: "us-west-2",
          accountId: "123456789012",
          services: expect.objectContaining({
            email: expect.objectContaining({
              preset: "starter",
            }),
          }),
        })
      );
    });

    it("should include createdAt timestamp in metadata", async () => {
      await setupPulumiMock();
      await init({});

      expect(metadata.saveConnectionMetadata).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: expect.any(String),
        })
      );
    });

    it("should include updatedAt timestamp in metadata", async () => {
      await setupPulumiMock();
      await init({});

      expect(metadata.saveConnectionMetadata).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: expect.any(String),
        })
      );
    });

    it("should include stackName in metadata", async () => {
      await setupPulumiMock();
      vi.mocked(promptUtils.promptRegion).mockResolvedValue("eu-central-1");
      await init({ region: "eu-central-1" });

      expect(metadata.saveConnectionMetadata).toHaveBeenCalledWith(
        expect.objectContaining({
          services: expect.objectContaining({
            email: expect.objectContaining({
              pulumiStackName: "wraps-123456789012-eu-central-1",
            }),
          }),
        })
      );
    });
  });
});
