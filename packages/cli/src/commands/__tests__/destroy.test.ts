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
vi.mock("node:fs");
vi.mock("../../utils/shared/aws.js");
vi.mock("../../utils/shared/fs.js");
vi.mock("../../utils/shared/metadata.js");

import * as prompts from "@clack/prompts";
import * as aws from "../../utils/shared/aws.js";
import * as fsUtils from "../../utils/shared/fs.js";
import * as metadata from "../../utils/shared/metadata.js";
// Import after mocks
import { destroy } from "../shared/destroy.js";

describe("destroy command", () => {
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
    vi.mocked(fsUtils.ensurePulumiWorkDir).mockResolvedValue(undefined);
    vi.mocked(fsUtils.getPulumiWorkDir).mockReturnValue("/mock/.wraps/pulumi");

    // Mock metadata utilities
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
      await destroy({ yes: true });

      expect(aws.validateAWSCredentials).toHaveBeenCalled();
    });

    it("should confirm destruction when --yes flag not provided", async () => {
      await setupPulumiMock();
      await destroy({});

      expect(prompts.confirm).toHaveBeenCalled();
    });

    it("should skip confirmation when --yes flag is provided", async () => {
      await setupPulumiMock();
      await destroy({ yes: true });

      expect(prompts.confirm).not.toHaveBeenCalled();
    });

    it("should select the correct Pulumi stack", async () => {
      const _mockStack = await setupPulumiMock();
      await destroy({ yes: true });

      const pulumi = await import("@pulumi/pulumi");
      expect(pulumi.automation.LocalWorkspace.selectStack).toHaveBeenCalledWith(
        {
          stackName: "wraps-123456789012-us-east-1",
          workDir: "/mock/.wraps/pulumi",
        }
      );
    });

    it("should destroy the Pulumi stack", async () => {
      const mockStack = await setupPulumiMock();
      await destroy({ yes: true });

      expect(mockStack.destroy).toHaveBeenCalled();
    });

    it("should remove the stack from workspace", async () => {
      const mockStack = await setupPulumiMock();
      await destroy({ yes: true });

      expect(mockStack.workspace.removeStack).toHaveBeenCalledWith(
        "wraps-123456789012-us-east-1"
      );
    });

    it("should delete connection metadata", async () => {
      await setupPulumiMock();
      await destroy({ yes: true });

      expect(metadata.deleteConnectionMetadata).toHaveBeenCalledWith(
        "123456789012",
        "us-east-1"
      );
    });
  });

  describe("Error Handling Tests", () => {
    it("should handle no Pulumi stack found gracefully", async () => {
      await setupPulumiMock(true);

      await expect(destroy({ yes: true })).rejects.toThrow();

      // Should still try to delete metadata
      expect(metadata.deleteConnectionMetadata).toHaveBeenCalledWith(
        "123456789012",
        "us-east-1"
      );
    });

    it("should handle user cancellation", async () => {
      await setupPulumiMock();
      vi.mocked(prompts.confirm).mockResolvedValue(false as never);
      vi.mocked(prompts.isCancel).mockReturnValue(false);

      await expect(destroy({})).rejects.toThrow();

      // Should not destroy stack
      const pulumi = await import("@pulumi/pulumi");
      expect(
        pulumi.automation.LocalWorkspace.selectStack
      ).not.toHaveBeenCalled();
    });

    it("should handle user cancelling the confirmation dialog", async () => {
      await setupPulumiMock();
      vi.mocked(prompts.confirm).mockResolvedValue(
        Symbol.for("clack.cancel") as never
      );
      vi.mocked(prompts.isCancel).mockReturnValue(true);

      await expect(destroy({})).rejects.toThrow();
    });

    it("should handle stack destroy failures", async () => {
      const mockStack = await setupPulumiMock();
      mockStack.destroy.mockRejectedValue(new Error("Destroy failed"));

      await expect(destroy({ yes: true })).rejects.toThrow("Destroy failed");
    });
  });

  describe("State Verification Tests", () => {
    it("should call destroy operations in correct order", async () => {
      const mockStack = await setupPulumiMock();
      const callOrder: string[] = [];

      vi.mocked(aws.validateAWSCredentials).mockImplementation(async () => {
        callOrder.push("validateCredentials");
        return {
          accountId: "123456789012",
          userId: "test",
          arn: "test",
        };
      });

      const pulumi = await import("@pulumi/pulumi");
      vi.mocked(
        pulumi.automation.LocalWorkspace.selectStack
      ).mockImplementation(async () => {
        callOrder.push("selectStack");
        return mockStack;
      });

      mockStack.destroy.mockImplementation(async () => {
        callOrder.push("destroy");
      });

      mockStack.workspace.removeStack.mockImplementation(async () => {
        callOrder.push("removeStack");
      });

      vi.mocked(metadata.deleteConnectionMetadata).mockImplementation(
        async () => {
          callOrder.push("deleteMetadata");
        }
      );

      await destroy({ yes: true });

      expect(callOrder).toEqual([
        "validateCredentials",
        "selectStack",
        "destroy",
        "removeStack",
        "deleteMetadata",
      ]);
    });

    it("should work with different regions", async () => {
      await setupPulumiMock();
      vi.mocked(aws.getAWSRegion).mockResolvedValue("eu-west-1");

      await destroy({ yes: true });

      const pulumi = await import("@pulumi/pulumi");
      expect(pulumi.automation.LocalWorkspace.selectStack).toHaveBeenCalledWith(
        {
          stackName: "wraps-123456789012-eu-west-1",
          workDir: "/mock/.wraps/pulumi",
        }
      );

      expect(metadata.deleteConnectionMetadata).toHaveBeenCalledWith(
        "123456789012",
        "eu-west-1"
      );
    });

    it("should work with different account IDs", async () => {
      await setupPulumiMock();
      vi.mocked(aws.validateAWSCredentials).mockResolvedValue({
        accountId: "999888777666",
        userId: "test",
        arn: "test",
      });

      await destroy({ yes: true });

      const pulumi = await import("@pulumi/pulumi");
      expect(pulumi.automation.LocalWorkspace.selectStack).toHaveBeenCalledWith(
        {
          stackName: "wraps-999888777666-us-east-1",
          workDir: "/mock/.wraps/pulumi",
        }
      );
    });
  });
});
