#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as clack from "@clack/prompts";
import args from "args";
import pc from "picocolors";
import { config } from "./commands/email/config.js";
// Email commands
import { connect } from "./commands/email/connect.js";
import {
  addDomain,
  getDkim,
  listDomains,
  removeDomain,
  verifyDomain,
} from "./commands/email/domains.js";
import { init } from "./commands/email/init.js";
import { restore } from "./commands/email/restore.js";
import { upgrade } from "./commands/email/upgrade.js";
// Shared commands
import { dashboard } from "./commands/shared/dashboard.js";
import { destroy } from "./commands/shared/destroy.js";
import { status } from "./commands/shared/status.js";
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
    `  ${pc.cyan("email init")}           Deploy new email infrastructure`
  );
  console.log(
    `  ${pc.cyan("email connect")}        Connect to existing AWS SES`
  );
  console.log(`  ${pc.cyan("email domains verify")} Verify domain DNS records`);
  console.log(`  ${pc.cyan("email config")}         Update infrastructure`);
  console.log(`  ${pc.cyan("email upgrade")}        Add features`);
  console.log(
    `  ${pc.cyan("email restore")}        Restore original configuration\n`
  );
  console.log("Global Commands:");
  console.log(`  ${pc.cyan("status")}       Show all infrastructure status`);
  console.log(`  ${pc.cyan("dashboard")}    Start local web dashboard`);
  console.log(`  ${pc.cyan("destroy")}      Remove deployed infrastructure`);
  console.log(
    `  ${pc.cyan("completion")}   Generate shell completion script\n`
  );
  console.log("Options:");
  console.log(
    `  ${pc.dim("-p, --provider")}  Hosting provider (vercel, aws, railway, other)`
  );
  console.log(`  ${pc.dim("-r, --region")}    AWS region`);
  console.log(`  ${pc.dim("-d, --domain")}    Domain name`);
  console.log(`  ${pc.dim("--account")}        AWS account ID or alias`);
  console.log(`  ${pc.dim("--preset")}         Configuration preset`);
  console.log(`  ${pc.dim("-y, --yes")}        Skip confirmation prompts`);
  console.log(`  ${pc.dim("-f, --force")}      Force destructive operations`);
  console.log(`  ${pc.dim("-v, --version")}    Show version number\n`);
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
    name: ["p", "provider"],
    description: "Hosting provider (vercel, aws, railway, other)",
    defaultValue: undefined,
  },
  {
    name: ["r", "region"],
    description: "AWS region",
    defaultValue: undefined,
  },
  {
    name: ["d", "domain"],
    description: "Domain name",
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
    name: ["y", "yes"],
    description: "Skip confirmation prompts (non-destructive operations)",
    defaultValue: false,
  },
  {
    name: ["f", "force"],
    description:
      "Force operation without confirmation (destructive operations)",
    defaultValue: false,
  },
  {
    name: "port",
    description: "Port for dashboard server",
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

// If no command provided, show interactive service selection
if (!primaryCommand) {
  async function selectService() {
    clack.intro(pc.bold(`WRAPS CLI v${VERSION}`));
    console.log("Welcome! Let's get started deploying your infrastructure.\n");

    const service = await clack.select({
      message: "Which service would you like to set up?",
      options: [
        {
          value: "email",
          label: "Email",
          hint: "AWS SES email infrastructure",
        },
        {
          value: "sms",
          label: "SMS",
          hint: "Coming soon - AWS End User Messaging",
        },
      ],
    });

    if (clack.isCancel(service)) {
      clack.cancel("Operation cancelled.");
      process.exit(0);
    }

    if (service === "sms") {
      clack.log.warn("SMS infrastructure is coming soon!");
      console.log(
        `\nCheck back soon or follow our progress at ${pc.cyan("https://github.com/wraps-team/wraps")}\n`
      );
      process.exit(0);
    }

    // For email service, ask if they want to init or connect
    const action = await clack.select({
      message: "What would you like to do?",
      options: [
        {
          value: "init",
          label: "Deploy new infrastructure",
          hint: "Create new AWS SES infrastructure",
        },
        {
          value: "connect",
          label: "Connect existing infrastructure",
          hint: "Connect to existing AWS SES setup",
        },
      ],
    });

    if (clack.isCancel(action)) {
      clack.cancel("Operation cancelled.");
      process.exit(0);
    }

    // Run the appropriate command
    if (action === "init") {
      await init({
        provider: flags.provider,
        region: flags.region,
        domain: flags.domain,
        preset: flags.preset,
        yes: flags.yes,
      });
    } else {
      await connect({
        provider: flags.provider,
        region: flags.region,
        yes: flags.yes,
      });
    }
  }

  selectService().catch(handleCLIError);
  // Early exit - don't run the main run() function
  process.exit(0);
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

        case "config":
          await config({
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
            force: flags.force,
          });
          break;

        case "domains": {
          // Handle domains subcommands
          const domainsSubCommand = args.sub[2];

          switch (domainsSubCommand) {
            case "add": {
              if (!flags.domain) {
                clack.log.error("--domain flag is required");
                console.log(
                  `\nUsage: ${pc.cyan("wraps email domains add --domain yourapp.com")}\n`
                );
                process.exit(1);
              }
              await addDomain({ domain: flags.domain });
              break;
            }

            case "list":
              await listDomains();
              break;

            case "verify": {
              if (!flags.domain) {
                clack.log.error("--domain flag is required");
                console.log(
                  `\nUsage: ${pc.cyan("wraps email domains verify --domain yourapp.com")}\n`
                );
                process.exit(1);
              }
              await verifyDomain({ domain: flags.domain });
              break;
            }

            case "get-dkim": {
              if (!flags.domain) {
                clack.log.error("--domain flag is required");
                console.log(
                  `\nUsage: ${pc.cyan("wraps email domains get-dkim --domain yourapp.com")}\n`
                );
                process.exit(1);
              }
              await getDkim({ domain: flags.domain });
              break;
            }

            case "remove": {
              if (!flags.domain) {
                clack.log.error("--domain flag is required");
                console.log(
                  `\nUsage: ${pc.cyan("wraps email domains remove --domain yourapp.com --force")}\n`
                );
                process.exit(1);
              }
              await removeDomain({
                domain: flags.domain,
                force: flags.force,
              });
              break;
            }

            default:
              clack.log.error(
                `Unknown domains command: ${domainsSubCommand || "(none)"}`
              );
              console.log(
                `\nAvailable commands: ${pc.cyan("add")}, ${pc.cyan("list")}, ${pc.cyan("verify")}, ${pc.cyan("get-dkim")}, ${pc.cyan("remove")}\n`
              );
              process.exit(1);
          }
          break;
        }

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

    // Handle global commands
    switch (primaryCommand) {
      // Global commands (work across all services)
      case "status":
        await status({
          account: flags.account,
        });
        break;

      case "dashboard":
        await dashboard({
          port: flags.port,
          noOpen: flags.noOpen,
        });
        break;

      case "destroy":
        await destroy({
          force: flags.force,
        });
        break;

      case "completion":
        printCompletionScript();
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
