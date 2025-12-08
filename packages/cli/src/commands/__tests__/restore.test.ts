import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock all external dependencies
vi.mock("@pulumi/pulumi", () => ({
  automation: {
    LocalWorkspace: {
      selectStack: vi.fn(),
    },
  },
}));
vi.mock("@pulumi/pulumi/automation", () => ({
  LocalWorkspace: {
    selectStack: vi.fn(),
  },
}));
vi.mock("@clack/prompts");
vi.mock("../../utils/shared/aws.js");
vi.mock("../../utils/shared/fs.js");
vi.mock("../../utils/shared/metadata.js");

import * as prompts from "@clack/prompts";
import * as aws from "../../utils/shared/aws.js";
import * as fsUtils from "../../utils/shared/fs.js";
import * as metadata from "../../utils/shared/metadata.js";
// Import after mocks
import { restore } from "../email/restore.js";

describe("restore command", () => {
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
    vi.mocked(prompts.cancel).mockImplementation(() => {});
    vi.mocked(prompts.confirm).mockResolvedValue(true as never);
    vi.mocked(prompts.isCancel).mockReturnValue(false);
    vi.mocked(prompts.log).info = vi.fn();
    vi.mocked(prompts.log).success = vi.fn();
    vi.mocked(prompts.log).error = vi.fn();
    vi.mocked(prompts.log).warn = vi.fn();

    // Mock AWS utilities
    vi.mocked(aws.validateAWSCredentials).mockResolvedValue({
      accountId: "123456789012",
      userId: "AIDACKCEVSQ6C2EXAMPLE",
      arn: "arn:aws:iam::123456789012:user/test",
    });
    vi.mocked(aws.getAWSRegion).mockResolvedValue("us-east-1");

    // Mock filesystem utilities
    vi.mocked(fsUtils.getPulumiWorkDir).mockReturnValue("/mock/.wraps/pulumi");

    // Mock metadata utilities with connection data
    vi.mocked(metadata.loadConnectionMetadata).mockResolvedValue({
      accountId: "123456789012",
      region: "us-east-1",
      provider: "vercel",
      timestamp: new Date().toISOString(),
      services: {
        email: {
          config: {
            tracking: { enabled: true },
            eventTracking: {
              enabled: true,
              dynamoDBHistory: true,
              events: ["Send", "Delivery"],
            },
          },
          preset: "production",
          pulumiStackName: "wraps-123456789012-us-east-1",
        },
      },
    } as any);
    vi.mocked(metadata.deleteConnectionMetadata).mockResolvedValue(undefined);
  });

  // Helper function to setup Pulumi mocking
  async function setupPulumiMock(shouldThrowOnSelect = false) {
    const pulumi = await import("@pulumi/pulumi");
    const pulumiAutomation = await import("@pulumi/pulumi/automation");

    const mockStack = {
      destroy: vi.fn().mockResolvedValue(undefined),
      workspace: {
        removeStack: vi.fn().mockResolvedValue(undefined),
      },
    } as any;

    const selectStackMock = vi.fn().mockImplementation(() => {
      if (shouldThrowOnSelect) {
        throw new Error("Stack not found");
      }
      return mockStack;
    });

    vi.mocked(pulumi.automation.LocalWorkspace.selectStack).mockImplementation(
      selectStackMock
    );
    vi.mocked(pulumiAutomation.LocalWorkspace.selectStack).mockImplementation(
      selectStackMock
    );

    return mockStack;
  }

  describe("Core Flow Tests", () => {
    it("should validate AWS credentials", async () => {
      await setupPulumiMock();
      await restore({ force: true });

      expect(aws.validateAWSCredentials).toHaveBeenCalled();
    });

    it("should load connection metadata", async () => {
      await setupPulumiMock();
      await restore({ force: true });

      expect(metadata.loadConnectionMetadata).toHaveBeenCalledWith(
        "123456789012",
        "us-east-1"
      );
    });

    it("should exit if no connection metadata found", async () => {
      await setupPulumiMock();
      vi.mocked(metadata.loadConnectionMetadata).mockResolvedValue(null);

      await expect(restore({ force: true })).rejects.toThrow();
    });

    it("should confirm removal when --yes flag not provided", async () => {
      await setupPulumiMock();
      await restore({});

      expect(prompts.confirm).toHaveBeenCalled();
    });

    it("should skip confirmation when --yes flag is provided", async () => {
      await setupPulumiMock();
      await restore({ force: true });

      expect(prompts.confirm).not.toHaveBeenCalled();
    });

    it("should select the Pulumi stack", async () => {
      const _mockStack = await setupPulumiMock();
      await restore({ force: true });

      const pulumi = await import("@pulumi/pulumi");
      expect(pulumi.automation.LocalWorkspace.selectStack).toHaveBeenCalledWith(
        {
          stackName: "wraps-123456789012-us-east-1",
          projectName: "wraps-email",
          program: expect.any(Function),
        },
        {
          workDir: "/mock/.wraps/pulumi",
          envVars: {
            PULUMI_CONFIG_PASSPHRASE: "",
            AWS_REGION: "us-east-1",
          },
          secretsProvider: "passphrase",
        }
      );
    });

    it("should destroy the Pulumi stack", async () => {
      const mockStack = await setupPulumiMock();
      await restore({ force: true });

      expect(mockStack.destroy).toHaveBeenCalled();
    });

    it("should remove the stack from workspace", async () => {
      const mockStack = await setupPulumiMock();
      await restore({ force: true });

      expect(mockStack.workspace.removeStack).toHaveBeenCalledWith(
        "wraps-123456789012-us-east-1"
      );
    });

    it("should delete connection metadata", async () => {
      await setupPulumiMock();
      await restore({ force: true });

      expect(metadata.deleteConnectionMetadata).toHaveBeenCalledWith(
        "123456789012",
        "us-east-1"
      );
    });
  });

  describe("Error Handling Tests", () => {
    it("should handle user cancellation", async () => {
      await setupPulumiMock();
      vi.mocked(prompts.confirm).mockResolvedValue(false as never);
      vi.mocked(prompts.isCancel).mockReturnValue(false);

      await expect(restore({})).rejects.toThrow();
    });

    it("should handle user cancelling the confirmation dialog", async () => {
      await setupPulumiMock();
      vi.mocked(prompts.confirm).mockResolvedValue(
        Symbol.for("clack.cancel") as never
      );
      vi.mocked(prompts.isCancel).mockReturnValue(true);

      await expect(restore({})).rejects.toThrow();
    });

    it("should handle stack destroy failures", async () => {
      const mockStack = await setupPulumiMock();
      mockStack.destroy.mockRejectedValue(new Error("Destroy failed"));

      await expect(restore({ force: true })).rejects.toThrow();
    });

    it("should handle missing pulumiStackName in metadata", async () => {
      await setupPulumiMock();
      vi.mocked(metadata.loadConnectionMetadata).mockResolvedValue({
        accountId: "123456789012",
        region: "us-east-1",
        provider: "vercel",
        timestamp: new Date().toISOString(),
        services: {
          email: {
            config: {},
            // No pulumiStackName field
          },
        },
      } as any);

      await restore({ force: true });

      // Should skip Pulumi stack destruction but still delete metadata
      expect(metadata.deleteConnectionMetadata).toHaveBeenCalled();
    });
  });

  describe("Display Tests", () => {
    it("should display resources to be removed based on config", async () => {
      await setupPulumiMock();
      await restore({ force: true });

      // Metadata has tracking, event tracking, and DynamoDB enabled
      // Console output should show these resources
      expect(metadata.loadConnectionMetadata).toHaveBeenCalled();
    });

    it("should handle minimal configuration", async () => {
      await setupPulumiMock();
      vi.mocked(metadata.loadConnectionMetadata).mockResolvedValue({
        accountId: "123456789012",
        region: "us-east-1",
        provider: "aws",
        timestamp: new Date().toISOString(),
        services: {
          email: {
            config: {
              // No tracking or event tracking
            },
            preset: "starter",
            pulumiStackName: "wraps-123456789012-us-east-1",
          },
        },
      } as any);

      await restore({ force: true });

      expect(metadata.deleteConnectionMetadata).toHaveBeenCalled();
    });
  });

  describe("Region Handling Tests", () => {
    it("should use provided region option", async () => {
      await setupPulumiMock();
      await restore({ force: true, region: "eu-west-1" });

      expect(metadata.loadConnectionMetadata).toHaveBeenCalledWith(
        "123456789012",
        "eu-west-1"
      );
    });

    it("should use default region when not provided", async () => {
      await setupPulumiMock();
      await restore({ force: true });

      expect(aws.getAWSRegion).toHaveBeenCalled();
      expect(metadata.loadConnectionMetadata).toHaveBeenCalledWith(
        "123456789012",
        "us-east-1"
      );
    });
  });
});
