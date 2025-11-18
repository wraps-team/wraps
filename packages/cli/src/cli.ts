#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as clack from "@clack/prompts";
import args from "args";
import pc from "picocolors";
// Legacy imports for backwards compatibility
import { connect } from "./commands/connect.js";
import { init } from "./commands/init.js";
import { restore } from "./commands/restore.js";
// Shared commands
import { runConsole } from "./commands/shared/console.js";
import { destroy } from "./commands/shared/destroy.js";
import { status } from "./commands/shared/status.js";
import { update } from "./commands/update.js";
import { upgrade } from "./commands/upgrade.js";
import { verify } from "./commands/verify.js";
import {
  printCompletionScript,
  setupTabCompletion,
} from "./utils/shared/completion.js";
import { handleCLIError } from "./utils/shared/errors.js";

// Get package version
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(
  readFileSync(join(__dirname, "../package.json"), "utf-8")
);
const VERSION = packageJson.version;

// Setup tab completion
setupTabCompletion();

// Function to show version
function showVersion() {
  console.log(`wraps v${VERSION}`);
  process.exit(0);
}

// Function to show help
function showHelp() {
  clack.intro(pc.bold(`WRAPS CLI v${VERSION}`));
  console.log("Deploy AWS infrastructure to your account\n");
  console.log("Usage: wraps [service] <command> [options]\n");
  console.log("Services:");
  console.log(`  ${pc.cyan("email")}       Email infrastructure (AWS SES)`);
  console.log(
    `  ${pc.cyan("sms")}         SMS infrastructure (AWS End User Messaging) ${pc.dim("[coming soon]")}\n`
  );
  console.log("Email Commands:");
  console.log(
    `  ${pc.cyan("email init")}       Deploy new email infrastructure`
  );
  console.log(`  ${pc.cyan("email connect")}    Connect to existing AWS SES`);
  console.log(`  ${pc.cyan("email verify")}     Verify domain DNS records`);
  console.log(`  ${pc.cyan("email update")}     Update infrastructure`);
  console.log(`  ${pc.cyan("email upgrade")}    Add features`);
  console.log(
    `  ${pc.cyan("email restore")}    Restore original configuration\n`
  );
  console.log("Global Commands:");
  console.log(`  ${pc.cyan("status")}       Show all infrastructure status`);
  console.log(`  ${pc.cyan("console")}      Start local web dashboard`);
  console.log(`  ${pc.cyan("destroy")}      Remove deployed infrastructure`);
  console.log(
    `  ${pc.cyan("completion")}   Generate shell completion script\n`
  );
  console.log("Legacy Commands (deprecated):");
  console.log(`  ${pc.dim("init, connect, verify, update, upgrade, restore")}`);
  console.log(`  ${pc.dim("Use 'wraps email <command>' instead")}\n`);
  console.log("Options:");
  console.log(
    `  ${pc.dim("--provider")}  Hosting provider (vercel, aws, railway, other)`
  );
  console.log(`  ${pc.dim("--region")}    AWS region`);
  console.log(`  ${pc.dim("--domain")}    Domain to verify`);
  console.log(`  ${pc.dim("--account")}   AWS account ID or alias`);
  console.log(`  ${pc.dim("--version, -v")}  Show version number\n`);
  console.log(
    `Run ${pc.cyan("wraps <service> <command> --help")} for more information.\n`
  );
  process.exit(0);
}

// Check for version before args parses
if (process.argv.includes("--version") || process.argv.includes("-v")) {
  showVersion();
}

// Check for help before args parses (to override args' built-in help)
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  showHelp();
}

// Configure args
args.options([
  {
    name: "provider",
    description: "Hosting provider (vercel, aws, railway, other)",
    defaultValue: undefined,
  },
  {
    name: "region",
    description: "AWS region",
    defaultValue: undefined,
  },
  {
    name: "domain",
    description: "Domain to verify",
    defaultValue: undefined,
  },
  {
    name: "account",
    description: "AWS account ID or alias",
    defaultValue: undefined,
  },
  {
    name: "preset",
    description:
      "Configuration preset (starter, production, enterprise, custom)",
    defaultValue: undefined,
  },
  {
    name: "yes",
    description: "Skip confirmation prompts",
    defaultValue: false,
  },
  {
    name: "port",
    description: "Port for console server",
    defaultValue: undefined,
  },
  {
    name: "noOpen",
    description: "Don't open browser automatically",
    defaultValue: false,
  },
]);

// Get command and flags
const flags = args.parse(process.argv);
const [primaryCommand, subCommand] = args.sub;

// Show help if no command
if (!primaryCommand) {
  showHelp();
}

// Route to appropriate command
async function run() {
  try {
    // Handle service-specific subcommands (e.g., wraps email init)
    if (primaryCommand === "email" && subCommand) {
      switch (subCommand) {
        case "init":
          await init({
            provider: flags.provider,
            region: flags.region,
            domain: flags.domain,
            preset: flags.preset,
            yes: flags.yes,
          });
          break;

        case "connect":
          await connect({
            provider: flags.provider,
            region: flags.region,
            yes: flags.yes,
          });
          break;

        case "verify":
          if (!flags.domain) {
            clack.log.error("--domain flag is required");
            console.log(
              `\nUsage: ${pc.cyan("wraps email verify --domain yourapp.com")}\n`
            );
            process.exit(1);
          }
          await verify({
            domain: flags.domain,
          });
          break;

        case "update":
          await update({
            region: flags.region,
            yes: flags.yes,
          });
          break;

        case "upgrade":
          await upgrade({
            region: flags.region,
            yes: flags.yes,
          });
          break;

        case "restore":
          await restore({
            region: flags.region,
            yes: flags.yes,
          });
          break;

        default:
          clack.log.error(`Unknown email command: ${subCommand}`);
          console.log(
            `\nRun ${pc.cyan("wraps --help")} for available commands.\n`
          );
          process.exit(1);
      }
      return;
    }

    // Handle SMS subcommands (coming soon)
    if (primaryCommand === "sms" && subCommand) {
      clack.log.warn("SMS infrastructure is coming soon!");
      console.log(
        `\nCheck back soon or follow our progress at ${pc.cyan("https://github.com/wraps-team/wraps")}\n`
      );
      process.exit(0);
    }

    // Handle global commands and legacy commands (backwards compatibility)
    switch (primaryCommand) {
      // Global commands (work across all services)
      case "status":
        await status({
          account: flags.account,
        });
        break;

      case "console":
        await runConsole({
          port: flags.port,
          noOpen: flags.noOpen,
        });
        break;

      case "destroy":
        await destroy({
          yes: flags.yes,
        });
        break;

      case "completion":
        printCompletionScript();
        break;

      // Legacy commands (deprecated - redirect to email service)
      case "init":
        console.log(
          pc.yellow("⚠️  Deprecated: Use 'wraps email init' instead\n")
        );
        await init({
          provider: flags.provider,
          region: flags.region,
          domain: flags.domain,
          preset: flags.preset,
          yes: flags.yes,
        });
        break;

      case "connect":
        console.log(
          pc.yellow("⚠️  Deprecated: Use 'wraps email connect' instead\n")
        );
        await connect({
          provider: flags.provider,
          region: flags.region,
          yes: flags.yes,
        });
        break;

      case "verify":
        console.log(
          pc.yellow("⚠️  Deprecated: Use 'wraps email verify' instead\n")
        );
        if (!flags.domain) {
          clack.log.error("--domain flag is required");
          console.log(
            `\nUsage: ${pc.cyan("wraps email verify --domain yourapp.com")}\n`
          );
          process.exit(1);
        }
        await verify({
          domain: flags.domain,
        });
        break;

      case "update":
        console.log(
          pc.yellow("⚠️  Deprecated: Use 'wraps email update' instead\n")
        );
        await update({
          region: flags.region,
          yes: flags.yes,
        });
        break;

      case "upgrade":
        console.log(
          pc.yellow("⚠️  Deprecated: Use 'wraps email upgrade' instead\n")
        );
        await upgrade({
          region: flags.region,
          yes: flags.yes,
        });
        break;

      case "restore":
        console.log(
          pc.yellow("⚠️  Deprecated: Use 'wraps email restore' instead\n")
        );
        await restore({
          region: flags.region,
          yes: flags.yes,
        });
        break;

      // Show help for service without subcommand
      case "email":
      case "sms":
        console.log(
          `\nPlease specify a command for ${primaryCommand} service.\n`
        );
        showHelp();
        break;

      default:
        clack.log.error(`Unknown command: ${primaryCommand}`);
        console.log(
          `\nRun ${pc.cyan("wraps --help")} for available commands.\n`
        );
        process.exit(1);
    }
  } catch (error) {
    handleCLIError(error);
  }
}

run();
