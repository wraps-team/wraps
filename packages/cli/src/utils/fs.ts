import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Get the BYO configuration directory
 */
export function getBYODir(): string {
  return join(homedir(), ".byo");
}

/**
 * Get the Pulumi workspace directory
 */
export function getPulumiWorkDir(): string {
  return join(getBYODir(), "pulumi");
}

/**
 * Ensure the BYO configuration directory exists
 */
export async function ensureBYODir(): Promise<void> {
  const byoDir = getBYODir();
  if (!existsSync(byoDir)) {
    await mkdir(byoDir, { recursive: true });
  }
}

/**
 * Ensure the Pulumi workspace directory exists and configure local backend
 */
export async function ensurePulumiWorkDir(): Promise<void> {
  await ensureBYODir();
  const pulumiDir = getPulumiWorkDir();
  if (!existsSync(pulumiDir)) {
    await mkdir(pulumiDir, { recursive: true });
  }

  // Set Pulumi to use local backend (file-based state)
  // This avoids needing to login to Pulumi Cloud
  process.env.PULUMI_BACKEND_URL = `file://${pulumiDir}`;
  process.env.PULUMI_CONFIG_PASSPHRASE = ""; // Empty passphrase for simplicity
}
