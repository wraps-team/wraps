import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Get the Wraps configuration directory
 */
export function getWrapsDir(): string {
  return join(homedir(), ".wraps");
}

/**
 * Get the Pulumi workspace directory
 */
export function getPulumiWorkDir(): string {
  return join(getWrapsDir(), "pulumi");
}

/**
 * Ensure the Wraps configuration directory exists
 */
export async function ensureWrapsDir(): Promise<void> {
  const wrapsDir = getWrapsDir();
  if (!existsSync(wrapsDir)) {
    await mkdir(wrapsDir, { recursive: true });
  }
}

/**
 * Ensure the Pulumi workspace directory exists and configure local backend
 */
export async function ensurePulumiWorkDir(): Promise<void> {
  await ensureWrapsDir();
  const pulumiDir = getPulumiWorkDir();
  if (!existsSync(pulumiDir)) {
    await mkdir(pulumiDir, { recursive: true });
  }

  // Set Pulumi to use local backend (file-based state)
  // This avoids needing to login to Pulumi Cloud
  process.env.PULUMI_BACKEND_URL = `file://${pulumiDir}`;
  process.env.PULUMI_CONFIG_PASSPHRASE = ""; // Empty passphrase for simplicity
}
