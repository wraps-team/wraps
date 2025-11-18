import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  EmailConfigPreset,
  Provider,
  ServiceType,
  SMSConfigPreset,
  WrapsEmailConfig,
  WrapsSMSConfig,
} from "../../types/index.js";
import { ensureWrapsDir, getWrapsDir } from "./fs.js";

/**
 * Service-specific configuration with metadata
 */
export type ServiceConfig<TConfig, TPreset> = {
  preset?: TPreset;
  config: TConfig;
  pulumiStackName?: string;
  deployedAt: string;
};

/**
 * Connection metadata - supports multiple services per AWS account/region
 */
export type ConnectionMetadata = {
  version: string; // Metadata format version (e.g., "1.0.0")
  accountId: string;
  region: string;
  provider: Provider;
  timestamp: string; // Last updated timestamp
  vercel?: {
    teamSlug: string;
    projectName: string;
  };

  // Service-specific configurations
  services: {
    email?: ServiceConfig<WrapsEmailConfig, EmailConfigPreset>;
    sms?: ServiceConfig<WrapsSMSConfig, SMSConfigPreset>;
  };
};

/**
 * Legacy connection metadata (for backwards compatibility)
 * @deprecated Use ConnectionMetadata instead
 */
export type LegacyConnectionMetadata = {
  accountId: string;
  region: string;
  provider: Provider;
  timestamp: string;
  preset?: EmailConfigPreset;
  emailConfig: WrapsEmailConfig;
  vercel?: {
    teamSlug: string;
    projectName: string;
  };
  pulumiStackName?: string;
};

/**
 * Get the connections directory
 */
function getConnectionsDir(): string {
  return join(getWrapsDir(), "connections");
}

/**
 * Get metadata file path for an account and region
 */
function getMetadataPath(accountId: string, region: string): string {
  return join(getConnectionsDir(), `${accountId}-${region}.json`);
}

/**
 * Ensure the connections directory exists
 */
async function ensureConnectionsDir(): Promise<void> {
  await ensureWrapsDir();
  const connectionsDir = getConnectionsDir();
  if (!existsSync(connectionsDir)) {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(connectionsDir, { recursive: true });
  }
}

/**
 * Migrate legacy metadata to new multi-service format
 */
function migrateLegacyMetadata(
  legacy: LegacyConnectionMetadata
): ConnectionMetadata {
  return {
    version: "1.0.0",
    accountId: legacy.accountId,
    region: legacy.region,
    provider: legacy.provider,
    timestamp: legacy.timestamp,
    vercel: legacy.vercel,
    services: {
      email: {
        preset: legacy.preset,
        config: legacy.emailConfig,
        pulumiStackName: legacy.pulumiStackName,
        deployedAt: legacy.timestamp,
      },
    },
  };
}

/**
 * Check if metadata is in legacy format
 */
function isLegacyMetadata(data: any): data is LegacyConnectionMetadata {
  return (
    "emailConfig" in data &&
    !("services" in data) &&
    typeof data.emailConfig === "object"
  );
}

/**
 * Load connection metadata from disk
 * Automatically migrates legacy format to new multi-service format
 */
export async function loadConnectionMetadata(
  accountId: string,
  region: string
): Promise<ConnectionMetadata | null> {
  const metadataPath = getMetadataPath(accountId, region);

  if (!existsSync(metadataPath)) {
    return null;
  }

  try {
    const content = await readFile(metadataPath, "utf-8");
    const data = JSON.parse(content);

    // Migrate legacy format if needed
    if (isLegacyMetadata(data)) {
      const migrated = migrateLegacyMetadata(data);
      // Save migrated version
      await saveConnectionMetadata(migrated);
      return migrated;
    }

    // Add version if missing (for backwards compatibility with early multi-service format)
    if (!data.version) {
      data.version = "1.0.0";
      await saveConnectionMetadata(data);
    }

    return data as ConnectionMetadata;
  } catch (error: any) {
    console.error("Error loading connection metadata:", error.message);
    return null;
  }
}

/**
 * Save connection metadata to disk
 */
export async function saveConnectionMetadata(
  metadata: ConnectionMetadata
): Promise<void> {
  await ensureConnectionsDir();
  const metadataPath = getMetadataPath(metadata.accountId, metadata.region);

  try {
    const content = JSON.stringify(metadata, null, 2);
    await writeFile(metadataPath, content, "utf-8");
  } catch (error: any) {
    console.error("Error saving connection metadata:", error.message);
    throw error;
  }
}

/**
 * Delete connection metadata
 */
export async function deleteConnectionMetadata(
  accountId: string,
  region: string
): Promise<void> {
  const metadataPath = getMetadataPath(accountId, region);

  if (existsSync(metadataPath)) {
    const { unlink } = await import("node:fs/promises");
    await unlink(metadataPath);
  }
}

/**
 * List all connections
 */
export async function listConnections(): Promise<ConnectionMetadata[]> {
  const connectionsDir = getConnectionsDir();

  if (!existsSync(connectionsDir)) {
    return [];
  }

  try {
    const { readdir } = await import("node:fs/promises");
    const files = await readdir(connectionsDir);
    const connections: ConnectionMetadata[] = [];

    for (const file of files) {
      if (file.endsWith(".json")) {
        const content = await readFile(join(connectionsDir, file), "utf-8");
        try {
          const metadata = JSON.parse(content) as ConnectionMetadata;
          connections.push(metadata);
        } catch (error) {
          console.error(`Error parsing ${file}:`, error);
        }
      }
    }

    return connections;
  } catch (error: any) {
    console.error("Error listing connections:", error.message);
    return [];
  }
}

/**
 * Check if a connection exists
 */
export async function connectionExists(
  accountId: string,
  region: string
): Promise<boolean> {
  const metadataPath = getMetadataPath(accountId, region);
  return existsSync(metadataPath);
}

/**
 * Create initial connection metadata
 * @deprecated Use addServiceToConnection instead
 */
export function createConnectionMetadata(
  accountId: string,
  region: string,
  provider: Provider,
  emailConfig: WrapsEmailConfig,
  preset?: EmailConfigPreset
): ConnectionMetadata {
  return {
    version: "1.0.0",
    accountId,
    region,
    provider,
    timestamp: new Date().toISOString(),
    services: {
      email: {
        preset,
        config: emailConfig,
        deployedAt: new Date().toISOString(),
      },
    },
  };
}

/**
 * Update email configuration in metadata
 * @deprecated Use updateServiceConfig instead
 */
export function updateEmailConfig(
  metadata: ConnectionMetadata,
  emailConfig: Partial<WrapsEmailConfig>
): void {
  if (!metadata.services.email) {
    throw new Error("Email service not configured in metadata");
  }

  metadata.services.email.config = {
    ...metadata.services.email.config,
    ...emailConfig,
  };
  metadata.timestamp = new Date().toISOString();
}

/**
 * Add a service to an existing connection or create new connection metadata
 */
export function addServiceToConnection(
  accountId: string,
  region: string,
  provider: Provider,
  service: ServiceType,
  config: WrapsEmailConfig | WrapsSMSConfig,
  preset?: EmailConfigPreset | SMSConfigPreset,
  existingMetadata?: ConnectionMetadata
): ConnectionMetadata {
  const timestamp = new Date().toISOString();

  if (existingMetadata) {
    // Add service to existing connection
    if (service === "email") {
      existingMetadata.services.email = {
        preset: preset as EmailConfigPreset,
        config: config as WrapsEmailConfig,
        deployedAt: timestamp,
      };
    } else if (service === "sms") {
      existingMetadata.services.sms = {
        preset: preset as SMSConfigPreset,
        config: config as WrapsSMSConfig,
        deployedAt: timestamp,
      };
    }
    existingMetadata.timestamp = timestamp;
    return existingMetadata;
  }

  // Create new connection metadata
  const metadata: ConnectionMetadata = {
    version: "1.0.0",
    accountId,
    region,
    provider,
    timestamp,
    services: {},
  };

  if (service === "email") {
    metadata.services.email = {
      preset: preset as EmailConfigPreset,
      config: config as WrapsEmailConfig,
      deployedAt: timestamp,
    };
  } else if (service === "sms") {
    metadata.services.sms = {
      preset: preset as SMSConfigPreset,
      config: config as WrapsSMSConfig,
      deployedAt: timestamp,
    };
  }

  return metadata;
}

/**
 * Update service configuration in metadata
 */
export function updateServiceConfig<T extends ServiceType>(
  metadata: ConnectionMetadata,
  service: T,
  config: T extends "email"
    ? Partial<WrapsEmailConfig>
    : T extends "sms"
      ? Partial<WrapsSMSConfig>
      : never
): void {
  if (service === "email" && metadata.services.email) {
    metadata.services.email.config = {
      ...metadata.services.email.config,
      ...(config as Partial<WrapsEmailConfig>),
    };
  } else if (service === "sms" && metadata.services.sms) {
    metadata.services.sms.config = {
      ...metadata.services.sms.config,
      ...(config as Partial<WrapsSMSConfig>),
    };
  } else {
    throw new Error(`${service} service not configured in metadata`);
  }

  metadata.timestamp = new Date().toISOString();
}

/**
 * Remove a service from connection metadata
 */
export function removeServiceFromConnection(
  metadata: ConnectionMetadata,
  service: ServiceType
): void {
  if (service === "email") {
    delete metadata.services.email;
  } else if (service === "sms") {
    delete metadata.services.sms;
  }
  metadata.timestamp = new Date().toISOString();
}

/**
 * Check if a service is configured in metadata
 */
export function hasService(
  metadata: ConnectionMetadata,
  service: ServiceType
): boolean {
  if (service === "email") return metadata.services.email !== undefined;
  if (service === "sms") return metadata.services.sms !== undefined;
  return false;
}

/**
 * Get list of configured services in metadata
 */
export function getConfiguredServices(
  metadata: ConnectionMetadata
): ServiceType[] {
  const services: ServiceType[] = [];
  if (metadata.services.email) services.push("email");
  if (metadata.services.sms) services.push("sms");
  return services;
}
