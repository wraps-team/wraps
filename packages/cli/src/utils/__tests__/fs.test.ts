import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock node:fs modules
vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  rename: vi.fn(),
  rm: vi.fn(),
  readdir: vi.fn(),
}));

vi.mock("node:os", () => ({
  homedir: vi.fn(),
}));

// Mock s3-state module
const mockEnsureStateBucket = vi.fn();
const mockGetS3BackendUrl = vi.fn();
const mockNeedsMigration = vi.fn();
const mockMigrateLocalPulumiState = vi.fn();

vi.mock("../shared/s3-state.js", () => ({
  ensureStateBucket: (...args: any[]) => mockEnsureStateBucket(...args),
  getS3BackendUrl: (...args: any[]) => mockGetS3BackendUrl(...args),
  needsMigration: (...args: any[]) => mockNeedsMigration(...args),
  migrateLocalPulumiState: (...args: any[]) =>
    mockMigrateLocalPulumiState(...args),
}));

// The project check lists the (empty) state bucket after backend setup.
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    send = vi.fn().mockResolvedValue({});
  },
  ListObjectsV2Command: class {},
  GetObjectCommand: class {},
}));

// Mock @clack/prompts
vi.mock("@clack/prompts", () => ({
  log: {
    warn: vi.fn(),
  },
}));

// Mock aws module so credential resolution doesn't try to hit STS in tests
const mockResolveAWSCredentialsToEnv = vi.fn().mockResolvedValue(undefined);
vi.mock("../shared/aws.js", () => ({
  resolveAWSCredentialsToEnv: (...args: any[]) =>
    mockResolveAWSCredentialsToEnv(...args),
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
    // Pulumi.yaml already points at the work dir, so the repair is a no-op
    // and never reaches its warn path (covered in pulumi-project-main.test.ts).
    vi.mocked(readFile).mockResolvedValue(
      `name: wraps-email\nruntime: nodejs\nmain: ${expectedPulumiDir}\n` as never
    );
    process.env.PULUMI_BACKEND_URL = undefined;
    process.env.PULUMI_CONFIG_PASSPHRASE = undefined;
    process.env.WRAPS_LOCAL_ONLY = undefined;
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

    it("should use S3 backend when accountId and region are provided", async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      mockEnsureStateBucket.mockResolvedValue(
        "wraps-state-123456789012-us-east-1"
      );
      mockGetS3BackendUrl.mockReturnValue(
        "s3://wraps-state-123456789012-us-east-1"
      );
      mockNeedsMigration.mockResolvedValue(false);

      await ensurePulumiWorkDir({
        accountId: "123456789012",
        region: "us-east-1",
      });

      expect(process.env.PULUMI_BACKEND_URL).toBe(
        "s3://wraps-state-123456789012-us-east-1"
      );
      expect(process.env.PULUMI_CONFIG_PASSPHRASE).toBe("");
    });

    it("should stay local when WRAPS_LOCAL_ONLY=1 even with params", async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      process.env.WRAPS_LOCAL_ONLY = "1";

      await ensurePulumiWorkDir({
        accountId: "123456789012",
        region: "us-east-1",
      });

      expect(process.env.PULUMI_BACKEND_URL).toBe(
        `file://${expectedPulumiDir}`
      );
      expect(mockEnsureStateBucket).not.toHaveBeenCalled();
    });

    it("should fall back to local on S3 error with warning", async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      mockEnsureStateBucket.mockRejectedValue(new Error("Access Denied"));

      await ensurePulumiWorkDir({
        accountId: "123456789012",
        region: "us-east-1",
      });

      expect(process.env.PULUMI_BACKEND_URL).toBe(
        `file://${expectedPulumiDir}`
      );

      const clack = await import("@clack/prompts");
      expect(clack.log.warn).toHaveBeenCalledWith(
        expect.stringContaining("S3 state backend unavailable")
      );
    });

    it("should pre-resolve AWS credentials when accountId/region provided", async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      mockEnsureStateBucket.mockResolvedValue(
        "wraps-state-123456789012-us-east-1"
      );
      mockGetS3BackendUrl.mockReturnValue(
        "s3://wraps-state-123456789012-us-east-1"
      );
      mockNeedsMigration.mockResolvedValue(false);

      await ensurePulumiWorkDir({
        accountId: "123456789012",
        region: "us-east-1",
      });

      expect(mockResolveAWSCredentialsToEnv).toHaveBeenCalledTimes(1);
    });

    it("should NOT pre-resolve AWS credentials when accountId/region missing", async () => {
      vi.mocked(existsSync).mockReturnValue(true);

      await ensurePulumiWorkDir();

      expect(mockResolveAWSCredentialsToEnv).not.toHaveBeenCalled();
    });

    it("should pre-resolve credentials even with WRAPS_LOCAL_ONLY=1", async () => {
      // The pulumi-aws provider still needs to authenticate to AWS even when
      // state is local, so credential pre-resolution should happen regardless.
      vi.mocked(existsSync).mockReturnValue(true);
      process.env.WRAPS_LOCAL_ONLY = "1";

      await ensurePulumiWorkDir({
        accountId: "123456789012",
        region: "us-east-1",
      });

      expect(mockResolveAWSCredentialsToEnv).toHaveBeenCalledTimes(1);
    });

    it("should trigger migration when local state exists", async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      mockEnsureStateBucket.mockResolvedValue(
        "wraps-state-123456789012-us-east-1"
      );
      mockGetS3BackendUrl.mockReturnValue(
        "s3://wraps-state-123456789012-us-east-1"
      );
      mockNeedsMigration.mockResolvedValue(true);
      mockMigrateLocalPulumiState.mockResolvedValue(undefined);

      await ensurePulumiWorkDir({
        accountId: "123456789012",
        region: "us-east-1",
      });

      expect(mockMigrateLocalPulumiState).toHaveBeenCalledWith(
        expectedPulumiDir,
        "wraps-state-123456789012-us-east-1",
        "123456789012",
        "us-east-1"
      );
      expect(process.env.PULUMI_BACKEND_URL).toBe(
        "s3://wraps-state-123456789012-us-east-1"
      );
    });
  });
});
