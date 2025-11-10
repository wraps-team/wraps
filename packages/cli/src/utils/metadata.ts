import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  ConfigPreset,
  Provider,
  WrapsEmailConfig,
} from "../types/index.js";
import { ensureWrapsDir, getWrapsDir } from "./fs.js";

/**
 * Connection metadata
 */
export type ConnectionMetadata = {
  accountId: string;
  region: string;
  provider: Provider;
  timestamp: string;
  preset?: ConfigPreset; // Which preset was used (if any)
  emailConfig: WrapsEmailConfig; // The actual email configuration
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
  provider: Provider,
  emailConfig: WrapsEmailConfig,
  preset?: ConfigPreset
): ConnectionMetadata {
  return {
    accountId,
    region,
    provider,
    timestamp: new Date().toISOString(),
    emailConfig,
    preset,
  };
}

/**
 * Update email configuration in metadata
 */
export function updateEmailConfig(
  metadata: ConnectionMetadata,
  emailConfig: Partial<WrapsEmailConfig>
): void {
  metadata.emailConfig = {
    ...metadata.emailConfig,
    ...emailConfig,
  };
  metadata.timestamp = new Date().toISOString();
}
