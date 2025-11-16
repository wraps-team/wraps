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
vi.mock("get-port");
vi.mock("open");
vi.mock("../../console/server.js");
vi.mock("../../utils/aws.js");
vi.mock("../../utils/fs.js");

import * as prompts from "@clack/prompts";
import getPort from "get-port";
import open from "open";
import { startConsoleServer } from "../../console/server.js";
import * as aws from "../../utils/aws.js";
import * as fsUtils from "../../utils/fs.js";
// Import after mocks
import { runConsole } from "../console.js";

describe("console command", () => {
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
    vi.mocked(prompts.log).info = vi.fn();
    vi.mocked(prompts.log).success = vi.fn();
    vi.mocked(prompts.log).error = vi.fn();

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

    // Mock get-port
    vi.mocked(getPort).mockResolvedValue(5555);

    // Mock open
    vi.mocked(open).mockResolvedValue(undefined as never);

    // Mock startConsoleServer
    vi.mocked(startConsoleServer).mockResolvedValue({
      url: "http://localhost:5555",
      server: {} as any,
    });
  });

  // Helper function to setup Pulumi mocking
  async function setupPulumiMock(
    shouldThrowOnSelect = false,
    outputs: any = {}
  ) {
    const pulumi = await import("@pulumi/pulumi");
    const pulumiAutomation = await import("@pulumi/pulumi/automation");

    const mockStack = {
      outputs: vi.fn().mockResolvedValue({
        tableName: { value: "wraps-email-history" },
        roleArn: { value: "arn:aws:iam::123456789012:role/wraps-email-role" },
        ...outputs,
      }),
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
      const _mockStack = await setupPulumiMock();

      // Start the console in the background and let it hang
      const _consolePromise = runConsole({});

      // Give it a moment to execute before assertions
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(aws.validateAWSCredentials).toHaveBeenCalled();

      // Don't await the console promise since it hangs indefinitely
    });

    it("should get AWS region", async () => {
      await setupPulumiMock();

      runConsole({});
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(aws.getAWSRegion).toHaveBeenCalled();
    });

    it("should select Pulumi stack", async () => {
      await setupPulumiMock();

      runConsole({});
      await new Promise((resolve) => setTimeout(resolve, 100));

      const pulumi = await import("@pulumi/pulumi");
      expect(pulumi.automation.LocalWorkspace.selectStack).toHaveBeenCalledWith(
        {
          stackName: "wraps-123456789012-us-east-1",
          workDir: "/mock/.wraps/pulumi",
        }
      );
    });

    it("should exit if no Wraps infrastructure found", async () => {
      await setupPulumiMock(true);

      await expect(runConsole({})).rejects.toThrow();
    });

    it("should use default port range if not specified", async () => {
      await setupPulumiMock();

      runConsole({});
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(getPort).toHaveBeenCalledWith({
        port: [5555, 5556, 5557, 5558, 5559],
      });
    });

    it("should use specified port if provided", async () => {
      await setupPulumiMock();

      runConsole({ port: 8080 });
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(getPort).not.toHaveBeenCalled();
      expect(startConsoleServer).toHaveBeenCalledWith(
        expect.objectContaining({ port: 8080 })
      );
    });

    it("should start console server with correct parameters", async () => {
      await setupPulumiMock();

      runConsole({});
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(startConsoleServer).toHaveBeenCalledWith({
        port: 5555,
        roleArn: undefined,
        region: "us-east-1",
        tableName: "wraps-email-history",
        accountId: "123456789012",
        noOpen: false,
        archiveArn: undefined,
        archivingEnabled: false,
      });
    });

    it("should open browser by default", async () => {
      await setupPulumiMock();

      runConsole({});
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(open).toHaveBeenCalledWith("http://localhost:5555");
    });

    it("should not open browser when --no-open flag is provided", async () => {
      await setupPulumiMock();

      runConsole({ noOpen: true });
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(open).not.toHaveBeenCalled();
    });

    it("should extract tableName from stack outputs", async () => {
      await setupPulumiMock(false, {
        tableName: { value: "custom-table-name" },
      });

      runConsole({});
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(startConsoleServer).toHaveBeenCalledWith(
        expect.objectContaining({
          tableName: "custom-table-name",
        })
      );
    });

    it("should handle missing tableName in outputs", async () => {
      const pulumi = await import("@pulumi/pulumi");
      const pulumiAutomation = await import("@pulumi/pulumi/automation");

      const mockStack = {
        outputs: vi.fn().mockResolvedValue({
          roleArn: { value: "arn:aws:iam::123456789012:role/wraps-email-role" },
          // No tableName in outputs
        }),
      } as any;

      vi.mocked(pulumi.automation.LocalWorkspace.selectStack).mockResolvedValue(
        mockStack
      );
      vi.mocked(pulumiAutomation.LocalWorkspace.selectStack).mockResolvedValue(
        mockStack
      );

      runConsole({});
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(startConsoleServer).toHaveBeenCalledWith(
        expect.objectContaining({
          tableName: undefined,
        })
      );
    });
  });

  describe("Error Handling Tests", () => {
    it("should handle AWS credential validation errors", async () => {
      vi.mocked(aws.validateAWSCredentials).mockRejectedValue(
        new Error("Invalid credentials")
      );

      await expect(runConsole({})).rejects.toThrow();
    });

    it("should handle server start failures", async () => {
      await setupPulumiMock();
      vi.mocked(startConsoleServer).mockRejectedValue(
        new Error("Port already in use")
      );

      await expect(runConsole({})).rejects.toThrow();
    });
  });

  describe("Configuration Tests", () => {
    it("should pass noOpen flag to server", async () => {
      await setupPulumiMock();

      runConsole({ noOpen: true });
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(startConsoleServer).toHaveBeenCalledWith(
        expect.objectContaining({
          noOpen: true,
        })
      );
    });

    it("should use current AWS credentials instead of assuming role", async () => {
      await setupPulumiMock();

      runConsole({});
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(startConsoleServer).toHaveBeenCalledWith(
        expect.objectContaining({
          roleArn: undefined,
        })
      );
    });
  });
});
