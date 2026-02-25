#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as clack from "@clack/prompts";
import args from "args";
import pc from "picocolors";
// Auth commands
import { login as authLogin } from "./commands/auth/login.js";
import { logout as authLogout } from "./commands/auth/logout.js";
import { authStatus as authStatusCmd } from "./commands/auth/status.js";
// AWS commands
import { doctor as awsDoctor } from "./commands/aws/doctor.js";
import { setup as awsSetup } from "./commands/aws/setup.js";
// CDN commands
import { cdnDestroy } from "./commands/cdn/destroy.js";
import { init as cdnInit } from "./commands/cdn/init.js";
import { cdnStatus } from "./commands/cdn/status.js";
import { cdnSync } from "./commands/cdn/sync.js";
import { cdnUpgrade } from "./commands/cdn/upgrade.js";
import { cdnVerify } from "./commands/cdn/verify.js";
import { check } from "./commands/email/check.js";
import { config } from "./commands/email/config.js";
import { connect } from "./commands/email/connect.js";
import { emailDestroy } from "./commands/email/destroy.js";
import {
  addDomain,
  getDkim,
  listDomains,
  removeDomain,
  verifyDomain,
} from "./commands/email/domains.js";
import {
  inboundDestroy,
  inboundInit,
  inboundStatus,
  inboundTest,
  inboundVerify,
} from "./commands/email/inbound.js";
import { init } from "./commands/email/init.js";
import { restore } from "./commands/email/restore.js";
import { emailStatus } from "./commands/email/status.js";
// Email commands
import { templatesInit } from "./commands/email/templates/init.js";
import { templatesPreview } from "./commands/email/templates/preview.js";
import { templatesPush } from "./commands/email/templates/push.js";
import { emailTest } from "./commands/email/test.js";
import { upgrade } from "./commands/email/upgrade.js";
// Automations commands (new canonical name; "workflows" is legacy alias)
import { automationsGenerate } from "./commands/email/automations/generate.js";
import { automationsInit } from "./commands/email/automations/init.js";
import { automationsPush } from "./commands/email/automations/push.js";
import { automationsValidate } from "./commands/email/automations/validate.js";
// Info commands
import { news } from "./commands/news.js";
import { permissions } from "./commands/permissions.js";
// Platform commands
import { connect as platformConnect } from "./commands/platform/connect.js";
import { platform as platformInfo } from "./commands/platform/index.js";
import { updateRole } from "./commands/platform/update-role.js";
// Shared commands
import { dashboard } from "./commands/shared/dashboard.js";
import { destroy } from "./commands/shared/destroy.js";
import { status } from "./commands/shared/status.js";
// SMS commands
import { smsDestroy } from "./commands/sms/destroy.js";
import { init as smsInit } from "./commands/sms/init.js";
import { smsRegister } from "./commands/sms/register.js";
import { smsStatus } from "./commands/sms/status.js";
import { smsSync } from "./commands/sms/sync.js";
import { smsTest } from "./commands/sms/test.js";
import { smsUpgrade } from "./commands/sms/upgrade.js";
import { smsVerifyNumber } from "./commands/sms/verify-number.js";
import { support } from "./commands/support.js";
// Telemetry commands
import {
  telemetryDisable,
  telemetryEnable,
  telemetryStatus,
} from "./commands/telemetry.js";
// Workflow commands
import { workflowInit } from "./commands/workflow/init.js";
import { getTelemetryClient } from "./telemetry/client.js";
import { trackCommand } from "./telemetry/events.js";
import {
  printCompletionScript,
  setupTabCompletion,
} from "./utils/shared/completion.js";
import { handleCLIError } from "./utils/shared/errors.js";
import { setJsonMode } from "./utils/shared/json-output.js";

// Check Node.js version (requires 20+)
const [nodeMajorVersion] = process.versions.node.split(".").map(Number);
if (nodeMajorVersion < 20) {
  console.error(
    "\x1b[31mError: Wraps CLI requires Node.js 20 or higher.\x1b[0m"
  );
  console.error(`Current version: ${process.versions.node}`);
  console.error("");
  console.error("To upgrade Node.js:");
  console.error("  macOS/Linux (nvm): nvm install 20 && nvm use 20");
  console.error("  macOS (Homebrew):  brew install node@20");
  console.error("  Windows:           Download from https://nodejs.org/");
  console.error("");
  process.exit(1);
}

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
    `  ${pc.cyan("sms")}         SMS infrastructure (AWS End User Messaging)`
  );
  console.log(
    `  ${pc.cyan("cdn")}         CDN infrastructure (AWS S3 + CloudFront)\n`
  );
  console.log("Email Commands:");
  console.log(
    `  ${pc.cyan("email init")}           Deploy new email infrastructure`
  );
  console.log(
    `  ${pc.cyan("email check")}          Check email deliverability for a domain`
  );
  console.log(
    `  ${pc.cyan("email connect")}        Connect to existing AWS SES`
  );
  console.log(
    `  ${pc.cyan("email status")}         Show email infrastructure details`
  );
  console.log(`  ${pc.cyan("email test")}           Send a test email`);
  console.log(`  ${pc.cyan("email verify")}         Verify domain DNS records`);
  console.log(
    `  ${pc.cyan("email sync")}           Apply CLI updates to infrastructure`
  );
  console.log(`  ${pc.cyan("email upgrade")}        Add features`);
  console.log(
    `  ${pc.cyan("email restore")}        Restore original configuration`
  );
  console.log(
    `  ${pc.cyan("email destroy")}        Remove email infrastructure`
  );
  console.log(`  ${pc.cyan("email domains add")}    Add a domain to SES`);
  console.log(`  ${pc.cyan("email domains list")}   List all domains`);
  console.log(`  ${pc.cyan("email domains remove")} Remove a domain`);
  console.log(
    `  ${pc.cyan("email inbound init")}   Enable inbound email receiving`
  );
  console.log(`  ${pc.cyan("email inbound status")} Show inbound email status`);
  console.log(
    `  ${pc.cyan("email inbound verify")} Verify inbound DNS records`
  );
  console.log(
    `  ${pc.cyan("email inbound test")}   Send test email and verify receipt`
  );
  console.log(
    `  ${pc.cyan("email inbound destroy")} Remove inbound email infrastructure\n`
  );
  console.log("Template Commands:");
  console.log(
    `  ${pc.cyan("email templates init")}  Initialize templates-as-code`
  );
  console.log(
    `  ${pc.cyan("email templates push")}  Push templates to SES + dashboard`
  );
  console.log(
    `  ${pc.cyan("email templates preview")} Preview templates in browser`
  );
  console.log(
    `  ${pc.cyan("push")}                  ${pc.dim("(alias for email templates push)")}\n`
  );
  console.log("Automation Commands:");
  console.log(
    `  ${pc.cyan("email automations init")}      Initialize automations-as-code`
  );
  console.log(
    `  ${pc.cyan("email automations validate")}  Validate automation files`
  );
  console.log(
    `  ${pc.cyan("email automations push")}      Push automations to dashboard`
  );
  console.log(
    `  ${pc.cyan("email automations generate")} Generate automation from template\n`
  );
  console.log("SMS Commands:");
  console.log(`  ${pc.cyan("sms init")}             Deploy SMS infrastructure`);
  console.log(
    `  ${pc.cyan("sms status")}           Show SMS infrastructure details`
  );
  console.log(`  ${pc.cyan("sms test")}             Send a test SMS message`);
  console.log(
    `  ${pc.cyan("sms verify-number")}    Verify a destination phone number`
  );
  console.log(
    `  ${pc.cyan("sms sync")}             Sync infrastructure (update Lambda, etc.)`
  );
  console.log(`  ${pc.cyan("sms upgrade")}          Upgrade SMS features`);
  console.log(`  ${pc.cyan("sms register")}         Register toll-free number`);
  console.log(
    `  ${pc.cyan("sms destroy")}          Remove SMS infrastructure\n`
  );
  console.log("CDN Commands:");
  console.log(
    `  ${pc.cyan("cdn init")}             Deploy CDN infrastructure (S3 + CloudFront)`
  );
  console.log(
    `  ${pc.cyan("cdn status")}           Show CDN infrastructure details`
  );
  console.log(
    `  ${pc.cyan("cdn verify")}           Check DNS and certificate status`
  );
  console.log(
    `  ${pc.cyan("cdn upgrade")}          Add custom domain after cert validation`
  );
  console.log(
    `  ${pc.cyan("cdn sync")}             Sync infrastructure with current config`
  );
  console.log(
    `  ${pc.cyan("cdn destroy")}          Remove CDN infrastructure\n`
  );
  console.log("Local Development:");
  console.log(
    `  ${pc.cyan("console")}               Start local web console\n`
  );
  console.log("Platform:");
  console.log(
    `  ${pc.cyan("platform")}              Show platform info and pricing`
  );
  console.log(
    `  ${pc.cyan("platform connect")}      Connect to Wraps Platform (events + IAM)`
  );
  console.log(
    `  ${pc.cyan("platform update-role")} Update platform IAM permissions\n`
  );
  console.log("Auth:");
  console.log(
    `  ${pc.cyan("auth login")}           Sign in to wraps.dev (device flow)`
  );
  console.log(`  ${pc.cyan("auth status")}          Show current auth state`);
  console.log(
    `  ${pc.cyan("auth logout")}          Sign out and remove stored token\n`
  );
  console.log("AWS Setup:");
  console.log(
    `  ${pc.cyan("aws setup")}            Interactive AWS setup wizard`
  );
  console.log(
    `  ${pc.cyan("aws doctor")}           Diagnose AWS configuration issues\n`
  );
  console.log("Global Commands:");
  console.log(`  ${pc.cyan("status")}       Show overview of all services`);
  console.log(`  ${pc.cyan("destroy")}      Remove deployed infrastructure`);
  console.log(`  ${pc.cyan("permissions")} Show required AWS IAM permissions`);
  console.log(`  ${pc.cyan("completion")}   Generate shell completion script`);
  console.log(
    `  ${pc.cyan("telemetry")}    Manage anonymous telemetry settings`
  );
  console.log(`  ${pc.cyan("news")}         Show recent Wraps updates`);
  console.log(
    `  ${pc.cyan("support")}      Get help and support contact info\n`
  );
  console.log("Options:");
  console.log(
    `  ${pc.dim("-p, --provider")}  Hosting provider (vercel, aws, railway, other)`
  );
  console.log(`  ${pc.dim("-r, --region")}    AWS region`);
  console.log(`  ${pc.dim("-d, --domain")}    Domain name`);
  console.log(`  ${pc.dim("--account")}        AWS account ID or alias`);
  console.log(`  ${pc.dim("--preset")}         Configuration preset`);
  console.log(`  ${pc.dim("--token")}          API key or token for auth`);
  console.log(`  ${pc.dim("-y, --yes")}        Skip confirmation prompts`);
  console.log(`  ${pc.dim("-f, --force")}      Force destructive operations`);
  console.log(
    `  ${pc.dim("--preview")}        Preview changes without deploying`
  );
  console.log(`  ${pc.dim("-v, --version")}    Show version number\n`);
  console.log(
    `Run ${pc.cyan("wraps <service> <command> --help")} for more information.\n`
  );
}

// Check for version before args parses
if (process.argv.includes("--version") || process.argv.includes("-v")) {
  showVersion();
}

// Check for help before args parses (to override args' built-in help)
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  showHelp();
  process.exit(0);
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
  {
    name: "preview",
    description: "Preview changes without deploying",
    defaultValue: false,
  },
  // SMS-specific options
  {
    name: "to",
    description: "Destination phone number (E.164 format)",
    defaultValue: undefined,
  },
  {
    name: "message",
    description: "SMS message content",
    defaultValue: undefined,
  },
  // SMS verify-number options
  {
    name: "phoneNumber",
    description: "Phone number to verify (E.164 format)",
    defaultValue: undefined,
  },
  {
    name: "code",
    description: "Verification code received via SMS",
    defaultValue: undefined,
  },
  {
    name: "list",
    description: "List all verified destination numbers",
    defaultValue: false,
  },
  {
    name: "delete",
    description: "Delete a verified destination number",
    defaultValue: false,
  },
  {
    name: "resend",
    description: "Resend verification code",
    defaultValue: false,
  },
  // Email test options
  {
    name: "scenario",
    description:
      "Test scenario (success, bounce, complaint, ooto, suppression_list)",
    defaultValue: undefined,
  },
  // Email verify options
  {
    name: ["w", "wait"],
    description: "Poll until DNS records are verified",
    defaultValue: false,
  },
  {
    name: "interval",
    description: "Polling interval in seconds (default: 30)",
    defaultValue: undefined,
  },
  // Email check options
  {
    name: ["q", "quick"],
    description: "Quick mode: fewer DKIM selectors, top blacklists only",
    defaultValue: false,
  },
  {
    name: ["j", "json"],
    description: "Output results as JSON",
    defaultValue: false,
  },
  {
    name: "token",
    description: "API key or token for authentication",
    defaultValue: undefined,
  },
  {
    name: "verbose",
    description: "Show all checks including passing",
    defaultValue: false,
  },
  {
    name: "dkimSelector",
    description: "Specific DKIM selector to check",
    defaultValue: undefined,
  },
  {
    name: "skipBlacklists",
    description: "Skip blacklist checks",
    defaultValue: false,
  },
  {
    name: "skipTls",
    description: "Skip MX TLS checks",
    defaultValue: false,
  },
  {
    name: "timeout",
    description: "DNS timeout in milliseconds",
    defaultValue: undefined,
  },
  // Permissions command options
  {
    name: "service",
    description: "Service type for permissions (email, sms, cdn)",
    defaultValue: undefined,
  },
  // Template-specific options
  {
    name: "template",
    description: "Specific template to push (by name)",
    defaultValue: undefined,
  },
  // Workflow-specific options
  {
    name: "workflow",
    description: "Specific workflow to push (by name)",
    defaultValue: undefined,
  },
  {
    name: "dryRun",
    description: "Preview changes without pushing",
    defaultValue: false,
  },
  {
    name: "draft",
    description: "Push workflow as draft without enabling it",
    defaultValue: false,
  },
  {
    name: "name",
    description: "Output file slug for generated workflow",
    defaultValue: undefined,
  },
  {
    name: "noExample",
    description: "Skip creating example template",
    defaultValue: false,
  },
  {
    name: "noClaude",
    description: "Skip scaffolding .claude/ context files",
    defaultValue: false,
  },
  {
    name: "org",
    description: "Organization slug",
    defaultValue: undefined,
  },
]);

// Get command and flags
const flags = args.parse(process.argv);
const [primaryCommand, subCommand] = args.sub;

// Enable JSON output mode globally when --json flag is passed
setJsonMode(flags.json);

// If no command provided, show interactive menu
if (!primaryCommand) {
  async function interactiveMenu() {
    const startTime = Date.now();
    const telemetry = getTelemetryClient();

    // Show first-run telemetry notification
    if (telemetry.shouldShowNotification()) {
      console.log();
      clack.log.info(pc.bold("Anonymous Telemetry"));
      console.log(
        `  Wraps collects ${pc.cyan("anonymous usage data")} to improve the CLI.`
      );
      console.log(
        `  We ${pc.bold("never")} collect: domains, AWS credentials, email content, or PII.`
      );
      console.log(
        `  We ${pc.bold("only")} collect: command names, success/failure, CLI version, OS.`
      );
      console.log();
      console.log(`  Opt-out anytime: ${pc.cyan("wraps telemetry disable")}`);
      console.log(`  Or set: ${pc.cyan("WRAPS_TELEMETRY_DISABLED=1")}`);
      console.log(`  Learn more: ${pc.cyan("https://wraps.dev/docs")}`);
      console.log();

      telemetry.markNotificationShown();
    }

    trackCommand("interactive:menu", { success: true, duration_ms: 0 });

    clack.intro(pc.bold(`WRAPS CLI v${VERSION}`));
    console.log("  Deploy AWS infrastructure to your account.\n");

    const action = await clack.select({
      message: "What would you like to do?",
      options: [
        {
          value: "email-init",
          label: "Deploy Email",
          hint: "AWS SES with tracking & analytics",
        },
        {
          value: "sms-init",
          label: "Deploy SMS",
          hint: "AWS End User Messaging",
        },
        {
          value: "cdn-init",
          label: "Deploy CDN",
          hint: "AWS S3 + CloudFront CDN",
        },
        {
          value: "status",
          label: "View Status",
          hint: "Check deployed infrastructure",
        },
        {
          value: "console",
          label: "Local Console",
          hint: "Start web dashboard locally",
        },
        {
          value: "platform",
          label: "Wraps Platform",
          hint: "Templates, broadcasts, automations",
        },
        {
          value: "news",
          label: "What's New",
          hint: "Recent updates & changelog",
        },
        {
          value: "support",
          label: "Get Help",
          hint: "Contact & documentation",
        },
        {
          value: "help",
          label: "All Commands",
          hint: "Show CLI reference",
        },
      ],
    });

    if (clack.isCancel(action)) {
      trackCommand("interactive:cancel", {
        success: true,
        duration_ms: Date.now() - startTime,
      });
      await telemetry.shutdown();
      clack.cancel("Operation cancelled.");
      process.exit(0);
    }

    trackCommand(`interactive:${action}`, {
      success: true,
      duration_ms: Date.now() - startTime,
    });

    try {
      switch (action) {
        case "email-init":
          await init({
            provider: flags.provider,
            region: flags.region,
            domain: flags.domain,
            preset: flags.preset,
            yes: flags.yes,
            preview: flags.preview,
          });
          break;
        case "sms-init":
          await smsInit({
            provider: flags.provider,
            region: flags.region,
            preset: flags.preset,
            yes: flags.yes,
          });
          break;
        case "cdn-init":
          await cdnInit({
            provider: flags.provider,
            region: flags.region,
            preset: flags.preset,
            yes: flags.yes,
            preview: flags.preview,
          });
          break;
        case "status":
          await status({ account: flags.account });
          break;
        case "console":
          await dashboard({ port: flags.port, noOpen: flags.noOpen });
          break;
        case "platform":
          await platformInfo();
          break;
        case "news":
          await news();
          break;
        case "support":
          await support();
          break;
        case "help":
          showHelp();
          break;
      }

      trackCommand(`interactive:${action}:completed`, {
        success: true,
        duration_ms: Date.now() - startTime,
      });
    } catch (error) {
      trackCommand(`interactive:${action}:completed`, {
        success: false,
        duration_ms: Date.now() - startTime,
      });
      throw error;
    } finally {
      await telemetry.shutdown();
    }
  }

  // Run interactive menu and exit when done
  interactiveMenu()
    .then(() => process.exit(0))
    .catch((err) => {
      handleCLIError(err);
      process.exit(1);
    });
}

// Route to appropriate command (only runs if primaryCommand exists)
async function run() {
  const startTime = Date.now();
  const telemetry = getTelemetryClient();

  // Show first-run telemetry notification
  if (telemetry.shouldShowNotification()) {
    console.log();
    clack.log.info(pc.bold("Anonymous Telemetry"));
    console.log(
      `  Wraps collects ${pc.cyan("anonymous usage data")} to improve the CLI.`
    );
    console.log(
      `  We ${pc.bold("never")} collect: domains, AWS credentials, email content, or PII.`
    );
    console.log(
      `  We ${pc.bold("only")} collect: command names, success/failure, CLI version, OS.`
    );
    console.log();
    console.log(`  Opt-out anytime: ${pc.cyan("wraps telemetry disable")}`);
    console.log(`  Or set: ${pc.cyan("WRAPS_TELEMETRY_DISABLED=1")}`);
    console.log(`  Learn more: ${pc.cyan("https://wraps.dev/docs")}`);
    console.log();

    telemetry.markNotificationShown();
  }

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
            preview: flags.preview,
            quick: flags.quick,
            json: flags.json,
          });
          break;

        case "test":
          await emailTest({
            region: flags.region,
            to: flags.to,
            scenario: flags.scenario,
            json: flags.json,
          });
          break;

        case "check":
          // Domain can be positional arg or --domain flag
          await check({
            domain: args.sub[2] || flags.domain,
            quick: flags.quick,
            json: flags.json,
            verbose: flags.verbose,
            dkimSelector: flags.dkimSelector,
            skipBlacklists: flags.skipBlacklists,
            skipTls: flags.skipTls,
            timeout: flags.timeout,
          });
          break;

        case "connect":
          await connect({
            provider: flags.provider,
            region: flags.region,
            yes: flags.yes,
            preview: flags.preview,
            json: flags.json,
          });
          break;

        case "config":
        case "sync":
          await config({
            region: flags.region,
            yes: flags.yes,
            preview: flags.preview,
            json: flags.json,
          });
          break;

        case "upgrade":
          await upgrade({
            region: flags.region,
            yes: flags.yes,
            preview: flags.preview,
            json: flags.json,
          });
          break;

        case "restore":
          await restore({
            region: flags.region,
            force: flags.force,
            preview: flags.preview,
            json: flags.json,
          });
          break;

        case "status":
          await emailStatus({
            account: flags.account,
            region: flags.region,
            json: flags.json,
          });
          break;

        case "verify": {
          if (!flags.domain) {
            clack.log.error("--domain flag is required");
            console.log(
              `\nUsage: ${pc.cyan("wraps email verify --domain yourapp.com")}\n`
            );
            throw new Error("Missing required flag: --domain");
          }
          await verifyDomain({
            domain: flags.domain,
            wait: flags.wait,
            interval: flags.interval
              ? Number.parseInt(flags.interval, 10)
              : undefined,
          });
          break;
        }

        case "inbound": {
          // Handle inbound subcommands
          const inboundSubCommand = args.sub[2];

          switch (inboundSubCommand) {
            case "init":
              await inboundInit({
                region: flags.region,
                subdomain: flags.domain, // reuse --domain flag for subdomain
                yes: flags.yes,
                preview: flags.preview,
                json: flags.json,
              });
              break;

            case "destroy":
              await inboundDestroy({
                region: flags.region,
                force: flags.force,
                json: flags.json,
              });
              break;

            case "status":
              await inboundStatus({
                region: flags.region,
                json: flags.json,
              });
              break;

            case "verify":
              await inboundVerify({
                region: flags.region,
                json: flags.json,
              });
              break;

            case "test":
              await inboundTest({
                region: flags.region,
                json: flags.json,
              });
              break;

            default:
              clack.log.error(
                `Unknown inbound command: ${inboundSubCommand || "(none)"}`
              );
              console.log(
                `\nAvailable commands: ${pc.cyan("init")}, ${pc.cyan("destroy")}, ${pc.cyan("status")}, ${pc.cyan("verify")}, ${pc.cyan("test")}\n`
              );
              throw new Error(
                `Unknown inbound command: ${inboundSubCommand || "(none)"}`
              );
          }
          break;
        }

        case "domains": {
          // Handle domains subcommands
          const domainsSubCommand = args.sub[2];

          switch (domainsSubCommand) {
            case "add": {
              await addDomain({
                domain: flags.domain,
                region: flags.region,
                yes: flags.yes,
              });
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
                throw new Error("Missing required flag: --domain");
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
                throw new Error("Missing required flag: --domain");
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
                throw new Error("Missing required flag: --domain");
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
              throw new Error(
                `Unknown domains command: ${domainsSubCommand || "(none)"}`
              );
          }
          break;
        }

        case "templates": {
          const templatesSubCommand = args.sub[2];

          switch (templatesSubCommand) {
            case "init":
              await templatesInit({
                org: flags.org,
                noExample: flags.noExample,
                noClaude: flags.noClaude,
                yes: flags.yes,
                force: flags.force,
                json: flags.json,
              });
              break;

            case "push":
              await templatesPush({
                template: flags.template,
                dryRun: flags.dryRun,
                force: flags.force,
                yes: flags.yes,
                json: flags.json,
                token: flags.token,
              });
              break;

            case "preview":
              await templatesPreview({
                port: flags.port,
                template: flags.template,
                noOpen: flags.noOpen,
              });
              break;

            default:
              clack.log.error(
                `Unknown templates command: ${templatesSubCommand || "(none)"}`
              );
              console.log(
                `\nAvailable commands: ${pc.cyan("init")}, ${pc.cyan("push")}, ${pc.cyan("preview")}\n`
              );
              throw new Error(
                `Unknown templates command: ${templatesSubCommand || "(none)"}`
              );
          }
          break;
        }

        case "automations":
        case "workflows": {
          const automationsSubCommand = args.sub[2];

          switch (automationsSubCommand) {
            case "init":
              await automationsInit({
                noExample: flags.noExample,
                noClaude: flags.noClaude,
                force: flags.force,
                yes: flags.yes,
                json: flags.json,
              });
              break;

            case "validate":
              await automationsValidate({
                workflow: flags.workflow,
                json: flags.json,
              });
              break;

            case "push":
              await automationsPush({
                workflow: flags.workflow,
                dryRun: flags.dryRun,
                draft: flags.draft,
                force: flags.force,
                yes: flags.yes,
                json: flags.json,
                token: flags.token,
              });
              break;

            case "generate":
              await automationsGenerate({
                template: flags.template,
                name: flags.name,
                force: flags.force,
                json: flags.json,
              });
              break;

            default:
              clack.log.error(
                `Unknown automations command: ${automationsSubCommand || "(none)"}`
              );
              console.log(
                `\nAvailable commands: ${pc.cyan("init")}, ${pc.cyan("validate")}, ${pc.cyan("push")}, ${pc.cyan("generate")}\n`
              );
              throw new Error(
                `Unknown automations command: ${automationsSubCommand || "(none)"}`
              );
          }
          break;
        }

        case "destroy":
          await emailDestroy({
            force: flags.force,
            region: flags.region,
            preview: flags.preview,
            json: flags.json,
          });
          break;

        default:
          clack.log.error(`Unknown email command: ${subCommand}`);
          console.log(
            `\nRun ${pc.cyan("wraps --help")} for available commands.\n`
          );
          throw new Error(`Unknown email command: ${subCommand}`);
      }
      // Track email commands (they return early, so track here)
      const emailDuration = Date.now() - startTime;
      const emailCommandName = `email:${subCommand}`;
      trackCommand(emailCommandName, {
        success: true,
        duration_ms: emailDuration,
        service: "email",
      });
      return;
    }

    // Handle SMS subcommands (e.g., wraps sms init)
    if (primaryCommand === "sms" && subCommand) {
      switch (subCommand) {
        case "init":
          await smsInit({
            provider: flags.provider,
            region: flags.region,
            preset: flags.preset,
            yes: flags.yes,
            json: flags.json,
          });
          break;

        case "status":
          await smsStatus({
            account: flags.account,
            json: flags.json,
          });
          break;

        case "test":
          await smsTest({
            to: flags.to,
            message: flags.message,
            json: flags.json,
          });
          break;

        case "upgrade":
          await smsUpgrade({
            region: flags.region,
            yes: flags.yes,
            json: flags.json,
          });
          break;

        case "sync":
          await smsSync({
            region: flags.region,
            yes: flags.yes,
          });
          break;

        case "destroy":
          await smsDestroy({
            force: flags.force,
            preview: flags.preview,
            region: flags.region,
            json: flags.json,
          });
          break;

        case "verify-number":
          await smsVerifyNumber({
            phoneNumber: flags.phoneNumber,
            code: flags.code,
            list: flags.list,
            delete: flags.delete,
            resend: flags.resend,
            json: flags.json,
          });
          break;

        case "register":
          await smsRegister({
            region: flags.region,
          });
          break;

        default:
          clack.log.error(`Unknown sms command: ${subCommand}`);
          console.log(
            `\nRun ${pc.cyan("wraps --help")} for available commands.\n`
          );
          throw new Error(`Unknown sms command: ${subCommand}`);
      }
      // Track SMS commands
      const smsDuration = Date.now() - startTime;
      const smsCommandName = `sms:${subCommand}`;
      trackCommand(smsCommandName, {
        success: true,
        duration_ms: smsDuration,
        service: "sms",
      });
      return;
    }

    // Handle CDN subcommands (e.g., wraps cdn init)
    if (primaryCommand === "cdn" && subCommand) {
      switch (subCommand) {
        case "init":
          await cdnInit({
            provider: flags.provider,
            region: flags.region,
            preset: flags.preset,
            domain: flags.domain,
            yes: flags.yes,
            preview: flags.preview,
            json: flags.json,
          });
          break;

        case "status":
          await cdnStatus({
            region: flags.region,
            json: flags.json,
          });
          break;

        case "verify":
          await cdnVerify({
            region: flags.region,
            json: flags.json,
          });
          break;

        case "upgrade":
          await cdnUpgrade({
            region: flags.region,
            yes: flags.yes,
            preview: flags.preview,
            json: flags.json,
          });
          break;

        case "sync":
          await cdnSync({
            region: flags.region,
          });
          break;

        case "destroy":
          await cdnDestroy({
            force: flags.force,
            region: flags.region,
            preview: flags.preview,
            json: flags.json,
          });
          break;

        default:
          clack.log.error(`Unknown cdn command: ${subCommand}`);
          console.log(
            `\nRun ${pc.cyan("wraps --help")} for available commands.\n`
          );
          throw new Error(`Unknown cdn command: ${subCommand}`);
      }
      // Track CDN commands
      const cdnDuration = Date.now() - startTime;
      const cdnCommandName = `cdn:${subCommand}`;
      trackCommand(cdnCommandName, {
        success: true,
        duration_ms: cdnDuration,
        service: "cdn",
      });
      return;
    }

    // Handle Workflow subcommands (e.g., wraps workflow init)
    if (primaryCommand === "workflow") {
      switch (subCommand) {
        case "init":
          await workflowInit({
            yes: flags.yes,
          });
          break;

        default:
          clack.log.error(
            `Unknown workflow command: ${subCommand || "(none)"}`
          );
          console.log(`\nAvailable commands: ${pc.cyan("init")}\n`);
          console.log(`Run ${pc.cyan("wraps --help")} for more information.\n`);
          throw new Error(
            `Unknown workflow command: ${subCommand || "(none)"}`
          );
      }
      // Track workflow commands
      const workflowDuration = Date.now() - startTime;
      const workflowCommandName = `workflow:${subCommand}`;
      trackCommand(workflowCommandName, {
        success: true,
        duration_ms: workflowDuration,
        service: "workflow",
      });
      return;
    }

    // Handle Platform subcommands
    if (primaryCommand === "platform") {
      if (!subCommand) {
        // Show platform info when no subcommand
        await platformInfo();
        const platformDuration = Date.now() - startTime;
        trackCommand("platform", {
          success: true,
          duration_ms: platformDuration,
        });
        return;
      }

      switch (subCommand) {
        case "connect":
          await platformConnect({
            region: flags.region,
            force: flags.force,
            yes: flags.yes,
            json: flags.json,
          });
          break;

        case "update-role":
          await updateRole({
            region: flags.region,
            force: flags.force,
            json: flags.json,
          });
          break;

        default:
          clack.log.error(`Unknown platform command: ${subCommand}`);
          console.log(
            `\nAvailable commands: ${pc.cyan("connect")}, ${pc.cyan("update-role")}\n`
          );
          console.log(
            `Run ${pc.cyan("wraps platform")} for more information.\n`
          );
          throw new Error(`Unknown platform command: ${subCommand}`);
      }
      // Track platform commands (they return early, so track here)
      const platformDuration = Date.now() - startTime;
      const platformCommandName = `platform:${subCommand}`;
      trackCommand(platformCommandName, {
        success: true,
        duration_ms: platformDuration,
      });
      return;
    }

    // Handle Auth subcommands (e.g., wraps auth login)
    if (primaryCommand === "auth") {
      switch (subCommand) {
        case "login":
          await authLogin({ token: flags.token, json: flags.json });
          break;

        case "status":
          await authStatusCmd({ json: flags.json });
          break;

        case "logout":
          await authLogout();
          break;

        default:
          clack.log.error(`Unknown auth command: ${subCommand || "(none)"}`);
          console.log(
            `\nAvailable commands: ${pc.cyan("login")}, ${pc.cyan("status")}, ${pc.cyan("logout")}\n`
          );
          throw new Error(`Unknown auth command: ${subCommand || "(none)"}`);
      }
      return;
    }

    // Handle AWS subcommands (e.g., wraps aws setup)
    if (primaryCommand === "aws" && subCommand) {
      switch (subCommand) {
        case "setup":
          await awsSetup({
            yes: flags.yes,
          });
          break;

        case "doctor":
          await awsDoctor();
          break;

        default:
          clack.log.error(`Unknown aws command: ${subCommand}`);
          console.log(
            `\nAvailable commands: ${pc.cyan("setup")}, ${pc.cyan("doctor")}\n`
          );
          console.log(`Run ${pc.cyan("wraps --help")} for more information.\n`);
          throw new Error(`Unknown aws command: ${subCommand}`);
      }
      // Track aws commands
      const awsDuration = Date.now() - startTime;
      const awsCommandName = `aws:${subCommand}`;
      trackCommand(awsCommandName, {
        success: true,
        duration_ms: awsDuration,
      });
      return;
    }

    // Handle global commands
    switch (primaryCommand) {
      // Convenience alias: wraps push → wraps email templates push
      case "push":
        await templatesPush({
          template: flags.template,
          dryRun: flags.dryRun,
          force: flags.force,
          yes: flags.yes,
          json: flags.json,
          token: flags.token,
        });
        break;

      // Global commands (work across all services)
      case "status":
        await status({
          account: flags.account,
          json: flags.json,
        });
        break;

      case "console":
        await dashboard({
          port: flags.port,
          noOpen: flags.noOpen,
        });
        break;

      case "destroy":
        await destroy({
          force: flags.force,
          preview: flags.preview,
          json: flags.json,
        });
        break;

      case "completion":
        printCompletionScript();
        break;

      case "news":
        await news();
        break;

      case "permissions":
        await permissions({
          json: flags.json,
          preset: flags.preset as
            | "starter"
            | "production"
            | "enterprise"
            | undefined,
          service: flags.service as "email" | "sms" | "cdn" | undefined,
        });
        break;

      case "support":
        await support();
        break;

      case "telemetry": {
        // Handle telemetry subcommands
        switch (subCommand) {
          case "enable":
            await telemetryEnable();
            break;

          case "disable":
            await telemetryDisable();
            break;

          case "status":
          case undefined:
            await telemetryStatus();
            break;

          default:
            clack.log.error(`Unknown telemetry command: ${subCommand}`);
            console.log(
              `\nAvailable commands: ${pc.cyan("enable")}, ${pc.cyan("disable")}, ${pc.cyan("status")}\n`
            );
            throw new Error(`Unknown telemetry command: ${subCommand}`);
        }
        break;
      }

      case "help":
        showHelp();
        break;

      // Show help for service without subcommand
      case "email":
      case "sms":
      case "cdn":
      case "aws":
      case "workflow":
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
        throw new Error(`Unknown command: ${primaryCommand}`);
    }
    // Track successful command execution
    const duration = Date.now() - startTime;
    const commandName = subCommand
      ? `${primaryCommand}:${subCommand}`
      : primaryCommand;

    trackCommand(commandName, {
      success: true,
      duration_ms: duration,
    });
  } catch (error) {
    // Track failed command execution
    const duration = Date.now() - startTime;
    const commandName = subCommand
      ? `${primaryCommand}:${subCommand}`
      : primaryCommand;

    trackCommand(commandName, {
      success: false,
      duration_ms: duration,
    });

    handleCLIError(error);
  } finally {
    // Ensure telemetry events are sent before exit
    await telemetry.shutdown();
  }
}

// Only run main command router if a command was provided
// (interactive menu handles its own flow when no command)
if (primaryCommand) {
  run();
}
