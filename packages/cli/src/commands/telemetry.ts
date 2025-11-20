/**
 * Telemetry management commands
 * @module commands/telemetry
 */

import * as clack from "@clack/prompts";
import pc from "picocolors";
import { getTelemetryClient } from "../telemetry/client.js";

/**
 * Enable telemetry
 */
export async function telemetryEnable(): Promise<void> {
  const client = getTelemetryClient();

  client.enable();

  clack.log.success(pc.green("Telemetry enabled"));
  console.log(`   Config: ${pc.dim(client.getConfigPath())}`);
  console.log(`\n   ${pc.dim("Thank you for helping improve Wraps!")}\n`);
}

/**
 * Disable telemetry
 */
export async function telemetryDisable(): Promise<void> {
  const client = getTelemetryClient();

  client.disable();

  clack.log.success(pc.green("Telemetry disabled"));
  console.log(`   Config: ${pc.dim(client.getConfigPath())}`);
  console.log(
    `\n   ${pc.dim("You can re-enable with:")} wraps telemetry enable\n`
  );
}

/**
 * Show telemetry status
 */
export async function telemetryStatus(): Promise<void> {
  const client = getTelemetryClient();

  clack.intro(pc.bold("Telemetry Status"));

  const status = client.isEnabled() ? pc.green("Enabled") : pc.red("Disabled");

  console.log();
  console.log(`  ${pc.bold("Status:")} ${status}`);
  console.log(`  ${pc.bold("Config file:")} ${pc.dim(client.getConfigPath())}`);

  // Show opt-out methods
  if (client.isEnabled()) {
    console.log();
    console.log(pc.bold("  How to opt-out:"));
    console.log(`    ${pc.cyan("wraps telemetry disable")}`);
    console.log(
      `    ${pc.dim("Or set:")} ${pc.cyan("WRAPS_TELEMETRY_DISABLED=1")}`
    );
    console.log(`    ${pc.dim("Or set:")} ${pc.cyan("DO_NOT_TRACK=1")}`);
  } else {
    console.log();
    console.log(pc.bold("  How to opt-in:"));
    console.log(`    ${pc.cyan("wraps telemetry enable")}`);
  }

  // Show debug mode info
  console.log();
  console.log(pc.bold("  Debug mode:"));
  console.log(
    `    ${pc.dim("See what would be sent:")} ${pc.cyan("WRAPS_TELEMETRY_DEBUG=1 wraps <command>")}`
  );

  // Show docs link
  console.log();
  console.log(
    `  ${pc.dim("Learn more:")} ${pc.cyan("https://wraps.dev/docs/telemetry")}`
  );
  console.log();
}
