import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock node:fs modules
vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn(),
}));

vi.mock("node:os", () => ({
  homedir: vi.fn(),
}));

// Import after mocks
import {
  ensurePulumiWorkDir,
  ensureWrapsDir,
  getPulumiWorkDir,
  getWrapsDir,
} from "../shared/fs.js";

describe("fs utilities", () => {
  const mockHomeDir = "/home/testuser";
  const expectedWrapsDir = "/home/testuser/.wraps";
  const expectedPulumiDir = "/home/testuser/.wraps/pulumi";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(homedir).mockReturnValue(mockHomeDir);
    process.env.PULUMI_BACKEND_URL = undefined;
    process.env.PULUMI_CONFIG_PASSPHRASE = undefined;
  });

  describe("getWrapsDir", () => {
    it("should return .wraps directory in home directory", () => {
      const result = getWrapsDir();

      expect(homedir).toHaveBeenCalled();
      expect(result).toBe(expectedWrapsDir);
    });

    it("should use path.join for cross-platform compatibility", () => {
      const result = getWrapsDir();

      expect(result).toBe(join(mockHomeDir, ".wraps"));
    });

    it("should work with different home directories", () => {
      vi.mocked(homedir).mockReturnValue("/Users/different");

      const result = getWrapsDir();

      expect(result).toBe("/Users/different/.wraps");
    });
  });

  describe("getPulumiWorkDir", () => {
    it("should return pulumi directory inside .wraps", () => {
      const result = getPulumiWorkDir();

      expect(result).toBe(expectedPulumiDir);
    });

    it("should use getWrapsDir as base", () => {
      const result = getPulumiWorkDir();

      expect(result).toBe(join(getWrapsDir(), "pulumi"));
    });

    it("should work with different home directories", () => {
      vi.mocked(homedir).mockReturnValue("/Users/different");

      const result = getPulumiWorkDir();

      expect(result).toBe("/Users/different/.wraps/pulumi");
    });
  });

  describe("ensureWrapsDir", () => {
    it("should create directory if it does not exist", async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(mkdir).mockResolvedValue(undefined);

      await ensureWrapsDir();

      expect(existsSync).toHaveBeenCalledWith(expectedWrapsDir);
      expect(mkdir).toHaveBeenCalledWith(expectedWrapsDir, { recursive: true });
    });

    it("should not create directory if it already exists", async () => {
      vi.mocked(existsSync).mockReturnValue(true);

      await ensureWrapsDir();

      expect(existsSync).toHaveBeenCalledWith(expectedWrapsDir);
      expect(mkdir).not.toHaveBeenCalled();
    });

    it("should use recursive option when creating directory", async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(mkdir).mockResolvedValue(undefined);

      await ensureWrapsDir();

      expect(mkdir).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ recursive: true })
      );
    });

    it("should propagate mkdir errors", async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(mkdir).mockRejectedValue(new Error("Permission denied"));

      await expect(ensureWrapsDir()).rejects.toThrow("Permission denied");
    });
  });

  describe("ensurePulumiWorkDir", () => {
    it("should create both .wraps and pulumi directories", async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(mkdir).mockResolvedValue(undefined);

      await ensurePulumiWorkDir();

      expect(mkdir).toHaveBeenCalledWith(expectedWrapsDir, { recursive: true });
      expect(mkdir).toHaveBeenCalledWith(expectedPulumiDir, {
        recursive: true,
      });
    });

    it("should set PULUMI_BACKEND_URL environment variable", async () => {
      vi.mocked(existsSync).mockReturnValue(true);

      await ensurePulumiWorkDir();

      expect(process.env.PULUMI_BACKEND_URL).toBe(
        `file://${expectedPulumiDir}`
      );
    });

    it("should set PULUMI_CONFIG_PASSPHRASE to empty string", async () => {
      vi.mocked(existsSync).mockReturnValue(true);

      await ensurePulumiWorkDir();

      expect(process.env.PULUMI_CONFIG_PASSPHRASE).toBe("");
    });

    it("should not create pulumi directory if it already exists", async () => {
      vi.mocked(existsSync).mockImplementation((_path) => {
        // .wraps exists, pulumi exists
        return true;
      });

      await ensurePulumiWorkDir();

      expect(mkdir).not.toHaveBeenCalled();
    });

    it("should create only pulumi directory if .wraps exists", async () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        // .wraps exists, pulumi doesn't
        return path === expectedWrapsDir;
      });
      vi.mocked(mkdir).mockResolvedValue(undefined);

      await ensurePulumiWorkDir();

      expect(mkdir).toHaveBeenCalledTimes(1);
      expect(mkdir).toHaveBeenCalledWith(expectedPulumiDir, {
        recursive: true,
      });
    });

    it("should call ensureWrapsDir first", async () => {
      const calls: string[] = [];

      vi.mocked(existsSync).mockImplementation((path) => {
        calls.push(`existsSync:${path}`);
        return false;
      });

      vi.mocked(mkdir).mockImplementation(async (path) => {
        calls.push(`mkdir:${path}`);
      });

      await ensurePulumiWorkDir();

      // Should check/create .wraps before pulumi
      expect(calls[0]).toContain(expectedWrapsDir);
      expect(calls.at(-1)).toContain(expectedPulumiDir);
    });

    it("should set environment variables even if directories exist", async () => {
      vi.mocked(existsSync).mockReturnValue(true);

      process.env.PULUMI_BACKEND_URL = "some-other-value";
      process.env.PULUMI_CONFIG_PASSPHRASE = "some-other-value";

      await ensurePulumiWorkDir();

      expect(process.env.PULUMI_BACKEND_URL).toBe(
        `file://${expectedPulumiDir}`
      );
      expect(process.env.PULUMI_CONFIG_PASSPHRASE).toBe("");
    });

    it("should propagate errors from ensureWrapsDir", async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(mkdir).mockRejectedValue(new Error("Disk full"));

      await expect(ensurePulumiWorkDir()).rejects.toThrow("Disk full");
    });
  });
});
