import { exec } from "node:child_process";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock node:child_process
vi.mock("node:child_process", () => ({
  exec: vi.fn(),
}));

// Mock @pulumi/pulumi/automation
vi.mock("@pulumi/pulumi/automation/index.js", () => ({
  installPulumiCli: vi.fn(),
}));

// Mock errors
vi.mock("../shared/errors.js", () => ({
  errors: {
    pulumiNotInstalled: vi.fn(() => new Error("Pulumi CLI not installed")),
  },
}));

// Import after mocks
import * as automation from "@pulumi/pulumi/automation/index.js";
import { errors } from "../shared/errors.js";
import {
  checkPulumiInstalled,
  ensurePulumiInstalled,
} from "../shared/pulumi.js";

describe("pulumi utilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("checkPulumiInstalled", () => {
    it("should return true if pulumi version command succeeds", async () => {
      vi.mocked(exec).mockImplementation((_cmd, callback: any) => {
        callback(null, { stdout: "v3.95.0", stderr: "" });
        return {} as any;
      });

      const result = await checkPulumiInstalled();

      expect(result).toBe(true);
      expect(exec).toHaveBeenCalledWith("pulumi version", expect.any(Function));
    });

    it("should return false if pulumi version command fails", async () => {
      vi.mocked(exec).mockImplementation((_cmd, callback: any) => {
        callback(new Error("Command not found"), { stdout: "", stderr: "" });
        return {} as any;
      });

      const result = await checkPulumiInstalled();

      expect(result).toBe(false);
    });

    it("should return false if pulumi is not in PATH", async () => {
      vi.mocked(exec).mockImplementation((_cmd, callback: any) => {
        callback(new Error("pulumi: command not found"), {
          stdout: "",
          stderr: "",
        });
        return {} as any;
      });

      const result = await checkPulumiInstalled();

      expect(result).toBe(false);
    });

    it("should catch and return false for any error", async () => {
      vi.mocked(exec).mockImplementation((_cmd, callback: any) => {
        callback(new Error("Network error"), { stdout: "", stderr: "" });
        return {} as any;
      });

      const result = await checkPulumiInstalled();

      expect(result).toBe(false);
    });
  });

  describe("ensurePulumiInstalled", () => {
    it("should return false if pulumi is already installed", async () => {
      vi.mocked(exec).mockImplementation((_cmd, callback: any) => {
        callback(null, { stdout: "v3.95.0", stderr: "" });
        return {} as any;
      });

      const result = await ensurePulumiInstalled();

      expect(result).toBe(false);
      expect((automation as any).installPulumiCli).not.toHaveBeenCalled();
    });

    it("should auto-install pulumi if not installed", async () => {
      vi.mocked(exec).mockImplementation((_cmd, callback: any) => {
        callback(new Error("Command not found"), { stdout: "", stderr: "" });
        return {} as any;
      });

      vi.mocked((automation as any).installPulumiCli).mockResolvedValue(
        undefined
      );

      const result = await ensurePulumiInstalled();

      expect(result).toBe(true);
      expect((automation as any).installPulumiCli).toHaveBeenCalled();
    });

    it("should return true when auto-install succeeds", async () => {
      vi.mocked(exec).mockImplementation((_cmd, callback: any) => {
        callback(new Error("Command not found"), { stdout: "", stderr: "" });
        return {} as any;
      });

      vi.mocked((automation as any).installPulumiCli).mockResolvedValue(
        undefined
      );

      const result = await ensurePulumiInstalled();

      expect(result).toBe(true);
    });

    it("should throw helpful error if auto-install fails", async () => {
      vi.mocked(exec).mockImplementation((_cmd, callback: any) => {
        callback(new Error("Command not found"), { stdout: "", stderr: "" });
        return {} as any;
      });

      vi.mocked((automation as any).installPulumiCli).mockRejectedValue(
        new Error("Installation failed")
      );

      await expect(ensurePulumiInstalled()).rejects.toThrow(
        "Pulumi CLI not installed"
      );

      expect(errors.pulumiNotInstalled).toHaveBeenCalled();
    });

    it("should check installation before attempting auto-install", async () => {
      const calls: string[] = [];

      vi.mocked(exec).mockImplementation((_cmd, callback: any) => {
        calls.push("check");
        callback(new Error("Command not found"), { stdout: "", stderr: "" });
        return {} as any;
      });

      vi.mocked((automation as any).installPulumiCli).mockImplementation(
        async () => {
          calls.push("install");
        }
      );

      await ensurePulumiInstalled();

      expect(calls).toEqual(["check", "install"]);
    });

    it("should not throw if check fails but install succeeds", async () => {
      vi.mocked(exec).mockImplementation((_cmd, callback: any) => {
        callback(new Error("Command not found"), { stdout: "", stderr: "" });
        return {} as any;
      });

      vi.mocked((automation as any).installPulumiCli).mockResolvedValue(
        undefined
      );

      await expect(ensurePulumiInstalled()).resolves.toBe(true);
    });

    it("should handle network errors during check gracefully", async () => {
      vi.mocked(exec).mockImplementation((_cmd, callback: any) => {
        callback(new Error("ETIMEDOUT"), { stdout: "", stderr: "" });
        return {} as any;
      });

      vi.mocked((automation as any).installPulumiCli).mockResolvedValue(
        undefined
      );

      const result = await ensurePulumiInstalled();

      expect(result).toBe(true);
      expect((automation as any).installPulumiCli).toHaveBeenCalled();
    });
  });
});
