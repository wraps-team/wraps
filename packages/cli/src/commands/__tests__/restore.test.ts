import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  installPulumiCli: vi.fn(),
}));
vi.mock("@clack/prompts");
vi.mock("../../utils/shared/aws.js");
vi.mock("../../utils/shared/fs.js");
vi.mock("../../utils/shared/metadata.js");
vi.mock("../../utils/shared/pulumi.js", () => ({
  ensurePulumiInstalled: vi.fn().mockResolvedValue(false),
  previewWithResourceChanges: vi
    .fn()
    .mockResolvedValue({ changeSummary: {}, resourceChanges: [] }),
}));

import * as prompts from "@clack/prompts";
import * as aws from "../../utils/shared/aws.js";
import * as fsUtils from "../../utils/shared/fs.js";
import * as metadata from "../../utils/shared/metadata.js";
// Import after mocks
import { WrapsError } from "../../utils/shared/errors.js";
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
    // Like the real function on the happy path: point Pulumi at the S3 backend.
    vi.mocked(fsUtils.ensurePulumiWorkDir).mockImplementation(async () => {
      vi.stubEnv(
        "PULUMI_BACKEND_URL",
        "s3://wraps-state-123456789012-us-east-1?region=us-east-1"
      );
    });

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

  afterEach(() => {
    vi.unstubAllEnvs();
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

  describe("State backend", () => {
    const otherAccount = {
      accountId: "210987654321",
      userId: "AIDACKCEVSQ6C2EXAMPLE",
      arn: "arn:aws:iam::210987654321:user/test",
    };

    async function selectMock() {
      const pulumi = await import("@pulumi/pulumi");
      return vi.mocked(pulumi.automation.LocalWorkspace.selectStack);
    }

    function useLocalBackend() {
      vi.mocked(fsUtils.ensurePulumiWorkDir).mockImplementation(async () => {
        vi.stubEnv("PULUMI_BACKEND_URL", "file:///mock/.wraps/pulumi");
      });
    }

    it("sets up the backend for the resolved account and region before selecting the stack when destroying", async () => {
      await setupPulumiMock();
      vi.mocked(aws.validateAWSCredentials).mockResolvedValue(otherAccount);
      await restore({ force: true, region: "eu-west-1" });

      const ensure = vi.mocked(fsUtils.ensurePulumiWorkDir);
      const select = await selectMock();
      expect(ensure).toHaveBeenCalledTimes(1);
      expect(ensure).toHaveBeenCalledWith({
        accountId: "210987654321",
        region: "eu-west-1",
      });
      expect(select).toHaveBeenCalledTimes(1);
      expect(ensure.mock.invocationCallOrder[0]).toBeLessThan(
        select.mock.invocationCallOrder[0]
      );
    });

    it("sets up the backend for the resolved account and region before selecting the stack when previewing", async () => {
      await setupPulumiMock();
      vi.mocked(aws.validateAWSCredentials).mockResolvedValue(otherAccount);
      await restore({ force: true, preview: true, region: "eu-west-1" });

      const ensure = vi.mocked(fsUtils.ensurePulumiWorkDir);
      const select = await selectMock();
      expect(ensure).toHaveBeenCalledTimes(1);
      expect(ensure).toHaveBeenCalledWith({
        accountId: "210987654321",
        region: "eu-west-1",
      });
      expect(select).toHaveBeenCalledTimes(1);
      expect(ensure.mock.invocationCallOrder[0]).toBeLessThan(
        select.mock.invocationCallOrder[0]
      );
    });

    it("asks for confirmation before touching the state backend", async () => {
      await setupPulumiMock();
      await restore({});

      const select = await selectMock();
      const confirmOrder = vi.mocked(prompts.confirm).mock
        .invocationCallOrder[0];
      const ensureOrder = vi.mocked(fsUtils.ensurePulumiWorkDir).mock
        .invocationCallOrder[0];
      expect(confirmOrder).toBeLessThan(ensureOrder);
      expect(ensureOrder).toBeLessThan(select.mock.invocationCallOrder[0]);
    });

    it("removes nothing when backend setup fails while destroying", async () => {
      const mockStack = await setupPulumiMock();
      vi.mocked(fsUtils.ensurePulumiWorkDir).mockRejectedValue(
        new WrapsError("AWS SSO session expired", "SSO_EXPIRED")
      );

      await expect(restore({ force: true })).rejects.toThrow(
        "Failed to destroy Pulumi stack: AWS SSO session expired"
      );

      expect(await selectMock()).not.toHaveBeenCalled();
      expect(mockStack.destroy).not.toHaveBeenCalled();
      expect(metadata.deleteConnectionMetadata).not.toHaveBeenCalled();
    });

    it("selects nothing when backend setup fails while previewing", async () => {
      const mockStack = await setupPulumiMock();
      vi.mocked(fsUtils.ensurePulumiWorkDir).mockRejectedValue(
        new WrapsError("AWS SSO session expired", "SSO_EXPIRED")
      );

      await expect(restore({ preview: true })).rejects.toThrow(
        "Preview failed: AWS SSO session expired"
      );

      expect(await selectMock()).not.toHaveBeenCalled();
      expect(mockStack.destroy).not.toHaveBeenCalled();
      expect(metadata.deleteConnectionMetadata).not.toHaveBeenCalled();
    });

    it("fails closed when the S3 backend is unreachable while destroying", async () => {
      const mockStack = await setupPulumiMock();
      useLocalBackend();

      const error = await restore({ force: true }).catch((e) => e);

      expect(error).toBeInstanceOf(WrapsError);
      expect(error.code).toBe("STATE_BACKEND_UNREACHABLE");
      expect(error.suggestion).toContain("wraps-state-123456789012-us-east-1");
      expect(error.suggestion).toContain("WRAPS_LOCAL_ONLY=1");
      expect(await selectMock()).not.toHaveBeenCalled();
      expect(mockStack.destroy).not.toHaveBeenCalled();
      expect(metadata.deleteConnectionMetadata).not.toHaveBeenCalled();
    });

    it("fails closed when the S3 backend is unreachable while previewing", async () => {
      const mockStack = await setupPulumiMock();
      useLocalBackend();

      const error = await restore({ preview: true }).catch((e) => e);

      expect(error).toBeInstanceOf(WrapsError);
      expect(error.code).toBe("STATE_BACKEND_UNREACHABLE");
      expect(await selectMock()).not.toHaveBeenCalled();
      expect(mockStack.destroy).not.toHaveBeenCalled();
      expect(metadata.deleteConnectionMetadata).not.toHaveBeenCalled();
    });

    it("uses local state when WRAPS_LOCAL_ONLY=1 while destroying", async () => {
      const mockStack = await setupPulumiMock();
      useLocalBackend();
      vi.stubEnv("WRAPS_LOCAL_ONLY", "1");

      await restore({ force: true });

      expect(await selectMock()).toHaveBeenCalledTimes(1);
      expect(mockStack.destroy).toHaveBeenCalled();
      expect(metadata.deleteConnectionMetadata).toHaveBeenCalled();
    });

    it("uses local state when WRAPS_LOCAL_ONLY=1 while previewing", async () => {
      await setupPulumiMock();
      useLocalBackend();
      vi.stubEnv("WRAPS_LOCAL_ONLY", "1");

      await restore({ preview: true });

      expect(await selectMock()).toHaveBeenCalledTimes(1);
    });

    it("never sets up the backend when the user cancels", async () => {
      await setupPulumiMock();
      vi.mocked(prompts.confirm).mockResolvedValue(false as never);

      await expect(restore({})).rejects.toThrow();

      expect(fsUtils.ensurePulumiWorkDir).not.toHaveBeenCalled();
    });

    it("never sets up the backend when metadata has no pulumiStackName", async () => {
      await setupPulumiMock();
      vi.mocked(metadata.loadConnectionMetadata).mockResolvedValue({
        accountId: "123456789012",
        region: "us-east-1",
        provider: "vercel",
        timestamp: new Date().toISOString(),
        services: { email: { config: {} } },
      } as any);

      await restore({ force: true });
      await restore({ force: true, preview: true });

      expect(fsUtils.ensurePulumiWorkDir).not.toHaveBeenCalled();
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
