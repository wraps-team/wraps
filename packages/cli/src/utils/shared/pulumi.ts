import { exec } from "node:child_process";
import { promisify } from "node:util";
import * as automation from "@pulumi/pulumi/automation/index.js";
import { errors } from "./errors.js";

const execAsync = promisify(exec);

// Extract installPulumiCli from the automation module
const installPulumiCli = (automation as any).installPulumiCli;

/**
 * Check if Pulumi CLI is installed
 */
export async function checkPulumiInstalled(): Promise<boolean> {
  try {
    await execAsync("pulumi version");
    return true;
  } catch (_error) {
    return false;
  }
}

/**
 * Ensure Pulumi CLI is installed, auto-install if missing
 * @returns true if Pulumi was auto-installed, false if it was already installed
 */
export async function ensurePulumiInstalled(): Promise<boolean> {
  const isInstalled = await checkPulumiInstalled();

  if (!isInstalled) {
    try {
      // Try to auto-install Pulumi CLI using Automation API
      await installPulumiCli();
      return true; // Was auto-installed
    } catch (_error) {
      // If auto-install fails, throw helpful error
      throw errors.pulumiNotInstalled();
    }
  }

  return false; // Was already installed
}
