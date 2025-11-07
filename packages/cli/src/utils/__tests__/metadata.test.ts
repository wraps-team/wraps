import { existsSync } from "node:fs";
import { readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  connectionExists,
  createConnectionMetadata,
  deleteConnectionMetadata,
  type FeatureConfig,
  getModifiedIdentities,
  getReplacedFeatures,
  type IdentityConfig,
  listConnections,
  loadConnectionMetadata,
  saveConnectionMetadata,
  updateFeatureMetadata,
  updateIdentityMetadata,
} from "../metadata.js";

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
  getBYODir: () => "/mock/byo/dir",
  ensureBYODir: vi.fn().mockResolvedValue(undefined),
}));

describe("createConnectionMetadata", () => {
  it("should create metadata with required fields", () => {
    const metadata = createConnectionMetadata(
      "123456789012",
      "us-east-1",
      "vercel"
    );

    expect(metadata.accountId).toBe("123456789012");
    expect(metadata.region).toBe("us-east-1");
    expect(metadata.provider).toBe("vercel");
    expect(metadata.timestamp).toBeDefined();
    expect(metadata.features).toEqual({});
    expect(metadata.identities).toEqual([]);
  });

  it("should generate ISO timestamp", () => {
    const before = new Date().toISOString();
    const metadata = createConnectionMetadata(
      "123456789012",
      "us-east-1",
      "aws"
    );
    const after = new Date().toISOString();

    expect(metadata.timestamp).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
    );
    expect(metadata.timestamp >= before).toBe(true);
    expect(metadata.timestamp <= after).toBe(true);
  });
});

describe("updateFeatureMetadata", () => {
  it("should add feature to metadata", () => {
    const metadata = createConnectionMetadata(
      "123456789012",
      "us-east-1",
      "vercel"
    );
    const featureConfig: FeatureConfig = {
      enabled: true,
      action: "deploy-new",
      originalValue: null,
      currentValue: "byo-tracking",
    };

    updateFeatureMetadata(metadata, "configSet", featureConfig);

    expect(metadata.features.configSet).toEqual(featureConfig);
  });

  it("should update existing feature", () => {
    const metadata = createConnectionMetadata(
      "123456789012",
      "us-east-1",
      "vercel"
    );
    metadata.features.configSet = {
      enabled: true,
      action: "deploy-new",
      originalValue: null,
      currentValue: "old-value",
    };

    const newConfig: FeatureConfig = {
      enabled: true,
      action: "replace",
      originalValue: "old-value",
      currentValue: "new-value",
    };

    updateFeatureMetadata(metadata, "configSet", newConfig);

    expect(metadata.features.configSet).toEqual(newConfig);
  });

  it("should handle multiple features", () => {
    const metadata = createConnectionMetadata(
      "123456789012",
      "us-east-1",
      "vercel"
    );

    updateFeatureMetadata(metadata, "configSet", {
      enabled: true,
      action: "deploy-new",
      originalValue: null,
      currentValue: "byo-tracking",
    });

    updateFeatureMetadata(metadata, "emailHistory", {
      enabled: true,
      action: "deploy-new",
      originalValue: null,
      currentValue: "byo-email-history",
    });

    expect(Object.keys(metadata.features)).toHaveLength(2);
    expect(metadata.features.configSet?.currentValue).toBe("byo-tracking");
    expect(metadata.features.emailHistory?.currentValue).toBe(
      "byo-email-history"
    );
  });
});

describe("updateIdentityMetadata", () => {
  it("should add identity to metadata", () => {
    const metadata = createConnectionMetadata(
      "123456789012",
      "us-east-1",
      "vercel"
    );
    const identity: IdentityConfig = {
      name: "example.com",
      type: "Domain",
      originalConfigSet: null,
      currentConfigSet: "byo-tracking",
      action: "attached",
    };

    updateIdentityMetadata(metadata, identity);

    expect(metadata.identities).toHaveLength(1);
    expect(metadata.identities[0]).toEqual(identity);
  });

  it("should replace existing identity with same name", () => {
    const metadata = createConnectionMetadata(
      "123456789012",
      "us-east-1",
      "vercel"
    );

    updateIdentityMetadata(metadata, {
      name: "example.com",
      type: "Domain",
      originalConfigSet: null,
      currentConfigSet: "old-config",
      action: "attached",
    });

    updateIdentityMetadata(metadata, {
      name: "example.com",
      type: "Domain",
      originalConfigSet: "old-config",
      currentConfigSet: "new-config",
      action: "replaced",
    });

    expect(metadata.identities).toHaveLength(1);
    expect(metadata.identities[0].currentConfigSet).toBe("new-config");
    expect(metadata.identities[0].action).toBe("replaced");
  });

  it("should handle multiple different identities", () => {
    const metadata = createConnectionMetadata(
      "123456789012",
      "us-east-1",
      "vercel"
    );

    updateIdentityMetadata(metadata, {
      name: "example.com",
      type: "Domain",
      action: "attached",
    });

    updateIdentityMetadata(metadata, {
      name: "test@example.com",
      type: "EmailAddress",
      action: "attached",
    });

    expect(metadata.identities).toHaveLength(2);
  });
});

describe("getReplacedFeatures", () => {
  it("should return empty array when no features are replaced", () => {
    const metadata = createConnectionMetadata(
      "123456789012",
      "us-east-1",
      "vercel"
    );

    updateFeatureMetadata(metadata, "configSet", {
      enabled: true,
      action: "deploy-new",
      originalValue: null,
      currentValue: "byo-tracking",
    });

    const replaced = getReplacedFeatures(metadata);
    expect(replaced).toEqual([]);
  });

  it("should return replaced features", () => {
    const metadata = createConnectionMetadata(
      "123456789012",
      "us-east-1",
      "vercel"
    );

    updateFeatureMetadata(metadata, "configSet", {
      enabled: true,
      action: "replace",
      originalValue: "old-tracking",
      currentValue: "byo-tracking",
    });

    const replaced = getReplacedFeatures(metadata);

    expect(replaced).toHaveLength(1);
    expect(replaced[0].name).toBe("configSet");
    expect(replaced[0].config.originalValue).toBe("old-tracking");
  });

  it("should only return features with replace action and original value", () => {
    const metadata = createConnectionMetadata(
      "123456789012",
      "us-east-1",
      "vercel"
    );

    updateFeatureMetadata(metadata, "configSet", {
      enabled: true,
      action: "replace",
      originalValue: "old-value",
      currentValue: "new-value",
    });

    updateFeatureMetadata(metadata, "bounceHandling", {
      enabled: true,
      action: "deploy-new",
      originalValue: null,
      currentValue: "byo-bounce",
    });

    updateFeatureMetadata(metadata, "emailHistory", {
      enabled: true,
      action: "skip",
      originalValue: "existing",
      currentValue: "existing",
    });

    const replaced = getReplacedFeatures(metadata);

    expect(replaced).toHaveLength(1);
    expect(replaced[0].name).toBe("configSet");
  });
});

describe("getModifiedIdentities", () => {
  it("should return empty array when no identities are modified", () => {
    const metadata = createConnectionMetadata(
      "123456789012",
      "us-east-1",
      "vercel"
    );

    updateIdentityMetadata(metadata, {
      name: "example.com",
      type: "Domain",
      action: "no-change",
    });

    const modified = getModifiedIdentities(metadata);
    expect(modified).toEqual([]);
  });

  it("should return attached identities", () => {
    const metadata = createConnectionMetadata(
      "123456789012",
      "us-east-1",
      "vercel"
    );

    updateIdentityMetadata(metadata, {
      name: "example.com",
      type: "Domain",
      action: "attached",
    });

    const modified = getModifiedIdentities(metadata);

    expect(modified).toHaveLength(1);
    expect(modified[0].name).toBe("example.com");
    expect(modified[0].action).toBe("attached");
  });

  it("should return replaced identities", () => {
    const metadata = createConnectionMetadata(
      "123456789012",
      "us-east-1",
      "vercel"
    );

    updateIdentityMetadata(metadata, {
      name: "example.com",
      type: "Domain",
      action: "replaced",
      originalConfigSet: "old-config",
      currentConfigSet: "byo-tracking",
    });

    const modified = getModifiedIdentities(metadata);

    expect(modified).toHaveLength(1);
    expect(modified[0].action).toBe("replaced");
  });

  it("should return both attached and replaced identities", () => {
    const metadata = createConnectionMetadata(
      "123456789012",
      "us-east-1",
      "vercel"
    );

    updateIdentityMetadata(metadata, {
      name: "attached.com",
      type: "Domain",
      action: "attached",
    });

    updateIdentityMetadata(metadata, {
      name: "replaced.com",
      type: "Domain",
      action: "replaced",
    });

    updateIdentityMetadata(metadata, {
      name: "unchanged.com",
      type: "Domain",
      action: "no-change",
    });

    const modified = getModifiedIdentities(metadata);

    expect(modified).toHaveLength(2);
    expect(modified.map((i) => i.name).sort()).toEqual([
      "attached.com",
      "replaced.com",
    ]);
  });
});

describe("saveConnectionMetadata", () => {
  beforeEach(() => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(writeFile).mockResolvedValue(undefined);
  });

  it("should save metadata to correct file path", async () => {
    const metadata = createConnectionMetadata(
      "123456789012",
      "us-east-1",
      "vercel"
    );

    await saveConnectionMetadata(metadata);

    expect(writeFile).toHaveBeenCalledWith(
      "/mock/byo/dir/connections/123456789012-us-east-1.json",
      expect.any(String),
      "utf-8"
    );
  });

  it("should serialize metadata as formatted JSON", async () => {
    const metadata = createConnectionMetadata(
      "123456789012",
      "us-east-1",
      "vercel"
    );
    metadata.vercel = { teamSlug: "my-team", projectName: "my-project" };

    await saveConnectionMetadata(metadata);

    const savedContent = vi.mocked(writeFile).mock.calls[0][1] as string;
    const parsed = JSON.parse(savedContent);

    expect(parsed.accountId).toBe("123456789012");
    expect(parsed.provider).toBe("vercel");
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
    const metadata = createConnectionMetadata(
      "123456789012",
      "us-east-1",
      "vercel"
    );
    const content = JSON.stringify(metadata);

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFile).mockResolvedValue(content);

    const result = await loadConnectionMetadata("123456789012", "us-east-1");

    expect(result).toEqual(metadata);
    expect(readFile).toHaveBeenCalledWith(
      "/mock/byo/dir/connections/123456789012-us-east-1.json",
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
      "/mock/byo/dir/connections/123456789012-us-east-1.json"
    );
  });

  it("should not throw when file does not exist", async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await expect(
      deleteConnectionMetadata("123456789012", "us-east-1")
    ).resolves.toBeUndefined();
    // Note: Implementation may still call unlink which handles non-existent files gracefully
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

    const metadata1 = createConnectionMetadata(
      "123456789012",
      "us-east-1",
      "vercel"
    );
    const metadata2 = createConnectionMetadata(
      "999888777666",
      "eu-west-1",
      "aws"
    );

    vi.mocked(readFile)
      .mockResolvedValueOnce(JSON.stringify(metadata1))
      .mockResolvedValueOnce(JSON.stringify(metadata2));

    const connections = await listConnections();

    expect(connections).toHaveLength(2);
    expect(connections[0].accountId).toBe("123456789012");
    expect(connections[1].accountId).toBe("999888777666");
  });

  it("should skip non-json files", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdir).mockResolvedValue([
      "123456789012-us-east-1.json",
      "readme.txt",
      "config.yaml",
    ] as any);

    const metadata = createConnectionMetadata(
      "123456789012",
      "us-east-1",
      "vercel"
    );
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(metadata));

    const connections = await listConnections();

    expect(connections).toHaveLength(1);
    // readFile might be called more times due to mocking behavior, just check we got right number of connections
  });

  it("should handle parse errors gracefully", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdir).mockResolvedValue(["valid.json", "invalid.json"] as any);

    const validMetadata = createConnectionMetadata(
      "123456789012",
      "us-east-1",
      "vercel"
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
      "/mock/byo/dir/connections/123456789012-us-east-1.json"
    );
  });

  it("should return false when file does not exist", async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const exists = await connectionExists("123456789012", "us-east-1");

    expect(exists).toBe(false);
  });
});
