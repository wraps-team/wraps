import { existsSync } from "node:fs";
import { readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  connectionExists,
  createConnectionMetadata,
  deleteConnectionMetadata,
  listConnections,
  loadConnectionMetadata,
  saveConnectionMetadata,
  updateEmailConfig,
} from "../metadata.js";
import { getPreset } from "../presets.js";

// Mock fs module
vi.mock("fs", async () => {
  const actual = await vi.importActual("fs");
  return {
    ...actual,
    existsSync: vi.fn(),
  };
});

vi.mock("fs/promises", async () => {
  const actual = await vi.importActual("fs/promises");
  return {
    ...actual,
    readFile: vi.fn(),
    writeFile: vi.fn(),
    unlink: vi.fn(),
    mkdir: vi.fn(),
    readdir: vi.fn(),
  };
});

vi.mock("../fs.js", () => ({
  getWrapsDir: () => "/mock/wraps/dir",
  ensureWrapsDir: vi.fn().mockResolvedValue(undefined),
}));

describe("createConnectionMetadata", () => {
  it("should create metadata with required fields", () => {
    const emailConfig = getPreset("starter")!;
    const metadata = createConnectionMetadata(
      "123456789012",
      "us-east-1",
      "vercel",
      emailConfig,
      "starter"
    );

    expect(metadata.accountId).toBe("123456789012");
    expect(metadata.region).toBe("us-east-1");
    expect(metadata.provider).toBe("vercel");
    expect(metadata.preset).toBe("starter");
    expect(metadata.emailConfig).toEqual(emailConfig);
    expect(metadata.timestamp).toBeDefined();
  });

  it("should create metadata without preset for custom config", () => {
    const emailConfig = {
      tracking: { enabled: true, opens: true, clicks: true },
      sendingEnabled: true,
    };
    const metadata = createConnectionMetadata(
      "123456789012",
      "us-east-1",
      "aws",
      emailConfig
    );

    expect(metadata.preset).toBeUndefined();
    expect(metadata.emailConfig).toEqual(emailConfig);
  });

  it("should generate ISO timestamp", () => {
    const before = new Date().toISOString();
    const emailConfig = getPreset("production")!;
    const metadata = createConnectionMetadata(
      "123456789012",
      "us-east-1",
      "aws",
      emailConfig,
      "production"
    );
    const after = new Date().toISOString();

    expect(metadata.timestamp).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
    );
    expect(metadata.timestamp >= before).toBe(true);
    expect(metadata.timestamp <= after).toBe(true);
  });
});

describe("updateEmailConfig", () => {
  it("should update email configuration", () => {
    const emailConfig = getPreset("starter")!;
    const metadata = createConnectionMetadata(
      "123456789012",
      "us-east-1",
      "vercel",
      emailConfig,
      "starter"
    );

    const oldTimestamp = metadata.timestamp;

    const updates = {
      tracking: {
        ...emailConfig.tracking,
        customRedirectDomain: "track.example.com",
      },
    };

    // Use fake timers to ensure timestamp changes
    vi.useFakeTimers();
    vi.advanceTimersByTime(100);

    updateEmailConfig(metadata, updates);

    vi.useRealTimers();

    expect(metadata.emailConfig.tracking?.customRedirectDomain).toBe(
      "track.example.com"
    );
    expect(metadata.timestamp).not.toBe(oldTimestamp);
  });

  it("should merge partial updates", () => {
    const emailConfig = getPreset("production")!;
    const metadata = createConnectionMetadata(
      "123456789012",
      "us-east-1",
      "aws",
      emailConfig,
      "production"
    );

    const originalRetention =
      metadata.emailConfig.eventTracking?.archiveRetention;

    updateEmailConfig(metadata, {
      eventTracking: {
        ...metadata.emailConfig.eventTracking,
        archiveRetention: "1year",
      },
    });

    expect(metadata.emailConfig.eventTracking?.archiveRetention).toBe("1year");
    expect(metadata.emailConfig.eventTracking?.enabled).toBe(true); // Original value preserved
    expect(originalRetention).not.toBe("1year"); // Verify it actually changed
  });

  it("should update timestamp on config update", () => {
    const emailConfig = getPreset("starter")!;
    const metadata = createConnectionMetadata(
      "123456789012",
      "us-east-1",
      "vercel",
      emailConfig,
      "starter"
    );

    const oldTimestamp = metadata.timestamp;

    // Wait a tiny bit to ensure timestamp changes
    vi.useFakeTimers();
    vi.advanceTimersByTime(100);

    updateEmailConfig(metadata, {
      dedicatedIp: true,
    });

    vi.useRealTimers();

    expect(metadata.timestamp).not.toBe(oldTimestamp);
    expect(metadata.emailConfig.dedicatedIp).toBe(true);
  });
});

describe("saveConnectionMetadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(writeFile).mockResolvedValue(undefined);
  });

  it("should save metadata to correct file path", async () => {
    const emailConfig = getPreset("starter")!;
    const metadata = createConnectionMetadata(
      "123456789012",
      "us-east-1",
      "vercel",
      emailConfig,
      "starter"
    );

    await saveConnectionMetadata(metadata);

    expect(writeFile).toHaveBeenCalledWith(
      "/mock/wraps/dir/connections/123456789012-us-east-1.json",
      expect.any(String),
      "utf-8"
    );
  });

  it("should serialize metadata as formatted JSON", async () => {
    const emailConfig = getPreset("production")!;
    const metadata = createConnectionMetadata(
      "123456789012",
      "us-east-1",
      "vercel",
      emailConfig,
      "production"
    );
    metadata.vercel = { teamSlug: "my-team", projectName: "my-project" };

    await saveConnectionMetadata(metadata);

    const savedContent = vi.mocked(writeFile).mock.calls[0][1] as string;
    const parsed = JSON.parse(savedContent);

    expect(parsed.accountId).toBe("123456789012");
    expect(parsed.provider).toBe("vercel");
    expect(parsed.preset).toBe("production");
    expect(parsed.emailConfig).toEqual(emailConfig);
    expect(savedContent).toContain("\n"); // Check it's formatted
  });
});

describe("loadConnectionMetadata", () => {
  it("should return null when file does not exist", async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const result = await loadConnectionMetadata("123456789012", "us-east-1");

    expect(result).toBeNull();
  });

  it("should load and parse metadata from file", async () => {
    const emailConfig = getPreset("starter")!;
    const metadata = createConnectionMetadata(
      "123456789012",
      "us-east-1",
      "vercel",
      emailConfig,
      "starter"
    );
    const content = JSON.stringify(metadata);

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFile).mockResolvedValue(content);

    const result = await loadConnectionMetadata("123456789012", "us-east-1");

    expect(result).toEqual(metadata);
    expect(readFile).toHaveBeenCalledWith(
      "/mock/wraps/dir/connections/123456789012-us-east-1.json",
      "utf-8"
    );
  });

  it("should return null on parse error", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFile).mockResolvedValue("invalid json");

    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const result = await loadConnectionMetadata("123456789012", "us-east-1");

    expect(result).toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });
});

describe("deleteConnectionMetadata", () => {
  it("should delete file when it exists", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(unlink).mockResolvedValue(undefined);

    await deleteConnectionMetadata("123456789012", "us-east-1");

    expect(unlink).toHaveBeenCalledWith(
      "/mock/wraps/dir/connections/123456789012-us-east-1.json"
    );
  });

  it("should not throw when file does not exist", async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await expect(
      deleteConnectionMetadata("123456789012", "us-east-1")
    ).resolves.toBeUndefined();
  });
});

describe("listConnections", () => {
  it("should return empty array when connections directory does not exist", async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const connections = await listConnections();

    expect(connections).toEqual([]);
  });

  it("should return all connection metadata files", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdir).mockResolvedValue([
      "123456789012-us-east-1.json",
      "999888777666-eu-west-1.json",
    ] as any);

    const emailConfig1 = getPreset("starter")!;
    const emailConfig2 = getPreset("production")!;
    const metadata1 = createConnectionMetadata(
      "123456789012",
      "us-east-1",
      "vercel",
      emailConfig1,
      "starter"
    );
    const metadata2 = createConnectionMetadata(
      "999888777666",
      "eu-west-1",
      "aws",
      emailConfig2,
      "production"
    );

    vi.mocked(readFile)
      .mockResolvedValueOnce(JSON.stringify(metadata1))
      .mockResolvedValueOnce(JSON.stringify(metadata2));

    const connections = await listConnections();

    expect(connections).toHaveLength(2);
    expect(connections[0].accountId).toBe("123456789012");
    expect(connections[1].accountId).toBe("999888777666");
    expect(connections[0].preset).toBe("starter");
    expect(connections[1].preset).toBe("production");
  });

  it("should skip non-json files", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdir).mockResolvedValue([
      "123456789012-us-east-1.json",
      "readme.txt",
      "config.yaml",
    ] as any);

    const emailConfig = getPreset("starter")!;
    const metadata = createConnectionMetadata(
      "123456789012",
      "us-east-1",
      "vercel",
      emailConfig,
      "starter"
    );
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(metadata));

    const connections = await listConnections();

    expect(connections).toHaveLength(1);
  });

  it("should handle parse errors gracefully", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdir).mockResolvedValue(["valid.json", "invalid.json"] as any);

    const emailConfig = getPreset("starter")!;
    const validMetadata = createConnectionMetadata(
      "123456789012",
      "us-east-1",
      "vercel",
      emailConfig,
      "starter"
    );
    vi.mocked(readFile)
      .mockResolvedValueOnce(JSON.stringify(validMetadata))
      .mockResolvedValueOnce("invalid json");

    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const connections = await listConnections();

    expect(connections).toHaveLength(1);
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });
});

describe("connectionExists", () => {
  it("should return true when file exists", async () => {
    vi.mocked(existsSync).mockReturnValue(true);

    const exists = await connectionExists("123456789012", "us-east-1");

    expect(exists).toBe(true);
    expect(existsSync).toHaveBeenCalledWith(
      "/mock/wraps/dir/connections/123456789012-us-east-1.json"
    );
  });

  it("should return false when file does not exist", async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const exists = await connectionExists("123456789012", "us-east-1");

    expect(exists).toBe(false);
  });
});
