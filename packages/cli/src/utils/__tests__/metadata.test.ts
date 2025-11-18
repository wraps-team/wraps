import { existsSync } from "node:fs";
import { readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPreset } from "../email/presets.js";
import {
  addServiceToConnection,
  connectionExists,
  createConnectionMetadata,
  deleteConnectionMetadata,
  getConfiguredServices,
  hasService,
  listConnections,
  loadConnectionMetadata,
  removeServiceFromConnection,
  saveConnectionMetadata,
  updateEmailConfig,
  updateServiceConfig,
} from "../shared/metadata.js";

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

vi.mock("../shared/fs.js", () => ({
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
    expect(metadata.services.email?.preset).toBe("starter");
    expect(metadata.services.email?.config).toEqual(emailConfig);
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

    expect(metadata.services.email?.preset).toBeUndefined();
    expect(metadata.services.email?.config).toEqual(emailConfig);
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

    expect(metadata.services.email?.config.tracking?.customRedirectDomain).toBe(
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
      metadata.services.email?.config.eventTracking?.archiveRetention;

    updateEmailConfig(metadata, {
      eventTracking: {
        ...metadata.services.email?.config.eventTracking,
        archiveRetention: "1year",
      },
    });

    expect(
      metadata.services.email?.config.eventTracking?.archiveRetention
    ).toBe("1year");
    expect(metadata.services.email?.config.eventTracking?.enabled).toBe(true); // Original value preserved
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
    expect(metadata.services.email?.config.dedicatedIp).toBe(true);
  });
});

describe("saveConnectionMetadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(writeFile).mockResolvedValue(undefined);
  });

  it("should create connections directory if it doesn't exist", async () => {
    const { mkdir } = await import("node:fs/promises");
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(mkdir).mockResolvedValue(undefined);

    const emailConfig = getPreset("starter")!;
    const metadata = createConnectionMetadata(
      "123456789012",
      "us-east-1",
      "vercel",
      emailConfig,
      "starter"
    );

    await saveConnectionMetadata(metadata);

    expect(mkdir).toHaveBeenCalledWith("/mock/wraps/dir/connections", {
      recursive: true,
    });
  });

  it("should throw error when save fails", async () => {
    const emailConfig = getPreset("starter")!;
    const metadata = createConnectionMetadata(
      "123456789012",
      "us-east-1",
      "vercel",
      emailConfig,
      "starter"
    );

    vi.mocked(writeFile).mockRejectedValue(new Error("Permission denied"));

    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await expect(saveConnectionMetadata(metadata)).rejects.toThrow(
      "Permission denied"
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Error saving connection metadata:",
      "Permission denied"
    );

    consoleErrorSpy.mockRestore();
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
    expect(parsed.services.email.preset).toBe("production");
    expect(parsed.services.email.config).toEqual(emailConfig);
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
    expect(connections[0].services.email?.preset).toBe("starter");
    expect(connections[1].services.email?.preset).toBe("production");
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

  it("should return empty array when listing fails", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdir).mockRejectedValue(new Error("Permission denied"));

    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const connections = await listConnections();

    expect(connections).toEqual([]);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Error listing connections:",
      "Permission denied"
    );

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

describe("loadConnectionMetadata - legacy migration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should migrate legacy metadata and save migrated version", async () => {
    const legacyMetadata = {
      accountId: "123456789012",
      region: "us-east-1",
      provider: "vercel" as const,
      timestamp: "2024-01-01T00:00:00.000Z",
      preset: "production" as const,
      emailConfig: {
        tracking: { enabled: true, opens: true, clicks: true },
        sendingEnabled: true,
        eventTracking: { enabled: true },
      },
      vercel: {
        teamSlug: "my-team",
        projectName: "my-project",
      },
      pulumiStackName: "wraps-123-us-east-1",
    };

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(legacyMetadata));
    vi.mocked(writeFile).mockResolvedValue(undefined);

    const result = await loadConnectionMetadata("123456789012", "us-east-1");

    expect(result).toBeDefined();
    expect(result?.version).toBe("1.0.0");
    expect(result?.services.email).toBeDefined();
    expect(result?.services.email?.config).toEqual(legacyMetadata.emailConfig);
    expect(result?.services.email?.preset).toBe("production");
    expect(result?.services.email?.pulumiStackName).toBe("wraps-123-us-east-1");
    expect(writeFile).toHaveBeenCalled(); // Migrated version should be saved
  });

  it("should add version to metadata missing version field", async () => {
    const metadataWithoutVersion = {
      accountId: "123456789012",
      region: "us-east-1",
      provider: "aws" as const,
      timestamp: "2024-01-01T00:00:00.000Z",
      services: {
        email: {
          config: {
            tracking: { enabled: true },
            sendingEnabled: true,
          },
          deployedAt: "2024-01-01T00:00:00.000Z",
        },
      },
    };

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFile).mockResolvedValue(
      JSON.stringify(metadataWithoutVersion)
    );
    vi.mocked(writeFile).mockResolvedValue(undefined);

    const result = await loadConnectionMetadata("123456789012", "us-east-1");

    expect(result?.version).toBe("1.0.0");
    expect(writeFile).toHaveBeenCalled(); // Version should be added and saved
  });
});

describe("updateEmailConfig - error handling", () => {
  it("should throw error when email service not configured", () => {
    const metadata = {
      version: "1.0.0",
      accountId: "123456789012",
      region: "us-east-1",
      provider: "aws" as const,
      timestamp: new Date().toISOString(),
      services: {}, // No email service configured
    };

    expect(() => {
      updateEmailConfig(metadata, { sendingEnabled: true });
    }).toThrow("Email service not configured in metadata");
  });
});

describe("multi-service metadata functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("addServiceToConnection", () => {
    it("should create new connection metadata with email service", () => {
      const emailConfig = {
        tracking: { enabled: true },
        sendingEnabled: true,
      };

      const result = addServiceToConnection(
        "123456789012",
        "us-east-1",
        "vercel",
        "email",
        emailConfig,
        "starter"
      );

      expect(result.accountId).toBe("123456789012");
      expect(result.region).toBe("us-east-1");
      expect(result.provider).toBe("vercel");
      expect(result.version).toBe("1.0.0");
      expect(result.services.email).toBeDefined();
      expect(result.services.email?.config).toEqual(emailConfig);
      expect(result.services.email?.preset).toBe("starter");
    });

    it("should add email service to existing connection", () => {
      const existingMetadata = {
        version: "1.0.0",
        accountId: "123456789012",
        region: "us-east-1",
        provider: "aws" as const,
        timestamp: "2024-01-01T00:00:00.000Z",
        services: {},
      };

      const emailConfig = {
        tracking: { enabled: true },
        sendingEnabled: true,
      };

      const result = addServiceToConnection(
        "123456789012",
        "us-east-1",
        "aws",
        "email",
        emailConfig,
        "production",
        existingMetadata
      );

      expect(result).toBe(existingMetadata); // Should modify existing object
      expect(result.services.email).toBeDefined();
      expect(result.services.email?.preset).toBe("production");
    });

    it("should add SMS service to existing connection", () => {
      const existingMetadata = {
        version: "1.0.0",
        accountId: "123456789012",
        region: "us-east-1",
        provider: "aws" as const,
        timestamp: "2024-01-01T00:00:00.000Z",
        services: {
          email: {
            config: { tracking: { enabled: true }, sendingEnabled: true },
            deployedAt: "2024-01-01T00:00:00.000Z",
          },
        },
      };

      const smsConfig = {
        sendingEnabled: true,
      };

      const result = addServiceToConnection(
        "123456789012",
        "us-east-1",
        "aws",
        "sms",
        smsConfig,
        undefined,
        existingMetadata
      );

      expect(result.services.sms).toBeDefined();
      expect(result.services.sms?.config).toEqual(smsConfig);
      expect(result.services.email).toBeDefined(); // Email service preserved
    });
  });

  describe("updateServiceConfig", () => {
    it("should update email service config", () => {
      const metadata = {
        version: "1.0.0",
        accountId: "123456789012",
        region: "us-east-1",
        provider: "aws" as const,
        timestamp: "2024-01-01T00:00:00.000Z",
        services: {
          email: {
            config: {
              tracking: { enabled: true },
              sendingEnabled: true,
            },
            deployedAt: "2024-01-01T00:00:00.000Z",
          },
        },
      };

      const oldTimestamp = metadata.timestamp;
      vi.useFakeTimers();
      vi.advanceTimersByTime(100);

      updateServiceConfig(metadata, "email", { dedicatedIp: true });

      vi.useRealTimers();

      expect(metadata.services.email?.config.dedicatedIp).toBe(true);
      expect(metadata.services.email?.config.sendingEnabled).toBe(true); // Preserved
      expect(metadata.timestamp).not.toBe(oldTimestamp);
    });

    it("should update SMS service config", () => {
      const metadata = {
        version: "1.0.0",
        accountId: "123456789012",
        region: "us-east-1",
        provider: "aws" as const,
        timestamp: "2024-01-01T00:00:00.000Z",
        services: {
          sms: {
            config: {
              sendingEnabled: true,
            },
            deployedAt: "2024-01-01T00:00:00.000Z",
          },
        },
      };

      updateServiceConfig(metadata, "sms", { sendingEnabled: false });

      expect(metadata.services.sms?.config.sendingEnabled).toBe(false);
    });

    it("should throw error when service not configured", () => {
      const metadata = {
        version: "1.0.0",
        accountId: "123456789012",
        region: "us-east-1",
        provider: "aws" as const,
        timestamp: "2024-01-01T00:00:00.000Z",
        services: {},
      };

      expect(() => {
        updateServiceConfig(metadata, "email", { sendingEnabled: true });
      }).toThrow("email service not configured in metadata");
    });
  });

  describe("removeServiceFromConnection", () => {
    it("should remove email service", () => {
      const metadata = {
        version: "1.0.0",
        accountId: "123456789012",
        region: "us-east-1",
        provider: "aws" as const,
        timestamp: "2024-01-01T00:00:00.000Z",
        services: {
          email: {
            config: { tracking: { enabled: true }, sendingEnabled: true },
            deployedAt: "2024-01-01T00:00:00.000Z",
          },
        },
      };

      removeServiceFromConnection(metadata, "email");

      expect(metadata.services.email).toBeUndefined();
    });

    it("should remove SMS service", () => {
      const metadata = {
        version: "1.0.0",
        accountId: "123456789012",
        region: "us-east-1",
        provider: "aws" as const,
        timestamp: "2024-01-01T00:00:00.000Z",
        services: {
          sms: {
            config: { sendingEnabled: true },
            deployedAt: "2024-01-01T00:00:00.000Z",
          },
        },
      };

      removeServiceFromConnection(metadata, "sms");

      expect(metadata.services.sms).toBeUndefined();
    });
  });

  describe("hasService", () => {
    it("should return true when email service exists", () => {
      const metadata = {
        version: "1.0.0",
        accountId: "123456789012",
        region: "us-east-1",
        provider: "aws" as const,
        timestamp: "2024-01-01T00:00:00.000Z",
        services: {
          email: {
            config: { tracking: { enabled: true }, sendingEnabled: true },
            deployedAt: "2024-01-01T00:00:00.000Z",
          },
        },
      };

      expect(hasService(metadata, "email")).toBe(true);
      expect(hasService(metadata, "sms")).toBe(false);
    });

    it("should return false when service does not exist", () => {
      const metadata = {
        version: "1.0.0",
        accountId: "123456789012",
        region: "us-east-1",
        provider: "aws" as const,
        timestamp: "2024-01-01T00:00:00.000Z",
        services: {},
      };

      expect(hasService(metadata, "email")).toBe(false);
      expect(hasService(metadata, "sms")).toBe(false);
    });
  });

  describe("getConfiguredServices", () => {
    it("should return array of configured services", () => {
      const metadata = {
        version: "1.0.0",
        accountId: "123456789012",
        region: "us-east-1",
        provider: "aws" as const,
        timestamp: "2024-01-01T00:00:00.000Z",
        services: {
          email: {
            config: { tracking: { enabled: true }, sendingEnabled: true },
            deployedAt: "2024-01-01T00:00:00.000Z",
          },
          sms: {
            config: { sendingEnabled: true },
            deployedAt: "2024-01-01T00:00:00.000Z",
          },
        },
      };

      const services = getConfiguredServices(metadata);

      expect(services).toContain("email");
      expect(services).toContain("sms");
      expect(services).toHaveLength(2);
    });

    it("should return empty array when no services configured", () => {
      const metadata = {
        version: "1.0.0",
        accountId: "123456789012",
        region: "us-east-1",
        provider: "aws" as const,
        timestamp: "2024-01-01T00:00:00.000Z",
        services: {},
      };

      const services = getConfiguredServices(metadata);

      expect(services).toEqual([]);
    });
  });
});
