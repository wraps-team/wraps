import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ensureBYODir, getBYODir } from "./fs.js";

/**
 * Feature configuration for a connection
 */
export type FeatureConfig = {
  enabled: boolean;
  action: "deploy-new" | "replace" | "skip";
  originalValue?: string | null;
  currentValue?: string | null;
};

/**
 * Identity configuration tracking
 */
export type IdentityConfig = {
  name: string;
  type: "Domain" | "EmailAddress";
  originalConfigSet?: string | null;
  currentConfigSet?: string | null;
  action: "no-change" | "attached" | "replaced";
};

/**
 * Connection metadata for restore
 */
export type ConnectionMetadata = {
  accountId: string;
  region: string;
  provider: string;
  timestamp: string;
  vercel?: {
    teamSlug: string;
    projectName: string;
  };
  features: {
    configSet?: FeatureConfig;
    bounceHandling?: FeatureConfig;
    complaintHandling?: FeatureConfig;
    emailHistory?: FeatureConfig;
    eventProcessor?: FeatureConfig;
    dashboardAccess?: FeatureConfig;
  };
  identities: IdentityConfig[];
  pulumiStackName?: string;
};

/**
 * Get the connections directory
 */
function getConnectionsDir(): string {
  return join(getBYODir(), "connections");
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
  await ensureBYODir();
  const connectionsDir = getConnectionsDir();
  if (!existsSync(connectionsDir)) {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(connectionsDir, { recursive: true });
  }
}

/**
 * Load connection metadata from disk
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
    return JSON.parse(content) as ConnectionMetadata;
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
 */
export function createConnectionMetadata(
  accountId: string,
  region: string,
  provider: string
): ConnectionMetadata {
  return {
    accountId,
    region,
    provider,
    timestamp: new Date().toISOString(),
    features: {},
    identities: [],
  };
}

/**
 * Update feature in metadata
 */
export function updateFeatureMetadata(
  metadata: ConnectionMetadata,
  featureName: keyof ConnectionMetadata["features"],
  config: FeatureConfig
): void {
  metadata.features[featureName] = config;
}

/**
 * Update identity in metadata
 */
export function updateIdentityMetadata(
  metadata: ConnectionMetadata,
  identity: IdentityConfig
): void {
  // Remove existing entry if present
  metadata.identities = metadata.identities.filter(
    (i) => i.name !== identity.name
  );
  // Add new entry
  metadata.identities.push(identity);
}

/**
 * Get features that were replaced (for restore)
 */
export function getReplacedFeatures(
  metadata: ConnectionMetadata
): Array<{ name: string; config: FeatureConfig }> {
  const replaced: Array<{ name: string; config: FeatureConfig }> = [];

  for (const [name, config] of Object.entries(metadata.features)) {
    if (config && config.action === "replace" && config.originalValue) {
      replaced.push({ name, config });
    }
  }

  return replaced;
}

/**
 * Get identities that were modified (for restore)
 */
export function getModifiedIdentities(
  metadata: ConnectionMetadata
): IdentityConfig[] {
  return metadata.identities.filter(
    (i) => i.action === "attached" || i.action === "replaced"
  );
}
